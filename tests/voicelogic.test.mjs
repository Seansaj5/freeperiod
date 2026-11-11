// Pure voice logic (fp/chat/voicelogic.js): offerer rule, roster from presence, newest session, capacity + kicks,
// peer diff, speaking hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_MAX, ICE_WAIT_MS, SPEAK_HOLD_MS, KICK_MS, VOICE_ERRORS,
  isOfferer, rosterFromPresence, supersededBy, canJoin, peerDiff, speakingStep,
} from '../fp/chat/voicelogic.js';

const T0 = Date.parse('2026-11-10T12:00:00.000Z');
const iso = (dt) => new Date(T0 + dt).toISOString();
const meta = (ch, dt, sess = 's' + dt, extra = {}) => ({ presence_ref: 'r' + sess, ch, mute: false, deaf: false, sess, at: iso(dt), ...extra });

test('constants and error words', () => {
  assert.equal(VOICE_MAX, 8);
  assert.equal(ICE_WAIT_MS, 2000);
  assert.equal(SPEAK_HOLD_MS, 250);
  assert.equal(KICK_MS, 60000);
  assert.deepEqual(VOICE_ERRORS, {
    mic: 'Allow the microphone to join voice', nomic: 'No microphone found', full: '{name} is full (8 people)',
    kicked: 'A mod disconnected you from voice', blocked: 'You can’t join voice while timed out or banned',
    lost: 'Voice connection lost', moved: 'You joined voice in another tab', gone: 'That voice channel was deleted',
  });
});

test('isOfferer', () => {
  assert.equal(isOfferer('aaa', 'bbb'), true);
  assert.equal(isOfferer('bbb', 'aaa'), false);
  assert.equal(isOfferer('aaa', 'aaa'), false);
  // exactly one side of every pair offers
  const ids = ['3f1c', '0b2a', 'ff00', '9d9d'];
  for (const a of ids) for (const b of ids) if (a !== b) assert.equal(isOfferer(a, b) !== isOfferer(b, a), true, a + ' ' + b);
});

test('rosterFromPresence keeps the newest session', () => {
  const state = {
    u1: [meta(7, 1000, 'old'), meta(9, 5000, 'new')],       // two tabs: the newer one (channel 9) counts
    u2: [meta(7, 3000)],
    u3: [meta(7, 2000, 'x', { mute: true, deaf: true })],
    bad1: [meta('7', 100)],                                   // a string ch is not a channel id
    bad2: [meta(7.5, 100)],
    bad3: [{ presence_ref: 'z', at: iso(100) }],              // no ch at all
    bad4: [meta(-1, 100)],
    mixed: [meta(null, 9000), meta(7, 4000, 'ok')],           // the meta with a bad ch is dropped, the good one kept
  };
  const r = rosterFromPresence(state);
  assert.ok(r instanceof Map);
  assert.deepEqual([...r.keys()].sort(), [7, 9]);
  // sorted by at (first joined first)
  assert.deepEqual(r.get(7).map((p) => p.id), ['u3', 'u2', 'mixed']);
  assert.deepEqual(r.get(9), [{ id: 'u1', mute: false, deaf: false, sess: 'new', at: iso(5000) }]);
  assert.deepEqual(r.get(7)[0], { id: 'u3', mute: true, deaf: true, sess: 'x', at: iso(2000) });
  assert.equal(r.get(7)[2].sess, 'ok');
  // a tie on at sorts by id, so every client agrees on the order
  const tie = rosterFromPresence({ zz: [meta(3, 0, 'a')], aa: [meta(3, 0, 'b')] });
  assert.deepEqual(tie.get(3).map((p) => p.id), ['aa', 'zz']);
  // junk in, empty roster out
  for (const junk of [null, undefined, {}, { u: null }, { u: [null] }, { u: 'x' }]) assert.equal(rosterFromPresence(junk).size, 0);
  // an unreadable at is not a session
  assert.equal(rosterFromPresence({ u: [{ ch: 1, sess: 'q', at: 'soon' }] }).size, 0);
});

test('supersededBy', () => {
  const state = { me: [meta(7, 1000, 'mine'), meta(7, 2000, 'other')], you: [meta(7, 9000)] };
  assert.equal(supersededBy('me', 'mine', iso(1000), state), true);       // my id has a newer session
  assert.equal(supersededBy('me', 'other', iso(2000), state), false);     // I am the newest
  assert.equal(supersededBy('you', 's9000', iso(9000), state), false);    // other users never supersede me
  assert.equal(supersededBy('me', 'mine', iso(1000), { me: [meta(7, 1000, 'mine')] }), false); // only me
  assert.equal(supersededBy('me', 'mine', iso(1000), {}), false);
  assert.equal(supersededBy('me', 'mine', iso(1000), null), false);
  // the same at on two tabs: the bigger sess wins, and only one of the two leaves
  const tie = { me: [meta(7, 0, 'a'), meta(7, 0, 'b')] };
  assert.equal(supersededBy('me', 'a', iso(0), tie), true);
  assert.equal(supersededBy('me', 'b', iso(0), tie), false);
});

