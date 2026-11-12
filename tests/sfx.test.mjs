// fp/sfx.js: synthesized UI sounds. Fake AudioContext records what would be played; no audio in node.
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
const T = await import('../fp/theme.js');
const S = await import('../fp/sfx.js');

const handlers = {};
globalThis.addEventListener = (t, fn) => { (handlers[t] ||= new Set()).add(fn); };
globalThis.removeEventListener = (t, fn) => { handlers[t]?.delete(fn); };
const gesture = () => { for (const fn of [...(handlers.pointerdown || [])]) fn({}); };

const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
let made, ctxs, clock;
class FakeCtx {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.sampleRate = 8000; ctxs.push(this); this.nodes = made; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  node(kind, extra = {}) { const n = { kind, connect() { return n; }, disconnect() {}, start() { n.started = true; }, stop(t) { n.stopAt = t; }, ...extra }; made.push(n); return n; }
  createOscillator() { return this.node('osc', { type: 'sine', frequency: param(), detune: param() }); }
  createGain() { return this.node('gain', { gain: param() }); }
  createBiquadFilter() { return this.node('filter', { type: 'lowpass', frequency: param(), Q: param() }); }
  createDelay() { return this.node('delay', { delayTime: param() }); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
  createBufferSource() { return this.node('noise', { buffer: null }); }
}
function setup(theme = 'neon') {
  made = []; ctxs = []; clock = 1000;
  for (const k of Object.keys(handlers)) handlers[k].clear();
  globalThis.localStorage = fakeStorage();
  T.setTheme(theme);
  S._inject({ AudioContext: FakeCtx, now: () => clock });
}
const types = () => made.filter((n) => n.kind === 'osc').map((n) => n.type);

test('silent before a gesture', () => {
  setup();
  const stop = S.armSfx();
  S.play('click');
  assert.equal(ctxs.length, 0, 'no AudioContext before a gesture');
  assert.equal(made.length, 0);
  gesture();
  assert.equal(ctxs.length, 1);
  assert.equal(ctxs[0].state, 'running');
  const base = made.length;
  S.play('click');
  assert.ok(made.length > base);
  stop();
});

test('silent when muted', () => {
  setup();
  S.armSfx(); gesture();
  const base = made.length; // the master gain made on unlock
  T.setSounds(false);
  S.play('click'); S.play('toggle'); S.play('whoosh');
  assert.equal(made.length, base);
  T.setSounds(true);
  S.play('click');
  assert.ok(made.length > base);
});

test('no throw without AudioContext', () => {
  setup();
  S._inject({ AudioContext: null, now: () => 0 });
  const stop = S.armSfx();
  gesture();
  assert.doesNotThrow(() => { S.play('hover'); S.play('click'); S.play('nonsense'); });
  stop();
  S._inject({ AudioContext: function () { throw new Error('blocked'); }, now: () => 0 });
  S.armSfx(); gesture();
  assert.doesNotThrow(() => S.play('click'));
});

test('hover rate limit', () => {
  setup();
  S.armSfx(); gesture();
  S.play('hover');
  const n1 = made.length;
  assert.ok(n1 > 0);
  clock += 40; S.play('hover');
  assert.equal(made.length, n1, 'within 80 ms: dropped');
  clock += 50; S.play('hover');
  assert.ok(made.length > n1, 'after 80 ms: plays');
  const n2 = made.length;
  S.play('click'); // other sounds are not rate limited by hover
  assert.ok(made.length > n2);
});

test('master gain is 0.12 and sounds are short', () => {
  setup();
  S.armSfx(); gesture();
  S.play('whoosh');
  const master = made.find((n) => n.kind === 'gain' && n.gain.value === 0.12);
  assert.ok(master, 'a gain node at 0.12');
  assert.equal(S.MASTER_GAIN, 0.12);
  assert.equal(S.HOVER_GAP_MS, 80);
});

test('timbre switches with theme', () => {
  const run = (theme) => { setup(theme); S.armSfx(); gesture(); S.play('click'); return { t: types(), delay: made.some((n) => n.kind === 'delay'), filter: made.some((n) => n.kind === 'filter') }; };
  const neon = run('neon'), aero = run('aero'), space = run('space'), minimal = run('minimal');
  assert.ok(neon.t.includes('square') || neon.t.includes('sawtooth'));
  assert.deepEqual(aero.t.filter((x) => x !== 'sine'), []);
  assert.ok(aero.delay, 'aero has a short echo');
  assert.equal(space.t.length, 2, 'space is a pair');
  assert.ok(space.t.every((x) => x === 'sine'));
  assert.ok(minimal.filter, 'minimal is filtered');
  assert.equal(minimal.t.length, 1);
  assert.notDeepEqual(neon, aero);
});

test('armSfx stop removes listeners; unlock once', () => {
  setup();
  const stop = S.armSfx();
  assert.ok(handlers.pointerdown.size >= 1 && handlers.keydown.size >= 1);
  gesture(); gesture();
  assert.equal(ctxs.length, 1);
  stop();
  assert.equal(handlers.pointerdown.size, 0);
  assert.equal(handlers.keydown.size, 0);
});
