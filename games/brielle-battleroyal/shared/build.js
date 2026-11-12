// Player building: walls, floors, ramps and cones on a world grid, with edits, health and collapse.
//   wall  (i,j,k,ax) ax 'x': runs along x at z = j*CELL;  ax 'z': runs along z at x = i*CELL.   edit = 3x3 tiles (bit = removed)
//   floor (i,j,k)    the cell's square at y = k*LEVEL.                                           edit = 2x2 tiles
//   ramp  (i,j,k,dir) rises from k*LEVEL to (k+1)*LEVEL. dir 0 north (-z), 1 east, 2 south, 3 west. edit = new direction
//   cone  (i,j,k)    a low pyramid on the cell (no edits)
import { BUILD } from './rules.js';

const C = BUILD.CELL, L = BUILD.LEVEL, TH = BUILD.THICK;
export const CONE_H = L * 0.55;
const ckey = (i, j) => (i + 1000) * 4000 + (j + 1000);

// Each structure sits on its own height offset o (0..LEVEL), taken from the ground where it was started, so builds on
// a hill aren't half buried. Pieces of one structure share o; the slot key includes it.
const okey = (p) => '@' + Math.round((p.o || 0) * 20);
export function slotKey(p) {
  if (p.t === 'wall') return 'w' + p.ax + p.i + ',' + p.j + ',' + p.k + okey(p);
  if (p.t === 'floor') return 'f' + p.i + ',' + p.j + ',' + p.k + okey(p);
  return 's' + p.i + ',' + p.j + ',' + p.k + okey(p);
}
export const baseY = (p) => p.k * L + (p.o || 0);
/** The height offset for a new structure started by someone standing at feet height y. */
export const offsetFor = (y) => ((y % L) + L) % L;

/** Outer bounds of a piece (whole, ignoring edits). */
export function bounds(p) {
  const y0 = baseY(p);
  if (p.t === 'wall') {
    if (p.ax === 'x') return { x0: p.i * C, x1: (p.i + 1) * C, y0, y1: y0 + L, z0: p.j * C - TH / 2, z1: p.j * C + TH / 2 };
    return { x0: p.i * C - TH / 2, x1: p.i * C + TH / 2, y0, y1: y0 + L, z0: p.j * C, z1: (p.j + 1) * C };
  }
  if (p.t === 'floor') return { x0: p.i * C, x1: (p.i + 1) * C, y0: y0 - TH, y1: y0, z0: p.j * C, z1: (p.j + 1) * C };
  return { x0: p.i * C, x1: (p.i + 1) * C, y0, y1: y0 + (p.t === 'cone' ? CONE_H : L), z0: p.j * C, z1: (p.j + 1) * C };
}

/** Solid boxes of a wall or floor after edits. */
export function pieceBoxes(p) {
  const m = p.edit || 0;
  if (p.t === 'wall') {
    const b = bounds(p), out = [];
    if (!m) return [b];
    const t = C / 3, h = L / 3;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      if (m & (1 << (row * 3 + col))) continue;
      const y0 = b.y0 + row * h;
      if (p.ax === 'x') out.push({ x0: b.x0 + col * t, x1: b.x0 + (col + 1) * t, y0, y1: y0 + h, z0: b.z0, z1: b.z1 });
      else out.push({ x0: b.x0, x1: b.x1, y0, y1: y0 + h, z0: b.z0 + col * t, z1: b.z0 + (col + 1) * t });
    }
    return out;
  }
  if (p.t === 'floor') {
    const b = bounds(p);
    if (!m) return [b];
    const out = [], hC = C / 2;
    for (let q = 0; q < 4; q++) {
      if (m & (1 << q)) continue;
      const qx = q % 2, qz = q >> 1;
      out.push({ x0: b.x0 + qx * hC, x1: b.x0 + (qx + 1) * hC, y0: b.y0, y1: b.y1, z0: b.z0 + qz * hC, z1: b.z0 + (qz + 1) * hC });
    }
    return out;
  }
  return [];
}

