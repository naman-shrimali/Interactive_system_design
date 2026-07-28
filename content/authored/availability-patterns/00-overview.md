---
version: 1
---

Availability is designed, not hoped for. The assumption underneath every technique in this topic is that components *will* fail — disks, machines, racks, networks, whole regions — and the system's job is to keep serving anyway.

### The two levers

Almost everything reduces to one of two ideas:

**Redundancy** — have more than one of the thing, so losing one isn't fatal. Replicas, multiple availability zones, several providers.

**Isolation** — arrange things so a failure can't spread. Bulkheads between tenants, circuit breakers between services, separate queues per channel, blast-radius limits on deploys.

Redundancy without isolation gives you correlated failure: three replicas in one rack are one power event away from zero replicas. Isolation without redundancy gives you a contained outage that's still an outage. You need both, and naming which one a given technique provides is a good way to reason clearly.

### Availability composes badly

This is the arithmetic worth internalising:

**In series** (you need all of them), availabilities multiply. Three dependencies at 99.9% each give `0.999³ ≈ 99.7%` — worse than any component. Every synchronous dependency you add lowers your ceiling.

**In parallel** (any one suffices), unavailabilities multiply. Two redundant components at 99% give `1 − 0.01² = 99.99%`.

Two design consequences follow immediately:

1. **Long synchronous dependency chains are an availability tax.** Six services in a request path, each at 99.9%, ceiling at 99.4% — roughly two days of downtime a year from composition alone. The fix is fewer synchronous hops: make calls asynchronous, cache aggressively, or degrade gracefully when a dependency is unavailable.
2. **Redundancy is the only thing that buys nines back**, and only when failures are genuinely independent. Two replicas sharing a rack, a power supply, or a deployment pipeline are not independent, and the arithmetic doesn't apply.

That second caveat is where real outages live. Correlated failure — the same bad config pushed everywhere, the same expired certificate, the same dependency underneath both "independent" paths — is what turns a redundant system into a single point of failure that nobody noticed.

### What the target actually means

| Target | Downtime/year | What it demands |
|---|---|---|
| 99% | 3.65 days | one machine, manual recovery |
| 99.9% | 8.8 hours | redundancy, alerting, someone on call |
| 99.99% | 53 minutes | multi-AZ, automated failover, tested runbooks |
| 99.999% | 5.3 minutes | multi-region, automated everything, no manual step in the recovery path |

Each nine costs roughly an order of magnitude more than the last. The right move in an interview is to **ask what the target is** rather than assuming five nines — and to note that at 99.99% and above, a human being paged is already too slow, so recovery must be automatic.

Also worth saying: availability targets should be **per operation**. Reading a product page and completing a checkout do not need the same guarantee, and pretending they do makes the whole system expensive.

### Failing well

Not all downtime is equal, and the best systems degrade rather than stop:

- **Graceful degradation.** Recommendations service down? Show a generic list. The page still works.
- **Read-only mode.** If writes can't be made safely, serving stale reads is far better than an error page.
- **Static fallback.** A cached or default response beats a 500.

Designing what your system does *while broken* is as much a part of availability as preventing the break — and volunteering it in an interview is a strong signal, because it's the part most candidates never mention.
