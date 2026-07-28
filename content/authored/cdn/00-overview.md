---
version: 1
---

A CDN is a network of servers positioned close to users that caches your content and serves it from there. The motivation is not clever engineering — it's the speed of light.

### Why proximity is the whole story

A round trip from Sydney to Virginia is on the order of 200 ms, and no optimisation removes it. A page that makes even a handful of sequential requests to a distant origin feels slow regardless of how fast your servers are.

Serving from an edge 20 ms away collapses that. And because latency compounds — TCP handshake, TLS negotiation, then the request itself — cutting the round trip cuts every phase at once. Terminating TLS at the edge is a substantial part of the win, often more than the cached bytes themselves.

The secondary benefits are real too: origin load drops dramatically at a good hit rate, bandwidth costs fall since CDN egress is cheaper than origin egress, and the CDN absorbs traffic spikes and volumetric attacks before they reach you.

### What belongs on a CDN

**Ideal:** static assets (JS, CSS, images, fonts), video segments, downloads — anything immutable, requested far more often than it changes, and identical for every user.

**Workable with care:** API responses that are cacheable for seconds, personalised pages assembled at the edge, HTML with a short TTL.

**Not suitable:** anything unique per user on every request, or where staleness is unacceptable.

The useful test is **the request-to-change ratio.** Content requested a million times between changes is perfect. Content that changes on every request gains nothing and adds a hop.

### Push and pull

**Pull** (the default): the first request for an object misses at the edge, the CDN fetches from your origin, caches it, and serves subsequent requests locally. Zero operational effort — you change nothing about how you serve files. The cost is that the first user in each region pays the full origin round trip, and cold content is repeatedly re-fetched after eviction.

**Push:** you upload content to the CDN ahead of demand. Right for large files with predictable traffic and for scheduled launches, where you don't want a million simultaneous cold misses. The cost is that you now manage what's on the CDN and when it expires.

Most services use pull, with push reserved for known events. This is essentially the same **pre-warming** idea as the video topic: for a scheduled release, populate the edges before the audience arrives, because a thundering herd of cold misses hits your origin with exactly the load the CDN was supposed to absorb.

### The hit rate is the number that matters

CDN value is roughly proportional to hit rate, and the things that quietly destroy it are worth knowing:

- **Cache-busting query strings.** If URLs carry unique parameters, every request is a distinct object and nothing is ever a hit. Configure which query parameters are part of the cache key.
- **Vary headers.** Varying on a header with many values fragments the cache into many copies of the same object.
- **Cookies.** Many CDNs won't cache responses with `Set-Cookie`, so an unnecessary cookie on a static asset silently disables caching.
- **Short TTLs everywhere.** A one-minute TTL on content that changes weekly throws away most of the benefit.

Hit rate is worth monitoring directly. A regression usually means someone changed a header, not that traffic patterns shifted.

### Where it sits

DNS points at the CDN hostname, so the CDN is the first thing a client reaches. It serves what it can from cache and forwards the rest to your origin. That ordering matters for the design: the CDN sees all traffic, which is why it's also the natural place for TLS termination, basic request filtering, and DDoS absorption.

The next section covers the harder half — TTLs, versioning, and invalidation — which is where most of the real operational difficulty lives.
