---
version: 1
---

The frontier is the component that makes a crawler polite, prioritised and terminating. Get it wrong and you have a very efficient way to get your IP range blocked.

### Why not one queue

With a single FIFO of URLs, fetchers pull whatever is next. Since a large site contributes thousands of links at once, consecutive URLs tend to share a host — so the fleet hits one server with hundreds of concurrent requests. You have built an accidental load test against someone else's website.

Adding a global delay between requests fixes politeness and destroys throughput: the crawler now fetches one page per delay interval across the entire web.

Both requirements are satisfiable at once, but only if the queue knows about hosts.

### The two-layer structure

**Front queues — priority.** Several queues, one per priority band. A prioritiser assigns each URL a band from signals like PageRank, update frequency, or how long since it was last crawled. This is where "important pages get crawled sooner" is implemented.

**Back queues — politeness.** Many queues, each dedicated to a single host, with a mapping from hostname to its queue. The invariant: **all URLs for one host live in exactly one back queue, and one worker drains that queue.**

A scheduler holds a timestamp per back queue saying when that host may next be contacted. It hands a worker the queue whose delay has elapsed. So each host is contacted at a polite rate, while thousands of hosts are in flight simultaneously.

That structure is the whole trick, and it's worth drawing: priority is decided on the way in, politeness on the way out.

### Where the delay comes from

`robots.txt` may specify `Crawl-delay`; honour it. Otherwise, adapt: a common heuristic is to wait some multiple of the host's observed response time, so a slow server is automatically crawled more gently. Fetch and cache `robots.txt` per host, respecting its own expiry, and re-check periodically — sites change their rules.

### Persistence

The frontier is large — billions of URLs — and losing it means restarting the crawl. It doesn't fit in memory, so the usual arrangement keeps queue heads and tails buffered in memory with the bulk on disk. It must survive a restart, which is what lets you deploy, crash, and resume without re-crawling from the seeds.

### Deduplication, and what it costs

Before a URL enters the frontier it's checked against a seen-set. Exact membership for billions of URLs is far too large for memory, so a **Bloom filter** is standard: constant space per element, no false negatives, and a tunable false-positive rate.

The consequence is worth stating plainly: a false positive means a genuinely new URL is judged "seen" and never crawled. At a 1% rate you silently skip about 1% of discovered pages. For a web crawler that's an easy trade — the pages are usually reachable by another link anyway — but it is a real loss, and knowing it is the difference between using the tool and understanding it.

Normalise before hashing, or you'll store the same page many times: lowercase the host, strip default ports and fragments, sort query parameters, and remove known-volatile ones like session IDs and tracking tags.

### Traps, concretely

- **Infinite spaces** — calendars, faceted search with unbounded filter combinations, deliberately generated mazes. The URLs really are new, so the dedup filter never fires. Bound crawl depth per host and cap pages per host.
- **Session IDs** — every fetch mints a new URL for the same page. URL normalisation is the defence.
- **Duplicate content across hosts** — syndicated articles. A checksum of the content catches these where URL comparison can't; near-duplicate detection via shingling catches the ones that differ by a byline.

### Re-crawling

Pages change at wildly different rates, so a fixed schedule is wasteful at one end and stale at the other. Track observed change frequency per page and feed it back into the prioritiser, so a news homepage is revisited constantly and a decade-old archive page rarely. Storing a content checksum makes the re-crawl cheap to evaluate: if the bytes are unchanged, downstream indexing can be skipped entirely.
