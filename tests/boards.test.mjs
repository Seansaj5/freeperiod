// fp/boards.js: the leaderboard catalog, number formats, answer checks, the podium/list/pinned view, link state and the fetch cache.
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
let n = 0;
async function load({ fetch = async () => json(200, {}) } = {}) {
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search: '', hostname: 'seansaj5.github.io' };
  globalThis.fetch = fetch;
  localStorage.setItem('fp.token', 'tok');
  return import('../fp/boards.js?n=' + (++n));
}
const row = (pos, name, v, extra = {}) => ({ pos, name, role: 'player', v, ...extra });

test('catalog: four tabs, every board once, weekly only on counters', async () => {
  const B = await load();
  assert.deepEqual(B.TABS.map((t) => t.id), ['bing-ball', 'close-call', 'horror-exe', 'free-period']);
  assert.deepEqual(B.BOARDS.map((b) => b.id), ['bb-1v1', 'bb-2v2', 'bb-3v3', 'cc-combo', 'cc-points', 'cc-cars', 'hx-xp', 'hx-escapes', 'hx-exewins', 'fp-best-streak', 'fp-streak', 'fp-play']);
  assert.deepEqual(B.BOARDS.filter((b) => b.weekly).map((b) => b.id), ['cc-points', 'hx-xp', 'hx-escapes', 'hx-exewins', 'fp-play']);
  assert.ok(B.HOME_BOARDS.every((id) => B.boardById(id)));
  for (const b of B.BOARDS) { assert.equal(B.tabById(b.tab).boards.includes(b), true); assert.ok(b.label && b.short && b.empty); }
});

test('numbers: full under a million, short above; play time; units', async () => {
  const B = await load();
  assert.equal(B.compact(999_999), '999,999');
  assert.equal(B.compact(1_250_000), '1.25M'); assert.equal(B.compact(18_400_000), '18.4M'); assert.equal(B.compact(412_000_000), '412M');
  assert.equal(B.compact(2_000_000_000), '2B'); assert.equal(B.compact(-5), '0'); assert.equal(B.compact('x'), '0');
  assert.equal(B.playTime(0), '0m'); assert.equal(B.playTime(30), '<1m'); assert.equal(B.playTime(3600 * 12 + 300), '12h 5m');
  const cars = B.boardById('cc-cars');
  assert.deepEqual(B.formatValue(cars, 1), { text: '1', unit: 'car', title: '1 car' });
  assert.deepEqual(B.formatValue(cars, 9), { text: '9', unit: 'cars', title: '9 cars' });
  assert.deepEqual(B.formatValue(B.boardById('bb-1v1'), 1234.4), { text: '1,234', unit: 'rating', title: '1,234 rating' });
  assert.equal(B.formatValue(B.boardById('cc-points'), 18_400_000).title, '18,400,000 pts');
  assert.equal(B.formatValue(B.boardById('fp-play'), 7200).text, '2h 0m');
  assert.equal(B.record({ w: 9, l: 1, d: 0 }), '9W 1L'); assert.equal(B.record({ w: 2, l: 3, d: 1 }), '2W 3L 1D');
});

