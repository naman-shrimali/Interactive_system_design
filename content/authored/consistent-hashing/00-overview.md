---
version: 1
---

Suppose you have four cache servers and you route each key with `hash(key) % 4`. It works, it's one line, and it distributes keys evenly. Then one server dies and you drop to three. Every key now hashes with `% 3` instead of `% 4`, and almost every key maps to a *different* server than before.

That's the rehashing problem, and it's worse than it sounds. The keys didn't move — the *mapping* moved out from under them. Every lookup misses, every miss falls through to the database, and the database gets the full read load of your entire system at the exact moment you're already one server down. A routine node failure becomes an outage.

### The cost, concretely

With `N` servers and a naive modulo, changing the server count invalidates roughly `(N-1)/N` of your keys — 75% at four servers, 90% at ten. You want a scheme where adding or removing one server invalidates only the keys that server was responsible for: about `1/N` of them.

Consistent hashing gets you there. Instead of hashing keys directly onto *server indices*, it hashes both keys and servers onto the same abstract space — a ring — and assigns each key to the next server clockwise. Because a server occupies a fixed position on the ring independent of how many other servers exist, removing one only orphans the keys in its own arc. Everything else keeps its home.

### Where you'll actually meet it

This isn't a niche trick. It's the partitioning layer underneath a large fraction of distributed infrastructure:

- **Distributed caches** — memcached client libraries route keys this way so a dead node degrades rather than stampedes.
- **Dynamo-style key-value stores** — Cassandra, Riak, and DynamoDB use a hash ring to decide which nodes own which key ranges, and to find the replica set for a key.
- **Load balancers** doing session affinity without sticky-session state.
- **Sharded databases and CDN request routing**, wherever you need "same key, same box" without a central lookup table.

In an interview, consistent hashing shows up two ways: as its own question ("design consistent hashing"), and as a component you're expected to reach for unprompted the moment you shard anything. Knowing *why* modulo fails is what makes the second one land.

The rest of this topic builds the ring from first principles, then fixes the two problems a naive ring has — uneven key distribution and uneven arc sizes — with virtual nodes.
