import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Scenario } from '../types';
import { fmtMs } from '../facts';
import { lineOf } from '../kit';

/*
 * Replication lag: read-your-writes versus monotonic reads.
 *
 * A primary with two asynchronous replicas that lag by different amounts. A
 * user saves their name, then reloads twice. What each reload shows is
 * computed from each replica's applied log position (LSN) at the moment it is
 * read, under three routing policies:
 *
 *   round-robin   reads alternate replicas         new, then old — time goes backwards
 *   sticky        a user always reads one replica  never backwards, but can miss own write
 *   lsn           replicas behind your last write  your write is always visible
 *                 are skipped in favour of the primary
 */

// fact-exempt: replica lags are scenario parameters (replica 2 is under load)
const LAG = { r1: 100, r2: 1500 } as const;
// fact-exempt: when the user reloads, twice
const READS = [300, 600];
const OLD = 'Ada';
const NEW = 'Ada Lovelace';
const BASE_LSN = 100;

type Mode = 'round-robin' | 'sticky' | 'lsn';
type Rep = 'r1' | 'r2';

const PICK: Record<Mode, string[]> = {
  'round-robin': [`  const replica = replicas[next++ % replicas.length];   // round robin`],
  sticky: [`  const replica = replicas[hash(userId) % replicas.length];   // same one every time`],
  lsn: [
    `  const replica = replicas[next++ % replicas.length];`,
    `  const replayed = await replica.query('SELECT pg_last_wal_replay_lsn()');`,
    `  if (replayed < session.lastWriteLsn)   // behind my own write:`,
    `    return primary.query('SELECT name FROM users WHERE id = $1', [userId]);`,
  ],
};

const source = (k: KnobValues): string[] => {
  const mode = (k.mode as Mode) ?? 'round-robin';
  return [
    `async function save(session, userId, name) {`,
    `  await primary.query('UPDATE users SET name = $1 WHERE id = $2', [name, userId]);`,
    mode === 'lsn'
      ? `  session.lastWriteLsn = await primary.query('SELECT pg_current_wal_lsn()');`
      : `  // committed on the primary; each replica replays it when it gets there`,
    `  return 'Saved';`,
    `}`,
    ``,
    `async function load(session, userId) {`,
    ...PICK[mode],
    `  return replica.query('SELECT name FROM users WHERE id = $1', [userId]);`,
    `}`,
  ];
};

