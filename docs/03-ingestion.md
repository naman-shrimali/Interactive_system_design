# 03 — Resource Ingestion Strategy

Two sources, two very different pipelines:

| Source | Pipeline | Text stored? |
|---|---|---|
| system-design-primer (MIT) | automated: clone → parse markdown → `content/primer-curriculum.json` → seed | ✅ full markdown |
| Alex Xu book (copyrighted) | manual: hand-write `content/book-curriculum.json` (chapter scaffolding + original summaries) and hand-author diagram JSON | ❌ never |

## Pipeline A: system-design-primer → `content/primer-curriculum.json`

### Step 1 — Fetch (in `scripts/ingest/parse-primer.ts`)

```
if vendor/system-design-primer does not exist:
    run: git clone --depth 1 https://github.com/donnemartin/system-design-primer vendor/system-design-primer
read vendor/system-design-primer/README.md
```
`vendor/` is git-ignored. Pinning: after first clone, record the commit hash into `content/primer-curriculum.json` under `source.description` suffix `(@<short-sha>)`.

### Step 2 — The manifest (`scripts/ingest/manifest.json`)

The primer's README.md is one huge file. A **hand-curated manifest** decides what becomes a chapter. Two kinds of entries:

```json
{
  "source": {
    "slug": "primer",
    "title": "The System Design Primer",
    "kind": "repo",
    "description": "Learn how to design large-scale systems. MIT © Donne Martin.",
    "sortOrder": 0
  },
  "readmeChapters": [
    { "slug": "how-to-approach",        "heading": "How to approach a system design interview question", "sortOrder": 0 },
    { "slug": "performance-vs-scalability", "heading": "Performance vs scalability",  "sortOrder": 1 },
    { "slug": "latency-vs-throughput",  "heading": "Latency vs throughput",           "sortOrder": 2 },
    { "slug": "cap-theorem",            "heading": "Availability vs consistency",     "sortOrder": 3 },
    { "slug": "consistency-patterns",   "heading": "Consistency patterns",            "sortOrder": 4 },
    { "slug": "availability-patterns",  "heading": "Availability patterns",           "sortOrder": 5 },
    { "slug": "dns",                    "heading": "Domain name system",              "sortOrder": 6 },
    { "slug": "cdn",                    "heading": "Content delivery network",        "sortOrder": 7 },
    { "slug": "load-balancer",          "heading": "Load balancer",                   "sortOrder": 8 },
    { "slug": "reverse-proxy",          "heading": "Reverse proxy (web server)",      "sortOrder": 9 },
    { "slug": "application-layer",      "heading": "Application layer",               "sortOrder": 10 },
    { "slug": "database",               "heading": "Database",                        "sortOrder": 11 },
    { "slug": "cache",                  "heading": "Cache",                           "sortOrder": 12 },
    { "slug": "asynchronism",           "heading": "Asynchronism",                    "sortOrder": 13 },
    { "slug": "communication",          "heading": "Communication",                   "sortOrder": 14 },
    { "slug": "security",               "heading": "Security",                        "sortOrder": 15 }
  ],
  "solutionChapters": [
    { "slug": "design-pastebin",     "dir": "solutions/system_design/pastebin",      "title": "Design Pastebin.com",              "sortOrder": 20 },
    { "slug": "design-twitter",      "dir": "solutions/system_design/twitter",       "title": "Design the Twitter timeline",      "sortOrder": 21 },
    { "slug": "design-web-crawler",  "dir": "solutions/system_design/web_crawler",   "title": "Design a web crawler",             "sortOrder": 22 },
    { "slug": "design-mint",         "dir": "solutions/system_design/mint",          "title": "Design Mint.com",                  "sortOrder": 23 },
    { "slug": "design-sales-rank",   "dir": "solutions/system_design/sales_rank",    "title": "Design Amazon's sales rank",       "sortOrder": 24 },
    { "slug": "design-scaling-aws",  "dir": "solutions/system_design/scaling_aws",   "title": "Design a system that scales to millions of users on AWS", "sortOrder": 25 },
    { "slug": "design-query-cache",  "dir": "solutions/system_design/query_cache",   "title": "Design a key-value cache for search queries", "sortOrder": 26 },
    { "slug": "design-social-graph", "dir": "solutions/system_design/social_graph",  "title": "Design the data structures for a social network", "sortOrder": 27 }
  ]
}
```

> Heading matching is **case-insensitive prefix match** on the rendered heading text (README headings may carry trailing anchors/links). If a manifest heading is not found, the script must **fail loudly** listing all unmatched headings — never skip silently.

