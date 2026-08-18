import { InputError } from "./errors";
import { compressToBase64, decompressFromBase64 } from "./lz-string";

export type JsonValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ExcalidrawBinding = JsonObject & { elementId?: string | null };
export type ExcalidrawBoundElement = JsonObject & { id?: string; type?: string };
export type ExcalidrawElement = JsonObject & {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  originalText?: string;
  rawText?: string;
  isDeleted?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  points?: JsonValue[];
  customData?: JsonObject;
  boundElements?: Array<string | ExcalidrawBoundElement>;
  groupIds?: string[];
  containerId?: string | null;
  startBinding?: ExcalidrawBinding | null;
  endBinding?: ExcalidrawBinding | null;
  link?: string | null;
};
export type ExcalidrawScene = JsonObject & { elements: ExcalidrawElement[] };

const compressedDrawing = /```compressed-json\n([\s\S]*?)\n```/m;
const plainDrawing = /```json\n([\s\S]*?)\n```/m;

function sceneJson(scene: ExcalidrawScene): string {
  return `${JSON.stringify(scene, null, "\t")}\n`;
}

function textSection(scene: ExcalidrawScene): string {
  const lines = scene.elements
    .filter((element) => element.type === "text" && element.isDeleted !== true)
    .map((element) => `${String(element.text ?? "")} ^${element.id}`);
  return lines.length === 0 ? "## Text Elements\n" : `## Text Elements\n${lines.join("\n\n")}\n`;
}

function chunkedBase64(value: string): string {
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += 256) {
    lines.push(value.slice(index, index + 256));
    lines.push("");
  }
  lines.pop();
  return lines.join("\n");
}

export function encodeSceneToMarkdown(scene: ExcalidrawScene): string {
  return `---\n\nexcalidraw-plugin: parsed\n\n---\n# Excalidraw Data\n\n${textSection(scene)}\n%%\n## Drawing\n\`\`\`compressed-json\n${chunkedBase64(compressToBase64(sceneJson(scene)))}\n\`\`\`\n%%\n`;
}

export function parseSceneMarkdown(markdown: string): {
  readonly scene: ExcalidrawScene;
  readonly compressed: boolean;
} {
  const compressed = markdown.match(compressedDrawing);
  const raw = compressed?.[1] ?? markdown.match(plainDrawing)?.[1];
  if (raw === undefined) throw new InputError("missing Excalidraw drawing block");
  const json = compressed ? decompressFromBase64(raw.replace(/[\r\n]/g, "")) : raw;
  if (json === null) throw new InputError("malformed compressed Excalidraw scene");
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("elements" in parsed) ||
    !Array.isArray((parsed as { elements?: unknown }).elements)
  ) {
    throw new InputError("malformed Excalidraw scene");
  }
  return { scene: parsed as ExcalidrawScene, compressed: compressed !== null };
}
