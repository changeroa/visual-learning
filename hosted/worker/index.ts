import { z } from "zod";
import { ConflictError, InputError } from "../../src/errors";
import type { ExcalidrawScene } from "../../src/excalidraw-file";
import { parseVisualNoteSpec } from "../../src/schema";
import { type AccessIdentity, AuthError, authenticate, createJwksProvider } from "./access-auth";
import {
  commitNote,
  commitScene,
  type D1Like,
  deleteProject,
  listProjects,
  normalizeHumanScene,
  readFigure,
  readProject,
} from "./atlas-store";
import { publishFigure } from "./publish-merge";

// The Worker entry may only export handlers (workerd rejects other runtime exports).
const MAX_BODY_BYTES = 1_500_000;

export interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly ATLAS_DB: D1Like;
  readonly ACCESS_TEAM_DOMAIN: string;
  readonly ACCESS_AUD: string;
  readonly ALLOWED_EMAIL: string;
  readonly SERVICE_CLIENT_ID: string;
  readonly ENVIRONMENT?: string;
  readonly LOCAL_JWKS_JSON?: string;
}

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const jwks = createJwksProvider();

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

type Caller = "user" | "service" | "any";
type Context = {
  readonly request: Request;
  readonly db: D1Like;
  readonly identity: AccessIdentity;
  readonly params: readonly string[];
};
type Route = {
  readonly method: "GET" | "PUT" | "POST" | "DELETE";
  readonly pattern: readonly string[];
  readonly caller: Caller;
  readonly handle: (context: Context) => Promise<Response>;
};

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sceneShape = z.looseObject({
  elements: z.array(z.looseObject({ id: z.string().min(1) })),
});
// z.unknown() keeps the caller's scene object by reference, so stored bytes keep their key order.
const sceneInput = z.unknown().refine((value) => sceneShape.safeParse(value).success, {
  message: "scene must be an object with an elements array of elements with string ids",
});
const sceneBody = z.object({ expectedToken: z.string().min(1), scene: sceneInput });
const noteBody = z.object({ expectedToken: z.string().min(1).nullable(), body: z.string() });
const verifyRun = z.object({
  index: z.number().int().nonnegative(),
  semanticId: z.string().nullable(),
  how: z.string(),
  command: z.string().nullable(),
  status: z.enum(["ran", "not-run"]),
  reason: z.string().nullable(),
  exitCode: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  commit: z.string().nullable(),
  ranAt: z.string().nullable(),
});
const publishBody = z.object({
  projectId: z.string().regex(slug),
  repoName: z.string().min(1),
  commit: z.string().nullable(),
  figures: z
    .array(z.object({ spec: z.unknown(), scene: sceneInput, verify: z.array(verifyRun) }))
    .min(1),
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return json({ error: { code, message }, ...extra }, status);
}

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  return secured;
}

function param(params: readonly string[], index: number): string {
  const value = params[index];
  if (value === undefined) throw new Error(`route parameter ${index} missing`);
  return value;
}

function notFound(what: string): HttpError {
  return new HttpError(404, "not_found", `${what} not found`);
}

function tooLarge(): HttpError {
  return new HttpError(413, "payload_too_large", `request body exceeds ${MAX_BODY_BYTES} bytes`);
}

async function readJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) throw tooLarge();
  if (request.body === null) throw new InputError("request body is required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    const chunk: Uint8Array = next.value;
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new InputError("request body must be UTF-8 JSON");
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new InputError(z.prettifyError(result.error));
  return result.data;
}

async function getProject({ db, params }: Context): Promise<Response> {
  const project = await readProject(db, param(params, 0));
  if (project === null) throw notFound("project");
  return json(project);
}

async function getFigure({ db, params }: Context): Promise<Response> {
  const figure = await readFigure(db, param(params, 0), param(params, 1));
  if (figure === null) throw notFound("figure");
  return json(figure);
}

async function putScene({ request, db, params }: Context): Promise<Response> {
  const project = param(params, 0);
  const artifact = param(params, 1);
  const body = parseInput(sceneBody, await readJson(request));
  const scene = normalizeHumanScene(body.scene, artifact);
  const current = await readFigure(db, project, artifact);
  if (current === null) throw notFound("figure");
  const result = await commitScene(db, {
    project,
    artifact,
    expectedToken: body.expectedToken,
    scene,
    source: "human-save",
    deprecatedAnchors: current.deprecatedAnchors,
  });
  if (result.outcome === "not-found") throw notFound("figure");
  if (result.outcome === "conflict") {
    return jsonError(409, "conflict", "scene token is stale", { current: result.current });
  }
  return json({ token: result.token });
}

