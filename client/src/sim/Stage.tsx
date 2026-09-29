import { useEffect, useId, useMemo, useRef } from 'react';
import { type LucideIcon, Braces, Boxes, Cloud, Cpu, Database, Globe, Mail, Monitor, Network, Server, Smartphone, Zap } from 'lucide-react';
import type { Frame, NodeIcon, NodeState, Packet, Row, Stage as StageSpec, StageEdge, StageNode, Tone } from './types';
import { EDGE_LABEL, LEAD, PAD, SIZE, along, edgeGeometry, midpoint, nodeLines, placeLabels, tableColumns } from './layout';
export { edgeGeometry };

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
    case 'text':
      return r.lines.length * LEAD.body + 4;
    case 'table':
      return (r.rows.length + 1) * LEAD.cell + 4;
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
          case 'text':
          case 'table':
            return <StaticRow key={i} row={r} x={x0} y={at} />;
        }
      })}
    </>
  );
}

/** Prose lines and tables: rows that describe a component rather than track it. */
function StaticRow({ row, x, y }: { row: Row; x: number; y: number }) {
  if (row.kind === 'text') {
    return (
      <>
        {row.lines.map((l, k) => (
          <text key={k} x={x} y={y + 10.5 + k * LEAD.body} fill={row.tone ? TONE[row.tone] : SCOPE.ink2} fontFamily={MONO} fontSize={SIZE.body}>
            {l}
          </text>
        ))}
      </>
    );
  }
  if (row.kind !== 'table') return null;
  const cols = tableColumns(row);
  const width = cols.reduce((a, b) => a + b, 0);
  const lefts = cols.map((_, i) => x + cols.slice(0, i).reduce((a, b) => a + b, 0));
  const all = [row.columns, ...row.rows];
  return (
    <g>
      <rect x={x} y={y} width={width} height={LEAD.cell} fill="#161D27" />
      {all.map((cells, r) =>
        cells.map((c, i) => (
          <text
            key={`${r}-${i}`}
            x={lefts[i] + 6}
            y={y + r * LEAD.cell + 12.5}
            fill={r === 0 ? SCOPE.ink : SCOPE.ink2}
            fontFamily={MONO}
            fontSize={SIZE.cell}
            fontWeight={r === 0 ? 500 : 400}
          >
            {c}
          </text>
        )),
      )}
      {all.map((_, r) => (
        <line key={`h${r}`} x1={x} x2={x + width} y1={y + (r + 1) * LEAD.cell} y2={y + (r + 1) * LEAD.cell} stroke="#232B37" />
      ))}
      {lefts.slice(1).map((lx, i) => (
        <line key={`v${i}`} x1={lx} x2={lx} y1={y} y2={y + all.length * LEAD.cell} stroke="#232B37" />
      ))}
      <rect x={x} y={y} width={width} height={all.length * LEAD.cell} fill="none" stroke="#2A3340" />
    </g>
  );
}

const ICONS: Record<NodeIcon, LucideIcon | null> = {
  client: Monitor,
  mobile: Smartphone,
  dns: Globe,
  cdn: Cloud,
  lb: Network,
  server: Server,
  worker: Cpu,
  database: Database,
  nosql: Braces,
  cache: Zap,
  queue: Mail,
  service: Boxes,
  note: null,
};

/**
 * Component with an icon, a wrapped title and subtitle, and optional static
 * rows. Geometry comes from nodeLines(), the function the layout validator
 * uses, so what is checked is what is drawn.
 */
