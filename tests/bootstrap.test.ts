import { describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { sha256 } from "../src/io";

const cli = join(import.meta.dir, "../bin/visual-note");
const bundle = join(import.meta.dir, "fixtures/sample-project/bundle.json");
// The fixture lives inside the skill checkout, where git would report the checkout's own HEAD;
// a copy outside any VCS checkout is the plain source these tests describe (commit: null).
const source = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-plain-source-")));
cpSync(join(import.meta.dir, "fixtures/sample-project/repo"), source, { recursive: true });

function tree(
  root: string,
): readonly { readonly path: string; readonly kind: string; readonly sha256: string | null }[] {
  const entries: { path: string; kind: string; sha256: string | null }[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const status = lstatSync(absolute);
      const path = relative(root, absolute);
      if (status.isDirectory()) {
        entries.push({ path, kind: "directory", sha256: null });
        visit(absolute);
        continue;
      }
      entries.push({
        path,
        kind: status.isFile() ? "file" : status.isSymbolicLink() ? "symlink" : "other",
        sha256: status.isFile() ? sha256(readFileSync(absolute)) : null,
      });
    }
  };
  visit(root);
  return entries;
}

function run(args: readonly string[]): {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = Bun.spawnSync([cli, ...args]);
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("bootstrap sample workflow", () => {
  test("bootstrap publishes the sample bundle once and is idempotent on rerun", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-bootstrap-root-")));

    const first = run([
      "bootstrap",
      "--root",
      root,
      "--project",
      "sample-agent-project",
      "--source",
      source,
      "--bundle",
      bundle,
      "--json",
    ]);
    const second = run([
      "bootstrap",
      "--root",
      root,
      "--project",
      "sample-agent-project",
      "--source",
      source,
      "--bundle",
      bundle,
      "--json",
    ]);

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(JSON.parse(first.stdout)).toEqual(
      expect.objectContaining({
        operation: "bootstrap",
        artifactCount: 10,
        source: { root: source, commit: null },
        publication: expect.objectContaining({ status: "CREATED" }),
      }),
    );
    expect(JSON.parse(second.stdout).publication.status).toBe("ALREADY_CURRENT");

    const projectRoot = join(root, "Engineering Atlas/10 Projects/sample-agent-project");
    expect(existsSync(join(projectRoot, "00 Map.md"))).toBe(true);
    expect(existsSync(join(projectRoot, "05 Study Notes/Prompt Recipes.md"))).toBe(true);
    expect(existsSync(join(projectRoot, "_generated/specs/project-map-atlas-shop.json"))).toBe(
      true,
    );
    expect(
      existsSync(
        join(projectRoot, "_generated/drawings/project-map-atlas-shop.working.cas-0.excalidraw.md"),
      ),
    ).toBe(true);
    expect(existsSync(join(projectRoot, "_history/project-map-atlas-shop/STATE"))).toBe(true);
    expect(readFileSync(join(projectRoot, "_generated/specs/source.json"), "utf8")).toContain(
      source,
    );
    expect(existsSync(join(projectRoot, "src"))).toBe(false);
  });

  test("bootstrap creates walkthrough assets that run through create extend refresh and restore", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-walkthrough-root-")));
    const project = "sample-agent-project";
    const bootstrap = run([
      "bootstrap",
      "--root",
      root,
      "--project",
      project,
      "--source",
      source,
      "--bundle",
      bundle,
      "--json",
    ]);
    expect(bootstrap.code).toBe(0);

    const assetRoot = join(root, `Engineering Atlas/10 Projects/${project}/_assets`);
    const create = join(assetRoot, "walkthrough-create.json");
    const extend = join(assetRoot, "walkthrough-extend.json");
    const refresh = join(assetRoot, "walkthrough-refresh-v2.json");

    expect(run(["validate", "--spec", create, "--json"]).code).toBe(0);
    expect(
      run(["create", "--root", root, "--project", project, "--spec", create, "--json"]).code,
    ).toBe(0);
    expect(run(["extend", "--spec", extend, "--json"]).code).toBe(0);

    const refreshed = run([
      "refresh",
      "--root",
      root,
      "--project",
      project,
      "--spec",
      refresh,
      "--expected-token",
      "cas-0",
      "--json",
    ]);
    expect(refreshed.code).toBe(0);
    expect(JSON.parse(refreshed.stdout)).toEqual(
      expect.objectContaining({ committedToken: "cas-1", artifactId: "project-map-atlas-shop" }),
    );

    const restored = run([
      "restore",
      "--root",
      root,
      "--project",
      project,
      "--artifact-id",
      "project-map-atlas-shop",
      "--revision-token",
      "cas-0",
      "--expected-token",
      "cas-1",
      "--json",
    ]);
    expect(restored.code).toBe(0);
    expect(JSON.parse(restored.stdout)).toEqual(
      expect.objectContaining({ committedToken: "cas-2", artifactId: "project-map-atlas-shop" }),
    );
  });

  test("bootstrap without a bundle still records source metadata and walkthrough assets", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-bootstrap-meta-")));

    const result = run([
      "bootstrap",
      "--root",
      root,
      "--project",
      "source-only",
      "--source",
      source,
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({ artifactCount: 0, source: { root: source, commit: null } }),
    );
    expect(
      existsSync(
        join(root, "Engineering Atlas/10 Projects/source-only/_assets/walkthrough-refresh-v2.json"),
      ),
    ).toBe(true);
  });

  test("fresh bootstrap output is byte-deterministic across independent runs", () => {
    const first = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-bootstrap-canonical-")));
    const second = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-bootstrap-canonical-")));
    for (const root of [first, second]) {
      const result = run([
        "bootstrap",
        "--root",
        root,
        "--project",
        "sample-agent-project",
        "--source",
        source,
        "--bundle",
        bundle,
        "--json",
      ]);
      expect(result.code).toBe(0);
    }

    expect(tree(join(first, "Engineering Atlas/10 Projects/sample-agent-project"))).toEqual(
      tree(join(second, "Engineering Atlas/10 Projects/sample-agent-project")),
    );
  });
});
