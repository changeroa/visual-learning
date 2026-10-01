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

// Waits are event-driven and registered before the action that triggers them; no polling.
// - The SPA announces its moments as `visual-atlas:<type>` CustomEvents after React commits the
//   matching render (hosted/web/app-events.ts). qaRuntime is installed into every document before
//   any page script runs (Page.addScriptToEvaluateOnNewDocument) and records those events from
//   document start, so a wait taken before a navigation or reload cannot miss its event.
// - DOM-only changes (tab and toggle clicks) use a MutationObserver armed before the click.
// The only timers are the bounded timeouts that reject a wait with its label.
const appEventTypes = [
  "loaded",
  "load-failed",
  "ready",
  "viewport",
  "dirty",
  "saved",
  "conflict",
  "save-failed",
  "draft-restored",
];
const qaRuntime = `(() => {
  if (window.__visualAtlasQa !== undefined) return;
  const log = [];
  const listeners = new Set();
  for (const type of ${JSON.stringify(appEventTypes)})
    window.addEventListener("visual-atlas:" + type, (event) => {
      const entry = { type, detail: event.detail ?? {} };
      log.push(entry);
      for (const listener of [...listeners]) listener(entry);
    });
  const matches = (detail, match) =>
    Object.entries(match).every(([key, value]) => detail[key] === value);
  const armed = new Map();
  window.__visualAtlasQa = {
    docId: Math.random().toString(36).slice(2),
    mark: () => log.length,
    // Resolves with the first matching event recorded at index >= since; a failOn event first
    // rejects with its detail.
    event(since, type, match, failOn, failMatch, ms, label) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (finish, value) => {
          if (settled) return;
          settled = true;
          listeners.delete(onEntry);
          clearTimeout(timer);
          finish(value);
        };
        const onEntry = (entry) => {
          if (entry.type === type && matches(entry.detail, match)) settle(resolve, entry.detail);
          else if (failOn.includes(entry.type) && matches(entry.detail, failMatch))
            settle(reject, new Error(label + ": got visual-atlas:" + entry.type + " " +
              JSON.stringify(entry.detail)));
        };
        const timer = setTimeout(() => settle(reject, new Error("timeout after " + ms + "ms: " +
          label + " (events since mark: " + log.slice(since).map((e) => e.type).join(", ") +
          ")")), ms);
        listeners.add(onEntry);
        for (const entry of log.slice(since)) onEntry(entry);
      });
    },
    // Observes DOM mutations from now on; resolves with the predicate's first truthy value.
    arm(id, predicate) {
      const entry = { done: false, value: undefined, wake: () => {} };
      entry.observer = new MutationObserver(() => {
        let value;
        try { value = predicate(); } catch { value = undefined; }
        if (!value) return;
        entry.observer.disconnect();
        entry.done = true;
        entry.value = value;
        entry.wake();
      });
      entry.observer.observe(document, {
        subtree: true, childList: true, attributes: true, characterData: true,
      });
      armed.set(id, entry);
      return true;
    },
    settle(id, ms, label) {
      const entry = armed.get(id);
      armed.delete(id);
      return new Promise((resolve, reject) => {
        if (entry.done) return resolve(entry.value);
        const timer = setTimeout(() => {
          entry.observer.disconnect();
          reject(new Error("timeout after " + ms + "ms: " + label));
        }, ms);
        entry.wake = () => {
          clearTimeout(timer);
          resolve(entry.value);
        };
      });
    },
  };
})();`;

type Pending<T> = { done: () => Promise<T> };
type EventWait = {
  match?: Json;
  failOn?: string[];
  failMatch?: Json;
  // The trigger replaces the document (navigate/reload): match from the new document's start.
  navigation?: boolean;
};

