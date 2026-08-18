import type { VisualNoteSpec } from "./schema";

export type ArtifactPaths = {
  readonly base: string;
  readonly drawingFolder: string;
  readonly drawing: string;
  readonly svg: string;
  readonly note: string;
  readonly spec: string;
};

export function artifactPaths(project: string, artifactId: string): ArtifactPaths {
  const base = `Engineering Atlas/10 Projects/${project}`;
  const drawingFolder = `${base}/_generated/drawings`;
  return {
    base,
    drawingFolder,
    drawing: `${drawingFolder}/${artifactId}.excalidraw.md`,
    svg: `${drawingFolder}/${artifactId}.svg`,
    note: `${base}/01 Architecture/${artifactId}.md`,
    spec: `${base}/_generated/specs/${artifactId}.json`,
  };
}

export function noteBytes(
  spec: VisualNoteSpec,
  drawing: string,
  svg: string,
  deprecatedAnchors: readonly string[] = [],
): string {
  const claims = [...spec.nodes, ...spec.edges]
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
      return `- \`${claim.semanticId}\` **${claim.status}** - ${claim.label}${evidence.length === 0 ? "" : ` - ${evidence}`}`;
    })
    .join("\n");
  const anchors =
    deprecatedAnchors.length === 0
      ? ""
      : `\n## Deprecated anchors\n\n${deprecatedAnchors.map((id) => `- \`${id}\` preserved for human references`).join("\n")}\n`;
  return `---\nartifactId: ${spec.artifactId}\nrevision: ${spec.revision}\n---\n\n# ${spec.title}\n\n![[${drawing}]]\n\n- SVG: [[${svg}]]\n- Source: \`${spec.source.root}\`\n- Commit: \`${spec.source.commit ?? "uncommitted"}\`\n\n## Evidence status\n\n${claims}${anchors}`;
}
