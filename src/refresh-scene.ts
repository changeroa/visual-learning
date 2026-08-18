import { InputError, RuntimeError } from "./errors";
import type { ExcalidrawElement, ExcalidrawScene, JsonObject, JsonValue } from "./excalidraw-file";
import { sceneLinkTargets } from "./scene-links";

export type Ownership = "agent" | "human";
export type ReferenceKind =
  | "boundElements"
  | "containerId"
  | "startBinding"
  | "endBinding"
  | "link"
  | "customData";
export type ElementReference = {
  readonly sourceId: string;
  readonly targetId: string;
  readonly sourceOwnership: Ownership;
  readonly targetOwnership: Ownership;
  readonly kind: ReferenceKind;
};
export type ReferenceGraph = {
  readonly ownership: ReadonlyMap<string, Ownership>;
  readonly references: readonly ElementReference[];
  readonly dangling: readonly string[];
  readonly groups: ReadonlyMap<string, readonly string[]>;
};

function asObject(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function ownershipOf(element: ExcalidrawElement, artifactId: string): Ownership {
  const custom = asObject(element.customData);
  const owner = typeof custom?.["owner"] === "string" ? custom["owner"] : undefined;
  if (owner === undefined || owner === "human") return "human";
  if (owner !== "agent") throw new InputError(`partial ownership on ${element.id}`);
  if (
    custom === null ||
    custom["artifactId"] !== artifactId ||
    typeof custom["semanticId"] !== "string" ||
    typeof custom["elementRole"] !== "string"
  ) {
    throw new InputError(`partial ownership on ${element.id}`);
  }
  return "agent";
}

function customTargets(
  value: JsonValue,
  ids: ReadonlySet<string>,
  matches: Set<string>,
  dangling: Set<string>,
): void {
  if (typeof value === "string") {
    if (ids.has(value)) matches.add(value);
    for (const target of sceneLinkTargets(value)) {
      if (ids.has(target)) matches.add(target);
      else dangling.add(target);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) customTargets(item, ids, matches, dangling);
    return;
  }
  const object = asObject(value);
  if (object === null) return;
  for (const [key, child] of Object.entries(object)) {
    if (["owner", "artifactId", "semanticId", "elementRole", "revision", "status"].includes(key))
      continue;
    customTargets(child, ids, matches, dangling);
  }
}

export function buildReferenceGraph(scene: ExcalidrawScene, artifactId: string): ReferenceGraph {
  const ids = new Set(scene.elements.map((element) => element.id));
  const ownership = new Map(
    scene.elements.map((element) => [element.id, ownershipOf(element, artifactId)]),
  );
  const references: ElementReference[] = [];
  const dangling = new Set<string>();
  const groups = new Map<string, string[]>();
  const push = (source: ExcalidrawElement, kind: ReferenceKind, targetId: string): void => {
    if (!ids.has(targetId)) {
      dangling.add(`${source.id}:${kind}:${targetId}`);
      return;
    }
    const sourceOwnership = ownership.get(source.id);
    const targetOwnership = ownership.get(targetId);
    if (sourceOwnership === undefined || targetOwnership === undefined)
      throw new TypeError("reference ownership missing");
    if (sourceOwnership === "agent" && targetOwnership === "human" && kind !== "boundElements") {
      throw new RuntimeError(`irreparable cross-ownership cycle: ${source.id} -> ${targetId}`);
    }
    references.push({ sourceId: source.id, targetId, sourceOwnership, targetOwnership, kind });
  };
  for (const element of scene.elements) {
    for (const group of (element.groupIds ?? []).filter(
      (value): value is string => typeof value === "string",
    )) {
      groups.set(group, [...(groups.get(group) ?? []), element.id]);
    }
    const bound = Array.isArray(element.boundElements) ? element.boundElements : [];
    for (const entry of bound) {
      if (typeof entry === "string") push(element, "boundElements", entry);
      const object = asObject(entry);
      if (typeof object?.["id"] === "string") push(element, "boundElements", object["id"]);
    }
    if (typeof element.containerId === "string") push(element, "containerId", element.containerId);
    const start = asObject(element.startBinding);
    if (typeof start?.["elementId"] === "string") push(element, "startBinding", start["elementId"]);
    const end = asObject(element.endBinding);
    if (typeof end?.["elementId"] === "string") push(element, "endBinding", end["elementId"]);
    if (typeof element.link === "string") {
      if (ids.has(element.link)) push(element, "link", element.link);
      for (const target of sceneLinkTargets(element.link)) push(element, "link", target);
    }
    const matches = new Set<string>();
    const customDangling = new Set<string>();
    customTargets(element.customData ?? null, ids, matches, customDangling);
    for (const target of matches) push(element, "customData", target);
    for (const target of customDangling) dangling.add(`${element.id}:customData:${target}`);
  }
  return { ownership, references, dangling: [...dangling].sort(), groups };
}
