import { readFileSync, watch } from "node:fs";
import { basename, dirname } from "node:path";
import { ConflictError } from "./errors";
import { type ExcalidrawScene, encodeSceneToMarkdown, parseSceneMarkdown } from "./excalidraw-file";
import { applyRefreshToScene } from "./refresh-apply";
import type { VisualNoteSpec } from "./schema";
import { agentBaseHash, assertCasUnchanged, fileReceipt } from "./transaction-agent";
import {
  fsyncDirectory,
  fsyncFile,
  readDigest,
  removeFile,
  renameAtomic,
  writeJsonAtomic,
  writeTextFsynced,
} from "./transaction-fs";
import { rollbackPending, validateTuple } from "./transaction-guard";
import { revisionFiles, transactionPaths } from "./transaction-layout";
import { acquireLock } from "./transaction-lock";
import { mirrorCurrent, noteForWorking, stageRevision, svgBytes } from "./transaction-publish";
import {
  nextToken,
  readBegin,
  type StateRecord,
  writeBegin,
  writeCommitted,
  writeState,
} from "./transaction-state";
import type {
  PreparedTransaction,
  TransactionControl,
  TransactionResult,
} from "./transaction-types";
import { recoverTransaction } from "./transaction-verify";

function mark(
  control: TransactionControl | undefined,
  name: Parameters<NonNullable<TransactionControl["onBoundary"]>>[0],
): void {
  control?.onBoundary?.(name);
}

