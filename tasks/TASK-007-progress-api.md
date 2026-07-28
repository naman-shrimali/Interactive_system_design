# TASK-007: Progress endpoints (section / link / diagram / summary)

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Implement the three progress-write endpoints and the dashboard summary endpoint.

## Prerequisites
TASK-005 (router pattern, types.ts).

## Context
All writes are upserts into the three `*_progress` tables for `user_id = 1`. Request bodies are validated with zod; a write against a non-existent target id returns 404 (check existence first with `SELECT 1 FROM <table> WHERE id = ?`).

## Files to create
```
server/src/routes/progress.ts
```
## Files to modify
```
server/src/index.ts        (mount progressRouter)
```

## Data contracts (docs/02 §5)

| Route | Body (zod) | Response |
|---|---|---|
| `PUT /api/progress/section/:id` | `{ status: z.enum(['not_started','in_progress','completed']) }` | `200 { ok: true }` |
| `PUT /api/progress/link/:id` | `{ completed: z.boolean() }` | `200 { ok: true }` |
| `PUT /api/progress/diagram/:id` | `{ viewed: z.literal(true) }` | `200 { ok: true }` |
| `GET /api/progress/summary` | — | `200 { sources: [...] }` (shape below) |

Upsert SQL (section shown; link/diagram identical pattern with their columns, booleans stored as 0/1):
```sql
INSERT INTO section_progress (user_id, section_id, status, updated_at)
VALUES (1, ?, ?, datetime('now'))
ON CONFLICT(user_id, section_id) DO UPDATE
  SET status = excluded.status, updated_at = excluded.updated_at;
```

Summary response element: `{ slug, title, sectionsTotal, sectionsCompleted, linksTotal, linksCompleted, diagramsTotal, diagramsViewed }` — one per source, ordered by `sources.sort_order`:
```sql
SELECT so.slug, so.title,
  (SELECT COUNT(*) FROM sections sec JOIN chapters c ON sec.chapter_id = c.id
    WHERE c.source_id = so.id) AS sections_total,
  (SELECT COUNT(*) FROM sections sec JOIN chapters c ON sec.chapter_id = c.id
    JOIN section_progress sp ON sp.section_id = sec.id AND sp.user_id = 1 AND sp.status = 'completed'
    WHERE c.source_id = so.id) AS sections_completed,
  (SELECT COUNT(*) FROM external_links el JOIN sections sec ON el.section_id = sec.id
    JOIN chapters c ON sec.chapter_id = c.id WHERE c.source_id = so.id) AS links_total,
  (SELECT COUNT(*) FROM external_links el JOIN sections sec ON el.section_id = sec.id
    JOIN chapters c ON sec.chapter_id = c.id
    JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = 1 AND lp.completed = 1
    WHERE c.source_id = so.id) AS links_completed,
  (SELECT COUNT(*) FROM diagrams d JOIN sections sec ON d.section_id = sec.id
    JOIN chapters c ON sec.chapter_id = c.id WHERE c.source_id = so.id) AS diagrams_total,
  (SELECT COUNT(*) FROM diagrams d JOIN sections sec ON d.section_id = sec.id
    JOIN chapters c ON sec.chapter_id = c.id
    JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = 1 AND dp.viewed = 1
    WHERE c.source_id = so.id) AS diagrams_viewed
FROM sources so ORDER BY so.sort_order;
```

## Steps
1. Shared helper in `progress.ts`: `parseId(req) → number | null` (400 on null) and `exists(table, id) → boolean` using a whitelist map `{ section: 'sections', link: 'external_links', diagram: 'diagrams' }` — never interpolate user input into table names.
2. Implement the three PUT handlers: parse id → 400, zod `safeParse` body → 400 with `{ error: <zod message> }`, existence check → 404, upsert, `{ ok: true }`.
3. Implement `GET /progress/summary` with the SQL above, mapping to camelCase.

## Acceptance criteria
- [ ] `curl -X PUT localhost:4000/api/progress/section/1 -H 'content-type: application/json' -d '{"status":"completed"}'` → `{"ok":true}`; re-run with `"in_progress"` updates the same row (still 1 row in table).
- [ ] Invalid body (`{"status":"done"}`) → 400; unknown id 999999 → 404.
- [ ] `PUT /api/progress/link/<real-id> {"completed":true}` then `{"completed":false}` flips the stored value 1 → 0.
- [ ] `PUT /api/progress/diagram/<real-id> {"viewed":true}` → ok; `{"viewed":false}` → 400 (contract is literal `true`).
- [ ] `GET /api/progress/summary` returns 2 sources with all 8 fields; numbers change after the writes above.
- [ ] `npx tsc --noEmit` passes in `server/`.

## Out of scope
Notes (TASK-008), any UI, per-chapter summary granularity (dashboard computes from `/api/curriculum`).
