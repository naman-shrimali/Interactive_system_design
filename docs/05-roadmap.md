# 05 — Roadmap & Status

## Where things stand

| Phase | Status |
|---|---|
| 0. Scaffold (client + server + scripts) | ✅ shipped |
| 1. Data layer — schema, ingestion, seeding | ✅ shipped (rebuilt as schema v2, the topic model) |
| 2. API — curriculum, topics, progress, notes, diagrams | ✅ shipped |
| 3. Reader UI — sidebar, topic page, links, progress, notes | ✅ shipped |
| 4. Design system — tokens, dark mode, serif reading column, responsive | ✅ shipped |
| 5. Diagram engine — 17 node types, edges, groups, canvas, flow stepper | ✅ shipped |
| 6. Content authoring | ✅ shipped — 0 topics under 800 words; 30/30 published |
| 7. Diagram authoring | ✅ shipped — 27 diagrams across 25 of 30 topics; 5 left deliberately prose-only |
| 8. Polish — dashboard, search, notes export | ✅ shipped |
| 9. Code dry-runs — per-topic step-through sidebar | ✅ shipped — 22 of 30 topics; 8 left deliberately code-free |
| 10. Static deploy to GitHub Pages | ✅ shipped — no backend; progress in localStorage |
| 11. Curated reading list — primary sources per topic | ✅ shipped — 47 entries, 30 of 30 topics |
| 12. Facts registry — canonical numbers, cross-checked | ✅ shipped |
| 13. Questions, misconceptions, traps | ✅ shipped — 73 entries, 30 of 30 topics |
| 14. Systems in Motion — redesign + scenario engine | 🟡 P0–P3 and P5 shipped, P4 wave 2 shipped: design reset, engine, 10 scenarios, all 27 diagrams on the new renderer; P4 wave 3 (18 scenarios) to do |

The original phases 1–3 were re-cut when the curriculum moved from a source-first to a topic-first
model ([docs/06-topic-model.md](06-topic-model.md)). Task files for that shipped work are kept as
history — see [tasks/README.md](../tasks/README.md).

## Phase 5 — Diagram engine (shipped)

Built and verified in-browser: all 17 node types, labelled edges with step badges, tier groups, the
spec→React Flow canvas, and the flow stepper that marks a diagram viewed on completion. Diagrams embed
in **TopicPage** and live at `content/diagrams/<topicSlug>/<slug>.json`. Task files kept as history:

- **TASK-015** BaseNode + first 4 node types + registry + preview page → [tasks/TASK-015-diagram-nodes-batch1.md](../tasks/TASK-015-diagram-nodes-batch1.md)
- **TASK-018** Node batch 2: dns, cdn, cache, nosql, message_queue → [tasks/TASK-018-diagram-nodes-batch2.md](../tasks/TASK-018-diagram-nodes-batch2.md)
- **TASK-019** Node batch 3: stacks, service, text_box, table → [tasks/TASK-019-diagram-nodes-batch3.md](../tasks/TASK-019-diagram-nodes-batch3.md)
- **TASK-020** LabeledEdge (colour/dash/step badge/emphasis) → [tasks/TASK-020-labeled-edge.md](../tasks/TASK-020-labeled-edge.md)
- **TASK-021** Group rendering (dashed/solid/filled tiers) → [tasks/TASK-021-group-node.md](../tasks/TASK-021-group-node.md)
- **TASK-022** DiagramCanvas: spec JSON → React Flow → [tasks/TASK-022-diagram-canvas.md](../tasks/TASK-022-diagram-canvas.md)
- **TASK-023** FlowStepper + DiagramViewer, marks `viewed` → [tasks/TASK-023-flow-stepper.md](../tasks/TASK-023-flow-stepper.md)
- **TASK-024** Embed in TopicPage + file-driven preview route → [tasks/TASK-024-diagram-embedding.md](../tasks/TASK-024-diagram-embedding.md)

Planned styling upgrade over the original spec: ByteByteGo-style dark diagram panels with saturated
node colours, plus a legend.

## Phase 6 — Content authoring

Per topic, ~1200–1800 words of **original** prose across the kind vocabulary (overview → concepts →
deep dive → trade-offs → checklist). Primer text is kept where it is already strong and supplemented,
not replaced.

Delivered in batches of ~5 topics. Each batch is markdown under `content/authored/` plus
`npm run ingest && npm run seed` — **zero code changes**. Priority order:

1. The 7 topics with no primer coverage at all: consistent-hashing, unique-id-generator, rate-limiter,
   chat-system, search-autocomplete, notification-system, media-and-file-storage.
