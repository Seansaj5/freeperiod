// Daily login streak. The Bing Ball server owns the count (POST /api/fp/checkin: its clock, New York days, never a client date);
// this file asks once per visit, remembers the answer for a quick first paint, and draws the home card and the celebration.
// The reward table comes FROM the server in each answer, so a new milestone there needs no change here.
import * as store from './store.js';
import * as session from './session.js';
import { call } from './api.js';
import { h, toast } from './ui.js';

const KEY = 'fp.streak';
const DAY = 864e5;
const PENDING = 'fp.streak.pending';      // a gain found on the play page: celebrated the next time the home page opens
const NY = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }) : null;
/** This device's idea of today's New York day. Only used to SKIP a request; the server never reads it. */
export const localDay = (ms = Date.now()) => (NY ? NY.format(new Date(ms)) : '');
const RECHECK_MS = 30 * 60 * 1000;      // a tab left open past midnight asks again when it is looked at
const fire = '\u{1F525}';

let view = null;          // the last answer for the signed-in account: { days, best, doneToday, next, badges, today, rewards? }
let rewards = [];
let checkedFor = null, checkedAt = 0, inflight = false;
const listeners = new Set();
export function onStreak(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of [...listeners]) { try { fn(view); } catch { /* ignore */ } } }

// ---------- pure helpers (tested in node) ----------
const whole = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Clean an answer from the server (or from the cache). null when it is not a streak view. */
export function cleanView(d) {
  if (!d || typeof d !== 'object') return null;
  const days = whole(d.days), best = Math.max(days, whole(d.best));
  const next = d.next && typeof d.next === 'object' && whole(d.next.days) > days ? { days: whole(d.next.days), label: String(d.next.label || ''), left: whole(d.next.days) - days } : null;
  return {
    days, best, today: /^\d{4}-\d{2}-\d{2}$/.test(d.today) ? d.today : '', doneToday: d.doneToday !== false,
    badges: Array.isArray(d.badges) ? d.badges.filter((b) => typeof b === 'string' && /^streak-\d{1,5}$/.test(b)).slice(0, 20) : [], next,
  };
}
/** Days of a badge id ('streak-7' -> 7). */
export const badgeDays = (id) => whole(String(id).replace('streak-', ''));
/** The best (highest) streak badge as { days, label }, or null. */
export function bestBadge(badges) {
  const top = (Array.isArray(badges) ? badges : []).map(badgeDays).sort((a, b) => b - a)[0];
  return top ? { days: top, label: fire + ' ' + top + '-day streak' } : null;
}
/** Seven dots, oldest first, the last one is today: { lit, today, dow } (dow 0-6, Sunday first, of that New York day). */
export function weekDots(v) {
  const days = v ? v.days : 0, done = !v || v.doneToday;
  const base = v && v.today ? Date.parse(v.today + 'T00:00:00Z') : NaN;
  const out = [];
  for (let ago = 6; ago >= 0; ago--) {      // oldest first
    const lit = done ? ago < days : ago >= 1 && ago <= days;
    out.push({ lit, today: ago === 0, dow: Number.isFinite(base) ? new Date(base - ago * DAY).getUTCDay() : -1 });
  }
  return out;
}
/** 0-100: how far from the last milestone to the next one. */
export function progressPct(v, table = rewards) {
  if (!v || !v.next) return v && v.days ? 100 : 0;
  const prev = (Array.isArray(table) ? table : []).map((r) => whole(r.days)).filter((d) => d <= v.days).sort((a, b) => b - a)[0] || 0;
  return Math.max(0, Math.min(100, Math.round(((v.days - prev) / (v.next.days - prev)) * 100)));
}

// ---------- state ----------
function cacheGet() {
  const raw = store.json(KEY, null), me = session.userKey();
  return raw && me && raw.user === me ? cleanView(raw.view) : null;
}
function cachePut(v) { const me = session.userKey(); if (me && v) store.setJson(KEY, { user: me, view: v }); }
export function getStreak() { return session.getToken() ? view : null; }

export async function checkin({ force = false, quiet = false } = {}) {
  const token = session.getToken(), me = session.userKey();
  if (!token || !me || inflight) return null;
  if (!force && checkedFor === token && Date.now() - checkedAt < RECHECK_MS) return view;
  inflight = true;
  try {
    const d = await call('/api/fp/checkin', { body: {}, auth: token, timeout: 75000 });
    if (session.getToken() !== token) return null;      // logged out or switched meanwhile: not this answer's business
    const v = cleanView(d);
    if (!v) return null;
    rewards = Array.isArray(d.rewards) ? d.rewards : rewards;
    const was = view;
    view = v; checkedFor = token; checkedAt = Date.now();
    cachePut(v);
    emit();
    if (d.gained) {
      const unlocked = Array.isArray(d.unlocked) ? d.unlocked : [];
      if (quiet) store.setJson(PENDING, { user: me, days: v.days, unlocked: unlocked.map((u) => ({ days: u.days, flair: u.flair ? { label: String(u.flair.label || '') } : undefined })) });
      else celebrate(v, unlocked, was);
    }
    return v;
  } catch {
    return view;      // waking, offline: keep what we have; the next visit asks again
  } finally { inflight = false; }
}

