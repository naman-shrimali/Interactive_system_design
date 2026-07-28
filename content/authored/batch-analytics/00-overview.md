---
version: 1
---

Some questions cannot be answered on the request path. "What are the top-selling products in each category?" requires looking at every sale; "which category does this transaction belong to?" requires a model trained on history. You cannot do either while a user waits.

Batch processing is the answer: run the expensive computation offline on a schedule, store the result, and serve the stored result instantly.

### When batch is the right shape

- **The computation needs a global view.** Ranking requires seeing everything before you can order anything. There is no incremental shortcut that is also correct.
- **The answer tolerates being stale.** Yesterday's sales rank is fine. Today's, computed hourly, is fine. If the requirement is "within seconds", you need streaming instead.
- **Reprocessing matters.** Keep the raw events and a bug in your ranking logic is fixed by rerunning the job. Systems that only keep derived data cannot recover from a bad derivation.
- **The work is embarrassingly parallel.** Partition the input, process independently, combine. That is exactly the shape MapReduce formalises.

### The two worked examples in this topic

**Transaction categorisation** — take a stream of financial transactions and label each one (groceries, rent, travel). Per-transaction the work is small; across hundreds of millions it is substantial, and it benefits from a global view of merchant names.

**Category ranking** — compute the best-selling item per category. The canonical MapReduce shape: map each sale to `(category, amount)`, group by category, reduce to a sorted list.

They differ in an instructive way. Categorisation is *per record* and could plausibly be done on write; ranking is *across all records* and cannot. That distinction — whether the computation needs to see everything — is usually what decides batch versus streaming.

### The structural point

The pipeline and the serving path are separate systems that touch through exactly one artefact: a precomputed result set, swapped in atomically when the job completes.

That decoupling is what makes the whole thing work. The pipeline can be slow, can fail, can retry, and can run late — and users notice nothing, because the serving path is still reading the previous result. Meanwhile the serving path has no computation to do at all, so it is trivially fast and cacheable.

If you take one thing from this topic, take that shape. It recurs everywhere: the autocomplete trie built offline and swapped in, the news feed precomputed at write time, the CDN holding a rendered artefact. **Move the expensive work off the path where someone is waiting, and hand over a finished result.**

### The failure mode nobody notices

When a batch job fails, nothing breaks. Serving keeps working perfectly against an increasingly old result set, dashboards stay green, and no alert fires — until someone notices the numbers have not moved in a week.

Monitor **result age**, not just job success. This is the same trap as a stale autocomplete trie, and it catches people repeatedly.
