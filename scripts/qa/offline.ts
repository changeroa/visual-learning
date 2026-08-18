#!/usr/bin/env bun
import { randomBytes } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { optional, parseOptions, required } from "../../src/arguments";
import { jsonBytes, sha256 } from "../../src/io";
import {
  type MatrixContext,
  type MatrixRunReceipt,
  runAdversarial,
  runMatrix,
} from "./offline-matrix";
import {
  assertNoPlaintext,
  buildRegistryJson,
  chainFromSnapshot,
  classifyNetworkDenial,
  descentProven,
  OFFLINE_CLI_STUB,
  PS_COLUMNS,
  parsePsSnapshot,
  scanRootsForPlaintext,
  sentinelRecord,
  validateProfileContent,
  validateStubScript,
} from "./offline-support";

const skillRoot = resolve(import.meta.dir, "../..");

type Probe = {
  readonly id: string;
  readonly where: "inside-sandbox" | "outside-sandbox";
  readonly argv: readonly string[];
  readonly exitCode: number | null;
  readonly stderrTail: string;
  readonly classification: string;
};

type ControlOutcome = {
  readonly proven: boolean;
  readonly probes: readonly Probe[];
  readonly denialLog: string;
  readonly reason: string | undefined;
};

async function controlProbes(
  sandboxExec: string,
  profile: string,
  url: string,
): Promise<ControlOutcome> {
  const curl = "/usr/bin/curl";
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("offline-probe"),
  });
  const port = server.port;
  const portUrl = url.replace("example.invalid", `example.invalid:${port}`);
  const resolveArg = `example.invalid:${port}:127.0.0.1`;
  const pythonCode =
    `import socket,sys\ns=socket.socket();s.settimeout(3)\ntry:\n` +
    ` s.connect(("127.0.0.1",${port}));sys.stderr.write("CONNECTED\\n")\n` +
    `except OSError as e:sys.stderr.write(f"ERR {type(e).__name__} {e.errno} {e}\\n")`;
  const definitions: readonly {
    id: string;
    where: "inside-sandbox" | "outside-sandbox";
    argv: readonly string[];
  }[] = [
    {
      id: "curl-exact-url",
      where: "inside-sandbox",
      argv: [curl, "-sS", "--noproxy", "*", "--max-time", "5", url],
    },
    {
      id: "curl-pinned-loopback",
      where: "inside-sandbox",
      argv: [curl, "-sS", "--noproxy", "*", "--max-time", "5", "--resolve", resolveArg, portUrl],
    },
    {
      id: "curl-pinned-loopback-contrast",
      where: "outside-sandbox",
      argv: [curl, "-sS", "--noproxy", "*", "--max-time", "3", "--resolve", resolveArg, portUrl],
    },
    {
      id: "socket-eperm-oracle",
      where: "inside-sandbox",
      argv: ["/usr/bin/python3", "-c", pythonCode],
    },
    {
      id: "socket-eperm-oracle-contrast",
      where: "outside-sandbox",
      argv: ["/usr/bin/python3", "-c", pythonCode],
    },
  ];
  const probes: Probe[] = [];
  for (const definition of definitions) {
    const spawned =
      definition.where === "inside-sandbox"
        ? Bun.spawnSync([sandboxExec, "-f", profile, ...definition.argv], {
            stdout: "pipe",
            stderr: "pipe",
          })
        : Bun.spawnSync([...definition.argv], { stdout: "pipe", stderr: "pipe" });
    const stderr = spawned.stderr.toString();
    probes.push({
      id: definition.id,
      where: definition.where,
      argv: definition.argv,
      exitCode: spawned.exitCode,
      stderrTail: stderr.trim().slice(-300),
      classification: classifyNetworkDenial({
        tool: definition.argv[0] ?? "",
        exitCode: spawned.exitCode,
        stderr,
      }),
    });
  }
  server.stop(true);
  const byId = (id: string): Probe | undefined => probes.find((probe) => probe.id === id);
  const proven =
    byId("curl-exact-url")?.classification === "denied" &&
    byId("curl-pinned-loopback")?.classification === "denied" &&
    byId("curl-pinned-loopback-contrast")?.classification !== "denied" &&
    byId("socket-eperm-oracle")?.classification === "denied-operation-not-permitted" &&
    byId("socket-eperm-oracle-contrast")?.classification === "not-denied";
  const denialLog = probes
    .filter((probe) => probe.where === "inside-sandbox")
    .map((probe) => `$ ${probe.argv.join(" ")}\nexit=${probe.exitCode}\n${probe.stderrTail}\n`)
    .join("\n");
  return {
    proven,
    probes,
    denialLog,
    reason: proven
      ? undefined
      : "network control inside (deny network*) was not denied with operation-not-permitted; harness unproven",
  };
}

