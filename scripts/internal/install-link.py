#!/usr/bin/env python3
import errno
import json
import os
import stat
import sys


def fail(message):
    print(f"install-link: {message}", file=sys.stderr)
    raise SystemExit(2)


def parts(path):
    if not isinstance(path, str) or not path.startswith("/") or path == "/":
        fail("path must be an absolute non-root path")
    if "\0" in path or "\\" in path or os.path.normpath(path) != path:
        fail("path must be normalized")
    result = path[1:].split("/")
    if any(part in ("", ".", "..") for part in result):
        fail("unsafe path component")
    return result


def open_directory(path):
    descriptor = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts(path):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def identity(descriptor):
    status = os.fstat(descriptor)
    return (status.st_dev, status.st_ino)


def fresh_identity(path):
    descriptor = open_directory(path)
    try:
        return identity(descriptor)
    finally:
        os.close(descriptor)


def verify_path(path, expected, label):
    if fresh_identity(path) != expected:
        fail(f"{label} pathname changed")


def resolved_target(parent_path, target):
    addressed = target if os.path.isabs(target) else os.path.join(parent_path, target)
    return os.path.normpath(addressed)


def inspect(parent, parent_path, name, canonical_path):
    try:
        status = os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return "missing", None
    if not stat.S_ISLNK(status.st_mode):
        fail("non-symlink collision")
    target = os.readlink(name, dir_fd=parent)
    if resolved_target(parent_path, target) != canonical_path:
        fail("wrong-target symlink collision")
    repeated = os.stat(name, dir_fd=parent, follow_symlinks=False)
    if (status.st_dev, status.st_ino) != (repeated.st_dev, repeated.st_ino):
        fail("final symlink changed during inspection")
    if os.readlink(name, dir_fd=parent) != target:
        fail("final symlink target changed during inspection")
    return "existing", (status.st_dev, status.st_ino)


def hold(marker):
    print(marker, flush=True)
    if sys.stdin.readline().strip() != "CONTINUE":
        fail("hold cancelled")


def remove_created(parent, name, created_identity):
    try:
        status = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if (status.st_dev, status.st_ino) == created_identity:
            os.unlink(name, dir_fd=parent)
            os.fsync(parent)
    except FileNotFoundError:
        pass


def install(canonical_path, destination, target, hold_mode):
    canonical = open_directory(canonical_path)
    parent_path, name = os.path.split(destination)
    parent = open_directory(parent_path)
    canonical_id = identity(canonical)
    parent_id = identity(parent)
    created_identity = None
    try:
        if resolved_target(parent_path, target) != canonical_path:
            fail("link target does not address canonical directory")
        if hold_mode == "parent":
            hold("PARENT_READY")
        state, _ = inspect(parent, parent_path, name, canonical_path)
        if state == "existing":
            verify_path(canonical_path, canonical_id, "canonical")
            verify_path(parent_path, parent_id, "parent")
            inspect(parent, parent_path, name, canonical_path)
            return "existing"
        if hold_mode == "check":
            hold("CHECK_READY")
        verify_path(canonical_path, canonical_id, "canonical")
        verify_path(parent_path, parent_id, "parent")
        try:
            os.symlink(target, name, dir_fd=parent)
        except FileExistsError:
            state, _ = inspect(parent, parent_path, name, canonical_path)
            if state == "existing":
                return "existing"
            raise
        status = os.stat(name, dir_fd=parent, follow_symlinks=False)
        created_identity = (status.st_dev, status.st_ino)
        os.fsync(parent)
        try:
            verify_path(canonical_path, canonical_id, "canonical")
            verify_path(parent_path, parent_id, "parent")
            state, final_id = inspect(parent, parent_path, name, canonical_path)
            if state != "existing" or final_id != created_identity:
                fail("created symlink changed before verification")
        except BaseException:
            remove_created(parent, name, created_identity)
            raise
        return "created"
    finally:
        os.close(parent)
        os.close(canonical)


def main():
    if len(sys.argv) not in (4, 5):
        fail("usage: install-link.py CANONICAL DESTINATION TARGET [--hold-after-parent|--hold-after-check]")
    canonical, destination, target = sys.argv[1:4]
    option = sys.argv[4] if len(sys.argv) == 5 else None
    if option not in (None, "--hold-after-parent", "--hold-after-check"):
        fail("unknown option")
    parts(canonical)
    parts(destination)
    status = install(
        canonical,
        destination,
        target,
        "parent" if option == "--hold-after-parent" else "check" if option else None,
    )
    print(json.dumps({"status": status, "destination": destination, "target": target}, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except OSError as error:
        if error.errno in (errno.ELOOP, errno.ENOTDIR, errno.ENOENT, errno.EEXIST):
            fail(f"unsafe, missing, or colliding path: {error.filename or ''}")
        raise
