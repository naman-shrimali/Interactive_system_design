# TASK-008: Notes CRUD endpoints

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Implement create/read/update/delete for notes anchored to exactly one chapter or one section.

## Prerequisites
TASK-005 (router pattern, types.ts).

## Context
Notes are markdown text owned by `user_id = 1`. The DB CHECK constraint already enforces the chapter-XOR-section anchor; the API must enforce it too so users get a 400 instead of a SQL error.

## Files to create
```
server/src/routes/notes.ts
```
## Files to modify
```
server/src/index.ts        (mount notesRouter)
```

## Data contracts (docs/02 §5)
`Note` = `{ id, chapterId, sectionId, contentMarkdown, createdAt, updatedAt }` (null for the unused anchor).

| Route | Body | Response |
|---|---|---|
| `GET /api/notes?sectionId=<n>` or `?chapterId=<n>` | — | `200 { notes: Note[] }` (newest `updatedAt` first) |
| `POST /api/notes` | `{ sectionId? , chapterId?, contentMarkdown }` | `201 Note` |
| `PUT /api/notes/:id` | `{ contentMarkdown }` | `200 Note` |
| `DELETE /api/notes/:id` | — | `200 { ok: true }` |

zod for POST:
```ts
const createSchema = z.object({
  sectionId: z.number().int().positive().optional(),
  chapterId: z.number().int().positive().optional(),
  contentMarkdown: z.string().min(1),
}).refine(b => (b.sectionId === undefined) !== (b.chapterId === undefined),
  { message: 'provide exactly one of sectionId / chapterId' });
```
PUT: `z.object({ contentMarkdown: z.string().min(1) })`.

## Steps
1. Row→Note mapper: `{ id, chapterId: row.chapter_id, sectionId: row.section_id, contentMarkdown: row.content_markdown, createdAt: row.created_at, updatedAt: row.updated_at }`.
2. `GET`: require exactly one query param (else 400). Parse int (400 on NaN). `SELECT * FROM notes WHERE user_id = 1 AND section_id = ?` (or `chapter_id = ?`) `ORDER BY updated_at DESC`.
3. `POST`: validate; verify the anchor row exists (`SELECT 1 FROM sections/chapters WHERE id = ?` → 404 if not); INSERT; re-select by `last_insert_rowid()`; return 201.
4. `PUT`: validate; `UPDATE notes SET content_markdown = ?, updated_at = datetime('now') WHERE id = ? AND user_id = 1`; `changes === 0` → 404; re-select and return.
5. `DELETE`: `DELETE ... WHERE id = ? AND user_id = 1`; `changes === 0` → 404; else `{ ok: true }`.

## Acceptance criteria
- [ ] POST with `sectionId: 1` returns 201 with `sectionId: 1`, `chapterId: null`, ISO timestamps.
- [ ] POST with both anchors, neither anchor, or empty `contentMarkdown` → 400 each.
- [ ] POST with `sectionId: 999999` → 404.
- [ ] GET `?sectionId=1` lists the created note; GET with no params or both params → 400.
- [ ] PUT updates text and bumps `updatedAt`; DELETE removes it; second DELETE → 404.
- [ ] `npx tsc --noEmit` passes in `server/`.

## Out of scope
The `GET /api/notes/all` aggregation route (added in TASK-017), notes UI, markdown sanitization (rendering is client-side and HTML is disabled there).
