---
version: 1
---

Every design has a layer where components talk to each other, and the choices there are usually made by default rather than deliberately. Being able to justify them — and knowing when the default is wrong — is what this topic is for.

### The three questions

**What transport?** TCP gives you ordering and reliability at the cost of head-of-line blocking and connection setup. UDP gives you neither guarantee and none of the overhead, which is exactly right for voice, video and game state where a late packet is worthless anyway. Almost everything else is TCP, usually via HTTP.

**What shape of API?** REST models resources and leans on HTTP's own semantics — cacheable, uniform, easy to debug with tools everyone already has. RPC models procedures and is typically more efficient and more strongly typed, which is why internal service-to-service traffic often uses gRPC while the public API stays REST. These are not competitors so much as answers to different questions: REST for the boundary you don't control, RPC for the one you do.

**Who initiates?** This is the one that reshapes architectures. HTTP assumes the client asks and the server answers. The moment the *server* needs to speak first — a message arrives, a job finishes, a price changes — you need one of the workarounds covered in the real-time section, and the one you pick determines whether your servers can stay stateless.

### Where it bites in a design interview

- **Chat, notifications, live dashboards** — the push requirement forces a persistent-connection tier, a registry mapping users to servers, and a scaling axis based on concurrent connections rather than request rate.
- **Service-to-service** — every synchronous hop adds latency and multiplies your availability downward. Three dependencies at 99.9% ceiling at 99.7%. Sometimes the right protocol answer is "don't make this call at all — publish an event."
- **Mobile clients** — radios, battery, and flaky networks make chatty protocols expensive in ways that don't show up in a datacenter benchmark. Fewer, larger requests beat many small ones.

### The framing worth keeping

Protocol choices are latency and coupling decisions in disguise. A cross-continent round trip is ~150 ms no matter what runs on top of it, so the highest-leverage change is usually removing a round trip — batching, caching, or moving the work asynchronously — rather than picking a faster serialisation format.

The primer material that follows covers HTTP, TCP, UDP, RPC and REST in detail. The final section covers the real-time options, which the classic material predates.
