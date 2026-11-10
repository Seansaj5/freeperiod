// The home page's What's new panel (the list lives in fp/whatsnew.js).
import { h } from './ui.js';
import { icon } from './icons.js';
import { WHATS_NEW, newIds, readSeen, markSeen, dayLabel } from './whatsnew.js';

const SHOW = 4;

export function mountWhatsNew(el, { games = [] } = {}) {
  if (!el) return;
  const fresh = newIds(WHATS_NEW, readSeen());
  const byGame = new Map(games.map((g) => [g.id, g]));
  let open = false;
  function item(n) {
    const g = byGame.get(n.game);
    const accent = g && /^#[0-9a-f]{3,8}$/i.test(g.accent || '') ? g.accent : 'var(--lime)';
    const isNew = fresh.has(n.id);
    const body = [
      h('span', { class: 'wn-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'wn-main' },
        h('span', { class: 'wn-top' },
          h('b', { class: 'wn-title', text: n.title }),
          isNew ? h('span', { class: 'wn-new', text: 'New' }) : null),
        h('span', { class: 'wn-text', text: n.text }),
        h('span', { class: 'wn-meta' }, h('span', { class: 'wn-game', text: g ? g.title : 'Free Period' }), h('span', { text: dayLabel(n.date) }))),
    ];
    return h('li', { class: 'wn-item' + (isNew ? ' is-new' : ''), style: '--wn:' + accent },
      n.href ? h('a', { class: 'wn-row', href: n.href }, body) : h('div', { class: 'wn-row' }, body));
  }
  function draw() {
    const list = open ? WHATS_NEW : WHATS_NEW.slice(0, SHOW);
    const more = WHATS_NEW.length > SHOW
      ? h('button', { type: 'button', class: 'hp-more', 'aria-expanded': open ? 'true' : 'false', onclick: () => { open = !open; draw(); } },
        open ? 'Show less' : `Show all ${WHATS_NEW.length}`)
      : null;
    el.replaceChildren(
      h('div', { class: 'hp-head' },
        h('span', { class: 'hp-ic', 'aria-hidden': 'true' }, icon('sparkle')),
        h('h2', { id: 'whatsnew-h', text: "What's new" }),
        fresh.size ? h('span', { class: 'hp-badge', text: fresh.size + ' new' }) : null),
      h('ol', { class: 'wn-list' }, list.map(item)),
      more);
  }
  draw();
  // seen once it has been on screen a moment: the next visit only marks what came after
  const seen = () => setTimeout(() => markSeen(WHATS_NEW), 2500);
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); seen(); } });
    io.observe(el);
  } else seen();
}
