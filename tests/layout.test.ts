import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateBundleLayout } from "../src/layout-check";
import { planScene } from "../src/renderer-plan";
import { parseVisualNoteSpec } from "../src/schema";
import { generateTemplateFixture } from "../src/template-fixture";

const root = join(import.meta.dir, "fixtures/kinds");

describe("Todo 8 layout and dense splitting", () => {
  test("validates gallery layouts without overlaps, clipping, or orphans", () => {
    const generated = generateTemplateFixture(join(root, "gallery/bundle.json"));
    const receipts = validateBundleLayout(generated.views);

    expect(receipts).toHaveLength(generated.views.length);
    expect(receipts.every((receipt) => receipt.overlapFree && receipt.clippedTextFree)).toBe(true);
  });

  test("splits dense input deterministically into linked views without information loss", () => {
    const first = generateTemplateFixture(join(root, "dense/bundle.json"));
    const second = generateTemplateFixture(join(root, "dense/bundle.json"));
    const receipts = validateBundleLayout(first.views);

    expect(first).toEqual(second);
    expect(first.views).toHaveLength(3);
    expect(first.coverage.nodeIds).toHaveLength(10);
    expect(first.coverage.edgeIds).toHaveLength(9);
    expect(first.views.every((view) => view.spec.nodes.length <= 6)).toBe(true);
    expect(first.views.some((view) => view.relatedViewIds.length > 0)).toBe(true);
    expect(receipts.every((receipt) => receipt.withinViewLimit && receipt.orphanFree)).toBe(true);
  });

  test("components layout honors presentation.columns to keep a figure narrow", () => {
    // Given
    const input = JSON.parse(
      readFileSync(join(import.meta.dir, "fixtures/learning/checkout-journey.json"), "utf8"),
    ) as { presentation: Record<string, unknown> };
    const wide = parseVisualNoteSpec(input);
    const narrow = parseVisualNoteSpec({
      ...input,
      presentation: { ...input.presentation, columns: 2 },
    });
    // When
    const width = (spec: typeof wide): number =>
      Math.max(...planScene(spec).elements.map((element) => element.x + element.width));
    const shapes = planScene(narrow).elements.filter((element) => element.role === "node-shape");
    // Then
    expect(width(narrow)).toBeLessThan(width(wide));
    for (const [index, a] of shapes.entries())
      for (const b of shapes.slice(index + 1))
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBe(true);
  });
});
