import { expect, test } from "bun:test";
import { splitInlineCode } from "../hosted/web/inline-code";

test("single-backtick spans become code segments and the rest stays text", () => {
  expect(splitInlineCode("read `STATE.committedToken` then `cas-N`.")).toEqual([
    { code: false, text: "read ", start: 0 },
    { code: true, text: "STATE.committedToken", start: 5 },
    { code: false, text: " then ", start: 27 },
    { code: true, text: "cas-N", start: 33 },
    { code: false, text: ".", start: 40 },
  ]);
});

test("unpaired backticks, empty spans, and markup stay literal text", () => {
  expect(splitInlineCode("one ` only")).toEqual([{ code: false, text: "one ` only", start: 0 }]);
  expect(splitInlineCode("empty `` span <b>x</b>")).toEqual([
    { code: false, text: "empty `` span <b>x</b>", start: 0 },
  ]);
  expect(splitInlineCode("")).toEqual([]);
});
