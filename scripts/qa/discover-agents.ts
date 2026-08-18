#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { installLinks } from "../install-links";
import { extractContract } from "./agent-contract";
import { type AgentClient, runAgentSession, runBounded } from "./agent-session";
import { type DiscoveryClient, parseDiscoveryOptions } from "./discovery-options";

export { extractContract } from "./agent-contract";

const canonical = "/Users/billionjaepyo/.agents/skills/visual-learning";
const installerRoots = {
  senpi: ".senpi/agent/skills/visual-learning",
  codex: ".codex/skills/visual-learning",
  claude: ".claude/skills/visual-learning",
} as const;
type Client = keyof typeof installerRoots;
const clientTypeCheck: Record<DiscoveryClient, AgentClient> = {
  senpi: "senpi",
  codex: "codex",
  claude: "claude",
};
async function commandPath(
  client: Client,
): Promise<{ commandPath: string; realpath: string } | null> {
  const process = Bun.spawn(["/bin/sh", "-c", `command -v -- ${client}`], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = (await new Response(process.stdout).text()).trim();
  if ((await process.exited) !== 0 || stdout === "") return null;
  return { commandPath: stdout, realpath: realpathSync(stdout) };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
}

function writeAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  renameSync(temporary, path);
}

export async function discoverAgents(argv: readonly string[]) {
  const options = parseDiscoveryOptions(argv);
  const direct = await runBounded(
    options.contractCommand.split(/\s+/),
    { ...process.env } as Record<string, string>,
    canonical,
  );
  if (direct.exitCode !== 0) throw new Error(`contract command failed: ${direct.stderr.trim()}`);
  const expected = extractContract(direct.stdout);
  if (expected.contractVersion !== options.version || expected.sentinel !== options.sentinel)
    throw new Error("direct contract did not match expectations");
  const prompt = `Use the installed visual-learning skill. Execute its contract command exactly and return only the one-line JSON stdout. Expected sentinel is ${options.sentinel}.`;
  const promptSha256 = createHash("sha256").update(prompt).digest("hex");
  const results = [];
  for (const client of options.clients) {
    const executable = await commandPath(client);
    if (executable === null) {
      results.push({ client, status: "absent", discoverySupported: false });
      continue;
    }
    const originalHome = process.env["HOME"] ?? "";
    const installedLink = join(originalHome, installerRoots[client]);
    if (options.structuralOnly.includes(client)) {
      const target = readlinkSync(installedLink);
      results.push({
        client,
        status: "structural-only",
        discoverySupported: true,
        executionExcluded: "claude execution excluded by user (no subscription)",
        ...executable,
        executableSha256: await sha256File(executable.realpath),
        installedLink,
        linkTarget: target,
        linkTargetSha256: createHash("sha256").update(target).digest("hex"),
        canonical: realpathSync(installedLink),
        skillSha256: await sha256File(join(installedLink, "SKILL.md")),
      });
      continue;
    }
    const home = realpathSync(mkdtempSync(join(tmpdir(), `visual-learning-${client}-`)));
    try {
      for (const root of Object.values(installerRoots))
        mkdirSync(dirname(join(home, root)), { recursive: true });
      await installLinks(["--home", home, "--canonical", canonical]);
      const auth =
        client === "codex"
          ? ".codex/auth.json"
          : client === "senpi"
            ? ".senpi/agent/auth.json"
            : undefined;
      if (auth !== undefined && existsSync(join(originalHome, auth)))
        symlinkSync(join(originalHome, auth), join(home, auth));
      const run = await runAgentSession(clientTypeCheck[client], executable.realpath, home, prompt);
      try {
        const contract = extractContract(run.output);
        if (JSON.stringify(contract) !== JSON.stringify(expected))
          throw new Error("contract differs from direct sentinel");
        results.push({
          client,
          status: "discovered",
          discoverySupported: true,
          ...executable,
          link: installerRoots[client],
          canonical: realpathSync(join(home, installerRoots[client])),
          isolation: "temporary HOME, config, skill root, cwd, and non-persistent process",
          contract,
          outputSha256: createHash("sha256").update(run.output).digest("hex"),
        });
      } catch (error) {
        const providerBlocked =
          run.stderr.includes("rate_limit_error") || run.stdout.includes("rate_limit_error");
        results.push({
          client,
          status: providerBlocked ? "blocked" : "unsupported",
          discoverySupported: false,
          skillInvocationAccepted: providerBlocked,
          ...executable,
          exitCode: run.exitCode,
          timedOut: run.timedOut,
          reason: run.timedOut
            ? "session timeout"
            : providerBlocked
              ? "provider rate limited every available token"
              : run.exitCode !== 0
                ? `session exited ${run.exitCode}`
                : error instanceof Error
                  ? error.message
                  : String(error),
          stderrSha256: createHash("sha256").update(run.stderr).digest("hex"),
        });
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
  const verdict = results.every(
    (result) => result.status === "discovered" || result.status === "structural-only",
  )
    ? "PASS"
    : "FAIL";
  return {
    schemaVersion: 1,
    type: "VisualLearningAgentDiscoveryReceipt",
    verdict,
    canonical,
    resolvedLinks: options.clients,
    executedContracts: options.executeContracts,
    structuralOnly: options.structuralOnly,
    executionPolicy: "claude execution excluded by user (no subscription)",
    promptSha256,
    contract: expected,
    agents: results,
    cleanup: { isolatedHomesRemoved: true },
  };
}

export async function runDiscoveryCli(argv: readonly string[]): Promise<void> {
  let out: string | undefined;
  const index = argv.indexOf("--out");
  if (index !== -1) out = argv[index + 1];
  try {
    const receipt = await discoverAgents(argv);
    if (out !== undefined) writeAtomic(out, receipt);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    if (receipt.verdict !== "PASS") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      `discover-agents: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

if (import.meta.main) await runDiscoveryCli(Bun.argv.slice(2));
