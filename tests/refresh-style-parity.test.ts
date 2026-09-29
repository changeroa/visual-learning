import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ExcalidrawElement,
  encodeSceneToMarkdown,
  parseSceneMarkdown,
} from "../src/excalidraw-file";
import { applyRefreshToScene } from "../src/refresh-apply";
import { sceneFromSpec } from "../src/scene-bootstrap";
import { parseVisualNoteSpec } from "../src/schema";

type FixtureNode = {
  readonly semanticId: string;
  readonly status: string;
  readonly visual?: unknown;
};

type FixtureEdge = {
  readonly semanticId: string;
  readonly from: string;
  readonly to: string;
  readonly status: string;
};

type StyleParityFixture = {
  readonly artifactId: string;
  readonly kind: string;
  readonly revision: number;
  readonly title: string;
  readonly presentation: unknown;
  readonly nodes: readonly FixtureNode[];
  readonly edges: readonly FixtureEdge[];
  readonly expectedHistogram: Readonly<Record<string, number>>;
};

const fixturePath = join(import.meta.dir, "fixtures/hosted/style-parity/cases.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as StyleParityFixture[];
if (fixtures.length !== 6) throw new TypeError("expected six Victor Dev Atlas style fixtures");
const styleFields = ["strokeColor", "backgroundColor", "fillStyle", "fontFamily"] as const;

function agentElements(elements: readonly ExcalidrawElement[]): readonly ExcalidrawElement[] {
  return elements.filter((element) => element.customData?.["owner"] === "agent");
}

function colorHistogram(elements: readonly ExcalidrawElement[]): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const element of elements) {
    const key = `${String(element["strokeColor"])}|${String(element["backgroundColor"])}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function specFromFixture(fixture: StyleParityFixture) {
  return parseVisualNoteSpec({
    schemaVersion: 1,
    artifactId: fixture.artifactId,
    kind: fixture.kind,
    revision: fixture.revision,
    title: fixture.title,
    source: { root: "/fixture", commit: null },
    presentation: fixture.presentation,
    nodes: fixture.nodes.map((node) => ({
      semanticId: node.semanticId,
      label: node.semanticId,
      status: node.status,
      evidence: node.status === "fact" ? [{ path: "fixture.ts" }] : [],
      ...(node.visual === undefined ? {} : { visual: node.visual }),
    })),
    edges: fixture.edges.map((edge) => ({
      semanticId: edge.semanticId,
      from: edge.from,
      to: edge.to,
      label: edge.semanticId,
      status: edge.status,
      evidence: edge.status === "fact" ? [{ path: "fixture.ts" }] : [],
    })),
  });
}

describe("refresh style parity with Victor Dev Atlas export scenes", () => {
  for (const fixture of fixtures) {
    test(`${fixture.artifactId} keeps every planned style field`, () => {
      const spec = specFromFixture(fixture);
      const exported = sceneFromSpec(spec, "visual-learning/session-export");
      const before = parseSceneMarkdown(encodeSceneToMarkdown(exported)).scene;
      const beforeAgents = agentElements(before.elements);
      const beforeById = new Map(
        beforeAgents.map((element) => [element.id, structuredClone(element)]),
      );
      const after = applyRefreshToScene(before, spec).scene;
      const afterAgents = agentElements(after.elements);

      expect(colorHistogram(beforeAgents)).toEqual(fixture.expectedHistogram);
      expect(afterAgents).toHaveLength(beforeAgents.length);
      expect(afterAgents.map((element) => element.id).sort()).toEqual(
        beforeAgents.map((element) => element.id).sort(),
      );
      for (const element of afterAgents) {
        const previous = beforeById.get(element.id);
        expect(previous).toBeDefined();
        if (previous === undefined) throw new TypeError(`missing fixture element ${element.id}`);
        for (const field of styleFields) expect(element[field]).toBe(previous[field]);
      }
      expect(colorHistogram(afterAgents)).toEqual(fixture.expectedHistogram);
    });
  }
});
