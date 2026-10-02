# Visual audit — what each topic should show

2026-10-01. Prompted by review of the consistent-hashing page: two visuals said the same thing, the
older one showed its answer on step 1, and stepping through it changed nothing but which arrows were
lit. The redesign plan had aimed for roughly one scenario per topic. That was the wrong target.

## The test

A **scenario** (the step-through simulation with knobs and checkpoints) has to earn its place. It
exists only if all three hold:

1. **Something changes over time** — load, failures, races, data moving between machines.
2. **The outcome depends on a choice you can flip** — a knob changes what happens, not just a label.
3. **Most people would predict it wrong** — otherwise a sentence does the job faster.

Anything else gets the lightest form that works:

| Form | When |
|---|---|
| **Walkthrough** (diagram + steps) | A request or message moves hop by hop and the *order* is the lesson — DNS resolution, chat delivery. |
| **Still figure** | The lesson is a structure, a layout or a comparison — a bit layout, four protocols side by side. No play controls. |
| **Notes under a figure** | Points of argument attached to a picture ("the bill", "what decomposition costs"). Read, not stepped. |
| **Calculator** | The lesson is arithmetic you should do yourself — estimation. |
| **Nothing** | Prose is enough. |

Two rules that follow:

- **One visual per idea.** When a scenario covers what a diagram shows, the diagram goes.
- **Controls only when stepping changes something.** A diagram flow that is commentary becomes notes;
  a diagram with no path flows becomes a still figure.

## Diagram flows, classified

Every diagram step lights some edges, so "has steps" says nothing. What matters is whether the steps
follow something through the system (**path**) or are commentary pinned to an arrow (**note**).

| Diagram | Path flows (keep stepping) | Note flows (become notes) | Verdict |
|---|---|---|---|
| application-layer / service-boundaries | Routing a request | Each service owns its data · What decomposition costs | walkthrough + notes |
| asynchronism / queue-workers | Normal operation · A message that always fails | When consumers fall behind | walkthrough + notes |
| availability-patterns / multi-dc-failover | Both regions healthy · Region 2 goes dark | — | walkthrough |
| batch-analytics / mapreduce-pipeline | The job · Serving the answer | Batch versus streaming | walkthrough + notes |
| caching / cache-aside | Cache hit · Cache miss | ~~The failure mode: stampede~~ — duplicates the cache-stampede scenario | walkthrough, drop stampede flow |
| cap-theorem / partition-choice | Choose CP · Choose AP | It's per operation | walkthrough + notes |
| cdn / pull-cdn | Cold · Warm | Why you pre-warm a launch | walkthrough + notes |
| chat-system / message-delivery | Bob online · Bob offline | — | walkthrough |
| communication-protocols / realtime-options | — (a tour of four options) | Why each exists · What a persistent connection costs | **still figure** + notes |
| consistency-patterns / replication-lag | — | — | **retire** — the replication-lag scenario covers it, with the fix |
| consistent-hashing / rehashing-problem | — | — | **retire** — answer visible at step 1; the scenario covers modulo |
| dns / resolution-path | Cold lookup · Warm lookup | DNS as a routing tool | walkthrough + notes |
| graph-data-modeling / graph-sharding | One hop · Two hops | Living with it | walkthrough + notes |
| key-value-store / quorum | — | — | **retire** — the quorum scenario runs the same W=2/R=2 write, read and repair; "turning the dial" moves to prose |
| load-balancing / health-check-failover | A server dies mid-traffic | Why sticky sessions ruin this | walkthrough + notes |
| media-and-file-storage / upload-transcode | Uploading · Transcoding · Playback | — | walkthrough |
| news-feed / fanout-on-write | Posting · Reading a feed | Where it breaks | walkthrough + notes |
| notification-system / channel-queues | Normal fan-out · SMS provider degrades | — | walkthrough |
| rate-limiter / limiter-placement | Within the limit · Over the limit | — | walkthrough (complements the token-bucket scenario: *where*, not *how*) |
| relational-databases / sharding | Shard key answers · Shard key can't answer | The bill | walkthrough + notes |
| scaling-journey / single-server, web-data-tier, full-stack | all | — | walkthrough |
| search-autocomplete / two-systems | Answering a keystroke · Learning what people search for | Why the split matters | walkthrough + notes |
| unique-id-generator / snowflake-layout | — (a bit layout) | all three | **still figure** + notes |
| url-shortener / shorten-and-redirect | Shortening · Following a link | — | walkthrough |
| web-crawler / frontier-loop | One turn of the loop | What breaks a naive crawler | walkthrough + notes |

Result: 3 diagrams retired, 2 become still figures, 22 stay as walkthroughs — 12 of them with their
commentary moved out of the step controls into notes.

**Done (2026-10-01).** Flows carry `kind: "path" | "notes"` (default path). The player steps through
path flows only; `DiagramFigure` lists notes flows under the figure and draws a diagram with no path
flows as a still figure without transport controls. The three duplicate diagrams are retired and the
caching diagram's stampede flow is gone.

## Scenarios

### Shipped (10)

All ten pass the test. One fails on execution, not on concept:

