// Retro chip music made on the fly (square and triangle waves, noise drums), one tune per track plus a calm one
// for the garage, and the small synth sounds (countdown beeps, item roulette, coins, fanfares). All original:
// chord loops and a seeded melody, nothing borrowed. It shares Close Call's audio context (sound.ctx).

const SONGS = {
  garage: { bpm: 96, root: 55, chords: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']], lead: 'tri', seed: 3, drums: 0.5, arp: 'tri', swing: 0.08 },
  0: { bpm: 152, root: 60, chords: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], lead: 'sq', seed: 11, drums: 1, arp: 'sq' },
  1: { bpm: 140, root: 57, chords: [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']], lead: 'saw', seed: 23, drums: 1, arp: 'sq' },
  2: { bpm: 126, root: 54, chords: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], lead: 'saw', seed: 37, drums: 1, arp: 'saw' },
  3: { bpm: 154, root: 62, chords: [[0, 'm'], [8, 'M'], [10, 'M'], [7, 'M']], lead: 'sq', seed: 101, drums: 1, arp: 'tri' }, // Starlight Spectrum
  title: { bpm: 146, root: 62, chords: [[0, 'M'], [5, 'M'], [9, 'm'], [7, 'M']], lead: 'sq', seed: 77, drums: 1, arp: 'sq' },
  win: { bpm: 132, root: 60, chords: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M']], lead: 'sq', seed: 5, drums: 0.8, arp: 'tri' },
};
const TRIAD = { M: [0, 4, 7], m: [0, 3, 7] };
const RHYTHM = [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1];
const PENTA = { M: [0, 2, 4, 7, 9], m: [0, 3, 5, 7, 10] };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

export class Music {
  constructor(sound) { this.sound = sound; this.on = true; this.song = null; this.fast = 1; this.timer = 0; this.vol = 0.17; }

  get ctx() { return this.sound.ctx; }
  ready() {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (!this.out) {
      this.out = ctx.createGain(); this.out.gain.value = this.on ? this.vol : 0;
      this.out.connect(this.sound.master || ctx.destination);
      this.fx = ctx.createGain(); this.fx.gain.value = 0.5; this.fx.connect(this.sound.master || ctx.destination);
      const len = ctx.sampleRate * 0.5, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    return true;
  }

  setOn(on) { this.on = on; if (this.out) this.out.gain.setTargetAtTime(on ? this.vol : 0, this.ctx.currentTime, 0.1); }

  /** Start a tune ('garage', 0, 1, 2, 'win'); the same one keeps playing. */
  play(id) {
    if (this.song && this.song.id === id) return;
    this.stop();
    const def = SONGS[id];
    if (!def) return;
    const R = rng(def.seed);
    // a melody for each of the four chords (16 sixteenth notes each), built once
    const scale = PENTA[def.chords[0][1]];
    let deg = 5;
    const mel = def.chords.map(([r]) => RHYTHM.map((on, i) => {
      if (!on || (i > 0 && R() < 0.18)) return null;
      deg += Math.round((R() - 0.5) * 3.2);
      if (i === 0) { // land on a chord tone at the start of each bar
        const want = r % 12; let best = deg, bd = 99;
        for (let dd = deg - 3; dd <= deg + 3; dd++) { const pc = (scale[((dd % 5) + 5) % 5] + 12 * Math.floor(dd / 5)) % 12; const dist = Math.min(Math.abs(pc - want), Math.abs(pc - (want + 4) % 12)); if (dist < bd) { bd = dist; best = dd; } }
        deg = best;
      }
      deg = Math.max(2, Math.min(11, deg));
      return scale[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5);
    }));
    this.song = { id, def, mel, step: 0, next: 0 };
    this.tick();
  }

  stop() { clearTimeout(this.timer); this.song = null; }
  setFast(k) { this.fast = k; }

  tick() {
    if (!this.song) return;
    this.timer = setTimeout(() => this.tick(), 30);
    if (!this.ready() || this.ctx.state !== 'running') return;
    const s = this.song, ctx = this.ctx, def = s.def;
    const spb = 60 / (def.bpm * this.fast) / 4; // seconds per sixteenth
    if (s.next < ctx.currentTime) s.next = ctx.currentTime + 0.05;
    while (s.next < ctx.currentTime + 0.15) {
      const st = s.step % 64, bar = Math.floor(st / 16), i = st % 16;
      const [r, q] = def.chords[bar], tri = TRIAD[q], root = def.root + r;
      const t = s.next + (i % 2 ? (def.swing || 0) * spb : 0);
      // bass: root on the eighths, octave jump on the off beats
      if (i % 2 === 0) this.note('tri', hz(root - 24 + (i % 4 === 2 ? 12 : 0)), t, spb * 1.6, 0.55);
      // arpeggio
      this.note(def.arp, hz(root + tri[i % 3] + (i % 6 > 2 ? 12 : 0)), t, spb * 0.8, def.arp === 'tri' ? 0.18 : 0.07);
      // lead, an octave up (twice through, the second time an octave higher on the last bar)
      const n = s.mel[bar][i];
      if (n != null) this.note(def.lead, hz(def.root + 12 + n + (Math.floor(s.step / 64) % 2 && bar === 3 ? 12 : 0)), t, spb * 1.7, def.lead === 'tri' ? 0.3 : 0.11);
      // drums
      if (def.drums) {
        if (i % 8 === 0) this.kick(t, 0.9 * def.drums);
        if (i % 8 === 4) this.hit(t, 0.35 * def.drums, 1800, 0.12);
        if (i % 2 === 0) this.hit(t, 0.08 * def.drums, 8000, 0.03);
      }
      s.step++; s.next += spb;
    }
  }

  note(type, f, t, dur, g, dest) {
    const ctx = this.ctx, o = ctx.createOscillator(), a = ctx.createGain();
    o.type = type === 'sq' ? 'square' : type === 'saw' ? 'sawtooth' : type === 'sine' ? 'sine' : 'triangle';
    o.frequency.value = f;
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g, t + 0.008); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (type === 'saw') { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; o.connect(lp); node = lp; }
    node.connect(a); a.connect(dest || this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }
  kick(t, g, dest) {
    const ctx = this.ctx, o = ctx.createOscillator(), a = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(a); a.connect(dest || this.out); o.start(t); o.stop(t + 0.18);
  }
  hit(t, g, f, dur, dest) {
    const ctx = this.ctx, n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), a = ctx.createGain();
    n.buffer = this.noiseBuf; hp.type = 'highpass'; hp.frequency.value = f;
    a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp); hp.connect(a); a.connect(dest || this.out); n.start(t, Math.random() * 0.3); n.stop(t + dur + 0.02);
  }

  // ---- sound effects (through their own bus, not muted with the music)
  sfx(fn) { if (this.ready() && this.ctx.state === 'running') fn(this.ctx.currentTime, this.fx); }
  beep(go) { this.sfx((t, d) => { this.note('sq', go ? 880 : 440, t, go ? 0.7 : 0.32, 0.35, d); if (go) this.note('sq', 1320, t, 0.7, 0.15, d); }); }
  tickRoll() { this.sfx((t, d) => this.note('sq', 1200 + Math.random() * 600, t, 0.04, 0.08, d)); }
  gotItem() { this.sfx((t, d) => { this.note('sq', 988, t, 0.1, 0.15, d); this.note('sq', 1319, t + 0.07, 0.2, 0.15, d); }); }
  coin() { this.sfx((t, d) => { this.note('sine', 1318, t, 0.08, 0.28, d); this.note('sine', 1975, t + 0.06, 0.28, 0.28, d); }); }
  crystal() { this.sfx((t, d) => { this.hit(t, 0.35, 5000, 0.25, d); this.note('tri', 2093, t, 0.25, 0.12, d); this.note('tri', 2637, t + 0.04, 0.3, 0.1, d); }); }
  hop() { this.sfx((t, d) => { const o = this.ctx.createOscillator(), a = this.ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(640, t + 0.08); a.gain.setValueAtTime(0.06, t); a.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(a); a.connect(d); o.start(t); o.stop(t + 0.13); }); }
  charge(lv) { this.sfx((t, d) => this.note('sq', [0, 660, 880, 1175][lv], t, 0.12, 0.1, d)); }
  trick() { this.sfx((t, d) => { [784, 988, 1175].forEach((f, i) => this.note('sq', f, t + i * 0.05, 0.12, 0.1, d)); }); }
  fanfare(win) { this.sfx((t, d) => { const ns = win ? [72, 76, 79, 84, 79, 84] : [72, 74, 76, 72]; ns.forEach((m, i) => this.note('sq', hz(m), t + i * 0.13, i === ns.length - 1 ? 0.8 : 0.16, 0.16, d)); }); }
  finalLap() { this.sfx((t, d) => { [67, 72, 76, 79].forEach((m, i) => this.note('sq', hz(m), t + i * 0.1, 0.18, 0.15, d)); this.note('sq', hz(84), t + 0.42, 0.6, 0.15, d); }); }
  /** Pressed L + R on the title: a bright rising run. */
  go() { this.sfx((t, d) => { [67, 71, 74, 79, 83, 86].forEach((m, i) => this.note('sq', hz(m), t + i * 0.045, 0.22, 0.14, d)); this.note('tri', hz(91), t + 0.27, 0.6, 0.3, d); this.hit(t, 0.3, 3000, 0.4, d); }); }
  unlock() { this.sfx((t, d) => { [76, 79, 83, 88].forEach((m, i) => this.note('tri', hz(m), t + i * 0.08, 0.3, 0.3, d)); }); }
}
