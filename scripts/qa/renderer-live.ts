#!/usr/bin/env bun
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { RuntimeError } from "../../src/errors";
import { enableDocumentedCliToggle } from "./renderer-cdp";
import {
  armPath,
  assertIsolatedCliReady,
  assertOwnedIsolatedApp,
  type CommandResult,
  cleanup,
  command,
  hash,
  type ProcessEnvironment,
  parseOptions,
  required,
} from "./renderer-live-support";

const pluginReceiptSchema = z
  .object({
    plugin: z.object({
      directory: z.string(),
      assets: z.array(z.object({ name: z.string(), sha256: z.string() })),
    }),
  })
  .passthrough();
const resultSchema = z
  .object({
    operation: z.literal("create"),
    drawingPath: z.string(),
    svgPath: z.string(),
    notePath: z.string(),
    specPath: z.string(),
    elementCount: z.number(),
    elementIds: z.array(z.string()),
  })
  .passthrough();

function parseCli(result: CommandResult): z.infer<typeof resultSchema> {
  if (result.exitCode !== 0) throw new RuntimeError(result.stderr.trim() || "visual-note failed");
  return resultSchema.parse(JSON.parse(result.stdout));
}

function geometry(cli: string, vaultId: string, env: ProcessEnvironment): readonly unknown[] {
  const code =
    "(()=>{const v=app.workspace.activeLeaf?.view;const e=v?.getViewElements?.()??[];return JSON.stringify(e.map(x=>({id:x.id,type:x.type,x:x.x,y:x.y,width:x.width,height:x.height,points:x.points??null,customData:x.customData??null})).sort((a,b)=>a.id.localeCompare(b.id)));})()";
  const result = command([cli, `vault=${vaultId}`, "eval", `code=${code}`], env);
  if (result.exitCode !== 0)
    throw new RuntimeError(result.stderr.trim() || "scene inspection failed");
  const payload = result.stdout.trim().replace(/^=> /, "");
  const first: unknown = JSON.parse(payload);
  const value: unknown = typeof first === "string" ? JSON.parse(first) : first;
  return z.array(z.unknown()).parse(value);
}

