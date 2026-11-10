// Server emoji manager (owner and mods): upload a picture under a :name:, see how many of the 50 are used, delete. The
// database checks every rule again (staff only, name pattern, 50 cap), so a refusal shows as the same plain line.
import { h, openSheet, toast } from '../../ui.js';
import * as data from '../data.js';
import { planUpload } from '../media.js';
import { renderTokens } from '../format.js';
import { customEmoji, onEmoji, emojiSrc, emojiNameError, emojiNameClean, EMOJI_MAX } from '../emoji.js';
import { icon, finePointer } from './common.js';

const errText = (e) => { try { return (e && e.reason) || data.chatError(e) || 'Something went wrong'; } catch { return 'Something went wrong'; } };
export const emojiImg = (e) => renderTokens([{ t: 'emoji', name: e.name, src: emojiSrc(e.path) }], document);

/** cx: { reloadEmoji() -> Promise } (the list itself comes from emoji.js, which the app keeps current). */
export function openEmojiManager(cx) {
  const sheet = openSheet({ title: 'Server emoji', onClose: () => { off(); if (previewUrl) URL.revokeObjectURL(previewUrl); } });
  sheet.el.classList.add('cx-sheet', 'cx-emojiman');
  const usage = h('div', { class: 'cx-em-usage' });
  const grid = h('div', { class: 'cx-em-grid', role: 'list' });
  const errEl = h('p', { class: 'fp-err', role: 'alert' });
  let file = null, previewUrl = '', busy = false;

  const nameIn = h('input', { class: 'cx-field cx-em-name', maxlength: '32', placeholder: 'name', 'aria-label': 'Emoji name', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
  const pickIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, 'aria-hidden': 'true', tabindex: '-1', dataset: { upload: 'emoji' } });
  const thumb = h('span', { class: 'cx-em-thumb', 'aria-hidden': 'true' }, icon('image'));
  const pickBtn = h('button', { type: 'button', class: 'cx-btn ghost cx-em-pick', onclick: () => pickIn.click() }, icon('camera'), 'Pick a picture');
  const addBtn = h('button', { type: 'button', class: 'fp-btn cx-em-add' }, 'Add emoji');
  const nameErr = h('p', { class: 'cx-field-err cx-em-nameerr', role: 'status' });
  const hint = h('p', { class: 'cx-hint', text: 'PNG, JPEG, WebP or GIF. Pictures shrink to 128 px; a GIF can be up to 1 MB. People type it as :name:' });

  const full = () => customEmoji().length >= EMOJI_MAX;
  function drawForm() {
    const n = customEmoji().length;
    const msgErr = emojiNameError(nameIn.value, customEmoji().map((e) => e.name));
    nameErr.textContent = nameIn.value ? msgErr : '';
    addBtn.disabled = busy || full() || !file || !!msgErr;
    nameIn.disabled = pickBtn.disabled = busy || full();
    addBtn.textContent = busy ? 'Adding…' : 'Add emoji';
    usage.replaceChildren(...[h('div', { class: 'cx-em-count' }, h('b', { text: String(n) }), ' / ' + EMOJI_MAX + ' emoji'),
      h('div', { class: 'cx-em-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(EMOJI_MAX), 'aria-valuenow': String(n) }, h('i', { style: 'width:' + Math.min(100, (n / EMOJI_MAX) * 100) + '%' })),
      full() ? h('p', { class: 'cx-em-full', role: 'status' }, icon('alert'), 'The server is full (' + EMOJI_MAX + ' emoji). Delete one to add another.') : null].filter(Boolean));
  }
  function drawGrid() {
    const list = customEmoji();
    grid.replaceChildren(...(list.length ? list.map((e) => {
      const del = h('button', { type: 'button', class: 'cx-iconbtn sm danger', title: 'Delete :' + e.name + ':', 'aria-label': 'Delete :' + e.name + ':' }, icon('trash'));
      let armed = 0;
      del.addEventListener('click', async () => {
        if (!armed) { del.classList.add('armed'); del.title = 'Tap again to delete'; armed = setTimeout(() => { armed = 0; del.classList.remove('armed'); del.title = 'Delete :' + e.name + ':'; }, 3500); return; }
        clearTimeout(armed); armed = 0;
        try { await data.deleteEmoji(e.name); await cx.reloadEmoji(); toast(':' + e.name + ': deleted'); } catch (err) { errEl.textContent = errText(err); }
      });
      return h('div', { class: 'cx-em-tile', role: 'listitem', dataset: { emoji: e.name } }, h('span', { class: 'cx-em-art' }, emojiImg(e)), h('span', { class: 'cx-em-label', text: ':' + e.name + ':' }), del);
    }) : [h('p', { class: 'cx-hint cx-em-none', text: 'No server emoji yet. Add the first one above.' })]));
  }
  const draw = () => { drawForm(); drawGrid(); };
  const off = onEmoji(draw);

  pickIn.addEventListener('change', () => {
    const f = pickIn.files && pickIn.files[0];
    pickIn.value = '';
    errEl.textContent = '';
    if (!f) return;
    const plan = planUpload({ type: f.type, size: f.size }, 'emoji');
    if (!plan.ok) { errEl.textContent = plan.reason; return; }
    file = f;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    thumb.replaceChildren(h('img', { src: previewUrl, alt: '' }));
    if (!nameIn.value) nameIn.value = emojiNameClean(f.name.replace(/\.[^.]+$/, ''));
    drawForm();
  });
  nameIn.addEventListener('input', () => { const v = emojiNameClean(nameIn.value); if (v !== nameIn.value) nameIn.value = v; errEl.textContent = ''; drawForm(); });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!addBtn.disabled) addBtn.click(); } });
  addBtn.addEventListener('click', async () => {
    if (busy || !file) return;
    const name = nameIn.value;
    const bad = emojiNameError(name, customEmoji().map((e) => e.name));
    if (bad) { errEl.textContent = bad; return; }
    busy = true; errEl.textContent = ''; drawForm();
    try {
      await data.uploadEmoji(name, file);
      await cx.reloadEmoji();
      toast(':' + name + ': added');
      file = null; nameIn.value = '';
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
      thumb.replaceChildren(icon('image'));
    } catch (e) {
      errEl.textContent = errText(e);
      if (e && e.code === 'emoji_full') cx.reloadEmoji();
    } finally { busy = false; draw(); }
  });

  sheet.body.append(usage,
    h('div', { class: 'cx-em-form' }, thumb, h('div', { class: 'cx-em-fields' }, h('label', { class: 'cx-label', text: 'Name' }), h('div', { class: 'cx-em-row' }, h('span', { class: 'cx-chm-hash', text: ':' }), nameIn, h('span', { class: 'cx-chm-hash', text: ':' })), nameErr, pickBtn, pickIn), addBtn),
    hint, errEl, grid);
  draw();
  if (finePointer()) pickBtn.focus();
  return sheet;
}
