// Brielle Battleroyal: menus, the match on screen, your controls (move, shoot, build, edit), camera and HUD.
import * as THREE from 'three';
import { getMap, World, rayPlayer } from '../shared/world.js';
import { heightAt } from '../shared/map.js';
import { buildWorld, makeStorm } from './scene.js';
import { Avatar, lootModel, blimpModel, pieceGeometry, pieceMat, ghostMat, ghostBad, glowSprite } from './models.js';
import { FX } from './fx.js';
import { initAudio, sfx, loop, setVolume } from './audio.js';
import { LocalSession, NetSession } from './net.js';
import { newBody, stepBody } from '../shared/move.js';
import { targetFor, bounds, slotKey, offsetFor, baseY } from '../shared/build.js';
import { unpackLoot, FLAG } from '../shared/match.js';
import { WEAPONS, HEALS, RARITY, BUILD, BODY, OUTFITS, AMMO, MAP, FALL } from '../shared/rules.js';
import { KINDS, isGun, itemName } from '../shared/items.js';
import { Hud } from './hud.js';
import { account, refreshAccount, isOwnerAcct } from './account.js';
import { SERVER_URL } from './config.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches || qs.has('touch');
document.body.classList.toggle('touch', touch);

// ---------- save ----------
const SAVE_KEY = 'brielle.v1';
function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { /* fresh */ }
  s = s && typeof s === 'object' ? s : {};
  s.name = typeof s.name === 'string' ? s.name : '';
  s.outfit = OUTFITS.some((o) => o.id === s.outfit) ? s.outfit : 'lifeguard';
  s.sens = typeof s.sens === 'number' ? s.sens : 1;
  s.quality = s.quality === 'low' ? 'low' : s.quality === 'high' ? 'high' : (touch ? 'low' : 'high');
  s.vol = typeof s.vol === 'number' ? s.vol : 0.8;
  s.stats = s.stats && typeof s.stats === 'object' ? s.stats : {};
  for (const k of ['matches', 'wins', 'kills', 'top5']) s.stats[k] = s.stats[k] | 0;
  return s;
}
const save = loadSave();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } };
// Free Period may bring in your cloud save (signed in) while the menu is open: take it, then show it
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY || app.game) return;
  Object.assign(save, loadSave());
  setVolume(save.vol); showStats();
  if (!app.acct.user) $('nameField').value = save.name;
});
setVolume(save.vol);

// ---------- renderer + the island ----------
const low = save.quality === 'low';
const renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !low;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('gl').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfdcf0, low ? 160 : 240, low ? 520 : 900);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2600);
const hemi = new THREE.HemisphereLight(0xdcefff, 0x6f7f4a, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
const SUN_DIR = new THREE.Vector3(0.45, 0.62, -0.64).normalize();
sun.castShadow = !low;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 500 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const map = getMap();
const W = buildWorld(map, scene, { low, shadows: !low });
const fx = new FX(scene);
let hud = null;

// ---------- input ----------
const keys = new Set();
const mouse = { l: false, r: false, dx: 0, dy: 0, clicked: false, wheel: 0 };
let locked = false;
addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.code === 'Tab') e.preventDefault();
  if (!keys.has(e.code)) onKey(e.code, e);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
