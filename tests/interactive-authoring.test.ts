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

type MutableDetailDimension = {
  source: string;
  identifiers: string[];
  projections: { beginner: string; intermediate: string; expert: string };
};

type MutableDetails = {
  role: MutableDetailDimension;
  before: MutableDetailDimension;
  after: MutableDetailDimension;
  reason: MutableDetailDimension;
  impact: MutableDetailDimension;
  evidenceIds: string[];
  [key: string]: unknown;
};

type MutableScene = {
  story: { question: string };
  semantics: {
    entities: Record<
      string,
      {
        title: string;
        badge?: string | null;
        details: MutableDetails;
        evidence: { id: string; path?: string }[];
      }
    >;
  };
  change: { before: MutablePhase; after: MutablePhase };
  presentation: {
    placements: Record<string, Record<string, unknown>>;
    edgeRouting: { fallback: string[]; relations: Record<string, unknown> };
  };
  constraints: {
    nodeSizing: { aspectRatio: number };
    layout: { minimumZoom: number; columnGap: number };
    copy: { badgeMaxGraphemes: number };
    typography: { nodeBodyMinPx: number; minimumEffectiveTextPx: number };
  };
};

type MutableDocument = {
  interaction: {
    detailLevel: { options: string[] };
    fontScale: { minimumPercent: number; maximumPercent: number; stepPercent: number };
  };
  scenes: MutableScene[];
};

