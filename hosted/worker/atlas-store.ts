import { InputError } from "../../src/errors";
import type { ExcalidrawScene } from "../../src/excalidraw-file";
import { buildReferenceGraph } from "../../src/refresh-scene";
import { type ElementRole, stableElementId } from "../../src/renderer-plan";
import type { VisualNoteSpec } from "../../src/schema";

export interface D1Result<T = unknown> {
  success: boolean;
  results: T[];
  meta: { changes: number };
}

export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T>(column?: string): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run<T>(): Promise<D1Result<T>>;
}

export interface D1Like {
  prepare(sql: string): D1Statement;
  // D1 batches execute sequentially in one transaction and reject on error (with rollback).
  // Results correspond one-to-one with statements; changes() sees the previous statement.
  batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]>;
  withSession?(constraint: "first-primary"): D1Like;
}

type FigureRow = {
  artifact_id: string;
  spec_json: string;
  scene_json: string;
  token: string;
  counter: number;
  deprecated_anchors_json: string;
  updated_at: string;
};

type NoteRow = {
  nodeKey: string;
  body: string;
  token: string;
  counter: number;
  orphaned: number;
  updatedAt: string;
};

export type VerifyRun = {
  index: number;
  semanticId: string | null;
  how: string;
  command: string | null;
  status: "ran" | "not-run";
  reason: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  commit: string | null;
  ranAt: string | null;
};

export type Project = {
  projectId: string;
  repoName: string;
  commit: string | null;
  publishedAt: string;
  figureCount: number;
};

export type FigureSummary = {
  artifactId: string;
  title: string;
  kind: string;
  revision: number;
  token: string;
  updatedAt: string;
};

type SceneResult =
  | { outcome: "committed"; token: string }
  | { outcome: "conflict"; current: { token: string; scene: ExcalidrawScene } }
  | { outcome: "not-found" };

type NoteResult =
  | { outcome: "committed"; token: string }
  | { outcome: "conflict"; current: { token: string; body: string } | null };

const projectSelect = `
  SELECT p.project_id AS projectId, p.repo_name AS repoName, p."commit" AS "commit",
    p.published_at AS publishedAt,
    (SELECT COUNT(*) FROM figures f WHERE f.project_id=p.project_id) AS figureCount
  FROM projects p`;

function figureRow(db: D1Like, project: string, artifact: string): Promise<FigureRow | null> {
  return db
    .prepare("SELECT * FROM figures WHERE project_id=? AND artifact_id=?")
    .bind(project, artifact)
    .first<FigureRow>();
}

export async function listProjects(db: D1Like): Promise<Project[]> {
  return (await db.prepare(`${projectSelect} ORDER BY p.project_id`).all<Project>()).results;
}

export async function readProject(db: D1Like, project: string) {
  const record = await db
    .prepare(`${projectSelect} WHERE p.project_id=?`)
    .bind(project)
    .first<Project>();
  if (record === null) return null;
  const figures = await db
    .prepare(`SELECT artifact_id AS artifactId, title, kind, revision, token, updated_at AS updatedAt
      FROM figures WHERE project_id=? ORDER BY artifact_id`)
    .bind(project)
    .all<FigureSummary>();
  return { project: record, figures: figures.results };
}

export async function readFigure(db: D1Like, project: string, artifact: string) {
  const row = await figureRow(db, project, artifact);
  if (row === null) return null;
  const notes = await db
    .prepare(`SELECT node_key AS nodeKey, body, token, orphaned, updated_at AS updatedAt
      FROM notes WHERE project_id=? AND artifact_id=? ORDER BY node_key`)
    .bind(project, artifact)
    .all<Omit<NoteRow, "counter">>();
  const verify = await db
    .prepare(`SELECT idx AS "index", semantic_id AS semanticId, how, command, status, reason,
      exit_code AS exitCode, stdout, stderr, "commit", ran_at AS ranAt
      FROM verify_runs WHERE project_id=? AND artifact_id=? ORDER BY idx`)
    .bind(project, artifact)
    .all<VerifyRun>();
  return {
    artifactId: row.artifact_id,
    spec: JSON.parse(row.spec_json) as VisualNoteSpec,
    scene: JSON.parse(row.scene_json) as ExcalidrawScene,
    token: row.token,
    updatedAt: row.updated_at,
    deprecatedAnchors: JSON.parse(row.deprecated_anchors_json) as string[],
    notes: notes.results.map((note) => ({ ...note, orphaned: note.orphaned !== 0 })),
    verify: verify.results,
  };
}

