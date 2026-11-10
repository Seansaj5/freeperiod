// Thin fetch wrapper for the Bing Ball server API.
import * as store from './store.js';

export const API_BASE = 'https://bing-ball.onrender.com';

function ss() { try { return globalThis.sessionStorage || null; } catch { return null; } }

// `?api=<url>` overrides the base for local testing only: the hub must be on localhost and the value a local http server.
// Kept in sessionStorage so it survives play.html. On the real site (or for any other value) it is ignored and dropped,
// so a crafted link can never send a password or token anywhere else.
const LOCAL_API = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
function localOverride(v) {
  if (typeof v !== 'string') return '';
  v = v.replace(/\/+$/, '');
  return LOCAL_API.test(v) ? v : '';
}
export function apiBase() {
  let host = '', q = null, stored = null;
  try { host = (globalThis.location && globalThis.location.hostname) || ''; } catch { /* ignore */ }
  try { q = new URLSearchParams((globalThis.location && globalThis.location.search) || '').get('api'); } catch { /* ignore */ }
  try { stored = ss() && ss().getItem('fp.api'); } catch { /* ignore */ }
  const local = host === 'localhost' || host === '127.0.0.1';
  const v = local ? localOverride(q != null ? q : stored) : '';
  try {
    if (v) { if (v !== stored) ss() && ss().setItem('fp.api', v); } else if (stored != null) ss() && ss().removeItem('fp.api');
  } catch { /* ignore */ }
  return v || API_BASE;
}

// Where `auth: true` gets the session token: session.js registers its getter (it also keeps the token in memory
// when storage is blocked); until then, fp.token.
let tokenSource = () => store.get('fp.token');
export function useToken(fn) { tokenSource = fn; }

// A napping Render server takes about a minute to wake: log in, sign up and suggestions wait this long.
export const WAKE_TIMEOUT = 75000;

// Returns parsed JSON. Throws Error with .status; .waking = true on timeout/network failure.
export async function call(path, { body, auth, timeout = 20000, keepalive } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = typeof auth === 'string' ? auth : tokenSource();
    if (token) headers.Authorization = 'Bearer ' + token;
  }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
  let res;
  try {
    res = await globalThis.fetch(apiBase() + path, {
      method: body !== undefined ? 'POST' : 'GET',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined,
      keepalive: keepalive || undefined,
    });
  } catch (e) {
    const err = new Error('Server unreachable or waking up');
    err.waking = true;
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || (data && data.ok === false)) {
    const err = new Error((data && data.error) || 'Request failed (' + res.status + ')');
    err.status = res.status;
    throw err;
  }
  return data || {};
}
