// The chat app: rail, channel list, messages, composer, members, status banners. Used by the Messages page
// (chat.html) and, with { compact: true }, by the play-page overlay (one panel at a time, no title or history changes).
import { h, toast } from '../ui.js';
import * as session from '../session.js';
import { chatState, onChatState, ensureChatSession, me as chatMe, chatError as sessionError } from './client.js';
import * as data from './data.js';
import { tabTitle, badge } from './unread.js';
import { mentionsMe } from './format.js';
import { newClientId } from './feedlogic.js';
import { mountRail } from './views/rail.js';
import { mountChannels } from './views/channels.js';
import { mountMessages } from './views/messages.js';
import { mountComposer } from './views/composer.js';
import { mountMembers } from './views/members.js';
import { icon, bellLogo, nameOf, roleOf } from './views/common.js';

const BASE_TITLE = 'Messages · Free Period';
const LAST_KEY = 'fp.chat.last';
const MEMBERS_KEY = 'fp.chat.members';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const idsOf = (x) => {
  if (!x) return [];
  if (x instanceof Set) return [...x];
  if (Array.isArray(x)) return x.map((v) => (v && typeof v === 'object' ? v.id || v.user_id || v.blocked : v)).filter(Boolean);
  if (typeof x === 'object') return Object.keys(x);
  return [];
};

