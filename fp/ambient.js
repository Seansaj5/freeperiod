// Ambient background: a few soft light orbs drifting behind the page, a glow that trails the mouse, and the graph-paper
// grid lighting up a little around it. One fixed <canvas> inside .sky, drawn at half resolution (soft light needs no
// more) and at most 30 times a second. Never runs with reduced motion, stops while the tab is hidden, and draws nothing
// it does not have to: a still mouse and slow orbs are a few drawImage calls a frame.
import { onAccent } from './theme.js';

const FPS = 30;
const SCALE = 0.5;          // canvas pixels per CSS pixel
const GRID = 32;            // the .paper grid in style.css
const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : null);

/** Orbs for a viewport: count by area (6 on a phone, up to 11 on a big screen), seeded so a reload looks the same. */
export function makeOrbs(w, h, seed = 7) {
  let x = seed >>> 0 || 1;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  const n = Math.max(6, Math.min(11, Math.round((w * h) / 160000)));
  return Array.from({ length: n }, (_, i) => ({
    x: rnd() * w, y: rnd() * h,
    r: 90 + rnd() * 150,
    vx: (rnd() - 0.5) * 16, vy: (rnd() - 0.5) * 12,      // CSS px per second
    depth: 0.3 + rnd() * 0.7,                              // how much the mouse moves it (parallax)
    tone: i % 3,                                           // 0 accent, 1 second color, 2 a white-ish mix
    a: 0.07 + rnd() * 0.08,
    phase: rnd() * Math.PI * 2,
  }));
}

/** Moves orbs by dt seconds and wraps them around the edges (with their radius as margin). Pure: tested. */
export function stepOrbs(orbs, dt, w, h) {
  for (const o of orbs) {
    o.x += o.vx * dt; o.y += o.vy * dt;
    const m = o.r;
    if (o.x < -m) o.x += w + 2 * m; else if (o.x > w + m) o.x -= w + 2 * m;
    if (o.y < -m) o.y += h + 2 * m; else if (o.y > h + m) o.y -= h + 2 * m;
  }
  return orbs;
}

function cssColor(name, fallback) {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; } catch { return fallback; }
}
// A soft round light in one color, drawn once and stamped with drawImage.
function sprite(color, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + '99');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}
const hex6 = (v, fb) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fb);

/** Starts the background in `.sky`. Returns { stop } or null when it should not run (reduced motion, no canvas). */
export function startAmbient({ parent = document.querySelector('.sky') } = {}) {
  const reduce = mq('(prefers-reduced-motion: reduce)');
  if (!parent || (reduce && reduce.matches)) return null;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return null;
  cv.className = 'ambient';
  cv.setAttribute('aria-hidden', 'true');
  parent.append(cv);
  const fine = mq('(hover: hover) and (pointer: fine)');

  let W = 0, H = 0, orbs = [], sprites = [], dot = null;
  let raf = 0, last = 0, acc = 0, stopped = false;
  const mouse = { x: -1, y: -1, on: false, sx: 0, sy: 0, glow: 0 };      // sx/sy: the glow's lagging position

  function paints() {
    const a = hex6(cssColor('--lime', '#c6ff3d'), '#c6ff3d'), b = hex6(cssColor('--cyan', '#3de0ff'), '#3de0ff');
    sprites = [sprite(a), sprite(b), sprite('#dff6ff')];
    dot = sprite(a, 32);
  }
  function size() {
    W = innerWidth; H = innerHeight;
    cv.width = Math.max(1, Math.round(W * SCALE)); cv.height = Math.max(1, Math.round(H * SCALE));
    if (!orbs.length) orbs = makeOrbs(W, H);
  }
  function draw(t) {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // parallax: the mouse's offset from the middle nudges each orb by its depth
    const px = mouse.on ? (mouse.sx / W - 0.5) * 40 : 0, py = mouse.on ? (mouse.sy / H - 0.5) * 30 : 0;
    for (const o of orbs) {
      const pulse = 0.8 + 0.2 * Math.sin(t / 2400 + o.phase);
      ctx.globalAlpha = o.a * pulse;
      const r = o.r * (0.94 + 0.06 * pulse), x = o.x - px * o.depth, y = o.y - py * o.depth;
      ctx.drawImage(sprites[o.tone], x - r, y - r, r * 2, r * 2);
    }
    if (mouse.on && mouse.glow > 0.01) {
      // the glow that trails the mouse
      ctx.globalAlpha = 0.16 * mouse.glow;
      ctx.drawImage(sprites[0], mouse.sx - 170, mouse.sy - 170, 340, 340);
      // grid crossings near the mouse light up (brightest at the middle), lined up with the .paper grid
      const R = 150, x0 = Math.floor((mouse.sx - R) / GRID) * GRID, y0 = Math.floor((mouse.sy - R) / GRID) * GRID;
      for (let gx = x0; gx <= mouse.sx + R; gx += GRID) {
        for (let gy = y0; gy <= mouse.sy + R; gy += GRID) {
          const d = Math.hypot(gx - mouse.sx, gy - mouse.sy);
          if (d > R) continue;
          const k = 1 - d / R;
          ctx.globalAlpha = 0.55 * k * k * mouse.glow;
          ctx.drawImage(dot, gx - 6, gy - 6, 12, 12);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function frame(t) {
    raf = 0;
    if (stopped) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    acc += dt;
    schedule();
    if (acc < 1 / FPS - 0.004) return;      // at most 30 draws a second
    const step = acc; acc = 0;
    stepOrbs(orbs, step, W, H);
    // the glow eases toward the mouse and fades in/out
    const k = 1 - Math.pow(0.0015, step);
    mouse.sx += (mouse.x - mouse.sx) * k; mouse.sy += (mouse.y - mouse.sy) * k;
    mouse.glow += ((mouse.on ? 1 : 0) - mouse.glow) * Math.min(1, step * 3);
    draw(t);
  }
  function schedule() { if (!raf && !stopped && document.visibilityState !== 'hidden') raf = requestAnimationFrame(frame); }

  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!mouse.on && mouse.x < 0) { mouse.sx = e.clientX; mouse.sy = e.clientY; }
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
  };
  const onLeave = () => { mouse.on = false; };
  const onVis = () => { if (document.visibilityState === 'hidden') { cancelAnimationFrame(raf); raf = 0; last = 0; } else schedule(); };
  const onResize = () => { size(); };
  const onReduce = () => { if (reduce && reduce.matches) stop(); };

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    removeEventListener('blur', onLeave);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', onResize);
    if (reduce && reduce.removeEventListener) reduce.removeEventListener('change', onReduce);
    offAccent();
    cv.remove();
  }

  paints();
  size();
  if (fine && fine.matches) {
    addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    addEventListener('blur', onLeave);
  }
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', onResize, { passive: true });
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', onReduce);
  const offAccent = onAccent(() => paints());
  schedule();
  return { stop, canvas: cv };
}
