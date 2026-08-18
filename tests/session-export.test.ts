import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CollisionError } from "../src/errors";
import { jsonBytes } from "../src/io";
import { exportSeries } from "../src/session-export";

function writeSpec(directory: string, artifactId: string, kind: string, title: string): void {
  writeFileSync(
    join(directory, `${artifactId}.json`),
    jsonBytes({
      schemaVersion: 1,
      artifactId,
      kind,
      revision: 1,
      title,
      source: { root: directory, commit: null },
      presentation: { layout: "timeline", direction: "left-to-right", frames: [] },
      nodes: [
        {
          semanticId: `${artifactId}-node`,
          label: `ExampleService\n예시 서비스`,
          status: "inference",
          evidence: [],
          visual: { category: "runtime", shape: "rectangle", lane: "main", order: 0 },
        },
      ],
      edges: [],
    }),
  );
}

describe("session-root series export", () => {
  test("publishes a portable linked series under docs/ve and reruns byte-identically", () => {
    const sessionRoot = mkdtempSync(join(tmpdir(), "visual-learning-session-"));
    const specDirectory = mkdtempSync(join(tmpdir(), "visual-learning-specs-"));
    writeSpec(specDirectory, "system-overview", "system-architecture", "시스템 개요");
    writeSpec(specDirectory, "publication-workflow", "workflow", "게시 흐름");

    const first = exportSeries({
      sessionRoot,
      project: "example-project",
      specDirectory,
    });
    const second = exportSeries({
      sessionRoot,
      project: "example-project",
      specDirectory,
    });
    const output = join(realpathSync(sessionRoot), "docs/ve/example-project");

    expect(first.status).toBe("CREATED");
    expect(second.status).toBe("ALREADY_CURRENT");
    expect(first.outputRoot).toBe(output);
    expect(existsSync(join(output, ".obsidian"))).toBe(false);
    expect(existsSync(join(output, "system-overview.svg"))).toBe(true);
    expect(existsSync(join(output, "system-overview.excalidraw.md"))).toBe(true);
    expect(existsSync(join(output, "specs/system-overview.json"))).toBe(true);
    expect(readFileSync(join(output, "index.md"), "utf8")).toContain(
      "[상세 노트 열기](./system-overview.md)",
    );
    expect(readFileSync(join(output, "publication-workflow.md"), "utf8")).toContain(
      "[시리즈 홈](./index.md)",
    );
  });

  test("refuses to overwrite a non-identical generated series", () => {
    const sessionRoot = mkdtempSync(join(tmpdir(), "visual-learning-session-conflict-"));
    const specDirectory = mkdtempSync(join(tmpdir(), "visual-learning-specs-conflict-"));
    writeSpec(specDirectory, "system-overview", "system-architecture", "시스템 개요");
    exportSeries({ sessionRoot, project: "example-project", specDirectory });
    writeSpec(specDirectory, "system-overview", "system-architecture", "변경된 시스템 개요");

    expect(() => exportSeries({ sessionRoot, project: "example-project", specDirectory })).toThrow(
      CollisionError,
    );
  });
});
