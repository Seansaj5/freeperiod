// One kart's driving: speed and steering from its parts' stats, drifting, jumps and tricks, the glider, offroad,
// walls, getting hit, falling off and being put back. The same code drives your kart and the computer's
// (they just get their input from ai.js).
//
// Drifting, the heart of it:
//   press drift  -> a little hop (steering in the air works like on the ground)
//   land while holding drift and steering -> the kart swings its tail out (nose into the bend) and slides round
//     that way. How hard it turns is set against your normal steering, so it stays in your hands:
//       steer INTO the drift  -> tighter than full normal steering, for hairpins (and the sparks charge faster)
//       let go of the steering -> a gentler arc, about three quarters of full steering: right for most bends
//       steer AGAINST it       -> nearly straight, to open the line out
//     The turn eases between those (no snapping), so on a keyboard you tap the keys to hold your line.
//     Sparks: blue (mini-turbo), orange (super), gold (ultra). On grass they don't charge.
//   let go -> a speed kick and a boost as long as the sparks were good.
// Brake while drifting to tighten a little more (charges a little slower).
import * as THREE from 'three';
import { statsOf } from './parts.js';

export const CLASSES = {
  rookie: { name: 'Rookie', speed: 0.8, ai: 0.86 },
  pro: { name: 'Pro', speed: 0.9, ai: 0.93 },
  elite: { name: 'Elite', speed: 1.0, ai: 0.985 },
};
export const DRIFT_LV = [0.8, 1.75, 2.85]; // charge for blue, orange, gold sparks
const BOOST_LV = [0, 0.7, 1.25, 1.95];
// How hard a drift turns, as a share of full normal steering at that speed: steering against it / hands off / into it.
// It tightens gradually while you hold into the bend (tighten, per second) and opens out quickly when you let go (loosen).
export const DRIFT_ARC = { against: 0.28, hands: 0.78, into: 1.6, tighten: 3.5, loosen: 9, brake: 1.12 };
const GRAV = 30;
const BOOST = 1.32;

const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const damp = (a, b, r, dt) => b + (a - b) * Math.exp(-r * dt);

export class Kart {
  constructor(track, build, cls, id) {
    this.track = track; this.id = id;
    this.setBuild(build, cls);
    this.pos = new THREE.Vector3();
    this.push = new THREE.Vector2();
    this.loc = {};
    this.input = { gas: false, brake: false, steer: 0, drift: false, item: false };
    this.reset(0, 0);
  }

  setBuild(build, cls) {
    this.build = build;
    const s = (this.stats = statsOf(build));
    const c = CLASSES[cls] || CLASSES.pro;
    this.top0 = (25 + s[0] * 1.55) * c.speed;
    this.acc = 8.5 + s[1] * 2.3;
    this.mass = 1 + s[2] * 0.22;
    this.turn = 1.35 + s[3] * 0.11;
    this.offK = 0.42 + s[4] * 0.05;
    this.turboK = 0.82 + s[5] * 0.08;
  }

  /** On the grid: sample k, d metres right of centre, `total` = progress (negative = behind the line). */
  reset(k, d, total = 0) {
    const t = this.track;
    t.point(k, d, this.pos);
    this.yaw = t.heading(k);
    this.v = 0; this.vy = 0; this.ground = true; this.air = 0;
    this.hint = t.w(k); this.total = total; this.lastS = t.w(k); this.lap = 1; this.lapMax = 1;
    this.finished = false; this.finishT = 0; this.place = 0;
    this.drift = 0; this.driftT = 0; this.driftK = 0; this.charge = 0; this.lvPrev = 0; this.driftAng = 0; this.driftAngV = 0;
    this.hopT = 0; this.wantDrift = false; this.prevDrift = false; this.yawV = 0;
    this.boostT = 0; this.boostMax = 0; this.boostPow = BOOST; this.padT = 0; this.stallT = 0;
    this.spinT = 0; this.spinMax = 1; this.spinDir = 1; this.shieldT = 0; this.starT = 0; this.safeT = 0;
    this.coins = 0; this.item = null; this.itemN = 0; this.rollT = 0; this.trail = null;
    this.glide = false; this.trick = 0; this.trickT = 0; this.trickKind = 0; this.launchT = 0;
    this.respawnT = 0; this.lastSafe = this.hint; this.offroad = false; this.wallHit = 0; this.landed = 0;
    this.draftC = 0; this.drafting = false;
    this.push.set(0, 0); this.steerVis = 0; this.pitch = 0; this.roll = 0; this.events = [];
    this.prevRamp = 0; this.mul = 1; this.got = 0;
    this.locate();
  }

