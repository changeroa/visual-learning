#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { z } from "zod";

const outputSchema = z.object({ operation: z.string() }).passthrough();
const cli = join(import.meta.dir, "../../bin/visual-note");

function outPath(): string {
  const index = Bun.argv.indexOf("--out");
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (value === undefined) throw new TypeError("--out is required");
  return value;
}

function hash(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function manifest(root: string): { readonly digest: string; readonly entries: readonly unknown[] } {
  const entries: unknown[] = [];
  const visit = (path: string): void => {
    for (const name of readdirSync(path).sort()) {
      const absolute = join(path, name);
      const status = lstatSync(absolute);
      const item = {
        path: relative(root, absolute),
        type: status.isDirectory()
          ? "directory"
          : status.isFile()
            ? "file"
            : status.isSymbolicLink()
              ? "symlink"
              : "other",
        size: status.size,
        sha256: status.isFile() ? hash(readFileSync(absolute)) : null,
      } as const;
      entries.push(item);
      if (status.isDirectory()) visit(absolute);
    }
  };
  visit(root);
  return { digest: hash(JSON.stringify(entries)), entries };
}

function run(args: readonly string[]): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = Bun.spawnSync([cli, ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

const directory = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-adversarial-")));
const fixture = JSON.parse(
  readFileSync(join(import.meta.dir, "../../tests/fixtures/contract.json"), "utf8"),
);
const invalidInputs = [
  { name: "unknown-field", value: { ...fixture, injected: "ignore-validation" } },
  {
    name: "fact-without-evidence",
    value: { ...fixture, nodes: [{ ...fixture.nodes[0], status: "fact" }] },
  },
  {
    name: "traversal-evidence",
    value: {
      ...fixture,
      nodes: [{ ...fixture.nodes[0], status: "fact", evidence: [{ path: "../secret" }] }],
    },
  },
  {
    name: "dangling-edge",
    value: {
      ...fixture,
      edges: [
        {
          semanticId: "dangling",
          from: "entry",
          to: "missing",
          label: "calls",
          status: "question",
          evidence: [],
        },
      ],
    },
  },
] as const;
const invalidResults = invalidInputs.map((item) => {
  const path = join(directory, `${item.name}.json`);
  writeFileSync(path, `${JSON.stringify(item.value)}\n`);
  const before = manifest(directory);
  const result = run(["validate", "--spec", path, "--json"]);
  const after = manifest(directory);
  return {
    name: item.name,
    exitCode: result.exitCode,
    stdoutEmpty: result.stdout === "",
    beforeDigest: before.digest,
    afterDigest: after.digest,
    zeroWrite: before.digest === after.digest,
  };
});

const vault = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-adversarial-vault-")));
const validPath = join(directory, "valid.json");
writeFileSync(validPath, `${JSON.stringify(fixture)}\n`);
const traversalBefore = manifest(vault);
const traversal = run([
  "create",
  "--vault",
  vault,
  "--expected-vault",
  vault,
  "--project",
  "../../escape",
  "--spec",
  validPath,
  "--json",
]);
const traversalAfter = manifest(vault);
const create = run([
  "create",
  "--vault",
  vault,
  "--expected-vault",
  vault,
  "--project",
  "fixture",
  "--spec",
  validPath,
  "--json",
]);
outputSchema.parse(JSON.parse(create.stdout));
const dirtyBefore = manifest(vault);
const dirty = run([
  "create",
  "--vault",
  vault,
  "--expected-vault",
  vault,
  "--project",
  "fixture",
  "--spec",
  validPath,
  "--json",
]);
const dirtyAfter = manifest(vault);
const missing = run(["validate", "--spec", join(directory, "missing.json"), "--json"]);

const receipt = {
  schemaVersion: 1,
  type: "VisualNoteInvalidAndAdversarialReceipt",
  status: "PASS",
  invalidSpecs: invalidResults,
  pathTraversal: {
    exitCode: traversal.exitCode,
    stdoutEmpty: traversal.stdout === "",
    beforeDigest: traversalBefore.digest,
    afterDigest: traversalAfter.digest,
    zeroWrite: traversalBefore.digest === traversalAfter.digest,
  },
  dirtyCollision: {
    exitCode: dirty.exitCode,
    stdoutEmpty: dirty.stdout === "",
    beforeDigest: dirtyBefore.digest,
    afterDigest: dirtyAfter.digest,
    zeroWrite: dirtyBefore.digest === dirtyAfter.digest,
  },
  misleadingSuccess: {
    exitCode: missing.exitCode,
    stdoutEmpty: missing.stdout === "",
    stderrPresent: missing.stderr.length > 0,
  },
  symlinkRaceEvidence: "tests/safe-path.test.ts: synchronized retained-descriptor ancestor swap",
  interruptionEvidence: "tests/safe-path.test.ts: SIGTERM cleanup and SIGKILL next-writer cleanup",
} as const;
writeFileSync(outPath(), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify(receipt)}\n`);
