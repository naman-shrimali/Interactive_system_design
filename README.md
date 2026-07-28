# Interactive System Design

An interactive, local-first learning tool for System Design. Browse a structured curriculum
(from [The System Design Primer](https://github.com/donnemartin/system-design-primer), MIT ©
Donne Martin) and original interactive diagrams inspired by Alex Xu's *System Design Interview*.
Track progress, complete external resources, and take markdown notes per chapter/section.

## Run

```bash
# 1. content ingestion — clones the primer repo, then compiles the topic map
#    into content/curriculum.json (prints the thin-topic backlog at the end)
cd scripts && npm install && npm run ingest

# 2. server (API on :4000) — applies schema v2, seeds, then serves
cd ../server && npm install && npm run seed && npm run dev

# 3. client (UI on :5173, proxies /api → :4000)
cd ../client && npm install && npm run dev
```

To rebuild the database from scratch (discards progress and notes):

```bash
rm -f server/data/app.db server/data/app.db-wal server/data/app.db-shm
```

See [PLAN.md](PLAN.md) for the full architecture and the atomic task breakdown in [tasks/](tasks/).

## Layout

- `client/` — React + Vite + TypeScript + Tailwind (+ React Flow, for the diagram engine)
- `server/` — Express + TypeScript + better-sqlite3 (REST API)
- `scripts/` — content ingestion + diagram validation
- `content/` — `topic-map.json` and `authored/` are hand-written; `curriculum.json` is generated
- `docs/` — architecture, data contracts, ingestion, diagrams, topic model

Content is organised by **topic** (`tracks → topics → sections`), merging both sources — see
[docs/06-topic-model.md](docs/06-topic-model.md). Adding content is a data change, not a code change.
