import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RuntimeError } from "../../src/errors";
import { encodeSceneToMarkdown } from "../../src/excalidraw-file";
import { ARTIFACT, type JourneyContext, log, must } from "./desktop-journey";
import { refreshWithInjection, stateOf } from "./desktop-live";
import {
  burnedTokens,
  humanSnapshot,
  immutableSnapshot,
  noteArgs,
  sceneAt,
  unchangedRevisions,
} from "./desktop-support";
import { command } from "./renderer-live-support";

export function runFailureMatrix(ctx: JourneyContext, failures: string): void {
  writeFileSync(join(ctx.temp, "malformed.json"), '{"artifactId":"broken"');
  const results: Record<string, unknown> = {};
  const current = () => stateOf(ctx.vault, ctx.project, ARTIFACT);
  for (const name of failures.split(",")) {
    const before = immutableSnapshot(ctx.history);
    const beforeHumans = humanSnapshot(sceneAt(current().workingPath));
    const beforeBurn = burnedTokens(ctx.history);
    if (name === "malformed") {
      const failed = command(
        noteArgs(ctx, "refresh", [
          "--spec",
          join(ctx.temp, "malformed.json"),
          "--expected-token",
          current().committedToken,
          "--json",
        ]),
        process.env,
      );
      must(failed.exitCode === 2, `malformed exits 2, saw ${failed.exitCode}`);
      results[name] = { exitCode: failed.exitCode };
    } else if (name === "stale-token") {
      const failed = command(
        noteArgs(ctx, "refresh", [
          "--spec",
          join(ctx.temp, "refresh-v2.json"),
          "--expected-token",
          "cas-0",
          "--json",
        ]),
        process.env,
      );
      must(failed.exitCode === 3, `stale token exits 3, saw ${failed.exitCode}`);
      results[name] = { exitCode: failed.exitCode };
    } else if (name === "concurrent-refresh") {
      const token = current().committedToken;
      const spawnOne = () =>
        Bun.spawnSync(
          noteArgs(ctx, "refresh", [
            "--spec",
            join(ctx.temp, "refresh-retry.json"),
            "--expected-token",
            token,
            "--json",
          ]),
          { stdout: "pipe", stderr: "pipe" },
        );
      const codes = [spawnOne(), spawnOne()]
        .map((entry) => entry.exitCode)
        .sort((left, right) => left - right);
      must(
        codes[0] === 0 && codes[1] === 3,
        `concurrent refresh yields one success and one conflict, saw ${codes}`,
      );
      results[name] = { exitCodes: codes };
    } else if (name === "working-hash-change") {
      const stateBefore = current();
      const injected = refreshWithInjection({
        vault: ctx.vault,
        project: ctx.project,
        spec: ctx.v2,
        expectedToken: stateBefore.committedToken,
        boundary: "prepared-parent-fsync",
        inject: () => {
          const scene = sceneAt(stateBefore.workingPath);
          scene.elements.push({
            id: "human-hash-change-task12",
            type: "text",
            x: 40,
            y: 640,
            width: 220,
            height: 40,
            text: "working hash change",
          });
          writeFileSync(stateBefore.workingPath, encodeSceneToMarkdown(scene));
        },
      });
      must(injected.kind === "conflict", "working hash change forces a CAS abort");
      const afterBurn = burnedTokens(ctx.history);
      must(
        afterBurn.length === beforeBurn.length + 1,
        "burn recorded for the working-hash-change abort",
      );
      const token = afterBurn.find((entry) => !beforeBurn.includes(entry)) ?? "";
      const record = JSON.parse(readFileSync(join(ctx.history, "burned", token), "utf8")) as {
        token: string;
        reason: string;
      };
      ctx.burns.push({
        token: record.token,
        reason: record.reason,
        phase: name,
        stateUnchanged: true,
        abandonedRevisionAbsent: !existsSync(join(ctx.history, "revisions", record.token)),
      });
      results[name] = { kind: injected.kind, burned: record.token };
    } else throw new RuntimeError(`unknown failure case: ${name}`);
    const afterState = current();
    must(
      unchangedRevisions(before, immutableSnapshot(ctx.history)),
      `${name}: no immutable mutation beyond the allowed commit`,
    );
    const afterHumans = humanSnapshot(sceneAt(afterState.workingPath));
    must(
      [...beforeHumans].every(([id, value]) => afterHumans.get(id) === value),
      `${name}: working preserved`,
    );
    ctx.mutable.state = afterState;
  }
  log(ctx, "failures", results);
}
