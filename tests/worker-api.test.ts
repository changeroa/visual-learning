import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import worker, { type Env } from "../hosted/worker/index";
import { parseSceneMarkdown } from "../src/excalidraw-file";
import { parseHostedVisualNoteSpec, parseVisualNoteSpec } from "../src/schema";
import { SQLiteD1 } from "./support/d1-sqlite";

// TEST-ONLY key pair; its public half is also the env.local LOCAL_JWKS_JSON in hosted/wrangler.jsonc.
const testKey = JSON.parse(
  readFileSync(new URL("./fixtures/hosted/test-access-key.json", import.meta.url), "utf8"),
) as { kid: string; publicJwk: webcrypto.JsonWebKey; privateJwk: webcrypto.JsonWebKey };
const localSpec = parseVisualNoteSpec(
  JSON.parse(
    readFileSync(
      new URL("./fixtures/hosted/specs/vl-03-cas-refresh.json", import.meta.url),
      "utf8",
    ),
  ),
);
// The CLI publish payload scrubs source.root to the repo name; that is what the Worker receives.
const spec = parseHostedVisualNoteSpec({
  ...localSpec,
  source: { ...localSpec.source, root: "visual-learning" },
});
const scene = parseSceneMarkdown(
  readFileSync(
    new URL("./fixtures/hosted/vl-03-cas-refresh.excalidraw.md", import.meta.url),
    "utf8",
  ),
).scene;
const project = "visual-learning";
const figurePath = `/api/projects/${project}/figures/${spec.artifactId}`;
const CSP =
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'";

let signingKey: CryptoKey;
let userToken: string;
let serviceToken: string;
let db: SQLiteD1;
let env: Env;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function sign(claims: Record<string, unknown>): Promise<string> {
  const input = `${encode({ alg: "RS256", kid: testKey.kid, typ: "JWT" })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${Buffer.from(signature).toString("base64url")}`;
}

function baseClaims(): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return { aud: "test-aud", iss: "https://test.cloudflareaccess.com", exp: now + 3600, nbf: now };
}

type CallOptions = {
  readonly token?: string;
  readonly body?: unknown;
  readonly rawBody?: NonNullable<RequestInit["body"]>;
  readonly headers?: Record<string, string>;
};

function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.token !== undefined) headers.set("Cf-Access-Jwt-Assertion", options.token);
  const body =
    options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = body;
  return worker.fetch(new Request(`https://atlas.test${path}`, init), env);
}

