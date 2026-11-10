// Signed-in session. Only a 401 signs the user out; network trouble never does.
import * as store from './store.js';
import { call, useToken, WAKE_TIMEOUT } from './api.js';
import { hashString } from './sync.js';

let user = null;
let memToken = null; // the token when storage is blocked: signed in for this page's lifetime at least
const listeners = new Set();
function emit() { for (const fn of [...listeners]) { try { fn(user); } catch { /* ignore */ } } }

// Cached user (fp.user) lets the UI show the signed-in state while a sleeping server wakes.
export function getUser() {
  if (user) return user;
  return getToken() ? store.json('fp.user', null) : null;
}
export function getToken() { return memToken || store.get('fp.token'); }
useToken(getToken);
// Who is signed in, lowercase ('' for a guest): the account that sync records and fp.meta belong to.
export function userKey() { const u = getUser(); return u && typeof u.username === 'string' ? u.username.toLowerCase() : ''; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// fp.loggedOut: someone pressed Log out here (hub button, or the game frame's logout). Until the next login the hub
// never offers to take a login from the game frame (play.js); a hub that never logged out does.
export function wasLoggedOut() { return store.get('fp.loggedOut') === '1'; }

function setSession(token, u) {
  store.del('fp.loggedOut');
  memToken = store.set('fp.token', token) ? null : token;
  user = u ? { username: u.username, role: u.role } : null;
  if (user) store.setJson('fp.user', user); else store.del('fp.user');
  emit();
}
function clear() {
  const had = getUser() !== null;
  memToken = null;
  store.del('fp.token');
  store.del('fp.user');
  user = null;
  if (had) emit();
}

export async function login(username, password) {
  const d = await call('/api/login', { body: { username, password }, timeout: WAKE_TIMEOUT });
  setSession(d.token, d.user);
  return d.user;
}
export async function register(username, password) {
  const d = await call('/api/register', { body: { username, password }, timeout: WAKE_TIMEOUT });
  setSession(d.token, d.user);
  return d.user;
}
export async function logout() {
  const token = getToken();
  // A save played but never synced has no record: mark it as the leaving user's, so the next account treats it as foreign (pull, or back up + clear) rather than pushing it.
  const leaving = userKey();
  if (leaving) {
    for (const g of Array.isArray(globalThis.GAMES) ? globalThis.GAMES : []) {
      if (!g || !g.saveKey || !g.id) continue;
      const raw = store.get(g.saveKey);
      if (raw != null && !store.get('fp.sync.' + g.id)) store.setJson('fp.sync.' + g.id, { hash: hashString(raw), at: 0, user: leaving });
    }
  }
  store.del('fp.meta'); // favorites, recent and play time stay with the account, never with the next person on this computer
  store.set('fp.loggedOut', '1');
  clear();
  if (token) { try { await call('/api/logout', { body: {}, auth: token, timeout: 5000 }); } catch { /* best effort */ } }
}

export async function resume() {
  const token = getToken();
  if (!token) return null;
  try {
    const d = await call('/api/me', { auth: token });
    if (getToken() !== token) return getUser(); // logged out or in as someone else meanwhile: not this answer's business
    user = d.user ? { username: d.user.username, role: d.user.role } : null;
    if (user) store.setJson('fp.user', user); else store.del('fp.user');
    emit();
  } catch (e) {
    if (e && e.status === 401 && getToken() === token) clear(); // dead token; anything else (waking, offline) keeps it
  }
  return getUser();
}

// Token + user handed over by the game frame. No-op when it matches what we have.
export function adopt(token, u) {
  if (!token || !u) return;
  const cur = getUser();
  if (getToken() === token && cur && cur.username === u.username) return;
  setSession(token, u);
}
