import test from 'node:test';
import assert from 'node:assert/strict';
import { Round } from '../shared/round.js';
import { ROUND, SURV, EXE, ST, F, CHARS, TASKS, TASK, PORTAL } from '../shared/rules.js';
import { stepMove, body } from '../shared/move.js';
import { terrainH, supportAt, SPRINGS, M, PORTALS, BOOSTS, OBJ, EXITS, MAP } from '../shared/map.js';

const humans = [{ id: 1, name: 'Sean', char: 'rook', look: {} }, { id: 2, name: 'Friend', char: 'mira' }];
const tick = (R, s) => { for (let i = 0; i < s * 30; i++) R.update(1 / 30); };
/** Teleports a person (never into a portal by accident) and sets their world. */
const place = (R, id, x, z, ry = 0, w) => {
  const e = R.ents.get(id); e.teleportOk = R.time + 1; if (w !== undefined) e.w = w;
  e.cd.portal = R.time + 99;
  R.input(id, { x, y: supportAt(x, z, terrainH(x, z) + 0.2, false, e.w), z, ry, f: 0 });
  return e;
};
// park every bot far away so they never interfere
function freeze(R) { for (const e of R.ents.values()) if (e.bot) { e.bot = false; e.x = 60 + e.id * 0.01; e.z = -60 + (e.id % 10) * 3; e.cd.portal = 1e9; } }
const playing = (R) => { freeze(R); tick(R, ROUND.INTRO + 0.1); };

test('fills the room with bots; survivors start in the normal world, EXE in the corrupted one', () => {
  const R = new Round({ seed: 3, players: humans, exeId: null });
  assert.equal(R.survivors().length, ROUND.SURVIVORS);
  assert.equal(R.exeEnt().bot, true);
  assert.ok(R.survivors().every((s) => s.w === 0));
  assert.equal(R.exeEnt().w, 1);
  assert.equal(R.shards.length, ROUND.SHARDS);
  assert.equal(R.exits.length, ROUND.EXITS);
  const R2 = new Round({ seed: 3, players: humans, exeId: 2 });
  assert.equal(R2.exeEnt().id, 2);
});

test('EXE is frozen in the intro and cannot attack', () => {
  const R = new Round({ seed: 4, players: humans, exeId: 2 });
  freeze(R);
  place(R, 1, 0, 0, 0, 0); place(R, 2, 0, 1.5, Math.PI, 0);
  assert.equal(R.action(2, { k: 'atk' }), false);
  tick(R, ROUND.INTRO + 0.1);
  assert.equal(R.phase, 'play');
});

test('two hits knock a survivor down, a teammate revives them, bleeding out puts them out', () => {
  const R = new Round({ seed: 5, players: [...humans, { id: 3, name: 'C', char: 'bolt' }], exeId: 2 });
  playing(R);
  place(R, 1, 0, 3, 0, 0); place(R, 2, 0, 1, 0, 0);
  assert.ok(R.action(2, { k: 'atk' }));
  const s = R.ents.get(1);
  assert.equal(s.hp, 1);
  assert.ok(R.flagsOf(s) & F.BOOST);
  tick(R, SURV.invulnTime + 0.1);
  place(R, 1, 0, 3, 0, 0); place(R, 2, 0, 1, 0, 0);
  assert.ok(R.action(2, { k: 'atk' }));
  assert.equal(s.st, ST.down);
  place(R, 2, 40, 40); place(R, 3, 0.8, 3, 0, 0);
  tick(R, SURV.reviveTime + 0.2);
  assert.equal(s.st, ST.alive);
  tick(R, 2.5);
  place(R, 3, 40, -40);
  place(R, 1, 0, 3, 0, 0); place(R, 2, 0, 1, 0, 0);
  assert.ok(R.action(2, { k: 'atk' }));
  assert.equal(s.st, ST.down);
  tick(R, SURV.downTime + 0.5);
  assert.equal(s.st, ST.out);
});

test('Mira revives twice as fast', () => {
  const R = new Round({ seed: 6, players: [{ id: 1, name: 'A', char: 'bolt' }, { id: 2, name: 'X' }, { id: 3, name: 'M', char: 'mira' }], exeId: 2 });
  playing(R);
  const s = R.ents.get(1);
  s.st = ST.down; s.hp = 0; s.downT = SURV.downTime;
  place(R, 3, s.x + 0.5, s.z, 0, 0);
  tick(R, SURV.reviveTime / CHARS.mira.reviveMul + 0.15);
  assert.equal(s.st, ST.alive);
});

