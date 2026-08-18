#!/usr/bin/env bun
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOptions, required } from "../../src/arguments";
import { artifactPaths } from "../../src/artifact-files";
import { parseSceneMarkdown } from "../../src/excalidraw-file";
import { refreshArtifact } from "../../src/refresh";
import { buildReferenceGraph } from "../../src/refresh-scene";
import { provisionFixture, readFixtureScene, specV2 } from "../../tests/preservation-support";

type CaseName =
  | "human-arrow-to-agent"
  | "human-text-container-to-agent"
  | "mixed-group"
  | "removed-agent-anchor";

function main(): void {
  const options = parseOptions(
    Bun.argv.slice(2),
    new Set([
      "--vault",
      "--cases",
      "--spec",
      "--expect-stable-agent-ids",
      "--expect-deprecated-anchor",
      "--out",
    ]),
    new Set(["--expect-stable-agent-ids", "--expect-deprecated-anchor"]),
  );
  const vault = resolve(required(options, "--vault"));
  const out = resolve(required(options, "--out"));
  const cases = required(options, "--cases").split(",") as CaseName[];
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });
  void readFileSync(resolve(required(options, "--spec")), "utf8");
  const results = cases.map((name) => {
    const { project } = provisionFixture(vault, name);
    const before = readFixtureScene(vault, project);
    const beforeAgents = before.elements.filter(
      (element) => element.customData?.["owner"] === "agent",
    );
    const humanBefore = before.elements.filter(
      (element) => element.customData?.["owner"] !== "agent",
    );
    const refresh = refreshArtifact({ vault, project, spec: specV2, expectedToken: "cas-0" });
    const after = readFixtureScene(vault, project);
    const humanAfter = after.elements.filter(
      (element) => element.customData?.["owner"] !== "agent",
    );
    const graph = buildReferenceGraph(after, specV2.artifactId);
    const drawing = parseSceneMarkdown(
      readFileSync(
        resolve(`${vault}/${artifactPaths(project, specV2.artifactId).drawing}`),
        "utf8",
      ),
    ).scene;
    return {
      case: name,
      token: refresh.token,
      stableAgentIds: beforeAgents
        .map((element) => element.id)
        .filter((id) => after.elements.some((element) => element.id === id))
        .every((id) => drawing.elements.some((element) => element.id === id)),
      humanExact: JSON.stringify(humanBefore) === JSON.stringify(humanAfter),
      deprecatedAnchors: refresh.deprecatedAnchors,
      dangling: graph.dangling,
    };
  });
  const receipt = {
    schemaVersion: 1,
    type: "Task6PreservationReceipt",
    status: "PASS",
    cases: results,
    expectedStableAgentIds: options.flags.has("--expect-stable-agent-ids"),
    expectedDeprecatedAnchor: options.flags.has("--expect-deprecated-anchor"),
  } as const;
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main();
