import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleTransactionPaths } from "../src/bundle-transaction";
import { sha256 } from "../src/io";

const script = join(import.meta.dir, "../scripts/qa/render-gallery.ts");
const fixtures = join(import.meta.dir, "fixtures/kinds");
const denseFixture = join(fixtures, "dense/bundle.json");

type RunResult = { readonly code: number; readonly stdout: string; readonly stderr: string };
type Baseline = {
  readonly out: string;
  readonly png: string;
  readonly result: RunResult;
  readonly json: Buffer;
  readonly image: Buffer;
};

function run(out: string, fixtureRoot = fixtures): RunResult {
  const result = Bun.spawnSync(["bun", script, "--fixtures", fixtureRoot, "--out", out], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

async function runWithSelfSigterm(out: string, fixtureRoot = fixtures): Promise<RunResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("bun", [script, "--fixtures", fixtureRoot, "--out", out], {
      env: { ...process.env, VISUAL_NOTE_GALLERY_TX_INJECT: "sigterm-between-publishes" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code: code ?? (signal === "SIGTERM" ? 143 : 1), stdout, stderr });
    });
  });
}

const sharedRoot = mkdtempSync(join(tmpdir(), "visual-note-gallery-shared-"));
const transactionFixtures = join(sharedRoot, "transaction-fixtures");
const baselineOut = join(sharedRoot, "gallery.json");
let baseline: Baseline | undefined;

beforeAll(() => {
  for (const name of ["gallery", "dense"]) {
    const directory = join(transactionFixtures, name);
    mkdirSync(directory, { recursive: true });
    copyFileSync(denseFixture, join(directory, "bundle.json"));
    cpSync(join(fixtures, "dense/repo"), join(directory, "repo"), { recursive: true });
  }

  const result = run(baselineOut);
  if (result.code !== 0) {
    throw new TypeError(
      `gallery baseline failed with exit ${result.code}: ${result.stderr || result.stdout}`,
    );
  }
  const png = join(sharedRoot, "task-8-gallery.png");
  baseline = {
    out: baselineOut,
    png,
    result,
    json: readFileSync(baselineOut),
    image: readFileSync(png),
  };
});

afterAll(() => {
  rmSync(sharedRoot, { recursive: true, force: true });
});

function preparedBaseline(): Baseline {
  if (baseline === undefined) throw new TypeError("gallery baseline setup did not run");
  return baseline;
}

describe("task 8 gallery QA script", () => {
  test("reruns deterministically against the same output paths", () => {
    const first = preparedBaseline();
    const second = run(first.out);

    expect(first.result.code).toBe(0);
    expect(second.code).toBe(0);
    expect(sha256(readFileSync(first.out))).toBe(sha256(first.json));
    expect(sha256(readFileSync(first.png))).toBe(sha256(first.image));
    expect(JSON.parse(first.result.stdout)).toEqual(JSON.parse(second.stdout));
    expect(second.stderr).toBe("");
  });

  test("SIGTERM with an existing pair leaves recoverable transaction state and next same command republishes cleanly", async () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-note-gallery-sigterm-existing-"));
    const out = join(directory, "gallery.json");
    const png = join(directory, "task-8-gallery.png");
    writeFileSync(out, '{"before":true}\n');
    writeFileSync(png, "PNG-before");
    const paths = bundleTransactionPaths(out, png);

    const interrupted = await runWithSelfSigterm(out, transactionFixtures);
    expect(interrupted.code).not.toBe(0);
    expect(existsSync(paths.txRoot)).toBe(true);
    expect(existsSync(paths.journalPath)).toBe(true);
    expect(existsSync(paths.backupJson)).toBe(true);
    expect(existsSync(paths.backupPng)).toBe(true);

    const recovered = run(out, transactionFixtures);
    expect(recovered.code).toBe(0);
    expect(JSON.parse(recovered.stdout)).toEqual(expect.objectContaining({ status: "PASS" }));
    expect(existsSync(out)).toBe(true);
    expect(existsSync(png)).toBe(true);
    expect(existsSync(paths.txRoot)).toBe(false);
    expect(existsSync(paths.lockPath)).toBe(false);
    expect(existsSync(paths.journalPath)).toBe(false);
  });

  test("SIGTERM on a first run leaves only recoverable state and next same command removes partials before publish", async () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-note-gallery-sigterm-first-"));
    const out = join(directory, "gallery.json");
    const png = join(directory, "task-8-gallery.png");
    const paths = bundleTransactionPaths(out, png);

    const interrupted = await runWithSelfSigterm(out, transactionFixtures);
    expect(interrupted.code).not.toBe(0);
    expect(existsSync(paths.txRoot)).toBe(true);
    expect(existsSync(paths.journalPath)).toBe(true);
    expect(existsSync(paths.backupJson)).toBe(false);
    expect(existsSync(paths.backupPng)).toBe(false);

    const recovered = run(out, transactionFixtures);
    expect(recovered.code).toBe(0);
    expect(JSON.parse(recovered.stdout)).toEqual(expect.objectContaining({ status: "PASS" }));
    expect(existsSync(out)).toBe(true);
    expect(existsSync(png)).toBe(true);
    expect(existsSync(paths.txRoot)).toBe(false);
    expect(existsSync(paths.lockPath)).toBe(false);
    expect(existsSync(paths.journalPath)).toBe(false);
  });
});
