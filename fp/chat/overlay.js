// Play-page chat overlay: a button in the top bar opens a side panel over the game (the game keeps running).
// With chat not set up (empty config) nothing is shown or loaded. Once configured, the chat app itself is lazy-loaded
// on first open and torn down (app.destroy()) after every close. While closed it watches for new DMs and @mentions:
// unread badge on the button and small pop-ups (max one per 3 s) that open the conversation.
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
const REFRESH_MS = 45000;

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
  let destroyTimer = 0;
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
  const counts = { unread: 0, mentions: 0 };
  let M = null, timer = 0, stops = [], watched = new Set(), names = new Map(), chanName = new Map(), blocked = new Set(), gen = 0;
  function drawBadge() {
    const b = isOpen ? { dot: false, text: '' } : M.unread.badge(counts);
    count.hidden = !b.dot;
    count.classList.toggle('dot', b.dot && !b.text);
    count.textContent = b.text;
    btn.setAttribute('aria-label', 'Chat' + (b.text ? ', ' + b.text + ' mentions' : b.dot ? ', unread messages' : ''));
  }
  async function refresh() {
    if (!M || M.client.chatState() !== 'ready' || document.hidden) return;
    const g = gen;
    try {
      const rows = await M.data.unreadCounts();
      if (g !== gen) return;
      let u = 0, m = 0;
      for (const r of Array.isArray(rows) ? rows : []) {
        u += r.unread || 0;
        m += String(r.target).startsWith('d:') ? (r.unread || 0) : (r.mentions || 0); // a DM always counts like a mention
      }
      counts.unread = u; counts.mentions = m; drawBadge();
    } catch { /* keep the last count */ }
    watch();
  }
  async function who(id) {
    if (names.has(id)) return names.get(id);
    let n = '';
    try {
      const list = await M.data.listMembers();
      for (const p of list || []) names.set(p.id, p.display_name || p.name || p.username);
      n = names.get(id) || '';
      if (!n) { const p = await M.data.getProfile(id); n = p ? (p.display_name || p.name || p.username || '') : ''; names.set(id, n); }
    } catch { /* fall back */ }
    return n || 'Someone';
  }
  async function incoming(target, row, label) {
    if (isOpen || !row || row.deleted || !M) return;
    const me = M.client.me();
    if (!me || row.author_id === me.id || blocked.has(row.author_id)) return;
    const isDM = !!target.dm;
    const mention = isDM || row.mentions_everyone || new RegExp('(^|[^\\w])@' + me.username.replace(/[^\w]/g, '') + '(?![\\w])', 'i').test(row.body || '');
    counts.unread++; if (mention) counts.mentions++;
    drawBadge();
    if (!mention) return;
    const g = gen;
    const name = row.author && (row.author.display_name || row.author.username) || await who(row.author_id);
    if (g !== gen || isOpen) return;
    M.toast.chatToast({
      title: isDM ? name : name + ' in #' + label,
      body: row.body || (Array.isArray(row.attachments) && row.attachments.length ? 'Sent a picture' : ''),
      onClick: () => api.open(target),
    });
  }
  async function watch() {
    const g = gen;
    try {
      const [chs, dms, bl] = await Promise.all([
        M.data.listChannels(), Promise.resolve().then(() => M.data.listDMs()).catch(() => []), Promise.resolve().then(() => M.data.listBlocks()).catch(() => []),
      ]);
      if (g !== gen) return;
      blocked = new Set((bl || []).map((b) => (b && typeof b === 'object' ? b.blocked || b.id : b)));
      for (const c of chs || []) chanName.set(c.id, c.name);
      const add = (key, target, label) => {
        if (watched.has(key)) return;
        watched.add(key);
        try { const stop = M.data.subscribe(target, { insert: (row) => incoming(target, row, label) }); if (typeof stop === 'function') stops.push(stop); } catch { watched.delete(key); }
      };
      for (const c of chs || []) add('c:' + c.id, { channel: c.id }, c.name);
      for (const d of dms || []) add('d:' + d.id, { dm: d.id }, '');
    } catch { /* try again on the next refresh */ }
  }
  function unwatch() {
    gen++;
    for (const s of stops) { try { s(); } catch { /* ignore */ } }
    stops = []; watched = new Set(); clearInterval(timer);
    counts.unread = counts.mentions = 0;
    if (M) drawBadge();
  }
  function draw(s) {
    slot.hidden = s === 'off';
    unwatch();
    if (s === 'ready') { refresh(); timer = setInterval(refresh, REFRESH_MS); }
    else if (s === 'off' && isOpen) api.close();
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
  let guardUntil = 0;
  const guard = () => { guardUntil = Date.now() + 2500; };
  document.addEventListener('load', (e) => { if (isOpen && e.target && e.target.tagName === 'IFRAME') guard(); }, true);
  addEventListener('blur', () => {
    if (!isOpen || Date.now() > guardUntil) return;
    setTimeout(() => {
      if (!isOpen || !document.activeElement || document.activeElement.tagName !== 'IFRAME') return;
      const box = panel && panel.querySelector('textarea');
      (box || panel).focus({ preventScroll: true });
    }, 0);
  });

  function teardown() {
    if (app) { try { app.destroy(); } catch { /* ignore */ } app = null; }
    if (host) { host.remove(); host = null; }
  }

  async function mountApp(my) {
    let m;
    try { m = await loadMods(); } catch { api.close(); return; }
    if (my !== epoch) return;
    const { mountChatApp } = await import('./app.js');
    if (my !== epoch) return;
    clearTimeout(destroyTimer);
    teardown();
    host = h('div', { class: 'fpco-host' });
    panel.append(host);
    app = mountChatApp(host, { compact: true });
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
      if (box && fine && (document.activeElement === panel || document.activeElement === document.body || document.activeElement.tagName === 'IFRAME')) box.focus();
      if ((ready && !pending && (box || !fine)) || tries > 40) clearInterval(settle);
    }, 150);
  }

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
        (bar.closest('.player') || document.body).append(panel);
      }
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
      clearTimeout(destroyTimer);
      destroyTimer = setTimeout(() => {
        if (my !== epoch) return;
        teardown();
      }, 230);
      if (M) { drawBadge(); setTimeout(() => { if (!isOpen) refresh(); }, 900); }
    },
    toggle() { isOpen ? api.close() : api.open(); },
  };
  return api;
}
