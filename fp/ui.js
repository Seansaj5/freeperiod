// Tiny UI toolkit: element helper, dialog sheets, toasts. Never uses innerHTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let sheetN = 0;

// Opens a modal dialog sheet. Returns { el, body, close }. Esc / backdrop / Close button dismiss it.
export function openSheet({ title, onClose } = {}) {
  const opener = document.activeElement;
  const titleId = 'fp-sheet-title-' + (++sheetN);
  const body = h('div', { class: 'fp-sheet-body' });
  const closeBtn = h('button', { type: 'button', class: 'fp-x', 'aria-label': 'Close' }, '×');
  const panel = h('div', { class: 'fp-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
    h('div', { class: 'fp-sheet-head' }, h('h2', { id: titleId, text: title || '' }), closeBtn), body);
  const back = h('div', { class: 'fp-backdrop' }, panel);
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    document.body.classList.toggle('fp-locked', !!document.querySelector('.fp-backdrop'));
    if (opener && opener.focus && document.contains(opener)) opener.focus();
    if (onClose) onClose();
  }
  function onKey(e) {
    if (back !== [...document.querySelectorAll('.fp-backdrop')].pop()) return; // only the top sheet reacts
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter(n => !n.closest('[hidden]'));
    if (!items.length) { e.preventDefault(); panel.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  closeBtn.addEventListener('click', close);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  document.body.classList.add('fp-locked');
  panel.focus();
  return { el: panel, body, close, focus() { const f = panel.querySelector('input,select,textarea,button:not(.fp-x)'); (f || panel).focus(); } };
}

let toastBox = null;
export function toast(text, kind = 'ok') {
  if (!toastBox) {
    toastBox = h('div', { class: 'fp-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastBox);
  }
  const t = h('div', { class: 'fp-toast ' + kind, text });
  toastBox.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
}

export function fmtTime(secs) {
  secs = Math.max(0, Math.floor(Number(secs) || 0));
  const hrs = Math.floor(secs / 3600), min = Math.floor((secs % 3600) / 60);
  return hrs ? `${hrs}h ${min}m` : min ? `${min}m` : secs ? '<1m' : '0m';
}
export function errText(e) {
  return e && e.waking ? 'Could not reach the server. It may be waking up; try again in a moment.' : (e && e.message) || 'Something went wrong';
}
