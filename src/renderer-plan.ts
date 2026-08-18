import { createHash } from "node:crypto";
import { CollisionError } from "./errors";
import type { VisualNoteSpec } from "./schema";
import { wrapLabel } from "./wrap-label";

export type ElementRole = "title" | "node-shape" | "node-label" | "edge-line" | "edge-label";
type Status = "fact" | "inference" | "question";
type Evidence = VisualNoteSpec["nodes"][number]["evidence"];
type SemanticId = VisualNoteSpec["nodes"][number]["semanticId"];

export type PlannedElement = {
  readonly id: string;
  readonly semanticId: string;
  readonly role: ElementRole;
  readonly type: "rectangle" | "text" | "arrow";
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

type Placement = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};
type ElementFields = Omit<PlannedElement, "id" | "customData"> & {
  readonly status: Status;
  readonly evidence: Evidence;
};

const NODE_WIDTH = 280;
const NODE_HEIGHT = 120;
const COLUMN_STEP = 360;
const ROW_STEP = 220;

export function stableElementId(artifactId: string, semanticId: string, role: ElementRole): string {
  return createHash("sha256")
    .update(`${artifactId}\0${semanticId}\0${role}`)
    .digest("base64url")
    .slice(0, 8);
}

function placeNodes(spec: VisualNoteSpec): Map<string, Placement> {
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
      if (incoming.get(target) === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  const fallbackRank = Math.max(0, ...ranks.values()) + 1;
  for (const id of ranks.keys()) if (!processed.has(id)) ranks.set(id, fallbackRank);
  const layers = new Map<number, SemanticId[]>();
  for (const [id, rank] of ranks) layers.set(rank, [...(layers.get(rank) ?? []), id]);
  const placements = new Map<string, Placement>();
  for (const [rank, ids] of layers) {
    for (const [row, id] of ids.sort().entries())
      placements.set(id, {
        x: 80 + rank * COLUMN_STEP,
        y: 180 + row * ROW_STEP,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
  }
  return placements;
}

export function planScene(
  spec: VisualNoteSpec,
  idFactory: ElementIdFactory = stableElementId,
): ScenePlan {
  const ids = new Set<string>();
  const elements: PlannedElement[] = [];
  const placements = placeNodes(spec);
  const add = (fields: ElementFields): void => {
    const id = idFactory(spec.artifactId, fields.semanticId, fields.role);
    if (ids.has(id)) throw new CollisionError(`Excalidraw element ID collision: ${id}`);
    ids.add(id);
    const { status, evidence, ...element } = fields;
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
        evidence,
      },
    });
  };

  const nodes = [...spec.nodes].sort((left, right) =>
    left.semanticId.localeCompare(right.semanticId),
  );

  for (const edge of [...spec.edges].sort((left, right) =>
    left.semanticId.localeCompare(right.semanticId),
  )) {
    const from = placements.get(edge.from);
    const to = placements.get(edge.to);
    if (from === undefined || to === undefined)
      throw new TypeError("validated edge endpoint missing");
    const start = [from.x + from.width / 2, from.y + from.height / 2] as const;
    const end = [to.x + to.width / 2, to.y + to.height / 2] as const;
    const x = start[0];
    const y = start[1];
    const points = [
      [0, 0],
      [end[0] - start[0], end[1] - start[1]],
    ] as const;
    add({
      semanticId: edge.semanticId,
      role: "edge-line",
      type: "arrow",
      x,
      y,
      width: Math.abs(end[0] - start[0]),
      height: Math.abs(end[1] - start[1]),
      text: null,
      points,
      status: edge.status,
      evidence: edge.evidence,
    });
    add({
      semanticId: edge.semanticId,
      role: "edge-label",
      type: "text",
      x: (start[0] + end[0]) / 2 - 60,
      y: (start[1] + end[1]) / 2 - 18,
      width: 120,
      height: 36,
      text: wrapLabel(edge.label),
      points: [],
      status: edge.status,
      evidence: edge.evidence,
    });
  }

  for (const node of nodes) {
    const placement = placements.get(node.semanticId);
    if (placement === undefined) throw new TypeError("node placement missing");
    add({
      semanticId: node.semanticId,
      role: "node-shape",
      type: "rectangle",
      ...placement,
      text: null,
      points: [],
      status: node.status,
      evidence: node.evidence,
    });
    add({
      semanticId: node.semanticId,
      role: "node-label",
      type: "text",
      x: placement.x + 20,
      y: placement.y + 32,
      width: placement.width - 40,
      height: placement.height - 64,
      text: wrapLabel(node.label),
      points: [],
      status: node.status,
      evidence: node.evidence,
    });
  }

  add({
    semanticId: "artifact",
    role: "title",
    type: "text",
    x: 80,
    y: 60,
    width: Math.max(
      1000,
      ...[...placements.values()].map((placement) => placement.x + placement.width - 80),
    ),
    height: 60,
    text: spec.title,
    points: [],
    status: "question",
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
