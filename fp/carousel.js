// The home banner's carousel: stacked slides that crossfade, dots with a filling bar, arrows, and auto-advance.
// The active dot's fill is a CSS animation and its `animationend` moves to the next slide, so pausing is one class:
// hover, keyboard focus inside, the tab hidden, the banner scrolled out of view. Reduced motion: no fill, no auto-advance
// (the arrows and dots still work and switch at once).
import { h } from './ui.js';
import { icon } from './icons.js';

export const ROTATE_MS = 8000;
/** i moved by step, wrapped into 0..n-1. */
export const wrapIndex = (i, step, n) => (n > 0 ? (((i + step) % n) + n) % n : 0);

/**
 * root: the section to fill. slides: [{ el, label }] (el = the slide's element, label = its name for the dots).
 * opts.onShow(i): called when slide i becomes visible (lazy pictures). Returns { go(i), next(), prev(), index, stop() }.
 */
export function mountCarousel(root, slides, { interval = ROTATE_MS, onShow, label = 'Featured games' } = {}) {
  const n = slides.length;
  const stage = h('div', { class: 'car-stage', 'aria-live': 'off' });
  const dots = h('div', { class: 'car-dots', role: 'group', 'aria-label': 'Choose a game' });
  const prevB = h('button', { type: 'button', class: 'car-arrow', 'aria-label': 'Previous game' }, icon('chevL'));
  const nextB = h('button', { type: 'button', class: 'car-arrow', 'aria-label': 'Next game' }, icon('chevR'));
  const ctrl = h('div', { class: 'car-ctrl' }, prevB, dots, nextB);
  const car = h('div', { class: 'car', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': label, style: `--car-ms:${interval}ms` }, stage, n > 1 ? ctrl : null);
  slides.forEach((s, i) => {
    s.el.classList.add('car-slide');
    s.el.setAttribute('role', 'group');
    s.el.setAttribute('aria-roledescription', 'slide');
    s.el.setAttribute('aria-label', `${i + 1} of ${n}: ${s.label}`);
    stage.append(s.el);
  });
  const dotEls = slides.map((s, i) => h('button', { type: 'button', class: 'car-dot', 'aria-label': 'Show ' + s.label, onclick: () => { go(i, true); } }, h('i')));
  dots.append(...dotEls);
  root.replaceChildren(car);

  let index = -1, stopped = false;
  const why = new Set();      // reasons to hold still: hover, focus, hidden, away
  function hold(reason, on) {
    if (on) why.add(reason); else why.delete(reason);
    car.classList.toggle('paused', why.size > 0);
    // while someone reads or tabs through it, announce changes; while it rotates by itself, stay quiet
    stage.setAttribute('aria-live', why.has('focus') || why.has('hover') ? 'polite' : 'off');
  }
  function go(i, byHand = false) {
    if (stopped || !n) return;
    i = wrapIndex(i, 0, n);
    const was = index;
    index = i;
    slides.forEach((s, k) => {
      const on = k === i;
      s.el.classList.toggle('is-on', on);
      s.el.classList.toggle('was-on', k === was && k !== i);
      s.el.toggleAttribute('inert', !on);
      if (on) s.el.removeAttribute('aria-hidden'); else s.el.setAttribute('aria-hidden', 'true');
    });
    dotEls.forEach((d, k) => {
      const on = k === i;
      if (on) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      d.classList.remove('is-on');
    });
    void dots.offsetWidth;      // restart the fill animation
    dotEls[i] && dotEls[i].classList.add('is-on');
    if (onShow) { onShow(i); if (n > 1) onShow(wrapIndex(i, 1, n)); }      // and get the next picture ready
    if (byHand) car.classList.add('touched');
  }
  dots.addEventListener('animationend', (e) => { if (e.target.parentElement === dotEls[index] && !why.size) go(index + 1); });
  prevB.addEventListener('click', () => go(index - 1, true));
  nextB.addEventListener('click', () => go(index + 1, true));
  car.addEventListener('keydown', (e) => {
    if (!e.target.closest('.car-ctrl')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + (e.key === 'ArrowRight' ? 1 : -1), true);
      const t = e.target.classList.contains('car-dot') ? dotEls[index] : e.target;
      if (t) t.focus();
    }
  });
  car.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hold('hover', true); });
  car.addEventListener('pointerleave', () => hold('hover', false));
  car.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) hold('focus', true); });
  car.addEventListener('focusout', (e) => { if (!car.contains(e.relatedTarget)) hold('focus', false); });
  const onVis = () => hold('hidden', document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', onVis);
  onVis();
  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((list) => { for (const en of list) hold('away', !en.isIntersecting); }, { threshold: 0.25 });
    io.observe(car);
  }
  go(0);
  return {
    go: (i) => go(i, true), next: () => go(index + 1, true), prev: () => go(index - 1, true),
    get index() { return index; },
    stop() { stopped = true; document.removeEventListener('visibilitychange', onVis); if (io) io.disconnect(); },
  };
}
