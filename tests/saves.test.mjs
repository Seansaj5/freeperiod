import test from 'node:test';
import assert from 'node:assert/strict';
import { hashString } from '../fp/sync.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const res = body => ({ ok: true, status: 200, json: async () => body });
const game = { id: 'close-call', saveKey: 'cc.v1' };
let n = 0;
async function setup(fetch) {
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search: '' };
  globalThis.fetch = fetch;
  localStorage.setItem('fp.token', 'tok');
  localStorage.setItem('fp.user', JSON.stringify({ username: 'Tester', role: 'player' }));
  return import('../fp/saves.js?n=' + (++n));
}

test('first sync pulls cloud over fresh local and backs up local', async () => {
  const s = await setup(async () => res({ ok: true, save: { data: 'CLOUD', at: 7 } }));
  localStorage.setItem('cc.v1', 'FRESH');
  assert.equal(await s.syncGame(game), 'pull');
  assert.equal(localStorage.getItem('cc.v1'), 'CLOUD');
  assert.equal(localStorage.getItem('fp.backup.close-call'), 'FRESH');
  assert.deepEqual(JSON.parse(localStorage.getItem('fp.sync.close-call')), { hash: hashString('CLOUD'), at: 7, user: 'tester' });
});

test('pull is skipped when local changed during the GET', async () => {
  const s = await setup(async () => {
    localStorage.setItem('cc.v1', 'NEWER'); // player progressed while request was in flight
    return res({ ok: true, save: { data: 'CLOUD', at: 9 } });
  });
  localStorage.setItem('cc.v1', 'OLD');
  localStorage.setItem('fp.sync.close-call', JSON.stringify({ hash: hashString('OLD'), at: 1, user: 'tester' }));
  assert.equal(await s.syncGame(game), 'none');
  assert.equal(localStorage.getItem('cc.v1'), 'NEWER');
});

test('concurrent syncGame calls run one sync', async () => {
  let gets = 0;
  const s = await setup(async () => { gets++; return res({ ok: true, save: null }); });
  await Promise.all([s.syncGame(game), s.syncGame(game), s.syncGame(game)]);
  assert.equal(gets, 1);
});

test('pagehide POSTs directly with keepalive, no GET first', async () => {
  const calls = [];
  const s = await setup(async (url, opts) => { calls.push([url, opts]); return res({ ok: true, at: 42 }); });
  const handlers = {};
  globalThis.addEventListener = (t, f) => { handlers[t] = f; };
  globalThis.removeEventListener = () => {};
  localStorage.setItem('cc.v1', 'DATA');
  localStorage.setItem('fp.sync.close-call', JSON.stringify({ hash: hashString('OLDER'), at: 1, user: 'tester' }));
  s.watch(game);
  handlers.pagehide();
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /\/api\/fp\/save$/);
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].keepalive, true);
  assert.equal(JSON.parse(calls[0][1].body).data, 'DATA');
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(JSON.parse(localStorage.getItem('fp.sync.close-call')), { hash: hashString('DATA'), at: 42, user: 'tester' });
  delete globalThis.addEventListener; delete globalThis.removeEventListener;
});

test('pullBy: a pull whose GET answers after the deadline writes nothing', async () => {
  const s = await setup(async () => {
    await new Promise(r => setTimeout(r, 60));
    return res({ ok: true, save: { data: 'CLOUD', at: 7 } });
  });
  localStorage.setItem('cc.v1', 'FRESH');
  assert.equal(await s.syncGame(game, { pullBy: Date.now() + 10 }), 'none');
  assert.equal(localStorage.getItem('cc.v1'), 'FRESH');
  assert.equal(localStorage.getItem('fp.sync.close-call'), null);
  assert.equal(localStorage.getItem('fp.backup.close-call'), null);
});

test('pullBy: a pull answering before the deadline still pulls', async () => {
  const s = await setup(async () => res({ ok: true, save: { data: 'CLOUD', at: 7 } }));
  localStorage.setItem('cc.v1', 'FRESH');
  assert.equal(await s.syncGame(game, { pullBy: Date.now() + 5000 }), 'pull');
  assert.equal(localStorage.getItem('cc.v1'), 'CLOUD');
});

test('saves over 4096 bytes are never sent (bytes, not characters), on sync or pagehide', async () => {
  const calls = [];
  const s = await setup(async (url, opts) => { calls.push([url, opts]); return res({ ok: true, save: null, at: 5 }); });
  const big = 'é'.repeat(2049); // 2049 characters, 4098 bytes
  localStorage.setItem('cc.v1', big);
  assert.equal(await s.syncGame(game), 'none');
  const handlers = {};
  globalThis.addEventListener = (t, f) => { handlers[t] = f; };
  globalThis.removeEventListener = () => {};
  localStorage.setItem('fp.sync.close-call', JSON.stringify({ hash: hashString('OLDER'), at: 1, user: 'tester' }));
  s.watch(game);
  handlers.pagehide();
  delete globalThis.addEventListener; delete globalThis.removeEventListener;
  assert.equal(calls.filter(([, o]) => o && o.method === 'POST').length, 0);
  localStorage.removeItem('fp.sync.close-call');
  localStorage.setItem('cc.v1', 'é'.repeat(2048)); // exactly 4096 bytes
  assert.equal(await s.syncGame(game), 'push');
});