/** Height of a ramp or cone's top surface at (x, z), or null outside it. */
export function surfaceY(p, x, z) {
  const x0 = p.i * C, z0 = p.j * C;
  const u = (x - x0) / C, v = (z - z0) / C;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const y0 = baseY(p);
  if (p.t === 'ramp') {
    const t = p.dir === 0 ? 1 - v : p.dir === 1 ? u : p.dir === 2 ? v : 1 - u;
    return y0 + L * t;
  }
  if (p.t === 'cone') return y0 + CONE_H * (1 - Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2);
  return null;
}

const overlap = (a, b, e = 0.06) => a.x0 - e < b.x1 && a.x1 + e > b.x0 && a.y0 - e < b.y1 && a.y1 + e > b.y0 && a.z0 - e < b.z1 && a.z1 + e > b.z0;

/**
 * Where a piece goes when a player at (x, feet y, z) looking along yaw/pitch builds it. Same rules on both sides,
 * so the ghost the player sees is what the server places. yaw 0 = looking north (-z), increases turning west (left).
 */
export function targetFor(t, x, y, z, yaw, pitch, off = 0) {
  const s = targetRaw(t, x, y - off, z, yaw, pitch);
  s.o = off;
  return s;
}
function targetRaw(t, x, y, z, yaw, pitch) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const card = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 2 : 0);   // dir faced
  const ci = Math.floor(x / C), cj = Math.floor(z / C);
  const lookUp = pitch > 0.32, lookDown = pitch < -0.5;
  const feetK = Math.floor((y + 0.35) / L);
  const fwd = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] }[card];
  // which cell is "in front": the next cell if you are close to its edge, else your own (Fortnite-style)
  const lx = x / C - ci, lz = z / C - cj;
  const toEdge = card === 0 ? lz : card === 1 ? 1 - lx : card === 2 ? 1 - lz : lx;
  const front = toEdge < 0.62;
  const ni = ci + (front ? fwd[0] : 0), nj = cj + (front ? fwd[1] : 0);
  if (t === 'wall') {
    // the edge of your cell you face
    let k = feetK + (lookUp && pitch > 0.75 ? 1 : 0) - (lookDown && pitch < -1.05 ? 1 : 0);
    if (card === 0) return { t, ax: 'x', i: ci, j: cj, k };
    if (card === 2) return { t, ax: 'x', i: ci, j: cj + 1, k };
    if (card === 1) return { t, ax: 'z', i: ci + 1, j: cj, k };
    return { t, ax: 'z', i: ci, j: cj, k };
  }
  if (t === 'floor') {
    const k = lookUp ? feetK + 1 : feetK;
    return { t, i: lookDown ? ci : ni, j: lookDown ? cj : nj, k: Math.max(k, Math.floor((y + 0.35) / L)) };
  }
  if (t === 'ramp') {
    const k = lookUp && pitch > 0.7 ? feetK + 1 : feetK;
    return { t, i: lookDown ? ci : (front ? ni : ci), j: lookDown ? cj : (front ? nj : cj), k, dir: card };
  }
  // cone: on top of you when looking up, in front otherwise
  return { t: 'cone', i: lookUp ? ci : ni, j: lookUp ? cj : nj, k: lookUp ? feetK + 1 : feetK };
}

export class Builds {
  /** groundAt(x, z, yTop) = highest map surface (terrain, map blocks) at or below yTop. */
  constructor(groundAt) {
    this.groundAt = groundAt;
    this.pieces = new Map();    // id -> piece
    this.slots = new Map();     // slot key -> id
    this.cells = new Map();     // 2D cell -> Set(id)
    this.nextId = 1;
    this.q = 1;
  }

  _cells(b) {
    const out = [];
    for (let i = Math.floor((b.x0 - 0.1) / C); i <= Math.floor((b.x1 + 0.1) / C); i++)
      for (let j = Math.floor((b.z0 - 0.1) / C); j <= Math.floor((b.z1 + 0.1) / C); j++) out.push(ckey(i, j));
    return out;
  }

