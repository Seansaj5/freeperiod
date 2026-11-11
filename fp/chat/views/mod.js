// Owner and mod tools: the message menu (pin, delete, report), the member menu (time-outs, ban, mods, disconnect from
// voice), the owner's channel manager (categories too) and the Reports tab of the owner Inbox. The menus only offer what
// perms.js says will work; the database checks every action again. No innerHTML: message text goes through format.js.
import { h, openSheet, toast } from '../../ui.js';
import * as data from '../data.js';
import { parseMessage, renderTokens } from '../format.js';
import { canPin, canStaffDelete, canReport, memberActions, TIMEOUTS, timedOut, channelName, checkChannel, roleOfProfile, LIMITS } from '../perms.js';
import { groupSidebar, voiceLabel } from '../sidebarlogic.js';
import { icon, avatar, nameEl, nameOf, roleMark, openMenu, fullStamp, timeoutLeft, mediaSrc } from './common.js';
import { openEmojiPicker } from './emoji-picker.js';

const errText = (e) => { try { return data.chatError(e) || 'Something went wrong'; } catch { return 'Something went wrong'; } };
const counter = (input, max) => {
  const c = h('span', { class: 'cx-count' });
  const draw = () => { const n = [...input.value].length; c.textContent = n + ' / ' + max; c.classList.toggle('bad', n > max); };
  input.addEventListener('input', draw); draw();
  return c;
};

