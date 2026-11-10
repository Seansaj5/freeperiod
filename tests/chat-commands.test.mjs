// Slash commands and the @ picker (fp/chat/commands.js): the table by role, a typed line, arguments, time-out lengths,
// what opens above the box, and the people filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMANDS, commandNamed, allowed, visibleCommands, filterCommands, usage, parseLine, parseArgs, parseDuration, snapTimeout,
  timeoutLabel, slashQuery, applyCommand, hintFor, mentionQuery, applyMention, filterPeople, findByUsername, shrugText, askText,
  SHRUG, TABLEFLIP, UNFLIP, userArg,
} from '../fp/chat/commands.js';

const names = (list) => list.map((c) => c.name);
const MEMBER = ['help', 'dm', 'profile', 'friend', 'block', 'unblock', 'status', 'nick', 'ask', 'shrug', 'tableflip', 'unflip'];

test('every command has a name, a description and a hint built from its arguments', () => {
  for (const c of COMMANDS) {
    assert.match(c.name, /^[a-z]+$/);
    assert.ok(c.desc.length > 5, c.name);
    assert.equal(c.hint, c.args.map((a) => a.label).join(' '));
  }
  assert.equal(commandNamed('timeout').hint, '@user <minutes> [reason]');
  assert.equal(usage(commandNamed('ban')), 'Usage: /ban @user [reason]');
  assert.equal(usage(commandNamed('help')), 'Usage: /help');
  assert.equal(new Set(COMMANDS.map((c) => c.name)).size, COMMANDS.length);
});

test('role filtering: members see member commands, mods add the staff ones, the owner sees all', () => {
  assert.deepEqual(names(visibleCommands('member')), MEMBER);
  assert.deepEqual(names(visibleCommands('')), MEMBER); // no profile yet
  assert.deepEqual(names(visibleCommands('mod')), [...MEMBER, 'timeout', 'untimeout', 'purge']);
  assert.deepEqual(names(visibleCommands('owner')), names(COMMANDS));
  for (const n of ['ban', 'unban', 'reports', 'mod', 'unmod', 'ai']) {
    assert.equal(allowed(commandNamed(n), 'owner'), true, n);
    assert.equal(allowed(commandNamed(n), 'mod'), false, n);
    assert.equal(allowed(commandNamed(n), 'member'), false, n);
  }
  assert.equal(allowed(commandNamed('timeout'), 'mod'), true);
  assert.equal(allowed(commandNamed('timeout'), 'member'), false);
});

test('/purge is channel-only: hidden in DMs; staff commands on a person still show there', () => {
  assert.ok(!names(visibleCommands('owner', { dm: true })).includes('purge'));
  assert.ok(names(visibleCommands('owner', { dm: true })).includes('timeout'));
  assert.ok(names(visibleCommands('owner', { dm: false })).includes('purge'));
});

test('the list filters by what follows the slash: prefix matches first, then names containing it', () => {
  assert.deepEqual(names(filterCommands('owner', 'un')), ['unblock', 'unflip', 'untimeout', 'unban', 'unmod']);
  assert.deepEqual(names(filterCommands('member', 'un')), ['unblock', 'unflip']);
  assert.deepEqual(names(filterCommands('owner', 'ban')), ['ban', 'unban']);
  assert.deepEqual(names(filterCommands('member', 'ban')), []);
  assert.deepEqual(names(filterCommands('mod', 'mute')), ['timeout']); // alias
  assert.deepEqual(names(filterCommands('owner', 'TI')), ['timeout', 'untimeout']);
  assert.deepEqual(names(filterCommands('member', '')), MEMBER);
  assert.deepEqual(names(filterCommands('member', 'zzz')), []);
});

test('a typed line: text, commands by name or alias, unknown commands, and the // escape', () => {
  assert.deepEqual(parseLine('hello'), { kind: 'text', body: 'hello' });
  assert.deepEqual(parseLine('//shrug'), { kind: 'text', body: '/shrug' });
  assert.deepEqual(parseLine('//'), { kind: 'text', body: '/' });
  assert.deepEqual(parseLine('// not a command'), { kind: 'text', body: '/ not a command' });
  const t = parseLine('/timeout @amy 10m being loud');
  assert.equal(t.kind, 'command');
  assert.equal(t.cmd.name, 'timeout');
  assert.equal(t.rest, '@amy 10m being loud');
  assert.equal(parseLine('/TIMEOUT @amy 5').cmd.name, 'timeout');
  assert.equal(parseLine('/mute @amy 5').cmd.name, 'timeout');
  assert.equal(parseLine('/unmute @amy').cmd.name, 'untimeout');
  assert.deepEqual(parseLine('/frobnicate now'), { kind: 'unknown', name: 'frobnicate', rest: 'now' });
  assert.deepEqual(parseLine('/'), { kind: 'unknown', name: '', rest: '' });
  assert.equal(parseLine('/shrug\nsecond line').rest, 'second line');
  assert.equal(parseLine(' /help').kind, 'text'); // only a slash at the very start
});

