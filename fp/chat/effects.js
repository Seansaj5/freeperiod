// Profile effects: 13 canvas overlays for the profile card (drawn in code, no outside art).
// mountEffect(el, id) lays a <canvas> over `el` (position: relative is added) and returns { el, stop() }.
// One requestAnimationFrame loop per card; it stops while the card is off-screen (shared IntersectionObserver) and,
// with prefers-reduced-motion, draws a single settled frame instead of animating. No blur filters: soft glows are
// small pre-rendered gradient sprites drawn with drawImage.
import { EFFECTS } from './flair.js';

const TAU = Math.PI * 2;
const AREA = 300 * 420; // densities are tuned for the 300 x 420 card and scale with its area

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const count = (base, w, h) => Math.max(1, Math.round((base * w * h) / AREA));

// ---- sprites (shared by every card, made once) ----
const sprites = new Map();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/** Soft round glow: color at the center fading to nothing. */
function glow(color, core = 0) {
  const key = 'g' + color + core;
  if (!sprites.has(key)) {
    const c = canvas(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, color); if (core) r.addColorStop(core, color); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    sprites.set(key, c);
  }
  return sprites.get(key);
}
function bubbleSprite() {
  if (!sprites.has('bubble')) {
    const c = canvas(96, 96), g = c.getContext('2d');
    const f = g.createRadialGradient(48, 48, 20, 48, 48, 46);
    f.addColorStop(0, 'rgba(61,224,255,0.03)'); f.addColorStop(0.85, 'rgba(61,224,255,0.12)'); f.addColorStop(1, 'rgba(160,240,255,0.35)');
    g.fillStyle = f; g.beginPath(); g.arc(48, 48, 46, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(190,245,255,0.75)'; g.lineWidth = 2.2; g.beginPath(); g.arc(48, 48, 45, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.arc(48, 48, 34, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(66, 66, 3.5, 0, TAU); g.fill();
    sprites.set('bubble', c);
  }
  return sprites.get('bubble');
}
/** A vertical aurora curtain strip: brightest at its lower edge, fading upward. */
function curtain(rgb) {
  const key = 'c' + rgb;
  if (!sprites.has(key)) {
    const c = canvas(4, 128), g = c.getContext('2d'), v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, `rgba(${rgb},0)`); v.addColorStop(0.55, `rgba(${rgb},0.22)`); v.addColorStop(0.88, `rgba(${rgb},0.75)`); v.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = v; g.fillRect(0, 0, 4, 128);
    sprites.set(key, c);
  }
  return sprites.get(key);
}
function starPath(ctx, x, y, R, rot) {
  const r = R * 0.2, c = Math.cos(rot), s = Math.sin(rot);
  const p = (dx, dy) => [x + dx * c - dy * s, y + dx * s + dy * c];
  const pts = [[0, -R], [r, -r], [R, 0], [r, r], [0, R], [-r, r], [-R, 0], [-r, -r]].map(([a, b]) => p(a, b));
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= 8; i += 2) { const q = pts[i], e = pts[(i + 1) % 8]; ctx.quadraticCurveTo(q[0], q[1], e[0], e[1]); }
  ctx.closePath();
}

// ---- goo (the symbiote effects): shared shapes and paint ----
const rgbOf = (hex) => (typeof hex === 'string' && /^#[0-9a-f]{6}$/.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [207, 224, 255]);
// size factor: 1 on the 340 px card, smaller in the editor's tiles
const gooScale = (w, h) => Math.max(0.5, Math.min(1.1, Math.min(w / 340, h / 440) * 1.05));
// body: lit from the top left; rim light: the accent, shifting through an oily teal and green
// (body runs from (0,0) to (bx,by): the whole card for the tendrils, just the banner for the drips)
function gooPaint(ctx, bx, by, [r, g, b]) {
  const body = ctx.createLinearGradient(0, 0, bx, by);
  body.addColorStop(0, '#2c3039'); body.addColorStop(0.25, '#0e1014'); body.addColorStop(0.6, '#030304'); body.addColorStop(1, '#090a0d');
  const rim = ctx.createLinearGradient(0, 0, bx, by);
  rim.addColorStop(0, `rgba(${r},${g},${b},0.4)`); rim.addColorStop(0.4, 'rgba(127,216,255,0.36)'); rim.addColorStop(0.7, 'rgba(157,255,196,0.34)'); rim.addColorStop(1, `rgba(${r},${g},${b},0.6)`);
  return { body, rim, acc: [r, g, b] };
}
// an oily sheen sliding across the goo only (source-atop keeps it on what is already drawn)
function gooSheen(ctx, w, h, t, paint) {
  const span = w + h, x = ((t * 34) % (span + 240)) - 120, [r, g, b] = paint.acc;
  const sh = ctx.createLinearGradient(x - 90, 0, x + 90, h * 0.35);
  sh.addColorStop(0, 'rgba(127,216,255,0)'); sh.addColorStop(0.35, 'rgba(127,216,255,0.22)'); sh.addColorStop(0.55, `rgba(${r},${g},${b},0.2)`);
  sh.addColorStop(0.75, 'rgba(255,231,160,0.16)'); sh.addColorStop(1, 'rgba(255,231,160,0)');
  ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}
// both sides of a ribbon along pts with half-width wf(s)
function ribbonSides(pts, wf, L, R) {
  const N = pts.length - 1;
  for (let i = 0; i <= N; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    const w = wf(i / N);
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]); R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
}
function smoothTo(ctx, p) {
  for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
  ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
}
function ribbonPath(ctx, L, R) {
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]); smoothTo(ctx, L);
  const back = R.slice().reverse(); ctx.lineTo(back[0][0], back[0][1]); smoothTo(ctx, back); ctx.closePath();
}
// a wobbling blob of goo
function blobPts(x, y, R, t, p, p2) {
  const out = [];
  for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; const r = R * (1 + 0.12 * Math.sin(3 * a + t * 0.6 + p) + 0.07 * Math.sin(5 * a - t * 0.9 + p2)); out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return out;
}
function closedPath(ctx, p) {
  const n = p.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m0 = mid(p[n - 1], p[0]);
  ctx.beginPath(); ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(p[i], p[(i + 1) % n]); ctx.quadraticCurveTo(p[i][0], p[i][1], m[0], m[1]); }
  ctx.closePath();
}
// a highlight line on a ribbon's lit side (light from the top left), from s0 to s1 of its length
function litLine(ctx, pts, off, s0, s1) {
  const N = pts.length - 1, i0 = Math.round(N * s0), i1 = Math.round(N * s1), q = [];
  for (let i = i0; i <= i1; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    let nx = -ty, ny = tx;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }
    const o = off(i / N); q.push([pts[i][0] + nx * o, pts[i][1] + ny * o]);
  }
  if (q.length < 2) return;
  ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); smoothTo(ctx, q); ctx.stroke();
}
// a drip from the goo at (x, y0): wide where it leaves, a neck, then a round drop of radius r at the bottom
function dripPath(ctx, x, y0, len, r) {
  const top = r * 2.3, neck = r * 0.5, cy = y0 + len, ax = r * 0.72, ay = r * 0.68;
  ctx.beginPath(); ctx.moveTo(x - top, y0 - 4);
  ctx.bezierCurveTo(x - top * 0.35, y0 + Math.min(len * 0.12, r * 2), x - neck, y0 + len * 0.38, x - ax, cy - ay);
  ctx.arc(x, cy, r, Math.atan2(-ay, -ax), Math.atan2(-ay, ax), true);
  ctx.bezierCurveTo(x + neck, y0 + len * 0.38, x + top * 0.35, y0 + Math.min(len * 0.12, r * 2), x + top, y0 - 4);
  ctx.closePath();
}

