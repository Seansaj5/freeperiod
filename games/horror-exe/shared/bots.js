// Bot brains. Survivors hunt shards, flee EXE, revive friends and run for the exits;
// a bot EXE hunts whoever it can see or hear about. Decisions run ~8 times a second, steering every tick.
import { CHARS, VARIANTS, SURV, EXE, ST } from './rules.js';
import { terrainH, solidAt, lineOfSight, SPRINGS, MAX_SLOPE, HALF } from './map.js';

export const newBrain = () => ({
  mode: 'idle', tx: 0, tz: 0, arrive: 0.6, dir: null, think: 0, sprint: false, jump: false, act: null, face: null,
  stuck: 0, detour: 0, detourA: 0, px: 0, pz: 0, check: 0, claim: -1, entryDone: null, flyUp: 0,
  targetId: null, noTarget: 0, lastSeen: null, wander: null,
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearest = (list, e) => { let best = null, bd = Infinity; for (const o of list) { const d = dist(o, e); if (d < bd) { bd = d; best = o; } } return best; };

function probeFree(e, a, d) {
  const x = e.x + Math.sin(a) * d, z = e.z + Math.cos(a) * d;
  if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) return false;
  const g = terrainH(x, z);
  if (g > e.y + 0.4 && (g - terrainH(e.x, e.z)) / d > MAX_SLOPE * 0.85) return false;
  if (solidAt(x, z, Math.max(e.y, g), e.r + 0.15, e.h)) return false;
  const mx = e.x + Math.sin(a) * d * 0.5, mz = e.z + Math.cos(a) * d * 0.5;
  return !solidAt(mx, mz, Math.max(e.y, terrainH(mx, mz)), e.r + 0.1, e.h);
}

const OFFS = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0, 2.7, -2.7];
function steerDir(e, b, want) {
  if (b.detour > 0) return b.detourA;
  for (const o of OFFS) if (probeFree(e, want + o, 2.4)) return want + o;
  return want + Math.PI;
}

function goal(e, b, x, z, mode, arrive = 0.6) {
  b.mode = mode; b.tx = x; b.tz = z; b.arrive = arrive;
  b.dir = steerDir(e, b, Math.atan2(x - e.x, z - e.z));
}

/** Notices when a bot that wants to move is not getting anywhere, and sends it sideways for a moment. */
function tickStuck(R, e, b, dt) {
  if (b.detour > 0) b.detour -= dt;
  b.check -= dt;
  if (b.check > 0) return;
  b.check = 0.6;
  const moved = Math.hypot(e.x - b.px, e.z - b.pz);
  b.px = e.x; b.pz = e.z;
  const wants = b.mode !== 'idle' && b.mode !== 'stay' && Math.hypot(b.tx - e.x, b.tz - e.z) > b.arrive + 0.5;
  if (wants && moved < 0.9 && e.lock <= 0) b.stuck++;
  else b.stuck = 0;
  if (b.stuck >= 2) {
    b.stuck = 0; b.detour = 1.0 + R.rand() * 0.8;
    b.detourA = Math.atan2(b.tx - e.x, b.tz - e.z) + (R.rand() < 0.5 ? -1 : 1) * (1.4 + R.rand() * 1.2);
    b.jump = true;
  }
}

/** Where to walk to reach a spot that may need an entry point (tunnel ends, the bridge) or a spring. */
function routeTo(e, b, spot, mode) {
  const key = `${mode}:${spot.x},${spot.z}`;
  if (b.entryDone !== key && spot.entry && dist(e, spot) > 4 && !(Math.abs(e.y - spot.y) < 1.6 && e.y > 0.5 && dist(e, spot) < 8)) {
    const en = nearest(spot.entry, e);
    if (dist(e, en) > 1.6) { goal(e, b, en.x, en.z, mode, 1.2); return; }
    b.entryDone = key;
  }
  goal(e, b, spot.x, spot.z, mode, 0.3);
}

