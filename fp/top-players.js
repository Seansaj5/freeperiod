// Home page "Top players" card: one small board per game (its top 3, and my place when I am on it), each linking to that board on
// leaderboards.html. One request for all of them (GET /api/fp/leaderboards). The Bing Ball server may be napping: the card waits
// with skeletons and says so, then tries again; it never shows an error.
import * as session from './session.js';
import { h } from './ui.js';
import { TABS, HOME_BOARDS, boardById, formatValue, fetchSummary, boardLink } from './boards.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(paths, cls, vb = '0 0 24 24') {
  const s = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of [['viewBox', vb], ['aria-hidden', 'true'], ['class', cls], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) s.setAttribute(k, v);
  for (const d of paths) { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
}
const arrow = () => svg(['M5 12h14', 'M13 6l6 6-6 6'], 'ic');
function bell() {
  const s = svg([], 'lb-bell', '0 0 64 64');
  s.setAttribute('stroke', '#c6ff3d'); s.setAttribute('stroke-width', '5');
  for (const d of ['M18 42h28l-3.5-5V27a10.5 10.5 0 0 0-21 0v10z', 'M28 48a4.5 4.5 0 0 0 8 0', 'M32 12v4']) { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p); }
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '47'); c.setAttribute('cy', '17'); c.setAttribute('r', '6'); c.setAttribute('fill', '#3de0ff'); c.setAttribute('stroke', 'none');
  s.append(c);
  return s;
}

// boards.css carries the look; it is fetched with the card (the home page's <head> is not touched for it)
function ensureCss() {
  const href = new URL('../boards.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return Promise.resolve();
  return new Promise((res) => {
    const l = h('link', { rel: 'stylesheet', href });
    l.addEventListener('load', res); l.addEventListener('error', res);
    document.head.append(l);
  });
}

export function mountTopPlayers(root, { games = [] } = {}) {
  if (!root) return;
  const cards = HOME_BOARDS.map(boardById).filter(Boolean).map((b) => ({ b, t: TABS.find((x) => x.id === b.tab) }));
  const gameOf = (t) => (t.game ? games.find((g) => g.id === t.game) || null : null);
  const accent = (t) => { const g = gameOf(t); return g && /^#[0-9a-f]{3,8}$/i.test(g.accent || '') ? g.accent : t.accent; };
  const grid = h('div', { class: 'tp-grid' });
  const note = h('div', { class: 'tp-note', role: 'status' });
  root.hidden = false;
  root.replaceChildren(
    h('div', { class: 'section-head' }, h('h2', { id: 'tops-h', text: 'Top players' }), h('a', { class: 'tp-all', href: 'leaderboards.html' }, h('span', { class: 'tp-long', text: 'All leaderboards' }), h('span', { class: 'tp-short', text: 'See all' }), arrow())),
    grid, note);
  root.setAttribute('aria-labelledby', 'tops-h');

  function head(t, b) {
    const g = gameOf(t);
    return h('div', { class: 'tp-head' },
      g && g.thumb ? h('span', { class: 'tp-art' }, h('img', { src: g.thumb, alt: '', decoding: 'async', loading: 'lazy' })) : h('span', { class: 'tp-art fp' }, bell()),
      h('span', { class: 'tp-title' }, h('strong', { text: t.title }), h('span', { text: b.label })));
  }
  function skeleton(waking) {
    grid.replaceChildren(...cards.map(({ b, t }) => h('a', { class: 'tp-card', href: boardLink(b.id), style: '--accent:' + accent(t), 'aria-busy': 'true' },
      head(t, b),
      h('ol', { class: 'tp-list' }, [1, 2, 3].map((p) => h('li', { class: 'tp-row sk' }, h('span', { class: 'tp-medal', text: String(p) }), h('i', { class: 'bar' })))),
      h('span', { class: 'tp-foot' }, h('span', { text: 'Loading…' }), arrow()))));
    note.replaceChildren(...(waking ? [h('p', { class: 'tp-wake' }, h('i', { class: 'dot', 'aria-hidden': 'true' }), 'Bing Ball is waking up… the boards will be here in a minute.')] : []));
  }
  function draw(sum) {
    const me = (session.getUser() || {}).username || '';
    grid.replaceChildren(...cards.map(({ b, t }) => {
      const x = sum[b.id] || { top: [], total: 0, me: null };
      const rows = [0, 1, 2].map((i) => {
        const e = x.top[i];
        if (!e) return h('li', { class: 'tp-row open' }, h('span', { class: 'tp-medal', text: String(i + 1) }), h('span', { class: 'tp-name', text: i === 0 ? 'Could be you' : 'Open spot' }));
        const f = formatValue(b, e.v), mine = me && e.name.toLowerCase() === me.toLowerCase();
        return h('li', { class: 'tp-row' + (i === 0 ? ' first' : '') + (mine ? ' me' : '') },
          h('span', { class: 'tp-medal', text: String(e.pos) }), h('span', { class: 'tp-name', text: e.name }),
          h('span', { class: 'tp-val', title: f.title }, f.text, f.unit && b.kind !== 'rating' ? h('small', { text: f.unit }) : null));
      });
      const foot = x.me && x.me.pos ? h('span', {}, 'You are ', h('b', { text: '#' + x.me.pos.toLocaleString('en-US') }))
        : h('span', { text: x.total ? `${x.total.toLocaleString('en-US')} ${x.total === 1 ? 'player' : 'players'}` : 'Nobody yet' });
      return h('a', { class: 'tp-card', href: boardLink(b.id), style: '--accent:' + accent(t), 'aria-label': `${t.title} ${b.label} leaderboard` },
        head(t, b), h('ol', { class: 'tp-list' }, rows), h('span', { class: 'tp-foot' }, foot, arrow()));
    }));
    note.replaceChildren();
  }

  let seq = 0, retry = 0, slow = 0, last = null, lastAt = 0;
  async function load() {
    const my = ++seq;
    clearTimeout(retry); clearTimeout(slow);
    if (!last) skeleton(false);
    slow = setTimeout(() => { if (my === seq && !last) skeleton(true); }, 6000);
    try {
      const sum = await fetchSummary();
      clearTimeout(slow);
      if (my !== seq) return;
      last = sum; lastAt = Date.now(); draw(sum);
    } catch (e) {
      clearTimeout(slow);
      if (my !== seq) return;
      if (!last) skeleton(!!(e && (e.waking || !e.status || e.status >= 500)));
      retry = setTimeout(load, e && e.status === 429 ? 30000 : 15000);      // asleep, booting or busy: try again, never an error
    }
  }
  ensureCss().then(load);
  let who = (session.getUser() || {}).username || '';
  session.onChange(() => { const now = (session.getUser() || {}).username || ''; if (now !== who) { who = now; load(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && last && Date.now() - lastAt > 60000) load(); });      // (the server sorts once a minute)
}
