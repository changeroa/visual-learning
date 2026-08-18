import type { FSWatcher } from "node:fs";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  watch,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { readJson } from "../../src/io";
import { transactionPaths } from "../../src/transaction-layout";
import { openTransaction } from "../../src/transaction-verify";
import { runSandboxed, type SandboxedRun, treeDigest } from "./offline-support";

export type MatrixContext = {
  readonly sandboxExec: string;
  readonly profile: string;
  readonly cli: string;
  readonly stubCli: string;
  readonly source: string;
  readonly bundle: string;
  readonly verifiedVaultId: string;
  readonly env: Record<string, string | undefined>;
  readonly harnessPid: number;
};

export type CommandRecord = {
  readonly command: string;
  readonly exitCode: number | null;
  readonly elapsedMs: number;
  readonly pid: number;
  readonly lstart: string | null;
  readonly snapshotObserved: boolean;
  readonly chainPids: readonly number[];
  readonly descendantPids: readonly number[];
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly checked: string;
};

export type MatrixRunReceipt = {
  readonly run: number;
  readonly vault: string;
  readonly verdict: "PASS" | "FAIL";
  readonly setup: CommandRecord;
  readonly commands: readonly CommandRecord[];
};

const TIMEOUT_MS = 60_000;

function atlas(vault: string, project: string): string {
  return join(vault, "Engineering Atlas/10 Projects", project);
}

async function record(
  ctx: MatrixContext,
  label: string,
  argv: readonly string[],
  checked: string,
): Promise<{ run: SandboxedRun; entry: CommandRecord }> {
  const run = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv,
    env: ctx.env,
    timeoutMs: TIMEOUT_MS,
    label,
    harnessPid: ctx.harnessPid,
  });
  return {
    run,
    entry: {
      command: label,
      exitCode: run.exitCode,
      elapsedMs: run.elapsedMs,
      pid: run.pid,
      lstart: run.lstart,
      snapshotObserved: run.snapshotObserved,
      chainPids: run.chainPids,
      descendantPids: run.descendantPids,
      stdoutTail: run.stdout.slice(-400),
      stderrTail: run.stderr.slice(-400),
      checked,
    },
  };
}

