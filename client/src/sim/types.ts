/**
 * The scenario model.
 *
 * A scenario is executed, not drawn: `run` models the system and returns one
 * Frame per step, so every number the learner sees is computed by the same run
 * that produced the narration. Changing a knob simply runs it again.
 *
 * Nothing in this file (or in a scenario) may touch the DOM — scenarios are
 * also executed by scripts/validate-scenarios.ts under Node.
 */

/** Visual meaning, mapped to the player's palette. Each tone means one thing. */
export type Tone = 'idle' | 'active' | 'ok' | 'warn' | 'fail' | 'dim';

/** What a node draws inside its box. Generic on purpose: a TTL, a connection
 *  pool and a replicated log are all one of these. */
export type Row =
  | { kind: 'kv'; label: string; value?: string; tone?: Tone }
  | { kind: 'bar'; value: number; max: number; tone?: Tone }
  | { kind: 'slots'; total: number; filled: number; tone?: Tone; label?: string }
  | { kind: 'log'; entries: { text: string; tone?: Tone }[]; label?: string };

export interface NodeState {
  tone?: Tone;
  /** Short status in the node's top-right corner: LEADER, DOWN, term 4. */
  badge?: string;
  badgeTone?: Tone;
  /** Replaces the node's static subtitle for this frame. */
  sub?: string;
  rows?: Row[];
}

export type Side = 'l' | 'r' | 't' | 'b';
export interface Port {
  side: Side;
  /** 0..1 along the side, top-to-bottom or left-to-right. Default 0.5. */
  at?: number;
}

export interface StageNode {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StageEdge {
  id: string;
  from: string;
  to: string;
  fromPort?: Port;
  toPort?: Port;
  /** Waypoints between the two ports, for routing around other nodes. */
  via?: [number, number][];
  /** Drawn fainter: a path that exists but isn't the one in use. */
  quiet?: boolean;
}

export interface StageRegion {
  label: string;
  x: number;
  y: number;
  anchor?: 'start' | 'end';
}

/** Layout only. Everything that changes lives in frames. */
export interface Stage {
  width: number;
  height: number;
  nodes: StageNode[];
  edges: StageEdge[];
  regions?: StageRegion[];
}

export type PacketKind = 'req' | 'ok' | 'nil' | 'fail';

/** Something travelling along an edge during a step. */
export interface Packet {
  edge: string;
  /** 1 = from → to, -1 = to → from. */
  dir: 1 | -1;
  kind: PacketKind;
  label?: string;
  /** ms before this packet departs, for staggering a burst into a stream. */
  delay?: number;
}

export interface Metric {
  label: string;
  value: string;
  tone?: Tone;
}

export type Checkpoint =
  | {
      kind: 'predict';
      prompt: string;
      options: string[];
      answer: number;
      reveal: string;
      source?: Source;
    }
  | { kind: 'why'; prompt: string; reveal: string; source?: Source }
  | {
      kind: 'break';
      prompt: string;
      reveal: string;
      source?: Source;
      /** A knob that fixes what this checkpoint breaks, offered as a button. */
      knob?: { id: string; value: KnobValue; label: string };
    };

export interface Source {
  title: string;
  /** Must exist in content/reading-list.json — enforced by the validator. */
  url: string;
}

export interface Frame {
  /** Simulated time in milliseconds. */
  t: number;
  /** The executing line. `anchor` must appear in source line `n`. */
  line?: { n: number; anchor: string };
  vars?: Record<string, string>;
  packets?: Packet[];
  /** A complete snapshot: every node that draws state, every frame. */
  nodes: Record<string, NodeState>;
  /** Edges that are severed (a partition) or emphasised this frame. */
  links?: Record<string, 'cut' | 'hot'>;
  metrics: Metric[];
  /** What just happened, in one sentence. */
  say: string;
  /** Why it matters, when a step earns it. Sticky until replaced. */
  why?: string[];
  checkpoint?: Checkpoint;
}

export type KnobValue = boolean | string;

export type Knob =
  | { id: string; kind: 'toggle'; label: string; default: boolean }
  | {
      id: string;
      kind: 'choice';
      label: string;
      default: string;
      options: { value: string; label: string }[];
    };

export type KnobValues = Record<string, KnobValue>;

export interface Scenario {
  id: string;
  /** Topic slug this scenario belongs to. */
  topic: string;
  title: string;
  /** One sentence for catalogue cards. */
  summary: string;
  stage: Stage;
  knobs: Knob[];
  /** The code the learner reads — what generated the frames. */
  source: (k: KnobValues) => string[];
  run: (k: KnobValues) => Frame[];
}

export function defaultKnobs(s: Scenario): KnobValues {
  return Object.fromEntries(s.knobs.map((k) => [k.id, k.default]));
}
