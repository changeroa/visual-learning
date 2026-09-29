import type { SceneElement } from "./api";

export function isAgentElement(element: SceneElement): boolean {
  return element.customData?.["owner"] === "agent";
}

function live(element: SceneElement | undefined): SceneElement | undefined {
  return element?.isDeleted === true ? undefined : element;
}

function sameRevision(a: SceneElement, b: SceneElement): boolean {
  return a["version"] === b["version"] && a["versionNonce"] === b["versionNonce"];
}

// Three-way merge of the local drawing onto the server's latest scene. `base` is the server scene
// at the token the editor loaded or last saved; `local` includes deleted elements. Agent-owned
// elements always come from the server. For each human-owned id:
// - created locally (not in base): the local version;
// - deleted locally (in base, absent or isDeleted locally): gone, unless the server changed it
//   since base (version or versionNonce differs), then the server version;
// - changed locally (version or versionNonce differs from base): the local version;
// - otherwise the server version, including the server's own deletion.
// Server order is kept; locally created or server-deleted-but-locally-changed elements follow.
export function mergeThreeWay(
  base: readonly SceneElement[],
  server: readonly SceneElement[],
  local: readonly SceneElement[],
): SceneElement[] {
  const baseById = new Map(base.map((element) => [element.id, element]));
  const localById = new Map(local.map((element) => [element.id, element]));
  const pick = (id: string, fromServer: SceneElement | undefined): SceneElement | undefined => {
    const fromBase = live(baseById.get(id));
    const fromLocal = localById.get(id);
    const owner = fromServer ?? fromLocal ?? fromBase;
    if (owner === undefined || isAgentElement(owner)) return fromServer;
    const localLive = live(fromLocal);
    if (fromBase === undefined) return localLive ?? fromServer;
    if (localLive === undefined)
      return fromServer !== undefined && !sameRevision(fromServer, fromBase)
        ? fromServer
        : undefined;
    return sameRevision(localLive, fromBase) ? fromServer : localLive;
  };
  const merged: SceneElement[] = [];
  const seen = new Set<string>();
  for (const element of server) {
    if (element.isDeleted === true) continue;
    seen.add(element.id);
    const picked = pick(element.id, element);
    if (picked !== undefined) merged.push(picked);
  }
  for (const element of local) {
    if (seen.has(element.id)) continue;
    seen.add(element.id);
    const picked = pick(element.id, undefined);
    if (picked !== undefined) merged.push(picked);
  }
  return merged;
}

// The merge only compares base revisions, so drafts store the base scene's revision stamps.
export function baseStamps(elements: readonly SceneElement[]): SceneElement[] {
  return elements
    .filter((element) => element.isDeleted !== true)
    .map((element) => ({
      id: element.id,
      version: element["version"],
      versionNonce: element["versionNonce"],
    }));
}
