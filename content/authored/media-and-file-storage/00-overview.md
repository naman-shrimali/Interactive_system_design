---
version: 1
---

This topic covers two systems that look different and are secretly the same problem: **video streaming** (YouTube, Netflix) and **file sync** (Dropbox, Google Drive). Both take large binary blobs from users, store them durably and cheaply, and serve them back fast — and both discover that the interesting engineering is never in the storage itself.

Putting them together is deliberate. Once you've seen chunked upload, deduplication, and CDN delivery in one, the other is mostly a re-arrangement of the same pieces.

### What they share

- **The file never touches your application servers.** Routing gigabytes through your API tier wastes bandwidth and turns a stateless service into a bottleneck. Clients upload directly to blob storage using a pre-signed URL; your API only issues the credential and records metadata.
- **Metadata and blobs live in different systems.** A relational database holds the filename, owner, version, and permissions — small, structured, transactional. Object storage holds the bytes — huge, immutable, cheap. Conflating them is the most common early mistake.
- **Big files are chunked.** Uploading 10 GB as one HTTP request means a dropped connection at 95% costs you everything. Split into fixed-size chunks and each one retries independently, resumes after a failure, and uploads in parallel.
- **Reads are served from a CDN, not from origin.** Popular content is requested far more than it changes, which is the exact profile edge caching was built for.

### Where they diverge

**Video is write-once, read-astronomically.** A video is uploaded once and watched a million times, so you can afford to spend enormous compute *once* at upload: transcoding into a ladder of resolutions and bitrates (240p through 4K), segmenting each into a few seconds of playback, and generating the manifest that lets a player switch between them mid-stream as bandwidth changes. That transcoding pipeline — a DAG of parallel jobs driven by a queue — is the heart of the design.

**File sync is read-write by many devices, and that's a consistency problem.** The same file is edited on a laptop and a phone, possibly while one is offline. You need to detect changes, transfer only what changed (which is where chunk-level deduplication earns its keep — edit one paragraph of a 50 MB document and you upload one chunk), notify other devices that something moved, and resolve the case where two devices edited the same file independently. There is no correct automatic answer to that last one, which is why real products keep both versions and let the human decide.

### The follow-ups

Storage cost dominates at scale, so expect questions about tiering cold data to cheaper classes and about how deduplication interacts with encryption. Expect "how do you resume an interrupted upload," which chunking answers directly. And expect "how do you know a chunk arrived intact" — content-addressed chunks, named by their own hash, answer that and give you dedup for free.
