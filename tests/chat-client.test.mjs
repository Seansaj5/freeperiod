// Chat client + session bridge: fakes for the hub session, the Bing Ball route (fetch) and supabase auth.
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const emailOf = u => u.toLowerCase() + '@users.freeperiod.example';

let n = 0;
async function setup(t, { signedIn = 'Saj', config = { url: 'http://127.0.0.1:54321', key: 'anon' }, session = null, route = () => res(200, { ok: true, tokenHash: 'th1' }), otp = null, verifyAs = null } = {}) {
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search: '', hostname: 'localhost' };
  if (signedIn) {
    localStorage.setItem('fp.token', 'tok');
    localStorage.setItem('fp.user', JSON.stringify({ username: signedIn, role: 'player' }));
  }
  const log = { fetches: [], timeouts: [], signOuts: 0, otps: [], gets: 0 };
  const realSet = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...a) => { log.timeouts.push(ms); return realSet(fn, ms, ...a); });
  globalThis.fetch = async (url, opts) => { log.fetches.push({ url, opts }); return route(url, opts); };
  const state = { session };
  const auth = {
    getSession: async () => { log.gets++; return { data: { session: state.session }, error: null }; },
    signOut: async () => { log.signOuts++; state.session = null; return { error: null }; },
    verifyOtp: async (p) => {
      log.otps.push(p);
      if (otp) return otp(p);
      const username = verifyAs ? verifyAs(p) : 'Saj';
      state.session = { user: { id: 'u-1', email: emailOf(username), app_metadata: { username } } };
      return { data: { session: state.session, user: state.session.user }, error: null };
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  };
  const created = [];
  const chat = await import('../fp/chat/client.js?n=' + (++n));
  chat._inject({ config, createClient: (url, key, opts) => { created.push({ url, key, opts }); return { auth }; } });
  const sess = await import('../fp/session.js');
  return { chat, log, state, created, sess };
}

test('chatEmail follows the server rule', async (t) => {
  const { chat } = await setup(t, { signedIn: null });
  assert.equal(chat.chatEmail('SeanSaj_0'), 'seansaj_0@users.freeperiod.example');
});

test('empty config -> off, no client, no network', async (t) => {
  const { chat, log } = await setup(t, { config: { url: '', key: '' } });
  assert.equal(chat.chatState(), 'off');
  assert.equal(chat.getChat(), null);
  assert.equal(await chat.ensureChatSession(), 'off');
  assert.equal(log.fetches.length, 0);
  assert.equal(chat.me(), null);
});

test('guest -> guest, no network', async (t) => {
  const { chat, log } = await setup(t, { signedIn: null });
  assert.equal(chat.chatState(), 'guest');
  assert.equal(await chat.ensureChatSession(), 'guest');
  assert.equal(log.fetches.length, 0);
  assert.notEqual(chat.getChat(), null);
});

test('signed in, no supabase session: POST /api/chat/session (75000), waking, then verifyOtp -> ready', async (t) => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { chat, log } = await setup(t, { route: async () => { await gate; return res(200, { ok: true, tokenHash: 'th1' }); } });
  const seen = [];
  chat.onChatState(s => seen.push(s));
  const p = chat.ensureChatSession();
  await flush();
  assert.equal(chat.chatState(), 'waking');
  assert.equal(log.fetches.length, 1);
  assert.match(log.fetches[0].url, /\/api\/chat\/session$/);
  assert.equal(log.fetches[0].opts.method, 'POST');
  assert.equal(log.fetches[0].opts.headers.Authorization, 'Bearer tok');
  assert.ok(log.timeouts.includes(75000));
  release();
  assert.equal(await p, 'ready');
  assert.deepEqual(log.otps, [{ token_hash: 'th1', type: 'email' }]);
  assert.equal(chat.chatState(), 'ready');
  assert.deepEqual(chat.me(), { id: 'u-1', username: 'Saj' });
  assert.ok(seen.includes('waking') && seen.at(-1) === 'ready');
});

test('existing supabase session for the same email -> ready without network', async (t) => {
  const session = { user: { id: 'u-1', email: emailOf('Saj'), app_metadata: { username: 'Saj' } } };
  const { chat, log } = await setup(t, { session });
  assert.equal(await chat.ensureChatSession(), 'ready');
  assert.equal(log.fetches.length, 0);
  assert.equal(chat.me().id, 'u-1');
});

test('a supabase session for another email is signed out first', async (t) => {
  const session = { user: { id: 'u-9', email: emailOf('Other'), app_metadata: { username: 'Other' } } };
  const { chat, log } = await setup(t, { session });
  assert.equal(await chat.ensureChatSession(), 'ready');
  assert.equal(log.signOuts, 1);
  assert.equal(log.fetches.length, 1);
});

test('hub logout -> signOut + guest', async (t) => {
  const { chat, log, sess } = await setup(t);
  await chat.ensureChatSession();
  assert.equal(chat.chatState(), 'ready');
  await sess.logout();
  await flush();
  assert.ok(log.signOuts >= 1);
  assert.equal(chat.chatState(), 'guest');
  assert.equal(chat.me(), null);
});

test('route 503 -> off', async (t) => {
  const { chat } = await setup(t, { route: () => res(503, { ok: false, error: 'chat not set up' }) });
  assert.equal(await chat.ensureChatSession(), 'off');
  assert.equal(chat.chatState(), 'off');
});

test('project paused (540 / 503 from supabase) -> asleep', async (t) => {
  for (const status of [540, 503]) {
    const { chat } = await setup(t, { otp: async () => ({ data: {}, error: Object.assign(new Error('project paused'), { status }) }) });
    assert.equal(await chat.ensureChatSession(), 'asleep');
    assert.equal(chat.chatState(), 'asleep');
  }
});

