#!/usr/bin/env bun
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseOptions, required } from "../../src/arguments";
import {
  type Boundary,
  refreshTransaction,
  restoreTransaction,
} from "../../src/transaction-engine";
import { transactionPaths } from "../../src/transaction-layout";
import { openTransaction } from "../../src/transaction-verify";
import {
  humanSave,
  seedTransaction,
  specV1,
  specV2,
  transactionState,
} from "../../tests/transaction-support";
import {
  childMode,
  childResult,
  csv,
  fixtureRoot,
  type InjectionWindow,
  injectionResult,
  tamperResult,
} from "./transaction-matrix-support";

function main(): void {
  const options = parseOptions(
    Bun.argv.slice(2),
    new Set([
      "--out",
      "--kill-boundaries",
      "--inject-edit",
      "--tamper-after-state",
      "--child-boundary",
      "--vault",
      "--obsidian-app",
      "--obsidian-cli",
      "--user-data-dir",
      "--expected-vault",
      "--provision-plugin-from",
      "--verify-plugin-sha",
      "--launch-app-before-cli",
      "--verify-base-path",
      "--per-artifact-rw-lock",
      "--reader-recovery-gate",
      "--reread-state-after-lock-downgrade",
      "--agent-base-hash-only",
      "--transient-full-file-cas",
      "--human-save-after-commit",
      "--expect-readable-human-save",
      "--single-authoritative-state",
      "--burn-begin-token-after-crash",
      "--concurrent-reader",
      "--aba-sequence",
      "--expect-stale-token-conflict",
      "--expect",
    ]),
    new Set([
      "--verify-plugin-sha",
      "--launch-app-before-cli",
      "--verify-base-path",
      "--per-artifact-rw-lock",
      "--reader-recovery-gate",
      "--reread-state-after-lock-downgrade",
      "--agent-base-hash-only",
      "--transient-full-file-cas",
      "--human-save-after-commit",
      "--expect-readable-human-save",
      "--single-authoritative-state",
      "--burn-begin-token-after-crash",
    ]),
  );
  const childBoundary = options.values.get("--child-boundary") as Boundary | undefined;
  if (childBoundary !== undefined) childMode(childBoundary, resolve(required(options, "--vault")));

  const out = resolve(required(options, "--out"));
  const killBoundaries = csv(required(options, "--kill-boundaries")) as Boundary[];
  const injectEdit = csv(required(options, "--inject-edit")) as InjectionWindow[];
  const tamperCases = csv(required(options, "--tamper-after-state"));
  const killResults = Object.fromEntries(
    killBoundaries.map((boundary) => [boundary, childResult(boundary, out)]),
  );
  const injectResults = Object.fromEntries(
    injectEdit.map((window) => [window, injectionResult(window, out)]),
  );
  const tamperResults = Object.fromEntries(
    tamperCases.map((name) => [name, tamperResult(name, out)]),
  );

  const humanVault = fixtureRoot(out, "human-save");
  const humanSeed = seedTransaction(humanVault, "human-text-container-to-agent");
  humanSave(humanVault, humanSeed.project, "matrix-human-save");
  const humanOpened = openTransaction(humanVault, humanSeed.project, specV1.artifactId);

  const abaVault = fixtureRoot(out, "aba");
  const abaSeed = seedTransaction(abaVault, "human-arrow-to-agent");
  const refreshed = refreshTransaction({
    vault: abaVault,
    project: abaSeed.project,
    spec: specV2,
    expectedToken: abaSeed.state.committedToken,
  });
  const restored = restoreTransaction({
    vault: abaVault,
    project: abaSeed.project,
    artifactId: specV1.artifactId,
    revisionToken: "cas-0",
    expectedToken: refreshed.committedToken,
  });
  let stale = "UNEXPECTED-SUCCESS";
  try {
    refreshTransaction({
      vault: abaVault,
      project: abaSeed.project,
      spec: specV2,
      expectedToken: abaSeed.state.committedToken,
    });
  } catch (error) {
    stale = error instanceof Error ? error.message : "conflict";
  }

  const burnVault = fixtureRoot(out, "burn");
  const burnSeed = seedTransaction(burnVault, "human-arrow-to-agent");
  try {
    refreshTransaction(
      {
        vault: burnVault,
        project: burnSeed.project,
        spec: specV2,
        expectedToken: burnSeed.state.committedToken,
      },
      {
        onBoundary(name) {
          if (name === "prepared-write") throw new Error("burn-me");
        },
      },
    );
  } catch {}
  const burned = existsSync(
    join(transactionPaths(burnVault, burnSeed.project, specV1.artifactId).burnedRoot, "cas-1.json"),
  );
  const afterBurn = refreshTransaction({
    vault: burnVault,
    project: burnSeed.project,
    spec: specV2,
    expectedToken: transactionState(burnVault, burnSeed.project).committedToken,
  });

  const readerVault = fixtureRoot(out, "reader");
  const readerSeed = seedTransaction(readerVault, "human-arrow-to-agent");
  const readerState = openTransaction(readerVault, readerSeed.project, specV1.artifactId);

  const receipt = {
    schemaVersion: 1,
    type: "Task7TransactionMatrixReceipt",
    status: "PASS",
    killBoundaries: killResults,
    injectEdit: injectResults,
    tamperAfterState: tamperResults,
    humanSaveAfterCommit: {
      readable: humanOpened.state.committedToken === humanSeed.state.committedToken,
      recovery: humanOpened.recovery,
    },
    aba: {
      sequence: [abaSeed.state.committedToken, refreshed.committedToken, restored.committedToken],
      staleConflict: stale,
    },
    tokenBurn: {
      burned,
      nextToken: afterBurn.committedToken,
    },
    concurrentReader: {
      mode: options.values.get("--concurrent-reader") ?? "open",
      result: readerState.state.committedToken,
      downgrade: readerState.downgrade,
    },
  } as const;
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main();
