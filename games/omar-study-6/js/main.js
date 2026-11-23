// Omar Study 6: the game loop. Reads your keys, moves you (or your car), draws everyone else from the shared picture,
// and turns what you do into actions for the world (solo: in this tab, online: on the server).
import * as THREE from 'three';
import { City3D } from './scene.js';
import { makePerson, pose, setGun, lookFor, outfitLook, CarView, makeHeli, propGeo, vmat } from './models.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { Car } from './drive.js';
import { LocalSession, NetSession } from './net.js';
import { SERVER_URL } from './config.js';
import { account, refreshAccount, isOwnerAcct } from './account.js';
import { getCity, landSd } from '../shared/city.js';
import { PLAYER, F, WEAPONS, VEHICLES, VF, VK, PS, ROLE, OUTFITS } from '../shared/rules.js';
import { HEIST } from '../shared/heists.js';
import { clamp, angWrap } from '../shared/util.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const NOLOCK = Q.has('nolock'), LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const city = getCity();
const ZONES = { midtown: ['Midtown', 'Shops and apartments'], downtown: ['Downtown', 'Towers and the bank'], strip: ['The Strip', 'Hotels, clubs and the beach'], hills: ['Omar Hills', 'Quiet streets'], industrial: ['Southside Works', 'Warehouses'], docks: ['The Docks', 'Containers and piers'], park: ['Bayview Park', ''], beach: ['Sunset Beach', ''] };

// ---------------------------------------------------------------- save
const KEY = 'omarstudy.v1';
const save = Object.assign({ cash: PLAYER.START_CASH, guns: [], ammo: {}, cars: [], done: [], look: 0, name: '', set: {} }, (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })());
save.set = Object.assign({ q: (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'med', sens: 1, vol: 0.8, mus: 1, inv: 0, den: 1 }, save.set);
let dirty = false, saveT = 0;
const persist = () => { dirty = false; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };

// ---------------------------------------------------------------- the pieces
const scene = new City3D($('gl'), save.set.q), fx = new Fx(scene.scene), sfx = new Sfx();
sfx.vol = save.set.vol; sfx.music = !!save.set.mus;
let acct = account(), sess = null, inGame = false, locked = false, paused = false;
const G = {
  save, sfx, me: { hp: 100, ar: 0, heat: 0, esc: 0, cash: save.cash, veh: 0, seat: 0, guns: [0], cars: [], done: [], hs: null }, id: 0, own: false, online: false, code: '', names: new Map(),
  act: (a) => sess && sess.action(a), nameOf: (id) => (G.names.get(id) || { name: 'Player' }).name, ammoOf: (w) => (save.ammo[w] || 0) + (L.mag[w] || 0),
  unlock: () => { if (document.pointerLockElement) document.exitPointerLock(); }, relock: () => { if (inGame && !NOLOCK && !touch) $('gl').requestPointerLock?.(); },
  setLook: (n) => { save.look = n; persist(); G.act({ k: 'look', n }); },
  setting: (k, v) => { save.set[k] = v; persist(); applySettings(); },
};
const hud = new Hud(G);
function applySettings() { const s = save.set; if (scene.q !== s.q) scene.setQuality(s.q); sfx.setVol(s.vol); sfx.music = !!s.mus; }

// the local player
const L = { x: 0, y: 0, z: 0, vy: 0, vx: 0, vz: 0, ry: 0, cy: Math.PI, cp: 0.25, w: 0, mag: {}, reload: 0, fireT: 0, swing: 0, swingHit: false, aim: false, veh: 0, seat: 0, car: null, dead: false, enterT: 0, exitT: 0, hold: null, idleLook: 0, invite: 0, inviteT: 0, zone: '', stepT: 0, shotF: 0, hitT: 0, poi: null, sprint: false, gy: 0, camD: 4, lastHp: 100, hurtA: 0 };
const views = { p: new Map(), v: new Map(), n: new Map() };
const me3 = { m: null, look: -1 };
const S = { x: 0, y: 0, z: 0, a: 0, a2: 0, e: null };
const cash3 = Array.from({ length: 30 }, () => { const m = new THREE.Mesh(propGeo('cash'), vmat()); m.visible = false; scene.scene.add(m); return m; });
const headlight = new THREE.SpotLight(0xfff0d0, 0, 60, 0.55, 0.6, 1.2); scene.scene.add(headlight, headlight.target);

// ---------------------------------------------------------------- input
const keys = new Set(), pressed = new Set();
let mdx = 0, mdy = 0, fire = false, aimHeld = false, wheel = 0;
const touch = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;
const tIn = { mx: 0, mz: 0, run: false };
const blocked = () => !inGame || paused || hud.open || hud.task || hud.mapOpen;
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (!e.repeat) { keys.add(e.code); pressed.add(e.code); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); fire = aimHeld = false; });
addEventListener('mousemove', (e) => { if (locked || (NOLOCK && e.buttons)) { mdx += e.movementX; mdy += e.movementY; } });
$('gl').addEventListener('mousedown', (e) => { if (!inGame) return; sfx.start(); if (!locked && !NOLOCK) { if (!blocked()) G.relock(); return; } if (e.button === 0) fire = true; if (e.button === 2) aimHeld = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) fire = false; if (e.button === 2) aimHeld = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (!blocked()) wheel += Math.sign(e.deltaY); }, { passive: true });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === $('gl'); if (!locked && inGame && !hud.open && !hud.task && !hud.mapOpen && !NOLOCK && !touch) setPause(true); });
addEventListener('resize', () => scene.resize());
function setPause(on) { paused = on; $('pause').classList.toggle('hidden', !on); if (on) { $('p-code').textContent = G.online ? 'City code: ' + G.code : 'Solo city. Your money and cars save by themselves.'; fire = aimHeld = false; keys.clear(); } }
$('p-resume').onclick = () => { setPause(false); G.relock(); };
$('p-phone').onclick = () => { setPause(false); hud.phone(); };
$('p-quit').onclick = () => leave();

if (touch) {
  document.body.classList.add('touch');
  const st = $('stick'), knob = st.firstChild; let sid = null, lid = null, lx = 0, ly = 0;
  st.addEventListener('touchstart', (e) => { sid = e.changedTouches[0].identifier; e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) { const r = st.getBoundingClientRect(); let x = (t.clientX - r.left - 60) / 50, y = (t.clientY - r.top - 60) / 50; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } tIn.mx = x; tIn.mz = y; knob.style.transform = `translate(${x * 35}px, ${y * 35}px)`; }
      else if (t.identifier === lid) { mdx += (t.clientX - lx) * 2.2; mdy += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; tIn.mx = tIn.mz = 0; knob.style.transform = ''; } if (t.identifier === lid) lid = null; } });
  $('gl').addEventListener('touchstart', (e) => { sfx.start(); const t = e.changedTouches[0]; if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; } }, { passive: true });
  const map = { jump: 'Space', car: 'KeyF', use: 'KeyE', phone: 'Tab' };
  for (const b of document.querySelectorAll('.tb')) {
    const k = b.dataset.k;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); sfx.start(); if (k === 'fire') fire = true; else if (k === 'aim') aimHeld = !aimHeld; else if (k === 'run') tIn.run = !tIn.run; else if (k === 'gun') wheel += 1; else { keys.add(map[k]); pressed.add(map[k]); } }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); if (k === 'fire') fire = false; else if (map[k]) keys.delete(map[k]); });
  }
}

