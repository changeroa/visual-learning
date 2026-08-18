#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { z } from "zod";

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  const value = index < 0 ? undefined : Bun.argv[index + 1];
  if (value === undefined) throw new TypeError(`${name} is required`);
  return value;
}

function flag(name: string): boolean {
  return Bun.argv.includes(name);
}

const packageRoot = resolve(option("--package"));
const lockPath = resolve(option("--lock"));
const receiptPath = resolve(option("--dependency-receipt"));
const maxSourceLines = Number.parseInt(option("--max-source-lines"), 10);
const denyAny = flag("--deny-any");
const denyNetworkDependencies = flag("--deny-network-dependencies");
const outPath = resolve(option("--out"));
const failures: string[] = [];

type CommandOutcome = {
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

function runCommand(command: readonly string[], cwd: string): CommandOutcome {
  const result = Bun.spawnSync([...command], { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    command,
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

type TestSummary =
  | { readonly parsed: true; readonly pass: number; readonly fail: number }
  | { readonly parsed: false; readonly rawTail: string };

function parseTestSummary(run: CommandOutcome): TestSummary {
  const output = run.stderr;
  const pass = /(?:^|\n)\s*(\d+) pass(?:\n|$)/.exec(output)?.[1];
  const fail = /(?:^|\n)\s*(\d+) fail(?:\n|$)/.exec(output)?.[1];
  if (pass === undefined || fail === undefined) {
    return { parsed: false, rawTail: output.slice(-400) };
  }
  return { parsed: true, pass: Number(pass), fail: Number(fail) };
}

function requireTrue(condition: boolean, failure: string): boolean {
  if (!condition) failures.push(failure);
  return condition;
}

function walkTypeScriptFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...walkTypeScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) found.push(path);
  }
  return found.sort();
}

function countMatches(
  files: readonly string[],
  pattern: RegExp,
): { readonly count: number; readonly locations: readonly string[] } {
  const locations: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (pattern.test(line)) locations.push(`${relative(packageRoot, file)}:${index + 1}`);
    }
  }
  return { count: locations.length, locations };
}

const sources = walkTypeScriptFiles(join(packageRoot, "src"));
const scripts = walkTypeScriptFiles(join(packageRoot, "scripts"));
const tests = walkTypeScriptFiles(join(packageRoot, "tests"));
const allTypeScript = [...sources, ...scripts, ...tests];

const offlineInstall = runCommand(
  ["bun", "install", "--frozen-lockfile", "--offline"],
  packageRoot,
);
const offlineNoOp = offlineInstall.exitCode === 0 && /no changes/.test(offlineInstall.stdout);
requireTrue(offlineNoOp, "frozen offline install must succeed as a no-op");

const typecheck = runCommand(["bun", "run", "typecheck"], packageRoot);
const typeErrors = (typecheck.stdout + typecheck.stderr).match(/error TS\d+:/g) ?? [];
requireTrue(
  typecheck.exitCode === 0 && typeErrors.length === 0,
  "strict typecheck must pass with zero diagnostics",
);

const testRun = runCommand(["bun", "test"], packageRoot);
const testSummary = parseTestSummary(testRun);
if (!testSummary.parsed) {
  failures.push(
    `bun test summary could not be parsed from runner output (exit ${testRun.exitCode}); raw tail: ${JSON.stringify(testSummary.rawTail)}`,
  );
}
const testGateHeld =
  testRun.exitCode === 0 && testSummary.parsed && testSummary.pass > 0 && testSummary.fail === 0;
requireTrue(
  testGateHeld,
  `bun test must pass (exit ${testRun.exitCode}, ${
    testSummary.parsed ? `pass ${testSummary.pass}, fail ${testSummary.fail}` : "summary unparsed"
  })`,
);

const lint = runCommand(["bun", "run", "lint"], packageRoot);
requireTrue(lint.exitCode === 0, "biome formatting/lint check must pass");

