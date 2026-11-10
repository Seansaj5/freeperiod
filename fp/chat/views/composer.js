// Composer: text (Enter sends, Shift+Enter new line), emoji picker, up to 4 pictures with previews and planUpload errors,
// reply chip, typing pings, a draft per conversation. Guests get a Log in bar, read-only channels a lock line.
import { h } from '../../ui.js';
import { planUpload } from '../media.js';
import { icon, nameOf, finePointer } from './common.js';
import { openEmojiPicker, closeEmojiPicker } from './emoji-picker.js';

const MAX_BODY = 2000;
const MAX_FILES = 4;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export function mountComposer(el, { onSend, onTyping, onLogin } = {}) {
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
  const box = h('div', { class: 'cx-cmp-box' }, attach, ta, count, emojiBtn, send);
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
    const body = ta.value.replace(/\s+$/, '').replace(/^\n+/, '');
    if (body.length > MAX_BODY) { showNotice('That message is too long (max ' + MAX_BODY + ' characters)'); return; }
    if (!body.trim() && !d.files.length) return;
    const files = d.files.map((f) => f.file);
    const ok = onSend && onSend({ body: body.trim() ? body : '', files, replyTo: d.reply ? d.reply.id : null, reply: d.reply });
    if (ok === false) return;
    for (const f of d.files) URL.revokeObjectURL(f.url); // the pending message made its own copies
    d.files = []; d.errors = []; d.text = '';
    ta.value = '';
    setReply(null);
    autosize(); drawTray();
  }

  ta.addEventListener('input', () => {
    cur().text = ta.value;
    autosize(); refresh();
    if (ta.value.trim() && onTyping) onTyping();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); doSend(); }
    else if (e.key === 'Escape' && cur().reply) { e.preventDefault(); setReply(null); }
  });
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
      autosize(); refresh();
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
      autosize(); refresh();
    },
    destroy() {
      clearTimeout(showNotice.t);
      closeEmojiPicker();
      dropDrafts();
    },
    focus() { if (mode === 'open' && finePointer()) ta.focus(); },
    // A send that failed before it became a pending message: put the text back so nothing is lost.
    restore(body) {
      if (!body || ta.value.trim()) return;
      ta.value = body; cur().text = body;
      autosize(); refresh();
    },
    setReply,
    notice: showNotice,
    // mode: 'open' | 'locked' (read-only channel; lockKind 'muted' | 'banned' | 'blocked' for those lines) | 'guest' | 'wait' (chat not ready)
    setTarget(k, { placeholder = 'Message', mode: m = 'open', lockText = '', lockKind = '' } = {}) {
      if (key) cur().text = ta.value;
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
    },
  };
}
