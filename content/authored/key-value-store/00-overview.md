---
version: 1
---

We're designing a distributed key-value store: `put(key, value)` and `get(key)`, spread across many machines, surviving node failures without losing data or refusing service.

It's a favourite interview question because it has nowhere to hide. There is no product complexity to talk around — just the core distributed systems problems, in the open: how do you split data across nodes, how many copies do you keep, what happens when copies disagree, and how do you detect that a node has died.

### Scoping it

- **Interface:** `get(key)` and `put(key, value)`. No range scans — that constraint is what lets you hash keys and scatter them.
- **Value size:** small, say under 10 KB. Large values push you toward object storage with the KV store holding pointers.
- **Scale:** big enough that the data does not fit on one machine, which is the only reason to build this at all.
- **Availability:** high — the system should keep serving through single-node failures without operator intervention.
- **Consistency:** tunable. Some callers need the newest value; most would rather have a fast answer.

The last point is the one worth agreeing early, because "strongly consistent" and "always available" pull in opposite directions the moment the network misbehaves.

### The four problems

Everything in this topic is one of these:

**Partitioning.** Which node holds which key? Modulo hashing collapses when the node count changes, so the answer is consistent hashing with virtual nodes — covered in its own topic, and worth naming rather than re-deriving.

**Replication.** How many copies, and where? Walk the ring clockwise from the key's position and take the next `N` **distinct** physical nodes, skipping positions belonging to a node already chosen, and preferably spanning racks or availability zones. Three copies in one rack is one power event away from zero copies.

**Consistency.** With `N` copies, how many must respond before you answer? This is the quorum dial, and it's the next section.

**Failure detection and repair.** Nodes die, and the system must notice without a central monitor. Gossip spreads membership and health; temporary failures are absorbed by hinted handoff (a peer holds writes for the absent node and forwards them on recovery); permanent divergence is found by comparing Merkle trees between replicas so only differing ranges are transferred rather than the entire dataset.

### The shape of the answer

A Dynamo-style design has **no primary**. Every node knows the ring, so any node can coordinate any request — which removes the single point of failure and the failover machinery a primary would require.

The cost is that conflicts become possible: two clients can write the same key through different coordinators during a partition. That's why these systems carry versioning (vector clocks) to detect concurrent updates, and a resolution policy — last-write-wins for data that tolerates loss, or returning both versions and letting the application decide.

Say that trade-off out loud. Choosing no primary is choosing to handle conflicts, and pretending otherwise is the most common gap in an answer to this question.
