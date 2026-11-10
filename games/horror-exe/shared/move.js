// Character movement: walking, sprinting, jumping, flying, springs, boost pads, bumpers, conveyor
// belts, ice, goo, slopes and walls. Players run this in their browser for themselves; the round runs it for bots.
import { GRAVITY } from './rules.js';
import { terrainH, supportAt, ceilingAt, pushOut, springAt, boostAt, conveyorAt, surfaceAt, clampXZ, STEP, MAX_SLOPE, BOOST } from './map.js';
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
 * Moves e = { x, y, z, vx, vy, vz, ground, lock, r, h, w } for dt seconds (w = which world, for world-only walls).
 * inp = { dx, dz (wanted direction, length 0..1), speed, jump, jumpV, fly, up }.
 * While e.lock > 0 the body keeps its velocity (dashes, lunges, knockbacks, springs, boost pads, bumpers).
 * Returns { landed, spring, boost, bumper, wall }. Sets e.surface ('ice' | 'goo' | 'lava' | 'water' | null).
 */
export function stepMove(e, inp, dt) {
  const out = { landed: false, spring: null, boost: null, bumper: null, wall: false };
  dt = Math.min(dt, 0.1);
  if (e.lock > 0) e.lock = Math.max(0, e.lock - dt);
  const ice = e.surface === 'ice' && e.ground;
  if (e.lock <= 0) {
    const a = (inp.fly ? 70 : !e.ground ? 24 : ice ? 9 : 70) * dt;
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
    const hit = pushOut(p, e.y, e.r, e.h, e.w);
    if (hit) { out.wall = true; if (hit.kind === 'bumper') out.bumper = hit; }
    e.x = p.x; e.z = p.z;
    let ny = e.y + e.vy * h;
    if (e.vy > 0) {
      const c = ceilingAt(e.x, e.z, e.y + e.h, ny + e.h, e.w);
      if (c !== null) { ny = c - e.h; e.vy = 0; }
    }
    const sup = supportAt(e.x, e.z, e.y, false, e.w);
    if (ny <= sup) {
      if (!e.ground && e.vy < -5) out.landed = true;
      e.y = sup; if (e.vy < 0) e.vy = 0; e.ground = true;
    } else if (e.ground && e.vy <= 0 && ny - sup < 0.45) { e.y = sup; e.vy = 0; } // follow the ground down slopes
    else { e.y = ny; e.ground = false; }
  }
  // pinball bumpers throw you away from them
  if (out.bumper) {
    const b = out.bumper, dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz) || 1;
    e.vx = (dx / d) * 15; e.vz = (dz / d) * 15; e.vy = Math.max(e.vy, 5); e.ground = false; e.lock = 0.35;
  }
  if (e.ground && !inp.fly) {
    const s = springAt(e.x, e.z, e.y);
    if (s) {
      e.x = s.x; e.z = s.z; e.y = s.y + 0.05;
      e.vx = s.vx; e.vy = s.vy; e.vz = s.vz;
      e.lock = s.T * 0.92; e.ground = false;
      out.spring = s;
    } else {
      const b = boostAt(e.x, e.z, e.y);
      if (b && e.lock <= 0.05) { e.vx = b.dx * BOOST.speed; e.vz = b.dz * BOOST.speed; e.vy = 2; e.ground = false; e.lock = BOOST.lock; out.boost = b; }
      const c = conveyorAt(e.x, e.z, e.y);
      if (c) { e.x += c.vx * dt; e.z += c.vz * dt; }
    }
  }
  e.surface = surfaceAt(e.x, e.z, e.y);
  e.water = e.surface === 'water';
  return out;
}

/** A fresh body for movement. */
export const body = (x, y, z, r, h, w = 0) => ({ x, y, z, vx: 0, vy: 0, vz: 0, ground: true, lock: 0, r, h, w, water: false, surface: null });
