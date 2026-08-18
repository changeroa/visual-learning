import { InputError } from "./errors";
import type { ExcalidrawElement, ExcalidrawScene } from "./excalidraw-file";
import { deprecatedAnchor, freshElement, mergeAgent, pruneAgentRefs } from "./refresh-elements";
import { buildReferenceGraph } from "./refresh-scene";
import { planScene } from "./renderer-plan";
import type { VisualNoteSpec } from "./schema";

export function applyRefreshToScene(
  current: ExcalidrawScene,
  spec: VisualNoteSpec,
): {
  readonly scene: ExcalidrawScene;
  readonly deprecatedAnchors: readonly string[];
} {
  const graph = buildReferenceGraph(current, spec.artifactId);
  if (graph.dangling.length > 0)
    throw new InputError(`dangling references: ${graph.dangling.join(", ")}`);
  const planned = new Map(planScene(spec).elements.map((element) => [element.id, element]));
  const humanReferencedAgents = new Set(
    graph.references
      .filter(
        (reference) =>
          reference.sourceOwnership === "human" && reference.targetOwnership === "agent",
      )
      .map((reference) => reference.targetId),
  );
  const built = new Map<string, ExcalidrawElement>();
  const deprecatedAnchors: string[] = [];
  for (const element of current.elements) {
    const owner = graph.ownership.get(element.id);
    if (owner === "human") built.set(element.id, element);
    if (owner !== "agent") continue;
    const plannedElement = planned.get(element.id);
    if (plannedElement !== undefined) built.set(element.id, mergeAgent(element, plannedElement));
    else if (humanReferencedAgents.has(element.id)) {
      built.set(element.id, deprecatedAnchor(element, spec.revision));
      deprecatedAnchors.push(element.id);
    }
  }
  for (const element of planned.values())
    if (!built.has(element.id)) built.set(element.id, freshElement(element));
  const keptIds = new Set(built.keys());
  const ordered: ExcalidrawElement[] = [];
  for (const element of current.elements) {
    const kept = built.get(element.id);
    if (kept === undefined) continue;
    ordered.push(
      graph.ownership.get(element.id) === "agent" ? pruneAgentRefs(kept, keptIds) : kept,
    );
    built.delete(element.id);
  }
  for (const element of built.values()) ordered.push(pruneAgentRefs(element, keptIds));
  const scene = { ...current, elements: ordered };
  const finalGraph = buildReferenceGraph(scene, spec.artifactId);
  if (finalGraph.dangling.length > 0)
    throw new InputError(`dangling references: ${finalGraph.dangling.join(", ")}`);
  return { scene, deprecatedAnchors };
}
