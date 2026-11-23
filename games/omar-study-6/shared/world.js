// The living city: players, cars, people, police and money. One World runs in the browser for solo play
// and one per session on the server. Players move themselves (and the car they drive); everything else is decided here.
import { getCity } from './city.js';
import { rng, clamp, angWrap, hash2 } from './util.js';
import { PLAYER, F, WEAPONS, VEHICLES, VK, CAR_COLORS, VF, HEAT, CRIME, PED, ROLE, PS, POP, NET, DAY, START_HOUR, ARMOR_PRICE, SNACK } from './rules.js';
import { heistAction, heistUpdate, heistState, heistLeave, guardAlert } from './heists.js';

const TW = VEHICLES.map((v) => v.w), TW_SUM = TW.reduce((a, b) => a + b, 0);
const pickKind = (r) => { let t = r * TW_SUM; for (let i = 0; i < TW.length; i++) { t -= TW[i]; if (t <= 0) return i; } return 1; };
const NPC_GUN = { 2: { cool: 0.95, mul: 1, range: 36 }, 3: { cool: 0.3, mul: 0.42, range: 40 }, 4: { cool: 1.3, mul: 1.9, range: 15 }, 5: { cool: 0.42, mul: 0.55, range: 52 } };
const r2 = (v) => Math.round(v * 100) / 100;

export class World {
  constructor(o = {}) {
    this.city = getCity(); this.R = rng(o.seed || 1); this.time = 0; this.clock = (START_HOUR / 24) * DAY;
    this.players = new Map(); this.vehicles = new Map(); this.peds = new Map(); this.pickups = new Map(); this.heists = new Map();
    this.nid = 100; this.out = []; this.gates = 0; this.gateCloseAt = 0; this.cool = new Map(); this.spotVeh = new Map(); this.staffPed = new Map();
    this.popT = 0; this.seeT = 0; this.copT = 0; this.density = o.density ?? 1;
    this._o = { x: 0, z: 0, nx: 0, nz: 0 }; this._sp = [];
    for (const d of this.city.poi.dealer.display) this.spawnDisplay(d);
  }

  // ------------------------------------------------------------------ people coming and going
  addPlayer(i) {
    const s = this.city.spawn, n = this.players.size;
    const P = {
      id: i.id, name: i.name, look: i.look | 0, own: !!i.own, acct: i.acct || null, x: s.x + (n % 4) * 1.3 - 2, y: 0, z: s.z - ((n / 4) | 0) * 1.2, ry: s.ry, pitch: 0, f: 0, w: 0, vx: 0, vz: 0, st: 0,
      hp: PLAYER.HP, armor: 0, veh: 0, seat: 0, heat: 0, pts: 0, seenT: 99, seenX: 0, seenZ: 0, esc: 0, cash: clamp(Math.floor(+i.cash || 0), 0, 5e7),
      guns: new Set([0, ...(i.guns || [])].filter((w) => WEAPONS[w])), cars: new Set((i.cars || []).filter((c) => VEHICLES[c] && VEHICLES[c].price)), done: new Set(i.done || []),
      dead: false, respawnAt: 0, crew: 0, passive: false, budget: 1, shotT: 0, kills: 0, killT: 0, dirty: true, ev: [], car: 0, callT: 0, bustT: 0, copAt: 0, heliAt: 0, god: false, sn: 0, rob: null,
    };
    this.players.set(P.id, P);
    this.emit({ e: 'join', id: P.id, name: P.name, look: P.look, own: P.own ? 1 : 0 });
    return P;
  }
  removePlayer(id) {
    const P = this.players.get(id); if (!P) return;
    this.leaveVeh(P); heistLeave(this, P);
    const V = this.vehicles.get(P.car); if (V && !V.drv) this.vehicles.delete(V.id);
    this.players.delete(id);
    this.emit({ e: 'leave', id, name: P.name });
  }
  roster() { return [...this.players.values()].map((P) => ({ id: P.id, name: P.name, look: P.look, own: P.own ? 1 : 0 })); }
  full() { return { roster: this.roster(), time: this.time, clock: this.clock }; }

  emit(ev, x, z) { if (x !== undefined) { ev.x = r2(x); ev.z = r2(z); ev.pos = 1; } this.out.push(ev); }
  tell(P, ev) { if (P) P.ev.push(ev); }
  /** Everything a player should hear about since the last call. Call flush() after everyone has drained. */
  drain(id) {
    const P = this.players.get(id); if (!P) return [];
    const list = P.ev; P.ev = [];
    for (const e of this.out) if (!e.pos || (e.x - P.x) ** 2 + (e.z - P.z) ** 2 < 220 * 220) list.push(e);
    return list;
  }
  flush() { this.out.length = 0; }
  pay(P, n, why) { P.cash = Math.max(0, P.cash + Math.round(n)); P.dirty = true; this.tell(P, { e: 'cash', n: Math.round(n), why }); }

  // ------------------------------------------------------------------ what players send
  state(id, s) {
    const P = this.players.get(id); if (!P || P.dead) return;
    const now = this.time, dt = Math.max(0.02, now - (P.st || 0)); P.st = now;
    const V = P.veh ? this.vehicles.get(P.veh) : null;
    let x = +s.x, z = +s.z;
    if (V) {
      if (V.drv === id && s.v && isFinite(s.v[0]) && isFinite(s.v[1])) { V.x = s.v[0]; V.z = s.v[1]; V.ry = +s.v[2] || 0; V.sp = clamp(+s.v[3] || 0, -40, 120); V.st = clamp(+s.v[4] || 0, -1, 1); V.idle = 0; }
      x = V.x; z = V.z;
    }
    if (!isFinite(x) || !isFinite(z)) return;
    P.vx = (x - P.x) / dt; P.vz = (z - P.z) / dt; if (Math.abs(P.vx) > 130) P.vx = 0; if (Math.abs(P.vz) > 130) P.vz = 0;
    P.x = x; P.z = z; P.y = clamp(+s.y || 0, -3, 40); P.ry = +s.ry || 0; P.pitch = clamp(+s.p || 0, -1.5, 1.5);
    P.f = (s.f | 0) & ~(F.DEAD | F.PASSIVE) | (P.passive ? F.PASSIVE : 0);
    if (P.guns.has(s.w | 0)) P.w = s.w | 0;
  }

