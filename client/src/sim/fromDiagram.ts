/**
 * Turn an authored diagram (content/diagrams/*.json) into a Scenario the
 * player can run. Walkthroughs become options of one knob; each flow step
 * becomes a frame that lights its edges and sends a packet along them.
 *
 * Positions are the authored ones, so no diagram is re-laid-out by hand. Two
 * translations are applied: a node inside a group is positioned relative to
 * that group (as React Flow's parentId did), and icon nodes keep the centre
 * of their old 112px footprint rather than its left edge, since the new box
 * is wider. Boxes are sized by layout.ts, the same code the renderer uses.
 *
 * DOM-free: the layout validator runs this under Node.
 */
import type { DiagramNode, InteractiveDiagram } from '../types';
import type { Frame, Knob, NodeIcon, NodeState, Packet, Scenario, Stage, StageEdge, StageNode, StageRegion, Side } from './types';
import { ICON_W, PAD, SIZE, charW, footprint, nodeLines, placeLabels, tableColumns, textWidth, wrap } from './layout';
export { footprint };

/** Width of the old React Flow icon-node column; positions were authored against it. */
const OLD_ICON_W = 112;
export const ICON_NODE_W = 124;
const ICON_NODE_MIN = 84;
const ICON_NODE_WIDE = 140;
/** Wide enough for the 40-character lines authors break notes into by hand. */
const NOTE_MAX_W = 276;
const SERVICE_MAX_W = 208;
const MARGIN = 20;

const ICON: Partial<Record<DiagramNode['type'], NodeIcon>> = {
  client: 'client',
  client_mobile: 'mobile',
  dns: 'dns',
  cdn: 'cdn',
  load_balancer: 'lb',
  server: 'server',
  server_stack: 'server',
  worker_stack: 'worker',
  database: 'database',
  database_stack: 'database',
  nosql: 'nosql',
  cache: 'cache',
  cache_stack: 'cache',
  message_queue: 'queue',
  service: 'service',
};
const STACKED = new Set(['server_stack', 'worker_stack', 'database_stack', 'cache_stack']);

type Kind = 'icon' | 'service' | 'note' | 'table';
const kindOf = (t: DiagramNode['type']): Kind =>
  t === 'text_box' ? 'note' : t === 'table' ? 'table' : t === 'service' ? 'service' : 'icon';

