// The live strip under the header: each game's live status (players online), friends playing (chat), the latest
// #announcements post (guests can read it), your streak, and the newest What's new lines. It scrolls like a ticker when
// it is wider than the page (paused on hover, still with reduced motion) and never shows an error: anything that can't
// be reached (Bing Ball asleep, chat off or asleep) is just left out.
// Chat is read with plain requests only (no Realtime socket on this page): the announcement every 5 minutes, friends
// playing every 2 minutes, both only while the tab is visible.
import { h } from './ui.js';
import { icon } from './icons.js';
import { CHAT } from './chat/config.js';
import { WHATS_NEW } from './whatsnew.js';

const ANNOUNCE_MS = 5 * 60000, FRIENDS_MS = 2 * 60000;
const PX_PER_S = 42;

/** First line of a post, without markdown marks, at most 90 characters. Pure: tested. */
export function announceTitle(body, attachments) {
  const line = String(body || '').split('\n').map((l) => l.replace(/[*_`~>#|]+/g, '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
  if (!line) return Array.isArray(attachments) && attachments.length ? 'New picture' : '';
  return line.length > 90 ? line.slice(0, 89).trimEnd() + '…' : line;
}

/**
 * The strip's items, in order. Pure: tested.
 * games: [{ id, title, wakes, status? }]; status: Map id -> watchStatus state; friends: number|null;
 * announcement: string|null; streak: days|null; news: WHATS_NEW-like list (the newest 3 are shown).
 */
export function tickerItems({ games = [], status = new Map(), friends = null, announcement = null, streak = null, news = [] } = {}) {
  const out = [];
  for (const g of games) {
    const st = status.get(g.id);
    if (g.status) {
      if (st && st.state === 'online') out.push({ key: 'g:' + g.id, kind: 'on', icon: 'games', text: g.title, sub: st.players > 0 ? `${st.players} playing` : 'Online', href: 'play.html?g=' + g.id });
      else if (st) out.push({ key: 'g:' + g.id, kind: 'wake', icon: 'games', text: g.title, sub: 'Waking up', href: 'play.html?g=' + g.id });
    } else if (!g.wakes) out.push({ key: 'g:' + g.id, kind: 'solo', icon: 'games', text: g.title, sub: 'Solo ready', href: 'play.html?g=' + g.id });
  }
  if (friends > 0) out.push({ key: 'friends', kind: 'friends', icon: 'users', text: friends === 1 ? '1 friend playing now' : friends + ' friends playing now', href: '#friends-now' });
  if (announcement) out.push({ key: 'ann', kind: 'ann', icon: 'megaphone', text: announcement, sub: '#announcements', href: 'chat.html' });
  if (streak > 0) out.push({ key: 'streak', kind: 'streak', icon: 'flame', text: `Day ${streak} streak`, sub: 'keep it going' });
  for (const n of (Array.isArray(news) ? news : []).slice(0, 3)) out.push({ key: 'new:' + n.id, kind: 'new', icon: 'sparkle', text: 'New: ' + n.title, href: n.href || '#whatsnew' });
  return out;
}

function itemEl(it) {
  const inner = [h('span', { class: 'ls-ic', 'aria-hidden': 'true' }, it.kind === 'on' || it.kind === 'wake' || it.kind === 'solo' ? h('i', { class: 'ls-led' }) : icon(it.icon)),
    h('span', { class: 'ls-t', text: it.text }), it.sub ? h('span', { class: 'ls-s', text: it.sub }) : null];
  return it.href ? h('a', { class: 'ls-item k-' + it.kind, href: it.href }, inner) : h('span', { class: 'ls-item k-' + it.kind }, inner);
}

/** Mounts the strip in `el`. Returns { setStatus(gameId, state), setStreak(days) }. */
export function mountTicker(el, { games = [] } = {}) {
  const status = new Map();
  const st = { friends: null, announcement: null, streak: null };
  const view = h('div', { class: 'ls-view' });
  el.replaceChildren(h('div', { class: 'wrap ls-in' },
    h('span', { class: 'ls-label' }, h('i', { class: 'ls-pulse', 'aria-hidden': 'true' }), 'Live'), view));
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Live on Free Period');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)');
  let sig = '';

  function draw() {
    const items = tickerItems({ games, status, ...st, news: WHATS_NEW });
    const next = JSON.stringify(items);
    if (next === sig) return;
    sig = next;
    el.hidden = !items.length;
    if (!items.length) return;
    const group = () => h('div', { class: 'ls-group' }, items.map(itemEl));
    const track = h('div', { class: 'ls-track' }, group());
    view.replaceChildren(track);
    view.classList.remove('moving');
    // only scroll when it doesn't fit; a second copy makes the loop seamless (hidden from screen readers and Tab)
    requestAnimationFrame(() => {
      const w = track.firstChild.scrollWidth;
      if (w <= view.clientWidth || (reduced && reduced.matches)) return;
      const copy = group();
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
      track.append(copy);
      track.style.setProperty('--ls-dur', Math.round(w / PX_PER_S) + 's');
      view.classList.add('moving');
    });
  }
  let resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { sig = ''; draw(); }, 250); }, { passive: true });

  if (CHAT && CHAT.url && CHAT.key) {
    Promise.all([import('./chat/client.js'), import('./chat/data.js')]).then(([client, data]) => {
      let annAt = 0, frAt = 0, annCh = null;
      async function announcement() {
        annAt = Date.now();
        try {
          if (annCh == null) {
            const chans = await data.listChannels();
            const c = (chans || []).find((x) => x.name === 'announcements') || (chans || []).find((x) => x.owner_only);
            annCh = c ? c.id : false;
          }
          if (!annCh) return;
          const rows = await data.loadMessages({ channel: annCh }, { limit: 3 });
          const last = [...(rows || [])].reverse().find((m) => !m.deleted);
          st.announcement = last ? announceTitle(last.body, last.attachments) || null : null;
        } catch { annCh = null; /* asleep or unreachable: leave it out */ }
        draw();
      }
      async function friends() {
        frAt = Date.now();
        if (client.chatState() !== 'ready') { st.friends = null; draw(); return; }
        try {
          const rows = await data.friendsPlaying();
          st.friends = new Set((rows || []).filter((r) => r && games.some((g) => g.id === r.game)).map((r) => r.user_id)).size;
        } catch { st.friends = null; }
        draw();
      }
      function due() {
        if (document.hidden) return;
        if (Date.now() - annAt >= ANNOUNCE_MS) announcement();
        if (Date.now() - frAt >= FRIENDS_MS) friends();
      }
      client.onChatState((s) => { if (s === 'ready') friends(); else if (st.friends != null) { st.friends = null; draw(); } });
      document.addEventListener('visibilitychange', due);
      setInterval(due, 30000);
      announcement();
      if (client.chatState() === 'ready') friends();
    }).catch(() => { /* chat is optional */ });
  }
  draw();
  return {
    setStatus(id, state) { status.set(id, state); draw(); },
    setStreak(days) { st.streak = days > 0 ? days : null; draw(); },
  };
}
