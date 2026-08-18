import { readFileSync, writeFileSync } from "node:fs";
import {
  type ExcalidrawScene,
  encodeSceneToMarkdown,
  parseSceneMarkdown,
} from "../src/excalidraw-file";
import { bootstrapTransaction } from "../src/transaction-engine";
import { transactionPaths } from "../src/transaction-layout";
import { readState, type StateRecord } from "../src/transaction-state";
import { openTransaction } from "../src/transaction-verify";
import {
  beforeAfterHuman,
  provisionFixture,
  readFixtureScene,
  specV1,
  specV2,
  writeFixtureScene,
} from "./preservation-support";

export type FixtureName =
  | "human-arrow-to-agent"
  | "human-text-container-to-agent"
  | "mixed-group"
  | "removed-agent-anchor";

export function seedTransaction(
  vault: string,
  fixture: FixtureName,
): {
  readonly project: string;
  readonly state: StateRecord;
} {
  const { project } = provisionFixture(vault, fixture);
  const scene = readFixtureScene(vault, project);
  bootstrapTransaction({ vault, project, spec: specV1, scene });
  return {
    project,
    state: readState(transactionPaths(vault, project, specV1.artifactId).statePath),
  };
}

export function transactionState(vault: string, project: string): StateRecord {
  return readState(transactionPaths(vault, project, specV1.artifactId).statePath);
}

export function currentScene(vault: string, project: string): ExcalidrawScene {
  const state = transactionState(vault, project);
  return parseSceneMarkdown(readFileSync(state.workingPath, "utf8")).scene;
}

export function writeCurrentScene(vault: string, project: string, scene: ExcalidrawScene): void {
  const state = transactionState(vault, project);
  writeFileSync(state.workingPath, encodeSceneToMarkdown(scene));
}

export function humanSave(vault: string, project: string, text: string): void {
  const scene = currentScene(vault, project);
  const human = scene.elements.find((element) => element.customData?.["owner"] !== "agent");
  if (human === undefined) throw new TypeError("human element missing");
  if (human.type === "text") {
    human.text = text;
    human.originalText = text;
    human.rawText = text;
  } else {
    human.link = `# ${text}`;
  }
  writeCurrentScene(vault, project, scene);
}

export function agentTamper(vault: string, project: string): void {
  const scene = currentScene(vault, project);
  const agent = scene.elements.find((element) => element.customData?.["owner"] === "agent");
  if (agent === undefined) throw new TypeError("agent element missing");
  agent.strokeColor = "#ff0000";
  agent.x += 17;
  writeCurrentScene(vault, project, scene);
}

export function openCurrent(vault: string, project: string) {
  return openTransaction(vault, project, specV1.artifactId);
}

export { beforeAfterHuman, readFixtureScene, specV1, specV2, writeFixtureScene };