// ---------------------------------------------------------------- menus
const screens = ['loading', 'menu', 'online', 'fit', 'settings', 'help'];
function show(id) { for (const s of screens) $(s).classList.toggle('hidden', s !== id); }
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => { sfx.ui(); show('menu'); };
function whoLine() { $('who').innerHTML = acct.user ? `Signed in as <b>${acct.user.username}</b>` + (isOwnerAcct(acct) ? ' (owner)' : '') : 'Playing as a guest. Sign in on Free Period to use your name.'; }
function fitGrid() { $('fits').innerHTML = OUTFITS.map((o, k) => `<button class="fit ${save.look === k ? 'on' : ''}" data-n="${k}"><i style="background: linear-gradient(180deg, #${o.top.toString(16).padStart(6, '0')} 60%, #${o.legs.toString(16).padStart(6, '0')} 60%)"></i><span>${o.name}</span></button>`).join(''); }
$('fits').onclick = (e) => { const b = e.target.closest('.fit'); if (b) { save.look = +b.dataset.n; persist(); fitGrid(); sfx.ui(); } };
function segs() { for (const [id, k] of [['s-q', 'q'], ['s-mus', 'mus'], ['s-inv', 'inv'], ['s-den', 'den']]) for (const b of $(id).children) { b.classList.toggle('on', String(save.set[k]) === b.dataset.v); b.onclick = () => { G.setting(k, isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v); segs(); sfx.ui(); }; } $('s-sens').value = save.set.sens; $('s-vol').value = save.set.vol; }
$('s-sens').oninput = (e) => G.setting('sens', +e.target.value); $('s-vol').oninput = (e) => G.setting('vol', +e.target.value);
$('b-fit').onclick = () => { sfx.start(); sfx.ui(); fitGrid(); show('fit'); };
$('b-set').onclick = () => { sfx.start(); sfx.ui(); segs(); show('settings'); };
$('b-help').onclick = () => { sfx.start(); sfx.ui(); show('help'); };
$('b-online').onclick = () => { sfx.start(); sfx.ui(); $('i-name').value = acct.user ? acct.user.username : save.name || ''; $('i-name').disabled = !!acct.user; $('o-err').textContent = ''; show('online'); };
const hello = () => ({ name: acct.user ? acct.user.username : ($('i-name').value.trim() || save.name || 'Player'), look: save.look, token: acct.token, own: isOwnerAcct(acct), acct: acct.user ? acct.user.username : null, cash: save.cash, guns: save.guns, cars: save.cars, done: save.done, density: save.set.den });
$('b-solo').onclick = () => { sfx.start(); sfx.ui(); begin(new LocalSession(hello())); sess.begin(); };
async function goOnline(mode) {
  sfx.start(); sfx.ui();
  const h = hello(); h.mode = mode; h.code = $('i-code').value.trim().toUpperCase(); if (!acct.user) { save.name = h.name; persist(); }
  if (mode === 'join' && h.code.length !== 4) { $('o-err').textContent = 'Type the 4-letter code.'; return; }
  $('o-err').textContent = 'Connecting. A sleeping server takes up to a minute to wake.';
  const url = LOCAL && Q.get('server') ? Q.get('server') : SERVER_URL, ns = new NetSession(url);
  try { const w = await ns.connect(h); begin(ns); ns.begin(w); } catch (e) { $('o-err').textContent = e.message; }
}
$('b-quick').onclick = () => goOnline('quick'); $('b-create').onclick = () => goOnline('create'); $('b-join').onclick = () => goOnline('join');

// ---------------------------------------------------------------- a session starts and ends
function begin(s) {
  sess = s;
  s.on.start = (m) => {
    G.id = m.id; G.own = !!m.own; G.online = s.online; G.code = m.code || '';
    G.names.clear(); for (const p of m.full.roster) G.names.set(p.id, p);
    const sp = city.spawn; Object.assign(L, { x: sp.x, z: sp.z, y: 0, ry: sp.ry, cy: sp.ry, cp: 0.22, veh: 0, car: null, dead: false, w: 0, reload: 0, hold: null, invite: 0, zone: '' });
    L.mag = {}; for (const w of save.guns) loadMag(w);
    inGame = true; show(null); $('hud').classList.remove('hidden'); if (touch) $('touch').classList.remove('hidden');
    hud.fade(false); hud.feed(G.online ? 'City ' + G.code + ': ' + G.names.size + ' in town' : 'Welcome to Port Omar', 'gold');
    setTimeout(() => inGame && hud.toast(touch ? 'Tap CAR next to any car to take it. PHONE has the heists.' : 'Press F next to any car to take it. Tab opens your phone for heists.', 7), 1500);
    if (G.online) try { parent !== window && parent.postMessage({ type: 'fp:room', room: G.code }, location.origin); } catch { /* not framed */ }
    if (!touch && !NOLOCK) G.relock();
  };
  s.on.me = onMe; s.on.ev = onEvent;
  s.on.close = () => { if (inGame) { leave(); $('o-err').textContent = 'Lost the connection to the city.'; show('online'); } };
}
function leave() {
  persist(); if (sess) sess.close(); sess = null; inGame = false; setPause(false); hud.close(true); if (hud.task) hud.task.cancel();
  for (const t of ['p', 'v', 'n']) { for (const v of views[t].values()) dropView(t, v); views[t].clear(); }
  if (me3.m) { scene.scene.remove(me3.m.g); me3.m = null; me3.look = -1; }
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); G.unlock(); hud.objective(null); hud.invite(null); whoLine(); show('menu');
}
function dropView(t, v) { scene.scene.remove(t === 'v' ? v.g : v.m.g); if (t === 'v' && v.dispose) v.dispose(); }
function loadMag(w) { const W = WEAPONS[w]; if (!W || W.melee) return; const n = Math.min(W.mag, save.ammo[w] || 0); L.mag[w] = n; save.ammo[w] = (save.ammo[w] || 0) - n; }

function onMe(m) {
  const now = performance.now();
  G.me = m;
  if (m.cash !== save.cash || m.guns.length - 1 !== save.guns.length || m.cars.length !== save.cars.length) { save.cash = m.cash; save.guns = m.guns.filter((w) => w > 0); save.cars = m.cars; dirty = true; }
  for (const d of m.done) if (!save.done.includes(d)) { save.done.push(d); dirty = true; }
  if (m.veh && !L.veh && now - L.exitT > 500) {
    const r = sess.pic.v.get(m.veh), e = r && r.b;
    if (e) { L.veh = m.veh; L.seat = m.seat; L.enterT = now; L.car = m.seat === 0 ? new Car(e[1], e[2], e[3], e[4], e[5]) : null; L.cy = e[4]; L.cp = 0.2; sfx.door(); hud.zone(VEHICLES[e[1]].name, m.seat ? 'Passenger' : 'Press F to get out'); }
  } else if (!m.veh && L.veh && now - L.enterT > 600) stepOut(false);
  L.seat = m.seat;
  if (m.hp < L.lastHp) { L.hurtA = Math.min(1, L.hurtA + (L.lastHp - m.hp) / 40 + 0.25); fx.shake = Math.max(fx.shake, 0.4); }
  L.lastHp = m.hp;
  hud.me(m);
}
function stepOut(tell) {
  const c = L.car, r = sess.pic.v.get(L.veh), e = r && r.b, x = c ? c.x : e ? e[2] : L.x, z = c ? c.z : e ? e[3] : L.z, ry = c ? c.ry : e ? e[4] : L.ry, W = VEHICLES[c ? c.kind : e ? e[1] : 1].W, o = {};
  for (const s of [1, -1]) { const px = x + Math.cos(ry) * (W / 2 + 0.85) * s, pz = z - Math.sin(ry) * (W / 2 + 0.85) * s; if (!city.collide(px, pz, PLAYER.R, o, sess.pic.g) || s === -1) { L.x = o.x; L.z = o.z; break; } }
  if (tell) G.act({ k: 'exit' });
  L.veh = 0; L.car = null; L.y = 0; L.vy = 0; L.ry = ry; L.exitT = performance.now(); sfx.door(); hud.speed(null);
}

