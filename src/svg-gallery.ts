import { planScene } from "./renderer-plan";
import type { GeneratedView } from "./template-generate";
import type { ClaimStyle } from "./template-style";

const CARD_PADDING = 32;
const COLUMN_GAP = 40;
const ROW_GAP = 40;
const CAPTION_HEIGHT = 92;
const COLUMNS = 2;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textLines(text: string, x: number, fontSize: number, fill: string): string {
  return text
    .split("\n")
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : fontSize + 4}" fill="${fill}">${escapeXml(line)}</tspan>`,
    )
    .join("");
}

function styleMap(styles: readonly ClaimStyle[]): ReadonlyMap<string, ClaimStyle> {
  return new Map(styles.map((style) => [style.semanticId, style]));
}

function sceneSize(view: GeneratedView): { readonly width: number; readonly height: number } {
  const plan = planScene(view.spec);
  return {
    width: Math.max(...plan.elements.map((element) => element.x + element.width), 0) + CARD_PADDING,
    height:
      Math.max(...plan.elements.map((element) => element.y + element.height), 0) + CARD_PADDING,
  };
}

function renderCard(view: GeneratedView, originX: number, originY: number): string {
  const plan = planScene(view.spec);
  const styles = styleMap(view.styles);
  const size = sceneSize(view);
  const pieces = [
    `<rect x="${originX}" y="${originY}" width="${size.width + CARD_PADDING}" height="${size.height + CAPTION_HEIGHT}" rx="24" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>`,
    `<text x="${originX + 24}" y="${originY + 34}" font-family="Helvetica" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(view.title)}</text>`,
    `<text x="${originX + 24}" y="${originY + 62}" font-family="Helvetica" font-size="12" fill="#475569">${escapeXml(`${view.kind} | related: ${view.relatedViewIds.join(", ") || "none"}`)}</text>`,
  ];
  for (const element of plan.elements) {
    const style = styles.get(element.semanticId) ?? {
      fill: "#ffffff",
      stroke: "#334155",
      text: "#0f172a",
      dashArray: null,
      badge: "TITLE",
    };
    const x = originX + element.x;
    const y = originY + CAPTION_HEIGHT + element.y;
    if (element.type === "rectangle") {
      pieces.push(
        `<rect x="${x}" y="${y}" width="${element.width}" height="${element.height}" rx="16" fill="${style.fill}" stroke="${style.stroke}" stroke-width="3"${style.dashArray === null ? "" : ` stroke-dasharray="${style.dashArray}"`}/>`,
      );
      pieces.push(
        `<text x="${x + 14}" y="${y + 18}" font-family="Helvetica" font-size="10" font-weight="700" fill="${style.stroke}">${escapeXml(style.badge)}</text>`,
      );
      continue;
    }
    if (element.type === "arrow") {
      const end = element.points[1];
      if (end === undefined) throw new TypeError(`missing arrow endpoint for ${element.id}`);
      pieces.push(
        `<line x1="${x}" y1="${y}" x2="${x + end[0]}" y2="${y + end[1]}" stroke="${style.stroke}" stroke-width="3" marker-end="url(#arrow)"${style.dashArray === null ? "" : ` stroke-dasharray="${style.dashArray}"`}/>`,
      );
      continue;
    }
    if (element.text === null) continue;
    pieces.push(
      `<text x="${x}" y="${y}" font-family="Helvetica" font-size="16" fill="${style.text}">${textLines(element.text, x, 16, style.text)}</text>`,
    );
  }
  return pieces.join("");
}

export function renderGallerySvg(views: readonly GeneratedView[]): {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
} {
  const sizes = views.map((view) => sceneSize(view));
  const columnWidths = new Array<number>(COLUMNS).fill(0);
  const rowHeights: number[] = [];
  for (let index = 0; index < sizes.length; index += 1) {
    const size = sizes[index];
    if (size === undefined) throw new TypeError("gallery size is missing");
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, size.width + CARD_PADDING);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height + CAPTION_HEIGHT);
  }
  const width = columnWidths.reduce((sum, value) => sum + value, CARD_PADDING) + COLUMN_GAP;
  const height =
    rowHeights.reduce((sum, value) => sum + value, CARD_PADDING) + ROW_GAP * rowHeights.length;
  const cards = views
    .map((view, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const x =
        CARD_PADDING +
        columnWidths.slice(0, column).reduce((sum, value) => sum + value, 0) +
        column * COLUMN_GAP;
      const y =
        CARD_PADDING +
        rowHeights.slice(0, row).reduce((sum, value) => sum + value, 0) +
        row * ROW_GAP;
      return renderCard(view, x, y);
    })
    .join("");
  return {
    width,
    height,
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto-start-reverse">
      <path d="M 0 0 L 12 6 L 0 12 z" fill="#334155" />
    </marker>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" />
  ${cards}
</svg>`,
  };
}
