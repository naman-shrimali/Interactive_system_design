---
version: 1
---

CAP is the most cited and most misquoted result in distributed systems. The popular version — "pick two of consistency, availability, partition tolerance" — is misleading enough to produce bad designs.

### Why "pick two" is wrong

Partition tolerance is not a choice. A network partition is two parts of your system being unable to reach each other, and that happens whether or not you planned for it: a switch fails, a cable is cut, a datacenter link saturates, a routing change goes wrong. If your system spans more than one machine, partitions will occur.

So "CA" — consistent and available but not partition tolerant — is not an option you can select. It describes a single-node system, or a system that will simply be wrong when the network misbehaves.

The accurate statement is narrower and more useful:

> **When a partition occurs, you must choose between consistency and availability.**

That's it. CAP says nothing about the overwhelming majority of the time when the network is healthy. It describes the behaviour of your system during a specific failure.

### The actual choice

Picture two replicas, `A` and `B`, and the link between them fails. A write arrives at `A`. `A` cannot reach `B`, so it cannot know whether `B` will serve a stale read.

- **Choose consistency (CP):** refuse the write, or refuse reads on `B`, until the partition heals. Every response you give is correct; some requests get no response at all. A banking ledger behaves this way — a rejected transfer is annoying, a double-spend is a catastrophe.
- **Choose availability (AP):** accept the write on `A` and let `B` serve stale data, reconciling later. Every request gets an answer; some answers are out of date. A social feed behaves this way — showing a slightly stale timeline is fine, showing an error page is not.

Both are legitimate. The question is what your product does when it cannot be both, and answering that concretely is what an interviewer is listening for.

### It's a per-operation decision, not a per-database one

Labelling a database "AP" or "CP" is a simplification that hides the interesting part. Real systems tune this per operation:

- Cassandra is usually described as AP, but a quorum read/write gives you strong consistency for the operations that need it, at higher latency and lower availability.
- DynamoDB offers eventually consistent reads by default and strongly consistent reads on request — the same store, two answers, chosen per call.

Within one product, the choice differs by feature. In an e-commerce system, adding to a cart should stay available under partition — losing a cart addition loses a sale. Decrementing the last unit of inventory should favour consistency — overselling costs money and trust. Same system, opposite answers, and saying so demonstrates you understand the theorem rather than reciting it.

### Where it actually bites

The trap in an interview is invoking CAP for something it doesn't cover. CAP is about **partitions**. If your problem is a slow replica, a hot shard, or a cache serving stale data under normal operation, that's not CAP — that's replication lag or cache invalidation, and calling it CAP signals a memorised answer.

The next section covers PACELC, which extends the model to the case that actually dominates your operational life: the network is fine, and you still have to choose between latency and consistency on every single request.
