// Cloud sync of games' localStorage saves (games with a saveKey, signed in only).
import * as store from './store.js';
import { call } from './api.js';
import * as session from './session.js';
import { hashString, decideSync } from './sync.js';

const MAX_DATA = 16384;
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

async function doSync(game, { keepalive = false, pullBy = 0 } = {}) {
  const localRaw = store.get(game.saveKey);
  const record = store.json(recKey(game.id), null);
  let cloud = null;
  try {
    const d = await call('/api/fp/save?game=' + encodeURIComponent(game.id), { auth: true, keepalive });
    cloud = d.save || null;
  } catch { return 'none'; }
  const action = decideSync({ localRaw, cloud, record });
  try {
    if (action === 'pull') {
      if (pullBy && Date.now() > pullBy) return 'none'; // too late: the game may already be running
      // The GET may have taken a while; never clobber progress made meanwhile.
      if (store.get(game.saveKey) !== localRaw) return 'none';
      if (localRaw && localRaw !== cloud.data) store.set('fp.backup.' + game.id, localRaw);
      if (!store.set(game.saveKey, cloud.data)) return 'none';
      store.setJson(recKey(game.id), { hash: hashString(cloud.data), at: cloud.at });
    } else if (action === 'push') {
      if (localRaw.length > MAX_DATA) return 'none';
      const d = await call('/api/fp/save', { body: { game: game.id, data: localRaw }, auth: true, keepalive });
      store.setJson(recKey(game.id), { hash: hashString(localRaw), at: d.at });
    } else if (cloud && cloud.data === localRaw) {
      store.setJson(recKey(game.id), { hash: hashString(localRaw), at: cloud.at });
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
    timer = setTimeout(() => { syncGame(game); }, 4000);
  };
  const onHide = () => {
    clearTimeout(timer);
    const raw = store.get(game.saveKey);
    const rec = store.json(recKey(game.id), null);
    if (raw == null || raw.length > MAX_DATA || !session.getToken()) return;
    if (rec && rec.hash === hashString(raw)) return;
    // Unloading: no pre-GET (its continuation would never run); local wins, so POST directly.
    call('/api/fp/save', { body: { game: game.id, data: raw }, auth: true, keepalive: true })
      .then(d => store.setJson(recKey(game.id), { hash: hashString(raw), at: d.at }))
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
