import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupSidebar, readCollapsed, writeCollapsed, voiceLabel, memberSections } from '../fp/chat/sidebarlogic.js';

const ch = (id, category_id, position, kind) => ({ id, category_id, position, kind, name: 'c' + id });
const cat = (id, position) => ({ id, position, name: 'k' + id });
const base = { collapsed: new Set(), current: null, roster: new Map(), guest: false, showEmpty: false };
const ids = (g) => g.map((x) => [x.category ? x.category.id : null, x.channels.map((c) => c.id)]);

test('uncategorized channels come first with category null', () => {
  const g = groupSidebar({ ...base, categories: [cat(1, 0)], channels: [ch(1, 1, 0), ch(2, null, 5)] });
  assert.deepEqual(ids(g), [[null, [2]], [1, [1]]]);
  assert.equal(g[0].category, null);
  assert.equal(g[0].collapsed, false);
});

test('categories by position then id; channels by position then id', () => {
  const g = groupSidebar({ ...base, categories: [cat(3, 1), cat(2, 1), cat(1, 0)], channels: [ch(9, 2, 1), ch(8, 2, 1), ch(7, 2, 0)] });
  const g2 = groupSidebar({ ...base, showEmpty: true, categories: [cat(3, 1), cat(2, 1), cat(1, 0)], channels: [ch(9, 2, 1), ch(8, 2, 1), ch(7, 2, 0)] });
  assert.deepEqual(g2.map((x) => x.category.id), [1, 2, 3]);
  assert.deepEqual(g2[1].channels.map((c) => c.id), [7, 8, 9]);
});

test('collapsed category keeps only the current channel and voice channels with people', () => {
  const channels = [ch(1, 1, 0), ch(2, 1, 1), ch(3, 1, 2, 'voice'), ch(4, 1, 3, 'voice')];
  const roster = new Map([[3, [{ id: 'u' }]], [4, []]]);
  const g = groupSidebar({ ...base, categories: [cat(1, 0)], channels, collapsed: new Set([1]), current: 2, roster });
  assert.equal(g[0].collapsed, true);
  assert.deepEqual(g[0].channels.map((c) => c.id), [2, 3]);
  const none = groupSidebar({ ...base, categories: [cat(1, 0)], channels, collapsed: new Set([1]), current: 99 });
  assert.deepEqual(ids(none), [[1, []]]);
  assert.equal(none[0].collapsed, true);
});

test('guest: categories without visible channels are omitted', () => {
  const g = groupSidebar({ ...base, guest: true, categories: [cat(1, 0), cat(2, 1)], channels: [ch(1, 1, 0)] });
  assert.deepEqual(ids(g), [[1, [1]]]);
});

test('showEmpty keeps empty categories for the owner', () => {
  const args = { ...base, categories: [cat(1, 0), cat(2, 1)], channels: [ch(1, 1, 0)] };
  assert.deepEqual(ids(groupSidebar({ ...args, showEmpty: true })), [[1, [1]], [2, []]]);
  assert.deepEqual(ids(groupSidebar(args)), [[1, [1]]]);
});

test('category_id pointing to a missing category counts as uncategorized', () => {
  const g = groupSidebar({ ...base, categories: [], channels: [ch(1, 42, 0)] });
  assert.deepEqual(ids(g), [[null, [1]]]);
});

test('groupSidebar ignores roster for unknown channels', () => {
  const g = groupSidebar({ ...base, categories: [cat(1, 0)], channels: [ch(1, 1, 0, 'voice')], collapsed: new Set([1]), roster: new Map([[77, [{ id: 'x' }]]]) });
  assert.deepEqual(ids(g), [[1, []]]);
});

test('readCollapsed/writeCollapsed round trip; throwing storage -> empty Set, no throw', () => {
  const m = new Map();
  const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  assert.equal(readCollapsed(st).size, 0);
  writeCollapsed(st, new Set([3, 5]));
  assert.ok(m.has('fp.chat.cats'));
  assert.deepEqual([...readCollapsed(st)].sort(), [3, 5]);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(readCollapsed(bad).size, 0);
  assert.doesNotThrow(() => writeCollapsed(bad, new Set([1])));
  assert.equal(readCollapsed(undefined).size, 0);
  assert.doesNotThrow(() => writeCollapsed(null, new Set([1])));
  m.set('fp.chat.cats', 'not json');
  assert.equal(readCollapsed(st).size, 0);
});

test('voiceLabel', () => {
  assert.equal(voiceLabel('lounge'), 'Lounge');
  assert.equal(voiceLabel('study-hall'), 'Study Hall');
});

test('memberSections', () => {
  const p = (id, role, extra = {}) => ({ id, role, username: id, ...extra });
  const profiles = [p('o', 'owner'), p('m', 'mod'), p('b', 'mod', { is_bot: true }), p('z', 'member', { display_name: 'Zed' }), p('a', 'member', { name: 'alpha' }),
    p('om', 'mod'), p('ob', 'member', { is_bot: true })];
  const s = memberSections(profiles, new Set(['o', 'm', 'b', 'z', 'a']));
  assert.deepEqual(s.map((x) => x.key), ['owner', 'mods', 'bots', 'online', 'offline']);
  assert.deepEqual(s.map((x) => x.title), ['Owner', 'Mods', 'Bots', 'Online', 'Offline']);
  assert.deepEqual(s[3].people.map((x) => x.id), ['a', 'z']);
  assert.deepEqual(s[4].people.map((x) => x.id), ['ob', 'om']);
  const only = memberSections([p('x', 'member')], new Set(['x']));
  assert.deepEqual(only.map((x) => x.key), ['online']);
  assert.deepEqual(memberSections([], new Set()), []);
});
