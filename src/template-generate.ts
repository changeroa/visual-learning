import { InputError } from "./errors";
import { resolveEvidence } from "./evidence-resolver";
import { parseVisualNoteSpec, type VisualNoteSpec } from "./schema";
import type {
  TemplateArtifact,
  TemplateBundle,
  TemplateClaim,
  TemplateEdge,
} from "./template-schema";
import { type ClaimStyle, styleForClaim } from "./template-style";

const DEFAULT_CORE_SIZE = 4;

export type GeneratedView = {
  readonly viewId: string;
  readonly artifactId: string;
  readonly kind: VisualNoteSpec["kind"];
  readonly title: string;
  readonly spec: VisualNoteSpec;
  readonly relatedViewIds: readonly string[];
  readonly styles: readonly ClaimStyle[];
  readonly split: {
    readonly coreNodeIds: readonly string[];
    readonly duplicateNodeIds: readonly string[];
    readonly edgeIds: readonly string[];
  };
};

export type GeneratedBundle = {
  readonly bundleId: string;
  readonly project: string;
  readonly repositoryRoot: string;
  readonly views: readonly GeneratedView[];
  readonly coverage: {
    readonly nodeIds: readonly string[];
    readonly edgeIds: readonly string[];
    readonly complete: true;
  };
};

function labelForClaim(claim: TemplateClaim | TemplateEdge): string {
  return `${claim.identifier}\n${claim.explanationKo}`;
}

function titleForView(artifact: TemplateArtifact, suffix: string | null): string {
  return `${artifact.titleKo} (${artifact.titleEn})${suffix === null ? "" : ` - ${suffix}`}`;
}

function chunk<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function orderedNodeIds(artifact: TemplateArtifact): readonly string[] {
  return [...artifact.nodes]
    .sort((left, right) => left.semanticId.localeCompare(right.semanticId))
    .map((node) => node.semanticId);
}

function buildStyles(
  nodes: readonly TemplateClaim[],
  edges: readonly TemplateEdge[],
): readonly ClaimStyle[] {
  return [...nodes, ...edges]
    .map((claim) => styleForClaim(claim.semanticId, claim.status, claim.confidence))
    .sort((left, right) => left.semanticId.localeCompare(right.semanticId));
}

function buildSpec(
  artifact: TemplateArtifact,
  repositoryRoot: string,
  artifactId: string,
  title: string,
  nodes: readonly TemplateClaim[],
  edges: readonly TemplateEdge[],
): VisualNoteSpec {
  for (const claim of [...nodes, ...edges]) {
    if (claim.status === "fact") resolveEvidence(repositoryRoot, claim.evidence);
  }
  return parseVisualNoteSpec({
    schemaVersion: 1,
    artifactId,
    kind: artifact.kind,
    revision: 1,
    title,
    source: { root: repositoryRoot, commit: null },
    nodes: nodes.map((node) => ({
      semanticId: node.semanticId,
      label: labelForClaim(node),
      status: node.status,
      evidence: node.evidence,
    })),
    edges: edges.map((edge) => ({
      semanticId: edge.semanticId,
      from: edge.from,
      to: edge.to,
      label: labelForClaim(edge),
      status: edge.status,
      evidence: edge.evidence,
    })),
  });
}

function viewsForArtifact(
  artifact: TemplateArtifact,
  repositoryRoot: string,
): readonly GeneratedView[] {
  const nodeById = new Map<string, TemplateClaim>(
    artifact.nodes.map((node) => [node.semanticId, node]),
  );
  const ordered = orderedNodeIds(artifact);
  const maxViewNodes = artifact.maxViewNodes;
  const coreSize = Math.min(DEFAULT_CORE_SIZE, maxViewNodes - 1);
  const cores = ordered.length <= maxViewNodes ? [ordered] : chunk(ordered, coreSize);
  const partial = cores.map((coreIds, index) => {
    const core = new Set<string>(coreIds);
    const includedEdges = artifact.edges.filter((edge) => core.has(edge.from) || core.has(edge.to));
    const nodeIds = new Set(coreIds);
    for (const edge of includedEdges) {
      nodeIds.add(edge.from);
      nodeIds.add(edge.to);
    }
    if (nodeIds.size > maxViewNodes) {
      throw new InputError(
        `dense split exceeds max view size for ${artifact.artifactId} view ${index + 1}`,
      );
    }
    const nodes = [...nodeIds]
      .sort((left, right) => left.localeCompare(right))
      .map((semanticId) => {
        const node = nodeById.get(semanticId);
        if (node === undefined) throw new TypeError(`missing template node: ${semanticId}`);
        return node;
      });
    const viewId =
      cores.length === 1
        ? artifact.artifactId
        : `${artifact.artifactId}-view-${String(index + 1).padStart(2, "0")}`;
    return {
      viewId,
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      title: titleForView(artifact, cores.length === 1 ? null : `분할 ${index + 1}`),
      spec: buildSpec(
        artifact,
        repositoryRoot,
        viewId,
        titleForView(artifact, cores.length === 1 ? null : `분할 ${index + 1}`),
        nodes,
        includedEdges,
      ),
      relatedViewIds: [] as readonly string[],
      styles: buildStyles(nodes, includedEdges),
      split: {
        coreNodeIds: [...coreIds],
        duplicateNodeIds: nodes
          .map((node) => node.semanticId)
          .filter((semanticId) => !core.has(semanticId)),
        edgeIds: includedEdges.map((edge) => edge.semanticId).sort(),
      },
    } satisfies GeneratedView;
  });
  return partial.map((view) => ({
    ...view,
    relatedViewIds: partial
      .filter(
        (candidate) =>
          candidate.viewId !== view.viewId &&
          candidate.spec.nodes.some((node) =>
            view.spec.nodes.some((current) => current.semanticId === node.semanticId),
          ),
      )
      .map((candidate) => candidate.viewId)
      .sort(),
  }));
}

function validateCoverage(
  bundle: TemplateBundle,
  views: readonly GeneratedView[],
): GeneratedBundle["coverage"] {
  const nodeIds = new Set(views.flatMap((view) => view.split.coreNodeIds));
  const edgeIds = new Set(views.flatMap((view) => view.split.edgeIds));
  const expectedNodes = bundle.artifacts.flatMap((artifact) =>
    artifact.nodes.map((node) => node.semanticId),
  );
  const expectedEdges = bundle.artifacts.flatMap((artifact) =>
    artifact.edges.map((edge) => edge.semanticId),
  );
  if (expectedNodes.some((semanticId) => !nodeIds.has(semanticId))) {
    throw new InputError(`split lost node coverage in ${bundle.bundleId}`);
  }
  if (expectedEdges.some((semanticId) => !edgeIds.has(semanticId))) {
    throw new InputError(`split lost edge coverage in ${bundle.bundleId}`);
  }
  return {
    nodeIds: [...nodeIds].sort(),
    edgeIds: [...edgeIds].sort(),
    complete: true,
  };
}

export function generateTemplateBundle(
  bundle: TemplateBundle,
  repositoryRoot: string,
): GeneratedBundle {
  const views = bundle.artifacts.flatMap((artifact) => viewsForArtifact(artifact, repositoryRoot));
  return {
    bundleId: bundle.bundleId,
    project: bundle.project,
    repositoryRoot,
    views,
    coverage: validateCoverage(bundle, views),
  };
}
