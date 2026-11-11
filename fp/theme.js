// Accent theme: five accents for the hub's chrome (buttons, glows, chips, the logo). Saved per device (fp.accent) and
// put on <html data-accent> (style.css swaps --lime / --cyan and their rgb triplets). Game posters and each game's own
// accent never change. fp/theme-boot.js applies the saved one before the first paint.
// Also the whole-site theme (neon, aero, space, minimal: fp.theme -> <html data-theme>), the effects switch (fp.fx ->
// <html data-fx>) and the sounds switch (fp.sfx). themes.css owns what each theme looks like.
import * as store from './store.js';

export const ACCENTS = Object.freeze([
  Object.freeze({ id: 'lime', label: 'Lime', color: '#c6ff3d', second: '#3de0ff' }),
  Object.freeze({ id: 'cyan', label: 'Cyan', color: '#3de0ff', second: '#5dffc0' }),
  Object.freeze({ id: 'pink', label: 'Pink', color: '#ff6ad5', second: '#3de0ff' }),
  Object.freeze({ id: 'orange', label: 'Orange', color: '#ffa23d', second: '#ffd84a' }),
  Object.freeze({ id: 'violet', label: 'Violet', color: '#a98bff', second: '#3de0ff' }),
]);
/** 'theme' = no stored accent: the current theme's own accent (themes.css). 'lime' is a real, stored accent like the others. */
export const DEFAULT_ACCENT = 'theme';
const KEY = 'fp.accent';

/** A known accent id, or 'theme'. */
export function cleanAccent(id) { return ACCENTS.some((a) => a.id === id) ? id : DEFAULT_ACCENT; }
export function getAccent() { return cleanAccent(store.get(KEY)); }

const listeners = new Set();
const prefListeners = new Set();
export function onAccent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** Fires (no arguments) after any of theme / accent / effects / sounds changes, here or in another tab. */
export function onPrefs(fn) { prefListeners.add(fn); return () => prefListeners.delete(fn); }
function firePrefs() { for (const fn of [...prefListeners]) { try { fn(); } catch { /* ignore */ } } }

/** Puts the accent on <html> ('theme' = no attribute: the theme's own accent). */
export function applyAccent(id = getAccent()) {
  const a = cleanAccent(id), root = globalThis.document && document.documentElement;
  if (!root) return a;
  if (a === DEFAULT_ACCENT) root.removeAttribute('data-accent'); else root.setAttribute('data-accent', a);
  return a;
}
export function setAccent(id) {
  const a = cleanAccent(id);
  if (a === DEFAULT_ACCENT) store.del(KEY); else store.set(KEY, a);
  applyAccent(a);
  for (const fn of [...listeners]) { try { fn(a); } catch { /* ignore */ } }
  firePrefs();
  return a;
}

// ---------- whole-site theme ----------
// ready: false = not finished yet: hidden from the picker, never applied (a stored one falls back to neon), and left out of
// theme-boot.js's pattern. Flip it to true when the theme ships.
export const THEMES = Object.freeze([
  Object.freeze({ id: 'neon', name: 'Neon', ready: true }),
  Object.freeze({ id: 'aero', name: 'Night Aero', ready: true }),
  Object.freeze({ id: 'space', name: 'Deep Space', ready: true }),
  Object.freeze({ id: 'minimal', name: 'Minimal', ready: true }),
]);
/** The themes people can pick (the picker shows these; the rest are still being built). */
export function readyThemes() { return THEMES.filter((t) => t.ready); }
export const DEFAULT_THEME = 'neon';
// The browser bar color per theme (<meta name="theme-color">: the top of each theme's header). Keep in step with
// themes.css and the copy in fp/theme-boot.js (tests/theme checks it).
export const THEME_COLORS = Object.freeze({ neon: '#05070c', aero: '#16335e', space: '#000000', minimal: '#0d0d0f' });
// Each theme's own accent: what the "Theme" swatch shows (keep in step with themes.css).
const THEME_ACCENT = { neon: ['#c6ff3d', '#3de0ff'], aero: ['#4fd8ff', '#96c4ff'], space: ['#ffb84a', '#8fd3ff'], minimal: ['#e8e8ea', '#a0a0a8'] };
export function themeAccent(id = getTheme()) { const [color, second] = THEME_ACCENT[id] || THEME_ACCENT[cleanTheme(id)]; return { id: 'theme', label: 'Theme', color, second }; }
const THEME_KEY = 'fp.theme', FX_KEY = 'fp.fx', SFX_KEY = 'fp.sfx';
// Blocked storage: a write that fails is remembered for this page only.
const session = {};
function put(key, value, isDefault) {
  const ok = value == null ? (store.del(key), true) : store.set(key, value);
  if (ok && isDefault) store.del(key);
  session[key] = ok ? undefined : value;
}
function read(key) { const v = store.get(key); return v != null ? v : session[key]; }

/** A known, ready theme id, or neon. */
export function cleanTheme(id) { return THEMES.some((t) => t.id === id && t.ready) ? id : DEFAULT_THEME; }
export function getTheme() { return cleanTheme(read(THEME_KEY)); }
/** Effects: an explicit fp.fx wins; otherwise on, except in Minimal. Changing the theme never writes fp.fx. */
export function getEffects() {
  const v = read(FX_KEY);
  if (v === 'on') return true;
  if (v === 'off') return false;
  return getTheme() !== 'minimal';
}
export function getSounds() { return read(SFX_KEY) !== 'off'; }

const themeListeners = new Set();
export function onTheme(fn) { themeListeners.add(fn); return () => themeListeners.delete(fn); }

/** Puts data-theme and data-fx on <html> (neon is a real attribute value, not the absence of one), and the theme's color
 *  on <meta name="theme-color"> (the phone's browser bar). */
export function applyTheme(id = getTheme()) {
  const t = cleanTheme(id), root = globalThis.document && document.documentElement;
  if (!root) return t;
  root.setAttribute('data-theme', t);
  root.setAttribute('data-fx', getEffects() ? 'on' : 'off');
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && meta.getAttribute('content') !== THEME_COLORS[t]) meta.setAttribute('content', THEME_COLORS[t]);
  } catch { /* no meta: nothing to tint */ }
  return t;
}
export function setTheme(id) {
  const t = cleanTheme(id);
  put(THEME_KEY, t, t === DEFAULT_THEME);
  applyTheme(t);
  for (const fn of [...themeListeners]) { try { fn(t); } catch { /* ignore */ } }
  firePrefs();
  return t;
}
export function setEffects(on) {
  put(FX_KEY, on ? 'on' : 'off', false);
  applyTheme();
  firePrefs();
  return !!on;
}
export function setSounds(on) {
  put(SFX_KEY, on ? null : 'off', false);
  firePrefs();
  return !!on;
}
// Another tab picked an accent: follow it.
try { if (typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key === KEY || e.key === THEME_KEY || e.key === FX_KEY || e.key === SFX_KEY || e.key === null) { const a = applyAccent(); applyTheme(); for (const fn of [...listeners]) { try { fn(a); } catch { /* ignore */ } } for (const fn of [...themeListeners]) { try { fn(getTheme()); } catch { /* ignore */ } } firePrefs(); } }); } catch { /* no window */ }
