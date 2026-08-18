import { readFileSync } from "node:fs";
import { RuntimeError } from "./errors";
import { type ExcalidrawScene, encodeSceneToMarkdown, parseSceneMarkdown } from "./excalidraw-file";
import { jsonBytes, sha256 } from "./io";
import type { VisualNoteSpec } from "./schema";
import {
  agentBaseHash,
  agentBaseHashLegacy,
  agentProjection,
  agentProjectionLegacy,
  type FileReceipt,
} from "./transaction-agent";
import { revisionFiles } from "./transaction-layout";

export type BundleHashes = {
  readonly spec: string;
  readonly note: string;
  readonly svg: string;
  readonly snapshot: string;
  readonly projection: string;
  readonly metadataPayload: string;
};

export type RevisionMetadata = {
  readonly schemaVersion: 1;
  readonly token: string;
  readonly previousToken: string;
  readonly revision: number;
  readonly sceneGeneration: number;
  readonly sourceReceipt: FileReceipt;
  readonly agentBaseHash: string;
  readonly bundleHashes: BundleHashes;
};

type RevisionContent = {
  readonly spec: string;
  readonly note: string;
  readonly svg: string;
  readonly snapshot: string;
  readonly projection: string;
};

function payload(metadata: Omit<RevisionMetadata, "bundleHashes">): string {
  return jsonBytes(metadata);
}

export type Fingerprint = "canonical" | "legacy";

export function revisionContent(
  spec: VisualNoteSpec,
  note: string,
  svg: string,
  scene: ExcalidrawScene,
  fingerprint: Fingerprint = "canonical",
): RevisionContent {
  const projection =
    fingerprint === "legacy" ? agentProjectionLegacy(scene) : agentProjection(scene);
  return {
    spec: jsonBytes(spec),
    note,
    svg,
    snapshot: encodeSceneToMarkdown(scene),
    projection: `${JSON.stringify(projection, null, 2)}\n`,
  };
}

export function fingerprintHash(scene: ExcalidrawScene, fingerprint: Fingerprint): string {
  return fingerprint === "legacy" ? agentBaseHashLegacy(scene) : agentBaseHash(scene);
}

export function metadataBytes(
  input: Omit<RevisionMetadata, "bundleHashes">,
  content: RevisionContent,
): string {
  const bundleHashes: BundleHashes = {
    spec: sha256(content.spec),
    note: sha256(content.note),
    svg: sha256(content.svg),
    snapshot: sha256(content.snapshot),
    projection: sha256(content.projection),
    metadataPayload: sha256(payload(input)),
  };
  return jsonBytes({ ...input, bundleHashes });
}

function parseMetadata(path: string): RevisionMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new RuntimeError(`BLOCKED: malformed revision metadata ${path}`);
  }
  const record = parsed as {
    schemaVersion?: unknown;
    token?: unknown;
    previousToken?: unknown;
    revision?: unknown;
    sceneGeneration?: unknown;
    agentBaseHash?: unknown;
    sourceReceipt?: unknown;
    bundleHashes?: unknown;
  };
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    record.schemaVersion !== 1 ||
    typeof record.token !== "string" ||
    typeof record.previousToken !== "string" ||
    typeof record.revision !== "number" ||
    typeof record.sceneGeneration !== "number" ||
    typeof record.agentBaseHash !== "string" ||
    typeof record.sourceReceipt !== "object" ||
    record.sourceReceipt === null ||
    typeof record.bundleHashes !== "object" ||
    record.bundleHashes === null
  ) {
    throw new RuntimeError(`BLOCKED: malformed revision metadata ${path}`);
  }
  const sourceReceipt = record.sourceReceipt as Record<string, unknown>;
  const bundleHashes = record.bundleHashes as Record<string, unknown>;
  if (
    typeof sourceReceipt["inode"] !== "string" ||
    typeof sourceReceipt["generation"] !== "string" ||
    typeof sourceReceipt["fullHash"] !== "string" ||
    typeof sourceReceipt["eventSequence"] !== "number" ||
    typeof bundleHashes["spec"] !== "string" ||
    typeof bundleHashes["note"] !== "string" ||
    typeof bundleHashes["svg"] !== "string" ||
    typeof bundleHashes["snapshot"] !== "string" ||
    typeof bundleHashes["projection"] !== "string" ||
    typeof bundleHashes["metadataPayload"] !== "string"
  ) {
    throw new RuntimeError(`BLOCKED: malformed revision metadata ${path}`);
  }
  return parsed as RevisionMetadata;
}

export function validateRevisionMetadata(path: string): RevisionMetadata {
  const files = revisionFiles(path);
  const metadata = parseMetadata(files.metadata);
  const content = {
    spec: readFileSync(files.spec, "utf8"),
    note: readFileSync(files.note, "utf8"),
    svg: readFileSync(files.svg, "utf8"),
    snapshot: readFileSync(files.snapshot, "utf8"),
    projection: readFileSync(files.projection, "utf8"),
  } as const;
  const snapshotScene = parseSceneMarkdown(content.snapshot).scene;
  const derivedProjection = `${JSON.stringify(agentProjection(snapshotScene), null, 2)}\n`;
  const derivedLegacy = `${JSON.stringify(agentProjectionLegacy(snapshotScene), null, 2)}\n`;
  if (derivedProjection !== content.projection && derivedLegacy !== content.projection)
    throw new RuntimeError(`BLOCKED: projection mismatch ${files.projection}`);
  if (
    agentBaseHash(snapshotScene) !== metadata.agentBaseHash &&
    agentBaseHashLegacy(snapshotScene) !== metadata.agentBaseHash
  )
    throw new RuntimeError(`BLOCKED: agent base hash mismatch ${files.snapshot}`);
  const expectedHashes: BundleHashes = {
    spec: sha256(content.spec),
    note: sha256(content.note),
    svg: sha256(content.svg),
    snapshot: sha256(content.snapshot),
    projection: sha256(content.projection),
    metadataPayload: sha256(
      payload({
        schemaVersion: metadata.schemaVersion,
        token: metadata.token,
        previousToken: metadata.previousToken,
        revision: metadata.revision,
        sceneGeneration: metadata.sceneGeneration,
        sourceReceipt: metadata.sourceReceipt,
        agentBaseHash: metadata.agentBaseHash,
      }),
    ),
  };
  for (const key of Object.keys(expectedHashes) as (keyof BundleHashes)[]) {
    if (metadata.bundleHashes[key] !== expectedHashes[key])
      throw new RuntimeError(`BLOCKED: revision hash mismatch ${files.metadata}#${key}`);
  }
  return metadata;
}
