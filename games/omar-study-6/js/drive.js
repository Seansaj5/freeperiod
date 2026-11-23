// The car you are driving, simulated on your own machine so it answers instantly.
// Forward is (sin ry, cos ry); the right-hand side is (-cos ry, sin ry).
import { VEHICLES } from '../shared/rules.js';
import { landSd } from '../shared/city.js';
import { clamp } from '../shared/util.js';

const o = { x: 0, z: 0, nx: 0, nz: 0 };

export class Car {
  constructor(kind, x, z, ry, sp = 0) {
    this.K = VEHICLES[kind]; this.kind = kind;
    this.x = x; this.z = z; this.ry = ry; this.vx = Math.sin(ry) * sp; this.vz = Math.cos(ry) * sp;
    this.steer = 0; this.sp = sp; this.slip = 0; this.rpm = 0; this.gas = 0; this.braking = false; this.hit = 0; this.dmg = 0; this.wet = false;
    this.roll = 0; this.pitch = 0; this.bumps = [];       // bumps: [{ v, ix, iz, sn }] to tell the world about
    this.rams = []; this.shove = 0;
  }
  /** in: { gas -1..1, steer -1..1, hand }. others: [{ id, x, z, ry, sp, L, W, solid }]. peds: [{ id, x, z, player }] */
  update(dt, input, city, gates, others, peds) {
    const K = this.K, fx = Math.sin(this.ry), fz = Math.cos(this.ry), rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz, vl = this.vx * rx + this.vz * rz;
    const hp = this.hpFrac ?? 1, power = hp < 0.25 ? 0.55 : 1;
    this.steer += (input.steer - this.steer) * Math.min(1, dt * (input.steer ? 5.5 : 8));
    this.gas = input.gas; this.braking = false;
    if (input.gas > 0) { if (vf < -1) { vf += 24 * dt; this.braking = true; } else vf += K.acc * power * input.gas * Math.max(0, 1 - (vf / (K.top * power)) ** 2) * dt; }
    else if (input.gas < 0) { if (vf > 1) { vf -= (20 + K.grip * 8) * dt; this.braking = true; } else vf = Math.max(-13, vf - K.acc * 0.55 * dt); }
    vf -= vf * 0.1 * dt + Math.sign(vf) * Math.min(Math.abs(vf), 0.7 * dt);
    if (input.hand) { vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * dt); this.braking = true; }
    const grip = input.hand ? 1.9 : 6.5 * K.grip + Math.min(4, Math.abs(vf) * 0.1);
    this.slip = Math.abs(vl);
    vl *= Math.max(0, 1 - grip * dt);
    const ang = (0.6 / (1 + Math.abs(vf) / (13 + K.grip * 8))) * this.steer * (input.hand ? 1.5 : 1);
    this.ry += ((vf * Math.tan(ang)) / 2.7) * dt;
    this.vx = fx * vf + rx * vl; this.vz = fz * vf + rz * vl;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.hit = 0;
    // walls: three circles along the body
    const r = K.W / 2 + 0.05, half = K.L / 2 - r;
    for (const k of [1, 0, -1]) {
      const cx = this.x + Math.sin(this.ry) * half * k, cz = this.z + Math.cos(this.ry) * half * k;
      if (!city.collide(cx, cz, r, o, gates)) continue;
      this.x += o.x - cx; this.z += o.z - cz;
      const vn = this.vx * o.nx + this.vz * o.nz;
      if (vn < 0) { this.vx -= o.nx * vn * 1.22; this.vz -= o.nz * vn * 1.22; this.hit = Math.max(this.hit, -vn); if (k) this.ry += clamp(-vn * 0.012, 0, 0.05) * k * Math.sign(o.nx * Math.cos(this.ry) - o.nz * Math.sin(this.ry)); }
      this.vx *= 1 - 0.9 * dt; this.vz *= 1 - 0.9 * dt;
    }
    // other cars
    for (const c of others) {
      const dx0 = c.x - this.x, dz0 = c.z - this.z; if (dx0 * dx0 + dz0 * dz0 > 49) continue;
      const cr = c.W / 2 + 0.05, ch = c.L / 2 - cr, cfx = Math.sin(c.ry), cfz = Math.cos(c.ry);
      for (const k of [1, 0, -1]) for (const j of [1, 0, -1]) {
        const ax = this.x + Math.sin(this.ry) * half * k, az = this.z + Math.cos(this.ry) * half * k, bx = c.x + cfx * ch * j, bz = c.z + cfz * ch * j;
        let dx = ax - bx, dz = az - bz; const d = Math.hypot(dx, dz), min = r + cr;
        if (d >= min || d < 1e-4) continue;
        dx /= d; dz /= d;
        const share = c.solid ? 1 : 0.65;
        this.x += dx * (min - d) * share; this.z += dz * (min - d) * share;
        const cl = (this.vx - cfx * c.sp) * dx + (this.vz - cfz * c.sp) * dz;
        if (cl < 0) {
          this.vx -= dx * cl * (c.solid ? 1.2 : 0.75); this.vz -= dz * cl * (c.solid ? 1.2 : 0.75); this.hit = Math.max(this.hit, -cl * 0.8);
          if (!c.solid && -cl > 1.5) this.bumps.push({ v: c.id, ix: -dx * -cl * 0.7, iz: -dz * -cl * 0.7, sn: clamp((dx * cfz - dz * cfx) * -cl * 0.12 * j, -2.5, 2.5) });
        }
      }
    }
    // people
    const sp = Math.hypot(this.vx, this.vz);
    for (const p of peds) {
      const dx = p.x - this.x, dz = p.z - this.z; if (dx * dx + dz * dz > 16) continue;
      const f = dx * Math.sin(this.ry) + dz * Math.cos(this.ry), l = Math.abs(-dx * Math.cos(this.ry) + dz * Math.sin(this.ry));
      if (Math.abs(f) < K.L / 2 + 0.35 && l < K.W / 2 + 0.35) { this.rams.push({ id: p.id, sp, player: p.player }); if (sp > 4) { this.vx *= 0.985; this.vz *= 0.985; } }
    }
    // the sea is a soft wall
    const sd = landSd(this.x, this.z);
    this.wet = sd > -1;
    if (sd > 1.5) {
      const e = 1, gx = landSd(this.x + e, this.z) - landSd(this.x - e, this.z), gz = landSd(this.x, this.z + e) - landSd(this.x, this.z - e), g = Math.hypot(gx, gz) || 1;
      this.x -= (gx / g) * (sd - 1.5); this.z -= (gz / g) * (sd - 1.5);
      const vn = (this.vx * gx + this.vz * gz) / g; if (vn > 0) { this.vx -= (gx / g) * vn; this.vz -= (gz / g) * vn; }
      this.vx *= 1 - 2 * dt; this.vz *= 1 - 2 * dt;
    }
    if (this.hit > 6) this.dmg += Math.min(260, (this.hit - 6) * 9);
    this.sp = this.vx * Math.sin(this.ry) + this.vz * Math.cos(this.ry);
    const nvl = this.vx * -Math.cos(this.ry) + this.vz * Math.sin(this.ry);
    this.roll += (clamp(-nvl * 0.02 - this.steer * this.sp * 0.0016, -0.09, 0.09) - this.roll) * Math.min(1, dt * 6);
    this.pitch += (clamp((this.braking ? 0.03 : 0) - (input.gas > 0 ? 0.018 : 0), -0.04, 0.04) - this.pitch) * Math.min(1, dt * 5);
    // a simple gearbox for the engine note
    const top = K.top, g = clamp(Math.floor((Math.abs(this.sp) / top) * 5), 0, 4), lo = (g * top) / 5, f = (Math.abs(this.sp) - lo) / (top / 5);
    this.rpm += (0.22 + 0.78 * clamp(f * 0.85 + (input.gas > 0 ? 0.12 : 0), 0, 1) - this.rpm) * Math.min(1, dt * 7);
  }
}
