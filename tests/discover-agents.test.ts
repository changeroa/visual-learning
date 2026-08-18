import { describe, expect, test } from "bun:test";
import { extractContract } from "../scripts/qa/discover-agents";
import { parseDiscoveryOptions } from "../scripts/qa/discovery-options";

const expected = {
  contractVersion: 1,
  sentinel: "VISUAL_LEARNING_CONTRACT_OK",
  fixtureSha256: "fa476708af8b6546f442f5f77bd988b3b80a4b8f2bc23b64d012ae7db69323ef",
} as const;

describe("cross-agent discovery routing", () => {
  test("requires an explicit execution and structural-only partition", () => {
    const options = parseDiscoveryOptions([
      "--resolve-command",
      "senpi,codex,claude",
      "--execute-contract",
      "senpi,codex",
      "--structural-only",
      "claude",
      "--contract-command",
      "/canonical/bin/visual-note contract",
      "--expect-contract-version",
      "1",
      "--expect-sentinel",
      "VISUAL_LEARNING_CONTRACT_OK",
      "--out",
      "/tmp/discovery.json",
    ]);
    expect(options.executeContracts).toEqual(["senpi", "codex"]);
    expect(options.structuralOnly).toEqual(["claude"]);
  });

  test("rejects a silently omitted resolved client", () => {
    expect(() =>
      parseDiscoveryOptions([
        "--resolve-command",
        "senpi,codex,claude",
        "--execute-contract",
        "senpi,codex",
        "--structural-only",
        "",
        "--contract-command",
        "/canonical/bin/visual-note contract",
        "--expect-contract-version",
        "1",
        "--expect-sentinel",
        "VISUAL_LEARNING_CONTRACT_OK",
        "--out",
        "/tmp/discovery.json",
      ]),
    ).toThrow();
  });
});

describe("cross-agent contract parsing", () => {
  test("extracts the deterministic object from agent framing", () => {
    expect(extractContract(`result:\n${JSON.stringify(expected)}\n`)).toEqual(expected);
  });

  test("extracts pretty-printed strict JSON", () => {
    expect(extractContract(`contract follows:\n${JSON.stringify(expected, null, 2)}`)).toEqual(
      expected,
    );
  });

  test("rejects prose that only repeats the sentinel", () => {
    expect(() => extractContract("I found VISUAL_LEARNING_CONTRACT_OK version 1")).toThrow();
  });

  test("rejects a contract with extra fields", () => {
    expect(() =>
      extractContract(JSON.stringify({ ...expected, claim: "made by model" })),
    ).toThrow();
  });
});
