// Chat client and the bridge from the hub (Bing Ball) session to a Supabase session.
// States: off (not set up / route 503) | guest | waking (asking Bing Ball for a chat token) | ready | asleep (Supabase paused) | error.
import { createClient } from '../vendor/supabase.js';
import { CHAT } from './config.js';
import { getToken, getUser, onChange } from '../session.js';
import { call } from '../api.js';

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
const hubKey = () => { const u = getUser(); return u && getToken() ? chatEmail(u.username) : ''; };

export function chatError() { return lastError; }

// Follow hub login / logout / account switch.
function wire() {
  if (wired) return;
  wired = true;
  onChange(async (u) => {
    if (!configured()) return;
    if (!u) {
      gen++; inflight = null; inflightFor = ''; meUser = null; lastError = '';
      setState('guest');
      try { await getChat().auth.signOut(); } catch { /* ignore */ }
      return;
    }
    const key = chatEmail(u.username);
    if (state === 'ready' && meUser && chatEmail(meUser.username) === key) return;
    ensureChatSession(); // new login/switch, or a retry from guest/error/asleep/off-by-route
  });
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

async function run(g, key) {
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
    try { const { data } = await c.auth.getSession(); if (data && data.session) await c.auth.signOut(); } catch { /* ignore */ }
    return done('guest');
  }
  try {
    const { data } = await c.auth.getSession();
    if (stale()) return state || baseState();
    const s = data && data.session;
    if (s && s.user && String(s.user.email || '').toLowerCase() === key) { setMe(s); return done('ready'); }
    if (s) { await c.auth.signOut(); if (stale()) return state || baseState(); }
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
  if (err) return fail(err);
  // Whatever session is in the client now must belong to the hub user right now; if not, drop it.
  if (stale() || !session || !session.user || String(session.user.email || '').toLowerCase() !== hubKey()) {
    let cur = null;
    try { const r = await c.auth.getSession(); cur = r && r.data && r.data.session; } catch { /* ignore */ }
    if (cur && cur.user && String(cur.user.email || '').toLowerCase() !== hubKey()) { try { await c.auth.signOut(); } catch { /* ignore */ } }
    if (stale()) return state || baseState();
    return done('error', "Chat can't be reached right now");
  }
  setMe(session);
  return done('ready');
}

export function ensureChatSession() {
  if (!configured()) { setState('off'); return Promise.resolve('off'); }
  const key = hubKey();
  if (inflight && inflightFor === key) return inflight;
  const g = ++gen;
  inflightFor = key;
  const p = run(g, key).catch(() => { if (g === gen) { lastError = "Chat can't be reached right now"; setState('error'); } return 'error'; })
    .finally(() => { if (inflight === p) { inflight = null; inflightFor = ''; } });
  inflight = p;
  return p;
}

// Test seam: swap config / createClient and reset module state.
export function _inject({ config: cfg, createClient: cc } = {}) {
  if (cfg) config = cfg;
  if (cc) make = cc;
  client = null; state = null; meUser = null; inflight = null; inflightFor = ''; lastError = ''; gen = 0; wired = false;
}
