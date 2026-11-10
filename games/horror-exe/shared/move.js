// Character movement: walking, sprinting, jumping, flying, springs, slopes and walls.
// Players run this in their browser for themselves; the round runs it for bots.
import { GRAVITY } from './rules.js';
import { terrainH, supportAt, ceilingAt, pushOut, springAt, isWater, clampXZ, STEP, MAX_SLOPE } from './map.js';
import { clamp } from './util.js';

/** Ground too steep to walk onto (or too high to land on when airborne). */
function steep(e, nx, nz) {
  const g1 = terrainH(nx, nz);
  if (g1 <= e.y + 0.05) return false;
  if (!e.ground) return g1 > e.y + STEP;
  const d = Math.hypot(nx - e.x, nz - e.z) || 1e-6;
  return (g1 - terrainH(e.x, e.z)) / d > MAX_SLOPE;
}

const p = { x: 0, z: 0 };

/**
 * Moves e = { x, y, z, vx, vy, vz, ground, lock, r, h } for dt seconds.
 * inp = { dx, dz (wanted direction, length 0..1), speed, jump, jumpV, fly, up }.
 * While e.lock > 0 the body keeps its velocity (dashes, lunges, knockbacks, springs).
 * Returns { landed, spring, wall }.
 */
export function stepMove(e, inp, dt) {
  const out = { landed: false, spring: null, wall: false };
  dt = Math.min(dt, 0.1);
  if (e.lock > 0) e.lock = Math.max(0, e.lock - dt);
  if (e.lock <= 0) {
    const a = (e.ground || inp.fly ? 70 : 24) * dt;
    e.vx += clamp(inp.dx * inp.speed - e.vx, -a, a);
    e.vz += clamp(inp.dz * inp.speed - e.vz, -a, a);
  }
  if (inp.fly) e.vy += clamp((inp.up ? 7 : -1.2) - e.vy, -30 * dt, 30 * dt);
  else {
    if (e.ground && inp.jump && e.lock <= 0) { e.vy = inp.jumpV; e.ground = false; }
    e.vy = Math.max(-40, e.vy - GRAVITY * dt);
  }
  const sp = Math.hypot(e.vx, e.vz) + Math.abs(e.vy);
  const n = clamp(Math.ceil((sp * dt) / 0.3), 1, 12), h = dt / n;
  for (let i = 0; i < n; i++) {
    p.x = e.x + e.vx * h; p.z = e.z + e.vz * h;
    clampXZ(p);
    if (steep(e, p.x, p.z)) {
      out.wall = true;
      if (!steep(e, p.x, e.z)) p.z = e.z;
      else if (!steep(e, e.x, p.z)) p.x = e.x;
      else { p.x = e.x; p.z = e.z; }
    }
    if (pushOut(p, e.y, e.r, e.h)) out.wall = true;
    e.x = p.x; e.z = p.z;
    let ny = e.y + e.vy * h;
    if (e.vy > 0) {
      const c = ceilingAt(e.x, e.z, e.y + e.h, ny + e.h);
      if (c !== null) { ny = c - e.h; e.vy = 0; }
    }
    const sup = supportAt(e.x, e.z, e.y);
    if (ny <= sup) {
      if (!e.ground && e.vy < -5) out.landed = true;
      e.y = sup; if (e.vy < 0) e.vy = 0; e.ground = true;
    } else if (e.ground && e.vy <= 0 && ny - sup < 0.45) { e.y = sup; e.vy = 0; } // follow the ground down slopes
    else { e.y = ny; e.ground = false; }
  }
  if (e.ground && !inp.fly) {
    const s = springAt(e.x, e.z, e.y);
    if (s) {
      e.x = s.x; e.z = s.z; e.y = s.y + 0.05;
      e.vx = s.vx; e.vy = s.vy; e.vz = s.vz;
      e.lock = s.T * 0.92; e.ground = false;
      out.spring = s;
    }
  }
  e.water = isWater(e.x, e.z, e.y);
  return out;
}

/** A fresh body for movement. */
export const body = (x, y, z, r, h) => ({ x, y, z, vx: 0, vy: 0, vz: 0, ground: true, lock: 0, r, h, water: false });
