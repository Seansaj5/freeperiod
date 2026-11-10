// I3: log in, sign up and suggestions wait up to 75 s (a napping Render server takes about a minute to wake).
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
// A server that never answers: the request ends only when the caller gives up (aborts).
const asleep = (url, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(new Error('aborted'))));

function base(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.location = { search: '', hostname: 'seansaj5.github.io' };
  globalThis.fetch = asleep;
}

let n = 0;
for (const fn of ['login', 'register']) {
  test(`${fn} waits 75 s for a waking server`, async (t) => {
    base(t);
    const session = await import('../fp/session.js?n=' + (++n));
    let out = null;
    session[fn]('someone', 'password1').then(() => { out = 'ok'; }, (e) => { out = e; });
    t.mock.timers.tick(20000);
    await flush();
    assert.equal(out, null, 'still waiting after 20 s');
    t.mock.timers.tick(54999);
    await flush();
    assert.equal(out, null, 'still waiting just before 75 s');
    t.mock.timers.tick(1);
    await flush();
    assert.ok(out && out.waking, 'gives up at 75 s as "waking"');
  });
}

// Just enough DOM for mountSuggest (ui.js h()).
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.kids = []; this.attrs = {}; this.dataset = {}; this.listeners = {};
    this.className = ''; this.textContent = ''; this.value = ''; this.disabled = false;
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  append(...k) { this.kids.push(...k); }
  replaceChildren(...k) { this.kids = k; }
  find(fn) { if (fn(this)) return this; for (const k of this.kids) { const f = k.find && k.find(fn); if (f) return f; } return null; }
}

test('a suggestion waits 75 s for a waking server, showing Sending... meanwhile', async (t) => {
  base(t);
  globalThis.document = { createElement: (tag) => new El(tag), createTextNode: (s) => ({ nodeType: 3, s }) };
  try {
    const { mountSuggest } = await import('../fp/suggest.js?n=' + (++n));
    const root = new El('div');
    mountSuggest(root);
    const form = root.find(e => e.tagName === 'FORM');
    const text = root.find(e => e.tagName === 'TEXTAREA');
    const send = root.find(e => e.tagName === 'BUTTON' && e.attrs.type === 'submit');
    const err = root.find(e => e.tagName === 'P' && e.className === 'fp-err');
    text.value = 'a racing game with boats';
    form.listeners.submit[0]({ preventDefault() {} });
    t.mock.timers.tick(74999);
    await flush();
    assert.equal(send.textContent, 'Sending...');
    assert.equal(err.textContent, '');
    t.mock.timers.tick(1);
    await flush();
    assert.equal(send.textContent, 'Send');
    assert.notEqual(err.textContent, '', 'gave up with a message');
  } finally { delete globalThis.document; }
});
