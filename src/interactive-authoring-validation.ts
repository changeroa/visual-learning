import type { InteractiveSceneInput } from "./interactive-authoring-schema";

type RefinementContext = {
  addIssue(issue: { code: "custom"; path: PropertyKey[]; message: string }): void;
};
type PhaseName = "before" | "after";

function addIssue(context: RefinementContext, path: PropertyKey[], code: string, message: string) {
  context.addIssue({ code: "custom", path, message: `[${code}] ${message}` });
}

function graphemeCount(value: string): number {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
  }
  return [...value].length;
}

function checkUniqueExact(
  actual: string[],
  expected: string[],
  path: PropertyKey[],
  label: string,
  context: RefinementContext,
) {
  const duplicate = actual.find((id, index) => actual.indexOf(id) !== index);
  if (duplicate !== undefined)
    addIssue(context, path, "duplicate-order-id", `${label} repeats '${duplicate}'`);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((id) => !actualSet.has(id));
  const unknown = actual.filter((id) => !expectedSet.has(id));
  if (missing.length > 0 || unknown.length > 0) {
    addIssue(
      context,
      path,
      "order-set-mismatch",
      `${label} must exactly match the present semantic set; missing=${missing.join(",") || "none"}; unknown=${unknown.join(",") || "none"}`,
    );
  }
}

function checkCopy(
  value: string,
  maxGraphemes: number,
  maxLines: number,
  path: PropertyKey[],
  context: RefinementContext,
) {
  const count = graphemeCount(value);
  if (count > maxGraphemes) {
    addIssue(context, path, "copy-budget", `${count} graphemes exceeds ${maxGraphemes}`);
  }
  const lines = value.split(/\r\n|\r|\n/u).length;
  if (lines > maxLines)
    addIssue(context, path, "line-budget", `${lines} explicit lines exceeds ${maxLines}`);
}

function checkFactEvidence(
  claim: { status: string; evidence: readonly unknown[] },
  path: PropertyKey[],
  context: RefinementContext,
) {
  if (claim.status === "fact" && claim.evidence.length === 0) {
    addIssue(
      context,
      [...path, "evidence"],
      "fact-evidence-required",
      "fact claims require evidence",
    );
  }
}

function presentIds<T>(
  baseline: Record<string, T>,
  patches: Record<string, { present?: false | undefined }>,
) {
  return Object.keys(baseline).filter((id) => patches[id]?.present !== false);
}

function refinePhase(
  scene: InteractiveSceneInput,
  phaseName: PhaseName,
  context: RefinementContext,
) {
  const phase = scene.change[phaseName];
  const entities = scene.semantics.entities;
  const relations = scene.semantics.relations;
  for (const id of Object.keys(phase.entities)) {
    if (entities[id] === undefined) {
      addIssue(
        context,
        ["change", phaseName, "entities", id],
        "unknown-patch-id",
        "entity patch has no baseline entity",
      );
    }
  }
  for (const id of Object.keys(phase.relations)) {
    if (relations[id] === undefined) {
      addIssue(
        context,
        ["change", phaseName, "relations", id],
        "unknown-patch-id",
        "relation patch has no baseline relation",
      );
    }
  }
  const entityIds = presentIds(entities, phase.entities);
  const relationIds = presentIds(relations, phase.relations);
  checkUniqueExact(
    phase.entityOrder,
    entityIds,
    ["change", phaseName, "entityOrder"],
    "entity order",
    context,
  );
  checkUniqueExact(
    phase.relationOrder,
    relationIds,
    ["change", phaseName, "relationOrder"],
    "relation order",
    context,
  );
  const presentEntities = new Set(entityIds);
  for (const relationId of relationIds) {
    const baseline = relations[relationId];
    if (baseline === undefined) continue;
    const patch = phase.relations[relationId];
    const relation = {
      ...baseline,
      ...patch,
      from: patch?.from ?? baseline.from,
      to: patch?.to ?? baseline.to,
      status: patch?.status ?? baseline.status,
      evidence: patch?.evidence ?? baseline.evidence,
    };
    if (!presentEntities.has(relation.from) || !presentEntities.has(relation.to)) {
      addIssue(
        context,
        ["change", phaseName, "relations", relationId],
        "dangling-phase-edge",
        `endpoints '${relation.from}' and '${relation.to}' must both be present`,
      );
    }
    checkFactEvidence(relation, ["change", phaseName, "relations", relationId], context);
  }
  for (const entityId of entityIds) {
    const baseline = entities[entityId];
    if (baseline !== undefined) {
      const patch = phase.entities[entityId];
      checkFactEvidence(
        {
          ...baseline,
          ...patch,
          status: patch?.status ?? baseline.status,
          evidence: patch?.evidence ?? baseline.evidence,
        },
        ["change", phaseName, "entities", entityId],
        context,
      );
    }
  }
}

