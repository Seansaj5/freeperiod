// The map plus everything that changes during a match (built pieces, harvested props), with the questions movement
// and shooting ask: what's under me, what am I walking into, what does this bullet hit.
import { BrielleMap, heightAt, slopeY, GRID } from './map.js';
import { Builds, surfaceY, CONE_H } from './build.js';
import { BUILD, HARVEST } from './rules.js';

const C = BUILD.CELL, L = BUILD.LEVEL;
let shared = null;
/** The map is the same every match, so it is built once per program. */
export function getMap() { return shared || (shared = new BrielleMap()); }

function rayBox(ox, oy, oz, dx, dy, dz, b, max) {
  let t0 = 0, t1 = max;
  for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  return t0;
}

export class World {
  constructor(map = getMap()) {
    this.map = map;
    this.builds = new Builds((x, z, yTop) => this.mapGround(x, z, yTop));
    this.gone = new Set();            // harvested props
    this.propHp = new Map();
  }

  propAlive(p) { return !this.gone.has(p.id); }
  propHealth(p) { return this.propHp.has(p.id) ? this.propHp.get(p.id) : HARVEST[p.kind].hp; }

  /** Highest map surface (terrain, blocks, map slopes) at a point, at or below yTop. Used for building support. */
  mapGround(x, z, yTop) {
    let g = heightAt(x, z);
    this.map.each(x - 0.01, z - 0.01, x + 0.01, z + 0.01, (k, it) => {
      if (k === 'b') { if (x >= it.x0 && x <= it.x1 && z >= it.z0 && z <= it.z1 && it.y1 <= yTop && it.y1 > g) g = it.y1; }
      else if (k === 's') { if (x >= it.x0 && x <= it.x1 && z >= it.z0 && z <= it.z1) { const y = slopeY(it, x, z); if (y <= yTop && y > g) g = y; } }
    });
    return g;
  }

  /** Highest surface under a square footprint (half size r) at or below yTop. */
  ground(x, z, r, yTop) {
    let g = heightAt(x, z);
    const x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r;
    this.map.each(x0, z0, x1, z1, (k, it) => {
      if (k === 'b') {
        if (x1 > it.x0 && x0 < it.x1 && z1 > it.z0 && z0 < it.z1 && it.y1 <= yTop && it.y1 > g) g = it.y1;
      } else if (k === 's') {
        if (x1 > it.x0 && x0 < it.x1 && z1 > it.z0 && z0 < it.z1) {
          const y = slopeY(it, Math.min(Math.max(x, it.x0), it.x1), Math.min(Math.max(z, it.z0), it.z1));
          if (y <= yTop && y > g) g = y;
        }
      } else if (it.solid && !this.gone.has(it.id)) {
        const top = it.y + it.h;
        if (x1 > it.x - it.hw && x0 < it.x + it.hw && z1 > it.z - it.hd && z0 < it.z + it.hd && top <= yTop && top > g) g = top;
      }
    });
    this.builds.near(x0, z0, x1, z1, (p) => {
      if (p.t === 'ramp' || p.t === 'cone') {
        const cx = Math.min(Math.max(x, p.i * C + 0.001), (p.i + 1) * C - 0.001), cz = Math.min(Math.max(z, p.j * C + 0.001), (p.j + 1) * C - 0.001);
        if (x1 < p.i * C || x0 > (p.i + 1) * C || z1 < p.j * C || z0 > (p.j + 1) * C) return;
        const y = surfaceY(p, cx, cz);
        if (y !== null && y <= yTop && y > g) g = y;
        return;
      }
      for (const b of p.bx) if (x1 > b.x0 && x0 < b.x1 && z1 > b.z0 && z0 < b.z1 && b.y1 <= yTop && b.y1 > g) g = b.y1;
    });
    return g;
  }

