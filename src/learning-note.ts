import type { VisualNoteSpec } from "./schema";

type Claim = VisualNoteSpec["nodes"][number] | VisualNoteSpec["edges"][number];
type Edge = VisualNoteSpec["edges"][number];

const statusText = {
  fact: "확인된 사실",
  inference: "근거 기반 추론",
  question: "미확인 질문",
} as const satisfies Record<Claim["status"], string>;

const relationText = {
  "runtime-call": "실행 중 호출",
  "data-movement": "데이터 이동",
  "state-transition": "상태 전이",
  "static-reference": "정적 참조",
} as const satisfies Record<NonNullable<Edge["relation"]>, string>;

function firstLine(label: string): string {
  return label.split("\n")[0] ?? label;
}

function claimsById(spec: VisualNoteSpec): ReadonlyMap<string, Claim> {
  return new Map<string, Claim>(
    [...spec.nodes, ...spec.edges].map((claim) => [claim.semanticId, claim]),
  );
}

function routeNumbers(spec: VisualNoteSpec): ReadonlyMap<string, number> {
  return new Map((spec.learning?.route ?? []).map((step, index) => [step.semanticId, index + 1]));
}

function callout(kind: string, title: string, body: readonly string[], folded = false): string {
  return [
    `> [!${kind}]${folded ? "-" : ""} ${title}`,
    ...body.flatMap((line) => line.split("\n")).map((line) => `> ${line}`),
  ].join("\n");
}

export function learningHeader(spec: VisualNoteSpec): string {
  const learning = spec.learning;
  if (learning === undefined) return "";
  return `${callout("question", "이 그림이 답하는 질문", [learning.question, "", `**답:** ${learning.answer}`])}\n\n`;
}

export function textDiagram(spec: VisualNoteSpec): string {
  const numbers = routeNumbers(spec);
  const name = (id: string): string => {
    const node = spec.nodes.find((candidate) => candidate.semanticId === id);
    const label = node === undefined ? id : firstLine(node.label);
    const number = numbers.get(id);
    return number === undefined ? `[${label}]` : `(${number}) [${label}]`;
  };
  const orderedNodes = [
    ...spec.nodes.filter((node) => numbers.has(node.semanticId)),
    ...spec.nodes.filter((node) => !numbers.has(node.semanticId)),
  ].sort(
    (left, right) =>
      (numbers.get(left.semanticId) ?? Number.MAX_SAFE_INTEGER) -
      (numbers.get(right.semanticId) ?? Number.MAX_SAFE_INTEGER),
  );
  const nodeLines = orderedNodes.map(
    (node) => `${name(node.semanticId)}${node.status === "fact" ? "" : ` ?${node.status}`}`,
  );
  const edgeLines = spec.edges.map((edge) => {
    const verb = firstLine(edge.label);
    const relation = edge.relation === undefined ? "" : ` <${edge.relation}>`;
    const marker = edge.status === "fact" ? "--" : "..";
    return `${name(edge.from)} ${marker}${verb}${relation}${marker}> ${name(edge.to)}`;
  });
  return [...nodeLines, "", ...edgeLines].join("\n").trimEnd();
}

function routeSection(spec: VisualNoteSpec): string | null {
  const learning = spec.learning;
  if (learning === undefined || learning.route.length === 0) return null;
  const claims = claimsById(spec);
  const steps = learning.route.map((step, index) => {
    const claim = claims.get(step.semanticId);
    const label = claim === undefined ? step.semanticId : firstLine(claim.label);
    const status = claim === undefined ? "" : ` · ${statusText[claim.status]}`;
    return `${index + 1}. **${label}**${status} — ${step.explanation}`;
  });
  return `## 읽는 순서

그림의 번호를 따라가면 되는 권장 경로다. 필요한 번호부터 바로 읽어도 된다.

${steps.join("\n")}`;
}

