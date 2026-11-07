// Close Call: game flow, input, camera, HUD and menus.
import * as THREE from 'three';
import { World } from './world.js';
import { CarSim } from './physics.js';
import { Scorer, COMBO_TIME } from './score.js';
import { Sound } from './audio.js';
import { Net } from './net.js';
import { CARS, PAINT_SWATCHES, carById } from './cars.js';
import { buildCar } from './models.js';
import { laneCenter } from './road.js';
import { trafficNear, LANE_KMH } from './traffic.js';
import { clamp, damp, fmt } from './util.js';
import { SERVER_URL } from './config.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const serverUrl = params.get('server') || SERVER_URL;
const httpUrl = serverUrl.replace(/^ws/, 'http');

// ---------------- save data ----------------
const KEY = 'closecall.v1';
let stored = {};
try { stored = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { stored = {}; }
const save = Object.assign({ cash: 0, owned: ['pocket'], car: 'pocket', paint: {}, best: 0, total: 0, name: '' }, stored);
const weak = (navigator.hardwareConcurrency || 4) <= 4 || /CrOS|Android|iPhone|iPad/.test(navigator.userAgent);
save.settings = Object.assign({ vol: 0.7, quality: weak ? 'low' : 'high', units: 'kmh', density: 1 }, stored.settings || {});
if (!save.owned.includes('pocket')) save.owned.unshift('pocket');
if (!save.owned.includes(save.car)) save.car = 'pocket';
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };
const paintOf = (id) => save.paint[id] ?? carById(id).color;

// ---------------- renderer + world ----------------
const hi = save.settings.quality === 'high';
const renderer = new THREE.WebGLRenderer({ antialias: hi, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 1.75 : 1));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 2400);
const world = new World(renderer, save.settings.quality);
const scene = world.scene;
// soft fill light riding with the camera so the car you are chasing is never a black silhouette
const fill = new THREE.PointLight(0xffffff, 14, 20, 1.4);
fill.position.set(0, 1.5, 0);
camera.add(fill);
scene.add(camera);
const sound = new Sound();
sound.volume = save.settings.vol;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------------- the player's car ----------------
let spec = carById(save.car);
const sim = new CarSim(spec);
let carMesh = null, flames = null;
const headlight = new THREE.SpotLight(0xfff0d0, 140, 120, 0.46, 0.6, 1.2);
const hlTarget = new THREE.Object3D();
const flameMat = new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

function setCarModel(s, paint) {
  if (carMesh) { scene.remove(carMesh); carMesh.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
  carMesh = buildCar(s, paint);
  carMesh.rotation.order = 'YXZ';
  carMesh.add(headlight, hlTarget);
  headlight.position.set(0, 0.75, s.body.L / 2 - 0.2);
  hlTarget.position.set(0, -0.6, 30);
  headlight.target = hlTarget;
  flames = new THREE.Group();
  for (const x of [-0.35, 0.35]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.9, 8).rotateX(-Math.PI / 2), flameMat);
    f.position.set(x, s.body.clear + 0.18, -s.body.L / 2 - 0.45);
    flames.add(f);
  }
  flames.visible = false;
  carMesh.add(flames);
  scene.add(carMesh);
}
setCarModel(spec, paintOf(spec.id));

// ---------------- game state ----------------
let mode = 'menu'; // menu | garage | mp | settings | play | pause
let net = null, mpStart = 0, autoRegroupUntil = 0;
let wt = 600; // world clock (seconds): traffic positions are a function of it
const scorer = new Scorer();
const remotes = new Map(); // player id -> { mesh, tag, car, color }
let camMode = 0, camD = 0, fov = 66, shake = 0, menuAng = 0.6, lastV = 0, aLong = 0, playTime = 0;
const MENU_SEED = 20261107;

function enterMenuWorld() {
  world.setSeed(MENU_SEED, 1);
  sim.reset(420, laneCenter(1), LANE_KMH[1] / 3.6);
}
enterMenuWorld();

