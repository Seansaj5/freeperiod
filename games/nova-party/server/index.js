// Nova Party multiplayer server: rings of up to 8, by quick play or a 4-letter room code.
// The server runs each game with the same shared code the browser uses for solo (games/nova-party/shared), so every
// answer is judged here and nobody's browser can see the fuse or the answer list of a live game.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Party, RULES, makeBots } from '../shared/party.js';
import { CATS } from '../shared/cats.js';

const PORT = process.env.PORT || 8797;
const TICK_MS = 100;
const QUICK_WAIT = 20000;            // quick-play rings start on their own after this long
const QUICK_MIN = 3;                 // and are filled with bots up to this many
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ACCOUNTS_API = (process.env.ACCOUNTS_API || 'https://bing-ball.onrender.com').replace(/\/+$/, '');
const OWNER_NAMES = new Set((process.env.OWNER_USERNAMES || 'Saj,Sean_0,Sean0').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));

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
  res.end('Nova Party multiplayer server');
});
const wss = new WebSocketServer({ server, maxPayload: 2048 });

const makeCode = () => { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } };
function makeRoom(isPublic) {
  const room = { code: makeCode(), public: isPublic, players: new Map(), host: 0, state: 'lobby', startAt: 0, party: null, last: Date.now(), kicked: new Set(), bots: 0, set: { lives: 2, fuse: 'normal' } };
  rooms.set(room.code, room);
  return room;
}

const cleanName = (n) => String(n || '').replace(/[^\w .\-]/g, '').trim().slice(0, 14) || 'Player';
const guestName = (n) => { const c = cleanName(n); return OWNER_NAMES.has(c.toLowerCase()) ? 'Player' : c; };
const cleanLook = (l) => ({ c: Math.max(0, Math.min(7, (l && l.c) | 0)), top: Math.max(0, Math.min(4, (l && l.top) | 0)) });
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const broadcast = (room, m) => { const s = JSON.stringify(m); for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(s); };
const pinfo = (p) => ({ id: p.id, name: p.name, look: p.look, own: p.own ? 1 : 0, acct: p.acct ? 1 : 0, playing: p.playing ? 1 : 0 });
const lobbyMsg = (room) => ({
  t: 'lobby', code: room.code, public: room.public, host: room.host, state: room.state, bots: room.bots, set: room.set,
  startIn: room.startAt ? Math.max(0, (room.startAt - Date.now()) / 1000) : null,
  players: [...room.players.values()].map(pinfo),
});
const whoKey = (p) => (p.acct ? 'a:' + p.acct.toLowerCase() : 'n:' + p.name.toLowerCase());
const fits = (room) => room.players.size + room.bots < RULES.MAX;

function startMatch(room) {
  if (!room.players.size) return;
  const humans = [...room.players.values()];
  let bots = Math.min(room.bots, RULES.MAX - humans.length);
  const least = room.public ? QUICK_MIN : 2;
  if (humans.length + bots < least) bots = least - humans.length;
  const people = humans.map((p) => ({ id: p.id, name: p.name, look: p.look, own: p.own }));
  for (const b of makeBots(bots, 0, Math.random, humans.map((p) => p.name))) { b.id = nextId++; people.push(b); }
  for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [people[i], people[j]] = [people[j], people[i]]; }
  room.state = 'match'; room.startAt = 0;
  for (const p of humans) p.playing = true;
  room.party = new Party({ people, cats: CATS, settings: room.set });
  room.party.drain();
  room.last = Date.now();
  for (const p of humans) send(p.ws, { t: 'start', me: p.id, view: room.party.view(p.id) });
  broadcast(room, lobbyMsg(room));
}

function endMatch(room) {
  room.state = 'lobby'; room.party = null;
  for (const p of room.players.values()) p.playing = false;
  if (room.public && room.players.size) room.startAt = Date.now() + QUICK_WAIT;
  broadcast(room, { t: 'back' });
  broadcast(room, lobbyMsg(room));
}

/** Sends out what happened: private events to their one player, the rest to the whole room. */
function flush(room) {
  const ev = room.party.drain();
  if (!ev.length) return;
  const all = [];
  for (const e of ev) {
    if (e.to) { const p = room.players.get(e.to); if (p) { const { to, ...rest } = e; send(p.ws, { t: 'ev', ev: [rest] }); } } else all.push(e);
  }
  if (all.length) broadcast(room, { t: 'ev', ev: all });
}

