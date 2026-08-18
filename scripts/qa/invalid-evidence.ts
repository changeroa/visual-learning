#!/usr/bin/env bun
import { join, resolve } from "node:path";
import { parseOptions, required } from "../../src/arguments";
import { InputError } from "../../src/errors";
import { validateBundleLayout } from "../../src/layout-check";
import { generateTemplateFixture } from "../../src/template-fixture";

type CaseName = "missing-evidence" | "absent-symbol" | "malformed-contract-line" | "dense-input";

function fixturePath(root: string, name: CaseName): string {
  switch (name) {
    case "missing-evidence":
      return join(root, "invalid-missing-evidence/bundle.json");
    case "absent-symbol":
      return join(root, "invalid-absent-symbol/bundle.json");
    case "malformed-contract-line":
      return join(root, "invalid-malformed/bundle.json");
    case "dense-input":
      return join(root, "dense/bundle.json");
  }
}

function main(): void {
  const options = parseOptions(Bun.argv.slice(2), new Set(["--cases", "--expect", "--fixtures"]));
  const requested = required(options, "--cases").split(",") as readonly CaseName[];
  const expectation = required(options, "--expect");
  const fixturesRoot = resolve(
    options.values.get("--fixtures") ?? join(import.meta.dir, "../../tests/fixtures/kinds"),
  );
  const results = requested.map((name) => {
    if (name === "dense-input") {
      const generated = generateTemplateFixture(fixturePath(fixturesRoot, name));
      const layouts = validateBundleLayout(generated.views);
      return {
        case: name,
        outcome: "split",
        viewCount: generated.views.length,
        relatedLinks: generated.views.map((view) => view.relatedViewIds),
        maxNodesPerView: Math.max(...generated.views.map((view) => view.spec.nodes.length)),
        layoutCount: layouts.length,
      } as const;
    }
    try {
      generateTemplateFixture(fixturePath(fixturesRoot, name));
      return { case: name, outcome: "unexpected-pass" } as const;
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      return { case: name, outcome: "reject", detail: error.message } as const;
    }
  });
  const passed = results.every((result) =>
    result.case === "dense-input" ? result.outcome === "split" : result.outcome === "reject",
  );
  const receipt = {
    schemaVersion: 1,
    type: "Task8InvalidEvidenceReceipt",
    status: passed ? "PASS" : "FAIL",
    expectation,
    results,
  } as const;
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (!passed) process.exit(1);
}

main();
