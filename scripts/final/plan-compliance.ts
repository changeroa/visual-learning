#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new TypeError(`${name} is required`);
  return value;
}

const planPath = resolve(option("--plan"));
const evidenceRoot = resolve(option("--evidence-root"));
const baselinePath = resolve(option("--baseline"));
const finalPath = resolve(option("--final"));
const requireTasksSpec = option("--require-tasks");
const outPath = resolve(option("--out"));

const requiredTasks: number[] = [];
for (const piece of requireTasksSpec.split(",")) {
  const range = /^(\d+)-(\d+)$/.exec(piece);
  if (range) {
    const start = Number.parseInt(range[1]!, 10);
    const end = Number.parseInt(range[2]!, 10);
    if (start > end) throw new TypeError(`invalid task range: ${piece}`);
    for (let task = start; task <= end; task += 1) requiredTasks.push(task);
  } else if (/^\d+$/.test(piece)) requiredTasks.push(Number.parseInt(piece, 10));
  else throw new TypeError(`invalid --require-tasks entry: ${piece}`);
}

type Json = Record<string, unknown>;
type Check = { readonly name: string; readonly pass: boolean; readonly detail: string };
type Criterion = {
  readonly id: string;
  readonly criterion: string;
  readonly evidence: readonly string[];
  readonly checks: readonly Check[];
};

const failures: string[] = [];
const criteria: Criterion[] = [];

function record(id: string, criterion: string, evidence: readonly string[], checks: readonly Check[]): void {
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
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
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

// Mirrored canonical-JSON digest rules from bin/baseline-manifest.ts (evidence root).
function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

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

function stableDescriptor(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const { device: _device, sha256: _sha256, ...stable } = value as Record<string, unknown>;
  return stable;
}

function stableVault(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const vault = value as Record<string, unknown>;
  return { ...vault, root: stableDescriptor(vault["root"]) };
}

function stableProtectedTargets(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((target) => {
    if (target === null || typeof target !== "object" || Array.isArray(target)) return target;
    const record = target as Record<string, unknown>;
    return {
      ...record,
      nearestExistingAncestor: stableDescriptor(record["nearestExistingAncestor"]),
      root: stableDescriptor(record["root"]),
    };
  });
}

function entryMap(vault: unknown, label: string): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  if (vault === null || typeof vault !== "object" || !Array.isArray((vault as Json)["entries"])) {
    throw new Error(`${label} has no entry array`);
  }
  for (const raw of (vault as { entries: unknown[] })["entries"]) {
    if (raw === null || typeof raw !== "object") throw new Error(`${label} has an invalid entry`);
    const item = raw as Record<string, unknown>;
    if (typeof item["relativePath"] !== "string") throw new Error(`${label} has an invalid entry`);
    result.set(item["relativePath"], item);
  }
  return result;
}

const allowedRuntimePaths = [
  ".obsidian/app.json",
  ".obsidian/appearance.json",
  ".obsidian/core-plugins.json",
  ".obsidian/community-plugins.json",
  ".obsidian/workspace.json",
  ".obsidian/plugins/obsidian-excalidraw-plugin/manifest.json",
  ".obsidian/plugins/obsidian-excalidraw-plugin/main.js",
  ".obsidian/plugins/obsidian-excalidraw-plugin/styles.css",
  ".obsidian/plugins/obsidian-excalidraw-plugin/data.json",
];
const runtimeExpectedTypes = new Map(allowedRuntimePaths.map((path) => [path, "file"] as const));
const runtimeAncestorPaths = new Set<string>();
for (const runtimePath of allowedRuntimePaths) {
  const parts = runtimePath.split("/");
  for (let index = 1; index < parts.length; index += 1) runtimeAncestorPaths.add(parts.slice(0, index).join("/"));
}
const communityPluginsPath = ".obsidian/community-plugins.json";

function validateNewCanonicalEntry(path: string, entry: Record<string, unknown>): void {
  if (path === "Engineering Atlas" || path.startsWith("Engineering Atlas/")) return;
  const expectedType = runtimeExpectedTypes.get(path);
  if (expectedType) {
    if (entry["type"] !== expectedType) throw new Error(`new runtime path must be ${expectedType}: ${path}`);
    return;
  }
  if (runtimeAncestorPaths.has(path)) {
    if (entry["type"] !== "directory") throw new Error(`new runtime ancestor must be directory: ${path}`);
    return;
  }
  throw new Error(`unapproved new canonical entry: ${path}`);
}

function compareCommunityPlugins(previous: unknown, current: unknown): "unchanged" | "added" {
  if (!Array.isArray(previous) || !Array.isArray(current) || previous.some((item) => typeof item !== "string") || current.some((item) => typeof item !== "string")) {
    throw new Error(`${communityPluginsPath} must remain a JSON string array`);
  }
  const plugin = "obsidian-excalidraw-plugin";
  const previousCount = previous.filter((item) => item === plugin).length;
  const currentCount = current.filter((item) => item === plugin).length;
  if (previousCount > 1 || currentCount > 1 || currentCount < previousCount || currentCount > previousCount + 1) {
    throw new Error(`${communityPluginsPath} violates add-only plugin semantics`);
  }
  const previousUnrelated = previous.filter((item) => item !== plugin);
  const currentUnrelated = current.filter((item) => item !== plugin);
  if (!sameValue(previousUnrelated, currentUnrelated)) throw new Error(`${communityPluginsPath} changed unrelated entries`);
  return currentCount === previousCount ? "unchanged" : "added";
}

type RecomputeResult = {
  readonly ok: boolean;
  readonly baselineCoreDigest: string | null;
  readonly finalCoreDigest: string | null;
  readonly allowedSemanticDeltas: readonly string[];
  readonly preExistingCount: number | null;
  readonly newEntryCount: number | null;
  readonly notes: readonly string[];
};

