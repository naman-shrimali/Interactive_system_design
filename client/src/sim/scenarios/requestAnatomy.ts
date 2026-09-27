import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Scenario } from '../types';
import { factMs, fmtMs } from '../facts';

/*
 * Anatomy of a request.
 *
 * One HTTPS request from a user on one continent to an origin on another,
 * timed hop by hop. The lesson is where the time goes: into round trips whose
 * cost is set by distance, not into the server. The knobs move the handshakes
 * closer (a CDN edge), reuse a connection, and make the response cacheable.
 *
 * Model (all round-trip times from content/facts.json):
 *   L  last mile, user ↔ nearest ISP node / edge in the user's city
 *   B  across the ocean, user's region ↔ origin region
 *   D  inside the origin datacenter
 * A direct user ↔ origin round trip is L + B — the last mile is part of that path.
 */

const L = factMs('last-mile-round-trip');
const B = factMs('cross-continent-round-trip');
const D = factMs('datacenter-round-trip');

type Route = 'direct' | 'cdn';

const HOST = 'app.example.com';

const source = (k: KnobValues): string[] => {
  const cdn = k.route === 'cdn';
  const lines = [
    `// browser`,
    `async function load(url) {`,
    `  const ip = await dns.resolve(url.host); // ${cdn ? 'nearest edge (anycast)' : 'the origin'}`,
    `  const conn = pool.get(ip) ?? await connect(ip);`,
    `  //   connect(): TCP handshake      — 1 round trip`,
    `  //              TLS 1.3 handshake  — 1 round trip`,
    `  return conn.request('GET', url.path); // 1 round trip`,
    `}`,
    ``,
  ];
  if (cdn) {
    lines.push(
      `// CDN edge, in the user's city`,
      `async function edge(req) {`,
      `  if (cacheable(req) && cache.has(req.url)) return cache.get(req.url);`,
      `  return originPool.request(req); // already open, already encrypted`,
      `}`,
      ``,
    );
  }
  lines.push(
    `// origin, on another continent`,
    `async function handle(req) {`,
    `  const hit = await redis.get(req.key); // same datacenter`,
    `  return hit ?? render(req);`,
    `}`,
  );
  return lines;
};

function lineOf(src: string[], anchor: string): { n: number; anchor: string } {
  const i = src.findIndex((l) => l.includes(anchor));
  if (i < 0) throw new Error(`anchor "${anchor}" not in source`);
  return { n: i + 1, anchor };
}

