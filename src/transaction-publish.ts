import { noteBytes } from "./artifact-files";
import type { ExcalidrawScene } from "./excalidraw-file";
import { jsonBytes } from "./io";
import type { VisualNoteSpec } from "./schema";
import {
  ensureDirectory,
  fsyncDirectory,
  writeAtomicText,
  writeTextFsynced,
} from "./transaction-fs";
import { revisionFiles, type TransactionPaths } from "./transaction-layout";
import {
  type Fingerprint,
  fingerprintHash,
  metadataBytes,
  type RevisionMetadata,
  revisionContent,
} from "./transaction-metadata";

export function svgBytes(spec: VisualNoteSpec, scene: ExcalidrawScene): string {
  return `<svg data-artifact="${spec.artifactId}" data-revision="${spec.revision}" data-elements="${scene.elements.length}"></svg>\n`;
}

export function stageRevision(
  path: string,
  metadata: Omit<
    RevisionMetadata,
    "schemaVersion" | "bundleHashes" | "revision" | "agentBaseHash"
  > & {
    readonly revision: number;
  },
  spec: VisualNoteSpec,
  note: string,
  svg: string,
  scene: ExcalidrawScene,
  fingerprint: Fingerprint = "canonical",
): void {
  ensureDirectory(path);
  const files = revisionFiles(path);
  const content = revisionContent(spec, note, svg, scene, fingerprint);
  const metadataBytesValue = metadataBytes(
    { schemaVersion: 1, ...metadata, agentBaseHash: fingerprintHash(scene, fingerprint) },
    content,
  );
  writeTextFsynced(files.spec, content.spec);
  writeTextFsynced(files.note, content.note);
  writeTextFsynced(files.svg, content.svg);
  writeTextFsynced(files.snapshot, content.snapshot);
  writeTextFsynced(files.projection, content.projection);
  writeTextFsynced(files.metadata, metadataBytesValue);
  fsyncDirectory(path);
}

export function noteForWorking(
  vault: string,
  paths: TransactionPaths,
  spec: VisualNoteSpec,
  workingPath: string,
  deprecatedAnchors: readonly string[],
): string {
  return noteBytes(
    spec,
    workingPath.slice(vault.length + 1),
    paths.stableSvgPath.slice(vault.length + 1),
    deprecatedAnchors,
  );
}

export function mirrorCurrent(
  paths: TransactionPaths,
  spec: VisualNoteSpec,
  note: string,
  svg: string,
): void {
  writeAtomicText(paths.stableSpecPath, jsonBytes(spec));
  writeAtomicText(paths.stableNotePath, note);
  writeAtomicText(paths.stableSvgPath, svg);
}
