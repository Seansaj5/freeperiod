import test from 'node:test';
import assert from 'node:assert/strict';
import { Round } from '../shared/round.js';
import { ROUND, SURV, EXE, ST, F, CHARS } from '../shared/rules.js';
import { stepMove, body } from '../shared/move.js';
import { terrainH, SPRINGS, M } from '../shared/map.js';

const humans = [{ id: 1, name: 'Sean', char: 'rook', look: {} }, { id: 2, name: 'Friend', char: 'mira' }];
const tick = (R, s) => { for (let i = 0; i < s * 30; i++) R.update(1 / 30); };
const place = (R, id, x, z, ry = 0) => { const e = R.ents.get(id); e.teleportOk = R.time + 1; R.input(id, { x, y: terrainH(x, z), z, ry, f: 0 }); return e; };
// park every bot far away so they never interfere
function freeze(R) { for (const e of R.ents.values()) if (e.bot) { e.bot = false; e.x = 80; e.z = -80 + e.id; } }

test('fills the room with bots: 4 survivors + 1 EXE', () => {
  const R = new Round({ seed: 3, players: humans, exeId: null });
  assert.equal(R.survivors().length, ROUND.SURVIVORS);
  assert.equal(R.exeEnt().bot, true);
  assert.equal(R.shards.length, ROUND.SHARDS);
  assert.equal(R.exits.length, ROUND.EXITS);
  const R2 = new Round({ seed: 3, players: humans, exeId: 2 });
  assert.equal(R2.exeEnt().id, 2);
  assert.equal(R2.survivors().length, ROUND.SURVIVORS);
});

test('EXE is frozen in the intro and cannot attack', () => {
  const R = new Round({ seed: 4, players: humans, exeId: 2 });
  freeze(R);
  place(R, 1, 0, 0); place(R, 2, 0, 1.5, Math.PI);
  assert.equal(R.action(2, { k: 'atk' }), false);
  tick(R, ROUND.INTRO + 0.1);
  assert.equal(R.phase, 'play');
});

test('two hits knock a survivor down, a teammate revives them, bleeding out puts them out', () => {
  const R = new Round({ seed: 5, players: [...humans, { id: 3, name: 'C', char: 'bolt' }], exeId: 2 });
  freeze(R); tick(R, ROUND.INTRO + 0.1);
  place(R, 1, 0, 3); place(R, 2, 0, 1, 0); // EXE faces +z, toward survivor 1
  assert.ok(R.action(2, { k: 'atk' }));
  const s = R.ents.get(1);
  assert.equal(s.hp, 1);
  assert.ok(R.flagsOf(s) & F.BOOST);
  assert.equal(R.action(2, { k: 'atk' }), false, 'attack is on cooldown');
  tick(R, SURV.invulnTime + 0.1);
  place(R, 1, 0, 3); place(R, 2, 0, 1, 0);
  assert.ok(R.action(2, { k: 'atk' }));
  assert.equal(s.st, ST.down);
  // teammate 3 (not Mira) stands next to them for the revive time
  place(R, 2, 60, 60);
  place(R, 3, 0.8, 3);
  tick(R, SURV.reviveTime + 0.2);
  assert.equal(s.st, ST.alive);
  assert.equal(s.hp, 1);
  // down again, alone this time: out after the bleed-out time
  tick(R, 2.5);
  place(R, 3, 40, 40);
  place(R, 1, 0, 3); place(R, 2, 0, 1, 0);
  assert.ok(R.action(2, { k: 'atk' }));
  assert.equal(s.st, ST.down);
  tick(R, SURV.downTime + 0.5);
  assert.equal(s.st, ST.out);
});

