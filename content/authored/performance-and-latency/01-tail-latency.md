---
version: 1
---

Averages hide the experience of the users you most need to keep. Percentiles are how you see them, and tail latency is the thing that actually breaks distributed systems.

### Read percentiles, not means

p50 (median) is the typical experience. p99 is the slowest 1%. p99.9 is the slowest 1 in 1,000.

An average conceals both the shape and the outliers: a service with p50 = 20 ms and p99 = 3,000 ms might average 50 ms and look healthy on a dashboard while 1% of requests time out. Worse, averages are dragged by outliers in a way that makes them neither typical nor extreme — they describe nobody.

**Why the tail matters more than it seems.** If a page makes 20 backend calls and each has a p99 of 1 second, the chance that *at least one* is slow is `1 − 0.99²⁰ ≈ 18%`. A one-in-a-hundred backend event has become a one-in-six page event. Fan-out converts rare slowness into common slowness — this is the single most important thing to understand about tail latency, and the reason large systems obsess over p99 rather than p50.

It's also the users you care about: the p99 user is often the one with the most data, the most followers, the largest cart. Your slowest requests correlate with your most engaged customers.

### Where tails come from

Slow requests are usually not slow code. Common causes:

- **Queueing.** As utilisation rises, queue time rises non-linearly. Past roughly 70–80% utilisation, small load increases produce large latency increases. This is why running servers "efficiently" at 95% CPU produces terrible tails.
- **Garbage collection** or other stop-the-world pauses.
- **Cache misses** falling through to a slow path.
- **Head-of-line blocking** behind one expensive request.
- **Noisy neighbours** on shared infrastructure.
- **Retries and timeouts** interacting badly.

### Mitigations

**Hedged requests.** Send the request; if no answer by p95, send a duplicate to another replica and take whichever returns first. Costs a few percent extra load and dramatically cuts the tail, because it converts one unlucky server into two independent chances. Only safe for idempotent reads.

**Timeouts everywhere, set from percentiles.** A timeout at 10× p99 doesn't protect anything. Set it near p99.9 and fail fast — a request that has already blown its budget is consuming capacity for a user who has probably left.

**Load shedding.** Under overload, reject some requests immediately rather than degrading everyone. Fast failure beats universal slowness, and it keeps the queue from growing without bound.

**Keep utilisation off the cliff.** Provision so normal operation sits well below the knee of the queueing curve.

**Circuit breakers.** When a dependency is failing, stop calling it rather than tying up every worker on a timeout.

### Setting targets

State latency requirements as a percentile and a number: "p99 under 200 ms" is a requirement; "fast" is not. In an interview, saying "I'd target p99 rather than average, because with this fan-out the tail dominates the user experience" is a strong, specific signal.

Two things follow from a target:

- **Budget it across the request path.** If p99 must be 200 ms and you make three sequential backend calls, each has roughly 60 ms — which immediately tells you whether a cross-region call is affordable. It usually isn't.
- **Prefer parallel over sequential calls.** Three sequential 50 ms calls cost 150 ms; three parallel ones cost ~50 ms plus fan-out risk. That risk is exactly the tail-amplification maths above, which is why parallel fan-out is paired with hedging.

**Key numbers:** p99 of 1 s across 20 calls ≈ 18% of pages affected · queueing degrades sharply past ~70–80% utilisation · cross-continent round trip ~150 ms · hedging at p95 costs ~5% extra load.