function sizeNode(n: DiagramNode): Pick<StageNode, 'w' | 'h' | 'shape' | 'rows' | 'sub' | 'icon' | 'stacked'> {
  const kind = kindOf(n.type);
  const base = {
    icon: ICON[n.type],
    stacked: STACKED.has(n.type),
    shape: (n.type === 'message_queue' ? 'queue' : kind === 'note' ? 'note' : 'box') as StageNode['shape'],
  };

  if (kind === 'note') {
    // Annotation: the title, then the authored lines as a text block.
    const lines = (n.sublabel ?? '').split('\n');
    const longest = Math.max(n.label.length * (SIZE.title / SIZE.body), ...lines.map((l) => l.length));
    const w = Math.min(NOTE_MAX_W, textWidth(longest, SIZE.body));
    const bodyChars = Math.floor((w - 2 * PAD) / charW(SIZE.body));
    // A bullet that still has to wrap keeps its continuation under its text.
    const wrapLine = (l: string) => {
      const bullet = /^[•\-*] /.test(l);
      return wrap(l, bodyChars).map((w, i) => (bullet && i > 0 ? `  ${w}` : w));
    };
    const rows = n.sublabel ? [{ kind: 'text' as const, lines: lines.flatMap(wrapLine) }] : undefined;
    const layout = nodeLines({ label: n.label, w, shape: 'note', rows });
    return { ...base, icon: undefined, w, h: layout.height, rows, sub: undefined };
  }

  if (kind === 'table') {
    const table = n.tableData ?? { columns: ['(missing tableData)'], rows: [] };
    const rows = [{ kind: 'table' as const, columns: table.columns, rows: table.rows }];
    const cols = tableColumns(rows[0]);
    const w = Math.max(cols.reduce((a, b) => a + b, 0) + 2 * PAD, textWidth(n.label.length, SIZE.title));
    const layout = nodeLines({ label: n.label, w, rows });
    return { ...base, icon: undefined, w, h: layout.height, rows, sub: undefined };
  }

  // Icon nodes hug their content, like the old tile-plus-caption did: the
  // title on one line where it fits, the subtitle wrapped at ~16 characters.
  const tip = base.shape === 'queue' ? 12 : 0;
  const titleNeed = textWidth(n.label.length, SIZE.title, 2 * PAD + ICON_W + tip);
  const subNeed = n.sublabel ? textWidth(Math.min(n.sublabel.length, 16), SIZE.sub, 2 * PAD + tip) : 0;
  let w = Math.min(ICON_NODE_W, Math.max(ICON_NODE_MIN, titleNeed, subNeed));
  // A title that fits on one line within a little more width gets it, rather
  // than stranding a word ("Chat server" / "A"); failing that, a title that
  // would take three lines gets the extra room.
  if (titleNeed > w && titleNeed <= ICON_NODE_WIDE) w = titleNeed;
  else if (nodeLines({ label: n.label, w, icon: base.icon, shape: base.shape }).titleLines.length > 2) {
    w = Math.min(ICON_NODE_WIDE, titleNeed);
  }
  if (kind === 'service') {
    const need = Math.max(titleNeed, textWidth((n.sublabel ?? '').length, SIZE.sub));
    w = Math.min(SERVICE_MAX_W, Math.max(ICON_NODE_W, need));
  }
  const layout = nodeLines({ label: n.label, sub: n.sublabel, w, icon: base.icon, shape: base.shape });
  return { ...base, w, h: layout.height, sub: n.sublabel };
}

type Rect = { x: number; y: number; w: number; h: number; stacked?: boolean };
type Pt = [number, number];

/** Stacked nodes draw ghost outlines up and to the right; edges meeting those
 *  sides stop at the outermost ghost so their arrowheads stay visible. */
const GHOST = 10;

function port(r: Rect, side: Side, at = 0.5): Pt {
  const g = r.stacked ? GHOST : 0;
  switch (side) {
    case 'l':
      return [r.x, r.y + r.h * at];
    case 'r':
      return [r.x + r.w + g, r.y + r.h * at];
    case 't':
      return [r.x + g + (r.w - g) * at, r.y - g];
    case 'b':
      return [r.x + r.w * at, r.y + r.h];
  }
}

