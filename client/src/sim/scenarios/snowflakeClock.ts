import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Scenario, Token } from '../types';
import { lineOf, list } from '../kit';

/*
 * Snowflake IDs when the clock steps backwards.
 *
 * A generator on machine 7 builds each ID from (millisecond, machine, sequence).
 * It issues two IDs a millisecond. After millisecond 1003 its wall clock is
 * stepped back 3 ms — a time sync correcting a clock that ran fast. What
 * nextId() does when `now < lastMs` is the knob:
 *
 *   trust      use the clock as-is       the same IDs come out again
 *   reject     refuse until it catches up what Twitter's original Snowflake did
 *   monotonic  now = max(clock, lastMs)   keep counting inside the last millisecond
 *
 * Every ID shown is produced by running nextId() below, request by request.
 */

// Scenario parameters (a real generator can do 4,096 IDs per ms):
const MACHINE = 7;
const RATE = 2; // IDs requested per millisecond
const START = 1001; // ms (last four digits of a real timestamp)
const BEFORE = 3; // ms of normal issuing before the step
const STEP = 3; // ms the clock is stepped back
const AFTER = 1; // ms of issuing once the clock has passed lastMs again
const SEQ_MAX = 4095;
const BIG_STEP_MS = 2000; // for the reveal: a larger correction

type Mode = 'trust' | 'reject' | 'monotonic';

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const idLabel = (ms: number, seq: number) => `${ms}·${MACHINE}·${seq}`;

// ---- the generator, exactly as the code panel shows it ----

interface Gen {
  lastMs: number;
  seq: number;
}
type Result = { ok: true; ms: number; seq: number; branch: 'same' | 'new' | 'max' } | { ok: false; behind: number };

function nextId(mode: Mode, g: Gen, clock: number): Result {
  let now = clock;
  if (mode === 'reject' && now < g.lastMs) return { ok: false, behind: g.lastMs - now };
  const raised = mode === 'monotonic' && now < g.lastMs;
  if (mode === 'monotonic') now = Math.max(now, g.lastMs);
  let branch: 'same' | 'new' | 'max';
  if (now === g.lastMs) {
    g.seq = (g.seq + 1) & SEQ_MAX;
    if (g.seq === 0) now = g.lastMs + 1; // not reached at this rate
    branch = raised ? 'max' : 'same';
  } else {
    g.seq = 0;
    branch = 'new';
  }
  g.lastMs = now;
  return { ok: true, ms: now, seq: g.seq, branch };
}

const source = (k: KnobValues): string[] => {
  const mode = (k.mode as Mode) ?? 'trust';
  return [
    `let lastMs = -1, seq = 0;`,
    ``,
    `function nextId() {`,
    `  let now = clock.nowMs();`,
    ...(mode === 'reject' ? [`  if (now < lastMs) throw new ClockMovedBackwards(lastMs - now);`] : []),
    ...(mode === 'monotonic' ? [`  now = Math.max(now, lastMs);                    // never go back`] : []),
    `  if (now === lastMs) {`,
    `    seq = (seq + 1) & 4095;                         // 4,096 IDs per ms`,
    mode === 'monotonic'
      ? `    if (seq === 0) now = lastMs + 1;                // full: borrow the next ms`
      : `    if (seq === 0) now = waitUntilAfter(lastMs);    // full: wait for the next ms`,
    `  } else {`,
    `    seq = 0;                                        // a new millisecond`,
    `  }`,
    `  lastMs = now;`,
    `  return (BigInt(now - EPOCH) << 22n) | (MACHINE << 12n) | BigInt(seq);`,
    `}`,
  ];
};

