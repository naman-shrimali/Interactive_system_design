# 05 — Roadmap & Atomic Task Breakdown

Tasks are strictly ordered inside a phase; phases 2/3 and 5 can proceed in parallel once phase 1 lands. One task = one PR-sized change with its own acceptance checklist. **Phases 0–5 have fully-written task files (linked below).** Phase 6/7 tasks are generated from this list when unlocked (copy the template of any existing task file).

## Phase 0 — Foundation
- **TASK-001** Scaffold repo: `client/` (Vite+React+TS+Tailwind), `server/` (Express+TS), root scripts, health endpoint. → [tasks/TASK-001-scaffold.md](../tasks/TASK-001-scaffold.md)

## Phase 1 — Data layer
- **TASK-002** SQLite schema + connection module + default user seed. → [tasks/TASK-002-database-schema.md](../tasks/TASK-002-database-schema.md)
- **TASK-003** Primer ingestion script: README.md → `content/primer-curriculum.json`. → [tasks/TASK-003-ingest-primer.md](../tasks/TASK-003-ingest-primer.md)
- **TASK-004** Seed script: curriculum JSON + diagram files → SQLite (idempotent upserts). → [tasks/TASK-004-seed-database.md](../tasks/TASK-004-seed-database.md)

## Phase 2 — API
- **TASK-005** `GET /api/curriculum` (tree + progress rollups). → [tasks/TASK-005-curriculum-api.md](../tasks/TASK-005-curriculum-api.md)
- **TASK-006** `GET /api/sections/:id` (detail + links + diagrams). → [tasks/TASK-006-section-api.md](../tasks/TASK-006-section-api.md)
- **TASK-007** Progress endpoints (`PUT section/link/diagram`, `GET summary`). → [tasks/TASK-007-progress-api.md](../tasks/TASK-007-progress-api.md)
- **TASK-008** Notes CRUD endpoints. → [tasks/TASK-008-notes-api.md](../tasks/TASK-008-notes-api.md)
- **TASK-009** `GET /api/diagrams/:id` + ajv validation script. → [tasks/TASK-009-diagram-api-validation.md](../tasks/TASK-009-diagram-api-validation.md)

## Phase 3 — Reader UI
- **TASK-010** Typed API client + Zustand store. → [tasks/TASK-010-api-client-store.md](../tasks/TASK-010-api-client-store.md)
- **TASK-011** App shell: sidebar curriculum tree with progress badges, routing. → [tasks/TASK-011-app-shell-sidebar.md](../tasks/TASK-011-app-shell-sidebar.md)
- **TASK-012** Section reader page: markdown rendering + attribution footer. → [tasks/TASK-012-section-reader.md](../tasks/TASK-012-section-reader.md)
- **TASK-013** External-resources panel with completion checkboxes. → [tasks/TASK-013-links-panel.md](../tasks/TASK-013-links-panel.md)
- **TASK-014** Section progress controls + chapter progress bars. → [tasks/TASK-014-progress-controls.md](../tasks/TASK-014-progress-controls.md)

## Phase 4 — Notes
- **TASK-016** Notes panel: CRUD + markdown preview, anchored to current section. → [tasks/TASK-016-notes-panel.md](../tasks/TASK-016-notes-panel.md)
- **TASK-017** Chapter notes page + "all my notes" page (adds `GET /api/notes/all`). → [tasks/TASK-017-notes-pages.md](../tasks/TASK-017-notes-pages.md)

## Phase 5 — Diagram engine
- **TASK-015** BaseNode + first 4 node components + registry + preview page. → [tasks/TASK-015-diagram-nodes-batch1.md](../tasks/TASK-015-diagram-nodes-batch1.md)
- **TASK-018** Node batch 2: dns, cdn, cache, nosql, message_queue. → [tasks/TASK-018-diagram-nodes-batch2.md](../tasks/TASK-018-diagram-nodes-batch2.md)
- **TASK-019** Node batch 3: stacks, service, text_box, table. → [tasks/TASK-019-diagram-nodes-batch3.md](../tasks/TASK-019-diagram-nodes-batch3.md)
- **TASK-020** LabeledEdge component (color/dash/step-badge/emphasis). → [tasks/TASK-020-labeled-edge.md](../tasks/TASK-020-labeled-edge.md)
- **TASK-021** Group rendering (dashed/solid/filled tiers). → [tasks/TASK-021-group-node.md](../tasks/TASK-021-group-node.md)
- **TASK-022** DiagramCanvas: `InteractiveDiagram` JSON → React Flow props. → [tasks/TASK-022-diagram-canvas.md](../tasks/TASK-022-diagram-canvas.md)
- **TASK-023** FlowStepper + DiagramViewer: step-through highlighting + viewed tracking. → [tasks/TASK-023-flow-stepper.md](../tasks/TASK-023-flow-stepper.md)
- **TASK-024** Embed diagrams in the section page + file-driven preview route. → [tasks/TASK-024-diagram-embedding.md](../tasks/TASK-024-diagram-embedding.md)

## Phase 6 — Book diagram content (one task per chapter; each authors 3–6 diagram JSON files)
- TASK-025 Ch.1 Scale From Zero To Millions (single server → LB → replication → cache/CDN → multi-DC → queue)
- TASK-026 Ch.4 Rate Limiter · TASK-027 Ch.5 Consistent Hashing · TASK-028 Ch.6 Key-Value Store
- TASK-029 Ch.7 Unique ID Generator · TASK-030 Ch.8 URL Shortener · TASK-031 Ch.9 Web Crawler
- TASK-032 Ch.10 Notification System · TASK-033 Ch.11 News Feed · TASK-034 Ch.12 Chat System
- TASK-035 Ch.13 Autocomplete · TASK-036 Ch.14 YouTube · TASK-037 Ch.15 Google Drive
- (Primer solution chapters get diagrams later, same pattern: TASK-038+)

## Phase 7 — Polish
- TASK-040 Dashboard page (progress summary cards per source/chapter)
- TASK-041 Client-side search over section titles
- TASK-042 Notes export (single markdown file download)

## Dependency graph (coarse)

```
T001 → T002 → T004 → {T005..T009} → {T010..T014, T016..T017}
T001 → T003 → T004
T001 → T015 → T018/T019/T020/T021 → T022 → T023 → T024 → T025..T037
```