/** Orthogonal waypoints between two ports whose positions are already chosen. */
function waypoints(a: Rect, as: Side, s: Pt, b: Rect, bs: Side, t: Pt): Pt[] {
  const out = 16;
  if (as === 'r' && bs === 'l') {
    if (Math.abs(s[1] - t[1]) < 1 && t[0] > s[0]) return [];
    if (t[0] - s[0] >= 2 * out) {
      const mx = (s[0] + t[0]) / 2;
      return [
        [mx, s[1]],
        [mx, t[1]],
      ];
    }
    const lane = Math.max(a.y + a.h, b.y + b.h) + out;
    return [
      [s[0] + out, s[1]],
      [s[0] + out, lane],
      [t[0] - out, lane],
      [t[0] - out, t[1]],
    ];
  }
  if (as === 'b' && bs === 't') {
    if (Math.abs(s[0] - t[0]) < 1 && t[1] > s[1]) return [];
    if (t[1] - s[1] >= 2 * out) {
      const my = (s[1] + t[1]) / 2;
      return [
        [s[0], my],
        [t[0], my],
      ];
    }
    // Loop back up: run beside both boxes.
    const lane = Math.max(a.x + a.w, b.x + b.w) + out + GHOST;
    return [
      [s[0], s[1] + out],
      [lane, s[1] + out],
      [lane, t[1] - out],
      [t[0], t[1] - out],
    ];
  }
  if (as === 'b' && bs === 'l') {
    if (t[1] > s[1] + out && t[0] > s[0] + out) return [[s[0], t[1]]];
    const y = Math.max(s[1] + out, t[1]);
    return [
      [s[0], y],
      [t[0] - out, y],
      [t[0] - out, t[1]],
    ];
  }
  if (as === 't' && bs === 'b') {
    // Upward: the mirror of bottom → top.
    if (Math.abs(s[0] - t[0]) < 1 && t[1] < s[1]) return [];
    if (s[1] - t[1] >= 2 * out) {
      const my = (s[1] + t[1]) / 2;
      return [
        [s[0], my],
        [t[0], my],
      ];
    }
  }
  if (as === 'r' && bs === 't') {
    if (t[0] > s[0] + out && t[1] > s[1] + out) return [[t[0], s[1]]];
    const x = Math.max(s[0] + out, t[0]);
    return [
      [x, s[1]],
      [x, t[1] - out],
      [t[0], t[1] - out],
    ];
  }
  // Any other pairing: step out of each port, then join with one corner.
  const step = (p: Pt, side: Side): Pt =>
    side === 'l' ? [p[0] - out, p[1]] : side === 'r' ? [p[0] + out, p[1]] : side === 't' ? [p[0], p[1] - out] : [p[0], p[1] + out];
  const s1 = step(s, as);
  const t1 = step(t, bs);
  const horizontalFirst = as === 'l' || as === 'r';
  return [s1, horizontalFirst ? [t1[0], s1[1]] : [s1[0], t1[1]], t1];
}

interface Attach {
  edge: string;
  end: 'from' | 'to';
  /** Coordinate of the far end along this side's axis, for ordering. */
  toward: number;
}

/**
 * Choose where along each side every edge attaches. Several edges on one side
 * are spread evenly, ordered by where they are headed, so they never share a
 * first segment. A lone straight edge is snapped to line up with its partner
 * when the two boxes overlap on that axis, so a small height difference
 * doesn't draw a jog.
 */
function assignPorts(
  nodes: Map<string, Rect>,
  edges: { id: string; from: string; to: string; fs: Side; ts: Side }[],
): Map<string, { fromAt: number; toAt: number }> {
  const bySide = new Map<string, Attach[]>();
  const add = (key: string, a: Attach) => bySide.set(key, [...(bySide.get(key) ?? []), a]);
  const centre = (r: Rect, side: Side) => (side === 'l' || side === 'r' ? r.y + r.h / 2 : r.x + r.w / 2);
  for (const e of edges) {
    const a = nodes.get(e.from)!;
    const b = nodes.get(e.to)!;
    add(`${e.from}:${e.fs}`, { edge: e.id, end: 'from', toward: centre(b, e.fs) });
    add(`${e.to}:${e.ts}`, { edge: e.id, end: 'to', toward: centre(a, e.ts) });
  }

  const spread = new Map<string, number>(); // `${edge}:${end}` → fraction
  for (const list of bySide.values()) {
    if (list.length < 2) continue;
    list.sort((p, q) => p.toward - q.toward);
    list.forEach((a, i) => spread.set(`${a.edge}:${a.end}`, (i + 1) / (list.length + 1)));
  }

  const out = new Map<string, { fromAt: number; toAt: number }>();
  for (const e of edges) {
    const a = nodes.get(e.from)!;
    const b = nodes.get(e.to)!;
    let fromAt = spread.get(`${e.id}:from`);
    let toAt = spread.get(`${e.id}:to`);
    const straight =
      (e.fs === 'r' && e.ts === 'l') || (e.fs === 'b' && e.ts === 't') || (e.fs === 't' && e.ts === 'b');
    if (straight && (fromAt === undefined || toAt === undefined)) {
      const horiz = e.fs === 'r';
      // Ghosts shift only a top port, never a bottom one.
      const span = (r: Rect, side: Side): [number, number] =>
        horiz ? [r.y, r.y + r.h] : [r.x + (side === 't' && r.stacked ? GHOST : 0), r.x + r.w];
      const [a0, a1] = span(a, e.fs);
      const [b0, b1] = span(b, e.ts);
      // Line up with whichever end is already fixed, else the shared span's middle.
      const fixed =
        fromAt !== undefined ? a0 + (a1 - a0) * fromAt : toAt !== undefined ? b0 + (b1 - b0) * toAt : undefined;
      const lo = Math.max(a0, b0) + 8;
      const hi = Math.min(a1, b1) - 8;
      if (hi > lo) {
        const v = fixed !== undefined && fixed >= lo && fixed <= hi ? fixed : (lo + hi) / 2;
        fromAt ??= (v - a0) / (a1 - a0);
        toAt ??= (v - b0) / (b1 - b0);
      }
    }
    out.set(e.id, { fromAt: fromAt ?? 0.5, toAt: toAt ?? 0.5 });
  }
  return out;
}

