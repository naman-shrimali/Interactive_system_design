---
version: 1
---

DNS turns a name into an address. It's the first thing that happens in every request, it's invisible when healthy, and it's one of the more powerful traffic-steering tools you have — which is why it deserves more than a footnote.

### The resolution path

A cold lookup for `api.example.com` walks a hierarchy:

1. **Caches first** — the browser, then the OS, then the configured resolver. Most lookups stop here, which is why DNS appears free most of the time.
2. **Root servers** — "who handles `.com`?"
3. **TLD servers** — "who handles `example.com`?"
4. **Authoritative nameserver** — the one that actually knows, and returns the record.

A cold resolution costs several round trips and can run to 100+ ms; a warm one is microseconds. That gap is why DNS lookup time shows up in page-load waterfalls for first-time visitors and vanishes for everyone else.

### Records worth knowing

| Type | Purpose |
|---|---|
| `A` / `AAAA` | name → IPv4 / IPv6 address |
| `CNAME` | name → another name (cannot coexist with other records at the same name, so not valid at a zone apex) |
| `NS` | delegates a zone to nameservers |
| `MX` | mail routing |
| `TXT` | arbitrary text — domain verification, SPF/DKIM |

The `CNAME`-at-apex restriction is a real operational constraint: `example.com` cannot be a `CNAME` to a load balancer's hostname, which is why providers offer non-standard `ALIAS`/`ANAME` records that resolve server-side.

### TTL is the dial that matters

Every record carries a **time to live** — how long resolvers may cache it. It's the central trade-off in DNS operations:

- **Long TTL** (hours): fewer lookups, faster for users, less load on your nameservers — and changes take hours to propagate.
- **Short TTL** (seconds to a minute): fast failover and quick changes — at the cost of far more query volume and a DNS lookup on the critical path more often.

The practical pattern: keep TTLs moderate normally, and **lower them well in advance** of a planned migration. Lowering a TTL only takes effect after the *old* TTL expires, so dropping it an hour before a cutover accomplishes nothing. Lower it a day ahead, migrate, then raise it again.

And the caveat worth stating in an interview: **TTLs are advisory.** Some resolvers and clients ignore them or apply their own minimums, and applications may cache a resolved address for the process lifetime. Never rely on DNS alone for fast failover — treat it as eventually consistent, and put a load balancer or health-checked proxy in front for anything that needs to move in seconds.

### DNS as a routing tool

Because you control the answer, DNS is a load-balancing and steering layer:

- **Round-robin** — return multiple A records and let clients pick. Crude and unaware of health or load, but free.
- **Geo/latency-based** — return the address of the nearest or fastest region. This is how a global service directs users to a local datacenter, and how CDNs point you at a nearby edge.
- **Weighted** — split traffic by percentage. The mechanism behind gradual migrations and canary regions.
- **Failover** — health-check endpoints and stop returning unhealthy ones.

This is genuinely global load balancing — it happens before any packet reaches your infrastructure, so it's the only layer that can steer traffic *away* from a region that's entirely down.

### What to say about it

In most designs DNS is one box on the diagram, and that's appropriate. Mention it when:

- **Multi-region routing** is in scope — geo-based DNS is how users reach the nearest region.
- **Failover** is discussed — and then immediately note the TTL caveat, because that's the part people get wrong.
- **CDN integration** — the CDN's hostname is where your DNS points.
- **Availability composition** — your DNS provider is a dependency, and a single-provider outage takes you offline no matter how redundant your servers are. Serious deployments use two providers.