test('canJoin full at 8 (me not counted twice) and kicked within 60 s', () => {
  const people = (n, ch = 7) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, mute: false, deaf: false, sess: 's' + i, at: iso(i) }));
  const now = T0;
  assert.deepEqual(canJoin({ roster: new Map(), channelId: 7, myId: 'me', kicks: [], now }), { ok: true });
  assert.deepEqual(canJoin({ roster: new Map([[7, people(7)]]), channelId: 7, myId: 'me', kicks: [], now }), { ok: true });
  assert.deepEqual(canJoin({ roster: new Map([[7, people(8)]]), channelId: 7, myId: 'me', kicks: [], now }), { ok: false, reason: 'full' });
  // me already there (another tab): 7 others + me is not full
  const withMe = [...people(7), { id: 'me', mute: false, deaf: false, sess: 'tab', at: iso(50) }];
  assert.deepEqual(canJoin({ roster: new Map([[7, withMe]]), channelId: 7, myId: 'me', kicks: [], now }), { ok: true });
  // a full other channel does not matter
  assert.deepEqual(canJoin({ roster: new Map([[8, people(8)]]), channelId: 7, myId: 'me', kicks: [], now }), { ok: true });
  // kicked: until is an ISO string (from the database) or ms (the engine's own clock)
  const kicks = [{ target: 'me', channel_id: 7, until: new Date(now + KICK_MS).toISOString() }];
  assert.deepEqual(canJoin({ roster: new Map(), channelId: 7, myId: 'me', kicks, now }), { ok: false, reason: 'kicked' });
  assert.deepEqual(canJoin({ roster: new Map(), channelId: 7, myId: 'me', kicks, now: now + KICK_MS - 1 }), { ok: false, reason: 'kicked' });
  assert.deepEqual(canJoin({ roster: new Map(), channelId: 7, myId: 'me', kicks, now: now + KICK_MS }), { ok: true });
  assert.deepEqual(canJoin({ roster: new Map(), channelId: 7, myId: 'me', kicks: [{ target: 'me', channel_id: 7, until: now + 5 }], now }), { ok: false, reason: 'kicked' });
  // a kick for another channel or another person does not refuse me
  assert.deepEqual(canJoin({ roster: new Map(), channelId: 8, myId: 'me', kicks, now }), { ok: true });
  assert.deepEqual(canJoin({ roster: new Map(), channelId: 7, myId: 'you', kicks, now }), { ok: true });
  // kicked wins over full (the more specific reason)
  assert.deepEqual(canJoin({ roster: new Map([[7, people(8)]]), channelId: 7, myId: 'me', kicks, now }), { ok: false, reason: 'kicked' });
});

test('peerDiff', () => {
  assert.deepEqual(peerDiff(new Set(), new Set(['a', 'b'])), { add: ['a', 'b'], drop: [] });
  assert.deepEqual(peerDiff(new Set(['a', 'b']), new Set(['b', 'c'])), { add: ['c'], drop: ['a'] });
  assert.deepEqual(peerDiff(new Set(['a']), new Set()), { add: [], drop: ['a'] });
  assert.deepEqual(peerDiff(new Set(['a']), new Set(['a'])), { add: [], drop: [] });
});

test('speakingStep holds 250 ms after the last loud frame', () => {
  let s = { speaking: false, lastLoud: -Infinity };
  s = speakingStep(s, 0.01, 1000);
  assert.equal(s.speaking, false);
  s = speakingStep(s, 0.2, 1000);
  assert.deepEqual(s, { speaking: true, lastLoud: 1000 });
  s = speakingStep(s, 0, 1100);
  assert.deepEqual(s, { speaking: true, lastLoud: 1000 });
  s = speakingStep(s, 0, 1249);
  assert.equal(s.speaking, true);
  s = speakingStep(s, 0, 1250);
  assert.equal(s.speaking, false);
  assert.equal(s.lastLoud, 1000);
  // the threshold is 0.04 by default and can be changed
  assert.equal(speakingStep({ speaking: false, lastLoud: -Infinity }, 0.04, 0).speaking, true);
  assert.equal(speakingStep({ speaking: false, lastLoud: -Infinity }, 0.039, 0).speaking, false);
  assert.equal(speakingStep({ speaking: false, lastLoud: -Infinity }, 0.05, 0, 0.1).speaking, false);
  // no previous step at all
  assert.equal(speakingStep(undefined, 0, 0).speaking, false);
});
