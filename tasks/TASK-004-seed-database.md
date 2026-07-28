# TASK-004: Seed script (curriculum JSON + diagram files → SQLite)

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Write `server/src/db/seed.ts` that idempotently upserts `content/*-curriculum.json` and `content/diagrams/**/*.json` into the database.

## Prerequisites
TASK-002 (db module), TASK-003 (`content/primer-curriculum.json` exists). `content/book-curriculum.json` already exists in the repo — do not edit it.

## Context
Seeding must be **re-runnable forever**: content updates change text in place while row ids stay stable (all upserts key on slugs), so user progress and notes are never lost. Diagram JSON files live at `content/diagrams/<sourceSlug>__<chapterSlug>__<sectionSlug>/<diagramSlug>.json`; the directory name locates the owning section. Missing diagram directories are fine (there may be none yet).

## Files to create
```
server/src/db/seed.ts
```
## Files to modify
```
server/package.json    (add script: "seed": "tsx src/db/seed.ts")
```

## Data contracts
- Input JSON shape: docs/02-data-models.md §2.
- Tables: docs/02-data-models.md §1 (`sources`, `chapters`, `sections`, `external_links`, `diagrams`).
- Diagram spec files are stored as-is into `diagrams.spec_json` (validation is TASK-009's ajv script; here only `JSON.parse` must succeed).

## Steps

1. Import `db` from `./index`. Resolve the repo root: `path.join(__dirname, '..', '..', '..')` (from `server/src/db/`).
2. For each existing file of `content/primer-curriculum.json`, `content/book-curriculum.json`:
   ```
   upsertSource:
     INSERT INTO sources (slug, title, kind, description, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET title=excluded.title, kind=excluded.kind,
       description=excluded.description, sort_order=excluded.sort_order
   then SELECT id FROM sources WHERE slug = ?
   ```
   Repeat the same upsert-then-select pattern for each chapter (`ON CONFLICT(source_id, slug)`), each section (`ON CONFLICT(chapter_id, slug)`, updating `title`, `content_markdown`, `source_url`, `sort_order`), and each external link (`ON CONFLICT(section_id, url)` updating `title`, `sort_order`).
3. Wrap the whole seed in one transaction: `db.transaction(fn)()`.
4. Diagrams: if `content/diagrams/` exists, for each `<dirName>/<file>.json`:
   - split `dirName` on `"__"` → `[sourceSlug, chapterSlug, sectionSlug]`; malformed names → throw.
   - look up the section id via a 3-way join on slugs; if not found → throw with the path.
   - `JSON.parse` the file (throw on invalid JSON), then upsert into `diagrams` with `slug` = filename without `.json`, `title` = parsed `title`, `spec_json` = raw file text.
5. Print summary: `Seeded: X sources, Y chapters, Z sections, L links, D diagrams.` (counts via `SELECT COUNT(*)`).

## Acceptance criteria
- [ ] `cd server && npm run seed` completes and prints the summary with sources = 2.
- [ ] `sqlite3 server/data/app.db "SELECT COUNT(*) FROM chapters WHERE source_id=(SELECT id FROM sources WHERE slug='primer')"` → 24.
- [ ] `sqlite3 ... "SELECT COUNT(*) FROM chapters WHERE source_id=(SELECT id FROM sources WHERE slug='sdi-vol1-2e')"` → 15.
- [ ] Run seed twice: all `COUNT(*)` values identical after the second run (no duplicates).
- [ ] Manually set a section's progress (`INSERT INTO section_progress (user_id, section_id, status) VALUES (1, 1, 'completed')`), re-run seed, and confirm the row is unchanged.
- [ ] `sqlite3 ... "SELECT COUNT(*) FROM sections WHERE content_markdown != ''"` is > 50 (primer text landed).

## Out of scope
API routes, ajv schema validation (TASK-009), authoring any diagram or book content.
