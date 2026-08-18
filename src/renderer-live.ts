import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type ArtifactPaths, artifactPaths, noteBytes } from "./artifact-files";
import { RuntimeError } from "./errors";
import { jsonBytes, readJson, sha256 } from "./io";
import { planScene } from "./renderer-plan";
import type { VisualNoteSpec } from "./schema";

const PLUGIN_ID = "obsidian-excalidraw-plugin";
const RENDERER_PATH = "Engineering Atlas/95 System/scripts/visual-note-renderer.md";
const runtimeSchema = z
  .object({
    status: z.literal("READY"),
    plugin: z.object({ id: z.literal(PLUGIN_ID), version: z.string() }),
    scriptEngine: z
      .object({ automatePresent: z.literal(true), scriptEnginePresent: z.literal(true) })
      .passthrough(),
  })
  .passthrough();
const pluginSchema = z
  .object({
    plugin: z.object({
      id: z.literal(PLUGIN_ID),
      version: z.string(),
      directory: z.string(),
      assets: z.array(z.object({ name: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
    }),
  })
  .passthrough();
const renderResultSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("VisualNoteScriptEngineRenderResult"),
  drawingPath: z.string(),
  svgPath: z.string(),
  notePath: z.string(),
  specPath: z.string(),
  elementCount: z.number().int().positive(),
  elementIds: z.array(z.string()),
});

export type RenderLiveInput = {
  readonly cli: string;
  readonly vault: string;
  readonly verifiedVaultId: string;
  readonly project: string;
  readonly spec: VisualNoteSpec;
  readonly runtimeReceipt: string;
  readonly pluginReceipt: string;
};

function run(cli: string, vaultId: string, command: readonly string[]): string {
  const result = Bun.spawnSync([cli, `vault=${vaultId}`, ...command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();
  if (result.exitCode !== 0 || stderr.includes("Error") || stdout.includes("Error:")) {
    throw new RuntimeError(stderr || stdout || `Obsidian CLI exited ${result.exitCode}`);
  }
  return stdout;
}

function parseEval(stdout: string): unknown {
  const payload = stdout.startsWith("=> ") ? stdout.slice(3) : stdout;
  try {
    const parsed: unknown = JSON.parse(payload);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch (error) {
    throw new RuntimeError("Obsidian eval returned malformed output", { cause: error });
  }
}

function verifyPlugin(input: RenderLiveInput): string {
  const runtime = runtimeSchema.parse(readJson(input.runtimeReceipt));
  const receipt = pluginSchema.parse(readJson(input.pluginReceipt));
  if (runtime.plugin.version !== receipt.plugin.version)
    throw new RuntimeError("runtime and plugin receipts disagree on version");
  for (const asset of receipt.plugin.assets) {
    const source = join(receipt.plugin.directory, asset.name);
    const target = join(input.vault, ".obsidian/plugins", PLUGIN_ID, asset.name);
    if (
      sha256(readFileSync(source)) !== asset.sha256 ||
      sha256(readFileSync(target)) !== asset.sha256
    )
      throw new RuntimeError(`tampered plugin asset: ${asset.name}`);
  }
  const renderer = join(input.vault, RENDERER_PATH);
  const packaged = new URL("../assets/visual-note-renderer.md", import.meta.url).pathname;
  if (sha256(readFileSync(renderer)) !== sha256(readFileSync(packaged)))
    throw new RuntimeError("in-vault Script Engine renderer is missing or tampered");
  return runtime.plugin.version;
}

function verifyTargetState(
  vault: string,
  output: ArtifactPaths,
  specBytes: string,
  note: string,
): void {
  const files = [output.drawing, output.svg, output.note, output.spec];
  const present = files.map((path) => Bun.file(join(vault, path)).size > 0);
  if (present.some(Boolean) && !present.every(Boolean))
    throw new RuntimeError("stale partial renderer bundle");
  if (present.every(Boolean)) {
    if (readFileSync(join(vault, output.spec), "utf8") !== specBytes)
      throw new RuntimeError("dirty target spec");
    if (readFileSync(join(vault, output.note), "utf8") !== note)
      throw new RuntimeError("dirty target companion note");
    for (const path of files)
      if (lstatSync(join(vault, path)).isSymbolicLink())
        throw new RuntimeError("symlink target rejected");
  }
}

export function renderLive(input: RenderLiveInput): z.infer<typeof renderResultSchema> & {
  readonly pluginVersion: string;
} {
  if (process.env["VISUAL_NOTE_INJECT"] === "plugin-api-error")
    throw new RuntimeError("injected plugin API failure");
  const pluginVersion = verifyPlugin(input);
  const output = artifactPaths(input.project, input.spec.artifactId);
  const normalizedSpec = jsonBytes(input.spec);
  const companion = noteBytes(input.spec, output.drawing, output.svg);
  verifyTargetState(input.vault, output, normalizedSpec, companion);
  const observed = run(input.cli, input.verifiedVaultId, ["vault", "info=path"]);
  if (observed !== input.vault)
    throw new RuntimeError(`wrong vault: expected ${input.vault}, observed ${observed}`);
  const readinessCode = `(()=>{const p=app.plugins.getPlugin('${PLUGIN_ID}');const ea=window.ExcalidrawAutomate;const f=app.vault.getAbstractFileByPath('${RENDERER_PATH}');return JSON.stringify({loaded:!!p,version:p?.manifest?.version,script:!!f,execute:typeof p?.scriptEngine?.executeScript==='function',create:typeof ea?.create==='function',svg:typeof ea?.createSVG==='function',copy:typeof ea?.copyViewElementsToEAforEditing==='function',commit:typeof ea?.addElementsToView==='function',custom:typeof ea?.addAppendUpdateCustomData==='function'});})()`;
  const readiness = z
    .object({
      loaded: z.literal(true),
      version: z.literal(pluginVersion),
      script: z.literal(true),
      execute: z.literal(true),
      create: z.literal(true),
      svg: z.literal(true),
      copy: z.literal(true),
      commit: z.literal(true),
      custom: z.literal(true),
    })
    .parse(parseEval(run(input.cli, input.verifiedVaultId, ["eval", `code=${readinessCode}`])));
  void readiness;
  const request = {
    schemaVersion: 1,
    plan: planScene(input.spec),
    paths: output,
    specBytes: normalizedSpec,
    noteBytes: companion,
  } as const;
  const executeCode = `(async()=>{const p=app.plugins.getPlugin('${PLUGIN_ID}');const sf=app.vault.getAbstractFileByPath('${RENDERER_PATH}');const df=app.vault.getAbstractFileByPath(${JSON.stringify(output.drawing)});let view=undefined;if(df){const leaf=app.workspace.getLeaf(false);await leaf.openFile(df);view=leaf.view;if(view?.file?.path!==${JSON.stringify(output.drawing)})throw new Error('VISUAL_NOTE_VIEW_MISMATCH');}globalThis.__visualNoteRenderRequest=${JSON.stringify(request)};const result=await p.scriptEngine.executeScript(view,await app.vault.read(sf),'visual-note-renderer',sf);const renderedFile=app.vault.getAbstractFileByPath(result.drawingPath);const leaf=app.workspace.getLeaf(false);await leaf.openFile(renderedFile);if(leaf.view?.file?.path!==result.drawingPath)throw new Error('VISUAL_NOTE_POST_RENDER_VIEW_MISMATCH');return JSON.stringify(result);})()`;
  const result = renderResultSchema.parse(
    parseEval(run(input.cli, input.verifiedVaultId, ["eval", `code=${executeCode}`])),
  );
  return { ...result, pluginVersion };
}
