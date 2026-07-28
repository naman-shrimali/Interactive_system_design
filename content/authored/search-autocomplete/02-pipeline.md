---
version: 1
---

The other half of the system answers "what are people searching for, and how often?" It consumes a firehose, produces a trie, and has no latency requirement at all.

### The stages

```
search box → log → aggregate → rank → build trie → ship to serving tier
```

**Logging.** Every executed search appends a row: the query string, a timestamp, and whatever dimensions you need for filtering (locale, device, maybe an anonymised user bucket). Log the *submitted* query, not every keystroke — keystrokes are prefixes of the thing you actually want to count.

This is a high-volume append-only stream, so it goes to a log system like Kafka rather than a database. That gives you replay, which matters: when a ranking bug ships, you want to rebuild from raw events rather than discover the inputs are gone.

**Aggregation.** Batch jobs roll raw events into counts per query per time window — hourly is a reasonable grain. Downstream stages read aggregates, never raw logs, which cuts data volume by orders of magnitude immediately.

**Ranking.** Turn counts into a score. The naive score is raw frequency, and it has an obvious flaw: it's dominated by whatever was popular a year ago and responds to nothing. Use a **time-decayed** count, weighting recent windows more heavily, so trends surface and dead terms fade. An exponential decay over daily buckets is simple and works.

Filtering also happens here: drop queries below a frequency floor (they're noise, often typos), normalise case and whitespace, and collapse near-duplicates.

**Build.** Take the top terms by score, insert into a fresh trie, compute top-k at every node bottom-up, serialise. Bottom-up matters — a node's top-k is derivable from its children's, so one post-order pass computes the whole structure rather than re-scanning descendants per node.

**Ship.** Push the serialised trie to the serving tier, which loads it and swaps atomically.

### Why the split works

The serving tier has a hard 100 ms budget and no write path. The pipeline has no latency budget and does all the heavy computation. Neither constrains the other.

Concretely, that means the pipeline can be a batch job that runs hourly, fails, retries, and runs again — and users notice nothing, because the serving tier is still happily answering from the last good trie. The only coupling is one artefact handed over at the end.

Being explicit about that split early is most of what this question is testing.

### Freshness: batch, or something faster

Hourly rebuilds are fine for the long tail and wrong for breaking news, where a term goes from unknown to enormously popular in minutes.

Options, in increasing order of complexity:

- **Rebuild more often.** Simple, and bounded by build time. If a full build takes 20 minutes, hourly is comfortable and 30-minute builds are not.
- **A real-time side channel.** Keep a small, separately-maintained set of trending terms updated from a streaming job with a short window, and merge it into results at query time. The bulk trie stays on its slow cycle; only a tiny hot set moves fast. This is the usual production answer.
- **Incremental updates to the live trie.** Tempting and rarely worth it — you reintroduce concurrent mutation into the one component you deliberately made immutable.

State the assumption plainly: suggestions may be minutes stale, and that is a product decision that buys a great deal of architectural simplicity.

### Safety filtering

Suggestions are put in users' mouths, so they carry reputational and legal risk that ordinary search results don't. A term appearing in the dropdown looks like an endorsement.

Apply the blocklist **at serving time**, not only at build time. Both matter, but serving-time filtering means a newly-discovered problem term disappears from suggestions the moment the list updates, rather than at the next rebuild. The cost is filtering a handful of entries per request, which is negligible — fetch `k + margin` from the node and drop blocked terms before returning `k`.

Also filter personally identifying strings: people paste surprising things into search boxes, and a query typed once should never reach the frequency floor anyway. The floor is a privacy mechanism as much as a quality one.

### Personalisation, if asked

Personalised suggestions mean the answer depends on the user, which breaks the shared cache and the shared trie — the two things making this system cheap.

The workable pattern is to keep the global trie as the source of candidates and re-rank the top `k + margin` per user using a small profile (recent searches, locale). Personalisation touches only a short list at request time, and the expensive shared structure stays shared. Scope it out unless asked; if asked, propose exactly this.
