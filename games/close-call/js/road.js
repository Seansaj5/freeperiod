// The highway: an endless one-way road described in "road space".
//   s = metres along the road, d = metres sideways from the centre line (+ is right).
// Bends, hills, tunnels and bridges only depend on the seed and the map, so every player in a
// multiplayer room gets exactly the same road.
import { hash, smooth } from './util.js';

export const LANE_W = 3.75;
export const SHOULDER = 1.1;

export class Road {
  /** map: a MAPS entry (maps.js); lanes: 2..4 */
  constructor(seed, map, lanes = 4) {
    this.seed = seed;
    this.map = map;
    this.lanes = lanes;
    this.half = (lanes * LANE_W) / 2;
    this.wall = this.half + SHOULDER; // the barrier's inner face
    this.p = [1, 2, 3, 4, 5].map((i) => hash(seed, i) * Math.PI * 2);
    // samples every metre: centre line x, z, heading and height
    this.cap = 1 << 16;
    for (const k of ['X', 'Z', 'H', 'Y']) this[k] = new Float64Array(this.cap);
    this._feat = new Map();
    this.n = 1;
    this.Y[0] = this.elev(0);
  }

  laneCenter(i) { return -this.half + LANE_W * (i + 0.5); }

  /** Curvature (1/m) at s: straights broken by bends in both directions; none for the first stretch. */
  kappa(s) {
    const c = this.map.curve, p = this.p;
    const a = Math.sin(s / c.w[0] + p[0]) * c.a[0] + Math.sin(s / c.w[1] + p[1]) * c.a[1] + Math.sin(s / c.w[2] + p[2]) * c.a[2];
    const m = Math.min(1, Math.max(0, Math.abs(a) - c.th) / 0.5);
    return Math.sign(a) * m * c.k * smooth(250, 700, s);
  }

  /** Height of the road at s (before sampling). Bridges lift the road over the water. */
  elev(s) {
    const h = this.map.hills, p = this.p;
    let y = h.base + (Math.sin(s / h.w[0] + p[3]) * h.a[0] + Math.sin(s / h.w[1] + p[4]) * h.a[1]) * smooth(350, 900, s);
    const f = this.featureNear(s);
    if (f && f.kind === 'bridge') y += 9 * smooth(f.a - 260, f.a + 120, s) * (1 - smooth(f.b - 120, f.b + 260, s));
    return y;
  }

  // ---------- features: at most one tunnel or bridge per segment of road
  segFeature(j) {
    let f = this._feat.get(j);
    if (f !== undefined) return f;
    f = null;
    const F = this.map.feat;
    if (F && j >= 1) {
      const r = hash(this.seed + 101, j), kind = r < F.tunnel ? 'tunnel' : r < F.tunnel + F.bridge ? 'bridge' : null;
      if (kind) {
        const L = kind === 'tunnel' ? F.tunnelLen : F.bridgeLen;
        const len = L[0] + hash(this.seed + 103, j) * (L[1] - L[0]);
        const a = j * F.seg + 280 + hash(this.seed + 107, j) * Math.max(0, F.seg - len - 560);
        f = { kind, a, b: a + len, j };
      }
    }
    if (this._feat.size > 4000) this._feat.clear();
    this._feat.set(j, f);
    return f;
  }
  /** The feature whose segment contains s (it may not cover s itself). */
  featureNear(s) { return this.map.feat ? this.segFeature(Math.floor(s / this.map.feat.seg)) : null; }
  /** The tunnel or bridge covering s, if any. */
  featureAt(s) { const f = this.featureNear(s); return f && s >= f.a && s <= f.b ? f : null; }
  inTunnel(s) { const f = this.featureAt(s); return !!f && f.kind === 'tunnel'; }
  /** Every feature overlapping [s0, s1]. */
  featuresIn(s0, s1) {
    const out = [];
    if (!this.map.feat) return out;
    const seg = this.map.feat.seg;
    for (let j = Math.floor(s0 / seg) - 1; j <= Math.floor(s1 / seg) + 1; j++) { const f = this.segFeature(j); if (f && f.b >= s0 && f.a <= s1) out.push(f); }
    return out;
  }
  /** Speed trap gantries: one every map.trapEvery metres, moved off tunnels and bridges. */
  trapsIn(s0, s1) {
    const out = [], E = this.map.trapEvery;
    for (let j = Math.max(1, Math.floor(s0 / E)); j <= Math.floor(s1 / E) + 1; j++) {
      let s = j * E + 400 + hash(this.seed + 211, j) * 300;
      const f = this.featureAt(s); if (f) s = f.b + 140;
      if (s >= s0 && s < s1) out.push(s);
    }
    return out;
  }

  ensure(s) {
    const need = Math.ceil(s) + 2;
    if (need <= this.n) return;
    if (need >= this.cap) {
      let cap = this.cap;
      while (cap <= need) cap *= 2;
      for (const k of ['X', 'Z', 'H', 'Y']) { const a = new Float64Array(cap); a.set(this[k]); this[k] = a; }
      this.cap = cap;
    }
    const { X, Z, H, Y } = this;
    for (let i = this.n; i < need; i++) {
      const hm = H[i - 1] + this.kappa(i - 0.5) * 0.5;
      X[i] = X[i - 1] + Math.sin(hm);
      Z[i] = Z[i - 1] + Math.cos(hm);
      H[i] = H[i - 1] + this.kappa(i - 0.5);
      Y[i] = this.elev(i);
    }
    this.n = need;
  }

  /** Centre line at s (linear interpolation between metre samples). Writes into out = {x, y, z, h}. */
  center(s, out = {}) {
    if (s < 0) { out.x = 0; out.z = s; out.h = 0; out.y = this.Y[0]; return out; }
    this.ensure(s + 1);
    const i = Math.floor(s), f = s - i;
    out.x = this.X[i] + (this.X[i + 1] - this.X[i]) * f;
    out.z = this.Z[i] + (this.Z[i + 1] - this.Z[i]) * f;
    out.h = this.H[i] + (this.H[i + 1] - this.H[i]) * f;
    out.y = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * f;
    return out;
  }

  /** Slope (rise per metre) at s. */
  grade(s) {
    if (s < 1) return 0;
    this.ensure(s + 2);
    const i = Math.floor(s);
    return this.Y[i + 1] - this.Y[i];
  }

  /** World position of road point (s, d). Heading h: forward = (sin h, cos h); right = (-cos h, sin h). */
  toWorld(s, d, out = {}) {
    this.center(s, out);
    out.x += -Math.cos(out.h) * d;
    out.z += Math.sin(out.h) * d;
    return out;
  }
}
