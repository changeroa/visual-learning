import { readJson } from "./io";
import { planScene } from "./renderer-plan";
import { parseVisualNoteSpec, type VisualNoteSpec } from "./schema";

type Severity = "warn" | "info";
type Finding = {
  readonly rule: string;
  readonly severity: Severity;
  readonly target: string | null;
  readonly message: string;
  readonly basis: string;
};

const ROUTE_SUGGESTION_NODE_COUNT = 5;
const READABLE_FIGURE_WIDTH = 1600;

function questionRule(spec: VisualNoteSpec): Finding[] {
  if (spec.learning !== undefined) return [];
  return [
    {
      rule: "LR01-question",
      severity: "warn",
      target: null,
      message: "state the one question this view answers and its evidence-faithful answer",
      basis: "STRONG: task-first figure selection (research reference R1)",
    },
  ];
}

function relationRule(spec: VisualNoteSpec): Finding[] {
  return spec.edges
    .filter((edge) => edge.relation === undefined)
    .map((edge) => ({
      rule: "LR02-edge-relation",
      severity: "warn" as const,
      target: edge.semanticId,
      message:
        "declare what this arrow means: runtime-call, data-movement, state-transition, or static-reference",
      basis: "STRONG: explicit relation semantics (research reference R2)",
    }));
}

function routeRule(spec: VisualNoteSpec): Finding[] {
  const route = spec.learning?.route ?? [];
  if (spec.nodes.length < ROUTE_SUGGESTION_NODE_COUNT || route.length > 0) return [];
  return [
    {
      rule: "LR03-route",
      severity: "info",
      target: null,
      message: `offer an optional numbered reading route with one explanation per element (${spec.nodes.length} nodes)`,
      basis: "PARTIAL (debate D-02, D-13): suggested, navigable route; not mandatory",
    },
  ];
}

function scopeRule(spec: VisualNoteSpec): Finding[] {
  if (spec.learning === undefined || (spec.learning.scope?.omits.length ?? 0) > 0) return [];
  const trustBoundary = spec.kind === "trust-boundary";
  return [
    {
      rule: "LR04-scope-omits",
      severity: trustBoundary ? "warn" : "info",
      target: null,
      message: trustBoundary
        ? "a trust-boundary view is one threat-model view; list the threats, attacker capabilities, and mitigations it does not model"
        : "list what this view deliberately leaves out",
      basis: trustBoundary
        ? "SUPPORTED (debate D-16): DFD is a scoped view, not a complete threat model"
        : "STRONG as documentation practice (research reference R4); trust-calibration effect UNRESOLVED (debate E-11)",
    },
  ];
}

function verifyRule(spec: VisualNoteSpec): Finding[] {
  if (spec.learning === undefined) return [];
  const verified = new Set(spec.learning.verify.map((step) => step.semanticId));
  const routed = new Set(spec.learning.route.map((step) => step.semanticId));
  return [...spec.nodes, ...spec.edges]
    .filter(
      (claim) =>
        claim.status === "fact" && routed.has(claim.semanticId) && !verified.has(claim.semanticId),
    )
    .map((claim) => ({
      rule: "LR05-verify",
      severity: "info" as const,
      target: claim.semanticId,
      message: "give the reader a concrete way to check this routed fact (file, test, command)",
      basis: "product rule from learner profile T-1/T-8; provenance, not a learning claim (D-10)",
    }));
}

function questionStatusRule(spec: VisualNoteSpec): Finding[] {
  if (spec.learning === undefined) return [];
  const routed = new Set(spec.learning.route.map((step) => step.semanticId));
  return spec.nodes
    .filter((node) => node.status === "question" && routed.has(node.semanticId))
    .map((node) => ({
      rule: "LR06-open-question-on-route",
      severity: "info" as const,
      target: node.semanticId,
      message:
        "the reading route passes an unverified question; say in the answer what it leaves open",
      basis: "learner profile bias: first framing hardens into fact",
    }));
}

function widthRule(spec: VisualNoteSpec): Finding[] {
  const width = Math.max(
    0,
    ...planScene(spec).elements.map((element) => element.x + element.width),
  );
  if (width <= READABLE_FIGURE_WIDTH) return [];
  return [
    {
      rule: "LR07-figure-width",
      severity: "warn",
      target: null,
      message: `the planned figure is ${Math.round(width)}px wide and will shrink below readable text size at note width; group nodes into presentation frames with the components layout (presentation.columns: 2 keeps it narrow), or split the view`,
      basis:
        "MODERATE: check the smallest rendered text at the intended viewing scale (research reference R10); learner profile T-5/T-10 readability",
    },
  ];
}

export function reviewLearningSpec(path: string): {
  readonly operation: "review-learning";
  readonly artifactId: string;
  readonly hasLearningLayer: boolean;
  readonly counts: { readonly warn: number; readonly info: number };
  readonly findings: readonly Finding[];
} {
  const spec = parseVisualNoteSpec(readJson(path));
  const findings = [
    ...questionRule(spec),
    ...relationRule(spec),
    ...routeRule(spec),
    ...scopeRule(spec),
    ...verifyRule(spec),
    ...questionStatusRule(spec),
    ...widthRule(spec),
  ];
  return {
    operation: "review-learning",
    artifactId: spec.artifactId,
    hasLearningLayer: spec.learning !== undefined,
    counts: {
      warn: findings.filter((finding) => finding.severity === "warn").length,
      info: findings.filter((finding) => finding.severity === "info").length,
    },
    findings,
  };
}
