import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { CollisionError, InputError, RuntimeError } from "./errors";
import { type ExcalidrawScene, encodeSceneToMarkdown, type JsonObject } from "./excalidraw-file";
import { jsonBytes } from "./io";
import { ensureRealDirectory } from "./path-guard";
import { buildPublishPayload, type PublishPayload } from "./remote-payload";
import { safeCreateFile, safeMakeDirectories } from "./safe-path";
import type { VisualNoteSpec } from "./schema";
import { recordVerify } from "./verify-record";

export const defaultRemote = "https://atlas.iyendev.com";

export type Environment = Readonly<Record<string, string | undefined>>;
export type Credentials = { readonly clientId: string; readonly clientSecret: string };

// Same rule as the spec schema's artifactId and semanticId.
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Excalidraw element ids (e.g. "cB-U56FQ") and note keys (e.g. "_figure"); a superset of slug.
const elementId = /^[A-Za-z0-9_-]{1,128}$/;
const leakPattern = /\/Users\/|\/home\/|\/private\/var\//;
const localHosts = new Set(["127.0.0.1", "localhost"]);
const requestTimeoutMs = 60_000;
const invalidPublishResponse = "remote returned an invalid publish response";
const invalidExportResponse = "remote returned an invalid export response";
const credentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});
const publishResultSchema = z.object({
  artifactId: z.string().regex(slug),
  outcome: z.enum(["created", "refreshed", "conflict"]),
  token: z.string().regex(/^cas-\d+$/),
  deprecatedAnchors: z.array(z.string().regex(elementId)),
  orphanedNotes: z.array(z.string().regex(elementId)),
});
const exportResponseSchema = z
  .object({
    figures: z.array(
      z.object({
        artifactId: z.string().regex(slug),
        spec: z.record(z.string(), z.unknown()),
        scene: z.looseObject({ elements: z.array(z.unknown()) }),
        notes: z.array(z.unknown()),
        verify: z.array(z.unknown()),
      }),
    ),
  })
  .refine(
    ({ figures }) => new Set(figures.map((figure) => figure.artifactId)).size === figures.length,
  );

export type PublishResult = z.infer<typeof publishResultSchema>;

// Results must answer every sent artifact exactly once and name nothing else.
function publishResponseSchema(sent: readonly string[]) {
  return z.object({ results: z.array(publishResultSchema) }).refine(({ results }) => {
    const answered = new Set(results.map((result) => result.artifactId));
    return (
      results.length === sent.length &&
      answered.size === results.length &&
      sent.every((artifactId) => answered.has(artifactId))
    );
  });
}

// Masks the client secret and, for "<part>.access" client ids, the id's secret part.
export function credentialRedactor(credentials: Credentials): (text: string) => string {
  const idPart = /^(.+)\.access$/.exec(credentials.clientId)?.[1];
  const secrets = [credentials.clientSecret, ...(idPart === undefined ? [] : [idPart])].sort(
    (left, right) => right.length - left.length,
  );
  return (text) => secrets.reduce((current, secret) => current.split(secret).join("***"), text);
}

export function parseRemote(remote: string): URL {
  let url: URL;
  try {
    url = new URL(remote);
  } catch {
    throw new InputError(`invalid --remote URL: ${remote}`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new InputError("--remote must not embed credentials");
  }
  const local = localHosts.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new InputError("--remote must use https unless the host is 127.0.0.1 or localhost");
  }
  return url;
}

export function loadCredentials(env: Environment): Credentials {
  const clientId = env["VISUAL_ATLAS_CLIENT_ID"];
  const clientSecret = env["VISUAL_ATLAS_CLIENT_SECRET"];
  if (clientId && clientSecret) return { clientId, clientSecret };
  if (clientId || clientSecret) {
    throw new InputError(
      "set both VISUAL_ATLAS_CLIENT_ID and VISUAL_ATLAS_CLIENT_SECRET, or neither",
    );
  }
  const home = env["HOME"];
  if (!home) throw new InputError("HOME is not set; cannot locate the credentials file");
  const path = join(home, ".config", "visual-atlas", "credentials.json");
  let status: ReturnType<typeof lstatSync>;
  try {
    status = lstatSync(path);
  } catch {
    throw new InputError(
      `no publish credentials: set VISUAL_ATLAS_CLIENT_ID and VISUAL_ATLAS_CLIENT_SECRET or create ${path} (mode 0600)`,
    );
  }
  if (!status.isFile()) throw new InputError(`credentials file must be a regular file: ${path}`);
  const mode = status.mode & 0o777;
  if (mode !== 0o600) {
    throw new InputError(
      `credentials file must have mode 0600, found 0${mode.toString(8)}: ${path}`,
    );
  }
  // Parse errors can quote file content, so neither they nor the value reach the message.
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new InputError(`malformed credentials JSON: ${path}`);
  }
  const credentials = credentialsSchema.safeParse(parsed);
  if (!credentials.success) {
    throw new InputError(`credentials file needs string clientId and clientSecret: ${path}`);
  }
  return credentials.data;
}

