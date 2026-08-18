import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileReceipt } from "../src/transaction-agent";
import { openTransaction } from "../src/transaction-verify";
import {
  currentScene,
  humanSave,
  seedTransaction,
  specV1,
  transactionState,
} from "./transaction-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-human-save-"));
});

describe("human-only saves", () => {
  test("change the full working hash without changing agentBaseHash or readability", () => {
    const { project } = seedTransaction(root, "human-text-container-to-agent");
    const before = transactionState(root, project);
    const receiptBefore = fileReceipt(before.workingPath, 0);

    humanSave(root, project, "late human note");

    const after = transactionState(root, project);
    const receiptAfter = fileReceipt(after.workingPath, 0);
    const opened = openTransaction(root, project, specV1.artifactId);

    expect(after.agentBaseHash).toBe(before.agentBaseHash);
    expect(receiptAfter.fullHash).not.toBe(receiptBefore.fullHash);
    expect(
      currentScene(root, project).elements.find((element) => element.id === "human-text")?.text,
    ).toBe("late human note");
    expect(opened.state.committedToken).toBe(before.committedToken);
    expect(opened.recovery).toBe("forward");
  });
});
