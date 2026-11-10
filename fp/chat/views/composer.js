// Composer: text (Enter sends, Shift+Enter new line), emoji picker, up to 4 pictures with previews and planUpload errors,
// reply chip, typing pings, a draft per conversation. Guests get a Log in bar, read-only channels a lock line.
// A list above the box, like Discord: "/" at the start lists the slash commands (filtered as you type, then the picked
// command's arguments), "@" at the start or after a space lists people to ping. Arrows move, Enter or Tab picks, Esc
// closes; a line starting with one slash goes to onCommand instead of being sent ("//" sends it with one slash removed).
import { h } from '../../ui.js';
import { planUpload } from '../media.js';
import { filterCommands, slashQuery, applyCommand, hintFor, mentionQuery, applyMention } from '../commands.js';
import { icon, nameOf, avatar, roleMark, finePointer } from './common.js';
import { openEmojiPicker, closeEmojiPicker } from './emoji-picker.js';

const MAX_BODY = 2000;
const MAX_FILES = 4;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const SEARCH_AFTER_MS = 250;
let acN = 0;

/**
 * opts: onSend({ body, files, replyTo, reply }) -> false to keep the text; onTyping(); onLogin();
 * commands() -> { role, dm } (slash commands are off without it); onCommand({ text, reply, replyTo, files }) -> 'keep' |
 * 'text' | 'sent'; people(query, { command }) -> { rows, search?: () => Promise<rows> } for the @ list.
 */
