#!/usr/bin/env bun
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { RuntimeError } from "../../src/errors";
import { command, parseOptions, required } from "./renderer-live-support";
import {
  armProductionPath,
  awaitProductionEvent,
  PRODUCTION_VAULT,
  PRODUCTION_VAULT_ID,
  parseProductionEval,
  productionCli,
  productionScene,
  shutdownDefault,
} from "./renderer-production-support";

const APP = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const PLUGIN_ID = "obsidian-excalidraw-plugin";
const FIXTURE = "Engineering Atlas/10 Projects/task-5-fixture";
const resultSchema = z.object({
  operation: z.literal("create"),
  drawingPath: z.string(),
  svgPath: z.string(),
  notePath: z.string(),
  specPath: z.string(),
  elementCount: z.number().int().positive(),
  elementIds: z.array(z.string()),
});

type Receipt = {
  readonly schemaVersion: 1;
  readonly type: "Task5ProductionRendererReceipt";
  readonly status: "PASS";
  readonly vaultId: string;
  readonly vault: string;
  readonly launch: unknown;
  readonly first: z.infer<typeof resultSchema>;
  readonly second: z.infer<typeof resultSchema>;
  readonly firstScene: ReturnType<typeof productionScene>;
  readonly secondScene: ReturnType<typeof productionScene>;
  readonly deterministic: true;
  readonly screenshot: string;
  readonly evidenceCopies: readonly string[];
  readonly failure: { readonly exitCode: number; readonly outputsPresent: false };
};

function assertPluginReady(cliExecutable: string): void {
  const code = `(()=>{const p=app.plugins.getPlugin('${PLUGIN_ID}');const ea=window.ExcalidrawAutomate;return JSON.stringify({loaded:!!p,version:p?.manifest.version,execute:typeof p?.scriptEngine?.executeScript==='function',automate:!!ea,create:typeof ea?.create==='function',svg:typeof ea?.createSVG==='function'});})()`;
  z.object({
    loaded: z.literal(true),
    version: z.literal("2.26.4"),
    execute: z.literal(true),
    automate: z.literal(true),
    create: z.literal(true),
    svg: z.literal(true),
  }).parse(parseProductionEval(productionCli(["eval", `code=${code}`], cliExecutable)));
}

function renderArgs(
  values: ReturnType<typeof parseOptions>,
  cliExecutable: string,
): readonly string[] {
  return [
    join(import.meta.dir, "../../bin/visual-note"),
    "create",
    "--vault",
    PRODUCTION_VAULT,
    "--expected-vault",
    PRODUCTION_VAULT,
    "--verified-vault-id",
    PRODUCTION_VAULT_ID,
    "--project",
    "task-5-fixture",
    "--spec",
    required(values, "--spec"),
    "--obsidian-cli",
    cliExecutable,
    "--runtime-receipt",
    required(values, "--runtime-receipt"),
    "--plugin-receipt",
    required(values, "--plugin-receipt"),
    "--json",
  ];
}

function renderOnce(argv: readonly string[]): z.infer<typeof resultSchema> {
  const result = command(argv, process.env);
  if (result.exitCode !== 0) throw new RuntimeError(result.stderr.trim() || "renderer failed");
  return resultSchema.parse(JSON.parse(result.stdout));
}

function verifyAndCopy(result: z.infer<typeof resultSchema>, evidence: string): readonly string[] {
  const drawing = join(PRODUCTION_VAULT, result.drawingPath);
  const svg = join(PRODUCTION_VAULT, result.svgPath);
  const note = join(PRODUCTION_VAULT, result.notePath);
  const noteText = readFileSync(note, "utf8");
  if (!readFileSync(svg, "utf8").includes("<svg") || !noteText.includes(result.drawingPath))
    throw new RuntimeError("SVG or companion note acceptance failed");
  const prefix = join(dirname(evidence), "task-5-gallery");
  const copies = [`${prefix}.excalidraw.md`, `${prefix}.svg`, `${prefix}-note.md`] as const;
  copyFileSync(drawing, copies[0]);
  copyFileSync(svg, copies[1]);
  copyFileSync(note, copies[2]);
  return copies;
}