// ---------- message menu: one "More" button on the hover toolbar ----------
// cx: { me(), profile(id) }. helpers (from messages.js): { confirmDelete(opts), setPinned(on), author }.
export function messageTools(m, helpers, cx) {
  const me = cx.me();
  if (!me || m.pending || m.failed || m.deleted) return [];
  const author = helpers.author || cx.profile(m.author_id) || { id: m.author_id };
  const items = [];
  if (canPin(me, m, author)) items.push({ label: m.pinned ? 'Unpin message' : 'Pin message', icon: 'pin', onClick: () => helpers.setPinned(!m.pinned) });
  if (canStaffDelete(me, m, author)) items.push({ label: 'Delete message', icon: 'trash', danger: true, note: 'As ' + (roleOfProfile(me) === 'owner' ? 'the owner' : 'a mod'), onClick: () => helpers.confirmDelete({ staff: true }) });
  if (m.body) items.push({ label: 'Copy text', icon: 'copy', onClick: () => { Promise.resolve().then(() => navigator.clipboard.writeText(m.body)).then(() => toast('Copied'), () => toast('Couldn’t copy that', 'err')); } });
  if (canReport(me, m)) items.push('sep', { label: 'Report message', icon: 'flag', danger: true, onClick: () => openReport(m, author) });
  if (!items.length) return [];
  const more = h('button', { type: 'button', class: 'cx-tool', title: 'More', 'aria-label': 'More actions', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon('dots'));
  more.addEventListener('click', () => openMenu(more, items, { label: 'Message actions' }));
  return [more];
}

export function openReport(m, author) {
  const sheet = openSheet({ title: 'Report message' });
  sheet.el.classList.add('cx-sheet');
  const ta = h('textarea', { class: 'cx-field-ta', rows: '3', maxlength: String(LIMITS.report), placeholder: 'Spam, bullying, something unsafe…', 'aria-label': 'What’s wrong?' });
  const errEl = h('p', { class: 'fp-err', role: 'alert' });
  const go = h('button', { type: 'button', class: 'fp-btn cx-danger-btn' }, 'Report');
  sheet.body.append(
    h('div', { class: 'cx-report-who' }, avatar(author, { size: 28 }), nameEl(author), h('span', { class: 'cx-dim', text: m.dm_id ? 'in a DM' : 'in a channel' })),
    h('blockquote', { class: 'cx-quote', text: (m.body || (m.attachments && m.attachments.length ? 'Picture' : 'Message')).slice(0, 400) }),
    h('label', { class: 'cx-label' }, 'What’s wrong? ', h('span', { class: 'cx-dim', text: '(optional)' })), ta,
    h('div', { class: 'cx-field-foot' }, h('span', { class: 'cx-dim', text: 'Sean gets a copy of the message and your note.' }), counter(ta, LIMITS.report)),
    errEl,
    h('div', { class: 'cx-sheet-actions' }, h('button', { type: 'button', class: 'fp-mini', onclick: () => sheet.close() }, 'Cancel'), go));
  go.addEventListener('click', async () => {
    errEl.textContent = '';
    const reason = ta.value.trim();
    if ([...reason].length > LIMITS.report) { errEl.textContent = 'Keep it under ' + LIMITS.report + ' characters'; return; }
    go.disabled = true; go.textContent = 'Sending…';
    try { await data.report(m.id, reason); sheet.close(); toast('Reported. Thanks for telling Sean.'); }
    catch (e) { errEl.textContent = errText(e); go.disabled = false; go.textContent = 'Report'; }
  });
  ta.focus();
}

// ---------- member menu (staff) ----------
// cx: { me(), patchProfile(id, patch), voiceOf(id)? -> the voice channel id they are in, or null }. onError(text)?: the
// opener's error line (the profile card's) for a refused disconnect; without one it is a toast like the others.
// Returns the menu items, or [] when there is nothing to offer.
export function memberItems(target, cx, { onError } = {}) {
  const me = cx.me();
  const can = memberActions(me, target);
  if (!can.timeout && !can.clear && !can.ban && !can.mod) return [];
  const run = async (fn, patch, ok, shown) => {
    try { await fn(); if (patch && cx.patchProfile) cx.patchProfile(target.id, patch); toast(ok); }
    catch (e) { if (shown) shown(errText(e)); else toast(errText(e), 'err'); }
  };
  const who = nameOf(target);
  const left = timeoutLeft(target.muted_until);
  const items = [{ heading: 'Moderate ' + who }];
  // (who may disconnect whom = who may time out whom; the database checks it again)
  const inVoice = can.timeout && typeof cx.voiceOf === 'function' ? cx.voiceOf(target.id) : null;
  if (inVoice != null) items.push({ label: 'Disconnect from voice', icon: 'hangup', danger: true,
    onClick: () => run(() => data.voiceKick(target.id, inVoice), null, who + ' was disconnected from voice', onError) }, 'sep');
  if (can.timeout) for (const [min, label] of TIMEOUTS) items.push({ label: 'Time out ' + label, icon: 'clock',
    onClick: () => run(() => data.timeout(target.id, min), { muted_until: new Date(Date.now() + min * 60e3).toISOString(), muted_by: roleOfProfile(me) === 'owner' ? 'owner' : 'mod' }, who + ' is timed out for ' + label) });
  if (timedOut(target)) items.push({ label: 'Clear time-out', icon: 'check', disabled: !can.clear, note: left + ' min left' + (target.muted_by === 'owner' ? ' · set by Sean' : ''),
    onClick: () => run(() => data.timeout(target.id, 0), { muted_until: null, muted_by: null }, who + ' can post again') });
  if (can.mod) {
    const isMod = roleOfProfile(target) === 'mod';
    items.push('sep', { label: isMod ? 'Remove mod' : 'Make mod', icon: 'shield', onClick: () => run(() => data.setMod(target.id, !isMod), { is_mod: !isMod, mod_revoked: isMod }, isMod ? who + ' is no longer a mod' : who + ' is a mod now') });
  }
  if (can.ban) items.push({ label: target.banned ? 'Unban' : 'Ban from chat', icon: 'block', danger: !target.banned,
    onClick: () => (target.banned ? run(() => data.setBan(target.id, false), { banned: false }, who + ' can chat again') : confirmBan(target, () => run(() => data.setBan(target.id, true), { banned: true }, who + ' is banned from chat'))) });
  return items;
}
export function openMemberMenu(anchor, target, cx, opts) {
  const items = memberItems(target, cx, opts);
  if (items.length) openMenu(anchor, items, { label: 'Moderate ' + nameOf(target) });
  return items.length > 0;
}
function confirmBan(target, go) {
  const sheet = openSheet({ title: 'Ban ' + nameOf(target) + '?' });
  sheet.el.classList.add('cx-sheet');
  const btn = h('button', { type: 'button', class: 'fp-btn cx-danger-btn' }, 'Ban from chat');
  sheet.body.append(h('p', { class: 'fp-note', text: 'They can still read, but they can’t post, react, DM or change their profile until you unban them.' }),
    h('div', { class: 'cx-sheet-actions' }, h('button', { type: 'button', class: 'fp-mini', onclick: () => sheet.close() }, 'Cancel'), btn));
  btn.addEventListener('click', () => { sheet.close(); go(); });
  btn.focus();
}

// ---------- channel manager (owner) ----------
// cx: { channels(), categories(), reloadChannels() (reloads the categories too) }. opts.categoryId: the category the
// new-channel form starts in (the sidebar's + on a category header). Grouped like the sidebar: channels with no category
// first, then each category (rename, delete, up/down); each channel moves up/down inside its category or to another one.
const CAT_MAX = 24;
function checkCategory(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return { error: 'Name the category' };
  if ([...name].length > CAT_MAX) return { error: 'Category names are up to 24 characters' };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { error: 'Category names can’t have special characters' };
  return { name };
}
const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id;
export function openChannelManager(cx, { categoryId = null } = {}) {
  const sheet = openSheet({ title: 'Channels' });
  sheet.el.classList.add('cx-sheet', 'cx-chman');
  const list = h('div', { class: 'cx-chm-list' });
  const errEl = h('p', { class: 'fp-err', role: 'alert' });
  let editing = null;              // channel id being edited
  let renaming = null, draft = ''; // category id being renamed, and what is typed so far
  let deleting = null;             // category id waiting for its "Delete?" answer
  let busy = false;
  const cats = () => (typeof cx.categories === 'function' ? cx.categories() : []).slice().sort(byPos);
  const groups = () => groupSidebar({ channels: cx.channels(), categories: cats(), showEmpty: true });
  const tagOf = (c) => (c.kind === 'voice' ? voiceLabel(c.name) : '#' + c.name);
  async function act(fn) {
    if (busy) return;
    busy = true; errEl.textContent = '';
    try { await fn(); await cx.reloadChannels(); } catch (e) { errEl.textContent = e && e.formError ? e.formError : errText(e); } finally { busy = false; draw(); }
  }
  // A category select: '' = no category.
  function fillCats(sel, value) {
    const v = value == null ? '' : String(value);
    sel.replaceChildren(h('option', { value: '', text: 'No category' }), ...cats().map((k) => h('option', { value: String(k.id), text: k.name })));
    sel.value = v;
    if (sel.value !== v) sel.value = ''; // that category is gone
  }
  const catOf = (sel) => (sel.value ? Number(sel.value) : null);

  // the form for a new channel or an edit (a channel's type is fixed once it exists, so only the new form asks for it)
  let newCat = null;
  function form(c, onDone) {
    const name = h('input', { class: 'cx-field', value: c ? c.name : '', maxlength: '40', placeholder: 'new-channel', 'aria-label': 'Channel name', autocomplete: 'off', spellcheck: 'false' });
    const emoji = h('button', { type: 'button', class: 'cx-emoji-pick', 'aria-label': 'Channel emoji', 'aria-haspopup': 'dialog', text: c ? c.emoji : '💬' });
    const topic = h('input', { class: 'cx-field', value: c ? c.topic || '' : '', maxlength: '120', placeholder: 'What’s it for?', 'aria-label': 'Topic' });
    const only = h('input', { type: 'checkbox' }); only.checked = !!(c && c.owner_only);
    const onlyRow = h('label', { class: 'cx-check' }, only, h('span', {}, h('b', { text: 'Owner-only' }), ' Only Sean and mods post. Everyone reads and reacts.'));
    const hint = h('p', { class: 'cx-hint', text: 'Lowercase letters, numbers and dashes, up to 24' });
    name.addEventListener('input', () => { const v = channelName(name.value); if (v !== name.value) name.value = v; });
    emoji.addEventListener('click', () => openEmojiPicker(emoji, { label: 'Channel emoji', onPick: (e) => { emoji.textContent = e; } }));
    const hash = h('span', { class: 'cx-chm-hash', text: '#', hidden: !!(c && c.kind === 'voice') });
    let cat = null, kind = null;
    if (!c) {
      cat = h('select', { class: 'cx-field cx-chm-sel cx-chm-newcat' });
      fillCats(cat, categoryId);
      newCat = cat;
      kind = h('select', { class: 'cx-field cx-chm-sel cx-chm-kind' }, h('option', { value: 'text', text: 'Text' }), h('option', { value: 'voice', text: 'Voice' }));
      kind.addEventListener('change', () => {
        const voice = kind.value === 'voice';
        onlyRow.hidden = voice; // voice channels hold no messages
        hash.hidden = voice;
        if (emoji.textContent === (voice ? '💬' : '🔊')) emoji.textContent = voice ? '🔊' : '💬';
      });
    }
    const save = h('button', { type: 'button', class: 'fp-btn' }, c ? 'Save' : 'Add channel');
    save.addEventListener('click', () => {
      const v = { name: channelName(name.value), emoji: emoji.textContent, topic: topic.value.trim() };
      const errs = checkChannel(v, cx.channels().filter((x) => !c || x.id !== c.id).map((x) => x.name));
      if (errs.length) { errEl.textContent = errs[0].message; return; }
      const isVoice = c ? c.kind === 'voice' : kind.value === 'voice';
      const tag = isVoice ? voiceLabel(v.name) : '#' + v.name;
      act(async () => {
        if (c) await data.updateChannel(c.id, { name: v.name, emoji: v.emoji, topic: v.topic, owner_only: only.checked });
        else await data.createChannel({ name: v.name, emoji: v.emoji, topic: v.topic, ownerOnly: !isVoice && only.checked, categoryId: catOf(cat), kind: isVoice ? 'voice' : 'text' });
        toast(c ? tag + ' saved' : tag + ' added');
        if (!c) { name.value = ''; topic.value = ''; emoji.textContent = isVoice ? '🔊' : '💬'; only.checked = false; } // ready for the next one
        onDone();
      });
    });
    return h('div', { class: 'cx-chm-form' + (c ? ' edit' : '') },
      h('div', { class: 'cx-chm-row1' }, emoji, hash, name), hint, topic,
      c ? null : h('div', { class: 'cx-chm-row2' },
        h('label', { class: 'cx-chm-pick' }, h('span', { text: 'Category' }), cat),
        h('label', { class: 'cx-chm-pick' }, h('span', { text: 'Type' }), kind)),
      c && c.kind === 'voice' ? null : onlyRow,
      h('div', { class: 'cx-sheet-actions' }, c ? h('button', { type: 'button', class: 'fp-mini', onclick: () => { editing = null; draw(); } }, 'Cancel') : null, save));
  }
  function confirmDelete(c) {
    const tag = tagOf(c);
    const s2 = openSheet({ title: 'Delete ' + tag + '?' });
    s2.el.classList.add('cx-sheet');
    const b = h('button', { type: 'button', class: 'fp-btn cx-danger-btn' }, 'Delete channel');
    s2.body.append(h('p', { class: 'fp-note', text: c.kind === 'voice' ? 'Anyone talking in ' + tag + ' is disconnected. This can’t be undone.' : 'Every message in ' + tag + ' goes with it. This can’t be undone.' }),
      h('div', { class: 'cx-sheet-actions' }, h('button', { type: 'button', class: 'fp-mini', onclick: () => s2.close() }, 'Cancel'), b));
    b.addEventListener('click', () => { s2.close(); act(async () => { await data.deleteChannel(c.id); toast(tag + ' deleted'); }); });
    b.focus();
  }
  // Positions 0.. in the new order, writing only the rows that changed.
  async function renumber(rows, write) { for (let k = 0; k < rows.length; k++) if ((rows[k].position ?? 0) !== k) await write(rows[k].id, k); }
  function move(c, arr, dir) {
    const i = arr.findIndex((x) => x.id === c.id), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const next = arr.slice();
    [next[i], next[j]] = [next[j], next[i]];
    act(() => renumber(next, (id, k) => data.moveChannel(id, k)));
  }
  function moveTo(c, catId) {
    const there = cx.channels().filter((x) => x.id !== c.id && (x.category_id ?? null) === catId);
    const end = there.reduce((m, x) => Math.max(m, (x.position ?? 0) + 1), 0);
    act(async () => { await data.moveChannel(c.id, end, catId); toast(tagOf(c) + ' moved'); });
  }
  function moveCat(k, dir) {
    const arr = cats();
    const i = arr.findIndex((x) => x.id === k.id), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    act(() => renumber(arr, (id, n) => data.moveCategory(id, n)));
  }
  function catRow(k, i, n) {
    if (renaming === k.id) {
      const inp = h('input', { class: 'cx-field', value: draft, maxlength: String(CAT_MAX), 'aria-label': 'Category name', autocomplete: 'off' });
      inp.addEventListener('input', () => { draft = inp.value; });
      const go = () => {
        const v = checkCategory(inp.value);
        if (v.error) { errEl.textContent = v.error; return; }
        act(async () => { await data.updateCategory(k.id, { name: v.name }); renaming = null; toast('Category renamed'); });
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      setTimeout(() => { if (inp.isConnected) inp.focus(); }, 0);
      return h('div', { class: 'cx-chm-cat editing', dataset: { cat: String(k.id) } }, inp,
        h('button', { type: 'button', class: 'fp-mini', onclick: () => { renaming = null; draw(); } }, 'Cancel'),
        h('button', { type: 'button', class: 'fp-mini', onclick: go }, 'Save'));
    }
    if (deleting === k.id) {
      const inIt = cx.channels().filter((c) => c.category_id === k.id).length;
      const del = h('button', { type: 'button', class: 'fp-mini danger cx-chm-catdel-yes' }, 'Delete category');
      del.addEventListener('click', () => act(async () => { await data.deleteCategory(k.id); deleting = null; toast(k.name + ' deleted'); }));
      setTimeout(() => { if (del.isConnected) del.focus(); }, 0);
      return h('div', { class: 'cx-chm-cat confirm', role: 'group', 'aria-label': 'Delete ' + k.name + '?', dataset: { cat: String(k.id) } },
        h('span', { class: 'cx-chm-ask', text: 'Delete ' + k.name + '? ' + (inIt ? (inIt === 1 ? 'Its channel moves' : 'Its ' + inIt + ' channels move') + ' to No category.' : 'It has no channels.') }),
        h('button', { type: 'button', class: 'fp-mini', onclick: () => { deleting = null; draw(); } }, 'Cancel'), del);
    }
    return h('div', { class: 'cx-chm-cat', dataset: { cat: String(k.id) } },
      h('span', { class: 'cx-chm-catname', text: k.name }),
      h('span', { class: 'cx-chm-btns' },
        h('button', { type: 'button', class: 'cx-iconbtn sm', 'aria-label': 'Move ' + k.name + ' up', title: 'Move up', disabled: i === 0, onclick: () => moveCat(k, -1) }, icon('up')),
        h('button', { type: 'button', class: 'cx-iconbtn sm', 'aria-label': 'Move ' + k.name + ' down', title: 'Move down', disabled: i === n - 1, onclick: () => moveCat(k, 1) }, icon('down')),
        h('button', { type: 'button', class: 'cx-iconbtn sm', 'aria-label': 'Rename ' + k.name, title: 'Rename', onclick: () => { renaming = k.id; draft = k.name; deleting = null; draw(); } }, icon('edit')),
        h('button', { type: 'button', class: 'cx-iconbtn sm danger', 'aria-label': 'Delete ' + k.name, title: 'Delete', onclick: () => { deleting = k.id; renaming = null; draw(); } }, icon('trash'))));
  }
  function chanRow(c, i, arr) {
    const tag = tagOf(c);
    const sel = h('select', { class: 'cx-field cx-chm-sel cx-chm-move', 'aria-label': 'Category for ' + tag, title: 'Category' });
    fillCats(sel, c.category_id);
    sel.addEventListener('change', () => moveTo(c, catOf(sel)));
    return h('div', { class: 'cx-chm-item' + (c.kind === 'voice' ? ' voice' : ''), dataset: { cid: String(c.id) } },
      h('span', { class: 'cx-ch-emoji', 'aria-hidden': 'true', text: c.emoji || '#' }),
      h('span', { class: 'cx-chm-text' }, h('span', { class: 'cx-chm-name', text: tag }), c.topic ? h('small', { text: c.topic }) : null),
      c.owner_only ? h('span', { class: 'cx-ch-lock', title: 'Owner-only' }, icon('lock')) : null,
      h('span', { class: 'cx-chm-btns' }, sel,
        h('button', { type: 'button', class: 'cx-iconbtn sm', 'aria-label': 'Move ' + tag + ' up', title: 'Move up', disabled: i === 0, onclick: () => move(c, arr, -1) }, icon('up')),
        h('button', { type: 'button', class: 'cx-iconbtn sm', 'aria-label': 'Move ' + tag + ' down', title: 'Move down', disabled: i === arr.length - 1, onclick: () => move(c, arr, 1) }, icon('down')),
        h('button', { type: 'button', class: 'cx-iconbtn sm', 'aria-label': 'Edit ' + tag, title: c.kind === 'voice' ? 'Rename, topic' : 'Rename, topic, owner-only', onclick: () => { editing = c.id; draw(); } }, icon('edit')),
        h('button', { type: 'button', class: 'cx-iconbtn sm danger', 'aria-label': 'Delete ' + tag, title: 'Delete', onclick: () => confirmDelete(c) }, icon('trash'))));
  }
  function draw() {
    const all = cats();
    const kids = [];
    for (const g of groups()) {
      if (g.category) kids.push(catRow(g.category, all.findIndex((k) => k.id === g.category.id), all.length));
      else kids.push(h('div', { class: 'cx-chm-cat none', text: 'No category' }));
      g.channels.forEach((c, i) => kids.push(editing === c.id ? form(c, () => { editing = null; }) : chanRow(c, i, g.channels)));
      if (g.category && !g.channels.length) kids.push(h('p', { class: 'cx-hint cx-chm-empty', text: 'No channels in ' + g.category.name + ' yet' }));
    }
    list.replaceChildren(...kids);
    if (newCat) fillCats(newCat, catOf(newCat));
  }
  // new category
  const catName = h('input', { class: 'cx-field', maxlength: String(CAT_MAX), placeholder: 'New category', 'aria-label': 'New category name', autocomplete: 'off' });
  const addCat = () => {
    const v = checkCategory(catName.value);
    if (v.error) { errEl.textContent = v.error; return; }
    act(async () => { await data.createCategory({ name: v.name }); catName.value = ''; toast(v.name + ' added'); });
  };
  catName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } });
  const newForm = form(null, () => {});
  draw();
  sheet.body.append(list, errEl,
    h('div', { class: 'cx-chm-addcat' }, catName, h('button', { type: 'button', class: 'fp-mini cx-chm-addcat-btn', onclick: addCat }, 'Add category')),
    h('h3', { class: 'cx-sheet-sub', text: 'New channel' }), newForm);
  if (categoryId != null) { const n = newForm.querySelector('input'); n.scrollIntoView({ block: 'nearest' }); n.focus(); }
  else sheet.focus();
  return { redraw: draw, close: sheet.close };
}

