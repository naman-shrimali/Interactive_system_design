---
version: 1
---

File sync reuses the upload machinery and then diverges completely, because files are edited by multiple devices — which makes it a consistency problem rather than a delivery problem.

### Chunking earns its keep here

Video chunking was about resumable uploads. Sync chunking is about **not transferring what hasn't changed**.

Split each file into chunks — 4 MB is a common size — and name each by the hash of its contents. A file becomes an ordered list of chunk hashes. Now:

- Edit one paragraph of a 50 MB document and only the affected chunk's hash changes. You upload 4 MB, not 50.
- A chunk whose hash already exists in storage needn't be uploaded at all. If a hundred users have the same PDF, it's stored once. **Deduplication falls out of content addressing**, with no separate mechanism.
- Integrity is free: recompute the hash and compare.

Chunk size is a real trade-off. Smaller chunks mean finer-grained deltas and better dedup, but more metadata per file and more requests. Larger chunks mean the opposite. A fixed size is simple; content-defined chunking (boundaries chosen by a rolling hash over the content) handles insertions gracefully, because inserting a byte at the start doesn't shift every subsequent boundary. Mention the distinction — it's the difference between a design that handles prepends well and one that re-uploads the entire file.

### The metadata is the system

Object storage holds immutable chunks. A database holds everything that makes them a filesystem: files, their chunk lists, versions, owners, sharing, and the folder tree.

That split is the design. Chunks are immutable and infinitely cacheable; metadata is small, mutable, and transactional. Conflating them — say, storing the folder structure as object keys — makes rename an expensive operation instead of a single row update.

Every change produces a **new version**: a new chunk list, not a mutation of the old one. Because unchanged chunks are shared between versions, version history is cheap — a hundred versions of a document that changed by a paragraph each time cost a hundred small chunks, not a hundred copies. Old versions are reclaimed by garbage-collecting chunks that no version references.

### Detecting and propagating change

A client watches the local filesystem, notices a modification, re-chunks the file, and uploads only chunks the server doesn't already have.

Other devices must learn about it. Polling works and is wasteful; a **long-lived notification connection** is the norm — the same connection model as the chat topic, carrying a lightweight "something changed in your account" signal rather than the change itself. On receiving it, the device asks for the delta since its last known cursor.

That cursor pattern is identical to chat's per-device cursor, and it handles the same cases: a device offline for a week catches up by the same path as one that blinked.

### Conflicts

Two devices edit the same file while one is offline. Both produce a new version claiming the same parent. There is no correct automatic resolution.

Last-write-wins is simple and silently destroys work — the losing edit vanishes with no trace, which is the worst possible outcome for a product whose promise is not losing your files.

What real products do instead is **keep both**: accept the first version, and when the second arrives with a stale parent, store it as a conflicted copy — `report (Jane's conflicted copy).docx` — and surface both to the user. The system refuses to decide and makes the conflict visible. That's the right answer here, and the reasoning generalises: when the data model can't determine intent, escalate to the human rather than guessing.

Detection uses the version's parent pointer. If the parent isn't the current head, the writer branched from stale state.

### Sizing

50 million users, 10 GB stored each, 1 million active daily writing 100 MB:

- **Raw storage:** 500 PB before dedup. Dedup rates on shared corpora are substantial — the same installers, documents, and photos recur across accounts — so effective storage is considerably lower, which is exactly why dedup is a headline feature rather than an optimisation.
- **Daily writes:** 1M × 100 MB = **100 TB/day**, but with chunk-level deltas only the changed chunks transfer, cutting the wire volume dramatically for edits to existing files.
- **Metadata:** the chunk list dominates. A 10 GB account at 4 MB chunks is ~2,500 chunk references, times 50M users ≈ **125 billion rows**. Metadata, not bytes, is the scaling problem — it needs sharding by user, and it's why the metadata store deserves as much design attention as the blob store.

### Where the two systems converge

Both problems reduce to the same core: put immutable, content-addressed chunks in cheap object storage; keep small mutable metadata in a database; never route bytes through the application tier; and serve reads from an edge cache. Video adds a transcoding pipeline because playback needs many formats; sync adds versioning and conflict handling because many writers share one file.
