import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputError } from "../src/errors";
import { parseVisualNoteSpec, type VisualNoteSpec } from "../src/schema";
import { recordVerify } from "../src/verify-record";

type VerifyStep = {
  readonly semanticId: string;
  readonly how: string;
  readonly command?: string;
};

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(args: readonly string[]): string {
  const result = Bun.spawnSync([...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString());
  }
  return result.stdout.toString();
}

function repository(): { readonly root: string; readonly commit: string } {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-verify-record-")));
  roots.push(workspace);
  const root = join(workspace, "repo");
  mkdirSync(join(root, "src"), { recursive: true });
  run(["git", "init", "-q", root]);
  writeFileSync(join(root, "README.md"), "fixture | & ; < > $ ` ( ) *\nabcdefghijklmno\n");
  writeFileSync(join(root, "src/file"), "pattern\n");
  writeFileSync(join(root, "file"), "one\ntwo\nthree\nfour\nfive\nsix\n");
  run(["git", "-C", root, "add", "README.md", "src/file", "file"]);
  run([
    "git",
    "-C",
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  ]);
  return { root, commit: run(["git", "-C", root, "rev-parse", "HEAD"]).trim() };
}

function createOutsideFile(root: string): string {
  const outside = join(root, "..", "outside");
  mkdirSync(outside, { recursive: true });
  const file = join(outside, "secret.txt");
  writeFileSync(file, "outside secret\n");
  return file;
}

function spec(verify: readonly VerifyStep[]): VisualNoteSpec {
  return parseVisualNoteSpec({
    schemaVersion: 1,
    artifactId: "verify-record",
    kind: "code-exploration",
    revision: 1,
    title: "Verify recorder",
    source: { root: "/tmp/source", commit: null },
    learning: {
      question: "How is the recorder checked?",
      answer: "By running allowlisted commands without a shell.",
      verify,
    },
    nodes: [
      {
        semanticId: "recorder",
        label: "recordVerify",
        status: "fact",
        evidence: [{ path: "src/verify-record.ts" }],
      },
    ],
    edges: [],
  });
}

