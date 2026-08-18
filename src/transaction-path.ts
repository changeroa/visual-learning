import { existsSync, lstatSync } from "node:fs";
import { isAbsolute, normalize, relative } from "node:path";
import { RuntimeError } from "./errors";
import { type TransactionPaths, tokenIndex } from "./transaction-layout";
import type { BeginRecord, CommittedRecord, StateRecord } from "./transaction-state";

function blocked(label: string, path: string): RuntimeError {
  return new RuntimeError(`BLOCKED: ${label} ${path}`);
}

function assertAbsolute(path: string, label: string): void {
  if (!isAbsolute(path) || normalize(path) !== path) throw blocked(`malformed ${label}`, path);
}

function walkNoFollow(
  root: string,
  path: string,
  finalType: "file" | "directory",
  label: string,
): void {
  assertAbsolute(root, `${label} root`);
  assertAbsolute(path, label);
  const child = relative(root, path);
  if (child.length === 0) {
    const status = lstatSync(path);
    if (status.isSymbolicLink()) throw blocked(`symlinked ${label}`, path);
    if (finalType === "file" && !status.isFile()) throw blocked(`non-file ${label}`, path);
    if (finalType === "directory" && !status.isDirectory())
      throw blocked(`non-directory ${label}`, path);
    return;
  }
  const parts = child.split("/").filter((part) => part.length > 0);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = `${current}/${part}`;
    if (!existsSync(current)) throw blocked(`missing ${label}`, current);
    const status = lstatSync(current);
    if (status.isSymbolicLink()) throw blocked(`symlinked ${label}`, current);
    const final = index === parts.length - 1;
    if (!final && !status.isDirectory()) throw blocked(`non-directory ${label}`, current);
    if (final && finalType === "file" && !status.isFile())
      throw blocked(`non-file ${label}`, current);
    if (final && finalType === "directory" && !status.isDirectory())
      throw blocked(`non-directory ${label}`, current);
  }
}

function assertUnder(root: string, path: string, label: string): void {
  assertAbsolute(root, `${label} root`);
  assertAbsolute(path, label);
  const child = relative(root, path);
  if (
    child.length === 0 ||
    child.startsWith("../") ||
    child === ".." ||
    child.includes("/../") ||
    child.startsWith("..\\")
  ) {
    throw blocked(`escaped ${label}`, path);
  }
}

function assertToken(token: string, label: string): void {
  if (tokenIndex(token) < 0) throw new RuntimeError(`BLOCKED: malformed ${label} ${token}`);
}

export function assertCanonicalFile(
  path: string,
  expected: string,
  root: string,
  label: string,
): void {
  if (path !== expected) throw blocked(`${label} path mismatch`, path);
  assertUnder(root, path, label);
  walkNoFollow(root, path, "file", label);
}

export function assertCanonicalDirectory(
  path: string,
  expected: string,
  root: string,
  label: string,
): void {
  if (path !== expected) throw blocked(`${label} path mismatch`, path);
  assertUnder(root, path, label);
  walkNoFollow(root, path, "directory", label);
}

export function validateStatePaths(paths: TransactionPaths, state: StateRecord): void {
  assertToken(state.committedToken, "STATE token");
  if (!Number.isInteger(state.sceneGeneration) || state.sceneGeneration < 0)
    throw new RuntimeError(`BLOCKED: malformed sceneGeneration ${state.sceneGeneration}`);
  assertCanonicalDirectory(
    state.revisionPath,
    paths.revisionPath(state.committedToken),
    paths.revisionsRoot,
    "STATE revisionPath",
  );
  assertCanonicalFile(
    state.workingPath,
    paths.workingPath(state.committedToken),
    paths.workingRoot,
    "STATE workingPath",
  );
}

export function validateBeginPaths(paths: TransactionPaths, begin: BeginRecord): void {
  assertToken(begin.token, "BEGIN token");
  assertToken(begin.previousToken, "BEGIN previousToken");
  assertCanonicalFile(
    begin.sourcePath,
    paths.workingPath(begin.previousToken),
    paths.workingRoot,
    "BEGIN sourcePath",
  );
}

export function validateCommittedPaths(paths: TransactionPaths, committed: CommittedRecord): void {
  assertToken(committed.token, "COMMITTED token");
  if (!Number.isInteger(committed.sceneGeneration) || committed.sceneGeneration < 0)
    throw new RuntimeError(
      `BLOCKED: malformed COMMITTED sceneGeneration ${committed.sceneGeneration}`,
    );
  assertCanonicalDirectory(
    committed.revisionPath,
    paths.revisionPath(committed.token),
    paths.revisionsRoot,
    "COMMITTED revisionPath",
  );
  assertCanonicalFile(
    committed.workingPath,
    paths.workingPath(committed.token),
    paths.workingRoot,
    "COMMITTED workingPath",
  );
}
