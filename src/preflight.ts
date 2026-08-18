import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { RuntimeError } from "./errors";

const enabledPluginSchema = z.array(
  z.object({ id: z.string(), version: z.string() }).passthrough(),
);
const registrySchema = z
  .object({
    vaults: z.record(z.string(), z.object({ path: z.string() }).passthrough()),
  })
  .passthrough();
const readinessSchema = z.object({
  sentinel: z.literal("VISUAL_NOTE_EXCALIDRAW_READY"),
  loaded: z.literal(true),
  id: z.literal("obsidian-excalidraw-plugin"),
  automatePresent: z.literal(true),
  getAPI: z.literal(true),
  scriptEnginePresent: z.literal(true),
});

function run(cli: string, vault: string, command: readonly string[]): string {
  const result = Bun.spawnSync([cli, `vault=${vault}`, ...command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new RuntimeError(
      result.stderr.toString().trim() || `Obsidian CLI exited ${result.exitCode}`,
    );
  }
  return result.stdout.toString().trim();
}

function parseEval(stdout: string): unknown {
  const payload = stdout.startsWith("=> ") ? stdout.slice(3) : stdout;
  try {
    const first: unknown = JSON.parse(payload);
    return typeof first === "string" ? JSON.parse(first) : first;
  } catch (error) {
    throw new RuntimeError("Obsidian eval returned malformed readiness output", { cause: error });
  }
}

export type PreflightReceipt = {
  readonly schemaVersion: 1;
  readonly type: "VisualNotePreflightReceipt";
  readonly status: "READY";
  readonly expectedVault: string;
  readonly observedVault: string;
  readonly verifiedVaultId: string;
  readonly plugin: { readonly id: "obsidian-excalidraw-plugin"; readonly version: string };
  readonly scriptEngine: z.infer<typeof readinessSchema>;
};

export function preflight(cli: string, expectedVault: string): PreflightReceipt {
  try {
    accessSync(cli, constants.X_OK);
  } catch (error) {
    throw new RuntimeError(`Obsidian CLI is not executable: ${cli}`, { cause: error });
  }
  const home = process.env["HOME"];
  if (home === undefined)
    throw new RuntimeError("HOME is required to resolve the verified vault ID");
  let registry: z.infer<typeof registrySchema>;
  try {
    registry = registrySchema.parse(
      JSON.parse(
        readFileSync(
          join(home, "Library", "Application Support", "obsidian", "obsidian.json"),
          "utf8",
        ),
      ),
    );
  } catch (error) {
    throw new RuntimeError("cannot parse the supported Obsidian vault registry", { cause: error });
  }
  const registration = Object.entries(registry.vaults).find(
    (entry) => entry[1].path === expectedVault,
  );
  if (registration === undefined)
    throw new RuntimeError(`expected vault is not registered: ${expectedVault}`);
  const verifiedVaultId = registration[0];
  const observedVault = run(cli, verifiedVaultId, ["vault", "info=path"]);
  if (observedVault !== expectedVault)
    throw new RuntimeError(`wrong vault: expected ${expectedVault}, observed ${observedVault}`);
  const enabled = enabledPluginSchema.parse(
    JSON.parse(
      run(cli, verifiedVaultId, ["plugins:enabled", "filter=community", "versions", "format=json"]),
    ),
  );
  const plugin = enabled.find((entry) => entry.id === "obsidian-excalidraw-plugin");
  if (plugin === undefined) throw new RuntimeError("official Excalidraw plugin is not enabled");
  const code =
    "(()=>{const p=app.plugins.getPlugin('obsidian-excalidraw-plugin');const ea=window.ExcalidrawAutomate;return JSON.stringify({sentinel:'VISUAL_NOTE_EXCALIDRAW_READY',loaded:!!p,id:p?.manifest?.id,automatePresent:!!ea,getAPI:typeof ea?.getAPI==='function',scriptEnginePresent:!!p?.scriptEngine});})()";
  const scriptEngine = readinessSchema.parse(
    parseEval(run(cli, verifiedVaultId, ["eval", `code=${code}`])),
  );
  return {
    schemaVersion: 1,
    type: "VisualNotePreflightReceipt",
    status: "READY",
    expectedVault,
    observedVault,
    verifiedVaultId,
    plugin: { id: "obsidian-excalidraw-plugin", version: plugin.version },
    scriptEngine,
  };
}
