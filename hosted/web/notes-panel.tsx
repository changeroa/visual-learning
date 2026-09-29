import { useRef, useState } from "react";
import { api, errorText, type Note, type NoteConflict, noteConflictOf, type Spec } from "./api";
import { useAnnounce } from "./app-events";
import { firstLine, shortTime } from "./ui";

export const figureNoteKey = "_figure";

// An unsaved note body and the note token it was typed against (null: no server note yet).
export type NoteDraft = { body: string; baseToken: string | null; savedAt: string };
export type NoteDrafts = Readonly<Record<string, NoteDraft>>;
export type OnNoteDraft = (nodeKey: string, draft: NoteDraft | null) => void;

function noteDraftPrefix(project: string, artifact: string): string {
  return `visual-atlas:note-draft:${project}:${artifact}:`;
}

export function readNoteDrafts(project: string, artifact: string): Record<string, NoteDraft> {
  const prefix = noteDraftPrefix(project, artifact);
  const drafts: Record<string, NoteDraft> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key === null || !key.startsWith(prefix)) continue;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "") as Partial<NoteDraft>;
      if (typeof parsed.body !== "string") continue;
      drafts[key.slice(prefix.length)] = {
        body: parsed.body,
        baseToken: typeof parsed.baseToken === "string" ? parsed.baseToken : null,
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      };
    } catch {
      // An unparsable entry is not a draft; leave it for the user's storage tools.
    }
  }
  return drafts;
}

export function writeNoteDraft(
  project: string,
  artifact: string,
  nodeKey: string,
  draft: NoteDraft | null,
): void {
  const key = `${noteDraftPrefix(project, artifact)}${nodeKey}`;
  if (draft === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(draft));
}

