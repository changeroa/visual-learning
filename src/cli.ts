#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { optional, parseOptions, required } from "./arguments";
import { runSpecCommand } from "./cli-spec";
import { CollisionError, ConflictError, InputError, RuntimeError } from "./errors";
import { compileInteractiveAuthoringDocument } from "./interactive-authoring-compiler";
import { interactiveAuthoringJsonSchema } from "./interactive-authoring-schema";
import { readJson, sha256, writeResult } from "./io";
import {
  bootstrapSample,
  createRenderedSpec,
  createSpec,
  initializeProject,
  openVaultPath,
  openWorkingArtifact,
  validateSpec,
} from "./operations";
import { preflight } from "./preflight";
import { parseVisualNoteSpec } from "./schema";
import { exportSeries } from "./session-export";

const officialCli = "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli";
const evidenceRoot = join(process.cwd(), ".omo/evidence/agent-visual-learning-vault");

const help = `visual-note 0.1.0
Usage: visual-note <command> [options]

Commands:
  preflight  verify the exact vault and live official Excalidraw runtime
  init       initialize project metadata from a read-only local source
  bootstrap  stage a repeatable study-workflow sample bundle for a source
  create     validate and publish a new normalized visual-note spec
  export-series  publish a linked series under <session-root>/docs/vl/projects
  extend     validate an extension spec contract without rendering
  refresh    validate a refresh spec contract without rendering
  validate   validate a strict visual-note specification
  authoring-schema  emit the renderer-independent interactive authoring JSON Schema
  compile-authoring validate and compile before/after authoring JSON for a web renderer
  open       open a vault-relative artifact through the official CLI
  restore    validate a restore spec contract without mutation
  contract   emit the deterministic cross-agent contract sentinel
`;

function run(command: string, argv: readonly string[]): void {
  switch (command) {
    case "preflight": {
      const options = parseOptions(argv, new Set(["--obsidian-cli", "--expected-vault"]));
      writeResult(
        preflight(required(options, "--obsidian-cli"), required(options, "--expected-vault")),
        options.json,
      );
      return;
    }
    case "init": {
      const options = parseOptions(
        argv,
        new Set(["--vault", "--expected-vault", "--project", "--source"]),
      );
      writeResult(
        initializeProject({
          vault: required(options, "--vault"),
          expectedVault: required(options, "--expected-vault"),
          project: required(options, "--project"),
          source: required(options, "--source"),
        }),
        options.json,
      );
      return;
    }
    case "bootstrap": {
      const options = parseOptions(
        argv,
        new Set(["--vault", "--expected-vault", "--project", "--source", "--bundle"]),
      );
      const bundlePath = optional(options, "--bundle");
      writeResult(
        bootstrapSample({
          vault: required(options, "--vault"),
          expectedVault: required(options, "--expected-vault"),
          project: required(options, "--project"),
          source: required(options, "--source"),
          ...(bundlePath === undefined ? {} : { bundlePath }),
        }),
        options.json,
      );
      return;
    }
    case "create": {
      const options = parseOptions(
        argv,
        new Set([
          "--vault",
          "--expected-vault",
          "--verified-vault-id",
          "--project",
          "--spec",
          "--obsidian-cli",
          "--runtime-receipt",
          "--plugin-receipt",
          "--assert-no-write",
        ]),
        new Set(["--assert-no-write"]),
      );
      const common = {
        vault: required(options, "--vault"),
        expectedVault: required(options, "--expected-vault"),
        project: required(options, "--project"),
        specPath: required(options, "--spec"),
      } as const;
      const verifiedVaultId = optional(options, "--verified-vault-id");
      const result =
        verifiedVaultId === undefined
          ? createSpec(common)
          : createRenderedSpec({
              ...common,
              verifiedVaultId,
              cli: optional(options, "--obsidian-cli") ?? officialCli,
              runtimeReceipt:
                optional(options, "--runtime-receipt") ?? `${evidenceRoot}/task-2-preflight.json`,
              pluginReceipt:
                optional(options, "--plugin-receipt") ??
                `${evidenceRoot}/task-2-plugin-install.json`,
            });
      writeResult(result, options.json);
      return;
    }
    case "export-series": {
      const options = parseOptions(argv, new Set(["--session-root", "--project", "--spec-dir"]));
      writeResult(
        exportSeries({
          sessionRoot: required(options, "--session-root"),
          project: required(options, "--project"),
          specDirectory: required(options, "--spec-dir"),
        }),
        options.json,
      );
      return;
    }
    case "extend":
    case "refresh":
    case "restore":
      runSpecCommand(command, argv);
      return;
    case "validate": {
      const options = parseOptions(argv, new Set(["--spec"]));
      const result = validateSpec(required(options, "--spec"));
      writeResult(
        {
          valid: true,
          artifactId: result.spec.artifactId,
          revision: result.spec.revision,
          specSha256: result.sha256,
        },
        options.json,
      );
      return;
    }
    case "authoring-schema": {
      const options = parseOptions(argv, new Set());
      writeResult(interactiveAuthoringJsonSchema(), options.json);
      return;
    }
    case "compile-authoring": {
      const options = parseOptions(argv, new Set(["--spec"]));
      writeResult(
        compileInteractiveAuthoringDocument(readJson(required(options, "--spec"))),
        options.json,
      );
      return;
    }
    case "open": {
      const options = parseOptions(
        argv,
        new Set([
          "--obsidian-cli",
          "--vault",
          "--expected-vault",
          "--path",
          "--project",
          "--artifact-id",
        ]),
      );
      const path = optional(options, "--path");
      writeResult(
        path !== undefined
          ? openVaultPath(
              required(options, "--obsidian-cli"),
              required(options, "--expected-vault"),
              path,
            )
          : openWorkingArtifact(
              required(options, "--obsidian-cli"),
              required(options, "--vault"),
              required(options, "--expected-vault"),
              required(options, "--project"),
              required(options, "--artifact-id"),
            ),
        options.json,
      );
      return;
    }
    case "contract": {
      const options = parseOptions(argv, new Set(["--fixture"]));
      const fixture = required(options, "--fixture");
      parseVisualNoteSpec(readJson(fixture));
      writeResult(
        {
          contractVersion: 1,
          sentinel: "VISUAL_LEARNING_CONTRACT_OK",
          fixtureSha256: sha256(readFileSync(fixture)),
        },
        options.json,
      );
      return;
    }
    case "help":
      if (argv.length !== 0) throw new InputError("help accepts no options");
      process.stdout.write(help);
      return;
    default:
      throw new InputError(`unknown command: ${command}`);
  }
}

function main(): void {
  const argv = Bun.argv.slice(2);
  const first = argv[0];
  if (first === "--help" || first === "-h") {
    if (argv.length !== 1) throw new InputError("help accepts no options");
    process.stdout.write(help);
    return;
  }
  if (first === undefined) throw new InputError("a command is required; use --help");
  run(first, argv.slice(1));
}

try {
  main();
} catch (error) {
  if (error instanceof CollisionError || error instanceof ConflictError) {
    process.stderr.write(`visual-note: ${error.message}\n`);
    process.exit(3);
  }
  if (error instanceof RuntimeError) {
    process.stderr.write(`visual-note: ${error.message}\n`);
    process.exit(4);
  }
  if (
    error instanceof InputError ||
    error instanceof z.ZodError ||
    error instanceof SyntaxError ||
    error instanceof TypeError
  ) {
    process.stderr.write(`visual-note: ${error.message}\n`);
    process.exit(2);
  }
  throw error;
}
