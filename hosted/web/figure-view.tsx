// Excalidraw's stylesheet is copied to /excalidraw.css by build:web (not bundled) so its
// @font-face rules keep loading /fonts/* files instead of being inlined as data: URLs.
import {
  CaptureUpdateAction,
  Excalidraw,
  getCommonBounds,
  hashElementsVersion,
  restoreElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import {
  type CSSProperties,
  type PointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  errorText,
  type Figure,
  type Note,
  type SceneConflict,
  type SceneElement,
  sceneConflictOf,
} from "./api";
import { useAnnounce } from "./app-events";
import { Icon, type IconName } from "./icons";
import { type NoteDraft, NotesPanel, readNoteDrafts, writeNoteDraft } from "./notes-panel";
import {
  clampPanelWidth,
  nextSheet,
  type PanelLayout,
  type PanelTab,
  panelWidth,
  readPanelLayout,
  writePanelLayout,
} from "./panel-layout";
import { EvidencePanel, LearningPanel } from "./panels";
import { clearDraft, type Draft, readDraft, writeDraft } from "./scene-draft";
import { baseStamps, mergeThreeWay } from "./scene-merge";
import { shortTime } from "./ui";

type EditorWindow = Window & { visualAtlasEditor?: ExcalidrawImperativeAPI };
const tabs: readonly { id: PanelTab; label: string; icon: IconName }[] = [
  { id: "learn", label: "학습", icon: "learn" },
  { id: "evidence", label: "근거", icon: "evidence" },
  { id: "notes", label: "메모", icon: "notes" },
];

const sheetLabels = { peek: "패널 펼치기", half: "패널 크게", full: "패널 내리기" } as const;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? "⌘" : "Ctrl";

function toPlain(elements: readonly ExcalidrawElement[]): SceneElement[] {
  return JSON.parse(JSON.stringify(elements)) as SceneElement[];
}

function toExcalidraw(elements: readonly SceneElement[]): ExcalidrawElement[] {
  return restoreElements(elements as unknown as ExcalidrawElement[], null);
}

function semanticIdOf(element: ExcalidrawElement): string | null {
  const id: unknown = element.customData?.["semanticId"];
  return typeof id === "string" ? id : null;
}

// IS-2: node labels must paint at >= 12 CSS px. Excalidraw draws text at fontSize x zoom CSS px,
// so the initial zoom never drops below 12 / (smallest node-label fontSize); pan covers the rest.
const minLabelPx = 12;
const viewportPad = 24;
// Keeps the figure's first row clear of Excalidraw's top-left menu island (desktop layout).
const menuReserve = 64;
const minZoom = 0.1;
const maxZoom = 30;
type ZoomValue = AppState["zoom"]["value"];
type Viewport = { zoom: { value: ZoomValue }; scrollX: number; scrollY: number };

function readableZoom(elements: readonly ExcalidrawElement[]): number {
  const texts = elements.flatMap((element) => (element.type === "text" ? [element] : []));
  const labels = texts.filter((text) => text.customData?.["elementRole"] === "node-label");
  const sizes = (labels.length > 0 ? labels : texts).map((text) => text.fontSize);
  return sizes.length === 0 ? 0 : minLabelPx / Math.min(...sizes);
}

// Fit to the pane width, never below the readable zoom and never above 100%; center what fits,
// otherwise start at the figure's top-left so the reader pans right/down.
function initialViewport(
  elements: readonly ExcalidrawElement[],
  width: number,
  height: number,
  compact: boolean,
): Viewport {
  const [minX, minY, maxX, maxY] = getCommonBounds(elements);
  const contentWidth = Math.max(maxX - minX, 1);
  const contentHeight = Math.max(maxY - minY, 1);
  const fitWidth = (width - 2 * viewportPad) / contentWidth;
  const zoom = Math.min(maxZoom, Math.max(readableZoom(elements), Math.min(fitWidth, 1), minZoom));
  const top = compact ? viewportPad : menuReserve;
  const usableHeight = height - top - viewportPad;
  const scrollX =
    contentWidth * zoom <= width - 2 * viewportPad
      ? width / 2 / zoom - (minX + maxX) / 2
      : viewportPad / zoom - minX;
  const scrollY =
    contentHeight * zoom <= usableHeight
      ? (top + usableHeight / 2) / zoom - (minY + maxY) / 2
      : top / zoom - minY;
  return { zoom: { value: zoom as ZoomValue }, scrollX, scrollY };
}

// "전체 보기": the whole figure inside the pane and centered, even below the readable zoom (the
// reader chose an overview); never above 100%.
function fitAllViewport(
  elements: readonly ExcalidrawElement[],
  width: number,
  height: number,
  compact: boolean,
): Viewport {
  const [minX, minY, maxX, maxY] = getCommonBounds(elements);
  const top = compact ? viewportPad : menuReserve;
  const usableHeight = height - top - viewportPad;
  const fit = Math.min(
    (width - 2 * viewportPad) / Math.max(maxX - minX, 1),
    usableHeight / Math.max(maxY - minY, 1),
  );
  const zoom = Math.min(1, Math.max(minZoom, fit));
  return {
    zoom: { value: zoom as ZoomValue },
    scrollX: width / 2 / zoom - (minX + maxX) / 2,
    scrollY: (top + usableHeight / 2) / zoom - (minY + maxY) / 2,
  };
}

// Zooms around the canvas center, like Excalidraw's own +/- buttons.
function zoomedViewport(appState: AppState, factor: number): Viewport {
  const current = appState.zoom.value;
  const next = Math.min(maxZoom, Math.max(minZoom, current * factor));
  const centerX = appState.width / 2 / current - appState.scrollX;
  const centerY = appState.height / 2 / current - appState.scrollY;
  return {
    zoom: { value: next as ZoomValue },
    scrollX: appState.width / 2 / next - centerX,
    scrollY: appState.height / 2 / next - centerY,
  };
}

// Matches the styles.css breakpoint that stacks the panes and hides Excalidraw's view-mode chrome.
const compactQuery = "(max-width: 900px)";

function isCompact(): boolean {
  return window.matchMedia(compactQuery).matches;
}

function useCompact(): boolean {
  const [compact, setCompact] = useState(isCompact);
  useEffect(() => {
    const query = window.matchMedia(compactQuery);
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "INPUT")
  );
}

export function FigureView({ project, artifact }: { project: string; artifact: string }) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<{ figure: Figure | null; error: string | null }>({
    figure: null,
    error: null,
  });
  const announce = useAnnounce();
  // biome-ignore lint/correctness/useExhaustiveDependencies: generation forces a fresh load
  useEffect(() => {
    let alive = true;
    setState({ figure: null, error: null });
    api.figure(project, artifact).then(
      (figure) => alive && setState({ figure, error: null }),
      (error: unknown) => {
        if (!alive) return;
        setState({ figure: null, error: errorText(error) });
        announce("load-failed", { key: `figure:${project}/${artifact}`, error: errorText(error) });
      },
    );
    return () => {
      alive = false;
    };
  }, [project, artifact, generation]);
  if (state.figure === null)
    return (
      <main className="page">
        {state.error === null ? (
          <p className="muted">그림을 불러오는 중…</p>
        ) : (
          <p className="error" role="alert">
            그림을 불러오지 못했습니다: {state.error}
          </p>
        )}
      </main>
    );
  return (
    <Workspace
      key={`${state.figure.token}:${generation}`}
      figure={state.figure}
      project={project}
      artifact={artifact}
      onReload={() => setGeneration((value) => value + 1)}
    />
  );
}

