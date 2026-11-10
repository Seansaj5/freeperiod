// Sound: real recordings (all CC0, from Freesound; see sfx/CREDITS.md) played through Web Audio.
//   engine  - steady loops cut from dyno runs at several RPMs; the two nearest the current RPM are
//             crossfaded and pitched to match, and each car picks a voice (i4, i6, v8) and a pitch
//   loops   - wind, road roar, tyre squeal, barrier scrape, nitro rush
//   one-shots - pass-bys, crashes, backfires, horns, cash register, clicks
// Inside tunnels everything gets a short echo.
const BASE = new URL('../sfx/', import.meta.url).href;

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.buf = {};
    this.voiceId = 'i4'; this.pitch = 1;
    this.slices = [];
    // download now; decoding has to wait for the AudioContext, which needs a click or key press
    this.files = fetch(BASE + 'sfx.json').then((r) => r.json()).then((man) => {
      this.man = man;
      const names = [...Object.values(man.engines).flat().map((s) => s.file), ...Object.values(man.loops), ...Object.values(man.shots)];
      return Promise.all(names.map((f) => fetch(BASE + f).then((r) => r.arrayBuffer()).then((b) => [f, b]).catch(() => null)));
    }).catch(() => []);
  }

  /** Must be called from a click/keypress (browsers block audio until then). */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    // tunnel echo: a send into a convolver with a made-up impulse response
    this.verb = ctx.createConvolver(); this.verb.buffer = impulse(ctx, 1.7);
    this.wet = ctx.createGain(); this.wet.gain.value = 0;
    this.verb.connect(this.wet); this.wet.connect(this.master);
    this.bus = ctx.createGain(); this.bus.connect(this.master); this.bus.connect(this.verb);
    // engine chain: slices -> mix -> low-pass (opens with throttle) -> gain -> bus
    this.eMix = ctx.createGain();
    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 2000; this.eFilter.Q.value = 0.7;
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
    this.eDuck = ctx.createGain();
    this.eMix.connect(this.eFilter); this.eFilter.connect(this.eDuck); this.eDuck.connect(this.eGain); this.eGain.connect(this.bus);
    this.files.then(async (list) => {
      await Promise.all(list.filter(Boolean).map(async ([f, b]) => { try { this.buf[f] = await ctx.decodeAudioData(b); } catch { /* skip a bad file */ } }));
      this.loops = {};
      for (const [name, file] of Object.entries(this.man.loops)) this.loops[name] = this.loop(file);
      this.ready = true;
      this.setEngine(this.voiceId, this.pitch, true);
    });
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** A looping source through its own gain (starts silent). */
  loop(file) {
    const b = this.buf[file];
    if (!b) return null;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(this.bus);
    src.start(0, Math.random() * b.duration);
    return { src, g };
  }

  /** Pick the engine for a car: voice 'i4' | 'i6' | 'v8', pitch = how much higher it revs/sounds. */
  setEngine(voice = 'i4', pitch = 1, force = false) {
    if (!force && voice === this.voiceId && pitch === this.pitch && this.slices.length) return;
    this.voiceId = voice; this.pitch = pitch;
    if (!this.ready) return;
    for (const s of this.slices) { try { s.src.stop(); } catch { /* already stopped */ } s.g.disconnect(); }
    this.slices = [];
    for (const { file, rpm } of this.man.engines[voice] || this.man.engines.i4) {
      const b = this.buf[file];
      if (!b) continue;
      const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(this.eMix);
      src.start(0, Math.random() * b.duration);
      this.slices.push({ src, g, rpm });
    }
  }

  /** Per frame. rpm, load 0..1, speed m/s, on = driving (false in menus: a quiet idle), boosting. */
  engine(rpm, load, speed, on, boosting) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, sl = this.slices;
    if (sl.length) {
      const re = rpm * this.pitch;
      let k = 0;
      while (k < sl.length - 2 && re > sl[k + 1].rpm) k++;
      const u = Math.min(1, Math.max(0, (re - sl[k].rpm) / (sl[k + 1].rpm - sl[k].rpm)));
      sl.forEach((s, i) => {
        const g = i === k ? Math.cos((u * Math.PI) / 2) : i === k + 1 ? Math.sin((u * Math.PI) / 2) : 0;
        s.g.gain.setTargetAtTime(g, t, 0.03);
        s.src.playbackRate.setTargetAtTime(Math.min(2.4, Math.max(0.3, re / s.rpm)), t, 0.03);
      });
    }
    this.eFilter.frequency.setTargetAtTime(load > 0 ? (boosting ? 16000 : 9000) : 900 + rpm * 0.25, t, 0.06);
    this.eGain.gain.setTargetAtTime(on ? (load > 0 ? 0.55 : 0.32) + (rpm / 7400) * 0.15 + (boosting ? 0.1 : 0) : 0.14, t, 0.08);
    const L = this.loops, w = Math.min(1, speed / 95);
    if (L.wind) { L.wind.g.gain.setTargetAtTime(on ? w * w * 0.5 : 0, t, 0.1); L.wind.src.playbackRate.setTargetAtTime(0.75 + w * 0.5, t, 0.1); }
    if (L.road) { L.road.g.gain.setTargetAtTime(on ? Math.min(1, speed / 35) * 0.42 : 0, t, 0.1); L.road.src.playbackRate.setTargetAtTime(0.7 + Math.min(1.2, speed / 70) * 0.5, t, 0.1); }
    if (L.boost) L.boost.g.gain.setTargetAtTime(on && boosting ? 0.28 : 0, t, boosting ? 0.05 : 0.2);
  }

  /** Gear change: the engine note dips for a moment. */
  shift() {
    if (!this.ready) return;
    const t = this.ctx.currentTime, g = this.eDuck.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.3, t + 0.03); g.linearRampToValueAtTime(1, t + 0.16);
  }
  /** Tyre squeal amount 0..1 and barrier scrape amount 0..1, set every frame. */
  tires(k) { if (this.ready && this.loops.squeal) { this.loops.squeal.g.gain.setTargetAtTime(k * 0.5, this.ctx.currentTime, 0.06); this.loops.squeal.src.playbackRate.setTargetAtTime(0.9 + k * 0.2, this.ctx.currentTime, 0.1); } }
  scrape(k) { if (this.ready && this.loops.scrape) this.loops.scrape.g.gain.setTargetAtTime(k * 0.6, this.ctx.currentTime, 0.04); }
  /** 0 outside .. 1 deep in a tunnel. */
  setTunnel(k) { if (this.ctx) this.wet.gain.setTargetAtTime(k * 0.5, this.ctx.currentTime, 0.15); }

  /** Play a one-shot. o: { gain, rate, pan, delay } */
  play(name, o = {}) {
    if (!this.ready) return;
    const b = this.buf[this.man.shots[name]];
    if (!b) return;
    const ctx = this.ctx, t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = o.rate ?? 1;
    const g = ctx.createGain(); g.gain.value = o.gain ?? 0.7;
    src.connect(g);
    let node = g;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); node = p; }
    node.connect(this.bus);
    src.start(t);
  }

  // ---- game events
  /** A car whooshing past on `side` (-1 left, 1 right); tier 0 = closest. */
  whoosh(side, tier, kmh = 150) {
    const name = ['pass_c', 'pass_b', 'pass_a'][tier] || 'pass_a';
    this.play(name, { gain: [0.95, 0.8, 0.6][tier] ?? 0.6, rate: 0.95 + Math.min(0.35, Math.max(0, (kmh - 120) / 600)) + Math.random() * 0.05, pan: side * 0.75 });
  }
  near(tier) { this.play('tick', { gain: 0.35, rate: [1.5, 1.25, 1][tier] ?? 1 }); }
  split() { this.play('swish', { gain: 0.8, rate: 1.1 }); this.play('whoosh', { gain: 0.7, rate: 0.85, delay: 0.05 }); }
  bank() { this.play('chaching', { gain: 0.7 }); }
  lost() { /* the crash itself is the sound */ }
  crash(impact) {
    const k = Math.min(1, impact / 30);
    this.play(k > 0.55 ? 'crash_big' : k > 0.25 ? 'crash_mid' : 'crash_small', { gain: 0.55 + k * 0.4, rate: 0.95 + Math.random() * 0.1 });
    this.play('clank', { gain: 0.5 + k * 0.3, rate: 0.8 + Math.random() * 0.3 });
  }
  /** Two lives mode: the car blows up. Recorded crashes pitched down, plus a synth thump and a roar that closes off. */
  boom(gain = 1) {
    if (!this.ready) return;
    this.play('crash_big', { gain: 1 * gain, rate: 0.6 });
    this.play('crash_mid', { gain: 0.65 * gain, rate: 0.78, delay: 0.04 });
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.7);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(1.5 * gain, t + 0.012); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(og); og.connect(this.bus); o.start(t); o.stop(t + 1.05);
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 2.4), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last * 2.2; } // a little brown, so it rumbles
      this.noise = b;
    }
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = this.noise;
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(120, t + 2.0);
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.95 * gain, t + 0.02); ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    n.connect(f); f.connect(ng); ng.connect(this.bus); n.start(t); n.stop(t + 2.4);
  }
  /** The wreck (or a wheel) hitting the road. */
  thud(k, small) {
    this.play(small ? 'clank' : 'crash_small', { gain: Math.min(0.9, 0.25 + k * 0.05), rate: (small ? 0.9 : 0.7) + Math.random() * 0.15 });
  }
  wall(impact) { this.play('clank', { gain: Math.min(0.8, 0.25 + impact / 14), rate: 0.75 + Math.random() * 0.2 }); }
  pop() { this.play(['pop_a', 'pop_b', 'pop_c', 'pop_d'][Math.floor(Math.random() * 4)], { gain: 0.55 + Math.random() * 0.3, rate: 0.9 + Math.random() * 0.25 }); }
  horn(side) { this.play(['horn_a', 'horn_b', 'horn_c'][Math.floor(Math.random() * 3)], { gain: 0.42, rate: 0.95 + Math.random() * 0.1, pan: side * 0.6, delay: 0.12 }); }
  nitro() { this.play('nitro', { gain: 0.5 }); }
  trap() { this.play('click', { gain: 0.8, rate: 0.6 }); this.play('coins', { gain: 0.5, delay: 0.08 }); }
  squeak() { this.play('squeak', { gain: 0.45, rate: 0.95 + Math.random() * 0.1 }); }
  click() { this.play('click', { gain: 0.35 }); }
  buy() { this.play('register', { gain: 0.75 }); this.play('coins', { gain: 0.5, delay: 0.3 }); }
}

/** A stereo impulse response: decaying noise, a little darker as it fades (concrete tunnel). */
function impulse(ctx, secs) {
  const n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate, k = 0.35 + 0.6 * Math.exp(-t * 2);
      lp = lp * (1 - k) + (Math.random() * 2 - 1) * k;
      d[i] = lp * Math.exp(-t * 3.2) * (i < 40 ? i / 40 : 1);
    }
  }
  return b;
}
