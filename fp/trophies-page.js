// trophies.html: every trophy with its medal, progress and the day it was won, grouped by game, with All / Won / Locked.
import * as session from './session.js';
import { mountShell } from './shell.js';
import { startTrophies, onTrophies, clearUnseen, trophyMedal } from './trophy-data.js';
import { progressText } from './trophies.js';
import { h } from './ui.js';
import { icon } from './icons.js';
import { openAuthSheet } from './account-ui.js';

mountShell();
const root = document.getElementById('tp-root');
const TIERS = [['gold', 'Gold'], ['silver', 'Silver'], ['bronze', 'Bronze']];
let filter = 'all', lastSig = '';

function card(t, wonAt) {
  return h('article', { class: 'tro-card tier-' + t.tier + (t.done ? ' done' : ''), id: t.id },
    trophyMedal(t, 'lg'),
    h('div', { class: 'tro-body' },
      h('div', { class: 'tro-title' }, h('span', { text: t.title }), h('span', { class: 'tro-tier', text: t.tier })),
      h('p', { class: 'tro-desc', text: t.desc }),
      t.done
        ? h('span', { class: 'tro-won' }, icon('check'), wonAt ? 'Won ' + new Date(wonAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Won')
        : t.known
          ? h('div', { class: 'tro-prog' },
            h('span', { class: 'tr-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(t.pct), 'aria-label': t.title + ' progress' }, h('i', { style: `width:${Math.max(2, t.pct)}%` })),
            h('span', { text: progressText(t) }))
          : h('span', { class: 'tro-unknown', text: t.src === 'bb' ? 'Log in to count your Bing Ball career' : t.src === 'chat' ? 'Log in and open Messages' : 'Log in to count your streak' })));
}

function draw({ results, record }) {
  const sig = JSON.stringify([filter, results.map((t) => [t.id, t.done, t.have, t.known]), !!session.getToken()]);
  if (sig === lastSig) return;
  lastSig = sig;
  const won = results.filter((t) => t.done), total = results.length;
  const pct = Math.round((won.length / total) * 100);
  const tierCount = (k) => won.filter((t) => t.tier === k).length;
  const chips = h('div', { class: 'tro-filter', role: 'group', 'aria-label': 'Show' },
    [['all', `All ${total}`], ['won', `Won ${won.length}`], ['locked', `Locked ${total - won.length}`]].map(([k, label]) =>
      h('button', { type: 'button', class: 'chip' + (filter === k ? ' on' : ''), 'aria-pressed': filter === k ? 'true' : 'false', onclick: () => { filter = k; lastSig = ''; draw({ results, record }); } }, label)));
  const shown = results.filter((t) => filter === 'all' || (filter === 'won' ? t.done : !t.done));
  const groups = [...new Set(results.map((t) => t.group))];
  root.replaceChildren(...[
    !session.getToken() ? h('p', { class: 'page-note' }, icon('key'),
      h('span', {}, 'Streak, Bing Ball and chat trophies count once you log in. ',
        h('button', { type: 'button', class: 'link-btn', onclick: () => openAuthSheet('login') }, 'Log in'))) : null,
    h('section', { class: 'tro-summary', 'aria-label': 'Your progress' },
      h('div', { class: 'tt-ring', style: `--p:${pct}`, role: 'img', 'aria-label': `${won.length} of ${total} trophies won` },
        h('b', { text: String(won.length) }), h('small', { text: 'of ' + total })),
      h('div', { class: 'tro-sum-r' },
        h('p', { class: 'tro-sum-line', text: won.length === total ? 'Every trophy won. Legend.' : won.length ? `${pct}% done. ${total - won.length} to go.` : 'Your case is empty. Play anything to start it.' }),
        h('div', { class: 'tro-stats' }, TIERS.map(([k, label]) => h('div', { class: 'tro-stat' },
          trophyMedal({ tier: k, done: true, icon: 'trophy' }, 'sm'), h('div', {}, h('b', { text: String(tierCount(k)) }), h('small', { text: label }))))))),
    chips,
    ...groups.map((gname) => {
      const list = shown.filter((t) => t.group === gname);
      if (!list.length) return null;
      const all = results.filter((t) => t.group === gname);
      return h('section', { class: 'tro-group', 'aria-label': gname },
        h('h2', {}, gname, h('span', { class: 'count', text: `${all.filter((t) => t.done).length} / ${all.length}` })),
        h('div', { class: 'tro-grid' }, list.map((t) => card(t, record.got[t.id]))));
    })].filter(Boolean));
  if (location.hash && !draw.scrolled) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) { draw.scrolled = true; el.scrollIntoView({ block: 'center' }); }
  }
}

startTrophies();
onTrophies((x) => { draw(x); clearUnseen(); });
session.resume();
