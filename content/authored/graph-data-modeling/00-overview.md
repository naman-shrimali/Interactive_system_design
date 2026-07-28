---
version: 1
---

A social graph is people and the relationships between them. Storing the people is easy — that is a normal table. Storing the *relationships*, and querying across them at scale, is where it gets interesting.

### The queries define the problem

- "Who does Alice follow?" — one hop, and by far the most common.
- "How many followers does Bob have?" — a count, potentially enormous.
- "Do Alice and Bob have friends in common?" — an intersection across two sets.
- "How is Alice connected to Zoe?" — a shortest path, potentially unbounded.

The first is trivially cheap and the last is potentially catastrophic, and they run against the same data. Most of the design consists of making the common query fast while ensuring the expensive ones cannot take the system down.

### Why an edge is awkward

A relationship belongs to two people who may live on different machines. That single fact causes most of the difficulty:

- **Sharding by user scatters the graph.** Hashing user IDs deliberately destroys locality, so a traversal jumps between shards at every hop.
- **A traversal cannot name its shard in advance.** It learns where to go next only after reading the previous hop — the opposite of what sharding needs.
- **Degree is wildly uneven.** Most accounts have hundreds of edges; some have tens of millions. Any design assuming uniform degree will fail on the accounts that matter most.

### The shape of the answer

**Denormalise the adjacency list.** Store each user's followees (and followers) as a list on their own record, so the one-hop query is a single read rather than a join. Storage is cheap; cross-shard reads are not. This is the single highest-leverage decision.

**Accept bidirectional duplication.** "Who follows me" and "who I follow" are different access patterns, so both are stored, and a new relationship writes two records. Writes cost more; the reads that dominate get cheaper.

**Cap traversal depth at the API.** Friends-of-friends is a product feature. Unbounded traversal is a denial-of-service vector pointed at your own database, and it should not be expressible.

**Treat high-degree nodes as a separate case.** Replicating a very-high-degree account onto every shard keeps traversals through it local. This is the same celebrity asymmetry as the news feed — and the same resolution: handle the small expensive set differently rather than making everyone pay for it.

### Graph database or not?

If deep traversal is genuinely core to the product, a purpose-built graph database is the honest answer — index-free adjacency is exactly what those systems optimise for.

If the workload is really "one hop, at enormous scale" — which describes most social products most of the time — a sharded relational or key-value store with denormalised adjacency lists is simpler to operate and scales further. Say which workload you are designing for before naming a technology; that framing is the answer interviewers are listening for.
