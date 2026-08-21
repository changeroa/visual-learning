import { isAbsolute, normalize } from "node:path";
import { z } from "zod";
import { refineInteractiveScene } from "./interactive-authoring-validation";
import {
  evidenceReferenceSchema,
  knowledgeStatusSchema,
  visualCategorySchema,
  visualKindValues,
} from "./schema";

const identifierSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const commitSchema = z.string().regex(/^[0-9a-f]{7,64}$/);
const confidenceSchema = z.enum(["high", "medium", "low", "unknown"]);
const changeStatusSchema = z.enum([
  "normal",
  "added",
  "removed",
  "changed",
  "blocked",
  "unchanged",
  "gap",
]);
const emphasisSchema = z.enum(["primary", "secondary", "warning", "muted"]);
const fallbackPlacementSchema = z.enum([
  "top-corridor",
  "bottom-corridor",
  "source-side",
  "target-side",
  "detached-callout",
]);
const labelPlacementSchema = z.enum(["auto-corridor", ...fallbackPlacementSchema.options]);
const sourceRootSchema = z
  .string()
  .refine(
    (value) => isAbsolute(value) && normalize(value) === value,
    "source root must be a normalized absolute path",
  );

const claimFields = {
  status: knowledgeStatusSchema,
  confidence: confidenceSchema,
  evidence: z.array(evidenceReferenceSchema),
} as const;

const entityBaselineSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    badge: z.string().trim().min(1).nullable().optional(),
    changeStatus: changeStatusSchema,
    visual: z
      .object({
        category: visualCategorySchema,
        shape: z.enum(["rectangle", "ellipse", "diamond"]),
      })
      .strict(),
    ...claimFields,
  })
  .strict();

const relationBaselineSchema = z
  .object({
    from: identifierSchema,
    to: identifierSchema,
    label: z.string().trim().min(1),
    changeStatus: changeStatusSchema,
    animated: z.boolean(),
    ...claimFields,
  })
  .strict();

const entityPatchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    badge: z.string().trim().min(1).nullable().optional(),
    changeStatus: changeStatusSchema.optional(),
    status: knowledgeStatusSchema.optional(),
    confidence: confidenceSchema.optional(),
    evidence: z.array(evidenceReferenceSchema).optional(),
    present: z.literal(false).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "entity patch must not be empty");

