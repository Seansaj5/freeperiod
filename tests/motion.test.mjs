// fp/motion.js: scroll reveal ([data-reveal] -> .revealed) and the hero's pointer parallax (--px/--py), with fake
// IntersectionObserver, MutationObserver, matchMedia and requestAnimationFrame (node has none of them).
import test from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../fp/motion.js');

// ---------- fakes ----------
let reduce = false, fine = true;
globalThis.matchMedia = (q) => ({
  media: q,
  matches: /reduced-motion:\s*reduce/.test(q) ? reduce : /pointer:\s*fine/.test(q) ? fine : false,
  addEventListener() {}, removeEventListener() {},
});
let ios = [];
class FakeIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = new Set(); this.unobserved = []; ios.push(this); }
  observe(el) { this.observed.add(el); }
  unobserve(el) { this.observed.delete(el); this.unobserved.push(el); }
  disconnect() { this.observed.clear(); }
  fire(entries) { this.cb(entries.map(([target, isIntersecting]) => ({ target, isIntersecting })), this); }
}
globalThis.IntersectionObserver = FakeIO;
let frames = [];
globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
const flush = (max = 500) => { let n = 0; while (frames.length && n++ < max) { const f = frames; frames = []; for (const fn of f) fn(16 * n); } return n; };
globalThis.innerHeight = 800;
globalThis.innerWidth = 1200;

function classes() {
  const s = new Set();
  let adds = 0;
  return { add: (...c) => { adds++; c.forEach((x) => s.add(x)); }, remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)), get adds() { return adds; }, has: (c) => s.has(c) };
}
function style() {
  const props = {};
  return { setProperty: (k, v) => { props[k] = String(v); }, removeProperty: (k) => { delete props[k]; }, getPropertyValue: (k) => props[k] || '', props };
}
function fakeEl(rect, parent) {
  return { nodeType: 1, classList: classes(), style: style(), parentNode: parent || null, getBoundingClientRect: () => rect, matches: (s) => s === '[data-reveal]', querySelectorAll: () => [] };
}
function fakeDoc(els) {
  const html = { classList: classes() };
  return { documentElement: html, querySelectorAll: (s) => (s === '[data-reveal]' ? els.slice() : []) };
}
const below = { top: 2000, bottom: 2200, left: 0, right: 300, width: 300, height: 200 };
const inView = { top: 100, bottom: 300, left: 0, right: 300, width: 300, height: 200 };

test('reveal adds .revealed once and unobserves', () => {
  reduce = false; ios = [];
  const grid = {};
  const a = fakeEl(below, grid), b = fakeEl(below, grid), c = fakeEl(below, {}), top = fakeEl(inView, {});
  const doc = fakeDoc([a, b, c, top]);
  const stop = M.startReveal(doc);
  assert.equal(ios.length, 1, 'one IntersectionObserver');
  const io = ios[0];
  // in view when it arms: shown at once, never hidden, never animated
  assert.ok(top.classList.has('revealed'));
  assert.ok(!top.classList.has('reveal-in'));
  assert.ok(!io.observed.has(top));
  assert.ok(doc.documentElement.classList.has('reveal-ready'), 'armed only after the in-view check');
  assert.ok(io.observed.has(a) && io.observed.has(b) && io.observed.has(c));
  assert.ok(!a.classList.has('revealed'));
  // the first report is "not in view": nothing happens
  io.fire([[a, false], [b, false], [c, false]]);
  assert.ok(!a.classList.has('revealed') && !b.classList.has('revealed'));
  // a and b scroll in together (same grid: staggered 0, 1), c with them (its own parent: 0)
  io.fire([[a, true], [b, true], [c, true]]);
  for (const el of [a, b, c]) {
    assert.ok(el.classList.has('revealed'));
    assert.ok(el.classList.has('reveal-in'));
    assert.ok(!io.observed.has(el), 'unobserved');
    assert.ok(io.unobserved.includes(el));
  }
  assert.equal(a.style.props['--i'], '0');
  assert.equal(b.style.props['--i'], '1');
  assert.equal(c.style.props['--i'], '0');
  // once: a later report changes nothing
  const before = a.classList.adds;
  io.fire([[a, true]]);
  io.fire([[a, false]]);
  assert.equal(a.classList.adds, before);
  assert.ok(a.classList.has('revealed'));
  // stop() shows whatever is still waiting and disarms
  const d = fakeEl(below, grid);
  const doc2 = fakeDoc([d]);
  const stop2 = M.startReveal(doc2);
  assert.ok(!d.classList.has('revealed'));
  stop2();
  assert.ok(d.classList.has('revealed'));
  stop();
});

