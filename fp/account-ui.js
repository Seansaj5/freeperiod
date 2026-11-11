// Header account chip: Log in, or your chat look (avatar with its frame, name style, online dot) once chat has you, else
// your name + streak + role. Pressing it opens your mini profile card (Discord-style): banner, avatar, name, @username,
// role, status, streak and badges, then View profile / Edit profile / Set status / Messages / Inbox / Theme / Log out.
// A popover under the chip on wide screens, a bottom sheet on phones; Esc or a click outside closes it.
// Chat is never waited on: the chip draws at once and picks up the chat profile when it arrives (read once on load and
// again each time the card opens; on the Messages page, where chat is open anyway, live profile updates too).
import * as session from './session.js';
import * as store from './store.js';
import { h, openSheet, toast, errText } from './ui.js';
import { icon } from './icons.js';
import { openInbox } from './inbox.js';
import { getStreak, peekStreak, bestBadge, onStreak } from './streak.js';
import { ACCENTS, themeAccent, getAccent, setAccent, onAccent } from './theme.js';
import { openThemeSheet } from './theme-sheet.js';
import { chatConfigured, chatKit } from './chat-profile.js';
import { chipModel, statusPatch, unreadDMs, countLabel, STATUS_PRESETS, STATUS_EMOJI, STATUS_TEXT_MAX } from './account-model.js';
import { TROPHIES } from './trophies.js';

export function openAuthSheet(startTab = 'login') {
  let tab = startTab;
  const sheet = openSheet({ title: 'Free Period account' });
  const tabs = h('div', { class: 'fp-tabs', role: 'tablist' });
  const form = h('form', { class: 'fp-form', novalidate: true });
  sheet.body.append(
    h('p', { class: 'fp-note', text: 'Your Bing Ball account works here too, and it keeps your favorites, play time and saves.' }),
    tabs, form);

  function draw() {
    tabs.replaceChildren(...[['login', 'Log in'], ['signup', 'Sign up']].map(([k, label]) =>
      h('button', { type: 'button', role: 'tab', class: 'fp-tab' + (tab === k ? ' on' : ''), 'aria-selected': tab === k ? 'true' : 'false',
        onclick: () => { tab = k; draw(); sheet.focus(); } }, label)));
    const user = h('input', { id: 'fp-user', name: 'username', autocomplete: 'username', required: true, maxlength: '24', autocapitalize: 'none', spellcheck: 'false' });
    const pass = h('input', { id: 'fp-pass', name: 'password', type: 'password', required: true, autocomplete: tab === 'login' ? 'current-password' : 'new-password' });
    const err = h('p', { class: 'fp-err', role: 'alert' });
    const go = h('button', { type: 'submit', class: 'fp-btn' }, tab === 'login' ? 'Log in' : 'Create account');
    form.replaceChildren(
      h('label', { for: 'fp-user' }, 'Username'), user,
      h('label', { for: 'fp-pass' }, 'Password'), pass,
      err, go);
    form.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!user.value.trim() || !pass.value) { err.textContent = 'Enter a username and password.'; return; }
      go.disabled = true;
      go.textContent = 'One moment...';
      try {
        const fn = tab === 'login' ? session.login : session.register;
        const u = await fn(user.value.trim(), pass.value);
        sheet.close();
        toast('Hi ' + u.username);
      } catch (ex) {
        err.textContent = errText(ex);
        go.disabled = false;
        go.textContent = tab === 'login' ? 'Log in' : 'Create account';
      }
    };
  }
  draw();
  sheet.focus();
}

const fire = '\u{1F525}';
const streakNow = () => { const v = getStreak() || peekStreak(); return v && v.days > 0 ? v : null; };
function trophyCount() {
  const all = store.json('fp.trophies', null), rec = all && typeof all === 'object' ? all[session.userKey()] : null;
  return rec && rec.got && typeof rec.got === 'object' ? Object.keys(rec.got).filter((id) => TROPHIES.some((t) => t.id === id)).length : 0;
}
const phone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches;

