#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { z } from "zod";
import { optional, parseOptions, required } from "./arguments";
import { runSpecCommand } from "./cli-spec";
import { CollisionError, ConflictError, InputError, RuntimeError } from "./errors";
import { compileInteractiveAuthoringDocument } from "./interactive-authoring-compiler";
import { interactiveAuthoringJsonSchema } from "./interactive-authoring-schema";
import { readJson, sha256, writeResult } from "./io";
import { reviewLearningSpec } from "./learning-review";
import { bootstrapSample, createSpec, initializeProject, validateSpec } from "./operations";
import { defaultRemote, publish, pull } from "./remote-client";
import { parseVisualNoteSpec } from "./schema";
import { exportSeries } from "./session-export";

const help = `visual-note 0.1.0
Usage: visual-note <command> [options]

Commands:
  init       initialize project metadata from a read-only local source
  bootstrap  stage a repeatable study-workflow sample bundle for a source
  create     validate and publish a new normalized visual-note spec
  export-series  publish a linked series under <session-root>/docs/vl/projects
  extend     validate an extension spec contract without rendering
  refresh    validate a refresh spec contract without rendering
  validate   validate a strict visual-note specification
  authoring-schema  emit the renderer-independent interactive authoring JSON Schema
  compile-authoring validate and compile before/after authoring JSON for a web renderer
  review-learning check a spec's learning layer against research-backed figure rules
  restore    validate a restore spec contract without mutation
  contract   emit the deterministic cross-agent contract sentinel
  publish    upload a project to the private hosted atlas
             --root <abs> --project <slug> [--artifact <id>]... [--repo-root <abs>] [--remote <url>]
  pull       download a project from the hosted atlas without overwriting local changes
             --project <slug> --out <abs-dir> [--remote <url>]

publish/pull read CF-Access-Client-Id/Secret from VISUAL_ATLAS_CLIENT_ID and
VISUAL_ATLAS_CLIENT_SECRET or ~/.config/visual-atlas/credentials.json (mode 0600).
The default remote is ${defaultRemote}.
`;

function takeRepeated(argv: readonly string[], flag: string): [string[], string[]] {
  const values: string[] = [];
  const rest: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument !== flag) {
      rest.push(argument);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new InputError(`${flag} requires a value`);
    values.push(value);
    index += 1;
  }
  return [values, rest];
}

async function runPublish(argv: readonly string[]): Promise<void> {
  const [artifacts, rest] = takeRepeated(argv, "--artifact");
  const options = parseOptions(rest, new Set(["--root", "--project", "--repo-root", "--remote"]));
  const repoRoot = optional(options, "--repo-root");
  const result = await publish({
    root: required(options, "--root"),
    project: required(options, "--project"),
    remote: optional(options, "--remote") ?? defaultRemote,
    env: process.env,
    ...(artifacts.length === 0 ? {} : { artifacts }),
    ...(repoRoot === undefined ? {} : { repoRoot }),
  });
  if (options.json) {
    writeResult(result, true);
  } else {
    for (const figure of result.results) {
      const extras = [
        ...(figure.deprecatedAnchors.length === 0
          ? []
          : [`deprecatedAnchors=${figure.deprecatedAnchors.join(",")}`]),
        ...(figure.orphanedNotes.length === 0
          ? []
          : [`orphanedNotes=${figure.orphanedNotes.join(",")}`]),
      ];
      process.stdout.write(
        `${[figure.outcome, figure.artifactId, figure.token, ...extras].join(" ")}\n`,
      );
    }
  }
  const conflicts = result.results.filter((figure) => figure.outcome === "conflict");
  if (conflicts.length > 0) {
    throw new ConflictError(
      `publish conflict for ${conflicts.map((figure) => figure.artifactId).join(", ")}`,
    );
  }
}

async function run(command: string, argv: readonly string[]): Promise<void> {
  switch (command) {
    case "publish":
      await runPublish(argv);
      return;
    case "pull": {
      const options = parseOptions(argv, new Set(["--project", "--out", "--remote"]));
      writeResult(
        await pull({
          project: required(options, "--project"),
          out: required(options, "--out"),
          remote: optional(options, "--remote") ?? defaultRemote,
          env: process.env,
        }),
        options.json,
      );
      return;
    }
    case "init": {
      const options = parseOptions(argv, new Set(["--root", "--project", "--source"]));
      writeResult(
        initializeProject({
          root: required(options, "--root"),
          project: required(options, "--project"),
          source: required(options, "--source"),
        }),
        options.json,
      );
      return;
    }
    case "bootstrap": {
      const options = parseOptions(argv, new Set(["--root", "--project", "--source", "--bundle"]));
      const bundlePath = optional(options, "--bundle");
      writeResult(
        bootstrapSample({
          root: required(options, "--root"),
          project: required(options, "--project"),
          source: required(options, "--source"),
          ...(bundlePath === undefined ? {} : { bundlePath }),
        }),
        options.json,
      );
      return;
    }
    case "create": {
      const options = parseOptions(argv, new Set(["--root", "--project", "--spec"]));
      writeResult(
        createSpec({
          root: required(options, "--root"),
          project: required(options, "--project"),
          specPath: required(options, "--spec"),
        }),
        options.json,
      );
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
    case "review-learning": {
      const options = parseOptions(argv, new Set(["--spec"]));
      writeResult(reviewLearningSpec(required(options, "--spec")), options.json);
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

async function main(): Promise<void> {
  const argv = Bun.argv.slice(2);
  const first = argv[0];
  if (first === "--help" || first === "-h") {
    if (argv.length !== 1) throw new InputError("help accepts no options");
    process.stdout.write(help);
    return;
  }
  if (first === undefined) throw new InputError("a command is required; use --help");
  await run(first, argv.slice(1));
}

try {
  await main();
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
