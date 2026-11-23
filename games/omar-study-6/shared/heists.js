// Heists: a list of steps per job. The same code runs solo in the browser and on the server for a crew.
import { F, VF, VK, ROLE, PS } from './rules.js';

const cases = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => 'jewel:case' + n), carts = [0, 1, 2, 3, 4, 5].map((n) => 'bank:cart' + n);
export const HEISTS = [
  {
    id: 'pawn', name: 'Lucky Pawn Stick-Up', poi: 'pawn', pay: 9000, need: null, tier: 'Starter', alarm: 2,
    blurb: 'Hold up the clerk, crack the safe in the back, then lose the cops.',
    steps: [
      { k: 'goto', m: 'pawn:clerk', r: 16, text: 'Go to Lucky Pawn' },
      { k: 'hold', m: 'pawn:clerk', secs: 3, text: 'Aim your gun at the clerk' },
      { k: 'mini', m: 'pawn:safe', game: 'crack', min: 3, take: 9000, text: 'Crack the safe in the back room' },
      { k: 'escape', text: 'Lose the cops' },
    ],
  },
  {
    id: 'jewel', name: 'Bay Jewelers Smash & Grab', poi: 'jewel', pay: 36000, need: 'pawn', tier: 'Crew of 1-4', alarm: 3,
    blurb: 'Smash the display cases, get out before the cops box you in, and drive the jewels to the fence.',
    steps: [
      { k: 'goto', m: 'jewel:case0', r: 18, text: 'Go to Bay Jewelers on the Strip' },
      { k: 'grab', ms: cases, secs: 1.8, each: 4500, min: 4, text: 'Smash the cases, then get out' },
      { k: 'escape', text: 'Lose the cops' },
      { k: 'goto', m: 'w:fence', r: 6, text: 'Bring the jewels to the fence on the docks' },
    ],
  },
  {
    id: 'pier9', name: 'Pier 9 Container Job', poi: 'pier9', pay: 75000, need: 'jewel', tier: 'Crew of 1-4', alarm: 3, van: true,
    blurb: 'Armed guards watch a loaded van. Hack two terminals to unlock it, then deliver it across town.',
    steps: [
      { k: 'goto', m: 'pier9:term1', r: 46, text: 'Go to Pier 9 Freight on the docks' },
      { k: 'minis', ms: ['pier9:term0', 'pier9:term1'], game: 'hack', min: 3, text: 'Hack both terminals in the warehouse' },
      { k: 'steal', text: 'Take the loaded van' },
      { k: 'escape', text: 'Lose the cops' },
      { k: 'deliver', m: 'w:buyer', r: 8, take: 75000, text: 'Deliver the van to the buyer in the hills' },
    ],
  },
  {
    id: 'bank', name: 'The First Omar Bank Job', poi: 'bank', pay: 180000, need: 'pier9', tier: 'The big one', alarm: 4,
    blurb: 'Drop the guards, drill the vault, empty the carts and shake a full police response.',
    steps: [
      { k: 'goto', m: 'bank:drill', r: 30, text: 'Go to First Omar Bank downtown' },
      { k: 'kill', text: 'Take out the guards' },
      { k: 'mini', m: 'bank:drill', game: 'drill', min: 14, gate: 1, text: 'Drill the vault door' },
      { k: 'grab', ms: carts, secs: 2.6, each: 30000, min: 3, text: 'Empty the deposit carts, then get out' },
      { k: 'escape', text: 'Lose the cops' },
      { k: 'goto', m: 'home:garage', r: 9, text: 'Get back to the safehouse' },
    ],
  },
];
export const HEIST = Object.fromEntries(HEISTS.map((h) => [h.id, h]));

const members = (W, H) => H.crew.map((id) => W.players.get(id)).filter(Boolean);
const tellCrew = (W, H, ev) => { for (const P of members(W, H)) W.tell(P, ev); };
const near = (P, m, pad = 0) => Math.hypot(P.x - m.x, P.z - m.z) < m.r + pad;

function start(W, H) {
  const C = W.city, def = H.def, n = H.crew.length;
  H.state = 'run'; H.step = 0; H.prog = 0;
  for (const s of C.staff) if (s.heist === def.poi) {
    const N = W.makePed(ROLE.GUARD, s.x, s.z, s.ry, { w: s.rifle ? 5 : 2 });
    N.hp = 70 + 22 * n; N.aim = 0.6 + 0.1 * n; N.heist = H; N.home = s; N.st = PS.IDLE; H.guards.push(N.id);
  }
  if (def.van) {
    const v = C.poi[def.poi].van, V = W.makeVeh(VK.van, v.x, v.z, v.ry, { fl: VF.LOCK | VF.MISSION | VF.PARKED, col: 1 });
    V.touched = true; V.mission = H; H.veh = V.id;
  }
  tellCrew(W, H, { e: 'heist', s: 'start', h: def.id });
}

