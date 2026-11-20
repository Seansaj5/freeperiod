// node --test games/nova-party/test/   (needs `npm ci` in games/nova-party/server once, for the ws package)
// Starts the real room server on a spare port, running games fast-forward, and plays through it as two or three
// guests: a game, the results, Play again, the win count, back to the lobby.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 8897;
const serverFile = fileURLToPath(new URL('../server/index.js', import.meta.url));

function client(hello) {
  const ws = new WebSocket('ws://localhost:' + PORT);
  const c = { ws, msgs: [], waits: [] };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', look: { c: 1, top: 1 }, ...hello }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.msgs.push(m);
    c.waits = c.waits.filter((w) => { if (!w.pred(m)) return true; clearTimeout(w.timer); w.done(m); return false; });
  };
  /** The first message from now on that fits (or one already received, when `past` is set). */
  c.wait = (what, pred, { ms = 8000, past = false } = {}) => new Promise((done, fail) => {
    if (past) { const hit = c.msgs.find(pred); if (hit) return done(hit); }
    const w = { pred, done, timer: setTimeout(() => fail(new Error('timed out waiting for ' + what)), ms) };
    c.waits.push(w);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.ev = (name, opt) => c.wait('event ' + name, (m) => m.t === 'ev' && m.ev.some((e) => e.e === name), opt).then((m) => m.ev.find((e) => e.e === name));
  return c;
}
const lobbyWhere = (c, what, pred, opt) => c.wait(what, (m) => m.t === 'lobby' && pred(m), opt);

test('a room: play, results, play again, wins counted, back to the lobby', async (t) => {
  const srv = spawn(process.execPath, [serverFile], { env: { ...process.env, PORT: String(PORT), NOVA_SPEED: '30', ACCOUNTS_API: 'http://localhost:9' }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => srv.kill('SIGKILL'));
  await new Promise((ok, fail) => { srv.stdout.on('data', (d) => { if (String(d).includes('server on')) ok(); }); srv.on('exit', () => fail(new Error('the server did not start (npm ci in games/nova-party/server?)'))); });

  const a = client({ mode: 'create', name: 'Ann' });
  const wa = await a.wait('welcome', (m) => m.t === 'welcome');
  assert.match(wa.code, /^[A-Z]{4}$/);
  assert.equal(wa.set.twist, 1);
  const b = client({ mode: 'join', code: wa.code, name: 'Bob' });
  const wb = await b.wait('welcome', (m) => m.t === 'welcome');
  t.after(() => { for (const c of [a, b]) try { c.ws.close(); } catch { /* closed */ } });

  a.send({ t: 'set', lives: 1, fuse: 'chaos', twist: 0 });
  await lobbyWhere(b, 'the settings', (m) => m.set.lives === 1 && m.set.twist === 0);
  b.send({ t: 'start' });                                   // not the host: nothing happens
  a.send({ t: 'start' });
  const sa = await a.wait('start', (m) => m.t === 'start'), sb = await b.wait('start', (m) => m.t === 'start', { past: true });
  assert.equal(sa.view.players.length, 2); assert.equal(sb.me, wb.id); assert.equal(sa.view.dir, 1);

  // a shout reaches everyone
  a.send({ t: 'emo', k: 1 });
  assert.deepEqual(await b.ev('emo', { past: true }), { e: 'emo', id: wa.id, k: 1 });

  // nobody answers: the nova blows and the game ends
  const over = await a.ev('over', { ms: 15000, past: true });
  assert.ok(Array.isArray(over.awards));
  const winner = over.win;
  const l1 = await lobbyWhere(a, 'the results hold', (m) => m.over != null, { past: true });
  assert.equal(l1.games, 1); assert.equal(l1.state, 'match');
  assert.ok(l1.over > 60, 'a private room holds the results for a while');
  assert.equal(l1.players.find((p) => p.id === winner).wins, 1);
  assert.equal(l1.players.find((p) => p.id !== winner).wins, 0);

  // a third player drops in while the results are up: they get the results too
  const c = client({ mode: 'join', code: wa.code, name: 'Cat' });
  t.after(() => { try { c.ws.close(); } catch { /* closed */ } });
  const sc = await c.wait('start', (m) => m.t === 'start');
  assert.equal(sc.watch, 1);
  assert.equal((await c.ev('over', { past: true })).win, winner);

  // Bob asks to play again: he is marked ready, the game does not start yet
  const startsB = b.msgs.filter((m) => m.t === 'start').length;
  b.send({ t: 'again' });
  const l2 = await lobbyWhere(a, 'Bob ready', (m) => m.players.some((p) => p.id === wb.id && p.again));
  assert.equal(l2.state, 'match'); assert.ok(l2.over != null);
  assert.equal(b.msgs.filter((m) => m.t === 'start').length, startsB);

  // the host presses it: a new game for everyone in the room, the newcomer included
  const n = a.msgs.length;
  a.send({ t: 'again' });
  const s2 = await c.wait('second start', (m) => m.t === 'start' && !m.watch);
  assert.equal(s2.view.players.length, 3);
  assert.equal(s2.view.phase, 'intro');
  await a.wait('second start', (m) => m.t === 'start' && a.msgs.indexOf(m) >= n, { past: true });
  const l3 = await lobbyWhere(a, 'results cleared', (m) => m.over == null && a.msgs.indexOf(m) >= n, { past: true });
  assert.ok(l3.players.every((p) => !p.again && p.playing));

  // second game ends; the host takes everyone back to the lobby
  await a.wait('second over', (m) => m.t === 'ev' && a.msgs.indexOf(m) >= n && m.ev.some((e) => e.e === 'over'), { ms: 20000, past: true });
  const l4 = await lobbyWhere(a, 'second results', (m) => m.games === 2 && m.over != null, { past: true });
  assert.equal(l4.players.reduce((s, p) => s + p.wins, 0), 2);
  const nb = b.msgs.length;
  b.send({ t: 'room' });                                    // not the host: ignored
  a.send({ t: 'room' });
  await b.wait('back', (m) => m.t === 'back', { past: true });
  const l5 = await lobbyWhere(b, 'the lobby', (m) => m.state === 'lobby' && b.msgs.indexOf(m) >= nb, { past: true });
  assert.equal(l5.state, 'lobby'); assert.equal(l5.over, null); assert.equal(l5.games, 2);

  // when everyone is ready the next game starts without the host (a quick-play ring has no real host)
  const q1 = client({ mode: 'quick', name: 'Quinn' });
  t.after(() => { try { q1.ws.close(); } catch { /* closed */ } });
  const wq = await q1.wait('welcome', (m) => m.t === 'welcome');
  assert.equal(wq.public, true);
  const q2 = client({ mode: 'quick', name: 'Rae' });
  t.after(() => { try { q2.ws.close(); } catch { /* closed */ } });
  const wq2 = await q2.wait('welcome', (m) => m.t === 'welcome');
  assert.equal(wq2.code, wq.code);
  q1.send({ t: 'set', lives: 1, fuse: 'chaos' }); q1.send({ t: 'start' });
  await q2.ev('over', { ms: 30000 });
  const lq = await lobbyWhere(q2, 'quick results', (m) => m.over != null, { past: true });
  assert.ok(lq.over < 20);
  const k = q1.msgs.length;
  q1.send({ t: 'again' });                                  // first in the ring, but that does not make Quinn the boss here
  await lobbyWhere(q2, 'Quinn ready', (m) => m.players.some((p) => p.again));
  assert.ok(!q1.msgs.slice(k).some((m) => m.t === 'start'));
  q2.send({ t: 'again' });
  await q2.wait('quick restart', (m) => m.t === 'start' && q2.msgs.indexOf(m) > 0 && m.view.phase === 'intro' && q2.msgs.filter((x) => x.t === 'start').length >= 2);
});
