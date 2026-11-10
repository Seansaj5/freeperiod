// Friends' activity (fp/chat/activity.js + the data.js calls): room codes, Join links, the "Friends playing now" items,
// and the play page heartbeat's timing (fake clock, no network). The database side is tested in the scratchpad
// (chattest/pglite/activity.test.mjs and chattest/activity.real.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
globalThis.sessionStorage = fakeStorage();
globalThis.location = { search: '', hostname: 'test.invalid' };
const { cleanRoom, joinHref, withJoin, sinceText, friendsNowItems, joinLabel, createHeartbeat, HEARTBEAT_MS } = await import('../fp/chat/activity.js');
const data = await import('../fp/chat/data.js');
const { checkProfile, profileDiff, PROFILE_FIELDS } = await import('../fp/chat/perms.js');

const GAMES = [
  { id: 'bing-ball', title: 'Bing Ball', thumb: 'assets/bing-ball.jpg' },
  { id: 'close-call', title: 'Close Call', thumb: 'assets/close-call.jpg', joins: true },
  { id: 'horror-exe', title: 'horror.exe', thumb: 'assets/horror-exe.jpg', joins: true },
];

test('cleanRoom: the database rule (3-8 capital letters / digits), trimmed and upper-cased; anything else is null', () => {
  assert.equal(cleanRoom('ABCD'), 'ABCD');
  assert.equal(cleanRoom(' abcd '), 'ABCD');
  assert.equal(cleanRoom('KXQZP'), 'KXQZP');
  for (const bad of ['', 'AB', 'ABCDEFGHI', 'AB CD', 'AB-C', '<b>', 'ÄBCD', null, undefined, 1234, {}]) assert.equal(cleanRoom(bad), null, String(bad));
});

test('joinHref: the room only for games that deep-join; ids are encoded', () => {
  assert.equal(joinHref(GAMES[1], 'abcd'), 'play.html?g=close-call&room=ABCD');
  assert.equal(joinHref(GAMES[2], 'WXYZ'), 'play.html?g=horror-exe&room=WXYZ');
  assert.equal(joinHref(GAMES[0], 'KXQZP'), 'play.html?g=bing-ball', 'Bing Ball: Join just opens the game');
  assert.equal(joinHref(GAMES[1], null), 'play.html?g=close-call');
  assert.equal(joinHref(GAMES[1], 'x"><script>'), 'play.html?g=close-call');
  assert.equal(joinHref({ id: 'a b&c', joins: true }, 'ABCD'), 'play.html?g=a%20b%26c&room=ABCD');
});

test('withJoin: adds ?join= (or &join=) before any #hash; a bad code changes nothing', () => {
  assert.equal(withJoin('games/close-call/', 'ABCD'), 'games/close-call/?join=ABCD');
  assert.equal(withJoin('games/close-call/?server=ws://x', 'ABCD'), 'games/close-call/?server=ws://x&join=ABCD');
  assert.equal(withJoin('games/horror-exe/#top', 'wxyz'), 'games/horror-exe/?join=WXYZ#top');
  assert.equal(withJoin('games/close-call/', 'nope!'), 'games/close-call/');
});

test('sinceText', () => {
  assert.equal(sinceText(0), 'Just started');
  assert.equal(sinceText(59), 'Just started');
  assert.equal(sinceText(60), 'Started 1 min ago');
  assert.equal(sinceText(59 * 60 + 59), 'Started 59 min ago');
  assert.equal(sinceText(3600), 'Started 1 hour ago');
  assert.equal(sinceText(3 * 3600 + 5), 'Started 3 hours ago');
  assert.equal(sinceText('junk'), 'Just started');
});

test('friendsNowItems: known games only, one per friend, rooms only where Join can use them, order kept', () => {
  const amy = { id: 'a', username: 'amy' }, bob = { id: 'b', username: 'bob' }, cat = { id: 'c', username: 'cat' };
  const rows = [
    { user_id: 'a', game: 'close-call', room: 'ABCD', playing_secs: 300, profile: amy },
    { user_id: 'b', game: 'bing-ball', room: 'KXQZP', playing_secs: 30, profile: bob },
    { user_id: 'a', game: 'horror-exe', room: null, playing_secs: 10, profile: amy },   // a duplicate: the first wins
    { user_id: 'c', game: 'minecraft', room: null, playing_secs: 10, profile: cat },     // not a hub game
    { user_id: 'd', game: 'close-call', room: 'WXYZ', playing_secs: 10 },                 // no profile: skipped
  ];
  const items = friendsNowItems(rows, GAMES);
  assert.deepEqual(items.map((i) => [i.id, i.game.id, i.room, i.secs, i.href]), [
    ['a', 'close-call', 'ABCD', 300, 'play.html?g=close-call&room=ABCD'],
    ['b', 'bing-ball', null, 30, 'play.html?g=bing-ball'],
  ]);
  assert.deepEqual(friendsNowItems(null, GAMES), []);
});

