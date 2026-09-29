import { existsSync } from "node:fs";
import { z } from "zod";
import { bootstrapProject } from "./bootstrap";
import { jsonBytes, readJson, sha256 } from "./io";
import { ensureRealDirectory } from "./path-guard";
import { refreshArtifact as refreshDrawing } from "./refresh";
import { safeCreateFile, safeMakeDirectories } from "./safe-path";
import { parseVisualNoteSpec, type VisualNoteSpec } from "./schema";
import { readSourceRevision } from "./source-revision";
import { refreshTransaction, restoreTransaction } from "./transaction-engine";
import { transactionPaths } from "./transaction-layout";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function checkedRoot(root: string): string {
  return ensureRealDirectory(root, "root");
}

function projectBase(project: string): string {
  return `Engineering Atlas/10 Projects/${slugSchema.parse(project)}`;
}

export function validateSpec(path: string): {
  readonly spec: VisualNoteSpec;
  readonly sha256: string;
} {
  const spec = parseVisualNoteSpec(readJson(path));
  const bytes = jsonBytes(spec);
  return { spec, sha256: sha256(bytes) };
}

export function initializeProject(input: {
  readonly root: string;
  readonly project: string;
  readonly source: string;
}): unknown {
  const root = checkedRoot(input.root);
  const source = ensureRealDirectory(input.source, "source");
  const base = projectBase(input.project);
  const directories = [
    "01 Architecture",
    "02 ADR",
    "03 API",
    "04 Workflows",
    "05 Study Notes",
    "_generated/drawings",
    "_history",
    "_assets",
  ];
  const metadata = {
    schemaVersion: 1,
    source: { root: source, commit: readSourceRevision(source) },
  } as const;
  safeMakeDirectories(root, `${base}/_generated/specs`);
  safeCreateFile(root, `${base}/_generated/specs/source.json`, jsonBytes(metadata));
  for (const directory of directories) safeMakeDirectories(root, `${base}/${directory}`);
  return { operation: "init", project: input.project, ...metadata };
}

export function bootstrapSample(input: {
  readonly root: string;
  readonly project: string;
  readonly source: string;
  readonly bundlePath?: string;
}): unknown {
  projectBase(input.project);
  return bootstrapProject(input);
}

export function createSpec(input: {
  readonly root: string;
  readonly project: string;
  readonly specPath: string;
}): unknown {
  const validated = validateSpec(input.specPath);
  const root = checkedRoot(input.root);
  const base = projectBase(input.project);
  safeMakeDirectories(root, `${base}/_generated/specs`);
  const relativePath = `${base}/_generated/specs/${validated.spec.artifactId}.json`;
  safeCreateFile(root, relativePath, jsonBytes(validated.spec));
  return {
    operation: "create",
    artifactId: validated.spec.artifactId,
    revision: validated.spec.revision,
    relativePath,
    specSha256: validated.sha256,
  };
}

export function inspectSpec(
  operation: "extend" | "refresh" | "restore",
  specPath: string,
): unknown {
  const validated = validateSpec(specPath);
  return {
    operation,
    contractDepth: 4,
    mutation: "deferred-to-renderer-transaction-todos",
    artifactId: validated.spec.artifactId,
    revision: validated.spec.revision,
    specSha256: validated.sha256,
  };
}

export function refreshSpec(input: {
  readonly root: string;
  readonly project: string;
  readonly specPath: string;
  readonly expectedToken: string;
}): unknown {
  const validated = validateSpec(input.specPath);
  const root = checkedRoot(input.root);
  projectBase(input.project);
  const txPaths = transactionPaths(root, input.project, validated.spec.artifactId);
  const result = existsSync(txPaths.statePath)
    ? refreshTransaction({
        vault: root,
        project: input.project,
        spec: validated.spec,
        expectedToken: input.expectedToken,
      })
    : refreshDrawing({
        vault: root,
        project: input.project,
        spec: validated.spec,
        expectedToken: input.expectedToken,
      });
  return { artifactId: validated.spec.artifactId, revision: validated.spec.revision, ...result };
}

export function restoreArtifact(input: {
  readonly root: string;
  readonly project: string;
  readonly artifactId: string;
  readonly revisionToken: string;
  readonly expectedToken: string;
}): unknown {
  const root = checkedRoot(input.root);
  projectBase(input.project);
  return {
    operation: "restore",
    artifactId: input.artifactId,
    ...restoreTransaction({
      vault: root,
      project: input.project,
      artifactId: input.artifactId,
      revisionToken: input.revisionToken,
      expectedToken: input.expectedToken,
    }),
  };
}