async function publishFixture(): Promise<Response> {
  return call("POST", "/api/publish", {
    token: serviceToken,
    body: {
      projectId: project,
      repoName: "visual-learning",
      commit: "abc1234",
      figures: [{ spec, scene, verify: [] }],
    },
  });
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeAll(async () => {
  signingKey = await crypto.subtle.importKey(
    "jwk",
    testKey.privateJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  userToken = await sign({ ...baseClaims(), email: "owner@example.com" });
  serviceToken = await sign({ ...baseClaims(), common_name: "test-client.access" });
});

beforeEach(() => {
  db = new SQLiteD1();
  env = {
    ASSETS: {
      fetch: async (request) =>
        new Response(`asset:${new URL(request.url).pathname}`, {
          headers: { "Content-Type": "text/html" },
        }),
    },
    ATLAS_DB: db,
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    ACCESS_AUD: "test-aud",
    ALLOWED_EMAIL: "owner@example.com",
    SERVICE_CLIENT_ID: "test-client.access",
    ENVIRONMENT: "local",
    LOCAL_JWKS_JSON: JSON.stringify({ keys: [testKey.publicJwk] }),
  };
});

afterEach(() => db.close());

describe("routing, identity, and headers", () => {
  test("non-API paths fall through to ASSETS with security headers", async () => {
    const response = await call("GET", "/projects/visual-learning");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset:/projects/visual-learning");
    expect(response.headers.get("Content-Security-Policy")).toBe(CSP);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  test("static-asset _headers apply the API security headers to every path", async () => {
    // Workers Static Assets answer non-API paths without the Worker, so _headers must match it.
    const rules = new Map<string, Map<string, string>>();
    let current: Map<string, string> | undefined;
    const source = readFileSync(new URL("../hosted/web/_headers", import.meta.url), "utf8");
    for (const line of source.split("\n")) {
      if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
      if (!/^\s/.test(line)) {
        current = new Map();
        rules.set(line.trim(), current);
        continue;
      }
      const colon = line.indexOf(":");
      if (current === undefined || colon < 0) throw new Error(`bad _headers line: ${line}`);
      current.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
    const api = await call("GET", "/api/projects");
    const names = ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy"];
    const expected = Object.fromEntries(names.map((name) => [name, api.headers.get(name)]));
    expect(expected).toEqual({
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    const staticRule: Record<string, string | null> = Object.fromEntries(rules.get("/*") ?? []);
    expect(staticRule).toEqual(expected);
  });

  test("a missing JWT is 401 JSON with security headers", async () => {
    const response = await call("GET", "/api/projects");
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("unauthorized");
    expect(response.headers.get("Content-Security-Policy")).toBe(CSP);
  });

  test("another Access user is 403", async () => {
    const intruder = await sign({ ...baseClaims(), email: "intruder@example.com" });
    const response = await call("GET", "/api/me", { token: intruder });
    expect(response.status).toBe(403);
  });

  test("GET /api/me reports the user and the service identity", async () => {
    const user = await call("GET", "/api/me", { token: userToken });
    expect(await user.json()).toEqual({ kind: "user", email: "owner@example.com" });
    const service = await call("GET", "/api/me", { token: serviceToken });
    expect(await service.json()).toEqual({ kind: "service" });
  });

  test("user and service routes are exclusive", async () => {
    await publishFixture();
    const userPublish = await call("POST", "/api/publish", { token: userToken, body: {} });
    expect(userPublish.status).toBe(403);
    const servicePut = await call("PUT", `${figurePath}/scene`, {
      token: serviceToken,
      body: { expectedToken: "cas-1", scene },
    });
    expect(servicePut.status).toBe(403);
    expect((await call("GET", "/api/projects", { token: serviceToken })).status).toBe(403);
    expect((await call("DELETE", `/api/projects/${project}`, { token: userToken })).status).toBe(
      403,
    );
    expect(await db.prepare("SELECT counter FROM figures").first<number>("counter")).toBe(1);
  });

  test("unknown routes are 404 and wrong methods are 405", async () => {
    expect((await call("GET", "/api/nope", { token: userToken })).status).toBe(404);
    expect((await call("PATCH", "/api/projects", { token: userToken })).status).toBe(405);
  });
});

describe("read routes", () => {
  test("projects, project, figure, and export reflect a publish", async () => {
    await publishFixture();

    const list = (await (await call("GET", "/api/projects", { token: userToken })).json()) as {
      projects: unknown[];
    };
    expect(list.projects).toEqual([
      expect.objectContaining({ projectId: project, repoName: "visual-learning", figureCount: 1 }),
    ]);

    const detail = await call("GET", `/api/projects/${project}`, { token: userToken });
    expect(await detail.json()).toMatchObject({
      project: { projectId: project, commit: "abc1234" },
      figures: [{ artifactId: spec.artifactId, title: spec.title, token: "cas-1" }],
    });

    const figure = await call("GET", figurePath, { token: userToken });
    expect(await figure.json()).toMatchObject({
      artifactId: spec.artifactId,
      token: "cas-1",
      scene,
      notes: [],
      verify: [],
      deprecatedAnchors: [],
    });

    const dump = await call("GET", `/api/projects/${project}/export`, { token: serviceToken });
    expect(await dump.json()).toMatchObject({
      project: { projectId: project },
      figures: [{ artifactId: spec.artifactId, spec, scene, token: "cas-1", notes: [] }],
    });
  });

  test("missing project and figure are 404", async () => {
    expect((await call("GET", "/api/projects/absent", { token: userToken })).status).toBe(404);
    expect((await call("GET", figurePath, { token: userToken })).status).toBe(404);
    expect((await call("GET", "/api/projects/absent/export", { token: userToken })).status).toBe(
      404,
    );
  });
});

describe("POST /api/publish", () => {
  test("scene graph exceptions are 400 before any project write", async () => {
    const response = await call("POST", "/api/publish", {
      token: serviceToken,
      body: {
        projectId: project,
        repoName: "visual-learning",
        commit: null,
        figures: [
          {
            spec,
            scene: {
              elements: [
                { id: "human" },
                {
                  id: "agent",
                  containerId: "human",
                  customData: {
                    owner: "agent",
                    artifactId: spec.artifactId,
                    semanticId: "node",
                    elementRole: "shape",
                  },
                },
              ],
            },
            verify: [],
          },
        ],
      },
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_input");
    expect((await db.prepare("SELECT * FROM projects").all()).results).toEqual([]);
    expect((await db.prepare("SELECT * FROM token_highwater").all()).results).toEqual([]);
  });

  test("valid optional scene fields retain their original bytes", async () => {
    const submitted = {
      elements: [{ groupIds: ["group"], boundElements: null, id: "human", customField: 42 }],
    };
    const response = await call("POST", "/api/publish", {
      token: serviceToken,
      body: {
        projectId: project,
        repoName: "visual-learning",
        commit: null,
        figures: [{ spec, scene: submitted, verify: [] }],
      },
    });
    expect(response.status).toBe(200);
    expect(await db.prepare("SELECT scene_json FROM figures").first<string>("scene_json")).toBe(
      JSON.stringify(submitted),
    );
    const saved = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      body: { expectedToken: "cas-1", scene: submitted },
    });
    expect(saved.status).toBe(200);
    expect(await db.prepare("SELECT scene_json FROM figures").first<string>("scene_json")).toBe(
      JSON.stringify(submitted),
    );
  });

  test.each([
    { id: 12 },
    { id: "broken", groupIds: "q" },
    { id: "broken", groupIds: [12] },
    { id: "broken", boundElements: "q" },
  ])("malformed element %j is 400 for publish and PUT without writes", async (element) => {
    const malformed = { elements: [element] };
    const response = await call("POST", "/api/publish", {
      token: serviceToken,
      body: {
        projectId: project,
        repoName: "visual-learning",
        commit: null,
        figures: [{ spec, scene: malformed, verify: [] }],
      },
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_input");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM projects").first<number>("n")).toBe(0);
    await publishFixture();
    const before = (await db.prepare("SELECT * FROM figures").all()).results;
    const saved = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      body: { expectedToken: "cas-1", scene: malformed },
    });
    expect(saved.status).toBe(400);
    expect(await errorCode(saved)).toBe("invalid_input");
    expect((await db.prepare("SELECT * FROM figures").all()).results).toEqual(before);
  });

  test("creates then refreshes and records verify runs", async () => {
    const created = await publishFixture();
    expect(await created.json()).toEqual({
      results: [
        {
          artifactId: spec.artifactId,
          outcome: "created",
          token: "cas-1",
          deprecatedAnchors: [],
          orphanedNotes: [],
        },
      ],
    });

    const run = {
      index: 0,
      semanticId: null,
      how: "run tests",
      command: "bun test",
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      commit: "abc1234",
      ranAt: "2026-09-29T00:00:00.000Z",
    };
    const refreshed = await call("POST", "/api/publish", {
      token: serviceToken,
      body: {
        projectId: project,
        repoName: "visual-learning",
        commit: "def5678",
        figures: [{ spec: { ...spec, revision: 2 }, scene, verify: [run] }],
      },
    });
    expect(await refreshed.json()).toMatchObject({
      results: [{ outcome: "refreshed", token: "cas-2" }],
    });
    const figure = (await (await call("GET", figurePath, { token: userToken })).json()) as {
      verify: unknown[];
    };
    expect(figure.verify).toEqual([run]);
    const detail = (await (
      await call("GET", `/api/projects/${project}`, { token: userToken })
    ).json()) as { project: { commit: string } };
    expect(detail.project.commit).toBe("def5678");
  });

  test("a path-scrubbed spec is accepted and stored with the repo-name root", async () => {
    // Given
    expect(spec.source.root).toBe("visual-learning");
    // When
    const response = await publishFixture();
    // Then
    expect(response.status).toBe(200);
    const dump = (await (
      await call("GET", `/api/projects/${project}/export`, { token: serviceToken })
    ).json()) as { figures: { spec: { source: { root: string } } }[] };
    expect(dump.figures[0]?.spec.source.root).toBe("visual-learning");
  });

  test("a spec with a local absolute source root is 400 and writes nothing", async () => {
    // Given
    const leaked = { ...spec, source: { ...spec.source, root: "/Users/x/repo" } };
    // When
    const response = await call("POST", "/api/publish", {
      token: serviceToken,
      body: {
        projectId: project,
        repoName: "visual-learning",
        commit: null,
        figures: [{ spec: leaked, scene, verify: [] }],
      },
    });
    // Then
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_input");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM projects").first<number>("n")).toBe(0);
  });

  test("an invalid spec is 400 and writes nothing", async () => {
    const response = await call("POST", "/api/publish", {
      token: serviceToken,
      body: {
        projectId: project,
        repoName: "visual-learning",
        commit: null,
        figures: [{ spec: { ...spec, nodes: "nope" }, scene, verify: [] }],
      },
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_input");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM projects").first<number>("n")).toBe(0);
  });

  test("a dangling scene in any figure is 400 and leaves no project row", async () => {
    const broken = {
      elements: [{ id: "broken", type: "rectangle", boundElements: [{ id: "missing" }] }],
    };
    const response = await call("POST", "/api/publish", {
      token: serviceToken,
      body: {
        projectId: "broken-only",
        repoName: "visual-learning",
        commit: "abc1234",
        figures: [
          { spec, scene, verify: [] },
          { spec, scene: broken, verify: [] },
        ],
      },
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_input");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM projects").first<number>("n")).toBe(0);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM figures").first<number>("n")).toBe(0);
    const list = await call("GET", "/api/projects", { token: userToken });
    expect(await list.json()).toEqual({ projects: [] });
  });

  test("missing fields are 400", async () => {
    const response = await call("POST", "/api/publish", {
      token: serviceToken,
      body: { projectId: project },
    });
    expect(response.status).toBe(400);
  });
});

describe("PUT scene", () => {
  test("a human save commits a new token and a human-save revision", async () => {
    await publishFixture();
    const human = { id: "human-box", type: "rectangle", customData: { owner: "human" } };
    const response = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      body: { expectedToken: "cas-1", scene: { ...scene, elements: [...scene.elements, human] } },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "cas-2" });
    expect(
      await db.prepare("SELECT source FROM revisions WHERE token='cas-2'").first<string>("source"),
    ).toBe("human-save");
  });

  test("a stale token is 409 with the current token and scene", async () => {
    await publishFixture();
    const response = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      body: { expectedToken: "cas-0", scene },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "conflict", message: "scene token is stale" },
      current: { token: "cas-1", scene },
    });
  });

  test("an invalid scene, bad JSON, and missing fields are 400", async () => {
    await publishFixture();
    const invalid = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      body: { expectedToken: "cas-1", scene: { elements: "nope" } },
    });
    expect(invalid.status).toBe(400);
    const badJson = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      rawBody: "{not json",
    });
    expect(badJson.status).toBe(400);
    const missing = await call("PUT", `${figurePath}/scene`, { token: userToken, body: {} });
    expect(missing.status).toBe(400);
  });

  test("a scene for a missing figure is 404", async () => {
    const response = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      body: { expectedToken: "cas-1", scene: { elements: [] } },
    });
    expect(response.status).toBe(404);
  });

  test("a 1.6 MB body is 413 with or without Content-Length", async () => {
    await publishFixture();
    const huge = JSON.stringify({ expectedToken: "cas-1", scene, pad: "x".repeat(1_600_000) });
    const declared = await call("PUT", `${figurePath}/scene`, { token: userToken, rawBody: huge });
    expect(declared.status).toBe(413);
    expect(await errorCode(declared)).toBe("payload_too_large");

    const bytes = new TextEncoder().encode(huge);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 65_536) {
          controller.enqueue(bytes.slice(offset, offset + 65_536));
        }
        controller.close();
      },
    });
    const streamed = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      rawBody: stream,
    });
    expect(streamed.status).toBe(413);
    expect(await db.prepare("SELECT counter FROM figures").first<number>("counter")).toBe(1);
  });
});