describe("allowlisted local verify recorder", () => {
  test("runs an allowlisted command in the repository and records its revision", async () => {
    const { root, commit } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "read HEAD", command: "git rev-parse HEAD" }]),
      root,
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      index: 0,
      semanticId: "recorder",
      how: "read HEAD",
      command: "git rev-parse HEAD",
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: `${commit}\n`,
      stderr: "",
      commit,
    });
    expect(Number.isNaN(Date.parse(records[0]?.ranAt ?? ""))).toBe(false);
  });

  test.each([
    ["shell syntax", "cat README.md | wc", "shell syntax"],
    ["unterminated quote", 'cat "README.md', "unparseable"],
    ["unlisted executable", "rm -rf probe", "not allowlisted"],
  ] as const)("rejects %s without spawning", async (_label, command, reason) => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject unsafe input", command }]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "not-run",
      reason,
      exitCode: null,
      stdout: "",
      stderr: "",
    });
  });

  test("records a missing command without running anything", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "inspect the source directly" }]),
      root,
    );

    expect(records[0]).toMatchObject({
      command: null,
      status: "not-run",
      reason: "no command",
      exitCode: null,
      stdout: "",
      stderr: "",
    });
  });

  test("passes quoted metacharacters literally instead of interpreting them as shell syntax", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "find the literal text",
          command: "grep -F '| & ; < > $ ` ( ) *' README.md",
        },
      ]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "fixture | & ; < > $ ` ( ) *\n",
      stderr: "",
    });
  });

  test.each([
    ["git configuration injection", "git -c alias.show=status show"],
    ["sed without print-only mode", "sed -e 1p README.md"],
    ["rg pattern file option", "rg --file=patterns.txt pattern src"],
    ["attached grep pattern", "grep -esecret ../outside/secret.txt"],
    ["recursive grep symlink traversal", "grep -R secret ."],
    ["rg symlink traversal", "rg --follow secret ."],
    ["wc input file list", "wc --files0-from=../outside/list"],
    ["ls symlink dereference", "ls -LR ."],
    ["git repository redirect", "git show --git-dir=outside HEAD"],
    ["git exclude file", "git ls-files --exclude-from=../outside/patterns"],
  ] as const)("rejects %s", async (_label, command) => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject unsafe options", command }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "not allowlisted" });
  });

  test("allows sed only in print-only mode", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "print one line", command: "sed -n '1p' README.md" }]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "fixture | & ; < > $ ` ( ) *\n",
    });
  });

  test("rejects cat of an absolute path outside the repository", async () => {
    const { root } = repository();
    const outside = createOutsideFile(root);

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject absolute path", command: `cat '${outside}'` }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects cat of a parent-relative path outside the repository", async () => {
    const { root } = repository();
    createOutsideFile(root);

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject parent path", command: "cat ../outside" }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects an in-repository symlink that points outside", async () => {
    const { root } = repository();
    symlinkSync(createOutsideFile(root), join(root, "outside-link"));

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject symlink escape", command: "cat outside-link" }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects parent traversal after an in-repository symlink", async () => {
    const { root } = repository();
    createOutsideFile(root);
    const outsideSubdirectory = join(root, "..", "outside", "subdirectory");
    mkdirSync(outsideSubdirectory);
    symlinkSync(outsideSubdirectory, join(root, "outside-directory-link"));

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "reject symlink and parent escape",
          command: "cat outside-directory-link/../secret.txt",
        },
      ]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects a tilde-prefixed cat operand", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject home path", command: "cat ~/x" }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects an rg path outside the repository after its pattern", async () => {
    const { root } = repository();
    createOutsideFile(root);

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "reject rg path escape",
          command: "rg secret ../outside",
        },
      ]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("allows git show with a revision and confined path", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "read a file at HEAD",
          command: "git show HEAD:src/file",
        },
      ]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "pattern\n",
    });
  });

  test("allows rg with a pattern and confined directory", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "search source", command: "rg pattern src/" }]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "src/file:pattern\n",
    });
  });

  test("allows sed print-only mode with its script and a confined file", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "print five lines", command: "sed -n '1,5p' file" }]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "one\ntwo\nthree\nfour\nfive\n",
    });
  });

  test.each([
    ["sed write command", "sed -n '1w side-effect' README.md"],
    ["git output option", "git diff --output=side-effect"],
  ] as const)("rejects the %s before it can create a file", async (_label, command) => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject write behavior", command }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "not allowlisted" });
    expect(existsSync(join(root, "side-effect"))).toBe(false);
  });

  test("kills a command at the injected timeout and awaits process exit", async () => {
    const { root } = repository();
    const followed = join(root, "followed.txt");
    writeFileSync(followed, "ready\n");

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "follow changes",
          command: "tail -f followed.txt",
        },
      ]),
      root,
      { timeoutMs: 300 },
    );
    const processes = run(["ps", "-axo", "command="]);

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: "timeout",
      exitCode: null,
      stdout: "ready\n",
      stderr: "",
    });
    expect(processes).not.toContain("tail -f followed.txt");
  });

  test("caps stdout and stderr independently with a truncation marker", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([
        { semanticId: "recorder", how: "read output", command: "cat README.md" },
        { semanticId: "recorder", how: "read an error", command: "cat missing-output-file" },
      ]),
      root,
      { outputLimitBytes: 8 },
    );

    expect(records[0]?.stdout).toBe("fixture …[truncated]");
    expect(records[0]?.stderr).toBe("");
    expect(records[1]?.stdout).toBe("");
    expect(records[1]?.stderr).toBe("cat: mis…[truncated]");
    expect(records[1]?.exitCode).not.toBe(0);
  });

  test("rejects missing, non-directory, and symlinked repository roots", async () => {
    const { root } = repository();
    const file = join(root, "not-a-directory");
    const link = join(root, "repo-link");
    writeFileSync(file, "");
    symlinkSync(root, link);
    const input = spec([]);

    await expect(recordVerify(input, join(root, "missing"))).rejects.toBeInstanceOf(InputError);
    await expect(recordVerify(input, file)).rejects.toBeInstanceOf(InputError);
    await expect(recordVerify(input, link)).rejects.toBeInstanceOf(InputError);
  });
});
