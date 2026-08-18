#!/usr/bin/env bun
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { optional, parseOptions, required } from "../../src/arguments";
import { readJson } from "../../src/io";
import { stripLockResidue } from "../../src/project-publish";
import { renderGallerySvg } from "../../src/svg-gallery";
import { generateTemplateBundle } from "../../src/template-generate";
import { parseTemplateBundle } from "../../src/template-schema";
import {
  assert,
  expectedFiles,
  openWalkthrough,
  run,
  validateLinks,
  verifiedPluginReceipt,
} from "./isolated-bootstrap-support";

const artifactId = "project-map-atlas-shop";
const skillRoot = resolve(import.meta.dir, "../..");
const cli = join(skillRoot, "bin/visual-note");
const bundlePath = join(skillRoot, "tests/fixtures/sample-project/bundle.json");

async function main(): Promise<void> {
  const options = parseOptions(
    Bun.argv.slice(2),
    new Set([
      "--obsidian-cli",
      "--open-vault",
      "--vault",
      "--expected-vault",
      "--provision-plugin-from",
      "--verify-plugin-sha",
      "--verify-base-path",
      "--source",
      "--expect-commit",
      "--project",
      "--repeat",
      "--commands",
      "--out",
    ]),
    new Set(["--verify-plugin-sha", "--verify-base-path"]),
  );
  const vault = resolve(required(options, "--vault"));
  const expectedVault = resolve(required(options, "--expected-vault"));
  const source = resolve(required(options, "--source"));
  const expectedCommit = required(options, "--expect-commit");
  const project = required(options, "--project");
  const repeat = Number(required(options, "--repeat"));
  const commands = required(options, "--commands").split(",").filter(Boolean);
  const out = resolve(required(options, "--out"));
  const pluginReceipt = verifiedPluginReceipt(
    required(options, "--provision-plugin-from"),
    options.flags.has("--verify-plugin-sha"),
  );

  assert(vault === expectedVault, "vault mismatch");
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });

  const receipts: unknown[] = [];
  const bootstrapArgs = [
    cli,
    "bootstrap",
    "--vault",
    vault,
    "--expected-vault",
    expectedVault,
    "--project",
    project,
    "--source",
    source,
    "--bundle",
    bundlePath,
    "--json",
  ] as const;
  for (let index = 0; index < repeat; index += 1) {
    const result = run(bootstrapArgs);
    assert(result.code === 0, result.stderr || `bootstrap failed on run ${index + 1}`);
    receipts.push(JSON.parse(result.stdout));
  }

  const projectRoot = join(vault, "Engineering Atlas/10 Projects", project);
  for (const file of expectedFiles(projectRoot)) {
    assert(existsSync(file), `missing file: ${file}`);
  }
  assert(!existsSync(join(projectRoot, "src")), "source tree copied into vault");
  const sourceJson = readJson(join(projectRoot, "_generated/specs/source.json")) as {
    source: { root: string; commit: string | null };
  };
  assert(sourceJson.source.root === source, "source root mismatch");
  assert(String(sourceJson.source.commit) === expectedCommit, "source commit mismatch");

  const assetRoot = join(projectRoot, "_assets");
  const initVault = resolve(join(dirname(vault), "task-10-init-only-vault"));
  rmSync(initVault, { recursive: true, force: true });
  mkdirSync(initVault, { recursive: true });
  const walkthrough = {
    init: run([
      cli,
      "init",
      "--vault",
      initVault,
      "--expected-vault",
      initVault,
      "--project",
      `${project}-init`,
      "--source",
      source,
      "--json",
    ]),
    validate: run([
      cli,
      "validate",
      "--spec",
      join(assetRoot, "walkthrough-create.json"),
      "--json",
    ]),
    create: run([
      cli,
      "create",
      "--vault",
      vault,
      "--expected-vault",
      expectedVault,
      "--project",
      project,
      "--spec",
      join(assetRoot, "walkthrough-create.json"),
      "--json",
    ]),
    extend: run([cli, "extend", "--spec", join(assetRoot, "walkthrough-extend.json"), "--json"]),
    refresh: run([
      cli,
      "refresh",
      "--vault",
      vault,
      "--expected-vault",
      expectedVault,
      "--project",
      project,
      "--spec",
      join(assetRoot, "walkthrough-refresh-v2.json"),
      "--expected-token",
      "cas-0",
      "--json",
    ]),
  } as const;
  for (const command of ["init", "validate", "create", "extend", "refresh"] as const) {
    assert(walkthrough[command].code === 0, `${command} failed: ${walkthrough[command].stderr}`);
  }
  assert(commands.includes("open"), "command contract missing open");
  const openVault = resolve(
    optional(options, "--open-vault") ?? join(homedir(), "Documents", "Obsidian Vault"),
  );
  const open = openWalkthrough({
    cli,
    cliPath: required(options, "--obsidian-cli"),
    vault,
    openVault,
    project,
    artifactId,
    pluginReceipt,
  });
  const restore = run([
    cli,
    "restore",
    "--vault",
    vault,
    "--expected-vault",
    expectedVault,
    "--project",
    project,
    "--artifact-id",
    artifactId,
    "--revision-token",
    "cas-0",
    "--expected-token",
    "cas-1",
    "--json",
  ]);
  assert(restore.code === 0, `restore failed: ${restore.stderr}`);
  stripLockResidue(projectRoot);
  stripLockResidue(join(openVault, "Engineering Atlas/10 Projects", project));

  const links = validateLinks(projectRoot);
  assert(links.broken.length === 0, `broken links: ${links.broken.join(", ")}`);

  const bundle = parseTemplateBundle(readJson(bundlePath));
  const generated = generateTemplateBundle(bundle, source);
  const gallery = renderGallerySvg(generated.views);
  const svgPath = join(dirname(out), "task-10-sample-map.svg");
  const pngPath = join(dirname(out), "task-10-sample-map.png");
  writeFileSync(svgPath, gallery.svg);
  const raster = run(["sips", "-s", "format", "png", svgPath, "--out", pngPath]);
  assert(raster.code === 0, raster.stderr || "sample map rasterization failed");

  const receipt = {
    schemaVersion: 1,
    type: "Task10OnboardingReceipt",
    status: "PASS",
    source: { root: source, commit: sourceJson.source.commit },
    bootstrapRuns: receipts,
    commandsRequested: commands,
    isolatedWalkthrough: {
      init: { code: walkthrough.init.code, stdout: walkthrough.init.stdout },
      validate: { code: walkthrough.validate.code, stdout: walkthrough.validate.stdout },
      create: { code: walkthrough.create.code, stdout: walkthrough.create.stdout },
      extend: { code: walkthrough.extend.code, stdout: walkthrough.extend.stdout },
      refresh: { code: walkthrough.refresh.code, stdout: walkthrough.refresh.stdout },
      open: { code: open.result.code, stdout: open.result.stdout },
      restore: { code: restore.code, stdout: restore.stdout },
    },
    open: open.receipt,
    links,
    expectedFiles: expectedFiles(projectRoot).map((path) => path.slice(projectRoot.length + 1)),
    sampleMap: { svgPath, pngPath, width: gallery.width, height: gallery.height },
    sourceCopiedIntoVault: false,
  } as const;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `isolated-bootstrap: ${error instanceof Error ? error.message : "unknown failure"}\n`,
  );
  process.exit(2);
});
