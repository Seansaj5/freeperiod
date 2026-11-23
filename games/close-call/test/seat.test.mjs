// node --test games/close-call/test/
// The view from the driver's seat: nothing of the car's own roof or glass may draw across it. And the map list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// models.js imports 'three' through the page's import map; point node at the same file
registerHooks({ resolve(spec, ctx, next) { return spec === 'three' ? { url: new URL('../../../lib/three.module.min.js', import.meta.url).href, shortCircuit: true } : next(spec, ctx); } });
const { carGeometry, bodyShape, GLASS } = await import('../js/models.js');
const { CARS } = await import('../js/cars.js');
const { MAPS, MAP_LIST } = await import('../js/maps.js');

test('the roof meets the windscreen and the rear screen without a step', () => {
  // A step up at the top of the windscreen faces the driver's seat and shows as a line across the view.
  for (const car of CARS) {
    const b = car.body, sh = bodyShape(b), top = (t) => sh.section(t).pts[8][1];
    for (const [name, t] of [['windscreen', b.cab.f1], ['rear screen', b.cab.r1]]) {
      const step = Math.abs(top(t + 1e-4) - top(t - 1e-4));
      assert.ok(step < 0.003, `${car.id}: ${(step * 100).toFixed(1)} cm step where the roof meets the ${name}`);
    }
  }
});

test('every car keeps its roof and glass apart, so the seat view can leave them out', () => {
  for (const car of CARS) {
    const b = car.body, sh = bodyShape(b), hl = b.L / 2, geo = carGeometry(b, { detail: true });
    const clampT = (z) => Math.min(b.cab.f0 - 0.004, Math.max(b.cab.r0 + 0.012, (z + hl) / b.L));
    let shellGlass = 0;
    geo.parts.forEach((g, slot) => {
      if (!g) return;
      const P = g.getAttribute('position'), outer = g.userData.outer;
      assert.ok(Number.isInteger(outer) && outer % 3 === 0 && outer <= P.count, `${car.id}: slot ${slot} has a whole number of triangles before the shell`);
      if (slot === GLASS) shellGlass = P.count - outer;
      // What is still drawn from the seat: no triangle of it may sit over the front of the cabin, above the base
      // of the glass. (The mirrors hang outside the glass line, the hood is beyond the screen, and roof spoilers
      // and fins are behind the driver's head.)
      for (let i = 0; i < outer; i += 3) {
        const x = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, y = (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, z = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3;
        const t = (z + hl) / b.L;
        if (t <= (b.cab.r1 + b.cab.f1) / 2 || t >= b.cab.f0 - 0.01) continue;
        const s = sh.section(clampT(z)).pts;
        const overCabin = Math.abs(x) < s[6][0] - 0.06 && y > s[6][1] + 0.05;
        assert.ok(!overCabin, `${car.id}: slot ${slot} still draws a triangle over the cabin at x ${x.toFixed(2)} y ${y.toFixed(2)} z ${z.toFixed(2)}`);
      }
    });
    assert.ok(shellGlass > 0, `${car.id}: its windows are in the cabin shell`);
  }
});

test('every map in the list is complete, and the room server allows the same maps', () => {
  for (const id of MAP_LIST) {
    const m = MAPS[id];
    assert.ok(m && m.id === id, `${id} is in MAPS under its own id`);
    for (const k of ['name', 'blurb', 'curve', 'hills', 'feat', 'trapEvery', 'sky', 'fog', 'bg', 'hemi', 'light', 'rail', 'tube', 'paint']) assert.ok(m[k] != null, `${id} has ${k}`);
    assert.ok(m.blurb.length <= 150, `${id}: the blurb fits its card`);
    if (m.feat.bridge > 0) assert.ok(m.sea != null && m.feat.bridgeLen, `${id}: bridges need a sea to cross`);
  }
  assert.equal(new Set(MAP_LIST).size, MAP_LIST.length);
  const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const list = /const MAPS = \[([^\]]*)\]/.exec(server)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(list, MAP_LIST, 'server MAPS matches MAP_LIST');
});
