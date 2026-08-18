import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../../src/io";

export type EvidenceFile = { readonly bytes: number; readonly sha256: string };

export function evidenceFile(path: string): EvidenceFile {
  const status = statSync(path);
  return { bytes: status.size, sha256: sha256(readFileSync(path)) };
}

export function evidenceMap(root: string, names: readonly string[]): Record<string, EvidenceFile> {
  return Object.fromEntries(names.map((name) => [name, evidenceFile(join(root, name))]));
}

export type BurnRecord = {
  readonly token: string;
  readonly reason: string;
  readonly phase: string;
  readonly stateUnchanged: boolean;
  readonly abandonedRevisionAbsent: boolean;
};

export function tokenBurnReceipt(input: {
  readonly vault: string;
  readonly project: string;
  readonly artifactId: string;
  readonly burns: readonly BurnRecord[];
  readonly retryTokens: readonly string[];
  readonly committedToken: string;
}): unknown {
  const burned = input.burns.map((burn) => burn.token.replace(/\.json$/, ""));
  const burnedIndexes = burned.map((token) => Number(token.replace("cas-", "")));
  const reused = retryIndexes(burnedIndexes, input.retryTokens, input.committedToken);
  return {
    schemaVersion: 1,
    type: "Task12TokenBurnReceipt",
    status: reused.length === 0 && input.burns.length > 0 ? "PASS" : "FAIL",
    artifact: `${input.project}/${input.artifactId}`,
    burns: input.burns,
    burnedTokens: burned,
    retryTokens: input.retryTokens,
    committedToken: input.committedToken,
    burnedNeverReused: reused.length === 0,
    reused,
  };
}

function retryIndexes(
  burned: readonly number[],
  retries: readonly string[],
  committed: string,
): readonly string[] {
  const used = [...retries, committed].map((token) => token.replace("cas-", ""));
  return used.filter((token) => burned.includes(Number(token)));
}

export function adversarialReceipt(
  classes: readonly { class: string; result: string; detail: string }[],
): unknown {
  return {
    schemaVersion: 1,
    type: "Task12AdversarialReceipt",
    verdict: classes.every((entry) => entry.result === "PASS" || entry.result === "NOT_APPLICABLE")
      ? "PASS"
      : "FAIL",
    classes,
  };
}

export function cleanupReceipt(input: {
  readonly obsidianProcesses: number;
  readonly tempRemoved: boolean;
  readonly pluginData: { readonly status: string; readonly sha256: string; readonly bytes: number };
  readonly comparatorVerdict: string;
}): unknown {
  return {
    schemaVersion: 1,
    type: "Task12CleanupReceipt",
    status:
      input.obsidianProcesses === 0 &&
      input.tempRemoved &&
      input.pluginData.status !== "BLOCKED" &&
      input.comparatorVerdict === "PASS"
        ? "PASS"
        : "FAIL",
    obsidianProcesses: input.obsidianProcesses,
    tempRemoved: input.tempRemoved,
    pluginData: input.pluginData,
    comparatorVerdict: input.comparatorVerdict,
  };
}

export function doneClaim(input: {
  readonly outcome: Record<string, unknown>;
  readonly evidence: Record<string, EvidenceFile>;
  readonly evidenceRoot: string;
}): string {
  const claim = {
    schemaVersion: 1,
    type: "TaskDoneClaim",
    status: "DONE",
    task_id: "st_01a012f9",
    plan_checkbox: "12. Exercise real Obsidian annotation-preservation journey",
    completed: true,
    outcome: input.outcome,
    evidence: input.evidence,
    evidenceRoot: input.evidenceRoot,
  };
  const core = `${JSON.stringify(claim, null, 2)}`;
  const digest = createHash("sha256").update(`${core}\n`).digest("hex");
  return `${JSON.stringify({ ...claim, claim_sha256: digest }, null, 2)}\n`;
}
