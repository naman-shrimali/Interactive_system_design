---
version: 1
---

### Questions to ask in the first five minutes

**Functional scope**
- Who uses this, and what are the two or three core actions?
- What's explicitly out of scope? (Say your own list — "I'll assume no auth flows and no moderation unless you'd like those.")
- Is there a mobile client, or web only? It changes the API surface and the push story.

**Scale**
- How many users total, and how many daily active?
- Read-heavy or write-heavy, and roughly what ratio?
- Is traffic global or regional? Global means multi-region, which changes everything about consistency.

**Constraints**
- What's the latency expectation for the main action?
- How fresh must data be? (This one buys the most architectural freedom when the answer is "not very".)
- What's the availability target, and what happens if we're down for a minute?

**Data**
- How long is data retained?
- Is anything sensitive — regulated, encrypted, subject to deletion requests?

You will not ask all of these. Pick the four that most change the design.

### The wrap-up, which candidates skip

With five minutes left, volunteer:

- **The bottleneck.** "The first thing to break under 10× is the fan-out worker pool, because…" Knowing where your own design fails is the mark of someone who has operated systems.
- **What you'd monitor.** Two or three metrics that would tell you it's unhealthy — queue depth, p99 latency, replication lag.
- **What you'd do differently with more time or more information.**
- **The biggest risk.** Often a dependency you don't control.

### Common failure modes

| Mistake | What to do instead |
|---|---|
| Drawing boxes before scoping | Spend the first five minutes on requirements, always |
| Estimating things that change no decision | Compute QPS, storage, and the read:write ratio; skip the rest |
| Naming a technology without a reason | Pair every choice with the property you need from it |
| Over-engineering | If the numbers say one database, say one database |
| Monologuing | Check in after the high-level design |
| Going silent while thinking | Narrate: "I'm weighing whether to precompute this…" |
| Defending a design when challenged | Interviewers push to see if you can reason, not to trap you. Engage with the objection |
| Ignoring the data model | The schema often *is* the design; sketch it |
| Forgetting failure | Say what happens when each major component dies |

### A compact rubric for your own answer

Before you finish, check that you have said something about each:

- [ ] Agreed functional requirements and explicit non-goals
- [ ] Scale figures, and the read:write ratio
- [ ] An API surface — the two or three main endpoints
- [ ] A data model, including the partition key for anything sharded
- [ ] The high-level component diagram with data flow
- [ ] Where state lives, and which store, with justification
- [ ] Caching: what, where, and how it's invalidated
- [ ] One deep dive with a genuine trade-off named
- [ ] Failure behaviour for the main components
- [ ] Bottleneck and monitoring in the wrap-up

### If you get stuck

Fall back to the request path. Trace one request end to end — client, DNS, load balancer, service, cache, database, response — and the gaps become obvious. It restarts a stalled conversation and rarely leads you astray.
