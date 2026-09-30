/**
 * Seed content/curriculum.json (+ content/diagrams/<topicSlug>/*.json) into SQLite.
 *
 * Idempotent: all natural keys are slugs, so re-seeding updates content in place
 * while row ids — and therefore progress and notes — survive.
 */
import fs from 'fs';
import path from 'path';
import { db } from './index';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const CURRICULUM = path.join(REPO_ROOT, 'content', 'curriculum.json');
const DIAGRAMS_DIR = path.join(REPO_ROOT, 'content', 'diagrams');
const CODE_DIR = path.join(REPO_ROOT, 'content', 'code');

interface InSection {
  slug: string;
  title: string;
  kind: string;
  contentMarkdown: string;
  provenance: 'primer' | 'authored';
  attributionUrl: string | null;
  attributionNote: string | null;
  contentRef: string;
  sortOrder: number;
  diagrams: string[];
}
interface InTopic {
  slug: string;
  trackSlug: string;
  title: string;
  summary: string;
  difficulty: string;
  estimatedMinutes: number;
  accent: string;
  status: string;
  sortOrder: number;
  sections: InSection[];
  links: { url: string; title: string; sortOrder: number }[];
}
interface InCurriculum {
  tracks: { slug: string; title: string; subtitle: string; accent: string; sortOrder: number }[];
  topics: InTopic[];
}

const upsertTrack = db.prepare(`
  INSERT INTO tracks (slug, title, subtitle, accent, sort_order)
  VALUES (@slug, @title, @subtitle, @accent, @sortOrder)
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title, subtitle = excluded.subtitle,
    accent = excluded.accent, sort_order = excluded.sort_order
`);
const getTrackId = db.prepare(`SELECT id FROM tracks WHERE slug = ?`);

const upsertTopic = db.prepare(`
  INSERT INTO topics (track_id, slug, title, summary, difficulty, estimated_minutes, accent, status, sort_order)
  VALUES (@trackId, @slug, @title, @summary, @difficulty, @estimatedMinutes, @accent, @status, @sortOrder)
  ON CONFLICT(slug) DO UPDATE SET
    track_id = excluded.track_id, title = excluded.title, summary = excluded.summary,
    difficulty = excluded.difficulty, estimated_minutes = excluded.estimated_minutes,
    accent = excluded.accent, status = excluded.status, sort_order = excluded.sort_order
`);
const getTopicId = db.prepare(`SELECT id FROM topics WHERE slug = ?`);

const upsertSection = db.prepare(`
  INSERT INTO sections (topic_id, slug, title, kind, content_markdown, provenance,
                        attribution_url, attribution_note, content_ref, sort_order)
  VALUES (@topicId, @slug, @title, @kind, @contentMarkdown, @provenance,
          @attributionUrl, @attributionNote, @contentRef, @sortOrder)
  ON CONFLICT(topic_id, slug) DO UPDATE SET
    title = excluded.title, kind = excluded.kind,
    content_markdown = excluded.content_markdown, provenance = excluded.provenance,
    attribution_url = excluded.attribution_url, attribution_note = excluded.attribution_note,
    content_ref = excluded.content_ref, sort_order = excluded.sort_order
`);
const getSectionId = db.prepare(`SELECT id FROM sections WHERE topic_id = ? AND slug = ?`);

const upsertLink = db.prepare(`
  INSERT INTO external_links (topic_id, url, title, sort_order)
  VALUES (@topicId, @url, @title, @sortOrder)
  ON CONFLICT(topic_id, url) DO UPDATE SET
    title = excluded.title, sort_order = excluded.sort_order
`);

const upsertCode = db.prepare(`
  INSERT INTO code_walkthroughs (topic_id, slug, title, spec_json, sort_order)
  VALUES (@topicId, @slug, @title, @specJson, @sortOrder)
  ON CONFLICT(topic_id, slug) DO UPDATE SET
    title = excluded.title, spec_json = excluded.spec_json, sort_order = excluded.sort_order
`);

const upsertDiagram = db.prepare(`
  INSERT INTO diagrams (topic_id, section_id, slug, title, spec_json, sort_order)
  VALUES (@topicId, @sectionId, @slug, @title, @specJson, @sortOrder)
  ON CONFLICT(topic_id, slug) DO UPDATE SET
    section_id = excluded.section_id, title = excluded.title,
    spec_json = excluded.spec_json, sort_order = excluded.sort_order
`);

const listDiagramSlugs = db.prepare(`SELECT slug FROM diagrams WHERE topic_id = ?`);
const deleteDiagram = db.prepare(`DELETE FROM diagrams WHERE topic_id = ? AND slug = ?`);

