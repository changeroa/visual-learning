#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOptions, required } from "../../src/arguments";
import { RuntimeError } from "../../src/errors";
import { ensureMatchingVault } from "../../src/path-guard";
import { parseVisualNoteSpec } from "../../src/schema";
import { runFailureMatrix } from "./desktop-failures";
import { finalizeEvidence } from "./desktop-finalize";
import { type JourneyContext, log, runJourney } from "./desktop-journey";
import {
  assertPluginReady,
  assertVaultIdentity,
  dismissWelcomeOnce,
  fileState,
  launch,
  PLUGIN_DATA,
  pgrepAny,
  quit,
  restorePluginData,
  screenshot,
  stateOf,
} from "./desktop-live";
import { runConcurrentPhase, runRefresh, runRestart, runRestore } from "./desktop-phases";
import {
  deriveSpec,
  humanSnapshot,
  immutableSnapshot,
  pngMagic,
  sceneAt,
  specBytes,
} from "./desktop-support";

const EVIDENCE = "/Users/billionjaepyo/tmp/.omo/evidence/agent-visual-learning-vault";
const ARTIFACT = "project-map-atlas-shop";
const STEPS = [
  "create",
  "open-working",
  "annotate-text",
  "annotate-freehand",
  "save-human",
  "assert-immutable-unchanged",
  "extend",
  "refresh",
  "restart",
  "restore-as-new-token",
] as const;

function must(cond: boolean, what: string): void {
  if (!cond) throw new RuntimeError(`assertion failed: ${what}`);
}

async function main(): Promise<void> {
  const options = parseOptions(
    Bun.argv.slice(2),
    new Set([
      "--obsidian-app",
      "--obsidian",
      "--vault",
      "--expected-vault",
      "--verified-vault-id",
      "--project",
      "--journey",
      "--screenshots",
      "--out",
      "--failures",
      "--concurrent-human-save-during-refresh",
      "--expect-cas-abort",
      "--expect-burned-token",
      "--retry-fresh-token",
      "--assert-no-immutable-mutation",
      "--assert-working-preserved",
    ]),
    new Set([
      "--concurrent-human-save-during-refresh",
      "--expect-cas-abort",
      "--expect-burned-token",
      "--retry-fresh-token",
      "--assert-no-immutable-mutation",
      "--assert-working-preserved",
    ]),
  );
  const vault = ensureMatchingVault(
    required(options, "--vault"),
    required(options, "--expected-vault"),
  );
  const project = required(options, "--project");
  const app = required(options, "--obsidian-app");
  const cli = required(options, "--obsidian");
  const appLog = required(options, "--out");
  const shots = required(options, "--screenshots");
  const journey = required(options, "--journey").split(",");
  for (const step of journey)
    if (!STEPS.includes(step as (typeof STEPS)[number]))
      throw new RuntimeError(`unknown journey step: ${step}`);
  let vaultId = required(options, "--verified-vault-id");
  if (vaultId === "task-2-receipt") {
    const receipt = JSON.parse(readFileSync(join(EVIDENCE, "task-2-preflight.json"), "utf8")) as {
      launch: { vaultRegistry: { id: string; path: string } };
    };
    must(receipt.launch.vaultRegistry.path === vault, "task-2 receipt vault path matches");
    vaultId = receipt.launch.vaultRegistry.id;
  }
  mkdirSync(shots, { recursive: true });
  writeFileSync(appLog, "");
  const temp = mkdtempSync(join(tmpdir(), "visual-note-task12-"));
  const projectBase = join(vault, "Engineering Atlas/10 Projects", project);
  const history = join(projectBase, "_history", ARTIFACT);
  const v2 = parseVisualNoteSpec(
    JSON.parse(readFileSync(join(projectBase, "_assets/walkthrough-refresh-v2.json"), "utf8")),
  );
  writeFileSync(join(temp, "refresh-v2.json"), specBytes(v2));
  writeFileSync(join(temp, "refresh-retry.json"), specBytes(deriveSpec(v2, { suffix: "(Retry)" })));
  if (pgrepAny()) throw new RuntimeError("BLOCKED: an Obsidian process already exists");
  const preflightPlugin = restorePluginData(PLUGIN_DATA);
  must(
    preflightPlugin.status !== "BLOCKED",
    `plugin data.json ${preflightPlugin.status}: ${preflightPlugin.detail}`,
  );
  const state = stateOf(vault, project, ARTIFACT);
  const ctx: JourneyContext = {
    vault,
    project,
    cli,
    vaultId,
    app,
    temp,
    shots,
    evidence: EVIDENCE,
    journey,
    projectBase,
    history,
    v2,
    note: join(import.meta.dir, "../../bin/visual-note"),
    burns: [],
    retryTokens: [],
    immutable0: immutableSnapshot(history),
    transcript: [],
    nonce: randomUUID().slice(0, 8),
    mutable: {
      state,
      humans: humanSnapshot(sceneAt(state.workingPath)),
      working: "",
      targetId: "",
      textId: "",
      codes: { text: "", freehand: "", concurrent: "", save: "" },
    },
  };
  const plugin0 = fileState(PLUGIN_DATA).sha256;
  let pid = 0;
  let launched = false;
  try {
    const started = await launch(app, vault);
    pid = started.pid;
    launched = true;
    log(ctx, "launch", { pid: started.pid, events: started.events });
    assertVaultIdentity(cli, vaultId, vault);
    assertPluginReady(cli, vaultId);
    log(ctx, "launch-ready", {
      vaultId,
      welcomeModalPending: true,
      note: "dismissed lazily before the first screenshot so create verifies the pristine plugin data.json",
    });
    await runJourney(ctx);
    if (journey.includes("refresh")) runRefresh(ctx);
    if (journey.includes("restart")) pid = await runRestart(ctx, pid);
    if (options.flags.has("--concurrent-human-save-during-refresh")) {
      must(
        options.flags.has("--expect-cas-abort") &&
          options.flags.has("--expect-burned-token") &&
          options.flags.has("--retry-fresh-token"),
        "CAS-abort expectations are required",
      );
      await runConcurrentPhase(ctx);
    }
    if (journey.includes("restore-as-new-token")) runRestore(ctx);
    function runFinalShots(ctx: JourneyContext): void {
      dismissWelcomeOnce(ctx.cli, ctx.vaultId);
      screenshot(ctx.cli, join(ctx.shots, "task-12-after.png"));
      must(pngMagic(join(ctx.shots, "task-12-after.png")), "after screenshot is a PNG");
      log(ctx, "screenshots", {
        before: join(ctx.shots, "task-12-before.png"),
        after: join(ctx.shots, "task-12-after.png"),
      });
      ctx.mutable.state = stateOf(vault, project, ARTIFACT);
    }
    runFinalShots(ctx);
    const failures = options.values.get("--failures");
    if (failures !== undefined) {
      must(
        options.flags.has("--assert-no-immutable-mutation") &&
          options.flags.has("--assert-working-preserved"),
        "failure assertions are required",
      );
      runFailureMatrix(ctx, failures);
    }
  } finally {
    if (launched) await quit(pid);
  }
  finalizeEvidence(ctx, appLog, plugin0);
}

main().catch((error) => {
  process.stderr.write(`desktop: ${error instanceof Error ? error.message : "unknown failure"}\n`);
  process.exit(error instanceof RuntimeError && error.message.startsWith("BLOCKED") ? 3 : 2);
});
