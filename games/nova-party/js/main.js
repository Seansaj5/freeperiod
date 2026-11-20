// Nova Party: menus, the ring, typing, effects and the owner's control panel. The rules live in shared/party.js;
// this file only shows what the session (solo or online) says happened.
import { TIERS } from '../shared/words.js';
import { RULES } from '../shared/party.js';
import { SUITS, TOPS, drawAstro, drawNova, heartUrl, emblemUrl, crownUrl, Blast } from './pix.js';
import { Sky } from './sky.js';
import { sfx, unlock, setSound, setMusic, startMusic } from './audio.js';
import { LocalSession, NetSession } from './net.js';
import { account, refreshAccount, isOwnerAcct, onLocalhost } from './account.js';
import { SERVER_URL } from './config.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const KEY = 'novaparty.v1';
const FUSES = ['chill', 'normal', 'chaos'], BARS = Object.keys(RULES.BARS);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// ---------- save ----------
const DEFAULTS = { name: '', look: { c: Math.floor(Math.random() * SUITS.length), top: 1 }, snd: true, mus: true, solo: { bots: 3, lives: 2, fuse: 'normal', twist: 1, bar: 'normal' }, stats: { games: 0, wins: 0, pts: 0, blue: 0 } };
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...DEFAULTS, ...s, look: { ...DEFAULTS.look, ...s.look }, solo: { ...DEFAULTS.solo, ...s.solo }, stats: { ...DEFAULTS.stats, ...s.stats } };
  } catch { /* fresh start */ }
  return JSON.parse(JSON.stringify(DEFAULTS));
}
const save = load();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private window */ } };
if (!save.name) save.name = 'Pilot' + Math.floor(100 + Math.random() * 900);

const app = { screen: 'title', session: null, acct: account(), own: false, me: 0, watch: false, lobbyAt: 0, joinedAt: 0, over: null };
let g = null;   // the game on screen
const HEART = [heartUrl(false), heartUrl(true)], CROWN = crownUrl();
const serverUrl = (() => { const v = qs.get('server'); return onLocalhost() && v && /^wss?:\/\//.test(v) ? v : SERVER_URL; })();

// ---------- small helpers ----------
function show(name) {
  app.screen = name;
  for (const s of document.querySelectorAll('.scr')) s.classList.toggle('on', s.id === name);
  if (name !== 'game') $('adm').hidden = true;
}
let toastTimer = 0;
function toast(msg, ms = 2800) { const t = $('toast'); t.textContent = msg; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); }
function veil(text) { $('veilText').innerHTML = ''; if (text) { const s = el('span', 'dots', text); $('veilText').append(s); } $('veil').classList.toggle('on', !!text); }
const myName = () => (app.acct.user ? app.acct.user.username : (save.name || 'Pilot')).slice(0, 14);
const isOwn = () => (app.session ? (app.session.online ? !!app.session.own : app.own) : app.own);
// Free Period's play page shows chat friends which room you're in (their Join button opens ?join=CODE).
function reportRoom(code) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ type: 'fp:room', room: code || null }, location.origin); } catch { /* not framed by Free Period */ }
}

// ---------- title ----------
function paintMe() {
  drawAstro($('meAv'), save.look, 'idle', app.own);
  $('suitName').textContent = SUITS[save.look.c][2];
  $('topName').textContent = TOPS[save.look.top];
  const n = $('name');
  if (app.acct.user) { n.value = app.acct.user.username; n.readOnly = true; } else { n.value = save.name; n.readOnly = false; }
}
function paintAccount() {
  const a = $('acct'); a.textContent = '';
  if (app.acct.user) { a.append('SIGNED IN AS ', el('b', '', app.acct.user.username)); if (app.own) a.append(' · OWNER: CONTROL PANEL UNLOCKED'); }
  else a.textContent = 'PLAYING AS A GUEST';
  const st = save.stats;
  $('stats').textContent = st.games ? `GAMES ${st.games} · WINS ${st.wins} · POINTS ${st.pts} · BLUE MOONS ${st.blue}` : '';
  paintMe();
}
function paintSound() {
  $('bSnd').textContent = save.snd ? 'Sound on' : 'Sound off';
  $('bMus').textContent = save.mus ? 'Music on' : 'Music off';
  $('bSnd2').textContent = save.snd ? 'Snd' : 'Mute';
  setSound(save.snd); setMusic(save.mus);
}
for (const b of document.querySelectorAll('.pick .mini')) b.addEventListener('click', () => {
  const k = b.dataset.k, n = k === 'c' ? SUITS.length : TOPS.length;
  save.look[k] = (save.look[k] + +b.dataset.d + n) % n; persist(); paintMe(); sfx.click();
});
$('name').addEventListener('input', () => { if (!app.acct.user) { save.name = $('name').value.replace(/[^\w .\-]/g, '').slice(0, 14); persist(); } });
$('bSnd').addEventListener('click', () => { save.snd = !save.snd; persist(); paintSound(); sfx.click(); });
$('bMus').addEventListener('click', () => { save.mus = !save.mus; persist(); paintSound(); sfx.click(); });
$('bSnd2').addEventListener('click', () => { save.snd = !save.snd; persist(); paintSound(); });
$('bHow').addEventListener('click', () => { $('how').hidden = false; sfx.click(); });
$('howX').addEventListener('click', () => { $('how').hidden = true; });
$('how').addEventListener('click', (e) => { if (e.target === $('how')) $('how').hidden = true; });
{
  const t = $('tiers');
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const ic = el('i'); ic.style.backgroundImage = `url(${emblemUrl(i)})`;
    const b = el('b', '', TIERS[i].name); b.style.color = TIERS[i].color; b.append(el('small', '', TIERS[i].blurb));
    t.append(ic, b, el('span', '', '+' + TIERS[i].pts));
  }
}

