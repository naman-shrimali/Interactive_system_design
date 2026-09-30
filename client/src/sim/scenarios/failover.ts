import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Scenario } from '../types';
import { factMs } from '../facts';
import { lineOf } from '../kit';

/*
 * Automatic failover, split brain, and fencing tokens.
 *
 * A monitor watches the primary P and promotes the standby S when P stops
 * answering. Here P hasn't died: only the monitor's link to it has. So after
 * promotion there are two nodes that believe they are primary, and both write
 * to the same storage. Whether storage accepts the old primary's writes is the
 * knob:
 *
 *   none    storage takes every write        the last writer wins; a withdrawal vanishes
 *   token   storage rejects a lower epoch    P's stale write fails and P steps down
 *
 * The account starts at 100. Client A deposits 20 through P, client B withdraws
 * 30 through S. The only correct final balance is 90.
 */

const RTT = factMs('datacenter-round-trip');
// fact-exempt: the monitor's heartbeat interval and miss threshold are configuration
const HEARTBEAT = 1000;
const MISSES = 3;
const START = 100;
const DEPOSIT = 20;
const WITHDRAW = 30;
const CORRECT = START + DEPOSIT - WITHDRAW;
const EPOCH = 7;

type Fencing = 'none' | 'token';
type Node = 'p' | 's';

const source = (k: KnobValues): string[] => {
  const token = (k.fencing as Fencing) === 'token';
  return [
    `// monitor`,
    `if (missedHeartbeats(primary) >= 3) {`,
    `  epoch += 1;                        // every promotion gets a bigger number`,
    `  promote(standby, epoch);`,
    `}`,
    ``,
    `// whichever node thinks it is primary`,
    `async function apply(account, delta) {`,
    `  const balance = await storage.get(account);`,
    `  await storage.put(account, balance + delta, { epoch: myEpoch });`,
    `}`,
    ``,
    `// storage`,
    `function put(key, value, { epoch }) {`,
    ...(token
      ? [
          `  if (epoch < highestEpoch) throw new Fenced(epoch, highestEpoch);`,
          `  highestEpoch = epoch;`,
        ]
      : [`  // no epoch check: whoever writes last wins`]),
    `  data[key] = value;`,
    `}`,
  ];
};

/** The outcome, computed from the writes in the order they reach storage. */
function simulate(fencing: Fencing): { accepted: Node[]; balance: number } {
  let balance = START;
  let highest = 0;
  const accepted: Node[] = [];
  const put = (who: Node, epoch: number, value: number) => {
    if (fencing === 'token' && epoch < highest) return false;
    highest = Math.max(highest, epoch);
    balance = value;
    accepted.push(who);
    return true;
  };
  const pRead = balance; // P reads before S writes
  put('s', EPOCH + 1, balance - WITHDRAW);
  if (!put('p', EPOCH, pRead + DEPOSIT)) put('s', EPOCH + 1, balance + DEPOSIT); // client A retries at S
  return { accepted: [...new Set(accepted)], balance };
}

