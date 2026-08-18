# Excalidraw architecture design system

## Series contract

Use one canvas to answer one question. For a whole repository, create five or six linked views:

| View | Layout | Question |
| --- | --- | --- |
| System overview | `frames` | Which runtime owns each responsibility? |
| Publication workflow | `timeline` | What is the normal path and where does uncertainty branch? |
| Data flow | `hub` | Which store owns each datum and which writes are immutable? |
| Trust boundary | `trust-boundary` | Where do identity, authority, and credentials cross boundaries? |
| Component views | `components` | Which code modules collaborate inside each major runtime? |

Keep overview views to roughly 4–8 nodes. Split denser content into related component views.

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