// ---------- sessions ----------
function wire(s) {
  app.session = s;
  s.on.lobby = (m) => { s.lobby = m; app.lobbyAt = performance.now(); if (app.screen === 'lobby') paintLobby(); else if (app.screen === 'over') paintOver(); reportRoom(m.code); };
  s.on.start = (m) => startGame(m);
  s.on.ev = onEv;
  s.on.back = () => { if (app.screen === 'game' || app.screen === 'over') { endGameView(); show('lobby'); paintLobby(); } };
  s.on.err = (msg) => { toast(msg, 4000); toTitle(); };
  s.on.close = () => lostRoom(s);
}
/** The connection dropped. If we had been in the room a while, walk straight back in (once); you sit out the game
 *  that was on and are in the next one. */
function lostRoom(s) {
  const code = s.lobby && s.lobby.code;
  if (s.online && code && app.session === s && performance.now() - app.joinedAt > 8000) {
    app.session = null; s.close(); endGameView();
    toast('Connection dropped. Rejoining the room', 3500);
    goOnline({ mode: 'join', code }, true);
    return;
  }
  toast('Lost the connection to the room.', 4000); toTitle();
}
function toTitle() {
  if (app.session) { const s = app.session; app.session = null; s.close(); }
  endGameView(); reportRoom(null); veil(null);
  show('title'); paintAccount();
}
function openLocal() {
  unlock(); sfx.click();
  const s = new LocalSession({ name: myName(), look: save.look, own: app.own, bots: save.solo.bots, set: { lives: save.solo.lives, fuse: save.solo.fuse, twist: save.solo.twist ? 1 : 0, bar: save.solo.bar } });
  wire(s); app.me = 1;
  s.connect().then(() => { app.lobbyAt = performance.now(); show('lobby'); paintLobby(); });
}
function goOnline(hello, quiet) {
  unlock(); if (!quiet) sfx.click();
  const s = new NetSession(serverUrl);
  wire(s);
  veil('Calling the server. If it was asleep this takes up to a minute');
  s.connect({ name: myName(), look: save.look, token: app.acct.token || undefined, ...hello }).then((m) => {
    if (app.session !== s) return;
    veil(null); app.me = m.id; app.lobbyAt = app.joinedAt = performance.now();
    reportRoom(m.code);
    if (app.screen !== 'game' || !g) { show('lobby'); paintLobby(); }
  }).catch((e) => { if (app.session !== s) return; app.session = null; veil(null); reportRoom(null); toast(e.message, 4500); show('title'); paintAccount(); });
}
$('bSolo').addEventListener('click', openLocal);
$('bQuick').addEventListener('click', () => goOnline({ mode: 'quick' }));
$('bCreate').addEventListener('click', () => goOnline({ mode: 'create' }));
function join() {
  const code = $('code').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { toast('A room code is 4 letters.'); return; }
  goOnline({ mode: 'join', code });
}
$('bJoin').addEventListener('click', join);
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
$('veilX').addEventListener('click', toTitle);
$('turnX').addEventListener('click', () => $('turn').classList.add('off'));

