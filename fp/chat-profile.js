// Chat profiles on hub pages (the account chip, the player page): loads the chat client, data layer, view helpers and
// their styles only when chat is set up, and reads profiles with plain requests (no Realtime socket).
import { h } from './ui.js';
import { CHAT } from './chat/config.js';

export const chatConfigured = () => !!(CHAT && CHAT.url && CHAT.key);

/** The profile in `rows` whose username is `username` (any case), or null. Pure: tested. */
export function pickProfile(rows, username) {
  const want = String(username || '').toLowerCase();
  if (!want) return null;
  return (Array.isArray(rows) ? rows : []).find((r) => r && typeof r.username === 'string' && r.username.toLowerCase() === want) || null;
}

function css(href) {
  const url = new URL(href, import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === url)) return Promise.resolve();
  return new Promise((res) => {
    const l = h('link', { rel: 'stylesheet', href: url });
    l.addEventListener('load', res); l.addEventListener('error', res);
    document.head.append(l);
  });
}
let kit = null;
/** { client, data, common, flair } with chat.css + flair.css on the page. Rejects when chat is off. */
export function chatKit() {
  if (!chatConfigured()) return Promise.reject(new Error('chat is off'));
  if (!kit) {
    kit = Promise.all([import('./chat/client.js'), import('./chat/data.js'), import('./chat/views/common.js'), import('./chat/flair.js'), css('../chat.css'), css('./chat/flair.css')])
      .then(([client, data, common, flair]) => ({ client, data, common, flair }));
    kit.catch(() => { kit = null; });
  }
  return kit;
}

/** Resolves once chat is ready (true) or clearly not coming (false: off, guest, asleep, error, or `ms` passed). */
export function chatReady(client, ms = 20000) {
  const s = client.chatState();
  if (s === 'ready') return Promise.resolve(true);
  if (s === 'off' || s === 'guest') return Promise.resolve(false);
  return new Promise((res) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(t); off(); res(v); };
    const off = client.onChatState((st) => { if (st === 'ready') finish(true); else if (st !== 'waking') finish(false); });
    const t = setTimeout(() => finish(false), ms);
    client.ensureChatSession().catch(() => {});
  });
}
