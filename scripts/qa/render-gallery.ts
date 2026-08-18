#!/usr/bin/env bun
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseOptions, required } from "../../src/arguments";
import { type BundlePublishControl, publishBundleAtomically } from "../../src/bundle-transaction";
import { validateBundleLayout } from "../../src/layout-check";
import { renderGallerySvg } from "../../src/svg-gallery";
import { generateTemplateFixture } from "../../src/template-fixture";

function bundleFixtures(root: string): readonly string[] {
  return ["gallery/bundle.json", "dense/bundle.json"].map((path) => join(root, path));
}

function pngMetadata(path: string): { readonly width: number; readonly height: number } {
  const probe = Bun.spawnSync(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = probe.stdout.toString();
  const width = Number(stdout.match(/pixelWidth: (\d+)/)?.[1] ?? "0");
  const height = Number(stdout.match(/pixelHeight: (\d+)/)?.[1] ?? "0");
  if (probe.exitCode !== 0 || width <= 0 || height <= 0) throw new TypeError("PNG probe failed");
  return { width, height };
}

function controlFromEnv(): BundlePublishControl {
  const value = process.env["VISUAL_NOTE_GALLERY_TX_INJECT"];
  const marker = process.env["VISUAL_NOTE_GALLERY_TX_MARK"];
  const hold = process.env["VISUAL_NOTE_GALLERY_TX_HOLD"];
  const control =
    value === undefined
      ? {}
      : value === "fail-before-first-publish"
        ? { failAt: "before-first-publish" as const }
        : value === "fail-between-publishes"
          ? { failAt: "between-publishes" as const }
          : value === "fail-parent-fsync-after-png-publish"
            ? { failAt: "parent-fsync-after-png-publish" as const }
            : value === "interrupt-between-publishes"
              ? { interruptAt: "between-publishes" as const }
              : value === "sigterm-between-publishes"
                ? { signalAt: "between-publishes" as const }
                : (() => {
                    throw new TypeError(`unknown VISUAL_NOTE_GALLERY_TX_INJECT: ${value}`);
                  })();
  const next =
    marker === undefined
      ? control
      : marker === "between-publishes"
        ? { ...control, markAt: "between-publishes" as const }
        : (() => {
            throw new TypeError(`unknown VISUAL_NOTE_GALLERY_TX_MARK: ${marker}`);
          })();
  if (hold === undefined) return next;
  if (hold !== "between-publishes")
    throw new TypeError(`unknown VISUAL_NOTE_GALLERY_TX_HOLD: ${hold}`);
  return { ...next, holdAt: "between-publishes" };
}

function main(): void {
  const options = parseOptions(Bun.argv.slice(2), new Set(["--fixtures", "--out"]));
  const fixturesRoot = resolve(required(options, "--fixtures"));
  const out = resolve(required(options, "--out"));
  const pngOut = join(dirname(out), "task-8-gallery.png");
  const generated = bundleFixtures(fixturesRoot).map((path) => generateTemplateFixture(path));
  const layouts = generated.flatMap((bundle) => validateBundleLayout(bundle.views));
  const views = generated.flatMap((bundle) => bundle.views);
  const rendered = renderGallerySvg(views);
  const tempRoot = mkdtempSync(join(dirname(out), "task-8-gallery-stage-"));
  const svgPath = join(tempRoot, "gallery.svg");
  const stagedPng = join(tempRoot, "task-8-gallery.png");
  const stagedJson = join(tempRoot, "task-8-gallery.json");
  const cleanup = (): void => rmSync(tempRoot, { recursive: true, force: true });
  const onTerm = (): never => {
    cleanup();
    process.exit(143);
  };
  process.once("SIGTERM", onTerm);
  try {
    writeFileSync(svgPath, rendered.svg);
    const raster = Bun.spawnSync(["sips", "-s", "format", "png", svgPath, "--out", stagedPng], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (raster.exitCode !== 0) {
      throw new TypeError(raster.stderr.toString().trim() || "sips rasterization failed");
    }
    const metadata = pngMetadata(stagedPng);
    const receipt = {
      schemaVersion: 1,
      type: "Task8GalleryReceipt",
      status: "PASS",
      fixtureBundles: generated.map((bundle) => ({
        bundleId: bundle.bundleId,
        viewCount: bundle.views.length,
        coverage: bundle.coverage,
      })),
      layoutCount: layouts.length,
      totalViews: views.length,
      png: { path: pngOut, width: metadata.width, height: metadata.height },
      realisticScale: metadata.width >= 1600 && metadata.height >= 900,
    } as const;
    writeFileSync(stagedJson, `${JSON.stringify(receipt, null, 2)}\n`);
    publishBundleAtomically(
      {
        jsonTarget: out,
        pngTarget: pngOut,
        stagedJson,
        stagedPng,
        tempRoot,
      },
      controlFromEnv(),
    );
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } finally {
    process.off("SIGTERM", onTerm);
    cleanup();
  }
}

main();
