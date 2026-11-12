// Bots: they pick a drop spot, loot, rotate with the storm, fight, build walls when shot at, heal and harvest.
import { stepBody, newBody } from './move.js';
import { rng, clamp, angWrap } from './util.js';
import { heightAt } from './map.js';
import { WEAPONS, HEALS, BUILD, BODY } from './rules.js';
import { isGun, ammoFor } from './items.js';
import { targetFor, offsetFor } from './build.js';

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

export class Bot {
  constructor(match, p, R) {
    this.m = match; this.p = p;
    this.R = rng(Math.floor(R() * 1e9));
    this.skill = 0.35 + this.R() * 0.6;
    const pois = match.map.pois;
    const poi = pois[Math.floor(this.R() * pois.length)];
    const a = this.R() * 6.28, r = this.R() * poi.r * 0.6;
    this.drop = { x: poi.x + Math.cos(a) * r, z: poi.z + Math.sin(a) * r };
    this.lastDropD = Infinity;
    this.inp = { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, ads: false };
    this.t = 0; this.think = this.R() * 0.3; this.scanT = 0;
    this.enemy = null; this.seenAt = -99; this.firstSeen = 0;
    this.goal = null; this.goalLoot = 0; this.goalT = 0; this.black = new Set();
    this.stuck = { x: 0, z: 0, t: 0, n: 0, detour: 0, dyaw: 0 };
    this.strafe = 1; this.strafeT = 0; this.buildCd = 0; this.hurtBy = 0; this.hurtT = -99;
    this.aimErr = [0, 0]; this.aimT = 0;
  }

  hurt(by) { if (by && by !== this.p.id) { this.hurtBy = by; this.hurtT = this.m.now; } }

  update(dt) {
    const m = this.m, p = this.p;
    this.t += dt;
    if (p.mode === 'blimp') {
      if (m.phase !== 'blimp') return;
      const bp = m.blimpPos();
      const d = Math.hypot(bp.x - this.drop.x, bp.z - this.drop.z);
      if ((d > this.lastDropD + 0.01 && d < 400) || (d < 60)) m.jump(p.id);
      this.lastDropD = d;
      return;
    }
    if (!p.body) p.body = newBody(p.x, p.y, p.z, p.mode === 'ground' ? 'ground' : p.mode);
    const b = p.body;
    const inp = this.inp;
    inp.jump = false;
    if (b.mode === 'sky' || b.mode === 'glide') {
      const dx = this.drop.x - b.x, dz = this.drop.z - b.z, d = Math.hypot(dx, dz);
      inp.yaw = yawTo(dx, dz);
      inp.mz = d > 4 ? -1 : 0; inp.mx = 0;
      inp.pitch = d < (b.y - heightAt(b.x, b.z)) * 0.9 ? -1 : 0;
    } else {
      this.think -= dt;
      if (this.think <= 0) { this.think = 0.25; this.decide(); }
      this.act(dt);
    }
    stepBody(m.world, b, inp, dt);
    if (b.landed) m.fallDamage(p, b.landed);
    p.x = b.x; p.y = b.y; p.z = b.z; p.mode = b.mode; p.crouch = b.crouch;
    p.ry = inp.yaw; p.pitch = inp.pitch;
  }

  // ---- choosing what to do ----
  bestGun(dist) {
    const p = this.p;
    let best = -1, score = -1;
    p.inv.forEach((it, i) => {
      if (!it || !isGun(it.k)) return;
      const W = WEAPONS[it.k];
      if (it.mag <= 0 && p.ammo[W.ammo] <= 0) return;
      let s = it.r * 0.3;
      if (W.pellets > 1) s += dist < 12 ? 6 : dist < 25 ? 1 : -2;
      else if (it.k === 'sniper') s += dist > 60 ? 5 : -1;
      else if (it.k === 'rocket') s += dist > 10 && dist < 60 ? 2.5 : -3;
      else if (it.k === 'ar') s += dist > 12 ? 4 : 2;
      else if (it.k === 'smg') s += dist < 25 ? 4 : 1;
      else s += 1.5;
      if (it.mag <= 0) s -= 2;
      if (s > score) { score = s; best = i + 1; }
    });
    return best;
  }

