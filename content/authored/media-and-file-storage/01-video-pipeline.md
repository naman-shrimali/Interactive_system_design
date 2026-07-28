---
version: 1
---

A video is uploaded once and watched a great many times. That asymmetry justifies spending heavily at upload to make every subsequent playback cheap.

### Upload

The video must not pass through your application servers. Routing gigabytes through the API tier wastes bandwidth, ties up connections for minutes, and turns a stateless service into a bottleneck.

Instead: the client asks the API for permission, the API returns a **pre-signed URL** granting time-limited write access to one object-storage key, and the client uploads directly to storage. Your API handles a small JSON request and a metadata row; the bytes never touch it.

Large files are **chunked** — typically 5–10 MB parts. Each part uploads independently, which gives you three things: retry of a single failed part rather than the whole file, parallel uploads to saturate the client's bandwidth, and resumability after a dropped connection. Object stores support this natively as multipart upload; you don't build it.

Name each chunk by the **hash of its content**. That makes the upload verifiable (recompute and compare) and gives deduplication for free — a chunk whose hash already exists needn't be uploaded at all.

### Transcoding

The uploaded file is one format at one resolution. Playback needs many, because viewers arrive on a phone over cellular and on a TV over fibre, and the difference is two orders of magnitude of bandwidth.

Transcoding produces a **ladder**: the same content at 240p, 360p, 480p, 720p, 1080p, 4K, each at an appropriate bitrate. Each rendition is cut into **segments** of a few seconds, and a **manifest** lists what exists.

That structure is what enables adaptive bitrate streaming. The player fetches the manifest, starts at a conservative rendition, measures its own throughput, and switches rendition **between segments** as conditions change. Because segments are independent and aligned across renditions, switching is seamless — the viewer sees quality change, not a stall. This is what HLS and DASH standardise.

The job graph is a DAG driven by a queue: inspect the file, then fan out one job per rendition (independent, embarrassingly parallel), plus side jobs for thumbnails, captions, and content fingerprinting. When all complete, write the manifest and mark the video watchable.

Transcoding is CPU-bound and expensive — often the largest compute line item. Two consequences worth stating: it's an ideal fit for preemptible/spot instances, since jobs are retryable and nothing is lost by eviction; and you should transcode the full ladder lazily for unpopular content. Most uploads are watched by almost nobody, so generating 4K for all of them wastes most of the spend. Generate a couple of common renditions immediately and the rest on first demand.

### Delivery

Segments are static, immutable files requested far more often than they change — the perfect CDN workload. The player fetches the manifest, then pulls segments from the edge; origin sees traffic only on cache misses.

Popularity follows a steep power law, so a small fraction of content drives most requests and CDN hit rates are high. For a big scheduled release, **pre-warm** the CDN by pushing segments to edges before launch rather than letting the first million viewers all miss simultaneously.

Because segment URLs are content-addressed and immutable, they can be cached essentially forever. The manifest gets a short TTL, since it's the thing that changes when a new rendition finishes.

### Metadata

Everything that isn't bytes — title, description, owner, visibility, duration, view count, the manifest location — lives in a database, not object storage. It's small, structured, queried in many ways, and wants transactions.

View counts are the exception: they're a high-volume counter that doesn't need to be exact or immediate. Buffer and aggregate them rather than issuing a database write per playback.

### Sizing

500 hours uploaded per minute, 1 GB per hour of source:

- **Ingest:** 500 GB/minute ≈ **8.3 GB/second** of raw upload.
- **After transcoding**, the full ladder is typically several times the source, so budget 3–5× raw for stored output.
- **Daily:** 500 × 60 × 24 = 720,000 hours/day ≈ 720 TB/day of source, low petabytes/day once transcoded.

Those figures explain why storage tiering is not optional: recent and popular content on fast storage, the long tail on cold storage that costs a fraction as much and is slower to first byte — acceptable for a video nobody has watched in two years.
