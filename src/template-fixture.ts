import { readJson } from "./io";
import { type GeneratedBundle, generateTemplateBundle } from "./template-generate";
import { parseTemplateBundle, resolveRepositoryRoot, type TemplateBundle } from "./template-schema";

export type LoadedTemplateFixture = {
  readonly path: string;
  readonly bundle: TemplateBundle;
  readonly repositoryRoot: string;
};

export function loadTemplateFixture(path: string): LoadedTemplateFixture {
  const bundle = parseTemplateBundle(readJson(path));
  return {
    path,
    bundle,
    repositoryRoot: resolveRepositoryRoot(path, bundle),
  };
}

export function generateTemplateFixture(path: string): GeneratedBundle {
  const fixture = loadTemplateFixture(path);
  return generateTemplateBundle(fixture.bundle, fixture.repositoryRoot);
}