// Independent read-only recomputation of the baseline-vs-final manifest comparison,
// mirroring compareAgainstBaseline() from the task-1 comparator (bin/baseline-manifest.ts).
function recomputeComparison(baseline: Json, finalDocument: Json): RecomputeResult {
  const notes: string[] = [];
  let baselineCoreDigest: string | null = null;
  let finalCoreDigest: string | null = null;
  try {
    const { manifestDigest, verification: _verification, comparison: _comparison, ...baselineCore } = baseline;
    const { manifestDigest: finalDigestField, verification: _finalVerification, comparison: _finalComparison, ...finalCore } = finalDocument;
    if (typeof manifestDigest !== "string" || typeof finalDigestField !== "string") throw new Error("manifest digest fields must be strings");
    baselineCoreDigest = sha256(canonicalJson(baselineCore));
    finalCoreDigest = sha256(canonicalJson(finalCore));
    if (baselineCoreDigest !== manifestDigest) throw new Error("baseline manifestDigest does not match its core document");
    if (finalCoreDigest !== finalDigestField) throw new Error("final manifestDigest does not match its core document");
    const baselineVaults = baseline["vaults"];
    const finalVaults = finalCore["vaults"];
    if (!Array.isArray(baselineVaults) || !Array.isArray(finalVaults) || baselineVaults.length !== 2 || finalVaults.length !== 2) {
      throw new Error("manifests must each record exactly two vaults");
    }
    const previousVaults = baselineVaults as Json[];
    const currentVaults = finalVaults as Json[];
    if (previousVaults[0]?.["path"] !== currentVaults[0]?.["path"] || previousVaults[1]?.["path"] !== currentVaults[1]?.["path"]) {
      throw new Error("manifest vault paths differ");
    }
    if (previousVaults[1]?.["readonly"] !== true || currentVaults[1]?.["readonly"] !== true) throw new Error("second vault must be recorded read-only");
    if (previousVaults[0]?.["canonical"] !== true || currentVaults[0]?.["canonical"] !== true) throw new Error("first vault must be recorded canonical");
    if (!sameValue(stableVault(previousVaults[1]), stableVault(currentVaults[1]))) throw new Error("readonly (older) vault changed");
    if (!sameValue(stableProtectedTargets(baseline["protectedTargets"]), stableProtectedTargets(finalCore["protectedTargets"]))) {
      throw new Error("protected targets changed");
    }
    const previousEntries = entryMap(previousVaults[0], "baseline canonical vault");
    const currentEntries = entryMap(currentVaults[0], "final canonical vault");
    const previousRuntime = previousVaults[0]?.["runtimeJsonBaselines"] as Record<string, unknown> | undefined;
    const currentRuntime = currentVaults[0]?.["runtimeJsonBaselines"] as Record<string, unknown> | undefined;
    const allowedSemanticDeltas: string[] = [];
    for (const [path, oldEntry] of previousEntries) {
      const currentEntry = currentEntries.get(path);
      if (!currentEntry) throw new Error(`pre-existing canonical entry removed: ${path}`);
      if (path === communityPluginsPath) {
        if (oldEntry["type"] !== "file" || currentEntry["type"] !== "file" || oldEntry["mode"] !== currentEntry["mode"]) {
          throw new Error(`${communityPluginsPath} type or mode changed`);
        }
        const before = previousRuntime?.[path];
        const after = currentRuntime?.[path];
        if (before === undefined || after === undefined) throw new Error(`${communityPluginsPath} lacks descriptor-captured semantic baseline`);
        if (compareCommunityPlugins(before, after) === "added") {
          allowedSemanticDeltas.push(`${communityPluginsPath}:add-only:obsidian-excalidraw-plugin`);
        }
      } else if (oldEntry["type"] === "directory") {
        if (currentEntry["type"] !== "directory" || oldEntry["mode"] !== currentEntry["mode"]) {
          throw new Error(`canonical directory changed type or mode: ${path}`);
        }
      } else if (!sameValue(oldEntry, currentEntry)) {
        throw new Error(`pre-existing canonical entry changed: ${path}`);
      }
    }
    for (const [path, currentEntry] of currentEntries) {
      if (previousEntries.has(path)) continue;
      validateNewCanonicalEntry(path, currentEntry);
      if (path === communityPluginsPath) {
        const after = currentRuntime?.[path];
        if (after === undefined) throw new Error(`${communityPluginsPath} lacks descriptor-captured semantic baseline`);
        if (compareCommunityPlugins([], after) !== "added") throw new Error(`${communityPluginsPath} must contain exactly the approved plugin when newly created`);
        allowedSemanticDeltas.push(`${communityPluginsPath}:add-only:obsidian-excalidraw-plugin`);
      }
    }
    const recorded = finalDocument["comparison"] as Json | undefined;
    if (!recorded || recorded["verdict"] !== "PASS") throw new Error("final manifest comparison verdict is not PASS");
    if (recorded["baselineManifestDigest"] !== manifestDigest) throw new Error("final comparison baseline digest does not reference the task-1 baseline");
    if (recorded["currentManifestDigest"] !== finalDigestField) throw new Error("final comparison digest does not match the final manifest");
    if (!sameValue(recorded["allowedSemanticDeltas"], allowedSemanticDeltas)) {
      throw new Error("recomputed allowed semantic deltas differ from the recorded ones");
    }
    const verification = finalDocument["verification"] as Json | undefined;
    if (!verification || verification["repeatDigestEqual"] !== true) notes.push("final manifest repeat-digest equality not recorded");
    return {
      ok: true,
      baselineCoreDigest: manifestDigest,
      finalCoreDigest: finalDigestField,
      allowedSemanticDeltas,
      preExistingCount: previousEntries.size,
      newEntryCount: currentEntries.size - previousEntries.size,
      notes,
    };
  } catch (error) {
    notes.push((error as Error).message);
    return { ok: false, baselineCoreDigest, finalCoreDigest, allowedSemanticDeltas: [], preExistingCount: null, newEntryCount: null, notes };
  }
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
    check("final-F2.json verdict === APPROVE", f2?.["verdict"] === "APPROVE", `verdict=${String(f2?.["verdict"])}`),
    check("final-F3.json verdict === APPROVE", f3?.["verdict"] === "APPROVE", `verdict=${String(f3?.["verdict"])}`),
    check("F3 CAS-abort evidence recorded", field(f3 ?? {}, ["casAbort", "outcome"]) === "conflict" && typeof field(f3 ?? {}, ["casAbort", "burnedToken"]) === "string" && typeof field(f3 ?? {}, ["casAbort", "retryFreshToken"]) === "string" && field(f3 ?? {}, ["casAbort", "immutableUnchanged"]) === true && field(f3 ?? {}, ["casAbort", "noLostWorkingData"]) === true, `burned=${String(field(f3 ?? {}, ["casAbort", "burnedToken"]))} retry=${String(field(f3 ?? {}, ["casAbort", "retryFreshToken"]))}`),
    check("F3 live screenshots exist", fileExists("final-F3/final-F3-live-open.png") && fileExists("final-F3/final-F3-clone-projection.png"), "final-F3 screenshots"),
    check("F3 source-manifest protection recorded", field(f3 ?? {}, ["source", "pre", "comparator", "verdict"]) === "PASS" && field(f3 ?? {}, ["source", "pre", "task12FileDeltas"]) === 0, `pre comparator=${String(field(f3 ?? {}, ["source", "pre", "comparator", "verdict"]))} deltas=${String(field(f3 ?? {}, ["source", "pre", "task12FileDeltas"]))}`),
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
  for (const task of confirmedLedgerTasks) if (task.startsWith(prefix) || task === taskLabel) return true;
  return false;
}

