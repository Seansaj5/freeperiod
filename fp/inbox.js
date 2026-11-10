// Owner-only suggestion inbox.
import { call } from './api.js';
import { h, openSheet, toast, errText } from './ui.js';

export const LABELS = { 'fp-site': 'Free Period', 'fp-bingball': 'Bing Ball', 'fp-closecall': 'Close Call', 'fp-horrorexe': 'horror.exe', 'fp-newgame': 'New game idea' };
const isSite = (s) => typeof s.category === 'string' && s.category.startsWith('fp-');

export async function openInbox() {
  const sheet = openSheet({ title: 'Inbox' });
  let items = [], filter = 'site';
  const chips = h('div', { class: 'fp-chips' });
  const status = h('p', { class: 'fp-note', role: 'status' }, 'Loading...');
  const err = h('p', { class: 'fp-err', role: 'alert' });
  const list = h('ul', { class: 'fp-inbox' });
  sheet.body.append(chips, err, status, list);
  sheet.focus();

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
