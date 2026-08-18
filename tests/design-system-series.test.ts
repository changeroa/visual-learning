import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { renderGallerySvg } from "../src/svg-gallery";
import { generateTemplateBundle } from "../src/template-generate";
import { parseTemplateBundle } from "../src/template-schema";

const inference = (
  semanticId: string,
  visual: Record<string, string | number>,
  explanationKo = "구성 요소",
) => ({
  semanticId,
  identifier: semanticId,
  explanationKo,
  status: "inference",
  confidence: "medium",
  evidence: [],
  visual,
});

const relation = (semanticId: string, from: string, to: string, explanationKo = "호출") => ({
  semanticId,
  from,
  to,
  identifier: semanticId,
  explanationKo,
  status: "inference",
  confidence: "medium",
  evidence: [],
});

function designSystemBundle() {
  const timelineNodes = Array.from({ length: 7 }, (_, index) =>
    inference(
      `publish-step-${index + 1}`,
      { category: "runtime", lane: "main", order: index },
      `${index + 1}단계`,
    ),
  );
  const timelineEdges = Array.from({ length: 6 }, (_, index) =>
    relation(
      `publish-next-${index + 1}`,
      `publish-step-${index + 1}`,
      `publish-step-${index + 2}`,
      "정상 경로",
    ),
  );
  return parseTemplateBundle({
    schemaVersion: 1,
    bundleId: "architecture-series",
    project: "sample-service",
    repositoryRoot: "repo",
    artifacts: [
      {
        artifactId: "system-overview",
        kind: "system-architecture",
        titleKo: "시스템 개요",
        titleEn: "System overview",
        maxViewNodes: 6,
        presentation: {
          layout: "frames",
          frames: [
            { id: "external", label: "External", category: "external", order: 0 },
            { id: "cloudflare", label: "Cloudflare", category: "cloudflare", order: 1 },
            { id: "aws", label: "AWS", category: "aws", order: 2 },
          ],
        },
        nodes: [
          inference("browser", {
            category: "external",
            frameId: "external",
            shape: "ellipse",
            order: 0,
          }),
          inference("content-worker", {
            category: "cloudflare",
            frameId: "cloudflare",
            shape: "rectangle",
            order: 1,
          }),
          inference("publishing-daemon", {
            category: "aws",
            frameId: "aws",
            shape: "rectangle",
            order: 2,
          }),
        ],
        edges: [
          relation("request", "browser", "content-worker"),
          relation("dispatch", "content-worker", "publishing-daemon"),
        ],
      },
      {
        artifactId: "publication-workflow",
        kind: "workflow",
        titleKo: "게시 워크플로",
        titleEn: "Publication workflow",
        maxViewNodes: 8,
        presentation: { layout: "timeline", frames: [] },
        nodes: [
          ...timelineNodes,
          inference(
            "publishing-uncertain",
            { category: "risk", lane: "exception", shape: "diamond", order: 5 },
            "publishing_uncertain 분기",
          ),
        ],
        edges: [
          ...timelineEdges,
          relation("uncertain-branch", "publish-step-5", "publishing-uncertain", "불확실"),
        ],
      },
      {
        artifactId: "data-ownership",
        kind: "data-flow",
        titleKo: "데이터 소유권",
        titleEn: "Data flow",
        maxViewNodes: 6,
        presentation: { layout: "hub", frames: [] },
        nodes: [
          inference("d1", { category: "data", emphasis: "primary", order: 0 }),
          inference("r2", { category: "data", emphasis: "primary", order: 1 }),
          inference("postgresql", { category: "data", emphasis: "primary", order: 2 }),
          inference("writer", { category: "runtime", lane: "upstream", order: 3 }),
          inference("reader", { category: "runtime", lane: "downstream", order: 4 }),
        ],
        edges: [
          relation("write-d1", "writer", "d1", "소유권 기록"),
          relation("write-r2", "writer", "r2", "불변 객체"),
          relation("read-postgresql", "postgresql", "reader", "조회"),
        ],
      },
      {
        artifactId: "trust-boundaries",
        kind: "trust-boundary",
        titleKo: "신뢰 경계",
        titleEn: "Trust boundary",
        maxViewNodes: 6,
        presentation: {
          layout: "trust-boundary",
          frames: [
            { id: "browser-zone", label: "Browser", category: "external", order: 0 },
            { id: "service-zone", label: "Service binding", category: "security", order: 1 },
            { id: "iam-zone", label: "IAM", category: "aws", order: 2 },
          ],
        },
        nodes: [
          inference("identity", {
            category: "external",
            frameId: "browser-zone",
            shape: "ellipse",
            order: 0,
          }),
          inference("binding-check", {
            category: "security",
            frameId: "service-zone",
            shape: "diamond",
            order: 1,
          }),
          inference("iam-policy", {
            category: "security",
            frameId: "iam-zone",
            shape: "diamond",
            order: 2,
          }),
        ],
        edges: [
          relation("authenticate", "identity", "binding-check", "인증"),
          relation("authorize", "binding-check", "iam-policy", "권한 이동"),
        ],
      },
      {
        artifactId: "worker-components",
        kind: "component-architecture",
        titleKo: "Worker 컴포넌트",
        titleEn: "Worker components",
        maxViewNodes: 6,
        presentation: {
          layout: "components",
          frames: [{ id: "worker", label: "Worker", category: "cloudflare", order: 0 }],
        },
        nodes: [
          inference("router", { category: "runtime", frameId: "worker", order: 0 }),
          inference("service", { category: "runtime", frameId: "worker", order: 1 }),
          inference("repository", { category: "data", frameId: "worker", order: 2 }),
        ],
        edges: [
          relation("route-service", "router", "service"),
          relation("service-repository", "service", "repository"),
        ],
      },
      {
        artifactId: "daemon-components",
        kind: "component-architecture",
        titleKo: "Daemon 컴포넌트",
        titleEn: "Daemon components",
        maxViewNodes: 6,
        presentation: {
          layout: "components",
          frames: [{ id: "daemon", label: "Daemon", category: "aws", order: 0 }],
        },
        nodes: [
          inference("poller", { category: "runtime", frameId: "daemon", order: 0 }),
          inference("publisher", { category: "runtime", frameId: "daemon", order: 1 }),
          inference("ledger", { category: "data", frameId: "daemon", order: 2 }),
        ],
        edges: [
          relation("poll-publish", "poller", "publisher"),
          relation("publish-ledger", "publisher", "ledger"),
        ],
      },
    ],
  });
}