function mutableFixture(): { document: MutableDocument; scene: MutableScene } {
  const document = structuredClone(rawFixture) as unknown as MutableDocument;
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
    expect(browser?.details).toEqual(
      expect.objectContaining({
        role: expect.objectContaining({
          source: expect.any(String),
          identifiers: ["public executor"],
          projections: expect.objectContaining({
            beginner: expect.stringContaining("public executor"),
            intermediate: expect.stringContaining("public executor"),
            expert: expect.stringContaining("public executor"),
          }),
        }),
        evidenceIds: ["browser-generation-api"],
      }),
    );
    expect((browser?.estimatedWidth ?? 0) / (browser?.estimatedHeight ?? 1)).toBe(1.5);
    expect(compiled.measurementPolicy).toEqual(
      expect.objectContaining({
        mode: "dom-final-correction",
        nodeAspectRatio: 1.5,
        edgeLabels: "route-after-node-measurement",
        typography: "enforce-authored-and-effective-text-floors",
        exactPixelsGuaranteed: false,
      }),
    );
    expect(compiled.interaction).toEqual(
      expect.objectContaining({
        detailLevel: expect.objectContaining({ default: "intermediate" }),
        fontScale: expect.objectContaining({
          minimumPercent: 100,
          maximumPercent: 150,
          defaultPercent: 100,
          stepPercent: 5,
        }),
      }),
    );
    expect(compiled.interactionPolicy).toEqual(
      expect.objectContaining({
        detailLevels: ["beginner", "intermediate", "expert"],
        canonicalSourceAvailable: true,
        preserveAcrossControls: expect.arrayContaining([
          "topology",
          "phase-state",
          "canonical-source",
          "identifiers",
          "evidence-ids",
        ]),
      }),
    );
    expect(scene?.before.feasibility.effectiveTypography).toEqual(
      expect.objectContaining({
        nodeBodyPx: expect.any(Number),
        uiMetadataPx: 20,
        detailTextPx: 20,
        minimumRequiredPx: 14,
      }),
    );

    const beforeBrowser = scene?.before.nodes.find((node) => node.id === "browser-executor");
    expect(beforeBrowser?.details).not.toBe(browser?.details);
    expect(beforeBrowser?.details.role.projections).not.toBe(browser?.details.role.projections);
    expect(beforeBrowser?.details.evidenceIds).not.toBe(browser?.details.evidenceIds);
  });

  test("emits a machine-readable JSON Schema for agents and editors", () => {
    const schema = interactiveAuthoringJsonSchema() as Record<string, unknown>;
    expect(schema["$schema"]).toContain("2020-12");
    expect(schema["type"]).toBe("object");
    expect(JSON.stringify(schema)).toContain("contractVersion");
    expect(JSON.stringify(schema)).toContain("nodeSizing");
    expect(JSON.stringify(schema)).toContain("minimumEffectiveTextPx");
    expect(JSON.stringify(schema)).toContain("evidenceIds");
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

  test("requires strict MECE entity details whose evidence IDs resolve locally", () => {
    const extraDetailField = mutableFixture();
    const source = extraDetailField.scene.semantics.entities["commit-source"];
    if (source === undefined) throw new TypeError("fixture requires commit-source entity");
    source.details["summary"] = "overlapping detail";
    expect(() => parseInteractiveAuthoringDocument(extraDetailField.document)).toThrow();

    const emptyEvidence = mutableFixture();
    const emptySource = emptyEvidence.scene.semantics.entities["commit-source"];
    if (emptySource === undefined) throw new TypeError("fixture requires commit-source entity");
    emptySource.details.evidenceIds = [];
    expect(() => parseInteractiveAuthoringDocument(emptyEvidence.document)).toThrow();

    const unresolvedEvidence = mutableFixture();
    const unresolvedSource = unresolvedEvidence.scene.semantics.entities["commit-source"];
    if (unresolvedSource === undefined)
      throw new TypeError("fixture requires commit-source entity");
    unresolvedSource.details.evidenceIds = ["missing-evidence"];
    expect(() => parseInteractiveAuthoringDocument(unresolvedEvidence.document)).toThrow(
      /unresolved-detail-evidence-id/,
    );

    const duplicateDetailEvidence = mutableFixture();
    const detailEvidenceSource = duplicateDetailEvidence.scene.semantics.entities["commit-source"];
    if (detailEvidenceSource === undefined)
      throw new TypeError("fixture requires commit-source entity");
    detailEvidenceSource.details.evidenceIds = ["commit-router", "commit-router"];
    expect(() => parseInteractiveAuthoringDocument(duplicateDetailEvidence.document)).toThrow(
      /duplicate-detail-evidence-id/,
    );

    const duplicateEvidence = mutableFixture();
    const duplicateSource = duplicateEvidence.scene.semantics.entities["commit-source"];
    if (duplicateSource === undefined) throw new TypeError("fixture requires commit-source entity");
    duplicateSource.evidence.push({
      id: "commit-router",
      path: "worker/src/duplicate-router.ts",
    });
    expect(() => parseInteractiveAuthoringDocument(duplicateEvidence.document)).toThrow(
      /duplicate-evidence-id/,
    );

    const phaseEvidenceDrift = mutableFixture();
    phaseEvidenceDrift.scene.change.after.entities["commit-source"] = {
      evidence: [{ id: "replacement-router", path: "worker/src/replacement-router.ts" }],
    };
    expect(() => parseInteractiveAuthoringDocument(phaseEvidenceDrift.document)).toThrow(
      /unresolved-detail-evidence-id/,
    );
  });

  test("preserves canonical identifiers across all three explanation projections", () => {
    const missingIdentifier = mutableFixture();
    const source = missingIdentifier.scene.semantics.entities["commit-source"];
    if (source === undefined) throw new TypeError("fixture requires commit-source entity");
    source.details.role.projections.beginner = "쉬운 설명이지만 식별자를 잃었다.";
    expect(() => parseInteractiveAuthoringDocument(missingIdentifier.document)).toThrow(
      /detail-identifier-not-preserved/,
    );

    const missingFromSource = mutableFixture();
    const missingSource = missingFromSource.scene.semantics.entities["commit-source"];
    if (missingSource === undefined) throw new TypeError("fixture requires commit-source entity");
    missingSource.details.role.source = "비교 revision의 기준이다.";
    expect(() => parseInteractiveAuthoringDocument(missingFromSource.document)).toThrow(
      /detail-identifier-not-in-source/,
    );

    const duplicateIdentifiers = mutableFixture();
    const duplicateSource = duplicateIdentifiers.scene.semantics.entities["commit-source"];
    if (duplicateSource === undefined) throw new TypeError("fixture requires commit-source entity");
    duplicateSource.details.role.identifiers.push("source commit");
    expect(() => parseInteractiveAuthoringDocument(duplicateIdentifiers.document)).toThrow(
      /duplicate-detail-identifier/,
    );

    const noIdentifiers = mutableFixture();
    const identifierFreeSource = noIdentifiers.scene.semantics.entities["commit-source"];
    if (identifierFreeSource === undefined)
      throw new TypeError("fixture requires commit-source entity");
    identifierFreeSource.details.role.identifiers = [];
    expect(compileInteractiveAuthoringDocument(noIdentifiers.document).warnings).toContain(
      "generation-authority-change/commit-source/details/role: empty identifiers is an author assertion that no exact identifier applies",
    );

    const verboseExpert = mutableFixture();
    const verboseSource = verboseExpert.scene.semantics.entities["commit-source"];
    if (verboseSource === undefined) throw new TypeError("fixture requires commit-source entity");
    verboseSource.details.role.projections.expert = `source commit ${"기술적인 설명 ".repeat(12)}`;
    expect(() => parseInteractiveAuthoringDocument(verboseExpert.document)).toThrow(
      /detail-projection-order/,
    );
  });

  test("rejects extension fields and interaction controls that weaken the renderer contract", () => {
    const dimensionExtension = mutableFixture();
    const source = dimensionExtension.scene.semantics.entities["commit-source"];
    if (source === undefined) throw new TypeError("fixture requires commit-source entity");
    (source.details.role as unknown as Record<string, unknown>)["summary"] = "overlap";
    expect(() => parseInteractiveAuthoringDocument(dimensionExtension.document)).toThrow();

    const projectionExtension = mutableFixture();
    const projectionSource = projectionExtension.scene.semantics.entities["commit-source"];
    if (projectionSource === undefined)
      throw new TypeError("fixture requires commit-source entity");
    (projectionSource.details.role.projections as unknown as Record<string, unknown>)["simple"] =
      "uncontracted projection";
    expect(() => parseInteractiveAuthoringDocument(projectionExtension.document)).toThrow();

    const reorderedLevels = mutableFixture();
    reorderedLevels.document.interaction.detailLevel.options = [
      "expert",
      "intermediate",
      "beginner",
    ];
    expect(() => parseInteractiveAuthoringDocument(reorderedLevels.document)).toThrow();

    for (const [field, value] of [
      ["minimumPercent", 95],
      ["maximumPercent", 160],
      ["stepPercent", 10],
    ] as const) {
      const weakenedScale = mutableFixture();
      weakenedScale.document.interaction.fontScale[field] = value;
      expect(() => parseInteractiveAuthoringDocument(weakenedScale.document)).toThrow();
    }
  });

  test("rejects unreadable nominal and effective typography floors", () => {
    const nominalTooSmall = mutableFixture();
    nominalTooSmall.scene.constraints.typography.nodeBodyMinPx = 19;
    expect(() => parseInteractiveAuthoringDocument(nominalTooSmall.document)).toThrow();

    const tooSmallAfterZoom = mutableFixture();
    tooSmallAfterZoom.scene.constraints.layout.minimumZoom = 0.69;
    expect(() => parseInteractiveAuthoringDocument(tooSmallAfterZoom.document)).toThrow(
      /effective-text-floor/,
    );

    const ineffectiveFloor = mutableFixture();
    ineffectiveFloor.scene.constraints.typography.minimumEffectiveTextPx = 13;
    expect(() => parseInteractiveAuthoringDocument(ineffectiveFloor.document)).toThrow();
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

    const detailOverflow = mutableFixture();
    const detailSource = detailOverflow.scene.semantics.entities["commit-source"];
    if (detailSource === undefined) throw new TypeError("fixture requires commit-source entity");
    detailSource.details.role.source = `source commit ${"한".repeat(140)}`;
    expect(() => parseInteractiveAuthoringDocument(detailOverflow.document)).toThrow(/copy-budget/);

    const badgeOverflow = mutableFixture();
    const badgeSource = badgeOverflow.scene.semantics.entities["commit-source"];
    if (badgeSource === undefined) throw new TypeError("fixture requires commit-source entity");
    badgeSource.badge = "B".repeat(17);
    expect(() => parseInteractiveAuthoringDocument(badgeOverflow.document)).toThrow(/copy-budget/);

    const scaledBadge = mutableFixture();
    const scaledBadgeSource = scaledBadge.scene.semantics.entities["commit-source"];
    if (scaledBadgeSource === undefined)
      throw new TypeError("fixture requires commit-source entity");
    scaledBadge.scene.constraints.copy.badgeMaxGraphemes = 100;
    scaledBadgeSource.badge = "B".repeat(30);
    const scaledBadgeNode = compileInteractiveAuthoringDocument(scaledBadge.document).scenes[0]
      ?.before.nodes[0];
    expect(scaledBadgeNode?.estimatedWidth).toBe(330);
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

    const sameColumnLabel = mutableFixture();
    const testPlacement = sameColumnLabel.scene.presentation.placements["test-proof"];
    if (testPlacement === undefined) throw new TypeError("fixture requires test-proof placement");
    testPlacement["column"] = 2;
    sameColumnLabel.scene.change.after.relations["executor-tests"] = {
      label: "한".repeat(36),
    };
    const sameColumnCompiled = compileInteractiveAuthoringDocument(sameColumnLabel.document);
    const sameColumnCorridor = sameColumnCompiled.scenes[0]?.after.feasibility.corridors.find(
      (corridor) => corridor.relationId === "executor-tests",
    );
    expect(sameColumnCorridor).toEqual(
      expect.objectContaining({ directFits: false, resolvedBy: "detached-callout" }),
    );
  });

  test("does not mutate the authored document while compiling", () => {
    const candidate = cloneFixture();
    const before = JSON.stringify(candidate);
    compileInteractiveAuthoringDocument(candidate);
    expect(JSON.stringify(candidate)).toBe(before);
  });
});
