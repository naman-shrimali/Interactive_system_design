# 02 — Data Models & Contracts (single source of truth)

Every schema in the project is defined here. **Copy these verbatim; never improvise a field.**

Convention: DB = `snake_case`, API JSON & TypeScript = `camelCase`. The mapping happens only in the
route layer. Timestamps are SQLite `datetime('now')` strings (`YYYY-MM-DD HH:MM:SS`, UTC) — the client
appends `Z` before parsing.

> **Schema version 2.** The model is `tracks → topics → sections`. Version 1 (`sources → chapters →
> sections`) is gone; `server/src/db/index.ts` refuses to boot on a v1 file. See
> [docs/06-topic-model.md](06-topic-model.md) for why the model is shaped this way.

## 1. SQLite DDL (`server/src/db/schema.sql`)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);                                    -- seeded with ('schema_version','2')

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ordered vocabulary for sections.kind; rank drives canonical reading order.
CREATE TABLE IF NOT EXISTS section_kinds (
  slug  TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  rank  INTEGER NOT NULL UNIQUE
);
INSERT OR IGNORE INTO section_kinds (slug, label, rank) VALUES
  ('overview',  'Overview',   0),
  ('concepts',  'Concepts',   1),
  ('deep-dive', 'Deep dive',  2),
  ('tradeoffs', 'Trade-offs', 3),
  ('checklist', 'Checklist',  4);

