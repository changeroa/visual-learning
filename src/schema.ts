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
export const visualEdgeSchema = z
  .object({
    ...claimFields,
    from: semanticId,
    to: semanticId,
  })
  .strict();

export const visualNoteSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    artifactId,
    kind: z.enum(visualKindValues),
    revision: z.number().int().positive(),
    title: z.string().trim().min(1),
    source: z
      .object({
        root: sourceRoot,
        commit: z
          .string()
          .regex(/^[0-9a-f]{7,64}$/)
          .nullable(),
      })
      .strict(),
    presentation: presentationSchema.optional(),
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
        context.addIssue({ code: "custom", message: `fact ${claim.semanticId} requires evidence` });
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
  });

export type VisualNoteSpec = z.infer<typeof visualNoteSpecSchema>;

export function parseVisualNoteSpec(input: unknown): VisualNoteSpec {
  return visualNoteSpecSchema.parse(input);
}

export function readSourceRevision(source: string): string | null {
  const result = Bun.spawnSync(["git", "-C", source, "rev-parse", "--verify", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin" },
  });
  if (result.exitCode !== 0) return null;
  return z
    .string()
    .regex(/^[0-9a-f]{40,64}$/)
    .parse(result.stdout.toString().trim());
}
