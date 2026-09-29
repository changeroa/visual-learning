import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  commitNote,
  commitScene,
  type D1Like,
  type D1Result,
  type D1Statement,
  readFigure,
} from "../hosted/worker/atlas-store";
import { publishFigure } from "../hosted/worker/publish-merge";
import { InputError } from "../src/errors";
import {
  type ExcalidrawElement,
  type ExcalidrawScene,
  parseSceneMarkdown,
} from "../src/excalidraw-file";
import { parseHostedVisualNoteSpec, type VisualNoteSpec } from "../src/schema";
import { SQLiteD1 } from "./support/d1-sqlite";

const fixtureSpec = JSON.parse(
  readFileSync(new URL("./fixtures/hosted/specs/vl-03-cas-refresh.json", import.meta.url), "utf8"),
) as { source: { root: string } };
// The Worker receives the CLI's path-scrubbed payload: source.root is the repo name.
const spec = parseHostedVisualNoteSpec({
  ...fixtureSpec,
  source: { ...fixtureSpec.source, root: "visual-learning" },
});
const fixtureScene = parseSceneMarkdown(
  readFileSync(
    new URL("./fixtures/hosted/vl-03-cas-refresh.excalidraw.md", import.meta.url),
    "utf8",
  ),
).scene;
const project = "visual-learning";
let db: SQLiteD1;

function humanElement(id: string, overrides: Partial<ExcalidrawElement> = {}): ExcalidrawElement {
  return {
    id,
    type: "rectangle",
    x: 11,
    y: 22,
    width: 123,
    height: 45,
    strokeColor: "#123456",
    customData: { owner: "human", note: "keep every byte" },
    ...overrides,
  };
}

function revisionTwo(): VisualNoteSpec {
  return parseHostedVisualNoteSpec({ ...spec, revision: 2, title: `${spec.title} v2` });
}

async function counter(): Promise<number | null> {
  return db
    .prepare("SELECT counter FROM figures WHERE project_id=? AND artifact_id=?")
    .bind(project, spec.artifactId)
    .first<number>("counter");
}

async function publish(
  nextSpec: unknown,
  scene: ExcalidrawScene = fixtureScene,
  store: D1Like = db,
) {
  return publishFigure(store, { project, spec: nextSpec, scene, verify: [] });
}

beforeEach(async () => {
  db = new SQLiteD1();
  await db
    .prepare("INSERT INTO projects VALUES (?, ?, ?, ?)")
    .bind(project, "visual-learning", "abc1234", "2026-09-29")
    .run();
});

afterEach(() => db.close());

