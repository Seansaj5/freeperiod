// Per-account meta: favorites, recent games, play time. Local first, cloud when signed in.
import * as store from './store.js';
import { call } from './api.js';
import * as session from './session.js';
import { cleanMeta, mergeMeta } from './sync.js';

let timer = null;

export function getMeta() { return cleanMeta(store.json('fp.meta', null)); }
function save(m) { store.setJson('fp.meta', m); schedule(); }

function schedule() {
  if (!session.getToken()) return;
  clearTimeout(timer);
  timer = setTimeout(upload, 3000);
}
async function upload() {
  if (!session.getToken()) return;
  const m = getMeta();
  try {
    const d = await call('/api/fp/meta', { body: { favs: m.favs, recent: m.recent, play: m.play }, auth: true });
    if (d.meta) store.setJson('fp.meta', mergeMeta(getMeta(), d.meta));
  } catch { /* retried on next change */ }
}

export function touchRecent(id) {
  const m = getMeta();
  m.recent[id] = Date.now();
  save(cleanMeta(m));
}
export function addPlay(id, secs) {
  if (!(secs > 0)) return;
  const m = getMeta();
  m.play[id] = (m.play[id] || 0) + secs;
  save(cleanMeta(m));
}
export function toggleFav(id) {
  const m = getMeta();
  const on = !m.favs.includes(id);
  m.favs = on ? [...m.favs, id] : m.favs.filter(x => x !== id);
  m.at = Date.now();
  save(cleanMeta(m));
  return on;
}

// On login: merge cloud meta into local, store, and send the merge back.
export async function pullMerge() {
  if (!session.getToken()) return getMeta();
  try {
    const d = await call('/api/fp', { auth: true });
    const merged = mergeMeta(getMeta(), d.meta);
    store.setJson('fp.meta', merged);
    await upload();
  } catch { /* offline/waking: keep local */ }
  return getMeta();
}
