---
version: 1
---

Take a long URL, return a short one, and redirect anyone who visits it. The functional requirement fits in a sentence, which is exactly why it is a good interview question — there is nowhere to hide behind product complexity, and the whole conversation is about scale and trade-offs.

### Scoping it

- **Shorten:** given a long URL, return a short key. Optionally accept a custom alias and an expiry.
- **Redirect:** given a short key, send the browser to the original URL.
- **Scale:** say 100 million new URLs per day, with reads outnumbering writes by roughly 10:1.
- **Availability:** a dead redirect service breaks every link ever shared. This is a system where availability matters more than consistency — a redirect served from a slightly stale cache is fine; an error page is not.
- **Out of scope** unless asked: analytics, spam detection, user accounts.

### What the numbers tell you

Estimation does real work here, and it produces a concrete design output rather than a vague sense of size:

```
writes:   100M / 100,000 s   = 1,000 /sec
reads:    10 × writes        = 10,000 /sec
storage:  100M × 500 B       = 50 GB/day  →  ~91 TB over 5 years
keyspace: 100M × 365 × 5     ≈ 182 billion URLs needed
```

Base-62 gives 62⁶ ≈ 56 billion — not enough — and 62⁷ ≈ 3.5 trillion, comfortably enough. **So the short key is 7 characters**, derived entirely from arithmetic. That is the kind of answer estimation exists to produce.

The read:write ratio is the other load-bearing number. Ten reads per write, on data that is *immutable once created*, points straight at aggressive caching — and immutability means those cache entries never need invalidating, which makes this one of the easiest caches anyone will ever operate.

### The two decisions

**Where does the key come from?** Encoding a counter guarantees uniqueness structurally but needs a sequence; hashing the URL is stateless but requires collision handling. This is the heart of the design and it connects directly to distributed ID generation.

**How do you serve reads fast?** A cache in front of a store sharded by key. Because entries are immutable and popularity is heavily skewed, hit rates are high and staleness is a non-issue.

### The follow-ups worth pre-loading

- **301 or 302?** A permanent redirect lets browsers cache it and skips your servers on subsequent visits — cheaper, but you lose click analytics. A temporary redirect keeps every click coming to you. That is a product decision disguised as an HTTP one, and saying so is the right answer.
- **Custom aliases** need a reservation path and a blocklist, and must not collide with generated keys.
- **Expiry** turns an append-only store into one that also deletes, which changes your storage growth curve and needs a cleanup job.
- **Abuse.** Short links hide their destination, so a shortener is a phishing tool by default. Rate limit creation and check destinations against a safe-browsing list.
