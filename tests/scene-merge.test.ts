import { describe, expect, test } from "bun:test";
import type { SceneElement } from "../hosted/web/api";
import { baseStamps, mergeThreeWay } from "../hosted/web/scene-merge";

function human(id: string, version = 1, versionNonce = 100, extra: Partial<SceneElement> = {}) {
  return { id, type: "rectangle", version, versionNonce, isDeleted: false, ...extra };
}

function agent(id: string, version = 1, versionNonce = 100, extra: Partial<SceneElement> = {}) {
  return human(id, version, versionNonce, { customData: { owner: "agent" }, ...extra });
}

function ids(elements: readonly SceneElement[]): string[] {
  return elements.map((element) => element.id);
}

describe("mergeThreeWay human elements", () => {
  test("verifier repro: a local deletion the server did not touch stays deleted", () => {
    const base = [human("human-deleted"), agent("agent")];
    const server = [human("human-deleted"), agent("agent")];
    // The editor's getSceneElements() excludes deleted ids, so the element is simply absent.
    const merged = mergeThreeWay(base, server, [agent("agent")]);
    expect(ids(merged)).toEqual(["agent"]);
  });

  test("browser repro: deleted locally with isDeleted, competing save added a drawing", () => {
    const base = [agent("agent"), human("verify-human-deletion", 2, 7)];
    const server = [
      agent("agent"),
      human("verify-human-deletion", 2, 7),
      human("verify-competing-rectangle"),
    ];
    const local = [agent("agent"), human("verify-human-deletion", 3, 8, { isDeleted: true })];
    expect(ids(mergeThreeWay(base, server, local))).toEqual([
      "agent",
      "verify-competing-rectangle",
    ]);
  });

  test("deleted locally but changed on the server (version) keeps the server version", () => {
    const serverVersion = human("h", 2, 101, { x: 50 });
    const merged = mergeThreeWay([human("h")], [serverVersion], []);
    expect(merged).toEqual([serverVersion]);
  });

  test("deleted locally but changed on the server (versionNonce only) keeps the server version", () => {
    const serverVersion = human("h", 1, 999);
    const local = [human("h", 2, 5, { isDeleted: true })];
    expect(mergeThreeWay([human("h")], [serverVersion], local)).toEqual([serverVersion]);
  });

  test("deleted locally and deleted on the server stays gone", () => {
    expect(mergeThreeWay([human("h")], [], [])).toEqual([]);
  });

  test("changed locally takes the local version, even when the server also changed it", () => {
    const localVersion = human("h", 3, 300, { x: 10 });
    expect(mergeThreeWay([human("h")], [human("h")], [localVersion])).toEqual([localVersion]);
    expect(mergeThreeWay([human("h")], [human("h", 2, 200)], [localVersion])).toEqual([
      localVersion,
    ]);
  });

  test("changed locally but deleted on the server keeps the local version", () => {
    const localVersion = human("h", 2, 200);
    expect(mergeThreeWay([human("h")], [], [localVersion])).toEqual([localVersion]);
  });

  test("unchanged locally takes the server version, including the server's deletion", () => {
    const serverVersion = human("h", 2, 200);
    expect(mergeThreeWay([human("h")], [serverVersion], [human("h")])).toEqual([serverVersion]);
    expect(mergeThreeWay([human("h")], [], [human("h")])).toEqual([]);
  });

  test("created locally is added after the server elements", () => {
    const created = human("new-local");
    const merged = mergeThreeWay(
      [agent("a")],
      [agent("a"), human("new-server")],
      [agent("a"), created],
    );
    expect(ids(merged)).toEqual(["a", "new-server", "new-local"]);
  });

  test("created and deleted locally before any save is not added", () => {
    const local = [human("scratch", 2, 5, { isDeleted: true })];
    expect(mergeThreeWay([], [], local)).toEqual([]);
  });

  test("a changed human element keeps its position in the server order", () => {
    const localVersion = human("h", 2, 200);
    const merged = mergeThreeWay(
      [agent("a"), human("h"), agent("b")],
      [agent("a"), human("h"), agent("b")],
      [agent("a"), localVersion, agent("b")],
    );
    expect(merged).toEqual([agent("a"), localVersion, agent("b")]);
  });
});

describe("mergeThreeWay agent elements", () => {
  test("agent elements always come from the server", () => {
    const serverAgent = agent("a", 2, 200);
    const merged = mergeThreeWay([agent("a")], [serverAgent], [agent("a", 5, 500)]);
    expect(merged).toEqual([serverAgent]);
  });

  test("a locally deleted agent element is kept from the server", () => {
    expect(mergeThreeWay([agent("a")], [agent("a")], [])).toEqual([agent("a")]);
  });

  test("an agent element the server dropped is dropped even if present locally", () => {
    expect(mergeThreeWay([agent("a")], [], [agent("a", 2, 200)])).toEqual([]);
  });
});

describe("baseStamps", () => {
  test("keeps only the revision stamps of live elements, which merge the same way", () => {
    const base = [human("h", 4, 40, { x: 1 }), agent("gone", 1, 1, { isDeleted: true })];
    expect(baseStamps(base)).toEqual([{ id: "h", version: 4, versionNonce: 40 }]);
    expect(ids(mergeThreeWay(baseStamps(base), [human("h", 4, 40)], []))).toEqual([]);
  });

  test("an empty base (a draft without stamps) treats every local element as created", () => {
    const localVersion = human("h", 2, 200);
    const merged = mergeThreeWay([], [human("h"), human("server-only")], [localVersion]);
    expect(merged).toEqual([localVersion, human("server-only")]);
  });
});
