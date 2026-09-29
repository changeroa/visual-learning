import type { ExcalidrawElement, ExcalidrawScene, JsonValue } from "../../src/excalidraw-file";
import { parseSceneMarkdown } from "../../src/excalidraw-file";
import { applyRefreshToScene } from "../../src/refresh-apply";
import { sceneLinkTargets } from "../../src/scene-links";
import { parseVisualNoteSpec, type VisualNoteSpec } from "../../src/schema";

const runs = 200;
const budgetMs = 8;
const fixtureSpecUrl = new URL(
  "../../tests/fixtures/hosted/specs/vl-03-cas-refresh.json",
  import.meta.url,
);
const fixtureSceneUrl = new URL(
  "../../tests/fixtures/hosted/vl-03-cas-refresh.excalidraw.md",
  import.meta.url,
);

type Measurement = {
  readonly elements: number;
  readonly runs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly checksum: number;
};

function remapValue(value: JsonValue, ids: ReadonlyMap<string, string>): JsonValue {
  if (typeof value === "string") {
    const exact = ids.get(value);
    if (exact !== undefined) return exact;
    let remapped = value;
    for (const target of sceneLinkTargets(value)) {
      const replacement = ids.get(target);
      if (replacement !== undefined)
        remapped = remapped.replaceAll(`#^${target}`, `#^${replacement}`);
    }
    return remapped;
  }
  if (Array.isArray(value)) return value.map((item) => remapValue(item, ids));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, remapValue(child, ids)]),
  );
}

function copyElements(elements: readonly ExcalidrawElement[], copy: number): ExcalidrawElement[] {
  const ids = new Map(elements.map((element) => [element.id, `${element.id}-cpu-${copy}`]));
  return elements.map((element) => {
    const cloned = remapValue(structuredClone(element), ids) as ExcalidrawElement;
    return { ...cloned, x: cloned.x + copy * 4_000 };
  });
}

function syntheticScene(scene: ExcalidrawScene): ExcalidrawScene {
  return {
    ...scene,
    elements: [
      ...scene.elements,
      ...copyElements(scene.elements, 1),
      ...copyElements(scene.elements, 2),
    ],
  };
}

function percentile(samples: readonly number[], fraction: number): number {
  const ordered = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * fraction) - 1);
  const value = ordered[index];
  if (value === undefined) throw new Error("missing CPU sample");
  return value;
}

function measure(scene: ExcalidrawScene, spec: VisualNoteSpec): Measurement {
  for (let index = 0; index < 10; index += 1) applyRefreshToScene(scene, spec);
  const samples: number[] = [];
  let checksum = 0;
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const refreshed = applyRefreshToScene(scene, spec);
    samples.push(performance.now() - startedAt);
    checksum += refreshed.scene.elements.length + refreshed.deprecatedAnchors.length;
  }
  return {
    elements: scene.elements.length,
    runs,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    checksum,
  };
}

function reports(
  runtime: "bun" | "workerd",
  scene: ExcalidrawScene,
  spec: VisualNoteSpec,
): {
  readonly fixture: Measurement;
  readonly synthetic: Measurement;
  readonly lines: readonly string[];
} {
  const fixture = measure(scene, spec);
  const synthetic = measure(syntheticScene(scene), spec);
  const lines = [
    `${runtime} fixture elements=${fixture.elements} runs=${fixture.runs} p50=${fixture.p50Ms.toFixed(3)}ms p95=${fixture.p95Ms.toFixed(3)}ms checksum=${fixture.checksum}`,
    `${runtime} synthetic-3x elements=${synthetic.elements} runs=${synthetic.runs} p50=${synthetic.p50Ms.toFixed(3)}ms p95=${synthetic.p95Ms.toFixed(3)}ms checksum=${synthetic.checksum}`,
  ];
  return {
    fixture,
    synthetic,
    lines:
      synthetic.p95Ms > budgetMs
        ? [
            ...lines,
            `CPU-BUDGET-RISK synthetic p95=${synthetic.p95Ms.toFixed(3)}ms > ${budgetMs}ms`,
          ]
        : lines,
  };
}

async function main(): Promise<void> {
  const [specText, sceneText] = await Promise.all([
    Bun.file(fixtureSpecUrl).text(),
    Bun.file(fixtureSceneUrl).text(),
  ]);
  const spec = parseVisualNoteSpec(JSON.parse(specText));
  const scene = parseSceneMarkdown(sceneText).scene;
  const local = reports("bun", scene, spec);
  for (const line of local.lines) console.log(line);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
