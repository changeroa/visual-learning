import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshTransaction } from "../src/transaction-engine";
import { writeJsonAtomic } from "../src/transaction-fs";
import { transactionPaths } from "../src/transaction-layout";
import { writeBegin, writeState } from "../src/transaction-state";
import { openTransaction } from "../src/transaction-verify";
import { seedTransaction, specV1, specV2, transactionState } from "./transaction-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-recovery-"));
});

describe("crash recovery", () => {
  test("rolls back a begun unpublished tuple to the old state", () => {
    const { project, state: a } = seedTransaction(root, "human-arrow-to-agent");
    const b = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: a.committedToken,
    });
    const paths = transactionPaths(root, project, specV1.artifactId);

    writeState(paths.statePath, a);
    writeBegin(paths.beginPath, {
      schemaVersion: 1,
      token: b.committedToken,
      previousToken: a.committedToken,
      previousStateDigest: "rollback",
      previousSceneGeneration: a.sceneGeneration,
      sourcePath: a.workingPath,
      sourceReceipt: {
        inode: "rollback",
        generation: "rollback",
        fullHash: "rollback",
        eventSequence: 0,
      },
    });
    writeJsonAtomic(paths.committedPath, {
      schemaVersion: 1,
      token: a.committedToken,
      revisionPath: a.revisionPath,
      workingPath: a.workingPath,
      agentBaseHash: a.agentBaseHash,
      sceneGeneration: a.sceneGeneration,
    });

    const opened = openTransaction(root, project, specV1.artifactId);

    expect(opened.recovery).toBe("rollback");
    expect(transactionState(root, project).committedToken).toBe("cas-0");
    expect(existsSync(paths.revisionPath("cas-1"))).toBe(false);
    expect(existsSync(join(paths.burnedRoot, "cas-1.json"))).toBe(true);
  });

  test("forward-recovers a published STATE before COMMITTED", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const b = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: state.committedToken,
    });
    const paths = transactionPaths(root, project, specV1.artifactId);

    writeBegin(paths.beginPath, {
      schemaVersion: 1,
      token: b.committedToken,
      previousToken: state.committedToken,
      previousStateDigest: "forward",
      previousSceneGeneration: state.sceneGeneration,
      sourcePath: state.workingPath,
      sourceReceipt: {
        inode: "forward",
        generation: "forward",
        fullHash: "forward",
        eventSequence: 0,
      },
    });
    rmSync(paths.committedPath, { force: true });

    const opened = openTransaction(root, project, specV1.artifactId);

    expect(opened.recovery).toBe("forward");
    expect(transactionState(root, project).committedToken).toBe("cas-1");
    expect(readFileSync(paths.committedPath, "utf8")).toContain("cas-1");
    expect(existsSync(paths.beginPath)).toBe(false);
  });

  test("forward recovery blocks when COMMITTED tuple disagrees with STATE", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const b = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: state.committedToken,
    });
    const paths = transactionPaths(root, project, specV1.artifactId);

    writeBegin(paths.beginPath, {
      schemaVersion: 1,
      token: b.committedToken,
      previousToken: state.committedToken,
      previousStateDigest: "forward",
      previousSceneGeneration: state.sceneGeneration,
      sourcePath: state.workingPath,
      sourceReceipt: {
        inode: "forward",
        generation: "forward",
        fullHash: "forward",
        eventSequence: 0,
      },
    });
    writeJsonAtomic(paths.committedPath, {
      schemaVersion: 1,
      token: b.committedToken,
      revisionPath: state.revisionPath,
      workingPath: state.workingPath,
      agentBaseHash: state.agentBaseHash,
      sceneGeneration: state.sceneGeneration,
    });

    expect(() => openTransaction(root, project, specV1.artifactId)).toThrow(/BLOCKED/);
  });

  test("repeated recovery is idempotent after rollback", () => {
    const { project, state: a } = seedTransaction(root, "human-arrow-to-agent");
    const b = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: a.committedToken,
    });
    const paths = transactionPaths(root, project, specV1.artifactId);

    writeState(paths.statePath, a);
    writeBegin(paths.beginPath, {
      schemaVersion: 1,
      token: b.committedToken,
      previousToken: a.committedToken,
      previousStateDigest: "rollback",
      previousSceneGeneration: a.sceneGeneration,
      sourcePath: a.workingPath,
      sourceReceipt: {
        inode: "rollback",
        generation: "rollback",
        fullHash: "rollback",
        eventSequence: 0,
      },
    });
    const first = openTransaction(root, project, specV1.artifactId);
    const second = openTransaction(root, project, specV1.artifactId);

    expect(first.recovery).toBe("rollback");
    expect(second.recovery).toBe("clean");
    expect(transactionState(root, project).committedToken).toBe("cas-0");
    expect(existsSync(join(paths.burnedRoot, "cas-1.json"))).toBe(true);
  });
});
