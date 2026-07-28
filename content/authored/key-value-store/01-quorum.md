---
version: 1
---

With `N` replicas of every key, each operation chooses how many replicas must respond. That choice is the consistency dial, and it's set per operation rather than per database.

### The rule

- `N` — replicas per key
- `W` — replicas that must acknowledge a write before it's confirmed
- `R` — replicas that must respond to a read

```
R + W > N   ⟹   strong consistency
```

The reasoning is a pigeonhole argument: if the write set and the read set together exceed the number of replicas, they must overlap on at least one node. That node saw the latest acknowledged write, so the read cannot miss it.

With `N = 3`:

| R | W | Behaviour |
|---|---|---|
| 1 | 1 | fastest both ways; eventually consistent (2 ≯ 3) |
| 2 | 2 | strongly consistent, tolerates one node down either way — the usual default |
| 1 | 3 | fast reads, writes fail if any replica is down |
| 3 | 1 | fast writes, reads fail if any replica is down |

`R = W = 2` is the common choice because it satisfies the inequality *and* survives a single failure on both paths. `W = 3` looks safer and is worse: one unavailable replica blocks every write.

### Latency is set by the k-th fastest, not the slowest

A quorum write waits for `W` acknowledgements, not all `N`. With `W = 2` of 3, the coordinator returns as soon as the *second* replica responds — so one slow node doesn't slow the system. That is a quiet but significant advantage over waiting for every replica, and it's why quorums tolerate stragglers gracefully.

### When replicas disagree

Quorums guarantee you *see* the newest write; they don't prevent divergence. Two clients writing the same key through different coordinators during a partition produce two versions with no ordering between them.

**Vector clocks** detect this. Each write carries a per-node counter; comparing two versions tells you whether one descends from the other (keep the newer) or whether they're genuinely concurrent (a real conflict). The value is the *detection* — knowing you have a conflict rather than silently discarding one side.

Resolution is then a policy decision:

- **Last-write-wins** by timestamp — simple, and it silently destroys one of the two updates. It also depends on clocks agreeing, which they don't. Acceptable for a cache; risky for user data.
- **Return both** and let the application merge, the way a shopping cart unions its items.
- **CRDTs**, where the merge is defined so concurrent updates always converge without coordination.

### Repair

Divergence must be actively fixed or "eventual consistency" never arrives:

- **Read repair** — when a read surfaces replicas with differing versions, the coordinator returns the newest and updates the stale ones in the background. Free, but only fixes keys that are actually read.
- **Hinted handoff** — a write destined for a node that's down is held by a peer with a hint, and forwarded when it returns. Covers short outages without dropping writes.
- **Anti-entropy with Merkle trees** — replicas exchange a hash tree of their key ranges and descend only where hashes differ, so a full comparison transfers a handful of hashes rather than the whole dataset. This is what catches keys nobody reads.

### Saying it well

The strong version of this answer connects the dial to the product: *"Reads of a user's own cart use R = 2 so they always see their last write; the recommendations cache reads at R = 1 because a stale suggestion is invisible and latency isn't."* Same store, two settings, each justified by what breaks when the data is stale.
