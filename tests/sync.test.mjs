import test from 'node:test';
import assert from 'node:assert/strict';
import { hashString, decideSync, mergeMeta, cleanMeta } from '../fp/sync.js';

const h = hashString;
test('hashString', () => {
  assert.equal(hashString(null), '');
  assert.equal(hashString('a'), 'e40c292c');
  assert.notEqual(h('x'), h('y'));
});
test('pull when local null and cloud present', () => {
  assert.equal(decideSync({ localRaw: null, cloud: { data: 'c', at: 5 }, record: null }), 'pull');
});
test('pull when local unchanged and cloud newer', () => {
  assert.equal(decideSync({ localRaw: 'L', cloud: { data: 'C', at: 9 }, record: { hash: h('L'), at: 5 } }), 'pull');
});
test('push when local changed even if cloud newer', () => {
  assert.equal(decideSync({ localRaw: 'L2', cloud: { data: 'C', at: 9 }, record: { hash: h('L'), at: 5 } }), 'push');
});
test('none when both match', () => {
  assert.equal(decideSync({ localRaw: 'L', cloud: { data: 'L', at: 5 }, record: { hash: h('L'), at: 5 } }), 'none');
  assert.equal(decideSync({ localRaw: 'L', cloud: { data: 'C', at: 5 }, record: { hash: h('L'), at: 5 } }), 'none');
});
test('first sync: cloud save wins over fresh local', () => {
  assert.equal(decideSync({ localRaw: 'L', cloud: { data: 'C', at: 5 }, record: null }), 'pull');
  assert.equal(decideSync({ localRaw: 'L', cloud: { data: 'L', at: 5 }, record: null }), 'none');
});
test('push when no record and no cloud', () => {
  assert.equal(decideSync({ localRaw: 'L', cloud: null, record: null }), 'push');
});
test('none when nothing anywhere', () => {
  assert.equal(decideSync({ localRaw: null, cloud: null, record: null }), 'none');
});
test('mergeMeta keeps max play and newer favs', () => {
  const m = mergeMeta(
    { favs: ['aa'], recent: { aa: 10 }, play: { aa: 100 }, at: 1 },
    { favs: ['bb'], recent: { aa: 5, bb: 7 }, play: { aa: 50, bb: 9 }, at: 2 });
  assert.deepEqual(m.favs, ['bb']);
  assert.deepEqual(m.play, { aa: 100, bb: 9 });
  assert.deepEqual(m.recent, { aa: 10, bb: 7 });
  assert.equal(m.at, 2);
});
test('cleanMeta drops bad ids and clamps', () => {
  const m = cleanMeta({ favs: ['../x', 'ok-id'], recent: { '../x': 1, ok: 2 }, play: { ok: 1e12, 'BAD': 3 } });
  assert.deepEqual(m.favs, ['ok-id']);
  assert.deepEqual(m.recent, { ok: 2 });
  assert.deepEqual(m.play, { ok: 1e7 });
  assert.equal(cleanMeta(null).at, 0);
});
