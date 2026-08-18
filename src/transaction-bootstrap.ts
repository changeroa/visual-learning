import { mkdirSync } from "node:fs";
import { type ExcalidrawScene, encodeSceneToMarkdown } from "./excalidraw-file";
import type { VisualNoteSpec } from "./schema";
import { agentBaseHashLegacy, fileReceipt } from "./transaction-agent";
import { writeAtomicText } from "./transaction-fs";
import { transactionPaths } from "./transaction-layout";
import { mirrorCurrent, noteForWorking, stageRevision, svgBytes } from "./transaction-publish";
import { writeCommitted, writeState } from "./transaction-state";
import type { TransactionResult } from "./transaction-types";

export function bootstrapTransaction(input: {
  readonly vault: string;
  readonly project: string;
  readonly spec: VisualNoteSpec;
  readonly scene: ExcalidrawScene;
}): TransactionResult {
  const paths = transactionPaths(input.vault, input.project, input.spec.artifactId);
  mkdirSync(paths.historyRoot, { recursive: true });
  const token = "cas-0";
  const workingPath = paths.workingPath(token);
  const note = noteForWorking(input.vault, paths, input.spec, workingPath, []);
  const svg = svgBytes(input.spec, input.scene);
  writeAtomicText(workingPath, encodeSceneToMarkdown(input.scene));
  const state = {
    schemaVersion: 1,
    committedToken: token,
    revisionPath: paths.revisionPath(token),
    workingPath,
    agentBaseHash: agentBaseHashLegacy(input.scene),
    sceneGeneration: 0,
  } as const;
  stageRevision(
    paths.revisionPath(token),
    {
      token,
      previousToken: token,
      revision: input.spec.revision,
      sceneGeneration: state.sceneGeneration,
      sourceReceipt: fileReceipt(workingPath, 0),
    },
    input.spec,
    note,
    svg,
    input.scene,
    "legacy",
  );
  writeState(paths.statePath, state);
  mirrorCurrent(paths, input.spec, note, svg);
  writeCommitted(paths.committedPath, {
    schemaVersion: 1,
    token,
    revisionPath: state.revisionPath,
    workingPath,
    agentBaseHash: state.agentBaseHash,
    sceneGeneration: state.sceneGeneration,
  });
  return {
    committedToken: token,
    revisionPath: state.revisionPath,
    workingPath,
    deprecatedAnchors: [],
    sceneGeneration: 0,
  };
}
