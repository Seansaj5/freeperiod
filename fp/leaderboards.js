// Leaderboards page (leaderboards.html): a tab per game, a chip per board, the top 3 on a podium and 4-50 in a list, my own row
// highlighted (and pinned under the list when I am further down), This week for the counters, a Friends filter from chat, and the
// owner's hide switch. The Bing Ball server sorts every board (fp/boards.js has the catalog and the checks).
// Built with DOM calls (ui.js h()), never innerHTML: names come from other players.
import * as session from './session.js';
import { h, toast, openSheet, errText } from './ui.js';
import { openAuthSheet } from './account-ui.js';
import { mountShell } from './shell.js';
import { CHAT } from './chat/config.js';
import {
  TABS, TIERS, tabById, boardById, formatValue, record, boardView, readState, stateQuery, weekLabel, nameHue,
  fetchBoard, dropCache, setHidden,
} from './boards.js';

const $ = (id) => document.getElementById(id);
const GAMES = Array.isArray(window.GAMES) ? window.GAMES : [];
const gameOf = (tab) => (tab && tab.game ? GAMES.find((g) => g.id === tab.game) || null : null);
const accentOf = (tab) => { const g = gameOf(tab); return g && /^#[0-9a-f]{3,8}$/i.test(g.accent || '') ? g.accent : tab.accent; };

// ---------- icons ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  trophy: ['M8 4h8v6a4 4 0 0 1-8 0z', 'M8 6H5.5a2.5 2.5 0 0 0 2.6 4.4', 'M16 6h2.5a2.5 2.5 0 0 1-2.6 4.4', 'M12 14v3.5', 'M8.5 20.5h7', 'M10 17.5h4v3h-4z'],
  crown: ['M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z', 'M4.5 20.5h15'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  play: ['M7 4.5v15l12-7.5z'],
  eyeoff: ['M3 3l18 18', 'M10.6 5.1A10.6 10.6 0 0 1 12 5c5.5 0 9.3 4.6 10 7-.3 1-1.1 2.4-2.4 3.7M6.6 6.6C4.2 8 2.6 10.3 2 12c.8 2.4 4.5 7 10 7 1.6 0 3.1-.4 4.4-1', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  eye: ['M2 12c.7-2.4 4.5-7 10-7s9.3 4.6 10 7c-.7 2.4-4.5 7-10 7S2.7 14.4 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  users: ['M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19', 'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4', 'M15.5 4.2a3.5 3.5 0 0 1 0 6.6'],
  ghost: ['M5 20V10a7 7 0 0 1 14 0v10l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2z', 'M9.5 10.5h.01', 'M14.5 10.5h.01'],
};
function icon(name, cls) {
  const s = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of [['viewBox', '0 0 24 24'], ['aria-hidden', 'true'], ['class', 'ic' + (cls ? ' ' + cls : '')], ['fill', name === 'play' ? 'currentColor' : 'none'],
    ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) s.setAttribute(k, v);
  for (const d of ICONS[name]) { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
}
function bell() {      // the Free Period logo, for its tab
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'lb-bell');
  const g = document.createElementNS(SVG_NS, 'g');
  for (const [k, v] of [['fill', 'none'], ['stroke', '#c6ff3d'], ['stroke-width', '5'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) g.setAttribute(k, v);
  for (const d of ['M18 42h28l-3.5-5V27a10.5 10.5 0 0 0-21 0v10z', 'M28 48a4.5 4.5 0 0 0 8 0', 'M32 12v4']) { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); g.append(p); }
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '47'); c.setAttribute('cy', '17'); c.setAttribute('r', '6'); c.setAttribute('fill', '#3de0ff');
  s.append(g, c);
  return s;
}

// ---------- state ----------
const state = { ...readState(location.search), friends: false };
let seq = 0, retry = 0, slow = 0, current = null;
let hiddenNames = null;                  // the owner's list (from the last board the owner loaded)
const friendsBox = { status: CHAT && CHAT.url && CHAT.key ? 'idle' : 'off', names: null, data: null, client: null };

const tab = () => tabById(state.tab) || TABS[0];
const board = () => boardById(state.board) || tab().boards[0];
const isOwner = () => { const u = session.getUser(); return !!(u && u.role === 'owner'); };

function go(next, { push = false } = {}) {
  Object.assign(state, next);
  const t = tabById(state.tab) || TABS[0];
  if (!t.boards.some((b) => b.id === state.board)) state.board = t.boards[0].id;
  if (!board().weekly) state.window = 'all';
  const url = location.pathname + stateQuery(state);
  try { history[push ? 'pushState' : 'replaceState'](null, '', url); } catch { /* file:// or a sandbox */ }
  paint();
  load();
}
addEventListener('popstate', () => { Object.assign(state, readState(location.search)); paint(); load(); });

// ---------- tabs, chips, tools ----------
function roving(container, onPick) {
  container.addEventListener('keydown', (e) => {
    const items = [...container.querySelectorAll('[role="tab"]')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : step ? (i + step + items.length) % items.length : -1;
    if (to < 0) return;
    e.preventDefault();
    onPick(items[to].dataset.id);
    requestAnimationFrame(() => { const el = container.querySelector(`[data-id="${items[to].dataset.id}"]`); if (el) el.focus(); });
  });
}

function paintTabs() {
  $('tabs').replaceChildren(...TABS.map((t) => {
    const on = t.id === state.tab, g = gameOf(t);
    const art = g && g.thumb
      ? h('span', { class: 'lb-tab-art' }, h('img', { src: g.thumb, alt: '', decoding: 'async', loading: 'lazy' }))
      : h('span', { class: 'lb-tab-art fp' }, bell());
    return h('button', {
      type: 'button', role: 'tab', class: 'lb-tab' + (on ? ' on' : ''), id: 'tab-' + t.id, dataset: { id: t.id },
      'aria-selected': on ? 'true' : 'false', 'aria-controls': 'panel', tabindex: on ? '0' : '-1', style: '--accent:' + accentOf(t),
      onclick: () => { if (!on) go({ tab: t.id, board: t.boards[0].id }, { push: true }); },
    }, art, h('span', { class: 'lb-tab-text' }, h('strong', { text: t.title }), h('small', { text: t.boards.map((b) => b.short).join(' · ') })));
  }));
}

function seg(label, items, value, onPick, cls = '') {
  return h('div', { class: 'lb-seg ' + cls, role: 'group', 'aria-label': label }, items.map(([v, text, extra = {}]) => h('button', {
    type: 'button', class: 'lb-seg-btn' + (v === value ? ' on' : ''), 'aria-pressed': v === value ? 'true' : 'false',
    onclick: () => { if (v !== value && !extra.disabled) onPick(v); }, disabled: !!extra.disabled, title: extra.title || null,
  }, extra.icon ? icon(extra.icon) : null, text)));
}

function paintBar() {
  const t = tab(), b = board();
  $('panel').style.setProperty('--accent', accentOf(t));
  $('panel').setAttribute('aria-labelledby', 'tab-' + t.id);
  $('chips').replaceChildren(...t.boards.map((x) => {
    const on = x.id === b.id;
    return h('button', {
      type: 'button', role: 'tab', class: 'lb-chip' + (on ? ' on' : ''), dataset: { id: x.id }, 'aria-selected': on ? 'true' : 'false', tabindex: on ? '0' : '-1',
      'aria-label': x.label, onclick: () => { if (!on) go({ board: x.id }); },
    }, h('span', { class: 'lb-long', 'aria-hidden': 'true', text: x.label }), h('span', { class: 'lb-short', 'aria-hidden': 'true', text: x.short }));
  }));
  paintTools();
}

/** The window / Friends / Hidden controls. Redrawn after every board; keyboard focus stays on the same control. */
function paintTools() {
  const b = board(), box = $('tools');
  const had = box.contains(document.activeElement) ? [...box.querySelectorAll('button')].indexOf(document.activeElement) : -1;
  const tools = [];
  if (b.weekly) tools.push(seg('Time', [['all', 'All time'], ['week', 'This week']], state.window, (v) => go({ window: v })));
  const fr = friendsBox.status;
  if (fr !== 'off' && session.getUser()) {
    const ready = fr === 'ready';
    tools.push(seg('Who', [['all', 'Everyone'], ['friends', 'Friends', { icon: 'users', disabled: !ready, title: ready ? null : fr === 'loading' ? 'Loading your friends…' : 'Sign in to chat to compare with friends' }]],
      state.friends && ready ? 'friends' : 'all', (v) => { state.friends = v === 'friends'; paintTools(); load(); }));
  }
  if (isOwner()) {
    tools.push(h('button', { type: 'button', class: 'lb-hidden-btn', onclick: openHidden, title: 'Accounts you took off the boards' }, icon('eyeoff'),
      'Hidden' + (hiddenNames && hiddenNames.length ? ' · ' + hiddenNames.length : '')));
  }
  box.replaceChildren(...tools);
  if (had >= 0) { const btn = box.querySelectorAll('button')[had]; if (btn) btn.focus(); }
}

function paint() { paintTabs(); paintBar(); }

// ---------- the board ----------
const initial = (name) => (String(name || '?').match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase();
const avatar = (name, cls = '') => h('span', { class: 'lb-av ' + cls, style: '--hue:' + nameHue(name), 'aria-hidden': 'true', text: initial(name) });
function roleBadge(role) {
  if (role === 'owner') return h('span', { class: 'fp-badge owner lb-role' }, 'Owner');
  if (role === 'admin') return h('span', { class: 'fp-badge lb-role' }, 'Admin');
  return null;
}
function tierChip(key) {
  const t = TIERS[key];
  return t ? h('span', { class: 'tier', style: '--tier:' + t[1], text: t[0] }) : null;
}
function value(b, e, cls, unit = true) {
  const f = formatValue(b, e.v);
  return h('span', { class: cls, title: f.title }, h('b', { text: f.text }), unit && f.unit ? h('small', { text: f.unit }) : null);
}
function hideBtn(e) {
  if (!isOwner()) return null;
  return h('button', { type: 'button', class: 'lb-hide', title: 'Take ' + e.name + ' off every board', 'aria-label': 'Hide ' + e.name + ' from the leaderboards',
    onclick: (ev) => { ev.stopPropagation(); hide(e.name, true); } }, icon('eyeoff'));
}
const meKey = () => { const u = session.getUser(); return u ? u.username.toLowerCase() : ''; };

function pod(b, e, place, friendsView = false) {
  const step = h('span', { class: 'lb-step', 'aria-hidden': 'true', text: String(place) });
  if (!e) {
    return h('li', { class: 'lb-pod open p' + place },
      h('span', { class: 'lb-medal', text: String(place) }), h('span', { class: 'lb-av blank', 'aria-hidden': 'true', text: '?' }),
      h('strong', { class: 'lb-name', text: 'Open spot' }), h('span', { class: 'lb-pod-sub', text: place === 1 ? 'Could be you' : 'Up for grabs' }), step);
  }
  const mine = e.name.toLowerCase() === meKey();
  return h('li', { class: 'lb-pod p' + place + (mine ? ' me' : ''), 'aria-label': `${ordinal(e.pos)}: ${e.name}, ${formatValue(b, e.v).title}` },
    place === 1 ? h('span', { class: 'lb-crown', 'aria-hidden': 'true' }, icon('crown')) : null,
    h('span', { class: 'lb-medal', 'aria-hidden': 'true', text: String(friendsView ? place : e.pos) }),
    avatar(e.name, 'big'),
    h('strong', { class: 'lb-name' }, h('span', { text: e.name }), mine ? h('span', { class: 'lb-you', text: 'You' }) : null),
    roleBadge(e.role),
    friendsView ? h('span', { class: 'lb-overall', text: '#' + e.pos.toLocaleString('en-US') + ' overall' }) : null,
    value(b, e, 'lb-pod-val'),
    e.tier ? h('span', { class: 'lb-pod-sub' }, tierChip(e.tier), h('span', { text: record(e) })) : null,
    hideBtn(e),
    step);
}

// Rows rise in once per board you look at. A redraw of the same board (your role arrived, the owner hid someone) keeps them shown.
let rowsKey = '';
function row(b, e, i, { pinned = false, shown = false } = {}) {
  const mine = e.name.toLowerCase() === meKey();
  return h('li', { class: 'lb-row' + (mine ? ' me' : '') + (pinned ? ' pinned' : '') + (shown ? ' revealed' : ''), style: '--i:' + Math.min(i, 20), 'data-reveal': true }, // rises in as it scrolls into view (fp/motion.js)
    h('span', { class: 'lb-pos', text: String(e.pos) }),
    avatar(e.name),
    h('span', { class: 'lb-who' }, h('span', { class: 'lb-name', text: e.name }), mine ? h('span', { class: 'lb-you', text: 'You' }) : null, roleBadge(e.role)),
    e.tier ? h('span', { class: 'lb-extra' }, tierChip(e.tier), h('span', { class: 'lb-rec', text: record(e) })) : h('span', { class: 'lb-extra' }),
    value(b, e, 'lb-val', b.kind !== 'rating'),
    hideBtn(e));
}
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function skeleton(waking) {
  const body = $('body');
  body.setAttribute('aria-busy', 'true');
  body.replaceChildren(
    waking ? h('div', { class: 'lb-wake', role: 'status' }, h('i', { class: 'dot', 'aria-hidden': 'true' }),
      h('div', {}, h('strong', { text: 'Bing Ball is waking up…' }), h('span', { text: 'Accounts and leaderboards live on the Bing Ball server, which naps when nobody is playing. The first answer can take up to a minute.' }))) : null,
    h('ol', { class: 'lb-podium sk' }, [2, 1, 3].map((p) => h('li', { class: 'lb-pod sk p' + p },
      h('span', { class: 'lb-medal', text: String(p) }), h('span', { class: 'lb-av big blank' }), h('i', { class: 'bar w1' }), h('i', { class: 'bar w2' }), h('span', { class: 'lb-step', 'aria-hidden': 'true' })))),
    h('ol', { class: 'lb-list sk' }, [4, 5, 6, 7, 8, 9].map((p) => h('li', { class: 'lb-row sk' }, h('span', { class: 'lb-pos', text: String(p) }), h('span', { class: 'lb-av blank' }), h('i', { class: 'bar' })))));
  $('foot').replaceChildren(waking ? h('p', { class: 'lb-wake quiet', text: 'Still trying… this page keeps asking every 15 seconds.' }) : h('p', { class: 'lb-wake quiet', role: 'status', text: 'Loading the board…' }));
}

function emptyState(b, d, view) {
  const t = tab(), g = gameOf(t);
  let title, text, cta = null;
  if (state.friends) {
    title = 'No friends here yet';
    text = 'None of your chat friends are on this board yet. Add more friends in Messages, or get on it first.';
    cta = h('a', { class: 'lb-cta', href: 'chat.html' }, icon('users'), 'Open Messages');
  } else if (d.window === 'week') {
    title = 'A fresh week';
    text = `Nobody has scored since ${weekLabel(d.week) || 'Monday'}. The week board resets every Monday (New York time).`;
  } else {
    title = 'Nobody here yet';
    text = b.empty || 'Play to get on the board.';
  }
  if (!cta) cta = g ? h('a', { class: 'lb-cta', href: 'play.html?g=' + encodeURIComponent(g.id) }, icon('play'), 'Play ' + g.title) : h('a', { class: 'lb-cta', href: './' }, icon('arrow'), 'Pick a game');
  return h('div', { class: 'lb-empty' }, h('span', { class: 'lb-empty-ic', 'aria-hidden': 'true' }, icon(state.friends ? 'users' : 'ghost')), h('h3', { text: title }), h('p', { text }), cta);
}

function draw(d) {
  current = d;
  const b = board(), body = $('body');
  body.removeAttribute('aria-busy');
  if (Array.isArray(d.hidden)) hiddenNames = d.hidden;
  const friendNames = state.friends && friendsBox.status === 'ready' ? friendsBox.names : null;
  const view = boardView(d, { friendNames, me: meKey() });
  if (!view.count) {
    body.replaceChildren(emptyState(b, d, view));
  } else {
    const order = [1, 0, 2];      // second, first, third
    const key = JSON.stringify([state, d.window, d.week, b && b.id]), shown = key === rowsKey;
    rowsKey = key;
    body.replaceChildren(
      h('ol', { class: 'lb-podium', 'aria-label': 'Top three' }, order.map((i) => pod(b, view.podium[i], i + 1, !!friendNames))),
      view.list.length || view.pinned ? h('ol', { class: 'lb-list', 'aria-label': 'Rankings' },
        view.list.map((e, i) => row(b, e, i, { shown })),
        view.pinned ? [h('li', { class: 'lb-gap', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), row(b, view.pinned, view.list.length, { pinned: true, shown })] : null) : null);
  }
  foot(d, view);
  paintTools();
}

function foot(d, view) {
  const b = board(), t = tab(), g = gameOf(t), user = session.getUser();
  const play = g ? h('a', { class: 'lb-play', href: 'play.html?g=' + encodeURIComponent(g.id) }, 'Play ' + g.title, icon('arrow'))
    : h('a', { class: 'lb-play', href: './' }, 'All games', icon('arrow'));
  const fc = view.count - (view.mine ? 1 : 0);
  const counts = state.friends ? `${fc} ${fc === 1 ? 'friend' : 'friends'}${view.mine ? ' and you' : ''} of ${d.total.toLocaleString('en-US')} ${d.total === 1 ? 'player' : 'players'}` : `${d.total.toLocaleString('en-US')} ${d.total === 1 ? 'player' : 'players'}`;
  const when = d.window === 'week' ? ` · this week, since ${weekLabel(d.week)}` : '';
  let line;
  const me = d.me && user && d.me.name.toLowerCase() === user.username.toLowerCase() ? d.me : null;
  if (!user) {
    line = h('p', { class: 'lb-me' }, 'Log in to see where you rank. ', h('button', { type: 'button', class: 'link-btn', onclick: () => openAuthSheet('login') }, 'Log in'));
  } else if (me && me.hidden) {
    line = h('p', { class: 'lb-me' }, 'Your account is not shown on the leaderboards right now.');
  } else if (me && me.pos) {
    line = h('p', { class: 'lb-me' }, h('b', { text: `You are #${me.pos.toLocaleString('en-US')}` }), ` on ${b.label}${d.window === 'week' ? ' this week' : ''} · ${formatValue(b, me.v).title}`);
  } else {
    line = h('p', { class: 'lb-me' }, `You are not on ${b.label}${d.window === 'week' ? ' this week' : ''} yet. ${b.empty || ''}`);
  }
  $('foot').replaceChildren(h('div', { class: 'lb-foot-text' }, line, h('p', { class: 'lb-count', text: counts + when + ' · updates every minute' })), play);
}

async function load({ force = false } = {}) {
  const my = ++seq, b = board();
  clearTimeout(retry); clearTimeout(slow);
  const names = state.friends && friendsBox.status === 'ready' ? friendsBox.names : null;
  if (!force) skeleton(false);
  slow = setTimeout(() => { if (my === seq) skeleton(true); }, 6000);
  try {
    const d = await fetchBoard(b.id, { window: state.window, names, force });
    clearTimeout(slow);
    if (my !== seq) return;
    draw(d);
  } catch (e) {
    clearTimeout(slow);
    if (my !== seq) return;
    if (e && (e.waking || !e.status || e.status >= 500)) {      // asleep or still booting: keep waiting, never an error
      skeleton(true);
      retry = setTimeout(() => load({ force: true }), 15000);
    } else if (e && e.status === 429) {
      $('body').removeAttribute('aria-busy');
      $('body').replaceChildren(h('div', { class: 'lb-empty' }, h('h3', { text: 'One moment' }), h('p', { text: 'That was a lot of boards in a minute. Trying again shortly.' })));
      $('foot').replaceChildren();
      retry = setTimeout(() => load({ force: true }), 20000);
    } else {
      $('body').removeAttribute('aria-busy');
      $('body').replaceChildren(h('div', { class: 'lb-empty' }, h('h3', { text: 'The board is taking a break' }), h('p', { text: errText(e) })));
      $('foot').replaceChildren();
    }
  }
}

// ---------- the owner's hide switch ----------
async function hide(name, hidden) {
  try {
    hiddenNames = await setHidden(name, hidden);
    toast(hidden ? `${name} is off the leaderboards` : `${name} is back on the leaderboards`);
    paintTools();
    load({ force: true });
    return true;
  } catch (e) { toast(errText(e), 'err'); return false; }
}
function openHidden() {
  const sheet = openSheet({ title: 'Hidden from the boards' });
  const list = h('ul', { class: 'lb-hidden-list' });
  const drawList = () => {
    const names = hiddenNames || [];
    list.replaceChildren(...(names.length ? names.map((n) => h('li', {}, avatar(n), h('span', { class: 'lb-name', text: n }),
      h('button', { type: 'button', class: 'fp-mini', onclick: async () => { if (await hide(n, false)) drawList(); } }, icon('eye'), 'Show'))) : [h('li', { class: 'lb-hidden-none', text: 'Nobody is hidden.' })]));
  };
  drawList();
  sheet.body.append(h('p', { class: 'fp-note', text: 'Hidden accounts are left off every Free Period board (their saves are untouched). Use it for scores that are plainly faked.' }), list);
}

// ---------- the Friends filter (chat friends; only when chat is set up and signed in) ----------
async function wireFriends() {
  if (friendsBox.status === 'off') return;
  let client, data;
  try { [client, data] = await Promise.all([import('./chat/client.js'), import('./chat/data.js')]); } catch { friendsBox.status = 'off'; paintTools(); return; }
  friendsBox.client = client; friendsBox.data = data;
  const sync = async (s) => {
    if (s === 'off') { friendsBox.status = 'off'; friendsBox.names = null; if (state.friends) { state.friends = false; load(); } paintTools(); return; }
    if (s !== 'ready') { friendsBox.status = s === 'waking' ? 'loading' : 'idle'; friendsBox.names = null; paintTools(); return; }
    friendsBox.status = 'loading'; paintTools();
    try {
      const rows = await data.listFriends();
      friendsBox.names = rows.filter((r) => r && r.status === 'accepted' && r.profile && typeof r.profile.username === 'string').map((r) => r.profile.username);
      friendsBox.status = 'ready';
    } catch { friendsBox.status = 'idle'; friendsBox.names = null; }
    paintTools();
    if (state.friends) load();
  };
  client.onChatState(sync);
  sync(client.chatState());
  if (session.getToken()) client.ensureChatSession().catch(() => {});
}

// ---------- start ----------
let lastUser = (session.getUser() || {}).username || '';
session.onChange(() => {
  const now = (session.getUser() || {}).username || '';
  if (now === lastUser) { paintTools(); if (current) draw(current); return; }      // (the role the server confirmed: the owner's hide buttons)
  lastUser = now;
  dropCache(); hiddenNames = null; state.friends = false;
  paint();
  load();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && current && Date.now() - (current.at || 0) > 120000) load({ force: true }); });

mountShell(); // the shared header: accent, account chip, Messages, clock, search (opens the home page filtered), ambient background
roving($('tabs'), (id) => { const t = tabById(id); if (t) go({ tab: t.id, board: t.boards[0].id }, { push: true }); });
roving($('chips'), (id) => { if (boardById(id)) go({ board: id }); });
paint();
load();
wireFriends();
session.resume();
