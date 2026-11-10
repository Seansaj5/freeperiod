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
// Free Period accounts live on the Bing Ball server. A player who is signed in sends their token; we ask that server who it
// belongs to, so nobody can become the owner by typing a name. Guests can't take the owner's names at all.
const ACCOUNTS_API = (process.env.ACCOUNTS_API || 'https://bing-ball.onrender.com').replace(/\/+$/, '');
const OWNER_NAMES = new Set((process.env.OWNER_USERNAMES || 'Saj,Sean_0,Sean0').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));
const ADMIN_ROUND = new Set(['god', 'nocd', 'meter', 'tp', 'tasks', 'time', 'world']);

const rooms = new Map();
let nextId = 1;

// token -> { user, at } (an hour), so rejoining doesn't ask the account server again
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
  const room = { code: makeCode(), public: isPublic, players: new Map(), host: 0, state: 'lobby', startAt: 0, round: null, overAt: 0, ticks: 0, last: Date.now(), kicked: new Set(), nextExe: undefined };
  rooms.set(room.code, room);
  return room;
}

const cleanName = (n) => String(n || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Player';
/** A guest's name: never one of the owner's account names. */
const guestName = (n) => { const c = cleanName(n); return OWNER_NAMES.has(c.toLowerCase()) ? 'Player' : c; };
const whoKey = (p) => (p.acct ? 'a:' + p.acct.toLowerCase() : 'n:' + p.name.toLowerCase());
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const broadcast = (room, m) => { const s = JSON.stringify(m); for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(s); };
const pinfo = (p) => ({ id: p.id, name: p.name, look: p.look, char: p.char, variant: p.variant, unlock: p.unlock, acct: p.acct ? 1 : 0, own: p.own ? 1 : 0 });
const cleanUnlock = (u) => ({ q: !!(u && u.q === true), awaken: !!(u && u.awaken === true) });
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
  // the owner picked who is EXE this round (a player still here, or 0 for a bot)
  if (room.nextExe === 0) exeId = null;
  else if (room.nextExe && room.players.has(room.nextExe)) exeId = room.nextExe;
  room.nextExe = undefined;
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

/** The owner's ADMIN.EXE panel. Only a player whose account the account server said is the owner gets here. */
function adminCmd(room, me, m) {
  if (!me.own || typeof m.c !== 'string') return;
  const ok = (msg) => send(me.ws, { t: 'adm', msg });
  switch (m.c) {
    case 'start':
      if (room.state === 'lobby') { room.startAt = Date.now() + 1500; broadcast(room, lobbyMsg(room)); ok('Starting now'); }
      return;
    case 'end':
      if (room.state === 'game' && room.round && room.round.phase !== 'over') { room.round.admin(me.id, { c: 'end' }) || room.round.finish(); ok('Round ended'); }
      return;
    case 'exe': {
      const id = m.id === 0 ? 0 : Number(m.id);
      if (id === 0 || room.players.has(id)) { room.nextExe = id; ok(id === 0 ? 'A bot will be EXE next round' : `${room.players.get(id).name} will be EXE next round`); }
      else if (m.id === null) { room.nextExe = undefined; ok('EXE is random again'); }
      return;
    }
    case 'kick': {
      const p = room.players.get(Number(m.id));
      if (!p || p === me) return;
      room.kicked.add(whoKey(p));
      send(p.ws, { t: 'kicked' });
      try { p.ws.close(); } catch { /* gone */ }
      ok(`Kicked ${p.name}`);
      return;
    }
    case 'ann': {
      const text = String(m.text || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (text) broadcast(room, { t: 'ann', text, by: me.name });
      return;
    }
    default:
      if (ADMIN_ROUND.has(m.c) && room.state === 'game' && room.round) {
        const c = { c: m.c };
        if (m.c === 'god' || m.c === 'nocd') c.on = m.on === true;
        if (m.c === 'tp') { if (Number.isInteger(m.zone)) c.zone = m.zone; else c.id = Number(m.id); }
        if (m.c === 'time') c.d = Number(m.d) || 0;
        room.round.admin(me.id, c);
      }
  }
}

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
        if (room.kicked.has('n:' + cleanName(m.name).toLowerCase())) return send(ws, { t: 'err', msg: 'You were kicked from that room.' });
      } else if (m.mode === 'create') room = makeRoom(false);
      else {
        const banKey = 'n:' + cleanName(m.name).toLowerCase();
        const open = [...rooms.values()].filter((r) => r.public && r.players.size < MAX && !r.kicked.has(banKey));
        room = open.sort((a, b) => (a.state === 'lobby') - (b.state === 'lobby') || a.players.size - b.players.size).pop() || makeRoom(true);
      }
      me = { id: nextId++, ws, name: guestName(m.name), look: sanitizeLook(m.look), char: CHARS[m.char] ? m.char : 'bolt', variant: VARIANTS[m.variant] ? m.variant : 'exe', unlock: cleanUnlock(m.unlock), exeWeight: 1, acct: null, own: false };
      // signed in: check the account (usually instant; the account server may need a minute to wake up)
      if (m.token) {
        const p = me, r = room;
        verifyToken(m.token).then((user) => {
          if (!user || ws.readyState !== 1 || r.players.get(p.id) !== p) return;
          if (r.kicked.has('a:' + user.username.toLowerCase())) { send(ws, { t: 'kicked' }); ws.close(); return; }
          p.acct = user.username; p.name = cleanName(user.username); p.own = user.role === 'owner';
          if (p.own) p.unlock = { q: true, awaken: true };
          send(ws, { t: 'acct', username: p.acct, own: p.own });
          broadcast(r, lobbyMsg(r));
        });
      }
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
        if (room.state === 'game' && room.round && ['atk', 'abl', 'ab2', 'ab3', 'ab4', 'awaken', 'disguise', 'hide', 'qte'].includes(m.k)) room.round.action(me.id, { k: m.k, ok: m.ok === true });
        break;
      case 'pick':
        if (m.name !== undefined && !me.acct) me.name = guestName(m.name);
        if (m.look) me.look = sanitizeLook(m.look);
        if (CHARS[m.char]) me.char = m.char;
        if (VARIANTS[m.variant]) me.variant = m.variant;
        if (m.unlock) me.unlock = me.own ? { q: true, awaken: true } : cleanUnlock(m.unlock);
        broadcast(room, lobbyMsg(room));
        break;
      case 'start':
        if (me.id === room.host && room.state === 'lobby') { room.startAt = Date.now() + 3500; broadcast(room, lobbyMsg(room)); }
        break;
      case 'admin': adminCmd(room, me, m); break;
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
