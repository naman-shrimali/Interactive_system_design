# Interactive System Design

An interactive, local-first learning tool for System Design. Browse a structured curriculum
(from [The System Design Primer](https://github.com/donnemartin/system-design-primer), MIT ©
Donne Martin) and original interactive diagrams inspired by Alex Xu's *System Design Interview*.
Track progress, complete external resources, and take markdown notes per chapter/section.

## Run

The app is **static** — the client reads pre-exported JSON and keeps progress and notes in
`localStorage`, so no API server is needed to use it.

```bash
# 1. content ingestion — clones the primer repo, then compiles the topic map
#    into content/curriculum.json (prints the thin-topic backlog at the end)
cd scripts && npm install && npm run ingest

# 2. seed the content database (SQLite; assigns the stable ids the client uses)
cd ../server && npm install && npm run seed

# 3. export the database as static JSON into client/public/data
cd ../scripts && npm run export:static

# 4. client (UI on :5173)
cd ../client && npm install && npm run dev
```

Steps 2–3 are what you re-run after editing content. To rebuild the database from scratch:

```bash
rm -f server/data/app.db server/data/app.db-wal server/data/app.db-shm
```

## Deploy (GitHub Pages)

Pushing to `main` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which seeds
the database, exports the static JSON, builds the client, and publishes it. Enable it once under
**Settings → Pages → Source: GitHub Actions**.

Because Pages serves the site from `/<repo>/`, `client/vite.config.ts` sets that as the base path —
override it with `BASE_PATH=/` when deploying to a custom domain. Pages has no SPA rewrite, so the
build also writes a copy of the app shell to `404.html`, which is what lets deep links such as
`/topics/caching` boot the router.

Progress and notes are per-browser under Pages: there is no server, so they are not synced across
devices and clearing site data clears them.

See [PLAN.md](PLAN.md) for the full architecture and the atomic task breakdown in [tasks/](tasks/).

## Layout

- `client/` — React + Vite + TypeScript + Tailwind (+ React Flow, for the diagram engine)
- `server/` — SQLite schema and seeding (`npm run seed`). The Express API it also contains is no
  longer used by the client, which reads the static export instead.
- `scripts/` — content ingestion, diagram/code validation, and the static export
- `content/` — `topic-map.json` and `authored/` are hand-written; `curriculum.json` is generated
- `docs/` — architecture, data contracts, ingestion, diagrams, topic model

Content is organised by **topic** (`tracks → topics → sections`), merging both sources — see
[docs/06-topic-model.md](docs/06-topic-model.md). Adding content is a data change, not a code change.
