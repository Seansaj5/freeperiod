// Owner-only inbox: site suggestions, and (once chat is set up) chat reports.
import { call } from './api.js';
import { h, openSheet, toast, errText } from './ui.js';

export const LABELS = { 'fp-site': 'Free Period', 'fp-bingball': 'Bing Ball', 'fp-closecall': 'Close Call', 'fp-horrorexe': 'horror.exe', 'fp-newgame': 'New game idea' };
const isSite = (s) => typeof s.category === 'string' && s.category.startsWith('fp-');

export async function openInbox({ tab = 'suggestions' } = {}) {
  const sheet = openSheet({ title: 'Inbox' });
  sheet.el.classList.add('fp-inbox-sheet');
  const tabs = h('div', { class: 'fp-tabs', role: 'tablist' });
  const suggestPane = h('div', { class: 'fp-inbox-pane' });
  const reportsPane = h('div', { class: 'fp-inbox-pane', hidden: true });
  sheet.body.append(tabs, suggestPane, reportsPane);
  drawSuggestions(suggestPane);

  // Reports need chat; with no chat config the tab is not offered and nothing chat-related loads.
  let chatOn = false;
  try { const { CHAT } = await import('./chat/config.js'); chatOn = !!(CHAT && CHAT.url && CHAT.key); } catch { chatOn = false; }
  let reportsLoaded = false;
  function setTab(k) {
    tab = chatOn ? k : 'suggestions';
    tabs.hidden = !chatOn;
    tabs.replaceChildren(...[['suggestions', 'Suggestions'], ['reports', 'Reports']].map(([key, label]) =>
      h('button', { type: 'button', role: 'tab', class: 'fp-tab' + (tab === key ? ' on' : ''), 'aria-selected': tab === key ? 'true' : 'false', dataset: { tab: key }, onclick: () => setTab(key) }, label)));
    suggestPane.hidden = tab !== 'suggestions';
    reportsPane.hidden = tab !== 'reports';
    if (tab === 'reports' && !reportsLoaded) { reportsLoaded = true; loadReports(); }
  }
  async function loadReports() {
    reportsPane.replaceChildren(h('p', { class: 'fp-note', role: 'status', text: 'Loading reports…' }));
    try {
      const [client, mod] = await Promise.all([import('./chat/client.js'), import('./chat/views/mod.js'), ensureChatCss()]);
      await client.ensureChatSession();
      if (client.chatState() !== 'ready') { reportsPane.replaceChildren(h('p', { class: 'fp-err', text: client.chatError() || 'Chat isn’t available right now. Try again in a bit.' })); return; }
      const me = client.me();
      const data = await import('./chat/data.js');
      const profile = me ? await data.getProfile(me.id).catch(() => null) : null;
      await mod.renderReports(reportsPane, {
        me: profile,
        onOpen: ({ channel, message }) => {
          if (document.body.classList.contains('chat-page')) {
            sheet.close();
            window.dispatchEvent(new CustomEvent('fp:chat-open', { detail: { channel, message } }));
          } else location.href = 'chat.html?c=' + encodeURIComponent(channel) + '&m=' + encodeURIComponent(message);
        },
      });
    } catch (ex) { reportsPane.replaceChildren(h('p', { class: 'fp-err', text: errText(ex) })); }
  }
  setTab(tab);
  sheet.focus();
}

// chat.css styles the report cards (pictures, names); the home page only has it once chat is on.
function ensureChatCss() {
  const href = new URL('../chat.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return Promise.resolve();
  return new Promise((res) => { const l = h('link', { rel: 'stylesheet', href }); l.addEventListener('load', res); l.addEventListener('error', res); document.head.append(l); });
}

async function drawSuggestions(pane) {
  let items = [], filter = 'site';
  const chips = h('div', { class: 'fp-chips' });
  const status = h('p', { class: 'fp-note', role: 'status' }, 'Loading...');
  const err = h('p', { class: 'fp-err', role: 'alert' });
  const list = h('ul', { class: 'fp-inbox' });
  pane.append(chips, err, status, list);

  function draw() {
    chips.replaceChildren(...[['site', 'Site'], ['all', 'All']].map(([k, label]) =>
      h('button', { type: 'button', class: 'fp-pick' + (filter === k ? ' on' : ''), 'aria-pressed': filter === k ? 'true' : 'false',
        onclick: () => { filter = k; draw(); } }, label)));
    const shown = items.filter(s => filter === 'all' || isSite(s));
    status.textContent = shown.length ? '' : 'Nothing here.';
    list.replaceChildren(...shown.map(row));
  }
  async function act(s, action) {
    err.textContent = '';
    try {
      await call('/api/suggestion', { body: { id: s.id, action }, auth: true });
      if (action === 'delete') items = items.filter(x => x.id !== s.id);
      else s.done = action === 'done' ? Date.now() : 0;
      draw();
    } catch (ex) { err.textContent = errText(ex); toast(errText(ex), 'err'); }
  }
  function row(s) {
    const when = s.at ? new Date(s.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return h('li', { class: 'fp-item' + (s.done ? ' done' : '') },
      h('div', { class: 'fp-item-meta' },
        h('span', { class: 'fp-tag', text: LABELS[s.category] || s.category || 'other' }),
        h('span', { text: (s.from || 'guest') + (s.role && s.role !== 'player' ? ` (${s.role})` : '') }),
        h('time', { text: when })),
      h('p', { class: 'fp-item-text', text: s.text || '' }),
      h('div', { class: 'fp-item-actions' },
        h('button', { type: 'button', class: 'fp-mini', onclick: () => act(s, s.done ? 'undone' : 'done') }, s.done ? 'Undo' : 'Done'),
        h('button', { type: 'button', class: 'fp-mini danger', onclick: () => act(s, 'delete') }, 'Delete')));
  }

  try {
    const d = await call('/api/suggestions?limit=200', { auth: true });
    items = Array.isArray(d.suggestions) ? d.suggestions : [];
    items.sort((a, b) => (b.at || 0) - (a.at || 0));
    draw();
  } catch (ex) {
    status.textContent = '';
    err.textContent = errText(ex);
    draw();
    status.textContent = '';
  }
}
