// Every picture in Nova Party is drawn here, pixel by pixel, onto small canvases that the page scales up with
// image-rendering: pixelated. Sprites are little text maps (one letter = one pixel of a palette colour) or are
// computed (the nova, planets), so there are no image files.

const PAL = { k: '#10142a', w: '#f4f4ff', g: '#b9c0dd', v: '#1b2a5e', h: '#6fd3ff', e: '#ffffff', b: '#6b7396', y: '#ffd23d', r: '#ff5a5a', o: '#ff9d2e' };

/** Suit colours a player can pick: [main, shade, name]. */
export const SUITS = [
  ['#ff6b4a', '#b83a2a', 'Ember'], ['#ffb020', '#b86e12', 'Solar'], ['#f6e04a', '#a8961e', 'Zap'], ['#62d96b', '#2f8f45', 'Moss'],
  ['#3fd6d0', '#1f8a90', 'Aqua'], ['#5d86ff', '#3148b8', 'Cobalt'], ['#c58bff', '#7a48c0', 'Grape'], ['#ff8fc8', '#b84d86', 'Bubble'],
];
export const TOPS = ['Plain', 'Antenna', 'Cat ears', 'Mohawk', 'Halo'];

export const ASTRO_W = 16, ASTRO_H = 22;
const ASTRO = [
  '................',
  '.....kkkkkk.....',
  '...kkwwwwwwkk...',
  '..kwwwwwwwwwwk..',
  '.kwwkkkkkkkkwwk.',
  '.kwkvvvvvvvvkwk.',
  '.kwkvvvvvvvvkwk.',
  '.kwkvvvvvvvvkwk.',
  '.kwkvvvvvvvvkwk.',
  '.kgwkkkkkkkkwgk.',
  '..kggwwwwwwggk..',
  '..kkkkkkkkkkkk..',
  '.kckcccyyccckck.',
  '.kckcccccccckck.',
  '.kwkddddddddkwk.',
  '.kkkkcckkcckkkk.',
  '...kbbbkkbbbk...',
  '...kkkkkkkkkk...',
];
// what sits on the helmet: rows 0-5 of the canvas (the body starts at row 4)
const TOP_MAPS = [
  null,
  ['.......er.......', '.......rr.......', '........g.......', '........g.......'],
  ['................', '................', '...k........k...', '..kck......kck..', '..kcck....kcck..', '..kcck....kcck..'],
  ['................', '.......cc.......', '......cdcc......', '.....cdcccc.....', '.....dccccd.....'],
  ['................', '.....yyyyyy.....', '....y......y....', '.....yyyyyy.....'],
];
const CROWN = ['................', '....y..yy..y....', '....yyyyyyyy....', '....yryyyyry....', '....yyyyyyyy....'];
// faces: pixels on the visor, [x, y, colour] with y counted from the top of the body
const FACES = {
  idle: [[4, 5, 'h'], [5, 5, 'h'], [4, 6, 'h'], [6, 6, 'e'], [6, 7, 'e'], [9, 6, 'e'], [9, 7, 'e']],
  blink: [[4, 5, 'h'], [5, 5, 'h'], [4, 6, 'h'], [6, 7, 'e'], [9, 7, 'e']],
  think: [[4, 5, 'h'], [5, 5, 'h'], [6, 5, 'e'], [6, 6, 'e'], [9, 5, 'e'], [9, 6, 'e']],
  hold: [[5, 6, 'e'], [6, 6, 'e'], [5, 7, 'e'], [6, 7, 'k'], [9, 6, 'e'], [10, 6, 'e'], [9, 7, 'k'], [10, 7, 'e'], [7, 8, 'e'], [8, 8, 'e'], [15, 4, 'h'], [15, 5, 'h'], [14, 3, 'h']],
  out: [[5, 6, 'b'], [6, 7, 'b'], [5, 7, 'b'], [6, 6, 'b'], [9, 6, 'b'], [10, 7, 'b'], [9, 7, 'b'], [10, 6, 'b'], [8, 5, 'g'], [7, 6, 'g'], [8, 7, 'g'], [7, 8, 'g']],
  win: [[4, 5, 'h'], [4, 7, 'e'], [5, 6, 'e'], [6, 7, 'e'], [9, 7, 'e'], [10, 6, 'e'], [11, 7, 'e'], [7, 8, 'e'], [8, 8, 'e']],
};