  action(id, a) {
    const P = this.players.get(id); if (!P || !a || typeof a.k !== 'string') return;
    if (a.k === 'heist') return heistAction(this, P, a);
    if (a.k === 'admin') return P.own ? this.admin(P, a) : null;
    if (P.dead) return;
    const C = this.city;
    switch (a.k) {
      case 'enter': return this.enter(P, a.v | 0);
      case 'exit': return this.leaveVeh(P);
      case 'shot': {
        if (this.time - P.shotT < 0.03) return;
        const W = WEAPONS[P.w]; if (!W || W.melee) return;
        this.emit({ e: 'shot', by: P.id, w: P.w, x0: r2(+a.x || P.x), y0: r2(+a.y || 1.4), z0: r2(+a.z || P.z), tx: r2(+a.tx || 0), ty: r2(+a.ty || 0), tz: r2(+a.tz || 0) }, P.x, P.z);
        if (this.time - P.shotT > 0.4) { this.noise(P.x, P.z, P); this.crime(P, CRIME.SHOT); }
        P.shotT = this.time; return;
      }
      case 'hit': {
        const W = WEAPONS[P.w]; if (!W) return;
        const n = clamp(a.n | 0 || 1, 1, W.pellets || 1), cost = n / (W.rate * (W.pellets || 1) * 1.35);
        if (P.budget < cost) return; P.budget -= cost;
        const dmg = W.dmg * n, max = W.range * 1.25 + 3;
        if (a.tt === 'n') { const N = this.peds.get(a.id | 0); if (N && N.st !== PS.DEAD && Math.hypot(N.x - P.x, N.z - P.z) < max) this.hurtPed(N, dmg * (a.hs ? 2 : 1), P, W.melee); }
        else if (a.tt === 'v') { const V = this.vehicles.get(a.id | 0); if (V && Math.hypot(V.x - P.x, V.z - P.z) < max + 4) this.hurtVeh(V, dmg * (W.melee ? 0.6 : 1.5), P); }
        else if (a.tt === 'p') { const Q = this.players.get(a.id | 0); if (Q && Q !== P && !Q.dead && !Q.passive && !P.passive && !(P.crew && P.crew === Q.crew) && Math.hypot(Q.x - P.x, Q.z - P.z) < max) this.hurt(Q, dmg * (a.hs ? 1.5 : 1), P); }
        return;
      }
      case 'ram': {
        const V = this.vehicles.get(P.veh), N = this.peds.get(a.n | 0), sp = clamp(+a.sp || 0, 0, 90);
        if (!V || V.drv !== P.id) return;
        if (a.p) { const Q = this.players.get(a.p | 0); if (Q && Q !== P && !Q.dead && !Q.veh && !Q.passive && !P.passive && !(P.crew && P.crew === Q.crew) && Math.hypot(Q.x - V.x, Q.z - V.z) < 8 && sp > 5) this.hurt(Q, sp * 5, P); return; }
        if (!N || N.st === PS.DEAD || Math.hypot(N.x - V.x, N.z - V.z) > 8) return;
        if (sp > 4) this.hurtPed(N, sp * 9, P, false); else this.scare(N, V.x, V.z);
        return;
      }
      case 'bump': {
        const V = this.vehicles.get(P.veh), T = this.vehicles.get(a.v | 0);
        if (!V || V.drv !== P.id || !T || T.drv || T.fl & VF.WRECK || T.heli || Math.hypot(T.x - V.x, T.z - V.z) > 10) return;
        const ix = clamp(+a.ix || 0, -26, 26), iz = clamp(+a.iz || 0, -26, 26), m = Math.hypot(ix, iz);
        if (m < 1.5) return;
        T.kn = { vx: ix, vz: iz, t: 0.4 + m * 0.03, spin: clamp(+a.sn || 0, -3, 3) }; T.fl &= ~VF.PARKED; T.touched = true;
        this.hurtVeh(T, m * 16, P);
        if (T.cop) this.crime(P, CRIME.RAM_COP, 1);
        else if (T.npc) { if (this.R.chance(0.3)) this.bail(T, V.x, V.z); else { T.fl |= VF.PANIC; T.ai.panic = 7; } }
        return;
      }
      case 'vdmg': { const V = this.vehicles.get(P.veh); if (V && V.drv === P.id) this.hurtVeh(V, clamp(+a.d || 0, 0, 300), null); return; }
      case 'look': P.look = clamp(a.n | 0, 0, 31); this.emit({ e: 'look', id: P.id, look: P.look }); return;
      case 'passive': P.passive = !P.passive && !P.heat && !P.crew; P.dirty = true; return;
      case 'buy': return this.buy(P, String(a.it || ''));
      case 'snack': { const m = C.marker[a.m]; if (m && m.kind === 'snack' && this.near(P, m, 2) && P.cash >= SNACK.price && P.hp < PLAYER.HP) { this.pay(P, -SNACK.price, 'Snack'); P.hp = Math.min(PLAYER.HP, P.hp + SNACK.heal); } return; }
      case 'rest': { const m = C.marker['home:bed']; if (this.near(P, m, 2) && !P.heat) { P.hp = PLAYER.HP; P.dirty = true; this.tell(P, { e: 'toast', text: 'Rested. Health full.' }); } return; }
      case 'rob': {
        const m = C.marker[a.m]; if (!m || m.kind !== 'rob' || !this.near(P, m, 2.5) || P.w < 2) return;
        if (this.time < (this.cool.get(m.id) || 0)) return this.tell(P, { e: 'toast', text: 'The register is empty. Come back later.' });
        if (a.p === 'start') { P.rob = { m: m.id, t: this.time }; this.cower(m.poi); this.crime(P, CRIME.ROB * 0.3, 1, true); return; }
        if (a.p !== 'done' || !P.rob || P.rob.m !== m.id || this.time - P.rob.t < m.secs * 0.85) return;
        P.rob = null; this.cool.set(m.id, this.time + 300);
        this.pay(P, this.R.int(350, 900), 'Register'); this.crime(P, CRIME.ROB, 2, true);
        return;
      }
      case 'respray': {
        const V = this.vehicles.get(P.veh); if (!V || V.drv !== P.id) return;
        const m = C.markers.find((q) => q.kind === 'respray' && this.near(V, q, 1)); if (!m) return;
        if (P.cash < 500) return this.tell(P, { e: 'toast', text: 'A respray costs $500.' });
        if (P.heat && P.seenT < 2) return this.tell(P, { e: 'toast', text: 'The cops can see you. Lose them first.' });
        this.pay(P, -500, 'Respray'); V.hp = VEHICLES[V.k].hp; V.fl &= ~VF.FIRE; V.fireT = 0;
        if (V.col >= 0) V.col = (V.col + 1 + this.R.int(0, CAR_COLORS.length - 2)) % CAR_COLORS.length;
        if (P.heat) this.clearHeat(P, 'Fresh paint. The cops lost you.');
        return;
      }
      case 'garage': {
        const k = a.c | 0; if (!P.cars.has(k)) return;
        const m = C.marker['home:garage'];
        if (a.call) { if (this.time < P.callT) return this.tell(P, { e: 'toast', text: 'Your car is still on its way.' }); P.callT = this.time + 30; const s = this.roadPoint(P.x, P.z, 14, 30); return s && this.personal(P, k, s.x, s.z, s.ry); }
        if (this.near(P, m, 6)) this.personal(P, k, m.x, m.z, m.ry);
        return;
      }
    }
  }

  near(P, m, pad = 0) { return Math.hypot(P.x - m.x, P.z - m.z) < m.r + pad; }
  personal(P, k, x, z, ry) {
    const old = this.vehicles.get(P.car); if (old && !old.drv && !old.pass.length) this.vehicles.delete(old.id);
    const V = this.makeVeh(k, x, z, ry, { fl: VF.OWNED | VF.PARKED }); V.own = P.id; V.touched = true; P.car = V.id; P.dirty = true;
    this.tell(P, { e: 'toast', text: VEHICLES[k].name + ' is ready.' });
    return V;
  }
  buy(P, it) {
    const C = this.city, n = +it.slice(1) | 0;
    if (it[0] === 'c') {
      const K = VEHICLES[n]; if (!K || !K.price || P.cars.has(n) || !this.near(P, C.marker['dealer:desk'], 3)) return;
      if (P.cash < K.price) return this.tell(P, { e: 'toast', text: 'Not enough cash.' });
      this.pay(P, -K.price, K.name); P.cars.add(n);
      const d = C.poi.dealer.deliver; this.personal(P, n, d.x, d.z, d.ry); this.tell(P, { e: 'bought', it });
      return;
    }
    if (!C.markers.some((m) => m.kind === 'guns' && this.near(P, m, 3))) return;
    if (it === 'armor') { if (P.armor >= PLAYER.ARMOR || P.cash < ARMOR_PRICE) return; this.pay(P, -ARMOR_PRICE, 'Body armor'); P.armor = PLAYER.ARMOR; return this.tell(P, { e: 'bought', it }); }
    const W = WEAPONS[n]; if (!W || !n) return;
    if (it[0] === 'w') { if (P.guns.has(n) || P.cash < W.price) return; this.pay(P, -W.price, W.name); P.guns.add(n); this.tell(P, { e: 'bought', it }); }
    else if (it[0] === 'a') { if (!P.guns.has(n) || !W.ammoPrice || P.cash < W.ammoPrice) return; this.pay(P, -W.ammoPrice, 'Ammo'); this.tell(P, { e: 'bought', it }); }
  }
  admin(P, a) {
    if (a.c === 'cash') this.pay(P, clamp(+a.n || 100000, -1e7, 1e7), 'Owner');
    else if (a.c === 'heat') { if (a.n > 0) this.crime(P, 0, clamp(a.n | 0, 1, 5), true); else this.clearHeat(P, 'Heat cleared.'); }
    else if (a.c === 'heal') { P.hp = PLAYER.HP; P.armor = PLAYER.ARMOR; P.dirty = true; }
    else if (a.c === 'god') { P.god = !P.god; this.tell(P, { e: 'toast', text: 'God mode ' + (P.god ? 'on' : 'off') }); }
    else if (a.c === 'car') { const k = clamp(a.n | 0, 0, VEHICLES.length - 2); const s = this.roadPoint(P.x, P.z, 6, 14) || P; this.personal(P, k, s.x, s.z, s.ry || 0); }
    else if (a.c === 'time') this.clock = clamp(+a.n || 0, 0, 1) * DAY;
    else if (a.c === 'tp') { P.x = +a.x || 0; P.z = +a.z || 0; this.tell(P, { e: 'tp', x: P.x, z: P.z, ry: P.ry }); }
    else if (a.c === 'guns') { for (let w = 1; w < WEAPONS.length; w++) P.guns.add(w); P.dirty = true; this.tell(P, { e: 'bought', it: 'all' }); }
  }

