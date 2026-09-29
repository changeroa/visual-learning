import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-verify-record-")));
  roots.push(root);
  run(["git", "init", "-q", root]);
  writeFileSync(join(root, "README.md"), "fixture | & ; < > $ ` ( ) *\nabcdefghijklmno\n");
  run(["git", "-C", root, "add", "README.md"]);
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
          command: `tail -f '${followed}'`,
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
    expect(processes).not.toContain(`tail -f ${followed}`);
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

    expect(recordVerify(input, join(root, "missing"))).rejects.toBeInstanceOf(InputError);
    expect(recordVerify(input, file)).rejects.toBeInstanceOf(InputError);
    expect(recordVerify(input, link)).rejects.toBeInstanceOf(InputError);
  });
});
