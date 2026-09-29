#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { retiredAppReferences } from "./retired-app-scan";

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new TypeError(`${name} requires a value`);
  return value;
}

const planPath = resolve(option("--plan"));
const denyCategories = option("--deny")
  .split(",")
  .map((category) => category.trim())
  .filter((category) => category.length > 0);
const outPath = resolve(option("--out"));
const packageRoot = resolve(import.meta.dir, "../..");

const failures: string[] = [];
const checks: { name: string; pass: boolean; details: string }[] = [];

function record(name: string, pass: boolean, details: string): void {
  checks.push({ name, pass, details });
  if (!pass) failures.push(`${name}: ${details}`);
}

const knownDenyCategories = new Set(["mcp", "git-commit"]);
const unsupportedDeny = denyCategories.filter((category) => !knownDenyCategories.has(category));
record(
  "deny-categories-supported",
  unsupportedDeny.length === 0,
  unsupportedDeny.length === 0
    ? `deny=${denyCategories.join(",")}`
    : `unsupported: ${unsupportedDeny.join(",")}`,
);

const inputs = {
  plan: {
    path: planPath,
    sha256: createHash("sha256").update(readFileSync(planPath)).digest("hex"),
  },
};

const retiredReferences = retiredAppReferences(packageRoot);
record(
  "no-retired-app-references",
  retiredReferences.length === 0,
  retiredReferences.length === 0
    ? "no file under src/, scripts/, or tests/ names the retired desktop note app"
    : retiredReferences.join(", "),
);

const denyChecks: Record<string, unknown> = {};
if (denyCategories.includes("mcp")) {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const mcpHits = Object.keys(packageJson).filter((key) => /mcp/i.test(key));
  denyChecks["mcp"] = { mcpHits };
  record(
    "deny-mcp",
    mcpHits.length === 0,
    mcpHits.length === 0 ? "no MCP servers registered" : mcpHits.join(","),
  );
}

function findGitRepositories(root: string): string[] {
  const found: string[] = [];
  if (!existsSync(root)) return found;
  const walk = (directory: string, depth: number): void => {
    if (depth > 8) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.name === ".git") {
        found.push(path);
        continue;
      }
      if (entry.isDirectory() && entry.name !== "node_modules") walk(path, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

if (denyCategories.includes("git-commit")) {
  const skillGit = findGitRepositories(packageRoot);
  denyChecks["gitRepositories"] = { skillRoot: skillGit };
  record(
    "deny-git-commit-no-repositories",
    skillGit.length === 0,
    skillGit.length === 0 ? `no .git under ${packageRoot}` : skillGit.join(","),
  );
}

const report = {
  schemaVersion: 1,
  verifier: "scripts/final/scope-fidelity.ts",
  inputs,
  configuration: { denyCategories },
  retiredAppReferences: retiredReferences,
  denyChecks,
  checks,
  reasons: failures,
  verdict: failures.length === 0 ? "APPROVE" : "REJECT",
};
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
const parseCheck = z
  .object({ verdict: z.enum(["APPROVE", "REJECT"]), reasons: z.array(z.string()) })
  .parse(JSON.parse(readFileSync(outPath, "utf8")));
process.stdout.write(
  `${JSON.stringify({ verdict: parseCheck.verdict, reasons: parseCheck.reasons, out: outPath })}\n`,
);
if (parseCheck.verdict !== "APPROVE") process.exit(1);
