import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { RuntimeError } from "./errors";
import { jsonBytes, sha256 } from "./io";
import type { FileReceipt } from "./transaction-agent";
import { writeJsonAtomic } from "./transaction-fs";
import { type TransactionPaths, tokenIndex } from "./transaction-layout";
import { type RevisionMetadata, validateRevisionMetadata } from "./transaction-metadata";

export type StateRecord = {
  readonly schemaVersion: 1;
  readonly committedToken: string;
  readonly revisionPath: string;
  readonly workingPath: string;
  readonly agentBaseHash: string;
  readonly sceneGeneration: number;
};

export type BeginRecord = {
  readonly schemaVersion: 1;
  readonly token: string;
  readonly previousToken: string;
  readonly previousStateDigest: string;
  readonly previousSceneGeneration: number;
  readonly sourcePath: string;
  readonly sourceReceipt: FileReceipt;
};

export type CommittedRecord = {
  readonly schemaVersion: 1;
  readonly token: string;
  readonly revisionPath: string;
  readonly workingPath: string;
  readonly agentBaseHash: string;
  readonly sceneGeneration: number;
};

function parseRecord(path: string, label: "STATE" | "BEGIN" | "COMMITTED"): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new RuntimeError(`BLOCKED: malformed ${label} at ${path}`);
  }
}

function readOptional(path: string, label: "BEGIN" | "COMMITTED"): unknown | null {
  return existsSync(path) ? parseRecord(path, label) : null;
}

function isReceipt(value: unknown): value is FileReceipt {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { inode?: unknown }).inode === "string" &&
    typeof (value as { generation?: unknown }).generation === "string" &&
    typeof (value as { fullHash?: unknown }).fullHash === "string" &&
    typeof (value as { eventSequence?: unknown }).eventSequence === "number"
  );
}

function projectRoot(recordPath: string): string {
  return dirname(dirname(dirname(recordPath)));
}

function toAbsolute(recordPath: string, value: string): string {
  return isAbsolute(value) ? value : resolve(projectRoot(recordPath), value);
}

function toRelative(recordPath: string, value: string): string {
  return value.startsWith(projectRoot(recordPath))
    ? value.slice(projectRoot(recordPath).length + 1)
    : value;
}

export function stateDigest(state: StateRecord): string {
  return sha256(jsonBytes(state));
}

export function readState(path: string): StateRecord {
  if (!existsSync(path)) throw new RuntimeError(`BLOCKED: missing STATE at ${path}`);
  const parsed = parseRecord(path, "STATE");
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    typeof (parsed as { committedToken?: unknown }).committedToken !== "string" ||
    typeof (parsed as { revisionPath?: unknown }).revisionPath !== "string" ||
    typeof (parsed as { workingPath?: unknown }).workingPath !== "string" ||
    typeof (parsed as { agentBaseHash?: unknown }).agentBaseHash !== "string" ||
    typeof (parsed as { sceneGeneration?: unknown }).sceneGeneration !== "number"
  ) {
    throw new RuntimeError(`BLOCKED: malformed STATE at ${path}`);
  }
  const state = parsed as StateRecord;
  return {
    ...state,
    revisionPath: toAbsolute(path, state.revisionPath),
    workingPath: toAbsolute(path, state.workingPath),
  };
}

export function writeState(path: string, state: StateRecord): void {
  writeJsonAtomic(path, {
    ...state,
    revisionPath: toRelative(path, state.revisionPath),
    workingPath: toRelative(path, state.workingPath),
  });
}

export function readBegin(path: string): BeginRecord | null {
  const parsed = readOptional(path, "BEGIN");
  if (parsed === null) return null;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    typeof (parsed as { token?: unknown }).token !== "string" ||
    typeof (parsed as { previousToken?: unknown }).previousToken !== "string" ||
    typeof (parsed as { previousStateDigest?: unknown }).previousStateDigest !== "string" ||
    typeof (parsed as { previousSceneGeneration?: unknown }).previousSceneGeneration !== "number" ||
    typeof (parsed as { sourcePath?: unknown }).sourcePath !== "string" ||
    !isReceipt((parsed as { sourceReceipt?: unknown }).sourceReceipt)
  ) {
    throw new RuntimeError(`BLOCKED: malformed BEGIN at ${path}`);
  }
  const begin = parsed as BeginRecord;
  return { ...begin, sourcePath: toAbsolute(path, begin.sourcePath) };
}

export function writeBegin(path: string, value: BeginRecord): void {
  writeJsonAtomic(path, { ...value, sourcePath: toRelative(path, value.sourcePath) });
}

export function readCommitted(path: string): CommittedRecord | null {
  const parsed = readOptional(path, "COMMITTED");
  if (parsed === null) return null;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    typeof (parsed as { token?: unknown }).token !== "string" ||
    typeof (parsed as { revisionPath?: unknown }).revisionPath !== "string" ||
    typeof (parsed as { workingPath?: unknown }).workingPath !== "string" ||
    typeof (parsed as { agentBaseHash?: unknown }).agentBaseHash !== "string" ||
    typeof (parsed as { sceneGeneration?: unknown }).sceneGeneration !== "number"
  ) {
    throw new RuntimeError(`BLOCKED: malformed COMMITTED at ${path}`);
  }
  const committed = parsed as CommittedRecord;
  return {
    ...committed,
    revisionPath: toAbsolute(path, committed.revisionPath),
    workingPath: toAbsolute(path, committed.workingPath),
  };
}

export function writeCommitted(path: string, value: CommittedRecord): void {
  writeJsonAtomic(path, {
    ...value,
    revisionPath: toRelative(path, value.revisionPath),
    workingPath: toRelative(path, value.workingPath),
  });
}

export function nextToken(paths: TransactionPaths, state: StateRecord): string {
  const numbers = [tokenIndex(state.committedToken)];
  for (const root of [paths.revisionsRoot, paths.burnedRoot]) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) numbers.push(tokenIndex(entry.replace(/\.json$/, "")));
  }
  const begin = readBegin(paths.beginPath);
  if (begin !== null) numbers.push(tokenIndex(begin.token));
  const committed = readCommitted(paths.committedPath);
  if (committed !== null) numbers.push(tokenIndex(committed.token));
  return `cas-${Math.max(...numbers, -1) + 1}`;
}

export function burnToken(paths: TransactionPaths, token: string, reason: string): void {
  writeJsonAtomic(join(paths.burnedRoot, `${token}.json`), {
    schemaVersion: 1,
    token,
    reason,
  });
}

export function validateRevisionBundle(path: string): RevisionMetadata {
  return validateRevisionMetadata(path);
}
