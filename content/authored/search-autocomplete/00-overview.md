---
version: 1
---

Autocomplete is the dropdown that appears as you type in a search box: type `sys`, see `system design`, `system design interview`, `systemd`. Google calls it "autocomplete," Amazon calls it "search suggestions," and the design problem is the same.

What makes it a good interview question is the latency budget. Suggestions have to appear *while the user is still typing* — a useful target is under 100ms end to end, and you get a request on nearly every keystroke. Type an eight-character query and you may have issued eight requests. So the system is extraordinarily read-heavy, extremely latency-sensitive, and allowed to be slightly stale. That combination points at a very specific architecture.

### Scoping it

- Return the **top 5** suggestions for a prefix, ranked by popularity.
- Support the ~26-character Latin alphabet plus digits; normalize case and trim whitespace.
- Suggestions come from what users actually search for, not a curated dictionary — so the system learns.
- **Freshness is negotiable.** A term that starts trending can take minutes or even an hour to appear. Nobody notices, and admitting this early buys you an enormous amount of architectural freedom.
- Spell correction and personalization are explicitly out of scope unless the interviewer asks.

### Why it splits cleanly in two

The elegant thing about this problem is that it decomposes into two systems that barely touch:

**The serving path** answers "given this prefix, what are the top 5?" in single-digit milliseconds. It's read-only, it's cacheable, and it can be replicated as widely as you need. The data structure here is a trie, but a plain trie isn't enough — walking every descendant of a prefix node to rank them is far too slow for a hot prefix like `a`. The fix is to *precompute* the top-k at each node, turning a traversal into a single lookup.

**The data-gathering path** answers "what are people searching for, and how often?" It consumes a firehose of query logs, aggregates counts over a window, and periodically rebuilds the trie. It's a batch pipeline. It can be slow, it can fail and retry, and none of that is visible to the user typing in the box.

Once you've separated them, the hard requirement (100ms) applies only to a simple read service, and the messy requirement (aggregate billions of events) has no latency pressure at all. Getting to that split quickly is most of what's being tested.

### The follow-ups worth pre-loading

- How big is the trie, and does it fit in memory on one machine? If not, how do you shard by prefix without hot-spotting on common letters?
- How do you update the trie without a pause — build a new one offline and swap it atomically?
- How do you keep offensive or unsafe terms out of suggestions? A filter layer at serving time, so you can update the blocklist without rebuilding.
