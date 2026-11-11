import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
const T = await import('../fp/theme.js');
const reset = () => { globalThis.localStorage = fakeStorage(); };

const isReady = (id) => T.THEMES.some((t) => t.id === id && t.ready);

test('THEMES order and names', () => {
  assert.deepEqual(T.THEMES.map((t) => t.id), ['neon', 'aero', 'space', 'minimal']);
  assert.deepEqual(T.THEMES.map((t) => t.name), ['Neon', 'Night Aero', 'Deep Space', 'Minimal']);
  assert.equal(T.DEFAULT_THEME, 'neon');
  assert.ok(Object.isFrozen(T.THEMES));
  for (const t of T.THEMES) assert.equal(typeof t.ready, 'boolean', t.id);
  assert.ok(isReady('neon') && isReady('aero') && isReady('space'), 'neon, Night Aero and Deep Space ship');
});

test('cleanTheme falls back to neon', () => {
  assert.equal(T.cleanTheme('aero'), 'aero');
  assert.equal(T.cleanTheme('space'), 'space');
  assert.equal(T.cleanTheme('minimal'), isReady('minimal') ? 'minimal' : 'neon');
  assert.equal(T.cleanTheme('nope'), 'neon');
  assert.equal(T.cleanTheme(undefined), 'neon');
});

test('unready themes are hidden from the picker list and cleanTheme maps them to neon', () => {
  reset();
  const ready = T.readyThemes().map((t) => t.id);
  assert.deepEqual(ready, T.THEMES.filter((t) => t.ready).map((t) => t.id));
  assert.equal(ready[0], 'neon');
  for (const t of T.THEMES.filter((x) => !x.ready)) {
    assert.ok(!ready.includes(t.id), t.id + ' not offered');
    assert.equal(T.cleanTheme(t.id), 'neon', t.id);
    localStorage.setItem('fp.theme', t.id);           // stored before it was hidden (or by hand)
    assert.equal(T.getTheme(), 'neon', t.id);
    assert.equal(T.setTheme(t.id), 'neon', t.id);
    assert.equal(localStorage.getItem('fp.theme'), null);
  }
  // the sheet builds its grid from readyThemes(), not THEMES
  const sheet = readFileSync(new URL('../fp/theme-sheet.js', import.meta.url), 'utf8');
  assert.match(sheet, /readyThemes\(\)\.map\(/);
  assert.doesNotMatch(sheet, /\bTHEMES\.map\(/);
});

test('get/set round trip and onTheme fires', () => {
  reset();
  assert.equal(T.getTheme(), 'neon');
  const seen = [];
  const off = T.onTheme((t) => seen.push(t));
  assert.equal(T.setTheme('aero'), 'aero');
  assert.equal(localStorage.getItem('fp.theme'), 'aero');
  assert.equal(T.getTheme(), 'aero');
  off();
  T.setTheme('minimal');
  assert.deepEqual(seen, ['aero']);
  T.setTheme('neon');
  assert.equal(localStorage.getItem('fp.theme'), null);
});

test('onPrefs fires on theme, accent, fx and sfx', () => {
  reset();
  let n = 0;
  const off = T.onPrefs(() => { n++; });
  T.setTheme('space'); T.setAccent('pink'); T.setEffects(false); T.setSounds(false);
  off();
  T.setTheme('neon');
  assert.equal(n, 4);
  T.setAccent('lime');
});

test('blocked storage: getTheme() is neon, setTheme does not throw and applies for the session', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    assert.equal(T.getTheme(), 'neon');
    assert.doesNotThrow(() => T.setTheme('aero'));
    assert.equal(T.getTheme(), 'aero');   // session fallback
    T.setTheme('neon');
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: fakeStorage() });
  }
});

