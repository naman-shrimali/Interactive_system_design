# 05 — Roadmap & Status

## Where things stand

| Phase | Status |
|---|---|
| 0. Scaffold (client + server + scripts) | ✅ shipped |
| 1. Data layer — schema, ingestion, seeding | ✅ shipped (rebuilt as schema v2, the topic model) |
| 2. API — curriculum, topics, progress, notes, diagrams | ✅ shipped |
| 3. Reader UI — sidebar, topic page, links, progress, notes | ✅ shipped |
| 4. Design system — tokens, dark mode, serif reading column, responsive | ✅ shipped |
| **5. Diagram engine** | ⬜ **next** — fully specced, not yet written |
| 6. Content authoring | 🟡 in progress — 19 of 30 topics still under 800 words |
| 7. Diagram authoring | ⬜ blocked on phase 5 |
| 8. Polish — dashboard, search, notes export | ⬜ not started |

The original phases 1–3 were re-cut when the curriculum moved from a source-first to a topic-first
model ([docs/06-topic-model.md](06-topic-model.md)). Task files for that shipped work are kept as
history — see [tasks/README.md](../tasks/README.md).

## Phase 5 — Diagram engine (next)

Task files remain accurate; the only change is that diagrams embed in **TopicPage**, not a section page,
and diagram files live at `content/diagrams/<topicSlug>/<slug>.json`.

- **TASK-015** BaseNode + first 4 node types + registry + preview page → [tasks/TASK-015-diagram-nodes-batch1.md](../tasks/TASK-015-diagram-nodes-batch1.md)
- **TASK-018** Node batch 2: dns, cdn, cache, nosql, message_queue → [tasks/TASK-018-diagram-nodes-batch2.md](../tasks/TASK-018-diagram-nodes-batch2.md)
- **TASK-019** Node batch 3: stacks, service, text_box, table → [tasks/TASK-019-diagram-nodes-batch3.md](../tasks/TASK-019-diagram-nodes-batch3.md)
- **TASK-020** LabeledEdge (colour/dash/step badge/emphasis) → [tasks/TASK-020-labeled-edge.md](../tasks/TASK-020-labeled-edge.md)
- **TASK-021** Group rendering (dashed/solid/filled tiers) → [tasks/TASK-021-group-node.md](../tasks/TASK-021-group-node.md)
- **TASK-022** DiagramCanvas: spec JSON → React Flow → [tasks/TASK-022-diagram-canvas.md](../tasks/TASK-022-diagram-canvas.md)
- **TASK-023** FlowStepper + DiagramViewer, marks `viewed` → [tasks/TASK-023-flow-stepper.md](../tasks/TASK-023-flow-stepper.md)
- **TASK-024** Embed in TopicPage + file-driven preview route → [tasks/TASK-024-diagram-embedding.md](../tasks/TASK-024-diagram-embedding.md)

Planned styling upgrade over the original spec: ByteByteGo-style dark diagram panels with saturated
node colours, plus a legend.

## Phase 6 — Content authoring

Per topic, ~1200–1800 words of **original** prose across the kind vocabulary (overview → concepts →
deep dive → trade-offs → checklist). Primer text is kept where it is already strong and supplemented,
not replaced.

Delivered in batches of ~5 topics. Each batch is markdown under `content/authored/` plus
`npm run ingest && npm run seed` — **zero code changes**. Priority order:

1. The 7 topics with no primer coverage at all: consistent-hashing, unique-id-generator, rate-limiter,
   chat-system, search-autocomplete, notification-system, media-and-file-storage.
2. Thin-but-existing topics: back-of-envelope (40w), security (84w), performance-and-latency (121w),
   consistency-patterns, cap-theorem, application-layer, dns, interview-framework, cdn, asynchronism.

`npm run ingest` prints the current ranked list — treat it as the backlog of record, not this doc.

**Definition of done:** zero topics reported under 800 words.

## Phase 7 — Diagram authoring

~3 diagrams per topic for the top ~20 topics (~60 total), including evolution diagrams (one system drawn
at three scales) and numbered request flows. Validate each batch with `npm run validate:diagrams`.

## Phase 8 — Polish

Dashboard page from `GET /api/progress/summary`; client-side topic search; notes export to a single
markdown file.
