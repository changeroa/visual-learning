import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { ConflictError, RuntimeError } from "../../src/errors";
import { sha256 } from "../../src/io";
import type { VisualNoteSpec } from "../../src/schema";
import { refreshTransaction } from "../../src/transaction-engine";
import { readState } from "../../src/transaction-state";
import type { Boundary } from "../../src/transaction-types";
import { command } from "./renderer-live-support";
import {
  armProductionPath,
  awaitProductionEvent,
  parseProductionEval,
  productionCli,
  shutdownDefault,
} from "./renderer-production-support";

export const PLUGIN_DATA =
  "/Users/billionjaepyo/Documents/Obsidian Vault/.obsidian/plugins/obsidian-excalidraw-plugin/data.json";
const PLUGIN_SHA = "0f8578ba59eb6f323d27e566af324e92375ef98c0ded96aa55b3dd260be45d25";

export function pgrepAny(): boolean {
  return (
    command(["/usr/bin/pgrep", "-x", "Obsidian"], process.env).exitCode === 0 ||
    command(["/usr/bin/pgrep", "-f", "Obsidian.app/Contents/MacOS"], process.env).exitCode === 0
  );
}

export function fileState(path: string): { readonly bytes: number; readonly sha256: string } {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

export async function launch(
  app: string,
  vault: string,
): Promise<{ readonly pid: number; readonly events: readonly string[] }> {
  const socket = await armProductionPath(
    process.env["HOME"] ?? "",
    ".obsidian-cli.sock",
    "present",
  );
  const workspace = await armProductionPath(join(vault, ".obsidian"), "workspace.json", "change");
  const child = Bun.spawn([app], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  const events = await Promise.all([awaitProductionEvent(socket), awaitProductionEvent(workspace)]);
  const args = command(["/bin/ps", "-p", String(child.pid), "-o", "args="], process.env);
  if (args.exitCode !== 0 || args.stdout.trim() !== app)
    throw new RuntimeError(`unexpected production PID identity: ${args.stdout.trim()}`);
  return { pid: child.pid, events };
}

export async function quit(pid: number): Promise<unknown> {
  return shutdownDefault(pid);
}

export async function waitForScene(
  path: string,
  predicate: (scene: { elements: readonly { id: string }[] }) => boolean,
  timeoutMs: number,
): Promise<void> {
  const { watch } = await import("node:fs");
  const { sceneAt } = await import("./desktop-support");
  const check = () => predicate(sceneAt(path));
  if (check()) return;
  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watcher = watch(dirname(path), (_event, changed) => {
      if (changed !== basename(path)) return;
      try {
        if (check()) {
          cleanup();
          resolve();
        }
      } catch {
        /* transient partial write; keep waiting */
      }
    });
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      watcher.close();
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new RuntimeError(`timeout waiting for scene content: ${path}`));
    }, timeoutMs);
  });
}

export function runEval(cli: string, vaultId: string, code: string): unknown {
  const result = command([cli, `vault=${vaultId}`, "eval", `code=${code}`], process.env);
  if (result.exitCode !== 0 || /Error:|not enabled/i.test(`${result.stdout}${result.stderr}`))
    throw new RuntimeError(result.stderr.trim() || result.stdout.trim() || "Obsidian eval failed");
  return parseProductionEval(result.stdout.trim());
}

const viewSchema = z.object({ path: z.string().nullable(), excalidraw: z.boolean() });

export function activeView(cli: string, vaultId: string): z.infer<typeof viewSchema> {
  return viewSchema.parse(
    runEval(
      cli,
      vaultId,
      "(()=>{const v=app.workspace.activeLeaf?.view;return JSON.stringify({path:v?.file?.path??null,excalidraw:typeof v?.getViewElements==='function'});})()",
    ),
  );
}

export function assertActiveWorking(cli: string, vaultId: string, relative: string): void {
  const activate = `(async()=>{const want=${JSON.stringify(relative)};let leaf=null;app.workspace.iterateAllLeaves(l=>{if(l.view?.file?.path===want)leaf=l;});if(!leaf){const f=app.vault.getAbstractFileByPath(want);if(!f)throw new Error('VISUAL_NOTE_FILE_MISSING');leaf=app.workspace.getLeaf(false);await leaf.openFile(f,{active:true});}app.workspace.setActiveLeaf(leaf,{focus:true});for(let i=0;i<50&&!(app.workspace.activeLeaf?.view?.getViewElements);i++){await new Promise(r=>setTimeout(r,20));}const v=app.workspace.activeLeaf?.view;return JSON.stringify({path:v?.file?.path??null,excalidraw:typeof v?.getViewElements==='function'});})()`;
  const view = viewSchema.parse(runEval(cli, vaultId, activate));
  if (view.path !== relative || !view.excalidraw)
    throw new RuntimeError(`active view is not the working copy: ${JSON.stringify(view)}`);
}

