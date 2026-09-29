import type { SceneElement } from "./api";

export function isAgentElement(element: SceneElement): boolean {
  return element.customData?.["owner"] === "agent";
}

// Overlay the local drawing onto the server's latest scene: every local human-owned element (no
// agent customData) replaces or joins the server list by id, and any local element the server
// does not have is appended. Agent elements the server still has keep the server's version.
export function mergeOntoLatest(
  server: readonly SceneElement[],
  local: readonly SceneElement[],
): SceneElement[] {
  const serverIds = new Set(server.map((element) => element.id));
  const overlay = new Map<string, SceneElement>();
  for (const element of local)
    if (!isAgentElement(element) || !serverIds.has(element.id)) overlay.set(element.id, element);
  const merged = server.map((element) => {
    const replacement = overlay.get(element.id);
    if (replacement === undefined) return element;
    overlay.delete(element.id);
    return replacement;
  });
  return [...merged, ...overlay.values()];
}

export type Draft = { baseToken: string; elements: SceneElement[]; savedAt: string };

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