test('the two worlds are separate: EXE cannot hit someone in the other world', () => {
  const R = new Round({ seed: 7, players: humans, exeId: 2 });
  playing(R);
  place(R, 1, 0, 3, 0, 0); place(R, 2, 0, 1, 0, 1);
  R.action(2, { k: 'atk' });
  assert.equal(R.ents.get(1).hp, SURV.hp);
});

test('portals swap worlds, with a cooldown; going through drops a disguise', () => {
  const R = new Round({ seed: 8, players: humans, exeId: 2 });
  playing(R);
  const p = PORTALS[0];
  const e = place(R, 1, p.x + 6, p.z, 0, 0);
  e.cd.portal = 0;
  R.input(1, { x: p.x, y: p.y, z: p.z, ry: 0, f: 0 });
  tick(R, 0.1);
  assert.equal(e.w, 1);
  tick(R, 1);
  assert.equal(e.w, 1, 'no instant flip back');
  tick(R, PORTAL.cooldown);
  assert.equal(e.w, 0, 'standing in it after the cooldown flips back');
  const x = place(R, 2, 40, 20, 0, 0);
  assert.ok(R.action(2, { k: 'disguise' }));
  assert.ok(x.disguise);
  x.cd.portal = 0; x.teleportOk = R.time + 1;
  R.input(2, { x: p.x, y: p.y, z: p.z, ry: 0, f: 0 });
  tick(R, 0.1);
  assert.equal(x.w, 1); assert.equal(x.disguise, 0);
});

test('disguise: only in the normal world; it copies a survivor; attacking pops out first; a punch unmasks it', () => {
  const R = new Round({ seed: 9, players: [...humans, { id: 3, name: 'Pip', char: 'pip' }], exeId: 2 });
  playing(R);
  const x = place(R, 2, 10, 10, 0, 1);
  assert.equal(R.action(2, { k: 'disguise' }), false, 'not in the corrupted world');
  place(R, 2, 10, 10, 0, 0);
  assert.ok(R.action(2, { k: 'disguise' }));
  assert.equal(R.ents.get(x.disguise).role, 'surv');
  place(R, 3, 10, 12, 0, 0);
  assert.ok(R.action(2, { k: 'atk' }), 'first click pops out');
  assert.equal(x.disguise, 0);
  assert.equal(R.ents.get(3).hp, SURV.hp, 'popping out does not hit');
  assert.ok(R.flagsOf(x) & F.POP);
  assert.equal(R.action(2, { k: 'disguise' }), false, 'disguise is on cooldown');
  tick(R, EXE.popTime + 0.05);
  place(R, 3, 10, 12, 0, 0); place(R, 2, 10, 10, 0, 0);
  assert.ok(R.action(2, { k: 'atk' }));
  assert.equal(R.ents.get(3).hp, SURV.hp - 1);
  // Rook punches a disguised EXE: it is unmasked and stunned
  tick(R, EXE.disguiseCd + 0.1);
  place(R, 2, 30, 30, 0, 0);
  assert.ok(R.action(2, { k: 'disguise' }));
  place(R, 1, 30, 28, 0, 0);
  R.drain();
  assert.ok(R.action(1, { k: 'abl' }));
  assert.equal(x.disguise, 0);
  assert.ok(R.flagsOf(x) & F.STUN);
  assert.ok(R.drain().some((e) => e.k === 'unmask'));
});

