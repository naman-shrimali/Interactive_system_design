---
version: 1
---

The classic material predates the problem this section covers. HTTP assumes the client asks and the server answers, so anything that needs the server to speak first is a workaround — and the four common ones trade latency against compatibility and operational cost.

### Polling

The client asks "anything new?" on a timer.

Trivial to build, works everywhere, and wasteful in proportion to how rarely the answer is yes. Ten thousand clients polling every three seconds is 3,300 requests per second to mostly say "no", and message latency is bounded below by the interval — a three-second poll means up to three seconds of delay on every update.

Genuinely fine when updates are rare and a few seconds of lag is invisible. A background sync that checks for config changes does not need anything cleverer.

### Long polling

The client sends a request and the server **holds it open** until there is something to send or a timeout fires; the client then immediately reconnects.

Latency drops to near zero and idle traffic nearly disappears. Its real virtue is compatibility: it is ordinary HTTP, so it traverses every proxy, firewall and corporate middlebox that has ever caused you trouble.

The costs are a fresh connection setup per message, and many simultaneously-held open requests on the server — which maps badly onto a thread-per-request model and pushes you toward an event-driven server.

### Server-Sent Events

A single long-lived HTTP response that the server streams into, with automatic browser reconnection and event IDs for resuming after a drop.

Efficient, simple, and **one-directional**. That last point decides everything: for a notification feed, a live dashboard, or a progress indicator, traffic really is server-to-client only and SSE is the right tool with the least machinery. For chat you would pair it with ordinary POSTs for sending, which works but is two mechanisms where one would do.

### WebSocket

Starts as HTTP, upgrades, then both sides exchange frames over one persistent TCP connection. Full duplex, low per-message overhead, lowest latency.

This is the standard answer for chat and collaborative editing. Keep long polling as a fallback where WebSocket is blocked — some corporate proxies still interfere — and be honest in an interview that maintaining both paths is real complexity, which is what the libraries in this space exist to hide.

### Comparison

| | Latency | Direction | Per-message cost | Proxy-friendly |
|---|---|---|---|---|
| Polling | poor | both | a full request | yes |
| Long polling | good | both | a reconnect | yes |
| SSE | good | server → client | a frame | yes |
| WebSocket | best | both | a frame | mostly |

### The consequence people miss

Choosing a persistent connection is choosing a **stateful tier**, and that reshapes the architecture:

- A user's connection lives on one specific machine, so delivering a message means discovering which machine — a registry mapping user to server, plus an internal hop between servers.
- Idle connections cost memory and file descriptors whether or not anyone is talking. A million concurrent users is a million sockets, on the order of tens of kilobytes each.
- Connection servers scale on **concurrent users**, while your API tier scales on **request rate**. Those numbers move independently, so bundling them wastes capacity.
- Deploys drop every connection the server holds, producing a reconnect storm. Drain before shutdown and require jittered client backoff.

None of that applies to polling or SSE-over-CDN. So the choice is not "WebSocket is best" — it is "how much operational surface does this feature justify?" If updates are infrequent and one-directional, taking the simpler option avoids an entire class of problem.