const relationPatchSchema = z
  .object({
    from: identifierSchema.optional(),
    to: identifierSchema.optional(),
    label: z.string().trim().min(1).optional(),
    changeStatus: changeStatusSchema.optional(),
    animated: z.boolean().optional(),
    status: knowledgeStatusSchema.optional(),
    confidence: confidenceSchema.optional(),
    evidence: z.array(evidenceReferenceSchema).optional(),
    present: z.literal(false).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "relation patch must not be empty");

const phaseSchema = z
  .object({
    label: z.string().trim().min(1),
    entities: z.record(identifierSchema, entityPatchSchema),
    relations: z.record(identifierSchema, relationPatchSchema),
    entityOrder: z.array(identifierSchema).min(1),
    relationOrder: z.array(identifierSchema),
  })
  .strict();

const copyConstraintsSchema = z
  .object({
    storyQuestionMaxGraphemes: z.number().int().positive(),
    storySummaryMaxGraphemes: z.number().int().positive(),
    storyTakeawayMaxGraphemes: z.number().int().positive(),
    titleMaxGraphemes: z.number().int().positive(),
    descriptionMaxGraphemes: z.number().int().positive(),
    edgeLabelMaxGraphemes: z.number().int().positive(),
    storyQuestionMaxLines: z.number().int().positive(),
    storySummaryMaxLines: z.number().int().positive(),
    storyTakeawayMaxLines: z.number().int().positive(),
    titleMaxLines: z.number().int().positive(),
    descriptionMaxLines: z.number().int().positive(),
    edgeLabelMaxLines: z.number().int().positive(),
  })
  .strict();

const interactiveSceneBaseSchema = z
  .object({
    semanticId: identifierSchema,
    kind: z.enum(visualKindValues),
    story: z
      .object({
        question: z.string().trim().min(1),
        summary: z.string().trim().min(1),
        takeaway: z.string().trim().min(1),
        readingOrder: z.array(identifierSchema).min(1),
      })
      .strict(),
    semantics: z
      .object({
        entities: z.record(identifierSchema, entityBaselineSchema),
        relations: z.record(identifierSchema, relationBaselineSchema),
      })
      .strict(),
    change: z.object({ before: phaseSchema, after: phaseSchema }).strict(),
    presentation: z
      .object({
        layout: z.enum(["layered", "frames", "timeline", "hub", "trust-boundary", "lanes"]),
        readingGuide: z.string().trim().min(1),
        outcome: z.string().trim().min(1),
        lanes: z
          .array(
            z
              .object({
                id: identifierSchema,
                label: z.string().trim().min(1),
                purpose: z.string().trim().min(1),
              })
              .strict(),
          )
          .min(1),
        placements: z.record(
          identifierSchema,
          z
            .object({
              column: z.number().int().nonnegative(),
              lane: identifierSchema,
              order: z.number().int().nonnegative(),
              role: z.string().trim().min(1),
              emphasis: emphasisSchema,
            })
            .strict(),
        ),
        edgeRouting: z
          .object({
            defaultLabelPlacement: z.literal("auto-corridor"),
            fallback: z.array(fallbackPlacementSchema).min(1),
            relations: z
              .record(
                identifierSchema,
                z
                  .object({
                    labelPlacement: labelPlacementSchema.optional(),
                    fallback: z.array(fallbackPlacementSchema).min(1).optional(),
                  })
                  .strict()
                  .refine(
                    (value) => Object.keys(value).length > 0,
                    "routing override must not be empty",
                  ),
              )
              .optional(),
          })
          .strict(),
      })
      .strict(),
    constraints: z
      .object({
        viewport: z
          .object({ width: z.number().int().positive(), height: z.number().int().positive() })
          .strict(),
        nodeSizing: z
          .object({
            aspectRatio: z.literal(1.5),
            minWidth: z.number().int().positive(),
            maxWidth: z.number().int().positive(),
            widthStep: z.number().int().positive(),
          })
          .strict(),
        layout: z
          .object({
            maxColumns: z.number().int().positive(),
            maxNodesPerColumn: z.number().int().positive(),
            minimumZoom: z.number().positive().max(1),
            columnGap: z.number().int().nonnegative(),
            rowGap: z.number().int().nonnegative(),
            laneGap: z.number().int().nonnegative(),
            minimumCorridor: z.number().int().nonnegative(),
          })
          .strict(),
        copy: copyConstraintsSchema,
      })
      .strict(),
  })
  .strict();

type PhaseName = "before" | "after";
export type InteractiveSceneInput = z.infer<typeof interactiveSceneBaseSchema>;
const interactiveSceneSchema = interactiveSceneBaseSchema.superRefine(refineInteractiveScene);

export const interactiveAuthoringDocumentSchema = z
  .object({
    contractVersion: z.literal(1),
    direction: z.literal("left-to-right"),
    source: z
      .object({
        root: sourceRootSchema,
        before: z.object({ commit: commitSchema, label: z.string().trim().min(1) }).strict(),
        after: z.object({ commit: commitSchema, label: z.string().trim().min(1) }).strict(),
      })
      .strict(),
    scenes: z.array(interactiveSceneSchema).min(1),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = document.scenes.map((scene) => scene.semanticId);
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    if (duplicate !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["scenes"],
        message: `[duplicate-scene-id] scene '${duplicate}' repeats`,
      });
    }
  });

export type InteractiveAuthoringDocument = z.infer<typeof interactiveAuthoringDocumentSchema>;
export type InteractiveAuthoringScene = InteractiveAuthoringDocument["scenes"][number];
export type InteractivePhaseName = PhaseName;

export function parseInteractiveAuthoringDocument(input: unknown): InteractiveAuthoringDocument {
  return interactiveAuthoringDocumentSchema.parse(input);
}

export function interactiveAuthoringJsonSchema(): unknown {
  return z.toJSONSchema(interactiveAuthoringDocumentSchema, { target: "draft-2020-12" });
}
