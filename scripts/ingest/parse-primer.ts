/**
 * TASK-003: Parse system-design-primer markdown into content/primer-curriculum.json.
 * Deterministic: same input → byte-identical output.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..');
const VENDOR = path.join(REPO_ROOT, 'vendor', 'system-design-primer');
const OUT = path.join(REPO_ROOT, 'content', 'primer-curriculum.json');
const RAW_BASE = 'https://raw.githubusercontent.com/donnemartin/system-design-primer/master/';
const BLOB_BASE = 'https://github.com/donnemartin/system-design-primer/blob/master/';
const REPO_HASH_BASE = 'https://github.com/donnemartin/system-design-primer#';

interface Manifest {
  source: { slug: string; title: string; kind: 'repo' | 'book'; description: string; sortOrder: number };
  readmeChapters: { slug: string; heading: string; sortOrder: number }[];
  solutionChapters: { slug: string; dir: string; title: string; sortOrder: number }[];
}
interface OutSection {
  slug: string;
  title: string;
  contentMarkdown: string;
  sourceUrl: string | null;
  sortOrder: number;
  externalLinks: { url: string; title: string; sortOrder: number }[];
}
interface OutChapter {
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  sections: OutSection[];
}
interface Token {
  level: number;
  text: string;
  bodyLines: string[];
}

// ---------- helpers ----------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** GitHub-style heading anchor. */
function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Strip markdown links/images and inline HTML from a heading line. */
function cleanHeading(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`]/g, '')
    .trim();
}

/** Split a markdown document into heading tokens; code fences never yield headings. */
function tokenize(md: string): Token[] {
  const lines = md.split('\n');
  const tokens: Token[] = [];
  let inCode = false;
  let current: Token | null = null;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    const m = !inCode ? line.match(/^(#{1,6})\s+(.*)$/) : null;
    if (m) {
      current = { level: m[1].length, text: cleanHeading(m[2]), bodyLines: [] };
      tokens.push(current);
    } else if (current) {
      current.bodyLines.push(line);
    }
    // lines before the first heading are dropped (front-matter / repo title area)
  }
  return tokens;
}

/** Rewrite relative markdown links/images to absolute GitHub URLs. */
function rewriteUrls(md: string, fileDir: string): string {
  return md.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (_all, bang: string, textPart: string, url: string) => {
    if (url.startsWith('http') || url.startsWith('#')) return `${bang}[${textPart}](${url})`;
    const resolved = path.posix.normalize(path.posix.join(fileDir, url)).replace(/^\.\//, '');
    const abs = bang ? RAW_BASE + resolved : BLOB_BASE + resolved;
    return `${bang}[${textPart}](${abs})`;
  });
}

/** Extract external (non-image, non-repo) links in order of appearance, deduped by url. */
function extractLinks(md: string): { url: string; title: string; sortOrder: number }[] {
  const re = /(!?)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const seen = new Set<string>();
  const out: { url: string; title: string; sortOrder: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const [, bang, textPart, url] = m;
    if (bang) continue; // image
    if (url.includes('donnemartin/system-design-primer')) continue; // internal
    if (seen.has(url)) continue;
    seen.add(url);
    let title = cleanHeading(textPart).trim();
    if (!title) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = url;
      }
    }
    out.push({ url, title, sortOrder: out.length });
  }
  return out;
}

/**
 * Convert the primer's inline-HTML figures to markdown so react-markdown (HTML disabled)
 * renders them. Handles <a href>, <img src>, <br>, and strips a whitelist of wrapper tags.
 * Regexes target specific tag names, so code like `a < b` is untouched.
 */
function htmlToMarkdown(md: string): string {
  return md
    .replace(/<a\b[^>]*\bhref=["']?([^"'\s>]+)["']?[^>]*>(.*?)<\/a>/gis, (_m, href, text) => `[${text.trim()}](${href})`)
    .replace(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)["']?[^>]*>/gi, (_m, src) => `![](${src})`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|i|b|em|strong|sub|sup|div|span|center|small|u)\b[^>]*>/gi, '')
    .replace(/[ \t]+\n/g, '\n');
}

/** Render a run of blocks (heading + body) as markdown, demoting so the first block's title is h2. */
function renderSection(blocks: Token[], fileDir: string): string {
  if (blocks.length === 0) return '';
  const offset = blocks[0].level - 2; // first block becomes ##
  const parts: string[] = [];
  for (const b of blocks) {
    const level = Math.max(1, b.level - offset);
    parts.push(`${'#'.repeat(level)} ${b.text}`);
    const body = b.bodyLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    if (body) parts.push(body);
  }
  return rewriteUrls(htmlToMarkdown(parts.join('\n\n').trim()), fileDir) + '\n';
}

// ---------- main ----------

function ensureRepo(): void {
  if (fs.existsSync(path.join(VENDOR, 'README.md'))) return;
  console.log('Cloning system-design-primer…');
  execSync(
    `git clone --depth 1 https://github.com/donnemartin/system-design-primer "${VENDOR}"`,
    { stdio: 'inherit' },
  );
}

