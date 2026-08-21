# Render-independent interactive authoring contract

Use this mode when the requested artifact is a local interactive web view, a React Flow map, or a
before/after commit animation. The authoring JSON describes meaning, change, ordering, and spatial
constraints. It never guesses browser coordinates.

The canonical example is contract version 2 at
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
| `semantics.entities` | Stable concepts and comparison dossiers shared by both phases | IDs are stable; details are strict, evidence-backed, and projection-safe |
| `semantics.relations` | Stable topology shared by both phases | Every endpoint names a baseline entity |
| `change.before` / `change.after` | Sparse patches over the baseline | `present: false` removes an item; `badge: null` removes a badge |
| `entityOrder` / `relationOrder` | Deterministic compilation and narration order | Each array exactly equals the items present in that phase |
| `presentation` | Lanes, columns, order, roles, and edge-label fallback policy | Placements cover every entity; raw `x` and `y` are rejected |
| `interaction` | Detail-level, canonical-source, and 100–150% font controls | One document-level control contract applies to every scene |
| `constraints` | Viewport, 3:2 sizing, density, copy, typography, and corridor budgets | Obvious unreadable layouts fail before rendering |

Use baseline-plus-patch even when it is not shorter than duplicating two graphs. Its purpose is to
centralize identifiers and topology so the before and after views cannot silently drift. Keep
phase-specific relation order: edge-label allocation is order-dependent and must remain
deterministic.

Claims retain the regular visual-learning evidence language:

- `status: fact` requires at least one repository-relative evidence reference.
- `status: inference` records the reasoning evidence without presenting it as runtime truth.
- `status: question` keeps the missing proof or owner visible.
- `confidence` remains independent from `changeStatus`; certainty is not a color or diff state.

Interactive evidence references also require a stable `id`. Entity `details.evidenceIds` is a
non-empty, duplicate-free subset of that entity's evidence IDs and must still resolve after each
phase patch. The evidence IDs sit outside every explanation projection, so changing explanation
level cannot change facts or provenance.

## Entity detail contract

`description` is the short canvas summary. It is not the detail source and must not substitute for
the comparison dossier. Every baseline entity has exactly these six `details` keys and no others:

| Dimension | Exclusive responsibility |
| --- | --- |
| `role` | Stable ownership or responsibility, not phase behavior |
| `before` | Observable behavior or state at `source.before` |
| `after` | Observable behavior or state at `source.after` |
| `reason` | Cause of the change, not a restatement of either phase |
| `impact` | Downstream user or system consequence, not the implementation mechanism |
| `evidenceIds` | Shared provenance for the five dimensions and all projections |

Each of the first five dimensions has one canonical source and three derived presentations:

```json
{
  "source": "canonical evidence-backed explanation containing ExactIdentifier",
  "identifiers": ["ExactIdentifier"],
  "projections": {
    "beginner": "Concrete, easy wording that preserves ExactIdentifier",
    "intermediate": "Balanced context and precision preserving ExactIdentifier",
    "expert": "Short technical wording preserving ExactIdentifier"
  }
}
```

The `source` is the immutable semantic source and the value shown by the original-text/provenance
disclosure. Projections change explanation density only. They must not introduce a different state,
cause, impact, certainty, or evidence claim. Preserve every declared identifier as an exact,
case-sensitive substring in the source and all three projections; do not translate or normalize it.
An empty `identifiers` array is an explicit author assertion that no exact code/API/type identifier
applies. The compiler cannot infer whether that assertion is true, so it emits a review warning for
every empty array; do not suppress the warning without checking the source and all projections.

Write `beginner` concretely with plain causal language, `intermediate` with balanced context and
technical precision, and `expert` as the shortest technical explanation. The expert projection must
not be longer than either other projection. Author copy budgets so the expert maximum is no greater
than the intermediate maximum, which is no greater than the beginner maximum. Apply the declared
grapheme and explicit-line budgets independently to `source` and all three projections. Actual
projection lengths must satisfy `beginner >= intermediate >= expert` by grapheme count.

Details are a stable baseline comparison dossier: use their `before` and `after` dimensions instead
of phase-patching the dossier. If two explanations have different certainty or provenance, split the
entity rather than hiding that disagreement behind a difficulty toggle.

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
- duplicate interactive evidence IDs, empty detail evidence, or unresolved `evidenceIds`;
- missing/extra detail dimensions or projection fields;
- canonical identifiers missing from `source` or any projection;
- projection lengths that do not satisfy `beginner >= intermediate >= expert`;
- copy budgets exceeded by Unicode grapheme count;
- explicit newline counts above the declared line budget.