// ---------- lobby ----------
function paintLobby() {
  const s = app.session, m = s && s.lobby;
  if (!m) return;
  const people = m.players.filter((p) => !p.bot), local = !s.online;
  const host = local || m.host === app.me || isOwn();
  $('lbTitle').textContent = '';
  if (local) $('lbTitle').textContent = 'SOLO RING';
  else if (m.public) $('lbTitle').textContent = 'QUICK PLAY';
  else $('lbTitle').append('ROOM ', el('b', '', m.code));
  $('lbSub').textContent = local ? 'You against the bots' : m.public ? 'An open ring: anyone can drop in' : 'Friends join with this code';
  const slots = $('slots'); slots.textContent = '';
  let n = 0;
  for (const p of people) {
    const d = el('div', 'slot px');
    d.append(drawAstro(el('canvas'), p.look, 'idle', !!p.own), el('div', 'n', p.name));
    d.append(el('div', 'tg' + (p.own ? ' own' : ''), p.own ? 'OWNER' : p.id === app.me ? 'YOU' : p.id === m.host ? 'HOST' : ''));
    if (p.wins) d.append(winTag(p.wins));
    if (!local && host && p.id !== app.me && !p.own) { const k = el('button', 'mini kick', 'X'); k.title = 'Remove ' + p.name; k.addEventListener('click', () => s.kick(p.id)); d.append(k); }
    slots.append(d); n++;
  }
  for (let i = 0; i < m.bots && n < RULES.MAX; i++, n++) {
    const d = el('div', 'slot px');
    d.append(drawAstro(el('canvas'), { c: (i * 3 + 1) % 8, top: i % 5 }, 'think'), el('div', 'n', 'BOT'), el('div', 'tg', 'CPU'));
    slots.append(d);
  }
  for (; n < RULES.MAX; n++) slots.append(el('div', 'slot px empty', 'EMPTY'));
  $('oLives').textContent = m.set.lives;
  $('oFuse').textContent = m.set.fuse;
  const f = RULES.FUSES[m.set.fuse]; $('oFuseHint').textContent = `${f[0]}-${f[1]} s`;
  $('oBots').textContent = m.bots;
  $('oTwist').textContent = m.set.twist ? 'on' : 'off';
  $('oBar').textContent = m.set.bar || 'off';
  for (const b of document.querySelectorAll('.opt .mini')) b.disabled = !host || m.state !== 'lobby';
  $('bStart').hidden = !host; $('bStart').disabled = m.state !== 'lobby';
  paintWait();
}
/** A little crown and a count: games won in this room. */
function winTag(n) {
  const w = el('span', 'wn', 'x' + n), i = el('i');
  i.style.backgroundImage = `url(${CROWN})`; w.prepend(i); w.title = n + (n === 1 ? ' win' : ' wins') + ' in this room';
  return w;
}
function paintWait() {
  const s = app.session, m = s && s.lobby;
  if (!m || app.screen !== 'lobby') return;
  const host = !s.online || m.host === app.me || isOwn();
  let t = '';
  if (m.state === 'match') t = 'A game is on. You are in the next one.';
  else if (m.public && m.startIn != null) t = `Starts in ${Math.max(0, Math.ceil(m.startIn - (performance.now() - app.lobbyAt) / 1000))} s. Bots fill empty seats.`;
  else if (!host) t = 'Waiting for the host to start';
  else if (s.online && m.players.length + m.bots < 2) t = 'Alone? Start anyway and a bot joins you.';
  $('lbWait').textContent = t;
}
setInterval(() => { paintWait(); paintOverNote(); }, 500);
for (const b of document.querySelectorAll('.opt .mini')) b.addEventListener('click', () => {
  const s = app.session, m = s && s.lobby; if (!m) return;
  const d = +b.dataset.d, o = {};
  if (b.dataset.o === 'lives') o.lives = Math.max(1, Math.min(RULES.MAX_LIVES, m.set.lives + d));
  else if (b.dataset.o === 'bar') o.bar = BARS[(Math.max(0, BARS.indexOf(m.set.bar)) + d + BARS.length) % BARS.length];
  else if (b.dataset.o === 'fuse') o.fuse = FUSES[(FUSES.indexOf(m.set.fuse) + d + 3) % 3];
  else if (b.dataset.o === 'twist') o.twist = m.set.twist ? 0 : 1;
  else o.bots = Math.max(s.online ? 0 : 1, Math.min(RULES.MAX - m.players.filter((p) => !p.bot).length, m.bots + d));
  sfx.click(); s.setOpts(o);
  if (!s.online) { Object.assign(save.solo, o); persist(); }
});
$('bStart').addEventListener('click', () => { unlock(); sfx.click(); app.session && app.session.start(); });
$('bLeave').addEventListener('click', () => { sfx.click(); toTitle(); });

// ---------- the game view ----------
const stage = $('stage'), ring = $('ring'), novaCv = $('nova'), fxCv = $('fx');
const blast = new Blast(fxCv);
const FX = 3;   // one blast pixel = this many screen pixels

