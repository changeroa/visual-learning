import { RuntimeError } from "../../src/errors";
import {
  buildReadinessWait,
  evalValueSchema,
  readinessSchema,
  type TargetInfo,
  targetInfoSchema,
  targetsSchema,
} from "./renderer-cdp-readiness";
import {
  browserUrl,
  type CdpEvent,
  type CdpSocketFactory,
  type CdpStderrReader,
  CdpTransport,
  isRecoverableCdpError,
} from "./renderer-cdp-transport";
import { activateDocumentedCli } from "./renderer-cdp-ui";

const APP_URL = "app://obsidian.md/index.html";
type TargetToken = { readonly info: TargetInfo; readonly revision: number };

class TargetTracker {
  private readonly targets = new Map<string, TargetToken>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private readonly unsubscribe: () => void;

  constructor(private readonly browser: CdpTransport) {
    this.unsubscribe = browser.subscribe((event) => this.observe(event));
  }

  async start(timeoutMs: number): Promise<void> {
    await this.browser.request("Target.setDiscoverTargets", { discover: true }, timeoutMs);
    await this.refresh(timeoutMs);
  }

  async candidate(excluded: TargetToken | undefined, deadline: number): Promise<TargetToken> {
    while (true) {
      await this.refresh(remaining(deadline));
      const found = [...this.targets.values()].find(
        (target) =>
          target.info.type === "page" &&
          target.info.url === APP_URL &&
          (excluded === undefined ||
            target.info.targetId !== excluded.info.targetId ||
            target.revision !== excluded.revision),
      );
      if (found !== undefined) return found;
      await this.changed(remaining(deadline));
    }
  }

  watchReplacement(target: TargetToken, replace: () => void): () => void {
    const inspect = () => {
      const current = this.targets.get(target.info.targetId);
      const another = [...this.targets.values()].some(
        (item) => item.info.type === "page" && item.info.url === APP_URL && item !== current,
      );
      if (current === undefined || current.revision !== target.revision || another) replace();
    };
    this.listeners.add(inspect);
    return () => this.listeners.delete(inspect);
  }

  close(): void {
    this.unsubscribe();
  }

  private async refresh(timeoutMs: number): Promise<void> {
    const snapshot = targetsSchema.parse(
      await this.browser.request("Target.getTargets", {}, timeoutMs),
    );
    const active = new Set(snapshot.targetInfos.map((info) => info.targetId));
    for (const id of this.targets.keys()) if (!active.has(id)) this.targets.delete(id);
    for (const info of snapshot.targetInfos) {
      const prior = this.targets.get(info.targetId);
      if (prior === undefined) this.targets.set(info.targetId, { info, revision: ++this.revision });
      else if (JSON.stringify(prior.info) !== JSON.stringify(info))
        this.targets.set(info.targetId, { info, revision: ++this.revision });
    }
  }

  private observe(event: CdpEvent): void {
    if (event.method === "Target.targetDestroyed") {
      const id = event.params["targetId"];
      if (typeof id === "string") this.targets.delete(id);
    } else if (
      event.method === "Target.targetCreated" ||
      event.method === "Target.targetInfoChanged"
    ) {
      const parsed = targetInfoSchema.safeParse(event.params["targetInfo"]);
      if (parsed.success)
        this.targets.set(parsed.data.targetId, {
          info: parsed.data,
          revision: ++this.revision,
        });
    } else return;
    for (const listener of this.listeners) listener();
  }

  private changed(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const listener = () => {
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve();
      };
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new RuntimeError("CDP app page target readiness timed out"));
      }, timeoutMs);
      this.listeners.add(listener);
    });
  }
}

function remaining(deadline: number): number {
  const value = deadline - Date.now();
  if (value <= 0) throw new RuntimeError("CDP semantic readiness timed out");
  return value;
}

async function evaluate(
  cdp: CdpTransport,
  expression: string,
  timeoutMs: number,
): Promise<unknown> {
  const parsed = evalValueSchema.parse(
    await cdp.request(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      timeoutMs,
    ),
  );
  if (parsed.exceptionDetails !== undefined)
    throw new RuntimeError(`CDP evaluation failed: ${parsed.exceptionDetails.text}`);
  return parsed.result.value;
}

export async function runOnReadyPage<T>(
  options: {
    readonly browserUrl: string;
    readonly address: string;
    readonly port: number;
    readonly expectedVault: string;
    readonly socketFactory?: CdpSocketFactory;
    readonly timeoutMs?: number;
  },
  action: (page: CdpTransport, targetId: string) => Promise<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const deadline = Date.now() + timeoutMs;
  const browser = await CdpTransport.connect(
    options.browserUrl,
    options.socketFactory,
    remaining(deadline),
  );
  const tracker = new TargetTracker(browser);
  let failed: TargetToken | undefined;
  try {
    await tracker.start(remaining(deadline));
    while (true) {
      const target = await tracker.candidate(failed, deadline);
      const page = await CdpTransport.connect(
        `ws://${options.address}:${options.port}/devtools/page/${target.info.targetId}`,
        options.socketFactory,
        remaining(deadline),
      );
      const stopReplacement = tracker.watchReplacement(target, () => page.close());
      try {
        const ready = readinessSchema.parse(
          await evaluate(
            page,
            buildReadinessWait(options.expectedVault, remaining(deadline)),
            remaining(deadline),
          ),
        );
        if (ready.basePath !== options.expectedVault)
          throw new RuntimeError(`isolated base path mismatch: ${ready.basePath}`);
        return await action(page, target.info.targetId);
      } catch (error) {
        if (!isRecoverableCdpError(error)) throw error;
        failed = target;
      } finally {
        stopReplacement();
        page.close();
      }
    }
  } finally {
    tracker.close();
    browser.close();
  }
}

export async function enableDocumentedCliToggle(
  stderr: CdpStderrReader,
  address: string,
  port: number,
  expectedVault: string,
): Promise<void> {
  const deadline = Date.now() + 90_000;
  await runOnReadyPage(
    { browserUrl: await browserUrl(stderr), address, port, expectedVault, timeoutMs: 90_000 },
    async (cdp) => activateDocumentedCli(cdp, deadline),
  );
}
