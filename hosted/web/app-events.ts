import { useCallback, useEffect, useRef, useState } from "react";

// App moments announced as `visual-atlas:<type>` window CustomEvents. Automation (the hosted-ui QA
// harness) subscribes to these instead of polling the DOM.
export type AppEventType =
  | "loaded"
  | "load-failed"
  | "ready"
  | "viewport"
  | "dirty"
  | "saved"
  | "conflict"
  | "save-failed"
  | "draft-restored"
  | "note-saved"
  | "note-conflict"
  | "note-failed";

export type Announce = (type: AppEventType, detail?: Record<string, unknown>) => void;

// Queues an event and dispatches it after React commits the render it triggers, so a listener
// always observes the DOM and editor state that belong to the moment.
export function useAnnounce(): Announce {
  const outbox = useRef<{ type: AppEventType; detail: Record<string, unknown> }[]>([]);
  const [, setQueued] = useState(0);
  useEffect(() => {
    for (const event of outbox.current.splice(0))
      window.dispatchEvent(new CustomEvent(`visual-atlas:${event.type}`, { detail: event.detail }));
  });
  return useCallback((type, detail = {}) => {
    outbox.current.push({ type, detail });
    setQueued((count) => count + 1);
  }, []);
}
