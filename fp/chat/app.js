// The chat app: rail, channel list (categories, voice channels) / DM list, messages, composer, members, status banners,
// profile cards, the profile editor and the owner / mod tools. Voice itself is voice.js (a singleton the app drives).
// Used by the Messages page (chat.html) and, with { compact: true }, by the play-page overlay (one panel at a time, no
// title or history changes).
import { h, toast, openSheet } from '../ui.js';
import * as session from '../session.js';
import { chatState, onChatState, ensureChatSession, me as chatMe, chatError as sessionError, getChat } from './client.js';
import * as data from './data.js';
import { tabTitle, badge } from './unread.js';
import { mentionsMe } from './format.js';
import { filterPeople, findByUsername } from './commands.js';
import { newClientId } from './feedlogic.js';
import { roleOfProfile, isStaffRole, timedOut } from './perms.js';
import { readCollapsed, writeCollapsed, voiceLabel } from './sidebarlogic.js';
import { voice } from './voice.js';
import { VOICE_ERRORS } from './voicelogic.js';
import { mountRail } from './views/rail.js';
import { mountChannels } from './views/channels.js';
import { mountMessages, networkFailure } from './views/messages.js';
import { mountComposer } from './views/composer.js';
import { mountMembers } from './views/members.js';
import { icon, bellLogo, nameOf, avatar, closeMenu, openMenu, timeoutText } from './views/common.js';
import { messageTools, openMemberMenu, openChannelManager, openHallpassTools } from './views/mod.js';
import { mountFriends } from './views/friends.js';
import { mountHelp } from './views/help.js';
import { mountCommandCard, startCommand } from './views/commands.js';
import { openEmojiManager } from './views/emoji-admin.js';
import { setEmoji, applyEmojiChange, onEmoji } from './emoji.js';
import { dmListNodes, dmTitle, dmOthers, groupIcon, openPeoplePicker, confirmLeave } from './views/dms.js';
import { openProfileCard, refreshProfileCard, closeProfileCard } from './views/profile-card.js';
import { openProfileEditor } from './views/profile-editor.js';

