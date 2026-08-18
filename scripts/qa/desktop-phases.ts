import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseSceneMarkdown } from "../../src/excalidraw-file";
import { parseVisualNoteSpec } from "../../src/schema";
import { tokenIndex } from "../../src/transaction-layout";
import {
  ARTIFACT,
  type JourneyContext,
  log,
  must,
  noteJson,
  openWorking,
  REMOVE_NODE,
  refreshSpec,
} from "./desktop-journey";
import {
  dismissWelcomeOnce,
  launch,
  pgrepAny,
  quit,
  refreshWithInjection,
  runEval,
  stateOf,
  waitForScene,
} from "./desktop-live";
import {
  agentIds,
  assertEmbedding,
  burnedTokens,
  deriveSpec,
  elementIds,
  evalCodes,
  humanSnapshot,
  humansEqual,
  immutableSnapshot,
  noteArgs,
  readBurn,
  sceneAt,
  stableStringify,
  unchangedRevisions,
  unchangedWithin,
} from "./desktop-support";

export function runRefresh(ctx: JourneyContext): void {
  const { mutable } = ctx;
  if (ctx.journey.includes("refresh")) {
    const beforeAgents = agentIds(sceneAt(mutable.state.workingPath));
    const first = refreshSpec(ctx, ctx.v2, "refresh-v2.json", mutable.state.committedToken);
    ctx.retryTokens.push(String(first["committedToken"]));
    mutable.state = stateOf(ctx.vault, ctx.project, ARTIFACT);
    must(
      tokenIndex(mutable.state.committedToken) === tokenIndex(String(first["committedToken"])),
      "STATE adopts the fresh token",
    );
    const scene = sceneAt(mutable.state.workingPath);
    must(
      humansEqual(humanSnapshot(scene), mutable.humans),
      "human serialized properties survive refresh",
    );
    must(
      JSON.stringify([...agentIds(scene)].sort()) === JSON.stringify([...beforeAgents].sort()),
      "agent stable IDs stable",
    );
    must(
      Array.isArray(first["deprecatedAnchors"]) && first["deprecatedAnchors"].length === 0,
      "no deprecated anchors when nodes are kept",
    );
    must(
      unchangedRevisions(ctx.immutable0, immutableSnapshot(ctx.history)),
      "prior immutable revisions untouched",
    );
    mutable.working = openWorking(ctx, "open-working-after-refresh");
    const v3 = deriveSpec(ctx.v2, { remove: REMOVE_NODE, suffix: "(Deprecate)" });
    const second = refreshSpec(ctx, v3, "refresh-v3.json", mutable.state.committedToken);
    mutable.state = stateOf(ctx.vault, ctx.project, ARTIFACT);
    const anchored = sceneAt(mutable.state.workingPath).elements.find(
      (element) => element.id === mutable.targetId,
    );
    must(
      anchored?.customData?.["deprecatedAnchor"] === true,
      "removed referenced node becomes a deprecated anchor",
    );
    must(
      JSON.stringify(second["deprecatedAnchors"]) === JSON.stringify([mutable.targetId]),
      "deprecated anchor reported",
    );
    must(
      humansEqual(humanSnapshot(sceneAt(mutable.state.workingPath)), mutable.humans),
      "human properties survive deprecation refresh",
    );
    mutable.working = openWorking(ctx, "open-working-after-deprecation");
    log(ctx, "refresh", {
      tokens: [first["committedToken"], second["committedToken"]],
      deprecatedAnchors: second["deprecatedAnchors"],
    });
  }
}

export async function runRestart(ctx: JourneyContext, pid: number): Promise<number> {
  await quit(pid);
  must(!pgrepAny(), "no Obsidian residue after quit");
  const again = await launch(ctx.app, ctx.vault);
  log(ctx, "restart", {
    pid: again.pid,
    events: again.events,
    welcome: dismissWelcomeOnce(ctx.cli, ctx.vaultId),
  });
  ctx.mutable.working = openWorking(ctx, "open-working-after-restart");
  must(
    humanSnapshot(sceneAt(ctx.mutable.state.workingPath)).size >= ctx.mutable.humans.size,
    "human annotations survive restart",
  );
  return again.pid;
}