test('arguments: users, durations, counts, choices, optional text, and the usage line when something is missing', () => {
  const p = (line) => { const l = parseLine(line); return parseArgs(l.cmd, l.rest); };
  assert.deepEqual(p('/timeout @Amy_1 5 spam spam'), { ok: true, values: { user: 'amy_1', minutes: { minutes: 10, asked: 5, adjusted: true }, reason: 'spam spam' } });
  assert.deepEqual(p('/timeout amy 1h'), { ok: true, values: { user: 'amy', minutes: { minutes: 60, asked: 60, adjusted: false }, reason: '' } });
  assert.deepEqual(p('/timeout @amy'), { ok: false, error: 'Usage: /timeout @user <minutes> [reason]' });
  assert.deepEqual(p('/timeout'), { ok: false, error: 'Usage: /timeout @user <minutes> [reason]' });
  assert.deepEqual(p('/timeout @amy soon'), { ok: false, error: 'Time-outs look like 10, 10m, 2h or 1d' });
  assert.deepEqual(p('/timeout @amy 0'), { ok: false, error: 'Use /untimeout to clear a time-out' });
  assert.deepEqual(p('/ban @a-b'), { ok: false, error: 'No one called @a-b' });
  assert.deepEqual(p('/ban zed!'), { ok: false, error: 'No one called @zed!' });
  assert.deepEqual(p('/ban @zed'), { ok: true, values: { user: 'zed', reason: '' } });
  assert.deepEqual(p('/purge 3'), { ok: true, values: { count: 3 } });
  assert.deepEqual(p('/purge 0'), { ok: false, error: 'Pick a number from 1 to 20' });
  assert.deepEqual(p('/purge 21'), { ok: false, error: 'Pick a number from 1 to 20' });
  assert.deepEqual(p('/purge 2.5'), { ok: false, error: 'Pick a number from 1 to 20' });
  assert.deepEqual(p('/purge'), { ok: false, error: 'Usage: /purge <1-20>' });
  assert.deepEqual(p('/ai ON'), { ok: true, values: { on: 'on' } });
  assert.deepEqual(p('/ai off'), { ok: true, values: { on: 'off' } });
  assert.deepEqual(p('/ai maybe'), { ok: false, error: 'Usage: /ai on|off' });
  assert.deepEqual(p('/status'), { ok: true, values: { text: '' } });
  assert.deepEqual(p('/status  out playing  '), { ok: true, values: { text: 'out playing' } });
  assert.deepEqual(p('/ask'), { ok: false, error: 'Usage: /ask <question>' });
  assert.deepEqual(p('/ask how do i log in?'), { ok: true, values: { question: 'how do i log in?' } });
  assert.deepEqual(p('/untimeout @amy extra words'), { ok: true, values: { user: 'amy' } });
  assert.deepEqual(p('/help'), { ok: true, values: {} });
  assert.equal(userArg('@x'), 'x');
  assert.equal(userArg('@'), null);
  assert.equal(userArg('a'.repeat(33)), null);
});

test('durations: bare minutes, s/m/h/d/w units, decimals; anything else is not a length', () => {
  assert.equal(parseDuration('5'), 5);
  assert.equal(parseDuration('10m'), 10);
  assert.equal(parseDuration('10min'), 10);
  assert.equal(parseDuration('2h'), 120);
  assert.equal(parseDuration('1.5h'), 90);
  assert.equal(parseDuration('1d'), 1440);
  assert.equal(parseDuration('2 days'), 2880);
  assert.equal(parseDuration('1w'), 10080);
  assert.equal(parseDuration('90s'), 1.5);
  assert.equal(parseDuration('0'), 0);
  for (const bad of ['', 'h', '-5', '5x', 'ten', '1e3', '5m30s']) assert.equal(parseDuration(bad), null, bad);
});

test('time-outs snap to what timeout_user allows (10, 60, 1440), by the closest ratio', () => {
  assert.equal(snapTimeout(1), 10);
  assert.equal(snapTimeout(5), 10);
  assert.equal(snapTimeout(10), 10);
  assert.equal(snapTimeout(20), 10);
  assert.equal(snapTimeout(30), 60);
  assert.equal(snapTimeout(60), 60);
  assert.equal(snapTimeout(120), 60);
  assert.equal(snapTimeout(240), 60);
  assert.equal(snapTimeout(480), 1440);
  assert.equal(snapTimeout(1440), 1440);
  assert.equal(snapTimeout(10080), 1440);
  assert.equal(snapTimeout(0), null);
  assert.equal(snapTimeout(-3), null);
  assert.equal(timeoutLabel(10), '10 minutes');
  assert.equal(timeoutLabel(60), '1 hour');
  assert.equal(timeoutLabel(1440), '1 day');
});