type Seg = { a: Pt; b: Pt };

function segments(pts: Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 1; i < pts.length; i++) out.push({ a: pts[i - 1], b: pts[i] });
  return out;
}

/** Proper crossings between two axis-aligned polylines (touching ends don't count). */
function crossings(p: Pt[], q: Pt[]): number {
  let n = 0;
  for (const s of segments(p))
    for (const t of segments(q)) {
      const sv = Math.abs(s.a[0] - s.b[0]) < 0.5;
      const tv = Math.abs(t.a[0] - t.b[0]) < 0.5;
      if (sv === tv) continue;
      const [v, h] = sv ? [s, t] : [t, s];
      const x = v.a[0];
      const y = h.a[1];
      const inX = x > Math.min(h.a[0], h.b[0]) + 1 && x < Math.max(h.a[0], h.b[0]) - 1;
      const inY = y > Math.min(v.a[1], v.b[1]) + 1 && y < Math.max(v.a[1], v.b[1]) - 1;
      if (inX && inY) n++;
    }
  return n;
}

/**
 * Two edges whose interior segments lie on the same line read as one edge.
 * Where that happens, move the later edge's segment 14px to whichever side
 * crosses fewer other edges. Only interior segments move — never the stubs
 * attached to a port.
 */
function separateLanes(edges: StageEdge[], nodes: Map<string, Rect>): void {
  const route = (e: StageEdge): Pt[] => {
    const a = nodes.get(e.from)!;
    const b = nodes.get(e.to)!;
    return [port(a, e.fromPort!.side, e.fromPort!.at), ...((e.via ?? []) as Pt[]), port(b, e.toPort!.side, e.toPort!.at)];
  };
  for (let j = 0; j < edges.length; j++) {
    const ej = edges[j];
    const via = (ej.via ?? []) as Pt[];
    for (let k = 1; k < via.length; k++) {
      const [p0, p1] = [via[k - 1], via[k]];
      const vertical = Math.abs(p0[0] - p1[0]) < 0.5;
      const horizontal = Math.abs(p0[1] - p1[1]) < 0.5;
      if (!vertical && !horizontal) continue;
      const clash = edges.slice(0, j).some((ei) =>
        segments(route(ei)).some((s) => {
          if (vertical && Math.abs(s.a[0] - s.b[0]) < 0.5 && Math.abs(s.a[0] - p0[0]) < 2) {
            const lo = Math.max(Math.min(s.a[1], s.b[1]), Math.min(p0[1], p1[1]));
            const hi = Math.min(Math.max(s.a[1], s.b[1]), Math.max(p0[1], p1[1]));
            return hi - lo > 4;
          }
          if (horizontal && Math.abs(s.a[1] - s.b[1]) < 0.5 && Math.abs(s.a[1] - p0[1]) < 2) {
            const lo = Math.max(Math.min(s.a[0], s.b[0]), Math.min(p0[0], p1[0]));
            const hi = Math.min(Math.max(s.a[0], s.b[0]), Math.max(p0[0], p1[0]));
            return hi - lo > 4;
          }
          return false;
        }),
      );
      if (!clash) continue;
      const shifted = (d: number): Pt[] =>
        via.map((p, i) => (i === k - 1 || i === k ? ((vertical ? [p[0] + d, p[1]] : [p[0], p[1] + d]) as Pt) : p));
      const cost = (v: Pt[]) =>
        edges.reduce((n, e, i) => (i === j ? n : n + crossings(route({ ...ej, via: v }), route(e))), 0);
      const plus = shifted(14);
      const minus = shifted(-14);
      ej.via = cost(plus) <= cost(minus) ? plus : minus;
    }
  }
}

