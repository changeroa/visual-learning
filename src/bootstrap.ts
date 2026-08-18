import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentProjectState } from "./bootstrap-current";
import { writeProjectNotes } from "./bootstrap-notes";
import { InputError } from "./errors";
import { jsonBytes, readJson } from "./io";
import { ensureMatchingVault, ensureRealDirectory } from "./path-guard";
import { publishProjectDirectory } from "./project-publish";
import { sceneFromSpec } from "./scene-bootstrap";
import { parseVisualNoteSpec, readSourceRevision, type VisualNoteSpec } from "./schema";
import { generateTemplateBundle } from "./template-generate";
import { parseTemplateBundle } from "./template-schema";
import { bootstrapTransaction } from "./transaction-engine";

const sourceReceiptName = "source.json";

function run(args: readonly string[]): string {
  const result = Bun.spawnSync([...args], { stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}

function readSourceMetadata(source: string): {
  readonly root: string;
  readonly commit: string | null;
} {
  const commit = readSourceRevision(source);
  if (commit === null) return { root: source, commit: null };
  if (run(["git", "-C", source, "status", "--porcelain", "--untracked-files=no"]) !== "") {
    throw new InputError(`source git worktree is dirty: ${source}`);
  }
  return { root: source, commit };
}

function walkthroughSpec(source: { readonly root: string; readonly commit: string | null }): {
  readonly create: VisualNoteSpec;
  readonly extend: VisualNoteSpec;
} {
  const base = parseVisualNoteSpec({
    schemaVersion: 1,
    artifactId: "walkthrough-call-map",
    kind: "code-exploration",
    revision: 1,
    title: "Walkthrough Call Map",
    source,
    nodes: [
      {
        semanticId: "route",
        label: "OrdersRouter\n요청 진입점",
        status: "fact",
        evidence: [{ path: "src/routes/orders.ts", symbol: "OrdersRouter" }],
      },
      {
        semanticId: "service",
        label: "CheckoutService\n주문 처리",
        status: "fact",
        evidence: [{ path: "src/services/CheckoutService.ts", symbol: "CheckoutService" }],
      },
    ],
    edges: [
      {
        semanticId: "route-service",
        from: "route",
        to: "service",
        label: "submitOrder()\n라우터가 서비스 호출",
        status: "fact",
        evidence: [{ path: "src/services/CheckoutService.ts", symbol: "submitOrder" }],
      },
    ],
  });
  return {
    create: base,
    extend: parseVisualNoteSpec({ ...base, revision: 2, title: "Walkthrough Call Map Extend" }),
  };
}

function bootstrapReceipt(
  vault: string,
  project: string,
  source: { readonly root: string; readonly commit: string | null },
  artifactCount: number,
  bundlePath: string | undefined,
  status: "CREATED" | "ALREADY_CURRENT",
): {
  readonly operation: "bootstrap";
  readonly project: string;
  readonly source: { readonly root: string; readonly commit: string | null };
  readonly artifactCount: number;
  readonly bundlePath: string | null;
  readonly walkthroughAssets: readonly string[];
  readonly publication: {
    readonly status: "CREATED" | "ALREADY_CURRENT";
    readonly targetProject: string;
  };
} {
  return {
    operation: "bootstrap",
    project,
    source,
    artifactCount,
    bundlePath: bundlePath ?? null,
    walkthroughAssets: [
      `Engineering Atlas/10 Projects/${project}/_assets/walkthrough-create.json`,
      `Engineering Atlas/10 Projects/${project}/_assets/walkthrough-extend.json`,
      `Engineering Atlas/10 Projects/${project}/_assets/walkthrough-refresh-v2.json`,
    ],
    publication: {
      status,
      targetProject: join(vault, "Engineering Atlas/10 Projects", project),
    },
  };
}

export function bootstrapProject(input: {
  readonly vault: string;
  readonly expectedVault: string;
  readonly project: string;
  readonly source: string;
  readonly bundlePath?: string;
}): unknown {
  const vault = ensureMatchingVault(input.vault, input.expectedVault);
  const source = ensureRealDirectory(input.source, "source");
  const metadata = readSourceMetadata(source);
  const current = currentProjectState({
    vault,
    project: input.project,
    metadata,
    ...(input.bundlePath === undefined ? {} : { bundlePath: input.bundlePath }),
  });
  if (current !== null) {
    return bootstrapReceipt(
      vault,
      input.project,
      metadata,
      current.artifactCount,
      input.bundlePath,
      "ALREADY_CURRENT",
    );
  }

  const stageVault = mkdtempSync(join(tmpdir(), "visual-note-bootstrap-"));
  try {
    const base = join(stageVault, "Engineering Atlas/10 Projects", input.project);
    for (const relativePath of [
      "01 Architecture",
      "02 ADR",
      "03 API",
      "04 Workflows",
      "05 Study Notes",
      "_generated/specs",
      "_generated/drawings",
      "_history",
      "_assets",
    ]) {
      mkdirSync(join(base, relativePath), { recursive: true });
    }
    writeFileSync(
      join(base, "_generated/specs", sourceReceiptName),
      jsonBytes({ schemaVersion: 1, source: metadata }),
    );

    const specs: VisualNoteSpec[] = [];
    if (input.bundlePath !== undefined) {
      const bundle = parseTemplateBundle(readJson(input.bundlePath));
      const generated = generateTemplateBundle(bundle, source);
      for (const view of generated.views) {
        const spec = parseVisualNoteSpec({ ...view.spec, source: metadata });
        specs.push(spec);
        bootstrapTransaction({
          vault: stageVault,
          project: input.project,
          spec,
          scene: sceneFromSpec(spec, "sample-bootstrap"),
        });
      }
    }
    const walkthrough = walkthroughSpec(metadata);
    const refreshBase = specs.find((spec) => spec.kind === "project-map") ?? walkthrough.create;
    writeFileSync(join(base, "_assets/walkthrough-create.json"), jsonBytes(walkthrough.create));
    writeFileSync(join(base, "_assets/walkthrough-extend.json"), jsonBytes(walkthrough.extend));
    writeFileSync(
      join(base, "_assets/walkthrough-refresh-v2.json"),
      jsonBytes(
        parseVisualNoteSpec({
          ...refreshBase,
          revision: refreshBase.revision + 1,
          title: `${refreshBase.title} (Refresh)`,
        }),
      ),
    );
    writeProjectNotes(stageVault, input.project, metadata, specs, refreshBase.artifactId);
    publishProjectDirectory(
      join(stageVault, "Engineering Atlas/10 Projects", input.project),
      join(vault, "Engineering Atlas/10 Projects", input.project),
    );
    return bootstrapReceipt(
      vault,
      input.project,
      metadata,
      specs.length,
      input.bundlePath,
      "CREATED",
    );
  } finally {
    rmSync(stageVault, { recursive: true, force: true });
  }
}
