// Free Period leaderboards: what the hub shows (tabs, boards, labels, number formats) and the pure helpers shared by the full page
// (fp/leaderboards.js) and the home page's Top players card (fp/top-players.js). The Bing Ball server works out every board
// (its server/fpboards.js: GET /api/fp/leaderboard?board=<id>, GET /api/fp/leaderboards); nothing here decides a rank.
// No DOM in this file: it is unit-tested in node (tests/boards.test.mjs).
import { call } from './api.js';

// Tier keys from Bing Ball's shared/modes.js TIERS; colors picked for the hub (no pink/purple). Same as the home ranked board.
export const TIERS = {
  rookie: ['Rookie', '#8b95a7'], contender: ['Contender', '#6fe0a0'], egoist: ['Egoist', '#3de0ff'], striker: ['Striker', '#5b9bff'],
  ace: ['Ace', '#ffb020'], worldclass: ['World Class', '#ff7a3d'], newgen: ['New Gen', '#ffe066'],
};

// One tab per game (and the site). `game`: the games.js id (its accent, poster and Play link); `kind` picks the number format.
//   weekly: the server keeps a this-week window for it (counters only)      empty: what the empty state says
export const TABS = Object.freeze([
  { id: 'bing-ball', title: 'Bing Ball', game: 'bing-ball', accent: '#c6ff3d', boards: [
    { id: 'bb-1v1', label: 'Ranked 1v1', short: '1v1', kind: 'rating', empty: 'Win a Ranked 1v1 match to take the first spot.' },
    { id: 'bb-2v2', label: 'Ranked 2v2', short: '2v2', kind: 'rating', empty: 'Win a Ranked 2v2 match to take the first spot.' },
    { id: 'bb-3v3', label: 'Ranked 3v3', short: '3v3', kind: 'rating', empty: 'Win a Ranked 3v3 match to take the first spot.' },
  ] },
  { id: 'close-call', title: 'Close Call', game: 'close-call', accent: '#ffb020', boards: [
    { id: 'cc-combo', label: 'Best combo', short: 'Combo', kind: 'points', unit: 'pts', empty: 'Bank a combo to take the first spot.' },
    { id: 'cc-points', label: 'Career points', short: 'Points', kind: 'points', unit: 'pts', weekly: true, empty: 'Bank a combo to get on the board.' },
    { id: 'cc-cars', label: 'Garage', short: 'Cars', kind: 'count', unit: 'cars', one: 'car', empty: 'Buy your first car to get on the board.' },
  ] },
  { id: 'horror-exe', title: 'horror.exe', game: 'horror-exe', accent: '#ff2a3a', boards: [
    { id: 'hx-xp', label: 'Total XP', short: 'XP', kind: 'points', unit: 'XP', weekly: true, empty: 'Finish a round to earn XP.' },
    { id: 'hx-escapes', label: 'Escapes', short: 'Escapes', kind: 'count', unit: 'escapes', one: 'escape', weekly: true, empty: 'Escape as a survivor to get on the board.' },
    { id: 'hx-exewins', label: 'EXE wins', short: 'EXE wins', kind: 'count', unit: 'wins', one: 'win', weekly: true, empty: 'Win a round as EXE to get on the board.' },
  ] },
  { id: 'free-period', title: 'Free Period', game: null, accent: '#3de0ff', boards: [
    { id: 'fp-best-streak', label: 'Best streak', short: 'Best streak', kind: 'count', unit: 'days', one: 'day', empty: 'Visit two days in a row to start a streak.' },
    { id: 'fp-streak', label: 'Streak now', short: 'Streak now', kind: 'count', unit: 'days', one: 'day', empty: 'Visit two days in a row to start a streak.' },
    { id: 'fp-play', label: 'Play time', short: 'Play time', kind: 'time', weekly: true, empty: 'Play any game on Free Period to get on the board.' },
  ] },
].map((t) => Object.freeze({ ...t, boards: Object.freeze(t.boards.map((b) => Object.freeze({ ...b, tab: t.id }))) })));

export const BOARDS = Object.freeze(TABS.flatMap((t) => t.boards));
export const tabById = (id) => TABS.find((t) => t.id === id) || null;
export const boardById = (id) => BOARDS.find((b) => b.id === id) || null;
/** The home card's board per tab. */
export const HOME_BOARDS = Object.freeze(['bb-1v1', 'cc-combo', 'hx-xp', 'fp-best-streak']);

