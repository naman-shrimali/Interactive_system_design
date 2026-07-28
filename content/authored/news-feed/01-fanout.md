---
version: 1
---

The central decision in any feed system: do you assemble a user's timeline when someone posts, or when the user reads it? Everything else follows.

### Fan-out on write (push)

When someone posts, immediately insert the post into the precomputed feed of every follower.

**Reads become trivial** — a user's feed already exists, so serving it is one cache lookup with no joins and no merging. For a product where reads vastly outnumber writes, that's the right place to put the cost.

**Writes become expensive.** One post becomes N writes, where N is the follower count. For a typical user with a few hundred followers that's nothing. The work is done asynchronously by workers pulling from a queue, so the author's request returns immediately.

### Fan-out on read (pull)

Store the post once. When a user opens their feed, fetch recent posts from everyone they follow and merge.

**Writes are trivial** — one insert regardless of follower count. **Reads are expensive** — fetching from hundreds of sources and merging on every feed load, which is the operation users perform constantly.

Pull also wins on freshness (nothing to propagate) and storage (no duplication), and it handles a user who follows thousands of accounts without a precomputation explosion.

### The celebrity problem

Push breaks on one specific case: an account with ten million followers posts, and that single action becomes ten million writes. The fan-out workers saturate, the queue backs up, and *everyone else's* posts are delayed behind it. The system's worst case is triggered by its most visible users.

Pull has the mirror problem: a user following 5,000 accounts makes feed assembly slow for them specifically.

### The hybrid, which is what real systems do

Push for ordinary accounts; skip fan-out entirely for the small set of very-high-follower accounts and merge their recent posts in at read time.

The result: most users get a fully precomputed feed and pay nothing extra. A read then costs one cache lookup plus a small merge from the handful of celebrity accounts that user follows. The expensive case is handled by the mechanism that scales with it, and neither pathology occurs.

The threshold is a tuning parameter — say, accounts above 100,000 followers — and it needs to be adjustable without a deploy, because the right value changes as the product grows.

| | Push | Pull | Hybrid |
|---|---|---|---|
| Read cost | one lookup | fetch + merge N sources | lookup + small merge |
| Write cost | O(followers) | O(1) | O(followers) for most |
| Freshness | propagation delay | immediate | mixed |
| Celebrity posts | pathological | fine | fine |
| High-follow users | fine | slow reads | fine |

### Ranking, and where it goes

A purely chronological feed is a merge. A ranked feed scores candidates on engagement signals, recency and affinity.

The important structural point: **ranking belongs at read time, on a bounded candidate set.** Precompute the *candidates* (the fan-out above), then score a few hundred of them when the feed is requested. Ranking at write time means re-ranking every follower's feed whenever any signal changes, which is unbounded work.

This is the same shape as the autocomplete design — precompute the expensive candidate generation, do the cheap personalised step per request.

### Pagination

Offset pagination breaks on a feed: new posts arrive between page loads, so `OFFSET 20` shifts and users see duplicates or gaps. Use **cursor pagination** — "give me items after this ID" — which is stable under insertion. The roughly-sortable IDs from the unique-ID topic are exactly what makes this work.
