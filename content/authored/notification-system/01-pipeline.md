---
version: 1
---

An event happens somewhere in your product and a message has to reach a person. The path between those two points is a pipeline, and each stage exists to isolate a specific failure.

### One entry point

Services trigger notifications by calling a single notification service, not by calling APNs or Twilio themselves. That indirection buys a lot:

- Provider credentials live in one place.
- Opt-out and rate-limiting rules are enforced where they cannot be skipped — if each team called providers directly, the first missed check would be a compliance problem.
- Swapping SMS providers is one deployment, not twelve.
- Every notification is observable in one place, so "did this user get it?" has an answer.

The API is deliberately narrow: who, what template, what variables, what channels, and an idempotency key.

### Gathering what you need to send

Sending requires more than the event: device tokens for push, a phone number for SMS, an email address, a locale for the right template. That lives in a user/device store, keyed by user, and it's read on every send — so it's cached aggressively.

**Device tokens deserve special attention.** They're issued by the OS, they expire, they change when an app is reinstalled, and they become invalid when the app is uninstalled. Providers tell you this: APNs and FCM return "unregistered" for dead tokens. If you don't consume that feedback and delete them, you accumulate garbage and waste a growing fraction of every send. Wiring provider responses back into token cleanup is unglamorous and routinely forgotten.

### Applying policy — where dropping is success

Before anything is queued, three checks run:

**Opt-out.** Per user, per category. A user who unsubscribed from marketing must still receive a security alert, so preferences are per-category rather than a single flag. This check is mandatory and belongs on the send path.

**Rate limiting per user.** Nobody wants forty pushes in a minute. A per-user, per-category cap collapses bursts. This is the same token bucket as the rate-limiter topic, keyed by user.

**Quiet hours.** Respect the user's timezone. A 3 a.m. push is worse than no push — it costs you the notification permission entirely.

The important framing: a notification dropped by these checks is a **successful outcome**, not a failure. Metrics and alerts must distinguish "suppressed by policy" from "failed to deliver", or your dashboards will look broken while working correctly.

### One queue per channel

This is the key structural decision. Push, SMS, and email each get their own queue and their own worker pool.

The reason is failure isolation. When the SMS provider degrades and its queue backs up, push and email keep flowing at full speed. With one shared queue, the slowest provider sets the pace for everything, and a Twilio incident becomes an outage for notifications that had nothing to do with SMS.

Queues also absorb bursts. A marketing send to ten million users enqueues ten million messages in seconds; workers drain them at whatever rate providers accept. Without a queue, that burst hits the provider directly and you get rate-limited or blocked.

Separate queues by priority too — transactional messages (password reset, 2FA) must not sit behind a marketing campaign. In practice that's a high-priority and a bulk queue per channel.

### Workers and providers

Workers pull from a queue, render the template, call the provider, and record the outcome. They're stateless and scale horizontally, with the practical ceiling set by the provider's own rate limits rather than your capacity.

Two things belong here:

**Respect provider limits.** Providers publish per-second caps and will throttle or ban you for exceeding them. Workers need their own outbound rate limiting — again the same token bucket, this time keyed by provider.

**Treat "accepted" honestly.** When APNs accepts a message it means the message was accepted for delivery, not that a phone displayed it. The device may be off for two days. Any delivery metric built on provider acceptance is measuring the wrong thing; real delivery confirmation comes from client-side receipts, if you have them at all.

### Templates

Notification bodies are templates with variables, versioned and stored separately from code, rendered at send time with the user's locale. Keeping them out of the codebase lets non-engineers change copy, and versioning means you can tell what a user actually received three months ago — which matters the first time someone disputes a message.
