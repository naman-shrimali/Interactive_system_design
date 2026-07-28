---
version: 1
---

The fix starts by refusing to hash keys onto server *indices*. Instead, hash keys and servers onto the same abstract space, and derive ownership from position within it.

### Building the ring

Take a hash function with a large output space — SHA-1 or MD5 truncated to 32 bits is typical, giving `0` to `2³² − 1`. Now imagine that range bent into a circle, so the value after `2³² − 1` wraps back to `0`.

Two placements happen on that circle:

1. **Servers** are placed at `hash(server_id)` — for example `hash("cache-03")`. A server's position depends only on its own name, not on how many other servers exist. That property is the whole trick.
2. **Keys** are placed at `hash(key)`.

To find the server that owns a key, start at the key's position and walk **clockwise** until you hit a server. That server owns the key.

### Why this survives failure

Say the ring holds servers `S0`, `S1`, `S2`, `S3` and `S1` dies. Every key that used to land in the arc between `S0` and `S1` now continues clockwise to the next surviving server, `S2`. Those keys — and *only* those keys — change owner.

Every other key is untouched, because the servers bounding its arc haven't moved. `S0`'s position is still `hash("cache-00")`; removing `S1` didn't change that. Compare this with modulo hashing, where dropping from four servers to three changes the divisor and so re-maps roughly 75% of keys.

Adding a server is the mirror image. A new `S4` lands somewhere on the ring and steals only the keys in the arc immediately counter-clockwise of it, from whichever server previously covered that stretch. The expected fraction moved is about `1/N`.

That's the guarantee worth remembering: **adding or removing one node in an `N`-node cluster re-maps about `1/N` of keys, not `(N−1)/N`.**

### Implementing the lookup

The naive picture is a circle; the implementation is a sorted array.

```
positions = sorted list of (hash(server_id), server_id)

lookup(key):
    h = hash(key)
    i = binary_search_first_index_where(positions[i].hash >= h)
    if i == len(positions):   # walked past the end — wrap around
        i = 0
    return positions[i].server
```

Lookup is `O(log N)` on a sorted array, or `O(1)` on a balanced BST with successor pointers. Either is fast enough that the ring lives in memory on every client and needs no network hop — an important property, because the alternative is a central lookup service, which is precisely the single point of failure the design is trying to avoid.

### Replication falls out of the same structure

The ring also gives you replica placement for free. To keep `R` copies of a key, don't stop at the first server clockwise — keep walking and take the next `R` **distinct** physical servers. That set is the key's *preference list*.

The word "distinct" is load-bearing, and it becomes important in the next section: once a physical server occupies multiple positions on the ring, a naive walk can hand you the same machine three times and leave you with one copy where you wanted three. Production implementations skip positions belonging to a server already in the list, and often skip whole racks or availability zones too, so that one rack losing power doesn't take every replica with it.

### The problem this doesn't solve

Everything above assumes servers land at evenly spaced positions on the ring. Nothing guarantees that. With four servers hashed onto a 4-billion-slot circle, the arcs between them will be visibly uneven — one server might own 40% of the space and another 10%. Since arc width is proportional to key share, that's a 4× load imbalance for no reason other than hash luck.

Worse, when a server dies its entire arc transfers to a **single** successor rather than being spread across the cluster, so the surviving neighbour inherits a sudden doubling of load — often while the system is already degraded. Virtual nodes fix both problems.
