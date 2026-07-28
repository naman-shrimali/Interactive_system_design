---
version: 1
---

### Trade-offs

**Chunk size.** Small chunks give finer deltas and better deduplication at the cost of more metadata rows and more requests per file. Large chunks invert it. 4 MB is a reasonable default; the metadata row count is what constrains you at scale.

**Fixed vs content-defined chunking.** Fixed boundaries are trivial to implement and break badly on insertion — prepend one byte and every boundary shifts, so the whole file re-uploads. Content-defined boundaries (rolling hash) survive insertions and cost more CPU. Worth naming even if you pick fixed.

**Eager vs lazy transcoding.** Transcoding the full ladder up front means instant playback at any quality and wastes most of the compute, since most uploads are barely watched. Lazy generation beyond a couple of common renditions saves the majority of that spend at the cost of a slower first request for rare renditions. Popularity is heavily skewed, so lazy usually wins.

**Storage tiering.** Hot storage is fast and expensive; cold is a fraction of the price with slower first-byte and retrieval fees. Content access follows a steep power law, so tiering by recency and popularity is the single largest cost lever in both systems.

**Dedup vs encryption.** These conflict, and it's a good thing to raise unprompted. Deduplication requires that identical plaintext produce identical ciphertext, so it only works with a shared key across users — which means the provider can read the data. Per-user encryption keys make cross-user dedup impossible. You can have provider-side dedup or true end-to-end encryption, not both. Convergent encryption (key derived from content) partially bridges this and leaks whether you possess a known file.

**Sync latency vs battery and load.** Aggressive change detection propagates faster and drains mobile batteries while multiplying connections. Batching and backoff when idle is the usual compromise.

**Last-write-wins vs conflicted copies.** LWW is one line of code and silently destroys work. Conflicted copies are mildly ugly and never lose data. For a storage product, never lose data.

### Failure modes

- **Upload through the API tier.** The mistake that makes everything else worse — bandwidth, connection exhaustion, and a stateless service that isn't.
- **Thundering herd on release.** A million viewers hitting cold CDN edges simultaneously. Pre-warm.
- **Unbounded version history.** Cheap per version, unbounded over time. Needs a retention policy and chunk garbage collection.
- **Orphaned chunks.** Delete a file, and its chunks may still be referenced by an old version or another user's identical file. Deleting chunks requires reference counting or mark-and-sweep; getting this wrong either leaks storage forever or corrupts other users' files. The second failure is much worse, so bias toward leaking.
- **Metadata hot-spotting.** One user with millions of files concentrates load on one shard.
- **Silent sync failure.** A client that stops syncing while claiming to be up to date is the worst outcome for a storage product — monitor client-reported sync lag, not just server health.

### Interview checklist

- Say early that **bytes never traverse the application tier** — pre-signed URLs direct to object storage.
- **Chunk** everything, and give both reasons: resumable/parallel uploads, and delta transfer plus dedup via content addressing.
- **Separate metadata from blobs** and be explicit about what each store is good at.
- For video: the **transcoding ladder → segments → manifest** chain, and connect it to **adaptive bitrate** switching between segments.
- Note transcoding is the **dominant compute cost**, suited to spot instances and lazy generation.
- Serve from a **CDN** and mention pre-warming for scheduled releases.
- For sync: **versions with parent pointers**, change notification over a persistent connection, and **per-device cursors** — the same mechanism as chat.
- On conflicts, refuse LWW and propose **conflicted copies**.
- Volunteer the **dedup vs encryption** conflict; it demonstrates you understand why dedup works.
- Point out that at scale the **metadata is the harder problem** than the bytes.

**Key numbers:** 4 MB chunks · 500 hours/minute upload ≈ 8.3 GB/sec ingest, ~720 TB/day source · transcoded ladder 3–5× source · 50M users × 10 GB = 500 PB before dedup · ~125 billion chunk-reference rows — metadata, not bytes, is the constraint.