test('Mira revives twice as fast', () => {
  const R = new Round({ seed: 6, players: [{ id: 1, name: 'A', char: 'bolt' }, { id: 2, name: 'X' }, { id: 3, name: 'M', char: 'mira' }], exeId: 2 });
  freeze(R); tick(R, ROUND.INTRO + 0.1);
  const s = R.ents.get(1);
  s.st = ST.down; s.hp = 0; s.downT = SURV.downTime;
  place(R, 3, s.x + 0.5, s.z);
  tick(R, SURV.reviveTime / CHARS.mira.reviveMul + 0.15);
  assert.equal(s.st, ST.alive);
});

test('shards take time to absorb; all of them open the exits; reaching one escapes', () => {
  const R = new Round({ seed: 7, players: [{ id: 1, name: 'A', char: 'pip' }], exeId: null });
  freeze(R); tick(R, ROUND.INTRO + 0.1);
  const me = R.ents.get(1);
  const sh = R.shards[0];
  me.teleportOk = R.time + 1;
  R.input(1, { x: sh.x, y: sh.y - 1.1, z: sh.z, ry: 0, f: 0 });
  tick(R, 1);
  assert.equal(sh.taken, 0, 'not instant');
  tick(R, SURV.shardTime);
  assert.equal(sh.taken, 1);
  for (let k = 0; k < 40 && R.shards.some((q) => !q.taken); k++) { const q = R.shards.find((x) => !x.taken && x.lit); if (!q) { tick(R, 1); continue; } me.teleportOk = R.time + 1; R.input(1, { x: q.x, y: q.y - 1.1, z: q.z, ry: 0, f: 0 }); tick(R, SURV.shardTime + 0.2); }
  assert.ok(R.exitsOpen);
  assert.equal(R.phase, 'escape');
  const g = R.exits[0];
  R.ents.get(1).teleportOk = R.time + 1;
  R.input(1, { x: g.x, y: g.y, z: g.z, ry: 0, f: 0 });
  tick(R, 0.1);
  assert.equal(me.st, ST.esc);
});

test('only a few shards glow at once; the next lights up after one is absorbed', () => {
  const R = new Round({ seed: 13, players: [{ id: 1, name: 'A', char: 'bolt' }], exeId: null });
  freeze(R); tick(R, ROUND.INTRO + 0.1);
  assert.equal(R.shards.filter((s) => s.lit).length, ROUND.LIT);
  const dark = R.shards.find((s) => !s.lit);
  R.ents.get(1).teleportOk = R.time + 1;
  R.input(1, { x: dark.x, y: dark.y - 1.1, z: dark.z, ry: 0, f: 0 });
  tick(R, SURV.shardTime + 1);
  assert.equal(dark.taken, 0, 'an unlit shard cannot be absorbed');
  const lit = R.shards.find((s) => s.lit);
  R.ents.get(1).teleportOk = R.time + 1;
  R.input(1, { x: lit.x, y: lit.y - 1.1, z: lit.z, ry: 0, f: 0 });
  tick(R, SURV.shardTime + 0.2);
  assert.equal(lit.taken, 1);
  assert.equal(R.shards.filter((s) => s.lit && !s.taken).length, ROUND.LIT - 1);
  tick(R, ROUND.RELIGHT + 0.2);
  assert.equal(R.shards.filter((s) => s.lit && !s.taken).length, ROUND.LIT);
});

test('the clock opens the exits, and anyone left when escape time ends is caught', () => {
  const R = new Round({ seed: 8, players: [{ id: 1, name: 'A', char: 'bolt' }], exeId: null });
  freeze(R);
  tick(R, ROUND.INTRO + ROUND.PLAY + 0.2);
  assert.equal(R.phase, 'escape');
  tick(R, ROUND.ESCAPE + 0.2);
  assert.equal(R.phase, 'over');
  assert.equal(R.result.win, 'exe');
  assert.equal(R.ents.get(1).st, ST.out);
});

