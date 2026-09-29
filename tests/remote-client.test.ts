import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputError } from "../src/errors";
import { encodeSceneToMarkdown, parseSceneMarkdown } from "../src/excalidraw-file";
import { jsonBytes } from "../src/io";
import { accessHeaders, loadCredentials, publish } from "../src/remote-client";

const cli = join(import.meta.dir, "../bin/visual-note");
const exportRoot = join(import.meta.dir, "fixtures/hosted/payload/export-series");
const projectBase = "docs/vl/projects/visual-learning";
const clientId = "test-client.access";
const secret = "test-secret-7f3a9c2e";
const temporaryRoots: string[] = [];
const servers: ReturnType<typeof Bun.serve>[] = [];

type Recorded = {
  readonly method: string;
  readonly path: string;
  readonly headers: Headers;
  readonly body: string;
};
type Stub = { readonly url: string; readonly requests: Recorded[] };
type Figure = { readonly spec: { readonly artifactId: string }; readonly verify: unknown[] };

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

function stub(respond: (request: Recorded) => Response): Stub {
  const requests: Recorded[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const recorded = {
        method: request.method,
        path: new URL(request.url).pathname,
        headers: request.headers,
        body: await request.text(),
      };
      requests.push(recorded);
      return respond(recorded);
    },
  });
  servers.push(server);
  return { url: `http://127.0.0.1:${server.port}`, requests };
}

function publishResults(request: Recorded, conflict: string | null = null): Response {
  const payload = JSON.parse(request.body) as { figures: Figure[] };
  return Response.json({
    results: payload.figures.map((figure) => ({
      artifactId: figure.spec.artifactId,
      outcome: figure.spec.artifactId === conflict ? "conflict" : "created",
      token: "cas-1",
      deprecatedAnchors: [],
      orphanedNotes: [],
    })),
  });
}

function atlasCopy(): string {
  const root = temporary("visual-learning-atlas-");
  cpSync(exportRoot, root, { recursive: true });
  return root;
}

function homeWithCredentials(content: string, mode = 0o600): string {
  const home = temporary("visual-learning-home-");
  const folder = join(home, ".config/visual-atlas");
  mkdirSync(folder, { recursive: true });
  const path = join(folder, "credentials.json");
  writeFileSync(path, content);
  chmodSync(path, mode);
  return home;
}

function validHome(): string {
  return homeWithCredentials(JSON.stringify({ clientId, clientSecret: secret }));
}

function childEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env["PATH"] ?? "/usr/bin:/bin",
    TMPDIR: process.env["TMPDIR"] ?? "/tmp",
    HOME: home,
    ...extra,
  };
}

