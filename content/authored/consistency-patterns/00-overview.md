---
version: 1
---

"Consistency" means two unrelated things in system design, and conflating them causes real confusion.

**ACID consistency** — the C in a database transaction — means a transaction moves the database from one valid state to another, respecting constraints like foreign keys and uniqueness. It's about integrity rules.

**Distributed consistency** — the C in CAP, and the subject of this topic — is about *what a reader sees* when data lives on more than one machine. If you write to one replica and read from another, do you get your new value or the old one?

The second is the one that shapes architecture. When someone says "eventually consistent", they mean the reader might see stale data for a while.

### The underlying problem

The moment you have more than one copy of a value — a replica, a cache, a CDN edge, a client-side store — those copies can disagree. Replication takes time. During that window, different readers see different answers.

You cannot eliminate this without eliminating the copies, and the copies exist for good reasons: availability, read throughput, and locality. So the question is never "how do I avoid inconsistency" but **"how much inconsistency, for how long, and which readers notice?"**

The models that follow are answers of increasing strength and increasing cost.

### Reading the models

As you go through them, keep three practical questions in mind, because they're what an interviewer is really asking:

1. **Who notices?** Staleness a user sees in their *own* data is far more damaging than staleness in someone else's. Users have no reference for whether a friend's post is three seconds old; they know exactly what they just typed.
2. **What breaks?** A stale like count is invisible. A stale inventory count oversells the last unit. A stale permission check is a security incident. The tolerance is set by the data, not by taste.
3. **What does it cost?** Stronger consistency means coordination, and coordination means latency — a round trip to a quorum on every operation, and unavailability when that quorum can't be reached.

### The spectrum in one line each

- **Weak** — no guarantee that a read ever returns the write. Fine for live video or telemetry, where the current value matters and history doesn't.
- **Eventual** — given no new writes, all replicas converge. Reads may be stale for a bounded-in-practice window. The default for large-scale systems.
- **Strong** — every read returns the most recent write. Simple to reason about, expensive to provide, and required wherever correctness depends on the value.

The primer material that follows covers each in turn. The section after it deals with what production systems actually do, which is rarely to pick one globally and usually to mix them per operation — plus the targeted fixes, like read-your-own-writes, that address the specific staleness users complain about without paying for strong consistency everywhere.
