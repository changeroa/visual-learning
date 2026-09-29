import { ensureRealDirectory } from "./path-guard";
import { readSourceRevision, type VisualNoteSpec } from "./schema";

const defaultTimeoutMs = 10_000;
const defaultOutputLimitBytes = 16 * 1024;
const truncatedMarker = "…[truncated]";
const shellSyntax = new Set(["|", "&", ";", "<", ">", "$", "`", "(", ")", "*"]);
const directCommands = new Set(["rg", "grep", "cat", "head", "tail", "wc", "ls"]);
const gitCommands = new Set(["show", "log", "grep", "rev-parse", "ls-files", "blame", "diff"]);
const sedPrintScript = /^(?:\d+|\$)(?:,(?:\d+|\$))?p$/u;

export type VerifyRecord = {
  readonly index: number;
  readonly semanticId: string;
  readonly how: string;
  readonly command: string | null;
  readonly status: "ran" | "not-run";
  readonly reason:
    | "no command"
    | "shell syntax"
    | "unparseable"
    | "not allowlisted"
    | "timeout"
    | null;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly commit: string | null;
  readonly ranAt: string;
};

export type RecordVerifyOptions = {
  readonly timeoutMs?: number;
  readonly outputLimitBytes?: number;
};

type TokenizeResult =
  | { readonly status: "ok"; readonly argv: string[] }
  | { readonly status: "rejected"; readonly reason: "shell syntax" | "unparseable" };

function tokenize(command: string): TokenizeResult {
  const argv: string[] = [];
  let token = "";
  let tokenStarted = false;
  let quote: "'" | '"' | null = null;

  for (const character of command) {
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        token += character;
      }
      tokenStarted = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (shellSyntax.has(character)) {
      return { status: "rejected", reason: "shell syntax" };
    }
    if (/\s/u.test(character)) {
      if (tokenStarted) {
        argv.push(token);
        token = "";
        tokenStarted = false;
      }
      continue;
    }
    token += character;
    tokenStarted = true;
  }

  if (quote !== null) return { status: "rejected", reason: "unparseable" };
  if (tokenStarted) argv.push(token);
  return { status: "ok", argv };
}

function isAllowlisted(argv: readonly string[]): boolean {
  const executable = argv[0];
  if (executable === undefined) return false;
  if (directCommands.has(executable)) return true;
  if (executable === "sed") {
    if (argv[1] !== "-n") return false;
    const script = argv[2];
    return (
      script !== undefined &&
      sedPrintScript.test(script) &&
      argv.slice(3).every((argument) => !argument.startsWith("-"))
    );
  }
  if (executable !== "git" || argv[1] === undefined || !gitCommands.has(argv[1])) return false;
  return argv
    .slice(2)
    .every(
      (argument) =>
        argument !== "--output" &&
        !argument.startsWith("--output=") &&
        argument !== "--ext-diff" &&
        argument !== "--textconv" &&
        argument !== "-O" &&
        !argument.startsWith("--open-files-in-pager"),
    );
}

async function capture(
  stream: ReadableStream<Uint8Array>,
  outputLimitBytes: number,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let retainedBytes = 0;
  let totalBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (retainedBytes >= outputLimitBytes) continue;
    const remaining = outputLimitBytes - retainedBytes;
    const retained = result.value.subarray(0, remaining);
    chunks.push(retained);
    retainedBytes += retained.byteLength;
  }

  const bytes = new Uint8Array(retainedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const output = new TextDecoder().decode(bytes);
  return totalBytes > outputLimitBytes ? `${output}${truncatedMarker}` : output;
}

async function run(
  argv: readonly string[],
  repoRoot: string,
  timeoutMs: number,
  outputLimitBytes: number,
): Promise<Pick<VerifyRecord, "exitCode" | "stdout" | "stderr" | "reason">> {
  const child = Bun.spawn([...argv], {
    cwd: repoRoot,
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill(9);
  }, timeoutMs);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      capture(child.stdout, outputLimitBytes),
      capture(child.stderr, outputLimitBytes),
    ]);
    return {
      exitCode: timedOut ? null : exitCode,
      stdout,
      stderr,
      reason: timedOut ? "timeout" : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function recordVerify(
  spec: VisualNoteSpec,
  repoRoot: string,
  options: RecordVerifyOptions = {},
): Promise<VerifyRecord[]> {
  const checkedRoot = ensureRealDirectory(repoRoot, "repo root");
  const commit = readSourceRevision(checkedRoot);
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const outputLimitBytes = options.outputLimitBytes ?? defaultOutputLimitBytes;
  const steps = spec.learning?.verify ?? [];
  const records: VerifyRecord[] = [];

  for (const [index, step] of steps.entries()) {
    const common = {
      index,
      semanticId: String(step.semanticId),
      how: step.how,
      commit,
      ranAt: new Date().toISOString(),
    };
    if (step.command === undefined) {
      records.push({
        ...common,
        command: null,
        status: "not-run",
        reason: "no command",
        exitCode: null,
        stdout: "",
        stderr: "",
      });
      continue;
    }

    const tokenized = tokenize(step.command);
    if (tokenized.status === "rejected") {
      records.push({
        ...common,
        command: step.command,
        status: "not-run",
        reason: tokenized.reason,
        exitCode: null,
        stdout: "",
        stderr: "",
      });
      continue;
    }
    if (!isAllowlisted(tokenized.argv)) {
      records.push({
        ...common,
        command: step.command,
        status: "not-run",
        reason: "not allowlisted",
        exitCode: null,
        stdout: "",
        stderr: "",
      });
      continue;
    }

    records.push({
      ...common,
      command: step.command,
      status: "ran",
      ...(await run(tokenized.argv, checkedRoot, timeoutMs, outputLimitBytes)),
    });
  }

  return records;
}
