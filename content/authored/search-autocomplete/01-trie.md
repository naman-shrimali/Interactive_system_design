---
version: 1
---

The serving side answers one question: given a prefix, what are the top 5 completions? It must do so in single-digit milliseconds, on every keystroke.

### Why a plain trie isn't enough

A trie stores strings as a tree of characters — the path from the root spells the prefix, and each node holds the frequency of the term ending there. Finding the node for a prefix is `O(p)` where `p` is prefix length: a handful of pointer hops, essentially free.

The problem is what comes next. To rank completions you must visit **every descendant** of that node and sort by frequency. For a rare prefix like `zyg` that's a few nodes. For `a`, it's a substantial fraction of the entire trie — potentially millions of nodes — on a request that must finish in under 100 ms. And `a` is far more common than `zyg`, so the slowest case is also the most frequent one.

### Precompute the answer at every node

Store the top `k` completions **on each node**, alongside the prefix it represents:

```
node("app") -> [("apple", 9M), ("application", 4M), ("appointment", 2M), ...]
```

Lookup becomes: walk `p` characters, read a list, return it. `O(p)` with a tiny constant, and it no longer matters whether the prefix is `a` or `zyg` — the work is identical. You have traded space and build time for a flat, predictable read.

The cost is storage. Every node carries `k` entries, and a trie over millions of terms has many nodes. Two standard mitigations:

- **Cap prefix length.** Nobody autocompletes on a 40-character prefix — by then they've typed the whole query. Storing top-k only for prefixes up to ~10–20 characters cuts node count sharply with no user-visible loss.
- **Store IDs, not strings.** Node lists hold term IDs; a separate table maps ID → string. This deduplicates the many copies of "apple" appearing in the lists at `a`, `ap`, `app`, and `appl`.

### Building and swapping

The trie is **immutable at serving time**. You never insert into a live trie — that would need locking on a structure being read thousands of times per second, and top-k lists would need recomputing up the path on every write.

Instead the pipeline builds a new trie offline and the serving tier swaps to it atomically: build into a new structure, load it, flip a pointer, let in-flight requests finish against the old one, free it. Readers never block, and a bad build can be rolled back by flipping the pointer back.

This is the design decision that makes the freshness relaxation pay off. Because suggestions may lag by minutes, you never need concurrent mutation — which removes the hardest problem from the serving path entirely.

### Sharding when it outgrows one machine

First, check whether it must. A trie over a few million terms with capped prefix length and ID-based lists is plausibly a few gigabytes — it fits in memory on one machine, and you replicate rather than shard. Replication is strictly easier: every replica holds the whole trie, any replica answers any query, and you scale reads by adding replicas.

Say that first. Sharding a trie is genuinely awkward, and reaching for it unprompted is a mistake.

If it truly doesn't fit, shard **by first character or first few characters** — queries starting `a–f` on shard 1, and so on. Every lookup touches exactly one shard because the prefix determines the shard.

The catch is that this hot-spots badly: far more queries start with `s` or `t` than with `x` or `z`. Balance by assigning ranges according to **measured query volume** rather than alphabet position, so a busy letter gets its own shard and a dozen quiet ones share another. That mapping comes from the same query logs the pipeline already aggregates.

### Caching in front

Prefix popularity follows a steep power law — a small set of prefixes covers a large share of traffic. A simple in-memory cache keyed by prefix, or even a CDN with a short TTL, absorbs most requests before they reach the trie.

Two details: cache the *short* prefixes hardest, since they're both hottest and (in a naive trie) most expensive; and keep TTLs short enough that a trie swap propagates promptly.

### Client-side savings

The cheapest request is one you never send. Two standard client behaviours cut load substantially:

- **Debounce.** Wait ~50–100 ms after the last keystroke before requesting. A fast typist entering eight characters generates two or three requests instead of eight.
- **Cache locally.** If the user typed `appl` and then `apple`, the browser already has results for `appl`; results for the longer prefix are a subset and can often be filtered locally while the network request is in flight.