// ---------------- input ----------------
const keys = new Set();
const touch = { left: false, right: false, gas: false, brake: false, nitro: false };
addEventListener('keydown', (e) => {
  sound.start();
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') pause(true);
    else if (mode === 'pause') pause(false);
    else if (mode === 'garage') closeGarage();
    else if (mode === 'mp' || mode === 'settings') show('menu');
  }
  if (e.code === 'KeyC' && mode === 'play') camMode = (camMode + 1) % 2;
  if (mode === 'garage') { if (e.code === 'ArrowLeft' || e.code === 'KeyA') browse(-1); if (e.code === 'ArrowRight' || e.code === 'KeyD') browse(1); }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (mode === 'play' && !net) pause(true); });
addEventListener('pointerdown', () => sound.start(), { capture: true });

const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
for (const [id, k] of [['t-left', 'left'], ['t-right', 'right'], ['t-gas', 'gas'], ['t-brake', 'brake'], ['t-nitro', 'nitro']]) {
  const el = $(id);
  const on = (v) => (e) => { e.preventDefault(); touch[k] = v; el.classList.toggle('on', v); };
  el.addEventListener('pointerdown', on(true)); el.addEventListener('pointerup', on(false)); el.addEventListener('pointercancel', on(false)); el.addEventListener('pointerleave', on(false));
}

function readInput() {
  const k = (...c) => c.some((x) => keys.has(x));
  const inp = {
    gas: k('KeyW', 'ArrowUp') || touch.gas,
    brake: k('KeyS', 'ArrowDown', 'Space') || touch.brake,
    steer: (k('KeyD', 'ArrowRight') || touch.right ? 1 : 0) - (k('KeyA', 'ArrowLeft') || touch.left ? 1 : 0),
    nitro: k('ShiftLeft', 'ShiftRight', 'KeyN') || touch.nitro,
  };
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p && p.connected) : null;
  if (pad) {
    const ax = pad.axes[0] || 0;
    if (Math.abs(ax) > 0.12) inp.steer = ax;
    if (pad.buttons[7]?.value > 0.1 || pad.buttons[0]?.pressed) inp.gas = true;
    if (pad.buttons[6]?.value > 0.1) inp.brake = true;
    if (pad.buttons[1]?.pressed || pad.buttons[5]?.pressed) inp.nitro = true;
  }
  return inp;
}

// ---------------- screens ----------------
const SCREENS = ['menu', 'garage', 'mp', 'settings', 'pause'];
function show(name) {
  mode = name;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  const inGame = name === 'play' || name === 'pause';
  $('hud').classList.toggle('hidden', !inGame);
  $('wallet').classList.toggle('hidden', inGame);
  $('keys').classList.toggle('hidden', name !== 'menu' || isTouch);
  $('touch').classList.toggle('hidden', !(isTouch && name === 'play'));
  if (name === 'menu') { refreshWallet(); pollOnline(); }
}
function refreshWallet() {
  $('w-cash').textContent = `$${fmt(save.cash)}`;
  $('w-best').textContent = fmt(save.best);
  $('garage-count').textContent = `${save.owned.length} / ${CARS.length} cars`;
}

$('b-solo').onclick = () => startSolo();
$('b-mp').onclick = () => { show('mp'); $('mp-name').value = save.name || `Driver${100 + Math.floor(Math.random() * 900)}`; $('mp-status').textContent = ''; $('mp-status').className = 'status'; };
$('b-garage').onclick = () => openGarage();
$('b-settings').onclick = () => { show('settings'); paintSettings(); };
$('mp-back').onclick = () => show('menu');
$('s-back').onclick = () => show('menu');
$('p-resume').onclick = () => pause(false);
$('p-quit').onclick = () => quitToMenu();
$('p-regroup').onclick = () => { regroup(); pause(false); };
for (const b of document.querySelectorAll('.btn')) b.addEventListener('click', () => sound.click());

// ---------------- settings ----------------
function paintSettings() {
  $('s-vol').value = save.settings.vol;
  for (const b of document.querySelectorAll('[data-q]')) b.classList.toggle('primary', b.dataset.q === save.settings.quality);
  for (const b of document.querySelectorAll('[data-u]')) b.classList.toggle('primary', b.dataset.u === save.settings.units);
  for (const b of document.querySelectorAll('[data-t]')) b.classList.toggle('primary', +b.dataset.t === save.settings.density);
}
$('s-vol').oninput = (e) => { save.settings.vol = +e.target.value; sound.setVolume(save.settings.vol); persist(); };
for (const b of document.querySelectorAll('[data-q]')) b.onclick = () => {
  if (save.settings.quality === b.dataset.q) return;
  save.settings.quality = b.dataset.q; persist(); paintSettings();
  $('s-note').textContent = 'Reloading to switch graphics…';
  setTimeout(() => location.reload(), 500);
};
for (const b of document.querySelectorAll('[data-u]')) b.onclick = () => { save.settings.units = b.dataset.u; persist(); paintSettings(); };
for (const b of document.querySelectorAll('[data-t]')) b.onclick = () => { save.settings.density = +b.dataset.t; persist(); paintSettings(); };

