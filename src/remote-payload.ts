import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { artifactPaths } from "./artifact-files";
import { InputError } from "./errors";
import { type ExcalidrawScene, type JsonObject, parseSceneMarkdown } from "./excalidraw-file";
import { parseVisualNoteSpec, type VisualNoteSpec } from "./schema";

export type PublishFigure = {
  readonly spec: VisualNoteSpec;
  readonly scene: ExcalidrawScene;
  readonly verify: JsonObject[];
};

export type PublishPayload = {
  readonly projectId: string;
  readonly repoName: string;
  readonly commit: string | null;
  readonly figures: PublishFigure[];
};

type ArtifactFiles = { readonly spec: string; readonly drawing: string };
type Layout = {
  readonly name: "export-series" | "transactional";
  readonly artifactIds: readonly string[];
  readonly files: (artifactId: string) => ArtifactFiles;
};

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const manifestSchema = z.object({
  artifacts: z.array(z.object({ artifactId: z.string().regex(slug) })),
});
const leakPattern = /\/Users\/|\/home\/|\/private\/var\//;

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function readText(root: string, relativePath: string, label: string): string {
  const path = join(root, relativePath);
  if (!existsSync(path)) throw new InputError(`missing ${label}: ${relativePath}`);
  return readFileSync(path, "utf8");
}

function exportSeriesLayout(root: string, project: string): Layout | null {
  const base = `docs/vl/projects/${project}`;
  if (!existsSync(join(root, base, "manifest.json"))) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(readText(root, `${base}/manifest.json`, "manifest"));
  } catch (error) {
    throw new InputError(`malformed manifest JSON: ${base}/manifest.json`, { cause: error });
  }
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) throw new InputError(`invalid manifest: ${base}/manifest.json`);
  return {
    name: "export-series",
    artifactIds: parsed.data.artifacts.map((artifact) => artifact.artifactId),
    files: (artifactId) => ({
      spec: `${base}/specs/${artifactId}.json`,
      drawing: `${base}/${artifactId}.excalidraw.md`,
    }),
  };
}

function transactionalLayout(root: string, project: string): Layout | null {
  const specFolder = join(root, artifactPaths(project, "x").base, "_generated", "specs");
  if (!isDirectory(specFolder)) return null;
  const artifactIds = readdirSync(specFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .filter((artifactId) => slug.test(artifactId))
    .sort();
  return {
    name: "transactional",
    artifactIds,
    files: (artifactId) => {
      const paths = artifactPaths(project, artifactId);
      return { spec: paths.spec, drawing: paths.drawing };
    },
  };
}

function detectLayout(root: string, project: string): Layout {
  const exported = exportSeriesLayout(root, project);
  const transactional = transactionalLayout(root, project);
  if (exported !== null && transactional !== null) {
    throw new InputError(
      `project ${project} exists in both the export-series and transactional layouts; publish from a root with one`,
    );
  }
  const layout = exported ?? transactional;
  if (layout === null) {
    throw new InputError(
      `no atlas layout for project ${project}: expected docs/vl/projects/${project}/manifest.json or ${artifactPaths(project, "x").base}/_generated/specs/`,
    );
  }
  return layout;
}

function readSpec(root: string, relativePath: string, artifactId: string): VisualNoteSpec {
  let raw: unknown;
  try {
    raw = JSON.parse(readText(root, relativePath, "spec"));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(`malformed spec JSON: ${relativePath}`, { cause: error });
  }
  let spec: VisualNoteSpec;
  try {
    spec = parseVisualNoteSpec(raw);
  } catch (error) {
    throw new InputError(`invalid spec: ${relativePath}`, { cause: error });
  }
  if (spec.artifactId !== artifactId) {
    throw new InputError(`spec artifactId ${spec.artifactId} does not match ${relativePath}`);
  }
  return spec;
}

function readScene(root: string, relativePath: string): ExcalidrawScene {
  const markdown = readText(root, relativePath, "drawing");
  try {
    return parseSceneMarkdown(markdown).scene;
  } catch (error) {
    const detail = error instanceof InputError ? error.detail : "malformed Excalidraw scene";
    throw new InputError(`${detail}: ${relativePath}`, { cause: error });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scrubber(replacements: ReadonlyMap<string, string>): (value: string) => string {
  const rules = [...replacements.entries()]
    .filter(([prefix]) => prefix.length > 1)
    .sort(([left], [right]) => right.length - left.length);
  if (rules.length === 0) return (value) => value;
  const lookup = new Map(rules);
  const pattern = new RegExp(
    `(?:${rules.map(([prefix]) => escapeRegExp(prefix)).join("|")})(?![A-Za-z0-9._-])`,
    "g",
  );
  return (value) => value.replace(pattern, (prefix) => lookup.get(prefix) ?? prefix);
}

function childPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function scrubValue(value: unknown, path: string, scrub: (value: string) => string): unknown {
  if (typeof value === "string") {
    const scrubbed = scrub(value);
    const leak = leakPattern.exec(scrubbed);
    if (leak !== null) {
      throw new InputError(`absolute local path ${leak[0]} remains at ${path}`);
    }
    return scrubbed;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => scrubValue(item, `${path}[${index}]`, scrub));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const scrubbedKey = scrubValue(key, `${childPath(path, key)}<key>`, scrub);
      result[String(scrubbedKey)] = scrubValue(item, childPath(path, key), scrub);
    }
    return result;
  }
  return value;
}

export function buildPublishPayload(input: {
  readonly root: string;
  readonly project: string;
  readonly artifacts?: readonly string[];
  readonly repoName?: string;
}): PublishPayload {
  if (!slug.test(input.project)) throw new InputError(`invalid project slug: ${input.project}`);
  const root = resolve(input.root);
  if (!isDirectory(root)) throw new InputError(`atlas root is not a directory: ${input.root}`);
  const layout = detectLayout(root, input.project);
  const wanted = input.artifacts;
  if (wanted !== undefined) {
    const unknown = wanted.filter((artifactId) => !layout.artifactIds.includes(artifactId));
    if (unknown.length > 0) {
      throw new InputError(`unknown artifact(s) in ${layout.name} layout: ${unknown.join(", ")}`);
    }
  }
  const selected = layout.artifactIds.filter(
    (artifactId) => wanted === undefined || wanted.includes(artifactId),
  );
  const figures = selected.map((artifactId) => {
    const files = layout.files(artifactId);
    return {
      spec: readSpec(root, files.spec, artifactId),
      scene: readScene(root, files.drawing),
      verify: [],
    };
  });
  const lead = figures[0]?.spec;
  if (lead === undefined) throw new InputError(`no artifacts selected for ${input.project}`);
  const repoName = input.repoName ?? basename(lead.source.root);
  const replacements = new Map<string, string>();
  const home = process.env["HOME"];
  if (home !== undefined) replacements.set(resolve(home), "~");
  replacements.set(root, "~");
  replacements.set(realpathSync(root), "~");
  for (const figure of figures) replacements.set(figure.spec.source.root, repoName);
  const payload = {
    projectId: input.project,
    repoName,
    commit: lead.source.commit,
    figures,
  };
  return scrubValue(payload, "$", scrubber(replacements)) as PublishPayload;
}
