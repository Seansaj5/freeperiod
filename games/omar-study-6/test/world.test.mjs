// Omar Study 6: the shared rules, checked without a browser. Run: node --test games/omar-study-6/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { getCity, landSd } from '../shared/city.js';
import { F, VF, VK, PS, ROLE, HEAT, VEHICLES, WEAPONS } from '../shared/rules.js';
import { HEISTS } from '../shared/heists.js';

const C = getCity();
const run = (W, secs, each) => { for (let t = 0; t < secs; t += 0.05) { if (each) each(t); W.update(0.05); } };
const mk = (o = {}) => { const W = new World({ seed: 7 }); const P = W.addPlayer({ id: 1, name: 'Tester', look: 0, cash: 5000, guns: [2, 3, 5], ...o }); return { W, P }; };
const put = (W, P, x, z, f = 0, w = P.w) => W.state(P.id, { x, y: 0, z, ry: 0, p: 0, f, w });

test('the city is on land, connected, and every door is reachable', () => {
  assert.ok(C.buildings.length > 400 && C.spots.length > 2000);
  for (const b of C.buildings) assert.ok(landSd(b.x0, b.z0) < 0 && landSd(b.x1, b.z1) < 0);
  assert.ok(Math.min(...C.adj.map((a) => a.length)) >= 2);
  const o = {};
  for (const p of C.pois) assert.equal(C.collide(p.out[0], p.out[1], 0.45, o), false, p.id + ' door is blocked');
  for (const m of C.markers) { assert.ok(C.isLand(m.x, m.z), m.id); assert.equal(C.collide(m.x, m.z, 0.4, o), false, m.id + ' marker is inside a wall'); }
  for (let a = 0; a < C.adj.length; a += 7) assert.ok(C.nextHop(a, 119) >= 0);
});

test('streets fill with traffic, people and parked cars around a player', () => {
  const { W, P } = mk();
  run(W, 30, () => put(W, P, C.spawn.x, C.spawn.z));
  const cars = [...W.vehicles.values()], moving = cars.filter((v) => v.npc), parked = cars.filter((v) => v.fl & VF.PARKED);
  assert.ok(moving.length >= 6, 'traffic ' + moving.length);
  assert.ok(parked.length >= 10, 'parked ' + parked.length);
  assert.ok([...W.peds.values()].filter((n) => n.role === ROLE.CIV).length >= 6);
  for (const v of moving) assert.ok(C.isLand(v.x, v.z) && isFinite(v.x) && isFinite(v.ry));
  const s = W.snapshot(P); assert.ok(s.v.length && s.p.length === 1);
});

test('traffic keeps to the roads for minutes', () => {
  const { W, P } = mk();
  let off = 0, n = 0;
  run(W, 150, (t) => { put(W, P, C.spawn.x, C.spawn.z); if (t % 5 < 0.05 && t > 10) for (const v of W.vehicles.values()) if (v.npc && !v.kn) { n++; if (!C.onRoad(v.x, v.z)) off++; } });
  assert.ok(n > 100 && off / n < 0.06, `off road ${off}/${n}`);
});

test('stealing a car, then crimes bring the police and hiding loses them', () => {
  const { W, P } = mk();
  run(W, 5, () => put(W, P, C.spawn.x, C.spawn.z));
  const car = [...W.vehicles.values()].filter((v) => v.fl & VF.PARKED && !v.display).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  put(W, P, car.x + 2, car.z); W.action(1, { k: 'enter', v: car.id });
  assert.equal(P.veh, car.id); assert.equal(car.drv, 1);
  W.state(1, { x: 0, y: 0, z: 0, ry: 1, p: 0, f: 0, w: 2, v: [car.x + 5, car.z, 1, 12, 0] });
  assert.equal(car.x, P.x);
  W.action(1, { k: 'exit' }); assert.equal(P.veh, 0);
  W.crime(P, 0, 2, true); assert.equal(P.heat, 2);
  run(W, 25, () => put(W, P, P.x, P.z));
  const cops = [...W.vehicles.values()].filter((v) => v.fl & VF.COP);
  assert.ok(cops.length >= 1, 'cops came');
  // hide far away indoors: no line of sight
  W.clearHeat(P); assert.equal(P.heat, 0);
  W.crime(P, 0, 1, true); P.seenT = 0;
  for (const v of cops) W.vehicles.delete(v.id); for (const n of [...W.peds.values()]) if (n.role === ROLE.COP) W.peds.delete(n.id);
  P.copAt = 1e9;
  run(W, HEAT.HIDE[1] + 2, () => put(W, P, P.x, P.z));
  assert.equal(P.heat, 0, 'heat cleared after hiding');
});