function run(k: KnobValues): Frame[] {
  const mode = (k.mode as Mode) ?? 'round-robin';
  const src = source(k);
  const at = (a: string) => lineOf(src, a);

  // ---- the model ----
  let t = 0;
  const writeAt = 0;
  const writeLsn = BASE_LSN + 1;
  let primaryLsn = BASE_LSN;
  const applied: Record<Rep, number> = { r1: BASE_LSN, r2: BASE_LSN };
  const value = (lsn: number) => (lsn >= writeLsn ? NEW : OLD);
  const seen: string[] = [];
  const hot = new Set<string>();

  /** A replica's applied position at time `when` (async: it applies the write LAG ms later). */
  const appliedAt = (r: Rep, when: number) => (primaryLsn >= writeLsn && when >= writeAt + LAG[r] ? writeLsn : BASE_LSN);
  const route = (i: number): { from: Rep | 'primary'; asked: Rep } => {
    const asked: Rep = mode === 'sticky' ? 'r2' : i % 2 === 0 ? 'r1' : 'r2';
    if (mode === 'lsn' && appliedAt(asked, READS[i]) < writeLsn) return { from: 'primary', asked };
    return { from: asked, asked };
  };

  const replica = (r: Rep): NodeState => ({
    tone: hot.has(r) ? 'active' : 'idle',
    sub: `lag ${fmtMs(LAG[r])}`,
    rows: [
      { kind: 'kv', label: 'name', value: value(applied[r]), tone: applied[r] >= writeLsn ? 'ok' : 'warn' },
      { kind: 'kv', label: 'applied LSN', value: String(applied[r]), tone: applied[r] >= primaryLsn ? 'idle' : 'warn' },
    ],
  });

  const nodes = (): Record<string, NodeState> => ({
    user: { badge: seen.length ? seen[seen.length - 1] === NEW ? 'new' : 'old' : undefined, badgeTone: seen[seen.length - 1] === NEW ? 'ok' : 'warn' },
    app: { tone: hot.has('app') ? 'active' : 'idle', sub: mode },
    primary: {
      tone: hot.has('primary') ? 'active' : 'idle',
      rows: [
        { kind: 'kv', label: 'name', value: value(primaryLsn), tone: primaryLsn >= writeLsn ? 'ok' : 'idle' },
        { kind: 'kv', label: 'LSN', value: String(primaryLsn), tone: 'idle' },
      ],
    },
    r1: replica('r1'),
    r2: replica('r2'),
    view: {
      rows: [
        { kind: 'kv', label: 'save', value: primaryLsn >= writeLsn ? 'Saved' : '—', tone: primaryLsn >= writeLsn ? 'ok' : 'dim' },
        ...READS.map((_, i) => ({
          kind: 'kv' as const,
          label: `reload ${i + 1}`,
          value: seen[i] ? (seen[i] === NEW ? 'new' : 'OLD') : '—',
          tone: (seen[i] ? (seen[i] === NEW ? 'ok' : 'warn') : 'dim') as 'ok' | 'warn' | 'dim',
        })),
      ],
    },
  });

  const metrics = (): Metric[] => [
    { label: 'Primary LSN', value: String(primaryLsn) },
    { label: 'Replica 1', value: `LSN ${applied.r1}`, tone: applied.r1 < primaryLsn ? 'warn' : 'idle' },
    { label: 'Replica 2', value: `LSN ${applied.r2}`, tone: applied.r2 < primaryLsn ? 'warn' : 'idle' },
    { label: 'Clock', value: `${(t / 1000).toFixed(3)} s` },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics'>) => {
    frames.push({ ...f, t, nodes: nodes(), metrics: metrics() });
    hot.clear();
  };
  const sync = () => {
    applied.r1 = appliedAt('r1', t);
    applied.r2 = appliedAt('r2', t);
  };

  // ---- 0. setting ----
  push({
    say: `A primary and two asynchronous read replicas. Replica 1 trails the primary by about ${fmtMs(LAG.r1)}; replica 2, under heavier load, by ${fmtMs(LAG.r2)}. The user's name is "${OLD}".`,
    why: [
      'Asynchronous replication means the primary confirms a write before the replicas have it. Each replica replays the primary\'s log at its own pace, so each one is at a different position (LSN) in history.',
      'Reads go to replicas to spread load — which is exactly how lag becomes something users can see.',
      'LSNs are drawn here as small counters. Postgres prints them as byte offsets into the write-ahead log, like 0/3000060, but they compare the same way: bigger means later.',
    ],
  });

  // ---- 1. the write ----
  t = writeAt;
  primaryLsn = writeLsn;
  hot.add('app').add('primary');
  push({
    line: at('UPDATE users'),
    vars: mode === 'lsn' ? { lastWriteLsn: String(writeLsn) } : undefined,
    packets: [
      { edge: 'user-app', dir: 1, kind: 'req', label: `save "${NEW}"` },
      { edge: 'app-primary', dir: 1, kind: 'req', delay: 420 },
      { edge: 'app-primary', dir: -1, kind: 'ok', label: `LSN ${writeLsn}`, delay: 900 },
      { edge: 'user-app', dir: -1, kind: 'ok', label: 'Saved', delay: 1320 },
    ],
    say: `The user saves "${NEW}". The primary commits it as LSN ${writeLsn} and the page says Saved — before either replica has it.`,
  });

  // ---- 2. predict ----
  const plan = READS.map((_, i) => route(i));
  const outcome = plan.map((p, i) => value(p.from === 'primary' ? writeLsn : appliedAt(p.from, READS[i])));
  const pattern = outcome.map((v) => (v === NEW ? 'new' : 'old')).join(', then ');
  push({
    say: 'Checkpoint — predict both reloads.',
    checkpoint: {
      kind: 'predict',
      prompt: `The user reloads at ${fmtMs(READS[0])} and again at ${fmtMs(READS[1])}. The app routes reads ${
        mode === 'round-robin' ? 'round robin across the replicas' : mode === 'sticky' ? 'to the same replica every time for a given user' : 'to a replica only if it has applied the user\'s last write'
      }. What does the user see?`,
      options: ['New, then new', 'New, then old', 'Old, then old'],
      answer: pattern === 'new, then new' ? 0 : pattern === 'new, then old' ? 1 : 2,
      reveal: {
        'round-robin': `New, then old. Reload 1 goes to replica 1, which applied the write ${fmtMs(LAG.r1)} after the save; reload 2 goes to replica 2, still ${fmtMs(LAG.r2)} behind. The user sees their change, then sees it vanish — time runs backwards between two page loads.`,
        sticky: `Old, then old. This user is pinned to replica 2, the laggier one, so both reloads come from the same point in history. It never goes backwards — but for ${fmtMs(LAG.r2)} after saving, the user can't see their own change.`,
        lsn: `New, then new. The session remembers the save landed at LSN ${writeLsn}. Replica 1 has applied it by reload 1; replica 2 hasn't by reload 2, so that read goes to the primary instead.`,
      }[mode],
      source: { title: 'Kleppmann — Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
    },
  });

  // ---- 3. replication progresses ----
  t = writeAt + LAG.r1;
  sync();
  hot.add('r1');
  push({
    packets: [{ edge: 'primary-r1', dir: 1, kind: 'ok', label: `LSN ${writeLsn}` }],
    say: `t = ${fmtMs(t)}. Replica 1 has applied LSN ${writeLsn}; replica 2 is still at ${applied.r2}.`,
  });

  // ---- 4–5. the reloads ----
  READS.forEach((when, i) => {
    t = when;
    sync();
    const p = plan[i];
    const got = outcome[i];
    seen.push(got);
    hot.add('app').add(p.from);
    const detour = p.from === 'primary';
    push({
      line: detour ? at('if (replayed <') : mode === 'lsn' ? at('const replayed') : at('const replica ='),
      vars: detour
        ? { replica: p.asked === 'r1' ? 'replica 1' : 'replica 2', replayed: String(applied[p.asked]), lastWriteLsn: String(writeLsn) }
        : mode === 'lsn'
          ? { replica: p.from === 'r1' ? 'replica 1' : 'replica 2', replayed: String(applied[p.from as Rep]), lastWriteLsn: String(writeLsn) }
          : { replica: p.from === 'r1' ? 'replica 1' : 'replica 2' },
      packets: [
        { edge: 'user-app', dir: 1, kind: 'req', label: 'reload' },
        { edge: `app-${p.from}`, dir: 1, kind: 'req', delay: 420 },
        { edge: `app-${p.from}`, dir: -1, kind: got === NEW ? 'ok' : 'nil', delay: 860 },
        { edge: 'user-app', dir: -1, kind: got === NEW ? 'ok' : 'nil', label: got, delay: 1280 },
      ],
      say: detour
        ? `Reload ${i + 1} at ${fmtMs(when)}: the next replica is ${p.asked === 'r1' ? 'replica 1' : 'replica 2'}, at LSN ${applied[p.asked]} — behind the user's write at ${writeLsn} — so the app reads from the primary. "${got}".`
        : `Reload ${i + 1} at ${fmtMs(when)} goes to ${p.from === 'r1' ? 'replica 1' : 'replica 2'}${
            mode === 'sticky' && i === 0 ? ' — the replica this user hashes to —' : ','
          } at LSN ${applied[p.from as Rep]}${mode === 'lsn' ? ', which has caught up with the user\'s write' : ''}: "${got}".${
            i === 1 && seen[0] === NEW && got === OLD ? ' The name the user just saw is gone.' : ''
          }`,
    });
  });

  // ---- 6. eventually ----
  t = writeAt + LAG.r2;
  sync();
  hot.add('r2');
  push({
    packets: [{ edge: 'primary-r2', dir: 1, kind: 'ok', label: `LSN ${writeLsn}` }],
    say: `t = ${fmtMs(t)}. Replica 2 finally applies LSN ${writeLsn}. Every replica agrees again — "eventually" arrived, ${fmtMs(LAG.r2)} after the save.`,
  });

  // ---- 7. checkpoint ----
  const closing: Checkpoint =
    mode === 'round-robin'
      ? {
          kind: 'break',
          prompt: 'The saved name appeared, then vanished on the next reload. Which guarantee broke, and what is the cheapest fix?',
          reveal: 'Monotonic reads: once a user has seen a value, later reads shouldn\'t return an older one. It broke because two reads went to replicas at different points in history. The cheapest fix is to pin each user to one replica — by hashing the user id, say — so their reads only ever move forward.',
          source: { title: 'Kleppmann — Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
          knob: { id: 'mode', value: 'sticky', label: 'Pin each user to a replica' },
        }
      : mode === 'sticky'
        ? {
            kind: 'break',
            prompt: `Nothing went backwards — but the user couldn't see their own save for ${fmtMs(LAG.r2)}. Which guarantee is still missing?`,
            reveal: `Read-your-writes: after a user writes, their own reads should reflect it. Monotonic reads don't give you that — they only stop time running backwards. The fix is to remember where the write landed (its LSN) and never read from a replica that hasn't reached it: pick another replica, wait briefly, or read from the primary.`,
            source: { title: 'Kleppmann — Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
            knob: { id: 'mode', value: 'lsn', label: 'Route by the write\'s LSN' },
          }
        : {
            kind: 'why',
            prompt: 'Why not route every read to the primary and forget about lag?',
            reveal: 'Because the replicas exist to take read load off the primary; sending everything back undoes that, and the primary becomes the bottleneck again. LSN routing only falls back to the primary for the brief window after a user\'s own write — and only for that user. Note what it doesn\'t promise: a different user can still see the old name. Read-your-writes is a per-user guarantee, not linearizability.',
            source: { title: 'Kleppmann — Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
          };
  push({ say: closing.kind === 'break' ? 'Checkpoint — fix it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

export const replicationLag: Scenario = {
  id: 'replication-lag',
  topic: 'consistency-patterns',
  title: 'Replication lag',
  summary: 'A user saves, then reloads twice against lagging replicas — round robin, pinned to a replica, and routed by the write\'s log position.',
  stage: {
    width: 648,
    height: 340,
    nodes: [
      { id: 'user', label: 'user', x: 16, y: 148, w: 104, h: 44 },
      { id: 'app', label: 'app', x: 140, y: 136, w: 130, h: 68 },
      { id: 'primary', label: 'primary', sub: 'takes every write', x: 300, y: 16, w: 170, h: 92 },
      { id: 'r1', label: 'replica 1', x: 300, y: 124, w: 170, h: 96 },
      { id: 'r2', label: 'replica 2', x: 300, y: 236, w: 170, h: 96 },
      { id: 'view', label: 'USER SEES', x: 494, y: 122, w: 138, h: 100 },
    ],
    edges: [
      { id: 'user-app', from: 'user', to: 'app', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.5 } },
      { id: 'app-primary', from: 'app', to: 'primary', fromPort: { side: 'r', at: 14 / 68 }, toPort: { side: 'l' }, via: [[285, 150], [285, 62]] },
      { id: 'app-r1', from: 'app', to: 'r1', fromPort: { side: 'r', at: 0.5 }, toPort: { side: 'l', at: (170 - 124) / 96 } },
      { id: 'app-r2', from: 'app', to: 'r2', fromPort: { side: 'r', at: 54 / 68 }, toPort: { side: 'l' }, via: [[285, 190], [285, 284]] },
      { id: 'primary-r1', from: 'primary', to: 'r1', fromPort: { side: 'b' }, toPort: { side: 't' } },
      { id: 'primary-r2', from: 'primary', to: 'r2', fromPort: { side: 'r' }, toPort: { side: 'r' }, via: [[482, 62], [482, 284]] },
    ],
  },
  knobs: [
    {
      id: 'mode',
      kind: 'choice',
      label: 'read routing',
      default: 'round-robin',
      options: [
        { value: 'round-robin', label: 'round robin' },
        { value: 'sticky', label: 'pinned to one replica' },
        { value: 'lsn', label: 'by the write\'s LSN' },
      ],
    },
  ],
  source,
  run,
};