// ---------- Reports (owner Inbox tab) ----------
// opts.onOpen({ channel, message }) opens a channel message in chat. opts.me: the owner's profile (for the member menu).
export async function renderReports(el, { onOpen, me = null } = {}) {
  let rows = [], filter = 'open', channels = [];
  const chips = h('div', { class: 'fp-chips' });
  const status = h('p', { class: 'fp-note', role: 'status', text: 'Loading…' });
  const list = h('ul', { class: 'fp-inbox cx-reports' });
  el.replaceChildren(chips, status, list);
  const chName = (id) => (channels.find((c) => c.id === id) || {}).name;

  function draw() {
    const counts = { open: rows.filter((r) => !r.resolved).length, done: rows.filter((r) => r.resolved).length, all: rows.length };
    chips.replaceChildren(...[['open', 'Open'], ['done', 'Resolved'], ['all', 'All']].map(([k, label]) =>
      h('button', { type: 'button', class: 'fp-pick' + (filter === k ? ' on' : ''), 'aria-pressed': filter === k ? 'true' : 'false', onclick: () => { filter = k; draw(); } }, label + ' ' + counts[k])));
    const shown = rows.filter((r) => filter === 'all' || (filter === 'open' ? !r.resolved : r.resolved));
    status.textContent = shown.length ? '' : filter === 'open' ? 'No open reports. All quiet.' : 'Nothing here.';
    list.replaceChildren(...shown.map(item));
  }
  async function act(r, fn, ok) {
    try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e), 'err'); }
    await load();
  }
  function item(r) {
    const s = r.snapshot || {};
    const author = r.author || { id: s.author_id, username: s.author_username || 'someone' };
    const reporter = r.reporter_profile || { id: r.reporter, username: 'someone' };
    const where = s.dm_id ? h('span', { class: 'fp-tag cx-tag-dm' }, icon('lock'), 'DM') : h('span', { class: 'fp-tag', text: '#' + (chName(s.channel_id) || 'deleted-channel') });
    const body = h('div', { class: 'cx-body cx-rep-body' });
    if (s.body) body.append(renderTokens(parseMessage(String(s.body), { users: new Set(), me: '' }), document));
    const atts = Array.isArray(s.attachments) ? s.attachments.filter((a) => a && a.path) : [];
    const pics = atts.length ? h('div', { class: 'cx-rep-pics' }, ...atts.slice(0, 4).map((a) => {
      const cell = h('span', { class: 'cx-rep-pic' + (a.kind === 'gif' ? ' gif' : '') });
      if (a.expired) cell.append(h('small', { text: 'Picture expired' }));
      else mediaSrc(a).then((src) => { if (src) cell.append(h('img', { src, alt: 'Reported picture', loading: 'lazy' })); else cell.append(h('small', { text: 'Picture unavailable' })); });
      return cell;
    })) : null;
    const gone = r.message_deleted;
    const actions = h('div', { class: 'fp-item-actions' });
    if (s.channel_id && !gone && onOpen) actions.append(h('button', { type: 'button', class: 'fp-mini', onclick: () => onOpen({ channel: s.channel_id, message: s.message_id }) }, 'Open in chat'));
    if (!gone && s.message_id) {
      // two taps: the first arms it for 4 s (deleting can't be undone)
      const del = h('button', { type: 'button', class: 'fp-mini danger' }, 'Delete message');
      let armed = 0;
      del.addEventListener('click', () => {
        if (!armed) { del.textContent = 'Tap again to delete'; armed = setTimeout(() => { armed = 0; del.textContent = 'Delete message'; }, 4000); return; }
        clearTimeout(armed); armed = 0;
        act(r, () => data.deleteMessage(s.message_id), 'Message deleted');
      });
      actions.append(del);
    }
    if (me && author.id && author.role !== 'owner') {
      const mod = h('button', { type: 'button', class: 'fp-mini', 'aria-haspopup': 'menu' }, 'Moderate ' + nameOf(author));
      mod.addEventListener('click', () => { if (!openMemberMenu(mod, author, { me: () => me, patchProfile: () => load() })) toast('Nothing to do for ' + nameOf(author)); });
      actions.append(mod);
    }
    actions.append(h('button', { type: 'button', class: 'fp-mini', onclick: () => act(r, () => data.resolveReport(r.id, !r.resolved), r.resolved ? 'Report reopened' : 'Resolved') }, r.resolved ? 'Reopen' : 'Resolve'));
    return h('li', { class: 'fp-item cx-rep' + (r.resolved ? ' done' : ''), dataset: { rid: String(r.id) } },
      h('div', { class: 'fp-item-meta' }, where, h('span', { class: 'cx-rep-by' }, avatar(reporter, { size: 20 }), nameEl(reporter, 'b', 'cx-name', { plain: true }), ' reported'),
        h('time', { datetime: r.created_at, text: r.created_at ? fullStamp(r.created_at) : '' })),
      r.reason ? h('p', { class: 'cx-rep-reason' }, icon('flag'), h('span', { text: r.reason })) : null,
      h('div', { class: 'cx-rep-msg' },
        h('div', { class: 'cx-rep-head' }, avatar(author, { size: 28 }), nameEl(author, 'b', 'cx-name', { plain: true }), roleMark(author), h('span', { class: 'cx-dim', text: '@' + (author.username || s.author_username || '') }),
          s.created_at ? h('time', { class: 'cx-dim', text: fullStamp(s.created_at) }) : null),
        s.body ? body : null, pics,
        gone ? h('p', { class: 'cx-rep-gone' }, icon('trash'), 'This message has been deleted. The copy above is what was reported.') : null),
      actions);
  }
  async function load() {
    try {
      const [rs, cs] = await Promise.all([data.listReports(), channels.length ? channels : data.listChannels().catch(() => [])]);
      rows = Array.isArray(rs) ? rs : [];
      channels = Array.isArray(cs) ? cs : [];
      draw();
    } catch (e) { status.textContent = errText(e); list.replaceChildren(); }
  }
  await load();
  return { reload: load };
}

