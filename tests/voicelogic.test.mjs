// Pure voice logic (fp/chat/voicelogic.js): offerer rule, the session registry (sessionRow / applySession), the roster from
// presence verified against the registry, newest session, capacity + kicks, peer diff, speaking hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_MAX, ICE_WAIT_MS, SPEAK_HOLD_MS, KICK_MS, VOICE_ERRORS,
  isOfferer, rosterFromPresence, supersededBy, canJoin, peerDiff, speakingStep, sessionRow, applySession, timeMs,
} from '../fp/chat/voicelogic.js';

const T0 = Date.parse('2026-11-10T12:00:00.000Z');
const iso = (dt) => new Date(T0 + dt).toISOString();
const meta = (ch, dt, sess = 's' + dt, extra = {}) => ({ presence_ref: 'r' + sess, ch, mute: false, deaf: false, sess, at: iso(dt), ...extra });
// the registry (voice_sessions rows, as the engine keeps them): [id, ch, dt, sess] -> Map<id, { id, sess, ch, at }>
const regOf = (...rows) => new Map(rows.map(([id, ch, dt, sess]) => [id, { id, sess, ch, at: T0 + dt }]));

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

test('sessionRow reads a voice_sessions row; applySession keeps the newest per person', () => {
  assert.deepEqual(sessionRow({ user_id: 'u1', sess: 'a', channel_id: 7, at: iso(5) }), { id: 'u1', sess: 'a', ch: 7, at: T0 + 5 });
  assert.deepEqual(sessionRow({ user_id: 'u1', sess: 'a', channel_id: '7', at: T0 }), { id: 'u1', sess: 'a', ch: 7, at: T0 }); // bigint as text
  // Postgres sends microseconds: read as the millisecond (some engines refuse more than 3 digits)
  assert.equal(sessionRow({ user_id: 'u1', sess: 'a', channel_id: 7, at: '2026-11-10T12:00:00.123456+00:00' }).at, T0 + 123);
  assert.equal(timeMs('2026-11-10T12:00:00.123999+00:00'), T0 + 123);
  assert.equal(timeMs('2026-11-10T12:00:00+00:00'), T0);
  assert.equal(timeMs(T0 + 5), T0 + 5);
  assert.ok(Number.isNaN(timeMs('soon')) && Number.isNaN(timeMs(null)));
  for (const bad of [null, {}, { user_id: 'u', sess: 'a', channel_id: 0, at: iso(0) }, { user_id: 'u', sess: '', channel_id: 7, at: iso(0) },
    { user_id: 'u', sess: 'a', channel_id: 7, at: 'soon' }, { user_id: 5, sess: 'a', channel_id: 7, at: iso(0) }, { user_id: 'u', sess: 'a', channel_id: 7.5, at: iso(0) }]) {
    assert.equal(sessionRow(bad), null, JSON.stringify(bad));
  }
  const reg = new Map();
  assert.equal(applySession(reg, { type: 'insert', row: { user_id: 'u1', sess: 'a', channel_id: 7, at: iso(10) } }), true);
  assert.equal(applySession(reg, { type: 'insert', row: { user_id: 'u1', sess: 'a', channel_id: 7, at: iso(10) } }), false, 'the same row again');
  assert.equal(applySession(reg, { type: 'update', row: { user_id: 'u1', sess: 'b', channel_id: 9, at: iso(20) } }), true, 'a newer session');
  assert.equal(applySession(reg, { type: 'update', row: { user_id: 'u1', sess: 'a', channel_id: 7, at: iso(10) } }), false, 'a late event of the old one');
  assert.deepEqual(reg.get('u1'), { id: 'u1', sess: 'b', ch: 9, at: T0 + 20 });
  assert.equal(applySession(reg, { type: 'update', row: { user_id: 'u1', sess: 'junk', channel_id: -1, at: iso(30) } }), false);
  assert.equal(applySession(reg, { type: 'delete', row: { user_id: 'u1' } }), true);
  assert.equal(applySession(reg, { type: 'delete', row: { user_id: 'u1' } }), false);
  assert.equal(reg.size, 0);
  for (const junk of [null, {}, { type: 'insert' }, { type: 'delete', row: {} }]) assert.equal(applySession(reg, junk), false);
  assert.equal(applySession(null, { type: 'insert', row: { user_id: 'u1', sess: 'a', channel_id: 7, at: iso(10) } }), false);
});

