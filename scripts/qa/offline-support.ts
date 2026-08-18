import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../../src/io";

export const DENY_NETWORK_PROFILE = "(version 1) (allow default) (deny network*)\n";

export const OFFLINE_CLI_STUB = `#!/bin/sh
# Test-only offline Obsidian CLI stub: filesystem-only canned responses, no app launch, no network.
key="\${2:-}"
case "$key" in
  vault)
    case "\${3:-}" in
      info=path)
        printf '%s\\n' "\${OFFLINE_STUB_VAULT_PATH:?offline stub requires OFFLINE_STUB_VAULT_PATH}"
        exit 0
        ;;
    esac
    ;;
  plugins:enabled)
    printf '%s\\n' '[{"id":"obsidian-excalidraw-plugin","version":"2.26.4"}]'
    exit 0
    ;;
  eval)
    printf '%s\\n' '{"sentinel":"VISUAL_NOTE_EXCALIDRAW_READY","loaded":true,"id":"obsidian-excalidraw-plugin","automatePresent":true,"getAPI":true,"scriptEnginePresent":true}'
    exit 0
    ;;
  open)
    exit 0
    ;;
esac
printf 'offline-obsidian-cli: unsupported command: %s\\n' "$key" >&2
exit 1
`;

const stubHandlers = ["info=path", "plugins:enabled", "eval", "open"] as const;
const networkTools = /\/usr\/bin\/curl|\/usr\/bin\/nc|\/usr\/sbin\/networksetup|\bwget\b/;

export function validateProfileContent(text: string): { valid: boolean; reason?: string } {
  if (text === DENY_NETWORK_PROFILE) return { valid: true };
  return {
    valid: false,
    reason: "profile must be exactly (version 1) (allow default) (deny network*)",
  };
}

export function validateStubScript(text: string): { valid: boolean; reason?: string } {
  if (!text.startsWith("#!/bin/sh\n"))
    return { valid: false, reason: "stub must be a /bin/sh script" };
  for (const handler of stubHandlers) {
    if (!text.includes(handler)) return { valid: false, reason: `stub must handle ${handler}` };
  }
  if (networkTools.test(text))
    return { valid: false, reason: "stub must not invoke network tools" };
  return { valid: true };
}

export type DenialClassification = "denied-operation-not-permitted" | "denied" | "not-denied";

export function classifyNetworkDenial(input: {
  readonly tool: string;
  readonly exitCode: number | null;
  readonly stderr: string;
}): DenialClassification {
  const text = input.stderr.toLowerCase();
  if (text.includes("operation not permitted")) return "denied-operation-not-permitted";
  if (
    input.exitCode !== 0 &&
    input.exitCode !== null &&
    (text.includes("couldn't connect") ||
      text.includes("could not resolve") ||
      text.includes("failed to connect"))
  ) {
    return "denied";
  }
  return "not-denied";
}

export function buildRegistryJson(verifiedVaultId: string, vaultPath: string): string {
  return `${JSON.stringify({ vaults: { [verifiedVaultId]: { path: vaultPath } } }, null, 2)}\n`;
}

export type SentinelRecord = {
  readonly algorithm: "SHA-256";
  readonly byteLength: number;
  readonly sha256: string;
  readonly plaintextRetained: false;
};

export function sentinelRecord(plaintext: Uint8Array): SentinelRecord {
  return {
    algorithm: "SHA-256",
    byteLength: plaintext.byteLength,
    sha256: sha256(plaintext),
    plaintextRetained: false,
  };
}

export function assertNoPlaintext(serialized: string, plaintext: string): void {
  if (serialized.includes(plaintext)) {
    throw new Error("plaintext sentinel leaked into machine output");
  }
}

export type ScanRootReport = {
  readonly root: string;
  readonly exists: boolean;
  readonly filesScanned: number;
  readonly bytesScanned: number;
  readonly symlinksSkipped: number;
  readonly oversizedSkipped: number;
  readonly matches: readonly {
    readonly path: string;
    readonly count: number;
    readonly designated: boolean;
  }[];
};

export type ScanReport = {
  readonly roots: readonly ScanRootReport[];
  readonly designatedPath: string;
  readonly totalMatchFiles: number;
  readonly designatedMatchCount: number;
};

export function scanRootsForPlaintext(
  roots: readonly string[],
  plaintext: Buffer,
  designatedPath: string,
  options: { readonly maxFileBytes: number },
): ScanReport {
  const reports: ScanRootReport[] = roots.map((root) => {
    if (!existsDir(root)) {
      return {
        root,
        exists: false,
        filesScanned: 0,
        bytesScanned: 0,
        symlinksSkipped: 0,
        oversizedSkipped: 0,
        matches: [],
      };
    }
    let filesScanned = 0;
    let bytesScanned = 0;
    let symlinksSkipped = 0;
    let oversizedSkipped = 0;
    const matches: { path: string; count: number; designated: boolean }[] = [];
    const visit = (directory: string): void => {
      for (const name of readdirSync(directory).sort()) {
        const path = join(directory, name);
        const status = lstatSync(path);
        if (status.isSymbolicLink()) {
          symlinksSkipped += 1;
          continue;
        }
        if (status.isDirectory()) {
          visit(path);
          continue;
        }
        if (!status.isFile()) continue;
        if (status.size > options.maxFileBytes) {
          oversizedSkipped += 1;
          continue;
        }
        const bytes = readFileSync(path);
        filesScanned += 1;
        bytesScanned += bytes.byteLength;
        let offset = 0;
        let count = 0;
        for (;;) {
          const found = bytes.indexOf(plaintext, offset);
          if (found < 0) break;
          count += 1;
          offset = found + plaintext.byteLength;
        }
        if (count > 0) matches.push({ path, count, designated: path === designatedPath });
      }
    };
    visit(root);
    return {
      root,
      exists: true,
      filesScanned,
      bytesScanned,
      symlinksSkipped,
      oversizedSkipped,
      matches,
    };
  });
  const allMatches = reports.flatMap((report) => report.matches);
  return {
    roots: reports,
    designatedPath,
    totalMatchFiles: allMatches.length,
    designatedMatchCount: allMatches.find((match) => match.designated)?.count ?? 0,
  };
}

