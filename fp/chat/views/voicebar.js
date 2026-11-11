// "Voice Connected" bar, above the bottom panel while I'm in (or joining) a voice channel: the status, a signal line built
// from each peer's connection state, the channel name and the disconnect button. signalLabel is DOM-free (unit-tested).
import { h } from '../../ui.js';
import { icon } from './common.js';
import { voiceLabel } from '../sidebarlogic.js';

// peers: voice.state().peers (Map<id, { state }>) or an array of { state }. state: 'connecting' | 'connected' | 'unreachable'.
export function signalLabel(peers) {
  const list = peers instanceof Map ? [...peers.values()] : Array.isArray(peers) ? peers : [];
  const bad = list.filter((p) => p && p.state === 'unreachable').length;
  if (bad) return 'Can’t reach ' + bad + (bad === 1 ? ' person' : ' people');
  if (list.some((p) => p && p.state === 'connecting')) return 'Connecting…';
  return 'Connected';
}

export function mountVoiceBar(el, { onLeave } = {}) {
  el.classList.add('cx-vbar');
  el.hidden = true;
  const status = h('strong', { class: 'cx-vbar-status' });
  const sig = h('span', { class: 'cx-vbar-sig', hidden: true });
  const where = h('span', { class: 'cx-vbar-where' });
  const leave = h('button', { type: 'button', class: 'cx-iconbtn sm cx-vbar-leave', 'aria-label': 'Disconnect from voice', title: 'Disconnect',
    onclick: () => onLeave && onLeave() }, icon('hangup'));
  el.replaceChildren(
    h('div', { class: 'cx-vbar-text' }, h('div', { class: 'cx-vbar-line', 'aria-live': 'polite' }, status, sig), where),
    leave);

  return {
    // state: voice.state(); channel: the voice channel row (for its name), or null.
    render(state, channel) {
      const on = !!state && (state.status === 'connected' || state.status === 'joining');
      el.hidden = !on;
      if (!on) return;
      const joining = state.status === 'joining';
      const label = joining ? 'Connecting…' : signalLabel(state.peers);
      el.dataset.sig = label === 'Connected' ? 'ok' : label === 'Connecting…' ? 'wait' : 'bad';
      status.textContent = joining ? 'Joining voice…' : 'Voice Connected';
      sig.textContent = !joining && label !== 'Connected' ? label : '';
      sig.hidden = !sig.textContent;
      where.textContent = voiceLabel((channel && channel.name) || state.channelName || 'voice') + ' / Free Period';
    },
  };
}
