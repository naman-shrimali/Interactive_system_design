---
version: 1
---

Separating the web tier from the application tier means the thing serving HTTP is not the thing doing the work. It's a small structural change with disproportionate consequences.

### Why split at all

- **Independent scaling.** Serving requests and doing work consume different resources. If image processing is CPU-bound and request handling is I/O-bound, one tier scales on CPU and the other on connections. Bundled together, you over-provision both.
- **Independent deployment.** Business logic changes far more often than the HTTP layer.
- **Failure isolation.** A crash in a worker shouldn't take down request handling.
- **Reuse.** The same application service serves your web app, mobile API, and internal batch jobs.

The tell that you need the split: one part of the system needs to scale for reasons that have nothing to do with the other.

### Services and their boundaries

Splitting the application tier further gives you services. The hard part is never the mechanics — it's deciding where the seams go.

The useful heuristics:

- **Follow the data.** A service should own its data exclusively. If two services read and write the same tables, they aren't separate services; they're one service with a distributed monolith's failure modes and none of the benefits.
- **Follow the team.** A service maintained by two teams will have contention on every change. One team, one service.
- **Follow the change rate.** Things that change together belong together.
- **Follow the scale profile.** A component needing ten times the capacity of its neighbours is a candidate for separation.

The anti-pattern is splitting by technical layer — a "database service", a "validation service" — which produces services that can never change independently because every feature touches all of them.

### What decomposition costs

This is the part worth volunteering, because enthusiasm for microservices without acknowledging their price reads as inexperience:

**Availability multiplies downward.** Six services at 99.9% in a synchronous chain ceiling at 99.4%. Every hop you add lowers the achievable number.

**Latency accumulates.** Each hop adds a round trip plus serialisation. A request touching five services has five times the opportunity for a slow tail — and as the tail-latency material shows, fan-out converts rare slowness into common slowness.

**Transactions stop being free.** Within one database, a transaction is `BEGIN`/`COMMIT`. Across services it becomes sagas with compensating actions, or eventual consistency with reconciliation. This is usually the largest hidden cost and the one that surprises teams.

**Operational overhead is per service.** Deployment, monitoring, alerting, on-call, and dependency upgrades multiply.

**Debugging gets harder.** A stack trace becomes a distributed trace, and you need the tracing infrastructure to make it legible.

The honest position: **start with a modular monolith** and extract services when a specific pressure justifies it — a differing scale profile, a team boundary, an isolation requirement. "We'd split this out when X becomes true" is a much stronger interview answer than a diagram with twelve services in it.

### Service discovery, briefly

Once services call each other, they need to find each other, and hardcoded addresses don't survive autoscaling. Two patterns:

- **Client-side discovery** — the caller queries a registry (Consul, etcd) and picks an instance. Fewer hops, more logic in every client.
- **Server-side discovery** — the caller hits a stable address and a load balancer or mesh routes it. Simpler clients; an extra hop.

In practice, platforms provide this: Kubernetes gives you a stable DNS name per service that resolves to healthy pods, which is server-side discovery with nothing to build. Say that rather than designing a registry from scratch — knowing when the platform already solved it is part of the answer.

Whatever the mechanism, the parts that matter are **health checking** (only route to instances that can serve) and **deregistration** (remove instances that die, promptly), which are the same concerns as the load balancer and the chat connection registry.
