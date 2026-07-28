---
version: 1
---

Nobody designs the finished system on day one. What actually happens is a sequence of forced moves: something breaks, you fix it, and the fix creates the next bottleneck. Understanding that sequence is more useful than memorising the end state, because interviews ask you to *arrive* at an architecture, not recite one.

### The sequence

Each step below is triggered by a specific failure, and each introduces a specific new problem:

1. **One box.** Web app, database and cache on a single server. Cheap, simple, and a single point of failure. It works longer than people expect.
2. **Split the database out.** The app and the database compete for memory and CPU. Separating them lets each scale on its own axis — and introduces a network hop.
3. **Add a load balancer and more web servers.** One server is a availability risk and a capacity ceiling. Multiple stateless servers behind a balancer fix both — *provided* the tier is stateless, which forces session data out into a shared store.
4. **Replicate the database.** Reads dominate, so add replicas and send reads to them. This buys read capacity and introduces replication lag, which is where eventual consistency enters your product whether you wanted it or not.
5. **Add a cache.** Most reads ask for the same small set of things. A cache in front of the database absorbs them, and brings cache invalidation with it.
6. **Add a CDN.** Static assets don't need to come from your origin at all, and users on the other side of the planet shouldn't wait 200 ms for a stylesheet.
7. **Queue the slow work.** Anything that doesn't need to finish before the response — transcoding, email, indexing — moves off the request path.
8. **Multiple data centres.** Availability and latency both demand serving users from a nearby region, which brings the genuinely hard problem of cross-region data.
9. **Shard the database.** The last resort, because it breaks joins and transactions. Everything else is cheaper.

### Reading the order

Two things about that list matter more than its contents.

**It's ordered by cost.** Caching is cheap and buys a lot; sharding is expensive and buys capacity you may not need. Doing them in the wrong order is the most common form of over-engineering — teams shard a database that would have been fine behind a cache.

**Each step is triggered, not scheduled.** The right answer to "how would you scale this?" is not step 9; it's "here's what breaks first, and here's the cheapest fix for that." Knowing when *not* to advance is as valuable as knowing how.

The diagrams below walk the first, middle and end states. Step through the flows to see how a single request changes shape as the system grows.
