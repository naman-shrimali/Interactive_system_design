import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Packet, Scenario, Stage, Token } from '../types';
import { factMs, fmtMs } from '../facts';
import { burst, lineOf } from '../kit';

/*
 * Fan-out on write, and the account that breaks it.
 *
 * Normal load, from the lesson's own estimate: 3,000 posts a second, each to
 * about 200 followers — 600k feed writes a second. The fan-out workers can do
 * 800k between them. Then @star, with 30 million followers, posts; one second
 * later @bob, with 200, does too. The model is a fluid queue of feed writes,
 * stepped analytically:
 *
 *   push     one FIFO queue: @bob's 200 writes wait behind @star's 30 million,
 *            and so does every other post for the next few minutes
 *   lanes    big accounts get their own lane, served from spare capacity:
 *            @bob is instant, @star's followers wait longer than before
 *   hybrid   big accounts aren't fanned out at all: their posts are stored once
 *            and merged into the feed when a follower reads it
 *
 * Every time and count on screen comes from the formulas below.
 */

// Scenario assumptions (not facts about any real system):
const POST_RATE = 3_000; // posts/s — the lesson's estimate
const AVG_FOLLOWERS = 200; // a typical account
const CAPACITY = 800_000; // feed writes/s the worker fleet can do
const STAR = 30_000_000; // @star's followers
const BOB = 200; // @bob's followers
const BOB_AT = 1; // s after @star
const BIG = 1_000_000; // lanes / hybrid: accounts above this are treated differently
const READS = 300_000; // feed reads/s — the lesson's estimate
const FOLLOWING = 200; // accounts a typical reader follows

const BASE = POST_RATE * AVG_FOLLOWERS; // 600k feed writes/s
const SPARE = CAPACITY - BASE; // 200k/s
const RTT = factMs('datacenter-round-trip');
/** Hops from publish to a follower's feed: post service → queue → worker → cache. */
const HOPS = 3;

type Mode = 'push' | 'lanes' | 'hybrid';

