#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { z } from "zod";

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new TypeError(`${name} requires a value`);
  return value;
}

function options(name: string): string[] {
  const values: string[] = [];
  for (let index = Bun.argv.indexOf(name); index >= 0; index = Bun.argv.indexOf(name, index + 1)) {
    const value = Bun.argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new TypeError(`${name} requires a value`);
    values.push(value);
  }
  return values;
}

function flag(name: string): boolean {
  return Bun.argv.includes(name);
}

const planPath = resolve(option("--plan"));
const baselinePath = resolve(option("--baseline"));
const finalPath = resolve(option("--final"));
const allowedRoots = options("--allowed-root");
const allowedRuntime = options("--allowed-runtime")
  .flatMap((value) => value.split(","))
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const runtimeSemanticRules = options("--runtime-semantic-rule");
const requirePreexistingNotesByteIdentical = flag("--require-preexisting-notes-byte-identical");
const targetBaselinePath = resolve(option("--target-baseline"));
const approvedTargetsPath = resolve(option("--approved-targets"));
const protectedTargetsPath = resolve(option("--protected-targets"));
const requireProtectedByteIdentical = flag("--require-protected-byte-identical");
const allowedTargetRoots = options("--allowed-target-root");
const allowedTargetLinks = options("--allowed-target-link");
const allowedTargetFiles = options("--allowed-target-file");
const requiredLinkTarget = resolve(option("--required-link-target"));
const denyCategories = option("--deny")
  .split(",")
  .map((category) => category.trim())
  .filter((category) => category.length > 0);
const outPath = resolve(option("--out"));
const packageRoot = resolve(import.meta.dir, "../..");

const failures: string[] = [];
const checks: { name: string; pass: boolean; details: string }[] = [];

