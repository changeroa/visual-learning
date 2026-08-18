import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { InputError } from "../src/errors";
import { generateTemplateFixture, loadTemplateFixture } from "../src/template-fixture";
import { generateTemplateBundle } from "../src/template-generate";
import { parseTemplateBundle } from "../src/template-schema";

const root = join(import.meta.dir, "fixtures/kinds");

describe("Todo 8 template generation", () => {
  test("renders every required artifact kind from the gallery fixture", () => {
    const generated = generateTemplateFixture(join(root, "gallery/bundle.json"));

    expect(new Set(generated.views.map((view) => view.kind))).toEqual(
      new Set([
        "project-map",
        "system-architecture",
        "container-architecture",
        "component-architecture",
        "adr",
        "api-contract",
        "workflow",
        "data-flow",
        "trust-boundary",
        "code-exploration",
      ]),
    );
    expect(generated.coverage.complete).toBe(true);
    expect(generated.views).toHaveLength(10);
  });

  test("preserves exact English identifiers inside Korean explanations and exposes machine styles", () => {
    const generated = generateTemplateFixture(join(root, "gallery/bundle.json"));
    const workflow = generated.views.find(
      (view) => view.artifactId === "checkout-sequence-atlas-shop",
    );
    if (workflow === undefined) throw new TypeError("workflow fixture is missing");

    expect(workflow.spec.nodes.some((node) => node.label.includes("OrdersRouter\n요청 수신"))).toBe(
      true,
    );
    expect(workflow.styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ className: "fact-high", semanticId: "seq-router" }),
        expect.objectContaining({ className: "question-unknown", semanticId: "seq-browser" }),
      ]),
    );
  });

  test("resolves factual evidence against fixture paths, symbols, and contract lines", () => {
    const fixture = loadTemplateFixture(join(root, "gallery/bundle.json"));
    const generated = generateTemplateFixture(join(root, "gallery/bundle.json"));

    expect(fixture.repositoryRoot.endsWith("tests/fixtures/kinds/gallery/repo")).toBe(true);
    for (const view of generated.views) {
      for (const claim of [...view.spec.nodes, ...view.spec.edges]) {
        if (claim.status === "fact") {
          expect(claim.evidence.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("rejects missing evidence paths, absent symbols, and malformed contract lines", () => {
    const missing = (): unknown =>
      generateTemplateFixture(join(root, "invalid-missing-evidence/bundle.json"));
    const absentSymbol = (): unknown =>
      generateTemplateFixture(join(root, "invalid-absent-symbol/bundle.json"));
    const malformed = (): unknown =>
      generateTemplateFixture(join(root, "invalid-malformed/bundle.json"));

    expect(missing).toThrow(InputError);
    expect(absentSymbol).toThrow(InputError);
    expect(malformed).toThrow(InputError);
  });

  test("preserves presentation frames and node visual metadata", () => {
    const bundle = parseTemplateBundle({
      schemaVersion: 1,
      bundleId: "design-system",
      project: "atlas-shop",
      repositoryRoot: "repo",
      artifacts: [
        {
          artifactId: "system-overview",
          kind: "system-architecture",
          titleKo: "시스템 개요",
          titleEn: "System overview",
          maxViewNodes: 6,
          presentation: {
            layout: "frames",
            frames: [{ id: "cloudflare", label: "Cloudflare", category: "cloudflare", order: 0 }],
          },
          nodes: [
            {
              semanticId: "api-worker",
              identifier: "ApiWorker",
              explanationKo: "요청 처리",
              status: "inference",
              confidence: "medium",
              evidence: [],
              visual: {
                category: "cloudflare",
                frameId: "cloudflare",
                shape: "rectangle",
                emphasis: "primary",
                order: 0,
              },
            },
          ],
          edges: [],
        },
      ],
    });

    const generated = generateTemplateBundle(bundle, join(root, "gallery/repo"));
    expect(generated.views[0]?.spec.presentation?.layout).toBe("frames");
    expect(generated.views[0]?.spec.nodes[0]?.visual).toEqual(
      expect.objectContaining({ category: "cloudflare", frameId: "cloudflare" }),
    );
  });
});