// ---- heartbeat timing with a fake clock --------------------------------------------------------------------------
function fakeTimers() {
  let t = 0, id = 0;
  const q = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; },
    clearTimeout: (k) => q.delete(k),
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        q.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      }
      t = end;
    },
    pending: () => q.size,
  };
}
function rig(answer = true, { setting = true } = {}) {
  const timers = fakeTimers();
  const sent = [];
  let exits = 0, checks = 0, clears = 0;
  let reply = answer, on = setting, hold = null;
  const hb = createHeartbeat({
    game: 'close-call', timers, now: timers.now,
    check: async () => { checks++; return on; },
    send: async (g, r) => { sent.push([timers.now(), g, r]); if (hold) await hold; if (reply instanceof Error) throw reply; return reply; },
    clear: async () => { clears++; },
    exit: () => { exits++; },
  });
  return { hb, timers, sent, exits: () => exits, checks: () => checks, clears: () => clears, setReply: (v) => { reply = v; }, setSetting: (v) => { on = v; },
    holdSend: () => { let release; hold = new Promise((r) => { release = r; }); return () => { hold = null; release(); }; } };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('heartbeat: nothing until chat is ready; then at once and every 90 s while visible', async () => {
  const { hb, timers, sent } = rig();
  await timers.advance(5 * 60e3);
  assert.equal(sent.length, 0, 'not signed in to chat: nothing');
  hb.setReady(true);
  await timers.advance(0);
  assert.equal(sent.length, 1);
  await timers.advance(HEARTBEAT_MS - 1);
  assert.equal(sent.length, 1);
  await timers.advance(1);
  assert.equal(sent.length, 2);
  await timers.advance(HEARTBEAT_MS * 3);
  assert.equal(sent.length, 5);
  hb.setReady(false);   // signed out of chat
  await timers.advance(HEARTBEAT_MS * 3);
  assert.equal(sent.length, 5);
  assert.equal(timers.pending(), 0);
});

test('heartbeat: hidden stops it; back within the beat keeps the cadence; back after a long time beats at once', async () => {
  const { hb, timers, sent } = rig();
  hb.setReady(true);
  await timers.advance(0);
  await timers.advance(30e3);
  hb.setVisible(false);
  await timers.advance(30e3);
  assert.equal(sent.length, 1, 'nothing while hidden');
  hb.setVisible(true);                       // 60 s after the last beat: the next one is 30 s away
  await timers.advance(29e3);
  assert.equal(sent.length, 1);
  await timers.advance(1e3);
  assert.equal(sent.length, 2);
  hb.setVisible(false);
  await timers.advance(10 * 60e3);
  hb.setVisible(true);
  await timers.advance(0);
  assert.equal(sent.length, 3, 'due: at once');
});

test('heartbeat: a room change goes out after a short settle (several count once) and rides on later beats', async () => {
  const { hb, timers, sent } = rig();
  hb.setReady(true);
  await timers.advance(0);
  hb.setRoom('abcd');
  hb.setRoom('ABCD');                        // same code: nothing new
  await timers.advance(500);
  hb.setRoom('WXYZ');
  await timers.advance(1499);
  assert.equal(sent.length, 1);
  await timers.advance(1);
  assert.deepEqual(sent.slice(1).map((s) => s[2]), ['WXYZ']);
  await timers.advance(HEARTBEAT_MS);
  assert.deepEqual(sent.slice(1).map((s) => s[2]), ['WXYZ', 'WXYZ']);
  hb.setRoom('not a code');                  // invalid = no room
  await timers.advance(1500);
  assert.equal(sent.at(-1)[2], null);
  assert.equal(hb.room, null);
});

test('heartbeat: setting off (read before every beat): nothing is sent, only the setting is read; on again sends the current room', async () => {
  const { hb, timers, sent, checks, setSetting } = rig(true, { setting: false });
  hb.setReady(true);
  await timers.advance(0);
  hb.setRoom('ABCD');                        // a room change while off sends nothing either
  await timers.advance(HEARTBEAT_MS * 3);
  assert.equal(sent.length, 0, 'nothing about the game or room left');
  assert.equal(checks(), 4, 'the setting was read at every beat');
  setSetting(true);                          // turned on elsewhere (another device): seen at the next beat
  await timers.advance(HEARTBEAT_MS);
  assert.deepEqual(sent.map((x) => x[2]), ['ABCD']);
  await timers.advance(HEARTBEAT_MS);
  assert.equal(sent.length, 2, 'back to every 90 s');
});

test('heartbeat: turning the setting off (this browser) stops at once and clears; on again shows at once', async () => {
  const { hb, timers, sent, clears, setSetting } = rig(true);
  hb.setReady(true);
  await timers.advance(0);
  assert.equal(sent.length, 1);
  assert.equal(hb.shown, true);
  setSetting(false);
  hb.setAllowed(false);
  await flush();
  assert.equal(clears(), 1, 'cleared right away');
  assert.equal(hb.shown, false);
  hb.setRoom('WXYZ');
  await timers.advance(HEARTBEAT_MS * 4);
  assert.equal(sent.length, 1, 'nothing sent while off');
  setSetting(true);
  hb.setAllowed(true);
  await timers.advance(0);
  assert.deepEqual(sent.map((x) => x[2]), [null, 'WXYZ'], 'on again: at once, with the current room');
});

test('heartbeat: turned off while a beat is in flight: the row it made is cleared at once', async () => {
  const { hb, timers, sent, clears, setSetting, holdSend } = rig(true);
  const release = holdSend();
  hb.setReady(true);
  await timers.advance(0);
  assert.equal(sent.length, 1);
  setSetting(false);
  hb.setAllowed(false);                      // nothing shown yet: nothing to clear
  assert.equal(clears(), 0);
  release();
  await flush();
  assert.equal(clears(), 1, 'the in-flight beat landed, so it is taken back');
  assert.equal(hb.shown, false);
});

test('heartbeat: the database saying false (setting off there) stops room beats until a check says on', async () => {
  const { hb, timers, sent, setReply } = rig(false);
  hb.setReady(true);
  await timers.advance(0);
  hb.setRoom('ABCD');
  await timers.advance(1500);
  assert.equal(sent.length, 1, 'no room beat while off');
  setReply(true);
  await timers.advance(HEARTBEAT_MS);
  assert.deepEqual(sent.map((x) => x[2]), [null, 'ABCD']);
  assert.equal(hb.shown, true);
});

test('heartbeat: logging out of chat while shown clears the row at once (M1); closing the tab later sends nothing more', async () => {
  const { hb, timers, exits } = rig(true);
  hb.setReady(true);
  await timers.advance(0);
  hb.setReady(false);
  assert.equal(exits(), 1);
  hb.leave();
  assert.equal(exits(), 1);
});

test('joinLabel: Join with a room, Play without one', () => {
  const g = { id: 'horror-exe', title: 'horror.exe' };
  assert.deepEqual(joinLabel({ game: g, room: 'WXYZ', name: 'amy' }), { text: 'Join', label: 'Join amy in horror.exe (room WXYZ)' });
  assert.deepEqual(joinLabel({ game: g, room: null, name: 'amy' }), { text: 'Play', label: 'Play horror.exe (amy is playing)' });
  assert.deepEqual(joinLabel({ game: g, room: null }), { text: 'Play', label: 'Play horror.exe' });
});

test('heartbeat: errors keep it going (slow_down, network); banned stops it', async () => {
  const { hb, timers, sent, setReply } = rig();
  setReply(Object.assign(new Error('slow_down'), { code: 'slow_down' }));
  hb.setReady(true);
  await timers.advance(0);
  await timers.advance(HEARTBEAT_MS);
  assert.equal(sent.length, 2);
  setReply(Object.assign(new Error('banned'), { code: 'banned' }));
  await timers.advance(HEARTBEAT_MS);
  assert.equal(sent.length, 3);
  await timers.advance(HEARTBEAT_MS * 5);
  assert.equal(sent.length, 3, 'banned: no more');
});

test('heartbeat: leaving clears only when the row was shown; back from the bfcache starts again', async () => {
  const a = rig(true);
  a.hb.setReady(true);
  await a.timers.advance(0);
  a.hb.leave();
  assert.equal(a.exits(), 1);
  a.hb.leave();
  assert.equal(a.exits(), 1, 'once');
  await a.timers.advance(HEARTBEAT_MS * 2);
  assert.equal(a.sent.length, 1, 'stopped');
  a.hb.back();
  await a.timers.advance(0);
  assert.equal(a.sent.length, 2, 'restored page beats again');
  const b = rig(false);
  b.hb.setReady(true);
  await b.timers.advance(0);
  b.hb.leave();
  assert.equal(b.exits(), 0, 'setting off: nothing to clear');
  const c = rig(true);
  c.hb.leave();
  assert.equal(c.exits(), 0, 'never sent: nothing to clear');
});

// ---- data.js: validation before anything is sent, and what goes over the wire ---------------------------------------
function fakeClient() {
  const calls = [];
  const fetches = [];
  const client = {
    supabaseUrl: 'https://proj.supabase.co', supabaseKey: 'pub-key',
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok-1' } } }) },
    rpc: async (fn, args) => { calls.push([fn, args]); return { data: fn === 'set_activity' ? true : fn === 'friends_playing' ? [{ user_id: 'u2', game: 'bing-ball', room: null, playing_secs: 5 }] : null, error: null }; },
    from: (t) => ({ select: () => ({ in: async (col, ids) => { calls.push(['from', t, col, ids]); return { data: ids.map((id) => ({ id, username: 'x' + id })), error: null }; } }) }),
  };
  globalThis.fetch = (url, opts) => { fetches.push([url, opts]); return Promise.resolve({ ok: true }); };
  return { client, calls, fetches };
}

test('data: setActivity checks the game and room first, sends upper-case codes, returns the database\'s answer', async () => {
  const { client, calls } = fakeClient();
  data._inject({ client, me: () => ({ id: 'u1', username: 'me' }) });
  assert.equal((await data.setActivity('close-call', ' abcd ')), true);
  assert.deepEqual(calls.at(-1), ['set_activity', { game: 'close-call', room: 'ABCD' }]);
  await data.setActivity('bing-ball');
  assert.deepEqual(calls.at(-1), ['set_activity', { game: 'bing-ball', room: null }]);
  const n = calls.length;
  for (const [g, r, field] of [['minecraft', null, 'game'], ['close-call', 'AB', 'room'], ['close-call', '<x>', 'room']]) {
    const e = await data.setActivity(g, r).then(() => null, (x) => x);
    assert.equal(e && e.code, 'not_allowed');
    assert.equal(e.detail, field);
  }
  assert.equal(calls.length, n, 'refused before any request');
});

test('data: clearActivityOnExit sends one keepalive POST with the last heartbeat\'s token, then nothing', async () => {
  const { client, fetches } = fakeClient();
  data._inject({ client, me: () => ({ id: 'u1', username: 'me' }) });
  await data.setActivity('horror-exe', 'WXYZ');
  assert.equal(data.clearActivityOnExit(), true);
  assert.equal(fetches.length, 1);
  const [url, opts] = fetches[0];
  assert.equal(url, 'https://proj.supabase.co/rest/v1/rpc/clear_activity');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.keepalive, true);
  assert.equal(opts.headers.Authorization, 'Bearer tok-1');
  assert.equal(opts.headers.apikey, 'pub-key');
  assert.equal(data.clearActivityOnExit(), false, 'only once');
  assert.equal(fetches.length, 1);
});

