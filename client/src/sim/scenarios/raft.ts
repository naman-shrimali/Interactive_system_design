import type { Frame, KnobValues, Metric, NodeState, Packet, Row, Scenario } from '../types';
import { factMs, fmtMs } from '../facts';

/*
 * Raft: leader election and log replication.
 *
 * Five servers. The scenario scripts *when* things happen — which timeout fires
 * first, which acknowledgement is slow, when the leader crashes — but every
 * outcome is computed by the protocol rules below: whether a vote is granted
 * (the up-to-date check), whether a candidate has a majority, whether an entry
 * commits, and who steps down on seeing a higher term. So a wrong scenario
 * produces a visibly wrong election rather than a plausible-looking one.
 *
 * Reference: Ongaro & Ousterhout, "In Search of an Understandable Consensus
 * Algorithm (Extended Version)", §5.2 election, §5.3 replication, §5.4.1
 * election restriction.
 */

const RTT = factMs('datacenter-round-trip');
// fact-exempt: the paper's suggested election-timeout range, a protocol parameter
const T_MIN = 150;
// fact-exempt: see above
const T_MAX = 300;
const IDS = ['S1', 'S2', 'S3', 'S4', 'S5'] as const;
type Id = (typeof IDS)[number];
const MAJORITY = Math.floor(IDS.length / 2) + 1;
const RAFT = { title: 'Ongaro & Ousterhout — In Search of an Understandable Consensus Algorithm', url: 'https://web.stanford.edu/~ouster/cgi-bin/papers/raft-extended.pdf' };

/*
 * One sample draw of randomized timeouts from [T_MIN, T_MAX], fixed so every
 * run is identical. Chosen draws, not arbitrary ones: round 1 elects the
 * server nearest the client; after the crash the first to fire is one whose
 * log is behind — the case the election restriction exists for.
 */
const DRAW_START: Record<Id, number> = { S1: 244, S2: 281, S3: 212, S4: 195, S5: 167 };
const DRAW_AFTER_CRASH: Record<Id, number> = { S1: 263, S2: 229, S3: 158, S4: 176, S5: 0 };
const DRAW_PARTITION: Record<Id, number> = { S1: 240, S2: 229, S3: 190, S4: 158, S5: 0 };
const IDENTICAL = 200;

const source = (): string[] => [
  `// every server`,
  `function onElectionTimeout(s) {`,
  `  s.term += 1; s.role = 'candidate'; s.votedFor = s.id;`,
  `  broadcast(requestVote(s.term, lastIndex(s), lastTerm(s)));`,
  `}`,
  ``,
  `function onRequestVote(s, req) {`,
  `  if (req.term > s.term) stepDown(s, req.term);`,
  `  const upToDate = req.lastTerm > lastTerm(s) ||`,
  `    (req.lastTerm === lastTerm(s) && req.lastIndex >= lastIndex(s));`,
  `  const free = s.votedFor === null || s.votedFor === req.from;`,
  `  return req.term === s.term && free && upToDate; // once per term`,
  `}`,
  ``,
  `function onVotes(s, votes) {`,
  `  if (votes > SERVERS / 2) s.role = 'leader'; // 3 of 5`,
  `}`,
  ``,
  `// leader`,
  `function onClientWrite(s, cmd) {`,
  `  s.log.push({ term: s.term, cmd });`,
  `  broadcast(appendEntries(s.term, s.log)); // also the heartbeat`,
  `}`,
  ``,
  `function onAcks(s, acks) {`,
  `  if (acks + 1 > SERVERS / 2) s.commitIndex = s.log.length;`,
  `}`,
  ``,
  `// every server, every message`,
  `function onAnyMessage(s, msg) {`,
  `  if (msg.term > s.term) stepDown(s, msg.term); // stale leaders too`,
  `}`,
];
const LN = {
  timeout: { n: 4, anchor: 'broadcast(requestVote' },
  upToDate: { n: 9, anchor: 'const upToDate' },
  vote: { n: 12, anchor: 'once per term' },
  majority: { n: 16, anchor: 'SERVERS / 2' },
  append: { n: 21, anchor: 's.log.push' },
  replicate: { n: 22, anchor: 'appendEntries' },
  commit: { n: 26, anchor: 's.commitIndex' },
  stepDown: { n: 31, anchor: 'stale leaders too' },
};