The compiler then estimates content-driven node widths within `minWidth` and `maxWidth`, fixes height
to `width / 1.5`, checks maximum columns and nodes per column, estimates the minimum viewport zoom,
and checks whether every edge label fits its corridor or has a declared fallback. A final
`detached-callout` fallback is the safest fail-closed escape hatch for a label that cannot fit between
nodes.

The node estimator considers only the canvas title, description, and badge at the maximum 150% font
scale; edge-label estimates use the authored font floor at the same scale. Entity details belong in
an untransformed inspector/drawer, not inside the 3:2 node, and the browser must measure that panel
independently. This preflight is deliberately conservative. It proves semantic completeness and
analytical feasibility; it cannot prove exact pixels for an unknown font, browser, zoom, or
localization. The compiled contract therefore emits
`measurementPolicy.exactPixelsGuaranteed: false`.

## Typography and interaction floors

Contract v2 requires authored font floors of 24 CSS px for node titles and 20 CSS px for node bodies
(including badges), edge labels, UI metadata, and detail text. `minimumEffectiveTextPx` cannot be
below 14 CSS px. Badge copy has its own grapheme and line budgets.
Effective size is:

```text
effectiveTextPx = nominalCssPx * transformScale * fontScale
```

For node titles, node bodies, and edge labels, `transformScale` is the rendered React Flow zoom. For
UI metadata, controls, and the detail inspector outside the canvas, it is `1`. `fontScale` ranges
from 100% through 150% in 5% steps and never shrinks authored text. The authoring validator requires
every canvas role at `minimumZoom`, and every untransformed role at scale `1`, to meet the effective
floor. The compiled phase reports role-specific effective sizes and the required canvas zoom for
audit; DOM measurement remains authoritative.

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
6. Render entity details in an untransformed inspector/drawer. Provide one labelled three-way
   `radiogroup` (`beginner`, `intermediate`, `expert`) with arrow-key navigation, a canonical-source
   disclosure using `aria-expanded`, and a labelled font-scale range with live output.
7. Changing detail level may select only `projections[level]`. Changing either level or font scale
   must preserve node/edge IDs and order, topology, selected phase state, canonical sources,
   identifiers, and evidence IDs.
8. Apply the measured dimensions, call React Flow's `useUpdateNodeInternals(id)`, and run layout
   again.
9. Remeasure after fonts become ready, phase changes, detail-level changes, font-scale changes, and
   container resizes. Re-run node internals, layout, panel overflow, and edge-label routing as
   applicable; bound the process to a small number of stable passes.
10. Route edges only after node rectangles and handles stabilize. Allocate labels in authored
   `relationOrder`, testing the preferred corridor and then the declared fallbacks.
11. Measure label rectangles and reject intersections with node rectangles, previously allocated
   labels, and the viewport. A detached callout still needs its own collision-free allocation.

Use `opacity: 0` or `visibility: hidden` for a measurement pass, not `display: none`; React Flow
cannot measure hidden handles with zero dimensions. MDN recommends scheduling `ResizeObserver`
writes through `requestAnimationFrame` and remembering expected sizes so the observer does not
create a resize loop.

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
- the detail inspector and every selected projection have no horizontal or vertical overflow at
  every 5% font-scale step from 100% through 150%;
- no node rectangles intersect;
- no edge-label rectangle intersects a node or another label;
- labels and nodes remain inside the graph viewport;
- fit-to-view zoom stays at or above `minimumZoom`;
- every visible text role meets `computedFontSize * transformScale >= minimumEffectiveTextPx`;
- every visible semantic text element has a known text role; canvas zoom is applied only to node and
  edge text, while UI/detail text uses transform scale `1`;
- the three-way detail control is a labelled single-select control with keyboard navigation, the
  canonical source disclosure exposes expanded state, and font scale exposes its current value;
- cycling levels and font scale changes only projection text and computed size; topology, phase
  state, IDs/order, canonical source, identifiers, and evidence IDs remain byte-equivalent;
- the visible node and relation order matches the compiled phase order;
- switching phases does not leave stale handles, labels, or dimensions.

Run this browser QA after every copy, font, CSS, renderer, or contract change. Analytical estimates
are an early rejection mechanism, not a replacement for final DOM evidence.