const NOLOCK = qs.has('nolock');
function lockPointer() { if (NOLOCK || touch) return; try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* needs a click */ } }   // tests: no pointer lock in headless browsers
renderer.domElement.addEventListener('mousedown', (e) => {
  initAudio();
  if (NOLOCK) locked = true;
  if (app.game && !locked && !touch && !app.game.mapOpen && !app.paused) { lockPointer(); return; }
  if (e.button === 0) { mouse.l = true; mouse.clicked = true; }
  if (e.button === 2) { mouse.r = true; app.game && app.game.onRight(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (locked && !NOLOCK) { mouse.dx += e.movementX; mouse.dy += e.movementY; } });
addEventListener('wheel', (e) => { if (locked) mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked && app.game && !app.game.mapOpen && !app.game.over && !touch) showPause(true);
});

function onKey(code, e) {
  const g = app.game;
  if (code === 'Escape') { if (g && g.mapOpen) { g.toggleMap(false); return; } if (g && g.editing) { g.cancelEdit(); return; } return; }
  if (!g || app.paused) return;
  g.onKey(code, e);
}

// ---------- app / screens ----------
const app = { screen: 'title', game: null, session: null, paused: false, acct: account(), own: false };
app.own = isOwnerAcct(app.acct);
refreshAccount(app.acct).then((a) => { app.acct = a; app.own = isOwnerAcct(a); showAccount(); });

function screen(name) {
  app.screen = name;
  for (const s of ['title', 'locker', 'lobby', 'hud', 'results', 'loading', 'settings']) $(s).classList.toggle('hidden', s !== name);
  document.body.classList.toggle('ingame', name === 'hud');
  $('keysHelp').classList.toggle('hidden', name !== 'title');
  $('touch').classList.toggle('hidden', !(touch && name === 'hud'));
}
function showAccount() {
  const u = app.acct.user;
  $('acct').textContent = u ? (app.own ? '👑 ' : '') + u.username : 'Guest';
  $('acct').classList.toggle('own', app.own);
  $('nameField').value = u ? u.username : save.name;
  $('nameField').disabled = !!u;
  $('adminTip').classList.toggle('hidden', !app.own);
}
function showStats() {
  const s = save.stats;
  $('stats').innerHTML = `<span><b>${s.wins}</b> wins</span><span><b>${s.kills}</b> eliminations</span><span><b>${s.top5}</b> top 5</span><span><b>${s.matches}</b> matches</span>`;
}
function myName() { return app.acct.user ? app.acct.user.username : (($('nameField').value || '').trim().slice(0, 16) || 'Player'); }

$('bSolo').onclick = () => { initAudio(); startSolo(); };
$('bQuick').onclick = () => { initAudio(); goOnline({ mode: 'quick' }); };
$('bCreate').onclick = () => { initAudio(); goOnline({ mode: 'create' }); };
$('bJoin').onclick = () => { initAudio(); const c = $('codeField').value.trim().toUpperCase(); if (c.length === 4) goOnline({ mode: 'join', code: c }); else status('Type the 4-letter room code first.', true); };
$('bLocker').onclick = () => openLocker();
$('bSettings').onclick = () => openSettings();
$('nameField').onchange = () => { if (!app.acct.user) { save.name = $('nameField').value.trim().slice(0, 16); persist(); } };
function status(msg, err) { $('status').textContent = msg; $('status').classList.toggle('err', !!err); }

// online status dot
const serverUrl = (() => { const v = qs.get('server'); return v && /^wss?:\/\//.test(v) ? v : SERVER_URL; })();
fetch(serverUrl.replace(/^ws/, 'http') + '/health', { cache: 'no-store' }).then((r) => { if (r.ok) $('online').classList.add('up'), $('onlineTxt').textContent = 'Online servers up'; }).catch(() => { $('onlineTxt').textContent = 'Online server is asleep (it wakes when you join, ~1 min)'; });

// ---------- locker ----------
const lockerScene = new THREE.Scene();
lockerScene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
const lk = new THREE.DirectionalLight(0xffffff, 2); lk.position.set(2, 3, 3); lockerScene.add(lk);
let lockerAv = null;
const lockerCam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
function setLockerAvatar() {
  if (lockerAv) lockerScene.remove(lockerAv.root);
  lockerAv = new Avatar({ outfit: save.outfit }, { crown: app.own });
  lockerAv.setHeld('ar', 3);
  lockerScene.add(lockerAv.root);
}
function openLocker() {
  screen('locker');
  const grid = $('outfits');
  grid.innerHTML = OUTFITS.map((o) => `<button class="outfit${o.id === save.outfit ? ' sel' : ''}" data-o="${o.id}" style="--a:${o.body};--b:${o.legs}"><i></i>${o.name}</button>`).join('');
  grid.querySelectorAll('.outfit').forEach((b) => b.onclick = () => { save.outfit = b.dataset.o; persist(); openLocker(); });
  setLockerAvatar();
}
$('lockerBack').onclick = () => { screen('title'); };

// ---------- settings ----------
function openSettings() {
  screen('settings');
  $('sens').value = save.sens; $('vol').value = save.vol; $('quality').value = save.quality;
}
$('sens').oninput = () => { save.sens = +$('sens').value; persist(); };
$('vol').oninput = () => { save.vol = +$('vol').value; setVolume(save.vol); persist(); };
$('quality').onchange = () => { save.quality = $('quality').value; persist(); location.reload(); };
$('settingsBack').onclick = () => screen(app.game ? 'hud' : 'title');

// ---------- solo ----------
function startSolo() {
  const s = new LocalSession({ name: myName(), look: { outfit: save.outfit }, own: app.own, acct: app.acct.user ? app.acct.user.username : null, size: +qs.get('size') || undefined });
  bindSession(s);
  screen('loading');
  setTimeout(() => s.begin(), 30);
}

// ---------- online ----------
async function goOnline(opts) {
  status('Connecting to the server… (it can take a minute to wake up)');
  const s = new NetSession(serverUrl);
  try {
    await s.connect({ name: myName(), look: { outfit: save.outfit }, token: app.acct.token || undefined, mode: opts.mode, code: opts.code });
  } catch (e) { status(e.message, true); return; }
  status('');
  bindSession(s);
  app.own = app.own || s.own;
  reportRoom(s.lobby && s.lobby.code);
  showLobby(s.lobby);
}
// Free Period's play page shows chat friends which room you're in (their Join button opens ?join=CODE). Nothing when the
// game runs on its own.
function reportRoom(code) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ type: 'fp:room', room: code || null }, location.origin); } catch { /* not framed by Free Period */ }
}
function showLobby(m) {
  if (!m) return;
  if (app.game) return;
  screen('lobby');
  const s = app.session;
  $('lobbyCode').textContent = m.public ? 'Quick Play' : m.code;
  $('lobbyHint').textContent = m.public ? 'Matches start on their own. Bots fill the rest of the 20.' : 'Send this code to your friends. The host starts the match; bots fill the rest of the 20.';
  $('lobbyList').innerHTML = m.players.map((p) => `<li class="${p.own ? 'own' : ''}">${p.own ? '👑 ' : ''}${esc(p.name)}${p.id === m.host ? ' <small>host</small>' : ''}${p.playing ? ' <small>in a match</small>' : ''}${(s.meId === m.host || s.own) && p.id !== s.meId ? ` <button class="kick" data-id="${p.id}">Kick</button>` : ''}</li>`).join('');
  $('lobbyList').querySelectorAll('.kick').forEach((b) => b.onclick = () => s.kick(+b.dataset.id));
  const canStart = !m.public && (s.meId === m.host || s.own) && m.state === 'lobby';
  $('bStart').classList.toggle('hidden', !canStart);
  $('lobbyCount').textContent = m.state === 'match' ? 'A match is running. You\'re in the next one.' : m.startIn !== null && m.startIn !== undefined ? `Starting in ${Math.ceil(m.startIn)}s` : `${m.players.length} / 16 people`;
}
$('bStart').onclick = () => app.session && app.session.start();
$('bLeaveLobby').onclick = () => { leaveSession(); screen('title'); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function bindSession(s) {
  if (app.session && app.session !== s) app.session.close();
  app.session = s;
  s.on.lobby = (m) => showLobby(m);
  s.on.start = (m) => { endGame(); app.game = new Game(s, m); screen('hud'); if (!touch) lockPointer(); };
  s.on.ev = (e) => app.game && app.game.onEv(e);
  s.on.me = (m) => app.game && app.game.onMe(m);
  s.on.results = (r) => app.game && app.game.onResults(r);
  s.on.back = () => { endGame(); showLobby(s.lobby); };
  s.on.ann = (t) => app.game && hud.announce(t, '', 4000);
  s.on.close = () => { if (app.session === s) { reportRoom(null); endGame(); screen('title'); status('Lost the connection to the server.', true); } };
  s.on.err = (msg) => status(msg, true);
}
function leaveSession() { if (app.session && app.session.online) reportRoom(null); if (app.session) app.session.close(); app.session = null; endGame(); }
function endGame() { if (app.game) app.game.dispose(); app.game = null; app.paused = false; $('pause').classList.add('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }

// ---------- pause ----------
function showPause(on) {
  app.paused = on;
  $('pause').classList.toggle('hidden', !on);
  $('bAdmin').classList.toggle('hidden', !(app.game && app.game.own));
}
$('bResume').onclick = () => { showPause(false); if (!touch) lockPointer(); };
$('bPauseSettings').onclick = () => { showPause(false); openSettings(); };
$('bLeave').onclick = () => { showPause(false); const online = app.session && app.session.online; leaveSession(); screen('title'); if (online) status(''); };
$('bAdmin').onclick = () => { showPause(false); app.game && app.game.toggleAdmin(true); };

// ---------- the match on screen ----------
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpS = {};
const PIECES = ['wall', 'floor', 'ramp', 'cone'];

class Game {
  constructor(s, start) {
    this.s = s; this.meId = start.me;
    this.online = s.online;
    this.own = app.own || !!s.own;
    this.world = new World(map);
    this.info = new Map(start.full.players.map((p) => [p.id, p]));
    this.blimpPath = start.full.blimp;
    this.me = { inv: [null, null, null, null, null], slot: 0, ammo: {}, mats: [0, 0, 0], hp: 100, sh: 0, kills: 0, alive: true };
    for (const k of Object.keys(AMMO)) this.me.ammo[k] = 0;
    this.body = null; this.yaw = 0; this.pitch = -0.2; this.slot = 0;
    this.buildMode = false; this.piece = 'wall'; this.mat = 0; this.editing = null;
    this.nextFire = 0; this.nextAxe = 0; this.nextBuild = 0; this.lastBuildKey = '';
    this.avatars = new Map(); this.pieceMeshes = new Map(); this.lootViews = new Map();
    this.phase = 'warmup'; this.alive = 20; this.storm = null; this.over = false; this.spec = 0; this.dead = false;
    this.t = 0; this.lootT = 0; this.stateT = 0;
    this.busy = null; this.swingT = 0; this.recoil = 0; this.spreadPx = 0;
    this.pickT = new Map();
    // world from the start message
    W.props.resetAll && W.props.resetAll();
    for (const a of start.full.pieces) this.addPiece(a);
    for (const id of start.full.gone) { this.world.gone.add(id); W.props.hide(id); }
    for (const [id, hp] of start.full.hp) this.world.propHp.set(id, hp);
    for (const a of start.full.loot) { const l = unpackLoot(a); this.lootViews.set(l.id, { l, g: null }); }
    this.blimp = blimpModel(); scene.add(this.blimp);
    this.stormMesh = makeStorm(); scene.add(this.stormMesh);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat); this.ghost.visible = false; scene.add(this.ghost); this.ghostKey = '';
    this.editTiles = new THREE.Group(); scene.add(this.editTiles);
    if (!hud) hud = new Hud(map);
    hud.marker = null;
    $('feed').innerHTML = '';
    $('admin').classList.add('hidden');
    $('death').classList.add('hidden');
    $('results').classList.add('hidden');
    this.ray = new THREE.Raycaster();
    hud.announce('BRIELLE BATTLEROYAL', this.online ? 'Online match · board the Shore Blimp' : 'Solo match · board the Shore Blimp', 3200);
  }

  dispose() {
    for (const a of this.avatars.values()) scene.remove(a.av.root), a.tag && scene.remove(a.tag);
    for (const m of this.pieceMeshes.values()) { scene.remove(m); m.geometry.dispose(); }
    for (const v of this.lootViews.values()) if (v.g) scene.remove(v.g);
    scene.remove(this.blimp, this.stormMesh, this.ghost, this.editTiles);
    loop('wind', 0); loop('storm', 0); loop('blimp', 0);
    W.props.resetAll && W.props.resetAll();
  }

  // ---- server messages ----
  onMe(m) {
    // keep our own predicted magazine counts if the server hasn't caught up (avoids flicker while firing)
    this.me = { ...this.me, ...m };
    if (m.reload) this.busy = { kind: 'reload', left: m.reload[1], total: Math.max(m.reload[1], 0.01), label: 'Reloading' };
    else if (m.heal) { const it = this.me.inv[m.heal[0] - 1]; this.busy = { kind: 'heal', left: m.heal[1], total: it && HEALS[it.k] ? HEALS[it.k].time : m.heal[1], label: it ? itemName(it) : 'Healing' }; }
    else this.busy = null;
    if (!m.alive && !this.dead) this.die();
  }

  name(id) { const p = this.info.get(id); return p ? esc(p.name) : '?'; }

  onEv(e) {
    switch (e.e) {
      case 'piece+': this.addPiece(e.p); { const pc = this.world.builds.pieces.get(e.p[0]); if (pc) sfx.place(pc.mat, this.distTo((pc.i + 0.5) * 4, (pc.j + 0.5) * 4)); } break;
      case 'piece-': for (const id of e.ids) this.removePiece(id); break;
      case 'php': { const pc = this.world.builds.pieces.get(e.id); if (pc) { if (e.by && pc.hp > e.hp + 1) sfx.chop(pc.mat, this.distTo((pc.i + 0.5) * 4, (pc.j + 0.5) * 4)); pc.hp = e.hp; if (pc.grow > 0 && pc.hp >= pc.max - 1) pc.grow = 0; } break; }
      case 'edit': { const pc = this.world.builds.pieces.get(e.id); if (pc) { this.world.builds.edit(e.id, e.v); this.refreshPiece(pc); sfx.edit(); } break; }
      case 'loot+': { const l = unpackLoot(e.l); this.lootViews.set(l.id, { l, g: null }); break; }
      case 'loot-': { const v = this.lootViews.get(e.id); if (v) { if (v.g) scene.remove(v.g); this.lootViews.delete(e.id); } break; }
      case 'loot~': { const v = this.lootViews.get(e.id); if (v && v.l.it) v.l.it.n = e.n; break; }
      case 'opened': sfx.chest(this.distTo(e.x, e.z)); fx.spark(new THREE.Vector3(e.x, e.y + 0.6, e.z), e.t === 'chest' ? 0xffd23d : 0x9aff8a, 16); break;
      case 'prop': { this.world.propHp.set(e.id, e.hp); W.props.shake(e.id); const p = map.props[e.id]; if (p) sfx.chop(PROP_MAT[p.kind] || 0, this.distTo(p.x, p.z)); break; }
      case 'prop-': { this.world.gone.add(e.id); W.props.hide(e.id); const p = map.props[e.id]; if (p) { fx.puff(new THREE.Vector3(p.x, p.y + 1.5, p.z), p.kind === 'rock' ? 0x9a9a92 : p.kind === 'car' ? 0x8a9099 : 0x6aa84f, 10, 4, 1.6, 0.8, 0); sfx.breakPiece(this.distTo(p.x, p.z)); } break; }
      case 'shot': this.onShot(e); break;
      case 'boom': { fx.explode(new THREE.Vector3(e.x, e.y, e.z), e.r); const d = this.distTo(e.x, e.z); sfx.boom(d, this.panOf(e.x, e.z)); if (d < 25) this.shake = Math.max(this.shake || 0, 0.5 * (1 - d / 25)); break; }
      case 'hit': this.onHit(e); break;
      case 'elim': this.onElim(e); break;
      case 'win': break;
      case 'jump': if (e.id === this.meId) { this.body = newBody(e.x, e.y, e.z, 'sky'); sfx.jump(); this.yaw = this.yaw || 0; } break;
      case 'tp': if (e.to === this.meId && this.body) { this.body.x = e.x; this.body.y = e.y; this.body.z = e.z; this.body.vx = this.body.vy = this.body.vz = 0; this.body.mode = 'ground'; this.body.peak = e.y; } break;
      case 'phase': if (e.ph === 'blimp') hud.announce('THE SHORE BLIMP IS LEAVING', touch ? 'Tap JUMP to drop' : 'Press Space to jump out', 3000); if (e.ph === 'play') hud.announce('THE NOR\'EASTER IS FORMING', 'Watch the map: stay inside the white circle', 3200); break;
      case 'storm': if (e.state === 'shrink') { hud.announce('THE STORM IS CLOSING IN', 'Get inside the safe zone', 2600); sfx.storm(); } break;
      case 'swing': if (e.id !== this.meId) { const a = this.avatars.get(e.id); if (a) a.swing = 0.35; } break;
      case 'reload': if (e.id === this.meId) sfx.reload(); break;
      case 'heal': if (e.id === this.meId) sfx.heal(e.k); break;
      case 'healed': if (e.id === this.meId) sfx.healed(); break;
      case 'got': if (e.id === this.meId) sfx.pickup(); break;
    }
  }

  onShot(e) {
    if (e.id === this.meId) return;
    const kind = KINDS[e.w];
    const a = this.avatars.get(e.id);
    const from = a ? a.muzzle() : new THREE.Vector3(e.o[0], e.o[1], e.o[2]);
    const d = this.distTo(from.x, from.z);
    sfx.shot(kind, d, this.panOf(from.x, from.z));
    if (a) { fx.muzzle(from); a.recoil = 0.1; }
    if (e.h) fx.tracer(from, tmpV.set(e.h[0], e.h[1], e.h[2]));
    else if (a && kind !== 'rocket') { const f = a.forward(); fx.tracer(from, tmpV.copy(from).addScaledVector(f, 60)); }
  }

  onHit(e) {
    const vic = e.v === this.meId ? this.body : this.avatars.get(e.v);
    if (e.a === this.meId && e.v !== this.meId) {
      const p = this.avatars.get(e.v);
      if (p) hud.damageNumber(p.pos.x, p.pos.y + 2.1, p.pos.z, e.d, e.sh, e.hs);
      hud.hitmarker(e.hs, false);
      sfx.hit(e.hs);
      if (e.sh) sfx.shieldHit();
    }
    if (e.v === this.meId) {
      if (e.st) return;
      sfx.hurt();
      const at = e.a && this.avatars.get(e.a);
      if (at && this.body) {
        const ang = Math.atan2(at.pos.x - this.body.x, at.pos.z - this.body.z);
        // screen angle: 0 = ahead
        hud.hurtFrom(-(ang - Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw))));
      } else hud.hurtFrom(0);
      if (e.sh && this.me.sh - e.d <= 0) sfx.shieldBreak();
    }
    if (vic && e.v !== this.meId) fx.puff(tmpV.set(vic.pos.x, vic.pos.y + 1.2, vic.pos.z), e.sh ? 0x5ad1ff : 0xff5a5a, 3, 2, 0.35, 0.3, 0);
  }

  onElim(e) {
    const how = { storm: 'was caught in the Nor\'easter', fall: 'fell too far', left: 'left the match', admin: 'was removed by the owner' }[e.w];
    const wName = WEAPONS[e.w] ? WEAPONS[e.w].name : e.w === 'pickaxe' ? 'a pickaxe' : e.w === 'grenade' ? 'a Crab Grenade' : '';
    const html = e.a ? `<b class="${e.a === this.meId ? 'me' : ''}">${this.name(e.a)}</b> eliminated <b class="${e.v === this.meId ? 'me' : ''}">${this.name(e.v)}</b>${wName ? ' <i>' + wName + '</i>' : ''}${e.hs ? ' 🎯' : ''}`
      : `<b class="${e.v === this.meId ? 'me' : ''}">${this.name(e.v)}</b> ${how || 'was eliminated'}`;
    hud.addFeed(html);
    if (e.a === this.meId && e.v !== this.meId) { sfx.elim(); hud.hitmarker(true, true); hud.announce(`ELIMINATED ${this.info.get(e.v) ? this.info.get(e.v).name.toUpperCase() : ''}`, `${this.me.kills + 1} elimination${this.me.kills ? 's' : ''}`, 1800); }
    const a = this.avatars.get(e.v);
    if (a) { fx.puff(tmpV.set(a.pos.x, a.pos.y + 1, a.pos.z), 0xffffff, 14, 4, 0.9, 0.9, 1); fx.spark(tmpV, 0x5ad1ff, 14); }
    if (e.v === this.meId) { this.killer = e.a; this.place = e.place; this.die(); }
    if (this.dead && this.spec === e.v) this.spec = 0;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    sfx.dead();
    this.buildMode = false; this.editing = null;
    $('death').classList.remove('hidden');
    $('deathTitle').textContent = `#${this.place || '?'}`;
    $('deathSub').textContent = this.killer ? `Eliminated by ${this.info.get(this.killer) ? this.info.get(this.killer).name : '?'}` : 'Eliminated';
    $('deathKills').textContent = `${this.me.kills} elimination${this.me.kills === 1 ? '' : 's'}`;
    this.spec = this.killer || 0;
    this.record(false, this.place);
  }

  record(win, place) {
    if (this.recorded) return;
    this.recorded = true;
    save.stats.matches++; save.stats.kills += this.me.kills | 0;
    if (win) save.stats.wins++;
    if (place && place <= 5) save.stats.top5++;
    persist();
  }

  onResults(r) {
    this.over = true;
    const win = r.win === this.meId;
    if (win) { this.record(true, 1); sfx.victory(); }
    setTimeout(() => {
      if (app.game !== this) return;
      if (document.pointerLockElement) document.exitPointerLock();
      $('results').classList.remove('hidden');
      $('death').classList.add('hidden');
      $('resTitle').textContent = win ? '#1 BRIELLE CHAMPION' : r.win ? `${(this.info.get(r.win) || { name: '?' }).name} WON` : 'MATCH OVER';
      $('resTitle').classList.toggle('win', win);
      $('resList').innerHTML = r.list.slice(0, 10).map((p) => `<li class="${p.id === this.meId ? 'me' : ''}"><span>#${p.place}</span>${esc(p.name)}<small>${p.kills} elim · ${p.dmg} dmg</small></li>`).join('');
      $('bAgain').textContent = this.online ? 'Back to lobby' : 'Play again';
    }, win ? 2400 : 1200);
  }

  // ---- world bits ----
  addPiece(a) {
    const old = this.pieceMeshes.get(a[0]);
    if (old) { scene.remove(old); old.geometry.dispose(); this.pieceMeshes.delete(a[0]); }
    const pc = this.world.builds.unpackAdd(a);
    this.refreshPiece(pc);
  }
  refreshPiece(pc) {
    const old = this.pieceMeshes.get(pc.id);
    if (old) { scene.remove(old); old.geometry.dispose(); }
    const { geo, pos } = pieceGeometry(pc);
    const m = new THREE.Mesh(geo, pieceMat(pc.mat));
    m.position.copy(pos); m.castShadow = !low; m.receiveShadow = !low;
    m.userData.piece = pc.id;
    scene.add(m);
    this.pieceMeshes.set(pc.id, m);
  }
  removePiece(id) {
    const pc = this.world.builds.pieces.get(id);
    const m = this.pieceMeshes.get(id);
    if (m) { fx.shatter(m.position, pc ? pc.mat : 0, 8); sfx.breakPiece(this.distTo(m.position.x, m.position.z)); scene.remove(m); m.geometry.dispose(); this.pieceMeshes.delete(id); }
    if (pc) this.world.builds.remove(id);   // (the server sends every collapsed id too)
    if (this.editing && this.editing.id === id) this.cancelEdit();
  }

  distTo(x, z) { return Math.hypot(x - camera.position.x, z - camera.position.z); }
  panOf(x, z) { const dx = x - camera.position.x, dz = z - camera.position.z; const r = Math.cos(this.yaw) * dx - Math.sin(this.yaw) * dz; return Math.max(-1, Math.min(1, r / (Math.hypot(dx, dz) + 1))); }

  // ---- controls ----
  onKey(code, e) {
    if (code === 'KeyM') return this.toggleMap(!this.mapOpen);
    if (code === 'Backquote' && this.own) return this.toggleAdmin($('admin').classList.contains('hidden'));
    if (this.dead || this.over) { if (code === 'Space' && this.dead) this.nextSpec(); return; }
    if (code === 'Space' && this.inBlimp()) { this.s.action({ k: 'jump' }); return; }
    if (!this.body) return;
    const swim = this.body.mode === 'swim';
    const slot = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, KeyF: 0 }[code];
    if (slot !== undefined) { this.selectSlot(slot); return; }
    const piece = { KeyQ: 'wall', KeyZ: 'floor', KeyX: 'ramp', KeyV: 'cone' }[code];
    if (piece && !swim) { this.cancelEdit(); this.buildMode = true; this.piece = piece; sfx.click(); return; }
    if (code === 'KeyB' && !swim) { this.cancelEdit(); this.buildMode = !this.buildMode; sfx.click(); return; }
    if (code === 'KeyT' && this.buildMode) { this.mat = (this.mat + 1) % 3; sfx.click(); return; }
    if (code === 'KeyG') { if (this.editing) this.confirmEdit(); else this.startEdit(); return; }
    if (code === 'KeyR') { this.reload(); return; }
    if (code === 'KeyE') { this.interact(); return; }
  }
  onRight() {
    if (this.editing) { this.resetEdit(); return; }
    if (this.buildMode) { this.mat = (this.mat + 1) % 3; sfx.click(); }
  }
  selectSlot(s) {
    this.cancelEdit();
    this.buildMode = false;
    if (s === this.slot) return;
    this.slot = s;
    this.s.action({ k: 'slot', s });
    this.busy = null;
    sfx.click();
  }
  reload() {
    const it = this.slot > 0 ? this.me.inv[this.slot - 1] : null;
    if (!it || !isGun(it.k) || this.buildMode) return;
    const W2 = WEAPONS[it.k];
    if (it.mag >= W2.mag || !this.me.ammo[W2.ammo]) return;
    this.s.action({ k: 'reload', s: this.slot });
  }
  inBlimp() { const e = this.myEnt(); return !!(e && (e[6] & FLAG.BLIMP)); }
  myEnt() { const L = this.s.latest; return L && L.pm ? L.pm.get(this.meId) : null; }

  toggleMap(on) {
    this.mapOpen = on;
    $('bigWrap').classList.toggle('hidden', !on);
    if (on && document.pointerLockElement) document.exitPointerLock();
    if (!on && !touch && app.game && !app.paused) lockPointer();
  }
  toggleAdmin(on) {
    $('admin').classList.toggle('hidden', !on);
    if (on && document.pointerLockElement) { this.mapOpen = true; document.exitPointerLock(); }
    if (!on) { this.mapOpen = false; if (!touch) lockPointer(); }
  }
  admin(c) { this.s.action({ k: 'admin', c }); }

  interact() {
    const p = this.nearLoot;
    if (!p) return;
    if (p.t === 'chest' || p.t === 'abox') this.s.action({ k: 'open', id: p.id });
    else this.s.action({ k: 'pick', id: p.id });
  }

  // ---- aiming helpers ----
  forward(out = new THREE.Vector3()) { const cp = Math.cos(this.pitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
  eye() { const b = this.body; return new THREE.Vector3(b.x, b.y + (b.crouch ? 1.15 : BODY.EYE), b.z); }

  /** What the crosshair ray hits: { t, kind, id, point, head } (players included). */
  aimRay(dir, max, skipPlayers) {
    const o = camera.position;
    const eye = this.eye();
    const d0 = Math.max(0, tmpV2.copy(eye).sub(o).dot(dir)) + 0.25;
    const ox = o.x + dir.x * d0, oy = o.y + dir.y * d0, oz = o.z + dir.z * d0;
    const hit = this.world.ray(ox, oy, oz, dir.x, dir.y, dir.z, max);
    let best = hit ? { t: hit.t, kind: hit.kind, id: hit.id } : { t: max, kind: null, id: 0 };
    if (!skipPlayers) for (const [id, a] of this.avatars) {
      if (id === this.meId || !a.alive || a.blimp) continue;
      const r = rayPlayer(ox, oy, oz, dir.x, dir.y, dir.z, best.t, { x: a.pos.x, y: a.pos.y, z: a.pos.z, crouch: a.crouch });
      if (r && r.t < best.t) best = { t: r.t, kind: 'player', id, head: r.head };
    }
    best.point = new THREE.Vector3(ox + dir.x * best.t, oy + dir.y * best.t, oz + dir.z * best.t);
    best.from = d0;
    return best;
  }

  fire() {
    const it = this.slot > 0 ? this.me.inv[this.slot - 1] : null;
    const now = this.t;
    if (!it) { if (this.slot === 0) this.swing(); return; }
    if (HEALS[it.k]) { if (!this.busy && mouse.clicked) this.s.action({ k: 'heal', s: this.slot }); return; }
    const W2 = WEAPONS[it.k];
    if (now < this.nextFire) return;
    if (W2.consumable) {
      if (!mouse.clicked) return;
      const aim = this.aimRay(this.forward(), 80, false);
      const e = this.eye();
      const d = aim.point.clone().sub(e).normalize(); d.y += 0.15;
      this.s.action({ k: 'fire', s: this.slot, o: [e.x, e.y, e.z], d: [d.x, d.y, d.z] });
      this.nextFire = now + 0.9;
      sfx.swing();
      return;
    }
    if (!W2.auto && !mouse.clicked) return;
    if (this.busy && this.busy.kind === 'reload' && !(W2.pellets > 1 && it.mag > 0)) return;
    if (it.mag <= 0) { if (mouse.clicked) sfx.dry(); this.reload(); return; }
    it.mag--;
    this.nextFire = now + 1 / W2.rate;
    this.busy = null;
    const e = this.eye();
    const f = this.forward();
    const moving = this.body && Math.hypot(this.body.vx, this.body.vz) > 1;
    const sp = W2.spread[this.ads ? 1 : 0] * (moving ? 1.35 : 1) * (this.body && !this.body.onGround ? 1.8 : 1) * (this.body && this.body.crouch ? 0.75 : 1) * (1 + this.recoil * 1.5);
    const muzzle = this.myAv ? this.myAv.muzzle() : e;
    sfx.shot(it.k, 0, 0);
    fx.muzzle(muzzle);
    this.recoil = Math.min(1, this.recoil + (W2.pellets > 1 ? 0.6 : it.k === 'sniper' ? 0.8 : 0.22));
    this.pitch += (W2.pellets > 1 ? 0.02 : it.k === 'sniper' ? 0.035 : 0.006);
    if (it.k === 'rocket') {
      const aim = this.aimRay(f, 400, false);
      const d = aim.point.clone().sub(e).normalize();
      this.s.action({ k: 'fire', s: this.slot, o: [e.x, e.y, e.z], d: [d.x, d.y, d.z] });
      return;
    }
    const tally = new Map();
    const n = Math.max(1, W2.pellets);
    const right = tmpV.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).clone();
    const up = new THREE.Vector3().crossVectors(right, f).normalize();
    let firstEnd = null;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sp;
      const d = f.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const hit = this.aimRay(d, W2.range, false);
      if (!firstEnd || i === 0) firstEnd = hit.point;
      if (i < 4 || n === 1) fx.tracer(muzzle, hit.point);
      if (hit.kind === 'player') { const k = 'p' + hit.id + (hit.head ? 'h' : ''); tally.set(k, (tally.get(k) || 0) + 1); fx.puff(hit.point, 0xffd0d0, 2, 2, 0.3, 0.25, 0); }
      else if (hit.kind === 'piece') { const k = 'b' + hit.id; tally.set(k, (tally.get(k) || 0) + 1); const pc = this.world.builds.pieces.get(hit.id); fx.puff(hit.point, pc && pc.mat === 1 ? 0xb07060 : pc && pc.mat === 2 ? 0xd0d8e0 : 0xc49359, 2, 2, 0.35, 0.35, -2); }
      else if (hit.kind) fx.puff(hit.point, hit.kind === 'terrain' ? 0xb8a57a : 0xdddddd, 2, 1.5, 0.35, 0.4, -1);
    }
    const h = [];
    for (const [k, c] of tally) h.push(k[0] === 'p' ? ['p', parseInt(k.slice(1), 10), k.endsWith('h') ? 1 : 0, c] : ['b', parseInt(k.slice(1), 10), 0, c]);
    this.s.action({ k: 'fire', s: this.slot, o: [e.x, e.y, e.z], d: [f.x, f.y, f.z], h });
    if (it.mag <= 0) setTimeout(() => app.game === this && this.reload(), 250);
  }

  swing() {
    if (this.t < this.nextAxe) return;
    this.nextAxe = this.t + 1 / BUILD.PICKAXE.rate;
    this.swingT = 0.35;
    sfx.swing();
    const aim = this.aimRay(this.forward(), 4.5, false);
    const eye = this.eye();
    if (!aim.kind || aim.point.distanceTo(eye) > BUILD.PICKAXE.reach + 1.4) { this.s.action({ k: 'axe', t: '' }); return; }
    if (aim.kind === 'prop') { this.s.action({ k: 'axe', t: 'r', id: aim.id }); fx.puff(aim.point, 0xc49359, 4, 3, 0.3, 0.4, -6); }
    else if (aim.kind === 'piece') { this.s.action({ k: 'axe', t: 'b', id: aim.id }); fx.puff(aim.point, 0xc49359, 3, 2, 0.3, 0.4, -6); }
    else if (aim.kind === 'player') { this.s.action({ k: 'axe', t: 'p', id: aim.id }); }
    else { this.s.action({ k: 'axe', t: '' }); fx.puff(aim.point, 0xb8a57a, 3, 2, 0.3, 0.4, -3); sfx.chop(1, 0); }
  }

  // ---- building ----
  buildSpec() {
    const b = this.body;
    return targetFor(this.piece, b.x, b.y, b.z, this.yaw, this.pitch, this.buildOffset());
  }
  /** Join the structure you're standing on or next to; otherwise start a new one at your feet. */
  buildOffset() {
    const b = this.body, L = BUILD.LEVEL;
    let best = null, bd = 7;
    this.world.builds.near(b.x - 6, b.z - 6, b.x + 6, b.z + 6, (p) => {
      const bb = bounds(p);
      const dx = Math.max(bb.x0 - b.x, 0, b.x - bb.x1), dz = Math.max(bb.z0 - b.z, 0, b.z - bb.z1), dy = Math.max(bb.y0 - b.y - 2, 0, b.y - bb.y1 - 0.5);
      const d = Math.hypot(dx, dz) + dy * 2;
      if (d < bd) { bd = d; best = p; }
    });
    return best ? (best.o || 0) : offsetFor(b.y);
  }
  updateGhost() {
    if (!this.buildMode || !this.body || this.body.mode !== 'ground' || this.dead) { this.ghost.visible = false; return; }
    const spec = this.buildSpec();
    const key = slotKey(spec) + (spec.dir || 0);
    const why = this.world.builds.check(spec);
    const ok = !why && this.me.mats[this.mat] >= BUILD.COST;
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      const { geo, pos } = pieceGeometry({ ...spec, edit: 0 });
      this.ghost.geometry.dispose(); this.ghost.geometry = geo; this.ghost.position.copy(pos);
    }
    this.ghost.material = ok ? ghostMat : ghostBad;
    this.ghost.visible = true;
    this.ghostSpec = ok ? spec : null;
    this.ghostWhy = why === 'taken' ? '' : why || (this.me.mats[this.mat] < BUILD.COST ? 'mats' : '');
  }
  place() {
    if (!this.ghostSpec || this.t < this.nextBuild) { if (mouse.clicked && this.ghostWhy === 'mats') hud.announce('', `Not enough ${BUILD.MATS[this.mat]}: harvest with the pickaxe (F)`, 1500); return; }
    const spec = this.ghostSpec;
    const key = slotKey(spec);
    if (key === this.lastBuildKey && this.t - this.lastBuildT < 0.5) return;
    this.lastBuildKey = key; this.lastBuildT = this.t;
    this.nextBuild = this.t + 0.06;
    this.s.action({ k: 'build', t: spec.t, i: spec.i, j: spec.j, lv: spec.k, o: spec.o, ax: spec.ax, dir: spec.dir, m: this.mat });
  }

  // ---- editing ----
  startEdit() {
    if (!this.body || this.dead || this.body.mode !== 'ground') return;
    const aim = this.aimRay(this.forward(), 8, true);
    if (aim.kind !== 'piece') return;
    const pc = this.world.builds.pieces.get(aim.id);
    if (!pc) return;
    if (pc.own !== this.meId && !this.own) { hud.announce('', 'You can only edit your own builds', 1200); return; }
    if (pc.t === 'cone') { hud.announce('', 'Cones can\'t be edited', 1200); return; }
    this.buildMode = false;
    this.editing = { id: pc.id, t: pc.t, sel: new Set(), dir: pc.dir, paint: null };
    for (let i = 0; i < 9; i++) if (pc.edit & (1 << i)) this.editing.sel.add(i);
    this.buildTiles(pc);
    sfx.edit();
  }
  buildTiles(pc) {
    this.editTiles.clear();
    const b = bounds(pc), C = BUILD.CELL, L = BUILD.LEVEL;
    const cam = camera.position;
    const tileMat = (on) => new THREE.MeshBasicMaterial({ color: on ? 0x1b2440 : 0x5ad1ff, transparent: true, opacity: on ? 0.55 : 0.35, depthTest: false, side: THREE.DoubleSide });
    if (pc.t === 'wall') {
      const side = pc.ax === 'x' ? (cam.z > pc.j * C ? 1 : -1) : (cam.x > pc.i * C ? 1 : -1);
      for (let row = 0; row < 3; row++) for (let colI = 0; colI < 3; colI++) {
        const i = row * 3 + colI;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(C / 3 * 0.92, L / 3 * 0.9), tileMat(this.editing.sel.has(i)));
        const y = b.y0 + (row + 0.5) * L / 3;
        if (pc.ax === 'x') { m.position.set(b.x0 + (colI + 0.5) * C / 3, y, pc.j * C + side * 0.2); }
        else { m.position.set(pc.i * C + side * 0.2, y, b.z0 + (colI + 0.5) * C / 3); m.rotation.y = Math.PI / 2; }
        m.userData.tile = i; m.renderOrder = 20; this.editTiles.add(m);
      }
    } else if (pc.t === 'floor') {
      const above = cam.y > b.y1;
      for (let q = 0; q < 4; q++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(C / 2 * 0.92, C / 2 * 0.92), tileMat(this.editing.sel.has(q)));
        m.rotation.x = -Math.PI / 2;
        m.position.set(b.x0 + ((q % 2) + 0.5) * C / 2, above ? b.y1 + 0.05 : b.y0 - 0.05, b.z0 + ((q >> 1) + 0.5) * C / 2);
        m.userData.tile = q; m.renderOrder = 20; this.editTiles.add(m);
      }
    } else if (pc.t === 'ramp') {
      const { geo, pos } = pieceGeometry({ ...pc, dir: this.editing.dir, edit: 0 });
      const m = new THREE.Mesh(geo, ghostMat); m.position.copy(pos); m.userData.tile = 0; this.editTiles.add(m);
    }
  }
  editInput() {
    const ed = this.editing; if (!ed) return;
    const pc = this.world.builds.pieces.get(ed.id);
    if (!pc) { this.cancelEdit(); return; }
    if (!mouse.l) { ed.paint = null; return; }
    if (pc.t === 'ramp') { if (mouse.clicked) { ed.dir = (ed.dir + 1) % 4; this.buildTiles(pc); sfx.edit(); } return; }
    this.ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hit = this.ray.intersectObjects(this.editTiles.children, false)[0];
    if (!hit) return;
    const i = hit.object.userData.tile;
    if (ed.paint === null) ed.paint = !ed.sel.has(i);
    const has = ed.sel.has(i);
    if (ed.paint && !has) { ed.sel.add(i); sfx.edit(); this.buildTiles(pc); }
    else if (!ed.paint && has) { ed.sel.delete(i); sfx.edit(); this.buildTiles(pc); }
  }
  confirmEdit() {
    const ed = this.editing; if (!ed) return;
    let v = 0;
    if (ed.t === 'ramp') v = ed.dir;
    else for (const i of ed.sel) v |= 1 << i;
    const full = ed.t === 'wall' ? 511 : 15;
    if (ed.t !== 'ramp' && v === full) { hud.announce('', 'Leave at least one tile', 1000); return; }
    this.s.action({ k: 'edit', id: ed.id, v });
    this.cancelEdit();
  }
  resetEdit() {
    const ed = this.editing; if (!ed) return;
    if (ed.t !== 'ramp') this.s.action({ k: 'edit', id: ed.id, v: 0 });
    this.cancelEdit();
  }
  cancelEdit() { this.editing = null; this.editTiles.clear(); }

  // ---- spectating ----
  nextSpec() {
    const L = this.s.latest; if (!L) return;
    const alive = L.p.filter((e) => e[6] & FLAG.ALIVE && e[0] !== this.meId).map((e) => e[0]);
    if (!alive.length) return;
    const i = alive.indexOf(this.spec);
    this.spec = alive[(i + 1) % alive.length];
  }

  // ---- every frame ----
  update(dt) {
    this.t += dt;
    this.dt = dt;
    const s = this.s;
    s.update(dt);
    const L = s.latest;
    if (L) {
      this.phase = L.ph; this.alive = L.al;
      const st = L.st;
      this.storm = { x: st[0], z: st[1], r: st[2], nx: st[3], nz: st[4], nr: st[5], i: st[6], state: st[7], left: st[8] };
      this.warmLeft = L.ph === 'warmup' ? (L.wu || 6) - L.pt : 0;
    }
    // look
    const sens = 0.0022 * save.sens * (this.scoped ? 0.3 : this.ads ? 0.6 : 1);
    this.yaw -= mouse.dx * sens; this.pitch -= mouse.dy * sens;
    if (touch) { this.yaw -= touchLook.dx * 0.006 * save.sens; this.pitch -= touchLook.dy * 0.006 * save.sens; touchLook.dx = touchLook.dy = 0; }
    mouse.dx = mouse.dy = 0;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    if (mouse.wheel && !this.dead && this.body) {
      const order = [0, 1, 2, 3, 4, 5];
      const i = order.indexOf(this.slot);
      const ns = order[(i + (mouse.wheel > 0 ? 1 : -1) + 6) % 6];
      if (!this.buildMode) this.selectSlot(ns);
      else { const pi = PIECES.indexOf(this.piece); this.piece = PIECES[(pi + (mouse.wheel > 0 ? 1 : -1) + 4) % 4]; }
      mouse.wheel = 0;
    }
    this.recoil = Math.max(0, this.recoil - dt * 2.5);
    this.swingT = Math.max(0, this.swingT - dt);
    if (this.busy) { this.busy.left -= dt; if (this.busy.left <= -0.4) this.busy = null; }

    const it = this.slot > 0 ? this.me.inv[this.slot - 1] : null;
    const alive = !this.dead && this.me.alive !== false;
    // movement
    if (this.body && alive) {
      const b = this.body;
      const k = (c) => keys.has(c);
      const inp = {
        mx: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0) + (touch ? stick.x : 0),
        mz: (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0) + (touch ? stick.y : 0),
        yaw: this.yaw, pitch: this.pitch,
        jump: k('Space') || touchBtn.jump, sprint: k('ShiftLeft') || k('ShiftRight') || (touch && Math.hypot(stick.x, stick.y) > 0.9),
        crouch: k('ControlLeft') || k('KeyC') || touchBtn.crouch, ads: this.ads,
      };
      const wasMode = b.mode;
      stepBody(this.world, b, inp, dt);
      if (wasMode === 'sky' && b.mode === 'glide') sfx.glider();
      if (wasMode !== 'ground' && b.mode === 'ground' && wasMode !== 'swim') sfx.land();
      if (b.landed > FALL.SAFE) s.action({ k: 'fall', d: b.landed });
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.stateT = s.online ? 0.05 : 0;
        s.sendState({ x: b.x, y: b.y, z: b.z, ry: this.yaw, p: this.pitch, m: b.mode, c: b.crouch, b: this.buildMode, s: this.slot });
      }
      // steps
      const sp = Math.hypot(b.vx, b.vz);
      this.stepT = (this.stepT || 0) - dt * sp;
      if (b.onGround && sp > 1 && this.stepT <= 0) { this.stepT = 2.2; sfx.step(0, b.y < 0.2); }
      loop('wind', b.mode === 'sky' ? 1 : b.mode === 'glide' ? 0.45 : 0);
    } else loop('wind', 0);
    loop('blimp', this.inBlimp() ? 1 : 0);

    // aim-down-sights / scope
    const gun = it && isGun(it.k) && !this.buildMode && !this.editing && this.body && this.body.mode === 'ground';
    this.ads = !!(gun && (mouse.r || touchBtn.ads));
    this.scoped = this.ads && it && it.k === 'sniper';

    // actions
    if (this.body && alive && !app.paused && !this.mapOpen && this.phase !== 'warmup') {
      const canAct = this.body.mode === 'ground' || ((this.body.mode === 'glide' || this.body.mode === 'sky') && false);
      if (this.editing) this.editInput();
      else if (this.buildMode) { this.updateGhost(); if ((mouse.l || touchBtn.fire) && canAct) this.place(); }
      else { this.ghost.visible = false; if ((mouse.l || touchBtn.fire) && canAct && this.body.mode !== 'swim') this.fire(); }
    } else this.ghost.visible = false;
    if (!this.buildMode) this.ghost.visible = false;
    mouse.clicked = false; touchBtn.firePressed = false;

    this.updateAvatars(dt);
    this.updateLoot(dt);
    this.updateCamera(dt);
    this.updateWorldBits(dt);

    // hud
    const e = this.myEnt();
    this.prompt = this.lootPrompt();
    this.aimPiece = null;
    if (this.body && alive && (this.buildMode || this.editing || this.slot === 0 || this.t - (this.lastAimT || 0) > 0.1)) {
      this.lastAimT = this.t;
      const aim = this.aimRay(this.forward(), 12, true);
      if (aim.kind === 'piece') { const pc = this.world.builds.pieces.get(aim.id); if (pc) this.aimPiece = pc; }
      else if (aim.kind === 'prop' && this.slot === 0 && !this.buildMode) { const p = map.props[aim.id]; if (p) this.aimPiece = { hp: this.world.propHealth(p), max: 0 || HARVEST_HP(p.kind) }; }
    }
    this.spreadPx = it && WEAPONS[it.k] && WEAPONS[it.k].spread ? WEAPONS[it.k].spread[this.ads ? 1 : 0] * 300 * (1 + this.recoil * 1.5) * (this.body && Math.hypot(this.body.vx, this.body.vz) > 1 ? 1.35 : 1) : 0;
    this.inStorm = !!(this.storm && Math.hypot(camera.position.x - this.storm.x, camera.position.z - this.storm.z) > this.storm.r && this.phase === 'play');
    loop('storm', this.inStorm ? 1 : 0);
    this.camX = this.body ? this.body.x : camera.position.x; this.camZ = this.body ? this.body.z : camera.position.z;
    this.inBlimpNow = this.inBlimp();
    hud.update(this.hudState());
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) { this.hudT = 0.1; hud.drawMinimap(this.hudState()); if (this.mapOpen) hud.drawBig(this.hudState()); }
  }

  hudState() {
    return Object.assign(this._hs || (this._hs = {}), {
      me: this.me, slot: this.slot, buildMode: this.buildMode, piece: this.piece, mat: this.mat, busy: this.busy, alive: this.alive,
      storm: this.storm, phase: this.phase, warmLeft: this.warmLeft, inBlimp: this.inBlimpNow, prompt: this.prompt, aimPiece: this.aimPiece,
      spreadPx: this.spreadPx, scoped: this.scoped, inStorm: this.inStorm, dt: this.dt, camX: this.camX, camZ: this.camZ, yaw: this.yaw,
      blimpPath: this.blimpPath, flying: !!(this.body && (this.body.mode === 'sky' || this.body.mode === 'glide')), project: (x, y, z) => project(x, y, z),
    });
  }

  lootPrompt() {
    this.nearLoot = null;
    if (!this.body || this.dead || this.body.mode !== 'ground') return null;
    const b = this.body;
    const f = this.forward();
    let best = null, bs = Infinity;
    for (const v of this.lootViews.values()) {
      const l = v.l;
      const dx = l.x - b.x, dz = l.z - b.z, d = Math.hypot(dx, dz);
      if (d > 3 || Math.abs(l.y - b.y) > 2.3) continue;
      // ammo + materials: walk over to pick up
      if ((l.t === 'ammo' || l.t === 'mats') && d < 1.5) {
        const last = this.pickT.get(l.id) || 0;
        if (this.t - last > 0.6) { this.pickT.set(l.id, this.t); this.s.action({ k: 'pick', id: l.id }); }
        continue;
      }
      const facing = (dx * f.x + dz * f.z) / (d || 1);
      const score = d - facing * 1.2;
      if (score < bs) { bs = score; best = l; }
    }
    if (!best) return null;
    this.nearLoot = best;
    const key = touch ? 'USE' : 'E';
    if (best.t === 'chest') return { text: `${key}  Open Chest`, color: '#ffd23d' };
    if (best.t === 'abox') return { text: `${key}  Open Ammo Box`, color: '#9aff8a' };
    if (best.t === 'ammo') return { text: `${key}  ${best.n} ${AMMO[best.a].name}` };
    if (best.t === 'mats') return { text: `${key}  ${best.n} ${BUILD.MATS[best.m]}` };
    const it = best.it, r = RARITY[it.r];
    const full = this.me.inv.every(Boolean);
    return { text: `${key}  ${full && this.slot > 0 ? 'Swap for' : 'Pick up'} ${itemName(it)}${it.n > 1 ? ' x' + it.n : ''} · ${r.name}`, color: r.color };
  }

  updateAvatars(dt) {
    const L = this.s.latest;
    if (!L) return;
    const seen = new Set();
    for (const e of L.p) {
      const id = e[0];
      seen.add(id);
      let a = this.avatars.get(id);
      const info = this.info.get(id) || { name: '?', look: {} };
      if (!a) {
        const av = new Avatar(info.look, { crown: !!info.own });
        scene.add(av.root);
        a = { av, pos: new THREE.Vector3(e[1], e[2], e[3]), last: new THREE.Vector3(e[1], e[2], e[3]), speed: 0, ry: 0, alive: true, swing: 0, recoil: 0, tag: null };
        a.muzzle = () => { const h = av.arms[1].hand; const p = h.getWorldPosition(new THREE.Vector3()); return p.addScaledVector(a.forward(), 0.55); };
        a.forward = () => new THREE.Vector3(-Math.sin(a.ry) * Math.cos(a.pitch || 0), Math.sin(a.pitch || 0), -Math.cos(a.ry) * Math.cos(a.pitch || 0));
        if (id !== this.meId) { a.tag = nameTag(info.name, !!info.own); scene.add(a.tag); }
        this.avatars.set(id, a);
        if (id === this.meId) this.myAv = a;
      }
      const flags = e[6];
      a.alive = !!(flags & FLAG.ALIVE);
      a.blimp = !!(flags & FLAG.BLIMP);
      let mode = flags & FLAG.SKY ? 'sky' : flags & FLAG.GLIDE ? 'glide' : flags & FLAG.SWIM ? 'swim' : 'ground';
      let held = e[7] >= 0 ? KINDS[e[7]] : (flags & FLAG.BUILD ? '' : 'pickaxe'), rar = e[8];
      a.crouch = !!(flags & FLAG.CROUCH);
      if (id === this.meId && this.body) {
        const b = this.body;
        a.pos.set(b.x, b.y, b.z); a.ry = this.yaw; a.pitch = this.pitch; mode = b.mode; a.crouch = b.crouch;
        const it = this.slot > 0 ? this.me.inv[this.slot - 1] : null;
        held = this.buildMode || this.editing ? '' : it ? it.k : 'pickaxe'; rar = it ? it.r : 0;
        a.alive = !this.dead;
        a.blimp = false;
      } else {
        const sm = this.s.sample(id, tmpS);
        if (sm) { a.pos.set(sm.x, sm.y, sm.z); a.ry = sm.ry; a.pitch = sm.pitch; }
      }
      const moved = a.pos.distanceTo(a.last);
      a.speed = a.speed * 0.8 + (moved / Math.max(dt, 0.001)) * 0.2;
      a.last.copy(a.pos);
      const vis = a.alive && !a.blimp && !(id === this.meId && (this.scoped || this.firstPerson));
      a.av.root.visible = vis;
      if (a.tag) { a.tag.visible = vis && a.pos.distanceTo(camera.position) < 45; a.tag.position.set(a.pos.x, a.pos.y + 2.35, a.pos.z); }
      if (!vis) continue;
      a.av.root.position.copy(a.pos);
      a.av.root.rotation.y = a.ry;
      a.av.setHeld(held, rar);
      a.swing = Math.max(0, a.swing - dt);
      a.av.animate(dt, {
        speed: mode === 'ground' ? Math.min(8, a.speed) : 0, mode, crouch: a.crouch, aim: held && held !== 'pickaxe' && isGun(held), pitch: a.pitch,
        swing: id === this.meId ? this.swingT / 0.35 : a.swing / 0.35, build: held === '', holding: !!held, onGround: id === this.meId ? this.body && this.body.onGround : true,
        busy: !!(flags & FLAG.BUSY),
      });
    }
    for (const [id, a] of this.avatars) if (!seen.has(id)) { scene.remove(a.av.root); if (a.tag) scene.remove(a.tag); this.avatars.delete(id); }
  }

  updateLoot(dt) {
    this.lootT -= dt;
    const cx = camera.position.x, cz = camera.position.z;
    if (this.lootT <= 0) {
      this.lootT = 0.3;
      for (const v of this.lootViews.values()) {
        const l = v.l;
        const d = Math.hypot(l.x - cx, l.z - cz);
        const show = d < (l.t === 'chest' ? 130 : 75);
        if (show && !v.g) { v.g = lootModel(l); v.g.position.set(l.x, l.y, l.z); scene.add(v.g); }
        else if (!show && v.g) { scene.remove(v.g); v.g = null; }
      }
    }
    const bob = Math.sin(this.t * 2.5) * 0.08;
    for (const v of this.lootViews.values()) {
      if (!v.g) continue;
      if (v.g.userData.spin) { v.g.userData.spin.rotation.y += dt * 1.2; v.g.userData.spin.position.y = 0.45 + bob; }
      if (v.g.userData.spark) v.g.userData.spark.material.opacity = 0.55 + Math.sin(this.t * 4 + v.l.id) * 0.3;
    }
  }

  updateCamera(dt) {
    const L = this.s.latest;
    let focus = null, back = 3.6, right = 0.7, up = 0.45, fov = 72;
    this.firstPerson = false;
    if (this.dead || this.over) {
      if (!this.spec || !this.avatars.get(this.spec) || !this.avatars.get(this.spec).alive) this.nextSpec();
      const a = this.avatars.get(this.spec);
      if (a && a.alive) { focus = a.pos.clone(); focus.y += 1.6; this.yaw = a.ry; back = 4.5; }
      else if (this.body) focus = new THREE.Vector3(this.body.x, this.body.y + 1.6, this.body.z);
      $('specName').textContent = a ? `Spectating ${this.info.get(this.spec) ? this.info.get(this.spec).name : ''}` : '';
    } else if (this.inBlimp() && L && L.bl) {
      focus = new THREE.Vector3(L.bl[0], L.bl[2] - 4, L.bl[1]); back = 46; right = 0; up = 6;
    } else if (this.body) {
      const b = this.body;
      focus = new THREE.Vector3(b.x, b.y + (b.crouch ? 1.2 : 1.62), b.z);
      if (b.mode === 'sky') { back = 7; right = 0; up = 1.4; fov = 80; }
      else if (b.mode === 'glide') { back = 6.5; right = 0; up = 1.2; fov = 76; }
      else if (this.ads) { back = 1.7; right = 0.55; up = 0.25; fov = this.scoped ? 16 : 52; if (this.scoped) this.firstPerson = true; }
    } else if (L && L.bl) focus = new THREE.Vector3(L.bl[0], L.bl[2] - 4, L.bl[1]);
    if (!focus) return;
    const f = this.forward(new THREE.Vector3());
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = focus.clone().addScaledVector(r, right).add(new THREE.Vector3(0, up, 0)).addScaledVector(f, this.firstPerson ? 0.2 : -back);
    if (!this.firstPerson && back < 20) {
      const dir = want.clone().sub(focus); const len = dir.length(); dir.normalize();
      const hit = this.world.ray(focus.x, focus.y, focus.z, dir.x, dir.y, dir.z, len, { skipBush: true });
      if (hit) want.copy(focus).addScaledVector(dir, Math.max(0.3, hit.t - 0.3));
    }
    camera.position.copy(want);
    if (this.shake > 0) { this.shake -= dt; camera.position.x += (Math.random() - 0.5) * this.shake; camera.position.y += (Math.random() - 0.5) * this.shake; }
    camera.lookAt(want.clone().add(f));
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }
    // shadows follow the view
    sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN_DIR, 220);
  }

  updateWorldBits(dt) {
    const L = this.s.latest;
    // blimp
    if (L && L.bl) {
      this.blimp.visible = true;
      this.blimp.position.set(L.bl[0], L.bl[2] + 6, L.bl[1]);
      this.blimp.rotation.y = L.bl[4];
      for (const p of this.blimp.userData.props) p.rotation.z += dt * 20;
    } else this.blimp.visible = false;
    // storm
    if (this.storm && this.phase === 'play') {
      this.stormMesh.visible = true;
      this.stormMesh.position.set(this.storm.x, 0, this.storm.z);
      this.stormMesh.scale.set(Math.max(0.5, this.storm.r), 1, Math.max(0.5, this.storm.r));
      this.stormMesh.material.uniforms.time.value = this.t;
    } else this.stormMesh.visible = false;
    W.water.material.uniforms.time.value = this.t;
    W.props.update(dt);
    fx.update(dt, camera, this.inStorm);
    // projectiles
    if (L && L.pr) {
      this.projMeshes = this.projMeshes || new Map();
      const live = new Set();
      for (const r of L.pr) {
        live.add(r[0]);
        let m = this.projMeshes.get(r[0]);
        if (!m) { m = r[4] === 1 ? glowSprite(0xff9a3a, 1.6) : new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd9462a })); scene.add(m); this.projMeshes.set(r[0], m); }
        m.position.set(r[1], r[2], r[3]);
        if (r[4] === 1 && Math.random() < 0.6) fx.puff(m.position, 0xcccccc, 1, 0.5, 0.6, 0.7, 0.5);
      }
      for (const [id, m] of this.projMeshes) if (!live.has(id)) { scene.remove(m); this.projMeshes.delete(id); }
    }
  }
}
const PROP_MAT = { tree: 0, pine: 0, bush: 0, crate: 0, boat: 0, fence: 0, rock: 1, car: 2, dumpster: 2 };
const HARVEST_HP = (k) => ({ tree: 150, pine: 150, bush: 50, rock: 220, car: 250, boat: 200, crate: 60, dumpster: 180, fence: 60 }[k] || 100);