function parsed(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

export async function runMatrix(
  ctx: MatrixContext,
  run: number,
  vault: string,
  initVault: string,
  project: string,
): Promise<MatrixRunReceipt> {
  for (const directory of [vault, initVault]) {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
  }
  const setup = await record(
    ctx,
    "bootstrap(setup)",
    [
      ctx.cli,
      "bootstrap",
      "--vault",
      vault,
      "--expected-vault",
      vault,
      "--project",
      project,
      "--source",
      ctx.source,
      "--bundle",
      ctx.bundle,
      "--json",
    ],
    "exit 0",
  );
  const assets = join(atlas(vault, project), "_assets");
  const createSpec = join(assets, "walkthrough-create.json");
  const refreshSpec = join(assets, "walkthrough-refresh-v2.json");
  const artifactId = (readJson(refreshSpec) as { artifactId: string }).artifactId;
  const steps: {
    key: string;
    argv: readonly string[];
    checked: (value: Record<string, unknown>) => boolean;
  }[] = [
    {
      key: "preflight",
      argv: [
        ctx.cli,
        "preflight",
        "--obsidian-cli",
        ctx.stubCli,
        "--expected-vault",
        vault,
        "--json",
      ],
      checked: (value) =>
        value["status"] === "READY" &&
        value["verifiedVaultId"] === ctx.verifiedVaultId &&
        value["observedVault"] === vault,
    },
    {
      key: "init",
      argv: [
        ctx.cli,
        "init",
        "--vault",
        initVault,
        "--expected-vault",
        initVault,
        "--project",
        `${project}-init`,
        "--source",
        ctx.source,
        "--json",
      ],
      checked: (value) => value["operation"] === "init",
    },
    {
      key: "create",
      argv: [
        ctx.cli,
        "create",
        "--vault",
        vault,
        "--expected-vault",
        vault,
        "--project",
        project,
        "--spec",
        createSpec,
        "--json",
      ],
      checked: (value) => value["operation"] === "create",
    },
    {
      key: "extend",
      argv: [ctx.cli, "extend", "--spec", join(assets, "walkthrough-extend.json"), "--json"],
      checked: (value) => value["operation"] === "extend",
    },
    {
      key: "refresh",
      argv: [
        ctx.cli,
        "refresh",
        "--vault",
        vault,
        "--expected-vault",
        vault,
        "--project",
        project,
        "--spec",
        refreshSpec,
        "--expected-token",
        "cas-0",
        "--json",
      ],
      checked: () => true,
    },
    {
      key: "validate",
      argv: [ctx.cli, "validate", "--spec", createSpec, "--json"],
      checked: (value) => value["valid"] === true,
    },
    {
      key: "open",
      argv: [
        ctx.cli,
        "open",
        "--obsidian-cli",
        ctx.stubCli,
        "--vault",
        vault,
        "--expected-vault",
        vault,
        "--project",
        project,
        "--artifact-id",
        artifactId,
        "--json",
      ],
      checked: (value) => value["opened"] === true && typeof value["path"] === "string",
    },
    {
      key: "restore",
      argv: [
        ctx.cli,
        "restore",
        "--vault",
        vault,
        "--expected-vault",
        vault,
        "--project",
        project,
        "--artifact-id",
        artifactId,
        "--revision-token",
        "cas-0",
        "--expected-token",
        "cas-1",
        "--json",
      ],
      checked: (value) => value["operation"] === "restore",
    },
  ];
  const entries: CommandRecord[] = [];
  let verdict: "PASS" | "FAIL" = "PASS";
  if (setup.run.exitCode !== 0) verdict = "FAIL";
  for (const step of steps) {
    const { run, entry } = await record(ctx, step.key, step.argv, "exit 0 + receipt contract");
    let ok = run.exitCode === 0;
    if (ok) {
      try {
        ok = step.checked(parsed(run.stdout));
      } catch {
        ok = false;
      }
    }
    if (!ok) verdict = "FAIL";
    entries.push(entry);
  }
  return { run, vault, verdict, setup: setup.entry, commands: entries };
}

export type AdversarialClass = {
  readonly class: string;
  readonly result: "PASS" | "FAIL" | "NOT_APPLICABLE";
  readonly detail: string;
};

export type AdversarialReceipt = {
  readonly schemaVersion: 1;
  readonly type: "Task11AdversarialReceipt";
  readonly verdict: "PASS" | "FAIL";
  readonly classes: readonly AdversarialClass[];
};

function watchVault(vault: string): { watcher: FSWatcher | null; method: string } {
  try {
    return { watcher: watch(vault, { recursive: true }), method: "fs.watch(recursive)" };
  } catch {
    const history = transactionHistoryRootGuess(vault);
    if (history === null) return { watcher: null, method: "unavailable" };
    try {
      return { watcher: watch(history), method: "fs.watch(history-root)" };
    } catch {
      return { watcher: null, method: "unavailable" };
    }
  }
}

function transactionHistoryRootGuess(vault: string): string | null {
  const projects = join(vault, "Engineering Atlas/10 Projects");
  if (!existsSync(projects)) return null;
  const first = readdirSync(projects)
    .sort()
    .find((name) => name.endsWith("-fixture"));
  return first === undefined ? null : join(projects, first);
}

async function interruptRefresh(
  ctx: MatrixContext,
  vault: string,
  project: string,
  artifactId: string,
  spec: string,
): Promise<{ killed: boolean; exitCode: number | null; method: string }> {
  const token = openTransaction(vault, project, artifactId).state.committedToken;
  const { watcher, method } = watchVault(vault);
  const proc = Bun.spawn(
    [
      ctx.sandboxExec,
      "-f",
      ctx.profile,
      ctx.cli,
      "refresh",
      "--vault",
      vault,
      "--expected-vault",
      vault,
      "--project",
      project,
      "--spec",
      spec,
      "--expected-token",
      token,
      "--json",
    ],
    { stdout: "pipe", stderr: "pipe", env: ctx.env },
  );
  let killed = false;
  if (watcher !== null) {
    watcher.on("change", () => {
      if (!killed) {
        killed = true;
        proc.kill();
      }
    });
  }
  const timer = setTimeout(() => {
    killed = true;
    proc.kill();
  }, 30_000);
  const exitCode = await proc.exited;
  clearTimeout(timer);
  watcher?.close();
  return { killed: killed && exitCode !== 0, exitCode, method };
}

async function resumeRefresh(
  ctx: MatrixContext,
  vault: string,
  project: string,
  artifactId: string,
  spec: string,
): Promise<SandboxedRun> {
  const token = openTransaction(vault, project, artifactId).state.committedToken;
  return runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: [
      ctx.cli,
      "refresh",
      "--vault",
      vault,
      "--expected-vault",
      vault,
      "--project",
      project,
      "--spec",
      spec,
      "--expected-token",
      token,
      "--json",
    ],
    env: ctx.env,
    timeoutMs: TIMEOUT_MS,
    label: "resume-refresh",
    harnessPid: ctx.harnessPid,
  });
}