test('the command list opens while the caret is in the name; picking fills in "/name "', () => {
  assert.deepEqual(slashQuery('/'), { query: '' });
  assert.deepEqual(slashQuery('/Ti'), { query: 'ti' });
  assert.equal(slashQuery('/timeout '), null);
  assert.equal(slashQuery('//shrug'), null);
  assert.equal(slashQuery('hi /x'), null);
  assert.deepEqual(slashQuery('/timeout @amy', 3), { query: 'ti' });
  assert.deepEqual(applyCommand('/ti', 'timeout'), { value: '/timeout ', caret: 9 });
  assert.deepEqual(applyCommand('/ti @amy 5', 'timeout'), { value: '/timeout @amy 5', caret: 9 });
  assert.equal(hintFor('/timeout ', 'owner').name, 'timeout');
  assert.equal(hintFor('/mute @a', 'mod').name, 'timeout');
  assert.equal(hintFor('/timeout ', 'member'), null);
  assert.equal(hintFor('/timeout', 'owner'), null); // still typing the name: that is the list
  assert.equal(hintFor('/nope ', 'owner'), null);
  assert.equal(hintFor('/purge ', 'owner', { dm: true }), null);
});

test('@ picker: opens at the start or after a space, follows the typed name, inserts "@username "', () => {
  assert.deepEqual(mentionQuery('@'), { start: 0, end: 1, query: '' });
  assert.deepEqual(mentionQuery('hi @am'), { start: 3, end: 6, query: 'am' });
  assert.deepEqual(mentionQuery('hi\n@b'), { start: 3, end: 5, query: 'b' });
  assert.equal(mentionQuery('mail@x'), null);
  assert.equal(mentionQuery('hi @am y'), null);
  assert.equal(mentionQuery('hi @a-b'), null);
  assert.deepEqual(mentionQuery('hi @amy there', 6), { start: 3, end: 7, query: 'am' }); // caret inside the name
  assert.deepEqual(applyMention('hi @am', mentionQuery('hi @am'), 'amy_1'), { value: 'hi @amy_1 ', caret: 10 });
  assert.deepEqual(applyMention('hi @am there', mentionQuery('hi @am there', 6), 'amy'), { value: 'hi @amy there', caret: 8 });
  assert.deepEqual(applyMention('/ban @', mentionQuery('/ban @'), 'zed'), { value: '/ban @zed ', caret: 10 });
});

test('people filter: username prefix, then display names; online first; max 8; @everyone only when allowed', () => {
  const P = (id, username, display_name = null, extra = {}) => ({ id, username, display_name, ...extra });
  const list = [P('1', 'amy', 'Amy E2E'), P('2', 'ben', 'Big Ben'), P('3', 'cat', 'Amelia Cat'), P('4', 'hallpass', 'Hallpass', { is_bot: true }), P('5', 'amyx'), P('1', 'amy')];
  const u = (rows) => rows.map((r) => r.username);
  assert.deepEqual(u(filterPeople(list, 'am')), ['amy', 'amyx', 'cat']);
  assert.deepEqual(u(filterPeople(list, 'AMY')), ['amy', 'amyx']);
  assert.deepEqual(u(filterPeople(list, 'ben')), ['ben']);
  assert.deepEqual(u(filterPeople(list, 'cat')), ['cat']);
  assert.deepEqual(u(filterPeople(list, 'b')), ['ben']);
  assert.deepEqual(u(filterPeople(list, 'hall')), ['hallpass']);
  assert.deepEqual(u(filterPeople(list, 'zz')), []);
  assert.deepEqual(u(filterPeople(list, '', { online: new Set(['4', '2']) })), ['ben', 'hallpass', 'amy', 'amyx', 'cat']);
  assert.deepEqual(u(filterPeople(list, '', { exclude: new Set(['1', '2', '3']) })), ['amyx', 'hallpass']);
  const many = Array.from({ length: 20 }, (_, i) => P('m' + i, 'm' + String(i).padStart(2, '0')));
  assert.equal(filterPeople(many, 'm').length, 8);
  assert.equal(filterPeople(many, 'm', { max: 3 }).length, 3);
  assert.deepEqual(u(filterPeople(list, '', { everyone: true })).slice(0, 2), ['everyone', 'amy']);
  assert.deepEqual(u(filterPeople(list, 'ev', { everyone: true })), ['everyone']);
  assert.equal(filterPeople(list, 'ev', { everyone: true })[0].everyone, true);
  assert.deepEqual(u(filterPeople(list, 'ev')), []);
  assert.deepEqual(u(filterPeople(list, 'am', { everyone: true })), ['amy', 'amyx', 'cat']);
});

test('findByUsername, /shrug, /ask, and the posted faces', () => {
  const list = [{ id: '1', username: 'Amy_1' }, { id: '2', username: 'ben' }];
  assert.equal(findByUsername(list, '@amy_1').id, '1');
  assert.equal(findByUsername(list, 'BEN').id, '2');
  assert.equal(findByUsername(list, 'cat'), null);
  assert.equal(findByUsername(list, ''), null);
  assert.equal(shrugText(''), SHRUG);
  assert.equal(shrugText('  ok then '), 'ok then ' + SHRUG);
  assert.equal(SHRUG, '¯\\_(ツ)_/¯');
  assert.equal(TABLEFLIP, '(╯°□°)╯︵ ┻━┻');
  assert.equal(UNFLIP, '┬─┬ノ( º _ ºノ)');
  assert.equal(askText('how do I log in?'), '@Hallpass how do I log in?');
  assert.equal(askText('hey @hallpass what is this'), 'hey @hallpass what is this');
});
