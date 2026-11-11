// Ambient background: one fixed <canvas> inside .sky, picked by the theme (fp/theme.js) and restarted when the theme,
// accent or Effects switch changes. Nothing runs while Effects is off; everything stops while the tab is hidden.
// - orbs (neon, and the themes without their own mode yet): a few soft light orbs drifting behind the page, a glow that
//   trails the mouse, and the graph-paper grid lighting up a little around it. Drawn at half resolution (soft light needs
//   no more) and at most 30 times a second. Never runs with reduced motion.
// - aero (Night Aero): twinkling stars, a few glossy bubbles floating up, and a light that runs along the sky's main
//   ribbon now and then (the ribbons themselves are assets/aero-sky.svg in .sky .g1). Sharp: device pixels, at most 1.5x.
//   With reduced motion it draws one still frame (stars and bubbles, no light) and never animates.
import { onAccent, onPrefs, getTheme, getEffects } from './theme.js';

const FPS = 30;
const SCALE = 0.5;          // orbs: canvas pixels per CSS pixel
const GRID = 32;            // the .paper grid in style.css
const MAX_DPR = 1.5;        // aero: sharp, but never more than 1.5 canvas pixels per CSS pixel
const TAU = Math.PI * 2;
const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : null);

// A small seeded random generator (xorshift), so a reload looks the same.
function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
}

