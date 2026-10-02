import type { Checkpoint, Frame, KnobValues, Metric, NodeState, Scenario, Token } from '../types';
import { factMs, fmtMs } from '../facts';
import { lineOf, list } from '../kit';

/*
 * A phone goes into a tunnel without closing its connection.
 *
 * Bob's phone holds a WebSocket to a gateway. At t = 12 s his train enters a
 * tunnel: no close frame, no FIN — the connection just goes silent, and the
 * gateway still thinks it is open. Alice sends three messages; Bob comes out at
 * t = 60 s and reconnects. Two settings decide what he sees:
 *
 *   delivery    'write'  — a message counts as delivered once the socket write
 *                          succeeds, and a reconnect fetches what isn't delivered
 *               'cursor' — delivered means the device acknowledged it; a
 *                          reconnect asks for everything after the device's cursor
 *   heartbeats  on  — presence is a TTL entry refreshed every few seconds
 *               off — presence is written on open and deleted on close
 *
 * Which messages reach Bob, what Alice's ticks claim, and when the server
 * stops believing Bob is online all come from the rules below.
 */

// Configuration choices, not facts about a particular app:
const HEARTBEAT = 10; // s between heartbeats
const TTL = 30; // s a registry entry outlives its last heartbeat
const TUNNEL = 12; // s: Bob loses signal
const BACK = 60; // s: Bob reconnects
const CURSOR = 40; // the last message Bob's phone has
const MSGS = [
  { seq: 41, at: 14, text: 'running late' },
  { seq: 42, at: 20, text: 'on the platform' },
  { seq: 43, at: 45, text: 'where are you?' },
];

const KEEPALIVE = factMs('tcp-keepalive-idle-linux');

type Delivery = 'write' | 'cursor';

const fmtS = (s: number) => `${+s.toFixed(1)} s`;
/** Long durations in the unit people use for them. */
const fmtLong = (ms: number) => (ms >= 3.6e6 ? `${+(ms / 3.6e6).toFixed(1)} hours` : fmtMs(ms));
const tag = (seq: number) => `#${seq}`;

// ---- the model ----

/** Last heartbeat before the tunnel; the registry entry lives TTL past it. */
const lastBeat = Math.floor(TUNNEL / HEARTBEAT) * HEARTBEAT;
/** When the server stops believing Bob is connected (within this scenario's window). */
const expiresAt = (hb: boolean) => (hb ? lastBeat + TTL : Infinity);
/** Does the registry say Bob is connected at time t? */
const listed = (hb: boolean, t: number) => t < TUNNEL || t >= BACK || t < expiresAt(hb);
/** A message sent while Bob is listed is written into his (dead) socket; otherwise a push notification goes out. */
const pushedIntoDeadSocket = (hb: boolean, seq: number) => {
  const m = MSGS.find((x) => x.seq === seq)!;
  return m.at >= TUNNEL && m.at < BACK && listed(hb, m.at);
};
/** What Bob's phone has after reconnecting. */
function received(d: Delivery, hb: boolean): number[] {
  const after = d === 'cursor' ? MSGS.map((m) => m.seq) : MSGS.filter((m) => !pushedIntoDeadSocket(hb, m.seq)).map((m) => m.seq);
  return [CURSOR, ...after];
}

// ---- code ----

const source = (k: KnobValues): string[] => {
  const d = (k.delivery as Delivery) ?? 'write';
  const hb = k.heartbeats !== false;
  return [
    `// chat server: Alice sends a message`,
    `async function onSend(msg) {`,
    `  msg.seq = await db.append(msg.conversation, msg);   // stored first: ✓`,
    `  const gateway = await registry.get(msg.to);`,
    `  if (gateway) await gateway.deliver(msg);`,
    `  else await pushNotify(msg.to, msg);                 // not connected`,
    `}`,
    ``,
    `// gateway`,
    ...(hb
      ? [`socket.on('heartbeat', () => registry.set(user, gatewayId, { ttl: ${TTL} }));`]
      : [`socket.on('open',  () => registry.set(user, gatewayId));`, `socket.on('close', () => registry.delete(user));`]),
    ``,
    ...(d === 'write'
      ? [
          `async function deliver(msg) {`,
          `  socket.send(msg);                    // returns once the kernel has the bytes`,
          `  await db.markDelivered(msg.id);      // ✓✓`,
          `}`,
          `socket.on('hello', async () => {`,
          `  for (const msg of await db.undelivered(user)) socket.send(msg);`,
          `});`,
        ]
      : [
          `async function deliver(msg) {`,
          `  socket.send(msg);                    // still only ✓ until the phone says so`,
          `}`,
          `socket.on('ack', ({ seq }) => db.setCursor(device, seq));   // ✓✓ up to seq`,
          `socket.on('hello', async ({ cursor }) => {`,
          `  for (const msg of await db.messagesAfter(cursor)) socket.send(msg);`,
          `});`,
        ]),
  ];
};

