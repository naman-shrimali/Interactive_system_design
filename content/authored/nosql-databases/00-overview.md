---
version: 1
---

"NoSQL" names what these systems are not, which is unhelpful. What they share is a deliberate trade: give up some guarantee a relational database provides — usually joins, transactions across records, or a fixed schema — in exchange for something the workload needs more, usually horizontal scale or a data model that fits better.

The question is never "SQL or NoSQL" in the abstract. It is *which guarantee am I giving up, and what am I getting for it?*

### The four families

**Key-value.** `get(key)` and `put(key, value)`. The simplest possible interface, and that simplicity is exactly what allows keys to be hashed and scattered across any number of machines. Ideal for caches, sessions, and anything with a natural single-key access pattern. You give up querying by anything except the key.

**Document.** Key-value where the value is structured and the database can index inside it. Fits data that is naturally nested and read as a unit — a product with its variants, a user with their preferences. Flexible schema helps when shape varies per record, and hurts when you assumed a field was always present.

**Column-family (wide-column).** Rows partitioned by key and clustered by another column, so related rows sit physically together. Built for enormous write volume and queries that read a contiguous range within one partition — exactly the shape of message history or time series. This is what you reach for when the access pattern is "the most recent N for this key".

**Graph.** Nodes and edges as first-class citizens, with index-free adjacency so traversal is pointer-chasing rather than joining. Right when relationships are the thing being queried, not just represented.

### The property they mostly share

Horizontal scale by partitioning. Because the interface avoids joins and cross-record transactions, data can be split across machines without needing coordination on every operation. That is the source of the scale — and the source of what you gave up. They are the same decision seen from two sides.

Many of these systems also offer **tunable consistency**, so the CAP trade becomes a per-operation setting rather than a property of the database. That is covered in the key-value store topic.

### Choosing honestly

Model your access patterns first, then pick the store that serves them. In a relational database you model the data and figure out queries later; in most NoSQL stores the access pattern *is* the schema, and getting it wrong is expensive to change because there is no ad-hoc query to fall back on.

Two things worth saying out loud in an interview:

- **Polyglot persistence is normal.** Orders in Postgres, sessions in Redis, message history in Cassandra, search in an index. Each store serves the workload it fits. What you are choosing is not one database but a boundary for each kind of data.
- **The default should still be relational** unless something specific argues otherwise. Reaching for a distributed store you do not need costs you transactions, joins and four decades of operational knowledge, and buys capacity you were not going to use.

The primer material that follows covers each family in detail and offers a decision procedure for SQL versus NoSQL that survives follow-up questions.
