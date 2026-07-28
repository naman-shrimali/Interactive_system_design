---
version: 1
---

The server has to push. That single requirement drives the connection model, and the connection model drives everything else about the architecture.

### The options

**Polling.** The client asks "anything new?" every few seconds. Trivial to build and terrible for chat: you pay a full request cycle for an overwhelmingly empty answer, and message latency is bounded below by the poll interval. At 10,000 clients polling every 3 seconds you're absorbing 3,300 requests per second to mostly say "no".

**Long polling.** The client sends a request and the server *holds it open* until a message arrives or a timeout fires, then the client immediately reconnects. Latency drops to near zero and idle traffic nearly vanishes. It works through every proxy and firewall, which is its main virtue. The costs: each message needs a fresh connection setup, and the server holds many open requests, which maps badly onto thread-per-request servers.

**Server-Sent Events.** A single long-lived HTTP response the server streams into, with automatic browser reconnection. Efficient and simple — but **one-directional**. Chat needs the client to send too, so you'd pair SSE with ordinary POSTs. Reasonable, and genuinely good for notification feeds where traffic is server→client only.

**WebSocket.** Starts as HTTP, upgrades, then both sides send frames over one persistent TCP connection. Full duplex, low per-message overhead, low latency. This is the standard answer for chat, and the rest of this topic assumes it.

| | Latency | Direction | Overhead per message | Proxy-friendly |
|---|---|---|---|---|
| Polling | poor | both | full request | yes |
| Long polling | good | both | reconnect per message | yes |
| SSE | good | server→client | frame | yes |
| WebSocket | best | both | frame | mostly |

Say WebSocket, then note you'd fall back to long polling where WebSocket is blocked — some corporate proxies still interfere — and that this fallback is what libraries in this space exist to provide.

### Stateful servers break the usual scaling story

Everywhere else we make servers stateless and put a load balancer in front. Here, a user's connection lives on one *specific* machine. Two consequences follow immediately.

**You need a registry.** To deliver a message you must find which server holds the recipient's socket. That's a service — commonly Redis — mapping `user_id → server_id`, written when a connection opens and removed when it closes. Delivery becomes: look up the recipient's server, forward the message to it, and let it write to the socket.

That inter-server hop is unavoidable in a stateful design. It's usually done over a message broker or direct RPC between chat servers.

**Presence and cleanup are the same problem.** A registry entry is only true while the connection lives, and connections die without notice — a phone loses signal and no `close` frame is ever sent. So entries carry a TTL refreshed by a periodic heartbeat, and a stale entry expires on its own. If you don't do this, you accumulate ghost users who appear online forever and messages routed to servers that no longer hold them.

### The cost of idle connections

A million concurrent users means a million open sockets, whether or not anyone is typing. Each consumes a file descriptor and kernel buffers — on the order of tens of kilobytes of memory per connection once you count both directions.

This makes connection servers a distinct tier with a distinct scaling axis: they scale with *concurrent users*, while your API servers scale with *request rate*. Those numbers move independently, so bundling the two wastes capacity. It also means OS tuning (file descriptor limits, ephemeral port ranges) is a real concern rather than a footnote.

Load balancing them is awkward too. Connections are long-lived, so a newly added server receives no traffic until clients reconnect — there's no natural rebalancing. Deploys are similarly painful: restarting a chat server drops every connection it holds, and those clients reconnect in a thundering herd. Mitigations are draining (stop accepting new connections, wait for existing ones to migrate) and client-side reconnect with **jittered** backoff.

### Presence

Presence is best-effort and should be treated that way. Online status derives from "is there a live connection with a fresh heartbeat", so it falls out of the registry rather than needing separate storage.

Two details worth mentioning: don't broadcast every status change to every contact — a user with 5,000 contacts triggers 5,000 pushes on each flap, and flapping is common on mobile networks. Fan out only to contacts with an open conversation, or let clients fetch presence on demand. And add a grace period before marking someone offline, so a two-second network blip doesn't flash the whole contact list.
