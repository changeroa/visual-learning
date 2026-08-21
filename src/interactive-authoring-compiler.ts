import { InputError } from "./errors";
import {
  type InteractiveAuthoringDocument,
  type InteractiveAuthoringScene,
  type InteractivePhaseName,
  parseInteractiveAuthoringDocument,
} from "./interactive-authoring-schema";

type EntityBaseline = InteractiveAuthoringScene["semantics"]["entities"][string];
type RelationBaseline = InteractiveAuthoringScene["semantics"]["relations"][string];
type FallbackPlacement =
  InteractiveAuthoringScene["presentation"]["edgeRouting"]["fallback"][number];

export type CompiledInteractiveNode = Omit<EntityBaseline, "badge"> & {
  readonly id: string;
  readonly badge?: string;
  readonly estimatedWidth: number;
  readonly estimatedHeight: number;
};

export type CompiledInteractiveEdge = RelationBaseline & {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly labelPlacement: "auto-corridor" | FallbackPlacement;
};

export type CorridorFeasibility = {
  readonly relationId: string;
  readonly required: number;
  readonly available: number;
  readonly directFits: boolean;
  readonly resolvedBy?: FallbackPlacement;
};

export type PhaseFeasibility = {
  readonly estimatedWidth: number;
  readonly estimatedHeight: number;
  readonly estimatedZoom: number;
  readonly columns: number;
  readonly maxNodesPerColumn: number;
  readonly corridors: readonly CorridorFeasibility[];
};

export type CompiledInteractivePhase = {
  readonly label: string;
  readonly nodes: readonly CompiledInteractiveNode[];
  readonly edges: readonly CompiledInteractiveEdge[];
  readonly feasibility: PhaseFeasibility;
};

export type CompiledInteractiveScene = {
  readonly id: string;
  readonly kind: InteractiveAuthoringScene["kind"];
  readonly story: InteractiveAuthoringScene["story"];
  readonly presentation: InteractiveAuthoringScene["presentation"];
  readonly constraints: InteractiveAuthoringScene["constraints"];
  readonly before: CompiledInteractivePhase;
  readonly after: CompiledInteractivePhase;
};

export type CompiledInteractiveDocument = {
  readonly contractVersion: 1;
  readonly direction: "left-to-right";
  readonly source: InteractiveAuthoringDocument["source"];
  readonly scenes: readonly CompiledInteractiveScene[];
  readonly measurementPolicy: {
    readonly mode: "dom-final-correction";
    readonly nodeAspectRatio: 1.5;
    readonly sizing: "measure-content-then-clamp";
    readonly edgeLabels: "route-after-node-measurement";
    readonly exactPixelsGuaranteed: false;
  };
};

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map(
      (segment) => segment.segment,
    );
  }
  return [...value];
}

function estimateNodeWidth(scene: InteractiveAuthoringScene, entity: EntityBaseline): number {
  const { minWidth, maxWidth, widthStep } = scene.constraints.nodeSizing;
  const titleDemand = graphemes(entity.title).length;
  const descriptionDemand = Math.ceil(graphemes(entity.description).length / 2);
  const demand = Math.max(titleDemand, descriptionDemand);
  const steps = Math.max(0, Math.ceil((demand - 24) / 18));
  return Math.min(maxWidth, Math.max(minWidth, minWidth + steps * widthStep));
}

function mergeEntity(
  scene: InteractiveAuthoringScene,
  phase: InteractivePhaseName,
  id: string,
): EntityBaseline | undefined {
  const baseline = scene.semantics.entities[id];
  if (baseline === undefined) return undefined;
  const patch = scene.change[phase].entities[id];
  if (patch?.present === false) return undefined;
  const merged = { ...baseline, ...patch } as EntityBaseline;
  if (merged.badge === null) delete merged.badge;
  return merged;
}

function mergeRelation(
  scene: InteractiveAuthoringScene,
  phase: InteractivePhaseName,
  id: string,
): RelationBaseline | undefined {
  const baseline = scene.semantics.relations[id];
  if (baseline === undefined) return undefined;
  const patch = scene.change[phase].relations[id];
  if (patch?.present === false) return undefined;
  return { ...baseline, ...patch } as RelationBaseline;
}

