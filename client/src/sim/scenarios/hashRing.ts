import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Row, Scenario, Tone } from '../types';
import { hash32, lineOf, list } from '../kit';

/*
 * Hash ring vs modulo.
 *
 * Twelve keys on four cache servers; S1 leaves. Every placement is computed
 * from a real 32-bit hash of the key and server names, so the counts of keys
 * that move, and where they go, are whatever the hash says — not chosen.
 *
 *   modulo   owner = servers[hash % N]          N changes, nearly every key moves
 *   ring     one point per server on the ring   only S1's keys move, to one neighbour
 *   vnodes   eight points per server            only S1's keys move, spread out
 */

const SERVERS = ['S0', 'S1', 'S2', 'S3'];
const LEAVES = 'S1';
const VNODES = 8;
const KEYS = Array.from({ length: 12 }, (_, i) => `user:${25 + i}`);
const TURN = 2 ** 32;

type Scheme = 'modulo' | 'ring' | 'vnodes';

interface Point {
  at: number; // 0..1 of a turn
  server: string;
}

const points = (servers: string[], v: number): Point[] =>
  servers
    .flatMap((s) =>
      v === 1 ? [{ at: hash32(s) / TURN, server: s }] : Array.from({ length: v }, (_, i) => ({ at: hash32(`${s}#${i}`) / TURN, server: s })),
    )
    .sort((a, b) => a.at - b.at);

const clockwise = (at: number, ring: Point[]) => ring.find((p) => p.at >= at) ?? ring[0];

function owner(scheme: Scheme, key: string, servers: string[]): string {
  if (scheme === 'modulo') return servers[hash32(key) % servers.length];
  return clockwise(hash32(key) / TURN, points(servers, scheme === 'ring' ? 1 : VNODES)).server;
}

const source = (k: KnobValues): string[] => {
  const scheme = (k.scheme as Scheme) ?? 'modulo';
  if (scheme === 'modulo') {
    return [
      `const servers = ['S0', 'S1', 'S2', 'S3'];`,
      ``,
      `function owner(key) {`,
      `  return servers[hash32(key) % servers.length];`,
      `}`,
      ``,
      `// Removing a server changes servers.length,`,
      `// so almost every key's remainder changes too.`,
      `servers.splice(servers.indexOf('S1'), 1);`,
    ];
  }
  return [
    `const VNODES = ${scheme === 'ring' ? 1 : VNODES}; // points per server`,
    ``,
    `// Place every server on a ring of 2^32 positions.`,
    `function build(servers) {`,
    `  return servers`,
    `    .flatMap((s) => Array.from({ length: VNODES },`,
    `      (_, i) => ({ at: hash32(\`\${s}#\${i}\`), server: s })))`,
    `    .sort((a, b) => a.at - b.at);`,
    `}`,
    ``,
    `// A key belongs to the first point clockwise from it.`,
    `function owner(ring, key) {`,
    `  const h = hash32(key);`,
    `  // binary search in production; linear here for clarity`,
    `  const p = ring.find((p) => p.at >= h) ?? ring[0];`,
    `  return p.server;`,
    `}`,
    ``,
    `// Removing a server removes only its points.`,
    `ring = build(servers.filter((s) => s !== 'S1'));`,
  ];
};

