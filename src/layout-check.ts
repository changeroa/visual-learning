import { InputError } from "./errors";
import { planScene } from "./renderer-plan";
import type { GeneratedView } from "./template-generate";

const MAX_SCENE_WIDTH = 2400;
const MAX_SCENE_HEIGHT = 1600;
const NODE_LABEL_LINE_HEIGHT = 18;
const EDGE_LABEL_LINE_HEIGHT = 18;

type LayoutReceipt = {
  readonly viewId: string;
  readonly width: number;
  readonly height: number;
  readonly overlapFree: true;
  readonly clippedTextFree: true;
  readonly orphanFree: true;
  readonly danglingEdgeFree: true;
  readonly withinViewLimit: true;
};

function sceneBounds(view: GeneratedView): { readonly width: number; readonly height: number } {
  const plan = planScene(view.spec);
  const width = Math.max(...plan.elements.map((element) => element.x + element.width), 0) + 80;
  const height = Math.max(...plan.elements.map((element) => element.y + element.height), 0) + 80;
  return { width, height };
}

function validateText(view: GeneratedView): void {
  const plan = planScene(view.spec);
  for (const element of plan.elements) {
    if (element.type !== "text" || element.text === null) continue;
    const lines = element.text.split("\n").length;
    const lineHeight =
      element.role === "edge-label" ? EDGE_LABEL_LINE_HEIGHT : NODE_LABEL_LINE_HEIGHT;
    if (lines * lineHeight > element.height) {
      throw new InputError(`clipped text in ${view.viewId}:${element.semanticId}:${element.role}`);
    }
  }
}

function validateOverlaps(view: GeneratedView): void {
  const shapes = planScene(view.spec).elements.filter((element) => element.role === "node-shape");
  for (let left = 0; left < shapes.length; left += 1) {
    const first = shapes[left];
    if (first === undefined) throw new TypeError("shape is missing");
    for (let right = left + 1; right < shapes.length; right += 1) {
      const second = shapes[right];
      if (second === undefined) throw new TypeError("shape is missing");
      const separated =
        first.x + first.width <= second.x ||
        second.x + second.width <= first.x ||
        first.y + first.height <= second.y ||
        second.y + second.height <= first.y;
      if (!separated) throw new InputError(`overlapping nodes in ${view.viewId}`);
    }
  }
}

function validateGraph(view: GeneratedView): void {
  const nodeIds = new Set(view.spec.nodes.map((node) => node.semanticId));
  const degree = new Map(view.spec.nodes.map((node) => [node.semanticId, 0]));
  for (const edge of view.spec.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new InputError(`dangling edge in ${view.viewId}:${edge.semanticId}`);
    }
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  if (view.spec.nodes.length > 1) {
    for (const node of view.spec.nodes) {
      if ((degree.get(node.semanticId) ?? 0) === 0) {
        throw new InputError(`orphan node in ${view.viewId}:${node.semanticId}`);
      }
    }
  }
}

export function validateViewLayout(view: GeneratedView): LayoutReceipt {
  validateGraph(view);
  validateOverlaps(view);
  validateText(view);
  const bounds = sceneBounds(view);
  if (
    view.spec.nodes.length > 6 ||
    bounds.width > MAX_SCENE_WIDTH ||
    bounds.height > MAX_SCENE_HEIGHT
  ) {
    throw new InputError(`view exceeds deterministic size limits: ${view.viewId}`);
  }
  return {
    viewId: view.viewId,
    width: bounds.width,
    height: bounds.height,
    overlapFree: true,
    clippedTextFree: true,
    orphanFree: true,
    danglingEdgeFree: true,
    withinViewLimit: true,
  };
}

export function validateBundleLayout(views: readonly GeneratedView[]): readonly LayoutReceipt[] {
  return views.map((view) => validateViewLayout(view));
}
