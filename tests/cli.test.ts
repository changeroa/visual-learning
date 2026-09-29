import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
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
      "init",
      "bootstrap",
      "create",
      "export-series",
      "extend",
      "refresh",
      "validate",
      "authoring-schema",
      "compile-authoring",
      "review-learning",
      "restore",
      "contract",
    ];
    // When
    const result = run(["--help"]);
    // Then
    expect(result.code).toBe(0);
    for (const command of commands) expect(result.stdout).toContain(command);
    expect(result.stdout).not.toContain("preflight");
    expect(result.stdout).not.toContain("\n  open ");
    expect(result.stdout).not.toContain("--vault");
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

  test("review-learning reports research-rule findings and rejects a dangling route", () => {
    // Given
    const learning = join(import.meta.dir, "fixtures/learning/checkout-journey.json");
    const legacy = join(import.meta.dir, "fixtures/architecture.json");
    const dangling = join(import.meta.dir, "fixtures/learning/invalid-route.json");
    // When
    const reviewed = run(["review-learning", "--spec", learning, "--json"]);
    const bare = run(["review-learning", "--spec", legacy, "--json"]);
    const rejected = run(["review-learning", "--spec", dangling, "--json"]);
    // Then
    expect(reviewed.code).toBe(0);
    const review = JSON.parse(reviewed.stdout) as {
      hasLearningLayer: boolean;
      counts: { warn: number };
      findings: { rule: string; target: string | null }[];
    };
    expect(review.hasLearningLayer).toBe(true);
    expect(review.counts.warn).toBe(0);
    expect(review.findings.map((finding) => finding.target)).toContain("checkout-service");
    expect(bare.code).toBe(0);
    const bareRules = (JSON.parse(bare.stdout) as { findings: { rule: string }[] }).findings.map(
      (finding) => finding.rule,
    );
    expect(bareRules).toContain("LR01-question");
    expect(bareRules).toContain("LR02-edge-relation");
    expect(rejected.code).toBe(2);
    expect(rejected.stderr).toContain("unknown semantic ID missing-node");
  });

  test("review-learning warns when a single-row figure is too wide to read", () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "visual-note-review-width-"));
    const wide = join(directory, "wide.json");
    const spec = JSON.parse(
      readFileSync(join(import.meta.dir, "fixtures/learning/checkout-journey.json"), "utf8"),
    ) as {
      presentation: { layout: string; frames: unknown[] };
      nodes: { visual: { frameId?: string } }[];
    };
    spec.presentation = { ...spec.presentation, layout: "timeline", frames: [] };
    for (const node of spec.nodes) delete node.visual.frameId;
    writeFileSync(wide, `${JSON.stringify(spec)}\n`);
    // When
    const result = run(["review-learning", "--spec", wide, "--json"]);
    // Then
    expect(result.code).toBe(0);
    const rules = (JSON.parse(result.stdout) as { findings: { rule: string }[] }).findings.map(
      (finding) => finding.rule,
    );
    expect(rules).toContain("LR07-figure-width");
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
        contractVersion: 2,
        measurementPolicy: expect.objectContaining({
          nodeAspectRatio: 1.5,
          typography: "enforce-authored-and-effective-text-floors",
          exactPixelsGuaranteed: false,
        }),
      }),
    );
  });

  test("create rejects invalid input before writing and refuses a dirty target", () => {
    // Given
    const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-root-")));
    const directory = mkdtempSync(join(tmpdir(), "visual-note-spec-"));
    const spec = join(directory, "spec.json");
    writeFileSync(spec, `${JSON.stringify(validSpec)}\n`);
    const args = ["create", "--root", root, "--project", "fixture", "--spec", spec, "--json"];
    // When
    const first = run(args);
    const target = join(
      root,
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
    const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-init-root-")));
    const source = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-init-source-")));
    // When
    const result = run([
      "init",
      "--root",
      root,
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

  test("a traversal project is rejected before the root changes", () => {
    // Given
    const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-traversal-root-")));
    const directory = mkdtempSync(join(tmpdir(), "visual-note-traversal-spec-"));
    const spec = join(directory, "spec.json");
    writeFileSync(spec, `${JSON.stringify(validSpec)}\n`);
    // When
    const result = run([
      "create",
      "--root",
      root,
      "--project",
      "../../escape",
      "--spec",
      spec,
      "--json",
    ]);
    // Then
    expect(result.code).toBe(2);
    expect(Bun.file(join(root, "Engineering Atlas")).size).toBe(0);
  });

  test("create rejects unavailable, relative, non-normalized, and symlinked roots", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-root-guard-")));
    const realRoot = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-root-real-")));
    const linkedRoot = join(directory, "linked-root");
    const spec = join(directory, "spec.json");
    writeFileSync(spec, `${JSON.stringify(validSpec)}\n`);
    symlinkSync(realRoot, linkedRoot);

    const runCreate = (root: string) =>
      run(["create", "--root", root, "--project", "fixture", "--spec", spec, "--json"]);

    expect(runCreate("relative").code).toBe(2);
    expect(runCreate(`${realRoot}/../${realRoot.split("/").at(-1)}`).code).toBe(2);
    expect(runCreate(join(directory, "missing")).code).toBe(2);
    expect(runCreate(linkedRoot).code).toBe(2);
    expect(runCreate(realRoot).code).toBe(0);
  });

  test("removed vault flag is rejected as an unknown option", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-removed-option-")));
    const spec = join(root, "spec.json");
    writeFileSync(spec, `${JSON.stringify(validSpec)}\n`);

    const result = run(["create", "--vault", root, "--project", "fixture", "--spec", spec]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown option: --vault");
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