function run(k: KnobValues): Frame[] {
  const route = (k.route as Route) ?? 'direct';
  const cdn = route === 'cdn';
  const warm = k.warm === true;
  const cacheable = cdn && k.cacheable === true;
  const src = source(k);
  const at = (a: string) => lineOf(src, a);

  // Round trip to whichever box terminates the client's connection.
  const toEndpoint = cdn ? L : L + B;
  const endpoint = cdn ? 'edge' : 'origin';

  // ---- model ----
  let t = 0;
  const ledger = { dns: '—', handshake: '—', request: '—' };
  const st = {
    dnsCached: warm,
    connOpen: warm,
    resolver: '' as string,
    auth: '' as string,
    edgeTls: warm && cdn,
    edgeCache: '' as '' | 'HIT' | 'MISS',
    served: '' as string,
    redis: '' as string,
    active: new Set<string>(),
  };

  const nodes = (): Record<string, NodeState> => ({
    user: {
      tone: st.active.has('user') ? 'active' : 'idle',
      rows: [
        { kind: 'kv', label: 'dns', value: st.dnsCached ? 'cached' : 'empty', tone: st.dnsCached ? 'ok' : 'dim' },
        { kind: 'kv', label: 'conn', value: st.connOpen ? `open → ${endpoint}` : 'none', tone: st.connOpen ? 'ok' : 'dim' },
      ],
    },
    resolver: { badge: st.resolver || undefined, badgeTone: st.resolver === 'cached' ? 'ok' : 'active', tone: st.active.has('resolver') ? 'active' : 'idle' },
    auth: { badge: st.auth || undefined, badgeTone: 'ok', tone: st.active.has('auth') ? 'active' : 'idle' },
    edge: cdn
      ? {
          tone: st.active.has('edge') ? 'active' : 'idle',
          rows: [
            { kind: 'kv', label: 'tls', value: st.edgeTls ? 'terminated here' : '—', tone: st.edgeTls ? 'ok' : 'dim' },
            { kind: 'kv', label: 'to origin', value: 'pooled, warm', tone: 'idle' },
            { kind: 'kv', label: 'cache', value: st.edgeCache || '—', tone: st.edgeCache === 'HIT' ? 'ok' : st.edgeCache ? 'warn' : 'dim' },
          ],
        }
      : { tone: 'dim', rows: [{ kind: 'kv', label: 'not in the path', tone: 'dim' }] },
    origin: {
      tone: st.active.has('origin') ? 'active' : 'idle',
      sub: `${fmtMs(B)} RTT from Europe`,
      rows: [{ kind: 'kv', label: 'handled in', value: st.served || '—', tone: st.served ? 'ok' : 'dim' }],
    },
    redis: { badge: st.redis || undefined, badgeTone: 'ok', tone: st.active.has('redis') ? 'active' : 'idle' },
  });

  const metrics = (): Metric[] => [
    { label: 'DNS', value: ledger.dns, tone: ledger.dns === 'cached' ? 'ok' : 'idle' },
    { label: 'TCP + TLS', value: ledger.handshake, tone: ledger.handshake === 'reused' ? 'ok' : 'idle' },
    { label: 'Request', value: ledger.request },
    { label: 'Total', value: fmtMs(t), tone: t > 300 ? 'warn' : t > 0 ? 'idle' : 'idle' },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics'>) => {
    frames.push({ ...f, t, nodes: nodes(), metrics: metrics() });
    st.active.clear();
  };
  const links = (): Frame['links'] => (cdn ? { 'user-edge': 'hot', 'edge-origin': 'hot' } : { 'user-origin': 'hot' });

  // ---- 0. setting ----
  push({
    links: links(),
    say: `A user in Europe opens ${HOST}, served from an origin in North America. ${
      warm ? 'They were here a minute ago, so some state is left over.' : 'Nothing is cached and no connection is open.'
    }${k.cacheable === true && !cdn ? ' (Cacheable has no effect yet: nothing between the user and the origin can hold a copy.)' : ''}`,
    why: [
      'Before the server does any work, the browser has to find the server and open an encrypted connection to it. Each of those steps is a round trip, and a round trip costs whatever the distance costs.',
      `Here that is ${fmtMs(L)} for the last mile inside the user’s city and ${fmtMs(B)} to cross the ocean — so a round trip straight to the origin is about ${fmtMs(L + B)}.`,
    ],
  });

  // ---- 1. DNS ----
  if (warm) {
    ledger.dns = 'cached';
    push({
      line: at('dns.resolve'),
      vars: { ip: cdn ? 'edge (cached)' : 'origin (cached)' },
      say: 'DNS is answered from the browser’s own cache — the answer is still inside its TTL, so no packet leaves the machine.',
    });
  } else {
    st.active.add('user');
    st.active.add('resolver');
    st.resolver = 'miss';
    push({
      line: at('dns.resolve'),
      vars: { host: `"${HOST}"` },
      packets: [
        { edge: 'user-resolver', dir: 1, kind: 'req', label: `A? ${HOST}` },
        { edge: 'resolver-auth', dir: 1, kind: 'req', label: 'A?', delay: 480 },
      ],
      say: 'The browser asks its ISP’s resolver, which has never seen this name and asks the domain’s authoritative server.',
      why: [
        'The resolver already knows where .com’s servers are — those referrals are cached for days — so it goes straight to the authoritative server for example.com.',
        `Managed DNS answers from an anycast node near the resolver; this model charges it one more short round trip, about the same as the last mile.`,
      ],
    });
    t += L + L;
    ledger.dns = fmtMs(L + L);
    st.dnsCached = true;
    st.resolver = 'cached';
    st.auth = 'answered';
    push({
      line: at('dns.resolve'),
      vars: { ip: cdn ? 'nearest edge' : 'origin' },
      packets: [
        { edge: 'resolver-auth', dir: -1, kind: 'ok', label: cdn ? 'edge IP' : 'origin IP' },
        { edge: 'user-resolver', dir: -1, kind: 'ok', label: 'A record', delay: 480 },
      ],
      say: `Two short round trips, ${fmtMs(L + L)}. ${cdn ? 'The name resolves to the CDN’s anycast address, which routes to the nearest edge.' : 'The name resolves to the origin itself.'}`,
    });
  }

  // ---- checkpoint: where does the time go ----
  const predict: Checkpoint = {
    kind: 'predict',
    prompt: `The origin will answer from Redis in about ${fmtMs(D)}. Where will most of this request’s time go?`,
    options: ['Inside the origin: app and cache', 'Round trips across the network', 'Sending the response bytes'],
    answer: 1,
    reveal: cacheable
      ? `Round trips — but short ones. The edge in the user’s city can answer this from its own cache, so every round trip here is a last-mile one, about ${fmtMs(L)}. The origin, and the ocean, are never involved.`
      : warm
        ? `Round trips. With the connection already open there is only one left — the request itself — but it still has to cross the ocean and back: about ${fmtMs(L + B)}, against ${fmtMs(D)} of work at the origin.`
        : cdn
          ? `Round trips. The handshakes now finish at the edge in ${fmtMs(L)} each, but the request itself still crosses the ocean once, and that single crossing will be most of the total.`
          : `Round trips. A cold HTTPS connection needs three before the first byte — TCP, TLS, then the request — and each one to the origin costs about ${fmtMs(L + B)}. The origin’s ${fmtMs(D)} is a rounding error.`,
    source: { title: 'Grigorik — Primer on Latency and Bandwidth', url: 'https://hpbn.co/primer-on-latency-and-bandwidth/' },
  };
  push({ links: links(), say: warm ? 'Checkpoint — predict before the request goes out.' : 'Checkpoint — predict before the connection opens.', checkpoint: predict });

  // ---- 2. TCP + TLS ----
  if (warm) {
    ledger.handshake = 'reused';
    push({
      line: at('pool.get(ip)'),
      vars: { conn: `open → ${endpoint}` },
      say: 'The connection from the last visit is still open (HTTP keep-alive), so there is no TCP or TLS handshake at all.',
      why: [
        'Connection reuse is the cheapest latency optimisation there is: it removes two round trips from every request after the first.',
        'It is also why browsers and HTTP/2 multiplex many requests over one connection instead of opening a new one per request.',
      ],
    });
  } else {
    const hsEdge = cdn ? 'user-edge' : 'user-origin';
    st.active.add('user');
    st.active.add(endpoint);
    t += toEndpoint;
    push({
      line: at('TCP handshake'),
      packets: [
        { edge: hsEdge, dir: 1, kind: 'req', label: 'SYN' },
        { edge: hsEdge, dir: -1, kind: 'ok', label: 'SYN-ACK', delay: 560 },
      ],
      links: links(),
      say: `TCP handshake with the ${endpoint}: one round trip, ${fmtMs(toEndpoint)}. No application data can be sent until it completes.`,
    });

    t += toEndpoint;
    st.connOpen = true;
    if (cdn) st.edgeTls = true;
    ledger.handshake = fmtMs(2 * toEndpoint);
    st.active.add('user');
    st.active.add(endpoint);
    push({
      line: at('TLS 1.3 handshake'),
      packets: [
        { edge: hsEdge, dir: 1, kind: 'req', label: 'ClientHello' },
        { edge: hsEdge, dir: -1, kind: 'ok', label: 'ServerHello … Finished', delay: 560 },
      ],
      links: links(),
      say: `TLS 1.3 handshake: one more round trip, ${fmtMs(toEndpoint)}. The connection is now open and encrypted.`,
      why: [
        'TLS 1.3 needs a single round trip to agree keys; TLS 1.2 needed two. On a long path that difference alone is visible to users.',
        cdn
          ? 'Both handshakes finished at the edge, a last-mile round trip away. The ocean hasn’t been crossed yet.'
          : 'Both handshakes crossed the ocean. Two round trips gone, and not one byte of the page has been requested.',
      ],
    });
  }

  // ---- 3. the request ----
  st.active.add('user');
  if (cacheable) {
    st.active.add('edge');
    st.edgeCache = 'HIT';
    t += L;
    ledger.request = fmtMs(L);
    push({
      line: at('cache.get(req.url)'),
      vars: { cache: 'HIT' },
      packets: [
        { edge: 'user-edge', dir: 1, kind: 'req', label: 'GET /' },
        { edge: 'user-edge', dir: -1, kind: 'ok', label: '200 (edge cache)', delay: 560 },
      ],
      links: { 'user-edge': 'hot' },
      say: `The edge has this response cached — other users in this city requested it recently — and answers in one last-mile round trip, ${fmtMs(L)}. The origin never hears about it.`,
    });
  } else {
    const req = cdn ? 'user-edge' : 'user-origin';
    if (cdn) {
      st.active.add('edge');
      st.edgeCache = 'MISS';
    }
    push({
      line: at(cdn ? 'originPool.request' : "conn.request('GET'"),
      packets: [
        { edge: req, dir: 1, kind: 'req', label: 'GET /' },
        ...(cdn ? [{ edge: 'edge-origin', dir: 1 as const, kind: 'req' as const, label: 'GET / (pooled)', delay: 520 }] : []),
      ],
      links: links(),
      say: cdn
        ? 'The response can’t be cached, so the edge forwards the request over a connection to the origin it already holds open and encrypted.'
        : 'The request itself finally goes out, across the ocean to the origin.',
    });

    st.active.add('origin');
    st.active.add('redis');
    st.redis = 'HIT';
    st.served = fmtMs(D);
    push({
      line: at('redis.get(req.key)'),
      vars: { hit: 'true' },
      packets: [
        { edge: 'origin-redis', dir: 1, kind: 'req', label: 'GET' },
        { edge: 'origin-redis', dir: -1, kind: 'ok', label: 'HIT', delay: 420 },
      ],
      say: `At the origin the work is almost free: a cache hit one datacenter round trip away, ${fmtMs(D)}.`,
    });

    t += L + B + D;
    ledger.request = fmtMs(L + B + D);
    st.active.add('user');
    push({
      line: at("conn.request('GET'"),
      packets: cdn
        ? [
            { edge: 'edge-origin', dir: -1, kind: 'ok', label: '200' },
            { edge: 'user-edge', dir: -1, kind: 'ok', label: '200', delay: 520 },
          ]
        : [{ edge: 'user-origin', dir: -1, kind: 'ok', label: '200' }],
      links: links(),
      say: `The response crosses back. The request round trip cost ${fmtMs(L + B + D)}, of which ${fmtMs(D)} was the server.`,
    });
  }

  // ---- 4. total, and the checkpoint that follows from it ----
  const serverShare = cacheable ? 0 : (D / t) * 100;
  push({
    links: links(),
    say: `First byte after ${fmtMs(t)}. ${
      cacheable ? 'The server’s share: zero — it wasn’t involved.' : `The server’s share: ${serverShare < 1 ? 'under 1%' : `${serverShare.toFixed(1)}%`}.`
    }`,
    why: [
      cacheable
        ? 'A cacheable response served from an edge in the user’s city is the fastest a request can be: every round trip is short, and the ocean is never crossed.'
        : 'Almost all of this time is distance multiplied by round trips. Faster servers, bigger databases and better code cannot touch it; only fewer round trips or shorter ones can.',
    ],
  });

  let closing: Checkpoint;
  if (!cdn && !warm) {
    closing = {
      kind: 'break',
      prompt: 'Three of the four long round trips were set-up, not the request. If you can’t move the origin, how do you cut them?',
      reveal: `Finish the handshakes close to the user. A CDN edge in the user’s city answers TCP and TLS in one last-mile round trip each (${fmtMs(L)}), then forwards the request over a connection to the origin it already holds open and encrypted — so the ocean is crossed once instead of three times. On this request that saves about ${fmtMs(2 * B)}.`,
      source: { title: 'Grigorik — Primer on Latency and Bandwidth', url: 'https://hpbn.co/primer-on-latency-and-bandwidth/' },
      knob: { id: 'route', value: 'cdn', label: 'Route through a nearby CDN edge' },
    };
  } else if (!cdn && warm) {
    closing = {
      kind: 'break',
      prompt: `The connection was already open and this still took ${fmtMs(t)}. What is left to cut?`,
      reveal: 'Only the distance itself. There are two ways to shorten it: serve the response from a cache near the user, or move the data closer with a replica or an origin in the user’s region. A CDN edge with a cacheable response is the first; turn it on to see what it removes.',
      source: { title: 'Grigorik — Primer on Latency and Bandwidth', url: 'https://hpbn.co/primer-on-latency-and-bandwidth/' },
      knob: { id: 'route', value: 'cdn', label: 'Route through a nearby CDN edge' },
    };
  } else if (cacheable) {
    closing = {
      kind: 'why',
      prompt: 'What does it cost to make a response cacheable at the edge?',
      reveal: 'Freshness. The edge is serving a copy, valid until its max-age runs out or someone purges it, so anything that must reflect the latest write — a balance, a cart, a personalised page — can’t be served this way without deciding how stale is acceptable. That trade is why the fastest request in this scenario only applies to part of a real site.',
      source: { title: 'Cloudflare — Cache documentation', url: 'https://developers.cloudflare.com/cache/' },
    };
  } else if (warm) {
    closing = {
      kind: 'why',
      prompt: `With a warm connection and a response that can’t be cached, the edge saved nothing — ${fmtMs(t)} either way. Why?`,
      reveal: 'Because the only round trip left is the request, and it has to reach the origin no matter which way it travels: the last mile plus the ocean, once. An edge wins on new connections (handshakes finish nearby) and on content it can serve itself. In front of a chatty, uncacheable API that is already on warm connections, a CDN changes little; in front of static assets it changes everything.',
      source: { title: 'Grigorik — Primer on Latency and Bandwidth', url: 'https://hpbn.co/primer-on-latency-and-bandwidth/' },
    };
  } else {
    closing = {
      kind: 'why',
      prompt: `The edge cut this cold request to ${fmtMs(t)}. What is it still not fixing?`,
      reveal: `The one crossing to the origin: ${fmtMs(L + B + D)} of the total is the request travelling to the other continent and back. Removing it takes either a response the edge can cache, or data that lives closer to the user — a regional replica or origin, with the consistency questions that brings.`,
      source: { title: 'Grigorik — Primer on Latency and Bandwidth', url: 'https://hpbn.co/primer-on-latency-and-bandwidth/' },
    };
  }
  push({ links: links(), say: 'Checkpoint — what the numbers say.', checkpoint: closing });

  return frames;
}

