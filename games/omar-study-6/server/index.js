// Omar Study 6 online: city sessions of up to 12 people. The server runs each city with the same shared code the
// browser uses for solo, so traffic, police, money and heists are decided in one place. People move themselves.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { World } from '../shared/world.js';
import { getCity } from '../shared/city.js';
import { NET, OUTFITS } from '../shared/rules.js';

const PORT = process.env.PORT || 8798;
const TICK_MS = 1000 / NET.TICK;
const SNAP_EVERY = 2;                 // 10 snapshots a second
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ACCOUNTS_API = (process.env.ACCOUNTS_API || 'https://bing-ball.onrender.com').replace(/\/+$/, '');
const OWNER_NAMES = new Set((process.env.OWNER_USERNAMES || 'Saj,Sean_0,Sean0').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));

getCity();   // build the city once at startup

const rooms = new Map();
let nextId = 1;

const verified = new Map();
async function verifyToken(token) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 400) return null;
  const hit = verified.get(token);
  if (hit && Date.now() - hit.at < 3600e3) return hit.user;
  try {
    const r = await fetch(ACCOUNTS_API + '/api/me', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(75000) });
    if (!r.ok) return null;
    const d = await r.json(), u = d && d.user;
    if (!u || typeof u.username !== 'string') return null;
    const user = { username: u.username.slice(0, 24), role: typeof u.role === 'string' ? u.role : 'player' };
    if (verified.size > 2000) verified.clear();
    verified.set(token, { user, at: Date.now() });
    return user;
  } catch { return null; }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (req.url === '/stats') {
    let players = 0; for (const r of rooms.values()) players += r.players.size;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ players, rooms: rooms.size }));
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Omar Study 6 online server');
});
const wss = new WebSocketServer({ server, maxPayload: 8192 });

const makeCode = () => { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } };
function makeRoom(isPublic) {
  const room = { code: makeCode(), public: isPublic, players: new Map(), world: new World({ seed: (Math.random() * 2 ** 31) >>> 0 }), ticks: 0, last: Date.now() };
  rooms.set(room.code, room);
  return room;
}
const cleanName = (n) => String(n || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Player';
const guestName = (n) => { const c = cleanName(n); return OWNER_NAMES.has(c.toLowerCase()) ? 'Player' : c; };
const ints = (a, max) => (Array.isArray(a) ? a.slice(0, 16).map((v) => v | 0).filter((v) => v >= 0 && v < max) : []);
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

function tickRoom(room) {
  const now = Date.now(), W = room.world;
  const dt = Math.min(0.1, (now - room.last) / 1000);
  room.last = now;
  W.update(dt);
  room.ticks++;
  const snap = room.ticks % SNAP_EVERY === 0;
  for (const p of room.players.values()) {
    const P = W.players.get(p.id); if (!P) continue;
    const ev = W.drain(p.id);
    if (ev.length) send(p.ws, { t: 'ev', ev });
    if (!snap) continue;
    const s = W.snapshot(P); s.t = 'snap'; s.ts = now;
    send(p.ws, s);
    if (P.dirty || P.heat || P.crew || P.dead) { P.dirty = false; const m = W.me(P); m.t = 'me'; send(p.ws, m); }
  }
  W.flush();
}
setInterval(() => {
  for (const room of rooms.values()) {
    try { tickRoom(room); } catch (e) { console.error('room', room.code, e); }
  }
}, TICK_MS);

function leave(room, p) {
  room.players.delete(p.id);
  room.world.removePlayer(p.id);
  if (!room.players.size) rooms.delete(room.code);
}

wss.on('connection', (ws) => {
  let room = null, me = null;
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, now: Date.now() });
    if (m.t === 'hello' && !me) {
      me = { pending: true };
      const user = m.token ? await verifyToken(m.token) : null;
      if (ws.readyState !== 1) return;
      const own = !!(user && (user.role === 'owner' || OWNER_NAMES.has(user.username.toLowerCase())));
      me = { id: nextId++, ws, name: user ? cleanName(user.username) : guestName(m.name), acct: user ? user.username : null, own };
      if (m.mode === 'join') {
        room = rooms.get(String(m.code || '').toUpperCase().slice(0, 4));
        if (!room) { me = null; return send(ws, { t: 'err', msg: 'No session with that code.' }); }
      } else if (m.mode === 'create') room = makeRoom(false);
      else room = [...rooms.values()].find((r) => r.public && r.players.size < NET.MAX_PEOPLE) || makeRoom(true);
      if (room.players.size >= NET.MAX_PEOPLE) { me = null; room = null; return send(ws, { t: 'err', msg: 'That session is full.' }); }
      room.players.set(me.id, me);
      room.world.addPlayer({ id: me.id, name: me.name, look: Math.min(OUTFITS.length - 1, Math.max(0, m.look | 0)), own, acct: me.acct, cash: m.cash, guns: ints(m.guns, 16), cars: ints(m.cars, 32), done: Array.isArray(m.done) ? m.done.slice(0, 8).map(String) : [] });
      send(ws, { t: 'welcome', id: me.id, code: room.code, public: room.public, now: Date.now(), name: me.name, acct: me.acct, own, full: room.world.full() });
      return;
    }
    if (!me || me.pending || !room) return;
    switch (m.t) {
      case 'st': room.world.state(me.id, m); break;
      case 'a': if (m.a && typeof m.a === 'object') room.world.action(me.id, m.a); break;
      case 'leave': leave(room, me); room = null; me = null; try { ws.close(); } catch { /* closed */ } break;
    }
  });
  ws.on('close', () => { if (room && me && !me.pending) leave(room, me); });
});

server.listen(PORT, () => console.log('Omar Study 6 server on', PORT));
