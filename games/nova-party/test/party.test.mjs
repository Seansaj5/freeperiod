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

test('a BLUE MOON answer fills the life bar in one go: a heart back, up to five', () => {
  const p = start({ settings: { lives: 2 } });
  const id = p.holder;
  p.answer(id, unused(p, 4));
  const ok = of(p.drain(), 'ok')[0];
  assert.equal(ok.tier, 4); assert.equal(ok.up, 1); assert.equal(ok.lives, 3); assert.equal(ok.bar, 0);
  p.byId.get(id).lives = 4;
  for (let k = 0; k < 2; k++) { while (p.holder !== id) p.answer(p.holder, unused(p, 0)); p.answer(id, unused(p, 4)); }
  assert.equal(p.byId.get(id).lives, RULES.MAX_LIVES, 'never more than five');
  assert.equal(RULES.MAX_LIVES, 5);
  assert.equal(p.byId.get(id).bar, 100, 'at five hearts a full bar waits');
  // ...and pays out on the first answer after a heart is lost
  p.byId.get(id).lives = 4;
  while (p.holder !== id) p.answer(p.holder, unused(p, 0));
  p.drain();
  p.answer(id, unused(p, 0));
  const back = of(p.drain(), 'ok')[0];
  assert.equal(back.up, 1); assert.equal(back.lives, 5);
});

test('the life bar: rarer answers fill it more, a full bar is a heart, and each heart won makes the next harder', () => {
  const p = start({ n: 2, cats: [catById('state'), catById('fruit')], settings: { lives: 1, twist: 0 } });
  assert.equal(p.set.bar, 'normal');
  const a = p.holder, b = p.nextAfter(a), A = p.byId.get(a);
  const give = (tier) => { p.answer(a, unused(p, tier)); const ok = of(p.drain(), 'ok')[0]; p.answer(b, unused(p, 0)); p.drain(); return ok; };
  const fills = [0, 1, 2, 3].map((t) => { const before = A.bar; give(t); return +(A.bar - before).toFixed(2); });
  assert.deepEqual(fills, RULES.BAR.slice(0, 4), 'what each tier adds');
  assert.ok(fills[0] < fills[1] && fills[1] < fills[2] && fills[2] < fills[3]);
  assert.equal(p.view(0).players.find((x) => x.id === a).bar, 69);
  const ok = give(3);
  assert.equal(ok.up, 1); assert.equal(ok.lives, 2); assert.equal(ok.bar, 9, 'what was over the top carries on');
  const before = A.bar; give(3);
  assert.equal(+(A.bar - before).toFixed(2), +(RULES.BAR[3] / RULES.BAR_GROW).toFixed(2), 'the second heart takes more');
  // speeds, and off (only a BLUE MOON gives a heart then)
  const fast = start({ n: 2, settings: { bar: 'fast' } }), off = start({ n: 2, settings: { bar: 'off' } });
  fast.answer(fast.holder, unused(fast, 2)); off.answer(off.holder, unused(off, 3));
  assert.equal(of(fast.drain(), 'ok')[0].bar, Math.round(RULES.BAR[2] * RULES.BARS.fast));
  assert.equal(of(off.drain(), 'ok')[0].bar, 0);
  off.answer(off.holder, unused(off, 4));
  assert.equal(of(off.drain(), 'ok')[0].up, 1);
  assert.equal(start({ settings: { bar: 'nope' } }).set.bar, 'normal');
  // bots charge slower than people
  const bots = new Party({ people: makeBots(2, 1, seeded(4)), cats: fruitOnly(), rand: seeded(8) });
  bots.drain(); bots.update(RULES.INTRO + 0.01); bots.plan = null;
  const bh = bots.holder;
  bots.answer(bh, unused(bots, 3));
  assert.equal(bots.byId.get(bh).bar, RULES.BAR[3] * RULES.BAR_BOT);
  assert.equal(start({ settings: { lives: 9 } }).set.lives, 5);
});

