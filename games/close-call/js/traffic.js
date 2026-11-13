// Traffic is a pure function of (seed, time): every lane moves at its own steady speed and each
// car sits in a numbered slot. Nothing is simulated or sent over the network, so all players in
// a room see the same cars, and finding the cars near a point is a few array lookups.
// Cars also pull out to overtake now and then (blinker first), but only when the faster lane will
// stay clear for the whole move, which is worked out from the same formula.
import { hash } from './util.js';
import { LANE_W } from './road.js';

// per lane count: speed (km/h), metres per slot, chance a slot has a car, and which column of the
// kind weights (left lane .. right lane) each lane uses. The left lane is the fast lane.
const SETS = {
  2: { kmh: [104, 80], slot: [76, 62], fill: [0.36, 0.46], col: [0, 3] },
  3: { kmh: [112, 94, 76], slot: [68, 54, 46], fill: [0.4, 0.5, 0.56], col: [0, 2, 3] },
  4: { kmh: [116, 99, 85, 72], slot: [66, 54, 46, 44], fill: [0.42, 0.52, 0.58, 0.6], col: [0, 1, 2, 3] },
};
export const laneKmh = (lanes, L) => SETS[lanes].kmh[L];

// vehicle kinds: half length, half width, weight per lane column (left -> right), may overtake
export const KINDS = [
  { id: 'sedan', hl: 2.35, hw: 0.89, w: [5, 5, 4, 3], ot: true },
  { id: 'taxi', hl: 2.35, hw: 0.89, w: [0.5, 0.8, 0.8, 0.6], ot: true },
  { id: 'hatch', hl: 2.0, hw: 0.87, w: [3, 4, 4, 3], ot: true },
  { id: 'suv', hl: 2.4, hw: 0.97, w: [3, 3, 3, 3], ot: true },
  { id: 'pickup', hl: 2.65, hw: 0.99, w: [0.8, 1.4, 1.6, 1.6], ot: true },
  { id: 'van', hl: 2.6, hw: 0.99, w: [0, 1, 2, 3], ot: true },
  { id: 'truck', hl: 4.6, hw: 1.25, w: [0, 0.5, 1.5, 2.5], ot: false },
  { id: 'bus', hl: 5.8, hw: 1.24, w: [0, 0, 0.4, 1], ot: false },
  { id: 'sport', hl: 2.25, hw: 0.96, w: [2.2, 1.2, 0.4, 0.1], ot: true },
  { id: 'police', hl: 2.4, hw: 0.92, w: [0.45, 0.4, 0.3, 0.2], ot: true },
  { id: 'moto', hl: 1.1, hw: 0.42, w: [0.9, 0.9, 0.6, 0.3], ot: true },
  { id: 'semi', hl: 8.3, hw: 1.28, w: [0, 0.15, 0.7, 1.5], ot: false },
];
export const POLICE = KINDS.findIndex((k) => k.id === 'police'), MOTO = KINDS.findIndex((k) => k.id === 'moto');
const SPORT = KINDS.findIndex((k) => k.id === 'sport');
const SPORT_PAINTS = [0xe8322a, 0xf4b400, 0xff7a1a, 0x2a8cff, 0xc6ff3d, 0x111318, 0xf2f2f2, 0x16c2b0];
const TAXI = 1, TAXI_YELLOW = 0xf2b705;
const KIND_TOTAL = [0, 1, 2, 3].map((c) => KINDS.reduce((a, k) => a + k.w[c], 0));
const PAINTS = [0xd8dde6, 0x1d2129, 0x8a919c, 0xb3202a, 0x22407a, 0xe8e2d0, 0x2f5d43, 0x5a5f6b, 0x0f1115, 0xc7a14a, 0x7a2238, 0x3d8fd1];

// overtakes: one chance every MAN_P seconds per car; signal, move over, hold, signal, move back
const MAN_P = 16, MAN_T = 9.6, MAN_Q = 0.3;

function pickKind(col, r) {
  let x = r * KIND_TOTAL[col];
  for (let i = 0; i < KINDS.length; i++) { x -= KINDS[i].w[col]; if (x < 0) return i; }
  return 0;
}

const SET_CACHE = new Map();
/**
 * The lane set for a traffic density. Up to 1.5 more of the slots simply have a car in them; past that the slots
 * themselves get shorter (down to 62% of their length), which is the only way to pack more cars in.
 */
function setFor(lanes, density) {
  const k = Math.min(1.6, Math.max(1, density / 1.5));
  if (k === 1) return SETS[lanes];
  const key = `${lanes}:${k.toFixed(3)}`;
  let set = SET_CACHE.get(key);
  if (!set) SET_CACHE.set(key, (set = { ...SETS[lanes], slot: SETS[lanes].slot.map((x) => x / k) }));
  return set;
}

