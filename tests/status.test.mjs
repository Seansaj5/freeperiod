import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const text = (status) => ({ ok: status < 400, status, json: async () => { throw new SyntaxError('not json'); } });
const flush = () => new Promise(r => setImmediate(r));

const BB = {
  id: 'bing-ball', apiGame: true, url: 'https://bing-ball.onrender.com',
  status: { health: 'https://bing-ball.onrender.com/health', version: 'https://bing-ball.onrender.com/api/status' },
};
const CC = { id: 'close-call', status: { health: 'https://cc.example/health' } };

let n = 0;
async function load({ fetch, search = '', hidden = false } = {}) {
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search };
  const listeners = {};
  globalThis.document = {
    visibilityState: hidden ? 'hidden' : 'visible',
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: (t) => { delete listeners[t]; },
    _fire: (t) => listeners[t] && listeners[t](),
  };
  globalThis.fetch = fetch;
  return import('../fp/status.js?n=' + (++n));
}

test('no answer for 6 s -> waking', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const s = await load({ fetch: () => new Promise(() => {}) });
  const seen = [];
  const stop = s.watchStatus(BB, st => seen.push(st));
  await flush();
  t.mock.timers.tick(5999);
  await flush();
  assert.equal(seen.length, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(seen, [{ state: 'waking' }]);
  stop();
});

test('health + status -> online with players and version', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const s = await load({
    fetch: async url => (url.endsWith('/health') ? json(200, { ok: true, rooms: 1, players: 3 }) : json(200, { ok: true, version: '5.1.1', build: 62 })),
  });
  const seen = [];
  const stop = s.watchStatus(BB, st => seen.push(st));
  await flush();
  assert.deepEqual(seen.at(-1), { state: 'online', players: 3, version: '5.1.1 b62' });
  t.mock.timers.tick(10000);
  await flush();
  assert.ok(!seen.some(x => x.state === 'waking'), 'a quick answer never shows waking');
  stop();
});

test('health without CORS (fails) but status answers -> online, no player count', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const s = await load({
    fetch: async url => { if (url.endsWith('/health')) throw new TypeError('cors'); return json(200, { version: '5.1.1', build: 63 }); },
  });
  const seen = [];
  const stop = s.watchStatus(BB, st => seen.push(st));
  await flush();
  assert.deepEqual(seen.at(-1), { state: 'online', version: '5.1.1 b63' });
  stop();
});

test('a health URL that fails while the server answers (no CORS) is not asked again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const asked = [];
  const s = await load({
    fetch: async url => { asked.push(url); if (url.endsWith('/health')) throw new TypeError('cors'); return json(200, { version: '5.1.1', build: 63 }); },
  });
  const stop = s.watchStatus(BB, () => {});
  await flush();
  t.mock.timers.tick(45000);
  await flush();
  assert.deepEqual(asked.map(u => u.split('/').pop()), ['health', 'status', 'status']);
  stop();
});

test('plain-text health (Close Call "ok") -> online', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const s = await load({ fetch: async () => text(200) });
  const seen = [];
  const stop = s.watchStatus(CC, st => seen.push(st));
  await flush();
  assert.deepEqual(seen.at(-1), { state: 'online' });
  stop();
});

test('server missing (404 / network error) -> offline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const s = await load({ fetch: async () => text(404) });
  const seen = [];
  const stop = s.watchStatus(CC, st => seen.push(st));
  await flush();
  assert.deepEqual(seen.at(-1), { state: 'offline' });
  stop();
});

test('polls every 45 s while visible, waits while hidden, stop() ends it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  let calls = 0;
  const s = await load({ fetch: async () => { calls++; return text(200); } });
  const stop = s.watchStatus(CC, () => {});
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(45000);
  await flush();
  assert.equal(calls, 2);
  globalThis.document.visibilityState = 'hidden';
  t.mock.timers.tick(45000 * 3);
  await flush();
  assert.equal(calls, 2, 'no polling while the tab is hidden');
  globalThis.document.visibilityState = 'visible';
  globalThis.document._fire('visibilitychange');
  await flush();
  assert.equal(calls, 3, 'polls again as soon as the tab is visible');
  stop();
  t.mock.timers.tick(45000 * 3);
  await flush();
  assert.equal(calls, 3);
});

test('apiGame follows the ?api= override (url and status URLs)', async () => {
  const s = await load({ fetch: async () => text(200), search: '?api=http://localhost:3100/' });
  const g = s.resolveGame(BB);
  assert.equal(g.url, 'http://localhost:3100');
  assert.deepEqual(g.status, { health: 'http://localhost:3100/health', version: 'http://localhost:3100/api/status' });
  assert.equal(s.resolveGame(CC), CC, 'other games are untouched');
  const live = await load({ fetch: async () => text(200) });
  assert.equal(live.resolveGame(BB).url, 'https://bing-ball.onrender.com');
});