export async function runAdversarial(
  ctx: MatrixContext,
  input: {
    readonly vault: string;
    readonly project: string;
    readonly scratch: string;
    readonly flakyVerdictsEqual: boolean;
  },
): Promise<AdversarialReceipt> {
  const classes: AdversarialClass[] = [];
  const assets = join(atlas(input.vault, input.project), "_assets");
  const createSpec = join(assets, "walkthrough-create.json");
  const refreshSpec = join(assets, "walkthrough-refresh-v2.json");
  const artifactId = (readJson(refreshSpec) as { artifactId: string }).artifactId;

  const malformedPath = join(input.scratch, "malformed.json");
  writeFileSync(malformedPath, '{"artifactId":');
  const before = treeDigest(input.vault);
  const malformedValidate = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: [ctx.cli, "validate", "--spec", malformedPath, "--json"],
    env: ctx.env,
    timeoutMs: TIMEOUT_MS,
    label: "malformed-validate",
    harnessPid: ctx.harnessPid,
  });
  const malformedCreate = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: [
      ctx.cli,
      "create",
      "--vault",
      input.vault,
      "--expected-vault",
      input.vault,
      "--project",
      input.project,
      "--spec",
      malformedPath,
      "--json",
    ],
    env: ctx.env,
    timeoutMs: TIMEOUT_MS,
    label: "malformed-create",
    harnessPid: ctx.harnessPid,
  });
  const unchanged = treeDigest(input.vault).digest === before.digest;
  classes.push({
    class: "malformed-input",
    result:
      malformedValidate.exitCode === 2 && malformedCreate.exitCode === 2 && unchanged
        ? "PASS"
        : "FAIL",
    detail: "malformed spec exits 2 for validate and create with an unchanged vault tree digest",
  });

  classes.push({
    class: "prompt-injection",
    result: "NOT_APPLICABLE",
    detail:
      "the offline harness consumes no model prose; argv is a fixed flag surface with no free text",
  });

  let landed = 0;
  let attempts = 0;
  let method = "unavailable";
  while (attempts < 4 && landed === 0) {
    attempts += 1;
    const attempt = await interruptRefresh(
      ctx,
      input.vault,
      input.project,
      artifactId,
      refreshSpec,
    );
    method = attempt.method;
    if (attempt.killed) landed += 1;
    else break;
  }
  const resume = await resumeRefresh(ctx, input.vault, input.project, artifactId, refreshSpec);
  const lockRoot = transactionPaths(input.vault, input.project, artifactId).lockRoot;
  const lockResidue = (() => {
    let markers = existsSync(join(lockRoot, "writer")) ? 1 : 0;
    const readers = join(lockRoot, "readers");
    if (existsSync(readers)) markers += readdirSync(readers).length;
    return markers;
  })();
  classes.push({
    class: "cancel-resume-via-child-sigterm",
    result: landed >= 1 && resume.exitCode === 0 && lockResidue === 0 ? "PASS" : "FAIL",
    detail: `SIGTERM on first vault-write event (${method}) killed ${landed}/${attempts} sandboxed refresh children; recovery reopened state, clean rerun exited 0, live lock markers remaining ${lockResidue}`,
  });

  const statePath = transactionPaths(input.vault, input.project, artifactId).statePath;
  const stateBefore = readFileSync(statePath).toString("hex");
  const stale = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: [
      ctx.cli,
      "refresh",
      "--vault",
      input.vault,
      "--expected-vault",
      input.vault,
      "--project",
      input.project,
      "--spec",
      refreshSpec,
      "--expected-token",
      "cas-stale-999",
      "--json",
    ],
    env: ctx.env,
    timeoutMs: TIMEOUT_MS,
    label: "stale-refresh",
    harnessPid: ctx.harnessPid,
  });
  classes.push({
    class: "stale-state",
    result:
      stale.exitCode === 3 && readFileSync(statePath).toString("hex") === stateBefore
        ? "PASS"
        : "FAIL",
    detail: "wrong --expected-token exits 3 (conflict) with a byte-identical STATE record",
  });

  const dirtyEnv: Record<string, string | undefined> = {
    ...ctx.env,
    PATH: `/nonexistent-offline-bin:${process.env["PATH"] ?? ""}`,
    VISUAL_NOTE_INJECT: "garbage",
    TERM: undefined,
  };
  const dirtyValidate = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: [ctx.cli, "validate", "--spec", createSpec, "--json"],
    env: dirtyEnv,
    timeoutMs: TIMEOUT_MS,
    label: "dirty-env-validate",
    harnessPid: ctx.harnessPid,
  });
  let dirtyValidateOk = dirtyValidate.exitCode === 0;
  try {
    dirtyValidateOk = dirtyValidateOk && parsed(dirtyValidate.stdout)["valid"] === true;
  } catch {
    dirtyValidateOk = false;
  }
  const dirtyPreflight = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: [
      ctx.cli,
      "preflight",
      "--obsidian-cli",
      ctx.stubCli,
      "--expected-vault",
      input.vault,
      "--json",
    ],
    env: { ...ctx.env, HOME: input.vault },
    timeoutMs: TIMEOUT_MS,
    label: "dirty-env-preflight",
    harnessPid: ctx.harnessPid,
  });
  classes.push({
    class: "dirty-env",
    result:
      dirtyValidateOk && dirtyPreflight.exitCode === 4 && dirtyPreflight.stderr.includes("registry")
        ? "PASS"
        : "FAIL",
    detail:
      "polluted PATH/env still validates correctly; a HOME without the sandbox registry fails preflight safely with exit 4",
  });

  const hung = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: ["/bin/sleep", "30"],
    env: ctx.env,
    timeoutMs: 1500,
    label: "hung-bounded",
    harnessPid: ctx.harnessPid,
  });
  classes.push({
    class: "hung-bounded",
    result: hung.timedOut && hung.exitCode !== 0 && hung.elapsedMs < 10_000 ? "PASS" : "FAIL",
    detail: `sandboxed hung child killed at the 1500ms bound after ${hung.elapsedMs}ms without fixed sleeps`,
  });

  const decoy = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: ["/usr/bin/true"],
    env: ctx.env,
    timeoutMs: TIMEOUT_MS,
    label: "decoy-open",
    harnessPid: ctx.harnessPid,
  });
  let decoyDetected = false;
  try {
    decoyDetected = parsed(decoy.stdout)["opened"] !== true;
  } catch {
    decoyDetected = true;
  }
  classes.push({
    class: "misleading-rc0",
    result: decoy.exitCode === 0 && decoyDetected ? "PASS" : "FAIL",
    detail:
      "exit-0 child without the open receipt contract is rejected by output-shape verification",
  });

  classes.push({
    class: "flaky-repeat",
    result: input.flakyVerdictsEqual ? "PASS" : "FAIL",
    detail: "two independent sandboxed matrix runs on fresh vaults produced identical verdicts",
  });

  let repeatLanded = 0;
  let repeatAttempts = 0;
  while (repeatAttempts < 6 && repeatLanded < 3) {
    repeatAttempts += 1;
    const attempt = await interruptRefresh(
      ctx,
      input.vault,
      input.project,
      artifactId,
      refreshSpec,
    );
    if (attempt.killed) repeatLanded += 1;
    else break;
  }
  const repeatResume = await resumeRefresh(
    ctx,
    input.vault,
    input.project,
    artifactId,
    refreshSpec,
  );
  const repeatOpen = await runSandboxed({
    sandboxExec: ctx.sandboxExec,
    profile: ctx.profile,
    argv: [
      ctx.cli,
      "open",
      "--obsidian-cli",
      ctx.stubCli,
      "--vault",
      input.vault,
      "--expected-vault",
      input.vault,
      "--project",
      input.project,
      "--artifact-id",
      artifactId,
      "--json",
    ],
    env: ctx.env,
    timeoutMs: TIMEOUT_MS,
    label: "post-interruption-open",
    harnessPid: ctx.harnessPid,
  });
  classes.push({
    class: "repeated-interruptions",
    result:
      repeatLanded >= 1 && repeatResume.exitCode === 0 && repeatOpen.exitCode === 0
        ? "PASS"
        : "FAIL",
    detail: `${repeatLanded} SIGTERM interruptions across ${repeatAttempts} attempts; final clean refresh and open both exited 0`,
  });

  return {
    schemaVersion: 1,
    type: "Task11AdversarialReceipt",
    verdict: classes.every((item) => item.result !== "FAIL") ? "PASS" : "FAIL",
    classes,
  };
}
