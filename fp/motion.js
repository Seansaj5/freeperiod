// Motion: scroll reveal, the home banner's pointer parallax, and the poster that morphs into the play page's header
// (cross-document View Transitions; the CSS side is themes.css "Motion").
// - Reveal: [data-reveal] elements get .revealed once they scroll into view (IntersectionObserver). Nothing is hidden
//   until this runs: <html class="reveal-ready"> arms the CSS, and only after everything already on screen has been
//   marked .revealed (so it never blinks out). Elements that scroll in (or are added later) also get .reveal-in, which
//   plays the rise, and --i (their place among siblings revealed together) for the stagger. Reduced motion, or no
//   IntersectionObserver: everything is shown at once and nothing is ever hidden.
// - Parallax: --px / --py on one element, -1..1 from its middle, eased toward the mouse and back to 0 when it leaves.
//   Mouse only (fine pointers); never with reduced motion. The CSS decides which layers move and how far.
// - Morph: the clicked card's poster gets view-transition-name: fp-poster right before the page changes; play.html's
//   header poster has the same name, so the browser flies one into the other. Browsers without View Transitions skip it.

const mq = (q) => { try { return typeof matchMedia === 'function' ? matchMedia(q) : null; } catch { return null; } };
const matches = (q) => { const m = mq(q); return !!(m && m.matches); };
export const prefersReduced = () => matches('(prefers-reduced-motion: reduce)');
const finePointer = () => matches('(hover: hover) and (pointer: fine)');
const SEL = '[data-reveal]';
const STAGGER_MAX = 12;

function onScreen(el) {
  try {
    const r = el.getBoundingClientRect();
    const vh = globalThis.innerHeight || 0, vw = globalThis.innerWidth || 0;
    return (r.width > 0 || r.height > 0) && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  } catch { return false; }
}

/** Reveal [data-reveal] under root as it scrolls into view. Returns stop(): stop watching and show everything. */
export function startReveal(root = globalThis.document) {
  if (!root || typeof root.querySelectorAll !== 'function') return () => {};
  const doc = root.ownerDocument || root;
  const html = doc && doc.documentElement;
  const all = () => { try { return [...root.querySelectorAll(SEL)]; } catch { return []; } };
  const showAll = () => { for (const el of all()) el.classList.add('revealed'); };
  if (prefersReduced() || typeof IntersectionObserver !== 'function') { showAll(); return () => {}; }

  let io;
  try {
    io = new IntersectionObserver((entries) => {
      const perParent = new Map();
      for (const en of entries) {
        const el = en.target;
        if (!en.isIntersecting) continue;
        io.unobserve(el);
        if (el.classList.contains('revealed')) continue;
        const n = perParent.get(el.parentNode) || 0;
        perParent.set(el.parentNode, n + 1);
        el.style.setProperty('--i', String(Math.min(n, STAGGER_MAX)));
        el.classList.add('revealed', 'reveal-in');
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
  } catch { showAll(); return () => {}; }

  const watch = (el) => { if (!el.classList.contains('revealed')) io.observe(el); };
  // already on screen when this arms: shown as they are (they may have been painted already)
  for (const el of all()) { if (el.classList.contains('revealed')) continue; if (onScreen(el)) el.classList.add('revealed'); else watch(el); }
  if (html) html.classList.add('reveal-ready');

  // added later (cards after a filter, leaderboard rows after a fetch): watched like the rest; removed ones let go
  let mo = null;
  if (typeof MutationObserver === 'function' && html) {
    const each = (n, fn) => {
      if (!n || n.nodeType !== 1) return;
      if (n.matches && n.matches(SEL)) fn(n);
      if (n.querySelectorAll) n.querySelectorAll(SEL).forEach(fn);
    };
    try {
      mo = new MutationObserver((recs) => {
        for (const r of recs) r.removedNodes.forEach((n) => each(n, (el) => io.unobserve(el)));
        for (const r of recs) r.addedNodes.forEach((n) => each(n, (el) => { if (el.isConnected !== false) watch(el); }));
      });
      mo.observe(root === doc ? html : root, { childList: true, subtree: true });
    } catch { mo = null; }
  }
  return function stop() {
    try { io.disconnect(); } catch { /* gone */ }
    if (mo) mo.disconnect();
    showAll();
    if (html) html.classList.remove('reveal-ready');
  };
}

const clamp = (v) => (v > 1 ? 1 : v < -1 ? -1 : v);
const round = (v) => Math.round(v * 1000) / 1000;

/** --px / --py on el (-1..1 from its middle), eased toward the mouse. Returns stop(). */
export function startParallax(el, { ease = 0.14 } = {}) {
  if (!el || prefersReduced() || !finePointer()) return () => {};
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const raF = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
  const write = () => { el.style.setProperty('--px', String(round(x) || 0)); el.style.setProperty('--py', String(round(y) || 0)); };
  const step = () => {
    raf = 0;
    x += (tx - x) * ease; y += (ty - y) * ease;
    if (Math.abs(tx - x) < 0.002) x = tx;
    if (Math.abs(ty - y) < 0.002) y = ty;
    write();
    if (x !== tx || y !== ty) raf = raF(step);
  };
  const kick = () => { if (!raf) raf = raF(step); };
  const move = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (prefersReduced() || !finePointer()) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    tx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
    ty = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2));
    kick();
  };
  const leave = () => { tx = 0; ty = 0; kick(); };
  el.addEventListener('pointermove', move, { passive: true });
  el.addEventListener('pointerleave', leave);
  return function stop() {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
    if (raf) { try { (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout)(raf); } catch { /* fine */ } }
    raf = 0;
    el.style.removeProperty('--px');
    el.style.removeProperty('--py');
  };
}

// ---------- the poster morph (cross-document View Transitions) ----------
const MORPH = 'fp-poster';
const canMorph = () => { try { return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('view-transition-name', MORPH); } catch { return false; } };

/** Clears the poster name from every element that has it (it must be unique on the page). */
export function clearMorph(doc = globalThis.document) {
  if (!doc) return;
  try {
    for (const el of doc.querySelectorAll('[data-vt-poster]')) { el.style.removeProperty('view-transition-name'); delete el.dataset.vtPoster; }
  } catch { /* nothing to clear */ }
}
/** Names img the one poster that flies into the next page's header (call it right before the page changes). */
export function markMorph(img, doc = globalThis.document) {
  if (!img || !canMorph()) return;
  clearMorph(doc);
  img.style.setProperty('view-transition-name', MORPH);
  img.dataset.vtPoster = '1';
}

/** Home page: a click on a link to a game names that card's poster; the name comes off again once this page is back
 *  (Back from the game: the header poster flies home into the same card first). */
export function wireMorph(root = globalThis.document) {
  if (!root || !canMorph()) return;
  root.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || !/^play\.html\?/.test(a.getAttribute('href') || '')) return;
    const box = a.closest('.card, .tile, .hero');
    const img = box && box.querySelector('img.poster, .tile-thumb img, img.hero-art');
    if (img && !img.classList.contains('broken')) markMorph(img);
  });
  const done = () => clearMorph();
  addEventListener('pagereveal', (e) => { const vt = e.viewTransition; if (vt && vt.finished) vt.finished.then(done, done); else done(); });
  addEventListener('pageshow', (e) => { if (e.persisted && !('onpagereveal' in globalThis)) done(); });
}
