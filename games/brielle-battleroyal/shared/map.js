// The island: a game-sized Brielle, NJ. x runs east, z runs south, y is up (metres). Water is at y = 0.
// Everything here is generated from a fixed seed, so the browser and the server build the exact same map.
//   boxes   solid blocks (walls, floors, docks, bridge parts)    {x0,y0,z0,x1,y1,z1,c}
//   slopes  walkable ramps and roofs (axis-aligned)               {x0,z0,x1,z1,ax,ya,yb,c}  height goes ya -> yb along ax
//   props   trees, rocks, cars... (harvestable with the pickaxe) {id,kind,x,y,z,rot,s,hw,hd,h,solid}
//   loot    where floor loot, chests and ammo boxes appear        {x,y,z,kind}
//   pois    named drop spots; roads/rails for drawing; decor = looks only (signs, gables, posts, awnings)
import { rng, noise2, clamp, smooth, lerp } from './util.js';
import { MAP } from './rules.js';

export const GRID = 16;
const gkey = (cx, cz) => (cx + 100) * 1000 + (cz + 100);

// Colors the renderer uses for boxes and slopes (index = c).
export const PALETTE = [
  0xf3efe6, // 0 white siding
  0xa9c8de, // 1 light blue siding
  0xf1d98a, // 2 butter yellow
  0x8ea0ad, // 3 grey-blue shingle
  0xa9c29b, // 4 sage
  0xe3d1b3, // 5 beige
  0xb5523b, // 6 red brick
  0x4a4f58, // 7 dark roof
  0x7a5236, // 8 brown roof
  0x5f7a6a, // 9 green-grey roof
  0x9d3b33, // 10 red roof
  0xbfb9ad, // 11 concrete
  0x9b7653, // 12 dock wood
  0x8a9099, // 13 metal
  0xc49a6c, // 14 floor wood
  0x2e3b4e, // 15 navy
  0xd9d4c7, // 16 trim
  0x5b6b3e, // 17 olive
  0x3d6f9e, // 18 shop blue
  0xe0703a, // 19 orange
  0x6e2f2f, // 20 boxcar red
  0x3a5a40, // 21 boxcar green
  0x2b2b2b, // 22 asphalt / rubber
  0xd8c08a, // 23 sand stone
  0xe9e2cf, // 24 cream
];

export const SIDINGS = [0, 1, 2, 3, 4, 5, 24, 1, 0];
export const ROOFS = [7, 8, 9, 10, 7, 3];

// ---- water + terrain -------------------------------------------------------------------------------------------------
export const bankZ = (x) => 300 + 22 * Math.sin(x / 130) + 10 * Math.sin(x / 57 + 1);   // north bank of the Manasquan River
export const farZ = (x) => 452 + 8 * Math.sin(x / 90);                                   // Point Pleasant side
export const creekX = (z) => 410 + 14 * Math.sin(z / 70);                                // Glimmer Glass creek
const CREEK_TOP = -170;
const PONDS = [[-420, 60, 18], [-352, 172, 13], [-90, 230, 9]];

/** > 0 inside water (metres from the shore), < 0 on land. */
export function waterDist(x, z) {
  let d = Math.min(z - bankZ(x), farZ(x) - z);
  const cx = creekX(Math.max(z, CREEK_TOP));
  const dc = z >= CREEK_TOP ? 22 - Math.abs(x - cx) : 22 - Math.hypot(x - cx, z - CREEK_TOP);
  if (dc > d) d = dc;
  for (const [px, pz, r] of PONDS) { const dp = r - Math.hypot(x - px, z - pz); if (dp > d) d = dp; }
  return d;
}

function landH(x, z) {
  let h = 3.4 + 1.5 * noise2(x / 95, z / 95, 3) + 0.6 * noise2(x / 33, z / 33, 7);
  // rolling golf course
  const g = Math.hypot(x + 390, z - 110);
  if (g < 150) h += (1 - g / 150) * (1.8 + 1.4 * noise2(x / 40, z / 40, 11));
  // a low ridge through the north woods
  if (z < -280) h += smooth(-280, -420, z) * (2 + noise2(x / 60, 0, 5));
  return h;
}

export function heightAt(x, z) {
  const w = waterDist(x, z);
  if (w < -14) return landH(x, z);
  if (w < 0) return lerp(landH(x, z), 0.7, smooth(-14, 0, w));
  return lerp(0.7, -3.8, smooth(0, 10, w));
}

// ---- the map ---------------------------------------------------------------------------------------------------------
export class BrielleMap {
  constructor() {
    this.boxes = []; this.slopes = []; this.props = []; this.loot = []; this.pois = [];
    this.roads = []; this.rails = []; this.decor = []; this.circles = []; this.doors = [];
    this.lots = [];          // footprints already used (x0,z0,x1,z1), so nothing overlaps
    this.grid = new Map();
    this.q = 1;              // query stamp (dedupe items that sit in several grid cells)
    generate(this);
    this.index();
  }