test('answers are checked: bad names, roles and tiers never get through', async () => {
  const B = await load();
  assert.equal(B.cleanEntry({ pos: 1, name: '<img src=x onerror=alert(1)>', v: 5 }), null);
  assert.equal(B.cleanEntry({ pos: 1, name: 'ab', v: 5 }), null);
  assert.equal(B.cleanEntry(null), null);
  assert.deepEqual(B.cleanEntry({ pos: 3, name: 'Maya_1', role: 'god', v: '12', tier: 'nope', coins: 99, token: 't' }), { pos: 3, name: 'Maya_1', role: 'player', v: 12 });
  assert.deepEqual(B.cleanEntry({ pos: 1, name: 'Maya_1', role: 'owner', v: 1400, tier: 'ace', w: 9, l: 1, d: 0 }), { pos: 1, name: 'Maya_1', role: 'owner', v: 1400, tier: 'ace', w: 9, l: 1, d: 0 });
  const d = B.cleanBoard({ board: 'cc-points', window: 'week', week: '2026-11-09', total: 63, at: 5, top: [row(1, 'aaa', 9), { pos: 2, name: 'b' }, row(0, 'ccc', 1), 'x'], me: row(60, 'meme', 2), named: [row(9, 'pal', 3)], hidden: ['hacker', '<b>'] });
  assert.deepEqual(d.top.map((e) => e.name), ['aaa']);
  assert.equal(d.window, 'week'); assert.equal(d.week, '2026-11-09'); assert.equal(d.total, 63);
  assert.equal(d.me.pos, 60); assert.deepEqual(d.named.map((e) => e.name), ['pal']); assert.deepEqual(d.hidden, ['hacker']);
  const empty = B.cleanBoard(undefined);
  assert.deepEqual([empty.top, empty.me, empty.named, empty.hidden, empty.window], [[], null, null, null, 'all']);
  assert.equal(B.cleanBoard({ top: Array.from({ length: 80 }, (_, i) => row(i + 1, 'p_' + String(i).padStart(3, '0'), 80 - i)) }).top.length, 50);
  const s = B.cleanSummary({ boards: { 'cc-combo': { top: [row(1, 'aaa', 9), row(2, 'bbb', 8), row(3, 'ccc', 7), row(4, 'ddd', 6)], total: 9, me: { pos: 4, v: 6 } }, 'zz-nope': { top: [] } } });
  assert.deepEqual(Object.keys(s), ['cc-combo']); assert.equal(s['cc-combo'].top.length, 3); assert.deepEqual(s['cc-combo'].me, { pos: 4, v: 6 });
});

test('the view: podium + list, my row pinned only when I am below the list', async () => {
  const B = await load();
  const top = Array.from({ length: 50 }, (_, i) => row(i + 1, 'p_' + String(i + 1).padStart(2, '0'), 1000 - i));
  const far = B.boardView(B.cleanBoard({ top, me: row(63, 'late_one', 3) }), { me: 'Late_One' });
  assert.deepEqual(far.podium.map((e) => e.pos), [1, 2, 3]); assert.equal(far.list.length, 47); assert.equal(far.list[0].pos, 4);
  assert.equal(far.pinned.pos, 63); assert.equal(far.mine.pos, 63);
  const inside = B.boardView(B.cleanBoard({ top, me: row(7, 'p_07', 994) }), { me: 'p_07' });
  assert.equal(inside.pinned, null); assert.equal(inside.mine.pos, 7);
  const off = B.boardView(B.cleanBoard({ top, me: { pos: null, name: 'nobody1', v: 0 } }), { me: 'nobody1' });
  assert.equal(off.pinned, null); assert.equal(off.mine, null);
  const few = B.boardView(B.cleanBoard({ top: top.slice(0, 2) }));
  assert.deepEqual(few.podium.map((e) => e && e.pos), [1, 2, null]); assert.equal(few.list.length, 0); assert.equal(few.count, 2);
  assert.equal(B.boardView(B.cleanBoard({})).count, 0);
});

test('the Friends view: friends on the board (from named or top) and me, by their real places', async () => {
  const B = await load();
  const top = Array.from({ length: 50 }, (_, i) => row(i + 1, 'p_' + String(i + 1).padStart(2, '0'), 1000 - i));
  const d = B.cleanBoard({ top, me: row(8, 'p_08', 993), named: [row(2, 'p_02', 999), row(57, 'far_pal', 4), row(12, 'p_12', 989)] });
  const v = B.boardView(d, { friendNames: ['P_02', 'far_pal', 'p_12', 'p_40', 'not_on_it'], me: 'p_08' });
  assert.deepEqual([...v.podium, ...v.list].map((e) => e.pos), [2, 8, 12, 40, 57]);      // p_40 came from the top list, not `named`
  assert.equal(v.pinned, null); assert.equal(v.count, 5);
  assert.equal(B.boardView(d, { friendNames: [], me: 'p_08' }).count, 1);              // no friends on it: just me
  assert.equal(B.boardView(B.cleanBoard({ top }), { friendNames: ['zzz_pal'], me: '' }).count, 0);
});

