// All sound is made with Web Audio (no files): an original zone tune (happy in the normal world, slowed and
// broken in the corrupted one, fast and distorted for the escape), a drone, wind, a heartbeat, and every effect.
export class Sound {
  constructor() { this.ctx = null; this.volume = 0.7; this.terror = 0; this.music = 'menu'; this.nextT = 0; this.seqI = 0; this.beatT = 0; }

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

  /**
   * music: 'normal' (the happy zone tune), 'corrupt' (the same tune, broken), 'chase' (fast and distorted),
   * 'menu' (quiet broken tune) or 'off'. terror 0..1 (heartbeat, warble). flying: propeller hum.
   */
  update(dt, music, terror, flying = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dark = music !== 'normal';
    this.music = music; this.terror = terror;
    this.dGain.gain.setTargetAtTime(music === 'off' || !dark ? 0 : 0.03 + terror * 0.05, t, 0.4);
    this.dFilter.frequency.setTargetAtTime(220 + terror * 500, t, 0.3);
    this.wGain.gain.setTargetAtTime(music === 'off' ? 0 : dark ? 0.03 : 0.012, t, 0.5);
    this.wFilter.frequency.setTargetAtTime(400 + Math.sin(t * 0.3) * 200, t, 0.5);
    this.mus.gain.setTargetAtTime(music === 'off' ? 0 : music === 'menu' ? 0.32 : music === 'normal' ? 0.42 : 0.55, t, 0.5);
    this.chaseBus.gain.setTargetAtTime(music === 'chase' ? 0.3 : 0, t, 0.3);
    this.pGain.gain.setTargetAtTime(flying ? 0.05 : 0, t, 0.08);
    if (flying) this.pOsc.frequency.setTargetAtTime(70 + Math.random() * 6, t, 0.05);
    this.sequence(t, music, terror);
    // heartbeat when EXE is close
    if (terror > 0.04 && music !== 'off') {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 1.15 - terror * 0.72;
        const v = 0.25 + terror * 0.55;
        this.osc('sine', 62, t, 0.01, v, 0.16, this.master, 38);
        this.osc('sine', 58, t + 0.17, 0.01, v * 0.7, 0.18, this.master, 36);
      }
    }
  }

  /**
   * An original bouncy zone tune (C major, 4 bars + 4 bars). In the corrupted world the very same notes are
   * played slow, a tritone lower, out of tune, with "reversed" swells, dropouts and static: a happy song, broken.
   */
  sequence(t, music, terror) {
    if (music === 'off') { this.nextT = 0; return; }
    const MEL = [
      72, 76, 79, 76, 81, 79, 76, 74, 72, 0, 74, 76, 77, 76, 74, 0,
      77, 81, 84, 81, 79, 77, 76, 74, 76, 79, 74, 0, 71, 74, 72, 0,
      69, 72, 76, 72, 77, 76, 72, 69, 71, 74, 79, 74, 77, 76, 74, 71,
      72, 76, 81, 79, 77, 76, 79, 84, 83, 0, 79, 0, 84, 0, 0, 0,
    ];
    const ROOTS = [36, 36, 41, 43, 33, 31, 41, 36];
    const broken = music === 'corrupt' || music === 'menu';
    const chase = music === 'chase';
    const step = chase ? 0.16 : broken ? 0.36 : 0.2;
    const shift = broken || chase ? -6 : 0;
    if (!this.nextT || this.nextT < t - 0.5) this.nextT = t + 0.05;
    const lead = broken || chase ? this.dist : this.mus;
    while (this.nextT < t + 0.25) {
      const at = this.nextT, i = this.seqI++ % 64, bar = Math.floor(i / 8), e = i % 8;
      const note = MEL[i], root = ROOTS[bar] + shift;
      const hz = (n, cents = 0) => 440 * Math.pow(2, (n - 69 + cents / 100) / 12);
      if (!broken && !chase) {
        // normal world: bright square lead, bouncy bass, light drums
        if (note) { this.osc('square', hz(note), at, 0.005, 0.07, step * 0.85, this.mus); this.osc('triangle', hz(note + 12), at, 0.005, 0.03, step * 0.5, this.mus); }
        this.osc('triangle', hz(root + (e % 2 ? 12 : 0)), at, 0.005, 0.22, step * 0.8, this.mus);
        if (e === 0 || e === 4) this.osc('sine', 110, at, 0.002, 0.5, 0.14, this.mus, 45);
        if (e === 2 || e === 6) this.burst(at, 0.09, 0.16, 'highpass', 1800, 0.8, this.mus);
        this.burst(at, 0.03, 0.05, 'highpass', 7000, 0.7, this.mus);
      } else {
        // corrupted: slow, low, out of tune; some notes come in backwards, some are missing
        const warble = (Math.random() - 0.5) * (50 + terror * 80) + Math.sin(this.seqI * 0.37) * 30;
        if (note && Math.random() > 0.14) {
          const rev = Math.random() < 0.22;
          const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
          o.type = chase ? 'sawtooth' : 'square'; o.frequency.setValueAtTime(hz(note, warble), at);
          o.frequency.linearRampToValueAtTime(hz(note, warble - 40 - terror * 60), at + step);
          f.type = 'lowpass'; f.frequency.value = chase ? 2400 : 1100 + terror * 900;
          const len = step * (chase ? 0.8 : 1.6), peak = chase ? 0.09 : 0.1;
          g.gain.setValueAtTime(0.0001, at);
          if (rev) { g.gain.exponentialRampToValueAtTime(peak, at + len * 0.9); g.gain.linearRampToValueAtTime(0.0001, at + len); }
          else { g.gain.exponentialRampToValueAtTime(peak, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + len); }
          o.connect(f); f.connect(g); g.connect(lead); g.connect(this.echo); o.start(at); o.stop(at + len + 0.05);
        }
        if (e % 2 === 0) this.osc('sawtooth', hz(root - 12, (Math.random() - 0.5) * 30), at, 0.01, chase ? 0.2 : 0.14, step * 1.8, this.dist);
        if (chase ? e % 2 === 0 : e === 0) this.osc('sine', chase ? 120 : 80, at, 0.003, chase ? 0.9 : 0.7, chase ? 0.2 : 0.5, chase ? this.chaseBus : this.mus, 38);
        if (chase && (e === 2 || e === 6)) this.burst(at, 0.14, 0.35, 'highpass', 1500, 0.7, this.chaseBus);
        if (!chase && Math.random() < 0.03 + terror * 0.05) this.burst(at, 0.2 + Math.random() * 0.3, 0.12, 'bandpass', 2400, 0.5, this.mus);
      }
      this.nextT += step * (broken ? 1 + (Math.random() - 0.5) * 0.12 * (1 + terror) : 1);
    }
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
      // title screen: a bright "press start" jingle, a tape slowing to a stop, and the reveal
      case 'start':
        for (const [i, f] of [523, 659, 784, 1047, 1319, 1568].entries()) { this.osc('square', f, t + i * 0.055, 0.003, 0.07, 0.16); this.osc('triangle', f / 2, t + i * 0.055, 0.003, 0.12, 0.2); }
        this.osc('square', 2093, t + 0.36, 0.003, 0.05, 0.5); this.osc('triangle', 1047, t + 0.36, 0.003, 0.15, 0.6);
        break;
      case 'tapestop': {
        for (const [f, k] of [[523, 0.09], [392, 0.07], [131, 0.2]]) { const o = this.osc(k > 0.1 ? 'triangle' : 'square', f, t, 0.005, k, 0.95, this.mus || m); o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.12, t + 0.95); }
        this.burst(t + 0.1, 0.8, 0.1, 'lowpass', 1200, 0.7, m, 150);
        break;
      }
      case 'sting':
        this.osc('sine', 48, t, 0.005, 1.0, 2.6, m, 30);
        for (const f of [116.5, 123.5, 174.6, 233]) this.osc('sawtooth', f, t, 0.01, 0.09, 2.2, m, f * 0.94);
        for (const f of [1245, 1318, 1865]) this.osc('sawtooth', f, t + 0.02, 0.02, 0.05, 1.4, this.echo, f * 0.7);
        this.burst(t, 1.4, 0.55, 'bandpass', 1800, 0.5, m, 300);
        break;
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
      case 'portal': this.burst(t, 0.9, 0.4 * v, 'bandpass', 200, 0.8, m, 3500); this.osc('sine', 220, t, 0.05, 0.25 * v, 0.9, this.echo, 880); this.osc('sine', 330, t, 0.05, 0.15 * v, 0.9, this.echo, 110); break;
      case 'pop':
        for (const f of [900, 1040, 1380, 520]) { const o = this.osc('sawtooth', f * 0.6, t, 0.03, 0.18 * v, 0.9, m, f); const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 26; lg.gain.value = 70; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1); }
        this.burst(t, 0.6, 0.5 * v, 'highpass', 1200); break;
      case 'bell': for (const [i, f] of [523, 1046, 1568, 659].entries()) this.osc('sine', f, t, 0.003, (i ? 0.08 : 0.3) * v, 2.4, this.echo); break;
      case 'valve': this.burst(t, 0.15, 0.3 * v, 'bandpass', 600, 2); this.osc('square', 180, t, 0.003, 0.08 * v, 0.1); break;
      case 'steam': this.burst(t, 1.2, 0.3 * v, 'highpass', 3000, 0.5); break;
      case 'panel': this.osc('square', 880, t, 0.003, 0.1 * v, 0.12); this.osc('square', 1320, t + 0.08, 0.003, 0.1 * v, 0.2); break;
      case 'core': this.osc('sawtooth', 120, t, 0.01, 0.25 * v, 0.6, this.dist || m, 240); this.burst(t, 0.6, 0.25 * v, 'lowpass', 500); break;
      case 'burn': this.burst(t, 0.5, 0.5 * v, 'bandpass', 1500, 0.7, m, 400); this.osc('sawtooth', 300, t, 0.005, 0.2 * v, 0.3, m, 120); break;
      case 'boost': this.burst(t, 0.35, 0.3 * v, 'bandpass', 500, 1, m, 5000); this.osc('square', 440, t, 0.003, 0.06 * v, 0.2, m, 1760); break;
      case 'bumper': this.osc('square', 1200, t, 0.002, 0.15 * v, 0.08); this.osc('sine', 600, t, 0.002, 0.3 * v, 0.2, m, 1200); break;
      case 'task': for (const [i, f] of [659, 784, 988, 1319].entries()) this.osc('triangle', f, t + i * 0.09, 0.005, 0.2 * v, 0.6); break;
      case 'locker': this.burst(t, 0.18, 0.4 * v, 'bandpass', 700, 3); this.osc('square', 140, t, 0.002, 0.12 * v, 0.12, m, 90); break;
      case 'rip':
        this.burst(t, 0.5, 0.8 * v, 'bandpass', 1200, 1.5, m, 300); this.osc('sawtooth', 90, t, 0.005, 0.4 * v, 0.4, this.dist || m, 40);
        for (const f of [700, 930, 1240]) this.osc('sawtooth', f, t + 0.05, 0.02, 0.15 * v, 0.6, m, f * 0.5);
        break;
      case 'qtehit': this.osc('square', 660, t, 0.002, 0.12 * v, 0.08); this.osc('square', 990, t + 0.04, 0.002, 0.1 * v, 0.08); break;
      case 'qtefail': this.burst(t, 0.6, 0.6, 'lowpass', 900, 1, m, 120); this.osc('sawtooth', 220, t, 0.01, 0.4, 0.7, this.dist || m, 55); break;
      case 'qtewin': for (const [i, f] of [523, 659, 784].entries()) this.osc('triangle', f, t + i * 0.06, 0.005, 0.25, 0.4); break;
      case 'hunt':
        for (const f of [70, 95, 140]) { const o = this.osc('sawtooth', f, t, 0.08, 0.35 * v, 1.4, this.dist || m, f * 0.7); const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 7; lg.gain.value = 12; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1.5); }
        this.burst(t, 1.2, 0.4 * v, 'lowpass', 600, 1, m, 200); break;
      case 'staticfield': for (let i = 0; i < 10; i++) this.osc('square', 100 + Math.random() * 2000, t + i * 0.04, 0.002, 0.08 * v, 0.05); this.burst(t, 1.0, 0.35 * v, 'highpass', 3000); break;
      case 'decoy': for (let i = 0; i < 4; i++) this.osc('triangle', 900 - i * 120 + Math.random() * 60, t + i * 0.09, 0.005, 0.12 * v, 0.1, this.echo); break;
      case 'decoypop': this.burst(t, 0.5, 0.5 * v, 'highpass', 1500); this.osc('sawtooth', 800, t, 0.003, 0.2 * v, 0.3, m, 150); break;
      case 'denied': this.osc('square', 220, t, 0.003, 0.15, 0.15); this.osc('square', 180, t + 0.15, 0.003, 0.15, 0.2); break;
      case 'warn': this.osc('sine', 120, t, 0.01, 0.3, 0.3, m, 90); this.burst(t, 0.3, 0.15, 'bandpass', 400, 2); break;
    }
  }
}
