// The multiplayer server with a fake account server: signed-in names, the owner's admin tools, guests can't pose as the owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { OBJ, ZONES, supportAt, terrainH } from '../shared/map.js';
import { TASK_MIN } from '../shared/rules.js';
const WebSocket = createRequire(new URL('../server/package.json', import.meta.url))('ws');

const USERS = { 'tok-owner-123': { username: 'Saj', role: 'owner' }, 'tok-player-123': { username: 'Kid42', role: 'player' } };
const PORT = 8800 + Math.floor(Math.random() * 90), API_PORT = PORT + 100;

function client(hello) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`), c = { ws, msgs: [], welcome: null };
    c.next = (t, ms = 4000) => new Promise((res, rej) => {
      const found = c.msgs.findIndex((m) => m.t === t);
      if (found >= 0) return res(c.msgs.splice(found, 1)[0]);
      const to = setTimeout(() => rej(new Error('no ' + t)), ms);
      c.wait = { t, res: (m) => { clearTimeout(to); res(m); } };
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    ws.on('open', () => c.send({ t: 'hello', look: {}, char: 'bolt', variant: 'exe', ...hello }));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') { c.welcome = m; resolve(c); return; }
      if (m.t === 'err') { c.err = m.msg; resolve(c); return; }
      if (c.wait && c.wait.t === m.t) { const w = c.wait; c.wait = null; w.res(m); } else c.msgs.push(m);
    });
    ws.on('close', () => { c.closed = true; if (c.wait && c.wait.t === 'close') c.wait.res({}); });
    ws.on('error', reject);
  });
}
const lastLobby = async (c) => { await new Promise((r) => setTimeout(r, 250)); const l = c.msgs.filter((m) => m.t === 'lobby').pop(); c.msgs = c.msgs.filter((m) => m.t !== 'lobby'); return l; };

test('server: accounts, owner names and admin tools', async (t) => {
  const api = http.createServer((req, res) => {
    const u = USERS[(req.headers.authorization || '').replace('Bearer ', '')];
    res.writeHead(u ? 200 : 401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(u ? { user: u } : { error: 'Not logged in' }));
  }).listen(API_PORT);
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), ACCOUNTS_API: `http://localhost:${API_PORT}` }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => { srv.kill(); api.close(); });
  await new Promise((r) => srv.stdout.once('data', r));

  // a guest can't call themselves Saj
  const fake = await client({ mode: 'create', name: 'Saj' });
  assert.equal(fake.welcome.players[0].name, 'Player');
  // a wrong token stays a guest, and admin commands do nothing
  fake.send({ t: 'admin', c: 'ann', text: 'hi' });
  await assert.rejects(fake.next('ann', 400));
  fake.ws.close();

  // the owner: named after the account, told they're the owner, everything unlocked
  const own = await client({ mode: 'create', name: 'whatever', token: 'tok-owner-123' });
  const a = await own.next('acct');
  assert.deepEqual(a, { t: 'acct', username: 'Saj', own: true });
  const code = own.welcome.code;
  const kid = await client({ mode: 'join', code, name: 'Saj', token: 'tok-player-123' });
  assert.equal((await kid.next('acct')).own, false);
  const guest = await client({ mode: 'join', code, name: 'Guesty' });
  const l = await lastLobby(own);
  const names = Object.fromEntries(l.players.map((p) => [p.name, p]));
  assert.equal(names.Saj.own, 1); assert.equal(names.Saj.acct, 1); assert.deepEqual(names.Saj.unlock, { q: true, awaken: true });
  assert.equal(names.Kid42.own, 0); assert.equal(names.Kid42.acct, 1);
  assert.equal(names.Guesty.acct, 0);
  // a signed-in player can't rename themselves
  kid.send({ t: 'pick', name: 'Saj' });
  assert.ok((await lastLobby(own)).players.some((p) => p.name === 'Kid42'));
  // a non-owner's admin commands are ignored
  kid.send({ t: 'admin', c: 'kick', id: guest.welcome.id });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!guest.closed);

  // announcements reach everyone
  own.send({ t: 'admin', c: 'ann', text: '<b>hello</b> everyone' });
  assert.equal((await guest.next('ann')).text, 'bhello/b everyone');
  // kick: the guest is told, disconnected, and can't come back with the same name
  own.send({ t: 'admin', c: 'kick', id: guest.welcome.id });
  await guest.next('kicked');
  assert.equal((await own.next('adm')).msg, 'Kicked Guesty');
  const again = await client({ mode: 'join', code, name: 'Guesty' });
  assert.match(again.err, /kicked/);
  // pick the kid as EXE, start now
  own.send({ t: 'admin', c: 'exe', id: kid.welcome.id });
  assert.match((await own.next('adm')).msg, /Kid42 will be EXE/);
  own.send({ t: 'admin', c: 'start' });
  const round = await own.next('round', 5000);
  assert.equal(round.info.ents.find((e) => e.role === 'exe').id, kid.welcome.id);
  assert.equal(round.info.ents.find((e) => e.name === 'Saj').own, 1);
  // round tools work for the owner: god mode shows up as an event
  own.msgs = [];
  own.send({ t: 'admin', c: 'god', on: true });
  const deadline = Date.now() + 2000;
  let saw = false;
  while (!saw && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 100)); saw = own.msgs.some((m) => m.t === 'ev' && m.ev.some((e) => e.k === 'admin' && e.c === 'god' && e.on === true)); }
  assert.ok(saw, 'god mode event');
  // a task minigame over the network: walk to a valve (teleport to Toxic Works, then short steps), open, play, finish
  own.send({ t: 'admin', c: 'tp', zone: 2 });
  await new Promise((r) => setTimeout(r, 300));
  const v = OBJ.valves[0];
  let px = ZONES[2].x + 4, pz = ZONES[2].z + 4;
  while (Math.hypot(v.x + 0.5 - px, v.z - pz) > 0.1) {
    const d = Math.hypot(v.x + 0.5 - px, v.z - pz), k = Math.min(1, 20 / d);
    px += (v.x + 0.5 - px) * k; pz += (v.z - pz) * k;
    own.send({ t: 'st', x: px, y: supportAt(px, pz, terrainH(px, pz) + 0.2, false, 0), z: pz, ry: 0, f: 0 });
    await new Promise((r) => setTimeout(r, 80));
  }
  own.send({ t: 'st', x: px, y: v.y - 1.1, z: pz, ry: 0, f: 0 });
  await new Promise((r) => setTimeout(r, 120));
  own.msgs = [];
  own.send({ t: 'act', k: 'task', s: 'open', tk: 'valves', i: 0 });
  await new Promise((r) => setTimeout(r, 200));
  own.send({ t: 'act', k: 'task', s: 'done', tk: 'valves', i: 0 }); // far too quick: ignored
  await new Promise((r) => setTimeout(r, 300));
  const valveEv = () => own.msgs.some((m) => m.t === 'ev' && m.ev.some((e) => e.k === 'task' && e.t === 'valves' && e.i === 0 && e.by === own.welcome.id));
  assert.equal(valveEv(), false, 'an instant finish is rejected');
  await new Promise((r) => setTimeout(r, TASK_MIN.valves * 1000));
  own.send({ t: 'act', k: 'task', s: 'done', tk: 'valves', i: 0 });
  const until = Date.now() + 2000;
  while (!valveEv() && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  assert.ok(valveEv(), 'the valve minigame counts online');
  own.send({ t: 'admin', c: 'end' });
  await own.next('adm');
  own.ws.close(); kid.ws.close();
});
