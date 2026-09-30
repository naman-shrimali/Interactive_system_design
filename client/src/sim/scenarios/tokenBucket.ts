import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Packet, Row, Scenario, Tone } from '../types';
import { factMs, fmtMs } from '../facts';
import { burst, lineOf } from '../kit';

/*
 * Token bucket — then two gateways.
 *
 * A guided progression, one knob value per stage: a single gateway enforces
 * the limit; a second gateway with its own bucket doubles it; a shared Redis
 * counter updated with GET-then-SET still doubles it (lost updates); an atomic
 * script finally holds it. Every admitted/rejected count is computed by
 * running the buckets below, including the exact interleaving of the race.
 */

const RTT = factMs('datacenter-round-trip');
const CAPACITY = 5;
const RATE = 5; // tokens per second
const BURST = 10;
// fact-exempt: when the follow-up request arrives, a scenario parameter
const LATER = 400;

type Setup = 'one' | 'two-local' | 'two-shared' | 'two-atomic';
const NEXT: Record<Setup, { value: Setup; label: string } | null> = {
  one: { value: 'two-local', label: 'Add a second gateway' },
  'two-local': { value: 'two-shared', label: 'Share one counter in Redis' },
  'two-shared': { value: 'two-atomic', label: 'Make check-and-take atomic' },
  'two-atomic': null,
};

const HEADER = [
  `const CAPACITY = ${CAPACITY};   // burst size`,
  `const RATE = ${RATE};       // tokens per second`,
  ``,
];

const source = (k: KnobValues): string[] => {
  const setup = (k.setup as Setup) ?? 'one';
  if (setup === 'one' || setup === 'two-local') {
    return [
      ...HEADER,
      `const buckets = new Map(); // in THIS gateway's memory`,
      ``,
      `function allow(clientId, now) {`,
      `  const b = buckets.get(clientId)`,
      `    ?? { tokens: CAPACITY, last: now };`,
      `  const refill = (now - b.last) / 1000 * RATE;`,
      `  b.tokens = Math.min(CAPACITY, b.tokens + refill);`,
      `  b.last = now;`,
      `  buckets.set(clientId, b);`,
      `  if (b.tokens < 1) return false;   // 429`,
      `  b.tokens -= 1;`,
      `  return true;`,
      `}`,
    ];
  }
  if (setup === 'two-shared') {
    return [
      ...HEADER,
      `async function allow(clientId, now) {`,
      `  const key = \`rl:\${clientId}\`;`,
      `  const b = JSON.parse(await redis.get(key))  // read`,
      `    ?? { tokens: CAPACITY, last: now };`,
      `  const refill = (now - b.last) / 1000 * RATE;`,
      `  b.tokens = Math.min(CAPACITY, b.tokens + refill);`,
      `  b.last = now;`,
      `  if (b.tokens < 1) return false;   // 429`,
      `  b.tokens -= 1;`,
      `  await redis.set(key, JSON.stringify(b));  // write`,
      `  return true;`,
      `}`,
    ];
  }
  return [
    ...HEADER,
    `// Runs inside Redis. Nothing interleaves with a script.`,
    `const TAKE = \``,
    `  local b = cjson.decode(redis.call('GET', KEYS[1]) or '{}')`,
    `  local now = tonumber(ARGV[1])`,
    `  local t = math.min(${CAPACITY}, (b.tokens or ${CAPACITY})`,
    `    + (now - (b.last or now)) / 1000 * ${RATE})`,
    `  if t < 1 then return 0 end`,
    `  redis.call('SET', KEYS[1], cjson.encode({ tokens = t - 1, last = now }))`,
    `  return 1\`;`,
    ``,
    `async function allow(clientId, now) {`,
    `  const ok = await redis.eval(TAKE, 1, \`rl:\${clientId}\`, now);`,
    `  return ok === 1;`,
    `}`,
  ];
};

type G = 'g1' | 'g2';

