// Brielle Battleroyal multiplayer server: lobbies of up to 16 people, bots fill every match to 20.
// The server runs each match with the same shared code the browser uses for solo, so loot, hits, building and the storm
// are decided in one place. People move themselves (it feels instant) and the server keeps it sane.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Match } from '../shared/match.js';
import { getMap } from '../shared/world.js';
import { MATCH, OUTFITS } from '../shared/rules.js';

const PORT = process.env.PORT || 8796;
const TICK_MS = 1000 / 30;
const SNAP_EVERY = 2;                // 15 snapshots a second
const QUICK_WAIT = 25000;            // quick-play lobbies start on their own after this long
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ACCOUNTS_API = (process.env.ACCOUNTS_API || 'https://bing-ball.onrender.com').replace(/\/+$/, '');
const OWNER_NAMES = new Set((process.env.OWNER_USERNAMES || 'Saj,Sean_0,Sean0').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));

getMap();   // build the island once at startup (~0.1 s), not when the first match starts

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
    const d = await r.json();
    const u = d && d.user;
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
  res.end('Brielle Battleroyal multiplayer server');
});
const wss = new WebSocketServer({ server, maxPayload: 8192 });

const makeCode = () => { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } };
function makeRoom(isPublic) {
  const room = { code: makeCode(), public: isPublic, players: new Map(), host: 0, state: 'lobby', startAt: 0, match: null, ticks: 0, last: Date.now(), kicked: new Set(), overAt: 0 };
  rooms.set(room.code, room);
  return room;
}

const cleanName = (n) => String(n || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Player';
const guestName = (n) => { const c = cleanName(n); return OWNER_NAMES.has(c.toLowerCase()) ? 'Player' : c; };
const cleanLook = (l) => ({ outfit: OUTFITS.some((o) => o.id === (l && l.outfit)) ? l.outfit : 'lifeguard' });
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const broadcast = (room, m) => { const s = JSON.stringify(m); for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(s); };
const pinfo = (p) => ({ id: p.id, name: p.name, look: p.look, own: p.own ? 1 : 0, acct: p.acct ? 1 : 0, playing: p.playing ? 1 : 0 });
const lobbyMsg = (room) => ({
  t: 'lobby', code: room.code, public: room.public, host: room.host, state: room.state,
  startIn: room.startAt ? Math.max(0, (room.startAt - Date.now()) / 1000) : null,
  players: [...room.players.values()].map(pinfo),
});
const whoKey = (p) => (p.acct ? 'a:' + p.acct.toLowerCase() : 'n:' + p.name.toLowerCase());

function startMatch(room) {
  if (!room.players.size) return;
  room.state = 'match';
  room.startAt = 0;
  const seed = (Math.random() * 2 ** 31) >>> 0;
  const people = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, own: p.own, acct: p.acct }));
  for (const p of room.players.values()) p.playing = true;
  room.match = new Match({ seed, people, warmup: 8 });
  room.ticks = 0; room.last = Date.now();
  const full = room.match.full();
  for (const p of room.players.values()) send(p.ws, { t: 'start', seed, full, me: p.id, now: Date.now() });
  broadcast(room, lobbyMsg(room));
}

function endMatch(room) {
  room.state = 'lobby'; room.match = null; room.overAt = 0;
  for (const p of room.players.values()) p.playing = false;
  if (room.public && room.players.size) room.startAt = Date.now() + QUICK_WAIT;
  broadcast(room, { t: 'back' });
  broadcast(room, lobbyMsg(room));
}

function tickRoom(room) {
  const now = Date.now();
  if (room.state === 'lobby') {
    if (room.public && room.startAt && now >= room.startAt) startMatch(room);
    return;
  }
  const m = room.match;
  if (!m) return;
  const dt = Math.min(0.1, (now - room.last) / 1000);
  room.last = now;
  m.update(dt);
  const ev = m.drain();
  if (ev.length) broadcast(room, { t: 'ev', ev });
  room.ticks++;
  if (room.ticks % SNAP_EVERY === 0) {
    const snap = m.snapshot();
    snap.t = 'snap'; snap.ts = now;
    broadcast(room, snap);
    for (const p of room.players.values()) {
      const mp = m.players.get(p.id);
      if (mp && mp.dirty) { mp.dirty = false; send(p.ws, { t: 'me', ...m.me(p.id) }); }
    }
  }
  if (m.phase === 'over') {
    if (!room.overAt) { room.overAt = now; broadcast(room, { t: 'results', list: m.results(), win: m.winner }); }
    if (now - room.overAt > MATCH.OVER_HOLD * 1000) endMatch(room);
  }
  // nobody left playing: end early
  if (![...room.players.values()].some((p) => p.playing)) endMatch(room);
}

