// Meta uploads (I1: few writes) and what they carry (I2: favsAt for the server's merge).
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const res = (body) => ({ ok: true, status: 200, json: async () => body });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

let n = 0;
async function setup(t, reply) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search: '', hostname: 'seansaj5.github.io' };
  localStorage.setItem('fp.token', 'tok');
  localStorage.setItem('fp.user', JSON.stringify({ username: 'Tester', role: 'player' }));
  const posts = [];
  globalThis.fetch = async (url, opts) => {
    if (opts && opts.method === 'POST') posts.push({ url, body: JSON.parse(opts.body), keepalive: !!opts.keepalive });
    return res({ ok: true, meta: reply ? reply(posts.at(-1)) : undefined });
  };
  const meta = await import('../fp/meta.js?n=' + (++n));
  return { meta, posts };
}

test('play time: at most one upload every 3 minutes while playing, the rest on pagehide (keepalive)', async (t) => {
  const { meta, posts } = await setup(t);
  for (let i = 0; i < 24; i++) { // 6 minutes, a tick every 15 s as the play page does
    t.mock.timers.tick(15000);
    meta.addPlay('close-call', 15);
    await flush();
  }
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(posts.length, 1, 'one upload in 6 minutes of play');
  assert.ok(posts[0].body.play['close-call'] >= 180);
  assert.equal(meta.getMeta().play['close-call'], 360, 'counted locally all along');
  await meta.flush({ keepalive: true });
  assert.equal(posts.length, 2);
  assert.equal(posts[1].keepalive, true);
  assert.equal(posts[1].body.play['close-call'], 360);
  await meta.flush({ keepalive: true });
  assert.equal(posts.length, 2, 'nothing new: no second pagehide upload');
});

test('favorite toggles and recents still upload after 3 s, carrying favsAt = time of the last toggle', async (t) => {
  const { meta, posts } = await setup(t);
  meta.toggleFav('horror-exe');
  const at = meta.getMeta().at;
  t.mock.timers.tick(2999);
  await flush();
  assert.equal(posts.length, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.favs, ['horror-exe']);
  assert.equal(posts[0].body.favsAt, at);
  t.mock.timers.tick(60000);
  meta.touchRecent('close-call');
  t.mock.timers.tick(3000);
  await flush();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body.favsAt, at, 'a recent is not a favorites change');
});

test('the merged meta the server answers is merged into local (a newer toggle elsewhere wins)', async (t) => {
  const { meta } = await setup(t, () => ({ favs: ['bing-ball'], recent: { 'bing-ball': 5 }, play: { 'bing-ball': 900 }, at: Date.now() + 1000 }));
  meta.toggleFav('horror-exe');
  t.mock.timers.tick(3000);
  await flush();
  const m = meta.getMeta();
  assert.deepEqual(m.favs, ['bing-ball']);
  assert.equal(m.play['bing-ball'], 900);
});