function existsDir(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

export type PsEntry = {
  readonly pid: number;
  readonly ppid: number;
  readonly lstart: string;
  readonly command: string;
};

export function parsePsSnapshot(text: string): readonly PsEntry[] {
  const entries: PsEntry[] = [];
  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 8) continue;
    const pid = parts[0];
    const ppid = parts[1];
    if (pid === undefined || ppid === undefined || !/^\d+$/.test(pid) || !/^\d+$/.test(ppid))
      continue;
    entries.push({
      pid: Number(pid),
      ppid: Number(ppid),
      lstart: parts.slice(2, 7).join(" "),
      command: parts.slice(7).join(" "),
    });
  }
  return entries;
}

export function chainFromSnapshot(snapshot: readonly PsEntry[], pid: number): readonly PsEntry[] {
  const byPid = new Map(snapshot.map((entry) => [entry.pid, entry]));
  const chain: PsEntry[] = [];
  const seen = new Set<number>();
  let current = byPid.get(pid);
  while (current !== undefined && !seen.has(current.pid)) {
    seen.add(current.pid);
    chain.push(current);
    current = byPid.get(current.ppid);
  }
  return chain;
}

export function descentProven(
  chain: readonly PsEntry[],
  wrapperPid: number,
  harnessPid: number,
): boolean {
  const wrapperIndex = chain.findIndex((entry) => entry.pid === wrapperPid);
  const harnessIndex = chain.findIndex((entry) => entry.pid === harnessPid);
  return wrapperIndex >= 0 && harnessIndex >= 0 && wrapperIndex < harnessIndex;
}

export function treeDigest(root: string): { readonly digest: string; readonly entries: number } {
  const items: unknown[] = [];
  let count = 0;
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const status = lstatSync(path);
      items.push({
        path,
        type: status.isDirectory() ? "directory" : status.isFile() ? "file" : "symlink",
        size: status.size,
        sha256: status.isFile()
          ? createHash("sha256").update(readFileSync(path)).digest("hex")
          : null,
      });
      count += 1;
      if (status.isDirectory()) visit(path);
    }
  };
  visit(root);
  return { digest: sha256(JSON.stringify(items)), entries: count };
}

export type SandboxedRun = {
  readonly label: string;
  readonly argv: readonly string[];
  readonly pid: number;
  readonly lstart: string | null;
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly elapsedMs: number;
  readonly timedOut: boolean;
  readonly snapshotObserved: boolean;
  readonly chainPids: readonly number[];
  readonly descendantPids: readonly number[];
  readonly envKeys: readonly string[];
};

export async function runSandboxed(input: {
  readonly sandboxExec: string;
  readonly profile: string;
  readonly argv: readonly string[];
  readonly env: Record<string, string | undefined>;
  readonly timeoutMs: number;
  readonly label: string;
  readonly harnessPid: number;
}): Promise<SandboxedRun> {
  const started = Date.now();
  const proc = Bun.spawn([input.sandboxExec, "-f", input.profile, ...input.argv], {
    stdout: "pipe",
    stderr: "pipe",
    env: stripUndefined(input.env),
  });
  const stdoutText = new Response(proc.stdout).text();
  const stderrText = new Response(proc.stderr).text();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, input.timeoutMs);
  let snapshot: readonly PsEntry[] | null = null;
  const snapshotDeadline = Date.now() + 2000;
  while (snapshot === null && Date.now() < snapshotDeadline) {
    const text = Bun.spawnSync(["ps", "-axo", "pid=,ppid=,lstart=,command="], {
      stdout: "pipe",
    }).stdout.toString();
    const parsed = parsePsSnapshot(text);
    if (parsed.some((entry) => entry.pid === proc.pid)) snapshot = parsed;
    else await new Promise((resolve) => setImmediate(resolve));
  }
  const exitCode = await proc.exited;
  clearTimeout(timer);
  const stdout = await stdoutText;
  const stderr = await stderrText;
  const chain = snapshot === null ? [] : chainFromSnapshot(snapshot, proc.pid);
  const byPid = new Map((snapshot ?? []).map((entry) => [entry.pid, entry]));
  const descendants = (snapshot ?? []).filter((entry) => {
    let current = byPid.get(entry.ppid);
    const seen = new Set<number>();
    while (current !== undefined && !seen.has(current.pid)) {
      if (current.pid === proc.pid) return true;
      seen.add(current.pid);
      current = byPid.get(current.ppid);
    }
    return false;
  });
  return {
    label: input.label,
    argv: input.argv,
    pid: proc.pid,
    lstart: chain[0]?.lstart ?? null,
    exitCode,
    signalCode: proc.signalCode,
    stdout,
    stderr,
    elapsedMs: Date.now() - started,
    timedOut,
    snapshotObserved: snapshot !== null,
    chainPids: chain.map((entry) => entry.pid),
    descendantPids: descendants.map((entry) => entry.pid),
    envKeys: Object.keys(input.env).sort(),
  };
}

function stripUndefined(env: Record<string, string | undefined>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

export const PS_COLUMNS = "pid=,ppid=,lstart=,command=";
