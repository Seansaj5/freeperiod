// node --test games/nova-party/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATS, catById } from '../shared/cats.js';
import { TIERS, norm, slips } from '../shared/words.js';
import { Party, RULES, makeBots } from '../shared/party.js';

const seeded = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const people = (n, own = 1) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'P' + (i + 1), look: { c: i, top: 0 }, own: i + 1 === own }));
const fruitOnly = () => [catById('fruit'), catById('state')];
function start(opts = {}) {
  const p = new Party({ people: people(opts.n || 3), cats: opts.cats || fruitOnly(), settings: opts.settings, rand: seeded(opts.seed || 7) });
  p.drain();
  p.update(RULES.INTRO + 0.01);
  return p;
}
const of = (evs, e) => evs.filter((x) => x.e === e);
const unused = (p, tier) => { const i = p.cat.answers.findIndex((a, k) => a.tier === tier && !p.used.has(k)); return p.cat.answers[i].name; };

test('the lists: every category has answers in all five tiers and unique keys', () => {
  assert.ok(CATS.length >= 60);
  for (const c of CATS) {
    const t = [0, 0, 0, 0, 0];
    for (const a of c.answers) { t[a.tier]++; assert.ok(a.name.length <= RULES.MAXLEN + 20, c.id + ': ' + a.name); }
    assert.ok(t.every((n) => n >= 3), c.id + ' tiers ' + t.join('/'));
    assert.match(c.q, /^Name an? /, c.id);
    for (const a of c.answers) assert.equal(c.answers[c.find(a.name)].name, a.name, c.id + ': ' + a.name + ' finds itself');
  }
});

test('answers are matched loosely: case, spaces, plurals, accents and one typo', () => {
  const f = catById('fruit');
  const name = (s) => { const i = f.find(s); return i < 0 ? null : f.answers[i].name; };
  assert.equal(name('  APPLE '), 'Apple');
  assert.equal(name('grapes'), 'Grape');
  assert.equal(name('dragon fruit'), 'Dragonfruit');
  assert.equal(name('bananna'), 'Banana');
  assert.equal(name('the kiwi'), 'Kiwi');
  assert.equal(name('beach'), null, 'a different first letter is not a typo of peach');
  assert.equal(name('fig tree'), null);
  assert.equal(name('a'), null);
  assert.equal(norm("Buddha's Hand"), 'buddhashand');
  assert.equal(slips('abcd', 'abdc', 2), 1, 'a swap of neighbours is one slip');
  assert.equal(catById('europe').answers[catById('europe').find('uk')].name, 'United Kingdom');
});

test('a good answer scores by tier and passes the nova on; a used or wrong one does not', () => {
  const p = start();
  const first = p.holder;
  assert.equal(p.phase, 'play');
  assert.equal(p.answer(first === 1 ? 2 : 1, 'apple'), false, 'only the holder can answer');
  const a0 = unused(p, 0);
  assert.equal(p.answer(first, a0), true);
  let ev = p.drain();
  const ok = of(ev, 'ok')[0];
  assert.equal(ok.pts, TIERS[0].pts);
  assert.equal(ok.next, p.holder);
  assert.notEqual(p.holder, first);
  const second = p.holder;
  assert.equal(p.answer(second, a0), false);
  assert.equal(of(p.drain(), 'no')[0].why, 'used');
  assert.equal(p.answer(second, 'zzzzqq'), false);
  assert.equal(of(p.drain(), 'no')[0].why, 'bad');
  assert.equal(p.holder, second);
});

test('the fuse is shared: a pass tops it up to the floor only when it was nearly gone', () => {
  const p = start();
  const floor = RULES.FUSES.normal[2];
  p.fuse = 20; p.answer(p.holder, unused(p, 0));
  assert.equal(p.fuse, 20);
  p.fuse = 1.5; p.answer(p.holder, unused(p, 0));
  assert.equal(p.fuse, floor);
});

test('the nova blows: the holder loses a life, a new category starts, the last one alive wins', () => {
  const p = start({ n: 2, settings: { lives: 1 } });
  const loser = p.holder, cat = p.cat;
  p.update(60);
  const ev = p.drain();
  const pop = of(ev, 'pop')[0];
  assert.equal(pop.id, loser); assert.equal(pop.out, 1); assert.ok(pop.say);
  assert.equal(p.phase, 'pop');
  p.update(RULES.POP_HOLD + 0.01);
  const over = of(p.drain(), 'over')[0];
  assert.equal(p.phase, 'over');
  assert.notEqual(over.win, loser);
  assert.deepEqual(over.table.map((r) => r.place), [1, 2]);
  // with lives left, the game goes on with another category
  const q = start({ n: 2, settings: { lives: 2 } });
  const c0 = q.cat;
  q.update(60); q.update(RULES.POP_HOLD + 0.01);
  assert.equal(q.phase, 'intro');
  assert.notEqual(q.cat, c0);
  assert.equal(of(q.drain(), 'round').length, 1);
  assert.ok(cat);
});

