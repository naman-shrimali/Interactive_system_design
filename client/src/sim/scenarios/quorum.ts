import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Packet, Scenario } from '../types';
import { factMs } from '../facts';
import { lineOf, list } from '../kit';

/*
 * Quorum, sloppy quorum, read repair.
 *
 * Three replicas A, B, C hold cart:42. C is cut off from the coordinator
 * during a write; in the sloppy variant A is also down, so the write lands on
 * D, outside the key's preference list, with a hint to hand it to A later.
 *
 * Replicas answer reads in a fixed order — C, then A, then B — and the
 * coordinator takes the first R replies. Everything else (which writes were
 * acknowledged, which value the client sees, what read repair touches) is
 * computed from replica state, so "R + W > N was satisfied and the read was
 * still stale" is an outcome of the rules, not a line of narration.
 */

const RTT = factMs('datacenter-round-trip');
const N = 3;
const KEY = 'cart:42';
const READ_ORDER = ['C', 'A', 'B'] as const;
type Rep = 'A' | 'B' | 'C';
type Quorum = 'W1R1' | 'W2R2';

interface Copy {
  value: string;
  version: number;
}

const source = (k: KnobValues): string[] => {
  const q = (k.quorum as Quorum) ?? 'W2R2';
  const [W, R] = q === 'W1R1' ? [1, 1] : [2, 2];
  return [
    `const N = ${N}, W = ${W}, R = ${R};   // R + W ${W + R > N ? '>' : '≤'} N`,
    ``,
    `async function put(key, value, version) {`,
    `  const list = preferenceList(key, N);        // A, B, C`,
    k.sloppy
      ? `  const targets = firstHealthy(key, N);      // may swap in D, with a hint`
      : `  const targets = list;                       // strict: only A, B, C`,
    `  const acks = await firstK(targets.map((r) => r.write(key, value, version)), W);`,
    `  return acks.length >= W ? 'OK' : 'FAIL';`,
    `}`,
    ``,
    `async function get(key) {`,
    `  const list = preferenceList(key, N);`,
    `  const replies = await firstK(list.map((r) => r.read(key)), R);`,
    `  const newest = replies.reduce((a, b) => (b.version > a.version ? b : a));`,
    `  for (const r of replies)                        // read repair:`,
    `    if (r.version < newest.version) r.node.write(key, newest);  // only these`,
    `  return newest.value;`,
    `}`,
    ``,
    `// Background: a node holding a hint delivers it once the owner is back.`,
    `async function handOff(hint) { await hint.owner.write(hint.key, hint.value); }`,
  ];
};

