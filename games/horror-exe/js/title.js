// The title screen: a cheerful 16-bit title for "Dreamy Hills" starring Bolt... until you press start.
// Then it stutters, flashes, and turns into horror.exe. Everything is drawn on a tiny canvas (224 lines,
// like an old console) and blown up with crisp pixels. Original art: no sprites from any other game.

const H = 224;
const rnd = Math.random;
const PIX = '"Press Start 2P", monospace';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Snaps every pixel to the nearest palette color and makes alpha all-or-nothing: hard pixel-art edges. */
function snap(c, palette) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), a = d.data, P = palette.map(hex);
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 110) { a[i + 3] = 0; continue; }
    let best = 0, bd = 1e9;
    for (let k = 0; k < P.length; k++) { const p = P[k], dr = a[i] - p[0], dg = a[i + 1] - p[1], db = a[i + 2] - p[2], dd = dr * dr * 2 + dg * dg * 3 + db * db; if (dd < bd) { bd = dd; best = k; } }
    a[i] = P[best][0]; a[i + 1] = P[best][1]; a[i + 2] = P[best][2]; a[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

const PAL = {
  happy: {
    sky: ['#1838c0', '#1f4ad0', '#285ede', '#3474ea', '#428cf2', '#56a4f8', '#72bcfc', '#98d4ff'],
    far: ['#86d08e', '#70bc7c'], near: ['#3cae3c', '#2c9032'], water: ['#3c8cf2', '#2c70dc', '#2058c4', '#1a48aa'], shine: '#eaf6ff',
    grass: ['#74e450', '#3eb434'], soil: ['#d4842e', '#a85c1e'], cloud: ['#ffffff', '#d4e8ff', '#9cc4f0'],
    trunk: ['#a86e3a', '#7a4a24'], leaf: ['#56d444', '#2c9a2c', '#1e6e22'],
  },
  evil: {
    sky: ['#000000', '#0a0002', '#160003', '#260005', '#3c0008', '#58000c', '#7c0810', '#a81612'],
    far: ['#2c0608', '#200406'], near: ['#120203', '#0a0102'], water: ['#6a0012', '#52000c', '#3a0008', '#260004'], shine: '#b81a26',
    grass: ['#4a4224', '#2c2614'], soil: ['#3a1a0e', '#22100a'], cloud: ['#4a080e', '#320408', '#1e0205'],
    trunk: ['#3a2418', '#24160e'], leaf: ['#5a4422', '#3e2e16', '#241a0c'],
  },
};

// ------------------------------------------------------------------ sprites
function cloudSprite(cols, seed) {
  const c = cv(64, 28), g = c.getContext('2d');
  const puffs = seed ? [[14, 18, 10], [28, 12, 12], [42, 16, 10], [52, 20, 7], [22, 20, 9]] : [[12, 18, 8], [24, 14, 10], [36, 17, 9], [46, 20, 6]];
  for (const [k, col] of [[0, cols[2]], [1, cols[1]], [2, cols[0]]].map(([i, cl]) => [i, cl])) {
    g.fillStyle = col;
    for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x - k * 0.6, y - k * 1.6, r - k * 1.6, 0, 7); g.fill(); }
  }
  g.fillStyle = cols[2]; g.fillRect(4, 22, 54, 3);
  return snap(c, cols);
}

function palmSprite(p, dead) {
  const c = cv(56, 96), g = c.getContext('2d');
  for (let i = 0; i < 13; i++) { const x = 26 + Math.sin(i * 0.28) * 3 - i * 0.4; g.fillStyle = i % 2 ? p.trunk[0] : p.trunk[1]; g.fillRect(Math.round(x), 30 + i * 5, 7, 5); g.fillStyle = '#00000040'; g.fillRect(Math.round(x) + 5, 30 + i * 5, 2, 5); }
  const top = [28, 30];
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.62, droop = dead ? 1.6 : 0.55;
    g.strokeStyle = p.leaf[k % 2]; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(top[0], top[1]);
    const ex = top[0] + Math.cos(a) * 24, ey = top[1] + Math.sin(a) * 14 + 18 * droop;
    g.quadraticCurveTo(top[0] + Math.cos(a) * 18, top[1] + Math.sin(a) * 18 - 4, ex, ey); g.stroke();
    g.strokeStyle = p.leaf[2]; g.lineWidth = 1; g.stroke();
  }
  return snap(c, [...p.trunk, ...p.leaf, '#000000']);
}

