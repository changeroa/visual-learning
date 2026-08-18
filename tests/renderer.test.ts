import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ElementRole, planScene, stableElementId } from "../src/renderer-plan";
import { parseVisualNoteSpec } from "../src/schema";

const fixture = parseVisualNoteSpec(
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures/gallery.json"), "utf8")),
);

function geometry(plan: ReturnType<typeof planScene>): readonly unknown[] {
  return plan.elements.map(({ id, type, x, y, width, height, points }) => ({
    id,
    type,
    x,
    y,
    width,
    height,
    points,
  }));
}

describe("deterministic renderer plan", () => {
  test("derives stable Excalidraw IDs from the complete semantic tuple", () => {
    // Given
    const tuple = ["renderer-gallery", "browser", "node-shape"] as const;
    // When
    const first = stableElementId(...tuple);
    const second = stableElementId(...tuple);
    // Then
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(stableElementId(tuple[0], tuple[1], "node-label")).not.toBe(first);
  });

  test("produces the same semantic set and geometry twice", () => {
    // Given
    const expectedCount = 1 + fixture.nodes.length * 2 + fixture.edges.length * 2;
    // When
    const first = planScene(fixture);
    const second = planScene(structuredClone(fixture));
    // Then
    expect(first.elements).toHaveLength(expectedCount);
    expect(first).toEqual(second);
    expect(geometry(first)).toEqual(geometry(second));
  });

  test("preserves IDs and geometry across a metadata-only revision", () => {
    // Given
    const revision = parseVisualNoteSpec({ ...structuredClone(fixture), revision: 2 });
    // When
    const first = planScene(fixture);
    const second = planScene(revision);
    // Then
    expect(geometry(second)).toEqual(geometry(first));
    expect(second.elements.every((element) => element.customData.revision === 2)).toBe(true);
  });

  test("rejects an element ID collision before returning a plan", () => {
    // Given
    const colliding = (): string => "collision";
    // When
    const build = (): unknown => planScene(fixture, colliding);
    // Then
    expect(build).toThrow(/collision/i);
  });

  test("adds complete ownership metadata through every planned role", () => {
    // Given
    const expectedRoles = new Set<ElementRole>([
      "title",
      "node-shape",
      "node-label",
      "edge-line",
      "edge-label",
    ]);
    // When
    const plan = planScene(fixture);
    // Then
    expect(new Set(plan.elements.map((element) => element.role))).toEqual(expectedRoles);
    for (const element of plan.elements) {
      expect(element.customData).toEqual(
        expect.objectContaining({
          schemaVersion: 1,
          owner: "agent",
          artifactId: fixture.artifactId,
          semanticId: element.semanticId,
          elementRole: element.role,
          revision: fixture.revision,
        }),
      );
    }
  });

  test("ships the exact EA create filename and immutable workbench API calls", () => {
    // Given
    const script = readFileSync(join(import.meta.dir, "../assets/visual-note-renderer.md"), "utf8");
    // When
    const createFilename = "filename: `" + "$" + "{request.plan.artifactId}.excalidraw.md`";
    // Then
    expect(script).toContain(createFilename);
    expect(script).toContain("ea.copyViewElementsToEAforEditing");
    expect(script).toContain("ea.addAppendUpdateCustomData");
    expect(script).toContain("ea.addElementsToView");
    expect(script).toContain("ea.createSVG");
    expect(script).toContain("element.groupIds = groupIdFor(planned)");
  });

  test("plans every arrow in Excalidraw canonical first-endpoint coordinates", () => {
    const arrows = planScene(fixture).elements.filter((element) => element.type === "arrow");

    for (const arrow of arrows) expect(arrow.points[0]).toEqual([0, 0]);
  });

  test("keeps connector midpoints out of unrelated nodes", () => {
    const plan = planScene(fixture);
    const shapes = plan.elements.filter((element) => element.role === "node-shape");
    const arrows = plan.elements.filter((element) => element.role === "edge-line");

    for (const arrow of arrows) {
      const edge = fixture.edges.find((candidate) => candidate.semanticId === arrow.semanticId);
      if (edge === undefined) throw new TypeError("edge fixture is incomplete");
      const end = arrow.points[1];
      if (end === undefined) throw new TypeError("arrow fixture is incomplete");
      const midpoint = [arrow.x + end[0] / 2, arrow.y + end[1] / 2] as const;
      const overlaps = shapes.filter(
        (shape) =>
          shape.semanticId !== edge.from &&
          shape.semanticId !== edge.to &&
          midpoint[0] > shape.x &&
          midpoint[0] < shape.x + shape.width &&
          midpoint[1] > shape.y &&
          midpoint[1] < shape.y + shape.height,
      );
      expect(overlaps).toEqual([]);
    }
  });

  test("opens and verifies the rendered drawing before live scene inspection", () => {
    const adapter = readFileSync(join(import.meta.dir, "../src/renderer-live.ts"), "utf8");

    expect(adapter).toContain("await leaf.openFile(renderedFile)");
    expect(adapter).toContain("VISUAL_NOTE_POST_RENDER_VIEW_MISMATCH");
  });

  test("uses a stable non-overlapping node grid with text inside each node", () => {
    // Given
    const plan = planScene(fixture);
    // When
    const shapes = plan.elements.filter((element) => element.role === "node-shape");
    const labels = plan.elements.filter((element) => element.role === "node-label");
    // Then
    for (let left = 0; left < shapes.length; left += 1) {
      const shape = shapes[left];
      if (shape === undefined) throw new TypeError("shape fixture is incomplete");
      const label = labels.find((candidate) => candidate.semanticId === shape.semanticId);
      expect(label).toBeDefined();
      if (label === undefined) throw new TypeError("label fixture is incomplete");
      expect(label.x).toBeGreaterThanOrEqual(shape.x);
      expect(label.y).toBeGreaterThanOrEqual(shape.y);
      expect(label.x + label.width).toBeLessThanOrEqual(shape.x + shape.width);
      expect(label.y + label.height).toBeLessThanOrEqual(shape.y + shape.height);
      for (let right = left + 1; right < shapes.length; right += 1) {
        const candidate = shapes[right];
        if (candidate === undefined) throw new TypeError("shape fixture is incomplete");
        const separated =
          shape.x + shape.width <= candidate.x ||
          candidate.x + candidate.width <= shape.x ||
          shape.y + shape.height <= candidate.y ||
          candidate.y + candidate.height <= shape.y;
        expect(separated).toBe(true);
      }
    }
  });

  test("plans framed architecture views with semantic categories and shapes", () => {
    const input = structuredClone(fixture);
    input.presentation = {
      layout: "frames",
      direction: "left-to-right",
      frames: [
        { id: "external", label: "External", category: "external", order: 0 },
        { id: "cloudflare", label: "Cloudflare", category: "cloudflare", order: 1 },
      ],
    };
    input.nodes = input.nodes.map((node, index) => ({
      ...node,
      visual: {
        category: index < 2 ? "external" : "cloudflare",
        frameId: index < 2 ? "external" : "cloudflare",
        shape: index === 0 ? "ellipse" : "rectangle",
        order: index,
      } as const,
    }));
    const plan = planScene(parseVisualNoteSpec(input));
    expect(plan.elements.filter((element) => element.role === "frame-shape")).toHaveLength(2);
    expect(
      plan.elements.find(
        (element) => element.semanticId === "browser" && element.role === "node-shape",
      )?.type,
    ).toBe("ellipse");
    expect(
      plan.elements.find(
        (element) => element.semanticId === "gateway" && element.role === "node-shape",
      )?.customData.category,
    ).toBe("external");
  });

  test("places exception timeline nodes on a separate lane", () => {
    const input = structuredClone(fixture);
    input.presentation = { layout: "timeline", direction: "left-to-right", frames: [] };
    input.nodes = input.nodes.map((node, index) => ({
      ...node,
      visual: {
        order: index,
        lane: index === input.nodes.length - 1 ? "exception" : "main",
      } as const,
    }));
    const plan = planScene(parseVisualNoteSpec(input));
    const main = plan.elements.find(
      (element) => element.semanticId === "browser" && element.role === "node-shape",
    );
    const exception = plan.elements.find(
      (element) => element.semanticId === "worker" && element.role === "node-shape",
    );
    expect(exception?.y).toBeGreaterThan(main?.y ?? 0);
    expect(exception?.x).toBe(80 + (input.nodes.length - 1) * 380);
  });

  test("centers every primary data store in the hub column", () => {
    const input = structuredClone(fixture);
    input.presentation = { layout: "hub", direction: "left-to-right", frames: [] };
    input.nodes = input.nodes.map((node, index) => ({
      ...node,
      visual: {
        order: index,
        category: "data",
        emphasis: index < 3 ? "primary" : "secondary",
        lane: index < 3 ? "main" : "downstream",
      } as const,
    }));
    const shapes = planScene(parseVisualNoteSpec(input)).elements.filter(
      (element) => element.role === "node-shape",
    );
    expect(shapes.slice(0, 3).map((element) => element.x)).toEqual([560, 560, 560]);
    expect(new Set(shapes.slice(0, 3).map((element) => element.y)).size).toBe(3);
  });

  test("lays component modules out horizontally inside their runtime frame", () => {
    const input = structuredClone(fixture);
    input.presentation = {
      layout: "components",
      direction: "left-to-right",
      frames: [{ id: "worker", label: "Worker", category: "cloudflare", order: 0 }],
    };
    input.nodes = input.nodes.slice(0, 3).map((node, index) => ({
      ...node,
      visual: { frameId: "worker", category: "runtime", order: index } as const,
    }));
    input.edges = input.edges.filter(
      (edge) =>
        input.nodes.some((node) => node.semanticId === edge.from) &&
        input.nodes.some((node) => node.semanticId === edge.to),
    );
    const shapes = planScene(parseVisualNoteSpec(input)).elements.filter(
      (element) => element.role === "node-shape",
    );
    expect(new Set(shapes.map((element) => element.y)).size).toBe(1);
    expect(new Set(shapes.map((element) => element.x)).size).toBe(3);
  });
});
