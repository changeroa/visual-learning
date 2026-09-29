import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  commitNote,
  commitScene,
  createFigure,
  type D1Like,
  type D1Result,
  type D1Statement,
  deleteProject,
  listProjects,
  markOrphanedNotes,
  normalizeHumanScene,
  readFigure,
  readProject,
  replaceVerifyRuns,
  type VerifyRun,
} from "../hosted/worker/atlas-store";
import { InputError } from "../src/errors";
import { type ExcalidrawScene, parseSceneMarkdown } from "../src/excalidraw-file";
import { parseVisualNoteSpec } from "../src/schema";
import { SQLiteD1 } from "./support/d1-sqlite";

const spec = parseVisualNoteSpec(
  JSON.parse(
    readFileSync(
      new URL("./fixtures/hosted/specs/vl-03-cas-refresh.json", import.meta.url),
      "utf8",
    ),
  ),
);
const realScene = parseSceneMarkdown(
  readFileSync(
    new URL("./fixtures/hosted/vl-03-cas-refresh.excalidraw.md", import.meta.url),
    "utf8",
  ),
).scene;
const project = "visual-learning";
const artifact = spec.artifactId;
const scene: ExcalidrawScene = { elements: [] };
const input = { project, artifact, scene, source: "human-save", deprecatedAnchors: [] } as const;
const highwaterMigration = readFileSync(
  new URL("../hosted/migrations/0002_token_highwater.sql", import.meta.url),
  "utf8",
);
let db: SQLiteD1;

beforeEach(async () => {
  db = new SQLiteD1();
  await db
    .prepare("INSERT INTO projects VALUES (?, ?, ?, ?)")
    .bind(project, "visual-learning", "abc1234", "2026-09-29")
    .run();
  expect(await createFigure(db, { project, spec, scene, deprecatedAnchors: [] })).toEqual({
    outcome: "created",
    token: "cas-1",
  });
});

afterEach(() => db.close());

async function counter(): Promise<number | null> {
  return db
    .prepare("SELECT counter FROM figures WHERE project_id=? AND artifact_id=?")
    .bind(project, artifact)
    .first<number>("counter");
}

describe("D1 adapter", () => {
  test("bind is immutable; first/all/run report rows and changes; batch rolls back on error", async () => {
    const statement = db.prepare("SELECT ? AS value");
    expect(await statement.bind("one").first<string>("value")).toBe("one");
    expect((await statement.bind("two").all()).results).toEqual([{ value: "two" }]);
    const batch = await db.batch([
      db.prepare("UPDATE figures SET title=?").bind("updated"),
      db.prepare("UPDATE figures SET title=? WHERE token=?").bind("no change", "cas-999"),
    ]);
    expect(batch.map((result) => result.meta.changes)).toEqual([1, 0]);
    await expect(
      db.batch([
        db.prepare("UPDATE figures SET title='rolled back'"),
        db
          .prepare("INSERT INTO projects VALUES (?, ?, ?, ?)")
          .bind(project, "duplicate", null, "now"),
      ]),
    ).rejects.toThrow();
    expect(await db.prepare("SELECT title FROM figures").first<string>("title")).toBe("updated");
  });

  test("SQLiteD1 applies every migration cleanly to an empty database", async () => {
    const migrated = new SQLiteD1();
    try {
      expect(
        (
          await migrated
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all()
        ).results,
      ).toEqual(
        ["figures", "notes", "projects", "revisions", "token_highwater", "verify_runs"].map(
          (name) => ({ name }),
        ),
      );
      expect(
        await migrated.prepare("PRAGMA integrity_check").first<string>("integrity_check"),
      ).toBe("ok");
    } finally {
      migrated.close();
    }
  });
});

