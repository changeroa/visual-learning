# visual-learning

Evidence-backed engineering learning maps in Obsidian, driven by coding agents.

`visual-note` turns a read-only pass over a local repository into Excalidraw diagrams — project maps, C4 architecture, ADR tradeoffs, API contract journeys, workflows, data flows, trust boundaries, code-exploration call maps — stored in an Obsidian vault as editable drawings with companion evidence notes.

## What makes it different

- **Human annotations always survive.** Every generated element carries `owner=agent` customData. Refresh mutates only agent elements; anything you drew (text, freehand, arrows) is preserved byte-for-byte. Removed agent nodes referenced by your annotations become `deprecatedAnchor`s instead of breaking bindings.
- **Every claim is evidence-linked.** Nodes are `fact` / `inference` / `question` with repository-relative evidence (`path`, `symbol`, contract line) and confidence. Facts must resolve against real code; inference is never presented as truth.
- **Crash-safe transactions.** Immutable revision bundles (`_history/revisions/cas-N/`), a single authoritative `STATE` record, monotonic CAS tokens, burned tokens on abort, and rollback/forward recovery. A human save racing a refresh aborts safely and retries with a fresh token.
- **Runs inside the real app.** Rendering goes through the official Obsidian CLI and the Excalidraw plugin's ExcalidrawAutomate API — no headless hacks, no third-party MCP server, no cloud.
- **Korean explanations, exact English identifiers.** `CheckoutService` stays `CheckoutService`; the meaning around it is Korean.

## Install

Requires [Obsidian](https://obsidian.md) (1.13+, CLI enabled), the [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin), and [Bun](https://bun.sh).

```sh
git clone https://github.com/edsunyoung/visual-learning ~/.agents/skills/visual-learning
cd ~/.agents/skills/visual-learning
bun install --frozen-lockfile
bun scripts/install-links.ts   # symlink into Senpi / Codex / Claude skill roots
```

Verify:

```sh
bin/visual-note contract --fixture tests/fixtures/contract.json --json
# sentinel: VISUAL_LEARNING_CONTRACT_OK
```

## Usage

Ask any wired agent ("이 프로젝트 구조 시각화해줘") or drive the CLI directly:

```sh
SKILL=~/.agents/skills/visual-learning
VAULT="/path/to/Obsidian Vault"

# guided starter bundle for any local source
"$SKILL/bin/visual-note" bootstrap --vault "$VAULT" --expected-vault "$VAULT" \
  --project my-project --source /path/to/repo \
  --bundle "$SKILL/tests/fixtures/sample-project/bundle.json" --json

# lifecycle: validate -> create -> refresh (needs CAS token) -> restore
"$SKILL/bin/visual-note" validate --spec spec.json --json
"$SKILL/bin/visual-note" create   --vault "$VAULT" --expected-vault "$VAULT" --project my-project --spec spec.json --json
"$SKILL/bin/visual-note" refresh  --vault "$VAULT" --expected-vault "$VAULT" --project my-project --spec next.json --expected-token cas-0 --json
"$SKILL/bin/visual-note" restore  --vault "$VAULT" --expected-vault "$VAULT" --project my-project --artifact-id map --revision-token cas-0 --expected-token cas-1 --json
```

Supported `kind`s: `project-map`, `system-architecture`, `container-architecture`, `component-architecture`, `adr`, `api-contract`, `workflow`, `data-flow`, `trust-boundary`, `code-exploration`. Dense inputs split into linked views instead of unreadable canvases.

## Guarantees

- Source repositories are read-only. No Git init, no commits, no code copied into the vault.
- Offline after installation. No Sync/Publish, no generation services, no uploads.
- Descriptor-safe path handling everywhere (no-follow traversal, symlink rejection, atomic publication).

See `SKILL.md` for the full agent-facing contract.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck && bun test && bun run lint && bun build
```

137 tests covering schema, ownership preservation, cross-ownership bindings, transactions/crash recovery, offline privacy, and the cross-agent contract.
