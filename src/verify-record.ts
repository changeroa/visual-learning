import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { ensureRealDirectory } from "./path-guard";
import type { VisualNoteSpec } from "./schema";

const defaultTimeoutMs = 10_000;
const defaultOutputLimitBytes = 16 * 1024;
const truncatedMarker = "…[truncated]";
const shellSyntax = new Set(["|", "&", ";", "<", ">", "$", "`", "(", ")", "*"]);
const sedPrintScript = /^\d+(,\d+)?p$/u;
type OptionKind = "flag" | "pattern" | "text" | "number" | "format" | "lines";
type OptionAllowlist = Readonly<Record<string, OptionKind>>;
const searchOptions: OptionAllowlist = {
  "-n": "flag",
  "-i": "flag",
  "-F": "flag",
  "-w": "flag",
  "-l": "flag",
  "-c": "flag",
  "-e": "pattern",
};
const contextOptions: OptionAllowlist = {
  "-A": "number",
  "-B": "number",
  "-C": "number",
};
const commandOptions: Readonly<Record<string, OptionAllowlist>> = {
  rg: {
    ...searchOptions,
    ...contextOptions,
    "-S": "flag",
    "--smart-case": "flag",
    "--count": "flag",
    "-g": "text",
    "--glob": "text",
    "-t": "text",
    "--type": "text",
    "--no-heading": "flag",
    "--hidden": "flag",
  },
  grep: { ...searchOptions, ...contextOptions, "-E": "flag", "-h": "flag", "-H": "flag" },
  cat: {},
  head: { "-n": "number" },
  tail: { "-n": "number" },
  wc: { "-l": "flag", "-w": "flag", "-c": "flag" },
  ls: { "-l": "flag", "-a": "flag", "-1": "flag" },
};
const gitOptions: Readonly<Record<string, OptionAllowlist>> = {
  show: { "--stat": "flag", "--name-only": "flag", "--format": "format" },
  log: { "-n": "number", "--oneline": "flag", "--format": "format", "--stat": "flag" },
  "ls-files": {},
  "rev-parse": { "--verify": "flag", "--short": "flag" },
  blame: { "-L": "lines" },
  diff: { "--stat": "flag", "--name-only": "flag" },
  grep: searchOptions,
};

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
    | "option not allowlisted"
    | "path outside repo"
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
  if (command.includes("\0")) return { status: "rejected", reason: "unparseable" };
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

type Operand = { readonly value: string; readonly afterSeparator: boolean };
type ParsedOptions = { readonly operands: Operand[]; readonly hasPattern: boolean };

function validOptionValue(kind: OptionKind, value: string): boolean {
  if (kind === "number") return /^\d+$/u.test(value);
  if (kind === "lines") return /^\d+,\d+$/u.test(value);
  if (kind === "format") return !/%[G(]/u.test(value);
  return true;
}

function parseOptions(args: readonly string[], allowlist: OptionAllowlist): ParsedOptions | null {
  const operands: Operand[] = [];
  let afterSeparator = false;
  let hasPattern = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) return null;
    if (!afterSeparator && argument === "--") {
      afterSeparator = true;
      continue;
    }
    if (afterSeparator || !argument.startsWith("-") || argument === "-") {
      operands.push({ value: argument, afterSeparator });
      continue;
    }
    const long = argument.startsWith("--");
    const equals = argument.indexOf("=");
    const names = long
      ? [equals === -1 ? argument : argument.slice(0, equals)]
      : [...argument.slice(1)].map((character) => `-${character}`);
    for (const [offset, name] of names.entries()) {
      const kind = Object.hasOwn(allowlist, name) ? allowlist[name] : undefined;
      if (kind === undefined) return null;
      if (kind === "flag") {
        if (long && equals !== -1) return null;
        continue;
      }
      // An option with a value consumes the rest of a short cluster, not more flags.
      const attached = long
        ? equals === -1
          ? undefined
          : argument.slice(equals + 1)
        : offset + 2 < argument.length
          ? argument.slice(offset + 2)
          : undefined;
      if (kind === "format" && attached === undefined) return null;
      const value = attached ?? args[++index];
      if (value === undefined || !validOptionValue(kind, value)) return null;
      if (kind === "pattern") hasPattern = true;
      break;
    }
  }
  return { operands, hasPattern };
}