function run(k: KnobValues): Frame[] {
  const mode = (k.mode as Mode) ?? 'trust';
  const src = source(k);
  const at = (a: string) => lineOf(src, a);

  const g: Gen = { lastMs: -1, seq: 0 };
  let real = START - 1;
  let offset = 0; // wall clock minus real time
  const issued: { key: string; ms: number; seq: number; dup: boolean }[] = [];
  const seen = new Set<string>();
  let refused = 0;
  let dupes = 0;
  let inserted = 0;
  const wall = () => real + offset;

  const tokens = (): Token[] =>
    issued.map((x, i) => ({ id: `id-${i}`, label: idLabel(x.ms, x.seq), node: 'issued', tone: x.dup ? 'fail' : i >= issued.length - RATE ? 'active' : 'idle' }));

  const nodes = (): Record<string, NodeState> => ({
    clock: {
      tone: offset < 0 ? 'warn' : 'idle',
      rows: [
        { kind: 'kv', label: 'reads', value: `${wall()} ms`, tone: offset < 0 ? 'warn' : 'idle' },
        { kind: 'kv', label: 'real time', value: `${real} ms`, tone: 'idle' },
      ],
    },
    gen: {
      rows: [
        { kind: 'kv', label: 'lastMs', value: g.lastMs < 0 ? '—' : String(g.lastMs) },
        { kind: 'kv', label: 'seq', value: String(g.seq) },
        { kind: 'kv', label: 'refused', value: String(refused), tone: refused ? 'fail' : 'idle' },
      ],
    },
    issued: {},
    orders: {
      tone: dupes ? 'fail' : 'idle',
      rows: [
        { kind: 'kv', label: 'rows inserted', value: String(inserted) },
        { kind: 'kv', label: 'duplicate-key errors', value: String(dupes), tone: dupes ? 'fail' : 'idle' },
      ],
    },
  });

  const metrics = (): Metric[] => [
    { label: 'Clock reads', value: `${wall()} ms`, tone: offset < 0 ? 'warn' : 'idle' },
    { label: 'IDs issued', value: String(issued.length) },
    { label: 'Duplicates', value: String(dupes), tone: dupes ? 'fail' : 'idle' },
    { label: 'Refused', value: String(refused), tone: refused ? 'fail' : 'idle' },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics' | 'tokens'>) =>
    frames.push({ ...f, t: real, nodes: nodes(), metrics: metrics(), tokens: tokens() });

  /** One real millisecond of requests. Returns what happened, for the narration. */
  const tick = () => {
    real += 1;
    const out: Result[] = [];
    for (let r = 0; r < RATE; r++) {
      const res = nextId(mode, g, wall());
      out.push(res);
      if (!res.ok) {
        refused++;
        continue;
      }
      const key = `${res.ms}-${res.seq}`;
      const dup = seen.has(key);
      seen.add(key);
      issued.push({ key, ms: res.ms, seq: res.seq, dup });
      if (dup) dupes++;
      else inserted++;
    }
    return out;
  };

  // ---- 0. the layout ----
  push({
    line: at('return (BigInt'),
    say: `An ID generator on machine ${MACHINE}. Each ID is 41 bits of millisecond, 10 bits of machine number and 12 bits of sequence — shown here as ms·machine·seq. It is asked for ${RATE} IDs a millisecond.`,
    why: [
      'Because the timestamp is in the high bits, IDs sort by time, and two machines can never collide because their machine numbers differ. The only way one generator can repeat itself is to see the same millisecond twice.',
      'Timestamps are shown as their last four digits.',
    ],
  });

  // ---- 1. normal issuing ----
  for (let i = 0; i < BEFORE; i++) tick();
  push({
    line: at('seq = 0;'),
    packets: [
      { edge: 'clock-gen', dir: 1, kind: 'req', label: `${wall()} ms` },
      { edge: 'gen-orders', dir: 1, kind: 'ok', delay: 380 },
      { edge: 'gen-orders', dir: 1, kind: 'ok', delay: 560 },
    ],
    say: `Milliseconds ${START}–${START + BEFORE - 1}: each new millisecond starts the sequence at 0, the second request in it gets 1. ${issued.length} IDs, each stored as an order's primary key.`,
  });

  // ---- 2. the clock steps back ----
  offset = -STEP;
  push({
    say: `After millisecond ${real}, a time sync decides this clock has been running fast and steps it back ${STEP} ms. It reads ${wall()} now, so the next millisecond it reads is ${wall() + 1} — one this generator has already used.`,
    why: [
      'Clocks step backwards more often than people expect: NTP correcting a clock that drifted ahead, a VM resuming after migration, someone fixing a "wrong" time by hand. A generator that reads the wall clock directly inherits every one of those jumps.',
    ],
  });

  // ---- 3. predict ----
  const after = (() => {
    // Dry-run the next STEP ms to answer the question from the same code.
    const probe: Gen = { ...g };
    const seenProbe = new Set(seen);
    let d = 0;
    let r = 0;
    for (let ms = 0; ms < STEP; ms++)
      for (let q = 0; q < RATE; q++) {
        const res = nextId(mode, probe, wall() + 1 + ms); // the clock reading during that millisecond
        if (!res.ok) r++;
        else if (seenProbe.has(`${res.ms}-${res.seq}`)) d++;
        else seenProbe.add(`${res.ms}-${res.seq}`);
      }
    return { d, r };
  })();
  push({
    say: 'Checkpoint — predict.',
    checkpoint: {
      kind: 'predict',
      prompt: `Requests keep arriving, ${RATE} a millisecond, while the clock reads ${list([...Array(STEP)].map((_, i) => String(wall() + 1 + i)))}. What does the generator hand out?`,
      options: ['Copies of IDs it already issued', 'Errors until the clock catches up', 'New IDs, all unique'],
      answer: after.d > 0 ? 0 : after.r > 0 ? 1 : 2,
      reveal:
        mode === 'trust'
          ? `Copies — ${after.d} of them. Each millisecond it sees is new compared with the last one it used, so the sequence restarts at 0, and ${idLabel(START, 0)} comes out again, exactly as before. The orders table rejects every one as a duplicate primary key.`
          : mode === 'reject'
            ? `Errors, for ${after.r} requests: while the clock reads less than ${g.lastMs}, nextId() throws. That is what Twitter's original Snowflake did. Once the clock reads ${g.lastMs} again it carries on from the same sequence, so nothing is duplicated.`
            : `New, unique IDs. now = max(clock, lastMs) keeps it at ${g.lastMs}, so it simply carries on counting the sequence inside that millisecond — ${idLabel(g.lastMs, g.seq + 1)} onward — until the clock catches up.`,
      source: { title: 'Twitter Snowflake', url: 'https://github.com/twitter-archive/snowflake' },
    },
  });

  // ---- 4. the stepped-back milliseconds, one at a time ----
  for (let ms = 0; ms < STEP; ms++) {
    const res = tick();
    const made = res.filter((r): r is Extract<Result, { ok: true }> => r.ok);
    const failed = res.filter((r) => !r.ok).length;
    const dupNow = issued.slice(-made.length).filter((x) => x.dup).length;
    const first = res[0];
    push({
      line: !first.ok ? at('throw new') : first.branch === 'max' ? at('Math.max') : first.branch === 'new' ? at('seq = 0;') : at('seq = (seq + 1)'),
      vars: { now: String(wall()), lastMs: String(g.lastMs) },
      packets: [
        { edge: 'clock-gen', dir: 1, kind: 'req', label: `${wall()} ms` },
        ...made.map((_, i) => ({ edge: 'gen-orders', dir: 1 as const, kind: (issued[issued.length - made.length + i].dup ? 'fail' : 'ok') as 'fail' | 'ok', delay: 380 + i * 180 })),
      ],
      say: failed
        ? `Clock reads ${wall()}, behind lastMs ${g.lastMs}: both requests are refused with ClockMovedBackwards.`
        : dupNow
          ? `Clock reads ${wall()}. ${list(made.map((m) => idLabel(m.ms, m.seq)))} — ${dupNow === made.length ? 'both already issued' : `${dupNow} already issued`}. The inserts fail on the primary key.`
          : made[0].branch === 'max'
            ? `Clock reads ${wall()}; the generator stays at ${made[0].ms} and keeps counting: ${list(made.map((m) => idLabel(m.ms, m.seq)))}.`
            : `Clock reads ${wall()}, which equals lastMs, so the sequence carries on: ${list(made.map((m) => idLabel(m.ms, m.seq)))}.`,
    });
  }

  // ---- 5. caught up ----
  for (let ms = 0; ms < AFTER; ms++) tick();
  push({
    line: at('seq = 0;'),
    packets: [
      { edge: 'clock-gen', dir: 1, kind: 'req', label: `${wall()} ms` },
      { edge: 'gen-orders', dir: 1, kind: 'ok', delay: 380 },
      { edge: 'gen-orders', dir: 1, kind: 'ok', delay: 560 },
    ],
    say: `The clock reads ${wall()}, past everything used so far, and normal service resumes. Total: ${dupes} duplicate ${dupes === 1 ? 'ID' : 'IDs'}, ${refused} refused ${refused === 1 ? 'request' : 'requests'}.`,
    why:
      mode === 'trust' && dupes
        ? [
            'In a table with a unique primary key, each duplicate is a failed checkout. In a store whose inserts are upserts — Cassandra, most key-value stores — the second write silently replaces the first order, which is worse.',
          ]
        : undefined,
  });

  // ---- closing ----
  const closing: Checkpoint =
    mode === 'trust'
      ? {
          kind: 'break',
          prompt: `A ${STEP} ms correction produced ${dupes} duplicate IDs. What is the least a generator must do when the clock goes backwards?`,
          reveal: `Notice it. Keep lastMs and compare: if the clock reads earlier than the last millisecond used, something is wrong and it must not hand out IDs from that millisecond again. Twitter's original Snowflake refused — it threw an error until the clock caught up. Try that, and then ask what it costs when the step is bigger.`,
          source: { title: 'Twitter Snowflake', url: 'https://github.com/twitter-archive/snowflake' },
          knob: { id: 'mode', value: 'reject', label: 'Refuse while the clock is behind' },
        }
      : mode === 'reject'
        ? {
            kind: 'break',
            prompt: `Refusing cost ${refused} requests for a ${STEP} ms step. What if the clock had drifted further and was stepped back ${BIG_STEP_MS / 1000} seconds?`,
            reveal: `Then this machine refuses every request for ${BIG_STEP_MS / 1000} seconds — ${fmtInt(BIG_STEP_MS * RATE)} at this rate, far more at a real one — and does it at the worst moment, right after its clock was disturbed. Instead of failing, don't follow the clock backwards: take now = max(clock, lastMs) and keep counting inside the last millisecond. IDs stay unique and ordered; their timestamps just stall until the clock catches up.`,
            source: { title: 'Twitter Snowflake', url: 'https://github.com/twitter-archive/snowflake' },
            knob: { id: 'mode', value: 'monotonic', label: 'Never go back: max(clock, lastMs)' },
          }
        : {
            kind: 'why',
            prompt: 'max(clock, lastMs) handled the step. What happens if the generator restarts while its clock is still behind?',
            reveal: `It forgets lastMs — it was only in memory — so it starts from the clock's earlier reading and can reissue IDs from milliseconds it used before the restart. The guard is only as durable as lastMs. Persist a high-water mark (say, every second) and on startup refuse to issue until the clock is past it, or wait out the largest step you are willing to tolerate. Uniqueness that depends on memory has to survive losing it.`,
            source: { title: 'Twitter Snowflake', url: 'https://github.com/twitter-archive/snowflake' },
          };
  push({ say: closing.kind === 'break' ? 'Checkpoint — fix it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

export const snowflakeClock: Scenario = {
  id: 'snowflake-clock',
  topic: 'unique-id-generator',
  title: 'When the clock steps back',
  summary: `A Snowflake generator's clock is stepped back ${STEP} milliseconds — trusting it, refusing, and never going back.`,
  stage: {
    width: 648,
    height: 262,
    nodes: [
      { id: 'clock', label: 'WALL CLOCK', x: 16, y: 16, w: 190, h: 84 },
      { id: 'gen', label: 'ID generator', sub: `machine ${MACHINE}`, x: 16, y: 124, w: 190, h: 122 },
      { id: 'issued', label: 'IDS ISSUED  (ms·machine·seq)', x: 226, y: 16, w: 406, h: 116 },
      { id: 'orders', label: 'orders table', sub: 'PRIMARY KEY (id)', x: 226, y: 152, w: 406, h: 94 },
    ],
    edges: [
      { id: 'clock-gen', from: 'clock', to: 'gen', fromPort: { side: 'b' }, toPort: { side: 't' } },
      { id: 'gen-orders', from: 'gen', to: 'orders', fromPort: { side: 'r', at: (199 - 124) / 122 }, toPort: { side: 'l', at: (199 - 152) / 94 } },
    ],
  },
  knobs: [
    {
      id: 'mode',
      kind: 'choice',
      label: 'clock behind lastMs',
      default: 'trust',
      options: [
        { value: 'trust', label: 'trust it' },
        { value: 'reject', label: 'refuse (Snowflake)' },
        { value: 'monotonic', label: 'max(clock, lastMs)' },
      ],
    },
  ],
  source,
  run,
};
