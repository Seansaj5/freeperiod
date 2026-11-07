// All sound is synthesised with Web Audio: no sound files to download.
export class Sound {
  constructor() { this.ctx = null; this.volume = 0.7; }

  /** Must be called from a click/keypress (browsers block audio until then). */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
    // engine: two detuned saws + a sub through a low-pass filter
    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.Q.value = 2.5;
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'sawtooth'; this.o2.detune.value = 14;
    this.o3 = ctx.createOscillator(); this.o3.type = 'square';
    const g3 = ctx.createGain(); g3.gain.value = 0.5;
    this.o1.connect(this.eFilter); this.o2.connect(this.eFilter); this.o3.connect(g3); g3.connect(this.eFilter);
    this.eFilter.connect(this.eGain); this.eGain.connect(this.master);
    for (const o of [this.o1, this.o2, this.o3]) o.start();
    // wind: looping noise through a band-pass
    this.noise = noiseBuffer(ctx);
    const wn = ctx.createBufferSource(); wn.buffer = this.noise; wn.loop = true;
    this.wFilter = ctx.createBiquadFilter(); this.wFilter.type = 'bandpass'; this.wFilter.frequency.value = 700; this.wFilter.Q.value = 0.6;
    this.wGain = ctx.createGain(); this.wGain.gain.value = 0;
    wn.connect(this.wFilter); this.wFilter.connect(this.wGain); this.wGain.connect(this.master); wn.start();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** rpm, load 0..1, speed m/s, on = engine running (false in menus = quiet idle) */
  engine(rpm, load, speed, on, boosting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = (rpm / 60) * 2; // firing frequency of a four-cylinder
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 1.005, t, 0.03);
    this.o3.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.eFilter.frequency.setTargetAtTime(240 + load * 1500 + rpm * 0.18 + (boosting ? 900 : 0), t, 0.05);
    this.eGain.gain.setTargetAtTime(on ? 0.05 + load * 0.07 : 0.025, t, 0.08);
    const w = Math.min(1, speed / 95);
    this.wGain.gain.setTargetAtTime(on ? w * w * 0.32 : 0, t, 0.1);
    this.wFilter.frequency.setTargetAtTime(500 + w * 1500, t, 0.1);
  }

  burst({ dur, from, to, q = 1, gain = 0.5, pan = 0, type = 'bandpass' }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    src.connect(f); f.connect(g); node.connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  tone(freq, at, dur, gain = 0.12, type = 'sine') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  whoosh(side, tier) { this.burst({ dur: 0.35 + tier * 0.05, from: 2600 - tier * 500, to: 380, q: 1.4, gain: 0.5 - tier * 0.1, pan: -side * 0.8 }); }
  near(tier) { const base = [880, 740, 587][tier] || 587; this.tone(base, 0, 0.12, 0.07, 'triangle'); this.tone(base * 1.5, 0.05, 0.14, 0.05, 'triangle'); }
  split() { [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, i * 0.04, 0.16, 0.07, 'square')); }
  bank() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.07, 0.3, 0.1, 'triangle')); }
  lost() { [392, 330, 262].forEach((f, i) => this.tone(f, i * 0.09, 0.22, 0.08, 'sawtooth')); }
  crash(impact) {
    const k = Math.min(1, impact / 30);
    this.burst({ dur: 0.7, from: 1600, to: 90, q: 0.5, gain: 0.5 + k * 0.4, type: 'lowpass' });
    this.tone(70, 0, 0.35, 0.3 * (0.4 + k), 'sine');
  }
  wall(impact) { this.burst({ dur: 0.3, from: 3000, to: 900, q: 2, gain: Math.min(0.5, impact / 12) }); }
  click() { this.tone(1200, 0, 0.05, 0.05, 'square'); }
  buy() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, i * 0.06, 0.25, 0.09, 'triangle')); }
}

function noiseBuffer(ctx) {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
