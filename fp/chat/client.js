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

// Follow hub login / logout / account switch.
function wire() {
  if (wired) return;
  wired = true;
  onChange(async (u) => {
    if (!configured()) return;
    if (!u) {
      inflight = null;
      meUser = null;
      try { await getChat().auth.signOut(); } catch { /* ignore */ }
      setState('guest');
    } else if (meUser && chatEmail(u.username) !== chatEmail(meUser.username)) {
      ensureChatSession();
    } else if (state === 'guest' || state === null) {
      ensureChatSession();
    }
  });
}

function isPaused(e) {
  const s = e && (e.status || e.code);
  return s === 540 || s === 503 || /paused|restor/i.test((e && e.message) || '');
}

async function run() {
  const c = getChat();
  const u = getUser();
  if (!u || !getToken()) {
    meUser = null;
    try { const { data } = await c.auth.getSession(); if (data && data.session) await c.auth.signOut(); } catch { /* ignore */ }
    setState('guest');
    return 'guest';
  }
  try {
    const { data } = await c.auth.getSession();
    const s = data && data.session;
    if (s && s.user && String(s.user.email || '').toLowerCase() === chatEmail(u.username)) {
      setMe(s);
      setState('ready');
      return 'ready';
    }
    if (s) await c.auth.signOut();
  } catch (e) {
    if (isPaused(e)) { setState('asleep'); return 'asleep'; }
    /* otherwise fall through and try a fresh session */
  }
  setState('waking');
  let tokenHash;
  try {
    const d = await call('/api/chat/session', { body: {}, auth: true, timeout: 75000 });
    tokenHash = d.tokenHash;
  } catch (e) {
    const s = e && e.status === 503 ? 'off' : 'error';
    setState(s);
    return s;
  }
  if (!tokenHash) { setState('error'); return 'error'; }
  try {
    const { data, error } = await c.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (error) { const s = isPaused(error) ? 'asleep' : 'error'; setState(s); return s; }
    setMe(data && data.session);
    setState('ready');
    return 'ready';
  } catch (e) {
    const s = isPaused(e) ? 'asleep' : 'error';
    setState(s);
    return s;
  }
}

export function ensureChatSession() {
  if (!configured()) { setState('off'); return Promise.resolve('off'); }
  if (!inflight) {
    const p = run().catch(() => { setState('error'); return 'error'; }).finally(() => { if (inflight === p) inflight = null; });
    inflight = p;
  }
  return inflight;
}

// Test seam: swap config / createClient and reset module state.
export function _inject({ config: cfg, createClient: cc } = {}) {
  if (cfg) config = cfg;
  if (cc) make = cc;
  client = null; state = null; meUser = null; inflight = null; wired = false;
}