export function mountComposer(el, { onSend, onTyping, onLogin, commands, onCommand, people } = {}) {
  el.classList.add('cx-composer');
  const notice = h('div', { class: 'cx-cmp-notice', role: 'alert', hidden: true });
  const replyText = h('span', { class: 'cx-cmp-reply-text' });
  const reply = h('div', { class: 'cx-cmp-reply', hidden: true }, icon('reply'), replyText,
    h('button', { type: 'button', class: 'cx-iconbtn sm', 'aria-label': 'Cancel reply', onclick: () => setReply(null) }, icon('x')));
  const tray = h('div', { class: 'cx-cmp-tray', hidden: true });
  const errs = h('div', { class: 'cx-cmp-errs', role: 'alert', hidden: true });
  const file = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
  const ta = h('textarea', { class: 'cx-cmp-ta', rows: '1', maxlength: String(MAX_BODY + 500), 'aria-label': 'Message', enterkeyhint: 'send' });
  const count = h('span', { class: 'cx-cmp-count', hidden: true, 'aria-live': 'polite' });
  const attach = h('button', { type: 'button', class: 'cx-iconbtn cx-cmp-attach', 'aria-label': 'Add pictures', title: 'Add pictures (up to 4)', onclick: () => file.click() }, icon('plus'));
  const emojiBtn = h('button', { type: 'button', class: 'cx-iconbtn cx-cmp-emoji', 'aria-label': 'Emoji', title: 'Emoji', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, icon('react'));
  const send = h('button', { type: 'button', class: 'cx-cmp-send', 'aria-label': 'Send', title: 'Send (Enter)' }, icon('send'));
  const acId = 'cx-ac-' + (++acN);
  const ac = h('div', { class: 'cx-ac', id: acId, role: 'listbox', hidden: true });
  ta.setAttribute('aria-autocomplete', 'list');
  ta.setAttribute('aria-controls', acId);
  ta.setAttribute('aria-expanded', 'false');
  const box = h('div', { class: 'cx-cmp-box' }, ac, attach, ta, count, emojiBtn, send);
  const gate = h('div', { class: 'cx-cmp-gate', hidden: true });
  el.replaceChildren(notice, reply, errs, tray, box, gate, file);

  let key = '';
  let mode = 'open';
  const drafts = new Map(); // key -> { text, reply, files: [{ file, url, gif }], errors: [] }
  const cur = () => { if (!drafts.has(key)) drafts.set(key, { text: '', reply: null, files: [], errors: [] }); return drafts.get(key); };

  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }
  function refresh() {
    const d = cur();
    const n = ta.value.length;
    count.hidden = n < 1800;
    count.textContent = n + ' / ' + MAX_BODY;
    count.classList.toggle('bad', n > MAX_BODY);
    send.disabled = mode !== 'open' || n > MAX_BODY || (!ta.value.trim() && !d.files.length);
    attach.disabled = mode !== 'open' || d.files.length >= MAX_FILES;
  }
  function drawTray() {
    const d = cur();
    tray.hidden = !d.files.length;
    tray.replaceChildren(...d.files.map((f, i) => h('figure', { class: 'cx-cmp-file' },
      h('img', { src: f.url, alt: '' }),
      f.gif ? h('span', { class: 'cx-gif-tag', text: 'GIF' }) : null,
      h('figcaption', { text: f.file.name || 'picture' }),
      h('button', { type: 'button', class: 'cx-cmp-file-x', 'aria-label': 'Remove ' + (f.file.name || 'picture'), onclick: () => removeFile(i) }, icon('x')))));
    errs.hidden = !d.errors.length;
    errs.replaceChildren(...d.errors.map((t) => h('p', {}, icon('alert'), h('span', { text: t }))));
    if (d.errors.length) errs.append(h('button', { type: 'button', class: 'cx-link', onclick: () => { cur().errors = []; drawTray(); } }, 'OK'));
    refresh();
  }
  function removeFile(i) {
    const d = cur();
    const [f] = d.files.splice(i, 1);
    if (f) URL.revokeObjectURL(f.url);
    drawTray();
  }
  function addFiles(list) {
    if (mode !== 'open') return;
    const d = cur();
    d.errors = [];
    for (const f of [...(list || [])]) {
      if (d.files.length >= MAX_FILES) { d.errors.push('Up to ' + MAX_FILES + ' pictures per message'); break; }
      const plan = planUpload({ type: f.type, size: f.size }, 'chat');
      if (!plan.ok) { d.errors.push((f.name ? f.name + ': ' : '') + plan.reason); continue; }
      d.files.push({ file: f, url: URL.createObjectURL(f), gif: f.type === 'image/gif' });
    }
    drawTray();
  }
  function setReply(msg) {
    cur().reply = msg || null;
    reply.hidden = !msg;
    if (msg) {
      replyText.replaceChildren('Replying to ', h('b', { text: nameOf(msg.author) }));
      if (finePointer()) ta.focus();
    }
  }
  function showNotice(text, kind = 'err') {
    notice.hidden = !text;
    notice.className = 'cx-cmp-notice ' + kind;
    notice.replaceChildren(icon(kind === 'err' ? 'alert' : 'sparkle'), h('span', { text: text || '' }));
    clearTimeout(showNotice.t);
    if (text) showNotice.t = setTimeout(() => { notice.hidden = true; }, 7000);
  }
  function doSend() {
    if (mode !== 'open') return;
    const d = cur();
    let body = ta.value.replace(/\s+$/, '').replace(/^\n+/, '');
    if (body.length > MAX_BODY) { showNotice('That message is too long (max ' + MAX_BODY + ' characters)'); return; }
    if (!body.trim() && !d.files.length) return;
    const files = d.files.map((f) => f.file);
    const replyTo = d.reply ? d.reply.id : null;
    if (onCommand && body.startsWith('/')) {
      if (body.startsWith('//')) body = body.slice(1); // "//" = a message that starts with a slash
      else {
        const r = onCommand({ text: body, reply: d.reply, replyTo, files });
        closeAc();
        if (r === 'keep') return;
        if (r !== 'sent') { d.text = ''; ta.value = ''; autosize(); refresh(); return; }
        clearSent();
        return;
      }
    }
    const ok = onSend && onSend({ body: body.trim() ? body : '', files, replyTo, reply: d.reply });
    if (ok === false) return;
    clearSent();
  }
  // After a send: the text, the reply and the pictures go (the pending message made its own copies of the pictures).
  function clearSent() {
    const d = cur();
    for (const f of d.files) URL.revokeObjectURL(f.url);
    d.files = []; d.errors = []; d.text = '';
    ta.value = '';
    setReply(null);
    closeAc();
    autosize(); drawTray();
  }

  // ---------- the list above the box: slash commands, a command's arguments, people to ping ----------
  let acKind = null;      // null | 'cmd' | 'people' | 'hint'
  let acRows = [];
  let acActive = 0;
  let acCtx = null;       // { q } for people, { cmd } for the hint
  let dismissed = null;   // the text Esc closed the list on (it stays closed until the text changes)
  let searchT = 0, searchSeq = 0;
  const acOpen = () => !ac.hidden;
  function closeAc() {
    clearTimeout(searchT); searchSeq++;
    acKind = null; acRows = []; acCtx = null;
    ac.hidden = true;
    ac.replaceChildren();
    ac.className = 'cx-ac';
    ta.setAttribute('aria-expanded', 'false');
    ta.removeAttribute('aria-activedescendant');
  }
  function setActive(i) {
    if (!acRows.length) return;
    acActive = (i + acRows.length) % acRows.length;
    const items = ac.querySelectorAll('.cx-ac-row');
    items.forEach((n, j) => { n.classList.toggle('on', j === acActive); n.setAttribute('aria-selected', j === acActive ? 'true' : 'false'); });
    const on = items[acActive];
    if (!on) return;
    ta.setAttribute('aria-activedescendant', on.id);
    // keep the active row in view inside the list only (scrollIntoView could move the page or the feed too)
    const top = on.offsetTop, bottom = top + on.offsetHeight;
    if (top < ac.scrollTop) ac.scrollTop = Math.max(0, top - 6);
    else if (bottom > ac.scrollTop + ac.clientHeight) ac.scrollTop = bottom - ac.clientHeight + 6;
  }
  // Rows keep the focus in the box (no blur, the phone keyboard stays up); a click or tap picks.
  const keepFocus = (e) => e.preventDefault();
  function rowEl(i, kids, data) {
    const r = h('div', { class: 'cx-ac-row', id: acId + '-' + i, role: 'option', 'aria-selected': 'false', dataset: data }, ...kids);
    r.addEventListener('pointerdown', keepFocus);
    r.addEventListener('mousedown', keepFocus);
    r.addEventListener('click', () => pick(i));
    r.addEventListener('mousemove', () => { if (acActive !== i) setActive(i); });
    return r;
  }
  function show(kind, head, nodes) {
    acKind = kind;
    ac.className = 'cx-ac ' + kind;
    ac.replaceChildren(h('div', { class: 'cx-ac-head', text: head }), ...nodes);
    ac.hidden = false;
    ta.setAttribute('aria-expanded', kind === 'hint' ? 'false' : 'true');
    ac.setAttribute('role', kind === 'hint' ? 'note' : 'listbox');
    ac.setAttribute('aria-label', head);
    if (acRows.length) setActive(Math.min(acActive, acRows.length - 1)); else ta.removeAttribute('aria-activedescendant');
  }
  function showCommands(rows, q) {
    const same = acKind === 'cmd';
    acRows = rows; acCtx = null;
    if (!same) acActive = 0;
    show('cmd', q ? 'Commands matching /' + q : 'Commands', rows.map((c, i) => rowEl(i, [
      h('span', { class: 'cx-ac-cmd' }, h('b', { text: '/' + c.name }), c.hint ? h('span', { class: 'cx-ac-hint', text: c.hint }) : null,
        c.who !== 'everyone' ? h('span', { class: 'cx-ac-tag ' + c.who, text: c.who === 'owner' ? 'Owner' : 'Staff' }) : null),
      h('small', { class: 'cx-ac-desc', text: c.desc })], { cmd: c.name })));
  }
  function personRow(p, i) {
    if (p.everyone) return rowEl(i, [h('span', { class: 'cx-ac-at', 'aria-hidden': 'true' }, icon('at')), h('span', { class: 'cx-ac-who' }, h('b', { text: '@everyone' }), h('small', { text: 'Ping everyone in this channel' }))], { user: 'everyone' });
    return rowEl(i, [avatar(p, { size: 26 }), h('span', { class: 'cx-ac-who' }, h('b', { text: nameOf(p) }), roleMark(p), h('small', { text: '@' + p.username }))], { user: p.username });
  }
  function showPeople(rows, q) {
    if (!rows.length) { closeAc(); return; }
    const same = acKind === 'people' && acCtx && acCtx.q.query === q.query;
    acRows = rows; acCtx = { q };
    if (!same) acActive = 0;
    show('people', q.query ? 'People matching @' + q.query : 'People', rows.map(personRow));
  }
  function showHint(cmd) {
    acRows = []; acCtx = { cmd }; acActive = 0;
    show('hint', 'Press Enter to run it', [h('div', { class: 'cx-ac-tip' },
      h('span', { class: 'cx-ac-cmd' }, h('b', { text: '/' + cmd.name }), cmd.hint ? h('span', { class: 'cx-ac-hint', text: cmd.hint }) : null),
      h('small', { class: 'cx-ac-desc', text: cmd.desc }))]);
  }
  function updateAc() {
    if (mode !== 'open' || !commands || document.activeElement !== ta) { closeAc(); return; }
    const v = ta.value;
    if (dismissed !== null) { if (v === dismissed) { closeAc(); return; } dismissed = null; }
    if (ta.selectionStart !== ta.selectionEnd) { closeAc(); return; }
    const caret = ta.selectionStart ?? v.length;
    const ctx = commands() || {};
    const sq = slashQuery(v, caret);
    if (sq) {
      const rows = filterCommands(ctx.role, sq.query, ctx);
      if (rows.length) showCommands(rows, sq.query); else closeAc();
      return;
    }
    const mq = people ? mentionQuery(v, caret) : null;
    if (mq) { askPeople(mq, v.startsWith('/') && !v.startsWith('//')); return; }
    const cmd = hintFor(v, ctx.role, ctx);
    if (cmd) showHint(cmd); else closeAc();
  }
  function askPeople(q, command) {
    clearTimeout(searchT);
    const mine = ++searchSeq;
    let r;
    try { r = people(q.query, { command }) || {}; } catch { r = {}; }
    showPeople(r.rows || [], q);
    if (typeof r.search !== 'function') return;
    // people the page hasn't loaded yet: asked once the typing pauses, dropped if the box changed meanwhile
    searchT = setTimeout(() => {
      Promise.resolve().then(() => r.search()).then((rows) => {
        if (mine !== searchSeq || !Array.isArray(rows)) return;
        const now = mentionQuery(ta.value, ta.selectionStart ?? ta.value.length);
        if (now && now.query === q.query) showPeople(rows, now);
      }, () => {});
    }, SEARCH_AFTER_MS);
  }
  function pick(i) {
    const v = ta.value;
    let next = null;
    if (acKind === 'cmd' && acRows[i]) next = applyCommand(v, acRows[i].name);
    else if (acKind === 'people' && acRows[i] && acCtx) next = applyMention(v, acCtx.q, acRows[i].username);
    if (!next) return;
    ta.value = next.value;
    cur().text = ta.value;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = next.caret;
    autosize(); refresh();
    updateAc();
  }

  ta.addEventListener('input', () => {
    cur().text = ta.value;
    autosize(); refresh();
    updateAc();
    if (ta.value.trim() && onTyping && !ta.value.startsWith('/')) onTyping();
  });
  ta.addEventListener('keydown', (e) => {
    const composing = e.isComposing || e.keyCode === 229;
    if (acOpen() && !composing) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && acRows.length) { e.preventDefault(); setActive(acActive + (e.key === 'ArrowDown' ? 1 : -1)); return; }
      if (((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey)) && acRows.length) { e.preventDefault(); pick(acActive); return; }
      if (e.key === 'Escape') { e.preventDefault(); dismissed = ta.value; closeAc(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !composing) { e.preventDefault(); doSend(); }
    else if (e.key === 'Escape' && cur().reply) { e.preventDefault(); setReply(null); }
  });
  // the caret moved without typing (arrows, a click): the list follows it
  ta.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateAc(); });
  ta.addEventListener('click', () => updateAc());
  ta.addEventListener('focus', () => updateAc());
  ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) closeAc(); }, 150));
  ta.addEventListener('paste', (e) => {
    const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  send.addEventListener('click', () => { doSend(); if (finePointer()) ta.focus(); });
  file.addEventListener('change', () => { addFiles(file.files); file.value = ''; });
  emojiBtn.addEventListener('click', () => openEmojiPicker(emojiBtn, {
    label: 'Add an emoji to your message',
    custom: true,
    onPick: (e) => {
      const s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, s) + e + ta.value.slice(en);
      cur().text = ta.value;
      autosize(); refresh(); closeAc();
      if (finePointer()) { ta.focus(); ta.selectionStart = ta.selectionEnd = s + e.length; }
    },
  }));

  function dropDrafts() {
    for (const d of drafts.values()) for (const f of d.files) URL.revokeObjectURL(f.url);
    drafts.clear();
  }

  return {
    addFiles,
    // A different account: forget every draft (text, reply, pictures) and free the picture previews.
    clearDrafts() {
      dropDrafts();
      key = ''; ta.value = ''; reply.hidden = true; tray.replaceChildren(); tray.hidden = true;
      closeAc();
      autosize(); refresh();
    },
    destroy() {
      clearTimeout(showNotice.t);
      closeAc();
      closeEmojiPicker();
      dropDrafts();
    },
    focus() { if (mode === 'open' && finePointer()) ta.focus(); },
    // A send that failed before it became a pending message: put the text back so nothing is lost.
    // k (optional): put it back in that conversation's draft even if another one is open now.
    restore(body, k) {
      if (!body) return;
      if (k != null && k !== key) { const d = drafts.get(k) || { text: '', reply: null, files: [], errors: [] }; drafts.set(k, d); if (!String(d.text).trim()) d.text = body; return; }
      if (ta.value.trim()) return;
      ta.value = body; cur().text = body;
      autosize(); refresh();
    },
    key: () => key,
    setReply,
    notice: showNotice,
    // mode: 'open' | 'locked' (read-only channel; lockKind 'muted' | 'banned' | 'blocked' for those lines) | 'guest' | 'wait' (chat not ready)
    setTarget(k, { placeholder = 'Message', mode: m = 'open', lockText = '', lockKind = '' } = {}) {
      if (key) cur().text = ta.value;
      if (k !== key || m !== mode) { dismissed = null; closeAc(); }
      key = k; mode = m;
      const d = cur();
      ta.value = d.text;
      ta.placeholder = placeholder;
      ta.disabled = m !== 'open';
      box.hidden = m === 'locked' || m === 'guest';
      gate.hidden = !box.hidden;
      if (m === 'guest') {
        gate.className = 'cx-cmp-gate guest';
        gate.replaceChildren(h('span', { class: 'cx-gate-text' }, h('b', { text: 'Want to say something?' }), ' Log in with your Free Period account.'),
          h('button', { type: 'button', class: 'cx-btn', onclick: () => onLogin && onLogin() }, icon('login'), 'Log in to chat'));
      } else if (m === 'locked') {
        gate.className = 'cx-cmp-gate locked' + (lockKind ? ' ' + lockKind : '');
        gate.replaceChildren(icon(lockKind === 'muted' ? 'clock' : lockKind === 'banned' || lockKind === 'blocked' ? 'block' : 'lock'), h('span', { text: lockText || 'Only Sean and mods post here' }));
      }
      setReply(d.reply);
      if (m !== 'open') { reply.hidden = true; tray.hidden = true; errs.hidden = true; }
      else drawTray();
      autosize(); refresh();
      if (acOpen()) updateAc(); // a role change (made a mod) redraws the command list
    },
  };
}