function startGame(m) {
  const v = m.view;
  app.me = m.me; app.watch = !!m.watch; app.over = null;
  g = { players: new Map(), order: [], holder: v.holder, q: v.q, phase: v.phase, round: v.round, total: v.total, used: v.total - v.left, age: 0, set: v.set, dir: v.dir === -1 ? -1 : 1, hot: v.hot || 1, adm: null, admAt: 0, showBest: false, idx: -1, frame: 0, novaT: 0, tickT: 0, heat: 0, sent: '' };
  ring.textContent = '';
  // me at the bottom of the ring, everyone else clockwise in turn order
  const at = Math.max(0, v.players.findIndex((p) => p.id === app.me));
  const list = v.players.slice(at).concat(v.players.slice(0, at));
  for (const p of list) {
    const d = el('div', 'pl' + (p.id === app.me ? ' me' : '') + (p.own ? ' own' : ''));
    const P = { ...p, out: !!p.out, el: d, bub: el('div', 'bub'), av: el('canvas', 'av'), nm: el('div', 'nm', p.name), hp: el('div', 'hp'), lb: el('div', 'lb'), sc: el('div', 'sc'), mood: '', x: 0, y: 0 };
    if (p.id === app.me) P.nm.append(el('span', 'you', ' (YOU)'));
    P.lb.append(el('i')); P.lb.title = 'Life bar: rarer answers fill it faster. Full = one more heart';
    d.append(P.bub, P.av, el('div', 'nx', 'NEXT'), P.nm, P.hp, P.lb, P.sc);
    ring.append(d);
    g.players.set(p.id, P); g.order.push(p.id);
  }
  $('logList').textContent = '';
  for (const l of v.log) addLog(l.id, l.a, l.tier);
  $('game').classList.toggle('watch', app.watch || !g.players.has(app.me));
  $('ans').value = '';
  $('bAdm').hidden = !isOwn() || app.watch;
  $('adm').hidden = true;
  $('mid').classList.remove('pop'); $('midA').textContent = v.phase === 'intro' ? 'GET READY' : ''; $('midA').style.color = ''; $('midB').textContent = '';
  novaCv.style.visibility = 'visible';
  show('game');
  setQ(v.q, true); paintCount();
  for (const P of g.players.values()) paintPlayer(P);
  layout();                     // after the first paint: the ring is sized from how tall a player really is
  paintAll();
  if (isOwn() && !app.watch) app.session.admin({ c: 'peek', on: 1 });
  unlock(); startMusic(); sfx.round();
  if (!app.watch) setTimeout(() => $('ans').focus({ preventScroll: true }), 50);
}
function endGameView() { g = null; app.over = null; ring.textContent = ''; $('adm').hidden = true; }

function layout() {
  if (!g) return;
  const W = stage.clientWidth, H = stage.clientHeight, n = g.order.length;
  let tall = 150;
  for (const P of g.players.values()) tall = Math.max(tall, P.el.offsetHeight);
  const rx = Math.max(60, Math.min(W * 0.42, W / 2 - 74)), ry = Math.max(50, Math.min(H * 0.37, H / 2 - tall / 2 - 3));
  g.order.forEach((id, k) => {
    const P = g.players.get(id), th = Math.PI / 2 + (k / n) * Math.PI * 2;
    P.x = W / 2 + Math.cos(th) * rx; P.y = H / 2 + Math.sin(th) * ry;
    P.el.style.left = P.x + 'px'; P.el.style.top = P.y + 'px';
  });
  fxCv.width = Math.max(1, Math.ceil(W / FX)); fxCv.height = Math.max(1, Math.ceil(H / FX));
  moveNova();
}
addEventListener('resize', layout);
// the stage also changes size without the window doing so (on phones the strip of answers grows above it)
if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(stage);
function moveNova() {
  if (!g) return;
  const P = g.players.get(g.holder), W = stage.clientWidth, H = stage.clientHeight;
  if (!P) return;
  // floating at the holder's side, on the side that faces the middle of the ring
  const side = P.x > W / 2 + 4 ? -1 : 1;
  novaCv.style.left = (P.x + side * (P.el.offsetWidth / 2 + novaCv.offsetWidth / 2 - 12)) + 'px';
  novaCv.style.top = (P.y - 12) + 'px';
}
function paintPlayer(P) {
  const holding = g.holder === P.id && (g.phase === 'play' || g.phase === 'intro');
  const mood = P.out ? 'out' : P.win ? 'win' : holding ? 'hold' : 'idle';
  if (mood !== P.mood) { P.mood = mood; drawAstro(P.av, P.look, mood, !!P.own); }
  P.el.classList.toggle('hold', holding && !P.out);
  P.el.classList.toggle('out', P.out);
  const slots = Math.max(RULES.MAX_LIVES, P.lives);      // always five heart slots: that is the most anyone can hold
  const bar = g.set.bar && g.set.bar !== 'off' ? Math.max(0, Math.min(100, P.bar || 0)) : -1;
  P.lb.hidden = bar < 0 || P.out;
  P.lb.firstChild.style.width = Math.max(0, bar) + '%';
  P.lb.classList.toggle('full', bar >= 100);
  if (P.hp.childElementCount !== slots) { P.hp.textContent = ''; for (let i = 0; i < slots; i++) P.hp.append(el('i', 'heart')); }
  [...P.hp.children].forEach((h, i) => { h.style.backgroundImage = `url(${HEART[i < P.lives ? 1 : 0]})`; });
  P.sc.textContent = P.score + ' PTS';
}
/** Who the nova goes to after the holder, the way the ring is turning. */
function nextUp() {
  const n = g.order.length;
  let i = g.order.indexOf(g.holder);
  if (i < 0) return 0;
  for (let k = 1; k < n; k++) { i = (i + g.dir + n) % n; const P = g.players.get(g.order[i]); if (!P.out) return P.id; }
  return 0;
}
function paintAll() {
  let alive = 0;
  for (const P of g.players.values()) { paintPlayer(P); if (!P.out) alive++; }
  // with three or more still in, mark who is up next (it changes when the ring is reversed)
  const nx = alive > 2 && (g.phase === 'play' || g.phase === 'intro') ? nextUp() : 0;
  for (const P of g.players.values()) P.el.classList.toggle('next', P.id === nx);
  moveNova(); paintStatus();
}
function setQ(q, flip) {
  g.q = q;
  const h = $('q'); h.textContent = q;
  if (flip) { h.classList.remove('flip'); void h.offsetWidth; h.classList.add('flip'); }
  $('rnd').textContent = 'CATEGORY ' + g.round + (g.hot < 1 ? ' · THE NOVA RUNS HOT' : '');
}
function paintCount() { $('cnt').textContent = `${g.total} ANSWERS ON THE LIST · ${g.used} USED`; }
function paintStatus(note, bad) {
  const s = $('status'), me = g.players.get(app.me), H = g.players.get(g.holder);
  const mine = !!me && !me.out && g.holder === app.me && g.phase === 'play';
  let t;
  if (note) t = note;
  else if (app.watch || !me) t = 'Watching. You are in the next game.';
  else if (me.out) t = 'You are out. Watching the rest.';
  else if (g.phase === 'intro') t = g.holder === app.me ? 'Get ready: you start' : 'Get ready';
  else if (g.phase === 'pop') t = 'Boom!';
  else if (mine) t = 'Your turn! Type an answer';
  else t = H ? H.name + ' has the nova' : '';
  s.textContent = t;
  s.className = bad ? 'bad' : mine && !note ? 'me' : '';
  $('ans').classList.toggle('mine', mine);
}
function bubble(P, text, cls, color) {
  P.bub.textContent = text;
  P.bub.className = 'bub' + (text ? ' on' : '') + (cls ? ' ' + cls : '');
  if (color) P.bub.style.setProperty('--tc', color); else P.bub.style.removeProperty('--tc');
}
function shout(P, text) {
  const f = el('div', 'shout', text);
  P.el.append(f); setTimeout(() => f.remove(), 1700);
}
function floatText(P, text, color) {
  const f = el('div', 'float', text); f.style.setProperty('--tc', color);
  P.el.append(f); setTimeout(() => f.remove(), 1150);
}
function mid(a, b, color) {
  const m = $('mid'); $('midA').textContent = a || ''; $('midA').style.color = color || ''; $('midB').textContent = b || '';
  m.classList.remove('pop'); void m.offsetWidth; if (a) m.classList.add('pop');
}
function addLog(id, a, tier, sep) {
  const li = el('li', sep ? 'sep' : '');
  if (sep) li.textContent = a;
  else {
    const P = g.players.get(id), b = el('b', '', a); b.style.setProperty('--tc', TIERS[tier].color);
    li.append(b, el('span', '', P ? P.name : ''), el('i', '', '+' + TIERS[tier].pts));
  }
  const list = $('logList'); list.prepend(li);
  while (list.childElementCount > 80) list.lastChild.remove();
}

