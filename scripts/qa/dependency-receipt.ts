#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (value === undefined) throw new TypeError(`${name} is required`);
  return value;
}

const lockPath = resolve(option("--lock"));
const outPath = resolve(option("--out"));
const root = resolve(import.meta.dir, "../..");
const hash = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const packages = ["zod", "typescript", "@biomejs/biome", "@types/bun"].map((name) => {
  const manifest = join(root, "node_modules", name, "package.json");
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    typeof parsed.version !== "string"
  ) {
    throw new TypeError(`invalid installed manifest: ${name}`);
  }
  return {
    name,
    version: parsed.version,
    manifestSha256: hash(manifest),
    type: lstatSync(manifest).isFile() ? "file" : "invalid",
  };
});
const receipt = {
  schemaVersion: 1,
  type: "VisualLearningDependencyReceipt",
  lockSha256: hash(lockPath),
  bunVersion: Bun.version,
  frozenInstall: true,
  packages,
} as const;
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify(receipt)}\n`);
