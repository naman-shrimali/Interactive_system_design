---
version: 1
---

Five algorithms come up. They differ in how much state they keep per client and how badly they behave at the edges of a window. Know the first two properly and be able to explain why the naive one is broken.

### Token bucket

A bucket holds up to `capacity` tokens and refills at a fixed rate. Each request removes one token; if the bucket is empty, the request is rejected.

```
allow(now):
    elapsed = now - last_refill
    tokens  = min(capacity, tokens + elapsed * refill_rate)
    last_refill = now
    if tokens >= 1:
        tokens -= 1
        return ALLOW
    return REJECT
```

State per client: two numbers — a token count and a timestamp. Nothing is stored per request, and refill is computed lazily on access rather than by a background timer.

The defining property is that it **permits bursts up to `capacity`**. A client idle for a minute can spend its whole bucket at once. That is usually what you want: real traffic is bursty, and a limiter that smooths every burst makes a responsive API feel sluggish. `capacity` and `refill_rate` are separate dials — sustained rate and burst tolerance tuned independently. This is what most production limiters use, including AWS and Stripe-style APIs.

### Leaking bucket

Requests enter a fixed-size FIFO queue and are processed at a constant rate. A full queue means rejection.

The output rate is perfectly smooth — the point of the algorithm. That suits a system whose downstream cannot absorb bursts at all: a payment processor, a legacy service, a third-party API with a hard contractual ceiling.

The cost is latency. A request may sit in the queue rather than fail fast, and under sustained load queued requests are stale by the time they run. If a caller has already timed out, you're spending capacity on work nobody wants.

### Fixed window counter

Divide time into fixed windows — say each wall-clock minute — and keep one counter per client per window. Increment on each request, reject past the limit, discard the counter when the window rolls.

Cheap: one integer per client, one `INCR` per request. And **broken at the boundary.** With a limit of 100/minute, a client can send 100 requests at 11:00:59 and 100 more at 11:01:00 — 200 requests in two seconds, all within limits. The effective peak is double the configured rate.

Mention this failure explicitly in an interview. It's the reason the next two algorithms exist.

### Sliding window log

Store a timestamp for every request in a sorted set. On each request, drop entries older than the window and count what's left.

Exactly correct — no boundary artefact, ever. Also the most expensive: memory grows with *request* volume, not client count. A client sending 10,000 requests per hour needs 10,000 stored timestamps, and you pay that even for requests you rejected, unless you're careful to log only accepted ones.

Worth it when the limit is small and precision matters — 5 login attempts per hour, say, where 10,000 timestamps is 5.

### Sliding window counter

The pragmatic compromise, and a good default when you can't have token bucket. Keep fixed-window counters, but weight the previous window by how much of it still overlaps the current one:

```
estimate = current_count + previous_count * (overlap_fraction)
```

If you're 25% into the current minute, count 100% of this minute's requests plus 75% of last minute's. Two integers per client, no boundary doubling, and the error is small — it assumes requests were spread evenly across the previous window, which is close enough in practice.

### Choosing

| Algorithm | State per client | Bursts | Boundary-safe | Use when |
|---|---|---|---|---|
| Token bucket | 2 numbers | allowed, bounded | yes | default for APIs |
| Leaking bucket | queue | smoothed away | yes | downstream can't burst |
| Fixed window | 1 counter | up to 2× at edges | **no** | never, really |
| Sliding log | 1 entry/request | none | yes | small, precise limits |
| Sliding counter | 2 counters | slight | approximately | good general default |

Token bucket is the answer unless something in the problem argues otherwise. Say so, then justify it: cheap state, burst tolerance as an explicit dial, no boundary bug.
