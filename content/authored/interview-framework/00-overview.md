---
version: 1
---

A system design interview is 45 minutes, deliberately under-specified, and has no correct answer. That combination is what makes it stressful — and what makes a framework valuable. Not because there's one right process, but because having *a* process stops you freezing on an open-ended prompt, and it lets the interviewer follow your reasoning.

### What is actually being assessed

Interviewers are not checking whether you can recall a reference architecture. They're looking for:

- **Do you scope before building?** The prompt is vague on purpose. Candidates who start drawing boxes without asking what the system must do are demonstrating exactly the failure mode the interview is designed to detect.
- **Can you justify choices?** "I'd use Cassandra" is worth nothing. "I'd use Cassandra because the access pattern is write-heavy and always scoped to one partition key, and I can give up ad-hoc queries" is the answer.
- **Do you know what you traded away?** Every choice costs something. Naming the cost unprompted is the strongest single signal you can send.
- **Can you collaborate?** This is a conversation. Candidates who monologue for 40 minutes score badly even when the design is sound.

The unspoken one: **do you know when to stop?** Designing a globally distributed system for a problem that fits on one server is a failure, not thoroughness.

### The shape of the conversation

Roughly, with time budgets that assume 45 minutes:

1. **Scope and requirements — 5–10 minutes.** Functional requirements, scale, and the explicit non-goals. Leave with a short written list you both agreed to.
2. **Estimation — 5 minutes.** Enough arithmetic to know what kind of system this is. Skip the numbers that change nothing.
3. **High-level design — 10–15 minutes.** Boxes, arrows, the API surface, the data model. The whole system, none of it deep.
4. **Deep dive — 10–15 minutes.** One or two components, chosen with the interviewer. This is where the interview is won or lost.
5. **Wrap up — 5 minutes.** Bottlenecks, what you'd monitor, what you'd do with more time.

Treat the boundaries as soft. If the interviewer pulls you into a deep dive at minute 12, follow them — they're telling you what they want to assess.

### The habits that matter more than the steps

**Say your assumptions out loud.** Every one is an invitation to be corrected while correcting is cheap.

**Drive, but check in.** After the high-level design, ask "does this look reasonable, or would you like me to go deeper somewhere?" It's collaborative and it surfaces what they're actually grading.

**Answer the question you were asked.** If they ask how you'd handle a hot key, don't restate the architecture. Answer, then connect it back.

**Don't bluff.** "I haven't used Kafka in production, but the property I need here is a durable, replayable log — so I'd reach for it or something equivalent" is a good answer. Inventing details about a system you don't know is the fastest way to lose credibility, because they probably do know it.

The sections that follow work through each step in detail, and the checklist at the end is what to run through under time pressure.