  // ------------------------------------------------------------------ vehicles
  makeVeh(k, x, z, ry, o = {}) {
    const K = VEHICLES[k];
    const V = { id: this.nid++, k, x, z, ry, y: 0, sp: 0, st: 0, hp: K.hp, col: K.fixed !== undefined ? -1 : (o.col ?? this.R.int(0, CAR_COLORS.length - 1)), fl: o.fl || 0, drv: 0, pass: [], npc: false, ai: null, cop: null, heli: null, kn: null, spot: -1, touched: false, own: 0, fireT: 0, by: 0, idle: 0, goneAt: 0, mission: null };
    this.vehicles.set(V.id, V);
    return V;
  }
  spawnDisplay(d) { const V = this.makeVeh(d.kind, d.x, d.z, d.ry, { fl: VF.PARKED }); V.display = d; return V; }
  enter(P, vid) {
    const V = this.vehicles.get(vid); if (!V || P.veh || V.fl & VF.WRECK || V.heli || Math.hypot(V.x - P.x, V.z - P.z) > 6) return;
    if (V.fl & VF.LOCK) return this.tell(P, { e: 'toast', text: 'Locked.' });
    const K = VEHICLES[V.k];
    if (V.drv) { if (V.pass.length + 1 >= K.seats) return; V.pass.push(P.id); P.veh = V.id; P.seat = V.pass.length; P.dirty = true; return; }
    if (V.cop && V.cop.crew > 0) { this.deploy(V, P); this.crime(P, CRIME.COP_HIT, 2, true); }
    else if (V.npc) { this.bail(V, P.x, P.z); this.crime(P, CRIME.JACK, 1); }
    else if (V.display) { this.crime(P, CRIME.ROB, 2, true); (this.respawnDisplay ||= []).push({ d: V.display, at: this.time + 240 }); V.display = null; }
    else if (!V.touched && !V.own) this.crime(P, CRIME.STEAL);
    V.drv = P.id; V.npc = false; V.ai = null; V.cop = null; V.kn = null; V.fl &= ~(VF.PARKED | VF.PANIC | VF.SIREN); V.touched = true; V.idle = 0;
    P.veh = V.id; P.seat = 0; P.dirty = true;
  }
  leaveVeh(P) {
    const V = this.vehicles.get(P.veh); P.veh = 0; P.seat = 0; P.dirty = true;
    if (!V) return;
    if (V.drv === P.id) V.drv = 0; else V.pass = V.pass.filter((id) => id !== P.id);
  }
  /** The driver jumps out and runs. */
  bail(V, fx, fz) {
    if (!V.npc) return;
    const rx = Math.cos(V.ry), rz = -Math.sin(V.ry);
    const N = this.makePed(ROLE.CIV, V.x + rx * 1.7, V.z + rz * 1.7, V.ry); this.scare(N, fx, fz, true);
    V.npc = false; V.ai = null; V.fl &= ~VF.PANIC; V.touched = true;
  }
  hurtVeh(V, dmg, by) {
    if (V.fl & VF.WRECK || dmg <= 0) return;
    V.hp -= dmg; V.touched = true;
    if (by && V.cop) this.crime(by, CRIME.COP_HIT * 0.4, 2, true);
    else if (by && V.npc && !(V.fl & VF.PANIC)) { V.fl |= VF.PANIC; V.ai.panic = 7; }
    if (V.hp <= 0 && !V.fireT) { V.hp = 0; V.fl |= VF.FIRE; V.fireT = this.time + 3.2; V.by = by ? by.id : 0; }
  }
  explode(V) {
    V.fl = (V.fl | VF.WRECK) & ~(VF.FIRE | VF.SIREN | VF.PANIC); V.fireT = 0; V.goneAt = this.time + 40; V.sp = 0; V.kn = null; V.npc = false; V.ai = null; V.cop = null;
    this.emit({ e: 'boom', id: V.id }, V.x, V.z);
    const by = this.players.get(V.by) || null;
    for (const id of [V.drv, ...V.pass]) { const Q = this.players.get(id); if (Q) this.hurt(Q, 999, by); }
    V.drv = 0; V.pass = [];
    for (const N of this.peds.values()) { const d = Math.hypot(N.x - V.x, N.z - V.z); if (d < 9 && N.st !== PS.DEAD) this.hurtPed(N, 150 * (1 - d / 9), by, false); }
    for (const Q of this.players.values()) { const d = Math.hypot(Q.x - V.x, Q.z - V.z); if (d < 9 && !Q.dead && !Q.veh) this.hurt(Q, 115 * (1 - d / 9), by); }
    for (const O of this.vehicles.values()) { const d = Math.hypot(O.x - V.x, O.z - V.z); if (O !== V && d < 8) this.hurtVeh(O, 650 * (1 - d / 8), by); }
  }
  /** Something in the way ahead? Returns distance to it and its speed, or null. */
  ahead(V, fx, fz, range, hw, people, skip) {
    let best = range, bsp = 0, found = false;
    for (const O of this.vehicles.values()) {
      if (O === V || O.id === skip || O.heli) continue;
      const rx = O.x - V.x, rz = O.z - V.z; if (Math.abs(rx) > range + 4 || Math.abs(rz) > range + 4) continue;
      const f = rx * fx + rz * fz - 2.4; if (f < 0.4 || f > best) continue;
      if (Math.abs(-rx * fz + rz * fx) > hw + 0.95) continue;
      best = f; found = true; bsp = Math.max(0, O.sp * (Math.sin(O.ry) * fx + Math.cos(O.ry) * fz));
    }
    if (people) {
      const chk = (x, z) => { const rx = x - V.x, rz = z - V.z; if (Math.abs(rx) > range || Math.abs(rz) > range) return; const f = rx * fx + rz * fz - 2; if (f < 0.2 || f > best) return; if (Math.abs(-rx * fz + rz * fx) > hw) return; best = f; bsp = 0; found = true; };
      for (const N of this.peds.values()) if (N.st !== PS.DEAD) chk(N.x, N.z);
      for (const Q of this.players.values()) if (!Q.veh && !Q.dead && Q.id !== skip) chk(Q.x, Q.z);
    }
    return found ? { f: best, sp: bsp } : null;
  }
  randNext(b, a) { const n = this.city.adj[b]; if (n.length < 2) return n[0]; for (;;) { const q = n[this.R.int(0, n.length - 1)]; if (q !== a) return q; } }
  steerTo(V, dt, tx, tz, want, bold, skip) {
    const diff = angWrap(Math.atan2(tx - V.x, tz - V.z) - V.ry), rate = Math.max(1.4, Math.abs(V.sp)) / (bold ? 4.2 : 5.5);
    V.ry = angWrap(V.ry + clamp(diff, -rate * dt, rate * dt)); V.st = clamp(diff * 1.4, -1, 1);
    if (Math.abs(diff) > 0.5) want = Math.min(want, bold ? 11 : 5.5);
    const fx = Math.sin(V.ry), fz = Math.cos(V.ry), ai = V.ai;
    const ob = this.ahead(V, fx, fz, 7 + Math.abs(V.sp) * 1.15, bold || (ai && ai.pass > 0) ? 1.05 : 1.6, !(V.fl & VF.PANIC), skip);
    let blocked = false;
    if (ob) { if (ob.f < 3.5 + Math.abs(V.sp) * 0.5) { want = Math.min(want, ob.sp); blocked = ob.sp < 1; } else want = Math.min(want, ob.sp + 2); }
    if (ai) { ai.block = blocked ? ai.block + dt : Math.max(0, ai.block - dt * 2); if (ai.block > (bold ? 1 : 6) && ai.pass <= 0) { ai.pass = 5; ai.block = 0; } if (ai.pass > 0) ai.pass -= dt; }
    V.sp += clamp(want - V.sp, -16 * dt, VEHICLES[V.k].acc * 0.6 * dt);
    V.x += fx * V.sp * dt; V.z += fz * V.sp * dt;
  }
  laneDrive(V, dt, cruise, route, bold, skip) {
    const C = this.city, ai = V.ai; let L = C.lane(ai.a, ai.b);
    let s = (V.x - L.ax) * L.dx + (V.z - L.az) * L.dz;
    if (s > L.len - L.m1 - 1.5) { const nx = route ? route(ai.b, ai.a) : this.randNext(ai.b, ai.a); ai.a = ai.b; ai.b = nx; L = C.lane(ai.a, ai.b); s = (V.x - L.ax) * L.dx + (V.z - L.az) * L.dz; }
    const off = L.off - (ai.pass > 0 ? 3.1 : 0), st = clamp(Math.max(s + 6 + Math.abs(V.sp) * 0.55, L.m0 + 3), 0, L.len);
    if (s > L.len - L.m1 - 14) cruise = Math.min(cruise, bold ? 20 : 8.5);
    this.steerTo(V, dt, L.ax + L.dx * st + L.rx * off, L.az + L.dz * st + L.rz * off, cruise, bold, skip);
  }
  /** Put a driverless-AI car back on the nearest road, facing the way it already points. */
  rejoin(V) {
    const C = this.city, e = C.nearestEdge(V.x, V.z), L = C.lane(e[0], e[1]);
    const fwd = Math.sin(V.ry) * L.dx + Math.cos(V.ry) * L.dz >= 0;
    V.ai = { a: fwd ? e[0] : e[1], b: fwd ? e[1] : e[0], block: 0, pass: 0, panic: 0, cruise: this.R.range(10, 14) };
  }
  traffic(V, dt) {
    const ai = V.ai; let cruise = ai.cruise;
    if (ai.panic > 0) { ai.panic -= dt; cruise *= 1.9; if (ai.panic <= 0) V.fl &= ~VF.PANIC; }
    this.laneDrive(V, dt, cruise, null, false, 0);
  }
  knocked(V, dt) {
    const k = V.kn, o = this._o;
    V.x += k.vx * dt; V.z += k.vz * dt; V.ry += k.spin * dt; k.vx *= 1 - 3.2 * dt; k.vz *= 1 - 3.2 * dt; k.spin *= 1 - 3 * dt; k.t -= dt; V.sp *= 1 - 3 * dt;
    if (this.city.collide(V.x, V.z, 1.2, o, this.gates)) { V.x = o.x; V.z = o.z; k.vx *= 0.3; k.vz *= 0.3; }
    if (k.t <= 0) { V.kn = null; if (V.npc) this.rejoin(V); else if (V.cop && V.cop.crew) V.ai = null; else V.sp = 0; }
  }