test('Rook stuns EXE, Mira knocks it back, Bolt dashes through hits', () => {
  const R = new Round({ seed: 9, players: [{ id: 1, name: 'R', char: 'rook' }, { id: 2, name: 'X' }, { id: 3, name: 'M', char: 'mira' }, { id: 4, name: 'B', char: 'bolt' }], exeId: 2 });
  freeze(R); tick(R, ROUND.INTRO + 0.1);
  place(R, 1, 0, 0, 0); place(R, 2, 0, 2);
  assert.ok(R.action(1, { k: 'abl' }));
  assert.ok(R.flagsOf(R.ents.get(2)) & F.STUN);
  assert.equal(R.action(2, { k: 'atk' }), false, 'stunned EXE cannot attack');
  R.drain();
  tick(R, 2.1);
  place(R, 3, 0, 0, 0); place(R, 2, 0, 2);
  R.action(3, { k: 'abl' });
  assert.ok(R.drain().some((e) => e.k === 'knock' && e.id === 2));
  tick(R, 1);
  place(R, 4, 0, 3, 0); place(R, 2, 0, 1, 0);
  assert.ok(R.action(4, { k: 'abl' }));
  assert.ok(R.action(2, { k: 'atk' }));
  assert.equal(R.ents.get(4).hp, SURV.hp, 'dash makes you untouchable');
});

test('sense reveals sprinting survivors', () => {
  const R = new Round({ seed: 10, players: [{ id: 1, name: 'A', char: 'bolt' }, { id: 2, name: 'X' }], exeId: 2 });
  freeze(R); tick(R, ROUND.INTRO + 0.1);
  R.ents.get(1).teleportOk = R.time + 1;
  R.input(1, { x: 60, y: terrainH(60, 0), z: 0, ry: 0, f: F.SPRINT });
  place(R, 2, -40, 0);
  assert.ok(R.action(2, { k: 'sense' }));
  assert.ok(R.flagsOf(R.ents.get(1)) & F.REVEAL);
});

test('a player who leaves is replaced by a bot, and everyone gone ends the round', () => {
  const R = new Round({ seed: 11, players: humans, exeId: 2 });
  R.toBot(2);
  assert.equal(R.ents.get(2).bot, true);
  tick(R, 30);
  assert.ok(Number.isFinite(R.ents.get(2).x));
});

test('impossible position jumps are ignored', () => {
  const R = new Round({ seed: 12, players: humans, exeId: null });
  const e = R.ents.get(1), x0 = e.x;
  R.input(1, { x: 80, y: 1, z: 80, ry: 0, f: 0 });
  assert.equal(e.x, x0);
  R.input(1, { x: NaN, y: 1, z: 0, ry: 0, f: 0 });
  assert.equal(e.x, x0);
});

test('movement: walls block, slopes stop you, springs launch you onto the mesa', () => {
  const b = body(0, 1.2, 4, 0.5, 2.4);
  for (let i = 0; i < 120; i++) stepMove(b, { dx: 0, dz: -1, speed: 8 }, 1 / 60);
  assert.ok(Math.hypot(b.x, b.z) >= 1.79, 'pushed out of the well');
  // run at the mesa wall from the north: should not climb it
  const c = body(-60, terrainH(-60, -34), -34, 0.5, 2.4);
  for (let i = 0; i < 300; i++) stepMove(c, { dx: 0.3, dz: 1, speed: 10 }, 1 / 60);
  assert.ok(c.y < 5, `stayed below the mesa top (y=${c.y.toFixed(2)})`);
  // spring 0 throws you on top
  const s = SPRINGS[0];
  const d = body(s.x, s.y, s.z + 1.5, 0.5, 2.4);
  let sprung = false;
  for (let i = 0; i < 240; i++) { const r = stepMove(d, { dx: 0, dz: sprung ? 0 : -1, speed: 6 }, 1 / 60); if (r.spring) sprung = true; }
  assert.ok(sprung, 'spring fired');
  assert.ok(d.y > M.top - 0.5, `landed on the mesa (y=${d.y.toFixed(2)})`);
});
