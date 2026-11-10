// One round of horror.exe: who is EXE, the clock, shards, hits, knockdowns, revives, exits and the result.
// The server runs this for online rooms; the browser runs the very same code for solo games.
import { ROUND, SURV, EXE, CHARS, CHAR_IDS, VARIANTS, VARIANT_IDS, F, ST, PHASES, moveSpeed, tickStamina } from './rules.js';
import { SHARD_SPOTS, EXITS, SPAWNS, HALF, supportAt, terrainH, clampXZ } from './map.js';
import { stepMove, body } from './move.js';
import { newBrain, thinkSurv, thinkExe } from './bots.js';
import { rng, shuffle, turnTo, clamp } from './util.js';
import { randomLook, sanitizeLook } from './looks.js';

const BOT_NAMES = ['Nova', 'Milo', 'Juno', 'Pixel', 'Rex', 'Kiki', 'Bean', 'Ziggy', 'Lumi', 'Taro', 'Moss', 'Echo'];
const r2 = (v) => Math.round(v * 100) / 100;

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
    this.shards = spots.map((s, i) => ({ i, spot: s.i, x: s.x, y: s.y, z: s.z, via: s.via, entry: s.entry, taken: 0, prog: 0, by: 0, lit: i < ROUND.LIT }));
    this.relight = [];
    this.exits = shuffle(EXITS.slice(), this.rand).slice(0, ROUND.EXITS).sort((a, b) => a.i - b.i).map((g) => ({ ...g, open: false }));

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
    const y = supportAt(sp.x, sp.z, 50);
    const e = body(sp.x, y, sp.z, role === 'exe' ? EXE.radius : SURV.radius, role === 'exe' ? EXE.height : SURV.height);
    Object.assign(e, {
      id: p.id, name: String(p.name || 'Player').slice(0, 16), bot, role, ry: sp.ry,
      look: sanitizeLook(p.look), char: CHARS[p.char] ? p.char : 'bolt', variant: VARIANTS[p.variant] ? p.variant : 'exe',
      hp: SURV.hp, st: ST.alive, downT: 0, revP: 0, reviving: false, sprinting: false,
      sta: { stamina: SURV.stamina, exhausted: false, rest: 0 },
      cd: { abl: 0, atk: 0, sense: 0 },
      fx: { stun: 0, boost: 0, invuln: 0, fade: 0, reveal: 0, dash: 0, fly: 0, lunge: 0, recover: 0, atk: 0 },
      lungeHit: new Set(), teleportOk: 0, lastIn: 0,
      stats: { shards: 0, revives: 0, hits: 0, downs: 0 },
      brain: bot ? newBrain() : null,
    });
    this.ents.set(e.id, e);
    return e;
  }

  survivors() { const out = []; for (const e of this.ents.values()) if (e.role === 'surv') out.push(e); return out; }
  exeEnt() { for (const e of this.ents.values()) if (e.role === 'exe') return e; return null; }
  ev(m) { this.events.push(m); }
  drain() { const ev = this.events; this.events = []; return ev; }

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
    if (e.reviving) f |= F.REVIVING;
    if (e.water) f |= F.WATER;
    return f;
  }

  /** Everything that changes, compact enough to send 15 times a second. */
  snapshot() {
    let sh = 0, sa = 0;
    for (const s of this.shards) { if (s.taken) sh |= 1 << s.i; if (s.lit) sa |= 1 << s.i; }
    const p = [];
    for (const e of this.ents.values()) {
      p.push([e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.ry), e.hp, e.st, this.flagsOf(e), e.st === ST.down ? Math.ceil(e.downT) : 0, Math.round(e.revP * 100),
        e.role === 'surv' ? Math.round(e.cd.abl * 10) / 10 : Math.round(Math.max(e.cd.abl, 0) * 10) / 10]);
    }
    const sp = [];
    for (const s of this.shards) if (!s.taken && s.prog > 0) sp.push(s.i, Math.round(s.prog * 100));
    return { ph: PHASES.indexOf(this.phase), tl: Math.max(0, Math.round(this.timeLeft() * 10) / 10), sh, sa, sp, ex: this.exitsOpen ? 1 : 0, rt: Math.round(this.time * 100) / 100, p };
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
    e.sprinting = e.role === 'surv' && e.st === ST.alive ? tickStamina(e.sta, inp.sprint, moving, dt) : false;
    const speed = moveSpeed(e.role, e.role === 'exe' ? e.variant : e.char, e.st, this.flagsOf(e), this.phase, e.sprinting);
    const fly = e.fx.fly > this.time && e.st === ST.alive;
    const r = stepMove(e, { dx: inp.dx, dz: inp.dz, speed, jump: inp.jump && e.st === ST.alive, jumpV: e.role === 'exe' ? EXE.jump : SURV.jump, fly, up: inp.up }, dt);
    if (r.spring) this.ev({ k: 'spring', id: e.id, i: r.spring.i });
    if ((inp.face === null || inp.face === undefined) && e.lock <= 0 && Math.hypot(e.vx, e.vz) > 0.6) e.ry = turnTo(e.ry, Math.atan2(e.vx, e.vz), 9 * dt);
  }

  /** A person's own movement report: { x, y, z, ry, f (F.SPRINT | F.AIR | F.WATER) }. */
  input(id, s) {
    const e = this.ents.get(id);
    if (!e || e.bot || e.st === ST.out || e.st === ST.esc) return;
    const x = Number(s.x), y = Number(s.y), z = Number(s.z), ry = Number(s.ry);
    if (![x, y, z, ry].every(Number.isFinite)) return;
    if (Number.isFinite(ry)) e.ry = ry;
    const jump = Math.hypot(x - e.x, z - e.z);
    if (jump > 30 && this.time >= e.teleportOk) return; // ignore impossible jumps (except a blink)
    const now = this.time, dtIn = Math.max(0.03, now - (e.lastIn || now - 0.066));
    e.vx = (x - e.x) / dtIn; e.vz = (z - e.z) / dtIn; e.lastIn = now;
    const p = clampXZ({ x, z });
    e.x = p.x; e.z = p.z; e.y = clamp(y, terrainH(p.x, p.z) - 3, 60);
    const f = s.f | 0;
    e.sprinting = !!(f & F.SPRINT); e.ground = !(f & F.AIR); e.water = !!(f & F.WATER);
  }

  /** k: 'atk' (EXE swing), 'abl' (character ability), 'sense' (EXE scream). Returns true if it happened. */
  action(id, a) {
    const e = this.ents.get(id), t = this.time;
    if (!e || e.st !== ST.alive || this.phase === 'over' || !a) return false;
    if (e.role === 'exe') {
      if (this.phase === 'intro' || e.fx.stun > t) return false;
      const v = VARIANTS[e.variant];
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
          if (e.bot) {
            const p = clampXZ({ x: e.x + Math.sin(e.ry) * v.dist, z: e.z + Math.cos(e.ry) * v.dist });
            this.ev({ k: 'blink', id, x0: r2(e.x), y0: r2(e.y), z0: r2(e.z) });
            e.x = p.x; e.z = p.z; e.y = supportAt(p.x, p.z, terrainH(p.x, p.z) + 0.5); e.vy = 0;
          } else this.ev({ k: 'blink', id, x0: r2(e.x), y0: r2(e.y), z0: r2(e.z) });
        } else if (v.ability === 'fade') e.fx.fade = t + v.dur;
        this.ev({ k: 'abl', id, ab: v.ability });
        return true;
      }
      if (a.k === 'sense') {
        if (t < e.cd.sense) return false;
        e.cd.sense = t + EXE.senseCd;
        const ids = [];
        for (const s of this.survivors()) {
          if (s.st !== ST.alive) continue;
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
    // punch / bonk: needs EXE close and in front
    const x = this.exeEnt();
    let hit = false;
    if (x && x.st === ST.alive) {
      const dx = x.x - e.x, dz = x.z - e.z, d = Math.hypot(dx, dz);
      const front = d < 0.01 || (Math.sin(e.ry) * dx + Math.cos(e.ry) * dz) / d > -0.1;
      if (d < c.range + (e.bot ? 0 : 1) && Math.abs(x.y - e.y) < 3 && front) {
        hit = true;
        x.fx.stun = Math.max(x.fx.stun, t + c.dur); x.fx.lunge = 0;
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

  victimFor(x, range) {
    let best = null, bd = Infinity;
    const fx = Math.sin(x.ry), fz = Math.cos(x.ry);
    for (const s of this.survivors()) {
      if (s.st !== ST.alive) continue;
      const dx = s.x - x.x, dz = s.z - x.z, d = Math.hypot(dx, dz);
      if (d > range || Math.abs(s.y - x.y) > 3) continue;
      if (d > 1.0 && (fx * dx + fz * dz) / d < EXE.atkDot) continue;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  hit(x, s) {
    const t = this.time;
    if (s.st !== ST.alive || s.fx.invuln > t || s.fx.dash > t) return false;
    s.hp--;
    x.stats.hits++;
    x.fx.recover = t + EXE.recoverTime;
    x.fx.lunge = 0;
    if (s.hp > 0) {
      s.fx.boost = t + SURV.boostTime; s.fx.invuln = t + SURV.invulnTime;
      this.ev({ k: 'hit', id: s.id, by: x.id, hp: s.hp });
    } else {
      s.st = ST.down; s.downT = SURV.downTime; s.revP = 0; s.fx.fly = 0; s.fx.boost = 0;
      x.stats.downs++;
      this.ev({ k: 'down', id: s.id, by: x.id });
    }
    if (s.bot) { const n = Math.hypot(s.x - x.x, s.z - x.z) || 1; s.vx = ((s.x - x.x) / n) * 9; s.vz = ((s.z - x.z) / n) * 9; s.vy = 5; s.ground = false; s.lock = 0.25; }
    return true;
  }

  resolve(dt) {
    const t = this.time, surv = this.survivors(), x = this.exeEnt();
    // a lunge tears through anyone it passes
    if (x && x.fx.lunge > t) {
      for (const s of surv) {
        if (s.st !== ST.alive || x.lungeHit.has(s.id)) continue;
        if (Math.hypot(s.x - x.x, s.z - x.z) < 2.6 + (x.bot ? 0 : 0.8) && Math.abs(s.y - x.y) < 3) { x.lungeHit.add(s.id); this.hit(x, s); }
      }
    }
    // shards: stand next to one for a few seconds to absorb it (several people absorb faster)
    while (this.relight.length && this.relight[0] <= t) {
      this.relight.shift();
      const next = this.shards.find((q) => !q.lit && !q.taken);
      if (next) { next.lit = true; this.ev({ k: 'lit', i: next.i }); }
    }
    for (const sh of this.shards) {
      if (sh.taken || !sh.lit) continue;
      let n = 0, who = null;
      for (const s of surv) {
        if (s.st !== ST.alive || Math.hypot(s.x - sh.x, s.z - sh.z) > SURV.pickupRange || Math.abs(s.y + 1.1 - sh.y) > 2.6) continue;
        n++; if (!who || s.id === sh.by) who = s;
      }
      if (n) {
        sh.prog += (dt / SURV.shardTime) * (1 + (n - 1) * 0.5); sh.by = who.id;
        if (sh.prog >= 1) {
          sh.taken = who.id; sh.prog = 1; who.stats.shards++;
          this.relight.push(t + ROUND.RELIGHT);
          const got = this.shards.filter((q) => q.taken).length;
          this.ev({ k: 'shard', i: sh.i, by: who.id, n: got });
          if (got >= this.shards.length) this.openExits('shards');
        }
      } else sh.prog = Math.max(0, sh.prog - dt * 0.15);
    }
    for (const s of surv) {
      if (s.st !== ST.alive) continue;
      if (this.exitsOpen) {
        for (const g of this.exits) {
          if (Math.hypot(s.x - g.x, s.z - g.z) < SURV.exitRange && Math.abs(s.y - g.y) < 4) {
            s.st = ST.esc; s.fx.fly = 0;
            this.ev({ k: 'esc', id: s.id });
            break;
          }
        }
      }
    }
    for (const s of surv) {
      if (s.st !== ST.down) { s.reviving = false; continue; }
      let rate = 0, by = null;
      for (const o of surv) {
        if (o === s || o.st !== ST.alive) continue;
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
    const surv = this.survivors();
    if (!surv.some((s) => s.st === ST.alive)) this.finish();
  }

  finish() {
    if (this.phase === 'over') return;
    for (const s of this.survivors()) if (s.st === ST.alive || s.st === ST.down) { s.st = ST.out; s.caught = true; }
    const escaped = this.survivors().filter((s) => s.st === ST.esc).map((s) => s.id);
    this.result = {
      win: escaped.length ? 'surv' : 'exe',
      escaped,
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
    e.y = Math.max(e.y, supportAt(e.x, e.z, e.y));
    this.ev({ k: 'bot', id });
  }
}

export { HALF };
