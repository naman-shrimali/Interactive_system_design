# TASK-005: `GET /api/curriculum` (tree + progress rollups)

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Implement the curriculum tree endpoint: sources → chapters → sections, each section carrying its progress status and link/diagram completion counts.

## Prerequisites
TASK-004 (database is seeded).

## Context
This is the app's main read endpoint — the sidebar renders entirely from it. Single user: every progress join uses `user_id = 1` (import `USER_ID` from `../db`). Strategy: three flat queries, assemble the tree in JS (no recursive SQL).

## Files to create
```
server/src/types.ts        (copy ALL types verbatim from docs/02-data-models.md §4)
server/src/routes/curriculum.ts
```
## Files to modify
```
server/src/index.ts        (mount: app.use('/api', curriculumRouter))
```

## Data contract
Response `200`: `{ "sources": CurriculumSource[] }` — exact field names in docs/02 §4 (`CurriculumSource`, `CurriculumChapter`, `CurriculumSection`). Chapters and sections sorted by `sortOrder` ascending.

## Steps

1. Create `server/src/types.ts` from docs/02 §4.
2. `curriculum.ts` — `export const curriculumRouter = Router()` with one handler `GET /curriculum`:
   ```sql
   -- q1: SELECT id, slug, title, kind, description, sort_order FROM sources ORDER BY sort_order;
   -- q2: SELECT id, source_id, slug, title, description, sort_order FROM chapters ORDER BY sort_order;
   -- q3 (one row per section, progress + counts):
   SELECT
     sec.id, sec.chapter_id, sec.slug, sec.title, sec.sort_order,
     COALESCE(sp.status, 'not_started') AS progress_status,
     (SELECT COUNT(*) FROM external_links el WHERE el.section_id = sec.id) AS link_count,
     (SELECT COUNT(*) FROM external_links el
        JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = ? AND lp.completed = 1
      WHERE el.section_id = sec.id) AS links_completed,
     (SELECT COUNT(*) FROM diagrams d WHERE d.section_id = sec.id) AS diagram_count,
     (SELECT COUNT(*) FROM diagrams d
        JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = ? AND dp.viewed = 1
      WHERE d.section_id = sec.id) AS diagrams_viewed
   FROM sections sec
   LEFT JOIN section_progress sp ON sp.section_id = sec.id AND sp.user_id = ?
   ORDER BY sec.sort_order;
   ```
3. Assemble: group q3 rows by `chapter_id`, q2 rows by `source_id`, then map to camelCase response objects. Snake→camel mapping happens here and only here.
4. Mount the router in `index.ts` after the health route.

## Acceptance criteria
- [ ] `curl -s localhost:4000/api/curriculum | python3 -m json.tool` returns 2 sources; `primer` has 24 chapters, `sdi-vol1-2e` has 15.
- [ ] Every section has `progressStatus: "not_started"` on a fresh DB, plus numeric `linkCount`, `linksCompleted`, `diagramCount`, `diagramsViewed`.
- [ ] After `sqlite3 server/data/app.db "INSERT INTO section_progress (user_id, section_id, status) VALUES (1, 1, 'completed')"`, the response shows that section as `completed`.
- [ ] The seeded example diagram appears: exactly one section in `sdi-vol1-2e` / `scale-to-millions` has `diagramCount: 1`.
- [ ] Response contains no snake_case keys (grep the JSON for `_`).
- [ ] `npx tsc --noEmit` passes in `server/`.

## Out of scope
Section detail (TASK-006), any write endpoints, caching.