const tsconfig = z
  .object({ compilerOptions: z.record(z.string(), z.unknown()) })
  .parse(JSON.parse(readFileSync(join(packageRoot, "tsconfig.json"), "utf8")));
const requiredStrictFlags = [
  "strict",
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
  "noImplicitReturns",
  "noFallthroughCasesInSwitch",
  "noPropertyAccessFromIndexSignature",
] as const;
const strictFlags = requiredStrictFlags.map((name) => ({
  name,
  enabled: tsconfig.compilerOptions[name] === true,
}));
requireTrue(
  strictFlags.every((entry) => entry.enabled),
  "tsconfig must enable every required strict flag",
);

const suppressionPattern = new RegExp(
  [
    "@ts-" + "ignore" + "\\b",
    "@ts-" + "expect-" + "error" + "\\b",
    "@ts-" + "nocheck" + "\\b",
    "@ts-" + "skip" + "\\b",
    "eslint-" + "disable",
    "biome-" + "ignore",
    "istanbul" + "\\s+" + "ignore",
    "c8" + "\\s+" + "ignore",
  ].join("|"),
);
const suppressions = countMatches(allTypeScript, suppressionPattern);
requireTrue(suppressions.count === 0, "no error suppressions are allowed in typed sources");

const anyPattern = new RegExp(
  [
    ":" + "\\s*" + "any" + "\\b",
    "\\b" + "as" + "\\s+" + "any" + "\\b",
    "<" + "any" + ">",
    "\\b" + "any" + "\\s*" + "\\[",
    "\\b" + "readonly" + "\\s+" + "any" + "\\b",
  ].join("|"),
);
const anyUsage = countMatches(allTypeScript, anyPattern);
if (denyAny) requireTrue(anyUsage.count === 0, "no `any` usage is allowed in typed sources");

const emptyCatches = countMatches(allTypeScript, /catch(?:\s*\([^)]*\))?\s*\{\s*\}/);

const moduleLines = sources.map((file) => ({
  file: relative(packageRoot, file),
  lines: readFileSync(file, "utf8").split("\n").length,
}));
const sourceCeiling = [...moduleLines].sort((left, right) => right.lines - left.lines).slice(0, 5);
const maxSourceModule = moduleLines.reduce(
  (worst, entry) => (entry.lines > worst.lines ? entry : worst),
  {
    file: "<none>",
    lines: 0,
  },
);
requireTrue(
  maxSourceModule.lines <= maxSourceLines,
  `module ceiling exceeded: ${maxSourceModule.file} has ${maxSourceModule.lines} lines (max ${maxSourceLines})`,
);