export function mountChatApp(root, { compact = false } = {}) {
  root.classList.add('cx');
  if (compact) root.classList.add('compact');
  const offEl = h('div', { class: 'cx-off', hidden: true });
  const banner = h('div', { class: 'cx-banner', hidden: true, role: 'status' });
  const railEl = h('nav');
  const sideEl = h('aside');
  const headEl = h('header', { class: 'cx-head' });
  const feedEl = h('div');
  const typingEl = h('div', { class: 'cx-typing', 'aria-live': 'polite' });
  const compEl = h('div');
  const membersEl = h('aside');
  const main = h('section', { class: 'cx-main', 'aria-label': 'Messages' }, headEl, feedEl, h('div', { class: 'cx-bottom' }, typingEl, compEl));
  const navEl = h('div', { class: 'cx-nav' }, railEl, sideEl);
  const scrim = h('div', { class: 'cx-scrim', onclick: () => setMembers(false) });
  const shell = h('div', { class: 'cx-shell' }, navEl, main, scrim, membersEl);
  root.replaceChildren(banner, shell, offEl);

  // ---------- state ----------
  let st = null;               // chat state from client.js
  let conn = 'live';           // 'live' | 'reconnecting'
  let mode = 'server';         // rail: 'server' | 'dms'
  let channels = [];
  let cur = null;              // open channel
  let members = [];
  const byId = new Map();
  let usernames = new Set();
  let online = new Set();
  let blocked = new Set();
  const unread = new Map();    // 'c:<id>' -> { unread, mentions }
  let subs = [];
  let presenceH = null;
  let typingH = null;
  let gen = 0;                 // bumps on every (re)start so late answers are dropped
  let started = '';            // '' | 'ready:<uid>' | 'guest'
  let lastUid = null;          // account of the previous start (null before the first)
  let loading = false;
  let viewVersion = 0;
  let layout = compact ? 'narrow' : 'wide';
  let panel = 'chat';
  let membersOpen = store.get(MEMBERS_KEY) !== '0';

  const myId = () => (chatMe() && chatMe().id) || '';
  const myProfile = () => byId.get(myId()) || (chatMe() ? { id: myId(), username: chatMe().username } : null);
  const isStaff = () => { const r = roleOf(myProfile()); const hub = session.getUser(); return !!r || (!!hub && (hub.role === 'owner' || hub.role === 'admin')); };
  const guest = () => st === 'guest';
  const openLogin = () => import('../account-ui.js').then((m) => m.openAuthSheet('login')).catch(() => { location.href = './'; });

  // ---------- views ----------
  const rail = mountRail(railEl, { homeLink: !compact, onServer: () => setMode('server'), onDMs: () => setMode('dms') });
  const side = mountChannels(sideEl, { onPick: (c) => openChannel(c, true) });
  const memberList = mountMembers(membersEl, { onBack: () => goBack() });
  const messages = mountMessages(feedEl, {
    me: () => (chatMe() ? { id: myId(), username: chatMe().username } : null),
    profile: (id) => byId.get(id) || null,
    usernames: () => usernames,
    isBlocked: (id) => blocked.has(id),
    canReact: () => st === 'ready',
    version: () => viewVersion,
    onReply: (m) => composer.setReply(m),
    onRead: (t) => markRead(t),
  });
  const composer = mountComposer(compEl, { onSend: send, onTyping: pingTyping, onLogin: openLogin });

  // ---------- layout: wide (rail + channels + chat + members), mid (members as a drawer), narrow (one panel) ----------
  function setLayout(w) {
    const next = compact || w < 700 ? 'narrow' : w < 1100 ? 'mid' : 'wide';
    if (next === layout && root.dataset.layout) return;
    layout = next;
    root.dataset.layout = layout;
    // Wide screens remember whether the member list is shown; mid width starts with the drawer closed.
    membersOpen = layout === 'wide' ? store.get(MEMBERS_KEY) !== '0' : false;
    drawPanels();
  }
  function drawPanels() {
    root.dataset.panel = layout === 'narrow' ? panel : '';
    const showMembers = (st === 'ready' || st === 'waking') && (layout === 'narrow' ? panel === 'members' : membersOpen);
    root.classList.toggle('members-open', showMembers);
    membersBtn.setAttribute('aria-pressed', showMembers ? 'true' : 'false');
  }
  function setPanel(p, push = true) {
    if (panel === p) return;
    if (push && !compact && layout === 'narrow' && p !== 'nav') { try { history.pushState({ cxPanel: p }, ''); } catch { /* ignore */ } }
    panel = p;
    drawPanels();
  }
  function goBack() {
    if (layout !== 'narrow') { setMembers(false); return; }
    const target = panel === 'members' ? 'chat' : 'nav';
    if (!compact && history.state && history.state.cxPanel === panel) history.back();
    else setPanel(target, false);
  }
  function setMembers(on) {
    if (layout === 'narrow') { setPanel(on ? 'members' : 'chat'); return; }
    membersOpen = on;
    if (layout === 'wide') store.set(MEMBERS_KEY, on ? '1' : '0');
    drawPanels();
  }
  const onPop = (e) => { if (layout === 'narrow') { panel = (e.state && e.state.cxPanel) || (panel === 'members' ? 'chat' : 'nav'); drawPanels(); } };
  if (!compact) addEventListener('popstate', onPop);

  // ---------- header ----------
  const backBtn = h('button', { type: 'button', class: 'cx-iconbtn cx-back', 'aria-label': 'Back to channels', onclick: () => goBack() }, icon('back'));
  const headEmoji = h('span', { class: 'cx-head-emoji', 'aria-hidden': 'true' });
  const headName = h('h1', { class: 'cx-head-name' });
  const headLock = h('span', { class: 'cx-head-lock', title: 'Only Sean and mods post here', hidden: true }, icon('lock'));
  const headTopic = h('p', { class: 'cx-head-topic' });
  const membersBtn = h('button', { type: 'button', class: 'cx-iconbtn cx-members-btn', 'aria-label': 'Members', title: 'Members', 'aria-pressed': 'false',
    onclick: () => setMembers(!root.classList.contains('members-open')) }, icon('users'), h('span', { class: 'cx-members-n' }));
  headEl.append(backBtn, h('div', { class: 'cx-head-title' }, headEmoji, headName, headLock), headTopic, h('span', { class: 'cx-head-gap' }), membersBtn);
  function drawHead() {
    if (mode === 'dms') { headEmoji.textContent = ''; headName.textContent = 'Direct messages'; headLock.hidden = true; headTopic.textContent = ''; }
    else if (cur) { headEmoji.textContent = cur.emoji || '#'; headName.textContent = cur.name; headLock.hidden = !cur.owner_only; headTopic.textContent = cur.topic || ''; }
    else { headEmoji.textContent = ''; headName.textContent = st === 'waking' ? 'Connecting…' : st === 'off' ? '' : 'Free Period'; headLock.hidden = true; headTopic.textContent = ''; }
    membersBtn.hidden = guest() || st !== 'ready';
    membersBtn.lastChild.textContent = online.size ? String(online.size) : '';
  }

  // Size changes (window, overlay panel) pick the layout.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => setLayout(es[0].contentRect.width)) : null;
  if (ro) ro.observe(root); else setLayout(root.clientWidth || innerWidth);
  setLayout(root.clientWidth || innerWidth);

  // ---------- banners ----------
  function drawBanner() {
    let kind = null;
    if (st === 'waking' || st === 'asleep' || st === 'error' || st === 'guest') kind = st;
    else if (st === 'ready' && conn === 'reconnecting') kind = 'reconnecting';
    banner.hidden = !kind;
    root.classList.toggle('has-banner', !!kind);
    if (!kind) return;
    banner.className = 'cx-banner ' + kind;
    const owner = (session.getUser() || {}).role === 'owner' || roleOf(myProfile()) === 'owner';
    const B = {
      waking: [h('i', { class: 'cx-spin' }), 'Waking up chat…', 'First sign-in on this device starts up the game server. This can take up to a minute.'],
      asleep: [icon('moon'), 'Chat is asleep', owner ? 'It naps after a week with nobody chatting. Open the Supabase dashboard, pick free-period-chat and press Restore.'
        : 'It naps after a quiet week. Sean can wake it up, so check back soon.'],
      error: [icon('alert'), sessionError() || 'Chat can’t be reached right now', 'Check your connection, then try again.'],
      reconnecting: [h('i', { class: 'cx-spin' }), 'Reconnecting…', 'Anything you send now goes out when the connection is back.'],
      guest: [icon('sparkle'), 'You’re reading as a guest', 'Announcements and rules are open to everyone. Log in to chat, react and see every channel.'],
    }[kind];
    const action = kind === 'guest' ? h('button', { type: 'button', class: 'cx-btn', onclick: openLogin }, icon('login'), 'Log in to chat')
      : kind === 'error' ? h('button', { type: 'button', class: 'cx-btn ghost', onclick: () => ensureChatSession() }, icon('retry'), 'Try again') : null;
    banner.replaceChildren(...[h('span', { class: 'cx-banner-ic', 'aria-hidden': 'true' }, B[0]),
      h('div', { class: 'cx-banner-text' }, h('strong', { text: B[1] }), h('span', { text: B[2] })), action].filter(Boolean));
  }

  function drawOff() {
    offEl.replaceChildren(h('div', { class: 'cx-off-card' },
      h('div', { class: 'cx-off-art', 'aria-hidden': 'true' }, h('span', { class: 'cx-off-ring' }), bellLogo('cx-off-bell'),
        h('span', { class: 'cx-off-bub cx-bub-1', text: '💬' }), h('span', { class: 'cx-off-bub cx-bub-2', text: '🎮' }), h('span', { class: 'cx-off-bub cx-bub-3', text: '🔥' })),
      h('p', { class: 'cx-eyebrow', text: 'Free Period chat' }),
      h('h2', { text: 'Chat is coming soon' }),
      h('p', { class: 'cx-off-text', text: 'One server for everyone on Free Period: channels for every game, DMs, pictures and GIFs. Almost ready.' }),
      compact ? null : h('a', { class: 'cx-btn', href: './' }, icon('games'), 'Back to the games')));
  }

  // ---------- rendering helpers ----------
  function totals() {
    let u = 0, m = 0;
    for (const [k, v] of unread) if (k.startsWith('c:')) { u += v.unread || 0; m += v.mentions || 0; }
    return { unread: u, mentions: m };
  }
  function drawSide() {
    side.render({ mode, channels, current: cur && cur.id, unread, guest: guest(), loading: loading || (st !== 'ready' && st !== 'guest'), status: st,
      online: online.size, members: members.length, me: st === 'ready' ? myProfile() : null, meStatus: conn === 'live' ? 'online' : 'away' });
    rail.setActive(mode);
    const t = totals();
    rail.setBadges({ server: mode === 'server' ? { dot: false, text: '' } : badge(t), dms: { dot: false, text: '' } });
    if (!compact) document.title = tabTitle(BASE_TITLE, t.mentions);
  }
  function drawMembers() {
    if (st === 'waking') memberList.render({ loading: true });
    else if (st === 'ready') memberList.render({ members, online, loading });
  }
  function drawTyping(users) {
    const names = idsOf(users).filter((id) => id !== myId()).map((id) => nameOf(byId.get(id) || (Array.isArray(users) ? users.find((u) => u && (u.id === id || u.user_id === id)) : null)));
    typingEl.replaceChildren();
    typingEl.classList.toggle('on', names.length > 0);
    if (!names.length) return;
    const who = names.length === 1 ? [h('b', { text: names[0] }), ' is typing']
      : names.length === 2 ? [h('b', { text: names[0] }), ' and ', h('b', { text: names[1] }), ' are typing']
        : names.length === 3 ? [h('b', { text: names[0] }), ', ', h('b', { text: names[1] }), ' and ', h('b', { text: names[2] }), ' are typing']
          : ['Several people are typing'];
    typingEl.append(h('span', { class: 'cx-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', {}, ...who, '…'));
  }
  function setComposer() {
    const key = cur ? 'c:' + cur.id : 'none';
    if (guest()) composer.setTarget(key, { mode: 'guest' });
    else if (st !== 'ready') composer.setTarget(key, { placeholder: st === 'waking' ? 'Waking up chat…' : 'Chat isn’t available right now', mode: 'wait' });
    else if (!cur || mode === 'dms') composer.setTarget('none', { placeholder: mode === 'dms' ? 'Pick a conversation' : 'Pick a channel', mode: 'wait' });
    else if (cur.owner_only && !isStaff()) composer.setTarget(key, { mode: 'locked', lockText: 'Only Sean and mods post in #' + cur.name + '. You can still react.' });
    else composer.setTarget(key, { placeholder: 'Message #' + cur.name, mode: 'open' });
  }

  // ---------- read state ----------
  const readAt = new Map();
  function markRead(target) {
    if (!target || target.dm || document.hidden) return;
    const key = 'c:' + target.channel;
    const had = unread.get(key);
    if (had && (had.unread || had.mentions)) { unread.delete(key); drawSide(); }
    if (st !== 'ready') return;
    const now = Date.now();
    if (now - (readAt.get(key) || 0) < 2500 && !had) return;
    readAt.set(key, now);
    Promise.resolve().then(() => data.markRead(target)).catch(() => { /* next time */ });
  }

  // ---------- channels ----------
  function openChannel(c, byUser = false) {
    if (!c) return;
    const changed = !cur || cur.id !== c.id || mode !== 'server';
    mode = 'server';
    cur = c;
    store.set(LAST_KEY, c.name);
    drawHead(); drawSide(); setComposer();
    if (changed) {
      const u = unread.get('c:' + c.id);
      messages.open({ channel: c.id }, c, { unread: u ? u.unread : 0 });
      switchTyping({ channel: c.id });
    }
    if (layout === 'narrow' && byUser) setPanel('chat');
    if (byUser) composer.focus();
  }
  function setMode(m) {
    if (m === 'server') { if (mode !== 'server' || !cur) openChannel(cur || pickStart(), true); else if (layout === 'narrow') setPanel('nav'); return; }
    mode = 'dms';
    drawSide(); drawHead(); setComposer();
    switchTyping(null);
    messages.waiting(h('div', { class: 'cx-feed-empty' }, h('span', { class: 'cx-empty-ic big', 'aria-hidden': 'true' }, icon('chat')),
      h('strong', { text: 'Your DMs live here' }), h('span', { text: 'Private chats with friends and groups of up to 10.' })));
    if (layout === 'narrow') setPanel('nav');
  }
  function pickStart() {
    const last = store.get(LAST_KEY);
    return channels.find((c) => c.name === last) || channels.find((c) => c.name === 'general') || channels[0] || null;
  }
  function switchTyping(target) {
    if (typingH) { try { typingH.stop(); } catch { /* ignore */ } typingH = null; }
    drawTyping([]);
    if (!target || st !== 'ready' || typeof data.typing !== 'function') return;
    try { typingH = data.typing(target); typingH.onTyping((users) => drawTyping(users)); } catch { typingH = null; }
  }
  let lastPing = 0;
  function pingTyping() {
    const now = Date.now();
    if (!typingH || now - lastPing < 2500) return;
    lastPing = now;
    try { typingH.ping(); } catch { /* ignore */ }
  }

  // ---------- sending ----------
  function send({ body, files, replyTo, reply }) {
    if (st !== 'ready' || !cur || mode !== 'server') return false;
    const target = { channel: cur.id };
    let tempId = null;
    const clientId = newClientId(); // the server row echoes it back; that is how the echo finds this pending copy
    let p;
    try {
      p = data.sendMessage(target, { body, replyTo: replyTo || undefined, files, clientId, onPending: (pm) => {
        tempId = pm && pm.tempId;
        messages.pending(pm, { target, body, files, reply, author: myProfile(), clientId });
      } });
    } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then((m) => { if (tempId != null) messages.sent(tempId, m); else if (m) messages.insert(m); }, (e) => {
      if (tempId != null && !messages.hasTemp(tempId)) return; // discarded (or dropped with the account): nothing left to mark
      let text = '';
      try { text = data.chatError(e); } catch { /* ignore */ }
      text = text || 'Couldn’t send that';
      if (tempId != null) messages.failed(tempId, text);
      else composer.restore(body);
      // A dropped connection shows on the message itself (Retry); a refusal (slow down, timed out, banned) also gets a line here.
      const network = !navigator.onLine || (e && (e.code === 'network' || e.name === 'TypeError' || /fetch|network/i.test(e.message || '')));
      if (tempId == null || !network) composer.notice(text);
    });
    return true;
  }

  // ---------- live ----------
  function stopLive() {
    gen++;
    for (const u of subs) { try { u(); } catch { /* ignore */ } }
    subs = [];
    if (presenceH) { try { presenceH.stop(); } catch { /* ignore */ } presenceH = null; }
    switchTyping(null);
  }
  function onInsert(m) {
    if (!m) return;
    messages.insert(m);
    if (m.author_id === myId() || blocked.has(m.author_id) || m.dm_id) return;
    const key = 'c:' + m.channel_id;
    const viewing = cur && mode === 'server' && cur.id === m.channel_id && !document.hidden && messages.atBottom();
    if (viewing) { markRead({ channel: m.channel_id }); return; }
    const u = unread.get(key) || { unread: 0, mentions: 0 };
    u.unread = Math.min(99, (u.unread || 0) + 1);
    if (st === 'ready' && (m.mentions_everyone || mentionsMe(m.body, (chatMe() || {}).username))) u.mentions = Math.min(99, (u.mentions || 0) + 1);
    unread.set(key, u);
    drawSide();
  }
  function setConn(s) {
    const next = s === 'reconnecting' || s === 'offline' ? 'reconnecting' : 'live';
    if (next === conn) return;
    const was = conn;
    conn = next;
    drawBanner(); drawSide();
    if (was === 'reconnecting' && next === 'live' && started) {
      messages.resync();
      if (st === 'ready') Promise.resolve().then(() => data.unreadCounts()).then(applyUnread).catch(() => {});
    }
  }
  const onOnline = () => setConn('live');
  const onOffline = () => setConn('reconnecting');
  addEventListener('online', onOnline);
  addEventListener('offline', onOffline);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) conn = 'reconnecting';

  function applyUnread(rows) {
    unread.clear();
    const list = Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? Object.entries(rows).map(([target, v]) => ({ target, ...v })) : [];
    for (const r of list) if (r && r.target) unread.set(r.target, { unread: r.unread || 0, mentions: r.mentions || 0 });
    if (cur && mode === 'server' && messages.atBottom() && !document.hidden) unread.delete('c:' + cur.id);
    drawSide();
  }
  function setMembersList(list) {
    members = Array.isArray(list) ? list.filter((p) => p && p.id) : [];
    byId.clear();
    for (const p of members) byId.set(p.id, p);
    usernames = new Set(members.map((p) => p.username).filter(Boolean));
    viewVersion++;
  }

  async function start() {
    const mine = st === 'ready' ? 'ready:' + myId() : st === 'guest' ? 'guest' : '';
    if (!mine || mine === started) return;
    stopLive();
    const g = gen;
    started = mine;
    const uid = st === 'ready' ? myId() : '';
    if (lastUid !== null && uid !== lastUid) composer.clearDrafts(); // another account: its drafts and previews go
    lastUid = uid;
    const dropped = messages.reset(uid); // unsent messages of this account stay (Retry / Discard); anyone else's are cancelled
    if (dropped) toast(dropped === 1 ? 'An unsent message was dropped because the account changed.' : dropped + ' unsent messages were dropped because the account changed.', 'err');
    unread.clear(); online = new Set(); blocked = new Set(); setMembersList([]);
    channels = []; cur = null; mode = 'server';
    loading = true;
    drawSide(); drawHead(); setComposer(); drawMembers();
    messages.waiting('skeleton');
    let list;
    try {
      list = await data.listChannels();
      if (g !== gen) return;
      list = (Array.isArray(list) ? list : []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
      channels = st === 'guest' ? list.filter((c) => c.owner_only) : list;
      if (st === 'ready') {
        const [mem, blk, un] = await Promise.all([
          Promise.resolve().then(() => (typeof data.listMembers === 'function' ? data.listMembers() : data.findProfiles(''))).catch(() => []),
          Promise.resolve().then(() => data.listBlocks()).catch(() => []),
          Promise.resolve().then(() => data.unreadCounts()).catch(() => []),
        ]);
        if (g !== gen) return;
        setMembersList(mem);
        blocked = new Set(idsOf(blk));
        applyUnread(un);
      }
    } catch (e) {
      if (g !== gen) return;
      loading = false;
      started = '';
      drawSide();
      let text = '';
      try { text = data.chatError(e); } catch { /* ignore */ }
      messages.waiting(h('div', { class: 'cx-feed-err' }, icon('alert'), h('strong', { text: 'Couldn’t load chat' }), h('span', { text: text || 'Check your connection and try again.' }),
        h('button', { type: 'button', class: 'cx-btn ghost', onclick: () => start() }, icon('retry'), 'Try again')));
      return;
    }
    loading = false;
    for (const c of channels) {
      try {
        const unsub = data.subscribe({ channel: c.id }, {
          insert: onInsert,
          update: (m) => messages.update(m),
          react: (ev) => messages.react(ev),
          status: (s) => setConn(s),
        });
        if (typeof unsub === 'function') subs.push(unsub);
      } catch { /* that channel just won't be live */ }
    }
    if (st === 'ready' && typeof data.presence === 'function') {
      try { presenceH = data.presence({ onSync: (x) => { online = new Set(idsOf(x)); drawMembers(); drawSide(); drawHead(); } }); } catch { presenceH = null; }
    }
    drawMembers();
    const first = pickStart();
    if (first) openChannel(first);
    else { drawSide(); messages.waiting(h('div', { class: 'cx-feed-empty' }, h('strong', { text: 'No channels yet' }))); }
  }

  function applyState(s) {
    st = s;
    const off = s === 'off';
    offEl.hidden = !off;
    shell.hidden = off;
    root.classList.toggle('is-off', off);
    root.dataset.state = s;
    if (off) { stopLive(); started = ''; drawOff(); banner.hidden = true; if (!compact) document.title = BASE_TITLE; return; }
    drawBanner();
    if (s === 'ready' || s === 'guest') { start(); }
    else {
      if (started) { stopLive(); started = ''; }
      cur = null; channels = []; loading = false;
      drawSide(); drawHead(); setComposer(); drawMembers();
      messages.waiting(s === 'waking' ? 'skeleton' : h('div', { class: 'cx-feed-empty' },
        h('span', { class: 'cx-empty-ic big', 'aria-hidden': 'true' }, icon(s === 'asleep' ? 'moon' : 'alert')),
        h('strong', { text: s === 'asleep' ? 'Shh, chat is napping' : 'Chat is offline for a moment' }),
        h('span', { text: s === 'asleep' ? 'Messages are safe. They’ll be here when it wakes up.' : 'Nothing is lost. Try again in a bit.' })));
    }
    drawPanels();
  }

  const offState = onChatState((s) => applyState(s));
  const onVis = () => { if (!document.hidden && cur && mode === 'server' && messages.atBottom()) markRead({ channel: cur.id }); };
  document.addEventListener('visibilitychange', onVis);
  // Drop pictures anywhere on the conversation to attach them.
  main.addEventListener('dragover', (e) => { if (st === 'ready' && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); main.classList.add('drop'); } });
  main.addEventListener('dragleave', (e) => { if (!main.contains(e.relatedTarget)) main.classList.remove('drop'); });
  main.addEventListener('drop', (e) => { main.classList.remove('drop'); if (st === 'ready' && e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); composer.addFiles(e.dataTransfer.files); } });

  applyState(chatState());
  ensureChatSession().catch(() => {});

  return {
    // Open a conversation: { channel: id } or { channelName: 'general' }.
    open(target) {
      if (!target) return;
      const c = channels.find((x) => x.id === target.channel || x.name === target.channelName);
      if (c) openChannel(c, true);
    },
    destroy() {
      stopLive();
      offState();
      messages.destroy();
      composer.destroy();
      if (ro) ro.disconnect();
      removeEventListener('online', onOnline);
      removeEventListener('offline', onOffline);
      if (!compact) removeEventListener('popstate', onPop);
      document.removeEventListener('visibilitychange', onVis);
      root.replaceChildren();
    },
  };
}
