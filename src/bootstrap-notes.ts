import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { artifactPaths } from "./artifact-files";
import type { VisualNoteSpec } from "./schema";

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function note(fields: Record<string, string>, title: string, body: string): string {
  return `${frontmatter(fields)}# ${title}\n\n${body.trim()}\n`;
}

function kindLink(project: string, spec: VisualNoteSpec): string {
  return `[[${artifactPaths(project, spec.artifactId).note}|${spec.title}]]`;
}

export function writeProjectNotes(
  vault: string,
  project: string,
  source: { readonly root: string; readonly commit: string | null },
  specs: readonly VisualNoteSpec[],
  restoreArtifactId: string,
): void {
  const commit = source.commit ?? "null";
  const base = join(vault, "Engineering Atlas/10 Projects", project);
  const byKind = new Map(specs.map((spec) => [spec.kind, kindLink(project, spec)]));
  const files = new Map<string, string>([
    [
      "00 Map.md",
      note(
        { atlas_type: "project-home", status: "active", project },
        "Sample Agent Project",
        `- Source: \`${source.root}\`
- Commit: \`${commit}\`
- Legend: [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Visual Legend|Visual Legend]]
- Troubleshooting: [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Troubleshooting|Troubleshooting]]
- Study next: [[Engineering Atlas/10 Projects/${project}/05 Study Notes/What to Study Next|What to Study Next]]

## Artifact kinds
- Project map: ${byKind.get("project-map") ?? "not bootstrapped"}
- System: ${byKind.get("system-architecture") ?? "not bootstrapped"}
- Container: ${byKind.get("container-architecture") ?? "not bootstrapped"}
- Component: ${byKind.get("component-architecture") ?? "not bootstrapped"}
- ADR: ${byKind.get("adr") ?? "not bootstrapped"}
- API: ${byKind.get("api-contract") ?? "not bootstrapped"}
- Workflow: ${byKind.get("workflow") ?? "not bootstrapped"}
- Data flow: ${byKind.get("data-flow") ?? "not bootstrapped"}
- Trust boundary: ${byKind.get("trust-boundary") ?? "not bootstrapped"}
- Code exploration: ${byKind.get("code-exploration") ?? "not bootstrapped"}

## Walkthroughs
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Create Walkthrough|Create]]
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Extend Walkthrough|Extend]]
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Refresh Walkthrough|Refresh]]
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Restore Walkthrough|Restore]]
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Prompt Recipes|Prompt Recipes]]`,
      ),
    ],
    [
      "02 ADR/Decision Tradeoff Map.md",
      note(
        { atlas_type: "study-index", status: "active", project },
        "Decision Tradeoff Map",
        `${byKind.get("adr") ?? "-"}

이 노트는 학습용 ADR 산출물을 가리킵니다.`,
      ),
    ],
    [
      "03 API/Contract Journey.md",
      note(
        { atlas_type: "study-index", status: "active", project },
        "Contract Journey",
        `${byKind.get("api-contract") ?? "-"}

API contract와 endpoint journey를 한 곳에서 시작합니다.`,
      ),
    ],
    [
      "04 Workflows/Sequence Walkthrough.md",
      note(
        { atlas_type: "study-index", status: "active", project },
        "Sequence Walkthrough",
        `${byKind.get("workflow") ?? "-"}

Workflow와 sequence 관찰을 이어서 읽습니다.`,
      ),
    ],
    [
      "05 Study Notes/What to Study Next.md",
      note(
        { atlas_type: "study-note", status: "active", project },
        "What to Study Next",
        `- [ ] ${byKind.get("trust-boundary") ?? "Trust boundary"}에서 권한 경계를 fact로 승격합니다.
- [ ] ${byKind.get("code-exploration") ?? "Code exploration"}에서 \`PaymentGateway\` 실패 경로를 추가로 확인합니다.
- [ ] ${byKind.get("adr") ?? "ADR"}와 저장소 문서의 차이를 질문으로 남깁니다.`,
      ),
    ],
    [
      "05 Study Notes/Prompt Recipes.md",
      note(
        { atlas_type: "study-note", status: "active", project },
        "Prompt Recipes",
        `- 프로젝트 맵: \`$SKILL/bin/visual-note bootstrap --vault "$VAULT" --expected-vault "$VAULT" --project ${project} --source "$SOURCE" --bundle "$SKILL/tests/fixtures/sample-project/bundle.json" --json\`
- 특정 artifact 추가: \`$SKILL/bin/visual-note create --vault "$VAULT" --expected-vault "$VAULT" --project ${project} --spec "$VAULT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-create.json" --json\`
- refresh 전 질문: \`어떤 node를 유지하고 어떤 edge를 deprecatedAnchor 없이 지울 수 있는가?\``,
      ),
    ],
    [
      "05 Study Notes/Create Walkthrough.md",
      note(
        { atlas_type: "study-note", status: "active", project },
        "Create Walkthrough",
        `1. \`$SKILL/bin/visual-note validate --spec "$VAULT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-create.json" --json\`
2. \`$SKILL/bin/visual-note create --vault "$VAULT" --expected-vault "$VAULT" --project ${project} --spec "$VAULT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-create.json" --json\``,
      ),
    ],
    [
      "05 Study Notes/Extend Walkthrough.md",
      note(
        { atlas_type: "study-note", status: "active", project },
        "Extend Walkthrough",
        `\`$SKILL/bin/visual-note extend --spec "$VAULT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-extend.json" --json\``,
      ),
    ],
    [
      "05 Study Notes/Refresh Walkthrough.md",
      note(
        { atlas_type: "study-note", status: "active", project },
        "Refresh Walkthrough",
        `\`$SKILL/bin/visual-note refresh --vault "$VAULT" --expected-vault "$VAULT" --project ${project} --spec "$VAULT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-refresh-v2.json" --expected-token cas-0 --json\``,
      ),
    ],
    [
      "05 Study Notes/Restore Walkthrough.md",
      note(
        { atlas_type: "study-note", status: "active", project },
        "Restore Walkthrough",
        `\`$SKILL/bin/visual-note restore --vault "$VAULT" --expected-vault "$VAULT" --project ${project} --artifact-id ${restoreArtifactId} --revision-token cas-0 --expected-token cas-1 --json\``,
      ),
    ],
    [
      "05 Study Notes/Visual Legend.md",
      note(
        { atlas_type: "study-note", status: "active", project },
        "Visual Legend",
        `- \`fact\`: 파란/초록 계열, repository-relative evidence 필수
- \`inference\`: 주황 점선, 추론임을 유지
- \`question\`: 보라/회색, unknown 허용
- \`owner=agent\`: refresh 대상
- \`owner=human\`: byte-for-byte 보존 대상`,
      ),
    ],
    [
      "05 Study Notes/Troubleshooting.md",
      note(
        { atlas_type: "study-note", status: "active", project },
        "Troubleshooting",
        `- source unavailable: 입력 경로 존재 여부와 읽기 권한을 확인합니다.
- path swap: symlink 또는 ancestor swap이 감지되면 다시 bootstrap 합니다.
- repo dirty: Git source는 clean status에서만 revision을 기록합니다.
- stale token: \`STATE\`의 최신 token을 다시 읽고 retry 합니다.
- wrong vault: \`--vault\` 와 \`--expected-vault\` 를 동일하게 맞춥니다.`,
      ),
    ],
  ]);
  for (const [relativePath, content] of files) {
    const absolutePath = join(base, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
}
