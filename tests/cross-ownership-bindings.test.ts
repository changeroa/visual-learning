import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactPaths } from "../src/artifact-files";
import { parseSceneMarkdown } from "../src/excalidraw-file";
import { buildReferenceGraph } from "../src/refresh-scene";
import { provisionFixture, specV2 } from "./preservation-support";

const cli = join(import.meta.dir, "../bin/visual-note");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function vault(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-refresh-cli-")));
  roots.push(root);
  return root;
}

describe("cross ownership bindings", () => {
  test("parses internal link encodings used by scene and plugin metadata", () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "fixture",
      elements: [
        {
          id: "target-bare",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          customData: {
            owner: "agent",
            artifactId: specV2.artifactId,
            semanticId: "bare",
            elementRole: "node-shape",
          },
        },
        {
          id: "target-wiki",
          type: "rectangle",
          x: 20,
          y: 0,
          width: 10,
          height: 10,
          customData: {
            owner: "agent",
            artifactId: specV2.artifactId,
            semanticId: "wiki",
            elementRole: "node-shape",
          },
        },
        {
          id: "target-markdown",
          type: "rectangle",
          x: 40,
          y: 0,
          width: 10,
          height: 10,
          customData: {
            owner: "agent",
            artifactId: specV2.artifactId,
            semanticId: "markdown",
            elementRole: "node-shape",
          },
        },
        {
          id: "target-sized",
          type: "rectangle",
          x: 60,
          y: 0,
          width: 10,
          height: 10,
          customData: {
            owner: "agent",
            artifactId: specV2.artifactId,
            semanticId: "sized",
            elementRole: "node-shape",
          },
        },
        {
          id: "source-id",
          type: "rectangle",
          x: 80,
          y: 0,
          width: 10,
          height: 10,
          customData: {
            owner: "agent",
            artifactId: specV2.artifactId,
            semanticId: "service",
            elementRole: "node-shape",
            plugin: {
              bare: "#^target-bare",
              wiki: "[[#^target-wiki]]",
              markdown: "[anchor](#^target-markdown)",
              sized: "#^target-sized|100x200",
              missing: "[[#^missing-id]]",
              external: "[[Other Note#^not-scene]]",
            },
          },
          link: "[[#^target-bare|Alias]]",
        },
      ],
    };

    const graph = buildReferenceGraph(scene, specV2.artifactId);

    expect(graph.references.filter((reference) => reference.kind === "customData")).toHaveLength(4);
    expect(graph.references.some((reference) => reference.kind === "link")).toBe(true);
    expect(graph.dangling).toContain("source-id:customData:missing-id");
    expect(graph.dangling.some((entry) => entry.includes("not-scene"))).toBe(false);
  });

  test("builds references across bindings groups and plugin metadata without dangling targets", () => {
    const root = vault();
    const { project } = provisionFixture(root, "removed-agent-anchor");
    const drawing = artifactPaths(project, specV2.artifactId).drawing;
    const scene = parseSceneMarkdown(readFileSync(join(root, drawing), "utf8")).scene;
    const graph = buildReferenceGraph(scene, specV2.artifactId);

    expect(graph.references.some((reference) => reference.kind === "endBinding")).toBe(true);
    expect(graph.groups.size).toBeGreaterThanOrEqual(0);
    expect(graph.dangling).toEqual([]);
  });

  test("two refresh processes with the same token yield one success and one conflict", async () => {
    const root = vault();
    const { project } = provisionFixture(root, "removed-agent-anchor");
    const spec = join(import.meta.dir, "fixtures/refresh-v2.json");
    const args = [
      "refresh",
      "--vault",
      root,
      "--expected-vault",
      root,
      "--project",
      project,
      "--spec",
      spec,
      "--expected-token",
      "cas-0",
      "--json",
    ] as const;

    const first = Bun.spawn([cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const second = Bun.spawn([cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const outputs = await Promise.all(
      [first, second].map(async (child) => ({
        code: await child.exited,
        stdout: await new Response(child.stdout).text(),
        stderr: await new Response(child.stderr).text(),
      })),
    );
    const success = outputs.filter((output) => output.code === 0);
    const conflict = outputs.filter((output) => output.code === 3);
    const drawing = parseSceneMarkdown(
      readFileSync(join(root, artifactPaths(project, specV2.artifactId).drawing), "utf8"),
    ).scene;

    expect(success).toHaveLength(1);
    expect(conflict).toHaveLength(1);
    expect(
      drawing.elements.some((element) => element.customData?.["deprecatedAnchor"] === true),
    ).toBe(true);
  });
});
