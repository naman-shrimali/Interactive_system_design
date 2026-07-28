# TASK-002: SQLite schema + connection module

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Create the database schema file, a connection module that applies it on startup, and seed the default user.

## Prerequisites
TASK-001 (server package exists with `better-sqlite3` installed).

## Context
Single-user local app; SQLite file lives at `server/data/app.db` (git-ignored). The schema below is the **entire** database — copy it exactly, do not add or rename anything. All app queries later assume `user_id = 1`.

## Files to create
```
server/data/.gitkeep
server/src/db/schema.sql
server/src/db/index.ts
```
## Files to modify
```
server/src/index.ts   (import the db module so schema applies on boot)
```

## Data contract
`server/src/db/schema.sql` = **verbatim** contents of docs/02-data-models.md §1 (the full `PRAGMA foreign_keys = ON;` + 10 `CREATE TABLE/INDEX IF NOT EXISTS` statements). If you do not have that doc open, stop and read ONLY its §1.

## Steps

1. Create `server/data/.gitkeep` (empty file) so the directory exists in git.
2. Write `schema.sql` exactly as specified.
3. `server/src/db/index.ts`:
   ```ts
   import Database from 'better-sqlite3';
   import fs from 'fs';
   import path from 'path';

   const DB_PATH = path.join(__dirname, '..', '..', 'data', 'app.db');
   const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

   export const db = new Database(DB_PATH);
   db.pragma('journal_mode = WAL');
   db.pragma('foreign_keys = ON');
   db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
   db.prepare(
     `INSERT INTO users (id, username) VALUES (1, 'default')
      ON CONFLICT(id) DO NOTHING`
   ).run();

   export const USER_ID = 1;
   ```
   Note: `tsx` runs TS from `src/`, so `__dirname` resolves to `server/src/db` in dev — the two `..` segments land on `server/`. For `npm run build` output (`dist/db`), the same relative path works. `schema.sql` must be copied to `dist/` by adding to `server/package.json`: `"build": "tsc && cp src/db/schema.sql dist/db/schema.sql"`.
4. In `server/src/index.ts`, add `import './db';` as the first import.

## Acceptance criteria
- [ ] `npm run dev` in `server/` creates `server/data/app.db` and logs no errors.
- [ ] `sqlite3 server/data/app.db ".tables"` lists exactly: `users sources chapters sections external_links diagrams section_progress link_progress diagram_progress notes`.
- [ ] `sqlite3 server/data/app.db "SELECT username FROM users WHERE id=1"` → `default`.
- [ ] Running `npm run dev` a second time works (idempotent — no "table already exists" errors).
- [ ] Inserting a note with both `chapter_id` and `section_id` NULL fails the CHECK constraint (verify manually with `sqlite3`).

## Out of scope
Seeding curriculum content (TASK-004), any API routes, migrations tooling.
