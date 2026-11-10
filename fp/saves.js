// Cloud sync of games' localStorage saves (games with a saveKey, signed in only).
import * as store from './store.js';
import { call } from './api.js';
import * as session from './session.js';
import { hashString, decideSync } from './sync.js';

const MAX_DATA = 16384;
const recKey = id => 'fp.sync.' + id;

export async function syncGame(game, { keepalive = false } = {}) {
  if (!game || !game.saveKey || !game.id || !session.getToken()) return 'none';
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
    if (raw != null && (!rec || rec.hash !== hashString(raw))) syncGame(game, { keepalive: true });
  };
  globalThis.addEventListener('storage', onStorage);
  globalThis.addEventListener('pagehide', onHide);
  return () => {
    clearTimeout(timer);
    globalThis.removeEventListener('storage', onStorage);
    globalThis.removeEventListener('pagehide', onHide);
  };
}