function run(k: KnobValues): Frame[] {
  const fencing = (k.fencing as Fencing) ?? 'none';
  const src = source(k);
  const at = (a: string) => lineOf(src, a);
  const expected = simulate(fencing);

  let t = 0;
  let balance = START;
  let highest = fencing === 'token' ? EPOCH : 0;
  let monitorEpoch = EPOCH;
  let missed = 0;
  const role: Record<Node, 'primary' | 'standby' | 'stepped down'> = { p: 'primary', s: 'standby' };
  const epoch: Record<Node, number | null> = { p: EPOCH, s: null };
  const writes: string[][] = [];
  const hot = new Set<string>();
  let cut = false;
  const accepted = new Set<Node>();
  let clientA = '';
  let clientB = '';

  const server = (n: Node): NodeState => ({
    tone: role[n] === 'stepped down' ? 'dim' : hot.has(n) ? 'active' : 'idle',
    badge: role[n] === 'primary' ? 'PRIMARY' : role[n] === 'stepped down' ? 'FENCED' : undefined,
    badgeTone: role[n] === 'primary' ? 'ok' : 'fail',
    rows: [
      { kind: 'kv', label: 'role', value: role[n], tone: role[n] === 'primary' ? 'idle' : 'dim' },
      { kind: 'kv', label: 'epoch', value: epoch[n] === null ? '—' : String(epoch[n]), tone: 'idle' },
    ],
  });

  const primaries = () => (['p', 's'] as Node[]).filter((n) => role[n] === 'primary');

  const nodes = (): Record<string, NodeState> => ({
    ca: { badge: clientA || undefined, badgeTone: clientA === 'OK' ? 'ok' : 'fail' },
    cb: { badge: clientB || undefined, badgeTone: clientB === 'OK' ? 'ok' : 'fail' },
    p: server('p'),
    s: server('s'),
    mon: {
      tone: hot.has('mon') ? 'active' : 'idle',
      rows: [
        { kind: 'kv', label: 'P missed', value: `${missed} / ${MISSES}`, tone: missed ? 'warn' : 'idle' },
        { kind: 'kv', label: 'epoch', value: String(monitorEpoch), tone: 'idle' },
      ],
    },
    store: {
      tone: hot.has('store') ? 'active' : 'idle',
      rows: [
        { kind: 'kv', label: 'balance', value: String(balance), tone: 'idle' },
        { kind: 'kv', label: 'highest epoch', value: fencing === 'token' ? String(highest) : 'not tracked', tone: fencing === 'token' ? 'idle' : 'dim' },
        { kind: 'table', columns: ['from', 'epoch', 'value', 'result'], rows: writes.length ? writes : [['—', '', '', '']] },
      ],
    },
  });

  const metrics = (): Metric[] => [
    { label: 'Acting primaries', value: String(primaries().length), tone: primaries().length > 1 ? 'fail' : 'idle' },
    { label: 'Balance', value: String(balance) },
    { label: 'Correct', value: String(CORRECT) },
    { label: 'Clock', value: `t = ${(t / 1000).toFixed(3)} s` },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics' | 'links'>) => {
    frames.push({ ...f, t, nodes: nodes(), metrics: metrics(), links: cut ? { 'mon-p': 'cut' } : undefined });
    hot.clear();
  };

  const put = (who: Node, value: number): boolean => {
    const e = epoch[who]!;
    const ok = !(fencing === 'token' && e < highest);
    writes.push([who.toUpperCase(), String(e), String(value), ok ? 'accepted' : 'rejected']);
    if (ok) {
      if (fencing === 'token') highest = Math.max(highest, e);
      balance = value;
      accepted.add(who);
    }
    return ok;
  };

  // ---- 0. setting ----
  push({
    say: `P is the primary at epoch ${EPOCH}; S is its standby. A monitor checks P's heartbeat every second and will promote S after ${MISSES} misses. Account 42 holds ${START}.`,
    why: [
      'Automatic failover turns an hour of downtime into seconds — no human has to be woken up. The price is that a machine now decides when the primary is dead, and it can only decide from what it can see.',
    ],
  });

  // ---- 1. partition ----
  cut = true;
  t += HEARTBEAT;
  missed = 1;
  hot.add('mon');
  push({
    packets: [{ edge: 'mon-p', dir: 1, kind: 'fail', label: 'heartbeat?' }],
    say: 'The network between the monitor and P fails. P itself is healthy, still serving client A, and still talking to storage.',
  });

  // ---- 2. promotion ----
  t += HEARTBEAT * (MISSES - 1);
  missed = MISSES;
  monitorEpoch += 1;
  role.s = 'primary';
  epoch.s = monitorEpoch;
  hot.add('mon').add('s');
  push({
    line: at('promote(standby'),
    vars: { epoch: String(monitorEpoch) },
    packets: [
      { edge: 'mon-p', dir: 1, kind: 'fail' },
      { edge: 'mon-s', dir: 1, kind: 'req', label: `promote · epoch ${monitorEpoch}`, delay: 500 },
    ],
    say: `${MISSES} missed heartbeats. The monitor declares P dead, bumps the epoch to ${monitorEpoch}, and promotes S. Nobody told P — the monitor can't reach it.`,
    why: [
      'From the outside, a crashed node, a paused node and an unreachable node look identical: no reply. A timeout can\'t tell them apart, so a failover can promote a new primary while the old one is still running.',
    ],
  });

  // ---- 3. predict ----
  push({
    say: 'Checkpoint — predict the split brain.',
    checkpoint: {
      kind: 'predict',
      prompt: `P and S both believe they are primary. Client A deposits ${DEPOSIT} through P; client B withdraws ${WITHDRAW} through S; S's write reaches storage first. ${
        fencing === 'token' ? 'Storage rejects any write with an epoch lower than one it has already seen.' : 'Storage accepts every write it receives.'
      } Whose writes does storage accept?`,
      options: ['Only S\'s', 'Both — the last one wins', 'Neither'],
      answer: expected.accepted.length === 2 ? 1 : expected.accepted.includes('s') ? 0 : 2,
      reveal:
        fencing === 'token'
          ? `Only S's. S's write carries epoch ${EPOCH + 1}, so storage raises its highest epoch to ${EPOCH + 1}. P's write arrives with epoch ${EPOCH} and is refused — P learns it has been replaced and steps down. Client A retries at S, and the balance ends at ${expected.balance}.`
          : `Both. P read ${START}, S read ${START}. S wrote ${START - WITHDRAW}; then P wrote ${START + DEPOSIT} over it. The withdrawal happened — the cash left — but the balance says ${expected.balance}. Nothing failed, so nobody was told.`,
      source: { title: 'How to do distributed locking', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html' },
    },
  });

  // ---- 4. P reads ----
  t += RTT;
  const pRead = balance;
  hot.add('p').add('store');
  push({
    line: at('storage.get(account)'),
    vars: { myEpoch: String(EPOCH), balance: String(pRead) },
    packets: [
      { edge: 'ca-p', dir: 1, kind: 'req', label: `+${DEPOSIT}` },
      { edge: 'p-store', dir: 1, kind: 'req', delay: 400 },
      { edge: 'p-store', dir: -1, kind: 'ok', label: String(pRead), delay: 800 },
    ],
    say: `Client A's deposit reaches P. P reads the balance: ${pRead}.`,
  });

  // ---- 5. S reads and writes ----
  t += RTT * 2;
  const sRead = balance;
  const sOk = put('s', sRead - WITHDRAW);
  clientB = sOk ? 'OK' : 'ERR';
  hot.add('s').add('store');
  push({
    line: at('storage.put(account'),
    vars: { myEpoch: String(epoch.s), balance: String(sRead) },
    packets: [
      { edge: 'cb-s', dir: 1, kind: 'req', label: `−${WITHDRAW}` },
      { edge: 's-store', dir: 1, kind: 'req', delay: 400 },
      { edge: 's-store', dir: -1, kind: 'ok', label: String(sRead), delay: 700 },
      { edge: 's-store', dir: 1, kind: 'req', label: `${sRead - WITHDRAW} · e${epoch.s}`, delay: 1000 },
      { edge: 's-store', dir: -1, kind: 'ok', delay: 1400 },
      { edge: 'cb-s', dir: -1, kind: 'ok', delay: 1700 },
    ],
    say: `Meanwhile client B withdraws ${WITHDRAW} through S. S reads ${sRead} and writes ${sRead - WITHDRAW} with epoch ${epoch.s}. ${
      fencing === 'token' ? `Storage records ${epoch.s} as the highest epoch it has seen.` : 'Storage accepts it.'
    }`,
  });

  // ---- 6. P's stale write ----
  t += RTT;
  const pOk = put('p', pRead + DEPOSIT);
  hot.add('p').add('store');
  if (!pOk) role.p = 'stepped down';
  clientA = pOk ? 'OK' : 'ERR';
  push({
    line: fencing === 'token' && !pOk ? at('if (epoch < highestEpoch)') : at('data[key] = value'),
    vars: fencing === 'token' ? { epoch: String(EPOCH), highestEpoch: String(highest) } : { value: String(pRead + DEPOSIT) },
    packets: [
      { edge: 'p-store', dir: 1, kind: 'req', label: `${pRead + DEPOSIT} · e${EPOCH}` },
      { edge: 'p-store', dir: -1, kind: pOk ? 'ok' : 'fail', label: pOk ? undefined : 'fenced', delay: 450 },
      { edge: 'ca-p', dir: -1, kind: pOk ? 'ok' : 'fail', delay: 850 },
    ],
    say: pOk
      ? `Now P's write lands: ${pRead + DEPOSIT}, computed from the ${pRead} it read before the withdrawal. Storage accepts it, overwriting ${sRead - WITHDRAW}. The withdrawal is gone, and both clients were told OK.`
      : `P's write arrives with epoch ${EPOCH}, but storage has already seen ${highest}. It refuses. P now knows it was replaced: it steps down and returns an error to client A.`,
  });

  // ---- 7. client A retries at S ----
  if (!pOk) {
    t += RTT * 3;
    const read = balance;
    put('s', read + DEPOSIT);
    clientA = 'OK';
    hot.add('s').add('store');
    push({
      line: at('storage.put(account'),
      vars: { myEpoch: String(epoch.s), balance: String(read) },
      packets: [
        { edge: 'ca-s', dir: 1, kind: 'req', label: `+${DEPOSIT}` },
        { edge: 's-store', dir: 1, kind: 'req', delay: 500 },
        { edge: 's-store', dir: -1, kind: 'ok', label: String(read), delay: 800 },
        { edge: 's-store', dir: 1, kind: 'req', label: `${read + DEPOSIT} · e${epoch.s}`, delay: 1100 },
        { edge: 's-store', dir: -1, kind: 'ok', delay: 1450 },
        { edge: 'ca-s', dir: -1, kind: 'ok', delay: 1800 },
      ],
      say: `Client A retries against the new primary. S reads ${read}, writes ${read + DEPOSIT}. The balance is right.`,
    });
  }

  const got = { accepted: [...accepted], balance };
  if (got.balance !== expected.balance || got.accepted.sort().join() !== [...expected.accepted].sort().join())
    throw new Error(`failover(${fencing}): frames disagree with simulate()`);

  push({
    say:
      balance === CORRECT
        ? `Final: balance ${balance}, which is ${START} + ${DEPOSIT} − ${WITHDRAW}. One node acts as primary. The old one found out the moment it tried to write.`
        : `Final: balance ${balance}; it should be ${CORRECT}. Two nodes still believe they are primary, and nothing in the system has noticed.`,
  });

  // ---- closing ----
  const closing: Checkpoint =
    fencing === 'none'
      ? {
          kind: 'break',
          prompt: 'The monitor can\'t reach P to tell it to stop. What can stop P\'s writes anyway?',
          reveal: `The resource being written can. Give every promotion a number that only goes up — an epoch or term — and have storage reject any write carrying a lower number than one it has already seen. Then it doesn't matter that P never got the message: its first write after the failover is refused, and it learns it's been replaced. That's a fencing token.`,
          source: { title: 'How to do distributed locking', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html' },
          knob: { id: 'fencing', value: 'token', label: 'Fence with the epoch' },
        }
      : {
          kind: 'why',
          prompt: 'Why not have P simply check, before each write, whether it is still the primary?',
          reveal: `Because the check and the write are two steps, and anything can happen between them. A garbage-collection pause, a swapped-out page or a slow network can stall P for seconds after its check succeeds — long enough for a failover — and then the write goes out anyway. Only the resource receiving the write can make the decision atomically. The same reasoning is behind STONITH ("shoot the other node in the head"): if you can't fence at the storage, cut the old primary's power before promoting.`,
          source: { title: 'How to do distributed locking', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html' },
        };
  push({ say: closing.kind === 'break' ? 'Checkpoint — fix it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

export const failover: Scenario = {
  id: 'failover-fencing',
  topic: 'availability-patterns',
  title: 'Failover and fencing',
  summary: 'A monitor promotes the standby while the old primary is still alive — and only a fencing token stops both from writing.',
  stage: {
    width: 648,
    height: 316,
    nodes: [
      { id: 'ca', label: 'client A', x: 16, y: 38, w: 110, h: 48 },
      { id: 'cb', label: 'client B', x: 16, y: 240, w: 110, h: 48 },
      { id: 'p', label: 'node P', x: 170, y: 20, w: 170, h: 84 },
      { id: 'mon', label: 'monitor', x: 170, y: 124, w: 170, h: 78 },
      { id: 's', label: 'node S', x: 170, y: 222, w: 170, h: 84 },
      { id: 'store', label: 'storage', sub: 'account 42', x: 400, y: 50, w: 232, h: 190 },
    ],
    edges: [
      { id: 'ca-p', from: 'ca', to: 'p', fromPort: { side: 'r' }, toPort: { side: 'l', at: (62 - 20) / 84 } },
      { id: 'cb-s', from: 'cb', to: 's', fromPort: { side: 'r' }, toPort: { side: 'l', at: (264 - 222) / 84 } },
      { id: 'ca-s', from: 'ca', to: 's', fromPort: { side: 'b' }, toPort: { side: 'l', at: 0.25 }, via: [[71, 150], [150, 150], [150, 243]] },
      { id: 'mon-p', from: 'mon', to: 'p', fromPort: { side: 't' }, toPort: { side: 'b' } },
      { id: 'mon-s', from: 'mon', to: 's', fromPort: { side: 'b' }, toPort: { side: 't' } },
      { id: 'p-store', from: 'p', to: 'store', fromPort: { side: 'r' }, toPort: { side: 'l', at: (100 - 50) / 190 }, via: [[370, 62], [370, 100]] },
      { id: 's-store', from: 's', to: 'store', fromPort: { side: 'r' }, toPort: { side: 'l', at: (210 - 50) / 190 }, via: [[370, 264], [370, 210]] },
    ],
  },
  knobs: [
    {
      id: 'fencing',
      kind: 'choice',
      label: 'storage',
      default: 'none',
      options: [
        { value: 'none', label: 'accepts every write' },
        { value: 'token', label: 'fences by epoch' },
      ],
    },
  ],
  source,
  run,
};
