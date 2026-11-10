// Play-page chat overlay: a button in the top bar opens a side panel over the game (the game keeps running).
// With chat not set up (empty config) nothing is shown or loaded. Once configured, the chat app itself is lazy-loaded
// on first open; closing hides and pauses it (no Realtime connection while closed; unsent messages and drafts stay).
// While closed, a poll every minute keeps the unread badge and pops up new DMs and @mentions (max one per 3 s), which
// open the conversation.
import { h } from '../ui.js';
import { CHAT } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function chatIcon() {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  for (const [k, v] of [['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2.2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) s.setAttribute(k, v);
  for (const d of ['M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.6A7.5 7.5 0 1 1 20 11.5z', 'M8.5 11.5h.01', 'M12 11.5h.01', 'M15.5 11.5h.01']) {
    const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p);
  }
  return s;
}
function ensureCss(rel) {
  const href = new URL(rel, import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return Promise.resolve();
  return new Promise((res) => {
    const l = h('link', { rel: 'stylesheet', href });
    l.addEventListener('load', res); l.addEventListener('error', res);
    document.head.append(l);
  });
}

const NOOP = { open() {}, close() {}, toggle() {}, get isOpen() { return false; } };
const REFRESH_MS = 60000;

export function mountChatOverlay(bar) {
  const slot = bar && bar.querySelector('#chat-btn');
  if (!slot) return NOOP;
  slot.hidden = true;
  if (!CHAT || !CHAT.url || !CHAT.key) return NOOP; // chat off: no button, no requests

  let mods = null;      // { client, data, unread, toast }
  let panel = null;
  let app = null;
  let isOpen = false;
  let epoch = 0;        // bumps on every open/close so late async work gives up
  let host = null;
  let pending = null;   // target to open once the app has its channels

  const count = h('span', { class: 'fpco-count', hidden: true });
  const btn = h('button', { type: 'button', class: 'tool fpco-btn', id: 'chat-open', title: 'Chat', 'aria-label': 'Chat', 'aria-expanded': 'false', 'aria-haspopup': 'dialog' },
    chatIcon(), h('span', { class: 'label', text: 'Chat' }), count);
  slot.classList.add('fpco-slot');
  slot.replaceChildren(btn);
  btn.addEventListener('click', () => api.toggle());

  const loadMods = () => {
    if (!mods) {
      mods = Promise.all([import('./client.js'), import('./data.js'), import('./unread.js'), import('./toast.js'), ensureCss('../../chat.css'), ensureCss('./overlay.css')])
        .then(([client, data, unread, toast]) => ({ client, data, unread, toast }));
      mods.catch(() => { mods = null; });
    }
    return mods;
  };

  // ---------- badge + pop-ups (closed only) ----------
  // While the panel is closed the page holds NO Realtime connection (the free plan allows 200 at once: they are for people
  // actually chatting). The unread counts are polled every minute instead (and when the page comes back into view or the
  // panel closes), and a DM or an @mention that came in since the last look pops up, with its latest message.
  const counts = { unread: 0, mentions: 0 };
  let M = null, timer = 0, gen = 0, seen = null, chanName = new Map();
  function drawBadge() {
    const b = isOpen ? { dot: false, text: '' } : M.unread.badge(counts);
    count.hidden = !b.dot;
    count.classList.toggle('dot', b.dot && !b.text);
    count.textContent = b.text;
    btn.setAttribute('aria-label', 'Chat' + (b.text ? ', ' + b.text + ' mentions' : b.dot ? ', unread messages' : ''));
  }
  const targetOf = (key) => (key.startsWith('d:') ? { dm: key.slice(2) } : { channel: Number(key.slice(2)) });
  async function refresh() {
    if (!M || M.client.chatState() !== 'ready' || document.hidden) return;
    const g = gen;
    try {
      const rows = await M.data.unreadCounts();
      if (g !== gen) return;
      let u = 0, m = 0;
      const now = new Map();
      for (const r of Array.isArray(rows) ? rows : []) {
        if (!r || !r.target) continue;
        const dm = String(r.target).startsWith('d:');
        const hot = dm ? (r.unread || 0) : (r.mentions || 0); // a DM always counts like a mention
        u += r.unread || 0; m += hot;
        now.set(r.target, hot);
      }
      counts.unread = u; counts.mentions = m; drawBadge();
      const before = seen;
      seen = now;
      if (before && !isOpen) for (const [key, hot] of now) if (hot > (before.get(key) || 0)) { popUp(key, g); break; } // one pop-up per look
    } catch { /* keep the last count */ }
  }
  async function popUp(key, g) {
    try {
      const target = targetOf(key);
      const [rows, bl] = await Promise.all([M.data.loadMessages(target, { limit: 1 }), Promise.resolve().then(() => M.data.listBlocks()).catch(() => [])]);
      const row = Array.isArray(rows) ? rows[rows.length - 1] : null;
      const me = M.client.me();
      const blocked = new Set((bl || []).map((b) => (b && typeof b === 'object' ? b.blocked || b.id : b)));
      if (g !== gen || isOpen || !row || row.deleted || !me || row.author_id === me.id || blocked.has(row.author_id)) return;
      if (!target.dm && !chanName.size) { try { for (const c of await M.data.listChannels()) chanName.set(c.id, c.name); } catch { /* label falls back */ } }
      if (g !== gen || isOpen) return;
      const a = row.author || {};
      const name = a.display_name || a.name || a.username || 'Someone';
      M.toast.chatToast({
        title: target.dm ? name : name + ' in #' + (chanName.get(target.channel) || 'chat'),
        body: row.body || (Array.isArray(row.attachments) && row.attachments.length ? 'Sent a picture' : ''),
        onClick: () => api.open(target),
      });
    } catch { /* no pop-up this time */ }
  }
  function unwatch() {
    gen++;
    clearInterval(timer); timer = 0;
    seen = null; chanName = new Map();
    counts.unread = counts.mentions = 0;
    if (M) drawBadge();
  }
  function draw(s) {
    slot.hidden = s === 'off';
    unwatch();
    if (s === 'ready') { refresh(); timer = setInterval(refresh, REFRESH_MS); }
    else if (s === 'off' && isOpen) api.close();
    if (s === 'off') teardown();
  }
  loadMods().then((m) => {
    M = m;
    m.client.onChatState(draw);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !isOpen) refresh(); });
    draw(m.client.chatState());
    m.client.ensureChatSession().catch(() => {});
  }).catch(() => { slot.hidden = true; });

  // ---------- panel ----------
  function onKey(e) {
    if (e.key === 'Escape' && isOpen && !e.defaultPrevented && !document.querySelector('.fp-sheet, .fp-back, .cx-emoji, .cx-lb')) { e.preventDefault(); api.close(); }
  }
  document.addEventListener('keydown', onKey);

  // A game that grabs focus by itself (right after opening the panel, or when its page finishes loading) must not take the
  // keyboard from the panel: if the frame wins focus in that window, give it straight back to the message box.
  // Real intent toward the game (pointer over / pressed on / touched in the stage) drops the guard at once.
  let guardUntil = 0, toGame = false;
  const guard = () => { guardUntil = Date.now() + 2500; toGame = false; };
  const stage = document.getElementById('stage');
  if (stage) {
    const intent = () => { toGame = true; guardUntil = 0; };
    stage.addEventListener('pointerdown', intent, true);
    stage.addEventListener('touchstart', intent, { capture: true, passive: true });
    stage.addEventListener('pointerover', intent, true);
    stage.addEventListener('pointerout', (e) => { if (!stage.contains(e.relatedTarget)) toGame = false; }, true);
  }
  document.addEventListener('load', (e) => { if (isOpen && e.target && e.target.tagName === 'IFRAME') guard(); }, true);
  addEventListener('blur', () => {
    if (!isOpen || toGame || Date.now() > guardUntil) return;
    setTimeout(() => {
      if (!isOpen || toGame || !document.activeElement || document.activeElement.tagName !== 'IFRAME') return;
      const box = panel && panel.querySelector('textarea');
      (box || panel).focus({ preventScroll: true });
    }, 0);
  });

  function teardown() {
    if (app) { try { app.destroy(); } catch { /* ignore */ } app = null; }
    if (host) { host.remove(); host = null; }
  }

  // The app is made on the first open and then only hidden and paused on close (no Realtime while closed): unsent
  // messages, drafts and the loaded conversations are all there again on the next open, which only catches up.
  async function mountApp(my) {
    let m;
    try { m = await loadMods(); } catch { api.close(); return; }
    if (my !== epoch) return;
    if (app) app.resume();
    else {
      const { mountChatApp } = await import('./app.js');
      if (my !== epoch) return;
      if (!app) {
        host = h('div', { class: 'fpco-host' });
        panel.append(host);
        app = mountChatApp(host, { compact: true });
      }
    }
    // Hold the keyboard in this page: the app has no channel yet, so focus the panel itself (the game frame loses it),
    // then the message box once it exists (not on touch screens: it would raise the keyboard).
    const fine = !matchMedia('(pointer: coarse)').matches;
    let tries = 0;
    const settle = setInterval(() => {
      if (my !== epoch) return clearInterval(settle);
      tries++;
      const ready = panel.querySelector('.cx-side button, .cx-side a');
      if (ready && pending) { const t = pending; pending = null; try { app.open(t); } catch { /* ignore */ } }
      const box = panel.querySelector('textarea');
      if (box && fine && (document.activeElement === panel || document.activeElement === document.body)) box.focus();
      if ((ready && !pending && (box || !fine)) || tries > 40) clearInterval(settle);
    }, 150);
  }

  // Fullscreen shows only the fullscreen element's subtree: carry the panel (and pop-ups) into it, and back out again.
  function place() {
    if (!panel) return;
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    const home = fs && fs !== document.documentElement ? fs : (bar.closest('.player') || document.body);
    if (panel.parentNode !== home) home.append(panel);
    panel.classList.toggle('fs', home !== bar.closest('.player'));
  }
  document.addEventListener('fullscreenchange', place);
  document.addEventListener('webkitfullscreenchange', place);

  const api = {
    get isOpen() { return isOpen; },
    open(target) {
      if (slot.hidden) return;
      pending = target || null;
      if (isOpen) { if (app && pending) { try { app.open(pending); pending = null; } catch { /* ignore */ } } return; }
      isOpen = true;
      guard();
      const my = ++epoch;
      if (!panel) {
        panel = h('div', { class: 'fpco-panel', id: 'chat-panel', role: 'dialog', 'aria-label': 'Chat', tabindex: '-1' });
        place();
      }
      place();
      btn.setAttribute('aria-expanded', 'true');
      if (M) drawBadge();
      // Pull keyboard focus out of the game frame right away.
      panel.classList.add('open');
      panel.focus({ preventScroll: true });
      mountApp(my);
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      const my = ++epoch;
      pending = null;
      btn.setAttribute('aria-expanded', 'false');
      if (panel) panel.classList.remove('open');
      // Back to the game: it gets the keyboard again.
      const frame = document.querySelector('.stage iframe');
      if (frame) frame.focus();
      if (app) { try { app.pause(); } catch { /* ignore */ } }
      if (M) { drawBadge(); setTimeout(() => { if (!isOpen && my === epoch) refresh(); }, 900); }
    },
    toggle() { isOpen ? api.close() : api.open(); },
  };
  return api;
}
