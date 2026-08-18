import type { ReadableStreamDefaultReader as NodeStreamReader } from "node:stream/web";
import { RuntimeError } from "../../src/errors";

export type CdpStderrReader = NodeStreamReader<Uint8Array<ArrayBuffer>>;
export type CdpSocket = {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(value: string): void;
  close(): void;
};
export type CdpSocketFactory = (url: string) => CdpSocket;
export type CdpEvent = {
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
};
type Pending = {
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: RuntimeError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

export async function browserUrl(reader: CdpStderrReader): Promise<string> {
  let output = "";
  const timer = setTimeout(() => reader.cancel(), 45_000);
  while (!output.includes("DevTools listening on")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    output += new TextDecoder().decode(chunk.value);
  }
  clearTimeout(timer);
  const found = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
  if (found === undefined) throw new RuntimeError("CDP endpoint was not announced");
  return found;
}

export function isRecoverableCdpError(error: unknown): boolean {
  return (
    error instanceof RuntimeError &&
    /socket|context lost|Execution context was destroyed|Cannot find context/.test(error.message)
  );
}

function defaultFactory(url: string): CdpSocket {
  return new WebSocket(url);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export class CdpTransport {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: CdpEvent) => void>();

  private constructor(private readonly socket: CdpSocket) {
    socket.onmessage = (event) => this.receive(event.data);
    socket.onerror = () => this.failAll("CDP socket error");
    socket.onclose = () => this.failAll("CDP socket closed");
  }

  static async connect(
    url: string,
    factory: CdpSocketFactory = defaultFactory,
    timeoutMs = 30_000,
  ): Promise<CdpTransport> {
    const socket = factory(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new RuntimeError("CDP connection timed out")),
        timeoutMs,
      );
      socket.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new RuntimeError("CDP connection failed"));
      };
      socket.onclose = () => {
        clearTimeout(timer);
        reject(new RuntimeError("CDP socket closed before connection"));
      };
    });
    return new CdpTransport(socket);
  }

  get pendingRequestCount(): number {
    return this.pending.size;
  }

  subscribe(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async request(
    method: string,
    params: Readonly<Record<string, unknown>> = {},
    timeoutMs = 45_000,
  ): Promise<unknown> {
    if (this.socket.readyState !== 1) throw new RuntimeError("CDP socket is not open");
    const id = this.nextId;
    this.nextId += 1;
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RuntimeError(`CDP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  close(): void {
    this.failAll("CDP socket closed");
    this.socket.close();
  }

  private receive(raw: unknown): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      this.failAll("CDP returned malformed JSON");
      return;
    }
    const message = record(parsed);
    const method = message["method"];
    if (typeof method === "string") {
      const params = record(message["params"]);
      if (
        method === "Runtime.executionContextDestroyed" ||
        method === "Runtime.executionContextsCleared"
      )
        this.failAll("CDP execution context lost");
      for (const listener of this.listeners) listener({ method, params });
      return;
    }
    const id = message["id"];
    if (typeof id !== "number") return;
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    const error = record(message["error"]);
    if (typeof error["message"] === "string") pending.reject(new RuntimeError(error["message"]));
    else pending.resolve(message["result"]);
  }

  private failAll(message: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new RuntimeError(`${message}: ${pending.method}`));
    }
    this.pending.clear();
  }
}
