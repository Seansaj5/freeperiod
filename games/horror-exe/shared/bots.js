// Bot brains. Survivors work on zone tasks in both worlds (using rift portals on purpose), flee EXE,
// revive friends and run for the gates; a bot EXE hunts, hops between worlds and disguises itself in the
// normal world. Decisions run ~8 times a second, steering every tick.
import { CHARS, VARIANTS, SURV, EXE, ST, F, HIDE } from './rules.js';
import { terrainH, solidAt, supportAt, lineOfSight, surfaceAt, SPRINGS, PORTALS, OBJ, LOCKERS, MAX_SLOPE, HALF, CAVE, STEP } from './map.js';

export const newBrain = () => ({
  mode: 'idle', tx: 0, tz: 0, arrive: 0.6, dir: null, think: 0, sprint: false, jump: false, act: null, face: null,
  stuck: 0, detour: 0, detourA: 0, px: 0, pz: 0, check: 0, claim: null, entryDone: null, flyUp: 0,
  targetId: null, noTarget: 0, lastSeen: null, wander: null, wantPortal: false, lastW: -1,
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearest = (list, e) => { let best = null, bd = Infinity; for (const o of list) { const d = dist(o, e); if (d < bd) { bd = d; best = o; } } return best; };

function probeFree(e, b, a, d) {
  const x = e.x + Math.sin(a) * d, z = e.z + Math.cos(a) * d;
  if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) return false;
  const g = terrainH(x, z);
  if (g > e.y + 0.4 && (g - terrainH(e.x, e.z)) / d > MAX_SLOPE * 0.85) return false;
  // stairs and low ledges count as walkable: anything that rises about a step per meter
  const foot = (px, pz, dd) => Math.max(e.y, supportAt(px, pz, e.y + Math.max(0, dd * 0.62 - STEP), false, e.w));
  if (solidAt(x, z, foot(x, z, d), e.r + 0.15, e.h, e.w)) return false;
  const mx = e.x + Math.sin(a) * d * 0.5, mz = e.z + Math.cos(a) * d * 0.5;
  if (solidAt(mx, mz, foot(mx, mz, d * 0.5), e.r + 0.1, e.h, e.w)) return false;
  const s = surfaceAt(x, z, g + 0.05);
  if ((s === 'lava' || s === 'goo') && e.surface !== s) return false;
  if (!b.wantPortal) for (const p of PORTALS) if (Math.hypot(e.x - p.x, e.z - p.z) > 3.2 && (Math.hypot(x - p.x, z - p.z) < 2.8 || Math.hypot(mx - p.x, mz - p.z) < 2.6)) return false;
  return true;
}

const OFFS = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0, 2.7, -2.7];
function steerDir(e, b, want) {
  if (b.detour > 0) return b.detourA;
  for (const o of OFFS) if (probeFree(e, b, want + o, 2.4)) return want + o;
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

/** Walks to spot, through its entry point first when it has one (doorways, stairs, cave mouths, the bridge). */
function routeTo(e, b, spot, mode) {
  const key = `${mode}:${spot.x},${spot.z}`;
  const below = spot.y !== undefined && spot.y - (e.y + 1.1) > 2;
  if (below && b.entryDone === key && dist(e, spot) < 5) b.entryDone = null; // fell off: go around again
  const sameLevelClose = !below && dist(e, spot) < 8 && Math.abs(e.y + 1.1 - (spot.y ?? e.y + 1.1)) < 1.6;
  if (b.entryDone !== key && spot.entry && (below || (dist(e, spot) > 4 && !sameLevelClose))) {
    const en = nearest(spot.entry, e);
    if (dist(e, en) > 1.6) { goal(e, b, en.x, en.z, mode, 1.2); return; }
    b.entryDone = key;
  }
  goal(e, b, spot.x, spot.z, mode, 0.3);
}

/** Heads for the nearest portal (to change worlds). */
function toPortal(e, b) {
  b.wantPortal = true;
  const p = nearest(PORTALS, e);
  goal(e, b, p.x, p.z, 'portal', 0.2);
}

/** Inside the ice cave and need to go somewhere else: walk out of the mouth first. */
const inCave = (e) => e.x > CAVE.x0 && e.x < CAVE.x1 && e.z > CAVE.z0 && e.z < CAVE.z1 - 2;

// ------------------------------------------------------------------ survivors
/** Every unfinished task spot, with the world it lives in. */
function taskSpots(R, e) {
  const out = [];
  for (const s of R.shards) if (!s.taken && s.lit) out.push({ key: `s${s.i}`, ...s, w: 0 });
  for (const v of R.valves) if (!v.done) out.push({ key: `v${v.i}`, ...v, w: 0 });
  for (const p of R.panels) if (!p.done) out.push({ key: `p${p.i}`, ...p, w: 1 });
  for (const bl of R.bells) if (!bl.done) out.push({ key: `b${bl.i}`, ...bl, w: 1 });
  const c = R.core;
  if (c.state === 0 || c.state === 2) out.push({ key: 'core', x: c.x, y: c.y + 1.1, z: c.z, entry: c.state === 0 ? c.entry : null, w: 1 });
  return out;
}

function decideSurv(R, e, b) {
  const t = R.time, c = CHARS[e.char];
  const team = R.survivors();
  if (b.lastW !== e.w) { b.lastW = e.w; b.wantPortal = false; b.entryDone = null; }
  if (e.qte) { b.mode = 'stay'; return; }
  if (e.hidden) {
    // wait until EXE has wandered off (never long enough to get dragged out)
    const xh = R.exeEnt();
    const near = xh && xh.w === e.w && dist(xh, e) < 18;
    if (e.hideT > HIDE.warn - 1.5 || (!near && e.hideT > b.hideFor)) b.act = 'hide';
    b.mode = 'stay';
    return;
  }
  if (e.st === ST.down) {
    const m = nearest(team.filter((s) => s !== e && s.st === ST.alive && s.w === e.w), e);
    if (m) goal(e, b, m.x, m.z, 'crawl', 1); else b.mode = 'idle';
    b.sprint = false;
    return;
  }
  const x = R.exeEnt();
  // a disguised EXE looks like a teammate, unless it copied me, the real one is in this world too, or a gut feeling says so
  let spotted = false;
  if (x && x.disguise && x.w === e.w && dist(x, e) < 9) {
    const real = R.ents.get(x.disguise);
    if (x.disguise === e.id || (real && real.w === e.w && real.st === ST.alive)) spotted = true;
    else {
      if (b.susId !== x.id || t > b.susT) { b.susId = x.id; b.susT = t + 8; b.sus = R.rand() < 0.25; }
      spotted = b.sus;
    }
  }
  let visibleExe = x && x.st === ST.alive && x.w === e.w && (!x.disguise || x.fx.pop > t || spotted);
  let threat = visibleExe ? x : null;
  // a Grin decoy looks just like the real thing
  for (const d of R.decoys) if (d.w === e.w && dist(d, e) < 20 && (!threat || dist(d, e) < dist(threat, e))) { threat = d; visibleExe = true; }
  const dx = visibleExe ? dist(threat, e) : 999;
  const fading = visibleExe && x.fx.fade > t;
  const threatR = (e.hp < SURV.hp ? 30 : 24) * (fading ? 0.3 : 1);
  if (visibleExe && R.phase !== 'intro' && dx < threatR && (dx < 12 || lineOfSight(e.x, e.y + 1.8, e.z, threat.x, threat.y + 2.4, threat.z, e.w))) {
    b.wantPortal = false;
    // a locker close by and EXE not right on top of us: hide in it
    if (dx > HIDE.seenRange + 1 && t >= e.cd.hide && !e.carrying) {
      const lk = LOCKERS.find((l) => Math.hypot(l.fx - e.x, l.fz - e.z) < 9 && Math.abs(l.y - e.y) < 1.5 && !team.some((o) => o.hidden === l.i + 1));
      if (lk) {
        if (Math.hypot(lk.fx - e.x, lk.fz - e.z) < 1.5) { b.act = 'hide'; b.hideFor = 4 + R.rand() * 5; }
        else { b.mode = 'tolocker'; b.tx = lk.fx; b.tz = lk.fz; b.arrive = 0.5; b.dir = steerDir(e, b, Math.atan2(lk.fx - e.x, lk.fz - e.z)); b.sprint = true; }
        return;
      }
    }
    const x = threat;
    const away = Math.atan2(e.x - x.x, e.z - x.z);
    let best = away, bestScore = -Infinity;
    for (const o of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = away + o;
      if (!probeFree(e, b, a, 3)) continue;
      const px = e.x + Math.sin(a) * 12, pz = e.z + Math.cos(a) * 12;
      const edge = Math.max(0, Math.max(Math.abs(px), Math.abs(pz)) - (HALF - 20));
      const score = Math.hypot(px - x.x, pz - x.z) - edge * 3 - Math.abs(o) * 2;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    b.mode = 'flee'; b.tx = e.x + Math.sin(best) * 10; b.tz = e.z + Math.cos(best) * 10; b.arrive = 0;
    b.dir = b.detour > 0 ? b.detourA : best;
    b.sprint = true;
    const realExe = threat && threat.fx && threat === x;
    if (!R.inField(e) && R.rand() < 0.6) {
      const r = c.r.id, q = e.unlockQ ? c.q.id : null, rd = t >= e.cd.ab2, qd = q && t >= e.cd.ab3;
      const faceX = Math.atan2(threat.x - e.x, threat.z - e.z);
      if (qd && q === 'after' && dx < 7) { b.act = 'ab3'; return; }
      if (qd && q === 'iron' && dx < 4 && e.hp <= 150) { b.act = 'ab3'; return; }
      if (qd && q === 'spin' && dx < 4 && realExe) { b.act = 'ab3'; return; }
      if (rd && r === 'wind' && e.sta.stamina < 30) { b.act = 'ab2'; return; }
      if (rd && r === 'wrench' && dx > 4 && dx < 14 && realExe) { b.act = 'ab2'; b.face = faceX; return; }
      if (rd && r === 'pound' && dx < 5 && realExe) { b.act = 'ab2'; return; }
      if (rd && r === 'heal' && e.hp <= 150) { b.act = 'ab2'; return; }
    }
    if (t >= e.cd.abl && R.rand() < 0.7 && !R.inField(e)) {
      if (c.ability === 'dash' && dx < 5.5) { b.act = 'abl'; b.face = best; }
      else if (c.ability === 'fly' && dx < 6.5) { b.act = 'abl'; b.flyUp = 1.9; }
      else if ((c.ability === 'punch' || c.ability === 'bonk') && dx < 3.0 && realExe && x.fx.stun <= t) { b.act = 'abl'; b.face = Math.atan2(x.x - e.x, x.z - e.z); }
    }
    return;
  }
  b.sprint = false;
  if (c.r.id === 'heal' && t >= e.cd.ab2 && team.some((o) => o.st === ST.alive && o.w === e.w && o.hp <= 200 && dist(o, e) < c.r.range)) { b.act = 'ab2'; }
  if (e.unlockQ && c.q.id === 'turbo' && t >= e.cd.ab3 && b.mode === 'stay') b.act = 'ab3';
  // revive a teammate in this world
  const downed = team.filter((s) => s.st === ST.down && s.w === e.w);
  if (downed.length && (!visibleExe || dx > 22)) {
    const d = nearest(downed, e), dd = dist(d, e);
    if (dd < 80) {
      b.wantPortal = false;
      if (dd < 1.4) { b.mode = 'stay'; b.dir = null; }
      else { goal(e, b, d.x, d.z, 'revive', 1.1); b.sprint = dd > 12 && e.sta.stamina > 40; }
      return;
    }
  }
  // gates open: get to the corrupted world and run for the nearest gate
  if (R.exitsOpen) {
    if (e.w !== 1) { toPortal(e, b); b.sprint = e.sta.stamina > 30; return; }
    b.wantPortal = false;
    if (inCave(e)) { goal(e, b, OBJ.core.entry[0].x, OBJ.core.entry[0].z, 'exit', 1); b.sprint = true; return; }
    const g = nearest(R.exits, e);
    goal(e, b, g.x, g.z, 'exit', 0.3);
    b.sprint = e.sta.stamina > 30;
    return;
  }
  // carrying the fire core: bring it to the engine
  if (e.carrying) {
    b.wantPortal = false;
    if (inCave(e)) goal(e, b, OBJ.core.entry[0].x, OBJ.core.entry[0].z, 'carry', 1);
    else goal(e, b, OBJ.engine.x, OBJ.engine.z, 'carry', 0.5);
    b.sprint = e.sta.stamina > 50;
    return;
  }
  // pick a task (prefer this world, spread out across bots)
  const spots = taskSpots(R, e);
  if (spots.length) {
    let s = spots.find((f) => f.key === b.claim);
    if (!s) {
      const others = new Set(team.filter((o) => o !== e && o.brain).map((o) => o.brain.claim));
      let bd = Infinity;
      for (const f of spots) {
        const d = dist(f, e) + (f.w !== e.w ? 45 : 0) + (others.has(f.key) ? 90 : 0) + (f.via ? 15 : 0);
        if (d < bd) { bd = d; s = f; }
      }
      b.claim = s.key;
    }
    if (s.w !== e.w) { toPortal(e, b); b.sprint = e.sta.stamina > 70; return; }
    b.wantPortal = false;
    if (inCave(e) && s.key !== 'core') { goal(e, b, OBJ.core.entry[0].x, OBJ.core.entry[0].z, 'task', 1); return; }
    if (s.via && e.y < s.y - 3.2) routeTo(e, b, SPRINGS[nearest(s.via.map((i) => SPRINGS[i]), e).i], 'spring');
    else if (dist(s, e) < 1.2 && Math.abs(e.y + 1.1 - s.y) < 2.6) { b.mode = 'stay'; b.dir = null; }
    else routeTo(e, b, s, 'task');
    b.sprint = e.sta.stamina > 70 && dist(s, e) > 18;
    return;
  }
  b.wantPortal = false;
  if (!b.wander || dist(b.wander, e) < 3) b.wander = { x: (R.rand() * 2 - 1) * 60, z: (R.rand() * 2 - 1) * 60 };
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
  if (b.lastW !== e.w) { b.lastW = e.w; b.wantPortal = false; b.noTarget = 0; b.wander = null; b.lastSeen = null; }
  const alive = R.survivors().filter((s) => s.st === ST.alive);
  let target = null, best = Infinity;
  const cands = alive.filter((s) => s.w === e.w && !s.hidden && !(s.fx.invis > t)).concat(R.ghosts.filter((g) => g.w === e.w).map((g) => ({ ...g, fx: { reveal: 0, invuln: 0 }, hp: 100, ghost: true })));
  for (const s of cands) {
    const d = dist(s, e);
    const known = s.fx.reveal > t || d < 26 || (d < 60 && lineOfSight(e.x, e.y + 2.6, e.z, s.x, s.y + 1.5, s.z, e.w));
    if (!known) continue;
    const score = d - (s.hp < SURV.hp ? 6 : 0) - (s.id === b.targetId ? 6 : 0) + (s.fx.invuln > t ? 8 : 0) - (s.carrying ? 10 : 0);
    if (score < best) { best = score; target = s; }
  }
  if (target) {
    b.wantPortal = false;
    b.targetId = target.id; b.noTarget = 0; b.lastSeen = { x: target.x, z: target.z };
    if (!e.disguise && e.unlockAwaken && !e.awakeUsed && e.meter >= 100 && dist(target, e) < 25) { b.act = 'awaken'; return; }
    const d = dist(target, e), lead = Math.min(0.5, d / 20);
    const px = target.x + (target.vx || 0) * lead, pz = target.z + (target.vz || 0) * lead;
    goal(e, b, px, pz, 'chase', 0);
    const facing = Math.atan2(target.x - e.x, target.z - e.z);
    if (e.disguise) {
      // walk up like a friend, then pop out
      b.sprint = d > 14;
      if (d < 2.8) { b.face = facing; b.act = 'atk'; }
      return;
    }
    b.sprint = false;
    if (e.w === 0 && d > 20 && t >= e.cd.disguise && R.rand() < 0.5) { b.act = 'disguise'; return; }
    if (d < v.range * 0.8 && t >= e.cd.atk && target.fx.invuln <= t && Math.abs(target.y - e.y) < 2.5 && !(e.fx.spin > t)) { b.face = facing; b.act = 'atk'; }
    else if (R.rand() < 0.5) {
      // pick one of the four moves that fits the distance
      const m = v.moves, ready = (k) => t >= e.cd[k];
      const use = (k, face) => { b.act = k; if (face) b.face = facing; };
      for (const k of ['abl', 'ab2', 'ab3', 'ab4']) {
        if (!ready(k) || b.act) continue;
        const id = m[k].id;
        if (id === 'dash' && d > 4 && d < 12) use(k, true);
        else if (id === 'spin' && d < 9 && d > 2) use(k, true);
        else if (id === 'hunt' && d > 10 && d < 30) use(k);
        else if (id === 'blink' && d > 10 && d < 22) use(k, true);
        else if (id === 'static' && d < 7) use(k);
        else if (id === 'dice' && d > 12 && R.rand() < 0.3) use(k);
        else if (id === 'fade' && d > 14 && d < 45) use(k);
        else if (id === 'decoy' && d > 15 && d < 45) use(k, true);
        else if (id === 'reach' && d > 3.5 && d < 8.5) use(k, true);
      }
    }
    if (target.y > e.y + 1.2 && d < 6) b.jump = true;
    return;
  }
  b.targetId = null; b.noTarget += 0.12;
  if (e.w === 0 && !e.disguise && t >= e.cd.disguise) b.act = 'disguise';
  else if (b.noTarget > 4 && t >= e.cd.ab3 && !e.disguise) b.act = 'ab3'; // Echo / Corrupt Ping / Scent
  // hunt in the world where most survivors are
  const here = alive.filter((s) => s.w === e.w).length, there = alive.length - here;
  if (b.wantPortal || (there > here && b.noTarget > 3) || (!here && there)) { toPortal(e, b); b.sprint = !!e.disguise; return; }
  if (b.lastSeen && dist(b.lastSeen, e) > 3) { goal(e, b, b.lastSeen.x, b.lastSeen.z, 'search', 2); return; }
  // they vanished near a locker? go and rip it open (only sometimes: it might be empty)
  if (b.lastSeen && !e.disguise) {
    const lk = LOCKERS.find((l) => Math.hypot(l.x - b.lastSeen.x, l.z - b.lastSeen.z) < 10 && Math.abs(l.y - e.y) < 2);
    if (lk && b.ripTried !== lk.i && R.rand() < 0.6) {
      b.ripTarget = lk;
    }
    b.lastSeen = null;
  }
  if (b.ripTarget) {
    const lk = b.ripTarget;
    if (Math.hypot(lk.fx - e.x, lk.fz - e.z) < 1.4) { b.face = Math.atan2(lk.x - e.x, lk.z - e.z); b.act = 'atk'; b.ripTried = lk.i; b.ripTarget = null; return; }
    goal(e, b, lk.fx, lk.fz, 'rip', 0.6);
    return;
  }
  if (!e.disguise && t >= e.cd.ab2 && v.moves.ab2.id === 'hunt' && b.noTarget > 5) { b.act = 'ab2'; return; }
  b.lastSeen = null;
  if (!b.wander || dist(b.wander, e) < 4 || b.noTarget > 14) {
    b.noTarget = Math.min(b.noTarget, 5);
    const mine = alive.filter((s) => s.w === e.w);
    if (mine.length && R.rand() < 0.75) {
      const s = mine[Math.floor(R.rand() * mine.length)];
      b.wander = { x: s.x + (R.rand() * 2 - 1) * 12, z: s.z + (R.rand() * 2 - 1) * 12 };
    } else {
      const spots = taskSpots(R, e).filter((s) => s.w === e.w && !s.via);
      const s = spots.length ? spots[Math.floor(R.rand() * spots.length)] : { x: (R.rand() * 2 - 1) * 80, z: (R.rand() * 2 - 1) * 80 };
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
  const inp = { dx: 0, dz: 0, sprint: b.sprint, jump: b.jump, fly: false, up: false, act: b.act, face: b.face };
  b.jump = false; b.act = null; b.face = null;
  if (R.phase === 'intro') return inp;
  if (b.mode !== 'idle' && b.dir !== null && Math.hypot(b.tx - e.x, b.tz - e.z) > b.arrive) {
    const a = b.detour > 0 ? b.detourA : b.dir;
    inp.dx = Math.sin(a); inp.dz = Math.cos(a);
  }
  return inp;
}
