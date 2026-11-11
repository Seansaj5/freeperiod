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

test('THEMES order and names', () => {
  assert.deepEqual(T.THEMES.map((t) => t.id), ['neon', 'aero', 'space', 'minimal']);
  assert.deepEqual(T.THEMES.map((t) => t.name), ['Neon', 'Night Aero', 'Deep Space', 'Minimal']);
  assert.equal(T.DEFAULT_THEME, 'neon');
  assert.ok(Object.isFrozen(T.THEMES));
});

test('cleanTheme falls back to neon', () => {
  assert.equal(T.cleanTheme('space'), 'space');
  assert.equal(T.cleanTheme('nope'), 'neon');
  assert.equal(T.cleanTheme(undefined), 'neon');
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
    assert.doesNotThrow(() => T.setTheme('space'));
    assert.equal(T.getTheme(), 'space');   // session fallback
    T.setTheme('neon');
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: fakeStorage() });
  }
});

test('getEffects default: on for neon/aero/space, off for minimal; explicit fp.fx wins', () => {
  reset();
  for (const [t, want] of [['neon', true], ['aero', true], ['space', true], ['minimal', false]]) {
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

test('theme-boot.js regex accepts exactly the THEMES ids', () => {
  const boot = readFileSync(new URL('../fp/theme-boot.js', import.meta.url), 'utf8');
  const m = boot.match(/\/\^\(([a-z|]*)\)\$\/\.test\(fpTheme/);
  assert.ok(m, 'theme regex present');
  const re = new RegExp('^(' + m[1] + ')$');
  for (const t of T.THEMES) assert.equal(re.test(t.id), t.id !== 'neon', t.id);
  assert.equal(re.test('bogus'), false);
});
