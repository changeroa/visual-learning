import { join } from "node:path";
import { artifactPaths } from "./artifact-files";

export type TransactionPaths = {
  readonly historyRoot: string;
  readonly statePath: string;
  readonly beginPath: string;
  readonly committedPath: string;
  readonly burnedRoot: string;
  readonly revisionsRoot: string;
  readonly workingRoot: string;
  readonly lockRoot: string;
  readonly stableSpecPath: string;
  readonly stableNotePath: string;
  readonly stableSvgPath: string;
  revisionPath(token: string): string;
  workingPath(token: string): string;
};

export function transactionPaths(
  vault: string,
  project: string,
  artifactId: string,
): TransactionPaths {
  const artifact = artifactPaths(project, artifactId);
  const historyRoot = join(vault, artifact.base, "_history", artifactId);
  const workingRoot = join(vault, artifact.drawingFolder);
  return {
    historyRoot,
    statePath: join(historyRoot, "STATE"),
    beginPath: join(historyRoot, "BEGIN"),
    committedPath: join(historyRoot, "COMMITTED"),
    burnedRoot: join(historyRoot, "burned"),
    revisionsRoot: join(historyRoot, "revisions"),
    workingRoot,
    lockRoot: join(historyRoot, ".rwlock"),
    stableSpecPath: join(vault, artifact.spec),
    stableNotePath: join(vault, artifact.note),
    stableSvgPath: join(vault, artifact.svg),
    revisionPath(token: string): string {
      return join(historyRoot, "revisions", token);
    },
    workingPath(token: string): string {
      return join(workingRoot, `${artifactId}.working.${token}.excalidraw.md`);
    },
  };
}

export function revisionFiles(path: string): {
  readonly spec: string;
  readonly note: string;
  readonly svg: string;
  readonly snapshot: string;
  readonly projection: string;
  readonly metadata: string;
} {
  return {
    spec: join(path, "spec.json"),
    note: join(path, "note.md"),
    svg: join(path, "export.svg"),
    snapshot: join(path, "snapshot.excalidraw.md"),
    projection: join(path, "agent-projection.json"),
    metadata: join(path, "metadata.json"),
  };
}

export function tokenIndex(token: string): number {
  const match = /^cas-(\d+)$/.exec(token);
  return match === null ? -1 : Number(match[1]);
}