  // ------------------------------------------------------------------ police
  spawnCop(P) {
    const C = this.city, R = this.R;
    for (let tries = 0; tries < 8; tries++) {
      const sp = Math.hypot(P.vx, P.vz), a = sp > 8 && tries < 5 ? Math.atan2(P.vx, P.vz) + R.range(-0.5, 0.5) : R() * 6.283, r = R.range(130, 200) + (sp > 8 ? sp * 2 : 0), s = this.roadPoint(P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, 0, 0, P);
      if (!s || Math.hypot(s.x - P.x, s.z - P.z) < 95) continue;
      const riot = P.heat >= 4 && R.chance(0.45);
      const V = this.makeVeh(riot ? VK.riot : VK.cop, s.x, s.z, s.ry, { fl: VF.SIREN | VF.COP });
      V.npc = true; V.touched = true; V.ai = { a: s.a, b: s.b, block: 0, pass: 0, panic: 0, cruise: 26 };
      V.cop = { tgt: P.id, crew: riot ? 4 : 2, mode: 'road', lx: P.x, lz: P.z, t: 0, vis: false, stuck: 0, rev: 0, revDir: 1, ramAt: 0, lv: P.heat, wait: 0 };
      V.sp = 14;
      return V;
    }
    return null;
  }
  spawnHeli(P) {
    const a = this.R() * 6.283, V = this.makeVeh(VK.heli, P.x + Math.sin(a) * 220, P.z + Math.cos(a) * 220, 0, { fl: VF.SIREN | VF.COP });
    V.y = 36; V.touched = true; V.heli = { tgt: P.id, ang: a, cool: 2 }; V.cop = { tgt: P.id, crew: 0, heli: true };
    return V;
  }
  copTick() {
    let cars = 0; for (const V of this.vehicles.values()) if (V.cop && !V.heli && !(V.fl & VF.WRECK)) cars++;
    for (const P of this.players.values()) {
      if (!P.heat || P.dead) continue;
      let mine = 0, heli = false;
      for (const V of this.vehicles.values()) if (V.cop && V.cop.tgt === P.id && !(V.fl & VF.WRECK)) { if (V.heli) heli = true; else mine++; }
      if (mine < HEAT.UNITS[P.heat] && cars < HEAT.CAP && this.time > P.copAt) { if (this.spawnCop(P)) { P.copAt = this.time + (mine ? 6 : 2.5); cars++; } }
      if (P.heat >= 5 && !heli && this.time > P.heliAt) { this.spawnHeli(P); P.heliAt = this.time + 45; }
    }
  }
  deploy(V, P) {
    const c = V.cop, swat = V.k === VK.riot, lv = Math.max(1, P.heat), rx = Math.cos(V.ry), rz = -Math.sin(V.ry), fx = Math.sin(V.ry), fz = Math.cos(V.ry), o = this._o;
    for (let k = 0; k < c.crew; k++) {
      const s = k % 2 ? 1 : -1, f = k < 2 ? 0.6 : -1.3;
      this.city.collide(V.x + rx * s * 1.7 + fx * f, V.z + rz * s * 1.7 + fz * f, PED.R, o, this.gates);
      const N = this.makePed(swat ? ROLE.SWAT : ROLE.COP, o.x, o.z, V.ry, { w: swat ? 5 : lv >= 3 ? 3 : 2 });
      N.hp = HEAT.COP_HP[lv] * (swat ? 1.3 : 1); N.tgt = P.id; N.car = V.id; N.dmg = HEAT.COP_DMG[lv]; N.aim = 0.8 + lv * 0.06;
    }
    c.out = c.crew; c.crew = 0; c.mode = 'deploy'; V.sp = 0; V.ai = null;
  }
  recall(V) {
    const c = V.cop;
    for (const N of this.peds.values()) if (N.car === V.id && N.st !== PS.DEAD && Math.hypot(N.x - V.x, N.z - V.z) < 30) { this.peds.delete(N.id); c.crew++; }
    if (c.crew > 0) { c.mode = 'road'; c.wait = 1.2; }
    else { V.cop = null; V.npc = false; V.fl &= ~VF.SIREN; }       // nobody came back: an empty patrol car
  }
  copCar(V, dt) {
    const c = V.cop, C = this.city, o = this._o; let P = this.players.get(c.tgt);
    if (!P || P.dead || !P.heat) {
      P = null; for (const Q of this.players.values()) if (Q.heat && !Q.dead && Math.hypot(Q.x - V.x, Q.z - V.z) < 220) { P = Q; c.tgt = Q.id; break; }
      if (!P) { if (c.mode === 'deploy') this.recall(V); if (V.cop) { V.cop = null; V.fl &= ~VF.SIREN; this.rejoin(V); V.leave = true; } return; }
    }
    const dist = Math.hypot(P.x - V.x, P.z - V.z);
    if (c.mode === 'deploy') { V.sp = 0; if (dist > 55 || (P.veh && dist > 24)) this.recall(V); return; }
    if (c.wait > 0) { c.wait -= dt; return; }
    c.t -= dt; if (c.t <= 0) { c.t = 0.3; c.vis = dist < 95 && C.los(V.x, V.z, P.x, P.z, this.gates); if (c.vis) { c.lx = P.x; c.lz = P.z; } }
    if (c.rev > 0) {
      c.rev -= dt; V.sp = -6; V.ry += c.revDir * 1.2 * dt; V.x += Math.sin(V.ry) * V.sp * dt; V.z += Math.cos(V.ry) * V.sp * dt;
      if (C.collide(V.x, V.z, 1.2, o, this.gates)) { V.x = o.x; V.z = o.z; }
      return;
    }
    if ((c.vis && dist < 85) || dist < 20) {
      if (!P.veh && dist < 15) { if (Math.abs(V.sp) < 8) return this.deploy(V, P); V.sp *= 1 - 4 * dt; }
      let want = Math.min(VEHICLES[V.k].top, 12 + dist * 1.1); if (!P.veh && dist < 34) want = Math.min(want, 9);
      const lead = clamp(dist / 40, 0, 0.8);
      V.ai = null;
      this.steerTo(V, dt, P.x + P.vx * lead, P.z + P.vz * lead, want, true, P.veh || P.id);
      if (C.collide(V.x, V.z, 1.25, o, this.gates)) { V.x = o.x; V.z = o.z; V.sp *= 1 - 5 * dt; }
      c.stuck = Math.abs(V.sp) < 1.6 && dist > 7 ? c.stuck + dt : 0;
      if (c.stuck > 1.1) { c.rev = 1.2; c.revDir = this.R.chance(0.5) ? 1 : -1; c.stuck = 0; }
      if (P.veh && dist < 3.7 && this.time > c.ramAt) {
        const PV = this.vehicles.get(P.veh);
        if (PV) { this.hurtVeh(PV, Math.min(110, 30 + Math.abs(V.sp) * 3), null); c.ramAt = this.time + 1.4; this.tell(P, { e: 'rammed', x: r2(V.x), z: r2(V.z), sp: r2(V.sp) }); V.sp *= 0.5; }
      }
    } else {
      if (!V.ai) this.rejoin(V);
      const goal = C.nearestNode(c.lx, c.lz);
      c.guess = (c.guess || 0) - dt; if (c.guess <= 0 && !c.vis) { c.guess = 7; const e = 90 - P.heat * 12; c.lx = P.x + this.R.range(-e, e); c.lz = P.z + this.R.range(-e, e); }
      this.laneDrive(V, dt, P.heat >= 3 ? 40 : 33, (b, a) => { const h = C.nextHop(b, goal); return h === b || h < 0 ? this.randNext(b, a) : h; }, true, 0);
    }
  }
  heliAI(V, dt) {
    const h = V.heli, P = this.players.get(h.tgt);
    if (!P || P.dead || !P.heat) { V.x += Math.sin(h.ang) * 30 * dt; V.z += Math.cos(h.ang) * 30 * dt; V.y += 3 * dt; V.fl &= ~VF.SIREN; if (V.y > 90) this.vehicles.delete(V.id); return; }
    h.ang += dt * 0.35;
    const tx = P.x + Math.sin(h.ang) * 26, tz = P.z + Math.cos(h.ang) * 26, dx = tx - V.x, dz = tz - V.z, d = Math.hypot(dx, dz) || 1, sp = Math.min(VEHICLES[V.k].top, d * 1.5);
    V.x += (dx / d) * sp * dt; V.z += (dz / d) * sp * dt; V.sp = sp; V.ry = Math.atan2(P.x - V.x, P.z - V.z);
    h.cool -= dt;
    const dist = Math.hypot(P.x - V.x, P.z - V.z);
    if (h.cool <= 0 && dist < 60 && this.heliSees(V, P)) {
      h.cool = 1.3; const hit = this.R.chance(P.veh ? 0.14 : 0.2);
      this.emit({ e: 'shot', by: -V.id, w: 5, x0: r2(V.x), y0: r2(V.y - 1), z0: r2(V.z), tx: r2(P.x + (hit ? 0 : this.R.range(-2, 2))), ty: hit ? 1 : 0, tz: r2(P.z + (hit ? 0 : this.R.range(-2, 2))) }, P.x, P.z);
      if (hit) { const PV = this.vehicles.get(P.veh); if (PV) this.hurtVeh(PV, 40, null); else this.hurt(P, 10, null); }
    }
  }
  heliSees(V, P) {
    if (this.city.insidePoi(P.x, P.z)) return false;
    const dx = P.x - V.x, dy = 1.2 - V.y, dz = P.z - V.z, d = Math.hypot(dx, dy, dz);
    return this.city.ray(V.x, V.y, V.z, dx / d, dy / d, dz / d, d, this.gates) >= d - 1.5;
  }
  heatTick(dt) {
    const C = this.city;
    for (const P of this.players.values()) {
      if (!P.heat) { if (P.pts > 0) P.pts = Math.max(0, P.pts - 1.5 * dt); continue; }
      if (P.dead) continue;
      let seen = false;
      for (const V of this.vehicles.values()) {
        if (!V.cop || V.fl & VF.WRECK) continue;
        const d = Math.hypot(V.x - P.x, V.z - P.z);
        if (V.heli ? d < HEAT.SEE_HELI && this.heliSees(V, P) : V.cop.crew > 0 && d < HEAT.SEE && C.los(V.x, V.z, P.x, P.z, this.gates)) { seen = true; break; }
      }
      if (!seen) for (const N of this.peds.values()) if ((N.role === ROLE.COP || N.role === ROLE.SWAT) && N.st !== PS.DEAD) { const d = Math.hypot(N.x - P.x, N.z - P.z); if (d < HEAT.SEE && C.los(N.x, N.z, P.x, P.z, this.gates)) { seen = true; break; } }
      if (seen) { P.seenT = 0; P.seenX = P.x; P.seenZ = P.z; } else P.seenT += dt;
      P.esc = clamp(P.seenT / HEAT.HIDE[P.heat], 0, 1);
      if (P.seenT > HEAT.HIDE[P.heat]) this.clearHeat(P, 'You lost the cops.');
    }
  }
  clearHeat(P, text) { P.heat = 0; P.pts = 0; P.esc = 0; P.seenT = 99; P.kills = 0; P.dirty = true; this.tell(P, { e: 'heat', lv: 0, text }); }
  witness(x, z, P) {
    for (const N of this.peds.values()) if (N.st !== PS.DEAD && (N.x - x) ** 2 + (N.z - z) ** 2 < 2025) return true;
    for (const Q of this.players.values()) if (Q !== P && (Q.x - x) ** 2 + (Q.z - z) ** 2 < 2025) return true;
    for (const V of this.vehicles.values()) if ((V.npc || V.cop) && (V.x - x) ** 2 + (V.z - z) ** 2 < 2025) return true;
    return false;
  }
  /** A crime: adds points, and min forces at least that heat level. sure = someone definitely saw it. */
  crime(P, pts, min = 0, sure = false) {
    if (!P || P.dead || P.god) return;
    if (!sure && !P.heat && !this.witness(P.x, P.z, P)) { pts *= 0.25; min = 0; }
    P.pts += pts; P.passive = false;
    let lv = P.heat; while (lv < HEAT.MAX && P.pts >= HEAT.LEVEL[lv + 1]) lv++;
    lv = Math.max(lv, min);
    if (lv > P.heat) { P.heat = lv; P.pts = Math.max(P.pts, HEAT.LEVEL[lv]); P.seenT = 0; P.seenX = P.x; P.seenZ = P.z; P.esc = 0; P.dirty = true; this.tell(P, { e: 'heat', lv }); }
  }
  bust(P) {
    const fine = Math.min(800, Math.floor(P.cash * 0.1)), s = this.city.poi.police;
    if (fine) this.pay(P, -fine, 'Fine');
    this.clearHeat(P); P.x = s.out[0]; P.z = s.out[1]; P.bustT = 0; heistLeave(this, P);
    this.tell(P, { e: 'tp', x: P.x, z: P.z, ry: s.ry, why: 'busted', fine });
    this.emit({ e: 'feed', text: P.name + ' got busted', c: 'blue' });
  }

