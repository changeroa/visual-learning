import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { InputError } from "./errors";
import type { VisualNoteSpec } from "./schema";

type EvidenceReference = VisualNoteSpec["nodes"][number]["evidence"][number];

type EvidenceReceipt = {
  readonly path: string;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly symbol: string | null;
  readonly resolved: true;
};

function linesFor(path: string): readonly string[] {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n").split("\n");
}

function validateLineRange(reference: EvidenceReference, absolutePath: string): void {
  if (reference.lineStart === undefined) return;
  const lines = linesFor(absolutePath);
  const lineEnd = reference.lineEnd ?? reference.lineStart;
  if (reference.lineStart > lines.length || lineEnd > lines.length) {
    throw new InputError(`evidence line is outside fixture file: ${reference.path}`);
  }
  const selected = lines.slice(reference.lineStart - 1, lineEnd);
  if (selected.every((line) => line.trim().length === 0)) {
    throw new InputError(`evidence line range is blank: ${reference.path}`);
  }
}

function validateSymbol(reference: EvidenceReference, absolutePath: string): void {
  if (reference.symbol === undefined) return;
  const contents = readFileSync(absolutePath, "utf8");
  if (!contents.includes(reference.symbol)) {
    throw new InputError(`evidence symbol is absent: ${reference.path}#${reference.symbol}`);
  }
}

export function resolveEvidence(
  repositoryRoot: string,
  references: readonly EvidenceReference[],
): readonly EvidenceReceipt[] {
  return references.map((reference) => {
    const absolutePath = join(repositoryRoot, reference.path);
    if (!existsSync(absolutePath)) {
      throw new InputError(`evidence path is absent: ${reference.path}`);
    }
    validateLineRange(reference, absolutePath);
    validateSymbol(reference, absolutePath);
    return {
      path: reference.path,
      lineStart: reference.lineStart ?? null,
      lineEnd: reference.lineEnd ?? null,
      symbol: reference.symbol ?? null,
      resolved: true,
    };
  });
}
