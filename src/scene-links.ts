import type { JsonObject, JsonValue } from "./excalidraw-file";

const markdownLink = /^\[[^\]]*\]\(([^)]+)\)$/;
const wikiLink = /^\[\[([^\]]+)\]\]$/;
const internalBlockRef = /^#\^([^|]+)(?:\|.*)?$/;
const pathBlockRef = /^([^#|]*)#\^([^|]+)(?:\|.*)?$/;
const markdownLinkGlobal = /\[[^\]]*\]\(([^)]+)\)/g;
const wikiLinkGlobal = /\[\[([^\]]+)\]\]/g;

function unwrapExactLink(value: string): string {
  const markdown = markdownLink.exec(value);
  if (markdown !== null) return markdown[1] ?? value;
  const wiki = wikiLink.exec(value);
  if (wiki !== null) return wiki[1] ?? value;
  return value;
}

function cleanBlockRef(value: string): string {
  return value.replace(/^#\^/, "").trim();
}

function exactInternalSceneLinkTarget(value: string): string | null {
  const candidate = unwrapExactLink(value.trim());
  const direct = internalBlockRef.exec(candidate);
  if (direct !== null) {
    const target = cleanBlockRef(direct[1] ?? "");
    return target === "" ? null : target;
  }
  const block = pathBlockRef.exec(candidate);
  if (block === null) return null;
  const path = (block[1] ?? "").trim();
  if (path !== "") return null;
  const target = cleanBlockRef(block[2] ?? "");
  return target === "" ? null : target;
}

export function sceneLinkTargets(value: string): readonly string[] {
  const targets = new Set<string>();
  const exact = exactInternalSceneLinkTarget(value);
  if (exact !== null) targets.add(exact);
  for (const match of value.matchAll(markdownLinkGlobal)) {
    const target = exactInternalSceneLinkTarget(match[1] ?? "");
    if (target !== null) targets.add(target);
  }
  for (const match of value.matchAll(wikiLinkGlobal)) {
    const target = exactInternalSceneLinkTarget(match[1] ?? "");
    if (target !== null) targets.add(target);
  }
  return [...targets];
}

export function pruneAgentCustomDataRefs(
  value: JsonValue,
  keptIds: ReadonlySet<string>,
): JsonValue {
  if (typeof value === "string") {
    return sceneLinkTargets(value).some((target) => !keptIds.has(target)) ? null : value;
  }
  if (Array.isArray(value)) return value.map((item) => pruneAgentCustomDataRefs(item, keptIds));
  if (typeof value !== "object" || value === null) return value;
  const next: JsonObject = {};
  for (const [key, child] of Object.entries(value))
    next[key] = pruneAgentCustomDataRefs(child, keptIds);
  return next;
}
