// Trophies on the page: gathers the facts (fp/trophies.js reads them), keeps each account's record on this device
// (fp.trophies: which trophies are won, so a toast plays only once per account), celebrates new ones, and draws the
// home teaser. Facts arrive in steps (this device at once, then the streak, the Bing Ball career card and chat), and
// each step re-evaluates.
import * as store from './store.js';
import * as session from './session.js';
import { getMeta, pullMerge } from './meta.js';
import { peekStreak, onStreak, checkin } from './streak.js';
import { careerCard, careerFacts, saveFacts } from './profile.js';
import { CHAT } from './chat/config.js';
import { evaluate, mergeRecord, progressText, TROPHIES } from './trophies.js';
import { h } from './ui.js';
import { icon } from './icons.js';
import { setTrophyDot } from './shell.js';

const KEY = 'fp.trophies';
const games = () => (Array.isArray(window.GAMES) ? window.GAMES.map((g) => g.id) : []);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the record: { [account or '' for a guest]: { got, src, unseen } } ----------
function records() { const r = store.json(KEY, null); return r && typeof r === 'object' && !Array.isArray(r) ? r : {}; }
export function getRecord(user = session.userKey()) { const r = records()[user || '']; return r && typeof r === 'object' ? r : null; }
function putRecord(rec, user = session.userKey()) { const all = records(); all[user || ''] = rec; store.setJson(KEY, all); }
/** The Trophies page was opened: no more dot. */
export function clearUnseen() { const r = getRecord(); if (r && r.unseen) { r.unseen = 0; putRecord(r); } setTrophyDot(false); }

// ---------- facts ----------
const facts = { chat: null, bb: null };
let factsFor = null;
function localFacts() {
  const m = getMeta(), s = saveFacts(), st = peekStreak();
  return {
    games: games(), play: m.play || {}, favs: m.favs || [], recent: m.recent || {}, times: Object.values(m.recent || {}),
    cc: s.cc, hx: s.hx, signedIn: !!session.getToken(),
    streak: st ? { days: st.days, best: st.best } : null,
    bb: facts.bb, chat: facts.chat,
  };
}

