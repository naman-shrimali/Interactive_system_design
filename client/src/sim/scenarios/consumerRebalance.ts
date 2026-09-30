import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Scenario, Tone } from '../types';
import { factMs, fmtClock, fmtMs } from '../facts';
import { burst, lineOf, list } from '../kit';

/*
 * A consumer dies mid-batch and its partition moves to another consumer.
 *
 * Consumer 1 polls payments at offsets 40–44, charges three of them, and
 * crashes. After the session timeout the group coordinator hands partition 0
 * to consumer 2, which resumes from the last COMMITTED offset. Where that
 * offset is — and whether the charge is idempotent — decides the outcome:
 *
 *   before       commit, then process       at-most-once: 43 and 44 are never charged
 *   after        process, then commit       at-least-once: 40–42 are charged twice
 *   idempotent   after + ON CONFLICT        each payment charged exactly once
 */

const RTT = factMs('datacenter-round-trip');
// fact-exempt: Kafka's session.timeout.ms default since 3.0 (KIP-735)
const SESSION_TIMEOUT = 45_000;
const FIRST = 40;
const OFFSETS = [40, 41, 42, 43, 44];
const END = FIRST + OFFSETS.length;
const CRASH_AFTER = 3; // consumer 1 charges this many, then dies
const GEN = 7;

type Mode = 'before' | 'after' | 'idempotent';
type Consumer = 'c1' | 'c2';

const source = (k: KnobValues): string[] => {
  const mode = (k.commit as Mode) ?? 'after';
  const commit = `  await consumer.commit(batch.lastOffset + 1);`;
  const insert = `      'INSERT INTO charges (payment_id, amount) VALUES ($1, $2)'`;
  return [
    `while (true) {`,
    `  const batch = await consumer.poll();`,
    ...(mode === 'before' ? [`${commit}   // commit first: at-most-once`] : []),
    `  for (const msg of batch) {`,
    `    await db.query(`,
    ...(mode === 'idempotent' ? [insert, `      + ' ON CONFLICT (payment_id) DO NOTHING',   // a replay is a no-op`] : [`${insert},`]),
    `      [msg.paymentId, msg.amount]);`,
    `  }`,
    ...(mode !== 'before' ? [`${commit}   // commit after: at-least-once`] : []),
    `}`,
  ];
};

/** The outcome, computed independently of the frames: charges per payment. */
function simulate(mode: Mode): { twice: number[]; never: number[] } {
  const charges = new Map<number, number>(OFFSETS.map((o) => [o, 0]));
  let committed = FIRST;
  const charge = (o: number) => {
    if (mode === 'idempotent' && charges.get(o)! > 0) return;
    charges.set(o, charges.get(o)! + 1);
  };
  // consumer 1
  if (mode === 'before') committed = END;
  OFFSETS.slice(0, CRASH_AFTER).forEach(charge);
  // crash; consumer 2 resumes at the committed offset
  OFFSETS.filter((o) => o >= committed).forEach(charge);
  return {
    twice: OFFSETS.filter((o) => charges.get(o)! > 1),
    never: OFFSETS.filter((o) => charges.get(o) === 0),
  };
}