// ---- run ----

function run(k: KnobValues): Frame[] {
  const d = (k.delivery as Delivery) ?? 'write';
  const hb = k.heartbeats !== false;
  const src = source(k);
  const at = (a: string) => lineOf(src, a);

  let t = HEARTBEAT;
  const sent = new Set<number>(); // stored on the server
  const inSocket = new Set<number>(); // written into the dead socket's send buffer
  const phone = new Set<number>([CURSOR]); // messages on Bob's phone
  let cursor = CURSOR;
  let socketOpen = true; // as the gateway sees it
  let back = false;
  const delivered = new Set<number>(); // what Alice's ✓✓ claims

  const inTunnel = () => t >= TUNNEL && !back;
  const isListed = () => listed(hb, t);

  const tokens = (): Token[] => [
    ...[CURSOR, ...MSGS.map((m) => m.seq)].filter((s) => s === CURSOR || sent.has(s)).map((s) => ({ id: `log-${s}`, label: tag(s), node: 'store', tone: 'idle' as const })),
    ...[...inSocket].map((s) => ({ id: `buf-${s}`, label: tag(s), node: 'gw', tone: 'fail' as const })),
    ...[...phone].sort().map((s) => ({ id: `phone-${s}`, label: tag(s), node: 'bob', tone: s === CURSOR ? ('idle' as const) : ('ok' as const) })),
  ];

  const nodes = (): Record<string, NodeState> => ({
    alice: {
      rows: [
        { kind: 'kv', label: 'Bob is', value: isListed() ? 'online' : 'offline', tone: isListed() && inTunnel() ? 'warn' : 'idle' },
        ...MSGS.filter((m) => sent.has(m.seq)).map((m) => ({
          kind: 'kv' as const,
          label: tag(m.seq),
          value: delivered.has(m.seq) ? '✓✓' : '✓',
          tone: delivered.has(m.seq) && !phone.has(m.seq) ? ('fail' as const) : delivered.has(m.seq) ? ('ok' as const) : ('idle' as const),
        })),
      ],
    },
    server: { rows: [{ kind: 'kv', label: 'last seq', value: String(Math.max(CURSOR, ...sent)) }] },
    registry: {
      tone: isListed() && inTunnel() ? 'warn' : 'idle',
      rows: [
        {
          kind: 'kv',
          label: 'bob',
          value: !isListed()
            ? 'expired'
            : hb && !back
              ? `gateway · ${fmtS(Math.max(0, expiresAt(hb) - t))} left`
              : 'gateway',
          tone: !isListed() ? 'dim' : inTunnel() ? 'warn' : 'idle',
        },
      ],
    },
    gw: {
      rows: back
        ? [
            { kind: 'kv', label: 'socket', value: 'new, open', tone: 'ok' },
            // Without heartbeats nothing closed the old one: TCP is still retrying into it.
            ...(socketOpen ? [{ kind: 'kv' as const, label: 'old', value: 'still open', tone: 'warn' as const }] : []),
          ]
        : [{ kind: 'kv', label: 'socket', value: socketOpen ? 'open' : 'closed', tone: socketOpen && inTunnel() ? 'warn' : 'idle' }],
    },
    bob: {
      sub: inTunnel() ? 'in a tunnel' : 'connected',
      tone: inTunnel() ? 'dim' : 'idle',
      rows: d === 'cursor' ? [{ kind: 'kv', label: 'cursor', value: String(cursor) }] : [],
    },
    store: {},
  });

  const metrics = (): Metric[] => [
    { label: 'Clock', value: `t = ${t} s` },
    { label: 'On Bob’s phone', value: [...phone].sort().map(tag).join(' '), tone: back && phone.size < MSGS.length + 1 ? 'fail' : 'idle' },
    { label: 'Alice sees ✓✓', value: delivered.size ? [...delivered].sort().map(tag).join(' ') : '—', tone: [...delivered].some((s) => !phone.has(s)) ? 'fail' : 'idle' },
    { label: 'Lost', value: back ? String(MSGS.length + 1 - phone.size) : '—', tone: back && phone.size < MSGS.length + 1 ? 'fail' : 'idle' },
  ];

  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 't' | 'nodes' | 'metrics' | 'tokens' | 'links'>) =>
    frames.push({ ...f, t: t * 1000, nodes: nodes(), metrics: metrics(), tokens: tokens(), links: inTunnel() ? { 'gw-bob': 'cut' } : undefined });

  // ---- 0. connected ----
  push({
    line: at('registry.set('),
    packets: [
      { edge: 'gw-bob', dir: -1, kind: 'req', label: hb ? 'heartbeat' : 'open' },
      { edge: 'gw-registry', dir: 1, kind: 'ok', delay: 450 },
    ],
    // Worded the same whichever settings are on, so flipping a knob resumes at the prediction.
    say: `t = ${t} s: Bob's phone is connected to a gateway, and the presence registry records which gateway holds his connection. His phone has everything up to ${tag(CURSOR)}.`,
    why: [
      'The chat server asks the registry where to deliver each message, so the registry has to know when a connection stops being real.',
      hb
        ? `Here it learns from heartbeats: the phone sends one every ${HEARTBEAT} s, and each keeps the entry alive for another ${TTL} s.`
        : 'Here the entry is written when the connection opens and deleted when it closes — so it is only as current as the server\'s idea of whether the socket is open.',
    ],
  });

  // ---- 1. the tunnel ----
  t = TUNNEL;
  push({
    say: `t = ${t} s: Bob's train enters a tunnel. The phone loses signal mid-connection — no close frame, no FIN. The gateway still sees an open socket.`,
    why: [
      'A connection only ends cleanly if one side gets to say so. A phone that loses signal says nothing, so the server side keeps a socket that looks healthy and leads nowhere — a half-open connection.',
    ],
  });

  // ---- 2. predict ----
  const got = received(d, hb).filter((s) => s !== CURSOR);
  push({
    say: 'Checkpoint — predict.',
    checkpoint: {
      kind: 'predict',
      prompt: `Alice sends ${list(MSGS.map((m) => `${tag(m.seq)} at ${m.at} s`))}. Bob comes out of the tunnel at ${BACK} s and reconnects. Which of the three show up on his phone?`,
      options: ['All three', `Only ${tag(MSGS[2].seq)}`, 'None of them'],
      answer: got.length === MSGS.length ? 0 : got.length === 0 ? 2 : 1,
      reveal:
        d === 'cursor'
          ? `All three. Whatever happened to the copies written into the dead socket doesn't matter: on reconnect the phone says "I have everything up to ${tag(CURSOR)}", and the server sends everything after it from the stored conversation.`
          : got.length === 0
            ? `None of them. With no heartbeat to miss, the registry says Bob is online the whole minute, so all three are written into the dead socket, marked delivered, and never sent again. Alice sees ✓✓ on all three.`
            : `Only ${list(got.map(tag))}. ${list(MSGS.filter((m) => !got.includes(m.seq)).map((m) => tag(m.seq)))} were written into the dead socket while the registry still listed Bob, so they were marked delivered — and a reconnect only fetches what isn't. Alice's screen shows ✓✓ on messages Bob will never see.`,
      source: { title: 'The WebSocket Protocol (RFC 6455)', url: 'https://www.rfc-editor.org/rfc/rfc6455.html' },
    },
  });

  // ---- 3+. Alice's messages ----
  for (const m of MSGS) {
    // Registry expiry and the gateway closing the dead socket happen before #43.
    if (hb && socketOpen && m.at >= expiresAt(hb)) {
      t = expiresAt(hb);
      socketOpen = false;
      const dropped = [...inSocket];
      inSocket.clear();
      push({
        line: at('registry.set('),
        say: `t = ${t} s: ${TTL} s after Bob's last heartbeat, his registry entry expires and the gateway closes the silent socket — discarding ${list(dropped.map(tag))}, which were still in its send buffer. Alice now sees Bob offline.`,
        why: [
          'This is why presence is a TTL rather than an entry deleted on close: a phone in a tunnel can never send the delete. Silence is the only signal a dead device gives, and a TTL turns silence into an answer.',
        ],
      });
    }

    t = m.at;
    sent.add(m.seq);
    const intoSocket = pushedIntoDeadSocket(hb, m.seq);
    if (intoSocket) {
      inSocket.add(m.seq);
      if (d === 'write') delivered.add(m.seq);
    }
    push({
      line: intoSocket ? (d === 'write' ? at('db.markDelivered') : at('socket.send(msg);')) : at('pushNotify('),
      vars: { seq: String(m.seq), gateway: intoSocket ? 'found' : 'none' },
      packets: [
        { edge: 'alice-server', dir: 1, kind: 'req', label: tag(m.seq) },
        { edge: 'server-store', dir: 1, kind: 'ok', delay: 300 },
        { edge: 'server-registry', dir: 1, kind: 'req', delay: 520 },
        { edge: 'server-registry', dir: -1, kind: intoSocket ? 'ok' : 'nil', delay: 760 },
        ...(intoSocket ? [{ edge: 'server-gw', dir: 1 as const, kind: 'req' as const, delay: 1000 }, { edge: 'gw-bob', dir: 1 as const, kind: 'fail' as const, delay: 1300 }] : []),
      ],
      say: intoSocket
        ? `t = ${t} s: Alice sends ${tag(m.seq)}, "${m.text}". The registry still lists Bob, so the gateway writes it to his socket — and the write succeeds.${
            d === 'write' ? ' The server marks it delivered: Alice sees ✓✓.' : ' No ack comes back, so Alice still sees ✓.'
          }`
        : `t = ${t} s: Alice sends ${tag(m.seq)}, "${m.text}". The registry has no entry for Bob, so it is stored and a push notification goes out instead. Alice sees ✓.`,
      why:
        intoSocket && m === MSGS[0]
          ? [
              'A successful write only means the kernel accepted the bytes. TCP will retransmit them for many minutes before giving up, and its keepalive — on sockets that enable it — waits ' +
                fmtLong(KEEPALIVE) +
                ' of silence before it even starts probing. Neither tells the app the phone has gone.',
            ]
          : undefined,
    });
  }

  // ---- reconnect ----
  t = BACK;
  back = true;
  const fetched = d === 'cursor' ? MSGS.map((m) => m.seq).filter((s) => s > cursor) : MSGS.map((m) => m.seq).filter((s) => !delivered.has(s));
  for (const s of fetched) phone.add(s);
  if (d === 'cursor') {
    cursor = Math.max(cursor, ...fetched);
    for (const s of fetched) delivered.add(s);
  } else for (const s of fetched) delivered.add(s);
  const missing = MSGS.map((m) => m.seq).filter((s) => !phone.has(s));
  if (phone.size !== received(d, hb).length) throw new Error(`chat-delivery(${d}, ${hb}): frames disagree with received()`);
  push({
    line: d === 'cursor' ? at('db.messagesAfter') : at('db.undelivered'),
    vars: d === 'cursor' ? { cursor: String(CURSOR), sent: fetched.map(tag).join(' ') || 'nothing' } : { undelivered: fetched.map(tag).join(' ') || 'none' },
    packets: [
      { edge: 'gw-bob', dir: -1, kind: 'req', label: d === 'cursor' ? `hello · cursor ${CURSOR}` : 'hello' },
      { edge: 'gw-registry', dir: 1, kind: 'ok', delay: 400 },
      ...fetched.map((s, i) => ({ edge: 'gw-bob', dir: 1 as const, kind: 'ok' as const, label: tag(s), delay: 800 + i * 220 })),
      ...(d === 'cursor' && fetched.length ? [{ edge: 'gw-bob', dir: -1 as const, kind: 'req' as const, label: `ack ${cursor}`, delay: 900 + fetched.length * 220 }] : []),
    ],
    say:
      d === 'cursor'
        ? `t = ${t} s: Bob reconnects and says "I have up to ${tag(CURSOR)}". The server sends ${list(fetched.map(tag))} from the stored conversation, the phone acks ${tag(cursor)}, and only now does Alice see ✓✓.`
        : fetched.length
          ? `t = ${t} s: Bob reconnects and asks for what wasn't delivered: only ${list(fetched.map(tag))}. ${list(missing.map(tag))} — marked delivered — never arrive.`
          : `t = ${t} s: Bob reconnects and asks for what wasn't delivered: nothing. All three were marked delivered when they went into the dead socket; none of them arrive.`,
  });

  // ---- closing ----
  const closing: Checkpoint =
    d === 'write'
      ? {
          kind: 'break',
          prompt: `Alice's screen says ${list([...delivered].filter((s) => !phone.has(s)).map(tag))} ${missing.length === 1 ? 'was' : 'were'} delivered. Bob will never see ${missing.length === 1 ? 'it' : 'them'}. What should "delivered" mean, and what should a reconnect ask for?`,
          reveal: `Delivered should mean the device said it has the message, not that the server's write succeeded. Let the device keep a cursor — the highest sequence number it has stored — and acknowledge as it advances; on reconnect it sends the cursor and the server replays everything after it. If an ack is lost the server sends a message twice, so the device drops sequence numbers it already has.`,
          knob: { id: 'delivery', value: 'cursor', label: 'Deliver by device cursor' },
        }
      : hb
        ? {
            kind: 'why',
            prompt: 'Bob also has a laptop. Why does each device keep its own cursor, rather than the server keeping a "delivered" flag on each message?',
            reveal: `Because devices go offline independently. A flag per message can't say "the laptop has #41 but the phone doesn't", and a flag per message per device grows with every message. A cursor per device per conversation is one number, and catching up is one query — everything after it — whether the device was gone for a minute or a week.`,
          }
        : {
            kind: 'why',
            prompt: 'With cursors, every message arrived even though the server never noticed Bob was gone. So why do chat apps still send heartbeats?',
            reveal: `For everything except correctness. Alice saw Bob "online" the whole minute, and would have for hours: TCP retransmits for many minutes before giving up, and keepalive waits ${fmtLong(KEEPALIVE)} of silence before probing. No push notification went out because the server thought he was connected. And the gateway held a dead socket and its buffers. A heartbeat with a short TTL turns silence into "offline" in seconds.`,
            source: { title: 'tcp(7) — Linux manual page', url: 'https://man7.org/linux/man-pages/man7/tcp.7.html' },
          };
  push({ say: closing.kind === 'break' ? 'Checkpoint — fix it.' : 'Checkpoint — why.', checkpoint: closing });

  return frames;
}

