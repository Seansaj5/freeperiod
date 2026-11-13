// What the cockpit's screens show, drawn on canvases: the instrument cluster (live: revs, speed, gear, nitro) and the
// centre screen (drawn once). Each car picks a cluster kind and its colours in interiors.js.
//   twin     two round dials, revs left and speed right, a little display between
//   tach     a big rev counter in the middle with the gear inside it, small dials either side
//   single   one big speedometer (small cars)
//   retro    two deep white-faced dials (muscle cars)
//   ring     a screen: one glowing rev ring, the gear in the middle, speed under it
//   dual     a screen: two drawn dials with a map between
//   bar      a screen: a rev bar across the top, big speed, big gear (track cars)
//   hex      a screen: an angular rev band with a huge gear number
//   yellow   a big yellow rev counter between two small screens
//   ev       a screen: big speed, a power bar, battery
//   spark    the Claude Car: twelve rays that light with the revs
const TAU = Math.PI * 2;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const rgba = (n, a) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
const font = (px, w = 700, f = 'Outfit') => `${w} ${px}px ${f}, system-ui, sans-serif`;

/** state: { rpm, red (redline), gear (text), speed, unit, max (dial top), nitro 0..1, boost, manual, limiter, t, sport } */
export function drawCluster(g, W, H, st, s) {
  const c = { bg: 0x05060a, face: 0x0b0d12, ink: 0xe8ecf5, dim: 0x5d667a, acc: 0xff3b30, glow: 0x3de0ff, ...st };
  g.fillStyle = hex(c.bg); g.fillRect(0, 0, W, H);
  const rf = Math.min(1.04, s.rpm / s.red), shiftNow = rf > 0.93 && s.gear !== 'D' && s.gear !== 'P';
  const draw = KINDS[c.kind] || KINDS.twin;
  draw(g, W, H, c, s, rf);
  // shared: nitro bar along the bottom, manual tag, shift flash
  if (c.kind !== 'spark') {
    g.fillStyle = rgba(c.dim, 0.35); g.fillRect(W * 0.3, H - 9, W * 0.4, 4);
    g.fillStyle = s.boost ? '#ffffff' : hex(c.glow); g.fillRect(W * 0.3, H - 9, W * 0.4 * s.nitro, 4);
  }
  if (s.manual) { g.font = font(13, 800); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = hex(c.acc); g.fillText('MANUAL', 10, H - 8); }
  if (s.sport) { g.font = font(13, 800); g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillStyle = hex(c.acc); g.fillText('SPORT', W - 10, H - 8); }
  if (shiftNow && Math.floor(s.t * 14) % 2 === 0) { g.fillStyle = rgba(c.acc, 0.9); g.fillRect(0, 0, W, 7); }
}

