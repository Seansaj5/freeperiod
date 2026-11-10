// Account switch on one shared device (C2): A's save and meta never reach B's account, B's cloud is never overwritten.
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
const res = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// A tiny in-memory Bing Ball: accounts, saves, meta.
function fakeServer() {
  const st = { users: {}, tokens: {}, posts: [], metaPosts: [] };
  let clock = 1000;
  st.user = (name) => (st.users[name] = st.users[name] || { saves: {}, meta: null });
  st.fetch = async (url, opt = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const who = st.tokens[String((opt.headers && opt.headers.Authorization) || '').replace('Bearer ', '')];
    const body = opt.body ? JSON.parse(opt.body) : null;
    if (path === '/api/login' || path === '/api/register') {
      const u = body.username.toLowerCase();
      st.user(u);
      const t = 'tok-' + u + '-' + (++clock);
      st.tokens[t] = u;
      return res({ ok: true, token: t, user: { username: body.username, role: 'player' } });
    }
    if (path === '/api/logout') return res({ ok: true });
    if (!who) return res({ ok: false, error: 'no' }, 401);
    if (path.startsWith('/api/fp/save?')) return res({ ok: true, save: st.user(who).saves[new URL('http://x' + path).searchParams.get('game')] || null });
    if (path === '/api/fp/save') {
      st.posts.push({ who, game: body.game, data: body.data });
      const at = ++clock;
      st.user(who).saves[body.game] = { data: body.data, at };
      return res({ ok: true, at });
    }
    if (path === '/api/fp') return res({ ok: true, meta: st.user(who).meta || { favs: [], recent: {}, play: {}, at: 0 }, saves: {} });
    if (path === '/api/fp/meta') {
      st.metaPosts.push({ who, ...body });
      const cur = st.user(who).meta || { favs: [], recent: {}, play: {}, at: 0 };
      const max = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = Math.max(o[k] || 0, b[k]); return o; };
      const newer = typeof body.favsAt === 'number' && body.favsAt > cur.at;
      st.user(who).meta = { favs: newer ? body.favs : cur.favs, recent: max(cur.recent, body.recent), play: max(cur.play, body.play), at: newer ? body.favsAt : cur.at };
      return res({ ok: true, meta: st.user(who).meta });
    }
    return res({ ok: true });
  };
  return st;
}

let session, saves, meta, sync;
async function setup() {
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search: '', hostname: 'seansaj5.github.io' };
  const srv = fakeServer();
  globalThis.fetch = srv.fetch;
  session = session || await import('../fp/session.js');
  saves = saves || await import('../fp/saves.js');
  meta = meta || await import('../fp/meta.js');
  sync = sync || await import('../fp/sync.js');
  await session.logout(); // module state from an earlier test
  localStorage._m.clear();
  return srv;
}
const game = { id: 'close-call', saveKey: 'closecall.v1' };
const local = () => localStorage.getItem('closecall.v1');

test('A syncs and logs out; B (older cloud) logs in: B gets B\'s cloud, A\'s save is backed up, B\'s cloud never overwritten', async () => {
  const srv = await setup();
  srv.user('bee').saves['close-call'] = { data: 'B-from-home', at: 500 };
  await session.login('Ann', 'pw');
  localStorage.setItem('closecall.v1', 'A-progress');
  assert.equal(await saves.syncGame(game), 'push');
  await session.logout();
  await session.login('Bee', 'pw');
  assert.equal(await saves.syncGame(game), 'pull');
  assert.equal(local(), 'B-from-home');
  assert.equal(localStorage.getItem('fp.backup.close-call'), 'A-progress');
  assert.equal(JSON.parse(localStorage.getItem('fp.sync.close-call')).user, 'bee');
  // B plays a run: B's own progress goes up, built on B's save
  localStorage.setItem('closecall.v1', 'B-from-home + a run');
  assert.equal(await saves.syncGame(game), 'push');
  assert.ok(srv.posts.filter(p => p.who === 'bee').every(p => !p.data.includes('A-progress')), JSON.stringify(srv.posts));
  assert.equal(srv.users.bee.saves['close-call'].data, 'B-from-home + a run');
  assert.equal(srv.users.ann.saves['close-call'].data, 'A-progress');
});

