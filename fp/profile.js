// Profile sheet: Bing Ball stats, Close Call and horror.exe local saves, play time per game.
import * as store from './store.js';
import * as session from './session.js';
import { call } from './api.js';
import { getMeta } from './meta.js';
import { h, openSheet, fmtTime, errText } from './ui.js';
import { getStreak, bestBadge } from './streak.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (v) => { const n = num(v); return n == null ? null : n.toLocaleString(); };

function stat(label, value) { return value == null || value === '' ? null : h('div', { class: 'fp-stat' }, h('dt', { text: label }), h('dd', { text: String(value) })); }

function saved(key) {
  let d = null;
  try { d = JSON.parse(store.get(key)); } catch { /* none */ }
  return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
}
export function closeCall() {
  const d = saved('closecall.v1');
  if (!d) return null;
  return {
    cash: fmt(d.cash),
    cars: Array.isArray(d.owned) ? String(new Set(d.owned).size) : null, // owned so far (the garage keeps growing)
    best: fmt(d.best),
  };
}
export function horrorExe() {
  const d = saved('horrorexe.v1');
  if (!d) return null;
  const s = d.stats && typeof d.stats === 'object' ? d.stats : {};
  return { rounds: fmt(s.rounds), wins: fmt(s.wins), escapes: fmt(s.escapes), played: fmtTime((getMeta().play || {})['horror-exe'] || 0) };
}

// ---------- public career card (anyone's; GET /api/player/<name>: matches, wins, goals, MVPs, level, ranks, styles) ----------
const CARD_TTL = 5 * 60000;
const cards = new Map();      // lowercase name -> { at, p: Promise }
export const validName = (name) => typeof name === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(name);
/**
 * The Bing Ball career card for `name`, or null (no such account). Kept for 5 minutes per page; a failed look is not kept.
 * Throws like api.call (e.waking when the server is asleep).
 */
export function careerCard(name, { timeout = 20000 } = {}) {
  if (!validName(name)) return Promise.resolve(null);
  const key = name.toLowerCase(), hit = cards.get(key);
  if (hit && Date.now() - hit.at < CARD_TTL) return hit.p;
  const p = call('/api/player/' + encodeURIComponent(name), { timeout })
    .then((d) => (d && d.profile && typeof d.profile === 'object' ? d.profile : null))
    .catch((e) => { cards.delete(key); if (e && e.status === 404) return null; throw e; });
  cards.set(key, { at: Date.now(), p });
  return p;
}
/** The numbers trophies read from a career card. */
export function careerFacts(card) {
  if (!card || typeof card !== 'object') return null;
  const c = card.career && typeof card.career === 'object' ? card.career : {};
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  return { matches: n(c.matches), wins: n(c.wins), goals: n(c.goals), mvps: n(c.mvps), level: n(card.level) };
}
/** Raw numbers from this device's saves (trophies and the profile page). */
export function saveFacts() {
  const cc = saved('closecall.v1'), hx = saved('horrorexe.v1');
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  const hs = hx && hx.stats && typeof hx.stats === 'object' ? hx.stats : null;
  return {
    cc: cc ? { best: n(cc.best), cars: Array.isArray(cc.owned) ? new Set(cc.owned).size : 0, cash: n(cc.cash) } : null,
    hx: hs ? { wins: n(hs.wins), escapes: n(hs.escapes), rounds: n(hs.rounds) } : null,
  };
}