// ---------- numbers ----------
const int = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
const full = (n) => int(n).toLocaleString('en-US');
/** 1234 -> '1,234'; a million and up -> '1.25M' / '2B' (the full number goes in the title). */
export function compact(n) {
  n = int(n);
  if (n < 1e6) return full(n);
  const [d, s] = n >= 1e9 ? [1e9, 'B'] : [1e6, 'M'];
  const x = n / d;
  return (x >= 100 ? Math.floor(x) : x >= 10 ? Math.floor(x * 10) / 10 : Math.floor(x * 100) / 100) + s;
}
/** Seconds -> '12h 5m' / '45m' / '<1m'. */
export function playTime(secs) {
  const s = int(secs), hrs = Math.floor(s / 3600), min = Math.floor((s % 3600) / 60);
  return hrs ? `${hrs}h ${min}m` : min ? `${min}m` : s ? '<1m' : '0m';
}
/**
 * A board value for display: { text, unit, title }. `text` is short enough for a 360 px row; `title` is the exact number.
 *   rating 1,234 'rating' · points 98,500 'pts' · count 9 'cars' (1 'car') · time '12h 5m'
 */
export function formatValue(board, v) {
  const n = int(v), b = board || {};
  if (b.kind === 'time') return { text: playTime(n), unit: '', title: playTime(n) + ' played' };
  if (b.kind === 'rating') return { text: full(n), unit: 'rating', title: full(n) + ' rating' };
  const unit = b.kind === 'count' && n === 1 && b.one ? b.one : b.unit || '';
  return { text: compact(n), unit, title: full(n) + (unit ? ' ' + unit : '') };
}
/** '9W 1L' (+ ' 2D'): a ranked record. */
export const record = (e) => (e ? `${int(e.w)}W ${int(e.l)}L` + (int(e.d) ? ` ${int(e.d)}D` : '') : '');

// ---------- answers from the server, checked ----------
const NAME = /^[A-Za-z0-9_]{3,16}$/;
const ROLES = new Set(['player', 'admin', 'owner']);
/** One row as the server sends it, checked; null when it is not one. Only these fields are ever read. */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !NAME.test(e.name)) return null;
  const pos = Number.isInteger(e.pos) && e.pos > 0 ? e.pos : null;
  const out = { pos, name: e.name, role: ROLES.has(e.role) ? e.role : 'player', v: int(e.v) };
  if (typeof e.tier === 'string' && Object.hasOwn(TIERS, e.tier)) Object.assign(out, { tier: e.tier, w: int(e.w), l: int(e.l), d: int(e.d) });
  if (e.hidden === true) out.hidden = true;
  return out;
}
const rows = (list, max = 50) => (Array.isArray(list) ? list : []).slice(0, max).map(cleanEntry).filter((e) => e && e.pos);
/** A /api/fp/leaderboard answer, checked: { board, window, week, total, top, me, named, hidden, at }. */
export function cleanBoard(d) {
  const x = d && typeof d === 'object' ? d : {};
  return {
    board: typeof x.board === 'string' ? x.board : '',
    window: x.window === 'week' ? 'week' : 'all',
    week: typeof x.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.week) ? x.week : null,
    total: int(x.total),
    top: rows(x.top),
    me: cleanEntry(x.me),
    named: Array.isArray(x.named) ? rows(x.named, 120) : null,
    hidden: Array.isArray(x.hidden) ? x.hidden.filter((n) => typeof n === 'string' && NAME.test(n)).slice(0, 500) : null,
    at: Number.isFinite(x.at) ? x.at : 0,
  };
}
/** A /api/fp/leaderboards answer: { boardId: { top, total, me: { pos, v } | null } } for the boards the hub knows. */
export function cleanSummary(d) {
  const src = d && typeof d === 'object' && d.boards && typeof d.boards === 'object' ? d.boards : {};
  const out = {};
  for (const b of BOARDS) {
    const x = src[b.id];
    if (!x || typeof x !== 'object') continue;
    const me = x.me && Number.isInteger(x.me.pos) && x.me.pos > 0 ? { pos: x.me.pos, v: int(x.me.v) } : null;
    out[b.id] = { top: rows(x.top, 3), total: int(x.total), me };
  }
  return out;
}

/**
 * What a board shows: { podium: [e|null, e|null, e|null], list, pinned, mine, count }.
 *   everyone  the top 3 on the podium, 4-50 in the list; `pinned` = my row when I am further down than the list goes
 *   friends   (friendNames: lowercase names) only my friends and me, still with their real places
 * `mine` is my row when I am on the board at all.
 */
