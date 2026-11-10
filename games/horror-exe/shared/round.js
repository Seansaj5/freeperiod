// One round of horror.exe: who is EXE, the two worlds and their portals, the five zone tasks, hits,
// knockdowns, revives, disguises, the escape gates and the result.
// The server runs this for online rooms; the browser runs the very same code for solo games.
import { ROUND, SURV, EXE, CHARS, CHAR_IDS, VARIANTS, VARIANT_IDS, F, ST, PHASES, PORTAL, TASKS, TASK, moveSpeed, tickStamina } from './rules.js';
import { SHARD_SPOTS, EXITS, SPAWNS, PORTALS, OBJ, HALF, supportAt, terrainH, clampXZ, surfaceAt } from './map.js';
import { stepMove, body } from './move.js';
import { newBrain, thinkSurv, thinkExe } from './bots.js';
import { rng, shuffle, turnTo, clamp } from './util.js';
import { randomLook, sanitizeLook } from './looks.js';

const BOT_NAMES = ['Nova', 'Milo', 'Juno', 'Pixel', 'Rex', 'Kiki', 'Bean', 'Ziggy', 'Lumi', 'Taro', 'Moss', 'Echo'];
const r2 = (v) => Math.round(v * 100) / 100;
const CORE_STATE = { home: 0, carried: 1, dropped: 2, done: 3 };

export class Round {
  /**
   * players: [{ id, name, look, char, variant }] (people). exeId: which of them is EXE, or null for a bot EXE.
   * exeVariant: the variant for a bot EXE (random if left out).
   */
  constructor({ seed = 1, players = [], exeId = null, exeVariant = null }) {
    this.seed = seed;
    this.rand = rng(seed);
    this.time = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.clock = ROUND.PLAY;
    this.escapeT = ROUND.ESCAPE;
    this.events = [];
    this.ents = new Map();
    this.result = null;
    this.exitsOpen = false;
    this.nextBot = 1000;
    const spots = shuffle(SHARD_SPOTS.slice(), this.rand).slice(0, ROUND.SHARDS);
    this.shards = spots.map((s, i) => ({ i, spot: s.i, x: s.x, y: s.y, z: s.z, via: s.via, entry: s.entry, taken: 0, prog: 0, by: 0, lit: i < ROUND.LIT, w: 0 }));
    this.relight = [];
    this.valves = OBJ.valves.map((v, i) => ({ i, ...v, prog: 0, by: 0, done: 0, w: 0 }));
    this.panels = OBJ.panels.map((v, i) => ({ i, ...v, done: 0, w: 1 }));
    this.bells = OBJ.bells.map((v, i) => ({ i, ...v, done: 0, w: 1 }));
    this.core = { state: CORE_STATE.home, x: OBJ.core.x, y: OBJ.core.y, z: OBJ.core.z, by: 0, entry: OBJ.core.entry, w: 1 };
    this.done = { shards: false, valves: false, panels: false, core: false, bells: false };
    this.exits = shuffle(EXITS.slice(), this.rand).slice(0, ROUND.EXITS).sort((a, b) => a.i - b.i).map((g) => ({ ...g, open: false, w: 1 }));

    let si = 0;
    for (const p of players) this.add(p, p.id === exeId ? 'exe' : 'surv', p.id === exeId ? 0 : si++, false);
    if (exeId === null || !players.some((p) => p.id === exeId)) {
      const v = VARIANT_IDS.includes(exeVariant) ? exeVariant : VARIANT_IDS[Math.floor(this.rand() * VARIANT_IDS.length)];
      this.add({ id: this.nextBot++, name: 'EXE', variant: v }, 'exe', 0, true);
    }
    const used = new Set(players.filter((p) => p.id !== exeId).map((p) => p.char));
    const free = shuffle(CHAR_IDS.filter((c) => !used.has(c)), this.rand);
    const names = shuffle(BOT_NAMES.slice(), this.rand);
    while (this.survivors().length < ROUND.SURVIVORS) {
      const char = free.length ? free.shift() : CHAR_IDS[Math.floor(this.rand() * CHAR_IDS.length)];
      this.add({ id: this.nextBot++, name: names.pop(), look: randomLook(this.rand), char }, 'surv', si++, true);
    }
  }

