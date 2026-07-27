---
version: 1
---

We're designing a messaging system: one-to-one conversations, group chats, delivery and read receipts, presence ("online now"), and message history that survives across a user's devices.

The thing that makes chat different from most systems you'll design is the direction of traffic. Almost everything else is request/response — a client asks, the server answers. Chat is **server-initiated**: a message arrives for you, and the system has to push it to a device that isn't asking for anything right now. That single requirement reshapes the whole architecture.

### Scoping it

A reasonable set of requirements to agree on before designing anything:

- One-to-one and group messaging, with groups capped at some size (say 500 — the cap matters, because fan-out cost scales with it).
- Text first; attachments handled as links to blob storage rather than bytes on the message path.
- Delivery is **at-least-once** and messages are persisted, so a device that's been offline for a week can catch up.
- Ordering is consistent *within a conversation*. Global ordering across conversations is neither needed nor achievable cheaply.
- Presence and typing indicators are best-effort — losing one is invisible to users, so they don't deserve durable storage.

### Why the connection model dominates

To push a message to a device, you need a live path to it. Long polling, Server-Sent Events, and WebSockets all give you one, with different costs — that's the next section. Whichever you choose, two consequences follow immediately:

**Connections are stateful, and that breaks the usual scaling story.** Everywhere else we scale by making servers stateless and putting a load balancer in front. Here, a specific user's connection lives on a *specific* chat server. To deliver a message you must find which server holds the recipient's connection — which means a service registry mapping user to server, and a routing hop between the sender's server and the recipient's.

**Idle connections are expensive.** A million concurrent users means a million open sockets even when nobody is typing. That's a memory and file-descriptor problem, and it makes connection servers a distinct tier you scale on a different axis than your stateless API.

### The awkward parts

Three things reliably come up as follow-ups, and each has a real answer rather than a trick:

- **Multi-device sync.** The same account is open on a phone and a laptop. Both need every message, both need read state to converge, and the phone might be offline for the delivery.
- **Ordering.** Two people send at once; clients' clocks disagree. You need a server-assigned ordering key per conversation, which connects this topic directly to unique ID generation.
- **Offline delivery.** Messages for a disconnected device have to queue somewhere durable and be replayed on reconnect, without duplicating what the device already has.

The storage and sync deep dive works through all three.
