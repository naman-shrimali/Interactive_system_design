# 05 — Roadmap & Status

## Where things stand

| Phase | Status |
|---|---|
| 0. Scaffold (client + server + scripts) | ✅ shipped |
| 1. Data layer — schema, ingestion, seeding | ✅ shipped (rebuilt as schema v2, the topic model) |
| 2. API — curriculum, topics, progress, notes, diagrams | ✅ shipped |
| 3. Reader UI — sidebar, topic page, links, progress, notes | ✅ shipped |
| 4. Design system — tokens, dark mode, serif reading column, responsive | ✅ shipped |
| 5. Diagram engine — 17 node types, edges, groups, canvas, flow stepper | ✅ shipped |
| 6. Content authoring | ✅ shipped — 0 topics under 800 words; 30/30 published |
| 7. Diagram authoring | ✅ shipped — 27 diagrams across 25 of 30 topics; 5 left deliberately prose-only |
| 8. Polish — dashboard, search, notes export | ✅ shipped |

The original phases 1–3 were re-cut when the curriculum moved from a source-first to a topic-first
model ([docs/06-topic-model.md](06-topic-model.md)). Task files for that shipped work are kept as
history — see [tasks/README.md](../tasks/README.md).

## Phase 5 — Diagram engine (shipped)

Built and verified in-browser: all 17 node types, labelled edges with step badges, tier groups, the
spec→React Flow canvas, and the flow stepper that marks a diagram viewed on completion. Diagrams embed
in **TopicPage** and live at `content/diagrams/<topicSlug>/<slug>.json`. Task files kept as history:

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

**Status: done.** Zero topics under 800 words; 54,909 words across 101 sections, median topic 1,761 words. 19 authored files remain unwritten, but every topic they belong to already clears the bar on primer content — they are enhancements, not gaps, and `npm run ingest` lists them.

## Phase 7 — Diagram authoring (shipped)

27 diagrams across 25 of 30 topics, 68 walkthroughs, all 17 node types exercised, every diagram
anchored to a section. Includes the scaling-journey evolution sequence (one system at three scales).

Five topics are **deliberately** prose-only: `back-of-envelope` and `performance-and-latency` are
carried by tables and worked arithmetic, `security` is a checklist, `nosql-databases` is a four-way
comparison a table serves better, and `interview-framework` is a process rather than a system. A
forced diagram there would be filler.

Authoring loop: write JSON → `npm run validate:diagrams` → view at `/diagram-preview` → `npm run seed`.

## Phase 8 — Polish (shipped)

- **Dashboard** (`/dashboard`, `DashboardPage.tsx`) reads `GET /api/progress/summary` (which already
  existed with no UI) and renders an overall-progress card plus one card per track: sections completed,
  resources read, diagrams viewed, and a "Continue: `<next incomplete topic>`" link. `Card` in
  `components/ui` gained a `style` prop so per-track accent colours can be applied the same way HomePage
  already does.
- **Search** (`components/search/CommandPalette.tsx`) is a `Cmd/Ctrl+K` command palette, entirely
  client-side against the curriculum tree already held in `useAppStore` — no new endpoint. Ranks by
  title-exact → title-prefix → title-contains → track-title-contains → summary-contains; arrow keys
  navigate, Enter opens the topic. Wired into `App.tsx`'s `Shell` component (global keydown listener)
  and a `TopBar` button (desktop: labelled with shortcut hint; mobile: icon-only).
- **Notes export** is a button on `NotesPage` that appears once `notes.length > 0`, builds one markdown
  document (each note as `## <anchor title>` + content + updated timestamp) client-side from the
  already-fetched `NoteWithAnchor[]`, and downloads it via a `Blob` + object URL. No new endpoint.

Verified in-browser in both themes: dashboard stat cards and progress bars, palette search/filter/
keyboard-select/navigate, and export producing well-formed markdown from a real note.
