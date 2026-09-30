/** Small helpers shared by scenarios. DOM-free. */
import type { Packet } from './types';

/** The 1-based line holding `anchor`, as a Frame.line. Throws if absent, so a
 *  renamed line fails loudly instead of highlighting the wrong one. */
export function lineOf(src: string[], anchor: string): { n: number; anchor: string } {
  const i = src.findIndex((l) => l.includes(anchor));
  if (i < 0) throw new Error(`anchor "${anchor}" not in source`);
  return { n: i + 1, anchor };
}

/** "A", "A and B", "A, B and C". */
export const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** Staggered packets along one edge (or one per id), so a burst reads as a stream. */
export function burst(
  n: number,
  edge: string | ((i: number) => string),
  dir: 1 | -1,
  kind: Packet['kind'],
  start = 0,
  gap = 90,
  label?: string,
): Packet[] {
  return Array.from({ length: n }, (_, i) => ({
    edge: typeof edge === 'string' ? edge : edge(i),
    dir,
    kind,
    delay: start + i * gap,
    label,
  }));
}

/** 32-bit FNV-1a. Real hashing, so ring and modulo placements are computed, not chosen. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * FNV-1a followed by MurmurHash3's 32-bit finaliser. FNV alone clusters short,
 * similar strings ("user:1", "user:2" …) because its low bits barely change;
 * the finaliser spreads every input bit across the output, as ring placement
 * needs. Returns an unsigned 32-bit integer.
 */
export function hash32(s: string): number {
  let h = fnv1a(s);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
