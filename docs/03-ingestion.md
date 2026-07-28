# 03 — Content Ingestion

Content reaches the database through a two-stage pipeline plus a seeder:

```
  vendor/system-design-primer/**.md ──┐
                                      ├─► [1] parse-primer.ts    ─► content/primer-corpus.json
  content/topic-map.json ─────────────┤
  content/authored/**/*.md ───────────┼─► [2] build-curriculum.ts ─► content/curriculum.json
  scripts/ingest/primer-overrides.json┘                                       │
                                                                              ▼
  content/diagrams/<topicSlug>/*.json ──────────────────────► [3] server/src/db/seed.ts ─► SQLite
```

Run it all with:

```bash
cd scripts && npm run ingest      # stages 1 + 2 (or ingest:parse / ingest:build individually)
cd ../server && npm run seed      # stage 3
```

Both stages are **deterministic** — running twice produces byte-identical JSON.

## Sources and licensing

| Source | Handling | Text stored? |
|---|---|---|
| The System Design Primer (MIT) | automated: cloned, parsed, attributed per section | ✅ yes, with `attribution_url` |
| *System Design Interview* by Alex Xu (copyrighted) | used **only as a topic checklist** | ❌ never |

Which problems are worth covering is a fact, not protected expression. Every word of a book-derived
topic is written by us and stored with `provenance: 'authored'`. No text or image from the book enters
the repo or the database. ByteByteGo informs visual design language only.

## Stage 1 — `scripts/ingest/parse-primer.ts`

Produces a flat corpus keyed by chapter/section. Knows nothing about topics.

1. **Fetch** — clones `donnemartin/system-design-primer` into `vendor/` (git-ignored) if absent, and
   records the short commit SHA in the corpus.
2. **Tokenize** — splits markdown into `{ level, text, bodyLines }` heading tokens. Fenced code blocks
   never yield headings.
3. **Chapters** — `scripts/ingest/manifest.json` lists which README headings become chapters
   (`readmeChapters`) and which solution directories become chapters (`solutionChapters`). A heading
   that matches nothing is a **hard error** listing every miss — never a silent skip.
4. **Sections** — the body before the first subheading becomes `overview`; each subheading of
   `chapterLevel + 1` becomes its own section. Bodies are rendered with the section heading at `##`.
5. **HTML → markdown** — the primer's inline-HTML figures are converted (`<a>`, `<img>`, `<br>`) because
   react-markdown runs with raw HTML disabled.
6. **URL rewriting** — relative links become absolute: images to `raw.githubusercontent.com/…/master/`,
   file links to `github.com/…/blob/master/`. Anchors are left alone.
7. **Link extraction** — external, non-image, deduped, in order of appearance; the primer's own repo
   URLs are excluded.

> **Links are scanned, not regexed.** Markdown allows balanced parentheses inside a URL. The original
> regex `\(([^)\s]+)\)` truncated 7 real links (`…/Load_balancing_(computing` lost its closing paren).
> `scripts/ingest/lib/markdown.ts` implements a balanced-paren scanner — use `findLinks`/`mapLinkUrls`,
> never a fresh regex.

Output: `content/primer-corpus.json` — 24 chapters, 125 sections, 199 links.

## Stage 2 — `scripts/ingest/build-curriculum.ts`

Compiles the corpus + `content/topic-map.json` + `content/authored/**` into `content/curriculum.json`.
The topic-map contribution formats are specified in [docs/02-data-models.md §2](02-data-models.md).

### `validateCoverage()` runs first, and it is the point of the whole stage

Every one of the 125 primer sections must be either referenced by the topic map or listed in
`scripts/ingest/primer-overrides.json`. It also fails on references to sections that don't exist, drops
of sections that don't exist, a primer section rendered as a page in two topics, unknown track slugs,
duplicate topic or section slugs, and unknown section kinds. **Write coverage checks before mapping —
silent content loss is the failure mode this pipeline exists to prevent.**

### The drop list

`primer-overrides.json` records the 16 deliberately-discarded sections with a reason each: the eight
`design-*/overview` stubs (replaced by authored overviews) and the eight
`design-*/step-2-create-a-high-level-design` stubs (replaced by diagrams).

> **Never drop by length or content hash.** Those eight step-2 stubs are 142 chars each but embed
> *different* image URLs, so they have eight distinct hashes — and a ninth section with the same slug,
> `how-to-approach/step-2-create-a-high-level-design`, is 165 chars of real prose that must be **kept**.
> Drops are by explicit `(chapter, section)` pair only.

### Assembly

For each topic, contributions are processed in order:

- **primer** → primer bodies are demoted one level (h2→h3) so they nest under the section title the UI
  renders, and a leading heading that merely repeats that title is stripped. Listing several `sections`
  concatenates them into one page. `attributionUrl` comes from the first source section.
- **linksOnly** → links are harvested to the topic; no section is produced.
- **authored** → front matter stripped, body used as-is.

Links are deduped per topic — a URL cited in three sections of one topic collapses to one checkbox,
which is why the link count drops from 199 to 183. A URL cited in two different topics stays two rows.

### Failure and warning behaviour

- A **missing authored file** is a warning: the section is skipped and reported.
- A topic that compiles to **zero sections** is a hard error — that would be a blank page.
- Topics under **800 words** get `status: 'stub'` (a "Being expanded" badge in the UI) and are printed
  as a ranked list. **That list is the content backlog** — it is the measurable definition of "thin".

## Stage 3 — `server/src/db/seed.ts`

Upserts `curriculum.json` into SQLite, then loads diagram specs from
`content/diagrams/<topicSlug>/<diagramSlug>.json`, anchoring each to the section that declared it in
`diagrams: [...]` (topic-level when nothing claims it). Diagram directories that match no topic slug are
reported as a warning rather than failing the seed.

**Idempotency:** every natural key is a slug (`tracks.slug`, `topics.slug`, `(topic_id, slug)` for
sections and diagrams, `(topic_id, url)` for links), so re-seeding updates content in place while row
ids — and therefore `section_progress`, `link_progress`, `diagram_progress`, and `notes` — survive.
Rows removed from the content files are left behind as harmless orphans; the seed never deletes.

## Rebuilding from scratch

The DDL is all `IF NOT EXISTS`, so an old database would boot half-migrated. `server/src/db/index.ts`
detects that and refuses to start with the fix printed. To rebuild:

```bash
rm -f server/data/app.db server/data/app.db-wal server/data/app.db-shm
cd scripts && npm run ingest
cd ../server && npm run seed
```

This discards all progress and notes, which is acceptable for a local single-user app.

## Adding content later

The whole point of the topic-map indirection: **write a markdown file under `content/authored/`, point a
contribution at it, re-run ingest + seed. No code changes.**
