// Profile badges outside flair.js: who may give them (perms.js), the /badge command (commands.js) and data.grantBadge
// (data.js, against a fake client that records the RPC). The database rules (0011_badges.sql: Early Member, grant_badge)
// are tested on PGlite and on the test project (scratchpad chattest).
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
globalThis.sessionStorage = fakeStorage();
globalThis.location = { search: '', hostname: 'test.invalid' };
const data = await import('../fp/chat/data.js');
const { canGrantBadges, PROFILE_FIELDS, profileDiff } = await import('../fp/chat/perms.js');
const { COMMANDS, commandNamed, allowed, visibleCommands, parseArgs, parseLine, usage, badgeArg, hintFor } = await import('../fp/chat/commands.js');
const { GRANTED_BADGES } = await import('../fp/chat/flair.js');

test('only the owner may give badges (banned or demoted staff never could anyway)', () => {
  assert.equal(canGrantBadges({ id: 'a', role: 'owner' }), true);
  assert.equal(canGrantBadges({ id: 'a', role: 'owner', banned: true }), true, 'the owner cannot be banned');
  for (const p of [{ id: 'a', role: 'mod' }, { id: 'a', is_mod: true }, { id: 'a', role: 'member' }, { id: 'a' }, null, { role: 'owner' }]) {
    assert.equal(canGrantBadges(p), false, JSON.stringify(p));
  }
});

test('the badge columns are server-owned: never in the editable profile fields, never in a profile diff', () => {
  for (const k of ['early_member', 'granted_badges', 'is_bot', 'role', 'game_stats']) assert.ok(!PROFILE_FIELDS.includes(k), k);
  assert.deepEqual(profileDiff({ about: 'a', early_member: false, granted_badges: [] }, { about: 'a', early_member: true, granted_badges: ['vip'] }), {});
});

test('/badge: owner only, after /unmod; usage and hint', () => {
  const c = commandNamed('badge');
  assert.ok(c);
  assert.equal(c.who, 'owner');
  assert.equal(usage(c), 'Usage: /badge @user <badge> [off]');
  assert.equal(allowed(c, 'owner'), true);
  for (const r of ['mod', 'member', '']) {
    assert.equal(allowed(c, r), false, r);
    assert.ok(!visibleCommands(r).includes(c), r);
  }
  const order = COMMANDS.map((x) => x.name);
  assert.equal(order.indexOf('badge'), order.indexOf('unmod') + 1);
  assert.ok(visibleCommands('owner', { dm: true }).includes(c), 'works in a DM too');
  for (const id of GRANTED_BADGES) assert.ok(c.desc.includes(id), 'the description lists ' + id);
  assert.equal(hintFor('/badge ', 'owner'), c);
  assert.equal(hintFor('/badge ', 'mod'), null);
  assert.equal(parseLine('/BADGE @amy vip').cmd, c);
});

test('/badge arguments: a person, a badge (forgiving spelling), then optional on / off', () => {
  const c = commandNamed('badge');
  assert.deepEqual(parseArgs(c, '@Mia_K vip'), { ok: true, values: { user: 'mia_k', badge: 'vip' } });
  assert.deepEqual(parseArgs(c, 'mia bug-hunter'), { ok: true, values: { user: 'mia', badge: 'bug-hunter' } });
  assert.deepEqual(parseArgs(c, '@mia OG off'), { ok: true, values: { user: 'mia', badge: 'og', state: 'off' } });
  assert.deepEqual(parseArgs(c, '@mia tester on'), { ok: true, values: { user: 'mia', badge: 'tester', state: 'on' } });
  assert.deepEqual(parseArgs(c, '@mia helper off and more words'), { ok: true, values: { user: 'mia', badge: 'helper', state: 'off' } });
  assert.deepEqual(parseArgs(c, '@mia admin'), { ok: false, error: 'Badges you can give: bug-hunter, helper, artist, tester, vip, og' });
  assert.deepEqual(parseArgs(c, '@mia early'), { ok: false, error: 'Badges you can give: bug-hunter, helper, artist, tester, vip, og' }, 'Early Member is never given');
  assert.deepEqual(parseArgs(c, '@mia vip maybe'), { ok: false, error: 'Usage: /badge @user <badge> [off]' });
  assert.deepEqual(parseArgs(c, '@mia'), { ok: false, error: 'Usage: /badge @user <badge> [off]' });
  assert.deepEqual(parseArgs(c, ''), { ok: false, error: 'Usage: /badge @user <badge> [off]' });
  assert.equal(parseArgs(c, '@m!a vip').ok, false);
});