function compileNode(
  scene: InteractiveAuthoringScene,
  phase: InteractivePhaseName,
  id: string,
): CompiledInteractiveNode | undefined {
  const entity = mergeEntity(scene, phase, id);
  if (entity === undefined) return undefined;
  const estimatedWidth = estimateNodeWidth(scene, entity);
  const result: CompiledInteractiveNode = {
    id,
    title: entity.title,
    description: entity.description,
    changeStatus: entity.changeStatus,
    visual: entity.visual,
    status: entity.status,
    confidence: entity.confidence,
    evidence: entity.evidence,
    estimatedWidth,
    estimatedHeight: estimatedWidth / scene.constraints.nodeSizing.aspectRatio,
  };
  if (entity.badge !== undefined && entity.badge !== null)
    return { ...result, badge: entity.badge };
  return result;
}

function estimateLabelWidth(label: string): number {
  const width = graphemes(label).reduce(
    (total, value) =>
      total + (/^[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af]$/u.test(value) ? 13 : 7.2),
    0,
  );
  return Math.ceil(width + 16);
}

function fallbackResolves(
  placement: FallbackPlacement,
  available: number,
  required: number,
  scene: InteractiveAuthoringScene,
): boolean {
  if (placement === "detached-callout") return true;
  if (placement === "source-side" || placement === "target-side") {
    return Math.max(scene.constraints.layout.rowGap, scene.constraints.layout.laneGap) >= required;
  }
  return available >= required;
}

function phaseGeometry(
  scene: InteractiveAuthoringScene,
  nodes: readonly CompiledInteractiveNode[],
): Omit<PhaseFeasibility, "corridors"> {
  const placements = scene.presentation.placements;
  const activePlacements = nodes.map((node) => ({ node, placement: placements[node.id] }));
  const columns =
    activePlacements.length === 0
      ? 0
      : Math.max(...activePlacements.map(({ placement }) => placement?.column ?? 0)) + 1;
  const columnWidths = Array.from({ length: columns }, () => 0);
  const columnHeights = Array.from({ length: columns }, () => 0);
  const columnCounts = Array.from({ length: columns }, () => 0);
  const laneOrder = new Map(scene.presentation.lanes.map((lane, index) => [lane.id, index]));

  for (let column = 0; column < columns; column += 1) {
    const entries = activePlacements
      .filter(({ placement }) => placement?.column === column)
      .sort(
        (left, right) =>
          (laneOrder.get(left.placement?.lane ?? "") ?? 0) -
            (laneOrder.get(right.placement?.lane ?? "") ?? 0) ||
          (left.placement?.order ?? 0) - (right.placement?.order ?? 0),
      );
    columnCounts[column] = entries.length;
    let previousLane: string | undefined;
    entries.forEach(({ node, placement }, index) => {
      columnWidths[column] = Math.max(columnWidths[column] ?? 0, node.estimatedWidth);
      if (index > 0) {
        columnHeights[column] =
          (columnHeights[column] ?? 0) +
          (previousLane === placement?.lane
            ? scene.constraints.layout.rowGap
            : scene.constraints.layout.laneGap);
      }
      columnHeights[column] = (columnHeights[column] ?? 0) + node.estimatedHeight;
      previousLane = placement?.lane;
    });
  }

  const estimatedWidth =
    columnWidths.reduce((total, width) => total + width, 0) +
    Math.max(0, columns - 1) * scene.constraints.layout.columnGap;
  const estimatedHeight = Math.max(0, ...columnHeights);
  const estimatedZoom =
    estimatedWidth > 0 && estimatedHeight > 0
      ? Math.min(
          1,
          scene.constraints.viewport.width / estimatedWidth,
          scene.constraints.viewport.height / estimatedHeight,
        )
      : 1;
  return {
    estimatedWidth,
    estimatedHeight,
    estimatedZoom,
    columns,
    maxNodesPerColumn: Math.max(0, ...columnCounts),
  };
}

