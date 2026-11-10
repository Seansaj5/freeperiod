// Close Call multiplayer server: rooms of up to 8 drivers. It only relays positions and scores.
// Traffic is never sent: every client computes it from the room's seed and the shared clock.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8787;
const MAX_PLAYERS = 8;
const TICK_MS = 100;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map(); // code -> room
let nextId = 1;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (req.url === '/stats') {
    let players = 0, open = 0;
    for (const r of rooms.values()) { players += r.players.size; if (r.public && r.players.size < MAX_PLAYERS) open++; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ players, rooms: rooms.size, open }));
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Close Call multiplayer server');
});

const wss = new WebSocketServer({ server, maxPayload: 2048 });

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

const MAPS = ['city', 'coast', 'canyon'];
const cleanMap = (m) => (MAPS.includes(m) ? m : 'city');
const cleanLanes = (l) => ([2, 3, 4].includes(l) ? l : 4);

function makeRoom(isPublic, map, lanes) {
  const room = { code: makeCode(), public: isPublic, seed: Math.floor(Math.random() * 1e9), density: 1, start: Date.now(), players: new Map(), map: cleanMap(map), lanes: cleanLanes(lanes) };
  rooms.set(room.code, room);
  return room;
}

const info = (p) => ({ id: p.id, name: p.name, car: p.car, color: p.color });
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (room, msg, except) => { const s = JSON.stringify(msg); for (const p of room.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s); };
const cleanName = (n) => String(n || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Driver';
const num = (x, lo, hi) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0);

wss.on('connection', (ws) => {
  let me = null, room = null;
  let budget = 40; // messages per second
  const refill = setInterval(() => { budget = 40; }, 1000);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (--budget < 0) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'hello' && !me) {
      if (m.mode === 'join') {
        room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) return send(ws, { t: 'err', msg: 'No room with that code.' });
        if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'err', msg: 'That room is full (8 max).' });
      } else if (m.mode === 'create') {
        room = makeRoom(false, m.map, m.lanes);
      } else {
        // quick play: the busiest public room on the same map and lane count
        const map = cleanMap(m.map), lanes = cleanLanes(m.lanes);
        room = [...rooms.values()].filter((r) => r.public && r.map === map && r.lanes === lanes && r.players.size < MAX_PLAYERS).sort((a, b) => b.players.size - a.players.size)[0] || makeRoom(true, map, lanes);
      }
      me = { id: nextId++, ws, name: cleanName(m.name), car: String(m.car || 'pocket').slice(0, 20), color: num(m.color, 0, 0xffffff) | 0, st: null };
      room.players.set(me.id, me);
      send(ws, { t: 'welcome', id: me.id, code: room.code, public: room.public, seed: room.seed, density: room.density, start: room.start, map: room.map, lanes: room.lanes, now: Date.now(), players: [...room.players.values()].filter((p) => p !== me).map(info) });
      broadcast(room, { t: 'join', p: info(me) }, me);
      return;
    }
    if (!me) return;
    switch (m.t) {
      case 'st':
        me.st = [me.id, Date.now(), num(m.s, -1e3, 1e8), num(m.d, -20, 20), num(m.y, -2, 2), num(m.v, 0, 200), m.b ? 1 : 0, num(m.sc, 0, 1e10) | 0, num(m.pd, 0, 1e9) | 0, num(m.m, 0, 20)];
        break;
      case 'ping':
        send(ws, { t: 'pong', c: m.c, now: Date.now() });
        break;
      case 'ev':
        if (['bank', 'lost', 'crash', 'split'].includes(m.k)) broadcast(room, { t: 'ev', id: me.id, k: m.k, p: num(m.p, 0, 1e9) | 0 }, me);
        break;
      case 'car':
        me.car = String(m.car || me.car).slice(0, 20); me.color = num(m.color, 0, 0xffffff) | 0;
        broadcast(room, { t: 'join', p: info(me) }, me);
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    if (!me || !room) return;
    room.players.delete(me.id);
    broadcast(room, { t: 'leave', id: me.id });
    if (room.players.size === 0) rooms.delete(room.code);
  });
});

// 10 times a second, send every room its players' latest states
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.players.size < 2) continue;
    const p = [];
    for (const pl of room.players.values()) if (pl.st) p.push(pl.st);
    if (p.length) broadcast(room, { t: 'snap', now, p });
  }
}, TICK_MS);

// drop connections that stopped answering
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Close Call server on :${PORT}`));