function run(k: KnobValues): Frame[] {
  const scheme = (k.scheme as Scheme) ?? 'modulo';
  const src = source(k);
  const at = (a: string) => lineOf(src, a);
  const after = SERVERS.filter((s) => s !== LEAVES);

  const before = new Map(KEYS.map((key) => [key, owner(scheme, key, SERVERS)]));
  const now = new Map(KEYS.map((key) => [key, owner(scheme, key, after)]));
  const moved = KEYS.filter((key) => before.get(key) !== now.get(key));
  const receivers = [...new Set(moved.map((key) => now.get(key)!))].sort();
  const count = (m: Map<string, string>, s: string) => KEYS.filter((key) => m.get(key) === s).length;
  const leaverHad = count(before, LEAVES);
  const empty = after.filter((s) => count(now, s) === 0);
  const busiest = [...after].sort((a, b) => count(now, b) - count(now, a))[0];
  // How close each server's point is to the one before it (single-point rings only).
  const gapBefore = (server: string): number => {
    const r = points(after, 1);
    const i = r.findIndex((p) => p.server === server);
    const prev = r[(i - 1 + r.length) % r.length];
    return (((r[i].at - prev.at) % 1) + 1) % 1;
  };
  const sliver = scheme === 'ring' ? empty.filter((s) => gapBefore(s) < 0.02) : [];

  // ---- view state ----
  let t = 0;
  let removed = false;

  const keyTable = (): Row => {
    if (scheme === 'modulo') {
      return {
        kind: 'table',
        columns: ['key', '%4', 'owner', '%3', 'now'],
        rows: KEYS.map((key) => {
          const h = hash32(key);
          const changed = before.get(key) !== now.get(key);
          return [key, String(h % 4), before.get(key)!, removed ? String(h % 3) : '', removed ? `${now.get(key)}${changed ? ' ←' : ''}` : ''];
        }),
      };
    }
    return {
      kind: 'table',
      columns: ['key', 'angle', 'owner', 'now'],
      rows: KEYS.map((key) => {
        const changed = before.get(key) !== now.get(key);
        return [key, `${Math.floor((hash32(key) / TURN) * 360)}°`, before.get(key)!, removed ? `${now.get(key)}${changed ? ' ←' : ''}` : ''];
      }),
    };
  };

  const ringRow = (): Row[] => {
    if (scheme === 'modulo') {
      return [
        { kind: 'kv', label: 'owner', value: 'hash % N', tone: 'idle' },
        { kind: 'kv', label: 'N', value: removed ? '4 → 3' : '4', tone: removed ? 'warn' : 'idle' },
        { kind: 'text', lines: ['', 'No ring: a key\'s position means', 'nothing, only its remainder.'], tone: 'dim' },
      ];
    }
    const v = scheme === 'ring' ? 1 : VNODES;
    const ring = points(removed ? after : SERVERS, v);
    const leaverRing = points(SERVERS, v);
    // Arcs: the ranges the leaving server owned (from each predecessor to it).
    const arcs = leaverRing
      .map((p, i) => ({ p, prev: leaverRing[(i - 1 + leaverRing.length) % leaverRing.length] }))
      .filter(({ p }) => p.server === LEAVES)
      .map(({ p, prev }) => ({ from: prev.at, to: p.at, tone: (removed ? 'warn' : 'active') as Tone }));
    return [
      {
        kind: 'ring',
        size: 250,
        arcs,
        points: [
          ...ring.map((p) => ({
            at: p.at,
            mark: 'server' as const,
            label: v === 1 ? p.server : p.server.slice(1),
            tone: (p.server === LEAVES ? 'active' : 'idle') as Tone,
          })),
          ...KEYS.map((key) => ({
            at: hash32(key) / TURN,
            mark: 'key' as const,
            tone: (!removed ? 'idle' : before.get(key) !== now.get(key) ? 'warn' : 'ok') as Tone,
          })),
        ],
      },
    ];
  };

  const loadTable = (): Row => ({
    kind: 'table',
    columns: ['server', 'keys', 'after'],
    rows: SERVERS.map((s) => [s, String(count(before, s)), !removed ? '' : s === LEAVES ? 'gone' : String(count(now, s))]),
  });

  const nodes = (): Record<string, NodeState> => ({
    keys: { rows: [keyTable()] },
    ring: { tone: removed ? 'warn' : 'idle', rows: ringRow(), sub: scheme === 'vnodes' ? `${VNODES} points per server` : scheme === 'ring' ? '1 point per server' : 'hash(key) % N' },
    load: { rows: [loadTable()] },
  });

  const metrics = (): Metric[] => [
    { label: 'Keys moved', value: removed ? `${moved.length} of ${KEYS.length}` : '—', tone: removed ? (moved.length > KEYS.length / 2 ? 'warn' : 'ok') : 'idle' },
    { label: 'Moved to', value: removed ? list(receivers) || '—' : '—' },
    { label: 'Busiest server', value: removed ? `${busiest}: ${count(now, busiest)}` : '—', tone: removed && count(now, busiest) > KEYS.length / 2 ? 'warn' : 'idle' },
    { label: 'Expected moved', value: scheme === 'modulo' ? '≈ 75%' : '≈ 25%' },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics'>) => frames.push({ ...f, t, nodes: nodes(), metrics: metrics() });

  // ---- 0. setting ----
  push({
    line: at('function owner('),
    say:
      scheme === 'modulo'
        ? `Four cache servers and twelve keys, placed by hash(key) % 4. The table shows each key's remainder and the server it maps to.`
        : `Four cache servers and twelve keys on a hash ring, ${scheme === 'ring' ? 'one point per server' : `${VNODES} points per server`}. Each key belongs to the next server point clockwise.`,
    why:
      scheme === 'modulo'
        ? ['Modulo placement is simple and perfectly even — until N changes. The remainder depends on N, so changing N changes the answer for almost every key.']
        : [
            'On a ring, a key\'s owner depends only on where the nearest server point sits, not on how many servers there are. Take a point away and only the keys that pointed at it need a new home.',
            scheme === 'ring'
              ? 'With one point per server, the arcs between points are as uneven as the hash makes them.'
              : 'Many points per server average the arc lengths out, and scatter each server\'s ranges around the ring.',
          ],
  });

  // ---- 1. predict ----
  const frac = moved.length / KEYS.length;
  push({
    say: 'Checkpoint — predict before S1 leaves.',
    checkpoint: {
      kind: 'predict',
      prompt: `S1 is removed — it crashed, or the cluster is scaling down. How many of the ${KEYS.length} keys will now map to a different server?`,
      options: [`Around a quarter — only S1's keys`, 'Around half', 'Nearly all of them'],
      answer: frac <= 0.42 ? 0 : frac <= 0.66 ? 1 : 2,
      reveal:
        scheme === 'modulo'
          ? `${moved.length} of ${KEYS.length}. S1 held only ${leaverHad}, but every key's owner is its hash modulo N, and N just went from 4 to 3 — so remainders change for keys that never touched S1. In general about (N−1)/N of keys move: 75% here, 90% with ten servers.`
          : `${moved.length} of ${KEYS.length} — exactly the keys S1 owned. Every other key still finds the same point clockwise, because nothing else on the ring moved.${
              scheme === 'ring' && leaverHad > KEYS.length / 4
                ? ` S1 happened to own ${Math.round((leaverHad / KEYS.length) * 100)}%, not 25%: with one point per server the arcs are uneven. Twelve keys is a small sample; the expectation is 1/N.`
                : ' Twelve keys is a small sample; the expectation is 1/N of the keys.'
            }`,
      source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
    },
  });

  // ---- 2. S1 leaves ----
  t = 1000;
  removed = true;
  push({
    line: scheme === 'modulo' ? at('servers.splice(') : at('ring = build('),
    vars: { moved: `${moved.length} of ${KEYS.length}` },
    say:
      scheme === 'modulo'
        ? `S1 leaves and N becomes 3. ${moved.length} of ${KEYS.length} keys now map somewhere else — ${moved.length - leaverHad} of them were never on S1.`
        : `S1's point${scheme === 'vnodes' ? 's are' : ' is'} removed. Only its ${leaverHad} keys move, to ${list(receivers)} — ${
            scheme === 'ring' ? 'the next server clockwise' : 'whichever server comes next after each of S1\'s points'
          }. Every other key stays put.`,
  });

  // ---- 3. what it costs ----
  t = 1100;
  push({
    say:
      scheme === 'modulo'
        ? `Each moved key is now a miss on a cold server, so ${moved.length} of ${KEYS.length} lookups fall through to the database at once — for losing one server out of four.`
        : scheme === 'ring'
          ? `Load after: ${after.map((s) => `${s} ${count(now, s)}`).join(', ')}. ${busiest} took all of S1's keys${
              sliver.length
                ? `, and ${list(sliver)} holds none: its point sits ${(gapBefore(sliver[0]) * 360).toFixed(1)}° after the previous server's, so its arc is a sliver`
                : empty.length
                  ? `, and ${list(empty)} holds none of these keys`
                  : ''
            }.`
          : `Load after: ${after.map((s) => `${s} ${count(now, s)}`).join(', ')}. S1's ranges were scattered around the ring, so its keys landed on ${receivers.length} ${receivers.length === 1 ? 'server' : 'different servers instead of one'}.`,
    why:
      scheme === 'modulo'
        ? ['A cache that loses most of its keys at once behaves like an empty cache: the database takes the full read load exactly when capacity just dropped.']
        : scheme === 'ring'
          ? [
              'The ring fixed the mass remapping, but with one point per server two problems remain: arcs are uneven, so load is too, and a departing server dumps its entire range on a single successor.',
            ]
          : [
              'Virtual nodes make the ring behave like the average of many rings: a departing server\'s keys spread across the survivors instead of doubling one neighbour\'s load.',
              `Load is not even yet — arc sizes vary by roughly 1/√(points per server), about 35% with ${VNODES}. Production rings use one or two hundred points per server, which brings that to around ten percent.`,
            ],
  });

  // ---- 4. checkpoint ----
  const closing: Checkpoint =
    scheme === 'modulo'
      ? {
          kind: 'break',
          prompt: 'Losing one server of four remapped most of the cache. What placement changes only the keys that belonged to the server that left?',
          reveal: 'Consistent hashing. Put servers and keys on the same circle of hash values and give each key to the next server clockwise. Removing a server removes only its point, so only the keys between it and its predecessor move — about 1/N of them, instead of (N−1)/N.',
          source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
          knob: { id: 'scheme', value: 'ring', label: 'Use a hash ring' },
        }
      : scheme === 'ring'
        ? {
            kind: 'break',
            prompt: `${busiest} absorbed all of S1's keys${empty.length ? ` and ${list(empty)} owns nothing` : ''}. How do you even out a ring without giving up its property?`,
            reveal: `Give each server many points — virtual nodes — by hashing "S0#0", "S0#1" and so on. Arc lengths average out as the count grows, so load evens, and a leaving server's ranges are scattered around the ring, so its keys spread across many survivors. Dynamo also used them to give bigger machines more points.`,
            source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
            knob: { id: 'scheme', value: 'vnodes', label: `Use ${VNODES} virtual nodes each` },
          }
        : {
            kind: 'why',
            prompt: 'Suppose you raise the virtual nodes until load is close to even. What problem does consistent hashing still not solve?',
            reveal: 'A hot key. One wildly popular key hashes to exactly one point and lands on one server, however many virtual nodes there are — the ring spreads keys, not requests for a single key. That needs a different tool: replicate the hot key to several servers, split it with a suffix, or cache it in front of the store.',
            source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
          };
  push({ say: scheme === 'vnodes' ? 'Checkpoint — why.' : 'Checkpoint — fix it.', checkpoint: closing });

  return frames;
}

export const hashRing: Scenario = {
  id: 'hash-ring',
  topic: 'consistent-hashing',
  title: 'Hash ring vs modulo',
  summary: 'Twelve keys, four servers, one leaves — placed by hash % N, by a ring, and by a ring with virtual nodes.',
  stage: {
    width: 648,
    height: 462,
    nodes: [
      { id: 'keys', label: 'KEYS', x: 16, y: 16, w: 244, h: 290 },
      { id: 'ring', label: 'PLACEMENT', x: 276, y: 16, w: 356, h: 300 },
      { id: 'load', label: 'LOAD', x: 276, y: 328, w: 356, h: 126 },
    ],
    edges: [],
  },
  knobs: [
    {
      id: 'scheme',
      kind: 'choice',
      label: 'placement',
      default: 'modulo',
      options: [
        { value: 'modulo', label: 'hash % N' },
        { value: 'ring', label: 'hash ring' },
        { value: 'vnodes', label: `ring + ${VNODES} vnodes` },
      ],
    },
  ],
  source,
  run,
};