describe("PUT notes", () => {
  test("creates, updates, and rejects stale note tokens", async () => {
    await publishFixture();
    const nodeKey = spec.nodes[0]?.semanticId ?? "";
    const path = `${figurePath}/notes/${nodeKey}`;

    const created = await call("PUT", path, {
      token: userToken,
      body: { expectedToken: null, body: "first" },
    });
    expect(await created.json()).toEqual({ token: "cas-1" });
    const updated = await call("PUT", path, {
      token: userToken,
      body: { expectedToken: "cas-1", body: "second" },
    });
    expect(await updated.json()).toEqual({ token: "cas-2" });
    const stale = await call("PUT", path, {
      token: userToken,
      body: { expectedToken: "cas-1", body: "lost" },
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ current: { token: "cas-2", body: "second" } });

    const figureNote = await call("PUT", `${figurePath}/notes/_figure`, {
      token: userToken,
      body: { expectedToken: null, body: "figure note" },
    });
    expect(await figureNote.json()).toEqual({ token: "cas-1" });
  });

  test("an unknown node key is 400 and a missing figure is 404", async () => {
    await publishFixture();
    const unknown = await call("PUT", `${figurePath}/notes/not-a-node`, {
      token: userToken,
      body: { expectedToken: null, body: "x" },
    });
    expect(unknown.status).toBe(400);
    const missing = await call("PUT", `/api/projects/${project}/figures/absent/notes/_figure`, {
      token: userToken,
      body: { expectedToken: null, body: "x" },
    });
    expect(missing.status).toBe(404);
  });
});

