---
version: 1
---

Fail-over and replication keep data available. These patterns keep the *request path* available when a dependency misbehaves — and they're what candidates most often leave out.

### Timeouts

**Every network call needs a timeout.** A call without one waits forever, holding a thread, a connection, and memory. Under a dependency outage, an unbounded call turns into resource exhaustion, and a service that was merely dependent on a broken thing becomes broken itself.

Set the value from observed latency — near p99.9 of the call, not an arbitrary 30 seconds. A timeout longer than the caller's own budget is decoration: if your endpoint must answer in 200 ms, a 5-second timeout on a backend call will never fire before the user has already given up.

### Retries, and how they cause outages

Retries fix transient failures and amplify sustained ones. Three rules:

**Exponential backoff with jitter.** Without jitter, every client that failed during an outage retries in the same instant when the service returns, and knocks it over again. Jitter is not a refinement; it's the difference between recovery and a second outage.

**Only retry what's retryable.** Timeouts and 503s, yes. A 400 will fail identically forever.

**Budget retries.** Cap the fraction of traffic that is retries — say 10%. Without a budget, a service at 50% error rate sees its load *increase* precisely when it's least able to cope. This is the mechanism behind a large share of cascading failures: the retry storm, not the original fault, is what takes the system down.

Retries also demand **idempotency**. Retrying a read is free; retrying a payment is not. Either make the operation idempotent with a key, or don't retry it.

### Circuit breakers

When a dependency is comprehensively down, retrying is worse than useless — each attempt occupies a worker for a full timeout, and the pool fills with calls destined to fail. Work for *healthy* dependencies then starves.

A circuit breaker tracks the failure rate and trips past a threshold, failing fast without attempting the call. After a cooling period it lets a probe through; success closes it again. Three states: closed (normal), open (failing fast), half-open (probing).

The value is converting "every worker blocked for 30 seconds" into "immediate, cheap failure" — which preserves capacity for everything else and gives the dependency room to recover instead of being hammered while it restarts.

### Bulkheads

Partition resources so one workload can't consume everything. Separate connection pools or thread pools per dependency mean a slow dependency exhausts only its own pool. Separate queues per channel — as in the notification system — mean one failing provider doesn't stall the rest.

Named after ship compartments, and the metaphor is exact: the point is that flooding one section doesn't sink the vessel.

### Health checks and fail-over

Fail-over is only as good as its detection. Two distinctions worth making:

- **Liveness vs readiness.** Liveness asks "is the process alive?"; readiness asks "can it serve traffic?" A process that is alive but has lost its database connection should fail readiness and be removed from rotation without being restarted.
- **Deep vs shallow checks.** A check returning 200 unconditionally tells you nothing. One that verifies critical dependencies is meaningful — but be careful: if a health check fails because a shared dependency is down, *every* instance fails simultaneously and you remove your entire fleet from service. Health checks should reflect the instance's own health, not the whole system's.

**Failing over is the easy half.** Failing *back* — reconciling writes that happened on the promoted replica, catching up the recovered primary, avoiding split brain where two nodes both believe they're primary — is where the difficulty lives. Fencing tokens or a consensus-based leader election exist for exactly this.

And the rule that matters most: **an untested fail-over does not work.** The first real execution of an untested runbook happens during an incident, at 3 a.m., under pressure. Systems that fail over reliably are the ones that practise it.

### Checklist

- [ ] Timeout on every network call, derived from measured latency
- [ ] Exponential backoff with jitter, and a retry budget
- [ ] Idempotency wherever retries can touch a mutation
- [ ] Circuit breakers around external dependencies
- [ ] Bulkheads isolating pools per dependency
- [ ] Readiness distinct from liveness; checks that don't fail the whole fleet at once
- [ ] Graceful degradation defined for each major dependency
- [ ] Fail-over exercised on purpose, not discovered in an incident
