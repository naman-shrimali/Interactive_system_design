---
version: 1
---

### Sizing it

Assume 10 million searches per day and an average query of 4 words / 20 characters.

- **Queries:** 10M/day ≈ 116/second average, call it ~500/second at peak.
- **Autocomplete requests:** here's the twist. With debouncing, a 20-character query produces perhaps 4–6 requests. So the autocomplete tier serves roughly **5× the search volume** — ~2,500 requests/second at peak. Without debouncing it would be 20×. That multiplier is the number to state, because it's what makes this a read-heavy problem.
- **Unique terms:** 10M daily searches contain far fewer unique strings — a power law means maybe 1–2 million distinct terms, and after dropping everything below the frequency floor, perhaps **200,000** are worth storing.
- **Trie size:** 200k terms × ~20 characters ≈ 4M characters of path, heavily shared at the prefix. With top-5 lists of 4-byte IDs at each of ~2M retained nodes, that's on the order of **a few hundred megabytes to a couple of gigabytes**.

That last figure is the important one: **it fits in memory on one machine.** So the answer is replicate, not shard, and say so explicitly.

### Trade-offs

**Precomputed top-k vs computing on read.** Precomputing makes reads flat and fast at the cost of storage and build time. Computing on read keeps the trie small and makes popular prefixes catastrophically slow. Precompute — but cap prefix length so storage stays bounded.

**Batch freshness vs real-time.** Hourly rebuilds are simple and adequate for almost everything; a small streaming side channel handles trending terms without disturbing the bulk pipeline. Full incremental updates to a live trie reintroduce concurrency into the component that was deliberately immutable.

**Replicate vs shard.** Replicating is simpler in every way and works as long as the trie fits in memory. Shard only when forced, by first characters, with ranges balanced by measured traffic rather than alphabet.

**Global vs personalised.** Global suggestions are cacheable and shared. Personalisation breaks both; confine it to re-ranking a short candidate list per user.

**Debounce delay.** Longer debounce means fewer requests and a slightly less responsive feel. 50–100 ms is the usual compromise and is worth naming as a tunable.

### Failure modes

- **Hot prefix without precomputation** — a single-character prefix triggering a full subtree scan. This is the failure the whole design exists to prevent.
- **Trie swap under load.** Loading a multi-gigabyte structure while serving means briefly holding two copies in memory. Size machines for 2× the trie, or swap on a drained replica and rotate.
- **Pipeline silently stale.** If the build job fails repeatedly, serving keeps working perfectly against an increasingly old trie — the worst kind of outage, because nothing alerts. Monitor **trie age**, not just build success.
- **Unfiltered suggestions.** A single offensive completion is a public incident. Serving-time filtering is what lets you fix it in seconds.

### Interview checklist

- Establish the **latency budget** and the **request multiplier** (one request per keystroke, cut by debouncing) early — that framing makes everything else follow.
- **Split the system in two** — serving and data gathering — and note that the hard latency requirement applies only to the simple half.
- Explain why a **plain trie is insufficient** (subtree scan on hot prefixes) before introducing **precomputed top-k**.
- Mention **capped prefix length** and **term IDs** as the storage mitigations.
- Say the trie is **immutable and swapped atomically**, and connect that to the freshness relaxation.
- Check whether it **fits in memory** before sharding; prefer replication.
- Cover **safety filtering at serving time** and the **frequency floor** as a privacy mechanism.
- Volunteer **debouncing and client-side caching** — it shows you're thinking about total system load, not just the server.

**Key numbers:** ~5× more autocomplete requests than searches after debouncing · sub-100 ms budget end to end · ~200k terms worth storing from 10M daily searches · trie in the hundreds of MB to low GB — one machine, replicated · 50–100 ms debounce.
