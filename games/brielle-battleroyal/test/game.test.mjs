// node --test games/brielle-battleroyal/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { Match } from '../shared/match.js';
import { targetFor, offsetFor, bounds } from '../shared/build.js';
import { newBody, stepBody } from '../shared/move.js';
import { heightAt } from '../shared/map.js';
import { BUILD, STORM } from '../shared/rules.js';

const field = { x: 1.9, z: -101.9 };   // flat school field
const solo = () => new Match({ seed: 7, people: [{ id: 1, name: 'T', look: {}, own: true }], warmup: 0, size: 2 });
function landed(m, x = field.x, z = field.z) {
  m.update(0.05);                       // warmup -> blimp
  m.blimp.doors = true; m.phaseT = 3;
  assert.ok(m.jump(1));
  const p = m.players.get(1);
  p.mode = 'ground'; p.x = x; p.z = z; p.y = heightAt(x, z);
  return p;
}

test('the map builds the same every time', () => {
  const a = new World().map, b = new World().map;
  assert.equal(a, b);
  assert.ok(a.boxes.length > 5000 && a.props.length > 1000 && a.loot.length > 500);
  assert.ok(a.pois.some((p) => p.name === 'Union Landing'));
});

test('a wall on a hill sits on the ground, not buried', () => {
  const w = new World();
  const y = heightAt(field.x, field.z);
  const spec = targetFor('wall', field.x, y, field.z, 0, 0, offsetFor(y));
  assert.equal(w.builds.check(spec), null);
  const p = w.builds.add({ ...spec, mat: 0 });
  assert.ok(Math.abs(bounds(p).y0 - y) < 0.01);
});

test('pieces with nothing under them collapse', () => {
  const w = new World();
  const y = heightAt(field.x, field.z), o = offsetFor(y);
  const base = w.builds.add({ ...targetFor('wall', field.x, y, field.z, 0, 0, o), mat: 0 });
  const k = base.k;
  const up = w.builds.add({ t: 'wall', ax: base.ax, i: base.i, j: base.j, k: k + 1, o, mat: 0 });
  const upper = w.builds.add({ t: 'wall', ax: base.ax, i: base.i, j: base.j, k: k + 2, o, mat: 0 });
  assert.ok(!up.g && !upper.g);
  const gone = w.builds.remove(base.id);
  assert.deepEqual(gone.sort(), [base.id, up.id, upper.id].sort());
  assert.equal(w.builds.pieces.size, 0);
});

test('a floating piece can not be placed', () => {
  const w = new World();
  const y = heightAt(field.x, field.z);
  assert.equal(w.builds.check({ t: 'floor', i: 0, j: -26, k: 8, o: offsetFor(y) }), 'floating');
});

test('edits cut holes you can walk through', () => {
  const w = new World();
  const y = heightAt(field.x, field.z), o = offsetFor(y);
  const p = w.builds.add({ ...targetFor('wall', field.x, y, field.z, 0, 0, o), mat: 0 });
  assert.ok(w.builds.edit(p.id, (1 << 4) | (1 << 1)));   // door: middle + bottom-middle tiles
  assert.equal(p.bx.length, 7);
  assert.equal(w.builds.edit(p.id, 511), false);         // can't remove every tile
});

test('walking into a wall stops you; a ramp takes you up', () => {
  const w = new World();
  const y = heightAt(field.x, field.z), o = offsetFor(y);
  const wall = w.builds.add({ ...targetFor('wall', field.x, y, field.z, 0, 0, o), mat: 0 });
  const b = newBody(field.x, y, field.z);
  for (let i = 0; i < 120; i++) stepBody(w, b, { mx: 0, mz: -1, yaw: 0, pitch: 0 }, 1 / 60);
  assert.ok(b.z > wall.j * BUILD.CELL, 'stopped before the wall');
  w.builds.remove(wall.id);
  const ramp = w.builds.add({ ...targetFor('ramp', field.x, y, field.z, 0, 0, o), mat: 0 });
  const b2 = newBody(field.x, y, field.z);
  let top = 0;
  for (let i = 0; i < 150; i++) { stepBody(w, b2, { mx: 0, mz: -1, yaw: 0, pitch: 0 }, 1 / 60); top = Math.max(top, b2.y - y); }
  assert.ok(top > BUILD.LEVEL - 0.3, 'walked up the ramp: ' + top.toFixed(2) + ' ramp ' + JSON.stringify(bounds(ramp)));
});

test('building costs materials and the server checks them', () => {
  const m = solo();
  const p = landed(m);
  p.own = false;
  const spec = targetFor('wall', p.x, p.y, p.z, 0, 0, offsetFor(p.y));
  const act = { k: 'build', t: spec.t, i: spec.i, j: spec.j, lv: spec.k, o: spec.o, ax: spec.ax, m: 0 };
  assert.equal(m.action(1, act), false);
  p.mats[0] = 25;
  assert.ok(m.action(1, act));
  assert.equal(p.mats[0], 15);
  assert.equal(m.action(1, act), false, 'same spot twice');
});

test('shields soak damage first, then health; elimination drops loot', () => {
  const m = solo();
  const p = landed(m);
  const bot = [...m.players.values()].find((q) => q.bot);
  bot.mode = 'ground'; bot.x = p.x + 3; bot.z = p.z; bot.y = p.y; bot.sh = 50;
  bot.inv[0] = { k: 'ar', r: 0, mag: 30 };
  p.inv[0] = { k: 'pump', r: 0, mag: 5 };
  const before = m.loot.size;
  m.fire(p, { s: 1, o: [p.x, p.y + 1.6, p.z], d: [1, 0, 0], h: [['p', bot.id, 0, 10]] });
  assert.equal(bot.sh, 0);
  assert.ok(bot.hp < 100 && bot.hp > 0, 'hp ' + bot.hp);
  m.now += 2;
  m.fire(p, { s: 1, o: [p.x, p.y + 1.6, p.z], d: [1, 0, 0], h: [['p', bot.id, 1, 10]] });
  assert.equal(bot.alive, false);
  assert.ok(m.loot.size > before);
  assert.equal(p.kills, 1);
});

test('fire rate and ammo are enforced', () => {
  const m = solo();
  const p = landed(m);
  p.inv[0] = { k: 'sniper', r: 2, mag: 1 };
  assert.ok(m.fire(p, { s: 1, o: [p.x, p.y + 1.6, p.z], d: [1, 0, 0], h: [] }));
  assert.equal(m.fire(p, { s: 1, o: [p.x, p.y + 1.6, p.z], d: [1, 0, 0], h: [] }), false);
});

test('the storm shrinks through every phase to nothing', () => {
  const m = new Match({ seed: 3, people: [], warmup: 0, size: 2 });
  for (const p of m.players.values()) p.god = true;
  let guard = 0;
  while (m.storm.state !== 'done' && guard++ < 40000) m.update(0.05);
  assert.equal(m.storm.state, 'done');
  assert.ok(m.storm.r < 1);
  assert.equal(m.storm.i, STORM.length);
});

test('a full bot match ends with one winner', () => {
  const m = new Match({ seed: 11, people: [], warmup: 1 });
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 30 * 900) { m.update(1 / 30); m.drain(); }
  assert.equal(m.phase, 'over');
  assert.equal(m.alive, 1);
  assert.ok(m.players.get(m.winner).alive);
});
