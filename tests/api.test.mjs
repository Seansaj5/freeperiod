import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const PROD = 'https://bing-ball.onrender.com';
let n = 0;
async function load({ hostname, search = '', stored } = {}) {
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  if (stored != null) globalThis.sessionStorage.setItem('fp.api', stored);
  globalThis.location = { hostname, search };
  return import('../fp/api.js?n=' + (++n));
}

test('?api= is ignored on the real site and a stored override is dropped', async () => {
  const a = await load({ hostname: 'seansaj5.github.io', search: '?api=https://evil.example' });
  assert.equal(a.apiBase(), PROD);
  assert.equal(sessionStorage.getItem('fp.api'), null);
  const b = await load({ hostname: 'seansaj5.github.io', search: '?api=http://localhost:3100' });
  assert.equal(b.apiBase(), PROD);
  const c = await load({ hostname: 'seansaj5.github.io', stored: 'https://evil.example' });
  assert.equal(c.apiBase(), PROD);
  assert.equal(sessionStorage.getItem('fp.api'), null);
});

test('on localhost, only a local http API is honored', async () => {
  const a = await load({ hostname: 'localhost', search: '?api=http://localhost:3100/' });
  assert.equal(a.apiBase(), 'http://localhost:3100');
  assert.equal(sessionStorage.getItem('fp.api'), 'http://localhost:3100');
  const b = await load({ hostname: '127.0.0.1', search: '?api=http://127.0.0.1:3100' });
  assert.equal(b.apiBase(), 'http://127.0.0.1:3100');
  const c = await load({ hostname: 'localhost', stored: 'http://localhost:3100' });
  assert.equal(c.apiBase(), 'http://localhost:3100');
  for (const bad of ['https://evil.example', 'http://localhost.evil.example', 'http://localhost:3100@evil.example', 'http://evil.example/?x=http://localhost', 'javascript:alert(1)']) {
    const d = await load({ hostname: 'localhost', search: '?api=' + encodeURIComponent(bad), stored: 'http://localhost:3100' });
    assert.equal(d.apiBase(), PROD, bad);
    assert.equal(sessionStorage.getItem('fp.api'), null, bad);
  }
  const e = await load({ hostname: 'localhost', stored: 'https://evil.example' });
  assert.equal(e.apiBase(), PROD);
  assert.equal(sessionStorage.getItem('fp.api'), null);
});

test('login posts to production on the real site even with ?api=', async () => {
  const a = await load({ hostname: 'seansaj5.github.io', search: '?api=https://evil.example' });
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  await a.call('/api/login', { body: { username: 'a', password: 'b' } });
  assert.deepEqual(urls, [PROD + '/api/login']);
});