test('zone tasks: shards, valves, panels, bells and the fire core; all five open the gates', () => {
  const R = new Round({ seed: 10, players: [{ id: 1, name: 'A', char: 'bolt' }], exeId: null });
  playing(R);
  const me = R.ents.get(1);
  const stand = (o, w, s) => { place(R, 1, o.x, o.z, 0, w); me.y = o.y - 1.1; tick(R, s); };
  for (const sh of R.shards) stand(sh, 0, SURV.shardTime + 0.3);
  assert.ok(R.done.shards);
  stand(R.valves[0], 0, 1);
  assert.equal(R.valves[0].done, 0, 'valves take time');
  for (const v of R.valves) stand(v, 0, TASK.valveTime + 0.3);
  assert.ok(R.done.valves);
  stand(R.panels[0], 0, 0.2);
  assert.equal(R.panels[0].done, 0, 'panels are in the corrupted world');
  for (const p of R.panels) stand(p, 1, 0.2);
  assert.ok(R.done.panels);
  for (const b of R.bells) stand(b, 1, 0.2);
  assert.ok(R.done.bells);
  // the core: pick it up, get hit (drop), pick it up again, deliver it
  place(R, 1, OBJ.core.x, OBJ.core.z, 0, 1); tick(R, 0.2);
  assert.ok(me.carrying);
  assert.ok(R.flagsOf(me) & F.CARRY);
  R.hit(null, me);
  assert.equal(me.carrying, false);
  assert.equal(R.core.state, 2);
  tick(R, SURV.invulnTime);
  place(R, 1, R.core.x, R.core.z, 0, 1); tick(R, 0.2);
  assert.ok(me.carrying);
  assert.equal(R.exitsOpen, false);
  place(R, 1, OBJ.engine.x, OBJ.engine.z, 0, 1); tick(R, 0.2);
  assert.ok(R.done.core);
  assert.ok(R.exitsOpen, 'all tasks open the gates');
  assert.equal(R.phase, 'escape');
  // gates only work in the corrupted world
  const g = R.exits[0];
  place(R, 1, g.x, g.z, 0, 0); tick(R, 0.2);
  assert.equal(me.st, ST.alive);
  place(R, 1, g.x, g.z, 0, 1); tick(R, 0.2);
  assert.equal(me.st, ST.esc);
});

test('the clock opens the gates, and anyone left when escape time ends is caught', () => {
  const R = new Round({ seed: 11, players: [{ id: 1, name: 'A', char: 'bolt' }], exeId: null });
  freeze(R);
  tick(R, ROUND.INTRO + ROUND.PLAY + 0.2);
  assert.equal(R.phase, 'escape');
  tick(R, ROUND.ESCAPE + 0.2);
  assert.equal(R.phase, 'over');
  assert.equal(R.result.win, 'exe');
});

test('Rook stuns EXE, Mira knocks it back, Bolt dashes through hits', () => {
  const R = new Round({ seed: 12, players: [{ id: 1, name: 'R', char: 'rook' }, { id: 2, name: 'X' }, { id: 3, name: 'M', char: 'mira' }, { id: 4, name: 'B', char: 'bolt' }], exeId: 2 });
  playing(R);
  place(R, 1, 0, 0, 0, 0); place(R, 2, 0, 2, 0, 0);
  assert.ok(R.action(1, { k: 'abl' }));
  assert.ok(R.flagsOf(R.ents.get(2)) & F.STUN);
  assert.equal(R.action(2, { k: 'atk' }), false, 'stunned EXE cannot attack');
  R.drain();
  tick(R, 2.1);
  place(R, 3, 0, 0, 0, 0); place(R, 2, 0, 2, 0, 0);
  R.action(3, { k: 'abl' });
  assert.ok(R.drain().some((e) => e.k === 'knock' && e.id === 2));
  tick(R, 1);
  place(R, 4, 0, 3, 0, 0); place(R, 2, 0, 1, 0, 0);
  assert.ok(R.action(4, { k: 'abl' }));
  assert.ok(R.action(2, { k: 'atk' }));
  assert.equal(R.ents.get(4).hp, SURV.hp, 'dash makes you untouchable');
});

test('sense reveals sprinting survivors in the same world only', () => {
  const R = new Round({ seed: 13, players: [{ id: 1, name: 'A', char: 'bolt' }, { id: 2, name: 'X' }, { id: 3, name: 'B', char: 'pip' }], exeId: 2 });
  playing(R);
  place(R, 1, 60, 0, 0, 1); R.ents.get(1).sprinting = true;
  place(R, 3, 60, 10, 0, 0); R.ents.get(3).sprinting = true;
  place(R, 2, -40, 0, 0, 1);
  assert.ok(R.action(2, { k: 'sense' }));
  assert.ok(R.flagsOf(R.ents.get(1)) & F.REVEAL);
  assert.ok(!(R.flagsOf(R.ents.get(3)) & F.REVEAL));
});

