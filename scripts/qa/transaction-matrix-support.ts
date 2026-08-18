import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Boundary, refreshTransaction } from "../../src/transaction-engine";
import { transactionPaths } from "../../src/transaction-layout";
import { writeCommitted, writeState } from "../../src/transaction-state";
import { openTransaction } from "../../src/transaction-verify";
import {
  agentTamper,
  humanSave,
  seedTransaction,
  specV1,
  specV2,
  transactionState,
} from "../../tests/transaction-support";

export type InjectionWindow =
  | "immediately-before-flush"
  | "during-flush"
  | "after-close-before-final-cas"
  | "before-state-rename";

export function csv(value: string): readonly string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function fixtureRoot(out: string, label: string): string {
  const root = mkdtempSync(join(dirname(out), `${label}-`));
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  return root;
}

export function childMode(boundary: Boundary, vault: string): never {
  const { project, state } = seedTransaction(vault, "human-arrow-to-agent");
  refreshTransaction(
    { vault, project, spec: specV2, expectedToken: state.committedToken },
    {
      onBoundary(name) {
        if (name === boundary) process.kill(process.pid, "SIGTERM");
      },
    },
  );
  process.exit(10);
}

export function childResult(
  boundary: Boundary,
  out: string,
): { readonly status: string; readonly token: string } {
  const vault = fixtureRoot(out, `kill-${boundary}`);
  const executable = Bun.argv[0];
  const script = Bun.argv[1];
  if (executable === undefined || script === undefined) throw new TypeError("script path missing");
  const child = Bun.spawnSync(
    [executable, script, "--child-boundary", boundary, "--vault", vault],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let status = "BLOCKED";
  let token = "cas-0";
  try {
    const opened = openTransaction(vault, "human-arrow-to-agent", specV1.artifactId);
    status = `${opened.recovery}:${opened.state.committedToken}`;
    token = opened.state.committedToken;
  } catch (error) {
    status = error instanceof Error ? error.message : "BLOCKED";
  }
  return { status: `${child.exitCode}:${status}`, token };
}

function injectionBoundary(window: InjectionWindow): Boundary {
  return window === "immediately-before-flush"
    ? "close-old-view"
    : window === "during-flush"
      ? "flush-complete"
      : window === "after-close-before-final-cas"
        ? "close-flush-complete"
        : "final-source-cas";
}

export function injectionResult(
  window: InjectionWindow,
  out: string,
): { readonly status: string; readonly token: string } {
  const vault = fixtureRoot(out, `inject-${window}`);
  const { project, state } = seedTransaction(vault, "human-arrow-to-agent");
  try {
    refreshTransaction(
      { vault, project, spec: specV2, expectedToken: state.committedToken },
      {
        onBoundary(name) {
          if (name === injectionBoundary(window)) humanSave(vault, project, window);
        },
      },
    );
    return { status: "UNEXPECTED-SUCCESS", token: transactionState(vault, project).committedToken };
  } catch (error) {
    return {
      status: error instanceof Error ? error.message : "error",
      token: transactionState(vault, project).committedToken,
    };
  }
}

export function tamperResult(caseName: string, out: string): string {
  const vault = fixtureRoot(out, `tamper-${caseName}`);
  const { project } = seedTransaction(vault, "human-arrow-to-agent");
  const paths = transactionPaths(vault, project, specV1.artifactId);
  const state = transactionState(vault, project);
  if (caseName === "missing-working") rmSync(state.workingPath, { force: true });
  if (caseName === "missing-revision") rmSync(state.revisionPath, { recursive: true, force: true });
  if (caseName === "mismatched-agent-base") agentTamper(vault, project);
  if (caseName === "mismatched-token") {
    writeState(paths.statePath, {
      ...state,
      committedToken: "cas-9",
      workingPath: `${state.workingPath}.missing`,
    });
  }
  if (caseName === "alternate-path") {
    const alternateRevision = `${state.revisionPath}-copy`;
    const alternateWorking = `${state.workingPath}.copy`;
    cpSync(state.revisionPath, alternateRevision, { recursive: true });
    cpSync(state.workingPath, alternateWorking);
    writeState(paths.statePath, {
      ...state,
      revisionPath: alternateRevision,
      workingPath: alternateWorking,
    });
    writeCommitted(paths.committedPath, {
      schemaVersion: 1,
      token: state.committedToken,
      revisionPath: alternateRevision,
      workingPath: alternateWorking,
      agentBaseHash: state.agentBaseHash,
      sceneGeneration: state.sceneGeneration,
    });
  }
  if (caseName === "symlink-working") {
    const backup = `${state.workingPath}.target`;
    renameSync(state.workingPath, backup);
    symlinkSync(backup, state.workingPath);
  }
  if (caseName === "bogus-generation") {
    writeState(paths.statePath, { ...state, sceneGeneration: 999 });
    writeCommitted(paths.committedPath, {
      schemaVersion: 1,
      token: state.committedToken,
      revisionPath: state.revisionPath,
      workingPath: state.workingPath,
      agentBaseHash: state.agentBaseHash,
      sceneGeneration: 999,
    });
  }
  try {
    openTransaction(vault, project, specV1.artifactId);
    return "UNEXPECTED-SUCCESS";
  } catch (error) {
    return error instanceof Error ? error.message : "BLOCKED";
  }
}
