import type { Frame, KnobValues, Metric, NodeState, Packet, Row, Scenario } from '../types';
import { factMs, fmtMs, fmtClock } from '../facts';
import { rng } from '../rng';

/*
 * Cache stampede, single-flight, and TTL jitter.
 *
 * Part 1 follows one hot key through expiry: four concurrent misses, and what
 * single-flight does to them. Part 2 zooms out to several keys written in the
 * same second, which is the failure TTL jitter exists for.
 */

const RTT = factMs('datacenter-round-trip');
// A primary-key read that misses Postgres' buffer cache: one round trip to the
// database plus one random SSD read.
const QUERY = RTT + factMs('ssd-random-read');
const LOCK_PX = 5000; // Redis PX argument, not a latency
// fact-exempt: a hypothetical expensive rebuild, not a property of hardware
const REBUILD_MS = 50;
const HOT_RPS = 10_000;
const TTL_S = 60;
const JITTER_S = 10;

const CLIENTS = ['r1', 'r2', 'r3', 'r4'] as const;
type Client = (typeof CLIENTS)[number];
const HOT_KEYS = ['product:42', 'product:43', 'product:44'];

const source = (k: KnobValues): string[] => [
  `const SINGLE_FLIGHT = ${k.singleFlight ? 'true' : 'false'};`,
  k.jitter
    ? `const TTL = () => ${TTL_S} + jitter(${JITTER_S}); // seconds, spread`
    : `const TTL = () => ${TTL_S};                // seconds`,
  ``,
  `async function getProduct(id) {`,
  `  const key = \`product:\${id}\`;`,
  `  const hit = await redis.get(key);`,
  `  if (hit) return JSON.parse(hit);`,
  ``,
  `  if (SINGLE_FLIGHT) {`,
  `    const won = await redis.set(\`lock:\${key}\`, reqId,`,
  `                                { NX: true, PX: ${LOCK_PX} });`,
  `    if (!won) return waitFor(key); // re-read once filled`,
  `  }`,
  ``,
  `  const row = await db.query(`,
  `    'SELECT * FROM products WHERE id = $1', [id]);`,
  `  await redis.set(key, JSON.stringify(row), { EX: TTL() });`,
  `  if (SINGLE_FLIGHT) await redis.del(\`lock:\${key}\`);`,
  `  return row;`,
  `}`,
];

const L = {
  get: { n: 6, anchor: 'redis.get(key)' },
  hit: { n: 7, anchor: 'if (hit)' },
  lock: { n: 10, anchor: 'redis.set(`lock:' },
  lost: { n: 12, anchor: 'if (!won)' },
  query: { n: 15, anchor: 'db.query(' },
  fill: { n: 17, anchor: 'EX: TTL()' },
  release: { n: 18, anchor: 'redis.del' },
  ret: { n: 19, anchor: 'return row' },
};

interface KeyState {
  key: string;
  /** ms timestamp at which it expires; null = not cached. */
  expiresAt: number | null;
  ttlMs: number;
}

