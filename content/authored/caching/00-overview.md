---
version: 1
---

Caching is the cheapest large win available in system design. Reads usually outnumber writes heavily, the same small set of items is requested disproportionately often, and memory is roughly a thousand times faster than SSD. Put those three facts together and a modest cache absorbs the large majority of your read traffic.

It is also the source of some of the most confusing bugs you will ever debug, because a cache is a second copy of the truth that is allowed to be wrong.

### Why it works so well

Access follows a steep power law. Roughly 20% of content drives 80% of requests — often far more skewed than that. So a cache holding a small fraction of your data serves most of your reads, and cache sizing starts by estimating that hot working set rather than the total.

The latency argument is just as blunt. A memory read is ~100 ns; an SSD read is ~100 µs; a disk seek is ~10 ms. Removing a database round trip from the common path is usually worth more than any amount of query optimisation.

### The decisions this topic covers

**Where to cache.** Every layer can hold a copy — the client, the CDN, a reverse proxy, the application, the database itself. Each is faster and less controllable than the one behind it. Caching at multiple layers is normal, and it means one stale value can hide in several places.

**What to cache.** Whole query results are simple to reason about and invalidate awkwardly, because any change to any underlying row invalidates them. Objects — a fully assembled user, ready to serve — invalidate cleanly and cost more to build. Object-level caching is usually the better default.

**When to update it.** Cache-aside, write-through, write-behind and refresh-ahead differ in who populates the cache and when, and therefore in what happens when a write and a read race. This is the section worth reading closely.

**When to give up on it.** Every cached value needs an eviction policy and an expiry, and getting those wrong produces either stale data or a stampede.

### The two failure modes to know

**Staleness.** The cache holds a value the database has since changed. Bounded by TTLs, fixed by invalidation on write, and never fully eliminated — which is why "how stale can this be?" is a question worth asking about every cached item.

**Stampede.** A popular key expires and every concurrent request for it misses simultaneously, sending a burst of identical queries to the database. A cache expiry becomes a database outage. The fixes — single-flight rebuilds, jittered TTLs, refreshing hot keys before they expire — are all about ensuring one expiry produces one query rather than thousands.

### The framing worth keeping

A cache is a bet that the cost of occasionally serving stale data is lower than the cost of always being correct. That bet is almost always right for a social feed and almost always wrong for an account balance. Deciding *per item* — rather than turning caching on globally and discovering the exceptions in production — is what separates a considered design from a hopeful one.