// ---------------- garage ----------------
let gIdx = 0, gPaint = 0;
function openGarage() { gIdx = Math.max(0, CARS.findIndex((c) => c.id === save.car)); gPaint = paintOf(CARS[gIdx].id); show('garage'); paintGarage(true); }
function closeGarage() { setCarModel(spec, paintOf(spec.id)); sim.setSpec(spec); show('menu'); }
function browse(dir) { gIdx = (gIdx + dir + CARS.length) % CARS.length; gPaint = paintOf(CARS[gIdx].id); paintGarage(true); }
function paintGarage(rebuild) {
  const c = CARS[gIdx];
  const owned = save.owned.includes(c.id);
  if (rebuild) setCarModel(c, gPaint); else carMesh.userData.setPaint(gPaint);
  $('g-name').textContent = c.name;
  $('g-cls').textContent = owned ? c.cls : `${c.cls} · $${fmt(c.price)}`;
  const top = save.settings.units === 'mph' ? `${Math.round(c.top * 0.6214)} mph` : `${c.top} km/h`;
  $('g-top').style.width = `${(c.top / 360) * 100}%`; $('g-topv').textContent = top;
  $('g-acc').style.width = `${(c.accel / 15) * 100}%`; $('g-accv').textContent = `${(100 / 3.6 / c.accel * 1.35).toFixed(1)}s`;
  $('g-han').style.width = `${(c.grip / 1.4) * 100}%`; $('g-hanv').textContent = `${Math.round((c.grip / 1.4) * 100)}`;
  $('g-sw').innerHTML = PAINT_SWATCHES.map((h) => `<button class="sw${h === gPaint ? ' on' : ''}" data-c="${h}" style="background:#${h.toString(16).padStart(6, '0')}" aria-label="paint"></button>`).join('');
  const act = $('g-act');
  act.disabled = false;
  if (save.car === c.id) { act.textContent = 'Selected'; act.disabled = true; }
  else if (owned) act.textContent = 'Drive this';
  else if (save.cash >= c.price) act.textContent = `Buy · $${fmt(c.price)}`;
  else { act.textContent = `Need $${fmt(c.price - save.cash)} more`; act.disabled = true; }
  $('g-count').textContent = `Car ${gIdx + 1} of ${CARS.length} · you have $${fmt(save.cash)}`;
}
$('g-prev').onclick = () => browse(-1);
$('g-next').onclick = () => browse(1);
$('g-back').onclick = () => closeGarage();
$('g-sw').onclick = (e) => {
  const b = e.target.closest('.sw'); if (!b) return;
  gPaint = +b.dataset.c;
  const c = CARS[gIdx];
  if (save.owned.includes(c.id)) { save.paint[c.id] = gPaint; persist(); }
  paintGarage(false);
};
$('g-act').onclick = () => {
  const c = CARS[gIdx];
  if (!save.owned.includes(c.id)) {
    if (save.cash < c.price) return;
    save.cash -= c.price; save.owned.push(c.id); sound.buy();
    save.paint[c.id] = gPaint;
  }
  save.car = c.id; persist();
  spec = c; sim.setSpec(c);
  if (net) net.send({ t: 'car', car: c.id, color: paintOf(c.id) });
  refreshWallet(); paintGarage(false);
};