/** Orbs for a viewport: count by area (6 on a phone, up to 11 on a big screen), seeded so a reload looks the same. */
export function makeOrbs(w, h, seed = 7) {
  const rnd = seeded(seed);
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

/** Which background runs: 'orbs', 'aero', 'aero-still' (reduced motion: one still frame) or null (nothing). Pure: tested. */
export function ambientMode({ theme, fx, reduce }) {
  if (!fx) return null;
  if (theme === 'aero') return reduce ? 'aero-still' : 'aero';
  return reduce ? null : 'orbs';
}

// ---------- Night Aero ----------
/** The main ribbon's lit edge (a cubic Bezier, as fractions of the viewport): assets/aero-sky.svg draws it x1000. */
export const AERO_RIBBON = Object.freeze([[-0.1, 0.58], [0.28, 0.4], [0.6, 0.66], [1.1, 0.3]]);
/** A point on a cubic Bezier [[x,y] x4] at t (0..1). */
export function bezier(P, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
}

/** Stars as fractions of the viewport (so a phone's URL bar resizing the page never moves them): more on big screens,
 *  thinning out toward the bottom, a few big ones with a cross glint. */
export function makeStars(w, h, seed = 11) {
  const rnd = seeded(seed);
  const n = Math.max(24, Math.min(90, Math.round((w * h) / 16000)));
  return Array.from({ length: n }, (_, i) => {
    const big = i % 13 === 0;
    return {
      x: rnd(), y: Math.pow(rnd(), 1.4) * 0.92,
      r: big ? 1.5 + rnd() * 0.8 : 0.5 + rnd() * 0.9,          // CSS px
      a: 0.35 + rnd() * 0.55, big,
      sp: 0.5 + rnd() * 1.4,                                 // twinkles per ~6 s
      ph: rnd() * TAU,
    };
  });
}

/** Glossy bubbles: 4 on a phone, 6 to 10 on bigger screens. x is a fraction of the width, y in CSS px. */
export function makeBubbles(w, h, seed = 5) {
  const rnd = seeded(seed);
  const n = w < 700 ? 4 : Math.max(6, Math.min(10, Math.round((w * h) / 150000)));
  const big = w < 700 ? 16 : 26;
  return Array.from({ length: n }, () => ({
    x: 0.04 + rnd() * 0.92, y: rnd() * h,
    r: 7 + Math.pow(rnd(), 1.6) * big,
    vy: 7 + rnd() * 11,                                    // CSS px per second, upward
    amp: 5 + rnd() * 10, per: 5 + rnd() * 5, ph: rnd() * TAU,
    a: 0.4 + rnd() * 0.35,
  }));
}

/** Floats bubbles up by dt seconds; one that leaves the top comes back in under the bottom edge somewhere else. Pure: tested. */
export function stepBubbles(bubbles, dt, h) {
  for (const b of bubbles) {
    b.y -= b.vy * dt;
    if (b.y < -b.r - 4) { b.y = h + b.r + 4; b.x = (b.x + 0.37) % 1; }
  }
  return bubbles;
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

// A glossy Aero bubble, drawn once: a clear body with a brighter rim, a rainbow sheen around the edge, two highlights.
function bubbleSprite(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), m = size / 2, R = m - 2;
  const body = g.createRadialGradient(m, m, 0, m, m, R);
  body.addColorStop(0, 'rgba(120,200,255,0.03)');
  body.addColorStop(0.55, 'rgba(120,200,255,0.05)');
  body.addColorStop(0.76, 'rgba(140,230,255,0.12)');
  body.addColorStop(0.93, 'rgba(200,250,255,0.38)');
  body.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = body;
  g.beginPath(); g.arc(m, m, R, 0, TAU); g.fill();
  if (g.createConicGradient) {
    const sheen = g.createConicGradient(0.7, m, m);
    [['#7ff2ff', 0], ['#9cffb4', 0.25], ['#fff3a0', 0.5], ['#8fd0ff', 0.75], ['#7ff2ff', 1]].forEach(([col, at]) => sheen.addColorStop(at, col));
    g.globalAlpha = 0.32; g.strokeStyle = sheen; g.lineWidth = size * 0.035;
    g.beginPath(); g.arc(m, m, R * 0.9, 0, TAU); g.stroke();
    g.globalAlpha = 1;
  }
  const hi = g.createRadialGradient(m * 0.62, m * 0.52, 0, m * 0.62, m * 0.52, R * 0.42);
  hi.addColorStop(0, 'rgba(255,255,255,0.8)');
  hi.addColorStop(0.18, 'rgba(255,255,255,0.4)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi; g.fillRect(0, 0, size, size);
  const lo = g.createRadialGradient(m * 1.42, m * 1.52, 0, m * 1.42, m * 1.52, R * 0.2);
  lo.addColorStop(0, 'rgba(255,255,255,0.45)');
  lo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lo; g.fillRect(0, 0, size, size);
  return c;
}
// A star: a bright core in a small blue-white halo; the big ones get a thin cross glint.
function starSprite(cross, size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), m = size / 2;
  const q = g.createRadialGradient(m, m, 0, m, m, m);
  q.addColorStop(0, 'rgba(255,255,255,1)');
  q.addColorStop(0.12, 'rgba(225,245,255,0.9)');
  q.addColorStop(0.35, 'rgba(160,215,255,0.22)');
  q.addColorStop(1, 'rgba(160,215,255,0)');
  g.fillStyle = q; g.fillRect(0, 0, size, size);
  if (cross) {
    for (const [x0, y0, x1, y1] of [[0, m, size, m], [m, 0, m, size]]) {
      const l = g.createLinearGradient(x0, y0, x1, y1);
      l.addColorStop(0, 'rgba(215,238,255,0)'); l.addColorStop(0.5, 'rgba(235,248,255,0.95)'); l.addColorStop(1, 'rgba(215,238,255,0)');
      g.fillStyle = l;
      if (y0 === y1) g.fillRect(0, m - 0.6, size, 1.2); else g.fillRect(m - 0.6, 0, 1.2, size);
    }
  }
  return c;
}

// ---------- the modes: each takes the .sky element, adds its canvas and returns { stop } ----------
function makeCanvas(parent) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return null;
  cv.className = 'ambient';
  cv.setAttribute('aria-hidden', 'true');
  parent.append(cv);
  return { cv, ctx };
}

function startOrbs(parent) {
  const made = makeCanvas(parent);
  if (!made) return null;
  const { cv, ctx } = made;
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

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    removeEventListener('blur', onLeave);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', onResize);
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
  const offAccent = onAccent(() => paints());
  schedule();
  return { stop, canvas: cv };
}

const GLINT_EVERY = 12;     // s between two runs of the light along the ribbon
const GLINT_RUN = 4.5;      // s one run takes
const GLINT_TAIL = 0.16;    // of the ribbon's length

