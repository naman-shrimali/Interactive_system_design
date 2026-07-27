# TASK-006: `GET /api/sections/:id` (section detail)

## Objective
Implement the section detail endpoint: markdown content, breadcrumb info, external links with completion, and diagram metadata with viewed flags.

## Prerequisites
TASK-005 (types.ts and router mounting pattern exist).

## Context
The reader page fetches this once per section visit. `user_id = 1` for all progress joins.

## Files to create
```
server/src/routes/sections.ts
```
## Files to modify
```
server/src/index.ts        (mount sectionsRouter)
```

## Data contract
Response `200`: `SectionDetail` from docs/02 §4 —
`{ id, slug, title, contentMarkdown, sourceUrl, chapterId, chapterTitle, sourceSlug, links: ExternalLink[], diagrams: DiagramMeta[] }`.
`ExternalLink` = `{ id, url, title, completed: boolean }`; `DiagramMeta` = `{ id, slug, title, viewed: boolean }`.
`404 { "error": "section not found" }` for unknown id; `400` for non-numeric id.

## Steps

1. Validate `req.params.id` with `Number.parseInt`; `Number.isNaN` → 400.
2. Main query:
   ```sql
   SELECT sec.id, sec.slug, sec.title, sec.content_markdown, sec.source_url,
          c.id AS chapter_id, c.title AS chapter_title, s.slug AS source_slug
   FROM sections sec
   JOIN chapters c ON c.id = sec.chapter_id
   JOIN sources s  ON s.id = c.source_id
   WHERE sec.id = ?;
   ```
   No row → 404.
3. Links:
   ```sql
   SELECT el.id, el.url, el.title, COALESCE(lp.completed, 0) AS completed
   FROM external_links el
   LEFT JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = ?
   WHERE el.section_id = ? ORDER BY el.sort_order;
   ```
4. Diagrams (metadata only — never send `spec_json` here):
   ```sql
   SELECT d.id, d.slug, d.title, COALESCE(dp.viewed, 0) AS viewed
   FROM diagrams d
   LEFT JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = ?
   WHERE d.section_id = ? ORDER BY d.sort_order;
   ```
5. Map to camelCase; convert `completed`/`viewed` 0/1 → boolean with `=== 1`.

## Acceptance criteria
- [ ] `curl localhost:4000/api/sections/1` returns the full shape with a non-empty `contentMarkdown` (primer section).
- [ ] A primer section with links returns `links[]` each with `completed: false` (boolean, not 0).
- [ ] The `scale-to-millions` overview section returns `diagrams` with one entry (`slug: "web-data-tier"`, `viewed: false`).
- [ ] `curl -i localhost:4000/api/sections/999999` → 404 with `{"error":"section not found"}`; `/api/sections/abc` → 400.
- [ ] `npx tsc --noEmit` passes in `server/`.

## Out of scope
Diagram spec delivery (TASK-009), progress writes (TASK-007), notes (TASK-008).
