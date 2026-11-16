// Your Free Period account inside Nova Party. The game is on the same website as Free Period, so it can see who signed in
// there (the same account as Bing Ball). Online, the game server checks the sign-in again with the account server, so the
// owner's control panel can't be faked in someone else's room; solo only affects your own game.
const API = 'https://bing-ball.onrender.com';
const LOCAL = /^(localhost|127\.0\.0\.1)$/;

/** True when the game itself runs on this computer (tests): only then are ?api= and ?server= honored. */
export const onLocalhost = () => LOCAL.test(location.hostname);

function apiBase() {
  if (onLocalhost()) {
    const v = new URLSearchParams(location.search).get('api');
    if (v && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)) return v;
  }
  return API;
}

function read(key) { try { return localStorage.getItem(key); } catch { return null; } }

/** { token, user: { username, role } | null } from the Free Period sign-in (null user = guest). */
export function account() {
  const token = read('fp.token');
  let user = null;
  try { const u = JSON.parse(read('fp.user') || 'null'); if (u && typeof u.username === 'string') user = { username: u.username, role: u.role || 'player' }; } catch { /* guest */ }
  return token && user ? { token, user, fresh: false } : { token: null, user: null, fresh: false };
}

/**
 * Asks the account server who the token belongs to. Resolves with the fresh account (fresh: true), the same one if the
 * server can't be reached (it may be asleep), or a guest if the sign-in has run out. Never changes Free Period's own storage.
 */
export async function refreshAccount(acct) {
  if (!acct.token) return acct;
  try {
    const r = await fetch(apiBase() + '/api/me', { headers: { Authorization: 'Bearer ' + acct.token }, cache: 'no-store', signal: AbortSignal.timeout(75000) });
    if (r.status === 401) return { token: null, user: null, fresh: true };
    if (!r.ok) return acct;
    const d = await r.json();
    if (!d || !d.user || typeof d.user.username !== 'string') return acct;
    return { token: acct.token, user: { username: d.user.username, role: d.user.role || 'player' }, fresh: true };
  } catch { return acct; }
}

/** The owner, but only once the account server itself has said so (never from what the browser remembers). */
export const isOwnerAcct = (acct) => !!(acct && acct.fresh && acct.user && acct.user.role === 'owner');