// Registers a wait for `visual-atlas:<type>` before the caller triggers it.
async function expectEvent<T = Json>(
  view: Bun.WebView,
  label: string,
  type: string,
  options: EventWait = {},
): Promise<Pending<T>> {
  const navigation = options.navigation === true;
  const docId = await view.evaluate<string | null>("window.__visualAtlasQa?.docId ?? null");
  const since = navigation ? 0 : await view.evaluate<number>("window.__visualAtlasQa.mark()");
  const script = `(() => {
    const qa = window.__visualAtlasQa;
    const label = ${JSON.stringify(label)};
    if (qa === undefined) throw new Error(label + ": QA runtime missing in this document");
    if ((qa.docId === ${JSON.stringify(docId)}) === ${navigation})
      throw new Error(label + (${navigation} ? ": the document was not replaced" :
        ": the document changed"));
    return qa.event(${since}, ${JSON.stringify(type)}, ${JSON.stringify(options.match ?? {})},
      ${JSON.stringify(options.failOn ?? [])}, ${JSON.stringify(options.failMatch ?? {})},
      ${waitMs}, label);
  })()`;
  return { done: () => withTimeout(view.evaluate<T>(script), waitMs + 5_000, label) };
}

let armedCount = 0;

// Arms a MutationObserver for a page-side predicate before the caller triggers the change.
async function expectDom<T>(
  view: Bun.WebView,
  label: string,
  predicate: string,
): Promise<Pending<T>> {
  armedCount += 1;
  const id = JSON.stringify(`wait-${armedCount}`);
  await view.evaluate(`window.__visualAtlasQa.arm(${id}, ${predicate})`);
  const script = `window.__visualAtlasQa.settle(${id}, ${waitMs}, ${JSON.stringify(label)})`;
  return { done: () => withTimeout(view.evaluate<T>(script), waitMs + 5_000, label) };
}

// Registration completes before the action runs; then the action's outcome is awaited.
async function after<T>(pending: Promise<Pending<T>>, action: () => Promise<unknown>): Promise<T> {
  const wait = await pending;
  await action();
  return wait.done();
}

const loaded = (key: string): EventWait => ({
  match: { key },
  failOn: ["load-failed"],
  failMatch: { key },
});
// The figure workspace placed its initial (readable) viewport.
const figureReady: EventWait = { match: { project: qaProject, artifact }, failOn: ["load-failed"] };
const ready: EventWait = { ...figureReady, navigation: true };
const saveOk: EventWait = { failOn: ["conflict", "save-failed"] };
const saveConflict: EventWait = { failOn: ["saved", "save-failed"] };
const viewportPlaced = (mode: string): EventWait => ({ match: { mode } });
// The window loses focus (switching apps or tabs): the figure view autosaves.
const leaveWindow = "window.dispatchEvent(new Event('blur'))";

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
  topBar: number;
};

