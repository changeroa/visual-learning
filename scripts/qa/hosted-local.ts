// Local end-to-end run of the hosted atlas against workerd (plan todo 12).
//
//   bun scripts/qa/hosted-local.ts [--atlas <dir>] [--repo-root <dir>] [--keep <dir>]
//
// Resets hosted/.wrangler, applies the D1 migrations locally, builds the web app, and starts
// `bun run dev:hosted` in its own process group. It then drives the real CLI and API:
//   1. publish a temp copy of <atlas>/docs/vl/projects/visual-learning -> 6 created
//   2. human-save a rectangle, a bound arrow, and a duplicated agent element; add a node note
//   3. re-publish a modified spec (one label changed, one human-referenced node removed)
//   4. race a human save against a publish from the same base token -> exactly one wins
//   5. pull twice (the second pull is a no-op)
//   6. scripts/qa/hosted-ui.ts against the same Worker
// The CLI runs with a temp HOME holding a dummy 0600 credentials file, so the real
// ~/.config/visual-atlas/credentials.json is never read; auth is a test JWT signed by
// tests/fixtures/hosted/test-access-key.json (see scripts/qa/hosted-dev-auth.ts).
// Every step asserts on parsed output; the run prints HOSTED_LOCAL_OK and exits 0 only when all
// pass. The dev server group, the race proxy, and every temp dir are torn down on exit or signal.
import { type ChildProcess, spawn } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseVisualNoteSpec } from "../../src/schema";

type Json = Record<string, unknown>;
type SceneElement = { id: string; customData?: Json; [key: string]: unknown };
type Scene = { elements: SceneElement[]; [key: string]: unknown };
type Note = { nodeKey: string; body: string; token: string; orphaned: boolean };
type Figure = {
  spec: Json & { nodes: { semanticId: string; label: string }[] };
  scene: Scene;
  token: string;
  deprecatedAnchors: string[];
  notes: Note[];
};
type PublishOutput = {
  projectId: string;
  results: {
    artifactId: string;
    outcome: string;
    token: string;
    deprecatedAnchors: string[];
    orphanedNotes: string[];
  }[];
};
type Run = { exitCode: number; stdout: string; stderr: string };

const repoRoot = resolve(import.meta.dir, "../..");
const project = "visual-learning";
const artifact = "vl-03-cas-refresh";
const port = 8787;
const base = `http://127.0.0.1:${port}`;
const readyTimeoutMs = 120_000;
const commandTimeoutMs = 180_000;
const maxRaceRounds = 20;
// vl-03 ids are stableElementId(artifact, semanticId, role); the run asserts they exist.
const removedNode = "restore-transaction";
const removedShapeId = "Hm_X3hD7";
const removedLabelId = "CasRSrB8";
const duplicatedSourceId = "4sXQCKPC";
const editedNode = "cas-token";
const editedLabel = "nextToken\n재사용 금지";

const { values: args } = parseArgs({
  options: {
    atlas: { type: "string", default: "/Users/victor/Documents/Victor Dev Atlas" },
    "repo-root": { type: "string", default: "/Users/victor/projects/visual-learning" },
    keep: { type: "string" },
  },
});
const atlas = resolve(args.atlas);
const verifyRepo = resolve(args["repo-root"]);
const atlasProject = join(atlas, "docs/vl/projects", project);
const realCredentials = join(process.env["HOME"] ?? "", ".config/visual-atlas/credentials.json");
const stateDir = join(repoRoot, "hosted/.wrangler");

const tempDirs: string[] = [];
let server: ChildProcess | null = null;
let serverLog = "";
let proxy: ReturnType<typeof Bun.serve> | null = null;
let passed = 0;
// Every running command child; each leads its own process group so teardown can stop helpers
// it spawned (a CLI child with HOME=<temp home> must not outlive the temp HOME).
const children = new Set<{ readonly pid: number; readonly exited: Promise<number> }>();
let tearingDown = false;

function temp(label: string): string {
  if (tearingDown) throw new Error("tearing down; no new temp dirs");
  // realpath: macOS tmpdir sits behind the /var symlink, which pull's --out guard rejects.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `hosted-local-${label}-`)));
  tempDirs.push(dir);
  return dir;
}

