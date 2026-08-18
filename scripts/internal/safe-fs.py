#!/usr/bin/env python3
import errno
import os
import signal
import stat
import sys
import uuid

PREFIX = ".visual-note-tmp-"


def fail(message):
    print(f"safe-fs: {message}", file=sys.stderr)
    raise SystemExit(2)


def safe_parts(path, absolute=False):
    if not isinstance(path, str) or "\0" in path or "\\" in path:
        fail("invalid path")
    if absolute:
        if not path.startswith("/") or path == "/" or os.path.normpath(path) != path:
            fail("root must be a normalized absolute non-root path")
        parts = path[1:].split("/")
    else:
        if path.startswith("/") or os.path.normpath(path) != path:
            fail("relative path must be normalized")
        parts = path.split("/")
    if not parts or any(part in ("", ".", "..") for part in parts):
        fail("unsafe path component")
    return parts


def open_root(path):
    descriptor = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in safe_parts(path, True):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def open_parent(root, relative):
    parts = safe_parts(relative)
    descriptor = os.dup(root)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor, parts[-1]
    except BaseException:
        os.close(descriptor)
        raise


def process_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def cleanup_stale(descriptor):
    for name in os.listdir(descriptor):
        if not name.startswith(PREFIX):
            continue
        fields = name[len(PREFIX):].split("-", 1)
        if not fields[0].isdigit() or process_alive(int(fields[0])):
            continue
        status = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
        if stat.S_ISREG(status.st_mode) and status.st_uid == os.getuid():
            os.unlink(name, dir_fd=descriptor)


def mkdirs(root, relative):
    parts = safe_parts(relative)
    descriptor = os.dup(root)
    try:
        for part in parts:
            try:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            except FileNotFoundError:
                break
            os.close(descriptor)
            descriptor = child
    finally:
        os.close(descriptor)
    descriptor = os.dup(root)
    try:
        for part in parts:
            try:
                os.mkdir(part, 0o755, dir_fd=descriptor)
            except FileExistsError:
                pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def input_bytes():
    if "VISUAL_NOTE_BYTES" in os.environ:
        return os.environ["VISUAL_NOTE_BYTES"].encode("utf-8")
    return sys.stdin.buffer.read()


def create(root, relative, hold):
    parent, name = open_parent(root, relative)
    temporary = f"{PREFIX}{os.getpid()}-{uuid.uuid4().hex}"
    cleanup_stale(parent)
    try:
        if hold == "parent":
            print("PARENT_READY", flush=True)
            if sys.stdin.readline().strip() != "CONTINUE":
                fail("hold cancelled")
            data = os.environ.get("VISUAL_NOTE_BYTES", "").encode("utf-8")
        else:
            data = input_bytes()
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        try:
            offset = 0
            while offset < len(data):
                offset += os.write(descriptor, data[offset:])
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        if hold == "stage":
            print("STAGE_READY", flush=True)
            signal.pause()
        try:
            os.link(temporary, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
        except FileExistsError:
            fail(f"target collision: {relative}")
        os.unlink(temporary, dir_fd=parent)
        os.fsync(parent)
    finally:
        try:
            os.unlink(temporary, dir_fd=parent)
        except FileNotFoundError:
            pass
        os.close(parent)


def interrupted(_signal, _frame):
    raise InterruptedError("interrupted")


def main():
    if len(sys.argv) not in (4, 5):
        fail("usage: safe-fs.py mkdirs|create ROOT RELATIVE [--hold-after-parent|--hold-after-stage]")
    command, root_path, relative = sys.argv[1:4]
    option = sys.argv[4] if len(sys.argv) == 5 else None
    if option not in (None, "--hold-after-parent", "--hold-after-stage"):
        fail("unknown option")
    hold = "parent" if option == "--hold-after-parent" else "stage" if option == "--hold-after-stage" else None
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    root = open_root(root_path)
    try:
        if command == "mkdirs" and hold is None:
            mkdirs(root, relative)
        elif command == "create":
            create(root, relative, hold)
        else:
            fail("unknown command or option")
    except OSError as error:
        if error.errno in (errno.ELOOP, errno.ENOTDIR, errno.ENOENT, errno.EEXIST):
            fail(f"unsafe or missing path: {relative}")
        raise
    finally:
        os.close(root)


if __name__ == "__main__":
    main()
