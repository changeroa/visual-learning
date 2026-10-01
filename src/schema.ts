import { isAbsolute, normalize } from "node:path";
import { z } from "zod";

const semanticId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .brand("SemanticId");
const artifactId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .brand("ArtifactId");
const evidencePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !isAbsolute(value) &&
      normalize(value) === value &&
      !value.split("/").some((part) => part === "" || part === "." || part === ".."),
    "evidence path must be normalized and repository-relative",
  );
const sourceRoot = z
  .string()
  .refine(
    (value) => isAbsolute(value) && normalize(value) === value,
    "source root must be a normalized absolute path",
  );
// Hosted specs arrive path-scrubbed (source.root is the repo name), so no local absolute path
// ever reaches the Worker.
const hostedSourceRoot = z
  .string()
  .min(1)
  .refine(
    (value) => !isAbsolute(value) && !/^(?:[~\\/]|[A-Za-z]:)/.test(value),
    "hosted source root must not be an absolute or home-relative path",
  );

export const visualCategorySchema = z.enum([
  "cloudflare",
  "aws",
  "external",
  "data",
  "runtime",
  "security",
  "risk",
  "neutral",
]);
const frameIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const nodeVisualSchema = z
  .object({
    category: visualCategorySchema.optional(),
    frameId: frameIdSchema.optional(),
    shape: z.enum(["rectangle", "ellipse", "diamond"]).optional(),
    emphasis: z.enum(["primary", "secondary", "muted"]).optional(),
    lane: z.enum(["main", "exception", "upstream", "downstream"]).optional(),
    order: z.number().int().nonnegative().optional(),
  })
  .strict();
