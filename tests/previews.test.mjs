import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickInView } from '../fp/previews.js';

test('picks the card with the largest visible ratio', () => {
  assert.equal(pickInView([{ id: 'a', ratio: 0.7 }, { id: 'b', ratio: 0.95 }, { id: 'c', ratio: 0.8 }]), 'b');
});
test('needs at least 0.6 visible', () => {
  assert.equal(pickInView([{ id: 'a', ratio: 0.59 }, { id: 'b', ratio: 0.3 }]), null);
  assert.equal(pickInView([{ id: 'a', ratio: 0.6 }]), 'a');
});
test('empty or missing list gives null', () => {
  assert.equal(pickInView([]), null);
  assert.equal(pickInView(undefined), null);
});
test('ties go to the earlier card', () => {
  assert.equal(pickInView([{ id: 'a', ratio: 0.8 }, { id: 'b', ratio: 0.8 }]), 'a');
});