  // ------------------------------------------------------------------ people on foot
  makePed(role, x, z, ry, o = {}) {
    const N = { id: this.nid++, look: o.look ?? this.R.int(0, 15), role, x, z, ry, st: PS.WALK, hp: PED.HP, w: o.w || 0, tgt: 0, pa: -1, pb: -1, spd: this.R.range(1.2, 1.8), fleeT: 0, cowT: 0, fightT: 0, fx: 0, fz: 0, cool: 1, aim: 1, dmg: 9, car: 0, heist: null, home: null, goneAt: 0, side: 0, sideDir: 1, stk: 0, vis: false, vt: 0, port: 0, leaveT: 0 };
    this.peds.set(N.id, N);
    return N;
  }
  scare(N, fx, fz, run) {
    if (N.st === PS.DEAD || N.role === ROLE.COP || N.role === ROLE.SWAT || N.role === ROLE.GUARD) return;
    N.fx = fx; N.fz = fz;
    if (N.role === ROLE.CLERK || (!run && this.R.chance(0.35))) N.cowT = N.role === ROLE.CLERK ? 20 : this.R.range(3, 6); else N.fleeT = this.R.range(7, 11);
  }
  cower(poiId) { for (const [k, id] of this.staffPed) { const N = this.peds.get(id); if (N && this.city.staff[k].poi === poiId) this.scare(N, N.x, N.z); } }
  /** Gunfire or a crash: people nearby react. */
  noise(x, z, P) {
    for (const N of this.peds.values()) {
      const d = (N.x - x) ** 2 + (N.z - z) ** 2;
      if (N.role === ROLE.GUARD) { if (d < 2025 && N.heist && !N.tgt && P) guardAlert(this, N, P); } else if (d < 1500 && !N.fleeT && !N.cowT) this.scare(N, x, z);
    }
    for (const V of this.vehicles.values()) if (V.npc && !V.cop && (V.x - x) ** 2 + (V.z - z) ** 2 < 1300 && !(V.fl & VF.PANIC)) { V.fl |= VF.PANIC; V.ai.panic = 6; }
  }
  hurtPed(N, dmg, by, melee) {
    if (N.st === PS.DEAD) return;
    N.hp -= dmg;
    const cop = N.role === ROLE.COP || N.role === ROLE.SWAT;
    if (N.hp <= 0) {
      N.st = PS.DEAD; N.goneAt = this.time + 30; N.tgt = 0;
      this.emit({ e: 'pdie', id: N.id }, N.x, N.z);
      if (N.role === ROLE.CIV || N.role === ROLE.CLERK) this.drop(N.x, N.z, this.R.int(PED.CASH[0], PED.CASH[1]));
      else this.drop(N.x, N.z, this.R.int(40, 160));
      if (by) {
        if (this.time - by.killT > 40) by.kills = 0; by.kills++; by.killT = this.time;
        if (cop) this.crime(by, CRIME.COP_KILL, 3, true);
        else if (N.role === ROLE.GUARD) this.crime(by, CRIME.KILL, 0);
        else this.crime(by, CRIME.KILL, by.kills >= 4 ? 2 : 1);
        this.noise(N.x, N.z, by);
      }
      return;
    }
    if (!by) return;
    if (cop) { N.tgt = by.id; this.crime(by, CRIME.COP_HIT, 2, true); }
    else if (N.role === ROLE.GUARD) guardAlert(this, N, by);
    else { this.crime(by, CRIME.HIT); if (melee && N.role === ROLE.CIV && this.R.chance(0.3)) { N.fightT = 9; N.tgt = by.id; N.fleeT = 0; } else this.scare(N, by.x, by.z, true); }
  }
  hurt(Q, dmg, by) {
    if (Q.dead || Q.god || dmg <= 0) return;
    if (Q.armor > 0) { const a = Math.min(Q.armor, dmg * 0.8); Q.armor -= a; dmg -= a; }
    Q.hp -= dmg; Q.dirty = true; Q.hurtAt = this.time;
    this.tell(Q, { e: 'hurt', n: Math.round(dmg), x: by ? r2(by.x) : null, z: by ? r2(by.z) : null });
    if (by && by !== Q) this.crime(by, CRIME.HIT);
    if (Q.hp > 0) return;
    Q.hp = 0; Q.dead = true; Q.f |= F.DEAD; Q.respawnAt = this.time + PLAYER.RESPAWN; Q.heat = 0; Q.pts = 0; Q.esc = 0; Q.rob = null;
    this.leaveVeh(Q);
    const bill = Math.min(PLAYER.BILL_MAX, Math.floor(Q.cash * PLAYER.BILL)); if (bill) this.pay(Q, -bill, 'Hospital bill');
    this.emit({ e: 'feed', text: by && by !== Q ? by.name + ' took out ' + Q.name : Q.name + ' got wasted', c: 'red' });
    this.tell(Q, { e: 'wasted', by: by ? by.name : null });
    if (by && by !== Q) this.crime(by, CRIME.PVP, 1);
  }
  respawn(P) {
    let best = this.city.respawns[0], bd = Infinity;
    for (const r of this.city.respawns) { const d = Math.hypot(r.x - P.x, r.z - P.z); if (d < bd) { bd = d; best = r; } }
    P.dead = false; P.f &= ~F.DEAD; P.hp = PLAYER.HP; P.x = best.x; P.z = best.z; P.ry = best.ry; P.vx = P.vz = 0; P.dirty = true;
    this.tell(P, { e: 'tp', x: best.x, z: best.z, ry: best.ry, why: 'respawn' });
  }
  drop(x, z, amt) { const k = { id: this.nid++, x, z, amt, until: this.time + 70 }; this.pickups.set(k.id, k); }
  pedMove(N, tx, tz, spd, dt) {
    let a = Math.atan2(tx - N.x, tz - N.z); const o = this._o;
    if (N.side > 0) { a += N.sideDir * 1.35; N.side -= dt; }
    N.ry = angWrap(N.ry + clamp(angWrap(a - N.ry), -9 * dt, 9 * dt));
    const hit = this.city.collide(N.x + Math.sin(a) * spd * dt, N.z + Math.cos(a) * spd * dt, PED.R, o, this.gates);
    if (!this.city.isLand(o.x, o.z)) return;
    N.x = o.x; N.z = o.z;
    if (hit && N.side <= 0) { N.stk += dt; if (N.stk > 0.45) { N.side = 0.9; N.sideDir = this.R.chance(0.5) ? 1 : -1; N.stk = 0; } } else N.stk = Math.max(0, N.stk - dt * 0.5);
  }
  /** Where to walk to reach a target that may be through a doorway. */
  navPoint(N, T) {
    const C = this.city, pn = C.insidePoi(N.x, N.z), pt = C.insidePoi(T.x, T.z);
    const via = (q, toB, key) => { const [gx, gz] = toB ? q.a : q.b, [hx, hz] = toB ? q.b : q.a; if (N.port === key || Math.hypot(N.x - gx, N.z - gz) < 1.3) { N.port = key; return [hx, hz]; } return [gx, gz]; };
    if (pn !== pt) return via((pt || pn).portal, !!pt && !pn, 1);
    if (pn) for (let k = 0; k < pn.rooms.length; k++) {
      const rm = pn.rooms[k], r = rm.rect, tin = T.x > r[0] && T.x < r[2] && T.z > r[1] && T.z < r[3], nin = N.x > r[0] && N.x < r[2] && N.z > r[1] && N.z < r[3];
      if (tin !== nin) return via(rm, tin, 2 + k);
    }
    N.port = 0;
    return [T.x, T.z];
  }
  armed(N, dt) {
    const guard = N.role === ROLE.GUARD, C = this.city;
    if (guard && !N.heist) { N.st = PS.IDLE; if (this.time > N.goneAt) this.peds.delete(N.id); return; }
    let T = this.players.get(N.tgt);
    if (guard && !T) {       // on watch: notice crew members who get close
      N.st = PS.IDLE; N.vt -= dt;
      if (N.vt <= 0) { N.vt = 0.35; for (const id of N.heist.crew) { const Q = this.players.get(id); if (Q && !Q.dead) { const d = Math.hypot(Q.x - N.x, Q.z - N.z); if (d < (Q.w >= 2 ? 22 : 13) && C.los(N.x, N.z, Q.x, Q.z, this.gates)) { guardAlert(this, N, Q); break; } } } }
      return;
    }
    if (!T || T.dead || (!guard && !T.heat)) {
      if (guard) { N.tgt = 0; const up = N.heist.crew.map((id) => this.players.get(id)).find((Q) => Q && !Q.dead); if (up) N.tgt = up.id; return; }
      T = null; for (const Q of this.players.values()) if (Q.heat && !Q.dead && Math.hypot(Q.x - N.x, Q.z - N.z) < 60) { T = Q; N.tgt = Q.id; break; }
      if (!T) { N.st = PS.IDLE; N.leaveT += dt; if (N.leaveT > 10) this.peds.delete(N.id); return; }
    }
    N.leaveT = 0;
    const dist = Math.hypot(T.x - N.x, T.z - N.z), g = NPC_GUN[N.w] || NPC_GUN[2];
    N.vt -= dt; if (N.vt <= 0) { N.vt = 0.25; N.vis = dist < 75 && C.los(N.x, N.z, T.x, T.z, this.gates); }
    if (!guard && dist > 130) { this.peds.delete(N.id); return; }
    if (!guard && T.heat === 1 && !T.veh && !(T.f & (F.AIM | F.FIRE))) {       // a simple arrest
      N.st = PS.RUN; const [wx, wz] = this.navPoint(N, T);
      if (dist > 1.8) this.pedMove(N, wx, wz, PED.RUN * 1.08, dt);
      if (dist < 2.4) { T.bustT += dt; if (T.bustT > 1.3) this.bust(T); } else if (dist > 5) T.bustT = Math.max(0, T.bustT - dt);
      return;
    }
    if (!guard && T.heat === 1 && !T.veh) this.crime(T, 0, 2, true);       // pulling a gun on a cop
    if (N.vis && dist < g.range) {
      N.st = PS.AIM; N.ry = Math.atan2(T.x - N.x, T.z - N.z);
      if (dist > 17 && !guard) this.pedMove(N, T.x, T.z, PED.RUN * 0.45, dt), N.ry = Math.atan2(T.x - N.x, T.z - N.z);
      N.cool -= dt;
      if (N.cool <= 0) {
        N.cool = g.cool * this.R.range(0.8, 1.3);
        let ch = clamp(0.52 - dist * 0.01, 0.06, 0.5) * N.aim; if (Math.hypot(T.vx, T.vz) > 5) ch *= 0.62; if (T.veh) ch *= 0.6;
        const hit = this.R.chance(ch), m = hit ? 0 : this.R.range(0.8, 2.2) * (this.R.chance(0.5) ? 1 : -1);
        this.emit({ e: 'shot', by: -N.id, w: N.w, x0: r2(N.x), y0: 1.45, z0: r2(N.z), tx: r2(T.x + m), ty: hit ? 1.2 : r2(this.R.range(0.2, 2.4)), tz: r2(T.z + m) }, N.x, N.z);
        if (hit) { const TV = this.vehicles.get(T.veh), d = N.dmg * g.mul; if (TV && this.R.chance(0.5)) this.hurtVeh(TV, d * 2.4, null); else this.hurt(T, TV ? d * 0.7 : d, null); }
      }
    } else { N.st = PS.RUN; const [wx, wz] = this.navPoint(N, T); this.pedMove(N, wx, wz, PED.RUN, dt); }
  }
  civ(N, dt) {
    const C = this.city;
    if (N.fightT > 0) {
      const T = this.players.get(N.tgt); N.fightT -= dt;
      if (!T || T.dead || T.veh) { N.fightT = 0; N.fleeT = 6; return; }
      const d = Math.hypot(T.x - N.x, T.z - N.z); N.st = PS.FIGHT;
      if (d > 1.5) this.pedMove(N, T.x, T.z, PED.RUN * 0.8, dt);
      else { N.ry = Math.atan2(T.x - N.x, T.z - N.z); N.cool -= dt; if (N.cool <= 0) { N.cool = 1.1; this.hurt(T, 7, null); this.emit({ e: 'punch', id: N.id }, N.x, N.z); } }
      return;
    }
    if (N.cowT > 0) { N.cowT -= dt; N.st = PS.COWER; if (N.cowT <= 0 && N.role === ROLE.CIV) N.fleeT = 6; return; }
    if (N.fleeT > 0) {
      N.fleeT -= dt; N.st = PS.FLEE;
      const a = Math.atan2(N.x - N.fx, N.z - N.fz);
      this.pedMove(N, N.x + Math.sin(a) * 10, N.z + Math.cos(a) * 10, PED.RUN, dt);
      if (N.fleeT <= 0) N.pa = -1;
      return;
    }
    if (N.role === ROLE.CLERK) { N.st = PS.IDLE; N.ry = N.home.ry; return; }
    if (N.pa < 0) { const e = C.nearestEdge(N.x, N.z), f = this.R.chance(0.5); N.pa = f ? e[0] : e[1]; N.pb = f ? e[1] : e[0]; }
    let L = C.lane(N.pa, N.pb), s = (N.x - L.ax) * L.dx + (N.z - L.az) * L.dz;
    if (s > L.len - L.m1 - 2) { const nx = this.randNext(N.pb, N.pa); N.pa = N.pb; N.pb = nx; L = C.lane(N.pa, N.pb); s = (N.x - L.ax) * L.dx + (N.z - L.az) * L.dz; }
    const off = L.hw + 1.5, st = clamp(Math.max(s + 2.5, L.m0 + 2), 0, L.len), tx = L.ax + L.dx * st + L.rx * off, tz = L.az + L.dz * st + L.rz * off;
    const a = Math.atan2(tx - N.x, tz - N.z);
    N.ry = angWrap(N.ry + clamp(angWrap(a - N.ry), -4 * dt, 4 * dt)); N.x += Math.sin(N.ry) * N.spd * dt; N.z += Math.cos(N.ry) * N.spd * dt; N.st = PS.WALK;
  }