  decide() {
    const m = this.m, p = this.p;
    // look for someone to fight
    this.scanT -= 0.25;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      let best = null, bd = 85;
      const ex = p.x, ey = p.y + BODY.EYE, ez = p.z;
      const recent = m.now - this.hurtT < 3 ? m.players.get(this.hurtBy) : null;
      for (const q of m.players.values()) {
        if (q === p || !q.alive || q.mode === 'blimp') continue;
        const d = Math.hypot(q.x - ex, q.z - ez);
        if (d > bd && q !== recent) continue;
        if (!m.world.clear(ex, ey, ez, q.x, q.y + 1.3, q.z)) continue;
        if (q === recent) { best = q; break; }
        bd = d; best = q;
      }
      if (best) { if (!this.enemy || this.enemy !== best) this.firstSeen = m.now; this.enemy = best; this.seenAt = m.now; }
      else if (this.enemy && m.now - this.seenAt > 4) this.enemy = null;
    }
    if (this.enemy && !this.enemy.alive) this.enemy = null;

    const gun = this.bestGun(this.enemy ? Math.hypot(this.enemy.x - p.x, this.enemy.z - p.z) : 30);
    this.mode = 'move';
    const s = m.storm;
    const outNow = Math.hypot(p.x - s.x, p.z - s.z) > s.r - 6;
    const nx = s.next ? s.next.x : s.x, nz = s.next ? s.next.z : s.z, nr = s.next ? s.next.r : s.r;
    const outNext = Math.hypot(p.x - nx, p.z - nz) > nr * 0.85;
    const need = (Math.hypot(p.x - nx, p.z - nz) - nr * 0.8) / 6.5;   // seconds to walk in
    const urgent = outNow || (outNext && (s.state === 'shrink' || m.stormLeft() < need + 15));

