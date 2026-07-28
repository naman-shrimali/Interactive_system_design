---
version: 1
---

The entire design turns on one question: where does the short key come from? Two families of answer, with different failure modes.

### Encoding a counter

Keep a global counter, increment it per URL, and render the value in base 62 (`a–z`, `A–Z`, `0–9`).

```
12345678  ->  "ZXP0"
```

**Uniqueness is structural.** Two URLs can never receive the same key because the counter never repeats a value — no collision check, no retry loop, no probabilistic argument. That is the decisive advantage.

Key length comes straight from arithmetic. At 100 million new URLs per day over five years you need ~182 billion keys:

| Length | Keyspace |
|---|---|
| 6 | 62⁶ ≈ 56 billion — insufficient |
| **7** | 62⁷ ≈ 3.5 trillion — comfortable |

So seven characters, with room to spare.

The problem is the counter itself: a single global sequence is a bottleneck and a single point of failure — precisely the issue the unique-ID topic exists to solve. The same answers apply. Hand out **blocks** (a service claims 10,000 values and spends them locally, cutting coordination by 10,000×), or give each generator a **distinct range**, or use a **Snowflake-style ID** and encode that.

Block allocation leaves gaps when a service restarts with unspent values. Gaps are harmless here — nobody is counting the URLs.

### Hashing the URL

Hash the long URL (MD5, SHA-256) and take the first 7 base-62 characters.

Attractive because it's stateless — any machine computes the key with no coordination at all — and because the same URL naturally yields the same key, deduplicating for free.

The catch is **collisions**. Truncating a hash to 7 characters means the birthday bound bites long before you exhaust the keyspace: at billions of URLs, two different URLs will map to the same key. So you need a collision check — look up the key, and if it exists and maps to a different URL, perturb (append a salt, rehash) and retry.

That check is a read on the write path, which reintroduces the coordination you were avoiding, and the retry loop makes worst-case latency unbounded in principle.

### Choosing

| | Counter + base-62 | Hash + truncate |
|---|---|---|
| Collisions | impossible | must check and retry |
| Coordination | needs a sequence (batchable) | none, until the collision check |
| Same URL twice | two keys | same key (free dedup) |
| Keys are guessable | yes — sequential | no |
| Custom aliases | easy to layer on | easy to layer on |

**Counter with block allocation is the better default**, because "collisions are impossible" removes an entire class of bug and blocks remove the bottleneck.

The one genuine argument for hashing is that sequential keys are enumerable: anyone can walk `aaaa1`, `aaaa2` and discover every link ever created. If links are expected to be private-by-obscurity, that's disqualifying. The fix isn't necessarily hashing — you can encode the counter through a keyed permutation so keys are unguessable while remaining collision-free.

### Custom aliases

Users want `sho.rt/my-campaign`. Treat it as a separate write path: check availability, reserve it, and keep it in the same keyspace so lookups stay uniform. Reserve a blocklist of offensive and system-conflicting words, and make sure generated keys can never collide with custom ones — usually by generating from a character set or length that custom aliases are forbidden to use.