// ------------------------------------------------------------------ survivors
function decideSurv(R, e, b) {
  const t = R.time, c = CHARS[e.char];
  const team = R.survivors();
  if (e.st === ST.down) {
    const m = nearest(team.filter((s) => s !== e && s.st === ST.alive), e);
    if (m) goal(e, b, m.x, m.z, 'crawl', 1); else b.mode = 'idle';
    b.sprint = false;
    return;
  }
  const x = R.exeEnt();
  const dx = x ? dist(x, e) : 999;
  const fading = x && x.fx.fade > t;
  const threatR = (e.hp < SURV.hp ? 30 : 24) * (fading ? 0.3 : 1);
  if (x && x.st === ST.alive && R.phase !== 'intro' && dx < threatR && (dx < 12 || lineOfSight(e.x, e.y + 1.8, e.z, x.x, x.y + 2.4, x.z))) {
    const away = Math.atan2(e.x - x.x, e.z - x.z);
    let best = away, bestScore = -Infinity;
    for (const o of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = away + o;
      if (!probeFree(e, a, 3)) continue;
      const px = e.x + Math.sin(a) * 12, pz = e.z + Math.cos(a) * 12;
      const edge = Math.max(0, Math.max(Math.abs(px), Math.abs(pz)) - 68);
      const score = Math.hypot(px - x.x, pz - x.z) - edge * 3 - Math.abs(o) * 2;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    b.mode = 'flee'; b.tx = e.x + Math.sin(best) * 10; b.tz = e.z + Math.cos(best) * 10; b.arrive = 0;
    b.dir = b.detour > 0 ? b.detourA : best;
    b.sprint = true;
    if (t >= e.cd.abl && R.rand() < 0.7) {
      if (c.ability === 'dash' && dx < 5.5) { b.act = 'abl'; b.face = best; }
      else if (c.ability === 'fly' && dx < 6.5) { b.act = 'abl'; b.flyUp = 1.9; }
      else if ((c.ability === 'punch' || c.ability === 'bonk') && dx < 3.0 && x.fx.stun <= t) { b.act = 'abl'; b.face = Math.atan2(x.x - e.x, x.z - e.z); }
    }
    return;
  }
  b.sprint = false;
  const downed = team.filter((s) => s.st === ST.down);
  if (downed.length && (!x || dx > 22)) {
    const d = nearest(downed, e), dd = dist(d, e);
    if (dd < 75) {
      if (dd < 1.4) { b.mode = 'stay'; b.dir = null; }
      else { goal(e, b, d.x, d.z, 'revive', 1.1); b.sprint = dd > 12 && e.sta.stamina > 40; }
      return;
    }
  }
  if (R.exitsOpen) {
    const g = nearest(R.exits, e);
    goal(e, b, g.x, g.z, 'exit', 0.3);
    b.sprint = e.sta.stamina > 30;
    return;
  }
  const free = R.shards.filter((s) => !s.taken && s.lit);
  if (free.length) {
    let s = free.find((f) => f.i === b.claim);
    if (!s) {
      const others = new Set(team.filter((o) => o !== e && o.brain).map((o) => o.brain.claim));
      let bd = Infinity;
      for (const f of free) { const d = dist(f, e) + (others.has(f.i) ? 60 : 0) + (f.via ? 18 : 0); if (d < bd) { bd = d; s = f; } }
      b.claim = s.i;
    }
    if (s.via && e.y < s.y - 3.2) routeTo(e, b, SPRINGS[nearest(s.via.map((i) => SPRINGS[i]), e).i], 'spring');
    else if (dist(s, e) < 1.2 && Math.abs(e.y + 1.1 - s.y) < 2.6) { b.mode = 'stay'; b.dir = null; }
    else routeTo(e, b, s, 'shard');
    b.sprint = e.sta.stamina > 70 && dist(s, e) > 18;
    return;
  }
  if (!b.wander || dist(b.wander, e) < 3) b.wander = { x: (R.rand() * 2 - 1) * 50, z: (R.rand() * 2 - 1) * 50 };
  goal(e, b, b.wander.x, b.wander.z, 'wander', 2);
}

export function thinkSurv(R, e, dt) {
  const b = e.brain, t = R.time;
  tickStuck(R, e, b, dt);
  b.think -= dt;
  if (b.think <= 0) { b.think = 0.1 + R.rand() * 0.06; decideSurv(R, e, b); }
  const inp = { dx: 0, dz: 0, sprint: b.sprint, jump: b.jump, fly: e.fx.fly > t, up: false, act: b.act, face: b.face };
  b.jump = false; b.act = null; b.face = null;
  if (b.mode !== 'idle' && b.mode !== 'stay' && b.dir !== null && Math.hypot(b.tx - e.x, b.tz - e.z) > b.arrive) {
    const a = b.detour > 0 ? b.detourA : b.dir;
    inp.dx = Math.sin(a); inp.dz = Math.cos(a);
  }
  if (inp.fly) { b.flyUp -= dt; inp.up = b.flyUp > 0; }
  return inp;
}

// ------------------------------------------------------------------ EXE
function decideExe(R, e, b) {
  const t = R.time, v = VARIANTS[e.variant];
  let target = null, best = Infinity;
  for (const s of R.survivors()) {
    if (s.st !== ST.alive) continue;
    const d = dist(s, e);
    const known = s.fx.reveal > t || d < 26 || (d < 60 && lineOfSight(e.x, e.y + 2.6, e.z, s.x, s.y + 1.5, s.z));
    if (!known) continue;
    const score = d - (s.hp < SURV.hp ? 6 : 0) - (s.id === b.targetId ? 6 : 0) + (s.fx.invuln > t ? 8 : 0);
    if (score < best) { best = score; target = s; }
  }
  if (target) {
    b.targetId = target.id; b.noTarget = 0; b.lastSeen = { x: target.x, z: target.z };
    const d = dist(target, e), lead = Math.min(0.5, d / 20);
    const px = target.x + (target.vx || 0) * lead, pz = target.z + (target.vz || 0) * lead;
    goal(e, b, px, pz, 'chase', 0);
    const facing = Math.atan2(target.x - e.x, target.z - e.z);
    if (d < EXE.atkRange * 0.8 && t >= e.cd.atk && target.fx.invuln <= t && Math.abs(target.y - e.y) < 2.5) { b.face = facing; b.act = 'atk'; }
    else if (t >= e.cd.abl && R.rand() < 0.5) {
      if (v.ability === 'lunge' && d > 4 && d < 9.5) { b.face = facing; b.act = 'abl'; }
      else if (v.ability === 'blink' && d > 10 && d < 22) { b.face = facing; b.act = 'abl'; }
      else if (v.ability === 'fade' && d > 14 && d < 45) b.act = 'abl';
    }
    if (target.y > e.y + 1.2 && d < 6) b.jump = true;
    return;
  }
  b.targetId = null; b.noTarget += 0.12;
  if (b.noTarget > 4 && t >= e.cd.sense) b.act = 'sense';
  if (b.lastSeen && dist(b.lastSeen, e) > 3) { goal(e, b, b.lastSeen.x, b.lastSeen.z, 'search', 2); return; }
  b.lastSeen = null;
  if (!b.wander || dist(b.wander, e) < 4 || b.noTarget > 14) {
    b.noTarget = Math.min(b.noTarget, 5);
    const alive = R.survivors().filter((s) => s.st === ST.alive);
    if (alive.length && R.rand() < 0.75) {
      const s = alive[Math.floor(R.rand() * alive.length)];
      b.wander = { x: s.x + (R.rand() * 2 - 1) * 10, z: s.z + (R.rand() * 2 - 1) * 10 };
    } else {
      const spots = R.shards.filter((s) => !s.taken && s.lit && !s.via);
      const s = spots.length ? spots[Math.floor(R.rand() * spots.length)] : { x: (R.rand() * 2 - 1) * 60, z: (R.rand() * 2 - 1) * 60 };
      b.wander = { x: s.x, z: s.z };
    }
  }
  goal(e, b, b.wander.x, b.wander.z, 'patrol', 3);
}

export function thinkExe(R, e, dt) {
  const b = e.brain;
  tickStuck(R, e, b, dt);
  b.think -= dt;
  if (b.think <= 0) { b.think = 0.12 + R.rand() * 0.05; decideExe(R, e, b); }
  const inp = { dx: 0, dz: 0, sprint: false, jump: b.jump, fly: false, up: false, act: b.act, face: b.face };
  b.jump = false; b.act = null; b.face = null;
  if (R.phase === 'intro') return inp;
  if (b.mode !== 'idle' && b.dir !== null && Math.hypot(b.tx - e.x, b.tz - e.z) > b.arrive) {
    const a = b.detour > 0 ? b.detourA : b.dir;
    inp.dx = Math.sin(a); inp.dz = Math.cos(a);
  }
  return inp;
}