// ---- the effects: make(rand, opts) -> { fps?, init(w, h), step(dt, t), draw(ctx, w, h, t), still?(t) } ----
const MAKE = {
  sparkles(rand) {
    const COLORS = ['#ffffff', '#fff1a8', '#c6ff3d', '#a6f4ff'];
    let W = 0, H = 0, glints = [], dust = [];
    const spawn = (g, fresh) => {
      g.x = 8 + rand() * (W - 16); g.y = 8 + rand() * (H - 16); g.size = 3 + rand() ** 2 * 9; g.life = 1 + rand() * 1.3;
      g.age = fresh ? rand() * g.life : 0; g.rot = rand() * TAU; g.spin = (rand() - 0.5) * 1.4; g.c = COLORS[(rand() * COLORS.length) | 0];
    };
    return {
      init(w, h) {
        W = w; H = h;
        glints = Array.from({ length: count(20, w, h) }, () => { const g = {}; spawn(g, true); return g; });
        dust = Array.from({ length: count(36, w, h) }, () => ({ x: rand() * w, y: rand() * h, p: rand() * TAU, s: 0.8 + rand() * 1, f: 1.2 + rand() * 2.4 }));
      },
      step(dt) { for (const g of glints) { g.age += dt; g.rot += g.spin * dt; if (g.age >= g.life) spawn(g, false); } },
      draw(ctx, w, h, t) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#fff6d6';
        for (const d of dust) {
          const a = 0.2 + 0.4 * Math.sin(t * d.f + d.p);
          if (a <= 0.02) continue;
          ctx.globalAlpha = a; ctx.fillRect(d.x, d.y, d.s, d.s);
        }
        for (const g of glints) {
          const k = Math.sin((Math.PI * g.age) / g.life), s = g.size * (0.35 + 0.65 * k);
          ctx.globalAlpha = k * 0.7; ctx.drawImage(glow(g.c), g.x - s * 1.7, g.y - s * 1.7, s * 3.4, s * 3.4);
          ctx.globalAlpha = k; ctx.fillStyle = g.c; starPath(ctx, g.x, g.y, s, g.rot); ctx.fill();
        }
      },
    };
  },

  snow(rand) {
    let W = 0, H = 0, flakes = [];
    const make = (f, anywhere) => {
      f.r = 0.8 + rand() ** 2 * 2.8; f.x = rand() * W; f.y = anywhere ? rand() * H : -6 - rand() * 20;
      f.vy = 12 + f.r * 13 + rand() * 8; f.amp = 5 + rand() * 14; f.fr = 0.35 + rand() * 0.8; f.p = rand() * TAU; f.a = 0.45 + (f.r / 3.6) * 0.5;
    };
    return {
      init(w, h) { W = w; H = h; flakes = Array.from({ length: count(75, w, h) }, () => { const f = {}; make(f, true); return f; }); },
      step(dt) { for (const f of flakes) { f.y += f.vy * dt; if (f.y > H + 8) make(f, false); } },
      draw(ctx, w, h, t) {
        const sprite = glow('#ffffff', 0.35);
        for (const f of flakes) {
          const x = f.x + Math.sin(t * f.fr + f.p) * f.amp, s = f.r * 2.4;
          ctx.globalAlpha = f.a; ctx.drawImage(sprite, x - s, f.y - s, s * 2, s * 2);
        }
      },
    };
  },

  embers(rand) {
    let W = 0, H = 0, embers = [], heat = null;
    const make = (e, anywhere) => {
      e.x = rand() * W; e.y = anywhere ? H * (0.25 + rand() * 0.8) : H + 4 + rand() * 24; e.vy = -(22 + rand() * 50); e.vx = (rand() - 0.5) * 12;
      e.life = 2.4 + rand() * 2.8; e.age = anywhere ? rand() * e.life : 0; e.s = 0.9 + rand() ** 1.5 * 1.9; e.p = rand() * TAU; e.f = 6 + rand() * 10;
    };
    return {
      init(w, h) { W = w; H = h; embers = Array.from({ length: count(52, w, h) }, () => { const e = {}; make(e, true); return e; }); heat = null; },
      step(dt, t) {
        for (const e of embers) {
          e.age += dt; e.x += (e.vx + Math.sin(t * 1.3 + e.p) * 14) * dt; e.y += e.vy * dt;
          if (e.age > e.life || e.y < -10) make(e, false);
        }
      },
      draw(ctx, w, h, t) {
        if (!heat) { heat = ctx.createLinearGradient(0, h * 0.62, 0, h); heat.addColorStop(0, 'rgba(255,90,20,0)'); heat.addColorStop(1, 'rgba(255,90,20,0.22)'); }
        ctx.fillStyle = heat; ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 2.1); ctx.fillRect(0, h * 0.62, w, h * 0.38);
        ctx.globalCompositeOperation = 'lighter';
        const hot = glow('#ffd36b'), warm = glow('#ff8a1f'), cool = glow('#ff3b1a');
        for (const e of embers) {
          const u = e.age / e.life, fade = u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9, a = fade * (0.65 + 0.35 * Math.sin(t * e.f + e.p));
          if (a <= 0.02) continue;
          const g = u < 0.33 ? hot : u < 0.66 ? warm : cool, s = e.s * 5;
          ctx.globalAlpha = a * 0.6; ctx.drawImage(g, e.x - s, e.y - s, s * 2, s * 2);
          ctx.globalAlpha = a; ctx.fillStyle = u < 0.5 ? '#fff3c4' : '#ffb35a'; ctx.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s);
        }
      },
    };
  },

  glitch(rand) {
    let W = 0, H = 0, lines = null, next = 0.8, end = 0, bars = [], reroll = 0;
    const COLORS = ['rgba(61,224,255,0.38)', 'rgba(255,59,59,0.34)', 'rgba(198,255,61,0.3)', 'rgba(242,248,255,0.28)', 'rgba(5,7,12,0.55)'];
    const roll = () => {
      bars = [];
      const n = 3 + ((rand() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const big = rand() < 0.35;
        bars.push({ x: big ? 0 : rand() * W * 0.8, y: rand() * H, w: big ? W : 20 + rand() * W * 0.5, h: big ? 1 + rand() * 3 : 2 + rand() * 12, c: COLORS[(rand() * COLORS.length) | 0], dx: (rand() - 0.5) * 18 });
      }
      for (let i = 0; i < 6; i++) bars.push({ x: rand() * W, y: rand() * H, w: 3 + rand() * 9, h: 3 + rand() * 6, c: rand() < 0.5 ? 'rgba(242,248,255,0.7)' : 'rgba(61,224,255,0.6)', dx: 0 });
    };
    return {
      init(w, h) {
        W = w; H = h;
        lines = canvas(Math.ceil(w), Math.ceil(h));
        const g = lines.getContext('2d'); g.fillStyle = 'rgba(255,255,255,0.035)';
        for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
      },
      step(dt, t) {
        if (t >= next && t > end) { end = t + 0.18 + rand() * 0.3; next = end + 1.1 + rand() * 1.9; reroll = 0; }
        if (t < end && t >= reroll) { roll(); reroll = t + 0.05 + rand() * 0.05; }
      },
      draw(ctx, w, h, t) {
        ctx.drawImage(lines, 0, 0, w, h);
        const y = ((t * 70) % (h + 120)) - 60, band = ctx.createLinearGradient(0, y, 0, y + 60);
        band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(160,240,255,0.06)'); band.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = band; ctx.fillRect(0, y, w, 60);
        if (t < end) {
          for (const b of bars) { ctx.fillStyle = b.c; ctx.fillRect(b.x + b.dx, b.y, b.w, b.h); }
          const ly = bars.length ? bars[0].y : h / 2;
          ctx.fillStyle = 'rgba(61,224,255,0.5)'; ctx.fillRect(0, ly + 6, w, 1);
          ctx.fillStyle = 'rgba(255,59,59,0.45)'; ctx.fillRect(3, ly + 8, w, 1);
        }
      },
      still(t) { end = t + 1; roll(); },
    };
  },

  stars(rand) {
    let W = 0, H = 0, stars = [], shooters = [], next = 0.6;
    const TINTS = ['#ffffff', '#dfeaff', '#fff3c4'];
    const shoot = () => {
      const a = ((148 + rand() * 26) * Math.PI) / 180, v = 420 + rand() * 220;
      shooters.push({ x: W * (0.35 + rand() * 0.8), y: -10 + rand() * H * 0.35, vx: Math.cos(a) * v, vy: Math.sin(a) * v, len: 70 + rand() * 70, age: 0 });
    };
    return {
      init(w, h) {
        W = w; H = h; shooters = [];
        stars = Array.from({ length: count(90, w, h) }, () => ({ x: rand() * w, y: rand() * h, s: 0.7 + rand() ** 2 * 1.6, b: 0.5 + rand() * 0.5, f: 0.7 + rand() * 2.2, p: rand() * TAU, c: TINTS[(rand() * 3) | 0] }));
      },
      step(dt, t) {
        if (t >= next) { shoot(); next = t + 0.7 + rand() * 1.6; }
        for (const s of shooters) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; }
        shooters = shooters.filter((s) => s.x > -s.len && s.y < H + s.len);
      },
      draw(ctx, w, h, t) {
        for (const s of stars) {
          ctx.globalAlpha = s.b * (0.6 + 0.4 * Math.sin(t * s.f + s.p)); ctx.fillStyle = s.c;
          if (s.s < 1.3) ctx.fillRect(s.x, s.y, s.s, s.s);
          else { ctx.beginPath(); ctx.arc(s.x, s.y, s.s * 0.6, 0, TAU); ctx.fill(); if (s.s > 1.9) ctx.drawImage(glow(s.c), s.x - 5, s.y - 5, 10, 10); }
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const s of shooters) {
          const m = Math.hypot(s.vx, s.vy), tx = s.x - (s.vx / m) * s.len, ty = s.y - (s.vy / m) * s.len, a = Math.min(1, s.age * 6);
          const g = ctx.createLinearGradient(tx, ty, s.x, s.y);
          g.addColorStop(0, 'rgba(160,220,255,0)'); g.addColorStop(1, 'rgba(240,250,255,0.95)');
          ctx.globalAlpha = a; ctx.strokeStyle = g; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
          ctx.drawImage(glow('#cfeaff'), s.x - 7, s.y - 7, 14, 14);
        }
      },
      still(t) { shooters = []; shoot(); const s = shooters[0]; s.age = 0.4; s.x = W * 0.62; s.y = H * 0.18; },
    };
  },

  bubbles(rand) {
    let W = 0, H = 0, list = [];
    const make = (b, anywhere) => {
      b.r = 4 + rand() ** 1.5 * 13; b.x0 = rand() * W; b.y = anywhere ? rand() * H : H + b.r + rand() * 30;
      b.vy = 18 + (17 - b.r) * 1.6 + rand() * 12; b.amp = 3 + rand() * 8; b.fr = 0.7 + rand() * 1; b.p = rand() * TAU;
      b.top = H * (0.04 + rand() * 0.3); b.pop = -1;
    };
    return {
      init(w, h) { W = w; H = h; list = Array.from({ length: count(20, w, h) }, () => { const b = {}; make(b, true); return b; }); },
      step(dt, t) {
        for (const b of list) {
          if (b.pop >= 0) { b.pop += dt; if (b.pop > 0.3) make(b, false); continue; }
          b.y -= b.vy * dt; b.x = b.x0 + Math.sin(t * b.fr + b.p) * b.amp;
          if (b.y - b.r < b.top) b.pop = 0;
        }
      },
      draw(ctx, w, h, t) {
        const sprite = bubbleSprite();
        for (const b of list) {
          const x = b.x ?? b.x0;
          if (b.pop >= 0) {
            const k = b.pop / 0.3;
            ctx.globalAlpha = 1 - k; ctx.strokeStyle = 'rgba(190,245,255,0.9)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(x, b.y, b.r * (1 + k * 0.6), 0, TAU); ctx.stroke();
            ctx.fillStyle = '#c9f6ff';
            for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + b.p, d = b.r * (1 + k * 1.1); ctx.fillRect(x + Math.cos(a) * d - 1, b.y + Math.sin(a) * d - 1, 2, 2); }
            continue;
          }
          const wob = 1 + Math.sin(t * 3 + b.p) * 0.04;
          ctx.globalAlpha = 0.9; ctx.drawImage(sprite, x - b.r * wob, b.y - b.r / wob, b.r * 2 * wob, (b.r * 2) / wob);
        }
      },
    };
  },

  lightning(rand) {
    let W = 0, H = 0, bolt = null, spark = null, next = 0.7, nextSpark = 0.3, sky = null;
    const zig = (x0, y0, x1, y1, depth, rough) => {
      let pts = [[x0, y0], [x1, y1]];
      for (let d = 0; d < depth; d++) {
        const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
          const off = (rand() - 0.5) * len * rough, nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
          out.push([(ax + bx) / 2 + nx * off, (ay + by) / 2 + ny * off], pts[i]);
        }
        pts = out;
      }
      return pts;
    };
    const strike = (t) => {
      const x0 = W * (0.15 + rand() * 0.7), x1 = x0 + (rand() - 0.5) * W * 0.5, y1 = H * (0.45 + rand() * 0.45);
      const main = zig(x0, -6, x1, y1, 5, 0.55), forks = [];
      for (let i = 0; i < 2 + ((rand() * 2) | 0); i++) {
        const [fx, fy] = main[4 + ((rand() * (main.length - 10)) | 0)];
        forks.push(zig(fx, fy, fx + (rand() - 0.5) * W * 0.45, fy + 40 + rand() * 90, 4, 0.6));
      }
      bolt = { main, forks, born: t };
    };
    const env = (age) => (age < 0.06 ? 1 : age < 0.1 ? 0.25 : age < 0.17 ? 0.9 : Math.max(0, Math.exp(-(age - 0.17) * 9)));
    const line = (ctx, pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
    return {
      init(w, h) { W = w; H = h; sky = null; bolt = null; },
      step(dt, t) {
        if (t >= next) { strike(t); next = t + 1.1 + rand() * 1.9; }
        if (t >= nextSpark) {
          const edge = rand() < 0.5 ? 6 : W - 6, y = H * (0.2 + rand() * 0.7);
          spark = { pts: zig(edge, y, edge + (edge < W / 2 ? 1 : -1) * (14 + rand() * 20), y + (rand() - 0.5) * 30, 3, 0.7), born: t };
          nextSpark = t + 0.45 + rand() * 1.1;
        }
      },
      draw(ctx, w, h, t) {
        if (!sky) { sky = ctx.createLinearGradient(0, 0, 0, h * 0.5); sky.addColorStop(0, 'rgba(70,130,255,0.14)'); sky.addColorStop(1, 'rgba(70,130,255,0)'); }
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * 0.5);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (bolt) {
          const f = env(t - bolt.born);
          if (f <= 0.01) bolt = null;
          else {
            ctx.globalAlpha = 0.16 * f; ctx.fillStyle = '#a8d4ff'; ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';
            for (const [lw, a, c] of [[8, 0.16, '#3d8bff'], [3.4, 0.5, '#8fd0ff'], [1.4, 1, '#ffffff']]) {
              ctx.lineWidth = lw; ctx.strokeStyle = c; ctx.globalAlpha = a * f; line(ctx, bolt.main);
              ctx.lineWidth = lw * 0.6; ctx.globalAlpha = a * f * 0.8; for (const k of bolt.forks) line(ctx, k);
            }
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        if (spark) {
          const age = t - spark.born;
          if (age > 0.2) spark = null;
          else {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 1 - age / 0.2; ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(80,160,255,0.5)'; line(ctx, spark.pts);
            ctx.lineWidth = 1; ctx.strokeStyle = '#e6f6ff'; line(ctx, spark.pts);
          }
        }
      },
      still(t) { strike(t); bolt.born = t - 0.12; },
    };
  },

  confetti(rand) {
    const COLORS = [['#c6ff3d', '#8fbf1f'], ['#3de0ff', '#1f9fbf'], ['#ffb020', '#c47f0a'], ['#ffffff', '#b9c3d6'], ['#ff5a3d', '#c23a22'], ['#ffe14d', '#c4a91c']];
    let W = 0, H = 0, bits = [];
    const make = (b, anywhere) => {
      b.x = rand() * W; b.y = anywhere ? rand() * H : -10 - rand() * 30; b.w = 4 + rand() * 4.5; b.h = 2.4 + rand() * 2.2;
      b.vy = 32 + rand() * 45; b.vx = (rand() - 0.5) * 16; b.rot = rand() * TAU; b.vr = (rand() - 0.5) * 5; b.fs = 3 + rand() * 5; b.p = rand() * TAU;
      b.c = COLORS[(rand() * COLORS.length) | 0];
    };
    return {
      init(w, h) { W = w; H = h; bits = Array.from({ length: count(55, w, h) }, () => { const b = {}; make(b, true); return b; }); },
      step(dt, t) {
        for (const b of bits) {
          b.y += b.vy * dt; b.x += (b.vx + Math.sin(t * 1.6 + b.p) * 16) * dt; b.rot += b.vr * dt;
          if (b.y > H + 12) make(b, false);
        }
      },
      draw(ctx, w, h, t, dpr) {
        for (const b of bits) {
          const c = Math.cos(b.rot), s = Math.sin(b.rot), fl = Math.cos(t * b.fs + b.p);
          ctx.setTransform(dpr * c, dpr * s, -dpr * s * fl, dpr * c * fl, dpr * b.x, dpr * b.y);
          ctx.fillStyle = fl > 0 ? b.c[0] : b.c[1];
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      },
    };
  },

  matrix(rand) {
    const GLYPHS = '0123456789ABCDEF<>/{}[]=+*#$%&@?';
    const CW = 15, RH = 15;
    let cols = [], rows = 0;
    const pick = () => GLYPHS[(rand() * GLYPHS.length) | 0];
    const reset = (c, anywhere) => { c.len = 7 + ((rand() * 14) | 0); c.v = 5 + rand() * 9; c.head = anywhere ? rand() * (rows + c.len) : -rand() * rows * 0.7; };
    return {
      fps: 30,
      init(w, h) {
        rows = Math.ceil(h / RH) + 1;
        cols = Array.from({ length: Math.floor(w / CW) }, (_, i) => {
          const c = { x: i * CW + (w - Math.floor(w / CW) * CW) / 2 + CW / 2, g: Array.from({ length: rows }, pick) };
          reset(c, true); return c;
        });
      },
      step(dt) {
        for (const c of cols) {
          c.head += c.v * dt;
          if (c.head - c.len > rows) reset(c, false);
          if (rand() < dt * 4) c.g[(rand() * rows) | 0] = pick();
        }
      },
      draw(ctx) {
        ctx.font = '600 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (const c of cols) {
          const hr = Math.floor(c.head);
          for (let k = 0; k <= c.len; k++) {
            const r = hr - k;
            if (r < 0 || r >= rows) continue;
            if (k === 0) { ctx.globalAlpha = 0.95; ctx.fillStyle = '#f2ffd6'; }
            else { ctx.globalAlpha = 0.7 * (1 - k / (c.len + 1)) ** 1.4; ctx.fillStyle = k < 4 ? '#c6ff3d' : '#62c43a'; }
            ctx.fillText(c.g[r], c.x, r * RH);
          }
        }
      },
    };
  },

  aurora(rand) {
    let W = 0, H = 0, bands = [], stars = [];
    return {
      init(w, h) {
        W = w; H = h;
        bands = [['61,255,154', 0.17, 26, 70], ['61,224,255', 0.27, 22, 90], ['198,255,61', 0.36, 18, 60]].map(([rgb, y, amp, hgt]) => ({
          rgb, y: h * y, amp, hgt, k1: 0.012 + rand() * 0.01, k2: 0.03 + rand() * 0.02, w1: 0.35 + rand() * 0.3, w2: 0.5 + rand() * 0.4, p: rand() * TAU, kr: 0.05 + rand() * 0.04,
        }));
        stars = Array.from({ length: count(18, w, h) }, () => ({ x: rand() * w, y: rand() * h * 0.6, a: 0.2 + rand() * 0.4 }));
      },
      step() {},
      draw(ctx, w, h, t) {
        ctx.fillStyle = '#ffffff';
        for (const s of stars) { ctx.globalAlpha = s.a; ctx.fillRect(s.x, s.y, 1, 1); }
        ctx.globalCompositeOperation = 'lighter';
        const step = 4;
        for (const b of bands) {
          const img = curtain(b.rgb);
          for (let x = 0; x < w; x += step) {
            const y = b.y + Math.sin(x * b.k1 + t * b.w1 + b.p) * b.amp + Math.sin(x * b.k2 - t * b.w2) * b.amp * 0.35;
            const hh = b.hgt * (0.75 + 0.25 * Math.sin(x * b.k2 * 0.7 + t * 0.8 + b.p));
            const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(x * b.kr + t * 1.4 + b.p)) * (0.6 + 0.4 * Math.sin(x * 0.21 + t * 0.6));
            ctx.globalAlpha = a; ctx.drawImage(img, x, y - hh, step + 0.6, hh);
          }
        }
      },
    };
  },

  // ---- the symbiote set (living black goo; opts.accent = the name color tints its rim light) ----
  tendrils(rand, opts) {
    // Goo gathers in the card's corners and along its sides; tendrils grow out of it and crawl along the edges, writhing
    // (a wave runs down each one), creeping in and drawing back. They keep to the edges so the card stays readable.
    const acc = rgbOf(opts.accent);
    let W = 0, H = 0, S = 1, masses = [], arms = [], paint = null;
    const arm = (x, y, th0, curl, len, wb) => ({ x, y, th0, curl, len, wb, amp: 0.28 + rand() * 0.22, k: 0.7 + rand() * 0.6, w: 1.4 + rand() * 1.2,
      p: rand() * TAU, cw: 0.35 + rand() * 0.35, cp: rand() * TAU, pts: [], L: [], R: [] });
    return {
      init(w, h) {
        W = w; H = h; S = gooScale(w, h); paint = null;
        const R = (v) => v * S;
        // corners, then one mass on each side
        masses = [[0, 0, R(46)], [w, 0, R(40)], [0, h, R(42)], [w, h, R(50)], [0, h * (0.4 + rand() * 0.15), R(24)], [w, h * (0.5 + rand() * 0.15), R(24)]]
          .map(([x, y, r]) => ({ x, y, r, p: rand() * TAU, p2: rand() * TAU }));
        const d = (deg) => (deg * Math.PI) / 180;
        arms = [
          arm(R(26), R(12), d(10), d(32), R(124), R(11)), arm(R(12), R(28), d(78), d(-36), R(104), R(10)),
          arm(w - R(22), R(12), d(170), d(-30), R(98), R(10)), arm(w - R(12), R(24), d(100), d(32), R(84), R(9)),
          // the bottom corners climb the sides (the card's buttons sit along the bottom edge)
          arm(R(12), h - R(26), d(-84), d(26), R(116), R(11)), arm(R(24), h - R(8), d(-38), d(-40), R(46), R(8)),
          arm(w - R(14), h - R(30), d(-96), d(-26), R(122), R(12)), arm(w - R(26), h - R(8), d(-142), d(40), R(48), R(8)),
          arm(R(8), masses[4].y - R(8), d(-64), d(-40), R(74), R(8)), arm(R(8), masses[4].y + R(8), d(62), d(40), R(66), R(7.5)),
          arm(w - R(8), masses[5].y - R(8), d(-116), d(40), R(76), R(8)), arm(w - R(8), masses[5].y + R(8), d(120), d(-36), R(62), R(7.5)),
        ];
      },
      step(dt, t) {
        for (const a of arms) {
          const N = 26, len = a.len * (0.74 + 0.26 * Math.sin(t * a.cw + a.cp)), ds = len / N;
          let x = a.x, y = a.y;
          a.pts.length = 0; a.L.length = 0; a.R.length = 0;
          a.pts.push([x, y]);
          for (let i = 1; i <= N; i++) {
            const s = i / N, th = a.th0 + a.curl * s * s + a.amp * s * Math.sin(a.k * s * TAU - t * a.w + a.p);
            x += Math.cos(th) * ds; y += Math.sin(th) * ds; a.pts.push([x, y]);
          }
          ribbonSides(a.pts, (s) => a.wb * (1 - s) ** 0.62 + 1.1 * S, a.L, a.R);
        }
      },
      draw(ctx, w, h, t) {
        if (!paint) paint = gooPaint(ctx, w, h, acc);
        const blobs = masses.map((m) => blobPts(m.x, m.y, m.r, t, m.p, m.p2));
        // rim light under every fill (only its outer half shows), then the goo, then light on top
        ctx.strokeStyle = paint.rim; ctx.lineWidth = 2 * S; ctx.lineJoin = 'round';
        for (const b of blobs) { closedPath(ctx, b); ctx.stroke(); }
        for (const a of arms) { ribbonPath(ctx, a.L, a.R); ctx.stroke(); }
        ctx.fillStyle = paint.body;
        for (const b of blobs) { closedPath(ctx, b); ctx.fill(); }
        for (const a of arms) { ribbonPath(ctx, a.L, a.R); ctx.fill(); }
        gooSheen(ctx, w, h, t, paint);
        ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
        for (const a of arms) {
          ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(0.9, a.wb * 0.16);
          litLine(ctx, a.pts, (s) => (a.wb * (1 - s) ** 0.62) * 0.5, 0.06, 0.78);
        }
        // a wet crescent on each mass, on the side facing the card's middle
        ctx.globalAlpha = 0.5; ctx.lineWidth = 1.8 * S;
        for (const m of masses) {
          const toC = Math.atan2(h / 2 - m.y, w / 2 - m.x);
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.78, toC - 0.5, toC + 0.1); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    };
  },

  goo(rand, opts) {
    // A lip of goo along the top of the card; drips run down the banner, swell, let a drop fall and spring back.
    const acc = rgbOf(opts.accent);
    let W = 0, H = 0, S = 1, BH = 120, drips = [], drops = [], paint = null, ph = 0;
    const lip = (x, t) => S * (15 + 4.5 * Math.sin(x * 0.028 / S + t * 0.5 + ph) + 3 * Math.sin(x * 0.07 / S - t * 0.8) + 1.4 * Math.sin(x * 0.17 / S + t * 1.3));
    const reset = (d, fresh) => {
      d.max = BH * (0.22 + rand() ** 1.4 * 0.7); d.r = S * (4.4 + rand() * 3); d.v = S * (9 + rand() * 12);
      d.len = fresh ? d.r * 1.3 + rand() * (d.max - d.r * 1.3) : d.r * 1.3; d.snap = 0;
    };
    return {
      init(w, h) {
        W = w; H = h; S = gooScale(w, h); BH = h > 260 ? 120 : h * 0.62; paint = null; ph = rand() * TAU; drops = [];
        const n = Math.max(3, Math.round(w / (44 * S)));
        drips = Array.from({ length: n }, (_, i) => { const d = { x: ((i + 0.5) / n) * w + (rand() - 0.5) * (w / n) * 0.5, p: rand() * TAU }; reset(d, true); return d; });
      },
      step(dt, t) {
        for (const d of drips) {
          if (d.snap > 0) { d.snap -= dt; d.len = Math.max(d.r * 1.3, d.len - 260 * S * dt); if (d.snap <= 0) reset(d, false); continue; }
          d.len += d.v * dt * (1.15 - (0.75 * d.len) / d.max);
          if (d.len >= d.max) {
            drops.push({ x: d.x + Math.sin(t * 1.3 + d.p) * 1.5 * S, y: lip(d.x, t) + d.len, vy: 20 * S, r: d.r * 0.85, life: 0 });
            d.snap = 0.35;
          }
        }
        for (const o of drops) { o.vy += 620 * S * dt; o.y += o.vy * dt; o.life += dt; }
        drops = drops.filter((o) => o.y < BH + 46 * S && o.life < 2);
      },
      draw(ctx, w, h, t) {
        if (!paint) paint = gooPaint(ctx, w * 0.3, BH * 1.1, acc);
        const shapes = [];
        // the lip: the top edge, then its wavy lower edge
        const lp = [];
        for (let x = -8; x <= w + 8; x += 8 * S) lp.push([x, lip(x, t)]);
        shapes.push((c) => { c.beginPath(); c.moveTo(-10, -10); c.lineTo(w + 10, -10); c.lineTo(w + 10, lp[lp.length - 1][1]); for (let i = lp.length - 1; i >= 0; i--) c.lineTo(lp[i][0], lp[i][1]); c.closePath(); });
        for (const d of drips) {
          const x = d.x + Math.sin(t * 1.3 + d.p) * 1.5 * S, y0 = lip(x, t) - 3, r = d.r * (0.62 + (0.38 * d.len) / d.max), len = Math.max(r * 1.3, d.len);
          shapes.push((c) => dripPath(c, x, y0, len, r));
        }
        for (const o of drops) shapes.push((c) => { c.beginPath(); c.moveTo(o.x, o.y - o.r * 2.6); c.quadraticCurveTo(o.x + o.r * 0.25, o.y - o.r, o.x + o.r, o.y); c.arc(o.x, o.y, o.r, 0, Math.PI); c.quadraticCurveTo(o.x - o.r * 0.25, o.y - o.r, o.x, o.y - o.r * 2.6); c.closePath(); });
        ctx.strokeStyle = paint.rim; ctx.lineWidth = 2 * S; ctx.lineJoin = 'round';
        for (const sh of shapes) { sh(ctx); ctx.stroke(); }
        ctx.fillStyle = paint.body;
        for (const sh of shapes) { sh(ctx); ctx.fill(); }
        gooSheen(ctx, w, h, t, paint);
        // wet light: along the lip, down each drip, a spot on each drop
        ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.4; ctx.lineWidth = 1.5 * S;
        ctx.beginPath(); for (let i = 0; i < lp.length; i++) { const [x, y] = lp[i]; if (i) ctx.lineTo(x, y - 4 * S); else ctx.moveTo(x, y - 4 * S); } ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const d of drips) {
          const x = d.x + Math.sin(t * 1.3 + d.p) * 1.5 * S, y0 = lip(x, t), r = d.r * (0.62 + (0.38 * d.len) / d.max), len = Math.max(r * 1.3, d.len);
          ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(0.9, r * 0.28);
          if (len > r * 2.4) { ctx.beginPath(); ctx.moveTo(x - r * 0.5, y0 + r * 0.6); ctx.lineTo(x - r * 0.42, y0 + len - r * 1.5); ctx.stroke(); }
          ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x - r * 0.38, y0 + len - r * 0.4, Math.max(0.8, r * 0.22), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 0.85;
        for (const o of drops) { ctx.beginPath(); ctx.arc(o.x - o.r * 0.35, o.y - o.r * 0.3, Math.max(0.7, o.r * 0.25), 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
      },
      still(t) { drops = []; for (const d of drips) if (d.snap > 0) reset(d, true); },
    };
  },

  // ---- earned (30-day streak) ----
  inferno(rand) {
    // Flames lick up from the bottom of the card: layered tongues (red, orange, gold, white-hot) that sway and leap,
    // flame wisps breaking off their tips, embers rising, a heat glow.
    let W = 0, H = 0, S = 1, tongues = [], wisps = [], embers = [], heat = null, nextWisp = 0;
    const ember = (e, anywhere) => {
      e.x = rand() * W; e.y = anywhere ? H * (0.3 + rand() * 0.7) : H + 4; e.vy = -(30 + rand() * 60) * S; e.vx = (rand() - 0.5) * 14 * S;
      e.life = 1.6 + rand() * 2.2; e.age = anywhere ? rand() * e.life : 0; e.s = (0.9 + rand() * 1.4) * Math.max(0.6, S); e.p = rand() * TAU; e.f = 7 + rand() * 9;
    };
    return {
      init(w, h) {
        W = w; H = h; S = Math.max(0.45, Math.min(1.1, Math.min(w / 340, h / 440) * 1.05)); heat = null; wisps = [];
        const n = Math.max(5, Math.round(w / (22 * S)));
        tongues = Array.from({ length: n }, (_, i) => ({ x: ((i + 0.5) / n) * w + (rand() - 0.5) * (w / n) * 0.6, bw: (30 + rand() * 18) * S,
          h0: Math.min(h * 0.24, (58 + rand() * 40) * S) * (i % 3 === 1 ? 1.22 : 1), f1: 1.6 + rand() * 1.4, f2: 3.4 + rand() * 2.6, f3: 0.9 + rand() * 0.9, p: rand() * TAU, p2: rand() * TAU }));
        embers = Array.from({ length: count(30, w, h) }, () => { const e = {}; ember(e, true); return e; });
      },
      step(dt, t) {
        if (t >= nextWisp) {
          const g = tongues[(rand() * tongues.length) | 0];
          wisps.push({ x: g.x + Math.sin(t * g.f3 + g.p) * g.bw * 0.3, y: H - g.h0 * 0.95, vy: -(70 + rand() * 60) * S, s: (7 + rand() * 7) * S, age: 0, life: 0.45 + rand() * 0.35 });
          nextWisp = t + 0.06 + rand() * 0.12;
        }
        for (const o of wisps) { o.age += dt; o.y += o.vy * dt; }
        wisps = wisps.filter((o) => o.age < o.life);
        for (const e of embers) {
          e.age += dt; e.x += (e.vx + Math.sin(t * 1.5 + e.p) * 16 * S) * dt; e.y += e.vy * dt;
          if (e.age > e.life || e.y < -10) ember(e, false);
        }
      },
      draw(ctx, w, h, t) {
        if (!heat) { heat = ctx.createLinearGradient(0, h * 0.5, 0, h); heat.addColorStop(0, 'rgba(255,70,10,0)'); heat.addColorStop(0.7, 'rgba(255,70,10,0.16)'); heat.addColorStop(1, 'rgba(255,110,20,0.4)'); }
        ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 2.3); ctx.fillStyle = heat; ctx.fillRect(0, h * 0.5, w, h * 0.5);
        ctx.globalCompositeOperation = 'lighter';
        const glowS = glow('#ff6a1a');
        for (const g of tongues) { ctx.globalAlpha = 0.32; ctx.drawImage(glowS, g.x - g.bw, h - g.bw * 0.9, g.bw * 2, g.bw * 1.8); }
        // translucent layers: added up they glow white-hot at the base but the card's buttons stay readable through them
        for (const [k, color, a] of [[1, '#ff3a14', 0.4], [0.74, '#ff7a1a', 0.4], [0.5, '#ffb43a', 0.36], [0.26, '#fff0b8', 0.3]]) {
          ctx.fillStyle = color; ctx.globalAlpha = a;
          for (const g of tongues) {
            const hh = g.h0 * k * (0.72 + 0.2 * Math.sin(t * g.f1 + g.p) + 0.1 * Math.sin(t * g.f2 + g.p2)), ww = g.bw * (0.45 + 0.55 * k);
            const sway = Math.sin(t * g.f3 + g.p) * g.bw * 0.32 + Math.sin(t * g.f2 * 0.7 + g.p2) * g.bw * 0.1;
            ctx.beginPath(); ctx.moveTo(g.x - ww / 2, h + 2);
            ctx.bezierCurveTo(g.x - ww * 0.58, h - hh * 0.42, g.x + sway * 0.4 - ww * 0.22, h - hh * 0.72, g.x + sway, h - hh);
            ctx.bezierCurveTo(g.x + sway * 0.4 + ww * 0.22, h - hh * 0.72, g.x + ww * 0.58, h - hh * 0.42, g.x + ww / 2, h + 2);
            ctx.closePath(); ctx.fill();
          }
        }
        for (const o of wisps) {
          const u = o.age / o.life, s = o.s * (1 - u * 0.7);
          ctx.globalAlpha = (1 - u) * 0.75; ctx.fillStyle = u < 0.4 ? '#ffb43a' : '#ff6a1a';
          ctx.beginPath(); ctx.moveTo(o.x, o.y - s * 1.6); ctx.quadraticCurveTo(o.x + s * 0.55, o.y, o.x, o.y + s * 0.5); ctx.quadraticCurveTo(o.x - s * 0.55, o.y, o.x, o.y - s * 1.6); ctx.fill();
        }
        const hot = glow('#ffd36b'), cool = glow('#ff5a1a');
        for (const e of embers) {
          const u = e.age / e.life, a = (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9) * (0.6 + 0.4 * Math.sin(t * e.f + e.p));
          if (a <= 0.02) continue;
          const s = e.s * 4;
          ctx.globalAlpha = a * 0.6; ctx.drawImage(u < 0.5 ? hot : cool, e.x - s, e.y - s, s * 2, s * 2);
          ctx.globalAlpha = a; ctx.fillStyle = '#fff3c4'; ctx.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s);
        }
      },
      still(t) { nextWisp = t; },
    };
  },
};