function verifyFailure(values: ReturnType<typeof parseOptions>, evidence: string): number {
  const failureBase = join(PRODUCTION_VAULT, "Engineering Atlas/10 Projects/task-5-failure");
  const failure = command(
    [
      join(import.meta.dir, "../../bin/visual-note"),
      "create",
      "--vault",
      PRODUCTION_VAULT,
      "--expected-vault",
      PRODUCTION_VAULT,
      "--verified-vault-id",
      PRODUCTION_VAULT_ID,
      "--project",
      "task-5-failure",
      "--spec",
      required(values, "--failure-spec"),
      "--assert-no-write",
      "--json",
    ],
    { ...process.env, VISUAL_NOTE_INJECT: "plugin-api-error" },
  );
  writeFileSync(
    join(dirname(evidence), "task-5-api-error.log"),
    `${failure.stderr}exit=${failure.exitCode}\noutputsPresent=${existsSync(failureBase)}\n`,
  );
  if (failure.exitCode !== 4 || existsSync(failureBase))
    throw new RuntimeError("plugin API failure wrote output or returned the wrong exit");
  return failure.exitCode;
}

async function main(): Promise<void> {
  const values = parseOptions(Bun.argv.slice(2));
  if (command(["/usr/bin/pgrep", "-x", "Obsidian"], process.env).exitCode === 0)
    throw new RuntimeError("BLOCKED: an Obsidian process already exists");
  const fixturePath = join(PRODUCTION_VAULT, FIXTURE);
  if (existsSync(fixturePath)) throw new RuntimeError(`fixture collision: ${fixturePath}`);
  const cliExecutable = required(values, "--obsidian-cli");
  const evidence = required(values, "--evidence");
  const screenshot = join(dirname(evidence), "task-5-gallery.png");
  const socket = await armProductionPath(
    process.env["HOME"] ?? "",
    ".obsidian-cli.sock",
    "present",
  );
  const workspace = await armProductionPath(
    join(PRODUCTION_VAULT, ".obsidian"),
    "workspace.json",
    "change",
  );
  const app = Bun.spawn([APP], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  let receipt: Receipt | undefined;
  let cleanup: unknown;
  try {
    const events = await Promise.all([
      awaitProductionEvent(socket),
      awaitProductionEvent(workspace),
    ]);
    const args = command(["/bin/ps", "-p", String(app.pid), "-o", "args="], process.env);
    if (args.exitCode !== 0 || args.stdout.trim() !== APP)
      throw new RuntimeError(`unexpected production PID identity: ${args.stdout.trim()}`);
    if (productionCli(["vault", "info=path"], cliExecutable) !== PRODUCTION_VAULT)
      throw new RuntimeError("production vault identity mismatch");
    assertPluginReady(cliExecutable);
    for (const folder of ["01 Architecture", "_generated/drawings", "_generated/specs"])
      mkdirSync(join(fixturePath, folder), { recursive: true });
    const argv = renderArgs(values, cliExecutable);
    const first = renderOnce(argv);
    const firstScene = productionScene(cliExecutable);
    const second = renderOnce(argv);
    const secondScene = productionScene(cliExecutable);
    writeFileSync(
      join(dirname(evidence), "task-5-scene-comparison.json"),
      `${JSON.stringify({ firstScene, secondScene }, null, 2)}\n`,
    );
    if (JSON.stringify(firstScene) !== JSON.stringify(secondScene))
      throw new RuntimeError("live scene IDs, geometry, or customData changed on second render");
    productionCli(["dev:screenshot", `path=${screenshot}`], cliExecutable);
    if (!existsSync(screenshot) || lstatSync(screenshot).size === 0)
      throw new RuntimeError("Obsidian screenshot is absent");
    const evidenceCopies = verifyAndCopy(first, evidence);
    const failureExit = verifyFailure(values, evidence);
    receipt = {
      schemaVersion: 1,
      type: "Task5ProductionRendererReceipt",
      status: "PASS",
      vaultId: PRODUCTION_VAULT_ID,
      vault: PRODUCTION_VAULT,
      launch: { pid: app.pid, events },
      first,
      second,
      firstScene,
      secondScene,
      deterministic: true,
      screenshot,
      evidenceCopies,
      failure: { exitCode: failureExit, outputsPresent: false },
    };
  } finally {
    cleanup = await shutdownDefault(app.pid);
    rmSync(fixturePath, { recursive: true, force: true });
    rmSync(join(PRODUCTION_VAULT, "Engineering Atlas/10 Projects/task-5-failure"), {
      recursive: true,
      force: true,
    });
  }
  if (receipt === undefined)
    throw new RuntimeError("production renderer did not produce a receipt");
  const complete = { ...receipt, cleanup } as const;
  writeFileSync(evidence, `${JSON.stringify(complete, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(complete)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `renderer-production: ${error instanceof Error ? error.message : "unknown failure"}\n`,
  );
  process.exit(2);
});
