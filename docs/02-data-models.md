# 02 — Data Models & Contracts (single source of truth)

Every schema in the project is defined here. **Copy these verbatim; never improvise a field.**
Convention: DB = `snake_case`, API JSON & TypeScript = `camelCase`. Timestamps are ISO-8601 UTC strings.

## 1. SQLite DDL (`server/src/db/schema.sql`)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,               -- 'primer' | 'sdi-vol1-2e'
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('repo','book')),
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source_id, slug)
);

CREATE TABLE IF NOT EXISTS sections (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id       INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL,
  title            TEXT NOT NULL,
  content_markdown TEXT NOT NULL DEFAULT '',
  source_url       TEXT,                          -- attribution link (primer sections)
  sort_order       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chapter_id, slug)
);

CREATE TABLE IF NOT EXISTS external_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  title      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (section_id, url)
);

CREATE TABLE IF NOT EXISTS diagrams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  title      TEXT NOT NULL,
  spec_json  TEXT NOT NULL,                       -- validated InteractiveDiagram JSON as text
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (section_id, slug)
);

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
  completed  INTEGER NOT NULL DEFAULT 0,                    -- 0 | 1
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, link_id)
);

CREATE TABLE IF NOT EXISTS diagram_progress (
  user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  diagram_id INTEGER NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  viewed     INTEGER NOT NULL DEFAULT 0,                    -- 0 | 1
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, diagram_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id       INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  section_id       INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  content_markdown TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  -- a note is anchored to EXACTLY ONE of chapter / section:
  CHECK ((chapter_id IS NOT NULL) + (section_id IS NOT NULL) = 1)
);