function buildReadmeChapters(manifest: Manifest): OutChapter[] {
  const readme = fs.readFileSync(path.join(VENDOR, 'README.md'), 'utf-8');
  const tokens = tokenize(readme);
  const chapters: OutChapter[] = [];
  const misses: string[] = [];

  for (const entry of manifest.readmeChapters) {
    const startIdx = tokens.findIndex((t) => t.text.toLowerCase().startsWith(entry.heading.toLowerCase()));
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

    // Group into sections: overview = first block + its deeper folds until first (chapterLevel+1) heading.
    const sections: OutSection[] = [];
    let currentBlocks: Token[] = [range[0]];
    const flush = () => {
      const first = currentBlocks[0];
      const isOverview = first.level === chapterLevel;
      const title = isOverview ? entry.heading : first.text;
      const slug = isOverview ? 'overview' : slugify(first.text);
      const md = renderSection(currentBlocks, '');
      sections.push({
        slug,
        title,
        contentMarkdown: md,
        sourceUrl: REPO_HASH_BASE + githubSlug(isOverview ? entry.heading : first.text),
        sortOrder: sections.length,
        externalLinks: extractLinks(md),
      });
    };
    for (let k = 1; k < range.length; k++) {
      const tok = range[k];
      if (tok.level === chapterLevel + 1) {
        flush();
        currentBlocks = [tok];
      } else {
        currentBlocks.push(tok);
      }
    }
    flush();

    chapters.push({
      slug: entry.slug,
      title: entry.heading,
      description: '',
      sortOrder: entry.sortOrder,
      sections,
    });
  }

  if (misses.length > 0) {
    throw new Error(`Manifest headings not found in README.md:\n  - ${misses.join('\n  - ')}`);
  }
  return chapters;
}

function buildSolutionChapters(manifest: Manifest): OutChapter[] {
  const chapters: OutChapter[] = [];
  for (const entry of manifest.solutionChapters) {
    const file = path.join(VENDOR, entry.dir, 'README.md');
    if (!fs.existsSync(file)) {
      throw new Error(`Solution README missing: ${entry.dir}/README.md`);
    }
    const md = fs.readFileSync(file, 'utf-8');
    const tokens = tokenize(md);
    const sourceUrl = `${BLOB_BASE}${entry.dir}/README.md`;

    const sections: OutSection[] = [];
    let currentBlocks: Token[] = [];
    let started = false;
    const flush = () => {
      if (currentBlocks.length === 0) return;
      const first = currentBlocks[0];
      const isOverview = !started;
      const title = isOverview ? 'Overview' : first.text;
      const slug = isOverview ? 'overview' : slugify(first.text);
      const rendered = renderSection(currentBlocks, entry.dir);
      sections.push({
        slug,
        title,
        contentMarkdown: rendered,
        sourceUrl,
        sortOrder: sections.length,
        externalLinks: extractLinks(rendered),
      });
    };
    // Preamble (before first ## ) → overview; then split at level-2 headings.
    for (const tok of tokens) {
      if (tok.level === 2) {
        flush();
        currentBlocks = [tok];
        started = true;
      } else if (currentBlocks.length === 0 && tok.level === 1) {
        // top title (# ...) starts the overview block
        currentBlocks = [tok];
      } else {
        currentBlocks.push(tok);
      }
    }
    flush();

    chapters.push({
      slug: entry.slug,
      title: entry.title,
      description: '',
      sortOrder: entry.sortOrder,
      sections,
    });
  }
  return chapters;
}

function main(): void {
  ensureRepo();
  const manifest: Manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'),
  );

  let shortSha = '';
  try {
    shortSha = execSync('git rev-parse --short HEAD', { cwd: VENDOR }).toString().trim();
  } catch {
    /* ignore */
  }

  const chapters = [...buildReadmeChapters(manifest), ...buildSolutionChapters(manifest)];
  const output = {
    source: {
      ...manifest.source,
      description: shortSha
        ? `${manifest.source.description} (@${shortSha})`
        : manifest.source.description,
    },
    chapters,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');

  const sectionCount = chapters.reduce((n, c) => n + c.sections.length, 0);
  const linkCount = chapters.reduce(
    (n, c) => n + c.sections.reduce((m, s) => m + s.externalLinks.length, 0),
    0,
  );
  console.log(
    `Wrote ${OUT}\n  chapters: ${chapters.length}  sections: ${sectionCount}  externalLinks: ${linkCount}`,
  );
}

main();