// ---------- celebration ----------
export function celebrate(v, unlocked, was) {
  const top = unlocked[unlocked.length - 1];
  if (top) {
    toast(`${fire} ${top.days}-day streak! Badge unlocked`);
    if (top.flair) setTimeout(() => toast(`New reward: ${top.flair.label}`), 900);
  } else if (v.days === 1 && was && was.days > 1) toast(`${fire} Fresh start: day 1`);
  else toast(`${fire} Day ${v.days} streak`);
  burst();
}
let burstTimer = 0;
function burst() {
  const card = document.getElementById('streak-card');
  if (!card) return;
  card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');      // restart the CSS animation
  clearTimeout(burstTimer);
  burstTimer = setTimeout(() => card.classList.remove('pop'), 1800);
  if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = card.querySelector('.st-sparks');
  if (!box) return;
  box.replaceChildren(...Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4, r = 46 + Math.random() * 48;
    return h('i', { style: `--dx:${Math.round(Math.cos(a) * r)}px;--dy:${Math.round(Math.sin(a) * r - 10)}px;--d:${Math.round(Math.random() * 120)}ms` });
  }));
}

/**
 * The play page's check-in: at most one request per account per day per device (the cached answer's day is today's New York day).
 * Quiet: no toast over the game; a gain is celebrated on the next home visit instead. @returns true when a request was made
 */
export async function dailyCheckin() {
  if (!session.getToken() || !session.userKey()) return false;
  const c = cacheGet();
  if (c && c.today && c.today === localDay()) { view = c; return false; }
  await checkin({ force: true, quiet: true });
  return true;
}
/** Shows (once) a celebration that a play-page check-in found. */
export function showPending() {
  const raw = store.json(PENDING, null), me = session.userKey();
  if (!raw) return false;
  store.del(PENDING);
  if (!me || raw.user !== me || !view) return false;
  celebrate(view, Array.isArray(raw.unlocked) ? raw.unlocked : [], null);
  return true;
}

// ---------- the home card ----------
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function mountStreakCard(el, { onLogin } = {}) {
  el.hidden = true;
  let sig = '';      // what is drawn now: a re-render with nothing new must not wipe a celebration that is playing
  function render() {
    const signed = !!session.getToken();
    const next = signed ? JSON.stringify(view || cacheGet()) : 'out';
    if (next === sig && el.firstChild) return;
    sig = next;
    if (!signed) {
      el.hidden = false;
      el.replaceChildren(h('div', { class: 'st-card st-out' },
        h('span', { class: 'st-ic', 'aria-hidden': 'true', text: fire }),
        h('p', { class: 'st-line' }, 'Log in to start a daily streak and earn badges.'),
        onLogin ? h('button', { type: 'button', class: 'st-link', onclick: onLogin }, 'Log in') : null));
      return;
    }
    const v = view || cacheGet();
    if (!v) { el.hidden = true; el.replaceChildren(); return; }
    el.hidden = false;
    const best = bestBadge(v.badges);
    const pct = progressPct(v);
    const dots = weekDots(v);
    const label = v.next ? [`${v.next.left} more day${v.next.left === 1 ? '' : 's'} to `, h('span', { class: 'st-nb', text: `${fire} ${v.next.days}-day streak` })] : 'Every streak badge earned';
    el.replaceChildren(h('div', { class: 'st-card', id: 'streak-card', 'aria-label': 'Daily streak' },
      h('span', { class: 'st-sparks', 'aria-hidden': 'true' }),
      h('div', { class: 'st-count' },
        h('span', { class: 'st-flame', 'aria-hidden': 'true', text: fire }),
        h('div', {}, h('b', { text: String(v.days) }), h('small', { text: 'day streak' }))),
      h('div', { class: 'st-mid' },
        h('p', { class: 'st-next' }, label),
        h('div', { class: 'st-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progress to the next streak badge' },
          h('i', { style: `width:${pct}%` })),
        h('p', { class: 'st-meta' }, `Best ${v.best}`, best ? ` · ${best.label}` : '')),
      h('ol', { class: 'st-week', 'aria-label': 'Last 7 days' },
        dots.map((d) => h('li', { class: (d.lit ? 'lit ' : '') + (d.today ? 'today' : ''), 'aria-label': (d.lit ? 'visited' : 'missed') + (d.today ? ' (today)' : '') },
          h('i'), h('span', { text: d.dow >= 0 ? DOW[d.dow] : '' }))))));
  }
  onStreak(render);
  session.onChange(() => { if (!session.getToken()) view = null; render(); if (session.getToken()) checkin(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && session.getToken()) checkin(); });
  render();
  if (session.getToken()) checkin().then(() => showPending());
}
