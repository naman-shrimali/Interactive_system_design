---
version: 1
---

### The routine

Run this in order. It takes two minutes and it earns the right to make architectural claims.

1. **Users.** Total, then daily active. If given monthly actives, assume 30–50% are daily.
2. **Actions per user per day.** Separate reads from writes — they diverge by orders of magnitude and the ratio drives the design.
3. **QPS.** Daily volume ÷ 100,000. Then peak ≈ 2–3× average.
4. **Size per item.** Sum the fields. Note whether media is involved, because if it is, it dominates.
5. **Storage per day**, then multiply out to the retention horizon.
6. **Bandwidth.** Storage per day ÷ 100,000 for writes; multiply by the read ratio for reads.
7. **Cache.** Apply 80/20 to the hot working set and check whether it fits in memory.
8. **Machines.** Total throughput ÷ per-machine capacity.

### Say these out loud

- The **assumptions**, before computing anything — it invites correction while correction is cheap.
- The **read:write ratio**, and what it implies. This is the single most design-relevant number you produce.
- **Which quantity dominates.** In a media system, media storage dwarfs metadata by 100× or more; in a messaging system, message count dwarfs user count. Naming the dominant term shows you know where the system's difficulty lives.
- A **sanity check** on each result.

### Rules of thumb

- **100,000 seconds per day.** The only conversion you need.
- **Peak ≈ 2–3× average**, more for consumer products with a strong daily rhythm.
- **80/20**: ~20% of content drives ~80% of traffic. Cache sizing starts here.
- **Availability multiplies** across dependencies — three 99.9% services in series ceilings at 99.7%.
- **Memory ~100× faster than SSD; SSD ~100× faster than disk seek.**
- **Cross-continent round trip ~150 ms** — geography beats optimisation.
- A single well-provisioned relational instance handles **thousands** of writes/second. Don't shard an estimate that says hundreds.

### Common mistakes

- **Estimating things that change no decision.** If the number doesn't pick a technology or a topology, skip it.
- **False precision.** 86,400 instead of 100,000 costs time and buys nothing.
- **Forgetting replication.** Storage figures are per copy; multiply by replication factor (usually 3) for provisioning.
- **Forgetting peak.** Provisioning to average means failing every evening.
- **Ignoring metadata at scale.** In chunked-storage systems the *row count* of chunk references often outgrows the bytes as the binding constraint.
- **Not converting to a decision.** End with "so we need X" — sharding, a CDN, a cache tier — or the arithmetic was decorative.

### Quick reference

| Quantity | Shortcut |
|---|---|
| Seconds per day | ~100,000 |
| Daily → QPS | daily ÷ 100,000 |
| Peak QPS | 2–3× average |
| Monthly → daily actives | × 0.3–0.5 |
| 1 million × 1 KB | 1 GB |
| 1 billion × 1 KB | 1 TB |
| 1 billion × 1 MB | 1 PB |
| Datacenter round trip | ~0.5 ms |
| Cross-continent round trip | ~150 ms |
| Memory read, 1 MB | ~10 µs |
| SSD read, 1 MB | ~1 ms |
| 99.9% availability | ~8.8 hours down/year |
| Base-62 key length | 62⁷ ≈ 3.5 trillion (7 chars) |