const SIDE: Record<string, Side> = { top: 't', bottom: 'b', left: 'l', right: 'r' };

export interface DiagramStage extends Stage {
  /** Node id → whether the author marked it, so frames can keep that state. */
  authored: Record<string, NodeState>;
}

/** Positions, sizes and routes for a diagram. Exported for the layout validator. */
export function diagramStage(spec: InteractiveDiagram): DiagramStage {
  const groups = new Map((spec.groups ?? []).map((g) => [g.id, g]));

  const nodes: StageNode[] = spec.nodes.map((n) => {
    const g = n.groupId ? groups.get(n.groupId) : undefined;
    const sized = sizeNode(n);
    let x = n.position.x + (g?.position.x ?? 0);
    const y = n.position.y + (g?.position.y ?? 0);
    if (kindOf(n.type) === 'icon') x -= (sized.w - OLD_ICON_W) / 2;
    return { id: n.id, label: n.label, x, y, marker: n.badge, ...sized };
  });

  const regions: StageRegion[] = (spec.groups ?? []).map((g) => ({
    label: (g.label ?? '').toUpperCase(),
    x: g.position.x,
    y: g.position.y,
    w: g.size.width,
    h: g.size.height,
    style: g.style,
    labelAt: g.labelPosition ?? 'top-left',
  }));

  // Normalise so the drawing starts at MARGIN on both axes.
  const xs: number[] = [];
  const ys: number[] = [];
  const xe: number[] = [];
  const ye: number[] = [];
  for (const n of nodes) {
    xs.push(n.x);
    ys.push(n.y - (n.stacked ? 10 : 0) - (n.marker !== undefined ? 8 : 0));
    xe.push(n.x + n.w + (n.stacked ? 10 : 0));
    ye.push(n.y + n.h);
  }
  for (const r of regions) {
    xs.push(r.x);
    ys.push(r.y);
    const labelW = r.label.length * charW(10.5) + 12;
    xe.push(r.x + r.w! + (r.labelAt === 'right' ? labelW + 8 : 0));
    ye.push(r.y + r.h! + (r.labelAt === 'bottom' ? 22 : 0));
  }
  const dx = MARGIN - Math.min(...xs);
  const dy = MARGIN - Math.min(...ys);
  for (const n of nodes) {
    n.x = Math.round(n.x + dx);
    n.y = Math.round(n.y + dy);
  }
  for (const r of regions) {
    r.x = Math.round(r.x + dx);
    r.y = Math.round(r.y + dy);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sides = spec.edges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    fs: SIDE[e.sourceHandle ?? 'right'],
    ts: SIDE[e.targetHandle ?? 'left'],
  }));
  const ports = assignPorts(byId, sides);
  const edges: StageEdge[] = spec.edges.map((e, i) => {
    const a = byId.get(e.source)!;
    const b = byId.get(e.target)!;
    const { fs, ts } = sides[i];
    const { fromAt, toAt } = ports.get(e.id)!;
    const via = waypoints(a, fs, port(a, fs, fromAt), b, ts, port(b, ts, toAt));
    return {
      id: e.id,
      from: e.source,
      to: e.target,
      fromPort: { side: fs, at: fromAt },
      toPort: { side: ts, at: toAt },
      via: via.map(([x, y]) => [Math.round(x), Math.round(y)] as Pt),
      label: e.label,
      step: e.step,
      color: e.color ?? 'blue',
      dashed: e.lineStyle === 'dashed',
      arrow: e.direction ?? 'forward',
    };
  });

  separateLanes(edges, byId);

  const authored: Record<string, NodeState> = {};
  for (const n of spec.nodes) {
    if (n.state === 'failed') authored[n.id] = { tone: 'fail' };
    else if (n.state === 'highlighted') authored[n.id] = { tone: 'active' };
    else if (n.state === 'dimmed') authored[n.id] = { tone: 'dim' };
  }

  // Edge labels and the loop-back lanes can extend past the boxes.
  let width = Math.max(...xe) + dx + MARGIN;
  let height = Math.max(...ye) + dy + MARGIN;
  for (const e of edges) {
    for (const [x, y] of e.via ?? []) {
      width = Math.max(width, x + MARGIN);
      height = Math.max(height, y + MARGIN);
    }
  }

  const stage = { width: Math.ceil(width), height: Math.ceil(height), nodes, edges, regions, authored };
  const labels = placeLabels(stage);
  for (const e of edges) if (labels[e.id]) e.labelBox = labels[e.id];
  for (const b of Object.values(labels)) {
    stage.width = Math.max(stage.width, Math.ceil(b.x + b.w + 8));
    stage.height = Math.max(stage.height, Math.ceil(b.y + b.h + 8));
  }
  return stage;
}

