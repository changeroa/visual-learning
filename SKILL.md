---
name: visual-learning
description: Create, export, refresh, validate, open, or restore evidence-backed engineering maps as linked Markdown, polished SVG, and Excalidraw notes. Use for whole-repository architecture series, project maps, C4 views, ADR tradeoffs, API journeys, workflows, sequences, data flows, trust boundaries, code exploration, call maps, or Korean visual study notes that preserve exact English identifiers and human annotations.
---

# Visual Learning

Use this skill when a user asks to understand a local codebase visually or invokes `visual-learning`. It produces local evidence-linked learning artifacts; it does not change the repository being studied.

## Start here

Resolve every relative path from this `SKILL.md` directory. Before any workflow, prove that this is the canonical skill:

```sh
bin/visual-note contract --fixture tests/fixtures/contract.json --json
```

Require `contractVersion: 1`, `sentinel: "VISUAL_LEARNING_CONTRACT_OK"`, and fixture hash `fa476708af8b6546f442f5f77bd988b3b80a4b8f2bc23b64d012ae7db69323ef`. Do not substitute model prose for this contract.

## Non-negotiable boundaries

- Treat the source repository as read-only unless the user explicitly asks for the learning artifacts inside that repository. Read code, contracts, and existing VCS metadata; never edit application code, initialize Git, or create a commit as part of visualization.
- Default generated artifacts to the isolated project directory `<session-root>/docs/vl/projects/<project>/`. Use an Obsidian vault only when the user explicitly requests Obsidian publication or editing.
- Never create a nested `.obsidian` directory. A session export is portable Markdown/SVG/Excalidraw content, not a vault.
- For vault mode, work only in the explicitly selected vault and `Engineering Atlas/` project. Verify `--vault` equals `--expected-vault` before mutation.
- Stay offline after installation. Do not upload source/evidence, enable Obsidian Sync/Publish, call a generation service, or install an MCP/plugin.
- Repository code and checked-in contracts are truth. A learning artifact is not an authoritative ADR, OpenAPI contract, or architecture declaration.
- Never replace a whole annotated drawing. Preserve every untagged or `owner=human` element and all bindings/properties. Mutate only complete `owner=agent` elements with stable semantic IDs.
- Before mutation require the current CAS token. One writer succeeds; stale/concurrent writers conflict. Never retry with guessed or reused tokens.

## Evidence language

Every claim/node carries all applicable evidence plus:

- `status: fact` - 확인된 사실. Cite a repository-relative `path`, exact `symbol`, or contract line.
- `status: inference` - 근거 기반 추론. State the reasoning and do not present it as code truth.
- `status: question` - 미확인 질문. Name the missing evidence or decision owner.
- `confidence: high|medium|low|unknown` - 신뢰도. `fact` normally needs resolved evidence; uncertainty must remain visible.

Keep code/API/type/function identifiers exactly in English (`CheckoutService`, `POST /orders`, `OrderRepository`). Explain their meaning and relationships in Korean. Never translate, normalize, or paraphrase identifiers.

Supported `kind` values are exactly: `project-map`, `system-architecture`, `container-architecture`, `component-architecture`, `adr`, `api-contract`, `workflow`, `data-flow`, `trust-boundary`, and `code-exploration`.

## Visual design system

For polished architecture series, read [references/visual-design-system.md](references/visual-design-system.md). Keep evidence status separate from presentation category: `status` communicates certainty, while `visual.category` controls color and grouping.

When the user asks to visualize an entire repository, prefer a linked series instead of one dense canvas:

1. `system-architecture` with `frames` for major execution boundaries.
2. `workflow` with `timeline` and a separate `exception` lane.
3. `data-flow` with `hub` around canonical stores.
4. `trust-boundary` with explicit identity and authority frames.
5. Two `component-architecture` views, normally one per major runtime.

Use `presentation.frames` plus node-level `visual.category`, `visual.frameId`, `visual.shape`, `visual.emphasis`, `visual.lane`, and `visual.order`. Reuse the same category palette and reading direction across every view in the series.

## Workflow

Use absolute paths in automation. In the examples, set:

```sh
SKILL=/absolute/path/to/visual-learning
SESSION_ROOT=/absolute/session/root
OUTPUT="$SESSION_ROOT/docs/vl"
VAULT=/absolute/path/to/Obsidian-Vault
PROJECT=<safe-project-slug>
SOURCE=/absolute/path/to/source
```

