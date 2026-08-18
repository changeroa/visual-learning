import type { ExcalidrawScene } from "./excalidraw-file";
import type { VisualNoteSpec } from "./schema";

export type Boundary =
  | "subscribe-before-flush"
  | "flush-complete"
  | "begin-write"
  | "begin-parent-fsync"
  | "stage-working"
  | "stage-bundle"
  | "prepared-write"
  | "prepared-parent-fsync"
  | "publish-revision"
  | "revision-parent-fsync"
  | "publish-working"
  | "working-parent-fsync"
  | "source-cas"
  | "close-old-view"
  | "close-flush-complete"
  | "final-source-cas"
  | "state-rename"
  | "state-parent-fsync"
  | "validate-state-tuple"
  | "committed-write"
  | "committed-parent-fsync"
  | "open-new-view";

export type TransactionControl = { readonly onBoundary?: (name: Boundary) => void };

export type TransactionResult = {
  readonly committedToken: string;
  readonly revisionPath: string;
  readonly workingPath: string;
  readonly deprecatedAnchors: readonly string[];
  readonly sceneGeneration: number;
};

export type PreparedTransaction = {
  readonly spec: VisualNoteSpec;
  readonly scene: ExcalidrawScene;
  readonly deprecatedAnchors: readonly string[];
};