function onEvent(e) {
  const d = e.pos ? Math.hypot(e.x - L.x, e.z - L.z) : 0;
  switch (e.e) {
    case 'join': G.names.set(e.id, e); if (e.id !== G.id) hud.feed(e.name + ' came to town', 'green'); break;
    case 'leave': G.names.delete(e.id); hud.feed(e.name + ' left town'); break;
    case 'look': { const p = G.names.get(e.id); if (p) p.look = e.look; break; }
    case 'shot': if (e.by !== G.id) { fx.tracer(e.x0, e.y0 + gy(e.x0, e.z0), e.z0, e.tx, e.ty, e.tz, 0.9); fx.flash(e.x0, e.y0 + gy(e.x0, e.z0), e.z0, 0.6); sfx.shot(e.w, d); if (e.ty < 0.3) fx.puff('dust', e.tx, 0.1, e.tz, 2, 0.2, 0.5); } break;
    case 'boom': fx.boom(e.x, e.z); sfx.boom(d); if (d < 40) fx.shake = Math.max(fx.shake, 1.2 - d / 40); break;
    case 'feed': hud.feed(e.text, e.c); break;
    case 'cash': hud.cashPop(e.n, e.why); if (e.n > 0) sfx.cash(); break;
    case 'toast': hud.toast(e.text); break;
    case 'heat': if (e.lv > 0) { sfx.heat(true); if (e.lv === 1) hud.toast('The cops are onto you. Break their line of sight and hide.', 5); } else { sfx.heat(false); if (e.text) hud.toast(e.text); } break;
    case 'wasted': L.dead = true; if (hud.task) hud.task.cancel(); hud.close(true); hud.big('KNOCKED OUT', e.by ? 'by ' + e.by : 'The hospital will patch you up', 'bad', 5); sfx.fail(); setTimeout(() => hud.fade(true), 3500); break;
    case 'tp':
      L.x = e.x; L.z = e.z; L.ry = e.ry; L.cy = e.ry; L.y = 0; L.veh = 0; L.car = null; L.dead = false; hud.fade(false); hud.speed(null);
      if (e.why === 'busted') { hud.big('ARRESTED', e.fine ? 'You paid a $' + e.fine + ' fine' : 'They let you go', 'cop'); sfx.fail(); }
      break;
    case 'hurt': break;
    case 'rammed': fx.shake = Math.max(fx.shake, 0.6); sfx.crash(14); if (L.car) { const dx = L.car.x - e.x, dz = L.car.z - e.z, m = Math.hypot(dx, dz) || 1; L.car.vx += (dx / m) * 4; L.car.vz += (dz / m) * 4; } break;
    case 'punch': if (d < 25) sfx.punch(); break;
    case 'alarm': if (d < 150) { sfx.heat(true); hud.toast('The alarm is ringing!', 3); } break;
    case 'grab': sfx.glass(); break;
    case 'bought': {
      if (e.it === 'all') { for (let w = 2; w < WEAPONS.length; w++) { save.ammo[w] = (save.ammo[w] || 0) + WEAPONS[w].ammo * 2; if (!L.mag[w]) loadMag(w); } }
      else if (e.it !== 'armor' && (e.it[0] === 'w' || e.it[0] === 'a')) { const w = +e.it.slice(1), W = WEAPONS[w]; if (!W.melee) { save.ammo[w] = (save.ammo[w] || 0) + W.ammo; if (!L.mag[w]) loadMag(w); } if (e.it[0] === 'w') L.w = w; }
      sfx.cash(); dirty = true; break;
    }
    case 'invite': if (e.lead !== G.id && !G.me.hs) { L.invite = e.lead; L.inviteT = 38; hud.invite(`<b>${e.name.replace(/[<&]/g, '')}</b> is setting up <b>${HEIST[e.h].name}</b>. Press <kbd>J</kbd> to join the crew.`); sfx.heat(false); } break;
    case 'heist':
      if (e.s === 'start') { hud.big(HEIST[e.h].name.toUpperCase(), 'Follow the yellow marker', 'good'); sfx.heat(false); hud.invite(null); }
      else if (e.s === 'step') { hud.toast(e.text, 4); sfx.tick(true); }
      else if (e.s === 'done') { hud.big('JOB DONE', 'Your cut: $' + e.share.toLocaleString('en-US'), 'good', 5); sfx.win(); if (!save.done.includes(e.h)) save.done.push(e.h); dirty = true; }
      else if (e.s === 'fail') { hud.big('HEIST FAILED', e.why, 'bad', 4); sfx.fail(); if (hud.task) hud.task.cancel(); }
      break;
  }
}

// ---------------------------------------------------------------- helpers
const gy = (x, z) => city.groundY(x, z);
const o2 = { x: 0, z: 0, nx: 0, nz: 0 };
const V3 = new THREE.Vector3(), camF = new THREE.Vector3(), camR = new THREE.Vector3(), camU = new THREE.Vector3();
let cars = [], folks = [];       // things near you this frame: cars = [{ id, x, z, ry, sp, k, fl, drv, L, W, solid }], folks = [{ id, x, z, y, player }]

/** First thing a ray hits: { t, tt, id, hs } (tt: 'n' person, 'p' player, 'v' vehicle, null = wall or ground). */
function rayAll(ox, oy, oz, dx, dy, dz, max, tMin) {
  let best = city.ray(ox, oy, oz, dx, dy, dz, max, sess.pic.g), hit = { t: best, tt: null, id: 0, hs: false };
  const hd2 = dx * dx + dz * dz;
  for (const f of folks) {
    if (hd2 < 1e-6) break;
    const t = ((f.x - ox) * dx + (f.z - oz) * dz) / hd2; if (t < tMin || t > best) continue;
    const px = ox + dx * t - f.x, pz = oz + dz * t - f.z; if (px * px + pz * pz > 0.2) continue;
    const y = oy + dy * t - f.y; if (y < 0 || y > 1.86) continue;
    best = t; hit = { t, tt: f.player ? 'p' : 'n', id: f.id, hs: y > 1.47 };
  }
  for (const c of cars) {
    if (c.id === L.veh) continue;
    const s = Math.sin(c.ry), co = Math.cos(c.ry), rx = ox - c.x, rz = oz - c.z;
    const lx = rx * co - rz * s, lz = rx * s + rz * co, ldx = dx * co - dz * s, ldz = dx * s + dz * co, ly = oy - c.y;
    let t0 = tMin, t1 = best, ok = true;
    for (const [p, v, lo, hi] of [[lx, ldx, -c.W / 2, c.W / 2], [ly, dy, 0.25, c.heli ? 2.4 : 1.5], [lz, ldz, -c.L / 2, c.L / 2]]) {
      if (Math.abs(v) < 1e-7) { if (p < lo || p > hi) { ok = false; break; } continue; }
      let a = (lo - p) / v, b = (hi - p) / v; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < best) { best = t0; hit = { t: t0, tt: 'v', id: c.id, hs: false }; }
  }
  return hit;
}

