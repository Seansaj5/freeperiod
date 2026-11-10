// Per-account meta: favorites, recent games, play time. Local first, cloud when signed in.
// fp.meta names the account it belongs to (`user`, lowercase; a guest's names none). Another account's meta is never
// shown, merged or sent: signed in as someone else, it reads as empty until this account's cloud copy replaces it.
import * as store from './store.js';
import { call } from './api.js';
import * as session from './session.js';
import { cleanMeta, mergeMeta } from './sync.js';

let timer = null;

const owner = (raw) => (raw && typeof raw.user === 'string' ? raw.user : '');
export function getMeta() {
  const raw = store.json('fp.meta', null), me = session.userKey();
  if (me && owner(raw) && owner(raw) !== me) return cleanMeta(null);
  return cleanMeta(raw);
}
// Stored under the signed-in account; a guest keeps whatever account the meta already belongs to.
function put(m) {
  const out = cleanMeta(m), user = session.userKey() || owner(store.json('fp.meta', null));
  if (user) out.user = user;
  store.setJson('fp.meta', out);
}
function save(m) { put(m); schedule(); }

function schedule() {
  if (!session.getToken()) return;
  clearTimeout(timer);
  timer = setTimeout(upload, 3000);
}
async function upload() {
  if (!session.getToken()) return;
  const me = session.userKey(), m = getMeta();
  try {
    const d = await call('/api/fp/meta', { body: { favs: m.favs, recent: m.recent, play: m.play }, auth: true });
    if (d.meta && session.userKey() === me) put(mergeMeta(getMeta(), d.meta));
  } catch { /* retried on next change */ }
}

export function touchRecent(id) {
  const m = getMeta();
  m.recent[id] = Date.now();
  save(m);
}
export function addPlay(id, secs) {
  if (!(secs > 0)) return;
  const m = getMeta();
  m.play[id] = (m.play[id] || 0) + secs;
  save(m);
}
export function toggleFav(id) {
  const m = getMeta();
  const on = !m.favs.includes(id);
  m.favs = on ? [...m.favs, id] : m.favs.filter(x => x !== id);
  m.at = Date.now();
  save(m);
  return on;
}

// On login: merge cloud meta into local, store, and send the merge back. A guest's meta merges in; another
// account's reads as empty, so it is simply replaced by this account's cloud copy.
export async function pullMerge() {
  if (!session.getToken()) return getMeta();
  const me = session.userKey();
  try {
    const d = await call('/api/fp', { auth: true });
    if (session.userKey() !== me) return getMeta();
    put(mergeMeta(getMeta(), d.meta));
    await upload();
  } catch { /* offline/waking: keep local */ }
  return getMeta();
}