function nameTag(name, own) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.font = '800 28px Outfit, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(name).width + 24);
  g.fillStyle = 'rgba(10,20,40,0.55)'; g.beginPath(); g.roundRect(128 - w / 2, 4, w, 40, 12); g.fill();
  g.fillStyle = own ? '#ffd23d' : '#ffffff'; g.fillText(name, 128, 25);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(1.6, 0.3, 1);
  return s;
}

function project(x, y, z) {
  const v = tmpV.set(x, y, z).project(camera);
  if (v.z > 1) return null;
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
}

// ---------- results / death buttons ----------
$('bAgain').onclick = () => {
  $('results').classList.add('hidden');
  if (app.session && app.session.online) { endGame(); showLobby(app.session.lobby); }
  else { leaveSession(); startSolo(); }
};
$('bResHome').onclick = () => { leaveSession(); screen('title'); };
$('bSpec').onclick = () => { $('death').classList.add('hidden'); if (!touch) lockPointer(); };
$('bDeathHome').onclick = () => { leaveSession(); screen('title'); };
$('bDeathAgain').onclick = () => { if (app.session && !app.session.online) { leaveSession(); startSolo(); } else { $('death').classList.add('hidden'); } };

// big map: click = marker; owner shift-click = teleport
$('bigmap').addEventListener('click', (ev) => {
  const g = app.game; if (!g) return;
  const p = hud.bigToWorld(ev);
  if (ev.shiftKey && g.own && g.body) { g.s.action({ k: 'admin', c: 'tp', x: p.x, z: p.z }); return; }
  hud.marker = hud.marker && Math.hypot(hud.marker.x - p.x, hud.marker.z - p.z) < 15 ? null : p;
});
$('bigClose').onclick = () => app.game && app.game.toggleMap(false);

