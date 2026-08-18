import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { RuntimeError } from "../../src/errors";
import type { VisualNoteSpec } from "../../src/schema";
import type { StateRecord } from "../../src/transaction-state";
import {
  activeView,
  assertActiveWorking,
  dismissWelcomeOnce,
  runEval,
  screenshot,
  stateOf,
  waitForScene,
} from "./desktop-live";
import type { BurnRecord } from "./desktop-receipts";
import {
  checkLiveSvg,
  elementIds,
  evalCodes,
  humanSnapshot,
  immutableSnapshot,
  noteArgs,
  pngMagic,
  sceneAt,
  semanticElementId,
  specBytes,
  unchangedWithin,
} from "./desktop-support";
import { command } from "./renderer-live-support";

export const ARTIFACT = "project-map-atlas-shop";
export const REMOVE_NODE = "fulfillment-worker";

export type JourneyContext = {
  readonly vault: string;
  readonly project: string;
  readonly cli: string;
  readonly vaultId: string;
  readonly app: string;
  readonly temp: string;
  readonly shots: string;
  readonly evidence: string;
  readonly journey: readonly string[];
  readonly projectBase: string;
  readonly history: string;
  readonly v2: VisualNoteSpec;
  readonly note: string;
  readonly burns: BurnRecord[];
  readonly retryTokens: string[];
  readonly immutable0: ReturnType<typeof immutableSnapshot>;
  readonly transcript: string[];
  readonly nonce: string;
  mutable: {
    state: StateRecord;
    humans: ReadonlyMap<string, string>;
    working: string;
    targetId: string;
    textId: string;
    codes: ReturnType<typeof evalCodes>;
  };
};

export function log(ctx: JourneyContext, step: string, detail: unknown): void {
  const line = JSON.stringify({ step, detail });
  ctx.transcript.push(line);
  process.stdout.write(`${line}\n`);
}

export function must(cond: boolean, what: string): void {
  if (!cond) throw new RuntimeError(`assertion failed: ${what}`);
}