describe("architecture series design system", () => {
  test("generates six focused, visually consistent views", () => {
    const generated = generateTemplateBundle(
      designSystemBundle(),
      join(import.meta.dir, "fixtures/kinds/gallery/repo"),
    );

    expect(generated.views).toHaveLength(6);
    expect(generated.views.map((view) => view.spec.presentation?.layout)).toEqual([
      "frames",
      "timeline",
      "hub",
      "trust-boundary",
      "components",
      "components",
    ]);
    expect(
      generated.views[1]?.spec.nodes.filter((node) => node.visual?.lane === "main"),
    ).toHaveLength(7);
    expect(
      String(
        generated.views[1]?.spec.nodes.find((node) => node.visual?.lane === "exception")
          ?.semanticId,
      ),
    ).toBe("publishing-uncertain");
  });

  test("exports frames, category colors, actor ellipses, and decision diamonds to SVG", () => {
    const generated = generateTemplateBundle(
      designSystemBundle(),
      join(import.meta.dir, "fixtures/kinds/gallery/repo"),
    );
    const rendered = renderGallerySvg(generated.views);

    expect(rendered.svg).toContain('fill="#fff4e6"');
    expect(rendered.svg).toContain('fill-opacity="0.55"');
    expect(rendered.svg).toContain("<ellipse");
    expect(rendered.svg).toContain("<polygon");
    expect(rendered.svg).toContain('id="soft-shadow"');
  });
});