const ledgerChecks: Check[] = [];
for (const taskNumber of requiredTasks) {
  ledgerChecks.push(check(`ledger confirmed task ${taskNumber}`, ledgerHas(String(taskNumber)), `task-completed/confirmed for ${taskNumber}`));
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
    planChecks.push(check(`plan marks todo ${taskNumber} complete`, checked, `checkbox for ${taskNumber}`));
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

// --- Independent baseline vs final manifest recomputation. ---
const baselineDocument = readJson(baselinePath.startsWith(evidenceRoot) ? baselinePath.slice(evidenceRoot.length + 1) : baselinePath);
const finalDocument = readJson(finalPath.startsWith(evidenceRoot) ? finalPath.slice(evidenceRoot.length + 1) : finalPath);
const recompute = baselineDocument && finalDocument ? recomputeComparison(baselineDocument, finalDocument) : undefined;
record(
  "MANIFEST-RECOMPUTE",
  "independently recompute baseline (task-1) vs final (task-12) manifest digests and Scope preservation rules: pre-existing entries byte-identical, older vault read-only, protected targets unchanged, community-plugins add-only, new entries confined to Engineering Atlas/ and the runtime allowlist",
  [baselinePath, finalPath],
  [
    check("both manifests parse", baselineDocument !== undefined && finalDocument !== undefined, "JSON parse"),
    check("baseline core digest matches recorded manifestDigest", recompute?.baselineCoreDigest !== undefined && recompute.baselineCoreDigest !== null, String(recompute?.baselineCoreDigest)),
    check("final core digest matches recorded manifestDigest", recompute?.finalCoreDigest !== undefined && recompute.finalCoreDigest !== null, String(recompute?.finalCoreDigest)),
    check("recomputed comparison passes with identical allowed semantic deltas", recompute?.ok === true, `notes=${JSON.stringify(recompute?.notes ?? ["manifests unreadable"])}`),
    check("only approved semantic delta is the community-plugins add", recompute !== undefined && recompute.allowedSemanticDeltas.length === 1 && recompute.allowedSemanticDeltas[0] === `${communityPluginsPath}:add-only:obsidian-excalidraw-plugin`, JSON.stringify(recompute?.allowedSemanticDeltas ?? [])),
    check("final manifest comparison verdict PASS recorded", field(finalDocument ?? {}, ["comparison", "verdict"]) === "PASS", "task-12-final-manifest.json comparison.verdict"),
  ],
);

// --- Must-have coverage. ---
const install = readJson("task-2-obsidian-install.json");
const installStatus = String(install?.["status"]);
const verification = install?.["verification"] as Json | undefined;
const authorities = Array.isArray(verification?.["authorities"]) ? (verification!["authorities"] as unknown[]) : [];
let officialSymlinkOk = false;
let officialSymlinkDetail = "missing";
try {
  const status = lstatSync("/usr/local/bin/obsidian");
  const target = readlinkSync("/usr/local/bin/obsidian");
  officialSymlinkOk = status.isSymbolicLink() && target === "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli";
  officialSymlinkDetail = `symlink -> ${target}`;
} catch (error) {
  officialSymlinkDetail = (error as Error).message;
}
const pluginInstall = readJson("task-2-plugin-install.json");
const pluginReadiness = field(pluginInstall ?? {}, ["liveCheck", "readiness"]) as Json | undefined;
const cliEnable = readJson("task-2-cli-enable.json");
const preflight = readJson("task-2-preflight.json");
record(
  "MUST-1",
  "Current official signed/notarized Obsidian app installed from the first-party surface, bundled CLI exposed by absolute path via the official /usr/local/bin/obsidian symlink, official obsidian-excalidraw-plugin installed and enabled in the canonical vault",
  ["task-2-obsidian-install.json", "task-2-cli-enable.json", "task-2-plugin-install.json", "task-2-preflight.json", "/usr/local/bin/obsidian (live read-only check)"],
  [
    check("install receipt status INSTALLED/ALREADY_INSTALLED", installStatus === "INSTALLED" || installStatus === "ALREADY_INSTALLED", installStatus),
    check("codesign authorities recorded (signed)", authorities.length > 0, `${authorities.length} authorities`),
    check("codesign and Gatekeeper exits clean", verification?.["codesignExit"] === 0 && verification?.["gatekeeperExit"] === 0, `codesignExit=${String(verification?.["codesignExit"])} gatekeeperExit=${String(verification?.["gatekeeperExit"])}`),
    check("official symlink live-verified", officialSymlinkOk, officialSymlinkDetail),
    check("CLI enable receipt status ENABLED", cliEnable?.["status"] === "ENABLED", String(cliEnable?.["status"])),
    check("no shell startup files edited", cliEnable?.["shellStartupFilesEdited"] === false, String(cliEnable?.["shellStartupFilesEdited"])),
    check("conditional CDP endpoint closed", field(cliEnable ?? {}, ["conditionalCdp", "endpointClosed"]) === true, JSON.stringify(cliEnable?.["conditionalCdp"])),
    check("no pre-existing Obsidian process at launch", Array.isArray(field(cliEnable ?? {}, ["gates", "existingProcessesBefore"])) && (field(cliEnable ?? {}, ["gates", "existingProcessesBefore"]) as unknown[]).length === 0, JSON.stringify(field(cliEnable ?? {}, ["gates", "existingProcessesBefore"]))),
    check("plugin installed and enabled through official CLI", pluginInstall?.["status"] === "INSTALLED_AND_ENABLED" && String(field(preflight ?? {}, ["plugin", "id"])) === "obsidian-excalidraw-plugin", `${String(pluginInstall?.["status"])} id=${String(field(preflight ?? {}, ["plugin", "id"]))}`),
    check("plugin install add-only and pre-existing JSON preserved", (() => {
      const addOnly = (pluginInstall?.["addOnly"] ?? {}) as Json;
      const preserved = (pluginInstall?.["preexistingJsonPreserved"] ?? {}) as Json;
      const after = Array.isArray(addOnly["after"]) ? (addOnly["after"] as unknown[]).map(String) : [];
      const before = Array.isArray(addOnly["before"]) ? (addOnly["before"] as unknown[]).map(String) : [];
      return after.includes("obsidian-excalidraw-plugin") && !before.includes("obsidian-excalidraw-plugin") && addOnly["unrelatedEntriesPreserved"] === true && Object.values(preserved).every((value) => value === true);
    })(), "addOnly add-only delta + preexistingJsonPreserved all-true"),
    check("plugin live readiness loaded with automate API", pluginReadiness?.["loaded"] === true && pluginReadiness?.["automatePluginBound"] === true, JSON.stringify(pluginReadiness?.["sentinel"])),
    check("runtime preflight READY with Sync disabled", preflight?.["status"] === "READY" && preflight?.["syncEnabled"] === false, `${String(preflight?.["status"])} sync=${String(preflight?.["syncEnabled"])}`),
    check("all post-identity calls vault-bound", preflight?.["allPostIdentityCallsBound"] === true, String(preflight?.["allPostIdentityCallsBound"])),
  ],
);

record(
  "MUST-2",
  "Every pre-existing note byte-identical in both vaults; only Engineering Atlas/ plus the allowlisted canonical-vault runtime JSON may be new or changed; community-plugins.json may only gain obsidian-excalidraw-plugin",
  ["task-1-baseline.json", "task-12-final-manifest.json (recomputed above)", "task-2-final-comparison.json", "task-2-runtime-semantic-delta.json"],
  [
    check("independent recomputation passes Scope rules", recompute?.ok === true, "see MANIFEST-RECOMPUTE"),
    check("task-2 final comparison PASS", field(readJson("task-2-final-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS", "task-2-final-comparison.json"),
    check("task-2 runtime semantic delta receipt parses", readJson("task-2-runtime-semantic-delta.json") !== undefined, "task-2-runtime-semantic-delta.json"),
  ],
);

const structure = readJson("task-3-structure.json") ?? readJson("task-3-final-validation.json");
const gallery = readJson("task-8-gallery.json");
const galleryBundles = Array.isArray(gallery?.["fixtureBundles"]) ? (gallery!["fixtureBundles"] as Json[]) : [];
record(
  "MUST-3",
  "Project-centered learning system covering project maps, architecture, ADR tradeoffs, API contracts, workflows/sequences, data/trust boundaries, code exploration maps, and handwritten study notes",
  ["task-3-structure.json", "task-8-gallery.json", "task-10-isolated.json (expectedFiles)"],
  [
    check("structure validator verdict PASS", structure?.["verdict"] === "PASS", String(structure?.["verdict"])),
    check("all required paths and templates present", structure?.["requiredPathCount"] === 26 && structure?.["templateCount"] !== 0, `requiredPathCount=${String(structure?.["requiredPathCount"])} templateCount=${String(structure?.["templateCount"])}`),
    check("no broken internal links", Array.isArray(structure?.["brokenLinks"]) && (structure!["brokenLinks"] as unknown[]).length === 0, JSON.stringify(structure?.["brokenLinks"])),
    check("gallery renders multi-kind dense fixtures", gallery?.["status"] === "PASS" && galleryBundles.length > 0 && Number(gallery?.["totalViews"] ?? 0) >= 10, `bundles=${galleryBundles.length} totalViews=${String(gallery?.["totalViews"])}`),
  ],
);

const renderer = readJson("task-5-renderer.json");
const evidenceCopies = Array.isArray(renderer?.["evidenceCopies"]) ? (renderer!["evidenceCopies"] as unknown[]) : [];
const isolated = readJson("task-10-isolated.json");
const expectedFiles = Array.isArray(isolated?.["expectedFiles"]) ? (isolated!["expectedFiles"] as unknown[]) : [];
record(
  "MUST-4",
  "Each visual artifact represented as a validated machine-readable spec, an editable .excalidraw.md drawing, and a companion evidence-linked Markdown note",
  ["task-5-renderer.json", "task-5-gallery.excalidraw.md", "task-5-gallery-note.md", "task-10-isolated.json"],
  [
    check("renderer receipt PASS and deterministic", renderer?.["status"] === "PASS" && renderer?.["deterministic"] === true, `${String(renderer?.["status"])} deterministic=${String(renderer?.["deterministic"])}`),
    check("drawing + SVG export + companion note evidence copies exist", evidenceCopies.length >= 3 && evidenceCopies.every((path) => typeof path === "string" && fileExists(String(path))), JSON.stringify(evidenceCopies.length)),
    check("sample bundle pairs specs with notes", expectedFiles.some((name) => String(name).endsWith("_generated/specs/project-map-atlas-shop.json")) && expectedFiles.some((name) => String(name) === "00 Map.md"), `expectedFiles=${expectedFiles.length}`),
  ],
);

const preservation = readJson("task-6-preservation.json");
const independentPreservation = readJson("task-6-independent-preservation.json");
const preservationCases = Array.isArray(preservation?.["cases"]) ? (preservation!["cases"] as Json[]) : [];
const anchorCase = preservationCases.find((entry) => entry["case"] === "removed-agent-anchor");
record(
  "MUST-5",
  "Stable Excalidraw IDs derived from artifact + semantic ID, owner=agent tagging with revision, in-place updates, untagged/owner=human elements preserved byte-for-byte, and human-referenced removed agent elements retained as deprecated anchors",
  ["task-6-preservation.json", "task-6-independent-preservation.json", "task-6-tests.log", "task-12-adversarial-verify.json"],
  [
    check("preservation QA PASS", preservation?.["status"] === "PASS" && preservation?.["expectedStableAgentIds"] === true && preservation?.["expectedDeprecatedAnchor"] === true, String(preservation?.["status"])),
    check("binding fixtures cover human arrow/text-container/group/removed-anchor", preservationCases.length >= 4 && preservationCases.every((entry) => entry["stableAgentIds"] === true && entry["humanExact"] === true && Array.isArray(entry["dangling"]) && (entry["dangling"] as unknown[]).length === 0), `${preservationCases.length} cases`),
    check("removed referenced agent node becomes deprecated anchor", anchorCase !== undefined && Array.isArray(anchorCase["deprecatedAnchors"]) && (anchorCase["deprecatedAnchors"] as unknown[]).length > 0, JSON.stringify(anchorCase?.["deprecatedAnchors"])),
    check("independent verifier reproduced preservation PASS", independentPreservation?.["status"] === "PASS", String(independentPreservation?.["status"])),
    check("task-12 live journey confirmed human byte-preservation", String(field(readJson("task-12-adversarial-verify.json") ?? {}, ["overall"])) === "confirmed", "task-12-adversarial-verify.json overall"),
  ],
);

const commandsRequested = Array.isArray(isolated?.["commandsRequested"]) ? (isolated!["commandsRequested"] as unknown[]).map(String) : [];
const walkthrough = (isolated?.["isolatedWalkthrough"] ?? {}) as Json;
record(
  "MUST-6",
  "init, create, extend, refresh, validate, open, and restore commands provided through one shared local skill and deterministic Bun/TypeScript command surface",
  ["task-10-isolated.json", "task-10-canonical-bootstrap.json", "/Users/billionjaepyo/.agents/skills/visual-learning/bin/visual-note"],
  [
    check("full command surface exercised", ["init", "create", "extend", "refresh", "validate", "open", "restore"].every((command) => commandsRequested.includes(command)), JSON.stringify(commandsRequested)),
    check("every walkthrough command exited 0", ["init", "create", "extend", "refresh", "validate", "open", "restore"].every((command) => (walkthrough[command] as Json | undefined)?.["code"] === 0), "isolatedWalkthrough exit codes"),
    check("bootstrap repeatable (idempotent rerun)", Array.isArray(isolated?.["bootstrapRuns"]) && (isolated!["bootstrapRuns"] as unknown[]).length >= 2, `bootstrapRuns=${Array.isArray(isolated?.["bootstrapRuns"]) ? (isolated!["bootstrapRuns"] as unknown[]).length : 0} entries`),
    check("source records commit: null for non-Git fixture", field(isolated ?? {}, ["source", "commit"]) === null, JSON.stringify(isolated?.["source"])),
    check("source code not copied into vault", isolated?.["sourceCopiedIntoVault"] === false, String(isolated?.["sourceCopiedIntoVault"])),
  ],
);

const matrix = readJson("task-7-transaction-matrix.json");
const killBoundaries = (matrix?.["killBoundaries"] ?? {}) as Json;
const tamperAfterState = (matrix?.["tamperAfterState"] ?? {}) as Json;
const tamperValues = Object.values(tamperAfterState).map(String);
record(
  "MUST-7",
  "Optimistic revision checks, per-artifact locks, atomic bundle writes, pre-mutation snapshots, failure injection tests, and complete-bundle restore",
  ["task-7-transaction-matrix.json", "task-7-human-save.json", "task-7-aba.json", "task-7-token-burn.json", "task-7-corrupt-restore.log", "task-12-token-burn.json"],
  [
    check("transaction matrix PASS", matrix?.["status"] === "PASS", String(matrix?.["status"])),
    check("all 22 crash kill boundaries exercised", Object.keys(killBoundaries).length >= 22, `${Object.keys(killBoundaries).length} boundaries`),
    check("every post-STATE tamper is BLOCKED", tamperValues.length > 0 && tamperValues.every((value) => value.startsWith("BLOCKED")), `${tamperValues.length} tamper cases`),
    check("ABA restore-as-new-token yields stale-token conflict", String(field(matrix ?? {}, ["aba", "staleConflict"])).includes("conflict"), JSON.stringify(matrix?.["aba"])),
    check("human-only saves keep agentBaseHash stable and readable", field(readJson("task-7-human-save.json") ?? {}, ["agentBaseHashStable"]) === true && field(readJson("task-7-human-save.json") ?? {}, ["readable"]) === true, "task-7-human-save.json"),
    check("abandoned tokens burned, never reused", field(readJson("task-7-token-burn.json") ?? {}, ["burned"]) === true && readJson("task-12-token-burn.json")?.["burnedNeverReused"] === true, "task-7-token-burn.json + task-12-token-burn.json"),
    check("corrupt-restore failure log exists", nonEmpty("task-7-corrupt-restore.log"), "task-7-corrupt-restore.log"),
  ],
);

const discovery = readJson("task-9-discovery.json");
const agents = Array.isArray(discovery?.["agents"]) ? (discovery!["agents"] as Json[]) : [];
const canonicalPaths = new Set(agents.map((agent) => String(agent["canonical"])));
const contractSentinelOk = agents
  .filter((agent) => agent["status"] === "discovered")
  .every((agent) => field(agent, ["contract", "sentinel"]) === "VISUAL_LEARNING_CONTRACT_OK");
record(
  "MUST-8",
  "The same canonical skill directory is discoverable from Senpi, Codex, and Claude without duplicate writable copies",
  ["task-9-discovery.json", "task-9-collision.log", "task-9-install.json", "task-9-install-idempotent.json"],
  [
    check("discovery verdict PASS", discovery?.["verdict"] === "PASS", String(discovery?.["verdict"])),
    check("senpi, codex, claude all linked", agents.length >= 3 && agents.some((agent) => agent["client"] === "senpi") && agents.some((agent) => agent["client"] === "codex") && agents.some((agent) => agent["client"] === "claude"), `${agents.length} agents`),
    check("all links resolve to one canonical directory", canonicalPaths.size === 1 && canonicalPaths.has("/Users/billionjaepyo/.agents/skills/visual-learning"), JSON.stringify([...canonicalPaths])),
    check("executable sessions emitted identical contract sentinel", contractSentinelOk, "VISUAL_LEARNING_CONTRACT_OK"),
    check("Claude limited to structural link per user override", agents.some((agent) => agent["client"] === "claude" && agent["status"] === "structural-only") && String(discovery?.["executionPolicy"] ?? "").includes("user"), String(discovery?.["executionPolicy"])),
    check("collision refusal log exists", nonEmpty("task-9-collision.log"), "task-9-collision.log"),
  ],
);

record(
  "MUST-9",
  "Onboarding notes, prompt recipes, visual legend, fixture repository, sample project bundle, and real Obsidian desktop QA evidence",
  ["task-10-onboarding.json", "task-10-canonical-bootstrap.json", "task-10-sample-map.png", "task-10-git-readonly.json", "task-12/task-12-before.png", "task-12/task-12-after.png", "final-F3.json"],
  [
    check("onboarding receipt PASS", readJson("task-10-onboarding.json")?.["status"] === "PASS", "task-10-onboarding.json"),
    check("canonical sample bundle published", readJson("task-10-canonical-bootstrap.json")?.["operation"] !== undefined && nonEmpty("task-10-canonical-bootstrap.json"), "task-10-canonical-bootstrap.json"),
    check("sample map render exists as PNG", isPng("task-10-sample-map.png"), "task-10-sample-map.png"),
    check("existing-Git fixture read-only, records revision", readJson("task-10-git-readonly.json")?.["command"] !== undefined, "task-10-git-readonly.json"),
    check("desktop journey screenshots valid PNGs", isPng("task-12/task-12-before.png") && isPng("task-12/task-12-after.png"), "task-12 screenshots"),
    check("desktop app log non-empty", nonEmpty("task-12-app.log"), "task-12-app.log"),
  ],
);

// --- Per-task acceptance criteria. ---
const baselineDoc = readJson("task-1-baseline.json");
const vaults = Array.isArray(baselineDoc?.["vaults"]) ? (baselineDoc!["vaults"] as Json[]) : [];
const approved = readJson("task-1-approved-targets.json");
const approvedTargets = Array.isArray(approved?.["targets"]) ? (approved!["targets"] as Json[]) : [];
const symlinkTarget = approvedTargets.find((entry) => entry["path"] === "/usr/local/bin/obsidian");
const protectedDoc = readJson("task-1-protected-targets.json");
const protectedTargets = Array.isArray(protectedDoc?.["targets"]) ? (protectedDoc!["targets"] as Json[]) : [];
const happyOne = readText("task-1-happy-run-1.sha256");
const happyTwo = readText("task-1-happy-run-2.sha256");
record(
  "TASK-1",
  "Immutable baseline: sorted manifest of both vaults and approved/protected non-vault targets, canonical root first, older root read-only, no-op rerun stable, symlink-ancestor failure exits nonzero without output",
  ["task-1-baseline.json", "task-1-approved-targets.json", "task-1-protected-targets.json", "task-1-failure.log", "task-1-adversarial-verify.json", "task-1-happy-run-1.sha256", "task-1-happy-run-2.sha256"],
  [
    check("baseline manifest parses with valid digest", baselineDoc !== undefined && recompute?.baselineCoreDigest !== null, "see MANIFEST-RECOMPUTE"),
    check("canonical vault recorded first, older vault read-only", vaults.length === 2 && vaults[0]?.["canonical"] === true && vaults[1]?.["readonly"] === true, `${vaults.length} vaults`),
    check("approved targets include the CLI symlink contract", symlinkTarget !== undefined && Array.isArray(symlinkTarget["allowedFinalTypes"]) && (symlinkTarget["allowedFinalTypes"] as unknown[]).includes("symlink"), JSON.stringify(symlinkTarget?.["allowedFinalTypes"])),
    check("protected shell startup files baselined", protectedTargets.some((entry) => String(entry["path"]).endsWith(".zprofile")) && protectedTargets.some((entry) => String(entry["path"]).endsWith(".zshrc")), `${protectedTargets.length} protected targets`),
    check("no-op rerun digests identical", happyOne !== undefined && happyTwo !== undefined && happyOne === happyTwo, "happy-run sha256 equality"),
    check("symlink-adversarial failure evidence exists", nonEmpty("task-1-failure.log"), "task-1-failure.log"),
    check("independent adversarial verifier confirmed", readJson("task-1-adversarial-verify.json")?.["verdict"] === "confirmed", "task-1-adversarial-verify.json"),
  ],
);

const task2Comparison = readJson("task-2-final-comparison.json");
record(
  "TASK-2",
  "Runtime install preflight: signed installer receipt, no pre-existing process, user-writable symlink parent, exact official symlink, closed conditional CDP, read-only identity before mutation, plugin via official CLI with verified vault ID, BLOCKED on adversarial cases",
  ["task-2-obsidian-install.json", "task-2-cli-enable.json", "task-2-plugin-install.json", "task-2-preflight.json", "task-2-wrong-vault.log", "task-2-final-comparison.json"],
  [
    check("verified vault identity recorded from live app", typeof preflight?.["verifiedVaultId"] === "string" && preflight["verifiedVaultId"].length > 0, String(preflight?.["verifiedVaultId"])),
    check("plugin identity-bound to verified vault and expected path", field(pluginInstall ?? {}, ["identity", "verifiedVaultId"]) === preflight?.["verifiedVaultId"] && field(pluginInstall ?? {}, ["expectedVault"]) !== undefined, "plugin-install identity binding"),
    check("wrong-vault failure evidence exists", nonEmpty("task-2-wrong-vault.log"), "task-2-wrong-vault.log"),
    check("post-task comparator PASS", field(task2Comparison ?? {}, ["comparison", "verdict"]) === "PASS", "task-2-final-comparison.json"),
    check("adversarial verifier confirmed", String(readJson("task-2-adversarial-verify.json")?.["status"]) === "confirmed", "task-2-adversarial-verify.json"),
  ],
);

record(
  "TASK-3",
  "Isolated Engineering Atlas structure created from the descriptor-validated canonical path without Obsidian/CLI calls; validator asserts every required path, resolving links, parseable templates; no pre-existing file changed; invalid slug exits 2",
  ["task-3-structure.json", "task-3-invalid-slug.log", "task-3-after-comparison.json", "task-3-atlas-manifest.json"],
  [
    check("structure validator PASS with fixture instantiation", structure?.["verdict"] === "PASS" && Array.isArray(structure?.["projects"]) && (structure!["projects"] as unknown[]).length > 0, JSON.stringify(structure?.["projects"])),
    check("frontmatter parsed for every template", typeof structure?.["frontmatterParsed"] === "number" && Number(structure?.["frontmatterParsed"]) > 0, `frontmatterParsed=${String(structure?.["frontmatterParsed"])} files`),
    check("no-follow traversal used", structure?.["noFollowTraversal"] === true, String(structure?.["noFollowTraversal"])),
    check("invalid-slug failure log exists", nonEmpty("task-3-invalid-slug.log"), "task-3-invalid-slug.log"),
    check("post-task comparator PASS", field(readJson("task-3-after-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS", "task-3-after-comparison.json"),
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
  ["task-4-lock.json", "task-4-dependencies.json", "task-4-tests.log", "task-4-invalid-specs.json", "task-4-frozen-lock-failure.log", "task-4-done-claim.json"],
  [
    check("lockfile-only bootstrap recorded", Number(lockReceipt?.["lockfileOnlyRuns"] ?? 0) >= 1 && typeof field(lockReceipt ?? {}, ["lock", "sha256"]) === "string", `lockfileOnlyRuns=${String(lockReceipt?.["lockfileOnlyRuns"])}`),
    check("frozen install receipt with lock hash", dependencyReceipt?.["frozenInstall"] === true && typeof dependencyReceipt?.["lockSha256"] === "string" && (dependencyReceipt!["lockSha256"] as string).length === 64, "task-4-dependencies.json"),
    check("test log shows passing suite", passMatch !== null && Number(passMatch[1]) > 0 && failMatch !== null && Number(failMatch[1]) === 0, `pass=${passMatch?.[1] ?? "?"} fail=${failMatch?.[1] ?? "?"}`),
    check("invalid-spec and race drivers PASS", readJson("task-4-invalid-specs.json")?.["status"] === "PASS", "task-4-invalid-specs.json"),
    check("frozen-lock failure evidence exists", nonEmpty("task-4-frozen-lock-failure.log"), "task-4-frozen-lock-failure.log"),
  ],
);

record(
  "TASK-5",
  "Deterministic ExcalidrawAutomate renderer: same spec twice yields same semantic set/geometry, complete ownership metadata, SVG + companion note exports, plugin errors precede partial output, canonical vault unchanged",
  ["task-5-renderer.json", "task-5-gallery.png", "task-5-gallery.svg", "task-5-api-error.log", "task-5-canonical-unchanged.json", "task-5-final-comparison.json"],
  [
    check("two renders semantically identical", renderer?.["deterministic"] === true && renderer?.["status"] === "PASS", "deterministic=true"),
    check("gallery PNG valid", isPng("task-5-gallery.png"), "task-5-gallery.png"),
    check("injected plugin API error exits before partial output", field(renderer ?? {}, ["failure", "exitCode"]) === 4 && field(renderer ?? {}, ["failure", "outputsPresent"]) === false, JSON.stringify(renderer?.["failure"])),
    check("canonical vault unchanged receipt PASS", readJson("task-5-canonical-unchanged.json")?.["status"] === "PASS", "task-5-canonical-unchanged.json"),
    check("post-task comparator PASS", field(readJson("task-5-final-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS", "task-5-final-comparison.json"),
  ],
);

record(
  "TASK-6",
  "Annotation-preserving refresh: per-artifact lock, monotonic CAS token, selective in-place refresh by stable ID, deprecated anchors for removed referenced agent elements, human properties byte-identical, concurrent same-token refresh yields one success and one conflict",
  ["task-6-preservation.json", "task-6-independent-preservation.json", "task-6-concurrency.log", "task-6-20-race.json", "task-6-after-comparison.json"],
  [
    check("all four binding fixtures pass with stable IDs and exact human bytes", preservationCases.length >= 4 && preservationCases.every((entry) => entry["stableAgentIds"] === true && entry["humanExact"] === true), `${preservationCases.length} cases`),
    check("concurrency evidence exists", nonEmpty("task-6-concurrency.log") && readJson("task-6-20-race.json") !== undefined, "task-6-concurrency.log + task-6-20-race.json"),
    check("independent verifier reproduced result", independentPreservation !== undefined && sameValue(independentPreservation["cases"], preservation?.["cases"]), "independent run matches"),
    check("post-task comparator PASS", field(readJson("task-6-after-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS", "task-6-after-comparison.json"),
  ],
);

record(
  "TASK-7",
  "Atomic snapshots/restore/recovery: single authoritative STATE record, agentBaseHash stable across human saves, final CAS after close+flush, crash kill boundaries, tamper BLOCKED, token burn, ABA restore-as-new-token, reader recovery gating",
  ["task-7-transaction-matrix.json", "task-7-human-save.json", "task-7-aba.json", "task-7-token-burn.json", "task-7-corrupt-restore.log", "task-7-tests.log"],
  [
    check("transaction matrix PASS with all invariants", matrix?.["status"] === "PASS" && matrix?.["singleAuthoritativeState"] !== false && matrix?.["readerRecoveryGate"] !== false, "task-7-transaction-matrix.json"),
    check("human save changes full hash but not agentBaseHash", field(readJson("task-7-human-save.json") ?? {}, ["fullHashChanged"]) === true && field(readJson("task-7-human-save.json") ?? {}, ["agentBaseHashStable"]) === true, "task-7-human-save.json"),
    check("token-burn invariant holds", field(readJson("task-7-token-burn.json") ?? {}, ["burned"]) === true && field(readJson("task-7-token-burn.json") ?? {}, ["nextToken"]) !== undefined, "task-7-token-burn.json"),
    check("transaction test log exists", nonEmpty("task-7-tests.log"), "task-7-tests.log"),
  ],
);

const invalidEvidence = readText("task-8-invalid-evidence.log");
record(
  "TASK-8",
  "Evidence-backed templates: every artifact kind validates and renders, factual elements resolve to fixture paths/symbols, inference/question styling machine-detectable, dense fixtures split into linked views passing overlap/clip/orphan/dangling checks",
  ["task-8-gallery.json", "task-8-gallery.png", "task-8-invalid-evidence.log", "task-8-tests.log", "task-8-after-comparison.json"],
  [
    check("gallery covers every kind with valid PNG", gallery?.["status"] === "PASS" && isPng("task-8-gallery.png"), `views=${String(gallery?.["totalViews"])}`),
    check("invalid-evidence failure path exercised", invalidEvidence !== undefined && invalidEvidence.length > 0, "task-8-invalid-evidence.log"),
    check("template/layout tests pass", /(\d+) pass/.exec(readText("task-8-tests.log") ?? "") !== null && /0 fail/.test(readText("task-8-tests.log") ?? ""), "task-8-tests.log"),
    check("post-task comparator PASS", field(readJson("task-8-after-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS", "task-8-after-comparison.json"),
  ],
);

record(
  "TASK-9",
  "One shared skill across agents: canonical SKILL.md, executable discovery by realpath, identical contract sentinel from fresh sessions, descriptor-safe link installation, collision/symlink-swap refusal",
  ["task-9-discovery.json", "task-9-collision.log", "task-9-install.json", "task-9-install-idempotent.json", "task-9-after-comparison.json"],
  [
    check("discovery PASS with contract sentinel", discovery?.["verdict"] === "PASS" && field(discovery ?? {}, ["contract", "sentinel"]) === "VISUAL_LEARNING_CONTRACT_OK", "task-9-discovery.json"),
    check("install idempotent", readJson("task-9-install-idempotent.json") !== undefined && readJson("task-9-install.json") !== undefined, "task-9-install*.json"),
    check("collision refusal evidence exists", nonEmpty("task-9-collision.log"), "task-9-collision.log"),
    check("post-task comparator PASS", field(readJson("task-9-after-comparison.json") ?? {}, ["comparison", "verdict"]) === "PASS", "task-9-after-comparison.json"),
  ],
);

record(
  "TASK-10",
  "Onboarding sample and repeatable workflow: isolated bootstrap from plain non-Git fixture with commit: null, all walkthrough commands, idempotent reruns, read-only Git fixture revision, sample copied to canonical Atlas only after isolated success; plan-named task-10-walkthrough.log was superseded by task-10-isolated.json under the user-approved default-profile substitution",
  ["task-10-isolated.json", "task-10-canonical-bootstrap.json", "task-10-git-readonly.json", "task-10-sample-map.png", "task-10-failure.log", "task-10-current-manifest.json", "task-10-onboarding.json"],
  [
    check("isolated walkthrough PASS across full command surface", isolated?.["status"] === "PASS" && ["init", "create", "extend", "refresh", "validate", "open", "restore"].every((command) => commandsRequested.includes(command)), String(isolated?.["status"])),
    check("bootstrap idempotent across reruns", Array.isArray(isolated?.["bootstrapRuns"]) && (isolated!["bootstrapRuns"] as unknown[]).length >= 2, `bootstrapRuns=${Array.isArray(isolated?.["bootstrapRuns"]) ? (isolated!["bootstrapRuns"] as unknown[]).length : 0} entries`),
    check("Git fixture read-only revision recorded", readJson("task-10-git-readonly.json")?.["commit"] !== undefined || readJson("task-10-git-readonly.json")?.["command"] !== undefined, "task-10-git-readonly.json"),
    check("canonical sample bundle receipt exists", readJson("task-10-canonical-bootstrap.json")?.["bundlePath"] !== undefined, "task-10-canonical-bootstrap.json"),
    check("failure fixtures rejected", nonEmpty("task-10-failure.log"), "task-10-failure.log"),
    check("current manifest comparator PASS", field(readJson("task-10-current-manifest.json") ?? {}, ["comparison", "verdict"]) === "PASS", "task-10-current-manifest.json"),
  ],
);

const network = readJson("task-11-network.json");
const control = (network?.["control"] ?? {}) as Json;
const probes = Array.isArray(control["probes"]) ? (control["probes"] as Json[]) : [];
const sentinel = (network?.["sentinel"] ?? {}) as Json;
record(
  "TASK-11",
  "Offline privacy: sandbox-exec kernel containment proven by denied network controls, cryptographically random sentinel retained only as SHA-256, tested commands sandbox-launched by descent, no plaintext leakage outside designated file",
  ["task-11-network.json", "task-11-sentinel-scan.log", "task-11-sandbox-denial.log", "task-11-current-baseline.json", "task-11-network-verifier.json"],
  [
    check("sandbox-exec profile used", field(network ?? {}, ["sandbox", "execPath"]) === "/usr/bin/sandbox-exec" && String(field(network ?? {}, ["sandbox", "profileContent"]) ?? "").includes("deny network"), "task-11-network.json sandbox"),
    check("injected network controls denied inside sandbox", control["proven"] === true && probes.length > 0 && probes.filter((probe) => probe["where"] === "inside-sandbox").every((probe) => String(probe["classification"]).startsWith("denied")) && probes.some((probe) => probe["where"] === "outside-sandbox" && String(probe["classification"]) === "not-denied"), `${probes.length} probes (inside denied, outside contrast not-denied)`),
    check("sentinel plaintext never retained", sentinel["plaintextRetained"] === false && sentinel["argvLeakFree"] === true && sentinel["envLeakFree"] === true && typeof sentinel["sha256"] === "string", "sentinel SHA-256-only"),
    check("process descent proven inside containment", field(network ?? {}, ["descent", "containmentProbe", "descentProven"]) === true, "descent.containmentProbe.descentProven"),
    check("full CLI command surface covered offline", Array.isArray(network?.["commandsVerified"]) && ["preflight", "init", "create", "extend", "refresh", "validate", "open", "restore"].every((command) => (network!["commandsVerified"] as unknown[]).map(String).includes(command)), JSON.stringify(network?.["commandsVerified"])),
    check("sentinel scan and denial logs exist", nonEmpty("task-11-sentinel-scan.log") && nonEmpty("task-11-sandbox-denial.log"), "task-11 logs"),
    check("comparator PASS", field(readJson("task-11-current-baseline.json") ?? {}, ["comparison", "verdict"]) === "PASS", "task-11-current-baseline.json"),
  ],
);

const tokenBurn = readJson("task-12-token-burn.json");
record(
  "TASK-12",
  "Real Obsidian annotation-preservation journey: working-copy-only opens, human text/freehand saves with immutable hashes unchanged, concurrent-save refresh CAS-aborts with burned token then retries fresh, restore-as-new-token, restart, SVG embedding, screenshots, final Scope audit",
  ["task-12-app.log", "task-12/task-12-before.png", "task-12/task-12-after.png", "task-12-token-burn.json", "task-12-final-manifest.json", "task-12-adversarial-verify.json"],
  [
    check("app journey log non-empty", nonEmpty("task-12-app.log"), "task-12-app.log"),
    check("before/after screenshots valid PNGs", isPng("task-12/task-12-before.png") && isPng("task-12/task-12-after.png"), "task-12 screenshots"),
    check("CAS abort burned tokens, never reused, retried fresh", tokenBurn?.["status"] === "PASS" && tokenBurn?.["burnedNeverReused"] === true && Array.isArray(tokenBurn?.["retryTokens"]) && (tokenBurn!["retryTokens"] as unknown[]).length > 0, `burned=${JSON.stringify(tokenBurn?.["burnedTokens"])}`),
    check("final manifest independently recomputed PASS", recompute?.ok === true && field(finalDocument ?? {}, ["comparison", "verdict"]) === "PASS", "task-12-final-manifest.json"),
    check("adversarial verifier confirmed with recorded non-blocking notes", String(field(readJson("task-12-adversarial-verify.json") ?? {}, ["overall"])) === "confirmed", "task-12-adversarial-verify.json"),
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
    baseline: baselinePath,
    final: finalPath,
    requireTasks: requireTasksSpec,
    resolvedRequiredTasks: requiredTasks,
  },
  finalWave: {
    f2: { artifact: "final-F2.json", verdict: f2?.["verdict"] },
    f3: { artifact: "final-F3.json", verdict: f3?.["verdict"], casAbort: field(f3 ?? {}, ["casAbort"]) },
    ordering: "F1 executed after F2 and F3 per the final verification wave",
  },
  ledger: {
    path: ledgerPath,
    confirmedTasks: [...confirmedLedgerTasks].sort(),
  },
  manifestRecompute: {
    method: "read-only reimplementation of the task-1 comparator (canonical sorted-JSON SHA-256 core digests, stable descriptor comparison, byte-identity with directory type/mode tolerance, community-plugins add-only semantics, Engineering Atlas + runtime-allowlist-only new entries)",
    baselineCoreDigest: recompute?.baselineCoreDigest ?? null,
    finalCoreDigest: recompute?.finalCoreDigest ?? null,
    preExistingCanonicalEntries: recompute?.preExistingCount ?? null,
    newCanonicalEntries: recompute?.newEntryCount ?? null,
    allowedSemanticDeltas: recompute?.allowedSemanticDeltas ?? [],
    verdict: recompute?.ok === true ? "PASS" : "FAIL",
    notes: recompute?.notes ?? ["manifests unreadable"],
  },
  criteria,
  knownNonBlockingNotes: [
    "Empty .rwlock production-leak hygiene: an empty per-artifact lock root directory can remain in production after lock release (task-12 verifier note); lock markers themselves are pruned and coherency/burn contracts are covered by task-7 tests.",
    "Todo 9 user-override: Claude execution excluded (no subscription); structural link/realpath/hash verification only, recorded in task-9-discovery.json executionPolicy.",
    "Todo 10/12 user-approved default-profile substitutions: production routes use Obsidian's default profile instead of dedicated isolated profiles; task-10 open substitution and task-12/F3 clone journey substitutions are recorded in their receipts.",
    "Task-12 rehearsal-phase token numbers differ from the final recorded journey (cas-26/cas-30 burns, cas-28/cas-29 commits); receipts, app.log, and vault state are mutually consistent.",
    "F3 substitutions under user constraints recorded in final-F3.json adaptation (clone create/open/restart/annotate/visual).",
  ],
  verdict: failures.length === 0 ? "APPROVE" : "REJECT",
  reasons: failures,
};
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
const parseCheck: { verdict?: unknown; reasons?: unknown } = JSON.parse(readFileSync(outPath, "utf8")) as { verdict?: unknown; reasons?: unknown };
if (parseCheck.verdict !== "APPROVE" && parseCheck.verdict !== "REJECT") throw new Error("plan-compliance receipt failed parse-check");
if (statSync(outPath).size === 0) throw new Error("plan-compliance receipt is empty");
process.stdout.write(`${JSON.stringify({ verdict: parseCheck.verdict, reasons: failures, criteriaChecked: criteria.length, out: outPath })}\n`);
if (parseCheck.verdict !== "APPROVE") process.exit(1);
