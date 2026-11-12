// Sounds: tiny synthesized UI sounds (Web Audio oscillators + noise, no audio files). play('hover'|'click'|'toggle'|'whoosh')
// is a quiet no-op when sounds are off, before the first gesture (browsers keep audio locked until then; armSfx() unlocks it on
// the first pointerdown/keydown) or without Web Audio. The timbre follows the theme: neon = square blip with a pitch drop,
// aero = glassy sine bloop bending up with a short echo, space = a soft shimmering sine pair, minimal = a very short filtered click.
// Every sound is under 250 ms (whoosh under 400 ms). Hover is rate limited to one per 80 ms.
import { getTheme, getSounds } from './theme.js';

export const MASTER_GAIN = 0.12;
export const HOVER_GAP_MS = 80;
export const NAMES = Object.freeze(['hover', 'click', 'toggle', 'whoosh']);

let Ctor = typeof globalThis.AudioContext === 'function' ? globalThis.AudioContext : (typeof globalThis.webkitAudioContext === 'function' ? globalThis.webkitAudioContext : null);
let now = () => (globalThis.performance && performance.now ? performance.now() : Date.now());
let ctx = null, master = null, unlocked = false, lastHover = -Infinity, noiseBuf = null;

/** Test hook: swap the AudioContext constructor and clock, and forget any context made so far. */
export function _inject({ AudioContext, now: clock } = {}) {
  Ctor = AudioContext === undefined ? Ctor : AudioContext;
  if (clock) now = clock;
  ctx = null; master = null; unlocked = false; lastHover = -Infinity; noiseBuf = null;
}
/** What the browser check reads (no listening needed). */
export function _debug() { return { hasContext: !!ctx, state: ctx ? ctx.state : null, unlocked }; }

function ensure() {
  if (ctx) return ctx;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  } catch { ctx = null; master = null; }
  return ctx;
}

/** Unlocks audio on the first pointerdown/keydown. Returns stop(). */
export function armSfx() {
  // Real activation events only: touch's pointerdown does not count (Chrome would log "not allowed to start"), so touch unlocks
  // on pointerup/touchend/click; a mouse pointerdown does count.
  const targets = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  const off = () => { for (const t of targets) { try { globalThis.removeEventListener(t, unlock, true); } catch { /* none */ } } };
  function unlock(e) {
    if (unlocked) return;
    if (e && e.type === 'pointerdown' && e.pointerType && e.pointerType !== 'mouse') return;
    unlocked = true;
    off();
    const c = ensure();
    if (c && c.state === 'suspended' && typeof c.resume === 'function') { try { Promise.resolve(c.resume()).catch(() => {}); } catch { /* stays locked */ } }
  }
  if (!unlocked) for (const t of targets) { try { globalThis.addEventListener(t, unlock, true); } catch { /* no window */ } }
  return off;
}

// ---------- voices ----------
// One oscillator with a quick envelope: freq f0 -> f1 over dur, peak vol, optional attack. Returns the gain node.
function tone(c, dest, { type = 'sine', f0, f1 = f0, dur, vol, attack = 0.004, at = 0 }) {
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
  return g;
}

// per-sound pitch/size: hover is higher and quieter, toggle steps up a third
const SHAPE = { hover: { mul: 1.5, vol: 0.45, len: 0.7 }, click: { mul: 1, vol: 1, len: 1 }, toggle: { mul: 1.26, vol: 1, len: 1.25 } };

