PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
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
  source_url       TEXT,
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
  spec_json  TEXT NOT NULL,
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
  chapter_id       INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  section_id       INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  content_markdown TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((chapter_id IS NOT NULL) + (section_id IS NOT NULL) = 1)
);

CREATE INDEX IF NOT EXISTS idx_notes_section ON notes(section_id);
CREATE INDEX IF NOT EXISTS idx_notes_chapter ON notes(chapter_id);
