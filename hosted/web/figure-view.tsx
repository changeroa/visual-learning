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
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  errorText,
  type Figure,
  type Note,
  type SceneConflict,
  type SceneElement,
  sceneConflictOf,
} from "./api";
import { NotesPanel } from "./notes-panel";
import { EvidencePanel, LearningPanel } from "./panels";
import { clearDraft, type Draft, mergeOntoLatest, readDraft, writeDraft } from "./scene-merge";
import { shortTime } from "./ui";

type EditorWindow = Window & { visualAtlasEditor?: ExcalidrawImperativeAPI };
type Tab = "learn" | "evidence" | "notes";

const tabs: readonly { id: Tab; label: string }[] = [
  { id: "learn", label: "학습" },
  { id: "evidence", label: "근거" },
  { id: "notes", label: "메모" },
];

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
function isCompact(): boolean {
  return window.matchMedia("(max-width: 900px)").matches;
}

export function FigureView({ project, artifact }: { project: string; artifact: string }) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<{ figure: Figure | null; error: string | null }>({
    figure: null,
    error: null,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: generation forces a fresh load
  useEffect(() => {
    let alive = true;
    setState({ figure: null, error: null });
    api.figure(project, artifact).then(
      (figure) => alive && setState({ figure, error: null }),
      (error: unknown) => alive && setState({ figure: null, error: errorText(error) }),
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
  const pendingRef = useRef(pendingDraft !== null);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [tab, setTab] = useState<Tab>("learn");
  const [notes, setNotes] = useState<Note[]>(figure.notes);
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
        elements: toPlain(elements.filter((element) => !element.isDeleted)),
        savedAt: new Date().toISOString(),
      });
      if (!dirtyRef.current) setDirty(true);
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
      clearDraft(project, artifact);
      baselineRef.current = hashElementsVersion(everything);
      setDirty(false);
      setConflict(null);
      setMessage(`저장됨 (${result.token})`);
    } catch (error) {
      const current = sceneConflictOf(error);
      if (current === null) setMessage(`저장 실패: ${errorText(error)}`);
      else {
        setConflict(current);
        setMessage("다른 곳에서 변경됨 — 내 그림은 이 브라우저에 초안으로 남아 있습니다");
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
    const merged = mergeOntoLatest(conflict.scene.elements, toPlain(excalidraw.getSceneElements()));
    setCurrentToken(conflict.token);
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
    enterEditing();
    excalidraw.updateScene({
      elements: toExcalidraw(pendingDraft.elements),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setPendingDraft(null);
    setDirty(true);
    setMessage(`초안을 불러왔습니다 (기준 ${pendingDraft.baseToken}). 저장하면 서버와 비교합니다.`);
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
  };

  const resetViewport = () => {
    const excalidraw = apiRef.current;
    if (excalidraw === null) return;
    const { width, height } = excalidraw.getAppState();
    excalidraw.updateScene({
      appState: initialViewport(excalidraw.getSceneElements(), width, height, isCompact()),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
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

  return (
    <main className="split" data-testid="figure-view">
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
              className="secondary"
              aria-label="축소"
              onClick={() => zoomBy(1 / 1.25)}
              data-testid="zoom-out"
            >
              −
            </button>
            <span className="zoom-level" data-testid="zoom-level">
              {zoomPercent}%
            </span>
            <button
              type="button"
              className="secondary"
              aria-label="확대"
              onClick={() => zoomBy(1.25)}
              data-testid="zoom-in"
            >
              +
            </button>
            <button
              type="button"
              className="secondary"
              onClick={resetViewport}
              data-testid="zoom-reset"
            >
              처음 보기
            </button>
          </fieldset>
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
      <aside className="side-pane">
        <div className="tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "tab active" : "tab"}
              onClick={() => setTab(item.id)}
              data-testid={`tab-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="tab-body" role="tabpanel">
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
              onSaved={onNoteSaved}
            />
          )}
        </div>
      </aside>
    </main>
  );
}