  locate() { this.track.locate(this.pos.x, this.pos.z, this.hint, this.loc); this.hint = this.loc.k; return this.loc; }

  get speedTop() { return this.top0 * this.mul * (1 + Math.min(10, this.coins) * 0.006); }
  get boosting() { return this.boostT > 0 || this.starT > 0; }
  /** Full normal steering at the current speed, in rad/s (drifts turn a share of this, see DRIFT_ARC). */
  fullTurn(sp = Math.abs(this.v)) { return this.turn * Math.min(1, sp / 6) * (1 - 0.28 * Math.min(1, sp / Math.max(1, this.top0))); }
  get driftLevel() { return this.charge >= DRIFT_LV[2] ? 3 : this.charge >= DRIFT_LV[1] ? 2 : this.charge >= DRIFT_LV[0] ? 1 : 0; }

  /** Speed boost for `t` seconds at `pow` x top speed (mini-turbo, dash pad, nitro, trick, start, slipstream, coin). */
  boost(t, kind = 'boost', pow = BOOST) {
    if (this.boostT <= 0 || pow >= this.boostPow) this.boostPow = pow;
    this.boostT = Math.max(this.boostT, t); this.boostMax = Math.max(this.boostT, 0.01);
    this.events.push(kind);
  }

  /** Hit by something. kind: 'spin' (oil, ball) or 'launch' (rocket). Returns false if it bounced off a shield/star. */
  hit(kind = 'spin') {
    if (this.starT > 0 || this.respawnT > 0 || this.safeT > 0) return false;
    if (this.shieldT > 0) { this.shieldT = 0; this.events.push('shield-pop'); return false; }
    this.spinT = this.spinMax = kind === 'launch' ? 1.5 : 1.15; this.spinDir = Math.random() < 0.5 ? -1 : 1;
    if (kind === 'launch') { this.vy = 8.5; this.ground = false; }
    this.drift = 0; this.charge = 0; this.boostT = 0; this.trail = null;
    const lost = Math.min(this.coins, 3); this.coins -= lost;
    this.events.push(kind === 'launch' ? 'launched' : 'spun'); if (lost) this.events.push('coins-lost');
    return true;
  }

  endDrift(boost) {
    if (!this.drift) return;
    const lv = this.driftLevel;
    if (boost && lv) {
      this.boost(BOOST_LV[lv] * this.turboK, 'mt' + lv);
      this.v = Math.min(this.v + 1.5 + lv, this.speedTop * BOOST); // the kick you feel when you let go
    } else if (lv) this.events.push('mt-lost');
    this.drift = 0; this.charge = 0; this.lvPrev = 0; this.driftT = 0;
  }

