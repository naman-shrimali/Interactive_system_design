# 06 — The Topic Model

Why the curriculum is shaped `tracks → topics → sections`, and the vocabulary that goes with it.

## The problem it replaced

The first version organised content by **where it came from**: `sources → chapters → sections`, with the
primer and the book as two parallel trees. Measured, that produced:

- **3 near-duplicate chapter pairs** — `design-scaling-aws` ↔ `scale-to-millions`, `how-to-approach` ↔
  `interview-framework`, and back-of-envelope in both.
- **4 same-problem pairs** — `design-pastebin` ↔ url-shortener, `design-twitter` ↔ news-feed, web-crawler
  in both, `design-query-cache` ↔ key-value-store.
- **3 book topics with zero coverage anywhere** — consistent hashing, unique ID generation, Google Drive.
- **91 of 164 sections under 500 characters**, including 36 that were completely empty and 13 that were
  nothing but a list of links.

A learner browsing by topic met the same material twice under different names, and provenance — an
implementation detail of *how we got the text* — was the primary navigation axis.

## The model

**Provenance moved from the hierarchy onto the section.** Where content came from is now a field
(`sections.provenance`), so a single topic can weave primer text and original prose together while
keeping attribution exact.

```
track          5 of them. A colour, a title, a subtitle. Purely presentational grouping.
  └── topic    30 of them. The unit of study and the URL key (/topics/<slug>).
        └── section   Ordered by `kind`. The unit of progress tracking.
```

- **Topic slugs are globally unique** — they're the URL, so they can't be scoped to a track.
- **Links and diagrams hang off the topic**, not the section. Making `external_links` topic-scoped is
  what let the primer's 13 "Source(s) and further reading" pages become one Resources list per topic
  instead of 13 dead-end pages.
- **Progress is tracked per section**, and rolled up to topic and track in SQL.
- `prev`/`next` walk the entire curriculum in reading order and cross track boundaries, so the whole
  thing reads as one book.

## Tracks

| Track | Accent | Covers |
|---|---|---|
| `foundations` | emerald | Interview framework, estimation, performance vocabulary, the scaling journey |
| `theory` | violet | CAP/PACELC, consistency, availability, consistent hashing, unique IDs |
| `delivery` | sky | DNS, CDN, load balancing & reverse proxies, communication protocols |
| `data` | amber | Relational, NoSQL, caching, key-value stores, graph modelling, app layer, async, batch, security |
| `case-studies` | rose | URL shortener, news feed, web crawler, rate limiter, chat, autocomplete, notifications, media & file storage |

Accents are stored in the database and flow into the UI as the `--accent` CSS variable, so a track's
colour drives its cards, sidebar markers, progress bars, section labels, and controls.

## Section kinds

An ordered vocabulary (`section_kinds`, with `rank`) that gives every topic the same narrative arc and
lets the UI label sections consistently:

| Kind | Rank | Purpose |
|---|---|---|
| `overview` | 0 | What this is and why it matters. Written by us, even for primer-heavy topics. |
| `concepts` | 1 | The core mechanics — usually the strongest primer material. |
| `deep-dive` | 2 | The hard part: algorithms, failure modes, worked examples. |
| `tradeoffs` | 3 | Costs, caveats, and what you'd say when challenged. |
| `checklist` | 4 | Interview checklist, key numbers, common pitfalls. |

A topic doesn't need every kind, and may have several sections of the same kind. Order within a topic
comes from the `contributions` array, not from `rank` — `rank` exists so the vocabulary itself has a
canonical order.

## Difficulty and effort

`difficulty ∈ foundation | intermediate | advanced` and `estimatedMinutes` are authored per topic in the
topic map and shown as chips in the topic hero. They're editorial judgements, not computed.

## `status`: published vs stub

`status` is derived at build time: **under 800 words ⇒ `stub`**, which renders as a "Being expanded"
badge. It deliberately measures what a reader experiences, not whether some planned file is missing —
an earlier version flagged a topic whenever any authored file was absent, which marked all 30 topics as
stubs and carried no signal. The threshold lives in `THIN_TOPIC_WORDS` in `build-curriculum.ts`.

## Where the merge is declared

`content/topic-map.json` — see [docs/02-data-models.md §2](02-data-models.md) for the exact format and
[docs/03-ingestion.md](03-ingestion.md) for how it is compiled. The design intent is that **content is
data**: adding or deepening a topic means editing that file and a markdown file, never TypeScript.
