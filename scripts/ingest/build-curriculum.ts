/**
 * Stage 2 of ingestion: compile content/topic-map.json + content/primer-corpus.json
 * + content/authored/**.md into content/curriculum.json (the topic model the
 * server seeds).
 *
 * The load-bearing guarantee here is validateCoverage(): every primer section must
 * be either referenced by the topic map or explicitly dropped in
 * scripts/ingest/primer-overrides.json. Without it, a typo silently deletes content.
 */
import fs from 'fs';
import path from 'path';
import type { PrimerCorpus, CorpusSection } from './parse-primer';

const REPO_ROOT = path.join(__dirname, '..', '..');
const TOPIC_MAP = path.join(REPO_ROOT, 'content', 'topic-map.json');
const CORPUS = path.join(REPO_ROOT, 'content', 'primer-corpus.json');
const OVERRIDES = path.join(__dirname, 'primer-overrides.json');
const OUT = path.join(REPO_ROOT, 'content', 'curriculum.json');

const PRIMER_ATTRIBUTION = 'The System Design Primer — MIT © Donne Martin';
/** Below this, a topic is flagged `stub` and reported as a content backlog item. */
const THIN_TOPIC_WORDS = 800;
const SECTION_KINDS = ['overview', 'concepts', 'deep-dive', 'tradeoffs', 'checklist'] as const;
type SectionKind = (typeof SECTION_KINDS)[number];

// ---------------------------------------------------------------- config types

interface TrackCfg {
  slug: string;
  title: string;
  subtitle: string;
  accent: string;
  sortOrder: number;
}
interface AsCfg {
  slug: string;
  title: string;
  kind: SectionKind;
}
interface Contribution {
  from: 'primer' | 'authored';
  chapter?: string;
  sections?: string[];
  file?: string;
  as?: AsCfg;
  harvestLinks?: boolean;
  linksOnly?: boolean;
  diagrams?: string[];
}
interface TopicCfg {
  slug: string;
  track: string;
  title: string;
  summary: string;
  difficulty: 'foundation' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  accent?: string;
  sortOrder: number;
  contributions: Contribution[];
  furtherReading?: { url: string; title: string }[];
}
interface TopicMap {
  tracks: TrackCfg[];
  topics: TopicCfg[];
}
interface Overrides {
  drop: { chapter: string; section: string; reason: string }[];
}

// ---------------------------------------------------------------- output types

interface OutSection {
  slug: string;
  title: string;
  kind: SectionKind;
  contentMarkdown: string;
  provenance: 'primer' | 'authored';
  attributionUrl: string | null;
  attributionNote: string | null;
  contentRef: string;
  sortOrder: number;
  diagrams: string[];
}
interface OutTopic {
  slug: string;
  trackSlug: string;
  title: string;
  summary: string;
  difficulty: string;
  estimatedMinutes: number;
  accent: string;
  status: 'published' | 'stub';
  sortOrder: number;
  sections: OutSection[];
  links: { url: string; title: string; sortOrder: number }[];
}

// ---------------------------------------------------------------- markdown utils

/** Increase every heading level by `by`, ignoring fenced code blocks. */
function demote(md: string, by: number): string {
  if (by <= 0) return md;
  let inCode = false;
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inCode = !inCode;
      if (inCode) return line;
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      if (!m) return line;
      return `${'#'.repeat(Math.min(6, m[1].length + by))} ${m[2]}`;
    })
    .join('\n');
}