const fmtN = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}k` : String(Math.round(n));
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
/** A duration in seconds, in the unit a reader would use. */
const fmtS = (s: number) => (s < 1 ? fmtMs(s * 1000) : s < 90 ? `${+s.toFixed(1)} s` : `${+(s / 60).toFixed(1)} min`);

// ---- the model ----

/** Feed writes waiting in the shared queue at time t (push). */
const backlog = (t: number) => Math.max(0, STAR - SPARE * t);
/** How long a post made at time t waits before its own fan-out starts (push). */
const waitAt = (mode: Mode, t: number) => (mode === 'push' ? backlog(t) / CAPACITY : 0);
/** Delay from posting to a follower's feed, for an account with `n` followers posting at t. */
const deliverDelay = (mode: Mode, t: number, n: number) => waitAt(mode, t) + n / CAPACITY + (HOPS * RTT) / 1000;
/** @star's followers whose feeds have the post by time t. */
function starReached(mode: Mode, t: number): number {
  if (mode === 'push') return Math.min(STAR, CAPACITY * t); // head of the queue: the whole fleet works on it
  if (mode === 'lanes') return Math.min(STAR, SPARE * t); // only what the normal lane leaves over
  return 0; // never fanned out
}
const starDone = (mode: Mode) => (mode === 'push' ? STAR / CAPACITY : mode === 'lanes' ? STAR / SPARE : 0);
const clearAt = STAR / SPARE; // push: when the shared backlog is gone
/** Writes @star's post costs: the posts-table row, plus one feed write per follower if fanned out. */
const starWrites = (mode: Mode) => 1 + (mode === 'hybrid' ? 0 : STAR);

// ---- layouts ----

const POSTERS = [
  { id: 'bob', label: '@bob', sub: `${BOB} followers`, x: 16, y: 16, w: 130, h: 76 },
  { id: 'others', label: 'everyone else', sub: `${fmtInt(POST_RATE)} posts/s`, x: 16, y: 100, w: 130, h: 52 },
  { id: 'star', label: '@star', sub: `${fmtN(STAR)} followers`, x: 16, y: 160, w: 130, h: 76 },
];
const WORKERS = { id: 'workers', label: 'fan-out workers', sub: `${fmtN(CAPACITY)} writes/s`, x: 458, y: 16, w: 174, h: 96 };
const FEEDS = { id: 'feeds', label: 'FEED CACHES', x: 458, y: 136, w: 174, h: 122 };
// Edge ports: posters' centres line up with where they enter, so every edge is straight.
const at = (y: number, top: number, h: number) => (y - top) / h;

function stageFor(k: KnobValues): Stage {
  const mode = (k.mode as Mode) ?? 'push';
  const toFeeds = { id: 'workers-feeds', from: 'workers', to: 'feeds', fromPort: { side: 'b' as const }, toPort: { side: 't' as const } };
  if (mode === 'push') {
    const q = { id: 'queue', label: 'FAN-OUT QUEUE', x: 176, y: 16, w: 252, h: 230 };
    return {
      width: 648,
      height: 266,
      nodes: [...POSTERS, q, WORKERS, FEEDS],
      edges: [
        { id: 'bob-in', from: 'bob', to: 'queue', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(54, 16, 230) } },
        { id: 'others-in', from: 'others', to: 'queue', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(126, 16, 230) } },
        { id: 'star-in', from: 'star', to: 'queue', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(198, 16, 230) } },
        { id: 'queue-workers', from: 'queue', to: 'workers', fromPort: { side: 'r', at: at(64, 16, 230) }, toPort: { side: 'l' } },
        toFeeds,
      ],
    };
  }
  const top = { id: 'queue', label: mode === 'lanes' ? 'NORMAL LANE' : 'FAN-OUT QUEUE', x: 176, y: 16, w: 252, h: 116 };
  if (mode === 'lanes') {
    const big = { id: 'big', label: 'BIG-ACCOUNT LANE', x: 176, y: 140, w: 252, h: 116 };
    return {
      width: 648,
      height: 272,
      nodes: [...POSTERS, top, big, WORKERS, FEEDS],
      edges: [
        { id: 'bob-in', from: 'bob', to: 'queue', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(54, 16, 116) } },
        { id: 'others-in', from: 'others', to: 'queue', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(126, 16, 116) } },
        { id: 'star-in', from: 'star', to: 'big', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(198, 140, 116) } },
        { id: 'queue-workers', from: 'queue', to: 'workers', fromPort: { side: 'r', at: at(64, 16, 116) }, toPort: { side: 'l', at: at(64, 16, 96) } },
        { id: 'big-workers', from: 'big', to: 'workers', fromPort: { side: 'r', at: at(198, 140, 116) }, toPort: { side: 'l', at: at(96, 16, 96) }, via: [[443, 198], [443, 96]] },
        toFeeds,
      ],
    };
  }
  const posts = { id: 'posts', label: 'POSTS TABLE', sub: 'every post, stored once', x: 176, y: 140, w: 252, h: 116 };
  const ann = { id: 'ann', label: 'Ann reads her feed', sub: 'follows @bob, @star', x: 458, y: 280, w: 174, h: 80 };
  return {
    width: 648,
    height: 376,
    nodes: [...POSTERS, top, posts, WORKERS, FEEDS, ann],
    edges: [
      { id: 'bob-in', from: 'bob', to: 'queue', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(54, 16, 116) } },
      { id: 'others-in', from: 'others', to: 'queue', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(126, 16, 116) } },
      { id: 'star-in', from: 'star', to: 'posts', fromPort: { side: 'r' }, toPort: { side: 'l', at: at(198, 140, 116) } },
      { id: 'queue-workers', from: 'queue', to: 'workers', fromPort: { side: 'r', at: at(64, 16, 116) }, toPort: { side: 'l', at: at(64, 16, 96) } },
      toFeeds,
      { id: 'feeds-ann', from: 'feeds', to: 'ann', fromPort: { side: 'b' }, toPort: { side: 't' } },
      { id: 'posts-ann', from: 'posts', to: 'ann', fromPort: { side: 'r', at: at(230, 140, 116) }, toPort: { side: 'l', at: at(320, 280, 80) }, via: [[443, 230], [443, 320]] },
    ],
  };
}

// ---- code ----

const source = (k: KnobValues): string[] => {
  const mode = (k.mode as Mode) ?? 'push';
  const publish =
    mode === 'push'
      ? [
          `async function publish(post, author) {`,
          `  await posts.insert(post);                        // stored once`,
          `  await fanoutQueue.enqueue({ post, author });     // one queue, first in, first out`,
          `}`,
        ]
      : mode === 'lanes'
        ? [
            `async function publish(post, author) {`,
            `  await posts.insert(post);`,
            `  const lane = author.followers > 1_000_000 ? bigLane : normalLane;`,
            `  await lane.enqueue({ post, author });`,
            `}`,
          ]
        : [
            `async function publish(post, author) {`,
            `  await posts.insert(post);`,
            `  if (author.followers > 1_000_000) return;        // big accounts: no fan-out`,
            `  await fanoutQueue.enqueue({ post, author });`,
            `}`,
          ];
  const worker = [
    ``,
    mode === 'lanes'
      ? `worker.process([normalLane, bigLane], async ({ post, author }) => {   // normal lane first`
      : `worker.process(fanoutQueue, async ({ post, author }) => {`,
    `  for (const chunk of followersOf(author, 10_000)) {`,
    `    await feeds.prependMany(chunk, post.id);          // one write per follower`,
    `  }`,
    `});`,
  ];
  const read =
    mode === 'hybrid'
      ? [
          ``,
          `async function readFeed(user) {`,
          `  const pushed = await feeds.range(user.id, 0, 50);`,
          `  const stars = await posts.recentFrom(user.followedBigAccounts);  // merged at read time`,
          `  return mergeByTime(pushed, stars).slice(0, 50);`,
          `}`,
        ]
      : [``, `async function readFeed(user) {`, `  return feeds.range(user.id, 0, 50);              // already assembled`, `}`];
  return [...publish, ...worker, ...read];
};