/** A round analog dial. v 0..1 along the sweep; ticks: [count, label every n, label fn]. */
function dial(g, x, y, r, c, v, { a0 = Math.PI * 0.75, sweep = Math.PI * 1.5, ticks = 8, label = (i) => i, red = 2, face = c.face, ink = c.ink, small = false, ring = true } = {}) {
  g.fillStyle = hex(face); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  if (ring) { g.strokeStyle = rgba(c.dim, 0.7); g.lineWidth = Math.max(1.5, r * 0.035); g.beginPath(); g.arc(x, y, r - 1, 0, TAU); g.stroke(); }
  if (red > 0) { g.strokeStyle = hex(c.acc); g.lineWidth = r * 0.07; g.beginPath(); g.arc(x, y, r * 0.86, a0 + sweep * (1 - red / ticks), a0 + sweep); g.stroke(); }
  g.strokeStyle = hex(ink); g.fillStyle = hex(ink); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(Math.max(8, r * (small ? 0.2 : 0.17)), 700);
  for (let i = 0; i <= ticks * 2; i++) {
    const a = a0 + (i / (ticks * 2)) * sweep, major = i % 2 === 0, r0 = r * (major ? 0.74 : 0.8), r1 = r * 0.9;
    g.lineWidth = major ? Math.max(1.5, r * 0.03) : 1; g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke();
    if (major && !small) g.fillText(String(label(i / 2)), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58);
  }
  const a = a0 + Math.max(0, Math.min(1.03, v)) * sweep;
  g.strokeStyle = hex(c.needle ?? c.acc); g.lineWidth = Math.max(2, r * 0.045); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - Math.cos(a) * r * 0.14, y - Math.sin(a) * r * 0.14); g.lineTo(x + Math.cos(a) * r * 0.84, y + Math.sin(a) * r * 0.84); g.stroke(); g.lineCap = 'butt';
  g.fillStyle = '#16181d'; g.beginPath(); g.arc(x, y, r * 0.12, 0, TAU); g.fill();
}
function text(g, str, x, y, px, col, { w = 700, f = 'Outfit', align = 'center', base = 'middle' } = {}) { g.font = font(px, w, f); g.textAlign = align; g.textBaseline = base; g.fillStyle = col; g.fillText(str, x, y); }
const spd = (s) => String(Math.round(s.speed));
const speedTicks = (s) => { const step = s.max > 320 ? 50 : s.max > 200 ? 40 : 20, n = Math.ceil(s.max / step); return { n, top: n * step, label: (i) => i * step }; };
function arcBand(g, x, y, r, w, a0, a1, col) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); }

