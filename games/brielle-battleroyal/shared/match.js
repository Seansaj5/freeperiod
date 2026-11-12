// One match of Brielle Battleroyal: the blimp, the Nor'easter, loot, fights, building and bots.
// The browser runs it for solo games; the server runs the very same code for online games.
import { World } from './world.js';
import { heightAt, waterDist } from './map.js';
import { newBody, stepBody } from './move.js';
import { rng, clamp, lerp } from './util.js';
import { MATCH, MAP, BODY, HP, BLIMP, STORM, STORM_START_R, WEAPONS, HEALS, RARITY, AMMO, BUILD, HARVEST, FALL, OUTFITS } from './rules.js';
import { rollItem, isGun, isStack, stackMax, ammoFor, falloff, kindCode, AMMO_KINDS } from './items.js';
import { rayPlayer } from './world.js';
import { Bot } from './bots.js';
import { targetFor, bounds } from './build.js';

const BOT_NAMES = ['CrabCakes', 'PorkRollKing', 'SeaGull99', 'ManasquanMike', 'WawaWarrior', 'JerseyJay', 'BoardwalkBen', 'RiptideRay',
  'SaltwaterSam', 'DrawbridgeDan', 'ShoreThing', 'FlounderFan', 'BayBreeze', 'UnionLnLuke', 'GlimmerGus', 'ClamChowda', 'FlukeHunter',
  'NorEaster', 'TaylorHam', 'BennyBuster', 'DockRat', 'InletIvy', 'GreenheadGrr', 'SunsetSue', 'TideTina', 'MarinaMax'];

export const FLAG = { ALIVE: 1, CROUCH: 2, SKY: 4, GLIDE: 8, SWIM: 16, BLIMP: 32, BUILD: 64, BUSY: 128, OWN: 256 };

export class Match {
  /** people: [{ id, name, look, own, acct }] */
  constructor(opts) {
    this.seed = opts.seed >>> 0 || 1;
    this.R = rng(this.seed);
    this.world = new World();
    this.map = this.world.map;
    this.now = 0;
    this.phase = 'warmup';
    this.phaseT = 0;
    this.warmup = opts.warmup !== undefined ? opts.warmup : MATCH.WARMUP;
    this.players = new Map();
    this.loot = new Map();
    this.nextLoot = 1;
    this.proj = [];
    this.nextProj = 1;
    this.events = [];
    this.alive = 0;
    this.winner = 0;
    this.placeNext = 0;
    this.bots = [];
    this.admins = new Set();
    this.setupBlimp();
    this.setupStorm();
    this.setupLoot();
    let id = 1;
    for (const p of opts.people || []) { this.addPlayer({ ...p, bot: false }); id = Math.max(id, p.id + 1); }
    const size = opts.size || MATCH.SIZE;
    const names = [...BOT_NAMES];
    for (let i = this.players.size; i < size; i++) {
      const name = names.splice(Math.floor(this.R() * names.length), 1)[0] || 'Bot' + i;
      const look = { outfit: OUTFITS[Math.floor(this.R() * OUTFITS.length)].id };
      const p = this.addPlayer({ id: 1000 + i, name, look, bot: true });
      this.bots.push(new Bot(this, p, this.R));
    }
    this.alive = this.players.size;
    this.placeNext = this.alive;
  }

  // ---- setup ----
  setupBlimp() {
    const a = this.R() * Math.PI * 2, off = (this.R() * 2 - 1) * BLIMP.PASS;
    const dx = Math.cos(a), dz = Math.sin(a);
    const px = -dz * off, pz = dx * off + 20;
    const half = Math.sqrt(Math.max(0, 640 * 640 - off * off));
    this.blimp = { x0: px - dx * half, z0: pz - dz * half, x1: px + dx * half, z1: pz + dz * half, dx, dz, len: half * 2, t: 0, y: BLIMP.ALT, doors: false };
  }
  blimpPos(t = this.blimp.t) {
    const b = this.blimp, s = clamp(t * BLIMP.SPEED, 0, b.len);
    return { x: b.x0 + b.dx * s, z: b.z0 + b.dz * s, y: b.y };
  }

  setupStorm() {
    const R = this.R;
    const circles = [{ x: 0, z: 30, r: STORM_START_R }];
    for (const ph of STORM) {
      const prev = circles[circles.length - 1];
      let best = null;
      for (let tries = 0; tries < 60; tries++) {
        const room = Math.max(0, prev.r - ph.r);
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * room * (prev.r > 600 ? 0.35 : 1);
        const x = prev.x + Math.cos(a) * d, z = prev.z + Math.sin(a) * d;
        if (Math.abs(x) > MAP.HALF - 40 - ph.r * 0.3 || Math.abs(z) > MAP.HALF - 40 - ph.r * 0.3) continue;
        if (waterDist(x, z) > -12 && ph.r < 120) continue;
        best = { x, z, r: ph.r };
        if (waterDist(x, z) < -25) break;
      }
      circles.push(best || { x: prev.x, z: prev.z, r: ph.r });
    }
    this.circles = circles;
    this.storm = { i: -1, state: 'idle', t: 0, x: circles[0].x, z: circles[0].z, r: circles[0].r, next: circles[1], tick: 0 };
  }