function run(k: KnobValues): Frame[] {
  const sf = k.singleFlight === true;
  const jitter = k.jitter === true;
  const rand = rng(42);
  const ttl = () => (TTL_S + (jitter ? rand() * JITTER_S : 0)) * 1000;

  // ---- the model ----
  let t = 0;
  let view: 'one' | 'many' = 'one';
  const keys: KeyState[] = [{ key: 'product:42', expiresAt: 400, ttlMs: 60_000 }];
  let lock: Client | null = null;
  let inflight = 0;
  let queries = 0;
  let writes = 0;
  const client: Record<Client, { text: string; tone: NodeState['badgeTone'] }> = {
    r1: { text: '', tone: 'idle' },
    r2: { text: '', tone: 'idle' },
    r3: { text: '', tone: 'idle' },
    r4: { text: '', tone: 'idle' },
  };
  const setClients = (ids: readonly Client[], text: string, tone: NodeState['badgeTone']) =>
    ids.forEach((id) => (client[id] = { text, tone }));

  const ttlLeft = (s: KeyState) => (s.expiresAt === null ? 0 : Math.max(0, s.expiresAt - t));
  const keyRows = (s: KeyState): Row[] => {
    const left = ttlLeft(s);
    const live = s.expiresAt !== null && left > 0;
    return [
      {
        kind: 'kv',
        label: s.key,
        value: live ? `ttl ${left < 1000 ? (left / 1000).toFixed(1) : Math.round(left / 1000)} s` : 'expired',
        tone: live ? 'ok' : 'fail',
      },
      { kind: 'bar', value: live ? left : 0, max: s.ttlMs, tone: live ? 'ok' : 'fail' },
    ];
  };

  const nodes = (): Record<string, NodeState> => {
    const out: Record<string, NodeState> = {};
    for (const id of CLIENTS) {
      const c = client[id];
      out[id] = { badge: c.text || undefined, badgeTone: c.tone, tone: c.text && c.tone !== 'ok' ? 'active' : 'idle' };
    }
    out.app = { sub: view === 'one' ? 'getProduct(42)' : 'getProduct(42 | 43 | 44)' };
    const redisRows: Row[] = keys.flatMap(keyRows);
    if (view === 'one') {
      redisRows.push({
        kind: 'kv',
        label: 'lock:product:42',
        value: !sf ? 'unused' : lock ? `held by ${lock}` : 'free',
        tone: lock ? 'active' : 'dim',
      });
    }
    out.redis = { rows: redisRows };
    out.pg = {
      tone: inflight > 0 ? 'active' : 'idle',
      rows: [
        { kind: 'slots', label: 'queries in flight', total: 12, filled: inflight, tone: inflight > 4 ? 'warn' : 'active' },
        {
          kind: 'kv',
          label: 'total queries',
          value: String(queries),
          tone: queries > HOT_KEYS.length ? 'warn' : queries > 0 ? 'idle' : 'dim',
        },
      ],
    };
    return out;
  };

  const metrics = (): Metric[] => [
    { label: 'Postgres queries', value: String(queries), tone: view === 'one' ? (queries > 1 ? 'warn' : queries === 1 ? 'ok' : 'idle') : 'idle' },
    { label: 'In flight', value: String(inflight), tone: inflight > 4 ? 'warn' : 'idle' },
    { label: 'Cache writes', value: String(writes), tone: view === 'one' && writes > 1 ? 'warn' : 'idle' },
    { label: 'Clock', value: fmtClock(t).replace('t = ', '') },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics'>) =>
    frames.push({ ...f, t, nodes: nodes(), metrics: metrics() });

  const burst = (ids: readonly string[], edge: (id: string) => string, dir: 1 | -1, kind: Packet['kind'], label: string, start = 0): Packet[] =>
    ids.map((id, i) => ({ edge: edge(id), dir, kind, label, delay: start + i * 110 }));

  // ================= Part 1: one hot key =================
  push({
    say: 'Steady state. product:42 is in Redis with 0.4 s left on its TTL, and Postgres is idle.',
    why: [
      'Cache-aside: the app checks Redis first and falls through to the database only on a miss. The cache never talks to the database itself.',
      'It works because reads usually outnumber writes, the same popular items are asked for again and again, and memory is roughly a thousand times faster than a random SSD read.',
    ],
  });

  setClients(['r1'], 'GET', 'active');
  push({
    line: L.get,
    vars: { key: '"product:42"' },
    packets: [
      { edge: 'r1-app', dir: 1, kind: 'req', label: 'GET /products/42' },
      { edge: 'app-redis', dir: 1, kind: 'req', label: 'GET product:42', delay: 420 },
    ],
    say: 'r1 asks for product 42. The app checks Redis before anything else.',
  });

  t += RTT;
  setClients(['r1'], `200 · ${fmtMs(2 * RTT)}`, 'ok');
  push({
    line: L.hit,
    vars: { hit: `'{"id":42,…}'` },
    packets: [
      { edge: 'app-redis', dir: -1, kind: 'ok', label: 'HIT' },
      { edge: 'r1-app', dir: -1, kind: 'ok', label: '200', delay: 420 },
    ],
    say: `Hit. Two round trips inside the datacenter — client to app, app to Redis — about ${fmtMs(2 * RTT)} in all, and Postgres never sees the request.`,
  });

  t = 400;
  keys[0].expiresAt = null;
  setClients(CLIENTS, '', 'idle');
  push({
    say: 't = 0.400 s. The TTL reaches zero and Redis drops the key.',
    why: [
      'Expiry is passive. Nothing refreshes the key ahead of time: cache-aside repopulates it only when the next request misses.',
      'So whichever requests arrive first after expiry pay the database’s price — and on a popular key, that is never just one.',
    ],
  });

  t = 401;
  const arrived = t;
  setClients(CLIENTS, 'GET', 'active');
  push({
    line: L.get,
    vars: { key: '"product:42"' },
    packets: [
      ...burst(CLIENTS, (id) => `${id}-app`, 1, 'req', 'GET'),
      ...burst(CLIENTS, () => 'app-redis', 1, 'req', 'GET', 420),
    ],
    say: 'Four requests for the same product arrive within a millisecond — an ordinary moment for a popular item.',
  });

  t += RTT;
  push({
    line: L.hit,
    vars: { hit: 'null' },
    packets: burst(CLIENTS, () => 'app-redis', -1, 'nil', 'nil'),
    say: 'All four miss. Each request runs getProduct on its own; none of them knows the others exist.',
  });

  push({
    say: 'Checkpoint — predict before the scenario continues.',
    checkpoint: {
      kind: 'predict',
      prompt: 'Four requests missed at the same instant. How many queries will reach Postgres?',
      options: ['1', '2', '4'],
      answer: sf ? 0 : 2,
      reveal: sf
        ? 'One. With single-flight on, each caller first tries to take a lock on the key, and only the winner queries the database. The rest wait and re-read the cache.'
        : 'Four. Cache-aside has no coordination between callers, so every miss falls through to the database independently. Nothing is broken — this is exactly what the code says to do.',
    },
  });

  if (!sf) {
    inflight = 4;
    queries = 4;
    setClients(CLIENTS, 'waiting', 'warn');
    push({
      line: L.query,
      vars: { id: '42' },
      packets: burst(CLIENTS, () => 'app-pg', 1, 'req', 'SELECT'),
      say: 'Four identical queries are now in flight. Postgres will do the same work four times.',
    });

    t += QUERY;
    inflight = 0;
    push({
      line: L.query,
      vars: { row: '{ id: 42, … }' },
      packets: burst(CLIENTS, () => 'app-pg', -1, 'ok', 'row'),
      say: `Each returns the same row after about ${fmtMs(QUERY)} — a round trip plus an SSD read, assuming the row wasn’t in Postgres’ buffer cache. The database time spent is proportional to how many requests arrived while the key was missing.`,
    });

    t += RTT;
    writes = 4;
    keys[0] = { key: 'product:42', expiresAt: t + TTL_S * 1000, ttlMs: TTL_S * 1000 };
    push({
      line: L.fill,
      vars: { key: '"product:42"', 'TTL()': `${TTL_S}` },
      packets: burst(CLIENTS, () => 'app-redis', 1, 'req', 'SET'),
      say: 'All four write the same value back. Three of those writes are pure waste.',
    });

    t += RTT / 2;
    setClients(CLIENTS, `200 · ${fmtMs(t - arrived)}`, 'ok');
    push({
      line: L.ret,
      packets: burst(CLIENTS, (id) => `${id}-app`, -1, 'ok', '200'),
      say: `Everyone is served in about ${fmtMs(t - arrived)} — at the cost of four queries for one row’s worth of information.`,
    });

    push({
      say: 'Checkpoint — scale it up.',
      checkpoint: {
        kind: 'break',
        prompt:
          `Now make it real: a hot key at ${HOT_RPS.toLocaleString('en-US')} requests per second, and a rebuild query that takes ${REBUILD_MS} ms. Roughly how many queries hit Postgres before the cache is filled again?`,
        reveal:
          `About ${(HOT_RPS * REBUILD_MS) / 1000}. Every request arriving during the ${REBUILD_MS} ms rebuild misses and queries too: ${HOT_RPS.toLocaleString('en-US')} × ${REBUILD_MS / 1000} = ${(HOT_RPS * REBUILD_MS) / 1000}. That spike is a cache stampede, and it lands at exactly the moment the cache was supposed to be absorbing load — the slower the rebuild, the bigger it gets.`,
        knob: { id: 'singleFlight', value: true, label: 'Turn on single-flight' },
      },
    });
  } else {
    push({
      line: L.lock,
      vars: { key: '"product:42"' },
      packets: burst(CLIENTS, () => 'app-redis', 1, 'req', 'SET NX'),
      say: 'Before touching the database, each caller tries to take a lock on the key.',
    });

    t += RTT;
    lock = 'r1';
    setClients(['r1'], 'won lock', 'active');
    setClients(['r2', 'r3', 'r4'], 'waiting', 'warn');
    push({
      line: L.lost,
      vars: { won: 'r1 → OK · r2–r4 → nil' },
      packets: [
        { edge: 'app-redis', dir: -1, kind: 'ok', label: 'OK' },
        ...burst(['r2', 'r3', 'r4'], () => 'app-redis', -1, 'nil', 'nil', 110),
      ],
      say: 'SET with NX is atomic in Redis, so exactly one caller — r1 — gets OK. The other three get nil and wait.',
    });

    inflight = 1;
    queries = 1;
    push({
      line: L.query,
      vars: { id: '42' },
      packets: [{ edge: 'app-pg', dir: 1, kind: 'req', label: 'SELECT' }],
      say: 'Only r1 queries Postgres.',
    });

    t += QUERY;
    inflight = 0;
    push({
      line: L.query,
      vars: { row: '{ id: 42, … }' },
      packets: [{ edge: 'app-pg', dir: -1, kind: 'ok', label: 'row' }],
      say: `The row comes back once, after about ${fmtMs(QUERY)}.`,
    });

    t += RTT;
    writes = 1;
    const filled = ttl();
    keys[0] = { key: 'product:42', expiresAt: t + filled, ttlMs: filled };
    lock = null;
    push({
      line: L.fill,
      vars: { 'TTL()': `${(filled / 1000).toFixed(1)}` },
      packets: [{ edge: 'app-redis', dir: 1, kind: 'req', label: 'SET, then DEL lock' }],
      say: 'r1 fills the cache and releases the lock. One query, one write.',
    });

    t += RTT;
    push({
      line: L.lost,
      packets: [
        ...burst(['r2', 'r3', 'r4'], () => 'app-redis', 1, 'req', 'GET'),
        ...burst(['r2', 'r3', 'r4'], () => 'app-redis', -1, 'ok', 'HIT', 520),
      ],
      say: 'The waiters re-read the key, and all three hit.',
    });

    t += RTT / 2;
    setClients(CLIENTS, `200 · ${fmtMs(t - arrived)}`, 'ok');
    push({
      line: L.ret,
      packets: burst(CLIENTS, (id) => `${id}-app`, -1, 'ok', '200'),
      say: `Four requests served in about ${fmtMs(t - arrived)}, with one database query.`,
    });

    push({
      say: 'Checkpoint — why.',
      checkpoint: {
        kind: 'why',
        prompt: 'What happens if r1 crashes while it holds the lock?',
        reveal: `The lock was taken with PX ${LOCK_PX}, so it expires on its own after five seconds; waiters that time out retry, and one of them wins the next lock. That is acceptable here because this lock only prevents duplicate work — an occasional duplicate query after a crash is harmless. If correctness depended on exactly one holder, a Redis lock alone would not be safe: a holder can pause past its lease and act after another has taken over. That case needs fencing tokens.`,
        source: {
          title: 'Kleppmann — How to do distributed locking',
          url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html',
        },
      },
    });
  }

  // ================= Part 2: many keys, one moment =================
  view = 'many';
  t = 10_000;
  lock = null;
  inflight = 0;
  queries = 0;
  writes = 0;
  setClients(CLIENTS, '', 'idle');
  keys.length = 0;
  for (const key of HOT_KEYS) {
    const ms = ttl();
    keys.push({ key, expiresAt: t + ms, ttlMs: ms });
  }
  writes = HOT_KEYS.length;
  const written = t;
  push({
    line: L.fill,
    vars: { 'TTL()': keys.map((s) => (s.ttlMs / 1000).toFixed(1)).join(', ') },
    packets: burst(HOT_KEYS, () => 'app-redis', 1, 'req', 'SET'),
    say: 'Zoom out. A deploy restarts the fleet, and a warm-up job writes the three hottest products in the same second.',
    why: [
      'Keys written together share a birthday. With a fixed TTL they also share an expiry, so they miss together too.',
      'Deploys, cache flushes and warm-up jobs all write many keys at once, which is why this is a production pattern and not a corner case.',
    ],
  });

  push({
    say: 'Checkpoint — predict.',
    checkpoint: {
      kind: 'predict',
      prompt: `All three keys were written within the same second, each with EX ${jitter ? `${TTL_S} + jitter(${JITTER_S})` : TTL_S}. When do they expire?`,
      options: [`Together, ${TTL_S} s from now`, `Spread across ${TTL_S}–${TTL_S + JITTER_S} s from now`],
      answer: jitter ? 1 : 0,
      reveal: jitter
        ? `Spread out. jitter(${JITTER_S}) adds up to ${JITTER_S} s at random to each TTL, so the expiries land at different moments and each key’s stampede — or single-flight rebuild — happens on its own.`
        : `Together. Identical TTLs from an identical write time give an identical expiry, so all three hot keys will miss in the same instant and Postgres will take every rebuild at once.`,
    },
  });

  const order = [...keys].sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0));
  const first = order[0];
  t = first.expiresAt ?? t;
  const expiringNow = keys.filter((s) => s.expiresAt !== null && s.expiresAt - t < 50);
  expiringNow.forEach((s) => (s.expiresAt = null));
  setClients(CLIENTS, 'GET', 'active');
  const perKey = sf ? 1 : CLIENTS.length;
  queries = expiringNow.length * perKey;
  inflight = queries;
  push({
    line: L.query,
    vars: { expired: expiringNow.map((s) => s.key).join(', ') },
    packets: burst(Array.from({ length: Math.min(queries, 12) }, (_, i) => String(i)), () => 'app-pg', 1, 'req', 'SELECT'),
    say: `${fmtClock(t)}, ${((t - written) / 1000).toFixed(1)} s after the warm-up. ${
      expiringNow.length === 1
        ? `Only ${expiringNow[0].key} has expired, so this is one key’s rebuild`
        : `All ${expiringNow.length} keys expire in the same instant, so every rebuild lands at once`
    }: ${queries} ${queries === 1 ? 'query' : 'queries'} in flight${sf ? ' with single-flight on' : ''}.`,
    why: [
      'Single-flight bounds the damage per key: one rebuild instead of one per concurrent request.',
      'Jitter bounds how many keys rebuild at the same moment. Neither replaces the other, and production caches use both.',
    ],
  });

  inflight = 0;
  push({
    say: 'Checkpoint — why not just invalidate?',
    checkpoint: {
      kind: 'why',
      prompt: 'Why rely on TTLs at all? Why not delete the key whenever the row changes, and cache forever otherwise?',
      reveal:
        'Delete-on-write narrows staleness without closing it. A reader can miss, read the old row from the database, and write it back into the cache after the writer’s delete has already run — leaving a stale value that, with no TTL, never goes away. Deleting after commit removes the common case, and a TTL bounds the damage when the race does happen. So TTL stays, as the correctness backstop rather than the optimisation.',
      source: {
        title: 'Nishtala et al. — Scaling Memcache at Facebook',
        url: 'https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf',
      },
    },
  });

  return frames;
}