async function main(): Promise<void> {
  const values = parseOptions(Bun.argv.slice(2));
  if (command(["/usr/bin/pgrep", "-x", "Obsidian"], process.env).exitCode === 0)
    throw new RuntimeError("BLOCKED: an Obsidian process already exists");
  const vault = resolve(required(values, "--vault"));
  const profile = resolve(required(values, "--user-data-dir"));
  const profileHome = `${profile}-home`;
  for (const target of [vault, profile, profileHome])
    rmSync(target, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });
  mkdirSync(profileHome, { recursive: true });
  const vaultReal = realpathSync(vault);
  const vaultId = "renderer-fixture";
  const project = required(values, "--project");
  const projectBase = join(vaultReal, "Engineering Atlas/10 Projects", project);
  for (const folder of ["01 Architecture", "_generated/drawings", "_generated/specs"])
    mkdirSync(join(projectBase, folder), { recursive: true });
  mkdirSync(join(vaultReal, "Engineering Atlas/95 System/scripts"), { recursive: true });
  copyFileSync(
    join(import.meta.dir, "../../assets/visual-note-renderer.md"),
    join(vaultReal, "Engineering Atlas/95 System/scripts/visual-note-renderer.md"),
  );
  const receipt = pluginReceiptSchema.parse(
    JSON.parse(readFileSync(required(values, "--provision-plugin-from"), "utf8")),
  );
  const pluginTarget = join(vaultReal, ".obsidian/plugins/obsidian-excalidraw-plugin");
  mkdirSync(pluginTarget, { recursive: true });
  for (const asset of receipt.plugin.assets) {
    const source = join(receipt.plugin.directory, asset.name);
    if (hash(source) !== asset.sha256)
      throw new RuntimeError(`source plugin SHA mismatch: ${asset.name}`);
    copyFileSync(source, join(pluginTarget, asset.name));
    if (hash(join(pluginTarget, asset.name)) !== asset.sha256)
      throw new RuntimeError(`copied plugin SHA mismatch: ${asset.name}`);
  }
  writeFileSync(
    join(vaultReal, ".obsidian/community-plugins.json"),
    '["obsidian-excalidraw-plugin"]\n',
  );
  writeFileSync(join(vaultReal, ".obsidian/app.json"), "{}\n");
  mkdirSync(profile, { recursive: true });
  writeFileSync(
    join(profile, "obsidian.json"),
    `${JSON.stringify({ vaults: { [vaultId]: { path: vaultReal, ts: 1, open: true } } })}\n`,
  );
  const env = { ...process.env, HOME: profileHome };
  const socket = armPath(profileHome, ".obsidian-cli.sock");
  const cdpAddress = "127.0.0.1";
  const cdpPort = 19235;
  const appExecutable = required(values, "--obsidian-app");
  const appArgs = [
    appExecutable,
    `--user-data-dir=${profile}`,
    `--remote-debugging-address=${cdpAddress}`,
    `--remote-debugging-port=${cdpPort}`,
  ] as const;
  const appProcess = Bun.spawn(
    [
      "/usr/bin/python3",
      "-c",
      "import os,sys; os.setsid(); os.execve(sys.argv[1],sys.argv[1:],dict(os.environ))",
      ...appArgs,
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "pipe", env },
  );
  const ownedApp = {
    process: appProcess,
    executable: appExecutable,
    profile,
    profileHome,
  } as const;
  try {
    await socket.ready;
    assertOwnedIsolatedApp(ownedApp);
    process.stderr.write("renderer-live: cli-socket-ready\n");
    process.stderr.write("renderer-live: cdp-toggle-start\n");
    await enableDocumentedCliToggle(appProcess.stderr.getReader(), cdpAddress, cdpPort, vaultReal);
    assertOwnedIsolatedApp(ownedApp);
    process.stderr.write("renderer-live: cdp-toggle-complete\n");
    const cli = required(values, "--obsidian-cli");
    assertIsolatedCliReady(cli, env, vaultId, vaultReal);
    process.stderr.write("renderer-live: cli-capability-and-vault-ready\n");
    const visualNote = join(import.meta.dir, "../../bin/visual-note");
    const baseArgs = [
      visualNote,
      "create",
      "--vault",
      vaultReal,
      "--expected-vault",
      vaultReal,
      "--verified-vault-id",
      vaultId,
      "--project",
      project,
      "--spec",
      resolve(required(values, "--spec")),
      "--obsidian-cli",
      cli,
      "--runtime-receipt",
      resolve(required(values, "--runtime-receipt")),
      "--plugin-receipt",
      resolve(required(values, "--provision-plugin-from")),
      "--json",
    ] as const;
    process.stderr.write("renderer-live: first-render-start\n");
    const first = parseCli(command(baseArgs, env));
    process.stderr.write("renderer-live: first-render-complete\n");
    const firstScene = geometry(cli, vaultId, env);
    const second = parseCli(command(baseArgs, env));
    const secondScene = geometry(cli, vaultId, env);
    const screenshot = join(dirname(resolve(required(values, "--evidence"))), "task-5-gallery.png");
    const capture = command(["/usr/sbin/screencapture", "-x", screenshot], env);
    if (capture.exitCode !== 0)
      throw new RuntimeError(capture.stderr.trim() || "screenshot failed");
    const failureProject = "task-5-failure";
    const failureBase = join(vaultReal, "Engineering Atlas/10 Projects", failureProject);
    for (const folder of ["01 Architecture", "_generated/drawings", "_generated/specs"])
      mkdirSync(join(failureBase, folder), { recursive: true });
    const failure = command(
      [
        visualNote,
        "create",
        "--vault",
        vaultReal,
        "--expected-vault",
        vaultReal,
        "--verified-vault-id",
        vaultId,
        "--project",
        failureProject,
        "--spec",
        join(import.meta.dir, "../../tests/fixtures/architecture.json"),
        "--assert-no-write",
        "--json",
      ],
      { ...env, VISUAL_NOTE_INJECT: "plugin-api-error" },
    );
    const failureOutputs = ["renderer-failure.excalidraw.md", "renderer-failure.svg"].filter(
      (name) => Bun.file(join(failureBase, "_generated/drawings", name)).size > 0,
    );
    writeFileSync(
      join(dirname(resolve(required(values, "--evidence"))), "task-5-api-error.log"),
      `${failure.stderr}exit=${failure.exitCode}\noutputs=${JSON.stringify(failureOutputs)}\n`,
    );
    const receiptOutput = {
      schemaVersion: 1,
      type: "Task5LiveRendererReceipt",
      status: "PASS",
      vaultId,
      expectedVault: vaultReal,
      pluginAssetsVerified: receipt.plugin.assets.length,
      first,
      second,
      deterministicScene: JSON.stringify(firstScene) === JSON.stringify(secondScene),
      firstScene,
      secondScene,
      volatileFieldsExcluded: ["version", "versionNonce", "updated", "seed", "index"],
      failure: { exitCode: failure.exitCode, outputs: failureOutputs },
      screenshot,
    } as const;
    if (!receiptOutput.deterministicScene || failure.exitCode !== 4 || failureOutputs.length !== 0)
      throw new RuntimeError("renderer acceptance invariant failed");
    writeFileSync(
      resolve(required(values, "--evidence")),
      `${JSON.stringify(receiptOutput, null, 2)}\n`,
      { flag: "wx" },
    );
    process.stdout.write(`${JSON.stringify(receiptOutput)}\n`);
  } finally {
    socket.close();
    await cleanup(ownedApp);
    rmSync(vault, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
    rmSync(profileHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `renderer-live: ${error instanceof Error ? error.message : "unknown failure"}\n`,
  );
  process.exit(2);
});
