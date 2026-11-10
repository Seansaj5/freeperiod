// Home page entry: the banner carousel, live strip, Jump back in, What's new + trophies, Top players, game grid (live
// status, favorites, play time, hover previews), search, and the suggest bar. The header (account chip, Messages, clock,
// accent, ambient background) is fp/shell.js.
// Everything is built with DOM calls (ui.js h() / createElementNS): no innerHTML, so server or user text never becomes markup.
import * as session from './session.js';
import { getMeta, toggleFav, pullMerge } from './meta.js';
import { syncAll } from './saves.js';
import { watchStatus, resolveGame } from './status.js';
import { h, fmtTime } from './ui.js';
import { icon } from './icons.js';
import { mountCarousel } from './carousel.js';
import { openAuthSheet } from './account-ui.js';
import { mountShell } from './shell.js';
import { mountTicker } from './ticker.js';
import { mountWhatsNew } from './whatsnew-ui.js';
import { startTrophies, mountTrophyTeaser, refresh as refreshTrophies, metaSettled } from './trophy-data.js';
import { mountSuggest } from './suggest.js';
import { mountStreakCard, onStreak, peekStreak } from './streak.js';
import { mountFriendsNow } from './chat/activity.js';
import { mountTopPlayers } from './top-players.js';

const GAMES = (window.GAMES || []).map(resolveGame);
const $ = (id) => document.getElementById(id);
const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false });
const reduced = mq('(prefers-reduced-motion: reduce)');
const noHover = mq('(hover: none)');
const finePointer = mq('(hover: hover) and (pointer: fine)');
const DAY = 864e5;

// ---------- helpers ----------
const playLink = (g) => 'play.html?g=' + encodeURIComponent(g.id);
const isNew = (g) => !!g.added && Date.now() - new Date(g.added).getTime() < 14 * DAY;
const accentOf = (g) => (/^#[0-9a-f]{3,8}$/i.test(g.accent || '') ? g.accent : '#c6ff3d');
const tagList = (g) => h('div', { class: 'tags' }, (g.tags || []).map((t) => h('span', { class: 'tag', text: t })));
function ago(t) {
  if (!(t > 0)) return '';
  const d = Date.now() - t;
  if (d < 6e4) return 'just now';
  if (d < 36e5) return Math.floor(d / 6e4) + 'm ago';
  if (d < DAY) return Math.floor(d / 36e5) + 'h ago';
  if (d < 2 * DAY) return 'yesterday';
  if (d < 14 * DAY) return Math.floor(d / DAY) + ' days ago';
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
// An <img> that quietly hides itself (or tries a fallback) instead of showing a broken-image icon.
function picture(src, fallback, props) {
  const img = h('img', { alt: '', decoding: 'async', ...props, src });
  img.addEventListener('error', () => {
    if (fallback && img.getAttribute('src') !== fallback) img.src = fallback;
    else img.classList.add('broken');
  });
  return img;
}

// ---------- live status ----------
const live = new Map(); // game id -> latest status from watchStatus
// A game that `wakes` runs on its server (Bing Ball): Online / Waking up. Otherwise the game plays on its own and the
// server only adds multiplayer (Close Call): Multiplayer on / Solo ready.
function statusView(g, st) {
  const solo = !g.wakes;
  if (st && st.state === 'online') {
    const players = st.players != null ? `${st.players} playing` : null;
    return solo ? { k: 'on', text: ['Multiplayer on', players].filter(Boolean).join(' · ') }
      : { k: 'on', text: ['Online', players, st.version].filter(Boolean).join(' · ') };
  }
  if (solo) return { k: 'solo', text: 'Solo ready' };
  if (!st) return { k: 'check', text: 'Checking' };
  return { k: 'wake', text: 'Waking up' };
}
// Games with a server to watch, and solo games (no `status`: they just play, "Solo ready"), get a pill.
const hasPill = (g) => !!(g.status || !g.wakes);
function paintPill(el, g) {
  const v = statusView(g, live.get(g.id));
  for (const k of ['on', 'solo', 'check', 'wake']) el.classList.toggle('is-' + k, v.k === k);
  el.replaceChildren(h('i', { class: 'dot', 'aria-hidden': 'true' }), h('span', { text: v.text }));
}
function pill(g, cls) {
  const el = h('span', { class: 'live' + (cls ? ' ' + cls : ''), dataset: { live: g.id } });
  paintPill(el, g);
  return el;
}
let ticker = null;
function onStatus(g, st) {
  live.set(g.id, st);
  if (ticker && st) ticker.setStatus(g.id, st);
  document.querySelectorAll('[data-live]').forEach((el) => { if (el.dataset.live === g.id) paintPill(el, g); });
  document.querySelectorAll('[data-wakehint]').forEach((el) => {
    if (el.dataset.wakehint === g.id) el.hidden = !!(st && st.state === 'online');
  });
}

// ---------- favorites + play time (painted in place, so the page never re-renders under the pointer) ----------
function favButton(g, cls) {
  const b = h('button', { type: 'button', class: 'fav' + (cls ? ' ' + cls : ''), dataset: { fav: g.id }, 'aria-label': 'Favorite ' + g.title }, icon('star'));
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = toggleFav(g.id);
    b.classList.remove('pop');
    if (on) { void b.offsetWidth; b.classList.add('pop'); }
    refreshMeta();
  });
  return b;
}
function playedTag(g) { return h('span', { class: 'played', dataset: { played: g.id } }, icon('clock'), h('span')); }
function paintMeta() {
  const m = getMeta();
  document.querySelectorAll('[data-fav]').forEach((b) => {
    const on = m.favs.includes(b.dataset.fav);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? 'In your favorites' : 'Add to favorites';
  });
  document.querySelectorAll('[data-played]').forEach((el) => {
    const secs = m.play[el.dataset.played] || 0;
    el.hidden = !(secs >= 60);
    el.lastChild.textContent = fmtTime(secs) + ' played';
  });
}
function refreshMeta() {
  const was = tag;
  refreshTrophies();
  paintMeta();
  renderRecent();
  renderChips(); // may drop the Favorites chip (and the filter) when the last favorite goes
  if (was === 'Favorites' || tag === 'Favorites') renderGrid();
}

