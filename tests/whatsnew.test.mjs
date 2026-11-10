import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
const W = await import('../fp/whatsnew.js');
const NOW = Date.parse('2026-11-10T20:00:00Z');
const list = [
  { id: 'a', date: '2026-11-10' }, { id: 'b', date: '2026-11-10' }, { id: 'c', date: '2026-11-09' }, { id: 'd', date: '2026-11-08' },
  { id: 'e', date: '2026-11-08' }, { id: 'f', date: '2026-11-08' }, { id: 'old', date: '2026-10-01' },
];

test('first visit: the newest few of the last 3 days are new', () => {
  const n = W.newIds(list, null, NOW);
  assert.deepEqual([...n], ['a', 'b', 'c', 'd', 'e']);      // capped at FIRST_VISIT_MAX
  assert.equal(W.FIRST_VISIT_MAX, 5);
  assert.deepEqual([...W.newIds([{ id: 'old', date: '2026-10-01' }], null, NOW)], []);
});

test('after a visit: only lines not seen before are new, whatever their date', () => {
  assert.deepEqual([...W.newIds(list, ['a', 'b', 'c', 'd', 'e', 'f', 'old'], NOW)], []);
  assert.deepEqual([...W.newIds([{ id: 'z', date: '2026-01-01' }, ...list], ['a', 'b', 'c', 'd', 'e', 'f', 'old'], NOW)], ['z']);
  assert.deepEqual([...W.newIds(list, ['a', 7, null], NOW)].includes('a'), false);      // junk in storage is ignored
});

test('seenAfter, markSeen / readSeen round trip, bad input', () => {
  assert.deepEqual(W.seenAfter(list), ['a', 'b', 'c', 'd', 'e', 'f', 'old']);
  assert.deepEqual(W.seenAfter(null), []);
  assert.equal(W.readSeen(), null);
  W.markSeen(list);
  assert.deepEqual(W.readSeen(), W.seenAfter(list));
  assert.deepEqual([...W.newIds(list, W.readSeen(), NOW)], []);
  localStorage.setItem('fp.whatsnew.seen', '{"no":1}');
  assert.equal(W.readSeen(), null);
  assert.deepEqual([...W.newIds([null, { id: 3 }, { date: 'x' }], null, NOW)], []);
});

test('the real list: unique ids, valid dates, newest first, short lines', () => {
  const ids = W.WHATS_NEW.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of W.WHATS_NEW) {
    assert.ok(Number.isFinite(W.dayTime(x.date)), x.id);
    assert.ok(x.title.length <= 40 && x.text.length <= 120, x.id);
  }
  const t = W.WHATS_NEW.map((x) => W.dayTime(x.date));
  assert.deepEqual(t, [...t].sort((a, b) => b - a));
});

test('dayLabel', () => {
  assert.equal(W.dayLabel('2026-11-10', NOW), 'Today');
  assert.equal(W.dayLabel('2026-11-09', NOW), 'Yesterday');
  assert.match(W.dayLabel('2026-11-03', NOW), /Nov\s+3/);
  assert.equal(W.dayLabel('nope', NOW), '');
});