export async function openProfile() {
  const user = session.getUser();
  const sheet = openSheet({ title: user ? user.username : 'Profile' });
  const bb = h('section', { class: 'fp-sec' }, h('h3', { text: 'Bing Ball' }), h('p', { class: 'fp-note' }, 'Loading...'));
  sheet.body.append(bb);

  const sv = session.getToken() ? getStreak() : null;
  if (sv) {
    const bb2 = bestBadge(sv.badges);
    sheet.body.append(h('section', { class: 'fp-sec' }, h('h3', { text: 'Daily streak' }),
      h('dl', { class: 'fp-stats' }, stat('Current', '\u{1F525} ' + sv.days + (sv.days === 1 ? ' day' : ' days')), stat('Best', sv.best + (sv.best === 1 ? ' day' : ' days')), stat('Badge', bb2 ? bb2.label : 'None yet'))));
  }

  const cc = closeCall();
  sheet.body.append(h('section', { class: 'fp-sec' }, h('h3', { text: 'Close Call' }),
    cc ? h('dl', { class: 'fp-stats' }, stat('Cash', cc.cash), stat('Cars owned', cc.cars), stat('Best', cc.best))
      : h('p', { class: 'fp-note', text: 'No Close Call save on this device yet.' })));

  const hx = horrorExe();
  sheet.body.append(h('section', { class: 'fp-sec' }, h('h3', { text: 'horror.exe' }),
    hx ? h('dl', { class: 'fp-stats' }, stat('Rounds', hx.rounds), stat('Wins', hx.wins), stat('Escapes', hx.escapes), stat('Played', hx.played))
      : h('p', { class: 'fp-note', text: 'No horror.exe save on this device yet.' })));

  const play = getMeta().play || {};
  const games = (window.GAMES || []).map(g => [g.title, play[g.id] || 0]);
  sheet.body.append(h('section', { class: 'fp-sec' }, h('h3', { text: 'Play time' }),
    games.length ? h('dl', { class: 'fp-stats' }, ...games.map(([t, s]) => stat(t, fmtTime(s)))) : h('p', { class: 'fp-note', text: 'No games listed.' })));
  sheet.focus();

  const fill = (...kids) => bb.replaceChildren(h('h3', { text: 'Bing Ball' }), ...kids.filter(Boolean));
  if (!session.getToken()) { fill(h('p', { class: 'fp-note', text: 'Log in to see your Bing Ball stats.' })); return; }
  const [pr, lb] = await Promise.allSettled([
    call('/api/profile', { auth: true }),
    call('/api/leaderboard?mode=1v1', { auth: true }),
  ]);
  if (pr.status === 'rejected') { fill(h('p', { class: 'fp-err', role: 'alert', text: errText(pr.reason) })); return; }
  const p = (pr.value && pr.value.profile) || {};
  const lvl = p.level && typeof p.level === 'object' ? p.level : null;
  const levelNum = lvl ? lvl.level : p.level;
  const into = num(lvl && lvl.into), need = num(lvl && lvl.need), prog = num(lvl && lvl.progress);
  const maxed = !!lvl && (lvl.next == null || need === 0);
  let bar = null, xpLabel = null;
  if (lvl) {
    const pct = Math.max(0, Math.min(100, (maxed ? 1 : prog != null ? prog : need ? (into || 0) / need : 0) * 100));
    xpLabel = maxed ? 'MAX' : need ? `${fmt(into || 0)} / ${fmt(need)} XP` : null;
    bar = h('div', { class: 'fp-xp', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': 'XP to next level' },
      h('i', { style: `width:${pct}%` }));
  }
  const streak = p.streak && typeof p.streak === 'object' ? p.streak.count : p.streak;
  const me = lb.status === 'fulfilled' && lb.value ? lb.value.me : null;
  const ranked = me ? [me.r != null ? `${fmt(me.r)} rating` : null, me.tier || null, me.pos ? `#${me.pos}` : null].filter(Boolean).join(' · ') : '';
  fill(
    h('dl', { class: 'fp-stats' },
      stat('Level', levelNum != null ? levelNum : null),
      stat('Total XP', p.xp != null ? fmt(p.xp) : null),
      stat('Coins', fmt(p.coins)),
      stat('Styles', Array.isArray(p.styles) ? p.styles.length : null),
      stat('Bing Ball coin streak', streak != null && num(streak) != null ? `${streak} day${num(streak) === 1 ? '' : 's'}` : null),
      stat('Ranked 1v1', ranked || null)),
    bar,
    xpLabel ? h('p', { class: 'fp-note', text: xpLabel }) : null,
    lb.status === 'rejected' ? h('p', { class: 'fp-note', text: 'Ranked info unavailable right now.' }) : null);
}
