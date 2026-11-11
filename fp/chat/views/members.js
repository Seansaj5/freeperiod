// Member list in Discord's sections (sidebarlogic.js memberSections: Owner, Mods, Bots, then Online and Offline, from
// presence), owner crown, mod shield, custom status, flair names and frames (still until hovered). Click opens the profile
// card; right-click (staff) opens the member menu. A DM lists its people flat.
import { h } from '../../ui.js';
import { memberSections } from '../sidebarlogic.js';
import { icon, avatar, nameEl, nameOf, roleMark, roleOf, hotOnHover } from './common.js';

const rank = (p) => ({ owner: 0, mod: 1 }[roleOf(p)] ?? 2);
const byName = (a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' });

export function mountMembers(el, { onBack, onPick, onMenu, showBan = () => false } = {}) {
  el.classList.add('cx-members');
  const count = h('span', { class: 'cx-mem-count' });
  const title = h('h2', { text: 'Members' });
  const head = h('header', { class: 'cx-mem-head' },
    h('button', { type: 'button', class: 'cx-iconbtn cx-back', 'aria-label': 'Back to the chat', onclick: () => onBack && onBack() }, icon('back')),
    title, count);
  const list = h('div', { class: 'cx-mem-list', role: 'list' });
  const foot = h('div', { class: 'cx-mem-foot', hidden: true });
  el.replaceChildren(head, list, foot);

  function rowFor(p, on) {
    const status = p.status_text ? (p.status_emoji ? p.status_emoji + ' ' : '') + p.status_text : '';
    const btn = h('button', { type: 'button', class: 'cx-mem-btn', dataset: { uid: p.id }, 'aria-label': nameOf(p) + (on ? ', online' : ', offline') },
      avatar(p, { size: 34, status: on ? 'online' : 'offline', frame: 'hover' }),
      h('span', { class: 'cx-mem-text' },
        h('span', { class: 'cx-mem-name' }, nameEl(p), roleMark(p), p.banned && showBan(p) ? h('span', { class: 'cx-mem-flag bad', text: 'Banned' }) : null),
        status ? h('span', { class: 'cx-mem-status', text: status }) : null));
    btn.addEventListener('click', () => onPick && onPick(p, btn));
    btn.addEventListener('contextmenu', (e) => { if (onMenu && onMenu(p, btn)) e.preventDefault(); });
    return hotOnHover(h('div', { role: 'listitem', class: 'cx-mem' + (on ? '' : ' off') }, btn));
  }

  return {
    // flat: one list (a DM's people) instead of Online / Offline sections. footer: buttons under the list.
    render({ members = [], online = new Set(), loading = false, title: t = 'Members', flat = false, footer = null } = {}) {
      title.textContent = t;
      foot.hidden = !footer;
      foot.replaceChildren(...(footer || []));
      if (loading) {
        count.textContent = '';
        list.replaceChildren(h('div', { class: 'cx-mem-sec', text: 'Members' }),
          ...[62, 48, 70, 55, 40].map((w) => h('div', { class: 'cx-mem sk', 'aria-hidden': 'true' }, h('span', { class: 'cx-av sk', style: '--av:34px' }), h('i', { class: 'cx-bar', style: `width:${w}%` }))));
        return;
      }
      count.textContent = String(members.length);
      const kids = [];
      if (flat) kids.push(...members.slice().sort(byName).map((p) => rowFor(p, online.has(p.id))));
      else {
        // sections go by the role the badges show (a revoked or banned mod is not under Mods; a Bing Ball admin is)
        const byId = new Map(members.map((p) => [p.id, p]));
        const secs = memberSections(members.map((p) => ({ id: p.id, is_bot: p.is_bot, name: nameOf(p), username: p.username, role: roleOf(p) || 'member' })), online);
        for (const s of secs) {
          kids.push(h('div', { class: 'cx-mem-sec', dataset: { sec: s.key } }, s.key === 'online' ? h('i', { class: 'cx-live-dot', 'aria-hidden': 'true' }) : null, s.title + ' — ' + s.people.length),
            ...s.people.map((x) => rowFor(byId.get(x.id), s.key !== 'offline')));
        }
      }
      if (!kids.length) kids.push(h('p', { class: 'cx-mem-none', text: 'Nobody here yet.' }));
      list.replaceChildren(...kids);
    },
  };
}