export const presentationSchema = z
  .object({
    layout: z.enum(["layered", "frames", "timeline", "hub", "trust-boundary", "components"]),
    direction: z.literal("left-to-right").default("left-to-right"),
    columns: z.number().int().min(1).max(3).optional(),
    frames: z
      .array(
        z
          .object({
            id: frameIdSchema,
            label: z.string().trim().min(1),
            category: visualCategorySchema,
            order: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const evidenceReferenceSchema = z
  .object({
    path: evidencePath,
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
    symbol: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((reference, context) => {
    if (reference.lineEnd !== undefined && reference.lineStart === undefined) {
      context.addIssue({ code: "custom", message: "lineEnd requires lineStart" });
    }
    if (
      reference.lineStart !== undefined &&
      reference.lineEnd !== undefined &&
      reference.lineEnd < reference.lineStart
    ) {
      context.addIssue({ code: "custom", message: "lineEnd must not precede lineStart" });
    }
  });

export const knowledgeStatusSchema = z.enum(["fact", "inference", "question"]);
export const visualKindValues = [
  "project-map",
  "system-architecture",
  "container-architecture",
  "component-architecture",
  "adr",
  "api-contract",
  "workflow",
  "data-flow",
  "trust-boundary",
  "code-exploration",
] as const;
const claimFields = {
  semanticId,
  label: z.string().trim().min(1),
  status: knowledgeStatusSchema,
  evidence: z.array(evidenceReferenceSchema),
} as const;

export const visualNodeSchema = z
  .object({ ...claimFields, visual: nodeVisualSchema.optional() })
  .strict();
export const edgeRelationValues = [
  "runtime-call",
  "data-movement",
  "state-transition",
  "static-reference",
] as const;
export const visualEdgeSchema = z
  .object({
    ...claimFields,
    from: semanticId,
    to: semanticId,
    relation: z.enum(edgeRelationValues).optional(),
  })
  .strict();

const learningText = z.string().trim().min(1);
export const learningSchema = z
  .object({
    question: learningText,
    answer: learningText,
    route: z.array(z.object({ semanticId, explanation: learningText }).strict()).default([]),
    glossary: z.array(z.object({ term: learningText, meaning: learningText }).strict()).default([]),
    scope: z
      .object({
        covers: z.array(learningText).default([]),
        omits: z.array(learningText).default([]),
      })
      .strict()
      .optional(),
    verify: z
      .array(z.object({ semanticId, how: learningText, command: learningText.optional() }).strict())
      .default([]),
    checks: z.array(z.object({ prompt: learningText, answer: learningText }).strict()).default([]),
    analogies: z
      .array(
        z
          .object({
            analogy: learningText,
            holds: z.array(learningText).min(1),
            breaks: z.array(learningText).min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type LearningLayer = z.infer<typeof learningSchema>;

function specSchemaWithRoot(root: z.ZodString) {
  return z
    .object({
      schemaVersion: z.literal(1),
      artifactId,
      kind: z.enum(visualKindValues),
      revision: z.number().int().positive(),
      title: z.string().trim().min(1),
      source: z
        .object({
          root,
          commit: z
            .string()
            .regex(/^[0-9a-f]{7,64}$/)
            .nullable(),
        })
        .strict(),
      presentation: presentationSchema.optional(),
      learning: learningSchema.optional(),
      nodes: z.array(visualNodeSchema).min(1),
      edges: z.array(visualEdgeSchema),
    })
    .strict()
    .superRefine((spec, context) => {
      const allIds = [
        ...spec.nodes.map((node) => node.semanticId),
        ...spec.edges.map((edge) => edge.semanticId),
      ];
      if (new Set(allIds).size !== allIds.length)
        context.addIssue({ code: "custom", message: "semantic IDs must be unique" });
      const nodeIds = new Set(spec.nodes.map((node) => node.semanticId));
      for (const edge of spec.edges) {
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
          context.addIssue({
            code: "custom",
            message: `edge ${edge.semanticId} has a dangling endpoint`,
          });
      }
      for (const claim of [...spec.nodes, ...spec.edges]) {
        if (claim.status === "fact" && claim.evidence.length === 0)
          context.addIssue({
            code: "custom",
            message: `fact ${claim.semanticId} requires evidence`,
          });
      }
      const frames = spec.presentation?.frames ?? [];
      if (new Set(frames.map((frame) => frame.id)).size !== frames.length)
        context.addIssue({ code: "custom", message: "presentation frame IDs must be unique" });
      const frameIds = new Set(frames.map((frame) => frame.id));
      for (const node of spec.nodes) {
        if (node.visual?.frameId !== undefined && !frameIds.has(node.visual.frameId))
          context.addIssue({
            code: "custom",
            message: `node ${node.semanticId} references an unknown presentation frame`,
          });
      }
      const learning = spec.learning;
      if (learning === undefined) return;
      const claimIds = new Set<string>(allIds);
      const routeIds = learning.route.map((step) => step.semanticId);
      if (new Set(routeIds).size !== routeIds.length)
        context.addIssue({
          code: "custom",
          message: "learning route must not repeat a semantic ID",
        });
      for (const id of [...routeIds, ...learning.verify.map((step) => step.semanticId)]) {
        if (!claimIds.has(id))
          context.addIssue({
            code: "custom",
            message: `learning references unknown semantic ID ${id}`,
          });
      }
      const terms = learning.glossary.map((entry) => entry.term);
      if (new Set(terms).size !== terms.length)
        context.addIssue({ code: "custom", message: "learning glossary terms must be unique" });
    });
}

export const visualNoteSpecSchema = specSchemaWithRoot(sourceRoot);
const hostedVisualNoteSpecSchema = specSchemaWithRoot(hostedSourceRoot);

export type VisualNoteSpec = z.infer<typeof visualNoteSpecSchema>;

export function parseVisualNoteSpec(input: unknown): VisualNoteSpec {
  return visualNoteSpecSchema.parse(input);
}

// The Worker boundary: identical rules except that source.root is the scrubbed repo name.
export function parseHostedVisualNoteSpec(input: unknown): VisualNoteSpec {
  return hostedVisualNoteSpecSchema.parse(input);
}