export function noteJson(
  ctx: JourneyContext,
  step: string,
  args: readonly string[],
  expect: number,
): Record<string, unknown> {
  const result = command(args, process.env);
  log(ctx, step, {
    exitCode: result.exitCode,
    stdout: result.stdout.trim().slice(0, 400),
    stderr: result.stderr.trim().slice(0, 200),
  });
  if (result.exitCode !== expect)
    throw new RuntimeError(`${step} exited ${result.exitCode}: ${result.stderr}`);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

export function openWorking(ctx: JourneyContext, label: string): string {
  const opened = noteJson(
    ctx,
    label,
    noteArgs(ctx, "open", ["--obsidian-cli", ctx.cli, "--artifact-id", ARTIFACT, "--json"]),
    0,
  );
  ctx.mutable.state = stateOf(ctx.vault, ctx.project, ARTIFACT);
  const expected = relative(ctx.vault, ctx.mutable.state.workingPath);
  must(String(opened["path"]) === expected, `${label} targets the CURRENT working copy`);
  assertActiveWorking(ctx.cli, ctx.vaultId, expected);
  return expected;
}

export function refreshSpec(
  ctx: JourneyContext,
  spec: VisualNoteSpec,
  file: string,
  token: string,
): Record<string, unknown> {
  writeFileSync(join(ctx.temp, file), specBytes(spec));
  return noteJson(
    ctx,
    `refresh:${file}`,
    noteArgs(ctx, "refresh", ["--spec", join(ctx.temp, file), "--expected-token", token, "--json"]),
    0,
  );
}

export async function runJourney(ctx: JourneyContext): Promise<void> {
  const { mutable } = ctx;
  if (ctx.journey.includes("create")) {
    const created = noteJson(
      ctx,
      "create",
      noteArgs(ctx, "create", [
        "--verified-vault-id",
        ctx.vaultId,
        "--spec",
        join(ctx.projectBase, "_assets/walkthrough-create.json"),
        "--obsidian-cli",
        ctx.cli,
        "--runtime-receipt",
        join(ctx.evidence, "task-2-preflight.json"),
        "--plugin-receipt",
        join(ctx.evidence, "task-2-plugin-install.json"),
        "--json",
      ]),
      0,
    );
    checkLiveSvg(
      ctx.vault,
      {
        drawing: String(created["drawingPath"]),
        svg: String(created["svgPath"]),
        note: String(created["notePath"]),
      },
      2000,
    );
    log(ctx, "create-embedding", { drawing: created["drawingPath"], svg: created["svgPath"] });
  }
  mutable.working = openWorking(ctx, "open-working");
  mutable.targetId = semanticElementId(
    sceneAt(mutable.state.workingPath),
    REMOVE_NODE,
    "node-shape",
  );
  const ids = elementIds(ctx.nonce);
  mutable.textId = ids.text;
  mutable.codes = evalCodes({
    path: mutable.working,
    targetId: mutable.targetId,
    textId: ids.text,
    drawId: ids.freehand,
    concurrentId: ids.concurrent,
    nonce: ctx.nonce,
  });
  if (ctx.journey.includes("annotate-text")) {
    const result = runEval(ctx.cli, ctx.vaultId, mutable.codes.text) as {
      committed: boolean;
      id: string | null;
    };
    must(
      result.committed === true && result.id !== null,
      `live human text committed: ${JSON.stringify(result)}`,
    );
    mutable.textId = result.id ?? "";
    log(ctx, "annotate-text", result);
  }
  if (ctx.journey.includes("annotate-freehand")) {
    const result = runEval(ctx.cli, ctx.vaultId, mutable.codes.freehand) as {
      committed: boolean;
      id: string;
      untagged: boolean;
    };
    must(
      result.committed === true && result.untagged === true,
      "live untagged human freehand committed",
    );
    log(ctx, "annotate-freehand", result);
  }
  if (ctx.journey.includes("save-human")) {
    const result = runEval(ctx.cli, ctx.vaultId, mutable.codes.save) as {
      saved: boolean;
      path: string;
    };
    must(result.saved === true && result.path === mutable.working, "live view save completed");
    const absolute = join(ctx.vault, mutable.working);
    const ids = elementIds(ctx.nonce);
    const present = (scene: { elements: readonly { id: string }[] }, id: string) =>
      scene.elements.some((element) => element.id === id);
    const marked = (elements: readonly { id: string; customData?: { [key: string]: unknown } }[]) =>
      elements.find((element) => element.customData?.["note"] === `task-12:${ctx.nonce}`);
    await waitForScene(
      absolute,
      (scene) => marked(scene.elements) !== undefined && present(scene, ids.freehand),
      30_000,
    );
    const scene = sceneAt(absolute);
    mutable.humans = humanSnapshot(scene);
    const note = marked(scene.elements);
    must(
      mutable.humans.has(ids.freehand) &&
        mutable.textId !== "" &&
        mutable.humans.has(mutable.textId) &&
        note?.customData?.["owner"] === "human" &&
        note.customData?.["attachedTo"] === mutable.targetId,
      "human elements persisted to the working file",
    );
    log(ctx, "save-human", {
      humans: [...mutable.humans.keys()],
      view: activeView(ctx.cli, ctx.vaultId),
    });
  }
  if (ctx.journey.includes("assert-immutable-unchanged")) {
    const now = immutableSnapshot(ctx.history);
    must(
      unchangedWithin(ctx.immutable0, now) && now.digest === ctx.immutable0.digest,
      "revision hashes stable across human save",
    );
    log(ctx, "assert-immutable-unchanged", { digest: ctx.immutable0.digest });
  }
  log(ctx, "welcome", dismissWelcomeOnce(ctx.cli, ctx.vaultId));
  screenshot(ctx.cli, join(ctx.shots, "task-12-before.png"));
  must(pngMagic(join(ctx.shots, "task-12-before.png")), "before screenshot is a PNG");
  if (ctx.journey.includes("extend"))
    noteJson(
      ctx,
      "extend",
      noteArgs(ctx, "extend", [
        "--spec",
        join(ctx.projectBase, "_assets/walkthrough-extend.json"),
        "--json",
      ]),
      0,
    );
}
