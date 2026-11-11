// Sidebar: server header (the owner's channel manager), the channel list grouped in collapsible categories
// (sidebarlogic.js groupSidebar: text rows with the unread pip, mention badge and owner-only lock; voice rows with the
// people in them) or the DM list (built by dms.js), the "Voice Connected" bar (voicebar.js) and the bottom panel (my
// profile card, mic and headphones toggles, the profile editor).
import { h } from '../../ui.js';
import { badge } from '../unread.js';
import { groupSidebar, voiceLabel } from '../sidebarlogic.js';
import { icon, avatar, nameEl, nameOf, roleMark, hotOnHover } from './common.js';
import { mountVoiceBar } from './voicebar.js';

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

export function mountChannels(el, { onPick, onManage, onTools, onMe, onSettings, onToggleCat, onAddChannel, onVoice, onVoiceUser, onVoiceMenu, onMic, onDeaf, onVoiceLeave } = {}) {
  el.classList.add('cx-side');
  const head = h('header', { class: 'cx-srv' });
  const list = h('nav', { class: 'cx-chlist', 'aria-label': 'Channels' });
  const barEl = h('div');
  const bar = mountVoiceBar(barEl, { onLeave: () => onVoiceLeave && onVoiceLeave() });
  const foot = h('footer', { class: 'cx-me' });
  el.replaceChildren(head, list, barEl, foot);
  let myId = '';

  function row(c, { current, unread, guest }) {
    const key = 'c:' + c.id;
    const u = unread.get(key) || {};
    const b = badge(u);
    const on = current === c.id;
    const btn = h('button', { type: 'button', class: 'cx-ch' + (on ? ' on' : '') + (b.dot && !on ? ' unread' : ''), 'aria-current': on ? 'page' : 'false',
      dataset: { ch: String(c.id), fk: 'ch:' + c.id }, title: c.topic || c.name, onclick: () => onPick && onPick(c) },
      h('span', { class: 'cx-ch-pip', 'aria-hidden': 'true' }),
      h('span', { class: 'cx-ch-emoji', 'aria-hidden': 'true', text: c.emoji || '#' }),
      h('span', { class: 'cx-ch-name', text: c.name }),
      c.owner_only && !guest ? h('span', { class: 'cx-ch-lock', title: 'Only Sean and mods post here' }, icon('lock')) : null,
      b.text && !on ? h('span', { class: 'cx-ch-badge', 'aria-label': b.text + ' mentions', text: b.text }) : null);
    if (b.dot && !on) btn.setAttribute('aria-label', c.name + (b.text ? ', ' + b.text + ' mentions' : ', unread'));
    return btn;
  }

  // Speaking is only known for the channel I'm connected to: me from my own mic, the others from their audio.
  function speakingOf(vs, chId, uid) {
    if (!vs || vs.status !== 'connected' || vs.channelId !== chId) return false;
    if (uid === myId) return !!vs.meSpeaking;
    const p = vs.peers && vs.peers.get(uid);
    return !!(p && p.speaking);
  }
  function voiceRows(c, { roster, vs, people }) {
    const users = roster.get(c.id) || [];
    const label = voiceLabel(c.name);
    const mine = !!vs && vs.status !== 'idle' && vs.channelId === c.id;
    const btn = h('button', { type: 'button', class: 'cx-ch voice' + (mine ? ' joined' : ''), dataset: { ch: String(c.id), fk: 'ch:' + c.id },
      title: c.topic || label,
      'aria-label': label + ', voice channel' + (users.length ? ', ' + plural(users.length, 'person', 'people') + ' in it' : '') + (mine ? ', you’re in it' : ''),
      onclick: () => onVoice && onVoice(c) },
      h('span', { class: 'cx-ch-pip', 'aria-hidden': 'true' }),
      h('span', { class: 'cx-ch-emoji', 'aria-hidden': 'true' }, icon('speaker')),
      h('span', { class: 'cx-ch-name', text: label }));
    if (!users.length) return [btn];
    const box = h('div', { class: 'cx-vc-users', role: 'list', 'aria-label': 'In ' + label, dataset: { vch: String(c.id) } });
    for (const u of users) {
      const p = people(u.id) || { id: u.id, username: 'someone' };
      const peer = mine && u.id !== myId && vs.peers ? vs.peers.get(u.id) : null;
      const away = !!(peer && peer.state === 'unreachable');
      const b = h('button', { type: 'button', class: 'cx-vc-btn', dataset: { fk: 'vu:' + c.id + ':' + u.id },
        'aria-label': nameOf(p) + (u.mute ? ', muted' : '') + (u.deaf ? ', deafened' : '') + (away ? ', can’t reach them' : '') },
        avatar(p, { size: 24 }),
        h('span', { class: 'cx-vc-name' }, nameEl(p), roleMark(p)),
        away ? h('span', { class: 'cx-vc-note', text: 'Can’t reach' }) : null,
        u.mute ? h('span', { class: 'cx-vc-ic', title: 'Muted' }, icon('micOff')) : null,
        u.deaf ? h('span', { class: 'cx-vc-ic', title: 'Deafened' }, icon('headphonesOff')) : null);
      b.addEventListener('click', () => onVoiceUser && onVoiceUser(p, b));
      b.addEventListener('contextmenu', (e) => { if (onVoiceMenu && onVoiceMenu(p, b)) e.preventDefault(); });
      box.append(h('div', { role: 'listitem', class: 'cx-vc-user' + (speakingOf(vs, c.id, u.id) ? ' speaking' : '') + (away ? ' unreachable' : ''), dataset: { user: u.id } }, b));
    }
    return [btn, box];
  }
  function catHead(g, canManage) {
    const c = g.category;
    const open = !g.collapsed;
    return h('div', { class: 'cx-cat-head' + (open ? '' : ' collapsed') },
      h('button', { type: 'button', class: 'cx-cat', dataset: { cat: String(c.id), fk: 'cat:' + c.id }, 'aria-expanded': open ? 'true' : 'false',
        title: open ? 'Collapse' : 'Expand', onclick: () => onToggleCat && onToggleCat(c.id) },
        h('span', { class: 'cx-cat-chev', 'aria-hidden': 'true' }, icon('chev')), h('span', { class: 'cx-cat-name', text: c.name })),
      canManage ? h('button', { type: 'button', class: 'cx-iconbtn sm cx-cat-add', dataset: { cat: String(c.id), fk: 'add:' + c.id },
        'aria-label': 'Create a channel in ' + c.name, title: 'Create channel', onclick: () => onAddChannel && onAddChannel(c.id) }, icon('plus')) : null);
  }

  // A redraw replaces the buttons: keep the keyboard on the same one (a category header, a channel, the mic toggle).
  function focusKey() { const a = document.activeElement; return a && el.contains(a) && a.dataset ? a.dataset.fk || null : null; }
  function refocus(fk) {
    if (!fk) return;
    const n = [...el.querySelectorAll('[data-fk]')].find((x) => x.dataset.fk === fk);
    if (n && document.activeElement !== n) n.focus({ preventScroll: true });
  }

  return {
    render({ mode = 'server', channels = [], categories = [], collapsed = new Set(), current = null, unread = new Map(), guest = false, loading = false, status = 'ready',
      online = 0, members = 0, me = null, meStatus = 'online', canManage = false, canTools = false, dmNodes = null,
      roster = new Map(), voice: vs = null, people = () => null, myId: uid = '' } = {}) {
      const fk = focusKey();
      myId = uid;
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
          list.replaceChildren(h('div', { class: 'cx-cat-label', text: 'Channels' }),
            ...[70, 54, 62, 80, 66, 58].map((w) => h('div', { class: 'cx-ch sk', 'aria-hidden': 'true' }, h('span', { class: 'cx-ch-emoji' }), h('i', { class: 'cx-bar', style: `width:${w}%` }))));
        } else {
          // Guests never see voice channels (and only the owner-only channels app.js keeps for them).
          const shown = guest ? channels.filter((c) => c.kind !== 'voice') : channels;
          const groups = groupSidebar({ channels: shown, categories, collapsed, current, roster, unread, guest, showEmpty: canManage && !guest });
          const ctx = { roster, vs, people };
          const kids = [];
          for (const g of groups) {
            if (g.category) kids.push(catHead(g, canManage && !guest));
            for (const c of g.channels) kids.push(...(c.kind === 'voice' ? voiceRows(c, ctx) : [row(c, { current, unread, guest })]));
          }
          if (guest) kids.push(h('div', { class: 'cx-guest-more' }, h('span', { text: 'General, the game channels and DMs open up when you log in.' })));
          list.replaceChildren(...kids);
        }
      }
      bar.render(guest ? null : vs, vs && vs.channelId != null ? channels.find((c) => c.id === vs.channelId) || null : null);
      if (guest || !me) {
        foot.replaceChildren();
        foot.hidden = true;
      } else {
        foot.hidden = false;
        const meBtn = h('button', { type: 'button', class: 'cx-me-btn', 'aria-label': 'Your profile', title: 'Your profile', onclick: () => onMe && onMe(meBtn) },
          avatar(me, { size: 36, status: meStatus, frame: 'hover' }),
          h('div', { class: 'cx-me-text' }, h('div', { class: 'cx-me-name' }, nameEl(me), roleMark(me)),
            h('div', { class: 'cx-me-sub', text: me.status_text ? ((me.status_emoji ? me.status_emoji + ' ' : '') + me.status_text) : '@' + (me.username || '') })));
        // Mic and headphones work before joining too (like Discord). Deafened = my mic is off as well.
        const deaf = !!(vs && vs.deaf), micOff = deaf || !!(vs && vs.mute);
        foot.replaceChildren(hotOnHover(meBtn),
          h('button', { type: 'button', class: 'cx-iconbtn cx-me-mic' + (micOff ? ' off' : ''), dataset: { fk: 'mic' }, 'aria-label': 'Mute', 'aria-pressed': micOff ? 'true' : 'false',
            title: micOff ? 'Unmute' : 'Mute', onclick: () => onMic && onMic() }, icon(micOff ? 'micOff' : 'mic')),
          h('button', { type: 'button', class: 'cx-iconbtn cx-me-deaf' + (deaf ? ' off' : ''), dataset: { fk: 'deaf' }, 'aria-label': 'Deafen', 'aria-pressed': deaf ? 'true' : 'false',
            title: deaf ? 'Undeafen' : 'Deafen', onclick: () => onDeaf && onDeaf() }, icon(deaf ? 'headphonesOff' : 'headphones')),
          h('button', { type: 'button', class: 'cx-iconbtn cx-me-gear', dataset: { fk: 'gear' }, title: 'Edit profile', 'aria-label': 'Edit profile', onclick: () => onSettings && onSettings() }, icon('gear')));
      }
      refocus(fk);
    },
    // Only the green rings changed (voice ticks): no redraw, just the classes.
    paintSpeaking(vs) {
      for (const box of list.querySelectorAll('.cx-vc-users')) {
        const ch = Number(box.dataset.vch);
        for (const r of box.querySelectorAll('.cx-vc-user')) r.classList.toggle('speaking', speakingOf(vs, ch, r.dataset.user));
      }
    },
  };
}