// ---------- Hallpass helper (owner): AI on/off, extra instructions, today's usage and the FAQ ----------
export const FAQ_LIMITS = Object.freeze({ question: 120, answer: 1000, keywords: 30, keyword: 40, instructions: 1000 });
/** "a, b ,c" -> ['a','b','c'] (trimmed, no blanks, no repeats). */
export const parseKeywords = (s) => [...new Set(String(s || '').split(',').map((x) => x.trim()).filter(Boolean))];
/** FAQ form errors: [{ field, message }]. */
export function checkFaq({ question, answer, keywords }) {
  const out = [];
  const len = (s) => [...String(s || '')].length;
  if (!String(question || '').trim()) out.push({ field: 'question', message: 'Write the question' });
  else if (len(question) > FAQ_LIMITS.question) out.push({ field: 'question', message: 'Questions are up to 120 characters' });
  if (!String(answer || '').trim()) out.push({ field: 'answer', message: 'Write the answer' });
  else if (len(answer) > FAQ_LIMITS.answer) out.push({ field: 'answer', message: 'Answers are up to 1000 characters' });
  const k = keywords || [];
  if (k.length > FAQ_LIMITS.keywords) out.push({ field: 'keywords', message: 'Up to 30 keywords' });
  else if (k.some((w) => len(w) > FAQ_LIMITS.keyword)) out.push({ field: 'keywords', message: 'Each keyword is up to 40 characters' });
  return out;
}

