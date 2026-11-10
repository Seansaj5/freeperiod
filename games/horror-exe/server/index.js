// horror.exe multiplayer server: rooms of up to 6 people. The server runs each round with the same
// shared code the browser uses for solo games, so bots, hits and the clock are the same for everyone.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Round } from '../shared/round.js';
import { ROUND, CHARS, VARIANTS } from '../shared/rules.js';
import { sanitizeLook } from '../shared/looks.js';

const PORT = process.env.PORT || 8790;
const MAX = ROUND.MAX_PLAYERS;
const TICK_MS = 1000 / 30;
const QUICK_WAIT = 20000;   // quick-play lobbies start on their own after this long
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map();
let nextId = 1;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (req.url === '/stats') {
    let players = 0;
    for (const r of rooms.values()) players += r.players.size;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ players, rooms: rooms.size }));
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('horror.exe multiplayer server');
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });

const makeCode = () => { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } };
function makeRoom(isPublic) {
  const room = { code: makeCode(), public: isPublic, players: new Map(), host: 0, state: 'lobby', startAt: 0, round: null, overAt: 0, ticks: 0, last: Date.now() };
  rooms.set(room.code, room);
  return room;
}

const cleanName = (n) => String(n || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Player';
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const broadcast = (room, m) => { const s = JSON.stringify(m); for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(s); };
const pinfo = (p) => ({ id: p.id, name: p.name, look: p.look, char: p.char, variant: p.variant });
const lobbyMsg = (room) => ({
  t: 'lobby', code: room.code, public: room.public, host: room.host, state: room.state,
  startIn: room.startAt ? Math.max(0, (room.startAt - Date.now()) / 1000) : null,
  players: [...room.players.values()].map(pinfo),
});

function startRound(room) {
  const people = [...room.players.values()];
  if (!people.length) return;
  // EXE: weighted pick (your chance grows each round you are not EXE); with fewer than 3 people a bot can be EXE too
  const cands = people.map((p) => ({ id: p.id, w: p.exeWeight }));
  if (people.length < 3) cands.push({ id: null, w: cands.reduce((s, c) => s + c.w, 0) / cands.length });
  let roll = Math.random() * cands.reduce((s, c) => s + c.w, 0), exeId = null;
  for (const c of cands) { roll -= c.w; if (roll <= 0) { exeId = c.id; break; } }
  room.round = new Round({ seed: Math.floor(Math.random() * 1e9), players: people.map(pinfo), exeId });
  for (const p of people) p.exeWeight = p.id === exeId ? 1 : p.exeWeight + 1;
  room.state = 'game'; room.startAt = 0; room.overAt = 0;
  broadcast(room, { t: 'round', info: room.round.info(), now: Date.now() });
}

function backToLobby(room) {
  room.state = 'lobby'; room.round = null; room.overAt = 0;
  room.startAt = room.public ? Date.now() + QUICK_WAIT : 0;
  broadcast(room, lobbyMsg(room));
}

function tickRoom(room, now) {
  const dt = Math.min(0.1, (now - room.last) / 1000);
  room.last = now;
  if (room.state === 'lobby') {
    if (room.startAt && now >= room.startAt) startRound(room);
    return;
  }
  const R = room.round;
  if (!R) return;
  R.update(dt);
  const ev = R.drain();
  if (ev.length) broadcast(room, { t: 'ev', ev });
  if (++room.ticks % 2 === 0) broadcast(room, { t: 'snap', ts: now, ...R.snapshot() });
  if (R.phase === 'over' && !room.overAt) room.overAt = now + ROUND.RESULTS * 1000;
  if (room.overAt && now >= room.overAt) backToLobby(room);
}

setInterval(() => { const now = Date.now(); for (const room of rooms.values()) tickRoom(room, now); }, TICK_MS);

wss.on('connection', (ws) => {
  let me = null, room = null, budget = 60;
  const refill = setInterval(() => { budget = 60; }, 1000);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (--budget < 0) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, now: Date.now() });

    if (m.t === 'hello' && !me) {
      if (m.mode === 'join') {
        room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) return send(ws, { t: 'err', msg: 'No room with that code.' });
        if (room.players.size >= MAX) return send(ws, { t: 'err', msg: `That room is full (${MAX} max).` });
      } else if (m.mode === 'create') room = makeRoom(false);
      else {
        const open = [...rooms.values()].filter((r) => r.public && r.players.size < MAX);
        room = open.sort((a, b) => (a.state === 'lobby') - (b.state === 'lobby') || a.players.size - b.players.size).pop() || makeRoom(true);
      }
      me = { id: nextId++, ws, name: cleanName(m.name), look: sanitizeLook(m.look), char: CHARS[m.char] ? m.char : 'bolt', variant: VARIANTS[m.variant] ? m.variant : 'exe', exeWeight: 1 };
      room.players.set(me.id, me);
      if (!room.host || !room.players.has(room.host)) room.host = me.id;
      if (room.public && room.state === 'lobby') room.startAt = Math.max(room.startAt || Date.now() + QUICK_WAIT, Date.now() + 8000);
      send(ws, { ...lobbyMsg(room), t: 'welcome', id: me.id, now: Date.now(), round: room.round ? { info: room.round.info() } : null });
      broadcast(room, lobbyMsg(room));
      return;
    }
    if (!me) return;
    switch (m.t) {
      case 'st':
        if (room.state === 'game' && room.round) room.round.input(me.id, m);
        break;
      case 'act':
        if (room.state === 'game' && room.round && ['atk', 'abl', 'sense'].includes(m.k)) room.round.action(me.id, { k: m.k });
        break;
      case 'pick':
        if (m.name !== undefined) me.name = cleanName(m.name);
        if (m.look) me.look = sanitizeLook(m.look);
        if (CHARS[m.char]) me.char = m.char;
        if (VARIANTS[m.variant]) me.variant = m.variant;
        broadcast(room, lobbyMsg(room));
        break;
      case 'start':
        if (me.id === room.host && room.state === 'lobby') { room.startAt = Date.now() + 3500; broadcast(room, lobbyMsg(room)); }
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    if (!me || !room) return;
    room.players.delete(me.id);
    if (room.round) room.round.toBot(me.id);
    if (!room.players.size) { rooms.delete(room.code); return; }
    if (room.host === me.id) room.host = room.players.keys().next().value;
    broadcast(room, lobbyMsg(room));
  });
});

// drop connections that stopped answering
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* closed */ }
  }
}, 15000);

server.listen(PORT, () => console.log(`horror.exe server on :${PORT}`));