function NoteEditor({
  project,
  artifact,
  nodeKey,
  title,
  note,
  draft,
  onDraft,
  onSaved,
}: {
  project: string;
  artifact: string;
  nodeKey: string;
  title: string;
  note: Note | undefined;
  draft: NoteDraft | undefined;
  onDraft: OnNoteDraft;
  onSaved: (note: Note) => void;
}) {
  const [body, setBody] = useState(draft?.body ?? note?.body ?? "");
  const [token, setToken] = useState<string | null>(
    draft === undefined ? (note?.token ?? null) : draft.baseToken,
  );
  const [savedBody, setSavedBody] = useState(note?.body ?? "");
  const [conflict, setConflict] = useState<{ current: NoteConflict } | null>(null);
  const [status, setStatus] = useState<string>(
    draft !== undefined ? "수정됨" : note === undefined ? "새 메모" : "저장됨",
  );
  const [busy, setBusy] = useState(false);
  const announce = useAnnounce();
  const bodyRef = useRef(body);
  bodyRef.current = body;

  const edit = (value: string, base: string, baseToken: string | null) => {
    setBody(value);
    onDraft(
      nodeKey,
      value === base ? null : { body: value, baseToken, savedAt: new Date().toISOString() },
    );
  };

  const send = async (expectedToken: string | null) => {
    const sent = body;
    setBusy(true);
    setStatus("저장 중…");
    try {
      const result = await api.saveNote(project, artifact, nodeKey, expectedToken, sent);
      setToken(result.token);
      setSavedBody(sent);
      setConflict(null);
      setStatus("저장됨");
      // Text typed while the request was in flight stays a draft against the new token.
      edit(bodyRef.current, sent, result.token);
      onSaved({
        nodeKey,
        body,
        token: result.token,
        orphaned: false,
        updatedAt: new Date().toISOString(),
      });
      announce("note-saved", { nodeKey, token: result.token });
    } catch (error) {
      const found = noteConflictOf(error);
      if (found === null) {
        setStatus(`저장 실패: ${errorText(error)}`);
        announce("note-failed", { nodeKey, error: errorText(error) });
      } else {
        setConflict(found);
        setStatus("다른 곳에서 변경됨");
        announce("note-conflict", { nodeKey, token: found.current?.token ?? null });
      }
    } finally {
      setBusy(false);
    }
  };

  const takeServer = () => {
    if (conflict === null) return;
    const serverBody = conflict.current?.body ?? "";
    edit(serverBody, serverBody, conflict.current?.token ?? null);
    setSavedBody(serverBody);
    setToken(conflict.current?.token ?? null);
    setConflict(null);
    setStatus("서버 버전으로 교체함");
  };

  return (
    <section className="note-editor" data-testid={`note-${nodeKey}`} data-note-key={nodeKey}>
      <h3>{title}</h3>
      <textarea
        aria-label={`${title} 본문`}
        value={body}
        rows={6}
        onChange={(event) => {
          edit(event.target.value, savedBody, token);
          if (conflict === null) setStatus(event.target.value === savedBody ? "저장됨" : "수정됨");
        }}
      />
      <div className="row">
        <button
          type="button"
          disabled={busy || conflict !== null}
          onClick={() => void send(token)}
          data-testid={`note-save-${nodeKey}`}
        >
          메모 저장
        </button>
        <span className="muted" data-testid={`note-status-${nodeKey}`}>
          {status}
          {token === null ? "" : ` · ${token}`}
        </span>
        {draft !== undefined && (
          <span className="unsaved" data-testid={`note-unsaved-${nodeKey}`}>
            저장 안 됨
          </span>
        )}
      </div>
      {conflict !== null && (
        <div className="note-conflict" role="alert" data-testid={`note-conflict-${nodeKey}`}>
          <p>
            <strong>다른 곳에서 변경됨</strong> — 서버에 더 새로운 메모가 있습니다
            {conflict.current === null ? " (서버에는 메모가 없음)" : ` (${conflict.current.token})`}
            .
          </p>
          <div className="compare">
            <div>
              <h4>서버 버전</h4>
              <pre>{conflict.current?.body ?? ""}</pre>
            </div>
            <div>
              <h4>내 버전</h4>
              <pre>{body}</pre>
            </div>
          </div>
          <div className="row">
            <button type="button" className="secondary" onClick={takeServer} disabled={busy}>
              서버 버전으로 교체
            </button>
            <button
              type="button"
              onClick={() => void send(conflict.current?.token ?? null)}
              disabled={busy}
            >
              내 버전으로 덮어쓰기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function NotesPanel({
  project,
  artifact,
  spec,
  notes,
  selected,
  drafts,
  onDraft,
  onSaved,
}: {
  project: string;
  artifact: string;
  spec: Spec;
  notes: Note[];
  selected: string | null;
  drafts: NoteDrafts;
  onDraft: OnNoteDraft;
  onSaved: (note: Note) => void;
}) {
  const byKey = new Map(notes.map((note) => [note.nodeKey, note]));
  const claim = [...spec.nodes, ...spec.edges].find((item) => item.semanticId === selected);
  const orphaned = notes.filter((note) => note.orphaned);
  return (
    <div className="notes-panel" data-testid="notes-panel">
      <NoteEditor
        key={figureNoteKey}
        project={project}
        artifact={artifact}
        nodeKey={figureNoteKey}
        title="그림 메모"
        note={byKey.get(figureNoteKey)}
        draft={drafts[figureNoteKey]}
        onDraft={onDraft}
        onSaved={onSaved}
      />
      {selected === null || claim === undefined ? (
        <p className="muted">
          그림에서 노드를 누르거나 학습 탭의 읽는 순서를 누르면 그 노드의 메모를 쓸 수 있습니다.
        </p>
      ) : (
        <NoteEditor
          key={selected}
          project={project}
          artifact={artifact}
          nodeKey={selected}
          title={`노드 메모: ${firstLine(claim.label)} (${selected})`}
          note={byKey.get(selected)}
          draft={drafts[selected]}
          onDraft={onDraft}
          onSaved={onSaved}
        />
      )}
      <section data-testid="orphaned-notes">
        <h3>사라진 노드의 메모</h3>
        {orphaned.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          <ul className="orphaned">
            {orphaned.map((note) => (
              <li key={note.nodeKey} data-note-key={note.nodeKey}>
                <code>{note.nodeKey}</code> · {shortTime(note.updatedAt)}
                <pre>{note.body}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