  grounded(p) {
    const b = bounds(p);
    const pts = p.t === 'wall'
      ? (p.ax === 'x' ? [[b.x0 + 0.2, p.j * C], [(b.x0 + b.x1) / 2, p.j * C], [b.x1 - 0.2, p.j * C]] : [[p.i * C, b.z0 + 0.2], [p.i * C, (b.z0 + b.z1) / 2], [p.i * C, b.z1 - 0.2]])
      : [[b.x0 + 0.3, b.z0 + 0.3], [b.x1 - 0.3, b.z0 + 0.3], [b.x0 + 0.3, b.z1 - 0.3], [b.x1 - 0.3, b.z1 - 0.3], [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]];
    for (const [x, z] of pts) if (this.groundAt(x, z, b.y0 + 0.6) >= b.y0 - 0.45) return true;
    return false;
  }

  buried(p) {
    const b = bounds(p);
    const top = p.t === 'floor' ? b.y1 : b.y1 - 0.4;
    for (const [x, z] of [[b.x0 + 0.2, b.z0 + 0.2], [b.x1 - 0.2, b.z1 - 0.2], [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]]) if (this.groundAt(x, z, 999) < top) return false;
    return true;
  }

  neighbors(p) {
    const b = bounds(p), out = [];
    const q = ++this.q;
    for (const k of this._cells(b)) {
      const set = this.cells.get(k);
      if (!set) continue;
      for (const id of set) {
        if (id === p.id) continue;
        const o = this.pieces.get(id);
        if (!o || o._q === q) continue;
        o._q = q;
        if (overlap(b, bounds(o))) out.push(o);
      }
    }
    return out;
  }

  /** null if the piece can go there, else why not. spec: {t,i,j,k,ax,dir} */
  check(spec) {
    if (!['wall', 'floor', 'ramp', 'cone'].includes(spec.t)) return 'bad';
    if (![spec.i, spec.j, spec.k].every(Number.isInteger)) return 'bad';
    if (spec.t === 'wall' && spec.ax !== 'x' && spec.ax !== 'z') return 'bad';
    if (spec.t === 'ramp' && ![0, 1, 2, 3].includes(spec.dir)) return 'bad';
    if (spec.k < -2 || spec.k > 40) return 'high';
    if (spec.o !== undefined && !(typeof spec.o === 'number' && spec.o >= 0 && spec.o < L)) return 'bad';
    if (this.slots.has(slotKey(spec))) return 'taken';
    const p = { ...spec, id: -1 };
    if (this.buried(p)) return 'buried';
    if (!this.grounded(p) && !this.neighbors(p).length) return 'floating';
    return null;
  }

  /** Adds a piece (no checks: call check first). Returns it. */
  add(spec, opts = {}) {
    const mat = spec.mat | 0;
    const p = {
      id: opts.id || this.nextId++, t: spec.t, i: spec.i, j: spec.j, k: spec.k, o: Math.round((+spec.o || 0) * 100) / 100, ax: spec.ax, dir: spec.dir | 0,
      mat, own: spec.own | 0, edit: spec.edit | 0, max: BUILD.HP[mat],
      hp: opts.hp !== undefined ? opts.hp : BUILD.HP[mat] * BUILD.START[mat],
      grow: opts.grow !== undefined ? opts.grow : BUILD.HP[mat] * (1 - BUILD.START[mat]), _q: 0,
    };
    if (p.id >= this.nextId) this.nextId = p.id + 1;
    p.g = this.grounded(p);
    p.bx = pieceBoxes(p);
    this.pieces.set(p.id, p);
    this.slots.set(slotKey(p), p.id);
    for (const k of this._cells(bounds(p))) { let s = this.cells.get(k); if (!s) this.cells.set(k, (s = new Set())); s.add(p.id); }
    return p;
  }

  _drop(p) {
    this.pieces.delete(p.id);
    if (this.slots.get(slotKey(p)) === p.id) this.slots.delete(slotKey(p));
    for (const k of this._cells(bounds(p))) { const s = this.cells.get(k); if (s) { s.delete(p.id); if (!s.size) this.cells.delete(k); } }
  }