// Readable-size method (IS-2): Excalidraw paints text into a <canvas> at fontSize x zoom CSS px
// (devicePixelRatio only scales the backing store), so there is no DOM text to measure. The rendered
// label size is appState.zoom.value x the smallest agent node-label fontSize in the scene.
// Toolbar clearance: topBar is the lowest bottom edge of the visible Excalidraw controls that start
// in the top 64 CSS px of the host and are bar-sized (< 80 px tall: main menu, shape toolbar, not
// the full-height side column); the figure must start below it.
// Callers first await the `ready` or `viewport` event of the view they measure.
function viewportReport(view: Bun.WebView): Promise<ViewportReport> {
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
    const topBar = Math.max(host.top, ...controls.map((node) => node.getBoundingClientRect())
      .filter((r) => r.top < host.top + 64 && r.height < 80).map((r) => r.bottom));
    return {
      zoom, labelFont, labelPx: zoom * labelFont, labels: labels.length, visibleLabels,
      widthVisible: left >= host.left - 1 && right <= host.right + 1,
      figure: figure.map(Math.round), canvas: [Math.round(host.width), Math.round(host.height)],
      innerHeight: window.innerHeight, topBar: Math.round(topBar),
    };
  })()`);
}

// Plan todo 11: the load view is the readable default (node labels at >= 12 CSS px).
function checkReadableLabels(width: number, report: ViewportReport): void {
  check(
    `${width}: load view is the readable default - node labels render at >= 12 CSS px`,
    report.labels > 0 && report.labelPx >= 12 - 1e-6,
    `${report.zoom.toFixed(3)} x ${report.labelFont}px = ${report.labelPx.toFixed(1)}px`,
  );
  check(
    `${width}: node labels are on screen in the load view`,
    report.visibleLabels > 0,
    `${report.visibleLabels}/${report.labels} labels fully visible`,
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
  await view.cdp("Page.enable");
  await view.cdp("Page.addScriptToEvaluateOnNewDocument", { source: qaRuntime });
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

// Both scripts first touch the canvas (a pointerdown on its host), as a reader's edit would.
function drawScript(element: SceneElement): string {
  return `(() => {
    document.querySelector('[data-testid="excalidraw-host"]')
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const editor = window.visualAtlasEditor;
    editor.updateScene({
      elements: [...editor.getSceneElementsIncludingDeleted(), ${JSON.stringify(element)}],
      captureUpdate: "IMMEDIATELY",
    });
    return true;
  })()`;
}

// Deletes an element the way Excalidraw does: isDeleted with a bumped version and versionNonce.
function deleteScript(id: string): string {
  return `(() => {
    document.querySelector('[data-testid="excalidraw-host"]')
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const editor = window.visualAtlasEditor;
    editor.updateScene({
      elements: editor.getSceneElementsIncludingDeleted().map((e) => e.id === ${JSON.stringify(id)}
        ? { ...e, isDeleted: true, version: e.version + 1, versionNonce: e.versionNonce + 1 }
        : e),
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
    const homeProjects = await expectEvent(tabA, "project list loaded", "loaded", {
      ...loaded("projects"),
      navigation: true,
    });
    const homeMe = await expectEvent(tabA, "/api/me loaded", "loaded", {
      ...loaded("me"),
      navigation: true,
    });
    await tabA.navigate(`${baseUrl}/`);
    await homeProjects.done();
    await homeMe.done();
    const email = await tabA.evaluate<string>(
      `document.querySelector('[data-testid="user-email"]').textContent`,
    );
    check("header shows the /api/me email", email === expectedEmail, email);
    await shot(tabA, "01-home-1440");
    await after(
      expectEvent(tabA, "figure grid loaded", "loaded", loaded(`project:${qaProject}`)),
      () => tabA.click(`a[href="/p/${qaProject}"]`),
    );
    const gridText = await tabA.evaluate<string>(
      `document.querySelector('[data-testid="figure-grid"]').textContent`,
    );
    check("figure grid shows the exact artifactId", gridText.includes(artifact));
    await shot(tabA, "02-grid-1440");
    await after(expectEvent(tabA, "editor ready", "ready", figureReady), () =>
      tabA.click(`a[href="${figureRoute}"]`),
    );
    const desktopView = await viewportReport(tabA);
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
    await tabA.evaluate("document.fonts.ready.then(() => true)");
    const gone = [
      "side-pane",
      "dock",
      "panel-toggle",
      "panel-resizer",
      "rail-toggle",
      "tab-learn",
      "tab-evidence",
      "tab-notes",
      "edit-toggle",
      "save-button",
      "zoom-reset",
      "zoom-fit",
    ];
    const chrome = await tabA.evaluate<{
      present: string[];
      host: number;
      dirty: string;
      draft: boolean;
      viewMode: boolean;
      assetPath: string;
    }>(`(() => ({
      present: ${JSON.stringify(gone)}
        .filter((id) => document.querySelector('[data-testid="' + id + '"]') !== null),
      host: Math.round(document.querySelector('[data-testid="excalidraw-host"]')
        .getBoundingClientRect().width),
      dirty: document.querySelector('[data-testid="save-status"]').dataset.dirty,
      draft: window.localStorage.getItem(${JSON.stringify(draftKey)}) !== null,
      viewMode: window.visualAtlasEditor.getAppState().viewModeEnabled,
      assetPath: window.EXCALIDRAW_ASSET_PATH,
    }))()`);
    check(
      "1440: no side panel, panel toggle, 편집, 저장, 처음 보기 or 전체 보기 controls",
      chrome.present.length === 0,
      chrome.present.join(", "),
    );
    check("1440: the canvas spans the whole window width", chrome.host >= 1438, `${chrome.host}px`);
    check("figure opens directly in edit mode", chrome.viewMode === false);
    check("EXCALIDRAW_ASSET_PATH is /", chrome.assetPath === "/");
    check(
      "loading the figure leaves no unsaved change and no draft",
      chrome.dirty === "false" && !chrome.draft,
    );
    const frame = `(() => ({
      header: getComputedStyle(document.querySelector(".app-header")).display,
      host: Math.round(document.querySelector('[data-testid="excalidraw-host"]')
        .getBoundingClientRect().height),
    }))()`;
    type Frame = { header: string; host: number };
    const framed = await tabA.evaluate<Frame>(frame);
    const focused = await after(
      expectDom<Frame>(
        tabA,
        "focus mode",
        `() => { const s = ${frame}; return s.header === "none" && s; }`,
      ),
      () => tabA.click('[data-testid="focus-toggle"]'),
    );
    check(
      "1440: focus mode hides the header and gives its height to the canvas",
      focused.host > framed.host,
      `canvas ${framed.host} -> ${focused.host}px tall`,
    );
    await shot(tabA, "11b-focus-1440");
    await after(
      expectDom(
        tabA,
        "focus mode off",
        `() => getComputedStyle(document.querySelector(".app-header")).display !== "none"`,
      ),
      () => tabA.click('[data-testid="focus-toggle"]'),
    );
    await shot(tabA, "03-figure-1440");

    // Tab B loads the same token before A saves (the stale writer).
    const tabB = await openView("B", baseUrl, 1440, 900);
    await after(expectEvent(tabB, "tab B editor ready", "ready", ready), () =>
      tabB.navigate(`${baseUrl}${figureRoute}`),
    );

    // A draws, then leaves the window: the drawing autosaves; a reload shows the element.
    const loadedToken = (await saveStatus(tabA)).token;
    const rectA = `qa-rect-a-${runId}`;
    const rectB = `qa-rect-b-${runId}`;
    await after(expectEvent(tabA, "A dirty", "dirty"), () =>
      tabA.evaluate(drawScript(rectangle(rectA, 80, -260, "#e03131"))),
    );
    const draftWhileDirty = await tabA.evaluate<string | null>(
      `window.localStorage.getItem(${JSON.stringify(draftKey)})`,
    );
    check(
      "unsaved change is kept in the localStorage draft",
      draftWhileDirty?.includes(rectA) === true,
    );
    await after(expectEvent(tabA, "A autosaved on blur", "saved", saveOk), () =>
      tabA.evaluate(leaveWindow),
    );
    const afterSave = await saveStatus(tabA);
    check(
      "leaving the window autosaves with expectedToken and gets a fresh token",
      afterSave.token !== loadedToken,
      `${loadedToken} -> ${afterSave.token}`,
    );
    check(
      "draft is cleared after a successful save",
      (await tabA.evaluate(`window.localStorage.getItem(${JSON.stringify(draftKey)})`)) === null,
    );
    await after(expectEvent(tabA, "A reloaded", "ready", ready), () => tabA.reload());
    check("reload shows the saved drawing", (await sceneIds(tabA)).includes(rectA));
    await shot(tabA, "04-saved-reload-1440");

    // B saves with the stale token: 409 banner, draft survives a reload, merge keeps both.
    await after(expectEvent(tabB, "B dirty", "dirty"), () =>
      tabB.evaluate(drawScript(rectangle(rectB, 420, -260, "#1971c2"))),
    );
    await after(expectEvent(tabB, "B stale autosave conflicts", "conflict", saveConflict), () =>
      tabB.evaluate(leaveWindow),
    );
    const bannerText = await tabB.evaluate<string>(
      `document.querySelector('[data-testid="conflict-banner"]')?.textContent ?? ""`,
    );
    check(
      "stale save shows the 다른 곳에서 변경됨 banner with the merge action",
      bannerText.includes("다른 곳에서 변경됨") && bannerText.includes("최신본에 내 그림 합치기"),
    );
    await shot(tabB, "05-conflict-banner-1440");
    await after(expectEvent(tabB, "B reloaded", "ready", ready), () => tabB.reload());
    const survivingDraft = await tabB.evaluate<{ stored: string | null; banner: boolean }>(
      `({ stored: window.localStorage.getItem(${JSON.stringify(draftKey)}),
          banner: document.querySelector('[data-testid="draft-banner"]') !== null })`,
    );
    check(
      "after reload the stale draft is still in localStorage and offered by the draft banner",
      survivingDraft.stored?.includes(rectB) === true && survivingDraft.banner,
      draftKey,
    );
    await shot(tabB, "06-draft-after-reload-1440");
    await after(expectEvent(tabB, "draft restored", "draft-restored"), () =>
      tabB.click('[data-testid="draft-banner"] button'),
    );
    await after(expectEvent(tabB, "restored draft save conflicts", "conflict", saveConflict), () =>
      tabB.evaluate(leaveWindow),
    );
    await after(expectEvent(tabB, "merged save", "saved", saveOk), () =>
      tabB.click('[data-testid="conflict-banner"] button'),
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

    // Verifier repro (three-way merge): B saves a drawing, deletes it locally, another writer
    // saves a competing drawing, and 최신본에 내 그림 합치기 must not bring the deleted one back.
    const rectC = `qa-rect-c-${runId}`;
    const rectD = `qa-rect-d-${runId}`;
    await after(expectEvent(tabB, "B dirty with rectD", "dirty"), () =>
      tabB.evaluate(drawScript(rectangle(rectD, 760, -260, "#2f9e44"))),
    );
    await after(expectEvent(tabB, "B saved rectD with Cmd+S", "saved", saveOk), () =>
      tabB.press("s", { modifiers: ["Meta"] }),
    );
    await after(expectEvent(tabB, "B dirty after deleting rectD", "dirty"), () =>
      tabB.evaluate(deleteScript(rectD)),
    );
    const beforeCompeting = await serverFigure();
    const competing = await call(
      "PUT",
      `/api/projects/${qaProject}/figures/${artifact}/scene`,
      false,
      {
        expectedToken: beforeCompeting.token,
        scene: {
          ...beforeCompeting.scene,
          elements: [...beforeCompeting.scene.elements, rectangle(rectC, 760, 0, "#f08c00")],
        },
      },
    );
    await after(
      expectEvent(tabB, "conflict after the local deletion", "conflict", saveConflict),
      () => tabB.evaluate(leaveWindow),
    );
    await after(expectEvent(tabB, "merged save after the local deletion", "saved", saveOk), () =>
      tabB.click('[data-testid="conflict-banner"] button'),
    );
    const editorAfterDeletion = await sceneIds(tabB);
    const serverAfterDeletion = (await serverFigure()).scene.elements.map((element) => element.id);
    check(
      "merge after a local deletion keeps it deleted and keeps the competing drawing (3-way)",
      competing.status === 200 &&
        !serverAfterDeletion.includes(rectD) &&
        !editorAfterDeletion.includes(rectD) &&
        [rectA, rectB, rectC].every(
          (id) => serverAfterDeletion.includes(id) && editorAfterDeletion.includes(id),
        ),
      `competing save ${competing.status}; server has rectD: ${serverAfterDeletion.includes(rectD)}`,
    );
    await shot(tabB, "07b-merged-after-deletion-1440");

    // A publish that removes an agent node keeps every human drawing.
    const route = (parsedSpec.learning as { route?: { semanticId: string }[] } | undefined)?.route;
    const nodeIds = new Set(
      (spec as { nodes: { semanticId: string }[] }).nodes.map((node) => node.semanticId),
    );
    const removedNode = route?.find((step) => nodeIds.has(step.semanticId))?.semanticId ?? "";
    const current = await serverFigure();
    const nextSpec = structuredClone(current.spec) as {
      nodes: { semanticId: string }[];
      edges: { semanticId: string; from: string; to: string }[];
      revision: number;
      learning?: { route: { semanticId: string }[]; verify: { semanticId: string }[] };
    };
    nextSpec.nodes = nextSpec.nodes.filter((node) => node.semanticId !== removedNode);
    nextSpec.edges = nextSpec.edges.filter((e) => e.from !== removedNode && e.to !== removedNode);
    if (nextSpec.learning !== undefined) {
      nextSpec.learning.route = nextSpec.learning.route.filter((s) => s.semanticId !== removedNode);
      nextSpec.learning.verify = nextSpec.learning.verify.filter(
        (s) => s.semanticId !== removedNode,
      );
    }
    nextSpec.revision += 1;
    const republished = await call("POST", "/api/publish", true, {
      projectId: qaProject,
      repoName: "visual-learning",
      commit: parsedSpec.source.commit,
      figures: [{ spec: nextSpec, scene: current.scene, verify: seedVerifyRuns(nextSpec) }],
    });
    const refresh = (republished.body["results"] as { outcome: string }[] | undefined)?.[0];
    check(
      "publish removing a node refreshes the figure",
      removedNode.length > 0 && refresh?.outcome === "refreshed",
      JSON.stringify(refresh ?? republished.body),
    );
    const afterPublish = await serverFigure();
    const humanKept = [rectA, rectB].every((id) =>
      afterPublish.scene.elements.some((element) => element.id === id),
    );
    check("publish keeps both human drawings", humanKept);
    await after(expectEvent(tabA, "A ready after publish", "ready", ready), () => tabA.reload());
    const afterPublishIds = await sceneIds(tabA);
    check(
      "the editor shows both human drawings after the publish",
      [rectA, rectB].every((id) => afterPublishIds.includes(id)),
    );

    // Mobile width.
    const mobile = await openView("M", baseUrl, 390, 844);
    await after(
      expectEvent(mobile, "mobile home", "loaded", { ...loaded("projects"), navigation: true }),
      () => mobile.navigate(`${baseUrl}/`),
    );
    await shot(mobile, "12-home-390");
    await after(expectEvent(mobile, "mobile editor", "ready", ready), () =>
      mobile.navigate(`${baseUrl}${figureRoute}`),
    );
    const innerWidth = await mobile.evaluate<number>("window.innerWidth");
    check("390: viewport really is 390 CSS px wide", innerWidth === 390, `${innerWidth}`);
    const mobileView = await viewportReport(mobile);
    checkReadableLabels(390, mobileView);
    check(
      "390: drawing canvas is >= 60vh tall",
      mobileView.canvas[1] !== undefined && mobileView.canvas[1] >= 0.6 * mobileView.innerHeight,
      `${mobileView.canvas[1]}/${mobileView.innerHeight}`,
    );
    check(
      "390: the figure starts below Excalidraw's top menu and shape toolbar",
      mobileView.figure[1] !== undefined && mobileView.figure[1] >= mobileView.topBar,
      `figure top ${mobileView.figure[1]}, toolbar bottom ${mobileView.topBar}`,
    );
    const zoomBar = await mobile.evaluate<{ visible: boolean; outside: boolean }>(`(() => {
      const bar = document.querySelector('[data-testid="zoom-group"]');
      const host = document.querySelector('[data-testid="excalidraw-host"]').getBoundingClientRect();
      const r = bar.getBoundingClientRect();
      return { visible: bar.checkVisibility() && r.width > 0,
        outside: r.bottom <= host.top || r.top >= host.bottom };
    })()`);
    await after(expectEvent(mobile, "390: zoomed in", "viewport", viewportPlaced("zoom")), () =>
      mobile.click('[data-testid="zoom-in"]'),
    );
    const zoomedIn = await mobile.evaluate<number>(
      "window.visualAtlasEditor.getAppState().zoom.value",
    );
    await after(expectEvent(mobile, "390: zoomed out", "viewport", viewportPlaced("zoom")), () =>
      mobile.click('[data-testid="zoom-out"]'),
    );
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
