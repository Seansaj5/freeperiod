// Your Free Period account inside Close Call: who is signed in, saving the garage and cash to the account,
// and the owner's perks. It is the same account as the Free Period site and Bing Ball (the hub's own modules
// do the work; this page is on the same site, so it shares the sign-in).
//
// Played from the Free Period site (play.html frames the game), the site already syncs the save before the
// game loads and pushes every change, so here we only show it. Opened on its own, this file does the syncing.
import * as session from '../../../fp/session.js';
import { syncGame, watch } from '../../../fp/saves.js';
import { hashString } from '../../../fp/sync.js';
import * as store from '../../../fp/store.js';

export const GAME = { id: 'close-call', saveKey: 'closecall.v1' };
const HUB = new URL('../../../', import.meta.url).href;

/** True when the Free Period play page is showing this game in its frame. */
export const framed = (() => {
  try { return window.parent !== window && /\/play\.html$/.test(window.parent.location.pathname); } catch { return false; }
})();

const listeners = new Set();
const state = { user: session.getUser(), owner: false, sync: 'idle' };
function emit() { for (const fn of listeners) { try { fn(state); } catch { /* a bad listener never stops the rest */ } } }

/** The sign-in token, for the multiplayer server to check who we are. */
export const accountToken = () => session.getToken();

export const account = {
  get user() { return state.user; },
  /** The owner's perks only switch on once the server has confirmed the role, never from the cached copy. */
  get owner() { return state.owner; },
  get sync() { return state.sync; },
  hubUrl: HUB,
  on(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
};

/** 'saved' when the last thing written to the account is what is on this device. */
function settle() {
  const user = session.userKey();
  if (!user) { state.sync = 'local'; return; }
  const raw = store.get(GAME.saveKey), rec = store.json('fp.sync.' + GAME.id, null);
  state.sync = raw == null || (rec && rec.user === user && rec.hash === hashString(raw)) ? 'saved' : 'pending';
}

let reloadSave = () => {};
let canPull = () => false;
let tries = 0;

// resume() asks the server who the token belongs to. It only announces (onChange) when the server answered;
// a sleeping or unreachable server leaves the cached user in place, so we ask again a little later.
let answered = false;
session.onChange(() => { answered = true; });
async function verify() {
  answered = false;
  const u = await session.resume();
  state.user = u;
  if (answered) state.owner = !!(u && u.role === 'owner');
  else if (u && ++tries < 4) setTimeout(verify, 20000 * tries);
  settle(); emit();
}

/** Full sync (may pull the account's save onto this device), then reload the game's copy if it changed. */
async function fullSync() {
  if (framed || !session.getToken()) { settle(); emit(); return; }
  state.sync = 'saving'; emit();
  const res = await syncGame(GAME, { pullBy: Date.now() + 8000 }).catch(() => 'none');
  if ((res === 'pull' || res === 'clear') && canPull()) reloadSave();
  settle(); emit();
}

let pushTimer = 0;
/** The game saved something: send it to the account a few seconds later (the site does this when it frames us). */
export function saved() {
  if (framed || !session.getToken()) { settle(); emit(); return; }
  state.sync = 'pending'; emit();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    state.sync = 'saving'; emit();
    await syncGame(GAME, { pushOnly: true }).catch(() => 'none');
    settle(); emit();
  }, 4000);
}

// The Free Period page (when it frames us) or another tab saved, signed in or signed out: catch up.
addEventListener('storage', (e) => {
  if (e.key === 'fp.token') { state.user = session.getUser(); state.owner = false; tries = 0; if (session.getToken()) verify(); }
  if (e.key === 'fp.token' || e.key === 'fp.user' || e.key === 'fp.sync.' + GAME.id || e.key === GAME.saveKey) { settle(); emit(); }
});

/**
 * Start: reload() re-reads the save after a pull; pullOk() says whether it is safe to swap the save right now
 * (only on the menus, never mid-run).
 */
export function initAccount({ reload, pullOk }) {
  reloadSave = reload; canPull = pullOk;
  settle(); emit();
  if (!session.getToken()) return;
  if (!framed) { try { watch(GAME); } catch { /* sync is optional */ } fullSync(); }
  verify();
}

export async function logIn(username, password, signUp) {
  const u = signUp ? await session.register(username, password) : await session.login(username, password);
  state.user = u;
  state.owner = !!(u && u.role === 'owner');
  emit();
  if (!framed) watch(GAME);
  await fullSync();
  return u;
}

export async function logOut() {
  clearTimeout(pushTimer);
  if (session.getToken() && !framed) await syncGame(GAME, { pushOnly: true }).catch(() => 'none');
  await session.logout();
  state.user = null; state.owner = false;
  settle(); emit();
}

/** Push now (the Save button). */
export async function saveNow() {
  if (!session.getToken()) return;
  clearTimeout(pushTimer);
  state.sync = 'saving'; emit();
  await syncGame(GAME, { pushOnly: true }).catch(() => 'none');
  settle(); emit();
}
