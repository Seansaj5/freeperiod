// Signed-in session. Only a 401 signs the user out; network trouble never does.
import * as store from './store.js';
import { call } from './api.js';

let user = null;
const listeners = new Set();
function emit() { for (const fn of [...listeners]) { try { fn(user); } catch { /* ignore */ } } }

export function getUser() { return user; }
export function getToken() { return store.get('fp.token'); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function setSession(token, u) {
  store.set('fp.token', token);
  user = u || null;
  emit();
}
function clear() {
  store.del('fp.token');
  const had = user !== null;
  user = null;
  if (had) emit();
}

export async function login(username, password) {
  const d = await call('/api/login', { body: { username, password } });
  setSession(d.token, d.user);
  return d.user;
}
export async function register(username, password) {
  const d = await call('/api/register', { body: { username, password } });
  setSession(d.token, d.user);
  return d.user;
}
export async function logout() {
  const token = getToken();
  clear();
  if (token) { try { await call('/api/logout', { body: {}, auth: token, timeout: 5000 }); } catch { /* best effort */ } }
}

export async function resume() {
  const token = getToken();
  if (!token) return null;
  try {
    const d = await call('/api/me', { auth: token });
    user = d.user || null;
    emit();
  } catch (e) {
    if (e && e.status === 401) clear(); // dead token; anything else (waking, offline) keeps it
  }
  return user;
}

// Token + user handed over by the game frame. No-op when it matches what we have.
export function adopt(token, u) {
  if (!token || !u) return;
  if (getToken() === token && user && user.username === u.username) return;
  setSession(token, u);
}