function blocked(out: string, reason: string, details: Record<string, unknown>): never {
  writeFileSync(
    out,
    jsonBytes({
      schemaVersion: 1,
      type: "Task11OfflineNetworkReceipt",
      status: "BLOCKED",
      reason,
      privacyClaims: "none",
      ...details,
    }),
  );
  process.stderr.write(`offline: BLOCKED: ${reason}\n`);
  process.exit(3);
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function fileSha(path: string): string | null {
  try {
    return sha256(readFileSync(path));
  } catch {
    return null;
  }
}

function obsidianProcesses(): readonly { pid: number; command: string }[] {
  const text = Bun.spawnSync(["ps", "-axo", PS_COLUMNS], { stdout: "pipe" }).stdout.toString();
  return parsePsSnapshot(text).filter(
    (entry) =>
      entry.command.trim().startsWith("/Applications/Obsidian.app/") && entry.pid !== process.pid,
  );
}

async function containmentProbe(
  sandboxExec: string,
  profile: string,
  env: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  const code =
    'process.stdout.write(String(process.pid)+"\\n");process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000);';
  const proc = Bun.spawn([sandboxExec, "-f", profile, "bun", "-e", code], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const timer = setTimeout(() => proc.kill(), 10_000);
  let childPid: number | null = null;
  const reader = proc.stdout.getReader();
  const deadline = Date.now() + 10_000;
  while (childPid === null && Date.now() < deadline) {
    const chunk = await reader.read();
    if (chunk.value === undefined) break;
    const line = new TextDecoder().decode(chunk.value).split("\n")[0]?.trim();
    if (line !== undefined && /^\d+$/.test(line)) childPid = Number(line);
  }
  const text = Bun.spawnSync(["ps", "-axo", PS_COLUMNS], { stdout: "pipe" }).stdout.toString();
  const chain = childPid === null ? [] : chainFromSnapshot(parsePsSnapshot(text), childPid);
  const proven = descentProven(chain, proc.pid, process.pid) && childPid === proc.pid;
  proc.kill();
  await proc.exited;
  clearTimeout(timer);
  return {
    wrapperPid: proc.pid,
    childPid,
    lstart: chain[0]?.lstart ?? null,
    chainPids: chain.map((entry) => entry.pid),
    descentProven: proven,
  };
}

function scanPassText(label: string, report: ReturnType<typeof scanRootsForPlaintext>): string[] {
  return [
    `${label}:`,
    ...report.roots.map(
      (root) =>
        `  root=${root.root} exists=${root.exists} files=${root.filesScanned} bytes=${root.bytesScanned} symlinksSkipped=${root.symlinksSkipped} oversizedSkipped=${root.oversizedSkipped} matchFiles=${root.matches.length}`,
    ),
    ...report.roots.flatMap((root) =>
      root.matches.map(
        (match) => `  match=${match.path} count=${match.count} designated=${match.designated}`,
      ),
    ),
    `  totalMatchFiles=${report.totalMatchFiles} designatedMatchCount=${report.designatedMatchCount}`,
  ];
}

async function main(): Promise<void> {
  const options = parseOptions(
    Bun.argv.slice(2),
    new Set([
      "--sandbox-exec",
      "--profile",
      "--obsidian-app",
      "--obsidian-cli",
      "--vault",
      "--expected-vault",
      "--verified-vault-id",
      "--generate-sentinel",
      "--record-sentinel-sha-only",
      "--commands",
      "--out",
      "--inject-network-control",
      "--expect-sandbox-denial",
      "--sentinel-scan-log",
      "--adversarial-out",
      "--cleanup-out",
      "--done-claim",
      "--flaky-repeat",
    ]),
    new Set(["--record-sentinel-sha-only", "--expect-sandbox-denial"]),
  );
  const out = resolve(required(options, "--out"));
  mkdirSync(dirname(out), { recursive: true });
  const evidenceDir = dirname(out);
  const sandboxExec = required(options, "--sandbox-exec");
  const profilePath = resolve(required(options, "--profile"));
  const control = optional(options, "--inject-network-control");

  if (!existsSync(sandboxExec) || !executable(sandboxExec))
    blocked(out, `/usr/bin/sandbox-exec is absent or not executable: ${sandboxExec}`, {
      sandboxExec,
    });
  const profileContent = readFileSync(profilePath, "utf8");
  if (!validateProfileContent(profileContent).valid)
    blocked(out, `sandbox profile is not the required deny-network profile: ${profilePath}`, {
      profile: profilePath,
    });

  if (control !== undefined) {
    if (!options.flags.has("--expect-sandbox-denial"))
      blocked(out, "--inject-network-control requires --expect-sandbox-denial", {});
    const [controlCli, controlUrl] = control.split(",");
    if (controlCli === undefined || controlUrl === undefined || controlUrl.startsWith("--"))
      blocked(out, "--inject-network-control requires <cli>,<url>", {});
    const outcome = await controlProbes(sandboxExec, profilePath, controlUrl);
    writeFileSync(
      out,
      jsonBytes({
        schemaVersion: 1,
        type: "Task11OfflineNetworkControlReceipt",
        status: outcome.proven ? "DONE" : "BLOCKED",
        injectedControl: { cli: controlCli, url: controlUrl },
        expectSandboxDenial: true,
        proven: outcome.proven,
        probes: outcome.probes,
        ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
      }),
    );
    if (!outcome.proven) process.exit(3);
    process.stdout.write("offline: control denied inside sandbox; detector exit 0\n");
    return;
  }

  const testsTmp = join(skillRoot, "tests", "tmp");
  mkdirSync(testsTmp, { recursive: true });
  const vaultArg = resolve(required(options, "--vault"));
  const expectedArg = resolve(required(options, "--expected-vault"));
  mkdirSync(vaultArg, { recursive: true });
  const vault = realpathSync(vaultArg);
  if (vault !== realpathSync(expectedArg))
    blocked(out, "vault and expected-vault must match", { vault });
  const verifiedVaultId = required(options, "--verified-vault-id");
  const designated = resolve(required(options, "--generate-sentinel"));
  if (!designated.startsWith(testsTmp))
    blocked(out, `sentinel must live under tests/tmp: ${designated}`, {});
  if (!options.flags.has("--record-sentinel-sha-only"))
    blocked(out, "--record-sentinel-sha-only is required for privacy claims", {});
  const commands = required(options, "--commands").split(",").filter(Boolean).sort();
  const expectedCommands = [
    "create",
    "extend",
    "init",
    "open",
    "preflight",
    "refresh",
    "restore",
    "validate",
  ];
  if (JSON.stringify(commands) !== JSON.stringify(expectedCommands))
    blocked(out, `--commands must be the full surface: ${expectedCommands.join(",")}`, {
      commands,
    });
  const flakyRepeat = Math.min(Number(optional(options, "--flaky-repeat") ?? "2"), 2);

  const stubCli = join(skillRoot, "tests", "fixtures", "offline-obsidian-cli");
  const stubContent = readFileSync(stubCli, "utf8");
  if (
    stubContent !== OFFLINE_CLI_STUB ||
    !validateStubScript(stubContent).valid ||
    !executable(stubCli)
  )
    blocked(out, "offline Obsidian CLI stub fixture is missing or invalid", { stubCli });
  const obsidianApp = required(options, "--obsidian-app");
  const obsidianCli = required(options, "--obsidian-cli");

  const outcome = await controlProbes(
    sandboxExec,
    profilePath,
    "https://example.invalid/visual-learning-probe",
  );
  const denialLogPath = join(evidenceDir, "task-11-sandbox-denial.log");
  writeFileSync(denialLogPath, outcome.denialLog);
  if (!outcome.proven)
    blocked(out, outcome.reason ?? "network control not denied", { control: outcome.probes });

  const plaintext = randomBytes(32);
  const hex = plaintext.toString("hex");
  rmSync(designated, { force: true });
  writeFileSync(designated, hex);
  const leakSurfaces: string[] = [
    JSON.stringify({ designated, record: sentinelRecord(plaintext) }),
  ];

  const registryPath = join(
    homedir(),
    "Library",
    "Application Support",
    "obsidian",
    "obsidian.json",
  );
  const registryBefore = fileSha(registryPath);
  const runReceipts: MatrixRunReceipt[] = [];
  const scratch = join(testsTmp, "offline-tmp");
  const vaults: readonly string[] = [vault, join(testsTmp, "offline-vault-r2")];
  let containment: Record<string, unknown> | undefined;
  for (let index = 0; index < flakyRepeat; index += 1) {
    const runVaultPath = vaults[index];
    if (runVaultPath === undefined) continue;
    mkdirSync(runVaultPath, { recursive: true });
    const runVault = realpathSync(runVaultPath);
    const initVaultPath = join(
      testsTmp,
      index === 0 ? "offline-init-vault" : "offline-init-vault-r2",
    );
    mkdirSync(initVaultPath, { recursive: true });
    const initVault = realpathSync(initVaultPath);
    const sandboxHome = join(
      testsTmp,
      index === 0 ? "offline-sandbox-home" : "offline-sandbox-home-r2",
    );
    const registryDir = join(sandboxHome, "Library", "Application Support", "obsidian");
    mkdirSync(registryDir, { recursive: true });
    writeFileSync(join(registryDir, "obsidian.json"), buildRegistryJson(verifiedVaultId, runVault));
    const env: Record<string, string | undefined> = {
      ...process.env,
      HOME: sandboxHome,
      OFFLINE_STUB_VAULT_PATH: runVault,
    };
    leakSurfaces.push(JSON.stringify(env));
    const ctx: MatrixContext = {
      sandboxExec,
      profile: profilePath,
      cli: join(skillRoot, "bin", "visual-note"),
      stubCli,
      source: join(skillRoot, "tests", "fixtures", "sample-project", "repo"),
      bundle: join(skillRoot, "tests", "fixtures", "sample-project", "bundle.json"),
      verifiedVaultId,
      env,
      harnessPid: process.pid,
    };
    if (index === 0) containment = await containmentProbe(sandboxExec, profilePath, env);
    const matrix = await runMatrix(ctx, index + 1, runVault, initVault, "offline-fixture");
    runReceipts.push(matrix);
    if (containment !== undefined && containment["descentProven"] !== true)
      blocked(out, "containment descent proof failed", { containmentProbe: containment });
    if (matrix.verdict !== "PASS")
      blocked(out, `sandboxed matrix run ${index + 1} failed`, { matrix });
  }
  const flakyVerdictsEqual = runReceipts.every(
    (receipt) => receipt.verdict === runReceipts[0]?.verdict,
  );

  mkdirSync(scratch, { recursive: true });
  const r2Vault = realpathSync(join(testsTmp, "offline-vault-r2"));
  const r2Home = join(testsTmp, "offline-sandbox-home-r2");
  const adversarial = await runAdversarial(
    {
      sandboxExec,
      profile: profilePath,
      cli: join(skillRoot, "bin", "visual-note"),
      stubCli,
      source: join(skillRoot, "tests", "fixtures", "sample-project", "repo"),
      bundle: join(skillRoot, "tests", "fixtures", "sample-project", "bundle.json"),
      verifiedVaultId,
      env: { ...process.env, HOME: r2Home, OFFLINE_STUB_VAULT_PATH: r2Vault },
      harnessPid: process.pid,
    },
    { vault: r2Vault, project: "offline-fixture", scratch, flakyVerdictsEqual },
  );
  const adversarialOut = resolve(
    optional(options, "--adversarial-out") ?? join(evidenceDir, "task-11-adversarial.json"),
  );
  writeFileSync(adversarialOut, jsonBytes(adversarial));
  if (adversarial.verdict !== "PASS") blocked(out, "adversarial classes failed", { adversarial });

  const scanRoots = [evidenceDir, testsTmp];
  const first = scanRootsForPlaintext(scanRoots, Buffer.from(hex, "utf8"), designated, {
    maxFileBytes: 64 * 1024 * 1024,
  });
  const sentinelOnly =
    first.totalMatchFiles === 1 &&
    first.designatedMatchCount === 1 &&
    first.roots.every((root) => root.matches.every((match) => match.designated));

  const receiptCore = {
    schemaVersion: 1,
    type: "Task11OfflineNetworkReceipt",
    status: sentinelOnly ? "DONE" : "BLOCKED",
    constraints: {
      appLaunches: 0,
      isolatedProfileLaunches: 0,
      settingsUiAutomation: false,
      cdpToggles: 0,
      registrySeeding: "none; real registry SHA-256 recorded before and after",
      realRegistryPath: registryPath,
      obsidianAppRecordedNotLaunched: { path: obsidianApp, present: existsSync(obsidianApp) },
      productionCliRecordedNotUsed: { path: obsidianCli, executable: executable(obsidianCli) },
      networkRoute: "none; every child runs under (deny network*)",
    },
    sandbox: {
      execPath: sandboxExec,
      execSha256: fileSha(sandboxExec),
      profile: profilePath,
      profileContent: profileContent.trimEnd(),
      profileSha256: sha256(profileContent),
      offlineCliStub: stubCli,
      offlineCliStubSha256: sha256(stubContent),
      stubRationale:
        "filesystem-only canned responses inside a disposable sandbox HOME; no app launch, no real registry writes",
    },
    control: { proven: outcome.proven, probes: outcome.probes, denialStderrLog: denialLogPath },
    descent: { harnessPid: process.pid, containmentProbe: containment, matrixRuns: runReceipts },
    commandsVerified: expectedCommands,
    flakyRepeat: { runs: runReceipts.length, verdictsEqual: flakyVerdictsEqual },
    sentinel: {
      designatedPath: designated,
      ...sentinelRecord(plaintext),
      writtenOnlyToDesignatedFile: sentinelOnly,
      argvLeakFree: true,
      envLeakFree: true,
    },
    adversarial: adversarialOut,
  };
  const firstBytes = jsonBytes(receiptCore);
  leakSurfaces.push(firstBytes);
  for (const surface of leakSurfaces) assertNoPlaintext(surface, hex);
  writeFileSync(out, firstBytes);

  const second = scanRootsForPlaintext(scanRoots, Buffer.from(hex, "utf8"), designated, {
    maxFileBytes: 64 * 1024 * 1024,
  });
  const secondClean = second.totalMatchFiles === 1 && second.designatedMatchCount === 1;
  const finalBytes = jsonBytes({
    ...receiptCore,
    scan: { roots: scanRoots, firstPass: first, verificationPass: second },
  });
  assertNoPlaintext(finalBytes, hex);
  writeFileSync(out, finalBytes);

  const scanLog = resolve(
    optional(options, "--sentinel-scan-log") ?? join(evidenceDir, "task-11-sentinel-scan.log"),
  );
  const scanLogText = [
    `sentinel scan roots: ${scanRoots.join(", ")}`,
    `designated file: ${designated}`,
    ...scanPassText("first-pass", first),
    ...scanPassText(
      "verification-pass (covers task-11-network.json and task-11-adversarial.json)",
      second,
    ),
    `plaintext-only-in-designated: ${first.totalMatchFiles === 1 && secondClean}`,
    `logs-root: evidence ${evidenceDir} *.log files are inside the scanned evidence root`,
  ].join("\n");
  assertNoPlaintext(scanLogText, hex);
  writeFileSync(scanLog, `${scanLogText}\n`);

  rmSync(designated, { force: true });
  const plaintextGone = !existsSync(designated);
  for (const directory of [
    vault,
    join(testsTmp, "offline-vault-r2"),
    join(testsTmp, "offline-init-vault"),
    join(testsTmp, "offline-init-vault-r2"),
    join(testsTmp, "offline-sandbox-home"),
    join(testsTmp, "offline-sandbox-home-r2"),
    scratch,
  ]) {
    rmSync(directory, { recursive: true, force: true });
  }
  const residualObsidian = obsidianProcesses();
  const registryUnchanged = fileSha(registryPath) === registryBefore;
  const cleanupOut = resolve(
    optional(options, "--cleanup-out") ?? join(evidenceDir, "task-11-cleanup.json"),
  );
  writeFileSync(
    cleanupOut,
    jsonBytes({
      schemaVersion: 1,
      type: "Task11CleanupReceipt",
      sentinelPlaintextDeleted: plaintextGone,
      tempDirectoriesRemoved: true,
      obsidianProcessesLeft: residualObsidian,
      realRegistryUnchanged: registryUnchanged,
    }),
  );
  const finalStatus =
    plaintextGone &&
    sentinelOnly &&
    secondClean &&
    residualObsidian.length === 0 &&
    registryUnchanged
      ? "DONE"
      : "BLOCKED";
  const doneClaim = resolve(
    optional(options, "--done-claim") ?? join(evidenceDir, "task-11-done-claim.json"),
  );
  writeFileSync(
    doneClaim,
    jsonBytes({
      schemaVersion: 1,
      type: "TaskDoneClaim",
      status: finalStatus,
      task_id: "st_01a012ca",
      plan_checkbox: "11. Prove offline privacy and no-leak behavior",
      completed: finalStatus === "DONE",
      outcome: {
        sandboxedCommandSurface: expectedCommands,
        controlDeniedOperationNotPermitted: outcome.proven,
        containmentDescentProven: containment?.["descentProven"] === true,
        sentinelHashOnly: true,
        sentinelScanLog: scanLog,
        adversarialVerdict: adversarial.verdict,
        matrixVerdicts: runReceipts.map((receipt) => receipt.verdict),
        appLaunches: 0,
      },
      evidence: Object.fromEntries(
        [out, scanLog, denialLogPath, adversarialOut, cleanupOut].map((path) => [
          path.split("/").pop() ?? path,
          { bytes: readFileSync(path).byteLength, sha256: sha256(readFileSync(path)) },
        ]),
      ),
    }),
  );
  process.stdout.write(`offline: ${finalStatus}\n`);
  if (finalStatus !== "DONE") process.exit(3);
}

await main();
