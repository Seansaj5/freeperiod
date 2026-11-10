// Profile editor (a sheet with a live preview of the card and of a chat line): basics (display name, pronouns, About me,
// status, picture, banner), name style (color, font, solid / gradient, second color, glow), profile theme, avatar frame
// and profile effect (Nitro-style, free for everyone), and the block list. One updateProfile call per Save with only
// what changed (profile updates are rate limited); limits are enforced before saving.
import { h, openSheet, toast } from '../../ui.js';
import * as data from '../data.js';
import { planUpload } from '../media.js';
import { FONTS, FRAMES, EFFECTS, FONT_LABELS, FRAME_LABELS, EFFECT_LABELS, cardTheme, isHex, paintName, DEFAULT_NAME_COLOR, DEFAULT_NAME_COLOR2 } from '../flair.js';
import { mountEffect } from '../effects.js';
import { checkProfile, profileDiff, PROFILE_FIELDS, LIMITS } from '../perms.js';
import { icon, avatar, nameEl, nameOf, roleMark, badgeMarks, finePointer } from './common.js';
import { openEmojiPicker } from './emoji-picker.js';
import { mountCard } from './profile-card.js';

const errText = (e) => { try { return data.chatError(e) || 'Something went wrong'; } catch { return 'Something went wrong'; } };
// No pink or purple defaults: lime, cyan, amber, green, gold, coral, ice, white.
const SWATCHES = ['#c6ff3d', '#3de0ff', '#ffb020', '#62ff8f', '#ffd84a', '#ff7a3d', '#9ee7ff', '#f3f6ff'];
const THEMES = [['#16361f', '#0b1e33', 'Lime night'], ['#0b2b3d', '#071322', 'Deep sea'], ['#3a1408', '#120a0a', 'Ember'], ['#0f3a2c', '#06140f', 'Forest'],
  ['#3a2a06', '#140d03', 'Gold'], ['#12304a', '#0a1420', 'Ice'], ['#1d2433', '#0a0d14', 'Slate']];
const TABS = [['profile', 'Profile'], ['style', 'Style'], ['frame', 'Frame'], ['effect', 'Effect'], ['blocked', 'Blocked']];

