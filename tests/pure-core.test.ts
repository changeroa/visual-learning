import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pureCoreEntries = [
  "refresh-apply.ts",
  "scene-bootstrap.ts",
  "renderer-plan.ts",
  "schema.ts",
  "excalidraw-file.ts",
];
const forbiddenPatterns = [
  ["Bun.", /\bBun\./g],
  ["node:fs", /\bnode:fs\b/g],
  ["node:child_process", /\bnode:child_process\b/g],
  ["process.", /\bprocess\./g],
] as const;

function relativeImports(content: string): string[] {
  return new Bun.Transpiler({ loader: "ts" })
    .scan(content)
    .imports.map(({ path }) => path)
    .filter((moduleSpecifier) => moduleSpecifier.startsWith("."));
}

function resolveRelativeImport(importer: string, moduleSpecifier: string): string {
  const base = resolve(dirname(importer), moduleSpecifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
  const resolved = candidates.find(existsSync);
  if (resolved === undefined)
    throw new Error(`cannot resolve relative import ${moduleSpecifier} from ${importer}`);
  return resolved;
}

test("pure spec and scene core has no runtime-only imports or references", () => {
  const sourceRoot = resolve(import.meta.dir, "../src");
  const pending = pureCoreEntries.map((entry) => resolve(sourceRoot, entry));
  const visited = new Set<string>();
  const violations: string[] = [];

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (filePath === undefined || visited.has(filePath)) continue;
    visited.add(filePath);
    const content = readFileSync(filePath, "utf8");

    for (const [label, pattern] of forbiddenPatterns) {
      if (pattern.test(content)) violations.push(`${filePath}: forbidden ${label}`);
      pattern.lastIndex = 0;
    }
    for (const match of content.matchAll(/\bnode:([a-z][\w./-]*)/g)) {
      const builtin = match[1];
      if (builtin !== "crypto" && builtin !== "path")
        violations.push(`${filePath}: forbidden node:${builtin}`);
    }
    for (const moduleSpecifier of relativeImports(content))
      pending.push(resolveRelativeImport(filePath, moduleSpecifier));
  }

  expect(violations).toEqual([]);
});
