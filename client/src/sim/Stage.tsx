import { useEffect, useRef } from 'react';
import type { Frame, NodeState, Packet, Port, Row, Stage as StageSpec, StageNode, Tone } from './types';

/**
 * Fixed-scale SVG renderer for a scenario.
 *
 * It never shrinks to fit: on a narrow screen the stage scrolls sideways, so
 * text stays at the size it was drawn. (The old React Flow diagrams scaled
 * whole tables down to ~6px to fit, which is the main thing this replaces.)
 */

export const SCOPE = {
  ground: '#0D1015',
  node: '#10151D',
  nodeDown: '#0C1016',
  line: '#2A3340',
  grid: '#FFFFFF08',
  ink: '#D8DEE7',
  ink2: '#8C96A5',
  ink3: '#5D6776',
  accent: '#7593FF',
  accentSoft: '#9FB2FF',
  ok: '#3FC78E',
  warn: '#F2B632',
  fail: '#FF6B70',
} as const;

export const TONE: Record<Tone, string> = {
  idle: SCOPE.ink2,
  active: SCOPE.accent,
  ok: SCOPE.ok,
  warn: SCOPE.warn,
  fail: SCOPE.fail,
  dim: SCOPE.ink3,
};

const STROKE: Record<Tone, string> = {
  idle: SCOPE.line,
  active: '#5670C9',
  ok: '#2E7D5F',
  warn: '#9C7A2C',
  fail: '#B24A4F',
  dim: '#1E2631',
};

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
// Plex Mono advances 0.6em per character.
const CHAR_W_11 = 11 * 0.6;
const CHAR_W_12 = 12 * 0.6;
const CHAR_W_115 = 11.5 * 0.6;

function portPoint(n: StageNode, p: Port | undefined, fallback: Port['side']): [number, number] {
  const side = p?.side ?? fallback;
  const at = p?.at ?? 0.5;
  switch (side) {
    case 'l':
      return [n.x, n.y + n.h * at];
    case 'r':
      return [n.x + n.w, n.y + n.h * at];
    case 't':
      return [n.x + n.w * at, n.y];
    case 'b':
      return [n.x + n.w * at, n.y + n.h];
  }
}

type Pt = [number, number];

export function edgeGeometry(spec: StageSpec): Record<string, Pt[]> {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const out: Record<string, Pt[]> = {};
  for (const e of spec.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    out[e.id] = [portPoint(a, e.fromPort, 'r'), ...(e.via ?? []), portPoint(b, e.toPort, 'l')];
  }
  return out;
}

/** Position at fraction u (0..1) of a polyline's length. */
function along(pts: Pt[], u: number): Pt {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let want = u * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] === 0 ? 0 : Math.min(1, want / seg[i]);
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    }
    want -= seg[i];
  }
  return pts[pts.length - 1];
}

function midpoint(pts: Pt[]): Pt {
  return along(pts, 0.5);
}

function rowHeight(r: Row): number {
  switch (r.kind) {
    case 'kv':
      return 20;
    case 'bar':
      return 12;
    case 'slots':
      return 36;
    case 'log':
      return 44;
  }
}

