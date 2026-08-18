import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { artifactPaths, noteBytes } from "./artifact-files";
import { ConflictError, InputError } from "./errors";
import { encodeSceneToMarkdown, parseSceneMarkdown } from "./excalidraw-file";
import { jsonBytes } from "./io";
import { applyRefreshToScene } from "./refresh-apply";
import type { VisualNoteSpec } from "./schema";

type TokenState = { readonly currentToken: string; readonly lastIssued: number };

function statePath(vault: string, project: string, artifactId: string): string {
  return join(
    vault,
    artifactPaths(project, artifactId).drawingFolder,
    `${artifactId}.refresh-state.json`,
  );
}

function lockPath(vault: string, project: string, artifactId: string): string {
  return join(
    vault,
    artifactPaths(project, artifactId).drawingFolder,
    `${artifactId}.refresh.lock`,
  );
}

function readState(path: string): TokenState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { currentToken?: unknown }).currentToken === "string" &&
      typeof (parsed as { lastIssued?: unknown }).lastIssued === "number"
    ) {
      return parsed as TokenState;
    }
  } catch {}
  return { currentToken: "cas-0", lastIssued: 0 };
}

function writeAtomic(path: string, bytes: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, path);
}

export function refreshArtifact(input: {
  readonly vault: string;
  readonly project: string;
  readonly spec: VisualNoteSpec;
  readonly expectedToken: string;
}): {
  readonly operation: "refresh";
  readonly token: string;
  readonly deprecatedAnchors: readonly string[];
} {
  if (!lstatSync(input.vault).isDirectory()) throw new InputError("vault must be a directory");
  const paths = artifactPaths(input.project, input.spec.artifactId);
  const drawingPath = join(input.vault, paths.drawing);
  const lock = lockPath(input.vault, input.project, input.spec.artifactId);
  let descriptor = -1;
  try {
    descriptor = openSync(lock, "wx");
  } catch {
    throw new ConflictError(`refresh conflict: ${input.spec.artifactId}`);
  }
  try {
    const stateFile = statePath(input.vault, input.project, input.spec.artifactId);
    const state = readState(stateFile);
    if (state.currentToken !== input.expectedToken)
      throw new ConflictError(`refresh conflict: expected ${input.expectedToken}`);
    const current = parseSceneMarkdown(readFileSync(drawingPath, "utf8")).scene;
    const { scene: finalScene, deprecatedAnchors } = applyRefreshToScene(current, input.spec);
    const nextToken = `cas-${state.lastIssued + 1}`;
    writeAtomic(drawingPath, encodeSceneToMarkdown(finalScene));
    writeAtomic(join(input.vault, paths.spec), jsonBytes(input.spec));
    writeAtomic(
      join(input.vault, paths.note),
      noteBytes(input.spec, paths.drawing, paths.svg, deprecatedAnchors),
    );
    writeAtomic(
      stateFile,
      `${JSON.stringify({ currentToken: nextToken, lastIssued: state.lastIssued + 1 }, null, 2)}\n`,
    );
    return { operation: "refresh", token: nextToken, deprecatedAnchors };
  } finally {
    if (descriptor >= 0) closeSync(descriptor);
    try {
      unlinkSync(lock);
    } catch {}
  }
}
