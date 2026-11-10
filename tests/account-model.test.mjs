import test from 'node:test';
import assert from 'node:assert/strict';
import { statusPatch, unreadDMs, countLabel, chipModel, STATUS_PRESETS, STATUS_EMOJI, STATUS_TEXT_MAX } from '../fp/account-model.js';

test('statusPatch: presets, custom, clear, and the database rules', () => {
  for (const s of STATUS_PRESETS) assert.equal(statusPatch(s.emoji, s.text).ok, true, s.text);
  for (const e of STATUS_EMOJI) assert.equal(statusPatch(e, 'x').ok, true, e);
  assert.deepEqual(statusPatch('🎮', '  in  a   match ').patch, { status_emoji: '🎮', status_text: 'in a match' });
  assert.deepEqual(statusPatch('', '').patch, { status_emoji: null, status_text: null });      // clear
  assert.deepEqual(statusPatch(null, undefined).patch, { status_emoji: null, status_text: null });
  assert.deepEqual(statusPatch('', 'just text').patch, { status_emoji: null, status_text: 'just text' });
  assert.equal(statusPatch('A', 'x').ok, false);                  // letters are not an emoji
  assert.equal(statusPatch('🎮 🎮', 'x').ok, false);              // no spaces
  assert.equal(statusPatch('🎮'.repeat(9), 'x').ok, false);       // over 16 characters
  assert.equal(statusPatch('', 'x'.repeat(STATUS_TEXT_MAX)).ok, true);
  assert.equal(statusPatch('', 'x'.repeat(STATUS_TEXT_MAX + 1)).ok, false);
  assert.equal(statusPatch('', 'a\u0007b').ok, false);            // control characters
});

test('unreadDMs counts only DMs; countLabel', () => {
  assert.equal(unreadDMs([{ target: 'c:1', unread: 5 }, { target: 'd:abc', unread: 2 }, { target: 'd:def', unread: 1 }, { target: 'd:x', unread: -3 }, null]), 3);
  assert.equal(unreadDMs(null), 0);
  assert.equal(countLabel(0), '');
  assert.equal(countLabel(3), '3');
  assert.equal(countLabel(12), '9+');
});

test('chipModel: guest, plain, and the chat look only for my own profile', () => {
  assert.deepEqual(chipModel(null, null), { kind: 'guest' });
  assert.deepEqual(chipModel({ username: 'Sean_0', role: 'owner' }, null, 4), { kind: 'plain', username: 'Sean_0', name: 'Sean_0', role: 'owner', streak: 4 });
  assert.equal(chipModel({ username: 'amy', role: 'player' }, null).role, '');
  const mine = chipModel({ username: 'Sean_0', role: 'owner' }, { username: 'sean_0', display_name: ' Saj ' }, 2);
  assert.deepEqual(mine, { kind: 'chat', username: 'Sean_0', name: 'Saj', role: 'owner', streak: 2 });
  assert.equal(chipModel({ username: 'Sean_0' }, { username: 'sean_0', display_name: '   ' }).name, 'Sean_0');
  assert.equal(chipModel({ username: 'Sean_0' }, { username: 'amy', display_name: 'Amy' }).kind, 'plain');   // someone else's leftover
});