// ---------- chat: my profile, read without a Realtime socket ----------
const chat = { kit: null, profile: null, unread: 0, state: 'off', live: false };
const chatListeners = new Set();
const chatChanged = () => { for (const fn of [...chatListeners]) { try { fn(); } catch { /* ignore */ } } };
let readSeq = 0;
async function readMine() {
  const k = chat.kit;
  if (!k || k.client.chatState() !== 'ready') return;
  const me = k.client.me(), my = ++readSeq;
  if (!me) return;
  try {
    const [p, rows] = await Promise.all([k.data.getProfile(me.id), k.data.unreadCounts().catch(() => null)]);
    if (my !== readSeq || k.client.chatState() !== 'ready') return;
    chat.profile = p || null;
    if (rows) chat.unread = unreadDMs(rows);
    chatChanged();
  } catch { /* asleep: keep what is shown */ }
}
let chatStarted = false;
function startChat({ live }) {
  if (chatStarted || !chatConfigured()) return;
  chatStarted = true;
  chatKit().then((k) => {
    chat.kit = k;
    let unsub = null;
    const onState = (s) => {
      chat.state = s;
      if (s === 'ready') {
        readMine();
        // the Messages page has chat's Realtime channel open already: follow profile edits live there
        if (live && !unsub) unsub = k.data.subscribeServer({ profile: (row) => { const me = k.client.me(); if (row && me && row.id === me.id) { chat.profile = row; chatChanged(); } } });
      } else {
        readSeq++;
        if (unsub) { unsub(); unsub = null; }
        if (chat.profile || chat.unread) { chat.profile = null; chat.unread = 0; }
        chatChanged();
      }
    };
    k.client.onChatState(onState);
    onState(k.client.chatState());
    k.client.ensureChatSession().catch(() => {});
  }).catch(() => { chatStarted = false; });
}
/** Mine, when it really is mine (a profile from another account is never shown). */
function myChat() {
  const u = session.getUser(), p = chat.profile;
  return u && p && typeof p.username === 'string' && p.username.toLowerCase() === u.username.toLowerCase() ? p : null;
}

// ---------- the chip ----------
function chipFace(user) {
  const st = streakNow();
  const p = myChat(), k = chat.kit;
  const m = chipModel(user, p, st ? st.days : 0);
  const kids = [];
  if (m.kind === 'chat' && k) {
    const av = k.common.avatar(p, { size: 32, frame: 'hover', status: 'online', cls: 'fp-chip-av' });
    kids.push(av, k.common.nameEl(p, 'span', 'fp-name'));
  } else kids.push(h('span', { class: 'fp-name', text: m.name }));
  if (m.streak) kids.push(h('span', { class: 'fp-streak', title: m.streak + '-day streak', 'aria-label': m.streak + '-day streak', text: fire + m.streak }));
  if (m.role) kids.push(h('span', { class: 'fp-badge ' + m.role, text: m.role }));
  return { kids, chatLook: m.kind === 'chat' && !!k };
}

// ---------- the card ----------
function banner(p, k) {
  const el = h('div', { class: 'fp-me-banner' });
  if (p && k) {
    if (k.flair.isHex(p.banner_color)) el.style.background = p.banner_color;
    if (p.banner_path) k.common.mediaSrc({ bucket: 'public-media', path: p.banner_path }).then((src) => { if (src) { const img = h('img', { alt: '', src }); img.addEventListener('error', () => img.remove()); el.append(img); } });
  }
  return el;
}
function cardHead(user) {
  const p = myChat(), k = chat.kit, st = streakNow();
  const av = p && k ? k.common.avatar(p, { size: 72, frame: 'auto', status: 'online', cls: 'fp-me-av' })
    : h('span', { class: 'fp-me-av plain', 'aria-hidden': 'true', text: user.username.slice(0, 2).toUpperCase() });
  // chat's badge row (Discord-style glyphs with tooltips, the same as the chat profile card); without chat, the streak badge
  const badges = p && k ? k.common.badgePills(p) : [];
  const best = !(p && k) && st ? bestBadge(st.badges) : null;
  const name = p && k ? k.common.nameEl(p, 'b', 'fp-me-name') : h('b', { class: 'fp-me-name', text: user.username });
  // the chat pills already say Owner / Mod; without chat the role badge says it
  const role = !(p && k) && user.role && user.role !== 'player' ? h('span', { class: 'fp-badge ' + user.role, text: user.role }) : null;
  const status = p && (p.status_emoji || p.status_text)
    ? h('p', { class: 'fp-me-status' }, p.status_emoji ? h('span', { class: 'fp-me-emoji', text: p.status_emoji }) : null, h('span', { text: p.status_text || '' }))
    : null;
  const theme = p && k ? k.flair.cardTheme(p) : null;
  const trophies = trophyCount();
  return h('div', { class: 'fp-me-card' + (theme ? ' themed' : ''), style: theme ? '--me-theme:' + theme : null },
    banner(p, k),
    h('span', { class: 'fp-me-grab', 'aria-hidden': 'true' }),
    h('button', { type: 'button', class: 'fp-me-x', 'aria-label': 'Close', onclick: () => document.dispatchEvent(new CustomEvent('fp:me-close')) }, icon('x')),
    h('div', { class: 'fp-me-top' }, av, badges.length ? h('div', { class: 'fp-me-badges', role: 'group', 'aria-label': 'Badges' }, badges) : null),
    h('div', { class: 'fp-me-id' },
      h('div', { class: 'fp-me-names' }, name, role),
      h('span', { class: 'fp-me-user', text: '@' + user.username }),
      best ? h('div', { class: 'fp-me-pills' }, h('span', { class: 'fp-me-pill', text: best.label })) : null,
      status,
      h('div', { class: 'fp-me-chips' },
        st ? h('span', { class: 'fp-me-chip streak' }, icon('flame'), `${st.days}-day streak`) : null,
        h('a', { class: 'fp-me-chip', href: 'trophies.html' }, icon('trophy'), `${trophies} / ${TROPHIES.length} trophies`))));
}

