---
version: 1
---

A rate limiter caps how many requests a client can make in a window of time. Past the cap, the extra requests are rejected — conventionally with HTTP `429 Too Many Requests` — rather than being served.

It sounds like a small feature. It's actually one of the few components that protects everything behind it, which is why interviewers like it: it touches algorithms, distributed state, race conditions, and product policy in one question.

### Why systems need one

- **Preventing resource starvation.** One buggy client in a retry loop can consume the capacity you provisioned for everyone. A limiter turns "the site is down" into "one client is throttled."
- **Cost control.** If each request triggers an expensive downstream call — an LLM inference, an SMS, a third-party API billed per call — unbounded traffic is unbounded spend.
- **Security.** Rate limiting is the cheapest defense against credential stuffing and brute-force password guessing. It doesn't stop an attacker; it makes the attack take years instead of hours.
- **Fairness across tenants.** In a multi-tenant system, limits are how you stop one customer's batch job from degrading everyone else's latency.

### The decisions you have to make

A design interview on this topic is really four questions wearing a trench coat:

**Where does it live?** Client-side is unreliable — anyone can bypass it. Server-side in each service is accurate but duplicated. A gateway or middleware layer in front of your services is the usual answer, because it's one place to configure and it protects services that haven't thought about limiting at all.

**What's the identity?** Per user ID, per IP, per API key, per endpoint, or a combination. IP-based limiting is easy but punishes everyone behind a corporate NAT or mobile carrier gateway; user-based limiting requires the request to be authenticated before you can throttle it, which is awkward for login endpoints — exactly the ones you most want to protect.

**Which algorithm?** Token bucket, leaking bucket, fixed window, sliding window log, and sliding window counter each trade memory against precision at the window boundary. The next section works through all five.

**How does it stay correct across many machines?** With ten gateway nodes and one shared limit, the counter has to be shared — which means a network hop to Redis on every request, and a read-then-write race that will over-admit under load unless you handle it deliberately. That's the genuinely hard part, and it's where the deep dive goes.

### What "correct" means here

Perfect enforcement is not the goal. A limiter that occasionally admits 101 requests against a limit of 100 is fine; one that adds 50ms of latency to every request, or that fails closed and takes down your API when Redis blips, is not. Throughout this topic, prefer the approximate-but-fast answer and be explicit about the error you're accepting.
