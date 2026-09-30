import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Row, Scenario, Tone } from '../types';
import { burst, lineOf } from '../kit';

/*
 * A retry storm that outlives its trigger.
 *
 * Users → service A → service B. Real demand is a steady 80 req/s and B can do
 * 100. For ten seconds B loses half its capacity. The model steps once per
 * second:
 *
 *   attempts at B = demand × (attempts per user request) × (attempts per A request)
 *   B works FIFO through its queue at `capacity` per second; a request that has
 *   waited longer than A's timeout is useless even if B finishes it.
 *   The failure fraction feeds the next second's retries.
 *
 * Two independent fixes are knobs: a retry budget (retries ≤ 10% of requests,
 * at both layers) and deadline dropping (B skips requests whose caller has
 * already timed out, instead of doing dead work).
 *
 * Every number on screen, and the answer to the prediction, comes from this loop.
 */

const DEMAND = 80; // req/s from users — never changes
const FULL = 100; // B's capacity, req/s
const DEGRADED = 50;
const INCIDENT = [10, 20]; // seconds; B runs at half capacity in [10, 20)
const TIMEOUT = 1; // seconds: A gives up on a B request after this
const ATTEMPTS = 3; // naive: every layer tries up to 3 times
const BUDGET = 0.1; // retries may be at most 10% of requests
const HORIZON = 600; // seconds simulated, to find recovery

type Retry = 'naive' | 'budget';

interface Tick {
  t: number;
  capacity: number;
  offered: number; // attempts arriving at B this second
  useful: number; // attempts B finished before the caller gave up
  queue: number; // left waiting at B at the end of the second
  oldest: number; // age in seconds of the oldest queued request
  failB: number; // fraction of B attempts that failed
  usersOk: number; // fraction of user requests that succeeded
  ampA: number; // attempts per A request
  ampUser: number; // attempts per user request
}

/** One layer of retries given the chance f that one attempt fails:
 *  attempts per request, and the chance the request fails in the end. */
function layer(retry: Retry, f: number): { attempts: number; fail: number } {
  if (retry === 'naive') {
    let attempts = 0;
    for (let i = 0; i < ATTEMPTS; i++) attempts += f ** i;
    return { attempts, fail: f ** ATTEMPTS };
  }
  // A retry budget: retry a failure only while retries stay under BUDGET of requests.
  const r = f > 0 ? Math.min(1, BUDGET / f) : 0; // share of failures that may retry
  return { attempts: 1 + f * r, fail: f * (r * f + (1 - r)) };
}

export function simulate(retry: Retry, drop: boolean): Tick[] {
  const ticks: Tick[] = [];
  let queue: { at: number; n: number }[] = [];
  let f = 0;
  for (let t = 0; t <= HORIZON; t++) {
    const capacity = t >= INCIDENT[0] && t < INCIDENT[1] ? DEGRADED : FULL;
    const a = layer(retry, f); // A → B
    const u = layer(retry, a.fail); // user → A (a user request fails if its call to A does)
    const offered = DEMAND * u.attempts * a.attempts;
    queue.push({ at: t, n: offered });
    if (drop) queue = queue.filter((c) => t - c.at < TIMEOUT); // skip work whose caller is gone
    let room = capacity;
    let useful = 0;
    while (room > 1e-9 && queue.length) {
      const c = queue[0];
      const k = Math.min(room, c.n);
      if (t - c.at < TIMEOUT) useful += k;
      c.n -= k;
      room -= k;
      if (c.n <= 1e-9) queue.shift();
    }
    const left = queue.reduce((s, c) => s + c.n, 0);
    f = Math.max(0, Math.min(1, 1 - useful / offered));
    ticks.push({
      t,
      capacity,
      offered,
      useful,
      queue: left,
      oldest: queue.length ? t - queue[0].at : 0,
      failB: f,
      // what users experience at this second's failure rate, after every retry
      usersOk: 1 - layer(retry, layer(retry, f).fail).fail,
      ampA: a.attempts,
      ampUser: u.attempts,
    });
  }
  return ticks;
}

/** First second after the incident when users are fully served and B is healthy. */
export function recoveredAt(ticks: Tick[]): number | null {
  const r = ticks.find((k) => k.t >= INCIDENT[1] && k.usersOk > 0.999 && k.failB === 0);
  return r ? r.t : null;
}

