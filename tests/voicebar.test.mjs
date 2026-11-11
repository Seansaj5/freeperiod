import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signalLabel } from '../fp/chat/views/voicebar.js';

const peers = (...states) => new Map(states.map((state, i) => ['u' + i, { state, speaking: false }]));

test('no peers (alone in the channel) is Connected', () => {
  assert.equal(signalLabel(new Map()), 'Connected');
  assert.equal(signalLabel(undefined), 'Connected');
  assert.equal(signalLabel(null), 'Connected');
});

test('every peer connected is Connected', () => {
  assert.equal(signalLabel(peers('connected', 'connected')), 'Connected');
});

test('any peer still connecting is Connecting…', () => {
  assert.equal(signalLabel(peers('connected', 'connecting')), 'Connecting…');
  assert.equal(signalLabel(peers('connecting')), 'Connecting…');
});

test('one unreachable peer: Can’t reach 1 person (wins over connecting)', () => {
  assert.equal(signalLabel(peers('unreachable')), 'Can’t reach 1 person');
  assert.equal(signalLabel(peers('connected', 'unreachable', 'connecting')), 'Can’t reach 1 person');
});

test('several unreachable peers: plural', () => {
  assert.equal(signalLabel(peers('unreachable', 'unreachable')), 'Can’t reach 2 people');
  assert.equal(signalLabel(peers('unreachable', 'connected', 'unreachable', 'unreachable')), 'Can’t reach 3 people');
});

test('takes an array of peer states too', () => {
  assert.equal(signalLabel([{ state: 'connected' }, { state: 'unreachable' }]), 'Can’t reach 1 person');
  assert.equal(signalLabel([]), 'Connected');
});

// mountVoiceBar with a tiny fake DOM: the status line is an aria-live region, so a redraw that changes nothing must not
// write its text again (each write is announced again by screen readers) (M5).
function fakeDocument() {
  const make = (tag) => {
    let text = '';
    const el = {
      tagName: String(tag).toUpperCase(), nodeType: 1, className: '', dataset: {}, attrs: {}, children: [], hidden: false, writes: 0,
      get textContent() { return text; },
      set textContent(v) { el.writes++; text = String(v); },
      classList: { add: (...c) => { el.className = [el.className, ...c].filter(Boolean).join(' '); } },
      setAttribute: (k, v) => { el.attrs[k] = String(v); },
      getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
      addEventListener: () => {},
      append: (...k) => { el.children.push(...k); },
      replaceChildren: (...k) => { el.children = k; },
    };
    return el;
  };
  return { createElement: make, createElementNS: (_ns, tag) => make(tag), createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }) };
}

test('the live region is written only when its words change (M5)', async () => {
  const had = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    const { mountVoiceBar } = await import('../fp/chat/views/voicebar.js');
    const el = document.createElement('div');
    const bar = mountVoiceBar(el, {});
    const line = el.children[0].children[0];
    assert.equal(line.attrs['aria-live'], 'polite');
    const [status, sig] = line.children;
    const where = el.children[0].children[1];
    const st = (peers, status = 'connected') => ({ status, channelId: 7, channelName: 'lounge', peers: new Map(peers.map((s, i) => ['u' + i, { state: s }])) });
    bar.render(st([], 'joining'), null);
    assert.equal(status.textContent, 'Joining voice…');
    bar.render(st(['connecting']), { name: 'lounge' });
    assert.equal(status.textContent, 'Voice Connected');
    assert.equal(sig.textContent, 'Connecting…');
    assert.equal(where.textContent, 'Lounge / Free Period');
    const w = [status.writes, sig.writes, where.writes];
    for (let i = 0; i < 10; i++) bar.render(st(['connecting']), { name: 'lounge' }); // speaking ticks, roster redraws
    assert.deepEqual([status.writes, sig.writes, where.writes], w);
    bar.render(st(['connected']), { name: 'lounge' });
    assert.equal(sig.textContent, '');
    assert.equal(sig.hidden, true);
    assert.deepEqual([status.writes, sig.writes, where.writes], [w[0], w[1] + 1, w[2]]);
    bar.render(st(['unreachable']), { name: 'lounge' });
    assert.equal(sig.textContent, 'Can’t reach 1 person');
    assert.equal(sig.writes, w[1] + 2);
    bar.render(null, null);
    assert.equal(el.hidden, true);
  } finally {
    globalThis.document = had;
  }
});
