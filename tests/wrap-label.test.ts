import { describe, expect, test } from "bun:test";
import { wrapLabel } from "../src/wrap-label";

describe("label wrapping", () => {
  test("wraps at words without splitting exact English identifiers", () => {
    expect(wrapLabel("OpenChromeNaverSmartEditorBrowser auth·editor·evidence·confirmation")).toBe(
      "OpenChromeNaverSmartEditorBrowser\nauth·editor·evidence·confirmation",
    );
  });

  test("preserves a single long identifier as one visual line", () => {
    expect(wrapLabel("OpenChromeNaverSmartEditorBrowser")).toBe(
      "OpenChromeNaverSmartEditorBrowser",
    );
  });
});