  // -- building blocks --
  box(x0, y0, z0, x1, y1, z1, c, opts) {
    const b = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), c, _q: 0 };
    if (opts && opts.nobullet) b.nb = 1;
    this.boxes.push(b);
    return b;
  }
  slope(x0, z0, x1, z1, ax, ya, yb, c) {
    const s = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), ax, ya, yb, c, _q: 0 };
    this.slopes.push(s);
    return s;
  }
  prop(kind, x, z, rot = 0, s = 1, y) {
    const D = PROP_DIMS[kind];
    const side = Math.abs(Math.sin(rot)) > 0.7;
    const p = {
      id: this.props.length, kind, x, z, y: y === undefined ? heightAt(x, z) : y, rot, s,
      hw: (side ? D.hd : D.hw) * s, hd: (side ? D.hw : D.hd) * s, h: D.h * s, solid: D.solid, _q: 0,
    };
    this.props.push(p);
    return p;
  }
  lootAt(x, y, z, kind = 'floor') { this.loot.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), kind }); }
  free(x0, z0, x1, z1, pad = 0) {
    for (const l of this.lots) if (x0 - pad < l.x1 && x1 + pad > l.x0 && z0 - pad < l.z1 && z1 + pad > l.z0) return false;
    return true;
  }
  claim(x0, z0, x1, z1) { this.lots.push({ x0, z0, x1, z1 }); }

  // -- spatial index --
  index() {
    const add = (list, tag) => list.forEach((it, i) => {
      const x0 = it.x0 !== undefined ? it.x0 : it.x - it.hw, x1 = it.x1 !== undefined ? it.x1 : it.x + it.hw;
      const z0 = it.z0 !== undefined ? it.z0 : it.z - it.hd, z1 = it.z1 !== undefined ? it.z1 : it.z + it.hd;
      for (let cx = Math.floor(x0 / GRID); cx <= Math.floor(x1 / GRID); cx++)
        for (let cz = Math.floor(z0 / GRID); cz <= Math.floor(z1 / GRID); cz++) {
          const k = gkey(cx, cz);
          let cell = this.grid.get(k);
          if (!cell) { cell = { b: [], s: [], p: [] }; this.grid.set(k, cell); }
          cell[tag].push(i);
        }
    });
    add(this.boxes, 'b'); add(this.slopes, 's'); add(this.props, 'p');
  }
  /** Calls fn(kind, item) once for every box/slope/prop whose footprint touches the rectangle. */
  each(x0, z0, x1, z1, fn) {
    const q = ++this.q;
    for (let cx = Math.floor(x0 / GRID); cx <= Math.floor(x1 / GRID); cx++)
      for (let cz = Math.floor(z0 / GRID); cz <= Math.floor(z1 / GRID); cz++) {
        const cell = this.grid.get(gkey(cx, cz));
        if (!cell) continue;
        for (const i of cell.b) { const b = this.boxes[i]; if (b._q !== q) { b._q = q; if (fn('b', b) === false) return; } }
        for (const i of cell.s) { const s = this.slopes[i]; if (s._q !== q) { s._q = q; if (fn('s', s) === false) return; } }
        for (const i of cell.p) { const p = this.props[i]; if (p._q !== q) { p._q = q; if (fn('p', p) === false) return; } }
      }
  }
  cell(cx, cz) { return this.grid.get(gkey(cx, cz)); }
  poiAt(x, z) {
    let best = null, bd = Infinity;
    for (const p of this.pois) { const d = Math.hypot(p.x - x, p.z - z); if (d < p.r && d < bd) { bd = d; best = p; } }
    return best;
  }
}

export const slopeY = (s, x, z) => {
  const t = s.ax === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0);
  return s.ya + (s.yb - s.ya) * clamp(t, 0, 1);
};

export const PROP_DIMS = {
  tree: { hw: 0.5, hd: 0.5, h: 7.5, solid: true },
  pine: { hw: 0.45, hd: 0.45, h: 10, solid: true },
  bush: { hw: 0.9, hd: 0.9, h: 1.3, solid: false },
  rock: { hw: 1.5, hd: 1.3, h: 1.7, solid: true },
  car: { hw: 0.95, hd: 2.2, h: 1.5, solid: true },
  boat: { hw: 1.3, hd: 4.2, h: 1.7, solid: true },
  crate: { hw: 0.7, hd: 0.7, h: 1.4, solid: true },
  dumpster: { hw: 1.0, hd: 0.8, h: 1.4, solid: true },
  fence: { hw: 0.1, hd: 2.0, h: 1.2, solid: true },
};

// ---- generation ------------------------------------------------------------------------------------------------------
const T = 0.3;     // wall thickness
const FH = 3.4;    // floor height

function footBase(x0, z0, x1, z1) {
  let hi = -Infinity, lo = Infinity;
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
    const h = heightAt(lerp(x0, x1, i / 2), lerp(z0, z1, j / 2));
    if (h > hi) hi = h; if (h < lo) lo = h;
  }
  return { base: Math.max(hi, 1.2) + 0.25, lo };
}

/** A straight wall with openings. ax 'x' = runs along x at z = at (thickness across z). ops: [{c, w, y0, y1}] along the wall. */
function wall(m, ax, a0, a1, at, y, h, ops, c) {
  const put = (s0, s1, yb, yt) => {
    if (s1 - s0 < 0.02 || yt - yb < 0.02) return;
    if (ax === 'x') m.box(s0, y + yb, at - T / 2, s1, y + yt, at + T / 2, c);
    else m.box(at - T / 2, y + yb, s0, at + T / 2, y + yt, s1, c);
  };
  const list = (ops || []).map((o) => ({ s0: a0 + o.c - o.w / 2, s1: a0 + o.c + o.w / 2, y0: o.y0, y1: o.y1 }))
    .filter((o) => o.s0 > a0 + 0.2 && o.s1 < a1 - 0.2).sort((a, b) => a.s0 - b.s0);
  let cur = a0;
  for (const o of list) {
    if (o.s0 < cur) continue;
    put(cur, o.s0, 0, h);
    put(o.s0, o.s1, 0, o.y0);
    put(o.s0, o.s1, o.y1, h);
    cur = o.s1;
  }
  put(cur, a1, 0, h);
}

const DOOR = (c, w = 1.5) => ({ c, w, y0: 0, y1: 2.45 });
const WIN = (c, w = 1.3) => ({ c, w, y0: 1.0, y1: 2.25 });

function windows(len, avoid, every = 3.6, w = 1.3) {
  const out = [];
  const n = Math.max(1, Math.floor((len - 1.5) / every));
  for (let i = 0; i < n; i++) {
    const c = (len / n) * (i + 0.5);
    if (avoid.some((a) => Math.abs(a - c) < 1.6)) continue;
    out.push(WIN(c, w));
  }
  return out;
}

/**
 * A house or shop. face = side with the front door ('n','s','e','w'). opts: floors, roof ('gable'|'flat'), siding, roofc,
 * shop (big front windows + counter), sign (text), loot (floor spots per floor), chest (chance).
 */