// ---------------- starting, spawning, quitting ----------------
function freeLane(s, t) {
  const tmp = [];
  for (const L of [1, 2, 0, 3]) {
    const n = trafficNear(world.seed, world.density, t, s - 20, s + 70, tmp);
    let clear = true;
    for (let i = 0; i < n; i++) if (tmp[i].lane === L) clear = false;
    if (clear) return L;
  }
  return 1;
}
function spawn(s, v) {
  sim.reset(s, laneCenter(freeLane(s, wt)), v);
  sim.ghost = 2;
  camD = sim.d;
}
function beginPlay() {
  scorer.reset();
  setCarModel(spec, paintOf(spec.id)); sim.setSpec(spec);
  show('play');
  playTime = 0;
  $('h-hint').style.opacity = 1;
  banner('GO', '', '#ffb020');
}
function startSolo() {
  world.setSeed(Math.floor(Math.random() * 1e9), save.settings.density);
  wt = 300 + Math.random() * 3000;
  spawn(300, 100 / 3.6);
  $('h-mp').classList.add('hidden');
  $('p-regroup').classList.add('hidden');
  $('p-room').textContent = 'Solo run';
  beginPlay();
}
function pause(on) {
  if (on) { show('pause'); keys.clear(); } else show('play');
}
function quitToMenu() {
  const ev = [];
  scorer.bank(ev);
  handleEvents(ev);
  leaveNet();
  enterMenuWorld();
  setCarModel(spec, paintOf(spec.id));
  show('menu');
}

// ---------------- multiplayer ----------------
async function joinMp(how, code) {
  const name = $('mp-name').value.replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Driver';
  save.name = name; persist();
  const st = $('mp-status');
  st.className = 'status';
  st.textContent = 'Connecting… if nobody has played for a while the server takes up to a minute to wake up.';
  for (const b of ['mp-quick', 'mp-create', 'mp-join']) $(b).disabled = true;
  leaveNet();
  const n = new Net(serverUrl);
  try {
    const w = await n.connect({ name, car: spec.id, color: paintOf(spec.id), mode: how, code });
    if (mode !== 'mp') { n.close(); return; } // backed out while waiting
    net = n;
    wireNet();
    world.setSeed(w.seed, w.density);
    mpStart = w.start;
    wt = (net.serverNow() - mpStart) / 1000;
    spawn(300, 100 / 3.6);
    autoRegroupUntil = performance.now() + 4000;
    $('h-mp').classList.remove('hidden');
    $('h-code').textContent = w.code;
    $('p-regroup').classList.remove('hidden');
    $('p-room').innerHTML = w.public ? `Public room <b>${w.code}</b>` : `Room code <b>${w.code}</b> · send it to your friends`;
    beginPlay();
    if (!w.public) banner(`ROOM ${w.code}`, 'Friends join with this code', '#3de0ff');
  } catch (err) {
    st.className = 'status err';
    st.textContent = err.message;
  } finally {
    for (const b of ['mp-quick', 'mp-create', 'mp-join']) $(b).disabled = false;
  }
}
$('mp-quick').onclick = () => joinMp('quick');
$('mp-create').onclick = () => joinMp('create');
$('mp-join').onclick = () => {
  const code = $('mp-code').value.trim().toUpperCase();
  if (code.length !== 4) { $('mp-status').className = 'status err'; $('mp-status').textContent = 'Room codes are 4 letters.'; return; }
  joinMp('join', code);
};
$('mp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('mp-join').click(); });

function wireNet() {
  net.on.join = (p) => feed(`<b>${esc(p.name)}</b> joined`);
  net.on.leave = (p) => { feed(`<b>${esc(p.name)}</b> left`); dropRemote(p.id); };
  net.on.changed = (p) => dropRemote(p.id);
  net.on.ev = (p, k, pts) => {
    if (k === 'bank') feed(`<b>${esc(p.name)}</b> banked <span style="color:#6dff8a">${fmt(pts)}</span>`);
    if (k === 'lost') feed(`<b>${esc(p.name)}</b> crashed and lost ${fmt(pts)}`);
    if (k === 'split') feed(`<b>${esc(p.name)}</b> threaded the needle`);
  };
  net.on.close = () => {
    feed('Disconnected from the server. You are driving solo now.');
    banner('DISCONNECTED', 'still driving solo', '#ff8a95');
    for (const id of [...remotes.keys()]) dropRemote(id);
    net = null;
    $('p-regroup').classList.add('hidden');
  };
}
function leaveNet() {
  if (net) { net.close(); net = null; }
  for (const id of [...remotes.keys()]) dropRemote(id);
  $('h-feed').innerHTML = '';
}
function regroup() {
  if (!net) return;
  let best = null;
  const tmp = {};
  for (const p of net.players.values()) {
    const smp = net.sample(p, net.serverNow() - 150, tmp);
    if (smp && (!best || smp.s > best.s)) best = { s: smp.s, v: smp.v };
  }
  if (!best) return;
  const ev = [];
  scorer.bank(ev); handleEvents(ev);
  spawn(Math.max(60, best.s - 45), Math.max(20, best.v));
}

function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px Outfit, system-ui, sans-serif';
  const w = Math.min(240, x.measureText(text).width + 28);
  x.fillStyle = 'rgba(8,12,24,0.75)';
  x.beginPath(); x.roundRect((256 - w) / 2, 8, w, 48, 14); x.fill();
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true }));
  sp.scale.set(0.16, 0.04, 1);
  sp.renderOrder = 10;
  return sp;
}
function dropRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.mesh, r.tag);
  r.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  r.tag.material.map.dispose(); r.tag.material.dispose();
  remotes.delete(id);
}
const RS = {}, RP = {};
function updateRemotes() {
  if (!net) return;
  const ts = net.serverNow() - 180;
  for (const p of net.players.values()) {
    let r = remotes.get(p.id);
    if (!r) {
      const m = buildCar(carById(p.car), p.color);
      m.rotation.order = 'YXZ';
      r = { mesh: m, tag: nameTag(p.name) };
      remotes.set(p.id, r);
      scene.add(m, r.tag);
    }
    const smp = net.sample(p, ts, RS);
    const vis = !!smp && Math.abs(smp.s - sim.s) < 650;
    r.mesh.visible = r.tag.visible = vis;
    if (!vis) continue;
    world.road.toWorld(smp.s, smp.d, RP);
    r.mesh.position.set(RP.x, 0, RP.z);
    r.mesh.rotation.set(0, RP.h + smp.y, 0);
    r.tag.position.set(RP.x, 2.3, RP.z);
  }
}

