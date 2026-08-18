import { expect, test } from "bun:test";
import { buildGeneralWaitArm, buildSettingsEntryProbe } from "../scripts/qa/renderer-cdp-readiness";

test("Settings navigation identifies a blocking modal and the visible Settings control", () => {
  const rect = (left: number) => ({ left, top: 10, width: 20, height: 20 });
  const close = { getBoundingClientRect: () => rect(10) };
  const blocker = {
    isConnected: true,
    textContent: "Welcome to Excalidraw 2.26.4",
    getClientRects: () => [1],
    querySelector: (selector: string) =>
      selector === '.modal-close-button,[aria-label="Close"]' ? close : null,
  };
  const settings = {
    matches: () => true,
    querySelector: () => null,
    getBoundingClientRect: () => rect(40),
  };
  const documentValue = {
    querySelector: () => settings,
    querySelectorAll: (selector: string) => (selector.includes("modal") ? [blocker] : []),
  };
  const windowValue: Record<string, unknown> = {};
  const execute = new Function("document", "window", `return ${buildSettingsEntryProbe()}`) as (
    documentArg: typeof documentValue,
    windowArg: Record<string, unknown>,
  ) => unknown;

  expect(execute(documentValue, windowValue)).toEqual({
    settings: { x: 50, y: 20 },
    blocker: { x: 20, y: 20 },
    general: null,
  });
  expect(windowValue["__visualNoteSettingsBlocker"]).toBe(blocker);
});

test("Settings navigation prefers the semantically labeled descendant over the first button", () => {
  const rect = (left: number) => ({ left, top: 0, width: 10, height: 10 });
  const wrong = {
    getAttribute: () => "Help",
    textContent: "Help",
    getBoundingClientRect: () => rect(10),
  };
  const settings = {
    getAttribute: (name: string) => (name === "aria-label" ? "Settings" : null),
    textContent: "",
    getBoundingClientRect: () => rect(50),
  };
  const root = {
    matches: () => false,
    querySelector: () => wrong,
    querySelectorAll: () => [wrong, settings],
    getBoundingClientRect: () => rect(0),
  };
  const documentValue = {
    querySelector: () => root,
    querySelectorAll: () => [],
  };
  const execute = new Function("document", "window", `return ${buildSettingsEntryProbe()}`) as (
    documentArg: typeof documentValue,
    windowArg: Record<string, unknown>,
  ) => { settings: { x: number; y: number } };

  expect(execute(documentValue, {}).settings).toEqual({ x: 55, y: 5 });
});

test("General discovery is armed before the Settings click and resolves from mutation", async () => {
  let general: { textContent: string; getBoundingClientRect(): object } | undefined;
  let trigger: (() => void) | undefined;
  let observed: object | undefined;
  const documentValue = {
    querySelectorAll: () => (general === undefined ? [] : [general]),
  };
  const windowValue: Record<string, unknown> = {};
  class MockMutationObserver {
    constructor(listener: () => void) {
      trigger = listener;
    }
    observe(target: object): void {
      observed = target;
    }
    disconnect(): void {}
  }
  const arm = new Function(
    "document",
    "window",
    "MutationObserver",
    `return ${buildGeneralWaitArm()}`,
  ) as (
    documentArg: typeof documentValue,
    windowArg: Record<string, unknown>,
    observerArg: typeof MockMutationObserver,
  ) => boolean;

  expect(arm(documentValue, windowValue, MockMutationObserver)).toBe(true);
  expect(observed).toBe(documentValue);
  general = {
    textContent: "General",
    getBoundingClientRect: () => ({ left: 20, top: 30, width: 40, height: 20 }),
  };
  trigger?.();

  await expect(windowValue["__visualNoteGeneralWait"]).resolves.toEqual({ x: 40, y: 40 });
});