| Scenario | Topic | Verdict |
|---|---|---|
| Cache stampede | caching | keep |
| Anatomy of a request | scaling-journey | keep |
| Raft | availability-patterns | keep |
| Failover and fencing | availability-patterns | keep |
| Token bucket, then two gateways | rate-limiter | keep |
| **Hash ring vs modulo** | consistent-hashing | **rebuild.** Opens on its weakest setting (no ring), Play animates nothing, ring dots are unlabelled so you must cross-read an angle column. Rebuild around one large ring: keys labelled and coloured by owner, "S1 leaves" visibly moves the affected keys, modulo shown as the same keys in 4 buckets collapsing to 3; drop the tables. |
| Quorum, sloppy quorum, read repair | key-value-store | keep |
| Replication lag | consistency-patterns | keep |
| Consumer crash and rebalance | asynchronism | keep |
| Retry storm | performance-and-latency | keep |

After the hash-ring rebuild, every shipped scenario gets the same check: *with the tables hidden,
can you see what changed between two steps?*

### Wave 3 — 18 planned, 5 pass

| Planned scenario | Topic | Verdict | Why |
|---|---|---|---|
| Fan-out on write vs read | news-feed | **built** (2026-10-02) | A celebrity post backs up the queue for everyone behind it; the follower threshold flips it; people underestimate the backlog. |
| Delivery and per-device cursors | chat-system | **built** (2026-10-02) | A socket that dies without a close frame looks online; messages "delivered" to it are lost unless the device's cursor drives delivery. Timing-dependent and counter-intuitive. |
| Snowflake and the clock | unique-id-generator | **build** (small) | The clock steps back and two IDs collide; the monotonic-clock fix is a knob. |
| Changing a record mid-incident | dns | **build** (small) | Lowering the TTL after the outage starts doesn't help for the old TTL's duration — a classic wrong prediction. |
| Map, shuffle, skew | batch-analytics | **build** | One hot key makes one reducer the whole job; adding machines doesn't help, salting does. |
| Cache key and purge at the edge | cdn | later, maybe | Real bug, but a single event — a before/after figure may do. |
| Frontier and politeness | web-crawler | later, maybe | The existing walkthrough covers the loop; the failure is modest. |
| Revoking a stateless token | security | still figure instead | "A stolen JWT works until it expires" is one sentence and a timeline. |
| Shorten, redirect, 301 vs 302 | url-shortener | cut | One fact; the walkthrough's last step already states it. |
| Upload, transcode, renditions | media-and-file-storage | cut | A bandwidth sum, not a simulation; the walkthrough covers the path. |
| Top-k trie and index swap | search-autocomplete | still figure instead | The contrived failure isn't the lesson — the trie is. A still trie with top-k lists per node. |
| Retries, permanent failures, DLQ | notification-system | cut | Covered by retry storm, consumer rebalance and the queue walkthrough. |
| Shard routing and resharding | relational-databases | cut | The walkthrough already shows scatter-gather; resharding is the hash-ring lesson. |
| Losing an instance | application-layer | cut | One sentence; the load-balancing walkthrough says it. |
| Polling to WebSocket | communication-protocols | cut | Arithmetic, not dynamics — the still figure carries the comparison. |
| N+1 vs one join | graph-data-modeling | cut | The walkthrough's two-hop flow already shows the fan-out. |
| Choosing during a partition | cap-theorem | cut | Raft and quorum already run partitions; link to them. |
| Partition key hot spot | nosql-databases | still figure instead | A static distribution — writes per partition, one bar towering. |

### Topics with no scenario, and that's right

interview-framework (a process — prose), back-of-envelope (**calculator** wired to the facts
registry, not a scenario), security, nosql-databases, and every topic above marked cut.

## Per topic, after the audit

| Topic | Scenario | Other visual |
|---|---|---|
| interview-framework | — | — |
| back-of-envelope | — | calculator (to build) |
| performance-and-latency | retry storm | — |
| scaling-journey | anatomy of a request | 3 walkthroughs |
| cap-theorem | — (links to raft, quorum) | walkthrough + notes |
| consistency-patterns | replication lag | — |
| availability-patterns | raft, failover and fencing | walkthrough |
| consistent-hashing | hash ring (rebuilt) | — |
| unique-id-generator | snowflake and the clock (to build) | still figure + notes |
| dns | TTL mid-incident (to build) | walkthrough + notes |
| cdn | — | walkthrough + notes |
| load-balancing | — | walkthrough + notes |
| communication-protocols | — | still figure + notes |
| relational-databases | — | walkthrough + notes |
| nosql-databases | — | still figure (to build) |
| caching | cache stampede | walkthrough |
| key-value-store | quorum | — |
| graph-data-modeling | — | walkthrough + notes |
| application-layer | — | walkthrough + notes |
| asynchronism | consumer rebalance | walkthrough + notes |
| batch-analytics | map, shuffle, skew (to build) | walkthrough + notes |
| security | — | still figure (to build) |
| url-shortener | — | walkthrough |
| news-feed | fan-out, and the account that breaks it | walkthrough (its "where it breaks" notes dropped — the scenario shows it) |
| web-crawler | — | walkthrough + notes |
| rate-limiter | token bucket | walkthrough |
| chat-system | a phone in a tunnel | walkthrough ("Bob is offline" flow dropped — the scenario shows it) |
| search-autocomplete | — | walkthrough + notes, trie still figure (to build) |
| notification-system | — | walkthrough |
| media-and-file-storage | — | walkthrough |

Totals: 15 scenarios (10 shipped, 5 to build) instead of 35, on 14 of 30 topics.
