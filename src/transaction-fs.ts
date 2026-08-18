import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { sha256 } from "./io";

export function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function fsyncFile(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function writeTextFsynced(path: string, value: string): void {
  ensureDirectory(dirname(path));
  writeFileSync(path, value);
  fsyncFile(path);
}

export function renameAtomic(source: string, target: string): void {
  ensureDirectory(dirname(target));
  renameSync(source, target);
  fsyncDirectory(dirname(target));
}

export function writeAtomicText(path: string, value: string): void {
  const temporary = join(
    dirname(path),
    `.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  writeTextFsynced(temporary, value);
  renameAtomic(temporary, path);
}

export function removePath(path: string): void {
  rmSync(path, { recursive: true, force: true });
  try {
    fsyncDirectory(dirname(path));
  } catch {}
}

export function writeJsonAtomic(path: string, value: unknown): void {
  writeAtomicText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readDigest(path: string): string {
  return existsSync(path) ? sha256(readFileSync(path)) : "missing";
}

export function copyText(source: string, target: string): void {
  writeTextFsynced(target, readFileSync(source, "utf8"));
}

export function removeFile(path: string): void {
  try {
    unlinkSync(path);
  } catch {}
}