const PACKET_KIND: Record<string, Packet['kind']> = { green: 'ok', red: 'fail' };

export function diagramScenario(spec: InteractiveDiagram): Scenario {
  const stage = diagramStage(spec);
  const flows = spec.flows ?? [];
  const edgeById = new Map(spec.edges.map((e) => [e.id, e]));

  const knobs: Knob[] =
    flows.length > 1
      ? [
          {
            id: 'flow',
            kind: 'choice',
            label: 'walkthrough',
            default: flows[0].id,
            options: flows.map((f) => ({ value: f.id, label: f.name })),
          },
        ]
      : [];

  const rest = (): Record<string, NodeState> => ({ ...stage.authored });

  const run = (k: Record<string, unknown>): Frame[] => {
    const flow = flows.find((f) => f.id === k.flow) ?? flows[0];
    const overview: Frame = {
      t: 0,
      nodes: rest(),
      metrics: [],
      say: flow
        ? `${flow.name}${flow.description ? ` — ${flow.description}` : ''}. Step through to follow it.`
        : (spec.description ?? spec.title),
    };
    if (!flow) return [overview];

    return [
      overview,
      ...flow.steps.map((step, i): Frame => {
        const hot = new Set(step.edgeIds);
        const touched = new Set<string>();
        for (const id of hot) {
          const e = edgeById.get(id);
          if (e) touched.add(e.source).add(e.target);
        }
        const nodes: Record<string, NodeState> = {};
        for (const n of spec.nodes) {
          const authored = stage.authored[n.id];
          if (authored?.tone === 'fail') nodes[n.id] = authored;
          else nodes[n.id] = { tone: touched.has(n.id) ? 'active' : 'dim' };
        }
        const links: Frame['links'] = {};
        for (const e of spec.edges) links[e.id] = hot.has(e.id) ? 'hot' : 'dim';
        return {
          t: i + 1,
          nodes,
          links,
          metrics: [],
          packets: step.edgeIds.map((id, j) => ({
            edge: id,
            dir: 1,
            kind: PACKET_KIND[edgeById.get(id)?.color ?? 'blue'] ?? 'req',
            delay: j * 160,
          })),
          say: step.text,
        };
      }),
    ];
  };

  return {
    id: `diagram-${spec.id}`,
    topic: '',
    title: spec.title,
    summary: spec.description ?? '',
    stage,
    knobs,
    source: () => [],
    run: run as Scenario['run'],
  };
}

