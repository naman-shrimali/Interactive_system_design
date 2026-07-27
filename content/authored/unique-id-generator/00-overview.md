---
version: 1
---

Every system that stores things needs to name them. On one database that's solved: `AUTO_INCREMENT` hands you 1, 2, 3, and the database guarantees no two rows collide. The moment you have more than one database, that guarantee evaporates — two shards will both cheerfully hand out ID `1000`.

So the question becomes: how do you generate identifiers that are unique across many machines, without those machines coordinating on every single insert?

### What we actually want

The requirements are usually tighter than "unique," and the extra constraints are what make it interesting:

- **Globally unique** — no collisions, ever, across every node.
- **Roughly sortable by time** — so that ordering by ID approximates ordering by creation, letting you paginate a feed or timeline without a secondary index on `created_at`.
- **Compact** — 64 bits ideally, so IDs fit in a `BIGINT` and stay cheap in every index that references them.
- **High throughput, low latency** — tens of thousands per second per node, generated locally, with no network round trip on the hot path.
- **No single point of failure** — if the ID service is down, writes stop. That makes it critical infrastructure.

The tension is between the second and the fifth. Time-sortability wants a shared notion of order; no-coordination wants nodes to act alone. Every design in this topic is a different compromise between those two.

### The shape of the solutions

There are four common answers, and each fails a different requirement:

- **UUID v4** — 128 random bits. Perfectly decentralized, collision probability negligible, but not sortable and twice the size. Random UUIDs as a primary key also scatter B-tree inserts across the whole index, which hurts write throughput badly.
- **Ticket server** — one database whose only job is handing out numbers. Simple, sortable, compact; also a single point of failure and a hard throughput ceiling.
- **Database with stride** — N databases handing out `1, 1+N, 1+2N…`. Removes the SPOF, but adding a machine is painful and IDs are only loosely ordered.
- **Snowflake-style** — pack a timestamp, a machine ID, and a per-millisecond sequence number into 64 bits. Sortable, compact, no coordination on the hot path. This is what most large systems converge on, and it's what the deep dive builds bit by bit.

Snowflake's cost is that it makes you care about clock skew — the one failure mode that turns a clever scheme into duplicate IDs. We'll cover that too.
