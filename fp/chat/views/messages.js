// Message list: grouped by author within 5 min, day dividers, replies, reactions, pictures with a lightbox, deleted /
// edited / pinned / blocked, pending + failed (Retry), live updates, older messages on scroll-up (position kept).
// Message bodies go through format.js (tokens -> DOM); nothing here uses innerHTML.
import { h, openSheet, toast } from '../../ui.js';
import { parseMessage, renderTokens, mentionsMe } from '../format.js';
import { loadMessages, react as sendReact, editMessage, deleteMessage, retrySend, discardSend, chatError as dataError } from '../data.js';
import { QUICK_REACTIONS, emojiName } from '../emoji-data.js';
import { icon, avatar, nameEl, nameOf, roleMark, timeShort, fullStamp, dayKey, dayLabel, mediaSrc, finePointer } from './common.js';
import { openEmojiPicker, closeEmojiPicker } from './emoji-picker.js';
import { CAP, matchTemp, splitPending, capWindow } from '../feedlogic.js';

const PAGE = 50;
const GROUP_MS = 5 * 60e3;
const tkey = (t) => (t.dm ? 'd:' + t.dm : 'c:' + t.channel);
const JUMBO = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|️|‍|⃣|[#*0-9]|\s)+$/u;
const err = (e) => { try { return dataError(e) || 'Something went wrong'; } catch { return 'Something went wrong'; } };

export function mountMessages(el, ctx) {
  el.classList.add('cx-feedwrap');
  const list = h('div', { class: 'cx-feed-list', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const scroller = h('div', { class: 'cx-feed', tabindex: '-1' }, list);
  const jumpText = h('span');
  const jump = h('button', { type: 'button', class: 'cx-jump', hidden: true, onclick: () => toBottom(true) }, jumpText, icon('down'));
  el.replaceChildren(scroller, jump);

  const stores = new Map(); // target key -> store
  const pendingByTarget = new Map(); // target key -> unsent (pending / failed) temps; outlives a store reset, re-attached when the channel loads
  let closeLightbox = null;
  let store = null;          // the open conversation
  let stick = true;          // pinned to the bottom?
  let editing = null;        // message id being edited
  let touched = null;        // row showing its tools on a touch screen
  const revealed = new Set(); // blocked messages the person chose to show
  const rows = new WeakMap(); // message -> { el, sig }
  const days = new Map();     // day key -> divider element
  const newDiv = h('div', { class: 'cx-newdiv', role: 'separator' }, h('span', { text: 'New' }));

  const me = () => ctx.me() || {};
  const isMine = (m) => !!me().id && m.author_id === me().id;
  const authorOf = (m) => m.author || ctx.profile(m.author_id) || { id: m.author_id, username: 'someone' };
  const sortKey = (a, b) => a._t - b._t || (Number(a.id) || 0) - (Number(b.id) || 0);

  // ---------- data ----------
  function norm(m) {
    const t = Date.parse(m.created_at);
    m._t = Number.isFinite(t) ? t : Date.now();
    m._v = (m._v || 0) + 1;
    m.attachments = Array.isArray(m.attachments) ? m.attachments : [];
    m.reactions = normReacts(m.reactions);
    return m;
  }
  // Accepts summarized [{ emoji, count, mine }] or raw rows [{ emoji, user_id }].
  function normReacts(rs) {
    if (!Array.isArray(rs)) return [];
    if (!rs.length || rs[0].count != null) return rs.filter((r) => r && r.emoji && r.count > 0).map((r) => ({ emoji: r.emoji, count: r.count, mine: !!r.mine }));
    const by = new Map();
    for (const r of rs) {
      if (!r || !r.emoji) continue;
      const x = by.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      x.count++; if (r.user_id && r.user_id === me().id) x.mine = true;
      by.set(r.emoji, x);
    }
    return [...by.values()];
  }
  function newStore(target, channel) {
    const key = tkey(target);
    if (!pendingByTarget.has(key)) pendingByTarget.set(key, []);
    return { key, target, channel, msgs: [], ids: new Map(), temps: pendingByTarget.get(key), newerCut: false, reloading: false, hasMore: true, loading: false, loaded: false, olderErr: false, newFrom: null, scroll: null, unseen: 0 };
  }
  function addAll(s, ms) {
    for (const m of ms) {
      if (!m || m.id == null) continue;
      const old = s.ids.get(m.id);
      if (old) { Object.assign(old, m); norm(old); continue; }
      norm(m); s.ids.set(m.id, m); s.msgs.push(m);
    }
    s.msgs.sort(sortKey);
    reconcile(s);
  }
  // A fetched row that carries a temp's client_id IS that send (accepted although its answer was lost): the temp goes.
  function reconcile(s) {
    if (!s.temps.length) return;
    for (const m of s.msgs) { const t = m.client_id ? matchTemp(s.temps, m) : null; if (t) dropTemp(t); }
  }
  const find = (id) => { for (const s of stores.values()) { const m = s.ids.get(id); if (m) return [s, m]; } return [null, null]; };
  const findTemp = (tempId) => { for (const [k, arr] of pendingByTarget) { const m = arr.find((x) => x.tempId === tempId); if (m) return [stores.get(k) || null, m]; } return [null, null]; };
  const revokeLocal = (m, wait = 5000) => { for (const f of m._local || []) { if (wait) setTimeout(() => URL.revokeObjectURL(f.url), wait); else URL.revokeObjectURL(f.url); } m._local = []; };
  function dropTemp(m, wait = 5000) { // in place: the store shares this array
    for (const arr of pendingByTarget.values()) { const i = arr.indexOf(m); if (i >= 0) arr.splice(i, 1); }
    revokeLocal(m, wait);
  }
  // Over 500 messages: drop the far end (the oldest, or the newest while the reader is up in the history; coming back re-fetches).
  function enforceCap(s) {
    const up = s === store && !stick;
    const r = capWindow(s.msgs, CAP, up, editing);
    if (!r.dropped.length) return;
    s.msgs = r.keep;
    for (const m of r.dropped) s.ids.delete(m.id);
    if (up) s.newerCut = true; else s.hasMore = true;
  }
  async function reloadLatest(s) {
    if (!s || s.reloading) return;
    s.reloading = true;
    let got;
    try { got = await loadMessages(s.target, { limit: PAGE }); } catch { s.reloading = false; return; }
    s.reloading = false;
    if (!Array.isArray(got)) return;
    s.msgs = []; s.ids.clear();
    addAll(s, got);
    s.hasMore = got.length >= PAGE; s.newerCut = false; s.unseen = 0;
    if (s === store) { paint(); toBottom(); ctx.onRead && ctx.onRead(s.target); }
  }

  // ---------- scroll ----------
  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;
  function toBottom(smooth) {
    stick = true;
    if (smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    else scroller.scrollTop = scroller.scrollHeight;
    if (store) { store.unseen = 0; }
    drawJump();
  }
  function drawJump() {
    if (!store || stick) { jump.hidden = true; return; }
    const far = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > scroller.clientHeight * 1.5;
    if (store.unseen > 0) { jump.hidden = false; jump.className = 'cx-jump new'; jumpText.textContent = store.unseen + (store.unseen === 1 ? ' new message' : ' new messages'); }
    else if (far || store.newerCut) { jump.hidden = false; jump.className = 'cx-jump'; jumpText.textContent = 'Jump to present'; }
    else jump.hidden = true;
  }
  scroller.addEventListener('scroll', () => {
    stick = nearBottom();
    if (store && stick) { if (store.newerCut) reloadLatest(store); else { if (store.unseen) store.unseen = 0; ctx.onRead && ctx.onRead(store.target); } }
    drawJump();
    if (store && store.loaded && store.hasMore && !store.loading && !store.olderErr && scroller.scrollTop < 700) loadOlder();
  }, { passive: true });
  const feedRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (stick && store) scroller.scrollTop = scroller.scrollHeight; }) : null;
  if (feedRO) feedRO.observe(scroller);

  async function loadOlder() {
    const s = store;
    if (!s || s.loading || !s.hasMore) return;
    s.loading = true; s.olderErr = false; paintTop();
    const oldest = s.msgs[0];
    let got;
    try { got = await loadMessages(s.target, { before: oldest ? oldest.id : undefined, limit: PAGE }); }
    catch { s.loading = false; s.olderErr = true; if (s === store) paintTop(); return; }
    s.loading = false;
    got = Array.isArray(got) ? got : [];
    if (got.length < PAGE) s.hasMore = false;
    addAll(s, got);
    if (s !== store) { enforceCap(s); return; }
    // keep the row the reader is looking at in place (anchor on a row: the cap may drop rows at the bottom too)
    const top = scroller.getBoundingClientRect().top;
    const seen = [...list.querySelectorAll('.cx-msg')].filter((r) => r.getBoundingClientRect().bottom > top + 1);
    const anchor = seen[1] || seen[0]; // not the first row: its own grouping (and height) can change when older rows join it
    const aId = anchor && anchor.dataset.mid, aTop = anchor ? anchor.getBoundingClientRect().top : 0, fromBottom = scroller.scrollHeight - scroller.scrollTop;
    enforceCap(s);
    paint();
    const again = aId != null && list.querySelector('[data-mid="' + CSS.escape(aId) + '"]');
    if (again) scroller.scrollTop += again.getBoundingClientRect().top - aTop;
    else scroller.scrollTop = scroller.scrollHeight - fromBottom;
  }

  // ---------- rendering ----------
  function topNode(s) {
    if (s.hasMore || s.olderErr) {
      return h('div', { class: 'cx-older' + (s.olderErr ? ' err' : '') },
        s.olderErr ? [h('span', { text: 'Couldn’t load older messages.' }), h('button', { type: 'button', class: 'cx-link', onclick: () => { s.olderErr = false; loadOlder(); } }, 'Try again')]
          : [h('i', { class: 'cx-spin', 'aria-hidden': 'true' }), h('span', { text: 'Loading older messages…' })]);
    }
    const ch = s.channel || {};
    const name = ch.name || 'chat';
    return h('div', { class: 'cx-start' },
      h('span', { class: 'cx-start-emoji', 'aria-hidden': 'true', text: ch.emoji || '#' }),
      h('h2', {}, 'Welcome to ', h('span', { text: '#' + name })),
      h('p', { text: ch.topic || 'This is the very start of #' + name + '.' }),
      ch.owner_only ? h('p', { class: 'cx-start-note' }, icon('lock'), 'Only Sean and mods post here. Everyone can read and react.') : null);
  }
  function paintTop() {
    if (!store) return;
    const first = list.firstElementChild;
    const fresh = topNode(store);
    if (first && (first.classList.contains('cx-older') || first.classList.contains('cx-start'))) first.replaceWith(fresh); else list.prepend(fresh);
  }
  function canGroup(a, b) {
    return !!a && a.author_id === b.author_id && b._t - a._t < GROUP_MS && !b.reply_to && !a.failed
      && ctx.isBlocked(a.author_id) === ctx.isBlocked(b.author_id) && !ctx.isBlocked(b.author_id);
  }
  function dayDivider(t) {
    const k = dayKey(t);
    let d = days.get(k);
    const label = dayLabel(t);
    if (!d || d._label !== label) { d = h('div', { class: 'cx-daydiv', role: 'separator' }, h('span', { text: label })); d._label = label; days.set(k, d); }
    return d;
  }
  function paint() {
    const s = store;
    if (!s) return;
    const nodes = [topNode(s)];
    let prev = null;
    for (const m of [...s.msgs, ...s.temps]) {
      let grouped = canGroup(prev, m);
      if (!prev || dayKey(prev._t) !== dayKey(m._t)) { nodes.push(dayDivider(m._t)); grouped = false; }
      if (s.newFrom != null && m.id === s.newFrom) { nodes.push(newDiv); grouped = false; }
      nodes.push(rowEl(m, grouped));
      prev = m;
    }
    // Patch the list instead of replacing it: unchanged rows stay put (no re-announcing in the live log, less layout work).
    const keep = new Set(nodes);
    for (const ch of [...list.children]) if (!keep.has(ch)) ch.remove();
    let at = list.firstChild;
    for (const n of nodes) { if (at === n) { at = at.nextSibling; continue; } list.insertBefore(n, at); }
  }
  function rowEl(m, grouped) {
    const blocked = ctx.isBlocked(m.author_id) && !revealed.has(m.id);
    const sig = m._v + '|' + grouped + '|' + blocked + '|' + (editing === m.id) + '|' + !!ctx.canReact() + '|' + ctx.version();
    const c = rows.get(m);
    if (c && c.sig === sig) return c.el;
    const el2 = buildRow(m, grouped, blocked);
    rows.set(m, { el: el2, sig });
    return el2;
  }
  function repaintRow(m) { if (store && (store.ids.get(m.id) === m || store.temps.includes(m))) paint(); }

  function buildRow(m, grouped, blocked) {
    const a = authorOf(m);
    if (blocked) {
      return h('div', { class: 'cx-msg blocked', dataset: { mid: String(m.id) } },
        h('div', { class: 'cx-gutter' }, h('span', { class: 'cx-blocked-ic' }, icon('x'))),
        h('div', { class: 'cx-msg-main' }, h('p', { class: 'cx-blocked' }, 'Blocked message — ',
          h('button', { type: 'button', class: 'cx-link', onclick: () => { revealed.add(m.id); paint(); } }, 'show'))));
    }
    const head = !grouped;
    const mine = isMine(m);
    const ping = !mine && !m.deleted && (m.mentions_everyone || mentionsMe(m.body, me().username));
    const cls = ['cx-msg', head ? 'head' : 'cont'];
    if (ping) cls.push('ping');
    if (m.pending) cls.push('pending');
    if (m.failed) cls.push('failed');
    if (m.deleted) cls.push('deleted');
    if (m.pinned) cls.push('pinned');
    const row = h('div', { class: cls.join(' '), dataset: { mid: String(m.id ?? m.tempId) } });
    if (head && m.reply_to != null) row.append(replyRef(m));
    const gutter = h('div', { class: 'cx-gutter' });
    if (head) gutter.append(h('button', { type: 'button', class: 'cx-av-btn', 'aria-label': nameOf(a), onclick: () => ctx.onProfile && ctx.onProfile(a) }, avatar(a, { size: 40 })));
    else gutter.append(h('time', { class: 'cx-gtime', datetime: new Date(m._t).toISOString(), title: fullStamp(m._t), text: timeShort(m._t) }));
    const main = h('div', { class: 'cx-msg-main' });
    if (head) {
      const nm = nameEl(a, 'button', 'cx-name');
      nm.type = 'button';
      nm.addEventListener('click', () => ctx.onProfile && ctx.onProfile(a));
      main.append(h('div', { class: 'cx-meta' }, nm, roleMark(a),
        h('time', { class: 'cx-time', datetime: new Date(m._t).toISOString(), title: fullStamp(m._t), text: timeShort(m._t) }), // the day divider above says which day
        m.pinned ? h('span', { class: 'cx-pinned', title: 'Pinned' }, icon('pin'), 'Pinned') : null));
    } else if (m.pinned) main.append(h('span', { class: 'cx-pinned solo', title: 'Pinned' }, icon('pin'), 'Pinned'));
    main.append(bodyEl(m));
    if (!m.deleted && (m.attachments.length || (m._local && m._local.length))) main.append(attsEl(m));
    if (!m.deleted && m.reactions.length) main.append(reactsEl(m));
    if (m.pending) main.append(h('div', { class: 'cx-state' }, h('i', { class: 'cx-spin', 'aria-hidden': 'true' }), 'Sending…'));
    if (m.failed) {
      main.append(h('div', { class: 'cx-state bad', role: 'alert' }, icon('alert'), h('span', { text: 'Not sent: ' + (m.error || 'no connection') }),
        h('button', { type: 'button', class: 'cx-mini', onclick: () => retry(m) }, icon('retry'), 'Retry'),
        h('button', { type: 'button', class: 'cx-mini ghost', onclick: () => discard(m) }, 'Discard')));
    }
    row.append(gutter, main);
    // The hover toolbar is built on first hover / focus / tap, not for every row up front.
    if (!m.pending && !m.failed && !m.deleted && ctx.canReact() && editing !== m.id) {
      const tools = () => { if (!row.querySelector(':scope > .cx-tools')) row.append(toolsEl(m, mine)); };
      row.addEventListener('mouseenter', tools);
      row.addEventListener('focusin', tools);
      if (!finePointer()) row.addEventListener('click', (e) => {
        if (e.target.closest('button, a, .cx-att, textarea')) return;
        tools();
        if (touched && touched !== row) touched.classList.remove('touch');
        row.classList.toggle('touch'); touched = row;
      });
    }
    return row;
  }

  function bodyEl(m) {
    if (m.deleted) return h('p', { class: 'cx-body cx-deleted' }, icon('trash'), 'message deleted');
    if (editing === m.id) return editBox(m);
    const body = h('div', { class: 'cx-body' });
    if (m.body) {
      body.append(renderTokens(parseMessage(m.body, { users: ctx.usernames(), me: me().username || '' }), document));
      const plain = m.body.trim();
      if (plain.length <= 24 && JUMBO.test(plain) && [...plain.replace(/\s/g, '')].length <= 12) body.classList.add('jumbo');
    }
    if (m.edited_at) body.append(h('span', { class: 'cx-edited', title: 'Edited ' + fullStamp(m.edited_at), text: '(edited)' }));
    if (!m.body && !m.edited_at) body.hidden = true;
    return body;
  }

  function editBox(m) {
    const ta = h('textarea', { class: 'cx-edit-ta', rows: '1', 'aria-label': 'Edit message', maxlength: '2500' });
    ta.value = m.body || '';
    const save = () => {
      const v = ta.value.trim();
      if (v.length > 2000) { toast('That message is too long (max 2000 characters)', 'err'); return; } // stay in the edit box
      editing = null;
      if (!v || v === m.body) { m._v++; repaintRow(m); return; }
      const old = { body: m.body, edited_at: m.edited_at };
      m.body = v; m.edited_at = new Date().toISOString(); m._v++; repaintRow(m);
      Promise.resolve().then(() => editMessage(m.id, v)).catch((e) => { Object.assign(m, old); m._v++; repaintRow(m); toast(err(e), 'err'); });
    };
    const cancel = () => { editing = null; m._v++; repaintRow(m); };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 260) + 'px'; };
    ta.addEventListener('input', fit);
    setTimeout(() => { fit(); ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }, 0);
    return h('div', { class: 'cx-edit' }, ta, h('div', { class: 'cx-edit-hint' }, 'Enter to ',
      h('button', { type: 'button', class: 'cx-link', onclick: save }, 'save'), ' · Esc to ',
      h('button', { type: 'button', class: 'cx-link', onclick: cancel }, 'cancel')));
  }

  function snippet(m) {
    if (!m) return { text: 'Original message isn’t loaded', muted: true };
    if (m.deleted) return { text: 'Original message was deleted', muted: true };
    const t = String(m.body || '').replace(/\s+/g, ' ').trim();
    if (t) return { text: t.length > 140 ? t.slice(0, 140) + '…' : t };
    return { text: (m.attachments && m.attachments.length) ? 'Picture' : 'Message', muted: true, pic: true };
  }
  function replyRef(m) {
    const orig = (store && store.ids.get(m.reply_to)) || m.reply || null;
    const a = orig ? authorOf(orig) : null;
    const sn = snippet(orig);
    const blocked = orig && ctx.isBlocked(orig.author_id) && !revealed.has(orig.id);
    return h('button', { type: 'button', class: 'cx-replyref', 'aria-label': 'Jump to the message this replies to', onclick: () => orig && jumpTo(orig.id ?? m.reply_to) },
      h('span', { class: 'cx-rr-line', 'aria-hidden': 'true' }),
      a && !blocked ? avatar(a, { size: 16 }) : h('span', { class: 'cx-rr-q' }, icon('reply')),
      a && !blocked ? nameEl(a, 'span', 'cx-rr-name') : null,
      sn.pic && !blocked ? icon('image', 'cx-rr-pic') : null,
      h('span', { class: 'cx-rr-text' + (sn.muted || blocked ? ' muted' : ''), text: blocked ? 'Blocked message' : sn.text }));
  }
  function jumpTo(id) {
    const row = list.querySelector('[data-mid="' + CSS.escape(String(id)) + '"]');
    if (!row) { toast('That message is further back. Scroll up to find it.'); return; }
    row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  }

  function attsEl(m) {
    const local = m._local || [];
    const items = local.length ? local : m.attachments;
    const box = h('div', { class: 'cx-atts n' + Math.min(items.length, 4) });
    items.slice(0, 4).forEach((att, i) => {
      const w = Number(att.width) || 0, ht = Number(att.height) || 0;
      const gif = local.length ? att.gif : /gif/i.test(att.type || att.mime || '') || /\.gif$/i.test(att.path || '');
      const cell = h('button', { type: 'button', class: 'cx-att loading', 'aria-label': gif ? 'Open GIF' : 'Open picture' });
      if (items.length === 1 && w && ht) cell.style.aspectRatio = w + ' / ' + ht;
      if (items.length === 1 && w && ht) cell.style.width = 'min(100%, ' + Math.round(Math.min(420, w, 340 * w / ht)) + 'px)';
      if (gif) cell.append(h('span', { class: 'cx-gif-tag', text: 'GIF' }));
      if (att.expired) {
        cell.className = 'cx-att gone'; cell.disabled = true;
        cell.replaceChildren(icon('image'), h('span', { text: 'Picture expired' }));
      } else {
        const img = h('img', { alt: gif ? 'GIF' : 'Picture', decoding: 'async', loading: 'lazy' });
        if (w && ht) { img.width = w; img.height = ht; }
        img.addEventListener('load', () => { cell.classList.remove('loading'); if (stick && store) scroller.scrollTop = scroller.scrollHeight; });
        img.addEventListener('error', () => { cell.className = 'cx-att gone'; cell.disabled = true; cell.replaceChildren(icon('image'), h('span', { text: 'Picture unavailable' })); });
        cell.prepend(img);
        if (local.length) img.src = att.url; // the sender's own file, shown while it uploads
        else mediaSrc(att).then((src) => { if (src) img.src = src; else img.dispatchEvent(new Event('error')); });
        if (!local.length) cell.addEventListener('click', () => lightbox(m, i));
      }
      box.append(cell);
    });
    return box;
  }

  function reactsEl(m) {
    const can = ctx.canReact();
    const box = h('div', { class: 'cx-reacts' });
    for (const r of m.reactions) {
      const label = (emojiName(r.emoji) || 'reaction') + ', ' + r.count + (r.mine ? ', you reacted' : '');
      box.append(h('button', { type: 'button', class: 'cx-react' + (r.mine ? ' mine' : ''), 'aria-pressed': r.mine ? 'true' : 'false', 'aria-label': label, title: label, disabled: !can,
        onclick: () => toggleReact(m, r.emoji, !r.mine) }, h('span', { class: 'cx-react-e', text: r.emoji }), h('span', { class: 'cx-react-n', text: String(r.count) })));
    }
    if (can) {
      const add = h('button', { type: 'button', class: 'cx-react add', 'aria-label': 'Add a reaction', title: 'Add a reaction', 'aria-haspopup': 'dialog' }, icon('react'));
      add.addEventListener('click', () => openEmojiPicker(add, { label: 'React', onPick: (e) => toggleReact(m, e, true) }));
      box.append(add);
    }
    return box;
  }
  function toggleReact(m, emoji, on) {
    if (!ctx.canReact()) return;
    const r0 = m.reactions.find((x) => x.emoji === emoji);
    if (on && r0 && r0.mine) return;
    if (!on && !(r0 && r0.mine)) return;
    applyReact(m, emoji, on, true);
    Promise.resolve().then(() => sendReact(m.id, emoji, on)).catch((e) => { applyReact(m, emoji, !on, true); toast(err(e), 'err'); });
  }
  function applyReact(m, emoji, on, mine) {
    let r = m.reactions.find((x) => x.emoji === emoji);
    if (on) {
      if (!r) { r = { emoji, count: 0, mine: false }; m.reactions.push(r); }
      r.count++; if (mine) r.mine = true;
    } else if (r) {
      r.count--; if (mine) r.mine = false;
      if (r.count <= 0) m.reactions = m.reactions.filter((x) => x !== r);
    }
    m._v++;
    const keep = stick;
    repaintRow(m);
    if (keep) scroller.scrollTop = scroller.scrollHeight;
  }

  function toolsEl(m, mine) {
    const bar = h('div', { class: 'cx-tools', role: 'toolbar', 'aria-label': 'Message actions' });
    for (const e of QUICK_REACTIONS.slice(0, 3)) bar.append(h('button', { type: 'button', class: 'cx-tool emo', title: 'React ' + e, 'aria-label': 'React ' + (emojiName(e) || e), text: e, onclick: () => toggleReact(m, e, true) }));
    const more = h('button', { type: 'button', class: 'cx-tool', title: 'Add a reaction', 'aria-label': 'Add a reaction', 'aria-haspopup': 'dialog' }, icon('react'));
    more.addEventListener('click', () => openEmojiPicker(more, { label: 'React', onPick: (e) => toggleReact(m, e, true) }));
    bar.append(h('span', { class: 'cx-tools-sep', 'aria-hidden': 'true' }), more,
      h('button', { type: 'button', class: 'cx-tool', title: 'Reply', 'aria-label': 'Reply', onclick: () => ctx.onReply && ctx.onReply(m) }, icon('reply')));
    if (mine) {
      if (m.body) bar.append(h('button', { type: 'button', class: 'cx-tool', title: 'Edit', 'aria-label': 'Edit', onclick: () => { editing = m.id; m._v++; repaintRow(m); } }, icon('edit')));
      bar.append(h('button', { type: 'button', class: 'cx-tool danger', title: 'Delete', 'aria-label': 'Delete', onclick: () => confirmDelete(m) }, icon('trash')));
    }
    if (ctx.extraTools) for (const b of ctx.extraTools(m) || []) bar.append(b);
    return bar;
  }
  function confirmDelete(m) {
    const sheet = openSheet({ title: 'Delete message?' });
    const go = h('button', { type: 'button', class: 'fp-btn cx-danger-btn' }, 'Delete');
    sheet.body.append(
      h('p', { class: 'fp-note', text: 'Everyone will see “message deleted” instead. This can’t be undone.' }),
      h('blockquote', { class: 'cx-quote', text: (m.body || 'Picture').slice(0, 300) }),
      h('div', { class: 'cx-sheet-actions' }, h('button', { type: 'button', class: 'fp-mini', onclick: () => sheet.close() }, 'Cancel'), go));
    go.addEventListener('click', () => {
      sheet.close();
      const old = { deleted: m.deleted, body: m.body, attachments: m.attachments, reactions: m.reactions };
      m.deleted = true; m.body = ''; m.attachments = []; m._v++; repaintRow(m);
      Promise.resolve().then(() => deleteMessage(m.id)).catch((e) => { Object.assign(m, old); m._v++; repaintRow(m); toast(err(e), 'err'); });
    });
    go.focus();
  }

  // Discard cancels the queued / retrying send as well as removing the row (one the server already took can't be undone: its row just arrives).
  function discard(m) {
    try { discardSend(m.tempId); } catch { /* nothing queued */ }
    dropTemp(m);
    if (store) paint();
  }
  function retry(m) {
    m.failed = false; m.pending = true; m.error = ''; m._v++; repaintRow(m);
    Promise.resolve().then(() => retrySend(m.tempId)).then((real) => api.sent(m.tempId, real), (e) => api.failed(m.tempId, err(e)));
  }

  // ---------- lightbox ----------
  function lightbox(m, start) {
    const atts = m.attachments.filter((a) => !a.expired);
    if (!atts.length) return;
    let i = Math.max(0, Math.min(start, atts.length - 1));
    const opener = document.activeElement;
    const img = h('img', { class: 'cx-lb-img', alt: '' });
    const open = h('a', { class: 'cx-lb-open', target: '_blank', rel: 'noopener noreferrer' }, icon('open'), 'Open original');
    const count = h('span', { class: 'cx-lb-count' });
    const a = authorOf(m);
    const prev = h('button', { type: 'button', class: 'cx-lb-nav prev', 'aria-label': 'Previous picture', onclick: (e) => { e.stopPropagation(); go(i - 1); } }, icon('left'));
    const next = h('button', { type: 'button', class: 'cx-lb-nav next', 'aria-label': 'Next picture', onclick: (e) => { e.stopPropagation(); go(i + 1); } }, icon('right'));
    const close = h('button', { type: 'button', class: 'cx-lb-x', 'aria-label': 'Close' }, icon('x'));
    const box = h('div', { class: 'cx-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Picture from ' + nameOf(a), tabindex: '-1' },
      h('figure', { class: 'cx-lb-fig' }, img,
        h('figcaption', {}, avatar(a, { size: 26 }), h('span', { class: 'cx-lb-who' }, nameEl(a), h('small', { text: fullStamp(m._t) })), count, open)),
      atts.length > 1 ? prev : null, atts.length > 1 ? next : null, close);
    // Small pictures and GIFs are scaled up to a comfortable size (at most 2.5x), big ones down to fit.
    img.addEventListener('load', () => {
      const nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw || !nh) return;
      const aw = Math.max(200, innerWidth - (innerWidth < 700 ? 20 : 144)), ah = Math.max(200, innerHeight - 170);
      const k = Math.min(aw / nw, ah / nh, Math.max(1, Math.min(2.5, 640 / nw)));
      img.style.width = Math.round(nw * k) + 'px';
    });
    function go(n) {
      i = (n + atts.length) % atts.length;
      img.style.width = '';
      count.textContent = atts.length > 1 ? (i + 1) + ' / ' + atts.length : '';
      img.removeAttribute('src');
      mediaSrc(atts[i]).then((src) => { if (src) { img.src = src; open.href = src; } });
    }
    function shut() { document.removeEventListener('keydown', onKey, true); box.remove(); if (closeLightbox === shut) closeLightbox = null; if (opener && opener.focus) opener.focus(); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); }
      else if (e.key === 'ArrowLeft' && atts.length > 1) go(i - 1);
      else if (e.key === 'ArrowRight' && atts.length > 1) go(i + 1);
      else if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
    }
    close.addEventListener('click', shut);
    box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('cx-lb-fig')) shut(); });
    document.addEventListener('keydown', onKey, true);
    closeLightbox = shut;
    document.body.append(box);
    go(i);
    box.focus();
  }

  // ---------- placeholders (chat not ready) ----------
  function skeleton() {
    return h('div', { class: 'cx-skel', 'aria-hidden': 'true' }, [[62, 40], [80, 0], [45, 70], [70, 30], [55, 0], [84, 48], [38, 0], [66, 52]].map(([a, b]) =>
      h('div', { class: 'cx-skel-row' }, h('span', { class: 'cx-av sk', style: '--av:40px' }),
        h('div', { class: 'cx-skel-lines' }, h('i', { class: 'cx-bar w-name' }), h('i', { class: 'cx-bar', style: `width:${a}%` }), b ? h('i', { class: 'cx-bar', style: `width:${b}%` }) : null))));
  }

  const api = {
    // Show a conversation. unread: how many unread it had (for the "New" divider).
    async open(target, channel, { unread = 0 } = {}) {
      if (store) store.scroll = stick ? null : scroller.scrollTop;
      const key = tkey(target);
      let s = stores.get(key);
      if (!s) { s = newStore(target, channel); stores.set(key, s); }
      s.channel = channel || s.channel;
      store = s;
      editing = null;
      el.classList.remove('waiting');
      const markNew = () => {
        s.newFrom = null;
        if (unread > 0) {
          let n = 0;
          for (let i = s.msgs.length - 1; i >= 0; i--) { if (s.msgs[i].author_id !== me().id && ++n >= unread) { s.newFrom = s.msgs[i].id; break; } }
        }
      };
      if (s.loaded) {
        markNew(); paint();
        if (s.newFrom != null) { const d = newDiv; requestAnimationFrame(() => { if (store === s && d.isConnected) scroller.scrollTop = d.offsetTop - 80; stick = nearBottom(); drawJump(); }); }
        else if (s.scroll == null) toBottom(); else { scroller.scrollTop = s.scroll; stick = nearBottom(); drawJump(); }
        if (s.newerCut) reloadLatest(s);
        else if (stick && ctx.onRead) ctx.onRead(s.target);
        return;
      }
      list.replaceChildren(skeleton());
      jump.hidden = true;
      let got;
      try { got = await loadMessages(target, { limit: PAGE }); }
      catch (e) {
        if (store !== s) return;
        list.replaceChildren(h('div', { class: 'cx-feed-err' }, icon('alert'), h('strong', { text: 'Couldn’t load messages' }), h('span', { text: err(e) }),
          h('button', { type: 'button', class: 'cx-btn ghost', onclick: () => api.open(target, channel, { unread }) }, icon('retry'), 'Try again')));
        return;
      }
      got = Array.isArray(got) ? got : [];
      addAll(s, got);
      s.hasMore = got.length >= PAGE;
      s.newerCut = false;
      s.loaded = true;
      if (store !== s) return;
      markNew();
      paint();
      if (s.newFrom != null && newDiv.isConnected) { scroller.scrollTop = newDiv.offsetTop - 80; stick = nearBottom(); drawJump(); }
      else toBottom();
      if (stick && ctx.onRead) ctx.onRead(s.target);
      // A short first page on a tall screen leaves nothing to scroll: fetch more until it fills.
      if (s.hasMore && scroller.scrollHeight <= scroller.clientHeight + 40) loadOlder();
    },
    current: () => (store ? store.target : null),
    atBottom: () => stick,
    waiting(kind) {
      store = null;
      jump.hidden = true;
      el.classList.add('waiting');
      if (kind === 'skeleton') { list.replaceChildren(skeleton()); return; }
      list.replaceChildren(kind || h('div'));
    },
    // Live events.
    insert(m) {
      if (!m || m.id == null) return;
      const key = tkey(m.dm_id ? { dm: m.dm_id } : { channel: m.channel_id });
      const s = stores.get(key);
      if (!s || !s.loaded) return;
      const t = matchTemp(s.temps, m); // our own message coming back before sendMessage resolved: it replaces the pending copy
      if (t) dropTemp(t);
      if (s.ids.has(m.id)) { api.update(m); return; }
      if (s.newerCut) { // the window ends mid-history: the newest messages are re-fetched when the reader comes back
        if (s === store && !isMine(m)) { s.unseen++; drawJump(); }
        return;
      }
      const keep = stick;
      addAll(s, [m]);
      if (s !== store) { enforceCap(s); return; }
      if (!keep && !isMine(m)) s.unseen++;
      enforceCap(s);
      paint();
      if (keep || isMine(m)) toBottom(); else drawJump();
    },
    update(m) {
      if (!m || m.id == null) return;
      const [s, old] = find(m.id);
      if (!old) return;
      for (const k of ['body', 'edited_at', 'deleted', 'pinned', 'attachments', 'mentions_everyone']) if (k in m) old[k] = m[k];
      if (Array.isArray(m.reactions)) old.reactions = m.reactions;
      if (old.deleted) { old.body = ''; old.attachments = []; }
      norm(old);
      if (s === store) { const keep = stick; paint(); if (keep) scroller.scrollTop = scroller.scrollHeight; }
    },
    react(ev) {
      if (!ev) return;
      const [, m] = find(ev.message_id);
      if (!m) return;
      const mine = !!me().id && ev.user_id === me().id;
      const r = m.reactions.find((x) => x.emoji === ev.emoji);
      if (mine && ev.on && r && r.mine) return;          // our own click, already shown
      if (mine && !ev.on && !(r && r.mine)) return;
      applyReact(m, ev.emoji, !!ev.on, mine);
    },
    // Sending: a local copy right away, then the real one (or Retry).
    pending(pm, { target: tg = null, body = '', files = [], reply = null, author = null, clientId = '' } = {}) {
      if (!pm || pm.tempId == null) return;
      const target = tg || (pm.dm_id ? { dm: pm.dm_id } : pm.channel_id ? { channel: pm.channel_id } : (store && store.target));
      if (!target) return;
      const s = stores.get(tkey(target));
      if (!s) return;
      const m = Object.assign({}, pm, {
        pending: true, failed: false, body: pm.body ?? body, author_id: pm.author_id || me().id, author: pm.author || author,
        created_at: pm.created_at || new Date().toISOString(), reply_to: pm.reply_to ?? (reply ? reply.id : null), reply: pm.reply || reply,
      });
      if (m.client_id == null && clientId) m.client_id = clientId;
      m._local = files.map((f) => ({ url: URL.createObjectURL(f), gif: f.type === 'image/gif' }));
      norm(m);
      s.temps.push(m);
      if (s === store) { paint(); toBottom(); }
    },
    hasTemp: (tempId) => findTemp(tempId)[1] != null,
    sent(tempId, real) {
      const [, t] = findTemp(tempId);
      if (t) dropTemp(t);
      if (real && real.id != null) {
        const ss = stores.get(tkey(real.dm_id ? { dm: real.dm_id } : { channel: real.channel_id }));
        if (ss && ss.loaded && !ss.newerCut && !ss.ids.has(real.id)) {
          addAll(ss, [real]);
          if (ss === store) { enforceCap(ss); paint(); if (stick) toBottom(); }
          else enforceCap(ss);
          return;
        }
      }
      if (store) paint();
    },
    failed(tempId, text) {
      const [s, t] = findTemp(tempId);
      if (!t) return;
      t.pending = false; t.failed = true; t.error = text || 'no connection'; t._v++;
      if (s === store) { const keep = stick; paint(); if (keep) toBottom(); }
    },
    // Fetch the newest page again after a reconnect and merge it in.
    async resync() {
      const list2 = [...stores.values()].filter((s) => s.loaded);
      for (const s of list2) {
        try {
          const got = await loadMessages(s.target, { limit: PAGE });
          if (Array.isArray(got) && !s.newerCut) { addAll(s, got); enforceCap(s); }
        } catch { /* next reconnect */ }
      }
      if (store) { const keep = stick; paint(); if (keep) toBottom(); }
    },
    repaint() { if (store) { const keep = stick; paint(); if (keep) scroller.scrollTop = scroller.scrollHeight; } },
    // Restart of the app's stores. Unsent messages of the signed-in account (uid) stay; anyone else's are cancelled. Returns how many were dropped.
    reset(uid = '') {
      let dropped = 0;
      for (const arr of pendingByTarget.values()) {
        const { drop } = splitPending(arr, uid);
        for (const t of drop) { try { discardSend(t.tempId); } catch { /* nothing queued */ } dropTemp(t, 0); dropped++; }
      }
      stores.clear(); store = null; editing = null; list.replaceChildren();
      return dropped;
    },
    destroy() {
      if (feedRO) feedRO.disconnect();
      if (closeLightbox) closeLightbox();
      closeEmojiPicker();
      for (const arr of pendingByTarget.values()) for (const t of arr) { if (t.failed) { try { discardSend(t.tempId); } catch { /* ignore */ } } revokeLocal(t, 0); }
      pendingByTarget.clear(); stores.clear(); store = null; editing = null; touched = null;
      list.replaceChildren();
    },
  };
  return api;
}