2. Thin-but-existing topics: back-of-envelope (40w), security (84w), performance-and-latency (121w),
   consistency-patterns, cap-theorem, application-layer, dns, interview-framework, cdn, asynchronism.

`npm run ingest` prints the current ranked list — treat it as the backlog of record, not this doc.

**Status: done.** Zero topics under 800 words; 54,909 words across 101 sections, median topic 1,761 words. 19 authored files remain unwritten, but every topic they belong to already clears the bar on primer content — they are enhancements, not gaps, and `npm run ingest` lists them.

## Phase 7 — Diagram authoring (shipped)

27 diagrams across 25 of 30 topics, 68 walkthroughs, all 17 node types exercised, every diagram
anchored to a section. Includes the scaling-journey evolution sequence (one system at three scales).

Five topics are **deliberately** prose-only: `back-of-envelope` and `performance-and-latency` are
carried by tables and worked arithmetic, `security` is a checklist, `nosql-databases` is a four-way
comparison a table serves better, and `interview-framework` is a process rather than a system. A
forced diagram there would be filler.

Authoring loop: write JSON → `npm run validate:diagrams` → view at `/diagram-preview` → `npm run seed`.

## Phase 8 — Polish (shipped)

- **Dashboard** (`/dashboard`, `DashboardPage.tsx`) reads `GET /api/progress/summary` (which already
  existed with no UI) and renders an overall-progress card plus one card per track: sections completed,
  resources read, diagrams viewed, and a "Continue: `<next incomplete topic>`" link. `Card` in
  `components/ui` gained a `style` prop so per-track accent colours can be applied the same way HomePage
  already does.
- **Search** (`components/search/CommandPalette.tsx`) is a `Cmd/Ctrl+K` command palette, entirely
  client-side against the curriculum tree already held in `useAppStore` — no new endpoint. Ranks by
  title-exact → title-prefix → title-contains → track-title-contains → summary-contains; arrow keys
  navigate, Enter opens the topic. Wired into `App.tsx`'s `Shell` component (global keydown listener)
  and a `TopBar` button (desktop: labelled with shortcut hint; mobile: icon-only).
- **Notes export** is a button on `NotesPage` that appears once `notes.length > 0`, builds one markdown
  document (each note as `## <anchor title>` + content + updated timestamp) client-side from the
  already-fetched `NoteWithAnchor[]`, and downloads it via a `Blob` + object URL. No new endpoint.

Verified in-browser in both themes: dashboard stat cards and progress bars, palette search/filter/
keyboard-select/navigate, and export producing well-formed markdown from a real note.

## Phase 9 — Code dry-runs

A per-topic sidebar that walks the topic's implementation in code, one step at a time, for
practising the "dry run this for me" moment in an interview. Mostly JavaScript; the one topic where
SQL is the natural language (`relational-databases`) uses it instead, and the syntax highlighter
recognises both `//` and `--` line comments so it renders correctly either way.

Content lives at `content/code/<topicSlug>/<slug>.json`, validated by `npm run validate:code` against
`scripts/code-walkthrough.schema.json`. Authoring is a data change — no TypeScript.

Each step is either `kind: "code"` (a snippet plus the reasoning you would say while writing it) or
`kind: "infra"` (a component with nothing to write — Redis, a queue, a CDN — rendered as a one-line
note so the flow stays continuous). Steps may carry `saysOutLoud` for a line to deliver verbatim.

The validator enforces what makes a step usable at a whiteboard: infra steps need a real explanation
rather than a stub, snippets stay under 84 columns and 40 lines, and every step's `explain` has to
say something beyond restating the code.

**Status: done.** Written for 22 of 30 topics: rate-limiter, consistent-hashing, unique-id-generator,
url-shortener, caching, search-autocomplete, news-feed, key-value-store, web-crawler, chat-system,
notification-system, asynchronism, media-and-file-storage, load-balancing, graph-data-modeling,
availability-patterns, communication-protocols, relational-databases, application-layer,
batch-analytics, dns, cdn.

Eight topics are **deliberately** code-free, the same reasoning as the five prose-only diagram
topics in Phase 7: `interview-framework`, `back-of-envelope`, `performance-and-latency`, and
`security` are a process or a checklist, not a system to dry-run; `cap-theorem`,
`consistency-patterns`, and `nosql-databases` are trade-off comparisons a table already serves;
`scaling-journey` is an evolution across three systems rather than one implementation. A forced
walkthrough there would be filler standing in for a diagram or a table that already does the job.

Snippets are capped at 84 columns because the sidebar fits roughly 83 — past that a trailing comment
gets clipped, and the comments are where the teaching lives.

