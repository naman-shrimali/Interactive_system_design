---
version: 1
---

CAP describes behaviour during a partition. Partitions are rare. PACELC extends the model to cover the other 99.9% of the time, and in doing so describes the trade-off you actually make on every request.

### The formulation

> **If** there is a **P**artition, choose between **A**vailability and **C**onsistency;
> **E**lse, choose between **L**atency and **C**onsistency.

The second clause is the addition, and it's the one with daily consequences.

### Why latency and consistency trade off

Consistency across replicas requires communication. If a write must be acknowledged by a quorum before you confirm it, the write takes at least one round trip to the slowest quorum member. Same-datacenter that's a millisecond; across regions it's 100+ ms, every time, with no partition involved.

You can have the write confirmed locally and propagated in the background — fast, and briefly inconsistent. Or you can wait for agreement — consistent, and slower. The network being healthy doesn't remove the choice; it just changes the cost from "unavailable" to "slower".

This is why PACELC is the more practically useful lens. Most engineers will spend their careers tuning the `ELC` half and encounter the `PAC` half a handful of times.

### Classifying systems

| System | Partition | Else | Reading |
|---|---|---|---|
| Cassandra, Dynamo | **PA** | **EL** | available under partition, low latency otherwise — consistency is opt-in via quorum |
| HBase, Bigtable | **PC** | **EC** | consistent always, paying latency and availability for it |
| MongoDB | **PC** | **EC** by default | consistent by default; reads can be relaxed to secondaries |
| MySQL async replication | **PC** on the primary | **EL** | primary is authoritative; replicas trade consistency for read latency |

Note MySQL with async replicas: it's usually thought of as a strongly consistent database, yet reading from a replica is an explicit latency-over-consistency choice — the classic "user updates their profile, refreshes, sees the old value" bug. That bug *is* PACELC's `EL` branch, and recognising it as a deliberate trade rather than a defect is the practical payoff of the model.

### Reasoning with it

When you propose a datastore, state both halves:

> "I'd use Cassandra here — PA/EL. Under partition it keeps accepting writes, which suits an activity feed where availability matters more than every reader seeing the newest item. Normally it gives low-latency local reads, and where I need strong consistency — say the follower count that gates a paid tier — I'd use a quorum read on that specific query and accept the extra round trip."

That sentence demonstrates more understanding than any recitation of the theorem, because it commits to behaviour under two distinct conditions and identifies an exception.

### Practical middle ground

Real systems soften the binary in ways worth naming:

- **Tunable consistency.** `R + W > N` gives strong consistency from an eventually consistent store, per operation. Set `W=1` for fast writes on data that tolerates it and quorum for data that doesn't.
- **Read-your-own-writes.** The common complaint is a user not seeing their *own* change. Route a user's reads to the primary (or to the replica that acknowledged their write) for a short window afterwards. Cheap, and it fixes the case users actually notice — a good answer when someone asks "but won't eventual consistency confuse people?"
- **Monotonic reads.** Pin a session to one replica so a user never sees time appear to run backwards.
- **Bounded staleness.** Accept stale reads, but never more than *n* seconds stale — often the honest requirement.

### Interview checklist

- Correct "pick two" to **"partition tolerance isn't optional; under partition you choose C or A."**
- Give the choice a **product justification**, not a technical one: what does the user experience when we pick each?
- Show it's **per-operation** — cart versus inventory in the same system.
- Introduce **PACELC** and note the `ELC` branch is the one you tune daily.
- Offer **read-your-own-writes** as the targeted fix for the complaint eventual consistency actually generates.
- Don't invoke CAP for replication lag or cache staleness — those aren't partitions.

**Key numbers:** same-datacenter round trip ~0.5 ms · cross-region ~100–150 ms per consistency round trip · `R + W > N` for quorum consistency.
