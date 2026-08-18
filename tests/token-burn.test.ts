import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshTransaction } from "../src/transaction-engine";
import { transactionPaths } from "../src/transaction-layout";
import { seedTransaction, specV1, specV2, transactionState } from "./transaction-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-burn-"));
});

describe("begin token burn", () => {
  test("an aborted begun token is never reused", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);

    expect(() =>
      refreshTransaction(
        { vault: root, project, spec: specV2, expectedToken: state.committedToken },
        {
          onBoundary(name) {
            if (name === "prepared-write") throw new Error("boom");
          },
        },
      ),
    ).toThrow("boom");
    expect(existsSync(join(paths.burnedRoot, "cas-1.json"))).toBe(true);

    const next = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: transactionState(root, project).committedToken,
    });

    expect(next.committedToken).toBe("cas-2");
    expect(JSON.parse(readFileSync(join(paths.burnedRoot, "cas-1.json"), "utf8"))).toEqual(
      expect.objectContaining({ token: "cas-1" }),
    );
  });

  test("a cancelled transaction burns its begun token and preserves the old state", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);

    expect(() =>
      refreshTransaction(
        { vault: root, project, spec: specV2, expectedToken: state.committedToken },
        {
          onBoundary(name) {
            if (name === "begin-parent-fsync") throw new Error("cancelled");
          },
        },
      ),
    ).toThrow("cancelled");
    expect(transactionState(root, project).committedToken).toBe("cas-0");
    expect(JSON.parse(readFileSync(join(paths.burnedRoot, "cas-1.json"), "utf8"))).toEqual(
      expect.objectContaining({ reason: "cancelled" }),
    );
  });
});