export const cacheStampede: Scenario = {
  id: 'cache-stampede',
  topic: 'caching',
  title: 'Cache stampede',
  summary: 'Four concurrent misses on an expired hot key — then single-flight, then TTL jitter.',
  stage: {
    width: 648,
    height: 334,
    regions: [{ label: 'CLIENTS', x: 16, y: 40 }],
    nodes: [
      { id: 'r1', label: 'r1', x: 16, y: 52, w: 116, h: 40 },
      { id: 'r2', label: 'r2', x: 16, y: 112, w: 116, h: 40 },
      { id: 'r3', label: 'r3', x: 16, y: 172, w: 116, h: 40 },
      { id: 'r4', label: 'r4', x: 16, y: 232, w: 116, h: 40 },
      { id: 'app', label: 'app', sub: 'getProduct(42)', x: 196, y: 126, w: 150, h: 92 },
      { id: 'redis', label: 'REDIS', x: 424, y: 16, w: 208, h: 144 },
      { id: 'pg', label: 'POSTGRES', x: 424, y: 186, w: 208, h: 132 },
    ],
    edges: [
      { id: 'r1-app', from: 'r1', to: 'app', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.24 } },
      { id: 'r2-app', from: 'r2', to: 'app', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.41 } },
      { id: 'r3-app', from: 'r3', to: 'app', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.59 } },
      { id: 'r4-app', from: 'r4', to: 'app', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.76 } },
      { id: 'app-redis', from: 'app', to: 'redis', fromPort: { side: 'r', at: 0.3 }, toPort: { side: 'l' } },
      { id: 'app-pg', from: 'app', to: 'pg', fromPort: { side: 'r', at: 0.7 }, toPort: { side: 'l' } },
    ],
  },
  knobs: [
    { id: 'singleFlight', kind: 'toggle', label: 'single-flight', default: false },
    { id: 'jitter', kind: 'toggle', label: 'TTL jitter', default: false },
  ],
  source,
  run,
};
