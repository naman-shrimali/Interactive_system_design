/**
 * Shared markdown helpers for the ingestion pipeline.
 *
 * The link handling here is deliberately a scanner rather than a regex: markdown
 * permits balanced parentheses inside a URL, and the old regex `\(([^)\s]+)\)`
 * truncated 7 real primer links (e.g. `.../Load_balancing_(computing)` became
 * `.../Load_balancing_(computing`), producing dead links in the app.
 */

export interface FoundLink {
  start: number; // index of the leading '!' (images) or '['
  end: number; // index just past the closing ')'
  text: string;
  url: string;
  isImage: boolean;
}

/** Scan markdown for links/images, tolerating balanced parens inside the URL. */
export function findLinks(md: string): FoundLink[] {
  const out: FoundLink[] = [];
  for (let i = 0; i < md.length; i++) {
    if (md[i] !== '[') continue;
    const isImage = i > 0 && md[i - 1] === '!';

    // Match the label, allowing nested brackets.
    let depth = 1;
    let j = i + 1;
    while (j < md.length && depth > 0) {
      if (md[j] === '[') depth++;
      else if (md[j] === ']') depth--;
      j++;
    }
    if (depth !== 0 || md[j] !== '(') continue;
    const text = md.slice(i + 1, j - 1);

    // Match the destination, allowing balanced parens.
    let d = 1;
    let k = j + 1;
    while (k < md.length && d > 0) {
      if (md[k] === '(') d++;
      else if (md[k] === ')') d--;
      if (d > 0) k++;
    }
    if (d !== 0) continue;

    out.push({
      start: isImage ? i - 1 : i,
      end: k + 1,
      text,
      url: md.slice(j + 1, k).trim(),
      isImage,
    });
    i = k;
  }
  return out;
}

/** Rebuild markdown, passing each link's URL through `mapUrl`. */
export function mapLinkUrls(md: string, mapUrl: (url: string, isImage: boolean) => string): string {
  const links = findLinks(md);
  if (links.length === 0) return md;
  const parts: string[] = [];
  let cursor = 0;
  for (const l of links) {
    parts.push(md.slice(cursor, l.start));
    const bang = l.isImage ? '!' : '';
    parts.push(`${bang}[${l.text}](${mapUrl(l.url, l.isImage)})`);
    cursor = l.end;
  }
  parts.push(md.slice(cursor));
  return parts.join('');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** GitHub-style heading anchor. */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Strip markdown links/images and inline HTML from a heading line. */
export function cleanHeading(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`]/g, '')
    .trim();
}

/**
 * Convert the primer's inline-HTML figures to markdown so react-markdown
 * (which has raw HTML disabled) can render them.
 */
export function htmlToMarkdown(md: string): string {
  return md
    .replace(
      /<a\b[^>]*\bhref=["']?([^"'\s>]+)["']?[^>]*>(.*?)<\/a>/gis,
      (_m, href, text) => `[${String(text).trim()}](${href})`,
    )
    .replace(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)["']?[^>]*>/gi, (_m, src) => `![](${src})`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|i|b|em|strong|sub|sup|div|span|center|small|u)\b[^>]*>/gi, '')
    .replace(/[ \t]+\n/g, '\n');
}

export interface Token {
  level: number;
  text: string;
  bodyLines: string[];
}

/** Split a markdown document into heading tokens; code fences never yield headings. */
export function tokenize(md: string): Token[] {
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
  }
  return tokens;
}

/** Demote a heading line by `offset` levels, floor 1. */
export function renderBlocks(blocks: Token[], headingOffset: number): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const level = Math.max(1, b.level - headingOffset);
    parts.push(`${'#'.repeat(level)} ${b.text}`);
    const body = b.bodyLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    if (body) parts.push(body);
  }
  return parts.join('\n\n').trim();
}
