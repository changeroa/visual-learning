import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConflictError } from "../src/errors";
import { transactionPaths } from "../src/transaction-layout";
import { acquireLock } from "../src/transaction-lock";
import { writeState } from "../src/transaction-state";
import { openTransaction } from "../src/transaction-verify";
import { seedTransaction, specV1, transactionState } from "./transaction-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-reader-lock-"));
});

describe("reader lock and downgrade", () => {
  test("reader uses the same lock root and conflicts with an exclusive writer", () => {
    const { project } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);
    const writer = acquireLock(paths.lockRoot, "exclusive");

    expect(() => openTransaction(root, project, specV1.artifactId)).toThrow(ConflictError);
    writer.close();
  });

  test("reader re-reads STATE after release/reacquire downgrade", () => {
    const { project } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);
    const state = transactionState(root, project);

    expect(() =>
      openTransaction(root, project, specV1.artifactId, {
        beforeSharedReacquire() {
          writeState(paths.statePath, {
            ...state,
            committedToken: "cas-9",
            workingPath: `${state.workingPath}.missing`,
          });
        },
      }),
    ).toThrow(/BLOCKED|missing/i);
  });

  test("stale writer lock with a dead pid is reclaimed", () => {
    const { project } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);
    mkdirSync(paths.lockRoot, { recursive: true });
    writeFileSync(join(paths.lockRoot, "writer"), "999999\n");

    const opened = openTransaction(root, project, specV1.artifactId);

    expect(opened.recovery).toBe("forward");
    expect(existsSync(join(paths.lockRoot, "writer"))).toBe(false);
  });
});
