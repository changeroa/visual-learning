import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { ConflictError, RuntimeError } from "./errors";
import { readScene, validateReadableWorking } from "./transaction-agent";
import { fsyncDirectory, removeFile, removePath } from "./transaction-fs";
import { revisionFiles, type TransactionPaths, transactionPaths } from "./transaction-layout";
import { acquireLock, type LockHandle } from "./transaction-lock";
import { validateBeginPaths, validateCommittedPaths, validateStatePaths } from "./transaction-path";
import {
  burnToken,
  readBegin,
  readCommitted,
  readState,
  type StateRecord,
  validateRevisionBundle,
  writeCommitted,
} from "./transaction-state";

export type OpenedTransaction = {
  readonly state: StateRecord;
  readonly scene: ReturnType<typeof readScene>;
  readonly recovery: "clean" | "rollback" | "forward";
  readonly downgrade: "release-reacquire";
};

export type OpenControl = { readonly beforeSharedReacquire?: () => void };
export type ValidatedState = {
  readonly scene: ReturnType<typeof readScene>;
  readonly metadata: ReturnType<typeof validateRevisionBundle>;
};

function cleanupAttempt(paths: TransactionPaths, token: string, reason: string): void {
  removePath(paths.revisionPath(token));
  removePath(paths.workingPath(token));
  burnToken(paths, token, reason);
}

function committedMatchesState(
  state: StateRecord,
  committed: NonNullable<ReturnType<typeof readCommitted>>,
): boolean {
  return (
    committed.token === state.committedToken &&
    committed.revisionPath === state.revisionPath &&
    committed.workingPath === state.workingPath &&
    committed.agentBaseHash === state.agentBaseHash &&
    committed.sceneGeneration === state.sceneGeneration
  );
}

export function validateState(paths: TransactionPaths, state: StateRecord): ValidatedState {
  validateStatePaths(paths, state);
  const metadata = validateRevisionBundle(state.revisionPath);
  if (metadata.token !== state.committedToken)
    throw new RuntimeError(`BLOCKED: metadata token mismatch ${state.revisionPath}`);
  if (metadata.sceneGeneration !== state.sceneGeneration)
    throw new RuntimeError(`BLOCKED: metadata sceneGeneration mismatch ${state.revisionPath}`);
  if (metadata.agentBaseHash !== state.agentBaseHash)
    throw new RuntimeError(`BLOCKED: metadata agentBaseHash mismatch ${state.revisionPath}`);
  if (!existsSync(state.workingPath))
    throw new RuntimeError(`BLOCKED: missing working copy ${state.workingPath}`);
  return {
    scene: validateReadableWorking(state.workingPath, revisionFiles(state.revisionPath).snapshot),
    metadata,
  };
}

export function recoverTransaction(paths: TransactionPaths): {
  readonly state: StateRecord;
  readonly scene: ReturnType<typeof readScene>;
  readonly recovery: "clean" | "rollback" | "forward";
} {
  const state = readState(paths.statePath);
  const begin = readBegin(paths.beginPath);
  const committed = readCommitted(paths.committedPath);
  if (begin !== null) validateBeginPaths(paths, begin);
  if (committed !== null) validateCommittedPaths(paths, committed);
  if (begin === null && committed === null) {
    return { state, scene: validateState(paths, state).scene, recovery: "clean" };
  }
  if (begin !== null && state.committedToken === begin.previousToken) {
    cleanupAttempt(paths, begin.token, "rollback-after-begin");
    removeFile(paths.beginPath);
    if (committed?.token === begin.token) removeFile(paths.committedPath);
    fsyncDirectory(dirname(paths.beginPath));
    const recovered = readState(paths.statePath);
    return { state: recovered, scene: validateState(paths, recovered).scene, recovery: "rollback" };
  }
  if (begin !== null && state.committedToken === begin.token) {
    const validated = validateState(paths, state);
    if (committed !== null && !committedMatchesState(state, committed))
      throw new RuntimeError(`BLOCKED: COMMITTED tuple mismatch ${paths.committedPath}`);
    if (committed === null) {
      writeCommitted(paths.committedPath, {
        schemaVersion: 1,
        token: begin.token,
        revisionPath: state.revisionPath,
        workingPath: state.workingPath,
        agentBaseHash: state.agentBaseHash,
        sceneGeneration: state.sceneGeneration,
      });
    }
    removeFile(paths.beginPath);
    fsyncDirectory(dirname(paths.beginPath));
    return { state, scene: validated.scene, recovery: "forward" };
  }
  if (committed !== null && committedMatchesState(state, committed)) {
    return { state, scene: validateState(paths, state).scene, recovery: "forward" };
  }
  throw new RuntimeError("BLOCKED: mixed transaction tuple");
}

function reacquireShared(lock: LockHandle): LockHandle {
  lock.close();
  return acquireLock(lock.root, "shared");
}

export function openTransaction(
  vault: string,
  project: string,
  artifactId: string,
  control?: OpenControl,
): OpenedTransaction {
  const paths = transactionPaths(vault, project, artifactId);
  const exclusive = acquireLock(paths.lockRoot, "exclusive");
  let shared: LockHandle | null = null;
  try {
    const recovered = recoverTransaction(paths);
    control?.beforeSharedReacquire?.();
    shared = reacquireShared(exclusive);
    const state = readState(paths.statePath);
    const scene = validateState(paths, state).scene;
    return { state, scene, recovery: recovered.recovery, downgrade: "release-reacquire" };
  } catch (error) {
    shared?.close();
    exclusive.close();
    if (error instanceof ConflictError || error instanceof RuntimeError) throw error;
    throw error;
  } finally {
    shared?.close();
  }
}

export function readRevisionSnapshot(path: string): ReturnType<typeof readScene> {
  return readScene(path);
}

export function revisionSpec(path: string): string {
  return readFileSync(path, "utf8");
}