// ---------- what the session says happened ----------
function onEv(e) {
  if (!g) return;
  const P = e.id ? g.players.get(e.id) : null;
  switch (e.e) {
    case 'round': {
      g.round = e.n; g.total = e.total; g.used = 0; g.holder = e.holder; g.idx = -1;
      if (!e.keep) { const was = g.hot; g.hot = e.hot || 1; if (g.hot < 1 && was >= 1) setTimeout(() => { if (g && g.round === e.n && g.phase === 'intro') mid('THE NOVA RUNS HOT', 'From here every fuse is shorter than the last', '#ff5a6a'); }, 900); }
      if (!e.keep) { g.phase = 'intro'; g.age = 0; }
      for (const p of g.players.values()) bubble(p, '');
      setQ(e.q, true); paintCount(); addLog(0, e.q, 0, true);
      mid(e.keep ? 'NEW CATEGORY' : 'GET READY', e.keep ? 'The last one ran out of answers' : '');
      novaCv.style.visibility = 'visible';
      sfx.round(); paintAll(); paintAdm();
      break;
    }
    case 'go': g.phase = 'play'; g.holder = e.holder; mid(''); paintAll(); myTurnCheck(); break;
    case 'q': setQ(e.q, true); break;
    case 'type': if (P) { bubble(P, e.s); if (e.id !== app.me && e.s) sfx.key(); } break;
    case 'ok': {
      if (!P) break;
      const T = TIERS[e.tier];
      P.score = e.score; P.lives = e.lives; if (e.bar != null) P.bar = e.bar;
      if (e.up) { P.lb.classList.remove('won'); void P.lb.offsetWidth; P.lb.classList.add('won'); }
      bubble(P, e.a, 'ok', T.color); floatText(P, '+' + e.pts, T.color);
      mid(e.a, `${T.name} +${e.pts}` + (e.up ? ' · +1 LIFE' : '') + (e.rev ? ' · REVERSE!' : ''), T.color);
      addLog(e.id, e.a, e.tier);
      g.used = g.total - e.left; g.holder = e.next; paintCount();
      if (e.dir) g.dir = e.dir;
      sfx.ok(e.tier); sfx.pass();
      if (e.rev) { setTimeout(() => { sfx.rev(); if (g && g.players.get(e.id) === P) floatText(P, 'REVERSE!', T.color); }, 260); ring.classList.remove('rev'); void ring.offsetWidth; ring.classList.add('rev'); setTimeout(() => ring.classList.remove('rev'), 650); }
      if (e.tier >= 3) blast.sparkle(P.x / FX, (P.y - 30) / FX, T.color);
      if (e.up) { sfx.life(); setTimeout(() => floatText(P, '+1 LIFE', '#ff4a6a'), 250); }
      if (e.id === app.me) {
        $('ans').value = ''; g.sent = '';
        save.stats.pts += e.pts; if (e.tier === 4) save.stats.blue++; persist();
      }
      paintAll(); myTurnCheck();
      if (e.rev && e.next === app.me) paintStatus('Reversed! The nova is back with you');
      break;
    }
    case 'emo': if (P && RULES.EMOTES[e.k]) { shout(P, RULES.EMOTES[e.k]); if (app.screen === 'game') sfx.emo(); } break;
    case 'no': {
      if (!P) break;
      bubble(P, e.s, 'no'); sfx.no();
      if (e.id === app.me) {
        const a = $('ans'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); a.select();
        paintStatus(e.why === 'used' ? `${e.a} was already said` : 'Not on the list. Try another', true);
      }
      break;
    }
    case 'pop': {
      if (!P) break;
      P.lives = e.lives; P.out = !!e.out; g.phase = 'pop';
      blast.burst(P.x / FX, (P.y - 10) / FX, P.out ? 1.4 : 1);
      stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
      { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
      novaCv.style.visibility = 'hidden';
      bubble(P, P.out ? 'OUT!' : 'OUCH', 'no');
      mid('BOOM!', (P.out ? `${P.name} is out` : `${P.name} loses a life`) + (e.say ? ` · You could have said ${e.say}` : ''), '#ff5a6a');
      sfx.pop(); if (e.id === app.me && P.out) sfx.lose();
      g.holder = e.next;
      paintAll();
      break;
    }
    case 'left': if (P) { P.out = true; P.lives = 0; bubble(P, 'LEFT', 'no'); } g.holder = e.next; paintAll(); myTurnCheck(); break;
    case 'over': {
      g.phase = 'over';
      const W = g.players.get(e.win);
      if (W) { W.win = true; paintPlayer(W); }
      mid(W ? (e.win === app.me ? 'YOU WIN!' : W.name + ' WINS!') : 'GAME OVER', '', '#ffd23d');
      if (!app.watch && g.players.has(app.me)) { save.stats.games++; if (e.win === app.me) save.stats.wins++; persist(); }
      if (e.win === app.me) sfx.win();
      $('adm').hidden = true;
      const mine = g;
      setTimeout(() => { if (g === mine) showOver(e.win, e.table, e.awards || []); }, 1700);
      break;
    }
    case 'adm': g.adm = e; g.admAt = performance.now(); paintAdm(); break;
  }
}
function myTurnCheck() {
  if (!g || g.phase !== 'play' || g.holder !== app.me) return;
  sfx.turn();
  const a = $('ans');
  if (document.activeElement !== a && !('ontouchstart' in window)) a.focus({ preventScroll: true });
  if (a.value) app.session.typing(a.value);    // typed ahead: let everyone see it
}

$('f').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!g || app.watch) return;
  const v = $('ans').value.trim();
  if (!v) return;
  if (g.phase !== 'play' || g.holder !== app.me) { paintStatus('Wait for the nova to reach you', true); return; }
  app.session.answer(v);
});
$('ans').addEventListener('input', () => {
  if (!g || g.phase !== 'play' || g.holder !== app.me) return;
  app.session.typing($('ans').value); sfx.key();
});
$('bQuit').addEventListener('click', toTitle);
// quick shouts: tap one and it pops up over your astronaut for everyone (even after you are out)
RULES.EMOTES.forEach((text, k) => {
  const b = el('button', 'btn dim sm', text); b.type = 'button';
  b.addEventListener('mousedown', (e) => e.preventDefault());      // the answer box keeps the keyboard
  b.addEventListener('click', () => { if (g && app.session && !app.watch) app.session.emote(k); });
  $('emo').append(b);
});