export const requestAnatomy: Scenario = {
  id: 'request-anatomy',
  topic: 'scaling-journey',
  title: 'Anatomy of a request',
  summary: 'One HTTPS request across an ocean, timed hop by hop — then a CDN edge, a warm connection and a cacheable response.',
  stage: {
    width: 648,
    height: 330,
    regions: [
      { label: 'NEAR THE USER', x: 16, y: 18 },
      { label: 'OTHER CONTINENT', x: 632, y: 132, anchor: 'end' },
    ],
    nodes: [
      { id: 'resolver', label: 'resolver', x: 16, y: 28, w: 166, h: 44 },
      { id: 'auth', label: 'auth DNS', x: 214, y: 28, w: 184, h: 44 },
      { id: 'user', label: 'browser', x: 16, y: 142, w: 166, h: 78 },
      { id: 'edge', label: 'CDN edge', x: 214, y: 142, w: 184, h: 96 },
      { id: 'origin', label: 'origin app', x: 446, y: 142, w: 186, h: 78 },
      { id: 'redis', label: 'redis', x: 446, y: 250, w: 186, h: 44 },
    ],
    edges: [
      { id: 'user-resolver', from: 'user', to: 'resolver', fromPort: { side: 't', at: 0.45 }, toPort: { side: 'b', at: 0.5 } },
      { id: 'resolver-auth', from: 'resolver', to: 'auth', fromPort: { side: 'r' }, toPort: { side: 'l' } },
      { id: 'user-edge', from: 'user', to: 'edge', fromPort: { side: 'r', at: 0.4 }, toPort: { side: 'l', at: 0.33 } },
      { id: 'edge-origin', from: 'edge', to: 'origin', fromPort: { side: 'r', at: 0.33 }, toPort: { side: 'l', at: 0.4 } },
      { id: 'origin-redis', from: 'origin', to: 'redis', fromPort: { side: 'b', at: 0.5 }, toPort: { side: 't', at: 0.5 } },
      {
        id: 'user-origin',
        from: 'user',
        to: 'origin',
        fromPort: { side: 'b', at: 0.5 },
        toPort: { side: 'l', at: 0.82 },
        via: [
          [99, 312],
          [424, 312],
          [424, 206],
        ],
      },
    ],
  },
  knobs: [
    {
      id: 'route',
      kind: 'choice',
      label: 'route',
      default: 'direct',
      options: [
        { value: 'direct', label: 'direct to origin' },
        { value: 'cdn', label: 'via CDN edge' },
      ],
    },
    { id: 'warm', kind: 'toggle', label: 'warm connection', default: false },
    { id: 'cacheable', kind: 'toggle', label: 'cacheable response', default: false },
  ],
  source,
  run,
};
