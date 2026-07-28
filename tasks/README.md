# Task files — status

Atomic task specs for AI coders. **Read this before picking one up.**

## ✅ Executable — this is the work that remains

The diagram engine. These specs are current; diagrams embed in **TopicPage** and live at
`content/diagrams/<topicSlug>/<diagramSlug>.json`.

| Task | Scope |
|---|---|
| [TASK-015](TASK-015-diagram-nodes-batch1.md) | BaseNode + client/server/database/load_balancer + registry + preview page |
| [TASK-018](TASK-018-diagram-nodes-batch2.md) | dns, cdn, cache, nosql, message_queue |
| [TASK-019](TASK-019-diagram-nodes-batch3.md) | stacks, service, text_box, table (completes all 17 types) |
| [TASK-020](TASK-020-labeled-edge.md) | LabeledEdge — colour, dash, step badge, emphasis |
| [TASK-021](TASK-021-group-node.md) | Group/tier rendering |
| [TASK-022](TASK-022-diagram-canvas.md) | DiagramCanvas — spec JSON → React Flow |
| [TASK-023](TASK-023-flow-stepper.md) | FlowStepper + DiagramViewer, marks diagrams viewed |
| [TASK-024](TASK-024-diagram-embedding.md) | Embed in TopicPage + file-driven authoring preview |

## 📚 Historical — shipped, and superseded by the topic model

TASK-001 through TASK-014 and TASK-017 describe work that is **done**. They were written against
schema v1 (`sources → chapters → sections`) and the pre-redesign UI, so their DDL, API shapes, and
component descriptions **no longer match the code**.

They are kept because their acceptance criteria and reasoning are still useful context. **Do not treat
them as a specification.** For anything current:

- Data shapes and API contracts → [docs/02-data-models.md](../docs/02-data-models.md)
- The ingestion pipeline → [docs/03-ingestion.md](../docs/03-ingestion.md)
- Why the model is topic-first → [docs/06-topic-model.md](../docs/06-topic-model.md)

Specifically superseded: `sources`/`chapters` tables no longer exist; `external_links` are topic-scoped;
sections carry `provenance` and `kind`; `GET /api/sections/:id` was replaced by
`GET /api/topics/:idOrSlug`; `SectionPage`/`ChapterPage` were replaced by `TopicPage`; notes anchor to
topic or section (not chapter).

## Content work

Content authoring has no task files by design — it is a data change. Write markdown under
`content/authored/`, point a contribution at it in `content/topic-map.json`, then re-run ingest and
seed. See [docs/05-roadmap.md](../docs/05-roadmap.md) Phase 6 for priority order.