describe("hosted publish merge", () => {
  test("first publish stores the provided scene verbatim, including human elements", async () => {
    const scene = {
      ...fixtureScene,
      elements: [...fixtureScene.elements, humanElement("human-already-present")],
    };
    const before = JSON.stringify(scene);

    expect(await publish(spec, scene)).toEqual({
      artifactId: spec.artifactId,
      outcome: "created",
      token: "cas-1",
      deprecatedAnchors: [],
      orphanedNotes: [],
    });

    const stored = await readFigure(db, project, spec.artifactId);
    expect(JSON.stringify(stored?.scene)).toBe(before);
    expect(await counter()).toBe(1);
  });

  test("refresh keeps every human element byte-identical", async () => {
    const humanElements = [
      humanElement("human-box"),
      humanElement("human-arrow", {
        type: "arrow",
        points: [
          [0, 0],
          [30, 40],
        ],
        endBinding: null,
      }),
    ];
    const firstScene = { ...fixtureScene, elements: [...fixtureScene.elements, ...humanElements] };
    await publish(spec, firstScene);

    const result = await publish(revisionTwo());
    const stored = await readFigure(db, project, spec.artifactId);
    const humanAfter = stored?.scene.elements.filter((element) =>
      humanElements.some((human) => human.id === element.id),
    );

    expect(result).toMatchObject({ outcome: "refreshed", token: "cas-2" });
    expect(humanAfter?.map((element) => JSON.stringify(element))).toEqual(
      humanElements.map((element) => JSON.stringify(element)),
    );
    expect(stored?.token).toBe(result.token);
    console.log(
      JSON.stringify({
        probe: "human-byte-preservation",
        outcome: result.outcome,
        token: result.token,
        preserved: humanAfter?.map((element) => element.id),
      }),
    );
  });

  test("removed human-referenced agent node becomes an anchor and its note is orphaned intact", async () => {
    const removedSemanticId = "refresh-ownership";
    const target = fixtureScene.elements.find(
      (element) =>
        element.type === "rectangle" &&
        element.customData?.["semanticId"] === removedSemanticId &&
        element.customData?.["owner"] === "agent",
    );
    if (target === undefined) throw new Error("fixture lacks the refresh-ownership shape");
    const humanReference = humanElement("human-reference", {
      type: "text",
      text: "my note",
      containerId: target.id,
    });
    await publish(spec, {
      ...fixtureScene,
      elements: [...fixtureScene.elements, humanReference],
    });
    expect(
      await commitNote(db, {
        project,
        artifact: spec.artifactId,
        nodeKey: removedSemanticId,
        body: "body must survive publish",
        expectedToken: null,
      }),
    ).toMatchObject({ outcome: "committed" });
    const nextSpec = parseHostedVisualNoteSpec({
      ...spec,
      revision: 2,
      nodes: spec.nodes.filter((node) => node.semanticId !== removedSemanticId),
      edges: spec.edges.filter(
        (edge) => edge.from !== removedSemanticId && edge.to !== removedSemanticId,
      ),
      learning:
        spec.learning === undefined
          ? undefined
          : {
              ...spec.learning,
              route: spec.learning.route.filter((step) => step.semanticId !== removedSemanticId),
              verify: spec.learning.verify.filter((step) => step.semanticId !== removedSemanticId),
            },
    });

    const result = await publish(nextSpec);
    const stored = await readFigure(db, project, spec.artifactId);
    const anchor = stored?.scene.elements.find((element) => element.id === target.id);
    const note = stored?.notes.find((entry) => entry.nodeKey === removedSemanticId);

    expect(result.deprecatedAnchors).toEqual([target.id]);
    expect(result.orphanedNotes).toEqual([removedSemanticId]);
    expect(anchor?.customData?.["deprecatedAnchor"]).toBe(true);
    expect(stored?.scene.elements.find((element) => element.id === humanReference.id)).toEqual(
      humanReference,
    );
    expect(note).toMatchObject({
      nodeKey: removedSemanticId,
      body: "body must survive publish",
      orphaned: true,
    });
  });

  test("a spec with a local absolute source root is InputError and stores nothing", async () => {
    // Given
    const leaked = { ...spec, source: { ...spec.source, root: "/Users/x/repo" } };
    // When
    const attempt = publish(leaked);
    // Then
    await expect(attempt).rejects.toBeInstanceOf(InputError);
    expect(await readFigure(db, project, spec.artifactId)).toBeNull();
  });

  test("invalid dangling-edge spec is InputError and leaves the figure counter unchanged", async () => {
    await publish(spec);
    const before = await readFigure(db, project, spec.artifactId);
    const invalid = structuredClone(spec) as unknown as { edges: Array<{ to: string }> };
    const firstEdge = invalid.edges[0];
    if (firstEdge === undefined) throw new Error("fixture lacks an edge");
    firstEdge.to = "missing-endpoint";

    await expect(publish(invalid)).rejects.toBeInstanceOf(InputError);

    const after = await readFigure(db, project, spec.artifactId);
    expect(await counter()).toBe(1);
    expect(after).toEqual(before);
    console.log(
      JSON.stringify({
        probe: "dangling-edge-input",
        error: "InputError",
        counterBefore: 1,
        counterAfter: await counter(),
      }),
    );
  });

  test("a concurrent human save wins once and publish reports conflict without retrying", async () => {
    await publish(spec);
    const humanScene = {
      ...fixtureScene,
      elements: [...fixtureScene.elements, humanElement("human-race-winner")],
    };
    let injected = false;
    const racingStore: D1Like = {
      prepare: (sql) => db.prepare(sql),
      async batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]> {
        if (!injected) {
          injected = true;
          expect(
            await commitScene(db, {
              project,
              artifact: spec.artifactId,
              expectedToken: "cas-1",
              scene: humanScene,
              source: "human-save",
              deprecatedAnchors: [],
            }),
          ).toEqual({ outcome: "committed", token: "cas-2" });
        }
        return db.batch<T>(statements);
      },
      withSession() {
        return racingStore;
      },
    };

    const result = await publish(revisionTwo(), fixtureScene, racingStore);
    const stored = await readFigure(db, project, spec.artifactId);

    expect(result).toMatchObject({ outcome: "conflict", token: "cas-2" });
    expect(stored?.scene).toEqual(humanScene);
    expect(stored?.spec).toEqual(spec);
    expect(await counter()).toBe(2);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM revisions").first<number>("count")).toBe(
      2,
    );
    console.log(
      JSON.stringify({
        probe: "stale-state",
        outcome: result.outcome,
        currentToken: result.token,
        counter: await counter(),
        revisions: 2,
      }),
    );
  });
});
