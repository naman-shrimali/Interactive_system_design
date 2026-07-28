---
version: 1
---

### The numbers to know

**Powers of two** — for converting to storage units:

| Power | Approx value | Name |
|---|---|---|
| 2¹⁰ | 1 thousand | 1 KB |
| 2²⁰ | 1 million | 1 MB |
| 2³⁰ | 1 billion | 1 GB |
| 2⁴⁰ | 1 trillion | 1 TB |
| 2⁵⁰ | 1 quadrillion | 1 PB |

**Typical sizes** — enough to estimate storage from a data model:

| Item | Size |
|---|---|
| `char` / ASCII byte | 1 B |
| Integer / timestamp | 4–8 B |
| UUID | 16 B |
| Short text field (name, title) | ~50 B |
| A tweet-length message | ~200 B |
| A row of structured metadata | ~1 KB |
| Web page (HTML) | ~100 KB |
| Compressed photo | ~200 KB – 2 MB |
| Minute of video (transcoded) | ~10–20 MB |

**Latency numbers**, rounded to what's worth remembering:

| Operation | Time |
|---|---|
| L1 cache reference | ~1 ns |
| Main memory reference | ~100 ns |
| SSD random read | ~100 µs |
| Read 1 MB sequentially from memory | ~10 µs |
| Read 1 MB sequentially from SSD | ~1 ms |
| Round trip within a datacenter | ~0.5 ms |
| Disk (HDD) seek | ~10 ms |
| Round trip across continents | ~150 ms |

The three conclusions that matter: **memory is ~100× faster than SSD, SSD is ~100× faster than a disk seek, and a cross-continent round trip dwarfs everything you do locally.** That last one is why you put data near users and why a chatty protocol across regions is fatal.

**Availability** — what nines cost you:

| Availability | Downtime per year | Per day |
|---|---|---|
| 99% | 3.65 days | 14 m |
| 99.9% | 8.8 hours | 86 s |
| 99.99% | 53 minutes | 8.6 s |
| 99.999% | 5.3 minutes | 0.86 s |

Availability of dependencies **multiplies**. A service calling three dependencies each at 99.9% has a ceiling of 99.7% — worse than any individual part. This is the single strongest argument against gratuitous service decomposition, and it's worth saying out loud when someone proposes a chain of six synchronous calls.

### Worked example: a Twitter-like feed

**Assumptions:** 300 M monthly users, 50% daily active → **150 M DAU**. Each posts 2 tweets/day. Each tweet ~300 B including metadata. 10% contain media averaging 1 MB. Read-to-write ratio ~100:1.

**Write QPS**
```
150M users × 2 tweets = 300M tweets/day
300M / 100,000 s = 3,000 writes/second
peak ≈ 2× → 6,000 writes/second
```
3,000 writes/second is meaningful but not exotic — a sharded relational database or a wide-column store handles it. It does *not* require anything heroic, and saying so is the point.

**Read QPS**
```
100 × 3,000 = 300,000 reads/second
```
Two orders of magnitude more reads than writes. That single ratio justifies read replicas, an aggressive cache layer, and precomputing feeds at write time rather than assembling them per read.

**Storage**
```
text:  300M × 300 B     = 90 GB/day
media: 300M × 10% × 1MB = 30 TB/day
```
Text is trivially small; **media is 300× larger and dominates completely.** Five years of media is ~55 PB, and that's before replication. The design consequence is immediate: text goes in a database, media goes in object storage behind a CDN, and they are never the same system.

**Bandwidth**
```
30 TB/day ingest / 100,000 s ≈ 300 MB/second write
reads at 100:1 ≈ 30 GB/second served
```
30 GB/s cannot come from your origin — that is the number that makes a CDN non-negotiable rather than an optimisation.

**Cache sizing.** Apply the 80/20 rule: if 20% of tweets generate 80% of reads, caching one day of hot text is `90 GB × 20% ≈ 18 GB` — comfortably in memory on a couple of machines. So caching the text tier is cheap and effective, while caching media is the CDN's job.

### Worked example: a URL shortener

**Assumptions:** 100 M new URLs/day, read-to-write 10:1, each record ~500 B, 5-year retention.

```
writes: 100M / 100,000 s      = 1,000/second
reads:  10 × 1,000            = 10,000/second
storage: 100M × 500 B         = 50 GB/day
5 years: 50 GB × 365 × 5      ≈ 91 TB
```

**How long must the short key be?** 100 M/day × 365 × 5 ≈ **182 billion URLs**. With base-62 characters (`a–z`, `A–Z`, `0–9`):

- 62⁶ ≈ 56 billion — not enough
- 62⁷ ≈ 3.5 trillion — comfortable

So **7 characters**. That's a concrete design output produced entirely by arithmetic, and it's exactly the kind of answer estimation is for.
