# Render-independent interactive authoring contract

Use this mode when the requested artifact is a local interactive web view, a React Flow map, or a
before/after commit animation. The authoring JSON describes meaning, change, ordering, and spatial
constraints. It never guesses browser coordinates.

The canonical example is
[`tests/fixtures/interactive-authoring.json`](../tests/fixtures/interactive-authoring.json). Emit the
machine-readable Draft 2020-12 shape with:

```sh
bin/visual-note authoring-schema --json
```

Validate semantic invariants, compile both phases, and run analytical feasibility checks with:

```sh
bin/visual-note compile-authoring --spec /absolute/path/authoring.json --json
```

The compiler output is the only model a web renderer should consume. Do not let React components
interpret `semantics` or `change` directly.

## What belongs in authoring JSON

| Section | Meaning | Required invariant |
| --- | --- | --- |
| `source.before` / `source.after` | The two Git revisions being compared | Both refs are explicit commit IDs, not implicit `HEAD` |
| `story` | The question, summary, takeaway, and human reading order | `readingOrder` names every baseline entity exactly once |
| `semantics.entities` | Stable concepts shared by both phases | IDs are stable; factual claims carry repository evidence |
| `semantics.relations` | Stable topology shared by both phases | Every endpoint names a baseline entity |
| `change.before` / `change.after` | Sparse patches over the baseline | `present: false` removes an item; `badge: null` removes a badge |
| `entityOrder` / `relationOrder` | Deterministic compilation and narration order | Each array exactly equals the items present in that phase |
| `presentation` | Lanes, columns, order, roles, and edge-label fallback policy | Placements cover every entity; raw `x` and `y` are rejected |
| `constraints` | Viewport, 3:2 sizing, density, copy, and corridor budgets | Obvious unreadable layouts fail before rendering |

Use baseline-plus-patch even when it is not shorter than duplicating two graphs. Its purpose is to
centralize identifiers and topology so the before and after views cannot silently drift. Keep
phase-specific relation order: edge-label allocation is order-dependent and must remain
deterministic.

Claims retain the regular visual-learning evidence language:

- `status: fact` requires at least one repository-relative evidence reference.
- `status: inference` records the reasoning evidence without presenting it as runtime truth.
- `status: question` keeps the missing proof or owner visible.
- `confidence` remains independent from `changeStatus`; certainty is not a color or diff state.

## Validation pipeline

Treat these as four separate gates:

```text
authoring JSON
  -> strict JSON shape
  -> semantic lint
  -> baseline/patch compilation
  -> analytical feasibility
  -> web renderer
  -> DOM measurement and geometry QA
```

The strict shape rejects extra properties, guessed coordinates, non-3:2 sizing, malformed evidence,
and invalid enums. Semantic lint rejects:

- duplicate or unknown IDs;
- patches that do not name a baseline entity or relation;
- incomplete or duplicated phase order arrays;
- phase edges whose endpoints are absent;
- missing placement or lane coverage;
- routing overrides for unknown relations;
- fact claims without evidence;
- copy budgets exceeded by Unicode grapheme count;
- explicit newline counts above the declared line budget.

The compiler then estimates content-driven node widths within `minWidth` and `maxWidth`, fixes height
to `width / 1.5`, checks maximum columns and nodes per column, estimates the minimum viewport zoom,
and checks whether every edge label fits its corridor or has a declared fallback. A final
`detached-callout` fallback is the safest fail-closed escape hatch for a label that cannot fit between
nodes.

This preflight is deliberately conservative. It proves semantic completeness and analytical
feasibility; it cannot prove exact pixels for an unknown font, browser, zoom, or localization. The
compiled contract therefore emits `measurementPolicy.exactPixelsGuaranteed: false`.

## React Flow adapter

Keep a single adapter boundary:

1. Import compiled JSON, never raw authoring JSON.
2. Render node content with the compiler's estimated width and `height = width / 1.5`.
3. Measure each content box with `ResizeObserver` or `getBoundingClientRect()` after fonts are ready.
4. Compute the 3:2 box from content demand:

   ```text
   width = clamp(max(contentWidth, contentHeight * 1.5), minWidth, maxWidth)
   height = width / 1.5
   ```

5. If content still overflows at `maxWidth`, fail the view or split/rewrite it. Never hide the
   failure by shrinking text below the design-system minimum.
6. Apply the measured dimensions, call React Flow's `useUpdateNodeInternals(id)`, and run layout
   again.
7. Route edges only after node rectangles and handles stabilize. Allocate labels in authored
   `relationOrder`, testing the preferred corridor and then the declared fallbacks.
8. Measure label rectangles and reject intersections with node rectangles, previously allocated
   labels, and the viewport. A detached callout still needs its own collision-free allocation.

Use `opacity: 0` or `visibility: hidden` for a measurement pass, not `display: none`; React Flow
cannot measure hidden handles with zero dimensions. Bound remeasurement to a small number of stable
passes. MDN recommends scheduling `ResizeObserver` writes through `requestAnimationFrame` and
remembering expected sizes so the observer does not create a resize loop.

Relevant primary references:

- [React Flow `useUpdateNodeInternals`](https://reactflow.dev/api-reference/hooks/use-update-node-internals)
- [React Flow dynamic handles and visibility guidance](https://reactflow.dev/learn/customization/handles)
- [React Flow `NodeResizer` and `keepAspectRatio`](https://reactflow.dev/api-reference/components/node-resizer)
- [MDN `ResizeObserver`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)
- [MDN `getBoundingClientRect`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)

## Browser QA contract

Do not accept a map because it merely rendered. At every before/after frame and supported viewport,
assert all of the following from actual DOM rectangles:

- each node is within a small tolerance of 3:2;
- node title, description, and badge have no horizontal or vertical overflow;
- no node rectangles intersect;
- no edge-label rectangle intersects a node or another label;
- labels and nodes remain inside the graph viewport;
- fit-to-view zoom stays at or above `minimumZoom`;
- the visible node and relation order matches the compiled phase order;
- switching phases does not leave stale handles, labels, or dimensions.

Run this browser QA after every copy, font, CSS, renderer, or contract change. Analytical estimates
are an early rejection mechanism, not a replacement for final DOM evidence.