  add(p, role, slot, bot) {
    const sp = role === 'exe' ? SPAWNS.exe : SPAWNS.surv[slot % SPAWNS.surv.length];
    const w = role === 'exe' ? 1 : 0;
    const y = supportAt(sp.x, sp.z, 50, false, w);
    const e = body(sp.x, y, sp.z, role === 'exe' ? EXE.radius : SURV.radius, role === 'exe' ? EXE.height : SURV.height, w);
    Object.assign(e, {
      id: p.id, name: String(p.name || 'Player').slice(0, 16), bot, role, ry: sp.ry,
      look: sanitizeLook(p.look), char: CHARS[p.char] ? p.char : 'bolt', variant: VARIANTS[p.variant] ? p.variant : 'exe',
      hp: SURV.hp, st: ST.alive, downT: 0, revP: 0, reviving: false, sprinting: false,
      sta: { stamina: SURV.stamina, exhausted: false, rest: 0 },
      cd: { abl: 0, atk: 0, sense: 0, disguise: 0, portal: 0 },
      fx: { stun: 0, boost: 0, invuln: 0, fade: 0, reveal: 0, dash: 0, fly: 0, lunge: 0, recover: 0, atk: 0, pop: 0, burn: 0 },
      disguise: 0, carrying: false,
      lungeHit: new Set(), teleportOk: 0, lastIn: 0,
      stats: { shards: 0, revives: 0, hits: 0, downs: 0, tasks: 0 },
      brain: bot ? newBrain() : null,
    });
    this.ents.set(e.id, e);
    return e;
  }

  survivors() { const out = []; for (const e of this.ents.values()) if (e.role === 'surv') out.push(e); return out; }
  exeEnt() { for (const e of this.ents.values()) if (e.role === 'exe') return e; return null; }
  ev(m) { this.events.push(m); }
  drain() { const ev = this.events; this.events = []; return ev; }
  taskList() { return TASKS.map((t) => ({ ...t, done: this.done[t.id] })); }

  /** What every client needs to know once, at the start of the round. */
  info() {
    return {
      seed: this.seed,
      shards: this.shards.map((s) => [r2(s.x), r2(s.y), r2(s.z)]),
      exits: this.exits.map((g) => g.i),
      ents: [...this.ents.values()].map((e) => ({ id: e.id, name: e.name, bot: e.bot, role: e.role, look: e.look, char: e.char, variant: e.variant })),
    };
  }

  timeLeft() {
    if (this.phase === 'intro') return ROUND.INTRO - this.phaseT;
    if (this.phase === 'play') return this.clock;
    if (this.phase === 'escape') return this.escapeT;
    return 0;
  }

  flagsOf(e) {
    const t = this.time, x = e.fx;
    let f = 0;
    if (e.sprinting) f |= F.SPRINT;
    if (!e.ground) f |= F.AIR;
    if (x.fly > t) f |= F.FLY;
    if (x.atk > t) f |= F.ATK;
    if (x.dash > t) f |= F.DASH;
    if (x.stun > t) f |= F.STUN;
    if (x.boost > t) f |= F.BOOST;
    if (x.invuln > t) f |= F.INVULN;
    if (x.fade > t) f |= F.FADE;
    if (x.reveal > t) f |= F.REVEAL;
    if (x.lunge > t) f |= F.LUNGE;
    if (x.recover > t) f |= F.RECOVER;
    if (x.pop > t) f |= F.POP;
    if (e.reviving) f |= F.REVIVING;
    if (e.surface === 'water') f |= F.WATER;
    if (e.surface === 'goo') f |= F.GOO;
    if (e.surface === 'ice') f |= F.ICE;
    if (e.carrying) f |= F.CARRY;
    return f;
  }