function shoot(W) {
  const cam = scene.camera, o = cam.position, n = W.pellets || 1, moving = L.car ? Math.abs(L.car.sp) > 3 : Math.hypot(L.vx, L.vz) > 2;
  const spread = W.spread * (L.aim ? 0.45 : 1.25) * (moving ? 1.35 : 1) * (L.veh ? 1.4 : 1);
  cam.getWorldDirection(camF); camR.crossVectors(camF, cam.up).normalize(); camU.crossVectors(camR, camF);
  const mx = L.veh ? o.x + camF.x * (L.camD + 1) : L.x + Math.sin(L.ry) * 0.55 - Math.cos(L.ry) * -0.24, mz = L.veh ? o.z + camF.z * (L.camD + 1) : L.z + Math.cos(L.ry) * 0.55 + Math.sin(L.ry) * -0.24, my = (L.veh ? 1.2 : L.y + 1.43) + L.gy;
  const hits = new Map(); let end = null;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * spread;
    const dx = camF.x + (camR.x * Math.cos(a) + camU.x * Math.sin(a)) * r, dy = camF.y + (camR.y * Math.cos(a) + camU.y * Math.sin(a)) * r, dz = camF.z + (camR.z * Math.cos(a) + camU.z * Math.sin(a)) * r, m = Math.hypot(dx, dy, dz);
    const h = rayAll(o.x, o.y, o.z, dx / m, dy / m, dz / m, W.range + L.camD, L.camD * 0.75);
    const ex = o.x + (dx / m) * h.t, ey = o.y + (dy / m) * h.t, ez = o.z + (dz / m) * h.t;
    fx.tracer(mx, my, mz, ex, ey, ez); if (k < 3) fx.impact(ex, Math.max(ey, 0.05), ez);
    if (!end) end = [ex, ey, ez];
    if (h.tt) { const key = h.tt + h.id, q = hits.get(key) || { tt: h.tt, id: h.id, n: 0, hs: false }; q.n++; q.hs = q.hs || h.hs; hits.set(key, q); }
  }
  fx.flash(mx, my, mz, 0.75); sfx.shot(L.w, 0);
  G.act({ k: 'shot', x: +mx.toFixed(2), y: +(my - L.gy).toFixed(2), z: +mz.toFixed(2), tx: +end[0].toFixed(2), ty: +end[1].toFixed(2), tz: +end[2].toFixed(2) });
  for (const q of hits.values()) G.act({ k: 'hit', tt: q.tt, id: q.id, n: q.n, hs: q.hs ? 1 : 0 });
  if (hits.size) L.hitT = 0.12;
  L.cp -= (W.scope ? 0.03 : 0.006 + W.dmg * 0.0004) * (L.aim ? 0.6 : 1); L.shotF = 0.12;
}
function melee(W) {
  let best = null, bd = W.range + 0.4; const fxx = Math.sin(L.ry), fzz = Math.cos(L.ry);
  for (const f of folks) { const dx = f.x - L.x, dz = f.z - L.z, d = Math.hypot(dx, dz); if (d < bd && dx * fxx + dz * fzz > d * 0.5) { bd = d; best = { tt: f.player ? 'p' : 'n', id: f.id }; } }
  if (!best) for (const c of cars) { const dx = c.x - L.x, dz = c.z - L.z, d = Math.hypot(dx, dz) - c.W / 2; if (d < W.range && dx * fxx + dz * fzz > 0) { best = { tt: 'v', id: c.id }; break; } }
  if (best) { G.act({ k: 'hit', tt: best.tt, id: best.id, n: 1 }); sfx.punch(); fx.puff('hit', L.x + fxx, 1.2 + L.gy, L.z + fzz, 2, 0.2, 0.4); L.hitT = 0.12; } else sfx.swish();
}

