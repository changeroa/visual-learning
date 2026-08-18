import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { CollisionError, InputError } from "./errors";
import { jsonBytes, readJson, sha256 } from "./io";

const bootstrapReceiptPrefix = "bootstrap:";

type BootstrapMetadata = {
  readonly schemaVersion: 1;
  readonly token: string;
  readonly previousToken: string;
  readonly revision: number;
  readonly sceneGeneration: number;
  readonly sourceReceipt: {
    readonly inode: string;
    readonly generation: string;
    readonly fullHash: string;
    readonly eventSequence: number;
  };
  readonly agentBaseHash: string;
  readonly bundleHashes: {
    readonly spec: string;
    readonly note: string;
    readonly svg: string;
    readonly snapshot: string;
    readonly projection: string;
    readonly metadataPayload: string;
  };
};

function normalizedBootstrapReceipt(
  projectRoot: string,
  artifactId: string,
  token: string,
): {
  readonly inode: string;
  readonly generation: string;
  readonly fullHash: string;
  readonly eventSequence: number;
} {
  const workingRelative = join(
    "_generated/drawings",
    `${artifactId}.working.${token}.excalidraw.md`,
  );
  const bytes = readFileSync(join(projectRoot, workingRelative));
  const fullHash = sha256(bytes);
  return {
    inode: `${bootstrapReceiptPrefix}${sha256(workingRelative)}`,
    generation: `${bootstrapReceiptPrefix}${sha256(`${workingRelative}:${bytes.byteLength}:${fullHash}`)}`,
    fullHash,
    eventSequence: 0,
  };
}

function normalizeHistoryRecords(projectRoot: string): void {
  const historyRoot = join(projectRoot, "_history");
  try {
    for (const entry of readdirSync(historyRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const artifactRoot = join(historyRoot, entry.name);
      for (const name of ["STATE", "COMMITTED", "BEGIN"] as const) {
        const recordPath = join(artifactRoot, name);
        if (!lstatSync(recordPath, { throwIfNoEntry: false })?.isFile()) continue;
        const record = readJson(recordPath) as Record<string, unknown>;
        for (const field of ["revisionPath", "workingPath", "sourcePath"] as const) {
          const value = record[field];
          if (typeof value === "string" && value.startsWith(projectRoot)) {
            record[field] = value.slice(projectRoot.length + 1);
          }
        }
        writeFileSync(recordPath, jsonBytes(record));
      }
      const metadataPath = join(artifactRoot, "revisions", "cas-0", "metadata.json");
      const metadata = readJson(metadataPath) as BootstrapMetadata;
      if (metadata.token !== metadata.previousToken) continue;
      const sourceReceipt = normalizedBootstrapReceipt(projectRoot, entry.name, metadata.token);
      writeFileSync(
        metadataPath,
        jsonBytes({
          ...metadata,
          sourceReceipt,
          bundleHashes: {
            ...metadata.bundleHashes,
            metadataPayload: sha256(
              jsonBytes({
                schemaVersion: metadata.schemaVersion,
                token: metadata.token,
                previousToken: metadata.previousToken,
                revision: metadata.revision,
                sceneGeneration: metadata.sceneGeneration,
                sourceReceipt,
                agentBaseHash: metadata.agentBaseHash,
              }),
            ),
          },
        }),
      );
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

export function stripLockResidue(root: string): void {
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".rwlock") {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
        visit(path);
      }
    }
  };
  visit(root);
}

function sanitizeProjectTree(root: string): void {
  stripLockResidue(root);
  normalizeHistoryRecords(root);
}

function fileHash(path: string): string {
  return sha256(readFileSync(path));
}

function walk(root: string): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const status = lstatSync(path);
      if (status.isSymbolicLink()) throw new InputError(`symlink rejected: ${path}`);
      if (status.isDirectory()) {
        visit(path);
        continue;
      }
      if (!status.isFile()) throw new InputError(`special file rejected: ${path}`);
      files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
}

function sameDirectory(left: string, right: string): boolean {
  const leftFiles = walk(left);
  const rightFiles = walk(right);
  if (leftFiles.length !== rightFiles.length) return false;
  return leftFiles.every(
    (file, index) =>
      file === rightFiles[index] && fileHash(join(left, file)) === fileHash(join(right, file)),
  );
}

export function publishProjectDirectory(
  stageProject: string,
  targetProject: string,
): {
  readonly status: "CREATED" | "ALREADY_CURRENT";
  readonly targetProject: string;
} {
  sanitizeProjectTree(stageProject);
  mkdirSync(dirname(targetProject), { recursive: true });
  try {
    renameSync(stageProject, targetProject);
    return { status: "CREATED", targetProject };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
  }
  const status = lstatSync(targetProject);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new CollisionError(targetProject);
  }
  sanitizeProjectTree(targetProject);
  if (!sameDirectory(stageProject, targetProject)) throw new CollisionError(targetProject);
  rmSync(stageProject, { recursive: true, force: true });
  return { status: "ALREADY_CURRENT", targetProject };
}
