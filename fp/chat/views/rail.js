// Left rail: Direct messages, the Free Period server, and (on the full page) a way back to the games.
import { h } from '../../ui.js';
import { icon, bellLogo } from './common.js';

export function mountRail(el, { onServer, onDMs, homeLink = true } = {}) {
  const make = (key, label, art, onclick) => {
    const badge = h('span', { class: 'cx-rail-badge', hidden: true });
    const b = h('button', { type: 'button', class: 'cx-rail-btn ' + key, 'aria-label': label, title: label, onclick },
      h('span', { class: 'cx-rail-pip', 'aria-hidden': 'true' }), art, badge);
    b._badge = badge;
    return b;
  };
  const dms = make('dms', 'Direct messages', icon('chat'), () => onDMs && onDMs());
  const server = make('server', 'Free Period server', bellLogo('cx-rail-bell'), () => onServer && onServer());
  el.classList.add('cx-rail');
  el.setAttribute('aria-label', 'Chats');
  el.replaceChildren(...[dms, h('span', { class: 'cx-rail-sep', 'aria-hidden': 'true' }), server,
    homeLink ? h('a', { class: 'cx-rail-btn home', href: './', title: 'Back to the games', 'aria-label': 'Back to the games' },
      h('span', { class: 'cx-rail-pip', 'aria-hidden': 'true' }), icon('games')) : null].filter(Boolean));

  function setBadge(b, { dot = false, text = '' } = {}) {
    b.classList.toggle('unread', !!dot);
    b._badge.hidden = !text;
    b._badge.textContent = text;
    b.setAttribute('aria-label', b.title + (text ? ', ' + text + ' mentions' : dot ? ', unread' : ''));
  }
  return {
    setActive(which) {
      dms.classList.toggle('on', which === 'dms');
      server.classList.toggle('on', which === 'server');
      dms.setAttribute('aria-current', which === 'dms' ? 'page' : 'false');
      server.setAttribute('aria-current', which === 'server' ? 'page' : 'false');
    },
    setBadges({ server: s, dms: d } = {}) { if (s) setBadge(server, s); if (d) setBadge(dms, d); },
  };
}