// ---------- featured banner: a carousel of every game, the featured one first ----------
function heroSlide(g, first) {
  const hint = g.wakes ? h('p', { class: 'hint', dataset: { wakehint: g.id } }, 'First load can take up to a minute while the server wakes up.') : null;
  // pictures after the first wait until their slide is next (onShow), so a phone only downloads what it shows
  const art = h('img', { alt: '', decoding: 'async', class: 'hero-art', fetchpriority: first ? 'high' : null });
  art.dataset.src = g.hero || g.thumb;
  art.addEventListener('error', () => {
    if (g.thumb && art.getAttribute('src') !== g.thumb) art.src = g.thumb;
    else art.classList.add('broken');
  });
  if (first) art.src = art.dataset.src;
  const eyebrow = g.featured ? 'Featured' : isNew(g) ? 'New' : 'Spotlight';
  return h('div', { class: 'hero', style: '--accent:' + accentOf(g), dataset: { game: g.id } },
    h('div', { class: 'hero-media', 'aria-hidden': 'true' }, art),
    h('div', { class: 'hero-copy' },
      h('div', { class: 'hero-top' },
        h('span', { class: 'eyebrow' }, eyebrow),
        hasPill(g) ? h('span', { role: 'status' }, pill(g, 'lg')) : null,
        g.beta ? h('span', { class: 'badge beta' }, 'Beta') : null),
      h('h2', { class: 'hero-title', text: g.title }),
      h('p', { class: 'hero-tagline', text: g.tagline || '' }),
      tagList(g),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn-play', href: playLink(g) }, icon('play'), 'Play now'),
        favButton(g, 'big'),
        playedTag(g)),
      hint));
}
function renderHero() {
  const slot = $('hero');
  const list = [...GAMES].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  if (!list.length) { slot.hidden = true; return; }
  const slides = list.map((g, i) => ({ el: heroSlide(g, i === 0), label: g.title }));
  mountCarousel(slot, slides, {
    onShow: (i) => { const img = slides[i].el.querySelector('.hero-art'); if (img && !img.getAttribute('src') && img.dataset.src) img.src = img.dataset.src; },
  });
  for (const g of list) onStatus(g, live.get(g.id));
}

// ---------- Jump back in ----------
function renderRecent() {
  const m = getMeta();
  const list = Object.entries(m.recent).sort((a, b) => b[1] - a[1])
    .map(([id, at]) => ({ g: GAMES.find((x) => x.id === id), at })).filter((x) => x.g).slice(0, 6);
  $('recent').hidden = !list.length;
  $('recent-row').replaceChildren(...list.map(({ g, at }) => {
    const secs = m.play[g.id] || 0;
    const sub = [secs >= 60 ? fmtTime(secs) + ' played' : null, ago(at)].filter(Boolean).join(' · ');
    return h('a', { class: 'tile', href: playLink(g), style: '--accent:' + accentOf(g) },
      h('span', { class: 'tile-thumb' }, picture(g.thumb, null, {})),
      h('span', { class: 'tile-text' },
        h('strong', { text: g.title }),
        h('span', { text: sub || 'Pick up where you left off' })),
      h('span', { class: 'tile-go', 'aria-hidden': 'true' }, icon('play')));
  }));
}

