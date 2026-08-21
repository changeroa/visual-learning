import { describe, expect, test } from "bun:test";
import { compileInteractiveAuthoringDocument } from "../src/interactive-authoring-compiler";
import {
  interactiveAuthoringJsonSchema,
  parseInteractiveAuthoringDocument,
} from "../src/interactive-authoring-schema";
import rawFixture from "./fixtures/interactive-authoring.json";

function cloneFixture(): unknown {
  return structuredClone(rawFixture);
}

type MutablePhase = {
  entities: Record<string, Record<string, unknown>>;
  relations: Record<string, Record<string, unknown>>;
  entityOrder: string[];
  relationOrder: string[];
};

type MutableScene = {
  story: { question: string };
  semantics: {
    entities: Record<string, { title: string; evidence: unknown[] }>;
  };
  change: { before: MutablePhase; after: MutablePhase };
  presentation: {
    placements: Record<string, Record<string, unknown>>;
    edgeRouting: { fallback: string[]; relations: Record<string, unknown> };
  };
  constraints: {
    nodeSizing: { aspectRatio: number };
    layout: { minimumZoom: number; columnGap: number };
  };
};

function mutableFixture(): { document: unknown; scene: MutableScene } {
  const document = structuredClone(rawFixture) as unknown as { scenes: MutableScene[] };
  const scene = document.scenes.at(0);
  if (scene === undefined) throw new TypeError("interactive fixture requires one scene");
  return { document, scene };
}

describe("render-independent interactive authoring", () => {
  test("compiles ordered before and after phases without renderer coordinates", () => {
    const compiled = compileInteractiveAuthoringDocument(rawFixture);
    const scene = compiled.scenes.at(0);
    expect(scene).toBeDefined();
    expect(scene?.before.nodes.map((node) => node.id)).toEqual([
      "commit-source",
      "browser-executor",
      "test-proof",
    ]);
    expect(scene?.after.nodes.map((node) => node.id)).toEqual([
      "commit-source",
      "daemon-authority",
      "browser-executor",
      "test-proof",
    ]);
    expect(scene?.after.edges.map((edge) => edge.id)).toEqual([
      "source-daemon",
      "daemon-browser",
      "executor-tests",
    ]);
    const browser = scene?.after.nodes.find((node) => node.id === "browser-executor");
    expect(browser).toBeDefined();
    expect(Object.hasOwn(browser ?? {}, "badge")).toBe(false);
    expect((browser?.estimatedWidth ?? 0) / (browser?.estimatedHeight ?? 1)).toBe(1.5);
    expect(compiled.measurementPolicy).toEqual(
      expect.objectContaining({
        mode: "dom-final-correction",
        nodeAspectRatio: 1.5,
        edgeLabels: "route-after-node-measurement",
        exactPixelsGuaranteed: false,
      }),
    );
  });

  test("emits a machine-readable JSON Schema for agents and editors", () => {
    const schema = interactiveAuthoringJsonSchema() as Record<string, unknown>;
    expect(schema["$schema"]).toContain("2020-12");
    expect(schema["type"]).toBe("object");
    expect(JSON.stringify(schema)).toContain("contractVersion");
    expect(JSON.stringify(schema)).toContain("nodeSizing");
  });

  test("fails closed on unknown patches, missing order members, and guessed coordinates", () => {
    const unknownPatch = mutableFixture();
    unknownPatch.scene.change.before.entities["ghost"] = { changeStatus: "added" };
    expect(() => parseInteractiveAuthoringDocument(unknownPatch.document)).toThrow(
      /unknown-patch-id/,
    );

    const missingOrder = mutableFixture();
    missingOrder.scene.change.after.entityOrder.pop();
    expect(() => parseInteractiveAuthoringDocument(missingOrder.document)).toThrow(
      /order-set-mismatch/,
    );

    const guessedCoordinate = mutableFixture();
    const placement = guessedCoordinate.scene.presentation.placements["commit-source"];
    if (placement === undefined) throw new TypeError("fixture requires commit-source placement");
    placement["x"] = 42;
    expect(() => parseInteractiveAuthoringDocument(guessedCoordinate.document)).toThrow();
  });

  test("requires 3:2 nodes, evidence for facts, and phase-valid edge endpoints", () => {
    const wrongRatio = mutableFixture();
    wrongRatio.scene.constraints.nodeSizing.aspectRatio = 1.4;
    expect(() => parseInteractiveAuthoringDocument(wrongRatio.document)).toThrow();

    const evidenceGap = mutableFixture();
    const source = evidenceGap.scene.semantics.entities["commit-source"];
    if (source === undefined) throw new TypeError("fixture requires commit-source entity");
    source.evidence = [];
    expect(() => parseInteractiveAuthoringDocument(evidenceGap.document)).toThrow(
      /fact-evidence-required/,
    );

    const danglingPhase = mutableFixture();
    danglingPhase.scene.change.before.entities["browser-executor"] = { present: false };
    danglingPhase.scene.change.before.entityOrder = ["commit-source", "test-proof"];
    expect(() => parseInteractiveAuthoringDocument(danglingPhase.document)).toThrow(
      /dangling-phase-edge/,
    );
  });

  test("uses grapheme and explicit-line budgets before rendering", () => {
    const copyOverflow = mutableFixture();
    const source = copyOverflow.scene.semantics.entities["commit-source"];
    if (source === undefined) throw new TypeError("fixture requires commit-source entity");
    source.title = "한".repeat(49);
    expect(() => parseInteractiveAuthoringDocument(copyOverflow.document)).toThrow(/copy-budget/);

    const lineOverflow = mutableFixture();
    lineOverflow.scene.story.question = "one\ntwo\nthree";
    expect(() => parseInteractiveAuthoringDocument(lineOverflow.document)).toThrow(/line-budget/);
  });

  test("rejects analytically impossible zoom and edge-label routing", () => {
    const zoomFailure = mutableFixture();
    zoomFailure.scene.constraints.layout.minimumZoom = 1;
    expect(() => compileInteractiveAuthoringDocument(zoomFailure.document)).toThrow(
      /estimated zoom/,
    );

    const routingFailure = mutableFixture();
    routingFailure.scene.constraints.layout.columnGap = 0;
    routingFailure.scene.presentation.edgeRouting.fallback = ["top-corridor"];
    routingFailure.scene.presentation.edgeRouting.relations = {};
    expect(() => compileInteractiveAuthoringDocument(routingFailure.document)).toThrow(
      /edge-label fallback/,
    );
  });

  test("does not mutate the authored document while compiling", () => {
    const candidate = cloneFixture();
    const before = JSON.stringify(candidate);
    compileInteractiveAuthoringDocument(candidate);
    expect(JSON.stringify(candidate)).toBe(before);
  });
});
