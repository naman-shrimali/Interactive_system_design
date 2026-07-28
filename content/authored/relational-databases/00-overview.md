---
version: 1
---

The default answer to "where does this data live?" should be a relational database, and you should be able to say why rather than treating it as a lack of imagination.

### What you get

**ACID transactions.** Multiple statements succeed or fail together. Moving money between accounts, decrementing inventory while creating an order — anything where a half-completed operation is a correctness bug rather than an inconvenience.

**A schema the database enforces.** Constraints, foreign keys and types are checked centrally, so a buggy service cannot write data that violates them. In a schemaless store those rules live in application code, which means they live in *every* application, and one of them will get it wrong.

**Ad-hoc queries.** SQL answers questions you did not anticipate when you designed the schema. That matters more than it sounds: most systems outlive the query patterns they were designed for, and a store optimised for today's access pattern can make tomorrow's question impossible.

**Four decades of operational knowledge.** Backup, replication, failover and query optimisation are solved and well documented. Choosing something exotic means becoming the person who understands its failure modes.

### How it scales, in order of cost

The sequence matters as much as the techniques, because doing them out of order is the most common form of over-engineering:

1. **Indexes and query tuning.** Free, and frequently the entire answer. A missing index is a far more common cause of a slow database than insufficient hardware.
2. **A bigger machine.** Unfashionable and genuinely effective. Modern hardware is enormous, and plenty of systems that "need" distribution need a larger instance.
3. **Read replicas.** Reads usually dominate, so send them to replicas. Buys read capacity, and introduces replication lag — which is where eventual consistency enters your product whether you planned it or not.
4. **Caching.** Absorbs repeated reads before they reach the database at all. Cheap, high leverage, and brings invalidation with it.
5. **Federation.** Split by feature — users on one database, orders on another. Reduces the load on each, and you can no longer join across the boundary.
6. **Denormalisation.** Duplicate data to avoid expensive joins. Trades write complexity and consistency risk for read speed.
7. **Sharding.** Split one table across machines. The last resort, because it breaks joins, transactions and global uniqueness — the guarantees you chose relational for in the first place.

### The honest framing

"Relational databases don't scale" is folklore. They scale a long way, and most systems never exhaust steps 1–4. What is true is that **the guarantees get expensive at the far end** — a distributed transaction across shards is genuinely costly, and that cost is what NoSQL systems trade away deliberately.

So the interesting question is never "SQL or NoSQL" in the abstract. It is: which of these guarantees does this data actually need, and what is the cheapest step that gets me the capacity I need while keeping them?
