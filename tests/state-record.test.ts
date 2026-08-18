import { beforeEach, describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeError } from "../src/errors";
import { agentBaseHash, agentBaseHashLegacy } from "../src/transaction-agent";
import { refreshTransaction } from "../src/transaction-engine";
import { revisionFiles, transactionPaths } from "../src/transaction-layout";
import { readBegin, readCommitted, readState, writeCommitted } from "../src/transaction-state";
import { openTransaction } from "../src/transaction-verify";
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
  root = mkdtempSync(join(tmpdir(), "visual-note-state-"));
});

describe("transaction STATE record", () => {
  test("bootstrap publishes authoritative state and immutable revision contents", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);
    const files = revisionFiles(state.revisionPath);

    expect(existsSync(paths.statePath)).toBe(true);
    expect(state.committedToken).toBe("cas-0");
    expect(state.workingPath).toBe(paths.workingPath("cas-0"));
    expect(state.revisionPath).toBe(paths.revisionPath("cas-0"));
    expect(state.agentBaseHash).toBe(agentBaseHashLegacy(currentScene(root, project)));
    for (const file of Object.values(files)) expect(existsSync(file)).toBe(true);
    expect(readFileSync(files.spec, "utf8")).toContain('"revision": 1');
    expect(readFileSync(files.note, "utf8")).toContain("## Evidence status");
  });

  test("refresh advances only the authoritative tuple and generation", () => {
    const { project } = seedTransaction(root, "human-arrow-to-agent");
    const before = transactionState(root, project);

    const result = refreshTransaction({
      vault: root,
      project,
      spec: specV2,
      expectedToken: before.committedToken,
    });
    const after = transactionState(root, project);

    expect(result.committedToken).toBe("cas-1");
    expect(after.committedToken).toBe("cas-1");
    expect(after.workingPath).toBe(result.workingPath);
    expect(after.revisionPath).toBe(result.revisionPath);
    expect(after.workingPath).not.toBe(before.workingPath);
    expect(after.revisionPath).not.toBe(before.revisionPath);
    expect(after.sceneGeneration).toBe(before.sceneGeneration + 1);
    expect(after.agentBaseHash).toBe(agentBaseHash(currentScene(root, project)));
  });

  test("truncated STATE BEGIN and COMMITTED block with typed RuntimeError", () => {
    const { project } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);

    writeFileSync(paths.statePath, '{\n  "schemaVersion": 1');
    expect(() => readState(paths.statePath)).toThrow(RuntimeError);
    expect(() => openTransaction(root, project, specV1.artifactId)).toThrow(
      /BLOCKED: malformed STATE/,
    );

    seedTransaction(root, "human-arrow-to-agent");
    writeFileSync(paths.beginPath, '{\n  "schemaVersion": 1');
    expect(() => readBegin(paths.beginPath)).toThrow(/BLOCKED: malformed BEGIN/);
    expect(() => openTransaction(root, project, specV1.artifactId)).toThrow(
      /BLOCKED: malformed BEGIN/,
    );

    rmSync(paths.beginPath, { force: true });
    writeFileSync(paths.committedPath, '{\n  "schemaVersion": 1');
    expect(() => readCommitted(paths.committedPath)).toThrow(/BLOCKED: malformed COMMITTED/);
    expect(() => openTransaction(root, project, specV1.artifactId)).toThrow(
      /BLOCKED: malformed COMMITTED/,
    );
  });

  test("open blocks alternate coherent revision paths, symlinked working paths, and bogus generation", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);
    const altRevision = join(root, "alt", "cas-0-revision");
    const altWorking = join(root, "alt", "cas-0-working-link.excalidraw.md");

    cpSync(state.revisionPath, altRevision, { recursive: true });
    symlinkSync(state.workingPath, altWorking);
    writeCommitted(paths.committedPath, {
      schemaVersion: 1,
      token: state.committedToken,
      revisionPath: altRevision,
      workingPath: altWorking,
      agentBaseHash: state.agentBaseHash,
      sceneGeneration: 999,
    });
    writeFileSync(
      paths.statePath,
      `${JSON.stringify(
        {
          ...state,
          revisionPath: altRevision,
          workingPath: altWorking,
          sceneGeneration: 999,
        },
        null,
        2,
      )}\n`,
    );

    expect(() => openTransaction(root, project, specV1.artifactId)).toThrow(/BLOCKED/);
  });

  test("open rejects tampered immutable revision contents", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    writeFileSync(revisionFiles(state.revisionPath).note, "tampered\n");

    expect(() => openTransaction(root, project, specV1.artifactId)).toThrow(/BLOCKED/);
  });
});
