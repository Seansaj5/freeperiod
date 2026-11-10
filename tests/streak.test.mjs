import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
let n = 0;
async function setup({ fetch, token = 'tok', user = 'Sean' } = {}) {
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search: '' };
  globalThis.fetch = fetch;
  if (token) { localStorage.setItem('fp.token', token); localStorage.setItem('fp.user', JSON.stringify({ username: user, role: 'player' })); }
  globalThis.document = { getElementById: () => null, addEventListener() {} };
  globalThis.matchMedia = () => ({ matches: true });
  const q = '?n=' + (++n);
  return import('../fp/streak.js' + q);
}

test('pure helpers', async () => {
  const s = await setup({ fetch: async () => json(200, {}) });
  assert.equal(s.cleanView(null), null);
  const v = s.cleanView({ days: 4, best: 2, today: '2026-11-10', doneToday: true, badges: ['streak-3', 'x', 'streak-7'], next: { days: 7, label: '7-day streak' } });
  assert.equal(v.best, 4); assert.deepEqual(v.badges, ['streak-3', 'streak-7']); assert.equal(v.next.left, 3);
  assert.deepEqual(s.bestBadge(['streak-3', 'streak-14', 'streak-7']).days, 14);
  assert.equal(s.bestBadge([]), null);
  const dots = s.weekDots(v);
  assert.equal(dots.length, 7);
  assert.deepEqual(dots.map(d => d.lit), [false, false, false, true, true, true, true]);
  assert.equal(dots[6].today, true); assert.equal(dots[6].dow, 2);      // 2026-11-10 is a Tuesday
  assert.equal(dots[0].dow, 3);
  // not checked in yet today: yesterday and before are lit, today's dot is empty
  assert.deepEqual(s.weekDots({ ...v, doneToday: false }).map(d => d.lit), [false, false, true, true, true, true, false]);
  assert.equal(s.weekDots({ days: 20, today: '2026-11-10', doneToday: true }).every(d => d.lit), true);
  const table = [3, 7, 14].map(days => ({ days }));
  assert.equal(s.progressPct(v, table), 25);      // 4 of the way from 3 to 7
  assert.equal(s.progressPct(s.cleanView({ days: 1, next: { days: 3 } }), table), 33);
  assert.equal(s.progressPct(s.cleanView({ days: 150 }), table), 100);
  assert.equal(s.progressPct(null, table), 0);
});

test('check-in posts an empty body (never a date) and keeps the answer', async () => {
  let seen = null;
  const s = await setup({ fetch: async (url, opts) => { seen = { url, opts }; return json(200, { ok: true, days: 3, best: 3, today: '2026-11-10', doneToday: true, gained: false, unlocked: [], badges: ['streak-3'], next: { days: 7, label: '7-day streak', left: 4 }, rewards: [{ days: 3 }, { days: 7 }] }); } });
  const v = await s.checkin();
  assert.match(seen.url, /\/api\/fp\/checkin$/);
  assert.equal(seen.opts.method, 'POST'); assert.equal(seen.opts.body, '{}'); assert.equal(seen.opts.headers.Authorization, 'Bearer tok');
  assert.equal(v.days, 3);
  assert.equal(s.getStreak().days, 3);
  assert.equal(JSON.parse(localStorage.getItem('fp.streak')).user, 'sean');
  // asked once per visit: a second call right away makes no request
  seen = null; await s.checkin(); assert.equal(seen, null);
});

test('a failed check-in (waking server) is silent; logged out does nothing', async () => {
  const s = await setup({ fetch: async () => { throw new Error('down'); } });
  assert.equal(await s.checkin(), null);
  const t = await setup({ token: null, fetch: async () => { throw new Error('should not be called'); } });
  assert.equal(await t.checkin(), null);
  assert.equal(t.getStreak(), null);
});

test('chat flair: best streak badge from game_stats, cleaned', async () => {
  const f = await import('../fp/chat/flair.js');
  assert.deepEqual(f.badgesFor({ game_stats: { badges: ['streak-3', 'streak-14', 'streak-7'] } }).filter(b => b.startsWith('streak')), ['streak:14']);
  assert.deepEqual(f.badgesFor({ game_stats: { badges: ['streak-x', 5, null, 'streak-0'] } }).filter(b => b.startsWith('streak')), []);
  assert.deepEqual(f.badgesFor({}), []);
  assert.equal(f.badgeInfo('streak:7').label, '\u{1F525} 7-day streak');
  assert.equal(f.badgeInfo('streak:0'), null);
  assert.equal(f.streakDays('nope'), 0);
});

test('play-page check-in: once a day per device, per account, quiet', async () => {
  let calls = 0;
  const today = (await setup({ fetch: async () => json(200, {}) })).localDay();
  const answer = (over = {}) => json(200, { ok: true, days: 5, best: 5, today, doneToday: true, gained: true, unlocked: [{ days: 3, flair: { label: 'Ember avatar frame' } }], badges: ['streak-3'], next: { days: 7, label: '7-day streak', left: 2 }, rewards: [], ...over });
  const s = await setup({ fetch: async () => { calls++; return answer(); } });
  assert.equal(await s.dailyCheckin(), true);          // nothing cached: asks the server
  assert.equal(calls, 1);
  const pend = JSON.parse(localStorage.getItem('fp.streak.pending'));
  assert.equal(pend.user, 'sean'); assert.equal(pend.days, 5);     // quiet: remembered for the home page, no toast here
  assert.equal(JSON.parse(localStorage.getItem('fp.streak')).view.today, today);
  assert.equal(await s.dailyCheckin(), false);         // cached for today: no request
  assert.equal(calls, 1);
});

test('play-page check-in asks again for a new day or another account', async () => {
  let calls = 0;
  const s = await setup({ fetch: async () => { calls++; return json(200, { ok: true, days: 2, best: 2, today: s2day(), doneToday: true, gained: false, unlocked: [], badges: [], next: null, rewards: [] }); } });
  const s2day = () => s.localDay();
  // cached answer from yesterday
  localStorage.setItem('fp.streak', JSON.stringify({ user: 'sean', view: { days: 1, best: 1, today: '2020-01-01', doneToday: true, badges: [] } }));
  assert.equal(await s.dailyCheckin(), true); assert.equal(calls, 1);
  assert.equal(await s.dailyCheckin(), false); assert.equal(calls, 1);
  // a cache that belongs to someone else does not count
  localStorage.setItem('fp.streak', JSON.stringify({ user: 'other', view: { days: 9, best: 9, today: s.localDay(), doneToday: true, badges: [] } }));
  assert.equal(await s.dailyCheckin(), true); assert.equal(calls, 2);
  // gained === false: nothing pending
  assert.equal(localStorage.getItem('fp.streak.pending'), null);
});

test('play-page check-in: logged out never calls; failure leaves no cache', async () => {
  const t = await setup({ token: null, fetch: async () => { throw new Error('no'); } });
  assert.equal(await t.dailyCheckin(), false);
  const u = await setup({ fetch: async () => { throw new Error('down'); } });
  assert.equal(await u.dailyCheckin(), true);
  assert.equal(localStorage.getItem('fp.streak'), null);
  assert.equal(await u.dailyCheckin(), true);          // still tries next time
});
