// Traffic is a pure function of (seed, time): every lane moves at its own steady speed and each
// car sits in a numbered slot. Nothing is simulated or sent over the network, so all players in
// a room see the same cars, and finding the cars near a point is a few array lookups.
import { hash } from './util.js';
import { LANES, laneCenter } from './road.js';

// left lane is the fast lane
export const LANE_KMH = [116, 99, 85, 72];
const LANE_SLOT = [66, 54, 46, 44]; // metres per slot
const LANE_FILL = [0.42, 0.52, 0.58, 0.6]; // chance a slot has a car (times density)

// vehicle kinds: half length, half width, chance per lane (left -> right)
export const KINDS = [
  { id: 'sedan', hl: 2.35, hw: 0.88, w: [5, 5, 4, 3] },
  { id: 'hatch', hl: 2.0, hw: 0.86, w: [3, 4, 4, 3] },
  { id: 'suv', hl: 2.4, hw: 0.97, w: [3, 3, 3, 3] },
  { id: 'van', hl: 2.6, hw: 0.99, w: [0, 1, 2, 3] },
  { id: 'truck', hl: 4.6, hw: 1.2, w: [0, 0.5, 1.5, 2.5] },
  { id: 'bus', hl: 5.8, hw: 1.24, w: [0, 0, 0.4, 1] },
];
const KIND_TOTAL = [0, 1, 2, 3].map((l) => KINDS.reduce((a, k) => a + k.w[l], 0));

const PAINTS = [0xd8dde6, 0x1d2129, 0x8a919c, 0xb3202a, 0x22407a, 0xe8e2d0, 0x2f5d43, 0x5a5f6b, 0x0f1115, 0xc7a14a, 0x7a2238, 0x3d8fd1];

function pickKind(lane, r) {
  let x = r * KIND_TOTAL[lane];
  for (let i = 0; i < KINDS.length; i++) { x -= KINDS[i].w[lane]; if (x < 0) return i; }
  return 0;
}

/**
 * Every car whose position is within [sMin, sMax] at time t. Results are written into `out`
 * (an array of reusable objects) and the count is returned.
 * skipMask: bit per lane to leave empty (the menus clear the left lanes for the showcase car).
 */
export function trafficNear(seed, density, t, sMin, sMax, out, skipMask = 0) {
  let n = 0;
  for (let L = 0; L < LANES; L++) {
    if (skipMask & (1 << L)) continue;
    const v = LANE_KMH[L] / 3.6, slot = LANE_SLOT[L], fill = Math.min(0.92, LANE_FILL[L] * density);
    const shift = v * t;
    const k0 = Math.floor((sMin - shift) / slot) - 1, k1 = Math.ceil((sMax - shift) / slot) + 1;
    for (let k = k0; k <= k1; k++) {
      if (hash(seed, L * 7 + 1, k) >= fill) continue;
      const r2 = hash(seed + 11, L, k);
      const s = k * slot + (r2 - 0.5) * slot * 0.36 + shift;
      if (s < sMin || s > sMax) continue;
      const kind = pickKind(L, hash(seed + 23, L, k));
      const o = out[n] || (out[n] = {});
      o.id = k * 4 + L;
      o.lane = L;
      o.s = s;
      o.v = v;
      o.d = laneCenter(L) + Math.sin(t * 0.35 + r2 * 40) * 0.14;
      o.kind = kind;
      o.hl = KINDS[kind].hl;
      o.hw = KINDS[kind].hw;
      o.color = PAINTS[Math.floor(hash(seed + 37, L, k) * PAINTS.length)];
      n++;
    }
  }
  return n;
}
