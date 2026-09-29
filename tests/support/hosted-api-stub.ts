import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import {
  commitNote,
  commitScene,
  createFigure,
  deleteProject,
  listProjects,
  markOrphanedNotes,
  normalizeHumanScene,
  readFigure,
  readProject,
  replaceVerifyRuns,
  type VerifyRun,
} from "../../hosted/worker/atlas-store";
import { InputError } from "../../src/errors";
import { type ExcalidrawScene, parseSceneMarkdown } from "../../src/excalidraw-file";
import { applyRefreshToScene } from "../../src/refresh-apply";
import { buildReferenceGraph } from "../../src/refresh-scene";
import { parseVisualNoteSpec } from "../../src/schema";
import { SQLiteD1 } from "./d1-sqlite";

// In-memory stand-in for the todo 6 Worker API. It reuses the real D1 atlas store over the
// bun:sqlite adapter, so CAS tokens, 409 conflicts, notes, and orphan flags behave like D1.
export const stubUserEmail = "changeroa@gmail.com";
export const stubProjectId = "visual-learning";
export const stubArtifactId = "vl-03-cas-refresh";

const bodyLimit = 1_500_000;
const repoRoot = resolve(import.meta.dir, "../..");
const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;

type Identity = { kind: "user"; email: string } | { kind: "service" };

export type PublishFigureInput = { spec: unknown; scene: unknown; verify?: unknown };
export type PublishInput = {
  projectId: string;
  repoName: string;
  commit: string | null;
  figures: PublishFigureInput[];
};

export type HostedApiStub = {
  readonly url: string;
  readonly port: number;
  readonly db: SQLiteD1;
  publish(input: PublishInput): Promise<unknown>;
  stop(): Promise<void>;
};

export type HostedApiStubOptions = {
  port?: number;
  distDir?: string;
  seed?: boolean;
  // When set, user requests must carry cookie CF_Authorization with exactly this value.
  authCookie?: string;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function withHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
}

function json(value: unknown, status = 200): Response {
  return withHeaders(Response.json(value, { status }));
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function identify(request: Request, authCookie: string | undefined): Identity {
  if (request.headers.has("cf-access-client-id") && request.headers.has("cf-access-client-secret"))
    return { kind: "service" };
  if (authCookie !== undefined && cookieValue(request, "CF_Authorization") !== authCookie)
    throw new HttpError(401, "unauthenticated", "missing or invalid Access credentials");
  return { kind: "user", email: stubUserEmail };
}

function requireKind(identity: Identity, kind: Identity["kind"]): void {
  if (identity.kind !== kind)
    throw new HttpError(403, "forbidden", `this route requires a ${kind} identity`);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > bodyLimit)
    throw new HttpError(413, "payload_too_large", "request body exceeds 1500000 bytes");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_json", "request body is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new HttpError(400, "invalid_body", "request body must be an object");
  return parsed as Record<string, unknown>;
}

function verifyRuns(value: unknown): VerifyRun[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "invalid_verify", "verify must be an array");
  return value as VerifyRun[];
}

async function publish(db: SQLiteD1, input: PublishInput) {
  const results = [];
  for (const figure of input.figures) {
    const spec = parseVisualNoteSpec(figure.spec);
    const project = input.projectId;
    const current = await readFigure(db, project, spec.artifactId);
    let outcome: "created" | "refreshed" | "conflict";
    let token: string;
    let deprecatedAnchors: readonly string[] = [];
    if (current === null) {
      const scene = figure.scene as ExcalidrawScene;
      if (buildReferenceGraph(scene, spec.artifactId).dangling.length > 0)
        throw new InputError("dangling scene references");
      const created = await createFigure(db, { project, spec, scene, deprecatedAnchors: [] });
      if (created.outcome !== "created") throw new InputError("figure appeared concurrently");
      outcome = "created";
      token = created.token;
    } else {
      const merged = applyRefreshToScene(current.scene, spec);
      deprecatedAnchors = merged.deprecatedAnchors;
      const result = await commitScene(db, {
        project,
        artifact: spec.artifactId,
        expectedToken: current.token,
        scene: merged.scene,
        spec,
        source: "publish",
        deprecatedAnchors,
      });
      if (result.outcome === "committed") {
        outcome = "refreshed";
        token = result.token;
      } else {
        outcome = "conflict";
        token = result.outcome === "conflict" ? result.current.token : current.token;
      }
    }
    await markOrphanedNotes(db, project, spec.artifactId, [
      ...spec.nodes.map((node) => node.semanticId),
      ...spec.edges.map((edge) => edge.semanticId),
    ]);
    await replaceVerifyRuns(db, project, spec.artifactId, verifyRuns(figure.verify));
    const after = await readFigure(db, project, spec.artifactId);
    results.push({
      artifactId: spec.artifactId,
      outcome,
      token,
      deprecatedAnchors,
      orphanedNotes: (after?.notes ?? []).filter((note) => note.orphaned).map((n) => n.nodeKey),
    });
  }
  await db
    .prepare(`INSERT INTO projects (project_id, repo_name, "commit", published_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET repo_name=excluded.repo_name,
      "commit"=excluded."commit", published_at=excluded.published_at`)
    .bind(input.projectId, input.repoName, input.commit, new Date().toISOString())
    .run();
  return { results };
}