describe("atlas figures", () => {
  test("reads project counts, summaries, parsed figures and missing records", async () => {
    expect(await listProjects(db)).toEqual([
      {
        projectId: project,
        repoName: "visual-learning",
        commit: "abc1234",
        publishedAt: "2026-09-29",
        figureCount: 1,
      },
    ]);
    expect(await readProject(db, project)).toMatchObject({
      project: { projectId: project },
      figures: [
        { artifactId: artifact, title: spec.title, kind: spec.kind, revision: 1, token: "cas-1" },
      ],
    });
    expect(await readFigure(db, project, artifact)).toMatchObject({
      artifactId: artifact,
      spec,
      scene,
      token: "cas-1",
      notes: [],
      verify: [],
      deprecatedAnchors: [],
    });
    expect(await readProject(db, "missing")).toBeNull();
    expect(await readFigure(db, project, "missing")).toBeNull();
  });

  test("create conflict is exists and cannot replace a figure or its first revision", async () => {
    const before = await db.prepare("SELECT * FROM revisions").all();
    expect(
      await createFigure(db, { project, spec, scene: realScene, deprecatedAnchors: [] }),
    ).toEqual({ outcome: "exists" });
    expect(await counter()).toBe(1);
    expect((await readFigure(db, project, artifact))?.scene).toEqual(scene);
    expect((await db.prepare("SELECT * FROM revisions").all()).results).toEqual(before.results);
  });

  test("CAS also works without sessions and missing records never report a successful write", async () => {
    const withoutSessions: D1Like = {
      prepare: (sql) => db.prepare(sql),
      batch: (statements) => db.batch(statements),
    };
    expect(await commitScene(withoutSessions, { ...input, expectedToken: "cas-1" })).toEqual({
      outcome: "committed",
      token: "cas-2",
    });
    expect(
      await commitScene(withoutSessions, {
        ...input,
        artifact: "absent",
        expectedToken: "cas-1",
      }),
    ).toEqual({ outcome: "not-found" });
    expect(
      await commitNote(withoutSessions, {
        project,
        artifact,
        nodeKey: "absent",
        body: "not inserted",
        expectedToken: "cas-1",
      }),
    ).toEqual({ outcome: "conflict", current: null });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM notes").first<number>("count")).toBe(0);
    const revisions = (await db.prepare("SELECT * FROM revisions").all()).results;
    expect(
      await createFigure(withoutSessions, {
        project,
        spec,
        scene: realScene,
        deprecatedAnchors: [],
      }),
    ).toEqual({ outcome: "exists" });
    expect((await db.prepare("SELECT * FROM revisions").all()).results).toEqual(revisions);
    expect(await counter()).toBe(2);
  });

  test("CAS win stores scene, optional spec metadata and immutable revisions", async () => {
    const before = await db.prepare("SELECT * FROM revisions WHERE token='cas-1'").first();
    const nextSpec = { ...spec, title: "new title", revision: 2 };
    expect(
      await commitScene(db, {
        ...input,
        expectedToken: "cas-1",
        scene: realScene,
        spec: nextSpec,
        source: "publish",
        deprecatedAnchors: ["old"],
      }),
    ).toEqual({ outcome: "committed", token: "cas-2" });
    expect(await commitScene(db, { ...input, expectedToken: "cas-2" })).toEqual({
      outcome: "committed",
      token: "cas-3",
    });
    expect(
      await db.prepare("SELECT * FROM revisions WHERE token='cas-1'").first<unknown>(),
    ).toEqual(before);
    expect(
      await db
        .prepare("SELECT source, scene_json FROM revisions WHERE token='cas-2'")
        .first<{ source: string; scene_json: string }>(),
    ).toEqual({ source: "publish", scene_json: JSON.stringify(realScene) });
    expect(await readFigure(db, project, artifact)).toMatchObject({
      spec: nextSpec,
      scene,
      token: "cas-3",
    });
    expect((await readProject(db, project))?.figures[0]).toMatchObject({
      title: nextSpec.title,
      revision: 2,
    });
  });

  test("fabricated and stale tokens return the fresh scene without burning a counter", async () => {
    await commitScene(db, { ...input, expectedToken: "cas-1", scene: realScene });
    for (const expectedToken of ["cas-999", "cas-1"]) {
      const result = await commitScene(db, { ...input, expectedToken });
      expect(result).toEqual({
        outcome: "conflict",
        current: { token: "cas-2", scene: realScene },
      });
      expect(await counter()).toBe(2);
      console.log(
        JSON.stringify({
          probe: "stale_state",
          expectedToken,
          outcome: result.outcome,
          currentToken: result.outcome === "conflict" ? result.current.token : null,
          counter: await counter(),
        }),
      );
    }
  });

  test("50 sequential commits allocate exactly cas-2 through cas-51", async () => {
    const tokens = [];
    for (let index = 1; index <= 50; index += 1) {
      const result = await commitScene(db, { ...input, expectedToken: `cas-${index}` });
      expect(result).toEqual({ outcome: "committed", token: `cas-${index + 1}` });
      tokens.push(result.outcome === "committed" ? result.token : null);
    }
    expect(new Set(tokens).size).toBe(50);
    expect(await counter()).toBe(51);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM revisions").first<number>("count")).toBe(
      51,
    );
  });

  test("Promise.all race: exactly one success and one conflict, even after both read the old token", async () => {
    const changes: number[] = [];
    const constraints: string[] = [];
    const observed: D1Like = {
      prepare: (sql) => db.prepare(sql),
      async batch<T>(statements: D1Statement[]) {
        const results: D1Result<T>[] = await db.batch<T>(statements);
        expect(statements).toHaveLength(2);
        changes.push(results[0]?.meta.changes ?? -1);
        return results;
      },
      withSession(constraint) {
        constraints.push(constraint);
        return observed;
      },
    };
    const scenes = [
      { elements: [], writer: "left" },
      { elements: [], writer: "right" },
    ];
    const results = await Promise.all(
      scenes.map((candidate) =>
        commitScene(observed, { ...input, expectedToken: "cas-1", scene: candidate }),
      ),
    );
    expect(results.filter((result) => result.outcome === "committed")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "conflict")).toHaveLength(1);
    expect(changes).toEqual([1, 0]);
    expect(constraints).toContain("first-primary");
    const stored = await readFigure(db, project, artifact);
    if (stored === null) throw new Error("race lost the figure");
    expect(results.find((result) => result.outcome === "conflict")).toEqual({
      outcome: "conflict",
      current: { token: stored.token, scene: stored.scene },
    });
    expect(await counter()).toBe(2);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM revisions").first<number>("count")).toBe(
      2,
    );
    console.log(JSON.stringify({ probe: "race", results, changes, counter: await counter() }));
  });

  test("revision insertion failure rolls back the figure update instead of reporting success", async () => {
    db.database.exec(
      "CREATE TRIGGER reject_revision BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT, 'revision blocked'); END",
    );
    await expect(commitScene(db, { ...input, expectedToken: "cas-1" })).rejects.toThrow(
      "revision blocked",
    );
    expect(await counter()).toBe(1);
    expect((await readFigure(db, project, artifact))?.token).toBe("cas-1");
    expect(
      await db
        .prepare("SELECT counter FROM token_highwater WHERE kind='figure'")
        .first<number>("counter"),
    ).toBe(1);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM revisions").first<number>("count")).toBe(
      1,
    );
    console.log(
      "misleading_success_output: rejected revision blocked; stored token cas-1, counter 1, revisions 1",
    );
  });
});

