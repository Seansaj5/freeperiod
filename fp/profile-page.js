// profile.html?u=<username>: a player's public card. Everyone sees the Bing Ball career card (public: GET /api/player)
// and, for chat members, the person's chat profile (avatar, frame, name style, badges, status, streak; the database
// decides who may read it). Your own page adds what only this device knows about you: favorite game, play time, trophies.
import * as session from './session.js';
import { mountShell } from './shell.js';
import { careerCard, validName, saveFacts } from './profile.js';
import { getMeta } from './meta.js';
import { peekStreak, bestBadge } from './streak.js';
import { startTrophies, onTrophies, trophyMedal } from './trophy-data.js';
import { chatConfigured, chatKit, chatReady, pickProfile } from './chat-profile.js';
import { TIERS, RANKED_MODES } from './tiers.js';
import { h, fmtTime } from './ui.js';
import { icon } from './icons.js';
import { openAuthSheet } from './account-ui.js';

mountShell();
const root = document.getElementById('pf-root');
const GAMES = Array.isArray(window.GAMES) ? window.GAMES : [];
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
const fmt = (v) => num(v).toLocaleString('en-US');
/** 'bb2aizen' -> 'Aizen', 'isagi' -> 'Isagi'. */
const styleName = (k) => String(k || '').replace(/^bb2/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

let offTrophies = null;
let target = new URLSearchParams(location.search).get('u') || '';
const isMe = () => !!session.getUser() && target.toLowerCase() === session.getUser().username.toLowerCase();

function stat(label, value, hi) { return h('div', { class: 'pf-stat' + (hi ? ' hi' : '') }, h('b', { text: String(value) }), h('small', { text: label })); }
function sec(title, ic, ...kids) { return h('section', { class: 'pf-sec' }, h('h2', {}, icon(ic), title), ...kids); }
function tierChip(key) {
  const t = TIERS[key] || null;
  return t ? h('span', { class: 'tier', style: '--tier:' + t[1], text: t[0] }) : h('span', { class: 'tier', style: '--tier:#8b95a7', text: 'Unranked' });
}

function missing(title, text, action) {
  root.replaceChildren(h('div', { class: 'pf-missing' }, h('span', { class: 'hp-ic', 'aria-hidden': 'true' }, icon('user')), h('h1', { text: title }), h('p', { text: text }), action || null));
}

// ---------- the card (left) ----------
function card(p, chat, kit) {
  const name = (chat && kit && kit.common.nameOf(chat)) || p.name;
  const theme = chat && kit ? kit.flair.cardTheme(chat) : null;
  const el = h('article', { class: 'pf-card' + (theme ? ' themed' : ''), style: theme ? '--pf-theme:' + theme : null, 'aria-label': name + '’s card' });
  const banner = h('div', { class: 'pf-banner' });
  if (chat && kit) {
    if (kit.flair.isHex(chat.banner_color)) banner.style.background = chat.banner_color;
    if (chat.banner_path) kit.common.mediaSrc({ bucket: 'public-media', path: chat.banner_path }).then((src) => { if (src) { const img = h('img', { alt: '', src }); img.addEventListener('error', () => img.remove()); banner.append(img); } });
  }
  const av = chat && kit ? h('div', { class: 'pf-av-chat' }, kit.common.avatar(chat, { size: 104, frame: 'auto' }))
    : h('div', { class: 'pf-av', 'aria-hidden': 'true', text: (p.name || '?').slice(0, 2).toUpperCase() });
  const pills = h('div', { class: 'pf-pills' }, chat && kit ? kit.common.badgePills(chat) : []);
  const nameEl = chat && kit ? kit.common.nameEl(chat, 'h1', 'pf-name') : h('h1', { class: 'pf-name', text: name });
  const role = p.role && p.role !== 'player' ? h('span', { class: 'pf-role ' + p.role, text: p.role }) : null;
  const since = Date.parse(p.since || '') || num(p.since);
  const st = chat && chat.game_stats ? num(chat.game_stats.streak) : 0;
  const mine = isMe() ? peekStreak() : null;
  const streak = mine ? mine.days : st;
  const best = mine ? bestBadge(mine.badges) : null;
  const chips = [
    p.title ? h('span', { class: 'pf-chip' }, icon('crown'), p.title) : null,
    h('span', { class: 'pf-chip' }, icon('bolt'), 'Level ' + num(p.level)),
    streak > 0 ? h('span', { class: 'pf-chip streak' }, icon('flame'), `${streak}-day streak`) : null,
    best && !(chat && kit) ? h('span', { class: 'pf-chip streak' }, best.label) : null,
    since ? h('span', { class: 'pf-chip' }, icon('calendar'), 'Since ' + new Date(since).toLocaleDateString([], { month: 'short', year: 'numeric' })) : null,
  ];
  el.append(banner,
    h('div', { class: 'pf-top' }, av),
    h('div', { class: 'pf-body' },
      h('div', {}, nameEl, h('p', { class: 'pf-user' }, h('span', { text: '@' + p.name }), role, chat && chat.pronouns ? h('span', { text: '· ' + chat.pronouns }) : null)),
      pills.childElementCount ? pills : null,
      chat && (chat.status_text || chat.status_emoji) ? h('p', { class: 'pf-status' }, chat.status_emoji ? h('span', { text: chat.status_emoji }) : null, h('span', { text: chat.status_text || '' })) : null,
      chat && chat.about ? h('p', { class: 'pf-about', text: chat.about }) : null,
      h('div', { class: 'pf-chips' }, chips),
      h('div', { class: 'pf-actions' },
        isMe() && chatConfigured() ? h('a', { class: 'fp-mini', href: 'chat.html' }, 'Edit in Messages') : null,
        h('button', { type: 'button', class: 'fp-mini', onclick: copyLink }, 'Copy link'))));
  if (chat && kit && chat.effect) import('./chat/effects.js').then((fx) => { try { fx.mountEffect(el, chat.effect, { accent: kit.flair.isHex(chat.name_color) ? chat.name_color : undefined }); } catch { /* no effect */ } }).catch(() => {});
  return el;
}
async function copyLink() {
  const url = new URL('profile.html?u=' + encodeURIComponent(target), location.href).href;
  try { await navigator.clipboard.writeText(url); (await import('./ui.js')).toast('Link copied'); } catch { (await import('./ui.js')).toast(url); }
}

// ---------- the sections (right) ----------
function careerSec(p) {
  const c = p.career || {};
  const m = num(c.matches), w = num(c.wins);
  const rate = m ? Math.round((w / m) * 100) + '%' : '-';
  return sec('Bing Ball career', 'ball',
    h('div', { class: 'pf-grid' },
      stat('Matches', fmt(m)), stat('Wins', fmt(w), true), stat('Win rate', rate), stat('Goals', fmt(c.goals), true),
      stat('Assists', fmt(c.assists)), stat('Saves', fmt(c.saves)), stat('Steals', fmt(c.steals)), stat('MVPs', fmt(c.mvps), true)),
    h('div', { class: 'pf-ranks' }, RANKED_MODES.map((q) => {
      const r = p.ranked && p.ranked[q];
      return h('div', { class: 'pf-rank' }, h('small', { text: 'Ranked ' + q }),
        r && r.n ? h('b', { text: fmt(r.r) }) : h('b', { text: '-' }),
        r && r.n ? tierChip(r.tier) : tierChip(null),
        h('span', { text: r && r.n ? `${num(r.w)}W ${num(r.l)}L${r.pos ? ` · #${r.pos} of ${num(r.of)}` : ''}` : 'No ranked games yet' }));
    })),
    Array.isArray(p.styles) && p.styles.length ? h('div', { class: 'pf-chips', style: 'margin-top:12px' },
      p.styles.map((s, i) => h('span', { class: 'pf-chip' }, icon(i ? 'games' : 'star'), `${styleName(s.style)} · ${fmt(s.matches)} matches`))) : null);
}
function meSecs() {
  const m = getMeta(), play = m.play || {};
  const fav = m.favs.find((id) => GAMES.some((g) => g.id === id));
  const ranked = GAMES.map((g) => ({ g, secs: num(play[g.id]) })).sort((a, b) => b.secs - a.secs);
  const favGame = GAMES.find((g) => g.id === fav) || (ranked[0] && ranked[0].secs ? ranked[0].g : null);
  const total = ranked.reduce((a, x) => a + x.secs, 0);
  const s = saveFacts();
  const games = sec('Games', 'games',
    h('div', { class: 'pf-games' }, ranked.map(({ g, secs }) => h('a', { class: 'pf-game', href: 'play.html?g=' + encodeURIComponent(g.id) },
      h('img', { src: g.thumb, alt: '', loading: 'lazy' }),
      h('b', {}, g.title, ' ', g === favGame ? h('span', { class: 'fav-mark', title: 'Favorite game' }, icon('star')) : null),
      h('span', { text: secs >= 60 ? fmtTime(secs) : 'Not played' })))),
    h('div', { class: 'pf-grid', style: 'margin-top:12px' },
      stat('Played', fmtTime(total), true),
      favGame ? stat('Favorite', favGame.title) : null,
      s.cc ? stat('Close Call best', fmt(s.cc.best)) : null,
      s.cc ? stat('Cars owned', fmt(s.cc.cars)) : null,
      s.hx ? stat('horror.exe wins', fmt(s.hx.wins)) : null,
      s.hx ? stat('Escapes', fmt(s.hx.escapes)) : null));
  const trophies = sec('Trophies', 'trophy', h('p', { class: 'pf-empty', text: 'Counting...' }));
  if (offTrophies) offTrophies();
  offTrophies = onTrophies(({ results }) => {
    const won = results.filter((t) => t.done);
    trophies.querySelector('h2').replaceChildren(icon('trophy'), 'Trophies', h('small', { text: `${won.length} of ${results.length}` }));
    trophies.replaceChildren(trophies.querySelector('h2'),
      won.length ? h('div', { class: 'pf-medals' }, won.map((t) => h('a', { href: 'trophies.html#' + t.id, title: t.title }, trophyMedal(t)))) : h('p', { class: 'pf-empty', text: 'No trophies yet.' }),
      h('a', { class: 'hp-link', href: 'trophies.html', style: 'margin-top:14px;display:inline-flex' }, 'All trophies', icon('arrow')));
  });
  return [games, trophies];
}

// ---------- load ----------
let seq = 0;
async function load() {
  const my = ++seq;
  if (!target) {
    const u = session.getUser();
    if (u) { target = u.username; history.replaceState(null, '', 'profile.html?u=' + encodeURIComponent(target)); }
    else return missing('Your player card', 'Log in to see your card, or open someone’s from a link.', h('button', { type: 'button', class: 'fp-btn', onclick: () => openAuthSheet('login') }, 'Log in'));
  }
  if (!validName(target)) return missing('No such player', 'Player names are 3 to 16 letters, numbers or _.');
  document.title = target + ' · Free Period';
  let p;
  const slow = setTimeout(() => { if (my === seq) root.querySelector('.pf') && root.prepend(h('p', { class: 'page-note' }, icon('clock'), 'Waking up the Bing Ball server. The first answer can take a minute.')); }, 5000);
  try { p = await careerCard(target, { timeout: 75000 }); } catch {
    clearTimeout(slow);
    if (my !== seq) return;
    return missing('Can’t reach Bing Ball', 'The server may be asleep. Try again in a minute.', h('button', { type: 'button', class: 'fp-btn', onclick: () => { root.replaceChildren(h('div', { class: 'pf' }, h('div', { class: 'pf-skel' }), h('div', { class: 'pf-skel' }))); load(); } }, 'Try again'));
  }
  clearTimeout(slow);
  if (my !== seq) return;
  if (!p) return missing('No such player', `Nobody called ${target} has a Free Period account.`);
  target = p.name;
  document.title = p.name + ' · Free Period';
  const draw = (chat, kit) => {
    const side = h('div', { class: 'pf-side' }, careerSec(p), ...(isMe() ? meSecs() : []));
    root.replaceChildren(h('div', { class: 'pf' }, card(p, chat, kit), side));
  };
  draw(null, null);
  // the chat profile (members only, decided by the database); the page is already up without it
  if (!chatConfigured() || !session.getToken()) return;
  try {
    const kit = await chatKit();
    if (!(await chatReady(kit.client)) || my !== seq) return;
    const chat = pickProfile(await kit.data.findProfiles(p.name), p.name);
    if (chat && my === seq) draw(chat, kit);
  } catch { /* chat asleep or off: the card stays as it is */ }
}

startTrophies();
session.onChange(() => load());
load();
session.resume();
