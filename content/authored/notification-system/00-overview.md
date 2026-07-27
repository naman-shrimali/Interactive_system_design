---
version: 1
---

A notification system takes an event inside your product — someone replied to you, a payment failed, a package shipped — and gets a message onto a person's phone, inbox, or screen. In practice it fans a single event out across three or four channels with completely different mechanics: mobile push, SMS, email, and in-app.

The defining constraint is that **you don't control delivery**. Push goes through Apple's APNs or Firebase; SMS goes through a carrier gateway like Twilio; email goes through SendGrid or SES. Every one of those is a third party that can be slow, can rate-limit you, can fail, and will occasionally accept a message and then quietly not deliver it. Your system is mostly an exercise in being a well-behaved client of unreliable dependencies.

### Scoping it

- **Channels:** iOS/Android push, SMS, email, in-app inbox.
- **Triggers:** server-side events, plus scheduled and bulk sends (a marketing blast to millions).
- **Ordering:** not guaranteed, and don't promise it — notifications are independent.
- **Delivery:** at-least-once. Exactly-once across a third-party gateway is not achievable, so the design has to make duplicates *harmless* rather than impossible.
- **Opt-out is mandatory,** not a feature. Legally and practically, a user who unsubscribed must stop receiving that category, and that check belongs on the send path where it cannot be skipped.

### The shape of the design

Events arrive from many services, so the first move is a single entry point — a notification service with one API — rather than letting every team call APNs directly. From there:

1. **Fetch what you need to send it.** Device tokens, phone number, email address, and locale live in a store keyed by user. This is a read on every send, so it's cached.
2. **Apply policy.** Opt-out preferences, per-user rate limits (nobody wants 40 pushes in a minute), and quiet hours. Dropping a notification here is a *success*, not a failure.
3. **Enqueue per channel.** One queue per channel is the key structural decision: it isolates failures. When the SMS provider goes down and its queue backs up, push and email keep flowing.
4. **Workers call the provider,** with retries and backoff, and record the outcome.

### Where the difficulty actually is

Steps 1–3 are straightforward. The interesting failures live in step 4, and they're all variations on the same theme: *the network is unreliable, so retries are mandatory, and retries cause duplicates.* A worker sends an SMS, the provider accepts it, the acknowledgement is lost, the worker retries — and the user gets charged twice for one text.

The reliability deep dive covers the standard toolkit: idempotency keys so a retried send is recognized, dead-letter queues so a permanently failing message doesn't block the queue forever, and the tracking table that lets you answer "did this actually arrive?" when someone asks.