describe("notes and project lifecycle", () => {
  test("delete/recreate races preserve high-water marks without allocating losing tokens", async () => {
    const note = { project, artifact, nodeKey: "_figure", body: "new", expectedToken: null };
    await commitNote(db, note);
    for (let previous = 1; previous <= 5; previous += 2) {
      expect(await commitScene(db, { ...input, expectedToken: `cas-${previous}` })).toMatchObject({
        token: `cas-${previous + 1}`,
      });
      expect(await commitNote(db, { ...note, expectedToken: `cas-${previous}` })).toMatchObject({
        token: `cas-${previous + 1}`,
      });
      await deleteProject(db, project);
      const creates = await Promise.all(
        [scene, realScene].map((candidate) =>
          createFigure(db, { project, spec, scene: candidate, deprecatedAnchors: [] }),
        ),
      );
      expect(creates.map((result) => result.outcome).sort()).toEqual(["created", "exists"]);
      expect(creates.find((result) => result.outcome === "created")).toEqual({
        outcome: "created",
        token: `cas-${previous + 2}`,
      });
      const notes = await Promise.all([commitNote(db, note), commitNote(db, note)]);
      expect(notes.map((result) => result.outcome).sort()).toEqual(["committed", "conflict"]);
      expect(notes.find((result) => result.outcome === "committed")).toEqual({
        outcome: "committed",
        token: `cas-${previous + 2}`,
      });
      for (const stale of [previous, previous + 1]) {
        expect(await commitScene(db, { ...input, expectedToken: `cas-${stale}` })).toMatchObject({
          outcome: "conflict",
          current: { token: `cas-${previous + 2}` },
        });
        expect(await commitNote(db, { ...note, expectedToken: `cas-${stale}` })).toMatchObject({
          outcome: "conflict",
          current: { token: `cas-${previous + 2}` },
        });
      }
      expect((await db.prepare("SELECT counter FROM token_highwater").all()).results).toEqual([
        { counter: previous + 2 },
        { counter: previous + 2 },
      ]);
      expect((await db.prepare("SELECT token FROM revisions").all()).results).toEqual([
        { token: `cas-${previous + 2}` },
      ]);
    }
  });

  test("migration backfills existing counters and tracks writes by the previous Worker", async () => {
    // Reconstruct the pre-0002 schema with live rows; migration must not rewrite their bytes.
    db.database.exec(`
      DROP TRIGGER figure_token_insert;
      DROP TRIGGER figure_token_update;
      DROP TRIGGER note_token_insert;
      DROP TRIGGER note_token_update;
      DROP TABLE token_highwater;
      UPDATE figures SET counter=7, token='cas-7';
    `);
    await db
      .prepare("INSERT INTO notes VALUES (?, ?, '_figure', 'old', 'cas-9', 9, 0, 'now')")
      .bind(project, artifact)
      .run();
    const figures = (await db.prepare("SELECT * FROM figures").all()).results;
    const notes = (await db.prepare("SELECT * FROM notes").all()).results;
    db.database.exec(highwaterMigration);
    expect((await db.prepare("SELECT * FROM figures").all()).results).toEqual(figures);
    expect((await db.prepare("SELECT * FROM notes").all()).results).toEqual(notes);
    expect(
      (await db.prepare("SELECT counter FROM token_highwater ORDER BY kind").all()).results,
    ).toEqual([{ counter: 7 }, { counter: 9 }]);
    // Old SQL does not know about token_highwater; the triggers still retain its writes.
    db.database.exec(`
      UPDATE figures SET counter=8, token='cas-8';
      UPDATE notes SET counter=10, token='cas-10';
    `);
    await deleteProject(db, project);
    expect(await createFigure(db, { project, spec, scene, deprecatedAnchors: [] })).toEqual({
      outcome: "created",
      token: "cas-9",
    });
    expect(
      await commitNote(db, {
        project,
        artifact,
        nodeKey: "_figure",
        body: "new",
        expectedToken: null,
      }),
    ).toEqual({ outcome: "committed", token: "cas-11" });
  });

  test("a high-water write failure rolls back the note instead of reporting success", async () => {
    const note = { project, artifact, nodeKey: "_figure", body: "first", expectedToken: null };
    await commitNote(db, note);
    db.database.exec(
      "CREATE TRIGGER reject_highwater BEFORE UPDATE ON token_highwater BEGIN SELECT RAISE(ABORT, 'highwater blocked'); END",
    );
    await expect(commitNote(db, { ...note, body: "lost", expectedToken: "cas-1" })).rejects.toThrow(
      "highwater blocked",
    );
    expect((await db.prepare("SELECT token, body FROM notes").all()).results).toEqual([
      { token: "cas-1", body: "first" },
    ]);
    expect(
      await db
        .prepare("SELECT counter FROM token_highwater WHERE kind='note'")
        .first<number>("counter"),
    ).toBe(1);
  });

  test("projects require an ID even when the commit is unknown", async () => {
    await expect(
      db
        .prepare("INSERT INTO projects VALUES (?, ?, ?, ?)")
        .bind(null, "visual-learning", null, "2026-09-29")
        .run(),
    ).rejects.toThrow("NOT NULL constraint failed: projects.project_id");
    expect(await listProjects(db)).toHaveLength(1);
  });

  test("note CAS supports create, update, stale/create conflicts and races", async () => {
    const note = { project, artifact, nodeKey: "node", body: "first", expectedToken: null };
    expect(await commitNote(db, note)).toEqual({ outcome: "committed", token: "cas-1" });
    expect(await commitNote(db, note)).toEqual({
      outcome: "conflict",
      current: { token: "cas-1", body: "first" },
    });
    expect(await commitNote(db, { ...note, body: "second", expectedToken: "cas-1" })).toEqual({
      outcome: "committed",
      token: "cas-2",
    });
    expect(await commitNote(db, { ...note, expectedToken: "cas-999" })).toEqual({
      outcome: "conflict",
      current: { token: "cas-2", body: "second" },
    });
    const results = await Promise.all(
      ["third", "fourth"].map((body) => commitNote(db, { ...note, body, expectedToken: "cas-2" })),
    );
    expect(results.map((result) => result.outcome).sort()).toEqual(["committed", "conflict"]);
    expect(await db.prepare("SELECT counter FROM notes").first<number>("counter")).toBe(3);
    expect(await counter()).toBe(1);
    const creates = await Promise.all(
      ["left", "right"].map((body) => commitNote(db, { ...note, nodeKey: "new", body })),
    );
    expect(creates.map((result) => result.outcome).sort()).toEqual(["committed", "conflict"]);
  });

  test("orphans and un-orphans node notes without changing bodies, tokens or figure notes", async () => {
    for (const nodeKey of ["_figure", "alive", "removed"])
      await commitNote(db, { project, artifact, nodeKey, body: nodeKey, expectedToken: null });
    const before = (await readFigure(db, project, artifact))?.notes;
    await markOrphanedNotes(db, project, artifact, ["alive"]);
    expect((await readFigure(db, project, artifact))?.notes).toEqual(
      before?.map((note) => ({ ...note, orphaned: note.nodeKey === "removed" })),
    );
    await markOrphanedNotes(db, project, artifact, ["alive", "removed"]);
    expect((await readFigure(db, project, artifact))?.notes).toEqual(before);
    await markOrphanedNotes(db, project, artifact, []);
    expect(
      (await readFigure(db, project, artifact))?.notes.filter((note) => note.orphaned),
    ).toHaveLength(2);
  });

  test("verify replacement and project deletion touch only the selected project", async () => {
    const run: VerifyRun = {
      index: 0,
      semanticId: "node",
      how: "inspect",
      command: "git status",
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "clean",
      stderr: "",
      commit: "abc1234",
      ranAt: "2026-09-29",
    };
    await replaceVerifyRuns(db, project, artifact, [run]);
    expect((await readFigure(db, project, artifact))?.verify).toEqual([run]);
    for (const column of ["stdout", "stderr"]) {
      await expect(db.prepare(`UPDATE verify_runs SET ${column}=NULL`).run()).rejects.toThrow(
        `NOT NULL constraint failed: verify_runs.${column}`,
      );
    }
    expect((await readFigure(db, project, artifact))?.verify).toEqual([run]);
    const skipped: VerifyRun = {
      ...run,
      index: 1,
      semanticId: null,
      command: null,
      status: "not-run",
      reason: "no command",
      exitCode: null,
      stdout: "",
      stderr: "",
      commit: null,
      ranAt: null,
    };
    await replaceVerifyRuns(db, project, artifact, [skipped]);
    expect((await readFigure(db, project, artifact))?.verify).toEqual([skipped]);
    await expect(replaceVerifyRuns(db, project, artifact, [run, run])).rejects.toThrow();
    expect((await readFigure(db, project, artifact))?.verify).toEqual([skipped]);
    await commitNote(db, {
      project,
      artifact,
      nodeKey: "_figure",
      body: "keep until deletion",
      expectedToken: null,
    });
    await db
      .prepare("INSERT INTO projects VALUES (?, ?, ?, ?)")
      .bind("other", "other", null, "now")
      .run();
    const unversionedSpec = parseVisualNoteSpec({
      ...spec,
      source: { ...spec.source, commit: null },
    });
    await createFigure(db, {
      project: "other",
      spec: unversionedSpec,
      scene,
      deprecatedAnchors: [],
    });
    expect((await readProject(db, "other"))?.project.commit).toBeNull();
    expect(
      (await listProjects(db)).find((entry) => entry.projectId === "other")?.commit,
    ).toBeNull();
    expect((await readFigure(db, "other", artifact))?.spec.source.commit).toBeNull();
    expect(await deleteProject(db, project)).toBe(true);
    expect(await deleteProject(db, project)).toBe(false);
    for (const table of ["projects", "figures", "notes", "revisions", "verify_runs"]) {
      expect(
        await db
          .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id=?`)
          .bind(project)
          .first<number>("count"),
      ).toBe(0);
    }
    expect((await readFigure(db, "other", artifact))?.token).toBe("cas-1");
  });
});

describe("human-save normalization", () => {
  test("a cloned real agent element becomes human; originals and unrelated metadata stay intact", () => {
    const original = realScene.elements.find(
      (element) => element.customData?.["owner"] === "agent",
    );
    if (original === undefined) throw new Error("real fixture lacks an agent element");
    const clone = structuredClone(original);
    clone.id = "human-copy";
    clone.customData = { ...clone.customData, customNote: "mine" };
    const submitted = { ...realScene, elements: [...realScene.elements, clone] };
    const before = JSON.stringify(submitted);
    const normalized = normalizeHumanScene(submitted, artifact);
    expect(normalized.elements.slice(0, -1)).toEqual(realScene.elements);
    expect(normalized.elements.at(-1)).toEqual({
      ...clone,
      customData: {
        owner: "human",
        customNote: "mine",
        category: original.customData?.["category"],
        evidence: original.customData?.["evidence"],
        schemaVersion: original.customData?.["schemaVersion"],
      },
    });
    expect(JSON.stringify(submitted)).toBe(before);
  });

  test("dangling references are rejected", () => {
    expect(() =>
      normalizeHumanScene(
        { elements: [{ id: "human", type: "text", containerId: "missing" }] },
        artifact,
      ),
    ).toThrow(InputError);
  });

  test.each([{}, { elements: null }, { elements: [{}] }, { elements: [null] }])(
    "malformed input %j is InputError",
    (value) => {
      expect(() => normalizeHumanScene(value, artifact)).toThrow(InputError);
    },
  );
});