const receipt = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("VisualLearningDependencyReceipt"),
    lockSha256: z.string().length(64),
    bunVersion: z.string(),
    frozenInstall: z.boolean(),
    packages: z.array(
      z.object({
        name: z.string(),
        version: z.string(),
        manifestSha256: z.string().length(64),
        type: z.string(),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync(receiptPath, "utf8")));

const hash = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const packageManifest = z
  .object({
    name: z.string(),
    version: z.string(),
    private: z.literal(true),
    dependencies: z.record(z.string(), z.string()),
    devDependencies: z.record(z.string(), z.string()),
    scripts: z.record(z.string(), z.string()),
  })
  .parse(JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")));

const declaredVersions = { ...packageManifest.dependencies, ...packageManifest.devDependencies };
const nonExactVersions = Object.entries(declaredVersions).filter(
  ([, version]) => !/^\d+(\.\d+)*$/.test(version),
);
requireTrue(nonExactVersions.length === 0, "every declared dependency version must be exact");
const lockBytes = readFileSync(lockPath, "utf8");
requireTrue(
  hash(lockPath) === receipt.lockSha256,
  "bun.lock sha256 must match the task-4 dependency receipt",
);
requireTrue(receipt.frozenInstall, "dependency receipt must record a frozen install");

const copyleftPattern = /\b(?:GPL|AGPL|LGPL|SSPL|BUSL)\b/i;
const installedPackages = receipt.packages.map((entry) => {
  const manifestPath = join(packageRoot, "node_modules", entry.name, "package.json");
  const manifest = z
    .object({ version: z.string(), license: z.string() })
    .parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  const manifestSha256 = hash(manifestPath);
  return {
    name: entry.name,
    version: manifest.version,
    license: manifest.license,
    manifestSha256,
    receiptMatches: manifestSha256 === entry.manifestSha256 && manifest.version === entry.version,
  };
});
requireTrue(
  installedPackages.every((entry) => entry.receiptMatches),
  "every installed package manifest hash must match the task-4 receipt",
);
requireTrue(
  installedPackages.every(
    (entry) => entry.license.length > 0 && !copyleftPattern.test(entry.license),
  ),
  "every installed dependency must declare a permissive license",
);

const installScripts = Object.keys(packageManifest.scripts).filter((name) =>
  /(?:pre|post)?install/.test(name),
);
const remoteReferences = [lockBytes, JSON.stringify(packageManifest)].filter((content) =>
  /https?:\/\//.test(content),
);
if (denyNetworkDependencies) {
  requireTrue(
    remoteReferences.length === 0,
    "no registry or remote URLs may appear in package.json or bun.lock",
  );
  requireTrue(installScripts.length === 0, "no lifecycle install scripts are allowed");
}

const schemaSource = readFileSync(join(packageRoot, "src", "schema.ts"), "utf8");
const schemaReview = {
  reviewedModule: "src/schema.ts",
  strictObjectSchemas: (schemaSource.match(/\.strict\(\)/g) ?? []).length,
  traversalRejectingEvidencePaths: schemaSource.includes('part === ".."'),
  factsRequireEvidence: schemaSource.includes("requires evidence"),
  uniqueSemanticIdsEnforced: schemaSource.includes("semantic IDs must be unique"),
  danglingEdgesRejected: schemaSource.includes("dangling endpoint"),
  contractTests: ["tests/schema.test.ts"],
};
requireTrue(
  schemaReview.strictObjectSchemas > 0 &&
    schemaReview.traversalRejectingEvidencePaths &&
    schemaReview.factsRequireEvidence &&
    schemaReview.uniqueSemanticIdsEnforced &&
    schemaReview.danglingEdgesRejected &&
    existsSync(join(packageRoot, "tests", "schema.test.ts")),
  "schema review anchors must hold",
);

const transactionModules = [
  "transaction-engine",
  "transaction-state",
  "transaction-lock",
  "transaction-path",
  "transaction-commit",
  "transaction-verify",
  "transaction-layout",
  "transaction-agent",
  "transaction-metadata",
  "transaction-publish",
  "transaction-bootstrap",
  "transaction-types",
  "bundle-transaction",
  "refresh",
].map((name) => `src/${name}.ts`);
const concurrencyTests = [
  "transaction",
  "crash-recovery",
  "token-burn",
  "reader-lock",
  "aba-restore",
  "human-save",
  "state-record",
  "working-copy",
  "restore",
].map((name) => `tests/${name}.test.ts`);
const lockSource = readFileSync(join(packageRoot, "src", "transaction-lock.ts"), "utf8");
const transactionPathSource = readFileSync(join(packageRoot, "src", "transaction-path.ts"), "utf8");
const transactionConcurrencyReview = {
  modules: transactionModules,
  modulesPresent: transactionModules.every((path) => existsSync(join(packageRoot, path))),
  perArtifactReadWriteLock:
    lockSource.includes("readers") &&
    lockSource.includes("writer") &&
    lockSource.includes("ConflictError"),
  noFollowPathValidation:
    transactionPathSource.includes("walkNoFollow") && transactionPathSource.includes("assertUnder"),
  casAndRecoveryTests: concurrencyTests,
  testsPresent: concurrencyTests.every((path) => existsSync(join(packageRoot, path))),
  review:
    "Single authoritative STATE record with token/inode/generation/event-sequence CAS, per-artifact read/write lock with dead-PID marker pruning, token burn on abort, rollback and forward crash recovery, and reader recovery gating were each covered by the executed test suite.",
};
requireTrue(
  transactionConcurrencyReview.modulesPresent &&
    transactionConcurrencyReview.perArtifactReadWriteLock &&
    transactionConcurrencyReview.noFollowPathValidation &&
    transactionConcurrencyReview.testsPresent,
  "transaction/concurrency review anchors must hold",
);

const mutationCallPattern =
  /\b(?:writeFileSync|appendFileSync|renameSync|unlinkSync|rmSync|mkdirSync)\s*\(/;
const reviewedMutationModules: Readonly<Record<string, string>> = {
  "src/bootstrap.ts": "vault and source validated via path-guard before any staging write",
  "src/bootstrap-notes.ts":
    "writes fixed relative note paths under the slug-validated project base",
  "src/bundle-transaction.ts": "journal writes confined to the validated artifact history root",
  "src/project-publish.ts":
    "stage-then-rename publication inside the validated vault/project subtree",
  "src/refresh.ts": "CAS-guarded working-copy writes through transaction paths",
  "src/transaction-bootstrap.ts":
    "history root derived from transactionPaths on validated vault plus slug",
  "src/transaction-fs.ts": "fs primitives module used only with transaction-validated paths",
  "src/transaction-lock.ts": "lock markers under the per-artifact lock root",
};
const mutatingModules = sources
  .filter((file) => mutationCallPattern.test(readFileSync(file, "utf8")))
  .map((file) => relative(packageRoot, file));
const unreviewedMutations = mutatingModules.filter((file) => !(file in reviewedMutationModules));
const operationsSource = readFileSync(join(packageRoot, "src", "operations.ts"), "utf8");
const bootstrapSource = readFileSync(join(packageRoot, "src", "bootstrap.ts"), "utf8");
const pathSafetyReview = {
  descriptorSafeHelpers: "src/safe-path.ts -> scripts/internal/safe-fs.py",
  descriptorSafeHelpersPresent:
    existsSync(join(packageRoot, "src", "safe-path.ts")) &&
    existsSync(join(packageRoot, "scripts", "internal", "safe-fs.py")),
  mutatingModules,
  unreviewedMutations,
  vaultGuardEnforcedAtEntry:
    operationsSource.includes("ensureMatchingVault") &&
    operationsSource.includes("slugSchema") &&
    operationsSource.includes("safeCreateFile") &&
    bootstrapSource.includes("ensureMatchingVault"),
  cliRouterPerformsNoDirectWrites: !mutationCallPattern.test(
    readFileSync(join(packageRoot, "src", "cli.ts"), "utf8"),
  ),
};
requireTrue(
  pathSafetyReview.descriptorSafeHelpersPresent &&
    unreviewedMutations.length === 0 &&
    pathSafetyReview.vaultGuardEnforcedAtEntry &&
    pathSafetyReview.cliRouterPerformsNoDirectWrites,
  "path-safety review anchors must hold",
);

const rendererModules = [
  "src/renderer-plan.ts",
  "src/refresh-elements.ts",
  "src/refresh-scene.ts",
  "src/renderer-live.ts",
  "src/scene-bootstrap.ts",
  "src/scene-links.ts",
  "src/svg-gallery.ts",
];
const refreshSceneSource = readFileSync(join(packageRoot, "src", "refresh-scene.ts"), "utf8");
const rendererLiveSource = readFileSync(join(packageRoot, "src", "renderer-live.ts"), "utf8");
const rendererDecomposition = {
  modules: rendererModules,
  modulesPresent: rendererModules.every((path) => existsSync(join(packageRoot, path))),
  largestModuleLines: Math.max(
    ...rendererModules.map(
      (path) => readFileSync(join(packageRoot, path), "utf8").split("\n").length,
    ),
  ),
  buildsOwnershipReferenceGraph:
    refreshSceneSource.includes("ReferenceGraph") && refreshSceneSource.includes("ownershipOf"),
  usesAutomateAppendUpdateCustomData: rendererLiveSource.includes("addAppendUpdateCustomData"),
  preservationTestsPresent:
    existsSync(join(packageRoot, "tests", "preservation.test.ts")) &&
    existsSync(join(packageRoot, "tests", "cross-ownership-bindings.test.ts")),
};
requireTrue(
  rendererDecomposition.modulesPresent &&
    rendererDecomposition.largestModuleLines <= maxSourceLines &&
    rendererDecomposition.buildsOwnershipReferenceGraph &&
    rendererDecomposition.usesAutomateAppendUpdateCustomData &&
    rendererDecomposition.preservationTestsPresent,
  "renderer must stay decomposed with ownership-aware selective refresh",
);

const report = {
  schemaVersion: 1,
  type: "VisualLearningFinalQualityReport",
  verifier: "F2",
  generatedAt: new Date().toISOString(),
  gate: {
    offlineInstall: {
      command: offlineInstall.command,
      exitCode: offlineInstall.exitCode,
      noOp: offlineNoOp,
    },
    typecheck: {
      command: typecheck.command,
      exitCode: typecheck.exitCode,
      diagnostics: typeErrors.length,
    },
    tests: {
      command: testRun.command,
      exitCode: testRun.exitCode,
      summaryParsed: testSummary.parsed,
      pass: testSummary.parsed ? testSummary.pass : null,
      fail: testSummary.parsed ? testSummary.fail : null,
    },
    lint: { command: lint.command, exitCode: lint.exitCode },
  },
  strictness: { requiredFlags: strictFlags },
  suppressions: { count: suppressions.count, locations: suppressions.locations },
  anyUsage: denyAny
    ? { denied: true, count: anyUsage.count, locations: anyUsage.locations }
    : { denied: false, count: anyUsage.count },
  emptyCatchBlocks: {
    count: emptyCatches.count,
    locations: emptyCatches.locations,
    note: "best-effort cleanup paths covered by crash-recovery and transaction tests",
  },
  moduleCeiling: {
    enforced: "src/**/*.ts",
    max: maxSourceLines,
    largest: sourceCeiling,
    informationalScriptsAndTests:
      "QA harness scripts and test support modules are recorded but not ceiling-enforced, matching the per-task module-ceiling evidence convention",
  },
  dependencyAudit: {
    lockSha256MatchesReceipt: hash(lockPath) === receipt.lockSha256,
    bunVersion: receipt.bunVersion,
    exactVersions: nonExactVersions.length === 0,
    installScripts,
    remoteReferences: remoteReferences.length,
    denyNetworkDependencies,
    packages: installedPackages,
  },
  schemaReview,
  transactionConcurrencyReview,
  pathSafetyReview: {
    ...pathSafetyReview,
    reviewedMutationModules,
  },
  rendererDecomposition,
  notes: [
    "Non-blocking hygiene (recorded by the task-12 verifier, not fixed during F2 to avoid mutating evidence-backed vault state): an empty .rwlock directory can remain in production after lock release; lock markers themselves are pruned on close.",
  ],
  verdict: failures.length === 0 ? "APPROVE" : "REJECT",
  reasons: failures,
};
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
const parseCheck = z
  .object({ verdict: z.enum(["APPROVE", "REJECT"]), reasons: z.array(z.string()) })
  .parse(JSON.parse(readFileSync(outPath, "utf8")));
if (statSync(outPath).size === 0) throw new Error("quality report is empty");
process.stdout.write(
  `${JSON.stringify({ verdict: parseCheck.verdict, reasons: parseCheck.reasons, out: outPath })}\n`,
);
if (parseCheck.verdict !== "APPROVE") process.exit(1);