// ---------- celebration ----------
let toastBox = null;
function trophyToast(t, { summary = 0 } = {}) {
  if (!toastBox) { toastBox = h('div', { class: 'tr-toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const el = h('a', { class: 'tr-toast tier-' + (t ? t.tier : 'gold') + (reduced() ? '' : ' shine'), href: 'trophies.html' },
    h('span', { class: 'tr-medal', 'aria-hidden': 'true' }, icon(t ? t.icon : 'trophy')),
    h('span', { class: 'tr-toast-text' },
      h('small', { text: summary ? 'Trophies' : 'Trophy unlocked' }),
      h('b', { text: summary ? `${summary} trophies unlocked` : t.title }),
      h('span', { text: summary ? 'See them all on your Trophies page.' : t.desc })));
  toastBox.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 5200);
}
function celebrate(fresh, quiet, results) {
  const byId = new Map(results.map((t) => [t.id, t]));
  const items = fresh.map((id) => byId.get(id)).filter(Boolean);
  items.slice(0, 3).forEach((t, i) => setTimeout(() => trophyToast(t), 600 + i * 900));
  const rest = Math.max(0, items.length - 3) + quiet.length;      // the rest, and trophies found already won: one line
  if (rest === 1 && !items.length) setTimeout(() => trophyToast(byId.get(quiet[0])), 600);
  else if (rest > 0) setTimeout(() => trophyToast(null, { summary: rest }), 600 + Math.min(3, items.length) * 900);
}

// ---------- evaluate + listeners ----------
const listeners = new Set();
let last = null;
export function onTrophies(fn) { listeners.add(fn); if (last) fn(last); return () => listeners.delete(fn); }
export function refresh({ celebrateNew = true } = {}) {
  const user = session.userKey();
  if (factsFor !== user) { facts.bb = null; facts.chat = null; factsFor = user; }
  const f = localFacts();
  const before = getRecord(user);
  const results = evaluate(f, before && before.got);
  const { record, fresh, quiet } = mergeRecord(before, results, f);
  const changed = JSON.stringify(record) !== JSON.stringify(before);
  if (changed) putRecord(record, user);
  last = { results: evaluate(f, record.got), record, facts: f };
  if (celebrateNew && (fresh.length || quiet.length)) celebrate(fresh, quiet, last.results);
  setTrophyDot(record.unseen > 0 && !document.body.classList.contains('page-trophies'));
  for (const fn of [...listeners]) { try { fn(last); } catch { /* ignore */ } }
  return last;
}

async function loadCareer() {
  const u = session.getUser();
  if (!u || !session.getToken()) return;
  const me = session.userKey();
  try {
    const card = await careerCard(u.username, { timeout: 75000 });
    if (session.userKey() !== me) return;
    facts.bb = careerFacts(card);
    refresh();
  } catch { /* asleep: the Bing Ball trophies wait for the next visit */ }
}
function watchChat() {
  if (!CHAT || !CHAT.url || !CHAT.key) return;
  Promise.all([import('./chat/client.js')]).then(([client]) => {
    const on = (s) => {
      const was = facts.chat;
      facts.chat = s === 'ready' ? !!client.me() : null;      // only a signed-in chat profile says yes; anything else is unknown
      if (facts.chat !== was) refresh();
    };
    client.onChatState(on);
    on(client.chatState());
  }).catch(() => {});
}

/** Starts trophies on a page: evaluates now, then again as the streak, career card, chat and sign-in arrive. */
export function startTrophies({ sync = true } = {}) {
  refresh();
  // pages other than home: bring this account's favorites / play time down and ask for today's streak (both cheap and
  // once per page; the home page does its own)
  if (sync && session.getToken()) {
    pullMerge().then(() => refresh(), () => {});
    checkin().catch(() => {});
  }
  onStreak(() => refresh());
  session.onChange(() => { refresh(); loadCareer(); });
  addEventListener('storage', (e) => { if (e.key === 'fp.meta' || e.key === 'closecall.v1' || e.key === 'horrorexe.v1') refresh(); });
  loadCareer();
  watchChat();
}

// ---------- the home teaser ----------
export function trophyMedal(t, size = '') {
  return h('span', { class: 'tr-medal tier-' + t.tier + (t.done ? ' won' : '') + (size ? ' ' + size : ''), 'aria-hidden': 'true' },
    icon(t.icon), t.done || size === 'xs' ? null : h('span', { class: 'tr-lock' }, icon('lock')));
}
export function mountTrophyTeaser(el) {
  if (!el) return;
  onTrophies(({ results, record }) => {
    const won = results.filter((t) => t.done);
    const total = results.length;
    const pct = Math.round((won.length / total) * 100);
    const latest = won.slice().sort((a, b) => (record.got[b.id] || 0) - (record.got[a.id] || 0)).slice(0, 4);
    // up next: the two closest (started ones first, then any that can be tracked)
    const open = results.filter((t) => !t.done && t.known);
    const nexts = [...open.filter((t) => t.pct > 0).sort((a, b) => b.pct - a.pct), ...open.filter((t) => !t.pct)].slice(0, 2);
    el.hidden = false;
    el.replaceChildren(
      h('div', { class: 'hp-head' },
        h('span', { class: 'hp-ic tr-ic', 'aria-hidden': 'true' }, icon('trophy')),
        h('h2', { id: 'trophy-teaser-h', text: 'Trophies' }),
        h('a', { class: 'hp-link', href: 'trophies.html' }, 'See all', icon('arrow'))),
      h('div', { class: 'tt-sum' },
        h('div', { class: 'tt-ring', style: `--p:${pct}`, role: 'img', 'aria-label': `${won.length} of ${total} trophies` },
          h('b', { text: String(won.length) }), h('small', { text: 'of ' + total })),
        h('div', { class: 'tt-latest' },
          won.length ? h('p', { class: 'tt-cap', text: 'Latest' }) : h('p', { class: 'tt-empty', text: 'None yet. Play any game to win your first trophy.' }),
          latest.length ? h('div', { class: 'tt-medals' }, latest.map((t) => h('span', { class: 'tt-m', title: t.title }, trophyMedal(t, 'sm')))) : null)),
      // the whole case: every trophy as a small medal, won ones lit
      h('ul', { class: 'tt-case', 'aria-label': 'All trophies' }, results.map((t) => h('li', { class: 'tt-cell' + (t.done ? ' won' : ''), title: t.title + (t.done ? ' (won)' : '') },
        h('a', { href: 'trophies.html#' + t.id, 'aria-label': t.title + (t.done ? ', won' : ', locked') }, trophyMedal(t, 'xs'))))),
      nexts.length ? h('div', { class: 'tt-nexts' }, nexts.map((next, i) => h('a', { class: 'tt-next', href: 'trophies.html#' + next.id },
        trophyMedal(next, 'sm'),
        h('span', { class: 'tt-next-text' },
          h('small', { text: i ? 'Then' : 'Up next' }),
          h('b', { text: next.title }),
          h('span', { class: 'tr-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(next.pct), 'aria-label': next.title + ' progress' }, h('i', { style: `width:${Math.max(3, next.pct)}%` }))),
        h('span', { class: 'tt-next-num', text: progressText(next) })))) : null);
  });
}
export { TROPHIES };
