---
version: 1
---

### Sizing it

Take 50 million daily active users, 40 messages each per day, average message 100 bytes.

- **Messages:** 50M × 40 = **2 billion per day** ≈ 23,000 writes/second average. Peak is several times that — chat is spiky around waking hours in each timezone — so design for roughly 100,000 writes/second.
- **Storage:** 2B × 100 bytes = 200 GB/day of message body, before replication and indexing. Call it ~1 TB/day at replication factor 3 with overhead, and around **350 TB/year**. That number is why retention policy and cold-tiering are product decisions with real budget attached.
- **Connections:** if 10% of DAU are online concurrently, that's **5 million open sockets**. At a conservative 10 KB of kernel and application memory per connection, roughly 50 GB of RAM purely to hold connections — and if one server handles 100,000 sockets, about **50 connection servers** before any redundancy.

The connection count is the number that surprises people, and it's the one that justifies a separate connection tier.

### Trade-offs worth stating

**Store once per conversation vs copy per recipient.** Storing once keeps writes cheap and is the norm for chat, since reads are always scoped to a conversation. Copying per recipient makes each user's unread state trivially local but multiplies write volume by group size. Chat picks the former; feeds often pick the latter.

**WebSocket vs long polling.** WebSocket is better on every axis except compatibility. Keep long polling as a fallback, and be honest that maintaining both is real complexity.

**Push vs pull for group fan-out.** Direct push per member gives the lowest latency and costs O(members) per message. A change signal plus client pull is cheap to send and costs an extra round trip. Small groups push; large ones signal.

**Strict ordering vs cost.** Per-conversation ordering via a server-assigned ID is cheap and sufficient. Total causal ordering across conversations needs logical clocks and buys nothing a user can perceive.

**Encryption.** End-to-end encryption is a genuine architectural constraint, not a feature toggle: the server can no longer read message content, so server-side search, previews, and moderation all become impossible or must move to the client. Multi-device sync gets substantially harder because each device needs its own key material. If asked for E2E, say plainly what it costs.

### Failure modes

- **Thundering herd on deploy.** Restarting a connection server drops all its sockets at once and every client reconnects immediately. Drain connections before shutdown and require jittered client backoff.
- **Ghost registry entries.** A connection dies without a close frame; without heartbeat TTLs the user shows online forever and messages route to a server that no longer holds them.
- **Hot partitions.** A very large or very active group concentrates writes on one partition. Time-bucketing the partition key spreads it.
- **Mobile networks flap constantly.** Assume reconnects are routine, not exceptional — cursors and idempotency keys are what make that cheap.

### Interview checklist

- Establish **server-initiated delivery** as the defining constraint before choosing anything.
- Pick **WebSocket**, name long polling as fallback, and say why polling is unacceptable.
- Introduce the **service registry** (`user_id → server_id`) as the consequence of stateful connections, with **heartbeat TTLs** for cleanup.
- Separate the **connection tier** from the API tier and justify it with the concurrent-socket number.
- Choose a **wide-column store** partitioned by conversation, and mention **time-bucketing** to bound partition growth.
- Order by a **server-assigned ID**, never a client clock — and connect it to the unique-ID topic.
- Explain **per-device cursors** as the single mechanism covering sync, catch-up, and offline delivery.
- Volunteer **at-least-once + idempotency keys** rather than claiming exactly-once.
- Note that **presence is best-effort** and shouldn't be broadcast to thousands of contacts on every flap.

**Key numbers:** ~2B messages/day at 50M DAU · ~100k writes/sec at peak · ~5M concurrent sockets at 10% concurrency · ~100k sockets per connection server · ~350 TB/year of message storage replicated.
