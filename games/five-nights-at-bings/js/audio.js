// All sound is made here with Web Audio (no files), plus spoken lines through the browser's speech voice.
export const A = { on: true };
let ctx = null, master = null, nbuf = null, loops = {}, keep = null, voice = null;

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = A.on ? 0.8 : 0; master.connect(ctx.destination);
  nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  pickVoice();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;
}
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  voice = vs.find(v => /Daniel|Alex|Google US English|Aaron|Fred/i.test(v.name)) || vs[0] || null;
}
export function setOn(v) {
  A.on = v;
  if (master) master.gain.value = v ? 0.8 : 0;
  if (!v && 'speechSynthesis' in window) speechSynthesis.cancel();
}
export function hush() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
export const canSpeak = () => A.on && 'speechSynthesis' in window;

// Speak a line. done() runs when it ends (or fails).
export function speak(text, { pitch = 1, rate = 1 } = {}, done) {
  if (!canSpeak()) { done && done(); return; }
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.pitch = pitch; u.rate = rate; u.volume = 1;
  u.onend = u.onerror = () => { done && done(); };
  keep = u; // Chrome drops utterances that nothing points at
  speechSynthesis.speak(u);
}

function out(pan) {
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(master); return p; }
  return master;
}
function tone(f, dur, { type = 'sine', vol = 0.2, to = 0, at = 0, pan = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { vol = 0.2, f = 1000, q = 1, type = 'lowpass', at = 0, pan = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = nbuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(out(pan)); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
// A named looping sound that can be switched on and off.
export function loop(name, on, vol = 0.1) {
  if (!ctx) return;
  let L = loops[name];
  if (!L) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    if (name === 'hum') {
      for (const f of [55, 110.5, 164]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const fl = ctx.createBiquadFilter(); fl.frequency.value = 260; o.connect(fl); fl.connect(g); o.start(); }
    } else {
      const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true; const fl = ctx.createBiquadFilter();
      if (name === 'static') { fl.type = 'highpass'; fl.frequency.value = 2500; }
      else if (name === 'buzz') { fl.type = 'bandpass'; fl.frequency.value = 120; fl.Q.value = 6; }
      else if (name === 'pour') { fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 1.5; }
      else { fl.type = 'lowpass'; fl.frequency.value = 400; }
      s.connect(fl); fl.connect(g); s.start();
    }
    L = loops[name] = { g };
  }
  L.g.gain.setTargetAtTime(on ? vol : 0, ctx.currentTime, 0.04);
}
export function stopLoops() { if (!ctx) return; for (const k in loops) loops[k].g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); }

export const sfx = {
  click() { tone(900, 0.05, { type: 'square', vol: 0.08 }); },
  door(side) { const p = side === 'L' ? -0.7 : 0.7; noise(0.5, { vol: 0.5, f: 300, pan: p }); tone(90, 0.35, { type: 'sawtooth', vol: 0.3, to: 40, pan: p }); },
  vent() { noise(0.3, { vol: 0.35, f: 1800, type: 'bandpass', q: 2 }); tone(200, 0.2, { type: 'square', vol: 0.1, to: 80 }); },
  flip() { noise(0.18, { vol: 0.25, f: 3000, type: 'highpass' }); },
  blip() { tone(1400, 0.04, { type: 'square', vol: 0.06 }); },
  step(side, n = 3) { const p = side === 'L' ? -0.8 : side === 'R' ? 0.8 : 0; for (let i = 0; i < n; i++) { tone(70, 0.16, { vol: 0.5, to: 38, at: i * 0.42, pan: p }); noise(0.1, { vol: 0.12, f: 500, at: i * 0.42, pan: p }); } },
  bang(side, n = 3) { const p = side === 'L' ? -0.8 : 0.8; for (let i = 0; i < n; i++) { noise(0.22, { vol: 0.8, f: 220, at: i * 0.28, pan: p }); tone(60, 0.2, { type: 'square', vol: 0.4, to: 35, at: i * 0.28, pan: p }); } },
  laugh() { for (let i = 0; i < 5; i++) tone(120 - i * 9, 0.22, { type: 'sawtooth', vol: 0.22, to: 70 - i * 5, at: i * 0.24 }); },
  growl() { tone(85, 0.7, { type: 'sawtooth', vol: 0.15, to: 55 }); noise(0.7, { vol: 0.08, f: 300 }); },
  smash() { noise(0.5, { vol: 0.5, f: 5000, type: 'highpass' }); for (let i = 0; i < 6; i++) tone(2000 + Math.random() * 3000, 0.12, { vol: 0.07, at: Math.random() * 0.25 }); },
  coins(n = 5) { for (let i = 0; i < n; i++) tone(2400 + Math.random() * 1600, 0.09, { type: 'triangle', vol: 0.1, at: i * 0.09 + Math.random() * 0.04 }); },
  ring() { for (let k = 0; k < 2; k++) for (let i = 0; i < 12; i++) tone(i % 2 ? 1250 : 1000, 0.045, { type: 'square', vol: 0.07, at: k * 1.2 + i * 0.05 }); },
  glitch() { noise(0.6, { vol: 0.3, f: 4000, type: 'highpass' }); },
  powerDown() { tone(220, 1.6, { type: 'sawtooth', vol: 0.3, to: 25 }); noise(0.8, { vol: 0.2, f: 200 }); },
  wake() { for (let i = 0; i < 8; i++) tone(880 * Math.pow(0.84, i), 0.5, { type: 'triangle', vol: 0.2, at: i * 0.22 }); },
  tick() { tone(660, 0.08, { type: 'square', vol: 0.12 }); },
  scare() {
    if (!ctx) return;
    noise(1.3, { vol: 0.9, f: 1800, type: 'bandpass', q: 0.6 });
    for (const f of [311, 466, 622, 933]) tone(f, 1.2, { type: 'sawtooth', vol: 0.3, to: f * 0.6 });
  },
  chime() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => { tone(f, 0.9, { type: 'triangle', vol: 0.22, at: i * 0.32 }); tone(f * 2, 0.6, { vol: 0.07, at: i * 0.32 }); }); },
  jingle() { [392, 392, 494, 587, 494, 392, 330, 392].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.16, at: i * 0.55 })); },
};

// The music box tune (our own little waltz). It slows down as the box unwinds.
const N = { A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, G4: 392, E4: 330, F4: 349 };
const TUNE = ['E5', 'C5', 'A4', 'E5', 'C5', 'A4', 'F5', 'D5', 'B4', 'F5', 'D5', 'B4', 'E5', 'C5', 'A4', 'D5', 'B4', 'G4', 'C5', 'A4', 'E4', 'A4', 0, 0,
  'A5', 'E5', 'C5', 'A5', 'E5', 'C5', 'G5', 'D5', 'B4', 'G5', 'D5', 'B4', 'F5', 'C5', 'A4', 'E5', 'B4', 'G4', 'A4', 'C5', 'E5', 'A4', 0, 0];
const box = { i: 0, t: 0 };
export function musicBox(dt, level, near) {
  if (!ctx || level <= 0) return;
  box.t -= dt;
  if (box.t > 0) return;
  const k = Math.max(0.25, level / 100);
  box.t = 0.2 / (0.35 + 0.65 * k);
  const n = TUNE[box.i++ % TUNE.length];
  if (n) { const f = N[n] * (0.9 + 0.1 * k); tone(f, 0.7, { type: 'triangle', vol: near ? 0.2 : 0.045 }); tone(f * 3, 0.25, { vol: near ? 0.05 : 0.012 }); }
}