const KINDS = {
  twin(g, W, H, c, s, rf) {
    const r = H * 0.44, T = speedTicks(s);
    dial(g, W * 0.25, H * 0.52, r, c, rf * 0.925, { ticks: 8, label: (i) => i, red: 1 });
    dial(g, W * 0.75, H * 0.52, r, c, s.speed / T.top, { ticks: T.n, label: T.label, red: 0 });
    g.fillStyle = '#0a0f14'; g.beginPath(); g.roundRect(W * 0.5 - 34, H * 0.3, 68, H * 0.44, 8); g.fill();
    text(g, s.gear, W * 0.5, H * 0.45, 40, hex(c.glow), { f: 'Bungee', w: 400 });
    text(g, spd(s), W * 0.5, H * 0.63, 17, hex(c.ink)); text(g, s.unit, W * 0.5, H * 0.71, 9, hex(c.dim));
    text(g, 'x1000', W * 0.25, H * 0.78, 9, hex(c.dim)); text(g, s.unit, W * 0.75, H * 0.78, 9, hex(c.dim));
  },
  tach(g, W, H, c, s, rf) {
    const T = speedTicks(s);
    dial(g, W * 0.1, H * 0.56, H * 0.2, c, 0.5, { ticks: 4, red: 0, small: true });
    dial(g, W * 0.9, H * 0.56, H * 0.2, c, 0.62, { ticks: 4, red: 0, small: true });
    dial(g, W * 0.265, H * 0.54, H * 0.33, c, s.speed / T.top, { ticks: T.n, label: T.label, red: 0 });
    dial(g, W * 0.735, H * 0.54, H * 0.33, c, 0.45 + s.nitro * 0.4, { ticks: 4, label: (i) => ['', '', '', '', ''][i], red: 0 });
    dial(g, W * 0.5, H * 0.5, H * 0.47, c, rf * 0.925, { ticks: 8, red: 1, face: c.tachFace ?? c.face, ink: c.tachInk ?? c.ink });
    text(g, s.gear, W * 0.5, H * 0.7, 30, hex(c.tachInk ?? c.ink), { f: 'Bungee', w: 400 });
    text(g, spd(s), W * 0.5, H * 0.86, 15, hex(c.tachInk ?? c.ink));
  },
  single(g, W, H, c, s, rf) {
    const T = speedTicks(s);
    dial(g, W * 0.5, H * 0.56, H * 0.5, c, s.speed / T.top, { a0: Math.PI * 0.85, sweep: Math.PI * 1.3, ticks: T.n, label: T.label, red: 0 });
    g.fillStyle = '#0a0f14'; g.beginPath(); g.roundRect(W * 0.5 - 30, H * 0.66, 60, 26, 5); g.fill();
    text(g, `${s.gear}  ${(s.rpm / 1000).toFixed(1)}`, W * 0.5, H * 0.66 + 13, 14, hex(c.glow));
    for (let i = 0; i < 8; i++) { g.fillStyle = i / 8 < rf ? (i >= 6 ? hex(c.acc) : hex(c.glow)) : rgba(c.dim, 0.3); g.fillRect(W * 0.08, H * 0.82 - i * 20, 20, 14); g.fillRect(W * 0.92 - 20, H * 0.82 - i * 20, 20, 14); }
  },
  retro(g, W, H, c, s, rf) {
    const T = speedTicks(s), face = c.tachFace ?? 0xe9e4d6, ink = c.tachInk ?? 0x17181c;
    dial(g, W * 0.26, H * 0.52, H * 0.45, c, s.speed / T.top, { ticks: T.n, label: T.label, red: 0, face, ink });
    dial(g, W * 0.74, H * 0.52, H * 0.45, c, rf * 0.925, { ticks: 8, red: 1.5, face, ink });
    text(g, s.gear, W * 0.5, H * 0.5, 34, hex(c.glow), { f: 'Bungee', w: 400 });
    text(g, s.unit, W * 0.26, H * 0.78, 9, hex(ink)); text(g, 'RPM x1000', W * 0.74, H * 0.78, 9, hex(ink));
  },
  ring(g, W, H, c, s, rf) {
    const x = W * 0.5, y = H * 0.52, r = H * 0.42, a0 = Math.PI * 0.75, sw = Math.PI * 1.5;
    arcBand(g, x, y, r, 16, a0, a0 + sw, rgba(c.dim, 0.28));
    arcBand(g, x, y, r, 16, a0 + sw * 0.86, a0 + sw, rgba(c.acc, 0.45));
    arcBand(g, x, y, r, 16, a0, a0 + sw * Math.min(1, rf * 0.925), rf > 0.93 ? hex(c.acc) : hex(c.glow));
    for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * sw; text(g, String(i), x + Math.cos(a) * r * 0.74, y + Math.sin(a) * r * 0.74, 12, hex(c.dim)); }
    text(g, s.gear, x, y - 12, 62, hex(c.ink), { f: 'Bungee', w: 400 });
    text(g, spd(s), x, y + 44, 30, hex(c.ink)); text(g, s.unit, x, y + 68, 10, hex(c.dim));
    panel(g, 14, H * 0.2, W * 0.22, H * 0.56, c, 'G', s); panel(g, W - 14 - W * 0.22, H * 0.2, W * 0.22, H * 0.56, c, 'MAP', s);
  },
  dual(g, W, H, c, s, rf) {
    const T = speedTicks(s), r = H * 0.42;
    for (const [x, v, lab, n, fn, red] of [[W * 0.2, s.speed / T.top, spd(s), T.n, T.label, 0], [W * 0.8, rf * 0.925, s.gear, 8, (i) => i, 1]]) {
      const a0 = Math.PI * 0.75, sw = Math.PI * 1.5;
      arcBand(g, x, H * 0.52, r, 5, a0, a0 + sw, rgba(c.dim, 0.5));
      if (red) arcBand(g, x, H * 0.52, r, 5, a0 + sw * 0.875, a0 + sw, hex(c.acc));
      arcBand(g, x, H * 0.52, r - 9, 10, a0, a0 + sw * Math.max(0, Math.min(1, v)), rgba(c.glow, 0.85));
      for (let i = 0; i <= n; i += n > 9 ? 2 : 1) { const a = a0 + (i / n) * sw; text(g, String(fn(i)), x + Math.cos(a) * r * 0.68, H * 0.52 + Math.sin(a) * r * 0.68, 11, hex(c.ink)); }
      text(g, lab, x, H * 0.52, 40, hex(c.ink), { f: 'Bungee', w: 400 });
    }
    panel(g, W * 0.36, H * 0.14, W * 0.28, H * 0.66, c, 'MAP', s);
  },
  bar(g, W, H, c, s, rf) {
    const n = 24, x0 = 22, bw = (W - 44) / n;
    for (let i = 0; i < n; i++) { const on = i / n < rf * 0.925, hot = i >= n * 0.84; g.fillStyle = on ? (hot ? hex(c.acc) : i >= n * 0.62 ? '#ffd23a' : hex(c.glow)) : rgba(c.dim, 0.22); g.fillRect(x0 + i * bw, 20 + (n - i) * 0.9, bw - 3, 34 - (n - i) * 0.9); }
    text(g, s.gear, W * 0.5, H * 0.58, 92, hex(c.ink), { f: 'Bungee', w: 400 });
    text(g, spd(s), W * 0.2, H * 0.56, 54, hex(c.ink), { f: 'Bungee', w: 400 }); text(g, s.unit, W * 0.2, H * 0.78, 12, hex(c.dim));
    text(g, `${Math.round(s.rpm / 10) * 10}`, W * 0.8, H * 0.52, 30, hex(c.ink)); text(g, 'RPM', W * 0.8, H * 0.7, 12, hex(c.dim));
  },
  hex(g, W, H, c, s, rf) {
    const n = 20;
    g.save(); g.translate(W * 0.5, H * 0.62);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = Math.PI * (1.08 + u * 0.84), on = u < rf * 0.925, hot = u > 0.84;
      g.save(); g.rotate(a); g.fillStyle = on ? (hot ? hex(c.acc) : hex(c.glow)) : rgba(c.dim, 0.22); g.beginPath(); g.moveTo(H * 0.42, -7); g.lineTo(H * 0.56, -9); g.lineTo(H * 0.56, 9); g.lineTo(H * 0.42, 7); g.fill(); g.restore();
    }
    g.restore();
    g.strokeStyle = rgba(c.glow, 0.5); g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; g.lineTo(W * 0.5 + Math.cos(a) * H * 0.3, H * 0.62 + Math.sin(a) * H * 0.3); } g.closePath(); g.stroke();
    text(g, s.gear, W * 0.5, H * 0.6, 70, hex(c.ink), { f: 'Bungee', w: 400 });
    text(g, spd(s), W * 0.14, H * 0.5, 44, hex(c.ink), { f: 'Bungee', w: 400 }); text(g, s.unit, W * 0.14, H * 0.7, 11, hex(c.dim));
    text(g, `${(s.rpm / 1000).toFixed(1)}`, W * 0.86, H * 0.5, 36, hex(c.ink)); text(g, 'x1000 RPM', W * 0.86, H * 0.7, 10, hex(c.dim));
  },
  yellow(g, W, H, c, s, rf) {
    panel(g, 10, H * 0.16, W * 0.27, H * 0.66, c, 'G', s); panel(g, W - 10 - W * 0.27, H * 0.16, W * 0.27, H * 0.66, c, 'SPD', s);
    dial(g, W * 0.5, H * 0.5, H * 0.47, { ...c, needle: 0xd01a1a }, rf * 0.925, { ticks: 9, label: (i) => i, red: 1, face: 0xf7c400, ink: 0x15161a });
    g.fillStyle = '#15161a'; g.beginPath(); g.roundRect(W * 0.5 - 20, H * 0.66, 40, 32, 5); g.fill();
    text(g, s.gear, W * 0.5, H * 0.66 + 17, 24, '#f7c400', { f: 'Bungee', w: 400 });
  },
  ev(g, W, H, c, s) {
    text(g, spd(s), W * 0.5, H * 0.42, 96, hex(c.ink), { w: 600 }); text(g, s.unit, W * 0.5, H * 0.68, 14, hex(c.dim));
    const p = s.load ? Math.min(1, 0.25 + s.speed / s.max) : -0.3 * Math.min(1, s.speed / 80);
    g.fillStyle = rgba(c.dim, 0.3); g.fillRect(W * 0.2, H * 0.8, W * 0.6, 6);
    g.fillStyle = p > 0 ? hex(c.glow) : '#6dff8a'; g.fillRect(W * 0.5, H * 0.8, W * 0.3 * p, 6);
    text(g, s.gear, W * 0.1, H * 0.3, 26, hex(c.ink)); text(g, '82%', W * 0.9, H * 0.3, 18, '#6dff8a');
    g.strokeStyle = '#6dff8a'; g.lineWidth = 2; g.strokeRect(W * 0.86, H * 0.42, 38, 16); g.fillStyle = '#6dff8a'; g.fillRect(W * 0.86 + 3, H * 0.42 + 3, 26, 10);
  },
  spark(g, W, H, c, s, rf) {
    const x = W * 0.5, y = H * 0.5, n = 12, lit = Math.round(Math.min(1, rf * 0.925) * n * 2) / 2;
    const gr = g.createRadialGradient(x, y, 10, x, y, H * 0.62); gr.addColorStop(0, rgba(c.glow, 0.16 + 0.1 * rf)); gr.addColorStop(1, rgba(c.glow, 0));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / n) * TAU - TAU / (2 * n) + 0.26, long = i % 2 === 0, r0 = H * 0.25, r1 = H * (long ? 0.47 : 0.39), on = i < lit, hot = i >= n - 2;
      g.strokeStyle = on ? (hot ? hex(c.acc) : hex(c.glow)) : rgba(c.dim, 0.3); g.lineWidth = long ? 13 : 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke();
    }
    g.lineCap = 'butt';
    text(g, s.gear, x, y + 2, 58, hex(c.ink), { f: 'Georgia', w: 600 });
    text(g, spd(s), W * 0.14, H * 0.46, 50, hex(c.ink), { f: 'Georgia', w: 600 }); text(g, s.unit.toLowerCase(), W * 0.14, H * 0.68, 13, hex(c.dim));
    text(g, s.boost ? 'thinking fast…' : s.limiter ? 'shift, please' : 'all clear', W * 0.86, H * 0.42, 14, hex(c.ink), { f: 'Georgia', w: 400 });
    g.fillStyle = rgba(c.dim, 0.3); g.beginPath(); g.roundRect(W * 0.76, H * 0.56, W * 0.2, 8, 4); g.fill();
    g.fillStyle = hex(c.glow); g.beginPath(); g.roundRect(W * 0.76, H * 0.56, Math.max(8, W * 0.2 * s.nitro), 8, 4); g.fill();
    text(g, 'nitro', W * 0.86, H * 0.72, 11, hex(c.dim), { f: 'Georgia', w: 400 });
  },
};

