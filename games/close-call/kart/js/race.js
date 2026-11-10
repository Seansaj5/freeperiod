// One race: the grid, the countdown (with the start boost), every kart's driving, items, bumping, laps, places,
// the finish, and the sparks / flames / dust. The page (main.js) does the camera, HUD, sound and menus and
// hears about things through `on` callbacks.
import * as THREE from 'three';
import { Kart, CLASSES } from './kart.js';
import { buildKart, BODIES, WHEELS, GLIDERS, PAINTS } from './parts.js';
import { Items, rollItem } from './items.js';
import { drive, newBrain } from './ai.js';
import { Puffs } from '../../js/wreck.js';

export const PAINT_NAMES = ['Red', 'Orange', 'Yellow', 'Lime', 'Green', 'Teal', 'Sky', 'Blue', 'White', 'Black', 'Gold'];
const SPARK = [[1.6, 1.5, 1.3], [0.35, 0.85, 2.6], [2.6, 1.0, 0.22], [2.6, 2.2, 0.8]];
const COUNT = 3; // seconds of countdown

let shadowTex = null;
function blob() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.6, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

/** Seven rival karts: random parts, colours that differ from yours. */
export function rivalBuilds(playerPaint, n = 7) {
  const paints = PAINTS.map((c, i) => i).filter((i) => PAINTS[i] !== playerPaint).sort(() => Math.random() - 0.5);
  const pick = (a) => a[Math.floor(Math.random() * a.length)].id;
  return Array.from({ length: n }, (_, i) => {
    const pi = paints[i % paints.length], body = pick(BODIES);
    return { body, wheels: pick(WHEELS), glider: pick(GLIDERS), paint: PAINTS[pi], label: `${PAINT_NAMES[pi]} ${BODIES.find((x) => x.id === body).name}` };
  });
}

export class Race {
  /**
   * o: { scene, track, env, hi, cls, mode ('gp' | 'vs' | 'tt'), player: build, rivals: [build], grid: [index order, front first] , on }
   */
  constructor(o) {
    this.scene = o.scene; this.track = o.track; this.env = o.env; this.hi = o.hi;
    this.cls = CLASSES[o.cls] || CLASSES.pro; this.clsId = o.cls; this.mode = o.mode; this.on = o.on || {};
    this.items = new Items(this.scene, this.track, this.env);
    this.sparks = new Puffs(this.scene, o.hi ? 520 : 300, true);
    this.dust = new Puffs(this.scene, o.hi ? 260 : 150, false);
    this.karts = []; this.meshes = [];
    const builds = [{ ...o.player, label: 'You', me: true }, ...(o.mode === 'tt' ? [] : o.rivals)];
    builds.forEach((b, i) => {
      const k = new Kart(this.track, b, o.cls, i);
      k.label = b.label; k.me = !!b.me; k.paint = b.paint;
      if (!k.me) k.brain = newBrain(i, this.cls);
      const m = buildKart(b, this.env, this.hi, blob());
      this.scene.add(m); if (m.userData.shadow) this.scene.add(m.userData.shadow);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(1.45, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 2.0), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      sh.position.y = 0.6; sh.visible = false; m.add(sh); m.userData.shieldMesh = sh;
      this.karts.push(k); this.meshes.push(m);
    });
    this.player = this.karts[0];
    // the grid, two by two behind the line; `grid` lists kart indexes front first
    const order = o.grid && o.grid.length === this.karts.length ? o.grid : this.karts.map((_, i) => i).reverse();
    const N = this.track.N;
    order.forEach((ki, j) => {
      const back = 7 + j * 4.2, k = this.track.w(Math.round(-back)), d = (j % 2 ? 1 : -1) * this.track.W[k] * 0.38;
      this.karts[ki].reset(k, d, -back);
    });
    void N;
    this.state = 'intro'; this.t = 0; this.countT = 0; this.gasAt = -1; this.finishOrder = [];
    this.placeList = [...this.karts];
    this.updatePlaces();
    for (let i = 0; i < this.karts.length; i++) this.karts[i].sync(this.meshes[i], 0, 0);
  }

  startCountdown() { this.state = 'count'; this.countT = 0; this.gasAt = -1; this.track.setLights(1); if (this.on.count) this.on.count(3); }

  updatePlaces() {
    const L = this.track.N * this.track.laps;
    this.placeList.sort((a, b) => {
      if (a.finished && b.finished) return a.finishT - b.finishT;
      if (a.finished) return -1; if (b.finished) return 1;
      return Math.min(L, b.total) - Math.min(L, a.total);
    });
    this.placeList.forEach((k, i) => { k.place = i + 1; });
  }

