---
version: 1
---

Delivery is the visible half. Storage is where the design is actually decided, because message history is enormous, write-heavy, and read in exactly one pattern.

### The access pattern picks the database

Messages are: written constantly, never updated, read almost exclusively as "the most recent N in this conversation, then scroll backwards". Total volume grows without bound.

That is an unusually clear fit for a **wide-column store** such as Cassandra or HBase. Partition by `conversation_id`, cluster by `message_id` descending, and the newest messages in a conversation are physically contiguous on one node. Fetching a screenful is a single sequential read; scrolling back continues along the same partition. Writes are appends, which LSM-tree storage handles far better than a B-tree does.

A relational database works fine until it doesn't — at which point you're sharding by conversation and hand-rolling what Cassandra gives you. The one thing to keep relational is *metadata*: users, conversation membership, settings. That data is small, highly relational, and wants transactions.

The watch-out is **unbounded partitions**. A group chat running for years grows one partition indefinitely, and very large partitions are a known operational problem. The fix is a composite partition key — `(conversation_id, time_bucket)` where the bucket is a month — which caps partition size at the cost of occasionally reading two buckets to fill one screen.

### Ordering

Two people send at the same moment. Whose message comes first?

Not the client's clock — device clocks disagree, drift, and can be set by the user. Ordering by `sent_at` from the device produces messages that visibly appear in the wrong order, or in the past.

Use a **server-assigned ordering key per conversation**, which is exactly what the unique-ID topic builds: a roughly time-sortable ID assigned when the server accepts the message. Sorting by it gives a stable, consistent order that every device agrees on. Global ordering across conversations is neither needed nor cheap — only order *within* a conversation matters.

Keep the client's timestamp as a separate display field if you like, but never sort by it.

### Sync across devices

The same account is open on a phone and a laptop. Both need every message, and one may have been offline for a week.

The mechanism is a **per-device cursor**: the ID of the last message that device has confirmed receiving, per conversation. On reconnect the device sends its cursor and asks for everything after it. That single idea handles first sync, catch-up after a week offline, and recovery from a dropped connection identically — there is no special case.

Cursors also make **offline delivery** simple. Messages for a disconnected device don't need a separate queue at all: they're already durably stored in the conversation, and the device pulls what it missed when it returns. A per-recipient outbox is only needed when you must push (mobile push notifications) rather than wait for a pull.

Read state works the same way — a per-device or per-user read cursor — and converges naturally when devices sync.

### At-least-once, and why duplicates are fine

Networks drop acknowledgements, so a client that doesn't hear back retries, and the server may receive the same message twice.

Give every message a **client-generated idempotency key** at compose time. The server treats a repeat of a key it has already stored as a no-op and returns the original message ID. The user sends once; retries are free. This is the same pattern as the notification system, and it's the standard answer whenever a network sits between an action and its confirmation.

Exactly-once delivery is not achievable end-to-end. At-least-once plus idempotency gets you the same observable behaviour with far less machinery.

### Group chat and fan-out

For a small group, delivery is a loop: for each member, look up their server in the registry and forward. At a cap of 500 members that is 500 lookups and forwards per message — acceptable, and the reason the cap exists.

Above that, per-message fan-out to every recipient stops being viable and the model inverts: store the message once in the conversation and let clients pull, pushing only a lightweight "something changed" signal. That's the same fan-out-on-write versus fan-out-on-read trade the news feed topic works through, and it's worth naming the connection — one message copied to many recipients is the same problem in both systems.

Storage follows the same split: copying each message into every member's inbox is fast to read and expensive to write; storing once per conversation is the reverse. Chat usually stores once per conversation, because a conversation has a natural, bounded audience and reads are always scoped to it.