function tickRoom(room) {
  const now = Date.now();
  if (room.state === 'lobby') {
    if (room.public && room.startAt && now >= room.startAt) startMatch(room);
    return;
  }
  const m = room.party;
  if (!m) return;
  const dt = Math.min(0.5, (now - room.last) / 1000);
  room.last = now;
  m.update(dt);
  flush(room);
  if (m.phase === 'over' && m.t <= 0) endMatch(room);
  else if (![...room.players.values()].some((p) => p.playing)) endMatch(room);   // only watchers left
}

setInterval(() => {
  for (const room of rooms.values()) {
    try { tickRoom(room); } catch (e) { console.error('room', room.code, e); endMatch(room); }
  }
}, TICK_MS);

function leave(room, p) {
  room.players.delete(p.id);
  if (room.party && p.playing) { room.party.leave(p.id); flush(room); }
  if (!room.players.size) { rooms.delete(room.code); return; }
  if (room.host === p.id) room.host = room.players.keys().next().value;
  broadcast(room, lobbyMsg(room));
}

wss.on('connection', (ws) => {
  let room = null, me = null, lastType = 0;
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, now: Date.now() });
    if (m.t === 'hello' && !me) {
      const user = m.token ? await verifyToken(m.token) : null;
      if (ws.readyState !== 1 || me) return;
      const own = !!(user && (user.role === 'owner' || OWNER_NAMES.has(user.username.toLowerCase())));
      me = { id: nextId++, ws, name: user ? cleanName(user.username) : guestName(m.name), look: cleanLook(m.look), acct: user ? user.username : null, own, playing: false };
      if (m.mode === 'join') {
        const code = String(m.code || '').toUpperCase().slice(0, 4);
        room = rooms.get(code);
        if (!room) { me = null; return send(ws, { t: 'err', msg: 'No room with that code.' }); }
        if (room.kicked.has(whoKey(me))) { me = null; room = null; return send(ws, { t: 'err', msg: 'You were removed from that room.' }); }
      } else if (m.mode === 'create') room = makeRoom(false);
      else room = [...rooms.values()].find((r) => r.public && r.state === 'lobby' && fits(r)) || makeRoom(true);
      if (!fits(room)) {
        if (room.bots > 0 && room.state === 'lobby') room.bots--;      // a person takes a bot's seat
        else { me = null; room = null; return send(ws, { t: 'err', msg: 'That room is full.' }); }
      }
      room.players.set(me.id, me);
      if (!room.host) room.host = me.id;
      if (room.public && !room.startAt && room.state === 'lobby') room.startAt = Date.now() + QUICK_WAIT;
      if (room.public && room.players.size >= RULES.MAX && room.state === 'lobby') room.startAt = Date.now() + 3000;
      send(ws, { ...lobbyMsg(room), t: 'welcome', id: me.id, name: me.name, acct: me.acct, own: me.own });   // t last: lobbyMsg has its own t
      if (room.party) send(ws, { t: 'start', me: me.id, view: room.party.view(0), watch: 1 });           // a game is on: watch until it ends
      broadcast(room, lobbyMsg(room));
      return;
    }
    if (!me || !room) return;
    const party = room.party, isHost = room.host === me.id || me.own;
    switch (m.t) {
      case 'ans': if (party && me.playing && typeof m.s === 'string') { party.answer(me.id, m.s); flush(room); } break;
      case 'type': {
        const now = Date.now();
        if (party && me.playing && typeof m.s === 'string' && now - lastType >= 60) { lastType = now; party.typing(me.id, m.s); flush(room); }
        break;
      }
      case 'adm': if (party && me.playing && me.own) { party.admin(me.id, { c: m.c, id: m.id, on: m.on }); flush(room); } break;
      case 'start': if (room.state === 'lobby' && isHost) startMatch(room); break;
      case 'set': {
        if (room.state !== 'lobby' || !isHost) break;
        if ([1, 2, 3].includes(m.lives)) room.set.lives = m.lives;
        if (RULES.FUSES[m.fuse]) room.set.fuse = m.fuse;
        if (Number.isInteger(m.bots)) room.bots = Math.max(0, Math.min(RULES.MAX - room.players.size, m.bots));
        broadcast(room, lobbyMsg(room));
        break;
      }
      case 'kick': {
        if (!isHost) break;
        const v = room.players.get(m.id | 0);
        if (!v || v === me || v.own) break;
        room.kicked.add(whoKey(v));
        send(v.ws, { t: 'err', msg: 'You were removed from the room.' });
        leave(room, v);
        try { v.ws.close(); } catch { /* closed */ }
        break;
      }
      case 'leave': leave(room, me); room = null; me = null; try { ws.close(); } catch { /* closed */ } break;
    }
  });
  ws.on('close', () => { if (room && me) leave(room, me); });
});

server.listen(PORT, () => console.log('Nova Party server on', PORT));
