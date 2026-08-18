import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { InputError } from "../../src/errors";
import {
  type ExcalidrawScene,
  type JsonValue,
  parseSceneMarkdown,
} from "../../src/excalidraw-file";
import { jsonBytes } from "../../src/io";
import { parseVisualNoteSpec, type VisualNoteSpec } from "../../src/schema";

export function stableStringify(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sceneAt(path: string): ExcalidrawScene {
  return parseSceneMarkdown(readFileSync(path, "utf8")).scene;
}

function humanOwnership(element: ExcalidrawScene["elements"][number]): string {
  const owner = element.customData?.["owner"];
  if (owner === undefined || owner === "human") return "human";
  if (owner !== "agent") throw new InputError(`partial ownership on ${element.id}`);
  return "agent";
}

export function humanSnapshot(scene: ExcalidrawScene): ReadonlyMap<string, string> {
  const snapshot = new Map<string, string>();
  for (const element of scene.elements)
    if (humanOwnership(element) === "human") snapshot.set(element.id, stableStringify(element));
  return snapshot;
}

export function agentIds(scene: ExcalidrawScene): readonly string[] {
  return scene.elements.filter((e) => humanOwnership(e) === "agent").map((e) => e.id);
}

export function semanticElementId(
  scene: ExcalidrawScene,
  semanticId: string,
  role: string,
): string {
  const found = scene.elements.find(
    (element) =>
      element.customData?.["semanticId"] === semanticId &&
      element.customData?.["elementRole"] === role,
  );
  if (found === undefined) throw new InputError(`missing agent element ${semanticId}:${role}`);
  return found.id;
}

export type ImmutableSnapshot = {
  readonly digest: string;
  readonly files: Readonly<Record<string, string>>;
};

export function immutableSnapshot(historyRoot: string): ImmutableSnapshot {
  const files: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      if (name === ".rwlock" || name === "burned") continue;
      const absolute = join(directory, name);
      if (statSync(absolute).isDirectory()) {
        files[relative(historyRoot, absolute)] = "directory";
        visit(absolute);
        continue;
      }
      files[relative(historyRoot, absolute)] = createHash("sha256")
        .update(readFileSync(absolute))
        .digest("hex");
    }
  };
  visit(join(historyRoot, "revisions"));
  for (const marker of ["STATE", "COMMITTED"])
    if (existsSync(join(historyRoot, marker)))
      files[marker] = createHash("sha256")
        .update(readFileSync(join(historyRoot, marker)))
        .digest("hex");
  const digest = createHash("sha256")
    .update(
      Object.keys(files)
        .sort()
        .map((key) => `${key}\0${files[key]}`)
        .join("\n"),
    )
    .digest("hex");
  return { digest, files };
}

export function unchangedWithin(previous: ImmutableSnapshot, current: ImmutableSnapshot): boolean {
  return Object.entries(previous.files).every(([path, sha]) => current.files[path] === sha);
}

export function unchangedRevisions(
  previous: ImmutableSnapshot,
  current: ImmutableSnapshot,
): boolean {
  return Object.entries(previous.files)
    .filter(([path]) => path.startsWith("revisions/"))
    .every(([path, sha]) => current.files[path] === sha);
}

export function burnedTokens(historyRoot: string): readonly string[] {
  const root = join(historyRoot, "burned");
  return existsSync(root) ? readdirSync(root).sort() : [];
}

export function deriveSpec(
  base: VisualNoteSpec,
  change: { readonly remove?: string; readonly suffix: string },
): VisualNoteSpec {
  const nodes = base.nodes.filter((node) => node.semanticId !== change.remove);
  const kept = new Set(nodes.map((node) => node.semanticId));
  const edges = base.edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to));
  return parseVisualNoteSpec({
    ...structuredClone(base),
    revision: base.revision + 1,
    title: `${base.title} ${change.suffix}`,
    nodes,
    edges,
  });
}

export function specBytes(spec: VisualNoteSpec): string {
  return jsonBytes(spec);
}

export function pngMagic(path: string): boolean {
  const header = readFileSync(path).subarray(0, 8);
  return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
}

export function assertEmbedding(
  notePath: string,
  svgPath: string,
  drawingRel: string,
  svgRel: string,
): void {
  const note = readFileSync(notePath, "utf8");
  const svg = readFileSync(svgPath, "utf8");
  if (!svg.startsWith("<svg") || !svg.includes("</svg>"))
    throw new InputError(`SVG is malformed: ${svgRel}`);
  if (!note.includes(`![[${drawingRel}]]`) || !note.includes(`SVG: [[${svgRel}]]`))
    throw new InputError(`companion note does not embed the drawing: ${notePath}`);
}

export type EmbeddingInput = {
  readonly drawing: string;
  readonly svg: string;
  readonly note: string;
};

export function checkLiveSvg(vault: string, input: EmbeddingInput, minimumBytes: number): void {
  const svg = readFileSync(join(vault, input.svg), "utf8");
  if (!svg.includes("viewBox") || svg.length < minimumBytes)
    throw new InputError(`live SVG export is not a real drawing: ${input.svg}`);
  assertEmbedding(join(vault, input.note), join(vault, input.svg), input.drawing, input.svg);
}