async function exportProject(db: SQLiteD1, project: string) {
  const record = await readProject(db, project);
  if (record === null) return null;
  const figures = [];
  for (const summary of record.figures)
    figures.push(await readFigure(db, project, summary.artifactId));
  return { project: record.project, figures };
}

async function handleApi(
  db: SQLiteD1,
  request: Request,
  segments: string[],
  identity: Identity,
): Promise<Response> {
  const method = request.method;
  const [root, project, sub, artifact, leaf, nodeKey] = segments;
  if (root === "me" && segments.length === 1 && method === "GET") return json(identity);
  if (root === "publish" && segments.length === 1 && method === "POST") {
    requireKind(identity, "service");
    const body = await readBody(request);
    if (typeof body["projectId"] !== "string" || !Array.isArray(body["figures"]))
      throw new HttpError(400, "invalid_body", "projectId and figures are required");
    return json(await publish(db, body as unknown as PublishInput));
  }
  if (root !== "projects") throw new HttpError(404, "not_found", "no such API route");
  if (project === undefined && method === "GET") {
    requireKind(identity, "user");
    return json({ projects: await listProjects(db) });
  }
  if (project === undefined) throw new HttpError(404, "not_found", "no such API route");
  if (sub === undefined && method === "GET") {
    requireKind(identity, "user");
    const record = await readProject(db, project);
    if (record === null) throw new HttpError(404, "not_found", `project ${project} not found`);
    return json(record);
  }
  if (sub === undefined && method === "DELETE") {
    requireKind(identity, "service");
    if (!(await deleteProject(db, project)))
      throw new HttpError(404, "not_found", `project ${project} not found`);
    return json({ deleted: true });
  }
  if (sub === "export" && artifact === undefined && method === "GET") {
    const dump = await exportProject(db, project);
    if (dump === null) throw new HttpError(404, "not_found", `project ${project} not found`);
    return json(dump);
  }
  if (sub !== "figures" || artifact === undefined)
    throw new HttpError(404, "not_found", "no such API route");
  requireKind(identity, "user");
  if (leaf === undefined && method === "GET") {
    const figure = await readFigure(db, project, artifact);
    if (figure === null) throw new HttpError(404, "not_found", `figure ${artifact} not found`);
    return json(figure);
  }
  if (leaf === "scene" && segments.length === 5 && method === "PUT") {
    const body = await readBody(request);
    const expectedToken = body["expectedToken"];
    if (typeof expectedToken !== "string")
      throw new HttpError(400, "invalid_body", "expectedToken must be a string");
    const current = await readFigure(db, project, artifact);
    if (current === null) throw new HttpError(404, "not_found", `figure ${artifact} not found`);
    const scene = normalizeHumanScene(body["scene"], artifact);
    const result = await commitScene(db, {
      project,
      artifact,
      expectedToken,
      scene,
      source: "human-save",
      deprecatedAnchors: current.deprecatedAnchors,
    });
    if (result.outcome === "committed") return json({ token: result.token });
    if (result.outcome === "not-found")
      throw new HttpError(404, "not_found", `figure ${artifact} not found`);
    return json(
      { ...errorBody("conflict", "figure token is stale"), current: result.current },
      409,
    );
  }
  if (leaf === "notes" && nodeKey !== undefined && segments.length === 6 && method === "PUT") {
    const body = await readBody(request);
    const expectedToken = body["expectedToken"];
    const text = body["body"];
    if ((typeof expectedToken !== "string" && expectedToken !== null) || typeof text !== "string")
      throw new HttpError(400, "invalid_body", "expectedToken (string or null) and body required");
    if ((await readFigure(db, project, artifact)) === null)
      throw new HttpError(404, "not_found", `figure ${artifact} not found`);
    const result = await commitNote(db, { project, artifact, nodeKey, expectedToken, body: text });
    if (result.outcome === "committed") return json({ token: result.token });
    return json({ ...errorBody("conflict", "note token is stale"), current: result.current }, 409);
  }
  throw new HttpError(404, "not_found", "no such API route");
}