// ---------- results ----------
const AWARDS = {
  close: ['CLOSE CALL', (v) => `passed with ${v} s left`],
  quick: ['QUICK DRAW', (v) => `${v} s per answer`],
  deep: ['DEEP DIVER', (v) => `${v} rare finds`],
  score: ['TOP SCORE', (v) => `${v} pts`],
  oops: ['BUTTERFINGERS', (v) => `${v} wrong tries`],
  most: ['CHATTERBOX', (v) => `${v} answers`],
};
function showOver(win, table, awards) {
  const W = table.find((r) => r.id === win) || table[0];
  app.over = { win, table, awards };
  $('ovTitle').textContent = win === app.me ? 'You win!' : `${W.name} wins!`;
  drawAstro($('ovAv'), W.look, 'win', !!W.own);
  const t = $('ovTable'); t.textContent = '';
  for (const r of table) {
    const li = el('li', r.id === app.me ? 'me' : ''); li.dataset.id = r.id;
    const best = el('span', 'bst', r.best ? r.best.a : '');
    if (r.best) { best.style.setProperty('--tc', TIERS[r.best.tier].color); best.title = 'Best find: ' + TIERS[r.best.tier].name; }
    li.append(el('span', 'pc', '#' + r.place), drawAstro(el('canvas'), r.look, r.place === 1 ? 'win' : 'out', !!r.own), el('span', 'n', r.name + (r.bot ? ' (BOT)' : '')), el('span', 'tags'), best, el('span', 's', r.score + ' PTS'));
    t.append(li);
  }
  const aw = $('ovAwards'); aw.textContent = '';
  for (const a of awards) {
    const def = AWARDS[a.k], r = table.find((x) => x.id === a.id);
    if (!def || !r) continue;
    const d = el('div', 'aw px');
    d.append(el('b', '', def[0]), drawAstro(el('canvas'), r.look, 'win', !!r.own), el('span', 'n', r.name), el('small', '', def[1](a.v)));
    aw.append(d);
  }
  show('over');
  paintOver();
}
/** The parts of the results that change while they are up: who is ready for another game, wins, the buttons. */
function paintOver() {
  const s = app.session;
  if (!s || !app.over || app.screen !== 'over') return;
  const m = s.lobby, online = !!s.online;
  const byId = new Map((m ? m.players : []).map((p) => [p.id, p]));
  for (const li of $('ovTable').children) {
    const p = byId.get(+li.dataset.id), tags = li.querySelector('.tags');
    tags.textContent = '';
    if (p && p.wins) tags.append(winTag(p.wins));
    if (online && p && p.again) tags.append(el('span', 'rd', 'READY'));
  }
  const me = byId.get(app.me), ready = online && !!(me && me.again);
  const host = !online || (m && (m.host === app.me || isOwn()));
  $('bAgain').textContent = ready ? 'Ready!' : 'Play again'; $('bAgain').disabled = ready;
  $('bRoom').hidden = !host || (online && m.public); $('bRoom').textContent = online ? 'Room' : 'Setup';
  $('bRoom').title = online ? 'Take everyone back to the room to change the settings' : 'Change the bots, lives and fuse';
  $('bMenu').textContent = online ? 'Leave' : 'Menu';
  paintOverNote();
}
function paintOverNote() {
  const s = app.session;
  if (!s || !app.over || app.screen !== 'over') return;
  const m = s.lobby;
  let t = '';
  if (s.online && m) {
    const me = m.players.find((p) => p.id === app.me), hostP = m.players.find((p) => p.id === m.host);
    const n = m.players.length, r = m.players.filter((p) => p.again).length;
    const host = m.host === app.me || isOwn();
    if (m.over == null) t = 'Back to the room in a few seconds';      // a server from before Play again
    else {
      const left = Math.max(0, Math.ceil(m.over - (performance.now() - app.lobbyAt) / 1000));
      if (m.public && !isOwn()) t = (me && me.again ? 'You are in. ' : '') + 'The next game starts when everyone presses Play again';
      else if (host) t = n > 1 ? 'Play again starts the next game for everyone' : 'Play again starts the next game';
      else if (me && me.again) t = `You are in. Waiting for ${hostP ? hostP.name : 'the host'} to start`;
      else t = `Press Play again to say you are in. ${hostP ? hostP.name : 'The host'} starts it`;
      if (r && n > 1) t += ` · ${r} of ${n} ready`;
      if (m.public || left <= 30) t += ` · back to the room in ${left} s`;
    }
  }
  $('ovNote').textContent = t;
}
$('bAgain').addEventListener('click', () => {
  const s = app.session; if (!s) return;
  unlock();
  if (s.online) { sfx.ready(); s.again(); } else { sfx.click(); endGameView(); s.again(); }
});
$('bRoom').addEventListener('click', () => {
  const s = app.session; if (!s) return;
  sfx.click();
  if (s.online) s.toRoom(); else { endGameView(); s.toRoom(); show('lobby'); paintLobby(); }
});
$('bMenu').addEventListener('click', () => { sfx.click(); toTitle(); });

