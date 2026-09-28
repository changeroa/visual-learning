# Excalidraw architecture design system

## Series contract

Use one canvas to answer one question. Select the smallest linked series that covers the user's
questions. For a whole repository, the following views are a starting menu. For DB/API explanations,
choose the reading path from [db-api-information-design.md](db-api-information-design.md) first:

| View | Layout | Question |
| --- | --- | --- |
| System overview | `frames` | Which runtime owns each responsibility? |
| Publication workflow | `timeline` | What is the normal path and where does uncertainty branch? |
| Data flow | `hub` | Which store owns each datum and which writes are immutable? |
| Trust boundary | `trust-boundary` | Where do identity, authority, and credentials cross boundaries? |
| Component views | `components` | Which code modules collaborate inside each major runtime? |

Aim for roughly 4–8 primary nodes in an overview as a local design heuristic, not a universal limit.
Split denser content into linked detail views while retaining full requested coverage. Do not start a
DB explainer with every collection, field, index, and endpoint on one canvas.

## Portable series structure

Publish the default series under `<session-root>/docs/vl/projects/<project>/`:

```text
index.md
<artifact-id>.md
<artifact-id>.svg
<artifact-id>.excalidraw.md
specs/<artifact-id>.json
manifest.json
```

Use only relative links inside this tree. `index.md` links every companion note and embeds every SVG. Each companion note links the series home plus its previous and next views. Treat SVG as the read-only preview and `.excalidraw.md` as the editable source. Never add `.obsidian` below `docs/vl`. Keep generated project results isolated from the skill checkout and source repository.

## Visual grammar

- `cloudflare`: orange; Workers, service bindings, Access-protected edges.
- `aws`: amber; EC2, IAM, RDS, Bedrock, host infrastructure.
- `external`: gray; browsers, people, and third-party systems.
- `data`: blue; canonical databases, object stores, queues, and ledgers.
- `runtime`: violet; daemons, workers, browser automation, and processing loops.
- `security`: green; authentication, authorization, signing, and policy barriers.
- `risk`: red; terminal uncertainty, fail-closed branches, and human intervention.
- `neutral`: slate; supporting concepts that do not own execution or data.

Use `ellipse` for people/external actors, `diamond` for decisions or barriers, and `rectangle` for systems and stores. Reserve red for exceptional paths; do not use it as decoration.

## Layout rules

- Fix one reading direction per series, normally left to right.
- Place frames before nodes so their low-opacity backgrounds remain behind content.
- Route the normal path through the main lane. Put failure and `publishing_uncertain` states in the exception lane.
- Prefer short edge labels describing protocol or responsibility. Move detailed explanation into companion notes.
- Declare what each view's edges mean: static reference, runtime call, data movement, or state
  transition. Label the direction with a verb or exact field pair; do not use one ambiguous arrow
  style for all four meanings. Keep any certainty styling independent from this relationship legend.
- Distinguish an embedded object from a separate referenced document. Use a labelled containment
  frame when representable; otherwise show the exact nested field path in the companion note.
- Keep selection and filtering spatially stable. Re-layout only when geometry actually changes,
  preserve focus across linked views, and use explicit labels as well as category colors.
- Connect at shape boundaries rather than center-to-center.
- Arrange modules horizontally inside single-runtime component frames; reserve vertical stacking for
  genuine call depth rather than for simple membership.
- Maintain stable semantic IDs, shapes, and visual categories across revisions.
- Treat every generated shape/label pair as one reusable Excalidraw group. Keep frames separate
  from their contents so a frame can resize without dragging every node.
- Do not encode certainty with component colors. Dashed strokes may still distinguish `inference` from `fact`.

## Presentation schema example

```json
{
  "presentation": {
    "layout": "frames",
    "direction": "left-to-right",
    "frames": [
      { "id": "external", "label": "External", "category": "external", "order": 0 },
      { "id": "cloudflare", "label": "Cloudflare", "category": "cloudflare", "order": 1 },
      { "id": "aws", "label": "AWS", "category": "aws", "order": 2 }
    ]
  },
  "nodes": [
    {
      "semanticId": "content-api",
      "visual": {
        "category": "cloudflare",
        "frameId": "cloudflare",
        "shape": "rectangle",
        "emphasis": "primary",
        "order": 0
      }
    }
  ]
}
```