export function mountAccount(el, { live = !!(document.body && document.body.classList.contains('chat-page')) } = {}) {
  const root = h('div', { class: 'fp-account' });
  el.append(root);
  let pop = null;      // { el, scrim, close }

  function render() {
    if (chat.kit) chat.kit.common.stopFrames(root);      // the old chip's animated frame lets go of its observer
    const user = session.getUser();
    if (!user) {
      root.replaceChildren(h('button', { type: 'button', class: 'fp-chip', onclick: () => openAuthSheet('login') }, 'Log in'));
      return;
    }
    const face = chipFace(user);
    const btn = h('button', { type: 'button', class: 'fp-chip on' + (face.chatLook ? ' has-av' : ''), 'aria-haspopup': 'dialog', 'aria-expanded': pop ? 'true' : 'false',
      'aria-label': 'Your account: ' + user.username, onclick: () => (pop ? closeCard() : openCard()) }, face.kids);
    if (face.chatLook) chat.kit.common.hotOnHover(btn);
    root.replaceChildren(btn);
  }

  // ---------- open / close ----------
  function place() {
    if (!pop || phone()) { if (pop) { pop.el.style.top = ''; pop.el.style.right = ''; } return; }
    const chip = root.querySelector('.fp-chip');
    if (!chip) return;
    const r = chip.getBoundingClientRect();
    pop.el.style.top = Math.round(r.bottom + 10) + 'px';
    pop.el.style.right = Math.max(10, Math.round(innerWidth - r.right)) + 'px';
  }
  function closeCard({ focus = true } = {}) {
    if (!pop) return;
    const p = pop;
    pop = null;
    if (chat.kit) { chat.kit.common.stopFrames(p.el); chat.kit.common.hideBadgeTip(); }
    if (p.fx) { p.fx.stop(); p.fx = null; }
    p.el.remove(); p.scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
    removeEventListener('resize', place);
    removeEventListener('scroll', place);
    document.body.classList.toggle('fp-locked', !!document.querySelector('.fp-backdrop'));
    render();
    if (focus) { const c = root.querySelector('.fp-chip'); if (c) c.focus(); }
  }
  function onKey(e) {
    if (!pop || document.querySelector('.fp-backdrop')) return;      // a sheet opened from the card handles its own keys
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (pop.sub) drawMenu(); else closeCard(); return; }
    const items = [...pop.el.querySelectorAll('a[href], button:not([disabled]), input, [tabindex="0"]')].filter((n) => !n.closest('[hidden]'));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Tab') {      // keep focus inside the card
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !(document.activeElement && document.activeElement.tagName === 'INPUT')) {
      e.preventDefault();
      const rows = items.filter((n) => n.classList.contains('fp-me-item'));
      const j = rows.indexOf(document.activeElement);
      const next = rows[(j + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
      if (next) next.focus();
    }
  }
  function onOutside(e) {
    if (!pop) return;
    const path = e.composedPath();
    if (path.includes(pop.el) || path.includes(root) || document.querySelector('.fp-backdrop')) return;
    if (path.some((n) => n && n.classList && n.classList.contains('cx-btip'))) return;
    closeCard({ focus: false });
  }

  // ---------- the card's menu and its status panel ----------
  function item(ic, label, { href, onClick, extra, cls = '' } = {}) {
    const kids = [h('span', { class: 'fp-me-ic', 'aria-hidden': 'true' }, icon(ic)), h('span', { class: 'fp-me-label', text: label }), extra || null];
    return href ? h('a', { class: 'fp-me-item ' + cls, href }, kids)
      : h('button', { type: 'button', class: 'fp-me-item ' + cls, onclick: onClick }, kids);
  }
  function themeRow() {
    const cur = getAccent();
    return h('div', { class: 'fp-me-theme' },
      h('span', { class: 'fp-me-ic', 'aria-hidden': 'true' }, icon('palette')),
      h('button', { type: 'button', class: 'fp-me-label fp-me-theme-link', id: 'fp-me-theme-l', title: 'All themes', onclick: () => { closeCard(); openThemeSheet(); } }, 'Theme'),
      h('div', { class: 'fp-swatches', role: 'radiogroup', 'aria-labelledby': 'fp-me-theme-l' }, [themeAccent(), ...ACCENTS].map((a) =>
        h('button', { type: 'button', class: 'fp-swatch' + (a.id === cur ? ' on' : ''), role: 'radio', 'aria-checked': a.id === cur ? 'true' : 'false',
          'aria-label': a.label, title: a.label, style: `--sw:${a.color};--sw2:${a.second}`,
          onclick: () => { setAccent(a.id); const again = pop && pop.el.querySelector(`.fp-swatch[aria-label="${a.label}"]`); if (again) again.focus(); } }))));      // setAccent redraws the card (onAccent)
  }
  function drawMenu() {
    if (!pop) return;
    pop.sub = null;
    const user = session.getUser();
    if (!user) { closeCard(); return; }
    const p = myChat(), ready = chat.state === 'ready' && !!chat.kit;
    if (chat.kit) chat.kit.common.stopFrames(pop.el);
    const unread = countLabel(chat.unread);
    if (pop.fx) { pop.fx.stop(); pop.fx = null; }
    if (chat.kit) chat.kit.common.hideBadgeTip();
    const head = cardHead(user);
    // the profile effect plays over the card while it is open (as on the chat profile card)
    if (p && p.effect && chat.kit) {
      const mine = pop;
      import('./chat/effects.js').then((fx) => {
        if (pop !== mine || !head.isConnected) return;
        try { mine.fx = fx.mountEffect(head, p.effect, { accent: chat.kit.flair.isHex(p.name_color) ? p.name_color : undefined }); } catch { /* no effect */ }
      }).catch(() => {});
    }
    pop.el.replaceChildren(...[
      head,
      h('div', { class: 'fp-me-menu' },
        item('user', 'View profile', { href: 'profile.html?u=' + encodeURIComponent(user.username) }),
        ready && p ? item('edit', 'Edit profile', { onClick: openEditor }) : null,
        ready && p ? item('smile', p.status_text || p.status_emoji ? 'Change status' : 'Set a status', { onClick: drawStatus }) : null,
        chatConfigured() && chat.state !== 'off' ? item('chat', 'Messages', { href: 'chat.html', extra: unread ? h('span', { class: 'fp-me-count', 'aria-label': chat.unread + ' unread direct messages', text: unread }) : null }) : null,
        user.role === 'owner' ? item('inbox', 'Inbox', { onClick: () => { closeCard({ focus: false }); openInbox(); } }) : null,
        h('div', { class: 'fp-me-sep', role: 'separator' }),
        themeRow(),
        h('div', { class: 'fp-me-sep', role: 'separator' }),
        item('logout', 'Log out', { cls: 'danger', onClick: async () => { closeCard(); await session.logout(); toast('Logged out'); } })),
      // chat up but no profile yet: say so; chat off, asleep or broken: the card simply has no chat parts
      chatConfigured() && !p && (chat.state === 'ready' || chat.state === 'waking') ? h('p', { class: 'fp-me-note', text: chat.state === 'waking' ? 'Waking up chat...' : 'Loading your chat profile...' }) : null].filter(Boolean));
    place();
  }
  function drawStatus() {
    if (!pop) return;
    const p = myChat();
    if (!p || !chat.kit) return;
    pop.sub = 'status';
    if (pop.fx) { pop.fx.stop(); pop.fx = null; }
    if (chat.kit) chat.kit.common.stopFrames(pop.el);
    let emoji = p.status_emoji || '', busy = false;
    const err = h('p', { class: 'fp-err', role: 'alert' });
    const text = h('input', { class: 'fp-me-input', type: 'text', maxlength: String(STATUS_TEXT_MAX), placeholder: 'What are you up to?', 'aria-label': 'Status text', value: p.status_text || '' });
    const emojiRow = h('div', { class: 'fp-me-emojis', role: 'radiogroup', 'aria-label': 'Status emoji' });
    const drawEmoji = () => emojiRow.replaceChildren(...STATUS_EMOJI.map((e) => h('button', { type: 'button', class: 'fp-me-e' + (e === emoji ? ' on' : ''), role: 'radio', 'aria-checked': e === emoji ? 'true' : 'false', 'aria-label': e, text: e,
      onclick: () => { emoji = emoji === e ? '' : e; drawEmoji(); } })));
    drawEmoji();
    async function save(e, t) {
      if (busy) return;
      const r = statusPatch(e, t);
      if (!r.ok) { err.textContent = r.error; return; }
      busy = true; err.textContent = '';
      try {
        const row = await chat.kit.data.updateProfile(r.patch);
        if (row) chat.profile = row;
        chatChanged();
        toast(r.patch.status_text || r.patch.status_emoji ? 'Status set' : 'Status cleared');
        drawMenu();
        const first = pop && pop.el.querySelector('.fp-me-item'); if (first) first.focus();
      } catch (ex) {
        err.textContent = (() => { try { return chat.kit.data.chatError(ex); } catch { return 'Couldn’t save that. Try again.'; } })();
      } finally { busy = false; }
    }
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(emoji, text.value); } });
    pop.el.replaceChildren(
      h('div', { class: 'fp-me-sub' },
        h('div', { class: 'fp-me-subhead' },
          h('button', { type: 'button', class: 'fp-me-back', 'aria-label': 'Back', onclick: () => { drawMenu(); } }, icon('chevL')),
          h('b', { text: 'Set a status' })),
        h('div', { class: 'fp-me-presets' }, STATUS_PRESETS.map((s) => h('button', { type: 'button', class: 'fp-me-preset' + (p.status_text === s.text && p.status_emoji === s.emoji ? ' on' : ''), onclick: () => save(s.emoji, s.text) },
          h('span', { class: 'fp-me-emoji', text: s.emoji }), h('span', { text: s.text })))),
        h('p', { class: 'fp-me-cap', text: 'Or your own' }),
        emojiRow, text, err,
        h('div', { class: 'fp-me-row' },
          p.status_text || p.status_emoji ? h('button', { type: 'button', class: 'fp-mini danger', onclick: () => save('', '') }, 'Clear status') : h('span'),
          h('button', { type: 'button', class: 'fp-btn fp-me-save', onclick: () => save(emoji, text.value) }, 'Save'))));
    text.focus();
  }
  async function openEditor() {
    const k = chat.kit, p = myChat();
    if (!k || !p) return;
    closeCard({ focus: false });
    try {
      const [{ openProfileEditor }, blockedIds] = await Promise.all([import('./chat/views/profile-editor.js'), k.data.listBlocks().catch(() => [])]);
      const blocked = (await Promise.all((blockedIds || []).slice(0, 50).map((id) => k.data.getProfile(id).catch(() => null)))).filter(Boolean);
      openProfileEditor({
        me: () => myChat() || p,
        blockedProfiles: () => blocked,
        unblock: async (id) => { await k.data.block(id, false); const i = blocked.findIndex((b) => b.id === id); if (i >= 0) blocked.splice(i, 1); },
        applyProfile: (row) => { if (row) { chat.profile = row; chatChanged(); } },
      });
    } catch { toast('Couldn’t open the editor. Try it in Messages.', 'err'); }
  }
  function openCard() {
    if (pop || !session.getUser()) return;
    const el = h('div', { class: 'fp-me', role: 'dialog', 'aria-label': 'Your account', tabindex: '-1' });
    const scrim = h('div', { class: 'fp-me-scrim', onclick: () => closeCard() });
    pop = { el, scrim, sub: null };
    document.body.append(scrim, el);
    if (phone()) document.body.classList.add('fp-locked');
    drawMenu();
    render();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    addEventListener('resize', place, { passive: true });
    addEventListener('scroll', place, { passive: true });
    const first = el.querySelector('.fp-me-item');
    (first || el).focus({ preventScroll: true });
    readMine();      // fresh profile + unread count each time it opens
  }

  document.addEventListener('fp:me-close', () => closeCard());
  chatListeners.add(() => { render(); if (pop && !pop.sub) { const had = pop.el.contains(document.activeElement) ? document.activeElement.textContent : null; drawMenu(); if (had) { const again = [...pop.el.querySelectorAll('.fp-me-item')].find((n) => n.textContent === had); if (again) again.focus(); } } });
  session.onChange(() => { closeCard({ focus: false }); chat.profile = null; chat.unread = 0; render(); });
  onStreak(render);
  onAccent(() => { if (pop && !pop.sub) drawMenu(); });
  render();
  if (session.getUser()) startChat({ live });
  session.onChange(() => { if (session.getUser()) startChat({ live }); });
}
