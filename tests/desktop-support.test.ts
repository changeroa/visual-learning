import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restorePluginData } from "../scripts/qa/desktop-live";
import { adversarialReceipt, doneClaim, tokenBurnReceipt } from "../scripts/qa/desktop-receipts";
import {
  agentIds,
  assertEmbedding,
  burnedTokens,
  deriveSpec,
  evalCodes,
  humanSnapshot,
  immutableSnapshot,
  pngMagic,
  sceneAt,
  specBytes,
  stableStringify,
  unchangedWithin,
} from "../scripts/qa/desktop-support";
import { type ExcalidrawScene, encodeSceneToMarkdown } from "../src/excalidraw-file";
import { readJson, sha256 } from "../src/io";
import { parseVisualNoteSpec } from "../src/schema";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "visual-note-desktop-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const v2 = parseVisualNoteSpec(readJson("./tests/fixtures/gallery.json"));

function writeScene(scene: ExcalidrawScene): string {
  const root = tempRoot();
  const path = join(root, "scene.excalidraw.md");
  writeFileSync(path, encodeSceneToMarkdown(scene));
  return path;
}

function mixedScene(): ExcalidrawScene {
  return {
    type: "excalidraw",
    version: 2,
    source: "desktop-test",
    elements: [
      {
        id: "agent-1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        customData: { owner: "agent", artifactId: "a", semanticId: "s", elementRole: "node-shape" },
      },
      {
        id: "human-1",
        type: "text",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        text: "사람 메모",
        customData: { owner: "human", attachedTo: "agent-1" },
      },
      {
        id: "human-2",
        type: "freedraw",
        x: 5,
        y: 5,
        width: 2,
        height: 2,
        points: [
          [0, 0],
          [2, 2],
        ],
      },
    ],
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort()
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  return value;
}

describe("desktop journey support", () => {
  test("deriveSpec removes the node, its incident edges, and bumps revision", () => {
    const node = v2.nodes.at(0)?.semanticId ?? "";
    const incident = v2.edges.filter((edge) => edge.from === node || edge.to === node).length;
    const derived = deriveSpec(v2, { remove: node, suffix: "(Deprecate)" });
    expect(derived.revision).toBe(v2.revision + 1);
    expect(derived.nodes.length).toBe(v2.nodes.length - 1);
    expect(derived.edges.length).toBe(v2.edges.length - incident);
    expect(derived.nodes.map((entry) => entry.semanticId)).not.toContain(node);
    expect(derived.edges.every((edge) => edge.from !== node && edge.to !== node)).toBe(true);
    expect(specBytes(derived)).toBe(`${JSON.stringify(derived, null, 2)}\n`);
  });

  test("deriveSpec without removal keeps every node and edge", () => {
    const derived = deriveSpec(v2, { suffix: "(Retry)" });
    expect(derived.nodes.length).toBe(v2.nodes.length);
    expect(derived.edges.length).toBe(v2.edges.length);
    expect(derived.title).toContain("(Retry)");
  });

  test("humanSnapshot and agentIds partition by ownership", () => {
    const scene = mixedScene();
    const path = writeScene(scene);
    const parsed = sceneAt(path);
    const humans = humanSnapshot(parsed);
    const agents = agentIds(parsed);
    expect(humans.size).toBe(2);
    expect(agents).toEqual(["agent-1"]);
    for (const [id, value] of humans) expect(JSON.parse(value).id).toBe(id);
    expect(humans.get("human-1")).toBe(stableStringify(scene.elements.at(1) ?? {}));
    expect(stableStringify(scene.elements.at(0) ?? {})).toBe(
      JSON.stringify(sortKeys(scene.elements.at(0))),
    );
  });

  test("humanSnapshot rejects partial ownership", () => {
    const scene = mixedScene();
    const target = scene.elements.at(2);
    if (target === undefined) throw new Error("fixture");
    target.customData = { owner: "alien" };
    expect(() => humanSnapshot(sceneAt(writeScene(scene)))).toThrow(/partial ownership/);
  });

  test("immutableSnapshot is stable and detects mutation", () => {
    const history = join(tempRoot(), "_history", "artifact");
    mkdirSync(join(history, "revisions", "cas-0"), { recursive: true });
    writeFileSync(join(history, "revisions", "cas-0", "spec.json"), "{}\n");
    writeFileSync(join(history, "STATE"), '{"committedToken":"cas-0"}\n');
    writeFileSync(join(history, "COMMITTED"), '{"token":"cas-0"}\n');
    const before = immutableSnapshot(history);
    expect(immutableSnapshot(history).digest).toBe(before.digest);
    mkdirSync(join(history, "revisions", "cas-1"), { recursive: true });
    writeFileSync(join(history, "revisions", "cas-1", "spec.json"), "{}\n");
    const added = immutableSnapshot(history);
    expect(added.digest).not.toBe(before.digest);
    expect(unchangedWithin(before, added)).toBe(true);
    writeFileSync(join(history, "STATE"), '{"committedToken":"cas-1"}\n');
    expect(unchangedWithin(before, immutableSnapshot(history))).toBe(false);
  });

  test("burnedTokens lists the burn directory only", () => {
    const root = tempRoot();
    expect(burnedTokens(root)).toEqual([]);
    mkdirSync(join(root, "burned"), { recursive: true });
    writeFileSync(join(root, "burned", "cas-3.json"), "{}\n");
    expect(burnedTokens(root)).toEqual(["cas-3.json"]);
  });

  test("assertEmbedding accepts a real embed and rejects a broken one", () => {
    const root = tempRoot();
    writeFileSync(join(root, "drawing.svg"), '<svg viewBox="0 0 10 10"><g/></svg>\n');
    writeFileSync(
      join(root, "note.md"),
      "# Note\n\n![[d/drawing.excalidraw.md]]\n\n- SVG: [[d/drawing.svg]]\n",
    );
    expect(() =>
      assertEmbedding(
        join(root, "note.md"),
        join(root, "drawing.svg"),
        "d/drawing.excalidraw.md",
        "d/drawing.svg",
      ),
    ).not.toThrow();
    writeFileSync(join(root, "note.md"), "# Note without embeds\n");
    expect(() =>
      assertEmbedding(
        join(root, "note.md"),
        join(root, "drawing.svg"),
        "d/drawing.excalidraw.md",
        "d/drawing.svg",
      ),
    ).toThrow(/embed/);
  });

  test("evalCodes embeds view, target, and human-id guards on one line", () => {
    const codes = evalCodes({
      path: "a/b.excalidraw.md",
      targetId: "agent-1",
      textId: "human-note",
      drawId: "human-freehand",
      concurrentId: "human-concurrent",
      nonce: "abc12345",
    });
    for (const code of [codes.text, codes.freehand, codes.save]) {
      expect(code).not.toContain("\n");
      expect(code).toContain("VISUAL_NOTE_VIEW_MISMATCH");
      expect(code).toContain('"a/b.excalidraw.md"');
    }
    expect(codes.text).toContain("owner:'human'");
    expect(codes.text).toContain("task-12:abc12345");
    expect(codes.text).toContain("addElementsToView");
    expect(codes.freehand).toContain("elementsDict");
    expect(codes.freehand).toContain("'freedraw'");
    expect(codes.freehand).toContain("customData=null");
  });

  test("pngMagic detects the PNG signature", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "real.png"),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    );
    writeFileSync(join(root, "fake.png"), "not a png");
    expect(pngMagic(join(root, "real.png"))).toBe(true);
    expect(pngMagic(join(root, "fake.png"))).toBe(false);
  });
});

