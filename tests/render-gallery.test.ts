import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleTransactionPaths } from "../src/bundle-transaction";
import { sha256 } from "../src/io";

const script = join(import.meta.dir, "../scripts/qa/render-gallery.ts");
const fixtures = join(import.meta.dir, "fixtures/kinds");

type RunResult = { readonly code: number; readonly stdout: string; readonly stderr: string };

function run(out: string): RunResult {
  const result = Bun.spawnSync(["bun", script, "--fixtures", fixtures, "--out", out], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

async function runWithSelfSigterm(out: string): Promise<RunResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("bun", [script, "--fixtures", fixtures, "--out", out], {
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

describe("task 8 gallery QA script", () => {
  test("reruns deterministically against the same output paths", () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-note-gallery-"));
    const out = join(directory, "gallery.json");
    const png = join(directory, "task-8-gallery.png");

    const first = run(out);
    const firstJson = readFileSync(out);
    const firstPng = readFileSync(png);
    const second = run(out);

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(sha256(readFileSync(out))).toBe(sha256(firstJson));
    expect(sha256(readFileSync(png))).toBe(sha256(firstPng));
    expect(JSON.parse(first.stdout)).toEqual(JSON.parse(second.stdout));
    expect(second.stderr).toBe("");
  });

  test("SIGTERM with an existing pair leaves recoverable transaction state and next same command republishes cleanly", async () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-note-gallery-sigterm-existing-"));
    const out = join(directory, "gallery.json");
    const png = join(directory, "task-8-gallery.png");
    writeFileSync(out, '{"before":true}\n');
    writeFileSync(png, "PNG-before");
    const paths = bundleTransactionPaths(out, png);

    const interrupted = await runWithSelfSigterm(out);
    expect(interrupted.code).not.toBe(0);
    expect(existsSync(paths.txRoot)).toBe(true);
    expect(existsSync(paths.journalPath)).toBe(true);
    expect(existsSync(paths.backupJson)).toBe(true);
    expect(existsSync(paths.backupPng)).toBe(true);

    const recovered = run(out);
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

    const interrupted = await runWithSelfSigterm(out);
    expect(interrupted.code).not.toBe(0);
    expect(existsSync(paths.txRoot)).toBe(true);
    expect(existsSync(paths.journalPath)).toBe(true);
    expect(existsSync(paths.backupJson)).toBe(false);
    expect(existsSync(paths.backupPng)).toBe(false);

    const recovered = run(out);
    expect(recovered.code).toBe(0);
    expect(JSON.parse(recovered.stdout)).toEqual(expect.objectContaining({ status: "PASS" }));
    expect(existsSync(out)).toBe(true);
    expect(existsSync(png)).toBe(true);
    expect(existsSync(paths.txRoot)).toBe(false);
    expect(existsSync(paths.lockPath)).toBe(false);
    expect(existsSync(paths.journalPath)).toBe(false);
  });
});