function run(k: KnobValues): Frame[] {
  const mode = (k.commit as Mode) ?? 'after';
  const src = source(k);
  const at = (a: string) => lineOf(src, a);

  let t = 0;
  let committed = FIRST;
  let generation = GEN;
  let owner: Consumer | null = 'c1';
  let c1Down = false;
  const position: Record<Consumer, number | null> = { c1: null, c2: null };
  const charges = new Map<number, number>(OFFSETS.map((o) => [o, 0]));
  let skipped = 0;
  const inFlight = new Set<number>();
  const hot = new Set<string>();
  let settled = false; // consumer 2 has finished; "never charged" is now final

  const twice = () => OFFSETS.filter((o) => charges.get(o)! > 1);
  const never = () => (settled ? OFFSETS.filter((o) => charges.get(o) === 0) : []);

  const consumer = (c: Consumer): NodeState => {
    const down = c === 'c1' && c1Down;
    return {
      tone: down ? 'fail' : hot.has(c) ? 'active' : 'idle',
      badge: down ? 'DOWN' : owner === c ? 'p0' : undefined,
      badgeTone: down ? 'fail' : 'ok',
      rows: [
        { kind: 'kv', label: 'assigned', value: down ? '—' : owner === c ? 'partition 0' : 'none', tone: owner === c && !down ? 'idle' : 'dim' },
        { kind: 'kv', label: 'position', value: position[c] === null || down ? '—' : String(position[c]), tone: 'idle' },
      ],
    };
  };

  const offsetTone = (o: number): Tone => (o < committed ? 'ok' : inFlight.has(o) ? 'active' : 'idle');

  const nodes = (): Record<string, NodeState> => ({
    part: {
      tone: hot.has('part') ? 'active' : 'idle',
      rows: [
        { kind: 'log', label: 'offsets', entries: OFFSETS.map((o) => ({ text: String(o), tone: offsetTone(o) })) },
        { kind: 'kv', label: 'log end', value: String(END), tone: 'idle' },
      ],
    },
    coord: {
      tone: hot.has('coord') ? 'active' : 'idle',
      rows: [
        { kind: 'kv', label: 'committed', value: String(committed), tone: committed === END ? 'ok' : 'idle' },
        { kind: 'kv', label: 'generation', value: String(generation), tone: 'idle' },
        { kind: 'kv', label: 'members', value: c1Down && owner !== 'c1' ? 'c2' : 'c1, c2', tone: 'idle' },
      ],
    },
    c1: consumer('c1'),
    c2: consumer('c2'),
    db: {
      tone: hot.has('db') ? 'active' : 'idle',
      rows: [
        {
          kind: 'table',
          columns: ['payment', 'charged'],
          rows: OFFSETS.map((o) => {
            const n = charges.get(o)!;
            return [`pay-${o}`, n === 0 ? (settled ? 'never' : '—') : n === 1 ? 'once' : `${n}×`];
          }),
        },
        mode === 'idempotent'
          ? { kind: 'kv', label: 'replays ignored', value: String(skipped), tone: skipped ? 'ok' : 'dim' }
          : { kind: 'kv', label: 'double charges', value: String(twice().length), tone: twice().length ? 'fail' : 'dim' },
      ],
    },
  });

  const metrics = (): Metric[] => [
    { label: 'Committed', value: String(committed) },
    { label: 'Lag', value: `${END - committed} msgs`, tone: END - committed > 0 ? 'warn' : 'idle' },
    { label: 'Charged twice', value: String(twice().length), tone: twice().length ? 'fail' : 'idle' },
    { label: 'Never charged', value: settled ? String(never().length) : '—', tone: never().length ? 'fail' : 'idle' },
    { label: 'Clock', value: fmtClock(t).replace('t = ', '') },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics'>) => {
    frames.push({ ...f, t, nodes: nodes(), metrics: metrics() });
    hot.clear();
  };

  const charge = (o: number) => {
    if (mode === 'idempotent' && charges.get(o)! > 0) {
      skipped++;
      return false;
    }
    charges.set(o, charges.get(o)! + 1);
    return true;
  };

  // ---- 0. setting ----
  push({
    say: `Consumer 1 owns partition 0 of the payments topic. Five payments wait at offsets ${FIRST}–${END - 1}; the group has committed offset ${FIRST}, meaning "everything before ${FIRST} is done."`,
    why: [
      'Kafka doesn\'t track which messages a consumer has handled. It stores one number per partition — the committed offset — and a consumer that takes over starts from there.',
      'So the question in any crash is simple: where was the committed offset, relative to the work that actually happened?',
    ],
  });

  // ---- 1. poll ----
  t += RTT;
  position.c1 = END;
  OFFSETS.forEach((o) => inFlight.add(o));
  hot.add('c1').add('part');
  push({
    line: at('consumer.poll()'),
    vars: { batch: `offsets ${FIRST}–${END - 1}` },
    packets: burst(OFFSETS.length, 'part-c1', 1, 'req', 0, 110),
    say: `Consumer 1 polls and gets all five payments in one batch. Its position moves to ${END}; the committed offset is still ${FIRST}.`,
  });

  if (mode === 'before') {
    t += RTT;
    committed = END;
    hot.add('c1').add('coord');
    push({
      line: at('consumer.commit('),
      vars: { 'batch.lastOffset + 1': String(END) },
      packets: [
        { edge: 'c1-coord', dir: 1, kind: 'req', label: `commit ${END}` },
        { edge: 'c1-coord', dir: -1, kind: 'ok', delay: 520 },
      ],
      say: `Before charging anyone, consumer 1 commits offset ${END}: as far as Kafka knows, the whole batch is done.`,
    });
  }

  // ---- 2. predict ----
  const expected = simulate(mode);
  const optionOf = (tw: number, nv: number) => (tw && nv ? 3 : nv ? 2 : tw ? 1 : 0);
  push({
    say: 'Checkpoint — predict the damage.',
    checkpoint: {
      kind: 'predict',
      prompt: `Consumer 1 will charge ${list(OFFSETS.slice(0, CRASH_AFTER).map(String))}, then crash. Consumer 2 takes over partition 0. When it has caught up, what has happened to the five customers?`,
      options: ['Each charged exactly once', `${CRASH_AFTER} charged twice`, `${OFFSETS.length - CRASH_AFTER} never charged`, 'Some twice and some never'],
      answer: optionOf(expected.twice.length, expected.never.length),
      reveal: {
        before: `${OFFSETS.length - CRASH_AFTER} never charged. The commit said ${END} before any work was done, so consumer 2 starts at ${END}. Payments ${list(expected.never.map(String))} were fetched by a consumer that died holding them — no one will ever process them. That's at-most-once delivery.`,
        after: `${CRASH_AFTER} charged twice. Consumer 1 died before its commit, so the committed offset is still ${FIRST}. Consumer 2 starts there and re-processes ${list(expected.twice.map(String))}, which were already charged. Nothing is lost, but at-least-once delivery means duplicates.`,
        idempotent: `Each charged exactly once. Consumer 2 still re-delivers ${list(OFFSETS.slice(0, CRASH_AFTER).map(String))} — Kafka's at-least-once behaviour hasn't changed — but the database already has those payment ids, and ON CONFLICT DO NOTHING turns each replay into a no-op.`,
      }[mode],
      source: { title: 'Apache Kafka Documentation', url: 'https://kafka.apache.org/documentation/' },
    },
  });

  // ---- 3. consumer 1 charges three ----
  OFFSETS.slice(0, CRASH_AFTER).forEach((o) => charge(o));
  t += RTT * CRASH_AFTER;
  hot.add('c1').add('db');
  push({
    line: at('INSERT INTO charges'),
    vars: { 'msg.paymentId': `pay-${OFFSETS[CRASH_AFTER - 1]}` },
    packets: burst(CRASH_AFTER, 'c1-db', 1, 'req', 0, 260).concat(burst(CRASH_AFTER, 'c1-db', -1, 'ok', 420, 260)),
    say: `Consumer 1 charges payments ${list(OFFSETS.slice(0, CRASH_AFTER).map(String))}. Each INSERT commits in the database immediately — that part is real money now.`,
  });

  // ---- 4. crash ----
  c1Down = true;
  push({
    line: at('for (const msg of batch)'),
    say: `Consumer 1's process is killed while handling payment ${OFFSETS[CRASH_AFTER]}. A crash sends no goodbye, so the coordinator doesn't know yet.${
      mode === 'before' ? '' : ` The commit line after the loop never ran.`
    }`,
    why: [
      'A clean shutdown sends LeaveGroup and the partition moves at once. A crash, a kernel OOM kill, or a long GC pause looks the same to the coordinator: heartbeats just stop.',
    ],
  });

  // ---- 5. session timeout → rebalance ----
  t += SESSION_TIMEOUT;
  generation += 1;
  owner = 'c2';
  inFlight.clear();
  hot.add('coord').add('c2');
  push({
    packets: [
      { edge: 'c1-coord', dir: 1, kind: 'fail', label: 'no heartbeat' },
      { edge: 'c2-coord', dir: -1, kind: 'req', label: 'assign p0', delay: 600 },
    ],
    links: { 'c1-coord': 'cut' },
    say: `${fmtMs(SESSION_TIMEOUT)} without a heartbeat and the session expires. The coordinator starts generation ${generation} and assigns partition 0 to consumer 2. For those ${fmtMs(SESSION_TIMEOUT)}, no one charged anybody.`,
  });

  // ---- 6. consumer 2 resumes at the committed offset ----
  t += RTT;
  const resume = committed;
  position.c2 = resume;
  const todo = OFFSETS.filter((o) => o >= resume);
  todo.forEach((o) => inFlight.add(o));
  hot.add('c2').add('part');
  push({
    line: at('consumer.poll()'),
    vars: { batch: todo.length ? `offsets ${todo[0]}–${todo[todo.length - 1]}` : 'empty' },
    packets: [
      { edge: 'c2-coord', dir: 1, kind: 'req', label: 'offset?' },
      { edge: 'c2-coord', dir: -1, kind: 'ok', label: String(resume), delay: 480 },
      ...(todo.length ? burst(todo.length, 'part-c2', 1, 'req', 960, 110) : []),
    ],
    say: todo.length
      ? `Consumer 2 asks for the committed offset — ${resume} — and fetches from there: ${list(todo.map(String))}.`
      : `Consumer 2 asks for the committed offset — ${resume} — which is the end of the log. There is nothing to fetch.`,
  });

  // ---- 7. consumer 2 processes ----
  if (todo.length) {
    const replayed = todo.filter((o) => charges.get(o)! > 0);
    const results = todo.map((o) => charge(o));
    t += RTT * todo.length;
    position.c2 = END;
    hot.add('c2').add('db');
    push({
      line: at('INSERT INTO charges'),
      packets: burst(todo.length, 'c2-db', 1, 'req', 0, 200).concat(
        results.map((ok, i) => ({ edge: 'c2-db', dir: -1 as const, kind: ok ? ('ok' as const) : ('nil' as const), delay: 380 + i * 200 })),
      ),
      say:
        mode === 'idempotent'
          ? `Consumer 2 replays ${list(replayed.map(String))}; the database finds each payment id already present and does nothing. ${list(todo.filter((o) => !replayed.includes(o)).map(String))} ${todo.length - replayed.length === 1 ? 'is' : 'are'} charged for the first time.`
          : `Consumer 2 charges ${list(todo.map(String))}. ${list(replayed.map(String))} ${replayed.length === 1 ? 'was' : 'were'} already charged by consumer 1 — those customers now pay twice.`,
    });

    t += RTT;
    committed = END;
    inFlight.clear();
    hot.add('c2').add('coord');
    push({
      line: at('consumer.commit('),
      vars: { 'batch.lastOffset + 1': String(END) },
      packets: [
        { edge: 'c2-coord', dir: 1, kind: 'req', label: `commit ${END}` },
        { edge: 'c2-coord', dir: -1, kind: 'ok', delay: 520 },
      ],
      say: `Consumer 2 commits ${END}. Lag is back to zero.`,
    });
  }

  settled = true;
  const got = { twice: twice(), never: never() };
  if (got.twice.join() !== expected.twice.join() || got.never.join() !== expected.never.join())
    throw new Error(`consumer-rebalance(${mode}): frames disagree with simulate()`);

  push({
    say:
      got.never.length
        ? `Final tally: payments ${list(got.never.map(String))} were never charged, and nothing will notice — consumer lag reads 0, because the log says they're done.`
        : got.twice.length
          ? `Final tally: ${got.twice.length} customers charged twice, none missed.`
          : 'Final tally: every payment charged exactly once, despite the crash and the replay.',
  });

  // ---- closing checkpoint ----
  const closing: Checkpoint =
    mode === 'before'
      ? {
          kind: 'break',
          prompt: 'Two customers got their goods for free, silently. What ordering change stops messages being lost?',
          reveal: 'Commit only after the work is done. Then a crash can only ever leave the committed offset behind the real progress, never ahead of it — so a replacement consumer re-does some work instead of skipping it. You trade lost messages for duplicates, which you can at least detect and fix.',
          source: { title: 'Apache Kafka Documentation', url: 'https://kafka.apache.org/documentation/' },
          knob: { id: 'commit', value: 'after', label: 'Commit after processing' },
        }
      : mode === 'after'
        ? {
            kind: 'break',
            prompt: 'Nothing is lost now, but three customers paid twice. Committing more often narrows the window — does it close it?',
            reveal: 'No. However often you commit, there is always a moment between "the side effect happened" and "the offset was committed" where a crash causes a replay. The fix is to make the side effect idempotent: key each write by the payment id so a replay finds it already done. At-least-once delivery plus idempotent processing is how "exactly once" is actually built.',
            source: { title: 'Apache Kafka Documentation', url: 'https://kafka.apache.org/documentation/' },
            knob: { id: 'commit', value: 'idempotent', label: 'Make the charge idempotent' },
          }
        : {
            kind: 'why',
            prompt: 'Kafka advertises exactly-once semantics. Why did we still need ON CONFLICT in the database?',
            reveal: 'Kafka\'s exactly-once — idempotent producers plus transactions — covers reads and writes within Kafka: consume, produce, and commit offsets atomically. A database or payment API is outside that transaction, so Kafka can\'t un-send a charge. For external side effects, you still need an idempotency key: a unique constraint here, or the idempotency-key header a payment provider accepts.',
            source: { title: 'Apache Kafka Documentation', url: 'https://kafka.apache.org/documentation/' },
          };
  push({ say: closing.kind === 'break' ? 'Checkpoint — fix it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

export const consumerRebalance: Scenario = {
  id: 'consumer-rebalance',
  topic: 'asynchronism',
  title: 'Consumer crash and rebalance',
  summary: 'A consumer dies mid-batch; where the committed offset was decides whether payments are lost, doubled, or charged exactly once.',
  stage: {
    width: 648,
    height: 360,
    nodes: [
      { id: 'part', label: 'payments · partition 0', x: 16, y: 130, w: 208, h: 100 },
      { id: 'c1', label: 'consumer 1', x: 264, y: 16, w: 170, h: 88 },
      { id: 'coord', label: 'group coordinator', sub: 'a broker', x: 264, y: 132, w: 170, h: 112 },
      { id: 'c2', label: 'consumer 2', x: 264, y: 272, w: 170, h: 88 },
      { id: 'db', label: 'payments DB', sub: 'charges', x: 474, y: 16, w: 158, h: 200 },
    ],
    edges: [
      { id: 'part-c1', from: 'part', to: 'c1', fromPort: { side: 'r', at: 0.3 }, toPort: { side: 'l' }, via: [[244, 160], [244, 60]] },
      { id: 'part-c2', from: 'part', to: 'c2', fromPort: { side: 'r', at: 0.7 }, toPort: { side: 'l' }, via: [[244, 200], [244, 316]] },
      { id: 'c1-coord', from: 'c1', to: 'coord', fromPort: { side: 'b' }, toPort: { side: 't' } },
      { id: 'c2-coord', from: 'c2', to: 'coord', fromPort: { side: 't' }, toPort: { side: 'b' } },
      { id: 'c1-db', from: 'c1', to: 'db', fromPort: { side: 'r' }, toPort: { side: 'l', at: (60 - 16) / 200 } },
      { id: 'c2-db', from: 'c2', to: 'db', fromPort: { side: 'r' }, toPort: { side: 'b' }, via: [[553, 316]] },
    ],
  },
  knobs: [
    {
      id: 'commit',
      kind: 'choice',
      label: 'offset commit',
      default: 'after',
      options: [
        { value: 'before', label: 'before processing' },
        { value: 'after', label: 'after processing' },
        { value: 'idempotent', label: 'after + idempotent write' },
      ],
    },
  ],
  source,
  run,
};
