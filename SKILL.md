---
name: visual-learning
description: Create, export, refresh, validate, restore, or publish evidence-backed engineering maps as linked Markdown, SVG, Excalidraw notes, or renderer-independent JSON for local interactive web views, and publish named projects to the private hosted atlas for reading and editing. Use to explain codebase architecture, DB schemas and collection relationships, API-to-data journeys, state transitions, workflows, data lineage, ADR tradeoffs, trust boundaries, call maps, or commit comparisons. Organize explanations around reader questions while preserving exact identifiers and human annotations.
---

# Visual Learning

Use this skill when a user asks to understand a local codebase visually or invokes `visual-learning`. It produces local evidence-linked learning artifacts offline; it does not change the repository being studied. The reader opens published projects in the private hosted atlas at `https://atlas.iyendev.com`, where figures can be read, drawn on, and annotated with notes; only projects the user names are published.

## Start here

Resolve every relative path from this `SKILL.md` directory. Before any workflow, prove that this is the canonical skill:

```sh
bin/visual-note contract --fixture tests/fixtures/contract.json --json
```

Require `contractVersion: 1`, `sentinel: "VISUAL_LEARNING_CONTRACT_OK"`, and fixture hash `fa476708af8b6546f442f5f77bd988b3b80a4b8f2bc23b64d012ae7db69323ef`. Do not substitute model prose for this contract.

## Non-negotiable boundaries