function assert(ok: boolean, name: string, detail = ""): void {
  const line = `${ok ? "PASS" : "FAIL"} ${name}${detail.length > 0 ? ` - ${detail}` : ""}`;
  console.log(line);
  if (!ok) throw new Error(`assertion failed: ${name}${detail.length > 0 ? ` (${detail})` : ""}`);
  passed += 1;
}

async function run(command: string[], env: Record<string, string>, stdin?: string): Promise<Run> {
  if (tearingDown) throw new Error(`tearing down; not starting ${command.join(" ")}`);
  const child = Bun.spawn(command, {
    cwd: repoRoot,
    env,
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
    timeout: commandTimeoutMs,
    killSignal: "SIGKILL",
    detached: true,
  });
  children.add(child);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    children.delete(child);
  }
}

// Parses a --json command's stdout; a missing or broken document fails with the command's stderr.
function parsed<T>(result: Run, label: string): T {
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(
      `${label}: exit ${result.exitCode}, no JSON on stdout; stderr: ${result.stderr}`,
    );
  }
}

function listeners(): string {
  const result = Bun.spawnSync(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return result.stdout.toString().trim();
}

// Recursive size+mtime+sha256 fingerprint of a tree; files are hashed, never modified.
function fingerprint(root: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const status = statSync(path);
        hasher.update(`${path}\0${status.size}\0${status.mtimeMs}\0`);
        hasher.update(readFileSync(path));
      }
    }
  };
  walk(root);
  return hasher.digest("hex");
}

// lstat only: the real credentials file must not even be opened by this run.
function credentialsStat(): string {
  if (!existsSync(realCredentials)) return "absent";
  const status = lstatSync(realCredentials);
  return `${status.ino}:${status.size}:${status.mtimeMs}:${(status.mode & 0o777).toString(8)}`;
}

function stopServer(): void {
  const child = server;
  server = null;
  if (child?.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // The group already exited.
  }
}

async function waitForServerExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout("timeout"), 10_000);
  });
  const outcome = await Promise.race([exited, timeout]);
  clearTimeout(timer);
  if (outcome === "timeout" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // The group exited between the timeout and the kill.
    }
    await exited;
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group already exited.
  }
}

async function waitForChildExit(child: { readonly pid: number; readonly exited: Promise<number> }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout("timeout"), 10_000);
  });
  const outcome = await Promise.race([child.exited, timeout]);
  clearTimeout(timer);
  if (outcome === "timeout") {
    signalGroup(child.pid, "SIGKILL");
    await child.exited;
  }
}

// Stops the proxy, the dev server group, and every command child's group; waits for them to
// exit, SIGKILLs any helper still in those groups, and only then removes the temp dirs, so no
// child can recreate a temp dir (for example a temp HOME cache) after it is deleted.
async function teardown(): Promise<void> {
  tearingDown = true;
  proxy?.stop(true);
  proxy = null;
  const running = [...children];
  for (const child of running) signalGroup(child.pid, "SIGTERM");
  const serverChild = server;
  stopServer();
  await Promise.all([
    ...running.map((child) => waitForChildExit(child)),
    serverChild === null ? Promise.resolve() : waitForServerExit(serverChild),
  ]);
  for (const child of running) signalGroup(child.pid, "SIGKILL");
  if (serverChild?.pid !== undefined) signalGroup(serverChild.pid, "SIGKILL");
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

let signalTeardown: Promise<void> | null = null;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    if (signalTeardown !== null) return;
    console.error(`hosted-local: ${signal} received; tearing down`);
    signalTeardown = teardown().then(
      () => process.exit(130),
      (error: unknown) => {
        console.error(`hosted-local: teardown after ${signal} failed: ${String(error)}`);
        process.exit(1);
      },
    );
  });
}

