import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bundleTransactionPaths, publishBundleAtomically } from "../src/bundle-transaction";
import { ConflictError, RuntimeError } from "../src/errors";
import { sha256 } from "../src/io";

type Fixture = {
  readonly root: string;
  readonly out: string;
  readonly png: string;
  readonly tempRoot: string;
  readonly stagedJson: string;
  readonly stagedPng: string;
};

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "visual-note-bundle-"));
  const tempRoot = mkdtempSync(join(root, "stage-"));
  const stagedJson = join(tempRoot, "gallery.json");
  const stagedPng = join(tempRoot, "task-8-gallery.png");
  return {
    root,
    out: join(root, "gallery.json"),
    png: join(root, "task-8-gallery.png"),
    tempRoot,
    stagedJson,
    stagedPng,
  };
}

function stage(paths: Fixture, json = '{"ok":true}\n', png = "PNG-new"): void {
  writeFileSync(paths.stagedJson, json);
  writeFileSync(paths.stagedPng, png);
}

function seed(
  paths: Fixture,
  json = '{"before":true}\n',
  png = "PNG-before",
): {
  readonly json: Buffer<ArrayBufferLike>;
  readonly png: Buffer<ArrayBufferLike>;
} {
  writeFileSync(paths.out, json);
  writeFileSync(paths.png, png);
  return { json: readFileSync(paths.out), png: readFileSync(paths.png) };
}

describe("bundle transaction", () => {
  test("restores the exact prior pair on failure before first publish", () => {
    const paths = fixture();
    const before = seed(paths);
    stage(paths, '{"after":1}\n', "PNG-after");

    const run = (): void =>
      publishBundleAtomically(
        {
          jsonTarget: paths.out,
          pngTarget: paths.png,
          stagedJson: paths.stagedJson,
          stagedPng: paths.stagedPng,
          tempRoot: paths.tempRoot,
        },
        { failAt: "before-first-publish" },
      );

    expect(run).toThrow(RuntimeError);
    expect(sha256(readFileSync(paths.out))).toBe(sha256(before.json));
    expect(sha256(readFileSync(paths.png))).toBe(sha256(before.png));
  });

  test("restores the exact prior pair on failure between PNG and JSON publishes", () => {
    const paths = fixture();
    const before = seed(paths);
    stage(paths, '{"after":2}\n', "PNG-after-2");

    const run = (): void =>
      publishBundleAtomically(
        {
          jsonTarget: paths.out,
          pngTarget: paths.png,
          stagedJson: paths.stagedJson,
          stagedPng: paths.stagedPng,
          tempRoot: paths.tempRoot,
        },
        { failAt: "between-publishes" },
      );

    expect(run).toThrow(RuntimeError);
    expect(sha256(readFileSync(paths.out))).toBe(sha256(before.json));
    expect(sha256(readFileSync(paths.png))).toBe(sha256(before.png));
  });

  test("restores the exact prior pair on parent fsync failure after PNG publish", () => {
    const paths = fixture();
    const before = seed(paths);
    stage(paths, '{"after":3}\n', "PNG-after-3");

    const run = (): void =>
      publishBundleAtomically(
        {
          jsonTarget: paths.out,
          pngTarget: paths.png,
          stagedJson: paths.stagedJson,
          stagedPng: paths.stagedPng,
          tempRoot: paths.tempRoot,
        },
        { failAt: "parent-fsync-after-png-publish" },
      );

    expect(run).toThrow(RuntimeError);
    expect(sha256(readFileSync(paths.out))).toBe(sha256(before.json));
    expect(sha256(readFileSync(paths.png))).toBe(sha256(before.png));
  });

  test("recovers an interrupted publication and cleans journal backups and temp staging", () => {
    const first = fixture();
    seed(first);
    stage(first, '{"after":4}\n', "PNG-after-4");
    const { journalPath, lockPath, txRoot } = bundleTransactionPaths(first.out, first.png);

    const interrupted = (): void =>
      publishBundleAtomically(
        {
          jsonTarget: first.out,
          pngTarget: first.png,
          stagedJson: first.stagedJson,
          stagedPng: first.stagedPng,
          tempRoot: first.tempRoot,
        },
        { interruptAt: "between-publishes" },
      );

    expect(interrupted).toThrow("injected interrupt");
    expect(existsSync(journalPath)).toBe(true);
    expect(existsSync(lockPath)).toBe(false);

    const second = fixture();
    stage(second, '{"after":5}\n', "PNG-after-5");
    publishBundleAtomically({
      jsonTarget: first.out,
      pngTarget: first.png,
      stagedJson: second.stagedJson,
      stagedPng: second.stagedPng,
      tempRoot: second.tempRoot,
    });

    expect(readFileSync(first.out, "utf8")).toBe('{"after":5}\n');
    expect(readFileSync(first.png, "utf8")).toBe("PNG-after-5");
    expect(existsSync(journalPath)).toBe(false);
    expect(existsSync(txRoot)).toBe(false);
    expect(existsSync(first.tempRoot)).toBe(true);
    expect(existsSync(second.tempRoot)).toBe(true);
  });

  test("leaves no partial outputs on a first-time failure", () => {
    const paths = fixture();
    stage(paths, '{"after":6}\n', "PNG-after-6");

    const run = (): void =>
      publishBundleAtomically(
        {
          jsonTarget: paths.out,
          pngTarget: paths.png,
          stagedJson: paths.stagedJson,
          stagedPng: paths.stagedPng,
          tempRoot: paths.tempRoot,
        },
        { failAt: "between-publishes" },
      );

    expect(run).toThrow(RuntimeError);
    expect(existsSync(paths.out)).toBe(false);
    expect(existsSync(paths.png)).toBe(false);
  });

  test("rejects a live lock as a concurrent publisher", () => {
    const paths = fixture();
    stage(paths);
    const { lockPath } = bundleTransactionPaths(paths.out, paths.png);
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, `${process.pid}\n`);

    const run = (): void =>
      publishBundleAtomically({
        jsonTarget: paths.out,
        pngTarget: paths.png,
        stagedJson: paths.stagedJson,
        stagedPng: paths.stagedPng,
        tempRoot: paths.tempRoot,
      });

    expect(run).toThrow(ConflictError);
    unlinkSync(lockPath);
    rmSync(paths.root, { recursive: true, force: true });
  });
});