// ---------- filter chips + grid ----------
let tag = 'All';
const searchBox = $('q');
const query = () => searchBox.value.trim().toLowerCase();

function renderChips() {
  const favs = getMeta().favs.filter((id) => GAMES.some((g) => g.id === id));
  if (tag === 'Favorites' && !favs.length) tag = 'All';
  const tags = ['All', ...new Set(GAMES.flatMap((g) => g.tags || []))];
  if (favs.length) tags.push('Favorites');
  $('chips').replaceChildren(...tags.map((t) => h('button', {
    type: 'button', class: 'chip' + (t === tag ? ' on' : '') + (t === 'Favorites' ? ' chip-fav' : ''), 'aria-pressed': t === tag ? 'true' : 'false',
    onclick: () => { tag = t; renderChips(); renderGrid(); },
  }, t === 'Favorites' ? icon('star') : null, t)));
}

function card(g) {
  const thumb = h('div', { class: 'thumb' },
    picture(g.thumb, null, { class: 'poster', loading: 'lazy' }),
    h('div', { class: 'badges' },
      isNew(g) ? h('span', { class: 'badge new' }, 'New') : null,
      g.beta ? h('span', { class: 'badge beta' }, 'Beta') : null),
    favButton(g),
    hasPill(g) ? pill(g) : null,
    h('span', { class: 'go', 'aria-hidden': 'true' }, icon('play')),
    // The whole poster (and its green arrow) opens the game; the title link below is the keyboard/reader one.
    h('a', { class: 'thumb-go', href: playLink(g), tabindex: '-1', 'aria-hidden': 'true' }));
  const el = h('article', { class: 'card', style: '--accent:' + accentOf(g), dataset: { id: g.id } },
    h('i', { class: 'shine', 'aria-hidden': 'true' }),
    thumb,
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, h('h3', {}, h('a', { class: 'stretch', href: playLink(g), text: g.title })), playedTag(g)),
      h('p', { text: g.tagline || '' }),
      tagList(g)));
  wireTilt(el);
  if (g.preview) wirePreview(el, thumb, g);
  return el;
}

function labCard() {
  return h('article', { class: 'card lab' },
    h('div', { class: 'lab-art' },
      h('span', { class: 'lab-tag' }, 'In the lab'),
      h('span', { class: 'lab-flask', 'aria-hidden': 'true' }, icon('flask'), h('i', { class: 'bub b1' }), h('i', { class: 'bub b2' }), h('i', { class: 'bub b3' })),
      h('span', { class: 'lab-bar', 'aria-hidden': 'true' }, h('i'))),
    h('div', { class: 'card-body' },
      h('h3', { text: 'Next game in the lab' }),
      h('p', { text: 'A new game is being built right now. It is not up yet. Got an idea for one? Tell Sean.' }),
      h('button', { type: 'button', class: 'lab-cta', onclick: pitchIdea }, 'Pitch an idea', icon('arrow'))));
}

function renderGrid() {
  const q = query();
  const favs = getMeta().favs;
  const list = GAMES.filter((g) => (tag === 'All' || (tag === 'Favorites' ? favs.includes(g.id) : (g.tags || []).includes(tag))) &&
    (!q || [g.title, g.tagline, ...(g.tags || [])].join(' ').toLowerCase().includes(q)));
  const showLab = !q && tag === 'All';
  $('grid').replaceChildren(...list.map(card), ...(showLab ? [labCard()] : []));
  $('empty').hidden = !!(list.length || showLab);
  $('count').textContent = String(list.length);
  paintMeta();
}

// Lab card -> the suggest bar, set to "New game idea".
function pitchIdea() {
  const sec = $('suggest');
  const pick = [...sec.querySelectorAll('.fp-pick')].find((b) => b.textContent === 'New game idea');
  if (pick && pick.getAttribute('aria-pressed') !== 'true') pick.click();
  sec.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'center' });
  const ta = sec.querySelector('textarea');
  if (ta) ta.focus({ preventScroll: true });
}

