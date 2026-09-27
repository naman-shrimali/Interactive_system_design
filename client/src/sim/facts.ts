/**
 * Timing constants for scenarios, read from the canonical registry.
 *
 * Scenarios must take every latency from here rather than typing a literal,
 * so the player and the prose can never disagree about how long something
 * takes. validate-scenarios.ts rejects latency literals in scenario files.
 */
import registry from '../../../content/facts.json';

interface Fact {
  id: string;
  label: string;
  value: number;
  unit: string;
  source: string;
}

const TO_MS: Record<string, number> = {
  ns: 1e-6,
  us: 1e-3,
  ms: 1,
  s: 1e3,
  minutes: 60e3,
  hours: 3600e3,
};

const byId = new Map((registry.facts as Fact[]).map((f) => [f.id, f]));

export function fact(id: string): Fact {
  const f = byId.get(id);
  if (!f) throw new Error(`unknown fact "${id}" — add it to content/facts.json`);
  return f;
}

/** A fact's value in milliseconds. */
export function factMs(id: string): number {
  const f = fact(id);
  const k = TO_MS[f.unit];
  if (k === undefined) throw new Error(`fact "${id}" has a non-duration unit "${f.unit}"`);
  return f.value * k;
}

/** Human formatting that keeps the unit a reader expects at each scale. */
export function fmtMs(ms: number): string {
  if (ms < 0.001) return `${Math.round(ms * 1e6)} ns`;
  if (ms < 0.5) return `${+(ms * 1000).toFixed(ms < 0.01 ? 1 : 0)} µs`;
  if (ms < 10) return `${+ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${+(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

/** Simulated clock, formatted for the stage. */
export function fmtClock(ms: number): string {
  return `t = ${(ms / 1000).toFixed(3)} s`;
}
