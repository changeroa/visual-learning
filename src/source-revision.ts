import { z } from "zod";

export function readSourceRevision(source: string): string | null {
  const result = Bun.spawnSync(["git", "-C", source, "rev-parse", "--verify", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin" },
  });
  if (result.exitCode !== 0) return null;
  return z
    .string()
    .regex(/^[0-9a-f]{40,64}$/)
    .parse(result.stdout.toString().trim());
}
