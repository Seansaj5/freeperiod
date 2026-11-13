// node --test games/close-call/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CarSim, GEAR_TOPS, REDLINE, brakeOf } from '../js/physics.js';
import { CARS, carById } from '../js/cars.js';
import { TUNE_PARTS, MAX_STAGE, tuneOf, sportOf, setTune, stageCost, sportCost, tunedSpec } from '../js/tuning.js';
import { interiorOf, INTERIOR_IDS } from '../js/interiors.js';

const road = { grade: () => 0, kappa: () => 0, wall: 9 };
const run = (sim, secs, input) => { for (let t = 0; t < secs; t += 1 / 60) sim.step(1 / 60, { gas: false, brake: false, steer: 0, nitro: false, ...input }, road, [], 0); };

test('automatic still reaches top speed and shifts up through the gears', () => {
  const sim = new CarSim(carById('porsha')); sim.reset(0, 0, 0);
  run(sim, 60, { gas: true });
  assert.ok(sim.v * 3.6 > 290, `top ${sim.v * 3.6}`);
  assert.equal(sim.gear, GEAR_TOPS.length - 1);
});
test('manual: first gear stops at the limiter until you shift', () => {
  const spec = carById('porsha'), sim = new CarSim(spec); sim.reset(0, 0, 0); sim.manual = true;
  run(sim, 20, { gas: true });
  const cap = GEAR_TOPS[0] * (spec.top / 3.6) * ((REDLINE + 200) / REDLINE);
  assert.equal(sim.gear, 0);
  assert.ok(sim.v <= cap * 1.01 && sim.v > cap * 0.93, `v ${sim.v} cap ${cap}`);
  assert.ok(sim.limiter);
  assert.equal(sim.shiftUp(), true);
  run(sim, 3, { gas: true });
  assert.ok(sim.v > cap * 1.2);
});
test('manual: well-timed shifts are as quick as the automatic, and a silly gear is slow', () => {
  const spec = carById('gtz'), auto = new CarSim(spec), man = new CarSim(spec), lazy = new CarSim(spec);
  for (const s of [auto, man, lazy]) s.reset(0, 0, 0);
  man.manual = lazy.manual = true; lazy.gear = 5;
  for (let t = 0; t < 5; t += 1 / 60) {
    for (const s of [auto, man, lazy]) s.step(1 / 60, { gas: true, brake: false, steer: 0, nitro: false }, road, [], 0);
    if (man.rpm > REDLINE * 0.985) man.shiftUp();
  }
  assert.ok(Math.abs(auto.v - man.v) < 2, `auto ${auto.v} manual ${man.v}`);
  assert.ok(lazy.v < auto.v * 0.8, `lazy ${lazy.v} auto ${auto.v}`);
});
test('manual: a downshift that would over-rev is refused, and electric cars have nothing to shift', () => {
  const sim = new CarSim(carById('porsha')); sim.reset(0, 0, 40); sim.manual = true; sim.gear = 4;
  assert.equal(sim.shiftDown(), true); assert.equal(sim.shiftDown(), true);
  assert.equal(sim.shiftDown(), 'over');
  const ev = new CarSim(carById('teslo')); ev.manual = true;
  assert.equal(ev.shiftUp(), false);
  run(ev, 30, { gas: true });
  assert.ok(ev.v * 3.6 > 255);
});
test('dearer cars brake harder, and every car stops quicker than before from its own top speed', () => {
  const stop = (id) => { const sim = new CarSim(carById(id)); sim.reset(0, 0, 60); let t = 0; while (sim.v > 1 && t < 20) { sim.step(1 / 60, { gas: false, brake: true, steer: 0, nitro: false }, road, [], 0); t += 1 / 60; } return t; };
  assert.ok(brakeOf(carById('jesca')) > brakeOf(carById('porsha')) && brakeOf(carById('porsha')) > brakeOf(carById('pocket')));
  assert.ok(stop('jesca') < stop('porsha') && stop('porsha') < stop('pocket'));
  assert.ok(stop('jesca') < 60 / 17 * 0.75);
});
test('tuning: seven parts, seven stages, dearer each time, sport mode costs four cars', () => {
  assert.equal(TUNE_PARTS.length, 7); assert.equal(MAX_STAGE, 7);
  const c = carById('porsha');
  for (let n = 2; n <= 7; n++) assert.ok(stageCost(c, n) > stageCost(c, n - 1));
  assert.equal(sportCost(c), c.price * 4);
  const save = {};
  setTune(save, 'porsha', [7, 0, 3, 0, 0, 1, 0], 2);
  assert.deepEqual(tuneOf(save, 'porsha'), [7, 0, 3, 0, 0, 1, 0]); assert.equal(sportOf(save, 'porsha'), 2);
  assert.equal(save.tune.porsha.length, 8);
  setTune(save, 'porsha', [0, 0, 0, 0, 0, 0, 0], 0); assert.equal(save.tune.porsha, undefined);
  const full = tunedSpec(c, [7, 7, 7, 7, 7, 7, 7], true), part = tunedSpec(c, [7, 7, 7, 7, 7, 7, 7], false);
  assert.ok(full.top > part.top && part.top > c.top && full.accel > part.accel && part.accel > c.accel && full.brake > brakeOf(c) && full.grip > c.grip);
  assert.equal(tunedSpec(c, [0, 0, 0, 0, 0, 0, 0], false), c);
});
test('every car has a body, a price order and an interior; the Claude Car is the best on every number', () => {
  assert.ok(CARS.length >= 45);
  for (let i = 1; i < CARS.length; i++) assert.ok(CARS[i].price >= CARS[i - 1].price);
  assert.equal(new Set(CARS.map((c) => c.id)).size, CARS.length);
  for (const c of CARS) { assert.ok(INTERIOR_IDS.includes(c.id), `no interior for ${c.id}`); const r = interiorOf(c.id); assert.ok(r.wheel.r > 0.15 && r.cluster.kind && r.console.type, c.id); assert.ok(c.id.length <= 9, c.id); }
  const cl = carById('claude');
  for (const c of CARS) if (c !== cl) { assert.ok(cl.top > c.top && cl.accel > c.accel && cl.grip > c.grip && brakeOf(cl) > brakeOf(c), c.id); }
});
