// localStorage drafts of an unsaved drawing. Kept apart from scene-merge.ts so the pure merge
// stays importable outside a browser (tests/scene-merge.test.ts).
import type { SceneElement } from "./api";

// `base` holds the revision stamps (scene-merge.ts baseStamps) of the server scene at baseToken.
export type Draft = {
  baseToken: string;
  base: SceneElement[];
  elements: SceneElement[];
  savedAt: string;
};

export function draftKey(project: string, artifact: string): string {
  return `visual-atlas:draft:${project}:${artifact}`;
}

export function readDraft(project: string, artifact: string): Draft | null {
  const raw = window.localStorage.getItem(draftKey(project, artifact));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.baseToken !== "string" || !Array.isArray(parsed.elements)) return null;
    return {
      baseToken: parsed.baseToken,
      base: Array.isArray(parsed.base) ? parsed.base : [],
      elements: parsed.elements,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeDraft(project: string, artifact: string, draft: Draft): void {
  window.localStorage.setItem(draftKey(project, artifact), JSON.stringify(draft));
}

export function clearDraft(project: string, artifact: string): void {
  window.localStorage.removeItem(draftKey(project, artifact));
}
