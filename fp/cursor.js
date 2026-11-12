// Cursor trail: one fixed, click-through canvas that draws a few fading particles behind the mouse. neon = lime sparks,
// aero = tiny glossy bubbles rising, space = star dust with a soft twinkle. Only for fine pointers with effects on; never with
// reduced motion or in Minimal. Pauses when the tab is hidden, DPR <= 1.5, at most 60 particles, and requestAnimationFrame
// runs only while particles are alive (idle = no frames). Restarts when theme/effects change.
import { getTheme, getEffects, onPrefs } from './theme.js';

export const MAX_PARTICLES = 60;
export const MAX_DPR = 1.5;
const Z = 45; // above the header (40), under the account menu (58), sheets (60), toasts (70)

const mq = (q) => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch { return false; } };
let dbg = { count: 0 };
export function _debug() { return { ...dbg }; }

function eligible() {
  return getEffects() && getTheme() !== 'minimal' && mq('(hover: hover) and (pointer: fine)') && !mq('(prefers-reduced-motion: reduce)');
}

function colors(theme) {
  return theme === 'aero' ? { h: 195 } : theme === 'space' ? { h: 45 } : { h: 78 };
}

function spawn(theme, x, y, out) {
  const r = Math.random;
  if (theme === 'aero') out.push({ x: x + (r() - 0.5) * 8, y, vx: (r() - 0.5) * 0.25, vy: -(0.35 + r() * 0.5), r: 2 + r() * 3, life: 0, max: 800 + r() * 500, hue: 190 + r() * 20 });
  else if (theme === 'space') out.push({ x: x + (r() - 0.5) * 10, y: y + (r() - 0.5) * 10, vx: (r() - 0.5) * 0.12, vy: (r() - 0.5) * 0.12 + 0.03, r: 0.8 + r() * 1.6, life: 0, max: 700 + r() * 700, hue: 40 + r() * 170, tw: r() * 6.28 });
  else out.push({ x, y, vx: (r() - 0.5) * 1.6, vy: (r() - 0.5) * 1.6 - 0.2, r: 1 + r() * 1.6, life: 0, max: 350 + r() * 300, hue: 72 + r() * 20 });
}

function draw(g, theme, p, a) {
  if (theme === 'aero') {
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832);
    g.fillStyle = `hsla(${p.hue},90%,70%,${(a * 0.18).toFixed(3)})`; g.fill();
    g.strokeStyle = `hsla(${p.hue},100%,88%,${(a * 0.8).toFixed(3)})`; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, Math.max(0.5, p.r * 0.25), 0, 6.2832);
    g.fillStyle = `rgba(255,255,255,${(a * 0.9).toFixed(3)})`; g.fill();
  } else if (theme === 'space') {
    const tw = 0.55 + 0.45 * Math.sin(p.life / 90 + p.tw);
    g.beginPath(); g.arc(p.x, p.y, p.r * (0.7 + tw * 0.5), 0, 6.2832);
    g.fillStyle = `hsla(${p.hue},90%,86%,${(a * tw).toFixed(3)})`; g.fill();
  } else {
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832);
    g.fillStyle = `hsla(${p.hue},100%,62%,${a.toFixed(3)})`; g.fill();
  }
}

function run() {
  const doc = globalThis.document;
  if (!doc || !doc.body || !eligible()) return () => {};
  const theme = getTheme();
  const cv = doc.createElement('canvas');
  const g = cv.getContext && cv.getContext('2d');
  if (!g) return () => {};
  cv.setAttribute('aria-hidden', 'true');
  cv.setAttribute('data-fp-cursor', theme);
  Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: String(Z) });
  let dpr = 1, W = 0, H = 0;
  const size = () => {
    dpr = Math.min(MAX_DPR, globalThis.devicePixelRatio || 1);
    W = globalThis.innerWidth || 0; H = globalThis.innerHeight || 0;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (g.setTransform) g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  doc.body.appendChild(cv);

  const ps = [];
  let raf = 0, last = 0, lx = -1, ly = -1, hiddenNow = !!doc.hidden;
  dbg = { count: 0 };
  const raF = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(() => fn(Date.now()), 16));
  const caf = (id) => { try { (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout)(id); } catch { /* gone */ } };

  function frame(t) {
    raf = 0;
    const dt = last ? Math.min(50, t - last) : 16;
    last = t;
    g.clearRect(0, 0, W, H);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt; p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06;
      if (theme === 'neon') p.vy += 0.0004 * dt;
      if (p.life >= p.max) { ps.splice(i, 1); continue; }
      draw(g, theme, p, 1 - p.life / p.max);
    }
    dbg.count = ps.length;
    if (ps.length && !hiddenNow) raf = raF(frame); else { last = 0; g.clearRect(0, 0, W, H); }
  }
  const kick = () => { if (!raf && !hiddenNow) raf = raF(frame); };

  const move = (e) => {
    if (hiddenNow || (e.pointerType && e.pointerType !== 'mouse')) return;
    const x = e.clientX, y = e.clientY;
    if (lx >= 0 && Math.abs(x - lx) + Math.abs(y - ly) < 6) return;
    lx = x; ly = y;
    const n = theme === 'neon' ? 2 : 1;
    for (let i = 0; i < n; i++) { if (ps.length >= MAX_PARTICLES) ps.shift(); spawn(theme, x, y, ps); }
    dbg.count = ps.length;
    kick();
  };
  const vis = () => {
    hiddenNow = !!doc.hidden;
    if (hiddenNow) { if (raf) caf(raf); raf = 0; last = 0; ps.length = 0; dbg.count = 0; g.clearRect(0, 0, W, H); } else kick();
  };
  globalThis.addEventListener('pointermove', move, { passive: true });
  globalThis.addEventListener('resize', size);
  doc.addEventListener('visibilitychange', vis);
  return function stop() {
    if (raf) caf(raf);
    raf = 0; ps.length = 0; dbg = { count: 0 };
    globalThis.removeEventListener('pointermove', move);
    globalThis.removeEventListener('resize', size);
    doc.removeEventListener('visibilitychange', vis);
    cv.remove();
  };
}

/** Starts the trail if it applies right now and keeps it in step with the prefs. Returns stop(). */
export function startCursor() {
  let stopRun = run();
  const off = onPrefs(() => { stopRun(); stopRun = run(); });
  return function stop() { off(); stopRun(); stopRun = () => {}; };
}
