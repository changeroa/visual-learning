import { useState } from "react";
import type { Claim, Figure, Spec, VerifyEntry } from "./api";
import { evidenceText, firstLine, shortTime, statusText } from "./ui";

function claimLabel(spec: Spec, semanticId: string): string {
  const claim = [...spec.nodes, ...spec.edges].find((item) => item.semanticId === semanticId);
  return claim === undefined ? semanticId : firstLine(claim.label);
}

function Reveal({ prompt, answer }: { prompt: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="check">
      <p>{prompt}</p>
      {open ? (
        <p className="check-answer">{answer}</p>
      ) : (
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          답 보기
        </button>
      )}
    </li>
  );
}

export function LearningPanel({
  spec,
  selected,
  onSelect,
}: {
  spec: Spec;
  selected: string | null;
  onSelect: (semanticId: string) => void;
}) {
  const learning = spec.learning;
  if (learning === undefined)
    return <p className="muted">이 그림에는 학습 레이어(`spec.learning`)가 없습니다.</p>;
  return (
    <div className="learning" data-testid="learning-panel">
      <section>
        <h3>이 그림이 답하는 질문</h3>
        <p className="question" data-testid="learning-question">
          {learning.question}
        </p>
        <p>
          <strong>답:</strong> {learning.answer}
        </p>
      </section>
      {learning.route.length > 0 && (
        <section>
          <h3>읽는 순서</h3>
          <ol className="route">
            {learning.route.map((step, index) => (
              <li key={step.semanticId}>
                <button
                  type="button"
                  className={`route-step${selected === step.semanticId ? " active" : ""}`}
                  data-semantic-id={step.semanticId}
                  onClick={() => onSelect(step.semanticId)}
                >
                  <span className="route-number">{index + 1}</span>
                  <strong>{claimLabel(spec, step.semanticId)}</strong>{" "}
                  <code>{step.semanticId}</code>
                </button>
                <p>{step.explanation}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {learning.glossary.length > 0 && (
        <section>
          <h3>용어</h3>
          <dl className="glossary">
            {learning.glossary.map((entry) => (
              <div key={entry.term}>
                <dt>
                  <code>{entry.term}</code>
                </dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {learning.scope !== undefined &&
        (learning.scope.covers.length > 0 || learning.scope.omits.length > 0) && (
          <section>
            <h3>이 그림의 범위</h3>
            {learning.scope.covers.length > 0 && (
              <>
                <h4>다루는 것</h4>
                <ul>
                  {learning.scope.covers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
            {learning.scope.omits.length > 0 && (
              <>
                <h4>다루지 않는 것 (여기에 없다고 존재하지 않는다는 뜻은 아닙니다)</h4>
                <ul>
                  {learning.scope.omits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      {learning.checks.length > 0 && (
        <section>
          <h3>스스로 점검</h3>
          <ol className="checks">
            {learning.checks.map((check) => (
              <Reveal key={check.prompt} prompt={check.prompt} answer={check.answer} />
            ))}
          </ol>
        </section>
      )}
      {learning.analogies.length > 0 && (
        <section>
          <h3>비유</h3>
          {learning.analogies.map((analogy) => (
            <div key={analogy.analogy} className="analogy">
              <p>{analogy.analogy}</p>
              <h4>들어맞는 점</h4>
              <ul>
                {analogy.holds.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h4>어긋나는 점</h4>
              <ul>
                {analogy.breaks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ClaimRow({ claim, selected }: { claim: Claim; selected: boolean }) {
  return (
    <li className={`claim${selected ? " active" : ""}`} data-semantic-id={claim.semanticId}>
      <div>
        <strong>{firstLine(claim.label)}</strong> <code>{claim.semanticId}</code>
      </div>
      <div className={`status status-${claim.status}`}>
        {statusText[claim.status]} (<code>{claim.status}</code>)
      </div>
      {claim.evidence.length === 0 ? (
        <p className="muted">근거 없음</p>
      ) : (
        <ul className="evidence">
          {claim.evidence.map((evidence) => (
            <li key={evidenceText(evidence)}>
              <code>{evidenceText(evidence)}</code>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function VerifyRow({ entry, spec }: { entry: VerifyEntry; spec: Spec }) {
  return (
    <li className="verify" data-status={entry.status}>
      <div>
        <strong>{entry.semanticId === null ? "-" : claimLabel(spec, entry.semanticId)}</strong>{" "}
        {entry.semanticId !== null && <code>{entry.semanticId}</code>}
      </div>
      <p>{entry.how}</p>
      {entry.command !== null && (
        <pre className="command">
          <code>{entry.command}</code>
        </pre>
      )}
      {entry.status === "ran" ? (
        <>
          <p className="status status-fact">
            실행됨 (<code>ran</code>) · 종료 코드 <code>{entry.exitCode ?? "없음"}</code> · 커밋{" "}
            <code>{entry.commit?.slice(0, 7) ?? "-"}</code> · 시각 {shortTime(entry.ranAt)}
            {entry.reason !== null && <> · 사유 {entry.reason}</>}
          </p>
          <details>
            <summary>stdout ({entry.stdout.length}자)</summary>
            <pre>{entry.stdout}</pre>
          </details>
          <details>
            <summary>stderr ({entry.stderr.length}자)</summary>
            <pre>{entry.stderr}</pre>
          </details>
        </>
      ) : (
        <p className="status status-question">
          실행 안 함 (<code>not-run</code>) · 사유: {entry.reason ?? "-"}
        </p>
      )}
    </li>
  );
}

export function EvidencePanel({ figure, selected }: { figure: Figure; selected: string | null }) {
  const { spec } = figure;
  return (
    <div className="evidence-panel" data-testid="evidence-panel">
      <section>
        <h3>노드</h3>
        <ul className="claims">
          {spec.nodes.map((claim) => (
            <ClaimRow
              key={claim.semanticId}
              claim={claim}
              selected={selected === claim.semanticId}
            />
          ))}
        </ul>
      </section>
      <section>
        <h3>관계</h3>
        <ul className="claims">
          {spec.edges.map((claim) => (
            <ClaimRow
              key={claim.semanticId}
              claim={claim}
              selected={selected === claim.semanticId}
            />
          ))}
        </ul>
      </section>
      <section>
        <h3>직접 확인하는 법 (발행 시 기록)</h3>
        {figure.verify.length === 0 ? (
          <p className="muted">기록된 검증 단계가 없습니다.</p>
        ) : (
          <ul className="verify-list">
            {figure.verify.map((entry) => (
              <VerifyRow key={entry.index} entry={entry} spec={spec} />
            ))}
          </ul>
        )}
      </section>
      {figure.deprecatedAnchors.length > 0 && (
        <section>
          <h3>사라진 에이전트 요소 (deprecatedAnchor)</h3>
          <ul>
            {figure.deprecatedAnchors.map((id) => (
              <li key={id}>
                <code>{id}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
