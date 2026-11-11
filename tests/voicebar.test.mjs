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
