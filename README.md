# visual-learning

Evidence-backed engineering learning maps, driven by coding agents.

`visual-note` turns a read-only pass over a local repository into linked Markdown, SVG, and editable Excalidraw diagrams with companion evidence notes. Outputs default to `docs/vl/projects/<project>/` under the session root. Obsidian publication is optional; interactive web authoring uses a separate validated JSON contract.

For DB/API explanations, start with what the reader needs to understand: the overall system, one user action, the API calls and data changes behind it, and then the relevant document relationships and fields. Collection lists and field dictionaries remain available for lookup.

## What makes it different

- **Human annotations always survive.** Every generated element carries `owner=agent` customData. Refresh mutates only agent elements; anything you drew (text, freehand, arrows) is preserved byte-for-byte. Removed agent nodes referenced by your annotations become `deprecatedAnchor`s instead of breaking bindings.
- **Every claim is evidence-linked.** Nodes are `fact` / `inference` / `question` with repository-relative evidence (`path`, `symbol`, contract line) and confidence. Facts must resolve against real code; inference is never presented as truth.
- **Crash-safe transactions.** Immutable revision bundles (`_history/revisions/cas-N/`), a single authoritative `STATE` record, monotonic CAS tokens, burned tokens on abort, and rollback/forward recovery. A human save racing a refresh aborts safely and retries with a fresh token.
- **Question-led figures.** Choose system maps, document relationships, request sequences, state transitions, data lineage, or an API-to-collection CRUD matrix according to the question. Guidance maps these forms to existing output capabilities; it does not add new JSON `kind` values or a bundled web explorer.
- **Optional live Obsidian editing.** Vault rendering goes through the official Obsidian CLI and the Excalidraw plugin's ExcalidrawAutomate API. Portable Markdown/SVG/Excalidraw export does not require a vault.
- **Korean explanations, exact English identifiers.** `CheckoutService` stays `CheckoutService`; the meaning around it is Korean.

## Install

Requires [Bun](https://bun.sh). Live vault workflows additionally require [Obsidian](https://obsidian.md) (1.13+, CLI enabled) and the [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin).

```sh
git clone https://github.com/changeroa/visual-learning ~/.agents/skills/visual-learning
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

## DB and API learning

Example requests:

- `이 DB 구조를 전체 지도 → 주문 생성 흐름 → 문서 관계 → 필드 상세 순서로 설명해줘.`
- `POST /orders가 어떤 데이터를 읽고 바꾸는지 코드 근거와 함께 그려줘. 확인 안 되는 호출은 표시해줘.`
- `컬렉션 목록 위주인 이 설명을 업무 중심으로 바꾸고, 내장 객체와 다른 문서 참조를 구분해줘.`

The [DB/API information-design guide](references/db-api-information-design.md) supplies figure
selection, evidence tracing, a synthetic worked example, interaction guidance, primary references,
and review cases. It separates verified implementation, interpretation, and proposals. OpenAPI alone
is not treated as proof of DB writes, and an ID reference is not presented as an enforced foreign key.

For interactive output, pair that guidance with the
[existing authoring contract](references/render-independent-authoring-contract.md). Actual browser
geometry and behavior still require renderer-specific QA; document validation does not establish
readability or user comprehension.

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

Tests cover schema, ownership preservation, cross-ownership bindings, transactions/crash recovery, offline privacy, interactive authoring, and the cross-agent contract.