/** A small info panel on a screen cluster: 'G' (g meter), 'MAP', 'SPD'. */
function panel(g, x, y, w, h, c, kind, s) {
  g.fillStyle = rgba(c.dim, 0.12); g.beginPath(); g.roundRect(x, y, w, h, 8); g.fill();
  const cx = x + w / 2, cy = y + h / 2;
  if (kind === 'G') {
    g.strokeStyle = rgba(c.dim, 0.7); g.lineWidth = 1; for (const r of [0.2, 0.36]) { g.beginPath(); g.arc(cx, cy, h * r, 0, TAU); g.stroke(); }
    g.beginPath(); g.moveTo(cx - h * 0.4, cy); g.lineTo(cx + h * 0.4, cy); g.moveTo(cx, cy - h * 0.4); g.lineTo(cx, cy + h * 0.4); g.stroke();
    g.fillStyle = hex(c.acc); g.beginPath(); g.arc(cx - (s.gx || 0) * h * 0.3, cy + (s.gz || 0) * h * 0.3, 5, 0, TAU); g.fill();
  } else if (kind === 'MAP') {
    g.save(); g.beginPath(); g.roundRect(x, y, w, h, 8); g.clip();
    g.strokeStyle = rgba(c.dim, 0.55); g.lineWidth = 2;
    const o = (s.t * 14) % 26;
    for (let i = -1; i < 6; i++) { g.beginPath(); g.moveTo(x, y + i * 26 + o); g.lineTo(x + w, y + i * 26 + o + 10); g.stroke(); }
    g.strokeStyle = hex(c.glow); g.lineWidth = 5; g.beginPath(); g.moveTo(cx, y + h); g.lineTo(cx, y); g.stroke();
    g.fillStyle = hex(c.ink); g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx + 7, cy + 8); g.lineTo(cx - 7, cy + 8); g.fill();
    g.restore();
  } else {
    text(g, spd(s), cx, cy - 4, 38, hex(c.ink), { f: 'Bungee', w: 400 }); text(g, s.unit, cx, cy + 26, 10, hex(c.dim));
  }
}