// ---------------------------------------------------------------- the local player, each frame
function control(dt) {
  const free = !blocked() && !L.dead, k = (c) => free && keys.has(c), hit = (c) => free && pressed.has(c), sens = 0.0023 * save.set.sens;
  if (free || NOLOCK) { L.cy -= mdx * sens; L.cp = clamp(L.cp + mdy * sens * (save.set.inv ? -1 : 1), L.veh ? -0.35 : -1.2, L.veh ? 1.0 : 1.3); if (mdx || mdy) L.idleLook = 0; }
  mdx = mdy = 0; L.idleLook += dt;
  const W = WEAPONS[L.w], guns = G.me.guns || [0];
  // weapons
  if (free) {
    for (let n = 0; n < 7; n++) if (pressed.has('Digit' + (n + 1)) && guns.includes(n)) { L.w = n; L.reload = 0; sfx.ui(); }
    if (wheel) { const own = guns.slice().sort((a, b) => a - b), i = own.indexOf(L.w); L.w = own[(i + Math.sign(wheel) + own.length) % own.length]; L.reload = 0; }
  }
  wheel = 0;
  if (!guns.includes(L.w)) L.w = 0;
  L.aim = free && aimHeld && !W.melee && (!L.veh || L.seat > 0 || L.w === 2 || L.w === 3);
  L.fireT -= dt; L.swing = Math.max(0, L.swing - dt * 3.2); L.shotF = Math.max(0, L.shotF - dt); L.hitT = Math.max(0, L.hitT - dt);
  const canGun = !L.veh || L.seat > 0 || L.w === 2 || L.w === 3;
  if (L.reload > 0) { L.reload -= dt; if (L.reload <= 0) { const n = Math.min(W.mag - (L.mag[L.w] || 0), save.ammo[L.w] || 0); L.mag[L.w] = (L.mag[L.w] || 0) + n; save.ammo[L.w] -= n; dirty = true; } }
  else if (!W.melee && hit('KeyR') && (L.mag[L.w] || 0) < W.mag && (save.ammo[L.w] || 0) > 0) { L.reload = W.reload; sfx.door(); }
  if (free && fire && L.fireT <= 0 && L.reload <= 0 && !G.me.pas) {
    if (W.melee) { if (!L.veh) { L.fireT = 1 / W.rate; L.swing = 1; L.swingHit = false; } }
    else if (canGun) {
      if ((L.mag[L.w] || 0) > 0) { L.mag[L.w]--; L.fireT = 1 / W.rate; shoot(W); if (!L.mag[L.w] && (save.ammo[L.w] || 0) > 0) { L.reload = W.reload; } }
      else if ((save.ammo[L.w] || 0) > 0) L.reload = W.reload; else { L.fireT = 0.4; sfx.deny(); hud.toast('Out of ammo. Buy more at LOCK & LOAD.'); }
    }
  }
  if (W.melee && L.swing > 0 && L.swing < 0.62 && !L.swingHit) { L.swingHit = true; melee(W); }

  // getting in and out of cars
  if (hit('KeyF')) {
    if (L.veh) { if (performance.now() - L.enterT > 500) stepOut(true); }
    else { let best = null, bd = 99; for (const c of cars) { if (c.fl & VF.WRECK || c.heli) continue; const d = Math.hypot(c.x - L.x, c.z - L.z) - c.L / 2; if (d < 1.9 && d < bd) { bd = d; best = c; } } if (best) G.act({ k: 'enter', v: best.id }); }
  }
  if (hit('KeyJ') && L.invite) { G.act({ k: 'heist', s: 'join', lead: L.invite }); L.invite = 0; hud.invite(null); }
  if (L.inviteT > 0 && (L.inviteT -= dt) <= 0) { L.invite = 0; hud.invite(null); }

  const gates = sess.pic.g;
  if (L.veh && L.car) {
    const c = L.car, me = sess.pic.v.get(L.veh); if (me) c.hpFrac = me.b[7] / 100;
    c.update(dt, { gas: (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) - (touch ? tIn.mz : 0), steer: (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0) - (touch ? tIn.mx : 0), hand: k('Space') }, city, gates, cars.filter((q) => q.id !== L.veh && !q.heli), folks);
    L.x = c.x; L.z = c.z; L.ry = c.ry; L.y = 0;
    for (const b of c.bumps.splice(0)) { if (!b.t0 || 1) G.act({ k: 'bump', v: b.v, ix: +b.ix.toFixed(1), iz: +b.iz.toFixed(1), sn: +b.sn.toFixed(2) }); }
    for (const r of c.rams.splice(0)) { const key = 'r' + r.id; if ((L[key] || 0) < performance.now()) { L[key] = performance.now() + 500; G.act(r.player ? { k: 'ram', p: r.id, sp: +r.sp.toFixed(1) } : { k: 'ram', n: r.id, sp: +r.sp.toFixed(1) }); if (r.sp > 4) { sfx.punch(); fx.shake = Math.max(fx.shake, 0.3); } } }
    if (c.hit > 2.5) { sfx.crash(c.hit); fx.shake = Math.max(fx.shake, Math.min(1, c.hit / 22)); fx.puff('spark', c.x + Math.sin(c.ry) * 2, 0.6, c.z + Math.cos(c.ry) * 2, 6, 0.6, 2); }
    if (c.dmg > 20) { G.act({ k: 'vdmg', d: Math.round(c.dmg) }); c.dmg = 0; }
    if (c.slip > 4 && Math.abs(c.sp) > 5) fx.puff('white', c.x - Math.sin(c.ry) * 1.6, 0.2, c.z - Math.cos(c.ry) * 1.6, 1, 1.2, 0.4);
    if (c.wet && Math.hypot(c.vx, c.vz) > 3) fx.puff('splash', c.x, 0.1, c.z, 2, 1.5, 1);
    if (hit('KeyH')) sfx.horn();
    hud.speed(Math.abs(c.sp) * 2.237);
  } else if (L.veh) {
    const s = sess.sample('v', L.veh, S); if (s) { L.x = s.x; L.z = s.z; L.ry = s.a; }
  } else if (!L.dead) {
    let mx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0) + (free && touch ? tIn.mx : 0), mz = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0) - (free && touch ? tIn.mz : 0);
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    L.sprint = (k('ShiftLeft') || k('ShiftRight') || tIn.run) && mz > 0 && !L.aim;
    const sp = L.aim ? PLAYER.WALK * 0.75 : L.sprint ? PLAYER.RUN : PLAYER.WALK * 1.25, fxx = Math.sin(L.cy), fzz = Math.cos(L.cy);
    const tx = (fxx * mz - fzz * mx) * sp, tz = (fzz * mz + fxx * mx) * sp, acc = Math.min(1, dt * 12);
    L.vx += (tx - L.vx) * acc; L.vz += (tz - L.vz) * acc;
    let nx = L.x + L.vx * dt, nz = L.z + L.vz * dt;
    for (const c of cars) {       // do not walk through cars
      if (Math.abs(c.x - nx) > 5 || Math.abs(c.z - nz) > 5) continue;
      const r = c.W / 2 + PLAYER.R, h = c.L / 2 - c.W / 2;
      for (const j of [1, 0, -1]) { const bx = c.x + Math.sin(c.ry) * h * j, bz = c.z + Math.cos(c.ry) * h * j, dx = nx - bx, dz = nz - bz, d = Math.hypot(dx, dz); if (d < r && d > 1e-4) { nx += (dx / d) * (r - d); nz += (dz / d) * (r - d); } }
    }
    city.collide(nx, nz, PLAYER.R, o2, gates, L.y); nx = o2.x; nz = o2.z;
    const sd = landSd(nx, nz); if (sd > 4) { const gx = landSd(nx + 1, nz) - landSd(nx - 1, nz), gz = landSd(nx, nz + 1) - landSd(nx, nz - 1), g = Math.hypot(gx, gz) || 1; nx -= (gx / g) * (sd - 4); nz -= (gz / g) * (sd - 4); }
    L.x = nx; L.z = nz;
    if (hit('Space') && L.y <= 0.001) { L.vy = PLAYER.JUMP; }
    L.vy -= 16 * dt; L.y = Math.max(0, L.y + L.vy * dt); if (L.y === 0) L.vy = 0;
    const face = L.aim || fire || L.shotF > 0 || L.swing > 0 ? L.cy : m > 0.1 ? Math.atan2(L.vx, L.vz) : L.ry;
    L.ry = angWrap(L.ry + clamp(angWrap(face - L.ry), -12 * dt, 12 * dt));
    if (m > 0.1 && L.y === 0) { L.stepT -= dt * (L.sprint ? 1.6 : 1); if (L.stepT <= 0) { L.stepT = 0.36; sfx.step(); } }
  }
  L.gy += (gy(L.x, L.z) - L.gy) * Math.min(1, dt * 12);

  // tell the world
  const moving = !L.veh && Math.hypot(L.vx, L.vz) > 0.4;
  const fl = (moving ? F.MOVE : 0) | (moving && L.sprint ? F.RUN : 0) | (L.aim || L.shotF > 0 ? F.AIM : 0) | (L.y > 0.05 ? F.AIR : 0) | (L.swing > 0 ? F.MELEE : 0);
  if (!L.dead) {
    const s = { x: +L.x.toFixed(2), y: +L.y.toFixed(2), z: +L.z.toFixed(2), ry: +L.ry.toFixed(3), p: +L.cp.toFixed(3), f: fl, w: L.w };
    if (L.car) s.v = [+L.car.x.toFixed(2), +L.car.z.toFixed(2), +L.car.ry.toFixed(3), +L.car.sp.toFixed(2), +L.car.steer.toFixed(2)];
    sess.sendState(s);
  }
  interact(dt, free);
  pressed.clear();
}