// ---------- the owner's control panel ----------
function useAnswer(name) {
  const a = $('ans'); a.value = name; a.focus({ preventScroll: true });
  if (g && g.phase === 'play' && g.holder === app.me) app.session.typing(name);
}
function reveal(box, row, n) {
  box.textContent = '';
  if (!row) { box.append(el('div', 'a', 'Nothing left')); return; }
  const a = el('div', 'a', row[0]); a.style.setProperty('--tc', TIERS[row[1]].color);
  a.append(el('small', '', (n ? `#${n} · ` : '') + `${TIERS[row[1]].name} +${TIERS[row[1]].pts}`));
  const b = el('button', 'btn sm dim', 'Use'); b.addEventListener('click', () => useAnswer(row[0]));
  box.append(a, b);
}
function paintAdm() {
  if (!g || !g.adm) return;
  const L = g.adm.ladder;
  if (g.showBest) reveal($('admBestOut'), L[0], 0); else $('admBestOut').textContent = '';
  if (g.idx >= 0) { g.idx = Math.min(g.idx, Math.max(0, L.length - 1)); reveal($('admNextOut'), L[g.idx], g.idx + 1); } else $('admNextOut').textContent = '';
  $('admBest').textContent = g.showBest ? 'Hide best answer' : 'Show best answer';
  $('admNext').textContent = g.idx < 0 ? 'Answers, rarest first >' : 'Next best answer >';
  const sab = new Map(g.adm.sab), box = $('admSab');
  box.textContent = '';
  for (const P of g.players.values()) {
    if (P.id === app.me || P.out) continue;
    const row = el('div', 'sabrow'), n = el('div', 'n', P.name), on = sab.has(P.id);
    if (on) n.append(el('small', '', 'sees: ' + sab.get(P.id)));
    const b = el('button', 'btn sm ' + (on ? 'dim' : 'red'), on ? 'Undo' : 'Wrong prompt');
    b.addEventListener('click', () => app.session.admin({ c: 'sab', id: P.id, on: on ? 0 : 1 }));
    row.append(n, b); box.append(row);
    P.el.classList.toggle('sab', on);
  }
  if (!box.childElementCount) box.append(el('div', 'ln', 'Nobody else is in'));
}
function toggleAdm() { if (!g || !isOwn() || app.watch) return; $('adm').hidden = !$('adm').hidden; if (!$('adm').hidden) paintAdm(); }
$('bAdm').addEventListener('click', toggleAdm);
$('admX').addEventListener('click', () => { $('adm').hidden = true; });
$('admBest').addEventListener('click', () => { if (g) { g.showBest = !g.showBest; paintAdm(); } });
$('admNext').addEventListener('click', () => { if (g && g.adm) { g.idx = g.idx + 1 >= g.adm.ladder.length ? 0 : g.idx + 1; paintAdm(); } });
addEventListener('keydown', (e) => {
  if (e.code === 'Backquote' && app.screen === 'game' && isOwn()) { e.preventDefault(); toggleAdm(); }
  else if (e.key === 'Escape') { $('how').hidden = true; $('adm').hidden = true; }
});

