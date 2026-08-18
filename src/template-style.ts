import type { VisualNoteSpec } from "./schema";
import type { ClaimConfidence } from "./template-schema";

type Status = VisualNoteSpec["nodes"][number]["status"];

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