// ---------------------------------------------------------------- things to use: shops, registers, heist tasks
const RING = { guns: 0xffb53d, dealer: 0x2bd4c4, jobs: 0xffd23d, rest: 0x7dea8d, outfit: 0xffffff, garage: 0x2bd4c4, snack: 0x7dea8d, rob: 0xff5a4d, respray: 0x55b6ff, drop: 0xffd23d };
const TASKTEXT = { crack: 'Crack the safe', hack: 'Hack the terminal', drill: 'Start the drill' };
function interact(dt, free) {
  const hs = G.me.hs && G.me.hs.st === 'run' ? G.me.hs : null, rings = [];
  let best = null, bd = 99;
  for (const m of city.markers) {
    const d = Math.hypot(m.x - L.x, m.z - L.z);
    let on = false, col = RING[m.kind];
    if (m.kind === 'heist' || m.kind === 'drop') { on = !!hs && (hs.ms.includes(m.id)) && !hs.got.includes(m.id) && hs.k !== 'goto'; col = 0xffd23d; if (hs && hs.k === 'goto' && hs.ms[0] === m.id) rings.push({ x: m.x, z: m.z, r: m.r, col: 0xffd23d, h: 5 }); if (hs && hs.k === 'deliver' && hs.ms[0] === m.id) rings.push({ x: m.x, z: m.z, r: m.r, col: 0xffd23d, h: 5 }); }
    else on = m.kind === 'respray' ? !!L.car : !L.veh;
    if (m.kind === 'respray' || m.kind === 'garage') { if (d < 70) rings.push({ x: m.x, z: m.z, r: m.kind === 'respray' ? 2.6 : 2, col, h: 1.2 }); }
    else if (on && d < 60 && m.kind !== 'drop') rings.push({ x: m.x, z: m.z, r: 0.7, col, h: m.kind === 'heist' ? 1.8 : 1.1 });
    if (on && d < m.r && d < bd && m.kind !== 'drop') { bd = d; best = m; }
  }
  if (hs && hs.k === 'steal' && hs.tx !== null) rings.push({ x: hs.tx, z: hs.tz, r: 3.2, col: 0xffd23d, h: 4 });
  scene.markers(rings.slice(0, 14), performance.now() / 1000);
  if (!free || L.dead) { hud.prompt('', ''); L.hold = null; return; }
  const E = keys.has('KeyE'), tap = pressed.has('KeyE');
  let nearCar = null;
  if (!L.veh) for (const c of cars) { if (c.fl & VF.WRECK || c.heli) continue; if (Math.hypot(c.x - L.x, c.z - L.z) - c.L / 2 < 1.9) { nearCar = c; break; } }
  const holdFor = (id, need, start, done, text) => {
    if (!E) { L.hold = null; return hud.prompt('E', 'Hold: ' + text, 0); }
    if (!L.hold || L.hold.id !== id) { L.hold = { id, t: 0 }; start(); }
    L.hold.t += dt; hud.prompt('E', text, L.hold.t / need);
    if (L.hold.t >= need) { done(); L.hold = null; keys.delete('KeyE'); }
  };
  if (!best) {
    L.hold = null;
    if (hs && hs.k === 'hold') return hud.prompt('', L.w < 2 ? 'Pull out a gun (keys 2 to 7)' : 'Aim at the clerk (right click)', hs.prog);
    if (nearCar) return hud.prompt('F', nearCar.fl & VF.LOCK ? VEHICLES[nearCar.k].name + ' (locked)' : (nearCar.drv ? 'Ride in the ' : nearCar.npcish ? 'Take the ' : 'Get in the ') + VEHICLES[nearCar.k].name);
    return hud.prompt('', '');
  }
  const m = best;
  switch (m.kind) {
    case 'guns': case 'dealer': hud.prompt('E', m.text); if (tap) hud.shop(m.kind); break;
    case 'garage': hud.prompt('E', 'Open your garage'); if (tap) hud.shop('garage'); break;
    case 'outfit': hud.prompt('E', m.text); if (tap) hud.shop('outfit'); break;
    case 'jobs': hud.prompt('E', m.text); if (tap) hud.phone('jobs'); break;
    case 'rest': hud.prompt('E', m.text); if (tap) { G.act({ k: 'rest' }); persist(); } break;
    case 'snack': hud.prompt('E', `${m.text} ($40)`); if (tap) G.act({ k: 'snack', m: m.id }); break;
    case 'respray': hud.prompt('E', `${m.text} ($500)`); if (tap) G.act({ k: 'respray' }); break;
    case 'rob':
      if (L.w < 2) { hud.prompt('', 'Pull out a gun to rob the register'); L.hold = null; break; }
      holdFor(m.id, m.secs, () => G.act({ k: 'rob', m: m.id, p: 'start' }), () => G.act({ k: 'rob', m: m.id, p: 'done' }), m.text);
      break;
    case 'heist': {
      if (hs.k === 'hold') { hud.prompt('', L.w < 2 ? 'Pull out a gun (keys 2 to 7)' : 'Aim at the clerk (right click)', hs.prog); break; }
      if (hs.k === 'grab') { holdFor(m.id, hs.secs, () => G.act({ k: 'heist', s: 'task', m: m.id, p: 'start' }), () => { G.act({ k: 'heist', s: 'task', m: m.id, p: 'done' }); }, hs.h === 'bank' ? 'Empty the cart' : 'Smash the case'); break; }
      hud.prompt('E', TASKTEXT[hs.game]);
      if (tap) { G.act({ k: 'heist', s: 'task', m: m.id, p: 'start' }); hud.prompt('', ''); hud.startTask(hs.game, () => G.act({ k: 'heist', s: 'task', m: m.id, p: 'done' }), () => {}); }
      break;
    }
  }
}

