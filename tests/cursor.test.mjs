// fp/cursor.js: the cursor trail canvas, with a fake document/canvas/matchMedia/window.
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
const T = await import('../fp/theme.js');
const C = await import('../fp/cursor.js');

let fine, reduced, canvases, frames, hidden;
const running = [];
const start = () => { const s = C.startCursor(); running.push(s); return s; };
const wl = {}, dl = {};
const add = (o) => (t, fn) => { (o[t] ||= new Set()).add(fn); };
const rem = (o) => (t, fn) => { o[t]?.delete(fn); };
function setup({ theme = 'neon', fx = true, isFine = true, isReduced = false } = {}) {
  while (running.length) running.pop()();
  fine = isFine; reduced = isReduced; canvases = []; frames = []; hidden = false;
  for (const o of [wl, dl]) for (const k of Object.keys(o)) o[k].clear();
  globalThis.localStorage = fakeStorage();
  T.setTheme(theme); T.setEffects(fx);
  globalThis.matchMedia = (q) => ({ media: q, matches: /reduced-motion/.test(q) ? reduced : /pointer:\s*fine/.test(q) ? fine : false, addEventListener() {}, removeEventListener() {} });
  globalThis.addEventListener = add(wl); globalThis.removeEventListener = rem(wl);
  globalThis.devicePixelRatio = 3; globalThis.innerWidth = 1000; globalThis.innerHeight = 700;
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  globalThis.cancelAnimationFrame = () => { frames = []; };
  const ctx = { calls: 0, setTransform() {}, clearRect() {}, beginPath() { this.calls++; }, arc() {}, fill() {}, stroke() {}, fillRect() {}, save() {}, restore() {}, moveTo() {}, lineTo() {}, createRadialGradient: () => ({ addColorStop() {} }) };
  const docEl = { setAttribute() {} };
  globalThis.document = {
    documentElement: docEl,
    get hidden() { return hidden; },
    addEventListener: add(dl), removeEventListener: rem(dl),
    querySelector: () => null,
    createElement: () => { const c = { style: {}, attrs: {}, ctx, setAttribute(k, v) { c.attrs[k] = v; }, getContext: () => ctx, remove() { c.removed = true; const i = canvases.indexOf(c); if (i >= 0) canvases.splice(i, 1); } }; return c; },
    body: { appendChild(c) { canvases.push(c); } },
  };
}
const move = (x = 10, y = 10, pointerType = 'mouse') => { for (const fn of [...(wl.pointermove || [])]) fn({ clientX: x, clientY: y, pointerType }); };
const frame = (t = 16) => { const f = frames; frames = []; f.forEach((fn) => fn(t)); };

test('canvas starts for fine pointer + effects in neon/aero/space', () => {
  for (const theme of ['neon', 'aero', 'space']) {
    setup({ theme });
    const stop = start();
    assert.equal(canvases.length, 1, theme);
    assert.equal(canvases[0].style.pointerEvents, 'none');
    assert.equal(canvases[0].style.position, 'fixed');
    stop();
  }
});

test('cursor not started on coarse pointer / reduced motion / effects off / minimal', () => {
  for (const o of [{ isFine: false }, { isReduced: true }, { fx: false }, { theme: 'minimal', fx: false }]) {
    setup(o);
    const stop = start();
    assert.equal(canvases.length, 0, JSON.stringify(o));
    assert.equal(wl.pointermove?.size || 0, 0);
    stop();
  }
  setup({ theme: 'minimal', fx: true }); // explicit effects on in minimal still has no trail
  start();
  assert.equal(canvases.length, 0);
});

test('DPR capped at 1.5 and particles capped at 60', () => {
  setup();
  const stop = start();
  assert.ok(canvases[0].width <= 1000 * 1.5 + 1);
  for (let i = 0; i < 200; i++) move(i, i);
  assert.ok(C._debug().count <= 60);
  assert.equal(C.MAX_PARTICLES, 60);
  stop();
});

test('rAF only while particles are alive', () => {
  setup();
  const stop = start();
  assert.equal(frames.length, 0, 'idle: no frame');
  move(); move(20, 20);
  assert.equal(frames.length, 1);
  let n = 0;
  while (frames.length && n++ < 500) frame(n * 16);
  assert.equal(C._debug().count, 0, 'all faded');
  assert.equal(frames.length, 0, 'loop ended');
  stop();
});

test('touch pointer events spawn nothing; hidden pauses', () => {
  setup();
  const stop = start();
  move(5, 5, 'touch');
  assert.equal(C._debug().count, 0);
  hidden = true; for (const fn of [...(dl.visibilitychange || [])]) fn();
  move(40, 40); move(80, 80);
  assert.equal(C._debug().count, 0);
  stop();
});

test('restarts on prefs change', () => {
  setup();
  const stop = start();
  assert.equal(canvases.length, 1);
  T.setTheme('minimal');
  assert.equal(canvases.length, 0, 'minimal removes it');
  T.setTheme('aero'); T.setEffects(true);
  assert.equal(canvases.length, 1, 'back on');
  T.setEffects(false);
  assert.equal(canvases.length, 0);
  stop();
});

test('stop removes the canvas and listeners', () => {
  setup();
  const stop = start();
  move(); 
  stop();
  assert.equal(canvases.length, 0);
  assert.equal(wl.pointermove.size, 0);
  assert.equal(dl.visibilitychange.size, 0);
  // and no further prefs restarts
  T.setTheme('space'); T.setEffects(true);
  assert.equal(canvases.length, 0);
});

test('turning reduced motion on mid-page stops the trail (media query change)', () => {
  setup();
  const changes = new Set();
  globalThis.matchMedia = (q) => ({ media: q, get matches() { return /reduced-motion/.test(q) ? reduced : /pointer:\s*fine/.test(q) ? fine : false; },
    addEventListener: (t, fn) => { if (t === 'change') changes.add(fn); }, removeEventListener: (t, fn) => { changes.delete(fn); } });
  const stop = start();
  assert.equal(canvases.length, 1);
  assert.ok(changes.size >= 1, 'listens for the change');
  reduced = true; for (const fn of [...changes]) fn();
  assert.equal(canvases.length, 0, 'trail removed');
  assert.equal(wl.pointermove?.size || 0, 0);
  reduced = false; for (const fn of [...changes]) fn();
  assert.equal(canvases.length, 1, 'and back when it is off again');
  stop();
  assert.equal(changes.size, 0, 'stop lets go of the listeners');
  assert.equal(canvases.length, 0);
});
