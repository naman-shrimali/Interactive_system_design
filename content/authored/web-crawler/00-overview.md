---
version: 1
---

We're designing a crawler: start from a set of seed URLs, fetch pages, extract the links they contain, and repeat — building a corpus of the web for a search index, an archive, or a monitoring system.

Described that way it sounds like a weekend project, and a naive version genuinely is about twenty lines. What makes it an interview question is everything that goes wrong once it runs against the real web at scale: the same pages fetched forever, a single site taken offline by your own traffic, and a crawl that never terminates because someone's calendar has an infinite "next month" link.

### Scoping it

- **Scale:** say a billion pages a month. That works out to roughly 400 pages per second sustained, which sets the size of the fetcher fleet.
- **Politeness:** honour `robots.txt` and rate-limit per host. Non-negotiable — a crawler that ignores this is a denial-of-service tool.
- **Content:** HTML only, unless asked. Media discovery is a different problem.
- **Freshness:** pages are re-crawled on a schedule weighted by how often they change.
- **Storage:** raw page content plus metadata, retained for downstream indexing.

State that a billion pages at ~500 KB each is on the order of **500 TB per month**, and the storage question answers itself: object storage, with compression, and a retention policy.

### The loop, and its four hard parts

The cycle is simple — frontier → fetch → parse → discover → back to frontier. The difficulty is concentrated in four places:

**The frontier is not one queue.** If it were, fetchers would pull whatever is next and hammer whichever host dominates the queue. It's a queue *per host*, with a scheduler that respects a delay between requests to the same host while keeping the fleet busy across thousands of other hosts. Politeness and throughput are in tension, and the frontier's structure is how you get both.

**Deduplication has to be cheap.** At a billion pages you cannot hold an exact set of visited URLs in memory. A Bloom filter answers "definitely new" or "probably seen" in constant space, accepting a small false-positive rate — meaning a few genuinely new pages get skipped. That is a good trade, and being explicit about accepting it is the point.

**Traps exist and are common.** Infinite calendars, session IDs in URLs that make every request look novel, and deliberately generated link mazes. Defences: depth limits per host, URL normalisation that strips volatile query parameters, and a per-host page budget so one pathological domain can't consume the crawl.

**Duplicate content is separate from duplicate URLs.** The same article appears at several URLs across syndication. Checksumming the content catches what URL deduplication cannot.

### What the design looks like

A queue-driven pipeline: a distributed frontier, a stateless fleet of fetchers, parsers, a shared dedup filter, and object storage for content. Fetchers are I/O-bound and scale horizontally; parsers are CPU-bound and scale separately. Because the whole thing is a loop through a queue, it restarts cleanly after a crash — nothing is lost, work simply resumes.
