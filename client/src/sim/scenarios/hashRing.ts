import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Row, Scenario, Token, Tone } from '../types';
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
 *
 * The keys are drawn as chips inside the server that holds them. When S1
 * leaves, the chips that change server glide to their new one, so what moved
 * is something you see rather than read off a table.
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
const deg = (at: number) => `${Math.floor(at * 360)}°`;
const short = (key: string) => key.slice(5); // "user:28" → "28"

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
  const v = scheme === 'vnodes' ? VNODES : 1;

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

  // The key the narration follows: for modulo, one that was never on S1 and
  // still moves (the surprise); for a ring, one of S1's (the one that must move).
  const example =
    scheme === 'modulo'
      ? (moved.find((key) => before.get(key) !== LEAVES) ?? KEYS[0])
      : (KEYS.find((key) => before.get(key) === LEAVES) ?? KEYS[0]);
  const exAt = hash32(example) / TURN;

  // ---- view state ----
  let t = 0;
  let placed = false; // keys shown
  let removed = false; // S1 gone
  let focus = false; // highlight the example key

  const keyTone = (key: string): Tone => {
    if (focus && key === example) return 'active';
    if (!removed) return 'idle';
    return before.get(key) !== now.get(key) ? 'warn' : 'dim';
  };

  const tokens = (): Token[] =>
    placed ? KEYS.map((key) => ({ id: key, label: key, node: (removed ? now : before).get(key)!, tone: keyTone(key) })) : [];

  const placementRows = (): Row[] => {
    if (scheme === 'modulo') {
      const servers = removed ? after : SERVERS;
      const h = hash32(example);
      const lines = [
        `index   ${servers.map((_, i) => String(i).padEnd(4)).join('')}`.trimEnd(),
        `server  ${servers.map((s) => s.padEnd(4)).join('')}`.trimEnd(),
        '',
      ];
      if (placed) {
        lines.push(`${example}`);
        lines.push(`  hash % 4 = ${h % 4}  →  ${before.get(example)}`);
        if (removed) lines.push(`  hash % 3 = ${h % 3}  →  ${now.get(example)}`);
      }
      return [
        { kind: 'kv', label: 'owner', value: 'servers[hash % N]', tone: 'idle' },
        { kind: 'kv', label: 'N', value: removed ? '3' : '4', tone: removed ? 'warn' : 'idle' },
        { kind: 'text', lines: ['', ...lines], tone: 'idle' },
      ];
    }
    const ring = points(removed ? after : SERVERS, v);
    const leaverRing = points(SERVERS, v);
    // Arcs: the ranges the leaving server owned (from each predecessor to it).
    const arcs = leaverRing
      .map((p, i) => ({ p, prev: leaverRing[(i - 1 + leaverRing.length) % leaverRing.length] }))
      .filter(({ p }) => p.server === LEAVES)
      .map(({ p, prev }) => ({ from: prev.at, to: p.at, tone: (removed ? 'warn' : 'active') as Tone }));
    // Where S1's point was, faintly — only for a single point; with many they are just clutter.
    const gone = removed && v === 1 ? leaverRing.filter((p) => p.server === LEAVES) : [];
    return [
      {
        kind: 'ring',
        size: 296,
        arcs,
        points: [
          ...ring.map((p) => ({
            at: p.at,
            mark: 'server' as const,
            // With many points per server, labels would bury the ring: S1's points are told apart by colour.
            label: v === 1 ? p.server : undefined,
            tone: (p.server === LEAVES ? 'active' : 'idle') as Tone,
          })),
          ...gone.map((p) => ({ at: p.at, mark: 'server' as const, tone: 'dim' as Tone })),
          ...(placed
            ? KEYS.map((key) => ({ at: hash32(key) / TURN, mark: 'key' as const, label: short(key), tone: keyTone(key) }))
            : []),
        ],
      },
      {
        kind: 'text',
        tone: 'dim',
        lines: [
          '',
          '□ server point   ● key',
          ...(v > 1 && !removed ? [`□ in blue: S1's ${VNODES} points`] : []),
          removed ? `▬ the range S1 owned` : `▬ the range S1 owns`,
          'A key belongs to the first server',
          'point clockwise from it.',
        ],
      },
    ];
  };

  const bucket = (s: string): NodeState => {
    const m = removed ? now : before;
    const n = placed && !(removed && s === LEAVES) ? count(m, s) : 0;
    const gained = removed && s !== LEAVES ? KEYS.filter((key) => now.get(key) === s && before.get(key) !== s).length : 0;
    return {
      tone: removed && s === LEAVES ? 'dim' : 'idle',
      badge: removed && s === LEAVES ? 'gone' : placed ? `${n} ${n === 1 ? 'key' : 'keys'}${gained ? ` · +${gained}` : ''}` : undefined,
      badgeTone: removed && s === LEAVES ? 'fail' : gained ? 'warn' : 'idle',
    };
  };

  const nodes = (): Record<string, NodeState> => ({
    ring: { rows: placementRows(), tone: removed ? 'warn' : 'idle' },
    ...Object.fromEntries(SERVERS.map((s) => [s, bucket(s)])),
  });

  const metrics = (): Metric[] => [
    { label: 'Keys moved', value: removed ? `${moved.length} of ${KEYS.length}` : '—', tone: removed ? (moved.length > KEYS.length / 2 ? 'warn' : 'ok') : 'idle' },
    { label: 'Moved to', value: removed ? list(receivers) || '—' : '—' },
    { label: 'Busiest server', value: removed ? `${busiest}: ${count(now, busiest)}` : '—', tone: removed && count(now, busiest) > KEYS.length / 2 ? 'warn' : 'idle' },
    { label: 'Expected moved', value: scheme === 'modulo' ? '≈ 75%' : '≈ 25%' },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics' | 'tokens'>) =>
    frames.push({ ...f, t, nodes: nodes(), metrics: metrics(), tokens: tokens() });

  // ---- 0. the servers ----
  push({
    line: scheme === 'modulo' ? at('const servers') : at('function build('),
    say:
      scheme === 'modulo'
        ? 'Four cache servers in a list. A key\'s server is the one at position hash(key) % 4.'
        : scheme === 'ring'
          ? 'Four cache servers, each hashed to one point on a ring of 2³² positions.'
          : `Four cache servers, each hashed to ${VNODES} points on the ring — ${VNODES * SERVERS.length} in all. S1's are the blue ones.`,
    why:
      scheme === 'modulo'
        ? ['Modulo placement is simple and spreads keys evenly — until N changes. The remainder depends on N, so changing N changes the answer for almost every key.']
        : [
            'On a ring, a key\'s owner depends only on where the nearest server point sits, not on how many servers there are.',
            scheme === 'ring'
              ? 'With one point per server, the arcs between points are as uneven as the hash makes them.'
              : 'Many points per server average the arc lengths out, and scatter each server\'s ranges around the ring.',
          ],
  });

  // ---- 1. the keys ----
  placed = true;
  focus = true;
  const exOwner = before.get(example)!;
  push({
    line: at('function owner('),
    vars: { key: example, owner: exOwner },
    say:
      scheme === 'modulo'
        ? `Twelve keys go to their servers. ${example}: hash % 4 = ${hash32(example) % 4}, so it lives on ${exOwner}.`
        : `Twelve keys are hashed onto the same ring. Each belongs to the first server point clockwise: ${example} sits at ${deg(exAt)}, and the next point round is ${exOwner}'s.`,
  });

  // ---- 2. predict ----
  focus = false;
  const frac = moved.length / KEYS.length;
  push({
    say: 'Checkpoint — predict before S1 leaves.',
    checkpoint: {
      kind: 'predict',
      prompt: `S1 is removed — it crashed, or the cluster is scaling down. It holds ${leaverHad} of the ${KEYS.length} keys. How many keys will end up on a different server?`,
      options: [`Only S1's ${leaverHad}`, 'About half', 'Nearly all of them'],
      answer: frac <= 0.42 ? 0 : frac <= 0.66 ? 1 : 2,
      reveal:
        scheme === 'modulo'
          ? `${moved.length} of ${KEYS.length}. S1 held only ${leaverHad}, but every key's server is its hash modulo N, and N just went from 4 to 3 — so remainders change for keys that never touched S1. In general about (N−1)/N of keys move: 75% here, 90% with ten servers.`
          : `Only S1's ${leaverHad} — exactly the keys between S1's point${v > 1 ? 's' : ''} and the point${v > 1 ? 's' : ''} before. Every other key still finds the same server clockwise, because nothing else on the ring moved.${
              scheme === 'ring' && leaverHad > KEYS.length / 4
                ? ` S1 happened to hold ${Math.round((leaverHad / KEYS.length) * 100)}%, not 25%: with one point per server the arcs are uneven.`
                : ''
            }`,
      source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
    },
  });

  // ---- 3. S1 leaves ----
  t = 1000;
  removed = true;
  focus = true;
  push({
    line: scheme === 'modulo' ? at('servers.splice(') : at('ring = build('),
    vars: { moved: `${moved.length} of ${KEYS.length}` },
    say:
      scheme === 'modulo'
        ? `S1 leaves and N becomes 3. ${moved.length} of ${KEYS.length} keys change server — ${moved.length - leaverHad} of them were never on S1. ${example} now computes hash % 3 = ${hash32(example) % 3} and moves to ${now.get(example)}.`
        : `S1's point${v > 1 ? 's are' : ' is'} removed. Its ${leaverHad} keys move to ${list(receivers)} — ${
            scheme === 'ring' ? 'the next server clockwise' : 'whichever server comes next after each of S1\'s points'
          }. Every other key stays exactly where it was.`,
  });

  // ---- 4. what it costs ----
  focus = false;
  t = 1100;
  push({
    say:
      scheme === 'modulo'
        ? `Each moved key is now looked up on a server that doesn't have it, so ${moved.length} of ${KEYS.length} lookups miss and fall through to the database at once — for losing one server out of four.`
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

  // ---- 5. checkpoint ----
  const closing: Checkpoint =
    scheme === 'modulo'
      ? {
          kind: 'break',
          prompt: 'Losing one server of four remapped nearly the whole cache. What placement moves only the keys that belonged to the server that left?',
          reveal: 'Consistent hashing. Put servers and keys on the same circle of hash values and give each key to the next server clockwise. Removing a server removes only its point, so only the keys between it and its predecessor move — about 1/N of them, instead of (N−1)/N.',
          source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
          knob: { id: 'scheme', value: 'ring', label: 'Use a hash ring' },
        }
      : scheme === 'ring'
        ? {
            kind: 'break',
            prompt: `${busiest} absorbed all of S1's keys${empty.length ? ` and ${list(empty)} holds nothing` : ''}. How do you even out a ring without giving up its property?`,
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

const BUCKET_H = 92;
const GAP = 10;

export const hashRing: Scenario = {
  id: 'hash-ring',
  topic: 'consistent-hashing',
  title: 'Hash ring vs modulo',
  summary: 'Twelve keys, four servers, one leaves — watch which keys move under hash % N, a ring, and a ring with virtual nodes.',
  stage: {
    width: 648,
    height: 16 * 2 + 4 * BUCKET_H + 3 * GAP,
    nodes: [
      { id: 'ring', label: 'PLACEMENT', x: 16, y: 16, w: 300, h: 4 * BUCKET_H + 3 * GAP },
      ...SERVERS.map((s, i) => ({ id: s, label: s, x: 332, y: 16 + i * (BUCKET_H + GAP), w: 300, h: BUCKET_H })),
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