function Workspace({
  figure,
  project,
  artifact,
  onReload,
}: {
  figure: Figure;
  project: string;
  artifact: string;
  onReload: () => void;
}) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const tokenRef = useRef(figure.token);
  // The server scene at tokenRef: the three-way merge base after a 409.
  const baseRef = useRef<readonly SceneElement[]>(figure.scene.elements);
  const editingRef = useRef(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const baselineRef = useRef<number | null>(null);
  const fittedRef = useRef(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [token, setToken] = useState(figure.token);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<SceneConflict | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(() =>
    readDraft(project, artifact),
  );
  const announce = useAnnounce();
  const pendingRef = useRef(pendingDraft !== null);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const compact = useCompact();
  const [layout, setLayout] = useState<PanelLayout>(readPanelLayout);
  const [focusMode, setFocusMode] = useState(false);
  const tab = layout.tab;
  const panelOpen = compact ? layout.sheet !== "peek" : !layout.collapsed;
  const [notes, setNotes] = useState<Note[]>(figure.notes);
  const noteCount = notes.filter((note) => !note.orphaned && note.body.trim().length > 0).length;
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>(() =>
    readNoteDrafts(project, artifact),
  );
  const claimIds = useMemo(
    () => new Set([...figure.spec.nodes, ...figure.spec.edges].map((claim) => claim.semanticId)),
    [figure.spec],
  );
  const initialData = useMemo<ExcalidrawInitialDataState>(
    () => ({
      elements: figure.scene.elements as unknown as ExcalidrawElement[],
      appState: {
        viewBackgroundColor:
          typeof figure.scene.appState?.["viewBackgroundColor"] === "string"
            ? figure.scene.appState["viewBackgroundColor"]
            : "#ffffff",
      },
      files: (figure.scene.files ?? {}) as BinaryFiles,
    }),
    [figure.scene],
  );

  const setDirty = (value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  };

  const setCurrentToken = (value: string) => {
    tokenRef.current = value;
    setToken(value);
  };

  const onApi = useCallback((excalidraw: ExcalidrawImperativeAPI) => {
    apiRef.current = excalidraw;
    (window as EditorWindow).visualAtlasEditor = excalidraw;
  }, []);

  useEffect(
    () => () => {
      const editorWindow = window as EditorWindow;
      if (editorWindow.visualAtlasEditor === apiRef.current) delete editorWindow.visualAtlasEditor;
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refs carry the mutable editor state
  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState) => {
      const excalidraw = apiRef.current;
      const host = hostRef.current;
      // Place the figure once Excalidraw has measured the real pane size (it starts from the
      // window size).
      if (
        excalidraw !== null &&
        host !== null &&
        !fittedRef.current &&
        elements.length > 0 &&
        Math.abs(appState.width - host.clientWidth) < 2 &&
        Math.abs(appState.height - host.clientHeight) < 2
      ) {
        fittedRef.current = true;
        const viewport = initialViewport(elements, appState.width, appState.height, isCompact());
        queueMicrotask(() => {
          excalidraw.updateScene({ appState: viewport, captureUpdate: CaptureUpdateAction.NEVER });
          setViewportReady(true);
          announce("ready", { project, artifact, token: tokenRef.current });
        });
      }
      setZoomPercent(Math.round(appState.zoom.value * 100));
      const selectedIds = appState.selectedElementIds;
      const hit = elements.find((element) => {
        const id = semanticIdOf(element);
        return selectedIds[element.id] === true && id !== null && claimIds.has(id);
      });
      if (hit !== undefined) setSelected(semanticIdOf(hit));
      const hash = hashElementsVersion(elements);
      if (baselineRef.current === null) {
        baselineRef.current = hash;
        return;
      }
      if (!editingRef.current || pendingRef.current || hash === baselineRef.current) return;
      writeDraft(project, artifact, {
        baseToken: tokenRef.current,
        base: baseStamps(baseRef.current),
        elements: toPlain(elements.filter((element) => !element.isDeleted)),
        savedAt: new Date().toISOString(),
      });
      if (!dirtyRef.current) {
        setDirty(true);
        announce("dirty");
      }
    },
    [claimIds, project, artifact],
  );

  const save = async (force: boolean) => {
    const excalidraw = apiRef.current;
    if (excalidraw === null || savingRef.current) return;
    if (!force && !dirtyRef.current) {
      setMessage("저장할 변경이 없습니다");
      return;
    }
    const everything = excalidraw.getSceneElementsIncludingDeleted();
    const elements = toPlain(excalidraw.getSceneElements());
    writeDraft(project, artifact, {
      baseToken: tokenRef.current,
      base: baseStamps(baseRef.current),
      elements,
      savedAt: new Date().toISOString(),
    });
    savingRef.current = true;
    setSaving(true);
    setMessage("저장 중…");
    try {
      const result = await api.saveScene(project, artifact, tokenRef.current, {
        ...figure.scene,
        elements,
        files: excalidraw.getFiles() as unknown as Record<string, unknown>,
      });
      setCurrentToken(result.token);
      baseRef.current = elements;
      clearDraft(project, artifact);
      baselineRef.current = hashElementsVersion(everything);
      setDirty(false);
      setConflict(null);
      setMessage(`저장됨 (${result.token})`);
      announce("saved", { token: result.token });
    } catch (error) {
      const current = sceneConflictOf(error);
      if (current === null) {
        setMessage(`저장 실패: ${errorText(error)}`);
        announce("save-failed", { error: errorText(error) });
      } else {
        setConflict(current);
        setMessage("다른 곳에서 변경됨 — 내 그림은 이 브라우저에 초안으로 남아 있습니다");
        announce("conflict", { token: current.token });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      event.stopPropagation();
      void saveRef.current(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  useEffect(() => writePanelLayout(layout), [layout]);

  useEffect(() => {
    document.body.classList.toggle("focus-mode", focusMode);
    return () => document.body.classList.remove("focus-mode");
  }, [focusMode]);

  // Excalidraw sizes its canvas from its container; resizing or collapsing the dock must re-measure.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const observer = new ResizeObserver(() => apiRef.current?.refresh());
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const togglePanel = useCallback(
    () =>
      setLayout((current) =>
        isCompact()
          ? { ...current, sheet: current.sheet === "peek" ? "half" : "peek" }
          : { ...current, collapsed: !current.collapsed },
      ),
    [],
  );

  const chooseTab = (id: PanelTab) =>
    setLayout((current) =>
      isCompact()
        ? { ...current, tab: id, sheet: current.sheet === "peek" ? "half" : current.sheet }
        : { ...current, tab: id, collapsed: false },
    );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.code !== "Backslash") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) setFocusMode((current) => !current);
      else togglePanel();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [togglePanel]);

  const resizeTo = (width: number) =>
    setLayout((current) => ({ ...current, width: clampPanelWidth(width, window.innerWidth) }));

  const onResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = layout.width;
    const move = (moveEvent: globalThis.PointerEvent) =>
      resizeTo(startWidth + (startX - moveEvent.clientX));
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const resizeBy = (delta: number) =>
    setLayout((current) => ({
      ...current,
      width: clampPanelWidth(current.width + delta, window.innerWidth),
    }));

  const onResizeKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 96 : 24;
    if (event.key === "Enter") {
      event.preventDefault();
      togglePanel();
      return;
    }
    if (event.key === "ArrowLeft") resizeBy(step);
    else if (event.key === "ArrowRight") resizeBy(-step);
    else if (event.key === "Home") resizeTo(panelWidth.min);
    else if (event.key === "End") resizeTo(panelWidth.max);
    else return;
    event.preventDefault();
  };

  const enterEditing = () => {
    const excalidraw = apiRef.current;
    if (excalidraw !== null)
      baselineRef.current = hashElementsVersion(excalidraw.getSceneElementsIncludingDeleted());
    editingRef.current = true;
    setEditing(true);
  };

  const toggleEditing = () => {
    if (editingRef.current) {
      editingRef.current = false;
      setEditing(false);
    } else enterEditing();
  };

  const merge = async () => {
    const excalidraw = apiRef.current;
    if (excalidraw === null || conflict === null) return;
    const merged = mergeThreeWay(
      baseRef.current,
      conflict.scene.elements,
      toPlain(excalidraw.getSceneElementsIncludingDeleted()),
    );
    setCurrentToken(conflict.token);
    baseRef.current = conflict.scene.elements;
    excalidraw.updateScene({
      elements: toExcalidraw(merged),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    await save(true);
  };

  const discardAndReload = () => {
    clearDraft(project, artifact);
    onReload();
  };

  const restoreDraft = () => {
    const excalidraw = apiRef.current;
    if (excalidraw === null || pendingDraft === null) return;
    pendingRef.current = false;
    setCurrentToken(pendingDraft.baseToken);
    baseRef.current = pendingDraft.base;
    enterEditing();
    excalidraw.updateScene({
      elements: toExcalidraw(pendingDraft.elements),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setPendingDraft(null);
    setDirty(true);
    setMessage(`초안을 불러왔습니다 (기준 ${pendingDraft.baseToken}). 저장하면 서버와 비교합니다.`);
    announce("draft-restored", { baseToken: pendingDraft.baseToken });
  };

  const discardDraft = () => {
    clearDraft(project, artifact);
    pendingRef.current = false;
    setPendingDraft(null);
    setMessage("초안을 버렸습니다");
  };

  const selectSemantic = (semanticId: string) => {
    setSelected(semanticId);
    const excalidraw = apiRef.current;
    if (excalidraw === null) return;
    const targets = excalidraw
      .getSceneElements()
      .filter((element) => semanticIdOf(element) === semanticId);
    if (targets.length === 0) return;
    const selectedElementIds: Record<string, true> = {};
    for (const element of targets) selectedElementIds[element.id] = true;
    excalidraw.updateScene({
      appState: { selectedElementIds },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    excalidraw.scrollToContent(targets, { fitToContent: false, animate: true });
  };

  const zoomBy = (factor: number) => {
    const excalidraw = apiRef.current;
    if (excalidraw === null) return;
    excalidraw.updateScene({
      appState: zoomedViewport(excalidraw.getAppState(), factor),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    announce("viewport", { mode: "zoom" });
  };

  const placeViewport = (place: typeof initialViewport, mode: "reset" | "fit") => {
    const excalidraw = apiRef.current;
    if (excalidraw === null) return;
    const { width, height } = excalidraw.getAppState();
    excalidraw.updateScene({
      appState: place(excalidraw.getSceneElements(), width, height, isCompact()),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    announce("viewport", { mode });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    const excalidraw = apiRef.current;
    if (start === null || excalidraw === null || editingRef.current) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    const point = viewportCoordsToSceneCoords(
      { clientX: event.clientX, clientY: event.clientY },
      excalidraw.getAppState(),
    );
    let best: string | null = null;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const element of excalidraw.getSceneElements()) {
      const id = semanticIdOf(element);
      if (id === null || !claimIds.has(id) || element.type === "arrow" || element.type === "line")
        continue;
      const inside =
        point.x >= element.x &&
        point.x <= element.x + element.width &&
        point.y >= element.y &&
        point.y <= element.y + element.height;
      const area = element.width * element.height;
      if (inside && area < bestArea) {
        best = id;
        bestArea = area;
      }
    }
    if (best !== null) setSelected(best);
  };

  const onNoteSaved = (note: Note) =>
    setNotes((current) => [...current.filter((item) => item.nodeKey !== note.nodeKey), note]);

  // Note drafts live here (and in localStorage) so a tab or node switch that unmounts the editor
  // brings the unsaved text back.
  const onNoteDraft = (nodeKey: string, draft: NoteDraft | null) => {
    writeNoteDraft(project, artifact, nodeKey, draft);
    setNoteDrafts((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => key !== nodeKey));
      if (draft !== null) next[nodeKey] = draft;
      return next;
    });
  };

  return (
    <main
      className={focusMode ? "split focus" : "split"}
      data-testid="figure-view"
      data-panel={panelOpen ? "open" : "closed"}
      data-sheet={layout.sheet}
      style={{ "--panel-width": `${layout.width}px` } as CSSProperties}
    >
      <section className="canvas-pane" data-testid="canvas-pane">
        <div className="toolbar">
          <strong className="figure-title">{figure.spec.title}</strong>
          <button
            type="button"
            className={editing ? "toggle on" : "toggle"}
            aria-pressed={editing}
            onClick={toggleEditing}
            disabled={pendingDraft !== null}
            data-testid="edit-toggle"
          >
            편집
          </button>
          <button
            type="button"
            onClick={() => void save(false)}
            disabled={saving || !dirty}
            data-testid="save-button"
          >
            저장 (Ctrl/Cmd+S)
          </button>
          <span
            className="muted save-status"
            data-testid="save-status"
            data-token={token}
            data-dirty={dirty ? "true" : "false"}
          >
            {message.length > 0 ? message : dirty ? "저장되지 않은 변경" : `최신 (${token})`}
          </span>
          <fieldset className="zoom-group" aria-label="확대/축소" data-testid="zoom-group">
            <button
              type="button"
              className="secondary zoom-step"
              aria-label="축소"
              onClick={() => zoomBy(1 / 1.25)}
              data-testid="zoom-out"
            >
              −
            </button>
            <span className="zoom-level zoom-step" data-testid="zoom-level">
              {zoomPercent}%
            </span>
            <button
              type="button"
              className="secondary zoom-step"
              aria-label="확대"
              onClick={() => zoomBy(1.25)}
              data-testid="zoom-in"
            >
              +
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => placeViewport(initialViewport, "reset")}
              data-testid="zoom-reset"
            >
              처음 보기
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => placeViewport(fitAllViewport, "fit")}
              data-testid="zoom-fit"
            >
              전체 보기
            </button>
          </fieldset>
          <div className="view-toggles">
            <button
              type="button"
              className="icon-button"
              aria-pressed={panelOpen}
              aria-controls="atlas-side-panel"
              onClick={togglePanel}
              title={`${panelOpen ? "패널 접기" : "패널 펼치기"} (${modKey}+\\)`}
              data-testid="panel-toggle"
            >
              <Icon name={panelOpen ? "panel-close" : "panel-open"} />
              <span className="sr-only">{panelOpen ? "패널 접기" : "패널 펼치기"}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              aria-pressed={focusMode}
              onClick={() => setFocusMode((current) => !current)}
              title={`${focusMode ? "집중 모드 끄기" : "집중 모드"} (${modKey}+Shift+\\)`}
              data-testid="focus-toggle"
            >
              <Icon name={focusMode ? "focus-exit" : "focus-enter"} />
              <span className="sr-only">{focusMode ? "집중 모드 끄기" : "집중 모드"}</span>
            </button>
          </div>
        </div>
        {pendingDraft !== null && (
          <div className="banner" role="alert" data-testid="draft-banner">
            <span>
              이 브라우저에 저장하지 않은 초안이 있습니다 (기준{" "}
              <code>{pendingDraft.baseToken}</code>, {shortTime(pendingDraft.savedAt)}).
            </span>
            <button type="button" onClick={restoreDraft}>
              초안 불러오기
            </button>
            <button type="button" className="secondary" onClick={discardDraft}>
              초안 버리기
            </button>
          </div>
        )}
        {conflict !== null && (
          <div className="banner conflict" role="alert" data-testid="conflict-banner">
            <span>
              <strong>다른 곳에서 변경됨</strong> — 서버에 더 새로운 버전(
              <code>{conflict.token}</code>)이 있습니다. 내 그림은 이 브라우저에 초안으로 보관되어
              있습니다.
            </span>
            <button type="button" onClick={() => void merge()} disabled={saving}>
              최신본에 내 그림 합치기
            </button>
            <button type="button" className="secondary" onClick={discardAndReload}>
              내 변경 버리고 최신본 불러오기
            </button>
          </div>
        )}
        <div
          className={editing ? "excalidraw-host" : "excalidraw-host viewing"}
          data-testid="excalidraw-host"
          data-initial-viewport={viewportReady ? "applied" : "pending"}
          ref={hostRef}
          onPointerDownCapture={onPointerDown}
          onPointerUpCapture={onPointerUp}
        >
          <Excalidraw
            excalidrawAPI={onApi}
            initialData={initialData}
            viewModeEnabled={!editing}
            onChange={onChange}
            langCode="ko-KR"
            UIOptions={{
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false },
            }}
          />
        </div>
      </section>
      {!compact && panelOpen && !focusMode && (
        // biome-ignore lint/a11y/useSemanticElements: a focusable window splitter (WAI-ARIA APG) needs a focusable element; <hr> is not interactive
        <div
          className="resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="패널 너비 조절"
          aria-controls="atlas-side-panel"
          aria-valuemin={panelWidth.min}
          aria-valuemax={panelWidth.max}
          aria-valuenow={layout.width}
          tabIndex={0}
          onPointerDown={onResizeStart}
          onKeyDown={onResizeKey}
          onDoubleClick={() => resizeTo(panelWidth.initial)}
          data-testid="panel-resizer"
        />
      )}
      <div className="dock" data-testid="dock">
        <aside
          className="side-pane"
          id="atlas-side-panel"
          aria-label="학습·근거·메모 패널"
          hidden={!panelOpen}
          data-testid="side-pane"
        >
          <div
            className="tab-body"
            role="tabpanel"
            id="atlas-tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "learn" && (
              <LearningPanel spec={figure.spec} selected={selected} onSelect={selectSemantic} />
            )}
            {tab === "evidence" && <EvidencePanel figure={figure} selected={selected} />}
            {tab === "notes" && (
              <NotesPanel
                project={project}
                artifact={artifact}
                spec={figure.spec}
                notes={notes}
                selected={selected}
                drafts={noteDrafts}
                onDraft={onNoteDraft}
                onSaved={onNoteSaved}
              />
            )}
          </div>
        </aside>
        <div
          className="dock-rail"
          role="tablist"
          aria-label="패널"
          aria-orientation={compact ? "horizontal" : "vertical"}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={panelOpen && tab === item.id}
              aria-controls="atlas-tabpanel"
              className={panelOpen && tab === item.id ? "rail-tab active" : "rail-tab"}
              onClick={() => chooseTab(item.id)}
              title={item.label}
              data-testid={`tab-${item.id}`}
            >
              <Icon name={item.icon} />
              <span className="rail-label">{item.label}</span>
              {item.id === "notes" && noteCount > 0 && (
                <>
                  <span className="rail-badge" aria-hidden="true">
                    {noteCount}
                  </span>
                  <span className="sr-only">메모 {noteCount}개</span>
                </>
              )}
            </button>
          ))}
          <button
            type="button"
            className="rail-toggle"
            onClick={
              compact
                ? () => setLayout((current) => ({ ...current, sheet: nextSheet(current.sheet) }))
                : togglePanel
            }
            aria-label={
              compact ? sheetLabels[layout.sheet] : panelOpen ? "패널 접기" : "패널 펼치기"
            }
            title={
              compact
                ? sheetLabels[layout.sheet]
                : `${panelOpen ? "패널 접기" : "패널 펼치기"} (${modKey}+\\)`
            }
            data-testid="rail-toggle"
          >
            <Icon name={compact ? "sheet" : panelOpen ? "panel-close" : "panel-open"} />
          </button>
        </div>
      </div>
    </main>
  );
}
