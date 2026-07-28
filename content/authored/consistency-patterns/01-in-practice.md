---
version: 1
---

The three models are a spectrum, not a menu. Production systems mix them per operation and apply targeted fixes to the specific staleness users notice.

### Tunable consistency

A quorum system with `N` replicas, `W` acknowledgements required on write and `R` on read, gives strong consistency whenever:

```
R + W > N
```

The read and write sets are then guaranteed to overlap on at least one replica, so a read always sees the newest acknowledged write. With `N = 3`:

| R | W | Property |
|---|---|---|
| 1 | 1 | fast both ways, eventually consistent |
| 3 | 1 | fast writes, slow reads, strongly consistent |
| 1 | 3 | slow writes, fast reads, strongly consistent |
| 2 | 2 | balanced, strongly consistent — the usual choice |

`R=2, W=2` is the common default because it tolerates one replica being down on either path while staying strongly consistent.

The important part: **this is set per operation, not per database.** The same store can serve a profile read at `R=1` and an inventory decrement at `R=2`.

### Fixing the staleness users actually notice

Most complaints about eventual consistency are one specific complaint: *"I changed it and it didn't change."* Users have no expectations about the freshness of other people's data; they have absolute expectations about their own.

That means you rarely need global strong consistency — you need a few narrower guarantees:

**Read-your-own-writes.** After a user writes, route *that user's* reads to the primary (or to a replica known to have the write) for a short window. Implemented with a sticky session or by passing the write's version token on subsequent reads. Cheap, and it eliminates the majority of perceived inconsistency.

**Monotonic reads.** Pin a session to one replica so a user never sees data go backwards — the jarring case where a refresh shows an older state than the previous load, because the second request hit a laggier replica.

**Consistent prefix.** Guarantee that if writes happened in an order, readers see them in that order — never a reply before the message it answers.

**Bounded staleness.** "Stale by at most 5 seconds" is often the real requirement, and it's much cheaper than "never stale".

Naming these in an interview is more convincing than "we'll use eventual consistency", because it shows you know which staleness costs you something.

### Reconciling divergent copies

When replicas do disagree, something must decide the winner:

- **Last-write-wins** using a timestamp. Simple, and it silently discards concurrent updates — plus it depends on clocks agreeing, which they don't. Acceptable for a cache; dangerous for user data.
- **Vector clocks** detect that two updates were genuinely concurrent rather than ordered, so the system can say "these conflict" instead of guessing. Detection is the win; you still need a resolution policy.
- **CRDTs** are data structures whose merge is defined so that concurrent updates always converge without coordination — counters, sets, and collaborative text. The right answer when the data model fits.
- **Escalate to the user.** Keep both versions and let a human choose, as file sync does with conflicted copies. The correct answer when the system genuinely cannot know intent.

Background repair — read repair, anti-entropy, Merkle-tree comparison — is what drives the "eventually" in eventual consistency. Without it, replicas that miss a write stay wrong indefinitely.

### Choosing, by data type

| Data | Model | Why |
|---|---|---|
| Account balance, inventory, permissions | Strong | wrong answers cost money or breach security |
| Usernames, unique constraints | Strong | uniqueness needs coordination |
| Social feed, timeline | Eventual | staleness invisible; availability matters more |
| Like/view counts | Eventual, often approximate | nobody can tell 4,012 from 4,015 |
| Session data | Read-your-own-writes | users notice their own state |
| Live telemetry, presence | Weak | only the current value matters |

### Interview checklist

- Distinguish **ACID's C** from **distributed consistency** if there's any ambiguity.
- Reach for **per-operation** consistency rather than a single global setting.
- Quote `R + W > N` and give the `R=2, W=2, N=3` default.
- Volunteer **read-your-own-writes** as the targeted fix for the complaint users actually raise.
- Say **how conflicts are resolved**, not just that they're possible — LWW's data loss is worth calling out explicitly.
- Tie the choice to **what breaks** when data is stale, per data type.
