// The highway: an endless one-way expressway described in "road space".
//   s = metres along the road, d = metres sideways from the centre line (+ is right).
// The centre line is built from a curvature function that only depends on the seed, so every
// player in a multiplayer room gets the exact same road.
import { hash, smooth } from './util.js';

export const LANES = 4;
export const LANE_W = 3.75;
export const ROAD_HALF = (LANES * LANE_W) / 2; // 7.5
export const SHOULDER = 1.1;
export const WALL = ROAD_HALF + SHOULDER; // the barrier's inner face
export const laneCenter = (i) => -ROAD_HALF + LANE_W * (i + 0.5);
const KMAX = 1 / 430; // tightest bend: 430 m radius

export class Road {
  constructor(seed) {
    this.seed = seed;
    this.p1 = hash(seed, 1) * Math.PI * 2;
    this.p2 = hash(seed, 2) * Math.PI * 2;
    this.p3 = hash(seed, 3) * Math.PI * 2;
    // samples every metre: x, z position of the centre line and its heading
    this.cap = 1 << 16;
    this.X = new Float64Array(this.cap);
    this.Z = new Float64Array(this.cap);
    this.H = new Float64Array(this.cap);
    this.n = 1; // X[0] = Z[0] = H[0] = 0
  }

  /** Curvature (1/m) at s: long straights broken by gentle sweepers, both directions. */
  kappa(s) {
    const a = Math.sin(s / 760 + this.p1) * 0.62 + Math.sin(s / 2050 + this.p2) * 0.38 + Math.sin(s / 310 + this.p3) * 0.1;
    const m = Math.min(1, Math.max(0, Math.abs(a) - 0.3) / 0.55);
    return Math.sign(a) * m * KMAX * smooth(250, 700, s);
  }

  ensure(s) {
    const need = Math.ceil(s) + 2;
    if (need <= this.n) return;
    if (need >= this.cap) {
      let cap = this.cap;
      while (cap <= need) cap *= 2;
      for (const k of ['X', 'Z', 'H']) { const a = new Float64Array(cap); a.set(this[k]); this[k] = a; }
      this.cap = cap;
    }
    const { X, Z, H } = this;
    for (let i = this.n; i < need; i++) {
      const hm = H[i - 1] + this.kappa(i - 0.5) * 0.5;
      X[i] = X[i - 1] + Math.sin(hm);
      Z[i] = Z[i - 1] + Math.cos(hm);
      H[i] = H[i - 1] + this.kappa(i - 0.5);
    }
    this.n = need;
  }

  /** Centre line at s (linear interpolation between metre samples). Writes into out = {x, z, h}. */
  center(s, out = {}) {
    if (s < 0) { out.x = 0; out.z = s; out.h = 0; return out; }
    this.ensure(s + 1);
    const i = Math.floor(s), f = s - i;
    out.x = this.X[i] + (this.X[i + 1] - this.X[i]) * f;
    out.z = this.Z[i] + (this.Z[i + 1] - this.Z[i]) * f;
    out.h = this.H[i] + (this.H[i + 1] - this.H[i]) * f;
    return out;
  }

  /** World position of road point (s, d). Heading h: forward = (sin h, cos h); right = (-cos h, sin h). */
  toWorld(s, d, out = {}) {
    this.center(s, out);
    out.x += -Math.cos(out.h) * d;
    out.z += Math.sin(out.h) * d;
    return out;
  }
}
