# Interactive System Design — Master Plan

An interactive learning tool for System Design, built from two sources merged into **one topic-first
curriculum**:

1. **The System Design Primer** (donnemartin/system-design-primer, MIT) — text, ingested automatically
   and attributed per section.
2. **System Design Interview – An Insider's Guide** by Alex Xu — used **only as a topic checklist**.
   We copy no text and no images from it; every book-derived topic is written originally by us.

> The attached PDF is the **Second Edition of Volume 1** (Rate Limiter, Consistent Hashing, Key-Value
> Store, URL Shortener, Web Crawler, Notification System, News Feed, Chat, Autocomplete, YouTube,
> Google Drive) — not Volume 2. The topic map follows the actual PDF table of contents.

Visual design takes inspiration from ByteByteGo's reading experience (bold colour-blocked cards, serif
prose, diagrams as first-class content). No assets or copy are taken from it.

## How to use this plan (read this first, AI coders)

- Every unit of work is an **atomic task file** in [`tasks/`](tasks/). Work on exactly ONE at a time.
  Check [`tasks/README.md`](tasks/README.md) first — many task files describe **already-shipped** work
  and are kept only as history.
- A task file contains all the context you need. Do not read the whole codebase.
- **Never invent data shapes.** Every JSON shape, SQL table, and API route is defined in
  [`docs/02-data-models.md`](docs/02-data-models.md). Copy them exactly.
- Do not add dependencies, features, or files beyond what the task lists.
- After finishing, run the task's **Acceptance criteria** checklist. All boxes must pass.

## Document index

| File | Contents |
|---|---|
| [docs/01-architecture.md](docs/01-architecture.md) | Tech stack, repo layout, design system, API surface |
| [docs/02-data-models.md](docs/02-data-models.md) | **The contract:** SQLite DDL, topic-map + curriculum formats, diagram schema, TS types, API |
| [docs/03-ingestion.md](docs/03-ingestion.md) | The two-stage pipeline and its coverage guarantees |
| [docs/04-diagrams.md](docs/04-diagrams.md) | React Flow choice, node catalog, authoring workflow |
| [docs/05-roadmap.md](docs/05-roadmap.md) | Phases, status, and the task list |
| [docs/06-topic-model.md](docs/06-topic-model.md) | Why `tracks → topics → sections`, and its vocabulary |

## Current status

Schema v2 (topic model), the ingestion pipeline, the API, and the redesigned reader UI are **built and
verified**. Remaining: the **diagram engine** (specced in tasks/TASK-015, 018–024, not yet written),
then **content authoring** to clear the thin-topic backlog, then **diagram authoring**.

Run `cd scripts && npm run ingest` — the ranked list of topics under 800 words it prints *is* the
content backlog.

## Golden rules for all code

1. TypeScript everywhere, `strict: true`.
2. DB columns are `snake_case`; JSON/API fields are `camelCase`. Map only in the route layer.
3. Local single-user: every query uses `user_id = 1` (`USER_ID` from `server/src/db`).
4. Seeding is **idempotent** — natural keys are slugs, so re-seeding never duplicates rows or destroys
   progress and notes.
5. **No text or image from the Alex Xu book** ever enters the repo or the database.
6. Primer content keeps its MIT attribution (`attribution_url` per section, notice in the UI).
7. **Content is data.** Adding or deepening a topic means editing `content/topic-map.json` and a
   markdown file under `content/authored/` — never TypeScript.