const BASE_TITLE = 'Messages · Free Period';
const LAST_KEY = 'fp.chat.last';
const MEMBERS_KEY = 'fp.chat.members';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const storage = () => { try { return localStorage; } catch { return null; } }; // (sidebarlogic's helpers catch a null)
const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id;
const isText = (c) => c && c.kind !== 'voice';
const idsOf = (x) => {
  if (!x) return [];
  if (x instanceof Set) return [...x];
  if (Array.isArray(x)) return x.map((v) => (v && typeof v === 'object' ? v.id || v.user_id || v.blocked : v)).filter(Boolean);
  if (typeof x === 'object') return Object.keys(x);
  return [];
};
const tkey = (t) => (t.dm ? 'd:' + t.dm : 'c:' + t.channel);
// Name styles (fonts, gradients) and frames live in flair.css; the overlay page does not link it, so load it once here.
function ensureFlairCss() {
  if (typeof document === 'undefined') return;
  const href = new URL('./flair.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return;
  document.head.append(h('link', { rel: 'stylesheet', href }));
}

export function mountChatApp(root, { compact = false } = {}) {
  ensureFlairCss();
  // .cx-app.server (the Free Period server: the animated background) or .cx-app.dms (DMs and friends: plain gray).
  root.classList.add('cx', 'cx-app', 'server');
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
  const helpEl = h('div');
  const cmdEl = h('div');
  const main = h('section', { class: 'cx-main', 'aria-label': 'Messages' }, headEl, feedEl, h('div', { class: 'cx-bottom' }, helpEl, cmdEl, typingEl, compEl));
  const navEl = h('div', { class: 'cx-nav' }, railEl, sideEl);
  const scrim = h('div', { class: 'cx-scrim', onclick: () => setMembers(false) });
  const shell = h('div', { class: 'cx-shell' }, navEl, main, scrim, membersEl);
  root.replaceChildren(banner, shell, offEl);

  // ---------- state ----------
  let st = null;               // chat state from client.js
  let conn = 'live';           // 'live' | 'reconnecting' | 'polling' (Realtime blocked: the open view is fetched every few s)
  let paused = false;          // the overlay is closed: no Realtime (see pauseLive)
  let mode = 'server';         // rail: 'server' | 'dms' | 'friends' (drawSide mirrors it on the root: .server / .dms)
  let channels = [];
  let categories = [];
  let collapsed = readCollapsed(storage()); // category ids folded on this device
  let cur = null;              // open text channel (a voice channel is never "opened": it is joined)
  let dms = [];                // listDMs()
  let curDM = null;            // open DM id
  let members = [];
  const byId = new Map();
  let usernames = new Set();
  let online = new Set();
  let blocked = new Set();
  const unread = new Map();    // 'c:<id>' | 'd:<uuid>' -> { unread, mentions }
  const subs = new Map();      // 'c:<id>' | 'd:<uuid>' -> unsubscribe
  let serverOff = null;        // subscribeServer() unsubscribe
  let presenceH = null;
  let typingH = null;
  let gen = 0;                 // bumps on every (re)start so late answers are dropped
  let started = '';            // '' | 'ready:<uid>' | 'guest'
  let ready = false;           // channels (and DMs) loaded for this start
  let pendingOpen = null;      // open() asked before the lists loaded
  let lastUid = null;          // account of the previous start (null before the first)
  let loading = false;
  let viewVersion = 0;
  let layout = compact ? 'narrow' : 'wide';
  let panel = 'chat';
  let membersOpen = store.get(MEMBERS_KEY) !== '0';
  let muteTimer = 0;
  let friendRows = [];         // listFriends(): { other, profile, status, incoming }
  let friendTimer = 0;
  let faq = [];                // Hallpass FAQ (everyone reads)
  let aiOn = false;            // bot_settings.ai_on
  let voiceWatch = null;       // voice.watch() stop: the sidebar's voice occupants, while ready and not paused
  let voiceTarget = null;      // the voice channel I last asked to join ({ id, name }: an error's {name} after teardown)
  let voiceErr = voice.state().error; // the error already shown (a new one becomes a toast)
  let voiceKey = '';           // what the sidebar last drew of voice (not the speaking rings)

  const myId = () => (chatMe() && chatMe().id) || '';
  const myProfile = () => byId.get(myId()) || (chatMe() ? { id: myId(), username: chatMe().username } : null);
  // Roles come from the server-written profile (like the database); until it loads, the hub role is a fair guess.
  const myRole = () => {
    const p = byId.get(myId());
    if (p) return roleOfProfile(p);
    const hub = session.getUser();
    return hub && hub.role === 'owner' ? 'owner' : hub && hub.role === 'admin' ? 'mod' : 'member';
  };
  const isStaff = () => isStaffRole(myRole());
  const muted = () => { const p = byId.get(myId()); return !!p && timedOut(p); };
  const banned = () => { const p = byId.get(myId()); return !!(p && p.banned); };
  const guest = () => st === 'guest';
  const curDMObj = () => (curDM ? dms.find((d) => d.id === curDM) || null : null);
  const live = (p) => (p && byId.get(p.id)) || p; // the freshest copy of a profile we have
  const errText = (e) => { try { return data.chatError(e) || 'Something went wrong'; } catch { return 'Something went wrong'; } };
  const openLogin = () => import('../account-ui.js').then((m) => m.openAuthSheet('login')).catch(() => { location.href = './'; });

  // ---------- shared contexts for the views ----------
  const modCx = {
    me: () => myProfile(),
    profile: (id) => byId.get(id) || null,
    patchProfile: (id, patch) => mergeProfile({ id, ...patch }),
    channels: () => channels,
    categories: () => categories,
    reloadChannels: () => Promise.all([reloadChannels(), reloadCategories()]),
    voiceOf: (id) => voiceChannelOf(id),
  };
  const cardCx = {
    me: () => myProfile(),
    profile: (id) => byId.get(id) || null,
    online: () => online,
    isBlocked: (id) => blocked.has(id),
    isStaff: () => isStaff(),
    message: async (p) => { try { await startDMWith(p); } catch (e) { throw { shown: errText(e) }; } },
    block: async (p, on) => {
      try { await data.block(p.id, on); } catch (e) { throw { shown: errText(e) }; }
      setBlocked(p.id, on);
      toast(on ? 'Blocked ' + nameOf(p) : 'Unblocked ' + nameOf(p));
    },
    editProfile: () => openEditor(),
    friendState: (id) => friendState(id),
    friend: (p, act) => friendAct(p, act),
    memberMenu: (anchor, p, onError) => openMemberMenu(anchor, live(p), modCx, { onError }),
    grantBadge: async (p, badge, on) => {      // owner only (the card shows the switches only to the owner)
      let list;
      try { list = await data.grantBadge(p.id, badge, on); } catch (e) { throw { shown: errText(e) }; }
      if (byId.has(p.id)) mergeProfile({ id: p.id, granted_badges: list }); // (Realtime brings it to everyone else)
      return list;
    },
  };
  const editorCx = {
    me: () => myProfile(),
    blockedProfiles: () => [...blocked].map((id) => byId.get(id) || { id, username: 'someone' }),
    unblock: async (id) => { await data.block(id, false); setBlocked(id, false); },
    applyProfile: (row) => mergeProfile(row),
  };
  function openCard(p, anchor) {
    if (!p || !p.id || st !== 'ready') return;
    openProfileCard(live(p), anchor || root, cardCx);
  }
  function openEditor(opts) { if (st === 'ready') openProfileEditor(editorCx, opts); }

  // ---------- views ----------
  const rail = mountRail(railEl, { homeLink: !compact, onServer: () => setMode('server'), onDMs: () => setMode('dms'), onFriends: () => setMode('friends') });
  const side = mountChannels(sideEl, { onPick: (c) => openChannel(c, true), onManage: () => openChannelManager(modCx), onTools: (anchor) => openServerTools(anchor), onMe: (anchor) => openCard(myProfile(), anchor), onSettings: () => openEditor(),
    onToggleCat: (id) => toggleCategory(id),
    onAddChannel: (categoryId) => { if (st === 'ready' && myRole() === 'owner') openChannelManager(modCx, { categoryId }); },
    onVoice: (c) => joinVoice(c),
    onVoiceUser: (p, anchor) => openCard(p, anchor),
    onVoiceMenu: (p, anchor) => (isStaff() ? openMemberMenu(anchor, live(p), modCx) : false),
    onMic: () => { const s = voice.state(); if (s.deaf) { voice.setDeaf(false); voice.setMute(false); } else voice.setMute(!s.mute); },
    onDeaf: () => voice.setDeaf(!voice.state().deaf),
    onVoiceLeave: () => voice.leave() });
  // A ban shows only to staff and to the banned person (like the profile card): a public "Banned" tag is a bullying hook.
  const showBan = (p) => !!p && (isStaff() || p.id === myId());
  const memberList = mountMembers(membersEl, { onBack: () => goBack(), onPick: (p, anchor) => openCard(p, anchor), onMenu: (p, anchor) => (isStaff() ? openMemberMenu(anchor, live(p), modCx) : false), showBan });
  const messages = mountMessages(feedEl, {
    me: () => (chatMe() ? { id: myId(), username: chatMe().username } : null),
    profile: (id) => byId.get(id) || null,
    usernames: () => usernames,
    isBlocked: (id) => blocked.has(id),
    canReact: () => st === 'ready' && !muted() && !banned(),
    canTools: () => st === 'ready',
    version: () => viewVersion,
    onReply: (m) => composer.setReply(m),
    onRead: (t) => markRead(t),
    onProfile: (p, anchor) => openCard(p, anchor),
    extraTools: (m, helpers) => (st === 'ready' ? messageTools(m, helpers, modCx) : []),
  });
  const composer = mountComposer(compEl, { onSend: send, onTyping: pingTyping, onLogin: openLogin,
    commands: () => ({ role: myRole(), dm: mode === 'dms' }),
    onCommand: (x) => startCommand(x.text, x, cmdCx),
    people: (q, o) => peopleFor(q, o) });
  const cmdCard = mountCommandCard(cmdEl, { bot: () => members.find((p) => p.is_bot) || null });
  const friendsView = mountFriends({
    rows: () => friendRows,
    online: () => online,
    live: (p) => live(p),
    request: async (name) => { try { return await data.friendRequest(name); } catch (e) { throw { shown: e && e.code === 'not_allowed' ? 'No one with that username can be added' : errText(e) }; } },
    respond: async (id, accept) => { try { await data.friendRespond(id, accept); } catch (e) { throw { shown: errText(e) }; } },
    remove: async (id) => { try { await data.friendRemove(id); } catch (e) { throw { shown: errText(e) }; } },
    message: async (p) => { try { await startDMWith(p); } catch (e) { throw { shown: errText(e) }; } },
    openCard: (p, anchor) => openCard(p, anchor),
    refresh: () => loadFriends(),
  });
  const help = mountHelp(helpEl, {
    faq: () => faq,
    aiOn: () => aiOn,
    refresh: () => refreshHelp(),
    bot: () => members.find((p) => p.is_bot) || null,
    // "@Hallpass" tells the bot to skip its FAQ and ask Claude (the asker already saw the FAQ card).
    askAI: (q) => sendNow({ body: /(^|[^a-z0-9_])@hallpass\b/i.test(q) ? q : '@Hallpass ' + q, files: [] }),
  });
  const offEmoji = onEmoji(() => { viewVersion++; messages.repaint(); });


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
    const showMembers = (st === 'ready' || st === 'waking') && (layout === 'narrow' ? panel === 'members' : membersOpen) && mode !== 'friends' && !(mode === 'dms' && !curDM);
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
  const backBtn = h('button', { type: 'button', class: 'cx-iconbtn cx-back', 'aria-label': 'Back', onclick: () => goBack() }, icon('back'));
  const headPic = h('span', { class: 'cx-head-pic', hidden: true });
  const headEmoji = h('span', { class: 'cx-head-emoji', 'aria-hidden': 'true' });
  const headName = h('h1', { class: 'cx-head-name' });
  const headLock = h('span', { class: 'cx-head-lock', title: 'Only Sean and mods post here', hidden: true }, icon('lock'));
  const headTopic = h('p', { class: 'cx-head-topic' });
  const addBtn = h('button', { type: 'button', class: 'cx-iconbtn cx-head-add', 'aria-label': 'Add people', title: 'Add people', hidden: true, onclick: () => addToGroup() }, icon('userPlus'));
  const pinsBtn = h('button', { type: 'button', class: 'cx-iconbtn cx-head-pins', 'aria-label': 'Pinned messages', title: 'Pinned messages', hidden: true, onclick: () => openPins() }, icon('pin'));
  const membersBtn = h('button', { type: 'button', class: 'cx-iconbtn cx-members-btn', 'aria-label': 'Members', title: 'Members', 'aria-pressed': 'false',
    onclick: () => setMembers(!root.classList.contains('members-open')) }, icon('users'), h('span', { class: 'cx-members-n' }));
  headEl.append(backBtn, h('div', { class: 'cx-head-title' }, headPic, headEmoji, headName, headLock), headTopic, h('span', { class: 'cx-head-gap' }), pinsBtn, addBtn, membersBtn);
  headPic.addEventListener('click', () => { const dm = curDMObj(); const one = dm && !dm.is_group && dmOthers(dm, myId())[0]; if (one) openCard(one, headPic); });
  function drawHead() {
    headPic.hidden = true; addBtn.hidden = true; headLock.hidden = true;
    backBtn.setAttribute('aria-label', mode === 'dms' ? 'Back to DMs' : 'Back to channels');
    if (mode === 'friends') {
      headEmoji.textContent = '';
      headName.textContent = 'Friends';
      const n = friendRows.filter((r) => r.status === 'accepted' && online.has(r.profile.id)).length;
      headTopic.textContent = n ? n + ' online now' : '';
    } else if (mode === 'dms') {
      const dm = curDMObj();
      headEmoji.textContent = '';
      if (!dm) { headName.textContent = 'Direct messages'; headTopic.textContent = ''; }
      else {
        const others = dmOthers(dm, myId()).map(live);
        headPic.hidden = false;
        headPic.replaceChildren(dm.is_group ? groupIcon(dm, myId(), 30) : avatar(others[0] || {}, { size: 30, status: others[0] && online.has(others[0].id) ? 'online' : 'offline' }));
        headPic.classList.toggle('is-btn', !dm.is_group);
        headName.textContent = dmTitle(dm, myId());
        const one = !dm.is_group && others[0];
        headTopic.textContent = one ? '@' + one.username + (one.status_text ? ' · ' + (one.status_emoji ? one.status_emoji + ' ' : '') + one.status_text : '') : (dm.members || []).length + ' members';
        addBtn.hidden = !dm.is_group || st !== 'ready';
      }
    } else if (cur) { headEmoji.textContent = cur.emoji || '#'; headName.textContent = cur.name; headLock.hidden = !cur.owner_only; headTopic.textContent = cur.topic || ''; }
    else { headEmoji.textContent = ''; headName.textContent = st === 'waking' ? 'Connecting…' : st === 'off' ? '' : 'Free Period'; headTopic.textContent = ''; }
    membersBtn.hidden = guest() || st !== 'ready' || mode === 'friends' || (mode === 'dms' && !curDM);
    pinsBtn.hidden = !((st === 'ready' || st === 'guest') && ((mode === 'server' && cur) || (mode === 'dms' && curDM)));
    const dm = mode === 'dms' ? curDMObj() : null;
    drawHelp();
    membersBtn.lastChild.textContent = dm ? String((dm.members || []).length) : online.size ? String(online.size) : '';
  }

  // Size changes (window, overlay panel) pick the layout.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => setLayout(es[0].contentRect.width)) : null;
  if (ro) ro.observe(root); else setLayout(root.clientWidth || innerWidth);
  setLayout(root.clientWidth || innerWidth);

  // ---------- pinned messages: a list from the header (newest first), each with Jump ----------
  async function openPins() {
    const target = mode === 'dms' && curDM ? { dm: curDM } : mode === 'server' && cur ? { channel: cur.id } : null;
    if (!target) return;
    const where = target.dm ? dmTitle(curDMObj() || { members: [] }, myId()) : '#' + cur.name;
    const sheet = openSheet({ title: 'Pinned in ' + where });
    sheet.el.classList.add('cx-sheet', 'cx-pins');
    const list = h('div', { class: 'cx-pins-list', role: 'list' }, h('p', { class: 'fp-note', text: 'Loading…' }));
    sheet.body.append(list);
    try {
      const rows = await data.listPins(target);
      list.replaceChildren(...(rows.length ? rows.map((m) => {
        const a = live(byId.get(m.author_id) || m.author || { id: m.author_id, username: 'someone' });
        const text = String(m.body || '').replace(/\s+/g, ' ').trim();
        return h('div', { class: 'cx-pin', role: 'listitem', dataset: { mid: String(m.id) } }, avatar(a, { size: 30 }),
          h('div', { class: 'cx-pin-text' }, h('b', { text: nameOf(a) }), h('p', { text: text ? (text.length > 240 ? text.slice(0, 240) + '…' : text) : '📷 Picture' })),
          h('button', { type: 'button', class: 'fp-mini', onclick: () => { sheet.close(); messages.jumpTo(m.id); } }, 'Jump'));
      }) : [h('p', { class: 'fp-note cx-pins-none', text: 'Nothing is pinned here yet. Sean and mods can pin a message from its ⋯ menu.' })]));
    } catch (e) { list.replaceChildren(h('p', { class: 'fp-err', text: errText(e) })); }
  }

  // ---------- banners ----------
  function drawBanner() {
    let kind = null;
    if (st === 'waking' || st === 'asleep' || st === 'error' || st === 'guest') kind = st;
    else if (st === 'ready' && conn === 'reconnecting') kind = 'reconnecting';
    else if (st === 'ready' && conn === 'polling') kind = 'polling';
    banner.hidden = !kind;
    root.classList.toggle('has-banner', !!kind);
    if (!kind) return;
    banner.className = 'cx-banner ' + kind;
    const owner = (session.getUser() || {}).role === 'owner' || myRole() === 'owner';
    const B = {
      waking: [h('i', { class: 'cx-spin' }), 'Waking up chat…', 'First sign-in on this device starts up the game server. This can take up to a minute.'],
      asleep: [icon('moon'), 'Chat is asleep', owner ? 'It naps after a week with nobody chatting. Open the Supabase dashboard, pick free-period-chat and press Restore.'
        : 'It naps after a quiet week. Sean can wake it up, so check back soon.'],
      error: [icon('alert'), sessionError() || 'Chat can’t be reached right now', 'Check your connection, then try again.'],
      reconnecting: [h('i', { class: 'cx-spin' }), 'Reconnecting…', 'Anything you send now goes out when the connection is back.'],
      polling: [icon('clock'), 'Live updates are blocked on this network — checking every few seconds', 'Messages you send still go out right away.'],
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
    let u = 0, m = 0, d = 0;
    for (const [k, v] of unread) {
      if (k.startsWith('c:')) { u += v.unread || 0; m += v.mentions || 0; }
      else if (k.startsWith('d:') && !(mode === 'dms' && curDM === k.slice(2))) d += v.unread || 0;
    }
    return { unread: u, mentions: m, dms: d };
  }
  function drawSide() {
    const dmNodes = mode === 'dms' || mode === 'friends' ? dmListNodes({ dms, current: mode === 'dms' ? curDM : null, unread, myId: myId(), online, profile: (id) => byId.get(id), isBlocked: (id) => blocked.has(id),
      onPick: (dm) => openDM(dm, true), onNew: () => newDM(), onNewGroup: () => newGroup() }) : null;
    voiceKey = voiceShape();
    side.render({ mode, channels, categories, collapsed, current: cur && cur.id, unread, guest: guest(), loading: loading || (st !== 'ready' && st !== 'guest'), status: st,
      online: online.size, members: members.length, me: st === 'ready' ? myProfile() : null, meStatus: conn === 'live' ? 'online' : 'away',
      canManage: st === 'ready' && myRole() === 'owner', canTools: st === 'ready' && isStaff(), dmNodes,
      roster: guest() ? new Map() : voice.roster(), voice: guest() ? null : voice.state(), people: (id) => byId.get(id) || null, myId: myId() });
    rail.setActive(mode);
    root.classList.toggle('server', mode === 'server');
    root.classList.toggle('dms', mode !== 'server');
    const t = totals();
    rail.setBadges({ server: mode === 'server' ? { dot: false, text: '' } : badge(t), dms: badge({ unread: t.dms, mentions: t.dms }),
      friends: { dot: false, text: friendRows.filter((r) => r.incoming).length ? String(friendRows.filter((r) => r.incoming).length) : '' } });
    if (!compact) document.title = tabTitle(BASE_TITLE, t.mentions + t.dms);
  }
  function drawMembers() {
    if (mode === 'friends') return;
    if (st === 'waking') { memberList.render({ loading: true }); return; }
    if (st !== 'ready') return;
    const dm = mode === 'dms' ? curDMObj() : null;
    if (dm) {
      const list = (dm.members || []).map(live);
      const acts = dm.is_group ? [
        h('button', { type: 'button', class: 'cx-btn ghost', onclick: () => addToGroup() }, icon('userPlus'), 'Add people'),
        h('button', { type: 'button', class: 'cx-btn ghost danger', onclick: () => leaveGroup() }, icon('leave'), 'Leave group')] : null;
      memberList.render({ members: list, online, title: dm.is_group ? 'Group' : 'In this DM', flat: true, footer: acts });
      return;
    }
    memberList.render({ members, online, loading });
  }
  function drawTyping(users) {
    const pool = mode === 'dms' && curDMObj() ? curDMObj().members || [] : [];
    const names = idsOf(users).filter((id) => id !== myId() && !blocked.has(id)).map((id) => nameOf(byId.get(id) || pool.find((p) => p.id === id) || (Array.isArray(users) ? users.find((u) => u && (u.id === id || u.user_id === id)) : null)));
    typingEl.replaceChildren();
    typingEl.classList.toggle('on', names.length > 0);
    if (!names.length) return;
    const who = names.length === 1 ? [h('b', { text: names[0] }), ' is typing']
      : names.length === 2 ? [h('b', { text: names[0] }), ' and ', h('b', { text: names[1] }), ' are typing']
        : names.length === 3 ? [h('b', { text: names[0] }), ', ', h('b', { text: names[1] }), ' and ', h('b', { text: names[2] }), ' are typing']
          : ['Several people are typing'];
    typingEl.append(h('span', { class: 'cx-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', {}, ...who, '…'));
  }
  // Timed out / banned: a clear line instead of the text box (it counts down and reopens by itself).
  function gateLine() {
    const p = byId.get(myId());
    if (!p) return null;
    if (p.banned) return { mode: 'locked', lockKind: 'banned', lockText: 'You’re banned from chat. You can still read.' };
    if (timedOut(p)) return { mode: 'locked', lockKind: 'muted', lockText: timeoutText(p.muted_until) + '. You can still read.' };
    return null;
  }
  function armMuteTimer() {
    clearInterval(muteTimer); muteTimer = 0;
    if (st === 'ready' && muted()) muteTimer = setInterval(() => { setComposer(); if (!muted()) { clearInterval(muteTimer); muteTimer = 0; messages.repaint(); } }, 15000);
  }
  function setComposer() {
    setComposerTarget();
    cmdCard.setKey(composer.key());
  }
  function setComposerTarget() {
    compEl.hidden = mode === 'friends';
    if (mode === 'friends') { composer.setTarget('none', { placeholder: '', mode: 'wait' }); return; }
    if (mode === 'dms') {
      const dm = curDMObj();
      const key = dm ? 'd:' + dm.id : 'none';
      if (st !== 'ready' || !dm) { composer.setTarget('none', { placeholder: st === 'ready' ? 'Pick a conversation' : 'Chat isn’t available right now', mode: 'wait' }); return; }
      const g = gateLine();
      if (g) { composer.setTarget(key, g); return; }
      const one = !dm.is_group && dmOthers(dm, myId())[0];
      if (one && blocked.has(one.id)) { composer.setTarget(key, { mode: 'locked', lockKind: 'blocked', lockText: 'You blocked ' + nameOf(live(one)) + '. Unblock them to send messages.' }); return; }
      composer.setTarget(key, { placeholder: 'Message ' + (one ? '@' + one.username : dmTitle(dm, myId())), mode: 'open' });
      return;
    }
    const key = cur ? 'c:' + cur.id : 'none';
    if (guest()) composer.setTarget(key, { mode: 'guest' });
    else if (st !== 'ready') composer.setTarget(key, { placeholder: st === 'waking' ? 'Waking up chat…' : 'Chat isn’t available right now', mode: 'wait' });
    else if (!cur) composer.setTarget('none', { placeholder: 'Pick a channel', mode: 'wait' });
    else if (gateLine()) composer.setTarget(key, gateLine());
    else if (cur.owner_only && !isStaff()) composer.setTarget(key, { mode: 'locked', lockText: 'Only Sean and mods post in #' + cur.name + '. You can still react.' });
    else composer.setTarget(key, { placeholder: 'Message #' + cur.name, mode: 'open' });
  }

  // ---------- read state ----------
  const readAt = new Map();
  function markRead(target) {
    if (!target || document.hidden || paused) return;      // (a closed overlay reads nothing: its badge/pop-up must show)
    const key = tkey(target);
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
    if (!c) return Promise.resolve();
    const changed = !cur || cur.id !== c.id || mode !== 'server';
    mode = 'server';
    cur = c;
    store.set(LAST_KEY, c.name);
    drawHead(); drawSide(); setComposer(); drawMembers(); drawPanels();
    let p = Promise.resolve();
    if (changed) {
      const u = unread.get('c:' + c.id);
      p = messages.open({ channel: c.id }, c, { unread: u ? u.unread : 0 });
      switchTyping({ channel: c.id });
    }
    if (layout === 'narrow' && byUser) setPanel('chat');
    if (byUser) composer.focus();
    return p;
  }
  function setMode(m) {
    if (m === 'friends') { openFriends(); return; }
    if (m === 'server') { if (mode !== 'server' || !cur) openChannel(cur || pickStart(), true); else if (layout === 'narrow') setPanel('nav'); return; }
    if (mode === 'dms' && layout === 'narrow') { setPanel('nav'); return; }
    const dm = curDMObj();
    if (dm && layout !== 'narrow') { openDM(dm, false); return; }
    mode = 'dms';
    curDM = null;
    dmHome();
    if (layout === 'narrow') setPanel('nav');
  }
  function openFriends() {
    mode = 'friends';
    drawSide(); drawHead(); setComposer(); drawMembers(); drawPanels();
    switchTyping(null);
    friendsView.draw();
    messages.waiting(friendsView.el);
    loadFriends();
    if (layout === 'narrow') setPanel('chat');
  }
  function dmHome() {
    drawSide(); drawHead(); setComposer(); drawMembers(); drawPanels();
    switchTyping(null);
    messages.waiting(h('div', { class: 'cx-feed-empty' }, h('span', { class: 'cx-empty-ic big', 'aria-hidden': 'true' }, icon('chat')),
      h('strong', { text: 'Your DMs live here' }), h('span', { text: 'Private chats with one person, or groups of up to 10.' }),
      st === 'ready' ? h('div', { class: 'cx-feed-acts' }, h('button', { type: 'button', class: 'cx-btn', onclick: () => newDM() }, icon('plus'), 'New message'),
        h('button', { type: 'button', class: 'cx-btn ghost', onclick: () => newGroup() }, icon('users'), 'New group')) : null));
  }
  function pickStart() {
    const last = store.get(LAST_KEY);
    const text = channels.filter(isText);
    return text.find((c) => c.name === last) || text.find((c) => c.name === 'general') || text[0] || null;
  }
  function switchTyping(target) {
    if (typingH) { try { typingH.stop(); } catch { /* ignore */ } typingH = null; }
    drawTyping([]);
    if (!target || st !== 'ready' || paused || typeof data.typing !== 'function') return;
    try { typingH = data.typing(target); typingH.onTyping((users) => drawTyping(users)); } catch { typingH = null; }
  }
  let lastPing = 0;
  function pingTyping() {
    const now = Date.now();
    if (!typingH || now - lastPing < 2500) return;
    lastPing = now;
    try { typingH.ping(); } catch { /* ignore */ }
  }
  function subscribeTarget(target) {
    const key = tkey(target);
    if (subs.has(key) || paused) return;
    try {
      const unsub = data.subscribe(target, {
        insert: onInsert,
        update: (m) => { messages.update(m); if (m && m.dm_id) touchDM(m); },
        react: (ev) => messages.react(ev),
        status: (s) => setConn(s),
      });
      if (typeof unsub === 'function') subs.set(key, unsub);
    } catch { /* that conversation just won't be live */ }
  }
  function unsubscribe(key) { const u = subs.get(key); if (u) { try { u(); } catch { /* ignore */ } subs.delete(key); } }
  // Guests read the owner-only text channels only (never a voice channel).
  const visible = (list) => (st === 'guest' ? list.filter((c) => c.owner_only && isText(c)) : list);
  async function reloadChannels() {
    const g = gen;
    let list = await data.listChannels();
    if (g !== gen) return;
    list = (Array.isArray(list) ? list : []).slice().sort(byPos);
    setChannels(visible(list));
  }
  function setChannels(list) {
    channels = list.slice().sort(byPos);
    const ids = new Set(channels.filter(isText).map((c) => 'c:' + c.id));
    for (const k of [...subs.keys()]) if (k.startsWith('c:') && !ids.has(k)) unsubscribe(k);
    for (const c of channels) if (isText(c)) subscribeTarget({ channel: c.id });
    const vs = voice.state(); // the voice channel I'm in was deleted (or I can't see it any more)
    if (st === 'ready' && vs.channelId != null && !channels.some((c) => c.id === vs.channelId)) voice.channelGone(vs.channelId);
    if (cur) {
      const again = channels.find((c) => c.id === cur.id);
      if (again) cur = again;
      else if (mode === 'server') { cur = null; openChannel(pickStart()); return; }
      else cur = null;
    }
    drawSide(); drawHead(); setComposer();
  }

  // ---------- categories (collapsed ones are remembered per device) ----------
  async function reloadCategories() {
    const g = gen;
    let list;
    try { list = await data.listCategories(); } catch { return; } // the sidebar works without them (no headers)
    if (g === gen) setCategories(list);
  }
  function setCategories(list) {
    categories = (Array.isArray(list) ? list : []).filter((k) => k && k.id != null).sort(byPos);
    drawSide();
  }
  function toggleCategory(id) {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    writeCollapsed(storage(), collapsed);
    drawSide();
  }

  // ---------- voice (voice.js): join from a voice row, errors as toasts, the sidebar follows its changes ----------
  function voiceChannelOf(id) {
    for (const [ch, people] of voice.roster()) if (people.some((p) => p.id === id)) return ch;
    return null;
  }
  // Everything the sidebar draws of voice except the speaking rings (those only repaint: they change many times a second).
  function voiceShape() {
    const s = voice.state();
    const r = [...voice.roster()].map(([ch, l]) => ch + ':' + l.map((u) => u.id + (u.mute ? 'm' : '') + (u.deaf ? 'd' : '')).join(',')).join(';');
    return [s.status, s.channelId, s.mute, s.deaf, r, [...s.peers].map(([id, p]) => id + p.state).join(',')].join('|');
  }
  function onVoiceChange() {
    const s = voice.state();
    if (s.error && s.error !== voiceErr) {
      const name = voiceLabel((voiceTarget && voiceTarget.name) || s.channelName || 'That channel');
      toast((VOICE_ERRORS[s.error] || VOICE_ERRORS.lost).replace('{name}', name), 'err');
    }
    voiceErr = s.error;
    if (voiceShape() !== voiceKey) drawSide();
    else side.paintSpeaking(s);
  }
  // Called inside the click (voice.join asks for the mic right there: Safari).
  function joinVoice(c) {
    if (st !== 'ready' || !chatMe() || !c || c.kind !== 'voice') return; // (guests never see voice rows)
    const s = voice.state();
    if (s.status !== 'idle' && s.channelId === c.id) return; // already in it: nothing to do
    if (banned() || muted()) { toast(VOICE_ERRORS.blocked, 'err'); return; }
    voiceTarget = { id: c.id, name: c.name };
    voice.join({ id: c.id, name: c.name }); // (in another one: voice.join leaves it first)
  }
  // Banned or timed out: no voice (the database refuses a rejoin too).
  function voiceGate() { if ((banned() || muted()) && voice.state().status !== 'idle') voice.leave('blocked'); }
  function watchVoice(on) {
    if (on && !voiceWatch && st === 'ready' && !paused) { try { voiceWatch = voice.watch(); } catch { voiceWatch = null; } }
    else if (!on && voiceWatch) { try { voiceWatch(); } catch { /* ignore */ } voiceWatch = null; }
  }
  const offVoice = voice.onChange(onVoiceChange);

  // ---------- DMs ----------
  let dmLoad = null;
  function loadDMs() {
    if (st !== 'ready') return Promise.resolve();
    if (dmLoad) return dmLoad;
    const g = gen;
    dmLoad = Promise.resolve().then(() => data.listDMs()).then((list) => {
      if (g !== gen) return;
      setDMs(list);
    }, () => {}).finally(() => { dmLoad = null; });
    return dmLoad;
  }
  function setDMs(list) {
    const known = new Set(dms.map((d) => d.id));
    dms = (Array.isArray(list) ? list : []).filter((d) => d && d.id);
    // A DM that just appeared (someone started one, or added me to a group) may already hold messages that came before
    // its live subscription: ask for the counts again.
    if (ready && dms.some((d) => !known.has(d.id))) Promise.resolve().then(() => data.unreadCounts()).then(applyUnread).catch(() => {});
    const ids = new Set(dms.map((d) => 'd:' + d.id));
    for (const k of [...subs.keys()]) if (k.startsWith('d:') && !ids.has(k)) unsubscribe(k);
    for (const d of dms) subscribeTarget({ dm: d.id });
    if (curDM && !dms.some((d) => d.id === curDM)) { curDM = null; if (mode === 'dms') dmHome(); }
    drawSide(); drawHead();
    if (mode === 'dms') { drawMembers(); setComposer(); }
  }
  function touchDM(m) {
    const dm = dms.find((d) => d.id === m.dm_id);
    if (!dm) { loadDMs(); return; }
    if (!dm.last || dm.last.id === m.id || Date.parse(m.created_at) >= Date.parse(dm.last.created_at || 0)) dm.last = m;
  }
  function dmInfo(dm) { return { dm: true, is_group: dm.is_group, title: dmTitle(dm, myId()), members: (dm.members || []).map(live) }; }
  function openDM(dm, byUser = false) {
    if (!dm) return Promise.resolve();
    const changed = mode !== 'dms' || curDM !== dm.id;
    mode = 'dms';
    curDM = dm.id;
    drawHead(); drawSide(); setComposer(); drawMembers(); drawPanels();
    let p = Promise.resolve();
    if (changed) {
      const u = unread.get('d:' + dm.id);
      p = messages.open({ dm: dm.id }, dmInfo(dm), { unread: u ? u.unread : 0 });
      switchTyping({ dm: dm.id });
    }
    if (layout === 'narrow' && byUser) setPanel('chat');
    if (byUser) composer.focus();
    return p;
  }
  async function startDMWith(p) {
    const id = await data.startDM(p.id);
    await loadDMs();
    let dm = dms.find((d) => d.id === id);
    if (!dm) { dm = { id, is_group: false, name: null, members: [myProfile(), live(p)].filter(Boolean), last: null }; dms.push(dm); subscribeTarget({ dm: id }); }
    await openDM(dm, true);
  }
  function newDM() {
    openPeoplePicker('dm', { myId: myId(), isBlocked: (id) => blocked.has(id), showBan, onDone: async ([p]) => { if (p) await startDMWith(p); } });
  }
  function newGroup() {
    openPeoplePicker('group', { myId: myId(), isBlocked: (id) => blocked.has(id), showBan, room: 9, onDone: async (people, name) => {
      const id = await data.createGroup(people.map((p) => p.id), name);
      await loadDMs();
      const dm = dms.find((d) => d.id === id);
      if (dm) await openDM(dm, true);
      toast('Group made');
    } });
  }
  function addToGroup() {
    const dm = curDMObj();
    if (!dm || !dm.is_group) return;
    const have = new Set((dm.members || []).map((p) => p.id));
    if (have.size >= 10) { toast('Groups hold up to 10 people', 'err'); return; }
    openPeoplePicker('add', { myId: myId(), isBlocked: (id) => blocked.has(id), showBan, exclude: have, room: 10 - have.size, onDone: async (people) => {
      try { for (const p of people) await data.addToGroup(dm.id, p.id); }
      finally { await loadDMs(); } // a partial failure still shows who did get in
      toast(people.length === 1 ? nameOf(people[0]) + ' was added' : people.length + ' people were added');
    } });
  }
  function leaveGroup() {
    const dm = curDMObj();
    if (!dm) return;
    confirmLeave(dm, dmTitle(dm, myId()), async () => {
      await data.leaveDM(dm.id);
      unsubscribe('d:' + dm.id);
      dms = dms.filter((d) => d.id !== dm.id);
      curDM = null;
      dmHome();
      if (layout === 'narrow') setPanel('nav');
      loadDMs();
    });
  }

  // ---------- people ----------
  function setBlocked(id, on) {
    if (on) blocked.add(id); else blocked.delete(id);
    viewVersion++;
    messages.repaint();
    drawSide(); setComposer();
    if (on) loadFriends(); // blocking ends a friendship
    refreshProfileCard(byId.get(id));
  }
  function mergeProfile(row) {
    if (!row || !row.id) return;
    const old = byId.get(row.id);
    const next = { ...(old || {}), ...row };
    byId.set(row.id, next);
    const i = members.findIndex((p) => p.id === row.id);
    if (i >= 0) members[i] = next; else members.push(next);
    usernames = new Set(members.map((p) => p.username).filter(Boolean));
    for (const d of dms) if (Array.isArray(d.members)) d.members = d.members.map((p) => (p && p.id === row.id ? next : p));
    viewVersion++;
    messages.repaint();
    drawMembers(); drawSide(); drawHead();
    if (row.id === myId()) { setComposer(); armMuteTimer(); drawBanner(); voiceGate(); }
    refreshProfileCard(next);
  }

  // ---------- emoji, friends, Hallpass ----------
  async function loadEmoji() {
    const g = gen;
    try { const rows = await data.listEmoji(); if (g === gen) setEmoji(rows); } catch { /* chat works without the emoji list */ }
  }
  async function loadFriends() {
    if (st !== 'ready') return;
    const g = gen;
    try {
      const rows = await data.listFriends();
      if (g !== gen) return;
      friendRows = (Array.isArray(rows) ? rows : []).filter((r) => r && r.profile && r.profile.id);
      if (mode === 'friends') { friendsView.draw(); drawHead(); }
      drawSide();
    } catch { /* the page keeps what it had */ }
  }
  function friendState(id) {
    const r = friendRows.find((x) => x.profile.id === id);
    return !r ? 'none' : r.status === 'accepted' ? 'friends' : r.incoming ? 'in' : 'out';
  }
  async function friendAct(p, act) {
    try {
      if (act === 'add') { const res = await data.friendRequest(p.username); toast(res === 'accepted' ? 'You and ' + nameOf(p) + ' are friends' : 'Friend request sent to ' + nameOf(p)); }
      else if (act === 'accept') { await data.friendRespond(p.id, true); toast('You and ' + nameOf(p) + ' are friends'); }
      else { await data.friendRemove(p.id); toast(friendState(p.id) === 'out' ? 'Request cancelled' : nameOf(p) + ' was removed'); }
    } catch (e) { throw { shown: e && e.code === 'not_allowed' ? 'You can’t add them as a friend' : errText(e) }; }
    await loadFriends();
  }
  async function refreshHelp() {
    const [f, s] = await Promise.all([data.listFaq(), data.getBotSettings()]);
    faq = Array.isArray(f) ? f : [];
    aiOn = !!(s && s.ai_on);
    return { faq, aiOn };
  }
  // The open conversation is a help one: the #help channel, or a 1:1 DM with a bot.
  function helpKey() {
    if (st !== 'ready') return null;
    if (mode === 'server' && cur && cur.name === 'help') return 'c:' + cur.id;
    if (mode === 'dms') {
      const dm = curDMObj();
      if (dm && !dm.is_group && dmOthers(dm, myId()).some((p) => (live(p) || {}).is_bot)) return 'd:' + dm.id;
    }
    return null;
  }
  function drawHelp() { help.setTarget(helpKey()); }
  function openServerTools(anchor) {
    const items = [{ label: 'Server emoji', icon: 'react', note: 'Upload up to 50', onClick: () => openEmojiManager({ reloadEmoji: loadEmoji }) }];
    if (myRole() === 'owner') items.push({ label: 'Hallpass helper', icon: 'sparkle', note: 'AI switch and FAQ', onClick: async () => { try { await refreshHelp(); } catch { /* the sheet shows its own errors */ } openHallpassTools({ faq: () => faq, reloadFaq: () => refreshHelp().then(() => help.redraw()) }); } });
    openMenu(anchor, items, { label: 'Server tools' });
  }

  // ---------- slash commands and the @ list ----------
  const extraPeople = new Map(); // profiles findProfiles found that the member list didn't have yet
  const peoplePool = () => {
    const dm = mode === 'dms' ? curDMObj() : null;
    return [...(dm ? (dm.members || []).map(live) : []), ...members, ...extraPeople.values()];
  };
  // "@" in a channel: members (and Hallpass), "@everyone" for the owner only (the database's rule); in a DM or group: the
  // people in it. In a slash command's arguments: everyone (staff commands work on a person from a DM too).
  function peopleFor(query, { command = false } = {}) {
    const dm = mode === 'dms' ? curDMObj() : null;
    const exclude = new Set([myId()]);
    if (dm && !command) return { rows: filterPeople((dm.members || []).map(live), query, { exclude, online }) };
    const pool = peoplePool();
    const rows = filterPeople(pool, query, { exclude, online, everyone: !command && !dm && myRole() === 'owner' });
    if (!query || rows.length >= 8 || st !== 'ready') return { rows };
    return {
      rows,
      search: async () => {
        const found = await data.findProfiles(query);
        for (const p of found || []) if (p && p.id && !byId.has(p.id)) extraPeople.set(p.id, p);
        return filterPeople(peoplePool(), query, { exclude, online, everyone: !command && !dm && myRole() === 'owner' });
      },
    };
  }
  async function findUser(name) {
    const hit = findByUsername(peoplePool(), name);
    if (hit) return live(hit);
    const found = await data.findProfiles(name);
    for (const p of found || []) if (p && p.id && !byId.has(p.id)) extraPeople.set(p.id, p);
    return findByUsername(found, name);
  }
  const cmdCx = {
    role: () => myRole(),
    where: () => (st !== 'ready' ? null : mode === 'dms' && curDM ? { dm: curDM } : mode === 'server' && cur ? { channel: cur.id } : null),
    findUser,
    card: cmdCard,
    post: (body, { reply, replyTo, files } = {}) => sendNow({ body, files: files || [], replyTo: replyTo || null, reply: reply || null }),
    startDM: (p) => startDMWith(p),
    openCard: (p) => openCard(p, compEl.querySelector('.cx-cmp-ta') || compEl),
    setBlocked: (id, on) => setBlocked(id, on),
    mergeProfile: (row) => mergeProfile(row),
    patchProfile: (id, patch) => { if (byId.has(id)) mergeProfile({ id, ...patch }); }, // (Realtime brings the rest)
    loadFriends: () => loadFriends(),
    openReports: () => import('../inbox.js').then((m) => m.openInbox({ tab: 'reports' })),
    afterAI: () => { refreshHelp().then(() => help.redraw(), () => {}); },
  };

  // ---------- sending ----------
  // In #help and in a DM with Hallpass a typed question goes to the FAQ first: an answer card only the asker sees, and a
  // message is posted (for the AI to answer) only when nothing matched and AI answers are on.
  function send(opts) {
    if (st === 'ready' && helpKey() && opts.body && opts.body.trim() && !(opts.files && opts.files.length) && !opts.replyTo) {
      const key = composer.key(), body = opts.body;
      help.ask(opts.body.trim()).then((r) => { if (r === 'send' || r === 'post') sendNow(opts); else if (r === 'gone') composer.restore(body, key); }, () => sendNow(opts));
      return true;
    }
    return sendNow(opts);
  }
  function sendNow({ body, files, replyTo, reply }) {
    if (st !== 'ready') return false;
    let target;
    if (mode === 'dms' && curDM) target = { dm: curDM };
    else if (mode === 'server' && cur) target = { channel: cur.id };
    else return false;
    let tempId = null;
    const clientId = newClientId(); // the server row echoes it back; that is how the echo finds this pending copy
    let p;
    try {
      p = data.sendMessage(target, { body, replyTo: replyTo || undefined, files, clientId, onPending: (pm) => {
        tempId = pm && pm.tempId;
        messages.pending(pm, { target, body, files, reply, author: myProfile(), clientId });
      } });
    } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then((m) => { if (tempId != null) messages.sent(tempId, m); else if (m) messages.insert(m); if (m && m.dm_id) { touchDM(m); drawSide(); } }, (e) => {
      if (tempId != null && !messages.hasTemp(tempId)) return; // discarded (or dropped with the account): nothing left to mark
      let text = '';
      try { text = data.chatError(e); } catch { /* ignore */ }
      text = text || 'Couldn’t send that';
      // A dropped connection shows on the message itself (Retry, and it goes again once chat is live); a refusal (slow down,
      // timed out, banned) also gets a line here.
      const network = networkFailure(e);
      if (tempId != null) messages.failed(tempId, text, { network });
      else composer.restore(body);
      if (tempId == null || !network) composer.notice(text);
    });
    return true;
  }

  // ---------- live ----------
  function stopLive() {
    gen++;
    ready = false;
    for (const k of [...subs.keys()]) unsubscribe(k);
    if (serverOff) { try { serverOff(); } catch { /* ignore */ } serverOff = null; }
    if (presenceH) { try { presenceH.stop(); } catch { /* ignore */ } presenceH = null; }
    clearInterval(muteTimer); muteTimer = 0;
    clearInterval(friendTimer); friendTimer = 0;
    watchVoice(false);
    switchTyping(null);
    stopPolling();
    closeProfileCard(); closeMenu();
  }
  function onInsert(m) {
    if (!m) return;
    messages.insert(m);
    if (m.dm_id) { touchDM(m); }
    const mine = m.author_id === myId();
    if (mine || blocked.has(m.author_id)) { if (m.dm_id) drawSide(); return; }
    const key = m.dm_id ? 'd:' + m.dm_id : 'c:' + m.channel_id;
    const here = m.dm_id ? mode === 'dms' && curDM === m.dm_id : cur && mode === 'server' && cur.id === m.channel_id;
    if (here && !document.hidden && messages.atBottom()) { markRead(m.dm_id ? { dm: m.dm_id } : { channel: m.channel_id }); drawSide(); return; }
    const u = unread.get(key) || { unread: 0, mentions: 0 };
    u.unread = Math.min(99, (u.unread || 0) + 1);
    if (st === 'ready' && !m.dm_id && (m.mentions_everyone || mentionsMe(m.body, (chatMe() || {}).username))) u.mentions = Math.min(99, (u.mentions || 0) + 1);
    unread.set(key, u);
    drawSide();
  }
  // Realtime only delivers rows sent after it has joined: whatever arrived before (on the first join after start, or
  // while reconnecting) is fetched again once it is live.
  function catchUp() {
    messages.resync();
    if (st === 'ready') {
      Promise.resolve().then(() => data.unreadCounts()).then(applyUnread).catch(() => {});
      loadDMs();
      Promise.resolve().then(() => (typeof data.listMembers === 'function' ? data.listMembers() : null)).then((l) => { if (Array.isArray(l)) { setMembersList(l); messages.repaint(); drawMembers(); drawSide(); setComposer(); voiceGate(); } }).catch(() => {});
    }
  }
  // ---------- connection ----------
  // rt: Realtime as data.js reports it ('connecting' = the first join, no banner). The browser's 'online' event only
  // means a network is back: the view catches up when Realtime has really (re)joined, on every move to 'live'.
  // Realtime that can't join for a while (a school filter blocking WebSockets, the plan's connection cap) gets a
  // fallback: the open conversation and the unread counts are fetched every few seconds, with a calm line instead of
  // an endless "Reconnecting…". While the overlay is closed (paused) nothing is live at all.
  const POLL_AFTER_MS = 12000, POLL_EVERY_MS = 5000;
  let rt = 'connecting';
  let offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  let polling = false, pollTimer = 0, watchTimer = 0, notLiveSince = Date.now(), pollN = 0;
  function setConn(s) {
    const next = s === 'live' ? 'live' : s === 'connecting' ? 'connecting' : 'reconnecting';
    if (next === rt || paused) return;
    const was = rt;
    rt = next;
    if (next === 'live') {
      notLiveSince = 0;
      stopPolling();
      if (started && was !== 'live') catchUp(); // first join or rejoin: fetch whatever Realtime didn't deliver
    } else if (!notLiveSince) notLiveSince = Date.now();
    armPolling();
    drawConn();
  }
  function drawConn() {
    const k = paused ? 'live' : offline ? 'reconnecting' : polling ? 'polling' : rt === 'reconnecting' ? 'reconnecting' : 'live';
    if (k === conn) return;
    conn = k;
    drawBanner(); drawSide();
  }
  function armPolling() {
    clearTimeout(watchTimer); watchTimer = 0;
    if (rt === 'live' || paused || !started || polling) return;
    const wait = Math.max(0, POLL_AFTER_MS - (Date.now() - (notLiveSince || Date.now())));
    watchTimer = setTimeout(() => { watchTimer = 0; if (rt !== 'live' && !paused && started) startPolling(); }, wait);
  }
  function startPolling() {
    if (polling) return;
    polling = true; pollN = 0;
    drawConn();
    pollOnce();
    pollTimer = setInterval(pollOnce, POLL_EVERY_MS);
  }
  function stopPolling() {
    clearTimeout(watchTimer); watchTimer = 0;
    if (!polling) return;
    polling = false; clearInterval(pollTimer); pollTimer = 0;
    drawConn();
  }
  function pollOnce() {
    if (document.hidden || paused || offline || !started) return;
    pollN++;
    messages.resyncOpen();
    if (st === 'ready') {
      Promise.resolve().then(() => data.unreadCounts()).then(applyUnread).catch(() => {});
      if (pollN % 6 === 1) loadDMs(); // new DMs and groups about every 30 s
    }
  }
  const onOnline = () => { offline = false; drawConn(); if (rt === 'live') { if (started) catchUp(); } else armPolling(); };
  const onOffline = () => { offline = true; drawConn(); };
  addEventListener('online', onOnline);
  addEventListener('offline', onOffline);
  if (offline) conn = 'reconnecting';

  // ---------- pause (the overlay is closed): no Realtime, nothing polled here; stores, unsent messages and drafts stay ----------
  function goLive() {
    for (const c of channels) if (isText(c)) subscribeTarget({ channel: c.id });
    for (const d of dms) subscribeTarget({ dm: d.id });
    liveServer();
    watchVoice(true); // (a call itself is not the app's: it goes on while the overlay is closed)
    if (st === 'ready') { clearInterval(friendTimer); friendTimer = setInterval(() => { if (!document.hidden) loadFriends(); }, 45000); }
    if (st === 'ready' && !presenceH && typeof data.presence === 'function') {
      try { presenceH = data.presence({ onSync: (x) => { online = new Set(idsOf(x)); drawMembers(); drawSide(); drawHead(); } }); } catch { presenceH = null; }
    }
    if (rt !== 'live') notLiveSince = Date.now(); // a new join starts now (not when the page opened: waking can take a minute)
    armPolling();
  }
  function pauseLive() {
    if (paused) return;
    paused = true;
    for (const k of [...subs.keys()]) unsubscribe(k);
    if (serverOff) { try { serverOff(); } catch { /* ignore */ } serverOff = null; }
    if (presenceH) { try { presenceH.stop(); } catch { /* ignore */ } presenceH = null; }
    clearInterval(friendTimer); friendTimer = 0;
    watchVoice(false); // the roster stops (a call keeps its own channels: closing the overlay never hangs up)
    switchTyping(null);
    stopPolling();
    rt = 'connecting'; notLiveSince = 0;
    closeProfileCard(); closeMenu(); messages.closePopups();
    drawConn();
    // Realtime would keep its socket open for a while with no channels: close it now (it reconnects on resume).
    setTimeout(() => {
      try { const c = getChat(); if (paused && c && c.realtime && c.getChannels().length === 0) c.realtime.disconnect(); } catch { /* ignore */ }
    }, 1500);
  }
  function resumeLive() {
    if (!paused) return;
    paused = false;
    if (started) {
      goLive(); // Realtime joins again; its 'live' catches the view up (unsent messages go out too)
      if (mode === 'server' && cur) switchTyping({ channel: cur.id });
      else if (mode === 'dms' && curDM) switchTyping({ dm: curDM });
      // The kid is looking at the open conversation again: it counts as read now (markRead skips it while paused).
      if (!document.hidden && messages.atBottom()) {
        if (mode === 'server' && cur) markRead({ channel: cur.id });
        else if (mode === 'dms' && curDM) markRead({ dm: curDM });
      }
    }
    drawConn();
  }

  function applyUnread(rows) {
    unread.clear();
    const list = Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? Object.entries(rows).map(([target, v]) => ({ target, ...v })) : [];
    for (const r of list) if (r && r.target) unread.set(r.target, { unread: r.unread || 0, mentions: r.mentions || 0 });
    if (!document.hidden && messages.atBottom()) {
      if (cur && mode === 'server') unread.delete('c:' + cur.id);
      if (curDM && mode === 'dms') unread.delete('d:' + curDM);
    }
    drawSide();
  }
  function setMembersList(list) {
    members = Array.isArray(list) ? list.filter((p) => p && p.id) : [];
    byId.clear();
    for (const p of members) byId.set(p.id, p);
    usernames = new Set(members.map((p) => p.username).filter(Boolean));
    viewVersion++;
  }
  // Realtime on profiles (names, flair, roles, time-outs, bans), channels (the owner's changes) and DM membership.
  let dmReload = 0;
  function liveServer() {
    if (typeof data.subscribeServer !== 'function' || paused || serverOff) return;
    try {
      serverOff = data.subscribeServer({
        profile: (row) => mergeProfile(row),
        channel: (ev) => {
          if (!ev || !ev.row) return;
          let list = channels.slice();
          if (ev.type === 'delete') { list = list.filter((c) => c.id !== ev.row.id); voice.channelGone(ev.row.id); }
          else {
            const i = list.findIndex((c) => c.id === ev.row.id);
            if (i >= 0) list[i] = { ...list[i], ...ev.row }; else list.push(ev.row);
          }
          setChannels(visible(list));
        },
        category: (ev) => {
          if (!ev || !ev.row || ev.row.id == null) return;
          let list = categories.slice();
          if (ev.type === 'delete') list = list.filter((k) => k.id !== ev.row.id); // (its channels arrive as updates, uncategorized)
          else {
            const i = list.findIndex((k) => k.id === ev.row.id);
            if (i >= 0) list[i] = { ...list[i], ...ev.row }; else list.push(ev.row);
          }
          setCategories(list);
        },
        emoji: (ev) => applyEmojiChange(ev),
        dmMember: (ev) => {
          if (!ev || st !== 'ready') return;
          if (ev.user_id === myId() || dms.some((d) => d.id === ev.dm_id)) { clearTimeout(dmReload); dmReload = setTimeout(() => loadDMs(), 120); }
        },
        // a message in a DM this page doesn't list (its dm_members insert came before the channel joined), and the
        // channel's own (re)join: DMs started meanwhile show up
        dmMessage: (row) => { if (row && st === 'ready' && !dms.some((d) => d.id === row.dm_id)) { clearTimeout(dmReload); dmReload = setTimeout(() => loadDMs(), 120); } },
        status: (s) => { if (s === 'live' && st === 'ready') { clearTimeout(dmReload); dmReload = setTimeout(() => loadDMs(), 120); } },
      });
    } catch { serverOff = null; }
  }

  async function start() {
    const mine = st === 'ready' ? 'ready:' + myId() : st === 'guest' ? 'guest' : '';
    if (!mine || mine === started) return;
    stopLive();
    const g = gen;
    started = mine;
    const uid = st === 'ready' ? myId() : '';
    if (lastUid !== null && uid !== lastUid) composer.clearDrafts(); // another account: its drafts and previews go
    if (lastUid !== null && uid !== lastUid && voice.state().status !== 'idle') voice.leave(); // (that account's call)
    lastUid = uid;
    const dropped = messages.reset(uid); // unsent messages of this account stay (Retry / Discard); anyone else's are cancelled
    if (dropped) toast(dropped === 1 ? 'An unsent message was dropped because the account changed.' : dropped + ' unsent messages were dropped because the account changed.', 'err');
    unread.clear(); online = new Set(); blocked = new Set(); setMembersList([]);
    friendRows = []; faq = []; aiOn = false; extraPeople.clear();
    channels = []; categories = []; cur = null; dms = []; curDM = null; mode = 'server';
    loading = true;
    drawSide(); drawHead(); setComposer(); drawMembers();
    messages.waiting('skeleton');
    let list;
    try {
      let cats;
      [list, cats] = await Promise.all([data.listChannels(), Promise.resolve().then(() => data.listCategories()).catch(() => [])]);
      if (g !== gen) return;
      list = (Array.isArray(list) ? list : []).slice().sort(byPos);
      channels = visible(list);
      categories = (Array.isArray(cats) ? cats : []).filter((k) => k && k.id != null).sort(byPos);
      if (st === 'ready') {
        const [mem, blk, un, dl] = await Promise.all([
          Promise.resolve().then(() => (typeof data.listMembers === 'function' ? data.listMembers() : data.findProfiles(''))).catch(() => []),
          Promise.resolve().then(() => data.listBlocks()).catch(() => []),
          Promise.resolve().then(() => data.unreadCounts()).catch(() => []),
          Promise.resolve().then(() => data.listDMs()).catch(() => []),
        ]);
        if (g !== gen) return;
        setMembersList(mem);
        voiceGate();
        blocked = new Set(idsOf(blk));
        applyUnread(un);
        dms = (Array.isArray(dl) ? dl : []).filter((d) => d && d.id);
      }
    } catch (e) {
      if (g !== gen) return;
      loading = false;
      started = '';
      drawSide();
      messages.waiting(h('div', { class: 'cx-feed-err' }, icon('alert'), h('strong', { text: 'Couldn’t load chat' }), h('span', { text: errText(e) || 'Check your connection and try again.' }),
        h('button', { type: 'button', class: 'cx-btn ghost', onclick: () => start() }, icon('retry'), 'Try again')));
      return;
    }
    loading = false;
    loadEmoji();
    if (st === 'ready') loadFriends();
    if (!paused) goLive();
    armMuteTimer();
    drawMembers();
    ready = true;
    const want = pendingOpen;
    pendingOpen = null;
    if (want && (await doOpen(want))) return;
    if (g !== gen) return;
    const first = pickStart();
    if (first) openChannel(first);
    else { drawSide(); messages.waiting(h('div', { class: 'cx-feed-empty' }, h('strong', { text: 'No channels yet' }))); }
  }

  // open({ channel } | { channelName } | { dm }, optionally with { message } to jump to). true when something opened.
  async function doOpen(target) {
    if (target.dm) {
      if (st !== 'ready') return false;
      let dm = dms.find((d) => d.id === target.dm);
      if (!dm) { await loadDMs(); dm = dms.find((d) => d.id === target.dm); }
      if (!dm) { toast('That conversation isn’t available'); return false; }
      await openDM(dm, true);
    } else {
      const c = channels.find((x) => isText(x) && ((target.channel != null && x.id === target.channel) || (target.channelName && x.name === target.channelName)));
      if (!c) return false;
      await openChannel(c, true);
    }
    if (target.message != null) await messages.jumpTo(target.message);
    return true;
  }

  function applyState(s) {
    st = s;
    const off = s === 'off';
    offEl.hidden = !off;
    shell.hidden = off;
    root.classList.toggle('is-off', off);
    root.dataset.state = s;
    if ((off || s === 'guest') && voice.state().status !== 'idle') voice.leave(); // signed out (or chat is off): no voice
    if (off) { stopLive(); started = ''; drawOff(); banner.hidden = true; if (!compact) document.title = BASE_TITLE; return; }
    drawBanner();
    if (s === 'ready' || s === 'guest') { start(); }
    else {
      if (started) { stopLive(); started = ''; }
      cur = null; channels = []; dms = []; curDM = null; mode = 'server'; loading = false;
      drawSide(); drawHead(); setComposer(); drawMembers();
      messages.waiting(s === 'waking' ? 'skeleton' : h('div', { class: 'cx-feed-empty' },
        h('span', { class: 'cx-empty-ic big', 'aria-hidden': 'true' }, icon(s === 'asleep' ? 'moon' : 'alert')),
        h('strong', { text: s === 'asleep' ? 'Shh, chat is napping' : 'Chat is offline for a moment' }),
        h('span', { text: s === 'asleep' ? 'Messages are safe. They’ll be here when it wakes up.' : 'Nothing is lost. Try again in a bit.' })));
    }
    drawPanels();
  }

  const offState = onChatState((s) => applyState(s));
  const onVis = () => {
    if (!document.hidden && st === 'ready' && mode === 'friends') loadFriends();
    if (document.hidden || paused || !messages.atBottom()) return;
    if (cur && mode === 'server') markRead({ channel: cur.id });
    else if (curDM && mode === 'dms') markRead({ dm: curDM });
  };
  document.addEventListener('visibilitychange', onVis);
  // Drop pictures anywhere on the conversation to attach them.
  main.addEventListener('dragover', (e) => { if (st === 'ready' && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); main.classList.add('drop'); } });
  main.addEventListener('dragleave', (e) => { if (!main.contains(e.relatedTarget)) main.classList.remove('drop'); });
  main.addEventListener('drop', (e) => { main.classList.remove('drop'); if (st === 'ready' && e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); composer.addFiles(e.dataTransfer.files); } });

  applyState(chatState());
  ensureChatSession().catch(() => {});

  return {
    // Open a conversation: { channel: id } | { channelName: 'general' } | { dm: id }, with an optional { message: id } to
    // jump to. Asked before chat has loaded (the overlay's pop-ups, a link from the owner Inbox), it waits and opens then.
    open(target) {
      if (!target) return;
      if (!ready) { pendingOpen = target; return; }
      doOpen(target);
    },
    // The overlay: closed = paused (no Realtime socket; unsent messages, drafts and the loaded conversations stay),
    // opened = live again with a catch-up.
    pause() { pauseLive(); },
    resume() { resumeLive(); },
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
      clearTimeout(dmReload);
      offEmoji();
      offVoice();
      if (chatState() !== 'ready' && voice.state().status !== 'idle') voice.leave(); // (the overlay drops the app only when chat goes off)
      root.replaceChildren();
    },
  };
}