function sceneConflict(row: FigureRow | null): SceneResult {
  return row === null
    ? { outcome: "not-found" }
    : {
        outcome: "conflict",
        current: { token: row.token, scene: JSON.parse(row.scene_json) as ExcalidrawScene },
      };
}

// changes() ties the revision to this batch's winning write, not another writer's identical new token.
function insertRevision(
  db: D1Like,
  project: string,
  artifact: string,
  token: string,
  source: "publish" | "human-save",
): D1Statement {
  return db
    .prepare(`INSERT INTO revisions
      (project_id, artifact_id, token, source, spec_json, scene_json, created_at)
      SELECT project_id, artifact_id, token, ?, spec_json, scene_json, updated_at FROM figures
      WHERE project_id=? AND artifact_id=? AND changes()=1
      AND EXISTS (SELECT 1 FROM figures WHERE project_id=? AND artifact_id=? AND token=?)`)
    .bind(source, project, artifact, project, artifact, token);
}

export async function createFigure(
  db: D1Like,
  input: {
    project: string;
    spec: VisualNoteSpec;
    scene: ExcalidrawScene;
    deprecatedAnchors: readonly string[];
  },
): Promise<{ outcome: "created"; token: string } | { outcome: "exists" }> {
  const { project, spec, scene, deprecatedAnchors } = input;
  const session = db.withSession?.("first-primary") ?? db;
  const results = await session.batch([
    session
      .prepare(`INSERT INTO figures
      (project_id, artifact_id, title, kind, revision, spec_json, scene_json, token, counter,
        deprecated_anchors_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'cas-1', 1, ?, ?)
      ON CONFLICT(project_id, artifact_id) DO NOTHING`)
      .bind(
        project,
        spec.artifactId,
        spec.title,
        spec.kind,
        spec.revision,
        JSON.stringify(spec),
        JSON.stringify(scene),
        JSON.stringify(deprecatedAnchors),
        new Date().toISOString(),
      ),
    insertRevision(session, project, spec.artifactId, "cas-1", "publish"),
  ]);
  if (results[0]?.meta.changes === 0) return { outcome: "exists" };
  return { outcome: "created", token: "cas-1" };
}

export async function commitScene(
  db: D1Like,
  input: {
    project: string;
    artifact: string;
    expectedToken: string;
    scene: ExcalidrawScene;
    spec?: VisualNoteSpec;
    source: "publish" | "human-save";
    deprecatedAnchors: readonly string[];
  },
): Promise<SceneResult> {
  const { project, artifact, expectedToken, scene, spec, source, deprecatedAnchors } = input;
  const session = db.withSession?.("first-primary") ?? db;
  const current = await figureRow(session, project, artifact);
  if (current === null || current.token !== expectedToken) return sceneConflict(current);
  const token = `cas-${current.counter + 1}`;
  const results = await session.batch([
    session
      .prepare(`UPDATE figures SET scene_json=?, spec_json=COALESCE(?,spec_json),
      title=COALESCE(?,title), kind=COALESCE(?,kind), revision=COALESCE(?,revision),
      token=?, counter=counter+1, deprecated_anchors_json=?, updated_at=?
      WHERE project_id=? AND artifact_id=? AND token=? AND counter=?`)
      .bind(
        JSON.stringify(scene),
        spec === undefined ? null : JSON.stringify(spec),
        spec?.title ?? null,
        spec?.kind ?? null,
        spec?.revision ?? null,
        token,
        JSON.stringify(deprecatedAnchors),
        new Date().toISOString(),
        project,
        artifact,
        expectedToken,
        current.counter,
      ),
    insertRevision(session, project, artifact, token, source),
  ]);
  if (results[0]?.meta.changes === 0)
    return sceneConflict(await figureRow(session, project, artifact));
  return { outcome: "committed", token };
}

function noteRow(
  db: D1Like,
  project: string,
  artifact: string,
  nodeKey: string,
): Promise<Pick<NoteRow, "token" | "counter" | "body"> | null> {
  return db
    .prepare(`SELECT token, counter, body FROM notes
    WHERE project_id=? AND artifact_id=? AND node_key=?`)
    .bind(project, artifact, nodeKey)
    .first<Pick<NoteRow, "token" | "counter" | "body">>();
}

function noteConflict(row: Pick<NoteRow, "token" | "body"> | null): NoteResult {
  return {
    outcome: "conflict",
    current: row === null ? null : { token: row.token, body: row.body },
  };
}