/** cx: { me(), blockedProfiles() -> Profile[], unblock(id) -> Promise, applyProfile(row) } */
export function openProfileEditor(cx, { tab: startTab = 'profile' } = {}) {
  const me = cx.me();
  if (!me) return null;
  const orig = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, me[k] ?? null]));
  if (!orig.name_fill) orig.name_fill = 'solid';
  orig.name_glow = !!orig.name_glow;
  const draft = { ...orig };
  const files = { avatar: null, banner: null }; // { file, url } of the person's own picked file
  const effects = []; // mounted effect previews, stopped on close
  let saving = false;
  let tab = startTab;

  const sheet = openSheet({ title: 'Edit profile', onClose: cleanup });
  sheet.el.classList.add('cx-sheet', 'cx-editor');
  const tabs = h('div', { class: 'cx-ed-tabs', role: 'tablist', 'aria-label': 'Profile sections' });
  const panes = {};
  for (const [k] of TABS) panes[k] = h('div', { class: 'cx-ed-pane', role: 'tabpanel', dataset: { pane: k } });
  const previewCard = h('div');
  const chatLine = h('div', { class: 'cx-ed-line' });
  const preview = h('aside', { class: 'cx-ed-preview', 'aria-label': 'Preview' }, h('p', { class: 'cx-ed-cap', text: 'Preview' }), previewCard, h('p', { class: 'cx-ed-cap', text: 'In chat' }), chatLine);
  const expand = h('button', { type: 'button', class: 'cx-ed-expand', 'aria-expanded': 'false' }, 'Show the whole card');
  expand.addEventListener('click', () => { const on = preview.classList.toggle('open'); expand.setAttribute('aria-expanded', on ? 'true' : 'false'); expand.textContent = on ? 'Show less' : 'Show the whole card'; });
  const errEl = h('p', { class: 'fp-err cx-ed-err', role: 'alert' });
  const saveBtn = h('button', { type: 'button', class: 'fp-btn cx-ed-save' }, 'Save');
  const foot = h('div', { class: 'cx-ed-foot' }, errEl, h('button', { type: 'button', class: 'fp-mini', onclick: () => sheet.close() }, 'Cancel'), saveBtn);
  sheet.body.append(h('div', { class: 'cx-ed-grid' }, h('div', { class: 'cx-ed-main' }, tabs, ...Object.values(panes)), h('div', { class: 'cx-ed-side' }, preview, expand)), foot);
  if (me.banned) sheet.body.prepend(h('p', { class: 'cx-ed-banned' }, icon('block'), 'You’re banned from chat, so your profile can’t change right now.'));

  const view = () => ({ ...me, ...draft });
  const fieldErr = new Map(); // field -> <p>
  const errSlot = (field) => { const p = h('p', { class: 'cx-field-err', role: 'alert', dataset: { field } }); fieldErr.set(field, p); return p; };
  const set = (k, v) => { draft[k] = v; refresh(); };

  // ---------- preview ----------
  const card = mountCard(previewCard, view(), { online: true, effectSeed: 7 });
  function drawLine() {
    const p = view();
    const loc = files.avatar ? files.avatar.url : '';
    chatLine.replaceChildren(h('div', { class: 'cx-msg head cx-ed-msg' },
      h('div', { class: 'cx-gutter' }, avatar(p, { size: 40, frame: 'auto', localSrc: loc })),
      h('div', { class: 'cx-msg-main' }, h('div', { class: 'cx-meta' }, nameEl(p, 'span', 'cx-name'), roleMark(p), badgeMarks(p), h('time', { class: 'cx-time', text: 'Today' })),
        h('div', { class: 'cx-body', text: 'this is how my messages look 😎' }))));
  }

  // ---------- validation + save state ----------
  let raf = 0;
  function refresh() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      card.update(view(), { localAvatar: files.avatar ? files.avatar.url : '', localBanner: files.banner ? files.banner.url : '' });
      drawLine();
      if (tab === 'style') drawFonts();
      validate();
    });
  }
  function validate() {
    const errs = checkProfile(draft);
    for (const [f, p] of fieldErr) { const e = errs.find((x) => x.field === f); p.textContent = e ? e.message : ''; }
    const dirty = Object.keys(profileDiff(orig, draft)).length > 0 || !!files.avatar || !!files.banner;
    saveBtn.disabled = saving || !!errs.length || !dirty || !!me.banned;
    saveBtn.textContent = saving ? 'Saving…' : 'Save';
    return errs;
  }

  // ---------- small form helpers ----------
  function text(field, label, max, { area = false, placeholder = '' } = {}) {
    const input = h(area ? 'textarea' : 'input', { class: area ? 'cx-field-ta' : 'cx-field', maxlength: String(max), placeholder, 'aria-label': label, dataset: { field }, rows: area ? '4' : null });
    input.value = draft[field] || '';
    const count = h('span', { class: 'cx-count' });
    const draw = () => { const n = [...input.value].length; count.textContent = n + ' / ' + max; count.classList.toggle('bad', n > max); };
    input.addEventListener('input', () => { draw(); set(field, input.value.trim() ? input.value : null); });
    draw();
    return h('div', { class: 'cx-ed-field' }, h('label', { class: 'cx-label' }, label, count), input, errSlot(field));
  }
  function colorField(field, label, { fallback = DEFAULT_NAME_COLOR, none = 'Default', swatches = SWATCHES } = {}) {
    const input = h('input', { type: 'color', class: 'cx-color', 'aria-label': label, dataset: { field } });
    const reset = h('button', { type: 'button', class: 'cx-chip', 'aria-pressed': 'false' }, none);
    const sw = h('div', { class: 'cx-swatches' }, ...swatches.map((c) => h('button', { type: 'button', class: 'cx-swatch', style: '--sw:' + c, title: c, 'aria-label': label + ' ' + c, dataset: { color: c }, onclick: () => { set(field, c); draw(); } })));
    const draw = () => {
      input.value = isHex(draft[field]) ? draft[field] : fallback;
      reset.setAttribute('aria-pressed', draft[field] ? 'false' : 'true');
      reset.classList.toggle('on', !draft[field]);
      for (const b of sw.children) b.classList.toggle('on', b.dataset.color === draft[field]);
    };
    input.addEventListener('input', () => { set(field, input.value.toLowerCase()); draw(); });
    reset.addEventListener('click', () => { set(field, null); draw(); });
    draw();
    const wrap = h('div', { class: 'cx-ed-field' }, h('label', { class: 'cx-label', text: label }), h('div', { class: 'cx-color-row' }, input, reset, sw.childElementCount ? sw : null), errSlot(field));
    wrap._draw = draw;
    return wrap;
  }
  function pictureField(kind) {
    const isAv = kind === 'avatar';
    const field = isAv ? 'avatar_path' : 'banner_path';
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, 'aria-hidden': 'true', tabindex: '-1', dataset: { upload: kind } });
    const err = h('p', { class: 'cx-field-err', role: 'alert' });
    const thumb = h('span', { class: 'cx-ed-thumb ' + kind });
    const remove = h('button', { type: 'button', class: 'cx-chip' }, isAv ? 'Remove picture' : 'Remove banner');
    const drawThumb = () => {
      const p = view();
      if (isAv) thumb.replaceChildren(avatar(p, { size: 48, localSrc: files.avatar ? files.avatar.url : '' }));
      else thumb.replaceChildren(h('span', { class: 'cx-ed-bthumb', style: isHex(p.banner_color) ? 'background:' + p.banner_color : '' }, files.banner ? h('img', { src: files.banner.url, alt: '' }) : p.banner_path ? icon('image') : null));
      remove.hidden = !(files[kind] || draft[field]);
    };
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      err.textContent = '';
      if (!f) return;
      const plan = planUpload({ type: f.type, size: f.size }, kind);
      if (!plan.ok) { err.textContent = plan.reason; return; }
      if (files[kind]) URL.revokeObjectURL(files[kind].url);
      files[kind] = { file: f, url: URL.createObjectURL(f) };
      drawThumb(); refresh();
    });
    remove.addEventListener('click', () => {
      if (files[kind]) { URL.revokeObjectURL(files[kind].url); files[kind] = null; }
      draft[field] = null;
      drawThumb(); refresh();
    });
    drawThumb();
    const pick = h('button', { type: 'button', class: 'cx-btn ghost', onclick: () => input.click() }, icon('camera'), isAv ? 'Upload picture' : 'Upload banner');
    return h('div', { class: 'cx-ed-field' }, h('label', { class: 'cx-label', text: isAv ? 'Profile picture' : 'Banner' }),
      h('div', { class: 'cx-ed-pic' }, thumb, pick, remove, input),
      h('p', { class: 'cx-hint', text: isAv ? 'PNG, JPEG, WebP or GIF. A GIF up to 4 MB plays on your card.' : 'About 1500 × 600 looks best. A GIF up to 6 MB plays.' }), err);
  }

  // ---------- Profile ----------
  const statusBtn = h('button', { type: 'button', class: 'cx-emoji-pick', 'aria-label': 'Status emoji', 'aria-haspopup': 'dialog', dataset: { field: 'status_emoji' } });
  const statusClear = h('button', { type: 'button', class: 'cx-iconbtn sm', 'aria-label': 'Clear status emoji', title: 'Clear' }, icon('x'));
  const drawStatus = () => { statusBtn.replaceChildren(draft.status_emoji ? document.createTextNode(draft.status_emoji) : icon('react')); statusClear.hidden = !draft.status_emoji; };
  statusBtn.addEventListener('click', () => openEmojiPicker(statusBtn, { label: 'Status emoji', onPick: (e) => { set('status_emoji', e); drawStatus(); } }));
  statusClear.addEventListener('click', () => { set('status_emoji', null); drawStatus(); });
  drawStatus();
  const statusText = text('status_text', 'Custom status', LIMITS.status_text, { placeholder: 'What are you up to?' });
  statusText.querySelector('input').before(h('div', { class: 'cx-ed-status' }, statusBtn, statusClear));
  statusText.querySelector('.cx-ed-status').append(statusText.querySelector('input'));
  panes.profile.append(
    text('display_name', 'Display name', LIMITS.display_name, { placeholder: me.name || me.username }),
    text('pronouns', 'Pronouns', LIMITS.pronouns, { placeholder: 'they/them' }),
    text('about', 'About me', LIMITS.about, { area: true, placeholder: 'A little about you' }),
    statusText, errSlot('status_emoji'),
    pictureField('avatar'), pictureField('banner'),
    colorField('banner_color', 'Banner color', { fallback: '#16361f', none: 'None', swatches: ['#16361f', '#0b2b3d', '#3a1408', '#3a2a06', '#12304a', '#1d2433'] }));

  // ---------- Style ----------
  const fillSeg = h('div', { class: 'cx-seg', role: 'radiogroup', 'aria-label': 'Name fill' });
  const second = colorField('name_color2', 'Second color', { fallback: DEFAULT_NAME_COLOR2, none: 'Cyan' });
  const drawFill = () => {
    fillSeg.replaceChildren(...[['solid', 'Solid'], ['gradient', 'Gradient']].map(([k, label]) => h('button', { type: 'button', role: 'radio', class: 'cx-seg-b' + (draft.name_fill === k ? ' on' : ''),
      'aria-checked': draft.name_fill === k ? 'true' : 'false', dataset: { fill: k }, onclick: () => { set('name_fill', k); drawFill(); } }, label)));
    second.hidden = draft.name_fill !== 'gradient';
  };
  drawFill();
  const glow = h('input', { type: 'checkbox', role: 'switch', dataset: { field: 'name_glow' } });
  glow.checked = !!draft.name_glow;
  glow.addEventListener('change', () => set('name_glow', glow.checked));
  const fonts = h('div', { class: 'cx-ed-fonts', role: 'radiogroup', 'aria-label': 'Name font' });
  // built once; the samples repaint in place (keeps keyboard focus) whenever the name style changes
  const drawFonts = () => {
    if (!fonts.childElementCount) {
      fonts.append(...FONTS.map((f) => h('button', { type: 'button', role: 'radio', class: 'cx-ed-font', dataset: { font: f }, onclick: () => set('name_font', f) },
        h('span', { class: 'cx-ed-font-name' }), h('small', { text: FONT_LABELS[f] }))));
    }
    const cur = draft.name_font || 'outfit';
    for (const b of fonts.children) {
      const f = b.dataset.font, sample = b.firstChild;
      sample.textContent = nameOf(view());
      sample.removeAttribute('style');
      paintName(sample, { ...view(), name_font: f });
      b.classList.toggle('on', f === cur);
      b.setAttribute('aria-checked', f === cur ? 'true' : 'false');
    }
  };
  const themeRow = h('div', { class: 'cx-ed-themes' });
  const drawThemes = () => {
    themeRow.replaceChildren(h('button', { type: 'button', class: 'cx-ed-theme none' + (!draft.theme_a && !draft.theme_b ? ' on' : ''), onclick: () => { draft.theme_a = null; draft.theme_b = null; refresh(); drawThemes(); drawThemeColors(); } }, h('span', { text: 'None' })),
      ...THEMES.map(([a, b, label]) => h('button', { type: 'button', class: 'cx-ed-theme' + (draft.theme_a === a && draft.theme_b === b ? ' on' : ''), style: `--ta:${a};--tb:${b}`, title: label, 'aria-label': 'Theme ' + label,
        onclick: () => { draft.theme_a = a; draft.theme_b = b; refresh(); drawThemes(); drawThemeColors(); } }, h('span', { text: label }))));
  };
  const themeA = colorField('theme_a', 'Top color', { fallback: '#16361f', none: 'None', swatches: [] });
  const themeB = colorField('theme_b', 'Bottom color', { fallback: '#0b1e33', none: 'None', swatches: [] });
  const drawThemeColors = () => { themeA._draw(); themeB._draw(); };
  for (const el of [themeA, themeB]) el.querySelector('input').addEventListener('input', () => drawThemes());
  panes.style.append(
    colorField('name_color', 'Name color'),
    h('div', { class: 'cx-ed-field' }, h('label', { class: 'cx-label', text: 'Fill' }), fillSeg),
    second,
    h('label', { class: 'cx-check cx-switch' }, glow, h('span', {}, h('b', { text: 'Glow' }), ' A soft neon glow around your name')),
    h('div', { class: 'cx-ed-field' }, h('label', { class: 'cx-label', text: 'Font' }), fonts, errSlot('name_font')),
    h('div', { class: 'cx-ed-field' }, h('label', { class: 'cx-label', text: 'Profile theme' }), themeRow, h('div', { class: 'cx-ed-two' }, themeA, themeB)));

  // ---------- Frame ----------
  const frames = h('div', { class: 'cx-ed-frames', role: 'radiogroup', 'aria-label': 'Avatar frame' });
  const drawFrames = () => {
    const loc = files.avatar ? files.avatar.url : '';
    frames.replaceChildren(...[null, ...FRAMES].map((id) => {
      const on = (draft.frame || null) === id;
      return h('button', { type: 'button', role: 'radio', class: 'cx-ed-tile' + (on ? ' on' : ''), 'aria-checked': on ? 'true' : 'false', dataset: { frame: id || 'none' },
        onclick: () => { set('frame', id); for (const b of frames.children) { const yes = b.dataset.frame === (id || 'none'); b.classList.toggle('on', yes); b.setAttribute('aria-checked', yes ? 'true' : 'false'); } } },
      h('span', { class: 'cx-ed-tile-art' }, avatar({ ...view(), frame: id }, { size: 64, frame: 'auto', localSrc: loc })), h('small', { text: id ? FRAME_LABELS[id] : 'None' }));
    }));
  };
  panes.frame.append(h('p', { class: 'cx-hint', text: 'Frames animate on your card. In chat they move when someone hovers your messages.' }), frames, errSlot('frame'));

  // ---------- Effect ----------
  const fx = h('div', { class: 'cx-ed-effects', role: 'radiogroup', 'aria-label': 'Profile effect' });
  let fxDrawn = false;
  const drawEffects = () => {
    for (const e of effects.splice(0)) e.stop();
    const theme = cardTheme(view());
    fx.replaceChildren(...[null, ...EFFECTS].map((id, i) => {
      const on = (draft.effect || null) === id;
      const art = h('span', { class: 'cx-ed-fx-art', style: theme ? 'background:' + theme : '' });
      const b = h('button', { type: 'button', role: 'radio', class: 'cx-ed-tile fx' + (on ? ' on' : ''), 'aria-checked': on ? 'true' : 'false', dataset: { effect: id || 'none' },
        onclick: () => { set('effect', id); for (const x of fx.children) { const yes = x.dataset.effect === (id || 'none'); x.classList.toggle('on', yes); x.setAttribute('aria-checked', yes ? 'true' : 'false'); } } },
      art, h('small', { text: id ? EFFECT_LABELS[id] : 'None' }));
      if (id) effects.push(mountEffect(art, id, { seed: 11 + i }));
      return b;
    }));
    fxDrawn = true;
  };
  panes.effect.append(h('p', { class: 'cx-hint', text: 'Effects play over your profile card when someone opens it.' }), fx, errSlot('effect'));

  // ---------- Blocked ----------
  const blockedList = h('div', { class: 'cx-ed-blocked' });
  function drawBlocked() {
    const list = cx.blockedProfiles();
    if (!list.length) { blockedList.replaceChildren(h('p', { class: 'cx-hint', text: 'You haven’t blocked anyone. Blocked people can’t DM you or add you to groups, and their messages are hidden for you.' })); return; }
    blockedList.replaceChildren(...list.map((p) => {
      const b = h('button', { type: 'button', class: 'fp-mini' }, 'Unblock');
      b.addEventListener('click', async () => { b.disabled = true; try { await cx.unblock(p.id); toast('Unblocked ' + nameOf(p)); drawBlocked(); } catch (e) { b.disabled = false; toast(errText(e), 'err'); } });
      return h('div', { class: 'cx-ed-brow', dataset: { uid: p.id } }, avatar(p, { size: 32 }), h('span', { class: 'cx-pp-text' }, nameEl(p, 'span', 'cx-name', { plain: true }), h('small', { text: '@' + (p.username || '') })), b);
    }));
  }
  panes.blocked.append(h('p', { class: 'cx-hint', text: 'Unblocking takes effect right away.' }), blockedList);

  // ---------- tabs ----------
  function setTab(k) {
    tab = k;
    tabs.replaceChildren(...TABS.map(([key, label]) => h('button', { type: 'button', role: 'tab', class: 'cx-ed-tab' + (key === k ? ' on' : ''), 'aria-selected': key === k ? 'true' : 'false', dataset: { tab: key },
      onclick: () => setTab(key) }, label)));
    for (const [key, pane] of Object.entries(panes)) pane.hidden = key !== k;
    if (k === 'style') { drawFonts(); drawThemes(); }
    if (k === 'frame') drawFrames();
    if (k === 'effect') drawEffects();
    else if (fxDrawn) { for (const e of effects.splice(0)) e.stop(); fxDrawn = false; fx.replaceChildren(); }
    if (k === 'blocked') drawBlocked();
  }
  setTab(tab);
  drawLine();
  validate();

  saveBtn.addEventListener('click', async () => {
    if (saving || validate().length) return;
    saving = true; errEl.textContent = ''; validate();
    try {
      const patch = profileDiff(orig, draft);
      if (files.avatar) patch.avatar_path = (await data.uploadAvatar(files.avatar.file)).path;
      if (files.banner) patch.banner_path = (await data.uploadBanner(files.banner.file)).path;
      let row = null;
      if (Object.keys(patch).length) row = await data.updateProfile(patch);
      cx.applyProfile(row && row.id ? row : { ...me, ...patch });
      saving = false;
      sheet.close();
      toast('Profile saved');
    } catch (e) {
      saving = false;
      errEl.textContent = (e && e.reason) || errText(e);
      validate();
    }
  });

  function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    card.stop();
    for (const e of effects.splice(0)) e.stop();
    for (const k of ['avatar', 'banner']) if (files[k]) URL.revokeObjectURL(files[k].url);
  }
  if (finePointer()) { const f = panes[tab].querySelector('input, textarea, button'); if (f) f.focus(); }
  return sheet;
}
