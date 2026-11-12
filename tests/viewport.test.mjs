// Phones and iPads (fp/viewport.js): the on-screen keyboard inset and the Fullscreen API check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyboardInset, hasFullscreenApi, KEYBOARD_MIN, trackKeyboard } from '../fp/viewport.js';

test('keyboardInset: what the keyboard hides below the visible part', () => {
  assert.equal(keyboardInset({ layoutHeight: 844, vvHeight: 844, vvTop: 0 }), 0);          // no keyboard
  assert.equal(keyboardInset({ layoutHeight: 844, vvHeight: 508, vvTop: 0 }), 336);        // keyboard up
  assert.equal(keyboardInset({ layoutHeight: 844, vvHeight: 508, vvTop: 120 }), 216);      // iOS scrolled the page up too
  assert.equal(keyboardInset({ layoutHeight: 844, vvHeight: 900, vvTop: 0 }), 0);          // never negative
  assert.equal(keyboardInset({ layoutHeight: NaN, vvHeight: 500 }), 0);
  assert.ok(KEYBOARD_MIN > 80 && KEYBOARD_MIN < 250, 'an address bar sliding away is not a keyboard');
});

test('hasFullscreenApi: desktop/iPad yes, iPhone Safari no', () => {
  const el = { requestFullscreen() {} };
  assert.equal(hasFullscreenApi({ fullscreenEnabled: true }, el), true);
  assert.equal(hasFullscreenApi({ webkitFullscreenEnabled: true }, { webkitRequestFullscreen() {} }), true);   // older iPadOS
  assert.equal(hasFullscreenApi({}, {}), false);                                                             // iPhone
  assert.equal(hasFullscreenApi({ fullscreenEnabled: false }, el), false);                                   // blocked (iframe)
  assert.equal(hasFullscreenApi(null, el), false);
});

test('trackKeyboard without a visualViewport does nothing and does not throw', () => {
  assert.equal(typeof trackKeyboard(), 'function');
});

test('trackKeyboard sets the variables on <html> while a keyboard is up', () => {
  const props = new Map(), classes = new Set(), handlers = {};
  const vv = { height: 844, offsetTop: 0, addEventListener: (t, fn) => { handlers[t] = fn; }, removeEventListener: () => {} };
  globalThis.visualViewport = vv;
  globalThis.document = { documentElement: { clientHeight: 844, style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) }, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } } };
  globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };   // runs at once (0: nothing left pending)
  globalThis.cancelAnimationFrame = () => {};
  try {
    const stop = trackKeyboard();
    assert.equal(classes.has('fp-kb-up'), false);
    vv.height = 500; vv.offsetTop = 40; handlers.resize();
    assert.equal(classes.has('fp-kb-up'), true);
    assert.equal(props.get('--fp-kb'), '304px');
    assert.equal(props.get('--fp-vvh'), '500px');
    assert.equal(props.get('--fp-vvtop'), '40px');
    vv.height = 790; vv.offsetTop = 0; handlers.resize();                 // only the address bar: not a keyboard
    assert.equal(classes.has('fp-kb-up'), false);
    assert.equal(props.size, 0);
    stop();
  } finally {
    delete globalThis.visualViewport; delete globalThis.document; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
  }
});

test('games.js: orientation is either unset or landscape/portrait', () => {
  const src = readFileSync(new URL('../games.js', import.meta.url), 'utf8');
  const window = {};
  Function('window', src)(window);
  for (const g of window.GAMES) if (g.orientation != null) assert.match(g.orientation, /^(landscape|portrait)$/, g.id);
});

test('keyboardInset: a pinch-zoom is not a keyboard', () => {
  assert.equal(keyboardInset({ layoutHeight: 844, vvHeight: 422, vvTop: 0, vvScale: 2 }), 0);
  assert.equal(keyboardInset({ layoutHeight: 844, vvHeight: 508, vvTop: 0, vvScale: 1 }), 336);
  assert.equal(keyboardInset({ layoutHeight: 844, vvHeight: 508, vvTop: 0, vvScale: 1.004 }), 336, 'rounding noise is still scale 1');
  assert.equal(keyboardInset({ layoutHeight: 844, vvHeight: 508, vvTop: 0 }), 336, 'no scale given');
});

test('trackKeyboard ignores a zoomed-in visual viewport', () => {
  const props = new Map(), classes = new Set(), handlers = {};
  const vv = { height: 422, offsetTop: 0, scale: 2, addEventListener: (t, fn) => { handlers[t] = fn; }, removeEventListener: () => {} };
  globalThis.visualViewport = vv;
  globalThis.document = { documentElement: { clientHeight: 844, style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) }, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } } };
  globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    const stop = trackKeyboard();
    handlers.resize();
    assert.equal(classes.has('fp-kb-up'), false);
    vv.scale = 1; vv.height = 500; handlers.resize();
    assert.equal(classes.has('fp-kb-up'), true, 'back at 1x, a real keyboard still counts');
    stop();
  } finally { delete globalThis.visualViewport; delete globalThis.document; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; }
});
