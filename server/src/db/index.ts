import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'app.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
export const SCHEMA_VERSION = '3';

/**
 * Versions that can be upgraded in place by simply applying schema.sql, because
 * every change since was additive (new tables/indexes only, all IF NOT EXISTS).
 * v2 -> v3 added `code_walkthroughs`. A non-additive change must NOT be listed
 * here — it needs a rebuild so stale rows can't survive under a new meaning.
 */
const ADDITIVE_UPGRADE_FROM = new Set(['2']);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Guard against a stale database. The DDL is all `IF NOT EXISTS`, so a v1 file
 * would boot half-migrated and fail later with confusing errors. Detect it here
 * and say exactly how to fix it.
 */
function assertSchemaVersion(): void {
  const hasMeta = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_meta'`)
    .get();
  const hasLegacy = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='sources'`)
    .get();

  if (!hasMeta && hasLegacy) {
    throw new Error(
      `Database at ${DB_PATH} uses the old schema (v1: sources/chapters/sections).\n` +
        `The topic model is v${SCHEMA_VERSION}. Rebuild it:\n` +
        `    rm -f server/data/app.db server/data/app.db-wal server/data/app.db-shm\n` +
        `    (cd scripts && npm run ingest) && (cd server && npm run seed)`,
    );
  }

  if (!hasMeta) return; // fresh database — the DDL below creates everything
  const row = db.prepare(`SELECT value FROM schema_meta WHERE key='schema_version'`).get() as
    | { value: string }
    | undefined;
  if (row && row.value !== SCHEMA_VERSION) {
    if (ADDITIVE_UPGRADE_FROM.has(row.value)) {
      // Applying schema.sql below adds the new tables; existing rows keep their
      // meaning, so progress and notes survive.
      console.log(`Upgrading database schema v${row.value} → v${SCHEMA_VERSION} (additive).`);
      return;
    }
    throw new Error(
      `Database schema is v${row.value} but this build expects v${SCHEMA_VERSION}. ` +
        `Delete server/data/app.db and re-seed.`,
    );
  }
}

// Must run BEFORE the DDL: applying schema.sql would create schema_meta and
// mask a legacy database.
assertSchemaVersion();
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

db.prepare(`INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(SCHEMA_VERSION);
db.prepare(`INSERT INTO users (id, username) VALUES (1, 'default')
            ON CONFLICT(id) DO NOTHING`).run();

export const USER_ID = 1;
