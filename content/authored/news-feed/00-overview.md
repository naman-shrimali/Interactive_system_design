---
version: 1
---

A news feed shows you recent posts from the accounts you follow, newest or most relevant first. Every social product has one, and the design question is always the same: **when do you assemble it?**

### Scoping it

- **Publish:** a user posts; their followers should see it.
- **Read:** a user opens the app and gets a page of their feed, then scrolls for more.
- **Scale:** say 150 million daily active users, two posts each per day, and reads outnumbering writes by roughly 100:1.
- **Ordering:** reverse chronological to start. Ranking is a natural follow-up, and it belongs at read time.
- **Freshness:** seconds of delay is fine. Nobody can tell whether a post arrived instantly or four seconds ago, and admitting that buys a great deal of architectural room.

Those numbers give ~3,000 writes/sec and ~300,000 reads/sec. **Two orders of magnitude more reads than writes** is the single most design-relevant fact, and it argues for doing work at write time so reads stay cheap.

### The central decision

Assemble the feed when someone **posts** (fan-out on write) or when someone **reads** (fan-out on read).

Push precomputes every follower's feed, making reads a single lookup and writes cost O(followers). Pull stores the post once and merges at read time, making writes trivial and reads expensive. Given a 100:1 read ratio, push is the obvious starting point — until you meet an account with ten million followers, at which point one post becomes ten million writes and delays everyone else's.

The resolution is a hybrid, and the deep dive works through it. What matters is recognising that **the pathological case is a small, identifiable set of accounts**, so it can be handled by a different mechanism rather than making every user pay for it. That pattern — special-case the expensive minority — recurs throughout system design.

### The parts that come with it

**Feed storage.** Precomputed feeds are lists of post IDs per user, held in a cache. The posts themselves are stored once and hydrated at read time, so a post edited or deleted does not require rewriting millions of feeds.

**Pagination.** Offset pagination breaks on a feed, because new posts arrive between page loads and shift the offset — users see duplicates or gaps. Cursor pagination ("everything after this ID") is stable under insertion, and roughly time-sortable IDs are what make it work.

**Ranking.** A ranked feed scores a bounded candidate set at read time. Precompute the candidates; rank them per request. Ranking at write time would mean re-ranking every follower's feed whenever any signal changes.

**Media.** Posts reference images and video held in object storage behind a CDN. The feed carries pointers, never bytes.