- Treat the source repository as read-only unless the user explicitly asks for the learning artifacts inside that repository. Read code, contracts, and existing VCS metadata; never edit application code, initialize Git, or create a commit as part of visualization.
- Default generated artifacts to the isolated project directory `<session-root>/docs/vl/projects/<project>/`. Use the transactional layout (`create`/`refresh`/`restore` with `--root`) only when the user wants CAS-tracked revisions under an explicitly chosen root; it writes `<root>/Engineering Atlas/10 Projects/<project>/`.
- `--root` must be a normalized absolute path to an existing real directory the user selected. Never create editor or app configuration directories inside a generated tree; an export is portable Markdown/SVG/Excalidraw content.
- Generation is offline. The only network use is an explicit `publish` or `pull` of named projects to the private atlas (default remote `https://atlas.iyendev.com`). Publish only projects the user names. Do not upload anything else, call a generation service, or install an MCP/plugin.
- Publish scrubs absolute local paths (home, `--root`, `--repo-root`, and each spec's source root) and refuses to send a payload in which one remains. Verify commands are recorded locally from a strict read-only allowlist; the hosted app only displays recorded output and never executes a command.
- Never print, log, paste into evidence, or commit publish credentials.
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

## DB and API information design

When explaining database structure, API behavior, or why an existing technical explainer is hard to
understand, read [references/db-api-information-design.md](references/db-api-information-design.md)
before selecting views. It covers question-to-figure selection, document containment versus
references, verified API reads/writes, linked exploration, and comprehension review.

For broad DB/API learning requests, organize the reading path as **system overview → one user
scenario → API calls and data changes → document relationships → field details**. Adapt this path
to the user's question; a request for one relationship or one endpoint does not require a full series.
Keep a field dictionary available as a lookup layer, not the default explanation of a whole system.

Use the existing `kind` values and renderer contracts. ERDs, state diagrams, and CRUD matrices are
explanation forms, not new accepted JSON enums. Preserve uncertainty about call edges, writes,
cardinality, and transactions: a matching symbol or valid schema alone does not prove behavior.

## Visual design system

For polished architecture series, read [references/visual-design-system.md](references/visual-design-system.md). Keep evidence status separate from presentation category: `status` communicates certainty, while `visual.category` controls color and grouping.

When the user asks to visualize an entire repository, prefer a linked series instead of one dense
canvas. The following is a starting menu; select views that answer the request rather than creating
every view automatically. For DB/API learning, use the question-led sequence above:

1. `system-architecture` with `frames` for major execution boundaries.
2. `workflow` with `timeline` and a separate `exception` lane.
3. `data-flow` with `hub` around canonical stores.
4. `trust-boundary` with explicit identity and authority frames.
5. Two `component-architecture` views, normally one per major runtime.

Use `presentation.frames` plus node-level `visual.category`, `visual.frameId`, `visual.shape`, `visual.emphasis`, `visual.lane`, and `visual.order`. Reuse the same category palette and reading direction across every view in the series.

## Learning layer

Add an optional `learning` block to a spec when the view should teach, not only depict. It renders
into the companion note and index; the SVG gets numbered route badges; the Excalidraw scene is
unchanged. Read [references/learning-figure-research.md](references/learning-figure-research.md)
for the evidence behind each field and its strength.

- `question` / `answer`: the one question the view answers and an evidence-faithful answer in at
  most three sentences. The note shows both above the figure; the index lists them per view.
- `route`: an optional numbered reading path, one `explanation` per element. Readers may start at
  any number; never present the route as the only valid order.
- `glossary`: exact identifiers with their meaning in this system, not dictionary definitions.
- `scope.covers` / `scope.omits`: say what the view leaves out. A `trust-boundary` view is one
  threat-model view; list the threats, attacker capabilities, and mitigations it does not model.
- `verify`: a concrete check per consequential claim (file, test, or read-only command run from the
  source root). Status tags are provenance, not a claimed learning aid.
- `checks`: optional self-check prompts, rendered folded; keep them separate from the first read.
- `analogies`: only with explicit `holds` and `breaks`.

Declare what each arrow means with edge `relation`: `runtime-call`, `data-movement`,
`state-transition`, or `static-reference`. Group nodes into `presentation.frames` with the
`components` layout and `presentation.columns: 2` when a figure must stay readable inside a note
pane; single-row chains become too wide to read.

Before export, run the research-rule review. Findings are advice with their basis; a malformed
spec exits 2:

```sh
"$SKILL/bin/visual-note" review-learning --spec /absolute/path/spec.json --json
```

## Interactive web authoring mode

When the user requests a local interactive web page, React Flow, animated commit comparison, a JSON
contract that can be authored before rendering, or improvements to interactive font readability,
node detail, or explanation level, read
[references/render-independent-authoring-contract.md](references/render-independent-authoring-contract.md).
Keep this mode optional; the default Markdown/SVG/Excalidraw workflow remains authoritative for
ordinary visual notes.

The current interactive contract describes Git before/after comparisons. For a current-state
explainer, author identical phases at one real revision only when that representation fits; do not
invent a change, revision, or new schema field to obtain an interactive diagram. Use regular linked
views when the comparison contract does not fit. DB/API explorer behavior in the information-design
guide is authoring guidance, not a claim that a ready-made web renderer is bundled here.

Author meaning as stable baseline entities and relations plus ordered `before`/`after` patches. Add
lanes, columns, copy budgets, strict evidence-backed entity details, 3:2 node sizing, readable
typography floors, accessible explanation/font controls, and edge-label fallback policy, but never
guess `x`/`y` coordinates. These additions apply only to interactive web output. Emit the
machine-readable schema and compile before opening a browser:

```sh
"$SKILL/bin/visual-note" authoring-schema --json
"$SKILL/bin/visual-note" compile-authoring --spec /absolute/path/authoring.json --json
```

Only the compiled result may cross into the renderer. Treat its size and corridor calculations as
preflight estimates. A React Flow adapter must measure real DOM content, preserve width:height at
3:2, update node internals, route labels after nodes stabilize, and run rectangle-level browser QA.
Never claim pixel correctness from render-free validation alone.

## Workflow

Use absolute paths in automation. In the examples, set:

```sh
SKILL=/absolute/path/to/visual-learning
SESSION_ROOT=/absolute/session/root
OUTPUT="$SESSION_ROOT/docs/vl"
ROOT=/absolute/path/to/atlas-root
PROJECT=<safe-project-slug>
SOURCE=/absolute/path/to/source
```

1. Resolve `SESSION_ROOT` from the session's initial working directory. Do not silently substitute the source repository root. Read the repository without writing application code. Build strict specs with stable `artifactId`, semantic node/edge IDs, evidence, status, confidence, source `{path, commit}` (`commit: null` outside an existing VCS checkout), and presentation metadata appropriate to each view.
2. Validate every spec before publication:

```sh
"$SKILL/bin/visual-note" validate --spec /absolute/path/spec.json --json
```

For specs with a `learning` block, also run `review-learning` and resolve its `warn` findings.

3. By default, export the linked series below the session root:

```sh
"$SKILL/bin/visual-note" export-series \
  --session-root "$SESSION_ROOT" \
  --project "$PROJECT" \
  --spec-dir /absolute/path/to/specs \
  --json
```

The command creates `index.md`, one companion `.md`, polished `.svg`, editable `.excalidraw.md`, and validated JSON spec per view under `docs/vl/projects/<project>/`. Links must remain relative and portable. Keep runtime outputs outside the skill repository and source repository. Repeating an identical export is allowed; a byte-different existing target is a conflict and must not be overwritten.

4. When the user asks for a guided starter, stage a repeatable starter bundle under the chosen root:

```sh
"$SKILL/bin/visual-note" bootstrap --root "$ROOT" --project "$PROJECT" --source "$SOURCE" --bundle "$SKILL/tests/fixtures/sample-project/bundle.json" --json
```

5. When the user wants CAS-tracked revisions, create the figure in the transactional layout:

```sh
"$SKILL/bin/visual-note" create --root "$ROOT" --project "$PROJECT" --spec /absolute/path/spec.json --json
```

6. Extend only after validating the extension contract. Keep existing semantic IDs for persistent concepts:

```sh
"$SKILL/bin/visual-note" extend --spec /absolute/path/extension.json --json
```

7. Refresh selectively with the exact committed token from the last `create`/`refresh`/`restore` result:

```sh
"$SKILL/bin/visual-note" refresh --root "$ROOT" --project "$PROJECT" --spec /absolute/path/next.json --expected-token <cas-token> --json
```

8. Restore an immutable revision as a new commit/token (A after A->B becomes fresh C):

```sh
"$SKILL/bin/visual-note" restore --root "$ROOT" --project "$PROJECT" --artifact-id <artifact-id> --revision-token <old-token> --expected-token <current-token> --json
```

9. Publish only the projects the user names. `--root` is the directory that holds the project, either as `docs/vl/projects/<project>/` from `export-series` (pass `$SESSION_ROOT`) or as `Engineering Atlas/10 Projects/<project>/` from `create` (pass `$ROOT`). A root holding the same project in both layouts is rejected. Repeat `--artifact <id>` to publish a subset.

```sh
"$SKILL/bin/visual-note" publish --root "$SESSION_ROOT" --project "$PROJECT" --repo-root "$SOURCE" --json
```

With `--repo-root`, each `learning.verify` command runs locally from the source checkout and its exit code, stdout, stderr, commit, and time are recorded. Only allowlisted read-only commands run (`rg`, `grep`, `cat`, `head`, `tail`, `wc`, `ls`, and `git show|log|ls-files|rev-parse|blame|diff|grep`, each with allowlisted options). Shell syntax, paths outside the repository, and unknown options are recorded as `not-run` with a reason; runs are time- and output-limited. Without `--repo-root`, every step is recorded `not-run` (`repo not provided`).

Each figure reports `created`, `refreshed`, or `conflict`. The hosted merge keeps every human element and note; removed agent nodes that human content references become `deprecatedAnchors`, and notes on removed nodes become `orphanedNotes`. A `conflict` (exit 3) means a human save landed first and nothing was overwritten; re-run `publish` to merge onto the newer save. Exit 2 is invalid input or a path-scrub refusal; exit 4 is an unreachable remote or failed Access authentication.

10. Pull a published project back into an existing absolute directory when the user asks for a local copy:

```sh
"$SKILL/bin/visual-note" pull --project "$PROJECT" --out /absolute/existing/dir --json
```

Pull writes `<out>/<project>/<id>.excalidraw.md` plus `specs/`, `notes/`, and `verify/` JSON. Identical files are left alone; any byte-different existing file is a collision (exit 3) and nothing is written.

Report the artifact ID, kind, old/new token, evidence paths, status/confidence counts, preserved human element count, deprecated anchors, output drawing/note/export paths, publish outcomes, and validation result. Never claim success from stdout alone when the result JSON or files disagree.

## Publish credentials and hosting

`publish` and `pull` authenticate with the Cloudflare Access service token `visual-atlas-publish`. They read, in order:

- both `VISUAL_ATLAS_CLIENT_ID` and `VISUAL_ATLAS_CLIENT_SECRET` (setting only one is an error), or
- `~/.config/visual-atlas/credentials.json`, a regular file with mode `0600` containing `{ "clientId": "...", "clientSecret": "..." }`. Any other mode is rejected.

If neither exists, stop and ask the user; never invent, echo, or store the secret yourself. `--remote` overrides the default `https://atlas.iyendev.com` and must use `https` unless the host is `127.0.0.1` or `localhost`. `VISUAL_ATLAS_DEV_JWT` is honored only for a local remote. Hosting setup is documented in `README.md` ("Hosting").

### Limits

The atlas runs on Workers Free (10 ms CPU per request) by owner decision. Measured on 2026-09-29: `POST /api/publish` takes 14-41 ms per figure; `GET` requests take 1-6 ms. Publish and save requests can fail with Cloudflare error 1102. Recovery: re-run `visual-note publish`; it is safe but not idempotent, since each run refreshes every named figure again with a new cas token and revision, so a retry re-sends figures that had already succeeded. Human edits are preserved by the merge; a browser tab holding an older token gets a conflict on its next save and can use "최신본에 내 그림 합치기". A failed browser save keeps the draft, so save again. Workers Paid ($5/month) removes the limit; do not upgrade without the owner's explicit okay.

## Ownership, density, and recovery

Generated elements require complete `customData`: `owner=agent`, artifact ID, semantic ID, revision, and stable generated element ID. Partial or ambiguous ownership is a hard rejection. If a removed agent element is referenced by human content, retain its same ID/geometry as `deprecatedAnchor=true`; do not rewrite the human reference.

Split dense input into linked views before labels overlap, clip, or become unreadable. Preserve full requested coverage and provide overview-to-detail links; do not shrink text or discard nodes to fit one canvas.

On conflict, malformed journals, path/token/base-hash mismatch, symlink detection, crash, or interrupted publication: stop mutation, preserve the working source, and run `validate` and re-read the last committed result to establish the authoritative state. Recovery may roll a prepared transaction backward or forward, but begun tokens remain burned. Never delete locks/journals, hand-edit `STATE`, reuse an abandoned token, or overwrite a revision bundle. Retry only from the reread current token with a newly validated spec.
