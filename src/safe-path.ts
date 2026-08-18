import { isAbsolute, normalize } from "node:path";
import { CollisionError, InputError } from "./errors";

const helper = new URL("../scripts/internal/safe-fs.py", import.meta.url).pathname;

function assertRoot(root: string): void {
  if (!isAbsolute(root) || root === "/" || normalize(root) !== root) {
    throw new InputError("root must be a normalized absolute non-root path");
  }
}

function assertRelative(relativePath: string): void {
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    normalize(relativePath) !== relativePath ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new InputError(`unsafe relative path: ${relativePath}`);
  }
}

function runSafeFs(
  command: "create" | "mkdirs",
  root: string,
  relativePath: string,
  bytes?: string,
): void {
  assertRoot(root);
  assertRelative(relativePath);
  const result = Bun.spawnSync(["/usr/bin/python3", helper, command, root, relativePath], {
    stdin: bytes === undefined ? undefined : Buffer.from(bytes),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode === 0) return;
  const detail = result.stderr.toString().trim();
  if (detail.includes("target collision")) throw new CollisionError(relativePath);
  throw new InputError(detail || `safe filesystem helper exited ${result.exitCode}`);
}

export function safeCreateFile(root: string, relativePath: string, bytes: string): void {
  runSafeFs("create", root, relativePath, bytes);
}

export function safeMakeDirectories(root: string, relativePath: string): void {
  runSafeFs("mkdirs", root, relativePath);
}
