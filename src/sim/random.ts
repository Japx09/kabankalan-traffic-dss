/**
 * Deterministic Mulberry32 PRNG utilities for repeatable microsimulation runs.
 * All functions are pure and thread an explicit uint32 `rngState`.
 */

export function initSeed(seed: number): number {
  const s = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return s;
}

/** Advances Mulberry32 state and returns `[u in [0, 1), nextState]`. */
export function nextRand(state: number): [number, number] {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, nextState];
}

/** Uniform random number in `[min, max)`. */
export function randRange(state: number, min: number, max: number): [number, number] {
  const [u, nextState] = nextRand(state);
  return [min + u * (max - min), nextState];
}

/** Uniform random integer in `[minInclusive, maxExclusive)`. */
export function randInt(
  state: number,
  minInclusive: number,
  maxExclusive: number
): [number, number] {
  const [u, nextState] = nextRand(state);
  return [minInclusive + Math.floor(u * (maxExclusive - minInclusive)), nextState];
}

/**
 * Deterministic log-normal sample via Box-Muller transform.
 * Useful for PUV curbside dwell times and headway jitter.
 */
export function sampleLogNormal(
  state: number,
  median: number,
  sigma: number,
  min = 0.5,
  max = 60
): [number, number] {
  const [u1Raw, s1] = nextRand(state);
  const [u2, s2] = nextRand(s1);
  const u1 = Math.max(1e-9, u1Raw);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const raw = Math.max(0.01, median) * Math.exp(sigma * z);
  return [Math.max(min, Math.min(max, raw)), s2];
}

/** Deterministic unit hash in `[0, 1)` from a string id + salt. */
export function hashStringUnit(str: string, salt = 0): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}
