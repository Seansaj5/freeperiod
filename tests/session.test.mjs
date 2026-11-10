import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage(throws = false) {
  const m = new Map();
  const t = () => { if (throws) throw new Error('denied'); };
  return {
    getItem: k => { t(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { t(); m.set(k, String(v)); },
    removeItem: k => { t(); m.delete(k); },
    _m: m,
  };
}
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
let n = 0;
async function setup({ fetch, throws = false, token } = {}) {
  globalThis.localStorage = fakeStorage(throws);
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search: '' };
  globalThis.fetch = fetch || (async () => json(200, { ok: true }));
  if (token) globalThis.localStorage.setItem('fp.token', token);
  return import('../fp/session.js?n=' + (++n));
}

test('401 clears session', async () => {
  const s = await setup({ token: 'tok', fetch: async () => json(401, { ok: false, error: 'bad' }) });
  await s.resume();
  assert.equal(s.getUser(), null);
  assert.equal(globalThis.localStorage.getItem('fp.token'), null);
});

test('network error keeps token', async () => {
  const s = await setup({ token: 'tok', fetch: async () => { throw new TypeError('offline'); } });
  await s.resume();
  assert.equal(globalThis.localStorage.getItem('fp.token'), 'tok');
  assert.equal(s.getToken(), 'tok');
});

test('resume with good token sets user', async () => {
  const s = await setup({ token: 'tok', fetch: async () => json(200, { ok: true, user: { username: 'sean', role: 'x' } }) });
  await s.resume();
  assert.equal(s.getUser().username, 'sean');
});

test('login stores token and notifies', async () => {
  const s = await setup({ fetch: async () => json(200, { ok: true, token: 't2', user: { username: 'a', role: 'p' } }) });
  let calls = 0; s.onChange(() => calls++);
  await s.login('a', 'pw');
  assert.equal(globalThis.localStorage.getItem('fp.token'), 't2');
  assert.equal(calls, 1);
});

test('storage throws: no exception, user null', async () => {
  const s = await setup({ throws: true });
  assert.equal(s.getUser(), null);
  await s.resume();
  assert.equal(s.getToken(), null);
});

test('adopt same token is a no-op', async () => {
  const s = await setup({ token: 'tok' });
  const user = { username: 'a', role: 'p' };
  s.adopt('tok', user);
  let calls = 0; s.onChange(() => calls++);
  s.adopt('tok', { ...user });
  assert.equal(calls, 0);
  s.adopt('other', user);
  assert.equal(calls, 1);
});

test('cached user shows immediately while resume is pending', async () => {
  const s = await setup({ token: 'tok', fetch: () => new Promise(() => {}) });
  globalThis.localStorage.setItem('fp.user', JSON.stringify({ username: 'sean', role: 'p' }));
  assert.deepEqual(s.getUser(), { username: 'sean', role: 'p' });
  s.resume(); // never resolves
  assert.equal(s.getUser().username, 'sean');
});

test('401 and logout clear cached user too', async () => {
  const s = await setup({ token: 'tok', fetch: async () => json(401, { ok: false }) });
  globalThis.localStorage.setItem('fp.user', JSON.stringify({ username: 'sean', role: 'p' }));
  await s.resume();
  assert.equal(s.getUser(), null);
  assert.equal(globalThis.localStorage.getItem('fp.user'), null);
});

test('M1a: a resume answer for a token that is no longer ours changes nothing', async () => {
  for (const answer of [json(401, { ok: false }), json(200, { ok: true, user: { username: 'old', role: 'p' } })]) {
    let release;
    const s = await setup({
      token: 'tok',
      fetch: async (url) => (url.endsWith('/api/me') ? new Promise(r => { release = () => r(answer); })
        : json(200, { ok: true, token: 't2', user: { username: 'new', role: 'p' } })),
    });
    const p = s.resume();
    await s.login('new', 'pw');
    release();
    await p;
    assert.equal(s.getToken(), 't2', 'login kept (' + answer.status + ')');
    assert.equal(s.getUser().username, 'new');
    // and a logout while it was out stays a logout
    const s2 = await setup({ token: 'tok', fetch: async (url) => (url.endsWith('/api/me') ? new Promise(r => { release = () => r(answer); }) : json(200, { ok: true })) });
    const p2 = s2.resume();
    await s2.logout();
    release();
    await p2;
    assert.equal(s2.getToken(), null);
    assert.equal(s2.getUser(), null, 'still logged out (' + answer.status + ')');
  }
});

test('M1b: storage blocked: a login or an adopted frame login lasts for the page, and calls carry it', async () => {
  const seen = [];
  const s = await setup({ throws: true, fetch: async (url, o) => { seen.push(o.headers.Authorization || null); return json(200, { ok: true, token: 't2', user: { username: 'a', role: 'p' } }); } });
  await s.login('a', 'pw');
  assert.equal(s.getToken(), 't2');
  assert.equal(s.getUser().username, 'a');
  await s.resume();
  assert.equal(seen.at(-1), 'Bearer t2');
  s.adopt('t3', { username: 'b', role: 'p' });
  assert.equal(s.getToken(), 't3');
  await s.logout();
  assert.equal(s.getToken(), null);
  assert.equal(s.getUser(), null);
});
