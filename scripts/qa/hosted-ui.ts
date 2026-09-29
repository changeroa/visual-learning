// Headless QA for the hosted atlas web app (plan todo 11).
//
//   bun scripts/qa/hosted-ui.ts [--base-url <url>] [--auth-cookie <jwt>] [--out <dir>]
//
// Without --base-url it starts tests/support/hosted-api-stub.ts on 127.0.0.1 over hosted/dist
// (run `bun run build:web` first). With --base-url it targets a running Worker; --auth-cookie sets
// the CF_Authorization cookie on that origin, and publish/delete use VISUAL_ATLAS_CLIENT_ID +
// VISUAL_ATLAS_CLIENT_SECRET (or VISUAL_ATLAS_DEV_JWT for a localhost Worker). All work happens in
// a throwaway project that is deleted at the end. Exit code 0 only when every assertion passes.
//
// Against `bun run dev:hosted` (env.local), scripts/qa/hosted-dev-auth.ts mints both test JWTs:
//   eval "$(bun scripts/qa/hosted-dev-auth.ts)"
//   bun scripts/qa/hosted-ui.ts --base-url http://127.0.0.1:8787 --auth-cookie "$CF_AUTHORIZATION"
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  type HostedApiStub,
  seedSpecAndScene,
  seedVerifyRuns,
  startHostedApiStub,
  stubArtifactId,
  stubUserEmail,
} from "../../tests/support/hosted-api-stub";

type Json = Record<string, unknown>;
type Check = { name: string; ok: boolean; detail: string };
type SceneElement = { id: string; customData?: Json; [key: string]: unknown };

const repoRoot = resolve(import.meta.dir, "../..");
const qaProject = "hosted-ui-qa";
const artifact = stubArtifactId;
const draftKey = `visual-atlas:draft:${qaProject}:${artifact}`;
const figureRoute = `/p/${qaProject}/${artifact}`;
const waitMs = 20_000;

const { values: args } = parseArgs({
  options: {
    "base-url": { type: "string" },
    "auth-cookie": { type: "string" },
    out: { type: "string" },
  },
});
const outDir = resolve(args.out ?? join(tmpdir(), "visual-atlas-hosted-ui"));
const authCookie = args["auth-cookie"];
const checks: Check[] = [];
const network: { view: string; url: string }[] = [];
const browserLog: { view: string; level: string; text: string }[] = [];
const views: Bun.WebView[] = [];
const screenshots: string[] = [];
const runId = `${Date.now().toString(36)}`;

