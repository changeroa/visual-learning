import { planScene } from "./renderer-plan";
import type { GeneratedView } from "./template-generate";
import type { ClaimStyle } from "./template-style";

const CARD_PADDING = 32;
const COLUMN_GAP = 40;
const ROW_GAP = 40;
const CAPTION_HEIGHT = 48;
const COLUMNS = 2;

type Palette = { readonly fill: string; readonly stroke: string; readonly text: string };

const CATEGORY_PALETTE = {
  cloudflare: { fill: "#fff4e6", stroke: "#e8590c", text: "#7c2d12" },
  aws: { fill: "#fff9db", stroke: "#f08c00", text: "#78350f" },
  external: { fill: "#f8fafc", stroke: "#64748b", text: "#334155" },
  data: { fill: "#e7f5ff", stroke: "#1971c2", text: "#0c4a6e" },
  runtime: { fill: "#f3f0ff", stroke: "#7950f2", text: "#4c1d95" },
  security: { fill: "#ebfbee", stroke: "#2f9e44", text: "#14532d" },
  risk: { fill: "#fff5f5", stroke: "#e03131", text: "#7f1d1d" },
  neutral: { fill: "#f8fafc", stroke: "#475569", text: "#0f172a" },
} as const satisfies Record<string, Palette>;

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

function paletteFor(category: keyof typeof CATEGORY_PALETTE): Palette {
  return CATEGORY_PALETTE[category];
}

function shapeMarkup(
  type: "rectangle" | "ellipse" | "diamond",
  x: number,
  y: number,
  width: number,
  height: number,
  palette: Palette,
  dashArray: string | null,
  isFrame: boolean,
): string {
  const shared = `fill="${palette.fill}" fill-opacity="${isFrame ? "0.55" : "1"}" stroke="${palette.stroke}" stroke-width="${isFrame ? "2" : "3"}"${dashArray === null ? "" : ` stroke-dasharray="${dashArray}"`} vector-effect="non-scaling-stroke"`;
  if (type === "ellipse")
    return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" ${shared} filter="url(#soft-shadow)"/>`;
  if (type === "diamond") {
    const points = `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`;
    return `<polygon points="${points}" ${shared} stroke-linejoin="round" filter="url(#soft-shadow)"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${isFrame ? "28" : "18"}" ${shared}${isFrame ? "" : ' filter="url(#soft-shadow)"'}/>`;
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
    `<text x="${originX + 24}" y="${originY + 29}" font-family="ui-sans-serif, sans-serif" font-size="12" font-weight="700" fill="#64748b">${escapeXml(`${view.kind} · ${view.viewId}`)}</text>`,
  ];
  for (const element of plan.elements) {
    const style = styles.get(element.semanticId) ?? {
      fill: "#ffffff",
      stroke: "#334155",
      text: "#0f172a",
      dashArray: null,
      badge: "TITLE",
    };
    const palette = paletteFor(element.customData.category);
    const x = originX + element.x;
    const y = originY + CAPTION_HEIGHT + element.y;
    if (["rectangle", "ellipse", "diamond"].includes(element.type)) {
      pieces.push(
        shapeMarkup(
          element.type as "rectangle" | "ellipse" | "diamond",
          x,
          y,
          element.width,
          element.height,
          palette,
          element.customData.status === "inference" ? "10 7" : style.dashArray,
          element.role === "frame-shape",
        ),
      );
      continue;
    }
    if (element.type === "arrow") {
      const end = element.points[1];
      if (end === undefined) throw new TypeError(`missing arrow endpoint for ${element.id}`);
      pieces.push(
        `<line x1="${x}" y1="${y}" x2="${x + end[0]}" y2="${y + end[1]}" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" marker-end="url(#arrow)"${element.customData.status === "inference" ? ' stroke-dasharray="10 7"' : ""}/>`,
      );
      continue;
    }
    if (element.text === null) continue;
    const fontSize =
      element.role === "title"
        ? 30
        : element.role === "frame-label"
          ? 20
          : element.role === "edge-label"
            ? 12
            : 16;
    const fontWeight = ["title", "frame-label", "node-label"].includes(element.role)
      ? "700"
      : "500";
    if (element.role === "edge-label")
      pieces.push(
        `<rect x="${x - 6}" y="${y}" width="${element.width + 12}" height="${element.height}" rx="10" fill="#ffffff" fill-opacity="0.92"/>`,
      );
    const lines = element.text.split("\n").length;
    const lineHeight = fontSize + 4;
    const centered = ["node-label", "edge-label"].includes(element.role);
    const textX = centered ? x + element.width / 2 : x;
    const textY = centered
      ? y + (element.height - lines * lineHeight) / 2 + fontSize
      : y + fontSize;
    pieces.push(
      `<text x="${textX}" y="${textY}" text-anchor="${centered ? "middle" : "start"}" font-family="Virgil, 'Comic Sans MS', ui-rounded, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${palette.text}">${textLines(element.text, textX, fontSize, palette.text)}</text>`,
    );
  }
  return pieces.join("");
}

function svgDocument(width: number, height: number, content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto-start-reverse">
      <path d="M 0 0 L 12 6 L 0 12 z" fill="#334155" />
    </marker>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10" />
    </filter>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" />
  ${content}
</svg>`;
}

export function renderViewSvg(view: GeneratedView): {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
} {
  const size = sceneSize(view);
  const width = size.width + CARD_PADDING * 3;
  const height = size.height + CAPTION_HEIGHT + CARD_PADDING * 3;
  return {
    width,
    height,
    svg: svgDocument(width, height, renderCard(view, CARD_PADDING, CARD_PADDING)),
  };
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
    svg: svgDocument(width, height, cards),
  };
}
