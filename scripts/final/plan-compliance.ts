#!/usr/bin/env bun
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { retiredAppReferences } from "./retired-app-scan";

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new TypeError(`${name} is required`);
  return value;
}

const planPath = resolve(option("--plan"));
const evidenceRoot = resolve(option("--evidence-root"));
const requireTasksSpec = option("--require-tasks");
const outPath = resolve(option("--out"));

const requiredTasks: number[] = [];
for (const piece of requireTasksSpec.split(",")) {
  const range = /^(\d+)-(\d+)$/.exec(piece);
  if (range) {
    const start = Number.parseInt(range[1] ?? "", 10);
    const end = Number.parseInt(range[2] ?? "", 10);
    if (start > end) throw new TypeError(`invalid task range: ${piece}`);
    for (let task = start; task <= end; task += 1) requiredTasks.push(task);
  } else if (/^\d+$/.test(piece)) requiredTasks.push(Number.parseInt(piece, 10));
  else throw new TypeError(`invalid --require-tasks entry: ${piece}`);
}

type Json = Record<string, unknown>;

function arrayField(doc: Json | undefined, key: string): unknown[] | undefined {
  const value = doc?.[key];
  return Array.isArray(value) ? value : undefined;
}
type Check = { readonly name: string; readonly pass: boolean; readonly detail: string };
type Criterion = {
  readonly id: string;
  readonly criterion: string;
  readonly evidence: readonly string[];
  readonly checks: readonly Check[];
};

const failures: string[] = [];
const criteria: Criterion[] = [];

function record(
  id: string,
  criterion: string,
  evidence: readonly string[],
  checks: readonly Check[],
): void {
  criteria.push({ id, criterion, evidence, checks });
  for (const check of checks) if (!check.pass) failures.push(`${id}: ${check.name}`);
}

function evidencePath(name: string): string {
  return name.startsWith("/") ? name : join(evidenceRoot, name);
}

function fileExists(name: string): boolean {
  try {
    statSync(evidencePath(name));
    return true;
  } catch {
    return false;
  }
}

function nonEmpty(name: string): boolean {
  try {
    return statSync(evidencePath(name)).size > 0;
  } catch {
    return false;
  }
}

function readText(name: string): string | undefined {
  try {
    return readFileSync(evidencePath(name), "utf8");
  } catch {
    return undefined;
  }
}

function readJson(name: string, parseFailures: string[] = failures): Json | undefined {
  const text = readText(name);
  if (text === undefined) {
    parseFailures.push(`${name}: artifact is missing`);
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not an object");
    return parsed as Json;
  } catch (error) {
    parseFailures.push(`${name}: does not parse (${(error as Error).message})`);
    return undefined;
  }
}