// ---------- card tilt + hover preview (mouse only, never with reduced motion) ----------
function wireTilt(el) {
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer.matches || reduced.matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', ((0.5 - y) * 6).toFixed(2) + 'deg');
    el.style.setProperty('--ry', ((x - 0.5) * 8).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  });
  el.addEventListener('pointerleave', () => { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); });
}

let webm = null;
function wirePreview(el, thumb, g) {
  let timer = null, video = null;
  const allowed = () => !noHover.matches && !reduced.matches && !el.dataset.nopreview;
  function start() {
    if (!allowed()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (webm === null) webm = !!document.createElement('video').canPlayType('video/webm');
      if (!webm) { el.dataset.nopreview = '1'; return; }
      if (!video) {
        video = h('video', { class: 'preview', muted: true, loop: true, playsinline: true, preload: 'none', disablepictureinpicture: true, 'aria-hidden': 'true', tabindex: '-1' });
        video.muted = true;
        video.addEventListener('playing', () => thumb.classList.add('previewing'));
        video.addEventListener('error', () => { // missing or unplayable file: never try again, the poster stays
          el.dataset.nopreview = '1';
          thumb.classList.remove('previewing');
          if (video) video.remove();
          video = null;
        }, { once: true });
        video.src = g.preview;
        thumb.querySelector('.poster').after(video);
      }
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    }, 250);
  }
  function stop() {
    clearTimeout(timer);
    thumb.classList.remove('previewing');
    if (video) video.pause();
  }
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') start(); });
  el.addEventListener('pointerleave', stop);
  el.addEventListener('focusin', start);
  el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) stop(); });
}

// ---------- search, keys ----------
searchBox.addEventListener('input', renderGrid);
{ // another page's search box sends you here with ?q=
  const q = new URLSearchParams(location.search).get('q');
  if (q) { searchBox.value = q.slice(0, 60); requestAnimationFrame(() => document.querySelector('.games').scrollIntoView({ block: 'start' })); }
}
addEventListener('keydown', (e) => {
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !document.querySelector('.fp-backdrop')) {
    e.preventDefault();
    searchBox.focus();
  }
  if (e.key === 'Escape' && t === searchBox) { searchBox.value = ''; renderGrid(); searchBox.blur(); }
});

// ---------- account: cloud saves + meta, once per sign-in (not on every render) ----------
let syncedToken = null;
function syncAccount() {
  const t = session.getToken();
  if (!t) { syncedToken = null; return; }
  if (t === syncedToken) return;
  syncedToken = t;
  syncAll(window.GAMES || []).catch(() => {});
  pullMerge().then(() => { refreshMeta(); metaSettled(); }, metaSettled); // trophies count this account's play time from here
}
session.onChange(() => {
  syncAccount();
  refreshMeta(); // meta belongs to an account: logout clears it, another account reads as empty until its copy arrives
});
addEventListener('storage', (e) => { if (e.key === 'fp.meta') refreshMeta(); });

// ---------- start ----------
mountShell({ search: 'home' }); // accent, account chip, Messages, clock, header, ambient background
mountFriendsNow($('friends-now'), { games: GAMES }); // "Friends playing now": hidden unless a chat friend is playing
mountSuggest($('suggest'));
mountStreakCard($('streak'), { onLogin: () => openAuthSheet('login') }); // daily check-in + the streak card
ticker = mountTicker($('ticker'), { games: GAMES });
const streakDays = () => { const v = peekStreak(); ticker.setStreak(v ? v.days : 0); };
onStreak(streakDays);
session.onChange(streakDays);
streakDays();
renderHero();
renderRecent();
mountWhatsNew($('whatsnew'), { games: GAMES });
mountTrophyTeaser($('trophy-teaser'));
startTrophies({ sync: false }); // evaluates now, then as the streak, the career card and chat come in (toasts for new trophies)
renderChips();
renderGrid();
mountTopPlayers($('tops'), { games: GAMES }); // every game's top 3, linking to leaderboards.html
$('foot-count').textContent = `${GAMES.length} game${GAMES.length === 1 ? '' : 's'} and counting`;

for (const g of GAMES) if (g.status) watchStatus(g, (st) => onStatus(g, st));
// Free servers nap after ~15 idle minutes: poke the ones nothing else is checking, so they wake before Play.
GAMES.filter((g) => (g.wakes || g.wake) && !g.status)
  .forEach((g) => fetch(g.wake || g.url, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}));

syncAccount();
session.resume();
