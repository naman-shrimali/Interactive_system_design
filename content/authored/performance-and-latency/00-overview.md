---
version: 1
---

Four words that interviewers use precisely and candidates use interchangeably. Getting them right is cheap and signals care.

### The definitions

**Latency** — how long one operation takes. Measured in time: milliseconds for a request, microseconds for a memory read.

**Throughput** — how many operations complete per unit time. Measured in rate: requests per second, megabytes per second.

**Performance** — how fast the system is *for a given workload*. Improving performance means the same work finishes sooner.

**Scalability** — whether performance holds as the workload grows. A system is scalable if adding resources buys proportional capacity.

The distinction that matters most: **performance and scalability are different problems with different fixes.** If your system is slow with ten users, that's a performance problem — profile it, fix the algorithm, add an index. If it's fast with ten users and slow with ten thousand, that's a scalability problem, and no amount of local optimisation fixes it. Saying "this is a scalability problem, not a performance one" out loud shows you know which lever to reach for.

### Latency and throughput are not inverses

The intuitive but wrong model is that halving latency doubles throughput. Concurrency breaks the relationship: a system can have high latency *and* high throughput if it processes many operations in parallel.

A useful frame is Little's Law:

```
concurrency = throughput × latency
```

A service handling 1,000 requests/second where each takes 200 ms has 200 requests in flight at any moment. That number determines thread pool sizes, connection pool sizes, and memory footprint — and it's why a latency regression can quietly exhaust a connection pool without throughput changing at all.

The two also trade against each other deliberately. **Batching** raises throughput and raises latency: waiting to accumulate 100 rows before writing amortises overhead across them, and the first row in the batch waits. Nagle's algorithm, group commit, and micro-batching in stream processors are all this same trade.

So "make it faster" is ambiguous. Ask which one matters. A video pipeline wants throughput and tolerates seconds of latency; an autocomplete endpoint wants latency and has modest throughput.

### Vertical and horizontal scaling

**Vertical** — a bigger machine. Simple, requires no code changes, and works remarkably far: modern hardware is enormous, and plenty of systems that "need" distribution actually need a larger instance. Its limits are a hard ceiling, superlinear cost at the top end, and no redundancy — one machine is one failure away from total outage.

**Horizontal** — more machines. Effectively unbounded and gives redundancy for free, but demands statelessness, introduces coordination, and brings every distributed-systems problem with it.

The honest position in an interview: **start vertical, scale horizontally when you must**, and know which constraint forces the move. Reaching for horizontal scaling on a workload that fits on one box is over-engineering.

The prerequisite for horizontal scaling is that the tier is **stateless** — any request can go to any machine. That's why session state moves out of web servers and into a shared store. Once state is external, the tier scales by changing a number.

### Where time actually goes

Before optimising, know the budget. A request that takes 200 ms typically spends it on network round trips, database queries, and serialisation — rarely on your application logic. Which is why the highest-leverage fixes are usually *removing round trips* (caching, batching, denormalising) rather than making code faster.

And geography dominates: a cross-continent round trip is ~150 ms, so a request making three sequential calls across regions cannot be fast no matter how good the code is. That's what CDNs and regional deployments exist to fix.
