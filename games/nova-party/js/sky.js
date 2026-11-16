// The backdrop: a low-resolution night sky scaled up into chunky pixels. A dithered gradient and nebula are painted
// once; stars twinkle, two planets and the blue moon drift, and now and then a shooting star crosses.
import { makePlanet, dith } from './pix.js';

const SCALE = 4;
const BANDS = ['#05071a', '#080b24', '#0c0f2e', '#111338', '#171540', '#1d1647'];

export class Sky {
  constructor(cv) {
    this.cv = cv; this.g = cv.getContext('2d');
    this.t = 0; this.last = 0; this.shoot = null; this.nextShoot = 4;
    this.gas = makePlanet(15, ['#3a1d52', '#6b2f6e', '#b8508a', '#ff8fa8', '#ffd0b0'], { bands: 9, ring: ['#ffd9a8', '#b88a7a'], seed: 5 });
    this.moon = makePlanet(9, ['#1c2f8a', '#3d5fd0', '#5d86ff', '#a8c4ff', '#e6f0ff'], { craters: 5, seed: 9 });
    this.rock = makePlanet(5, ['#3c2a2a', '#7a4a3a', '#c8805a', '#ffc08a'], { craters: 3, seed: 3 });
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const W = this.W = Math.max(80, Math.ceil(innerWidth / SCALE)), H = this.H = Math.max(60, Math.ceil(innerHeight / SCALE));
    this.cv.width = W; this.cv.height = H;
    let s = 1234567;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
    // the still layer
    const b = this.back = document.createElement('canvas'); b.width = W; b.height = H;
    const g = b.getContext('2d');
    const noise = (x, y) => Math.sin(x * 0.045 + Math.sin(y * 0.06) * 2.1) * 0.5 + Math.sin(y * 0.05 - x * 0.021 + 1.7) * 0.5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const f = (y / H) * (BANDS.length - 1), i = Math.floor(f) + (f - Math.floor(f) > dith(x, y) ? 1 : 0);
      g.fillStyle = BANDS[Math.min(BANDS.length - 1, i)]; g.fillRect(x, y, 1, 1);
      const n = noise(x, y) * 0.5 + 0.5, n2 = noise(x * 1.7 + 40, y * 1.4 - 20) * 0.5 + 0.5;
      if (n * n2 > 0.3 + dith(x, y) * 0.5) { g.fillStyle = n > 0.72 ? 'rgba(90,209,255,0.16)' : 'rgba(197,139,255,0.15)'; g.fillRect(x, y, 1, 1); }
    }
    this.stars = Array.from({ length: Math.floor(W * H / 170) }, () => ({ x: Math.floor(rnd() * W), y: Math.floor(rnd() * H), p: rnd() * 6.3, s: 0.4 + rnd() * 2.2, big: rnd() < 0.07, c: rnd() < 0.2 ? '#9fe6ff' : rnd() < 0.2 ? '#ffe9a8' : '#ffffff' }));
  }
  frame(now) {
    if (now - this.last < 66) return;                 // about 15 frames a second is plenty for a sky
    const dt = Math.min(0.2, (now - this.last) / 1000); this.last = now; this.t += dt;
    const g = this.g, W = this.W, H = this.H, t = this.t;
    g.drawImage(this.back, 0, 0);
    for (const s of this.stars) {
      const a = Math.sin(t * s.s + s.p);
      if (a < -0.55) continue;
      g.fillStyle = a > 0.5 ? s.c : '#7c86b8';
      g.fillRect(s.x, s.y, 1, 1);
      if (s.big && a > 0.2) { g.fillRect(s.x - 1, s.y, 3, 1); g.fillRect(s.x, s.y - 1, 1, 3); }
    }
    const drift = (cv, fx, fy, sp, amp) => g.drawImage(cv, Math.round(W * fx - cv.width / 2 + Math.sin(t * sp) * amp), Math.round(H * fy - cv.height / 2 + Math.cos(t * sp * 0.8) * amp * 0.6));
    drift(this.gas, 0.86, 0.2, 0.05, 5);
    drift(this.moon, 0.1, 0.72, 0.07, 4);
    drift(this.rock, 0.24, 0.14, 0.09, 3);
    this.nextShoot -= dt;
    if (this.nextShoot <= 0 && !this.shoot) { this.shoot = { x: Math.random() * W * 0.8, y: Math.random() * H * 0.4, a: 0 }; this.nextShoot = 5 + Math.random() * 9; }
    if (this.shoot) {
      const s = this.shoot; s.a += dt; s.x += dt * 90; s.y += dt * 38;
      for (let i = 0; i < 7; i++) { g.fillStyle = i < 2 ? '#ffffff' : i < 4 ? '#9fe6ff' : '#3b4a9a'; g.fillRect(Math.round(s.x - i * 2.2), Math.round(s.y - i * 0.93), 1, 1); }
      if (s.a > 0.9) this.shoot = null;
    }
  }
}