function main(): void {
  if (!fs.existsSync(CURRICULUM)) {
    throw new Error(
      `Missing ${path.relative(REPO_ROOT, CURRICULUM)}. Run: (cd scripts && npm run ingest)`,
    );
  }
  const data: InCurriculum = JSON.parse(fs.readFileSync(CURRICULUM, 'utf-8'));

  let diagramCount = 0;
  let codeCount = 0;

  db.transaction(() => {
    for (const track of data.tracks) upsertTrack.run(track);

    for (const topic of data.topics) {
      const trackRow = getTrackId.get(topic.trackSlug) as { id: number } | undefined;
      if (!trackRow) throw new Error(`topic ${topic.slug}: unknown track ${topic.trackSlug}`);

      upsertTopic.run({ ...topic, trackId: trackRow.id });
      const topicId = (getTopicId.get(topic.slug) as { id: number }).id;

      // section slug -> id, so diagrams can anchor to the section that declared them
      const sectionIds = new Map<string, number>();
      for (const section of topic.sections) {
        upsertSection.run({ ...section, topicId });
        sectionIds.set(section.slug, (getSectionId.get(topicId, section.slug) as { id: number }).id);
      }
      const diagramOwner = new Map<string, number>();
      for (const section of topic.sections) {
        for (const d of section.diagrams) diagramOwner.set(d, sectionIds.get(section.slug)!);
      }

      for (const link of topic.links) upsertLink.run({ ...link, topicId });

      // Diagram files live at content/diagrams/<topicSlug>/<slug>.json
      const dir = path.join(DIAGRAMS_DIR, topic.slug);
      // Seeding upserts, so a diagram deleted from content would otherwise linger in an existing database.
      const diagramFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
      const keep = new Set(diagramFiles.map((f) => f.replace(/\.json$/, '')));
      for (const row of listDiagramSlugs.all(topicId) as { slug: string }[]) {
        if (!keep.has(row.slug)) deleteDiagram.run(topicId, row.slug);
      }
      if (fs.existsSync(dir)) {
        let order = 0;
        for (const file of fs.readdirSync(dir).sort()) {
          if (!file.endsWith('.json')) continue;
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          let parsed: { title?: string };
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            throw new Error(`Invalid JSON in diagrams/${topic.slug}/${file}: ${(e as Error).message}`);
          }
          const slug = file.replace(/\.json$/, '');
          upsertDiagram.run({
            topicId,
            sectionId: diagramOwner.get(slug) ?? null,
            slug,
            title: parsed.title ?? slug,
            specJson: raw,
            sortOrder: order++,
          });
          diagramCount++;
        }
      }

      // Code walkthroughs live at content/code/<topicSlug>/<slug>.json
      const codeDir = path.join(CODE_DIR, topic.slug);
      if (fs.existsSync(codeDir)) {
        let codeOrder = 0;
        for (const file of fs.readdirSync(codeDir).sort()) {
          if (!file.endsWith('.json')) continue;
          const raw = fs.readFileSync(path.join(codeDir, file), 'utf-8');
          let parsed: { title?: string };
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            throw new Error(`Invalid JSON in code/${topic.slug}/${file}: ${(e as Error).message}`);
          }
          upsertCode.run({
            topicId,
            slug: file.replace(/\.json$/, ''),
            title: parsed.title ?? file,
            specJson: raw,
            sortOrder: codeOrder++,
          });
          codeCount++;
        }
      }
    }
  })();

  const n = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  console.log(
    `Seeded: ${n('SELECT COUNT(*) n FROM tracks')} tracks, ` +
      `${n('SELECT COUNT(*) n FROM topics')} topics, ` +
      `${n('SELECT COUNT(*) n FROM sections')} sections, ` +
      `${n('SELECT COUNT(*) n FROM external_links')} links, ` +
      `${diagramCount} diagrams, ` +
      `${codeCount} code walkthroughs.`,
  );

  const orphanDirs = fs.existsSync(DIAGRAMS_DIR)
    ? fs
        .readdirSync(DIAGRAMS_DIR)
        .filter((d) => fs.statSync(path.join(DIAGRAMS_DIR, d)).isDirectory())
        .filter((d) => !data.topics.some((t) => t.slug === d))
    : [];
  if (orphanDirs.length > 0) {
    console.log(
      `\n  WARNING: diagram directories match no topic slug (not seeded): ${orphanDirs.join(', ')}`,
    );
  }
}

main();
