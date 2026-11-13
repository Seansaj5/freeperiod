// Fitting a tuning part by hand: five quick-time games, one per part. Keys, mouse and touch all work.
//   bolts  stop the needle in the green, five times            (engine)
//   spool  alternate left / right fast enough to hit full boost (turbo)
//   bleed  repeat the arrow sequence before the line goes soft  (brakes)
//   lugs   hit each wheel nut as it lights, in star order       (tires)
//   fill   hold to fill the bottle, let go in the green band    (nitro)
// play(kind, title) resolves { ok, perfect, quit }.

const W = 520, H = 300, TAU = Math.PI * 2;
const C = { ink: '#f3f5fb', mute: '#8f98b3', line: 'rgba(255,255,255,0.14)', amber: '#ffb020', green: '#6dff8a', red: '#ff3b4e', cyan: '#3de0ff', dark: '#0c1020' };
const LEFT = ['KeyA', 'ArrowLeft'], RIGHT = ['KeyD', 'ArrowRight'], UPK = ['KeyW', 'ArrowUp'], DOWN = ['KeyS', 'ArrowDown'], GO = ['Space', 'Enter'];
const DIRS = [{ k: UPK, a: -Math.PI / 2 }, { k: RIGHT, a: 0 }, { k: DOWN, a: Math.PI / 2 }, { k: LEFT, a: Math.PI }];
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export class Qte {
  constructor(root, sound) {
    this.root = root; this.sound = sound; this.active = false;
    root.innerHTML = '<div class="qte-card"><div class="qte-top"><b id="qte-title"></b><span id="qte-step"></span></div><canvas id="qte-cv"></canvas><div class="qte-tip" id="qte-tip"></div></div>';
    this.cv = root.querySelector('canvas'); this.g = this.cv.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.cv.width = W * dpr; this.cv.height = H * dpr; this.g.scale(dpr, dpr);
    this.held = false;
    const pos = (e) => { const r = this.cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape') return this.finish(false, true);
      if (GO.includes(e.code)) this.held = true;
      this.game?.key?.(e.code);
    }, true);
    addEventListener('keyup', (e) => { if (!this.active) return; e.stopImmediatePropagation(); if (GO.includes(e.code)) { this.held = false; this.game?.release?.(); } }, true);
    this.cv.addEventListener('pointerdown', (e) => { if (!this.active) return; e.preventDefault(); this.held = true; this.game?.tap?.(...pos(e)); });
    addEventListener('pointerup', () => { if (this.active && this.held) { this.held = false; this.game?.release?.(); } });
  }

  play(kind, title) {
    return new Promise((res) => {
      this.res = res; this.active = true; this.done = null; this.held = false;
      this.misses = 0; this.t = 0; this.flashT = 0; this.flashCol = C.green;
      this.root.classList.remove('hidden');
      this.root.querySelector('#qte-title').textContent = title;
      this.game = GAMES[kind](this);
      this.root.querySelector('#qte-tip').textContent = this.game.tip;
      this.last = performance.now();
      const loop = (now) => {
        if (!this.active) return;
        const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
        this.tick(dt);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }

  hit() { this.flashT = 0.25; this.flashCol = C.green; this.sound.play('tick', { gain: 0.5, rate: 1.3 }); }
  miss() { this.misses++; this.flashT = 0.35; this.flashCol = C.red; this.sound.play('clank', { gain: 0.4, rate: 0.7 }); if (this.misses >= this.game.lives) this.finish(false); }
  finish(ok, quit = false) {
    if (this.done) return;
    this.done = { ok, perfect: ok && this.misses === 0 && (this.game.perfect ? this.game.perfect() : true), quit, t: 0 };
    if (ok) this.sound.play('chaching', { gain: 0.5 }); else this.sound.play('crash_small', { gain: 0.4 });
  }

  tick(dt) {
    const g = this.g, G = this.game;
    this.t += dt; this.flashT = Math.max(0, this.flashT - dt);
    if (!this.done && this.t > 0.7) G.update(dt, this.held);
    g.clearRect(0, 0, W, H);
    G.draw(g, this.t);
    // misses left, top right
    g.font = '700 13px Outfit, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let i = 0; i < G.lives; i++) { g.fillStyle = i < G.lives - this.misses ? C.amber : 'rgba(255,255,255,0.14)'; g.beginPath(); g.arc(W - 14 - i * 16, 14, 5, 0, TAU); g.fill(); }
    if (this.flashT > 0) { g.globalAlpha = this.flashT * 1.6; g.strokeStyle = this.flashCol; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6); g.globalAlpha = 1; }
    this.root.querySelector('#qte-step').textContent = G.step();
    if (this.t < 0.7) { g.fillStyle = 'rgba(8,11,22,0.72)'; g.fillRect(0, 0, W, H); big(g, 'GET READY', C.amber); }
    if (this.done) {
      this.done.t += dt;
      g.fillStyle = 'rgba(8,11,22,0.78)'; g.fillRect(0, 0, W, H);
      big(g, this.done.quit ? 'WALKED AWAY' : this.done.ok ? (this.done.perfect ? 'PERFECT FIT' : 'FITTED') : 'BOTCHED IT', this.done.ok ? C.green : C.red);
      if (this.done.t > 0.95) { this.active = false; this.root.classList.add('hidden'); const d = this.done; this.game = null; this.res({ ok: d.ok, perfect: d.perfect, quit: d.quit }); }
    }
  }
}

function big(g, text, col) { g.font = "400 40px Bungee, 'Outfit', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(text, W / 2, H / 2); }
function label(g, text, x, y, col = C.mute, size = 13) { g.font = `700 ${size}px Outfit, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(text, x, y); }
function arrow(g, x, y, a, r, col) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col;
  g.beginPath(); g.moveTo(r, 0); g.lineTo(-r * 0.2, -r * 0.8); g.lineTo(-r * 0.2, -r * 0.3); g.lineTo(-r, -r * 0.3); g.lineTo(-r, r * 0.3); g.lineTo(-r * 0.2, r * 0.3); g.lineTo(-r * 0.2, r * 0.8); g.closePath(); g.fill();
  g.restore();
}

const GAMES = {
  // ---- engine: stop the needle in the green
  bolts(q) {
    const N = 5; let n = 0, ang = 0, zone = 1.2, zw = 0.8, dir = 1;
    const next = () => { zone = Math.random() * TAU; zw = 0.82 - n * 0.09; dir = -dir; };
    next();
    const press = () => { if (Math.abs(angDiff(ang, zone)) < zw / 2) { n++; q.hit(); if (n >= N) q.finish(true); else next(); } else q.miss(); };
    return {
      lives: 3, tip: 'Press Space (or tap) when the needle is in the green', step: () => `Bolt ${Math.min(N, n + 1)} of ${N}`,
      key: (c) => { if (GO.includes(c)) press(); }, tap: press,
      update: (dt) => { ang = (ang + dir * (2.6 + n * 0.5) * dt + TAU) % TAU; },
      draw: (g) => {
        const cx = W / 2, cy = H / 2 + 6, R = 104;
        g.lineWidth = 16; g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
        g.strokeStyle = C.green; g.beginPath(); g.arc(cx, cy, R, zone - zw / 2, zone + zw / 2); g.stroke();
        for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + (i / N) * TAU, x = cx + Math.cos(a) * 46, y = cy + Math.sin(a) * 46; g.fillStyle = i < n ? C.green : '#2a3046'; g.beginPath(); for (let k = 0; k < 6; k++) g.lineTo(x + Math.cos(k * TAU / 6) * 13, y + Math.sin(k * TAU / 6) * 13); g.fill(); }
        g.strokeStyle = C.ink; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + Math.cos(ang) * 70, cy + Math.sin(ang) * 70); g.lineTo(cx + Math.cos(ang) * (R + 12), cy + Math.sin(ang) * (R + 12)); g.stroke();
      },
    };
  },
  // ---- turbo: alternate left / right to build boost before the clock runs out
  spool(q) {
    let boost = 0, want = 0, time = 7, spin = 0, used = 0;
    const press = (side) => { if (want && side !== want) return; want = -side; boost = Math.min(1, boost + 0.05); spin += 0.6; q.sound.play('tick', { gain: 0.25, rate: 0.8 + boost }); if (boost >= 1) q.finish(true); };
    return {
      lives: 1, tip: 'Tap A and D (or the two pads) one after the other, fast', step: () => `${Math.round(boost * 100)}% boost`,
      perfect: () => used < 4.2,
      key: (c) => { if (LEFT.includes(c)) press(-1); else if (RIGHT.includes(c)) press(1); },
      tap: (x) => press(x < W / 2 ? -1 : 1),
      update: (dt) => { boost = Math.max(0, boost - 0.17 * dt); time -= dt; used += dt; spin += boost * 18 * dt; if (time <= 0) q.miss(); },
      draw: (g) => {
        const cx = W / 2, cy = 118;
        g.save(); g.translate(cx, cy); g.rotate(spin);
        for (let i = 0; i < 9; i++) { g.rotate(TAU / 9); g.fillStyle = i % 2 ? '#9aa4bd' : '#c9d0e2'; g.beginPath(); g.moveTo(10, -6); g.quadraticCurveTo(46, -26, 62, 4); g.quadraticCurveTo(40, 2, 10, 8); g.fill(); }
        g.fillStyle = '#30374f'; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill(); g.restore();
        g.strokeStyle = C.line; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 70, 0, TAU); g.stroke();
        const bx = 60, bw = W - 120, by = 214;
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(bx, by, bw, 16);
        g.fillStyle = boost > 0.8 ? C.green : C.amber; g.fillRect(bx, by, bw * boost, 16);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(bx, by + 24, bw, 5); g.fillStyle = time < 2 ? C.red : C.cyan; g.fillRect(bx, by + 24, bw * Math.max(0, time / 7), 5);
        for (const s of [-1, 1]) { const on = want === 0 || want === s; g.fillStyle = on ? 'rgba(61,224,255,0.18)' : 'rgba(255,255,255,0.05)'; g.beginPath(); g.roundRect(s < 0 ? 16 : W - 96, 78, 80, 80, 14); g.fill(); arrow(g, s < 0 ? 56 : W - 56, 118, s < 0 ? Math.PI : 0, 20, on ? C.cyan : '#3a4160'); }
        label(g, 'A', 56, 174); label(g, 'D', W - 56, 174);
      },
    };
  },
  // ---- brakes: repeat the arrow sequence
  bleed(q) {
    const LEN = [4, 5, 6]; let round = 0, seq = [], at = 0, time = 0, max = 1;
    const deal = () => { seq = Array.from({ length: LEN[round] }, () => Math.floor(Math.random() * 4)); at = 0; max = time = LEN[round] * 0.8 + 1.2; };
    deal();
    const press = (d) => { if (d === seq[at]) { at++; q.hit(); if (at >= seq.length) { round++; if (round >= LEN.length) q.finish(true); else deal(); } } else { q.miss(); at = 0; } };
    const pad = (i) => [W / 2 + [0, 62, 0, -62][i], 232 + [-30, 0, 30, 0][i]];
    return {
      lives: 3, tip: 'Press the arrows in order (WASD or arrow keys, or tap the pads)', step: () => `Line ${Math.min(3, round + 1)} of 3`,
      key: (c) => { const i = DIRS.findIndex((d) => d.k.includes(c)); if (i >= 0) press(i); },
      tap: (x, y) => { for (let i = 0; i < 4; i++) { const [px, py] = pad(i); if (Math.hypot(x - px, y - py) < 30) return press(i); } },
      update: (dt) => { time -= dt; if (time <= 0) { q.miss(); at = 0; time = max; } },
      draw: (g) => {
        const n = seq.length, gap = 62, x0 = W / 2 - ((n - 1) * gap) / 2;
        for (let i = 0; i < n; i++) {
          const x = x0 + i * gap, done = i < at, cur = i === at;
          g.fillStyle = done ? 'rgba(109,255,138,0.16)' : cur ? 'rgba(255,176,32,0.18)' : 'rgba(255,255,255,0.06)'; g.beginPath(); g.roundRect(x - 26, 54, 52, 52, 10); g.fill();
          arrow(g, x, 80, DIRS[seq[i]].a, 15, done ? C.green : cur ? C.amber : '#aeb6cc');
        }
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(70, 126, W - 140, 6); g.fillStyle = time < 1.5 ? C.red : C.cyan; g.fillRect(70, 126, (W - 140) * Math.max(0, time / max), 6);
        for (let i = 0; i < 4; i++) { const [px, py] = pad(i); g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.arc(px, py, 26, 0, TAU); g.fill(); arrow(g, px, py, DIRS[i].a, 12, '#c9d0e2'); }
      },
    };
  },
  // ---- tires: hit each wheel nut as it lights, in star order
  lugs(q) {
    const ORDER = [0, 2, 4, 1, 3]; let n = 0, time = 1.2, max = 1.2;
    const P = (i) => { const a = -Math.PI / 2 + (i / 5) * TAU; return [W / 2 + Math.cos(a) * 62, H / 2 + 4 + Math.sin(a) * 62]; };
    const cur = () => ORDER[n % 5];
    const press = (i) => { if (i === cur()) { n++; q.hit(); max = n >= 5 ? 0.92 : 1.2; time = max; if (n >= 10) q.finish(true); } else q.miss(); };
    return {
      lives: 3, tip: 'Hit the lit nut: press its number (1 to 5) or tap it', step: () => `Wheel ${n >= 5 ? 2 : 1} of 2 · nut ${(n % 5) + 1}`,
      key: (c) => { const m = /^(?:Digit|Numpad)([1-5])$/.exec(c); if (m) press(+m[1] - 1); },
      tap: (x, y) => { for (let i = 0; i < 5; i++) { const [px, py] = P(i); if (Math.hypot(x - px, y - py) < 26) return press(i); } },
      update: (dt) => { time -= dt; if (time <= 0) { q.miss(); time = max; } },
      draw: (g) => {
        const cx = W / 2, cy = H / 2 + 4;
        g.fillStyle = '#12151f'; g.beginPath(); g.arc(cx, cy, 128, 0, TAU); g.fill();
        g.fillStyle = '#2b3147'; g.beginPath(); g.arc(cx, cy, 104, 0, TAU); g.fill();
        g.strokeStyle = '#3d4563'; g.lineWidth = 12; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + ((i + 0.5) / 5) * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); g.lineTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100); g.stroke(); }
        for (let i = 0; i < 5; i++) {
          const [x, y] = P(i), lit = i === cur(), done = ORDER.indexOf(i) < n % 5 || n >= 10;
          if (lit) { g.strokeStyle = C.amber; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, time / max)); g.stroke(); }
          g.fillStyle = lit ? C.amber : done ? C.green : '#8891ab'; g.beginPath(); for (let k = 0; k < 6; k++) g.lineTo(x + Math.cos(k * TAU / 6) * 16, y + Math.sin(k * TAU / 6) * 16); g.fill();
          label(g, String(i + 1), x, y + 1, C.dark, 14);
        }
      },
    };
  },
  // ---- exhaust: hold to run the weld along the pipe, let go in the green band
  weld(q) { return GAMES.fill(q, true); },
  // ---- hold to fill, let go in the green band
  fill(q, weld = false) {
    const N = 3; let n = 0, lvl = 0, lo = 0.6, hi = 0.75, filling = false, wait = 0;
    const band = () => { const w = 0.15 - n * 0.03; lo = 0.5 + Math.random() * (0.38 - w); hi = lo + w; lvl = 0; };
    band();
    const stop = () => { if (!filling) return; filling = false; if (lvl >= lo && lvl <= hi) { n++; q.hit(); if (n >= N) return q.finish(true); } else q.miss(); wait = 0.45; };
    return {
      lives: 2, tip: weld ? 'Hold Space (or hold your finger down) to weld along the pipe. Let go in the green' : 'Hold Space (or hold your finger down) to fill. Let go in the green', step: () => `${weld ? 'Seam' : 'Bottle'} ${Math.min(N, n + 1)} of ${N}`,
      release: stop,
      update: (dt, held) => {
        if (wait > 0) { wait -= dt; if (wait <= 0) band(); return; }
        if (held) { filling = true; lvl += (0.32 + lvl * 0.95 + n * 0.12) * dt; if (lvl >= 1) { lvl = 1; filling = false; q.miss(); wait = 0.45; } }
      },
      draw: (g, t) => {
        if (weld) { // a pipe across the card, the torch running left to right
          const x0 = 50, x1 = W - 50, y = H / 2 + 6, X = (v) => x0 + (x1 - x0) * v;
          g.fillStyle = '#39415e'; g.beginPath(); g.roundRect(x0 - 10, y - 26, x1 - x0 + 20, 52, 26); g.fill();
          g.fillStyle = '#4b5578'; g.fillRect(x0, y - 22, x1 - x0, 12);
          g.fillStyle = 'rgba(109,255,138,0.3)'; g.fillRect(X(lo), y - 26, X(hi) - X(lo), 52);
          g.strokeStyle = C.green; g.lineWidth = 2; for (const v of [lo, hi]) { g.beginPath(); g.moveTo(X(v), y - 36); g.lineTo(X(v), y + 36); g.stroke(); }
          g.strokeStyle = lvl > hi ? C.red : C.amber; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y); g.lineTo(X(lvl), y); g.stroke();
          if (filling) { const r = 10 + Math.sin(t * 60) * 3; g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(X(lvl), y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,176,32,0.5)'; g.beginPath(); g.arc(X(lvl), y, r * 2, 0, TAU); g.fill(); }
          return;
        }
        const bx = W / 2 - 38, bw = 76, by = 40, bh = 220;
        g.fillStyle = '#1b2033'; g.beginPath(); g.roundRect(bx, by, bw, bh, 30); g.fill();
        g.fillStyle = '#39415e'; g.fillRect(W / 2 - 12, by - 14, 24, 16);
        g.save(); g.beginPath(); g.roundRect(bx + 6, by + 6, bw - 12, bh - 12, 24); g.clip();
        g.fillStyle = 'rgba(109,255,138,0.28)'; g.fillRect(bx, by + bh * (1 - hi), bw, bh * (hi - lo));
        g.fillStyle = lvl > hi ? C.red : C.cyan; g.fillRect(bx, by + bh * (1 - lvl), bw, bh * lvl);
        g.restore();
        g.strokeStyle = C.green; g.lineWidth = 2; for (const v of [lo, hi]) { g.beginPath(); g.moveTo(bx - 14, by + bh * (1 - v)); g.lineTo(bx + bw + 14, by + bh * (1 - v)); g.stroke(); }
        label(g, 'N2O', W / 2, by + bh / 2, 'rgba(255,255,255,0.5)', 18);
      },
    };
  },
};
export const QTE_KINDS = Object.keys(GAMES);