export const chatDelivery: Scenario = {
  id: 'chat-delivery',
  topic: 'chat-system',
  title: 'A phone in a tunnel',
  summary: 'Bob loses signal without closing his connection while Alice keeps sending — and what "delivered" means decides what he sees.',
  stage: {
    width: 648,
    height: 350,
    nodes: [
      { id: 'registry', label: 'PRESENCE REGISTRY', x: 166, y: 16, w: 186, h: 64 },
      { id: 'alice', label: "Alice's screen", x: 16, y: 112, w: 130, h: 134 },
      { id: 'server', label: 'chat server', x: 166, y: 128, w: 186, h: 70 },
      { id: 'store', label: 'MESSAGES', sub: 'stored in order', x: 166, y: 230, w: 186, h: 104 },
      { id: 'gw', label: 'gateway', x: 372, y: 112, w: 136, h: 122 },
      { id: 'bob', label: "Bob's phone", sub: 'connected', x: 524, y: 112, w: 108, h: 122 },
    ],
    edges: [
      { id: 'alice-server', from: 'alice', to: 'server', fromPort: { side: 'r', at: (163 - 112) / 134 }, toPort: { side: 'l' } },
      { id: 'server-registry', from: 'server', to: 'registry', fromPort: { side: 't' }, toPort: { side: 'b' } },
      { id: 'server-store', from: 'server', to: 'store', fromPort: { side: 'b' }, toPort: { side: 't' } },
      { id: 'server-gw', from: 'server', to: 'gw', fromPort: { side: 'r' }, toPort: { side: 'l', at: (163 - 112) / 122 } },
      { id: 'gw-bob', from: 'gw', to: 'bob', fromPort: { side: 'r' }, toPort: { side: 'l' } },
      { id: 'gw-registry', from: 'gw', to: 'registry', fromPort: { side: 't' }, toPort: { side: 'r' }, via: [[440, 48]] },
    ],
  },
  knobs: [
    {
      id: 'delivery',
      kind: 'choice',
      label: 'delivered means',
      default: 'write',
      options: [
        { value: 'write', label: 'socket write succeeded' },
        { value: 'cursor', label: 'device acked (cursor)' },
      ],
    },
    { id: 'heartbeats', kind: 'toggle', label: 'heartbeats', default: true },
  ],
  source,
  run,
};
