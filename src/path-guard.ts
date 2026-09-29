import { lstatSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import { InputError } from "./errors";

export function ensureNormalizedAbsolute(path: string, label: string): string {
  if (!isAbsolute(path) || path === "/" || normalize(path) !== path) {
    throw new InputError(`${label} must be a normalized absolute non-root path`);
  }
  return path;
}

export function ensureRealDirectory(path: string, label: string): string {
  const checked = ensureNormalizedAbsolute(path, label);
  const parts = checked.split(sep).filter(Boolean);
  let current: string = sep;
  for (const part of parts) {
    current = join(current, part);
    let status: ReturnType<typeof lstatSync>;
    try {
      status = lstatSync(current);
    } catch (error) {
      throw new InputError(`${label} is unavailable: ${path}`, { cause: error });
    }
    if (status.isSymbolicLink()) {
      throw new InputError(
        `${label} has a symlinked ancestor: ${current}; resolve it with realpath first`,
      );
    }
    if (!status.isDirectory()) {
      throw new InputError(`${label} must be a real directory`);
    }
  }
  return checked;
}
