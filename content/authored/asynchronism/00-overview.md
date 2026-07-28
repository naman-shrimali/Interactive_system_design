---
version: 1
---

Doing work later is one of the highest-leverage moves in system design. It converts a slow, fragile synchronous request into a fast acknowledgement plus a durable job — and it decouples the availability of the caller from the availability of the worker.

### When to go asynchronous

Move work off the request path when any of these hold:

- **It's slow.** Video transcoding, report generation, bulk email. No user should hold a connection for it.
- **It can fail and be retried.** A third-party call that times out should be retried by a worker, not by a user refreshing.
- **It's spiky.** A queue absorbs a burst that would otherwise overwhelm the downstream system.
- **The user doesn't need the result now.** Sending a confirmation email doesn't need to complete before the page renders.
- **The downstream is unavailable.** A queue lets you accept work while a dependency is down and drain it when recovery happens — which turns a hard dependency into a soft one.

The counter-test matters too: **if the user needs the answer to continue, it's synchronous.** Making a checkout asynchronous just moves the wait somewhere the user can't see it and adds a polling problem.

### What it costs

The trade is honesty about completion. Synchronously, success means done. Asynchronously, success means *accepted* — and the actual work may fail minutes later, when there's no request context to report it.

That creates real obligations:

- **The client needs a way to learn the outcome** — polling a status endpoint, a webhook, a push notification, or a UI that updates when it lands.
- **Failures need somewhere to go.** Nobody is watching, so a failed job that isn't recorded and alerted on has silently vanished.
- **Debugging spans systems.** "Where did my job go?" needs a correlation ID that survives from the request into the queue and the worker.
- **Eventual consistency arrives.** The user's action is accepted but not yet reflected, which is visible and needs handling in the UI.

### Queues, logs, and the difference

Two families that get conflated:

**Message queues** (RabbitMQ, SQS) distribute work. A message goes to one consumer, is acknowledged, and disappears. The mental model is a to-do list shared by a worker pool, and it's what you want for task distribution.

**Event logs** (Kafka) are append-only and retain messages after reading. Many independent consumer groups read the same stream at their own positions, and a consumer can rewind and replay. The mental model is a durable ledger.

The distinction is consequential. If two teams need the same events, or if you'll want to reprocess history after fixing a bug, you want a log. If you're handing out jobs to workers, a queue is simpler. Asking "will anything else ever need these events?" is the question that decides it, and getting it wrong is expensive to reverse.

### Back pressure

A queue is a buffer, and buffers hide problems until they can't. If producers outpace consumers indefinitely, the queue grows without bound: memory or disk fills, latency through the queue climbs from milliseconds to hours, and by the time anyone notices, the backlog takes hours to drain.

Back pressure is deliberately pushing that constraint back to the producer — bounded queue sizes that reject or block when full, producer-side rate limiting, or shedding low-priority work. The alternative to back pressure isn't "no back pressure"; it's an unbounded queue and a much worse failure later.

**Queue depth is the single most important metric here.** A steadily growing queue means consumers are underprovisioned or failing, and it's a leading indicator — it tells you before users are affected. Alert on the trend, not just an absolute threshold.

### The shape it gives your system

Asynchronism changes the diagram: a request writes durably, enqueues, and returns. Workers pull, process, and record results. Producers and consumers scale independently, deploy independently, and fail independently.

That independence is the real payoff — more than the latency improvement. The web tier stays up when the transcoder is down; work accumulates instead of being lost.
