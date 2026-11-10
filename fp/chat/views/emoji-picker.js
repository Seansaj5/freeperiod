// Emoji picker popover (bottom sheet on phones): search, categories, recents. Built-in list only, no network.
import { h } from '../../ui.js';
import { EMOJI_CATEGORIES } from '../emoji-data.js';
import { icon, finePointer } from './common.js';

const RECENT_KEY = 'fp.chat.recentEmoji';
function recent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 24) : []; } catch { return []; }
}
function remember(e) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recent().filter((x) => x !== e)].slice(0, 24))); } catch { /* storage blocked */ }
}
let nameOf = null;
function lookup(e) {
  if (!nameOf) { nameOf = new Map(); for (const c of EMOJI_CATEGORIES) for (const it of c.items) if (!nameOf.has(it.e)) nameOf.set(it.e, it.n); }
  return nameOf.get(e) || '';
}

let open = null; // { el, anchor, close }

export function closeEmojiPicker() { if (open) open.close(); }

export function openEmojiPicker(anchor, { onPick, label = 'Pick an emoji' } = {}) {
  if (open && open.anchor === anchor) { open.close(); return null; }
  if (open) open.close();
  const sheet = typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches;
  const search = h('input', { type: 'search', class: 'cx-pk-search', placeholder: 'Find an emoji', 'aria-label': 'Find an emoji', autocomplete: 'off', spellcheck: 'false' });
  const tabs = h('div', { class: 'cx-pk-tabs', role: 'tablist', 'aria-label': 'Emoji categories' });
  const body = h('div', { class: 'cx-pk-body' });
  const prevE = h('span', { class: 'cx-pk-prev-e', text: '😀' });
  const prevN = h('span', { class: 'cx-pk-prev-n', text: 'Pick an emoji' });
  const el = h('div', { class: 'cx-picker' + (sheet ? ' sheet' : ''), role: 'dialog', 'aria-label': label },
    h('div', { class: 'cx-pk-head' }, h('label', { class: 'cx-pk-find' }, icon('search'), search),
      sheet ? h('button', { type: 'button', class: 'cx-iconbtn', 'aria-label': 'Close', onclick: () => close() }, icon('x')) : null),
    tabs, body, h('div', { class: 'cx-pk-foot' }, prevE, prevN));
  const scrim = sheet ? h('div', { class: 'cx-pk-scrim', onclick: () => close() }) : null;

  const sections = [];
  function btn(e, n) {
    return h('button', { type: 'button', class: 'cx-pk-e', title: ':' + n.split(' ')[0] + ':', 'aria-label': n.split(' ')[0], text: e,
      onmouseenter: () => { prevE.textContent = e; prevN.textContent = ':' + n.split(' ')[0] + ':'; },
      onfocus: () => { prevE.textContent = e; prevN.textContent = ':' + n.split(' ')[0] + ':'; },
      onclick: () => { remember(e); if (onPick) onPick(e); close(); } });
  }
  function section(id, title, items) {
    const sec = h('section', { class: 'cx-pk-sec', dataset: { cat: id } }, h('h4', { text: title }),
      h('div', { class: 'cx-pk-grid' }, items.map((it) => btn(it.e, it.n))));
    sections.push(sec);
    return sec;
  }
  function drawAll() {
    sections.length = 0;
    const rec = recent().map((e) => ({ e, n: lookup(e) || 'emoji' }));
    const kids = [];
    if (rec.length) kids.push(section('recent', 'Recently used', rec));
    for (const c of EMOJI_CATEGORIES) kids.push(section(c.id, c.label, c.items));
    body.replaceChildren(...kids);
    tabs.replaceChildren(...[rec.length ? { id: 'recent', icon: '🕘', label: 'Recently used' } : null, ...EMOJI_CATEGORIES].filter(Boolean).map((c) =>
      h('button', { type: 'button', role: 'tab', class: 'cx-pk-tab', 'aria-label': c.label, title: c.label, text: c.icon, dataset: { cat: c.id },
        onclick: () => { const s = sections.find((x) => x.dataset.cat === c.id); if (s) body.scrollTop = s.offsetTop - body.offsetTop - 4; } })));
    markTab();
  }
  function markTab() {
    let cur = sections[0];
    for (const s of sections) if (s.offsetTop - body.offsetTop - 12 <= body.scrollTop) cur = s;
    for (const t of tabs.children) t.classList.toggle('on', !!cur && t.dataset.cat === cur.dataset.cat);
  }
  body.addEventListener('scroll', markTab, { passive: true });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase().replace(/^:|:$/g, '');
    if (!q) { tabs.hidden = false; drawAll(); return; }
    const words = q.split(/\s+/);
    const seen = new Set(), hits = [];
    for (const c of EMOJI_CATEGORIES) for (const it of c.items) {
      if (seen.has(it.e)) continue;
      const n = it.n.toLowerCase();
      if (words.every((w) => n.split(' ').some((x) => x.startsWith(w)) || n.includes(w))) { seen.add(it.e); hits.push(it); }
    }
    tabs.hidden = true;
    sections.length = 0;
    body.replaceChildren(hits.length ? section('results', hits.length + ' found', hits) : h('p', { class: 'cx-pk-none', text: 'No emoji match "' + search.value.trim() + '"' }));
    body.scrollTop = 0;
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const first = body.querySelector('.cx-pk-e'); if (first) first.click(); }
  });

  function place() {
    if (sheet) return;
    const r = anchor.getBoundingClientRect();
    const W = Math.min(352, innerWidth - 16), H = Math.min(420, innerHeight - 24);
    el.style.width = W + 'px'; el.style.height = H + 'px';
    let top = r.top - H - 8;
    if (top < 8) top = Math.min(innerHeight - H - 8, r.bottom + 8);
    const left = Math.max(8, Math.min(innerWidth - W - 8, r.right - W));
    el.style.top = Math.max(8, top) + 'px'; el.style.left = left + 'px';
  }
  function onDown(e) {
    const path = e.composedPath();
    if (path.includes(el) || path.includes(anchor)) return;
    close();
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); } }
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    el.remove(); if (scrim) scrim.remove();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    if (!sheet) removeEventListener('resize', close);
    anchor.setAttribute('aria-expanded', 'false');
    if (open && open.el === el) open = null;
  }
  drawAll();
  if (scrim) document.body.append(scrim);
  document.body.append(el);
  place();
  markTab();
  anchor.setAttribute('aria-expanded', 'true');
  setTimeout(() => {
    if (closed) return;
    document.addEventListener('pointerdown', onDown, true);
    if (!sheet) addEventListener('resize', close); // a phone keyboard opening resizes the page: the sheet stays
  }, 0);
  document.addEventListener('keydown', onKey, true);
  if (finePointer()) search.focus();
  open = { el, anchor, close };
  return open;
}
