// Friends page (the Friends button on the rail): Online, All, Pending (asked you / you asked) and Add friend by username.
// Rows are friendship rows from listFriends(). Friendships are never live (the table isn't in realtime), so the app refetches
// when this page opens, on focus and every so often; every action here refetches too.
import { h, toast } from '../../ui.js';
import { icon, avatar, nameEl, nameOf, hotOnHover } from './common.js';

const TABS = [['online', 'Online'], ['all', 'All'], ['pending', 'Pending'], ['add', 'Add friend']];

/**
 * cx: { rows() -> friendship rows, online() -> Set, live(profile), request(username) -> Promise<'pending'|'accepted'>, respond(id, accept),
 *       remove(id), message(profile) -> Promise, openCard(profile, anchor), refresh() -> Promise }
 * @returns {{ el, draw(), setTab(tab) }}
 */
export function mountFriends(cx) {
  const el = h('section', { class: 'cx-friends', 'aria-label': 'Friends' });
  let tab = 'online';
  let note = '';          // result line under the add box
  let noteBad = false;
  let busy = false;
  const tabsEl = h('div', { class: 'cx-fr-tabs', role: 'tablist', 'aria-label': 'Friends sections' });
  const body = h('div', { class: 'cx-fr-body' });
  el.append(tabsEl, body);

  const all = () => cx.rows().map((r) => ({ ...r, profile: cx.live(r.profile) }));
  const friends = () => all().filter((r) => r.status === 'accepted');
  const incoming = () => all().filter((r) => r.status === 'pending' && r.incoming);
  const outgoing = () => all().filter((r) => r.status === 'pending' && !r.incoming);
  const byName = (a, b) => nameOf(a.profile).localeCompare(nameOf(b.profile), undefined, { sensitivity: 'base' });

  async function run(fn, ok) {
    if (busy) return;
    busy = true;
    try { await fn(); if (ok) toast(ok); } catch (e) { toast((e && e.shown) || 'Something went wrong', 'err'); }
    finally { busy = false; try { await cx.refresh(); } catch { /* next time */ } }
  }

  function row(r, kind) {
    const p = r.profile;
    const on = cx.online().has(p.id);
    const status = p.status_text ? (p.status_emoji ? p.status_emoji + ' ' : '') + p.status_text : '';
    const sub = kind === 'in' ? 'Wants to be friends' : kind === 'out' ? 'Request sent' : on ? (status || 'Online') : (status || 'Offline');
    const who = h('button', { type: 'button', class: 'cx-fr-who', 'aria-label': 'Open ' + nameOf(p) + '’s profile' },
      avatar(p, { size: 40, status: kind === 'friend' ? (on ? 'online' : 'offline') : null, frame: 'hover' }),
      h('span', { class: 'cx-fr-text' }, h('span', { class: 'cx-fr-name' }, nameEl(p)), h('small', { text: '@' + (p.username || '') + ' · ' + sub })));
    who.addEventListener('click', () => cx.openCard(p, who));
    const acts = h('div', { class: 'cx-fr-acts' });
    if (kind === 'in') {
      acts.append(
        h('button', { type: 'button', class: 'cx-btn cx-fr-accept', onclick: () => run(() => cx.respond(p.id, true), 'You and ' + nameOf(p) + ' are friends') }, icon('check'), 'Accept'),
        h('button', { type: 'button', class: 'cx-btn ghost cx-fr-decline', onclick: () => run(() => cx.respond(p.id, false)) }, 'Decline'));
    } else if (kind === 'out') {
      acts.append(h('button', { type: 'button', class: 'cx-btn ghost cx-fr-cancel', onclick: () => run(() => cx.remove(p.id), 'Request cancelled') }, 'Cancel request'));
    } else {
      const rm = h('button', { type: 'button', class: 'cx-iconbtn cx-fr-remove', title: 'Remove friend', 'aria-label': 'Remove ' + nameOf(p) + ' as a friend' }, icon('x'));
      let armed = 0;
      rm.addEventListener('click', () => {
        if (!armed) { rm.classList.add('armed'); rm.title = 'Tap again to remove'; armed = setTimeout(() => { armed = 0; rm.classList.remove('armed'); rm.title = 'Remove friend'; }, 3500); return; }
        clearTimeout(armed); armed = 0;
        run(() => cx.remove(p.id), nameOf(p) + ' was removed');
      });
      acts.append(h('button', { type: 'button', class: 'cx-btn ghost cx-fr-msg', onclick: () => run(() => cx.message(p)) }, icon('chat'), 'Message'), rm);
    }
    return hotOnHover(h('div', { class: 'cx-fr-row ' + kind + (on && kind === 'friend' ? '' : ' off'), role: 'listitem', dataset: { uid: p.id, kind } }, who, acts));
  }
  const section = (title, rows, kind) => rows.length ? [h('div', { class: 'cx-fr-sec', text: title + ' — ' + rows.length }), h('div', { class: 'cx-fr-list', role: 'list' }, ...rows.map((r) => row(r, kind)))] : [];
  const empty = (ic, strong, text) => h('div', { class: 'cx-fr-empty' }, h('span', { class: 'cx-empty-ic big', 'aria-hidden': 'true' }, icon(ic)), h('strong', { text: strong }), h('span', { text }));

  function drawAdd() {
    const input = h('input', { class: 'cx-field cx-fr-input', placeholder: 'Enter a username', 'aria-label': 'Username to add', maxlength: '32', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
    const send = h('button', { type: 'button', class: 'cx-btn cx-fr-send' }, icon('userPlus'), 'Send request');
    const line = h('p', { class: 'cx-fr-note' + (noteBad ? ' bad' : ''), role: 'status', text: note });
    const go = async () => {
      const name = input.value.trim().replace(/^@/, '').toLowerCase();
      if (!name || busy) return;
      busy = true; send.disabled = true; note = ''; line.textContent = '';
      try {
        const res = await cx.request(name);
        noteBad = false;
        note = res === 'accepted' ? 'You and @' + name + ' are friends now.' : 'Request sent to @' + name + '.';
        input.value = '';
      } catch (e) { noteBad = true; note = (e && e.shown) || 'Couldn’t send that'; }
      busy = false;
      try { await cx.refresh(); } catch { /* next time */ }
      if (tab === 'add') drawBody();
    };
    send.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const out = outgoing();
    return [h('div', { class: 'cx-fr-add' }, h('h3', { text: 'Add a friend' }), h('p', { class: 'cx-hint', text: 'Type their Free Period username. They can accept or decline.' }),
      h('div', { class: 'cx-fr-addrow' }, input, send), line), ...section('Sent', out, 'out')];
  }

  function drawBody() {
    const on = friends().filter((r) => cx.online().has(r.profile.id)).sort(byName);
    const every = friends().sort(byName);
    const inn = incoming().sort(byName), out = outgoing().sort(byName);
    let kids;
    if (tab === 'online') kids = on.length ? section('Online', on, 'friend') : [empty('users', every.length ? 'Nobody’s online right now' : 'No friends yet', every.length ? 'Check the All tab, or come back in a bit.' : 'Add a friend by username with the Add friend tab.')];
    else if (tab === 'all') kids = every.length ? section('All friends', every, 'friend') : [empty('users', 'No friends yet', 'Add a friend by username with the Add friend tab.')];
    else if (tab === 'pending') kids = inn.length || out.length ? [...section('Asked you', inn, 'in'), ...section('You asked', out, 'out')] : [empty('clock', 'Nothing pending', 'Requests you send or get show up here.')];
    else kids = drawAdd();
    body.replaceChildren(...kids);
  }
  function draw() {
    const inN = incoming().length;
    tabsEl.replaceChildren(...TABS.map(([k, label]) => h('button', { type: 'button', role: 'tab', class: 'cx-fr-tab' + (tab === k ? ' on' : '') + (k === 'add' ? ' add' : ''), 'aria-selected': tab === k ? 'true' : 'false', dataset: { tab: k },
      onclick: () => { tab = k; note = ''; draw(); } }, label, k === 'pending' && inN ? h('span', { class: 'cx-fr-badge', text: String(inN) }) : null)));
    if (document.activeElement && body.contains(document.activeElement) && tab === 'add') return; // don't steal the typing box
    drawBody();
  }
  return { el, draw, setTab(t) { tab = t; note = ''; draw(); } };
}