function building(m, R, cx, cz, w, d, face, opts = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const floors = opts.floors || 1;
  const { base, lo } = footBase(x0, z0, x1, z1);
  const sid = opts.siding !== undefined ? opts.siding : R.pick(SIDINGS);
  const roofc = opts.roofc !== undefined ? opts.roofc : R.pick(ROOFS);
  m.claim(x0, z0, x1, z1);
  // foundation + floor
  m.box(x0, lo - 1.2, z0, x1, base - 0.12, z1, 11);
  m.box(x0 + T, base - 0.12, z0 + T, x1 - T, base, z1 - T, 14);
  // front step if the door is up high
  const doorPos = { n: [cx, z0 - 0.9], s: [cx, z1 + 0.9], w: [x0 - 0.9, cz], e: [x1 + 0.9, cz] }[face];
  const gh = heightAt(doorPos[0], doorPos[1]);
  if (base - gh > 0.45) {
    const sw = 2.2, sy = (base + gh) / 2;
    if (face === 'n' || face === 's') m.box(cx - sw / 2, gh - 0.3, doorPos[1] - 0.8, cx + sw / 2, sy, doorPos[1] + 0.8, 11);
    else m.box(doorPos[0] - 0.8, gh - 0.3, cz - sw / 2, doorPos[0] + 0.8, sy, cz + sw / 2, 11);
  }
  m.doors.push({ x: doorPos[0], z: doorPos[1], ix: cx, iz: cz, x0, x1, z0, z1, base });
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[face];
  for (let f = 0; f < floors; f++) {
    const y = base + f * FH;
    const sides = {
      n: { ax: 'x', a0: x0 + T, a1: x1 - T, at: z0 + T / 2, len: w - 2 * T },
      s: { ax: 'x', a0: x0 + T, a1: x1 - T, at: z1 - T / 2, len: w - 2 * T },
      w: { ax: 'z', a0: z0, a1: z1, at: x0 + T / 2, len: d },
      e: { ax: 'z', a0: z0, a1: z1, at: x1 - T / 2, len: d },
    };
    for (const k of ['n', 's', 'w', 'e']) {
      const S = sides[k];
      const ops = [];
      const mid = S.len / 2;
      if (f === 0 && k === face) {
        if (opts.shop) { ops.push(DOOR(mid, 1.8)); ops.push({ c: mid * 0.42, w: mid * 0.62, y0: 0.85, y1: 2.7 }, { c: mid * 1.58, w: mid * 0.62, y0: 0.85, y1: 2.7 }); }
        else { ops.push(DOOR(mid)); ops.push(...windows(S.len, [mid])); }
      } else if (f === 0 && k === back) {
        const dc = mid + (R() < 0.5 ? -1 : 1) * Math.min(2, mid * 0.4);
        ops.push(DOOR(dc, 1.3)); ops.push(...windows(S.len, [dc]));
      } else ops.push(...windows(S.len, []));
      wall(m, S.ax, S.a0, S.a1, S.at, y, FH, ops, sid);
    }
    // inside: one wall that splits the house in two (with a doorway), or a counter in a shop
    if (opts.shop && f === 0) {
      const cz2 = face === 'n' ? z0 + d * 0.62 : face === 's' ? z1 - d * 0.62 : cz;
      const cx2 = face === 'w' ? x0 + w * 0.62 : face === 'e' ? x1 - w * 0.62 : cx;
      if (face === 'n' || face === 's') m.box(cx - w * 0.3, y, cz2 - 0.4, cx + w * 0.3, y + 1.1, cz2 + 0.4, 12);
      else m.box(cx2 - 0.4, y, cz - d * 0.3, cx2 + 0.4, y + 1.1, cz + d * 0.3, 12);
    } else if (!opts.shop && w * d > 70) {
      // (kept clear of the stairs, which run along the west wall)
      const sx = floors > 1 ? 1.7 : 0;
      if (w >= d) wall(m, 'z', z0 + T, z1 - T, cx + w * 0.12, y, FH, [DOOR((d - 2 * T) * (f ? 0.7 : 0.35), 1.2)], 16);
      else wall(m, 'x', x0 + T + sx, x1 - T, cz + d * 0.12, y, FH, [DOOR((w - 2 * T - sx) * (f ? 0.7 : 0.35), 1.2)], 16);
    }
    // loot
    const spots = opts.loot !== undefined ? opts.loot : 1;
    for (let i = 0; i < spots; i++) m.lootAt(lerp(x0 + 2.4, x1 - 1.4, R()), y, lerp(z0 + 1.4, z1 - 1.4, R()), 'floor');
    if (R() < (opts.chest !== undefined ? opts.chest : 0.3)) m.lootAt(lerp(x0 + 2.6, x1 - 1.6, R()), y, lerp(z0 + 1.6, z1 - 1.6, R()), 'chest');
    if (R() < 0.35) m.lootAt(lerp(x0 + 2.4, x1 - 1.4, R()), y, lerp(z0 + 1.4, z1 - 1.4, R()), 'ammo');
  }
  // upper floors + stairs along the west wall (rising south)
  for (let f = 1; f < floors; f++) {
    const y = base + f * FH;
    const sx0 = x0 + T, sx1 = x0 + T + 1.5, sz0 = z0 + T + 0.6, sz1 = Math.min(z1 - T - 1.2, sz0 + 5.6);
    m.slope(sx0, sz0, sx1, sz1, 'z', y - FH, y, 12);
    m.box(sx1, y - 0.25, z0 + T, x1 - T, y, z1 - T, 14);
    m.box(sx0, y - 0.25, sz1, sx1, y, z1 - T, 14);
    m.box(sx0, y - 0.25, z0 + T, sx1, y, sz0, 14);
  }
  const top = base + floors * FH;
  if (opts.roof === 'flat') {
    m.box(x0, top - 0.25, z0, x1, top + 0.05, z1, 11);
    m.box(x0, top, z0, x1, top + 0.8, z0 + T, sid); m.box(x0, top, z1 - T, x1, top + 0.8, z1, sid);
    m.box(x0, top, z0, x0 + T, top + 0.8, z1, sid); m.box(x1 - T, top, z0, x1, top + 0.8, z1, sid);
  } else {
    const o = 0.5;
    if (w >= d) {
      const rise = d * 0.3;
      m.slope(x0 - o, z0 - o, x1 + o, cz, 'z', top - 0.15, top + rise, roofc);
      m.slope(x0 - o, cz, x1 + o, z1 + o, 'z', top + rise, top - 0.15, roofc);
      m.decor.push({ t: 'gable', ax: 'x', a: x0 + 0.02, b0: z0, b1: z1, y: top, rise, c: sid });
      m.decor.push({ t: 'gable', ax: 'x', a: x1 - 0.02, b0: z0, b1: z1, y: top, rise, c: sid });
    } else {
      const rise = w * 0.3;
      m.slope(x0 - o, z0 - o, cx, z1 + o, 'x', top - 0.15, top + rise, roofc);
      m.slope(cx, z0 - o, x1 + o, z1 + o, 'x', top + rise, top - 0.15, roofc);
      m.decor.push({ t: 'gable', ax: 'z', a: z0 + 0.02, b0: x0, b1: x1, y: top, rise, c: sid });
      m.decor.push({ t: 'gable', ax: 'z', a: z1 - 0.02, b0: x0, b1: x1, y: top, rise, c: sid });
    }
    if (R() < 0.4) { const chx = lerp(x0 + 1, x1 - 1.6, R()), chz = lerp(z0 + 1, z1 - 1.6, R()); m.box(chx, top, chz, chx + 0.9, top + (w >= d ? d : w) * 0.3 + 1.0, chz + 0.9, 6); }
  }
  if (opts.sign) {
    const fy = base + 2.95;
    const sp = { n: [cx, fy, z0 - 0.05, Math.PI], s: [cx, fy, z1 + 0.05, 0], w: [x0 - 0.05, fy, cz, -Math.PI / 2], e: [x1 + 0.05, fy, cz, Math.PI / 2] }[face];   // ry turns the sign's front (+z) to face out
    m.decor.push({ t: 'sign', text: opts.sign, x: sp[0], y: sp[1], z: sp[2], ry: sp[3], w: (face === 'n' || face === 's' ? w : d) * 0.8, bg: opts.signbg || '#1d2b44', fg: opts.signfg || '#ffffff' });
    if (opts.awning) m.decor.push({ t: 'awning', face, x0, x1, z0, z1, y: base + 2.75, c: opts.awning });
  }
  return { x0, x1, z0, z1, base, top };
}

