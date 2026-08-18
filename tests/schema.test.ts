import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVisualNoteSpec, readSourceRevision } from "../src/schema";

const validSpec = {
  schemaVersion: 1,
  artifactId: "checkout-flow",
  kind: "workflow",
  revision: 1,
  title: "Checkout flow",
  source: { root: "/tmp/source", commit: null },
  nodes: [
    {
      semanticId: "api-handler",
      label: "POST /checkout",
      status: "fact",
      evidence: [{ path: "src/checkout.ts", lineStart: 10, lineEnd: 20 }],
    },
    { semanticId: "unknown-owner", label: "owner?", status: "question", evidence: [] },
  ],
  edges: [
    {
      semanticId: "handler-calls-owner",
      from: "api-handler",
      to: "unknown-owner",
      label: "calls",
      status: "inference",
      evidence: [{ path: "src/checkout.ts", lineStart: 18 }],
    },
  ],
};

describe("visual note schema", () => {
  test("accepts commit null when a complete spec crosses the boundary", () => {
    // Given
    const input: unknown = validSpec;
    // When
    const parsed = parseVisualNoteSpec(input);
    // Then
    expect(parsed.source.commit).toBeNull();
  });

  test("rejects a fact without repository evidence", () => {
    // Given
    const input = structuredClone(validSpec);
    const firstNode = input.nodes.at(0);
    if (firstNode === undefined) throw new TypeError("fixture requires a first node");
    firstNode.evidence = [];
    // When
    const parse = (): unknown => parseVisualNoteSpec(input);
    // Then
    expect(parse).toThrow();
  });

  test("rejects duplicate semantic IDs and dangling edges", () => {
    // Given
    const input = structuredClone(validSpec);
    const secondNode = input.nodes.at(1);
    const firstEdge = input.edges.at(0);
    if (secondNode === undefined || firstEdge === undefined)
      throw new TypeError("fixture requires two nodes and one edge");
    secondNode.semanticId = "api-handler";
    firstEdge.to = "missing";
    // When
    const parse = (): unknown => parseVisualNoteSpec(input);
    // Then
    expect(parse).toThrow();
  });

  test("rejects traversal evidence paths", () => {
    // Given
    const input = structuredClone(validSpec);
    const firstNode = input.nodes.at(0);
    const firstEvidence = firstNode?.evidence.at(0);
    if (firstEvidence === undefined) throw new TypeError("fixture requires evidence");
    firstEvidence.path = "../secret";
    // When
    const parse = (): unknown => parseVisualNoteSpec(input);
    // Then
    expect(parse).toThrow();
  });

  test("reads an existing Git revision without changing repository state", () => {
    // Given
    const source = mkdtempSync(join(tmpdir(), "visual-note-git-"));
    Bun.spawnSync(["git", "init", "-q", source]);
    writeFileSync(join(source, "README.md"), "fixture\n");
    Bun.spawnSync(["git", "-C", source, "add", "README.md"]);
    Bun.spawnSync([
      "git",
      "-C",
      source,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ]);
    const before = Bun.spawnSync([
      "git",
      "-C",
      source,
      "status",
      "--porcelain=v1",
    ]).stdout.toString();
    // When
    const revision = readSourceRevision(source);
    // Then
    expect(revision).toMatch(/^[0-9a-f]{40}$/);
    expect(Bun.spawnSync(["git", "-C", source, "status", "--porcelain=v1"]).stdout.toString()).toBe(
      before,
    );
  });

  test("returns null for a readable plain source without initializing Git", () => {
    // Given
    const source = mkdtempSync(join(tmpdir(), "visual-note-plain-"));
    mkdirSync(join(source, "src"));
    // When
    const revision = readSourceRevision(source);
    // Then
    expect(revision).toBeNull();
    expect(Bun.file(join(source, ".git")).size).toBe(0);
  });
});

export { validSpec };