test('rosterFromPresence: only entries whose key, sess and ch match the registry; registry order and sess', () => {
  const state = {
    u1: [meta(7, 1000, 'old'), meta(9, 5000, 'new')],       // two tabs: the registry says 'new' (channel 9) is the one
    u2: [meta(7, 3000)],
    u3: [meta(7, 2000, 'x', { mute: true, deaf: true })],
    gone: [meta(7, 100, 'g')],                               // in presence, no registry row (left, or never joined)
    stale: [meta(7, 100, 'old-sess')],                       // registry has another session of theirs
    elsewhere: [meta(7, 100, 'e')],                          // registry says another channel
  };
  const reg = regOf(['u1', 9, 5000, 'new'], ['u2', 7, 3000, 's3000'], ['u3', 7, 2000, 'x'], ['stale', 7, 50, 'cur'], ['elsewhere', 8, 100, 'e'],
    ['away', 7, 10, 'z']); // registered but not in presence (closed the tab): not shown
  const r = rosterFromPresence(state, reg);
  assert.ok(r instanceof Map);
  assert.deepEqual([...r.keys()].sort(), [7, 9]);
  assert.deepEqual(r.get(7).map((p) => p.id), ['u3', 'u2']);   // by registry at
  assert.deepEqual(r.get(9), [{ id: 'u1', mute: false, deaf: false, sess: 'new', at: T0 + 5000 }]);
  assert.deepEqual(r.get(7)[0], { id: 'u3', mute: true, deaf: true, sess: 'x', at: T0 + 2000 });
  // ordering comes from the registry, not from a meta's at
  const lie = rosterFromPresence({ a: [meta(3, -99999, 'sa')], b: [meta(3, 99999, 'sb')] }, regOf(['a', 3, 50, 'sa'], ['b', 3, 10, 'sb']));
  assert.deepEqual(lie.get(3).map((p) => [p.id, p.at]), [['b', T0 + 10], ['a', T0 + 50]]);
  // a tie on at sorts by id, so every client agrees on the order
  const tie = rosterFromPresence({ zz: [meta(3, 0, 'a')], aa: [meta(3, 0, 'b')] }, regOf(['zz', 3, 0, 'a'], ['aa', 3, 0, 'b']));
  assert.deepEqual(tie.get(3).map((p) => p.id), ['aa', 'zz']);
  // junk in, empty roster out; no registry at all = nobody
  for (const junk of [null, undefined, {}, { u: null }, { u: [null] }, { u: 'x' }]) assert.equal(rosterFromPresence(junk, regOf(['u', 1, 0, 'q'])).size, 0);
  assert.equal(rosterFromPresence(state).size, 0);
  assert.equal(rosterFromPresence(state, null).size, 0);
});

test('a forged presence key (someone else\'s user id) is not in the roster unless it carries that person\'s registered session', () => {
  // Mallory tracks presence with Sean's id as the key: Sean is not in voice (no registry row) -> nobody shows
  const forged = { sean: [meta(7, 0, 'mallory-made-this')], mallory: [meta(7, 0, 'm1')] };
  const reg = regOf(['mallory', 7, 0, 'm1']);
  assert.deepEqual(rosterFromPresence(forged, reg).get(7).map((p) => p.id), ['mallory']);
  // Sean is in another channel: a meta under his key claiming channel 7 does not move him there
  const reg2 = regOf(['mallory', 7, 0, 'm1'], ['sean', 9, 5, 'real']);
  assert.deepEqual(rosterFromPresence({ ...forged, sean: [meta(7, 0, 'real')] }, reg2).get(7).map((p) => p.id), ['mallory']);
  // capacity counts verified entries only: 20 forged keys in a room of 2 real people leave it open
  const crowd = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['fake' + i, [meta(7, -i, 'f' + i)]]));
  const real = regOf(['p1', 7, 0, 's1'], ['p2', 7, 1, 's2']);
  const r = rosterFromPresence({ ...crowd, p1: [meta(7, 0, 's1')], p2: [meta(7, 1, 's2')] }, real);
  assert.equal(r.get(7).length, 2);
  assert.deepEqual(canJoin({ roster: r, channelId: 7, myId: 'me', kicks: [], now: T0 }), { ok: true });
});

test('supersededBy: only a newer registry row of mine (another tab) replaces me; presence metas never do', () => {
  assert.equal(supersededBy('me', 'mine', T0 + 1000, regOf(['me', 7, 2000, 'other'])), true);   // my id has a newer session
  assert.equal(supersededBy('me', 'mine', T0 + 1000, regOf(['me', 7, 1000, 'mine'])), false);   // the registry has me
  assert.equal(supersededBy('me', 'mine', T0 + 1000, regOf(['me', 7, 500, 'older'])), false);   // an older row (late event)
  assert.equal(supersededBy('me', 'mine', T0 + 1000, regOf(['you', 7, 9000, 'x'])), false);     // other users never supersede me
  assert.equal(supersededBy('me', 'mine', T0 + 1000, new Map()), false);
  assert.equal(supersededBy('me', 'mine', T0 + 1000, null), false);
  // a meta with a far-future at (the old lock-out trick) is not the registry: it changes nothing
  assert.equal(supersededBy('me', 'mine', T0 + 1000, regOf(['me', 7, 1000, 'mine'])), false);
  // the same at on two rows: the bigger sess wins, and only one of the two leaves
  assert.equal(supersededBy('me', 'a', T0, regOf(['me', 7, 0, 'b'])), true);
  assert.equal(supersededBy('me', 'b', T0, regOf(['me', 7, 0, 'a'])), false);
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
