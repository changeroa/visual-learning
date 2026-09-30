# visual-learning

Evidence-backed engineering learning maps, driven by coding agents.

`visual-note` turns a read-only pass over a local repository into linked Markdown, SVG, and editable Excalidraw diagrams with companion evidence notes. Generation is offline, and outputs default to `docs/vl/projects/<project>/` under the session root. `visual-note publish` uploads the projects you name to a private hosted atlas at https://atlas.iyendev.com. There you read the figures at full size, draw on them, and keep notes per figure or per node. Interactive web authoring uses a separate validated JSON contract.

For DB/API explanations, start with what the reader needs to understand: the overall system, one user action, the API calls and data changes behind it, and then the relevant document relationships and fields. Collection lists and field dictionaries remain available for lookup.

## What makes it different

- **Human annotations always survive.** Every generated element carries `owner=agent` customData. Refresh and publish mutate only agent elements; anything you drew (text, freehand, arrows, and your copies of agent elements) is preserved byte-for-byte. Removed agent nodes referenced by your annotations become `deprecatedAnchor`s instead of breaking bindings, and notes on removed nodes stay visible as orphaned.
- **Every claim is evidence-linked.** Nodes are `fact` / `inference` / `question` with repository-relative evidence (`path`, `symbol`, contract line) and confidence. Facts must resolve against real code; inference is never presented as truth. Verify steps show the output recorded at publish time, with its commit and time.
- **Crash-safe transactions.** Immutable revision bundles (`_history/revisions/cas-N/`), a single authoritative `STATE` record, monotonic CAS tokens, burned tokens on abort, and rollback/forward recovery. The hosted atlas uses the same compare-the-token rule: a human save racing a publish never loses work.
- **Question-led figures.** Choose system maps, document relationships, request sequences, state transitions, data lineage, or an API-to-collection CRUD matrix according to the question. Guidance maps these forms to existing output capabilities; it does not add new JSON `kind` values or a bundled web explorer.
- **Private hosted reading and editing.** One sign-in-protected web app instead of a desktop app, plugins, or local registration steps. Only the explicitly published projects leave your machine, with absolute local paths scrubbed.
- **Korean explanations, exact English identifiers.** `CheckoutService` stays `CheckoutService`; the meaning around it is Korean.

## Install