function run(k: KnobValues): Frame[] {
  const setup = (k.setup as Setup) ?? 'one';
  const two = setup !== 'one';
  const shared = setup === 'two-shared' || setup === 'two-atomic';
  const src = source(k);
  const at = (a: string) => lineOf(src, a);

  // ---- the model ----
  let t = 0;
  const local: Record<G, number> = { g1: CAPACITY, g2: CAPACITY };
  let redisTokens = CAPACITY;
  const admitted: Record<G, number> = { g1: 0, g2: 0 };
  const rejected: Record<G, number> = { g1: 0, g2: 0 };
  let apiReceived = 0;
  let redisCalls = 0;
  let burstPassed = -1;
  const hot = new Set<string>();

  const slots = (label: string, filled: number, tone: Tone): Row => ({
    kind: 'slots',
    label,
    total: CAPACITY,
    filled: Math.max(0, Math.floor(filled + 1e-9)),
    tone,
  });
  const tokenText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  const gateway = (g: G): NodeState => {
    if (!two && g === 'g2') return { tone: 'dim', rows: [{ kind: 'kv', label: 'not deployed', tone: 'dim' }] };
    const rows: Row[] = shared
      ? [{ kind: 'kv', label: 'bucket', value: 'in Redis', tone: 'dim' }]
      : [slots(`tokens ${tokenText(local[g])}/${CAPACITY}`, local[g], local[g] < 1 ? 'warn' : 'ok')];
    rows.push(
      { kind: 'kv', label: 'passed', value: String(admitted[g]), tone: admitted[g] ? 'ok' : 'dim' },
      { kind: 'kv', label: '429s', value: String(rejected[g]), tone: rejected[g] ? 'warn' : 'dim' },
    );
    return { tone: hot.has(g) ? 'active' : 'idle', rows };
  };

  const nodes = (): Record<string, NodeState> => ({
    client: { badge: apiReceived + rejected.g1 + rejected.g2 > 0 ? `${apiReceived} ok` : undefined, badgeTone: 'ok' },
    lb: { tone: hot.has('lb') ? 'active' : 'idle', sub: two ? 'round robin' : 'one target' },
    g1: gateway('g1'),
    g2: gateway('g2'),
    redis: shared
      ? {
          tone: hot.has('redis') ? 'active' : 'idle',
          rows: [
            slots(`rl:client  ${tokenText(redisTokens)}`, redisTokens, redisTokens < 1 ? 'warn' : 'ok'),
            { kind: 'kv', label: 'commands', value: String(redisCalls), tone: redisCalls ? 'idle' : 'dim' },
          ],
        }
      : { tone: 'dim', rows: [{ kind: 'kv', label: 'not in use', tone: 'dim' }] },
    api: {
      tone: apiReceived > CAPACITY ? 'warn' : hot.has('api') ? 'active' : 'idle',
      rows: [
        { kind: 'kv', label: 'received', value: String(apiReceived), tone: apiReceived > CAPACITY ? 'warn' : apiReceived ? 'ok' : 'dim' },
        { kind: 'kv', label: 'promised', value: `≤ ${CAPACITY}`, tone: 'dim' },
      ],
    },
  });

  const metrics = (): Metric[] => [
    { label: 'Reached the API', value: String(apiReceived), tone: apiReceived > CAPACITY ? 'warn' : apiReceived ? 'ok' : 'idle' },
    { label: 'Rejected (429)', value: String(rejected.g1 + rejected.g2) },
    { label: 'Redis commands', value: shared ? String(redisCalls) : '—' },
    { label: 'Clock', value: `${(t / 1000).toFixed(3)} s` },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics'>) => {
    frames.push({ ...f, t, nodes: nodes(), metrics: metrics() });
    hot.clear();
  };

  const target = (i: number): G => (two && i % 2 === 1 ? 'g2' : 'g1');
  const perGateway = (g: G) => Array.from({ length: BURST }, (_, i) => i).filter((i) => target(i) === g).length;

  // ---- 0. setting ----
  push({
    say: `One client sends ${BURST} requests at once. The limit is ${RATE} per second with bursts of up to ${CAPACITY}: a token bucket holding ${CAPACITY} tokens, refilled at ${RATE} a second.`,
    why: [
      'Each request takes a token; with none left it gets a 429. Tokens drip back at a fixed rate, so a client can burst up to the bucket size and is then held to the refill rate.',
      'The refill is computed lazily from elapsed time when a request arrives. Nothing ticks in the background, which is why the whole limiter is a few lines and no timer.',
    ],
  });

  // ---- 1. predict ----
  // Run the model ahead so the prediction's answer is the one the scenario will show.
  const outcome = simulate(setup);
  const predict: Checkpoint = {
    kind: 'predict',
    prompt: two
      ? `${BURST} requests arrive together and the load balancer alternates them between two gateways. How many reach the API?`
      : `${BURST} requests arrive together at a gateway whose bucket holds ${CAPACITY} tokens. How many reach the API?`,
    options: [`${CAPACITY}`, `${BURST}`, `Between ${CAPACITY} and ${BURST}`],
    answer: outcome === CAPACITY ? 0 : outcome === BURST ? 1 : 2,
    reveal: {
      one: `${CAPACITY}. The bucket starts full with ${CAPACITY} tokens; the first ${CAPACITY} requests take them and the rest find it empty. That is the burst allowance working as designed.`,
      'two-local': `${BURST}. Each gateway has its own full bucket and sees only half the traffic — ${perGateway('g1')} requests each — so neither runs out. The client got twice the limit without doing anything unusual.`,
      'two-shared': `${BURST}, even with one shared counter. Requests arrive at both gateways at the same moment; both read the same token count before either writes back, so each pair of requests spends one token and passes twice.`,
      'two-atomic': `${CAPACITY}. The check and the decrement run as one script inside Redis, which executes scripts one at a time, so every request sees the count the previous one left.`,
    }[setup],
    source: setup === 'two-atomic' || setup === 'two-shared' ? { title: 'Redis documentation', url: 'https://redis.io/docs/latest/' } : undefined,
  };
  push({ say: 'Checkpoint — predict before the burst lands.', checkpoint: predict });

  // ---- 2. the burst arrives ----
  t = 1000;
  hot.add('lb');
  push({
    packets: [
      ...burst(BURST, 'client-lb', 1, 'req', 0, 50),
      ...burst(perGateway('g1'), 'lb-g1', 1, 'req', 480, 70),
      ...(two ? burst(perGateway('g2'), 'lb-g2', 1, 'req', 515, 70) : []),
    ],
    say: two
      ? `t = 1.000 s. The burst arrives and the load balancer alternates: ${perGateway('g1')} requests to gateway 1, ${perGateway('g2')} to gateway 2.`
      : `t = 1.000 s. The burst arrives; every request goes to the one gateway.`,
  });

  // ---- 3+. the gateways decide ----
  if (!shared) {
    const passed: Record<G, number> = { g1: 0, g2: 0 };
    for (let i = 0; i < BURST; i++) {
      const g = target(i);
      if (local[g] >= 1) {
        local[g] -= 1;
        passed[g]++;
      } else rejected[g]++;
    }
    admitted.g1 = passed.g1;
    admitted.g2 = passed.g2;
    apiReceived = passed.g1 + passed.g2;
    burstPassed = apiReceived;
    hot.add('g1').add('api');
    if (two) hot.add('g2');
    push({
      line: at('if (b.tokens < 1)'),
      vars: two
        ? { 'gateway 1': `${passed.g1} passed, tokens 0`, 'gateway 2': `${passed.g2} passed, tokens 0` }
        : { passed: String(passed.g1), rejected: String(rejected.g1) },
      packets: [
        ...burst(passed.g1, 'g1-api', 1, 'ok', 0, 70),
        ...(two ? burst(passed.g2, 'g2-api', 1, 'ok', 35, 70) : []),
        ...burst(rejected.g1, 'lb-g1', -1, 'fail', 0, 70),
        ...(two ? burst(rejected.g2, 'lb-g2', -1, 'fail', 35, 70) : []),
      ],
      say: two
        ? `Each gateway checks only its own bucket. Neither runs dry, so all ${apiReceived} requests reach the API — twice the limit.`
        : `The first ${passed.g1} requests each take a token and pass; the other ${rejected.g1} find the bucket empty and get 429.`,
    });

    if (!two) {
      t += LATER;
      const refill = (LATER / 1000) * RATE;
      local.g1 = Math.min(CAPACITY, local.g1 + refill);
      local.g1 -= 1;
      admitted.g1++;
      apiReceived++;
      hot.add('g1').add('api');
      push({
        line: at('const refill ='),
        vars: { elapsed: `${fmtMs(LATER)}`, refill: `${LATER / 1000} × ${RATE} = ${refill} tokens` },
        packets: [
          { edge: 'client-lb', dir: 1, kind: 'req', label: 'GET' },
          { edge: 'lb-g1', dir: 1, kind: 'req', delay: 420 },
          { edge: 'g1-api', dir: 1, kind: 'ok', delay: 840 },
        ],
        say: `${fmtMs(LATER)} later another request arrives. The refill is computed on the spot — ${LATER / 1000} s × ${RATE}/s = ${refill} tokens — so it passes and leaves ${tokenText(local.g1)}.`,
      });
    }
  } else if (setup === 'two-shared') {
    // Requests arrive in simultaneous pairs, one per gateway. Both read before
    // either writes, so both see the same count and both write count − 1.
    const pair = (): void => {
      const seen = redisTokens;
      redisCalls += 4;
      if (seen >= 1) {
        admitted.g1++;
        admitted.g2++;
        apiReceived += 2;
        redisTokens = seen - 1; // both writes store the same value
      } else {
        rejected.g1++;
        rejected.g2++;
      }
    };

    // The first pair, shown command by command.
    const seen = redisTokens;
    redisCalls += 2;
    hot.add('g1').add('g2').add('redis');
    push({
      line: at('await redis.get(key)'),
      vars: { 'gateway 1 reads': String(seen), 'gateway 2 reads': String(seen) },
      packets: [
        { edge: 'g1-redis', dir: 1, kind: 'req', label: 'GET' },
        { edge: 'g2-redis', dir: 1, kind: 'req', label: 'GET', delay: 40 },
        { edge: 'g1-redis', dir: -1, kind: 'ok', delay: 520 },
        { edge: 'g2-redis', dir: -1, kind: 'ok', delay: 560 },
      ],
      say: `The first two requests reach the gateways at the same moment. Both GET the counter — and both read ${seen}.`,
    });
    t += RTT;
    redisCalls += 2;
    admitted.g1++;
    admitted.g2++;
    apiReceived += 2;
    redisTokens = seen - 1;
    hot.add('g1').add('g2').add('redis').add('api');
    push({
      line: at('await redis.set(key'),
      vars: { 'gateway 1 writes': String(seen - 1), 'gateway 2 writes': String(seen - 1), 'should be': String(seen - 2) },
      packets: [
        { edge: 'g1-redis', dir: 1, kind: 'req', label: `SET ${seen - 1}` },
        { edge: 'g2-redis', dir: 1, kind: 'req', delay: 40 },
        { edge: 'g1-api', dir: 1, kind: 'ok', delay: 480 },
        { edge: 'g2-api', dir: 1, kind: 'ok', delay: 520 },
      ],
      say: `Each decides a token is available, lets its request through, and writes ${seen - 1}. Two requests passed; one token was spent. The second write silently overwrote the first.`,
      why: [
        'This is a lost update. GET and SET are two commands, and another client can run between them — here, the other gateway reading the same value.',
        'Moving state to a shared store only helps if the read, the decision and the write happen as one operation.',
      ],
    });

    // The remaining pairs race the same way.
    const reads: number[] = [];
    for (let p = 1; p < BURST / 2; p++) {
      reads.push(redisTokens);
      t += RTT;
      pair();
    }
    burstPassed = apiReceived;
    hot.add('g1').add('g2').add('redis').add('api');
    push({
      line: at('return true'),
      vars: { passed: String(apiReceived), 'tokens left': tokenText(redisTokens) },
      packets: [...burst(BURST / 2 - 1, 'g1-api', 1, 'ok', 0, 90), ...burst(BURST / 2 - 1, 'g2-api', 1, 'ok', 45, 90)],
      say: `The next ${reads.length} pairs race the same way, reading ${reads.join(', ').replace(/, (\d+)$/, ' and $1')}. ${
        apiReceived === BURST ? `All ${apiReceived}` : apiReceived
      } requests pass, and the shared bucket ends at ${tokenText(redisTokens)} — as if it had been enforced.`,
    });
  } else {
    // Atomic: Redis runs one script at a time, in arrival order.
    const replies: number[] = [];
    for (let i = 0; i < BURST; i++) {
      redisCalls++;
      if (redisTokens >= 1) {
        redisTokens -= 1;
        replies.push(1);
      } else replies.push(0);
    }
    t += RTT;
    hot.add('g1').add('g2').add('redis');
    push({
      line: at('redis.eval(TAKE'),
      vars: { replies: replies.join(' ') },
      packets: [
        ...burst(BURST / 2, 'g1-redis', 1, 'req', 0, 80),
        ...burst(BURST / 2, 'g2-redis', 1, 'req', 40, 80),
        ...replies.map((r, i): Packet => ({ edge: target(i) === 'g1' ? 'g1-redis' : 'g2-redis', dir: -1, kind: r ? 'ok' : 'nil', delay: 520 + i * 40 })),
      ],
      say: `Each gateway sends the script. Redis runs them one after another: the first ${replies.filter(Boolean).length} return 1, the rest return 0.`,
    });
    replies.forEach((r, i) => {
      const g = target(i);
      if (r) {
        admitted[g]++;
        apiReceived++;
      } else rejected[g]++;
    });
    burstPassed = apiReceived;
    t += RTT;
    hot.add('g1').add('g2').add('api');
    push({
      line: at('return ok === 1'),
      packets: [
        ...burst(admitted.g1, 'g1-api', 1, 'ok', 0, 90),
        ...burst(admitted.g2, 'g2-api', 1, 'ok', 45, 90),
        ...burst(rejected.g1, 'lb-g1', -1, 'fail', 0, 90),
        ...burst(rejected.g2, 'lb-g2', -1, 'fail', 45, 90),
      ],
      say: `${apiReceived} requests reach the API and ${rejected.g1 + rejected.g2} get 429 — the limit holds across both gateways. Each check cost one round trip to Redis, about ${fmtMs(RTT)}.`,
    });
  }

  // The prediction was answered by simulate(); the run must agree with it.
  if (burstPassed !== outcome) {
    throw new Error(`token-bucket/${setup}: run passed ${burstPassed}, prediction assumed ${outcome}`);
  }

  // ---- closing checkpoint ----
  const next = NEXT[setup];
  const closing: Checkpoint = next
    ? {
        kind: 'break',
        prompt: {
          one: 'One gateway is a single point of failure. Run two behind the load balancer, keeping the same code. What happens to the limit?',
          'two-local': `The API was promised at most ${CAPACITY} from this client and received ${apiReceived}. Where does the limit actually live, and how would you fix it?`,
          'two-shared': 'The counter is shared now, and the client still got through twice the limit. What is wrong with the code, not the architecture?',
          'two-atomic': '',
        }[setup],
        reveal: {
          one: `With N gateways and a bucket in each process's memory, the effective limit becomes N times the configured one, because each gateway sees only its share of the traffic. Adding capacity for availability quietly raised the limit.`,
          'two-local': `In each process's memory, so the effective limit scales with the number of gateways — and changes every time the fleet scales. The limit has to live somewhere every gateway consults: a shared store such as Redis, keyed by client.`,
          'two-shared': `GET, decide, SET is a read-modify-write across the network, and nothing stops the other gateway reading the same value in between. Redis runs a Lua script atomically — no other command executes while it runs — so putting the check and the decrement in one script closes the gap.`,
          'two-atomic': '',
        }[setup],
        source:
          setup === 'two-shared'
            ? { title: 'Redis documentation', url: 'https://redis.io/docs/latest/' }
            : { title: 'Google SRE Book — Addressing Cascading Failures', url: 'https://sre.google/sre-book/addressing-cascading-failures/' },
        knob: { id: 'setup', value: next.value, label: next.label },
      }
    : {
        kind: 'why',
        prompt: 'Every request now depends on Redis. When Redis is unreachable, should the limiter fail open or fail closed?',
        reveal: `It depends on what the limiter protects. Guarding a fragile downstream, fail closed: letting unlimited traffic through takes down what the limiter exists to defend. Throttling casual abuse in front of a robust service, fail open: a cache outage should not become a full API outage. Either way, decide it explicitly and bound the call with a short timeout, because the limiter now adds a ${fmtMs(RTT)} round trip to every request and can become the thing that is down.`,
        source: { title: 'Google SRE Book — Addressing Cascading Failures', url: 'https://sre.google/sre-book/addressing-cascading-failures/' },
      };
  push({ say: next ? 'Checkpoint — scale it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

/** How many of the burst reach the API under a setup — the same rules as run(). */
function simulate(setup: Setup): number {
  if (setup === 'one') return Math.min(BURST, CAPACITY);
  if (setup === 'two-local') return Math.min(BURST / 2, CAPACITY) * 2;
  if (setup === 'two-atomic') return Math.min(BURST, CAPACITY);
  let tokens = CAPACITY;
  let passed = 0;
  for (let p = 0; p < BURST / 2; p++) {
    if (tokens >= 1) {
      passed += 2;
      tokens -= 1;
    }
  }
  return passed;
}

export const tokenBucket: Scenario = {
  id: 'token-bucket',
  topic: 'rate-limiter',
  title: 'Token bucket, then two gateways',
  summary: 'A burst against one gateway, then two — and why a shared counter still leaks until the check and the take are one atomic step.',
  stage: {
    width: 648,
    height: 350,
    nodes: [
      { id: 'client', label: 'client', x: 16, y: 152, w: 112, h: 44 },
      { id: 'lb', label: 'load balancer', x: 150, y: 146, w: 118, h: 56 },
      { id: 'g1', label: 'gateway 1', x: 292, y: 8, w: 168, h: 112 },
      { id: 'redis', label: 'REDIS', x: 292, y: 128, w: 168, h: 94 },
      { id: 'g2', label: 'gateway 2', x: 292, y: 232, w: 168, h: 112 },
      { id: 'api', label: 'API', x: 500, y: 126, w: 132, h: 96 },
    ],
    edges: [
      { id: 'client-lb', from: 'client', to: 'lb', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.5 } },
      { id: 'lb-g1', from: 'lb', to: 'g1', fromPort: { side: 'r', at: 0.3 }, toPort: { side: 'l' }, via: [[280, 163], [280, 64]] },
      { id: 'lb-g2', from: 'lb', to: 'g2', fromPort: { side: 'r', at: 0.7 }, toPort: { side: 'l' }, via: [[280, 185], [280, 288]] },
      { id: 'g1-redis', from: 'g1', to: 'redis', fromPort: { side: 'b' }, toPort: { side: 't' } },
      { id: 'g2-redis', from: 'g2', to: 'redis', fromPort: { side: 't' }, toPort: { side: 'b' } },
      { id: 'g1-api', from: 'g1', to: 'api', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.3 }, via: [[480, 64], [480, 155]] },
      { id: 'g2-api', from: 'g2', to: 'api', fromPort: { side: 'r' }, toPort: { side: 'l', at: 0.7 }, via: [[480, 288], [480, 193]] },
    ],
  },
  knobs: [
    {
      id: 'setup',
      kind: 'choice',
      label: 'setup',
      default: 'one',
      options: [
        { value: 'one', label: '1 gateway' },
        { value: 'two-local', label: '2 gateways, own buckets' },
        { value: 'two-shared', label: '2, shared: GET then SET' },
        { value: 'two-atomic', label: '2, shared: atomic script' },
      ],
    },
  ],
  source,
  run,
};