function put(g, map, ox, oy, pal) {
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) { const c = row[x]; if (c === '.') continue; g.fillStyle = pal[c] || '#f0f'; g.fillRect(ox + x, oy + y, 1, 1); }
  }
}

/** Draws an astronaut onto a 16x22 canvas. look: { c suit colour, top }, mood: a FACES key, crown: the owner's. */
export function drawAstro(cv, look, mood = 'idle', crown = false) {
  cv.width = ASTRO_W; cv.height = ASTRO_H;
  const g = cv.getContext('2d');
  const suit = SUITS[(look && look.c) % SUITS.length || 0];
  const pal = { ...PAL, c: suit[0], d: suit[1] };
  if (mood === 'out') { pal.c = '#59607e'; pal.d = '#3c4260'; pal.w = '#aab0c8'; pal.g = '#7d84a3'; pal.v = '#141a33'; }
  put(g, ASTRO, 0, 4, pal);
  const top = crown ? CROWN : TOP_MAPS[(look && look.top) % TOP_MAPS.length || 0];
  if (top) put(g, top, 0, 0, pal);
  for (const [x, y, c] of FACES[mood] || FACES.idle) { g.fillStyle = pal[c]; g.fillRect(x, y + 4, 1, 1); }
  return cv;
}

const HEAT = [
  { core: '#fff7c2', mid: '#ffd23d', rim: '#ff9d2e', line: '#7a3a12', glow: '#ffb020' },
  { core: '#fff1d6', mid: '#ffb020', rim: '#ff6b2e', line: '#7a2412', glow: '#ff7a2e' },
  { core: '#ffffff', mid: '#ffd6d6', rim: '#ff4a4a', line: '#6a1020', glow: '#ff3a3a' },
];
export const NOVA = 32;
/** The nova: a star with a face. heat 0 calm, 1 worried, 2 about to blow; frame makes it twinkle. */
export function drawNova(cv, heat = 0, frame = 0) {
  cv.width = NOVA; cv.height = NOVA;
  const g = cv.getContext('2d'), H = HEAT[heat] || HEAT[0];
  const c = (NOVA - 1) / 2, spin = frame * 0.2, pulse = (frame % 2) * (heat ? 0.9 : 0.45);
  for (let y = 0; y < NOVA; y++) for (let x = 0; x < NOVA; x++) {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const long = Math.abs(Math.cos(th * 2 + spin * 0.5)) ** 10, short = Math.abs(Math.cos(th * 2 + Math.PI / 2 + spin * 0.5)) ** 14;
    const R = 8.2 + pulse * 0.5 + long * (5.6 + pulse) + short * 3.2;
    let col = null;
    if (r <= R - 3.4) col = H.core; else if (r <= R - 1.9) col = H.mid; else if (r <= R - 0.6) col = H.rim; else if (r <= R + 0.5) col = H.line;
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  // the face
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(c + x - 0.5), Math.round(c + y - 0.5), 1, 1); };
  const dark = '#2a1408';
  if (heat < 2) {
    for (const s of [-3, 3]) { px(s, -2, dark); px(s, -1, dark); px(s, 0, dark); px(s + (s < 0 ? 1 : -1), -1, dark); px(s, -2, '#ffffff'); }
    if (heat === 0) { px(-2, 2, dark); px(-1, 3, dark); px(0, 3, dark); px(1, 3, dark); px(2, 2, dark); }
    else { px(-2, 3, dark); px(-1, 2, dark); px(0, 3, dark); px(1, 2, dark); px(2, 3, dark); px(5, -4, '#9fe6ff'); px(5, -3, '#9fe6ff'); }
  } else {
    for (const s of [-3, 3]) for (let a = -1; a <= 1; a++) for (let b = -3; b <= -1; b++) px(s + a, b + 1, a === 0 && b === -2 ? dark : '#ffffff');
    for (let a = -1; a <= 1; a++) for (let b = 2; b <= 4; b++) px(a, b, a === 0 && b === 3 ? '#ff4a4a' : dark);
    if (frame % 2) { px(-9, -7, '#fff'); px(8, 8, '#fff'); px(9, -8, '#ffd23d'); px(-8, 9, '#ffd23d'); } else { px(-10, 2, '#fff'); px(10, -2, '#fff'); px(2, -11, '#ffd23d'); px(-2, 11, '#ffd23d'); }
  }
  return H.glow;
}

