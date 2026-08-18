import { createHash } from "node:crypto";
import { CollisionError } from "./errors";
import type { VisualNoteSpec } from "./schema";
import { wrapLabel } from "./wrap-label";

export type ElementRole =
  | "title"
  | "frame-shape"
  | "frame-label"
  | "node-shape"
  | "node-label"
  | "edge-line"
  | "edge-label";
type Status = "fact" | "inference" | "question";
type Category =
  | "cloudflare"
  | "aws"
  | "external"
  | "data"
  | "runtime"
  | "security"
  | "risk"
  | "neutral";
type Evidence = VisualNoteSpec["nodes"][number]["evidence"];
type SemanticId = VisualNoteSpec["nodes"][number]["semanticId"];
type Shape = "rectangle" | "ellipse" | "diamond";

export type PlannedElement = {
  readonly id: string;
  readonly semanticId: string;
  readonly role: ElementRole;
  readonly type: Shape | "text" | "arrow";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: string | null;
  readonly points: readonly (readonly [number, number])[];
  readonly customData: {
    readonly schemaVersion: 1;
    readonly owner: "agent";
    readonly artifactId: string;
    readonly semanticId: string;
    readonly elementRole: ElementRole;
    readonly revision: number;
    readonly status: Status;
    readonly category: Category;
    readonly evidence: Evidence;
  };
};

export type ScenePlan = {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly revision: number;
  readonly title: string;
  readonly elements: readonly PlannedElement[];
};

export type ElementIdFactory = (
  artifactId: string,
  semanticId: string,
  role: ElementRole,
) => string;

type Placement = { x: number; y: number; width: number; height: number };
type FramePlacement = Placement & { id: string; label: string; category: Category };
type ElementFields = Omit<PlannedElement, "id" | "customData"> & {
  status: Status;
  category?: Category;
  evidence: Evidence;
};

const NODE_WIDTH = 300;
const NODE_HEIGHT = 120;
const COLUMN_STEP = 380;
const ROW_STEP = 190;

export function stableElementId(artifactId: string, semanticId: string, role: ElementRole): string {
  return createHash("sha256")
    .update(`${artifactId}\0${semanticId}\0${role}`)
    .digest("base64url")
    .slice(0, 8);
}

function orderedNodes(spec: VisualNoteSpec) {
  return [...spec.nodes].sort(
    (left, right) =>
      (left.visual?.order ?? Number.MAX_SAFE_INTEGER) -
        (right.visual?.order ?? Number.MAX_SAFE_INTEGER) ||
      left.semanticId.localeCompare(right.semanticId),
  );
}

