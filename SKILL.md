---
name: visual-learning
description: Bootstrap, create, extend, refresh, validate, open, or restore evidence-backed engineering learning maps and Excalidraw notes. Use for project maps, C4 architecture, ADR tradeoffs, API journeys, workflows, sequences, data flows, trust boundaries, code exploration, call maps, or Korean visual study notes that preserve exact English identifiers and human annotations.
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

- Treat the source repository as read-only. Read code, contracts, and existing VCS metadata; never edit it, initialize Git, create a commit, or copy source into the vault.
- Work only in the explicitly selected vault and `Engineering Atlas/` project. Verify `--vault` equals `--expected-vault` before mutation.
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

## Workflow

Use absolute paths in automation. In the examples, set:

```sh
SKILL=/Users/billionjaepyo/.agents/skills/visual-learning
VAULT="/Users/billionjaepyo/Documents/Obsidian Vault"
PROJECT=<safe-project-slug>
SOURCE=/absolute/path/to/source
```

1. Read the repository without writing it. Build a strict spec with stable `artifactId`, semantic node/edge IDs, evidence, status, confidence, and source `{path, commit}` (`commit: null` outside an existing VCS checkout).
2. Bootstrap a repeatable starter bundle after preflight when you need a guided project area:

```sh
"$SKILL/bin/visual-note" bootstrap --vault "$VAULT" --expected-vault "$VAULT" --project "$PROJECT" --source "$SOURCE" --bundle "$SKILL/tests/fixtures/sample-project/bundle.json" --json
```

3. Validate before creating or changing anything:

```sh
"$SKILL/bin/visual-note" validate --spec /absolute/path/spec.json --json
```

4. Create through the verified live Obsidian/Excalidraw route:

```sh
"$SKILL/bin/visual-note" create --vault "$VAULT" --expected-vault "$VAULT" --verified-vault-id <verified-id> --project "$PROJECT" --spec /absolute/path/spec.json --obsidian-cli /Applications/Obsidian.app/Contents/MacOS/obsidian-cli --runtime-receipt /Users/billionjaepyo/tmp/.omo/evidence/agent-visual-learning-vault/task-2-preflight.json --plugin-receipt /Users/billionjaepyo/tmp/.omo/evidence/agent-visual-learning-vault/task-2-plugin-install.json --json
```

5. Extend only after validating the extension contract. Keep existing semantic IDs for persistent concepts:

```sh
"$SKILL/bin/visual-note" extend --spec /absolute/path/extension.json --json
```

6. Refresh selectively with the exact committed token from `STATE`/the last receipt:

```sh
"$SKILL/bin/visual-note" refresh --vault "$VAULT" --expected-vault "$VAULT" --project "$PROJECT" --spec /absolute/path/next.json --expected-token <cas-token> --json
```

7. Open only the authoritative current working copy, never an immutable revision snapshot:

```sh
"$SKILL/bin/visual-note" open --obsidian-cli /Applications/Obsidian.app/Contents/MacOS/obsidian-cli --vault "$VAULT" --expected-vault "$VAULT" --project "$PROJECT" --artifact-id <artifact-id> --json
```

8. Restore an immutable revision as a new commit/token (A after A->B becomes fresh C):

```sh
"$SKILL/bin/visual-note" restore --vault "$VAULT" --expected-vault "$VAULT" --project "$PROJECT" --artifact-id <artifact-id> --revision-token <old-token> --expected-token <current-token> --json
```

Report the artifact ID, kind, old/new token, evidence paths, status/confidence counts, preserved human element count, deprecated anchors, output drawing/note/export paths, and validation result. Never claim success from stdout alone when the receipt or files disagree.

## Ownership, density, and recovery

Generated elements require complete `customData`: `owner=agent`, artifact ID, semantic ID, revision, and stable generated element ID. Partial or ambiguous ownership is a hard rejection. If a removed agent element is referenced by human content, retain its same ID/geometry as `deprecatedAnchor=true`; do not rewrite the human reference.

Split dense input into linked views before labels overlap, clip, or become unreadable. Preserve full requested coverage and provide overview-to-detail links; do not shrink text or discard nodes to fit one canvas.

On conflict, malformed journals, path/token/base-hash mismatch, symlink detection, crash, or interrupted publication: stop mutation, preserve the working source, and run `validate`/`open` to establish the authoritative state. Recovery may roll a prepared transaction backward or forward, but begun tokens remain burned. Never delete locks/journals, hand-edit `STATE`, reuse an abandoned token, or overwrite a revision bundle. Retry only from the reread current token with a newly validated spec.