test('badgeArg: every spelling people might use maps to the database id; nothing else does', () => {
  const want = {
    'bug-hunter': ['bug-hunter', 'Bug-Hunter', 'bughunter', 'bug_hunter', 'BUG', 'bugs', 'hunter'],
    helper: ['helper', 'Help'], artist: ['artist', 'ART'], tester: ['tester', 'test'], vip: ['vip', 'V-I-P'], og: ['og', 'OG'],
  };
  for (const [id, words] of Object.entries(want)) for (const w of words) assert.equal(badgeArg(w), id, w);
  for (const w of ['', 'early', 'owner', 'mod', 'bot', 'admin', 'vipp', 'o g g', null, undefined, '__proto__', 'constructor', 'toString']) {
    assert.equal(badgeArg(w), null, String(w));
  }
  for (const id of GRANTED_BADGES) assert.equal(badgeArg(id), id, 'every id is its own word');
});

test('data.grantBadge: one grant_badge RPC with the database argument names; the list comes back clean', async () => {
  const calls = [];
  let answer = { data: ['bug-hunter', 'vip'], error: null };
  data._inject({ client: { rpc: async (fn, args) => { calls.push([fn, args]); return answer; } }, me: () => ({ id: 'me-1' }) });
  assert.deepEqual(await data.grantBadge('u-2', 'vip', true), ['bug-hunter', 'vip']);
  assert.deepEqual(calls.pop(), ['grant_badge', { target: 'u-2', badge: 'vip', on: true }]);
  await data.grantBadge('u-2', 'og', false);
  assert.deepEqual(calls.pop(), ['grant_badge', { target: 'u-2', badge: 'og', on: false }]);
  await data.grantBadge('u-2', 'og');
  assert.equal(calls.pop()[1].on, true, 'on by default');
  answer = { data: ['vip', 'weird', 3], error: null };
  assert.deepEqual(await data.grantBadge('u-2', 'vip', true), ['vip']);
  answer = { data: null, error: null };
  assert.deepEqual(await data.grantBadge('u-2', 'vip', true), []);
  // refusals keep the database's code
  answer = { data: null, error: { code: 'P0001', message: 'not_allowed', details: 'badge' } };
  await assert.rejects(data.grantBadge('u-2', 'vip', true), (e) => e.code === 'not_allowed' && e.detail === 'badge');
  answer = { data: null, error: { code: 'P0001', message: 'slow_down', details: null } };
  await assert.rejects(data.grantBadge('u-2', 'vip', true), (e) => e.code === 'slow_down');
  // a badge outside the list never reaches the network
  const before = calls.length;
  for (const bad of ['early', 'admin', 'VIP', '', null, undefined]) {
    await assert.rejects(data.grantBadge('u-2', bad, true), (e) => e.code === 'not_allowed' && e.detail === 'badge', String(bad));
  }
  assert.equal(calls.length, before);
  // no session: refused before the network
  data._inject({ client: { rpc: async (fn, args) => { calls.push([fn, args]); return answer; } }, me: () => null });
  await assert.rejects(data.grantBadge('u-2', 'vip', true), (e) => e.code === 'not_allowed');
  assert.equal(calls.length, before);
});
