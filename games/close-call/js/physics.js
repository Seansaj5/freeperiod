// Arcade car handling in road space, plus collisions with walls and traffic.
// yaw = the car's heading relative to the road (0 = straight down the lane, + = pointing left).
import { clamp, damp } from './util.js';

export const GEAR_TOPS = [0.22, 0.38, 0.53, 0.68, 0.84, 1.0];
const REDLINE = 7400;

export class CarSim {
  constructor(spec) {
    this.setSpec(spec);
    this.reset(300, 0, 0);
  }

  setSpec(spec) {
    this.spec = spec;
    this.hl = spec.body.L / 2;
    this.hw = spec.body.W / 2;
  }

  reset(s, d, v) {
    this.s = s; this.d = d; this.v = v;
    this.yaw = 0; this.steer = 0;
    this.ghost = 0; this.nitro = 0.35; this.boosting = false;
    this.gear = 0; this.rpm = 1000; this.load = 0;
    this.braking = false;
    this.wallCool = 0;
    this.scrape = 0;
    this.draft = false; // in another car's slipstream (set by the game each frame)
  }

  /** Half width across the road, counting the car's angle. */
  get hwEff() { return this.hw * Math.cos(this.yaw) + this.hl * Math.abs(Math.sin(this.yaw)); }

  /**
   * Advance by dt. input = { gas, brake, steer (-1 left .. 1 right), nitro }.
   * Returns events: { type: 'wall', impact } and { type: 'crash', impact, side } (side: true for a side swipe).
   */
  step(dt, input, road, traffic, nTraffic) {
    const ev = [];
    const sp = this.spec;
    const boost = input.nitro && this.nitro > 0.02 && this.v > 5;
    this.boosting = boost;
    if (boost) this.nitro = Math.max(0, this.nitro - dt * 0.28);
    const vmax = (sp.top / 3.6) * (boost ? 1.1 : 1) * (this.draft ? 1.04 : 1);

    // --- speed ---
    let a = 0;
    if (input.gas) a += sp.accel * Math.max(0, 1 - Math.pow(Math.max(0, this.v) / vmax, 2.4)) * (boost ? 1.75 : 1) * (this.draft ? 1.15 : 1);
    if (boost && !input.gas) a += sp.accel * 0.6;
    if (input.brake) a -= 17;
    a -= 9.81 * road.grade(this.s) * 0.45; // hills: a little slower up, a little faster down
    // air drag only when coasting, so every car reaches its listed top speed on the gas
    a -= 0.25 + (input.gas || boost ? 0 : 0.00034 * this.v * this.v);
    if (this.v > vmax) a = Math.min(a, -3);
    this.v = clamp(this.v + a * dt, 0, vmax * 1.03);
    this.accel = a;
    this.braking = !!input.brake && this.v > 1;
    this.load = input.gas || boost ? 1 : 0;

    // gear + rpm (for sound and the HUD)
    const top = sp.top / 3.6;
    let g = 0;
    while (g < GEAR_TOPS.length - 1 && this.v > GEAR_TOPS[g] * top * 0.985) g++;
    this.gear = g;
    this.rpm = clamp((REDLINE * this.v) / (GEAR_TOPS[g] * top), 950, REDLINE + 200);

    // --- steering ---
    const target = clamp(input.steer, -1, 1);
    this.steer = damp(this.steer, target, Math.abs(target) > Math.abs(this.steer) ? 9 : 12, dt);
    const v = this.v;
    const rate = -this.steer * 1.75 * sp.grip / (1 + v / 34) * Math.min(1, v / 5);
    const kap = road.kappa(this.s);
    // the car mostly follows the road's bends by itself (arcade assist); the rest pushes you wide
    this.yaw += (rate - kap * v * Math.cos(this.yaw) * 0.08) * dt;
    if (Math.abs(target) < 0.05) this.yaw = damp(this.yaw, 0, 3.2, dt);
    else this.yaw = damp(this.yaw, 0, 0.6, dt);
    const maxYaw = 0.22 + 0.6 / (1 + v / 14);
    this.yaw = clamp(this.yaw, -maxYaw, maxYaw);

    // --- move ---
    this.s += v * Math.cos(this.yaw) * dt;
    this.d += -v * Math.sin(this.yaw) * dt;
    this.ghost = Math.max(0, this.ghost - dt);
    this.wallCool = Math.max(0, this.wallCool - dt);

    // --- walls ---
    const lim = road.wall - this.hwEff;
    this.scrape = 0;
    if (Math.abs(this.d) > lim - 0.01) {
      const side = Math.sign(this.d);
      const lat = -v * Math.sin(this.yaw) * side; // speed into the wall
      this.d = side * Math.min(Math.abs(this.d), lim);
      this.scrape = side;
      if (lat > 0) {
        this.yaw = -this.yaw * 0.25;
        this.v = Math.max(0, this.v - lat * 0.9 - this.v * 0.03);
        if (lat > 1.5 && this.wallCool <= 0) { ev.push({ type: 'wall', impact: lat }); this.wallCool = 0.4; }
      }
    }

    // --- traffic ---
    if (this.ghost <= 0 && !this.noHit) { // noHit: the owner's god mode drives straight through traffic
      const hwE = this.hwEff;
      for (let i = 0; i < nTraffic; i++) {
        const c = traffic[i];
        const ds = this.s - c.s, dd = this.d - c.d;
        const ox = this.hl + c.hl - Math.abs(ds), oy = hwE + c.hw - Math.abs(dd);
        if (ox <= 0 || oy <= 0) continue;
        const impact = Math.abs(this.v - c.v);
        const side = oy < ox * 0.6;
        if (side) {
          this.d += Math.sign(dd || 1) * (oy + 0.05);
          this.yaw = -Math.sign(dd || 1) * 0.06;
          this.v *= 0.82;
        } else if (ds < 0) {
          this.s = c.s - (this.hl + c.hl) - 0.05;
          this.v = Math.min(this.v, c.v * 0.72);
        } else {
          this.s = c.s + (this.hl + c.hl) + 0.05;
          this.v = Math.max(this.v, c.v * 1.05);
        }
        this.ghost = 1.6;
        ev.push({ type: 'crash', impact, side, ds, dd });
        break;
      }
    }
    return ev;
  }
}
