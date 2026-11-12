// Every sound is made right here with Web Audio (no files): guns, pickaxe, building, chests, storm wind, the blimp.
let ctx = null, master = null, noiseBuf = null;
let vol = 0.8;
const loops = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(v) { vol = v; if (master) master.gain.value = v; }

function noise(t, dur, { type = 'lowpass', freq = 2000, q = 0.7, gain = 0.5, attack = 0.002, decay = dur, out = master, f2 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(t, dur, { type = 'sine', freq = 440, f2, gain = 0.3, attack = 0.005, out = master } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
/** A gain + stereo pan for a sound at a distance (d metres, pan -1..1). */
function at(d = 0, pan = 0) {
  const g = ctx.createGain(); g.gain.value = 1 / (1 + Math.max(0, d) / 18);
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(master); }
  else g.connect(master);
  if (d > 60) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(500, 4000 - d * 12); f.connect(g); return f; }
  return g;
}

const GUN = {
  pistol: { n: [3200, 0.09, 0.55], b: [160, 0.08, 0.35] },
  smg: { n: [3800, 0.06, 0.4], b: [180, 0.05, 0.25] },
  ar: { n: [2600, 0.12, 0.55], b: [120, 0.1, 0.45] },
  pump: { n: [1500, 0.28, 0.75], b: [80, 0.22, 0.7] },
  tac: { n: [1800, 0.22, 0.65], b: [95, 0.18, 0.55] },
  sniper: { n: [2200, 0.5, 0.75], b: [60, 0.4, 0.8] },
  rocket: { n: [900, 0.6, 0.5], b: [70, 0.5, 0.5] },
};

export const sfx = {
  shot(kind, d = 0, pan = 0) {
    if (!ctx) return; const t = ctx.currentTime, o = at(d, pan), g = GUN[kind] || GUN.ar;
    noise(t, g.n[1], { freq: g.n[0], f2: 300, gain: g.n[2], out: o });
    tone(t, g.b[1], { type: 'triangle', freq: g.b[0], f2: 35, gain: g.b[2], out: o });
    if (kind === 'pump') noise(t + 0.35, 0.08, { type: 'bandpass', freq: 1200, q: 3, gain: 0.25, out: o }), noise(t + 0.48, 0.06, { type: 'bandpass', freq: 900, q: 3, gain: 0.25, out: o });
    if (kind === 'sniper') noise(t + 0.05, 1.2, { freq: 600, gain: 0.15, out: o, attack: 0.05 });
  },
  dry() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.03, { type: 'highpass', freq: 3000, gain: 0.2 }); },
  reload() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.05, { type: 'bandpass', freq: 1800, q: 4, gain: 0.6 }); noise(t + 0.25, 0.06, { type: 'bandpass', freq: 1200, q: 4, gain: 0.7 }); },
  swing() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.16, { type: 'bandpass', freq: 600, f2: 2400, q: 1.5, gain: 0.35, attack: 0.05 }); },
  chop(mat = 0, d = 0) {
    if (!ctx) return; const t = ctx.currentTime, o = at(d);
    if (mat === 0) { tone(t, 0.12, { type: 'square', freq: 220, f2: 120, gain: 0.12, out: o }); noise(t, 0.1, { type: 'bandpass', freq: 900, q: 2, gain: 0.4, out: o }); }
    else if (mat === 1) { noise(t, 0.12, { type: 'bandpass', freq: 1600, q: 1.5, gain: 0.45, out: o }); tone(t, 0.08, { freq: 140, gain: 0.2, out: o }); }
    else { tone(t, 0.35, { type: 'triangle', freq: 1250, gain: 0.15, out: o }); tone(t, 0.3, { type: 'triangle', freq: 1870, gain: 0.08, out: o }); noise(t, 0.06, { type: 'highpass', freq: 3000, gain: 0.3, out: o }); }
  },
  place(mat = 0, d = 0) { if (!ctx) return; const t = ctx.currentTime, o = at(d); tone(t, 0.12, { type: 'sine', freq: [180, 140, 260][mat], f2: 90, gain: 0.35, out: o }); noise(t, 0.08, { type: 'bandpass', freq: [700, 1100, 2400][mat], q: 2, gain: 0.25, out: o }); },
  breakPiece(d = 0) { if (!ctx) return; const t = ctx.currentTime, o = at(d); noise(t, 0.45, { freq: 1400, f2: 200, gain: 0.5, out: o }); tone(t, 0.3, { type: 'triangle', freq: 90, f2: 40, gain: 0.35, out: o }); },
  hit(head) { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.06, { type: 'square', freq: head ? 1600 : 900, gain: 0.08 }); if (head) tone(t + 0.04, 0.12, { type: 'sine', freq: 2400, gain: 0.12 }); },
  shieldHit() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.08, { type: 'sine', freq: 2600, f2: 1800, gain: 0.07 }); },
  hurt() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.18, { type: 'sawtooth', freq: 140, f2: 60, gain: 0.18 }); noise(t, 0.12, { freq: 600, gain: 0.25 }); },
  shieldBreak() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 5; i++) tone(t + i * 0.02, 0.25, { type: 'triangle', freq: 2000 + Math.random() * 2000, gain: 0.06 }); noise(t, 0.3, { type: 'highpass', freq: 4000, gain: 0.25 }); },
  elim() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.12, { type: 'square', freq: 660, gain: 0.08 }); tone(t + 0.1, 0.3, { type: 'square', freq: 990, gain: 0.08 }); },
  boom(d = 0, pan = 0) { if (!ctx) return; const t = ctx.currentTime, o = at(d * 0.6, pan); noise(t, 1.4, { freq: 1200, f2: 80, gain: 0.9, out: o }); tone(t, 0.9, { type: 'sine', freq: 70, f2: 28, gain: 0.8, out: o }); },
  pickup() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.08, { type: 'triangle', freq: 700, gain: 0.15 }); tone(t + 0.06, 0.1, { type: 'triangle', freq: 1050, gain: 0.12 }); },
  chest(d = 0) { if (!ctx) return; const t = ctx.currentTime, o = at(d); [784, 988, 1175, 1568].forEach((f, i) => tone(t + i * 0.07, 0.4, { type: 'triangle', freq: f, gain: 0.12, out: o })); noise(t, 0.2, { type: 'bandpass', freq: 500, q: 2, gain: 0.3, out: o }); },
  heal(k) { if (!ctx) return; const t = ctx.currentTime; if (k === 'bandage' || k === 'medkit') { for (let i = 0; i < 4; i++) noise(t + i * 0.18, 0.12, { type: 'bandpass', freq: 2200, q: 2, gain: 0.35 }); } else { for (let i = 0; i < 6; i++) noise(t + i * 0.09, 0.07, { type: 'bandpass', freq: 500 + i * 60, q: 6, gain: 0.7 }); } },
  healed() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.25, { type: 'sine', freq: 520, f2: 1040, gain: 0.12 }); },
  jump() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.6, { type: 'bandpass', freq: 400, f2: 1600, q: 1, gain: 0.25, attack: 0.1 }); },
  glider() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.35, { type: 'bandpass', freq: 300, f2: 900, q: 1.5, gain: 0.35, attack: 0.02 }); tone(t, 0.2, { freq: 200, f2: 120, gain: 0.15 }); },
  land() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.15, { freq: 500, gain: 0.35 }); },
  step(d = 0, wet = false) { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.06, { type: wet ? 'bandpass' : 'lowpass', freq: wet ? 900 : 900, gain: 0.32, out: at(d) }); },
  edit() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.05, { type: 'square', freq: 1400, gain: 0.04 }); },
  click() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.04, { type: 'square', freq: 1000, gain: 0.04 }); },
  storm() { if (!ctx) return; const t = ctx.currentTime; tone(t, 1.6, { type: 'sawtooth', freq: 110, f2: 82, gain: 0.08, attack: 0.3 }); tone(t, 1.6, { type: 'sawtooth', freq: 165, f2: 123, gain: 0.05, attack: 0.3 }); },
  victory() { if (!ctx) return; const t = ctx.currentTime; [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.13, 0.45, { type: 'triangle', freq: f, gain: 0.15 })); },
  dead() { if (!ctx) return; const t = ctx.currentTime; [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.18, 0.4, { type: 'triangle', freq: f, gain: 0.12 })); },
};

/** Looping beds: 'wind' (skydiving), 'storm' (inside the Nor'easter), 'blimp' (engine hum). level 0..1 */
export function loop(name, level) {
  if (!ctx) return;
  let L = loops[name];
  if (!L) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    if (name === 'blimp') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      o.connect(f); f.connect(g); o.start();
    } else {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = name === 'wind' ? 'bandpass' : 'lowpass'; f.frequency.value = name === 'wind' ? 700 : 500; f.Q.value = 0.6;
      s.connect(f); f.connect(g); s.start();
      L = { g, f };
    }
    L = loops[name] = L || { g };
  }
  L.g.gain.setTargetAtTime(level * (name === 'blimp' ? 0.12 : 0.3), ctx.currentTime, 0.2);
}