  /** Highest top of any solid overlapping the box, or null if nothing overlaps. */
  hit(x0, y0, z0, x1, y1, z1) {
    let top = null;
    const t = (v) => { if (top === null || v > top) top = v; };
    this.map.each(x0, z0, x1, z1, (k, it) => {
      if (k === 'b') { if (x1 > it.x0 && x0 < it.x1 && z1 > it.z0 && z0 < it.z1 && y1 > it.y0 && y0 < it.y1) t(it.y1); }
      else if (k === 'p' && it.solid && !this.gone.has(it.id)) {
        if (x1 > it.x - it.hw && x0 < it.x + it.hw && z1 > it.z - it.hd && z0 < it.z + it.hd && y1 > it.y && y0 < it.y + it.h) t(it.y + it.h);
      }
    });
    this.builds.near(x0, z0, x1, z1, (p) => {
      for (const b of p.bx) if (x1 > b.x0 && x0 < b.x1 && z1 > b.z0 && z0 < b.z1 && y1 > b.y0 && y0 < b.y1) t(b.y1);
    });
    return top;
  }

  /** Lowest bottom of a solid above y within the footprint (for bumping your head), or Infinity. */
  ceiling(x, z, r, y, yMax) {
    let c = Infinity;
    const x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r;
    this.map.each(x0, z0, x1, z1, (k, it) => {
      if (k === 'b' && x1 > it.x0 && x0 < it.x1 && z1 > it.z0 && z0 < it.z1 && it.y0 >= y && it.y0 < yMax && it.y0 < c) c = it.y0;
    });
    this.builds.near(x0, z0, x1, z1, (p) => {
      for (const b of p.bx) if (x1 > b.x0 && x0 < b.x1 && z1 > b.z0 && z0 < b.z1 && b.y0 >= y && b.y0 < yMax && b.y0 < c) c = b.y0;
    });
    return c;
  }