const VOICES = {
  neon(c, s) {
    tone(c, master, { type: 'square', f0: 880 * s.mul, f1: 440 * s.mul, dur: 0.09 * s.len, vol: 0.5 * s.vol });
  },
  aero(c, s) {
    const dur = 0.13 * s.len;
    const bus = c.createGain(), echo = c.createDelay(), eg = c.createGain();
    bus.connect(master);
    echo.delayTime.value = 0.07; eg.gain.value = 0.35;
    bus.connect(echo); echo.connect(eg); eg.connect(master);
    tone(c, bus, { type: 'sine', f0: 520 * s.mul, f1: 860 * s.mul, dur, vol: 0.8 * s.vol, attack: 0.012 });
  },
  space(c, s) {
    const dur = 0.2 * s.len > 0.24 ? 0.24 : 0.2 * s.len;
    const f = 440 * s.mul;
    tone(c, master, { type: 'sine', f0: f, dur, vol: 0.4 * s.vol, attack: 0.06 });
    tone(c, master, { type: 'sine', f0: f * 1.5 * 1.004, dur, vol: 0.28 * s.vol, attack: 0.07 });
  },
  minimal(c, s) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.7;
    f.connect(master);
    tone(c, f, { type: 'sine', f0: 1500 * s.mul, f1: 900 * s.mul, dur: 0.035 * s.len, vol: 0.35 * s.vol, attack: 0.002 });
  },
};

function whoosh(c, theme) {
  const dur = 0.32;
  if (!noiseBuf) {
    const n = Math.max(1, Math.floor((c.sampleRate || 44100) * dur));
    noiseBuf = c.createBuffer(1, n, c.sampleRate || 44100);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  f.type = 'bandpass'; f.Q.value = theme === 'minimal' ? 0.6 : 1.2;
  const lo = theme === 'space' ? 300 : 500, hi = theme === 'minimal' ? 1800 : 3200;
  f.frequency.setValueAtTime(lo, t);
  f.frequency.exponentialRampToValueAtTime(hi, t + dur);
  const vol = theme === 'minimal' ? 0.2 : 0.6;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

/** Plays one UI sound. Never throws, never waits. */
export function play(name) {
  try {
    if (!NAMES.includes(name) || !unlocked || !getSounds()) return;
    if (name === 'hover') {
      const t = now();
      if (t - lastHover < HOVER_GAP_MS) return;
      lastHover = t;
    }
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended' && typeof c.resume === 'function') { try { Promise.resolve(c.resume()).catch(() => {}); } catch { /* ignore */ } }
    const theme = getTheme();
    if (name === 'whoosh') whoosh(c, theme); else VOICES[theme](c, SHAPE[name]);
  } catch { /* a sound is never worth an error */ }
}

// ---------- page wiring ----------
const HOVER_SEL = '.card, .tile, .top a, .top button, .tool, [data-sfx]';
// the chat app (and the popups/sheets it renders outside .cx-app) stays silent
const QUIET = '.cx-app, .cx-pop, .cx-menu, .cx-sheet, .cx-picker, [class*="fpco"], [data-sfx="none"]';
const internalLink = (a) => {
  try {
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return false;
    const u = new URL(a.href, location.href);
    return u.origin === location.origin && !(u.pathname === location.pathname && u.search === location.search && u.hash);
  } catch { return false; }
};

/** Document-wide sound hooks: hover ticks (mouse only) on cards/nav/buttons, data-sfx="click|toggle" on click, and the whoosh
 *  on internal link navigation (fired in the capture phase, before motion.js names the poster for the view transition; never
 *  waits). Chat and the games stay silent: they are not given these hooks. Returns stop(). */
export function wireSfx(doc = globalThis.document) {
  if (!doc || typeof doc.addEventListener !== 'function') return () => {};
  const over = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const el = e.target && e.target.closest && e.target.closest(HOVER_SEL);
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    if (el.closest(QUIET)) return;
    play('hover');
  };
  const click = (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t || t.closest(QUIET)) return;
    const a = t.closest('a[href]');
    if (a && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && internalLink(a)) { play('whoosh'); return; }
    const s = t.closest('[data-sfx]');
    if (!s) return;
    // a toggle sounds after the button's own handler ran (capture phase comes first), so it reflects the new sound/theme state
    if (s.dataset.sfx === 'toggle') setTimeout(() => play('toggle'), 0);
    else if (s.dataset.sfx === 'click') play('click');
  };
  doc.addEventListener('pointerover', over, { passive: true });
  doc.addEventListener('click', click, true);
  return () => { doc.removeEventListener('pointerover', over); doc.removeEventListener('click', click, true); };
}
