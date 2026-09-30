/**
 * Text wrapping and box geometry for icon/annotation/table nodes.
 *
 * One source of truth shared by the renderer (Stage.tsx), the diagram
 * converter (fromDiagram.ts) and the layout validator, so the size a box is
 * checked at is the size it is drawn at. Everything here is DOM-free.
 *
 * All text is IBM Plex Mono, which advances exactly 0.6em per character, so
 * widths are computed rather than measured.
 */
import type { NodeState, Port, Row, Stage, StageEdge, StageNode, Token } from './types';

export const ADVANCE = 0.6;
export const SIZE = { title: 12, sub: 11, body: 10.5, cell: 10.5 } as const;
export const LEAD = { title: 15, sub: 14, body: 13.5, cell: 18 } as const;
export const PAD = 10;
export const ICON_W = 20;
/** The arrow tip of the queue shape eats into the usable width. */
export const QUEUE_TIP = 12;
/** Edge label font size. */
export const EDGE_LABEL = 10;

export const charW = (size: number) => size * ADVANCE;

/**
 * Greedy word wrap that honours explicit newlines. A word too long for the
 * line breaks after one of its own hyphens where it has them ("Well-" /
 * "behaved"), and only otherwise at the column with an added hyphen.
 */
export function wrap(text: string, maxChars: number): string[] {
  const max = Math.max(4, maxChars);
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    const push = (word: string, glue: string) => {
      if (!line) line = word;
      else if (line.length + glue.length + word.length <= max) line += glue + word;
      else {
        out.push(line);
        line = word;
      }
    };
    for (const raw of para.split(/\s+/).filter(Boolean)) {
      // "Well-behaved" → ["Well-", "behaved"], joined with no space if they fit.
      const parts = raw.length > max && raw.includes('-') ? raw.split(/(?<=-)/) : [raw];
      parts.forEach((part, i) => {
        let word = part;
        while (word.length > max) {
          if (line) {
            out.push(line);
            line = '';
          }
          out.push(word.slice(0, max - 1) + '-');
          word = word.slice(max - 1);
        }
        push(word, i === 0 ? ' ' : '');
      });
    }
    out.push(line);
  }
  return out;
}

export function tableColumns(r: Extract<Row, { kind: 'table' }>): number[] {
  return r.columns.map((c, i) =>
    Math.ceil(Math.max(c.length, ...r.rows.map((row) => (row[i] ?? '').length)) * charW(SIZE.cell) + 12),
  );
}

export function staticRowHeight(r: Row): number {
  switch (r.kind) {
    case 'text':
      return r.lines.length * LEAD.body + 4;
    case 'table':
      return (r.rows.length + 1) * LEAD.cell + 4;
    case 'ring':
      return r.size;
    default:
      return 0;
  }
}

/** Height of a row drawn inside a scenario node (the renderer and token layout agree on it). */
export function rowHeight(r: Row): number {
  switch (r.kind) {
    case 'kv':
      return 20;
    case 'bar':
      return 12;
    case 'slots':
      return 36;
    case 'log':
      return 44;
    default:
      return staticRowHeight(r);
  }
}

/** Token chips: one width per stage, so a key keeps its size wherever it goes. */
export const TOKEN = { h: 20, gap: 6, size: 10.5 } as const;

export function tokenWidth(tokens: Token[]): number {
  const chars = Math.max(1, ...tokens.map((t) => t.label.length));
  return Math.ceil(chars * charW(TOKEN.size) + 14);
}