describe("DELETE project", () => {
  test("delete and republish reject both pre-delete scene and note tokens with 409", async () => {
    await publishFixture();
    const notePath = `${figurePath}/notes/_figure`;
    await call("PUT", notePath, {
      token: userToken,
      body: { expectedToken: null, body: "old note" },
    });
    expect((await call("DELETE", `/api/projects/${project}`, { token: serviceToken })).status).toBe(
      200,
    );
    expect((await publishFixture()).status).toBe(200);
    const recreated = await call("PUT", notePath, {
      token: userToken,
      body: { expectedToken: null, body: "new note" },
    });
    const staleScene = await call("PUT", `${figurePath}/scene`, {
      token: userToken,
      body: { expectedToken: "cas-1", scene: { elements: [] } },
    });
    expect(staleScene.status).toBe(409);
    expect(await staleScene.json()).toMatchObject({ current: { token: "cas-2", scene } });
    expect(await recreated.json()).toEqual({ token: "cas-2" });
    const staleNote = await call("PUT", notePath, {
      token: userToken,
      body: { expectedToken: "cas-1", body: "lost update" },
    });
    expect(staleNote.status).toBe(409);
    expect(await staleNote.json()).toMatchObject({
      current: { token: "cas-2", body: "new note" },
    });
    const stored = await call("GET", figurePath, { token: userToken });
    expect(await stored.json()).toMatchObject({
      token: "cas-2",
      scene,
      notes: [{ token: "cas-2", body: "new note" }],
    });
  });

  test("the service deletes a project once, then gets 404", async () => {
    await publishFixture();
    const deleted = await call("DELETE", `/api/projects/${project}`, { token: serviceToken });
    expect(await deleted.json()).toEqual({ deleted: true });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM figures").first<number>("n")).toBe(0);
    const again = await call("DELETE", `/api/projects/${project}`, { token: serviceToken });
    expect(again.status).toBe(404);
  });
});