function road(m, x0, z0, x1, z1, w = 9, name) { m.roads.push({ x0, z0, x1, z1, w, name }); }

function distToSeg(px, pz, r) {
  const dx = r.x1 - r.x0, dz = r.z1 - r.z0;
  const t = clamp(((px - r.x0) * dx + (pz - r.z0) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(px - (r.x0 + dx * t), pz - (r.z0 + dz * t));
}
export function nearRoad(m, x, z, pad = 0) {
  for (const r of m.roads) if (distToSeg(x, z, r) < r.w / 2 + pad) return true;
  for (const r of m.rails) if (distToSeg(x, z, r) < 2.5 + pad) return true;
  for (const c of m.circles) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r + c.w / 2 + pad && d > c.r - c.w / 2 - pad) return true; }
  return false;
}

function generate(m) {
  const R = rng(20261111);
  const P = (name, x, z, r, big) => m.pois.push({ name, x, z, r, big: !!big });

  // ---- roads (rough real layout) ----
  road(m, -270, -560, -270, bankZ(-270) - 6, 12, 'Route 35');
  road(m, 110, -560, 110, 150, 10, 'Union Ave');
  road(m, -560, -380, -294, -380, 10, 'Route 70');
  road(m, -246, -380, 560, -380, 9, 'Old Bridge Rd');
  road(m, -270, -230, 560, -230, 9, 'Higgins Ave');
  road(m, -270, -60, 110, -60, 8, 'Ashley Ave');
  road(m, -270, 60, 386, 60, 9, 'Brielle Rd');
  road(m, 434, 60, 560, 60, 9, 'Brielle Rd');
  road(m, -200, 150, 250, 150, 8, 'Union Ln');
  road(m, 40, 150, 40, bankZ(40) - 18, 8, 'Landing Rd');
  road(m, 350, -560, 350, 60, 8, 'Ocean Ave');
  road(m, -120, -230, -120, 150, 8, 'Fisk Ave');
  road(m, -470, 25, -270, 25, 8, 'Riverview Dr');
  road(m, -470, 25, -470, -380, 8, 'Riverview Dr');
  m.circles.push({ x: -270, z: -380, r: 24, w: 11 });
  m.rails.push({ x0: 250, z0: -560, x1: 250, z1: bankZ(250) });

  // ---- named spots ----
  P('Brielle Circle', -270, -380, 70, true);
  P('Green Acres Woods', 10, -420, 110, true);
  P('Union Ave Shops', 110, -140, 75, true);
  P('Brielle Elementary', -20, -135, 60, true);
  P('Borough Hall', 185, -5, 45);
  P('River Golf Club', -380, 110, 120, true);
  P('Brielle Park', -150, 235, 70, true);
  P('Union Landing', 40, 300, 50, true);
  P('Yacht Club Marina', 170, 300, 60, true);
  P('Rail Yard', 268, 220, 55, true);
  P('The Draw', 250, 380, 40);
  P('Glimmer Glass', 420, 60, 70, true);
  P('Route 35 Bridge', -270, 370, 55);
  P('Riverside Homes', -330, -150, 90);
  P('Higgins Heights', 260, -300, 90);

  // keep these clear of houses
  const EXCL = [[-20, -130, 58], [10, -420, 100], [-380, 110, 110], [-150, 230, 60], [40, 290, 40], [170, 290, 55], [268, 215, 50], [185, -5, 40], [-270, -380, 40], [420, 60, 30]];
  const excluded = (x, z, pad = 0) => EXCL.some(([ex, ez, er]) => Math.hypot(x - ex, z - ez) < er + pad);

  buildCircle(m, R);
  buildShops(m, R);
  buildSchool(m, R);
  buildBoroughHall(m, R);
  buildGolf(m, R);
  buildPark(m, R);
  buildLanding(m, R);
  buildYachtClub(m, R);
  buildRailYard(m, R);
  buildBridges(m, R);
  buildWoods(m, R);
  buildGlimmer(m, R);

  // ---- neighborhoods: houses along every road that isn't a named spot ----
  for (const r of m.roads) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
    const alongX = Math.abs(ux) > 0.5;
    for (let s = 14; s < len - 10; s += R.range(21, 27)) {
      for (const side of [-1, 1]) {
        if (R() < 0.12) continue;
        const ww = R.range(9, 13), dd = R.range(9, 12.5), floors = R() < 0.45 ? 2 : 1;   // x size, z size
        const set = r.w / 2 + 6 + (alongX ? dd : ww) / 2 + R.range(0, 3);
        const px = r.x0 + ux * s + (alongX ? 0 : side * set), pz = r.z0 + uz * s + (alongX ? side * set : 0);
        if (Math.abs(px) > MAP.HALF - 12 || Math.abs(pz) > MAP.HALF - 12) continue;
        if (excluded(px, pz, 8)) continue;
        if (!m.free(px - ww / 2, pz - dd / 2, px + ww / 2, pz + dd / 2, 3.5)) continue;
        let wet = false;
        for (const [ox, oz] of [[-ww / 2, -dd / 2], [ww / 2, -dd / 2], [-ww / 2, dd / 2], [ww / 2, dd / 2], [0, 0]]) if (waterDist(px + ox, pz + oz) > -10) wet = true;
        if (wet) continue;
        if (nearRoad(m, px, pz, Math.max(ww, dd) / 2 + 1)) continue;
        const face = alongX ? (side < 0 ? 's' : 'n') : (side < 0 ? 'e' : 'w');
        building(m, R, px, pz, ww, dd, face, { floors: floors === 2 && dd >= 9 ? 2 : 1 });
        // driveway car + yard tree
        if (R() < 0.45) {
          const cx = px + (alongX ? ww / 2 + 2 : (side < 0 ? 1 : -1) * (dd / 2 + 3)), cz = pz + (alongX ? (side < 0 ? -1 : 1) * (dd / 2 + 3) : ww / 2 + 2);
          if (m.free(cx - 1.5, cz - 2.5, cx + 1.5, cz + 2.5) && !nearRoad(m, cx, cz, 1)) m.prop('car', cx, cz, alongX ? 0 : Math.PI / 2);
        }
      }
    }
  }

  // parked cars along roads
  for (const r of m.roads) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
    for (let s = 30; s < len; s += R.range(35, 80)) {
      const side = R() < 0.5 ? -1 : 1;
      const off = r.w / 2 + 1.6;
      const x = r.x0 + ux * s - uz * off * side, z = r.z0 + uz * s + ux * off * side;
      if (waterDist(x, z) > -6 || !m.free(x - 1.4, z - 2.6, x + 1.4, z + 2.6)) continue;
      m.prop('car', x, z, Math.abs(ux) > 0.5 ? Math.PI / 2 : 0);
      m.claim(x - 1.2, z - 2.4, x + 1.2, z + 2.4);
    }
  }

  // ---- nature ----
  const okTree = (x, z) => waterDist(x, z) < -4 && !nearRoad(m, x, z, 2.5) && m.free(x - 1.2, z - 1.2, x + 1.2, z + 1.2) && Math.abs(x) < MAP.EDGE && Math.abs(z) < MAP.EDGE;
  let placed = 0;
  for (let i = 0; i < 9000 && placed < 1500; i++) {
    const x = R.range(-MAP.EDGE + 10, MAP.EDGE - 10), z = R.range(-MAP.EDGE + 10, farZ(0) + 60);
    const woods = z < -300 && Math.abs(x - 10) < 220;
    const riverEdge = waterDist(x, z) > -26 && waterDist(x, z) < -5;
    const golf = Math.hypot(x + 380, z - 110) < 120;
    const p = woods ? 0.9 : riverEdge ? 0.35 : golf ? 0.1 : excluded(x, z) ? 0.04 : 0.17;
    if (R() > p || !okTree(x, z)) continue;
    const kind = woods ? (R() < 0.6 ? 'pine' : 'tree') : R() < 0.18 ? 'pine' : 'tree';
    m.prop(kind, x, z, R() * 6.28, R.range(0.8, 1.3));
    m.claim(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
    placed++;
    if (R() < 0.25) { const bx = x + R.range(-3, 3), bz = z + R.range(-3, 3); if (okTree(bx, bz)) m.prop('bush', bx, bz, R() * 6.28, R.range(0.8, 1.3)); }
  }
  for (let i = 0; i < 700 && m.props.filter((p) => p.kind === 'rock').length < 110; i++) {
    const x = R.range(-MAP.HALF, MAP.HALF), z = R.range(-MAP.HALF, 440);
    const w = waterDist(x, z);
    if (!((z < -300 && R() < 0.5) || (w > -18 && w < -6) || R() < 0.08)) continue;
    if (!okTree(x, z)) continue;
    m.prop('rock', x, z, R() * 6.28, R.range(0.7, 1.4));
    m.claim(x - 1.5, z - 1.5, x + 1.5, z + 1.5);
  }
  // outdoor loot sprinkled around each named spot
  for (const p of m.pois) {
    for (let i = 0; i < (p.big ? 4 : 2); i++) {
      const a = R() * 6.28, r = R() * p.r * 0.7;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (waterDist(x, z) > -3) continue;
      m.lootAt(x, heightAt(x, z), z, i === 0 && p.big ? 'chest' : 'floor');
    }
  }
}

