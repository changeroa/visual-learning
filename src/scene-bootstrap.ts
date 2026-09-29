import type { ExcalidrawScene } from "./excalidraw-file";
import { planScene } from "./renderer-plan";
import type { VisualNoteSpec } from "./schema";

function hashId(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

export function sceneFromSpec(spec: VisualNoteSpec, source: string): ExcalidrawScene {
  const plan = planScene(spec);
  return {
    type: "excalidraw",
    version: 2,
    source,
    elements: plan.elements.map((element, index) => {
      return {
        id: element.id,
        type: element.type,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        angle: 0,
        strokeColor: element.style.strokeColor,
        backgroundColor: element.style.backgroundColor,
        fillStyle: element.style.fillStyle,
        strokeWidth: element.role === "title" ? 1 : 2,
        strokeStyle: element.customData.status === "inference" ? "dashed" : "solid",
        roughness: element.role === "edge-line" ? 1 : element.role.startsWith("frame") ? 0 : 0.7,
        opacity: element.role === "frame-shape" ? 32 : 100,
        roundness: null,
        seed: hashId(`${element.id}:seed`),
        version: 1,
        versionNonce: hashId(`${element.id}:nonce`),
        updated: 1700000000000 + index,
        isDeleted: false,
        groupIds:
          element.role === "title" || element.role.startsWith("frame")
            ? []
            : [`visual-note:${spec.artifactId}:${element.semanticId}`],
        boundElements: [],
        link: null,
        locked: false,
        frameId: null,
        hasTextLink: false,
        ...(element.type === "text"
          ? {
              text: element.text ?? "",
              fontSize:
                element.role === "title"
                  ? 34
                  : element.role === "frame-label"
                    ? 24
                    : element.role === "edge-label"
                      ? 13
                      : 20,
              fontFamily: element.style.fontFamily ?? 1,
              textAlign: element.role === "frame-label" ? "left" : "center",
              verticalAlign: "middle",
              containerId: null,
              originalText: element.text ?? "",
              rawText: element.text ?? "",
              lineHeight: 1.25,
              autoResize: false,
            }
          : {}),
        ...(element.type === "arrow"
          ? {
              points: element.points.map((point) => [...point]),
              elbowed: false,
              lastCommittedPoint: null,
              startBinding: null,
              endBinding: null,
              startArrowhead: null,
              endArrowhead: "arrow",
            }
          : {}),
        customData: structuredClone(element.customData),
      };
    }),
    appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
    files: {},
  };
}
