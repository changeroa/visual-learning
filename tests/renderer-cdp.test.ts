import { expect, test } from "bun:test";
import { runOnReadyPage } from "../scripts/qa/renderer-cdp";
import { buildReadinessWait, buildToggleProbe } from "../scripts/qa/renderer-cdp-readiness";
import {
  type CdpSocket,
  type CdpSocketFactory,
  CdpTransport,
} from "../scripts/qa/renderer-cdp-transport";

type Handler<T> = ((event: T) => void) | null;

class MockSocket implements CdpSocket {
  onopen: Handler<Event> = null;
  onmessage: Handler<MessageEvent> = null;
  onerror: Handler<Event> = null;
  onclose: Handler<CloseEvent> = null;
  readonly sent: string[] = [];
  readyState = 0;

  constructor(
    readonly url: string,
    private readonly sentHandler?: (value: unknown) => void,
  ) {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    });
  }

  send(value: string): void {
    this.sent.push(value);
    this.sentHandler?.(JSON.parse(value));
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }

  message(value: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(value) }));
  }
}

const readiness = {
  ready: true,
  failedPredicates: [],
  url: "app://obsidian.md/index.html",
  readyState: "complete",
  inProgress: false,
  appPresent: true,
  workspacePresent: true,
  vaultPresent: true,
  layoutReady: true,
  basePath: "/tmp/t5r-vault",
  settingsPresent: true,
  settingsVisible: true,
};

test("documented CLI probe uses the same visible side-dock Settings control as readiness", async () => {
  let settingsClicked = false;
  let generalClicked = false;
  const control = {
    classList: { contains: () => false },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 30, height: 40 }),
  };
  const item = {
    querySelector: (selector: string) =>
      selector === ".setting-item-name"
        ? { textContent: "Command line interface" }
        : selector === ".checkbox-container"
          ? control
          : null,
  };
  const settings = { click: () => (settingsClicked = true) };
  const general = {
    textContent: "General",
    click: () => (generalClicked = true),
  };
  const documentValue = {
    querySelector: (selector: string) =>
      selector === '[aria-label="Settings"],.side-dock-settings' ? settings : null,
    querySelectorAll: (selector: string) =>
      selector === ".vertical-tab-nav-item" ? [general] : [item],
  };
  const execute = new Function("document", `return ${buildToggleProbe()}`) as (
    documentArg: typeof documentValue,
  ) => Promise<unknown>;

  await expect(execute(documentValue)).resolves.toEqual({
    x: 25,
    y: 40,
    enabled: false,
  });
  expect(settingsClicked).toBe(true);
  expect(generalClicked).toBe(true);
});

test("semantic readiness subscribes before documentElement exists and never observes null", async () => {
  const listeners = new Map<string, () => void>();
  const observed: object[] = [];
  const documentElement = {};
  const settings = {
    classList: { contains: () => false },
    getAttribute: () => "Settings",
    offsetWidth: 20,
    offsetHeight: 20,
    getClientRects: () => [1],
  };
  const documentValue = {
    documentElement: null as object | null,
    readyState: "loading",
    body: { classList: { contains: () => false } },
    querySelectorAll: () => [settings],
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  const windowValue = {
    app: {
      workspace: { layoutReady: true },
      vault: { adapter: { getBasePath: () => readiness.basePath } },
    },
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  class MockMutationObserver {
    constructor(private readonly listener: () => void) {}
    observe(target: object | null): void {
      if (target === null) throw new TypeError("observe(null)");
      observed.push(target);
    }
    disconnect(): void {}
    trigger(): void {
      this.listener();
    }
  }
  const execute = new Function(
    "document",
    "window",
    "MutationObserver",
    "location",
    `return ${buildReadinessWait(readiness.basePath, 1_000)}`,
  ) as (
    documentArg: typeof documentValue,
    windowArg: typeof windowValue,
    observerArg: typeof MockMutationObserver,
    locationArg: { href: string },
  ) => Promise<unknown>;

  const result = execute(documentValue, windowValue, MockMutationObserver, {
    href: readiness.url,
  });
  expect(listeners.has("DOMContentLoaded")).toBe(true);
  expect(listeners.has("readystatechange")).toBe(true);
  expect(observed).toEqual([]);
  documentValue.documentElement = documentElement;
  documentValue.readyState = "complete";
  listeners.get("DOMContentLoaded")?.();

  await expect(result).resolves.toMatchObject({ ready: true, basePath: readiness.basePath });
  expect(observed).toEqual([documentElement]);
});

test("CDP transport rejects pending work immediately on close and context loss", async () => {
  const sockets: MockSocket[] = [];
  const factory: CdpSocketFactory = (url) => {
    const socket = new MockSocket(url);
    sockets.push(socket);
    return socket;
  };
  const closed = await CdpTransport.connect("ws://mock/close", factory);
  const pendingClose = closed.request("Runtime.evaluate");
  sockets[0]?.close();
  await expect(pendingClose).rejects.toThrow("CDP socket closed");
  expect(closed.pendingRequestCount).toBe(0);

  const lost = await CdpTransport.connect("ws://mock/context", factory);
  const pendingContext = lost.request("Runtime.evaluate");
  sockets[1]?.message({ method: "Runtime.executionContextsCleared", params: {} });
  await expect(pendingContext).rejects.toThrow("CDP execution context lost");
  expect(lost.pendingRequestCount).toBe(0);
});

test("CDP readiness reacquires a replacement page target without sleeping", async () => {
  let browser: MockSocket | undefined;
  let currentTarget = "page-1";
  const pages: string[] = [];
  const factory: CdpSocketFactory = (url) => {
    const socket = new MockSocket(url, (raw) => {
      const request = raw as { id: number; method: string };
      if (url === "ws://mock/browser") {
        if (request.method === "Target.setDiscoverTargets")
          queueMicrotask(() => socket.message({ id: request.id, result: {} }));
        if (request.method === "Target.getTargets")
          queueMicrotask(() =>
            socket.message({
              id: request.id,
              result: {
                targetInfos: [{ targetId: currentTarget, type: "page", url: readiness.url }],
              },
            }),
          );
      } else if (url.endsWith("/page-1") && request.method === "Runtime.evaluate") {
        queueMicrotask(() => {
          socket.close();
          currentTarget = "page-2";
          browser?.message({
            method: "Target.targetDestroyed",
            params: { targetId: "page-1" },
          });
          browser?.message({
            method: "Target.targetCreated",
            params: {
              targetInfo: { targetId: "page-2", type: "page", url: readiness.url },
            },
          });
        });
      } else if (url.endsWith("/page-2") && request.method === "Runtime.evaluate") {
        queueMicrotask(() =>
          socket.message({
            id: request.id,
            result: { result: { value: readiness } },
          }),
        );
      }
    });
    if (url === "ws://mock/browser") browser = socket;
    if (url.includes("/devtools/page/")) pages.push(url.split("/").at(-1) ?? "");
    return socket;
  };

  const selected = await runOnReadyPage(
    {
      browserUrl: "ws://mock/browser",
      address: "mock",
      port: 1,
      expectedVault: readiness.basePath,
      socketFactory: factory,
      timeoutMs: 1_000,
    },
    async (_page, targetId) => targetId,
  );

  expect(selected).toBe("page-2");
  expect(pages).toEqual(["page-1", "page-2"]);
});