test('reduced motion reveals everything at once', () => {
  reduce = true; ios = [];
  const els = [fakeEl(below, {}), fakeEl(below, {}), fakeEl(inView, {})];
  const doc = fakeDoc(els);
  const stop = M.startReveal(doc);
  assert.equal(typeof stop, 'function');
  assert.equal(ios.length, 0, 'no observer at all');
  for (const el of els) { assert.ok(el.classList.has('revealed')); assert.ok(!el.classList.has('reveal-in')); }
  assert.ok(!doc.documentElement.classList.has('reveal-ready'), 'never armed: nothing can be hidden');
  stop();
  reduce = false;
});

test('reveal without IntersectionObserver shows everything and never arms', () => {
  reduce = false; ios = [];
  const saved = globalThis.IntersectionObserver;
  delete globalThis.IntersectionObserver;
  try {
    const els = [fakeEl(below, {})];
    const doc = fakeDoc(els);
    M.startReveal(doc)();
    assert.ok(els[0].classList.has('revealed'));
    assert.ok(!doc.documentElement.classList.has('reveal-ready'));
  } finally { globalThis.IntersectionObserver = saved; }
});

function hero() {
  const handlers = {};
  const el = {
    style: style(),
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250 }),
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    removeEventListener: (t, fn) => { handlers[t] = (handlers[t] || []).filter((f) => f !== fn); },
  };
  const fire = (t, e) => (handlers[t] || []).forEach((fn) => fn(e));
  return { el, handlers, fire };
}

test('parallax clamps to -1..1 and is a no-op on reduced motion', () => {
  reduce = false; fine = true; frames = [];
  const { el, fire, handlers } = hero();
  const stop = M.startParallax(el);
  // far outside the hero, right and above: eases to exactly 1 / -1, never beyond
  fire('pointermove', { pointerType: 'mouse', clientX: 9000, clientY: -9000 });
  let seen = [];
  for (let i = 0; i < 400 && frames.length; i++) {
    flush(1);
    seen.push([Number(el.style.props['--px']), Number(el.style.props['--py'])]);
  }
  assert.ok(seen.length > 1, 'eases over several frames');
  for (const [x, y] of seen) { assert.ok(x >= -1 && x <= 1, 'x ' + x); assert.ok(y >= -1 && y <= 1, 'y ' + y); }
  assert.equal(el.style.props['--px'], '1');
  assert.equal(el.style.props['--py'], '-1');
  assert.equal(frames.length, 0, 'stops asking for frames once settled');
  // the middle of the hero is 0, a quarter in is -0.5
  fire('pointermove', { pointerType: 'mouse', clientX: 200, clientY: 150 });
  flush();
  assert.equal(el.style.props['--px'], '-0.5');
  assert.equal(el.style.props['--py'], '0');
  // touch and pen never move it; leaving eases home
  fire('pointermove', { pointerType: 'touch', clientX: 500, clientY: 250 });
  flush();
  assert.equal(el.style.props['--px'], '-0.5');
  fire('pointerleave', { pointerType: 'mouse' });
  flush();
  assert.equal(el.style.props['--px'], '0');
  assert.equal(el.style.props['--py'], '0');
  stop();
  assert.equal(el.style.props['--px'], undefined, 'stop clears the vars');
  assert.equal((handlers.pointermove || []).length, 0, 'stop removes the listeners');

  // reduced motion: nothing listens, nothing is written
  reduce = true;
  const r = hero();
  const stopR = M.startParallax(r.el);
  assert.equal(typeof stopR, 'function');
  r.fire('pointermove', { pointerType: 'mouse', clientX: 9000, clientY: 9000 });
  flush();
  assert.equal(r.el.style.props['--px'], undefined);
  assert.equal((r.handlers.pointermove || []).length, 0);
  stopR();
  reduce = false;

  // a touch-only device (no fine pointer): nothing either
  fine = false;
  const t = hero();
  M.startParallax(t.el);
  t.fire('pointermove', { pointerType: 'mouse', clientX: 9000, clientY: 9000 });
  flush();
  assert.equal(t.el.style.props['--px'], undefined);
  fine = true;
});

test('poster morph: one name at a time, only where view transitions exist', () => {
  const mk = () => ({ style: style(), dataset: {} });
  const a = mk(), b = mk();
  const all = [a, b];
  const doc = { querySelectorAll: (s) => (s === '[data-vt-poster]' ? all.filter((x) => x.dataset.vtPoster) : []) };
  globalThis.CSS = { supports: () => true };
  M.markMorph(a, doc);
  assert.equal(a.style.props['view-transition-name'], 'fp-poster');
  M.markMorph(b, doc);
  assert.equal(a.style.props['view-transition-name'], undefined, 'the old one is cleared first');
  assert.equal(b.style.props['view-transition-name'], 'fp-poster');
  M.clearMorph(doc);
  assert.equal(b.style.props['view-transition-name'], undefined);
  globalThis.CSS = { supports: () => false };
  M.markMorph(a, doc);
  assert.equal(a.style.props['view-transition-name'], undefined, 'no support: nothing set');
  delete globalThis.CSS;
  assert.doesNotThrow(() => M.markMorph(a, doc));
  assert.doesNotThrow(() => M.markMorph(null, doc));
});
