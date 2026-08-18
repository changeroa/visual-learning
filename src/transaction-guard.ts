import { RuntimeError } from "./errors";
import { type FileReceipt, fileReceipt, sameReceipt } from "./transaction-agent";
import { readDigest, removeFile, removePath } from "./transaction-fs";
import type { TransactionPaths } from "./transaction-layout";
import { readState, type StateRecord, writeState } from "./transaction-state";
import { validateState } from "./transaction-verify";

function sameState(left: StateRecord, right: StateRecord): boolean {
  return (
    left.committedToken === right.committedToken &&
    left.revisionPath === right.revisionPath &&
    left.workingPath === right.workingPath &&
    left.agentBaseHash === right.agentBaseHash &&
    left.sceneGeneration === right.sceneGeneration
  );
}

export function validateTuple(
  paths: TransactionPaths,
  nextState: StateRecord,
  previousDigest: string,
  sourceBefore: FileReceipt,
  publishedWorking: FileReceipt,
): void {
  if (readDigest(paths.statePath) === previousDigest)
    throw new RuntimeError("BLOCKED: STATE rename missing");
  const reread = readState(paths.statePath);
  if (!sameState(nextState, reread)) throw new RuntimeError("BLOCKED: STATE tuple mismatch");
  const validated = validateState(paths, reread);
  if (!sameReceipt(validated.metadata.sourceReceipt, sourceBefore))
    throw new RuntimeError("BLOCKED: source receipt mismatch");
  if (
    !sameReceipt(fileReceipt(reread.workingPath, publishedWorking.eventSequence), publishedWorking)
  )
    throw new RuntimeError("BLOCKED: published working receipt mismatch");
}

export function rollbackPending(
  paths: TransactionPaths,
  pendingToken: string,
  previousState: StateRecord | null,
): void {
  if (previousState !== null) writeState(paths.statePath, previousState);
  removePath(paths.revisionPath(pendingToken));
  removePath(paths.workingPath(pendingToken));
  removeFile(paths.beginPath);
}