test('shooting people: hits are rate limited, kills raise heat and drop cash', () => {
  const { W, P } = mk();
  run(W, 8, () => put(W, P, C.spawn.x, C.spawn.z, 0, 2));
  const N = [...W.peds.values()].find((n) => n.role === ROLE.CIV);
  put(W, P, N.x + 3, N.z, 0, 2);
  for (let k = 0; k < 40; k++) W.action(1, { k: 'hit', tt: 'n', id: N.id });
  assert.ok(N.hp > -200 && N.hp < 70, 'some hits landed, not all 40');
  run(W, 2, () => { put(W, P, N.x + 3, N.z, 0, 2); W.action(1, { k: 'hit', tt: 'n', id: N.id }); });
  assert.equal(N.st, PS.DEAD); assert.ok(P.heat >= 1); assert.ok(W.pickups.size >= 1);
});

test('police hurt a wanted player and death sends them to hospital', () => {
  const { W, P } = mk();
  W.crime(P, 0, 3, true);
  let wasted = false;
  run(W, 240, () => { if (!P.dead) put(W, P, C.spawn.x, C.spawn.z, F.AIM, 2); else wasted = true; });
  assert.ok(wasted, 'the cops took the player down');
  assert.equal(P.heat, 0);
  run(W, 9, () => {});
  assert.equal(P.dead, false); assert.equal(P.hp, 100);
});

test('shops: buying a gun, armour and a car needs cash and the right place', () => {
  const { W, P } = mk({ cash: 100000, guns: [] });
  W.action(1, { k: 'buy', it: 'w2' }); assert.equal(P.guns.has(2), false, 'not at the shop');
  const g = C.marker['guns1:shop']; put(W, P, g.x, g.z);
  W.action(1, { k: 'buy', it: 'w2' }); W.action(1, { k: 'buy', it: 'armor' });
  assert.ok(P.guns.has(2)); assert.equal(P.armor, 100); assert.equal(P.cash, 100000 - WEAPONS[2].price - 500);
  const d = C.marker['dealer:desk']; put(W, P, d.x, d.z);
  W.action(1, { k: 'buy', it: 'c' + VK.coupe });
  assert.ok(P.cars.has(VK.coupe)); assert.ok(W.vehicles.get(P.car));
  assert.equal(P.cash, 100000 - WEAPONS[2].price - 500 - VEHICLES[VK.coupe].price);
});

test('robbing a register pays, takes time, and has a cooldown', () => {
  const { W, P } = mk();
  const m = C.marker['quik1:till'];
  run(W, 2, () => put(W, P, m.x, m.z, F.AIM, 2));
  const c0 = P.cash;
  W.action(1, { k: 'rob', m: m.id, p: 'start' }); W.action(1, { k: 'rob', m: m.id, p: 'done' });
  assert.equal(P.cash, c0, 'too fast');
  run(W, 4.2, () => put(W, P, m.x, m.z, F.AIM, 2));
  W.action(1, { k: 'rob', m: m.id, p: 'done' });
  assert.ok(P.cash > c0); assert.ok(P.heat >= 2);
  const c1 = P.cash; W.action(1, { k: 'rob', m: m.id, p: 'start' }); run(W, 5, () => put(W, P, m.x, m.z, F.AIM, 2)); W.action(1, { k: 'rob', m: m.id, p: 'done' });
  assert.equal(P.cash, c1);
});

