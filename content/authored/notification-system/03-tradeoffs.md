---
version: 1
---

### Sizing it

Take 10 million users, averaging 5 notifications each per day across all channels.

- **Volume:** 50 million/day ≈ **580/second average**. But notifications are extremely spiky — a product launch or a breaking-news alert can push tens of millions in minutes, so peak may be **50,000+/second**. Design for the burst; the average is nearly irrelevant.
- **Queue depth:** at a 10 million-message campaign enqueued in one minute and drained at 10,000/second, the queue holds millions of messages and takes ~17 minutes to clear. That is fine and expected — but only if transactional messages are on a *separate* high-priority queue, or password resets sit behind the campaign.
- **Storage:** the tracking table at 50M rows/day with ~200 bytes each is ~10 GB/day. This is the argument for a retention policy: 30 days hot for support queries, then archive.
- **Fan-out cost:** a broadcast to 10M users is 10M rows and 10M provider calls, not one. Broadcasts are the expensive case, and worth calling out.

### Trade-offs

**Queue per channel vs one queue.** Separate queues isolate provider failure and let you scale workers per channel independently. One queue is simpler and couples everything to the slowest provider. Separate, always — this is the structural decision of the design.

**Priority lanes vs FIFO.** Transactional and bulk traffic have different urgency; a single lane means a marketing campaign delays 2FA codes. Two lanes per channel is the minimum.

**Retry aggressiveness.** More retries improve delivery for transient failures and risk duplicate charges and provider throttling. Bound attempts, back off exponentially, jitter, and never retry permanent errors.

**Idempotency: yours vs the provider's.** Your own check is necessary but has a window; the provider's key closes it. Use both when the provider supports it.

**Fail open vs closed on the policy store.** If the preference store is unreachable, do you send or suppress? For marketing, suppress — sending to someone who opted out is a legal problem. For a security alert, send. Per-category, not global.

**Push vs SMS vs email cost.** Push is essentially free, SMS costs real money per message, email is cheap but has deliverability problems. That asymmetry should shape channel selection: don't fall back to SMS automatically without a cost ceiling.

### Failure modes

- **Duplicate charges** from retries without idempotency — the expensive one.
- **Token rot.** Not consuming provider "unregistered" responses means an ever-growing share of sends go nowhere.
- **Poison messages** blocking a queue, solved by a DLQ.
- **Thundering retries** after a provider recovers, solved by jitter.
- **Notification fatigue.** The system works perfectly, users disable notifications, and delivery drops to zero permanently. Per-user rate limits and quiet hours are what protect the channel itself — the most important limit is often the one you impose on your own product.
- **Silent policy failure.** If suppression isn't distinguished from failure in metrics, a broken opt-out check looks like healthy delivery.

### Interview checklist

- Establish that **you don't control delivery** — third-party gateways define the problem.
- Route everything through **one notification service** so policy can't be bypassed.
- Name the **per-channel queues** and justify them with failure isolation, then add **priority lanes**.
- Treat **opt-out and quiet hours** as mandatory, and note that suppression is success, not failure.
- Volunteer **at-least-once + idempotency keys**; say plainly that exactly-once isn't achievable across a provider boundary.
- Cover **retry discipline**: exponential backoff, jitter, retryable vs permanent classification, bounded attempts, DLQ.
- Add a **circuit breaker** so a dead provider doesn't consume the worker pool.
- Mention **device token cleanup** from provider feedback — commonly forgotten.
- Be precise that provider **"accepted" ≠ "delivered"**.

**Key numbers:** ~580/sec average at 10M users × 5/day, but 50,000+/sec at burst · a 10M broadcast drains in ~17 min at 10k/sec · ~10 GB/day of tracking rows · push ≈ free, SMS costs per message.
