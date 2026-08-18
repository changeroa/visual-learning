import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, watch } from "node:fs";
import { join } from "node:path";
import { RuntimeError } from "../../src/errors";

export type Options = ReadonlyMap<string, string>;
export type ProcessEnvironment = Readonly<Record<string, string | undefined>>;
export type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};
export type OwnedIsolatedApp = {
  readonly process: Bun.Subprocess;
  readonly executable: string;
  readonly profile: string;
  readonly profileHome: string;
};

export function parseOptions(argv: readonly string[]): Options {
  const flags = new Set(["--verify-plugin-sha", "--launch-app-before-cli", "--verify-base-path"]);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === undefined || !flag.startsWith("--"))
      throw new TypeError(`unexpected argument: ${flag}`);
    if (flags.has(flag)) continue;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new TypeError(`${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  return values;
}

export function required(values: Options, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new TypeError(`${name} is required`);
  return value;
}

export function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function command(argv: readonly string[], env: ProcessEnvironment): CommandResult {
  const result = Bun.spawnSync([...argv], { stdout: "pipe", stderr: "pipe", env });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export function armPath(
  parent: string,
  name: string,
): { readonly ready: Promise<void>; close(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watcher: ReturnType<typeof watch> | undefined;
  const ready = new Promise<void>((resolveReady, reject) => {
    watcher = watch(parent, (_event, changed) => {
      if (changed === name && existsSync(join(parent, name))) resolveReady();
    });
    timer = setTimeout(() => reject(new RuntimeError(`timeout waiting for ${name}`)), 60_000);
  }).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
    watcher?.close();
  });
  return { ready, close: () => watcher?.close() };
}

export function assertIsolatedCliReady(
  cli: string,
  env: ProcessEnvironment,
  vaultId: string,
  expectedVault: string,
): void {
  const capability = command([cli, "help"], env);
  if (
    capability.exitCode !== 0 ||
    /command line interface is not enabled/i.test(`${capability.stdout}\n${capability.stderr}`)
  )
    throw new RuntimeError(capability.stderr.trim() || "isolated CLI capability is disabled");
  const identity = command([cli, `vault=${vaultId}`, "vault", "info=path"], env);
  if (identity.exitCode !== 0 || identity.stdout.trim() !== expectedVault)
    throw new RuntimeError(
      identity.stderr.trim() || `isolated CLI vault mismatch: ${identity.stdout.trim()}`,
    );
}

export function assertOwnedIsolatedApp(app: OwnedIsolatedApp): void {
  const inspected = command(["/bin/ps", "-p", String(app.process.pid), "-o", "args="], process.env);
  const group = command(["/bin/ps", "-p", String(app.process.pid), "-o", "pgid="], process.env);
  const args = inspected.stdout.trim();
  if (
    inspected.exitCode !== 0 ||
    !args.startsWith(app.executable) ||
    !args.includes(`--user-data-dir=${app.profile}`) ||
    group.exitCode !== 0 ||
    Number(group.stdout.trim()) !== app.process.pid
  )
    throw new RuntimeError(`refusing to adopt unowned Obsidian PID ${app.process.pid}`);
}

export async function cleanup(app: OwnedIsolatedApp): Promise<void> {
  const inspected = command(["/bin/ps", "-p", String(app.process.pid), "-o", "args="], process.env);
  if (inspected.exitCode !== 0) {
    rmSync(join(app.profileHome, ".obsidian-cli.sock"), { force: true });
    return;
  }
  assertOwnedIsolatedApp(app);
  process.kill(-app.process.pid, "SIGTERM");
  const status = await Promise.race([
    app.process.exited,
    new Promise<"timeout">((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 30_000)),
  ]);
  if (status === "timeout") {
    process.kill(-app.process.pid, "SIGKILL");
    await app.process.exited;
  }
  rmSync(join(app.profileHome, ".obsidian-cli.sock"), { force: true });
}
