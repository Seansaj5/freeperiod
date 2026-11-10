// Direct messages: the DM list (avatars, names, unread, last message), the people picker (new DM, new group of up to 10,
// add to a group) and leaving a group. Refusals from the database (blocked, full, banned) show as chatError text.
import { h, openSheet, toast } from '../../ui.js';
import * as data from '../data.js';
import { badge } from '../unread.js';
import { groupNameError, LIMITS } from '../perms.js';
import { icon, avatar, nameEl, nameOf, roleMark, timeShort, dayKey, finePointer } from './common.js';

const errText = (e) => { try { return data.chatError(e) || 'Something went wrong'; } catch { return 'Something went wrong'; } };

/** The people in a DM other than me (profiles). */
export const dmOthers = (dm, myId) => (dm && Array.isArray(dm.members) ? dm.members.filter((p) => p && p.id !== myId) : []);
/** A DM's title: the other person (1:1), or the group's name, or its members' names. */
export function dmTitle(dm, myId) {
  const others = dmOthers(dm, myId);
  if (!dm.is_group) return others[0] ? nameOf(others[0]) : 'Just you';
  if (dm.name) return dm.name;
  const names = others.map(nameOf);
  return names.length ? (names.length > 3 ? names.slice(0, 3).join(', ') + ' +' + (names.length - 3) : names.join(', ')) : 'Empty group';
}
export const lastAt = (dm) => Date.parse((dm.last && dm.last.created_at) || dm.created_at || 0) || 0;

// A group's picture: up to two member avatars stacked.
export function groupIcon(dm, myId, size = 34) {
  const others = dmOthers(dm, myId).slice(0, 2);
  if (others.length < 2) return h('span', { class: 'cx-av cx-grp-ic', style: `--av:${size}px`, 'aria-hidden': 'true' }, icon('users'));
  return h('span', { class: 'cx-grp-stack', style: `--av:${size}px`, 'aria-hidden': 'true' }, avatar(others[0], { size: Math.round(size * 0.72) }), avatar(others[1], { size: Math.round(size * 0.72) }));
}

