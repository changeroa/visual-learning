import { describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
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
  test("publishes a portable linked series under isolated docs/vl/projects", () => {
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
    const output = join(realpathSync(sessionRoot), "docs/vl/projects/example-project");

    expect(first.status).toBe("CREATED");
    expect(second.status).toBe("ALREADY_CURRENT");
    expect(first.outputRoot).toBe(output);
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

  test("renders the learning layer in the companion note, index, and SVG", () => {
    // Given
    const sessionRoot = mkdtempSync(join(tmpdir(), "visual-learning-session-learning-"));
    const specDirectory = mkdtempSync(join(tmpdir(), "visual-learning-specs-learning-"));
    const source = realpathSync(mkdtempSync(join(tmpdir(), "visual-learning-source-")));
    cpSync(join(import.meta.dir, "fixtures/sample-project/repo"), source, { recursive: true });
    const spec = JSON.parse(
      readFileSync(join(import.meta.dir, "fixtures/learning/checkout-journey.json"), "utf8"),
    ) as { source: { root: string } };
    spec.source.root = source;
    writeFileSync(join(specDirectory, "checkout-journey.json"), jsonBytes(spec));
    writeSpec(specDirectory, "system-overview", "system-architecture", "시스템 개요");
    // When
    exportSeries({ sessionRoot, project: "learning-project", specDirectory });
    // Then
    const output = join(realpathSync(sessionRoot), "docs/vl/projects/learning-project");
    const note = readFileSync(join(output, "checkout-journey.md"), "utf8");
    expect(note.indexOf("> [!question]")).toBeLessThan(note.indexOf("![POST /orders"));
    expect(note).toContain("1. **OrdersRouter** · 확인된 사실 — HTTP 진입점.");
    expect(note).toContain(
      "(1) [OrdersRouter] ..calls submitOrder <runtime-call>..> (2) [CheckoutService]",
    );
    expect(note).toContain("- 결제 실패와 재시도 경로");
    expect(note).toContain("grep -n createOrder src/routes/orders.ts openapi/orders.yaml");
    expect(note).toContain("> [!example]- Q1.");
    expect(note).toContain("- 맞지 않는 부분:");
    expect(readFileSync(join(output, "index.md"), "utf8")).toContain("**질문:** POST /orders");
    const svg = readFileSync(join(output, "checkout-journey.svg"), "utf8");
    expect(svg.match(/data-route-step="\d+"/g)?.length).toBe(7);
    const plain = readFileSync(join(output, "system-overview.md"), "utf8");
    expect(plain).not.toContain("## 읽는 순서");
    expect(plain).not.toContain("[!question]");
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