Requires [Bun](https://bun.sh).

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

Ask any wired agent ("이 프로젝트 구조 시각화해줘") or drive the CLI directly. The workflow is: generate offline, publish the projects you name, then read and edit at https://atlas.iyendev.com.

```sh
SKILL=~/.agents/skills/visual-learning
SESSION_ROOT=/path/to/session
ROOT=/path/to/atlas-root

# 1. generate offline: a portable linked series under $SESSION_ROOT/docs/vl/projects/my-project/
"$SKILL/bin/visual-note" validate --spec spec.json --json
"$SKILL/bin/visual-note" export-series --session-root "$SESSION_ROOT" --project my-project \
  --spec-dir /path/to/specs --json

# or the CAS-tracked layout under $ROOT/Engineering Atlas/10 Projects/my-project/
"$SKILL/bin/visual-note" bootstrap --root "$ROOT" --project my-project --source /path/to/repo \
  --bundle "$SKILL/tests/fixtures/sample-project/bundle.json" --json
"$SKILL/bin/visual-note" create  --root "$ROOT" --project my-project --spec spec.json --json
"$SKILL/bin/visual-note" refresh --root "$ROOT" --project my-project --spec next.json --expected-token cas-0 --json
"$SKILL/bin/visual-note" restore --root "$ROOT" --project my-project --artifact-id map --revision-token cas-0 --expected-token cas-1 --json

# 2. publish the named project (records verify output from the read-only source checkout)
"$SKILL/bin/visual-note" publish --root "$SESSION_ROOT" --project my-project --repo-root /path/to/repo

# optional: download a published project without overwriting local changes
"$SKILL/bin/visual-note" pull --project my-project --out /path/to/existing/dir --json
```

`publish` accepts either layout under `--root` and rejects a root that holds the same project in both. Repeat `--artifact <id>` to publish a subset. Each figure reports `created`, `refreshed`, or `conflict`; a conflict exits 3 without overwriting anything, and re-running `publish` merges onto the newer save. `pull` writes `<out>/<project>/` and treats any byte-different existing file as a collision.

Verify commands in a spec are recorded locally at publish time from a strict read-only allowlist (`rg`, `grep`, `cat`, `head`, `tail`, `wc`, `ls`, and read-only `git` subcommands, with allowlisted options). Shell syntax, paths outside the repository, and anything else are recorded as `not-run` with the reason. The hosted app only displays recorded output and never executes a command.

Supported `kind`s: `project-map`, `system-architecture`, `container-architecture`, `component-architecture`, `adr`, `api-contract`, `workflow`, `data-flow`, `trust-boundary`, `code-exploration`. Dense inputs split into linked views instead of unreadable canvases.

Specs may add a `learning` block (question and answer, numbered reading route with per-element
explanations, glossary, scope with omissions, verify steps, folded self-checks, bounded analogies)
and an edge `relation`. `visual-note review-learning --spec spec.json --json` checks a spec against
the research-backed rules in [references/learning-figure-research.md](references/learning-figure-research.md).

## Publish credentials

`publish` and `pull` send the Cloudflare Access service token `visual-atlas-publish` as `CF-Access-Client-Id` / `CF-Access-Client-Secret`. They read it from:

- the environment: both `VISUAL_ATLAS_CLIENT_ID` and `VISUAL_ATLAS_CLIENT_SECRET` (setting only one is an error), or
- `~/.config/visual-atlas/credentials.json`, a regular file with mode `0600`:

```json
{ "clientId": "<id>.access", "clientSecret": "<secret>" }
```

```sh
mkdir -p ~/.config/visual-atlas && chmod 700 ~/.config/visual-atlas
# write the file with an editor, then:
chmod 600 ~/.config/visual-atlas/credentials.json
```

Never commit, print, or paste the secret into logs or evidence. `--remote <url>` overrides the default `https://atlas.iyendev.com`; it must be `https` unless the host is `127.0.0.1` or `localhost`.

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

- Source repositories are read-only. No Git init, no commits, no code copied into generated output.
- Generation is offline. The only network use is an explicit `publish` or `pull` of named projects to the private atlas. Absolute local paths are scrubbed, and a payload that still contains one is refused.
- The hosted atlas admits only the allowlisted Google account in a browser and the publish service token on the CLI. The Worker re-verifies the Access JWT on every API request, and the app loads no CDN assets at runtime.
- Descriptor-safe path handling everywhere (no-follow traversal, symlink rejection, atomic publication).

See `SKILL.md` for the full agent-facing contract.

## Hosting

The atlas is a Cloudflare Worker, provisioned and deployed from the macmini's `wrangler` login. Nothing here needs a paid plan; do not upgrade to Workers Paid without the owner's explicit okay.

- **Worker** `visual-atlas` (`hosted/worker/index.ts`) with Static Assets serving the single-page app from `hosted/dist` (built by `bun run build:web`, fonts self-hosted). It is served only at the custom domain `atlas.iyendev.com`; `workers_dev` and `preview_urls` are off.
- **D1** database `visual-atlas`, bound as `ATLAS_DB`, schema in `hosted/migrations/`. Its `database_id` comes from `wrangler d1 create`.
- **Access** application for `atlas.iyendev.com` in the team `changeroa.cloudflareaccess.com`, with Google as the only login method. One Allow policy includes exactly one email (the owner's Google account); one Service Auth policy admits the service token `visual-atlas-publish`.
- **Worker vars** in `hosted/wrangler.jsonc`: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `SERVICE_CLIENT_ID`. These are identifiers, not secrets. **Worker secret** `ALLOWED_EMAIL`: the one Google account the Worker accepts, kept out of the repository and set with `wrangler secret put`; without it the Worker rejects every request. The Worker checks `Cf-Access-Jwt-Assertion` on every `/api/*` request against the team JWKS, `aud`, `iss`, and `exp`, so a request that bypasses Access is rejected. `POST /api/publish` and `DELETE /api/projects/:p` accept only the service identity.

Runbook (from the macmini, in a synced copy of this repository):

```sh
bun install --frozen-lockfile
bunx wrangler d1 create visual-atlas            # once; write the id into hosted/wrangler.jsonc
bunx wrangler d1 migrations apply visual-atlas --remote --config hosted/wrangler.jsonc
bun run build:web
bunx wrangler deploy --config hosted/wrangler.jsonc
bunx wrangler secret put ALLOWED_EMAIL --config hosted/wrangler.jsonc   # once; prompts for the owner's Google email
```

Touch only the `visual-atlas` Worker, database, and Access application; leave every other D1 database, R2 bucket, Worker, and DNS record in the account alone.

Local development runs the Worker in workerd with a test-only key (`env.local` in `hosted/wrangler.jsonc`, never production):

```sh
bunx wrangler d1 migrations apply visual-atlas --local --config hosted/wrangler.jsonc --env local
bun run dev:hosted                              # http://127.0.0.1:8787
VISUAL_ATLAS_DEV_JWT=<test-signed JWT> bin/visual-note publish --remote http://127.0.0.1:8787 \
  --root /path/to/root --project my-project
```

### Limits

The atlas stays on Workers Free, which caps each request at 10 ms of CPU time; the owner accepted this risk on 2026-09-29. Measured on the live Worker with `wrangler tail` (2026-09-29):

- `POST /api/publish`, one figure per request: 14-41 ms CPU, over the limit.
- `GET /api/projects/:p/figures/:a`: 5-6 ms; `GET /api/me`: 1-3 ms.
- Saving a scene (`PUT`) was not measured.

Publish and save requests can therefore fail with Cloudflare error 1102 (Worker exceeded resource limits). To recover:

- **Publish:** re-run `visual-note publish`. It is safe but not idempotent: each run refreshes every named figure again, creating a new cas token and a new revision, so a retry re-sends figures that had already succeeded, not just the ones that failed. Human edits are preserved by the merge; a browser tab still holding an older token gets a conflict on its next save and can use "최신본에 내 그림 합치기" to merge in its local changes.
- **Save:** a failed save keeps the browser draft, so save again.

Workers Paid ($5/month) removes the 10 ms limit.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck && bun test && bun run lint && bun run build
```

Tests cover schema, ownership preservation, cross-ownership bindings, transactions/crash recovery, offline privacy, interactive authoring, the publish payload and path scrub, verify recording, Access JWT checks, the D1 atlas store, the Worker API and merge, and the cross-agent contract.
