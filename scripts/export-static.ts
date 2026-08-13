/**
 * Export the seeded database as static JSON for a backend-free deploy.
 *
 * Content only — progress and notes are per-browser and live in localStorage,
 * so nothing here is user state. Numeric ids are carried through from the DB
 * so client-side progress keys stay stable across re-exports.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'server', 'data', 'app.db');
const OUT = path.join(ROOT, 'client', 'public', 'data');

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}. Run: cd server && npm run seed`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

function write(rel: string, data: unknown): void {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

fs.rmSync(OUT, { recursive: true, force: true });

// --- curriculum: tracks -> topics, with the id lists the client needs to
// --- compute completion counts against localStorage.
const tracks = db
  .prepare(`SELECT id, slug, title, subtitle, accent, sort_order FROM tracks ORDER BY sort_order`)
  .all() as { id: number; slug: string; title: string; subtitle: string; accent: string; sort_order: number }[];

const topics = db
  .prepare(
    `SELECT tp.id, tp.track_id, tp.slug, tp.title, tp.summary, tp.difficulty,
            tp.estimated_minutes, tp.accent, tp.status, tp.sort_order,
            tr.slug AS track_slug, tr.title AS track_title
     FROM topics tp JOIN tracks tr ON tr.id = tp.track_id
     ORDER BY tr.sort_order, tp.sort_order, tp.slug`,
  )
  .all() as {
  id: number; track_id: number; slug: string; title: string; summary: string;
  difficulty: string; estimated_minutes: number; accent: string;
  status: string; sort_order: number; track_slug: string; track_title: string;
}[];

const idsFor = (table: string, topicId: number): number[] =>
  (db.prepare(`SELECT id FROM ${table} WHERE topic_id = ? ORDER BY sort_order`).all(topicId) as { id: number }[])
    .map((r) => r.id);

const curriculumTopic = (t: (typeof topics)[number]) => ({
  id: t.id,
  slug: t.slug,
  title: t.title,
  summary: t.summary,
  difficulty: t.difficulty,
  estimatedMinutes: t.estimated_minutes,
  accent: t.accent,
  status: t.status,
  sortOrder: t.sort_order,
  sectionIds: idsFor('sections', t.id),
  linkIds: idsFor('external_links', t.id),
  diagramIds: idsFor('diagrams', t.id),
});

write('curriculum.json', {
  tracks: tracks.map((tr) => ({
    id: tr.id,
    slug: tr.slug,
    title: tr.title,
    subtitle: tr.subtitle,
    accent: tr.accent,
    sortOrder: tr.sort_order,
    topics: topics.filter((t) => t.track_id === tr.id).map(curriculumTopic),
  })),
});

// --- one file per topic, keyed by the slug the router already uses
const order = topics.map((t) => ({ slug: t.slug, title: t.title }));

for (const [i, t] of topics.entries()) {
  const sections = db
    .prepare(
      `SELECT id, slug, title, kind, content_markdown, provenance,
              attribution_url, attribution_note, sort_order
       FROM sections WHERE topic_id = ? ORDER BY sort_order`,
    )
    .all(t.id) as {
    id: number; slug: string; title: string; kind: string; content_markdown: string;
    provenance: string; attribution_url: string | null; attribution_note: string | null; sort_order: number;
  }[];

  const diagrams = db
    .prepare(
      `SELECT id, section_id, slug, title FROM diagrams WHERE topic_id = ? ORDER BY sort_order`,
    )
    .all(t.id) as { id: number; section_id: number | null; slug: string; title: string }[];

  const links = db
    .prepare(`SELECT id, url, title FROM external_links WHERE topic_id = ? ORDER BY sort_order`)
    .all(t.id) as { id: number; url: string; title: string }[];

  const code = db
    .prepare(`SELECT id, slug, title FROM code_walkthroughs WHERE topic_id = ? ORDER BY sort_order`)
    .all(t.id) as { id: number; slug: string; title: string }[];

  write(`topics/${t.slug}.json`, {
    id: t.id,
    slug: t.slug,
    title: t.title,
    summary: t.summary,
    difficulty: t.difficulty,
    estimatedMinutes: t.estimated_minutes,
    accent: t.accent,
    status: t.status,
    trackSlug: t.track_slug,
    trackTitle: t.track_title,
    sections: sections.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      kind: s.kind,
      contentMarkdown: s.content_markdown,
      provenance: s.provenance,
      attributionUrl: s.attribution_url,
      attributionNote: s.attribution_note,
      sortOrder: s.sort_order,
      diagrams: diagrams
        .filter((d) => d.section_id === s.id)
        .map((d) => ({ id: d.id, slug: d.slug, title: d.title })),
    })),
    links,
    topicDiagrams: diagrams
      .filter((d) => d.section_id === null)
      .map((d) => ({ id: d.id, slug: d.slug, title: d.title })),
    codeWalkthroughs: code,
    prev: i > 0 ? order[i - 1] : null,
    next: i < order.length - 1 ? order[i + 1] : null,
  });
}

// --- diagram and code specs, one file per id
const diagramRows = db
  .prepare(`SELECT id, slug, title, spec_json FROM diagrams`)
  .all() as { id: number; slug: string; title: string; spec_json: string }[];
for (const d of diagramRows) {
  write(`diagrams/${d.id}.json`, {
    id: d.id,
    slug: d.slug,
    title: d.title,
    spec: JSON.parse(d.spec_json),
  });
}

const codeRows = db
  .prepare(`SELECT id, slug, title, spec_json FROM code_walkthroughs`)
  .all() as { id: number; slug: string; title: string; spec_json: string }[];
for (const c of codeRows) {
  write(`code/${c.id}.json`, {
    id: c.id,
    slug: c.slug,
    title: c.title,
    spec: JSON.parse(c.spec_json),
  });
}

// --- anchor titles, so locally-stored notes can render their heading
const sectionAnchors = db
  .prepare(
    `SELECT s.id, s.title, tp.title AS topic_title, tp.slug AS topic_slug
     FROM sections s JOIN topics tp ON tp.id = s.topic_id`,
  )
  .all() as { id: number; title: string; topic_title: string; topic_slug: string }[];

write('anchors.json', {
  sections: Object.fromEntries(
    sectionAnchors.map((s) => [s.id, { title: `${s.topic_title} › ${s.title}`, topicSlug: s.topic_slug }]),
  ),
  topics: Object.fromEntries(topics.map((t) => [t.id, { title: t.title, topicSlug: t.slug }])),
});

console.log(
  `Exported ${tracks.length} tracks, ${topics.length} topics, ` +
    `${diagramRows.length} diagrams, ${codeRows.length} code walkthroughs to client/public/data.`,
);
