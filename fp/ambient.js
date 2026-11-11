// Ambient background: one fixed <canvas> inside .sky, picked by the theme (fp/theme.js) and restarted when the theme,
// accent or Effects switch changes. Nothing runs while Effects is off; everything stops while the tab is hidden.
// - orbs (neon, and the themes without their own mode yet): a few soft light orbs drifting behind the page, a glow that
//   trails the mouse, and the graph-paper grid lighting up a little around it. Drawn at half resolution (soft light needs
//   no more) and at most 30 times a second. Never runs with reduced motion.
// - aero (Night Aero): twinkling stars, a few glossy bubbles floating up, and a light that runs along the sky's main
//   ribbon now and then (the ribbons themselves are assets/aero-sky.svg in .sky .g1). Sharp: device pixels, at most 1.5x.
//   With reduced motion it draws one still frame (stars and bubbles, no light) and never animates.
// - space (Deep Space): three layers of star dust drifting slowly, each at its own speed, and moving at its own speed
//   when the page scrolls or the mouse moves (parallax: the near layer most); a few soft glows of dust, twinkling near
//   stars, and now and then a shooting star. Black, white, ice blue and gold only. Same limits as aero (1.5x, 30 a
//   second, paused while hidden, fewer stars on a phone); with reduced motion one still frame.
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

/** Which background runs: 'orbs', 'aero' / 'space' ('aero-still' / 'space-still' with reduced motion: one still frame) or
 *  null (nothing). Pure: tested. */
export function ambientMode({ theme, fx, reduce }) {
  if (!fx) return null;
  if (theme === 'aero') return reduce ? 'aero-still' : 'aero';
  if (theme === 'space') return reduce ? 'space-still' : 'space';
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

// ---------- Deep Space ----------
/** The three layers of star dust, far to near: their share of the stars, drift (CSS px a second), scroll parallax (px a
 *  star moves per px scrolled), mouse parallax (px at the screen's edge), star radius and brightness ranges. */
export const DUST_LAYERS = Object.freeze([
  Object.freeze({ share: 0.62, drift: 1.6, par: 0.03, look: 6, r: [0.45, 0.85], a: [0.3, 0.65] }),
  Object.freeze({ share: 0.27, drift: 4, par: 0.08, look: 14, r: [0.6, 1.15], a: [0.45, 0.85] }),
  Object.freeze({ share: 0.11, drift: 9, par: 0.17, look: 30, r: [0.95, 1.8], a: [0.6, 0.95] }),
]);
const DUST_DIR = [-0.94, -0.34];      // the way the dust drifts: left and a little up
const DUST_EDGE = 10;                  // px past each edge before a star wraps around (its glow never pops)

/** Star dust in a field of w x fh CSS px (fh: the tallest the screen gets, so a phone's URL bar never moves anything): 80
 *  stars on a phone, 120 to 260 on bigger screens, split over DUST_LAYERS and sorted far to near. Seeded: a reload looks
 *  the same. tint 0 white, 1 ice blue, 2 gold. Pure: tested. */
export function makeDust(w, fh, seed = 23) {
  const rnd = seeded(seed);
  const n = w < 700 ? 80 : Math.max(120, Math.min(260, Math.round((w * fh) / 5600)));
  const out = [];
  DUST_LAYERS.forEach((L, layer) => {
    const k = layer === DUST_LAYERS.length - 1 ? n - out.length : Math.round(n * L.share);
    for (let i = 0; i < k; i++) {
      const t = rnd();
      out.push({
        layer, x: rnd() * w, y: rnd() * fh,
        r: L.r[0] + rnd() * (L.r[1] - L.r[0]), a: L.a[0] + rnd() * (L.a[1] - L.a[0]),
        tint: t < 0.1 ? 2 : t < 0.45 ? 1 : 0,
        glint: layer === 2 && i % 4 === 0,
        tw: layer ? 0.6 + rnd() * 1.6 : 0, ph: rnd() * TAU,      // the near layers twinkle
      });
    }
  });
  return out;
}

/** Where a star is at t seconds with the page scrolled `scroll` px and the mouse at look = [-1..1, -1..1] from the middle:
 *  its layer's drift, scroll and mouse parallax, wrapped around a w x fh field (with DUST_EDGE to spare). Pure: tested. */
export function dustAt(s, t, scroll, look, w, fh) {
  const L = DUST_LAYERS[s.layer], e = DUST_EDGE, W = w + 2 * e, H = fh + 2 * e;
  const x = s.x + DUST_DIR[0] * L.drift * t - look[0] * L.look;
  const y = s.y + DUST_DIR[1] * L.drift * t - scroll * L.par - look[1] * L.look;
  return [(((x + e) % W) + W) % W - e, (((y + e) % H) + H) % H - e];
}

/** Soft glows of dust behind the stars: 3 on a phone, 6 on bigger screens; mostly ice blue, one gold. They ride the far
 *  layer. Seeded. */
export function makeMotes(w, fh, seed = 29) {
  const rnd = seeded(seed);
  const n = w < 700 ? 3 : 6;
  return Array.from({ length: n }, (_, i) => ({
    layer: 0, x: rnd() * w, y: rnd() * fh, r: (w < 700 ? 110 : 160) + rnd() * 140,
    a: 0.035 + rnd() * 0.025, gold: i === n - 1,
  }));
}

/** The next shooting star after `now` seconds: when it starts (6 to 16 s later), where (as fractions of the screen, upper
 *  part), its heading (down and to the left) and length. Pure: tested. */
export function nextShot(now, rnd) {
  return {
    at: now + 6 + rnd() * 10,
    x: 0.25 + rnd() * 0.8, y: 0.02 + rnd() * 0.38,
    ang: Math.PI * (0.8 + rnd() * 0.12),      // radians from +x (screen y points down): left and down
    len: 120 + rnd() * 90, dur: 0.7 + rnd() * 0.35, speed: 760 + rnd() * 340,
  };
}

// a star in a tint: a white core in a small halo of its color
function dustSprite(rgb, size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), m = size / 2;
  const q = g.createRadialGradient(m, m, 0, m, m, m);
  q.addColorStop(0, 'rgba(255,255,255,1)');
  q.addColorStop(0.14, `rgba(${rgb},0.9)`);
  q.addColorStop(0.4, `rgba(${rgb},0.2)`);
  q.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = q; g.fillRect(0, 0, size, size);
  return c;
}
const DUST_RGB = ['238,244,255', '170,218,255', '255,214,150'];

