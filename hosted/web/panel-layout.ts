export type PanelTab = "learn" | "evidence" | "notes";
export type SheetState = "peek" | "half" | "full";

export type PanelLayout = {
  readonly width: number;
  readonly collapsed: boolean;
  readonly tab: PanelTab;
  readonly sheet: SheetState;
};

export const panelWidth = { min: 280, initial: 380, max: 720 } as const;

const storageKey = "visual-atlas:panel-layout";
const tabs: readonly PanelTab[] = ["learn", "evidence", "notes"];
const sheets: readonly SheetState[] = ["peek", "half", "full"];

export const defaultPanelLayout: PanelLayout = {
  width: panelWidth.initial,
  collapsed: false,
  tab: "learn",
  sheet: "peek",
};

// The panel may take at most 60% of the window so the canvas always keeps the larger share.
export function clampPanelWidth(width: number, viewportWidth: number): number {
  const max = Math.max(panelWidth.min, Math.min(panelWidth.max, Math.round(viewportWidth * 0.6)));
  return Math.round(Math.min(Math.max(width, panelWidth.min), max));
}

export function nextSheet(sheet: SheetState): SheetState {
  return sheet === "peek" ? "half" : sheet === "half" ? "full" : "peek";
}

function isTab(value: unknown): value is PanelTab {
  return typeof value === "string" && (tabs as readonly string[]).includes(value);
}

function isSheet(value: unknown): value is SheetState {
  return typeof value === "string" && (sheets as readonly string[]).includes(value);
}

export function readPanelLayout(): PanelLayout {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return defaultPanelLayout;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultPanelLayout;
    const record = parsed as Record<string, unknown>;
    const width = record["width"];
    return {
      width:
        typeof width === "number" && Number.isFinite(width)
          ? clampPanelWidth(width, window.innerWidth)
          : defaultPanelLayout.width,
      collapsed: record["collapsed"] === true,
      tab: isTab(record["tab"]) ? record["tab"] : defaultPanelLayout.tab,
      sheet: isSheet(record["sheet"]) ? record["sheet"] : defaultPanelLayout.sheet,
    };
  } catch {
    return defaultPanelLayout;
  }
}

export function writePanelLayout(layout: PanelLayout): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Storage can be unavailable (private mode, quota); the layout then lasts for this page only.
  }
}
