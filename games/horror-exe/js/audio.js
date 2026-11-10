// All sound is made with Web Audio (no files): a music box that drifts out of tune, a drone, wind,
// a heartbeat that speeds up when EXE is close, chase drums for the escape, and every effect.
export class Sound {
  constructor() { this.ctx = null; this.volume = 0.7; this.terror = 0; this.mode = 'menu'; this.nextNote = 0; this.noteI = 0; this.beatT = 0; this.chaseT = 0; this.chaseStep = 0; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.noise = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
    // echo for the music box and stings
    this.echo = ctx.createDelay(1.5); this.echo.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38; const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2200;
    this.echo.connect(ef); ef.connect(fb); fb.connect(this.echo);
    this.echoOut = ctx.createGain(); this.echoOut.gain.value = 0.5; ef.connect(this.echoOut); this.echoOut.connect(this.master);
    // drone
    this.dGain = ctx.createGain(); this.dGain.gain.value = 0;
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 260; this.dFilter = df;
    for (const f of [55, 55.6, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(df); o.start(); }
    df.connect(this.dGain); this.dGain.connect(this.master);
    // wind
    const wn = ctx.createBufferSource(); wn.buffer = this.noise; wn.loop = true;
    this.wFilter = ctx.createBiquadFilter(); this.wFilter.type = 'bandpass'; this.wFilter.frequency.value = 500; this.wFilter.Q.value = 0.8;
    this.wGain = ctx.createGain(); this.wGain.gain.value = 0;
    wn.connect(this.wFilter); this.wFilter.connect(this.wGain); this.wGain.connect(this.master); wn.start();
    // music bus (ducked for chase)
    this.mus = ctx.createGain(); this.mus.gain.value = 0.55; this.mus.connect(this.master); this.mus.connect(this.echo);
    this.chaseBus = ctx.createGain(); this.chaseBus.gain.value = 0; this.chaseBus.connect(this.master);
    const shaper = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); } shaper.curve = curve; this.dist = shaper; shaper.connect(this.chaseBus);
    // propeller hum
    this.pGain = ctx.createGain(); this.pGain.gain.value = 0;
    const po = ctx.createOscillator(); po.type = 'sawtooth'; po.frequency.value = 70; const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 500;
    po.connect(pf); pf.connect(this.pGain); this.pGain.connect(this.master); po.start(); this.pOsc = po;
    this.nextNote = ctx.currentTime + 0.3;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  osc(type, f, t, a, peak, d, dest = this.master, f2 = null) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    this.env(g, t, a, peak, d); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  burst(t, dur, peak, type, freq, q = 1, dest = this.master, f2 = null) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.005, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  /** mode: 'menu' | 'game' | 'chase' | 'off'. terror 0..1. */
  update(dt, mode, terror, flying = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.mode = mode; this.terror = terror;
    this.dGain.gain.setTargetAtTime(mode === 'off' ? 0 : 0.035 + terror * 0.05, t, 0.3);
    this.dFilter.frequency.setTargetAtTime(220 + terror * 500, t, 0.3);
    this.wGain.gain.setTargetAtTime(mode === 'off' ? 0 : 0.03, t, 0.5);
    this.wFilter.frequency.setTargetAtTime(400 + Math.sin(t * 0.3) * 200, t, 0.5);
    this.mus.gain.setTargetAtTime(mode === 'chase' ? 0.12 : mode === 'off' ? 0 : 0.5, t, 0.4);
    this.chaseBus.gain.setTargetAtTime(mode === 'chase' ? 0.32 : 0, t, 0.3);
    this.pGain.gain.setTargetAtTime(flying ? 0.05 : 0, t, 0.08);
    if (flying) this.pOsc.frequency.setTargetAtTime(70 + Math.random() * 6, t, 0.05);
    // music box: an original tune in A minor that wanders out of tune as terror rises
    const tune = [69, 72, 76, 74, 72, 71, 68, 71, 69, 0, 76, 77, 76, 74, 72, 71, 72, 0, 69, 72, 76, 81, 80, 76, 77, 74, 71, 68, 69, 0, 0, 0];
    while (this.nextNote < t + 0.2 && mode !== 'off') {
      const n = tune[this.noteI % tune.length]; this.noteI++;
      if (n) {
        const warp = (Math.random() - 0.5) * terror * 60 + Math.sin(this.noteI * 0.7) * 8;
        const f = 440 * Math.pow(2, (n - 69 + warp / 100) / 12);
        this.osc('sine', f, this.nextNote, 0.004, 0.18, 1.4, this.mus);
        this.osc('triangle', f * 2.003, this.nextNote, 0.004, 0.05, 0.6, this.mus);
      }
      this.nextNote += (mode === 'menu' ? 0.5 : 0.44) * (1 + terror * 0.25 * Math.random());
    }
    if (this.nextNote < t) this.nextNote = t + 0.1;
    // heartbeat
    if (terror > 0.04 && mode !== 'off') {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 1.15 - terror * 0.72;
        const v = 0.25 + terror * 0.55;
        this.osc('sine', 62, t, 0.01, v, 0.16, this.master, 38);
        this.osc('sine', 58, t + 0.17, 0.01, v * 0.7, 0.18, this.master, 36);
      }
    }
    // chase drums
    if (mode === 'chase') {
      this.chaseT -= dt;
      while (this.chaseT <= 0) {
        const step = this.chaseStep++ % 8, at = t + 0.02;
        this.chaseT += 0.2;
        if (step % 2 === 0) this.osc('sine', 120, at, 0.003, 0.9, 0.22, this.chaseBus, 42);
        if (step === 2 || step === 6) this.burst(at, 0.14, 0.4, 'highpass', 1500, 0.7, this.chaseBus);
        const bass = [45, 45, 46, 45, 45, 45, 44, 46][step];
        this.osc('sawtooth', 440 * Math.pow(2, (bass - 69) / 12), at, 0.005, 0.25, 0.18, this.dist);
        if (step === 7 && Math.random() < 0.5) this.osc('sawtooth', 440 * Math.pow(2, (bass + 13 - 69) / 12), at, 0.01, 0.12, 0.3, this.dist);
      }
    } else this.chaseT = 0;
  }

  /** One-shot effects. vol scales with distance for things that happen to other players. */
  play(name, vol = 1) {
    if (!this.ctx || vol < 0.02) return;
    const t = this.ctx.currentTime, m = this.master, v = vol;
    switch (name) {
      case 'click': this.osc('square', 900, t, 0.002, 0.05 * v, 0.04); break;
      case 'shard': for (const [i, f] of [880, 1320, 1760, 2637].entries()) this.osc('sine', f, t + i * 0.06, 0.005, 0.22 * v, 0.9); break;
      case 'absorb': this.osc('sine', 500 + vol * 900, t, 0.005, 0.06, 0.12); break;
      case 'spring': { const o = this.osc('sine', 260, t, 0.005, 0.4 * v, 0.45, m, 900); const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 22; lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.5); break; }
      case 'jump': this.burst(t, 0.12, 0.08 * v, 'bandpass', 900, 1, m, 2400); break;
      case 'land': this.burst(t, 0.1, 0.12 * v, 'lowpass', 400); break;
      case 'swing': this.burst(t, 0.22, 0.25 * v, 'bandpass', 600, 1.2, m, 2800); break;
      case 'hit':
        this.burst(t, 0.3, 0.7 * v, 'lowpass', 1800, 1, m, 200);
        this.osc('sawtooth', 160, t, 0.005, 0.4 * v, 0.35, this.dist || m, 50);
        break;
      case 'down':
        for (const f of [110, 116.5, 155.6, 164.8]) this.osc('sawtooth', f, t, 0.01, 0.16 * v, 1.6, this.echo);
        this.burst(t, 0.8, 0.4 * v, 'bandpass', 900, 0.6);
        break;
      case 'scare':
        for (const f of [1180, 1310, 1720, 640]) { const o = this.osc('sawtooth', f, t, 0.01, 0.2, 0.75, m, f * 0.6); const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 31; lg.gain.value = 90; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.8); }
        this.burst(t, 0.8, 0.7, 'highpass', 900);
        break;
      case 'revive': for (const [i, f] of [523, 659, 784, 1047].entries()) this.osc('sine', f, t + i * 0.08, 0.005, 0.2 * v, 0.5); break;
      case 'exits':
        this.osc('sine', 65, t, 0.01, 0.8, 4, m); this.osc('sine', 131, t, 0.01, 0.4, 3, m); this.osc('triangle', 196, t, 0.02, 0.15, 3, this.echo);
        this.burst(t, 2.5, 0.25, 'bandpass', 200, 0.5, m, 3000);
        break;
      case 'escape': this.burst(t, 1.0, 0.4, 'bandpass', 300, 0.6, m, 5000); for (const [i, f] of [440, 554, 659, 880].entries()) this.osc('sine', f, t + 0.1 + i * 0.07, 0.01, 0.2, 1.4); break;
      case 'laugh':
        for (let i = 0; i < 5; i++) {
          const at = t + i * 0.17, f = 210 - i * 22;
          const o = this.ctx.createOscillator(), g = this.ctx.createGain(), b1 = this.ctx.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 0.75, at + 0.13);
          b1.type = 'bandpass'; b1.frequency.value = 750; b1.Q.value = 3;
          this.env(g, at, 0.01, 0.6 * v, 0.12); o.connect(b1); b1.connect(g); g.connect(this.dist || m); g.connect(this.echo); o.start(at); o.stop(at + 0.2);
        }
        break;
      case 'dash': this.burst(t, 0.3, 0.35 * v, 'bandpass', 500, 1, m, 4000); break;
      case 'fly': this.burst(t, 0.4, 0.2 * v, 'bandpass', 300, 1, m, 1200); break;
      case 'punch': this.burst(t, 0.12, 0.6 * v, 'lowpass', 900); this.osc('sine', 120, t, 0.003, 0.6 * v, 0.2, m, 50); break;
      case 'bonk': this.osc('sine', 780, t, 0.003, 0.4 * v, 0.25, m, 260); this.osc('square', 1500, t, 0.002, 0.08 * v, 0.08, m, 2200); this.burst(t, 0.1, 0.4 * v, 'lowpass', 1200); break;
      case 'stun': for (const [i, f] of [1568, 1976, 2349].entries()) this.osc('sine', f, t + i * 0.07, 0.003, 0.12 * v, 0.3); break;
      case 'miss': this.burst(t, 0.18, 0.15 * v, 'bandpass', 800, 1, m, 300); break;
      case 'blink': for (let i = 0; i < 6; i++) this.osc('square', 200 + Math.random() * 1800, t + i * 0.03, 0.002, 0.12 * v, 0.03); this.burst(t, 0.25, 0.3 * v, 'highpass', 2000); break;
      case 'fade': this.burst(t, 0.8, 0.25 * v, 'bandpass', 3000, 0.8, m, 200); break;
      case 'lunge': this.burst(t, 0.35, 0.4 * v, 'bandpass', 300, 1, m, 1800); this.osc('sawtooth', 90, t, 0.01, 0.2 * v, 0.3, this.dist || m, 60); break;
      case 'sense':
        { const o = this.osc('sawtooth', 300, t, 0.05, 0.3 * v, 1.2, this.echo, 180); const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 9; lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1.3); }
        this.burst(t, 1.0, 0.25 * v, 'bandpass', 1200, 2);
        break;
      case 'static': this.burst(t, 0.25 + Math.random() * 0.3, 0.18 * v, 'bandpass', 2400, 0.5); break;
      case 'tick': this.osc('square', 1200, t, 0.002, 0.06, 0.05); break;
      case 'go': this.osc('sawtooth', 110, t, 0.01, 0.3, 1.5, this.echo, 55); this.burst(t, 1.2, 0.3, 'lowpass', 800, 1, m, 100); break;
    }
  }
}
