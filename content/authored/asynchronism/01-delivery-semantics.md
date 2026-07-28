---
version: 1
---

Every queue makes a promise about how many times a message is delivered. Understanding which promise you have — and which you can actually get — is what separates a working async system from one that quietly double-charges customers.

### The three guarantees

**At-most-once.** The message is delivered zero or one times. Fast, no acknowledgement bookkeeping, and messages are lost when a consumer crashes mid-processing. Acceptable only for data where loss is tolerable — metrics samples, some telemetry.

**At-least-once.** The message is delivered one or more times. The consumer acknowledges after processing; if it crashes before acknowledging, the message is redelivered. Nothing is lost, and **duplicates happen**. This is what almost every production system uses.

**Exactly-once.** Delivered precisely once. What everyone wants and what, across a network boundary, cannot be provided in general.

### Why exactly-once isn't real

The failure that makes it impossible: a consumer processes a message and crashes before acknowledging. The broker cannot distinguish "processed but didn't ack" from "never processed". It must choose — redeliver (at-least-once, risking duplicates) or not (at-most-once, risking loss). There is no third option, because the information needed to decide was lost with the consumer.

Systems advertising exactly-once are being precise about a narrower claim: **exactly-once *processing* within a closed system**, achieved by making the consumer's write and its offset commit atomic — Kafka's transactional producer does this across Kafka topics. The moment your side effect leaves that system — an HTTP call, a payment, an email — the guarantee ends.

The correct answer in an interview is: *at-least-once delivery plus idempotent processing gives exactly-once semantics in effect.* That sentence demonstrates you understand the boundary rather than repeating a marketing claim.

### Idempotency in practice

Idempotent means processing the same message twice has the same effect as once. Ways to get there:

**Natural idempotency.** `SET status = 'shipped'` is idempotent; `balance = balance - 10` is not. Where you can express the operation as a set rather than an increment, do.

**Deduplication by key.** Every message carries a unique ID; the consumer records processed IDs and skips repeats. The check must be atomic with the work — a conditional insert, not read-then-write, or two concurrent consumers both pass the check. The store needs a retention window (long enough to cover the redelivery horizon) and it becomes a dependency of every consumer.

**Conditional writes.** Include an expected version and reject if it doesn't match. The second delivery fails harmlessly.

**Upserts.** `INSERT … ON CONFLICT DO UPDATE` collapses repeats naturally.

### Ordering

Most queues guarantee ordering only within a partition or a single consumer. Parallelism and global ordering are fundamentally in tension: if two consumers process concurrently, you cannot know which finishes first.

The standard resolution is **partition by a key** — all events for one user, order, or conversation go to the same partition and are therefore ordered relative to each other, while different keys process in parallel. That's per-key ordering with parallelism across keys, which is almost always the actual requirement.

Watch for the hot-partition consequence: one very active key concentrates on one consumer and becomes the bottleneck. The same trade-off as sharding, for the same reason.

Where you can, design so ordering doesn't matter — commutative operations and messages carrying absolute state rather than deltas both remove the requirement.

### Failure handling

**Retry with exponential backoff and jitter**, exactly as in the notification system — immediate retries hammer a struggling dependency, and unjittered retries synchronise across consumers.

**Dead-letter queues** for messages that exhaust retries. Without one, a poison message either blocks its partition forever or is silently dropped. A DLQ preserves it for inspection and replay after a fix, and a growing DLQ is a high-quality alert.

**Visibility timeouts.** While a consumer holds a message, it's hidden from others. Too short and a slow job is redelivered while still being processed — a duplicate you caused yourself. Too long and a crashed consumer's message is stuck. Set it above your p99 processing time and extend it explicitly for long jobs.

### What to monitor

- **Queue depth and its trend** — the leading indicator of everything.
- **Consumer lag** — how far behind the head consumers are.
- **Message age at processing** — reveals a backlog that depth alone can hide.
- **DLQ size** — anything above zero deserves attention.
- **Redelivery rate** — a spike means consumers are crashing or timing out.