function check(name: string, ok: boolean, detail = ""): boolean {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail.length > 0 ? ` - ${detail}` : ""}`);
  return ok;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Resolves once the page-side predicate returns a truthy value; rejects at the deadline.
function waitFor<T>(view: Bun.WebView, label: string, predicate: string): Promise<T> {
  const script = `new Promise((resolve, reject) => {
    const deadline = Date.now() + ${waitMs};
    const check = () => {
      let value;
      try { value = (${predicate})(); } catch (error) { value = undefined; }
      if (value) return resolve(value);
      if (Date.now() > deadline) return reject(new Error(${JSON.stringify(`timeout: ${label}`)}));
      setTimeout(check, 25);
    };
    check();
  })`;
  return withTimeout(view.evaluate<T>(script), waitMs + 5_000, label);
}

const editorReady = `() => {
  const editor = window.visualAtlasEditor;
  return editor !== undefined && editor.getSceneElements().length > 0 &&
    document.querySelector('[data-testid="save-status"]') !== null;
}`;

type ViewportReport = {
  zoom: number;
  labelFont: number;
  labelPx: number;
  labels: number;
  visibleLabels: number;
  widthVisible: boolean;
  figure: number[];
  canvas: number[];
  innerHeight: number;
  controls: number;
  overlaps: string[];
};

// Readable-size method (IS-2): Excalidraw paints text into a <canvas> at fontSize x zoom CSS px
// (devicePixelRatio only scales the backing store), so there is no DOM text to measure. The rendered
// label size is appState.zoom.value x the smallest agent node-label fontSize in the scene.
// Overlap method: the figure's on-screen bounds clipped to the canvas (what the reader can see of
// the figure) are intersected with every visible control rectangle inside the Excalidraw host.
async function viewportReport(view: Bun.WebView, label: string): Promise<ViewportReport> {
  await waitFor(
    view,
    `${label}: initial viewport applied`,
    `() => document.querySelector('[data-testid="excalidraw-host"]')?.dataset.initialViewport ===
      "applied"`,
  );
  return view.evaluate<ViewportReport>(`(() => {
    const editor = window.visualAtlasEditor;
    const state = editor.getAppState();
    const zoom = state.zoom.value;
    const hostNode = document.querySelector('[data-testid="excalidraw-host"]');
    const host = hostNode.getBoundingClientRect();
    const elements = editor.getSceneElements();
    const screenX = (x) => host.left + (x + state.scrollX) * zoom;
    const screenY = (y) => host.top + (y + state.scrollY) * zoom;
    const labels = elements.filter((e) => e.type === "text" &&
      e.customData?.elementRole === "node-label");
    const labelFont = Math.min(...labels.map((e) => e.fontSize));
    const visibleLabels = labels.filter((e) => screenX(e.x) >= host.left &&
      screenY(e.y) >= host.top && screenX(e.x + e.width) <= host.right &&
      screenY(e.y + e.height) <= host.bottom).length;
    const xs = elements.flatMap((e) =>
      e.points ? e.points.map((p) => e.x + p[0]) : [e.x, e.x + e.width]);
    const ys = elements.flatMap((e) =>
      e.points ? e.points.map((p) => e.y + p[1]) : [e.y, e.y + e.height]);
    const left = screenX(Math.min(...xs));
    const right = screenX(Math.max(...xs));
    const figure = [
      Math.max(left, host.left), Math.max(screenY(Math.min(...ys)), host.top),
      Math.min(right, host.right), Math.min(screenY(Math.max(...ys)), host.bottom),
    ];
    const controls = [...hostNode.querySelectorAll(
      "button, [role=button], input, select, a, label, .Island, .App-toolbar, .App-bottom-bar",
    )].filter((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 &&
        node.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    });
    const overlaps = controls.filter((node) => {
      const r = node.getBoundingClientRect();
      return r.left < figure[2] && r.right > figure[0] && r.top < figure[3] && r.bottom > figure[1];
    }).map((node) => (node.getAttribute("aria-label") || node.className.toString()).slice(0, 60));
    return {
      zoom, labelFont, labelPx: zoom * labelFont, labels: labels.length, visibleLabels,
      widthVisible: left >= host.left - 1 && right <= host.right + 1,
      figure: figure.map(Math.round), canvas: [Math.round(host.width), Math.round(host.height)],
      innerHeight: window.innerHeight, controls: controls.length, overlaps,
    };
  })()`);
}

function checkReadableLabels(width: number, report: ViewportReport): void {
  check(
    `${width}: node label text renders at >= 12 CSS px (zoom x smallest node-label fontSize)`,
    report.labels > 0 && report.labelPx >= 12 - 1e-6,
    `${report.zoom.toFixed(3)} x ${report.labelFont}px = ${report.labelPx.toFixed(1)}px`,
  );
  check(
    `${width}: node labels are on screen in the initial viewport`,
    report.visibleLabels > 0,
    `${report.visibleLabels}/${report.labels} labels fully visible`,
  );
}

const inlineCodePattern = /`([^`\n]+)`/g;

function withoutBackticks(text: string): string {
  return text.replace(inlineCodePattern, "$1");
}

// Every `span` in the spec answer must render as <code>, and no literal backtick may remain.
async function checkInlineCode(view: Bun.WebView, label: string, answer: string): Promise<void> {
  const expected = [...answer.matchAll(inlineCodePattern)].map((match) => match[1] ?? "");
  const rendered = await view.evaluate<{ text: string; codes: string[] }>(`(() => {
    const panel = document.querySelector('[data-testid="learning-panel"]');
    return { text: panel.textContent, codes: [...panel.querySelectorAll("code")]
      .map((node) => node.textContent) };
  })()`);
  const missing = expected.filter((code) => !rendered.codes.includes(code));
  check(
    `${label}: 학습 panel renders inline code spans as <code> with no literal backticks`,
    expected.length > 0 && missing.length === 0 && !rendered.text.includes("`"),
    `${expected.length} spans in answer, ${rendered.codes.length} <code> in panel${
      missing.length > 0 ? `, missing ${missing.join(", ")}` : ""
    }`,
  );
}

function saveStatus(view: Bun.WebView): Promise<{ token: string; dirty: string; text: string }> {
  return view.evaluate(`(() => {
    const node = document.querySelector('[data-testid="save-status"]');
    return { token: node.dataset.token, dirty: node.dataset.dirty, text: node.textContent };
  })()`);
}

function sceneIds(view: Bun.WebView): Promise<string[]> {
  return view.evaluate("window.visualAtlasEditor.getSceneElements().map((element) => element.id)");
}

async function shot(view: Bun.WebView, name: string): Promise<void> {
  await view.evaluate("document.fonts.ready.then(() => true)");
  const path = join(outDir, `${name}.png`);
  await Bun.write(path, await view.screenshot());
  screenshots.push(path);
}

async function openView(label: string, baseUrl: string, width: number, height: number) {
  const view = new Bun.WebView({
    width,
    height,
    backend: { type: "chrome", url: false },
    console: (type, ...values) => {
      if (type === "error" || type === "warn")
        browserLog.push({
          view: label,
          level: `console.${type}`,
          text: values.map(String).join(" "),
        });
    },
  });
  views.push(view);
  await view.navigate("about:blank");
  // Desktop Chrome clamps windows to >= 500px, so narrow widths use mobile device emulation.
  if (width < 500)
    await view.cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
  await view.cdp("Network.enable");
  await view.cdp("Log.enable");
  view.addEventListener("Network.requestWillBeSent", (event: MessageEvent) => {
    const data = event.data as { request: { url: string } };
    network.push({ view: label, url: data.request.url });
  });
  view.addEventListener("Log.entryAdded", (event: MessageEvent) => {
    const data = event.data as { entry: { level: string; text: string } };
    browserLog.push({ view: label, level: data.entry.level, text: data.entry.text });
  });
  if (authCookie !== undefined) {
    const base = new URL(baseUrl);
    await view.cdp("Network.setCookie", {
      name: "CF_Authorization",
      value: authCookie,
      url: base.origin,
      httpOnly: true,
      secure: base.protocol === "https:",
      sameSite: "Lax",
    });
  }
  return view;
}

function rectangle(id: string, x: number, y: number, strokeColor: string): SceneElement {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 260,
    height: 140,
    angle: 0,
    strokeColor,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 3,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: 4242,
    version: 1,
    versionNonce: 4242,
    isDeleted: false,
    boundElements: null,
    updated: 1_700_000_000_000,
    link: null,
    locked: false,
  };
}

function drawScript(element: SceneElement): string {
  return `(() => {
    const editor = window.visualAtlasEditor;
    editor.updateScene({
      elements: [...editor.getSceneElementsIncludingDeleted(), ${JSON.stringify(element)}],
      captureUpdate: "IMMEDIATELY",
    });
    return true;
  })()`;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  let stub: HostedApiStub | null = null;
  try {
    if (args["base-url"] === undefined) {
      const distDir = join(repoRoot, "hosted/dist");
      if (!existsSync(join(distDir, "index.html")))
        throw new Error("hosted/dist is missing; run `bun run build:web` first");
      stub = await startHostedApiStub(
        authCookie === undefined ? { distDir } : { distDir, authCookie },
      );
    }
    const baseUrl = (args["base-url"] ?? stub?.url ?? "").replace(/\/$/, "");
    const base = new URL(baseUrl);
    console.log(`target ${base.origin}${stub === null ? "" : " (hosted-api-stub)"}`);
    const allowedHosts = new Set(["127.0.0.1", "localhost", base.hostname]);

    const userHeaders: Record<string, string> =
      authCookie === undefined ? {} : { cookie: `CF_Authorization=${authCookie}` };
    const serviceHeaders = (): Record<string, string> => {
      if (stub !== null)
        return { "cf-access-client-id": "hosted-ui", "cf-access-client-secret": "hosted-ui" };
      const id = process.env["VISUAL_ATLAS_CLIENT_ID"];
      const secret = process.env["VISUAL_ATLAS_CLIENT_SECRET"];
      if (id !== undefined && secret !== undefined)
        return { "cf-access-client-id": id, "cf-access-client-secret": secret };
      const devJwt = process.env["VISUAL_ATLAS_DEV_JWT"];
      if (devJwt !== undefined && isLocalHost(base.hostname))
        return { "cf-access-jwt-assertion": devJwt };
      throw new Error(
        "publish needs VISUAL_ATLAS_CLIENT_ID/VISUAL_ATLAS_CLIENT_SECRET or VISUAL_ATLAS_DEV_JWT",
      );
    };
    const call = async (method: string, path: string, service: boolean, body?: unknown) => {
      const init: RequestInit = {
        method,
        redirect: "manual",
        headers: {
          ...(service ? serviceHeaders() : userHeaders),
          "content-type": "application/json",
        },
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      const response = await fetch(`${baseUrl}${path}`, init);
      const text = await response.text();
      return { status: response.status, body: (text.length > 0 ? JSON.parse(text) : null) as Json };
    };
    const serverFigure = async () =>
      (await call("GET", `/api/projects/${qaProject}/figures/${artifact}`, false)).body as {
        spec: Json & { nodes: Json[]; edges: Json[]; revision: number; learning?: Json };
        scene: { elements: SceneElement[] };
        token: string;
        notes: { nodeKey: string; body: string; orphaned: boolean; token: string }[];
      };

    if (authCookie !== undefined) {
      const anonymous = await fetch(`${baseUrl}/api/projects`);
      check("auth: request without CF_Authorization is rejected", anonymous.status === 401);
    }

    // Seed a throwaway project through the publish route.
    await call("DELETE", `/api/projects/${qaProject}`, true);
    const { spec, scene } = seedSpecAndScene();
    const parsedSpec = spec as {
      learning?: { question: string; answer: string };
      source: { commit: string };
    };
    const answer = parsedSpec.learning?.answer ?? "";
    const published = await call("POST", "/api/publish", true, {
      projectId: qaProject,
      repoName: "visual-learning",
      commit: parsedSpec.source.commit,
      figures: [{ spec, scene, verify: seedVerifyRuns(spec) }],
    });
    const firstOutcome = (published.body["results"] as { outcome: string }[] | undefined)?.[0];
    check(
      "setup: publish creates the QA figure",
      published.status === 200 && firstOutcome?.outcome === "created",
      `status ${published.status} outcome ${firstOutcome?.outcome}`,
    );
    const me = await call("GET", "/api/me", false);
    const expectedEmail = String(me.body["email"] ?? stubUserEmail);
    const agentCount = scene.elements.length;

    // Tab A: list -> grid -> figure.
    const tabA = await openView("A", baseUrl, 1440, 900);
    await tabA.navigate(`${baseUrl}/`);
    await waitFor(
      tabA,
      "project list and email",
      `() => document.querySelector('a[href="/p/${qaProject}"]') !== null &&
        document.querySelector('[data-testid="user-email"]').textContent.includes("@")`,
    );
    const email = await tabA.evaluate<string>(
      `document.querySelector('[data-testid="user-email"]').textContent`,
    );
    check("header shows the /api/me email", email === expectedEmail, email);
    await shot(tabA, "01-home-1440");
    await tabA.click(`a[href="/p/${qaProject}"]`);
    await waitFor(
      tabA,
      "figure grid",
      `() => document.querySelector('a[href="${figureRoute}"]') !== null`,
    );
    const gridText = await tabA.evaluate<string>(
      `document.querySelector('[data-testid="figure-grid"]').textContent`,
    );
    check("figure grid shows the exact artifactId", gridText.includes(artifact));
    await shot(tabA, "02-grid-1440");
    await tabA.click(`a[href="${figureRoute}"]`);
    await waitFor(tabA, "editor ready", editorReady);
    const desktopView = await viewportReport(tabA, "1440");
    checkReadableLabels(1440, desktopView);
    check(
      "1440: initial viewport fits the figure width (zoom capped at 100%)",
      desktopView.widthVisible,
      JSON.stringify({ zoom: desktopView.zoom, figure: desktopView.figure }),
    );
    const layout = await tabA.evaluate<{ pane: number; canvas: number }>(`(() => {
      const pane = document.querySelector('[data-testid="canvas-pane"]').getBoundingClientRect();
      const canvas = document.querySelector('[data-testid="excalidraw-host"] canvas');
      return { pane: pane.width, canvas: canvas.getBoundingClientRect().width };
    })()`);
    check(
      "1440: figure canvas width >= 90% of its pane",
      layout.canvas >= layout.pane * 0.9,
      `${layout.canvas}/${layout.pane}`,
    );
    const question = await tabA.evaluate<string>(
      `document.querySelector('[data-testid="learning-question"]').textContent`,
    );
    check(
      "학습 tab shows the spec question",
      question === withoutBackticks(parsedSpec.learning?.question ?? ""),
    );
    await checkInlineCode(tabA, "1440", answer);
    const viewState = await tabA.evaluate<{ viewMode: boolean; assetPath: string }>(
      `({ viewMode: window.visualAtlasEditor.getAppState().viewModeEnabled,
          assetPath: window.EXCALIDRAW_ASSET_PATH })`,
    );
    check("figure opens in view mode", viewState.viewMode === true);
    check("EXCALIDRAW_ASSET_PATH is /", viewState.assetPath === "/");
    await shot(tabA, "03-figure-1440");

    // Tab B loads the same token before A saves (the stale writer).
    const tabB = await openView("B", baseUrl, 1440, 900);
    await tabB.navigate(`${baseUrl}${figureRoute}`);
    await waitFor(tabB, "tab B editor ready", editorReady);
    await tabB.click('[data-testid="edit-toggle"]');

    // A draws and saves with Cmd+S; a reload shows the element.
    const loadedToken = (await saveStatus(tabA)).token;
    await tabA.click('[data-testid="edit-toggle"]');
    const editMode = await tabA.evaluate<boolean>(
      "window.visualAtlasEditor.getAppState().viewModeEnabled === false",
    );
    check("편집 toggle enters edit mode", editMode);
    const rectA = `qa-rect-a-${runId}`;
    const rectB = `qa-rect-b-${runId}`;
    await tabA.evaluate(drawScript(rectangle(rectA, 80, -260, "#e03131")));
    await waitFor(
      tabA,
      "A dirty",
      `() => document.querySelector('[data-testid="save-status"]').dataset.dirty === "true"`,
    );
    const draftWhileDirty = await tabA.evaluate<string | null>(
      `window.localStorage.getItem(${JSON.stringify(draftKey)})`,
    );
    check(
      "unsaved change is kept in the localStorage draft",
      draftWhileDirty?.includes(rectA) === true,
    );
    await tabA.press("s", { modifiers: ["Meta"] });
    await waitFor(
      tabA,
      "A saved",
      `() => { const s = document.querySelector('[data-testid="save-status"]').dataset;
        return s.dirty === "false" && s.token !== ${JSON.stringify(loadedToken)}; }`,
    );
    const afterSave = await saveStatus(tabA);
    check(
      "Cmd+S saves with expectedToken and gets a fresh token",
      afterSave.token !== loadedToken,
      `${loadedToken} -> ${afterSave.token}`,
    );
    check(
      "draft is cleared after a successful save",
      (await tabA.evaluate(`window.localStorage.getItem(${JSON.stringify(draftKey)})`)) === null,
    );
    await tabA.reload();
    await waitFor(tabA, "A reloaded", editorReady);
    check("reload shows the saved drawing", (await sceneIds(tabA)).includes(rectA));
    await shot(tabA, "04-saved-reload-1440");

    // B saves with the stale token: 409 banner, draft survives a reload, merge keeps both.
    await tabB.evaluate(drawScript(rectangle(rectB, 420, -260, "#1971c2")));
    await waitFor(
      tabB,
      "B dirty",
      `() => document.querySelector('[data-testid="save-status"]').dataset.dirty === "true"`,
    );
    await tabB.click('[data-testid="save-button"]');
    const bannerText = await waitFor<string>(
      tabB,
      "conflict banner",
      `() => document.querySelector('[data-testid="conflict-banner"]')?.textContent`,
    );
    check(
      "stale save shows the 다른 곳에서 변경됨 banner with the merge action",
      bannerText.includes("다른 곳에서 변경됨") && bannerText.includes("최신본에 내 그림 합치기"),
    );
    await shot(tabB, "05-conflict-banner-1440");
    await tabB.reload();
    await waitFor(
      tabB,
      "B reloaded with draft banner",
      `() => document.querySelector('[data-testid="draft-banner"]') !== null &&
        window.visualAtlasEditor?.getSceneElements().length > 0`,
    );
    const survivingDraft = await tabB.evaluate<string | null>(
      `window.localStorage.getItem(${JSON.stringify(draftKey)})`,
    );
    check(
      "after reload the stale draft is still in localStorage",
      survivingDraft?.includes(rectB) === true,
      draftKey,
    );
    await shot(tabB, "06-draft-after-reload-1440");
    await tabB.click('[data-testid="draft-banner"] button');
    await waitFor(
      tabB,
      "draft restored",
      `() => window.visualAtlasEditor.getSceneElements().some((e) => e.id === ${JSON.stringify(rectB)})`,
    );
    await tabB.click('[data-testid="save-button"]');
    await waitFor(
      tabB,
      "conflict banner again",
      `() => document.querySelector('[data-testid="conflict-banner"]') !== null`,
    );
    await tabB.click('[data-testid="conflict-banner"] button');
    await waitFor(
      tabB,
      "merged save",
      `() => document.querySelector('[data-testid="conflict-banner"]') === null &&
        document.querySelector('[data-testid="save-status"]').dataset.dirty === "false"`,
    );
    const mergedIds = await sceneIds(tabB);
    const serverAfterMerge = await serverFigure();
    const serverIds = serverAfterMerge.scene.elements.map((element) => element.id);
    const serverAgents = serverAfterMerge.scene.elements.filter(
      (element) => element.customData?.["owner"] === "agent",
    ).length;
    check(
      "merge action preserves both drawings (editor and server)",
      mergedIds.includes(rectA) &&
        mergedIds.includes(rectB) &&
        serverIds.includes(rectA) &&
        serverIds.includes(rectB),
      `server token ${serverAfterMerge.token}`,
    );
    check(
      "merge keeps every agent element",
      serverAgents === agentCount,
      `${serverAgents}/${agentCount}`,
    );
    check(
      "draft is cleared after the merged save",
      (await tabB.evaluate(`window.localStorage.getItem(${JSON.stringify(draftKey)})`)) === null,
    );
    await shot(tabB, "07-merged-1440");

    // Notes: figure note + node note chosen through the route (customData.semanticId).
    const route = (parsedSpec.learning as { route?: { semanticId: string }[] } | undefined)?.route;
    const nodeIds = new Set(
      (spec as { nodes: { semanticId: string }[] }).nodes.map((node) => node.semanticId),
    );
    const noteNode =
      route?.find((step) => step.semanticId === "cas-token")?.semanticId ??
      route?.find((step) => nodeIds.has(step.semanticId))?.semanticId ??
      "";
    const openNodeNote = async (view: Bun.WebView) => {
      await view.click('[data-testid="tab-learn"]');
      await view.click(`button.route-step[data-semantic-id="${noteNode}"]`);
      await view.click('[data-testid="tab-notes"]');
      await waitFor(
        view,
        "node note editor",
        `() => document.querySelector('[data-testid="note-${noteNode}"] textarea') !== null`,
      );
    };
    const typeInto = async (view: Bun.WebView, key: string, text: string) => {
      await view.click(`[data-testid="note-${key}"] textarea`);
      await view.type(text);
    };
    const noteSaved = (view: Bun.WebView, key: string, token: string) =>
      waitFor(
        view,
        `note ${key} saved as ${token}`,
        `() => document.querySelector('[data-testid="note-status-${key}"]').textContent ===
          "저장됨 · ${token}"`,
      );
    await tabA.reload();
    await waitFor(tabA, "A ready for notes", editorReady);
    await openNodeNote(tabA);
    const selectedByRoute = await tabA.evaluate<string[]>(`(() => {
      const editor = window.visualAtlasEditor;
      const ids = Object.keys(editor.getAppState().selectedElementIds);
      return editor.getSceneElements().filter((e) => ids.includes(e.id))
        .map((e) => e.customData?.semanticId);
    })()`);
    check(
      "route click selects the node by customData.semanticId",
      selectedByRoute.includes(noteNode),
      noteNode,
    );
    await typeInto(tabA, "_figure", "그림 전체 메모: CAS 흐름 복습");
    await tabA.click('[data-testid="note-save-_figure"]');
    await noteSaved(tabA, "_figure", "cas-1");
    const noteV1 = `노드 메모 v1 ${runId}`;
    await typeInto(tabA, noteNode, noteV1);
    await tabA.click(`[data-testid="note-save-${noteNode}"]`);
    await noteSaved(tabA, noteNode, "cas-1");
    check("figure note and node note save with tokens", true, noteNode);
    await shot(tabA, "08-notes-1440");

    // Note conflict: B holds cas-1, A saves cas-2, B overwrites with the fresh token.
    await tabB.reload();
    await waitFor(tabB, "B ready for notes", editorReady);
    await openNodeNote(tabB);
    await typeInto(tabA, noteNode, " + A 수정");
    await tabA.click(`[data-testid="note-save-${noteNode}"]`);
    await noteSaved(tabA, noteNode, "cas-2");
    await typeInto(tabB, noteNode, " + B 수정");
    await tabB.click(`[data-testid="note-save-${noteNode}"]`);
    const noteConflictText = await waitFor<string>(
      tabB,
      "note conflict",
      `() => document.querySelector('[data-testid="note-conflict-${noteNode}"]')?.textContent`,
    );
    check(
      "note 409 shows the server version beside mine with both actions",
      noteConflictText.includes(`${noteV1} + A 수정`) &&
        noteConflictText.includes("서버 버전으로 교체") &&
        noteConflictText.includes("내 버전으로 덮어쓰기"),
    );
    await shot(tabB, "09-note-conflict-1440");
    await tabB.click(`[data-testid="note-conflict-${noteNode}"] .row button:last-child`);
    await noteSaved(tabB, noteNode, "cas-3");
    const noteAfterOverwrite = (await serverFigure()).notes.find(
      (note) => note.nodeKey === noteNode,
    );
    check(
      "내 버전으로 덮어쓰기 re-sends with the fresh token",
      noteAfterOverwrite?.body === `${noteV1} + B 수정` && noteAfterOverwrite.token === "cas-3",
      noteAfterOverwrite?.token ?? "missing",
    );

    // A publish that removes the node orphans its note; the UI lists it.
    const current = await serverFigure();
    const nextSpec = structuredClone(current.spec) as {
      nodes: { semanticId: string }[];
      edges: { semanticId: string; from: string; to: string }[];
      revision: number;
      learning?: { route: { semanticId: string }[]; verify: { semanticId: string }[] };
    };
    nextSpec.nodes = nextSpec.nodes.filter((node) => node.semanticId !== noteNode);
    nextSpec.edges = nextSpec.edges.filter((e) => e.from !== noteNode && e.to !== noteNode);
    if (nextSpec.learning !== undefined) {
      nextSpec.learning.route = nextSpec.learning.route.filter((s) => s.semanticId !== noteNode);
      nextSpec.learning.verify = nextSpec.learning.verify.filter((s) => s.semanticId !== noteNode);
    }
    nextSpec.revision += 1;
    const republished = await call("POST", "/api/publish", true, {
      projectId: qaProject,
      repoName: "visual-learning",
      commit: parsedSpec.source.commit,
      figures: [{ spec: nextSpec, scene: current.scene, verify: seedVerifyRuns(nextSpec) }],
    });
    const refresh = (
      republished.body["results"] as { outcome: string; orphanedNotes: string[] }[] | undefined
    )?.[0];
    check(
      "publish removing the node reports the orphaned note",
      refresh?.outcome === "refreshed" && refresh.orphanedNotes.includes(noteNode),
      JSON.stringify(refresh ?? republished.body),
    );
    const afterPublish = await serverFigure();
    const humanKept = [rectA, rectB].every((id) =>
      afterPublish.scene.elements.some((element) => element.id === id),
    );
    check("publish keeps both human drawings", humanKept);
    await tabA.reload();
    await waitFor(tabA, "A ready after publish", editorReady);
    await tabA.click('[data-testid="tab-notes"]');
    const orphanText = await waitFor<string>(
      tabA,
      "orphaned note listed",
      `() => document.querySelector('[data-testid="orphaned-notes"] [data-note-key="${noteNode}"]')
        ?.textContent`,
    );
    check(
      "사라진 노드의 메모 lists the orphaned note with its body",
      orphanText.includes(noteNode) && orphanText.includes(`${noteV1} + B 수정`),
    );
    await shot(tabA, "10-orphaned-note-1440");

    await tabA.click('[data-testid="tab-evidence"]');
    const evidenceText = await waitFor<string>(
      tabA,
      "evidence panel",
      `() => document.querySelector('[data-testid="evidence-panel"]')?.textContent`,
    );
    check(
      "근거 tab shows path:lines evidence and ran/not-run verify entries",
      /[\w./-]+\.ts:\d+/.test(evidenceText) &&
        evidenceText.includes("실행됨") &&
        evidenceText.includes("실행 안 함"),
    );
    // Recorded stdout/stderr stay verbatim in <pre>; only spec prose is rendered.
    const evidenceProse = await tabA.evaluate<string>(`[...document.querySelectorAll(
      '[data-testid="evidence-panel"] .claim > div, [data-testid="evidence-panel"] .verify > p'
    )].map((node) => node.textContent).join("\\n")`);
    check(
      "근거 tab prose has no literal backticks",
      evidenceProse.length > 0 && !evidenceProse.includes("`"),
    );
    await shot(tabA, "11-evidence-1440");

    // Mobile width.
    const mobile = await openView("M", baseUrl, 390, 844);
    await mobile.navigate(`${baseUrl}/`);
    await waitFor(
      mobile,
      "mobile home",
      `() => document.querySelector('a[href="/p/${qaProject}"]') !== null`,
    );
    await shot(mobile, "12-home-390");
    await mobile.navigate(`${baseUrl}${figureRoute}`);
    await waitFor(mobile, "mobile editor", editorReady);
    const innerWidth = await mobile.evaluate<number>("window.innerWidth");
    check("390: viewport really is 390 CSS px wide", innerWidth === 390, `${innerWidth}`);
    const mobileView = await viewportReport(mobile, "390");
    checkReadableLabels(390, mobileView);
    check(
      "390: drawing canvas is >= 60vh tall",
      mobileView.canvas[1] !== undefined && mobileView.canvas[1] >= 0.6 * mobileView.innerHeight,
      `${mobileView.canvas[1]}/${mobileView.innerHeight}`,
    );
    check(
      "390: no Excalidraw control overlaps the visible figure bounds",
      mobileView.overlaps.length === 0,
      `${mobileView.controls} visible controls in canvas, figure ${JSON.stringify(
        mobileView.figure,
      )}${mobileView.overlaps.length > 0 ? `, overlapping: ${mobileView.overlaps.join(" | ")}` : ""}`,
    );
    const zoomBar = await mobile.evaluate<{ visible: boolean; outside: boolean }>(`(() => {
      const bar = document.querySelector('[data-testid="zoom-group"]');
      const host = document.querySelector('[data-testid="excalidraw-host"]').getBoundingClientRect();
      const r = bar.getBoundingClientRect();
      return { visible: bar.checkVisibility() && r.width > 0,
        outside: r.bottom <= host.top || r.top >= host.bottom };
    })()`);
    await mobile.click('[data-testid="zoom-in"]');
    const zoomedIn = await mobile.evaluate<number>(
      "window.visualAtlasEditor.getAppState().zoom.value",
    );
    await mobile.click('[data-testid="zoom-reset"]');
    const zoomedBack = await mobile.evaluate<number>(
      "window.visualAtlasEditor.getAppState().zoom.value",
    );
    check(
      "390: toolbar zoom controls sit outside the canvas and change the zoom",
      zoomBar.visible &&
        zoomBar.outside &&
        Math.abs(zoomedIn - mobileView.zoom * 1.25) < 1e-6 &&
        Math.abs(zoomedBack - mobileView.zoom) < 1e-6,
      `${mobileView.zoom} -> ${zoomedIn} -> ${zoomedBack}`,
    );
    const mobileLayout = await mobile.evaluate<{ pane: number; canvas: number }>(`(() => {
      const pane = document.querySelector('[data-testid="canvas-pane"]').getBoundingClientRect();
      const canvas = document.querySelector('[data-testid="excalidraw-host"] canvas');
      return { pane: pane.width, canvas: canvas.getBoundingClientRect().width };
    })()`);
    check(
      "390: figure canvas width >= 90% of its pane",
      mobileLayout.canvas >= mobileLayout.pane * 0.9,
      `${mobileLayout.canvas}/${mobileLayout.pane}`,
    );
    await shot(mobile, "13-figure-390");
    await mobile.scrollTo('[data-testid="learning-panel"]', { block: "start" });
    await checkInlineCode(mobile, "390", answer);
    await shot(mobile, "14-learning-390");

    // Cleanup of the throwaway project.
    const deleted = await call("DELETE", `/api/projects/${qaProject}`, true);
    check("cleanup: QA project deleted", deleted.status === 200, `status ${deleted.status}`);

    const external = network.filter((entry) => {
      if (!/^(https?|wss?):/.test(entry.url)) return false;
      return !allowedHosts.has(new URL(entry.url).hostname);
    });
    check(
      "network: zero requests to hosts other than 127.0.0.1/localhost (and the target)",
      external.length === 0 && network.length > 0,
      `${network.length} requests, ${external.length} external${
        external.length > 0 ? `: ${external.map((e) => e.url).join(", ")}` : ""
      }`,
    );
    const csp = browserLog.filter((entry) => entry.text.includes("Content Security Policy"));
    check("browser log: no CSP violations", csp.length === 0, `${csp.length} violations`);
  } catch (error) {
    check("harness completed without error", false, String(error));
  } finally {
    for (const view of views) view.close();
    Bun.WebView.closeAll();
    if (stub !== null) await stub.stop();
    const failed = checks.filter((item) => !item.ok);
    const log = {
      runId,
      finishedAt: new Date().toISOString(),
      passed: checks.length - failed.length,
      failed: failed.length,
      checks,
      screenshots,
      network: {
        total: network.length,
        hosts: [...new Set(network.map((entry) => entry.url.split("/").slice(0, 3).join("/")))],
      },
      browserLog: browserLog.slice(0, 200),
    };
    writeFileSync(join(outDir, "hosted-ui-log.json"), `${JSON.stringify(log, null, 2)}\n`);
    console.log(
      `hosted-ui: ${log.passed} passed, ${log.failed} failed; screenshots and log in ${outDir}`,
    );
    process.exitCode = failed.length === 0 && checks.length > 0 ? 0 : 1;
  }
}

await main();