/**
 * The centre screen, drawn once. kind: 'nav' | 'media' | 'tiles' | 'perf' | 'radio' | 'spark' | 'ev'.
 * st: { bg, ink, dim, glow, acc }.
 */
export function drawScreen(g, W, H, kind, st) {
  const c = { bg: 0x070a10, ink: 0xe8ecf5, dim: 0x56607a, glow: 0x3de0ff, acc: 0xff3b30, ...st };
  g.fillStyle = hex(c.bg); g.fillRect(0, 0, W, H);
  const bar = () => { g.fillStyle = rgba(c.dim, 0.25); g.fillRect(0, 0, W, 20); text(g, '9:41', W - 8, 11, 11, hex(c.ink), { align: 'right' }); text(g, '21°', 8, 11, 11, hex(c.ink), { align: 'left' }); };
  if (kind === 'radio') { // a little LCD
    g.fillStyle = '#0d1a14'; g.fillRect(0, 0, W, H);
    text(g, '88.5', W * 0.42, H * 0.5, H * 0.5, '#7dffb0', { f: 'Bungee', w: 400 }); text(g, 'FM', W * 0.86, H * 0.36, H * 0.2, '#7dffb0'); text(g, '9:41', W * 0.86, H * 0.7, H * 0.2, '#7dffb0');
    return;
  }
  if (kind === 'spark') {
    const gr = g.createRadialGradient(W / 2, H * 0.42, 6, W / 2, H * 0.42, H * 0.8); gr.addColorStop(0, rgba(c.glow, 0.22)); gr.addColorStop(1, rgba(c.glow, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = hex(c.glow); g.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.26, l = i % 2 ? 0.14 : 0.2; g.lineWidth = i % 2 ? 6 : 8; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * H * 0.05, H * 0.4 + Math.sin(a) * H * 0.05); g.lineTo(W / 2 + Math.cos(a) * H * l, H * 0.4 + Math.sin(a) * H * l); g.stroke(); }
    g.lineCap = 'butt';
    text(g, 'Ready when you are.', W / 2, H * 0.74, 17, hex(c.ink), { f: 'Georgia', w: 400 });
    text(g, 'Mind the gaps. I’ll watch the revs.', W / 2, H * 0.87, 11, hex(c.dim), { f: 'Georgia', w: 400 });
    return;
  }
  bar();
  if (kind === 'nav' || kind === 'ev') {
    g.save(); g.beginPath(); g.rect(0, 20, W, H - 20); g.clip();
    g.strokeStyle = rgba(c.dim, 0.5); g.lineWidth = 3;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(-10, 30 + i * 34); g.lineTo(W + 10, 10 + i * 34 + (i % 3) * 12); g.stroke(); g.beginPath(); g.moveTo(20 + i * 46, 20); g.lineTo(i * 46 - 20 + (i % 2) * 30, H); g.stroke(); }
    g.fillStyle = rgba(c.dim, 0.16); g.fillRect(W * 0.1, H * 0.34, W * 0.2, H * 0.2); g.fillRect(W * 0.6, H * 0.56, W * 0.26, H * 0.2);
    g.strokeStyle = hex(c.glow); g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath(); g.moveTo(W * 0.5, H); g.lineTo(W * 0.5, H * 0.62); g.lineTo(W * 0.68, H * 0.44); g.lineTo(W * 0.66, H * 0.2); g.stroke();
    g.fillStyle = hex(c.ink); g.beginPath(); g.moveTo(W * 0.5, H * 0.74); g.lineTo(W * 0.5 + 9, H * 0.74 + 20); g.lineTo(W * 0.5 - 9, H * 0.74 + 20); g.fill();
    g.restore();
    g.fillStyle = rgba(c.bg, 0.86); g.beginPath(); g.roundRect(8, 28, W * 0.44, 44, 8); g.fill();
    text(g, '1.2 km', 18, 44, 16, hex(c.ink), { align: 'left' }); text(g, 'Expressway East', 18, 61, 10, hex(c.dim), { align: 'left' });
    if (kind === 'ev') { g.fillStyle = rgba(c.bg, 0.86); g.fillRect(0, H - 44, W, 44); for (let i = 0; i < 5; i++) { g.fillStyle = rgba(c.dim, 0.5); g.beginPath(); g.arc(W * (0.14 + i * 0.18), H - 22, 11, 0, TAU); g.fill(); } }
  } else if (kind === 'media') {
    const gr = g.createLinearGradient(16, 34, 16 + H * 0.5, 34 + H * 0.5); gr.addColorStop(0, hex(c.glow)); gr.addColorStop(1, hex(c.acc));
    g.fillStyle = gr; g.beginPath(); g.roundRect(16, 34, H * 0.5, H * 0.5, 8); g.fill();
    text(g, 'Night Drive', 28 + H * 0.5, 54, 16, hex(c.ink), { align: 'left' }); text(g, 'The Overpass', 28 + H * 0.5, 74, 11, hex(c.dim), { align: 'left' });
    g.fillStyle = rgba(c.dim, 0.4); g.fillRect(16, H - 40, W - 32, 4); g.fillStyle = hex(c.glow); g.fillRect(16, H - 40, (W - 32) * 0.38, 4);
    for (let i = 0; i < 3; i++) { g.fillStyle = hex(c.ink); g.beginPath(); g.arc(W * (0.38 + i * 0.12), H - 20, i === 1 ? 9 : 6, 0, TAU); g.fill(); }
  } else if (kind === 'perf') {
    text(g, 'TRACK', 12, 38, 12, hex(c.acc), { align: 'left', w: 800 });
    g.strokeStyle = rgba(c.dim, 0.7); g.lineWidth = 1.5; for (const r of [0.14, 0.26]) { g.beginPath(); g.arc(W * 0.28, H * 0.6, H * r, 0, TAU); g.stroke(); }
    g.fillStyle = hex(c.acc); g.beginPath(); g.arc(W * 0.31, H * 0.56, 5, 0, TAU); g.fill();
    text(g, '1:42.6', W * 0.72, H * 0.42, 28, hex(c.ink), { f: 'Bungee', w: 400 }); text(g, 'BEST LAP', W * 0.72, H * 0.58, 10, hex(c.dim));
    for (let i = 0; i < 4; i++) { g.fillStyle = rgba(c.dim, 0.3); g.fillRect(W * 0.54, H * 0.68 + i * 12, W * 0.36, 7); g.fillStyle = hex(c.glow); g.fillRect(W * 0.54, H * 0.68 + i * 12, W * 0.36 * [0.8, 0.62, 0.9, 0.45][i], 7); }
  } else { // tiles
    const cols = [c.glow, c.acc, 0x6dff8a, 0xffb020, 0xb48cff, 0xe8ecf5];
    for (let i = 0; i < 6; i++) { const x = 16 + (i % 3) * ((W - 32) / 3), y = 32 + Math.floor(i / 3) * ((H - 44) / 2); g.fillStyle = rgba(cols[i], 0.2); g.beginPath(); g.roundRect(x, y, (W - 32) / 3 - 8, (H - 44) / 2 - 8, 10); g.fill(); g.fillStyle = hex(cols[i]); g.beginPath(); g.arc(x + ((W - 32) / 3 - 8) / 2, y + ((H - 44) / 2 - 8) / 2, 12, 0, TAU); g.fill(); }
  }
}
