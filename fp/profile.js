// Profile sheet: Bing Ball stats, Close Call local save, play time per game.
import * as store from './store.js';
import * as session from './session.js';
import { call } from './api.js';
import { getMeta } from './meta.js';
import { h, openSheet, fmtTime, errText } from './ui.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (v) => { const n = num(v); return n == null ? null : n.toLocaleString(); };

function stat(label, value) { return value == null || value === '' ? null : h('div', { class: 'fp-stat' }, h('dt', { text: label }), h('dd', { text: String(value) })); }

function closeCall() {
  let d = null;
  try { d = JSON.parse(store.get('closecall.v1')); } catch { /* none */ }
  if (!d || typeof d !== 'object') return null;
  return {
    cash: fmt(d.cash),
    cars: Array.isArray(d.owned) ? `${new Set(d.owned).size} of 8` : null,
    best: fmt(d.best),
  };
}

export async function openProfile() {
  const user = session.getUser();
  const sheet = openSheet({ title: user ? user.username : 'Profile' });
  const bb = h('section', { class: 'fp-sec' }, h('h3', { text: 'Bing Ball' }), h('p', { class: 'fp-note' }, 'Loading...'));
  sheet.body.append(bb);

  const cc = closeCall();
  sheet.body.append(h('section', { class: 'fp-sec' }, h('h3', { text: 'Close Call' }),
    cc ? h('dl', { class: 'fp-stats' }, stat('Cash', cc.cash), stat('Cars', cc.cars), stat('Best', cc.best))
      : h('p', { class: 'fp-note', text: 'No Close Call save on this device yet.' })));

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
      stat('Streak', streak != null && num(streak) != null ? `${streak} day${num(streak) === 1 ? '' : 's'}` : null),
      stat('Ranked 1v1', ranked || null)),
    bar,
    xpLabel ? h('p', { class: 'fp-note', text: xpLabel }) : null,
    lb.status === 'rejected' ? h('p', { class: 'fp-note', text: 'Ranked info unavailable right now.' }) : null);
}