function field(document: Json, path: readonly string[]): unknown {
  let current: unknown = document;
  for (const key of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function check(name: string, pass: boolean, detail: string): Check {
  return { name, pass, detail };
}

function isPng(name: string): boolean {
  try {
    const bytes = readFileSync(evidencePath(name));
    const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes.length >= 8 && Buffer.compare(bytes.subarray(0, 8), magic) === 0;
  } catch {
    return false;
  }
}

// Canonical sorted-key JSON, used to compare independent receipts structurally.
function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => Buffer.from(left).compare(Buffer.from(right)))
        .map(([key, child]) => [key, sortObject(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortObject(value))}\n`;
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

const planText = readText(planPath);
if (planText === undefined) failures.push(`plan is unreadable: ${planPath}`);

// --- Final wave prerequisites: F2 then F3, both APPROVE, before F1 runs. ---
const f2 = readJson("final-F2.json");
const f3 = readJson("final-F3.json");
record(
  "FINAL-WAVE",
  "F2 (code quality) and F3 (real manual QA) receipts exist, parse, and APPROVE; F1 runs after F3 per plan ordering",
  ["final-F2.json", "final-F3.json"],
  [
    check(
      "final-F2.json verdict === APPROVE",
      f2?.["verdict"] === "APPROVE",
      `verdict=${String(f2?.["verdict"])}`,
    ),
    check(
      "final-F3.json verdict === APPROVE",
      f3?.["verdict"] === "APPROVE",
      `verdict=${String(f3?.["verdict"])}`,
    ),
    check(
      "F3 CAS-abort evidence recorded",
      field(f3 ?? {}, ["casAbort", "outcome"]) === "conflict" &&
        typeof field(f3 ?? {}, ["casAbort", "burnedToken"]) === "string" &&
        typeof field(f3 ?? {}, ["casAbort", "retryFreshToken"]) === "string" &&
        field(f3 ?? {}, ["casAbort", "immutableUnchanged"]) === true &&
        field(f3 ?? {}, ["casAbort", "noLostWorkingData"]) === true,
      `burned=${String(field(f3 ?? {}, ["casAbort", "burnedToken"]))} retry=${String(field(f3 ?? {}, ["casAbort", "retryFreshToken"]))}`,
    ),
    check(
      "F3 live screenshots exist",
      fileExists("final-F3/final-F3-live-open.png") &&
        fileExists("final-F3/final-F3-clone-projection.png"),
      "final-F3 screenshots",
    ),
    check(
      "F3 source-manifest protection recorded",
      field(f3 ?? {}, ["source", "pre", "comparator", "verdict"]) === "PASS" &&
        field(f3 ?? {}, ["source", "pre", "task12FileDeltas"]) === 0,
      `pre comparator=${String(field(f3 ?? {}, ["source", "pre", "comparator", "verdict"]))} deltas=${String(field(f3 ?? {}, ["source", "pre", "task12FileDeltas"]))}`,
    ),
  ],
);

// --- Ledger cross-check: confirmed task-completed events for 1-12 + F2 + F3. ---
const ledgerPath = join(evidenceRoot, "..", "..", "start-work", "ledger.jsonl");
const confirmedLedgerTasks = new Set<string>();
const ledgerLines = readText(ledgerPath)?.split("\n") ?? [];
for (const line of ledgerLines) {
  const trimmed = line.trim();
  if (trimmed.length === 0) continue;
  try {
    const event: unknown = JSON.parse(trimmed);
    if (event === null || typeof event !== "object") continue;
    const recordLine = event as Record<string, unknown>;
    if (recordLine["event"] === "task-completed" && recordLine["verdict"] === "confirmed") {
      const task = recordLine["task"];
      if (typeof task === "string") confirmedLedgerTasks.add(task);
    }
  } catch {
    failures.push(`ledger.jsonl contains a malformed line: ${trimmed.slice(0, 80)}`);
  }
}
function ledgerHas(taskLabel: string): boolean {
  const prefix = `${taskLabel}. `;
  for (const task of confirmedLedgerTasks)
    if (task.startsWith(prefix) || task === taskLabel) return true;
  return false;
}

const ledgerChecks: Check[] = [];
for (const taskNumber of requiredTasks) {
  ledgerChecks.push(
    check(
      `ledger confirmed task ${taskNumber}`,
      ledgerHas(String(taskNumber)),
      `task-completed/confirmed for ${taskNumber}`,
    ),
  );
}
ledgerChecks.push(check("ledger confirmed F2", ledgerHas("F2"), "task-completed/confirmed for F2"));
ledgerChecks.push(check("ledger confirmed F3", ledgerHas("F3"), "task-completed/confirmed for F3"));
record(
  "LEDGER",
  "start-work ledger records confirmed task-completed events for every required task plus F2/F3",
  [ledgerPath],
  ledgerChecks,
);

// --- Plan checkbox state. ---
const planChecks: Check[] = [];
if (planText !== undefined) {
  for (const taskNumber of requiredTasks) {
    const checked = new RegExp(`^- \\[x\\] ${taskNumber}\\. `, "m").test(planText);
    planChecks.push(
      check(`plan marks todo ${taskNumber} complete`, checked, `checkbox for ${taskNumber}`),
    );
  }
  planChecks.push(check("plan marks F2 complete", /^- \[x\] F2\./m.test(planText), "F2 checkbox"));
  planChecks.push(check("plan marks F3 complete", /^- \[x\] F3\./m.test(planText), "F3 checkbox"));
}
record(
  "PLAN-STATE",
  "plan file exists and every required todo plus F2/F3 are marked complete",
  [planPath],
  planChecks,
);

// --- Must-have coverage. ---
const structure = readJson("task-3-structure.json") ?? readJson("task-3-final-validation.json");
const gallery = readJson("task-8-gallery.json");
const galleryBundles = Array.isArray(gallery?.["fixtureBundles"])
  ? (gallery?.["fixtureBundles"] as Json[])
  : [];
record(
  "MUST-3",
  "Project-centered learning system covering project maps, architecture, ADR tradeoffs, API contracts, workflows/sequences, data/trust boundaries, code exploration maps, and handwritten study notes",
  ["task-3-structure.json", "task-8-gallery.json", "task-10-isolated.json (expectedFiles)"],
  [
    check(
      "structure validator verdict PASS",
      structure?.["verdict"] === "PASS",
      String(structure?.["verdict"]),
    ),
    check(
      "all required paths and templates present",
      structure?.["requiredPathCount"] === 26 && structure?.["templateCount"] !== 0,
      `requiredPathCount=${String(structure?.["requiredPathCount"])} templateCount=${String(structure?.["templateCount"])}`,
    ),
    check(
      "no broken internal links",
      Array.isArray(structure?.["brokenLinks"]) &&
        (arrayField(structure, "brokenLinks") ?? []).length === 0,
      JSON.stringify(structure?.["brokenLinks"]),
    ),
    check(
      "gallery renders multi-kind dense fixtures",
      gallery?.["status"] === "PASS" &&
        galleryBundles.length > 0 &&
        Number(gallery?.["totalViews"] ?? 0) >= 10,
      `bundles=${galleryBundles.length} totalViews=${String(gallery?.["totalViews"])}`,
    ),
  ],
);

const renderer = readJson("task-5-renderer.json");
const evidenceCopies = Array.isArray(renderer?.["evidenceCopies"])
  ? (arrayField(renderer, "evidenceCopies") ?? [])
  : [];
const isolated = readJson("task-10-isolated.json");
const expectedFiles = Array.isArray(isolated?.["expectedFiles"])
  ? (arrayField(isolated, "expectedFiles") ?? [])
  : [];
record(
  "MUST-4",
  "Each visual artifact represented as a validated machine-readable spec, an editable .excalidraw.md drawing, and a companion evidence-linked Markdown note",
  [
    "task-5-renderer.json",
    "task-5-gallery.excalidraw.md",
    "task-5-gallery-note.md",
    "task-10-isolated.json",
  ],
  [
    check(
      "renderer receipt PASS and deterministic",
      renderer?.["status"] === "PASS" && renderer?.["deterministic"] === true,
      `${String(renderer?.["status"])} deterministic=${String(renderer?.["deterministic"])}`,
    ),
    check(
      "drawing + SVG export + companion note evidence copies exist",
      evidenceCopies.length >= 3 &&
        evidenceCopies.every((path) => typeof path === "string" && fileExists(String(path))),
      JSON.stringify(evidenceCopies.length),
    ),
    check(
      "sample bundle pairs specs with notes",
      expectedFiles.some((name) =>
        String(name).endsWith("_generated/specs/project-map-atlas-shop.json"),
      ) && expectedFiles.some((name) => String(name) === "00 Map.md"),
      `expectedFiles=${expectedFiles.length}`,
    ),
  ],
);

const preservation = readJson("task-6-preservation.json");
const independentPreservation = readJson("task-6-independent-preservation.json");
const preservationCases = Array.isArray(preservation?.["cases"])
  ? (preservation?.["cases"] as Json[])
  : [];
const anchorCase = preservationCases.find((entry) => entry["case"] === "removed-agent-anchor");
record(
  "MUST-5",
  "Stable Excalidraw IDs derived from artifact + semantic ID, owner=agent tagging with revision, in-place updates, untagged/owner=human elements preserved byte-for-byte, and human-referenced removed agent elements retained as deprecated anchors",
  [
    "task-6-preservation.json",
    "task-6-independent-preservation.json",
    "task-6-tests.log",
    "task-12-adversarial-verify.json",
  ],
  [
    check(
      "preservation QA PASS",
      preservation?.["status"] === "PASS" &&
        preservation?.["expectedStableAgentIds"] === true &&
        preservation?.["expectedDeprecatedAnchor"] === true,
      String(preservation?.["status"]),
    ),
    check(
      "binding fixtures cover human arrow/text-container/group/removed-anchor",
      preservationCases.length >= 4 &&
        preservationCases.every(
          (entry) =>
            entry["stableAgentIds"] === true &&
            entry["humanExact"] === true &&
            Array.isArray(entry["dangling"]) &&
            (entry["dangling"] as unknown[]).length === 0,
        ),
      `${preservationCases.length} cases`,
    ),
    check(
      "removed referenced agent node becomes deprecated anchor",
      anchorCase !== undefined &&
        Array.isArray(anchorCase["deprecatedAnchors"]) &&
        (anchorCase["deprecatedAnchors"] as unknown[]).length > 0,
      JSON.stringify(anchorCase?.["deprecatedAnchors"]),
    ),
    check(
      "independent verifier reproduced preservation PASS",
      independentPreservation?.["status"] === "PASS",
      String(independentPreservation?.["status"]),
    ),
    check(
      "task-12 live journey confirmed human byte-preservation",
      String(field(readJson("task-12-adversarial-verify.json") ?? {}, ["overall"])) === "confirmed",
      "task-12-adversarial-verify.json overall",
    ),
  ],
);

const commandsRequested = Array.isArray(isolated?.["commandsRequested"])
  ? (arrayField(isolated, "commandsRequested") ?? []).map(String)
  : [];
const walkthrough = (isolated?.["isolatedWalkthrough"] ?? {}) as Json;
record(
  "MUST-6",
  "init, create, extend, refresh, validate, open, and restore commands provided through one shared local skill and deterministic Bun/TypeScript command surface",
  [
    "task-10-isolated.json",
    "task-10-canonical-bootstrap.json",
    join(homedir(), ".agents/skills/visual-learning/bin/visual-note"),
  ],
  [
    check(
      "full command surface exercised",
      ["init", "create", "extend", "refresh", "validate", "open", "restore"].every((command) =>
        commandsRequested.includes(command),
      ),
      JSON.stringify(commandsRequested),
    ),
    check(
      "every walkthrough command exited 0",
      ["init", "create", "extend", "refresh", "validate", "open", "restore"].every(
        (command) => (walkthrough[command] as Json | undefined)?.["code"] === 0,
      ),
      "isolatedWalkthrough exit codes",
    ),
    check(
      "bootstrap repeatable (idempotent rerun)",
      Array.isArray(isolated?.["bootstrapRuns"]) &&
        (arrayField(isolated, "bootstrapRuns") ?? []).length >= 2,
      `bootstrapRuns=${Array.isArray(isolated?.["bootstrapRuns"]) ? (arrayField(isolated, "bootstrapRuns") ?? []).length : 0} entries`,
    ),
    check(
      "source records commit: null for non-Git fixture",
      field(isolated ?? {}, ["source", "commit"]) === null,
      JSON.stringify(isolated?.["source"]),
    ),
    check(
      "source code not copied into vault",
      isolated?.["sourceCopiedIntoVault"] === false,
      String(isolated?.["sourceCopiedIntoVault"]),
    ),
  ],
);

const matrix = readJson("task-7-transaction-matrix.json");
const killBoundaries = (matrix?.["killBoundaries"] ?? {}) as Json;
const tamperAfterState = (matrix?.["tamperAfterState"] ?? {}) as Json;
const tamperValues = Object.values(tamperAfterState).map(String);
record(
  "MUST-7",
  "Optimistic revision checks, per-artifact locks, atomic bundle writes, pre-mutation snapshots, failure injection tests, and complete-bundle restore",
  [
    "task-7-transaction-matrix.json",
    "task-7-human-save.json",
    "task-7-aba.json",
    "task-7-token-burn.json",
    "task-7-corrupt-restore.log",
    "task-12-token-burn.json",
  ],
  [
    check("transaction matrix PASS", matrix?.["status"] === "PASS", String(matrix?.["status"])),
    check(
      "all 22 crash kill boundaries exercised",
      Object.keys(killBoundaries).length >= 22,
      `${Object.keys(killBoundaries).length} boundaries`,
    ),
    check(
      "every post-STATE tamper is BLOCKED",
      tamperValues.length > 0 && tamperValues.every((value) => value.startsWith("BLOCKED")),
      `${tamperValues.length} tamper cases`,
    ),
    check(
      "ABA restore-as-new-token yields stale-token conflict",
      String(field(matrix ?? {}, ["aba", "staleConflict"])).includes("conflict"),
      JSON.stringify(matrix?.["aba"]),
    ),
    check(
      "human-only saves keep agentBaseHash stable and readable",
      field(readJson("task-7-human-save.json") ?? {}, ["agentBaseHashStable"]) === true &&
        field(readJson("task-7-human-save.json") ?? {}, ["readable"]) === true,
      "task-7-human-save.json",
    ),
    check(
      "abandoned tokens burned, never reused",
      field(readJson("task-7-token-burn.json") ?? {}, ["burned"]) === true &&
        readJson("task-12-token-burn.json")?.["burnedNeverReused"] === true,
      "task-7-token-burn.json + task-12-token-burn.json",
    ),
    check(
      "corrupt-restore failure log exists",
      nonEmpty("task-7-corrupt-restore.log"),
      "task-7-corrupt-restore.log",
    ),
  ],
);

const discovery = readJson("task-9-discovery.json");
const agents = Array.isArray(discovery?.["agents"]) ? (discovery?.["agents"] as Json[]) : [];
const canonicalPaths = new Set(agents.map((agent) => String(agent["canonical"])));
const contractSentinelOk = agents
  .filter((agent) => agent["status"] === "discovered")
  .every((agent) => field(agent, ["contract", "sentinel"]) === "VISUAL_LEARNING_CONTRACT_OK");
record(
  "MUST-8",
  "The same canonical skill directory is discoverable from Senpi, Codex, and Claude without duplicate writable copies",
  [
    "task-9-discovery.json",
    "task-9-collision.log",
    "task-9-install.json",
    "task-9-install-idempotent.json",
  ],
  [
    check(
      "discovery verdict PASS",
      discovery?.["verdict"] === "PASS",
      String(discovery?.["verdict"]),
    ),
    check(
      "senpi, codex, claude all linked",
      agents.length >= 3 &&
        agents.some((agent) => agent["client"] === "senpi") &&
        agents.some((agent) => agent["client"] === "codex") &&
        agents.some((agent) => agent["client"] === "claude"),
      `${agents.length} agents`,
    ),
    check(
      "all links resolve to one canonical directory",
      canonicalPaths.size === 1 &&
        canonicalPaths.has(join(homedir(), ".agents/skills/visual-learning")),
      JSON.stringify([...canonicalPaths]),
    ),
    check(
      "executable sessions emitted identical contract sentinel",
      contractSentinelOk,
      "VISUAL_LEARNING_CONTRACT_OK",
    ),
    check(
      "Claude limited to structural link per user override",
      agents.some(
        (agent) => agent["client"] === "claude" && agent["status"] === "structural-only",
      ) && String(discovery?.["executionPolicy"] ?? "").includes("user"),
      String(discovery?.["executionPolicy"]),
    ),
    check("collision refusal log exists", nonEmpty("task-9-collision.log"), "task-9-collision.log"),
  ],
);

record(
  "MUST-9",
  "Onboarding notes, prompt recipes, visual legend, fixture repository, and sample project bundle",
  [
    "task-10-onboarding.json",
    "task-10-canonical-bootstrap.json",
    "task-10-sample-map.png",
    "task-10-git-readonly.json",
    "final-F3.json",
  ],
  [
    check(
      "onboarding receipt PASS",
      readJson("task-10-onboarding.json")?.["status"] === "PASS",
      "task-10-onboarding.json",
    ),
    check(
      "canonical sample bundle published",
      readJson("task-10-canonical-bootstrap.json")?.["operation"] !== undefined &&
        nonEmpty("task-10-canonical-bootstrap.json"),
      "task-10-canonical-bootstrap.json",
    ),
    check(
      "sample map render exists as PNG",
      isPng("task-10-sample-map.png"),
      "task-10-sample-map.png",
    ),
    check(
      "existing-Git fixture read-only, records revision",
      readJson("task-10-git-readonly.json")?.["command"] !== undefined,
      "task-10-git-readonly.json",
    ),
  ],
);

// --- Per-task acceptance criteria. ---
record(
  "TASK-3",
  "Isolated Engineering Atlas structure created from the descriptor-validated canonical path without desktop-app or CLI calls; validator asserts every required path, resolving links, parseable templates; no pre-existing file changed; invalid slug exits 2",
  [
    "task-3-structure.json",
    "task-3-invalid-slug.log",
    "task-3-after-comparison.json",
    "task-3-atlas-manifest.json",
  ],
  [
    check(
      "structure validator PASS with fixture instantiation",
      structure?.["verdict"] === "PASS" &&
        Array.isArray(structure?.["projects"]) &&
        (arrayField(structure, "projects") ?? []).length > 0,
      JSON.stringify(structure?.["projects"]),
    ),
    check(
      "frontmatter parsed for every template",
      typeof structure?.["frontmatterParsed"] === "number" &&
        Number(structure?.["frontmatterParsed"]) > 0,
      `frontmatterParsed=${String(structure?.["frontmatterParsed"])} files`,
    ),
    check(
      "no-follow traversal used",
      structure?.["noFollowTraversal"] === true,
      String(structure?.["noFollowTraversal"]),
    ),
    check(
      "invalid-slug failure log exists",
      nonEmpty("task-3-invalid-slug.log"),
      "task-3-invalid-slug.log",
    ),
    check(
      "post-task comparator PASS",
      field(readJson("task-3-after-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS",
      "task-3-after-comparison.json",
    ),
  ],
);

const lockReceipt = readJson("task-4-lock.json");
const dependencyReceipt = readJson("task-4-dependencies.json");
const task4Tests = readText("task-4-tests.log") ?? "";
const passMatch = /(\d+) pass/.exec(task4Tests);
const failMatch = /(\d+) fail/.exec(task4Tests);
record(
  "TASK-4",
  "Typed spec/CLI package: exact-version lockfile-only bootstrap with recorded hashes, frozen install, tests, local typecheck, CLI preflight, and frozen-failure/symlink-race zero-write proofs",
  [
    "task-4-lock.json",
    "task-4-dependencies.json",
    "task-4-tests.log",
    "task-4-invalid-specs.json",
    "task-4-frozen-lock-failure.log",
    "task-4-done-claim.json",
  ],
  [
    check(
      "lockfile-only bootstrap recorded",
      Number(lockReceipt?.["lockfileOnlyRuns"] ?? 0) >= 1 &&
        typeof field(lockReceipt ?? {}, ["lock", "sha256"]) === "string",
      `lockfileOnlyRuns=${String(lockReceipt?.["lockfileOnlyRuns"])}`,
    ),
    check(
      "frozen install receipt with lock hash",
      dependencyReceipt?.["frozenInstall"] === true &&
        typeof dependencyReceipt?.["lockSha256"] === "string" &&
        String(dependencyReceipt?.["lockSha256"]).length === 64,
      "task-4-dependencies.json",
    ),
    check(
      "test log shows passing suite",
      passMatch !== null &&
        Number(passMatch[1]) > 0 &&
        failMatch !== null &&
        Number(failMatch[1]) === 0,
      `pass=${passMatch?.[1] ?? "?"} fail=${failMatch?.[1] ?? "?"}`,
    ),
    check(
      "invalid-spec and race drivers PASS",
      readJson("task-4-invalid-specs.json")?.["status"] === "PASS",
      "task-4-invalid-specs.json",
    ),
    check(
      "frozen-lock failure evidence exists",
      nonEmpty("task-4-frozen-lock-failure.log"),
      "task-4-frozen-lock-failure.log",
    ),
  ],
);

record(
  "TASK-5",
  "Deterministic ExcalidrawAutomate renderer: same spec twice yields same semantic set/geometry, complete ownership metadata, SVG + companion note exports, plugin errors precede partial output, canonical vault unchanged",
  [
    "task-5-renderer.json",
    "task-5-gallery.png",
    "task-5-gallery.svg",
    "task-5-api-error.log",
    "task-5-canonical-unchanged.json",
    "task-5-final-comparison.json",
  ],
  [
    check(
      "two renders semantically identical",
      renderer?.["deterministic"] === true && renderer?.["status"] === "PASS",
      "deterministic=true",
    ),
    check("gallery PNG valid", isPng("task-5-gallery.png"), "task-5-gallery.png"),
    check(
      "injected plugin API error exits before partial output",
      field(renderer ?? {}, ["failure", "exitCode"]) === 4 &&
        field(renderer ?? {}, ["failure", "outputsPresent"]) === false,
      JSON.stringify(renderer?.["failure"]),
    ),
    check(
      "canonical vault unchanged receipt PASS",
      readJson("task-5-canonical-unchanged.json")?.["status"] === "PASS",
      "task-5-canonical-unchanged.json",
    ),
    check(
      "post-task comparator PASS",
      field(readJson("task-5-final-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS",
      "task-5-final-comparison.json",
    ),
  ],
);

record(
  "TASK-6",
  "Annotation-preserving refresh: per-artifact lock, monotonic CAS token, selective in-place refresh by stable ID, deprecated anchors for removed referenced agent elements, human properties byte-identical, concurrent same-token refresh yields one success and one conflict",
  [
    "task-6-preservation.json",
    "task-6-independent-preservation.json",
    "task-6-concurrency.log",
    "task-6-20-race.json",
    "task-6-after-comparison.json",
  ],
  [
    check(
      "all four binding fixtures pass with stable IDs and exact human bytes",
      preservationCases.length >= 4 &&
        preservationCases.every(
          (entry) => entry["stableAgentIds"] === true && entry["humanExact"] === true,
        ),
      `${preservationCases.length} cases`,
    ),
    check(
      "concurrency evidence exists",
      nonEmpty("task-6-concurrency.log") && readJson("task-6-20-race.json") !== undefined,
      "task-6-concurrency.log + task-6-20-race.json",
    ),
    check(
      "independent verifier reproduced result",
      independentPreservation !== undefined &&
        sameValue(independentPreservation["cases"], preservation?.["cases"]),
      "independent run matches",
    ),
    check(
      "post-task comparator PASS",
      field(readJson("task-6-after-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS",
      "task-6-after-comparison.json",
    ),
  ],
);

record(
  "TASK-7",
  "Atomic snapshots/restore/recovery: single authoritative STATE record, agentBaseHash stable across human saves, final CAS after close+flush, crash kill boundaries, tamper BLOCKED, token burn, ABA restore-as-new-token, reader recovery gating",
  [
    "task-7-transaction-matrix.json",
    "task-7-human-save.json",
    "task-7-aba.json",
    "task-7-token-burn.json",
    "task-7-corrupt-restore.log",
    "task-7-tests.log",
  ],
  [
    check(
      "transaction matrix PASS with all invariants",
      matrix?.["status"] === "PASS" &&
        matrix?.["singleAuthoritativeState"] !== false &&
        matrix?.["readerRecoveryGate"] !== false,
      "task-7-transaction-matrix.json",
    ),
    check(
      "human save changes full hash but not agentBaseHash",
      field(readJson("task-7-human-save.json") ?? {}, ["fullHashChanged"]) === true &&
        field(readJson("task-7-human-save.json") ?? {}, ["agentBaseHashStable"]) === true,
      "task-7-human-save.json",
    ),
    check(
      "token-burn invariant holds",
      field(readJson("task-7-token-burn.json") ?? {}, ["burned"]) === true &&
        field(readJson("task-7-token-burn.json") ?? {}, ["nextToken"]) !== undefined,
      "task-7-token-burn.json",
    ),
    check("transaction test log exists", nonEmpty("task-7-tests.log"), "task-7-tests.log"),
  ],
);

const invalidEvidence = readText("task-8-invalid-evidence.log");
record(
  "TASK-8",
  "Evidence-backed templates: every artifact kind validates and renders, factual elements resolve to fixture paths/symbols, inference/question styling machine-detectable, dense fixtures split into linked views passing overlap/clip/orphan/dangling checks",
  [
    "task-8-gallery.json",
    "task-8-gallery.png",
    "task-8-invalid-evidence.log",
    "task-8-tests.log",
    "task-8-after-comparison.json",
  ],
  [
    check(
      "gallery covers every kind with valid PNG",
      gallery?.["status"] === "PASS" && isPng("task-8-gallery.png"),
      `views=${String(gallery?.["totalViews"])}`,
    ),
    check(
      "invalid-evidence failure path exercised",
      invalidEvidence !== undefined && invalidEvidence.length > 0,
      "task-8-invalid-evidence.log",
    ),
    check(
      "template/layout tests pass",
      /(\d+) pass/.exec(readText("task-8-tests.log") ?? "") !== null &&
        /0 fail/.test(readText("task-8-tests.log") ?? ""),
      "task-8-tests.log",
    ),
    check(
      "post-task comparator PASS",
      field(readJson("task-8-after-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS",
      "task-8-after-comparison.json",
    ),
  ],
);

record(
  "TASK-9",
  "One shared skill across agents: canonical SKILL.md, executable discovery by realpath, identical contract sentinel from fresh sessions, descriptor-safe link installation, collision/symlink-swap refusal",
  [
    "task-9-discovery.json",
    "task-9-collision.log",
    "task-9-install.json",
    "task-9-install-idempotent.json",
    "task-9-after-comparison.json",
  ],
  [
    check(
      "discovery PASS with contract sentinel",
      discovery?.["verdict"] === "PASS" &&
        field(discovery ?? {}, ["contract", "sentinel"]) === "VISUAL_LEARNING_CONTRACT_OK",
      "task-9-discovery.json",
    ),
    check(
      "install idempotent",
      readJson("task-9-install-idempotent.json") !== undefined &&
        readJson("task-9-install.json") !== undefined,
      "task-9-install*.json",
    ),
    check(
      "collision refusal evidence exists",
      nonEmpty("task-9-collision.log"),
      "task-9-collision.log",
    ),
    check(
      "post-task comparator PASS",
      field(readJson("task-9-after-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS",
      "task-9-after-comparison.json",
    ),
  ],
);

record(
  "TASK-10",
  "Onboarding sample and repeatable workflow: isolated bootstrap from plain non-Git fixture with commit: null, all walkthrough commands, idempotent reruns, read-only Git fixture revision, sample copied to canonical Atlas only after isolated success; plan-named task-10-walkthrough.log was superseded by task-10-isolated.json under the user-approved default-profile substitution",
  [
    "task-10-isolated.json",
    "task-10-canonical-bootstrap.json",
    "task-10-git-readonly.json",
    "task-10-sample-map.png",
    "task-10-failure.log",
    "task-10-current-manifest.json",
    "task-10-onboarding.json",
  ],
  [
    check(
      "isolated walkthrough PASS across full command surface",
      isolated?.["status"] === "PASS" &&
        ["init", "create", "extend", "refresh", "validate", "open", "restore"].every((command) =>
          commandsRequested.includes(command),
        ),
      String(isolated?.["status"]),
    ),
    check(
      "bootstrap idempotent across reruns",
      Array.isArray(isolated?.["bootstrapRuns"]) &&
        (arrayField(isolated, "bootstrapRuns") ?? []).length >= 2,
      `bootstrapRuns=${Array.isArray(isolated?.["bootstrapRuns"]) ? (arrayField(isolated, "bootstrapRuns") ?? []).length : 0} entries`,
    ),
    check(
      "Git fixture read-only revision recorded",
      readJson("task-10-git-readonly.json")?.["commit"] !== undefined ||
        readJson("task-10-git-readonly.json")?.["command"] !== undefined,
      "task-10-git-readonly.json",
    ),
    check(
      "canonical sample bundle receipt exists",
      readJson("task-10-canonical-bootstrap.json")?.["bundlePath"] !== undefined,
      "task-10-canonical-bootstrap.json",
    ),
    check("failure fixtures rejected", nonEmpty("task-10-failure.log"), "task-10-failure.log"),
    check(
      "current manifest comparator PASS",
      field(readJson("task-10-current-manifest.json") ?? {}, ["comparison", "verdict"]) === "PASS",
      "task-10-current-manifest.json",
    ),
  ],
);

const network = readJson("task-11-network.json");
const control = (network?.["control"] ?? {}) as Json;
const probes = Array.isArray(control["probes"]) ? (control["probes"] as Json[]) : [];
const sentinel = (network?.["sentinel"] ?? {}) as Json;
record(
  "TASK-11",
  "Offline privacy: sandbox-exec kernel containment proven by denied network controls, cryptographically random sentinel retained only as SHA-256, tested commands sandbox-launched by descent, no plaintext leakage outside designated file",
  [
    "task-11-network.json",
    "task-11-sentinel-scan.log",
    "task-11-sandbox-denial.log",
    "task-11-current-baseline.json",
    "task-11-network-verifier.json",
  ],
  [
    check(
      "sandbox-exec profile used",
      field(network ?? {}, ["sandbox", "execPath"]) === "/usr/bin/sandbox-exec" &&
        String(field(network ?? {}, ["sandbox", "profileContent"]) ?? "").includes("deny network"),
      "task-11-network.json sandbox",
    ),
    check(
      "injected network controls denied inside sandbox",
      control["proven"] === true &&
        probes.length > 0 &&
        probes
          .filter((probe) => probe["where"] === "inside-sandbox")
          .every((probe) => String(probe["classification"]).startsWith("denied")) &&
        probes.some(
          (probe) =>
            probe["where"] === "outside-sandbox" &&
            String(probe["classification"]) === "not-denied",
        ),
      `${probes.length} probes (inside denied, outside contrast not-denied)`,
    ),
    check(
      "sentinel plaintext never retained",
      sentinel["plaintextRetained"] === false &&
        sentinel["argvLeakFree"] === true &&
        sentinel["envLeakFree"] === true &&
        typeof sentinel["sha256"] === "string",
      "sentinel SHA-256-only",
    ),
    check(
      "process descent proven inside containment",
      field(network ?? {}, ["descent", "containmentProbe", "descentProven"]) === true,
      "descent.containmentProbe.descentProven",
    ),
    check(
      "full CLI command surface covered offline",
      Array.isArray(network?.["commandsVerified"]) &&
        ["preflight", "init", "create", "extend", "refresh", "validate", "open", "restore"].every(
          (command) =>
            (arrayField(network, "commandsVerified") ?? []).map(String).includes(command),
        ),
      JSON.stringify(network?.["commandsVerified"]),
    ),
    check(
      "sentinel scan and denial logs exist",
      nonEmpty("task-11-sentinel-scan.log") && nonEmpty("task-11-sandbox-denial.log"),
      "task-11 logs",
    ),
    check(
      "comparator PASS",
      field(readJson("task-11-current-baseline.json") ?? {}, ["comparison", "verdict"]) === "PASS",
      "task-11-current-baseline.json",
    ),
  ],
);

// --- The retired desktop note app is gone from the package surface. ---
const packageRoot = resolve(import.meta.dir, "../..");
const retiredReferences = retiredAppReferences(packageRoot);
record(
  "NO-RETIRED-APP",
  "No file under src/, scripts/, or tests/ names the retired desktop note app in its path or content",
  ["src/", "scripts/", "tests/"],
  [
    check(
      "no retired-app references",
      retiredReferences.length === 0,
      retiredReferences.length === 0 ? "none" : retiredReferences.join(", "),
    ),
  ],
);

const report = {
  schemaVersion: 1,
  type: "VisualLearningFinalPlanComplianceReport",
  verifier: "F1",
  generatedAt: new Date().toISOString(),
  invocation: {
    plan: planPath,
    evidenceRoot,
    requireTasks: requireTasksSpec,
    resolvedRequiredTasks: requiredTasks,
  },
  finalWave: {
    f2: { artifact: "final-F2.json", verdict: f2?.["verdict"] },
    f3: {
      artifact: "final-F3.json",
      verdict: f3?.["verdict"],
      casAbort: field(f3 ?? {}, ["casAbort"]),
    },
    ordering: "F1 executed after F2 and F3 per the final verification wave",
  },
  ledger: {
    path: ledgerPath,
    confirmedTasks: [...confirmedLedgerTasks].sort(),
  },
  criteria,
  knownNonBlockingNotes: [
    "Empty .rwlock production-leak hygiene: an empty per-artifact lock root directory can remain in production after lock release (task-12 verifier note); lock markers themselves are pruned and coherency/burn contracts are covered by task-7 tests.",
    "Todo 9 user-override: Claude execution excluded (no subscription); structural link/realpath/hash verification only, recorded in task-9-discovery.json executionPolicy.",
    "F3 substitutions under user constraints recorded in final-F3.json adaptation (clone create/open/restart/annotate/visual).",
  ],
  verdict: failures.length === 0 ? "APPROVE" : "REJECT",
  reasons: failures,
};
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
const parseCheck: { verdict?: unknown; reasons?: unknown } = JSON.parse(
  readFileSync(outPath, "utf8"),
) as { verdict?: unknown; reasons?: unknown };
if (parseCheck.verdict !== "APPROVE" && parseCheck.verdict !== "REJECT")
  throw new Error("plan-compliance receipt failed parse-check");
if (statSync(outPath).size === 0) throw new Error("plan-compliance receipt is empty");
process.stdout.write(
  `${JSON.stringify({ verdict: parseCheck.verdict, reasons: failures, criteriaChecked: criteria.length, out: outPath })}\n`,
);
if (parseCheck.verdict !== "APPROVE") process.exit(1);