/** Drop a leading heading when it merely repeats the section title the UI already shows. */
function stripRedundantHeading(md: string, title: string): string {
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const m = lines[i]?.match(/^#{1,6}\s+(.*)$/);
  if (!m) return md;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (norm(m[1]) !== norm(title)) return md;
  return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
}

/** Minimal front-matter reader: only `version:` is meaningful today. */
function readAuthored(absPath: string): { body: string } {
  const raw = fs.readFileSync(absPath, 'utf-8');
  if (!raw.startsWith('---')) return { body: raw.trim() };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { body: raw.trim() };
  return { body: raw.slice(end + 4).trim() };
}

// ---------------------------------------------------------------- validation

function validateCoverage(corpus: PrimerCorpus, map: TopicMap, overrides: Overrides): void {
  const errors: string[] = [];

  const all = new Set<string>();
  for (const c of corpus.chapters) for (const s of c.sections) all.add(`${c.slug}/${s.slug}`);

  const referenced = new Map<string, string[]>();
  for (const t of map.topics) {
    for (const con of t.contributions) {
      if (con.from !== 'primer') continue;
      if (!con.chapter || !con.sections?.length) {
        errors.push(`topic "${t.slug}": primer contribution needs chapter + sections`);
        continue;
      }
      for (const s of con.sections) {
        const key = `${con.chapter}/${s}`;
        if (!referenced.has(key)) referenced.set(key, []);
        referenced.get(key)!.push(con.linksOnly ? `${t.slug}(links)` : t.slug);
      }
    }
  }

  const dropped = new Set(overrides.drop.map((d) => `${d.chapter}/${d.section}`));

  for (const key of all) {
    if (!referenced.has(key) && !dropped.has(key)) {
      errors.push(`UNMAPPED primer section: ${key} — add it to topic-map.json or primer-overrides.json`);
    }
  }
  for (const key of referenced.keys()) {
    if (!all.has(key)) errors.push(`topic-map references a primer section that does not exist: ${key}`);
  }
  for (const key of dropped) {
    if (!all.has(key)) errors.push(`primer-overrides drops a section that does not exist: ${key}`);
  }
  for (const [key, users] of referenced) {
    const asPages = users.filter((u) => !u.endsWith('(links)'));
    if (asPages.length > 1) {
      errors.push(`primer section ${key} is rendered as a page in ${asPages.length} topics: ${asPages.join(', ')}`);
    }
  }

  // Structural checks on the map itself.
  const trackSlugs = new Set(map.tracks.map((t) => t.slug));
  const topicSlugs = new Set<string>();
  for (const t of map.topics) {
    if (!trackSlugs.has(t.track)) errors.push(`topic "${t.slug}" references unknown track "${t.track}"`);
    if (topicSlugs.has(t.slug)) errors.push(`duplicate topic slug: ${t.slug}`);
    topicSlugs.add(t.slug);
    const seen = new Set<string>();
    for (const con of t.contributions) {
      if (con.linksOnly) continue;
      if (!con.as) {
        errors.push(`topic "${t.slug}": contribution without linksOnly must define "as"`);
        continue;
      }
      if (!SECTION_KINDS.includes(con.as.kind)) {
        errors.push(`topic "${t.slug}" section "${con.as.slug}": unknown kind "${con.as.kind}"`);
      }
      if (seen.has(con.as.slug)) errors.push(`topic "${t.slug}": duplicate section slug "${con.as.slug}"`);
      seen.add(con.as.slug);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Coverage validation failed (${errors.length}):\n  - ${errors.join('\n  - ')}`);
  }
}

// ---------------------------------------------------------------- compile

function main(): void {
  const map: TopicMap = JSON.parse(fs.readFileSync(TOPIC_MAP, 'utf-8'));
  const corpus: PrimerCorpus = JSON.parse(fs.readFileSync(CORPUS, 'utf-8'));
  const overrides: Overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf-8'));

  validateCoverage(corpus, map, overrides);

  const bySlug = new Map<string, CorpusSection>();
  for (const c of corpus.chapters) {
    for (const s of c.sections) bySlug.set(`${c.slug}/${s.slug}`, s);
  }
  const trackAccent = new Map(map.tracks.map((t) => [t.slug, t.accent]));

  const missingAuthored: string[] = [];
  const topics: OutTopic[] = [];

  for (const t of map.topics) {
    const sections: OutSection[] = [];
    const links: { url: string; title: string; sortOrder: number }[] = [];
    const seenUrls = new Set<string>();

    const addLinks = (ls: { url: string; title: string }[]) => {
      for (const l of ls) {
        if (seenUrls.has(l.url)) continue;
        seenUrls.add(l.url);
        links.push({ url: l.url, title: l.title, sortOrder: links.length });
      }
    };

    for (const con of t.contributions) {
      if (con.from === 'primer') {
        const parts: string[] = [];
        for (const slug of con.sections!) {
          const src = bySlug.get(`${con.chapter}/${slug}`)!;
          if (con.linksOnly || con.harvestLinks) addLinks(src.links);
          if (con.linksOnly) continue;
          // Primer bodies start at h2; demote to h3 so they nest under the
          // section title the UI renders, and drop a heading that just repeats it.
          parts.push(stripRedundantHeading(demote(src.contentMarkdown, 1), con.as!.title).trim());
        }
        if (con.linksOnly) continue;
        const first = bySlug.get(`${con.chapter}/${con.sections![0]}`)!;
        sections.push({
          slug: con.as!.slug,
          title: con.as!.title,
          kind: con.as!.kind,
          contentMarkdown: parts.filter(Boolean).join('\n\n') + '\n',
          provenance: 'primer',
          attributionUrl: first.sourceUrl,
          attributionNote: PRIMER_ATTRIBUTION,
          contentRef: `primer:${con.chapter}/${con.sections!.join('+')}`,
          sortOrder: sections.length,
          diagrams: con.diagrams ?? [],
        });
      } else {
        const abs = path.join(REPO_ROOT, con.file!);
        if (!fs.existsSync(abs)) {
          missingAuthored.push(`${t.slug}: ${con.file}`);
          continue;
        }
        const { body } = readAuthored(abs);
        sections.push({
          slug: con.as!.slug,
          title: con.as!.title,
          kind: con.as!.kind,
          contentMarkdown: stripRedundantHeading(body, con.as!.title).trim() + '\n',
          provenance: 'authored',
          attributionUrl: null,
          attributionNote: null,
          contentRef: `authored:${con.file}`,
          sortOrder: sections.length,
          diagrams: con.diagrams ?? [],
        });
      }
    }

    addLinks(t.furtherReading ?? []);

    if (sections.length === 0) {
      throw new Error(
        `topic "${t.slug}" compiled to ZERO sections — every authored file is missing. ` +
          `Write at least its overview before seeding.`,
      );
    }

    // "stub" means the page is genuinely thin for a reader — not merely that some
    // planned authored file is absent. It clears itself as content lands.
    const topicWords = sections.reduce(
      (n, s) => n + s.contentMarkdown.split(/\s+/).filter(Boolean).length,
      0,
    );
    topics.push({
      slug: t.slug,
      trackSlug: t.track,
      title: t.title,
      summary: t.summary,
      difficulty: t.difficulty,
      estimatedMinutes: t.estimatedMinutes,
      accent: t.accent ?? trackAccent.get(t.track) ?? '#64748b',
      status: topicWords < THIN_TOPIC_WORDS ? 'stub' : 'published',
      sortOrder: t.sortOrder,
      sections,
      links,
    });
  }

  const out = { tracks: map.tracks, topics };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  // ------------------------------------------------------------ build report
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const totalSections = topics.reduce((n, t) => n + t.sections.length, 0);
  const totalWords = topics.reduce((n, t) => n + t.sections.reduce((m, s) => m + words(s.contentMarkdown), 0), 0);
  const totalLinks = topics.reduce((n, t) => n + t.links.length, 0);

  console.log(`Wrote ${path.relative(REPO_ROOT, OUT)}`);
  console.log(
    `  tracks: ${map.tracks.length}  topics: ${topics.length}  sections: ${totalSections}  links: ${totalLinks}  words: ${totalWords.toLocaleString()}`,
  );

  const thin = topics
    .map((t) => ({ slug: t.slug, w: t.sections.reduce((m, s) => m + words(s.contentMarkdown), 0) }))
    .filter((t) => t.w < 800)
    .sort((a, b) => a.w - b.w);
  if (thin.length > 0) {
    console.log(`\n  ${thin.length} topic(s) under 800 words (Phase 4 targets):`);
    for (const t of thin) console.log(`    ${String(t.w).padStart(5)}w  ${t.slug}`);
  }
  if (missingAuthored.length > 0) {
    console.log(`\n  ${missingAuthored.length} authored file(s) not yet written:`);
    for (const m of missingAuthored) console.log(`    - ${m}`);
  }
}

main();