function commitPrepared(
  input: {
    readonly vault: string;
    readonly project: string;
    readonly artifactId: string;
    readonly expectedToken: string;
    readonly prepare: (scene: ExcalidrawScene) => PreparedTransaction;
  },
  control?: TransactionControl,
): TransactionResult {
  const paths = transactionPaths(input.vault, input.project, input.artifactId);
  const lock = acquireLock(paths.lockRoot, "exclusive");
  let subscription: ReturnType<typeof watch> | null = null;
  let previousState: StateRecord | null = null;
  const watcher = { sequence: 0 };
  try {
    const recovered = recoverTransaction(paths);
    previousState = recovered.state;
    const state = previousState;
    if (state.committedToken !== input.expectedToken)
      throw new ConflictError(`refresh conflict: expected ${input.expectedToken}`);
    const prepared = input.prepare(recovered.scene);
    const token = nextToken(paths, state);
    const previousDigest = readDigest(paths.statePath);
    mark(control, "subscribe-before-flush");
    subscription = watch(dirname(state.workingPath), (event, filename) => {
      if ((event === "change" || event === "rename") && filename === basename(state.workingPath))
        watcher.sequence += 1;
    });
    const sourceBefore = fileReceipt(state.workingPath, watcher.sequence);
    mark(control, "source-cas");
    mark(control, "begin-write");
    writeBegin(paths.beginPath, {
      schemaVersion: 1,
      token,
      previousToken: state.committedToken,
      previousStateDigest: previousDigest,
      previousSceneGeneration: state.sceneGeneration,
      sourcePath: state.workingPath,
      sourceReceipt: sourceBefore,
    });
    mark(control, "begin-parent-fsync");
    fsyncDirectory(dirname(paths.beginPath));
    const workingPath = paths.workingPath(token);
    const revisionPath = paths.revisionPath(token);
    const note = noteForWorking(
      input.vault,
      paths,
      prepared.spec,
      workingPath,
      prepared.deprecatedAnchors,
    );
    const svg = svgBytes(prepared.spec, prepared.scene);
    mark(control, "stage-working");
    writeTextFsynced(`${workingPath}.tmp`, encodeSceneToMarkdown(prepared.scene));
    mark(control, "stage-bundle");
    stageRevision(
      `${revisionPath}.tmp`,
      {
        token,
        previousToken: state.committedToken,
        revision: prepared.spec.revision,
        sceneGeneration: state.sceneGeneration + 1,
        sourceReceipt: sourceBefore,
      },
      prepared.spec,
      note,
      svg,
      prepared.scene,
    );
    mark(control, "prepared-write");
    mark(control, "prepared-parent-fsync");
    assertCasUnchanged(sourceBefore, fileReceipt(state.workingPath, watcher.sequence), "prepared");
    mark(control, "publish-revision");
    renameAtomic(`${revisionPath}.tmp`, revisionPath);
    mark(control, "revision-parent-fsync");
    mark(control, "publish-working");
    renameAtomic(`${workingPath}.tmp`, workingPath);
    const publishedWorking = fileReceipt(workingPath, watcher.sequence);
    mark(control, "working-parent-fsync");
    mark(control, "close-old-view");
    fsyncFile(state.workingPath);
    mark(control, "flush-complete");
    const flushed = fileReceipt(state.workingPath, watcher.sequence);
    mark(control, "close-flush-complete");
    assertCasUnchanged(sourceBefore, flushed, "close-flush-complete");
    mark(control, "final-source-cas");
    assertCasUnchanged(sourceBefore, fileReceipt(state.workingPath, watcher.sequence), "final");
    if (readDigest(paths.statePath) !== previousDigest)
      throw new ConflictError("state CAS changed");
    const nextState = {
      schemaVersion: 1,
      committedToken: token,
      revisionPath,
      workingPath,
      agentBaseHash: agentBaseHash(prepared.scene),
      sceneGeneration: state.sceneGeneration + 1,
    } as const;
    mark(control, "state-rename");
    writeState(paths.statePath, nextState);
    mark(control, "state-parent-fsync");
    mark(control, "validate-state-tuple");
    validateTuple(paths, nextState, previousDigest, sourceBefore, publishedWorking);
    mirrorCurrent(paths, prepared.spec, note, svg);
    mark(control, "committed-write");
    writeCommitted(paths.committedPath, {
      schemaVersion: 1,
      token,
      revisionPath,
      workingPath,
      agentBaseHash: nextState.agentBaseHash,
      sceneGeneration: nextState.sceneGeneration,
    });
    mark(control, "committed-parent-fsync");
    removeFile(paths.beginPath);
    mark(control, "open-new-view");
    return {
      committedToken: token,
      revisionPath,
      workingPath,
      deprecatedAnchors: prepared.deprecatedAnchors,
      sceneGeneration: nextState.sceneGeneration,
    };
  } catch (error) {
    const pending = readBegin(paths.beginPath);
    if (pending !== null) {
      rollbackPending(paths, pending.token, previousState);
      writeJsonAtomic(`${paths.burnedRoot}/${pending.token}.json`, {
        schemaVersion: 1,
        token: pending.token,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
    throw error;
  } finally {
    subscription?.close();
    lock.close();
  }
}

export function refreshTransaction(
  input: {
    readonly vault: string;
    readonly project: string;
    readonly spec: VisualNoteSpec;
    readonly expectedToken: string;
  },
  control?: TransactionControl,
): TransactionResult {
  return commitPrepared(
    {
      vault: input.vault,
      project: input.project,
      artifactId: input.spec.artifactId,
      expectedToken: input.expectedToken,
      prepare(scene) {
        const refreshed = applyRefreshToScene(scene, input.spec);
        return {
          spec: input.spec,
          scene: refreshed.scene,
          deprecatedAnchors: refreshed.deprecatedAnchors,
        };
      },
    },
    control,
  );
}

export function restoreTransaction(
  input: {
    readonly vault: string;
    readonly project: string;
    readonly artifactId: string;
    readonly revisionToken: string;
    readonly expectedToken: string;
  },
  control?: TransactionControl,
): TransactionResult {
  const files = revisionFiles(
    transactionPaths(input.vault, input.project, input.artifactId).revisionPath(
      input.revisionToken,
    ),
  );
  const spec = JSON.parse(readFileSync(files.spec, "utf8")) as VisualNoteSpec;
  const scene = parseSceneMarkdown(readFileSync(files.snapshot, "utf8")).scene;
  return commitPrepared(
    {
      vault: input.vault,
      project: input.project,
      artifactId: input.artifactId,
      expectedToken: input.expectedToken,
      prepare() {
        return { spec, scene, deprecatedAnchors: [] };
      },
    },
    control,
  );
}
