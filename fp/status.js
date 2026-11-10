// Live status of a game's server for the home page: { state: 'online' | 'waking' | 'offline', players?, version? }.
// Render's free servers sleep: the first answer can take a minute, so a slow answer reads as "waking", never as an error.
import { apiBase, API_BASE } from './api.js';

export const POLL_MS = 45000;    // look again this often while the tab is visible
export const WAKING_MS = 6000;   // no answer for this long: the server is waking up
const TIMEOUT_MS = 75000;        // give up on one look after this (a wake can take a minute)
const RETRY_MS = 15000;          // not online: look again sooner (15 s, 30 s, then every 45 s)

// Games with `apiGame: true` (Bing Ball) live on the API server, so their url and status URLs follow the ?api= override.
export function resolveGame(game) {
  if (!game || !game.apiGame) return game;
  const base = apiBase();
  if (base === API_BASE) return game;
  const swap = (u) => (typeof u === 'string' && u.startsWith(API_BASE) ? base + u.slice(API_BASE.length) : u);
  const status = game.status && typeof game.status === 'object'
    ? Object.fromEntries(Object.entries(game.status).map(([k, v]) => [k, swap(v)])) : game.status;
  return { ...game, url: swap(game.url), status };
}

// One GET. An HTTP 2xx counts as an answer even when it is not JSON (Close Call's /health says plain "ok").
async function probe(url) {
  if (!url) return null;
  try {
    const res = await globalThis.fetch(url, { cache: 'no-store' });
    if (!res || !res.ok) return null;
    let data = null;
    try { data = await res.json(); } catch { /* plain text */ }
    return { data };
  } catch { return null; } // offline, asleep behind an error page, or no CORS
}

function online(health, version) {
  const out = { state: 'online' };
  const h = health && health.data, v = version && version.data;
  if (h && typeof h.players === 'number' && Number.isFinite(h.players)) out.players = Math.max(0, Math.floor(h.players));
  if (v && v.version) out.version = String(v.version) + (v.build != null ? ' b' + v.build : '');
  return out;
}

// Calls cb with each new status (never the same one twice in a row). Returns a stop function.
export function watchStatus(game, cb) {
  game = resolveGame(game);
  const urls = (game && game.status) || {};
  if (!urls.health && !urls.version) return () => {};
  const doc = globalThis.document;
  let stopped = false, busy = false, due = false, timer = null, fails = 0, last = '';
  // A health URL that fails while the version URL answers is blocked (no CORS header): stop asking it, so the browser
  // console does not get a CORS error every 45 s. Players simply stay unknown.
  let healthBlocked = false;

  const hidden = () => !!(doc && doc.visibilityState === 'hidden');
  const emit = (st) => {
    const key = JSON.stringify(st);
    if (key === last) return;
    last = key;
    try { cb(st); } catch { /* a bad listener never stops polling */ }
  };
  const later = (ms) => { clearTimeout(timer); timer = setTimeout(tick, ms); };

  function tick() {
    if (stopped) return;
    if (hidden()) { due = true; return; } // picked up again on visibilitychange
    poll();
  }

  async function poll() {
    if (busy || stopped) return;
    busy = true;
    due = false;
    let answered = false, limit = null;
    const waking = setTimeout(() => { if (!answered && !stopped) emit({ state: 'waking' }); }, WAKING_MS);
    const res = await Promise.race([
      Promise.all([healthBlocked ? null : probe(urls.health), probe(urls.version)]),
      new Promise((r) => { limit = setTimeout(() => r(null), TIMEOUT_MS); }),
    ]);
    answered = true;
    clearTimeout(waking);
    clearTimeout(limit);
    busy = false;
    if (stopped) return;
    const [health, version] = res || [null, null];
    if (health || version) {
      if (!health && urls.health && urls.version) healthBlocked = true;
      fails = 0;
      emit(online(health, version));
      later(POLL_MS);
    } else {
      fails++;
      emit({ state: res ? 'offline' : 'waking' });
      later(Math.min(POLL_MS, RETRY_MS * fails));
    }
  }

  const onVis = () => { if (!hidden() && due && !stopped) poll(); };
  if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis);
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis);
  };
}