### Step 3 — Parsing algorithm (pseudo-code)

```
parse README.md into a flat list: tokens = [{ level, text, bodyLines[] }]
  - a heading line matches /^(#{1,6})\s+(.*)$/  (strip markdown links/anchors from text)
  - bodyLines = all lines until the next heading of ANY level
  - IMPORTANT: skip fenced code blocks (``` ... ```) when scanning for headings

for each manifest.readmeChapters entry:
    find index i where tokens[i].text startsWith entry.heading (case-insensitive)
    chapterLevel = tokens[i].level
    capture tokens[i..j) where j = next token with level <= chapterLevel
    sections = split captured range at level == chapterLevel + 1
        - the chapter's own bodyLines (before the first subheading) form
          section { slug: "overview", title: entry.heading, sortOrder: 0 }
        - each subheading becomes section { slug: slugify(text), title: text, sortOrder: n }
    for each section:
        contentMarkdown = reassemble heading + body, demoting headings so the section's own title is h2
        rewrite relative urls (Step 4)
        externalLinks   = extract (Step 5)
        sourceUrl       = "https://github.com/donnemartin/system-design-primer#" + githubSlug(heading)

for each manifest.solutionChapters entry:
    read vendor/system-design-primer/<dir>/README.md
    sections = split whole file at level-2 headings ("## "), same rules as above

write content/primer-curriculum.json  (shape: docs/02-data-models.md §2)
```

`slugify(text)`: lowercase → strip non-alphanumerics to `-` → collapse repeats → trim `-`.

### Step 4 — URL rewriting (so images and cross-links work in our app)

For every markdown link/image `[t](path)` or `![t](path)` where `path` does NOT start with `http` or `#`:
- image (`![`): prefix with `https://raw.githubusercontent.com/donnemartin/system-design-primer/master/` (resolve `../` relative to the file being parsed)
- non-image file link: prefix with `https://github.com/donnemartin/system-design-primer/blob/master/`
- pure anchor links (`#...`): leave unchanged.

### Step 5 — External-link extraction (feature requirement #5)

From each section's final markdown, collect every **non-image** link matching
`/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g`:
- `title` = link text (fallback: hostname), `url` = href
- exclude: links to `github.com/donnemartin/system-design-primer` itself (internal), duplicate urls within a section (keep first), image links
- order of appearance = `sortOrder`

These populate the section's **"External resources"** panel with per-link completion checkboxes (`link_progress` table).

## Pipeline B: book scaffolding → `content/book-curriculum.json`

Hand-authored once (already committed by planning). Chapters follow the actual PDF TOC:

Scale From Zero To Millions Of Users · Back-of-the-Envelope Estimation · A Framework For System Design Interviews · Design A Rate Limiter · Design Consistent Hashing · Design A Key-Value Store · Design A Unique ID Generator · Design A URL Shortener · Design A Web Crawler · Design A Notification System · Design A News Feed System · Design A Chat System · Design A Search Autocomplete System · Design YouTube · Design Google Drive

Foundation chapters (1–3) have a single `overview` section; interview-question chapters (4–15) have `overview`, `high-level-design`, `deep-dive`. `contentMarkdown` is our own summary text (or empty until authored). Diagrams attach to sections via Pipeline C.

## Pipeline C: seeding SQLite (`server/src/db/seed.ts`)

```
open db (runs schema.sql first)
upsert user id=1
for each file in [content/primer-curriculum.json, content/book-curriculum.json]:
    upsert source by slug            (ON CONFLICT(slug) DO UPDATE title/kind/description/sort_order)
    for each chapter: upsert by (source_id, slug)
    for each section: upsert by (chapter_id, slug)   -- updates content, KEEPS id
    for each externalLink: upsert by (section_id, url)
for each file in content/diagrams/**/*.json:
    validate against scripts/diagram.schema.json (ajv) — abort seed on any invalid file
    locate target section by convention: content/diagrams/<sourceSlug>__<chapterSlug>__<sectionSlug>/<diagramSlug>.json
    upsert diagram by (section_id, slug), spec_json = file contents
print summary counts (sources/chapters/sections/links/diagrams)
```

**Idempotency guarantee:** all natural keys are slugs, so re-running the seed after a content update changes text in place without changing row ids — `section_progress`, `link_progress`, `diagram_progress`, and `notes` all survive because they reference those stable ids. Rows removed from content files are left in the DB (harmless orphans by design; no destructive deletes during seed).