test('data: friendsPlaying joins each row to its profile (one profiles query)', async () => {
  const { client, calls } = fakeClient();
  data._inject({ client, me: () => ({ id: 'u1', username: 'me' }) });
  const rows = await data.friendsPlaying();
  assert.deepEqual(rows.map((r) => [r.user_id, r.game, r.profile.username]), [['u2', 'bing-ball', 'xu2']]);
  assert.deepEqual(calls.slice(-2), [['friends_playing', undefined], ['from', 'profiles', 'id', ['u2']]]);
});

test('profile: show_activity is an editable field, boolean only; null counts as on', () => {
  assert.ok(PROFILE_FIELDS.includes('show_activity'));
  assert.deepEqual(checkProfile({ show_activity: false }), []);
  assert.equal(checkProfile({ show_activity: 'no' })[0].field, 'show_activity');
  assert.deepEqual(profileDiff({ show_activity: true }, { show_activity: false }), { show_activity: false });
  assert.deepEqual(profileDiff({ show_activity: true }, { show_activity: true }), {});
  assert.deepEqual(profileDiff({ show_activity: false }, { show_activity: null }), { show_activity: true });
});

test('data: myShowActivity reads the own setting (missing row = off); updateProfile tells the play page when it changes', async () => {
  let prof = { id: 'u1', username: 'me', banned: false, show_activity: true };
  const q = (rows) => { const o = { eq: () => o, select: () => o, maybeSingle: async () => ({ data: rows()[0] || null, error: null }), then: (res) => res({ data: rows(), error: null }) }; return o; };
  const client = {
    from: () => ({
      select: () => q(() => (prof ? [prof] : [])),
      update: (patch) => { prof = { ...prof, ...patch }; return q(() => [prof]); },
    }),
  };
  data._inject({ client, me: () => ({ id: 'u1', username: 'me' }) });
  assert.equal(await data.myShowActivity(), true);
  const heard = [];
  const off = data.onActivitySetting((v) => heard.push(v));
  await data.updateProfile({ about: 'hi' });
  assert.deepEqual(heard, [], 'other fields: nothing');
  await data.updateProfile({ show_activity: false });
  assert.deepEqual(heard, [{ uid: 'u1', on: false }]);
  assert.equal(await data.myShowActivity(), false);
  assert.equal(JSON.parse(globalThis.localStorage.getItem('fp.chat.activity')).on, false, 'other tabs hear it through storage');
  off();
  prof = null;
  assert.equal(await data.myShowActivity(), false, 'no profile row: off');
});