function layeredPlacements(spec: VisualNoteSpec): Map<string, Placement> {
  const ranks = new Map(spec.nodes.map((node) => [node.semanticId, 0]));
  const incoming = new Map(spec.nodes.map((node) => [node.semanticId, 0]));
  const outgoing = new Map(spec.nodes.map((node) => [node.semanticId, [] as SemanticId[]]));
  for (const edge of spec.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const ready = spec.nodes
    .map((node) => node.semanticId)
    .filter((id) => incoming.get(id) === 0)
    .sort();
  const processed = new Set<SemanticId>();
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    processed.add(id);
    for (const target of [...(outgoing.get(id) ?? [])].sort()) {
      ranks.set(target, Math.max(ranks.get(target) ?? 0, (ranks.get(id) ?? 0) + 1));
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if (incoming.get(target) === 0) ready.push(target);
      ready.sort();
    }
  }
  const fallbackRank = Math.max(0, ...ranks.values()) + 1;
  for (const id of ranks.keys()) if (!processed.has(id)) ranks.set(id, fallbackRank);
  const layers = new Map<number, SemanticId[]>();
  for (const [id, rank] of ranks) layers.set(rank, [...(layers.get(rank) ?? []), id]);
  const placements = new Map<string, Placement>();
  for (const [rank, ids] of layers)
    for (const [row, id] of ids.sort().entries())
      placements.set(id, {
        x: 80 + rank * COLUMN_STEP,
        y: 180 + row * 220,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
  return placements;
}

function timelinePlacements(spec: VisualNoteSpec): Map<string, Placement> {
  const placements = new Map<string, Placement>();
  const lanes = new Map<string, number>([
    ["main", 210],
    ["exception", 470],
    ["upstream", 80],
    ["downstream", 600],
  ]);
  let fallbackOrder = 0;
  for (const node of orderedNodes(spec)) {
    const lane = node.visual?.lane ?? "main";
    const index = node.visual?.order ?? fallbackOrder;
    fallbackOrder += 1;
    placements.set(node.semanticId, {
      x: 80 + index * COLUMN_STEP,
      y: lanes.get(lane) ?? 210,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  }
  return placements;
}

function framedPlacements(spec: VisualNoteSpec): {
  nodes: Map<string, Placement>;
  frames: FramePlacement[];
} {
  const frames = [...(spec.presentation?.frames ?? [])].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
  const nodes = new Map<string, Placement>();
  const placements: FramePlacement[] = [];
  for (const [column, frame] of frames.entries()) {
    const members = orderedNodes(spec).filter((node) => node.visual?.frameId === frame.id);
    const x = 60 + column * 440;
    const height = Math.max(310, 110 + members.length * ROW_STEP);
    placements.push({
      id: frame.id,
      label: frame.label,
      category: frame.category,
      x,
      y: 140,
      width: 380,
      height,
    });
    for (const [row, node] of members.entries())
      nodes.set(node.semanticId, {
        x: x + 40,
        y: 230 + row * ROW_STEP,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
  }
  const unframed = orderedNodes(spec).filter((node) => !nodes.has(node.semanticId));
  const x = 60 + frames.length * 440;
  for (const [row, node] of unframed.entries())
    nodes.set(node.semanticId, {
      x,
      y: 230 + row * ROW_STEP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  return { nodes, frames: placements };
}

function componentPlacements(spec: VisualNoteSpec): {
  nodes: Map<string, Placement>;
  frames: FramePlacement[];
} {
  const frames = [...(spec.presentation?.frames ?? [])].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
  const nodes = new Map<string, Placement>();
  const placements: FramePlacement[] = [];
  let y = 140;
  for (const frame of frames) {
    const members = orderedNodes(spec).filter((node) => node.visual?.frameId === frame.id);
    const columns = Math.max(1, Math.min(3, members.length));
    const rows = Math.max(1, Math.ceil(members.length / columns));
    const width = 80 + columns * NODE_WIDTH + (columns - 1) * 60;
    const height = Math.max(310, 110 + rows * ROW_STEP);
    placements.push({
      id: frame.id,
      label: frame.label,
      category: frame.category,
      x: 60,
      y,
      width,
      height,
    });
    const lastRowCount = members.length % columns || columns;
    const lastRowOffset = ((columns - lastRowCount) * (NODE_WIDTH + 60)) / 2;
    for (const [index, node] of members.entries()) {
      const row = Math.floor(index / columns);
      const isLastRow = row === rows - 1;
      nodes.set(node.semanticId, {
        x: 100 + (isLastRow ? lastRowOffset : 0) + (index % columns) * (NODE_WIDTH + 60),
        y: y + 90 + row * ROW_STEP,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    }
    y += height + 60;
  }
  const unframed = orderedNodes(spec).filter((node) => !nodes.has(node.semanticId));
  for (const [column, node] of unframed.entries())
    nodes.set(node.semanticId, {
      x: 60 + column * COLUMN_STEP,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  return { nodes, frames: placements };
}

function hubPlacements(spec: VisualNoteSpec): Map<string, Placement> {
  const placements = new Map<string, Placement>();
  const nodes = orderedNodes(spec);
  const primary = nodes.filter((node) => node.visual?.emphasis === "primary");
  const hubs = primary.length > 0 ? primary : nodes.slice(0, 1);
  const hubIds = new Set(hubs.map((node) => node.semanticId));
  for (const [row, hub] of hubs.entries())
    placements.set(hub.semanticId, {
      x: 560,
      y: 170 + row * ROW_STEP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  const upstream = nodes.filter(
    (node) => !hubIds.has(node.semanticId) && (node.visual?.lane ?? "upstream") === "upstream",
  );
  const downstream = nodes.filter(
    (node) => !hubIds.has(node.semanticId) && node.visual?.lane !== "upstream",
  );
  for (const [row, node] of upstream.entries())
    placements.set(node.semanticId, {
      x: 80,
      y: 170 + row * ROW_STEP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  for (const [row, node] of downstream.entries())
    placements.set(node.semanticId, {
      x: 1040,
      y: 170 + row * ROW_STEP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  return placements;
}

function connection(
  from: Placement,
  to: Placement,
): readonly [readonly [number, number], readonly [number, number]] {
  const fromCenter = [from.x + from.width / 2, from.y + from.height / 2] as const;
  const toCenter = [to.x + to.width / 2, to.y + to.height / 2] as const;
  if (Math.abs(toCenter[0] - fromCenter[0]) >= Math.abs(toCenter[1] - fromCenter[1])) {
    const right = toCenter[0] >= fromCenter[0];
    return [
      [right ? from.x + from.width : from.x, fromCenter[1]],
      [right ? to.x : to.x + to.width, toCenter[1]],
    ];
  }
  const down = toCenter[1] >= fromCenter[1];
  return [
    [fromCenter[0], down ? from.y + from.height : from.y],
    [toCenter[0], down ? to.y : to.y + to.height],
  ];
}

export function planScene(
  spec: VisualNoteSpec,
  idFactory: ElementIdFactory = stableElementId,
): ScenePlan {
  const layout = spec.presentation?.layout ?? "layered";
  const framed =
    layout === "components"
      ? componentPlacements(spec)
      : ["frames", "trust-boundary"].includes(layout)
        ? framedPlacements(spec)
        : undefined;
  const placements =
    framed?.nodes ??
    (layout === "timeline"
      ? timelinePlacements(spec)
      : layout === "hub"
        ? hubPlacements(spec)
        : layeredPlacements(spec));
  const ids = new Set<string>();
  const elements: PlannedElement[] = [];
  const add = (fields: ElementFields): void => {
    const id = idFactory(spec.artifactId, fields.semanticId, fields.role);
    if (ids.has(id)) throw new CollisionError(`Excalidraw element ID collision: ${id}`);
    ids.add(id);
    const { status, category = "neutral", evidence, ...element } = fields;
    elements.push({
      ...element,
      id,
      customData: {
        schemaVersion: 1,
        owner: "agent",
        artifactId: spec.artifactId,
        semanticId: fields.semanticId,
        elementRole: fields.role,
        revision: spec.revision,
        status,
        category,
        evidence,
      },
    });
  };

  for (const frame of framed?.frames ?? []) {
    add({
      semanticId: `frame-${frame.id}`,
      role: "frame-shape",
      type: "rectangle",
      ...frame,
      text: null,
      points: [],
      status: "fact",
      category: frame.category,
      evidence: [],
    });
    add({
      semanticId: `frame-${frame.id}`,
      role: "frame-label",
      type: "text",
      x: frame.x + 24,
      y: frame.y + 20,
      width: frame.width - 48,
      height: 44,
      text: frame.label,
      points: [],
      status: "fact",
      category: frame.category,
      evidence: [],
    });
  }

  const edges = [...spec.edges].sort((a, b) => a.semanticId.localeCompare(b.semanticId));
  for (const [edgeIndex, edge] of edges.entries()) {
    const from = placements.get(edge.from);
    const to = placements.get(edge.to);
    if (from === undefined || to === undefined)
      throw new TypeError("validated edge endpoint missing");
    const [start, end] = connection(from, to);
    const points = [
      [0, 0],
      [end[0] - start[0], end[1] - start[1]],
    ] as const;
    const stagger = [-24, 0, 24][edgeIndex % 3] ?? 0;
    const mostlyHorizontal = Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]);
    add({
      semanticId: edge.semanticId,
      role: "edge-line",
      type: "arrow",
      x: start[0],
      y: start[1],
      width: Math.abs(points[1][0]),
      height: Math.abs(points[1][1]),
      text: null,
      points,
      status: edge.status,
      category: "neutral",
      evidence: edge.evidence,
    });
    add({
      semanticId: edge.semanticId,
      role: "edge-label",
      type: "text",
      x: (start[0] + end[0]) / 2 - 80 + (mostlyHorizontal ? 0 : stagger),
      y: (start[1] + end[1]) / 2 - 20 + (mostlyHorizontal ? stagger : 0),
      width: 160,
      height: 40,
      text: wrapLabel(edge.label),
      points: [],
      status: edge.status,
      category: "neutral",
      evidence: edge.evidence,
    });
  }

  for (const node of orderedNodes(spec)) {
    const placement = placements.get(node.semanticId);
    if (placement === undefined) throw new TypeError("node placement missing");
    const category = node.visual?.category ?? "neutral";
    add({
      semanticId: node.semanticId,
      role: "node-shape",
      type: node.visual?.shape ?? "rectangle",
      ...placement,
      text: null,
      points: [],
      status: node.status,
      category,
      evidence: node.evidence,
    });
    add({
      semanticId: node.semanticId,
      role: "node-label",
      type: "text",
      x: placement.x + 20,
      y: placement.y + 24,
      width: placement.width - 40,
      height: placement.height - 48,
      text: wrapLabel(node.label),
      points: [],
      status: node.status,
      category,
      evidence: node.evidence,
    });
  }

  const right = Math.max(
    520,
    ...[...placements.values()].map((placement) => placement.x + placement.width - 80),
  );
  add({
    semanticId: "artifact",
    role: "title",
    type: "text",
    x: 80,
    y: 50,
    width: right,
    height: 64,
    text: spec.title,
    points: [],
    status: "question",
    category: "neutral",
    evidence: [],
  });
  return {
    schemaVersion: 1,
    artifactId: spec.artifactId,
    revision: spec.revision,
    title: spec.title,
    elements,
  };
}
