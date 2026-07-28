---
version: 1
---

Consistent hashing is not free, and it is not the only scheme that minimises key movement. Knowing where it costs you — and what the alternatives are — is what separates a memorised answer from a designed one.

### What it costs

**Ring state has to be agreed on.** Every client needs the same view of which servers hold which tokens, or two clients will route the same key to different machines. That view is usually spread by gossip, which means it is *eventually* consistent: during a membership change there is a window where clients disagree. Systems tolerate this by making the storage layer forgiving — replicas, read repair, hinted handoff — rather than by trying to make membership instantaneous.

**Range scans stop working.** Hashing deliberately destroys key locality, so keys that are adjacent in your data model land on unrelated servers. `SELECT … WHERE user_id BETWEEN 100 AND 200` becomes a scatter-gather across the entire cluster. If range queries matter, you want range partitioning instead, and you accept the rebalancing pain that comes with it.

**Hot keys are untouched by any of this.** Consistent hashing balances *key count*, not *traffic*. One celebrity key still lands on one server, and that server still melts. The fixes are separate: replicate hot keys across several nodes, add a small per-key suffix to spread a hot key over `k` positions, or put a cache in front. Interviewers ask about this precisely because the ring looks like it solved load balancing and it didn't.

**Resharding still moves data.** `1/N` of keys is far better than `(N−1)/N`, but on a 50 TB cluster it is still hundreds of gigabytes crossing the network while the system serves traffic. Real deployments rate-limit that transfer.

### The alternatives worth naming

**Rendezvous hashing (highest random weight).** For each candidate server, compute `hash(key, server)` and pick the server with the highest value. No ring, no tokens, no virtual-node bookkeeping, and load distributes evenly by construction. When a server is removed, only the keys that ranked it first move — the same optimal guarantee the ring gives.

Its drawback is lookup cost: `O(N)` hashes per lookup versus `O(log N)` for a sorted ring. For tens of servers that is genuinely fine and rendezvous is the simpler, less bug-prone choice. For thousands, the ring wins. Rendezvous also handles weighting cleanly and gives you an ordered preference list for free — just take the top `R` servers by score.

**Jump consistent hash.** A tiny, elegant algorithm that maps a key to one of `n` buckets in `O(log n)` time with *no* memory at all — no ring structure to store or gossip. The catch is severe: buckets are numbered `0 … n−1` and it only supports growing or shrinking at the *end*. You cannot remove server 3 from the middle. That makes it excellent for sharding into a bucket count you control, and unusable for a cluster where arbitrary machines fail.

**Maglev hashing.** Builds a fixed-size lookup table so lookups are a single array index, with good balance and minimal disruption on failure. Designed for load balancers, where per-packet lookup cost dominates and membership changes are comparatively rare.

### Choosing

| Situation | Reach for |
|---|---|
| Cache or KV cluster, dozens to thousands of nodes, arbitrary failures | Consistent hashing with virtual nodes |
| Small cluster, want the simplest correct thing | Rendezvous hashing |
| Fixed shard count you control, no arbitrary removal | Jump consistent hash |
| Packet-rate lookups in a load balancer | Maglev |
| Range queries are a first-class requirement | Not hashing at all — range partitioning |

### Interview checklist

- Open with **why modulo fails** — the `(N−1)/N` remapping and the resulting cache stampede — before describing the ring. The problem motivates the solution.
- Say **virtual nodes** unprompted, and give both reasons: even distribution *and* spreading a failed node's load across the cluster rather than onto one neighbour.
- Note that replica placement walks clockwise for `R` **distinct** servers, and that rack/AZ awareness matters.
- Volunteer the **hot-key** limitation. It is the most common follow-up and getting there first shows you understand the boundary of the technique.
- Mention that ring membership is eventually consistent and that the storage layer absorbs the disagreement.
- If asked to simplify, offer **rendezvous hashing** and explain the `O(N)` versus `O(log N)` trade.

**Key numbers:** `1/N` of keys move per membership change · ~100–200 virtual nodes per server for random placement (far fewer with deliberate allocation) · load spread shrinks roughly as `1/√V`.