    if (this.enemy && gun > 0 && !urgent) { this.mode = 'fight'; this.goal = null; return; }
    if (this.enemy && gun < 0 && Math.hypot(this.enemy.x - p.x, this.enemy.z - p.z) < 4 && !urgent && m.now - this.hurtT < 2 && this.hurtBy === this.enemy.id) { this.mode = 'melee'; return; }
    if (urgent) { this.setGoal(nx + (this.R() - 0.5) * nr * 0.5, nz + (this.R() - 0.5) * nr * 0.5, 0); return; }
    // heal up when it's quiet
    if (m.now - this.seenAt > 3 && m.now - this.hurtT > 3 && !p.heal) {
      const slot = p.inv.findIndex((it) => it && HEALS[it.k] && ((HEALS[it.k].hp && p.hp < 75) || (HEALS[it.k].sh && p.sh < 50)));
      if (slot >= 0) { this.mode = 'heal'; if (p.slot !== slot + 1) m.action(p.id, { k: 'slot', s: slot + 1 }); m.action(p.id, { k: 'heal', s: slot + 1 }); return; }
    }
    if (p.heal) { this.mode = 'heal'; return; }
    if (gun > 0 && p.mats[0] < 40 && !this.enemy) {
      let best = null, bd = 22;
      m.map.each(p.x - 22, p.z - 22, p.x + 22, p.z + 22, (k, it) => {
        if (k !== 'p' || (it.kind !== 'tree' && it.kind !== 'pine') || m.world.gone.has(it.id)) return;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        if (d < bd) { bd = d; best = it; }
      });
      if (best) { this.mode = 'harvest'; this.tree = best; this.harvestT = m.now + 6; return; }
    }
    // loot
    const needLoot = p.inv.filter(Boolean).length < 5 || gun < 0;
    if (gun > 0 && p.mats[0] < 50 && (this.harvestT || 0) > m.now) { this.mode = 'harvest'; return; }
    if (needLoot && (!this.goal || !this.goalLoot || !m.loot.has(this.goalLoot))) {
      let best = null, bd = gun < 0 ? 140 : 70;
      for (const l of m.loot.values()) {
        if (this.black.has(l.id)) continue;
        const d = Math.hypot(l.x - p.x, l.z - p.z);
        if (d > bd) continue;
        if (l.y - heightAt(l.x, l.z) > 3.2) continue;       // upstairs / up high
        if (l.t === 'item' && !this.wants(l.it)) continue;
        const w = l.t === 'chest' ? d * 0.6 : l.t === 'item' ? d : d * 1.5;
        if (w < bd) { bd = w; best = l; }
      }
      if (best) { this.setGoal(best.x, best.z, best.id); return; }
    }
    if (this.goal && this.goalLoot && m.loot.has(this.goalLoot)) return;
    // harvest a tree if low on materials
    if (p.mats[0] < 120 && gun > 0 && (p.inv.filter(Boolean).length >= 3 || p.mats[0] < 30)) {
      let best = null, bd = 30;
      m.map.each(p.x - 30, p.z - 30, p.x + 30, p.z + 30, (k, it) => {
        if (k !== 'p' || (it.kind !== 'tree' && it.kind !== 'pine') || m.world.gone.has(it.id)) return;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        if (d < bd) { bd = d; best = it; }
      });
      if (best) { this.mode = 'harvest'; this.tree = best; this.harvestT = m.now + 6; return; }
    }
    // wander toward the next safe zone
    if (!this.goal || Math.hypot(this.goal.x - p.x, this.goal.z - p.z) < 4 || m.now - this.goalT > 25) {
      const a = this.R() * 6.28, r = this.R() * nr * 0.6;
      this.setGoal(nx + Math.cos(a) * r, nz + Math.sin(a) * r, 0);
    }
  }

  wants(it) {
    const p = this.p;
    if (HEALS[it.k]) return p.inv.filter((s) => s && HEALS[s.k]).length < 2 || p.inv.some((s) => s && s.k === it.k);
    if (WEAPONS[it.k] && WEAPONS[it.k].consumable) return !p.inv.some((s) => s && s.k === it.k) && p.inv.filter(Boolean).length < 5;
    const same = p.inv.find((s) => s && s.k === it.k);
    if (same) return it.r > same.r;
    return p.inv.filter(Boolean).length < 5;
  }

  setGoal(x, z, lootId) {
    this.goal = { x, z }; this.goalLoot = lootId; this.goalT = this.m.now;
    // a goal inside a house: go through its front door
    this.via = null;
    for (const d of this.m.map.doors) {
      if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1) { this.via = d; break; }
    }
  }

  // ---- doing it ----
  act(dt) {
    const m = this.m, p = this.p, b = p.body, inp = this.inp;
    inp.mx = 0; inp.mz = 0; inp.sprint = false; inp.ads = false; inp.crouch = false;
    this.buildCd -= dt;
    if (this.mode === 'fight' && this.enemy) return this.fight(dt);
    if (this.mode === 'melee' && this.enemy) {
      const e = this.enemy;
      inp.yaw = yawTo(e.x - b.x, e.z - b.z); inp.mz = -1;
      if (p.slot !== 0) m.action(p.id, { k: 'slot', s: 0 });
      if (Math.hypot(e.x - b.x, e.z - b.z) < 2.6) m.action(p.id, { k: 'axe', t: 'p', id: e.id });
      return;
    }
    if (this.mode === 'heal') return;
    if (this.mode === 'harvest' && this.tree) {
      const t = this.tree;
      if (m.world.gone.has(t.id)) { this.tree = null; return; }
      const d = Math.hypot(t.x - b.x, t.z - b.z);
      inp.yaw = yawTo(t.x - b.x, t.z - b.z);
      if (d > 2.0) { this.walk(t.x, t.z, dt); return; }
      if (p.slot !== 0) m.action(p.id, { k: 'slot', s: 0 });
      m.action(p.id, { k: 'axe', t: 'r', id: t.id });
      return;
    }
    if (!this.goal) return;
    let tx = this.goal.x, tz = this.goal.z;
    // inside a building and the goal is outside it: out through the door first
    const home = this.insideOf(b.x, b.z);
    if (home && !(tx > home.x0 && tx < home.x1 && tz > home.z0 && tz < home.z1)) {
      const dx = home.ix - home.x, dz = home.iz - home.z, dl = Math.hypot(dx, dz) || 1;
      const inX = home.x + (dx / dl) * 2.2, inZ = home.z + (dz / dl) * 2.2;
      if (Math.hypot(inX - b.x, inZ - b.z) > 1.0 && !this.leaving) { tx = inX; tz = inZ; }
      else { this.leaving = true; tx = home.x - (dx / dl) * 2; tz = home.z - (dz / dl) * 2; }
      this.walk(tx, tz, dt, false);
      return;
    }
    this.leaving = false;
    if (this.via) {
      const d = this.via;
      const inside = b.x > d.x0 + 0.2 && b.x < d.x1 - 0.2 && b.z > d.z0 + 0.2 && b.z < d.z1 - 0.2;
      if (!inside) { tx = d.x; tz = d.z; if (Math.hypot(d.x - b.x, d.z - b.z) < 1.0) { tx = d.ix; tz = d.iz; } }
    }
    const dist = Math.hypot(this.goal.x - b.x, this.goal.z - b.z);
    if (this.goalLoot) {
      const l = m.loot.get(this.goalLoot);
      if (!l) { this.goal = null; return; }
      if (dist < 1.8 && Math.abs(l.y - b.y) < 2.5) {
        if (l.t === 'chest' || l.t === 'abox') m.action(p.id, { k: 'open', id: l.id });
        else m.action(p.id, { k: 'pick', id: l.id });
        if (m.loot.has(l.id)) this.black.add(l.id);
        this.goal = null;
        const g = this.bestGun(30); if (g > 0 && p.slot !== g) m.action(p.id, { k: 'slot', s: g });
        return;
      }
      if (m.now - this.goalT > 20) { this.black.add(l.id); this.goal = null; return; }
    }
    this.walk(tx, tz, dt, dist > 25);
  }

  /** Is the way ahead along yaw clear for a few metres (low steps are fine)? */
  clearAhead(yaw, dist) {
    const b = this.p.body, w = this.m.world, r = BODY.R;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (let s = 1.2; s <= dist; s += 1.2) {
      const x = b.x + fx * s, z = b.z + fz * s;
      const top = w.hit(x - r, b.y + 0.04, z - r, x + r, b.y + 1.7, z + r);
      if (top !== null && top - b.y > BODY.STEP + 0.6) return false;
    }
    return true;
  }

  insideOf(x, z) {
    for (const d of this.m.map.doors) if (x > d.x0 + 0.3 && x < d.x1 - 0.3 && z > d.z0 + 0.3 && z < d.z1 - 0.3) return d;
    return null;
  }

  walk(tx, tz, dt, sprint = true) {
    const b = this.p.body, inp = this.inp, st = this.stuck;
    let yaw = yawTo(tx - b.x, tz - b.z);
    // steer around walls: try the straight line, then wider and wider angles
    this.steerT = (this.steerT || 0) - dt;
    if (this.steerT <= 0) {
      this.steerT = 0.2;
      const far = Math.min(5, Math.hypot(tx - b.x, tz - b.z));
      this.steer = 0;
      if (far > 1.2 && !this.clearAhead(yaw, far)) {
        const side = this.prefSide || (this.R() < 0.5 ? 1 : -1);
        for (const a of [0.45, 0.9, 1.35, 1.8, 2.3, 2.8]) {
          if (this.clearAhead(yaw + a * side, 3.6)) { this.steer = a * side; this.prefSide = side; break; }
          if (this.clearAhead(yaw - a * side, 3.6)) { this.steer = -a * side; this.prefSide = -side; break; }
        }
      } else this.prefSide = 0;
    }
    yaw += this.steer || 0;
    if (st.detour > 0) { st.detour -= dt; yaw += st.dyaw; }
    inp.yaw = yaw; inp.pitch = 0; inp.mz = -1; inp.sprint = sprint;
    st.t += dt;
    if (st.t > 0.8) {
      const moved = Math.hypot(b.x - st.x, b.z - st.z);
      if (moved < 1.2) {
        st.n++;
        inp.jump = true;
        if (st.n >= 2) { st.detour = 1.1; st.dyaw = (this.R() < 0.5 ? 1 : -1) * (1.0 + this.R() * 0.8); }
        if (st.n >= 6 && this.goalLoot) { this.black.add(this.goalLoot); this.goal = null; st.n = 0; }
        if (st.n >= 9) { this.goal = null; st.n = 0; }
      } else st.n = Math.max(0, st.n - 1);
      st.x = b.x; st.z = b.z; st.t = 0;
    }
  }

  fight(dt) {
    const m = this.m, p = this.p, b = p.body, inp = this.inp, e = this.enemy;
    const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
    const slot = this.bestGun(d);
    if (slot < 0) { this.enemy = null; return; }
    if (p.slot !== slot) m.action(p.id, { k: 'slot', s: slot });
    const it = p.inv[slot - 1], W = WEAPONS[it.k];
    // aim with some wobble that settles
    this.aimT -= dt;
    if (this.aimT <= 0) {
      this.aimT = 0.35 + this.R() * 0.4;
      const err = (0.012 + (1 - this.skill) * 0.05) * (1 + d / 60) * (Math.hypot(e.body ? e.body.vx : 0, e.body ? e.body.vz : 0) > 3 ? 1.4 : 1);
      this.aimErr = [(this.R() - 0.5) * 2 * err, (this.R() - 0.5) * 2 * err];
    }
    const ey = e.y + (e.crouch ? 0.9 : 1.25), oy = b.y + BODY.EYE;
    inp.yaw = yawTo(dx, dz) + this.aimErr[0];
    inp.pitch = Math.atan2(ey - oy, d) + this.aimErr[1];
    // movement: shotguns close in, others keep a distance and strafe
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 0.6 + this.R() * 1.3; this.strafe = this.R() < 0.5 ? -1 : 1; if (this.R() < 0.2) inp.jump = true; }
    inp.mx = this.strafe;
    const want = W.pellets > 1 ? 5 : it.k === 'sniper' ? 60 : 22;
    inp.mz = d > want + 4 ? -1 : d < want - 6 ? 1 : 0;
    inp.ads = it.k !== 'pump' && it.k !== 'tac' && d > 15;
    // got shot: throw up a wall (and sometimes a ramp)
    if (m.now - this.hurtT < 0.6 && this.buildCd <= 0 && p.mats.some((n) => n >= BUILD.COST) && this.R() < 0.5 + this.skill * 0.3) {
      this.buildCd = 2.5 + this.R() * 2;
      const mat = p.mats[0] >= BUILD.COST ? 0 : p.mats[1] >= BUILD.COST ? 1 : 2;
      const yaw = yawTo(dx, dz);
      const off = offsetFor(b.y);
      const w = targetFor('wall', b.x, b.y, b.z, yaw, 0, off);
      m.action(p.id, { ...w, lv: w.k, k: 'build', m: mat });
      if (this.R() < 0.35 && p.mats[mat] >= BUILD.COST) { const r = targetFor('ramp', b.x, b.y, b.z, yaw, 0, off); m.action(p.id, { ...r, lv: r.k, k: 'build', m: mat }); }
    }
    // shoot
    if (m.now - this.firstSeen < 0.35 + (1 - this.skill) * 0.5) return;
    if (it.mag <= 0) { if (!p.reload) m.action(p.id, { k: 'reload', s: slot }); return; }
    if (m.now < p.nextFire) return;
    if (d > (W.range || 100)) return;
    const o = [b.x, oy, b.z];
    const dirs = [];
    const sp = W.spread[inp.ads ? 1 : 0] * (b.onGround ? 1 : 1.6);
    const n = Math.max(1, W.pellets);
    for (let i = 0; i < n; i++) {
      const yaw = inp.yaw + (this.R() - 0.5) * 2 * sp, pitch = inp.pitch + (this.R() - 0.5) * 2 * sp;
      dirs.push([-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]);
    }
    if (it.k === 'rocket') m.fire(p, { s: slot, o, d: dirs[0] });
    else m.botFire(p, slot, o, dirs);
  }
}