export function accessHeaders(
  remote: URL,
  credentials: Credentials,
  env: Environment,
): Record<string, string> {
  const headers: Record<string, string> = {
    "CF-Access-Client-Id": credentials.clientId,
    "CF-Access-Client-Secret": credentials.clientSecret,
  };
  const devJwt = env["VISUAL_ATLAS_DEV_JWT"];
  if (localHosts.has(remote.hostname) && devJwt) headers["Cf-Access-Jwt-Assertion"] = devJwt;
  return headers;
}

function remoteErrorDetail(text: string): string {
  try {
    const body: unknown = JSON.parse(text);
    const error = z
      .object({ error: z.object({ code: z.string(), message: z.string() }) })
      .safeParse(body);
    if (error.success) return `${error.data.error.code}: ${error.data.error.message}`;
  } catch {
    // Not a JSON error envelope; report the status only.
  }
  return "unexpected response";
}

async function request(
  remote: URL,
  path: string,
  credentials: Credentials,
  env: Environment,
  body?: string,
): Promise<unknown> {
  const url = new URL(path, remote);
  const method = body === undefined ? "GET" : "POST";
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...accessHeaders(remote, credentials, env),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body }),
      redirect: "manual",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new RuntimeError(
      timedOut
        ? `remote ${remote.origin} did not answer within ${requestTimeoutMs / 1000}s`
        : `cannot reach remote ${remote.origin}`,
    );
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    let host = "";
    try {
      host = new URL(response.headers.get("location") ?? "", url).hostname;
    } catch {
      // An unparseable Location is treated like any other foreign redirect.
    }
    if (host === "cloudflareaccess.com" || host.endsWith(".cloudflareaccess.com")) {
      throw new RuntimeError("remote requires Access authentication; check service token");
    }
    throw new RuntimeError(
      `remote answered ${method} ${path} with redirect ${response.status}; not following`,
    );
  }
  const text = await response.text();
  if (!response.ok) {
    throw new RuntimeError(
      credentialRedactor(credentials)(
        `remote ${method} ${path} failed with ${response.status}: ${remoteErrorDetail(text)}`,
      ).slice(0, 500),
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RuntimeError(`remote ${method} ${path} returned invalid JSON`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Mirrors the remote-payload scrub: longest prefix first, whole path components only.
function scrubVerify(
  value: unknown,
  path: string,
  replacements: ReadonlyMap<string, string>,
): unknown {
  const rules = [...replacements.keys()]
    .filter((prefix) => prefix.length > 1)
    .sort((left, right) => right.length - left.length);
  const pattern =
    rules.length === 0
      ? null
      : new RegExp(`(?:${rules.map(escapeRegExp).join("|")})(?![A-Za-z0-9._-])`, "g");
  const scrub = (text: string, at: string): string => {
    const scrubbed =
      pattern === null
        ? text
        : text.replace(pattern, (prefix) => replacements.get(prefix) ?? prefix);
    const leak = leakPattern.exec(scrubbed);
    if (leak !== null) throw new InputError(`absolute local path ${leak[0]} remains at ${at}`);
    return scrubbed;
  };
  const walk = (item: unknown, at: string): unknown => {
    if (typeof item === "string") return scrub(item, at);
    if (Array.isArray(item)) return item.map((entry, index) => walk(entry, `${at}[${index}]`));
    if (typeof item === "object" && item !== null) {
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [
          scrub(key, `${at}.${key}<key>`),
          walk(entry, `${at}.${key}`),
        ]),
      );
    }
    return item;
  };
  return walk(value, path);
}

function notRunVerify(spec: VisualNoteSpec): JsonObject[] {
  const ranAt = new Date().toISOString();
  return (spec.learning?.verify ?? []).map((step, index) => ({
    index,
    semanticId: String(step.semanticId),
    how: step.how,
    command: step.command ?? null,
    status: "not-run",
    reason: "repo not provided",
    exitCode: null,
    stdout: "",
    stderr: "",
    commit: null,
    ranAt,
  }));
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export async function attachVerify(
  payload: PublishPayload,
  input: { readonly root: string; readonly repoRoot?: string; readonly env: Environment },
): Promise<PublishPayload> {
  const replacements = new Map<string, string>();
  for (const home of [process.env["HOME"], input.env["HOME"]]) {
    if (home) replacements.set(resolve(home), "~");
  }
  const root = resolve(input.root);
  replacements.set(root, "~");
  replacements.set(realpathOrSelf(root), "~");
  if (input.repoRoot !== undefined) {
    replacements.set(input.repoRoot, payload.repoName);
    replacements.set(realpathOrSelf(input.repoRoot), payload.repoName);
  }
  const figures = [];
  for (const [index, figure] of payload.figures.entries()) {
    const verify =
      input.repoRoot === undefined
        ? notRunVerify(figure.spec)
        : await recordVerify(figure.spec, input.repoRoot);
    figures.push({
      ...figure,
      verify: scrubVerify(verify, `$.figures[${index}].verify`, replacements) as JsonObject[],
    });
  }
  return { ...payload, figures };
}

export async function publish(input: {
  readonly root: string;
  readonly project: string;
  readonly artifacts?: readonly string[];
  readonly repoRoot?: string;
  readonly remote: string;
  readonly env: Environment;
  readonly credentials?: Credentials;
}): Promise<{ readonly projectId: string; readonly results: PublishResult[] }> {
  const remote = parseRemote(input.remote);
  const credentials = input.credentials ?? loadCredentials(input.env);
  const payload = await attachVerify(
    buildPublishPayload({
      root: input.root,
      project: input.project,
      ...(input.artifacts === undefined ? {} : { artifacts: input.artifacts }),
    }),
    {
      root: input.root,
      env: input.env,
      ...(input.repoRoot === undefined ? {} : { repoRoot: input.repoRoot }),
    },
  );
  const sent = payload.figures.map((figure) => String(figure.spec.artifactId));
  const response = publishResponseSchema(sent).safeParse(
    await request(remote, "/api/publish", credentials, input.env, JSON.stringify(payload)),
  );
  // The body is server-controlled, so neither it nor the zod issues reach the message.
  if (!response.success) throw new RuntimeError(invalidPublishResponse);
  return { projectId: payload.projectId, results: response.data.results };
}

type PulledFile = { readonly path: string; readonly bytes: string };

function existingBytes(out: string, relativePath: string): string | null {
  const path = join(out, relativePath);
  let status: ReturnType<typeof lstatSync>;
  try {
    status = lstatSync(path);
  } catch {
    return null;
  }
  if (!status.isFile()) throw new CollisionError(relativePath);
  return readFileSync(path, "utf8");
}

export async function pull(input: {
  readonly project: string;
  readonly out: string;
  readonly remote: string;
  readonly env: Environment;
  readonly credentials?: Credentials;
}): Promise<{
  readonly project: string;
  readonly figures: number;
  readonly written: string[];
  readonly unchanged: string[];
}> {
  if (!slug.test(input.project)) throw new InputError(`invalid project slug: ${input.project}`);
  const out = ensureRealDirectory(input.out, "--out");
  const remote = parseRemote(input.remote);
  const credentials = input.credentials ?? loadCredentials(input.env);
  const response = exportResponseSchema.safeParse(
    await request(remote, `/api/projects/${input.project}/export`, credentials, input.env),
  );
  if (!response.success) throw new RuntimeError(invalidExportResponse);
  const project = input.project;
  const projectRoot = resolve(out, project);
  const files: PulledFile[] = [];
  for (const figure of response.data.figures) {
    const id = figure.artifactId;
    files.push(
      {
        path: `${project}/${id}.excalidraw.md`,
        bytes: encodeSceneToMarkdown(figure.scene as ExcalidrawScene),
      },
      { path: `${project}/specs/${id}.json`, bytes: jsonBytes(figure.spec) },
      { path: `${project}/notes/${id}.json`, bytes: jsonBytes(figure.notes) },
      { path: `${project}/verify/${id}.json`, bytes: jsonBytes(figure.verify) },
    );
  }
  // Defense in depth behind the slug rule: nothing lands outside <out>/<project>/.
  if (files.some((file) => !resolve(out, file.path).startsWith(`${projectRoot}${sep}`))) {
    throw new RuntimeError(invalidExportResponse);
  }
  for (const folder of ["specs", "notes", "verify"])
    safeMakeDirectories(out, `${project}/${folder}`);
  // Check every target before writing any, so a collision leaves the tree as it was.
  const written: string[] = [];
  const unchanged: string[] = [];
  for (const file of files) {
    const current = existingBytes(out, file.path);
    if (current === null) written.push(file.path);
    else if (current === file.bytes) unchanged.push(file.path);
    else throw new CollisionError(file.path);
  }
  for (const file of files) {
    if (written.includes(file.path)) safeCreateFile(out, file.path, file.bytes);
  }
  return { project, figures: response.data.figures.length, written, unchanged };
}
