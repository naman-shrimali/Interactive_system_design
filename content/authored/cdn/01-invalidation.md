---
version: 1
---

Caching is easy. Deciding when a cached copy stops being valid is the hard part, and the CDN version has a specific twist: the stale copies are on machines you don't control, spread across the world.

### The headers that control it

`Cache-Control` is the mechanism; the directives worth knowing:

| Directive | Effect |
|---|---|
| `max-age=N` | cacheable by anyone for N seconds |
| `s-maxage=N` | overrides `max-age` for shared caches (the CDN) only |
| `no-cache` | may store, must revalidate before serving |
| `no-store` | never store — for genuinely sensitive responses |
| `private` | browser may cache, CDN must not |
| `immutable` | never revalidate within the TTL |
| `stale-while-revalidate=N` | serve stale for N seconds while refreshing in the background |

`s-maxage` enables a useful split: a short browser TTL so users pick up changes quickly, and a long CDN TTL so your origin is protected. The two audiences have different needs and the header lets you serve both.

`stale-while-revalidate` is underused and valuable. It removes the latency cliff at expiry — instead of one unlucky user waiting for an origin fetch, everyone gets an instant (slightly stale) response while the refresh happens behind them.

### Versioned URLs beat invalidation

The single most effective technique: **make content immutable and put the version in the URL.**

```
/static/app.a3f9c2.js      Cache-Control: max-age=31536000, immutable
```

The filename contains a hash of the contents. Deploy new code and the filename changes, so clients request a URL that was never cached and get the new file instantly. The old file remains cached harmlessly and ages out.

This eliminates invalidation entirely for versioned assets. Nothing needs purging because nothing is ever modified in place — you only ever create new objects. Build tools generate these hashes automatically, and the HTML that references them carries a short TTL so the pointer updates quickly while the assets it points to are cached for a year.

**The general principle worth stating:** prefer making content immutable over inventing ways to expire it. Cache invalidation is hard; not needing it is easy.

### When you must actually purge

Some content can't be versioned — an HTML page at a stable URL, an API response, a user-uploaded image that was replaced. Options:

- **Purge by URL.** Precise; requires knowing every affected URL. Propagation across a global edge network takes seconds to minutes, not instantly.
- **Purge by tag/surrogate key.** Tag responses when serving (`product-1234`), then purge everything with that tag. The right tool when one change affects many URLs — a product update invalidating listing pages, search results, and the detail page at once.
- **Purge everything.** The emergency lever. It works and it dumps your entire traffic load onto the origin simultaneously, so it can cause the outage it was meant to fix. Treat it as a last resort.

Note the asymmetry: purging is fast to *request* and slow to *complete* globally, so never design a flow that depends on a purge having finished.

### Serving stale on purpose

Two directives turn the CDN into an availability layer, not just a performance one:

- **`stale-while-revalidate`** — hide refresh latency.
- **`stale-if-error`** — if the origin returns an error or is unreachable, keep serving the cached copy.

`stale-if-error` is genuinely powerful: your origin can be completely down and users still see a working site for cached content. Combined with a long `s-maxage`, the CDN becomes a static fallback that costs nothing to operate. This is the concrete version of the "graceful degradation" idea from the availability topic.

### Costs and caveats

- **Cost.** CDN egress is cheaper than origin egress but not free, and low-traffic assets may cost more to distribute than they save. Caching everything indiscriminately isn't automatically economical.
- **Cold regions.** An edge with little traffic for your content evicts it, so users there repeatedly pay origin latency. Hit rate is not uniform globally.
- **Privacy.** A response that varies by user must never be cached publicly. A `private` or `no-store` header missing from an authenticated response can serve one user's data to another — this is a real and recurring incident class, so authenticated responses deserve explicit cache headers rather than defaults.
- **Debugging.** "It works for me" often means your edge has a different copy than theirs. `Age` and cache-status response headers are what you inspect first.

**Key numbers:** cross-continent round trip ~150–200 ms vs ~20 ms to a nearby edge · versioned assets `max-age=31536000` (1 year) · HTML/manifests seconds to minutes · purge propagation seconds to minutes, not instant.
