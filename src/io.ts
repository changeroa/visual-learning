import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { InputError } from "./errors";

export function readJson(path: string): unknown {
  let bytes: string;
  try {
    bytes = readFileSync(path, "utf8");
  } catch (error) {
    throw new InputError(`cannot read JSON input: ${path}`, { cause: error });
  }
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new InputError(`malformed JSON input: ${path}`, { cause: error });
  }
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function formatResult(value: unknown, json: boolean): string {
  return json ? `${JSON.stringify(value)}\n` : `OK ${JSON.stringify(value)}\n`;
}

export function writeResult(value: unknown, json: boolean): void {
  process.stdout.write(formatResult(value, json));
}
