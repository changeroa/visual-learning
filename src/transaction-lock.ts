import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { ConflictError } from "./errors";

export type LockMode = "shared" | "exclusive";
export type LockHandle = {
  readonly root: string;
  readonly mode: LockMode;
  readonly path: string;
  close(): void;
};

function closeHandle(root: string, path: string): void {
  rmSync(path, { force: true, recursive: true });
  try {
    rmSync(join(root, "readers"), { force: false, recursive: false });
  } catch {}
}

function readerPath(root: string): string {
  return join(root, "readers", `${process.pid}-${randomUUID()}`);
}

function writerPath(root: string): string {
  return join(root, "writer");
}

function createMarker(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx", 0o600);
  closeSync(descriptor);
  writeFileSync(path, `${process.pid}\n`);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function markerAlive(path: string): boolean {
  try {
    const pid = Number(readFileSync(path, "utf8").trim());
    return Number.isInteger(pid) && pidAlive(pid);
  } catch {
    return false;
  }
}

function pruneDeadReaders(root: string): boolean {
  try {
    const readerRoot = join(root, "readers");
    let alive = false;
    for (const entry of readdirSync(readerRoot)) {
      const path = join(readerRoot, entry);
      if (markerAlive(path)) alive = true;
      else rmSync(path, { force: true, recursive: true });
    }
    return alive;
  } catch {
    return false;
  }
}

function clearDeadWriter(root: string): void {
  const writer = writerPath(root);
  if (existsSync(writer) && !markerAlive(writer)) rmSync(writer, { force: true, recursive: true });
}

export function acquireLock(root: string, mode: LockMode): LockHandle {
  mkdirSync(root, { recursive: true });
  const writer = writerPath(root);
  clearDeadWriter(root);
  if (mode === "exclusive") {
    try {
      createMarker(writer);
      if (pruneDeadReaders(root)) {
        closeHandle(root, writer);
        throw new ConflictError(`lock busy: ${root}`);
      }
      return { root, mode, path: writer, close: () => closeHandle(root, writer) };
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      throw new ConflictError(`lock busy: ${root}`);
    }
  }
  if (existsSync(writer)) throw new ConflictError(`lock busy: ${root}`);
  const reader = readerPath(root);
  createMarker(reader);
  clearDeadWriter(root);
  if (existsSync(writer)) {
    closeHandle(root, reader);
    throw new ConflictError(`lock busy: ${root}`);
  }
  return { root, mode, path: reader, close: () => closeHandle(root, reader) };
}