// ---------------- HUD ----------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let popN = 0;
function pop(title, sub, color, big) {
  const el = document.createElement('div');
  el.className = 'pop';
  el.style.color = color;
  el.style.fontSize = big ? '34px' : '24px';
  el.style.marginLeft = `${((popN++ % 3) - 1) * 70}px`;
  el.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 1150);
}
function banner(title, sub, color) {
  const b = $('banner');
  b.style.color = color;
  b.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function feed(html) {
  const f = $('h-feed');
  const d = document.createElement('div'); d.innerHTML = html;
  f.prepend(d);
  while (f.children.length > 4) f.lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}
const TIER_COL = ['#ff5a3d', '#ffb020', '#ffffff'];
function handleEvents(ev) {
  for (const e of ev) {
    switch (e.type) {
      case 'near': pop(e.name, `+${fmt(e.pts)}`, TIER_COL[e.tier], e.tier === 0); sound.whoosh(e.side, e.tier); sound.near(e.tier); break;
      case 'split': pop(e.name, `+${fmt(e.pts)}`, '#3de0ff', true); sound.split(); if (net) net.send({ t: 'ev', k: 'split', p: e.pts }); break;
      case 'bank':
        save.cash += e.cash; save.total += e.pts; save.best = Math.max(save.best, e.pts); persist();
        banner(`+${fmt(e.pts)}`, `BANKED · +$${fmt(e.cash)}`, '#6dff8a'); sound.bank();
        $('h-hint').style.opacity = 0;
        if (net && e.pts >= 2000) net.send({ t: 'ev', k: 'bank', p: e.pts });
        break;
      case 'lost':
        banner(e.reason === 'crash' ? 'CRASHED' : 'COMBO LOST', `-${fmt(e.pts)} lost`, '#ff3b4e'); sound.lost();
        if (net && e.pts >= 2000) net.send({ t: 'ev', k: 'lost', p: e.pts });
        break;
    }
  }
}
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
let boardAt = 0;
function updateHud(now) {
  setText('h-run', fmt(scorer.run));
  setText('h-cash', `$${fmt(save.cash)}`);
  const live = scorer.pending > 0 || scorer.timer > 0;
  $('h-combo').classList.toggle('off', !live);
  if (live) {
    setText('h-pend', fmt(scorer.pending));
    setText('h-mult', `x${scorer.mult.toFixed(1)}`);
    setText('h-chain', `${scorer.chain} PASS${scorer.chain === 1 ? '' : 'ES'}`);
    $('h-timer').style.transform = `scaleX(${clamp(scorer.timer / COMBO_TIME, 0, 1)})`;
  }
  const mph = save.settings.units === 'mph';
  setText('h-kmh', String(Math.round(sim.v * (mph ? 2.237 : 3.6))));
  setText('h-unit', mph ? 'MPH' : 'KM/H');
  setText('h-gear', sim.v < 0.5 ? 'N' : String(sim.gear + 1));
  $('h-nitro').style.width = `${sim.nitro * 100}%`;
  if (net && now - boardAt > 250) {
    boardAt = now;
    const rows = [{ name: save.name || 'You', sc: scorer.run, pd: scorer.pending, me: true, dist: 0 }];
    const tmp = {};
    for (const p of net.players.values()) {
      const smp = net.sample(p, net.serverNow() - 180, tmp);
      rows.push({ name: p.name, sc: p.sc, pd: p.pd, dist: smp ? smp.s - sim.s : null });
    }
    rows.sort((a, b) => b.sc - a.sc);
    $('h-board').innerHTML = rows.map((r, i) => `<div class="p${r.me ? ' me' : ''}"><span>${i + 1}</span><span>${esc(r.name)}${r.pd > 0 ? ` <small style="color:#ffb020">+${fmt(r.pd)}</small>` : ''}</span><span class="dist">${r.me ? 'you' : r.dist == null ? '' : `${r.dist > 0 ? '+' : ''}${Math.round(r.dist)}m`}</span><span>${fmt(r.sc)}</span></div>`).join('');
  }
}

// ---------------- online counter on the menu ----------------
let pollTimer = 0;
async function pollOnline() {
  clearTimeout(pollTimer);
  const el = $('online');
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 70000);
    const r = await fetch(`${httpUrl}/stats`, { cache: 'no-store', signal: ctl.signal });
    clearTimeout(to);
    const s = await r.json();
    el.classList.add('up');
    el.querySelector('span').textContent = s.players ? `${s.players} driver${s.players === 1 ? '' : 's'} online now` : 'Multiplayer server is up · nobody online yet';
  } catch {
    el.classList.remove('up');
    el.querySelector('span').textContent = 'Multiplayer server is asleep or unreachable (it wakes up when you join)';
  }
  if (mode === 'menu') pollTimer = setTimeout(pollOnline, 30000);
}