  // ------------------------------------------------------------------ keeping the streets busy
  /** A spot in a driving lane near a point (min..max metres further along). */
  roadPoint(x, z, min = 0, max = 0, toward) {
    const C = this.city, e = C.nearestEdge(x, z); if (!e) return null;
    let a = e[0], b = e[1];
    if (toward ? Math.hypot(C.nodeXZ(a)[0] - toward.x, C.nodeXZ(a)[1] - toward.z) < Math.hypot(C.nodeXZ(b)[0] - toward.x, C.nodeXZ(b)[1] - toward.z) : this.R.chance(0.5)) { const q = a; a = b; b = q; }
    const L = C.lane(a, b), s = clamp((x - L.ax) * L.dx + (z - L.az) * L.dz + (max ? this.R.range(min, max) : 0), L.m0 + 4, L.len - L.m1 - 4);
    return { x: L.ax + L.dx * s + L.rx * L.off, z: L.az + L.dz * s + L.rz * L.off, ry: L.ry, a, b };
  }
  farFromAll(x, z, d) { for (const P of this.players.values()) if ((P.x - x) ** 2 + (P.z - z) ** 2 < d * d) return false; return true; }
  popTick() {
    const C = this.city, R = this.R, dn = this.density;
    let cars = 0, peds = 0;
    for (const V of this.vehicles.values()) {
      if (V.npc && !V.cop) cars++;
      if (V.drv || V.pass.length || V.own || V.mission || V.display) continue;
      const far = this.farFromAll(V.x, V.z, POP.CAR_KILL);
      if (V.fl & VF.PARKED && !V.touched) { if (far) { this.spotVeh.delete(V.spot); this.vehicles.delete(V.id); } continue; }
      if (far || (V.leave && this.farFromAll(V.x, V.z, 150))) { this.vehicles.delete(V.id); continue; }
      if (!V.npc && !V.cop && !(V.fl & VF.WRECK)) { V.idle += 0.5; if (V.idle > 90 && this.farFromAll(V.x, V.z, 70)) this.vehicles.delete(V.id); }
    }
    for (const N of this.peds.values()) {
      if (N.role === ROLE.CIV) { peds++; if (this.farFromAll(N.x, N.z, POP.PED_KILL)) this.peds.delete(N.id); }
    }
    for (const P of this.players.values()) {
      let nc = 0, np = 0;
      for (const V of this.vehicles.values()) if (V.npc && !V.cop && (V.x - P.x) ** 2 + (V.z - P.z) ** 2 < POP.CAR_OUT * POP.CAR_OUT) nc++;
      for (const N of this.peds.values()) if (N.role === ROLE.CIV && N.st !== PS.DEAD && (N.x - P.x) ** 2 + (N.z - P.z) ** 2 < POP.PED_OUT * POP.PED_OUT) np++;
      const first = this.time < 2;
      for (let k = 0; k < (first ? 8 : 2) && nc < POP.CARS * dn && cars < POP.CAR_CAP; k++) {
        const a = R() * 6.283, r = R.range(first ? 40 : POP.CAR_IN, POP.CAR_OUT), s = this.roadPoint(P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, -30, 30);
        if (!s || !this.farFromAll(s.x, s.z, first ? 30 : POP.CAR_IN - 12)) continue;
        let clear = true; for (const V of this.vehicles.values()) if ((V.x - s.x) ** 2 + (V.z - s.z) ** 2 < 144) { clear = false; break; }
        if (!clear) continue;
        const V = this.makeVeh(pickKind(R()), s.x, s.z, s.ry); V.npc = true; V.ai = { a: s.a, b: s.b, block: 0, pass: 0, panic: 0, cruise: R.range(10, 14) }; V.sp = 9; nc++; cars++;
      }
      for (let k = 0; k < (first ? 10 : 2) && np < POP.PEDS * dn && peds < POP.PED_CAP; k++) {
        const a = R() * 6.283, r = R.range(first ? 15 : POP.PED_IN, POP.PED_OUT), e = C.nearestEdge(P.x + Math.sin(a) * r, P.z + Math.cos(a) * r); if (!e) continue;
        const f = R.chance(0.5), pa = f ? e[0] : e[1], pb = f ? e[1] : e[0], L = C.lane(pa, pb), s = R.range(L.m0 + 3, L.len - L.m1 - 3), x = L.ax + L.dx * s + L.rx * (L.hw + 1.5), z = L.az + L.dz * s + L.rz * (L.hw + 1.5);
        if (!this.farFromAll(x, z, first ? 12 : POP.PED_IN - 10) || this.farFromAll(x, z, POP.PED_OUT + 10)) continue;
        const N = this.makePed(ROLE.CIV, x, z, L.ry); N.pa = pa; N.pb = pb; np++; peds++;
      }
      // parked cars
      for (const n of C.spotsNear(P.x, P.z, POP.PARK_R, this._sp)) {
        if (this.spotVeh.has(n)) continue;
        const s = C.spots[n]; if ((s.x - P.x) ** 2 + (s.z - P.z) ** 2 > POP.PARK_R * POP.PARK_R || hash2(n, 77) > (s.lot ? 0.3 : POP.PARK_FILL) * dn) continue;
        const V = this.makeVeh(pickKind(hash2(n, 5)), s.x, s.z, s.ry, { fl: VF.PARKED, col: Math.floor(hash2(n, 9) * CAR_COLORS.length) }); V.spot = n; this.spotVeh.set(n, V.id);
      }
    }
    // shop staff appear when someone is near
    C.staff.forEach((s, k) => {
      if (s.heist) return;
      const id = this.staffPed.get(k), N = id ? this.peds.get(id) : null, far = this.farFromAll(s.x, s.z, 150);
      if (N && (far || N.st === PS.DEAD)) { if (far) { this.peds.delete(id); this.staffPed.delete(k); } return; }
      if (!N && !far && !id) { const M = this.makePed(ROLE.CLERK, s.x, s.z, s.ry); M.home = s; M.st = PS.IDLE; this.staffPed.set(k, M.id); }
    });
    if (this.respawnDisplay) this.respawnDisplay = this.respawnDisplay.filter((q) => { if (this.time < q.at || !this.farFromAll(q.d.x, q.d.z, 80)) return true; this.spawnDisplay(q.d); return false; });
    for (const k of this.pickups.values()) if (this.time > k.until) this.pickups.delete(k.id);
    if (this.gates && this.time > this.gateCloseAt && this.gateCloseAt && ![...this.heists.values()].some((H) => H.def.id === 'bank') && this.farFromAll(C.poi.bank.x, C.poi.bank.z, 45)) { this.gates = 0; this.gateCloseAt = 0; }
  }

