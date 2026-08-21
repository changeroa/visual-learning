import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validSpec } from "./schema.test";

const cli = join(import.meta.dir, "../bin/visual-note");

function run(args: readonly string[]): {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = Bun.spawnSync([cli, ...args]);
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("visual-note CLI", () => {
  test("help exposes the complete command surface", () => {
    // Given
    const commands = [
      "preflight",
      "init",
      "bootstrap",
      "create",
      "export-series",
      "extend",
      "refresh",
      "validate",
      "authoring-schema",
      "compile-authoring",
      "open",
      "restore",
      "contract",
    ];
    // When
    const result = run(["--help"]);
    // Then
    expect(result.code).toBe(0);
    for (const command of commands) expect(result.stdout).toContain(command);
  });

  test("contract emits the machine-consumed sentinel and fixture hash", () => {
    // Given
    const fixture = join(import.meta.dir, "fixtures/contract.json");
    // When
    const result = run(["contract", "--fixture", fixture, "--json"]);
    // Then
    expect(result.code).toBe(0);
    const parsed: unknown = JSON.parse(result.stdout);
    expect(parsed).toEqual(
      expect.objectContaining({ contractVersion: 1, sentinel: "VISUAL_LEARNING_CONTRACT_OK" }),
    );
    expect(result.stdout).toMatch(/[0-9a-f]{64}/);
  });

  test("validate accepts a valid strict spec and rejects unknown fields", () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "visual-note-cli-"));
    const good = join(directory, "good.json");
    const bad = join(directory, "bad.json");
    writeFileSync(good, `${JSON.stringify(validSpec)}\n`);
    writeFileSync(bad, `${JSON.stringify({ ...validSpec, injected: true })}\n`);
    // When
    const accepted = run(["validate", "--spec", good, "--json"]);
    const rejected = run(["validate", "--spec", bad, "--json"]);
    // Then
    expect(accepted.code).toBe(0);
    expect(rejected.code).toBe(2);
  });

  test("emits and compiles the render-independent interactive authoring contract", () => {
    const fixture = join(import.meta.dir, "fixtures/interactive-authoring.json");
    const schema = run(["authoring-schema", "--json"]);
    const compiled = run(["compile-authoring", "--spec", fixture, "--json"]);
    expect(schema.code).toBe(0);
    expect(JSON.parse(schema.stdout)).toEqual(expect.objectContaining({ type: "object" }));
    expect(compiled.code).toBe(0);
    expect(JSON.parse(compiled.stdout)).toEqual(
      expect.objectContaining({
        contractVersion: 1,
        measurementPolicy: expect.objectContaining({
          nodeAspectRatio: 1.5,
          exactPixelsGuaranteed: false,
        }),
      }),
    );
  });

  test("create rejects invalid input before writing and refuses a dirty target", () => {
    // Given
    const vault = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-vault-")));
    const directory = mkdtempSync(join(tmpdir(), "visual-note-spec-"));
    const spec = join(directory, "spec.json");
    writeFileSync(spec, `${JSON.stringify(validSpec)}\n`);
    const args = [
      "create",
      "--vault",
      vault,
      "--expected-vault",
      vault,
      "--project",
      "fixture",
      "--spec",
      spec,
      "--json",
    ];
    // When
    const first = run(args);
    const target = join(
      vault,
      "Engineering Atlas/10 Projects/fixture/_generated/specs/checkout-flow.json",
    );
    const before = readFileSync(target, "utf8");
    const second = run(args);
    // Then
    expect(first.code).toBe(0);
    expect(second.code).toBe(3);
    expect(readFileSync(target, "utf8")).toBe(before);
  });

  test("init records commit null for a plain source without creating Git", () => {
    // Given
    const vault = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-init-vault-")));
    const source = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-init-source-")));
    // When
    const result = run([
      "init",
      "--vault",
      vault,
      "--expected-vault",
      vault,
      "--project",
      "plain-source",
      "--source",
      source,
      "--json",
    ]);
    // Then
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({ source: { root: source, commit: null } }),
    );
    expect(Bun.file(join(source, ".git")).size).toBe(0);
  });

  test("extend refresh and restore expose typed no-mutation contract results", () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "visual-note-contract-"));
    const spec = join(directory, "spec.json");
    writeFileSync(spec, `${JSON.stringify(validSpec)}\n`);
    // When
    const results = ["extend", "refresh", "restore"].map((command) =>
      run([command, "--spec", spec, "--json"]),
    );
    // Then
    expect(results.map((result) => result.code)).toEqual([0, 0, 0]);
    expect(results.map((result) => JSON.parse(result.stdout).operation)).toEqual([
      "extend",
      "refresh",
      "restore",
    ]);
  });

  test("a traversal project is rejected before the vault changes", () => {
    // Given
    const vault = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-traversal-vault-")));
    const directory = mkdtempSync(join(tmpdir(), "visual-note-traversal-spec-"));
    const spec = join(directory, "spec.json");
    writeFileSync(spec, `${JSON.stringify(validSpec)}\n`);
    // When
    const result = run([
      "create",
      "--vault",
      vault,
      "--expected-vault",
      vault,
      "--project",
      "../../escape",
      "--spec",
      spec,
      "--json",
    ]);
    // Then
    expect(result.code).toBe(2);
    expect(Bun.file(join(vault, "Engineering Atlas")).size).toBe(0);
  });

  test("misleading success output still returns a nonzero exit", () => {
    // Given
    const missing = join(tmpdir(), "visual-note-missing-spec.json");
    // When
    const result = run(["validate", "--spec", missing, "--json"]);
    // Then
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});
