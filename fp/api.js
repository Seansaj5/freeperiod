// Thin fetch wrapper for the Bing Ball server API.
import * as store from './store.js';

export const API_BASE = 'https://bing-ball.onrender.com';

function ss() { try { return globalThis.sessionStorage || null; } catch { return null; } }

// `?api=<url>` overrides the base for testing; kept in sessionStorage so it survives play.html.
export function apiBase() {
  try {
    const q = new URLSearchParams(globalThis.location && globalThis.location.search || '').get('api');
    if (q) { try { ss() && ss().setItem('fp.api', q); } catch { /* ignore */ } return q.replace(/\/+$/, ''); }
  } catch { /* ignore */ }
  try { const v = ss() && ss().getItem('fp.api'); if (v) return v.replace(/\/+$/, ''); } catch { /* ignore */ }
  return API_BASE;
}

// Returns parsed JSON. Throws Error with .status; .waking = true on timeout/network failure.
export async function call(path, { body, auth, timeout = 20000, keepalive } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = typeof auth === 'string' ? auth : store.get('fp.token');
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