interface Entry {
  term: number;
  cmd: string;
  committed: boolean;
  /** Shown once as discarded, when a log conflict is resolved. */
  discarded?: boolean;
}
interface Server {
  id: Id;
  role: 'follower' | 'candidate' | 'leader' | 'down';
  term: number;
  votedFor: Id | null;
  log: Entry[];
  timeout: number;
  firesAt: number | null;
}

/** "S1", "S1 and S2", "S1, S2 and S3". */
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const edgeId = (a: Id, b: Id) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const dirOf = (from: Id, to: Id): 1 | -1 => (from < to ? 1 : -1);

function run(k: KnobValues): Frame[] {
  const randomized = k.timeouts !== 'identical';
  const failure = (k.failure as string) ?? 'crash';

  // ---- the cluster ----
  const S = {} as Record<Id, Server>;
  for (const id of IDS) {
    const timeout = randomized ? DRAW_START[id] : IDENTICAL;
    S[id] = { id, role: 'follower', term: 1, votedFor: null, log: [], timeout, firesAt: timeout };
  }
  let t = 0;
  let side: Set<Id> | null = null; // non-null during a partition: the minority side
  let clientWaiting = '';
  let clientLast = '';

  const up = (id: Id) => S[id].role !== 'down';
  const reach = (a: Id, b: Id) => up(a) && up(b) && (side === null || side.has(a) === side.has(b));
  const lastTerm = (s: Server) => (s.log.length ? s.log[s.log.length - 1].term : 0);
  const lastIndex = (s: Server) => s.log.length;
  const upToDate = (cand: Server, voter: Server) =>
    lastTerm(cand) > lastTerm(voter) || (lastTerm(cand) === lastTerm(voter) && lastIndex(cand) >= lastIndex(voter));
  const stepDown = (s: Server, term: number) => {
    if (term > s.term) {
      s.term = term;
      s.votedFor = null;
      if (s.role !== 'down') s.role = 'follower';
    }
  };
  const leader = (): Server | undefined => IDS.map((i) => S[i]).find((s) => s.role === 'leader');

  // ---- rendering ----
  const nodes = (hot: Set<Id> = new Set()): Record<string, NodeState> => {
    const out: Record<string, NodeState> = {};
    for (const id of IDS) {
      const s = S[id];
      const left = s.firesAt === null ? 0 : Math.max(0, s.firesAt - t);
      const rows: Row[] = [
        s.role === 'leader'
          ? { kind: 'kv', label: 'timer', value: 'off', tone: 'active' } // leaders don't run one
          : s.role === 'down'
            ? { kind: 'kv', label: 'timeout', value: '—', tone: 'dim' }
            : { kind: 'kv', label: 'timeout', value: fmtMs(left), tone: left < 30 ? 'warn' : 'idle' },
        { kind: 'bar', value: s.role === 'follower' || s.role === 'candidate' ? left : 0, max: s.timeout || 1, tone: left < 30 ? 'warn' : 'active' },
        {
          kind: 'log',
          label: `log · term ${s.term}`,
          entries: s.log.map((e) => ({
            text: e.cmd,
            tone: e.discarded ? 'fail' : e.committed ? 'ok' : 'dim',
          })),
        },
      ];
      out[id] = {
        tone: s.role === 'down' ? 'fail' : s.role === 'leader' ? 'active' : s.role === 'candidate' ? 'warn' : hot.has(id) ? 'active' : 'idle',
        badge: s.role === 'down' ? 'DOWN' : s.role === 'leader' ? `LEADER t${s.term}` : s.role === 'candidate' ? `CAND t${s.term}` : `t${s.term}`,
        badgeTone: s.role === 'down' ? 'fail' : s.role === 'leader' ? 'active' : s.role === 'candidate' ? 'warn' : 'dim',
        rows,
      };
    }
    out.client = { badge: clientWaiting || clientLast || undefined, badgeTone: clientWaiting ? 'warn' : 'ok', tone: clientWaiting ? 'active' : 'idle' };
    return out;
  };

  const metrics = (): Metric[] => {
    const l = leader();
    const committed = l ? l.log.filter((e) => e.committed).length : Math.max(...IDS.map((i) => S[i].log.filter((e) => e.committed).length));
    return [
      { label: 'Leader', value: l ? `${l.id} · term ${l.term}` : 'none', tone: l ? 'ok' : 'warn' },
      { label: 'Highest term', value: String(Math.max(...IDS.map((i) => S[i].term))) },
      { label: l ? 'Leader has committed' : 'Committed anywhere', value: `${committed} ${committed === 1 ? 'entry' : 'entries'}` },
      { label: 'Clock', value: `${(t / 1000).toFixed(3)} s` },
    ];
  };

  const links = (): Frame['links'] => {
    const out: NonNullable<Frame['links']> = {};
    for (const a of IDS)
      for (const b of IDS)
        if (a < b && side && side.has(a) !== side.has(b)) out[edgeId(a, b)] = 'cut';
    return out;
  };

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics' | 'links'> & { hot?: Id[] }) => {
    const { hot, ...rest } = f;
    frames.push({ ...rest, t, nodes: nodes(new Set(hot ?? [])), metrics: metrics(), links: links() });
  };
  const send = (from: Id, to: Id[], kind: Packet['kind'], label: string, delay = 0): Packet[] =>
    to.map((id, i) => ({ edge: edgeId(from, id), dir: dirOf(from, id), kind, label, delay: delay + i * 90 }));
  const clientEdge = (id: Id) => `client-${id}`;

  /** Run one election for `cand`: returns who granted and who refused, applying all state changes. */
  const election = (cand: Id) => {
    const c = S[cand];
    c.term += 1;
    c.role = 'candidate';
    c.votedFor = cand;
    c.firesAt = null;
    const granted: Id[] = [];
    const refused: { id: Id; why: string }[] = [];
    for (const id of IDS) {
      if (id === cand || !reach(cand, id)) continue;
      const v = S[id];
      stepDown(v, c.term);
      const free = v.votedFor === null || v.votedFor === cand;
      const ok = upToDate(c, v);
      if (v.term === c.term && free && ok) {
        v.votedFor = cand;
        v.firesAt = t + v.timeout; // granting a vote resets the election timer
        granted.push(id);
      } else {
        refused.push({ id, why: !ok ? 'its log is more up to date' : 'already voted this term' });
      }
    }
    return { granted, refused, won: granted.length + 1 >= MAJORITY };
  };

  const becomeLeader = (id: Id) => {
    S[id].role = 'leader';
    S[id].firesAt = null;
  };
  /** Heartbeat from the leader: followers it reaches reset their timers and learn the commit index. */
  const heartbeat = (l: Id, draw?: Partial<Record<Id, number>>) => {
    const reached: Id[] = [];
    for (const id of IDS) {
      if (id === l || !reach(l, id)) continue;
      stepDown(S[id], S[l].term);
      const committed = S[l].log.filter((e) => e.committed).length;
      S[id].log.forEach((e, i) => (e.committed = i < committed && e.term === S[l].log[i]?.term));
      const d = draw?.[id] ?? S[id].timeout;
      S[id].timeout = d;
      S[id].firesAt = t + d;
      reached.push(id);
    }
    return reached;
  };

  // ============== 1. Election ==============
  push({
    say: `Five servers start as followers in term 1. Each waits for its election timeout — ${
      randomized ? `a random value between ${T_MIN} and ${T_MAX} ms` : `the same ${IDENTICAL} ms on every server`
    } — to hear from a leader.`,
    why: [
      'A follower that hears nothing from a leader for a whole timeout assumes there isn’t one and stands for election. Heartbeats from a live leader keep resetting that timer.',
      'Terms number the elections. Every message carries the sender’s term, and a server that sees a higher term than its own updates to it immediately.',
    ],
  });

  const firstIds = [...IDS].sort((a, b) => S[a].timeout - S[b].timeout);
  const first = firstIds[0];
  push({
    say: 'Checkpoint — predict before any timer fires.',
    checkpoint: {
      kind: 'predict',
      prompt: 'Look at the timers. Which server stands for election first?',
      options: [...IDS, 'All five at once'],
      answer: randomized ? IDS.indexOf(first) : IDS.length,
      reveal: randomized
        ? `${first}: its timeout, ${fmtMs(S[first].timeout)}, is the shortest, so it gives up on hearing from a leader before anyone else does. Randomizing the timeouts is what makes one server go first.`
        : `All five. With identical timeouts every server gives up on the leader at the same instant, and every one of them becomes a candidate in the same term.`,
      source: RAFT,
    },
  });

  if (!randomized) {
    for (const round of [1, 2]) {
      t = IDENTICAL * round;
      const terms: number[] = [];
      for (const id of IDS) {
        S[id].term += 1;
        S[id].role = 'candidate';
        S[id].votedFor = id;
        S[id].firesAt = t + IDENTICAL;
        terms.push(S[id].term);
      }
      push({
        line: LN.timeout,
        vars: { term: String(terms[0]), votes: 'each voted for itself' },
        packets: IDS.flatMap((from, i) => send(from, IDS.filter((x) => x !== from), 'req', '', i * 40)),
        say: `${(t / 1000).toFixed(3)} s: every timer fires together. All five become candidates in term ${terms[0]} and each votes for itself.`,
      });
      push({
        line: LN.vote,
        vars: { granted: 'none — already voted this term' },
        packets: IDS.flatMap((from, i) => send(from, IDS.filter((x) => x !== from), 'nil', '', i * 40)),
        say: `Every vote request is refused: each server has already voted for itself in term ${terms[0]}. Nobody reaches 3 votes, and the timers start again — identical again.`,
      });
    }
    push({
      say: 'Checkpoint — fix it.',
      checkpoint: {
        kind: 'break',
        prompt: 'Two elections, two split votes, no leader. Nothing is broken in the voting rules. What is actually wrong?',
        reveal:
          'Symmetry. Servers that time out together all become candidates together, split the vote, and time out together again. Real networks add a little jitter that would eventually break the tie, but an election that relies on accident can stall for seconds. Raft randomizes each timeout so that one server almost always fires first, wins, and starts heartbeating before anyone else’s timer runs out.',
        source: RAFT,
        knob: { id: 'timeouts', value: 'randomized', label: 'Randomize the timeouts' },
      },
    });
    return frames;
  }

  // ---- first election ----
  t = S[first].timeout;
  const e1 = election(first);
  push({
    line: LN.timeout,
    vars: { term: String(S[first].term), votedFor: first },
    packets: send(first, IDS.filter((x) => x !== first), 'req', 'RequestVote'),
    say: `${(t / 1000).toFixed(3)} s: ${first}’s timer fires first. It moves to term ${S[first].term}, votes for itself, and asks the others.`,
    hot: IDS.filter((x) => x !== first),
  });

  t += RTT;
  if (e1.won) becomeLeader(first);
  push({
    line: LN.majority,
    vars: { votes: `${e1.granted.length + 1} of ${IDS.length}` },
    packets: send(first, e1.granted, 'ok', 'vote').map((p) => ({ ...p, dir: (p.dir * -1) as 1 | -1 })),
    say: `${list(e1.granted)} grant their vote — none has voted in term ${S[first].term} yet. With ${e1.granted.length + 1} of ${IDS.length}, ${first} is leader.`,
    why: [
      'Each server votes at most once per term, and a leader needs a majority. Two different majorities of five always share at least one server — so two leaders can never be elected in the same term.',
    ],
  });

  const L1 = first;
  heartbeat(L1);
  push({
    line: LN.replicate,
    packets: send(L1, IDS.filter((x) => x !== L1), 'req', 'heartbeat'),
    say: `${L1} immediately sends empty AppendEntries — heartbeats — and every follower’s timer resets before it can fire.`,
  });

  // ============== 2. Replication ==============
  clientWaiting = 'SET x=3 …';
  t += 1;
  S[L1].log.push({ term: S[L1].term, cmd: 'x=3', committed: false });
  push({
    line: LN.append,
    vars: { cmd: '"x=3"', index: '1' },
    packets: [{ edge: clientEdge(L1), dir: 1, kind: 'req', label: 'SET x=3' }],
    say: `A client sends SET x=3 to the leader. ${L1} appends it to its log at index 1 — not yet committed, so not yet applied.`,
  });

  const followers = IDS.filter((x) => x !== L1);
  const fast = failure === 'crash' ? (['S1', 'S4'] as Id[]) : followers;
  const slow = followers.filter((x) => !fast.includes(x));
  push({
    line: LN.replicate,
    packets: send(L1, followers, 'req', 'AppendEntries'),
    say: `${L1} sends the entry to every follower.${slow.length ? ` The copies to ${slow.join(' and ')} are delayed on the network.` : ''}`,
  });

  t += RTT;
  for (const id of fast) S[id].log = S[L1].log.map((e) => ({ ...e }));
  push({
    line: LN.commit,
    vars: { acks: `${fast.length} (${fast.join(', ')})` },
    packets: send(L1, fast, 'ok', 'ack').map((p) => ({ ...p, dir: (p.dir * -1) as 1 | -1 })),
    say: `${list(fast)} append it and acknowledge.${slow.length ? ` ${list(slow)} haven’t received it yet.` : ''}`,
  });

  push({
    say: 'Checkpoint — predict.',
    checkpoint: {
      kind: 'predict',
      prompt: `${fast.length} followers have acknowledged x=3${slow.length ? `; ${slow.join(' and ')} haven’t` : ''}. Can ${L1} commit it now?`,
      options: ['Yes', `No — it needs every follower`, 'No — it needs another heartbeat first'],
      answer: 0,
      reveal: `Yes. The entry is on ${fast.length + 1} of ${IDS.length} servers counting the leader itself — a majority — so it is committed. The leader applies it and answers the client; stragglers catch up later without changing the outcome. Waiting for all five would let one slow server stall every write.`,
      source: RAFT,
    },
  });

  S[L1].log[0].committed = true;
  clientWaiting = '';
  clientLast = 'x=3 OK';
  push({
    line: LN.commit,
    vars: { commitIndex: '1' },
    packets: [{ edge: clientEdge(L1), dir: -1, kind: 'ok', label: 'OK' }],
    say: `${L1} commits x=3, applies it, and replies OK. Followers will learn the commit index on the next heartbeat.`,
  });

  if (failure === 'crash') {
    // ============== 3a. The leader crashes ==============
    t += 1;
    S[L1].role = 'down';
    S[L1].firesAt = null;
    // Timers measured from the last heartbeat, which arrived moments before the crash.
    for (const id of IDS) {
      if (!up(id)) continue;
      S[id].timeout = DRAW_AFTER_CRASH[id];
      S[id].firesAt = t + DRAW_AFTER_CRASH[id];
    }
    push({
      say: `${L1} crashes — before the delayed copies reach ${slow.join(' and ')}, and before ${fast.join(' and ')} hear that x=3 committed. It is on ${fast.length + 1} of ${IDS.length} servers.`,
      why: [
        'Nothing tells the followers the leader died. They simply stop hearing heartbeats, and their election timers run down.',
        `${fast.join(' and ')} hold x=3 but still show it uncommitted: followers learn the commit index from the leader’s next AppendEntries, and there won’t be one.`,
      ],
      hot: slow,
    });

    const order = IDS.filter(up).sort((a, b) => (S[a].firesAt ?? Infinity) - (S[b].firesAt ?? Infinity));
    const c2 = order[0];
    push({
      say: 'Checkpoint — predict.',
      checkpoint: {
        kind: 'predict',
        prompt: `${c2}’s timer fires first. Its log is empty. Will ${c2} become the new leader?`,
        options: [`Yes — it asked first`, `No — too few servers are left`, `No — servers with x=3 refuse to vote for it`],
        answer: 2,
        reveal: `No. A server refuses its vote to any candidate whose log is less up to date than its own. ${fast.join(' and ')} hold x=3, so they refuse; ${c2} can collect at most ${IDS.filter(up).length - fast.length} votes, short of ${MAJORITY}. Four live servers are plenty for a majority — just not for this candidate.`,
        source: RAFT,
      },
    });

    t = S[c2].firesAt ?? t;
    const e2 = election(c2);
    push({
      line: LN.upToDate,
      vars: { granted: list(e2.granted) || 'none', refused: list(e2.refused.map((r) => r.id)) },
      packets: [
        ...send(c2, IDS.filter((x) => x !== c2 && up(x)), 'req', 'RequestVote'),
        ...e2.granted.map((id, i) => ({ edge: edgeId(c2, id), dir: dirOf(id, c2), kind: 'ok' as const, label: '', delay: 620 + i * 90 })),
        ...e2.refused.map((r, i) => ({ edge: edgeId(c2, r.id), dir: dirOf(r.id, c2), kind: 'nil' as const, label: '', delay: 620 + (e2.granted.length + i) * 90 })),
      ],
      say: `${c2} stands in term ${S[c2].term}. ${list(e2.granted) || 'Nobody'} votes for it; ${list(e2.refused.map((r) => r.id))} refuse — their logs are more up to date than ${c2}’s. ${e2.granted.length + 1} votes: no majority.`,
    });

    const order2 = IDS.filter((x) => up(x) && S[x].role === 'follower' && S[x].firesAt !== null && !e2.granted.includes(x)).sort(
      (a, b) => (S[a].firesAt ?? Infinity) - (S[b].firesAt ?? Infinity),
    );
    const c3 = order2[0];
    t = S[c3].firesAt ?? t;
    const e3 = election(c3);
    if (e3.won) becomeLeader(c3);
    push({
      line: LN.majority,
      vars: { votes: `${e3.granted.length + 1} of ${IDS.length}` },
      packets: [
        ...send(c3, IDS.filter((x) => x !== c3 && up(x)), 'req', 'RequestVote'),
        ...e3.granted.map((id, i) => ({ edge: edgeId(c3, id), dir: dirOf(id, c3), kind: 'ok' as const, label: '', delay: 620 + i * 90 })),
      ],
      say: `${fmtMs(t - frames[frames.length - 1].t)} later ${c3}’s timer fires. It stands in term ${S[c3].term}; its log holds x=3, so ${e3.granted.join(', ')} all grant. ${c3} is leader with ${e3.granted.length + 1} votes.`,
    });

    S[c3].log.push({ term: S[c3].term, cmd: 'nop', committed: false });
    for (const id of IDS) if (up(id) && id !== c3) S[id].log = S[c3].log.map((e) => ({ ...e }));
    push({
      line: LN.append,
      vars: { cmd: 'no-op', term: String(S[c3].term) },
      packets: send(c3, IDS.filter((x) => x !== c3 && up(x)), 'req', 'AppendEntries'),
      say: `${c3} appends a no-op in its own term, ${S[c3].term}, and sends its whole log. ${slow.join(' and ')} receive x=3 for the first time — from the new leader.`,
      why: [
        'A new leader can’t declare an entry from an earlier term committed just by counting copies — the paper’s Figure 8 shows a case where that loses data.',
        'Instead it commits an entry from its own term; everything before it in the log commits with it. That is why leaders begin every term with a no-op.',
      ],
    });

    t += RTT;
    S[c3].log.forEach((e) => (e.committed = true));
    heartbeat(c3);
    push({
      line: LN.commit,
      vars: { commitIndex: String(S[c3].log.length) },
      packets: send(c3, IDS.filter((x) => x !== c3 && up(x)), 'ok', 'ack').map((p) => ({ ...p, dir: (p.dir * -1) as 1 | -1 })),
      say: `A majority acknowledges, so ${c3} commits the no-op — and x=3, earlier in the log, commits with it; the heartbeat that follows tells every follower. The write the client was told succeeded survived the crash.`,
    });

    push({
      say: 'Checkpoint — why.',
      checkpoint: {
        kind: 'why',
        prompt: `Why is it guaranteed — not lucky — that the new leader had x=3?`,
        reveal: `x=3 was committed only once it was on a majority: ${[L1, ...fast].join(', ')}. To win, any candidate also needs a majority, and any two majorities of five overlap in at least one server. That overlapping server holds x=3 and refuses a candidate that lacks it. So every possible winner already has every committed entry — the election restriction turns “the majority overlaps” into “committed writes are never lost”.`,
        source: RAFT,
      },
    });
  } else {
    // ============== 3b. A partition isolates the leader ==============
    heartbeat(L1, DRAW_PARTITION);
    for (const id of IDS) S[id].log.forEach((e) => (e.committed = true));
    side = new Set<Id>([L1, 'S1']);
    t += 1;
    push({
      say: `One more heartbeat tells every follower x=3 is committed. Then a network partition splits the cluster: ${L1} and S1 on one side, S2, S3 and S4 on the other — all healthy, just unable to reach each other.`,
      why: [
        'This is the hard case for any replicated system: nothing has crashed, so nothing tells either side that the other still exists.',
      ],
    });

    clientWaiting = 'SET x=4 …';
    S[L1].log.push({ term: S[L1].term, cmd: 'x=4', committed: false });
    S.S1.log = S[L1].log.map((e) => ({ ...e }));
    push({
      line: LN.append,
      vars: { cmd: '"x=4"', index: '2' },
      packets: [{ edge: clientEdge(L1), dir: 1, kind: 'req', label: 'SET x=4' }, ...send(L1, ['S1'], 'req', 'AppendEntries', 520)],
      say: `The client sends SET x=4 to ${L1}, which still believes it is leader. It appends the entry and replicates it — but only S1 can hear it.`,
    });

    push({
      say: 'Checkpoint — predict.',
      checkpoint: {
        kind: 'predict',
        prompt: `${L1} is leader of term ${S[L1].term} and S1 has acknowledged x=4. Can ${L1} commit it?`,
        options: ['Yes — it is still the leader', 'No — it only has 2 of 5'],
        answer: 1,
        reveal: `No. Committing needs the entry on a majority — 3 of 5 — and ${L1} can reach only one other server. The write sits uncommitted and the client waits. A leader on the minority side of a partition can keep believing it is leader, but it cannot make anything durable.`,
        source: RAFT,
      },
    });

    const majSide = IDS.filter((x) => !side!.has(x)).sort((a, b) => (S[a].firesAt ?? Infinity) - (S[b].firesAt ?? Infinity));
    const c2 = majSide[0];
    t = S[c2].firesAt ?? t;
    const e2 = election(c2);
    if (e2.won) becomeLeader(c2);
    push({
      line: LN.majority,
      vars: { votes: `${e2.granted.length + 1} of ${IDS.length}` },
      packets: [
        ...send(c2, majSide.filter((x) => x !== c2), 'req', 'RequestVote'),
        ...e2.granted.map((id, i) => ({ edge: edgeId(c2, id), dir: dirOf(id, c2), kind: 'ok' as const, label: '', delay: 620 + i * 90 })),
      ],
      say: `On the majority side, heartbeats stopped. ${c2}’s timer fires; it stands in term ${S[c2].term} and wins ${e2.granted.length + 1} of ${IDS.length} votes. The cluster now has two servers that think they lead — in different terms.`,
    });

    clientWaiting = '';
    t += 1;
    S[c2].log.push({ term: S[c2].term, cmd: 'x=4', committed: false });
    for (const id of majSide) if (id !== c2) S[id].log = S[c2].log.map((e) => ({ ...e }));
    S[c2].log[S[c2].log.length - 1].committed = true;
    clientLast = 'x=4 OK';
    push({
      line: LN.commit,
      vars: { acks: `${majSide.length - 1}`, commitIndex: String(S[c2].log.length) },
      packets: [
        { edge: clientEdge(c2), dir: 1, kind: 'req', label: 'SET x=4 (retry)' },
        ...send(c2, majSide.filter((x) => x !== c2), 'req', 'AppendEntries', 520),
      ],
      say: `The client’s request to ${L1} times out, so it retries against ${c2}. With three servers, ${c2} commits x=4 in term ${S[c2].term} and replies OK.`,
    });

    push({
      say: 'Checkpoint — predict.',
      checkpoint: {
        kind: 'predict',
        prompt: `The partition heals. What happens to the x=4 that ${L1} appended in term 2?`,
        options: ['It is kept — it was written first', `It is replaced by ${c2}’s entry from term ${S[c2].term}`, 'Both copies are kept'],
        answer: 1,
        reveal: `Replaced. ${L1} sees term ${S[c2].term}, steps down, and accepts ${c2}’s log; where the two disagree at index 2, the leader’s entry wins and the uncommitted one is discarded. That is safe because it was never committed and the client was never told it succeeded — which is also why the client had to retry, and why that retry should carry an idempotency key.`,
        source: RAFT,
      },
    });

    side = null;
    for (const id of [L1, 'S1'] as Id[]) {
      stepDown(S[id], S[c2].term);
      S[id].log[1] = { ...S[id].log[1], discarded: true };
    }
    push({
      line: LN.stepDown,
      vars: { term: String(S[c2].term), from: c2 },
      packets: send(c2, [L1, 'S1'], 'req', 'heartbeat'),
      say: `${c2}’s heartbeat reaches ${L1} and S1 carrying term ${S[c2].term}. ${L1} steps down to follower on sight; both find their index-2 entry conflicts with the leader’s.`,
    });

    for (const id of [L1, 'S1'] as Id[]) S[id].log = S[c2].log.map((e) => ({ ...e }));
    heartbeat(c2);
    push({
      line: LN.replicate,
      packets: send(c2, [L1, 'S1'], 'req', 'AppendEntries'),
      say: `The conflicting entries are overwritten with the leader’s. All five logs are identical again, and no committed write was lost.`,
    });

    push({
      say: 'Checkpoint — why.',
      checkpoint: {
        kind: 'why',
        prompt: `During the partition, the client talking to ${L1} got no answer at all. Isn’t that an availability failure?`,
        reveal: `Yes, deliberately. The minority side refuses to commit rather than accept a write it can’t make durable, so its clients see timeouts until they reach the majority. That is the trade a consensus protocol makes during a partition: the side without a majority gives up availability so that the system never gives two different answers. A design that must keep accepting writes on both sides needs a different tool — and conflict resolution afterwards.`,
        source: RAFT,
      },
    });
  }

  return frames;
}