/** Where each token sits: a grid inside its node, below the title, subtitle and rows. */
export function tokenBoxes(
  stage: Stage,
  tokens: Token[],
  states: Record<string, NodeState | undefined>,
): Record<string, Box & { node: string }> {
  const w = tokenWidth(tokens);
  const out: Record<string, Box & { node: string }> = {};
  const seen = new Map<string, number>();
  for (const t of tokens) {
    const n = stage.nodes.find((x) => x.id === t.node);
    if (!n) continue;
    const st = states[n.id];
    const sub = st?.sub ?? n.sub;
    const rowsH = (st?.rows ?? []).reduce((h, r) => h + rowHeight(r), 0);
    const top = n.y + (sub ? 46 : 32) + rowsH;
    const cols = Math.max(1, Math.floor((n.w - 2 * 12 + TOKEN.gap) / (w + TOKEN.gap)));
    const i = seen.get(n.id) ?? 0;
    seen.set(n.id, i + 1);
    out[t.id] = {
      node: n.id,
      x: n.x + 12 + (i % cols) * (w + TOKEN.gap),
      y: top + Math.floor(i / cols) * (TOKEN.h + TOKEN.gap),
      w,
      h: TOKEN.h,
    };
  }
  return out;
}

export interface NodeLines {
  titleX: number;
  titleLines: string[];
  subLines: string[];
  /** y (relative to the node's top) where static rows begin. */
  rowsTop: number;
  /** Height the content needs; the node may be drawn taller. */
  height: number;
}

/** Wrap a node's title and subtitle to its width, and report the height it needs. */
export function nodeLines(n: Pick<StageNode, 'label' | 'sub' | 'w' | 'icon' | 'shape' | 'rows'>): NodeLines {
  const tip = n.shape === 'queue' ? QUEUE_TIP : 0;
  const iconW = n.icon ? ICON_W : 0;
  const titleChars = Math.floor((n.w - 2 * PAD - iconW - tip) / charW(SIZE.title));
  const subChars = Math.floor((n.w - 2 * PAD - tip) / charW(SIZE.sub));
  const titleLines = n.label ? wrap(n.label, titleChars) : [];
  const subLines = n.sub ? wrap(n.sub, subChars) : [];
  let y = PAD + titleLines.length * LEAD.title;
  if (subLines.length) y += 3 + subLines.length * LEAD.sub;
  const rowsTop = y + (n.rows?.length ? 6 : 0);
  const rowsH = (n.rows ?? []).reduce((h, r) => h + staticRowHeight(r), 0);
  return {
    titleX: PAD + iconW,
    titleLines,
    subLines,
    rowsTop,
    height: Math.ceil(rowsTop + rowsH + PAD - 2),
  };
}

/** Width a single line of text needs at a size, plus padding. */
export function textWidth(chars: number, size: number, extra = 2 * PAD): number {
  return Math.ceil(chars * charW(size) + extra);
}

/* ---- edge geometry ---- */

/** Stacked ghosts sit 10px up and right; edges on those sides meet the ghost. */
export function portPoint(n: StageNode, p: Port | undefined, fallback: Port['side']): [number, number] {
  const side = p?.side ?? fallback;
  const at = p?.at ?? 0.5;
  const g = n.stacked ? 10 : 0;
  switch (side) {
    case 'l':
      return [n.x, n.y + n.h * at];
    case 'r':
      return [n.x + n.w + g, n.y + n.h * at];
    case 't':
      return [n.x + g + (n.w - g) * at, n.y - g];
    case 'b':
      return [n.x + n.w * at, n.y + n.h];
  }
}

export type Pt = [number, number];

