import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshTransaction } from "../src/transaction-engine";
import { revisionFiles } from "../src/transaction-layout";
import {
  currentScene,
  humanSave,
  seedTransaction,
  specV2,
  transactionState,
} from "./transaction-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-working-copy-"));
});

describe("working copy publication", () => {
  test("publishes a fresh token-scoped working file and keeps prior revision immutable", () => {
    const { project } = seedTransaction(root, "human-text-container-to-agent");
    const before = transactionState(root, project);
    const snapshotBefore = readFileSync(revisionFiles(before.revisionPath).snapshot, "utf8");

    const result = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: before.committedToken,
    });
    humanSave(root, project, "working-only-change");

    expect(result.workingPath).not.toBe(before.workingPath);
    expect(readFileSync(revisionFiles(before.revisionPath).snapshot, "utf8")).toBe(snapshotBefore);
    expect(
      currentScene(root, project).elements.find((element) => element.id === "human-text")?.text,
    ).toBe("working-only-change");
  });
});