setInterval(() => {
  for (const room of rooms.values()) {
    try { tickRoom(room); } catch (e) { console.error('room', room.code, e); endMatch(room); }
  }
}, TICK_MS);

function leave(room, p) {
  room.players.delete(p.id);
  if (room.match && p.playing) {
    const mp = room.match.players.get(p.id);
    if (mp && mp.alive) room.match.eliminate(mp, 0, { w: 'left' });
  }
  if (!room.players.size) { rooms.delete(room.code); return; }
  if (room.host === p.id) room.host = room.players.keys().next().value;
  broadcast(room, lobbyMsg(room));
}

wss.on('connection', (ws) => {
  let room = null, me = null;
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, now: Date.now() });
    if (m.t === 'hello' && !me) {
      const user = m.token ? await verifyToken(m.token) : null;
      if (ws.readyState !== 1) return;
      const own = !!(user && (user.role === 'owner' || OWNER_NAMES.has(user.username.toLowerCase())));
      me = { id: nextId++, ws, name: user ? cleanName(user.username) : guestName(m.name), look: cleanLook(m.look), acct: user ? user.username : null, own, playing: false };
      if (m.mode === 'join') {
        const code = String(m.code || '').toUpperCase().slice(0, 4);
        room = rooms.get(code);
        if (!room) { me = null; return send(ws, { t: 'err', msg: 'No room with that code.' }); }
        if (room.kicked.has(whoKey(me))) { me = null; room = null; return send(ws, { t: 'err', msg: 'You were removed from that room.' }); }
      } else if (m.mode === 'create') room = makeRoom(false);
      else {
        room = [...rooms.values()].find((r) => r.public && r.state === 'lobby' && r.players.size < MATCH.MAX_PEOPLE) || makeRoom(true);
      }
      if (room.players.size >= MATCH.MAX_PEOPLE) { me = null; room = null; return send(ws, { t: 'err', msg: 'That room is full.' }); }
      room.players.set(me.id, me);
      if (!room.host) room.host = me.id;
      if (room.public && !room.startAt && room.state === 'lobby') room.startAt = Date.now() + QUICK_WAIT;
      if (room.public && room.players.size >= MATCH.MAX_PEOPLE && room.state === 'lobby') room.startAt = Date.now() + 3000;
      send(ws, { ...lobbyMsg(room), t: 'welcome', id: me.id, now: Date.now(), name: me.name, acct: me.acct, own: me.own });   // t last: lobbyMsg has its own t
      broadcast(room, lobbyMsg(room));
      return;
    }
    if (!me || !room) return;
    const mt = room.match;
    switch (m.t) {
      case 'st': if (mt && me.playing) mt.state(me.id, m); break;
      case 'a': if (mt && me.playing && m.a && typeof m.a === 'object') {
        const a = m.a;
        if (a.k === 'admin') { if (me.own) mt.action(me.id, a); }
        else mt.action(me.id, a);
      } break;
      case 'start': if (room.state === 'lobby' && (room.host === me.id || me.own)) startMatch(room); break;
      case 'kick': {
        if (room.host !== me.id && !me.own) break;
        const v = room.players.get(m.id | 0);
        if (!v || v === me || v.own) break;
        room.kicked.add(whoKey(v));
        send(v.ws, { t: 'err', msg: 'You were removed from the room.' });
        leave(room, v);
        try { v.ws.close(); } catch { /* closed */ }
        break;
      }
      case 'ann': if (me.own && typeof m.text === 'string') broadcast(room, { t: 'ann', text: m.text.slice(0, 120) }); break;
      case 'leave': leave(room, me); room = null; me = null; try { ws.close(); } catch { /* closed */ } break;
    }
  });
  ws.on('close', () => { if (room && me) leave(room, me); });
});

server.listen(PORT, () => console.log('Brielle Battleroyal server on', PORT));
