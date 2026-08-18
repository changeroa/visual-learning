import type { ExcalidrawElement, JsonObject } from "./excalidraw-file";
import type { PlannedElement } from "./renderer-plan";
import { pruneAgentCustomDataRefs, sceneLinkTargets } from "./scene-links";

function hashId(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function statusStyle(status: string): {
  readonly strokeColor: string;
  readonly backgroundColor: string;
  readonly strokeStyle: string;
} {
  if (status === "fact")
    return { strokeColor: "#1971c2", backgroundColor: "#d0ebff", strokeStyle: "solid" };
  if (status === "inference")
    return { strokeColor: "#e67700", backgroundColor: "#fff3bf", strokeStyle: "dashed" };
  return { strokeColor: "#7048e8", backgroundColor: "#e5dbff", strokeStyle: "solid" };
}

export function freshElement(planned: PlannedElement): ExcalidrawElement {
  const style = statusStyle(planned.customData.status);
  const common: ExcalidrawElement = {
    id: planned.id,
    type: planned.type,
    x: planned.x,
    y: planned.y,
    width: planned.width,
    height: planned.height,
    angle: 0,
    strokeColor: style.strokeColor,
    backgroundColor: planned.type === "rectangle" ? style.backgroundColor : "transparent",
    fillStyle: "solid",
    strokeWidth: planned.role === "title" ? 1 : 2,
    strokeStyle: style.strokeStyle,
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: hashId(planned.id),
    version: 1,
    versionNonce: hashId(`${planned.id}:nonce`),
    updated: Date.now(),
    isDeleted: false,
    groupIds: [],
    boundElements: [],
    link: null,
    locked: false,
    frameId: null,
    hasTextLink: false,
    customData: structuredClone(planned.customData),
  };
  if (planned.type === "text") {
    return {
      ...common,
      text: planned.text ?? "",
      fontSize: planned.role === "title" ? 32 : planned.role === "edge-label" ? 16 : 20,
      fontFamily: 2,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: null,
      originalText: planned.text ?? "",
      rawText: planned.text ?? "",
      lineHeight: 1.25,
      autoResize: false,
    };
  }
  if (planned.type === "arrow") {
    return {
      ...common,
      points: planned.points.map((point) => [...point]),
      elbowed: false,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
    };
  }
  return common;
}

export function mergeAgent(current: ExcalidrawElement, planned: PlannedElement): ExcalidrawElement {
  const updated = structuredClone(current);
  const style = statusStyle(planned.customData.status);
  updated.strokeColor = style.strokeColor;
  updated.backgroundColor = planned.type === "rectangle" ? style.backgroundColor : "transparent";
  updated.strokeStyle = style.strokeStyle;
  updated.strokeWidth = planned.role === "title" ? 1 : 2;
  updated.customData = structuredClone(planned.customData);
  if (planned.type === "text") {
    updated.text = planned.text ?? "";
    updated.originalText = planned.text ?? "";
    updated.rawText = planned.text ?? "";
  }
  return updated;
}

export function deprecatedAnchor(current: ExcalidrawElement, revision: number): ExcalidrawElement {
  const anchored = structuredClone(current);
  const custom =
    typeof anchored.customData === "object" && anchored.customData !== null
      ? anchored.customData
      : {};
  anchored.customData = { ...custom, owner: "agent", revision, deprecatedAnchor: true };
  return anchored;
}

export function pruneAgentRefs(
  element: ExcalidrawElement,
  keptIds: ReadonlySet<string>,
): ExcalidrawElement {
  const updated = structuredClone(element);
  if (Array.isArray(updated.boundElements)) {
    updated.boundElements = updated.boundElements.filter((entry) => {
      if (typeof entry === "string") return keptIds.has(entry);
      if (typeof entry === "object" && entry !== null && typeof entry["id"] === "string")
        return keptIds.has(entry["id"]);
      return false;
    });
  }
  if (typeof updated.containerId === "string" && !keptIds.has(updated.containerId)) {
    updated.containerId = null;
  }
  if (
    typeof updated.startBinding === "object" &&
    updated.startBinding !== null &&
    typeof updated.startBinding["elementId"] === "string" &&
    !keptIds.has(updated.startBinding["elementId"])
  ) {
    updated.startBinding = null;
  }
  if (
    typeof updated.endBinding === "object" &&
    updated.endBinding !== null &&
    typeof updated.endBinding["elementId"] === "string" &&
    !keptIds.has(updated.endBinding["elementId"])
  ) {
    updated.endBinding = null;
  }
  if (
    typeof updated.link === "string" &&
    sceneLinkTargets(updated.link).some((target) => !keptIds.has(target))
  ) {
    updated.link = null;
  }
  if (updated.customData !== undefined) {
    const customData = pruneAgentCustomDataRefs(updated.customData, keptIds);
    if (typeof customData === "object" && customData !== null && !Array.isArray(customData)) {
      updated.customData = customData as JsonObject;
    }
  }
  return updated;
}
