/**
 * Stage 1 of ingestion: parse the system-design-primer markdown into a flat
 * corpus keyed by chapter/section. This stage knows nothing about topics — it
 * only produces raw material. `build-curriculum.ts` merges it into the topic
 * model. Deterministic: same input -> byte-identical output.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  cleanHeading,
  findLinks,
  githubSlug,
  htmlToMarkdown,
  mapLinkUrls,
  renderBlocks,
  slugify,
  tokenize,
  type Token,
} from './lib/markdown';

const REPO_ROOT = path.join(__dirname, '..', '..');
const VENDOR = path.join(REPO_ROOT, 'vendor', 'system-design-primer');
const OUT = path.join(REPO_ROOT, 'content', 'primer-corpus.json');
const RAW_BASE = 'https://raw.githubusercontent.com/donnemartin/system-design-primer/master/';
const BLOB_BASE = 'https://github.com/donnemartin/system-design-primer/blob/master/';
const REPO_HASH_BASE = 'https://github.com/donnemartin/system-design-primer#';

interface Manifest {
  source: { slug: string; title: string; kind: 'repo' | 'book'; description: string; sortOrder: number };
  readmeChapters: { slug: string; heading: string; sortOrder: number }[];
  solutionChapters: { slug: string; dir: string; title: string; sortOrder: number }[];
}
export interface CorpusLink {
  url: string;
  title: string;
}
export interface CorpusSection {
  slug: string;
  title: string;
  contentMarkdown: string;
  sourceUrl: string;
  links: CorpusLink[];
}
export interface CorpusChapter {
  slug: string;
  title: string;
  sections: CorpusSection[];
}
export interface PrimerCorpus {
  source: { slug: string; title: string; description: string; commit: string };
  chapters: CorpusChapter[];
}

/** Rewrite relative markdown links/images to absolute GitHub URLs. */
function rewriteUrls(md: string, fileDir: string): string {
  return mapLinkUrls(md, (url, isImage) => {
    if (url.startsWith('http') || url.startsWith('#')) return url;
    const resolved = path.posix.normalize(path.posix.join(fileDir, url)).replace(/^\.\//, '');
    return (isImage ? RAW_BASE : BLOB_BASE) + resolved;
  });
}

/** External (non-image, non-repo) links in order of appearance, deduped by URL. */
function extractLinks(md: string): CorpusLink[] {
  const seen = new Set<string>();
  const out: CorpusLink[] = [];
  for (const link of findLinks(md)) {
    if (link.isImage) continue;
    if (!/^https?:\/\//.test(link.url)) continue;
    if (link.url.includes('donnemartin/system-design-primer')) continue;
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    let title = cleanHeading(link.text).trim();
    if (!title) {
      try {
        title = new URL(link.url).hostname;
      } catch {
        title = link.url;
      }
    }
    out.push({ url: link.url, title });
  }
  return out;
}

function renderSection(blocks: Token[], fileDir: string): string {
  if (blocks.length === 0) return '';
  const offset = blocks[0].level - 2; // first block becomes h2
  return rewriteUrls(htmlToMarkdown(renderBlocks(blocks, offset)), fileDir) + '\n';
}

function ensureRepo(): void {
  if (fs.existsSync(path.join(VENDOR, 'README.md'))) return;
  console.log('Cloning system-design-primer…');
  execSync(`git clone --depth 1 https://github.com/donnemartin/system-design-primer "${VENDOR}"`, {
    stdio: 'inherit',
  });
}

function buildReadmeChapters(manifest: Manifest): CorpusChapter[] {
  const readme = fs.readFileSync(path.join(VENDOR, 'README.md'), 'utf-8');
  const tokens = tokenize(readme);
  const chapters: CorpusChapter[] = [];
  const misses: string[] = [];

  for (const entry of manifest.readmeChapters) {
    const startIdx = tokens.findIndex((t) =>
      t.text.toLowerCase().startsWith(entry.heading.toLowerCase()),
    );
    if (startIdx === -1) {
      misses.push(entry.heading);
      continue;
    }
    const chapterLevel = tokens[startIdx].level;
    let endIdx = tokens.length;
    for (let j = startIdx + 1; j < tokens.length; j++) {
      if (tokens[j].level <= chapterLevel) {
        endIdx = j;
        break;
      }
    }
    const range = tokens.slice(startIdx, endIdx);

    const sections: CorpusSection[] = [];
    let currentBlocks: Token[] = [range[0]];
    const flush = () => {
      const first = currentBlocks[0];
      const isOverview = first.level === chapterLevel;
      const title = isOverview ? entry.heading : first.text;
      const md = renderSection(currentBlocks, '');
      sections.push({
        slug: isOverview ? 'overview' : slugify(first.text),
        title,
        contentMarkdown: md,
        sourceUrl: REPO_HASH_BASE + githubSlug(title),
        links: extractLinks(md),
      });
    };
    for (let k = 1; k < range.length; k++) {
      if (range[k].level === chapterLevel + 1) {
        flush();
        currentBlocks = [range[k]];
      } else {
        currentBlocks.push(range[k]);
      }
    }
    flush();

    chapters.push({ slug: entry.slug, title: entry.heading, sections });
  }

  if (misses.length > 0) {
    throw new Error(`Manifest headings not found in README.md:\n  - ${misses.join('\n  - ')}`);
  }
  return chapters;
}

function buildSolutionChapters(manifest: Manifest): CorpusChapter[] {
  const chapters: CorpusChapter[] = [];
  for (const entry of manifest.solutionChapters) {
    const file = path.join(VENDOR, entry.dir, 'README.md');
    if (!fs.existsSync(file)) throw new Error(`Solution README missing: ${entry.dir}/README.md`);
    const tokens = tokenize(fs.readFileSync(file, 'utf-8'));
    const sourceUrl = `${BLOB_BASE}${entry.dir}/README.md`;

    const sections: CorpusSection[] = [];
    let currentBlocks: Token[] = [];
    let started = false;
    const flush = () => {
      if (currentBlocks.length === 0) return;
      const first = currentBlocks[0];
      const isOverview = !started;
      const md = renderSection(currentBlocks, entry.dir);
      sections.push({
        slug: isOverview ? 'overview' : slugify(first.text),
        title: isOverview ? 'Overview' : first.text,
        contentMarkdown: md,
        sourceUrl,
        links: extractLinks(md),
      });
    };
    for (const tok of tokens) {
      if (tok.level === 2) {
        flush();
        currentBlocks = [tok];
        started = true;
      } else if (currentBlocks.length === 0 && tok.level === 1) {
        currentBlocks = [tok];
      } else {
        currentBlocks.push(tok);
      }
    }
    flush();

    chapters.push({ slug: entry.slug, title: entry.title, sections });
  }
  return chapters;
}

function main(): void {
  ensureRepo();
  const manifest: Manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'),
  );

  let commit = '';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: VENDOR }).toString().trim();
  } catch {
    /* vendor dir may not be a git repo */
  }

  const chapters = [...buildReadmeChapters(manifest), ...buildSolutionChapters(manifest)];
  const corpus: PrimerCorpus = {
    source: {
      slug: manifest.source.slug,
      title: manifest.source.title,
      description: manifest.source.description,
      commit,
    },
    chapters,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(corpus, null, 2) + '\n');

  const sections = chapters.reduce((n, c) => n + c.sections.length, 0);
  const links = chapters.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.links.length, 0), 0);
  console.log(
    `Wrote ${path.relative(REPO_ROOT, OUT)}\n  chapters: ${chapters.length}  sections: ${sections}  links: ${links}`,
  );
}

main();
