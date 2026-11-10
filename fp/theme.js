// Accent theme: five accents for the hub's chrome (buttons, glows, chips, the logo). Saved per device (fp.accent) and
// put on <html data-accent> (style.css swaps --lime / --cyan and their rgb triplets). Game posters and each game's own
// accent never change. fp/theme-boot.js applies the saved one before the first paint.
import * as store from './store.js';

export const ACCENTS = Object.freeze([
  Object.freeze({ id: 'lime', label: 'Lime', color: '#c6ff3d', second: '#3de0ff' }),
  Object.freeze({ id: 'cyan', label: 'Cyan', color: '#3de0ff', second: '#5dffc0' }),
  Object.freeze({ id: 'pink', label: 'Pink', color: '#ff6ad5', second: '#3de0ff' }),
  Object.freeze({ id: 'orange', label: 'Orange', color: '#ffa23d', second: '#ffd84a' }),
  Object.freeze({ id: 'violet', label: 'Violet', color: '#a98bff', second: '#3de0ff' }),
]);
export const DEFAULT_ACCENT = 'lime';
const KEY = 'fp.accent';

/** A known accent id, or the default. */
export function cleanAccent(id) { return ACCENTS.some((a) => a.id === id) ? id : DEFAULT_ACCENT; }
export function getAccent() { return cleanAccent(store.get(KEY)); }

const listeners = new Set();
export function onAccent(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Puts the accent on <html> (lime = no attribute, the stylesheet default). */
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
  return a;
}
// Another tab picked an accent: follow it.
try { if (typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { const a = applyAccent(); for (const fn of [...listeners]) { try { fn(a); } catch { /* ignore */ } } } }); } catch { /* no window */ }