test('a BLUE MOON answer gives a life back, up to three', () => {
  const p = start({ settings: { lives: 2 } });
  const id = p.holder;
  p.answer(id, unused(p, 4));
  const ok = of(p.drain(), 'ok')[0];
  assert.equal(ok.tier, 4); assert.equal(ok.up, 1); assert.equal(ok.lives, 3);
  while (p.holder !== id) p.answer(p.holder, unused(p, 0));
  p.answer(id, unused(p, 4));
  assert.equal(p.byId.get(id).lives, 3, 'never more than three');
});

test('the control panel: only the owner gets the answer ladder, rarest first, and it drops used answers', () => {
  const p = start();
  p.admin(2, { c: 'peek', on: 1 });
  assert.equal(of(p.drain(), 'adm').length, 0, 'not the owner: nothing');
  p.admin(1, { c: 'peek', on: 1 });
  let adm = of(p.drain(), 'adm');
  assert.equal(adm.length, 1); assert.equal(adm[0].to, 1);
  const ladder = adm[0].ladder;
  assert.equal(ladder[0][1], 4, 'starts with the rarest tier');
  for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i][1] <= ladder[i - 1][1], 'then down the tiers');
  assert.ok(adm[0].fuse > 0);
  const best = ladder[0][0];
  p.answer(p.holder, best);
  adm = of(p.drain(), 'adm');
  assert.ok(!adm[0].ladder.some((x) => x[0] === best));
  assert.ok(adm.every((m) => m.to === 1));
});

test('sabotage: the target alone sees a wrong category until their turn ends', () => {
  const p = start({ cats: CATS, seed: 11 });
  const victim = p.players.find((x) => x.id !== 1).id;
  p.admin(victim, { c: 'sab', id: 1, on: 1 });
  assert.equal(p.byId.get(1).sab, null, 'a player who is not the owner cannot sabotage');
  p.admin(1, { c: 'sab', id: victim, on: 1 });
  const q = of(p.drain(), 'q');
  assert.equal(q.length, 1); assert.equal(q[0].to, victim);
  assert.notEqual(q[0].q, p.cat.q);
  assert.equal(p.view(victim).q, q[0].q);
  assert.equal(p.view(1).q, p.cat.q);
  while (p.holder !== victim) p.answer(p.holder, unused(p, 0));
  p.drain();
  // an everyday answer to the fake category is wrong for the real one
  const fake = p.byId.get(victim).sab.cat.answers[0].name;
  assert.equal(p.answer(victim, fake), false);
  // a real answer ends the trick and the victim gets the true category back
  p.answer(victim, unused(p, 0));
  const back = of(p.drain(), 'q');
  assert.equal(back[0].to, victim); assert.equal(back[0].q, p.cat.q);
  assert.equal(p.byId.get(victim).sab, null);
});

test('a sabotaged bot answers the wrong category and gets blown up', () => {
  const ppl = [{ id: 1, name: 'Me', own: true, look: {} }, ...makeBots(1, 2, seeded(3))];
  const p = new Party({ people: ppl, cats: CATS, settings: { lives: 1 }, rand: seeded(5) });
  p.holder = 2;
  p.update(RULES.INTRO + 0.01);
  p.admin(1, { c: 'sab', id: 2, on: 1 });
  let over = null;
  for (let i = 0; i < 2000 && !over; i++) { p.update(0.05); over = of(p.drain(), 'over')[0] || null; }
  assert.ok(over, 'the game ended');
  assert.equal(over.win, 1);
});

test('bots alone play a whole game to a winner', () => {
  for (const seed of [1, 2, 3]) {
    const p = new Party({ people: makeBots(5, 1, seeded(seed)), cats: CATS, rand: seeded(seed * 31) });
    let over = null, oks = 0, t = 0;
    while (!over && t < 3600) { p.update(0.05); t += 0.05; for (const e of p.drain()) { if (e.e === 'ok') oks++; if (e.e === 'over') over = e; } }
    assert.ok(over, 'seed ' + seed + ' finished');
    assert.ok(oks > 10, 'bots gave answers');
    assert.deepEqual(over.table.map((r) => r.place), [1, 2, 3, 4, 5]);
  }
});

test('leaving: the nova moves on, and the game ends when one player is left', () => {
  const p = start({ n: 3 });
  const h = p.holder;
  p.leave(h);
  const left = of(p.drain(), 'left')[0];
  assert.equal(left.id, h); assert.equal(p.holder, left.next); assert.notEqual(p.holder, h);
  assert.equal(p.phase, 'play');
  p.leave(p.holder);
  assert.equal(p.phase, 'over');
  assert.equal(of(p.drain(), 'over')[0].win, p.alive()[0].id);
});
