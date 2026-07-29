PRAGMA foreign_keys = ON;

-- Schema v2: topic-first model (tracks -> topics -> sections).
-- Provenance is a per-section field, not the top-level hierarchy.

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

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
  accent     TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS topics (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id          INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL UNIQUE,          -- globally unique: it is the URL key
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
  content_ref      TEXT NOT NULL DEFAULT '',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (topic_id, slug),
  -- primer-derived text must always carry an attribution link
  CHECK (provenance <> 'primer' OR attribution_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sections_topic ON sections(topic_id);

-- Topic-scoped: this is what absorbs the old "Source(s) and further reading" pages.
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
  section_id INTEGER          REFERENCES sections(id) ON DELETE SET NULL,
  slug       TEXT NOT NULL,
  title      TEXT NOT NULL,
  spec_json  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (topic_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_diagrams_topic ON diagrams(topic_id);

-- Step-by-step code dry runs, one or more per topic. Added in v3 (additive).
CREATE TABLE IF NOT EXISTS code_walkthroughs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id   INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  title      TEXT NOT NULL,
  spec_json  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (topic_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_code_topic ON code_walkthroughs(topic_id);

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
  -- anchored to exactly one of topic / section
  CHECK ((topic_id IS NOT NULL) + (section_id IS NOT NULL) = 1)
);

CREATE INDEX IF NOT EXISTS idx_notes_section ON notes(section_id);
CREATE INDEX IF NOT EXISTS idx_notes_topic   ON notes(topic_id);