const NODE = { w: 128, h: 110 };
const at = (x: number, y: number) => ({ x, y, ...NODE });

export const raft: Scenario = {
  id: 'raft',
  topic: 'availability-patterns',
  title: 'Raft: election and replication',
  summary: 'Five servers elect a leader, commit a write on a majority, then lose the leader — or get partitioned — without losing it.',
  stage: {
    width: 648,
    height: 362,
    nodes: [
      { id: 'client', label: 'client', x: 16, y: 146, w: 116, h: 44 },
      { id: 'S1', label: 'S1', ...at(366, 4) },
      { id: 'S2', label: 'S2', ...at(510, 100) },
      { id: 'S3', label: 'S3', ...at(456, 248) },
      { id: 'S4', label: 'S4', ...at(276, 248) },
      { id: 'S5', label: 'S5', ...at(222, 100) },
    ],
    edges: [
      { id: 'client-S5', from: 'client', to: 'S5', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.6 } },
      { id: 'client-S4', from: 'client', to: 'S4', fromPort: { side: 'b', at: 0.5 }, toPort: { side: 'l', at: 0.5 }, via: [[74, 303]] },
      { id: 'S1-S2', from: 'S1', to: 'S2', fromPort: { side: 'r', at: 0.6 }, toPort: { side: 't', at: 0.5 }, quiet: true },
      { id: 'S1-S5', from: 'S1', to: 'S5', fromPort: { side: 'l', at: 0.85 }, toPort: { side: 't', at: 0.7 }, quiet: true },
      { id: 'S1-S3', from: 'S1', to: 'S3', fromPort: { side: 'b', at: 0.65 }, toPort: { side: 't', at: 0.35 }, quiet: true },
      { id: 'S1-S4', from: 'S1', to: 'S4', fromPort: { side: 'b', at: 0.35 }, toPort: { side: 't', at: 0.65 }, quiet: true },
      { id: 'S2-S3', from: 'S2', to: 'S3', fromPort: { side: 'b', at: 0.5 }, toPort: { side: 't', at: 0.85 }, quiet: true },
      { id: 'S2-S4', from: 'S2', to: 'S4', fromPort: { side: 'l', at: 0.8 }, toPort: { side: 'r', at: 0.25 }, quiet: true },
      { id: 'S2-S5', from: 'S2', to: 'S5', fromPort: { side: 'l', at: 0.35 }, toPort: { side: 'r', at: 0.35 }, quiet: true },
      { id: 'S3-S4', from: 'S3', to: 'S4', fromPort: { side: 'l', at: 0.6 }, toPort: { side: 'r', at: 0.6 }, quiet: true },
      { id: 'S3-S5', from: 'S3', to: 'S5', fromPort: { side: 'l', at: 0.25 }, toPort: { side: 'r', at: 0.8 }, quiet: true },
      { id: 'S4-S5', from: 'S4', to: 'S5', fromPort: { side: 't', at: 0.2 }, toPort: { side: 'b', at: 0.55 }, quiet: true },
    ],
  },
  knobs: [
    {
      id: 'failure',
      kind: 'choice',
      label: 'then',
      default: 'crash',
      options: [
        { value: 'crash', label: 'the leader crashes' },
        { value: 'partition', label: 'a partition' },
      ],
    },
    {
      id: 'timeouts',
      kind: 'choice',
      label: 'timeouts',
      default: 'randomized',
      options: [
        { value: 'randomized', label: 'randomized' },
        { value: 'identical', label: 'identical' },
      ],
    },
  ],
  source,
  run,
};
