// Shared bits for the chat views: icons, avatars, names, times, safe media URLs. DOM calls only, never innerHTML.
import { h } from '../../ui.js';
import { CHAT } from '../config.js';
import { mediaUrl } from '../data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  hash: ['M5 9h14', 'M4 15h14', 'M10 3 8 21', 'M16 3l-2 18'],
  lock: ['M8 11V8a4 4 0 0 1 8 0v3', 'M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z'],
  crown: { fill: true, d: ['M3.2 8.2a.6.6 0 0 1 .95-.6L8 10.6l3.5-5.9a.6.6 0 0 1 1 0l3.5 5.9 3.85-3a.6.6 0 0 1 .95.6l-1.7 9.4a1 1 0 0 1-1 .8H5.9a1 1 0 0 1-1-.8z'] },
  shield: { fill: true, d: ['M12 2.6 19.6 5.5v5.7c0 4.9-3.2 8.8-7.6 10.2-4.4-1.4-7.6-5.3-7.6-10.2V5.5z'] },
  pin: ['M9.5 3.5h5l-.8 5.2 3.3 3.1V14H7v-2.2l3.3-3.1z', 'M12 14v6.5'],
  reply: ['M9.5 6.5 4.5 11.5l5 5', 'M4.5 11.5h9a6 6 0 0 1 6 6v1'],
  react: ['M20.4 11.2A8.5 8.5 0 1 1 12.8 3.6', 'M8.6 14.2a4.4 4.4 0 0 0 6.8 0', 'M9 9.6h.01', 'M15 9.6h.01', 'M19 2.5v5.5', 'M16.25 5.25h5.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  send: ['M5 12 3.5 4.6a.8.8 0 0 1 1.1-.9l15.6 7.6a.8.8 0 0 1 0 1.4L4.6 20.3a.8.8 0 0 1-1.1-.9z', 'M5 12h6.5'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  back: ['M15 5l-7 7 7 7'],
  users: ['M15.5 20v-1.4a3.6 3.6 0 0 0-3.6-3.6H7.1a3.6 3.6 0 0 0-3.6 3.6V20', 'M13 7.9a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z', 'M20.5 20v-1.4a3.6 3.6 0 0 0-2.7-3.5', 'M15.2 4.5a3.5 3.5 0 0 1 0 6.8'],
  chat: ['M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.6A7.5 7.5 0 1 1 20 11.5z'],
  image: ['M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z', 'M3.5 16l5-5 4.5 4.5 2.5-2.5 5 5', 'M15.5 9.2h.01'],
  retry: ['M4.5 12a7.5 7.5 0 0 1 12.9-5.2L19.5 9', 'M19.5 4.5V9H15', 'M19.5 12a7.5 7.5 0 0 1-12.9 5.2L4.5 15', 'M4.5 19.5V15H9'],
  moon: ['M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z'],
  edit: ['M4.5 19.5h4l10.2-10.2a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4.5 15.5z', 'M13.5 6.5l4 4'],
  trash: ['M4.5 7h15', 'M10 11v6', 'M14 11v6', 'M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7', 'M9.5 7V4.5h5V7'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  search: ['M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z', 'M20 20l-4.2-4.2'],
  login: ['M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14', 'M9.5 16.5 14 12 9.5 7.5', 'M14 12H4'],
  alert: ['M12 8.5v4.5', 'M12 16.6h.01', 'M10.3 4.1 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z'],
  games: ['M7 8.5h10a4.5 4.5 0 0 1 4.4 5.4l-.6 3a2.5 2.5 0 0 1-4.3 1.2L14.2 16H9.8l-2.3 2.1a2.5 2.5 0 0 1-4.3-1.2l-.6-3A4.5 4.5 0 0 1 7 8.5z', 'M8 11v3', 'M6.5 12.5h3', 'M15.5 11.5h.01', 'M17.5 13.5h.01'],
  sparkle: ['M12 3.5l1.9 5.1a2 2 0 0 0 1.5 1.5l5.1 1.9-5.1 1.9a2 2 0 0 0-1.5 1.5L12 20.5l-1.9-5.1a2 2 0 0 0-1.5-1.5L3.5 12l5.1-1.9a2 2 0 0 0 1.5-1.5z'],
  clip: ['M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.2 8.1a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5'],
  dots: { fill: true, d: ['M6 10.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z', 'M12 10.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z', 'M18 10.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z'] },
  open: ['M14 4.5h5.5V10', 'M19.5 4.5 11 13', 'M17 14v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7h4'],
  left: ['M14.5 5.5 8 12l6.5 6.5'],
  right: ['M9.5 5.5 16 12l-6.5 6.5'],
};

export function icon(name, cls) {
  const def = Array.isArray(ICONS[name]) ? { d: ICONS[name] } : ICONS[name];
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'cx-ic' + (cls ? ' ' + cls : ''));
  if (def.fill) s.setAttribute('fill', 'currentColor');
  else {
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
  }
  for (const d of def.d) { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
}

// The Free Period bell, the server's icon.
export function bellLogo(cls) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 64 64');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', cls || '');
  const g = document.createElementNS(SVG_NS, 'g');
  for (const [k, v] of [['fill', 'none'], ['stroke', '#c6ff3d'], ['stroke-width', '5'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) g.setAttribute(k, v);
  for (const d of ['M18 42h28l-3.5-5V27a10.5 10.5 0 0 0-21 0v10z', 'M28 48a4.5 4.5 0 0 0 8 0', 'M32 12v4']) {
    const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); g.append(p);
  }
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '47'); c.setAttribute('cy', '17'); c.setAttribute('r', '6'); c.setAttribute('fill', '#3de0ff');
  s.append(g, c);
  return s;
}

