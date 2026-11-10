// Pure sync logic: hashing, sync decisions, meta merge/clean.
const ID_RE = /^[a-z0-9-]{2,24}$/;
const MAX_ENTRIES = 24;
const MAX_PLAY = 1e7;

export function hashString(s) {
  if (s == null) return '';
  s = String(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Local wins any conflict (local changed since last sync => push).
// `user` is who is signed in (lowercase). A record made for another account, or one that names no account (written
// before records did), makes this device's save foreign: it never goes up. Cloud there: pull (the caller backs local up).
// No cloud: 'clear' (the caller backs local up and removes it, so the account starts fresh).
export function decideSync({ localRaw, cloud, record, user }) {
  const hasLocal = localRaw != null;
  if (!hasLocal) return cloud && cloud.data != null ? 'pull' : 'none';
  if (cloud && cloud.data === localRaw) return 'none';
  if (record && (!record.user || record.user !== user)) return cloud && cloud.data != null ? 'pull' : 'clear';
  // First sync on this device: an existing cloud save wins over a fresh local one.
  if (!record) return cloud && cloud.data != null ? 'pull' : 'push';
  if (hashString(localRaw) !== record.hash) return 'push';
  if (cloud && cloud.data != null && cloud.at > record.at) return 'pull';
  return 'none';
}

function num(v) { v = Number(v); return Number.isFinite(v) ? v : 0; }

export function cleanMeta(raw) {
  const out = { favs: [], recent: {}, play: {}, at: 0 };
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.favs)) {
    for (const id of raw.favs) {
      if (typeof id === 'string' && ID_RE.test(id) && !out.favs.includes(id)) out.favs.push(id);
      if (out.favs.length >= MAX_ENTRIES) break;
    }
  }
  const recent = raw.recent && typeof raw.recent === 'object' ? raw.recent : {};
  Object.keys(recent).filter(k => ID_RE.test(k)).sort((a, b) => num(recent[b]) - num(recent[a]))
    .slice(0, MAX_ENTRIES).forEach(k => { out.recent[k] = Math.max(0, num(recent[k])); });
  const play = raw.play && typeof raw.play === 'object' ? raw.play : {};
  Object.keys(play).filter(k => ID_RE.test(k)).sort((a, b) => num(play[b]) - num(play[a]))
    .slice(0, MAX_ENTRIES).forEach(k => { out.play[k] = Math.min(MAX_PLAY, Math.max(0, num(play[k]))); });
  out.at = Math.max(0, num(raw.at));
  return out;
}

export function mergeMeta(a, b) {
  a = cleanMeta(a); b = cleanMeta(b);
  const newer = b.at > a.at ? b : a;
  const maxMap = (x, y) => {
    const o = { ...x };
    for (const k of Object.keys(y)) o[k] = Math.max(o[k] || 0, y[k]);
    return o;
  };
  return cleanMeta({
    favs: newer.favs,
    recent: maxMap(a.recent, b.recent),
    play: maxMap(a.play, b.play),
    at: Math.max(a.at, b.at),
  });
}