## Phase 11 — Curated reading list

`content/reading-list.json` is a hand-authored list of primary sources, kept in the repo so it is
identical on every device (unlike progress, which is per-browser localStorage). It sits above the
183 auto-harvested primer links, which are unranked and carry no rationale.

Each entry names a **tier** — `normative` (the standard itself), `authoritative` (primary
implementer or researcher), or `interview` (framing and breadth) — plus a `why` stating what the
source settles that the lesson cannot settle on its own, and a `lastVerified` date.

Read state is keyed by **url**, not a generated id. A source cited by several topics is therefore
marked read in all of them at once, and the list needs no database table: it exports straight from
content to `client/public/data/reading-list.json`.

`npm run validate:reading` checks structure (known topic slugs, no duplicate urls, no future
verification dates, `why` that does not merely restate the title). `npm run validate:links` also
fetches every url. Bot-blocking responses (401/403/405/429) are warnings rather than failures — a
publisher refusing our user-agent is not a dead link, and a checker that cries wolf gets ignored.

Adding a source is a data change: append an entry, re-run the export, push.

## Phase 12 — Facts registry

`content/facts.json` is the single source of truth for the curriculum's hard numbers — latency
figures and availability budgets. The defect it targets is not a wrong number in isolation but the
**same number stated two different ways in two topics**, which is the most common flaw in study
material and the hardest to notice by reading.

Each fact carries a `source` url that must appear in `content/reading-list.json`, so no canonical
number is self-asserted, plus a `lastVerified` date.

`derived` entries express a relationship between two facts (memory versus SSD, SSD versus disk
seek) and carry regex `patterns` matching how that ratio gets written in prose.
`npm run validate:facts` computes the ratio from the absolute values and compares it against every
prose claim across authored sections **and** code walkthroughs — so the table and the sentences
quoting it cannot drift apart silently. A claim fails only when off by more than 3×, which catches
a factor-of-ten slip without arguing about 1000 versus 1500.

It earned its place on the first run, catching a genuine 10× error in three places across two
topics: `back-of-envelope` lists memory at 100 ns and SSD at 100 µs — a 1000× ratio — while its own
headline conclusion, its checklist, and the `caching` overview all claimed ~100×.

The deploy workflow runs `npm run validate` before building, so contradictory content fails the
build rather than reaching the site.

Adding a canonical number is a data change: add the fact, cite a reading-list url, and add a
`derived` entry with patterns if prose quotes a ratio of it.

## Phase 13 — Questions, misconceptions, and traps

`content/questions.json` covers interview questions, common confusions, and "common wrong answers"
as **one** format rather than three sections, because they are facets of the same artifact: a place
where the obvious answer fails.

Every entry has a `kind`:

- `question` — asked directly; the prompt must actually ask something.
- `misconception` — a plausible belief that is wrong, written the way someone would assert it. The
  validator rejects a misconception phrased as a question, because that is a `question`.
- `trap` — the obvious answer fails.

Misconceptions and traps **must** cite a `source` that already exists in `content/reading-list.json`,
so every correction is traceable rather than asserted — the same rule the facts registry applies to
canonical numbers.

On sourcing: there is no authoritative corpus of "questions asked at company X", and scraped lists
are unverifiable and frequently wrong. These are derived instead from the primary sources already
curated — Kleppmann on CP/AP labelling and on Redlock, Jepsen on what quorums actually guarantee,
RFC 6749 on OAuth being authorization rather than authentication, RFC 7519 on what stateless tokens
cost at revocation time.

The UI collapses every prompt by default so the answer must be attempted before it is revealed:
recognising an answer is not the same as being able to produce one. An optional `followUp` records
what a good interviewer asks once you answer well.

Adding an entry is a data change. `npm run validate:questions` enforces the rules above.


## Phase 14 — Systems in Motion