/** Plays a heist the way a person would, with scripted positions. Returns the cash earned. */
function playHeist(id, crewSize = 1) {
  const W = new World({ seed: 11 }), def = HEISTS.find((h) => h.id === id), ps = [];
  for (let k = 1; k <= crewSize; k++) ps.push(W.addPlayer({ id: k, name: 'P' + k, cash: 0, guns: [2, 5], done: HEISTS.map((h) => h.id) }));
  const [L] = ps, c0 = L.cash, where = {};
  const all = (x, z, f = 0) => ps.forEach((P, k) => { where[P.id] = [x + k * 0.7, z]; });
  const tick = (secs, f = 0) => run(W, secs, () => ps.forEach((P) => { if (!P.dead) { P.god = true; put(W, P, where[P.id][0], where[P.id][1], f, 5); } }));
  all(C.spawn.x, C.spawn.z); tick(1);
  W.action(1, { k: 'heist', s: 'setup', h: id, solo: crewSize === 1 });
  for (let k = 2; k <= crewSize; k++) W.action(k, { k: 'heist', s: 'join', lead: 1 });
  if (crewSize > 1) W.action(1, { k: 'heist', s: 'go' });
  let guard = 0;
  while (W.heists.size && guard++ < 60) {
    const H = W.heists.get(1), s = def.steps[H.step], st = W.me(L).hs;
    if (s.k === 'goto') { const m = C.marker[s.m]; all(m.x, m.z); tick(0.5); }
    else if (s.k === 'hold') { const m = C.marker[s.m]; all(m.x, m.z); tick(s.secs + 0.5, F.AIM); }
    else if (s.k === 'mini' || s.k === 'minis' || s.k === 'grab') {
      for (const mid of s.ms || [s.m]) {
        if (!W.heists.size || W.heists.get(1).step !== H.step) break;
        const m = C.marker[mid]; all(m.x, m.z); tick(0.3);
        W.action(1, { k: 'heist', s: 'task', m: mid, p: 'start' }); tick((s.secs ?? s.min) + 0.2); W.action(1, { k: 'heist', s: 'task', m: mid, p: 'done' });
      }
      if (s.k === 'grab' && W.heists.size && W.heists.get(1).step === H.step) { all(C.spawn.x, C.spawn.z); tick(0.5); }
    } else if (s.k === 'kill') { for (const gid of H.guards) { const N = W.peds.get(gid); if (N) W.hurtPed(N, 999, L, false); } tick(0.3); }
    else if (s.k === 'steal') { const V = W.vehicles.get(H.veh); all(V.x + 2, V.z); tick(0.2); W.action(1, { k: 'enter', v: V.id }); tick(0.2); assert.equal(V.drv, 1, 'in the van'); }
    else if (s.k === 'escape') { ps.forEach((P) => W.clearHeat(P)); tick(0.3); }
    else if (s.k === 'deliver') { const m = C.marker[s.m], V = W.vehicles.get(H.veh); run(W, 0.3, () => W.state(1, { x: 0, y: 0, z: 0, ry: 0, p: 0, f: 0, w: 5, v: [m.x, m.z, 0, 0, 0] })); assert.ok(V); }
    assert.ok(st, 'heist state is visible to the crew');
  }
  return { earned: L.cash - c0, W, L, guard };
}
for (const h of HEISTS) test('heist can be finished solo: ' + h.name, () => {
  const { earned, L } = playHeist(h.id);
  assert.equal(earned, h.pay, 'payout');
  assert.ok(L.done.has(h.id)); assert.equal(L.crew, 0);
});
test('a crew of three splits the take', () => {
  const { earned, W } = playHeist('jewel', 3);
  assert.equal(earned, Math.floor(36000 / 3));
  for (const P of W.players.values()) assert.equal(P.crew, 0);
});
test('dying alone fails the heist, and a later heist needs the earlier one', () => {
  const { W, P } = mk({ guns: [2] });
  W.action(1, { k: 'heist', s: 'setup', h: 'bank', solo: true }); assert.equal(W.heists.size, 0);
  W.action(1, { k: 'heist', s: 'setup', h: 'pawn', solo: true }); assert.equal(W.heists.size, 1);
  W.hurt(P, 999, null); run(W, 0.2); assert.equal(W.heists.size, 0); assert.equal(P.crew, 0);
});

test('a second player can ride along, and leaving cleans up', () => {
  const { W, P } = mk();
  const Q = W.addPlayer({ id: 2, name: 'Friend', cash: 0 });
  run(W, 4, () => { put(W, P, C.spawn.x, C.spawn.z); put(W, Q, C.spawn.x + 1, C.spawn.z); });
  const car = [...W.vehicles.values()].find((v) => v.fl & VF.PARKED && VEHICLES[v.k].seats > 1 && !v.display);
  put(W, P, car.x + 1, car.z); put(W, Q, car.x - 1, car.z);
  W.action(1, { k: 'enter', v: car.id }); W.action(2, { k: 'enter', v: car.id });
  assert.equal(Q.veh, car.id); assert.equal(Q.seat, 1);
  W.state(1, { x: 0, y: 0, z: 0, ry: 0, p: 0, f: 0, w: 0, v: [car.x + 30, car.z, 0, 20, 0] }); W.state(2, { x: 0, y: 0, z: 0, ry: 0, p: 0, f: 0, w: 0 });
  assert.equal(Q.x, P.x);
  W.removePlayer(1); assert.equal(car.drv, 0); assert.equal(W.players.size, 1);
  assert.ok(W.drain(2).some((e) => e.e === 'leave'));
});

test('a car that takes too much damage burns, explodes and hurts people near it', () => {
  const { W, P } = mk();
  run(W, 4, () => put(W, P, C.spawn.x, C.spawn.z));
  const car = [...W.vehicles.values()].find((v) => v.fl & VF.PARKED && !v.display);
  put(W, P, car.x + 3, car.z);
  W.hurtVeh(car, 5000, P); assert.ok(car.fl & VF.FIRE);
  run(W, 4, () => put(W, P, car.x + 3, car.z));
  assert.ok(car.fl & VF.WRECK); assert.ok(P.hp < 100);
});
