import { lstatSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { ConflictError, RuntimeError } from "./errors";
import {
  type ExcalidrawElement,
  type ExcalidrawScene,
  type JsonValue,
  parseSceneMarkdown,
} from "./excalidraw-file";
import { sha256 } from "./io";

export type FileReceipt = {
  readonly inode: string;
  readonly generation: string;
  readonly fullHash: string;
  readonly eventSequence: number;
};

function stable(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => stable(entry));
  if (typeof value !== "object" || value === null) return value;
  const next: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(value).sort()) next[key] = stable(value[key]);
  return next;
}

const PROJECTED_FIELDS = [
  "id",
  "type",
  "strokeColor",
  "backgroundColor",
  "strokeStyle",
  "strokeWidth",
  "fillStyle",
  "points",
] as const;

/**
 * Legacy fingerprint (pre task-12): hashes the complete sorted agent element.
 * Kept only to validate immutable revision bundles recorded by older commits.
 */
function legacyElement(element: ExcalidrawElement): JsonValue {
  const owner = element.customData?.["owner"];
  if (owner !== "agent") return undefined;
  return stable(element);
}

/**
 * Canonical agent-owned projection (task-12 contract): the fields a commit
 * represents and re-asserts (identity, ownership metadata, style, text
 * content, arrow points). Editor-volatile bookkeeping (index, version,
 * versionNonce, updated, seed), re-measured text geometry, and human
 * interaction surfaces (bindings, groups, links, locks) are excluded so the
 * projection remains stable across legitimate human-only saves while still
 * detecting real agent-base corruption.
 */
function projectElement(element: ExcalidrawElement): JsonValue {
  const owner = element.customData?.["owner"];
  if (owner !== "agent") return undefined;
  const projection: { [key: string]: JsonValue } = {};
  for (const field of PROJECTED_FIELDS)
    if (element[field] !== undefined) projection[field] = stable(element[field]);
  projection["customData"] = stable(element.customData ?? null);
  const content = element.rawText ?? element.originalText ?? element.text;
  if (content !== undefined) projection["text"] = stable(content);
  return stable(projection);
}

function projectionOf(
  scene: ExcalidrawScene,
  normalize: (element: ExcalidrawElement) => JsonValue,
): readonly JsonValue[] {
  return scene.elements
    .map((element) => ({ id: element.id, value: normalize(element) }))
    .filter((entry) => entry.value !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => entry.value);
}

export function agentProjection(scene: ExcalidrawScene): readonly JsonValue[] {
  return projectionOf(scene, projectElement);
}

export function agentProjectionLegacy(scene: ExcalidrawScene): readonly JsonValue[] {
  return projectionOf(scene, legacyElement);
}

export function agentBaseHash(scene: ExcalidrawScene): string {
  return sha256(JSON.stringify(agentProjection(scene)));
}

export function agentBaseHashLegacy(scene: ExcalidrawScene): string {
  return sha256(JSON.stringify(agentProjectionLegacy(scene)));
}

export function agentProjectionsEqual(left: ExcalidrawScene, right: ExcalidrawScene): boolean {
  return JSON.stringify(agentProjection(left)) === JSON.stringify(agentProjection(right));
}

export function readScene(path: string): ExcalidrawScene {
  return parseSceneMarkdown(readFileSync(path, "utf8")).scene;
}

export function fileReceipt(path: string, eventSequence: number): FileReceipt {
  const status = lstatSync(path, { bigint: true });
  return {
    inode: status.ino.toString(),
    generation: `${status.mtimeNs}:${status.size}`,
    fullHash: sha256(readFileSync(path)),
    eventSequence,
  };
}

export function sameReceipt(left: FileReceipt, right: FileReceipt): boolean {
  return (
    left.inode === right.inode &&
    left.generation === right.generation &&
    left.fullHash === right.fullHash &&
    left.eventSequence === right.eventSequence
  );
}

export function validateReadableWorking(
  path: string,
  committedSnapshotPath: string,
): ExcalidrawScene {
  const scene = readScene(path);
  if (!agentProjectionsEqual(scene, readScene(committedSnapshotPath)))
    throw new RuntimeError(`BLOCKED: agent base hash mismatch for ${basename(path)}`);
  return scene;
}

export function assertCasUnchanged(before: FileReceipt, after: FileReceipt, label: string): void {
  if (!sameReceipt(before, after)) throw new ConflictError(`source CAS changed at ${label}`);
}