function compilePhase(
  scene: InteractiveAuthoringScene,
  phase: InteractivePhaseName,
  failures: string[],
): CompiledInteractivePhase {
  const authored = scene.change[phase];
  const nodes = authored.entityOrder.flatMap((id) => {
    const node = compileNode(scene, phase, id);
    return node === undefined ? [] : [node];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: CompiledInteractiveEdge[] = [];
  const corridors: CorridorFeasibility[] = [];

  for (const id of authored.relationOrder) {
    const relation = mergeRelation(scene, phase, id);
    if (relation === undefined || !nodeIds.has(relation.from) || !nodeIds.has(relation.to))
      continue;
    const sourcePlacement = scene.presentation.placements[relation.from];
    const targetPlacement = scene.presentation.placements[relation.to];
    if (sourcePlacement === undefined || targetPlacement === undefined) continue;
    const horizontal = sourcePlacement.column !== targetPlacement.column;
    const available = horizontal
      ? scene.constraints.layout.columnGap
      : sourcePlacement.lane === targetPlacement.lane
        ? scene.constraints.layout.rowGap
        : scene.constraints.layout.laneGap;
    const required = Math.max(
      scene.constraints.layout.minimumCorridor,
      horizontal ? estimateLabelWidth(relation.label) : 25,
    );
    const directFits = available >= required;
    const override = scene.presentation.edgeRouting.relations?.[id];
    const fallbacks = override?.fallback ?? scene.presentation.edgeRouting.fallback;
    const requested = override?.labelPlacement ?? "auto-corridor";
    const requestedFallback = requested === "auto-corridor" ? undefined : requested;
    const resolvedBy = directFits
      ? undefined
      : requestedFallback !== undefined &&
          fallbackResolves(requestedFallback, available, required, scene)
        ? requestedFallback
        : fallbacks.find((candidate) => fallbackResolves(candidate, available, required, scene));
    if (!directFits && resolvedBy === undefined) {
      failures.push(`${scene.semanticId}/${phase}/${id}: no declared edge-label fallback fits`);
    }
    corridors.push({
      relationId: id,
      required,
      available,
      directFits,
      ...(resolvedBy === undefined ? {} : { resolvedBy }),
    });
    edges.push({
      ...relation,
      id,
      source: relation.from,
      target: relation.to,
      labelPlacement: directFits ? "auto-corridor" : (resolvedBy ?? "auto-corridor"),
    });
  }

  const geometry = phaseGeometry(scene, nodes);
  if (geometry.columns > scene.constraints.layout.maxColumns) {
    failures.push(
      `${scene.semanticId}/${phase}: ${geometry.columns} columns exceeds ${scene.constraints.layout.maxColumns}`,
    );
  }
  if (geometry.maxNodesPerColumn > scene.constraints.layout.maxNodesPerColumn) {
    failures.push(
      `${scene.semanticId}/${phase}: ${geometry.maxNodesPerColumn} nodes per column exceeds ${scene.constraints.layout.maxNodesPerColumn}`,
    );
  }
  if (geometry.estimatedZoom < scene.constraints.layout.minimumZoom) {
    failures.push(
      `${scene.semanticId}/${phase}: estimated zoom ${geometry.estimatedZoom.toFixed(3)} is below ${scene.constraints.layout.minimumZoom}`,
    );
  }
  return {
    label: authored.label,
    nodes,
    edges,
    feasibility: { ...geometry, corridors },
  };
}

function compileScene(
  scene: InteractiveAuthoringScene,
  failures: string[],
): CompiledInteractiveScene {
  return {
    id: scene.semanticId,
    kind: scene.kind,
    story: scene.story,
    presentation: scene.presentation,
    constraints: scene.constraints,
    before: compilePhase(scene, "before", failures),
    after: compilePhase(scene, "after", failures),
  };
}

export function compileInteractiveAuthoringDocument(raw: unknown): CompiledInteractiveDocument {
  const document = parseInteractiveAuthoringDocument(raw);
  const failures: string[] = [];
  const scenes = document.scenes.map((scene) => compileScene(scene, failures));
  if (failures.length > 0) {
    throw new InputError(`interactive authoring feasibility failed:\n- ${failures.join("\n- ")}`);
  }
  return {
    contractVersion: 1,
    direction: "left-to-right",
    source: document.source,
    scenes,
    measurementPolicy: {
      mode: "dom-final-correction",
      nodeAspectRatio: 1.5,
      sizing: "measure-content-then-clamp",
      edgeLabels: "route-after-node-measurement",
      exactPixelsGuaranteed: false,
    },
  };
}