const HEART = ['.kk.kk.', 'krrkrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'];
/** A data URL of a heart (full) or its empty outline, for CSS backgrounds. */
export function heartUrl(full) {
  const cv = document.createElement('canvas'); cv.width = 7; cv.height = 6;
  put(cv.getContext('2d'), HEART, 0, 0, { k: '#10142a', r: full ? '#ff4a6a' : '#2a3058' });
  if (full) { const g = cv.getContext('2d'); g.fillStyle = '#ffc2cc'; g.fillRect(1, 1, 1, 1); }
  return cv.toDataURL();
}

const CROWN_ICON = ['k.k.k.k', 'kykykyk', 'kyyyyyk', 'kyryryk', 'kyyyyyk', 'kkkkkkk'];
/** A data URL of a small crown (7x6): games won in a room. */
export function crownUrl() {
  const cv = document.createElement('canvas'); cv.width = 7; cv.height = 6;
  put(cv.getContext('2d'), CROWN_ICON, 0, 0, PAL);
  return cv.toDataURL();
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** A dithered planet. shades: dark to light; bands: how stripy; ring: a colour, or null. Returns a canvas. */
export function makePlanet(R, shades, { bands = 0, ring = null, seed = 1, craters = 0 } = {}) {
  const pad = ring ? Math.ceil(R * 0.95) : 1, S = R * 2 + 1 + pad * 2, c = (S - 1) / 2;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const spots = Array.from({ length: craters }, () => [(rnd() * 2 - 1) * R * 0.7, (rnd() * 2 - 1) * R * 0.7, 1 + rnd() * R * 0.22]);
  const ringAt = (x, y) => { const dx = (x - c) / (R * 1.9), dy = (y - c - (x - c) * 0.18) / (R * 0.5); const d = dx * dx + dy * dy; return d > 0.55 && d < 1 ? d : 0; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    const rg = ring ? ringAt(x, y) : 0, front = dy - dx * 0.18 > 0;
    if (d <= R + 0.3) {
      const nz = Math.sqrt(Math.max(0, 1 - (d / R) ** 2));
      let l = (-dx / R) * 0.55 + (-dy / R) * 0.5 + nz * 0.62;                   // lit from the upper left
      if (bands) l += Math.sin((dy / R) * bands + Math.sin(dx / R * 2 + seed) * 0.6) * 0.16;
      for (const [sx, sy, sr] of spots) if (Math.hypot(dx - sx, dy - sy) < sr) l -= 0.22;
      const f = Math.max(0, Math.min(0.999, l * 0.75 + 0.3)) * (shades.length - 1);
      const i = Math.floor(f) + (f - Math.floor(f) > dith(x, y) ? 1 : 0);
      g.fillStyle = shades[Math.min(shades.length - 1, i)];
      if (!(rg && front)) { g.fillRect(x, y, 1, 1); continue; }
    }
    if (rg) { g.fillStyle = rg > 0.78 && rg < 0.84 ? 'rgba(0,0,0,0)' : ring[(rg > 0.7 ? 1 : 0)]; if (!(rg > 0.78 && rg < 0.84)) g.fillRect(x, y, 1, 1); }
  }
  return cv;
}

/** Small emblems for the five rarity tiers (9x9). */
const EMBLEMS = [
  ['...kkk...', '.kkggwk..', 'kgggwwgk.', 'kgkgggwk.', 'kggggkgk.', 'kgggkggk.', '.kgggggk.', '..kkkkk..', '.........'],
  ['kk.....kk', 'khk...khk', '.khkkkhk.', '..kwwwk..', '..kwvwk..', '..kwwwk..', '.khkkkhk.', 'khk...khk', 'kk.....kk'],
  ['......kk.', '.....kwwk', '....kwwwk', '...kgwwk.', '..kggkk..', '.kgbk....', 'kgbk.....', 'kbk......', 'kk.......'],
  ['....p....', '.p.....p.', '...ppp...', '..pwwpp.p', 'p.pwwwp..', '..ppwpp..', '...ppp...', '.p.....p.', '....p....'],
  ['..kkkkk..', '.kueeuuk.', 'kueuuuuuk', 'kuuuuduuk', 'kuuduuuuk', 'kuuuuuduk', 'kuduuuuuk', '.kuuuuuk.', '..kkkkk..'],
];
const EPAL = { ...PAL, p: '#d08bff', u: '#5d86ff', d: '#3d5fd0' };
export function emblemUrl(tier) {
  const cv = document.createElement('canvas'); cv.width = 9; cv.height = 9;
  put(cv.getContext('2d'), EMBLEMS[tier], 0, 0, EPAL);
  return cv.toDataURL();
}

/** Square-pixel blast: call burst(x, y) in canvas pixels, then step(dt) every frame. */
export class Blast {
  constructor(cv) { this.cv = cv; this.g = cv.getContext('2d'); this.p = []; this.rings = []; this.dirty = false; }
  burst(x, y, big = 1, cols = ['#ffffff', '#fff7c2', '#ffd23d', '#ff9d2e', '#ff4a4a', '#c58bff']) {
    for (let i = 0; i < 70 * big; i++) {
      const a = Math.random() * Math.PI * 2, v = (20 + Math.random() * 110) * big;
      this.p.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.9, age: 0, s: 1 + Math.floor(Math.random() * 3), c: cols[Math.floor(Math.random() * cols.length)] });
    }
    this.rings.push({ x, y, r: 2, age: 0 });
  }
  sparkle(x, y, col) {
    for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, v = 12 + Math.random() * 40; this.p.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14, life: 0.4 + Math.random() * 0.5, age: 0, s: 1, c: i % 3 ? col : '#ffffff' }); }
  }
  get busy() { return this.p.length > 0 || this.rings.length > 0 || this.dirty; }
  step(dt) {
    const g = this.g, W = this.cv.width, H = this.cv.height;
    g.clearRect(0, 0, W, H);
    this.dirty = this.p.length > 0 || this.rings.length > 0;   // one more pass after the last spark, to wipe it
    for (const r of this.rings) {
      r.age += dt; r.r += dt * 150;
      g.fillStyle = r.age < 0.25 ? '#ffffff' : '#ffb020';
      const n = Math.max(12, Math.floor(r.r * 1.4));
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.fillRect(Math.round(r.x + Math.cos(a) * r.r), Math.round(r.y + Math.sin(a) * r.r), 2, 2); }
    }
    this.rings = this.rings.filter((r) => r.age < 0.55);
    for (const p of this.p) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.6; p.vy = p.vy * (1 - dt * 1.6) + 30 * dt;
      if (p.age > p.life * 0.7 && Math.floor(p.age * 20) % 2) continue;      // flicker out
      g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    this.p = this.p.filter((p) => p.age < p.life);
  }
}

export { dith };
