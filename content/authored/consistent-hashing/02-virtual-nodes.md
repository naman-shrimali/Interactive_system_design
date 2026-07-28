---
version: 1
---

A plain ring places each server at exactly one point. Virtual nodes place each server at *many* points, and that single change fixes both the imbalance and the failure-hotspot problem.

### The idea

Instead of hashing `"cache-00"` once, hash it with a replica index appended:

```
for i in 0 .. V-1:
    position = hash("cache-00#" + i)
    ring.insert(position, "cache-00")
```

Each physical server now occupies `V` positions — its **tokens** or **virtual nodes**. Lookup is unchanged: walk clockwise, find a position, map it back to the physical server that owns it.

The effect is statistical. One server owning one arc is a sample size of one, and one sample can be badly wrong. One server owning 200 arcs scattered around the circle is a sample of 200, and the total width of those arcs converges tightly on its fair share.

### How many tokens?

The imbalance shrinks roughly with the square root of the token count: relative standard deviation of load falls in proportion to `1/√V`. Concretely:

| Tokens per server (`V`) | Approximate load spread |
|---|---|
| 1 | wildly uneven — 2× to 4× differences are ordinary |
| 10 | roughly ±30% |
| 100 | roughly ±10% |
| 1000 | roughly ±3% |

The knee of that curve sits around 100–200, which is why implementations cluster there. The cost of more tokens is memory and lookup time: the sorted structure holds `N × V` entries, so 500 servers at 200 tokens each is 100,000 entries — trivial in RAM, but the ring is also gossiped between nodes, and a larger ring is a larger message on every membership change.

Cassandra historically defaulted to 256 tokens per node; more recent versions use far fewer — around 16 — paired with an allocation algorithm that *chooses* positions to balance the ring rather than picking them randomly. That's the general trajectory: random placement needs many tokens to behave, deliberate placement needs few.

### The second payoff: failure spreads out

This is the benefit that matters more in production than the tidier load distribution.

With one token per server, losing a server dumps its entire key range onto exactly one neighbour. That neighbour's load roughly doubles, its cache hit rate collapses because it's suddenly serving keys it has never seen, and it becomes the next thing to fall over. A one-node failure has a plausible path to a cascade.

With 200 tokens, that server's 200 arcs each pass to whichever server follows them — and those successors are scattered across the whole cluster. In a 20-node cluster, the dead node's load lands on roughly all 19 survivors, about 5% extra each. Nobody notices.

The same works in reverse when a node joins: it pulls a little data from many peers in parallel rather than draining one, so warming up is faster and no single donor is saturated.

### Weighting heterogeneous hardware

Tokens also give you capacity weighting for free. A machine with twice the RAM gets twice the tokens, and takes about twice the keys. Without virtual nodes you'd have no dial at all — arc width is whatever the hash function decided.

This matters during hardware transitions, when a cluster contains two or three generations of machine at once and you want the new ones carrying proportionally more.

### Where it gets subtle

Two implementation details reliably cause bugs:

**Replica placement must skip duplicates.** As noted earlier, walking clockwise for `R` replicas can return the same physical server repeatedly, since it holds many positions. Skip positions whose physical server is already in the preference list. Production systems extend this to rack and availability-zone awareness, so replicas are physically separated — otherwise you have three copies that all die together.

**Token assignment must be stable across restarts.** Positions derive from the server's identity, so that identity must be durable. If a node re-registers under a new name after a reboot, it lands in entirely different places and triggers a full reshuffle — the exact churn consistent hashing exists to prevent. Systems either persist the token list or derive it from a stable identifier that survives replacement.
