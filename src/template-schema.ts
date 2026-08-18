import { resolve } from "node:path";
import { z } from "zod";
import {
  evidenceReferenceSchema,
  knowledgeStatusSchema,
  nodeVisualSchema,
  presentationSchema,
  visualKindValues,
} from "./schema";

const semanticId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .brand("SemanticId");
const confidenceSchema = z.enum(["high", "medium", "low", "unknown"]);
const relativeDirectory = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.split("/").some((part) => part === "" || part === "." || part === ".."),
    "repositoryRoot must be a clean fixture-relative directory",
  );

const templateClaimFields = {
  semanticId,
  identifier: z.string().trim().min(1),
  explanationKo: z.string().trim().min(1),
  status: knowledgeStatusSchema,
  confidence: confidenceSchema,
  evidence: z.array(evidenceReferenceSchema),
} as const;

export const templateNodeSchema = z
  .object({ ...templateClaimFields, visual: nodeVisualSchema.optional() })
  .strict();
export const templateEdgeSchema = z
  .object({
    ...templateClaimFields,
    from: semanticId,
    to: semanticId,
  })
  .strict();

export const templateArtifactSchema = z
  .object({
    artifactId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    kind: z.enum(visualKindValues),
    titleKo: z.string().trim().min(1),
    titleEn: z.string().trim().min(1),
    maxViewNodes: z.number().int().min(3).max(8).default(6),
    presentation: presentationSchema.optional(),
    nodes: z.array(templateNodeSchema).min(1),
    edges: z.array(templateEdgeSchema),
  })
  .strict()
  .superRefine((artifact, context) => {
    const ids = [
      ...artifact.nodes.map((node) => node.semanticId),
      ...artifact.edges.map((edge) => edge.semanticId),
    ];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: `duplicate semantic IDs in ${artifact.artifactId}`,
      });
    }
    const nodeIds = new Set(artifact.nodes.map((node) => node.semanticId));
    for (const edge of artifact.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        context.addIssue({
          code: "custom",
          message: `dangling template edge ${edge.semanticId} in ${artifact.artifactId}`,
        });
      }
    }
    const frameIds = new Set((artifact.presentation?.frames ?? []).map((frame) => frame.id));
    for (const node of artifact.nodes) {
      if (node.visual?.frameId !== undefined && !frameIds.has(node.visual.frameId)) {
        context.addIssue({
          code: "custom",
          message: `node ${node.semanticId} references an unknown frame in ${artifact.artifactId}`,
        });
      }
    }
  });

export const templateBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    bundleId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    project: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    repositoryRoot: relativeDirectory,
    artifacts: z.array(templateArtifactSchema).min(1),
  })
  .strict();

export type TemplateClaim = z.infer<typeof templateNodeSchema>;
export type TemplateEdge = z.infer<typeof templateEdgeSchema>;
export type TemplateArtifact = z.infer<typeof templateArtifactSchema>;
export type TemplateBundle = z.infer<typeof templateBundleSchema>;
export type ClaimConfidence = z.infer<typeof confidenceSchema>;

export function parseTemplateBundle(input: unknown): TemplateBundle {
  return templateBundleSchema.parse(input);
}

export function resolveRepositoryRoot(fixturePath: string, bundle: TemplateBundle): string {
  return resolve(fixturePath, "..", bundle.repositoryRoot);
}