test('link state: unknown values fall back; round trip', async () => {
  const B = await load();
  assert.deepEqual(B.readState(''), { tab: 'bing-ball', board: 'bb-1v1', window: 'all' });
  assert.deepEqual(B.readState('?tab=close-call&board=cc-points&window=week'), { tab: 'close-call', board: 'cc-points', window: 'week' });
  assert.deepEqual(B.readState('?board=hx-escapes'), { tab: 'horror-exe', board: 'hx-escapes', window: 'all' });
  assert.deepEqual(B.readState('?tab=close-call&board=hx-xp'), { tab: 'close-call', board: 'cc-combo', window: 'all' });   // a board of another tab
  assert.deepEqual(B.readState('?tab=nope&window=week'), { tab: 'bing-ball', board: 'bb-1v1', window: 'all' });
  assert.equal(B.readState('?tab=close-call&board=cc-combo&window=week').window, 'all');                         // a best-of has no week
  for (const s of [{ tab: 'bing-ball', board: 'bb-1v1', window: 'all' }, { tab: 'free-period', board: 'fp-play', window: 'week' }, { tab: 'close-call', board: 'cc-cars', window: 'all' }]) {
    assert.deepEqual(B.readState(B.stateQuery(s)), s);
  }
  assert.equal(B.stateQuery({ tab: 'bing-ball', board: 'bb-1v1', window: 'all' }), '');
  assert.equal(B.boardLink('hx-xp'), 'leaderboards.html?tab=horror-exe');
  assert.equal(B.boardLink('fp-play', 'week'), 'leaderboards.html?tab=free-period&board=fp-play&window=week');
  assert.equal(B.weekLabel('2026-11-09'), 'Mon, Nov 9'); assert.equal(B.weekLabel('nope'), '');
});

test('avatar hues: stable, never pink or purple', async () => {
  const B = await load();
  assert.equal(B.nameHue('NeonMaya'), B.nameHue('neonmaya'));
  const hues = new Set(Array.from({ length: 300 }, (_, i) => B.nameHue('player' + i)));
  for (const hex of hues) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(!(r > 150 && b > 150 && g < 140), hex + ' is pink/purple');
  }
});

test('fetch: the right request, a minute of cache, the owner switch', async () => {
  const calls = [];
  const B = await load({ fetch: async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization, method: opts.method, body: opts.body });
    if (url.includes('board-hide')) return json(200, { ok: true, hiddenNames: ['hacker', '<x>'] });
    if (url.includes('/leaderboards')) return json(200, { ok: true, boards: { 'hx-xp': { top: [row(1, 'aaa', 5)], total: 1, me: null } } });
    return json(200, { ok: true, board: 'cc-points', total: 1, top: [row(1, 'aaa', 5)], me: null });
  } });
  const a = await B.fetchBoard('cc-points', { window: 'week', names: ['pal_one', 'pal_two'] });
  assert.equal(a.top[0].name, 'aaa');
  assert.equal(calls[0].url, 'https://bing-ball.onrender.com/api/fp/leaderboard?board=cc-points&window=week&names=pal_one%2Cpal_two');
  assert.equal(calls[0].auth, 'Bearer tok'); assert.equal(calls[0].method, 'GET');
  await B.fetchBoard('cc-points', { window: 'week', names: ['pal_one', 'pal_two'] });
  assert.equal(calls.length, 1);                                       // cached
  await B.fetchBoard('cc-points');
  assert.equal(calls.length, 2);                                       // another window: another request
  await B.fetchBoard('cc-points', { force: true });
  assert.equal(calls.length, 3);
  const s = await B.fetchSummary();
  assert.equal(s['hx-xp'].top[0].name, 'aaa'); assert.ok(calls[3].url.endsWith('/api/fp/leaderboards'));
  assert.deepEqual(await B.setHidden('hacker', 1), ['hacker']);
  assert.equal(calls[4].method, 'POST'); assert.deepEqual(JSON.parse(calls[4].body), { username: 'hacker', hidden: true });
  await B.fetchBoard('cc-points');
  assert.equal(calls.length, 6);                                       // a hide empties the cache
  const bad = await load({ fetch: async () => json(400, { ok: false, error: 'There is no such leaderboard' }) });
  await assert.rejects(bad.fetchBoard('zz'), (e) => e.status === 400 && /no such/.test(e.message));
});
