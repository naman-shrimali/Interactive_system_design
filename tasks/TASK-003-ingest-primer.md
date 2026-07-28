# TASK-003: Primer ingestion script (README.md → primer-curriculum.json)

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Write `scripts/ingest/parse-primer.ts` that converts the system-design-primer repo's markdown into `content/primer-curriculum.json`, driven by a hand-curated manifest.

## Prerequisites
TASK-001. This task does NOT touch the database or server.

## Context
The primer (MIT licensed) keeps its core content in one huge `README.md` plus per-problem `solutions/system_design/*/README.md` files. A manifest lists which headings become chapters; everything else is ignored. The output JSON is later seeded into SQLite by TASK-004.

## Files to create
```
scripts/package.json          (deps: tsx, typescript, @types/node; script "ingest": "tsx ingest/parse-primer.ts")
scripts/tsconfig.json         (strict, module commonjs, target ES2022)
scripts/ingest/manifest.json
scripts/ingest/parse-primer.ts
```
## Files generated (git-tracked output)
```
content/primer-curriculum.json
```

## Data contracts
- **Manifest**: verbatim from docs/03-ingestion.md "Step 2" (fields `source`, `readmeChapters[{slug,heading,sortOrder}]`, `solutionChapters[{slug,dir,title,sortOrder}]`).
- **Output**: the curriculum-file shape from docs/02-data-models.md §2 — `{ source, chapters: [{ slug, title, description, sortOrder, sections: [{ slug, title, contentMarkdown, sourceUrl, sortOrder, externalLinks: [{ url, title, sortOrder }] }] }] }`.

## Steps (follow exactly; full pseudo-code in docs/03-ingestion.md Step 3–5)

1. **Fetch**: if `vendor/system-design-primer/README.md` is missing, run
   `git clone --depth 1 https://github.com/donnemartin/system-design-primer vendor/system-design-primer`
   via `child_process.execSync`.
2. **Tokenize** README.md into `{ level, text, bodyLines[] }[]`:
   - Track fenced code blocks: a line starting ``` ``` ``` toggles `inCode`; heading regex `/^(#{1,6})\s+(.*)$/` applies only when `!inCode`.
   - Clean heading text: strip markdown links `[t](u)` → `t`, strip HTML tags, trim.
3. **Chapters from manifest**: for each `readmeChapters` entry, find the first token whose cleaned text starts with `entry.heading` (case-insensitive). Collect tokens until the next token with `level <= chapterLevel`.
   - Body before the first subheading (level `chapterLevel+1`) → section `{ slug: "overview", title: entry.heading, sortOrder: 0 }`.
   - Each level-`chapterLevel+1` subheading → its own section (`slug = slugify(title)`, deeper headings stay inside its `contentMarkdown`, demoted so the section title would be `##`).
   - If any manifest heading matches nothing: collect all misses and `throw new Error` listing them (fail loudly).
4. **Solution chapters**: read each `dir + "/README.md"`, split at `## ` headings with the same rules (whole-file preamble → `overview`).
5. **Rewrite relative URLs** in every section's markdown (docs/03 Step 4):
   images → `https://raw.githubusercontent.com/donnemartin/system-design-primer/master/<resolved>`, file links → `.../blob/master/<resolved>`, anchors untouched. Resolve `../`/`./` relative to the parsed file's directory.
6. **Extract external links** (docs/03 Step 5): non-image `[t](http…)` links, exclude the primer's own repo URLs, dedupe per section, order of appearance.
7. **slugify**: lowercase → replace non `[a-z0-9]` runs with `-` → trim `-`. `sourceUrl` = `https://github.com/donnemartin/system-design-primer#` + GitHub-style anchor of the heading (lowercase, spaces→`-`, strip non `[a-z0-9-]`).
8. Write pretty-printed JSON to `content/primer-curriculum.json` and print a summary: chapters, sections, links counts.

## Acceptance criteria
- [ ] `cd scripts && npm install && npm run ingest` completes and writes `content/primer-curriculum.json`.
- [ ] JSON parses; `source.slug === "primer"`; `chapters.length === 24` (16 readme + 8 solutions).
- [ ] Chapter `load-balancer` exists and its combined markdown mentions "load balancer" (case-insensitive).
- [ ] Every section's `externalLinks[].url` starts with `http` and none contain `donnemartin/system-design-primer`.
- [ ] No markdown image in the output references a relative path (search for `](images/` and `](../` → zero hits).
- [ ] Running the script twice produces byte-identical output (deterministic).
- [ ] Temporarily changing one manifest heading to `"XXX Nonexistent"` makes the script throw an error naming that heading (then revert).

## Out of scope
Seeding the DB (TASK-004), book curriculum (hand-authored separately), any HTML rendering.
