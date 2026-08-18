import { existsSync } from "node:fs";
import { isAbsolute, normalize, relative } from "node:path";
import { z } from "zod";
import { bootstrapProject } from "./bootstrap";
import { InputError, RuntimeError } from "./errors";
import { jsonBytes, readJson, sha256 } from "./io";
import { ensureMatchingVault, ensureRealDirectory } from "./path-guard";
import { preflight } from "./preflight";
import { refreshArtifact as refreshDrawing } from "./refresh";
import { renderLive } from "./renderer-live";
import { safeCreateFile, safeMakeDirectories } from "./safe-path";
import { parseVisualNoteSpec, readSourceRevision, type VisualNoteSpec } from "./schema";
import { refreshTransaction, restoreTransaction } from "./transaction-engine";
import { transactionPaths } from "./transaction-layout";
import { openTransaction } from "./transaction-verify";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function checkedVault(vault: string, expectedVault: string): string {
  return ensureMatchingVault(vault, expectedVault);
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
  readonly vault: string;
  readonly expectedVault: string;
  readonly project: string;
  readonly source: string;
}): unknown {
  const vault = checkedVault(input.vault, input.expectedVault);
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
  safeMakeDirectories(vault, `${base}/_generated/specs`);
  safeCreateFile(vault, `${base}/_generated/specs/source.json`, jsonBytes(metadata));
  for (const directory of directories) safeMakeDirectories(vault, `${base}/${directory}`);
  return { operation: "init", project: input.project, ...metadata };
}

export function bootstrapSample(input: {
  readonly vault: string;
  readonly expectedVault: string;
  readonly project: string;
  readonly source: string;
  readonly bundlePath?: string;
}): unknown {
  projectBase(input.project);
  return bootstrapProject(input);
}

export function createSpec(input: {
  readonly vault: string;
  readonly expectedVault: string;
  readonly project: string;
  readonly specPath: string;
}): unknown {
  const validated = validateSpec(input.specPath);
  const vault = checkedVault(input.vault, input.expectedVault);
  const base = projectBase(input.project);
  safeMakeDirectories(vault, `${base}/_generated/specs`);
  const relativePath = `${base}/_generated/specs/${validated.spec.artifactId}.json`;
  safeCreateFile(vault, relativePath, jsonBytes(validated.spec));
  return {
    operation: "create",
    artifactId: validated.spec.artifactId,
    revision: validated.spec.revision,
    relativePath,
    specSha256: validated.sha256,
  };
}

export function createRenderedSpec(input: {
  readonly cli: string;
  readonly vault: string;
  readonly expectedVault: string;
  readonly verifiedVaultId: string;
  readonly project: string;
  readonly specPath: string;
  readonly runtimeReceipt: string;
  readonly pluginReceipt: string;
}): unknown {
  const validated = validateSpec(input.specPath);
  const vault = checkedVault(input.vault, input.expectedVault);
  projectBase(input.project);
  return {
    operation: "create",
    artifactId: validated.spec.artifactId,
    revision: validated.spec.revision,
    ...renderLive({
      cli: input.cli,
      vault,
      verifiedVaultId: input.verifiedVaultId,
      project: input.project,
      spec: validated.spec,
      runtimeReceipt: input.runtimeReceipt,
      pluginReceipt: input.pluginReceipt,
    }),
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
  readonly vault: string;
  readonly expectedVault: string;
  readonly project: string;
  readonly specPath: string;
  readonly expectedToken: string;
}): unknown {
  const validated = validateSpec(input.specPath);
  const vault = checkedVault(input.vault, input.expectedVault);
  projectBase(input.project);
  const txPaths = transactionPaths(vault, input.project, validated.spec.artifactId);
  const result = existsSync(txPaths.statePath)
    ? refreshTransaction({
        vault,
        project: input.project,
        spec: validated.spec,
        expectedToken: input.expectedToken,
      })
    : refreshDrawing({
        vault,
        project: input.project,
        spec: validated.spec,
        expectedToken: input.expectedToken,
      });
  return { artifactId: validated.spec.artifactId, revision: validated.spec.revision, ...result };
}

export function restoreArtifact(input: {
  readonly vault: string;
  readonly expectedVault: string;
  readonly project: string;
  readonly artifactId: string;
  readonly revisionToken: string;
  readonly expectedToken: string;
}): unknown {
  const vault = checkedVault(input.vault, input.expectedVault);
  projectBase(input.project);
  return {
    operation: "restore",
    artifactId: input.artifactId,
    ...restoreTransaction({
      vault,
      project: input.project,
      artifactId: input.artifactId,
      revisionToken: input.revisionToken,
      expectedToken: input.expectedToken,
    }),
  };
}

export function openWorkingArtifact(
  cli: string,
  vault: string,
  expectedVault: string,
  project: string,
  artifactId: string,
): unknown {
  const checked = checkedVault(vault, expectedVault);
  const opened = openTransaction(checked, project, artifactId);
  return openVaultPath(cli, expectedVault, relative(checked, opened.state.workingPath));
}

export function openVaultPath(cli: string, expectedVault: string, path: string): unknown {
  if (
    isAbsolute(path) ||
    normalize(path) !== path ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new InputError("--path must be normalized and vault-relative");
  }
  preflight(cli, expectedVault);
  const result = Bun.spawnSync([cli, `vault=${expectedVault}`, "open", `path=${path}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0)
    throw new RuntimeError(result.stderr.toString().trim() || `open exited ${result.exitCode}`);
  return { operation: "open", path, opened: true };
}