  // ------------------------------------------------------------------ one step of time
  update(dt) {
    this.time += dt; this.clock = (this.clock + dt) % DAY;
    const o = this._o;
    for (const P of this.players.values()) {
      if (P.dead) { if (this.time >= P.respawnAt) this.respawn(P); continue; }
      P.budget = Math.min(1.2, P.budget + dt);
      if (P.hp < 50 && this.time - (P.hurtAt || 0) > 8) { P.hp = Math.min(50, P.hp + 4 * dt); P.dirty = true; }
      if (!P.veh) for (const k of this.pickups.values()) if ((k.x - P.x) ** 2 + (k.z - P.z) ** 2 < 3.2) { this.pickups.delete(k.id); this.pay(P, k.amt, 'Cash'); }
    }
    this.popT -= dt; if (this.popT <= 0) { this.popT = 0.5; this.popTick(); }
    this.seeT -= dt; if (this.seeT <= 0) { this.heatTick(0.25 - this.seeT); this.seeT = 0.25; }
    this.copT -= dt; if (this.copT <= 0) { this.copT = 1; this.copTick(); }
    for (const V of this.vehicles.values()) {
      if (V.fl & VF.WRECK) { if (this.time > V.goneAt && this.farFromAll(V.x, V.z, 40)) this.vehicles.delete(V.id); continue; }
      if (V.fireT && this.time >= V.fireT) { this.explode(V); continue; }
      if (V.drv) continue;
      if (V.kn) this.knocked(V, dt);
      else if (V.heli) this.heliAI(V, dt);
      else if (V.cop) this.copCar(V, dt);
      else if (V.npc) this.traffic(V, dt);
      else if (V.sp) {       // rolling to a stop with nobody at the wheel
        V.sp *= 1 - 1.6 * dt; if (Math.abs(V.sp) < 0.4) V.sp = 0;
        V.x += Math.sin(V.ry) * V.sp * dt; V.z += Math.cos(V.ry) * V.sp * dt;
        if (this.city.collide(V.x, V.z, 1.2, o, this.gates)) { V.x = o.x; V.z = o.z; V.sp = 0; }
      }
    }
    for (const N of this.peds.values()) {
      if (N.st === PS.DEAD) { if (this.time > N.goneAt) this.peds.delete(N.id); continue; }
      if (N.role === ROLE.CIV || N.role === ROLE.CLERK) this.civ(N, dt); else this.armed(N, dt);
    }
    heistUpdate(this, dt);
  }

