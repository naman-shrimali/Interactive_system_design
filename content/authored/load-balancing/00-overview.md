---
version: 1
---

A load balancer sits between clients and servers and decides which server handles each request. That one sentence undersells it: the load balancer is what makes a fleet of machines behave like a single service, and it's the enabler for horizontal scaling, zero-downtime deploys, and failure tolerance.

### What it actually buys you

- **Horizontal scaling.** Adding capacity becomes adding a machine to a pool, with no client changes. Without a load balancer, clients would need to know about every server.
- **Failure tolerance.** Health checks remove dead servers from rotation. A machine dying becomes a capacity event rather than an outage — for the users who would have hit it, nothing happens.
- **Zero-downtime deploys.** Drain a server, deploy, health-check, return it to rotation, repeat. Rolling deploys are a load-balancer feature.
- **A place to put cross-cutting work.** TLS termination, compression, request logging, and rate limiting all naturally live at the entry point rather than being duplicated in every service.

That last one matters more than it looks. Terminating TLS centrally means certificates are managed in one place and backends speak plain HTTP internally — simpler and measurably cheaper in CPU.

### Distribution algorithms

| Algorithm | Behaviour | Good for |
|---|---|---|
| Round robin | each server in turn | uniform requests, uniform servers |
| Weighted round robin | proportional to capacity | mixed hardware generations |
| Least connections | fewest active connections | long-lived or variable-duration requests |
| Least response time | fastest observed | heterogeneous or degrading backends |
| IP hash | same client → same server | crude session affinity |
| Consistent hash | key → server, stable under membership change | cache locality (see the consistent-hashing topic) |

Round robin is the sensible default. **Least connections** is the upgrade that matters when request durations vary a lot — round robin will happily send a new request to a server already handling ten slow ones, because it's only counting turns.

Consistent hashing is worth naming when routing should preserve cache locality: sending the same key to the same backend means that backend's local cache stays warm.

### The sticky-session trap

Session affinity pins a client to one server, usually via a cookie or IP hash. It's tempting because it makes in-memory session state work.

It's also a design smell, and the reasons are worth having ready:

- **Uneven load.** Some sessions are heavier and longer than others, so pinning defeats balancing.
- **Failure loses state.** The server dies, the session goes with it, and the user is logged out.
- **Deploys become disruptive.** Draining a server means abandoning its sessions or waiting for them all to end.
- **Autoscaling doesn't help.** New servers get no traffic from existing sticky clients.

The fix is to make the tier **stateless** — put session data in a shared store (Redis, or a signed token held by the client) so any server can handle any request. Then affinity is unnecessary and every problem above disappears. In an interview, if you find yourself needing sticky sessions, that's usually the signal to externalise state instead.

The legitimate exception is genuinely stateful connections — a WebSocket lives on one server by nature, which is why the chat topic needs a connection registry rather than affinity.

### Health checks decide everything

A load balancer is only as good as its notion of "healthy". Two distinctions:

**Passive** checks observe real traffic for failures — free, but only detects problems after users hit them. **Active** checks probe an endpoint on a schedule — catches problems before users do, at the cost of some traffic. Use both.

The endpoint should reflect *this instance's* ability to serve, which is subtler than it sounds. A check that verifies a shared database will fail on every instance simultaneously when that database blips, removing the entire fleet from rotation and converting a degraded dependency into a total outage. Check what this instance controls; degrade gracefully on shared dependencies rather than declaring yourself dead.

### Avoiding the single point of failure

A single load balancer is a single point of failure, and putting one in front of a redundant fleet just relocates the problem. Standard answers: an active-passive pair sharing a floating IP, multiple load balancers behind DNS round-robin, or a managed cloud load balancer that is redundant internally. Mention this — it's the obvious follow-up to "add a load balancer", and having the answer ready is cheap.