function RichNode({ node, state }: { node: StageNode; state: NodeState | undefined }) {
  const tone = state?.tone ?? 'idle';
  const L = nodeLines(node);
  const { x, y, w, h } = node;
  const shape = node.shape ?? 'box';
  const failed = tone === 'fail';
  const stroke = failed ? STROKE.fail : tone === 'active' ? STROKE.active : shape === 'note' ? '#3A4658' : STROKE.idle;
  const width = tone === 'active' || failed ? 1.5 : 1;
  const Icon = node.icon ? ICONS[node.icon] : null;
  const body =
    shape === 'queue' ? (
      <polygon
        points={`${x},${y} ${x + w - 12},${y} ${x + w},${y + h / 2} ${x + w - 12},${y + h} ${x},${y + h}`}
        fill={SCOPE.node}
        stroke={stroke}
        strokeWidth={width}
        strokeLinejoin="round"
      />
    ) : (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        fill={shape === 'note' ? '#0F141B' : SCOPE.node}
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={shape === 'note' ? '4 3' : undefined}
      />
    );
  const subTop = y + PAD + L.titleLines.length * LEAD.title + 3;
  return (
    <g opacity={tone === 'dim' ? 0.32 : 1} style={{ transition: 'opacity 180ms' }}>
      {node.stacked && (
        <>
          <rect x={x + 10} y={y - 10} width={w} height={h} rx={4} fill={SCOPE.node} stroke={stroke} strokeWidth={1} opacity={0.45} />
          <rect x={x + 5} y={y - 5} width={w} height={h} rx={4} fill={SCOPE.node} stroke={stroke} strokeWidth={1} opacity={0.75} />
        </>
      )}
      {body}
      {Icon && (
        <Icon
          x={x + PAD - 1}
          y={y + PAD - 1}
          width={14}
          height={14}
          size={14}
          color={tone === 'active' ? SCOPE.accent : failed ? SCOPE.fail : SCOPE.ink2}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      {L.titleLines.map((t, i) => (
        <text key={`t${i}`} x={x + L.titleX} y={y + PAD + 11 + i * LEAD.title} fill={failed ? SCOPE.fail : SCOPE.ink} fontFamily={MONO} fontSize={SIZE.title} fontWeight={500}>
          {t}
        </text>
      ))}
      {L.subLines.map((t, i) => (
        <text key={`s${i}`} x={x + PAD} y={subTop + 10.5 + i * LEAD.sub} fill={SCOPE.ink2} fontFamily={MONO} fontSize={SIZE.sub}>
          {t}
        </text>
      ))}
      {node.rows?.map((r, i) => {
        const top = y + L.rowsTop + (node.rows ?? []).slice(0, i).reduce((a, b) => a + rowHeight(b), 0);
        return <StaticRow key={`r${i}`} row={r} x={x + PAD} y={top} />;
      })}
      {node.marker !== undefined && (
        <g>
          <rect x={x - 8} y={y - 8} width={16} height={16} rx={2} fill="#1A212B" stroke={tone === 'active' ? STROKE.active : '#3A4658'} />
          <text x={x} y={y + 3.5} textAnchor="middle" fill={SCOPE.ink} fontFamily={MONO} fontSize={10} fontWeight={600}>
            {node.marker}
          </text>
        </g>
      )}
      {failed && (
        <g>
          <rect x={x + w - 8} y={y - 8} width={16} height={16} rx={2} fill={SCOPE.ground} stroke={SCOPE.fail} />
          <path d={`M${x + w - 4} ${y - 4} L${x + w + 4} ${y + 4} M${x + w + 4} ${y - 4} L${x + w - 4} ${y + 4}`} stroke={SCOPE.fail} strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
}

function Node({ node, state }: { node: StageNode; state: NodeState | undefined }) {
  if (node.icon || node.shape || node.rows) return <RichNode node={node} state={state} />;
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

/** Authored edge colours, muted at rest and full strength when lit. */
const EDGE_TONE: Record<NonNullable<StageEdge['color']>, { base: string; hot: string }> = {
  blue: { base: '#3B4C86', hot: '#7593FF' },
  green: { base: '#28604B', hot: '#3FC78E' },
  purple: { base: '#524684', hot: '#B69CFF' },
  red: { base: '#7E3B40', hot: '#FF6B70' },
  gray: { base: '#37404D', hot: '#8C96A5' },
};

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
  minScale = 0.9,
  maxScale,
}: {
  spec: StageSpec;
  /** Below this fraction of drawn size the container scrolls instead of shrinking. */
  minScale?: number;
  /** Cap on how far the drawing may grow to fill a wide container. */
  maxScale?: number;
  frame: Frame;
  /** Interpolate this frame's packets. False when stepping back or jumping. */
  animate: boolean;
  speed: number;
  /** Called when the packet animation finishes (or immediately if none). */
  onSettled?: () => void;
}) {
  const layer = useRef<SVGGElement | null>(null);
  const uid = useId().replace(/:/g, '');
  const geom = useMemo(() => edgeGeometry(spec), [spec]);
  // Diagrams arrive with labels already placed; anything else is placed here.
  const labels = useMemo(() => {
    const need = spec.edges.some((e) => (e.label || e.step !== undefined) && !e.labelBox);
    return need ? placeLabels(spec) : {};
  }, [spec]);
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
      style={{
        minWidth: Math.round(spec.width * minScale),
        maxWidth: maxScale ? Math.round(spec.width * maxScale) : undefined,
        margin: '0 auto',
      }}
      role="img"
      aria-label={`Architecture: ${spec.nodes.map((n) => n.label).join(', ')}`}
    >
      <defs>
        <pattern id={`${uid}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke={SCOPE.grid} strokeWidth="1" />
        </pattern>
        {Object.entries(EDGE_TONE).flatMap(([name, c]) =>
          (['base', 'hot'] as const).map((k) => (
            <marker
              key={`${name}-${k}`}
              id={`${uid}-arrow-${name}-${k}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 1 L10 5 L0 9 z" fill={c[k]} />
            </marker>
          )),
        )}
      </defs>
      <rect x={0} y={0} width={spec.width} height={spec.height} fill={`url(#${uid}-grid)`} />

      {spec.regions?.map((r, i) => {
        if (r.w === undefined || r.h === undefined) {
          return (
            <text key={i} x={r.x} y={r.y} textAnchor={r.anchor ?? 'start'} fill={SCOPE.ink3} fontFamily={MONO} fontSize={10.5} letterSpacing="0.08em">
              {r.label}
            </text>
          );
        }
        const at = r.labelAt ?? 'top-left';
        const lx = at === 'top-right' ? r.x + r.w - 10 : at === 'right' ? r.x + r.w + 8 : at === 'bottom' ? r.x + r.w / 2 : r.x + 10;
        const ly = at === 'right' ? r.y + r.h / 2 + 4 : at === 'bottom' ? r.y + r.h + 16 : r.y + 16;
        const anchor = at === 'top-right' ? 'end' : at === 'bottom' ? 'middle' : 'start';
        return (
          <g key={i}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={6}
              fill={r.style === 'filled' ? '#121821' : 'none'}
              stroke={r.style === 'filled' ? '#1E2631' : '#2F3A4A'}
              strokeDasharray={r.style === 'dashed' ? '6 5' : undefined}
            />
            {r.label && (
              <text x={lx} y={ly} textAnchor={anchor} fill={SCOPE.ink3} fontFamily={MONO} fontSize={10.5} letterSpacing="0.08em">
                {r.label}
              </text>
            )}
          </g>
        );
      })}

      {spec.edges.map((e) => {
        const pts = geom[e.id];
        if (!pts) return null;
        const state = frame.links?.[e.id];
        const points = pts.map((p) => p.join(',')).join(' ');

        if (e.color) {
          const c = EDGE_TONE[e.color];
          const hot = state === 'hot';
          const key = hot ? 'hot' : 'base';
          const marker = `url(#${uid}-arrow-${e.color}-${key})`;
          const arrow = e.arrow ?? 'forward';
          const box = e.labelBox ?? labels[e.id];
          return (
            <g key={e.id} opacity={state === 'dim' ? 0.18 : 1} style={{ transition: 'opacity 180ms' }}>
              <polyline
                points={points}
                fill="none"
                stroke={c[key]}
                strokeWidth={hot ? 2 : 1.4}
                strokeDasharray={e.dashed ? '5 4' : undefined}
                strokeLinejoin="round"
                markerEnd={arrow !== 'none' ? marker : undefined}
                markerStart={arrow === 'both' ? marker : undefined}
              />
              {box && (
                <g>
                  <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={2} fill={SCOPE.ground} stroke={hot ? c.hot : '#1E2631'} strokeWidth={1} />
                  {e.step !== undefined && (
                    <>
                      <rect x={box.x + 2} y={box.y + 2} width={14} height={12} rx={1.5} fill={hot ? c.hot : c.base} />
                      <text x={box.x + 9} y={box.y + 11.5} textAnchor="middle" fill={SCOPE.ground} fontFamily={MONO} fontSize={9.5} fontWeight={600}>
                        {e.step}
                      </text>
                    </>
                  )}
                  {e.label && (
                    <text
                      x={box.x + (e.step !== undefined ? 18 : 0) + 5}
                      y={box.y + 11.5}
                      fill={hot ? SCOPE.ink : SCOPE.ink2}
                      fontFamily={MONO}
                      fontSize={EDGE_LABEL}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        }

        const [mx, my] = midpoint(pts);
        const quiet = e.quiet && state !== 'hot';
        return (
          <g key={e.id}>
            <polyline
              points={points}
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