// ---------- people ----------
export const nameOf = (p) => (p && (p.display_name || p.name || p.username)) || 'Someone';
export function nameColor(p) {
  const c = p && p.name_color;
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '';
}
export function roleOf(p) {
  if (!p) return '';
  if (p.role === 'owner') return 'owner';
  if (p.role === 'mod' || p.is_mod) return 'mod';
  return '';
}
export function roleMark(p) {
  const r = roleOf(p);
  if (!r) return null;
  return h('span', { class: 'cx-role ' + r, title: r === 'owner' ? 'Owner' : 'Mod', role: 'img', 'aria-label': r === 'owner' ? 'Owner' : 'Mod' },
    icon(r === 'owner' ? 'crown' : 'shield'));
}

// Avatar colors when there is no picture: lime / cyan / amber / green families, never pink or purple.
const SWATCH = [
  ['#c6ff3d', '#3de0ff'], ['#3de0ff', '#2f7dff'], ['#ffb020', '#ff6b3d'], ['#62ff8f', '#17b3a3'],
  ['#ffd84a', '#ff9a2e'], ['#3dffc8', '#2f8bff'], ['#a6ff5c', '#26c46a'], ['#ff8a5c', '#ffc23d'],
];
function hashOf(s) { let x = 2166136261; for (const ch of String(s || '')) { x ^= ch.codePointAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
function initials(p) {
  const n = nameOf(p).replace(/[^\p{L}\p{N} ]/gu, '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : n.slice(0, 2)).toUpperCase();
}

export function avatar(p, { size = 40, status = null, cls = '' } = {}) {
  const [a, b] = SWATCH[hashOf(p && (p.id || p.username)) % SWATCH.length];
  const el = h('span', { class: 'cx-av' + (cls ? ' ' + cls : ''), style: `--av:${size}px;--av-a:${a};--av-b:${b}`, 'aria-hidden': 'true' },
    h('span', { class: 'cx-av-txt', text: initials(p) }));
  if (p && p.avatar_path) {
    mediaSrc({ bucket: 'public-media', path: p.avatar_path }).then((src) => {
      if (!src) return;
      const img = h('img', { alt: '', src, decoding: 'async', loading: 'lazy' });
      img.addEventListener('load', () => el.classList.add('has-img'));
      img.addEventListener('error', () => img.remove());
      el.append(img);
    });
  }
  if (status) el.append(h('span', { class: 'cx-av-dot ' + status }));
  return el;
}

// Name in the person's name color (or the default), plus the owner crown / mod shield.
export function nameEl(p, tag = 'span', cls = 'cx-name') {
  const el = h(tag, { class: cls, text: nameOf(p) });
  const c = nameColor(p);
  if (c) el.style.color = c;
  return el;
}

// ---------- time ----------
const DAY = 864e5;
export const asDate = (t) => (t instanceof Date ? t : new Date(t));
export function timeShort(t) { return asDate(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
export function fullStamp(t) { return asDate(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
export function dayKey(t) { const d = asDate(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
export function dayLabel(t) {
  const d = asDate(t), now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return 'Today';
  if (d.getTime() >= start - DAY) return 'Yesterday';
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString([], opts);
}

// ---------- media: only our Supabase storage URLs ever reach an <img> ----------
export function storageOrigin() {
  try { return CHAT && CHAT.url ? new URL(CHAT.url).origin : ''; } catch { return ''; }
}
export function isStorageUrl(u) {
  const origin = storageOrigin();
  if (!origin || typeof u !== 'string') return false;
  try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') && x.origin === origin && x.pathname.startsWith('/storage/v1/object/'); } catch { return false; }
}
const srcCache = new Map(); // bucket/path -> Promise<string|null>
export function mediaSrc(att) {
  if (!att || !att.path) return Promise.resolve(null);
  const key = (att.bucket || '') + '/' + att.path;
  if (!srcCache.has(key)) {
    const p = Promise.resolve().then(() => mediaUrl(att)).then((u) => (isStorageUrl(u) ? u : null), () => null);
    srcCache.set(key, p);
    p.then((u) => { if (!u) srcCache.delete(key); });
    if (att.bucket === 'dm-media') setTimeout(() => srcCache.delete(key), 50 * 60e3); // signed links last an hour
  }
  return srcCache.get(key);
}

export const finePointer = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