// ---- named spots ---------------------------------------------------------------------------------------------------
function buildCircle(m, R) {
  const cx = -270, cz = -380;
  m.claim(cx - 20, cz - 20, cx + 20, cz + 20);
  // center island: flagpole + BRIELLE sign + bushes
  m.decor.push({ t: 'flag', x: cx, z: cz, y: heightAt(cx, cz) });
  m.decor.push({ t: 'sign', text: 'BRIELLE', x: cx, y: heightAt(cx, cz) + 1.3, z: cz + 5, ry: Math.PI, w: 7, bg: '#1f4f7a', fg: '#ffffff', post: true });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; m.prop('bush', cx + Math.cos(a) * 10, cz + Math.sin(a) * 10, a, 1.1); }
  // gas station (canopy on posts) + mini mart
  const gx = -225, gz = -340;
  const gb = heightAt(gx, gz) + 0.1;
  m.box(gx - 12, gb - 0.6, gz - 8, gx + 12, gb, gz + 8, 11);
  for (const [px, pz] of [[-9, -5], [9, -5], [-9, 5], [9, 5]]) m.box(gx + px - 0.3, gb, gz + pz - 0.3, gx + px + 0.3, gb + 4.6, gz + pz + 0.3, 16);
  m.box(gx - 11, gb + 4.6, gz - 7, gx + 11, gb + 5.3, gz + 7, 10);
  for (const px of [-4, 4]) m.box(gx + px - 0.6, gb, gz - 1.2, gx + px + 0.6, gb + 1.6, gz + 1.2, 13);
  m.decor.push({ t: 'sign', text: 'GAS', x: gx, y: gb + 4.95, z: gz + 7.05, ry: 0, w: 5, bg: '#9d3b33', fg: '#fff' });
  m.claim(gx - 12, gz - 8, gx + 12, gz + 8);
  m.lootAt(gx, gb, gz, 'chest');
  building(m, R, -222, -310, 16, 11, 'n', { roof: 'flat', shop: true, sign: 'MINI MART', siding: 24, awning: '#d33', loot: 2, chest: 0.6 });
  building(m, R, -318, -340, 18, 12, 'e', { roof: 'flat', shop: true, sign: 'CIRCLE DINER', siding: 1, signbg: '#c0392b', loot: 2, chest: 0.6 });
  building(m, R, -318, -425, 14, 11, 'e', { roof: 'flat', shop: true, sign: 'HARDWARE', siding: 6, loot: 2 });
  building(m, R, -222, -432, 14, 12, 's', { roof: 'flat', shop: true, sign: 'BANK', siding: 11, signbg: '#2e5d3a', loot: 1, chest: 0.8 });
  m.prop('dumpster', -205, -305, 0); m.prop('dumpster', -333, -345, Math.PI / 2);
}

