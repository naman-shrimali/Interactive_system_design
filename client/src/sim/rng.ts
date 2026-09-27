/**
 * Seeded PRNG (mulberry32). Scenarios must be deterministic — the validator
 * runs each one twice and requires identical frames — so any "random" choice,
 * like a jittered TTL or an election timeout, comes from here with a fixed seed.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