function isRevision(value: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9_./-]*(?:[~^]\d*)*$/u.test(value) && !value.includes("..");
}

function commandPaths(
  argv: readonly string[],
):
  | { readonly paths: string[] }
  | { readonly reason: "not allowlisted" | "option not allowlisted" } {
  const executable = argv[0] ?? "";
  if (executable === "sed") {
    if (
      argv[1] !== "-n" ||
      !sedPrintScript.test(argv[2] ?? "") ||
      argv.slice(3).some((argument) => argument.startsWith("-"))
    ) {
      return { reason: "option not allowlisted" };
    }
    return { paths: argv.slice(3) };
  }
  const subcommand = argv[1] ?? "";
  const table = executable === "git" ? gitOptions : commandOptions;
  const key = executable === "git" ? subcommand : executable;
  if (!Object.hasOwn(table, key)) {
    return {
      reason:
        executable === "git" && subcommand.startsWith("-")
          ? "option not allowlisted"
          : "not allowlisted",
    };
  }
  const parsed = parseOptions(argv.slice(executable === "git" ? 2 : 1), table[key] ?? {});
  if (parsed === null) return { reason: "option not allowlisted" };
  if (
    executable === "rg" ||
    executable === "grep" ||
    (executable === "git" && subcommand === "grep")
  ) {
    return { paths: parsed.operands.slice(parsed.hasPattern ? 0 : 1).map(({ value }) => value) };
  }
  if (executable !== "git") return { paths: parsed.operands.map(({ value }) => value) };
  const paths: string[] = [];
  for (const { value, afterSeparator } of parsed.operands) {
    if (afterSeparator || subcommand === "ls-files") {
      paths.push(value);
    } else if (subcommand === "show") {
      const colon = value.indexOf(":");
      if (!isRevision(colon === -1 ? value : value.slice(0, colon))) {
        return { reason: "not allowlisted" };
      }
      if (colon !== -1) paths.push(value.slice(colon + 1));
    } else if (subcommand === "rev-parse") {
      if (!isRevision(value)) return { reason: "not allowlisted" };
    } else if (subcommand === "diff") {
      const revisions = value.split("..");
      if (revisions.length !== 2 || !revisions.every(isRevision)) {
        return { reason: "not allowlisted" };
      }
    } else {
      return { reason: "not allowlisted" };
    }
  }
  return { paths };
}

function realpathOrNearestExistingParent(path: string): string | null {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  try {
    return realpathSync(current);
  } catch {
    return null;
  }
}

function isWithinRoot(path: string, realRoot: string): boolean {
  const fromRoot = relative(realRoot, path);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}

