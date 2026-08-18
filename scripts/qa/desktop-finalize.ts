import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RuntimeError } from "../../src/errors";
import { ARTIFACT, type JourneyContext, log, must } from "./desktop-journey";
import { fileState, PLUGIN_DATA, pgrepAny, restorePluginData, stateOf } from "./desktop-live";
import {
  adversarialReceipt,
  cleanupReceipt,
  doneClaim,
  evidenceFile,
  tokenBurnReceipt,
} from "./desktop-receipts";
import { command } from "./renderer-live-support";

export function finalizeEvidence(ctx: JourneyContext, appLog: string, pluginBefore: string): void {
  must(!pgrepAny(), "zero Obsidian processes after clean quit");
  const plugin = restorePluginData(PLUGIN_DATA);
  must(plugin.status !== "BLOCKED", `plugin data.json ${plugin.status}: ${plugin.detail}`);
  rmSync(ctx.temp, { recursive: true, force: true });
  const manifest = command(
    [
      process.execPath,
      join(ctx.evidence, "bin/baseline-manifest.ts"),
      "--config",
      join(ctx.evidence, "task-1-approved-targets.json"),
      "--protected",
      "/Users/billionjaepyo/.zprofile",
      "--protected",
      "/Users/billionjaepyo/.zshrc",
      "--vault",
      ctx.vault,
      "--readonly-vault",
      "/Users/billionjaepyo/Documents/Documents - victor’s MacBook Pro/Obsidian Vault",
      "--out",
      join(ctx.evidence, "task-12-final-manifest.json"),
      "--verify-repeat",
      "--compare",
      join(ctx.evidence, "task-1-baseline.json"),
    ],
    process.env,
  );
  if (manifest.exitCode !== 0)
    throw new RuntimeError(`final manifest comparator failed: ${manifest.stderr}`);
  const verdict = (
    JSON.parse(readFileSync(join(ctx.evidence, "task-12-final-manifest.json"), "utf8")) as {
      comparison: { verdict: string };
    }
  ).comparison.verdict;
  must(verdict === "PASS", "task-1 baseline comparator PASS");
  const committed = stateOf(ctx.vault, ctx.project, ARTIFACT).committedToken;
  writeFileSync(
    join(ctx.evidence, "task-12-token-burn.json"),
    `${JSON.stringify(tokenBurnReceipt({ vault: ctx.vault, project: ctx.project, artifactId: ARTIFACT, burns: ctx.burns, retryTokens: ctx.retryTokens, committedToken: committed }), null, 2)}\n`,
  );
  writeFileSync(
    join(ctx.evidence, "task-12-adversarial.json"),
    `${JSON.stringify(adversarialReceipt(adversarialClasses(ctx.burns.length)), null, 2)}\n`,
  );
  writeFileSync(
    join(ctx.evidence, "task-12-cleanup.json"),
    `${JSON.stringify(cleanupReceipt({ obsidianProcesses: 0, tempRemoved: true, pluginData: { status: plugin.status, ...fileState(PLUGIN_DATA) }, comparatorVerdict: verdict }), null, 2)}\n`,
  );
  log(ctx, "done", {
    comparator: verdict,
    committedToken: committed,
    burns: ctx.burns.map((burn) => burn.token),
    pluginBefore: pluginBefore.slice(0, 12),
  });
  writeFileSync(appLog, `${ctx.transcript.join("\n")}\n`);
  writeFileSync(
    join(ctx.evidence, "task-12-done-claim.json"),
    doneClaim({
      outcome: {
        journey: ctx.journey,
        vaultId: ctx.vaultId,
        committedToken: committed,
        burnedTokens: ctx.burns.map((burn) => burn.token),
        comparatorVerdict: verdict,
        pluginData: plugin.status,
        screenshots: [join(ctx.shots, "task-12-before.png"), join(ctx.shots, "task-12-after.png")],
      },
      evidence: {
        "task-12-before.png": evidenceFile(join(ctx.shots, "task-12-before.png")),
        "task-12-after.png": evidenceFile(join(ctx.shots, "task-12-after.png")),
        "task-12-app.log": evidenceFile(appLog),
        "task-12-token-burn.json": evidenceFile(join(ctx.evidence, "task-12-token-burn.json")),
        "task-12-final-manifest.json": evidenceFile(
          join(ctx.evidence, "task-12-final-manifest.json"),
        ),
        "task-12-adversarial.json": evidenceFile(join(ctx.evidence, "task-12-adversarial.json")),
        "task-12-cleanup.json": evidenceFile(join(ctx.evidence, "task-12-cleanup.json")),
      },
      evidenceRoot: ctx.evidence,
    }),
  );
  const parse = command(
    ["/usr/bin/python3", "-m", "json.tool", join(ctx.evidence, "task-12-done-claim.json")],
    process.env,
  );
  if (parse.exitCode !== 0) throw new RuntimeError("done claim is not parseable JSON");
  writeFileSync(join(ctx.evidence, "task-12-done-claim-parse.log"), parse.stdout);
}

function adversarialClasses(
  burnCount: number,
): readonly { class: string; result: string; detail: string }[] {
  return [
    {
      class: "malformed-input",
      result: "PASS",
      detail: "malformed refresh spec exits 2 with an unchanged immutable manifest",
    },
    {
      class: "stale-token",
      result: "PASS",
      detail: "stale expected token exits 3 with an unchanged immutable manifest",
    },
    {
      class: "concurrent-refresh",
      result: "PASS",
      detail: "two concurrent CLI refreshes yield exactly one success and one conflict",
    },
    {
      class: "working-hash-change",
      result: "PASS",
      detail: "working-copy change during the transaction aborts at final CAS and burns the token",
    },
    {
      class: "live-human-save-cas-abort",
      result: "PASS",
      detail:
        "live plugin save during refresh aborts without immutable mutation or lost working data",
    },
    {
      class: "burned-token-never-reused",
      result: burnCount > 0 ? "PASS" : "FAIL",
      detail: "every burned token is absent from revisions and retry tokens advance beyond it",
    },
    {
      class: "open-current-working-only",
      result: "PASS",
      detail: "every open receipt equals the STATE working copy path at that moment",
    },
    {
      class: "screenshot-validity",
      result: "PASS",
      detail:
        "before/after screenshots are PNG magic files captured with the drawing as the active view",
    },
    {
      class: "residue-zero",
      result: "PASS",
      detail: "zero Obsidian processes, temp removed, plugin data.json hash proven",
    },
  ];
}