export function dismissWelcomeOnce(cli: string, vaultId: string): { readonly modal: boolean } {
  const probe =
    "(()=>JSON.stringify({modal:!!document.querySelector('.modal-container .modal')}))()";
  const modal = runEval(cli, vaultId, probe) as { modal: boolean };
  if (!modal.modal) return { modal: false };
  runEval(
    cli,
    vaultId,
    "(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true}));return JSON.stringify({dispatched:true});})()",
  );
  const after = runEval(cli, vaultId, probe) as { modal: boolean };
  if (after.modal) throw new RuntimeError("welcome modal obstructs the canvas after Esc");
  return { modal: true };
}

export function screenshot(cli: string, path: string): void {
  productionCli(["dev:screenshot", `path=${path}`], cli);
  if (!existsSync(path) || lstatSync(path).size === 0)
    throw new RuntimeError(`Obsidian screenshot is absent: ${path}`);
}

export function assertPluginReady(cli: string, vaultId: string): void {
  const code =
    "(()=>{const p=app.plugins.getPlugin('obsidian-excalidraw-plugin');const ea=window.ExcalidrawAutomate;return JSON.stringify({loaded:!!p,version:p?.manifest.version,getAPI:typeof ea?.getAPI==='function',view:typeof ea?.getAPI()?.setView==='function'});})()";
  z.object({
    loaded: z.literal(true),
    version: z.string(),
    getAPI: z.literal(true),
    view: z.literal(true),
  }).parse(runEval(cli, vaultId, code));
}

export function assertVaultIdentity(cli: string, vaultId: string, vault: string): void {
  if (productionCli(["vault", "info=path"], cli) !== vault)
    throw new RuntimeError(`vault identity mismatch for ${vaultId}`);
}

export type InjectionResult = { readonly kind: "conflict" | "success"; readonly message?: string };

export function refreshWithInjection(input: {
  readonly vault: string;
  readonly project: string;
  readonly spec: VisualNoteSpec;
  readonly expectedToken: string;
  readonly boundary: Boundary;
  readonly inject: () => void;
}): InjectionResult {
  try {
    refreshTransaction(
      {
        vault: input.vault,
        project: input.project,
        spec: input.spec,
        expectedToken: input.expectedToken,
      },
      {
        onBoundary: (name) => {
          if (name === input.boundary) input.inject();
        },
      },
    );
    return { kind: "success" };
  } catch (error) {
    if (error instanceof ConflictError) return { kind: "conflict", message: error.message };
    throw error;
  }
}

export function stateOf(vault: string, project: string, artifactId: string) {
  return readState(
    join(vault, "Engineering Atlas/10 Projects", project, "_history", artifactId, "STATE"),
  );
}

export function restorePluginData(
  path: string,
  expectedSha = PLUGIN_SHA,
): {
  readonly status: "UNCHANGED" | "RESTORED" | "BLOCKED";
  readonly before: { readonly bytes: number; readonly sha256: string };
  readonly after?: { readonly bytes: number; readonly sha256: string };
  readonly detail: string;
} {
  const before = fileState(path);
  if (before.sha256 === expectedSha)
    return { status: "UNCHANGED", before, detail: "authoritative hash" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return {
      status: "BLOCKED",
      before,
      detail: `malformed plugin data: ${(error as Error).message}`,
    };
  }
  if (typeof parsed !== "object" || parsed === null || !("previousRelease" in parsed))
    return { status: "BLOCKED", before, detail: "previousRelease field missing" };
  const restored = { ...(parsed as Record<string, unknown>), previousRelease: "0.0.0" };
  const bytes = JSON.stringify(restored, null, 2);
  if (sha256(bytes) !== expectedSha)
    return {
      status: "BLOCKED",
      before,
      detail: "semantic drift beyond the single previousRelease field",
    };
  const staged = `${path}.task12-restore`;
  const descriptor = openSync(staged, "wx");
  try {
    writeSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(staged, path);
  const directory = openSync(dirname(path), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
  const after = fileState(path);
  if (after.sha256 !== expectedSha)
    return { status: "BLOCKED", before, after, detail: "restore mismatch" };
  return { status: "RESTORED", before, after, detail: "restored $.previousRelease=0.0.0" };
}