async function runCli(
  args: readonly string[],
  env: Record<string, string>,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  const child = Bun.spawn([cli, ...args], { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

function publishArgs(root: string, remote: string): string[] {
  return ["publish", "--root", root, "--project", "visual-learning", "--remote", remote];
}

function exportFigures(noteBody: string): unknown[] {
  return ["vl-01-architecture", "vl-02-export-series"].map((artifactId) => ({
    artifactId,
    spec: JSON.parse(
      readFileSync(join(exportRoot, projectBase, `specs/${artifactId}.json`), "utf8"),
    ),
    scene: parseSceneMarkdown(
      readFileSync(join(exportRoot, projectBase, `${artifactId}.excalidraw.md`), "utf8"),
    ).scene,
    token: "cas-3",
    notes: [{ nodeKey: "_figure", body: noteBody, token: "cas-1", orphaned: false }],
    verify: [],
  }));
}

describe("remote client publish", () => {
  test("sends the service-token headers and prints per-figure outcomes without the secret", async () => {
    // Given
    const remote = stub((request) => publishResults(request));
    // When
    const result = await runCli(publishArgs(atlasCopy(), remote.url), childEnv(validHome()));
    // Then
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      "created vl-01-architecture cas-1\ncreated vl-02-export-series cas-1\n",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    const [request] = remote.requests;
    expect(remote.requests).toHaveLength(1);
    expect(request?.method).toBe("POST");
    expect(request?.path).toBe("/api/publish");
    expect(request?.headers.get("cf-access-client-id")).toBe(clientId);
    expect(request?.headers.get("cf-access-client-secret")).toBe(secret);
    expect(request?.headers.get("cf-access-jwt-assertion")).toBeNull();
    const body = JSON.parse(request?.body ?? "{}") as { projectId: string; figures: Figure[] };
    expect(body.projectId).toBe("visual-learning");
    const verify = body.figures.flatMap((figure) => figure.verify);
    expect(verify.length).toBeGreaterThan(0);
    for (const entry of verify) {
      expect(entry).toEqual(
        expect.objectContaining({ status: "not-run", reason: "repo not provided", exitCode: null }),
      );
    }
  });

  test("sends the dev Access JWT only to a local remote", async () => {
    // Given
    const remote = stub((request) => publishResults(request));
    const credentials = { clientId, clientSecret: secret };
    const env = { VISUAL_ATLAS_DEV_JWT: "dev.jwt.value" };
    // When
    const result = await runCli(publishArgs(atlasCopy(), remote.url), childEnv(validHome(), env));
    // Then
    expect(result.code).toBe(0);
    expect(remote.requests[0]?.headers.get("cf-access-jwt-assertion")).toBe("dev.jwt.value");
    expect(accessHeaders(new URL("http://localhost:8787"), credentials, env)).toHaveProperty(
      "Cf-Access-Jwt-Assertion",
      "dev.jwt.value",
    );
    expect(
      accessHeaders(new URL("https://atlas.iyendev.com"), credentials, env),
    ).not.toHaveProperty("Cf-Access-Jwt-Assertion");
  });

  test("a conflict outcome exits 3 after printing every outcome", async () => {
    // Given
    const remote = stub((request) => publishResults(request, "vl-02-export-series"));
    // When
    const result = await runCli(publishArgs(atlasCopy(), remote.url), childEnv(validHome()));
    // Then
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("created vl-01-architecture cas-1");
    expect(result.stdout).toContain("conflict vl-02-export-series cas-1");
    expect(result.stderr).toContain("publish conflict for vl-02-export-series");
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
  });

  test("rejects credentials that are missing, not 0600, or malformed before any request", async () => {
    // Given
    const remote = stub((request) => publishResults(request));
    const root = atlasCopy();
    const cases = [
      { home: temporary("visual-learning-home-"), message: "no publish credentials" },
      {
        home: homeWithCredentials(JSON.stringify({ clientId, clientSecret: secret }), 0o644),
        message: "credentials file must have mode 0600, found 0644",
      },
      {
        home: homeWithCredentials(`{"clientId": "${clientId}", "clientSecret": ${secret}`),
        message: "malformed credentials JSON",
      },
      {
        home: homeWithCredentials(JSON.stringify({ clientId, clientSecret: 42 })),
        message: "credentials file needs string clientId and clientSecret",
      },
    ];
    for (const { home, message } of cases) {
      // When
      const result = await runCli(publishArgs(root, remote.url), childEnv(home));
      // Then
      expect(result.code).toBe(2);
      expect(result.stderr).toContain(message);
      expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    }
    expect(remote.requests).toHaveLength(0);
  });

  test("environment credentials win and must be supplied as a pair", () => {
    // Given
    const home = temporary("visual-learning-home-");
    // When
    const credentials = loadCredentials({
      HOME: home,
      VISUAL_ATLAS_CLIENT_ID: clientId,
      VISUAL_ATLAS_CLIENT_SECRET: secret,
    });
    // Then
    expect(credentials).toEqual({ clientId, clientSecret: secret });
    expect(() => loadCredentials({ HOME: home, VISUAL_ATLAS_CLIENT_ID: clientId })).toThrow(
      InputError,
    );
  });

  test("an Access login redirect is an auth error and foreign redirects are never followed", async () => {
    // Given
    const elsewhere = stub(() => Response.json({ results: [] }));
    const access = stub(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://team.cloudflareaccess.com/cdn-cgi/access/login" },
        }),
    );
    const foreign = stub(
      () =>
        new Response(null, { status: 302, headers: { location: `${elsewhere.url}/api/publish` } }),
    );
    const root = atlasCopy();
    const env = childEnv(validHome());
    // When
    const accessResult = await runCli(publishArgs(root, access.url), env);
    const foreignResult = await runCli(publishArgs(root, foreign.url), env);
    // Then
    expect(accessResult.code).toBe(4);
    expect(accessResult.stderr).toContain(
      "remote requires Access authentication; check service token",
    );
    expect(foreignResult.code).toBe(4);
    expect(foreignResult.stderr).toContain("redirect 302; not following");
    expect(elsewhere.requests).toHaveLength(0);
    expect(`${accessResult.stderr}${foreignResult.stderr}`).not.toContain(secret);
  });

  test("remote error messages are redacted before they are printed", async () => {
    // Given
    const remote = stub(() =>
      Response.json(
        { error: { code: "forbidden", message: `rejected secret ${secret}` } },
        { status: 403 },
      ),
    );
    // When
    const result = await runCli(publishArgs(atlasCopy(), remote.url), childEnv(validHome()));
    // Then
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("403: forbidden: rejected secret ***");
    expect(result.stderr).not.toContain(secret);
  });

  test("a success response echoing the secret as artifactId exits non-zero without printing it", async () => {
    // Given: the independent verifier's repro, with environment credentials
    const remote = stub(() =>
      Response.json({
        results: [
          {
            artifactId: secret,
            outcome: "created",
            token: "cas-1",
            deprecatedAnchors: [],
            orphanedNotes: [],
          },
        ],
      }),
    );
    const env = childEnv(temporary("visual-learning-home-"), {
      VISUAL_ATLAS_CLIENT_ID: "fake-client",
      VISUAL_ATLAS_CLIENT_SECRET: secret,
    });
    // When
    const result = await runCli(publishArgs(atlasCopy(), remote.url), env);
    // Then
    expect(result.code).toBe(4);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("visual-note: remote returned an invalid publish response\n");
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
  });

  test("rejects unknown, duplicated, or missing artifacts and malformed fields without echoing the body", async () => {
    // Given
    const root = atlasCopy();
    const env = childEnv(validHome());
    const valid = (artifactId: string) => ({
      artifactId,
      outcome: "created",
      token: "cas-1",
      deprecatedAnchors: [],
      orphanedNotes: [],
    });
    const first = valid("vl-01-architecture");
    const second = valid("vl-02-export-series");
    const cases: Record<string, unknown[]> = {
      unknownArtifact: [first, second, valid("vl-99-unknown")],
      duplicatedArtifact: [first, second, first],
      missingArtifact: [first],
      badToken: [first, { ...second, token: "etag-1" }],
      badOutcome: [first, { ...second, outcome: "deleted" }],
      badAnchor: [first, { ...second, deprecatedAnchors: ["../escape"] }],
      badOrphan: [first, { ...second, orphanedNotes: [42] }],
    };
    for (const [name, results] of Object.entries(cases)) {
      const remote = stub(() => Response.json({ results, echo: `body-marker-${name}` }));
      // When
      const result = await runCli(publishArgs(root, remote.url), env);
      // Then
      expect({ name, code: result.code, stdout: result.stdout, stderr: result.stderr }).toEqual({
        name,
        code: 4,
        stdout: "",
        stderr: "visual-note: remote returned an invalid publish response\n",
      });
    }
  });

  test("printed server fields pass through the credential redactor", async () => {
    // Given: id-shaped fields that happen to equal the secret and the client id's secret part
    const remote = stub((request) => {
      const payload = JSON.parse(request.body) as { figures: Figure[] };
      return Response.json({
        results: payload.figures.map((figure) => ({
          artifactId: figure.spec.artifactId,
          outcome: "refreshed",
          token: "cas-2",
          deprecatedAnchors: [secret],
          orphanedNotes: ["test-client"],
        })),
      });
    });
    // When
    const text = await runCli(publishArgs(atlasCopy(), remote.url), childEnv(validHome()));
    const json = await runCli(
      [...publishArgs(atlasCopy(), remote.url), "--json"],
      childEnv(validHome()),
    );
    // Then
    expect(text.code).toBe(0);
    expect(text.stdout).toContain(
      "refreshed vl-01-architecture cas-2 deprecatedAnchors=*** orphanedNotes=***\n",
    );
    expect(json.code).toBe(0);
    expect(json.stdout).toContain('"deprecatedAnchors":["***"]');
    for (const output of [text, json]) {
      expect(`${output.stdout}${output.stderr}`).not.toContain(secret);
      expect(`${output.stdout}${output.stderr}`).not.toContain("test-client");
    }
  });

  test("--repo-root records verify output with repo paths scrubbed and blocks other leaks", async () => {
    // Given
    const remote = stub((request) => publishResults(request));
    const repo = temporary("visual-learning-repo-");
    mkdirSync(join(repo, "bin"));
    writeFileSync(join(repo, "bin/visual-note"), `#!/bin/sh\nexec bun ${repo}/src/cli.ts\n`);
    const env = { HOME: validHome() };
    const input = {
      root: atlasCopy(),
      project: "visual-learning",
      artifacts: ["vl-01-architecture"],
      repoRoot: repo,
      remote: remote.url,
      env,
    };
    // When
    await publish(input);
    writeFileSync(join(repo, "bin/visual-note"), "exec bun /Users/someone-else/cli.ts\n");
    const leak = publish(input);
    // Then
    const body = remote.requests[0]?.body ?? "";
    const [figure] = (JSON.parse(body) as { figures: Figure[] }).figures;
    expect(figure?.verify[0]).toEqual(
      expect.objectContaining({
        status: "ran",
        exitCode: 0,
        stdout: "2:exec bun visual-learning/src/cli.ts\n",
      }),
    );
    expect(body).not.toContain(repo);
    await expect(leak).rejects.toThrow(
      "absolute local path /Users/ remains at $.figures[0].verify[0].stdout",
    );
    expect(remote.requests).toHaveLength(1);
  });
});

describe("remote client pull", () => {
  test("writes the export once, re-pulls identically, and never overwrites changes", async () => {
    // Given
    let noteBody = "first memo";
    const remote = stub(() => Response.json({ figures: exportFigures(noteBody) }));
    const out = temporary("visual-learning-pull-");
    const args = ["pull", "--project", "visual-learning", "--out", out, "--remote", remote.url];
    const env = childEnv(validHome());
    const drawing = join(out, "visual-learning/vl-01-architecture.excalidraw.md");
    const note = join(out, "visual-learning/notes/vl-01-architecture.json");
    // When
    const first = await runCli([...args, "--json"], env);
    const again = await runCli([...args, "--json"], env);
    noteBody = "server memo changed";
    const remoteChanged = await runCli(args, env);
    const noteAfterRemoteChange = readFileSync(note, "utf8");
    noteBody = "first memo";
    writeFileSync(drawing, "local human edit\n");
    const localChanged = await runCli(args, env);
    // Then
    expect(first.code).toBe(0);
    expect(JSON.parse(first.stdout)).toEqual(
      expect.objectContaining({ project: "visual-learning", figures: 2, unchanged: [] }),
    );
    expect((JSON.parse(first.stdout) as { written: string[] }).written).toHaveLength(8);
    const [figure] = exportFigures("first memo") as {
      scene: Parameters<typeof encodeSceneToMarkdown>[0];
      spec: unknown;
    }[];
    if (figure === undefined) throw new TypeError("export must have figures");
    expect(noteAfterRemoteChange).toBe(
      jsonBytes([{ nodeKey: "_figure", body: "first memo", token: "cas-1", orphaned: false }]),
    );
    expect(readFileSync(join(out, "visual-learning/specs/vl-01-architecture.json"), "utf8")).toBe(
      jsonBytes(figure.spec),
    );
    expect(existsSync(join(out, "visual-learning/verify/vl-02-export-series.json"))).toBe(true);
    expect(again.code).toBe(0);
    expect(JSON.parse(again.stdout)).toEqual(expect.objectContaining({ written: [] }));
    expect(remoteChanged.code).toBe(3);
    expect(remoteChanged.stderr).toContain(
      "refusing dirty target collision: visual-learning/notes/vl-01-architecture.json",
    );
    expect(localChanged.code).toBe(3);
    expect(readFileSync(drawing, "utf8")).toBe("local human edit\n");
    expect(encodeSceneToMarkdown(figure.scene)).not.toBe("local human edit\n");
    expect(`${first.stdout}${first.stderr}${localChanged.stderr}`).not.toContain(secret);
    expect(remote.requests[0]?.path).toBe("/api/projects/visual-learning/export");
    expect(remote.requests[0]?.headers.get("cf-access-client-secret")).toBe(secret);
  });

  test("rejects an export with a traversal, non-slug, or duplicated artifact id and writes nothing", async () => {
    // Given
    const [figure] = exportFigures("x") as object[];
    const cases: Record<string, unknown[]> = {
      parentTraversal: [{ ...figure, artifactId: "../x" }],
      nestedTraversal: [{ ...figure, artifactId: "vl-01/../../escape" }],
      notSlug: [{ ...figure, artifactId: secret.toUpperCase() }],
      duplicated: [figure, figure],
    };
    const env = childEnv(validHome());
    for (const [name, figures] of Object.entries(cases)) {
      const remote = stub(() => Response.json({ figures }));
      const out = temporary("visual-learning-pull-");
      // When
      const result = await runCli(
        ["pull", "--project", "visual-learning", "--out", out, "--remote", remote.url],
        env,
      );
      // Then
      expect({ name, code: result.code, stdout: result.stdout, stderr: result.stderr }).toEqual({
        name,
        code: 4,
        stdout: "",
        stderr: "visual-note: remote returned an invalid export response\n",
      });
      expect(readdirSync(out)).toEqual([]);
    }
  });
});
