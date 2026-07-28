---
version: 1
---

Everything so far assumed one process holding the counter. Put ten gateway nodes behind a load balancer and the algorithm is the easy part — keeping the count correct across machines is the real problem.

### Why per-node counters don't work

The tempting shortcut is to divide: limit 100/minute across 10 nodes, so 10 each, no coordination. It fails for a reason that shows up immediately in production — load balancers don't distribute one client's requests evenly. A client with a keep-alive connection may hit the same node every time, exhaust its 10, and get throttled at a tenth of its actual allowance while the other nine nodes sit idle.

So the counter has to be shared. That means a network round trip on every request, and the store becomes a dependency of every request your system serves.

### The race condition

The obvious Redis implementation is wrong:

```
count = GET key          # 99
if count < 100:
    SET key count+1      # 100
    allow()
```

Between the `GET` and the `SET`, another node runs the same two lines and reads the same 99. Both allow. Both write 100. You've served 101 requests against a limit of 100, and under real concurrency the overshoot scales with the number of nodes.

Three standard fixes:

**Atomic increment.** `INCR` returns the new value in one round trip; compare it to the limit afterwards. Correct, and one operation instead of two. The wrinkle is expiry: `INCR` on a missing key creates it without a TTL, so you must `EXPIRE` it — and doing that as a second command reintroduces a race where a crash between the two leaves a key that never expires. Use a pipeline or `SET key 0 EX 60 NX` first.

**Lua script.** Redis runs a script atomically, so read-modify-write of several fields — exactly what token bucket needs, with its token count and timestamp — happens with no interleaving. This is the standard production answer for token bucket on Redis, and it's the one to name.

**Sorted set, for the sliding log.** `ZREMRANGEBYSCORE` to evict old entries, `ZADD` the new timestamp, `ZCARD` to count — pipelined together.

### Latency and the failure mode

Every request now waits on Redis. Same-datacenter that's roughly 0.5–2 ms, which is acceptable for most APIs but not nothing when your p50 is 20 ms.

More important: **what happens when Redis is down?** This is a design decision, not an accident, and interviewers look for it.

- **Fail open** — allow everything the limiter can't check. Your API stays up; abuse is unthrottled for the duration. Almost always right for general API rate limiting, because a limiter outage should not become an API outage.
- **Fail closed** — reject what you can't check. Right when the limit is a security control, such as login attempts, where allowing unlimited attempts is worse than rejecting legitimate ones.

Say which you'd pick and why. "Fail open, except on auth endpoints" is a good answer.

### Reducing the round trips

For very high request rates, exact counting isn't worth its cost. Two common relaxations:

**Local cache with periodic sync.** Each node keeps an in-memory counter and flushes to the shared store every `N` requests or every few hundred milliseconds. Accuracy degrades to roughly "the limit, plus whatever the fleet buffered" — fine when the limit is 10,000/minute and meaningless drift is a few dozen.

**Lease-based batching.** A node asks the central store for a block of, say, 20 tokens and spends them locally, returning for more when exhausted. This cuts round trips by 20× and is exactly how you'd let a rate limiter scale to enormous traffic. The trade is that unspent leases held by a node that dies are lost until they expire.

Both are examples of the same principle: a limiter that adds latency to every request has made the system worse, so trading exactness for speed is usually correct. Be explicit that you're accepting slight over-admission and say roughly how much.

### Where the limiter lives

The counter design interacts with placement. A limiter inside each service duplicates configuration and leaves unprotected services exposed. A limiter in the API gateway or a sidecar sees all traffic, holds the Redis connection pool in one place, and rejects abusive traffic before it reaches your application tier — which is the entire point, since work you reject cheaply is work your services never do.
