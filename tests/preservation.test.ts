import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactPaths } from "../src/artifact-files";
import { parseSceneMarkdown } from "../src/excalidraw-file";
import { refreshArtifact } from "../src/refresh";
import {
  provisionFixture,
  readFixtureScene,
  specV2,
  writeFixtureScene,
} from "./preservation-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-preserve-"));
});

describe("refresh preservation", () => {
  test("preserves a human arrow bound to an agent element byte-for-byte as a structure", () => {
    const { project } = provisionFixture(root, "human-arrow-to-agent");
    const before = readFixtureScene(root, project);
    const humanBefore = before.elements.find((element) => element.id === "human-arrow");
    if (humanBefore === undefined) throw new TypeError("missing human arrow");

    const result = refreshArtifact({
      vault: root,
      project,
      spec: specV2,
      expectedToken: "cas-0",
    });
    const after = readFixtureScene(root, project);
    const humanAfter = after.elements.find((element) => element.id === "human-arrow");

    expect(result.token).toBe("cas-1");
    expect(humanAfter).toEqual(humanBefore);
    expect(
      after.elements.some((element) => element.id === humanBefore.endBinding?.["elementId"]),
    ).toBe(true);
  });

  test("issues a fresh monotonic CAS token on every successful refresh", () => {
    const { project } = provisionFixture(root, "human-arrow-to-agent");

    const first = refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" });
    const second = refreshArtifact({
      vault: root,
      project,
      spec: specV2,
      expectedToken: first.token,
    });

    expect(first.token).toBe("cas-1");
    expect(second.token).toBe("cas-2");
    expect(second.token).not.toBe(String(specV2.revision));
  });

  test("prunes an agent containerId that points at a removed non-retained node", () => {
    const { project } = provisionFixture(root, "human-arrow-to-agent");
    const scene = readFixtureScene(root, project);
    const queue = scene.elements.find(
      (element) => element.customData?.["semanticId"] === "queue" && element.type === "rectangle",
    );
    const serviceLabel = scene.elements.find(
      (element) => element.customData?.["semanticId"] === "service" && element.type === "text",
    );
    if (queue === undefined || serviceLabel === undefined)
      throw new TypeError("agent container regression fixture missing");
    serviceLabel.containerId = queue.id;
    writeFixtureScene(root, project, scene);

    refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" });
    const after = readFixtureScene(root, project);
    const nextServiceLabel = after.elements.find((element) => element.id === serviceLabel.id);

    expect(nextServiceLabel?.containerId ?? null).toBeNull();
    expect(
      parseSceneMarkdown(
        readFileSync(join(root, artifactPaths(project, specV2.artifactId).drawing), "utf8"),
      ).scene,
    ).toEqual(after);
  });

  test("preserves a human text element bound into an agent container without rewriting it", () => {
    const { project } = provisionFixture(root, "human-text-container-to-agent");
    const before = readFixtureScene(root, project);
    const humanBefore = before.elements.find((element) => element.id === "human-text");
    if (humanBefore === undefined) throw new TypeError("missing human text");

    refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" });
    const after = readFixtureScene(root, project);
    const humanAfter = after.elements.find((element) => element.id === "human-text");

    expect(humanAfter).toEqual(humanBefore);
    expect(after.elements.some((element) => element.id === humanBefore.containerId)).toBe(true);
  });

  test("preserves mixed human and agent groups", () => {
    const { project } = provisionFixture(root, "mixed-group");
    refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" });
    const after = readFixtureScene(root, project);
    const agent = after.elements.find(
      (element) => element.customData?.["semanticId"] === "service" && element.type === "rectangle",
    );
    const human = after.elements.find((element) => element.id === "human-group-box");
    if (agent === undefined || human === undefined) throw new TypeError("group fixture missing");

    expect(agent.groupIds).toEqual(human.groupIds);
  });

  test("prunes an agent-owned internal link to a removed node", () => {
    const { project } = provisionFixture(root, "human-arrow-to-agent");
    const scene = readFixtureScene(root, project);
    const queue = scene.elements.find(
      (element) => element.customData?.["semanticId"] === "queue" && element.type === "rectangle",
    );
    const service = scene.elements.find(
      (element) => element.customData?.["semanticId"] === "service" && element.type === "rectangle",
    );
    if (queue === undefined || service === undefined)
      throw new TypeError("agent link regression fixture missing");
    service.link = `#^${queue.id}`;
    writeFixtureScene(root, project, scene);

    refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" });
    const after = readFixtureScene(root, project);
    const nextService = after.elements.find((element) => element.id === service.id);

    expect(nextService?.link ?? null).toBeNull();
  });

  test("retains a removed referenced agent element as a deprecated anchor with the same ID and geometry", () => {
    const { project } = provisionFixture(root, "removed-agent-anchor");
    const before = readFixtureScene(root, project);
    const queue = before.elements.find(
      (element) => element.customData?.["semanticId"] === "queue" && element.type === "rectangle",
    );
    if (queue === undefined) throw new TypeError("missing queue shape");

    const result = refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" });
    const after = readFixtureScene(root, project);
    const anchor = after.elements.find((element) => element.id === queue.id);
    const note = readFileSync(join(root, artifactPaths(project, specV2.artifactId).note), "utf8");

    expect(result.deprecatedAnchors).toEqual([queue.id]);
    expect(anchor).toBeDefined();
    expect(anchor?.x).toBe(queue.x);
    expect(anchor?.y).toBe(queue.y);
    expect(anchor?.width).toBe(queue.width);
    expect(anchor?.height).toBe(queue.height);
    expect(anchor?.customData?.["deprecatedAnchor"]).toBe(true);
    expect(note).toContain(queue.id);
  });

  test("keeps a human internal link untouched and retains its removed target as a deprecated anchor", () => {
    const { project } = provisionFixture(root, "removed-agent-anchor");
    const scene = readFixtureScene(root, project);
    const queue = scene.elements.find(
      (element) => element.customData?.["semanticId"] === "queue" && element.type === "rectangle",
    );
    const human = scene.elements.find((element) => element.id === "human-to-removed");
    if (queue === undefined || human === undefined)
      throw new TypeError("human link regression fixture missing");
    human.link = `#^${queue.id}`;
    writeFixtureScene(root, project, scene);

    refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" });
    const after = readFixtureScene(root, project);
    const nextHuman = after.elements.find((element) => element.id === human.id);
    const anchor = after.elements.find((element) => element.id === queue.id);

    expect(nextHuman?.link).toBe(human.link);
    expect(anchor?.customData?.["deprecatedAnchor"]).toBe(true);
  });

  test("rejects an unrepairable dangling internal link before writing", () => {
    const { project } = provisionFixture(root, "human-arrow-to-agent");
    const scene = readFixtureScene(root, project);
    const service = scene.elements.find(
      (element) => element.customData?.["semanticId"] === "service" && element.type === "rectangle",
    );
    if (service === undefined) throw new TypeError("missing service shape");
    service.link = "#^missing-anchor";
    writeFixtureScene(root, project, scene);
    const drawing = artifactPaths(project, specV2.artifactId).drawing;
    const before = readFileSync(join(root, drawing), "utf8");

    expect(() =>
      refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" }),
    ).toThrow(/dangling/i);
    expect(readFileSync(join(root, drawing), "utf8")).toBe(before);
  });

  test("rejects partial ownership before writing", () => {
    const { project } = provisionFixture(root, "partial-owner");
    const drawing = artifactPaths(project, specV2.artifactId).drawing;
    const before = readFileSync(join(root, drawing), "utf8");

    expect(() =>
      refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" }),
    ).toThrow(/ownership/i);
    expect(readFileSync(join(root, drawing), "utf8")).toBe(before);
  });

  test("rejects irreparable cross-ownership cycles before writing", () => {
    const { project } = provisionFixture(root, "cycle");
    const drawing = artifactPaths(project, specV2.artifactId).drawing;
    const before = readFileSync(join(root, drawing), "utf8");

    expect(() =>
      refreshArtifact({ vault: root, project, spec: specV2, expectedToken: "cas-0" }),
    ).toThrow(/cycle/i);
    expect(parseSceneMarkdown(readFileSync(join(root, drawing), "utf8")).scene).toEqual(
      parseSceneMarkdown(before).scene,
    );
  });
});
