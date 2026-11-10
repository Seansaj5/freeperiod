// Chat client and the bridge from the hub (Bing Ball) session to a Supabase session.
// States: off (not set up / route 503) | guest | waking (asking Bing Ball for a chat token) | ready | asleep (Supabase paused) | error.
import { createClient } from '../vendor/supabase.js';
import { CHAT } from './config.js';
import { getToken, getUser, onChange } from '../session.js';
import { call } from '../api.js';
import * as store from '../store.js';

let config = CHAT;
let make = createClient;
let client = null;
let state = null; // null until first asked: derived from config + hub session
let meUser = null;
let inflight = null;
let wired = false;
const listeners = new Set();

// Same rule as the server (POST /api/chat/session).
export function chatEmail(username) { return String(username).toLowerCase() + '@users.freeperiod.example'; }

function configured() { return !!(config && config.url && config.key); }
function setState(s) {
  if (state === s) return;
  state = s;
  for (const fn of [...listeners]) { try { fn(s); } catch { /* ignore */ } }
}
function baseState() {
  if (!configured()) return 'off';
  return getUser() && getToken() ? 'waking' : 'guest';
}

export function getChat() {
  if (!configured()) return null;
  if (!client) {
    client = make(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'fp.chat.auth' },
    });
    wire();
  }
  return client;
}

export function chatState() { return state || baseState(); }
export function onChatState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function me() { return meUser; }

function setMe(session) {
  const u = session && session.user;
  meUser = u ? { id: u.id, username: (u.app_metadata && u.app_metadata.username) || String(u.email || '').split('@')[0] } : null;
}

// Every run belongs to one hub account and one generation. A hub logout or account switch bumps the generation, and any
// run that finds it changed (or the hub user no longer matching) abandons its work instead of touching state.
let gen = 0;
let inflightFor = '';
let lastError = '';
// Who the hub says is signed in. fp.user is read from storage first: another tab may have logged in or out meanwhile
// (this tab's session.js only learns that from the storage event, which can come after Supabase's own tab broadcast).
const hubKey = () => {
  if (!getToken()) return '';
  const u = store.json('fp.user', null) || getUser();
  return u && typeof u.username === 'string' ? chatEmail(u.username) : '';
};
// Sign out on THIS device only ('local': the account's other devices keep their chat), and drop the stored session
// even when Supabase can't be reached (a global sign-out removes it only after the server answers).
async function signOutHere(c) {
  try { await c.auth.signOut({ scope: 'local' }); } catch { /* removed locally first */ }
  try { if (globalThis.localStorage) globalThis.localStorage.removeItem('fp.chat.auth'); } catch { /* storage blocked */ }
}

export function chatError() { return lastError; }

// The chat account changes under this tab: drop it at once (the app resets exactly as for a switch in this tab), then
// sign in as whoever the hub says now (or show the guest view).
function resetTo(key) {
  gen++; inflight = null; inflightFor = ''; meUser = null; lastError = '';
  setState(key ? 'waking' : 'guest');
  return ensureChatSession();
}
// Lost sessions come back by themselves, but not in a loop: after 3 in a minute chat shows an error with Try again.
let lost = [];
function onLostSession() {
  const key = hubKey();
  if (!key) { resetTo(''); return; }
  const now = Date.now();
  lost = lost.filter((t) => now - t < 60000);
  if (lost.length >= 3) {
    gen++; inflight = null; inflightFor = ''; meUser = null;
    lastError = 'Chat signed you out. Try again in a moment.';
    setState('error');
    return;
  }
  lost.push(now);
  resetTo(key);
}

// Follow hub login / logout / account switch (this tab, or another one: session.js follows the storage event), and the
// Supabase session itself (signed out or replaced from another tab, or a refresh that failed).
function wire() {
  if (wired) return;
  wired = true;
  onChange(async (u) => {
    if (!configured()) return;
    if (!u || !getToken()) {
      gen++; inflight = null; inflightFor = ''; meUser = null; lastError = '';
      setState('guest');
      await signOutHere(getChat());
      return;
    }
    const key = chatEmail(u.username);
    if (state === 'ready' && meUser && chatEmail(meUser.username) === key) return;
    if (state === 'ready' && meUser) { resetTo(key); return; } // another account (another tab switched): reset first
    ensureChatSession(); // new login/switch, or a retry from guest/error/asleep/off-by-route
  });
  const c = client;
  if (c && c.auth && typeof c.auth.onAuthStateChange === 'function') {
    c.auth.onAuthStateChange((event, session) => {
      // (auth-js calls this inside its lock: anything that calls auth again runs after it)
      setTimeout(() => {
        if (!configured() || inflight) return; // a sign-in of ours is running: it decides
        if (state !== 'ready' && state !== 'waking') return;
        const email = session && session.user ? String(session.user.email || '').toLowerCase() : '';
        if (event === 'SIGNED_OUT' || !session) { if (state === 'ready') onLostSession(); return; }
        if (meUser && email && email !== chatEmail(meUser.username)) resetTo(hubKey()); // another tab's account
      }, 0);
    });
  }
}

function isPaused(e) {
  const s = e && (e.status || e.code);
  return s === 540 || s === 503 || /paused|restor/i.test((e && e.message) || '');
}
const networkLevel = (e) => !!e && !e.status && !e.code && !(e.error && e.error.status);