export function refineInteractiveScene(scene: InteractiveSceneInput, context: RefinementContext) {
  const entityIds = Object.keys(scene.semantics.entities);
  const relationIds = Object.keys(scene.semantics.relations);
  const collisions = entityIds.filter((id) => relationIds.includes(id));
  if (collisions.length > 0) {
    addIssue(
      context,
      ["semantics"],
      "duplicate-semantic-id",
      `entity and relation IDs overlap: ${collisions.join(",")}`,
    );
  }
  checkUniqueExact(
    scene.story.readingOrder,
    entityIds,
    ["story", "readingOrder"],
    "reading order",
    context,
  );
  for (const [id, entity] of Object.entries(scene.semantics.entities)) {
    checkFactEvidence(entity, ["semantics", "entities", id], context);
  }
  for (const [id, relation] of Object.entries(scene.semantics.relations)) {
    if (
      scene.semantics.entities[relation.from] === undefined ||
      scene.semantics.entities[relation.to] === undefined
    ) {
      addIssue(
        context,
        ["semantics", "relations", id],
        "dangling-baseline-edge",
        "baseline endpoints must exist",
      );
    }
    checkFactEvidence(relation, ["semantics", "relations", id], context);
  }
  refinePhase(scene, "before", context);
  refinePhase(scene, "after", context);

  const laneIds = scene.presentation.lanes.map((lane) => lane.id);
  const duplicateLane = laneIds.find((id, index) => laneIds.indexOf(id) !== index);
  if (duplicateLane !== undefined)
    addIssue(
      context,
      ["presentation", "lanes"],
      "duplicate-lane-id",
      `lane '${duplicateLane}' repeats`,
    );
  checkUniqueExact(
    Object.keys(scene.presentation.placements),
    entityIds,
    ["presentation", "placements"],
    "placement coverage",
    context,
  );
  for (const [id, placement] of Object.entries(scene.presentation.placements)) {
    if (!laneIds.includes(placement.lane)) {
      addIssue(
        context,
        ["presentation", "placements", id, "lane"],
        "unknown-lane",
        `lane '${placement.lane}' is not declared`,
      );
    }
  }
  for (const relationId of Object.keys(scene.presentation.edgeRouting.relations ?? {})) {
    if (!relationIds.includes(relationId)) {
      addIssue(
        context,
        ["presentation", "edgeRouting", "relations", relationId],
        "unknown-routing-relation",
        "routing override has no baseline relation",
      );
    }
  }

  const { copy, nodeSizing } = scene.constraints;
  if (nodeSizing.minWidth > nodeSizing.maxWidth) {
    addIssue(
      context,
      ["constraints", "nodeSizing"],
      "invalid-node-width-range",
      "minWidth must not exceed maxWidth",
    );
  }
  checkCopy(
    scene.story.question,
    copy.storyQuestionMaxGraphemes,
    copy.storyQuestionMaxLines,
    ["story", "question"],
    context,
  );
  checkCopy(
    scene.story.summary,
    copy.storySummaryMaxGraphemes,
    copy.storySummaryMaxLines,
    ["story", "summary"],
    context,
  );
  checkCopy(
    scene.story.takeaway,
    copy.storyTakeawayMaxGraphemes,
    copy.storyTakeawayMaxLines,
    ["story", "takeaway"],
    context,
  );
  for (const [id, entity] of Object.entries(scene.semantics.entities)) {
    checkCopy(
      entity.title,
      copy.titleMaxGraphemes,
      copy.titleMaxLines,
      ["semantics", "entities", id, "title"],
      context,
    );
    checkCopy(
      entity.description,
      copy.descriptionMaxGraphemes,
      copy.descriptionMaxLines,
      ["semantics", "entities", id, "description"],
      context,
    );
  }
  for (const [id, relation] of Object.entries(scene.semantics.relations)) {
    checkCopy(
      relation.label,
      copy.edgeLabelMaxGraphemes,
      copy.edgeLabelMaxLines,
      ["semantics", "relations", id, "label"],
      context,
    );
  }
  for (const phaseName of ["before", "after"] as const) {
    for (const [id, patch] of Object.entries(scene.change[phaseName].entities)) {
      if (patch.title !== undefined)
        checkCopy(
          patch.title,
          copy.titleMaxGraphemes,
          copy.titleMaxLines,
          ["change", phaseName, "entities", id, "title"],
          context,
        );
      if (patch.description !== undefined)
        checkCopy(
          patch.description,
          copy.descriptionMaxGraphemes,
          copy.descriptionMaxLines,
          ["change", phaseName, "entities", id, "description"],
          context,
        );
    }
    for (const [id, patch] of Object.entries(scene.change[phaseName].relations)) {
      if (patch.label !== undefined)
        checkCopy(
          patch.label,
          copy.edgeLabelMaxGraphemes,
          copy.edgeLabelMaxLines,
          ["change", phaseName, "relations", id, "label"],
          context,
        );
    }
  }
}