  /** Removes a piece and everything that no longer touches the ground through other pieces. Returns removed ids. */
  remove(id) {
    const p = this.pieces.get(id);
    if (!p) return [];
    const near = this.neighbors(p);
    this._drop(p);
    const gone = [id];
    const seen = new Set();
    for (const start of near) {
      if (seen.has(start.id) || !this.pieces.has(start.id)) continue;
      const comp = [], stack = [start];
      let ok = false;
      seen.add(start.id);
      while (stack.length) {
        const c = stack.pop();
        comp.push(c);
        if (c.g) ok = true;
        for (const n of this.neighbors(c)) if (!seen.has(n.id)) { seen.add(n.id); stack.push(n); }
        if (comp.length > 4000) { ok = true; break; }
      }
      if (!ok) for (const c of comp) { this._drop(c); gone.push(c.id); }
    }
    return gone;
  }

  /** Damage; returns removed ids (empty if it survived). */
  damage(id, amt) {
    const p = this.pieces.get(id);
    if (!p) return [];
    p.hp -= amt;
    if (p.hp <= 0) return this.remove(id);
    return [];
  }

  /** Grows new pieces toward full health. Returns pieces that changed (for network updates). */
  tick(dt) {
    const out = [];
    for (const p of this.pieces.values()) {
      if (p.grow <= 0) continue;
      const g = Math.min(p.grow, (p.max * (1 - BUILD.START[p.mat]) / BUILD.TIME[p.mat]) * dt);
      p.grow -= g; p.hp = Math.min(p.max, p.hp + g);
      out.push(p);
    }
    return out;
  }

  /** Applies an edit. Walls: 9-bit mask, floors: 4-bit mask, ramps: dir 0-3. Returns false if not allowed. */
  edit(id, v) {
    const p = this.pieces.get(id);
    if (!p || !Number.isInteger(v)) return false;
    if (p.t === 'wall') { if (v < 0 || v >= 511) return false; p.edit = v; }
    else if (p.t === 'floor') { if (v < 0 || v >= 15) return false; p.edit = v; }
    else if (p.t === 'ramp') { if (v < 0 || v > 3) return false; p.dir = v; }
    else return false;
    p.bx = pieceBoxes(p);
    return true;
  }

  /** Pieces whose bounds touch the rectangle (fn(p) for each). */
  near(x0, z0, x1, z1, fn) {
    const q = ++this.q;
    for (let i = Math.floor(x0 / C) - 1; i <= Math.floor(x1 / C) + 1; i++)
      for (let j = Math.floor(z0 / C) - 1; j <= Math.floor(z1 / C) + 1; j++) {
        const s = this.cells.get(ckey(i, j));
        if (!s) continue;
        for (const id of s) { const p = this.pieces.get(id); if (p && p._q !== q) { p._q = q; fn(p); } }
      }
  }

  /** Compact list for the network: [id, t, i, j, k, ax/dir, mat, hp, edit, own] */
  pack(p) { return [p.id, p.t[0], p.i, p.j, p.k, p.t === 'wall' ? p.ax : p.dir, p.mat, Math.round(p.hp), p.edit, p.own, Math.round(p.grow), p.o]; }
  unpackAdd(a) {
    const t = { w: 'wall', f: 'floor', r: 'ramp', c: 'cone' }[a[1]];
    const spec = { t, i: a[2], j: a[3], k: a[4], mat: a[6], edit: a[8], own: a[9], o: a[11] || 0 };
    if (t === 'wall') spec.ax = a[5]; else spec.dir = a[5];
    const old = this.pieces.get(a[0]);
    if (old) this._drop(old);
    const taken = this.slots.get(slotKey(spec));
    if (taken) { const o = this.pieces.get(taken); if (o) this._drop(o); }
    return this.add(spec, { id: a[0], hp: a[7], grow: a[10] || 0 });
  }
  all() { return [...this.pieces.values()].map((p) => this.pack(p)); }
}