function end(W, H) {
  for (const id of H.guards) { const N = W.peds.get(id); if (N) { N.heist = null; N.tgt = 0; N.goneAt = W.time + 25; } }
  const V = W.vehicles.get(H.veh); if (V) { V.fl &= ~(VF.MISSION | VF.LOCK); V.mission = null; }
  for (const P of members(W, H)) { P.crew = 0; P.dirty = true; }
  if (H.def.id === 'bank') W.gateCloseAt = W.time + 20;
  W.heists.delete(H.lead);
}
function fail(W, H, why) { tellCrew(W, H, { e: 'heist', s: 'fail', h: H.def.id, why }); end(W, H); }
function complete(W, H) {
  const who = members(W, H).filter((P) => !P.dead), share = Math.floor(H.take / Math.max(1, who.length));
  for (const P of who) { W.pay(P, share, H.def.name); P.done.add(H.def.id); W.tell(P, { e: 'heist', s: 'done', h: H.def.id, share, take: H.take }); }
  W.emit({ e: 'feed', text: (who.length > 1 ? who[0].name + "'s crew" : who[0] ? who[0].name : 'A crew') + ' pulled off ' + H.def.name, c: 'gold' });
  end(W, H);
}
function alarm(W, H, lv) {
  if (H.alarm >= lv) return;
  H.alarm = lv;
  const p = W.city.poi[H.def.poi];
  W.emit({ e: 'alarm', poi: p.id, x: p.x, z: p.z }, p.x, p.z);
  for (const P of members(W, H)) if (!P.dead) W.crime(P, 0, lv, true);
  for (const id of H.guards) { const N = W.peds.get(id); if (N && N.st !== PS.DEAD && !N.tgt) guardAlert(W, N, null); }
  W.cower(p.id);
}
function next(W, H) {
  const done = H.def.steps[H.step];
  if (done.take) H.take += done.take;
  if (done.gate) W.gates |= 1 << done.gate;
  H.step++; H.prog = 0; H.got = new Set(); H.tasks = {};
  if (H.step >= H.def.steps.length) return complete(W, H);
  const s = H.def.steps[H.step];
  if (s.k === 'steal') { const V = W.vehicles.get(H.veh); if (V) V.fl &= ~(VF.LOCK | VF.PARKED); }
  tellCrew(W, H, { e: 'heist', s: 'step', i: H.step, text: s.text });
}

/** A guard notices trouble: every guard on the job goes for the nearest crew member and the alarm trips. */
export function guardAlert(W, N, P) {
  const H = N.heist; if (!H) return;
  const crew = members(W, H).filter((p) => !p.dead);
  for (const id of H.guards) {
    const G = W.peds.get(id); if (!G || G.st === PS.DEAD) continue;
    let best = P, bd = P ? Math.hypot(P.x - G.x, P.z - G.z) : Infinity;
    for (const c of crew) { const d = Math.hypot(c.x - G.x, c.z - G.z); if (d < bd) { bd = d; best = c; } }
    if (best) G.tgt = best.id;
  }
  if (!H.alarm) alarm(W, H, H.def.alarm);
}

export function heistAction(W, P, a) {
  if (a.s === 'setup') {
    const def = HEIST[a.h];
    if (!def || P.crew || P.dead) return;
    if (def.need && !P.done.has(def.need) && !P.own) return W.tell(P, { e: 'toast', text: 'Finish ' + HEIST[def.need].name + ' first.' });
    for (const H of W.heists.values()) if (H.def === def) return W.tell(P, { e: 'toast', text: 'Another crew is hitting that place right now.' });
    const H = { def, lead: P.id, crew: [P.id], state: 'lobby', until: W.time + 40, step: 0, prog: 0, take: 0, got: new Set(), tasks: {}, guards: [], veh: 0, alarm: 0 };
    W.heists.set(P.id, H); P.crew = P.id; P.dirty = true;
    if (a.solo || W.players.size < 2) start(W, H);
    else W.emit({ e: 'invite', lead: P.id, name: P.name, h: def.id });
  } else if (a.s === 'join') {
    const H = W.heists.get(a.lead | 0);
    if (!H || H.state !== 'lobby' || H.crew.length >= 4 || P.crew || P.dead) return;
    H.crew.push(P.id); P.crew = H.lead; P.dirty = true;
    tellCrew(W, H, { e: 'toast', text: P.name + ' joined the crew.' });
  } else if (a.s === 'go') {
    const H = W.heists.get(P.id); if (H && H.state === 'lobby') start(W, H);
  } else if (a.s === 'quit') heistLeave(W, P);
  else if (a.s === 'task') {
    const H = W.heists.get(P.crew); if (!H || H.state !== 'run' || P.dead) return;
    const s = H.def.steps[H.step], m = W.city.marker[a.m];
    if (!m || !(s.m === a.m || (s.ms && s.ms.includes(a.m))) || H.got.has(a.m) || !near(P, m, 2.5)) return;
    if (a.p === 'start') { H.tasks[P.id] = { m: a.m, t: W.time }; if (s.k === 'grab') alarm(W, H, H.def.alarm); return; }
    const t = H.tasks[P.id];
    if (a.p !== 'done' || !t || t.m !== a.m || W.time - t.t < (s.secs ?? s.min) * 0.85) return;
    delete H.tasks[P.id];
    if (s.k === 'grab') { H.got.add(a.m); H.take += s.each; tellCrew(W, H, { e: 'grab', m: a.m, n: s.each }); if (H.got.size >= s.ms.length) next(W, H); }
    else if (s.k === 'minis') { H.got.add(a.m); if (H.got.size >= s.ms.length) next(W, H); else tellCrew(W, H, { e: 'toast', text: 'Terminal hacked. One more.' }); }
    else if (s.k === 'mini') next(W, H);
  }
}

