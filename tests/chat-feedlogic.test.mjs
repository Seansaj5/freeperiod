import test from 'node:test';
import assert from 'node:assert/strict';
import { CAP, newClientId, matchTemp, splitPending, capWindow } from '../fp/chat/feedlogic.js';

test('client ids are uuids and unique, with or without crypto.randomUUID', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const a = newClientId(), b = newClientId();
  assert.match(a, re); assert.notEqual(a, b);
  assert.equal(newClientId({ randomUUID: () => 'fixed' }), 'fixed');
  assert.match(newClientId({}), re);
  assert.match(newClientId(null), re);
});
test('a row matches its temp by client id only, never by text', () => {
  const t1 = { tempId: 't1', client_id: 'c1', body: 'same' }, t2 = { tempId: 't2', client_id: 'c2', body: 'same' };
  assert.equal(matchTemp([t1, t2], { client_id: 'c2', body: 'same' }), t2);
  assert.equal(matchTemp([t1, t2], { client_id: 'c3', body: 'same' }), null);
  assert.equal(matchTemp([t1, t2], { body: 'same' }), null);
  assert.equal(matchTemp([{ tempId: 'x', body: '' }], { client_id: null, body: '' }), null);
  assert.equal(matchTemp([{ ...t1, failed: true }], { client_id: 'c1' }).tempId, 't1'); // a failed send that was accepted after all
});
test('only the same account keeps its unsent messages', () => {
  const temps = [{ tempId: 'a', author_id: 'u1' }, { tempId: 'b', author_id: 'u2' }];
  assert.deepEqual(splitPending(temps, 'u1'), { keep: [temps[0]], drop: [temps[1]] });
  assert.deepEqual(splitPending(temps, ''), { keep: [], drop: temps });
});
test('cap trims the oldest end, or the newest end while reading history', () => {
  const msgs = Array.from({ length: 520 }, (_, i) => ({ id: i }));
  let r = capWindow(msgs, CAP, false);
  assert.equal(CAP, 500);
  assert.equal(r.keep.length, 500); assert.equal(r.keep[0].id, 20); assert.equal(r.dropped.length, 20); assert.equal(r.dropped[0].id, 0);
  r = capWindow(msgs, CAP, true);
  assert.equal(r.keep.length, 500); assert.equal(r.keep[499].id, 499); assert.deepEqual(r.dropped.map((m) => m.id), Array.from({ length: 20 }, (_, i) => 500 + i));
  r = capWindow(msgs.slice(0, 500), CAP, true);
  assert.equal(r.dropped.length, 0); assert.equal(r.keep.length, 500);
});
test('cap never trims the row being edited', () => {
  const msgs = Array.from({ length: 520 }, (_, i) => ({ id: i }));
  let r = capWindow(msgs, CAP, false, 3);
  assert.equal(r.keep.length, 500); assert.equal(r.dropped.length, 20);
  assert.ok(r.keep.some((m) => m.id === 3)); assert.ok(!r.dropped.some((m) => m.id === 3));
  assert.deepEqual(r.keep.map((m) => m.id).slice(0, 3), [3, 21, 22]); // still in order
  r = capWindow(msgs, CAP, true, 510);
  assert.ok(r.keep.some((m) => m.id === 510)); assert.equal(r.keep.length, 500); assert.equal(r.keep[r.keep.length - 1].id, 510);
});