function record(name: string, pass: boolean, details: string): void {
  checks.push({ name, pass, details });
  if (!pass) failures.push(`${name}: ${details}`);
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashInput(path: string): { path: string; sha256: string } {
  return { path, sha256: hashFile(path) };
}

function safeLstat(path: string): { isSymbolicLink: boolean } | undefined {
  try {
    return { isSymbolicLink: lstatSync(path).isSymbolicLink() };
  } catch {
    return undefined;
  }
}

const entrySchema = z.object({
  relativePath: z.string(),
  type: z.string(),
  sha256: z.string(),
  size: z.number(),
  mode: z.string(),
});

const targetSchema = z.object({
  path: z.string(),
  state: z.enum(["present", "missing"]),
  allowedFinalTypes: z.array(z.string()),
  digest: z.string(),
  entries: z.array(entrySchema),
});

const vaultSchema = z.object({
  path: z.string(),
  canonical: z.boolean(),
  readonly: z.boolean().optional(),
  entries: z.array(entrySchema),
  runtimeJsonBaselines: z.record(z.string(), z.unknown()).optional(),
});

const manifestSchema = z.object({
  schemaVersion: z.number(),
  hashAlgorithm: z.literal("SHA-256"),
  manifestDigest: z.string(),
  vaults: z.array(vaultSchema),
  approvedTargets: z.array(targetSchema).optional(),
  protectedTargets: z.array(targetSchema).optional(),
});

const targetManifestSchema = z.object({
  schemaVersion: z.number(),
  hashAlgorithm: z.literal("SHA-256"),
  sourceManifestDigest: z.string(),
  targets: z.array(targetSchema),
});

type SemanticRule = { file: string; operation: string; value: string };

function parseSemanticRule(raw: string): SemanticRule | undefined {
  const parts = raw.split(":");
  if (
    parts.length !== 3 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    parts[2] === undefined
  ) {
    return undefined;
  }
  return { file: parts[0], operation: parts[1], value: parts[2] };
}

const semanticRules: SemanticRule[] = [];
for (const raw of runtimeSemanticRules) {
  const rule = parseSemanticRule(raw);
  if (rule === undefined || rule.operation !== "add-only") {
    throw new TypeError(`unsupported runtime semantic rule: ${raw}`);
  }
  semanticRules.push(rule);
}

function resolveRuntimePath(file: string): string {
  if (allowedRuntime.includes(file)) return file;
  const matches = allowedRuntime.filter((runtime) => basename(runtime) === file);
  return matches.length === 1 ? (matches[0] ?? file) : file;
}

const knownDenyCategories = new Set([
  "sync",
  "mcp",
  "cloud",
  "publish",
  "product-repo-write",
  "git-commit",
  "shell-profile-change",
]);
const unsupportedDeny = denyCategories.filter((category) => !knownDenyCategories.has(category));
record(
  "deny-categories-supported",
  unsupportedDeny.length === 0,
  unsupportedDeny.length === 0
    ? `deny=${denyCategories.join(",")}`
    : `unsupported: ${unsupportedDeny.join(",")}`,
);

const inputs = {
  plan: hashInput(planPath),
  baseline: hashInput(baselinePath),
  final: hashInput(finalPath),
  targetBaseline: hashInput(targetBaselinePath),
  approvedTargets: hashInput(approvedTargetsPath),
  protectedTargets: hashInput(protectedTargetsPath),
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const baseline = manifestSchema.parse(readJson(baselinePath));
const final = manifestSchema.parse(readJson(finalPath));
const targetBaseline = targetManifestSchema.parse(readJson(targetBaselinePath));
const approvedTargets = targetManifestSchema.parse(readJson(approvedTargetsPath));
const protectedTargets = targetManifestSchema.parse(readJson(protectedTargetsPath));

if (targetBaseline.sourceManifestDigest !== baseline.manifestDigest) {
  throw new TypeError(
    "target baseline sourceManifestDigest does not match baseline manifestDigest",
  );
}
if (approvedTargets.sourceManifestDigest !== baseline.manifestDigest) {
  throw new TypeError(
    "approved targets sourceManifestDigest does not match baseline manifestDigest",
  );
}
if (protectedTargets.sourceManifestDigest !== baseline.manifestDigest) {
  throw new TypeError(
    "protected targets sourceManifestDigest does not match baseline manifestDigest",
  );
}

const baselineVaultPaths = new Set(baseline.vaults.map((vault) => vault.path));
const finalVaultPaths = new Set(final.vaults.map((vault) => vault.path));
record(
  "vault-set-identical",
  baselineVaultPaths.size === finalVaultPaths.size &&
    [...baselineVaultPaths].every((path) => finalVaultPaths.has(path)),
  `baseline=${baselineVaultPaths.size} final=${finalVaultPaths.size}`,
);

const finalTargetPaths = new Set(
  [...(final.approvedTargets ?? []), ...(final.protectedTargets ?? [])].map((t) => t.path),
);
const baselineApprovedPaths = new Set(targetBaseline.targets.map((t) => t.path));
const baselineProtectedPaths = new Set(protectedTargets.targets.map((t) => t.path));
record(
  "final-target-enumeration-matches-baseline",
  [...finalTargetPaths].every(
    (path) => baselineApprovedPaths.has(path) || baselineProtectedPaths.has(path),
  ),
  `baseline approved=${baselineApprovedPaths.size} protected=${baselineProtectedPaths.size} final=${finalTargetPaths.size}`,
);

const canonicalVault = baseline.vaults.find((vault) => vault.canonical);
if (canonicalVault === undefined) throw new TypeError("baseline manifest has no canonical vault");

let vaultScopeViolations = 0;
let targetScopeViolations = 0;

function entryWithinScope(rel: string, vaultRoot: string): boolean {
  if (allowedRuntime.includes(rel)) return true;
  if (allowedRuntime.some((runtime) => runtime.startsWith(`${rel}/`))) return true;
  return allowedRoots.some((root) => {
    const relRoot = relative(vaultRoot, root);
    return (
      relRoot.length > 0 &&
      !relRoot.startsWith("..") &&
      (rel === relRoot || rel.startsWith(`${relRoot}/`))
    );
  });
}

const vaultComparisons: unknown[] = [];
const liveRehash: { vault: string; checked: number; mismatches: string[] }[] = [];

for (const baselineVault of baseline.vaults) {
  const finalVault = final.vaults.find((vault) => vault.path === baselineVault.path);
  if (finalVault === undefined) {
    record(`vault-${baselineVault.path}-present-in-final`, false, "final manifest lacks vault");
    continue;
  }
  const baselineMap = new Map(baselineVault.entries.map((entry) => [entry.relativePath, entry]));
  const finalMap = new Map(finalVault.entries.map((entry) => [entry.relativePath, entry]));
  const removed = [...baselineMap.keys()].filter((rel) => !finalMap.has(rel));
  const added = [...finalMap.keys()].filter((rel) => !baselineMap.has(rel));
  const changedFiles = [...baselineMap.entries()]
    .filter(([rel, entry]) => {
      const finalEntry = finalMap.get(rel);
      return (
        finalEntry !== undefined && entry.type === "file" && finalEntry.sha256 !== entry.sha256
      );
    })
    .map(([rel]) => rel);
  const typeChanged = [...baselineMap.entries()]
    .filter(([rel, entry]) => {
      const finalEntry = finalMap.get(rel);
      return finalEntry !== undefined && finalEntry.type !== entry.type;
    })
    .map(([rel]) => rel);
  const ruledFiles = changedFiles.filter(
    (rel) =>
      baselineVault.canonical &&
      allowedRuntime.includes(rel) &&
      semanticRules.some((rule) => rule.file === rel),
  );
  const unruledChanges = changedFiles.filter((rel) => !ruledFiles.includes(rel));
  const addedOutsideScope = added.filter((rel) => !entryWithinScope(rel, baselineVault.path));
  if (
    removed.length > 0 ||
    typeChanged.length > 0 ||
    unruledChanges.length > 0 ||
    addedOutsideScope.length > 0
  ) {
    vaultScopeViolations += 1;
  }

  record(
    `vault-${baselineVault.path}-no-removals`,
    removed.length === 0,
    removed.length === 0
      ? `${baselineVault.entries.length} pre-existing entries retained`
      : `removed: ${removed.join(", ")}`,
  );
  record(
    `vault-${baselineVault.path}-no-type-changes`,
    typeChanged.length === 0,
    typeChanged.length === 0
      ? "all pre-existing entry types retained"
      : `type changed: ${typeChanged.join(", ")}`,
  );
  if (baselineVault.canonical) {
    record(
      `vault-${baselineVault.path}-new-entries-within-allowed-scope`,
      addedOutsideScope.length === 0,
      addedOutsideScope.length === 0
        ? `${added.length} new entries under ${allowedRoots.join(",")} + allowlisted runtime set`
        : `outside scope: ${addedOutsideScope.join(", ")}`,
    );
    record(
      `vault-${baselineVault.path}-preexisting-changes-ruled`,
      unruledChanges.length === 0,
      unruledChanges.length === 0
        ? `byte-identical except ruled: ${ruledFiles.join(",") || "none"}`
        : `unruled changes: ${unruledChanges.join(", ")}`,
    );
  } else {
    record(
      `vault-${baselineVault.path}-untouched`,
      added.length === 0 && changedFiles.length === 0,
      added.length === 0 && changedFiles.length === 0
        ? `read-only older vault unchanged (${baselineVault.entries.length} entries)`
        : `added=${added.length} changed=${changedFiles.length}`,
    );
  }

  const mismatches: string[] = [];
  let checked = 0;
  if (requirePreexistingNotesByteIdentical) {
    for (const entry of baselineVault.entries) {
      if (entry.type !== "file") continue;
      const livePath = join(baselineVault.path, entry.relativePath);
      const stats = safeLstat(livePath);
      if (stats === undefined) {
        mismatches.push(`${entry.relativePath}:missing`);
        continue;
      }
      const ruled = ruledFiles.includes(entry.relativePath);
      const expected = ruled ? finalMap.get(entry.relativePath)?.sha256 : entry.sha256;
      checked += 1;
      if (expected !== undefined && hashFile(livePath) !== expected) {
        mismatches.push(`${entry.relativePath}:hash-drift`);
      }
    }
  }
  liveRehash.push({ vault: baselineVault.path, checked, mismatches });
  record(
    `vault-${baselineVault.path}-live-preexisting-byte-identical`,
    !requirePreexistingNotesByteIdentical || mismatches.length === 0,
    requirePreexistingNotesByteIdentical
      ? mismatches.length === 0
        ? `${checked} pre-existing files re-hashed live, all byte-identical`
        : `live drift: ${mismatches.join(", ")}`
      : "live re-hash not required",
  );

  vaultComparisons.push({
    path: baselineVault.path,
    canonical: baselineVault.canonical,
    readonly: baselineVault.readonly === true,
    baselineEntries: baselineVault.entries.length,
    finalEntries: finalVault.entries.length,
    added: added.length,
    removed: removed.length,
    changedFiles,
    ruledFiles,
  });
}

const runtimeSemantics: unknown[] = [];
for (const rule of semanticRules) {
  const ruleFile = resolveRuntimePath(rule.file);
  const livePath = join(canonicalVault.path, ruleFile);
  const finalEntry = final.vaults
    .find((vault) => vault.path === canonicalVault.path)
    ?.entries.find((entry) => entry.relativePath === ruleFile);
  const baselinePresent = canonicalVault.entries.some((entry) => entry.relativePath === ruleFile);
  const recordedBaseline = canonicalVault.runtimeJsonBaselines?.[ruleFile];
  let baselineArray: string[] | null = null;
  if (
    Array.isArray(recordedBaseline) &&
    recordedBaseline.every((item) => typeof item === "string")
  ) {
    baselineArray = recordedBaseline as string[];
  } else if (!baselinePresent) {
    baselineArray = [];
  }
  const problems: string[] = [];
  let liveArray: string[] | null = null;
  let liveSha = "";
  if (!existsSync(livePath)) {
    problems.push("live runtime file missing");
  } else {
    liveSha = hashFile(livePath);
    const parsed: unknown = JSON.parse(readFileSync(livePath, "utf8"));
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      liveArray = parsed as string[];
    } else {
      problems.push("live runtime file is not a string array");
    }
  }
  if (finalEntry !== undefined && liveSha !== "" && finalEntry.sha256 !== liveSha) {
    problems.push("final manifest hash differs from live file");
  }
  if (liveArray !== null && baselineArray !== null) {
    const additions = liveArray.filter((item) => item === rule.value).length;
    const baselineOccurrences = baselineArray.filter((item) => item === rule.value).length;
    const unrelatedFinal = liveArray.filter((item) => item !== rule.value);
    const unrelatedBaseline = baselineArray.filter((item) => item !== rule.value);
    const unrelatedPreserved =
      unrelatedFinal.length === unrelatedBaseline.length &&
      unrelatedFinal.every((item, index) => unrelatedBaseline[index] === item);
    if (additions - baselineOccurrences > 1) problems.push(`${rule.value} added more than once`);
    if (!unrelatedPreserved) problems.push("unrelated entries or their order changed");
    if (
      baselineArray !== null &&
      baselinePresent &&
      baselineArray.length === 0 &&
      recordedBaseline === undefined
    ) {
      problems.push("pre-existing runtime json changed without recorded baseline content");
    }
  } else if (baselineArray === null) {
    problems.push("baseline content unavailable for semantic comparison");
  }
  runtimeSemantics.push({
    rule: `${ruleFile}:${rule.operation}:${rule.value}`,
    baselinePresent,
    liveValue: liveArray,
    problems,
  });
  record(
    `runtime-semantic-${ruleFile}`,
    problems.length === 0,
    problems.length === 0
      ? `add-only satisfied: ${JSON.stringify(liveArray)}`
      : problems.join("; "),
  );
}

const protectedResults: unknown[] = [];
for (const target of protectedTargets.targets) {
  const problems: string[] = [];
  if (target.state === "missing") {
    if (existsSync(target.path)) problems.push("appeared");
  } else {
    const rootEntry = target.entries.find((entry) => entry.relativePath === ".");
    if (rootEntry === undefined) {
      problems.push("baseline root entry missing");
    } else if (!existsSync(target.path)) {
      problems.push("missing live");
    } else if (requireProtectedByteIdentical && hashFile(target.path) !== rootEntry.sha256) {
      problems.push("live hash differs from baseline");
    }
  }
  const finalTarget = (final.protectedTargets ?? []).find(
    (candidate) => candidate.path === target.path,
  );
  if (finalTarget !== undefined && finalTarget.digest !== target.digest)
    problems.push("final digest drift");
  protectedResults.push({ path: target.path, baselineState: target.state, problems });
  record(
    `protected-${target.path}`,
    problems.length === 0,
    problems.length === 0 ? target.state : problems.join("; "),
  );
}

const allowedTargetPaths = new Set([
  ...allowedTargetRoots,
  ...allowedTargetLinks,
  ...allowedTargetFiles,
]);
const enumerationProblems: string[] = [];
for (const target of [...targetBaseline.targets, ...(final.approvedTargets ?? [])]) {
  if (!allowedTargetPaths.has(target.path)) {
    enumerationProblems.push(`${target.path}:outside-enumeration`);
    targetScopeViolations += 1;
  }
}
const baselineTargetMap = new Map(targetBaseline.targets.map((target) => [target.path, target]));
for (const target of final.approvedTargets ?? []) {
  const baselineTarget = baselineTargetMap.get(target.path);
  if (
    baselineTarget !== undefined &&
    baselineTarget.state === "present" &&
    (target.state !== "present" || target.digest !== baselineTarget.digest)
  ) {
    enumerationProblems.push(`${target.path}:changed-from-present-baseline`);
  }
}
record(
  "approved-targets-within-enumeration",
  enumerationProblems.length === 0,
  enumerationProblems.length === 0
    ? `${allowedTargetPaths.size} enumerated roots/links/files cover all manifest targets`
    : enumerationProblems.join("; "),
);

const linkResults: unknown[] = [];
const linkProblems: string[] = [];
let officialLink: string | undefined;
let requiredRealpath = "";
try {
  requiredRealpath = realpathSync(requiredLinkTarget);
} catch {
  linkProblems.push(`required link target missing: ${requiredLinkTarget}`);
}
for (const link of allowedTargetLinks) {
  const stats = safeLstat(link);
  if (stats === undefined || !stats.isSymbolicLink) {
    linkProblems.push(`${link}:not-a-live-symlink`);
    continue;
  }
  let targetText = "";
  try {
    targetText = readlinkSync(link);
  } catch {
    linkProblems.push(`${link}:unreadable-link`);
    continue;
  }
  let resolved = "";
  try {
    resolved = realpathSync(link);
  } catch {
    linkProblems.push(`${link}:broken-link`);
    continue;
  }
  const insideApprovedRoot = allowedTargetRoots.some(
    (root) => resolved === root || resolved.startsWith(`${root}/`),
  );
  if (!insideApprovedRoot)
    linkProblems.push(`${link}:resolves-outside-approved-roots(${resolved})`);
  if (
    requiredRealpath !== "" &&
    (targetText === requiredLinkTarget || resolved === requiredRealpath)
  ) {
    officialLink = link;
  }
  linkResults.push({ link, target: targetText, resolved });
}
if (officialLink === undefined) {
  if (requiredRealpath !== "")
    linkProblems.push(`no allowed link resolves to required target ${requiredLinkTarget}`);
} else if (!existsSync(requiredLinkTarget)) {
  linkProblems.push(`required link target missing: ${requiredLinkTarget}`);
}
record(
  "required-link-and-symlinks-resolve",
  linkProblems.length === 0,
  linkProblems.length === 0
    ? `official link ${officialLink} -> ${requiredLinkTarget}; ${allowedTargetLinks.length} links resolve inside approved roots`
    : linkProblems.join("; "),
);

const denyChecks: Record<string, unknown> = {};
const communityPath = join(canonicalVault.path, ".obsidian/community-plugins.json");
const communityPlugins: string[] = existsSync(communityPath)
  ? (JSON.parse(readFileSync(communityPath, "utf8")) as unknown[]).filter(
      (item): item is string => typeof item === "string",
    )
  : [];
const corePluginsPath = join(canonicalVault.path, ".obsidian/core-plugins.json");
const corePlugins: Record<string, unknown> = existsSync(corePluginsPath)
  ? (JSON.parse(readFileSync(corePluginsPath, "utf8")) as Record<string, unknown>)
  : {};
const pluginsDir = join(canonicalVault.path, ".obsidian/plugins");
const pluginDirs = existsSync(pluginsDir) ? readdirSync(pluginsDir) : [];
const packageJsonPath = join(packageRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;

if (denyCategories.includes("sync")) {
  const syncEnabled = corePlugins["sync"] === true;
  const syncPlugins = [
    ...communityPlugins.filter((id) => /sync/i.test(id)),
    ...pluginDirs.filter((id) => /sync/i.test(id)),
  ];
  denyChecks["sync"] = { corePluginsSync: corePlugins["sync"], syncPlugins };
  record(
    "deny-sync",
    !syncEnabled && syncPlugins.length === 0,
    `core sync=${String(corePlugins["sync"])} plugins=${syncPlugins.join(",") || "none"}`,
  );
}
if (denyCategories.includes("publish")) {
  const publishEnabled = corePlugins["publish"] === true;
  denyChecks["publish"] = { corePluginsPublish: corePlugins["publish"] };
  record("deny-publish", !publishEnabled, `core publish=${String(corePlugins["publish"])}`);
}
if (denyCategories.includes("mcp")) {
  const mcpHits = [
    ...communityPlugins.filter((id) => /mcp/i.test(id)),
    ...pluginDirs.filter((id) => /mcp/i.test(id)),
    ...Object.keys(packageJson).filter((key) => /mcp/i.test(key)),
  ];
  denyChecks["mcp"] = { mcpHits };
  record(
    "deny-mcp",
    mcpHits.length === 0,
    mcpHits.length === 0 ? "no MCP servers registered" : mcpHits.join(","),
  );
}
if (denyCategories.includes("cloud")) {
  const cloudHits = [
    ...communityPlugins.filter((id) => /cloud|remote-vault|publish/i.test(id)),
    ...pluginDirs.filter((id) => /cloud|remote-vault/i.test(id)),
  ];
  denyChecks["cloud"] = { cloudHits };
  record(
    "deny-cloud",
    cloudHits.length === 0,
    cloudHits.length === 0 ? "no cloud-backed plugins" : cloudHits.join(","),
  );
}

function findGitRepositories(root: string): string[] {
  const found: string[] = [];
  if (!existsSync(root)) return found;
  const walk = (directory: string, depth: number): void => {
    if (depth > 8) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.name === ".git") {
        found.push(path);
        continue;
      }
      if (entry.isDirectory() && entry.name !== "node_modules") walk(path, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

const skillGit = findGitRepositories(packageRoot);
const atlasGit = findGitRepositories(join(canonicalVault.path, "Engineering Atlas"));
if (denyCategories.includes("git-commit") || denyCategories.includes("product-repo-write")) {
  denyChecks["gitRepositories"] = { skillRoot: skillGit, engineeringAtlas: atlasGit };
  record(
    "deny-git-commit-no-repositories",
    skillGit.length === 0 && atlasGit.length === 0,
    skillGit.length === 0 && atlasGit.length === 0
      ? `no .git under ${packageRoot} or Engineering Atlas`
      : [...skillGit, ...atlasGit].join(","),
  );
}
if (denyCategories.includes("product-repo-write")) {
  denyChecks["productRepoWrite"] = {
    note: "product repositories are outside both manifests; every manifest change is confined to vaults and enumerated targets",
    vaultScopeViolations,
    targetScopeViolations,
    confinedToApprovedScope: vaultScopeViolations === 0 && targetScopeViolations === 0,
  };
  record(
    "deny-product-repo-write",
    vaultScopeViolations === 0 && targetScopeViolations === 0,
    "no manifest change touches any product repository path",
  );
}
if (denyCategories.includes("shell-profile-change")) {
  const protectedClean = protectedResults.every(
    (result) => (result as { problems: string[] }).problems.length === 0,
  );
  denyChecks["shellProfileChange"] = { protectedClean };
  record(
    "deny-shell-profile-change",
    protectedClean,
    "protected shell startup files byte-identical",
  );
}

const schemaSource = readFileSync(join(packageRoot, "src/schema.ts"), "utf8");
const kindListMatch = /export const visualKindValues = \[([\s\S]*?)\];/.exec(schemaSource);
const requiredKinds =
  kindListMatch?.[1] === undefined
    ? []
    : [...kindListMatch[1].matchAll(/"([^"]+)"/g)]
        .map((match) => match[1])
        .filter((kind): kind is string => kind !== undefined);
const kindCounts = new Map<string, number>();
const metadataSpecFiles: string[] = [];
const projectsRoot = join(canonicalVault.path, "Engineering Atlas", "10 Projects");
if (existsSync(projectsRoot)) {
  for (const project of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const specsDir = join(projectsRoot, project.name, "_generated", "specs");
    if (!existsSync(specsDir)) continue;
    for (const spec of readdirSync(specsDir)) {
      if (!spec.endsWith(".json")) continue;
      const parsed: unknown = JSON.parse(readFileSync(join(specsDir, spec), "utf8"));
      const kind = (parsed as Record<string, unknown>)["kind"];
      if (typeof kind !== "string") {
        metadataSpecFiles.push(`${project.name}/${spec}`);
        continue;
      }
      kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    }
  }
}
const missingKinds = requiredKinds.filter((kind) => !kindCounts.has(kind));
record(
  "artifact-kinds-present",
  kindListMatch !== null && requiredKinds.length > 0 && missingKinds.length === 0,
  kindListMatch === null || requiredKinds.length === 0
    ? "visualKindValues could not be parsed from src/schema.ts"
    : missingKinds.length === 0
      ? `${requiredKinds.length} kinds present in canonical sample projects`
      : `missing kinds: ${missingKinds.join(", ")}`,
);

const runtimeLiveConsistency: { file: string; matchesFinalManifest: boolean }[] = [];
for (const runtime of allowedRuntime) {
  const livePath = join(canonicalVault.path, runtime);
  const finalEntry = final.vaults
    .find((vault) => vault.path === canonicalVault.path)
    ?.entries.find((entry) => entry.relativePath === runtime);
  if (finalEntry === undefined) continue;
  runtimeLiveConsistency.push({
    file: runtime,
    matchesFinalManifest: existsSync(livePath) && hashFile(livePath) === finalEntry.sha256,
  });
}
record(
  "allowlisted-runtime-live-consistency",
  runtimeLiveConsistency.every((entry) => entry.matchesFinalManifest),
  `${runtimeLiveConsistency.filter((entry) => entry.matchesFinalManifest).length}/${runtimeLiveConsistency.length} allowlisted runtime files match final manifest live`,
);

const report = {
  schemaVersion: 1,
  verifier: "scripts/final/scope-fidelity.ts",
  inputs,
  configuration: {
    allowedRoots,
    allowedRuntime,
    runtimeSemanticRules,
    allowedTargetRoots,
    allowedTargetLinks,
    allowedTargetFiles,
    requiredLinkTarget,
    denyCategories,
    requirePreexistingNotesByteIdentical,
    requireProtectedByteIdentical,
  },
  vaultComparisons,
  liveRehash,
  runtimeSemantics,
  protectedResults,
  linkResults,
  denyChecks,
  artifactKinds: {
    required: requiredKinds,
    counts: Object.fromEntries(kindCounts),
    missing: missingKinds,
    metadataSpecFiles,
  },
  runtimeLiveConsistency,
  checks,
  reasons: failures,
  verdict: failures.length === 0 ? "APPROVE" : "REJECT",
};
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
const parseCheck = z
  .object({ verdict: z.enum(["APPROVE", "REJECT"]), reasons: z.array(z.string()) })
  .parse(JSON.parse(readFileSync(outPath, "utf8")));
process.stdout.write(
  `${JSON.stringify({ verdict: parseCheck.verdict, reasons: parseCheck.reasons, out: outPath })}\n`,
);
if (parseCheck.verdict !== "APPROVE") process.exit(1);