test('B with no cloud save: the local save is backed up and cleared, nothing pushed; B\'s own later save goes up', async () => {
  const srv = await setup();
  await session.login('Ann', 'pw');
  localStorage.setItem('closecall.v1', 'A-progress');
  await saves.syncGame(game);
  await session.logout();
  await session.login('Bee', 'pw');
  assert.equal(await saves.syncGame(game), 'clear');
  assert.equal(local(), null);
  assert.equal(localStorage.getItem('fp.backup.close-call'), 'A-progress');
  assert.equal(srv.posts.filter(p => p.who === 'bee').length, 0);
  assert.equal(await saves.syncGame(game), 'none');
  localStorage.setItem('closecall.v1', 'B-fresh');
  assert.equal(await saves.syncGame(game), 'push');
  assert.equal(srv.users.bee.saves['close-call'].data, 'B-fresh');
});

test('a record written before records named their account counts as foreign', async () => {
  const srv = await setup();
  srv.user('bee').saves['close-call'] = { data: 'B-cloud', at: 5 };
  localStorage.setItem('closecall.v1', 'OLD');
  localStorage.setItem('fp.sync.close-call', JSON.stringify({ hash: sync.hashString('OLD'), at: 9 }));
  await session.login('Bee', 'pw');
  assert.equal(await saves.syncGame(game), 'pull');
  assert.equal(local(), 'B-cloud');
  assert.equal(srv.posts.length, 0);
});

test('guest progress, then sign up: the progress goes up to the new account', async () => {
  const srv = await setup();
  localStorage.setItem('closecall.v1', 'guest-run');
  await session.register('Newbie', 'pw');
  assert.equal(await saves.syncGame(game), 'push');
  assert.equal(srv.users.newbie.saves['close-call'].data, 'guest-run');
});

test('pagehide never pushes another account\'s save, nor one with no record for this account', async () => {
  const srv = await setup();
  const handlers = {};
  globalThis.addEventListener = (t, f) => { handlers[t] = f; };
  globalThis.removeEventListener = () => {};
  try {
    await session.login('Bee', 'pw');
    localStorage.setItem('closecall.v1', 'A-progress');
    localStorage.setItem('fp.sync.close-call', JSON.stringify({ hash: 'x', at: 1, user: 'ann' }));
    const stop = saves.watch(game);
    handlers.pagehide();
    localStorage.removeItem('fp.sync.close-call');
    handlers.pagehide();
    await new Promise(r => setTimeout(r, 10));
    assert.equal(srv.posts.length, 0);
    stop();
  } finally { delete globalThis.addEventListener; delete globalThis.removeEventListener; }
});

test('meta: logout clears it; A\'s meta is never merged into B\'s', async () => {
  const srv = await setup();
  srv.user('bee').meta = { favs: ['bing-ball'], recent: { 'bing-ball': 10 }, play: { 'bing-ball': 60 }, at: 5 };
  await session.login('Ann', 'pw');
  meta.toggleFav('close-call');
  meta.addPlay('close-call', 900);
  assert.equal(JSON.parse(localStorage.getItem('fp.meta')).user, 'ann');
  await session.logout();
  assert.equal(localStorage.getItem('fp.meta'), null);
  // a meta left behind by A (e.g. A's session expired instead of a logout)
  localStorage.setItem('fp.meta', JSON.stringify({ favs: ['close-call'], recent: { 'close-call': 99 }, play: { 'close-call': 900 }, at: Date.now(), user: 'ann' }));
  await session.login('Bee', 'pw');
  assert.deepEqual(meta.getMeta().favs, [], 'B does not see A\'s favorites');
  const m = await meta.pullMerge();
  assert.deepEqual(m.favs, ['bing-ball']);
  assert.deepEqual(m.play, { 'bing-ball': 60 });
  assert.deepEqual(m.recent, { 'bing-ball': 10 });
  assert.equal(JSON.parse(localStorage.getItem('fp.meta')).user, 'bee');
  for (const p of srv.metaPosts.filter(p => p.who === 'bee')) {
    assert.ok(!p.favs.includes('close-call') && !('close-call' in p.play) && !('close-call' in p.recent), JSON.stringify(p));
  }
  assert.deepEqual(srv.users.bee.meta.favs, ['bing-ball']);
});

test('meta: a guest\'s favorites still merge into the account on sign-in', async () => {
  await setup();
  meta.toggleFav('horror-exe');
  assert.equal(JSON.parse(localStorage.getItem('fp.meta')).user, undefined);
  await session.register('Newbie', 'pw');
  const m = await meta.pullMerge();
  assert.deepEqual(m.favs, ['horror-exe']);
});