export function evalCodes(input: {
  readonly path: string;
  readonly targetId: string;
  readonly textId: string;
  readonly drawId: string;
  readonly concurrentId: string;
  readonly nonce: string;
}): {
  readonly text: string;
  readonly freehand: string;
  readonly concurrent: string;
  readonly save: string;
} {
  const view = `const v=(app.workspace.activeLeaf??app.workspace.getMostRecentLeaf?.())?.view;`;
  const guard = `if(!v||v.file?.path!==${JSON.stringify(input.path)}||typeof v.getViewElements!=='function')throw new Error('VISUAL_NOTE_VIEW_MISMATCH');const ea=ExcalidrawAutomate.getAPI(v);for(let i=0;i<150&&ea.getViewElements().length===0;i++){await new Promise(r=>setTimeout(r,20));}if(ea.getViewElements().length===0)throw new Error('VISUAL_NOTE_SCENE_EMPTY');`;
  const target = `const t=ea.getViewElements().find(e=>e.id===${JSON.stringify(input.targetId)});if(!t)throw new Error('VISUAL_NOTE_TARGET_MISSING');`;
  return {
    text: `(async()=>{${view}${guard}${target}ea.style.strokeColor='#c92a2a';ea.style.fontSize=20;const newId=ea.addText(t.x+t.width+40,t.y,'사람 메모: 이 흐름 다시 확인 (human note)',{width:260});ea.addAppendUpdateCustomData(newId,{owner:'human',attachedTo:${JSON.stringify(input.targetId)},note:${JSON.stringify(`task-12:${input.nonce}`)}});const ok=await ea.addElementsToView(false,true);const mine=ea.getViewElements().find(e=>e.customData&&e.customData.note===${JSON.stringify(`task-12:${input.nonce}`)});return JSON.stringify({committed:ok===true&&!!mine,id:mine?mine.id:null});})()`,
    freehand: `(async()=>{${view}${guard}${target}const tpl=ea.getViewElements().find(e=>e.type==='rectangle');if(!tpl)throw new Error('VISUAL_NOTE_TEMPLATE_MISSING');const el=JSON.parse(JSON.stringify(tpl));delete el.text;delete el.originalText;delete el.rawText;delete el.fontSize;el.id=${JSON.stringify(input.drawId)};el.type='freedraw';el.x=t.x-30;el.y=t.y+t.height+40;el.width=220;el.height=44;el.points=[[0,0],[46,24],[98,-16],[152,28],[220,-10]];el.pressures=null;el.lastCommittedPoint=null;el.simulatePressure=true;el.seed=424242;el.versionNonce=242424;el.version=1;el.strokeColor='#087f5b';el.backgroundColor='transparent';el.fillStyle='hachure';el.strokeWidth=2;el.roughness=1;el.customData=null;el.groupIds=[];el.boundElements=null;el.containerId=null;el.frameId=null;el.link=null;ea.elementsDict[el.id]=el;const ok=await ea.addElementsToView(false,true);return JSON.stringify({committed:ok===true,id:el.id,untagged:true});})()`,
    concurrent: `(async()=>{${view}${guard}${target}const tpl=ea.getViewElements().find(e=>e.type==='rectangle');if(!tpl)throw new Error('VISUAL_NOTE_TEMPLATE_MISSING');const el=JSON.parse(JSON.stringify(tpl));delete el.text;delete el.originalText;delete el.rawText;delete el.fontSize;el.id=${JSON.stringify(input.concurrentId)};el.type='freedraw';el.x=t.x+30;el.y=t.y+t.height+80;el.width=180;el.height=36;el.points=[[0,0],[-38,20],[-86,-12],[-134,22],[-180,-8]];el.pressures=null;el.lastCommittedPoint=null;el.simulatePressure=true;el.seed=909090;el.versionNonce=909;el.version=1;el.strokeColor='#5c940d';el.backgroundColor='transparent';el.fillStyle='hachure';el.strokeWidth=2;el.roughness=1;el.customData={owner:'human',note:'task-12-concurrent'};el.groupIds=[];el.boundElements=null;el.containerId=null;el.frameId=null;el.link=null;ea.elementsDict[el.id]=el;const ok=await ea.addElementsToView(false,false);await v.forceSave(true);return JSON.stringify({committed:ok===true,forced:true,id:el.id});})()`,
    save: `(async()=>{${view}${guard}if(typeof v.forceSave!=='function')throw new Error('VISUAL_NOTE_SAVE_MISSING');await v.forceSave(true);return JSON.stringify({saved:true,path:v.file.path});})()`,
  };
}

export function humansEqual(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  return left.size === right.size && [...left].every(([id, value]) => right.get(id) === value);
}

export function elementIds(nonce: string): {
  readonly text: string;
  readonly freehand: string;
  readonly concurrent: string;
} {
  return {
    text: `human-note-${nonce}`,
    freehand: `human-freehand-${nonce}`,
    concurrent: `human-concurrent-${nonce}`,
  };
}

export type CliContext = {
  readonly note: string;
  readonly vault: string;
  readonly project: string;
};

export function noteArgs(
  ctx: CliContext,
  kind: "open" | "refresh" | "restore" | "extend" | "create",
  extra: readonly string[] = [],
): string[] {
  const base =
    kind === "extend"
      ? [ctx.note, kind]
      : [
          ctx.note,
          kind,
          "--vault",
          ctx.vault,
          "--expected-vault",
          ctx.vault,
          "--project",
          ctx.project,
        ];
  return [...base, ...extra];
}

export function readBurn(historyRoot: string, token: string): { token: string; reason: string } {
  return JSON.parse(readFileSync(join(historyRoot, "burned", token), "utf8")) as {
    token: string;
    reason: string;
  };
}