function isConfinedPath(argument: string, realRoot: string): boolean {
  if (
    argument.startsWith("/") ||
    argument.startsWith("~") ||
    argument.startsWith("$") ||
    argument.split("/").includes("..")
  ) {
    return false;
  }
  const canonical = realpathOrNearestExistingParent(resolve(realRoot, argument));
  return canonical !== null && isWithinRoot(canonical, realRoot);
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
  gitOverrides: readonly string[] = [],
): Promise<Pick<VerifyRecord, "exitCode" | "stdout" | "stderr" | "reason">> {
  const git = argv[0] === "git";
  const subcommand = argv[1] ?? "";
  const child = Bun.spawn(
    git
      ? [
          "git",
          "--no-pager",
          "--no-optional-locks",
          "--no-lazy-fetch",
          "--literal-pathspecs",
          `--work-tree=${repoRoot}`,
          "-c",
          "core.pager=cat",
          "-c",
          "core.fsmonitor=",
          "-c",
          "diff.external=",
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "log.showSignature=false",
          "-c",
          "format.pretty=medium",
          "-c",
          "diff.orderFile=/dev/null",
          "-c",
          "diff.submodule=short",
          "-c",
          "diff.autoRefreshIndex=false",
          "-c",
          "core.attributesFile=/dev/null",
          "-c",
          "core.excludesFile=/dev/null",
          "-c",
          "mailmap.file=/dev/null",
          "-c",
          "blame.ignoreRevsFile=",
          ...gitOverrides,
          subcommand,
          ...(["show", "log", "diff"].includes(subcommand)
            ? ["--no-ext-diff", "--no-textconv"]
            : []),
          ...(["blame", "grep"].includes(subcommand) ? ["--no-textconv"] : []),
          ...argv.slice(2).map((argument, index) => {
            const separator = argv.indexOf("--", 2);
            if (
              !["show", "log"].includes(subcommand) ||
              (separator !== -1 && index + 2 > separator) ||
              !argument.startsWith("--format=")
            )
              return argument;
            const format = argument.slice("--format=".length);
            // Literal formats must not resolve untrusted pretty.<name> aliases.
            return /^(?:tformat|format):/u.test(format) ? argument : `--format=tformat:${format}`;
          }),
        ]
      : [...argv],
    {
      cwd: repoRoot,
      env: {
        PATH: process.env["PATH"] ?? "/usr/bin:/bin",
        ...(git
          ? {
              GIT_CONFIG_NOSYSTEM: "1",
              GIT_CONFIG_GLOBAL: "/dev/null",
              GIT_TERMINAL_PROMPT: "0",
              GIT_PAGER: "cat",
              PAGER: "cat",
            }
          : {}),
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
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
  const realRoot = realpathSync(checkedRoot);
  // --no-textconv does not disable clean/process filters used by diff and blame.
  // Discover driver names without touching the index, then disable each at command scope.
  const filters = await run(
    [
      "git",
      "config",
      "--null",
      "--name-only",
      "--get-regexp",
      "^filter\\..*\\.(clean|smudge|process|required)$",
    ],
    realRoot,
    defaultTimeoutMs,
    defaultOutputLimitBytes,
  );
  const filterKeys = filters.stdout.split("\0").filter(Boolean);
  const gitOverrides = filterKeys.flatMap((key) => [
    "-c",
    `${key}=${key.endsWith(".required") ? "false" : ""}`,
  ]);
  const filtersChecked =
    (filters.exitCode === 0 || filters.exitCode === 1) &&
    !filters.stdout.endsWith(truncatedMarker) &&
    filterKeys.every((key) => /^filter\.[^=\n]+\.(clean|smudge|process|required)$/u.test(key));
  const revision = await run(
    ["git", "rev-parse", "--verify", "HEAD"],
    realRoot,
    defaultTimeoutMs,
    128,
  );
  const commit =
    revision.exitCode === 0 && /^[0-9a-f]{40,64}\n?$/u.test(revision.stdout)
      ? revision.stdout.trim()
      : null;
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
    const checked = commandPaths(tokenized.argv);
    if ("reason" in checked) {
      records.push({
        ...common,
        command: step.command,
        status: "not-run",
        reason: checked.reason,
        exitCode: null,
        stdout: "",
        stderr: "",
      });
      continue;
    }
    if (tokenized.argv[0] === "git" && !filtersChecked) {
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
    if (!checked.paths.every((path) => isConfinedPath(path, realRoot))) {
      records.push({
        ...common,
        command: step.command,
        status: "not-run",
        reason: "path outside repo",
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
      ...(await run(tokenized.argv, realRoot, timeoutMs, outputLimitBytes, gitOverrides)),
    });
  }

  return records;
}
