import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputError } from "../src/errors";
import { encodeSceneToMarkdown, parseSceneMarkdown } from "../src/excalidraw-file";
import { jsonBytes } from "../src/io";
import { buildPublishPayload } from "../src/remote-payload";

const fixtures = join(import.meta.dir, "fixtures/hosted/payload");
const exportRoot = join(fixtures, "export-series");
const transactionalRoot = join(fixtures, "transactional");
const exportProject = "docs/vl/projects/visual-learning";
const specPath = `${exportProject}/specs/vl-01-architecture.json`;
const drawingPath = `${exportProject}/vl-01-architecture.excalidraw.md`;
const originalHome = process.env["HOME"];
const temporaryRoots: string[] = [];

afterEach(() => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copyFixture(source: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-learning-payload-")));
  temporaryRoots.push(root);
  cpSync(source, root, { recursive: true });
  return root;
}

function setVerifyHow(root: string, how: string): void {
  const path = join(root, specPath);
  const spec = JSON.parse(readFileSync(path, "utf8")) as {
    learning: { verify: { how: string }[] };
  };
  const step = spec.learning.verify[0];
  if (step === undefined) throw new TypeError("fixture must have a verify step");
  step.how = how;
  writeFileSync(path, jsonBytes(spec));
}

function setSourceRoot(root: string, sourceRoot: string): void {
  const path = join(root, specPath);
  const spec = JSON.parse(readFileSync(path, "utf8")) as { source: { root: string } };
  spec.source.root = sourceRoot;
  writeFileSync(path, jsonBytes(spec));
}

function inputError(run: () => unknown): InputError {
  try {
    run();
  } catch (error) {
    if (error instanceof InputError) return error;
    throw error;
  }
  throw new Error("expected InputError");
}

describe("publish payload builder", () => {
  test("builds a scrubbed payload from the export-series layout", () => {
    // Given
    const drawing = readFileSync(join(exportRoot, drawingPath), "utf8");
    // When
    const payload = buildPublishPayload({ root: exportRoot, project: "visual-learning" });
    // Then
    expect(payload.projectId).toBe("visual-learning");
    expect(payload.repoName).toBe("visual-learning");
    expect(payload.commit).toBe("d6495cd8a82322d5c7220e8c7ea92a2dabe4128d");
    expect(payload.figures.map((figure): string => figure.spec.artifactId)).toEqual([
      "vl-01-architecture",
      "vl-02-export-series",
    ]);
    expect(payload.figures[0]?.scene).toEqual(parseSceneMarkdown(drawing).scene);
    expect(payload.figures[0]?.verify).toEqual([]);
    expect(payload.figures[0]?.spec.source.root).toBe("visual-learning");
    expect(JSON.stringify(payload)).not.toContain("/Users/");
  });

  test("builds the same payload from the transactional layout", () => {
    // Given
    const expected = buildPublishPayload({ root: exportRoot, project: "visual-learning" });
    // When
    const payload = buildPublishPayload({ root: transactionalRoot, project: "visual-learning" });
    // Then
    expect(payload).toEqual(expected);
  });

  test("uses the current drawing so human edits are published", () => {
    // Given
    const root = copyFixture(exportRoot);
    const { scene } = parseSceneMarkdown(readFileSync(join(root, drawingPath), "utf8"));
    const human = { id: "human-sticky", type: "rectangle", x: 1, y: 2, width: 30, height: 40 };
    writeFileSync(
      join(root, drawingPath),
      encodeSceneToMarkdown({ ...scene, elements: [...scene.elements, human] }),
    );
    // When
    const payload = buildPublishPayload({ root, project: "visual-learning" });
    // Then
    expect(payload.figures[0]?.scene.elements.at(-1)).toEqual(human);
  });

  test("includes only the named artifacts and honors an explicit repo name", () => {
    // When
    const payload = buildPublishPayload({
      root: transactionalRoot,
      project: "visual-learning",
      artifacts: ["vl-02-export-series"],
      repoName: "atlas-repo",
    });
    // Then
    expect(payload.repoName).toBe("atlas-repo");
    expect(payload.figures.map((figure): string => figure.spec.artifactId)).toEqual([
      "vl-02-export-series",
    ]);
    expect(payload.figures[0]?.spec.source.root).toBe("atlas-repo");
    expect(
      inputError(() =>
        buildPublishPayload({ root: exportRoot, project: "visual-learning", artifacts: ["nope"] }),
      ).message,
    ).toContain("unknown artifact(s) in export-series layout: nope");
  });

  test("rewrites source root, atlas root, and home prefixes longest first", () => {
    // Given
    const root = copyFixture(exportRoot);
    process.env["HOME"] = "/Users/victor";
    setVerifyHow(
      root,
      `a /Users/victor/projects/visual-learning/src/cli.ts b /Users/victor/notes/x.md c ${root}/docs/y d /Users/victor/projects/visual-learning-wt/z`,
    );
    // When
    const payload = buildPublishPayload({ root, project: "visual-learning" });
    // Then
    expect(payload.figures[0]?.spec.learning?.verify[0]?.how).toBe(
      "a visual-learning/src/cli.ts b ~/notes/x.md c ~/docs/y d ~/projects/visual-learning-wt/z",
    );
  });

  test("rewrites to the repo name when the source root equals the atlas root", () => {
    // Given
    const root = copyFixture(exportRoot);
    process.env["HOME"] = "/Users/someone-else";
    setSourceRoot(root, root);
    setVerifyHow(root, `open ${root}/notes/x.md`);
    // When
    const payload = buildPublishPayload({ root, project: "visual-learning", repoName: "repo" });
    // Then
    expect(payload.figures[0]?.spec.learning?.verify[0]?.how).toBe("open repo/notes/x.md");
    expect(payload.figures[0]?.spec.source.root).toBe("repo");
  });

  test("rewrites the longer atlas root first when it sits inside the source root", () => {
    // Given
    const sourceRoot = realpathSync(mkdtempSync(join(tmpdir(), "visual-learning-payload-src-")));
    temporaryRoots.push(sourceRoot);
    const root = join(sourceRoot, "atlas");
    cpSync(exportRoot, root, { recursive: true });
    process.env["HOME"] = "/Users/someone-else";
    setSourceRoot(root, sourceRoot);
    setVerifyHow(root, `a ${root}/notes/x.md b ${sourceRoot}/src/cli.ts`);
    // When
    const payload = buildPublishPayload({ root, project: "visual-learning", repoName: "repo" });
    // Then
    expect(payload.figures[0]?.spec.learning?.verify[0]?.how).toBe(
      "a ~/notes/x.md b repo/src/cli.ts",
    );
  });

  test("rejects a remaining absolute local path and names its JSON path", () => {
    // Given
    const root = copyFixture(exportRoot);
    process.env["HOME"] = "/Users/someone-else";
    setVerifyHow(root, "inspect /private/var/x first");
    // When
    const error = inputError(() => buildPublishPayload({ root, project: "visual-learning" }));
    // Then
    expect(error.message).toBe(
      "absolute local path /private/var/ remains at $.figures[0].spec.learning.verify[0].how",
    );
  });

  test("rejects a root with neither layout", () => {
    // Given
    const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-learning-payload-empty-")));
    temporaryRoots.push(root);
    // When
    const error = inputError(() => buildPublishPayload({ root, project: "visual-learning" }));
    // Then
    expect(error.message).toContain("no atlas layout for project visual-learning");
  });

  test("rejects malformed spec JSON with its relative path", () => {
    // Given
    const root = copyFixture(exportRoot);
    writeFileSync(join(root, specPath), "{ not json");
    // When
    const error = inputError(() => buildPublishPayload({ root, project: "visual-learning" }));
    // Then
    expect(error.message).toBe(`malformed spec JSON: ${specPath}`);
  });

  test("rejects a missing drawing file with its relative path", () => {
    // Given
    const root = copyFixture(transactionalRoot);
    const drawing =
      "Engineering Atlas/10 Projects/visual-learning/_generated/drawings/vl-02-export-series.excalidraw.md";
    rmSync(join(root, drawing));
    // When
    const error = inputError(() => buildPublishPayload({ root, project: "visual-learning" }));
    // Then
    expect(error.message).toBe(`missing drawing: ${drawing}`);
  });
});
