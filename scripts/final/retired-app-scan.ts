import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// The retired desktop note app's name; the character class keeps this file out of its own scan.
export const retiredAppPattern = /ob[s]idian/i;

// Every path under src/, scripts/, and tests/ (tests/tmp scratch excluded) whose name or
// content still names the retired desktop note app, relative to packageRoot and sorted.
export function retiredAppReferences(packageRoot: string): string[] {
  const hits: string[] = [];
  const scratch = join(packageRoot, "tests", "tmp");
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (path === scratch) continue;
      if (retiredAppPattern.test(entry.name)) hits.push(relative(packageRoot, path));
      else if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && retiredAppPattern.test(readFileSync(path, "utf8")))
        hits.push(relative(packageRoot, path));
    }
  };
  for (const top of ["src", "scripts", "tests"]) walk(join(packageRoot, top));
  return hits.sort();
}