  /** Everything that changes, compact enough to send 15 times a second. */
  snapshot() {
    let sh = 0, sa = 0, vm = 0, pn = 0, bm = 0, td = 0;
    for (const s of this.shards) { if (s.taken) sh |= 1 << s.i; if (s.lit) sa |= 1 << s.i; }
    for (const v of this.valves) if (v.done) vm |= 1 << v.i;
    for (const v of this.panels) if (v.done) pn |= 1 << v.i;
    for (const v of this.bells) if (v.done) bm |= 1 << v.i;
    TASKS.forEach((t, i) => { if (this.done[t.id]) td |= 1 << i; });
    const sp = [], vp = [];
    for (const s of this.shards) if (!s.taken && s.prog > 0) sp.push(s.i, Math.round(s.prog * 100));
    for (const v of this.valves) if (!v.done && v.prog > 0) vp.push(v.i, Math.round(v.prog * 100));
    const c = this.core;
    const p = [];
    for (const e of this.ents.values()) {
      p.push([e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.ry), e.hp, e.st, this.flagsOf(e), e.st === ST.down ? Math.ceil(e.downT) : 0, Math.round(e.revP * 100),
        Math.round(e.cd.abl * 10) / 10, e.w, e.disguise]);
    }
    return {
      ph: PHASES.indexOf(this.phase), tl: Math.max(0, Math.round(this.timeLeft() * 10) / 10),
      sh, sa, sp, vm, vp, pn, bm, td, co: [c.state, r2(c.x), r2(c.y), r2(c.z), c.by],
      ex: this.exitsOpen ? 1 : 0, rt: Math.round(this.time * 100) / 100, p,
    };
  }

  setPhase(ph) { this.phase = ph; this.phaseT = 0; this.ev({ k: 'phase', ph }); }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.phaseT += dt;
    if (this.phase === 'over') return;
    if (this.phase === 'intro' && this.phaseT >= ROUND.INTRO) this.setPhase('play');
    if (this.phase === 'play') { this.clock -= dt; if (this.clock <= 0) this.openExits('clock'); }
    if (this.phase === 'escape') { this.escapeT -= dt; if (this.escapeT <= 0) { this.finish(); return; } }
    for (const e of this.ents.values()) if (e.bot) this.botStep(e, dt);
    this.resolve(dt);
    this.checkEnd();
  }

  botStep(e, dt) {
    if (e.st === ST.out || e.st === ST.esc) return;
    const inp = e.role === 'exe' ? thinkExe(this, e, dt) : thinkSurv(this, e, dt);
    if (inp.face !== null && inp.face !== undefined) e.ry = inp.face;
    if (inp.act) this.action(e.id, { k: inp.act });
    const moving = !!(inp.dx || inp.dz);
    e.sprinting = e.role === 'surv' && e.st === ST.alive ? tickStamina(e.sta, inp.sprint, moving, dt) : !!(e.disguise && inp.sprint);
    const dis = e.disguise ? this.ents.get(e.disguise) : null;
    const speed = moveSpeed(e.role, e.role === 'exe' ? e.variant : e.char, e.st, this.flagsOf(e), this.phase, e.sprinting, e.w, dis ? dis.char : null);
    const fly = e.fx.fly > this.time && e.st === ST.alive;
    const r = stepMove(e, { dx: inp.dx, dz: inp.dz, speed, jump: inp.jump && e.st === ST.alive, jumpV: e.role === 'exe' ? EXE.jump : SURV.jump, fly, up: inp.up }, dt);
    if (r.spring) this.ev({ k: 'spring', id: e.id, i: r.spring.i });
    if (r.boost) this.ev({ k: 'boost', id: e.id, i: r.boost.i });
    if ((inp.face === null || inp.face === undefined) && e.lock <= 0 && Math.hypot(e.vx, e.vz) > 0.6) e.ry = turnTo(e.ry, Math.atan2(e.vx, e.vz), 9 * dt);
  }

  /** A person's own movement report: { x, y, z, ry, f (F.SPRINT | F.AIR | ...) }. */
  input(id, s) {
    const e = this.ents.get(id);
    if (!e || e.bot || e.st === ST.out || e.st === ST.esc) return;
    const x = Number(s.x), y = Number(s.y), z = Number(s.z), ry = Number(s.ry);
    if (![x, y, z, ry].every(Number.isFinite)) return;
    e.ry = ry;
    const jump = Math.hypot(x - e.x, z - e.z);
    if (jump > 30 && this.time >= e.teleportOk) return; // ignore impossible jumps (except a blink)
    const now = this.time, dtIn = Math.max(0.03, now - (e.lastIn || now - 0.066));
    e.vx = (x - e.x) / dtIn; e.vz = (z - e.z) / dtIn; e.lastIn = now;
    const p = clampXZ({ x, z });
    e.x = p.x; e.z = p.z; e.y = clamp(y, terrainH(p.x, p.z) - 3, 60);
    const f = s.f | 0;
    e.sprinting = !!(f & F.SPRINT); e.ground = !(f & F.AIR);
    e.surface = surfaceAt(e.x, e.z, e.y);
  }

  /** k: 'atk' (EXE swing / pop out), 'abl' (ability), 'sense' (EXE scream), 'disguise' (EXE, normal world). */
  action(id, a) {
    const e = this.ents.get(id), t = this.time;
    if (!e || e.st !== ST.alive || this.phase === 'over' || !a) return false;
    if (e.role === 'exe') {
      if (this.phase === 'intro' || e.fx.stun > t || e.fx.pop > t) return false;
      const v = VARIANTS[e.variant];
      if (a.k === 'disguise') {
        if (e.disguise || e.w !== 0 || t < e.cd.disguise) return false;
        const alive = this.survivors().filter((s) => s.st === ST.alive);
        if (!alive.length) return false;
        // copy someone who is not standing right here (ideally in the other world), so the double is less obvious
        alive.sort((p, q) => (q.w !== e.w) - (p.w !== e.w) || Math.hypot(q.x - e.x, q.z - e.z) - Math.hypot(p.x - e.x, p.z - e.z));
        const pickFrom = alive.slice(0, Math.max(1, Math.ceil(alive.length / 2)));
        e.disguise = pickFrom[Math.floor(this.rand() * pickFrom.length)].id;
        e.fx.fade = 0;
        this.ev({ k: 'disguise', id });
        return true;
      }
      if (e.disguise) {
        if (a.k !== 'atk') return false;
        this.popOut(e, true);
        return true;
      }
      if (a.k === 'atk') {
        if (t < e.cd.atk) return false;
        e.cd.atk = t + EXE.atkCd; e.fx.atk = t + 0.35; e.fx.fade = 0;
        const victim = this.victimFor(e, EXE.atkRange + (e.bot ? 0 : EXE.lagGrace));
        this.ev({ k: 'atk', id });
        if (victim) this.hit(e, victim);
        return true;
      }
      if (a.k === 'abl') {
        if (t < e.cd.abl) return false;
        e.cd.abl = t + v.cd;
        if (v.ability === 'lunge') {
          e.fx.lunge = t + v.dur; e.lungeHit.clear();
          if (e.bot) { e.vx = Math.sin(e.ry) * v.lungeSpeed; e.vz = Math.cos(e.ry) * v.lungeSpeed; e.lock = v.dur; }
        } else if (v.ability === 'blink') {
          e.teleportOk = t + 1;
          this.ev({ k: 'blink', id, x0: r2(e.x), y0: r2(e.y), z0: r2(e.z) });
          if (e.bot) {
            const p = clampXZ({ x: e.x + Math.sin(e.ry) * v.dist, z: e.z + Math.cos(e.ry) * v.dist });
            e.x = p.x; e.z = p.z; e.y = supportAt(p.x, p.z, terrainH(p.x, p.z) + 0.5, false, e.w); e.vy = 0;
          }
        } else if (v.ability === 'fade') e.fx.fade = t + v.dur;
        this.ev({ k: 'abl', id, ab: v.ability });
        return true;
      }
      if (a.k === 'sense') {
        if (t < e.cd.sense) return false;
        e.cd.sense = t + EXE.senseCd;
        const ids = [];
        for (const s of this.survivors()) {
          if (s.st !== ST.alive || s.w !== e.w) continue;
          if (s.sprinting || Math.hypot(s.x - e.x, s.z - e.z) < EXE.senseRange) { s.fx.reveal = t + EXE.revealTime; ids.push(s.id); }
        }
        this.ev({ k: 'sense', id, ids });
        return true;
      }
      return false;
    }
    if (a.k !== 'abl' || t < e.cd.abl) return false;
    const c = CHARS[e.char];
    if (c.ability === 'dash') {
      e.cd.abl = t + c.cd; e.fx.dash = t + c.dur; e.fx.invuln = Math.max(e.fx.invuln, t + c.dur + 0.1);
      if (e.bot) { e.vx = Math.sin(e.ry) * c.dashSpeed; e.vz = Math.cos(e.ry) * c.dashSpeed; e.vy = Math.max(e.vy, 0); e.lock = c.dur; }
      this.ev({ k: 'abl', id, ab: 'dash' });
      return true;
    }
    if (c.ability === 'fly') {
      e.cd.abl = t + c.cd; e.fx.fly = t + c.dur;
      this.ev({ k: 'abl', id, ab: 'fly' });
      return true;
    }
    // punch / bonk: needs EXE close, in front and in the same world. Hitting a disguised EXE unmasks it.
    const x = this.exeEnt();
    let hit = false;
    if (x && x.st === ST.alive && x.w === e.w) {
      const dx = x.x - e.x, dz = x.z - e.z, d = Math.hypot(dx, dz);
      const front = d < 0.01 || (Math.sin(e.ry) * dx + Math.cos(e.ry) * dz) / d > -0.1;
      if (d < c.range + (e.bot ? 0 : 1) && Math.abs(x.y - e.y) < 3 && front) {
        hit = true;
        if (x.disguise) { this.popOut(x, false); this.ev({ k: 'unmask', id: x.id, by: id }); }
        x.fx.stun = Math.max(x.fx.stun, t + c.dur); x.fx.lunge = 0; x.fx.pop = 0;
        if (c.ability === 'bonk') {
          const nx = d > 0.01 ? dx / d : Math.sin(e.ry), nz = d > 0.01 ? dz / d : Math.cos(e.ry);
          this.ev({ k: 'knock', id: x.id, by: id, dx: r2(nx * c.knock), dz: r2(nz * c.knock) });
          if (x.bot) { x.vx = nx * c.knock; x.vz = nz * c.knock; x.vy = 6; x.ground = false; x.lock = 0.4; }
        }
      }
    }
    e.cd.abl = t + (hit ? c.cd : c.missCd);
    this.ev({ k: 'abl', id, ab: c.ability, hit, target: hit ? x.id : 0 });
    return true;
  }

  /** EXE drops its disguise. scream: the scary pop-out (a short freeze while it transforms). */
  popOut(x, scream) {
    const t = this.time;
    x.disguise = 0;
    x.cd.disguise = t + EXE.disguiseCd;
    if (scream) { x.fx.pop = t + EXE.popTime; x.cd.atk = t + EXE.popTime; this.ev({ k: 'pop', id: x.id }); }
  }

  victimFor(x, range) {
    let best = null, bd = Infinity;
    const fx = Math.sin(x.ry), fz = Math.cos(x.ry);
    for (const s of this.survivors()) {
      if (s.st !== ST.alive || s.w !== x.w) continue;
      const dx = s.x - x.x, dz = s.z - x.z, d = Math.hypot(dx, dz);
      if (d > range || Math.abs(s.y - x.y) > 3) continue;
      if (d > 1.0 && (fx * dx + fz * dz) / d < EXE.atkDot) continue;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** One point of damage. x is the attacker (EXE) or null (lava). */
  hit(x, s) {
    const t = this.time;
    if (s.st !== ST.alive || s.fx.invuln > t || s.fx.dash > t) return false;
    s.hp--;
    if (x) { x.stats.hits++; x.fx.recover = t + EXE.recoverTime; x.fx.lunge = 0; }
    if (s.carrying) this.dropCore(s);
    if (s.hp > 0) {
      s.fx.boost = t + SURV.boostTime; s.fx.invuln = t + SURV.invulnTime;
      this.ev({ k: 'hit', id: s.id, by: x ? x.id : 0, hp: s.hp });
    } else {
      s.st = ST.down; s.downT = SURV.downTime; s.revP = 0; s.fx.fly = 0; s.fx.boost = 0;
      if (x) x.stats.downs++;
      this.ev({ k: 'down', id: s.id, by: x ? x.id : 0 });
    }
    if (s.bot && x) { const n = Math.hypot(s.x - x.x, s.z - x.z) || 1; s.vx = ((s.x - x.x) / n) * 9; s.vz = ((s.z - x.z) / n) * 9; s.vy = 5; s.ground = false; s.lock = 0.25; }
    return true;
  }

  dropCore(s) {
    const c = this.core;
    if (c.state !== CORE_STATE.carried || c.by !== s.id) return;
    c.state = CORE_STATE.dropped; c.by = 0; s.carrying = false;
    c.x = s.x; c.z = s.z; c.y = supportAt(s.x, s.z, s.y + 0.5, false, 1);
    this.ev({ k: 'core', s: 'drop', id: s.id });
  }

  taskDone(id, by) {
    if (this.done[id]) return;
    this.done[id] = true;
    this.ev({ k: 'taskdone', t: id, by: by ? by.id : 0 });
    if (TASKS.every((t) => this.done[t.id])) this.openExits('tasks');
  }

  resolve(dt) {
    const t = this.time, surv = this.survivors(), x = this.exeEnt();
    // portals: step in to swap worlds
    for (const e of this.ents.values()) {
      if (e.st !== ST.alive || t < e.cd.portal) continue;
      for (const p of PORTALS) {
        if (Math.hypot(e.x - p.x, e.z - p.z) > PORTAL.range || Math.abs(e.y - p.y) > 3) continue;
        e.w = e.w ? 0 : 1;
        e.cd.portal = t + PORTAL.cooldown;
        e.fx.fly = Math.min(e.fx.fly, t);
        if (e.disguise) this.popOut(e, false);
        if (e.carrying) this.dropCore(e);
        this.ev({ k: 'portal', id: e.id, w: e.w, i: p.i });
        break;
      }
    }
    // lava burns survivors (but never takes their last heart) and throws EXE out
    for (const e of this.ents.values()) {
      if (e.st !== ST.alive) continue;
      if (e.bot) e.surface = surfaceAt(e.x, e.z, e.y);
      if (e.surface !== 'lava' || e.fx.burn > t) continue;
      e.fx.burn = t + SURV.burnTime;
      if (e.role === 'surv' && e.hp > 1 && e.fx.invuln <= t) this.hit(null, e);
      this.ev({ k: 'burn', id: e.id });
      if (e.bot) { e.vy = 13; e.ground = false; e.lock = 0.15; }
    }
    // a lunge tears through anyone it passes
    if (x && x.fx.lunge > t) {
      for (const s of surv) {
        if (s.st !== ST.alive || s.w !== x.w || x.lungeHit.has(s.id)) continue;
        if (Math.hypot(s.x - x.x, s.z - x.z) < 2.6 + (x.bot ? 0 : 0.8) && Math.abs(s.y - x.y) < 3) { x.lungeHit.add(s.id); this.hit(x, s); }
      }
    }
    // Dreamy Hills: shards (normal world) - stand next to one to absorb it
    while (this.relight.length && this.relight[0] <= t) {
      this.relight.shift();
      const next = this.shards.find((q) => !q.lit && !q.taken);
      if (next) { next.lit = true; this.ev({ k: 'lit', i: next.i }); }
    }
    const near = (o, range, dy, w) => {
      let n = 0, who = null;
      for (const s of surv) {
        if (s.st !== ST.alive || s.w !== w || Math.hypot(s.x - o.x, s.z - o.z) > range || Math.abs(s.y + 1.1 - o.y) > dy) continue;
        n++; if (!who || s.id === o.by) who = s;
      }
      return { n, who };
    };
    for (const sh of this.shards) {
      if (sh.taken || !sh.lit) continue;
      const { n, who } = near(sh, SURV.pickupRange, 2.6, 0);
      if (n) {
        sh.prog += (dt / SURV.shardTime) * (1 + (n - 1) * 0.5); sh.by = who.id;
        if (sh.prog >= 1) {
          sh.taken = who.id; sh.prog = 1; who.stats.shards++; who.stats.tasks++;
          this.relight.push(t + ROUND.RELIGHT);
          const got = this.shards.filter((q) => q.taken).length;
          this.ev({ k: 'shard', i: sh.i, by: who.id, n: got });
          if (got >= this.shards.length) this.taskDone('shards', who);
        }
      } else sh.prog = Math.max(0, sh.prog - dt * 0.15);
    }
    // Toxic Works: valves (normal world) - stay at a valve to turn it
    for (const v of this.valves) {
      if (v.done) continue;
      const { n, who } = near(v, TASK.valveRange, 2.6, 0);
      if (n) {
        v.prog += (dt / TASK.valveTime) * (1 + (n - 1) * 0.5); v.by = who.id;
        if (v.prog >= 1) {
          v.done = who.id; who.stats.tasks++;
          this.ev({ k: 'task', t: 'valves', i: v.i, by: who.id, n: this.valves.filter((q) => q.done).length });
          if (this.valves.every((q) => q.done)) this.taskDone('valves', who);
        }
      } else v.prog = Math.max(0, v.prog - dt * 0.1);
    }
    // Neon Jackpot: panels (corrupted world) - step on them; Ember Ruins: bells (corrupted world) - touch them
    for (const [list, task, range, dy] of [[this.panels, 'panels', TASK.panelRange, 2.2], [this.bells, 'bells', TASK.bellRange, 2.6]]) {
      for (const o of list) {
        if (o.done) continue;
        const { who } = near(o, range, dy, 1);
        if (!who) continue;
        o.done = who.id; who.stats.tasks++;
        this.ev({ k: 'task', t: task, i: o.i, by: who.id, n: list.filter((q) => q.done).length });
        if (list.every((q) => q.done)) this.taskDone(task, who);
      }
    }
    // Frostbite Peak: carry the fire core (corrupted world) from the ice cave to the frozen engine
    const c = this.core;
    if (c.state === CORE_STATE.carried) {
      const s = this.ents.get(c.by);
      if (!s || s.st !== ST.alive || s.w !== 1) { if (s) this.dropCore(s); else { c.state = CORE_STATE.dropped; c.by = 0; } }
      else {
        c.x = s.x; c.y = s.y + 1; c.z = s.z;
        if (Math.hypot(s.x - OBJ.engine.x, s.z - OBJ.engine.z) < TASK.engineRange && Math.abs(s.y - OBJ.engine.y) < 3) {
          c.state = CORE_STATE.done; c.by = 0; s.carrying = false; s.stats.tasks++;
          c.x = OBJ.engine.x; c.y = OBJ.engine.y + 3.6; c.z = OBJ.engine.z - 3.2;
          this.ev({ k: 'core', s: 'done', id: s.id });
          this.taskDone('core', s);
        }
      }
    } else if (c.state === CORE_STATE.home || c.state === CORE_STATE.dropped) {
      for (const s of surv) {
        if (s.st !== ST.alive || s.w !== 1 || s.carrying || Math.hypot(s.x - c.x, s.z - c.z) > TASK.coreRange || Math.abs(s.y - c.y) > 2.5) continue;
        c.state = CORE_STATE.carried; c.by = s.id; s.carrying = true;
        this.ev({ k: 'core', s: 'pick', id: s.id });
        break;
      }
    }
    // escape gates (corrupted world)
    if (this.exitsOpen) {
      for (const s of surv) {
        if (s.st !== ST.alive || s.w !== 1) continue;
        for (const g of this.exits) {
          if (Math.hypot(s.x - g.x, s.z - g.z) < SURV.exitRange && Math.abs(s.y - g.y) < 4) {
            s.st = ST.esc; s.fx.fly = 0; if (s.carrying) this.dropCore(s);
            this.ev({ k: 'esc', id: s.id });
            break;
          }
        }
      }
    }
    // knocked-down survivors: revived by a teammate in the same world, or they bleed out
    for (const s of surv) {
      if (s.st !== ST.down) { s.reviving = false; continue; }
      let rate = 0, by = null;
      for (const o of surv) {
        if (o === s || o.st !== ST.alive || o.w !== s.w) continue;
        if (Math.hypot(o.x - s.x, o.z - s.z) < SURV.reviveRange && Math.abs(o.y - s.y) < 2.5) {
          const r = CHARS[o.char].reviveMul || 1;
          if (r > rate) { rate = r; by = o; }
        }
      }
      s.reviving = rate > 0;
      if (rate > 0) {
        s.revP += (dt / SURV.reviveTime) * rate;
        if (s.revP >= 1) {
          s.st = ST.alive; s.hp = 1; s.revP = 0; s.fx.invuln = t + 2; s.sta.stamina = Math.max(s.sta.stamina, 50); s.sta.exhausted = false;
          by.stats.revives++;
          this.ev({ k: 'revive', id: s.id, by: by.id });
        }
      } else {
        s.revP = Math.max(0, s.revP - dt * 0.25);
        s.downT -= dt;
        if (s.downT <= 0) { s.st = ST.out; this.ev({ k: 'out', id: s.id }); }
      }
    }
  }

  openExits(why) {
    if (this.exitsOpen) return;
    this.exitsOpen = true;
    for (const g of this.exits) g.open = true;
    this.escapeT = ROUND.ESCAPE;
    this.setPhase('escape');
    this.ev({ k: 'exits', why });
  }

  checkEnd() {
    if (this.phase === 'over' || this.phase === 'intro') return;
    if (!this.survivors().some((s) => s.st === ST.alive)) this.finish();
  }

  finish() {
    if (this.phase === 'over') return;
    for (const s of this.survivors()) if (s.st === ST.alive || s.st === ST.down) { s.st = ST.out; s.caught = true; }
    const escaped = this.survivors().filter((s) => s.st === ST.esc).map((s) => s.id);
    this.result = {
      win: escaped.length ? 'surv' : 'exe',
      escaped,
      tasks: TASKS.filter((t) => this.done[t.id]).length,
      stats: [...this.ents.values()].map((e) => ({ id: e.id, role: e.role, st: e.st, ...e.stats })),
      time: Math.round(this.time),
    };
    this.setPhase('over');
    this.ev({ k: 'over', ...this.result });
  }

  /** Someone left: a bot takes over their character so the round carries on. */
  toBot(id) {
    const e = this.ents.get(id);
    if (!e || e.bot) return;
    e.bot = true; e.brain = newBrain(); e.vx = 0; e.vz = 0; e.vy = 0; e.lock = 0;
    e.y = Math.max(e.y, supportAt(e.x, e.z, e.y, false, e.w));
    this.ev({ k: 'bot', id });
  }
}

export { HALF, CORE_STATE };
