---
version: 1
---

An interviewer says "design a system that stores user photos." Before you can choose a database, you need to know whether you're storing 10 GB or 10 petabytes — those are different systems, and no amount of architectural taste substitutes for knowing which one you're in.

Back-of-the-envelope estimation is how you find out in about ninety seconds, using arithmetic you can do out loud.

### What it's actually for

The point isn't the number. Nobody checks whether you said 4.2 TB or 3.8 TB, and the inputs are invented anyway. The point is the **decisions the number unlocks**:

- **Does the data fit in memory?** If your working set is 20 GB, a single cache server holds it and your design gets dramatically simpler. If it's 20 TB, you're sharding, and that shapes everything downstream.
- **Do you need to shard at all?** One well-provisioned relational database handles a few thousand writes per second comfortably. If your estimate says 200, stop designing a distributed system.
- **Is read or write load dominant?** A 100:1 read-to-write ratio justifies replicas and aggressive caching. A write-heavy system needs the opposite.
- **How many machines?** Total throughput divided by per-machine capacity gives a fleet size — and if that answer is "three", stop adding tiers.

An estimate that changes none of your decisions was a waste of time. Do the ones that matter and skip the rest.

### The method

Four steps, in order:

1. **State your assumptions out loud.** "Let's say 100 million daily active users, each posting twice a day." The interviewer will correct you if they had something else in mind — which is exactly what you want, early.
2. **Round aggressively.** Use 100,000 seconds per day instead of 86,400. Use 1 million instead of 1,048,576. You're after the order of magnitude; precision is false comfort and slows you down.
3. **Compute one quantity at a time** — QPS, then storage, then bandwidth — saying each result before moving on.
4. **Sanity-check the answer.** "That's 500 TB a year, which is a lot but not absurd for a photo service." If a number comes out at a petabyte per second, you dropped a factor somewhere. Catching your own error is a strong signal; having the interviewer catch it is not.

### The one shortcut worth memorizing

**There are roughly 100,000 seconds in a day** (86,400, rounded).

That single fact converts any daily volume into a per-second rate by moving the decimal point five places. 1 billion events per day is 10,000 per second. 100 million is 1,000 per second. You will use this in every estimation question you are ever asked, and it turns a multiplication into a glance.

Pair it with one more: **peak is roughly 2–3× average.** Traffic isn't uniform across the day, so provision for the peak, not the mean.

### What comes next

The following sections give the numbers worth memorizing — data sizes, latency figures, and availability math — then work through complete examples end to end so the method is concrete rather than abstract.
