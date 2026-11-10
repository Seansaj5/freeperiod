// Home header "Messages" button: icon + unread count, links to chat.html, hidden while chat is off.
// With no chat config (chat not set up) it stays hidden and loads nothing else: no client, no styles, no network.
import { h } from '../ui.js';
import { CHAT } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function chatIcon() {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'cx-hb-ic');
  for (const [k, v] of [['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) s.setAttribute(k, v);
  for (const d of ['M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.6A7.5 7.5 0 1 1 20 11.5z', 'M8.5 11.5h.01', 'M12 11.5h.01', 'M15.5 11.5h.01']) {
    const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p);
  }
  return s;
}
// chat.css carries the button's look; it is only fetched once chat exists.
function ensureCss() {
  const href = new URL('../../chat.css', import.meta.url).href;
  const have = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href === href);
  if (have) return Promise.resolve();
  return new Promise((res) => {
    const l = h('link', { rel: 'stylesheet', href });
    l.addEventListener('load', res); l.addEventListener('error', res);
    document.head.append(l);
  });
}

export function mountChatButton(el) {
  if (!el) return;
  el.hidden = true;
  if (!CHAT || !CHAT.url || !CHAT.key) return;
  const count = h('span', { class: 'cx-hb-count', hidden: true });
  const label = h('span', { class: 'cx-hb-label', text: 'Messages' });
  const a = h('a', { class: 'cx-hb', href: 'chat.html', title: 'Messages', 'aria-label': 'Messages' }, chatIcon(), label, count);
  el.replaceChildren(a);
  Promise.all([import('./client.js'), import('./data.js'), import('./unread.js'), ensureCss()]).then(([client, data, unread]) => {
    let timer = 0;
    function show(b) {
      count.hidden = !b.dot;
      count.classList.toggle('dot', b.dot && !b.text);
      count.textContent = b.text;
      a.setAttribute('aria-label', 'Messages' + (b.text ? ', ' + b.text + ' mentions' : b.dot ? ', unread messages' : ''));
    }
    async function refresh() {
      if (client.chatState() !== 'ready' || document.hidden) return;
      try {
        const rows = await data.unreadCounts();
        let u = 0, m = 0;
        // a DM counts like a mention (a number), as on the play-page Chat button and in chat itself
        for (const r of Array.isArray(rows) ? rows : []) { u += r.unread || 0; m += String(r.target).startsWith('d:') ? (r.unread || 0) : (r.mentions || 0); }
        show(unread.badge({ unread: u, mentions: m }));
      } catch { /* keep the last count */ }
    }
    function draw(s) {
      el.hidden = s === 'off';
      clearInterval(timer);
      if (s === 'ready') { refresh(); timer = setInterval(refresh, 45000); } else show({ dot: false, text: '' });
    }
    client.onChatState(draw);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    draw(client.chatState());
    client.ensureChatSession().catch(() => {});
  }).catch(() => { el.hidden = true; });
}
