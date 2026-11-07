// Small helpers shared by every module.

/** Deterministic hash of up to three integers -> [0, 1). Same inputs give the same number on every machine. */
export function hash(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h = (h << 13) | (h >>> 19);
  h ^= Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Seeded random number generator (mulberry32). */
export function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent approach: move a toward b, reaching ~63% in 1/rate seconds. */
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
