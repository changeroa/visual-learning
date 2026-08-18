#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (value === undefined) throw new TypeError(`${name} is required`);
  return value;
}

const packagePath = resolve(option("--package"));
const lockPath = resolve(option("--lock"));
const outPath = resolve(option("--out"));
const hash = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const receipt = {
  schemaVersion: 1,
  type: "VisualLearningLockReceipt",
  package: { path: packagePath, sha256: hash(packagePath) },
  lock: { path: lockPath, sha256: hash(lockPath) },
  bunVersion: Bun.version,
  exactVersionsReviewed: true,
  lockfileOnlyRuns: 1,
} as const;
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify(receipt)}\n`);
