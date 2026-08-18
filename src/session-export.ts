import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { z } from "zod";
import { InputError } from "./errors";
import { resolveEvidence } from "./evidence-resolver";
import { encodeSceneToMarkdown } from "./excalidraw-file";
import { jsonBytes, sha256 } from "./io";
import { publishProjectDirectory } from "./project-publish";
import { sceneFromSpec } from "./scene-bootstrap";
import { parseVisualNoteSpec, type VisualNoteSpec } from "./schema";
import { renderViewSvg } from "./svg-gallery";
import type { GeneratedView } from "./template-generate";
import { styleForClaim } from "./template-style";

const projectSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const kindOrder = new Map<VisualNoteSpec["kind"], number>([
  ["project-map", 0],
  ["system-architecture", 1],
  ["container-architecture", 2],
  ["workflow", 3],
  ["data-flow", 4],
  ["trust-boundary", 5],
  ["component-architecture", 6],
  ["api-contract", 7],
  ["adr", 8],
  ["code-exploration", 9],
]);

function realDirectory(path: string, label: string): string {
  if (!isAbsolute(path) || normalize(path) !== path || path === "/") {
    throw new InputError(`${label} must be a normalized absolute non-root path`);
  }
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch (error) {
    throw new InputError(`${label} does not exist: ${path}`, { cause: error });
  }
  if (!lstatSync(resolved).isDirectory()) throw new InputError(`${label} must be a directory`);
  return resolved;
}

function readSpecs(specDirectory: string): readonly VisualNoteSpec[] {
  const specs = readdirSync(specDirectory, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "source.json",
    )
    .map((entry) => {
      const path = join(specDirectory, entry.name);
      const spec = parseVisualNoteSpec(JSON.parse(readFileSync(path, "utf8")));
      if (`${spec.artifactId}.json` !== entry.name) {
        throw new InputError(`spec filename must match artifactId: ${entry.name}`);
      }
      for (const claim of [...spec.nodes, ...spec.edges]) {
        if (claim.status === "fact") resolveEvidence(spec.source.root, claim.evidence);
      }
      return spec;
    })
    .sort(
      (left, right) =>
        (kindOrder.get(left.kind) ?? 99) - (kindOrder.get(right.kind) ?? 99) ||
        left.artifactId.localeCompare(right.artifactId),
    );
  if (specs.length === 0) throw new InputError(`no visual-note specs found in ${specDirectory}`);
  if (new Set(specs.map((spec) => spec.artifactId)).size !== specs.length) {
    throw new InputError("artifactIds must be unique across the exported series");
  }
  return specs;
}

function confidenceFor(status: "fact" | "inference" | "question") {
  if (status === "fact") return "high" as const;
  if (status === "inference") return "medium" as const;
  return "unknown" as const;
}

function viewFor(spec: VisualNoteSpec): GeneratedView {
  return {
    viewId: spec.artifactId,
    artifactId: spec.artifactId,
    kind: spec.kind,
    title: spec.title,
    spec,
    relatedViewIds: [],
    styles: [...spec.nodes, ...spec.edges].map((claim) =>
      styleForClaim(claim.semanticId, claim.status, confidenceFor(claim.status)),
    ),
    split: {
      coreNodeIds: spec.nodes.map((node) => node.semanticId),
      duplicateNodeIds: [],
      edgeIds: spec.edges.map((edge) => edge.semanticId),
    },
  };
}

function evidenceText(spec: VisualNoteSpec): string {
  return [...spec.nodes, ...spec.edges]
    .map((claim) => {
      const evidence = claim.evidence
        .map((reference) => {
          const lines =
            reference.lineStart === undefined
              ? ""
              : `:${reference.lineStart}${reference.lineEnd === undefined ? "" : `-${reference.lineEnd}`}`;
          const symbol = reference.symbol === undefined ? "" : `#${reference.symbol}`;
          return `\`${reference.path}${lines}${symbol}\``;
        })
        .join(", ");
      return `- \`${claim.semanticId}\` **${claim.status}** — ${claim.label.replaceAll("\n", " · ")}${evidence.length === 0 ? "" : ` — ${evidence}`}`;
    })
    .join("\n");
}