/** cx: { reloadFaq() -> Promise (the app's copy of the FAQ), faq() -> rows, bot() -> Hallpass profile }. */
export async function openHallpassTools(cx) {
  const sheet = openSheet({ title: 'Hallpass helper' });
  sheet.el.classList.add('cx-sheet', 'cx-hpman');
  const errEl = h('p', { class: 'fp-err', role: 'alert' });
  const aiBox = h('input', { type: 'checkbox', role: 'switch', dataset: { field: 'ai_on' }, disabled: true });
  const aiNote = h('span', { class: 'cx-dim', text: 'Loading…' });
  const usage = h('p', { class: 'cx-hint cx-hp-usage', text: '' });
  const instr = h('textarea', { class: 'cx-field-ta', rows: '3', maxlength: String(FAQ_LIMITS.instructions), placeholder: 'Anything extra Hallpass should know or do…', 'aria-label': 'Extra instructions for Hallpass AI', dataset: { field: 'extra_instructions' } });
  const instrSave = h('button', { type: 'button', class: 'fp-mini' }, 'Save instructions');
  const list = h('div', { class: 'cx-faq-list' });
  let editing = null;   // faq id, or 'new'
  let busy = false;

  async function loadSettings() {
    try {
      const s = await data.getOwnerBotSettings();
      aiBox.checked = !!s.ai_on; aiBox.disabled = false;
      instr.value = s.extra_instructions || '';
      aiNote.textContent = s.ai_on ? 'On: questions the FAQ can’t answer go to Hallpass AI.' : 'Off: Hallpass only answers the questions below and says “AI answers aren’t on yet”.';
    } catch (e) { aiNote.textContent = errText(e); }
    try {
      const rows = await data.botUsage();
      const day = new Date().toISOString().slice(0, 10);
      const today = (Array.isArray(rows) ? rows : []).filter((r) => r.day === day);
      const n = today.reduce((a, r) => a + (r.count || 0), 0);
      usage.textContent = 'Today: ' + n + ' AI ' + (n === 1 ? 'answer' : 'answers') + ' from ' + today.length + ' ' + (today.length === 1 ? 'person' : 'people') + ' (caps: 10 an hour each, 200 a day).';
    } catch { usage.textContent = ''; }
  }
  aiBox.addEventListener('change', async () => {
    const want = aiBox.checked;
    aiBox.disabled = true; errEl.textContent = '';
    try { await data.setBotSettings({ ai_on: want }); toast(want ? 'Hallpass AI is on' : 'Hallpass AI is off'); }
    catch (e) { aiBox.checked = !want; errEl.textContent = errText(e); }
    aiBox.disabled = false;
    loadSettings();
  });
  instrSave.addEventListener('click', async () => {
    errEl.textContent = '';
    if ([...instr.value].length > FAQ_LIMITS.instructions) { errEl.textContent = 'Instructions are up to 1000 characters'; return; }
    instrSave.disabled = true;
    try { await data.setBotSettings({ extra_instructions: instr.value }); toast('Instructions saved'); } catch (e) { errEl.textContent = errText(e); }
    instrSave.disabled = false;
  });

  function form(item) {
    const q = h('input', { class: 'cx-field', value: item ? item.question : '', maxlength: String(FAQ_LIMITS.question), placeholder: 'How do I…?', 'aria-label': 'Question', dataset: { field: 'question' } });
    const a = h('textarea', { class: 'cx-field-ta', rows: '4', maxlength: String(FAQ_LIMITS.answer), placeholder: 'A short, friendly answer', 'aria-label': 'Answer', dataset: { field: 'answer' } });
    a.value = item ? item.answer : '';
    const k = h('input', { class: 'cx-field', value: item ? (item.keywords || []).join(', ') : '', placeholder: 'log in, login, password', 'aria-label': 'Keywords, separated by commas', dataset: { field: 'keywords' } });
    const lineErr = h('p', { class: 'fp-err', role: 'alert' });
    const save = h('button', { type: 'button', class: 'fp-btn' }, item ? 'Save' : 'Add question');
    save.addEventListener('click', async () => {
      if (busy) return;
      const v = { question: q.value.trim(), answer: a.value.trim(), keywords: parseKeywords(k.value) };
      const errs = checkFaq(v);
      if (errs.length) { lineErr.textContent = errs[0].message; return; }
      busy = true; save.disabled = true; lineErr.textContent = '';
      try {
        await data.saveFaq(item ? { ...v, id: item.id, position: item.position } : v);
        await cx.reloadFaq();
        toast(item ? 'Question saved' : 'Question added');
        editing = null; draw();
      } catch (e) { lineErr.textContent = errText(e); save.disabled = false; }
      busy = false;
    });
    return h('div', { class: 'cx-faq-form' + (item ? ' edit' : ''), dataset: { faq: item ? String(item.id) : 'new' } },
      h('label', { class: 'cx-label' }, 'Question', counter(q, FAQ_LIMITS.question)), q,
      h('label', { class: 'cx-label' }, 'Answer', counter(a, FAQ_LIMITS.answer)), a,
      h('label', { class: 'cx-label' }, 'Keywords ', h('span', { class: 'cx-dim', text: '(words people might type, separated by commas)' })), k,
      lineErr,
      h('div', { class: 'cx-sheet-actions' }, item || editing === 'new' ? h('button', { type: 'button', class: 'fp-mini', onclick: () => { editing = null; draw(); } }, 'Cancel') : null, save));
  }
  function draw() {
    const rows = cx.faq().slice().sort((x, y) => (x.position ?? 0) - (y.position ?? 0) || x.id - y.id);
    list.replaceChildren(...rows.map((it) => {
      if (editing === it.id) return form(it);
      return h('div', { class: 'cx-faq-item', dataset: { faq: String(it.id) } },
        h('span', { class: 'cx-faq-text' }, h('b', { class: 'cx-faq-q', text: it.question }), h('small', { text: it.answer })),
        h('span', { class: 'cx-chm-btns' },
          h('button', { type: 'button', class: 'cx-iconbtn sm cx-faq-edit', 'aria-label': 'Edit “' + it.question + '”', title: 'Edit', onclick: () => { editing = it.id; draw(); } }, icon('edit')),
          h('button', { type: 'button', class: 'cx-iconbtn sm danger cx-faq-del', 'aria-label': 'Delete “' + it.question + '”', title: 'Delete', onclick: () => confirmDeleteFaq(it) }, icon('trash'))));
    }), editing === 'new' ? form(null) : h('button', { type: 'button', class: 'cx-btn ghost cx-faq-new', onclick: () => { editing = 'new'; draw(); } }, icon('plus'), 'Add a question'));
  }
  function confirmDeleteFaq(it) {
    const s2 = openSheet({ title: 'Delete this question?' });
    s2.el.classList.add('cx-sheet');
    const b = h('button', { type: 'button', class: 'fp-btn cx-danger-btn' }, 'Delete');
    s2.body.append(h('p', { class: 'fp-note', text: '“' + it.question + '” goes away for everyone.' }),
      h('div', { class: 'cx-sheet-actions' }, h('button', { type: 'button', class: 'fp-mini', onclick: () => s2.close() }, 'Cancel'), b));
    b.addEventListener('click', async () => {
      s2.close();
      try { await data.deleteFaq(it.id); await cx.reloadFaq(); toast('Question deleted'); draw(); } catch (e) { errEl.textContent = errText(e); }
    });
    b.focus();
  }

  sheet.body.append(
    h('label', { class: 'cx-check cx-switch cx-hp-ai' }, aiBox, h('span', {}, h('b', { text: 'Hallpass AI' }), ' ', aiNote)),
    usage,
    h('div', { class: 'cx-ed-field' }, h('label', { class: 'cx-label' }, 'Extra instructions ', counter(instr, FAQ_LIMITS.instructions)), instr, h('div', { class: 'cx-sheet-actions' }, instrSave)),
    errEl,
    h('h3', { class: 'cx-sheet-sub', text: 'Questions Hallpass answers for free' }), list);
  draw();
  loadSettings();
  return { close: sheet.close, redraw: draw };
}