// ---------------------------------------------------------------- everyone else
function syncViews(dt, t) {
  const pic = sess.pic, sc = scene.scene;
  cars = []; folks = [];
  let siren = null;
  // vehicles
  for (const [id, r] of pic.v) {
    const e = r.b, K = VEHICLES[e[1]]; let v = views.v.get(id);
    if (!v) { if (K.air) { v = { g: makeHeli(), heli: true, gy: 0 }; } else { v = new CarView(e[1], e[8]); v.gy = gy(e[2], e[3]); v.smokeT = 0; } sc.add(v.g); views.v.set(id, v); }
    const mine = id === L.veh && L.car;
    let x, z, a, y = e[11];
    if (mine) { x = L.car.x; z = L.car.z; a = L.car.ry; } else { const s = sess.sample('v', id, S); x = s.x; z = s.z; a = s.a; y = s.y; }
    if (v.heli) { v.g.position.set(x, y, z); v.g.rotation.set(0.12, a, 0); v.g.userData.rotor.rotation.y += dt * 28; v.g.userData.tail.rotation.x += dt * 30; v.g.userData.beam.visible = scene.night.value > 0.3; cars.push({ id, x, z, y: y - 1.2, ry: a, sp: 0, k: e[1], fl: e[9], drv: 0, L: K.L, W: K.W, heli: true, solid: true }); if (e[9] & VF.SIREN) siren = Math.min(siren ?? 1e9, Math.hypot(x - L.x, z - L.z) * 0.6); continue; }
    v.gy += (gy(x, z) - v.gy) * Math.min(1, dt * 10);
    v.g.position.set(x, v.gy, z); v.g.rotation.y = a;
    if (mine) { v.inner.rotation.z = L.car.roll; v.inner.rotation.x = L.car.pitch; } else if (!(e[9] & VF.WRECK)) v.inner.rotation.set(0, 0, 0);
    v.setColor(e[8]); v.setDetail(!!e[10] && !(e[9] & VF.WRECK));
    if (e[9] & VF.WRECK) v.setWreck();
    v.tick(dt, mine ? L.car.sp : e[5], mine ? -L.car.steer : -e[6], !!(e[9] & VF.SIREN), mine ? L.car.braking : false, t);
    if (e[9] & VF.SIREN) siren = Math.min(siren ?? 1e9, Math.hypot(x - L.x, z - L.z));
    v.smokeT -= dt;
    if (v.smokeT <= 0) {
      const fxn = Math.sin(a) * K.L * 0.36, fzn = Math.cos(a) * K.L * 0.36;
      if (e[9] & VF.FIRE) { fx.puff('fire', x + fxn, 1.1, z + fzn, 3, 0.8, 0.6); fx.puff('smoke', x + fxn, 1.6, z + fzn, 2, 0.8, 0.6); v.smokeT = 0.05; }
      else if (e[9] & VF.WRECK) { fx.puff('smoke', x, 1.2, z, 1, 1, 0.4); v.smokeT = 0.25; }
      else if (e[7] < 35) { fx.puff(e[7] < 15 ? 'smoke' : 'white', x + fxn, 1.0, z + fzn, 1, 0.3, 0.4); v.smokeT = 0.12; } else v.smokeT = 0.3;
    }
    cars.push({ id, x, z, y: v.gy, ry: a, sp: mine ? L.car.sp : e[5], k: e[1], fl: e[9], drv: e[10], L: K.L, W: K.W, solid: !!(e[9] & VF.WRECK) || !!e[10], npcish: !(e[9] & VF.PARKED) && !e[10] && Math.abs(e[5]) > 0.5 });
  }
  for (const [id, v] of views.v) if (!pic.v.has(id)) { dropView('v', v); views.v.delete(id); }
  // people
  for (const [id, r] of pic.n) {
    const e = r.b; let v = views.n.get(id);
    if (!v) { v = { m: makePerson(lookFor(e[2], e[1])), gy: gy(e[3], e[4]) }; sc.add(v.m.g); views.n.set(id, v); }
    const s = sess.sample('n', id, S), st = e[6];
    v.gy += (gy(s.x, s.z) - v.gy) * Math.min(1, dt * 10);
    v.m.g.position.set(s.x, v.gy, s.z); v.m.g.rotation.y = s.a;
    setGun(v.m, e[7]);
    pose(v.m, st, dt, st === PS.WALK ? 1.5 : st === PS.RUN || st === PS.FLEE ? 5.4 : st === PS.FIGHT ? 2 : 0, 0);
    if (st !== PS.DEAD) folks.push({ id, x: s.x, z: s.z, y: v.gy });
  }
  for (const [id, v] of views.n) if (!pic.n.has(id)) { dropView('n', v); views.n.delete(id); }
  // other players
  const labels = [], cam = scene.camera;
  for (const [id, r] of pic.p) {
    if (id === G.id) continue;
    const e = r.b, info = G.names.get(id) || { name: 'Player', look: 0 }; let v = views.p.get(id);
    if (!v || v.look !== info.look) { if (v) dropView('p', v); v = { m: makePerson(outfitLook(info.look)), look: info.look, gy: 0, px: e[1], pz: e[3], sp: 0 }; sc.add(v.m.g); views.p.set(id, v); }
    const s = sess.sample('p', id, S), f = e[6], inCar = !!e[10];
    v.sp += (Math.hypot(s.x - v.px, s.z - v.pz) / Math.max(dt, 0.001) - v.sp) * 0.2; v.px = s.x; v.pz = s.z;
    v.gy += (gy(s.x, s.z) - v.gy) * Math.min(1, dt * 10);
    v.m.g.visible = !inCar; v.m.g.position.set(s.x, s.y + v.gy, s.z); v.m.g.rotation.y = s.a;
    setGun(v.m, e[7]);
    pose(v.m, f & F.DEAD ? PS.DEAD : f & F.AIM ? PS.AIM : PS.WALK, dt, f & F.DEAD ? 0 : Math.min(v.sp, 8), s.a2, f & F.MELEE ? 0.5 : 0);
    if (!inCar && !(f & F.DEAD)) folks.push({ id, x: s.x, z: s.z, y: s.y + v.gy, player: true });
    const d = Math.hypot(s.x - L.x, s.z - L.z);
    if (d < 70) { V3.set(s.x, s.y + v.gy + (inCar ? 2.3 : 2.05), s.z).project(cam); if (V3.z < 1 && Math.abs(V3.x) < 1 && Math.abs(V3.y) < 1) labels.push({ x: (V3.x * 0.5 + 0.5) * innerWidth, y: (-V3.y * 0.5 + 0.5) * innerHeight, text: info.name, cls: G.me.hs && G.me.hs.crew.includes(id) ? 'crew' : info.own ? 'own' : '' }); }
  }
  for (const [id, v] of views.p) if (!pic.p.has(id)) { dropView('p', v); views.p.delete(id); }
  hud.names(labels);
  // you
  if (me3.look !== save.look || !me3.m) { if (me3.m) sc.remove(me3.m.g); me3.m = makePerson(outfitLook(save.look)); me3.look = save.look; sc.add(me3.m.g); }
  const scoped = L.aim && WEAPONS[L.w].scope;
  me3.m.g.visible = !L.veh && !scoped && L.camD > 0.85; me3.m.g.position.set(L.x, L.y + L.gy, L.z); me3.m.g.rotation.y = L.ry;
  setGun(me3.m, L.w);
  pose(me3.m, L.dead ? PS.DEAD : L.aim || L.shotF > 0 ? PS.AIM : PS.WALK, dt, L.dead ? 0 : Math.hypot(L.vx, L.vz), L.cp, L.swing > 0 ? 1 - L.swing : 0);
  // cash on the ground
  cash3.forEach((m, k) => { const c = pic.k[k]; m.visible = !!c; if (c) { m.position.set(c[1], gy(c[1], c[2]) + 0.12 + Math.sin(t * 3 + k) * 0.05, c[2]); m.rotation.y = t * 2 + k; } });
  return siren;
}

// ---------------------------------------------------------------- camera
function camera(dt) {
  const cam = scene.camera, c = L.car, W = WEAPONS[L.w], scoped = L.aim && W.scope;
  if (L.veh && !blocked()) {
    const s = c ? c.sp : 0, ry = L.ry;
    if (keys.has('KeyC')) { L.cy = ry + Math.PI; L.idleLook = 0; }
    else if (L.idleLook > 1.1 && Math.abs(s) > 2 && !L.aim && !fire) { L.cy += angWrap((s < -1 ? ry + Math.PI : ry) - L.cy) * Math.min(1, dt * 3.2); L.cp += (0.2 - L.cp) * Math.min(1, dt * 2); }
  }
  const fxx = Math.sin(L.cy) * Math.cos(L.cp), fy = -Math.sin(L.cp), fzz = Math.cos(L.cy) * Math.cos(L.cp);
  const rx = -Math.cos(L.cy), rz = Math.sin(L.cy);
  let tx, ty, tz, dist, fov = 62;
  if (L.veh) { const K = VEHICLES[c ? c.kind : 1], s = c ? Math.abs(c.sp) : 0; tx = L.x; ty = 1.45 + L.gy; tz = L.z; dist = 5.2 + K.L * 0.55 + s * 0.035; fov = 62 + Math.min(16, s * 0.28); if (L.aim) { dist *= 0.75; fov = 52; } }
  else { const sh = L.aim ? 0.52 : 0.38; tx = L.x + rx * sh; ty = L.y + L.gy + 1.58; tz = L.z + rz * sh; dist = scoped ? 0.1 : L.aim ? 1.9 : 3.8; fov = scoped ? 15 : L.aim ? 50 : L.sprint ? 66 : 62; }
  if (fx.shake > 0) { tx += (Math.random() - 0.5) * fx.shake * 0.35; ty += (Math.random() - 0.5) * fx.shake * 0.35; }
  const hit = city.ray(tx, ty, tz, -fxx, -fy, -fzz, dist + 0.4, sess.pic.g), want = Math.max(0.35, Math.min(dist, hit - 0.3));
  L.camD += (want - L.camD) * (want < L.camD ? 1 : Math.min(1, dt * 7));
  cam.position.set(tx - fxx * L.camD, Math.max(0.25, ty - fy * L.camD), tz - fzz * L.camD);
  cam.lookAt(tx + fxx * 20, ty + fy * 20, tz + fzz * 20);
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 9); cam.updateProjectionMatrix(); }
  hud.cross(L.dead || blocked() ? 'none' : scoped ? 'scope' : L.veh && !L.aim && WEAPONS[L.w].melee ? 'none' : W.melee ? 'dot' : 'gun', L.hitT > 0);
}
function menuCamera(t) { const cam = scene.camera, a = t * 0.045; cam.position.set(330 + Math.cos(a) * 250, 70 + Math.sin(a * 2) * 12, -40 + Math.sin(a) * 250); cam.lookAt(250, 20, -60); if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); } }

