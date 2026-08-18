import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { RuntimeError } from "../../src/errors";
import { readJson, sha256 } from "../../src/io";
import { openTransaction } from "../../src/transaction-verify";

export const PLUGIN_ID = "obsidian-excalidraw-plugin";

export type CommandResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

export function run(args: readonly string[]): CommandResult {
  const result = Bun.spawnSync([...args], { stdout: "pipe", stderr: "pipe" });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new RuntimeError(message);
}

const pluginReceiptSchema = z
  .object({
    plugin: z.object({
      id: z.literal(PLUGIN_ID),
      version: z.string().min(1),
      directory: z.string(),
      assets: z.array(z.object({ name: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
    }),
  })
  .passthrough();

export type IsolatedPluginReceipt = z.infer<typeof pluginReceiptSchema>;

export function verifiedPluginReceipt(
  receiptPath: string,
  verifyPluginSha: boolean,
): IsolatedPluginReceipt {
  const receipt = pluginReceiptSchema.parse(readJson(receiptPath));
  const assets = new Map(receipt.plugin.assets.map((asset) => [asset.name, asset]));
  for (const name of ["manifest.json", "main.js", "data.json"] as const) {
    const asset = assets.get(name);
    if (asset === undefined) throw new RuntimeError(`plugin receipt missing ${name}`);
    const source = join(receipt.plugin.directory, name);
    if (verifyPluginSha && sha256(readFileSync(source)) !== asset.sha256) {
      throw new RuntimeError(`tampered plugin asset receipt: ${name}`);
    }
  }
  z.object({ id: z.literal(PLUGIN_ID), version: z.literal(receipt.plugin.version) }).parse(
    JSON.parse(readFileSync(join(receipt.plugin.directory, "manifest.json"), "utf8")),
  );
  return receipt;
}

export function provisionPlugin(vault: string, receipt: IsolatedPluginReceipt): string {
  const pluginTarget = join(vault, ".obsidian/plugins", PLUGIN_ID);
  mkdirSync(pluginTarget, { recursive: true });
  for (const asset of receipt.plugin.assets) {
    const source = join(receipt.plugin.directory, asset.name);
    const sourceHash = sha256(readFileSync(source));
    if (sourceHash !== asset.sha256) throw new RuntimeError(`tampered plugin asset: ${asset.name}`);
    copyFileSync(source, join(pluginTarget, asset.name));
    if (sha256(readFileSync(join(pluginTarget, asset.name))) !== asset.sha256) {
      throw new RuntimeError(`copied plugin SHA mismatch: ${asset.name}`);
    }
  }
  writeFileSync(join(vault, ".obsidian/community-plugins.json"), `["${PLUGIN_ID}"]\n`);
  writeFileSync(join(vault, ".obsidian/app.json"), "{}\n");
  return receipt.plugin.version;
}

export type OpenReceipt = {
  readonly mode: "working-copy-open-default-profile";
  readonly substitution: string;
  readonly isolatedWorkingCopy: { readonly path: string; readonly sha256: string };
  readonly command: readonly string[];
  readonly preflightCommand: readonly string[];
  readonly openedVault: string;
  readonly openedPath: string;
  readonly pluginVersion: string;
};

export const substitutionNote =
  "isolated app-launch open replaced by working-copy open resolution under the user-approved default-profile scope";

function resolveWorkingCopy(
  vault: string,
  project: string,
  artifactId: string,
): {
  readonly path: string;
  readonly sha256: string;
} {
  const opened = openTransaction(vault, project, artifactId);
  const workingPath = opened.state.workingPath;
  assert(existsSync(workingPath), `working copy missing: ${workingPath}`);
  return { path: workingPath, sha256: sha256(readFileSync(workingPath)) };
}

function waitForDefaultPreflight(
  cli: string,
  cliPath: string,
  openVault: string,
): readonly string[] {
  const command = [
    cli,
    "preflight",
    "--obsidian-cli",
    cliPath,
    "--expected-vault",
    openVault,
    "--json",
  ] as const;
  if (run(command).code === 0) return command;
  const launch = run(["open", "-a", "Obsidian"]);
  assert(launch.code === 0, launch.stderr || "default-profile Obsidian launch failed");
  const deadline = Date.now() + 60_000;
  let failure = "default-profile preflight timed out";
  while (Date.now() < deadline) {
    const result = run(command);
    if (result.code === 0) return command;
    failure = result.stderr.trim() || failure;
  }
  throw new RuntimeError(failure);
}

export function openWalkthrough(input: {
  readonly cli: string;
  readonly cliPath: string;
  readonly vault: string;
  readonly openVault: string;
  readonly project: string;
  readonly artifactId: string;
  readonly pluginReceipt: IsolatedPluginReceipt;
}): { readonly result: CommandResult; readonly receipt: OpenReceipt } {
  const pluginVersion = provisionPlugin(input.vault, input.pluginReceipt);
  const isolatedWorkingCopy = resolveWorkingCopy(input.vault, input.project, input.artifactId);
  const preflightCommand = waitForDefaultPreflight(input.cli, input.cliPath, input.openVault);
  const command = [
    input.cli,
    "open",
    "--obsidian-cli",
    input.cliPath,
    "--vault",
    input.openVault,
    "--expected-vault",
    input.openVault,
    "--project",
    input.project,
    "--artifact-id",
    input.artifactId,
    "--json",
  ] as const;
  const result = run(command);
  assert(result.code === 0, result.stderr || "open walkthrough failed");
  const parsed = z
    .object({ operation: z.literal("open"), path: z.string(), opened: z.literal(true) })
    .parse(JSON.parse(result.stdout));
  const opened = resolveWorkingCopy(input.openVault, input.project, input.artifactId);
  assert(
    parsed.path === relative(input.openVault, opened.path),
    `open path mismatch: ${parsed.path}`,
  );
  return {
    result,
    receipt: {
      mode: "working-copy-open-default-profile",
      substitution: substitutionNote,
      isolatedWorkingCopy,
      command,
      preflightCommand,
      openedVault: input.openVault,
      openedPath: parsed.path,
      pluginVersion,
    },
  };
}

export function expectedFiles(projectRoot: string): readonly string[] {
  return [
    "00 Map.md",
    "02 ADR/Decision Tradeoff Map.md",
    "03 API/Contract Journey.md",
    "04 Workflows/Sequence Walkthrough.md",
    "05 Study Notes/What to Study Next.md",
    "05 Study Notes/Prompt Recipes.md",
    "05 Study Notes/Create Walkthrough.md",
    "05 Study Notes/Extend Walkthrough.md",
    "05 Study Notes/Refresh Walkthrough.md",
    "05 Study Notes/Restore Walkthrough.md",
    "05 Study Notes/Visual Legend.md",
    "05 Study Notes/Troubleshooting.md",
    "_assets/walkthrough-create.json",
    "_assets/walkthrough-extend.json",
    "_assets/walkthrough-refresh-v2.json",
    "_generated/specs/source.json",
    "_generated/specs/project-map-atlas-shop.json",
  ].map((relativePath) => join(projectRoot, relativePath));
}

export function validateLinks(projectRoot: string): {
  readonly broken: readonly string[];
  readonly checked: number;
} {
  const files = [
    "00 Map.md",
    "02 ADR/Decision Tradeoff Map.md",
    "03 API/Contract Journey.md",
    "04 Workflows/Sequence Walkthrough.md",
    "05 Study Notes/What to Study Next.md",
    "05 Study Notes/Prompt Recipes.md",
    "05 Study Notes/Create Walkthrough.md",
    "05 Study Notes/Extend Walkthrough.md",
    "05 Study Notes/Refresh Walkthrough.md",
    "05 Study Notes/Restore Walkthrough.md",
    "05 Study Notes/Visual Legend.md",
    "05 Study Notes/Troubleshooting.md",
  ];
  const broken: string[] = [];
  for (const relativePath of files) {
    const absolutePath = join(projectRoot, relativePath);
    const source = readFileSync(absolutePath, "utf8");
    const matches = [...source.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
    for (const match of matches) {
      const target = match[1];
      if (target === undefined) continue;
      const path = join(
        dirname(projectRoot),
        target.replace(/^Engineering Atlas\/10 Projects\//, ""),
      );
      if (!existsSync(path) && !existsSync(`${path}.md`)) {
        broken.push(`${relativePath} -> ${target}`);
      }
    }
  }
  return { broken, checked: files.length };
}