/** Position of the car in slot k of lane L at time t, or NaN if the slot is empty. */
function slotS(seed, set, fillK, L, k, t) {
  if (hash(seed, L * 7 + 1, k) >= Math.min(0.92, set.fill[L] * fillK)) return NaN;
  const slot = set.slot[L];
  return k * slot + (hash(seed + 11, L, k) - 0.5) * slot * 0.36 + (set.kmh[L] / 3.6) * t;
}

/** Will lane T be clear around our car (lane L, slot k) for the whole window t0..t1? */
function clearFor(seed, set, fillK, L, k, T, t0, t1) {
  const s0 = slotS(seed, set, fillK, L, k, t0), s1 = slotS(seed, set, fillK, L, k, t1);
  const slot = set.slot[T], v = set.kmh[T] / 3.6;
  const seen = new Set();
  for (const [s, t] of [[s0, t0], [s1, t1]]) {
    const k0 = Math.floor((s - 40 - v * t) / slot) - 1, k1 = Math.ceil((s + 40 - v * t) / slot) + 1;
    for (let j = k0; j <= k1; j++) {
      if (seen.has(j)) continue;
      seen.add(j);
      const a0 = slotS(seed, set, fillK, T, j, t0);
      if (Number.isNaN(a0)) continue;
      const d0 = a0 - s0, d1 = slotS(seed, set, fillK, T, j, t1) - s1;
      if (Math.sign(d0) !== Math.sign(d1) || Math.min(Math.abs(d0), Math.abs(d1)) < 22) return false;
    }
  }
  return true;
}

const smooth01 = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
/** Rate of change of smooth01 (per second). */
const dsmooth01 = (a, b, x) => { const u = (x - a) / (b - a); return u <= 0 || u >= 1 ? 0 : (6 * u * (1 - u)) / (b - a); };

/**
 * Every car whose position is within [sMin, sMax] at time t on this road. Results are written into
 * `out` (an array of reusable objects) and the count is returned.
 * skipMask: bit per lane to leave empty (the menus clear the left lanes for the showcase car).
 */
export function trafficNear(road, density, t, sMin, sMax, out, skipMask = 0) {
  const seed = road.seed, lanes = road.lanes, set = setFor(lanes, density);
  let n = 0;
  for (let L = 0; L < lanes; L++) {
    if (skipMask & (1 << L)) continue;
    const v = set.kmh[L] / 3.6, slot = set.slot[L];
    const shift = v * t;
    const k0 = Math.floor((sMin - shift) / slot) - 1, k1 = Math.ceil((sMax - shift) / slot) + 1;
    for (let k = k0; k <= k1; k++) {
      const s = slotS(seed, set, density, L, k, t);
      if (Number.isNaN(s) || s < sMin || s > sMax) continue;
      const r2 = hash(seed + 11, L, k);
      const kind = pickKind(set.col[L], hash(seed + 23, L, k));
      let man = 0, blink = 0, dman = 0;
      // overtaking: pull out into the faster lane on the left, then back
      if (L > 0 && KINDS[kind].ot && !(skipMask & (1 << (L - 1)))) {
        const ph = hash(seed + 51, L, k) * MAN_P, w = Math.floor((t + ph) / MAN_P), t0 = w * MAN_P - ph, tau = t - t0;
        if (tau < MAN_T && hash(seed + 53, L * 977 + k, w) < MAN_Q && clearFor(seed, set, density, L, k, L - 1, t0, t0 + MAN_T)) {
          man = smooth01(1.5, 3.5, tau) - smooth01(7.6, 9.6, tau);
          dman = dsmooth01(1.5, 3.5, tau) - dsmooth01(7.6, 9.6, tau);
          const on = Math.floor(t * 2.7) % 2 === 0;
          if (tau < 3.5) blink = on ? -1 : 0;
          else if (tau > 6.2) blink = on ? 1 : 0;
        }
      }
      const o = out[n] || (out[n] = {});
      o.id = k * 4 + L;
      o.lane = L;
      o.s = s;
      o.v = v;
      o.d = road.laneCenter(L) - man * LANE_W + Math.sin(t * 0.35 + r2 * 40) * 0.14 * (1 - man);
      o.man = man;
      // the car turns into its lane change (+ = nose left), and its hitbox turns with it
      o.yaw = Math.atan2(dman * LANE_W, Math.max(5, v));
      o.blink = blink;
      o.kind = kind;
      o.hl = KINDS[kind].hl;
      o.hw = KINDS[kind].hw;
      const ph = hash(seed + 37, L, k);
      o.color = kind === TAXI ? TAXI_YELLOW : kind === POLICE ? 0xf2f4f8 : kind === SPORT ? SPORT_PAINTS[Math.floor(ph * SPORT_PAINTS.length)] : PAINTS[Math.floor(ph * PAINTS.length)];
      n++;
    }
  }
  return n;
}
