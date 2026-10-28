/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32)
 * Ensures 100% reproducible traffic simulation runs across scenarios and speed multipliers.
 */

let currentSeed = 12345;

/**
 * Set the PRNG seed.
 */
export function setSeed(seed: number): void {
  currentSeed = Math.floor(seed) >>> 0;
}

/**
 * Get current seed value.
 */
export function getSeed(): number {
  return currentSeed;
}

/**
 * Mulberry32 32-bit generator. Returns float in [0, 1).
 */
export function seededRandom(): number {
  let t = (currentSeed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Standard Normal (Gaussian) distribution using Box-Muller transform with seeded generator.
 */
export function seededStandardNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = seededRandom();
  while (v === 0) v = seededRandom();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Sample a log-normal distribution with given mu and sigma, clamped between min and max.
 */
export function seededLogNormal(mu: number, sigma: number, minVal: number, maxVal: number): number {
  const z = seededStandardNormal();
  const raw = Math.exp(mu + sigma * z);
  return Math.min(Math.max(raw, minVal), maxVal);
}
