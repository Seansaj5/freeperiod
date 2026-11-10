import test from 'node:test';
import assert from 'node:assert/strict';
import { TROPHIES, evaluate, mergeRecord, sourcesIn, progressText, playedGames } from '../fp/trophies.js';

const GAMES = ['bing-ball', 'close-call', 'horror-exe'];
const at = (h, day = 10) => new Date(2026, 10, day, h, 0).getTime();      // local time, Nov 2026 (the 10th is a Tuesday)
const byId = (list) => Object.fromEntries(list.map((t) => [t.id, t]));

test('the list: about 20 trophies, unique ids, every one with a title, icon, tier and source', () => {
  assert.ok(TROPHIES.length >= 18 && TROPHIES.length <= 26);
  assert.equal(new Set(TROPHIES.map((t) => t.id)).size, TROPHIES.length);
  for (const t of TROPHIES) {
    assert.ok(t.title && t.desc && t.icon, t.id);
    assert.ok(['bronze', 'silver', 'gold'].includes(t.tier), t.id);
    assert.ok(['local', 'account', 'streak', 'bb', 'chat'].includes(t.src), t.id);
  }
});

test('nothing played: nothing won, local trophies known at 0, account trophies unknown', () => {
  const r = byId(evaluate({ games: GAMES }));
  assert.equal(Object.values(r).filter((t) => t.done).length, 0);
  assert.equal(r['first-game'].known, true);
  assert.equal(r['first-game'].pct, 0);
  assert.equal(r['bb-win'].known, false);      // no career card: unknown, not 0
  assert.equal(r['streak-7'].known, false);
  assert.equal(r['signed-in'].known, false);
  assert.equal(r['try-all'].title, 'Try All 3');
});

test('play time, try all, favorites and the time of day', () => {
  const f = { games: GAMES, play: { 'bing-ball': 3000, 'close-call': 700, nope: 99999 }, recent: { 'horror-exe': at(22) }, favs: ['close-call'], times: [at(22), at(15)] };
  const r = byId(evaluate(f));
  assert.equal(r['first-game'].done, true);
  assert.equal(r['try-all'].done, true);                 // played two, and the third is in "recent"
  assert.equal(r['try-all'].have, 3);
  assert.equal(r['hour-1'].done, true);                  // 3000 + 700 s (the unknown game's time is not counted)
  assert.equal(r['hours-10'].done, false);
  assert.equal(r['hours-10'].pct, 10);
  assert.equal(r['main-game'].done, false);
  assert.equal(r.favorite.done, true);
  assert.equal(r['night-owl'].done, true);               // 10 pm
  assert.equal(r['early-bird'].done, false);
  assert.equal(r.weekend.done, false);                   // a Tuesday
  assert.equal(byId(evaluate({ games: GAMES, times: [at(6, 14)] }))['early-bird'].done, true);   // 6 am
  assert.equal(byId(evaluate({ games: GAMES, times: [at(6, 14)] })).weekend.done, true);         // the 14th is a Saturday
  assert.equal(byId(evaluate({ games: GAMES, times: [at(2)] }))['night-owl'].done, true);         // 2 am still counts
  assert.deepEqual([...playedGames({ games: GAMES, play: { x: 5 }, recent: { 'bing-ball': 1 } })], ['bing-ball']);
});

test('streak, Bing Ball career, saves and chat', () => {
  const f = { games: GAMES, signedIn: true, streak: { days: 2, best: 8 }, bb: { wins: 1, goals: 49, mvps: 0, level: 10 },
    cc: { best: 25000, cars: 4 }, hx: { wins: 0, escapes: 7 }, chat: true };
  const r = byId(evaluate(f));
  assert.equal(r['signed-in'].done, true);
  assert.equal(r['streak-3'].done, true);                // the best streak counts, not only today's
  assert.equal(r['streak-7'].done, true);
  assert.equal(r['streak-30'].done, false);
  assert.equal(r['streak-30'].have, 8);
  assert.equal(r['bb-win'].done, true);
  assert.equal(r['bb-goals'].done, false);
  assert.equal(r['bb-goals'].pct, 98);
  assert.equal(r['bb-mvp'].done, false);
  assert.equal(r['bb-level'].done, true);
  assert.equal(r['cc-speed'].done, true);
  assert.equal(r['cc-garage'].done, false);
  assert.equal(r['hx-survivor'].done, false);
  assert.equal(r['hx-escape'].done, true);
  assert.equal(r['hx-escape'].have, 5);                  // capped at the need
  assert.equal(r.chatterbox.done, true);
  assert.equal(byId(evaluate({ ...f, chat: false })).chatterbox.done, false);
});

test('a won trophy stays won when today says less', () => {
  const r = byId(evaluate({ games: GAMES }, { 'cc-speed': 123, 'bb-win': 456 }));
  assert.equal(r['cc-speed'].done, true);
  assert.equal(r['cc-speed'].pct, 100);
  assert.equal(r['bb-win'].done, true);
  assert.equal(r['bb-win'].known, true);
});

test('mergeRecord: the first look at a source is quiet (one summary), later wins are fresh (a toast each)', () => {
  const f1 = { games: GAMES, play: { 'bing-ball': 4000 }, favs: [] };
  const a = mergeRecord(null, evaluate(f1), f1, 1000);
  assert.deepEqual(a.fresh, []);
  assert.deepEqual(a.quiet.sort(), ['first-game', 'hour-1']);
  assert.equal(a.record.src.local, 1);
  assert.equal(a.record.unseen, 2);
  assert.equal(a.record.got['first-game'], 1000);
  // favorite a game: local is known now, so it is fresh
  const f2 = { ...f1, favs: ['bing-ball'] };
  const b = mergeRecord(a.record, evaluate(f2, a.record.got), f2, 2000);
  assert.deepEqual(b.fresh, ['favorite']);
  assert.deepEqual(b.quiet, []);
  assert.equal(b.record.got['first-game'], 1000);        // the old date is kept
  // the career card arrives for the first time: its trophies are quiet; the next win after that is fresh
  const f3 = { ...f2, bb: { wins: 3, goals: 10, mvps: 1, level: 2 } };
  const c = mergeRecord(b.record, evaluate(f3, b.record.got), f3, 3000);
  assert.deepEqual(c.quiet.sort(), ['bb-mvp', 'bb-win']);
  assert.deepEqual(c.fresh, []);
  const f4 = { ...f3, bb: { ...f3.bb, goals: 50 } };
  const d = mergeRecord(c.record, evaluate(f4, c.record.got), f4, 4000);
  assert.deepEqual(d.fresh, ['bb-goals']);
  // nothing new: nothing to celebrate, same record
  const e = mergeRecord(d.record, evaluate(f4, d.record.got), f4, 5000);
  assert.deepEqual([e.fresh, e.quiet], [[], []]);
  assert.deepEqual(e.record, d.record);
});

test('sourcesIn and progressText', () => {
  assert.deepEqual([...sourcesIn({})], ['local']);
  assert.deepEqual([...sourcesIn({ signedIn: false, streak: { days: 1 }, bb: {}, chat: false })].sort(), ['account', 'bb', 'chat', 'local', 'streak']);
  const r = byId(evaluate({ games: GAMES, play: { 'bing-ball': 1500 }, streak: { days: 2, best: 2 }, cc: { best: 18400 } }));
  assert.equal(progressText(r['hour-1']), '25m / 1h');
  assert.equal(progressText(r['hours-10']), '25m / 10h');
  assert.equal(progressText(r['streak-7']), '2 / 7 days');
  assert.equal(progressText(r['cc-speed']), '18,400 / 25,000');
});
