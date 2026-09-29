// Splits prose on single-backtick code spans (`like this`) so panels can render them as <code>.
// Deliberately not Markdown: no other syntax is recognized, and an unpaired backtick stays literal.
export type InlineSegment = {
  readonly code: boolean;
  readonly text: string;
  readonly start: number;
};

const codeSpan = /`([^`\n]+)`/g;

export function splitInlineCode(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(codeSpan)) {
    if (match.index > last)
      segments.push({ code: false, text: text.slice(last, match.index), start: last });
    segments.push({ code: true, text: match[1] ?? "", start: match.index });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ code: false, text: text.slice(last), start: last });
  return segments;
}
