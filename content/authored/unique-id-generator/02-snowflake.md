---
version: 1
---

Snowflake divides a 64-bit integer into fields. The exact split is a design choice; this is the classic one.

### The layout

| Bits | Field | Purpose |
|---|---|---|
| 1 | unused | kept zero so the value is a positive signed 64-bit integer |
| 41 | timestamp | milliseconds since a custom epoch |
| 10 | machine ID | which generator produced this |
| 12 | sequence | counter within a single millisecond |

The sign bit is deliberate: many languages have no unsigned 64-bit type, and a leading 1 would make the ID negative in Java. Keeping it zero avoids a class of bugs at every boundary the ID crosses.

**41 bits of milliseconds** is about 69 years — `2⁴¹ / (1000 × 60 × 60 × 24 × 365)`. Using a *custom epoch* rather than the Unix epoch buys the full 69 years from your system's launch instead of burning decades already elapsed since 1970.

**10 bits of machine ID** is 1,024 generators. Often split further — 5 bits of datacenter and 5 of machine — which is really just a naming convention on the same 10 bits.

**12 bits of sequence** is 4,096 IDs per machine per millisecond, so **~4.1 million per second per machine**. At 1,024 machines that's over 4 billion per second, which is comfortably more than anyone needs. If you need fewer machines and more throughput, shift a bit from machine ID to sequence.

### Generation

```
generate():
    now = current_millis()

    if now < last_timestamp:            # clock moved backwards
        handle_clock_regression()

    if now == last_timestamp:
        sequence = (sequence + 1) & 4095      # 12-bit wrap
        if sequence == 0:                     # exhausted this millisecond
            now = wait_until_next_millis(last_timestamp)
    else:
        sequence = 0                          # new millisecond, reset

    last_timestamp = now

    return ((now - CUSTOM_EPOCH) << 22)
         | (machine_id << 12)
         | sequence
```

Three shifts and two ORs. No lock beyond making the function thread-safe on one machine, no network, no shared state. That's the whole appeal.

Note the sequence resets to 0 each millisecond, which makes IDs from a low-traffic system predictable and slightly leaky — an observer can infer your creation rate. Some implementations start the sequence at a small random value per millisecond to blunt this.

### Assigning machine IDs

The one piece of genuine coordination, and where deployments actually go wrong. Two generators sharing a machine ID will produce identical IDs whenever their clocks and sequences align — the exact failure the design exists to prevent.

Options, roughly in order of robustness:

- **ZooKeeper / etcd ephemeral node.** On startup, claim the lowest free ID; the lock disappears if the process dies. Correct, and adds a dependency at boot.
- **Kubernetes StatefulSet ordinal.** Pod name ends in a stable index — `generator-7` takes machine ID 7. Free if you're already on StatefulSets.
- **Derive from a stable host attribute** such as the last octets of a private IP. Works until your network reassigns addresses.
- **Static configuration.** Fine at small scale, quietly dangerous at large scale: someone will eventually copy a config file and duplicate an ID.

Whatever you choose, the property that matters is that **the ID is not reused while the original holder is still running.**

### Sorting: "roughly", not "exactly"

IDs are ordered by generation time, but not globally exact. Two machines generating in the same millisecond produce IDs ordered by machine ID, not by which actually happened first — and "first" isn't well defined across machines anyway without synchronised clocks.

This is almost always fine. Feed pagination, timeline ordering, and debugging all want *approximate* chronology, and Snowflake gives that with millisecond granularity. If you need a total order that reflects real causality, you need logical clocks or a consensus-based sequencer, and both cost far more than three bit-shifts. Say that explicitly if asked — knowing when approximate ordering is sufficient is the actual skill.

### Decoding

Because the fields are positional, an ID is self-describing: shift and mask to recover its creation millisecond and originating machine. That's genuinely useful in production — given an ID from a bug report you know when it was created and which host made it, with no database lookup.

It also means IDs **leak information**: creation time, roughly how many you create per millisecond, and how many machines you run. For internal identifiers that's a feature. For anything user-facing where enumeration or timing matters, use a separate opaque identifier.