function buildShops(m, R) {
  const names = [['BAGELS', '#e0703a'], ['PIZZA', '#b8352a'], ['SURF SHOP', '#1f8fa8'], ['BAIT & TACKLE', '#3a5a40'], ['PHARMACY', '#2e5d9e'], ['ICE CREAM', '#e86aa6'], ['BARBER', '#2b2b2b'], ['DELI', '#6e2f2f'], ['FLOWERS', '#7a9a3a'], ['BOOKS', '#5a3d7a']];
  let n = 0;
  for (let z = -198; z <= -80; z += 20) {
    for (const side of [-1, 1]) {
      const [name, col] = names[n++ % names.length];
      const x = 110 + side * 17;
      building(m, R, x, z, 13, 16, side < 0 ? 'e' : 'w', { roof: 'flat', shop: true, floors: R() < 0.4 ? 2 : 1, sign: name, signbg: col, siding: R.pick([24, 6, 1, 5, 0]), awning: col, loot: 2, chest: 0.45 });
      m.prop('dumpster', x + side * 9.5, z + 5, 0);
    }
  }
  m.prop('crate', 95, -215, 0); m.prop('crate', 126, -66, 0.4);
}

function buildSchool(m, R) {
  // one long building with a hallway down the middle and classrooms on both sides, plus a taller gym
  const x0 = -56, x1 = 16, z0 = -168, z1 = -138;
  const { base, lo } = footBase(x0, z0, x1, z1);
  m.claim(x0, z0, x1 + 22, z1);
  const H = 3.8;
  m.box(x0, lo - 1.2, z0, x1, base - 0.12, z1, 11);
  m.box(x0 + T, base - 0.12, z0 + T, x1 - T, base, z1 - T, 14);
  const L = x1 - x0;
  wall(m, 'x', x0, x1, z0 + T / 2, base, H, windows(L, [], 4.5, 2).concat([DOOR(L * 0.5, 2.2)]), 6);
  wall(m, 'x', x0, x1, z1 - T / 2, base, H, windows(L, [L * 0.5], 4.5, 2).concat([DOOR(L * 0.5, 3)]), 6);
  wall(m, 'z', z0, z1, x0 + T / 2, base, H, [DOOR(15, 2.2)], 6);
  wall(m, 'z', z0, z1, x1 - T / 2, base, H, [DOOR(15, 2.2)], 6);
  // hallway walls (z = -157 and -149) with classroom doors
  const doors = []; for (let i = 0; i < 6; i++) doors.push(DOOR(6 + i * 12, 1.4));
  wall(m, 'x', x0 + T, x1 - T, -157, base, H, doors.concat([DOOR(L * 0.5, 2.2)]), 0);
  wall(m, 'x', x0 + T, x1 - T, -149, base, H, doors.map((d) => ({ ...d, c: d.c + 3 })).concat([DOOR(L * 0.5, 3)]), 0);
  for (let i = 1; i < 6; i++) {
    const x = x0 + i * 12;
    if (Math.abs(x - (x0 + L * 0.5)) < 3) continue;
    m.box(x - T / 2, base, z0 + T, x + T / 2, base + H, -157 - T / 2, 0);
    m.box(x - T / 2, base, -149 + T / 2, x + T / 2, base + H, z1 - T, 0);
  }
  m.box(x0, base + H - 0.2, z0, x1, base + H + 0.1, z1, 11);
  m.box(x0, base + H, z0, x1, base + H + 0.8, z0 + T, 6); m.box(x0, base + H, z1 - T, x1, base + H + 0.8, z1, 6);
  m.box(x0, base + H, z0, x0 + T, base + H + 0.8, z1, 6); m.box(x1 - T, base + H, z0, x1, base + H + 0.8, z1, 6);
  for (let i = 0; i < 6; i++) { m.lootAt(x0 + 6 + i * 12, base, -163, 'floor'); m.lootAt(x0 + 6 + i * 12, base, -143, i % 2 ? 'ammo' : 'floor'); }
  m.lootAt(x0 + 9, base, -153, 'chest'); m.lootAt(x1 - 9, base, -153, 'chest');
  // gym on the east end (tall, one big room)
  const gx0 = x1, gx1 = x1 + 22, gz0 = z0 - 2, gz1 = z1 + 2, GH = 7.5;
  m.box(gx0, lo - 1.2, gz0, gx1, base - 0.12, gz1, 11);
  m.box(gx0 + T, base - 0.12, gz0 + T, gx1 - T, base, gz1 - T, 14);
  wall(m, 'x', gx0, gx1, gz0 + T / 2, base, GH, [DOOR(11, 2.6)], 6);
  wall(m, 'x', gx0, gx1, gz1 - T / 2, base, GH, [DOOR(11, 2.6), { c: 4, w: 3, y0: 4.5, y1: 6.5 }, { c: 18, w: 3, y0: 4.5, y1: 6.5 }], 6);
  wall(m, 'z', gz0, gz1, gx1 - T / 2, base, GH, [], 6);
  m.box(gx0, base + GH - 0.2, gz0, gx1, base + GH + 0.1, gz1, 13);
  m.lootAt(gx0 + 11, base, -153, 'chest'); m.lootAt(gx0 + 5, base, -160, 'floor'); m.lootAt(gx0 + 17, base, -146, 'floor');
  for (const [dx, dz] of [[x0 + L * 0.5, z0 - 1], [x0 + L * 0.5, z1 + 1], [x0 - 1, z0 + 15], [x1 + 23, z0 + 15]]) m.doors.push({ x: dx, z: dz, ix: x0 + L * 0.5, iz: -153, x0, x1: x1 + 22, z0, z1, base });
  m.decor.push({ t: 'sign', text: 'BRIELLE ELEMENTARY', x: x0 + L * 0.5, y: base + 3.1, z: z1 + 0.05, ry: 0, w: 16, bg: '#1f4f7a', fg: '#fff' });
  // field + playground south of the school
  m.decor.push({ t: 'field', x: -20, z: -100, w: 70, d: 40 });
  for (let i = 0; i < 3; i++) m.box(-50 + i * 4, heightAt(-50, -114), -116, -48.6 + i * 4, heightAt(-50, -114) + 2.4, -114.6, 19);
  m.slope(-38, -118, -36, -112, 'z', heightAt(-37, -112) + 2.2, heightAt(-37, -112), 19);
  m.lootAt(-44, heightAt(-44, -110), -110, 'floor');
}

function buildBoroughHall(m, R) {
  building(m, R, 170, -20, 20, 14, 'w', { roof: 'flat', floors: 2, sign: 'BOROUGH HALL', siding: 6, signbg: '#1d2b44', loot: 2, chest: 0.7 });
  building(m, R, 170, 18, 16, 12, 'w', { floors: 1, sign: 'LIBRARY', siding: 24, roofc: 9, loot: 2, chest: 0.6 });
  // firehouse: big door on the street side
  building(m, R, 210, -24, 14, 18, 'w', { roof: 'flat', shop: true, sign: 'FIRE CO. 1', siding: 6, signbg: '#9d3b33', loot: 2, chest: 0.6 });
  m.prop('car', 225, -2, 0, 1.25);
}

