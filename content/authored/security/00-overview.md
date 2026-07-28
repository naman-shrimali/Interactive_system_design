---
version: 1
---

Security rarely gets its own system design question, but it appears as a follow-up in almost every one — and a candidate who has to be prompted for it looks careless. What's expected isn't depth; it's evidence that you think about it by default.

### Authentication and authorization

Two different questions, routinely conflated. **Authentication** is who you are; **authorization** is what you may do. A system can authenticate perfectly and still let any logged-in user read anyone's data.

The pattern to describe: authenticate once at the edge, issue a token, and let services verify it without a round trip to an auth service on every call. A signed token (JWT or similar) carries identity and claims and is verified with a public key locally.

The trade-off to volunteer, because it's the standard follow-up: **stateless tokens cannot be revoked.** A token valid for an hour stays valid for an hour after you ban the user or they log out. The mitigations are short expiry plus refresh tokens, or a revocation list checked on sensitive operations — which reintroduces the state you were avoiding, for a subset of requests. Pick and justify.

For authorization, say where the check happens. Checking only in the UI is not a check. Every service must enforce on its own data, because "the caller is internal" is not an authorization decision.

### Encryption

**In transit:** TLS everywhere, including between internal services. The flat internal network where anything can talk to anything unencrypted is a common finding, and "we're inside the VPC" isn't a security model.

**At rest:** disk and database encryption, which mostly protects against physical media loss. Note what it does *not* protect against — an application with valid credentials reads plaintext regardless.

**Application-level encryption** for genuinely sensitive fields, so the data is unreadable even to someone with database access. Costs you the ability to query those fields, which is why it's applied selectively rather than universally.

Never store passwords, even encrypted. **Hash** them with a slow, salted algorithm — bcrypt, scrypt, or Argon2. The slowness is the feature: it makes offline brute-force expensive. A fast hash like SHA-256 is the wrong tool here, and saying so shows you know why.

### Least privilege

Every component gets the minimum access it needs. A read-only service gets read-only credentials. Concretely, this is what limits blast radius: a compromised component can only do what it was permitted to do, so the difference between an incident and a catastrophe is often a scoped credential.

The same applies to network reachability — a database should accept connections only from services that need it, not from anything in the VPC.

### Input handling

Most application vulnerabilities reduce to trusting input:

- **SQL injection** — use parameterised queries. Never build SQL by string concatenation. This is entirely solved and still happens.
- **XSS** — escape on output, contextually. Prefer frameworks that escape by default.
- **SSRF** — a user-supplied URL fetched server-side can reach internal services and cloud metadata endpoints. Allowlist destinations.
- **Deserialisation** of untrusted data into objects can execute code. Prefer plain data formats.

The principle: **validate on the server**, always. Client-side validation is a UX feature.

### Rate limiting is a security control

Worth stating explicitly, because it's usually filed under performance. Rate limiting is the cheapest defence against credential stuffing, brute force, and scraping. It doesn't prevent a determined attacker; it changes the economics from hours to years.

Apply it hardest to authentication endpoints, and key it on both IP and attempted username — see the rate-limiter topic for why neither alone suffices.

### What to say when asked

A compact answer that covers the ground:

> "TLS everywhere including service-to-service. Authenticate at the edge with short-lived signed tokens; each service authorizes against its own data. Passwords hashed with Argon2. Secrets in a secret manager with rotation, never in config or environment variables in the repo. Least-privilege credentials per service so a compromise is contained. Parameterised queries and server-side validation. Rate limiting on auth endpoints. PII encrypted at the application layer where it's sensitive enough to justify losing queryability, with a retention and deletion policy for regulatory requests."

Then add the one that most designs forget: **audit logging.** Recording who did what, to what, and when is how you answer questions after an incident — and if it isn't designed in, it can't be reconstructed later.