function startSpace(parent, { still = false } = {}) {
  const made = makeCanvas(parent);
  if (!made) return null;
  const { cv, ctx } = made;
  const fine = mq('(hover: hover) and (pointer: fine)');
  const rnd = seeded(31);
  let W = 0, H = 0, FH = 0, dpr = 1, dust = [], motes = [], raf = 0, last = 0, acc = 0, stopped = false, clock = 0;
  let shot = nextShot(-3, rnd);       // the first one comes 3 to 13 s after the page opens
  const look = [0, 0], aim = [0, 0];
  const sprites = DUST_RGB.map((c) => dustSprite(c)), glint = starSprite(true, 48);
  const moteIce = sprite('#8fd3ff'), moteGold = sprite('#ffb84a');

  function size() {
    const w = innerWidth, h = innerHeight;
    dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    // only a new width lays the dust out again; a phone's URL bar coming and going (a new height) does not
    if (w !== W || !dust.length) {
      FH = Math.max(h, Math.round((globalThis.screen && screen.height) || 0));
      dust = makeDust(w, FH); motes = makeMotes(w, FH);
    }
    FH = Math.max(FH, h);
    W = w; H = h;
  }
  function drawShot() {
    const life = (clock - shot.at) / shot.dur;
    if (life < 0) return;
    if (life > 1) { shot = nextShot(clock, rnd); return; }
    const dx = Math.cos(shot.ang), dy = Math.sin(shot.ang), run = shot.speed * shot.dur * life;
    const hx = shot.x * W + dx * run, hy = shot.y * H + dy * run;
    const tail = shot.len * Math.min(1, life * 3), tx = hx - dx * tail, ty = hy - dy * tail;
    const fade = Math.min(1, life * 6, (1 - life) * 3);
    const grad = ctx.createLinearGradient(tx, ty, hx, hy);
    grad.addColorStop(0, 'rgba(170,218,255,0)');
    grad.addColorStop(0.7, 'rgba(200,232,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.globalAlpha = fade;
    ctx.strokeStyle = grad; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.drawImage(glint, hx - 10, hy - 10, 20, 20);
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const t = still ? 0 : clock, scroll = still ? 0 : (globalThis.scrollY || 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const [x, y] = dustAt(m, t, scroll, look, W, FH);
      if (y - m.r > H) continue;
      ctx.globalAlpha = m.a;
      ctx.drawImage(m.gold ? moteGold : moteIce, x - m.r, y - m.r, m.r * 2, m.r * 2);
    }
    for (const s of dust) {
      const [x, y] = dustAt(s, t, scroll, look, W, FH);
      if (y > H + DUST_EDGE) continue;
      const a = s.tw && !still ? s.a * (0.62 + 0.38 * Math.sin(clock * s.tw + s.ph)) : s.a;
      ctx.globalAlpha = a;
      if (!s.layer) {
        // far: a tight dot, no halo
        ctx.drawImage(sprites[s.tint], x - s.r * 2.2, y - s.r * 2.2, s.r * 4.4, s.r * 4.4);
      } else {
        const r = s.glint ? s.r * 7 : s.r * 4.6;
        ctx.drawImage(s.glint ? glint : sprites[s.tint], x - r, y - r, r * 2, r * 2);
      }
    }
    if (!still) drawShot();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
    const k = 1 - Math.pow(0.02, step);      // the mouse parallax eases in
    look[0] += (aim[0] - look[0]) * k; look[1] += (aim[1] - look[1]) * k;
    draw();
  }
  function schedule() { if (!still && !raf && !stopped && document.visibilityState !== 'hidden') raf = requestAnimationFrame(frame); }
  const onVis = () => { if (document.visibilityState === 'hidden') { cancelAnimationFrame(raf); raf = 0; last = 0; } else schedule(); };
  const onResize = () => { size(); if (still) draw(); };
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    aim[0] = Math.max(-1, Math.min(1, (e.clientX / (W || 1)) * 2 - 1)); aim[1] = Math.max(-1, Math.min(1, (e.clientY / (H || 1)) * 2 - 1));
  };
  const onLeave = () => { aim[0] = 0; aim[1] = 0; };
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', onResize);
    removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    cv.remove();
  }

  size();
  addEventListener('resize', onResize, { passive: true });
  if (still) draw();
  else {
    document.addEventListener('visibilitychange', onVis);
    if (fine && fine.matches) {
      addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
    }
    schedule();
  }
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
    else if (next === 'space' || next === 'space-still') current = startSpace(parent, { still: next === 'space-still' });
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