test('a long game heats up: from category six on each fuse is shorter than the last, down to a floor', () => {
  const p = start({ n: 2, settings: { lives: 5 } });
  const hots = [];
  for (let i = 0; i < 30 && p.phase !== 'over'; i++) {
    hots.push(p.hot);
    for (const x of p.players) x.lives = 5;                // nobody goes out: we only want the rounds to tick by
    p.update(60); p.update(RULES.POP_HOLD + 0.01); p.update(RULES.NEXT + 0.01); p.drain();
  }
  assert.ok(hots.slice(0, RULES.HEAT_FROM).every((h) => h === 1), 'the first categories are untouched');
  assert.ok(hots[RULES.HEAT_FROM] < 1);
  for (let i = RULES.HEAT_FROM + 1; i < hots.length; i++) assert.ok(hots[i] <= hots[i - 1]);
  assert.equal(hots[hots.length - 1], RULES.HEAT_MIN);
  assert.ok(p.view(0).hot <= 1);
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

test('the twist: a DEEP SPACE answer turns the ring round, unless twists are off or only two are left', () => {
  const p = start({ n: 3 });
  const a = p.holder;
  p.answer(a, unused(p, 0));
  const b = p.holder;
  p.drain();
  p.answer(b, unused(p, 3));
  const ok = of(p.drain(), 'ok')[0];
  assert.equal(ok.rev, 1); assert.equal(ok.dir, -1);
  assert.equal(p.holder, a, 'the nova goes back the way it came');
  p.answer(a, unused(p, 0));
  assert.ok(p.holder !== a && p.holder !== b, 'and keeps going that way');
  assert.equal(p.view(0).dir, -1);
  const off = start({ n: 3, settings: { twist: 0 } });
  const first = off.holder;
  off.answer(first, unused(off, 0)); off.drain();
  off.answer(off.holder, unused(off, 3));
  assert.equal(of(off.drain(), 'ok')[0].rev, 0);
  assert.notEqual(off.holder, first);
  const two = start({ n: 2 });
  two.answer(two.holder, unused(two, 3));
  assert.equal(of(two.drain(), 'ok')[0].rev, 0, 'with two left there is nowhere else to go');
});

test('shouts: anyone in the ring can send one, even when out, but not in a burst', () => {
  const p = start({ n: 3 });
  assert.equal(p.emote(1, 2), true);
  assert.deepEqual(of(p.drain(), 'emo')[0], { e: 'emo', id: 1, k: 2 });
  assert.equal(p.emote(1, 0), false, 'too soon after the last one');
  assert.equal(p.emote(2, 99), false); assert.equal(p.emote(2, 1.5), false); assert.equal(p.emote(9, 0), false);
  p.update(RULES.EMOTE_GAP + 0.05);
  p.byId.get(1).out = true;
  assert.equal(p.emote(1, 0), true);
  p.leave(2);
  assert.equal(p.emote(2, 0), false, 'gone from the room');
});

test('the results come with awards for what players actually did', () => {
  const p = start({ n: 2, settings: { lives: 1 } });
  const a = p.holder, b = p.nextAfter(a);
  for (let i = 0; i < 3; i++) { p.update(1); p.answer(a, unused(p, i === 0 ? 2 : 4)); p.update(2); p.answer(b, 'zzzzqq'); p.answer(b, unused(p, 0)); }
  p.fuse = 0.4; p.answer(a, unused(p, 0));
  p.update(60); p.update(RULES.POP_HOLD + 0.01);
  const over = of(p.drain(), 'over')[0];
  const by = Object.fromEntries(over.awards.map((x) => [x.k, x]));
  assert.ok(over.awards.length >= 3 && over.awards.length <= 4);
  assert.equal(by.close.id, a); assert.equal(by.close.v, 0.4);
  assert.equal(by.quick.id, a, 'a answered in a second, b took two');
  assert.equal(by.deep.id, a); assert.equal(by.deep.v, 3);
  assert.equal(by.score.id, a);
  assert.deepEqual(p.overEvent().table, over.table);
  // nobody did anything: no awards
  const q = start({ n: 2, settings: { lives: 1 } });
  q.update(60); q.update(RULES.POP_HOLD + 0.01);
  assert.deepEqual(of(q.drain(), 'over')[0].awards, []);
});

test('bots shout now and then, and only bots', () => {
  const ppl = [{ id: 1, name: 'Me', look: {} }, ...makeBots(4, 2, seeded(9))];
  const p = new Party({ people: ppl, cats: CATS, settings: { lives: 1 }, rand: seeded(21) });
  let emo = [], over = null;
  for (let i = 0; i < 20000 && !over; i++) { p.update(0.05); for (const e of p.drain()) { if (e.e === 'emo') emo.push(e); if (e.e === 'over') over = e; } }
  for (let i = 0; i < 60; i++) { p.update(0.05); emo.push(...of(p.drain(), 'emo')); }
  assert.ok(over);
  assert.ok(emo.length > 0, 'at least one shout in a whole game');
  assert.ok(emo.every((e) => e.id !== 1 && RULES.EMOTES[e.k]));
});
