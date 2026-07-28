---
version: 1
---

Snowflake's elegance rests on one assumption: that the clock moves forward. When it doesn't, the scheme can produce duplicates — the single failure it was designed to prevent. Interviewers ask about this because it's where a clever design meets an uncooperative world.

### Why clocks move backwards

Not hypothetical. It happens for ordinary reasons:

- **NTP correction.** A machine's clock drifts, NTP notices, and it *steps* the clock backwards to correct. Any ID generated during the replayed interval reuses a timestamp already spent.
- **Leap seconds.** Historically some systems repeated a second. Most now smear the adjustment across hours instead, which avoids the step but means your clock is deliberately running at the wrong rate for a while.
- **VM migration or resume from suspend**, where the guest clock is corrected on arrival.
- **Manual intervention** by someone fixing a "wrong" clock.

If the timestamp goes backwards and the sequence has reset, you regenerate IDs you already issued.

### Handling it

**Refuse to generate.** Detect `now < last_timestamp` and either block until the clock catches up, or throw. Correct, and turns a correctness bug into an availability blip — the right trade when IDs are primary keys. Small regressions of a few milliseconds are worth waiting out; large ones should page someone rather than block for an hour.

**Never trust the wall clock.** Keep `last_timestamp` as the source of truth and advance it monotonically: `now = max(system_clock, last_timestamp)`. If the clock rewinds, keep issuing from the last value and let the sequence absorb it until real time catches up. IDs stay unique; the embedded timestamp is briefly slightly ahead of reality. Usually the better trade, since nobody cares about a few milliseconds of skew in an ID and everybody cares about duplicates.

**Use a monotonic clock** for elapsed time where the platform offers one, since it isn't affected by NTP steps — though it doesn't give you wall-clock time to embed.

**Run NTP in slew mode** so corrections are applied by gradually adjusting clock rate rather than stepping. Prevention beats detection.

The answer worth giving: *detect regression, advance monotonically from the last issued timestamp, alarm if the gap is large, and configure NTP to slew rather than step.*

### The other trade-offs

**Machine ID exhaustion.** 1,024 generators sounds like plenty until an autoscaling group churns through IDs faster than they're released, or a deploy runs old and new pods simultaneously. Make IDs reclaimable, and size the field for peak concurrent generators rather than steady state.

**Bit allocation is permanent.** Changing the split after IDs exist breaks the ordering guarantee and any decoder. Choose once, with headroom.

**The custom epoch is permanent too.** It's baked into every ID ever issued. Document it next to the code — a forgotten epoch makes timestamps undecodable.

**Information disclosure.** IDs reveal creation time, machine count, and generation rate. For user-facing resources where enumeration matters, issue a separate opaque public identifier and keep the Snowflake ID internal.

### When not to use Snowflake

- **You have one database and modest scale.** Auto-increment is simpler and you should say so. Reaching for a distributed ID generator you don't need is over-engineering, and interviewers notice.
- **You cannot assign machine IDs reliably** — some serverless environments make this genuinely awkward. UUIDv7 gives time-ordering with zero coordination, at 128 bits.
- **You need unguessable IDs.** Snowflake is sequential by design. Use random UUIDs or a keyed hash.
- **You need strict total ordering** reflecting real causality. That needs logical clocks or a consensus sequencer, not bit-packing.

### Interview checklist

- Start from **why auto-increment fails** at more than one node, then walk the options.
- Reject **UUIDv4** for a primary key with the *index locality* argument, not just size — that's the answer that shows depth. Offer **UUIDv7** as the fix if coordination is impossible.
- Present **Snowflake's layout** with the reasoning: sign bit for signed-integer safety, custom epoch for the full 69 years, sequence sized for per-machine throughput.
- Volunteer **clock regression** before being asked, and give a concrete handling strategy.
- Say how **machine IDs are assigned** — this is the part candidates skip, and it's the part that breaks.
- Note the ordering is **approximate across machines**, and that this is fine for feeds and pagination.

**Key numbers:** 41 bits ≈ 69 years of milliseconds · 10 bits = 1,024 machines · 12 bits = 4,096 IDs/ms/machine ≈ 4.1M/sec/machine · UUIDv4 = 128 bits with random insert locality · Snowflake = 64 bits, ~sortable, zero network calls.
