// Member list: online first (from presence), owner crown, mod shield, custom status.
import { h } from '../../ui.js';
import { icon, avatar, nameEl, nameOf, roleMark, roleOf } from './common.js';

const rank = (p) => ({ owner: 0, mod: 1 }[roleOf(p)] ?? 2);
const byName = (a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' });

export function mountMembers(el, { onBack, onPick } = {}) {
  el.classList.add('cx-members');
  const count = h('span', { class: 'cx-mem-count' });
  const head = h('header', { class: 'cx-mem-head' },
    h('button', { type: 'button', class: 'cx-iconbtn cx-back', 'aria-label': 'Back to the chat', onclick: () => onBack && onBack() }, icon('back')),
    h('h2', { text: 'Members' }), count);
  const list = h('div', { class: 'cx-mem-list', role: 'list' });
  el.replaceChildren(head, list);

  function rowFor(p, on) {
    const status = p.status_text ? (p.status_emoji ? p.status_emoji + ' ' : '') + p.status_text : '';
    return h('div', { role: 'listitem', class: 'cx-mem' + (on ? '' : ' off') },
      h('button', { type: 'button', class: 'cx-mem-btn', onclick: () => onPick && onPick(p), 'aria-label': nameOf(p) + (on ? ', online' : ', offline') },
        avatar(p, { size: 34, status: on ? 'online' : 'offline' }),
        h('span', { class: 'cx-mem-text' },
          h('span', { class: 'cx-mem-name' }, nameEl(p), roleMark(p)),
          status ? h('span', { class: 'cx-mem-status', text: status }) : null)));
  }

  return {
    render({ members = [], online = new Set(), loading = false } = {}) {
      if (loading) {
        count.textContent = '';
        list.replaceChildren(h('div', { class: 'cx-mem-sec', text: 'Members' }),
          ...[62, 48, 70, 55, 40].map((w) => h('div', { class: 'cx-mem sk', 'aria-hidden': 'true' }, h('span', { class: 'cx-av sk', style: '--av:34px' }), h('i', { class: 'cx-bar', style: `width:${w}%` }))));
        return;
      }
      const on = members.filter((p) => online.has(p.id)).sort(byName);
      const off = members.filter((p) => !online.has(p.id)).sort(byName);
      count.textContent = String(members.length);
      const kids = [];
      if (on.length) kids.push(h('div', { class: 'cx-mem-sec' }, h('i', { class: 'cx-live-dot', 'aria-hidden': 'true' }), 'Online — ' + on.length), ...on.map((p) => rowFor(p, true)));
      if (off.length) kids.push(h('div', { class: 'cx-mem-sec', text: 'Offline — ' + off.length }), ...off.map((p) => rowFor(p, false)));
      if (!kids.length) kids.push(h('p', { class: 'cx-mem-none', text: 'Nobody here yet.' }));
      list.replaceChildren(...kids);
    },
  };
}