// ---------- every frame ----------
const sky = new Sky($('sky'));
let lastT = performance.now(), logoT = 0, logoF = 0;
drawNova($('logoNova'), 0, 0);
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  sky.frame(now);
  if (app.screen === 'title') { logoT += dt; if (logoT > 0.16) { logoT = 0; drawNova($('logoNova'), 0, ++logoF); } }
  if (g && app.screen === 'game') {
    if (g.phase === 'play') g.age += dt;
    const f = RULES.FUSES[g.set.fuse], heat = g.phase !== 'play' ? 0 : g.age > (f[0] + f[1]) / 2 * g.hot ? 2 : g.age > f[0] * 0.8 * g.hot ? 1 : 0;
    g.novaT += dt;
    if (g.novaT > 0.12 || heat !== g.heat) { g.novaT = 0; g.heat = heat; drawNova(novaCv, heat, ++g.frame); novaCv.className = heat ? 'h' + heat : ''; }
    if (g.phase === 'play') { g.tickT += dt; if (g.tickT >= [1, 0.5, 0.25][heat]) { g.tickT = 0; sfx.tick(heat === 2); } }
    if (blast.busy) blast.step(dt);
    if (g.adm && !$('adm').hidden) {
      const left = g.adm.live && g.phase === 'play' ? Math.max(0, g.adm.fuse - (now - g.admAt) / 1000) : g.adm.fuse;
      $('admFuse').textContent = g.phase === 'play' ? left.toFixed(1) + ' s' : 'waiting';
    }
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
paintSound(); paintAccount();
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });
refreshAccount(app.acct).then((a) => { app.acct = a; app.own = isOwnerAcct(a); if (app.screen === 'title') paintAccount(); if (app.screen === 'lobby') paintLobby(); });
// A friend's Join button on Free Period: ?join=CODE goes straight into that room. Only inside Free Period's play page
// (same site, which first checks a chat friend is in that room); a bare game link with ?join= just opens the title.
{
  const code = (qs.get('join') || '').trim().toUpperCase();
  let framed = false;
  try { framed = window.parent !== window && window.parent.location.origin === location.origin && /\/play\.html$/.test(window.parent.location.pathname); } catch { /* another site */ }
  if (framed && /^[A-Z]{4}$/.test(code)) { $('code').value = code; setTimeout(() => goOnline({ mode: 'join', code }), 300); }
}
requestAnimationFrame(frame);
window.__nova = { app, save, get g() { return g; }, openLocal, goOnline, toTitle, onEv, startGame, showOver, paintOver, layout };
