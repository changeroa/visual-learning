import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { InputError } from "./errors";
import { readJson } from "./io";
import { generateTemplateBundle } from "./template-generate";
import { parseTemplateBundle } from "./template-schema";

const bootstrapReceiptPrefix = "bootstrap:";

function hasExpectedBootstrapRevision(projectRoot: string, artifactId: string): boolean {
  const metadataPath = join(
    projectRoot,
    "_history",
    artifactId,
    "revisions",
    "cas-0",
    "metadata.json",
  );
  if (!existsSync(metadataPath)) return false;
  const metadata = readJson(metadataPath) as {
    sourceReceipt?: { inode?: string; generation?: string };
  };
  return (
    metadata.sourceReceipt?.inode?.startsWith(bootstrapReceiptPrefix) === true &&
    metadata.sourceReceipt?.generation?.startsWith(bootstrapReceiptPrefix) === true
  );
}

export function currentProjectState(input: {
  readonly vault: string;
  readonly project: string;
  readonly metadata: { readonly root: string; readonly commit: string | null };
  readonly bundlePath?: string;
}): { readonly status: "ALREADY_CURRENT"; readonly artifactCount: number } | null {
  const projectRoot = join(input.vault, "Engineering Atlas/10 Projects", input.project);
  if (!existsSync(projectRoot)) return null;
  const status = lstatSync(projectRoot);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new InputError(`dirty target collision: ${projectRoot}`);
  }
  const sourceJson = join(projectRoot, "_generated/specs/source.json");
  if (!existsSync(sourceJson)) throw new InputError(`dirty target collision: ${projectRoot}`);
  const observed = readJson(sourceJson) as { source?: { root?: string; commit?: string | null } };
  if (
    observed.source?.root !== input.metadata.root ||
    observed.source?.commit !== input.metadata.commit
  ) {
    throw new InputError(`dirty target collision: ${projectRoot}`);
  }
  for (const asset of [
    "walkthrough-create.json",
    "walkthrough-extend.json",
    "walkthrough-refresh-v2.json",
  ]) {
    if (!existsSync(join(projectRoot, "_assets", asset))) {
      throw new InputError(`dirty target collision: ${projectRoot}`);
    }
  }
  if (input.bundlePath === undefined) return { status: "ALREADY_CURRENT", artifactCount: 0 };
  const bundle = parseTemplateBundle(readJson(input.bundlePath));
  const generated = generateTemplateBundle(bundle, input.metadata.root);
  for (const view of generated.views) {
    const specPath = join(projectRoot, "_generated/specs", `${view.spec.artifactId}.json`);
    if (
      !existsSync(specPath) ||
      existsSync(join(projectRoot, "_history", view.spec.artifactId, ".rwlock")) ||
      !hasExpectedBootstrapRevision(projectRoot, view.spec.artifactId)
    ) {
      return null;
    }
  }
  return { status: "ALREADY_CURRENT", artifactCount: generated.views.length };
}
