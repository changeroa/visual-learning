import { describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeCreateFile, safeMakeDirectories } from "../src/safe-path";

function fixture(): { readonly root: string; readonly outside: string } {
  return {
    root: realpathSync(mkdtempSync(join(tmpdir(), "visual-note-root-"))),
    outside: realpathSync(mkdtempSync(join(tmpdir(), "visual-note-outside-"))),
  };
}

describe("descriptor-relative safe mutation", () => {
  test("rejects path traversal with zero writes", () => {
    // Given
    const paths = fixture();
    const victim = join(paths.outside, "victim");
    // When
    const mutate = (): unknown => safeCreateFile(paths.root, "../outside/victim", "changed");
    // Then
    expect(mutate).toThrow();
    expect(Bun.file(victim).size).toBe(0);
  });

  test("rejects a symlink ancestor without touching its target", () => {
    // Given
    const paths = fixture();
    writeFileSync(join(paths.outside, "victim"), "original");
    symlinkSync(paths.outside, join(paths.root, "linked"));
    // When
    const mutate = (): unknown => safeCreateFile(paths.root, "linked/victim", "changed");
    // Then
    expect(mutate).toThrow();
    expect(readFileSync(join(paths.outside, "victim"), "utf8")).toBe("original");
  });

  test("rejects a dirty final collision without replacing it", () => {
    // Given
    const paths = fixture();
    writeFileSync(join(paths.root, "dirty"), "user");
    const inode = lstatSync(join(paths.root, "dirty")).ino;
    // When
    const mutate = (): unknown => safeCreateFile(paths.root, "dirty", "agent");
    // Then
    expect(mutate).toThrow();
    expect(readFileSync(join(paths.root, "dirty"), "utf8")).toBe("user");
    expect(lstatSync(join(paths.root, "dirty")).ino).toBe(inode);
  });

  test("creates nested directories and a file through retained descriptors", () => {
    // Given
    const paths = fixture();
    // When
    safeMakeDirectories(paths.root, "a/b");
    safeCreateFile(paths.root, "a/b/spec.json", "{}\n");
    // Then
    expect(readFileSync(join(paths.root, "a/b/spec.json"), "utf8")).toBe("{}\n");
  });

  test("a synchronized ancestor swap cannot redirect publication outside root", async () => {
    // Given
    const paths = fixture();
    mkdirSync(join(paths.root, "stable"));
    const helper = join(import.meta.dir, "../scripts/internal/safe-fs.py");
    const child = Bun.spawn(
      ["/usr/bin/python3", helper, "create", paths.root, "stable/note", "--hold-after-parent"],
      {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, VISUAL_NOTE_BYTES: "safe" },
      },
    );
    const reader = child.stdout.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("PARENT_READY");
    const original = join(paths.root, "stable-original");
    Bun.spawnSync(["mv", join(paths.root, "stable"), original]);
    symlinkSync(paths.outside, join(paths.root, "stable"));
    // When
    child.stdin.write("CONTINUE\n");
    child.stdin.end();
    const exitCode = await child.exited;
    // Then
    expect(exitCode).toBe(0);
    expect(readFileSync(join(original, "note"), "utf8")).toBe("safe");
    expect(Bun.file(join(paths.outside, "note")).size).toBe(0);
  });

  test("SIGTERM after fsync removes the stage and publishes no target", async () => {
    // Given
    const paths = fixture();
    const helper = join(import.meta.dir, "../scripts/internal/safe-fs.py");
    const child = Bun.spawn(
      ["/usr/bin/python3", helper, "create", paths.root, "interrupted", "--hold-after-stage"],
      {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, VISUAL_NOTE_BYTES: "staged" },
      },
    );
    const marker = await child.stdout.getReader().read();
    expect(new TextDecoder().decode(marker.value)).toContain("STAGE_READY");
    // When
    child.kill(15);
    const exitCode = await child.exited;
    // Then
    expect(exitCode).not.toBe(0);
    expect(Bun.file(join(paths.root, "interrupted")).size).toBe(0);
    expect(readdirSync(paths.root).filter((name) => name.startsWith(".visual-note-tmp-"))).toEqual(
      [],
    );
  });

  test("the next writer removes a dead SIGKILL stage before publication", async () => {
    // Given
    const paths = fixture();
    const helper = join(import.meta.dir, "../scripts/internal/safe-fs.py");
    const child = Bun.spawn(
      ["/usr/bin/python3", helper, "create", paths.root, "abandoned", "--hold-after-stage"],
      {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, VISUAL_NOTE_BYTES: "staged" },
      },
    );
    const marker = await child.stdout.getReader().read();
    expect(new TextDecoder().decode(marker.value)).toContain("STAGE_READY");
    child.kill(9);
    await child.exited;
    // When
    safeCreateFile(paths.root, "recovered", "complete");
    // Then
    expect(readFileSync(join(paths.root, "recovered"), "utf8")).toBe("complete");
    expect(Bun.file(join(paths.root, "abandoned")).size).toBe(0);
    expect(readdirSync(paths.root).filter((name) => name.startsWith(".visual-note-tmp-"))).toEqual(
      [],
    );
  });
});
