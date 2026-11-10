// Small pop-up for a new DM or @mention while the chat panel is closed. Text only (textContent), never innerHTML.
// At most one pop-up every 3 s: a call inside that window is dropped (returns false). Click opens the conversation.
import { h } from '../ui.js';

export const TOAST_GAP = 3000;
const SHOW_MS = 6000;
let box = null;
let last = -Infinity;
let current = null;

export function chatToast({ title = '', body = '', onClick } = {}) {
  const now = Date.now();
  if (now - last < TOAST_GAP) return false;
  last = now;
  const home = () => { const f = document.fullscreenElement || document.webkitFullscreenElement; return f && f !== document.documentElement ? f : document.body; };
  if (!box || !box.isConnected) {
    box = h('div', { class: 'fpco-toasts', role: 'status', 'aria-live': 'polite' });
    document.addEventListener('fullscreenchange', () => { if (box) home().append(box); });
    document.addEventListener('webkitfullscreenchange', () => { if (box) home().append(box); });
  }
  if (box.parentNode !== home()) home().append(box);
  if (current) current.dismiss();
  const short = String(body).replace(/\s+/g, ' ').trim();
  const el = h('button', { type: 'button', class: 'fpco-toast' },
    h('strong', { text: String(title).slice(0, 60) }),
    h('span', { text: short.length > 110 ? short.slice(0, 109) + '…' : short }));
  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 220);
    if (current && current.el === el) current = null;
  };
  el.addEventListener('click', () => { dismiss(); if (typeof onClick === 'function') { try { onClick(); } catch { /* ignore */ } } });
  box.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  timer = setTimeout(dismiss, SHOW_MS);
  current = { el, dismiss };
  return true;
}