function serveStatic(distDir: string, pathname: string): Response {
  const indexPath = join(distDir, "index.html");
  const candidate = normalize(join(distDir, decodeURIComponent(pathname)));
  const inside = candidate.startsWith(`${distDir}/`);
  if (inside && existsSync(candidate) && statSync(candidate).isFile())
    return withHeaders(new Response(Bun.file(candidate)));
  if (pathname.startsWith("/assets/") || pathname.startsWith("/fonts/"))
    return withHeaders(new Response("not found", { status: 404 }));
  if (!existsSync(indexPath))
    return withHeaders(new Response("hosted/dist is not built", { status: 503 }));
  return withHeaders(
    new Response(Bun.file(indexPath), { headers: { "content-type": "text/html" } }),
  );
}

export function seedSpecAndScene(): { spec: unknown; scene: ExcalidrawScene } {
  const fixtures = join(repoRoot, "tests/fixtures/hosted");
  const markdown = readFileSync(join(fixtures, `${stubArtifactId}.excalidraw.md`), "utf8");
  const spec: unknown = JSON.parse(
    readFileSync(join(fixtures, `specs/${stubArtifactId}.json`), "utf8"),
  );
  return { spec, scene: parseSceneMarkdown(markdown).scene };
}

export function seedVerifyRuns(spec: unknown): VerifyRun[] {
  const parsed = parseVisualNoteSpec(spec);
  return (parsed.learning?.verify ?? []).map((step, index) =>
    index % 2 === 0
      ? {
          index,
          semanticId: step.semanticId,
          how: step.how,
          command: step.command ?? null,
          status: "ran",
          reason: null,
          exitCode: 0,
          stdout: `${step.command ?? step.how}\n(stub output for ${step.semanticId})\n`,
          stderr: "",
          commit: parsed.source.commit,
          ranAt: "2026-09-29T00:00:00.000Z",
        }
      : {
          index,
          semanticId: step.semanticId,
          how: step.how,
          command: step.command ?? null,
          status: "not-run",
          reason: step.command === undefined ? "no command" : "not allowlisted",
          exitCode: null,
          stdout: "",
          stderr: "",
          commit: null,
          ranAt: null,
        },
  );
}

export async function startHostedApiStub(
  options: HostedApiStubOptions = {},
): Promise<HostedApiStub> {
  const db = new SQLiteD1();
  const distDir = resolve(options.distDir ?? join(repoRoot, "hosted/dist"));
  if (options.seed ?? true) {
    const { spec, scene } = seedSpecAndScene();
    const parsed = parseVisualNoteSpec(spec);
    await publish(db, {
      projectId: stubProjectId,
      repoName: stubProjectId,
      commit: parsed.source.commit,
      figures: [{ spec, scene, verify: seedVerifyRuns(spec) }],
    });
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname !== "/api" && !url.pathname.startsWith("/api/"))
        return serveStatic(distDir, url.pathname);
      try {
        const identity = identify(request, options.authCookie);
        const segments = url.pathname
          .slice("/api/".length)
          .split("/")
          .filter((part) => part.length > 0)
          .map((part) => decodeURIComponent(part));
        return await handleApi(db, request, segments, identity);
      } catch (error) {
        if (error instanceof HttpError)
          return json(errorBody(error.code, error.message), error.status);
        if (error instanceof InputError)
          return json(errorBody("invalid_input", error.message), 400);
        const message = error instanceof Error ? error.message : String(error);
        return json(errorBody("internal", message), 500);
      }
    },
  });
  const port = server.port ?? 0;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    db,
    publish: (input) => publish(db, input),
    async stop() {
      await server.stop(true);
      db.close();
    },
  };
}

if (import.meta.main) {
  const portArg = process.argv.indexOf("--port");
  const port = portArg === -1 ? 8788 : Number(process.argv[portArg + 1]);
  const stub = await startHostedApiStub({ port });
  console.log(`hosted-api-stub listening on ${stub.url}`);
  const shutdown = async () => {
    await stub.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
