import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { validateBundleLayout } from "../src/layout-check";
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
});
