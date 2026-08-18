import { rmSync } from "node:fs";
import { join } from "node:path";
import type { ReadableStreamDefaultReader as NodeStreamReader } from "node:stream/web";
import { z } from "zod";
import { RuntimeError } from "../../src/errors";
import { command } from "./renderer-live-support";

const EVIDENCE_BIN = "/Users/billionjaepyo/tmp/.omo/evidence/agent-visual-learning-vault/bin";
const APP = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
export const PRODUCTION_VAULT = "/Users/billionjaepyo/Documents/Obsidian Vault";
export const PRODUCTION_VAULT_ID = "40a8c869a3fef0af";
const sceneSchema = z.array(
  z.object({
    id: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    points: z.unknown(),
    customData: z.object({
      owner: z.literal("agent"),
      artifactId: z.literal("renderer-gallery"),
      semanticId: z.string(),
      elementRole: z.string(),
      status: z.enum(["fact", "inference", "question"]),
    }),
  }),
);
type Watcher = {
  readonly child: Bun.Subprocess<"ignore", "pipe", "pipe">;
  readonly reader: NodeStreamReader<Uint8Array<ArrayBuffer>>;
  readonly prefix: string;
};

async function armed(child: Watcher["child"], markers: readonly string[]): Promise<Watcher> {
  const reader = child.stdout.getReader();
  let prefix = "";
  while (!markers.some((marker) => prefix.includes(marker))) {
    const chunk = await reader.read();
    if (chunk.done) break;
    prefix += new TextDecoder().decode(chunk.value);
  }
  if (!markers.some((marker) => prefix.includes(marker)))
    throw new RuntimeError("failed to arm production event watcher");
  return { child, reader, prefix };
}

export async function armProductionPath(
  parent: string,
  name: string,
  want: string,
): Promise<Watcher> {
  const child = Bun.spawn(
    [
      "/usr/bin/python3",
      join(EVIDENCE_BIN, "task-2-wait-path-state.py"),
      "--parent",
      parent,
      "--name",
      name,
      "--want",
      want,
      "--timeout-ms",
      "60000",
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  return armed(child, ["READY\n", "ALREADY_SATISFIED\n"]);
}

export async function awaitProductionEvent(watcher: Watcher): Promise<string> {
  let output = watcher.prefix;
  while (true) {
    const chunk = await watcher.reader.read();
    if (chunk.done) break;
    output += new TextDecoder().decode(chunk.value);
  }
  if ((await watcher.child.exited) !== 0) throw new RuntimeError("production event failed");
  return output.trim();
}

async function armPid(pid: number): Promise<Watcher> {
  const child = Bun.spawn(
    [
      "/usr/bin/python3",
      join(EVIDENCE_BIN, "task-2-wait-pid.py"),
      "--pid",
      String(pid),
      "--timeout-ms",
      "60000",
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  return armed(child, ["READY\n", "ALREADY_EXITED\n"]);
}

export function productionCli(argv: readonly string[], executable: string): string {
  const result = command([executable, `vault=${PRODUCTION_VAULT_ID}`, ...argv], process.env);
  if (result.exitCode !== 0 || /Error:|not enabled/i.test(`${result.stdout}\n${result.stderr}`))
    throw new RuntimeError(result.stderr.trim() || result.stdout.trim() || "Obsidian CLI failed");
  return result.stdout.trim();
}

export function parseProductionEval(output: string): unknown {
  const payload = output.replace(/^=> /, "");
  const parsed: unknown = JSON.parse(payload);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

export function productionScene(executable: string): z.infer<typeof sceneSchema> {
  const code =
    "(()=>JSON.stringify((app.workspace.activeLeaf?.view?.getViewElements?.()??[]).map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,width:e.width,height:e.height,points:e.points??null,customData:e.customData??null})).sort((a,b)=>a.id.localeCompare(b.id))))()";
  return sceneSchema.parse(
    parseProductionEval(productionCli(["eval", `code=${code}`], executable)),
  );
}

export async function shutdownDefault(pid: number): Promise<unknown> {
  const inspected = command(["/bin/ps", "-p", String(pid), "-o", "args="], process.env);
  if (inspected.exitCode !== 0) {
    rmSync(join(process.env["HOME"] ?? "", ".obsidian-cli.sock"), { force: true });
    return { alreadyExited: true, appleScriptUsed: false };
  }
  if (inspected.stdout.trim() !== APP)
    throw new RuntimeError(`refusing to quit unowned default-profile PID ${pid}`);
  const exited = await armPid(pid);
  const socket = await armProductionPath(process.env["HOME"] ?? "", ".obsidian-cli.sock", "absent");
  const quit = command(
    ["/usr/bin/osascript", "-e", 'tell application id "md.obsidian" to quit'],
    process.env,
  );
  if (quit.exitCode !== 0) throw new RuntimeError(`Obsidian quit failed: ${quit.stderr}`);
  return {
    pid: await awaitProductionEvent(exited),
    socket: await awaitProductionEvent(socket),
    appleScriptUsed: true,
  };
}
