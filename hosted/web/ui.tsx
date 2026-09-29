import type { MouseEvent, ReactNode } from "react";
import type { ClaimStatus, Evidence } from "./api";
import { navigate } from "./router";

export function shortTime(iso: string | null): string {
  if (iso === null || iso.length === 0) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ko-KR", { hour12: false });
}

export function firstLine(text: string): string {
  return text.split("\n")[0] ?? text;
}

export const statusText: Record<ClaimStatus, string> = {
  fact: "확인된 사실",
  inference: "근거 기반 추론",
  question: "미확인 질문",
};

export function evidenceText(evidence: Evidence): string {
  const lines =
    evidence.lineStart === undefined
      ? ""
      : evidence.lineEnd === undefined || evidence.lineEnd === evidence.lineStart
        ? `:${evidence.lineStart}`
        : `:${evidence.lineStart}-${evidence.lineEnd}`;
  return `${evidence.path}${lines}${evidence.symbol === undefined ? "" : `#${evidence.symbol}`}`;
}

export function Link({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