export function heistLeave(W, P) {
  const H = W.heists.get(P.crew); P.crew = 0; P.dirty = true;
  if (!H) return;
  H.crew = H.crew.filter((id) => id !== P.id);
  if (!H.crew.length) return end(W, H);
  if (H.lead === P.id) { W.heists.delete(H.lead); H.lead = H.crew[0]; W.heists.set(H.lead, H); for (const Q of members(W, H)) { Q.crew = H.lead; Q.dirty = true; } }
  tellCrew(W, H, { e: 'toast', text: P.name + ' left the crew.' });
}

export function heistUpdate(W, dt) {
  for (const H of [...W.heists.values()]) {
    if (H.state === 'lobby') { if (W.time > H.until) start(W, H); continue; }
    const crew = members(W, H), up = crew.filter((P) => !P.dead);
    if (!crew.length) { end(W, H); continue; }
    if (!up.length) { fail(W, H, crew.length > 1 ? 'The whole crew went down.' : 'You went down.'); continue; }
    const V = H.veh ? W.vehicles.get(H.veh) : null;
    if (H.def.van && (!V || V.fl & VF.WRECK)) { fail(W, H, 'The van was destroyed.'); continue; }
    const s = H.def.steps[H.step], C = W.city, m = s.m ? C.marker[s.m] : null, p = C.poi[H.def.poi];
    // while the alarm rings and the crew is still on site, the cops keep coming
    if (H.alarm && s.k !== 'escape') for (const P of up) if (P.heat < H.alarm && Math.hypot(P.x - p.x, P.z - p.z) < 60) W.crime(P, 0, H.alarm, true);
    switch (s.k) {
      case 'goto': if (up.some((P) => near(P, m))) next(W, H); break;
      case 'hold': {
        const on = up.some((P) => near(P, m, 1) && P.f & F.AIM && P.w >= 2);
        H.prog = on ? H.prog + dt / s.secs : Math.max(0, H.prog - dt * 0.6);
        if (on) W.cower(p.id);
        if (H.prog >= 1) { alarm(W, H, H.def.alarm); next(W, H); }
        break;
      }
      case 'grab': {
        const r = p.rect, out = up.every((P) => P.x < r[0] - 5 || P.x > r[2] + 5 || P.z < r[1] - 5 || P.z > r[3] + 5);
        if (H.got.size >= s.min && out) next(W, H);
        H.prog = H.got.size / s.ms.length;
        break;
      }
      case 'minis': H.prog = H.got.size / s.ms.length; break;
      case 'kill': {
        let left = 0; for (const id of H.guards) { const N = W.peds.get(id); if (N && N.st !== PS.DEAD) left++; }
        H.prog = H.guards.length ? 1 - left / H.guards.length : 1;
        if (!left) { alarm(W, H, H.def.alarm); next(W, H); }
        break;
      }
      case 'steal': if (V && H.crew.includes(V.drv)) next(W, H); break;
      case 'escape': if (up.every((P) => !P.heat)) next(W, H); else H.prog = Math.max(...up.map((P) => (P.heat ? P.esc || 0 : 1))); break;
      case 'deliver': if (V && H.crew.includes(V.drv) && Math.hypot(V.x - m.x, V.z - m.z) < m.r) { V.fl |= VF.LOCK; next(W, H); } break;
    }
  }
}

/** What a crew member's screen needs to know. */
export function heistState(W, P) {
  const H = W.heists.get(P.crew); if (!H) return null;
  const def = H.def;
  if (H.state === 'lobby') return { h: def.id, st: 'lobby', lead: H.lead, crew: H.crew, wait: Math.max(0, H.until - W.time) };
  const s = def.steps[H.step], C = W.city, V = H.veh ? W.vehicles.get(H.veh) : null;
  let tx = null, tz = null;
  if (s.m) { tx = C.marker[s.m].x; tz = C.marker[s.m].z; } else if (s.k === 'steal' && V) { tx = V.x; tz = V.z; } else if (s.ms || s.k === 'kill') { tx = C.poi[def.poi].x; tz = C.poi[def.poi].z; }
  return { h: def.id, st: 'run', lead: H.lead, crew: H.crew, i: H.step, n: def.steps.length, k: s.k, text: s.text, tx, tz, prog: +H.prog.toFixed(2), take: H.take, got: [...H.got], ms: s.ms || (s.m ? [s.m] : []), game: s.game || null, secs: s.secs || 0, veh: H.veh, alarm: H.alarm };
}