const CALL: Record<Retry, string[]> = {
  naive: [
    `async function callB(req) {                       // service A`,
    `  for (let attempt = 1; attempt <= 3; attempt++) {`,
    `    try { return await b.get(req, { timeout: 1000 }); }`,
    `    catch (err) { if (attempt === 3) throw err; }   // and try again`,
    `  }`,
    `}`,
  ],
  budget: [
    `async function callB(req) {                       // service A`,
    `  try { return await b.get(req, { timeout: 1000 }); }`,
    `  catch (err) {`,
    `    if (!retryBudget.tryAcquire()) throw err;   // retries <= 10% of requests`,
    `    await sleep(backoffWithJitter());`,
    `    return b.get(req, { timeout: 1000 });`,
    `  }`,
    `}`,
  ],
};

const source = (k: KnobValues): string[] => {
  const retry = (k.retry as Retry) ?? 'naive';
  return [
    ...CALL[retry],
    ``,
    `worker.process(async (job) => {                  // service B, FIFO queue`,
    k.drop ? `  if (Date.now() > job.deadline) return;   // caller gave up: skip it` : `  // no deadline check: every queued job gets done`,
    `  return handle(job);`,
    `});`,
  ];
};

const rps = (n: number) => `${Math.round(n)}/s`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function run(k: KnobValues): Frame[] {
  const retry = (k.retry as Retry) ?? 'naive';
  const drop = !!k.drop;
  const src = source(k);
  const at = (a: string) => lineOf(src, a);
  const ticks = simulate(retry, drop);
  const rec = recoveredAt(ticks);
  const after = rec === null ? null : rec - INCIDENT[1];

  let cur = ticks[0];
  const shown: Tick[] = [];
  const frames: Frame[] = [];

  const toneOk = (x: number): Tone => (x > 0.999 ? 'ok' : x > 0.5 ? 'warn' : 'fail');
  const history = (): Row => ({
    kind: 'table',
    columns: ['t', 'B capacity', 'attempts at B', 'useful', 'B queue', 'users served'],
    rows: shown.slice(-6).map((s) => [`${s.t} s`, rps(s.capacity), rps(s.offered), rps(s.useful), String(Math.round(s.queue)), pct(s.usersOk)]),
  });

  const nodes = (): Record<string, NodeState> => {
    const over = cur.offered > cur.capacity;
    return {
      users: { badge: pct(cur.usersOk), badgeTone: toneOk(cur.usersOk), sub: `${DEMAND} req/s` },
      a: {
        tone: cur.failB > 0 ? 'warn' : 'idle',
        rows: [
          { kind: 'kv', label: 'user attempts', value: `×${cur.ampUser.toFixed(2)}`, tone: cur.ampUser > 1.001 ? 'warn' : 'idle' },
          { kind: 'kv', label: 'B attempts', value: `×${cur.ampA.toFixed(2)}`, tone: cur.ampA > 1.001 ? 'warn' : 'idle' },
          { kind: 'kv', label: 'B calls failing', value: pct(cur.failB), tone: cur.failB > 0 ? 'fail' : 'idle' },
        ],
      },
      b: {
        tone: cur.useful < Math.min(cur.offered, cur.capacity) - 0.5 ? 'fail' : over ? 'warn' : 'active',
        badge: cur.capacity < FULL ? 'HALF DOWN' : undefined,
        badgeTone: 'fail',
        rows: [
          { kind: 'bar', value: Math.min(cur.offered, 4 * FULL), max: 4 * FULL, tone: over ? 'fail' : 'ok' },
          { kind: 'kv', label: 'offered / capacity', value: `${Math.round(cur.offered)} / ${cur.capacity}`, tone: over ? 'fail' : 'idle' },
          { kind: 'kv', label: 'queue', value: `${Math.round(cur.queue)}${cur.oldest ? ` · oldest ${cur.oldest} s` : ''}`, tone: cur.oldest >= TIMEOUT ? 'fail' : 'idle' },
          { kind: 'kv', label: 'useful work', value: rps(cur.useful), tone: cur.useful + 0.5 < Math.min(cur.offered, cur.capacity) ? 'fail' : 'ok' },
        ],
      },
      hist: { rows: [history()] },
    };
  };

  const metrics = (): Metric[] => [
    { label: 'Users served', value: pct(cur.usersOk), tone: toneOk(cur.usersOk) },
    { label: 'Attempts at B', value: rps(cur.offered), tone: cur.offered > cur.capacity ? 'fail' : 'idle' },
    { label: 'Useful', value: rps(cur.useful) },
    { label: 'Clock', value: `t = ${cur.t} s` },
  ];

  const flow = (s: Tick) => {
    const n = (r: number) => Math.max(1, Math.min(12, Math.round(r / 40)));
    const userRate = DEMAND * s.ampUser;
    return [
      ...burst(n(userRate), 'users-a', 1, 'req', 0, 80),
      ...burst(n(s.offered), 'a-b', 1, 'req', 200, 60),
      ...burst(n(s.useful) || 1, 'a-b', -1, s.useful > 0 ? 'ok' : 'fail', 900, 80),
      ...(s.failB > 0 ? burst(Math.max(1, Math.round(n(s.offered) * s.failB)), 'a-b', -1, 'fail', 1000, 60) : []),
      ...burst(n(DEMAND), 'users-a', -1, s.usersOk > 0.999 ? 'ok' : s.usersOk > 0 ? 'nil' : 'fail', 1500, 80),
    ];
  };

  const push = (t: number, f: Omit<Frame, 't' | 'nodes' | 'metrics'>) => {
    cur = ticks[t];
    if (!shown.includes(cur)) shown.push(cur);
    frames.push({ ...f, t: t * 1000, packets: f.packets ?? flow(cur), nodes: nodes(), metrics: metrics() });
  };

  const retryLine = retry === 'naive' ? at('attempt === 3') : at('retryBudget.tryAcquire()');
  const bLine = drop ? at('job.deadline') : at('return handle(job)');

  // ---- 0. steady state ----
  push(0, {
    line: at('b.get(req'),
    say: `Steady state: users send ${DEMAND} req/s, service A calls B once per request, and B has room for ${FULL}. Every request succeeds.`,
    why: [
      `B is at ${pct(DEMAND / FULL)} utilisation — comfortable. The retry code in A${retry === 'naive' ? ' and in the users\' app' : ''} has never run.`,
      'This model steps once per second and treats failures in a second as independent. Crude — but it produces exactly the shape real retry storms have.',
    ],
  });

  // ---- 1. predict ----
  const option = after === null ? 3 : after <= 2 ? 0 : after <= 30 ? 1 : 2;
  push(0, {
    say: 'Checkpoint — predict the recovery.',
    checkpoint: {
      kind: 'predict',
      prompt: `At t = ${INCIDENT[0]} s, B loses half its capacity (${FULL} → ${DEGRADED} req/s) for ${INCIDENT[1] - INCIDENT[0]} seconds. At t = ${INCIDENT[1]} s it's fully back — and user demand never changed. What happens after t = ${INCIDENT[1]} s?`,
      options: ['Back to normal at once', 'Back to normal within half a minute', 'Back to normal, but only after minutes', 'It never recovers on its own'],
      answer: option,
      reveal:
        after === null
          ? `It never recovers. By the time capacity returns, every B call is failing, so every layer retries: ${ATTEMPTS} attempts from the users' app × ${ATTEMPTS} from A = ${ATTEMPTS * ATTEMPTS}× the load, ${Math.round(DEMAND * ATTEMPTS * ATTEMPTS)} req/s against a capacity of ${FULL}. That overload keeps the failure rate at 100%, which keeps the retries going. The trigger is gone; the storm sustains itself.`
          : after <= 2
            ? `Back to normal at once. The retry budget kept attempts at B near ${rps(ticks[INCIDENT[1] - 1].offered)} during the incident, and B never wasted work on requests nobody was waiting for — so the moment capacity returned, there was nothing to dig out of.`
            : after <= 30
              ? `Back to normal ${after} s after capacity returns. Retries pushed attempts at B to ${rps(ticks[INCIDENT[1] - 1].offered)}, but because B skips requests whose caller already gave up, all its capacity goes to live requests. Failures fall, so retries fall, and it winds down.`
              : `Back to normal only after ${Math.round(after / 60 * 10) / 10} minutes. The retry budget capped attempts at B — but during the incident B's queue filled with requests that had already timed out. B works through that dead backlog first, at a few spare req/s, and every live request waits behind it and times out too.`,
      source: { title: 'AWS Builders\' Library — Timeouts, retries, and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
    },
  });

  // ---- 2. the incident ----
  push(INCIDENT[0], {
    line: at('b.get(req'),
    say: `t = ${INCIDENT[0]} s: half of B's fleet goes away. B can do ${DEGRADED} req/s against ${Math.round(ticks[INCIDENT[0]].offered)} arriving; ${pct(ticks[INCIDENT[0]].failB)} of calls fail.`,
  });

  push(INCIDENT[0] + 1, {
    line: retryLine,
    say:
      retry === 'naive'
        ? `t = ${INCIDENT[0] + 1} s: the failures come back as retries. Attempts at B jump to ${rps(ticks[INCIDENT[0] + 1].offered)} — more load on a service that is already short of capacity.`
        : `t = ${INCIDENT[0] + 1} s: failures come back as retries, but the budget allows retries of at most ${pct(BUDGET)} of requests at each layer: attempts at B rise only to ${rps(ticks[INCIDENT[0] + 1].offered)}.`,
  });

  push(INCIDENT[0] + 3, {
    line: bLine,
    say: drop
      ? `t = ${INCIDENT[0] + 3} s: attempts at B are ${rps(ticks[INCIDENT[0] + 3].offered)}, but B checks each job's deadline and skips the ones whose caller has given up. All ${DEGRADED} req/s of its capacity goes to requests someone is still waiting for.`
      : `t = ${INCIDENT[0] + 3} s: B's queue is ${Math.round(ticks[INCIDENT[0] + 3].queue)} deep. Everything at the front waited over ${TIMEOUT} s, so A has already timed out on it — B is doing work nobody will read. Useful work: ${rps(ticks[INCIDENT[0] + 3].useful)}.`,
  });

  if (retry === 'naive') {
    const peak = ticks[INCIDENT[1] - 1];
    push(INCIDENT[1] - 1, {
      line: retryLine,
      say: `t = ${INCIDENT[1] - 1} s: attempts at B have reached ${rps(peak.offered)} — ${(peak.offered / DEMAND).toFixed(1)}× the real demand.`,
      checkpoint: {
        kind: 'why',
        prompt: `Why can two layers of "try up to ${ATTEMPTS} times" multiply load by up to ${ATTEMPTS * ATTEMPTS}×?`,
        reveal: `Retries multiply across layers. Each user request becomes up to ${ATTEMPTS} calls to A, and each of those becomes up to ${ATTEMPTS} calls to B: ${ATTEMPTS} × ${ATTEMPTS} = ${ATTEMPTS * ATTEMPTS} attempts at the bottom. With five layers it would be ${ATTEMPTS ** 5}. The load lands on the deepest service — usually the one that was struggling — exactly when it can least absorb it.`,
        source: { title: 'Google SRE Book — Addressing Cascading Failures', url: 'https://sre.google/sre-book/addressing-cascading-failures/' },
      },
    });
  }

  // ---- 3. capacity returns ----
  const back = ticks[INCIDENT[1]];
  push(INCIDENT[1], {
    say:
      after === 0
        ? `t = ${INCIDENT[1]} s: B is back to ${FULL} req/s and recovers in the same second — ${rps(back.offered)} attempts, ${pct(back.usersOk)} of users served. There was no backlog of dead work and no retry storm to unwind.`
        : `t = ${INCIDENT[1]} s: B is back to ${FULL} req/s. Attempts arriving: ${rps(back.offered)}. Users served: ${pct(back.usersOk)}.`,
  });

  if (after === null) {
    const late = ticks[INCIDENT[1] + 40];
    push(INCIDENT[1] + 40, {
      line: bLine,
      say: `t = ${late.t} s, forty seconds after the incident ended: ${rps(late.offered)} attempts against ${FULL} capacity, a queue of ${Math.round(late.queue)}, and ${pct(late.usersOk)} of users served. This is a stable state — a metastable failure. Only shedding load will end it.`,
    });
  } else if (after > 2) {
    const mid = ticks[Math.min(INCIDENT[1] + Math.ceil(after / 2), rec! - 1)];
    push(mid.t, {
      line: bLine,
      say: drop
        ? `t = ${mid.t} s: with full capacity spent on live requests, failures drop to ${pct(mid.failB)}; fewer failures mean fewer retries, which means fewer failures.`
        : `t = ${mid.t} s: the queue is still ${Math.round(mid.queue)} deep — about ${(mid.queue / FULL).toFixed(1)} s of waiting, longer than A's ${TIMEOUT} s timeout. Everything B finishes has already been abandoned, and the queue shrinks by only ${Math.round(FULL - mid.offered)} a second (${FULL} capacity − ${Math.round(mid.offered)} arriving).`,
    });
    push(rec!, {
      say: `t = ${rec} s: recovered — ${after} s after capacity came back. Attempts at B are ${rps(ticks[rec!].offered)} again.`,
    });
  } else if (after > 0) {
    push(rec!, {
      say: `t = ${rec} s: recovered ${after} s after capacity came back. There was no backlog of dead work and no retry storm to unwind.`,
    });
  }

  // ---- 4. closing ----
  const closing: Checkpoint =
    retry === 'naive' && !drop
      ? {
          kind: 'break',
          prompt: 'Capacity is back, demand is normal, and the system is still down. What is the first thing to change in the retry code?',
          reveal: `Bound the retries. A retry budget lets a client retry only while retries are under about 10% of its requests; under a real outage it simply stops retrying, so load can't multiply. Add exponential backoff with jitter so the retries that do happen are spread out rather than synchronised. Today, an operator would have to shed load by hand to break the loop.`,
          source: { title: 'AWS Builders\' Library — Timeouts, retries, and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
          knob: { id: 'retry', value: 'budget', label: 'Use a retry budget' },
        }
      : !drop
        ? {
            kind: 'break',
            prompt: `The budget kept load near demand, yet recovery took ${Math.round(after! / 6) / 10} minutes. What was B spending its capacity on?`,
            reveal: `Requests whose caller had already timed out. B's FIFO queue filled during the incident, and afterwards B faithfully served the oldest jobs first — work nobody would read. Give each request a deadline, propagate it, and have B drop anything already past it. A queue should never hold more than a timeout's worth of work.`,
            source: { title: 'Google SRE Book — Addressing Cascading Failures', url: 'https://sre.google/sre-book/addressing-cascading-failures/' },
            knob: { id: 'drop', value: true, label: 'Drop expired requests' },
          }
        : retry === 'naive'
          ? {
              kind: 'break',
              prompt: `It recovered, but attempts at B peaked at ${rps(ticks[INCIDENT[1] - 1].offered)}. What happens if skipping a request isn't quite free?`,
              reveal: `Then the storm wins again. Dropping an expired job still costs a dequeue, a deadline check, maybe a connection — and at ${Math.round(ticks[INCIDENT[1] - 1].offered / DEMAND)}× the demand, "cheap" adds up to overload. Deadline dropping protects B's useful work; it doesn't stop callers multiplying the load. You want both.`,
              source: { title: 'Google SRE Book — Addressing Cascading Failures', url: 'https://sre.google/sre-book/addressing-cascading-failures/' },
              knob: { id: 'retry', value: 'budget', label: 'Also use a retry budget' },
            }
          : {
              kind: 'why',
              prompt: 'Where does a circuit breaker fit, next to a retry budget?',
              reveal: `A retry budget limits the extra load retries add; the first attempt still goes out. A circuit breaker goes further: when a dependency's failure rate crosses a threshold it fails calls immediately for a while, then lets a few probe requests through to test recovery. Use the breaker to stop hammering something that's clearly down, and the budget to keep retries from multiplying when it's merely struggling.`,
              source: { title: 'AWS Builders\' Library — Timeouts, retries, and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
            };
  frames.push({ ...frames[frames.length - 1], packets: [], line: undefined, vars: undefined, why: undefined, say: closing.kind === 'break' ? 'Checkpoint — fix it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

export const retryStorm: Scenario = {
  id: 'retry-storm',
  topic: 'performance-and-latency',
  title: 'Retry storm',
  summary: 'A ten-second capacity dip turns into an outage that never ends — unless retries are budgeted and dead work is dropped.',
  stage: {
    width: 648,
    height: 330,
    nodes: [
      { id: 'users', label: 'users', x: 16, y: 44, w: 112, h: 58 },
      { id: 'a', label: 'service A', x: 160, y: 16, w: 196, h: 114 },
      { id: 'b', label: 'service B', x: 392, y: 16, w: 240, h: 114 },
      { id: 'hist', label: 'SECOND BY SECOND', x: 16, y: 150, w: 616, h: 172 },
    ],
    edges: [
      { id: 'users-a', from: 'users', to: 'a', fromPort: { side: 'r' }, toPort: { side: 'l', at: (73 - 16) / 114 } },
      { id: 'a-b', from: 'a', to: 'b', fromPort: { side: 'r' }, toPort: { side: 'l' } },
    ],
  },
  knobs: [
    {
      id: 'retry',
      kind: 'choice',
      label: 'retries',
      default: 'naive',
      options: [
        { value: 'naive', label: '3 attempts per layer' },
        { value: 'budget', label: 'retry budget (10%)' },
      ],
    },
    { id: 'drop', kind: 'toggle', label: 'B drops expired requests', default: false },
  ],
  source,
  run,
};