function preview(dm, myId, profile) {
  const m = dm.last;
  if (!m) return dm.is_group ? (dm.members || []).length + ' members' : 'Say hi 👋';
  const who = m.author_id === myId ? 'You: ' : dm.is_group ? nameOf(profile(m.author_id) || dm.members.find((p) => p.id === m.author_id)) + ': ' : '';
  if (m.deleted) return who + 'message deleted';
  const text = String(m.body || '').replace(/\s+/g, ' ').trim();
  return who + (text || (m.attachments && m.attachments.length ? '📷 Picture' : 'Message'));
}
function when(t) {
  if (!t) return '';
  const d = new Date(t);
  return dayKey(d) === dayKey(new Date()) ? timeShort(d) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * The DM list for the sidebar. o: { dms, current, unread: Map, myId, online: Set, profile(id), isBlocked(id), onPick(dm), onNew(), onNewGroup(), guest }
 * @returns {Node[]}
 */
export function dmListNodes(o) {
  const head = h('div', { class: 'cx-cat cx-dm-cat' }, h('span', { text: 'Direct messages' }),
    h('span', { class: 'cx-dm-acts' },
      h('button', { type: 'button', class: 'cx-iconbtn sm', title: 'New message', 'aria-label': 'New message', onclick: () => o.onNew() }, icon('plus')),
      h('button', { type: 'button', class: 'cx-iconbtn sm', title: 'New group', 'aria-label': 'New group', onclick: () => o.onNewGroup() }, icon('users'))));
  const list = (o.dms || []).slice().sort((a, b) => lastAt(b) - lastAt(a));
  if (!list.length) {
    return [head, h('div', { class: 'cx-empty-side' }, h('span', { class: 'cx-empty-ic', 'aria-hidden': 'true' }, icon('chat')), h('strong', { text: 'No DMs yet' }),
      h('span', { text: 'Click someone’s name to message them, or start a group of up to 10.' }),
      h('button', { type: 'button', class: 'cx-btn ghost', onclick: () => o.onNew() }, icon('plus'), 'New message'))];
  }
  return [head, ...list.map((dm) => {
    const key = 'd:' + dm.id;
    const u = o.unread.get(key) || {};
    const b = badge({ unread: u.unread || 0, mentions: u.unread || 0 }); // every unread DM message counts, like a mention
    const on = o.current === dm.id;
    const others = dmOthers(dm, o.myId);
    const one = !dm.is_group ? others[0] : null;
    const live = one ? (o.profile(one.id) || one) : null;
    const pic = one ? avatar(live, { size: 34, status: o.online.has(one.id) ? 'online' : 'offline', frame: 'hover' }) : groupIcon(dm, o.myId);
    const title = dmTitle(dm, o.myId);
    const row = h('button', { type: 'button', class: 'cx-dm' + (on ? ' on' : '') + (b.dot && !on ? ' unread' : ''), 'aria-current': on ? 'page' : 'false',
      dataset: { dm: dm.id }, onclick: () => o.onPick(dm) },
      h('span', { class: 'cx-ch-pip', 'aria-hidden': 'true' }), pic,
      h('span', { class: 'cx-dm-text' },
        h('span', { class: 'cx-dm-top' }, one ? nameEl(live, 'span', 'cx-dm-name', { plain: true }) : h('span', { class: 'cx-dm-name', text: title }),
          h('time', { class: 'cx-dm-time', text: when(lastAt(dm)) })),
        h('span', { class: 'cx-dm-last', text: one && o.isBlocked(one.id) ? 'Blocked' : preview(dm, o.myId, o.profile) })),
      b.text && !on ? h('span', { class: 'cx-ch-badge', 'aria-label': b.text + ' unread', text: b.text }) : null);
    row.setAttribute('aria-label', title + (b.text && !on ? ', ' + b.text + ' unread' : ''));
    return row;
  })];
}

/**
 * People picker sheet. mode: 'dm' (pick one), 'group' (pick 2-9 + a name), 'add' (pick people for an existing group).
 * o: { myId, isBlocked(id), exclude: Set(ids), room: how many more fit, onDone(profiles, name) -> Promise (throws to show an error) }
 */
export function openPeoplePicker(mode, o) {
  const title = mode === 'dm' ? 'New message' : mode === 'group' ? 'New group' : 'Add people';
  const sheet = openSheet({ title });
  sheet.el.classList.add('cx-sheet', 'cx-picker-sheet');
  const max = mode === 'dm' ? 1 : Math.max(0, o.room ?? LIMITS.group - 1);
  const picked = new Map();
  const search = h('input', { type: 'search', class: 'cx-field', placeholder: 'Find people by name', 'aria-label': 'Find people', autocomplete: 'off', spellcheck: 'false' });
  const chips = h('div', { class: 'cx-pp-chips' });
  const list = h('div', { class: 'cx-pp-list', role: 'listbox', 'aria-multiselectable': mode === 'dm' ? 'false' : 'true' });
  const nameIn = mode === 'group' ? h('input', { class: 'cx-field', maxlength: String(LIMITS.group_name), placeholder: 'Group name (optional)', 'aria-label': 'Group name' }) : null;
  const errEl = h('p', { class: 'fp-err', role: 'alert' });
  const go = h('button', { type: 'button', class: 'fp-btn' }, mode === 'dm' ? 'Message' : mode === 'group' ? 'Create group' : 'Add');
  const note = h('p', { class: 'cx-hint' });
  sheet.body.append(...[
    mode === 'dm' ? h('p', { class: 'fp-note', text: 'Pick someone to message.' }) : h('p', { class: 'fp-note', text: mode === 'group' ? 'Groups hold up to 10 people, you included.' : 'Groups hold up to 10 people.' }),
    nameIn, search, chips, list, note, errEl,
    h('div', { class: 'cx-sheet-actions' }, h('button', { type: 'button', class: 'fp-mini', onclick: () => sheet.close() }, 'Cancel'), go)].filter(Boolean));
  let results = [];
  let seq = 0;

  function drawChips() {
    chips.replaceChildren(...[...picked.values()].map((p) => h('span', { class: 'cx-pp-chip' }, avatar(p, { size: 20 }), h('span', { text: nameOf(p) }),
      h('button', { type: 'button', class: 'cx-pp-chip-x', 'aria-label': 'Remove ' + nameOf(p), onclick: () => { picked.delete(p.id); drawChips(); drawList(); } }, icon('x')))));
    chips.hidden = mode === 'dm' || !picked.size;
    const need = mode === 'group' ? 2 : 1;
    go.disabled = picked.size < need;
    note.textContent = mode === 'dm' ? '' : picked.size + ' / ' + max + ' picked' + (mode === 'group' && picked.size < 2 ? ' (pick at least 2)' : '');
  }
  function drawList() {
    const rows = results.filter((p) => p.id !== o.myId && !(o.exclude && o.exclude.has(p.id)));
    if (!rows.length) { list.replaceChildren(h('p', { class: 'cx-pp-none', text: search.value.trim() ? 'Nobody matches “' + search.value.trim() + '”' : 'Nobody to add.' })); return; }
    list.replaceChildren(...rows.map((p) => {
      const on = picked.has(p.id);
      const blocked = o.isBlocked && o.isBlocked(p.id);
      const full = !on && mode !== 'dm' && picked.size >= max;
      const b = h('button', { type: 'button', role: 'option', class: 'cx-pp-row' + (on ? ' on' : ''), 'aria-selected': on ? 'true' : 'false', disabled: blocked || full || p.banned,
        dataset: { uid: p.id }, title: blocked ? 'You blocked them' : p.banned ? 'Banned from chat' : full ? 'The group is full' : '' },
        avatar(p, { size: 32 }), h('span', { class: 'cx-pp-text' }, h('span', { class: 'cx-pp-name' }, nameEl(p, 'span', 'cx-name', { plain: true }), roleMark(p)), h('small', { text: '@' + p.username })),
        blocked ? h('span', { class: 'cx-pp-tag', text: 'Blocked' }) : mode === 'dm' ? icon('right', 'cx-pp-go') : h('span', { class: 'cx-pp-box', 'aria-hidden': 'true' }, on ? icon('check') : null));
      b.addEventListener('click', () => {
        if (mode === 'dm') { picked.clear(); picked.set(p.id, p); submit(); return; }
        if (on) picked.delete(p.id); else picked.set(p.id, p);
        drawChips(); drawList();
      });
      return b;
    }));
  }
  async function find() {
    const n = ++seq;
    try {
      const got = await data.findProfiles(search.value.trim());
      if (n !== seq) return;
      results = (Array.isArray(got) ? got : []).filter((p) => p && p.id);
      drawList();
    } catch (e) { if (n === seq) list.replaceChildren(h('p', { class: 'fp-err', text: errText(e) })); }
  }
  async function submit() {
    errEl.textContent = '';
    if (nameIn) { const ne = groupNameError(nameIn.value); if (ne) { errEl.textContent = ne; return; } }
    go.disabled = true;
    const label = go.textContent; go.textContent = 'One moment…';
    try { await o.onDone([...picked.values()], nameIn ? nameIn.value.trim() : ''); sheet.close(); }
    catch (e) { errEl.textContent = e && e.shown ? e.shown : errText(e); go.textContent = label; drawChips(); }
  }
  let t = 0;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(find, 150); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = list.querySelector('.cx-pp-row:not(:disabled)'); if (f) f.click(); } });
  go.addEventListener('click', submit);
  drawChips();
  find();
  if (finePointer()) search.focus(); else sheet.focus();
  return sheet;
}

export function confirmLeave(dm, title, onLeave) {
  const sheet = openSheet({ title: 'Leave ' + title + '?' });
  sheet.el.classList.add('cx-sheet');
  const b = h('button', { type: 'button', class: 'fp-btn cx-danger-btn' }, 'Leave group');
  sheet.body.append(h('p', { class: 'fp-note', text: 'You won’t see new messages unless someone adds you back.' }),
    h('div', { class: 'cx-sheet-actions' }, h('button', { type: 'button', class: 'fp-mini', onclick: () => sheet.close() }, 'Cancel'), b));
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await onLeave(); sheet.close(); toast('You left ' + title); } catch (e) { b.disabled = false; toast(errText(e), 'err'); }
  });
  b.focus();
}