  /**
   * First thing a ray hits within max metres. d must be normalised.
   * Returns { t, kind: 'terrain'|'map'|'prop'|'piece', id, x, y, z } or null. opts.skipBush ignores bushes.
   */
  ray(ox, oy, oz, dx, dy, dz, max, opts = {}) {
    let best = max, hit = null;
    const consider = (t, kind, id) => { if (t >= 0 && t < best) { best = t; hit = { kind, id }; } };
    // terrain (marching)
    const step = 1.5;
    let prevT = 0, prevD = oy - heightAt(ox, oz);
    if (prevD > 0) {
      for (let t = step; t <= max; t += step) {
        const y = oy + dy * t;
        if (y > 26 && dy >= 0) break;
        const d = y - heightAt(ox + dx * t, oz + dz * t);
        if (d < 0) {
          let a = prevT, b = t;
          for (let i = 0; i < 8; i++) { const mtt = (a + b) / 2; if (oy + dy * mtt - heightAt(ox + dx * mtt, oz + dz * mtt) < 0) b = mtt; else a = mtt; }
          consider(a, 'terrain', 0);
          break;
        }
        prevT = t; prevD = d;
      }
    }
    // map + props + pieces: walk the 16 m grid along the ray
    let cx = Math.floor(ox / GRID), cz = Math.floor(oz / GRID);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? GRID / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? GRID / Math.abs(dz) : Infinity;
    let tx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * GRID - ox : ox - cx * GRID) / Math.abs(dx)) : Infinity;
    let tz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * GRID - oz : oz - cz * GRID) / Math.abs(dz)) : Infinity;
    const q = ++this.map.q;
    let tCell = 0;
    for (let n = 0; n < 200 && tCell < best; n++) {
      const cell = this.map.cell(cx, cz);
      if (cell) {
        for (const i of cell.b) {
          const b = this.map.boxes[i];
          if (b._q === q) continue; b._q = q;
          if (b.nb) continue;
          consider(rayBox(ox, oy, oz, dx, dy, dz, b, best), 'map', i);
        }
        for (const i of cell.s) {
          const s = this.map.slopes[i];
          if (s._q === q) continue; s._q = q;
          const k = s.ax === 'x' ? (s.yb - s.ya) / (s.x1 - s.x0) : (s.yb - s.ya) / (s.z1 - s.z0);
          const den = s.ax === 'x' ? dy - k * dx : dy - k * dz;
          if (Math.abs(den) < 1e-9) continue;
          const t = s.ax === 'x' ? (s.ya + k * (ox - s.x0) - oy) / den : (s.ya + k * (oz - s.z0) - oy) / den;
          if (t < 0 || t >= best) continue;
          const px = ox + dx * t, pz = oz + dz * t;
          if (px >= s.x0 && px <= s.x1 && pz >= s.z0 && pz <= s.z1) consider(t, 'map', -1 - i);
        }
        for (const i of cell.p) {
          const p = this.map.props[i];
          if (p._q === q) continue; p._q = q;
          if (this.gone.has(p.id) || (opts.skipBush && p.kind === 'bush')) continue;
          const wide = p.kind === 'tree' || p.kind === 'pine' ? 0.25 : 0;
          consider(rayBox(ox, oy, oz, dx, dy, dz, { x0: p.x - p.hw - wide, x1: p.x + p.hw + wide, y0: p.y, y1: p.y + p.h, z0: p.z - p.hd - wide, z1: p.z + p.hd + wide }, best), 'prop', p.id);
        }
      }
      // pieces in this map cell
      const x0 = cx * GRID, z0 = cz * GRID;
      this.builds.near(x0, z0, x0 + GRID - 0.01, z0 + GRID - 0.01, (p) => {
        if (p._rq === q) return; p._rq = q;
        if (p.t === 'ramp') {
          const dir = p.dir, X0 = p.i * C, Z0 = p.j * C, Y0 = p.k * L + (p.o || 0);
          const ax = dir === 1 || dir === 3 ? 'x' : 'z';
          const up = dir === 1 || dir === 2;
          const k = (up ? L : -L) / C, base = up ? Y0 : Y0 + L;
          const den = ax === 'x' ? dy - k * dx : dy - k * dz;
          if (Math.abs(den) < 1e-9) return;
          const t = ax === 'x' ? (base + k * (ox - X0) - oy) / den : (base + k * (oz - Z0) - oy) / den;
          const px = ox + dx * t, pz = oz + dz * t;
          if (px >= X0 && px <= X0 + C && pz >= Z0 && pz <= Z0 + C) consider(t, 'piece', p.id);
          return;
        }
        if (p.t === 'cone') { consider(rayBox(ox, oy, oz, dx, dy, dz, { x0: p.i * C + 0.4, x1: (p.i + 1) * C - 0.4, y0: p.k * L + (p.o || 0), y1: p.k * L + (p.o || 0) + CONE_H * 0.6, z0: p.j * C + 0.4, z1: (p.j + 1) * C - 0.4 }, best), 'piece', p.id); return; }
        for (const b of p.bx) consider(rayBox(ox, oy, oz, dx, dy, dz, b, best), 'piece', p.id);
      });
      if (tx < tz) { tCell = tx; tx += tdx; cx += sx; } else { tCell = tz; tz += tdz; cz += sz; }
    }
    if (!hit) return null;
    hit.t = best; hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    return hit;
  }

  /** Is the straight line between two points clear? */
  clear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return !this.ray(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, { skipBush: true });
  }
}

/** Ray against a player's body: returns { t, head } or null. The body is a box, the head a sphere. */
export function rayPlayer(ox, oy, oz, dx, dy, dz, max, p) {
  const h = p.crouch ? 1.25 : 1.8;
  const hy = p.y + h - 0.2;
  // head sphere
  const lx = ox - p.x, ly = oy - hy, lz = oz - p.z;
  const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - 0.29 * 0.29;
  const disc = b * b - c;
  let head = -1;
  if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t >= 0 && t < max) head = t; }
  const body = rayBox(ox, oy, oz, dx, dy, dz, { x0: p.x - 0.42, x1: p.x + 0.42, y0: p.y, y1: hy - 0.22, z0: p.z - 0.42, z1: p.z + 0.42 }, max);
  if (head >= 0 && (body < 0 || head <= body + 0.05)) return { t: head, head: true };
  if (body >= 0) return { t: body, head: false };
  return null;
}
