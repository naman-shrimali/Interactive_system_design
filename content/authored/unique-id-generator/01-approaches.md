---
version: 1
---

Four designs, each failing a different requirement. Walking through them in order is a good interview answer because each failure motivates the next.

### 1. Database auto-increment

One table, `AUTO_INCREMENT`, done. IDs are compact, perfectly ordered, and trivially understood.

It breaks the moment you have more than one database. Two shards both start at 1 and collide immediately. Even with one database, every insert now waits on that database, so your ID generator has the write throughput of a single machine and fails when it does.

Fine for a single-node application. Not an answer to this question.

### 2. UUID version 4

122 random bits. Any machine generates one locally with no coordination and no network call, and collisions are negligible — you would need on the order of 10²² UUIDs before a collision becomes likely.

Two real problems:

**Size.** 128 bits versus 64. That's twice the storage in the primary key and in *every* index and foreign key referencing it. On a large table this is measured in gigabytes of extra index, which means less of the index in memory, which means more disk reads.

**Random inserts destroy write performance.** This is the one that surprises people. A B-tree index on a random key scatters every insert to a random leaf page. Sequential IDs append to the rightmost page, which stays hot in memory; random IDs touch a different cold page each time, causing page splits and heavy write amplification. On a large InnoDB table the difference between sequential and random primary keys is routinely several times the insert throughput.

**And no time ordering.** You can't sort by ID to get creation order, so you need a separate `created_at` index and a tiebreaker for equal timestamps.

UUIDv7 fixes the ordering problem by putting a millisecond timestamp in the leading 48 bits, keeping inserts roughly sequential. It's a genuine improvement and worth naming — but it's still 128 bits.

### 3. Ticket server

One dedicated database whose only job is handing out numbers — a single table with an auto-increment column that services call to get the next block.

IDs stay compact and ordered, and application databases are freed from the constraint. Flickr famously used this approach with two ticket servers to avoid a single point of failure.

The problems are structural: it's a network hop on the write path, and it's a single point of failure. Run two servers with odd and even offsets and you have redundancy but only two machines' worth of throughput, and reasoning about ordering across them gets muddy.

The mitigation that makes this viable is **batching**: a service requests 1,000 IDs at once and hands them out locally. Round trips drop by 1,000×, and the cost is gaps in the sequence when a service restarts with unspent IDs — usually harmless.

### 4. Multi-master with stride

Give each of `N` databases a different starting offset and increment by `N`: with two servers, one produces 1, 3, 5… and the other 2, 4, 6…

No coordination, no single point of failure, compact IDs. But adding a server means changing the stride, which is painful and error-prone, and IDs are only *loosely* time-ordered — server 1 might be ahead of server 2 at any moment, so ID order doesn't reliably reflect creation order across servers.

### 5. Snowflake

Pack meaning into the 64 bits instead of drawing them at random: a timestamp, a machine identifier, and a per-millisecond sequence number.

Because the timestamp occupies the high bits, IDs sort by time. Because each machine has its own identifier, no two machines can collide. Because there's a per-millisecond counter, one machine can produce many IDs within the same millisecond. And because all three are known locally, generation is a few arithmetic operations with **no network call at all**.

That combination — 64 bits, time-sortable, no coordination on the hot path — is why it's the design most large systems converge on, and it's what the next section builds bit by bit.

### Comparison

| Approach | Size | Time-sortable | Coordination | Notes |
|---|---|---|---|---|
| Auto-increment | 64b | yes | single DB | doesn't scale past one node |
| UUIDv4 | 128b | no | none | index-hostile writes |
| UUIDv7 | 128b | yes | none | fixes ordering, still 128b |
| Ticket server | 64b | yes | network hop | SPOF; batch to survive |
| Multi-master stride | 64b | loosely | none | painful to resize |
| Snowflake | 64b | yes | none on hot path | needs machine IDs and a clock |
