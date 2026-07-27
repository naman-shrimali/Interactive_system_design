/**
 * TASK-004: Idempotently seed curriculum JSON + diagram files into SQLite.
 * All natural keys are slugs, so re-running updates content in place while
 * preserving row ids (and therefore progress/notes).
 */
import fs from 'fs';
import path from 'path';
import { db } from './index';

const CONTENT_DIR = path.join(__dirname, '..', '..', '..', 'content');
const DIAGRAMS_DIR = path.join(CONTENT_DIR, 'diagrams');
const CURRICULUM_FILES = ['primer-curriculum.json', 'book-curriculum.json'];

interface InLink { url: string; title: string; sortOrder: number }
interface InSection {
  slug: string;
  title: string;
  contentMarkdown: string;
  sourceUrl: string | null;
  sortOrder: number;
  externalLinks: InLink[];
}
interface InChapter {
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  sections: InSection[];
}
interface InCurriculum {
  source: { slug: string; title: string; kind: 'repo' | 'book'; description: string; sortOrder: number };
  chapters: InChapter[];
}

const upsertSource = db.prepare(`
  INSERT INTO sources (slug, title, kind, description, sort_order)
  VALUES (@slug, @title, @kind, @description, @sortOrder)
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title, kind = excluded.kind,
    description = excluded.description, sort_order = excluded.sort_order
`);
const getSourceId = db.prepare(`SELECT id FROM sources WHERE slug = ?`);

const upsertChapter = db.prepare(`
  INSERT INTO chapters (source_id, slug, title, description, sort_order)
  VALUES (@sourceId, @slug, @title, @description, @sortOrder)
  ON CONFLICT(source_id, slug) DO UPDATE SET
    title = excluded.title, description = excluded.description, sort_order = excluded.sort_order
`);
const getChapterId = db.prepare(`SELECT id FROM chapters WHERE source_id = ? AND slug = ?`);

const upsertSection = db.prepare(`
  INSERT INTO sections (chapter_id, slug, title, content_markdown, source_url, sort_order)
  VALUES (@chapterId, @slug, @title, @contentMarkdown, @sourceUrl, @sortOrder)
  ON CONFLICT(chapter_id, slug) DO UPDATE SET
    title = excluded.title, content_markdown = excluded.content_markdown,
    source_url = excluded.source_url, sort_order = excluded.sort_order
`);
const getSectionId = db.prepare(`SELECT id FROM sections WHERE chapter_id = ? AND slug = ?`);

const upsertLink = db.prepare(`
  INSERT INTO external_links (section_id, url, title, sort_order)
  VALUES (@sectionId, @url, @title, @sortOrder)
  ON CONFLICT(section_id, url) DO UPDATE SET
    title = excluded.title, sort_order = excluded.sort_order
`);

const findSectionBySlugs = db.prepare(`
  SELECT sec.id FROM sections sec
  JOIN chapters c ON c.id = sec.chapter_id
  JOIN sources s  ON s.id = c.source_id
  WHERE s.slug = ? AND c.slug = ? AND sec.slug = ?
`);
const upsertDiagram = db.prepare(`
  INSERT INTO diagrams (section_id, slug, title, spec_json, sort_order)
  VALUES (@sectionId, @slug, @title, @specJson, @sortOrder)
  ON CONFLICT(section_id, slug) DO UPDATE SET
    title = excluded.title, spec_json = excluded.spec_json, sort_order = excluded.sort_order
`);

function seedCurriculum(data: InCurriculum): void {
  upsertSource.run(data.source);
  const sourceId = (getSourceId.get(data.source.slug) as { id: number }).id;
  for (const ch of data.chapters) {
    upsertChapter.run({ sourceId, slug: ch.slug, title: ch.title, description: ch.description, sortOrder: ch.sortOrder });
    const chapterId = (getChapterId.get(sourceId, ch.slug) as { id: number }).id;
    for (const sec of ch.sections) {
      upsertSection.run({
        chapterId,
        slug: sec.slug,
        title: sec.title,
        contentMarkdown: sec.contentMarkdown,
        sourceUrl: sec.sourceUrl,
        sortOrder: sec.sortOrder,
      });
      const sectionId = (getSectionId.get(chapterId, sec.slug) as { id: number }).id;
      for (const link of sec.externalLinks ?? []) {
        upsertLink.run({ sectionId, url: link.url, title: link.title, sortOrder: link.sortOrder });
      }
    }
  }
}

function seedDiagrams(): number {
  if (!fs.existsSync(DIAGRAMS_DIR)) return 0;
  let count = 0;
  for (const dirName of fs.readdirSync(DIAGRAMS_DIR).sort()) {
    const dirPath = path.join(DIAGRAMS_DIR, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    const parts = dirName.split('__');
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
      throw new Error(`Malformed diagram directory name (expected source__chapter__section): ${dirName}`);
    }
    const [sourceSlug, chapterSlug, sectionSlug] = parts;
    const row = findSectionBySlugs.get(sourceSlug, chapterSlug, sectionSlug) as { id: number } | undefined;
    if (!row) {
      throw new Error(`No section for diagram dir ${dirName} (source=${sourceSlug}, chapter=${chapterSlug}, section=${sectionSlug})`);
    }
    for (const file of fs.readdirSync(dirPath).sort()) {
      if (!file.endsWith('.json')) continue;
      const raw = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      let parsed: { title?: string };
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`Invalid JSON in ${dirName}/${file}: ${(e as Error).message}`);
      }
      const slug = file.replace(/\.json$/, '');
      upsertDiagram.run({
        sectionId: row.id,
        slug,
        title: parsed.title ?? slug,
        specJson: raw,
        sortOrder: count,
      });
      count++;
    }
  }
  return count;
}

function main(): void {
  const seedAll = db.transaction(() => {
    for (const fileName of CURRICULUM_FILES) {
      const filePath = path.join(CONTENT_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        console.warn(`skip (missing): ${fileName}`);
        continue;
      }
      seedCurriculum(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    }
    return seedDiagrams();
  });
  const diagrams = seedAll();

  const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  console.log(
    `Seeded: ${count('SELECT COUNT(*) n FROM sources')} sources, ` +
      `${count('SELECT COUNT(*) n FROM chapters')} chapters, ` +
      `${count('SELECT COUNT(*) n FROM sections')} sections, ` +
      `${count('SELECT COUNT(*) n FROM external_links')} links, ` +
      `${diagrams} diagrams.`,
  );
}

main();