export function edgeGeometry(spec: Stage): Record<string, Pt[]> {
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
export function along(pts: Pt[], u: number): Pt {
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

export function midpoint(pts: Pt[]): Pt {
  return along(pts, 0.5);
}


export type Box = { x: number; y: number; w: number; h: number };

export const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** A node's drawn footprint, including stacked ghosts and its corner marker. */
export function footprint(n: StageNode): Box {
  const up = Math.max(n.stacked ? 10 : 0, n.marker !== undefined ? 8 : 0);
  const left = n.marker !== undefined ? 8 : 0;
  return { x: n.x - left, y: n.y - up, w: n.w + (n.stacked ? 10 : 0) + left, h: n.h + up };
}

export function labelSize(e: Pick<StageEdge, 'label' | 'step'>): { w: number; h: number } | null {
  if (!e.label && e.step === undefined) return null;
  return {
    w: Math.ceil((e.label ? e.label.length * charW(EDGE_LABEL) + 10 : 4) + (e.step !== undefined ? 18 : 0)),
    h: 16,
  };
}

/** Candidate label positions along a route, best first. */
function candidates(pts: Pt[], w: number, h: number): Box[] {
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    segs.push({ x0, y0, x1, y1, len: Math.hypot(x1 - x0, y1 - y0) });
  }
  segs.sort((a, b) => b.len - a.len);
  const out: Box[] = [];
  for (const g of segs) {
    const vertical = Math.abs(g.x1 - g.x0) < Math.abs(g.y1 - g.y0);
    for (const u of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const x = g.x0 + (g.x1 - g.x0) * u;
      const y = g.y0 + (g.y1 - g.y0) * u;
      if (vertical) {
        out.push({ x: x + 6, y: y - h / 2, w, h }, { x: x - 6 - w, y: y - h / 2, w, h });
      } else {
        out.push({ x: x - w / 2, y: y - h / 2, w, h }, { x: x - w / 2, y: y - h - 5, w, h }, { x: x - w / 2, y: y + 5, w, h });
      }
    }
  }
  return out;
}

/**
 * Place every edge label: the first candidate spot that clears all node
 * footprints and every label already placed. If none is clear, the label
 * keeps its preferred spot and the layout validator reports it.
 */
export function placeLabels(stage: Stage): Record<string, Box> {
  const geom = edgeGeometry(stage);
  const nodes = stage.nodes.map(footprint);
  const regions = (stage.regions ?? []).map(regionLabelBox).filter((b): b is Box => b !== null);
  const placed: Record<string, Box> = {};
  const taken: Box[] = [...regions];
  for (const e of stage.edges) {
    const size = labelSize(e);
    const pts = geom[e.id];
    if (!size || !pts) continue;
    const cands = candidates(pts, size.w, size.h);
    const clear = (b: Box) => !nodes.some((n) => overlaps(b, n, 2)) && !taken.some((t) => overlaps(b, t, 3));
    const uncrossed = (b: Box) =>
      !stage.edges.some((o) => o.id !== e.id && geom[o.id] !== undefined && routeCrosses(geom[o.id], b, 0));
    const box = cands.find((b) => clear(b) && uncrossed(b)) ?? cands.find(clear) ?? cands[0];
    placed[e.id] = box;
    taken.push(box);
  }
  return placed;
}

/** Where a region's label is drawn, as a box (null for unboxed regions). */
export function regionLabelBox(r: NonNullable<Stage['regions']>[number]): Box | null {
  if (!r.label || r.w === undefined || r.h === undefined) return null;
  const w = r.label.length * charW(10.5) * 1.08 + 4;
  const at = r.labelAt ?? 'top-left';
  if (at === 'top-right') return { x: r.x + r.w - 10 - w, y: r.y + 5, w, h: 15 };
  if (at === 'right') return { x: r.x + r.w + 8, y: r.y + r.h / 2 - 7, w, h: 15 };
  if (at === 'bottom') return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h + 5, w, h: 15 };
  return { x: r.x + 10, y: r.y + 5, w, h: 15 };
}

/** Does any segment of a route pass through a box? (Axis-aligned segments only.) */
export function routeCrosses(pts: Pt[], b: Box, inset = 3): boolean {
  const x0 = b.x + inset;
  const x1 = b.x + b.w - inset;
  const y0 = b.y + inset;
  const y1 = b.y + b.h - inset;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    if (Math.abs(ay - by) < 0.5) {
      if (ay > y0 && ay < y1 && Math.max(ax, bx) > x0 && Math.min(ax, bx) < x1) return true;
    } else if (Math.abs(ax - bx) < 0.5) {
      if (ax > x0 && ax < x1 && Math.max(ay, by) > y0 && Math.min(ay, by) < y1) return true;
    }
  }
  return false;
}
