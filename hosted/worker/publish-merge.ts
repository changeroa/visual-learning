import { InputError } from "../../src/errors";
import type { ExcalidrawScene } from "../../src/excalidraw-file";
import { applyRefreshToScene } from "../../src/refresh-apply";
import { buildReferenceGraph } from "../../src/refresh-scene";
import { parseHostedVisualNoteSpec } from "../../src/schema";
import {
  commitScene,
  createFigure,
  type D1Like,
  markOrphanedNotes,
  readFigure,
  replaceVerifyRuns,
  type VerifyRun,
} from "./atlas-store";

export type PublishFigureResult = {
  readonly artifactId: string;
  readonly outcome: "created" | "refreshed" | "conflict";
  readonly token: string;
  readonly deprecatedAnchors: readonly string[];
  readonly orphanedNotes: readonly string[];
};

function parseSpec(input: unknown) {
  try {
    return parseHostedVisualNoteSpec(input);
  } catch (error) {
    throw new InputError("invalid publish spec", { cause: error });
  }
}

export function validateScene(scene: ExcalidrawScene, artifactId: string): void {
  try {
    const graph = buildReferenceGraph(scene, artifactId);
    if (graph.dangling.length > 0)
      throw new InputError(`dangling scene references: ${graph.dangling.join(", ")}`);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("invalid scene references", { cause: error });
  }
}

function currentResult(
  figure: NonNullable<Awaited<ReturnType<typeof readFigure>>>,
): PublishFigureResult {
  return {
    artifactId: figure.artifactId,
    outcome: "conflict",
    token: figure.token,
    deprecatedAnchors: figure.deprecatedAnchors,
    orphanedNotes: figure.notes.filter((note) => note.orphaned).map((note) => note.nodeKey),
  };
}

export async function publishFigure(
  store: D1Like,
  input: {
    readonly project: string;
    readonly spec: unknown;
    readonly scene: ExcalidrawScene;
    readonly verify: readonly VerifyRun[];
  },
): Promise<PublishFigureResult> {
  const spec = parseSpec(input.spec);
  const current = await readFigure(store, input.project, spec.artifactId);
  let outcome: "created" | "refreshed";
  let token: string;
  let deprecatedAnchors: readonly string[];

  if (current === null) {
    validateScene(input.scene, spec.artifactId);
    const created = await createFigure(store, {
      project: input.project,
      spec,
      scene: input.scene,
      deprecatedAnchors: [],
    });
    if (created.outcome === "exists") {
      const raced = await readFigure(store, input.project, spec.artifactId);
      if (raced === null) throw new Error("created figure disappeared");
      return currentResult(raced);
    }
    outcome = "created";
    token = created.token;
    deprecatedAnchors = [];
  } else {
    const refreshed = applyRefreshToScene(current.scene, spec);
    const committed = await commitScene(store, {
      project: input.project,
      artifact: spec.artifactId,
      expectedToken: current.token,
      scene: refreshed.scene,
      spec,
      source: "publish",
      deprecatedAnchors: refreshed.deprecatedAnchors,
    });
    if (committed.outcome !== "committed") {
      const raced = await readFigure(store, input.project, spec.artifactId);
      if (raced === null) throw new Error("published figure disappeared");
      return currentResult(raced);
    }
    outcome = "refreshed";
    token = committed.token;
    deprecatedAnchors = refreshed.deprecatedAnchors;
  }

  const liveSemanticIds = [
    ...spec.nodes.map((node) => node.semanticId),
    ...spec.edges.map((edge) => edge.semanticId),
  ];
  await markOrphanedNotes(store, input.project, spec.artifactId, liveSemanticIds);
  await replaceVerifyRuns(store, input.project, spec.artifactId, input.verify);
  const stored = await readFigure(store, input.project, spec.artifactId);
  if (stored === null) throw new Error("published figure disappeared");
  return {
    artifactId: spec.artifactId,
    outcome,
    token,
    deprecatedAnchors,
    orphanedNotes: stored.notes.filter((note) => note.orphaned).map((note) => note.nodeKey),
  };
}