async function startServer(): Promise<void> {
  const child = spawn("bun", ["run", "dev:hosted"], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  server = child;
  const ready = new Promise<void>((resolveReady, rejectReady) => {
    const onData = (chunk: Buffer): void => {
      serverLog += chunk.toString();
      if (/Ready on http:\/\/(?:127\.0\.0\.1|localhost):8787/.test(serverLog)) resolveReady();
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code, signal) =>
      rejectReady(new Error(`dev server exited early (code ${code}, signal ${signal})`)),
    );
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rejectTimeout) => {
    timer = setTimeout(
      () => rejectTimeout(new Error(`dev server not ready within ${readyTimeoutMs}ms`)),
      readyTimeoutMs,
    );
  });
  try {
    await Promise.race([ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function mintJwts(): Promise<{ user: string; service: string }> {
  const minted = await run(["bun", "scripts/qa/hosted-dev-auth.ts"], {
    PATH: process.env["PATH"] ?? "",
  });
  const user = /^export CF_AUTHORIZATION=(\S+)$/m.exec(minted.stdout)?.[1];
  const service = /^export VISUAL_ATLAS_DEV_JWT=(\S+)$/m.exec(minted.stdout)?.[1];
  if (minted.exitCode !== 0 || user === undefined || service === undefined)
    throw new Error(`hosted-dev-auth failed: ${minted.exitCode} ${minted.stderr}`);
  return { user, service };
}

function rectangle(id: string, x: number, y: number, bound: Json[]): SceneElement {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 220,
    height: 120,
    angle: 0,
    strokeColor: "#e03131",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: 1207,
    version: 1,
    versionNonce: 1207,
    isDeleted: false,
    boundElements: bound,
    updated: 1_790_000_000_000,
    link: null,
    locked: false,
  };
}

function arrow(id: string, from: SceneElement, to: SceneElement): SceneElement {
  const x = Number(from["x"]) + 220;
  const y = Number(from["y"]) + 60;
  return {
    ...rectangle(id, x, y, []),
    type: "arrow",
    width: Number(to["x"]) - x,
    height: Number(to["y"]) - y,
    boundElements: null,
    points: [
      [0, 0],
      [Number(to["x"]) - x, Number(to["y"]) - y],
    ],
    startBinding: { elementId: from.id, focus: 0, gap: 4 },
    endBinding: { elementId: to.id, focus: 0, gap: 4 },
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
  };
}

function byId(scene: Scene): Map<string, SceneElement> {
  return new Map(scene.elements.map((element) => [element.id, element]));
}

function humanBytes(scene: Scene): Map<string, string> {
  return new Map(
    scene.elements
      .filter((element) => element.customData?.["owner"] !== "agent")
      .map((element) => [element.id, JSON.stringify(element)]),
  );
}

function sameBytes(left: Map<string, string>, right: Map<string, string>): boolean {
  return left.size === right.size && [...left].every(([id, bytes]) => right.get(id) === bytes);
}

function counter(token: string): number {
  const match = /^cas-(\d+)$/.exec(token);
  if (match?.[1] === undefined) throw new Error(`not a figure token: ${token}`);
  return Number(match[1]);
}

async function main(): Promise<void> {
  if (!existsSync(join(atlasProject, "manifest.json")))
    throw new Error(`atlas project not found: ${atlasProject} (pass --atlas)`);
  if (!existsSync(join(verifyRepo, "src")))
    throw new Error(`--repo-root has no src: ${verifyRepo}`);
  const atlasBefore = fingerprint(atlasProject);
  const credentialsBefore = credentialsStat();
  assert(listeners() === "", `port ${port} is free before the run`, listeners());

  const pathEnv = { PATH: process.env["PATH"] ?? "" };
  rmSync(stateDir, { recursive: true, force: true });
  const migrate = await run(
    [
      "bunx",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "visual-atlas",
      "--local",
      "--config",
      "hosted/wrangler.jsonc",
      "--env",
      "local",
    ],
    { ...pathEnv, HOME: process.env["HOME"] ?? "", WRANGLER_SEND_METRICS: "false" },
    "",
  );
  assert(
    migrate.exitCode === 0 && /0001_init\.sql/.test(migrate.stdout + migrate.stderr),
    "fresh local D1 state migrated (0001_init.sql applied)",
    `exit ${migrate.exitCode}`,
  );
  const build = await run(["bun", "run", "build:web"], {
    ...pathEnv,
    HOME: process.env["HOME"] ?? "",
  });
  assert(build.exitCode === 0, "web app built into hosted/dist", `exit ${build.exitCode}`);

  const jwts = await mintJwts();
  const home = temp("home");
  mkdirSync(join(home, ".config/visual-atlas"), { recursive: true });
  const dummy = join(home, ".config/visual-atlas/credentials.json");
  writeFileSync(
    dummy,
    `${JSON.stringify({ clientId: "hosted-local-dummy.access", clientSecret: "hosted-local-dummy" })}\n`,
  );
  chmodSync(dummy, 0o600);
  const cliEnv = { ...pathEnv, HOME: home, VISUAL_ATLAS_DEV_JWT: jwts.service };
  const cli = (argv: string[]): Promise<Run> =>
    run([join(repoRoot, "bin/visual-note"), ...argv], cliEnv);

  await startServer();
  console.log(`dev server ready on ${base} (pid group ${server?.pid})`);

  const api = async (method: string, path: string, body?: unknown, jwt = jwts.user) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "cf-access-jwt-assertion": jwt, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Json };
  };
  const figure = async (): Promise<Figure> => {
    const response = await api("GET", `/api/projects/${project}/figures/${artifact}`);
    if (response.status !== 200) throw new Error(`GET figure failed: ${response.status}`);
    return response.body as unknown as Figure;
  };

  const me = await api("GET", "/api/me", undefined, jwts.service);
  assert(me.body["kind"] === "service", "service JWT authenticates as the service identity");
  const empty = await api("GET", "/api/projects");
  assert(
    empty.status === 200 &&
      Array.isArray(empty.body["projects"]) &&
      (empty.body["projects"] as unknown[]).length === 0,
    "the local D1 starts empty (no state from an earlier run)",
    JSON.stringify(empty.body),
  );
  const anonymous = await fetch(`${base}/api/projects`);
  assert(
    anonymous.status === 401,
    "a request without an Access JWT is rejected",
    `${anonymous.status}`,
  );

  // 1. Publish a temp copy of the atlas project.
  const root = temp("atlas");
  cpSync(atlasProject, join(root, "docs/vl/projects", project), { recursive: true });
  const publishArgs = [
    "publish",
    "--root",
    root,
    "--project",
    project,
    "--repo-root",
    verifyRepo,
    "--remote",
    base,
    "--json",
  ];
  const first = await cli(publishArgs);
  const created = parsed<PublishOutput>(first, "publish");
  assert(
    first.exitCode === 0 &&
      created.results.length === 6 &&
      created.results.every((result) => result.outcome === "created" && result.token === "cas-1"),
    "publish: 6 figures created at cas-1",
    `exit ${first.exitCode}: ${created.results.map((r) => `${r.artifactId}=${r.outcome}`).join(" ")}`,
  );
  const listed = await api("GET", "/api/projects");
  const projects = listed.body["projects"] as { projectId: string; figureCount: number }[];
  assert(
    projects.length === 1 && projects[0]?.projectId === project && projects[0].figureCount === 6,
    "GET /api/projects lists visual-learning with 6 figures",
  );
  const published = await figure();
  const verify = (published as unknown as { verify: { status: string; stdout: string }[] }).verify;
  assert(
    verify.length === 4 && verify.every((step) => step.status === "ran" && step.stdout.length > 0),
    "verify steps ran against --repo-root and their output was recorded",
    verify.map((step) => step.status).join(","),
  );
  assert(
    !JSON.stringify(published).includes(root) && !JSON.stringify(published).includes(home),
    "no local temp path reaches the stored figure",
  );

  // 2. Human save: new rectangle + arrow bound to the node that step 3 removes + duplicate.
  const initial = byId(published.scene);
  const target = initial.get(removedShapeId);
  const source = initial.get(duplicatedSourceId);
  assert(
    target?.customData?.["semanticId"] === removedNode &&
      source?.customData?.["owner"] === "agent" &&
      initial.get(removedLabelId)?.customData?.["semanticId"] === removedNode,
    "vl-03 scene has the expected stable agent element ids",
  );
  if (target === undefined || source === undefined) return;
  const humanRect = rectangle("hl-human-rect", Number(target["x"]) - 420, Number(target["y"]), [
    { id: "hl-human-arrow", type: "arrow" },
  ]);
  const humanArrow = arrow("hl-human-arrow", humanRect, target);
  const duplicate: SceneElement = {
    ...structuredClone(source),
    id: "hl-dup-engine-facade",
    y: Number(source["y"]) + 600,
    groupIds: [],
    boundElements: [],
  };
  const savedScene: Scene = {
    ...published.scene,
    elements: [
      ...published.scene.elements.map((element) =>
        element.id === removedShapeId
          ? { ...element, boundElements: [{ id: "hl-human-arrow", type: "arrow" }] }
          : element,
      ),
      humanRect,
      humanArrow,
      duplicate,
    ],
  };
  const save = await api("PUT", `/api/projects/${project}/figures/${artifact}/scene`, {
    expectedToken: published.token,
    scene: savedScene,
  });
  assert(
    save.status === 200 && save.body["token"] === "cas-2",
    "human save commits at cas-2",
    `${save.status} ${JSON.stringify(save.body)}`,
  );
  const afterSave = await figure();
  const savedDuplicate = byId(afterSave.scene).get(duplicate.id);
  assert(
    savedDuplicate?.customData?.["owner"] === "human" &&
      savedDuplicate.customData["semanticId"] === undefined,
    "the duplicated agent element is re-tagged human on save",
    JSON.stringify(savedDuplicate?.customData),
  );
  const note = await api(
    "PUT",
    `/api/projects/${project}/figures/${artifact}/notes/${removedNode}`,
    {
      expectedToken: null,
      body: "restore는 스냅샷을 되돌린다 - QA note\n",
    },
  );
  assert(note.status === 200 && note.body["token"] === "cas-1", "node note created at cas-1");

  // 3. Re-publish a modified spec: one label changed, one human-referenced node removed.
  const specPath = join(root, "docs/vl/projects", project, "specs", `${artifact}.json`);
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
    revision: number;
    nodes: { semanticId: string; label: string }[];
    edges: { semanticId: string; from: string; to: string }[];
    learning?: { route: { semanticId: string }[] };
  };
  spec.revision += 1;
  spec.nodes = spec.nodes
    .filter((node) => node.semanticId !== removedNode)
    .map((node) => (node.semanticId === editedNode ? { ...node, label: editedLabel } : node));
  spec.edges = spec.edges.filter((edge) => edge.from !== removedNode && edge.to !== removedNode);
  if (spec.learning !== undefined)
    spec.learning.route = spec.learning.route.filter((step) => step.semanticId !== removedNode);
  parseVisualNoteSpec(spec);
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const second = await cli(publishArgs);
  const refreshed = parsed<PublishOutput>(second, "re-publish");
  const vl03 = refreshed.results.find((result) => result.artifactId === artifact);
  assert(
    second.exitCode === 0 &&
      refreshed.results.length === 6 &&
      refreshed.results.every((result) => result.outcome === "refreshed"),
    "re-publish refreshes all 6 figures",
    `exit ${second.exitCode}`,
  );
  assert(
    vl03?.token === "cas-3" &&
      vl03.deprecatedAnchors.join() === removedShapeId &&
      vl03.orphanedNotes.join() === removedNode,
    "re-publish reports the removed referenced node as deprecatedAnchor and its note orphaned",
    JSON.stringify(vl03),
  );
  const afterRepublish = await figure();
  const republished = byId(afterRepublish.scene);
  assert(
    sameBytes(humanBytes(afterSave.scene), humanBytes(afterRepublish.scene)) &&
      humanBytes(afterRepublish.scene).size === 3,
    "all 3 human elements are byte-identical after the re-publish",
  );
  assert(
    republished.get(humanRect.id) !== undefined &&
      JSON.stringify(republished.get(humanRect.id)) === JSON.stringify(humanRect) &&
      JSON.stringify(republished.get(humanArrow.id)) === JSON.stringify(humanArrow),
    "the saved rectangle and arrow equal the bytes the browser sent",
  );
  assert(
    republished.get(duplicate.id)?.customData?.["owner"] === "human",
    "the duplicate survives the re-publish as human",
  );
  const anchor = republished.get(removedShapeId);
  assert(
    anchor?.customData?.["deprecatedAnchor"] === true &&
      afterRepublish.deprecatedAnchors.includes(removedShapeId) &&
      !republished.has(removedLabelId),
    "the removed node's referenced shape is a deprecatedAnchor; its unreferenced label is gone",
    JSON.stringify(anchor?.customData),
  );
  const edited = afterRepublish.scene.elements.find(
    (element) =>
      element.customData?.["semanticId"] === editedNode &&
      element.customData["elementRole"] === "node-label",
  );
  assert(
    String(edited?.["text"] ?? "").replace(/\s/g, "") === editedLabel.replace(/\s/g, ""),
    "the changed node label is applied to the agent text element",
    JSON.stringify(edited?.["text"]),
  );
  const orphaned = afterRepublish.notes.find((entry) => entry.nodeKey === removedNode);
  assert(
    orphaned?.orphaned === true && orphaned.body === "restore는 스냅샷을 되돌린다 - QA note\n",
    "the removed node's note is orphaned with its body intact",
  );

  // 4. Race: a proxy fires the human save the moment the publish request reaches it, so both
  // writes leave from the same base token. Exactly one may win from that token. Rounds alternate
  // which request is issued first; a round where the save fully lands before the publish reads
  // is serialized (both succeed, the publish builds on the save) and the next round races again.
  let onPublish: (() => void) | null = null;
  let saveFirst = true;
  proxy = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.arrayBuffer();
      const headers = new Headers(request.headers);
      headers.delete("host");
      const trigger = onPublish;
      onPublish = null;
      if (saveFirst) trigger?.();
      const pending = fetch(`${base}${new URL(request.url).pathname}`, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
      });
      if (!saveFirst) trigger?.();
      const upstream = await pending;
      return new Response(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      });
    },
  });
  const raceRemote = `http://127.0.0.1:${proxy.port}`;
  const outcomes = { saveWon: 0, publishWon: 0, serialized: 0 };
  let loserLog = "";
  for (let round = 1; round <= maxRaceRounds; round += 1) {
    saveFirst = round % 2 === 1;
    const before = await figure();
    const baseToken = before.token;
    const next = `cas-${counter(baseToken) + 1}`;
    const raceRect = rectangle(`hl-race-${round}`, -900, round * 160, []);
    const saveScene = { ...before.scene, elements: [...before.scene.elements, raceRect] };
    const saveDone = new Promise<{ status: number; body: Json }>((resolveSave) => {
      onPublish = () => {
        resolveSave(
          api("PUT", `/api/projects/${project}/figures/${artifact}/scene`, {
            expectedToken: baseToken,
            scene: saveScene,
          }),
        );
      };
    });
    const racePublish = await cli([
      "publish",
      "--root",
      root,
      "--project",
      project,
      "--artifact",
      artifact,
      "--repo-root",
      verifyRepo,
      "--remote",
      raceRemote,
      "--json",
    ]);
    const saved = await saveDone;
    const output = parsed<PublishOutput>(racePublish, "race publish");
    const result = output.results[0];
    const after = await figure();
    const current = (saved.body["current"] as { token?: string } | undefined)?.token;
    const rectKept = byId(after.scene).has(raceRect.id);
    const humansKept = [humanRect.id, humanArrow.id, duplicate.id].every(
      (id) => JSON.stringify(byId(after.scene).get(id)) === humanBytes(afterSave.scene).get(id),
    );
    let verdict: keyof typeof outcomes;
    if (saved.status === 200 && racePublish.exitCode === 3 && result?.outcome === "conflict") {
      verdict = "saveWon";
      assert(
        saved.body["token"] === next && result.token === next && after.token === next && rectKept,
        `race ${round}: save won from ${baseToken}; publish lost with exit 3 and the fresh token`,
        `save ${saved.body["token"]}, publish conflict token ${result.token}`,
      );
      loserLog ||= `publish exit ${racePublish.exitCode}\nstdout: ${racePublish.stdout.trim()}\nstderr: ${racePublish.stderr.trim()}`;
    } else if (saved.status === 409 && racePublish.exitCode === 0) {
      verdict = "publishWon";
      assert(
        result?.outcome === "refreshed" &&
          result.token === next &&
          current === next &&
          after.token === next &&
          !rectKept,
        `race ${round}: publish won from ${baseToken}; save lost with 409 and the fresh token`,
        `publish ${result?.token}, 409 current ${current}`,
      );
      loserLog ||= `save HTTP ${saved.status}\nbody error: ${JSON.stringify(saved.body["error"])}\ncurrent.token: ${current}`;
    } else if (saved.status === 200 && racePublish.exitCode === 0) {
      verdict = "serialized";
      assert(
        saved.body["token"] === next &&
          result?.token === `cas-${counter(next) + 1}` &&
          after.token === result.token &&
          rectKept,
        `race ${round}: save landed first; publish then refreshed from the save's token`,
        `save ${saved.body["token"]}, publish ${result?.token}`,
      );
    } else {
      assert(
        false,
        `race ${round}: exactly one writer wins from ${baseToken}`,
        `save ${saved.status} ${JSON.stringify(saved.body)}; publish exit ${racePublish.exitCode} ${racePublish.stderr}`,
      );
      return;
    }
    assert(humansKept, `race ${round}: earlier human elements unchanged (${verdict})`);
    outcomes[verdict] += 1;
    if (outcomes.saveWon + outcomes.publishWon > 0) break;
  }
  proxy.stop(true);
  proxy = null;
  assert(
    outcomes.saveWon + outcomes.publishWon > 0,
    "a real same-token race was observed and exactly one side lost",
    JSON.stringify(outcomes),
  );
  console.log(`race loser (captured):\n${loserLog}`);

  // 5. Pull twice.
  const out = temp("pull");
  const pullArgs = ["pull", "--project", project, "--out", out, "--remote", base, "--json"];
  const pulled = await cli(pullArgs);
  const firstPull = parsed<{
    figures: number;
    written: string[];
    unchanged: string[];
  }>(pulled, "pull");
  const exported = await api("GET", `/api/projects/${project}/export`);
  const exportedFigures = exported.body["figures"] as { artifactId: string; spec: Json }[];
  const pulledSpec = JSON.parse(
    readFileSync(join(out, project, "specs", `${artifact}.json`), "utf8"),
  ) as Json;
  assert(
    pulled.exitCode === 0 &&
      firstPull.figures === 6 &&
      firstPull.written.length === 24 &&
      firstPull.unchanged.length === 0 &&
      firstPull.written.every((path) => existsSync(join(out, path))),
    "pull writes 4 files for each of the 6 figures",
    `exit ${pulled.exitCode}, written ${firstPull.written.length}`,
  );
  assert(
    JSON.stringify(pulledSpec) ===
      JSON.stringify(exportedFigures.find((entry) => entry.artifactId === artifact)?.spec) &&
      pulledSpec["revision"] === spec.revision,
    "the pulled vl-03 spec equals the Worker's current spec (revision bumped)",
  );
  const again = await cli(pullArgs);
  const secondPull = parsed<{ written: string[]; unchanged: string[] }>(again, "second pull");
  assert(
    again.exitCode === 0 && secondPull.written.length === 0 && secondPull.unchanged.length === 24,
    "a second pull is a no-op (0 written, 24 unchanged)",
  );

  // 6. The web app QA against the same Worker.
  const uiOut = args.keep === undefined ? temp("ui") : join(resolve(args.keep), "hosted-ui");
  const ui = await run(
    [
      "bun",
      "scripts/qa/hosted-ui.ts",
      "--base-url",
      base,
      "--auth-cookie",
      jwts.user,
      "--out",
      uiOut,
    ],
    { ...pathEnv, HOME: process.env["HOME"] ?? "", VISUAL_ATLAS_DEV_JWT: jwts.service },
  );
  const uiChecks = ui.stdout.split("\n").filter((line) => /^(PASS|FAIL) /.test(line));
  assert(
    ui.exitCode === 0 && uiChecks.length > 0 && uiChecks.every((line) => line.startsWith("PASS")),
    "hosted-ui QA passes against the local Worker",
    `exit ${ui.exitCode}, ${uiChecks.length} checks`,
  );
  if (ui.exitCode !== 0) console.log(ui.stdout, ui.stderr);

  assert(fingerprint(atlasProject) === atlasBefore, "the source atlas project is byte-unchanged");
  assert(credentialsStat() === credentialsBefore, "the real credentials file is untouched");
}

let failure: unknown = null;
try {
  await main();
} catch (error) {
  failure = error;
}
// A signal owns the teardown and exits with 130; main's resulting failure is not the outcome.
if (signalTeardown !== null) await signalTeardown;
if (args.keep !== undefined) {
  mkdirSync(resolve(args.keep), { recursive: true });
  writeFileSync(join(resolve(args.keep), "dev-server.log"), serverLog);
}
await teardown();
rmSync(stateDir, { recursive: true, force: true });
const leftover = listeners();
if (leftover !== "") failure ??= new Error(`port ${port} still has listeners: ${leftover}`);
else console.log(`teardown: dev server group stopped, port ${port} free, temp dirs removed`);
if (failure !== null) {
  console.error(`hosted-local FAILED after ${passed} passing checks: ${String(failure)}`);
  if (serverLog.length > 0) console.error(`dev server log tail:\n${serverLog.slice(-3000)}`);
  process.exit(1);
}
console.log(`${passed} checks passed`);
console.log("HOSTED_LOCAL_OK");
