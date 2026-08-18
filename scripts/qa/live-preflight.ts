#!/usr/bin/env bun
import { join } from "node:path";
import type { ReadableStreamDefaultReader as NodeStreamReader } from "node:stream/web";
import { InputError, RuntimeError } from "../../src/errors";

const evidenceBin = "/Users/billionjaepyo/tmp/.omo/evidence/agent-visual-learning-vault/bin";
const app = "/Applications/Obsidian.app";
const executable = `${app}/Contents/MacOS/Obsidian`;
const cli = "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli";
const expectedVault = "/Users/billionjaepyo/Documents/Obsidian Vault";
const socketParent = process.env["HOME"] ?? "/Users/billionjaepyo";

type ArmedWatcher = {
  readonly child: Bun.Subprocess<"ignore", "pipe", "pipe">;
  readonly reader: NodeStreamReader<Uint8Array<ArrayBuffer>>;
  readonly prefix: string;
};

type CommandResult = {
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
};

function command(argv: readonly string[]): CommandResult {
  const result = Bun.spawnSync([...argv], { stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0),
  };
}

function processIds(): readonly number[] {
  const result = command(["/usr/bin/pgrep", "-x", "Obsidian"]);
  if (result.exitCode === 1) return [];
  if (result.exitCode !== 0) throw new RuntimeError("cannot inspect Obsidian processes");
  return result.stdout
    .toString()
    .trim()
    .split("\n")
    .filter((value) => value.length > 0)
    .map((value) => Number.parseInt(value, 10));
}

async function armPath(
  parent: string,
  name: string,
  want: "present" | "absent" | "change",
): Promise<ArmedWatcher> {
  const child = Bun.spawn(
    [
      "/usr/bin/python3",
      join(evidenceBin, "task-2-wait-path-state.py"),
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
  const reader = child.stdout.getReader();
  let prefix = "";
  while (!prefix.includes("READY\n") && !prefix.includes("ALREADY_SATISFIED\n")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    prefix += new TextDecoder().decode(chunk.value);
  }
  if (!prefix.includes("READY") && !prefix.includes("ALREADY_SATISFIED")) {
    throw new RuntimeError("failed to arm path watcher");
  }
  return { child, reader, prefix };
}

async function awaitWatcher(watcher: ArmedWatcher): Promise<string> {
  let output = watcher.prefix;
  while (true) {
    const chunk = await watcher.reader.read();
    if (chunk.done) break;
    output += new TextDecoder().decode(chunk.value);
  }
  if ((await watcher.child.exited) !== 0) throw new RuntimeError("path readiness event failed");
  return output.trim();
}

async function armPid(pid: number): Promise<ArmedWatcher> {
  const child = Bun.spawn(
    [
      "/usr/bin/python3",
      join(evidenceBin, "task-2-wait-pid.py"),
      "--pid",
      String(pid),
      "--timeout-ms",
      "60000",
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const reader = child.stdout.getReader();
  let prefix = "";
  while (!prefix.includes("READY\n") && !prefix.includes("ALREADY_EXITED\n")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    prefix += new TextDecoder().decode(chunk.value);
  }
  if (!prefix.includes("READY") && !prefix.includes("ALREADY_EXITED"))
    throw new RuntimeError("failed to arm PID watcher");
  return { child, reader, prefix };
}

async function cleanup(pid: number): Promise<unknown> {
  const pidExit = await armPid(pid);
  const socketAbsent = await armPath(socketParent, ".obsidian-cli.sock", "absent");
  const quit = command(["/usr/bin/osascript", "-e", 'tell application id "md.obsidian" to quit']);
  if (quit.exitCode !== 0)
    throw new RuntimeError(`graceful quit failed: ${quit.stderr.toString().trim()}`);
  const [pidEvent, socketAbsentEvent] = await Promise.all([
    awaitWatcher(pidExit),
    awaitWatcher(socketAbsent),
  ]);
  return { pidEvent, socketAbsentEvent };
}

async function main(): Promise<void> {
  if (processIds().length !== 0)
    throw new InputError("BLOCKED: an Obsidian process already exists");
  const socket = await armPath(socketParent, ".obsidian-cli.sock", "present");
  const workspace = await armPath(join(expectedVault, ".obsidian"), "workspace.json", "change");
  const launch = command(["/usr/bin/open", "-a", app]);
  if (launch.exitCode !== 0) throw new RuntimeError(launch.stderr.toString().trim());
  const [socketEvent, workspaceEvent] = await Promise.all([
    awaitWatcher(socket),
    awaitWatcher(workspace),
  ]);
  const ids = processIds();
  const pid = ids.at(0);
  if (ids.length !== 1 || pid === undefined)
    throw new RuntimeError(`expected one Obsidian process, observed ${ids.length}`);
  const processCommand = command(["/bin/ps", "-p", String(pid), "-o", "command="])
    .stdout.toString()
    .trim();
  if (processCommand !== executable)
    throw new RuntimeError(`unexpected Obsidian executable: ${processCommand}`);
  const preflightArgv = [
    join(import.meta.dir, "../../bin/visual-note"),
    "preflight",
    "--obsidian-cli",
    cli,
    "--expected-vault",
    expectedVault,
    "--json",
  ] as const;
  const preflight = command(preflightArgv);
  const cleanupReceipt = await cleanup(pid);
  if (preflight.exitCode !== 0)
    throw new RuntimeError(preflight.stderr.toString().trim() || "preflight failed");
  const receipt: unknown = JSON.parse(preflight.stdout.toString());
  process.stdout.write(
    `${JSON.stringify({ command: preflightArgv, exitCode: preflight.exitCode, receipt, launch: { pid, socketEvent, workspaceEvent }, cleanup: cleanupReceipt })}\n`,
  );
}

main().catch((error) => {
  if (error instanceof Error) process.stderr.write(`live-preflight: ${error.message}\n`);
  else process.stderr.write("live-preflight: unknown failure\n");
  process.exit(2);
});