function buildGolf(m, R) {
  building(m, R, -330, 40, 24, 16, 's', { floors: 2, sign: 'RIVER GOLF CLUB', siding: 0, roofc: 9, signbg: '#2e5d3a', loot: 2, chest: 0.8 });
  building(m, R, -300, 75, 12, 9, 'w', { roof: 'flat', sign: 'PRO SHOP', siding: 4, loot: 1, chest: 0.5 });
  const greens = [[-430, 120], [-380, 180], [-450, 20], [-340, 130], [-400, -10]];
  for (const [x, z] of greens) { m.decor.push({ t: 'flag', x, z, y: heightAt(x, z), small: true }); m.lootAt(x + 3, heightAt(x + 3, z + 2), z + 2, 'floor'); }
  for (let i = 0; i < 5; i++) m.prop('car', -350 + i * 3.2, 62, 0, 0.75);   // golf carts
  m.lootAt(-430, heightAt(-430, 150), 150, 'chest');
}

function buildPark(m, R) {
  const cx = -150, cz = 232;
  // gazebo: posts + roof
  const gy = heightAt(cx, cz) + 0.3;
  m.box(cx - 4, gy - 0.6, cz - 4, cx + 4, gy, cz + 4, 12);
  for (const [px, pz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) m.box(cx + px - 0.2, gy, cz + pz - 0.2, cx + px + 0.2, gy + 3, cz + pz + 0.2, 0);
  m.slope(cx - 4.6, cz - 4.6, cx, cz + 4.6, 'x', gy + 3, gy + 4.4, 10);
  m.slope(cx, cz - 4.6, cx + 4.6, cz + 4.6, 'x', gy + 4.4, gy + 3, 10);
  m.lootAt(cx, gy, cz, 'chest');
  m.claim(cx - 5, cz - 5, cx + 5, cz + 5);
  // pavilion
  building(m, R, -195, 210, 14, 9, 's', { roof: 'gable', siding: 12, roofc: 8, loot: 2, chest: 0.5 });
  // tennis courts with fences
  const tx = -100, tz = 205, ty = heightAt(tx, tz) + 0.05;
  m.decor.push({ t: 'court', x: tx, z: tz, y: ty, w: 22, d: 34 });
  m.box(tx - 11, ty, tz - 17, tx + 11, ty + 3, tz - 16.9, 13, { nobullet: true });
  m.box(tx - 11, ty, tz + 16.9, tx + 11, ty + 3, tz + 17, 13, { nobullet: true });
  m.box(tx - 11, ty, tz - 17, tx - 10.9, ty + 3, tz - 2, 13, { nobullet: true });
  m.box(tx + 10.9, ty, tz + 2, tx + 11, ty + 3, tz + 17, 13, { nobullet: true });
  m.claim(tx - 11, tz - 17, tx + 11, tz + 17);
  m.lootAt(tx, ty, tz, 'floor');
  // fishing pier into the river
  const px = -160, pz0 = bankZ(-160) - 6;
  m.box(px - 1.5, -4, pz0, px + 1.5, 1.2, pz0 + 40, 12);
  m.box(px - 5, -4, pz0 + 40, px + 5, 1.2, pz0 + 48, 12);
  m.lootAt(px, 1.2, pz0 + 44, 'floor');
  // playground
  for (let i = 0; i < 4; i++) m.box(-200 + i * 3, heightAt(-200, 250), 248, -199 + i * 3, heightAt(-200, 250) + 2.6, 249, 19);
  m.decor.push({ t: 'sign', text: 'BRIELLE PARK', x: -150, y: heightAt(-150, 190) + 1.3, z: 192, ry: Math.PI, w: 6, bg: '#2e5d3a', fg: '#fff', post: true });
}

function docks(m, R, x0, x1, zBank, len, every, boats) {
  m.box(x0, -4, zBank - 4, x1, 1.2, zBank, 12);
  for (let x = x0 + every / 2; x < x1; x += every) {
    m.box(x - 1, -4, zBank, x + 1, 1.2, zBank + len, 12);
    if (boats && R() < 0.8) m.prop('boat', x + 4.2, zBank + len * 0.55, 0, R.range(0.9, 1.15), 0.1);
    if (R() < 0.5) m.lootAt(x, 1.2, zBank + len - 2, R() < 0.3 ? 'chest' : 'floor');
  }
}

function buildLanding(m, R) {
  const b = building(m, R, 40, 292, 26, 16, 'n', { floors: 2, roof: 'gable', sign: 'UNION LANDING', siding: 0, roofc: 15, signbg: '#1d2b44', loot: 3, chest: 0.9 });
  // deck out back over the water
  const zb = bankZ(40);
  m.box(26, -4, b.z1, 54, b.base, zb + 6, 12);
  docks(m, R, 10, 75, zb + 6, 22, 13, true);
  for (let i = 0; i < 6; i++) m.prop('car', 22 + i * 3.4, 268, 0);
}

function buildYachtClub(m, R) {
  building(m, R, 165, 286, 22, 14, 'n', { floors: 2, roof: 'gable', sign: 'YACHT CLUB', siding: 0, roofc: 15, signbg: '#15365e', loot: 3, chest: 0.9 });
  building(m, R, 200, 268, 16, 12, 'w', { roof: 'flat', shop: true, sign: 'MARINE SUPPLY', siding: 1, loot: 2, chest: 0.5 });
  docks(m, R, 120, 215, bankZ(165) + 4, 34, 11, true);
  // boat racks on land (cover)
  for (let i = 0; i < 4; i++) {
    const x = 130 + i * 7, z = 262, y = heightAt(x, z);
    m.box(x - 0.2, y, z - 4, x + 0.2, y + 4.5, z + 4, 13);
    m.prop('boat', x + 3.4, z, 0, 0.8, y + 2.2);
  }
  m.prop('crate', 150, 270, 0); m.prop('crate', 151.6, 270, 0); m.prop('crate', 150.8, 270, 0, 1, heightAt(150, 270) + 1.4);
}

function buildRailYard(m, R) {
  // sidings with boxcars you can hide behind and climb on (ladders = slopes on the ends)
  const cols = [20, 21, 13, 19, 6];
  for (let k = 0; k < 3; k++) {
    const x = 262 + k * 9;
    m.rails.push({ x0: x, z0: 150, x1: x, z1: 290 });
    for (let z = 160 + (k % 2) * 8; z < 280; z += R.range(20, 30)) {
      if (R() < 0.25) continue;
      const y = heightAt(x, z) + 0.9;
      m.box(x - 1.6, y, z, x + 1.6, y + 3.6, z + 14, cols[(k + z) % cols.length]);
      m.slope(x - 0.5, z - 3, x + 0.5, z, 'z', heightAt(x, z - 3), y + 3.6, 13);
      if (R() < 0.6) m.lootAt(x, y + 3.6, z + 7, R() < 0.3 ? 'chest' : 'floor');
    }
    m.claim(x - 2, 150, x + 2, 290);
  }
  building(m, R, 300, 180, 12, 10, 'w', { roof: 'flat', sign: 'RAIL YARD', siding: 11, signbg: '#2b2b2b', loot: 2, chest: 0.7 });
  for (let i = 0; i < 6; i++) m.prop('crate', 290 + (i % 3) * 1.5, 240 + Math.floor(i / 3) * 1.5, 0);
  m.prop('dumpster', 300, 200, 0);
}

function buildBridges(m, R) {
  // Route 35 bridge: rises over the river and comes down on the Point Pleasant side
  const x = -270, w = 13, zA = bankZ(x) - 14, zB = farZ(x) + 14, top = 13;
  const yA = heightAt(x, zA), yB = heightAt(x, zB);
  const zM0 = zA + (zB - zA) * 0.33, zM1 = zA + (zB - zA) * 0.67;
  m.slope(x - w / 2, zA, x + w / 2, zM0, 'z', yA, top, 22);
  m.box(x - w / 2, top - 0.6, zM0, x + w / 2, top, zM1, 22);
  m.slope(x - w / 2, zM1, x + w / 2, zB, 'z', top, yB, 22);
  for (let z = zA + 12; z < zB - 8; z += 16) {
    const y = Math.min(top, z < zM0 ? lerp(yA, top, (z - zA) / (zM0 - zA)) : z > zM1 ? lerp(top, yB, (z - zM1) / (zB - zM1)) : top);
    m.box(x - 4.5, -4, z, x - 3, y - 0.7, z + 1.2, 11);
    m.box(x + 3, -4, z, x + 4.5, y - 0.7, z + 1.2, 11);
  }
  m.decor.push({ t: 'rail', x0: x - w / 2, x1: x + w / 2, zA, zM0, zM1, zB, yA, yB, top });
  m.claim(x - w / 2, zA, x + w / 2, zB);
  m.lootAt(x, top, (zM0 + zM1) / 2, 'chest');

  // The Draw: railroad lift bridge. The lift span is up (boats pass), so the middle is a gap.
  const rx = 250, rA = bankZ(rx) - 4, rB = farZ(rx) + 6, dy = 3;
  const g0 = lerp(rA, rB, 0.42), g1 = lerp(rA, rB, 0.58);
  m.box(rx - 2.5, dy - 0.8, rA, rx + 2.5, dy, g0, 12);
  m.box(rx - 2.5, dy - 0.8, g1, rx + 2.5, dy, rB, 12);
  for (let z = rA + 6; z < rB; z += 10) if (z < g0 - 1 || z > g1 + 1) m.box(rx - 2, -4, z, rx + 2, dy - 0.8, z + 1, 12);
  for (const z of [g0 - 3, g1]) { m.box(rx - 4, -4, z, rx - 2.6, 24, z + 3, 13); m.box(rx + 2.6, -4, z, rx + 4, 24, z + 3, 13); m.box(rx - 4, 22, z, rx + 4, 24, z + 3, 13); }
  m.box(rx - 2.5, 17, g0, rx + 2.5, 18, g1, 13);   // the raised span
  m.slope(rx - 0.4, g0 - 3, rx + 0.4, g0, 'z', dy, 17.8, 13);   // maintenance ladder up to the span
  m.lootAt(rx, 18, (g0 + g1) / 2, 'chest');
  m.rails.push({ x0: rx, z0: rA, x1: rx, z1: g0 }, { x0: rx, z0: g1, x1: rx, z1: rB });
  m.claim(rx - 4, rA, rx + 4, rB);
}

function buildWoods(m, R) {
  const cabins = [[-40, -440], [60, -470], [90, -395], [-90, -390], [20, -360]];
  for (const [x, z] of cabins) building(m, R, x, z, 9, 8, R.pick(['n', 's', 'e', 'w']), { siding: 12, roofc: 9, loot: 1, chest: 0.6 });
  // ranger tower: tall posts, a deck and a ladder
  const tx = 10, tz = -420, ty = heightAt(tx, tz);
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) m.box(tx + px - 0.25, ty, tz + pz - 0.25, tx + px + 0.25, ty + 14, tz + pz + 0.25, 12);
  m.box(tx - 3, ty + 13.6, tz - 3, tx + 3, ty + 14, tz + 3, 12);
  m.box(tx - 3, ty + 14, tz - 3, tx + 3, ty + 15, tz - 2.8, 12);
  m.slope(tx - 0.5, tz + 3, tx + 0.5, tz + 9, 'z', ty + 14, ty, 12);
  m.lootAt(tx, ty + 14, tz, 'chest');
  m.claim(tx - 3, tz - 3, tx + 3, tz + 9);
}