  // ------------------------------------------------------------------ what each player gets told
  me(P) {
    return { hp: Math.ceil(P.hp), ar: Math.ceil(P.armor), heat: P.heat, esc: r2(P.esc), cash: P.cash, veh: P.veh, seat: P.seat, guns: [...P.guns], cars: [...P.cars], done: [...P.done], dead: P.dead ? 1 : 0, rt: P.dead ? r2(P.respawnAt - this.time) : 0, pas: P.passive ? 1 : 0, car: P.car, god: P.god ? 1 : 0, hs: heistState(this, P) };
  }
  snapshot(P) {
    const slow = P.sn++ % 5 === 0, R2 = NET.RADIUS * NET.RADIUS, p = [], v = [], n = [], k = [];
    for (const Q of this.players.values()) p.push([Q.id, r2(Q.x), r2(Q.y), r2(Q.z), r2(Q.ry), r2(Q.pitch), Q.f | (Q.dead ? F.DEAD : 0), Q.w, Math.ceil(Q.hp), Math.ceil(Q.armor), Q.veh, Q.seat, Q.heat, Q.crew]);
    for (const V of this.vehicles.values()) {
      const d = (V.x - P.x) ** 2 + (V.z - P.z) ** 2; if (d > R2) continue;
      if (!slow && !V.sp && !V.drv && !V.kn && !(V.fl & (VF.FIRE | VF.SIREN))) continue;
      v.push([V.id, V.k, r2(V.x), r2(V.z), r2(V.ry), r2(V.sp), r2(V.st), Math.round((V.hp / VEHICLES[V.k].hp) * 100), V.col, V.fl, V.drv, r2(V.y)]);
    }
    for (const N of this.peds.values()) {
      const d = (N.x - P.x) ** 2 + (N.z - P.z) ** 2; if (d > 190 * 190) continue;
      if (!slow && (N.st === PS.DEAD || N.st === PS.IDLE || N.st === PS.COWER)) continue;
      n.push([N.id, N.look, N.role, r2(N.x), r2(N.z), r2(N.ry), N.st, N.w]);
    }
    if (slow) for (const c of this.pickups.values()) if ((c.x - P.x) ** 2 + (c.z - P.z) ** 2 < 150 * 150) k.push([c.id, r2(c.x), r2(c.z), c.amt]);
    return { tm: r2(this.time), ck: Math.round(this.clock), g: this.gates, slow: slow ? 1 : 0, p, v, n, k };
  }
}