  step(dt) {
    const t = this.track, inp = this.input;
    let L = this.loc;
    // being put back on the track after falling off
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      const k = this.lastSafe, p = t.point(k, 0, new THREE.Vector3());
      this.pos.set(p.x, p.y + Math.max(0, this.respawnT) * 5, p.z);
      this.yaw = t.heading(k); this.v = 0; this.vy = 0; this.drift = 0; this.charge = 0; this.glide = false;
      this.hint = k; this.locate();
      if (this.respawnT <= 0) { this.ground = true; this.safeT = 1.5; this.events.push('dropped'); }
      return;
    }
    const spin = this.spinT > 0;
    if (spin) this.spinT -= dt;
    for (const f of ['boostT', 'starT', 'shieldT', 'padT', 'safeT']) if (this[f] > 0) this[f] -= dt;
    const stalled = this.stallT > 0;
    if (stalled) this.stallT -= dt;
    const gas = !spin && !stalled && inp.gas, brake = !spin && inp.brake;
    const steer = spin ? 0 : Math.max(-1, Math.min(1, inp.steer));
    const s = this.drift ? steer * this.drift : 0; // in a drift: +1 = steering into it (tight), -1 = against it (wide)
    // ---- speed
    let top = this.speedTop;
    const off = this.ground && !t.void && Math.abs(L.d) > L.hw + t.curb * 0.7 && !L.gap; // (on a void track the edge is a drop, not grass)
    this.offroad = off;
    if (off && !this.boosting) top *= this.offK;
    if (this.boosting) top *= this.starT > 0 ? 1.28 : this.boostPow;
    if (this.drift) top *= 0.995 - 0.02 * Math.max(0, s) - (brake ? 0.08 : 0);
    if (this.ground) {
      if (gas && this.v >= 0) {
        if (this.v < top) this.v = Math.min(top, this.v + this.acc * Math.max(0.12, 1 - this.v / top) * (this.boosting ? 3 : 1) * dt);
        else this.v = damp(this.v, top, off ? 2.5 : 1.0, dt);
      } else if (brake && !this.drift) {
        if (this.v > 0.5) this.v = Math.max(0, this.v - 26 * dt);
        else this.v = Math.max(-8, this.v - 9 * dt);
      } else {
        this.v = damp(this.v, 0, this.boosting ? 0.05 : this.drift ? 0.25 : 0.45, dt);
        if (this.boosting) this.v = Math.min(top, this.v + this.acc * 2 * dt);
        if (Math.abs(this.v) < 0.3) this.v = 0;
      }
      if (this.v > top + 0.5) this.v = damp(this.v, top, off ? 2.5 : 0.9, dt);
    } else if (this.glide) {
      this.v = damp(this.v, Math.max(top * 0.95, 18), 0.4, dt);
    }
    if (spin) this.v = damp(this.v, 0, 2.4, dt);
    if (stalled) this.v = 0;
    // ---- drift button: press to hop (or to trick off a ramp), hold and steer to drift, let go for the boost
    const press = inp.drift && !this.prevDrift;
    this.prevDrift = inp.drift;
    if (press && this.ground && !spin && !stalled && this.v > 4) {
      this.vy = 3.6; this.ground = false; this.hopT = 0.3; this.wantDrift = true; this.events.push('hop');
    } else if (press && !this.ground && this.launchT > 0 && !this.trick) {
      this.trick = 1; this.trickT = 0; this.trickKind = Math.floor(Math.random() * 3); this.events.push('trick');
    }
    if (!inp.drift) { this.endDrift(true); this.wantDrift = false; }
    // landing from the hop (or any air) while holding drift and steering starts the slide
    if (inp.drift && this.wantDrift && !this.drift && this.ground && this.v > 8 && Math.abs(steer) > 0.2 && !spin) {
      this.drift = Math.sign(steer); this.driftT = 0; this.driftK = 0; this.charge = 0; this.lvPrev = 0;
      this.driftAngV = -this.drift * 3.2; // the tail kicks out (the nose swings into the bend)
      this.events.push('drift');
    }
    // no direction picked within a moment of landing: no drift this time (hop again), so holding the button down a
    // straight and then touching the steering doesn't throw you into a surprise slide
    if (this.wantDrift && this.ground && !this.drift) { this.wantT = (this.wantT || 0) + dt; if (this.wantT > 0.3) this.wantDrift = false; } else this.wantT = 0;
    if (this.drift && (this.v < 6 || spin)) this.endDrift(false);
    // ---- steering
    const sp = Math.abs(this.v), topN = Math.max(1, this.top0);
    const full = this.fullTurn(sp);
    let yawRate, angT = 0;
    if (this.drift) {
      this.driftT += dt; this.driftK = Math.min(1, this.driftK + dt / 0.25);
      const A = DRIFT_ARC, arc = s >= 0 ? A.hands + (A.into - A.hands) * s : A.hands + (A.hands - A.against) * s;
      const want = -this.drift * full * arc * (0.55 + 0.45 * this.driftK) * (brake ? A.brake : 1);
      // eases to the new arc (slowly tighter, quickly wider), so a tap of a key is a small correction, not a whip
      this.yawV = damp(this.yawV, want, Math.abs(want) > Math.abs(this.yawV) ? A.tighten : A.loosen, dt);
      yawRate = this.yawV;
      if (this.ground && (!off || this.boosting)) this.charge += dt * (0.72 + 0.62 * Math.max(0, s)) * this.turboK * (brake ? 0.85 : 1);
      const lv = this.driftLevel;
      if (lv > this.lvPrev) { this.lvPrev = lv; this.events.push('lv' + lv); }
      angT = -this.drift * (0.3 + 0.12 * s); // the body points into the bend, 10-24 degrees (more when you steer in)
    } else {
      // on the ground and in a hop: normal steering (gliding a bit less, other air a lot less)
      yawRate = -steer * full * Math.sign(this.v || 1) * (this.glide ? 0.75 : this.ground || this.hopT > 0 ? 1 : 0.7);
      this.yawV = yawRate;
    }
    if (spin) { yawRate = 0; this.yawV = 0; }
    this.yaw = wrapA(this.yaw + yawRate * dt);
    // the body's angle on a spring: swings out when the drift starts, settles, follows your steering
    this.driftAngV += ((angT - this.driftAng) * 90 - this.driftAngV * 15) * dt;
    this.driftAng += this.driftAngV * dt;
    this.steerVis = damp(this.steerVis, this.drift ? -this.drift * 0.6 + steer * 0.4 : steer, 12, dt);
    // ---- move (a drift slides you a little to the outside)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx;
    const slide = this.drift ? -this.drift * sp * 0.035 * this.driftK : 0;
    this.pos.x += (fx * this.v + rx * slide + this.push.x) * dt;
    this.pos.z += (fz * this.v + rz * slide + this.push.y) * dt;
    this.push.multiplyScalar(Math.exp(-5 * dt));
    L = this.locate();
    // ---- height: ramps launch you, the glider ramp opens the glider
    const groundY = t.solidAt(L) ? L.y + L.ramp : -1e3;
    if (this.launchT > 0) this.launchT -= dt;
    if (this.ground) {
      if (this.prevRamp > 0.4 && L.ramp < this.prevRamp - 0.02 && this.v > 6) { // just went over the lip
        let dk = t.w(L.k - (t.glide ? t.glide.ramp : 0)); if (dk > t.N / 2) dk -= t.N;
        const glider = t.glide && Math.abs(dk) < 4;
        this.ground = false;
        this.vy = glider ? 6 + this.v * 0.06 : 4.2 + this.v * 0.16;
        this.launchT = 0.5; this.trick = 0;
        if (glider) { this.glide = true; this.endDrift(true); this.events.push('glide'); } else this.events.push('jump');
      } else if (groundY < this.pos.y - 1.2) {
        this.ground = false; this.vy = 0; // drove off an edge
      } else this.pos.y = groundY;
    }
    this.prevRamp = this.ground ? L.ramp : 0;
    if (!this.ground) {
      // gliding: floats down slowly over the gap, then comes down quickly once there is road underneath
      if (this.glide) this.vy = L.gap ? Math.max(this.vy - 7 * dt, -3.2) : Math.max(this.vy - 16 * dt, -9);
      else this.vy -= GRAV * dt;
      this.pos.y += this.vy * dt;
      this.air += dt;
      if (this.trick) this.trickT += dt;
      if (this.pos.y <= groundY && this.vy <= 0) {
        this.pos.y = groundY; this.ground = true;
        if (this.trick) { this.boost(0.8 * this.turboK, 'trickboost'); this.trick = 0; }
        if (this.air > 0.35) this.events.push(this.glide ? 'glide-land' : 'land');
        this.landed = Math.min(1, -this.vy / (this.hopT > 0 ? 9 : 12));
        this.glide = false; this.air = 0; this.vy = 0;
        if (this.drift === 0 && inp.drift && this.air === 0) this.wantDrift = true; // holding drift as you land from a jump
      }
    }
    if (this.hopT > 0) this.hopT -= dt;
    // ---- walls
    const edge = t.wallAt(L) - 0.85;
    if (!L.gap && Math.abs(L.d) > edge && this.pos.y < groundY + 2.5) {
      const sg = Math.sign(L.d), over = Math.abs(L.d) - edge;
      const nx = -L.tz * sg, nz = L.tx * sg; // outward
      this.pos.x -= nx * over; this.pos.z -= nz * over;
      const into = (fx * nx + fz * nz) * Math.sign(this.v || 1);
      if (into > 0.02) {
        const hard = Math.abs(this.v) * into;
        this.v *= 1 - Math.min(0.7, into * 0.75);
        const tang = Math.atan2(L.tx, L.tz) + (Math.abs(wrapA(this.yaw - Math.atan2(L.tx, L.tz))) > Math.PI / 2 ? Math.PI : 0);
        this.yaw = wrapA(this.yaw + wrapA(tang - this.yaw) * Math.min(1, into * 1.4));
        this.push.x -= nx * Math.min(6, hard * 0.5); this.push.y -= nz * Math.min(6, hard * 0.5);
        if (hard > 5) { this.wallHit = hard; this.events.push('wall'); if (hard > 9) this.endDrift(false); }
      }
      L = this.locate();
    }
    // ---- dash pads
    for (const p of t.pads) {
      const dk = t.w(L.k - p.k + p.len / 2);
      if (dk <= p.len && Math.abs(L.d - p.d) < p.w / 2 + 0.6 && this.ground) { if (this.padT <= 0) this.boost(1.1, 'pad'); this.padT = 0.25; }
    }
    // ---- fell off (into the bay, the canyon, off the skyway)
    if (this.pos.y < L.cy - 7 || this.pos.y < -30) {
      this.respawnT = 1.6; this.events.push('fell');
      const lost = Math.min(this.coins, 3); this.coins -= lost;
      // over the glide gap you are put down on the far side; anywhere else back where you were safe
      if (t.glide && (L.gap || this.glide)) this.lastSafe = t.w(t.glide.land + 6);
      this.glide = false; this.drift = 0; this.charge = 0; this.boostT = 0; this.trail = null;
      return;
    }
    if (this.ground && !L.gap && Math.abs(L.d) < L.hw) this.lastSafe = t.w(L.k - 3);
    // ---- progress round the lap
    let ds = L.s - this.lastS;
    if (ds < -t.N / 2) ds += t.N; else if (ds > t.N / 2) ds -= t.N;
    this.total += ds; this.lastS = L.s;
    this.lap = Math.max(1, Math.floor(this.total / t.N) + 1);
    // ---- tilt with the road (or the jump); a drifting kart leans out of the turn
    const k = L.k, ahead = t.w(k + 2), back = t.w(k - 2);
    const slope = (t.Y[ahead] + t.RAMP[ahead] - t.Y[back] - t.RAMP[back]) / 4;
    const along = fx * L.tx + fz * L.tz;
    const tp = this.ground ? -Math.atan(slope) * along : Math.max(-0.5, Math.min(0.4, -Math.atan2(this.vy, Math.max(8, Math.abs(this.v))) * 0.6));
    const tr = this.ground ? -Math.atan(L.bank) * along : 0;
    this.pitch = damp(this.pitch, tp + (this.boosting && this.ground ? -0.035 : 0), this.ground ? 14 : 4, dt);
    this.roll = damp(this.roll, tr - (this.drift ? this.drift * (0.05 + 0.03 * Math.max(0, s)) : steer * 0.03 * Math.min(1, sp / topN)), 10, dt);
  }

  /** Put the model where the kart is. */
  sync(mesh, dt, time) {
    const u = mesh.userData;
    mesh.position.copy(this.pos);
    let spinA = 0, fx = 0, fy = 0, fz = 0;
    if (this.spinT > 0) { const k = 1 - this.spinT / this.spinMax; spinA = this.spinDir * (1 - Math.pow(1 - k, 2)) * Math.PI * 4; }
    if (this.trick && !this.ground) { // three tricks: a barrel roll, a front flip, a flat spin
      const a = (1 - Math.pow(1 - Math.min(1, this.trickT / 0.5), 2)) * Math.PI * 2, sg = this.id % 2 ? 1 : -1;
      if (this.trickKind === 0) fz = a * sg; else if (this.trickKind === 1) fx = -a; else fy = a * sg;
    }
    if (this.stallT > 0) fy += Math.sin(time * 40) * 0.03; // burnout shudder
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(this.pitch + fx, this.yaw + this.driftAng + spinA + fy, this.roll + fz);
    // a little squash when landing
    if (this.landed > 0) this.landed = Math.max(0, this.landed - dt * 4);
    u.body.scale.set(1 + this.landed * 0.08, 1 - this.landed * 0.14, 1);
    u.spin(dt, this.stallT > 0 ? 30 : this.v, -this.steerVis); // the model's +x is the kart's left
    // glider opens with a little overshoot
    const g = u.glider, want = this.glide ? 1 : 0;
    g.userData.k = damp(g.userData.k || 0, want, this.glide ? 7 : 10, dt);
    const gk = g.userData.k;
    g.visible = gk > 0.02;
    g.scale.setScalar(Math.max(0.001, gk * (1 + Math.sin(Math.min(1, gk) * Math.PI) * 0.12)));
    g.rotation.x = this.glide ? Math.sin(time * 3) * 0.04 - 0.08 : 0;
    g.rotation.z = this.glide ? -this.steerVis * 0.25 : 0;
    // shadow on the road
    if (u.shadow) {
      const L = this.loc;
      const gy = this.track.solidAt(L) ? L.y + L.ramp : null;
      u.shadow.visible = gy != null && this.respawnT <= 0;
      if (gy != null) {
        const h = Math.max(0, this.pos.y - gy);
        u.shadow.position.set(this.pos.x, gy + 0.04, this.pos.z);
        // the road's own lean (not the kart's tricks or nose-up in the air)
        const t = this.track, along = Math.sin(this.yaw) * L.tx + Math.cos(this.yaw) * L.tz, ah = t.w(L.k + 2), bk = t.w(L.k - 2);
        const slope = (t.Y[ah] + t.RAMP[ah] - t.Y[bk] - t.RAMP[bk]) / 4;
        u.shadow.rotation.set(-Math.atan(slope) * along, this.yaw + this.driftAng, -Math.atan(L.bank) * along);
        u.shadow.material.opacity = 0.85 * Math.max(0.15, 1 - h / 8);
        u.shadow.scale.setScalar(1 + h * 0.06);
      }
    }
    mesh.visible = !(this.respawnT > 1.2) && !(this.safeT > 0 && Math.floor(time * 14) % 2);
  }
}