  useItem(k) {
    const it = k.item;
    if (!it || it === 'roll') return;
    const done = () => { k.item = null; k.itemN = 0; };
    switch (it) {
      case 'nitro': k.boost(1.35, 'nitro'); done(); break;
      case 'nitro3': k.boost(1.35, 'nitro'); if (--k.itemN <= 0) done(); break;
      case 'oil': this.items.dropOil(k); done(); break;
      case 'ball': this.items.fireBall(k); done(); break;
      case 'rocket': this.items.fireRocket(k, this.karts.find((o) => o.place === k.place - 1) || null); done(); break;
      case 'shield': k.shieldT = 12; done(); break;
      case 'coins': k.coins = Math.min(10, k.coins + 3); k.got += 3; done(); break;
      case 'overdrive': k.starT = 6; k.boost(6, 'star'); done(); break;
    }
    if (this.on.used) this.on.used(k, it);
  }

  /** input: the player's { gas, brake, steer, drift, item }. */
  update(dt, input, time) {
    const T = this.track;
    this.items.update(dt, time);
    T.update(time);
    if (this.state === 'intro') { this.syncAll(dt, time); return; }
    if (this.state === 'count') {
      const before = Math.floor(this.countT);
      this.countT += dt;
      if (input.gas && this.gasAt < 0) this.gasAt = this.countT;
      if (!input.gas) this.gasAt = -1;
      const now = Math.floor(this.countT);
      if (now !== before && now < COUNT) { T.setLights(now + 1); if (this.on.count) this.on.count(COUNT - now); }
      if (this.countT >= COUNT) {
        this.state = 'race'; this.t = 0; T.setLights(4);
        // start boost: hit the gas as the second light comes on (not before)
        const p = this.player;
        if (this.gasAt >= 1.45 && this.gasAt <= 2.4) { p.boost(1.4, 'startboost'); p.v = p.top0 * 0.5; }
        else if (this.gasAt >= 0 && this.gasAt < 1.1) { p.spinT = p.spinMax = 0.8; p.events.push('stall'); }
        for (const k of this.karts) if (k !== p && Math.random() < 0.55) { k.boost(1.2); k.v = k.top0 * 0.4; }
        if (this.on.go) this.on.go();
      }
      this.syncAll(dt, time);
      return;
    }
    this.t += dt;
    // input
    for (const k of this.karts) {
      if (k.me && !k.finished && !this.autoplay) {
        Object.assign(k.input, input);
        if (input.itemPress) this.useItem(k);
      } else {
        if (!k.brain) k.brain = newBrain(0, this.cls);
        drive(k, this, dt, time);
        if (k.input.item) this.useItem(k);
      }
      k.step(dt);
    }
    // bumping into each other
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      if (a.respawnT > 0 || b.respawnT > 0) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y, d2 = dx * dx + dz * dz;
      if (d2 > 3.1 || d2 < 1e-6 || Math.abs(dy) > 1.3) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, over = 1.76 - d;
      const wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
      a.pos.x -= nx * over * wa; a.pos.z -= nz * over * wa; b.pos.x += nx * over * wb; b.pos.z += nz * over * wb;
      const rel = Math.abs((Math.sin(a.yaw) * a.v - Math.sin(b.yaw) * b.v) * nx + (Math.cos(a.yaw) * a.v - Math.cos(b.yaw) * b.v) * nz);
      const kick = Math.min(7, 2 + rel * 0.5);
      a.push.x -= nx * kick * wa; a.push.y -= nz * kick * wa; b.push.x += nx * kick * wb; b.push.y += nz * kick * wb;
      if (a.starT > 0 && b.starT <= 0) b.hit('spin'); else if (b.starT > 0 && a.starT <= 0) a.hit('spin');
      else if (rel > 3 && this.on.bump && (a.me || b.me)) this.on.bump(rel);
    }
    // pickups, item roulette, laps, the finish
    const N = T.N * T.laps;
    for (const k of this.karts) {
      if (k.respawnT <= 0) {
        const got = this.items.pickups(k);
        if (got.coins) { k.coins = Math.min(10, k.coins + got.coins); k.got += got.coins; if (k.me && this.on.coin) this.on.coin(got.coins); }
        if (got.box && this.mode !== 'tt') {
          this.burst(got.box.x, got.box.y, got.box.z, [0.5, 1.6, 2.4], 18, 7);
          if (!k.item) { k.item = 'roll'; k.rollT = k.me ? 1.35 : 0.9; if (k.me && this.on.box) this.on.box(); }
        }
      }
      if (k.item === 'roll') {
        k.rollT -= dt;
        if (k.rollT <= 0) { k.item = rollItem(k.place, this.karts.length); k.itemN = k.item === 'nitro3' ? 3 : 1; if (k.me && this.on.gotItem) this.on.gotItem(k.item); }
      }
      if (k.lap > k.lapMax && k.lap <= T.laps) { k.lapMax = k.lap; if (k.me && this.on.lap) this.on.lap(k.lap); }
      if (!k.finished && k.total >= N) {
        k.finished = true; k.finishT = this.t; this.finishOrder.push(k);
        if (k.me) { k.brain = newBrain(0, this.cls); if (this.on.finish) this.on.finish(); }
      }
    }
    this.items.updateShots(dt, this.karts, (k, s) => {
      const hit = k.hit(s.kind === 'rocket' ? 'launch' : 'spin');
      this.burst(k.pos.x, k.pos.y + 0.8, k.pos.z, s.kind === 'oil' ? [0.6, 0.6, 0.7] : [2.4, 1.6, 0.4], 22, 8);
      if (this.on.hit) this.on.hit(k, s, hit);
    }, time);
    this.updatePlaces();
    // events, effects, models
    for (const k of this.karts) {
      for (const e of k.events) if (this.on.event) this.on.event(k, e);
      k.events.length = 0;
    }
    this.syncAll(dt, time);
  }

  /** Little bright bits flying out (item crystal smashed, a hit). */
  burst(x, y, z, c, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = sp * (0.5 + Math.random() * 0.6), r = Math.sqrt(1 - u * u);
      this.sparks.emit(x, y, z, Math.cos(a) * r * s, u * s + 2, Math.sin(a) * r * s, 0.5 + Math.random() * 0.4, 0.35, 0.1, c, [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], 1, -6);
    }
  }

  syncAll(dt, time) {
    const V = new THREE.Vector3();
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i], m = this.meshes[i], u = m.userData;
      k.sync(m, dt, time);
      u.shieldMesh.visible = k.shieldT > 0;
      if (k.shieldT > 0) u.shieldMesh.scale.setScalar(1 + Math.sin(time * 8) * 0.04);
      if (k.starT > 0) { const h = (time * 3) % 3; u.glow(h < 1 ? 0.9 : 0.1, h >= 1 && h < 2 ? 0.8 : 0.3, h >= 2 ? 1.0 : 0.2); }
      else if (k.respawnT > 0) u.glow(0.2, 0.6, 0.9);
      else u.glow(0, 0, 0);
      if (dt <= 0 || this.state === 'intro') continue;
      const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
      // drift sparks from the back wheels
      if (k.drift && k.ground) {
        const lv = k.driftLevel, c = SPARK[lv], n = lv ? 3 : 1;
        for (const w of u.wheels) {
          if (w.front) continue;
          w.pivot.getWorldPosition(V); V.y -= w.r * 0.8;
          for (let j = 0; j < n; j++) {
            const sp = 2 + Math.random() * 4;
            this.sparks.emit(V.x, V.y, V.z, -fx * sp + (Math.random() - 0.5) * 3, 1 + Math.random() * 3.5, -fz * sp + (Math.random() - 0.5) * 3, 0.18 + Math.random() * 0.2, lv ? 0.22 : 0.14, 0.05, c, c, lv ? 1 : 0.5, -14);
          }
        }
      }
      // boost flames out of the pipes
      if (k.boosting && k.respawnT <= 0) {
        for (const p of u.pipes) {
          V.copy(p).applyMatrix4(m.matrixWorld);
          const star = k.starT > 0;
          this.sparks.emit(V.x, V.y, V.z, -fx * (6 + Math.random() * 4), 0.6, -fz * (6 + Math.random() * 4), 0.2, 0.5, 0.15, star ? [0.6, 2.2, 2.6] : [2.6, 1.4, 0.35], star ? [2.6, 2.2, 0.4] : [2.2, 0.35, 0.05], 1, 0);
        }
      }
      // dust offroad, a puff on landing
      if (k.offroad && Math.abs(k.v) > 6 && Math.random() < 0.6) {
        const c = this.track.theme.shoulder[0];
        const col = new THREE.Color(c);
        this.dust.emit(k.pos.x - fx * 1.2, k.pos.y + 0.3, k.pos.z - fz * 1.2, -fx * 2 + (Math.random() - 0.5) * 2, 1, -fz * 2 + (Math.random() - 0.5) * 2, 0.8, 0.6, 2.2, [col.r, col.g, col.b], [col.r * 0.8, col.g * 0.8, col.b * 0.8], 0.5, 0.5);
      }
    }
  }

  /** Every kart's result; ones still racing get an estimated time from how far they have left. */
  results() {
    const N = this.track.N * this.track.laps;
    return this.placeList.map((k) => {
      const left = Math.max(0, N - k.total), avg = Math.max(10, k.top0 * 0.86);
      return { k, label: k.label, me: k.me, time: k.finished ? k.finishT : this.t + left / avg, done: k.finished, coins: k.got };
    }).sort((a, b) => a.time - b.time);
  }

  dispose() {
    for (const m of this.meshes) { m.removeFromParent(); if (m.userData.shadow) m.userData.shadow.removeFromParent(); m.userData.shieldMesh.geometry.dispose(); m.userData.shieldMesh.material.dispose(); m.userData.dispose(); }
    this.items.dispose();
    for (const p of [this.sparks, this.dust]) { p.obj.removeFromParent(); p.obj.geometry.dispose(); p.mat.dispose(); }
  }
}