function run(k: KnobValues): Frame[] {
  const q = (k.quorum as Quorum) ?? 'W2R2';
  const sloppy = k.sloppy === true;
  const [W, R] = q === 'W1R1' ? [1, 1] : [2, 2];
  const src = source(k);
  const at = (a: string) => lineOf(src, a);

  // ---- the model ----
  let t = 0;
  const copy: Record<Rep | 'D', Copy | null> = {
    A: { value: 'v1', version: 1 },
    B: { value: 'v1', version: 1 },
    C: { value: 'v1', version: 1 },
    D: null,
  };
  let hint: { owner: Rep; copy: Copy } | null = null;
  const down = new Set<string>();
  const cut = new Set<string>();
  let acked: string[] = [];
  let writeResult = '—';
  let replies: string[] = [];
  let clientSaw = '—';
  const hot = new Set<string>();
  const stale = (r: Rep) => (copy[r]?.version ?? 0) < 2;

  const replica = (r: Rep): NodeState => {
    const c = copy[r]!;
    const isDown = down.has(r);
    return {
      tone: isDown ? 'fail' : hot.has(r) ? 'active' : 'idle',
      badge: isDown ? 'DOWN' : cut.has(r) ? 'CUT OFF' : undefined,
      badgeTone: isDown || cut.has(r) ? 'fail' : undefined,
      rows: [
        { kind: 'kv', label: KEY, value: `${c.value} · ver ${c.version}`, tone: c.version === 2 ? 'ok' : 'warn' },
      ],
    };
  };

  const nodes = (): Record<string, NodeState> => ({
    client: { badge: clientSaw !== '—' ? clientSaw : writeResult !== '—' ? writeResult : undefined, badgeTone: clientSaw === 'v1' ? 'warn' : 'ok' },
    coord: { tone: hot.has('coord') ? 'active' : 'idle', sub: `N=${N} W=${W} R=${R}` },
    A: replica('A'),
    B: replica('B'),
    C: replica('C'),
    D: {
      tone: hint ? (hot.has('D') ? 'active' : 'idle') : 'dim',
      sub: 'outside the list',
      rows: hint
        ? [
            { kind: 'kv', label: 'hint for', value: hint.owner, tone: 'warn' },
            { kind: 'kv', label: 'holds', value: `${hint.copy.value} · ver ${hint.copy.version}`, tone: 'ok' },
          ]
        : [{ kind: 'kv', label: 'no hints', tone: 'dim' }],
    },
  });

  const metrics = (): Metric[] => [
    { label: 'R + W vs N', value: `${R + W} ${R + W > N ? '>' : '≤'} ${N}`, tone: R + W > N ? 'ok' : 'warn' },
    { label: 'Write acks', value: acked.length ? `${list(acked)} → ${writeResult}` : '—', tone: writeResult === 'OK' ? 'ok' : 'idle' },
    { label: 'Read replies', value: replies.length ? replies.join(', ') : '—' },
    { label: 'Client read', value: clientSaw, tone: clientSaw === 'v1' ? 'warn' : clientSaw === 'v2' ? 'ok' : 'idle' },
  ];

  const links = (): Frame['links'] => {
    const out: NonNullable<Frame['links']> = {};
    for (const c of cut) out[`coord-${c}`] = 'cut';
    return out;
  };

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics' | 'links'>) => {
    frames.push({ ...f, t, nodes: nodes(), metrics: metrics(), links: links() });
    hot.clear();
  };

  // ---- 0. setting ----
  push({
    say: `${KEY} lives on N=${N} replicas — A, B and C, its preference list. A write succeeds once W=${W} replicas acknowledge; a read asks the replicas and uses the first R=${R} answers.`,
    why: [
      `R + W > N is the quorum rule: if every write reaches W replicas and every read hears from R, some replica must be in both sets, so a read sees at least one copy of the latest acknowledged write.`,
      `This model orders writes with a version number. Dynamo uses vector clocks so it can also detect genuinely concurrent writes; with a single writer a version number is enough.`,
    ],
  });

  // ---- 1. faults ----
  cut.add('C');
  if (sloppy) down.add('A');
  push({
    say: sloppy
      ? `A network fault cuts C off from the coordinator, and A goes down for a restart. Of the three replicas that own ${KEY}, only B is reachable.`
      : `A network fault cuts C off from the coordinator. A and B are reachable.`,
  });

  // ---- 2. the write ----
  t += 1;
  const reachable = (['A', 'B', 'C'] as Rep[]).filter((r) => !down.has(r) && !cut.has(r));
  const strictTargets = reachable;
  let targets: string[] = strictTargets;
  if (sloppy && strictTargets.length < W) targets = [...strictTargets, 'D'];
  hot.add('coord');
  push({
    line: at('const targets ='),
    vars: { targets: list(targets) },
    packets: [
      { edge: 'client-coord', dir: 1, kind: 'req', label: `PUT ${KEY}=v2` },
      ...targets.map((r, i): Packet => ({ edge: `coord-${r}`, dir: 1, kind: 'req', delay: 460 + i * 90 })),
      ...(cut.has('C') ? [{ edge: 'coord-C', dir: 1 as const, kind: 'fail' as const, delay: 460 }] : []),
    ],
    say:
      targets.includes('D')
        ? `The client writes v2. Only B can take it, fewer than W=${W} — so the sloppy quorum borrows D, the next healthy node, and sends it the write with a hint that it belongs to A.`
        : `The client writes v2. The coordinator sends it to ${list(targets)}${down.has('A') ? ' (A is down)' : ''}; the copy to C never arrives.`,
  });

  t += RTT;
  for (const r of targets) {
    if (r === 'D') {
      hint = { owner: 'A', copy: { value: 'v2', version: 2 } };
      copy.D = { value: 'v2', version: 2 };
    } else copy[r as Rep] = { value: 'v2', version: 2 };
  }
  acked = [...targets];
  writeResult = targets.length >= W ? 'OK' : 'FAIL';
  targets.forEach((r) => hot.add(r));
  push({
    line: at("acks.length >= W"),
    vars: { acks: `${targets.length} (need ${W})`, result: writeResult },
    packets: [
      ...targets.map((r, i): Packet => ({ edge: `coord-${r}`, dir: -1, kind: 'ok', delay: i * 90 })),
      { edge: 'client-coord', dir: -1, kind: writeResult === 'OK' ? 'ok' : 'fail', label: writeResult, delay: 460 },
    ],
    say: `${list(targets)} ${targets.length === 1 ? 'stores' : 'store'} v2 and ${targets.length === 1 ? 'acknowledges' : 'acknowledge'}. ${targets.length} ≥ W=${W}, so the client is told the write succeeded.${
      stale('C') ? ' C still has v1.' : ''
    }${hint ? ' A, still down, has v1 too — the copy meant for it is sitting on D.' : sloppy && stale('A') ? ' A, still down, has v1 too.' : ''}`,
  });

  // ---- 3. the fault heals ----
  t += 400;
  cut.delete('C');
  down.delete('A');
  push({
    say: sloppy
      ? `C's link is restored and A restarts — with v1${hint ? ', because D has not handed its hint over yet' : ''}.`
      : `C's link is restored. It never saw the write, so it still has v1.`,
  });

  // ---- 4. predict ----
  const order = READ_ORDER.filter((r) => !down.has(r));
  const firstR = order.slice(0, R);
  const newest = firstR.map((r) => copy[r]!).reduce((a, b) => (b.version > a.version ? b : a));
  const readValue = newest.value;
  push({
    say: 'Checkpoint — predict the read.',
    checkpoint: {
      kind: 'predict',
      prompt: `The client now reads ${KEY} with R=${R}. ${firstR.length === 1 ? `The replica that answers first is ${firstR[0]}` : `The replicas that answer first are ${list(firstR)}`}. What does the client get?`,
      options: ['v2 — the value it just wrote', 'v1 — the old value', 'An error'],
      answer: readValue === 'v2' ? 0 : 1,
      reveal:
        readValue === 'v2'
          ? `v2. ${list(firstR)} answer with ${firstR.map((r) => copy[r]!.value).join(' and ')}; the coordinator keeps the highest version. Because R + W > N, the read set had to include a replica from the write set — here ${firstR.find((r) => copy[r]!.version === 2)}.`
          : R + W > N
            ? `v1, even though R + W > N. The write's quorum was ${list(acked)}, and D is not in ${KEY}'s preference list, so reads never ask it. The two sets that were supposed to overlap don't: a sloppy quorum counts acknowledgements from outside the list.`
            : `v1. With R + W = ${R + W} ≤ N = ${N}, nothing forces the read to touch a replica that took the write. ${list(firstR)} answered first, and ${firstR.length === 1 ? 'it has' : 'they have'} only v1.`,
      source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
    },
  });

  // ---- 5. the read ----
  t += RTT;
  replies = firstR.map((r) => `${r}:${copy[r]!.value}`);
  clientSaw = readValue;
  hot.add('coord');
  firstR.forEach((r) => hot.add(r));
  push({
    line: at('const newest ='),
    vars: { replies: replies.join(', '), newest: readValue },
    packets: [
      { edge: 'client-coord', dir: 1, kind: 'req', label: `GET ${KEY}` },
      ...firstR.map((r, i): Packet => ({ edge: `coord-${r}`, dir: -1, kind: copy[r]!.version === 2 ? 'ok' : 'nil', delay: 460 + i * 90 })),
      { edge: 'client-coord', dir: -1, kind: readValue === 'v2' ? 'ok' : 'nil', label: readValue, delay: 900 },
    ],
    say: `${list(firstR)} ${firstR.length === 1 ? 'answers' : 'answer'} first with ${firstR.map((r) => `${copy[r]!.value}`).join(' and ')}. The coordinator keeps the newest — ${readValue} — and returns it.${
      readValue === 'v1' ? ' The client just read a value older than one it was told had been written.' : ''
    }`,
  });

  // ---- 6. repair ----
  const repaired = firstR.filter((r) => copy[r]!.version < newest.version);
  if (repaired.length) {
    t += RTT;
    for (const r of repaired) copy[r] = { ...newest };
    repaired.forEach((r) => hot.add(r));
    push({
      line: at('r.node.write(key, newest)'),
      vars: { repaired: list(repaired) },
      packets: repaired.map((r, i): Packet => ({ edge: `coord-${r}`, dir: 1, kind: 'ok', label: 'repair v2', delay: i * 90 })),
      say: `Read repair: ${list(repaired)} answered with an older version, so the coordinator writes v2 back to ${repaired.length === 1 ? 'it' : 'them'}. Only replicas this read touched get repaired.`,
    });
  }
  if (hint) {
    t += 200;
    copy.A = { ...hint.copy };
    hint = null;
    copy.D = null;
    hot.add('A').add('D');
    push({
      line: at('async function handOff('),
      packets: [{ edge: 'D-A', dir: 1, kind: 'ok', label: 'hint: v2' }],
      say: `D notices A is back and hands over the hinted write. A now has v2 — after the read that needed it.`,
    });
  }

  // ---- 7. checkpoint ----
  let closing: Checkpoint;
  if (R + W <= N) {
    closing = {
      kind: 'break',
      prompt: `W=1 and R=1 made both operations fast, and the client read its own write back as v1. What is the smallest change that guarantees a read sees the latest acknowledged write?`,
      reveal: `Make R + W > N. With N=3, W=2 and R=2 is the usual choice: any two replicas that took a write and any two that answer a read must share one, so the newest version is always among the replies. The price is waiting for two replicas on each side, so latency follows the slower of them.`,
      source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
      knob: { id: 'quorum', value: 'W2R2', label: 'Use W=2, R=2' },
    };
  } else if (sloppy) {
    closing = {
      kind: 'why',
      prompt: 'Why would anyone accept a quorum that can return stale data even when R + W > N?',
      reveal: `For write availability. A strict quorum would have rejected this write — only one of A, B and C was reachable. A sloppy quorum accepts it on D and repairs A later by hinted handoff, so a shopping cart keeps taking items during an outage. The cost is exactly what happened here: until handoff completes, the overlap argument doesn't hold, and a read can miss an acknowledged write. It's a deliberate trade, not a bug — which is why "R + W > N" alone doesn't mean linearizable.`,
      source: { title: 'Jepsen analyses', url: 'https://jepsen.io/analyses' },
    };
  } else {
    closing = {
      kind: 'why',
      prompt: 'Read repair fixed C. What about a key that nobody reads for a month?',
      reveal: `Read repair only fixes replicas that a read happened to touch, so rarely read keys can stay divergent indefinitely. Dynamo-style stores run background anti-entropy as well: replicas compare Merkle trees of their key ranges, find the differing branches without shipping every key, and sync just those. Hinted handoff covers short outages; anti-entropy covers everything they miss.`,
      source: { title: 'DeCandia et al. — Dynamo', url: 'https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store' },
    };
  }
  push({ say: closing.kind === 'break' ? 'Checkpoint — fix it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

export const quorum: Scenario = {
  id: 'quorum',
  topic: 'key-value-store',
  title: 'Quorum, sloppy quorum, read repair',
  summary: 'A write while one replica is cut off, then a read — at W=1, R=1 and at W=2, R=2, with and without a sloppy quorum.',
  stage: {
    width: 648,
    height: 362,
    regions: [{ label: `PREFERENCE LIST · ${KEY}`, x: 292, y: 14, w: 176, h: 318, style: 'dashed', labelAt: 'bottom' }],
    nodes: [
      { id: 'client', label: 'client', x: 16, y: 162, w: 104, h: 44 },
      { id: 'coord', label: 'coordinator', x: 140, y: 150, w: 130, h: 68 },
      { id: 'A', label: 'A', x: 300, y: 22, w: 160, h: 90 },
      { id: 'B', label: 'B', x: 300, y: 128, w: 160, h: 90 },
      { id: 'C', label: 'C', x: 300, y: 234, w: 160, h: 90 },
      { id: 'D', label: 'D', x: 490, y: 22, w: 142, h: 104 },
    ],
    edges: [
      { id: 'client-coord', from: 'client', to: 'coord', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.5 } },
      { id: 'coord-A', from: 'coord', to: 'A', fromPort: { side: 'r', at: 0.2 }, toPort: { side: 'l' }, via: [[282, 164], [282, 67]] },
      { id: 'coord-B', from: 'coord', to: 'B', fromPort: { side: 'r', at: 0.5 }, toPort: { side: 'l', at: 0.62 } },
      { id: 'coord-C', from: 'coord', to: 'C', fromPort: { side: 'r', at: 0.8 }, toPort: { side: 'l' }, via: [[282, 204], [282, 279]] },
      { id: 'coord-D', from: 'coord', to: 'D', fromPort: { side: 't' }, toPort: { side: 't' }, via: [[205, 6], [561, 6]] },
      { id: 'D-A', from: 'D', to: 'A', fromPort: { side: 'l', at: 0.43 }, toPort: { side: 'r' } },
    ],
  },
  knobs: [
    {
      id: 'quorum',
      kind: 'choice',
      label: 'quorum',
      default: 'W1R1',
      options: [
        { value: 'W1R1', label: 'W=1, R=1' },
        { value: 'W2R2', label: 'W=2, R=2' },
      ],
    },
    { id: 'sloppy', kind: 'toggle', label: 'A down (sloppy quorum)', default: false },
  ],
  source,
  run,
};