function Rows({ node, rows, top }: { node: StageNode; rows: Row[]; top: number }) {
  let y = top;
  const x0 = node.x + 12;
  const x1 = node.x + node.w - 12;
  const inner = x1 - x0;
  return (
    <>
      {rows.map((r, i) => {
        const at = y;
        y += rowHeight(r);
        switch (r.kind) {
          case 'kv': {
            // Monospace, so width is predictable: never let label and value collide.
            const valueW = (r.value?.length ?? 0) * CHAR_W_11;
            const room = Math.floor((inner - valueW - 10) / CHAR_W_115);
            const label = r.label.length > room ? r.label.slice(0, Math.max(3, room - 1)) + '…' : r.label;
            return (
              <g key={i}>
                <text x={x0} y={at + 13} fill={r.tone === 'dim' ? SCOPE.ink3 : SCOPE.ink} fontFamily={MONO} fontSize={11.5}>
                  <title>{r.label}</title>
                  {label}
                </text>
                {r.value && (
                  <text x={x1} y={at + 13} textAnchor="end" fill={TONE[r.tone ?? 'idle']} fontFamily={MONO} fontSize={11}>
                    {r.value}
                  </text>
                )}
              </g>
            );
          }
          case 'bar': {
            const w = r.max > 0 ? Math.max(0, Math.min(1, r.value / r.max)) * inner : 0;
            return (
              <g key={i}>
                <rect x={x0} y={at} width={inner} height={4} rx={1} fill="#1E2631" />
                {w > 0 && <rect x={x0} y={at} width={Math.max(2, w)} height={4} rx={1} fill={TONE[r.tone ?? 'ok']} />}
              </g>
            );
          }
          case 'slots': {
            const gap = 3;
            const size = Math.min(14, Math.floor((inner - gap * (r.total - 1)) / r.total));
            return (
              <g key={i}>
                {r.label && (
                  <text x={x0} y={at + 12} fill={SCOPE.ink2} fontFamily={MONO} fontSize={11}>
                    {r.label}
                  </text>
                )}
                {Array.from({ length: r.total }, (_, k) => {
                  const on = k < r.filled;
                  const c = TONE[r.tone ?? 'active'];
                  return (
                    <rect
                      key={k}
                      x={x0 + k * (size + gap)}
                      y={at + 18}
                      width={size}
                      height={size}
                      rx={2}
                      fill={on ? c : '#1A212B'}
                      stroke={on ? c : '#2A3340'}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            );
          }
          case 'log': {
            const cw = 30;
            return (
              <g key={i}>
                {r.label && (
                  <text x={x0} y={at + 12} fill={SCOPE.ink2} fontFamily={MONO} fontSize={11}>
                    {r.label}
                  </text>
                )}
                {r.entries.slice(0, Math.floor(inner / (cw + 3))).map((e, k) => {
                  const c = TONE[e.tone ?? 'idle'];
                  return (
                    <g key={k}>
                      <rect
                        x={x0 + k * (cw + 3)}
                        y={at + 18}
                        width={cw}
                        height={20}
                        rx={2}
                        fill={e.tone === 'ok' ? '#153326' : '#141B25'}
                        stroke={c}
                        strokeWidth={1}
                        strokeDasharray={e.tone === 'dim' ? '3 2' : undefined}
                      />
                      <text x={x0 + k * (cw + 3) + cw / 2} y={at + 32} textAnchor="middle" fill={c} fontFamily={MONO} fontSize={10.5}>
                        {e.text}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          }
        }
      })}
    </>
  );
}

function Node({ node, state }: { node: StageNode; state: NodeState | undefined }) {
  const tone = state?.tone ?? 'idle';
  const compact = node.h <= 46;
  const titleY = compact ? node.y + node.h / 2 + 4 : node.y + 20;
  const sub = state?.sub ?? node.sub;
  const down = tone === 'fail' && state?.badge === 'DOWN';
  // Title and badge share one line: shorten the badge rather than overlap.
  let badge = state?.badge;
  if (badge) {
    const room = Math.floor((node.w - 22 - node.label.length * CHAR_W_12 - 10) / CHAR_W_11);
    if (room < 3) badge = undefined;
    else if (badge.length > room) badge = badge.slice(0, room - 1) + '…';
  }
  return (
    <g opacity={tone === 'dim' ? 0.55 : 1}>
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={4}
        fill={down ? SCOPE.nodeDown : SCOPE.node}
        stroke={STROKE[tone]}
        strokeWidth={tone === 'idle' || tone === 'dim' ? 1 : 1.5}
        strokeDasharray={down ? '5 4' : undefined}
      />
      <text x={node.x + 12} y={titleY} fill={down ? SCOPE.ink3 : SCOPE.ink} fontFamily={MONO} fontSize={12} fontWeight={500}>
        {node.label}
      </text>
      {badge && (
        <text x={node.x + node.w - 10} y={titleY} textAnchor="end" fill={TONE[state?.badgeTone ?? tone]} fontFamily={MONO} fontSize={11}>
          {badge}
        </text>
      )}
      {!compact && sub && (
        <text x={node.x + 12} y={node.y + 36} fill={SCOPE.ink2} fontFamily={MONO} fontSize={11}>
          {sub}
        </text>
      )}
      {!compact && state?.rows && <Rows node={node} rows={state.rows} top={node.y + (sub ? 46 : 32)} />}
    </g>
  );
}

const PACKET_FILL: Record<Packet['kind'], string> = {
  req: SCOPE.accent,
  ok: SCOPE.ok,
  nil: 'none',
  fail: SCOPE.fail,
};
const PACKET_TEXT: Record<Packet['kind'], string> = {
  req: SCOPE.accentSoft,
  ok: SCOPE.ok,
  nil: SCOPE.ink2,
  fail: SCOPE.fail,
};

export function Stage({
  spec,
  frame,
  animate,
  speed,
  onSettled,
}: {
  spec: StageSpec;
  frame: Frame;
  /** Interpolate this frame's packets. False when stepping back or jumping. */
  animate: boolean;
  speed: number;
  /** Called when the packet animation finishes (or immediately if none). */
  onSettled?: () => void;
}) {
  const layer = useRef<SVGGElement | null>(null);
  const geom = edgeGeometry(spec);
  // The animation outlives renders; always call the latest callback, not the
  // one captured when the step started (the learner may have paused since).
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    const packets = frame.packets ?? [];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduced || packets.length === 0) {
      settledRef.current?.();
      return;
    }

    const NS = 'http://www.w3.org/2000/svg';
    const dur = 620 / speed;
    const fade = 260 / speed;
    const showLabels = packets.length <= 2;
    const items = packets
      .filter((p) => geom[p.edge])
      .map((p) => {
        const path = p.dir > 0 ? geom[p.edge] : [...geom[p.edge]].reverse();
        const el = document.createElementNS(NS, 'g');
        el.setAttribute('opacity', '0');
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', '5.5');
        c.setAttribute('fill', PACKET_FILL[p.kind]);
        if (p.kind === 'nil') {
          c.setAttribute('stroke', SCOPE.ink2);
          c.setAttribute('stroke-width', '1.5');
        }
        el.appendChild(c);
        if (showLabels && p.label) {
          const tx = document.createElementNS(NS, 'text');
          tx.setAttribute('x', '9');
          tx.setAttribute('y', '-8');
          tx.setAttribute('fill', PACKET_TEXT[p.kind]);
          tx.setAttribute('font-family', MONO);
          tx.setAttribute('font-size', '10.5');
          tx.textContent = p.label;
          el.appendChild(tx);
        }
        g.appendChild(el);
        return { el, path, delay: (p.delay ?? 0) / speed };
      });

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      let live = false;
      for (const it of items) {
        const e = now - t0 - it.delay;
        if (e < 0) {
          live = true;
          continue;
        }
        const u = Math.min(1, e / dur);
        const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const [x, y] = along(it.path, ease);
        it.el.setAttribute('transform', `translate(${x},${y})`);
        const opacity = u < 1 ? 1 : Math.max(0, 1 - (e - dur) / fade);
        it.el.setAttribute('opacity', String(opacity));
        if (u < 1 || e - dur < fade) live = true;
      }
      if (live) raf = requestAnimationFrame(tick);
      else {
        while (g.firstChild) g.removeChild(g.firstChild);
        settledRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // geom is derived from spec; re-run only when the frame or mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, animate, speed]);

  return (
    <svg
      viewBox={`0 0 ${spec.width} ${spec.height}`}
      width={spec.width}
      height={spec.height}
      className="block h-auto w-full"
      // Below 90% of drawn size the 11px labels would drop under 10px, so the
      // container scrolls instead.
      style={{ minWidth: Math.round(spec.width * 0.9) }}
      role="img"
      aria-label={`Architecture: ${spec.nodes.map((n) => n.label).join(', ')}`}
    >
      <defs>
        <pattern id="scope-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke={SCOPE.grid} strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={spec.width} height={spec.height} fill="url(#scope-grid)" />

      {spec.regions?.map((r) => (
        <text key={r.label} x={r.x} y={r.y} textAnchor={r.anchor ?? 'start'} fill={SCOPE.ink3} fontFamily={MONO} fontSize={10.5} letterSpacing="0.08em">
          {r.label}
        </text>
      ))}

      {spec.edges.map((e) => {
        const pts = geom[e.id];
        if (!pts) return null;
        const state = frame.links?.[e.id];
        const [mx, my] = midpoint(pts);
        const quiet = e.quiet && state !== 'hot';
        return (
          <g key={e.id}>
            <polyline
              points={pts.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke={state === 'cut' ? '#5A2A30' : state === 'hot' ? '#5670C9' : quiet ? '#1C232D' : SCOPE.line}
              strokeWidth={state === 'hot' ? 1.75 : 1.25}
              strokeDasharray={state === 'cut' || quiet ? '4 4' : undefined}
              strokeLinejoin="round"
            />
            {state === 'cut' && (
              <g transform={`translate(${mx},${my})`}>
                <rect x={-8} y={-8} width={16} height={16} rx={2} fill={SCOPE.ground} stroke={SCOPE.fail} />
                <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke={SCOPE.fail} strokeWidth={1.5} />
              </g>
            )}
          </g>
        );
      })}

      {spec.nodes.map((n) => (
        <Node key={n.id} node={n} state={frame.nodes[n.id]} />
      ))}

      <g ref={layer} />
    </svg>
  );
}
