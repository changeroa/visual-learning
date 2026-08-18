import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { artifactPaths, noteBytes } from "../src/artifact-files";
import {
  type ExcalidrawElement,
  type ExcalidrawScene,
  encodeSceneToMarkdown,
  type JsonValue,
  parseSceneMarkdown,
} from "../src/excalidraw-file";
import { planScene } from "../src/renderer-plan";
import { parseVisualNoteSpec, type VisualNoteSpec } from "../src/schema";

const specV1 = parseVisualNoteSpec(
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures/refresh-v1.json"), "utf8")),
);
const specV2 = parseVisualNoteSpec(
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures/refresh-v2.json"), "utf8")),
);

type FixtureCase =
  | "human-arrow-to-agent"
  | "human-text-container-to-agent"
  | "mixed-group"
  | "removed-agent-anchor"
  | "partial-owner"
  | "cycle";

function agentScene(spec: VisualNoteSpec): ExcalidrawScene {
  const plan = planScene(spec);
  return {
    type: "excalidraw",
    version: 2,
    source: "task-6-fixture",
    elements: plan.elements.map((element, index) => ({
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      angle: 0,
      strokeColor: element.type === "rectangle" ? "#1971c2" : "#000000",
      backgroundColor: element.type === "rectangle" ? "#d0ebff" : "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: null,
      seed: 1000 + index,
      version: 1,
      versionNonce: 2000 + index,
      updated: 1700000000000 + index,
      isDeleted: false,
      groupIds: [],
      boundElements: [],
      link: null,
      locked: false,
      frameId: null,
      hasTextLink: false,
      ...(element.type === "text"
        ? {
            text: element.text ?? "",
            fontSize: element.role === "title" ? 32 : element.role === "edge-label" ? 16 : 20,
            fontFamily: 2,
            textAlign: "center",
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
    })),
    appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
    files: {},
  };
}

function humanElement(
  id: string,
  base: { [key: string]: JsonValue } & {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
): ExcalidrawElement {
  return { ...base, id, customData: { owner: "human", preserved: true } };
}

function serviceShape(scene: ExcalidrawScene): ExcalidrawElement {
  const element = scene.elements.find(
    (candidate) =>
      candidate.customData?.["semanticId"] === "service" && candidate.type === "rectangle",
  );
  if (element === undefined) throw new TypeError("service shape missing");
  return element;
}

function queueShape(scene: ExcalidrawScene): ExcalidrawElement {
  const element = scene.elements.find(
    (candidate) =>
      candidate.customData?.["semanticId"] === "queue" && candidate.type === "rectangle",
  );
  if (element === undefined) throw new TypeError("queue shape missing");
  return element;
}

function addFixtureElements(scene: ExcalidrawScene, fixture: FixtureCase): void {
  const service = serviceShape(scene);
  const queue = queueShape(scene);
  if (fixture === "human-arrow-to-agent") {
    const arrow = humanElement("human-arrow", {
      type: "arrow",
      x: service.x - 200,
      y: service.y + 20,
      width: 200,
      height: 0,
      angle: 0,
      strokeColor: "#c92a2a",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 3,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: null,
      seed: 9001,
      version: 5,
      versionNonce: 7001,
      updated: 1700000009999,
      isDeleted: false,
      groupIds: [],
      boundElements: [],
      link: null,
      locked: false,
      frameId: null,
      hasTextLink: false,
      points: [
        [0, 0],
        [200, 0],
      ],
      elbowed: false,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: { elementId: service.id, focus: 0, gap: 8 },
      startArrowhead: null,
      endArrowhead: "arrow",
    });
    scene.elements.push(arrow);
    service.boundElements = [{ id: arrow.id, type: "arrow" }];
    return;
  }
  if (fixture === "human-text-container-to-agent") {
    const text = humanElement("human-text", {
      type: "text",
      x: service.x + 10,
      y: service.y + 10,
      width: 120,
      height: 20,
      angle: 0,
      strokeColor: "#111111",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: null,
      seed: 9010,
      version: 4,
      versionNonce: 7010,
      updated: 1700000010000,
      isDeleted: false,
      groupIds: [],
      boundElements: [],
      link: null,
      locked: false,
      frameId: null,
      hasTextLink: false,
      text: "Human note",
      fontSize: 18,
      fontFamily: 3,
      textAlign: "left",
      verticalAlign: "top",
      containerId: service.id,
      originalText: "Human note",
      rawText: "Human note",
      lineHeight: 1.25,
      autoResize: false,
    });
    scene.elements.push(text);
    service.boundElements = [{ id: text.id, type: "text" }];
    return;
  }
  if (fixture === "mixed-group") {
    const groupId = "mixed-group-id";
    const shape = humanElement("human-group-box", {
      type: "rectangle",
      x: service.x - 40,
      y: service.y - 40,
      width: service.width + 80,
      height: service.height + 80,
      angle: 0,
      strokeColor: "#5f3dc4",
      backgroundColor: "transparent",
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "dotted",
      roughness: 1,
      opacity: 70,
      roundness: null,
      seed: 9020,
      version: 2,
      versionNonce: 7020,
      updated: 1700000011000,
      isDeleted: false,
      groupIds: [groupId],
      boundElements: [],
      link: null,
      locked: false,
      frameId: null,
      hasTextLink: false,
    });
    service.groupIds = [groupId];
    scene.elements.push(shape);
    return;
  }
  if (fixture === "removed-agent-anchor") {
    const arrow = humanElement("human-to-removed", {
      type: "arrow",
      x: queue.x - 200,
      y: queue.y + 40,
      width: 200,
      height: 0,
      angle: 0,
      strokeColor: "#2b8a3e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 3,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: null,
      seed: 9030,
      version: 6,
      versionNonce: 7030,
      updated: 1700000012000,
      isDeleted: false,
      groupIds: [],
      boundElements: [],
      link: null,
      locked: false,
      frameId: null,
      hasTextLink: false,
      points: [
        [0, 0],
        [200, 0],
      ],
      elbowed: false,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: { elementId: queue.id, focus: 0, gap: 4 },
      startArrowhead: null,
      endArrowhead: "arrow",
    });
    scene.elements.push(arrow);
    queue.boundElements = [{ id: arrow.id, type: "arrow" }];
    return;
  }
  if (fixture === "partial-owner") {
    scene.elements.push({
      ...service,
      id: "partial-owner-element",
      customData: { owner: "agent", artifactId: specV1.artifactId },
    });
    return;
  }
  if (fixture === "cycle") {
    const groupId = "cycle-group";
    const host = humanElement("human-host", {
      type: "rectangle",
      x: service.x - 30,
      y: service.y - 30,
      width: 340,
      height: 180,
      angle: 0,
      strokeColor: "#495057",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: null,
      seed: 9040,
      version: 3,
      versionNonce: 7040,
      updated: 1700000013000,
      isDeleted: false,
      groupIds: [groupId],
      boundElements: [{ id: service.id, type: "text" }],
      link: null,
      locked: false,
      frameId: null,
      hasTextLink: false,
    });
    service.containerId = host.id;
    service.groupIds = [groupId];
    scene.elements.push(host);
  }
}

export function provisionFixture(
  vault: string,
  fixture: FixtureCase,
): { readonly project: string } {
  const project = fixture;
  const paths = artifactPaths(project, specV1.artifactId);
  mkdirSync(join(vault, paths.drawingFolder), { recursive: true });
  mkdirSync(join(vault, join(paths.base, "01 Architecture")), { recursive: true });
  mkdirSync(join(vault, join(paths.base, "_generated/specs")), { recursive: true });
  const scene = agentScene(specV1);
  addFixtureElements(scene, fixture);
  writeFileSync(join(vault, paths.drawing), encodeSceneToMarkdown(scene));
  writeFileSync(join(vault, paths.spec), `${JSON.stringify(specV1, null, 2)}\n`);
  writeFileSync(join(vault, paths.note), noteBytes(specV1, paths.drawing, paths.svg));
  return { project };
}

export function readFixtureScene(vault: string, project: string): ExcalidrawScene {
  const drawing = artifactPaths(project, specV1.artifactId).drawing;
  return parseSceneMarkdown(readFileSync(join(vault, drawing), "utf8")).scene;
}

export function writeFixtureScene(vault: string, project: string, scene: ExcalidrawScene): void {
  const drawing = artifactPaths(project, specV1.artifactId).drawing;
  writeFileSync(join(vault, drawing), encodeSceneToMarkdown(scene));
}

export function beforeAfterHuman(vault: string, project: string): readonly ExcalidrawElement[] {
  return readFixtureScene(vault, project).elements.filter(
    (element) =>
      element.customData?.["owner"] === "human" || element.customData?.["owner"] === undefined,
  );
}

export { specV1, specV2 };