test('lava hurts survivors but never takes the last heart', () => {
  const R = new Round({ seed: 14, players: [{ id: 1, name: 'A', char: 'bolt' }], exeId: null });
  playing(R);
  const me = place(R, 1, -112, -42, 0, 0);
  tick(R, 0.1);
  assert.equal(me.hp, SURV.hp - 1);
  tick(R, SURV.burnTime + SURV.invulnTime + 0.2);
  assert.equal(me.hp, 1);
  assert.equal(me.st, ST.alive);
});

test('a player who leaves is replaced by a bot; impossible position jumps are ignored', () => {
  const R = new Round({ seed: 15, players: humans, exeId: 2 });
  R.toBot(2);
  assert.equal(R.ents.get(2).bot, true);
  tick(R, 20);
  assert.ok(Number.isFinite(R.ents.get(2).x));
  const e = R.ents.get(1), x0 = e.x;
  R.input(1, { x: 80, y: 1, z: 80, ry: 0, f: 0 });
  assert.equal(e.x, x0);
  R.input(1, { x: NaN, y: 1, z: 0, ry: 0, f: 0 });
  assert.equal(e.x, x0);
});

test('movement: walls, slopes, springs, boost pads, bumpers, and gates that exist only in the corrupted world', () => {
  const b = body(0, 1.2, 4, 0.5, 2.4);
  for (let i = 0; i < 120; i++) stepMove(b, { dx: 0, dz: -1, speed: 8 }, 1 / 60);
  assert.ok(Math.hypot(b.x, b.z) >= 1.79, 'pushed out of the well');
  const c = body(-60, terrainH(-60, -34), -34, 0.5, 2.4);
  for (let i = 0; i < 300; i++) stepMove(c, { dx: 0.3, dz: 1, speed: 10 }, 1 / 60);
  assert.ok(c.y < 5, `stayed below the mesa top (y=${c.y.toFixed(2)})`);
  const s = SPRINGS[0];
  const d = body(s.x, s.y, s.z + 1.5, 0.5, 2.4);
  let sprung = false;
  for (let i = 0; i < 240; i++) { const r = stepMove(d, { dx: 0, dz: sprung ? 0 : -1, speed: 6 }, 1 / 60); if (r.spring) sprung = true; }
  assert.ok(sprung && d.y > M.top - 0.5, `spring onto the mesa (y=${d.y.toFixed(2)})`);
  const pad = BOOSTS[0];
  const e = body(pad.x - pad.dx * 3, terrainH(pad.x, pad.z) + 0.1, pad.z - pad.dz * 3, 0.5, 2.4);
  let boosted = false;
  for (let i = 0; i < 60; i++) { const r = stepMove(e, { dx: pad.dx, dz: pad.dz, speed: 7 }, 1 / 60); if (r.boost) boosted = true; }
  assert.ok(boosted, 'boost pad fired');
  const bump = MAP.cyls.find((o) => o.kind === 'bumper');
  const f = body(bump.x, terrainH(bump.x, bump.z + 4), bump.z + 4, 0.5, 2.4);
  let bounced = false;
  for (let i = 0; i < 60 && !bounced; i++) { const r = stepMove(f, { dx: 0, dz: -1, speed: 8 }, 1 / 60); if (r.bumper) bounced = f.vz > 10; }
  assert.ok(bounced, 'bumper throws you back');
  const g = EXITS[1], post = MAP.cyls.find((o) => o.kind === 'gate' && Math.hypot(o.x - g.x, o.z - g.z) < 5);
  const n = body(post.x - 3, terrainH(post.x - 3, post.z) + 0.1, post.z, 0.5, 2.4, 0);
  for (let i = 0; i < 60; i++) stepMove(n, { dx: 1, dz: 0, speed: 6 }, 1 / 60);
  assert.ok(n.x > post.x, 'walks through a gate post in the normal world');
  const k = body(post.x - 3, terrainH(post.x - 3, post.z) + 0.1, post.z, 0.5, 2.4, 1);
  for (let i = 0; i < 60; i++) stepMove(k, { dx: 1, dz: 0, speed: 6 }, 1 / 60);
  assert.ok(k.x < post.x, 'blocked by it in the corrupted world');
});