/** Bolt from the waist up, giving a thumbs up. Eyes are drawn live (blinks, or pupils that follow you). */
function mascotSprite(evil) {
  const W = 150, Hs = 170, c = cv(W, Hs), g = c.getContext('2d');
  const C = evil
    ? { ol: '#000000', skin: '#b4aca2', skinS: '#807870', skinH: '#d0c8bc', hair: '#2a1812', hairS: '#140a06', hairH: '#3e2418', shirt: '#857220', shirtS: '#58480e', shirtH: '#a08e2c', emb: '#4a0606', mouth: '#000000', teeth: '#e8e0cc', blood: '#9a000e', bloodD: '#560006' }
    : { ol: '#1e120a', skin: '#ffd7a6', skinS: '#e2aa74', skinH: '#fff0da', hair: '#7a3e1a', hairS: '#4e240c', hairH: '#b2662e', shirt: '#ffd23d', shirtS: '#d89a14', shirtH: '#fff09a', emb: '#ff6a1a', mouth: '#7a0f1e', tongue: '#ff6a6a', blush: '#ff9a8a' };
  const blk = (x, y, w, h, f, s, hl) => {
    g.fillStyle = C.ol; g.fillRect(x, y, w, h);
    g.fillStyle = f; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    if (s) { g.fillStyle = s; g.fillRect(x + w - 2 - Math.round(w * 0.16), y + 2, Math.round(w * 0.16), h - 4); g.fillRect(x + 2, y + h - 5, w - 4, 3); }
    if (hl) { g.fillStyle = hl; g.fillRect(x + 2, y + 2, w - 4 - Math.round(w * 0.16), 2); }
  };
  // lowered arm (behind the body)
  blk(111, 86, 22, 24, C.shirt, C.shirtS, C.shirtH);
  blk(113, 108, 19, 64, C.skin, C.skinS, null);
  // torso
  blk(36, 82, 78, 92, C.shirt, C.shirtS, C.shirtH);
  // emblem: a lightning bolt
  g.fillStyle = C.ol; g.beginPath();
  const bolt = [[80, 96], [62, 122], [74, 122], [68, 146], [90, 114], [77, 114], [84, 96]];
  bolt.forEach(([x, y], i) => (i ? g.lineTo(x + 0.5, y) : g.moveTo(x, y))); g.closePath(); g.lineWidth = 3; g.strokeStyle = C.ol; g.stroke();
  g.fillStyle = C.emb; g.fill();
  // raised arm with a thumbs up
  blk(12, 86, 30, 22, C.shirt, C.shirtS, C.shirtH);
  blk(12, 56, 20, 52, C.skin, C.skinS, C.skinH);
  blk(6, 40, 28, 22, C.skin, C.skinS, C.skinH);
  g.fillStyle = C.ol; for (const y of [46, 51, 56]) g.fillRect(8, y, 16, 1);
  blk(20, 24, 11, 20, C.skin, C.skinS, C.skinH);
  // head
  blk(42, 26, 66, 58, C.skin, C.skinS, C.skinH);
  // hair: a cap with spikes on top and bangs
  const spike = (cx, base, w, h, col) => { for (let i = 0; i < h; i++) { const ww = Math.max(1, Math.round(w * (1 - i / h))); g.fillStyle = col; g.fillRect(Math.round(cx - ww / 2), base - i, ww, 1); } };
  for (const [cx, w, h] of [[48, 16, 16], [61, 18, 22], [76, 18, 25], [91, 18, 21], [104, 15, 15]]) { spike(cx, 30, w + 4, h + 3, C.ol); spike(cx, 30, w, h, C.hair); spike(cx - 2, 28, w * 0.35, h * 0.7, C.hairH); }
  g.fillStyle = C.ol; g.fillRect(40, 24, 70, 14);
  g.fillStyle = C.hair; g.fillRect(42, 26, 66, 10);
  g.fillStyle = C.hairS; g.fillRect(42, 33, 66, 3);
  for (let x = 44; x < 104; x += 10) { g.fillStyle = C.hair; g.beginPath(); g.moveTo(x, 36); g.lineTo(x + 10, 36); g.lineTo(x + 5, 42); g.fill(); }
  if (!evil) {
    // blush and a big open smile
    g.fillStyle = C.blush; g.fillRect(50, 64, 8, 3); g.fillRect(92, 64, 8, 3);
    g.fillStyle = C.ol; g.beginPath(); g.moveTo(60, 64); g.lineTo(90, 64); g.quadraticCurveTo(89, 80, 75, 80); g.quadraticCurveTo(61, 80, 60, 64); g.fill();
    g.fillStyle = C.mouth; g.beginPath(); g.moveTo(62, 66); g.lineTo(88, 66); g.quadraticCurveTo(87, 78, 75, 78); g.quadraticCurveTo(63, 78, 62, 66); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(64, 66, 22, 3);
    g.fillStyle = C.tongue; g.fillRect(69, 74, 12, 3);
  } else {
    // black eye sockets and a grin stretched too wide, full of teeth
    g.fillStyle = '#000'; g.fillRect(53, 44, 16, 17); g.fillRect(81, 44, 16, 17);
    g.beginPath(); g.moveTo(48, 60); g.quadraticCurveTo(75, 66, 102, 60); g.quadraticCurveTo(98, 82, 75, 82); g.quadraticCurveTo(52, 82, 48, 60); g.fill();
    g.fillStyle = C.teeth;
    for (let i = 0; i < 8; i++) { const x = 52 + i * 6; g.beginPath(); g.moveTo(x, 63 + Math.abs(i - 3.5) * -0.4); g.lineTo(x + 5, 63 + Math.abs(i - 3.5) * -0.4); g.lineTo(x + 2.5, 70); g.fill(); }
    for (let i = 0; i < 7; i++) { const x = 55 + i * 6; g.beginPath(); g.moveTo(x, 80); g.lineTo(x + 5, 80); g.lineTo(x + 2.5, 73); g.fill(); }
    // blood on the shirt and hand
    g.fillStyle = C.blood;
    for (const [x, y, r] of [[54, 104, 4], [60, 110, 2], [98, 134, 5], [92, 142, 2], [48, 150, 3], [20, 50, 3], [26, 60, 2]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.fillRect(97, 134, 2, 18); g.fillRect(54, 104, 2, 12);
  }
  const pal = evil ? [C.ol, C.skin, C.skinS, C.skinH, C.hair, C.hairS, C.hairH, C.shirt, C.shirtS, C.shirtH, C.emb, C.teeth, C.blood, C.bloodD]
    : [C.ol, C.skin, C.skinS, C.skinH, C.hair, C.hairS, C.hairH, C.shirt, C.shirtS, C.shirtH, C.emb, C.mouth, C.tongue, C.blush, '#ffffff'];
  return snap(c, pal);
}

/** Chunky banded logo text; evil logos also return where blood can drip from. */
function logoSprite(text, evil, maxW) {
  let size = 34;
  const m = cv(8, 8).getContext('2d');
  do { m.font = `${size}px Bungee, Impact, sans-serif`; } while (m.measureText(text).width > maxW && --size > 14);
  const tw = Math.ceil(m.measureText(text).width), w = tw + 16, h = Math.ceil(size * 1.15) + 14;
  const c = cv(w, h), g = c.getContext('2d');
  const bands = evil ? ['#ff4a3a', '#e0101c', '#a8000e', '#640008'] : ['#fff7a8', '#ffe04a', '#ffb41e', '#ff7e12'];
  const ol = evil ? '#000000' : '#1a1446', sh = evil ? '#2a0000' : '#0a0824', hl = evil ? '#ff9a8a' : '#ffffff';
  g.font = `${size}px Bungee, Impact, sans-serif`; g.textBaseline = 'top'; g.lineJoin = 'round';
  const x = 8, y = 6;
  g.strokeStyle = sh; g.lineWidth = 7; g.strokeText(text, x + 2, y + 3); g.fillStyle = sh; g.fillText(text, x + 2, y + 3);
  g.strokeStyle = ol; g.lineWidth = 6; g.strokeText(text, x, y);
  const f = cv(w, h), fg = f.getContext('2d');
  fg.font = g.font; fg.textBaseline = 'top'; fg.fillStyle = '#fff'; fg.fillText(text, x, y);
  fg.globalCompositeOperation = 'source-atop';
  const top = y + size * 0.12, bot = y + size * 0.86, bh = (bot - top) / bands.length;
  bands.forEach((b, i) => { fg.fillStyle = b; fg.fillRect(0, Math.floor(top + i * bh), w, h); });
  fg.fillStyle = hl; fg.fillRect(0, top - 1, w, 2);
  g.drawImage(f, 0, 0);
  snap(c, [...bands, ol, sh, hl]);
  const drips = [];
  if (evil) {
    // the lowest letter pixel in each column: blood runs from there
    const d = fg.getImageData(0, 0, w, h).data, cols = [];
    for (let xx = 2; xx < w - 2; xx++) { let low = -1; for (let yy = h - 1; yy >= 0; yy--) if (d[(yy * w + xx) * 4 + 3] > 128) { low = yy; break; } if (low > bot - 4) cols.push([xx, low]); }
    for (let i = 0; i < 16 && cols.length; i++) { const [xx, yy] = cols[Math.floor(rnd() * cols.length)]; drips.push({ x: xx, y: yy, max: 5 + rnd() * 26, v: 3 + rnd() * 12, d: rnd() * 2 }); }
  }
  return { c, drips };
}

function textSprite(text, color, outline = '#000000', size = 8) {
  const m = cv(8, 8).getContext('2d'); m.font = `${size}px ${PIX}`;
  const w = Math.ceil(m.measureText(text).width) + 4, c = cv(w, size + 4), g = c.getContext('2d');
  g.font = m.font; g.textBaseline = 'top';
  g.fillStyle = outline; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillText(text, 2 + dx, 2 + dy);
  g.fillStyle = color; g.fillText(text, 2, 2);
  return snap(c, [color, outline]);
}

// ------------------------------------------------------------------ the screen
export class Title {
  /** el: the canvas to draw on. sound: the game's Sound. onEvil: called once the menu should appear. */
  constructor(el, sound, onEvil) {
    this.el = el; this.g = el.getContext('2d');
    this.sound = sound; this.onEvil = onEvil;
    this.state = 'happy'; // happy -> turning -> evil
    this.st = 0; this.t = 0; this.menuX = 0;
    this.mouse = { x: 0.5, y: 0.4 };
    this.buf = cv(16, 16); this.bg = this.buf.getContext('2d');
    this.noise = cv(256, 256);
    { const g = this.noise.getContext('2d'), d = g.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = rnd() < 0.5 ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = rnd() < 0.35 ? 255 : 0; } g.putImageData(d, 0, 0); }
    this.ready = false;
    const fonts = document.fonts ? Promise.all([document.fonts.load('30px Bungee'), document.fonts.load(`8px ${PIX}`)]).catch(() => {}) : Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).then(() => { this.ready = true; this.resize(); });
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => { this.mouse.x = e.clientX / innerWidth; this.mouse.y = e.clientY / innerHeight; });
    this.nextFlash = 5 + rnd() * 6;
  }

  resize() {
    const W = Math.max(240, Math.min(560, Math.round((H * innerWidth) / Math.max(1, innerHeight))));
    this.W = W; this.el.width = W; this.el.height = H;
    this.buf.width = W; this.buf.height = H;
    this.HY = Math.round(H * 0.6); this.GY = Math.round(H * 0.86);
    this.sky = { happy: this.skyLayer('happy'), evil: this.skyLayer('evil') };
    this.land = { happy: this.landLayer('happy'), evil: this.landLayer('evil') };
    this.clouds = { happy: [cloudSprite(PAL.happy.cloud, 0), cloudSprite(PAL.happy.cloud, 1)], evil: [cloudSprite(PAL.evil.cloud, 0), cloudSprite(PAL.evil.cloud, 1)] };
    this.cloudPos = this.cloudPos || [0, 1, 2, 3, 4].map((i) => ({ x: rnd() * 600, y: 8 + i * 17 + rnd() * 8, v: 4 + rnd() * 6, k: i % 2 }));
    this.shine = []; for (let i = 0; i < 40; i++) this.shine.push({ x: rnd() * W, y: this.HY + 3 + Math.floor(rnd() * (this.GY - this.HY - 5)), w: 3 + rnd() * 10, p: rnd() * 6 });
    if (!this.ready) return;
    this.mascot = { happy: mascotSprite(false), evil: mascotSprite(true) };
    const maxW = Math.min(W * 0.92, 320);
    this.logo = { happy: logoSprite('DREAMY HILLS', false, maxW), evil: logoSprite('HORROR.EXE', true, maxW * 0.9) };
    this.txt = {
      start: textSprite('PRESS START', '#ffffff', '#1a1446'), stay: textSprite('STAY FOREVER', '#ff2a2a'),
      copy: textSprite('© 1994 FREE PERIOD', '#ffffff', '#1a1446'), copyE: textSprite('© 1994 FREE PERIOD', '#7a0a10'),
      tap: textSprite(matchMedia('(pointer: coarse)').matches ? 'TAP THE SCREEN' : 'CLICK OR PRESS ANY KEY', '#cfe6ff', '#1a1446'),
    };
  }

  skyLayer(k) {
    const c = cv(this.W, H), g = c.getContext('2d'), P = PAL[k], n = P.sky.length, bh = this.HY / n;
    P.sky.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, Math.floor(i * bh), this.W, Math.ceil(bh) + 1); });
    // dithered seams between the bands, like an old console gradient
    for (let i = 1; i < n; i++) { const y = Math.floor(i * bh); g.fillStyle = P.sky[i]; for (let x = 0; x < this.W; x += 2) g.fillRect(x + ((y >> 0) % 2), y - 1, 1, 1); g.fillStyle = P.sky[i - 1]; for (let x = 1; x < this.W; x += 2) g.fillRect(x, y, 1, 1); }
    return c;
  }

  landLayer(k) {
    const W = this.W, c = cv(W, H), g = c.getContext('2d'), P = PAL[k], HY = this.HY, GY = this.GY;
    for (let x = 0; x < W; x++) {
      const yf = Math.round(HY - 16 - 9 * Math.sin(x * 0.021 + 1) - 6 * Math.sin(x * 0.057 + 2));
      for (let y = yf; y < HY; y++) { g.fillStyle = Math.floor((y - yf) / 3) % 2 ? P.far[1] : P.far[0]; g.fillRect(x, y, 1, 1); }
      const yn = Math.round(HY - 2 - 13 * Math.pow(Math.max(0, Math.sin(x * 0.034 + 0.7)), 0.6));
      for (let y = yn; y < HY; y++) { g.fillStyle = Math.floor((y - yn) / 3) % 2 ? P.near[1] : P.near[0]; g.fillRect(x, y, 1, 1); }
    }
    const wn = P.water.length, wh = (GY - HY) / wn;
    P.water.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, Math.floor(HY + i * wh), W, Math.ceil(wh) + 1); });
    for (let x = 0; x < W; x++) {
      const top = GY - (x % 7 === 0 ? 1 : 0) - (Math.sin(x * 0.4) > 0.6 ? 1 : 0);
      g.fillStyle = P.grass[0]; g.fillRect(x, top, 1, 3 + (GY - top)); g.fillStyle = P.grass[1]; g.fillRect(x, GY + 3, 1, 2);
    }
    for (let y = GY + 5, i = 0; y < H; y += 4, i++) { g.fillStyle = P.soil[i % 2]; g.fillRect(0, y, W, 4); }
    if (k === 'evil') { g.fillStyle = '#5a0008'; for (let i = 0; i < 14; i++) { const x = rnd() * W, y = GY + 6 + rnd() * (H - GY - 8); g.fillRect(x, y, 3 + rnd() * 6, 2); g.fillRect(x + 1, y + 2, 1, 2 + rnd() * 5); } }
    const palm = palmSprite(P, k === 'evil');
    for (const [fx, flip] of [[0.07, 1], [0.94, -1], [0.2, 1]]) {
      if (fx === 0.2 && W < 380) continue;
      g.save(); g.translate(Math.round(W * fx), GY - 92); if (flip < 0) { g.scale(-1, 1); g.translate(-56, 0); } g.drawImage(palm, 0, 0); g.restore();
    }
    return c;
  }

  /** Pressing start: plays the jingle, then the screen turns. Pressing again skips ahead. */
  press() {
    if (this.state === 'happy') { this.state = 'turning'; this.st = 0; this.sound.play('start'); }
    else if (this.state === 'turning' && this.st > 0.25) this.toEvil();
  }
  toEvil() {
    if (this.state === 'evil') return;
    this.state = 'evil'; this.st = 0; this.redFlash = 1;
    this.sound.play('sting');
    this.onEvil && this.onEvil();
  }
  /** Skip straight to the evil title (coming back from a match). */
  setEvil() { if (this.state !== 'evil') { this.state = 'evil'; this.st = 3; this.onEvil && this.onEvil(); } }

  /** What the music should do right now. */
  get music() {
    if (this.state === 'happy') return 'off';
    if (this.state === 'turning') return this.st < 1.1 ? 'normal' : 'off';
    return 'menu';
  }

  update(dt) {
    this.t += dt; this.st += dt;
    const s = this.st;
    if (this.state === 'turning') {
      if (s > 1.1 && !this.s1) { this.s1 = true; this.sound.play('static', 0.8); }
      if (s > 1.25 && !this.s2) { this.s2 = true; this.sound.play('tapestop'); }
      if (s > 2.35) this.toEvil();
    }
    if (this.state === 'evil') {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) { this.nextFlash = 7 + rnd() * 10; this.flashHappy = 0.07; if (rnd() < 0.5) this.sound.play('static', 0.35); }
      this.flashHappy = Math.max(0, (this.flashHappy || 0) - dt);
    }
    this.redFlash = Math.max(0, (this.redFlash || 0) - dt * 1.6);
    const wantX = this.state === 'evil' ? 1 : 0;
    this.menuX += (wantX - this.menuX) * Math.min(1, dt * 5);
  }

  /** Which look to draw this frame, and how broken the picture is. */
  frameLook() {
    const s = this.st;
    if (this.state === 'happy') return { evil: false, tear: 0, noise: 0, red: 0 };
    if (this.state === 'turning') {
      if (s < 1.1) return { evil: false, tear: 0, noise: 0, red: 0 };
      if (s < 1.22) return { evil: true, tear: 0.6, noise: 0.5, red: 0 };
      if (s < 1.6) return { evil: false, tear: 0.1, noise: 0.12, red: (s - 1.22) * 0.6, desat: (s - 1.22) * 1.8 };
      // a few separate flashes (not a strobe), each one longer and more broken
      if (s < 1.75) return { evil: false, tear: 0.15, noise: 0.15, red: 0.26, desat: 0.75 };
      if (s < 1.87) return { evil: true, tear: 0.7, noise: 0.4, red: 0 };
      if (s < 2.1) return { evil: false, tear: 0.3, noise: 0.3, red: 0.3, desat: 0.9 };
      if (s < 2.18) return { evil: true, tear: 0.8, noise: 0.5, red: 0 };
      return { evil: false, tear: 0.5, noise: 0.5, red: 0.35, desat: 1.2 };
    }
    if (this.flashHappy > 0) return { evil: false, tear: 0.5, noise: 0.35, red: 0 };
    return { evil: true, tear: rnd() < 0.015 ? 0.4 : 0, noise: 0.07 + (rnd() < 0.03 ? 0.25 : 0), red: 0 };
  }

  draw() {
    const W = this.W, g = this.bg, t = this.t, look = this.frameLook(), k = look.evil ? 'evil' : 'happy';
    const mx = Math.round(W * (0.5 + this.menuX * (W > 330 ? 0.19 : 0.14)));
    // sky, rays, clouds
    g.drawImage(this.sky[k], 0, 0);
    const hx = mx, hy = H - 170 + 56;
    g.save(); g.beginPath(); g.rect(0, 0, W, this.HY); g.clip();
    const n = 18, rot = look.evil ? 0.05 : t * 0.15;
    g.fillStyle = look.evil ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.13)';
    for (let i = 0; i < n; i += 2) { const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(a0) * 600, hy + Math.sin(a0) * 600); g.lineTo(hx + Math.cos(a1) * 600, hy + Math.sin(a1) * 600); g.fill(); }
    if (look.evil) {
      // a black sun with a burning rim behind the head
      g.fillStyle = '#ff3a12'; g.beginPath(); g.arc(hx, hy - 6, 52, 0, 7); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(hx, hy - 6, 49, 0, 7); g.fill();
    } else {
      g.fillStyle = 'rgba(255,255,230,0.25)'; g.beginPath(); g.arc(hx, hy - 6, 50, 0, 7); g.fill();
    }
    for (const c of this.cloudPos) {
      const v = look.evil ? -c.v * 0.3 : c.v;
      const x = ((c.x + t * v) % (W + 80) + W + 80) % (W + 80) - 70;
      g.drawImage(this.clouds[k][c.k], Math.round(x), Math.round(c.y));
    }
    g.restore();
    g.drawImage(this.land[k], 0, 0);
    // water shimmer (palette cycling)
    g.fillStyle = PAL[k].shine;
    for (const s of this.shine) if (Math.sin(t * (look.evil ? 1.2 : 3) + s.p) > 0.45) g.fillRect(Math.round(s.x), s.y, Math.round(s.w), 1);
    if (this.ready) {
      const sx = mx - 75, sy = H - 170;
      g.drawImage(this.mascot[k], sx, sy);
      this.drawEyes(g, sx, sy, look.evil);
      const L = this.logo[k], ly = 6 + (look.evil ? 0 : Math.round(Math.sin(t * 2.4) * 1.5)), lx = Math.round(Math.max(2, Math.min(W - L.c.width - 2, mx - L.c.width / 2)));
      g.drawImage(L.c, lx, ly);
      if (look.evil) {
        const age = this.state === 'evil' ? this.st : 0.5;
        g.fillStyle = '#9a000c';
        for (const d of L.drips) { const len = Math.min(d.max, Math.max(0, age - d.d) * d.v); if (len < 1) continue; g.fillRect(lx + d.x, ly + d.y, 2, len); g.fillRect(lx + d.x - 1, ly + d.y + len - 1, 4, 3); g.fillStyle = '#ff4a3a'; g.fillRect(lx + d.x, ly + d.y + 1, 1, Math.max(0, len - 3)); g.fillStyle = '#9a000c'; }
      }
      const tx = this.txt;
      if (!look.evil) {
        if (this.state === 'happy') {
          if ((t % 1.1) < 0.72) g.drawImage(tx.start, Math.round(mx - tx.start.width / 2), H - 40);
          g.drawImage(tx.tap, Math.round(mx - tx.tap.width / 2), H - 26);
        }
        g.drawImage(tx.copy, Math.round(W - tx.copy.width - 4), H - 13);
      } else {
        const j = rnd() < 0.1 ? Math.round((rnd() - 0.5) * 4) : 0;
        g.drawImage(tx.stay, Math.round(mx - tx.stay.width / 2) + j, H - 36);
        g.drawImage(tx.copyE, Math.round(W - tx.copyE.width - 4), H - 13);
      }
    } else {
      g.fillStyle = '#fff'; g.font = `8px ${PIX}`; g.fillText('LOADING', W / 2 - 28, H / 2);
    }
    // the turn: colors drain and redden
    if (look.desat) { g.fillStyle = `rgba(60,0,0,${Math.min(0.55, look.desat * 0.5)})`; g.fillRect(0, 0, W, H); }
    if (look.red) { g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(255,${Math.round(255 - look.red * 300)},${Math.round(255 - look.red * 300)},1)`; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    // blit to the screen with tearing, static and flashes
    const o = this.g;
    if (look.tear > 0) {
      for (let y = 0; y < H; y += 6) { const dx = rnd() < look.tear ? Math.round((rnd() - 0.5) * 40 * look.tear) : 0; o.drawImage(this.buf, 0, y, W, 6, dx, y, W, 6); if (dx) { o.fillStyle = look.evil ? '#000' : '#fff'; o.fillRect(dx > 0 ? 0 : W + dx, y, Math.abs(dx), 6); } }
    } else o.drawImage(this.buf, 0, 0);
    if (look.noise > 0) { o.globalAlpha = Math.min(1, look.noise); o.drawImage(this.noise, -Math.floor(rnd() * 200), -Math.floor(rnd() * 200), 512, 512); o.globalAlpha = 1; }
    if (this.redFlash > 0) { o.fillStyle = `rgba(255,0,0,${this.redFlash * 0.6})`; o.fillRect(0, 0, W, H); }
  }

  drawEyes(g, sx, sy, evil) {
    if (!evil) {
      const blink = (this.t % 3.7) < 0.12, wink = this.state === 'turning' && this.st > 0.3 && this.st < 0.9;
      for (const [x, side] of [[58, 0], [86, 1]]) {
        const closed = blink || (wink && side === 1);
        g.fillStyle = '#120a08';
        if (closed) { g.fillRect(sx + x - 1, sy + 54, 9, 2); g.fillRect(sx + x - 2, sy + 52, 2, 2); g.fillRect(sx + x + 7, sy + 52, 2, 2); }
        else { g.fillRect(sx + x, sy + 46, 7, 14); g.fillRect(sx + x - 1, sy + 48, 9, 10); g.fillStyle = '#fff'; g.fillRect(sx + x + 1, sy + 48, 2, 3); }
      }
      return;
    }
    // pupils that follow the pointer, and blood running from the sockets
    const lx = Math.round((this.mouse.x - 0.5) * 8), ly = Math.round((this.mouse.y - 0.45) * 7);
    const age = this.state === 'evil' ? this.st : 1;
    for (const x of [61, 89]) {
      const px = sx + x + Math.max(-4, Math.min(4, lx)) - 2, py = sy + 51 + Math.max(-4, Math.min(4, ly)) - 2;
      g.fillStyle = '#5a0000'; g.fillRect(px - 1, py - 1, 6, 6);
      g.fillStyle = '#ff1a1a'; g.fillRect(px, py, 4, 4);
      g.fillStyle = '#ffd0d0'; g.fillRect(px + 1, py + 1, 2, 2);
      for (const [dx, v, mx] of [[-4, 7, 26], [3, 4.5, 18]]) {
        const len = Math.min(mx, 3 + age * v);
        g.fillStyle = '#8a000c'; g.fillRect(sx + x + dx, sy + 60, 2, len); g.fillRect(sx + x + dx - 1, sy + 60 + len - 2, 4, 3);
      }
    }
  }
}
