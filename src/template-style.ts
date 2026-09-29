import type { VisualNoteSpec } from "./schema";
import type { ClaimConfidence } from "./template-schema";

type Status = VisualNoteSpec["nodes"][number]["status"];

export type VisualCategory =
  | "cloudflare"
  | "aws"
  | "external"
  | "data"
  | "runtime"
  | "security"
  | "risk"
  | "neutral";

export type PlannedElementRole =
  | "title"
  | "frame-shape"
  | "frame-label"
  | "node-shape"
  | "node-label"
  | "edge-line"
  | "edge-label";

export type PlannedElementType = "rectangle" | "ellipse" | "diamond" | "text" | "arrow";

export type PlannedElementStyle = {
  readonly strokeColor: string;
  readonly backgroundColor: string;
  readonly fillStyle: "solid";
  readonly fontFamily: 1 | 2 | null;
};

export type ClaimStyle = {
  readonly semanticId: string;
  readonly status: Status;
  readonly confidence: ClaimConfidence;
  readonly className: string;
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly dashArray: string | null;
  readonly badge: string;
};

const palettes = {
  fact: { fill: "#dcfce7", stroke: "#15803d", text: "#14532d", badge: "FACT" },
  inference: {
    fill: "#fef3c7",
    stroke: "#b45309",
    text: "#78350f",
    badge: "INFERENCE",
  },
  question: { fill: "#ede9fe", stroke: "#6d28d9", text: "#4c1d95", badge: "QUESTION" },
} as const;

const categoryPalettes = {
  cloudflare: { stroke: "#e8590c", background: "#fff4e6" },
  aws: { stroke: "#f08c00", background: "#fff9db" },
  external: { stroke: "#64748b", background: "#f8fafc" },
  data: { stroke: "#1971c2", background: "#e7f5ff" },
  runtime: { stroke: "#7950f2", background: "#f3f0ff" },
  security: { stroke: "#2f9e44", background: "#ebfbee" },
  risk: { stroke: "#e03131", background: "#fff5f5" },
  neutral: { stroke: "#475569", background: "#f8fafc" },
} as const;

export function styleForPlannedElement(input: {
  readonly category: VisualCategory;
  readonly role: PlannedElementRole;
  readonly type: PlannedElementType;
}): PlannedElementStyle {
  const palette = categoryPalettes[input.category];
  const isShape = ["rectangle", "ellipse", "diamond"].includes(input.type);
  return {
    strokeColor: palette.stroke,
    backgroundColor: isShape ? palette.background : "transparent",
    fillStyle: "solid",
    fontFamily: input.type === "text" ? (input.role === "edge-label" ? 2 : 1) : null,
  };
}

export function styleForClaim(
  semanticId: string,
  status: Status,
  confidence: ClaimConfidence,
): ClaimStyle {
  const base = palettes[status];
  return {
    semanticId,
    status,
    confidence,
    className: `${status}-${confidence}`,
    fill: base.fill,
    stroke: base.stroke,
    text: base.text,
    dashArray: confidence === "high" ? null : confidence === "medium" ? "8 4" : "4 4",
    badge:
      confidence === "unknown"
        ? `${base.badge}-UNKNOWN`
        : `${base.badge}-${confidence.toUpperCase()}`,
  };
}