test('getEffects default: on for neon/aero/space, off for minimal (once it ships); explicit fp.fx wins', () => {
  reset();
  for (const [t, want] of [['neon', true], ['aero', true], ['space', true], ['minimal', !isReady('minimal')]]) {
    T.setTheme(t);
    assert.equal(T.getEffects(), want, t);
  }
  assert.equal(localStorage.getItem('fp.fx'), null);   // theme change never writes fp.fx
  T.setEffects(true);
  assert.equal(T.getEffects(), true);                   // explicit on beats minimal's default
  T.setTheme('neon');
  T.setEffects(false);
  assert.equal(T.getEffects(), false);
  assert.equal(localStorage.getItem('fp.fx'), 'off');
});

test('getSounds default on', () => {
  reset();
  assert.equal(T.getSounds(), true);
  T.setSounds(false);
  assert.equal(T.getSounds(), false);
  T.setSounds(true);
  assert.equal(T.getSounds(), true);
});

test('theme-boot.js regex accepts exactly the ready THEMES ids (neon is the fallback)', () => {
  const boot = readFileSync(new URL('../fp/theme-boot.js', import.meta.url), 'utf8');
  const m = boot.match(/\/\^\(([a-z|]*)\)\$\/\.test\(fpTheme/);
  assert.ok(m, 'theme regex present');
  const re = new RegExp('^(' + m[1] + ')$');
  for (const t of T.THEMES) assert.equal(re.test(t.id), t.ready && t.id !== 'neon', t.id);
  assert.equal(re.test('bogus'), false);
});

test('theme-boot.js theme colors match THEME_COLORS', () => {
  const boot = readFileSync(new URL('../fp/theme-boot.js', import.meta.url), 'utf8');
  const m = boot.match(/var fpTC = (\{[^}]*\});/);
  assert.ok(m, 'color map present');
  const map = Function('return ' + m[1])();
  assert.deepEqual(map, { ...T.THEME_COLORS });
  for (const t of T.THEMES) assert.match(T.THEME_COLORS[t.id], /^#[0-9a-f]{6}$/, t.id);
});

test('applyTheme updates meta[name=theme-color]', () => {
  reset();
  const attrs = {};
  const meta = { attrs: { name: 'theme-color', content: '#05070c' }, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = String(v); } };
  globalThis.document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } },
    querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
  };
  try {
    T.applyTheme('aero');
    assert.equal(attrs['data-theme'], 'aero');
    assert.equal(meta.attrs.content, T.THEME_COLORS.aero);
    T.setTheme('neon');
    assert.equal(meta.attrs.content, T.THEME_COLORS.neon);
    T.applyTheme('space');
    assert.equal(attrs['data-theme'], 'space');
    assert.equal(meta.attrs.content, T.THEME_COLORS.space);
    T.applyTheme('minimal');                                // not ready yet: neon, and neon's color
    assert.equal(meta.attrs.content, T.THEME_COLORS[T.cleanTheme('minimal')]);
    globalThis.document.querySelector = () => null;         // a page without the meta: no throw
    assert.doesNotThrow(() => T.applyTheme('aero'));
  } finally {
    delete globalThis.document;
  }
});

test('accent: nothing stored = Theme; an explicit lime is stored and survives a theme switch', () => {
  reset();
  T.setTheme('neon');
  assert.equal(T.getAccent(), 'theme');                    // the Theme swatch is the selected one
  assert.equal(T.themeAccent('neon').color, '#c6ff3d');    // neon with nothing stored is lime
  assert.equal(T.themeAccent('aero').color, '#4fd8ff');
  assert.equal(T.themeAccent('space').color, '#ffb84a');
  assert.equal(T.themeAccent('minimal').color, '#e8e8ea');
  T.setTheme('aero');
  assert.equal(T.setAccent('lime'), 'lime');
  assert.equal(localStorage.getItem('fp.accent'), 'lime');
  T.setTheme('space'); T.setTheme('aero');
  assert.equal(T.getAccent(), 'lime');
  T.setAccent('theme');
  assert.equal(localStorage.getItem('fp.accent'), null);
  assert.equal(T.getAccent(), 'theme');
});

test('themes.css has an explicit lime accent override after the theme blocks', () => {
  const css = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
  assert.ok(css.indexOf(':root[data-accent="lime"]') > css.indexOf(':root[data-theme="minimal"]'));
});