/** The maker of effect `id` (make(rand, opts) -> { init, step, draw, ... }), or null: for tests, which run them on a fake canvas. */
export const effectMaker = (id) => (EFFECTS.includes(id) && Object.prototype.hasOwnProperty.call(MAKE, id) ? MAKE[id] : null);

// ---- mounting ----
let io = null;
const onSight = new WeakMap();
function observer() {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver((entries) => { for (const e of entries) { const f = onSight.get(e.target); if (f) f(e.isIntersecting); } }, { rootMargin: '80px' });
  return io;
}
const motionQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null);

/**
 * Lays profile effect `id` over `el` (the profile card), replacing any effect it had. null / unknown id removes it.
 * opts.seed fixes the random layout (screenshots, tests); opts.accent (#rrggbb) tints the symbiote effects' rim light.
 * @returns {{ el: HTMLCanvasElement|null, stop(): void }}
 */
export function mountEffect(el, id, opts = {}) {
  const old = el.querySelector(':scope > .fp-effect');
  if (old && old._fpStop) old._fpStop();
  if (!EFFECTS.includes(id)) { el.classList.remove('fp-has-effect'); return { el: null, stop() {} }; }
  const cv = document.createElement('canvas');
  cv.className = 'fp-effect';
  cv.dataset.effect = id;
  cv.setAttribute('aria-hidden', 'true');
  el.classList.add('fp-has-effect');
  el.append(cv);
  const ctx = cv.getContext('2d');
  const fx = MAKE[id](seeded(opts.seed ?? Math.random() * 4294967296), { accent: opts.accent });
  const mq = motionQuery();
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, t = 0, acc = 0, visible = true, stopped = false;
  let reduced = !!(mq && mq.matches);

  const size = () => {
    const w = cv.clientWidth || el.clientWidth || 300, h = cv.clientHeight || el.clientHeight || 420;
    const d = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    if (w === W && h === H && d === dpr) return false;
    W = w; H = h; dpr = d;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    fx.init(W, H);
    return true;
  };
  const render = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    fx.draw(ctx, W, H, t, dpr);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  const frame = (now) => {
    raf = 0;
    if (stopped || !visible || reduced) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    raf = requestAnimationFrame(frame);
    if (fx.fps) { acc += dt; if (acc < 1 / fx.fps - 0.002) return; t += acc; fx.step(acc, t); acc = 0; }
    else { t += dt; fx.step(dt, t); }
    render();
  };
  const play = () => { if (!raf && !stopped && visible && !reduced) { last = 0; raf = requestAnimationFrame(frame); } };
  const pause = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const still = () => { // one settled frame: run the simulation ~3 s without drawing, then draw once
    fx.init(W, H); t = 0;
    for (let i = 0; i < 90; i++) { t += 1 / 30; fx.step(1 / 30, t); }
    if (fx.still) fx.still(t);
    render();
  };

  size();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (size()) { if (reduced) still(); else if (!raf) render(); } }) : null;
  if (ro) ro.observe(cv);
  const obs = observer();
  if (obs) { onSight.set(cv, (on) => { visible = on; if (on) play(); else pause(); }); obs.observe(cv); }
  const onMotion = () => { reduced = !!mq.matches; if (reduced) { pause(); still(); } else play(); };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMotion);
  if (reduced) still(); else play();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    pause();
    if (ro) ro.disconnect();
    if (obs) { obs.unobserve(cv); onSight.delete(cv); }
    if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotion);
    cv.remove();
    if (!el.querySelector(':scope > .fp-effect')) el.classList.remove('fp-has-effect');
  };
  cv._fpStop = stop;
  return { el: cv, stop };
}