CREATE INDEX IF NOT EXISTS idx_notes_section ON notes(section_id);
CREATE INDEX IF NOT EXISTS idx_notes_chapter ON notes(chapter_id);
```

Seed row (in `db/seed.ts`): `INSERT INTO users (id, username) VALUES (1, 'default') ON CONFLICT DO NOTHING;`

## 2. Curriculum content file (`content/*-curriculum.json`)

Produced by the ingest script (primer) and hand-authored (book). Same shape for both:

```json
{
  "source": {
    "slug": "primer",
    "title": "The System Design Primer",
    "kind": "repo",
    "description": "Learn how to design large-scale systems. MIT © Donne Martin.",
    "sortOrder": 0
  },
  "chapters": [
    {
      "slug": "load-balancer",
      "title": "Load Balancer",
      "description": "",
      "sortOrder": 8,
      "sections": [
        {
          "slug": "overview",
          "title": "Load Balancer",
          "contentMarkdown": "...full markdown...",
          "sourceUrl": "https://github.com/donnemartin/system-design-primer#load-balancer",
          "sortOrder": 0,
          "externalLinks": [
            { "url": "https://www.nginx.com/blog/...", "title": "NGINX architecture", "sortOrder": 0 }
          ]
        }
      ]
    }
  ]
}
```

For the book source (`sdi-vol1-2e`): `contentMarkdown` holds only **our own original summaries** (or `""`), never book text.

## 3. Interactive diagram JSON Schema

One file per diagram at `content/diagrams/<chapterSlug>/<diagramSlug>.json`, validated by ajv against this schema (store the schema at `scripts/diagram.schema.json`):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "InteractiveDiagram",
  "type": "object",
  "required": ["schemaVersion", "id", "title", "nodes", "edges"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "const": 1 },
    "id":          { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "title":       { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "groups": { "type": "array", "items": { "$ref": "#/definitions/group" } },
    "nodes":  { "type": "array", "items": { "$ref": "#/definitions/node" }, "minItems": 1 },
    "edges":  { "type": "array", "items": { "$ref": "#/definitions/edge" } },
    "flows":  { "type": "array", "items": { "$ref": "#/definitions/flow" } }
  },
  "definitions": {
    "position": {
      "type": "object", "required": ["x", "y"], "additionalProperties": false,
      "properties": { "x": { "type": "number" }, "y": { "type": "number" } }
    },
    "nodeType": {
      "enum": ["client", "client_mobile", "dns", "cdn", "load_balancer",
               "server", "server_stack", "database", "database_stack", "nosql",
               "cache", "cache_stack", "message_queue", "worker_stack",
               "service", "text_box", "table"]
    },
    "node": {
      "type": "object",
      "required": ["id", "type", "label", "position"],
      "additionalProperties": false,
      "properties": {
        "id":       { "type": "string", "pattern": "^[a-z0-9_]+$" },
        "type":     { "$ref": "#/definitions/nodeType" },
        "label":    { "type": "string" },
        "sublabel": { "type": "string" },
        "position": { "$ref": "#/definitions/position" },
        "groupId":  { "type": "string" },
        "badge":    { "type": "integer", "minimum": 1, "maximum": 99 },
        "state":    { "enum": ["normal", "highlighted", "failed", "dimmed"], "default": "normal" },
        "tableData": {
          "type": "object", "required": ["columns", "rows"], "additionalProperties": false,
          "properties": {
            "columns": { "type": "array", "items": { "type": "string" } },
            "rows": { "type": "array", "items": { "type": "array", "items": { "type": "string" } } }
          }
        }
      }
    },
    "handleSide": { "enum": ["top", "bottom", "left", "right"] },
    "edge": {
      "type": "object",
      "required": ["id", "source", "target"],
      "additionalProperties": false,
      "properties": {
        "id":           { "type": "string", "pattern": "^[a-z0-9_]+$" },
        "source":       { "type": "string" },
        "target":       { "type": "string" },
        "label":        { "type": "string" },
        "step":         { "type": "integer", "minimum": 1, "maximum": 99 },
        "lineStyle":    { "enum": ["solid", "dashed"], "default": "solid" },
        "color":        { "enum": ["blue", "green", "purple", "red", "gray"], "default": "blue" },
        "direction":    { "enum": ["forward", "both", "none"], "default": "forward" },
        "sourceHandle": { "$ref": "#/definitions/handleSide" },
        "targetHandle": { "$ref": "#/definitions/handleSide" }
      }
    },
    "group": {
      "type": "object",
      "required": ["id", "position", "size", "style"],
      "additionalProperties": false,
      "properties": {
        "id":       { "type": "string", "pattern": "^[a-z0-9_]+$" },
        "label":    { "type": "string" },
        "position": { "$ref": "#/definitions/position" },
        "size": {
          "type": "object", "required": ["width", "height"], "additionalProperties": false,
          "properties": { "width": { "type": "number" }, "height": { "type": "number" } }
        },
        "style":         { "enum": ["dashed", "solid", "filled"] },
        "labelPosition": { "enum": ["top-left", "top-right", "right", "bottom"], "default": "top-left" }
      }
    },
    "flow": {
      "type": "object",
      "required": ["id", "name", "steps"],
      "additionalProperties": false,
      "properties": {
        "id":          { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "name":        { "type": "string" },
        "description": { "type": "string" },
        "steps": {
          "type": "array", "minItems": 1,
          "items": {
            "type": "object", "required": ["edgeIds", "text"], "additionalProperties": false,
            "properties": {
              "edgeIds": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
              "text":    { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

Semantics (mirror of Alex Xu's visual language, documented in docs/04):
- `groupId` on a node ⇒ node `position` is **relative to that group's top-left** (maps to React Flow `parentId` + `extent: 'parent'`).
- `badge` renders a circled number next to the node label (like "① Message Queue").
- `flows` power the step-through walkthrough: each step highlights its `edgeIds` and dims everything else, showing `text` in the side panel.

## 4. Shared TypeScript types

Defined twice (once in `server/src/types.ts`, once in `client/src/types.ts` — kept in sync from this doc, no cross-package import):

```ts
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface CurriculumSection {
  id: number; slug: string; title: string; sortOrder: number;
  progressStatus: ProgressStatus;
  linkCount: number; linksCompleted: number;
  diagramCount: number; diagramsViewed: number;
}
export interface CurriculumChapter {
  id: number; slug: string; title: string; description: string; sortOrder: number;
  sections: CurriculumSection[];
}
export interface CurriculumSource {
  id: number; slug: string; title: string; kind: 'repo' | 'book'; description: string;
  chapters: CurriculumChapter[];
}

export interface ExternalLink { id: number; url: string; title: string; completed: boolean; }
export interface DiagramMeta  { id: number; slug: string; title: string; viewed: boolean; }

export interface SectionDetail {
  id: number; slug: string; title: string; contentMarkdown: string;
  sourceUrl: string | null;
  chapterId: number; chapterTitle: string; sourceSlug: string;
  links: ExternalLink[]; diagrams: DiagramMeta[];
}

export interface Note {
  id: number; chapterId: number | null; sectionId: number | null;
  contentMarkdown: string; createdAt: string; updatedAt: string;
}

// Diagram spec types mirror the JSON Schema in section 3:
export type NodeKind =
  | 'client' | 'client_mobile' | 'dns' | 'cdn' | 'load_balancer'
  | 'server' | 'server_stack' | 'database' | 'database_stack' | 'nosql'
  | 'cache' | 'cache_stack' | 'message_queue' | 'worker_stack'
  | 'service' | 'text_box' | 'table';
export type EdgeColor = 'blue' | 'green' | 'purple' | 'red' | 'gray';
export type HandleSide = 'top' | 'bottom' | 'left' | 'right';
export type NodeState = 'normal' | 'highlighted' | 'failed' | 'dimmed';

export interface DiagramNode {
  id: string; type: NodeKind; label: string; sublabel?: string;
  position: { x: number; y: number }; groupId?: string;
  badge?: number; state?: NodeState;
  tableData?: { columns: string[]; rows: string[][] };
}
export interface DiagramEdge {
  id: string; source: string; target: string; label?: string; step?: number;
  lineStyle?: 'solid' | 'dashed'; color?: EdgeColor;
  direction?: 'forward' | 'both' | 'none';
  sourceHandle?: HandleSide; targetHandle?: HandleSide;
}
export interface DiagramGroup {
  id: string; label?: string;
  position: { x: number; y: number }; size: { width: number; height: number };
  style: 'dashed' | 'solid' | 'filled';
  labelPosition?: 'top-left' | 'top-right' | 'right' | 'bottom';
}
export interface FlowStep { edgeIds: string[]; text: string; }
export interface DiagramFlow { id: string; name: string; description?: string; steps: FlowStep[]; }
export interface InteractiveDiagram {
  schemaVersion: 1; id: string; title: string; description?: string;
  groups?: DiagramGroup[]; nodes: DiagramNode[]; edges: DiagramEdge[]; flows?: DiagramFlow[];
}
```

## 5. REST API contracts

All responses are JSON. Errors: `{ "error": "<message>" }` with status 400/404/500. `user_id` is always `1`.

### `GET /api/health`
→ `200 { "status": "ok" }`

### `GET /api/curriculum`
→ `200 { "sources": CurriculumSource[] }` (chapters and sections sorted by `sortOrder`; progress fields joined from `section_progress`, `link_progress`, `diagram_progress`)

### `GET /api/sections/:id`
→ `200 SectionDetail` | `404`

### `GET /api/diagrams/:id`
→ `200 { "id": number, "slug": string, "title": string, "spec": InteractiveDiagram }` | `404`
(`spec` = `JSON.parse(spec_json)`)

### `PUT /api/progress/section/:id`   body `{ "status": ProgressStatus }`
→ `200 { "ok": true }` — upsert:
```sql
INSERT INTO section_progress (user_id, section_id, status, updated_at)
VALUES (1, ?, ?, datetime('now'))
ON CONFLICT(user_id, section_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at;
```

### `PUT /api/progress/link/:id`   body `{ "completed": boolean }` → `200 { "ok": true }` (same upsert pattern into `link_progress`, boolean stored as 0/1)

### `PUT /api/progress/diagram/:id`   body `{ "viewed": true }` → `200 { "ok": true }` (upsert into `diagram_progress`)

### `GET /api/progress/summary`
→ `200 { "sources": [{ "slug": string, "title": string, "sectionsTotal": number, "sectionsCompleted": number, "linksTotal": number, "linksCompleted": number, "diagramsTotal": number, "diagramsViewed": number }] }`

### `GET /api/notes?sectionId=<n>` or `?chapterId=<n>` (exactly one param required)
→ `200 { "notes": Note[] }`

### `POST /api/notes`   body `{ "sectionId"?: number, "chapterId"?: number, "contentMarkdown": string }` (exactly one anchor)
→ `201 Note`

### `PUT /api/notes/:id`   body `{ "contentMarkdown": string }` → `200 Note` (also bumps `updated_at`)

### `DELETE /api/notes/:id` → `200 { "ok": true }`