function buildGlimmer(m, R) {
  // the old Glimmer Glass bridge: a low deck over the creek
  const z = 60, xA = creekX(z) - 34, xB = creekX(z) + 34, y = 2.6;
  m.slope(xA, z - 4.5, xA + 10, z + 4.5, 'x', heightAt(xA, z), y, 12);
  m.box(xA + 10, y - 0.5, z - 4.5, xB - 10, y, z + 4.5, 12);
  m.slope(xB - 10, z - 4.5, xB, z + 4.5, 'x', y, heightAt(xB, z), 12);
  m.box(xA + 10, y, z - 4.6, xB - 10, y + 1, z - 4.3, 0); m.box(xA + 10, y, z + 4.3, xB - 10, y + 1, z + 4.6, 0);
  m.box(creekX(z) - 2, y, z + 4.6, creekX(z) + 2, y + 3.2, z + 8, 0);   // bridge tender's hut
  m.claim(xA, z - 5, xB, z + 8);
  m.lootAt(creekX(z), y, z, 'chest');
  const R2 = rng(77);
  for (const [x, zz, f] of [[455, 20, 'w'], [470, 100, 'w'], [455, 130, 'w'], [370, 20, 'e'], [372, 110, 'e'], [470, -20, 'w']]) {
    if (m.free(x - 6, zz - 6, x + 6, zz + 6, 2) && waterDist(x, zz) < -8) building(m, R2, x, zz, 11, 10, f, { floors: 2, loot: 2, chest: 0.5 });
  }
}
