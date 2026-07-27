# Interactive System Design — Master Plan

An interactive learning tool for System Design built from two sources:

1. **The System Design Primer** (donnemartin/system-design-primer, MIT) — text content, ingested automatically.
2. **System Design Interview – An Insider's Guide, 2nd Edition** by Alex Xu — **visual reference only**. We never extract text or images from the book. We hand-author original interactive diagrams inspired by the concepts it teaches.

> ⚠️ **Fact check from planning:** the attached PDF ("SystemDesignInterview 2nd edition.pdf") is the **Second Edition of Volume 1** (chapters: Rate Limiter, Consistent Hashing, Key-Value Store, URL Shortener, Web Crawler, Notification System, News Feed, Chat System, Autocomplete, YouTube, Google Drive) — not Volume 2 (Proximity Service, Google Maps, Payment System…). All book curriculum in this plan follows the **actual PDF table of contents**.

## How to use this plan (read this first, AI coders)

- Every unit of work is an **atomic task file** in [`tasks/`](tasks/). Work on exactly ONE task at a time.
- A task file contains **all context you need**. Do not read the whole codebase. Do not read other task files. If a task references a doc section, read only that section.
- **Never invent data shapes.** Every JSON shape, SQL table, and API route is defined in [`docs/02-data-models.md`](docs/02-data-models.md). Copy them exactly.
- Do not add dependencies, features, or files beyond what the task lists. "Out of scope" means out of scope.
- After finishing a task, run its **Acceptance criteria** checklist. All boxes must pass before the task is done.

## Document index

| File | Contents |
|---|---|
| [docs/01-architecture.md](docs/01-architecture.md) | Tech stack, justification, repo layout, API surface |
| [docs/02-data-models.md](docs/02-data-models.md) | SQLite DDL, diagram JSON Schema, TypeScript types, API contracts |
| [docs/03-ingestion.md](docs/03-ingestion.md) | Pipeline: GitHub Markdown → curriculum.json → SQLite |
| [docs/04-diagrams.md](docs/04-diagrams.md) | Library choice (React Flow), node catalog, authoring workflow |
| [docs/05-roadmap.md](docs/05-roadmap.md) | Phases and the full numbered task list |
| [tasks/TASK-001 … TASK-015](tasks/) | Fully-specified atomic tasks (more generated as phases unlock) |

## Golden rules for all code

1. TypeScript everywhere, `strict: true`.
2. DB columns are `snake_case`; JSON/API fields are `camelCase`. Mapping happens only in the server route layer.
3. The app is **local, single-user**: every query uses `user_id = 1` (seeded as `default`). The schema still has a `users` table so multi-user is possible later.
4. Content ingestion is **idempotent**: re-running seeds must never duplicate rows or destroy progress/notes (upserts keyed on slugs).
5. No text or images from the Alex Xu book ever enter the repo or database. Book chapters hold only our own original titles, summaries, and diagram JSON.
6. Keep MIT attribution for system-design-primer content (`source_url` per section + license notice in the reader UI footer).