export function boardView(d, { friendNames = null, me = '' } = {}) {
  const b = d || cleanBoard(null), meKey = String(me || '').toLowerCase();
  const mine = b.me && b.me.pos && b.me.name.toLowerCase() === meKey ? b.me : null;
  let list;
  if (friendNames) {
    const want = new Set([...friendNames].map((n) => String(n).toLowerCase()));
    const seen = new Set(), all = [];
    for (const e of [...(b.named || []), ...b.top.filter((x) => want.has(x.name.toLowerCase())), ...(mine ? [mine] : [])]) {
      const k = e.name.toLowerCase();
      if (seen.has(k) || (!want.has(k) && k !== meKey)) continue;
      seen.add(k); all.push(e);
    }
    list = all.sort((x, y) => x.pos - y.pos);
  } else list = b.top.slice();
  const podium = [0, 1, 2].map((i) => list[i] || null);
  const rest = list.slice(3);
  const pinned = !friendNames && mine && !list.some((e) => e.name.toLowerCase() === meKey) ? mine : null;
  return { podium, list: rest, pinned, mine, count: list.length };
}

// ---------- page state in the link: leaderboards.html?tab=close-call&board=cc-points&window=week ----------
/** { tab, board, window } from a query string; anything unknown falls back to the first tab / its first board / all time. */
export function readState(search) {
  let q;
  try { q = new URLSearchParams(search || ''); } catch { q = new URLSearchParams(''); }
  const fromBoard = boardById(q.get('board'));
  const tab = tabById(q.get('tab')) || (fromBoard ? tabById(fromBoard.tab) : null) || TABS[0];
  const board = fromBoard && fromBoard.tab === tab.id ? fromBoard : tab.boards[0];
  return { tab: tab.id, board: board.id, window: board.weekly && q.get('window') === 'week' ? 'week' : 'all' };
}
/** The query string for a state (the first tab and all time are left out). */
export function stateQuery(s) {
  const q = new URLSearchParams();
  if (s.tab && s.tab !== TABS[0].id) q.set('tab', s.tab);
  const tab = tabById(s.tab) || TABS[0];
  if (s.board && s.board !== tab.boards[0].id) q.set('board', s.board);
  if (s.window === 'week') q.set('window', 'week');
  const str = q.toString();
  return str ? '?' + str : '';
}
export const boardLink = (boardId, window = 'all') => { const b = boardById(boardId); return 'leaderboards.html' + (b ? stateQuery({ tab: b.tab, board: b.id, window }) : ''); };

/** 'Mon Nov 9': the week a this-week board started (the server's New York Monday). */
export function weekLabel(week) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week || '')) return '';
  const d = new Date(week + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** A stable hue for a name's avatar (lime, cyan, amber, green, orange, blue: never pink or purple). */
const HUES = ['#c6ff3d', '#3de0ff', '#ffb020', '#62ff8f', '#ff7a3d', '#5b9bff', '#ffe066', '#2de6be'];
export function nameHue(name) {
  let h = 0;
  for (const c of String(name || '').toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

// ---------- the network (the server sorts at most once a minute; so does this cache) ----------
export const CACHE_MS = 60000;
const cache = new Map();
/** One board (cleanBoard), cached a minute per board + window + friend list. `force` skips the cache. */
export async function fetchBoard(boardId, { window = 'all', names = null, force = false, timeout = 75000 } = {}) {
  const key = [boardId, window, names ? names.join(',') : ''].join('|');
  const hit = cache.get(key);
  if (hit && !force && Date.now() - hit.t < CACHE_MS) return hit.d;
  let path = '/api/fp/leaderboard?board=' + encodeURIComponent(boardId);
  if (window === 'week') path += '&window=week';
  if (names && names.length) path += '&names=' + encodeURIComponent(names.slice(0, 100).join(','));
  const d = cleanBoard(await call(path, { auth: true, timeout }));
  cache.set(key, { t: Date.now(), d });
  return d;
}
export function dropCache() { cache.clear(); }
/** Every board's top 3 (cleanSummary). */
export async function fetchSummary({ timeout = 75000 } = {}) {
  return cleanSummary(await call('/api/fp/leaderboards', { auth: true, timeout }));
}
/** The owner's switch (the server checks it is the owner). @returns the hidden names after it */
export async function setHidden(username, hidden) {
  const d = await call('/api/fp/board-hide', { body: { username, hidden: !!hidden }, auth: true, timeout: 30000 });
  dropCache();
  return Array.isArray(d.hiddenNames) ? d.hiddenNames.filter((n) => typeof n === 'string' && NAME.test(n)) : [];
}