function noteFor(specs: readonly VisualNoteSpec[], index: number): string {
  const spec = specs[index];
  if (spec === undefined) throw new TypeError("missing series spec");
  const previous = specs[index - 1];
  const next = specs[index + 1];
  const navigation = [
    previous === undefined ? null : `[← ${previous.title}](./${previous.artifactId}.md)`,
    "[시리즈 홈](./index.md)",
    next === undefined ? null : `[${next.title} →](./${next.artifactId}.md)`,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");
  return `---
artifactId: ${spec.artifactId}
kind: ${spec.kind}
revision: ${spec.revision}
---

# ${spec.title}

${navigation}

![${spec.title}](./${spec.artifactId}.svg)

[Excalidraw 원본](./${spec.artifactId}.excalidraw.md) · [검증 스펙](./specs/${spec.artifactId}.json)

- Source: \`${spec.source.root}\`
- Commit: \`${spec.source.commit ?? "uncommitted"}\`

## Evidence status

${evidenceText(spec)}
`;
}

function indexFor(project: string, specs: readonly VisualNoteSpec[]): string {
  const sections = specs
    .map(
      (spec, index) => `## ${index + 1}. ${spec.title}

[상세 노트 열기](./${spec.artifactId}.md)

![${spec.title}](./${spec.artifactId}.svg)`,
    )
    .join("\n\n");
  return `# ${project} visual architecture series

한 장에 모든 내용을 압축하지 않고, 서로 다른 질문에 답하는 연결된 시리즈로 구성했다.

${sections}

SVG는 읽기 전용 미리보기이며, 같은 이름의 \`.excalidraw.md\` 파일이 편집 가능한 원본이다.
`;
}

export function exportSeries(input: {
  readonly sessionRoot: string;
  readonly project: string;
  readonly specDirectory: string;
}): {
  readonly operation: "export-series";
  readonly status: "CREATED" | "ALREADY_CURRENT";
  readonly outputRoot: string;
  readonly artifacts: readonly string[];
  readonly files: readonly string[];
} {
  const sessionRoot = realDirectory(input.sessionRoot, "session root");
  const specDirectory = realDirectory(input.specDirectory, "spec directory");
  const project = projectSlug.parse(input.project);
  const specs = readSpecs(specDirectory);
  const tempRoot = mkdtempSync(join(sessionRoot, ".visual-learning-export-"));
  const stageProject = join(tempRoot, project);
  const files: string[] = [];
  const write = (relativePath: string, bytes: string): void => {
    const path = join(stageProject, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    files.push(relativePath);
  };
  try {
    write("index.md", indexFor(project, specs));
    for (const [index, spec] of specs.entries()) {
      const view = viewFor(spec);
      write(`${spec.artifactId}.md`, noteFor(specs, index));
      write(`${spec.artifactId}.svg`, `${renderViewSvg(view).svg}\n`);
      write(
        `${spec.artifactId}.excalidraw.md`,
        encodeSceneToMarkdown(sceneFromSpec(spec, "visual-learning/session-export")),
      );
      write(`specs/${spec.artifactId}.json`, jsonBytes(spec));
    }
    const manifest = {
      schemaVersion: 1,
      project,
      artifacts: specs.map((spec) => ({
        artifactId: spec.artifactId,
        kind: spec.kind,
        revision: spec.revision,
      })),
      files: [...files].sort().map((relativePath) => ({
        relativePath,
        sha256: sha256(readFileSync(join(stageProject, relativePath))),
      })),
    } as const;
    write("manifest.json", jsonBytes(manifest));
    const targetProject = join(sessionRoot, "docs", "ve", project);
    const published = publishProjectDirectory(stageProject, targetProject);
    return {
      operation: "export-series",
      status: published.status,
      outputRoot: targetProject,
      artifacts: specs.map((spec) => spec.artifactId),
      files: [...files].sort(),
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