async function putNote({ request, db, params }: Context): Promise<Response> {
  const project = param(params, 0);
  const artifact = param(params, 1);
  const nodeKey = param(params, 2);
  const body = parseInput(noteBody, await readJson(request));
  const figure = await readFigure(db, project, artifact);
  if (figure === null) throw notFound("figure");
  const known =
    nodeKey === "_figure" ||
    figure.spec.nodes.some((node) => node.semanticId === nodeKey) ||
    figure.spec.edges.some((edge) => edge.semanticId === nodeKey) ||
    figure.notes.some((note) => note.nodeKey === nodeKey);
  if (!known) throw new InputError(`unknown note key: ${nodeKey}`);
  const result = await commitNote(db, {
    project,
    artifact,
    nodeKey,
    expectedToken: body.expectedToken,
    body: body.body,
  });
  if (result.outcome === "conflict") {
    return jsonError(409, "conflict", "note token is stale", { current: result.current });
  }
  return json({ token: result.token });
}

async function publish({ request, db }: Context): Promise<Response> {
  const body = parseInput(publishBody, await readJson(request));
  // Reject the whole request before any write when one spec is invalid.
  body.figures.forEach((figure, index) => {
    try {
      parseVisualNoteSpec(figure.spec);
    } catch (error) {
      throw new InputError(`invalid spec for figures[${index}]`, { cause: error });
    }
  });
  await db
    .prepare(`INSERT INTO projects (project_id, repo_name, "commit", published_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET repo_name=excluded.repo_name,
        "commit"=excluded."commit", published_at=excluded.published_at`)
    .bind(body.projectId, body.repoName, body.commit, new Date().toISOString())
    .run();
  const results = [];
  for (const figure of body.figures) {
    results.push(
      await publishFigure(db, {
        project: body.projectId,
        spec: figure.spec,
        scene: figure.scene as ExcalidrawScene,
        verify: figure.verify,
      }),
    );
  }
  return json({ results });
}

async function removeProject({ db, params }: Context): Promise<Response> {
  if (!(await deleteProject(db, param(params, 0)))) throw notFound("project");
  return json({ deleted: true });
}

async function exportProject({ db, params }: Context): Promise<Response> {
  const project = param(params, 0);
  const summary = await readProject(db, project);
  if (summary === null) throw notFound("project");
  const figures = [];
  for (const figure of summary.figures) {
    const full = await readFigure(db, project, figure.artifactId);
    if (full !== null) figures.push(full);
  }
  return json({ project: summary.project, figures });
}

const routes: readonly Route[] = [
  {
    method: "GET",
    pattern: ["me"],
    caller: "any",
    handle: async ({ identity }) =>
      json(
        identity.kind === "user" ? { kind: "user", email: identity.email } : { kind: "service" },
      ),
  },
  {
    method: "GET",
    pattern: ["projects"],
    caller: "user",
    handle: async ({ db }) => json({ projects: await listProjects(db) }),
  },
  { method: "GET", pattern: ["projects", ":"], caller: "user", handle: getProject },
  { method: "DELETE", pattern: ["projects", ":"], caller: "service", handle: removeProject },
  { method: "GET", pattern: ["projects", ":", "export"], caller: "any", handle: exportProject },
  { method: "GET", pattern: ["projects", ":", "figures", ":"], caller: "user", handle: getFigure },
  {
    method: "PUT",
    pattern: ["projects", ":", "figures", ":", "scene"],
    caller: "user",
    handle: putScene,
  },
  {
    method: "PUT",
    pattern: ["projects", ":", "figures", ":", "notes", ":"],
    caller: "user",
    handle: putNote,
  },
  { method: "POST", pattern: ["publish"], caller: "service", handle: publish },
];

function matchPattern(pattern: readonly string[], segments: readonly string[]): string[] | null {
  if (pattern.length !== segments.length) return null;
  const params: string[] = [];
  for (const [index, part] of pattern.entries()) {
    const segment = segments[index];
    if (segment === undefined || segment.length === 0) return null;
    if (part === ":") params.push(segment);
    else if (part !== segment) return null;
  }
  return params;
}

function apiSegments(pathname: string): string[] {
  try {
    return pathname.split("/").slice(2).map(decodeURIComponent);
  } catch {
    throw new InputError("malformed URL path encoding");
  }
}

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  try {
    const identity = await authenticate(request, env, jwks);
    const segments = apiSegments(pathname);
    let pathMatched = false;
    for (const route of routes) {
      const params = matchPattern(route.pattern, segments);
      if (params === null) continue;
      pathMatched = true;
      if (route.method !== request.method) continue;
      if (route.caller !== "any" && route.caller !== identity.kind) throw new AuthError(403);
      return await route.handle({ request, db: env.ATLAS_DB, identity, params });
    }
    if (pathMatched) {
      return jsonError(405, "method_not_allowed", `${request.method} is not allowed here`);
    }
    return jsonError(404, "not_found", `No API route for ${pathname}`);
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
    if (error instanceof AuthError) {
      return jsonError(
        error.status,
        error.status === 401 ? "unauthorized" : "forbidden",
        error.message,
      );
    }
    if (error instanceof InputError) return jsonError(400, "invalid_input", error.detail);
    if (error instanceof ConflictError) return jsonError(409, "conflict", error.detail);
    console.error(error);
    return jsonError(500, "internal_error", "Internal error");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const response =
      pathname === "/api" || pathname.startsWith("/api/")
        ? await handleApi(request, env, pathname)
        : await env.ASSETS.fetch(request);
    return withSecurityHeaders(response);
  },
};