// ---- run ----

function run(k: KnobValues): Frame[] {
  const mode = (k.mode as Mode) ?? 'push';
  const src = source(k);
  const line = (a: string) => lineOf(src, a);

  let t = 0;
  let starPosted = false;
  let bobPosted = false;
  let annRead = false;
  const frames: Frame[] = [];

  const bobDelay = deliverDelay(mode, BOB_AT, BOB);
  const bobSeen = () => bobPosted && t >= BOB_AT + bobDelay;
  const starHas = () => (starPosted ? starReached(mode, t) : 0);
  const starDelivered = () => starPosted && mode !== 'hybrid' && starHas() >= STAR;

  const tokens = (): Token[] => {
    const out: Token[] = [];
    const star: Token = { id: 'star', label: `@star ${fmtN(STAR)}`, node: 'star', tone: 'active' };
    const bob: Token = { id: 'bob', label: `@bob ${BOB}`, node: 'bob', tone: 'active' };
    // FIFO order inside a node is array order, so @star's job sits ahead of @bob's.
    if (starPosted) {
      star.node = mode === 'hybrid' ? 'posts' : starDelivered() ? 'feeds' : mode === 'lanes' ? 'big' : 'queue';
      star.tone = star.node === 'feeds' ? 'ok' : mode === 'hybrid' ? 'idle' : 'warn';
    }
    if (bobPosted) {
      bob.node = bobSeen() ? 'feeds' : 'queue';
      bob.tone = bobSeen() ? 'ok' : 'warn';
    }
    out.push(star, bob);
    if (annRead) {
      out.push({ id: 'ann-star', label: `@star ${fmtN(STAR)}`, node: 'ann', tone: 'ok' });
      out.push({ id: 'ann-bob', label: `@bob ${BOB}`, node: 'ann', tone: 'ok' });
    }
    return out;
  };

  const nodes = (): Record<string, NodeState> => {
    const w = mode === 'push' && starPosted ? backlog(t) : 0;
    const out: Record<string, NodeState> = {
      bob: { tone: 'idle' },
      others: { tone: 'idle' },
      star: { tone: 'idle' },
      queue: {
        tone: w > 0 ? 'warn' : 'idle',
        rows: [
          ...(mode === 'push' ? [{ kind: 'bar' as const, value: w, max: STAR, tone: w > 0 ? ('warn' as const) : ('ok' as const) }] : []),
          { kind: 'kv', label: 'backlog', value: `${fmtN(w)} writes`, tone: w > 0 ? 'warn' : 'idle' },
          { kind: 'kv', label: 'new post lands in', value: fmtS(deliverDelay(mode, starPosted ? t : 0, AVG_FOLLOWERS)), tone: w > 0 ? 'warn' : 'idle' },
        ],
      },
      workers: {
        tone: 'active',
        rows: [
          { kind: 'kv', label: 'busy', value: `${Math.round(((starPosted && (mode === 'push' ? w > 0 : starHas() < STAR && mode === 'lanes') ? CAPACITY : BASE) / CAPACITY) * 100)}%` },
          {
            kind: 'kv',
            label: 'on',
            value:
              mode === 'push' && starPosted && starHas() < STAR
                ? '@star'
                : mode === 'push' && w > 0
                  ? 'the backlog'
                  : mode === 'lanes' && starPosted && starHas() < STAR
                    ? 'normal + @star'
                    : 'normal posts',
          },
        ],
      },
      feeds: {
        rows: [
          { kind: 'kv', label: '@star', value: mode === 'hybrid' ? 'not fanned out' : `${fmtN(starHas())}/${fmtN(STAR)}`, tone: starDelivered() ? 'ok' : starPosted && mode !== 'hybrid' ? 'warn' : 'dim' },
          ...(mode === 'hybrid' ? [] : [{ kind: 'bar' as const, value: starHas(), max: STAR, tone: starDelivered() ? ('ok' as const) : ('warn' as const) }]),
          { kind: 'kv', label: '@bob', value: `${bobSeen() ? BOB : 0}/${BOB}`, tone: bobSeen() ? 'ok' : bobPosted ? 'warn' : 'dim' },
        ],
      },
    };
    if (mode === 'lanes') {
      out.big = {
        tone: starPosted && starHas() < STAR ? 'warn' : 'idle',
        rows: [
          { kind: 'bar', value: starHas(), max: STAR, tone: starDelivered() ? 'ok' : 'warn' },
          { kind: 'kv', label: 'reached', value: starPosted ? `${fmtN(starHas())} / ${fmtN(STAR)}` : '—', tone: starDelivered() ? 'ok' : 'idle' },
        ],
      };
    }
    if (mode === 'hybrid') {
      out.posts = { rows: [{ kind: 'kv', label: "writes for @star's post", value: starPosted ? String(starWrites(mode)) : '—' }] };
      out.ann = { tone: annRead ? 'active' : 'idle' };
    }
    return out;
  };

  const metrics = (): Metric[] => [
    { label: 'Clock', value: `t = ${+t.toFixed(2)} s` },
    {
      label: "@bob's post",
      value: !bobPosted ? '—' : bobSeen() ? `seen after ${fmtS(bobDelay)}` : 'waiting',
      tone: !bobPosted ? 'idle' : bobSeen() ? (bobDelay > 1 ? 'warn' : 'ok') : 'warn',
    },
    {
      label: "@star's followers",
      value: !starPosted ? '—' : mode === 'hybrid' ? 'on next read' : `${fmtN(starHas())} reached`,
      tone: !starPosted ? 'idle' : starDelivered() || mode === 'hybrid' ? 'ok' : 'warn',
    },
    { label: "Writes for @star's post", value: !starPosted ? '—' : fmtN(starWrites(mode)) },
  ];

  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics' | 'tokens'>) =>
    frames.push({ ...f, t: Math.round(t * 1000), nodes: nodes(), metrics: metrics(), tokens: tokens() });

  /** The steady stream of everyone else's posts, every step. */
  const stream = (): Packet[] => [
    ...burst(3, 'others-in', 1, 'req', 0, 140),
    ...burst(3, 'queue-workers', 1, 'req', 380, 140),
    ...burst(3, 'workers-feeds', 1, 'ok', 760, 140),
  ];

  // ---- 0. normal load ----
  push({
    line: line('posts.insert(post)'),
    packets: stream(),
    say: `Normal load: ${fmtInt(POST_RATE)} posts a second, each fanned out to about ${AVG_FOLLOWERS} followers — ${fmtN(BASE)} feed writes a second. The workers can do ${fmtN(CAPACITY)}.`,
    why: [
      'Fan-out on write does the work when someone posts, so that reading a feed — the thing users do constantly — is one cache lookup. With reads outnumbering posts about 100 to 1, that is the right place to put the cost.',
      `The fleet runs at ${Math.round((BASE / CAPACITY) * 100)}% — ${fmtN(SPARE)} writes a second of headroom. Every number here is the scenario's assumption, chosen to be ordinary.`,
    ],
  });

  // ---- 1. @star posts ----
  starPosted = true;
  push({
    line: mode === 'hybrid' ? line('if (author.followers') : mode === 'lanes' ? line('const lane =') : line('fanoutQueue.enqueue'),
    packets: [{ edge: 'star-in', dir: 1, kind: 'req', label: 'post' }, ...stream()],
    say:
      mode === 'push'
        ? `t = 0: @star posts. That is one job in the queue — and ${fmtN(STAR)} feed writes.`
        : mode === 'lanes'
          ? `t = 0: @star posts. With over ${fmtN(BIG)} followers, the job goes to the big-account lane.`
          : `t = 0: @star posts. With over ${fmtN(BIG)} followers, the post is stored once and not fanned out at all.`,
  });

  // ---- 2. predict ----
  const option = (s: number) => (s < 1 ? 0 : s < 90 ? 1 : 2);
  const durations = ['Within a second', 'About half a minute', 'A few minutes'];
  const predict: Checkpoint =
    mode === 'push'
      ? {
          kind: 'predict',
          prompt: `@bob, with ${BOB} followers, posts one second after @star. How long until @bob's followers can see his post?`,
          options: durations,
          answer: option(bobDelay),
          reveal: `${fmtS(bobDelay)}. @bob's fan-out is ${BOB} writes — a fraction of a millisecond of work — but the queue is first in, first out, and ${fmtN(STAR - SPARE * BOB_AT)} writes are ahead of him. Everyone who posts in the next ${fmtS(clearAt)} waits behind @star too.`,
          source: { title: 'Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
        }
      : mode === 'lanes'
        ? {
            kind: 'predict',
            prompt: `@star's job waits in its own lane, which gets whatever capacity the normal lane leaves. How long until the last of @star's ${fmtN(STAR)} followers has the post?`,
            options: durations,
            answer: option(starDone(mode)),
            reveal: `${fmtS(starDone(mode))}. The normal lane uses ${fmtN(BASE)} of the ${fmtN(CAPACITY)} writes a second, so @star's lane gets the other ${fmtN(SPARE)}: ${fmtN(STAR)} ÷ ${fmtN(SPARE)} a second. Isolation protected everyone else by making @star's own followers wait longer than before.`,
            source: { title: 'Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
          }
        : {
            kind: 'predict',
            prompt: `@star has ${fmtN(STAR)} followers and this post is never fanned out. How many writes does it cost?`,
            options: [`${fmtN(STAR)} — one per follower`, 'One per follower who opens the app', 'One'],
            answer: starWrites(mode) === 1 ? 2 : 0,
            reveal: `One: the row in the posts table. Nothing is copied into anyone's feed. The cost moves to read time — every follower who opens the app fetches @star's recent posts and merges them in — but that is one lookup per big account they follow, and the same small list serves all ${fmtN(STAR)} of them.`,
            source: { title: 'Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
          };
  push({ say: 'Checkpoint — predict.', checkpoint: predict });

  // ---- 3. @bob posts ----
  t = BOB_AT;
  bobPosted = true;
  const bobLanded = mode !== 'push';
  if (bobLanded) t = BOB_AT + bobDelay; // nothing ahead of him: his post lands almost at once
  push({
    line: line('feeds.prependMany'),
    packets: [
      { edge: 'bob-in', dir: 1, kind: 'req', label: 'post' },
      ...(bobLanded ? [{ edge: 'queue-workers', dir: 1 as const, kind: 'req' as const, delay: 420 }, { edge: 'workers-feeds', dir: 1 as const, kind: 'ok' as const, delay: 840 }] : []),
      ...burst(2, 'others-in', 1, 'req', 200, 160),
    ],
    say:
      mode === 'push'
        ? `t = ${BOB_AT} s: @bob posts. His job joins the queue behind ${fmtN(backlog(BOB_AT))} writes — @star's, and everyone who posted in the last second.`
        : `@bob posts at t = ${BOB_AT} s. Nothing is ahead of him in his queue: his ${BOB} followers have it ${fmtS(bobDelay)} later.`,
  });

  // ---- 4+. time passes ----
  if (mode === 'push') {
    t = 20;
    push({
      packets: [...burst(4, 'queue-workers', 1, 'req', 0, 120), ...burst(4, 'workers-feeds', 1, 'ok', 380, 120), ...burst(2, 'others-in', 1, 'req', 100, 200)],
      say: `t = ${t} s: the whole fleet is on @star's job — ${fmtN(starReached(mode, t))} of ${fmtN(STAR)} feeds written. @bob still waits, and a post made now would wait ${fmtS(waitAt(mode, t))}.`,
    });
    t = starDone(mode);
    push({
      packets: [...burst(3, 'workers-feeds', 1, 'ok', 0, 140), ...burst(2, 'others-in', 1, 'req', 100, 200)],
      say: `t = ${fmtS(t)}: the last of @star's ${fmtN(STAR)} followers has the post. Next in line are the posts made in the second before @bob's.`,
    });
    t = BOB_AT + bobDelay;
    push({
      line: line('feeds.prependMany'),
      packets: [
        { edge: 'queue-workers', dir: 1, kind: 'req', label: '@bob' },
        { edge: 'workers-feeds', dir: 1, kind: 'ok', delay: 420 },
        ...burst(2, 'others-in', 1, 'req', 100, 200),
      ],
      say: `t = ${fmtS(t)}: @bob's ${BOB} writes finally run, taking ${fmtS(BOB / CAPACITY)}. His followers saw his post ${fmtS(bobDelay)} after he made it.`,
    });
    t = clearAt;
    push({
      packets: stream(),
      say: `t = ${fmtS(t)}: the backlog is gone. For ${fmtS(clearAt)}, every one of the ${fmtN(POST_RATE * clearAt)} posts made on the platform arrived late — by up to ${fmtS(waitAt(mode, 0))}.`,
      why: [
        `The workers only had ${fmtN(SPARE)} writes a second to spare, so a ${fmtN(STAR)}-write job takes ${fmtS(clearAt)} of spare capacity to absorb, however fast it is processed at the head of the queue.`,
      ],
    });
  } else if (mode === 'lanes') {
    for (const when of [20, starDone(mode) / 2]) {
      t = when;
      push({
        packets: [
          ...burst(2, 'big-workers', 1, 'req', 0, 200),
          ...burst(3, 'queue-workers', 1, 'req', 100, 140),
          ...burst(3, 'workers-feeds', 1, 'ok', 480, 140),
          ...burst(2, 'others-in', 1, 'req', 100, 200),
        ],
        say: `t = ${fmtS(t)}: everyone else's posts flow at full speed. @star's lane gets the ${fmtN(SPARE)} writes a second left over: ${fmtN(starReached(mode, t))} of ${fmtN(STAR)} followers reached.`,
      });
    }
    t = starDone(mode);
    push({
      packets: [...burst(2, 'big-workers', 1, 'req', 0, 200), ...burst(3, 'workers-feeds', 1, 'ok', 380, 140)],
      say: `t = ${fmtS(t)}: @star's last follower has the post — ${fmtS(starDone(mode) - starDone('push'))} later than with one shared queue, and it still took ${fmtN(STAR)} writes.`,
    });
  } else {
    t = BOB_AT + 1;
    annRead = true;
    push({
      line: line('mergeByTime('),
      packets: [
        { edge: 'feeds-ann', dir: -1, kind: 'req' },
        { edge: 'posts-ann', dir: -1, kind: 'req', delay: 80 },
        { edge: 'feeds-ann', dir: 1, kind: 'ok', label: '@bob', delay: 520 },
        { edge: 'posts-ann', dir: 1, kind: 'ok', label: '@star', delay: 600 },
      ],
      say: `t = ${fmtS(t)}: Ann opens the app. Her feed cache has @bob's post; @star's comes straight from the posts table. Two lookups, merged by time — both posts, no wait.`,
      why: [
        `Every one of @star's followers reads the same short list of @star's recent posts, which makes it one of the hottest keys in the system. It is small and changes rarely, so it is cached and replicated widely — a far cheaper problem than ${fmtN(STAR)} writes.`,
      ],
    });
    t = BOB_AT + 2;
    push({
      packets: stream(),
      say: `The big account's post cost 1 write instead of ${fmtN(STAR)}, nobody's post waited, and each read pays one extra lookup per big account the reader follows.`,
    });
  }

  // ---- closing ----
  const closing: Checkpoint =
    mode === 'push'
      ? {
          kind: 'break',
          prompt: `One account posted, and every post on the platform was late for ${fmtS(clearAt)}. What stops one huge fan-out from delaying everyone else's?`,
          reveal: `Stop putting it in the same line. Give accounts above a follower threshold their own queue — a big-account lane — and let workers serve the normal lane first. A ${BOB}-follower post never waits behind a ${fmtN(STAR)}-follower one again. Run it and watch who pays instead.`,
          source: { title: 'Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
          knob: { id: 'mode', value: 'lanes', label: 'Give big accounts their own lane' },
        }
      : mode === 'lanes'
        ? {
            kind: 'break',
            prompt: `@bob is fast again, but @star's last follower waited ${fmtS(starDone(mode))} and the post still cost ${fmtN(STAR)} writes. What removes the cost instead of moving it?`,
            reveal: `Don't fan out the big accounts at all. Store their posts once, and when a follower reads their feed, fetch the recent posts of the big accounts they follow and merge them in. The writes disappear; each read pays a lookup per big account followed. The big accounts are a small, identifiable set, so this is cheap — the hybrid most large feeds use.`,
            source: { title: 'Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
            knob: { id: 'mode', value: 'hybrid', label: 'Merge big accounts at read time' },
          }
        : {
            kind: 'why',
            prompt: 'Merging at read time worked so well for @star. Why not do it for every account and skip fan-out entirely?',
            reveal: `Because reads are the common case. At ${fmtN(READS)} feed reads a second, each merging posts from about ${FOLLOWING} followed accounts, pulling everything costs around ${fmtN(READS * FOLLOWING)} lookups a second — against ${fmtN(BASE)} writes a second to push. Push only breaks for a handful of accounts with huge followings, so you special-case those few and keep the cheap reads for everyone else.`,
            source: { title: 'Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
          };
  push({ say: closing.kind === 'break' ? 'Checkpoint — fix it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

export const fanout: Scenario = {
  id: 'fanout',
  topic: 'news-feed',
  title: 'Fan-out, and the account that breaks it',
  summary: 'A 30-million-follower account posts a second before an ordinary one — in one queue, in two lanes, and with big accounts merged at read time.',
  stage: stageFor({ mode: 'push' }),
  stageFor,
  knobs: [
    {
      id: 'mode',
      kind: 'choice',
      label: 'fan-out',
      default: 'push',
      options: [
        { value: 'push', label: 'one queue' },
        { value: 'lanes', label: 'big-account lane' },
        { value: 'hybrid', label: 'hybrid' },
      ],
    },
  ],
  source,
  run,
};