// ---------------- camera ----------------
const P = {}, P2 = {};
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), look = new THREE.Vector3();
function updateCamera(dt) {
  const road = world.road;
  const kmh = sim.v * 3.6;
  road.toWorld(sim.s, sim.d, P);
  if (mode === 'menu' || mode === 'garage' || mode === 'mp' || mode === 'settings') {
    // swing back and forth along the car's left side, staying inside the left barrier
    const g = mode === 'garage';
    menuAng += dt * (g ? 0.3 : 0.16);
    const a = 1.5 + Math.sin(menuAng) * (g ? 1.1 : 0.9);
    const r = g ? 6.4 : 9;
    road.toWorld(sim.s + r * Math.cos(a), sim.d - Math.min(6.3, r * Math.sin(a)), P2);
    camera.position.set(P2.x, g ? 1.6 : 2.4, P2.z);
    look.set(P.x, g ? 0.75 : 0.7, P.z);
    // push the car to the right of the screen (menus and the garage card sit on the left)
    fwd.subVectors(look, camera.position).normalize();
    right.crossVectors(fwd, UP).normalize();
    look.addScaledVector(right, g ? -2.1 : -3.4);
    camera.lookAt(look);
    fov = damp(fov, mode === 'garage' ? 52 : 58, 4, dt);
  } else if (camMode === 0) {
    const dist = 6.3 + kmh * 0.009, h = 1.95 + kmh * 0.0026;
    camD = damp(camD, sim.d, 7, dt);
    road.toWorld(sim.s - dist, camD, P2);
    camera.position.set(P2.x, h, P2.z);
    road.toWorld(sim.s + 14, sim.d * 0.55 + camD * 0.45, P2);
    camera.lookAt(P2.x, 0.85, P2.z);
    const target = 64 + clamp((kmh - 60) / 260, 0, 1) * 22 + (sim.boosting ? 7 : 0);
    fov = damp(fov, target, 3, dt);
  } else {
    const hd = P.h + sim.yaw;
    fwd.set(Math.sin(hd), 0, Math.cos(hd));
    camera.position.set(P.x + fwd.x * 0.2, 1.0 + spec.body.H * 0.3, P.z + fwd.z * 0.2);
    camera.lookAt(P.x + fwd.x * 30, 0.9, P.z + fwd.z * 30);
    fov = damp(fov, 72 + clamp((kmh - 60) / 260, 0, 1) * 14 + (sim.boosting ? 6 : 0), 3, dt);
  }
  // shake: crashes, plus a little at very high speed
  const sk = shake * 0.35 + (mode === 'play' ? Math.max(0, kmh - 230) / 2400 : 0);
  if (sk > 0.001) { camera.position.x += (Math.random() - 0.5) * sk; camera.position.y += (Math.random() - 0.5) * sk; }
  shake = damp(shake, 0, 5, dt);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let fpsAvg = 60;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
  const now = performance.now();
  const playing = mode === 'play' || mode === 'pause';
  const frozen = mode === 'pause' && !net; // solo pauses the world; multiplayer keeps going

  if (!frozen) wt = net ? (net.serverNow() - mpStart) / 1000 : wt + dt;
  const traffic = world.updateTraffic(wt, sim.s, playing ? 0 : 0b0011);
  const n = world.trafficCount;

  if (playing && !frozen) {
    playTime += dt;
    if (mode === 'pause') sim.ghost = Math.max(sim.ghost, 0.3);
    const inp = mode === 'play' ? readInput() : { gas: false, brake: false, steer: 0, nitro: false };
    const ev = [];
    for (const e of sim.step(dt, inp, world.road, traffic, n)) {
      if (e.type === 'crash') {
        scorer.lose(ev, 'crash');
        if (!ev.length) pop('CRASH', '', '#ff3b4e', true);
        sound.crash(e.impact); shake = 1; flash();
        if (net) net.send({ t: 'ev', k: 'crash', p: 0 });
      } else if (e.type === 'wall') { scorer.scrape(); sound.wall(e.impact); shake = Math.max(shake, 0.3); if (scorer.timer > 0) pop('WALL', '-1.5s', '#ff8a95'); }
    }
    scorer.update(dt, sim, traffic, n, ev);
    handleEvents(ev);
    if (net) {
      net.sendState(sim, scorer);
      if (autoRegroupUntil && now < autoRegroupUntil && net.players.size) {
        const anySnap = [...net.players.values()].some((p) => p.snaps.length);
        if (anySnap) { regroup(); autoRegroupUntil = 0; }
      }
    }
    if (playTime > 25) $('h-hint').style.opacity = 0;
  } else if (!playing) {
    // menu: the car cruises in lane 2 with the two left lanes cleared for the camera
    sim.s += sim.v * dt; sim.d = laneCenter(1); sim.yaw = 0; sim.ghost = 0;
  }
  world.updateChunks(sim.s);

  // place the player's car
  world.road.toWorld(sim.s, sim.d, P);
  carMesh.position.set(P.x, 0, P.z);
  const acc = (sim.v - lastV) / Math.max(dt, 1e-3); lastV = sim.v;
  aLong = damp(aLong, acc, 6, dt);
  carMesh.rotation.set(clamp(-aLong * 0.0035, -0.035, 0.035), P.h + sim.yaw, sim.steer * clamp(sim.v / 70, 0, 1) * 0.045);
  carMesh.visible = !(playing && sim.ghost > 0 && Math.floor(now / 90) % 2 === 0);
  carMesh.userData.setBrake(sim.braking);
  flames.visible = sim.boosting && playing;
  if (flames.visible) for (const f of flames.children) f.scale.set(1, 1, 0.7 + Math.random() * 0.6);

  updateRemotes();
  updateCamera(dt);
  world.follow(camera);
  if (playing) updateHud(now);
  sound.engine(playing ? sim.rpm : 1800, playing ? sim.load : 0.1, playing ? sim.v : 0, mode === 'play', sim.boosting);
  renderer.render(scene, camera);
}
function flash() { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

show('menu');
renderer.setAnimationLoop(frame);

// handy for testing in the console
window.__cc = { sim, scorer, world, save, persist, get fps() { return fpsAvg; }, get mode() { return mode; }, startSolo, quitToMenu, get net() { return net; } };
