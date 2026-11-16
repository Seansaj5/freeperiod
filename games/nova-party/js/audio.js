// Chip-style sounds made on the spot with Web Audio (square and triangle beeps, bursts of noise). No files.
let ctx = null, out = null, musicGain = null, on = true, musicOn = true, loop = null;

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain(); out.gain.value = on ? 0.5 : 0; out.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.5 : 0; musicGain.connect(out);
  } catch { ctx = null; }
}
export function setSound(v) { on = v; if (out) out.gain.value = v ? 0.5 : 0; }
export function setMusic(v) { musicOn = v; if (musicGain) musicGain.gain.value = v ? 0.5 : 0; }

function tone(f, at, dur, { type = 'square', vol = 0.12, to = 0, dest } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || out); o.start(t); o.stop(t + dur + 0.02);
}
function noise(at, dur, vol = 0.2, lp = 4000) {
  if (!ctx) return;
  const t = ctx.currentTime + at, n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < n; i++) { if (i % 6 === 0) v = Math.random() * 2 - 1; d[i] = v; }   // held samples = crunchy 8-bit noise
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(lp, t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t);
}
const N = (semi) => 440 * 2 ** (semi / 12);
const arp = (notes, step, opt) => notes.forEach((n, i) => tone(N(n), i * step, step * 1.6, opt));

export const sfx = {
  click() { tone(660, 0, 0.05, { vol: 0.08 }); },
  key() { tone(1200 + Math.random() * 200, 0, 0.025, { vol: 0.03 }); },
  tick(hot) { tone(hot ? 1320 : 990, 0, 0.03, { type: 'triangle', vol: 0.09 }); },
  turn() { arp([3, 10], 0.07, { vol: 0.1 }); },
  pass() { tone(520, 0, 0.14, { to: 1040, vol: 0.08, type: 'triangle' }); },
  no() { tone(150, 0, 0.16, { vol: 0.12, type: 'sawtooth', to: 90 }); },
  ok(tier) {
    const sets = [[3, 7], [3, 7, 10], [3, 7, 10, 15], [3, 7, 10, 15, 19], [3, 10, 15, 19, 22, 27]];
    arp(sets[tier] || sets[0], 0.055, { vol: 0.1 });
    if (tier === 4) { arp([27, 31, 34, 39], 0.08, { vol: 0.07, type: 'triangle' }); }
  },
  life() { arp([10, 15, 22], 0.09, { vol: 0.1, type: 'triangle' }); },
  pop() { noise(0, 0.7, 0.34, 5000); tone(180, 0, 0.5, { to: 40, vol: 0.2, type: 'triangle' }); tone(90, 0.05, 0.6, { to: 30, vol: 0.16, type: 'sawtooth' }); },
  round() { arp([-2, 5, 10, 17], 0.07, { vol: 0.08, type: 'triangle' }); },
  win() { arp([3, 7, 10, 15, 10, 15, 19, 22], 0.11, { vol: 0.1 }); },
  lose() { arp([10, 7, 3, -2, -9], 0.14, { vol: 0.1, type: 'triangle' }); },
};

// A quiet four-bar loop: bass and a sparkle on top.
const BASS = [-21, -21, -14, -21, -17, -17, -12, -17, -19, -19, -12, -19, -16, -16, -9, -14];
const LEAD = [3, null, 10, 7, null, 15, 10, null, 5, null, 12, 8, null, 14, 12, 7];
export function startMusic() {
  if (!ctx || loop) return;
  let i = 0;
  const step = 0.21;
  loop = setInterval(() => {
    if (!ctx || ctx.state !== 'running' || document.hidden) return;
    tone(N(BASS[i % 16]), 0, step * 0.9, { type: 'triangle', vol: 0.07, dest: musicGain });
    const l = LEAD[(i + (Math.floor(i / 16) % 2 ? 4 : 0)) % 16];
    if (l !== null) tone(N(l), 0, step * 0.7, { vol: 0.022, dest: musicGain });
    i++;
  }, step * 1000);
}
export function stopMusic() { clearInterval(loop); loop = null; }