Plan and working prototype: [Systems in Motion](https://claude.ai/artifact/2HuZA1DoM8e5ArnRWuUCKs).
The static diagrams became a step-through instrument: one timeline drives the architecture, its live
state, the code that produced it, and the reasoning behind each step, with checkpoints that stop
playback to ask for a prediction.

**Scenarios are executed, not drawn.** Each is a TypeScript module in `client/src/sim/scenarios/`
whose `run(knobs)` models the system and returns one frame per step. Every number on screen is
computed by that run, so the state view can't disagree with the narration, and changing a knob just
runs it again. This deliberately breaks the "content is data" rule; `scripts/validate-scenarios.ts`
takes the safety back by running every scenario under every knob combination and checking:

- **anchors** — every highlighted code line contains its anchor text
- **determinism** — two runs with the same knobs give identical frames (seeded `sim/rng.ts`)
- **references** — nodes, edges and packets exist on the stage; nodes sit inside it
- **checkpoints** — predict answers are real options; sources are in the reading list; every run has
  a predict checkpoint and a why/break one
- **coverage** — every drawn edge carries a packet in some run
- **facts** — no latency literal (ms/µs/ns) in a scenario's text; timings come from
  `content/facts.json` through `factMs()`. A hypothetical figure is marked `fact-exempt`.

Proven by injecting a bad anchor, a latency literal and an out-of-range answer: all three fail.

**Engine** (`client/src/sim/`): `types.ts` (Scenario, Frame, Checkpoint), `Stage.tsx` (fixed-scale SVG;
scrolls instead of shrinking text; generic node rows — kv, bar, slots, log; polyline edges; packets
interpolated between frames), `Player.tsx` (transport, scrubber with checkpoint marks, speed, knobs
that re-run and keep your place at the last checkpoint before the runs diverge, Why/Code panel,
`#step-N` deep links, keyboard, reduced motion, container-query layout).

**Wave 1** — each exercises a different part of the engine:

| Scenario | Topic | What it proves |
|---|---|---|
| Cache stampede | caching | concurrency (bursts), a lock, TTL bars; knobs single-flight and TTL jitter |
| Anatomy of a request | scaling-journey | a latency ledger timed hop by hop from facts; knobs route, warm, cacheable — CDN saves exactly two ocean crossings cold and nothing warm |
| Raft | availability-patterns | protocol rules computed, not scripted: up-to-date vote check, majority, step-down on higher term, no-op commit (§5.4.2); knobs crash/partition and randomized/identical timeouts |

Added `last-mile-round-trip` (20 ms, HPBN citing the FCC) to the facts registry and HPBN's latency
chapter to the reading list for it.

**Design reset (P0):** IBM Plex Sans / Condensed / Mono replace the system stack and serif; one accent
sitewide (per-track colours removed); radius scale replaced (4 px controls, 6 px regions) so the old
`rounded-2xl` can't return; card shadows and fade-ups removed; the player is a dark instrument in both
themes. Home opens on a running scenario and lists the curriculum as an index.

**P5 — one renderer (shipped).** The 27 authored diagrams now run on the scenario engine and React
Flow is gone (bundle 659 → 481 KB). The old canvas fitted a 1,000–1,300 px drawing into a 650 px
column *and* capped its height at 560 px, which is why labels rendered near 6 px. Now:

- `sim/fromDiagram.ts` turns a diagram spec into a Scenario: each walkthrough is an option of one
  knob, each flow step a frame that lights its edges, dims the rest and sends a packet along them.
  Authored positions are kept (nodes in a group are offset by it; icon nodes keep their old centre).
- `sim/layout.ts` is the single source of box sizes, text wrapping, ports and label placement,
  shared by the renderer and the validator, so what is checked is what is drawn.
- Boxes hug their content; edges route orthogonally, spread across a node's side when several share
  it, and are nudged apart when two would run along the same line; labels are placed at the first
  spot clear of every node, label, region label and other edge.
- Diagrams break out of the 68ch reading column to full width and never render below 85% scale —
  below that they scroll inside their frame. The side table of contents became an inline row.

`npm run validate:diagrams` now also checks the layout as drawn: overlapping boxes, nodes spilling
out of their group, labels over nodes or each other, region labels crossed by edges, edges running
through any node (their own endpoints included), and two edges along one line. Turning it on flagged
15 of 27 diagrams. Most were renderer issues fixed generally; the rest were real defects the old
renderer hid behind shrinking and beziers — an edge through an unrelated node in all three
scaling-journey diagrams, replication drawn through the region-2 web tier, a loop edge drawn through
both its endpoints — each fixed in content without changing any step's wording.

**P4 wave 2 (shipped).** Seven scenarios, one per topic. Each answers its prediction from a small
model that runs independently of the frames (`simulate()`), and `run` throws if the two disagree.

| Scenario | Topic | Knobs → what the model computes |
|---|---|---|
| Token bucket, then two gateways | rate-limiter | one bucket / two local / shared via GET+SET / shared via Lua → 5, 10, 10, 5 requests pass a burst of 10 |
| Hash ring vs modulo | consistent-hashing | modulo / ring / 8 vnodes → keys moved when a server leaves (12, 5, 3 of 12), using FNV-1a + Murmur3 fmix32; honest about vnode variance at 8 points |
| Quorum, sloppy quorum, read repair | key-value-store | W1R1 / W2R2, sloppy on/off → stale read, read repair, and a stale read *despite* R+W>N with hinted handoff |
| Replication lag | consistency-patterns | round robin / sticky / by LSN → new-then-old (monotonic reads broken), old-old (no read-your-writes), new-new |
| Consumer crash and rebalance | asynchronism | commit before / after / after + idempotent write → 2 lost, 3 doubled, exactly once; 45 s session timeout |
| Retry storm | performance-and-latency | 3 attempts per layer vs 10% retry budget, deadline dropping on/off → never recovers (720 req/s vs 100), 7 s, 138 s, immediate |
| Failover and fencing | availability-patterns | storage accepts every write / fences by epoch → split-brain lost withdrawal (120) vs stale write refused (90) |

The Stage gained a `ring` row (hash ring with arcs, server squares, key dots, stacked labels) and
`sim/kit.ts` holds shared helpers (`lineOf`, `list`, `burst`, `hash32`). The retry-storm model is a
per-second fluid model: FIFO queue at B, work older than A's timeout is useless, and each second's
failure rate drives the next second's retries — crude, but it reproduces the metastable shape.

**Visual audit (2026-10-01).** One scenario per topic was the wrong target. `docs/06-visual-audit.md`
sets the test a scenario must pass (state changes over time; a knob changes the outcome; most people
would predict it wrong) and gives every topic a verdict. Wave 3 shrinks from 18 scenarios to 5; three
diagrams that duplicate a scenario are retired; commentary-only diagram flows become notes.

**Hash ring rebuilt.** The first version opened on a setting with no ring, animated nothing, and left
the ring's dots unlabelled. It now draws one large ring with labelled keys beside four server boxes
holding the keys as chips; when S1 leaves, the chips that change server glide to their new one. The
engine gained `Frame.tokens` for this (keyed chips laid out by `layout.tokenBoxes`, checked by the
validator to fit their node), choice knobs with up to four options render as a visible segmented
control instead of a menu, and the old rehashing diagram is retired.

**Audit applied to diagrams.** Diagram flows now carry `kind: "path" | "notes"`. Path flows are
stepped through; notes (commentary such as "the bill" or "what decomposition costs") are listed under
the figure; a diagram with no path flows (Snowflake's bit layout, the real-time protocols comparison)
is a still figure without player controls. The replication-lag and quorum diagrams are retired —
their scenarios cover them and the lesson prose already carries the R/W table — and the caching
diagram loses the stampede flow its scenario replaces. 24 diagrams remain.

**Fan-out (news-feed, wave 3).** @star (30M followers) posts a second before @bob (200), against
the lesson's load of 3,000 posts/s × 200 followers on workers sized for 800k writes/s. One FIFO queue:
@bob's post lands 37.3 s late and every post is late for 2.5 min. A big-account lane: @bob is instant
but @star's last follower waits 2.5 min and it is still 30M writes. Hybrid: one write, merged at read
time. The engine gained `Scenario.stageFor(knobs)` so a setting can add or remove components instead
of leaving an unused box; the validator checks every layout the knobs can select.

**A phone in a tunnel (chat-system, wave 3).** Bob's phone loses signal without closing its
WebSocket; Alice sends three messages; Bob reconnects a minute later. Two settings: what "delivered"
means (the socket write succeeded, or the device acked and resumes from its cursor) and whether presence
is a heartbeat TTL or open/close. Write + heartbeats: #41 and #42 vanish while Alice sees ✓✓. Write
without heartbeats: all three vanish and Bob shows online throughout. Cursor: all three arrive either
way — heartbeats are for presence and push notifications, not correctness. Adds the Linux
`tcp_keepalive_time` default (2 hours) to the facts registry, sourced from tcp(7).

**When the clock steps back (unique-id-generator, wave 3).** A Snowflake generator issuing two IDs
a millisecond has its clock stepped back 3 ms. Every ID comes from running the nextId() on the code
panel: trusting the clock reissues 6 IDs (duplicate primary keys); refusing — what Twitter's original
Snowflake did — fails 4 requests, and a 2-second step would fail every request for 2 s; max(clock,
lastMs) keeps counting inside the last millisecond. The closing question: lastMs lives in memory, so a
restart while the clock is behind can still repeat IDs.

The player now keeps your place across knob changes by comparing which code line is running by its
anchor, not its number — a setting that adds a line no longer sends learners back to step 1.

**Still to do:** the two remaining wave-3 scenarios (DNS TTL mid-incident, MapReduce skew), then the still figures it calls for (JWT
revocation timeline, autocomplete trie, NoSQL hot partition) and the back-of-envelope calculator.