// owner panel
document.querySelectorAll('#admin [data-c]').forEach((b) => b.onclick = () => { const g = app.game; if (!g) return; g.admin(b.dataset.c); sfx.click(); });
$('adminClose').onclick = () => app.game && app.game.toggleAdmin(false);
$('annSend').onclick = () => { const t = $('annText').value.trim(); if (t && app.session && app.session.online) app.session.announce(t); else if (t) hud.announce(t, '', 3000); $('annText').value = ''; };

// ---------- touch controls ----------
const stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
const touchLook = { dx: 0, dy: 0, id: null, x: 0, y: 0 };
const touchBtn = { fire: false, jump: false, crouch: false, ads: false };
if (touch) {
  const T = $('touch');
  T.addEventListener('touchstart', (e) => {
    initAudio();
    for (const t of e.changedTouches) {
      const btn = t.target.closest && t.target.closest('[data-t]');
      if (btn) { touchAct(btn.dataset.t, true); btn.classList.add('on'); btn.dataset.tid = t.identifier; continue; }
      if (t.clientX < innerWidth * 0.4 && stick.id === null) { stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; $('stickBase').style.cssText = `left:${t.clientX - 60}px;top:${t.clientY - 60}px;display:block`; }
      else if (touchLook.id === null) { touchLook.id = t.identifier; touchLook.x = t.clientX; touchLook.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  T.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { const dx = t.clientX - stick.ox, dy = t.clientY - stick.oy, l = Math.min(1, Math.hypot(dx, dy) / 55), a = Math.atan2(dy, dx); stick.x = Math.cos(a) * l; stick.y = Math.sin(a) * l; $('stickKnob').style.transform = `translate(${stick.x * 45}px, ${stick.y * 45}px)`; }
      else if (t.identifier === touchLook.id) { touchLook.dx += t.clientX - touchLook.x; touchLook.dy += t.clientY - touchLook.y; touchLook.x = t.clientX; touchLook.y = t.clientY; }
      else { const btn = T.querySelector(`[data-tid="${t.identifier}"]`); if (btn && btn.dataset.t === 'fire') { touchLook.dx += (t.clientX - (btn._x || t.clientX)); touchLook.dy += (t.clientY - (btn._y || t.clientY)); btn._x = t.clientX; btn._y = t.clientY; } }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { stick.id = null; stick.x = stick.y = 0; $('stickBase').style.display = 'none'; $('stickKnob').style.transform = ''; }
      if (t.identifier === touchLook.id) touchLook.id = null;
      const btn = T.querySelector(`[data-tid="${t.identifier}"]`);
      if (btn) { touchAct(btn.dataset.t, false); btn.classList.remove('on'); delete btn.dataset.tid; btn._x = btn._y = undefined; }
    }
  };
  T.addEventListener('touchend', end); T.addEventListener('touchcancel', end);
}
function touchAct(a, down) {
  const g = app.game;
  if (a === 'fire') { touchBtn.fire = down; mouse.l = down; if (down) mouse.clicked = true; return; }
  if (a === 'jump') { touchBtn.jump = down; if (down && g && g.inBlimp()) g.s.action({ k: 'jump' }); return; }
  if (a === 'crouch') { touchBtn.crouch = down; return; }
  if (a === 'ads') { if (down) touchBtn.ads = !touchBtn.ads; return; }
  if (!down || !g) return;
  if (a === 'build') g.onKey('KeyB');
  else if (a === 'piece') { g.buildMode = true; g.piece = PIECES[(PIECES.indexOf(g.piece) + 1) % 4]; }
  else if (a === 'mat') g.mat = (g.mat + 1) % 3;
  else if (a === 'edit') g.onKey('KeyG');
  else if (a === 'reload') g.onKey('KeyR');
  else if (a === 'use') g.onKey('KeyE');
  else if (a === 'map') g.toggleMap(!g.mapOpen);
  else if (a === 'pause') showPause(true);
}
$('mini').addEventListener('click', () => { if (app.game) app.game.toggleMap(!app.game.mapOpen); });
$('hotbar').addEventListener('click', (e) => { const s = e.target.closest('.slot'); if (s && app.game) app.game.selectSlot(+s.dataset.s); });

// ---------- main loop ----------
let last = performance.now(), titleT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (app.game && !(app.paused && !app.session.online && false)) {
    try { app.game.update(app.paused && !app.session.online ? 0 : dt); } catch (err) { console.error('frame: ' + (err && err.stack || err)); }
    renderer.render(scene, camera);
  } else if (app.screen === 'locker' && lockerAv) {
    const w = innerWidth, h = innerHeight;
    lockerCam.aspect = w / h; lockerCam.updateProjectionMatrix();
    lockerCam.position.set(innerWidth > 700 ? 1.4 : 0, 1.2, 6.2); lockerCam.lookAt(innerWidth > 700 ? 1.4 : 0, 1.0, 0);
    lockerAv.root.rotation.y += dt * 0.6;
    lockerAv.animate(dt, { speed: 0, mode: 'ground', aim: true, pitch: 0, onGround: true });
    renderer.setClearColor(0x1c3f6e);
    renderer.render(lockerScene, lockerCam);
  } else {
    titleT += dt;
    const a = titleT * 0.04;
    camera.position.set(Math.cos(a) * 420, 150, Math.sin(a) * 420 + 60);
    camera.lookAt(0, 0, 60);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
    W.water.material.uniforms.time.value = titleT;
    sun.target.position.set(0, 0, 0); sun.position.copy(SUN_DIR).multiplyScalar(300);
    renderer.render(scene, camera);
  }
}

// ---------- boot ----------
showAccount(); showStats();
screen('title');
// A friend's Join button on Free Period: ?join=CODE goes straight into that room. Only inside Free Period's play page (same
// site, which first checks a chat friend is in that room); a bare game link with ?join= just opens the title.
{
  const joinCode = (qs.get('join') || '').trim().toUpperCase();
  let fpFramed = false;
  try { fpFramed = window.parent !== window && window.parent.location.origin === location.origin && /\/play\.html$/.test(window.parent.location.pathname); } catch { /* another site */ }
  if (fpFramed && /^[A-Z]{4}$/.test(joinCode)) { $('codeField').value = joinCode; setTimeout(() => goOnline({ mode: 'join', code: joinCode }), 300); }
}
requestAnimationFrame(frame);
window.__br = { app, save, map, camera, get game() { return app.game; }, startSolo, scene, renderer };