function relationLegend(spec: VisualNoteSpec): string | null {
  const used = [...new Set(spec.edges.map((edge) => edge.relation))].filter(
    (relation): relation is NonNullable<Edge["relation"]> => relation !== undefined,
  );
  if (used.length === 0) return null;
  const rows = used.map((relation) => {
    const edges = spec.edges
      .filter((edge) => edge.relation === relation)
      .map((edge) => `\`${firstLine(edge.label)}\``)
      .join(", ");
    return `- **${relationText[relation]}** (\`${relation}\`): ${edges}`;
  });
  return `## 화살표가 뜻하는 것

${rows.join("\n")}
- 실선은 확인된 관계, 점선은 추론이다. 색은 소속(category)만 나타내고 확실성을 나타내지 않는다.`;
}

function glossarySection(spec: VisualNoteSpec): string | null {
  const glossary = spec.learning?.glossary ?? [];
  if (glossary.length === 0) return null;
  return `## 용어

${glossary.map((entry) => `- \`${entry.term}\` — ${entry.meaning}`).join("\n")}`;
}

function scopeSection(spec: VisualNoteSpec): string | null {
  const scope = spec.learning?.scope;
  if (scope === undefined || (scope.covers.length === 0 && scope.omits.length === 0)) return null;
  const covers = scope.covers.map((item) => `- ${item}`).join("\n");
  const omits = scope.omits.map((item) => `- ${item}`).join("\n");
  return `## 이 그림의 범위

${covers.length === 0 ? "" : `**다루는 것**\n\n${covers}\n\n`}${omits.length === 0 ? "" : `**다루지 않는 것** — 여기에 없다고 해서 존재하지 않는다는 뜻은 아니다.\n\n${omits}`}`.trimEnd();
}

function verifySection(spec: VisualNoteSpec): string | null {
  const verify = spec.learning?.verify ?? [];
  if (verify.length === 0) return null;
  const claims = claimsById(spec);
  const numbers = routeNumbers(spec);
  const rows = verify.map((step) => {
    const claim = claims.get(step.semanticId);
    const label = claim === undefined ? step.semanticId : firstLine(claim.label);
    const number = numbers.get(step.semanticId);
    const command = step.command === undefined ? "" : `\n  \`\`\`sh\n  ${step.command}\n  \`\`\``;
    return `- [ ] ${number === undefined ? "" : `(${number}) `}**${label}** — ${step.how}${command}`;
  });
  return `## 직접 확인하는 법

그림을 믿기 전에 확인할 수 있는 지점이다.

${rows.join("\n")}`;
}

function checksSection(spec: VisualNoteSpec): string | null {
  const checks = spec.learning?.checks ?? [];
  if (checks.length === 0) return null;
  return `## 스스로 점검

먼저 답을 떠올린 뒤 펼쳐서 맞춰 본다.

${checks.map((check, index) => callout("example", `Q${index + 1}. ${check.prompt}`, [check.answer], true)).join("\n\n")}`;
}

function analogySection(spec: VisualNoteSpec): string | null {
  const analogies = spec.learning?.analogies ?? [];
  if (analogies.length === 0) return null;
  return `## 비유와 그 한계

${analogies
  .map(
    (entry) =>
      `**${entry.analogy}**\n\n- 맞는 부분: ${entry.holds.join("; ")}\n- 맞지 않는 부분: ${entry.breaks.join("; ")}`,
  )
  .join("\n\n")}`;
}

export function learningSections(spec: VisualNoteSpec): string {
  if (spec.learning === undefined) return "";
  const sections = [
    routeSection(spec),
    `## 텍스트 도식\n\n\`\`\`text\n${textDiagram(spec)}\n\`\`\``,
    relationLegend(spec),
    glossarySection(spec),
    scopeSection(spec),
    verifySection(spec),
    checksSection(spec),
    analogySection(spec),
  ].filter((section): section is string => section !== null);
  return `${sections.join("\n\n")}\n\n`;
}

export function learningIndexLines(spec: VisualNoteSpec): string {
  const learning = spec.learning;
  if (learning === undefined) return "";
  return `**질문:** ${learning.question}\n\n**답:** ${learning.answer}\n\n`;
}
