import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshTransaction, restoreTransaction } from "../src/transaction-engine";
import { revisionFiles } from "../src/transaction-layout";
import {
  currentScene,
  seedTransaction,
  specV1,
  specV2,
  transactionState,
} from "./transaction-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-restore-"));
});

describe("restore as a fresh token", () => {
  test("restoring A after A->B creates fresh C with A's snapshot", () => {
    const { project } = seedTransaction(root, "human-arrow-to-agent");
    const a = transactionState(root, project);
    const snapshotA = readFileSync(revisionFiles(a.revisionPath).snapshot, "utf8");

    const b = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: a.committedToken,
    });
    const c = restoreTransaction({
      vault: root,
      project,
      artifactId: specV1.artifactId,
      revisionToken: "cas-0",
      expectedToken: b.committedToken,
    });
    const after = transactionState(root, project);

    expect(c.committedToken).toBe("cas-2");
    expect(after.committedToken).toBe("cas-2");
    expect(readFileSync(after.workingPath, "utf8")).toBe(snapshotA);
    expect(currentScene(root, project).elements.length).toBeGreaterThan(0);
  });
});
