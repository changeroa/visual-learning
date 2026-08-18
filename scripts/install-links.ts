#!/usr/bin/env bun
import { join, normalize, relative, resolve } from "node:path";

const canonicalDefault = "/Users/billionjaepyo/.agents/skills/visual-learning";
const helper = join(import.meta.dir, "internal/install-link.py");
const clientParents = {
  senpi: ".senpi/agent/skills",
  codex: ".codex/skills",
  claude: ".claude/skills",
} as const;
type Client = keyof typeof clientParents;

interface Options {
  canonical: string;
  home: string;
  clients: Client[];
  hold?: "--hold-after-parent" | "--hold-after-check";
}

function value(argv: readonly string[], index: number, name: string): string {
  const result = argv[index + 1];
  if (result === undefined || result.startsWith("--")) throw new Error(`${name} requires a value`);
  return result;
}

function absolute(input: string, name: string): string {
  if (!input.startsWith("/") || normalize(input) !== input || input === "/" || input.includes("\\"))
    throw new Error(`${name} must be a normalized absolute non-root path`);
  return input;
}

function parse(argv: readonly string[]): Options {
  let canonical = canonicalDefault;
  let home = process.env["HOME"] ?? "";
  let clients: Client[] = ["senpi", "codex", "claude"];
  let hold: Options["hold"];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--canonical") canonical = value(argv, index++, argument);
    else if (argument === "--home") home = value(argv, index++, argument);
    else if (argument === "--clients") {
      const requested = value(argv, index++, argument).split(",");
      if (requested.length === 0 || requested.some((client) => !(client in clientParents)))
        throw new Error("--clients must contain senpi,codex,claude");
      clients = requested as Client[];
    } else if (argument === "--hold-after-parent" || argument === "--hold-after-check") {
      if (hold !== undefined || clients.length !== 1)
        throw new Error("a hold requires exactly one client and one hold option");
      hold = argument;
    } else throw new Error(`unknown option: ${argument}`);
  }
  return {
    canonical: absolute(canonical, "--canonical"),
    home: absolute(home, "--home"),
    clients,
    ...(hold === undefined ? {} : { hold }),
  };
}

async function runHelper(options: Options, client: Client) {
  const parent = join(options.home, clientParents[client]);
  const destination = join(parent, "visual-learning");
  const target = relative(parent, options.canonical);
  if (target === "" || resolve(parent, target) !== options.canonical)
    throw new Error(`cannot derive canonical target for ${client}`);
  const command = ["/usr/bin/python3", helper, options.canonical, destination, target];
  if (options.hold !== undefined) command.push(options.hold);
  const child = Bun.spawn(command, {
    stdin: options.hold === undefined ? "ignore" : "inherit",
    stdout: options.hold === undefined ? "pipe" : "inherit",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  const stdout = options.hold === undefined ? await new Response(child.stdout).text() : "";
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(stderr.trim() || `${client} link helper failed`);
  const receipt = options.hold === undefined ? JSON.parse(stdout) : { status: "created" };
  return { client, destination, target, status: receipt.status as string };
}

export async function installLinks(argv: readonly string[]) {
  const options = parse(argv);
  const links = [];
  for (const client of options.clients) links.push(await runHelper(options, client));
  return {
    schemaVersion: 1,
    type: "VisualLearningLinkReceipt",
    canonical: options.canonical,
    links,
  };
}

if (import.meta.main) {
  try {
    const receipt = await installLinks(Bun.argv.slice(2));
    if (!Bun.argv.includes("--hold-after-parent") && !Bun.argv.includes("--hold-after-check"))
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    process.stderr.write(
      `install-links: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(2);
  }
}
