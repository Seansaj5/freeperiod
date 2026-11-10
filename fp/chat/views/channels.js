// Sidebar: server header (the owner's channel manager), channel list (emoji, name, unread dot, mention badge, owner-only
// lock) or the DM list (built by dms.js), and the "me" card (opens my profile card; the gear opens the editor).
import { h } from '../../ui.js';
import { badge } from '../unread.js';
import { icon, avatar, nameEl, roleMark, hotOnHover } from './common.js';

export function mountChannels(el, { onPick, onManage, onTools, onMe, onSettings } = {}) {
  el.classList.add('cx-side');
  const head = h('header', { class: 'cx-srv' });
  const list = h('nav', { class: 'cx-chlist', 'aria-label': 'Channels' });
  const foot = h('footer', { class: 'cx-me' });
  el.replaceChildren(head, list, foot);

  function row(c, { current, unread, guest }) {
    const key = 'c:' + c.id;
    const u = unread.get(key) || {};
    const b = badge(u);
    const on = current === c.id;
    const btn = h('button', { type: 'button', class: 'cx-ch' + (on ? ' on' : '') + (b.dot && !on ? ' unread' : ''), 'aria-current': on ? 'page' : 'false',
      title: c.topic || c.name, onclick: () => onPick && onPick(c) },
      h('span', { class: 'cx-ch-pip', 'aria-hidden': 'true' }),
      h('span', { class: 'cx-ch-emoji', 'aria-hidden': 'true', text: c.emoji || '#' }),
      h('span', { class: 'cx-ch-name', text: c.name }),
      c.owner_only && !guest ? h('span', { class: 'cx-ch-lock', title: 'Only Sean and mods post here' }, icon('lock')) : null,
      b.text && !on ? h('span', { class: 'cx-ch-badge', 'aria-label': b.text + ' mentions', text: b.text }) : null);
    if (b.dot && !on) btn.setAttribute('aria-label', c.name + (b.text ? ', ' + b.text + ' mentions' : ', unread'));
    return btn;
  }

  return {
    render({ mode = 'server', channels = [], current = null, unread = new Map(), guest = false, loading = false, status = 'ready', online = 0, members = 0, me = null, meStatus = 'online',
      canManage = false, canTools = false, dmNodes = null } = {}) {
      if (mode === 'dms' || mode === 'friends') {
        head.replaceChildren(h('div', { class: 'cx-srv-in' }, h('h2', { class: 'cx-srv-name', text: 'Direct messages' }),
          h('p', { class: 'cx-srv-sub', text: 'Private chats and groups' })));
        head.className = 'cx-srv dms';
        if (dmNodes && !guest) list.replaceChildren(...dmNodes);
        else list.replaceChildren(h('div', { class: 'cx-empty-side' },
          h('span', { class: 'cx-empty-ic', 'aria-hidden': 'true' }, icon('chat')),
          h('strong', { text: 'No DMs yet' }),
          h('span', { text: guest ? 'Log in to message people.' : 'Click someone’s name to message them.' })));
      } else {
        head.className = 'cx-srv';
        head.replaceChildren(...[h('div', { class: 'cx-srv-in' },
          h('h2', { class: 'cx-srv-name' }, 'FREE ', h('b', { text: 'PERIOD' })),
          h('p', { class: 'cx-srv-sub' },
            guest ? 'Reading as a guest' : status !== 'ready' ? h('span', { class: 'cx-srv-wait', text: status === 'waking' ? 'Connecting…' : status === 'asleep' ? 'Napping' : 'Offline' })
              : h('span', { class: 'cx-srv-on' }, h('i', { 'aria-hidden': 'true' }), online + ' online'),
            !guest && members ? h('span', { class: 'cx-srv-all', text: members + ' members' }) : null)),
          canTools ? h('button', { type: 'button', class: 'cx-iconbtn cx-srv-tools', title: 'Server tools', 'aria-label': 'Server tools', 'aria-haspopup': 'menu', onclick: (e) => onTools && onTools(e.currentTarget) }, icon('sparkle')) : null,
          canManage ? h('button', { type: 'button', class: 'cx-iconbtn cx-srv-gear', title: 'Manage channels', 'aria-label': 'Manage channels', onclick: () => onManage && onManage() }, icon('gear')) : null].filter(Boolean));
        if (loading) {
          list.replaceChildren(h('div', { class: 'cx-cat', text: 'Channels' }),
            ...[70, 54, 62, 80, 66, 58].map((w) => h('div', { class: 'cx-ch sk', 'aria-hidden': 'true' }, h('span', { class: 'cx-ch-emoji' }), h('i', { class: 'cx-bar', style: `width:${w}%` }))));
        } else {
          const kids = [h('div', { class: 'cx-cat', text: guest ? 'Open to everyone' : 'Channels' })];
          for (const c of channels) kids.push(row(c, { current, unread, guest }));
          if (guest) kids.push(h('div', { class: 'cx-guest-more' }, h('span', { text: 'General, the game channels and DMs open up when you log in.' })));
          list.replaceChildren(...kids);
        }
      }
      if (guest || !me) {
        foot.replaceChildren();
        foot.hidden = true;
      } else {
        foot.hidden = false;
        const meBtn = h('button', { type: 'button', class: 'cx-me-btn', 'aria-label': 'Your profile', title: 'Your profile', onclick: () => onMe && onMe(meBtn) },
          avatar(me, { size: 36, status: meStatus, frame: 'hover' }),
          h('div', { class: 'cx-me-text' }, h('div', { class: 'cx-me-name' }, nameEl(me), roleMark(me)),
            h('div', { class: 'cx-me-sub', text: me.status_text ? ((me.status_emoji ? me.status_emoji + ' ' : '') + me.status_text) : '@' + (me.username || '') })));
        foot.replaceChildren(hotOnHover(meBtn),
          h('button', { type: 'button', class: 'cx-iconbtn cx-me-gear', title: 'Edit profile', 'aria-label': 'Edit profile', onclick: () => onSettings && onSettings() }, icon('gear')));
      }
    },
  };
}
