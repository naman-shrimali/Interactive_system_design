# Interactive System Design

An interactive, local-first learning tool for System Design. Browse a structured curriculum
(from [The System Design Primer](https://github.com/donnemartin/system-design-primer), MIT ©
Donne Martin) and original interactive diagrams inspired by Alex Xu's *System Design Interview*.
Track progress, complete external resources, and take markdown notes per chapter/section.

## Run

```bash
# 1. one-time content ingestion (clones the primer repo, generates content/primer-curriculum.json)
cd scripts && npm install && npm run ingest

# 2. server (API on :4000) — applies schema, then seed the DB
cd ../server && npm install && npm run seed && npm run dev

# 3. client (UI on :5173, proxies /api → :4000)
cd ../client && npm install && npm run dev
```

See [PLAN.md](PLAN.md) for the full architecture and the atomic task breakdown in [tasks/](tasks/).

## Layout

- `client/` — React + Vite + TypeScript + Tailwind + React Flow
- `server/` — Express + TypeScript + better-sqlite3 (REST API)
- `scripts/` — content ingestion + diagram validation
- `content/` — generated + hand-authored curriculum and diagram JSON
- `docs/` — planning documentation
