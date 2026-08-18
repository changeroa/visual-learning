import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConflictError } from "../src/errors";
import { refreshTransaction, restoreTransaction } from "../src/transaction-engine";
import { seedTransaction, specV1, specV2 } from "./transaction-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-aba-"));
});

describe("ABA restore protection", () => {
  test("stale A conflicts after A->B->restore-A-as-C", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const b = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: state.committedToken,
    });
    const c = restoreTransaction({
      vault: root,
      project,
      artifactId: specV1.artifactId,
      revisionToken: "cas-0",
      expectedToken: b.committedToken,
    });

    expect(c.committedToken).toBe("cas-2");
    expect(() =>
      refreshTransaction({
        vault: root,
        project,
        spec: specV2,
        expectedToken: state.committedToken,
      }),
    ).toThrow(ConflictError);
  });
});
