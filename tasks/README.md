# Task files — status

Atomic task specs for AI coders. **Read this before picking one up.**

## ✅ No executable task files remain

The diagram engine (TASK-015, 018–024) is **built**: all 17 node types, labelled edges, tier groups,
the spec→React Flow canvas, the flow stepper with `viewed` tracking, TopicPage embedding, and the
`/diagram-preview` authoring route. Those files are now history too.

Two deliberate deviations from their specs, both documented:
- Node components are grouped by shape (`IconNodes.tsx`, `SpecialNodes.tsx`) instead of one file per
  kind; `nodes/index.ts` carries a compile-time completeness check.
- The dev routes TASK-024 asked for already existed, so it only needed the client side.

**The remaining work is content, not code** — see [docs/05-roadmap.md](../docs/05-roadmap.md)
phases 6 (prose) and 7 (diagrams). Both are data changes.

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