CREATE TABLE IF NOT EXISTS tracks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  subtitle   TEXT NOT NULL DEFAULT '',
  accent     TEXT NOT NULL DEFAULT '#64748b',   -- hex; drives --accent in the UI
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS topics (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id          INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL UNIQUE,       -- globally unique: it is the URL key
  title             TEXT NOT NULL,
  summary           TEXT NOT NULL DEFAULT '',
  difficulty        TEXT NOT NULL DEFAULT 'foundation'
                    CHECK (difficulty IN ('foundation','intermediate','advanced')),
  estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  accent            TEXT NOT NULL DEFAULT '#64748b',
  status            TEXT NOT NULL DEFAULT 'published'
                    CHECK (status IN ('published','stub')),
  sort_order        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_topics_track ON topics(track_id);

CREATE TABLE IF NOT EXISTS sections (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id         INTEGER NOT NULL REFERENCES topics(id)       ON DELETE CASCADE,
  slug             TEXT NOT NULL,
  title            TEXT NOT NULL,
  kind             TEXT NOT NULL REFERENCES section_kinds(slug) ON DELETE RESTRICT,
  content_markdown TEXT NOT NULL DEFAULT '',
  provenance       TEXT NOT NULL CHECK (provenance IN ('primer','authored')),
  attribution_url  TEXT,
  attribution_note TEXT,
  content_ref      TEXT NOT NULL DEFAULT '',    -- build-time origin, e.g. 'primer:cache/overview+client-caching'
  sort_order       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (topic_id, slug),
  -- primer-derived text must always carry an attribution link
  CHECK (provenance <> 'primer' OR attribution_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sections_topic ON sections(topic_id);

-- TOPIC-scoped. This is what absorbs the primer's "Source(s) and further reading" pages.
CREATE TABLE IF NOT EXISTS external_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id   INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  title      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (topic_id, url)
);
CREATE INDEX IF NOT EXISTS idx_links_topic ON external_links(topic_id);

CREATE TABLE IF NOT EXISTS diagrams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id   INTEGER NOT NULL REFERENCES topics(id)   ON DELETE CASCADE,
  section_id INTEGER          REFERENCES sections(id) ON DELETE SET NULL,  -- NULL = topic-level
  slug       TEXT NOT NULL,
  title      TEXT NOT NULL,
  spec_json  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (topic_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_diagrams_topic ON diagrams(topic_id);

CREATE TABLE IF NOT EXISTS section_progress (
  user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'not_started'
             CHECK (status IN ('not_started','in_progress','completed')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, section_id)
);

CREATE TABLE IF NOT EXISTS link_progress (
  user_id    INTEGER NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
  link_id    INTEGER NOT NULL REFERENCES external_links(id) ON DELETE CASCADE,
  completed  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, link_id)
);

CREATE TABLE IF NOT EXISTS diagram_progress (
  user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  diagram_id INTEGER NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  viewed     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, diagram_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id         INTEGER REFERENCES topics(id)   ON DELETE CASCADE,
  section_id       INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  content_markdown TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((topic_id IS NOT NULL) + (section_id IS NOT NULL) = 1)  -- exactly one anchor
);

CREATE INDEX IF NOT EXISTS idx_notes_section ON notes(section_id);
CREATE INDEX IF NOT EXISTS idx_notes_topic   ON notes(topic_id);
```

The app is single-user: every query uses `user_id = 1`, exported as `USER_ID` from `server/src/db`.

## 2. `content/topic-map.json` — the merge configuration

Hand-authored. Declares the tracks, the topics, and where each topic's content comes from. This is the
**only** place the primer↔topic mapping lives; adding content is a change here plus a markdown file,
never a code change.

```jsonc
{
  "tracks": [
    { "slug": "data", "title": "Data & Storage", "subtitle": "…", "accent": "#f59e0b", "sortOrder": 3 }
  ],
  "topics": [
    {
      "slug": "caching",                     // globally unique; becomes the URL
      "track": "data",                       // must match a track slug
      "title": "Caching",
      "summary": "One or two sentences shown in the hero and on cards.",
      "difficulty": "intermediate",          // foundation | intermediate | advanced
      "estimatedMinutes": 55,
      "accent": "#f59e0b",                   // optional; defaults to the track accent
      "sortOrder": 2,
      "contributions": [ /* see below */ ],
      "furtherReading": [ { "url": "https://…", "title": "…" } ]   // optional extra links
    }
  ]
}
```

A **contribution** is one of three forms. Order in the array is the reading order on the page.

```jsonc
// (a) primer text -> one section. `sections` is an ARRAY: listing several merges them into one
//     page, which is how fragmented primer material is consolidated.
{
  "from": "primer",
  "chapter": "cache",
  "sections": ["overview", "client-caching", "cdn-caching", "web-server-caching"],
  "as": { "slug": "where-to-cache", "title": "Where to cache", "kind": "concepts" },
  "harvestLinks": true,          // also pull these sections' links up to the topic
  "diagrams": ["cache-aside"]    // optional: diagram slugs anchored to this section
}

// (b) links only — reference a primer section for its links WITHOUT creating a page.
//     This is how the 13 "Source(s) and further reading" sections were retired.
{ "from": "primer", "chapter": "cache", "sections": ["source-s-and-further-reading"], "linksOnly": true }

// (c) original prose we wrote. Path is repo-relative.
{
  "from": "authored",
  "file": "content/authored/caching/01-eviction-and-failure.md",
  "as": { "slug": "eviction-and-failure", "title": "Eviction & failure modes", "kind": "deep-dive" }
}
```

Authored files may carry optional front matter (`---\nversion: 1\n---`); only `version` is read today.
Write body subheadings at `###` or deeper — the UI renders the section title itself.

## 3. `content/curriculum.json` — the compiled artifact

Generated by `scripts/ingest/build-curriculum.ts`. **Never edit by hand.** This is exactly what
`server/src/db/seed.ts` consumes.

```jsonc
{
  "tracks": [ { "slug": "data", "title": "…", "subtitle": "…", "accent": "#f59e0b", "sortOrder": 3 } ],
  "topics": [
    {
      "slug": "caching", "trackSlug": "data", "title": "Caching", "summary": "…",
      "difficulty": "intermediate", "estimatedMinutes": 55, "accent": "#f59e0b",
      "status": "published",              // 'stub' when the topic is under 800 words
      "sortOrder": 2,
      "sections": [
        {
          "slug": "where-to-cache", "title": "Where to cache", "kind": "concepts",
          "contentMarkdown": "### Cache\n…",
          "provenance": "primer",         // 'primer' | 'authored'
          "attributionUrl": "https://github.com/donnemartin/system-design-primer#cache",
          "attributionNote": "The System Design Primer — MIT © Donne Martin",
          "contentRef": "primer:cache/overview+client-caching",
          "sortOrder": 0,
          "diagrams": ["cache-aside"]     // slugs; resolved against content/diagrams/<topicSlug>/
        }
      ],
      "links": [ { "url": "https://…", "title": "…", "sortOrder": 0 } ]
    }
  ]
}
```

## 4. Interactive diagram JSON Schema

Unchanged (`schemaVersion: 1`). The authoritative copy is `scripts/diagram.schema.json`, enforced by
`npm run validate:diagrams`. Files live at **`content/diagrams/<topicSlug>/<diagramSlug>.json`** — the
directory name must match a topic slug in `topic-map.json`, and the filename must equal the spec's `id`.

Top level: `{ schemaVersion: 1, id, title, description?, groups?, nodes, edges, flows? }`.

- **node** — `{ id, type, label, sublabel?, position:{x,y}, groupId?, badge?, state?, tableData? }`
  with `type` one of the 17 kinds catalogued in [docs/04-diagrams.md](04-diagrams.md) and
  `state ∈ normal | highlighted | failed | dimmed`. A node's `position` is relative to its group.
- **edge** — `{ id, source, target, label?, step?, lineStyle?, color?, direction?, sourceHandle?, targetHandle? }`.
  `color ∈ blue|green|purple|red|gray`, `direction ∈ forward|both|none`.
  **Handle rule:** `sourceHandle ∈ {bottom,right}`, `targetHandle ∈ {top,left}` — nodes expose source
  handles only on bottom/right and targets only on top/left. The validator enforces this.
- **group** — `{ id, label?, position, size:{width,height}, style: dashed|solid|filled, labelPosition? }`.
- **flow** — `{ id, name, description?, steps: [{ edgeIds[], text }] }`, powering the step-through walkthrough.

Beyond the JSON Schema, the validator also checks: unique ids, every `groupId`/`source`/`target`/
`flow.steps[].edgeIds` resolves, `table` nodes have `tableData` (and non-table nodes don't), handle
sides, and filename↔`id` agreement.

## 5. Shared TypeScript types

Defined twice — `server/src/types.ts` and `client/src/types.ts` — deliberately not shared across
packages. **They must change in the same commit**, or the client silently reads `undefined`.

```ts
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';
export type SectionKind = 'overview' | 'concepts' | 'deep-dive' | 'tradeoffs' | 'checklist';
export type Difficulty = 'foundation' | 'intermediate' | 'advanced';
export type Provenance = 'primer' | 'authored';

export interface CurriculumTopic {
  id: number; slug: string; title: string; summary: string;
  difficulty: Difficulty; estimatedMinutes: number; accent: string;
  status: 'published' | 'stub'; sortOrder: number;
  sectionCount: number; sectionsCompleted: number;
  linkCount: number; linksCompleted: number;
  diagramCount: number; diagramsViewed: number;
}
export interface CurriculumTrack {
  id: number; slug: string; title: string; subtitle: string;
  accent: string; sortOrder: number; topics: CurriculumTopic[];
}

export interface TopicSection {
  id: number; slug: string; title: string; kind: SectionKind;
  contentMarkdown: string; provenance: Provenance;
  attributionUrl: string | null; attributionNote: string | null;
  sortOrder: number; progressStatus: ProgressStatus; diagrams: DiagramMeta[];
}
export interface ExternalLink { id: number; url: string; title: string; completed: boolean; }
export interface DiagramMeta  { id: number; slug: string; title: string; viewed: boolean; }
export interface TopicNeighbor { slug: string; title: string; }

export interface TopicDetail {
  id: number; slug: string; title: string; summary: string;
  difficulty: Difficulty; estimatedMinutes: number; accent: string;
  status: 'published' | 'stub'; trackSlug: string; trackTitle: string;
  sections: TopicSection[]; links: ExternalLink[];
  topicDiagrams: DiagramMeta[];          // diagrams not anchored to a section
  prev: TopicNeighbor | null; next: TopicNeighbor | null;
}

export interface Note {
  id: number; topicId: number | null; sectionId: number | null;
  contentMarkdown: string; createdAt: string; updatedAt: string;
}
export interface NoteWithAnchor extends Note {
  anchorType: 'topic' | 'section';
  anchorTitle: string;        // "Topic" or "Topic › Section"
  anchorTopicSlug: string;    // section notes link to their owning topic
}

export interface ProgressSummaryTrack {
  slug: string; title: string; accent: string;
  topicsTotal: number; topicsCompleted: number;
  sectionsTotal: number; sectionsCompleted: number;
  linksTotal: number; linksCompleted: number;
  diagramsTotal: number; diagramsViewed: number;
}
```

The client file additionally keeps the `InteractiveDiagram` spec types (§4).

## 6. REST API contracts

All responses JSON. Errors: `{ "error": "<message>" }` with 400/404/500. Server on port 4000; the Vite
dev server proxies `/api`, so client code always uses relative paths.

| Method + path | Body | Success |
|---|---|---|
| `GET /api/health` | — | `200 { status: 'ok' }` |
| `GET /api/curriculum` | — | `200 { tracks: CurriculumTrack[] }` |
| `GET /api/topics/:idOrSlug` | — | `200 TopicDetail` · `404` |
| `GET /api/diagrams/:id` | — | `200 { id, slug, title, spec: InteractiveDiagram }` · `404` |
| `PUT /api/progress/section/:id` | `{ status: ProgressStatus }` | `200 { ok: true }` |
| `PUT /api/progress/link/:id` | `{ completed: boolean }` | `200 { ok: true }` |
| `PUT /api/progress/diagram/:id` | `{ viewed: true }` | `200 { ok: true }` |
| `GET /api/progress/summary` | — | `200 { tracks: ProgressSummaryTrack[] }` |
| `GET /api/notes?sectionId=` \| `?topicId=` | — | `200 { notes: Note[] }` (exactly one param) |
| `GET /api/notes/all` | — | `200 { notes: NoteWithAnchor[] }` |
| `POST /api/notes` | `{ sectionId?, topicId?, contentMarkdown }` | `201 Note` (exactly one anchor) |
| `PUT /api/notes/:id` | `{ contentMarkdown }` | `200 Note` |
| `DELETE /api/notes/:id` | — | `200 { ok: true }` |
| `GET /api/dev/diagram-files` | — | `200 { files: string[] }` (authoring preview) |
| `GET /api/dev/diagram-file?name=` | — | `200 InteractiveDiagram` · `400` on a malformed name |

`GET /api/topics/:idOrSlug` accepts **either** the numeric id or the slug; the slug is canonical and is
what the UI routes on (`/topics/<slug>`). `prev`/`next` walk the whole curriculum in reading order
(track `sort_order`, then topic `sort_order`), so they cross track boundaries.

Progress writes are upserts, e.g.:

```sql
INSERT INTO section_progress (user_id, section_id, status, updated_at)
VALUES (1, ?, ?, datetime('now'))
ON CONFLICT(user_id, section_id) DO UPDATE
  SET status = excluded.status, updated_at = excluded.updated_at;
```

`/api/notes/all` must be registered **before** `/notes/:id`-style routes, or Express parses `all` as an id.
