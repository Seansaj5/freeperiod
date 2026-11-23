// Every sound is made here with Web Audio (no sound files): guns, engines, sirens, crashes, cash and a little car radio.
const GUN = [null, null, { f: 1500, q: 0.8, len: 0.13, thump: 110, vol: 0.5 }, { f: 2100, q: 1, len: 0.08, thump: 150, vol: 0.38 }, { f: 700, q: 0.5, len: 0.3, thump: 70, vol: 0.75 }, { f: 1200, q: 0.7, len: 0.14, thump: 95, vol: 0.55 }, { f: 600, q: 0.4, len: 0.45, thump: 55, vol: 0.9 }];

export class Sfx {
  constructor() { this.vol = 0.8; this.music = true; this.ctx = null; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.out = c.createGain(); this.out.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; this.out.connect(comp); comp.connect(c.destination);
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = n;
    // engine: two saws and a sub through a low-pass
    this.eg = c.createGain(); this.eg.gain.value = 0; this.ef = c.createBiquadFilter(); this.ef.type = 'lowpass'; this.ef.frequency.value = 500; this.ef.connect(this.eg); this.eg.connect(this.out);
    this.eo = [['sawtooth', 1], ['sawtooth', 1.502], ['square', 0.5]].map(([t, m]) => { const o = c.createOscillator(); o.type = t; o.frequency.value = 60 * m; const g = c.createGain(); g.gain.value = m === 0.5 ? 0.5 : 0.32; o.connect(g); g.connect(this.ef); o.start(); return { o, m }; });
    // tyres
    this.sg = c.createGain(); this.sg.gain.value = 0; const sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1700; sf.Q.value = 3; const ss = c.createBufferSource(); ss.buffer = n; ss.loop = true; ss.connect(sf); sf.connect(this.sg); this.sg.connect(this.out); ss.start();
    // siren
    this.wg = c.createGain(); this.wg.gain.value = 0; const wo = c.createOscillator(); wo.type = 'square'; wo.frequency.value = 700; const wl = c.createOscillator(); wl.frequency.value = 0.42; const wd = c.createGain(); wd.gain.value = 260; wl.connect(wd); wd.connect(wo.frequency);
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 1900; wo.connect(wf); wf.connect(this.wg); this.wg.connect(this.out); wo.start(); wl.start();
    // radio
    this.rg = c.createGain(); this.rg.gain.value = 0; this.rg.connect(this.out); this.rT = 0; this.rStep = 0; this.rOn = false;
  }
  setVol(v) { this.vol = v; if (this.out) this.out.gain.value = v; }
  burst(f, q, len, vol, type = 'bandpass') {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
    s.buffer = this.noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(fl); fl.connect(g); g.connect(this.out); s.start(t, Math.random()); s.stop(t + len + 0.02);
  }
  tone(f0, f1, len, vol, type = 'sine', when = 0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + len + 0.02);
  }
  shot(w, dist = 0) {
    if (!this.ctx) return; const G = GUN[w] || GUN[2], a = 1 / (1 + (dist / 22) ** 2); if (a < 0.02) return;
    this.burst(G.f * (dist > 30 ? 0.6 : 1), G.q, G.len * (1 + dist / 120), G.vol * a); this.tone(G.thump * 2, G.thump * 0.5, G.len * 0.8, G.vol * 0.8 * a, 'triangle');
    if (dist < 8) this.burst(5200, 2, 0.04, G.vol * 0.35, 'highpass');
  }
  punch() { if (!this.ctx) return; this.burst(400, 0.8, 0.09, 0.5); this.tone(160, 60, 0.1, 0.5, 'triangle'); }
  swish() { if (this.ctx) this.burst(2600, 2, 0.12, 0.12); }
  boom(dist = 0) { if (!this.ctx) return; const a = 1 / (1 + (dist / 60) ** 2); this.burst(160, 0.4, 1.4, 1.2 * a, 'lowpass'); this.tone(90, 28, 0.9, 1.0 * a, 'sine'); this.burst(900, 0.5, 0.35, 0.5 * a); }
  crash(v) { if (!this.ctx) return; const a = Math.min(1, v / 22); this.burst(300 + Math.random() * 200, 0.6, 0.18 + a * 0.2, 0.3 + a * 0.6, 'lowpass'); this.burst(3000, 1.5, 0.1, a * 0.3); }
  glass() { if (this.ctx) { this.burst(5200, 3, 0.22, 0.35, 'highpass'); this.tone(2400, 900, 0.12, 0.12, 'triangle'); } }
  cash() { if (this.ctx) { this.tone(1320, 1320, 0.09, 0.22, 'square'); this.tone(1760, 1760, 0.16, 0.22, 'square', 0.08); } }
  ui() { if (this.ctx) this.tone(880, 660, 0.05, 0.12, 'square'); }
  deny() { if (this.ctx) this.tone(200, 140, 0.14, 0.2, 'sawtooth'); }
  heat(up) { if (!this.ctx) return; if (up) { this.tone(760, 760, 0.1, 0.22, 'square'); this.tone(980, 980, 0.14, 0.22, 'square', 0.12); } else { this.tone(880, 1320, 0.25, 0.2, 'sine'); } }
  win() { if (this.ctx) [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, f, 0.22, 0.24, 'square', k * 0.09)); }
  fail() { if (this.ctx) { this.tone(330, 110, 0.7, 0.3, 'sawtooth'); this.tone(220, 70, 0.9, 0.3, 'triangle', 0.1); } }
  tick(ok) { if (this.ctx) this.tone(ok ? 1100 : 300, ok ? 1500 : 200, 0.07, 0.2, 'square'); }
  door() { if (this.ctx) { this.burst(500, 1, 0.07, 0.3, 'lowpass'); this.tone(120, 70, 0.08, 0.3, 'triangle', 0.02); } }
  step() { if (this.ctx) this.burst(900 + Math.random() * 400, 1.2, 0.035, 0.05, 'lowpass'); }
  horn() { if (this.ctx) { this.tone(420, 420, 0.3, 0.2, 'square'); this.tone(530, 530, 0.3, 0.2, 'square'); } }
  /** Call every frame. car: { rpm 0..1, gas, slip } or null. siren: distance to the nearest siren or null. */
  frame(dt, car, siren, hi) {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    if (car) { const f = (hi ? 52 : 44) + car.rpm * (hi ? 150 : 115); for (const e of this.eo) e.o.frequency.setTargetAtTime(f * e.m, t, 0.04); this.ef.frequency.setTargetAtTime(280 + car.rpm * 1700 + (car.gas > 0 ? 700 : 0), t, 0.06); this.eg.gain.setTargetAtTime(0.1 + (car.gas > 0 ? 0.11 : 0.02) + car.rpm * 0.05, t, 0.08); this.sg.gain.setTargetAtTime(Math.min(0.3, Math.max(0, car.slip - 2.5) * 0.06), t, 0.05); }
    else { this.eg.gain.setTargetAtTime(0, t, 0.1); this.sg.gain.setTargetAtTime(0, t, 0.05); }
    this.wg.gain.setTargetAtTime(siren === null ? 0 : 0.11 / (1 + (siren / 45) ** 2), t, 0.15);
    // radio: a small looping groove, only in a car
    const on = !!car && this.music; this.rg.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.3);
    if (!on) { this.rT = 0; return; }
    if (this.rT < t) this.rT = t + 0.05;
    while (this.rT < t + 0.25) {
      const s = this.rStep++ % 64, bar = (s / 16) | 0, root = [110, 87.31, 130.81, 98][bar], w = this.rT - t, R = (f0, f1, len, vol, type) => { const o = c.createOscillator(), g = c.createGain(), T = c.currentTime + w; o.type = type; o.frequency.setValueAtTime(f0, T); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), T + len); g.gain.setValueAtTime(vol, T); g.gain.exponentialRampToValueAtTime(0.001, T + len); o.connect(g); g.connect(this.rg); o.start(T); o.stop(T + len + 0.02); };
      if (s % 4 === 0) R(150, 45, 0.16, 0.5, 'sine');
      if (s % 8 === 4) { const b = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(), T = c.currentTime + w; b.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 1800; g.gain.setValueAtTime(0.22, T); g.gain.exponentialRampToValueAtTime(0.001, T + 0.12); b.connect(f); f.connect(g); g.connect(this.rg); b.start(T, Math.random()); b.stop(T + 0.14); }
      if (s % 2 === 0) R(root * (s % 8 === 6 ? 1.5 : 1), root * (s % 8 === 6 ? 1.5 : 1), 0.11, 0.2, 'sawtooth');
      if ([0, 3, 6, 10, 12].includes(s % 16)) { const n = [2, 3, 4, 3, 2.5][[0, 3, 6, 10, 12].indexOf(s % 16)]; R(root * n, root * n, 0.2, 0.07, 'square'); }
      this.rT += 0.125;
    }
  }
}
