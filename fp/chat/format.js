// Message formatting: body string -> tokens -> DOM. No innerHTML anywhere; user text only ever reaches textContent/text nodes.

import { CHAT } from './config.js';

const MAX_DEPTH = 6;
const NAME_RE = /^@([A-Za-z0-9_]{1,32})/;
const EMOJI_RE = /^:([a-z0-9_]{2,32}):/;
const URL_RE = /^https?:\/\/[^\s<>]+/i;
const WORD = /[A-Za-z0-9_]/;

export function isSafeHref(s) {
  if (typeof s !== 'string' || !/^https?:\/\//i.test(s) || /[\s\u0000-\u001f]/.test(s)) return false;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

export function mentionsMe(body, me) {
  if (typeof body !== 'string' || !body || !me) return false;
  const esc = String(me).replace(/[^A-Za-z0-9_]/g, '');
  if (!esc) return false;
  return new RegExp('(^|[^A-Za-z0-9_])@(everyone|' + esc + ')(?![A-Za-z0-9_])', 'i').test(body);
}

function pushText(out, v) {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === 'text') last.v += v; else out.push({ t: 'text', v });
}

// Index of the closing `mark` (single char or pair) at or after `from`, or -1. For ** the last two of a run of stars close.
function closer(s, mark, from) {
  let j = s.indexOf(mark, from);
  if (j < 0) return -1;
  if (mark === '**') while (s[j + 2] === '*') j++;
  return j;
}

const lowCache = new WeakMap();
function lowered(set) { // lowercase name -> name as stored; cached per Set
  let m = lowCache.get(set);
  if (!m || m.size !== set.size) { m = new Map(); for (const u of set) m.set(String(u).toLowerCase(), String(u)); lowCache.set(set, m); }
  return m;
}

function parse(s, ctx, depth) {
  const out = [];
  const users = ctx.users instanceof Set ? ctx.users : new Set(ctx.users || []);
  const lowUsers = lowered(users);
  const emoji = ctx.emoji || new Map();
  const me = String(ctx.me || '').toLowerCase();
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '\n') { out.push({ t: 'br' }); i++; continue; }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1 && !s.slice(i + 1, j).includes('\n')) { out.push({ t: 'code', v: s.slice(i + 1, j) }); i = j + 1; continue; }
    } else if (c === '*' && s[i + 1] === '*') {
      const j = closer(s, '**', i + 2);
      if (j > i + 2 && depth < MAX_DEPTH) { out.push({ t: 'b', kids: parse(s.slice(i + 2, j), ctx, depth + 1) }); i = j + 2; continue; }
      pushText(out, '**'); i += 2; continue;
    } else if (c === '*') {
      const j = s.indexOf('*', i + 1);
      const inner = j > i + 1 ? s.slice(i + 1, j) : '';
      if (inner && !/^\s|\s$|\n/.test(inner) && depth < MAX_DEPTH) { out.push({ t: 'i', kids: parse(inner, ctx, depth + 1) }); i = j + 1; continue; }
    } else if (c === '|' && s[i + 1] === '|') {
      const j = s.indexOf('||', i + 2);
      if (j > i + 2 && depth < MAX_DEPTH) { out.push({ t: 'spoiler', kids: parse(s.slice(i + 2, j), ctx, depth + 1) }); i = j + 2; continue; }
      pushText(out, '||'); i += 2; continue;
    } else if ((c === 'h' || c === 'H') && (s[i + 4] === ':' || s[i + 5] === ':') && !(i > 0 && WORD.test(s[i - 1]))) {
      const m = URL_RE.exec(s.slice(i, i + 2100));
      if (m) {
        const v = m[0].replace(/[.,!?;:)\]'"*|]+$/, '');
        if (isSafeHref(v)) { out.push({ t: 'link', href: v, v }); i += v.length; continue; }
      }
    } else if (c === '@' && !(i > 0 && WORD.test(s[i - 1]))) {
      const m = NAME_RE.exec(s.slice(i, i + 34));
      if (m) {
        const low = m[1].toLowerCase();
        if (low === 'everyone') { out.push({ t: 'everyone' }); i += m[0].length; continue; }
        const user = lowUsers.get(low) || null;
        if (user) { out.push({ t: 'mention', user, me: low === me }); i += m[0].length; continue; }
      }
    } else if (c === ':') {
      const m = EMOJI_RE.exec(s.slice(i, i + 34));
      if (m && emoji.has(m[1])) { out.push({ t: 'emoji', name: m[1], src: emoji.get(m[1]) }); i += m[0].length; continue; }
    }
    pushText(out, c);
    i++;
  }
  return out;
}

export function parseMessage(body, ctx = {}) {
  return parse(typeof body === 'string' ? body.slice(0, 5000) : '', ctx || {}, 0);
}

// Emoji images may only come from our Supabase storage origin (public bucket path); opts.storageOrigin overrides it for tests.
function storageOrigin(opts) {
  if (opts && opts.storageOrigin !== undefined) return opts.storageOrigin;
  try { return CHAT && CHAT.url ? new URL(CHAT.url).origin : ''; } catch { return ''; }
}
function isStorageSrc(src, origin) {
  if (!origin || !isSafeHref(src)) return false;
  try { const u = new URL(src); return u.origin === origin && u.pathname.startsWith('/storage/v1/object/public/'); } catch { return false; }
}

export function renderTokens(tokens, doc = globalThis.document, opts = {}) {
  const origin = storageOrigin(opts);
  const frag = doc.createDocumentFragment();
  const wrap = (tag, cls, kids) => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    el.appendChild(renderTokens(kids, doc, opts));
    return el;
  };
  for (const k of tokens || []) {
    if (!k) continue;
    switch (k.t) {
      case 'text': frag.appendChild(doc.createTextNode(String(k.v))); break;
      case 'br': frag.appendChild(doc.createElement('br')); break;
      case 'b': frag.appendChild(wrap('strong', '', k.kids)); break;
      case 'i': frag.appendChild(wrap('em', '', k.kids)); break;
      case 'code': { const el = doc.createElement('code'); el.textContent = String(k.v); frag.appendChild(el); break; }
      case 'spoiler': {
        const el = wrap('span', 'spoiler', k.kids);
        el.addEventListener('click', () => { el.className = 'spoiler revealed'; });
        frag.appendChild(el);
        break;
      }
      case 'link': {
        if (!isSafeHref(k.href)) { frag.appendChild(doc.createTextNode(String(k.v))); break; }
        const a = doc.createElement('a');
        a.setAttribute('href', k.href);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.textContent = String(k.v);
        frag.appendChild(a);
        break;
      }
      case 'mention': { const el = doc.createElement('span'); el.className = k.me ? 'mention me' : 'mention'; el.textContent = '@' + k.user; frag.appendChild(el); break; }
      case 'everyone': { const el = doc.createElement('span'); el.className = 'mention everyone'; el.textContent = '@everyone'; frag.appendChild(el); break; }
      case 'emoji': {
        if (!isStorageSrc(k.src, origin)) { frag.appendChild(doc.createTextNode(':' + k.name + ':')); break; }
        const img = doc.createElement('img');
        img.className = 'emoji';
        img.setAttribute('src', k.src);
        img.setAttribute('alt', ':' + k.name + ':');
        img.setAttribute('title', ':' + k.name + ':');
        img.setAttribute('loading', 'lazy');
        frag.appendChild(img);
        break;
      }
      default: break;
    }
  }
  return frag;
}
