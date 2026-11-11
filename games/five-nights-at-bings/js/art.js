// Everything you see is drawn here on a 1280x720 canvas: the robots, the rooms, the office.
const TAU = Math.PI * 2;
export const OFFICE_W = 1760;

function shade(hex, d) {
  const n = parseInt(hex.slice(1), 16), k = Math.max(0, 1 - d);
  return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`;
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function el(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
function limb(c, pts, w) { c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.stroke(); }
function text(c, s, x, y, size, col, font = 'Bungee', align = 'center') { c.font = `${size}px ${font}, sans-serif`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, x, y); }
function neon(c, s, x, y, size, col, t, seed = 0) {
  const fl = Math.sin(t * 13 + seed) > -0.93 ? 1 : 0.25;
  c.save(); c.globalAlpha *= fl; c.shadowColor = col; c.shadowBlur = 22; text(c, s, x, y, size, col); c.shadowBlur = 6; text(c, s, x, y, size, '#fff'); c.restore();
}

// ---------- the robots ----------
const BOTS = {
  bing: { body: '#6fbf2a', plate: '#e9f2c9', head: '#7fd138', eye: '#fff27a', w: 1, hw: 1.08 },
  dylan: { body: '#2f5fc4', plate: '#c9d8f2', head: '#3d73de', eye: '#ff5a4a', w: 0.82, hw: 0.95, sx: 0.92, sy: 1.1 },
  gavin: { body: '#e8862a', plate: '#ffe2b8', head: '#f29a3e', eye: '#ffe9a8', w: 1.8, hw: 1.25, belly: 102 },
  sal: { body: '#7a1f2b', plate: '#e8d9c0', head: '#c47a3a', eye: '#9dff6a', w: 0.95, hw: 1 },
};

export function drawBot(c, who, x, y, s, o = {}) {
  if (who === 'twins') return drawTwins(c, x, y - 300 * s, s, o);
  if (who === 'tokens') return drawTokens(c, x, y - 170 * s, s, o);
  const B = BOTS[who], d = o.dark || 0, S = h => shade(h, d), W = B.w, hw = 60 * B.hw, sx = 58 * W;
  c.save(); c.translate(x, y); c.scale(s * (o.flip ? -1 : 1) * (B.sx || 1), s * (B.sy || 1)); if (o.lean) c.rotate(o.lean);
  const jt = S('#2a2d33');
  c.fillStyle = S('#1c1e22'); el(c, -30 * W, -4, 30, 12); el(c, 30 * W, -4, 30, 12);
  c.strokeStyle = S(B.body); limb(c, [[-30 * W, -110], [-30 * W, -14]], 30); limb(c, [[30 * W, -110], [30 * W, -14]], 30);
  c.fillStyle = jt; el(c, -30 * W, -62, 13, 13); el(c, 30 * W, -62, 13, 13);
  // left arm hangs
  c.strokeStyle = S(B.body); limb(c, [[-sx, -238], [-sx - 22, -178], [-sx - 12, -118]], 24);
  c.fillStyle = jt; el(c, -sx - 22, -178, 11, 11); c.fillStyle = S(B.plate); el(c, -sx - 12, -110, 15, 15);
  // torso
  const by = B.belly || 82;
  c.fillStyle = S(B.body); el(c, 0, -185, 62 * W, by);
  c.fillStyle = S(B.plate); el(c, 0, -172, 40 * W, by * 0.62);
  if (who === 'bing') { c.fillStyle = S('#ffd23a'); star(c, 0, -180, 26); }
  if (who === 'gavin') { c.fillStyle = S('#f6f2ea'); rr(c, -62, -235, 124, 130, 12); text(c, 'EAT', 0, -170, 34, S('#c0392b')); }
  if (who === 'sal') { c.fillStyle = S(B.body); c.beginPath(); c.moveTo(-58, -250); c.lineTo(-8, -150); c.lineTo(-40, -110); c.lineTo(-60, -150); c.fill(); c.beginPath(); c.moveTo(58, -250); c.lineTo(8, -150); c.lineTo(40, -110); c.lineTo(60, -150); c.fill(); c.fillStyle = S('#c0392b'); c.beginPath(); c.moveTo(-7, -255); c.lineTo(7, -255); c.lineTo(12, -180); c.lineTo(0, -165); c.lineTo(-10, -182); c.fill(); }
  if (who === 'dylan') { c.strokeStyle = S('#f4f4f4'); c.lineWidth = 5; c.beginPath(); c.moveTo(-20, -250); c.lineTo(0, -215); c.lineTo(20, -250); c.stroke(); }
  // right arm holds the prop up
  const hx = sx + 10, hy = -238;
  c.strokeStyle = S(B.body); limb(c, [[sx, -238], [sx + 34, -188], [hx, hy + 8]], 24);
  c.fillStyle = jt; el(c, sx + 34, -188, 11, 11);
  item(c, who, hx, hy, S, o);
  c.fillStyle = S(B.plate); el(c, hx, hy + 8, 15, 15);
  // neck + head
  c.fillStyle = jt; c.fillRect(-12, -277, 24, 18);
  const j = (o.jaw || 0) * 36;
  c.fillStyle = S(B.head); rr(c, -hw, -376, hw * 2, 84, 30);
  c.fillStyle = '#050505'; rr(c, -hw + 10, -302, hw * 2 - 20, 18 + j, 6);
  c.fillStyle = S(B.head); rr(c, -hw + 6, -288 + j, hw * 2 - 12, 24, 10);
  c.fillStyle = S('#e8e4d4');
  for (let i = 0; i < 6; i++) { const tx = -hw + 16 + i * ((hw * 2 - 44) / 5); c.fillRect(tx, -302, 9, 9); c.fillRect(tx, -296 + j, 9, 9); }
  c.fillStyle = S(B.plate); el(c, 0, -314, 12, 8);
  // eyes
  for (const e of [-1, 1]) {
    c.fillStyle = '#050505'; el(c, e * 27, -340, 18, 18);
    c.fillStyle = S('#d8d8d0'); el(c, e * 27, -340, 12, 12);
    c.fillStyle = o.eyes ? B.eye : '#050505'; el(c, e * 27, -340, o.eyes ? 6 : 5, o.eyes ? 6 : 5);
    c.strokeStyle = S('#1a1a1a'); c.lineWidth = 7; c.beginPath(); c.moveTo(e * 46, -366); c.lineTo(e * 10, -356); c.stroke();
  }
  if (who === 'sal') { c.fillStyle = S(B.head); c.fillRect(8, -360, 40, 16); c.fillStyle = S('#1a1a1a'); el(c, -13, -305, 14, 6); el(c, 13, -305, 14, 6); }
  if (o.eyes) {
    c.globalCompositeOperation = 'lighter';
    for (const e of [-1, 1]) { const g = c.createRadialGradient(e * 27, -340, 2, e * 27, -340, 46); g.addColorStop(0, B.eye); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.55; c.fillStyle = g; el(c, e * 27, -340, 46, 46); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  hat(c, who, hw, S);
  c.restore();
}
function star(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.fill(); }
function item(c, who, x, y, S, o) {
  if (who === 'bing') { c.strokeStyle = S('#777'); limb(c, [[x, y + 10], [x + 4, y - 30]], 9); c.fillStyle = S('#222'); el(c, x + 5, y - 42, 15, 17); }
  if (who === 'dylan') { c.strokeStyle = S('#d9b27a'); limb(c, [[x - 4, y + 12], [x - 26, y - 62]], 6); limb(c, [[x + 4, y + 12], [x + 22, y - 66]], 6); }
  if (who === 'gavin') { c.fillStyle = S('#d99a3c'); c.beginPath(); c.arc(x + 4, y - 22, 34, Math.PI, 0); c.fill(); c.fillStyle = S('#5a2d12'); rr(c, x - 32, y - 22, 72, 12, 5); c.fillStyle = S('#6fbf2a'); c.fillRect(x - 34, y - 12, 76, 5); c.fillStyle = S('#d99a3c'); rr(c, x - 30, y - 8, 68, 14, 6); }
  if (who === 'sal') {
    const f = o.bottle == null ? 1 : o.bottle;
    c.fillStyle = S('#1f5d33'); rr(c, x - 13, y - 62, 26, 66, 6); c.fillRect(x - 5, y - 92, 10, 34);
    c.fillStyle = S('#d9a13a'); c.fillRect(x - 10, y - 2 - 56 * f, 20, 56 * f);
    c.fillStyle = S('#f1ead8'); c.fillRect(x - 13, y - 42, 26, 22); text(c, 'XXX', x, y - 30, 10, S('#7a1f2b'));
    c.fillStyle = S('#caa24a'); c.fillRect(x - 6, y - 96, 12, 6);
  }
}
function hat(c, who, hw, S) {
  if (who === 'bing') { c.fillStyle = S('#4c9a16'); c.beginPath(); c.arc(0, -370, hw - 4, Math.PI, 0); c.fill(); rr(c, 10, -378, hw + 22, 12, 6); c.fillStyle = S('#f4f4e8'); c.beginPath(); c.arc(0, -370, 26, Math.PI, 0); c.fill(); text(c, 'B', 0, -384, 22, S('#4c9a16')); }
  if (who === 'dylan') { c.fillStyle = S('#14161c'); for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 15 - 12, -370); c.lineTo(i * 17, -412 - (i % 2 ? 0 : 12)); c.lineTo(i * 15 + 12, -370); c.fill(); } c.strokeStyle = S('#e23d3d'); c.lineWidth = 8; c.beginPath(); c.arc(0, -350, hw + 6, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); c.fillStyle = S('#e23d3d'); rr(c, -hw - 14, -358, 18, 40, 7); rr(c, hw - 4, -358, 18, 40, 7); }
  if (who === 'gavin') { c.fillStyle = S('#f6f2ea'); el(c, -32, -412, 30, 28); el(c, 32, -412, 30, 28); el(c, 0, -424, 34, 30); c.fillRect(-46, -400, 92, 30); }
  if (who === 'sal') { c.fillStyle = S('#111'); c.beginPath(); c.arc(0, -362, hw - 2, Math.PI, 0); c.fill(); c.fillRect(-hw + 2, -364, 24, 18); }
}

// Lana (pigtails) and Laith (cap): two wind-up dolls. Drawn as a pair of heads.
function dollHead(c, x, y, r, boy, o) {
  const S = h => shade(h, o.dark || 0);
  if (!boy) { c.fillStyle = S('#2b1d14'); el(c, x - r * 1.05, y - r * 0.2, r * 0.42, r * 0.5); el(c, x + r * 1.05, y - r * 0.2, r * 0.42, r * 0.5); c.fillStyle = S('#2ec4b6'); el(c, x - r * 0.8, y - r * 0.55, r * 0.2, r * 0.14); el(c, x + r * 0.8, y - r * 0.55, r * 0.2, r * 0.14); }
  c.fillStyle = S('#efe6d8'); el(c, x, y, r, r * 1.05);
  c.fillStyle = S(boy ? '#2ec4b6' : '#2b1d14'); c.beginPath(); c.arc(x, y - r * 0.25, r * 1.0, Math.PI * 1.05, Math.PI * 1.95); c.fill();
  if (boy) rr(c, x + r * 0.2, y - r * 0.62, r * 1.05, r * 0.2, 6);
  c.fillStyle = S('#e59aa0'); el(c, x - r * 0.58, y + r * 0.3, r * 0.2, r * 0.14); el(c, x + r * 0.58, y + r * 0.3, r * 0.2, r * 0.14);
  for (const e of [-1, 1]) { c.fillStyle = '#050505'; el(c, x + e * r * 0.38, y - r * 0.02, r * 0.26, r * 0.3); c.fillStyle = o.eyes ? '#fff' : S('#555'); el(c, x + e * r * 0.38, y - r * 0.02, r * 0.07, r * 0.07); }
  const j = (o.jaw || 0) * r * 0.3;
  c.fillStyle = '#050505'; c.beginPath(); c.ellipse(x, y + r * 0.5, r * 0.5, r * 0.1 + j, 0, 0, TAU); c.fill();
  c.strokeStyle = S('#efe6d8'); c.lineWidth = Math.max(1, r * 0.035);
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(x + i * r * 0.13, y + r * 0.4 - j); c.lineTo(x + i * r * 0.13, y + r * 0.6 + j); c.stroke(); }
  if (o.eyes) { c.globalCompositeOperation = 'lighter'; for (const e of [-1, 1]) { const g = c.createRadialGradient(x + e * r * 0.38, y, 1, x + e * r * 0.38, y, r * 0.5); g.addColorStop(0, 'rgba(160,255,240,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; el(c, x + e * r * 0.38, y, r * 0.5, r * 0.5); } c.globalCompositeOperation = 'source-over'; }
}
function drawTwins(c, x, y, s, o) { dollHead(c, x - 78 * s, y, 70 * s, false, o); dollHead(c, x + 78 * s, y + 8 * s, 70 * s, true, o); }

function drawTokens(c, x, y, s, o) {
  const S = h => shade(h, o.dark || 0);
  c.save(); c.translate(x, y); c.scale(s, s);
  c.strokeStyle = S('#6b6b6b'); limb(c, [[-95, 0], [-150, 50], [-135, 110]], 14); limb(c, [[95, 0], [150, 50], [135, 110]], 14);
  c.strokeStyle = S('#b9b9b9'); for (const e of [-1, 1]) { limb(c, [[e * 135, 110], [e * 150, 140]], 7); limb(c, [[e * 135, 110], [e * 118, 140]], 7); }
  c.fillStyle = S('#c79a1e'); rr(c, -100, -90, 200, 190, 18);
  c.fillStyle = S('#8a6a10'); rr(c, -84, -74, 168, 80, 10);
  const j = (o.jaw || 0) * 30;
  c.fillStyle = '#050505'; rr(c, -60, 26, 120, 22 + j, 6);
  c.fillStyle = S('#e8e4d4'); for (let i = 0; i < 7; i++) { c.fillRect(-54 + i * 16, 26, 10, 9); c.fillRect(-54 + i * 16, 39 + j, 10, 9); }
  text(c, '25¢', 0, 78, 20, S('#3b2c05'));
  for (const e of [-1, 1]) { c.fillStyle = '#050505'; el(c, e * 40, -34, 26, 26); c.fillStyle = o.eyes ? '#ff3b2f' : S('#7a1a14'); el(c, e * 40, -34, 13, 13); }
  if (o.eyes) { c.globalCompositeOperation = 'lighter'; for (const e of [-1, 1]) { const g = c.createRadialGradient(e * 40, -34, 2, e * 40, -34, 60); g.addColorStop(0, 'rgba(255,60,40,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; el(c, e * 40, -34, 60, 60); } c.globalCompositeOperation = 'source-over'; }
  c.restore();
}

// The music box: a striped gift box with a crank. Open = they are awake.
export function drawBox(c, x, y, s, o) {
  const S = h => shade(h, o.dark || 0);
  c.save(); c.translate(x, y); c.scale(s, s);
  if (o.awake) { c.fillStyle = S('#1c7f76'); c.save(); c.translate(-120, -150); c.rotate(-1.1); rr(c, -10, -34, 240, 34, 6); c.restore(); drawTwins(c, 0, -190 - Math.abs(Math.sin(o.t * 9)) * 6, 0.62, { dark: o.dark, eyes: true, jaw: 0.6 }); }
  for (let i = 0; i < 8; i++) { c.fillStyle = S(i % 2 ? '#f1ead8' : '#2ec4b6'); c.fillRect(-110 + i * 27.5, -150, 27.5, 150); }
  c.fillStyle = S('#ffd23a'); c.fillRect(-14, -150, 28, 150);
  text(c, 'L+L', 0, -70, 30, S('#7a1f2b'));
  if (!o.awake) { c.fillStyle = S('#1c7f76'); rr(c, -120, -182, 240, 34, 6); c.fillStyle = S('#ffd23a'); el(c, -22, -196, 22, 14); el(c, 22, -196, 22, 14); }
  c.strokeStyle = S('#9a9a9a'); c.lineWidth = 8; c.lineCap = 'round';
  const a = o.wind || 0; c.beginPath(); c.moveTo(110, -80); c.lineTo(140, -80); c.lineTo(140 + Math.cos(a) * 30, -80 + Math.sin(a) * 30); c.stroke();
  c.fillStyle = S('#c0392b'); el(c, 140 + Math.cos(a) * 30, -80 + Math.sin(a) * 30, 10, 10);
  if (!o.awake && o.v > 0) { const k = (o.t * 0.5) % 1; c.globalAlpha = (1 - k) * 0.8; text(c, '♪', -60 + Math.sin(o.t * 2) * 12, -210 - k * 70, 40, '#bff', 'sans-serif'); c.globalAlpha = 1; }
  c.restore();
}

// ---------- camera rooms ----------
function base(c, w1, w2, f1, hz = 470) {
  let g = c.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, w1); g.addColorStop(1, w2); c.fillStyle = g; c.fillRect(0, 0, 1280, hz);
  g = c.createLinearGradient(0, hz, 0, 720); g.addColorStop(0, shade(f1, 0.55)); g.addColorStop(1, f1); c.fillStyle = g; c.fillRect(0, hz, 1280, 720 - hz);
  c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 2;
  for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(640 + i * 60, hz); c.lineTo(640 + i * 230, 720); c.stroke(); }
  for (let j = 0; j < 5; j++) { const y = hz + (720 - hz) * Math.pow((j + 1) / 5, 1.6); c.beginPath(); c.moveTo(0, y); c.lineTo(1280, y); c.stroke(); }
}
const SPOT = {
  stage: { bing: [640, 600, 1.2], dylan: [390, 610, 1.1], gavin: [915, 610, 1.1] },
  arcade: { dylan: [300, 690, 1.35], gavin: [960, 700, 1.3], bing: [640, 610, 0.85, 0.75] },
  storage: { dylan: [760, 760, 1.7] },
  kitchen: { gavin: [560, 760, 1.6] },
  prize: { bing: [1000, 760, 1.6] },
  whall: { dylan: [560, 600, 1.0], bing: [730, 620, 1.1, 0.7], sal: [640, 700, 1.5] },
  ehall: { gavin: [700, 600, 1.0], bing: [540, 620, 1.1, 0.7], sal: [640, 700, 1.5] },
};
const DARK = { stage: 0.25, arcade: 0.45, storage: 0.55, kitchen: 0.4, prize: 0.45, whall: 0.55, ehall: 0.55, bar: 0.35 };
function bots(c, room, info) {
  for (const who of ['bing', 'dylan', 'gavin', 'sal']) {
    if (!info.who.includes(who) || !SPOT[room] || !SPOT[room][who]) continue;
    const p = SPOT[room][who];
    drawBot(c, who, p[0], p[1], p[2], { dark: p[3] || DARK[room], eyes: room !== 'stage', lean: who === 'sal' ? Math.sin(info.t * 9) * 0.12 : 0, bottle: 0 });
  }
}
const ROOMS = {
  stage(c, t, info) {
    base(c, '#1a1030', '#241640', '#3a2a1a', 560);
    c.fillStyle = '#ffd23a'; for (let i = 0; i < 30; i++) { c.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + i); star(c, 230 + (i * 173) % 820, 80 + (i * 97) % 330, 7 + (i % 3) * 3); } c.globalAlpha = 1;
    neon(c, "BING'S", 640, 110, 86, '#9dff3a', t);
    text(c, 'ARCADE & GRILL', 640, 175, 26, '#f4f4e8');
    c.fillStyle = '#4a2f1b'; c.fillRect(140, 600, 1000, 70); c.fillStyle = '#2f1d10'; c.fillRect(140, 660, 1000, 60);
    bots(c, 'stage', info);
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#5a0f18' : '#7a1522'; c.fillRect(i * 36, 0, 36, 720); c.fillRect(1280 - (i + 1) * 36, 0, 36, 720); }
    c.fillStyle = '#5a0f18'; c.fillRect(0, 0, 1280, 44); for (let i = 0; i < 16; i++) { c.fillStyle = '#7a1522'; el(c, 40 + i * 80, 44, 40, 22); }
  },
  arcade(c, t, info) {
    base(c, '#0e1424', '#141c33', '#1a1a2e', 500);
    neon(c, 'HIGH SCORES', 640, 90, 44, '#3ad7ff', t, 3);
    for (let i = 0; i < 7; i++) {
      const x = 40 + i * 180;
      c.fillStyle = '#10131f'; rr(c, x, 230, 130, 290, 8); c.fillStyle = `hsl(${i * 53},70%,35%)`; c.fillRect(x + 8, 238, 114, 26);
      c.fillStyle = `hsl(${(i * 53 + 180) % 360},80%,${(i === 3 ? 12 : 30) + 10 * Math.sin(t * (3 + i) + i)}%)`; c.fillRect(x + 16, 280, 98, 76);
      c.fillStyle = '#23283a'; c.fillRect(x + 8, 372, 114, 30); c.fillStyle = '#e23d3d'; el(c, x + 40, 386, 8, 8); c.fillStyle = '#ffd23a'; el(c, x + 84, 386, 6, 6);
    }
    bots(c, 'arcade', info);
  },
  bar(c, t, info) {
    base(c, '#1c120c', '#2a1a10', '#1a1410', 520);
    for (let r = 0; r < 2; r++) { c.fillStyle = '#3a2414'; c.fillRect(160, 300 + r * 90, 760, 12); for (let i = 0; i < 20; i++) { const hgt = 44 + (i * 7 + r * 3) % 26; c.fillStyle = `hsl(${(i * 47 + r * 90) % 360},45%,28%)`; rr(c, 176 + i * 37, 300 + r * 90 - hgt, 18, hgt, 4); c.fillRect(182 + i * 37, 300 + r * 90 - hgt - 14, 6, 16); } }
    neon(c, 'THE TAP', 540, 150, 64, '#ffb020', t, 7);
    if (info.who.includes('sal')) drawBot(c, 'sal', 500, 800, 1.5, { dark: 0.3, eyes: info.thirst < 25, lean: Math.sin(t * 1.3) * 0.05, bottle: info.thirst / 100 });
    c.fillStyle = '#5a3a1e'; c.fillRect(0, 540, 1280, 34); c.fillStyle = '#3a2412'; c.fillRect(0, 574, 1280, 146);
    c.fillStyle = '#9a9a9a'; rr(c, 860, 440, 30, 100, 6); c.fillRect(860, 450, 80, 16); c.fillStyle = '#222'; rr(c, 930, 420, 16, 50, 6);
    if (info.pour) { c.fillStyle = '#d9a13a'; c.fillRect(914, 466, 8, 74); c.fillStyle = 'rgba(255,240,200,.8)'; el(c, 918, 540, 22 + Math.sin(t * 30) * 4, 6); }
    if (!info.who.includes('sal')) { c.fillStyle = '#1f5d33'; for (let i = 0; i < 9; i++) { c.save(); c.translate(430 + (i * 67) % 190, 548 + (i * 13) % 14); c.rotate(i * 1.3); c.beginPath(); c.moveTo(0, -12); c.lineTo(9, 6); c.lineTo(-10, 4); c.fill(); c.restore(); } c.fillStyle = 'rgba(217,161,58,.5)'; el(c, 520, 556, 120, 10); text(c, 'SAL IS GONE', 540, 250, 40, '#ff3b2f'); }
  },
  prize(c, t, info) {
    base(c, '#101a1c', '#17282b', '#1c1c24', 520);
    neon(c, 'PRIZE CORNER', 640, 80, 50, '#3ad7ff', t, 11);
    for (let r = 0; r < 3; r++) { c.fillStyle = '#26363a'; c.fillRect(120, 220 + r * 100, 1040, 10); for (let i = 0; i < 12; i++) { const px = 160 + i * 86, py = 190 + r * 100; c.fillStyle = `hsl(${(i * 61 + r * 40) % 360},40%,30%)`; el(c, px, py, 24, 28); el(c, px - 16, py - 26, 9, 9); el(c, px + 16, py - 26, 9, 9); c.fillStyle = '#050505'; el(c, px - 8, py - 6, 3, 3); el(c, px + 8, py - 6, 3, 3); } }
    c.fillStyle = '#2d3f44'; c.fillRect(0, 560, 1280, 30);
    drawBox(c, 610, 690, 1.35, { v: info.box, awake: info.awake, wind: info.windA, dark: 0.25, t });
    bots(c, 'prize', info);
  },
  kitchen(c, t, info) {
    base(c, '#1b2222', '#232d2d', '#22262a', 500);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2; for (let x = 0; x < 1280; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 500); c.stroke(); } for (let y = 0; y < 500; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(1280, y); c.stroke(); }
    c.fillStyle = '#39424a'; c.fillRect(0, 70, 1280, 8); for (let i = 0; i < 7; i++) { const px = 240 + i * 120, sw = Math.sin(t * 1.2 + i) * 6; c.strokeStyle = '#555'; c.lineWidth = 3; c.beginPath(); c.moveTo(px, 78); c.lineTo(px + sw, 150); c.stroke(); c.fillStyle = '#4a5560'; el(c, px + sw, 178, 30 + (i % 3) * 6, 30); }
    c.fillStyle = '#4b555e'; rr(c, 900, 240, 240, 330, 8); c.fillStyle = '#39424a'; c.fillRect(916, 256, 208, 120); c.fillRect(916, 392, 208, 160);
    c.fillStyle = '#2b3238'; rr(c, 90, 330, 300, 240, 8); c.fillStyle = '#0c0c0c'; rr(c, 120, 400, 240, 140, 8); c.fillStyle = `rgba(255,120,30,${0.25 + 0.1 * Math.sin(t * 7)})`; rr(c, 130, 410, 220, 120, 8);
    bots(c, 'kitchen', info);
    c.fillStyle = '#39424a'; c.fillRect(0, 640, 1280, 80); for (let i = 0; i < 3; i++) { c.fillStyle = '#b89a6a'; c.fillRect(980 + i * 8, 596 - i * 22, 200, 20); }
  },
  storage(c, t, info) {
    base(c, '#15130f', '#1e1b15', '#191713', 520);
    for (let r = 0; r < 3; r++) { c.fillStyle = '#3a3226'; c.fillRect(60, 200 + r * 120, 520, 12); for (let i = 0; i < 5; i++) { c.fillStyle = `hsl(30,25%,${16 + (i * 3 + r) % 4 * 4}%)`; c.fillRect(80 + i * 100, 200 + r * 120 - 70 - (i + r) % 2 * 14, 84, 70 + (i + r) % 2 * 14); } }
    for (let i = 0; i < 3; i++) { const hx = 900 + i * 120, col = ['#7fd138', '#3d73de', '#f29a3e'][i]; c.fillStyle = shade(col, 0.55); rr(c, hx - 46, 350, 92, 74, 24); c.fillStyle = '#050505'; el(c, hx - 20, 380, 13, 13); el(c, hx + 20, 380, 13, 13); c.fillRect(hx - 30, 404, 60, 8); }
    c.fillStyle = '#3a3226'; c.fillRect(820, 424, 400, 14); text(c, 'SPARE PARTS', 1020, 300, 26, '#6a604c');
    const sw = Math.sin(t * 1.7) * 30; c.strokeStyle = '#333'; c.lineWidth = 3; c.beginPath(); c.moveTo(640, 0); c.lineTo(640 + sw, 120); c.stroke(); c.fillStyle = '#ffe9a8'; el(c, 640 + sw, 130, 12, 16);
    bots(c, 'storage', info);
  },
  whall(c, t, info) { hall(c, t, info, 'whall', '#18222a', 'WEST HALL'); },
  ehall(c, t, info) { hall(c, t, info, 'ehall', '#2a1f18', 'EAST HALL'); },
  vent(c, t, info) {
    c.fillStyle = '#0a0d0f'; c.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 9; i++) { const k = Math.pow(0.72, i), w = 1180 * k, h = 660 * k; c.strokeStyle = `rgba(120,140,150,${0.5 - i * 0.05})`; c.lineWidth = 10 * k + 1; c.strokeRect(640 - w / 2, 360 - h / 2, w, h); }
    c.strokeStyle = 'rgba(120,140,150,.25)'; c.lineWidth = 2; for (const [x, y] of [[50, 30], [1230, 30], [50, 690], [1230, 690]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(640, 360); c.stroke(); }
    if (info.tok > 0) { const s = [0, 0.3, 0.75, 1.7][info.tok]; drawTokens(c, 640, 360 + (info.tok === 3 ? 60 : 0), s, { dark: [0, 0.6, 0.4, 0.2][info.tok], eyes: true, jaw: info.tok === 3 ? 0.5 : 0 }); }
    if (info.seal) text(c, 'VENT SEALED', 640, 660, 30, '#3ad7ff');
  },
};
function hall(c, t, info, id, tint, label) {
  c.fillStyle = '#050607'; c.fillRect(0, 0, 1280, 720);
  const q = (x1, y1, x2, y2, x3, y3, x4, y4, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(x4, y4); c.fill(); };
  q(0, 0, 500, 230, 500, 500, 0, 720, tint); q(1280, 0, 780, 230, 780, 500, 1280, 720, shade('#ffffff', 1) && tint);
  q(0, 720, 500, 500, 780, 500, 1280, 720, '#15171a'); q(0, 0, 500, 230, 780, 230, 1280, 0, '#0c0e10');
  c.fillStyle = '#020202'; c.fillRect(500, 230, 280, 270);
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 2; for (let i = 1; i < 6; i++) { const k = i / 6, y = 500 + 220 * k * k; c.beginPath(); c.moveTo(500 - 500 * k * k, y); c.lineTo(780 + 500 * k * k, y); c.stroke(); }
  const fl = Math.sin(t * 17) > 0.2 || Math.sin(t * 3.1) > 0 ? 1 : 0.2;
  c.fillStyle = `rgba(255,240,200,${0.55 * fl})`; q(540, 60, 740, 60, 700, 110, 580, 110, c.fillStyle);
  for (let i = 0; i < 3; i++) { c.fillStyle = ['#7a1522', '#1c7f76', '#8a6a10'][i]; const x = 60 + i * 130, y = 250 - i * 8, w = 90 - i * 14, h = 130 - i * 20; c.fillRect(id === 'whall' ? x : 1280 - x - w, y + i * 20, w, h); }
  text(c, label, 640, 200, 18, '#6f7f86', "'Press Start 2P'");
  bots(c, id, info);
}

const noiseCv = [];
function makeNoise() {
  for (let k = 0; k < 4; k++) { const n = document.createElement('canvas'); n.width = n.height = 256; const x = n.getContext('2d'), im = x.createImageData(256, 256); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } x.putImageData(im, 0, 0); noiseCv.push(n); }
}
export function staticFx(c, a, t) {
  if (!noiseCv.length) makeNoise();
  c.save(); c.globalAlpha = a; c.imageSmoothingEnabled = false;
  const n = noiseCv[(t * 30 | 0) % 4]; c.drawImage(n, 0, 0, 256, 144, 0, 0, 1280, 720);
  c.restore();
}
export function drawRoom(c, id, t, info) {
  c.save(); c.beginPath(); c.rect(0, 0, 1280, 720); c.clip();
  ROOMS[id](c, t, info);
  const g = c.createRadialGradient(640, 330, 150, 640, 360, 800); g.addColorStop(0, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(0,0,0,.93)'); c.fillStyle = g; c.fillRect(0, 0, 1280, 720);
  c.fillStyle = 'rgba(40,90,70,.10)'; c.fillRect(0, 0, 1280, 720);
  staticFx(c, 0.05 + (info.glitch ? 0.9 : 0), t);
  c.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < 720; y += 4) c.fillRect(0, y, 1280, 1);
  const by = (t * 90) % 900 - 90; c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(0, by, 1280, 70);
  c.restore();
}

// ---------- the office ----------
function doorway(c, x, lit, who, closed, t, eyesOnly) {
  c.save(); c.beginPath(); c.rect(x, 150, 220, 490); c.clip();
  c.fillStyle = '#020303'; c.fillRect(x, 150, 220, 490);
  if (lit) { const f = Math.sin(t * 40) > -0.6 ? 1 : 0.5; c.fillStyle = `rgba(200,210,170,${0.5 * f})`; c.fillRect(x, 150, 220, 490); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, 560, 220, 80); }
  if (who && (lit || eyesOnly)) drawBot(c, who, x + 110, who === 'gavin' ? 720 : 700, who === 'tokens' ? 1 : 1.35, { dark: lit ? 0.12 : 1, eyes: true, lean: who === 'sal' ? Math.sin(t * 8) * 0.06 : 0, bottle: 0 });
  if (closed > 0.01) {
    const y = 150 - 490 * (1 - closed);
    c.fillStyle = '#4b5258'; c.fillRect(x, y, 220, 490); c.fillStyle = '#394046'; for (let i = 0; i < 5; i++) c.fillRect(x, y + 40 + i * 95, 220, 8);
    c.save(); c.beginPath(); c.rect(x, y + 440, 220, 50); c.clip(); for (let i = -2; i < 9; i++) { c.fillStyle = i % 2 ? '#e8b923' : '#151515'; c.beginPath(); c.moveTo(x + i * 34, y + 490); c.lineTo(x + i * 34 + 34, y + 490); c.lineTo(x + i * 34 + 68, y + 440); c.lineTo(x + i * 34 + 34, y + 440); c.fill(); } c.restore();
  }
  c.restore();
  c.strokeStyle = '#2b3236'; c.lineWidth = 14; c.strokeRect(x - 4, 146, 228, 498);
}
function panelBtn(c, x, y, label, on, col) {
  c.fillStyle = '#0d0f10'; rr(c, x, y, 80, 80, 12);
  c.fillStyle = on ? col : shade(col, 0.72); rr(c, x + 7, y + 7, 66, 66, 10);
  if (on) { c.save(); c.shadowColor = col; c.shadowBlur = 24; rr(c, x + 7, y + 7, 66, 66, 10); c.restore(); }
  text(c, label, x + 40, y + 41, 13, on ? '#111' : '#ddd', "'Press Start 2P'");
}
export function drawOffice(c, pan, o) {
  const t = o.t;
  c.save(); c.translate(-pan, 0);
  let g = c.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, '#16262b'); g.addColorStop(1, '#0f1a1e'); c.fillStyle = g; c.fillRect(0, 0, OFFICE_W, 640);
  for (let i = 0; i < 44; i++) { c.fillStyle = i % 2 ? '#101010' : '#d8d2c0'; c.globalAlpha = 0.5; c.fillRect(i * 40, 420, 40, 20); c.fillStyle = i % 2 ? '#d8d2c0' : '#101010'; c.fillRect(i * 40, 440, 40, 20); } c.globalAlpha = 1;
  g = c.createLinearGradient(0, 640, 0, 720); g.addColorStop(0, '#0a0c0d'); g.addColorStop(1, '#16191b'); c.fillStyle = g; c.fillRect(0, 640, OFFICE_W, 80);
  doorway(c, 70, o.lightL, o.atL, o.dl, t, o.eyesL);
  doorway(c, 1470, o.lightR, o.atR, o.dr, t, o.eyesR);
  // sign, posters, string lights
  c.fillStyle = '#0b1114'; rr(c, 430, 170, 330, 130, 12); neon(c, "BING'S", 595, 215, 54, '#9dff3a', t); text(c, 'ARCADE & GRILL', 595, 268, 18, '#f4f4e8');
  c.fillStyle = '#e9e2cf'; c.fillRect(1100, 180, 200, 250); c.fillStyle = '#1a1030'; c.fillRect(1108, 188, 184, 234); drawBot(c, 'bing', 1200, 410, 0.42, {}); text(c, 'HIGH SCORE', 1200, 206, 17, '#ffd23a'); text(c, 'NIGHT!', 1200, 228, 17, '#ffd23a');
  c.fillStyle = '#f1ead8'; c.save(); c.translate(470, 330); c.rotate(-0.06); c.fillRect(0, 0, 90, 70); text(c, 'RULES', 45, 14, 11, '#7a1522'); c.fillStyle = '#888'; for (let i = 0; i < 4; i++) c.fillRect(8, 26 + i * 10, 74, 3); c.restore();
  c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); for (let x = 300; x <= 1460; x += 20) c.lineTo(x, 132 + Math.sin((x - 300) / 1160 * Math.PI * 4) * -10 + 14); c.stroke();
  for (let i = 0; i < 24; i++) { const x = 320 + i * 48; c.fillStyle = ['#e23d3d', '#ffd23a', '#3ad7ff', '#9dff3a'][i % 4]; c.globalAlpha = o.out ? 0.08 : 0.5 + 0.5 * Math.sin(t * 2 + i); el(c, x, 150 + Math.sin((x - 300) / 1160 * Math.PI * 4) * -10, 6, 8); } c.globalAlpha = 1;
  // vent
  c.fillStyle = '#020303'; c.fillRect(790, 40, 180, 90);
  if (o.ventBot && o.sv < 0.5) drawTokens(c, 880, 92, 0.42, { dark: 0.3, eyes: true });
  c.strokeStyle = '#4b5258'; c.lineWidth = 4; for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(790, 40 + i * 15); c.lineTo(970, 40 + i * 15); c.stroke(); }
  if (o.sv > 0.01) { c.fillStyle = '#5a646b'; c.fillRect(790, 40, 180 * o.sv, 90); c.fillStyle = '#e8b923'; c.fillRect(790 + 180 * o.sv - 8, 40, 8, 90); }
  c.strokeStyle = '#2b3236'; c.lineWidth = 10; c.strokeRect(788, 38, 184, 94);
  c.fillStyle = '#20272b'; rr(c, 985, 40, 100, 90, 10); panelBtn(c, 995, 45, 'VENT', o.seal, '#3ad7ff');
  // door panels
  c.fillStyle = '#20272b'; rr(c, 300, 280, 100, 190, 10); panelBtn(c, 310, 290, 'DOOR', o.doorL, '#e23d3d'); panelBtn(c, 310, 380, 'LIGHT', o.lightL, '#f4f4e8');
  rr(c, 1360, 280, 100, 190, 10); c.fillStyle = '#20272b'; rr(c, 1360, 280, 100, 190, 10); panelBtn(c, 1370, 290, 'DOOR', o.doorR, '#e23d3d'); panelBtn(c, 1370, 380, 'LIGHT', o.lightR, '#f4f4e8');
  // desk
  c.fillStyle = '#2a2018'; c.fillRect(520, 540, 720, 40); c.fillStyle = '#1c1510'; c.fillRect(540, 580, 680, 140);
  c.fillStyle = '#15181a'; rr(c, 610, 400, 210, 150, 12); c.fillStyle = '#06110c'; rr(c, 624, 414, 182, 110, 8);
  if (!o.out) { c.save(); c.beginPath(); c.rect(624, 414, 182, 110); c.clip(); c.globalAlpha = 0.5; if (noiseCv.length) c.drawImage(noiseCv[(t * 20 | 0) % 4], 0, 0, 91, 55, 624, 414, 182, 110); c.restore(); text(c, 'CAM', 715, 470, 16, 'rgba(160,255,200,.6)', "'Press Start 2P'"); }
  // fan
  c.fillStyle = '#15181a'; c.fillRect(980, 500, 14, 44); el(c, 987, 544, 40, 8); c.strokeStyle = '#3a4248'; c.lineWidth = 5; c.beginPath(); c.arc(987, 462, 52, 0, TAU); c.stroke();
  c.save(); c.translate(987, 462); c.rotate(o.out ? 0.4 : t * 14); c.fillStyle = 'rgba(120,130,140,.6)'; for (let i = 0; i < 3; i++) { c.rotate(TAU / 3); el(c, 24, 0, 24, 11); } c.restore();
  // phone, cup, bobblehead
  c.fillStyle = '#101214'; rr(c, 860, 512, 80, 30, 6); c.fillStyle = o.call && Math.sin(t * 10) > 0 ? '#ff3b2f' : '#3a0d0a'; el(c, 925, 527, 6, 6);
  c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(1080, 480); c.lineTo(1124, 480); c.lineTo(1116, 542); c.lineTo(1088, 542); c.fill(); c.fillStyle = '#f4f4e8'; c.fillRect(1099, 452, 5, 30);
  drawBot(c, 'bing', 570, 542, 0.2, { lean: Math.sin(t * 3) * 0.08 });
  c.fillStyle = '#f1ead8'; c.save(); c.translate(1150, 548); c.rotate(0.1); c.fillRect(0, -8, 70, 10); c.restore();
  c.restore();
}

// ---------- jumpscare + title art ----------
export function drawScare(c, who, t) {
  c.fillStyle = '#000'; c.fillRect(0, 0, 1280, 720);
  const k = Math.min(1, t / 0.18), e = 1 - Math.pow(1 - k, 3), sh = 26;
  const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh, jaw = 0.6 + 0.4 * Math.abs(Math.sin(t * 40));
  if (who === 'twins') drawTwins(c, 640 + ox, 360 + oy, 0.8 + 2.4 * e, { eyes: true, jaw });
  else if (who === 'tokens') drawTokens(c, 640 + ox, 330 + oy, 0.8 + 2.6 * e, { eyes: true, jaw });
  else { const s = 1.2 + 3.4 * e, sy = who === 'dylan' ? 1.1 : 1; drawBot(c, who, 640 + ox, 400 + oy + 335 * s * sy, s, { eyes: true, jaw, dark: 0.1 }); }
  if (Math.sin(t * 60) > 0.5) { c.fillStyle = 'rgba(255,0,0,.14)'; c.fillRect(0, 0, 1280, 720); }
  staticFx(c, 0.06, t * 3);
}
export function drawTitle(c, t) {
  c.fillStyle = '#020303'; c.fillRect(0, 0, 1280, 720);
  const tw = Math.sin(t * 0.7) > 0.96 || Math.sin(t * 2.3) > 0.985;
  c.save(); c.translate(tw ? (Math.random() - 0.5) * 14 : 0, 0);
  drawBot(c, tw ? 'sal' : 'bing', 930, 1500, 3.4, { dark: 0.45 + 0.1 * Math.sin(t * 5), eyes: true, jaw: tw ? 0.5 : 0.05, bottle: 0.3 });
  c.restore();
  const g = c.createLinearGradient(0, 0, 800, 0); g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 1280, 720);
  staticFx(c, tw ? 0.25 : 0.05, t);
  c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < 720; y += 4) c.fillRect(0, y, 1280, 1);
}
