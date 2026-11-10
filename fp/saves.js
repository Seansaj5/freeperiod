// Cloud sync of games' localStorage saves (games with a saveKey, signed in only).
import * as store from './store.js';
import { call } from './api.js';
import * as session from './session.js';
import { hashString, decideSync } from './sync.js';

const MAX_DATA = 4096; // bytes (UTF-8), the server's cap per save
const tooBig = (s) => new TextEncoder().encode(s).length > MAX_DATA;
const recKey = id => 'fp.sync.' + id;

const inflight = new Map();

// One sync per game at a time; callers during a run share its result.
export function syncGame(game, opts) {
  if (!game || !game.saveKey || !game.id || !session.getToken()) return Promise.resolve('none');
  if (inflight.has(game.id)) return inflight.get(game.id);
  const p = doSync(game, opts || {}).finally(() => inflight.delete(game.id));
  inflight.set(game.id, p);
  return p;
}

// pushOnly: a game is running on this save (watch), so never pull or clear under it; the next full sync does that.
async function doSync(game, { keepalive = false, pullBy = 0, pushOnly = false } = {}) {
  const user = session.userKey();
  if (!user) return 'none'; // records and saves belong to an account: never sync for one we can't name
  const localRaw = store.get(game.saveKey);
  const record = store.json(recKey(game.id), null);
  let cloud = null;
  try {
    const d = await call('/api/fp/save?game=' + encodeURIComponent(game.id), { auth: true, keepalive });
    cloud = d.save || null;
  } catch { return 'none'; }
  if (session.userKey() !== user) return 'none'; // signed in as someone else while the GET was out
  const action = decideSync({ localRaw, cloud, record, user });
  try {
    if (action === 'pull' || action === 'clear') {
      if (pushOnly) return 'none';
      if (pullBy && Date.now() > pullBy) return 'none'; // too late: the game may already be running
      // The GET may have taken a while; never clobber progress made meanwhile.
      if (store.get(game.saveKey) !== localRaw) return 'none';
      if (action === 'clear') {
        // Another account's save and none in the cloud for this one: keep it aside, start this account fresh.
        if (!store.set('fp.backup.' + game.id, localRaw)) return 'none';
        store.del(game.saveKey);
        store.del(recKey(game.id));
        return 'clear';
      }
      if (localRaw && localRaw !== cloud.data) store.set('fp.backup.' + game.id, localRaw);
      if (!store.set(game.saveKey, cloud.data)) return 'none';
      store.setJson(recKey(game.id), { hash: hashString(cloud.data), at: cloud.at, user });
    } else if (action === 'push') {
      if (tooBig(localRaw)) return 'none';
      const d = await call('/api/fp/save', { body: { game: game.id, data: localRaw }, auth: true, keepalive });
      store.setJson(recKey(game.id), { hash: hashString(localRaw), at: d.at, user });
    } else if (cloud && cloud.data === localRaw) {
      store.setJson(recKey(game.id), { hash: hashString(localRaw), at: cloud.at, user });
    } else if (localRaw == null && !(cloud && cloud.data != null)) {
      store.del(recKey(game.id)); // nothing on either side: a leftover record (maybe another account's) means nothing
    }
  } catch { return 'none'; }
  return action;
}

export async function syncAll(games) {
  const out = {};
  for (const g of games || []) {
    if (g && g.saveKey) out[g.id] = await syncGame(g);
  }
  return out;
}

// Push on change (4 s debounce) and on page hide. Returns a stop function.
export function watch(game) {
  if (!game || !game.saveKey || typeof globalThis.addEventListener !== 'function') return () => {};
  let timer = null;
  const onStorage = e => {
    if (e.key !== game.saveKey) return;
    clearTimeout(timer);
    timer = setTimeout(() => { syncGame(game, { pushOnly: true }); }, 4000);
  };
  const onHide = () => {
    clearTimeout(timer);
    const raw = store.get(game.saveKey);
    const rec = store.json(recKey(game.id), null);
    const user = session.userKey();
    if (raw == null || tooBig(raw) || !session.getToken() || !user) return;
    // Only on top of a sync this device made for this account: a save with another account's record (or none yet)
    // waits for the next full sync, which can pull, instead of being pushed blind over the account's cloud save.
    if (!rec || rec.user !== user || rec.hash === hashString(raw)) return;
    // Unloading: no pre-GET (its continuation would never run); local wins, so POST directly.
    call('/api/fp/save', { body: { game: game.id, data: raw }, auth: true, keepalive: true })
      .then(d => { if (session.userKey() === user) store.setJson(recKey(game.id), { hash: hashString(raw), at: d.at, user }); })
      .catch(() => {});
  };
  globalThis.addEventListener('storage', onStorage);
  globalThis.addEventListener('pagehide', onHide);
  return () => {
    clearTimeout(timer);
    globalThis.removeEventListener('storage', onStorage);
    globalThis.removeEventListener('pagehide', onHide);
  };
}
