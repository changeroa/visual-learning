import { beforeEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConflictError } from "../src/errors";
import { refreshTransaction } from "../src/transaction-engine";
import { transactionPaths } from "../src/transaction-layout";
import {
  currentScene,
  humanSave,
  seedTransaction,
  specV1,
  specV2,
  transactionState,
} from "./transaction-support";

let root = "";

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "visual-note-transaction-"));
});

describe("transaction final CAS", () => {
  test("catches a human save after close+flush but before STATE rename", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);

    expect(() =>
      refreshTransaction(
        { vault: root, project, spec: specV2, expectedToken: state.committedToken },
        {
          onBoundary(name) {
            if (name === "final-source-cas") humanSave(root, project, "after-close");
          },
        },
      ),
    ).toThrow(ConflictError);
    expect(transactionState(root, project).committedToken).toBe("cas-0");
    expect(
      currentScene(root, project).elements.find((element) => element.id === "human-arrow")?.link,
    ).toBe("# after-close");
    expect(readFileSync(join(paths.burnedRoot, "cas-1.json"), "utf8")).toContain(
      "source CAS changed",
    );
  });

  test("blocks a rewritten STATE tuple at validate-state-tuple", () => {
    const { project, state } = seedTransaction(root, "human-arrow-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);
    const altRevision = join(root, "alt", "cas-0-revision");
    const altWorking = join(root, "alt", "cas-0-working-link.excalidraw.md");

    expect(() =>
      refreshTransaction(
        { vault: root, project, spec: specV2, expectedToken: state.committedToken },
        {
          onBoundary(name) {
            if (name !== "validate-state-tuple") return;
            cpSync(state.revisionPath, altRevision, { recursive: true });
            symlinkSync(state.workingPath, altWorking);
            writeFileSync(
              paths.statePath,
              `${JSON.stringify(
                {
                  committedToken: "cas-1",
                  revisionPath: altRevision,
                  workingPath: altWorking,
                  agentBaseHash: state.agentBaseHash,
                  sceneGeneration: 999,
                  schemaVersion: 1,
                },
                null,
                2,
              )}\n`,
            );
          },
        },
      ),
    ).toThrow(/BLOCKED|state/i);
    expect(transactionState(root, project).committedToken).toBe("cas-0");
    expect(readFileSync(join(paths.burnedRoot, "cas-1.json"), "utf8")).toContain("cas-1");
  });

  test("blocks new-working edits between STATE rename and COMMITTED", () => {
    const { project, state } = seedTransaction(root, "human-text-container-to-agent");
    const paths = transactionPaths(root, project, specV1.artifactId);

    expect(() =>
      refreshTransaction(
        { vault: root, project, spec: specV2, expectedToken: state.committedToken },
        {
          onBoundary(name) {
            if (name === "validate-state-tuple") humanSave(root, project, "after-state-rename");
          },
        },
      ),
    ).toThrow(/BLOCKED|receipt|state/i);
    expect(transactionState(root, project).committedToken).toBe("cas-0");
    expect(
      currentScene(root, project).elements.find((element) => element.id === "human-text")?.text,
    ).toBe("Human note");
    expect(readFileSync(join(paths.burnedRoot, "cas-1.json"), "utf8")).toContain("cas-1");
  });
});