function startAero(parent, { still = false } = {}) {
  const made = makeCanvas(parent);
  if (!made) return null;
  const { cv, ctx } = made;
  let W = 0, H = 0, dpr = 1, stars = [], bubbles = [], raf = 0, last = 0, acc = 0, stopped = false;
  let clock = GLINT_EVERY - 2.5;      // the first light runs 2.5 s after the sky fades in
  const bub = bubbleSprite(), star = starSprite(false), glint = starSprite(true, 48);

  function size() {
    const w = innerWidth, h = innerHeight;
    dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    // only a new width (a turned phone, a resized window) lays the sky out again; a URL bar coming and going does not
    if (w !== W || !stars.length) { stars = makeStars(w, h); bubbles = makeBubbles(w, h); }
    W = w; H = h;
  }
  function drawGlint(head) {
    // the light: a tail of short strokes along the ribbon, brightest at the head, with a soft star on the head
    const P = AERO_RIBBON.map(([x, y]) => [x * W, y * H]);
    const steps = 18, at = (t) => bezier(P, Math.min(1, Math.max(0, t)));
    ctx.lineCap = 'round';
    let prev = at(head - GLINT_TAIL);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, p = at(head - GLINT_TAIL * (1 - k));
      ctx.globalAlpha = 0.85 * k * k;
      ctx.strokeStyle = 'rgba(205,245,255,1)';
      ctx.lineWidth = 0.6 + 2.2 * k;
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      prev = p;
    }
    const [hx, hy] = at(head);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glint, hx - 24, hy - 24, 48, 48);
  }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of stars) {
      const tw = still ? 0.85 : 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
      ctx.globalAlpha = s.a * tw;
      const r = s.big ? s.r * 7 : s.r * 4.5, img = s.big ? glint : star;
      ctx.drawImage(img, s.x * W - r, s.y * H - r, r * 2, r * 2);
    }
    if (!still) {
      const phase = clock % GLINT_EVERY;
      if (phase < GLINT_RUN) drawGlint(phase / GLINT_RUN * (1 + GLINT_TAIL));
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const b of bubbles) {
      const x = b.x * W + (still ? 0 : b.amp * Math.sin(t / b.per + b.ph)), y = b.y;
      ctx.globalAlpha = b.a;
      ctx.drawImage(bub, x - b.r, y - b.r, b.r * 2, b.r * 2);
    }
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    raf = 0;
    if (stopped) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    acc += dt;
    schedule();
    if (acc < 1 / FPS - 0.004) return;      // at most 30 draws a second
    const step = acc; acc = 0;
    clock += step;
    stepBubbles(bubbles, step, H);
    draw(clock);
  }
  function schedule() { if (!still && !raf && !stopped && document.visibilityState !== 'hidden') raf = requestAnimationFrame(frame); }
  const onVis = () => { if (document.visibilityState === 'hidden') { cancelAnimationFrame(raf); raf = 0; last = 0; } else schedule(); };
  const onResize = () => { size(); if (still) draw(clock); };
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', onResize);
    cv.remove();
  }

  size();
  addEventListener('resize', onResize, { passive: true });
  if (still) draw(clock);
  else { document.addEventListener('visibilitychange', onVis); schedule(); }
  return { stop, canvas: cv };
}

/**
 * Starts the background in `.sky` and keeps it in step with the theme, the Effects switch and reduced motion (a change
 * stops the old mode and starts the new one). Returns { stop, mode } or null when the page has no .sky.
 */
export function startAmbient({ parent = document.querySelector('.sky') } = {}) {
  if (!parent) return null;
  const reduce = mq('(prefers-reduced-motion: reduce)');
  let current = null, mode = null, stopped = false;
  function run() {
    if (stopped) return;
    const next = ambientMode({ theme: getTheme(), fx: getEffects(), reduce: !!(reduce && reduce.matches) });
    if (next === mode && (current || !next)) return;      // same mode: keep it running (an accent change repaints the orbs itself)
    if (current) current.stop();
    current = null;
    mode = next;
    if (next === 'orbs') current = startOrbs(parent);
    else if (next) current = startAero(parent, { still: next === 'aero-still' });
  }
  const offPrefs = onPrefs(run);
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', run);
  run();
  return {
    get mode() { return mode; },
    stop() {
      stopped = true;
      offPrefs();
      if (reduce && reduce.removeEventListener) reduce.removeEventListener('change', run);
      if (current) current.stop();
      current = null;
    },
  };
}
