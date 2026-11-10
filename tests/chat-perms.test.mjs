// Chat permissions and form rules (fp/chat/perms.js): what the menus offer, mirrored from the database rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleOfProfile, canPin, canStaffDelete, canReport, memberActions, channelName, checkChannel, checkProfile, profileDiff, groupNameError, timedOut } from '../fp/chat/perms.js';

const owner = { id: 'o', role: 'owner' };
const mod = { id: 'm', role: 'member', is_mod: true };
const bbAdmin = { id: 'a', role: 'mod' };
const member = { id: 'u', role: 'member' };
const other = { id: 'x', role: 'member' };
const msg = (author, extra = {}) => ({ id: 1, channel_id: 3, dm_id: null, author_id: author.id, deleted: false, pinned: false, ...extra });
const soon = new Date(Date.now() + 10 * 60e3).toISOString();
const fields = (errs) => errs.map((e) => e.field).sort();

test('roleOfProfile follows the server-written columns (mod_revoked, banned, is_mod)', () => {
  assert.equal(roleOfProfile(owner), 'owner');
  assert.equal(roleOfProfile({ ...owner, banned: true }), 'owner');
  assert.equal(roleOfProfile(mod), 'mod');
  assert.equal(roleOfProfile(bbAdmin), 'mod');
  assert.equal(roleOfProfile({ ...bbAdmin, mod_revoked: true }), 'member');
  assert.equal(roleOfProfile({ ...mod, banned: true }), 'member');
  assert.equal(roleOfProfile(member), 'member');
  assert.equal(roleOfProfile(null), '');
});

test('pin: staff, channel messages only; mods never unpin the owner\'s posts', () => {
  assert.equal(canPin(owner, msg(other)), true);
  assert.equal(canPin(mod, msg(other)), true);
  assert.equal(canPin(member, msg(other)), false);
  assert.equal(canPin(mod, msg(other, { channel_id: null, dm_id: 'd' })), false);
  assert.equal(canPin(mod, msg(owner), owner), true, 'mods may pin Sean\'s posts');
  assert.equal(canPin(mod, msg(owner, { pinned: true }), owner), false, 'but not unpin them');
  assert.equal(canPin(owner, msg(owner, { pinned: true }), owner), true);
  assert.equal(canPin(owner, msg(other, { deleted: true })), false);
});

test('staff delete: someone else\'s channel message; mods never delete the owner\'s', () => {
  assert.equal(canStaffDelete(mod, msg(other), other), true);
  assert.equal(canStaffDelete(mod, msg(owner), owner), false);
  assert.equal(canStaffDelete(owner, msg(mod), mod), true);
  assert.equal(canStaffDelete(member, msg(other), other), false);
  assert.equal(canStaffDelete(mod, msg(mod), mod), false, 'own messages use the author\'s Delete');
  assert.equal(canStaffDelete(owner, msg(other, { channel_id: null, dm_id: 'd' }), other), false, 'DMs are not staff territory');
});

test('report: anyone, not their own, not deleted / pending', () => {
  assert.equal(canReport(member, msg(other)), true);
  assert.equal(canReport(member, msg(member)), false);
  assert.equal(canReport(member, msg(other, { deleted: true })), false);
  assert.equal(canReport(member, msg(other, { pending: true })), false);
  assert.equal(canReport(null, msg(other)), false);
  assert.equal(canReport(member, msg(other, { channel_id: null, dm_id: 'd' })), true, 'DM messages too');
});

test('member menu: mods time out members, never mods, the owner, themselves or an owner time-out', () => {
  assert.deepEqual(memberActions(owner, other), { timeout: true, clear: false, ban: true, mod: true });
  assert.deepEqual(memberActions(mod, other), { timeout: true, clear: false, ban: false, mod: false });
  assert.deepEqual(memberActions(mod, { ...other, muted_until: soon, muted_by: 'mod' }), { timeout: true, clear: true, ban: false, mod: false });
  assert.deepEqual(memberActions(mod, { ...other, muted_until: soon, muted_by: 'owner' }), { timeout: false, clear: false, ban: false, mod: false });
  assert.deepEqual(memberActions(owner, { ...other, muted_until: soon, muted_by: 'owner' }), { timeout: true, clear: true, ban: true, mod: true });
  assert.equal(memberActions(mod, bbAdmin).timeout, false);
  assert.equal(memberActions(owner, bbAdmin).timeout, true);
  assert.deepEqual(memberActions(mod, owner), { timeout: false, clear: false, ban: false, mod: false });
  assert.deepEqual(memberActions(owner, owner), { timeout: false, clear: false, ban: false, mod: false });
  assert.deepEqual(memberActions(member, other), { timeout: false, clear: false, ban: false, mod: false });
  assert.equal(timedOut({ muted_until: new Date(Date.now() - 1000).toISOString() }), false);
});

test('channel names: typed text becomes a valid name; the form checks emoji, topic and duplicates', () => {
  assert.equal(channelName('Rocket League Clips!'), 'rocket-league-clips');
  assert.equal(channelName('a'.repeat(40)).length, 24);
  assert.deepEqual(checkChannel({ name: 'clips', emoji: '🎬', topic: 'ok' }), []);
  assert.deepEqual(fields(checkChannel({ name: 'Clips', emoji: '', topic: 'x'.repeat(121) })), ['emoji', 'name', 'topic']);
  assert.deepEqual(fields(checkChannel({ name: 'general', emoji: '💬', topic: '' }, ['general'])), ['name']);
});

test('profile checks mirror the database limits', () => {
  assert.deepEqual(checkProfile({ display_name: 'x'.repeat(32), pronouns: 'x'.repeat(40), about: 'x'.repeat(300), status_text: 'x'.repeat(80), status_emoji: '🛠️' }), []);
  assert.deepEqual(fields(checkProfile({ display_name: 'x'.repeat(33), pronouns: 'x'.repeat(41), about: 'x'.repeat(301), status_text: 'x'.repeat(81), status_emoji: 'lol' })),
    ['about', 'display_name', 'pronouns', 'status_emoji', 'status_text']);
  assert.deepEqual(fields(checkProfile({ display_name: 'Sean​' })), ['display_name'], 'zero-width lookalikes');
  assert.deepEqual(fields(checkProfile({ display_name: 'Se‮an' })), ['display_name'], 'bidi overrides');
  assert.deepEqual(fields(checkProfile({ banner_color: '#ABCDEF', name_color: 'red', frame: 'nope' })), ['banner_color', 'frame', 'name_color']);
  assert.deepEqual(checkProfile({ display_name: null, about: null }), []);
});

test('profileDiff sends only what changed, empty text as null, and keeps fill / glow valid', () => {
  const orig = { display_name: 'Jay', about: null, name_fill: 'solid', name_glow: false, frame: null };
  assert.deepEqual(profileDiff(orig, { display_name: 'Jay', about: '', frame: 'crown', name_glow: true, username: 'hax' }), { frame: 'crown', name_glow: true });
  assert.deepEqual(profileDiff(orig, { display_name: '' }), { display_name: null });
  assert.deepEqual(profileDiff(orig, { ...orig }), {});
});

test('group names: optional, up to 40, no hidden characters', () => {
  assert.equal(groupNameError(''), '');
  assert.equal(groupNameError('ranked squad'), '');
  assert.ok(groupNameError('x'.repeat(41)));
  assert.ok(groupNameError('squad⁦'));
});
