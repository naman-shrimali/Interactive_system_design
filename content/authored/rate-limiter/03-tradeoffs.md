---
version: 1
---

### Telling the client what happened

A limiter that returns a bare `429` is hostile. A well-behaved client wants to know its allowance, how much is left, and when to come back — and if you don't tell it, it will retry immediately and make things worse.

The conventional headers:

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | requests allowed per window |
| `X-RateLimit-Remaining` | requests left in the current window |
| `X-RateLimit-Reset` | when the allowance refills (epoch seconds) |
| `Retry-After` | seconds to wait — sent with the `429` |

`Retry-After` is the one that changes client behaviour, and it is worth **jittering**. If you throttle a thousand clients and tell them all to retry in exactly 30 seconds, they will all return in the same millisecond and you will throttle them again. Spread the value over a range.

Status code: `429 Too Many Requests`. `503` implies the server is broken; it isn't, it's working exactly as configured.

### Choosing the identity to limit on

| Key | Good for | Weakness |
|---|---|---|
| API key / user ID | authenticated APIs — the accurate choice | requires auth *before* limiting |
| IP address | unauthenticated endpoints | NAT and mobile carriers put thousands of users behind one IP; trivially rotated by an attacker with a proxy pool |
| IP + endpoint | login, signup, password reset | still NAT-affected |
| Device / client fingerprint | mobile apps | spoofable |

The awkward case is login. You most want to throttle it, and it is unauthenticated by definition, so you can't key on user ID. The usual answer is to limit on **both** IP and attempted username: per-IP catches one host guessing many accounts, per-username catches a distributed botnet guessing one account. Neither alone is sufficient.

### Tiering and configuration

Limits are product policy, not a constant in the code. Free tier gets 100/hour, paid gets 10,000/hour, internal services are exempt. That means the limiter reads rules from configuration that can change without a deploy, and caches them aggressively since it reads them on every request.

Rules are usually matched most-specific-first: per-user override, then per-tier, then per-endpoint, then a global default.

### What rate limiting doesn't do

Be clear about the boundary — it's a common follow-up:

- **It isn't DDoS protection.** A volumetric attack saturates your network before your limiter gets a vote. That's a job for the network edge or a scrubbing provider. A limiter protects against *abuse* by clients that reach your application.
- **It isn't a load shedder.** A limiter enforces a fixed policy; it doesn't notice that your database is struggling. Shedding based on live system health is a separate mechanism, and the two are complementary.
- **It doesn't fix hot partitions.** One client staying just under its limit while hammering one shard is within policy and still damaging.

### Trade-offs to state out loud

**Exactness vs latency.** Perfect global counting costs a synchronous round trip per request. Batching or local counters cut that dramatically at the cost of slight over-admission. Say which you chose and roughly what error you accept — "up to ~5% over the limit under peak concurrency" is a good answer.

**Burst tolerance vs smoothness.** Token bucket's `capacity` is exactly this dial. Larger capacity means happier legitimate clients and higher instantaneous downstream load.

**Availability vs enforcement.** Fail open keeps the API up and lets abuse through; fail closed does the reverse. Pick per endpoint class, not globally.

### Interview checklist

- Clarify **what identity** you're limiting on and **where the limiter sits** before choosing an algorithm.
- Default to **token bucket**; justify with cheap state and an explicit burst dial.
- Name the **fixed-window boundary bug** — it shows you know why the simple thing is wrong.
- Address the **distributed race** explicitly: `INCR` or a Lua script, not `GET` then `SET`.
- State your **failure mode** — fail open for general APIs, closed for auth.
- Return **`429` with `Retry-After`**, and jitter it.
- Volunteer that this is **not DDoS protection**.

**Key numbers:** Redis round trip ~0.5–2 ms in-datacenter · token bucket state is 2 values per client · sliding log state grows with request count, not client count · lease batching cuts round trips by the lease size.