// ---------------------------------------------------------------- the loop
let last = performance.now(), fpsT = 0, fpsN = 0, mapT = 0, zoneT = 0, dropped = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
  if (!inGame) { scene.setTime(0.71 * 1200 + t * 3); menuCamera(t); scene.update(250, -60, null, 0); scene.markers([], t); fx.update(dt); sfx.frame(dt, null, null); scene.render(); pressed.clear(); return; }
  if (pressed.has('Tab') && !hud.task && !paused) { if (hud.open) hud.close(); else hud.phone(); pressed.delete('Tab'); }
  if (pressed.has('KeyM') && !hud.task && !hud.open && !paused) { hud.mapOpen = !hud.mapOpen; $('mapv').classList.toggle('hidden', !hud.mapOpen); if (hud.mapOpen) G.unlock(); else G.relock(); }
  if (pressed.has('Escape')) { if (hud.mapOpen) { hud.mapOpen = false; $('mapv').classList.add('hidden'); G.relock(); } else if (hud.open) hud.close(); else if (NOLOCK || touch) setPause(!paused); }
  sess.update(dt);
  if (!sess) return;
  control(dt);
  const siren = syncViews(dt, t);
  camera(dt);
  const pic = sess.pic;
  scene.setTime(pic.clock);
  L.poi = L.veh ? null : city.insidePoi(L.x, L.z);
  const cp = L.poi || city.insidePoi(scene.camera.position.x, scene.camera.position.z);
  scene.update(L.x, L.z, cp ? cp.id : null, pic.g);
  // headlights on your car at night
  if (L.car && scene.night.value > 0.3 && scene.q !== 'low') { const c = L.car; headlight.intensity = 900 * scene.night.value; headlight.position.set(c.x + Math.sin(c.ry) * 1.6, 0.9, c.z + Math.cos(c.ry) * 1.6); headlight.target.position.set(c.x + Math.sin(c.ry) * 20, 0, c.z + Math.cos(c.ry) * 20); } else headlight.intensity = 0;
  fx.update(dt);
  sfx.frame(dt, L.car ? { rpm: L.car.rpm, gas: L.car.gas, slip: L.car.slip } : null, siren, L.car ? VEHICLES[L.car.kind].top > 50 : false);
  // HUD
  L.hurtA = Math.max(0, L.hurtA - dt * 0.8); hud.hurt(Math.max(L.hurtA, G.me.hp < 30 && !L.dead ? 0.35 : 0)); hud.tick(dt);
  hud.weapon(L.w, L.mag[L.w] || 0, save.ammo[L.w] || 0, L.reload > 0);
  if ((mapT -= dt) <= 0) {
    mapT = 0.05;
    const hs = G.me.hs, dots = [];
    for (const [id, r] of pic.p) if (id !== G.id) dots.push({ x: r.b[1], z: r.b[3], c: hs && hs.crew && hs.crew.includes(id) ? '#7dea8d' : '#ffffff', r: 7, edge: !!(hs && hs.crew && hs.crew.includes(id)), name: G.nameOf(id) });
    for (const c of cars) { if (c.fl & VF.COP && c.fl & VF.SIREN) dots.push({ x: c.x, z: c.z, c: Math.floor(t * 4) % 2 ? '#ff4d4d' : '#4d7dff', r: 7 }); else if (c.id === G.me.car) dots.push({ x: c.x, z: c.z, c: '#2bd4c4', r: 6, edge: true }); }
    if (G.me.heat) for (const [, r] of pic.n) if ((r.b[2] === ROLE.COP || r.b[2] === ROLE.SWAT) && r.b[6] !== PS.DEAD) dots.push({ x: r.b[3], z: r.b[4], c: '#6aa5ff', r: 4 });
    const target = hs && hs.st === 'run' && hs.tx !== null ? { x: hs.tx, z: hs.tz } : null;
    const st = { x: L.x, z: L.z, yaw: L.cy, pyaw: L.ry, dots, target, cops: G.me.heat > 0 && G.me.esc < 0.08, t, zoom: L.veh ? 0.8 : 1.15 };
    if (hud.mapOpen) hud.bigMap(st); else hud.minimap(st);
  }
  if ((zoneT -= dt) <= 0) {
    zoneT = 0.6; let z = L.x > 572 ? 'beach' : L.z > 468 ? 'docks' : null;
    if (!z) for (const s of city.slabs) if (L.x > s.x0 && L.x < s.x1 && L.z > s.z0 && L.z < s.z1) { z = s.di; break; }
    if (z && z !== L.zone) { L.zone = z; hud.zone(ZONES[z][0], ZONES[z][1]); }
    if (L.poi && L.poi.id !== L.poiSeen) { L.poiSeen = L.poi.id; const b = L.poi.blip === 'heist' && !G.me.hs; if (b) hud.toast('This place is a heist target. Start the heist from your phone (Tab).', 5); } else if (!L.poi) L.poiSeen = null;
  }
  if (dirty && (saveT -= dt) <= 0) { saveT = 2; persist(); }
  // drop the picture quality once if the computer struggles
  fpsT += dt; fpsN++;
  if (fpsT > 4) { const fps = fpsN / fpsT; fpsT = fpsN = 0; if (fps < 33 && !dropped && scene.q !== 'low' && !document.hidden) { dropped = true; G.setting('q', scene.q === 'high' ? 'med' : 'low'); hud.toast('Graphics lowered to keep the game smooth.'); } }
  scene.render();
}

// ---------------------------------------------------------------- go
whoLine(); show('menu');
refreshAccount(acct).then((a) => { acct = a; whoLine(); });
addEventListener('pagehide', persist);
requestAnimationFrame(frame);
if (Q.get('join')) { $('i-code').value = Q.get('join').toUpperCase().slice(0, 4); $('b-online').click(); setTimeout(() => $('b-join').click(), 300); }
window.__os = { G, L, scene, city, views, fx, hud, get sess() { return sess; }, keys, pressed, tp(x, z) { L.x = x; L.z = z; if (L.car) { L.car.x = x; L.car.z = z; } }, fire(on) { fire = on; }, aim(on) { aimHeld = on; }, VK };