test('other failures -> error (never throws)', async (t) => {
  const a = await setup(t, { route: () => res(500, { ok: false, error: 'boom' }) });
  assert.equal(await a.chat.ensureChatSession(), 'error');
  const b = await setup(t, { route: () => { throw new Error('offline'); } });
  assert.equal(await b.chat.ensureChatSession(), 'error');
});

test('two quick ensureChatSession calls share one request', async (t) => {
  const { chat, log } = await setup(t);
  const [a, b] = await Promise.all([chat.ensureChatSession(), chat.ensureChatSession()]);
  assert.equal(a, 'ready'); assert.equal(b, 'ready');
  assert.equal(log.fetches.length, 1);
  assert.equal(log.otps.length, 1);
});

test('createClient gets the configured url/key and persists the session', async (t) => {
  const { chat, created } = await setup(t, { signedIn: null });
  chat.getChat(); chat.getChat();
  assert.equal(created.length, 1);
  assert.equal(created[0].url, 'http://127.0.0.1:54321');
  assert.equal(created[0].opts.auth.persistSession, true);
  assert.equal(created[0].opts.auth.autoRefreshToken, true);
});

// ---- fix round 1: stale runs, switches, retries, probe ----
const routeFor = (gate) => async (url) => {
  if (/\/api\/chat\/session$/.test(url)) {
    const u = JSON.parse(localStorage.getItem('fp.user')).username;
    const first = gate && !gate.used; if (gate) gate.used = true;
    if (first) await gate.p;
    return res(200, { ok: true, tokenHash: 'th-' + u });
  }
  return res(200, { ok: true });
};
const gateOf = () => { const g = { used: false }; g.p = new Promise(r => { g.release = r; }); return g; };
const asUser = (p) => p.token_hash.slice(3);

test('logout during waking: the old run cannot sign chat back in', async (t) => {
  const gate = gateOf();
  const { chat, log, state, sess } = await setup(t, { route: routeFor(gate), verifyAs: asUser });
  const p = chat.ensureChatSession();
  await flush();
  assert.equal(chat.chatState(), 'waking');
  await sess.logout();
  await flush();
  assert.equal(chat.chatState(), 'guest');
  gate.release();
  await p; await flush();
  assert.equal(chat.chatState(), 'guest');
  assert.equal(chat.me(), null);
  assert.equal(state.session, null);
});

test('switch A -> B during waking ends as B, never A', async (t) => {
  const gate = gateOf();
  const { chat, state, sess } = await setup(t, { route: routeFor(gate), verifyAs: asUser });
  const p = chat.ensureChatSession();
  await flush();
  sess.adopt('tokB', { username: 'Bob', role: 'player' });
  await flush();
  gate.release();
  await p; await flush();
  assert.equal(chat.chatState(), 'ready');
  assert.equal(chat.me().username, 'Bob');
  assert.equal(state.session.user.email, emailOf('Bob'));
});

test('error, then a new login retries', async (t) => {
  let fail = true;
  const { chat, sess } = await setup(t, { route: (url) => (fail && /chat\/session/.test(url) ? res(500, { ok: false }) : res(200, { ok: true, tokenHash: 'th-Bob' })), verifyAs: asUser });
  assert.equal(await chat.ensureChatSession(), 'error');
  fail = false;
  sess.adopt('tokB', { username: 'Bob', role: 'player' });
  await flush();
  assert.equal(chat.chatState(), 'ready');
});

test('asleep, then a new login retries', async (t) => {
  let asleep = true;
  const { chat, sess } = await setup(t, { verifyAs: asUser, route: (url) => res(200, { ok: true, tokenHash: 'th-' + JSON.parse(localStorage.getItem('fp.user')).username }),
    otp: async (p) => (asleep ? { data: {}, error: Object.assign(new Error('paused'), { status: 540 }) } : { data: { session: { user: { id: 'b', email: emailOf('Bob'), app_metadata: { username: 'Bob' } } } }, error: null }) });
  assert.equal(await chat.ensureChatSession(), 'asleep');
  asleep = false;
  sess.adopt('tokB', { username: 'Bob', role: 'player' });
  await flush();
  assert.equal(chat.chatState(), 'ready');
});

test('verifyOtp session for the wrong email is signed out', async (t) => {
  const { chat, log } = await setup(t, { verifyAs: () => 'Mallory' });
  assert.notEqual(await chat.ensureChatSession(), 'ready');
  assert.ok(log.signOuts >= 1);
  assert.equal(chat.me(), null);
});

test('network-level failure: probes /auth/v1/health once, stays error with readable text', async (t) => {
  const { chat, log } = await setup(t, { otp: async () => { throw new TypeError('Failed to fetch'); } });
  const base = globalThis.fetch;
  globalThis.fetch = async (url, o) => { if (/auth\/v1\/health/.test(url)) { log.fetches.push({ url }); throw new TypeError('x'); } return base(url, o); };
  assert.equal(await chat.ensureChatSession(), 'error');
  assert.equal(log.fetches.filter(f => /auth\/v1\/health/.test(f.url)).length, 1);
  assert.equal(chat.chatError(), "Chat can't be reached right now");
});

test('network-level failure + health answering 540 -> asleep', async (t) => {
  const { chat, log } = await setup(t, { otp: async () => { throw new TypeError('Failed to fetch'); } });
  const base = globalThis.fetch;
  globalThis.fetch = async (url, o) => (/auth\/v1\/health/.test(url) ? res(540, {}) : base(url, o));
  assert.equal(await chat.ensureChatSession(), 'asleep');
});