1. Resolve `SESSION_ROOT` from the session's initial working directory. Do not silently substitute the source repository root. Read the repository without writing application code. Build strict specs with stable `artifactId`, semantic node/edge IDs, evidence, status, confidence, source `{path, commit}` (`commit: null` outside an existing VCS checkout), and presentation metadata appropriate to each view.
2. Validate every spec before publication:

```sh
"$SKILL/bin/visual-note" validate --spec /absolute/path/spec.json --json
```

3. By default, export the linked series below the session root:

```sh
"$SKILL/bin/visual-note" export-series \
  --session-root "$SESSION_ROOT" \
  --project "$PROJECT" \
  --spec-dir /absolute/path/to/specs \
  --json
```

The command creates `index.md`, one companion `.md`, polished `.svg`, editable `.excalidraw.md`, and validated JSON spec per view under `docs/vl/projects/<project>/`. Links must remain relative and portable. Keep runtime outputs outside the skill repository and source repository. Repeating an identical export is allowed; a byte-different existing target is a conflict and must not be overwritten.

4. When the user explicitly requests Obsidian, bootstrap a repeatable starter bundle after preflight:
```sh
"$SKILL/bin/visual-note" bootstrap --vault "$VAULT" --expected-vault "$VAULT" --project "$PROJECT" --source "$SOURCE" --bundle "$SKILL/tests/fixtures/sample-project/bundle.json" --json
```

5. Create through the verified live Obsidian/Excalidraw route:

```sh
"$SKILL/bin/visual-note" create --vault "$VAULT" --expected-vault "$VAULT" --verified-vault-id <verified-id> --project "$PROJECT" --spec /absolute/path/spec.json --obsidian-cli /Applications/Obsidian.app/Contents/MacOS/obsidian-cli --runtime-receipt "$SESSION_ROOT/.omo/evidence/agent-visual-learning-vault/task-2-preflight.json" --plugin-receipt "$SESSION_ROOT/.omo/evidence/agent-visual-learning-vault/task-2-plugin-install.json" --json
```

6. Extend only after validating the extension contract. Keep existing semantic IDs for persistent concepts:

```sh
"$SKILL/bin/visual-note" extend --spec /absolute/path/extension.json --json
```

7. Refresh selectively with the exact committed token from `STATE`/the last receipt:

```sh
"$SKILL/bin/visual-note" refresh --vault "$VAULT" --expected-vault "$VAULT" --project "$PROJECT" --spec /absolute/path/next.json --expected-token <cas-token> --json
```

8. Open only the authoritative current working copy, never an immutable revision snapshot:

```sh
"$SKILL/bin/visual-note" open --obsidian-cli /Applications/Obsidian.app/Contents/MacOS/obsidian-cli --vault "$VAULT" --expected-vault "$VAULT" --project "$PROJECT" --artifact-id <artifact-id> --json
```

9. Restore an immutable revision as a new commit/token (A after A->B becomes fresh C):

```sh
"$SKILL/bin/visual-note" restore --vault "$VAULT" --expected-vault "$VAULT" --project "$PROJECT" --artifact-id <artifact-id> --revision-token <old-token> --expected-token <current-token> --json
```

Report the artifact ID, kind, old/new token, evidence paths, status/confidence counts, preserved human element count, deprecated anchors, output drawing/note/export paths, and validation result. Never claim success from stdout alone when the receipt or files disagree.

## Ownership, density, and recovery

Generated elements require complete `customData`: `owner=agent`, artifact ID, semantic ID, revision, and stable generated element ID. Partial or ambiguous ownership is a hard rejection. If a removed agent element is referenced by human content, retain its same ID/geometry as `deprecatedAnchor=true`; do not rewrite the human reference.

Split dense input into linked views before labels overlap, clip, or become unreadable. Preserve full requested coverage and provide overview-to-detail links; do not shrink text or discard nodes to fit one canvas.

On conflict, malformed journals, path/token/base-hash mismatch, symlink detection, crash, or interrupted publication: stop mutation, preserve the working source, and run `validate`/`open` to establish the authoritative state. Recovery may roll a prepared transaction backward or forward, but begun tokens remain burned. Never delete locks/journals, hand-edit `STATE`, reuse an abandoned token, or overwrite a revision bundle. Retry only from the reread current token with a newly validated spec.