describe("desktop receipts", () => {
  test("tokenBurnReceipt proves burned tokens are never reused", () => {
    const receipt = tokenBurnReceipt({
      vault: "/vault",
      project: "sample-agent-project",
      artifactId: "a",
      burns: [
        {
          token: "cas-3",
          reason: "source CAS changed at prepared",
          phase: "concurrent",
          stateUnchanged: true,
          abandonedRevisionAbsent: true,
        },
      ],
      retryTokens: ["cas-1", "cas-4"],
      committedToken: "cas-4",
    }) as { status: string; burnedNeverReused: boolean; burnedTokens: string[] };
    expect(receipt.status).toBe("PASS");
    expect(receipt.burnedNeverReused).toBe(true);
    expect(receipt.burnedTokens).toEqual(["cas-3"]);
  });

  test("tokenBurnReceipt fails when a burned token is reused", () => {
    const receipt = tokenBurnReceipt({
      vault: "/vault",
      project: "p",
      artifactId: "a",
      burns: [
        {
          token: "cas-3",
          reason: "x",
          phase: "y",
          stateUnchanged: true,
          abandonedRevisionAbsent: true,
        },
      ],
      retryTokens: ["cas-3"],
      committedToken: "cas-3",
    }) as { status: string; burnedNeverReused: boolean };
    expect(receipt.status).toBe("FAIL");
    expect(receipt.burnedNeverReused).toBe(false);
  });

  test("adversarialReceipt passes only when every class passes", () => {
    expect(
      (adversarialReceipt([{ class: "a", result: "PASS", detail: "" }]) as { verdict: string })
        .verdict,
    ).toBe("PASS");
    expect(
      (
        adversarialReceipt([
          { class: "a", result: "PASS", detail: "" },
          { class: "b", result: "FAIL", detail: "" },
        ]) as { verdict: string }
      ).verdict,
    ).toBe("FAIL");
  });

  test("doneClaim serializes to parseable JSON with a claim digest", () => {
    const claim = doneClaim({ outcome: { done: true }, evidence: {}, evidenceRoot: "/evidence" });
    const parsed = JSON.parse(claim) as { claim_sha256: string; status: string };
    expect(parsed.status).toBe("DONE");
    expect(parsed.claim_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("plugin data.json restore procedure", () => {
  test("restores only previousRelease and proves the final hash", () => {
    const root = tempRoot();
    const target = join(root, "data.json");
    const canonical = { previousRelease: "0.0.0", theme: "moonstone", array: [1, 2] };
    const expected = JSON.stringify(canonical, null, 2);
    writeFileSync(target, JSON.stringify({ ...canonical, previousRelease: "2.26.4" }, null, 2));
    const receipt = restorePluginData(target, sha256(expected)) as {
      status: string;
      after: { sha256: string };
    };
    expect(receipt.status).toBe("RESTORED");
    expect(receipt.after.sha256).toBe(sha256(expected));
  });

  test("reports UNCHANGED when the hash already matches", () => {
    const root = tempRoot();
    const target = join(root, "data.json");
    const canonical = JSON.stringify({ previousRelease: "0.0.0" }, null, 2);
    writeFileSync(target, canonical);
    const receipt = restorePluginData(target, sha256(canonical)) as { status: string };
    expect(receipt.status).toBe("UNCHANGED");
  });

  test("blocks semantic drift beyond previousRelease", () => {
    const root = tempRoot();
    const target = join(root, "data.json");
    const canonical = { previousRelease: "0.0.0", theme: "moonstone" };
    writeFileSync(
      target,
      JSON.stringify({ ...canonical, previousRelease: "2.26.4", drift: true }, null, 2),
    );
    const receipt = restorePluginData(target, "0".repeat(64)) as { status: string };
    expect(receipt.status).toBe("BLOCKED");
  });
});
