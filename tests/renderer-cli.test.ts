import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup } from "../scripts/qa/renderer-live-support";

const cli = join(import.meta.dir, "../bin/visual-note");
const canonicalPluginData =
  "/Users/billionjaepyo/Documents/Obsidian Vault/.obsidian/plugins/obsidian-excalidraw-plugin/data.json";

function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("isolated cleanup rejects an unowned process without drifting canonical settings", async () => {
  // Given
  const before = hash(canonicalPluginData);
  const home = mkdtempSync(join(tmpdir(), "visual-note-cleanup-home-"));
  const child = Bun.spawn(
    ["/usr/bin/python3", "-c", "import signal,sys; print('READY',flush=True); signal.pause()"],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const marker = await child.stdout.getReader().read();
  expect(new TextDecoder().decode(marker.value)).toContain("READY");
  // When
  let rejected = false;
  try {
    await cleanup({
      process: child,
      executable: "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
      profile: join(home, "profile"),
      profileHome: home,
    });
  } catch {
    rejected = true;
  }
  // Then
  expect(rejected).toBe(true);
  expect(hash(canonicalPluginData)).toBe(before);
  const cleanupSource = readFileSync(
    join(import.meta.dir, "../scripts/qa/renderer-live-support.ts"),
    "utf8",
  );
  expect(cleanupSource).not.toContain("osascript");
  expect(cleanupSource).not.toContain("tell application id");
  child.kill(15);
  await child.exited;
});

test("injected plugin API failure exits 4 before any artifact output", () => {
  // Given
  const vault = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-renderer-failure-")));
  const before = readdirSync(vault);
  // When
  const result = Bun.spawnSync(
    [
      cli,
      "create",
      "--vault",
      vault,
      "--expected-vault",
      vault,
      "--verified-vault-id",
      "renderer-fixture",
      "--project",
      "task-5-failure",
      "--spec",
      join(import.meta.dir, "fixtures/architecture.json"),
      "--assert-no-write",
      "--json",
    ],
    { env: { ...process.env, VISUAL_NOTE_INJECT: "plugin-api-error" } },
  );
  // Then
  expect(result.exitCode).toBe(4);
  expect(result.stdout.toString()).toBe("");
  expect(readdirSync(vault)).toEqual(before);
});