  setupLoot() {
    const R = this.R;
    for (const s of this.map.loot) {
      if (s.kind === 'chest') { if (R() < 0.8) this.addLoot({ t: 'chest', x: s.x, y: s.y, z: s.z }, false); }
      else if (s.kind === 'ammo') { if (R() < 0.6) this.addLoot({ t: 'abox', x: s.x, y: s.y, z: s.z }, false); }
      else if (R() < 0.72) {
        const it = rollItem(R, false);
        this.addLoot({ t: 'item', x: s.x, y: s.y, z: s.z, it }, false);
        const am = ammoFor(it.k);
        if (am) this.addLoot({ t: 'ammo', x: s.x + 0.7, y: s.y, z: s.z + 0.3, a: am, n: AMMO[am].box }, false);
      }
    }
  }

  addPlayer(o) {
    const look = o.look || { outfit: 'lifeguard' };
    const p = {
      id: o.id, name: o.name, bot: !!o.bot, look, own: !!o.own, acct: o.acct || null,
      x: 0, y: BLIMP.ALT, z: 0, ry: 0, pitch: 0, mode: 'blimp', crouch: false, build: false,
      hp: HP.MAX, sh: 0, alive: true, place: 0, kills: 0, dmg: 0,
      inv: [null, null, null, null, null], slot: 0,
      ammo: Object.fromEntries(AMMO_KINDS.map((k) => [k, 0])), mats: [0, 0, 0],
      nextFire: 0, reload: null, heal: null, nextAxe: 0, lastSt: 0, god: false, dirty: true, by: 0,
      body: null,
    };
    this.players.set(p.id, p);
    return p;
  }

  // ---- loot ----
  addLoot(l, announce = true) {
    l.id = this.nextLoot++;
    if (l.t === 'item' || l.t === 'ammo' || l.t === 'mats') {
      // rest on whatever is under it
      const g = this.world.ground(l.x, l.z, 0.2, l.y + 1.2);
      if (g > l.y - 3) l.y = g;
    }
    this.loot.set(l.id, l);
    if (announce) this.ev({ e: 'loot+', l: packLoot(l) });
    return l;
  }
  removeLoot(id) { if (this.loot.delete(id)) this.ev({ e: 'loot-', id }); }
  spill(x, y, z, list) {
    list.forEach((l, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 + this.R() * 0.4, r = 1 + (i % 3) * 0.5;
      this.addLoot({ ...l, x: x + Math.cos(a) * r, y: y + 0.5, z: z + Math.sin(a) * r });
    });
  }

  ev(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }

  // ---- the clock ----
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.now += dt;
    this.phaseT += dt;
    if (this.phase === 'warmup') {
      for (const p of this.players.values()) this.putInBlimp(p);
      if (this.phaseT >= this.warmup) { this.phase = 'blimp'; this.phaseT = 0; this.ev({ e: 'phase', ph: 'blimp' }); }
    } else if (this.phase === 'blimp') {
      this.blimp.t = this.phaseT;
      this.blimp.doors = this.phaseT > 2;
      const bp = this.blimpPos();
      const leaving = this.phaseT * BLIMP.SPEED >= this.blimp.len - 2 || (this.phaseT * BLIMP.SPEED > this.blimp.len * 0.5 && (Math.abs(bp.x) > MAP.HALF + 20 || Math.abs(bp.z) > MAP.HALF + 20));
      let anyone = false;
      for (const p of this.players.values()) {
        if (p.mode !== 'blimp') continue;
        if (leaving) this.jump(p.id);
        else { this.putInBlimp(p); anyone = true; }
      }
      if (!anyone || leaving) { this.phase = 'play'; this.phaseT = 0; this.ev({ e: 'phase', ph: 'play' }); this.nextStorm(); }
    } else if (this.phase === 'play') {
      this.updateStorm(dt);
    }
    if (this.phase !== 'over' || this.phaseT < 2) {
      for (const b of this.bots) if (b.p.alive) b.update(dt);
      this.updateProj(dt);
      this.updateTimers();
      const grown = this.world.builds.tick(dt);
      this._growT = (this._growT || 0) + dt;
      if (grown.length && this._growT > 0.25) { this._growT = 0; for (const p of grown) this.ev({ e: 'php', id: p.id, hp: Math.round(p.hp) }); }
    }
    if (this.phase === 'over') this.overT = (this.overT || 0) + dt;
  }

  putInBlimp(p) { const b = this.blimpPos(); p.x = b.x; p.y = b.y; p.z = b.z; p.mode = 'blimp'; }

  nextStorm() {
    const s = this.storm;
    s.i++;
    if (s.i >= STORM.length) { s.state = 'done'; return; }
    s.state = 'wait'; s.t = 0;
    s.from = { x: s.x, z: s.z, r: s.r };
    s.next = this.circles[s.i + 1];
    this.ev({ e: 'storm', i: s.i, state: 'wait' });
  }

  updateStorm(dt) {
    const s = this.storm;
    if (s.state === 'wait' || s.state === 'shrink') {
      s.t += dt;
      const P = STORM[s.i];
      if (s.state === 'wait' && s.t >= P.wait) { s.state = 'shrink'; s.t = 0; this.ev({ e: 'storm', i: s.i, state: 'shrink' }); }
      else if (s.state === 'shrink') {
        const f = clamp(s.t / P.shrink, 0, 1);
        s.x = lerp(s.from.x, s.next.x, f); s.z = lerp(s.from.z, s.next.z, f); s.r = lerp(s.from.r, s.next.r, f);
        if (f >= 1) this.nextStorm();
      }
    }
    s.tick += dt;
    if (s.tick >= 1) {
      s.tick -= 1;
      const dmg = STORM[clamp(s.i, 0, STORM.length - 1)].dmg;
      for (const p of this.players.values()) {
        if (!p.alive || p.mode === 'blimp') continue;
        if (Math.hypot(p.x - s.x, p.z - s.z) > s.r) this.damage(p, dmg, 0, { storm: true });
      }
    }
  }

  stormLeft() {
    const s = this.storm;
    if (s.i < 0 || s.state === 'done') return 0;
    const P = STORM[s.i];
    return s.state === 'wait' ? P.wait - s.t : P.shrink - s.t;
  }

  updateTimers() {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.reload && this.now >= p.reload.until) {
        const it = p.inv[p.reload.slot - 1];
        if (it && isGun(it.k)) {
          const W = WEAPONS[it.k], need = W.mag - it.mag, have = p.god ? need : p.ammo[W.ammo], n = Math.min(need, have);
          it.mag += n; if (!p.god) p.ammo[W.ammo] -= n;
        }
        p.reload = null; p.dirty = true;
      }
      if (p.heal && this.now >= p.heal.until) {
        const it = p.inv[p.heal.slot - 1];
        if (it && HEALS[it.k]) {
          const H = HEALS[it.k];
          if (it.k === 'slush') { p.hp = Math.min(HP.MAX, p.hp + 75); p.sh = Math.min(HP.SHIELD, p.sh + 75); }
          else {
            if (H.hp) p.hp = Math.max(p.hp, Math.min(H.cap, p.hp + H.hp));
            if (H.sh) p.sh = Math.max(p.sh, Math.min(H.cap, p.sh + H.sh));
          }
          it.n--; if (it.n <= 0) p.inv[p.heal.slot - 1] = null;
          this.ev({ e: 'healed', id: p.id });
        }
        p.heal = null; p.dirty = true;
      }
    }
  }

  // ---- actions (from a person's browser, or from a bot) ----
  action(id, a) {
    const p = this.players.get(id);
    if (!p || !a || typeof a.k !== 'string') return false;
    if (a.k === 'admin') return this.admin(p, a);
    if (!p.alive || this.phase === 'over' && this.overT > 3) return false;
    switch (a.k) {
      case 'jump': return this.jump(id);
      case 'fire': return this.fire(p, a);
      case 'reload': return this.startReload(p, a.s | 0);
      case 'heal': return this.startHeal(p, a.s | 0);
      case 'slot': if (a.s >= 0 && a.s <= 5) { if (p.slot !== a.s) { p.reload = null; p.heal = null; } p.slot = a.s | 0; p.dirty = true; } return true;
      case 'cancel': p.reload = null; p.heal = null; p.dirty = true; return true;
      case 'pick': return this.pick(p, a.id | 0);
      case 'open': return this.open(p, a.id | 0);
      case 'drop': return this.drop(p, a.s | 0, a.all);
      case 'swap': return this.swap(p, a.a | 0, a.b | 0);
      case 'build': return this.build(p, a);
      case 'edit': return this.edit(p, a.id | 0, a.v | 0);
      case 'axe': return this.axe(p, a);
      case 'fall': if (p.mode !== 'blimp' && typeof a.d === 'number') this.fallDamage(p, a.d); return true;
    }
    return false;
  }

  /** A person's own position report (they move themselves; the server keeps it sane). */
  state(id, s) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.mode === 'blimp' || this.phase === 'warmup') return;
    const ok = [s.x, s.y, s.z, s.ry].every((v) => typeof v === 'number' && Number.isFinite(v));
    if (!ok) return;
    const dt = Math.max(0.02, this.now - (p.lastSt || 0));
    const max = (p.mode === 'sky' || p.mode === 'glide' || s.m === 'sky' ? 75 : 30) * dt + 3;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d > max && !p.own) { p.badMoves = (p.badMoves || 0) + 1; if (p.badMoves > 6) { this.ev({ e: 'tp', id, x: p.x, y: p.y, z: p.z, to: id }); p.badMoves = 0; } return; }
    p.badMoves = 0;
    p.x = clamp(s.x, -MAP.EDGE, MAP.EDGE); p.y = clamp(s.y, -10, 400); p.z = clamp(s.z, -MAP.EDGE, MAP.EDGE);
    p.ry = s.ry; p.pitch = clamp(+s.p || 0, -1.6, 1.6);
    if (['ground', 'sky', 'glide', 'swim'].includes(s.m)) p.mode = s.m;
    p.crouch = !!s.c; p.build = !!s.b;
    if (typeof s.s === 'number' && s.s >= 0 && s.s <= 5 && s.s !== p.slot) { p.slot = s.s | 0; p.reload = null; p.heal = null; p.dirty = true; }
    p.lastSt = this.now;
  }

  jump(id) {
    const p = this.players.get(id);
    if (!p || p.mode !== 'blimp' || this.phase !== 'blimp') return false;
    if (!this.blimp.doors && this.phaseT * BLIMP.SPEED < this.blimp.len - 2) return false;
    const b = this.blimpPos();
    p.mode = 'sky'; p.x = b.x; p.y = b.y - 3; p.z = b.z;
    if (p.bot) p.body = newBody(p.x, p.y, p.z, 'sky');
    this.ev({ e: 'jump', id, x: p.x, y: p.y, z: p.z });
    return true;
  }

  // -- shooting --
  /**
   * a = { s: slot, o: [x,y,z] muzzle/eye, d: [dx,dy,dz] aim, h: [[kind ('p' player | 'b' piece | 'r' prop), id, head 0/1, pellets, dist]] }
   * People's browsers say what their pellets hit (so shots feel right with lag); bots' hits are worked out here.
   */
  fire(p, a) {
    if (p.mode === 'blimp' || p.mode === 'swim') return false;
    const it = p.inv[(a.s | 0) - 1];
    if (!it || !WEAPONS[it.k]) return false;
    const W = WEAPONS[it.k];
    if (this.now < p.nextFire - 0.04) return false;
    if (W.consumable) {
      // grenade: throw one
      it.n--; if (it.n <= 0) p.inv[(a.s | 0) - 1] = null;
      p.dirty = true; p.nextFire = this.now + 0.9;
      const d = normDir(a.d); if (!d) return false;
      const o = sanePoint(a.o, p);
      this.proj.push({ id: this.nextProj++, k: 'grenade', x: o[0], y: o[1], z: o[2], vx: d[0] * 22, vy: d[1] * 22 + 5, vz: d[2] * 22, by: p.id, fuse: W.fuse, r: it.r });
      this.ev({ e: 'throw', id: p.id });
      return true;
    }
    if (p.reload && W.pellets > 1 && it.mag > 0) p.reload = null;   // shotguns can cut a reload short
    if (p.reload) return false;
    if (it.mag <= 0) return false;
    it.mag--; p.dirty = true;
    p.nextFire = this.now + 1 / W.rate;
    p.heal = null;
    const d = normDir(a.d); if (!d) return false;
    const o = sanePoint(a.o, p);
    if (it.k === 'rocket') {
      this.proj.push({ id: this.nextProj++, k: 'rocket', x: o[0] + d[0], y: o[1] + d[1], z: o[2] + d[2], vx: d[0] * W.speed, vy: d[1] * W.speed, vz: d[2] * W.speed, by: p.id, fuse: 8, r: it.r });
      this.ev({ e: 'shot', id: p.id, w: kindCode(it.k), o, h: null });
      return true;
    }
    const mul = RARITY[it.r].dmg;
    let end = null;
    const hits = Array.isArray(a.h) ? a.h.slice(0, 12) : [];
    let pellets = 0;
    for (const h of hits) {
      if (!Array.isArray(h)) continue;
      const n = clamp(h[3] | 0, 1, W.pellets);
      pellets += n; if (pellets > W.pellets) break;
      if (h[0] === 'p') {
        const v = this.players.get(h[1] | 0);
        if (!v || !v.alive || v.id === p.id || v.mode === 'blimp') continue;
        const dist = Math.hypot(v.x - o[0], v.y + 1 - o[1], v.z - o[2]);
        if (dist > W.range + 4) continue;
        const dmg = W.dmg * mul * falloff(W, dist) * (h[2] ? W.hs : 1) * n;
        this.damage(v, dmg, p.id, { w: it.k, head: !!h[2] });
        end = [v.x, v.y + 1.2, v.z];
      } else if (h[0] === 'b') {
        const pc = this.world.builds.pieces.get(h[1] | 0);
        if (!pc) continue;
        this.hitPiece(pc, W.dmg * mul * (W.build || 1) * n, p.id);
      } else if (h[0] === 'r') {
        // props soak bullets without giving materials
      }
    }
    this.ev({ e: 'shot', id: p.id, w: kindCode(it.k), o, h: end });
    return true;
  }

  /** Bots shoot with real rays from here. dirs = pellet directions. */
  botFire(p, slot, o, dirs) {
    const it = p.inv[slot - 1];
    if (!it || !isGun(it.k)) return false;
    const W = WEAPONS[it.k];
    const h = [];
    const tally = new Map();
    for (const d of dirs) {
      const wh = this.world.ray(o[0], o[1], o[2], d[0], d[1], d[2], W.range || 100);
      let best = wh ? wh.t : (W.range || 100), who = null;
      for (const v of this.players.values()) {
        if (!v.alive || v.id === p.id || v.mode === 'blimp') continue;
        if (Math.abs(v.x - o[0]) > best + 2 || Math.abs(v.z - o[2]) > best + 2) continue;
        const r = rayPlayer(o[0], o[1], o[2], d[0], d[1], d[2], best, v);
        if (r && r.t < best) { best = r.t; who = { v, head: r.head }; }
      }
      let key = null;
      if (who) key = 'p' + who.v.id + (who.head ? 'h' : '');
      else if (wh && wh.kind === 'piece') key = 'b' + wh.id;
      if (key) tally.set(key, (tally.get(key) || 0) + 1);
    }
    for (const [key, n] of tally) {
      if (key[0] === 'p') h.push(['p', parseInt(key.slice(1), 10), key.endsWith('h') ? 1 : 0, n]);
      else h.push(['b', parseInt(key.slice(1), 10), 0, n]);
    }
    return this.fire(p, { s: slot, o, d: dirs[0], h });
  }

  updateProj(dt) {
    const keep = [];
    for (const r of this.proj) {
      r.fuse -= dt;
      let boom = r.fuse <= 0;
      if (r.k === 'grenade') r.vy -= 20 * dt;
      const sp = Math.hypot(r.vx, r.vy, r.vz), len = sp * dt;
      if (len > 0 && !boom) {
        const dx = r.vx / sp, dy = r.vy / sp, dz = r.vz / sp;
        const hit = this.world.ray(r.x, r.y, r.z, dx, dy, dz, len + 0.2);
        let hp = null;
        if (r.k === 'rocket') for (const v of this.players.values()) {
          if (!v.alive || v.id === r.by || v.mode === 'blimp') continue;
          const q = rayPlayer(r.x, r.y, r.z, dx, dy, dz, len + 0.4, v);
          if (q && (!hp || q.t < hp.t)) hp = q;
        }
        if (hit || hp) {
          const t = Math.min(hit ? hit.t : 1e9, hp ? hp.t : 1e9);
          if (r.k === 'rocket') { r.x += dx * t; r.y += dy * t; r.z += dz * t; boom = true; if (hit && hit.kind === 'piece' && (!hp || hit.t <= hp.t)) r.direct = hit.id; }
          else {
            // grenades bounce
            r.x += dx * Math.max(0, t - 0.15); r.y += dy * Math.max(0, t - 0.15); r.z += dz * Math.max(0, t - 0.15);
            if (Math.abs(dy) > 0.6) r.vy = -r.vy * 0.35; else { r.vx = -r.vx * 0.35; r.vz = -r.vz * 0.35; }
            r.vx *= 0.7; r.vz *= 0.7;
          }
        } else { r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; }
      }
      if (r.y < -6) boom = true;
      if (boom) this.explode(r); else keep.push(r);
    }
    this.proj = keep;
  }

  explode(r) {
    const W = WEAPONS[r.k];
    const rad = W.splash, mul = RARITY[r.r || 0].dmg;
    this.ev({ e: 'boom', x: +r.x.toFixed(2), y: +r.y.toFixed(2), z: +r.z.toFixed(2), r: rad });
    for (const v of this.players.values()) {
      if (!v.alive || v.mode === 'blimp') continue;
      const d = Math.hypot(v.x - r.x, v.y + 0.9 - r.y, v.z - r.z);
      if (d > rad + 0.5) continue;
      if (!this.world.clear(r.x, r.y + 0.3, r.z, v.x, v.y + 1, v.z)) continue;
      const f = d < 1.2 ? 1 : clamp(1 - (d - 1.2) / (rad - 0.7), 0.25, 1);
      this.damage(v, W.dmg * mul * f, r.by, { w: r.k, splash: true });
    }
    const hitPieces = new Set();
    if (r.direct) hitPieces.add(r.direct);
    this.world.builds.near(r.x - rad, r.z - rad, r.x + rad, r.z + rad, (pc) => {
      const b = bounds(pc);
      const cx = clamp(r.x, b.x0, b.x1), cy = clamp(r.y, b.y0, b.y1), cz = clamp(r.z, b.z0, b.z1);
      if (Math.hypot(cx - r.x, cy - r.y, cz - r.z) < rad * 0.75) hitPieces.add(pc.id);
    });
    for (const id of hitPieces) { const pc = this.world.builds.pieces.get(id); if (pc) this.hitPiece(pc, W.buildDmg, r.by); }
  }

  hitPiece(pc, dmg, by) {
    const gone = this.world.builds.damage(pc.id, dmg);
    if (gone.length) this.ev({ e: 'piece-', ids: gone });
    else this.ev({ e: 'php', id: pc.id, hp: Math.round(pc.hp), by });
  }

  damage(v, amt, by, info = {}) {
    if (!v.alive || amt <= 0) return;
    if (v.god) return;
    amt = Math.round(amt);
    let toSh = 0;
    if (!info.storm && !info.fall && v.sh > 0) { toSh = Math.min(v.sh, amt); v.sh -= toSh; }
    v.hp -= amt - toSh;
    v.dirty = true;
    v.heal = null;
    if (by) { const a = this.players.get(by); if (a) a.dmg += amt; }
    this.ev({ e: 'hit', a: by || 0, v: v.id, d: amt, sh: toSh > 0 ? 1 : 0, hs: info.head ? 1 : 0, st: info.storm ? 1 : 0 });
    if (v.bot) { const b = this.bots.find((q) => q.p === v); if (b) b.hurt(by); }
    if (v.hp <= 0) this.eliminate(v, by, info);
  }

  fallDamage(p, d) {
    if (d <= FALL.SAFE) return;
    this.damage(p, Math.min(150, (d - FALL.SAFE) * FALL.PER_M), 0, { fall: true });
  }

  eliminate(v, by, info) {
    v.alive = false; v.hp = 0; v.sh = 0;
    v.place = this.placeNext--;
    this.alive--;
    const killer = by && by !== v.id ? this.players.get(by) : null;
    if (killer) killer.kills++;
    this.ev({ e: 'elim', v: v.id, a: killer ? killer.id : 0, w: info.w || (info.storm ? 'storm' : info.fall ? 'fall' : ''), hs: info.head ? 1 : 0, place: v.place });
    // drop everything
    const list = [];
    for (const it of v.inv) if (it) list.push({ t: 'item', it });
    for (const k of AMMO_KINDS) if (v.ammo[k] > 0) list.push({ t: 'ammo', a: k, n: v.ammo[k] });
    v.mats.forEach((n, m) => { if (n > 0) list.push({ t: 'mats', m, n }); });
    v.inv = [null, null, null, null, null];
    v.ammo = Object.fromEntries(AMMO_KINDS.map((k) => [k, 0])); v.mats = [0, 0, 0];
    this.spill(v.x, v.y, v.z, list);
    v.dirty = true;
    if (this.phase !== 'over' && this.alive <= 1) {
      const w = [...this.players.values()].find((p) => p.alive);
      this.winner = w ? w.id : 0;
      if (w) w.place = 1;
      this.phase = 'over'; this.phaseT = 0; this.overT = 0;
      this.ev({ e: 'win', id: this.winner });
    }
  }

  // -- reload / heal --
  startReload(p, s) {
    const it = p.inv[s - 1];
    if (!it || !isGun(it.k) || p.reload) return false;
    const W = WEAPONS[it.k];
    if (it.mag >= W.mag || (!p.god && p.ammo[W.ammo] <= 0)) return false;
    p.heal = null;
    p.reload = { slot: s, until: this.now + W.reload * RARITY[it.r].reload };
    p.dirty = true;
    this.ev({ e: 'reload', id: p.id });
    return true;
  }
  startHeal(p, s) {
    const it = p.inv[s - 1];
    if (!it || !HEALS[it.k] || p.heal) return false;
    const H = HEALS[it.k];
    if (H.hp && !H.sh && p.hp >= H.cap) return false;
    if (H.sh && !H.hp && p.sh >= H.cap) return false;
    if (H.hp && H.sh && p.hp >= 100 && p.sh >= 100) return false;
    p.reload = null;
    p.heal = { slot: s, until: this.now + H.time };
    p.dirty = true;
    this.ev({ e: 'heal', id: p.id, k: it.k });
    return true;
  }

  // -- loot --
  near(p, l, r) { return Math.hypot(p.x - l.x, p.z - l.z) < r && Math.abs(p.y - l.y) < 2.6; }
  pick(p, id) {
    const l = this.loot.get(id);
    if (!l || !this.near(p, l, 3.2)) return false;
    if (l.t === 'ammo') { p.ammo[l.a] = Math.min(AMMO[l.a].max, p.ammo[l.a] + l.n); this.removeLoot(id); p.dirty = true; this.ev({ e: 'got', id: p.id }); return true; }
    if (l.t === 'mats') { p.mats[l.m] = Math.min(BUILD.MAX_MATS, p.mats[l.m] + l.n); this.removeLoot(id); p.dirty = true; this.ev({ e: 'got', id: p.id }); return true; }
    if (l.t !== 'item') return false;
    const it = l.it;
    if (isStack(it.k)) {
      for (const s of p.inv) {
        if (s && s.k === it.k && s.n < stackMax(it.k)) {
          const take = Math.min(stackMax(it.k) - s.n, it.n);
          s.n += take; it.n -= take;
          if (it.n <= 0) { this.removeLoot(id); }
          else this.ev({ e: 'loot~', id, n: it.n });
          p.dirty = true; this.ev({ e: 'got', id: p.id });
          return true;
        }
      }
    }
    let slot = p.inv.findIndex((s) => !s);
    if (slot < 0) {
      if (p.slot < 1) return false;   // full and holding the pickaxe
      slot = p.slot - 1;
      const old = p.inv[slot];
      p.inv[slot] = null;
      this.addLoot({ t: 'item', x: p.x, y: p.y + 0.3, z: p.z, it: old });
    }
    p.inv[slot] = { ...it };
    this.removeLoot(id);
    p.dirty = true;
    if (p.slot === 0 && !p.bot) { /* stay on the pickaxe; the hud shows the new item */ }
    this.ev({ e: 'got', id: p.id });
    return true;
  }
  open(p, id) {
    const l = this.loot.get(id);
    if (!l || (l.t !== 'chest' && l.t !== 'abox') || !this.near(p, l, 3.2)) return false;
    this.removeLoot(id);
    this.ev({ e: 'opened', id, t: l.t, x: l.x, y: l.y, z: l.z });
    const out = [];
    if (l.t === 'chest') {
      const gun = rollItem(this.R, true);
      out.push({ t: 'item', it: gun });
      const am = ammoFor(gun.k); if (am) out.push({ t: 'ammo', a: am, n: AMMO[am].box * 2 });
      let extra = rollItem(this.R, true); let n = 0;
      while (isGun(extra.k) && n++ < 6) extra = rollItem(this.R, true);
      out.push({ t: 'item', it: extra });
      out.push({ t: 'mats', m: 0, n: 30 });
    } else {
      const a = AMMO_KINDS.filter((k) => k !== 'rockets');
      for (let i = 0; i < 2; i++) { const k = a[Math.floor(this.R() * a.length)]; out.push({ t: 'ammo', a: k, n: AMMO[k].box }); }
    }
    this.spill(l.x, l.y, l.z, out);
    return true;
  }
  drop(p, s, all) {
    const it = p.inv[s - 1];
    if (!it) return false;
    let drop = it;
    if (isStack(it.k) && !all && it.n > 1) { it.n--; drop = { ...it, n: 1 }; }
    else p.inv[s - 1] = null;
    const a = p.ry;
    this.addLoot({ t: 'item', x: p.x - Math.sin(a) * 1.2, y: p.y + 0.3, z: p.z - Math.cos(a) * 1.2, it: { ...drop } });
    if (p.reload && p.reload.slot === s) p.reload = null;
    if (p.heal && p.heal.slot === s) p.heal = null;
    p.dirty = true;
    return true;
  }
  swap(p, a, b) {
    if (a < 1 || a > 5 || b < 1 || b > 5) return false;
    const t = p.inv[a - 1]; p.inv[a - 1] = p.inv[b - 1]; p.inv[b - 1] = t;
    p.reload = null; p.heal = null; p.dirty = true;
    return true;
  }

  // -- building --
  build(p, a) {
    if (p.mode !== 'ground' && p.mode !== 'glide' && p.mode !== 'sky') return false;
    if (p.mode !== 'ground') return false;
    const mat = clamp(a.m | 0, 0, 2);
    if (!p.god && p.mats[mat] < BUILD.COST) return false;
    const o = typeof a.o === 'number' && a.o >= 0 && a.o < BUILD.LEVEL ? a.o : 0;
    const spec = { t: a.t, i: a.i, j: a.j, k: a.lv, o, ax: a.ax, dir: a.dir | 0, mat, own: p.id };   // (a.k is the action name, so the level is lv)
    const C = BUILD.CELL, L = BUILD.LEVEL;
    const cx = (spec.i + 0.5) * C, cz = (spec.j + 0.5) * C, cy = (spec.k + 0.5) * L + o;
    if (Math.hypot(cx - p.x, cz - p.z) > BUILD.REACH + 2 || Math.abs(cy - p.y) > L * 2.6) return false;
    const why = this.world.builds.check(spec);
    if (why) return false;
    const pc = this.world.builds.add(spec);
    if (!p.god) p.mats[mat] -= BUILD.COST;
    p.dirty = true;
    p.heal = null;
    this.ev({ e: 'piece+', p: this.world.builds.pack(pc) });
    return pc;
  }
  edit(p, id, v) {
    const pc = this.world.builds.pieces.get(id);
    if (!pc || (pc.own !== p.id && !p.god)) return false;
    const C = BUILD.CELL, L = BUILD.LEVEL;
    if (Math.hypot((pc.i + 0.5) * C - p.x, (pc.j + 0.5) * C - p.z) > 9 || Math.abs((pc.k + 0.5) * L + (pc.o || 0) - p.y) > 8) return false;
    if (!this.world.builds.edit(id, v)) return false;
    this.ev({ e: 'edit', id, v: pc.t === 'ramp' ? pc.dir : pc.edit });
    return true;
  }

  // -- pickaxe --
  axe(p, a) {
    if (p.mode !== 'ground' || this.now < p.nextAxe - 0.05) return false;
    p.nextAxe = this.now + 1 / BUILD.PICKAXE.rate;
    p.heal = null;
    this.ev({ e: 'swing', id: p.id });
    const reach = BUILD.PICKAXE.reach + 1.6;
    if (a.t === 'r') {
      const pr = this.map.props[a.id | 0];
      if (!pr || this.world.gone.has(pr.id)) return true;
      if (Math.hypot(pr.x - p.x, pr.z - p.z) > reach + Math.max(pr.hw, pr.hd)) return true;
      const H = HARVEST[pr.kind];
      const hp = this.world.propHealth(pr) - H.hp / Math.ceil(H.hp / 50);
      p.mats[H.mat] = Math.min(BUILD.MAX_MATS, p.mats[H.mat] + H.per);
      p.dirty = true;
      if (hp <= 0) { this.world.gone.add(pr.id); this.ev({ e: 'prop-', id: pr.id }); }
      else { this.world.propHp.set(pr.id, hp); this.ev({ e: 'prop', id: pr.id, hp }); }
      return true;
    }
    if (a.t === 'b') {
      const pc = this.world.builds.pieces.get(a.id | 0);
      if (!pc) return true;
      const C = BUILD.CELL;
      if (Math.hypot((pc.i + 0.5) * C - p.x, (pc.j + 0.5) * C - p.z) > reach + 2.5) return true;
      this.hitPiece(pc, BUILD.PICKAXE.piece, p.id);
      return true;
    }
    if (a.t === 'p') {
      const v = this.players.get(a.id | 0);
      if (!v || !v.alive || v.id === p.id || Math.hypot(v.x - p.x, v.z - p.z) > reach) return true;
      this.damage(v, BUILD.PICKAXE.player, p.id, { w: 'pickaxe' });
    }
    return true;
  }

  // -- owner tools --
  admin(p, a) {
    if (!p.own) return false;
    switch (a.c) {
      case 'god': p.god = !p.god; p.dirty = true; return true;
      case 'heal': p.hp = 100; p.sh = 100; p.dirty = true; return true;
      case 'loadout': {
        p.inv = [{ k: 'ar', r: 4, mag: 30 }, { k: 'pump', r: 4, mag: 5 }, { k: 'sniper', r: 4, mag: 1 }, { k: 'rocket', r: 4, mag: 1 }, { k: 'slush', r: 4, n: 2 }];
        for (const k of AMMO_KINDS) p.ammo[k] = AMMO[k].max === 99 ? 30 : 300;
        p.mats = [999, 999, 999]; p.hp = 100; p.sh = 100; p.dirty = true; return true;
      }
      case 'mats': p.mats = [999, 999, 999]; p.dirty = true; return true;
      case 'storm': {
        const s = this.storm;
        if (s.state === 'wait') s.t = STORM[s.i].wait;
        else if (s.state === 'shrink') s.t = STORM[s.i].shrink;
        return true;
      }
      case 'chest': { this.addLoot({ t: 'chest', x: p.x - Math.sin(p.ry) * 2.5, y: p.y, z: p.z - Math.cos(p.ry) * 2.5 }); return true; }
      case 'tp': {
        if (![a.x, a.z].every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
        const x = clamp(a.x, -MAP.HALF, MAP.HALF), z = clamp(a.z, -MAP.HALF, MAP.HALF);
        const y = this.world.ground(x, z, 0.3, 400) + 0.1;
        p.x = x; p.y = y; p.z = z; if (p.mode === 'blimp') return false;
        this.ev({ e: 'tp', id: p.id, x, y, z, to: p.id });
        return true;
      }
      case 'bots': { for (const q of this.players.values()) if (q.bot && q.alive) this.eliminate(q, p.id, { w: 'admin' }); return true; }
    }
    return false;
  }

  // ---- what everyone sees ----
  snapshot() {
    const s = this.storm;
    const p = [];
    for (const q of this.players.values()) {
      let f = 0;
      if (q.alive) f |= FLAG.ALIVE;
      if (q.crouch) f |= FLAG.CROUCH;
      if (q.mode === 'sky') f |= FLAG.SKY;
      if (q.mode === 'glide') f |= FLAG.GLIDE;
      if (q.mode === 'swim') f |= FLAG.SWIM;
      if (q.mode === 'blimp') f |= FLAG.BLIMP;
      if (q.build) f |= FLAG.BUILD;
      if (q.reload || q.heal) f |= FLAG.BUSY;
      if (q.own) f |= FLAG.OWN;
      const held = q.slot > 0 && q.inv[q.slot - 1] ? kindCode(q.inv[q.slot - 1].k) : -1;
      const rar = q.slot > 0 && q.inv[q.slot - 1] ? q.inv[q.slot - 1].r : 0;
      p.push([q.id, r2(q.x), r2(q.y), r2(q.z), r3(q.ry), r3(q.pitch), f, held, rar, Math.max(0, Math.round(q.hp)), Math.round(q.sh)]);
    }
    const bp = this.phase === 'warmup' || this.phase === 'blimp' ? this.blimpPos() : null;
    return {
      ph: this.phase, pt: r2(this.phaseT), wu: this.warmup, al: this.alive, win: this.winner,
      st: [r2(s.x), r2(s.z), r2(s.r), s.next ? r2(s.next.x) : 0, s.next ? r2(s.next.z) : 0, s.next ? r2(s.next.r) : 0, s.i, s.state, r2(this.stormLeft())],
      bl: bp ? [r2(bp.x), r2(bp.z), bp.y, this.blimp.doors ? 1 : 0, r3(Math.atan2(-this.blimp.dx, -this.blimp.dz))] : null,
      p,
      pr: this.proj.map((r) => [r.id, r2(r.x), r2(r.y), r2(r.z), r.k === 'rocket' ? 1 : 2]),
    };
  }

  /** Private state for one player (inventory etc.). */
  me(id) {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      inv: p.inv.map((it) => (it ? { ...it } : null)), slot: p.slot, ammo: { ...p.ammo }, mats: [...p.mats],
      hp: Math.max(0, Math.round(p.hp)), sh: Math.round(p.sh), kills: p.kills, alive: p.alive, place: p.place, god: p.god,
      reload: p.reload ? [p.reload.slot, r2(p.reload.until - this.now)] : null,
      heal: p.heal ? [p.heal.slot, r2(p.heal.until - this.now)] : null,
      mode: p.mode,
    };
  }

  /** Everything a newcomer needs (loot, pieces, harvested props). */
  full() {
    return {
      loot: [...this.loot.values()].map(packLoot),
      pieces: this.world.builds.all(),
      gone: [...this.world.gone],
      hp: [...this.world.propHp.entries()],
      blimp: { ...this.blimp },
      circles: this.circles,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, bot: p.bot ? 1 : 0, own: p.own ? 1 : 0 })),
    };
  }

  results() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, place: p.alive ? 1 : p.place, kills: p.kills, dmg: Math.round(p.dmg), bot: p.bot })).sort((a, b) => a.place - b.place);
  }
}

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
function normDir(d) {
  if (!Array.isArray(d) || d.length !== 3 || !d.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const l = Math.hypot(d[0], d[1], d[2]);
  return l > 0.01 ? [d[0] / l, d[1] / l, d[2] / l] : null;
}
function sanePoint(o, p) {
  if (Array.isArray(o) && o.length === 3 && o.every((v) => typeof v === 'number' && Number.isFinite(v)) && Math.hypot(o[0] - p.x, o[1] - p.y - 1.5, o[2] - p.z) < 4) return o;
  return [p.x, p.y + 1.5, p.z];
}
export function packLoot(l) {
  if (l.t === 'item') return [l.id, 'i', r2(l.x), r2(l.y), r2(l.z), l.it.k, l.it.r, l.it.n || 0, l.it.mag !== undefined ? l.it.mag : -1];
  if (l.t === 'ammo') return [l.id, 'a', r2(l.x), r2(l.y), r2(l.z), l.a, 0, l.n];
  if (l.t === 'mats') return [l.id, 'm', r2(l.x), r2(l.y), r2(l.z), l.m, 0, l.n];
  return [l.id, l.t === 'chest' ? 'c' : 'b', r2(l.x), r2(l.y), r2(l.z)];
}
export function unpackLoot(a) {
  const t = { i: 'item', a: 'ammo', m: 'mats', c: 'chest', b: 'abox' }[a[1]];
  const l = { id: a[0], t, x: a[2], y: a[3], z: a[4] };
  if (t === 'item') { l.it = { k: a[5], r: a[6] }; if (a[7]) l.it.n = a[7]; if (a[8] >= 0) l.it.mag = a[8]; }
  if (t === 'ammo') { l.a = a[5]; l.n = a[7]; }
  if (t === 'mats') { l.m = a[5]; l.n = a[7]; }
  return l;
}
export { targetFor };