// Heuristic: a paused Supabase project often shows up in the browser only as a failed fetch. One short probe of the
// project's health endpoint: it answering 540/503 proves "asleep"; answering fine means a blip ('error'); no answer at all
// proves nothing, so we stay 'error' with a readable message rather than claim the project is paused.
async function probeAsleep() {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 4000) : null;
  try {
    const r = await globalThis.fetch(config.url.replace(/\/+$/, '') + '/auth/v1/health', { signal: ctl ? ctl.signal : undefined, headers: { apikey: config.key } });
    return r.status === 540 || r.status === 503;
  } catch { return false; } finally { if (timer) clearTimeout(timer); }
}

// Once per page load, a reused session asks Bing Ball to re-sync the chat role and game stats (a fresh session already
// did). { ok: false } (Bing Ball lost the chat account) means a full sign-in; 503 / network trouble is ignored.
let refreshedFor = '';
function refreshOnce(key) {
  if (refreshedFor === key) return;
  refreshedFor = key;
  call('/api/chat/refresh', { body: {}, auth: true, timeout: 75000 }).catch((e) => {
    if (!e || e.status !== 200 || hubKey() !== key || state !== 'ready') return; // only { ok: false } means "sign in again"
    gen++; inflight = null; inflightFor = '';
    ensureChatSession({ fresh: true });
  });
}

async function run(g, key, fresh = false, retried = false) {
  const stale = () => g !== gen || hubKey() !== key;
  const done = (st, msg = '') => { if (stale()) return state || baseState(); lastError = msg; setState(st); return st; };
  const fail = async (e) => {
    if (stale()) return state || baseState();
    if (isPaused(e)) return done('asleep');
    if (networkLevel(e) && await probeAsleep()) return done('asleep');
    return done('error', "Chat can't be reached right now");
  };
  const c = getChat();
  if (!key) {
    meUser = null;
    try { const { data } = await c.auth.getSession(); if (data && data.session) await signOutHere(c); } catch { /* ignore */ }
    return done('guest');
  }
  try {
    const { data } = await c.auth.getSession();
    if (stale()) return state || baseState();
    const s = data && data.session;
    if (s && s.user && String(s.user.email || '').toLowerCase() === key && !fresh) {
      setMe(s);
      const st = done('ready');
      if (st === 'ready') refreshOnce(key);
      return st;
    }
    if (s) { await signOutHere(c); if (stale()) return state || baseState(); }
  } catch (e) {
    if (isPaused(e)) return done('asleep');
  }
  setState('waking');
  let tokenHash;
  try {
    const d = await call('/api/chat/session', { body: {}, auth: true, timeout: 75000 });
    tokenHash = d.tokenHash;
  } catch (e) {
    if (stale()) return state || baseState();
    return e && e.status === 503 ? done('off') : done('error', "Chat can't be reached right now");
  }
  if (stale()) return state || baseState();
  if (!tokenHash) return done('error', "Chat can't be reached right now");
  let session = null, err = null;
  try {
    const r = await c.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    session = r && r.data && r.data.session; err = r && r.error;
  } catch (e) { err = e; }
  if (err) {
    // One sign-in link at a time per account: another tab of this browser that signed the same account in at the same
    // moment (a login reaches every open tab) made ours invalid. Its session lands in the storage we share: use it.
    for (let i = 0; i < 6 && !stale() && !isPaused(err); i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (stale()) return state || baseState();
      let other = null;
      try { const r = await c.auth.getSession(); other = r && r.data && r.data.session; } catch { /* ignore */ }
      if (other && other.user && String(other.user.email || '').toLowerCase() === key) { setMe(other); refreshedFor = key; return done('ready'); }
    }
    if (!retried && !stale() && !isPaused(err)) return run(g, key, fresh, true); // no other tab: one more try from the start
    return fail(err);
  }
  // Whatever session is in the client now must belong to the hub user right now; if not, drop it.
  if (stale() || !session || !session.user || String(session.user.email || '').toLowerCase() !== hubKey()) {
    let cur = null;
    try { const r = await c.auth.getSession(); cur = r && r.data && r.data.session; } catch { /* ignore */ }
    if (cur && cur.user && String(cur.user.email || '').toLowerCase() !== hubKey()) await signOutHere(c);
    if (stale()) return state || baseState();
    return done('error', "Chat can't be reached right now");
  }
  setMe(session);
  refreshedFor = key; // a new session was just made with the current role and stats
  return done('ready');
}

// opts.fresh: get a new session from Bing Ball even when this device has one for the right account.
export function ensureChatSession({ fresh = false } = {}) {
  if (!configured()) { setState('off'); return Promise.resolve('off'); }
  const key = hubKey();
  if (inflight && inflightFor === key && !fresh) return inflight;
  const g = ++gen;
  inflightFor = key;
  const p = run(g, key, fresh).catch(() => { if (g === gen) { lastError = "Chat can't be reached right now"; setState('error'); } return 'error'; })
    .finally(() => { if (inflight === p) { inflight = null; inflightFor = ''; } });
  inflight = p;
  return p;
}

// Test seam: swap config / createClient and reset module state.
export function _inject({ config: cfg, createClient: cc } = {}) {
  if (cfg) config = cfg;
  if (cc) make = cc;
  client = null; state = null; meUser = null; inflight = null; inflightFor = ''; lastError = ''; gen = 0; wired = false; refreshedFor = ''; lost = [];
}