export async function commitNote(
  db: D1Like,
  input: {
    project: string;
    artifact: string;
    nodeKey: string;
    expectedToken: string | null;
    body: string;
  },
): Promise<NoteResult> {
  const { project, artifact, nodeKey, expectedToken, body } = input;
  const session = db.withSession?.("first-primary") ?? db;
  const current = await noteRow(session, project, artifact, nodeKey);
  if ((current?.token ?? null) !== expectedToken) return noteConflict(current);
  const token = `cas-${(current?.counter ?? 0) + 1}`;
  const now = new Date().toISOString();
  const statement =
    expectedToken === null
      ? session
          .prepare(`INSERT INTO notes
        (project_id, artifact_id, node_key, body, token, counter, orphaned, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 0, ?)
        ON CONFLICT(project_id, artifact_id, node_key) DO NOTHING`)
          .bind(project, artifact, nodeKey, body, token, now)
      : session
          .prepare(`UPDATE notes SET body=?, token=?, counter=counter+1, updated_at=?
        WHERE project_id=? AND artifact_id=? AND node_key=? AND token=? AND counter=?`)
          .bind(body, token, now, project, artifact, nodeKey, expectedToken, current?.counter ?? 0);
  const result = await statement.run();
  if (result.meta.changes === 0)
    return noteConflict(await noteRow(session, project, artifact, nodeKey));
  return { outcome: "committed", token };
}

export async function markOrphanedNotes(
  db: D1Like,
  project: string,
  artifact: string,
  liveSemanticIds: readonly string[],
): Promise<void> {
  await db
    .prepare(`UPDATE notes SET orphaned=CASE
    WHEN node_key='_figure' OR node_key IN (SELECT value FROM json_each(?)) THEN 0 ELSE 1 END
    WHERE project_id=? AND artifact_id=?`)
    .bind(JSON.stringify(liveSemanticIds), project, artifact)
    .run();
}

export async function replaceVerifyRuns(
  db: D1Like,
  project: string,
  artifact: string,
  runs: readonly VerifyRun[],
): Promise<void> {
  await db.batch([
    db
      .prepare("DELETE FROM verify_runs WHERE project_id=? AND artifact_id=?")
      .bind(project, artifact),
    ...runs.map((run) =>
      db
        .prepare(`INSERT INTO verify_runs
      (project_id, artifact_id, idx, semantic_id, how, command, status, reason,
        exit_code, stdout, stderr, "commit", ran_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          project,
          artifact,
          run.index,
          run.semanticId,
          run.how,
          run.command,
          run.status,
          run.reason,
          run.exitCode,
          run.stdout,
          run.stderr,
          run.commit,
          run.ranAt,
        ),
    ),
  ]);
}

export async function deleteProject(db: D1Like, project: string): Promise<boolean> {
  const results = await db.batch(
    ["verify_runs", "notes", "revisions", "figures", "projects"].map((table) =>
      db.prepare(`DELETE FROM ${table} WHERE project_id=?`).bind(project),
    ),
  );
  return results.at(-1)?.meta.changes === 1;
}

export function normalizeHumanScene(scene: unknown, artifactId: string): ExcalidrawScene {
  if (
    typeof scene !== "object" ||
    scene === null ||
    !("elements" in scene) ||
    !Array.isArray(scene.elements) ||
    scene.elements.some(
      (element: unknown) =>
        typeof element !== "object" ||
        element === null ||
        !("id" in element) ||
        typeof element.id !== "string" ||
        element.id.length === 0,
    )
  )
    throw new InputError("malformed Excalidraw scene");
  const normalized = structuredClone(scene) as ExcalidrawScene;
  for (const element of normalized.elements) {
    const custom = element.customData;
    if (custom?.["owner"] !== "agent") continue;
    if (typeof custom["semanticId"] !== "string" || typeof custom["elementRole"] !== "string")
      throw new InputError(`partial ownership on ${element.id}`);
    if (
      element.id ===
      stableElementId(artifactId, custom["semanticId"], custom["elementRole"] as ElementRole)
    )
      continue;
    custom["owner"] = "human";
    for (const key of ["artifactId", "semanticId", "elementRole", "revision", "status"])
      delete custom[key];
  }
  try {
    const graph = buildReferenceGraph(normalized, artifactId);
    if (graph.dangling.length > 0)
      throw new InputError(`dangling scene references: ${graph.dangling.join(", ")}`);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("invalid scene references", { cause: error });
  }
  return normalized;
}
