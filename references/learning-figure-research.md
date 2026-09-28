# Learning-figure research: rules behind the learning layer

This reference backs the optional `learning` block, edge `relation`, `presentation.columns`, and the
`review-learning` findings. Strength labels follow the evidence, not the wish: most learning
effects below are PARTIAL or UNRESOLVED after adversarial review, so the skill implements them as
product rules and provenance aids, never as proven learning interventions.

Source: a 2026-09-29 mass literature run (88 wave-1 angles, 3 expansion waves, 29 skeptic-debate
items, 121 DOI-verified sources). Full synthesis and journal: `.omo/ulw-research/20260929-002408/`
in the session that produced it (not shipped with the skill).

## Rules

| Rule | Guidance | Strength | Review rule |
|---|---|---|---|
| R1 | One view answers one stated reader question; choose the form for that question instead of an "everything map". State the answer next to the question. | STRONG for task-first selection; question-form titles as a learning aid UNRESOLVED | LR01 |
| R2 | Declare what each arrow means (`runtime-call`, `data-movement`, `state-transition`, `static-reference`); do not let position or color imply a relation. | MODERATE to STRONG | LR02 |
| R3 | Keep short labels beside what they identify; use prose for causes, caveats, and evidence rather than repeating labels. | MODERATE (PARTIAL in debate) | — |
| R4 | State scope and what the view omits; distinguish "not shown" from "absent". A data-flow/trust-boundary view is one threat-model view. | STRONG as documentation practice; trust-calibration effect UNRESOLVED; DFD scoping SUPPORTED | LR04 |
| R5 | Offer a numbered route as an optional starting path with direct entry at any element; never present it as the only valid order. | PARTIAL; comprehension gain UNRESOLVED | LR03 |
| R6 | Mark fact, inference, and question per claim, link claims to evidence, and give a concrete check (file, test, read-only command). These are provenance guardrails. | PARTIAL / UNRESOLVED as learning aids | LR05, LR06 |
| R7 | Match detail to familiarity with this repository and task, not to seniority; keep detail expandable instead of offering an "expert mode". | PARTIAL | — |
| R8 | Keep a complete static figure as the baseline; add interaction only for a task-relevant change. | PARTIAL | — |
| R9 | Use analogies only with explicit `holds` and `breaks`; keep self-check prompts optional and separate from the first read. | PARTIAL | schema |
| R10 | Check text at the real viewing scale; there is no universal node-count limit. Group with frames and use `presentation.columns: 2` so figures stay readable in a note pane. Never encode status by color alone. | MODERATE; color redundancy STRONG | LR07 |

## Figure form by knowledge type

No notation is a proven universal winner; these are task-fit defaults.

| Knowledge | Default form | Notes |
|---|---|---|
| Architecture, ownership | component or dependency map with labeled cross-boundary edges | `system-architecture`, `component-architecture` |
| Workflow, request journey | sequence/flow with order, branches, guards, and effects | `workflow` |
| Data lineage | directed, labeled data-flow; exact fields in tables or source links | `data-flow` |
| State, lifecycle | transition view with triggers and guards; offer a table or code view when exhaustive | no statechart-vs-table winner |
| Concurrency | per-context lanes; draw only evidenced happens-before edges | never imply a total order |
| API contract | contract table plus one request/response journey | `api-contract` |
| Decision | options, constraints, chosen option, consequences; cite the ADR | `adr` |
| Change | aligned before/after with stable IDs; separate observed change from inferred cause | |
| Errors | branching view: trigger, propagation, handling, outcome | a catch edge is not proof of recovery |
| Security | scoped data-flow with trust boundaries and evidence; pair with threat reasoning | `trust-boundary` |

## What this skill does not claim

- That figures, tags, routes, callouts, question titles, omission notes, or verify steps improve
  learning, onboarding, accuracy, or trust for experienced developers. No direct study was found.
- That a generated or editable figure is current. The note records the source commit and schema
  validation at export; that is a freshness record, not a freshness guarantee.
- That sketchy or polished rendering signals correctness.

## Reader fit

Figures produced for a specific reader should follow that reader's measured habits when research is
silent. For an evidence-first, terse Korean-writing developer: Korean explanations with exact English
identifiers, the answer before the details, one question per view, explicit omissions, and a check
the reader can run. Record the profile basis in the learning block text, not in code.

## Key sources

- Larkin & Simon (1987), diagrams and search: https://doi.org/10.1111/j.1551-6708.1987.tb00863.x
- Vessey (1991), cognitive fit: https://doi.org/10.1111/j.1540-5915.1991.tb00344.x
- Chandler & Sweller (1991), split attention: https://doi.org/10.1207/s1532690xci0804_2
- Schroeder & Cenkci (2018), spatial contiguity meta-analysis: https://doi.org/10.1007/s10648-018-9435-9
- Kalyuga et al. (2003), expertise reversal: https://doi.org/10.1207/S15326985EP3801_4
- Tversky, Morrison & Betrancourt (2002), animation: https://doi.org/10.1006/ijhc.2002.1017
- Gentner (1983), structure mapping: https://doi.org/10.1207/s15516709cog0702_3
- Sillito, Murphy & De Volder (2006), developer questions: https://doi.org/10.1145/1181775.1181779
- Hundhausen, Douglas & Stasko (2002), algorithm visualization meta-study: https://doi.org/10.1006/jvlc.2002.0237
- Guo (2018), non-native English speakers learning programming: https://doi.org/10.1145/3173574.3173970
- WCAG 2.2, use of color: https://www.w3.org/TR/WCAG22/#use-of-color
- OWASP threat modeling process: https://owasp.org/www-community/Threat_Modeling_Process