export async function runConcurrentPhase(ctx: JourneyContext): Promise<void> {
  const v4 = parseVisualNoteSpec(
    JSON.parse(readFileSync(join(ctx.temp, "refresh-retry.json"), "utf8")),
  );
  const stateBefore = stateOf(ctx.vault, ctx.project, ARTIFACT);
  const immutableBefore = immutableSnapshot(ctx.history);
  const beforeBurn = burnedTokens(ctx.history);
  const ids = elementIds(ctx.nonce);
  const concurrent = evalCodes({
    path: relative(ctx.vault, stateBefore.workingPath),
    targetId: ctx.mutable.targetId,
    textId: ids.concurrent,
    drawId: ids.freehand,
    concurrentId: ids.concurrent,
    nonce: ctx.nonce,
  });
  const injected = refreshWithInjection({
    vault: ctx.vault,
    project: ctx.project,
    spec: v4,
    expectedToken: stateBefore.committedToken,
    boundary: "stage-bundle",
    inject: () => {
      const result = runEval(ctx.cli, ctx.vaultId, concurrent.concurrent) as {
        committed: boolean;
        forced: boolean;
        id: string;
      };
      must(
        result.committed === true && result.forced === true && result.id === ids.concurrent,
        "concurrent live human save executed during refresh",
      );
    },
  });
  must(injected.kind === "conflict", "concurrent human save forces a CAS abort");
  const afterBurn = burnedTokens(ctx.history);
  must(afterBurn.length === beforeBurn.length + 1, "exactly one abandoned token burned");
  const record = readBurn(
    ctx.history,
    afterBurn.find((entry) => !beforeBurn.includes(entry)) ?? "",
  );
  const after = stateOf(ctx.vault, ctx.project, ARTIFACT);
  ctx.burns.push({
    token: record.token,
    reason: record.reason,
    phase: "concurrent-human-save-during-refresh",
    stateUnchanged: after.committedToken === stateBefore.committedToken,
    abandonedRevisionAbsent: !existsSync(join(ctx.history, "revisions", record.token)),
  });
  must(
    ctx.burns.at(-1)?.stateUnchanged === true && ctx.burns.at(-1)?.abandonedRevisionAbsent === true,
    "abort left no immutable mutation",
  );
  must(
    unchangedWithin(immutableBefore, immutableSnapshot(ctx.history)),
    "immutable revisions unchanged by the abort",
  );
  await waitForScene(
    after.workingPath,
    (scene) => scene.elements.some((element) => element.id === ids.concurrent),
    30_000,
  );
  must(
    humanSnapshot(sceneAt(after.workingPath)).has(ids.concurrent),
    "no lost working data after the abort",
  );
  const retry = refreshSpec(ctx, v4, "refresh-retry.json", after.committedToken);
  ctx.retryTokens.push(String(retry["committedToken"]));
  must(
    tokenIndex(String(retry["committedToken"])) > tokenIndex(record.token),
    "retry uses a fresh token beyond the burned one",
  );
  ctx.mutable.state = stateOf(ctx.vault, ctx.project, ARTIFACT);
  const retryScene = humanSnapshot(sceneAt(ctx.mutable.state.workingPath));
  must(
    [...humanSnapshot(sceneAt(after.workingPath))].every(
      ([id, value]) => retryScene.get(id) === value,
    ),
    "retry preserves all working annotations",
  );
  ctx.mutable.working = openWorking(ctx, "open-working-after-retry");
  log(ctx, "concurrent-human-save-during-refresh", {
    burned: record.token,
    retry: retry["committedToken"],
  });
}

export function runRestore(ctx: JourneyContext): void {
  const snapshotScene = parseSceneMarkdown(
    readFileSync(join(ctx.history, "revisions", "cas-1", "snapshot.excalidraw.md"), "utf8"),
  ).scene;
  const restored = noteJson(
    ctx,
    "restore-as-new-token",
    noteArgs(ctx, "restore", [
      "--artifact-id",
      ARTIFACT,
      "--revision-token",
      "cas-1",
      "--expected-token",
      stateOf(ctx.vault, ctx.project, ARTIFACT).committedToken,
      "--json",
    ]),
    0,
  );
  ctx.mutable.state = stateOf(ctx.vault, ctx.project, ARTIFACT);
  must(
    String(restored["committedToken"]) === ctx.mutable.state.committedToken &&
      tokenIndex(ctx.mutable.state.committedToken) >= 2,
    "restore committed a fresh token",
  );
  must(
    stableStringify(sceneAt(ctx.mutable.state.workingPath)) === stableStringify(snapshotScene),
    "restored working copy equals the immutable revision snapshot",
  );
  ctx.mutable.working = openWorking(ctx, "open-working-after-restore");
  const svgAbsolute = join(ctx.projectBase, "_generated", "drawings", `${ARTIFACT}.svg`);
  assertEmbedding(
    join(ctx.projectBase, "01 Architecture", `${ARTIFACT}.md`),
    svgAbsolute,
    relative(ctx.vault, ctx.mutable.state.workingPath),
    relative(ctx.vault, svgAbsolute),
  );
  log(ctx, "restore-as-new-token", {
    token: restored["committedToken"],
    working: relative(ctx.vault, ctx.mutable.state.workingPath),
  });
}
