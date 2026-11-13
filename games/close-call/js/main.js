// Close Call: game flow, input, camera, HUD and menus.
import * as THREE from 'three';
import { World } from './world.js';
import { CarSim, REDLINE, brakeOf, singleSpeed } from './physics.js';
import { TUNE_PARTS, PART, MAX_STAGE, tuneOf, sportOf, setTune, stageCost, sportCost, tunedSpec, BOTCH, PERFECT_BACK } from './tuning.js';
import { Qte } from './qte.js';
import { Cockpit } from './cockpit.js';
import { Scorer, COMBO_TIME } from './score.js';
import { Sound } from './audio.js';
import { Net } from './net.js';
import { CARS, PAINT_SWATCHES, carById } from './cars.js';
import { buildCar } from './models.js';
import { Fx } from './fx.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { trafficNear, laneKmh, KINDS } from './traffic.js';
const KIND_IDS = KINDS.map((k) => k.id);
import { MAPS, MAP_LIST, LANE_MODES, CASH_MULT, mapById, WEATHER_GRIP } from './maps.js';
import { Weather } from './weather.js';
import { clamp, damp, fmt } from './util.js';
import { SERVER_URL } from './config.js';
import { Puffs, Wreck, blast } from './wreck.js';
import { account, accountToken, initAccount, saved, logIn, logOut, saveNow, framed } from './account.js';
import { Liquid, markLiquid, cameThroughLiquid } from './liquid.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// ?server= is a local-testing override only: on the real site it would let a link send this player's account token to
// any server (the hello message carries it), so it is honored on localhost / 127.0.0.1 alone.
const localHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const serverUrl = (localHost && params.get('server')) || SERVER_URL;
const httpUrl = serverUrl.replace(/^ws/, 'http');

// ---------------- save data ----------------
const KEY = 'closecall.v1';
const readStored = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
// lives: two lives mode on; lifeBests: best two-lives run per route; admin: the owner's switches (ignored for anyone else)
// gm: game mode (free, lives, time, zen, hard); taBests: best time attack score per route
const DEFAULTS = () => ({ cash: 0, owned: ['pocket'], car: 'pocket', paint: {}, best: 0, total: 0, name: '', route: { map: 'city', lanes: 4 }, bests: {}, lives: false, gm: null, lifeBests: {}, taBests: {}, admin: {}, tune: {} });
const stored = readStored();
const save = Object.assign(DEFAULTS(), stored);
const routeKey = (map, lanes) => `${map}-${lanes}`;
const weak = (navigator.hardwareConcurrency || 4) <= 4 || /CrOS|Android|iPhone|iPad/.test(navigator.userAgent);
// weather: 'map' (the map's own) or clear / rain / snow / fog; cam: 0 chase, 1 bonnet, 2 far chase, 3 cockpit;
// boxes: draw hitboxes; manual: manual gearbox (Q up, E down)
save.settings = Object.assign({ vol: 0.7, quality: weak ? 'low' : 'high', units: 'kmh', density: 1, weather: 'map', cam: 0, boxes: false, manual: false }, stored.settings || {});
function fixSave() {
  if (!MAPS[save.route?.map] || !LANE_MODES.includes(save.route?.lanes)) save.route = { map: 'city', lanes: 4 };
  save.settings.density = clamp(+save.settings.density || 1, 0.4, 2.4);
  if (!Array.isArray(save.owned)) save.owned = ['pocket'];
  save.owned = save.owned.filter((id) => CARS.some((c) => c.id === id));
  if (!save.owned.includes('pocket')) save.owned.unshift('pocket');
  if (!save.owned.includes(save.car)) save.car = 'pocket';
  for (const k of ['paint', 'bests', 'lifeBests', 'taBests', 'admin', 'tune']) if (!save[k] || typeof save[k] !== 'object') save[k] = {};
  if (!GAME_MODES[save.gm]) save.gm = save.lives ? 'lives' : 'free';
  save.lives = save.gm === 'lives';
}
/** Game modes: lives = crashes you can take (0 = endless), cash multiplier, what the HUD says. */
const GAME_MODES = {
  free: { name: 'Free drive', lives: 0, cash: 1 },
  lives: { name: 'Two lives', lives: 2, cash: 1.5 },
  hard: { name: 'Hardcore', lives: 1, cash: 2 },
  time: { name: 'Time attack', lives: 0, cash: 1.25 },
  zen: { name: 'Zen cruise', lives: 0, cash: 0.5 },
};
const TA = { start: 60, every: 1500, add: 25, near: [2, 1, 0.5] }; // time attack: seconds to start, checkpoint gap (m), seconds per checkpoint, per near miss tier
fixSave();
// every save also goes to your Free Period account when you're signed in (account.js)
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } saved(); };
/** One of the owner's admin switches, only when the server has said this account is the owner. */
const cheat = (k) => account.owner && !!save.admin[k];
const paintOf = (id) => save.paint[id] ?? carById(id).color;

// ---------------- renderer + world ----------------
const hi = save.settings.quality === 'high';
// low quality draws straight to the screen, so it gets the canvas's MSAA; high quality has its own in the bloom buffer
const renderer = new THREE.WebGLRenderer({ antialias: !hi, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 2400);
const world = new World(renderer, save.settings.quality);
const scene = world.scene;
// soft fill light riding with the camera so the car you are chasing is never a black silhouette
const FILL = hi ? 6 : 14;
const fill = new THREE.PointLight(0xffffff, FILL, 20, 1.4);
fill.position.set(0, 1.5, 0);
camera.add(fill);
scene.add(camera);
const sound = new Sound();
sound.volume = save.settings.vol;
// the view from the driver's seat: the cabin, wheel and arms are their own little scene drawn over the world (so
// they can sit centimetres from the camera without costing the world its depth precision)
const cockpit = new Cockpit(hi);
const cabPass = new RenderPass(cockpit.scene, cockpit.camera);
cabPass.clear = false; cabPass.clearDepth = true; cabPass.enabled = false;
// high quality: render into a multisampled HDR buffer, then bloom so lights glow
let composer = null;
if (hi) {
  // sharp screens get no MSAA (the pixels are already small and MSAA is the costliest part); others get 4x
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: renderer.getPixelRatio() >= 1.5 ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(cabPass);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.92));
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
const fx = new Fx(scene, camera, hi);
const weather = new Weather(scene, hi);
weather.onThunder = (delay) => sound.play('boom', { gain: 0.32, rate: 0.42 + Math.random() * 0.1, delay });
// fire and smoke for two lives mode, and the light the fireball throws (in the scene from the start, so lighting
// never has to be rebuilt mid-game)
const fire = new Puffs(scene, 170, true), smoke = new Puffs(scene, 260, false);
const boomLight = new THREE.PointLight(0xff8a3a, 0, 42, 1.5);
scene.add(boomLight);
// if a machine can't keep up, drop the render resolution a step at a time
let slowFor = 0;
function adaptResolution(dt) {
  slowFor = fpsAvg < 45 ? slowFor + dt : 0;
  const pr = renderer.getPixelRatio();
  if (slowFor > 3 && pr > 0.75) {
    slowFor = 0;
    renderer.setPixelRatio(Math.max(0.75, pr - 0.25));
    renderer.setSize(innerWidth, innerHeight);
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
  }
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); cockpit.resize(); renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight); });

// ---------------- the player's car ----------------
let spec = carById(save.car);
const sim = new CarSim(spec);
let carMesh = null;
const headlight = hi ? new THREE.SpotLight(0xfff0d0, 70, 130, 0.46, 0.6, 1.5) : new THREE.SpotLight(0xfff0d0, 140, 120, 0.46, 0.6, 1.2);
const hlTarget = new THREE.Object3D();

function setCarModel(s, paint) {
  if (carMesh) { carMesh.removeFromParent(); carMesh.userData.dispose(); }
  headlight.intensity = hi ? 70 : 140;
  carMesh = buildCar(s, paint);
  carMesh.rotation.order = 'YXZ';
  carMesh.add(headlight, hlTarget);
  headlight.position.set(0, 0.75, s.body.L / 2 - 0.2);
  hlTarget.position.set(0, -0.6, 30);
  headlight.target = hlTarget;
  fx.attachFlames(carMesh);
  scene.add(carMesh);
  cockpit.setCar(s, paint ?? s.color);
  sound.setEngine(s.engine?.voice || 'i4', s.engine?.pitch || 1);
  applyTuneSound(s);
}
setCarModel(spec, paintOf(spec.id));

// ---------------- game state ----------------
let mode = 'menu'; // menu | garage | mp | settings | play | pause
let net = null, mpStart = 0, autoRegroupUntil = 0;
let me = { name: '', own: false }; // how the server knows us online (it checks the account before showing OWNER)
let wt = 600; // world clock (seconds): traffic positions are a function of it
const scorer = new Scorer();
const remotes = new Map(); // player id -> { mesh, tag, car, color }
let camLift = 0, camMode = 0, camD = 0, fov = 66, shake = 0, menuAng = 0.6, lastV = 0, aLong = 0, playTime = 0;
let revUntil = 0, lastGear = 0, lastBoost = false, prevS = 0, draftT = 0;
// two lives mode: lives left (0 = mode off), the wreck after the second crash, and this run's numbers
let lives = 0, wreck = null, wreckT = 0, wreckAng = 0, trailAcc = 0;
let gm = 'free', timeLeft = 0, nextCp = 0, cpCount = 0, taDone = false; // the mode being played, and time attack's clock
const run = { s0: 0, cash0: 0, best: 0, newBest: false };
const MENU_SEED = 20261107;

/** The menus show the chosen route with the car cruising in the second lane. */
function enterMenuWorld() {
  const before = world.mapId;
  world.setRoute({ map: save.route.map, lanes: save.route.lanes, seed: MENU_SEED, density: 1 });
  applyWeather();
  sim.reset(420, world.road.laneCenter(1), laneKmh(world.road.lanes, 1) / 3.6);
  if (before !== world.mapId) setCarModel(mode === 'garage' ? CARS[gIdx] : spec, mode === 'garage' ? gPaint : paintOf(spec.id)); // pick up the new reflections
}

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
    else if (mode === 'mp' || mode === 'settings' || mode === 'route' || mode === 'account' || mode === 'admin') show('menu');
    else if (mode === 'over') quitToMenu();
  }
  if (mode === 'over' && (e.code === 'KeyR' || e.code === 'Enter')) driveAgain();
  if (e.code === 'KeyC' && mode === 'play') nextCam();
  if (mode === 'play' && !e.repeat) {
    if (e.code === 'KeyQ') shift(1);
    if (e.code === 'KeyE') shift(-1);
    if (e.code === 'KeyH') setManual(!save.settings.manual, true);
  }
  if (mode === 'tune' && e.code === 'Escape') closeTune();
  if (mode === 'garage') { if (e.code === 'ArrowLeft' || e.code === 'KeyA') browse(-1); if (e.code === 'ArrowRight' || e.code === 'KeyD') browse(1); }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (mode === 'play' && !net) pause(true); });
addEventListener('pointerdown', () => sound.start(), { capture: true });

// ---------------- camera choice + the manual gearbox ----------------
const CAM_ORDER = [0, 2, 1, 3], CAM_NAMES = { 0: 'Chase', 1: 'Bonnet', 2: 'Far chase', 3: 'Cockpit' };
function nextCam() {
  camMode = CAM_ORDER[(CAM_ORDER.indexOf(camMode) + 1) % CAM_ORDER.length];
  save.settings.cam = camMode; persist();
  pop(CAM_NAMES[camMode].toUpperCase(), 'camera', '#9fd4ff', false);
}
function setManual(on, say) {
  save.settings.manual = !!on; persist();
  sim.manual = save.settings.manual;
  document.body.classList.toggle('manual', sim.manual);
  $('h-gb').textContent = sim.manual ? 'MANUAL' : 'AUTO'; $('h-gb').classList.toggle('man', sim.manual);
  $('t-gb').textContent = sim.manual ? 'MANUAL' : 'AUTO';
  $('h-revs').classList.toggle('on', sim.manual);
  if (say) pop(sim.manual ? 'MANUAL' : 'AUTOMATIC', sim.manual ? (singleSpeed(spec) ? 'electric: one gear, nothing to shift' : 'Q shifts up · E shifts down') : 'the car shifts for you', '#ffb020', false);
}
let gearRed = 0;
/** Q / E (and the + / − touch buttons): one gear up or down in manual. */
function shift(dir) {
  if (mode !== 'play' || wreck || !sim.manual) { if (mode === 'play' && !sim.manual && !wreck) pop('AUTOMATIC', 'press H for manual', '#9aa3bd', false); return; }
  const r = dir > 0 ? sim.shiftUp() : sim.shiftDown();
  if (r === 'over') { gearRed = performance.now() + 350; sound.play('clank', { gain: 0.3, rate: 1.5 }); }
}

const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
for (const [id, k] of [['t-left', 'left'], ['t-right', 'right'], ['t-gas', 'gas'], ['t-brake', 'brake'], ['t-nitro', 'nitro']]) {
  const el = $(id);
  const on = (v) => (e) => { e.preventDefault(); touch[k] = v; el.classList.toggle('on', v); };
  el.addEventListener('pointerdown', on(true)); el.addEventListener('pointerup', on(false)); el.addEventListener('pointercancel', on(false)); el.addEventListener('pointerleave', on(false));
}

for (const [id, fn] of [['t-up', () => shift(1)], ['t-down', () => shift(-1)], ['t-gb', () => setManual(!save.settings.manual, true)], ['t-cam', () => nextCam()]]) {
  $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'play') fn(); });
}
let padUp = false, padDown = false;

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
    // manual: Y / triangle shifts up, X / square shifts down
    const up = !!pad.buttons[3]?.pressed, dn = !!pad.buttons[2]?.pressed;
    if (up && !padUp) shift(1);
    if (dn && !padDown) shift(-1);
    padUp = up; padDown = dn;
  }
  return inp;
}

// ---------------- screens ----------------
const SCREENS = ['menu', 'garage', 'mp', 'settings', 'pause', 'route', 'over', 'account', 'admin', 'tune'];
function show(name) {
  mode = name;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  const inGame = name === 'play' || name === 'pause';
  $('hud').classList.toggle('hidden', !inGame);
  $('wallet').classList.toggle('hidden', inGame);
  $('keys').classList.toggle('hidden', name !== 'menu' || isTouch);
  $('touch').classList.toggle('hidden', !(isTouch && name === 'play'));
  $('w-acct').classList.toggle('hidden', inGame || name === 'over');
  $('b-kart').classList.toggle('hidden', name !== 'menu');
  if (name === 'menu') { refreshWallet(); pollOnline(); $('b-route').textContent = routeLabel(); }
}
const routeLabel = () => `${mapById(save.route.map).name} · ${save.route.lanes} lanes${save.gm !== 'free' ? ` · ${GAME_MODES[save.gm].name.toLowerCase()}` : ''}`;
function refreshWallet() {
  $('w-cash').textContent = `$${fmt(save.cash)}`;
  $('w-best').textContent = fmt(save.best);
  $('garage-count').textContent = `${save.owned.length} / ${CARS.length} cars`;
}

$('b-solo').onclick = () => { show('route'); paintRoute(); };
$('b-mp').onclick = () => {
  show('mp'); paintMpRoute();
  // signed in: you drive under your account name
  const u = account.user;
  $('mp-name').value = u ? u.username : save.name || `Driver${100 + Math.floor(Math.random() * 900)}`;
  $('mp-name').disabled = !!u;
  $('mp-status').textContent = ''; $('mp-status').className = 'status';
};
$('b-garage').onclick = () => openGarage();
$('b-settings').onclick = () => { show('settings'); paintSettings(); };
$('mp-back').onclick = () => show('menu');
$('s-back').onclick = () => show('menu');
$('p-resume').onclick = () => pause(false);
$('p-quit').onclick = () => quitToMenu();
$('p-regroup').onclick = () => { regroup(); pause(false); };
for (const b of document.querySelectorAll('.btn')) b.addEventListener('click', () => sound.click());

// ---------------- route: map + lanes ----------------
function setRoute(map, lanes) {
  save.route = { map: map ?? save.route.map, lanes: lanes ?? save.route.lanes };
  persist();
  enterMenuWorld();
  $('b-route').textContent = routeLabel();
}
function setMode(gm) { save.gm = GAME_MODES[gm] ? gm : 'free'; save.lives = save.gm === 'lives'; persist(); paintRoute(); paintMpRoute(); $('b-route').textContent = routeLabel(); }
function setLives(on) { setMode(on ? 'lives' : 'free'); }
function paintRoute() {
  const L = save.route.lanes;
  $('r-maps').innerHTML = MAP_LIST.map((id) => {
    const m = MAPS[id], best = save.bests[routeKey(id, L)] || 0;
    return `<button class="mapc${id === save.route.map ? ' on' : ''}" data-m="${id}"><b>${m.name}</b><span>${m.blurb}</span><small>${best ? `Best combo here (${L} lanes): ${fmt(best)}` : `No combo banked here on ${L} lanes yet`}</small></button>`;
  }).join('');
  for (const b of document.querySelectorAll('[data-l]')) b.classList.toggle('primary', +b.dataset.l === L);
  for (const b of document.querySelectorAll('[data-gm]')) b.classList.toggle('primary', b.dataset.gm === save.gm);
  const lanesNote = L === 2 ? 'Two lanes: tight gaps, half again the cash for every bank.' : L === 3 ? 'Three lanes: a quarter more cash for every bank.' : 'Four lanes: the most room to weave.';
  const lb = save.lifeBests[routeKey(save.route.map, L)] || 0;
  const tb = save.taBests[routeKey(save.route.map, L)] || 0;
  const notes = {
    free: lanesNote,
    lives: `Two lives: crash twice and you blow up. x1.5 cash. ${lb ? `Best run here: ${fmt(lb)}.` : 'No run here yet.'}`,
    hard: 'Hardcore: one crash and you blow up. x2 cash.',
    time: `Time attack: ${TA.start} seconds on the clock. Checkpoints add ${TA.add}s, near misses add a little. x1.25 cash. ${tb ? `Best here: ${fmt(tb)}.` : ''}`,
    zen: 'Zen cruise: crashes never cost you the combo. Half cash. Just drive.',
  };
  $('r-note').textContent = notes[save.gm] || lanesNote;
}
for (const b of document.querySelectorAll('[data-gm]')) b.onclick = () => { sound.click(); setMode(b.dataset.gm); };
$('r-maps').onclick = (e) => { const b = e.target.closest('.mapc'); if (!b) return; sound.click(); setRoute(b.dataset.m, null); paintRoute(); };
for (const b of document.querySelectorAll('[data-l]')) b.onclick = () => { setRoute(null, +b.dataset.l); paintRoute(); };
$('r-go').onclick = () => startSolo();
$('r-back').onclick = () => show('menu');
function paintMpRoute() {
  for (const b of document.querySelectorAll('[data-mm]')) b.classList.toggle('primary', b.dataset.mm === save.route.map);
  for (const b of document.querySelectorAll('[data-ml]')) b.classList.toggle('primary', +b.dataset.ml === save.route.lanes);
  for (const b of document.querySelectorAll('[data-mlv]')) b.classList.toggle('primary', (b.dataset.mlv === '1') === (save.gm === 'lives'));
}
for (const b of document.querySelectorAll('[data-mlv]')) b.onclick = () => setLives(b.dataset.mlv === '1');
for (const b of document.querySelectorAll('[data-mm]')) b.onclick = () => { setRoute(b.dataset.mm, null); paintMpRoute(); };
for (const b of document.querySelectorAll('[data-ml]')) b.onclick = () => { setRoute(null, +b.dataset.ml); paintMpRoute(); };

// ---------------- settings ----------------
function paintSettings() {
  $('s-vol').value = save.settings.vol;
  for (const b of document.querySelectorAll('[data-q]')) b.classList.toggle('primary', b.dataset.q === save.settings.quality);
  for (const b of document.querySelectorAll('[data-u]')) b.classList.toggle('primary', b.dataset.u === save.settings.units);
  $('s-den').value = save.settings.density; $('s-denv').textContent = densityName(save.settings.density);
  for (const b of document.querySelectorAll('[data-w]')) b.classList.toggle('primary', b.dataset.w === save.settings.weather);
  for (const b of document.querySelectorAll('[data-cam]')) b.classList.toggle('primary', +b.dataset.cam === save.settings.cam);
  for (const b of document.querySelectorAll('[data-hb]')) b.classList.toggle('primary', (b.dataset.hb === '1') === !!save.settings.boxes);
  for (const b of document.querySelectorAll('[data-gb]')) b.classList.toggle('primary', (b.dataset.gb === '1') === !!save.settings.manual);
}
for (const b of document.querySelectorAll('[data-gb]')) b.onclick = () => { setManual(b.dataset.gb === '1', false); paintSettings(); };
for (const b of document.querySelectorAll('[data-w]')) b.onclick = () => { save.settings.weather = b.dataset.w; persist(); paintSettings(); applyWeather(); };
for (const b of document.querySelectorAll('[data-cam]')) b.onclick = () => { save.settings.cam = +b.dataset.cam; camMode = save.settings.cam; persist(); paintSettings(); };
for (const b of document.querySelectorAll('[data-hb]')) b.onclick = () => { save.settings.boxes = b.dataset.hb === '1'; persist(); paintSettings(); };

// ---------------- weather ----------------
let weatherKind = 'clear';
/** Rain, snow or fog from settings (or the map's own), with what it does to the road and the grip. */
function applyWeather() {
  if (!world.map) return;
  const w = save.settings.weather === 'map' ? world.map.weather || 'clear' : save.settings.weather;
  weatherKind = w;
  weather.set(w, world.map.id === 'storm');
  world.setWet(w === 'rain' ? 1 : 0);
  world.setFog(w === 'fog' ? 0.32 : w === 'snow' ? 0.72 : w === 'rain' ? 0.85 : 1);
  sim.gripK = WEATHER_GRIP[w] ?? 1;
}
$('s-vol').oninput = (e) => { save.settings.vol = +e.target.value; sound.setVolume(save.settings.vol); persist(); };
for (const b of document.querySelectorAll('[data-q]')) b.onclick = () => {
  if (save.settings.quality === b.dataset.q) return;
  save.settings.quality = b.dataset.q; persist(); paintSettings();
  $('s-note').textContent = 'Reloading to switch graphics…';
  setTimeout(() => location.reload(), 500);
};
for (const b of document.querySelectorAll('[data-u]')) b.onclick = () => { save.settings.units = b.dataset.u; persist(); paintSettings(); };
const densityName = (d) => `${d < 0.6 ? 'Empty roads' : d < 0.9 ? 'Light' : d < 1.15 ? 'Normal' : d < 1.5 ? 'Busy' : d < 1.9 ? 'Rush hour' : d < 2.3 ? 'Jammed' : 'Gridlock'} · x${(+d).toFixed(1)}`;
$('s-den').oninput = (e) => { save.settings.density = clamp(+e.target.value, 0.4, 2.4); $('s-denv').textContent = densityName(save.settings.density); persist(); };

// ---------------- garage ----------------
let gIdx = 0, gPaint = 0;
function openGarage() { gIdx = Math.max(0, CARS.findIndex((c) => c.id === save.car)); gPaint = paintOf(CARS[gIdx].id); show('garage'); paintGarage(true); }
function closeGarage() { setCarModel(spec, paintOf(spec.id)); sim.setSpec(spec); show('menu'); }
function browse(dir) { gIdx = (gIdx + dir + CARS.length) % CARS.length; gPaint = paintOf(CARS[gIdx].id); paintGarage(true); revUntil = performance.now() + 800; }
function paintGarage(rebuild) {
  const c = CARS[gIdx];
  const owned = save.owned.includes(c.id);
  if (rebuild) setCarModel(c, gPaint); else carMesh.userData.setPaint(gPaint);
  $('g-name').textContent = c.name;
  $('g-cls').textContent = owned ? c.cls : `${c.cls} · $${fmt(c.price)}`;
  // the numbers count the tuning parts fitted to your own car
  const t = owned ? tunedSpec(c, tuneOf(save, c.id), sportOf(save, c.id) === 2) : c, brk = brakeOf(t);
  const top = save.settings.units === 'mph' ? `${Math.round(t.top * 0.6214)} mph` : `${t.top} km/h`;
  $('g-top').style.width = `${Math.min(100, (t.top / 560) * 100)}%`; $('g-topv').textContent = top;
  $('g-acc').style.width = `${Math.min(100, (t.accel / 26) * 100)}%`; $('g-accv').textContent = `${(100 / 3.6 / t.accel * 1.35).toFixed(1)}s`;
  $('g-han').style.width = `${Math.min(100, (t.grip / 1.9) * 100)}%`; $('g-hanv').textContent = `${Math.round((t.grip / 1.4) * 100)}`;
  $('g-brk').style.width = `${Math.min(100, (brk / 52) * 100)}%`; $('g-brkv').textContent = `${(Math.min(56, brk) / 9.81).toFixed(1)} g`;
  $('g-tune').disabled = !owned;
  { const lv = tuneOf(save, c.id).reduce((a, v) => a + v, 0); $('g-tune').textContent = lv ? `Tune · ${lv}/${TUNE_PARTS.length * MAX_STAGE}${sportOf(save, c.id) === 2 ? ' · S' : ''}` : 'Tune'; }
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
  spec = c; sim.setSpec(driveSpec());
  if (net) net.send({ t: 'car', car: c.id, color: paintOf(c.id) });
  refreshWallet(); paintGarage(false);
};

// ---------------- tuning: buy a part, then fit it with a quick-time game ----------------
const qte = new Qte($('qte'), sound);
function openTune() { if (!save.owned.includes(CARS[gIdx].id)) return; show('tune'); $('tu-note').textContent = ''; paintTune(); }
function closeTune() { if (qte.active) return; show('garage'); paintGarage(false); }
function paintTune() {
  const c = CARS[gIdx], lv = tuneOf(save, c.id), sp = sportOf(save, c.id);
  $('tu-name').textContent = c.name;
  $('tu-list').innerHTML = TUNE_PARTS.map((p, i) => {
    const st = lv[i], max = st >= MAX_STAGE, cost = max ? 0 : stageCost(c, st + 1), can = !max && save.cash >= cost;
    return `<div class="tu-row"><div><b>${p.name}</b> <span class="tu-st">${max ? 'Stage 7 · maxed' : st ? `Stage ${st}` : 'Stock'}</span><small>${p.what}</small><div class="tu-pips">${Array.from({ length: MAX_STAGE }, (_, k) => `<i class="${k < st ? 'on' : ''}"></i>`).join('')}</div></div><button class="btn small${can ? ' primary' : ''}" data-part="${i}" ${can ? '' : 'disabled'}>${max ? 'Maxed' : `Stage ${st + 1} · $${fmt(cost)}`}</button></div>`;
  }).join('') + `<div class="tu-row sport${sp === 2 ? ' on' : ''}"><div><b>Sport mode</b> <span class="tu-st">${sp === 2 ? 'ON' : sp === 1 ? 'off' : 'not fitted'}</span><small>A switch that makes the whole car a lot quicker. Costs four times the car.</small></div><button class="btn small${sp || save.cash >= sportCost(c) ? ' primary' : ''}" data-sport="1" ${sp || save.cash >= sportCost(c) ? '' : 'disabled'}>${sp === 2 ? 'Turn off' : sp === 1 ? 'Turn on' : `Buy · $${fmt(sportCost(c))}`}</button></div>`;
  $('tu-cash').textContent = `You have $${fmt(save.cash)}`;
}
/** After any tuning change: the car you drive picks it up, and so does its sound. */
function tuneChanged(c) {
  persist(); refreshWallet(); paintTune();
  if (c.id === save.car) sim.setSpec(driveSpec());
  applyTuneSound(c);
}
/** Tuned cars sound it: louder exhaust, more crackle, turbo whistle. */
function applyTuneSound(c) {
  const lv = tuneOf(save, c.id), own = save.owned.includes(c.id);
  sound.setTune(own ? { turbo: lv[PART.turbo], engine: lv[PART.engine], ecu: lv[PART.ecu], exhaust: lv[PART.exhaust], sport: sportOf(save, c.id) === 2, stock: !!c.engine?.turbo, ev: singleSpeed(c) } : { turbo: 0, engine: 0, ecu: 0, exhaust: 0, sport: false, stock: !!c.engine?.turbo, ev: singleSpeed(c) });
}
$('g-tune').onclick = () => openTune();
$('tu-back').onclick = () => closeTune();
$('tu-list').onclick = async (e) => {
  const sb = e.target.closest('[data-sport]'), c = CARS[gIdx], note = $('tu-note');
  if (sb && !sb.disabled && !qte.active) { // sport mode: buy it once, then it is a switch
    const sp = sportOf(save, c.id);
    if (!sp) { if (save.cash < sportCost(c)) return; save.cash -= sportCost(c); sound.buy(); note.className = 'status'; note.innerHTML = '<b style="color:var(--green)">Sport mode fitted and switched on.</b>'; }
    setTune(save, c.id, tuneOf(save, c.id), sp === 2 ? 1 : 2);
    tuneChanged(c); revUntil = performance.now() + 800;
    return;
  }
  const b = e.target.closest('[data-part]');
  if (!b || b.disabled || qte.active) return;
  const i = +b.dataset.part, p = TUNE_PARTS[i];
  const stage = tuneOf(save, c.id)[i] + 1, cost = stageCost(c, stage);
  if (stage > MAX_STAGE || save.cash < cost) return;
  const r = await qte.play(p.qte, p.job);
  const lv = tuneOf(save, c.id);
  if (r.ok) {
    const back = r.perfect ? Math.round(cost * PERFECT_BACK) : 0;
    save.cash = Math.max(0, save.cash - cost + back);
    lv[i] = stage; setTune(save, c.id, lv); sound.buy();
    note.className = 'status'; note.innerHTML = `<b style="color:var(--green)">${p.name} stage ${stage} fitted.</b>${back ? ` A perfect job: $${fmt(back)} back.` : ''}`;
    revUntil = performance.now() + 800;
  } else {
    const lost = Math.min(save.cash, Math.round(cost * BOTCH));
    save.cash -= lost;
    note.className = 'status err'; note.textContent = `The job went wrong and $${fmt(lost)} of parts were wasted. Try again.`;
  }
  tuneChanged(c);
};

enterMenuWorld();

// ---------------- starting, spawning, quitting ----------------
function freeLane(s, t) {
  const tmp = [], lanes = world.road.lanes;
  for (const L of [1, 2, 0, 3].filter((l) => l < lanes)) {
    const n = trafficNear(world.road, world.density, t, s - 20, s + 70, tmp);
    let clear = true;
    for (let i = 0; i < n; i++) if (tmp[i].lane === L) clear = false;
    if (clear) return L;
  }
  return 1;
}
function spawn(s, v) {
  sim.reset(s, world.road.laneCenter(freeLane(s, wt)), v);
  sim.ghost = 2;
  camD = sim.d;
  prevS = s;
}
/** The car as it drives: the owner's Turbo switch makes it quicker. */
const driveSpec = () => { const t = tunedSpec(spec, tuneOf(save, spec.id), sportOf(save, spec.id) === 2); return cheat('turbo') ? { ...t, top: Math.round(t.top * 1.35), accel: t.accel * 1.4 } : t; };
function beginPlay() {
  clearWreck();
  scorer.reset();
  // multiplayer rooms play free drive or two lives; the other modes are solo
  gm = net ? (save.gm === 'lives' ? 'lives' : 'free') : save.gm;
  const G = GAME_MODES[gm];
  lives = G.lives;
  scorer.cashMult = (CASH_MULT[world.road.lanes] || 1) * G.cash;
  timeLeft = gm === 'time' ? TA.start : 0; nextCp = TA.every; cpCount = 0; taDone = false;
  world.checkpointEvery = gm === 'time' ? TA.every : 0;
  if (gm === 'time') nextCp = Math.ceil((sim.s + 50) / TA.every) * TA.every;
  $('h-ta').classList.toggle('hidden', gm !== 'time');
  camMode = save.settings.cam || 0;
  setCarModel(spec, paintOf(spec.id)); sim.setSpec(driveSpec());
  setManual(save.settings.manual, false);
  show('play');
  playTime = 0;
  run.s0 = sim.s; run.cash0 = save.cash; run.best = 0; run.newBest = false;
  paintLives();
  $('h-hint').style.opacity = 1;
  const m = world.map, L = world.road.lanes;
  const admin = ['god', 'nitro', 'turbo', 'combo'].some(cheat);
  $('h-route').textContent = `${m.name} · ${L} lanes${gm !== 'free' ? ` · ${G.name.toLowerCase()}` : ''}${scorer.cashMult !== 1 ? ` · cash x${+scorer.cashMult.toFixed(2)}` : ''}${weatherKind !== 'clear' ? ` · ${weatherKind}` : ''}${sportOf(save, spec.id) === 2 ? ' · SPORT' : ''}${admin ? ' · ADMIN' : ''}`;
  const sub = { lives: 'Two lives · crash twice and you blow up', hard: 'Hardcore · one crash and you blow up', time: `Time attack · reach the checkpoints · ${TA.start}s on the clock`, zen: 'Zen cruise · crashes never cost the combo' }[gm];
  banner('GO', sub || `${m.name} · ${L} lanes`, '#ffb020');
}
function paintLives() {
  $('h-lives').classList.toggle('hidden', !GAME_MODES[gm]?.lives || !(mode === 'play' || mode === 'pause'));
  [...$('h-lives').children].forEach((el, i) => el.classList.toggle('gone', i >= lives));
}
function clearWreck() {
  if (!wreck) return;
  wreck.dispose(); wreck = null;
}
function startSolo() {
  world.setRoute({ map: save.route.map, lanes: save.route.lanes, seed: Math.floor(Math.random() * 1e9), density: save.settings.density });
  applyWeather();
  wt = 300 + Math.random() * 3000;
  spawn(300, 100 / 3.6);
  $('h-mp').classList.add('hidden');
  $('p-regroup').classList.add('hidden');
  $('p-room').textContent = `Solo run · ${world.map.name} · ${world.road.lanes} lanes`;
  beginPlay();
}
function pause(on) {
  if (on) { show('pause'); keys.clear(); } else show('play');
}
function quitToMenu() {
  const ev = [];
  if (!wreck) { scorer.bank(ev); handleEvents(ev); }
  clearWreck();
  leaveNet();
  enterMenuWorld();
  setCarModel(spec, paintOf(spec.id));
  show('menu');
}

// ---------------- multiplayer ----------------
// Free Period's play page shows chat friends which room you're in (their Join button opens ?join=CODE). Nothing when
// the game runs on its own.
function reportRoom(code) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ type: 'fp:room', room: code || null }, location.origin); } catch { /* not framed by Free Period */ }
}
async function joinMp(how, code) {
  const name = $('mp-name').value.replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Driver';
  if (!account.user) { save.name = name; persist(); }
  me = { name, own: false };
  const st = $('mp-status');
  st.className = 'status';
  st.textContent = 'Connecting… if nobody has played for a while the server takes up to a minute to wake up.';
  for (const b of ['mp-quick', 'mp-create', 'mp-join']) $(b).disabled = true;
  leaveNet();
  const n = new Net(serverUrl);
  try {
    const w = await n.connect({ name, car: spec.id, color: paintOf(spec.id), mode: how, code, map: save.route.map, lanes: save.route.lanes, token: account.user ? accountToken() || undefined : undefined });
    if (mode !== 'mp') { n.close(); return; } // backed out while waiting
    net = n;
    if (w.name) me.name = w.name; // the server's version (a guest can't drive under the owner's name)
    wireNet();
    world.setRoute({ map: w.map || 'city', lanes: w.lanes || 4, seed: w.seed, density: w.density });
    applyWeather();
    mpStart = w.start;
    wt = (net.serverNow() - mpStart) / 1000;
    spawn(300, 100 / 3.6);
    autoRegroupUntil = performance.now() + 4000;
    $('h-mp').classList.remove('hidden');
    $('h-code').textContent = w.code;
    reportRoom(w.code);
    $('p-regroup').classList.remove('hidden');
    const where = `${world.map.name} · ${world.road.lanes} lanes`;
    $('p-room').innerHTML = w.public ? `Public room <b>${w.code}</b> · ${where}` : `Room code <b>${w.code}</b> · ${where} · send it to your friends`;
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
  net.on.me = (m) => { me = { name: String(m.name || me.name), own: !!m.own }; };
  net.on.join = (p) => feed(`<b>${esc(p.name)}</b>${p.own ? ' <span class="own">OWNER</span>' : ''} joined`);
  net.on.leave = (p) => { feed(`<b>${esc(p.name)}</b> left`); dropRemote(p.id); };
  net.on.changed = (p) => dropRemote(p.id);
  net.on.ev = (p, k, pts) => {
    if (k === 'bank') feed(`<b>${esc(p.name)}</b> banked <span style="color:#6dff8a">${fmt(pts)}</span>`);
    if (k === 'lost') feed(`<b>${esc(p.name)}</b> crashed and lost ${fmt(pts)}`);
    if (k === 'split') feed(`<b>${esc(p.name)}</b> threaded the needle`);
    if (k === 'boom') { feed(`<b>${esc(p.name)}</b> <span style="color:#ff8a3a">blew up</span>`); remoteBoom(p); }
  };
  net.on.close = () => {
    feed('Disconnected from the server. You are driving solo now.');
    banner('DISCONNECTED', 'still driving solo', '#ff8a95');
    for (const id of [...remotes.keys()]) dropRemote(id);
    net = null;
    $('p-regroup').classList.add('hidden');
    reportRoom(null);
  };
}
function leaveNet() {
  if (net) { net.close(); net = null; reportRoom(null); }
  for (const id of [...remotes.keys()]) dropRemote(id);
  $('h-feed').innerHTML = '';
}
function regroup() {
  if (!net || wreck) return;
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

function nameTag(text, owner) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px Outfit, system-ui, sans-serif';
  const label = owner ? `★ ${text}` : text;
  const w = Math.min(240, x.measureText(label).width + 28);
  x.fillStyle = owner ? 'rgba(60,40,0,0.85)' : 'rgba(8,12,24,0.75)';
  x.beginPath(); x.roundRect((256 - w) / 2, 8, w, 48, 14); x.fill();
  if (owner) { x.strokeStyle = '#ffc443'; x.lineWidth = 3; x.stroke(); }
  x.fillStyle = owner ? '#ffd27a' : '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, 128, 33);
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
  r.mesh.userData.dispose();
  r.tag.material.map.dispose(); r.tag.material.dispose();
  remotes.delete(id);
}
const RS = {}, RP = {};
function updateRemotes(dt) {
  if (!net) return;
  const ts = net.serverNow() - 180;
  for (const p of net.players.values()) {
    let r = remotes.get(p.id);
    if (!r) {
      const m = buildCar(carById(p.car), p.color);
      m.rotation.order = 'YXZ';
      r = { mesh: m, tag: nameTag(p.name, p.own) };
      remotes.set(p.id, r);
      scene.add(m, r.tag);
    }
    const smp = net.sample(p, ts, RS);
    // a driver who blew up stays hidden until they drive again
    const last = p.snaps[p.snaps.length - 1];
    if (r.boomAt && last && last.ts > r.boomAt + 1500) r.boomAt = 0;
    const vis = !!smp && !r.boomAt && Math.abs(smp.s - sim.s) < 650;
    r.mesh.visible = r.tag.visible = vis;
    if (!vis) continue;
    world.road.toWorld(smp.s, smp.d, RP);
    r.mesh.position.set(RP.x, RP.y, RP.z);
    r.mesh.rotation.set(-Math.atan(world.road.grade(smp.s)), RP.h + smp.y, 0);
    r.mesh.userData.spin(dt, smp.v, 0);
    r.tag.position.set(RP.x, RP.y + 2.3, RP.z);
  }
}

/** Another driver's car blew up: a (smaller) fireball where we last saw it. */
function remoteBoom(p) {
  const r = remotes.get(p.id);
  if (!r) return;
  r.boomAt = net ? net.serverNow() : 0;
  if (!r.mesh.visible) return;
  const q = r.mesh.position;
  blast(fire, smoke, hi, q.x, q.y + 0.7, q.z, 0, 0, 0.7);
  FD.set(0, 0.6, 0); fx.burst(q, FD, 50, 13);
  const dist = q.distanceTo(camera.position);
  if (dist < 260) sound.boom(Math.max(0.15, 1 - dist / 260) * 0.8);
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
      case 'near':
        if (e.bonus) { pop(e.name, `+${fmt(e.pts)}`, '#ffb020', false); break; }
        pop(e.name, `+${fmt(e.pts)}`, TIER_COL[e.tier], e.tier === 0); sound.whoosh(e.side, e.tier, sim.v * 3.6); sound.near(e.tier);
        if (e.tier === 0 && Math.random() < 0.35) sound.horn(e.side); // they didn't like that
        break;
      case 'trap':
        if (e.pts > 0) { pop('SPEED TRAP', `${Math.round(save.settings.units === 'mph' ? e.kmh * 0.6214 : e.kmh)} ${save.settings.units === 'mph' ? 'mph' : 'km/h'} · +${fmt(e.pts)}`, '#ffd27a', true); sound.trap(); }
        else pop('SPEED TRAP', 'too slow · 140+ km/h pays', '#9aa3bd', false);
        break;
      case 'split': pop(e.name, `+${fmt(e.pts)}`, '#3de0ff', true); sound.split(); if (net) net.send({ t: 'ev', k: 'split', p: e.pts }); break;
      case 'bank':
        run.best = Math.max(run.best, e.pts);
        save.cash += e.cash; save.total += e.pts; save.best = Math.max(save.best, e.pts);
        { const k = routeKey(world.map.id, world.road.lanes); save.bests[k] = Math.max(save.bests[k] || 0, e.pts); }
        persist();
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
  if (gm === 'time') { const t = Math.max(0, timeLeft); setText('h-ta', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`); $('h-ta').classList.toggle('low', t < 10); }
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
  setText('h-gear', singleSpeed(spec) ? (sim.v < 0.5 ? 'P' : 'D') : sim.manual ? String(sim.gear + 1) : sim.v < 0.5 ? 'N' : String(sim.gear + 1));
  if (sim.manual) {
    $('h-rev').style.transform = `scaleX(${clamp(sim.rpm / (REDLINE + 200), 0, 1)})`;
    $('h-gear').classList.toggle('red', sim.limiter || now < gearRed);
  } else if (hudCache.red !== false) { hudCache.red = false; $('h-gear').classList.remove('red'); }
  $('h-nitro').style.width = `${sim.nitro * 100}%`;
  // the next speed trap, once it is close
  const next = world.road.trapsIn(sim.s, sim.s + 700)[0], tEl = $('h-trap');
  tEl.classList.toggle('on', next != null);
  if (next != null) {
    const d = Math.round((next - sim.s) / 10) * 10, html = `<small>SPEED TRAP</small>${mph ? `${Math.round(d * 1.094)} yd` : `${d} m`}`;
    if (hudCache.trap !== html) { hudCache.trap = html; tEl.innerHTML = html; }
  }
  if (net && now - boardAt > 250) {
    boardAt = now;
    const rows = [{ name: me.name || save.name || 'You', own: me.own, sc: scorer.run, pd: scorer.pending, me: true, dist: 0 }];
    const tmp = {};
    for (const p of net.players.values()) {
      const smp = net.sample(p, net.serverNow() - 180, tmp);
      rows.push({ name: p.name, own: !!p.own, sc: p.sc, pd: p.pd, dist: smp ? smp.s - sim.s : null });
    }
    rows.sort((a, b) => b.sc - a.sc);
    $('h-board').innerHTML = rows.map((r, i) => `<div class="p${r.me ? ' me' : ''}"><span>${i + 1}</span><span>${esc(r.name)}${r.own ? ' <span class="own">OWNER</span>' : ''}${r.pd > 0 ? ` <small style="color:#ffb020">+${fmt(r.pd)}</small>` : ''}</span><span class="dist">${r.me ? 'you' : r.dist == null ? '' : `${r.dist > 0 ? '+' : ''}${Math.round(r.dist)}m`}</span><span>${fmt(r.sc)}</span></div>`).join('');
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
  if (wreck) {
    // watch the wreck: drop back, rise up, then slowly circle it
    const b = wreck.body;
    if (wreckT > 1.3) wreckAng += dt * 0.2;
    const back = 11 + Math.min(4, wreckT * 1.5);
    road.toWorld(b.s - Math.cos(wreckAng) * back, clamp(b.d - Math.sin(wreckAng) * 8, -(road.wall - 0.5), road.wall - 0.5), P2);
    look.set(P2.x, P2.y + 4 + Math.min(2.2, wreckT), P2.z);
    camera.position.lerp(look, 1 - Math.exp(-2.6 * dt));
    wreckLook.lerp(wreck.pos, 1 - Math.exp(-5 * dt));
    // once the results card is up (on the left), keep the wreck to the right of it
    wreckOff = damp(wreckOff, mode === 'over' ? -3.2 : 0, 2, dt);
    fwd.subVectors(wreckLook, camera.position).normalize();
    right.crossVectors(fwd, UP).normalize();
    camera.lookAt(look.copy(wreckLook).addScaledVector(right, wreckOff));
    fov = damp(fov, 62, 2, dt);
  } else if (mode === 'menu' || mode === 'garage' || mode === 'tune' || mode === 'mp' || mode === 'settings' || mode === 'account' || mode === 'admin') {
    // swing back and forth along the car's left side, staying inside the left barrier
    const g = mode === 'garage' || mode === 'tune';
    menuAng += dt * (g ? 0.3 : 0.16);
    const a = 1.5 + Math.sin(menuAng) * (g ? 1.1 : 0.9);
    const r = g ? 6.4 : 9;
    road.toWorld(sim.s + r * Math.cos(a), sim.d - Math.min(road.wall - 0.6 + sim.d, r * Math.sin(a)), P2);
    camera.position.set(P2.x, P2.y + (g ? 1.6 : 2.4), P2.z);
    look.set(P.x, P.y + (g ? 0.75 : 0.7), P.z);
    // push the car to the right of the screen (menus and the garage card sit on the left)
    fwd.subVectors(look, camera.position).normalize();
    right.crossVectors(fwd, UP).normalize();
    look.addScaledVector(right, g ? -2.1 : -3.4);
    camera.lookAt(look);
    fov = damp(fov, g ? 52 : 58, 4, dt);
  } else if (camMode === 0 || camMode === 2) {
    const far = camMode === 2, dist = (far ? 9.4 : 6.3) + kmh * (far ? 0.012 : 0.009), h = (far ? 3.3 : 1.95) + kmh * 0.0026;
    camD = damp(camD, sim.d, 7, dt);
    road.toWorld(sim.s - dist, camD, P2);
    // rise over any vehicle parked where the camera wants to be (after a rear-end shunt)
    let lift = 0;
    for (let i = 0; i < world.trafficCount; i++) {
      const c = world.traffic[i];
      if (Math.abs(c.s - (sim.s - dist)) < c.hl + 1.4 && Math.abs(c.d - camD) < c.hw + 1) lift = Math.max(lift, (c.hl > 4 ? 3.7 : 2.1) + 0.8 - h);
    }
    camLift = damp(camLift, lift, lift > camLift ? 9 : 3, dt);
    camera.position.set(P2.x, P2.y + h + camLift, P2.z);
    road.toWorld(sim.s + 14, sim.d * 0.55 + camD * 0.45, P2);
    camera.lookAt(P2.x, P2.y + 0.85, P2.z);
    const target = 64 + clamp((kmh - 60) / 260, 0, 1) * 22 + (sim.boosting ? 7 : 0);
    fov = damp(fov, target, 3, dt);
  } else if (camMode === 3) {
    // from the driver's seat: the cockpit works out where the head is and which way it looks
    cockpit.place(camera, carMesh, dt, sim, aLong);
    fov = damp(fov, 70 + clamp((kmh - 60) / 260, 0, 1) * 11 + (sim.boosting ? 5 : 0), 3, dt);
  } else {
    const hd = P.h + sim.yaw;
    fwd.set(Math.sin(hd), 0, Math.cos(hd));
    camera.position.set(P.x + fwd.x * 0.2, P.y + carMesh.userData.roofH - 0.22, P.z + fwd.z * 0.2);
    camera.lookAt(P.x + fwd.x * 30, road.center(sim.s + 30, P2).y + 0.9, P.z + fwd.z * 30);
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
let seatWas = false;
let inputNow = { gas: false }, lastGas = false, limiterOn = false, boostP = 0, flamePops = 0, flameAt = 0;
const CV = new THREE.Vector3(), FV = new THREE.Vector3(), FD = new THREE.Vector3(), BV = new THREE.Vector3(), FP = {};
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
  const now = performance.now();
  const playing = mode === 'play' || mode === 'pause';
  const frozen = mode === 'pause' && !net; // solo pauses the world; multiplayer keeps going

  // after a solo wreck the traffic brakes to a stop (its positions are a function of the clock, so slow the clock)
  if (!frozen) wt = net ? (net.serverNow() - mpStart) / 1000 : wt + dt * (wreck ? Math.max(0, 1 - wreckT / 1.6) : 1);
  const traffic = world.updateTraffic(wt, sim.s, playing || wreck ? 0 : 0b0011);
  const n = world.trafficCount;

  if (playing && !frozen && !wreck) {
    playTime += dt;
    if (mode === 'pause') sim.ghost = Math.max(sim.ghost, 0.3);
    const inp = mode === 'play' ? readInput() : { gas: false, brake: false, steer: 0, nitro: false };
    inputNow = inp;
    sim.noHit = cheat('god');
    if (cheat('nitro')) sim.nitro = 1;
    const ev = [];
    let hitNow = null;
    for (const e of sim.step(dt, inp, world.road, traffic, n)) {
      if (e.type === 'crash') {
        hitNow = e;
        if (gm === 'zen') pop('BUMP', 'combo kept', '#9fd4ff', false);
        else { scorer.lose(ev, 'crash'); if (!ev.length) pop('CRASH', '', '#ff3b4e', true); }
        sound.crash(e.impact); shake = 1; flash();
        // sparks where the cars touched
        world.road.toWorld(sim.s + (e.side ? 0 : Math.sign(e.ds) * sim.hl), sim.d + (e.side ? -Math.sign(e.dd) * sim.hw : 0), FP);
        FV.set(FP.x, FP.y + 0.5, FP.z);
        fx.burst(FV, FD.set(0, 0.5, 0), 26 + Math.min(40, e.impact * 2), 10, BV.copy(CV).multiplyScalar(0.6));
        if (net) net.send({ t: 'ev', k: 'crash', p: 0 });
      } else if (e.type === 'wall') { scorer.scrape(); sound.wall(e.impact); shake = Math.max(shake, 0.3); if (scorer.timer > 0) pop('WALL', '-1.5s', '#ff8a95'); }
    }
    // speed traps between last frame and this one
    if (sim.s > prevS && world.road.trapsIn(prevS, sim.s).length) scorer.trap(sim.v * 3.6, ev);
    prevS = sim.s;
    // slipstream: tuck in close behind a car for a moment to pull harder and refill nitro
    let behind = false;
    for (let i = 0; i < n; i++) { const c = traffic[i], gap = c.s - sim.s - sim.hl - c.hl; if (gap > 0.5 && gap < 16 && Math.abs(c.d - sim.d) < 1.1) behind = true; }
    draftT = behind && sim.v > 22 && sim.ghost <= 0 ? draftT + dt : 0;
    sim.draft = draftT > 0.4;
    if (sim.draft) sim.nitro = Math.min(1, sim.nitro + dt * 0.08);
    scorer.update(dt, sim, traffic, n, ev);
    // road works: clip the cones on the shoulder and they go flying (a little bonus, a little slower)
    for (const z of world.works || []) {
      if (sim.s < z.a - sim.hl - 1 || sim.s > z.b + sim.hl + 1 || Math.sign(sim.d) !== z.side) continue;
      if (Math.abs(sim.d) + sim.hwEff < world.road.half + 0.38) continue;
      const i0 = Math.max(0, Math.floor((sim.s - sim.hl - z.a) / world.road.coneGap)), i1 = Math.floor((sim.s + sim.hl + 0.3 - z.a) / world.road.coneGap);
      for (let i = i0; i <= i1; i++) {
        if (z.a + i * world.road.coneGap > z.b) break;
        if (world.knockCone(z, i, CV.x, CV.z)) { sim.v *= 0.985; scorer.bonus(60, 'CONE!', z.side, ev); sound.play('clank', { gain: 0.45, rate: 1.2 + Math.random() * 0.3 }); }
      }
    }
    // time attack: the clock runs down; checkpoints and near misses buy time
    if (gm === 'time') {
      timeLeft -= dt;
      for (const e of ev) if (e.type === 'near' && !e.bonus && TA.near[e.tier]) timeLeft += TA.near[e.tier];
      if (sim.s >= nextCp) { cpCount++; nextCp += TA.every; timeLeft += TA.add; banner('CHECKPOINT', `+${TA.add}s · ${cpCount} reached`, '#6dff8a'); sound.play('chaching', { gain: 0.5 }); }
      if (timeLeft <= 0 && !taDone) { timeLeft = 0; endTimeAttack(ev); }
    }
    handleEvents(ev);
    if (hitNow && lives) loseLife(hitNow, ev);
    if (cheat('combo') && scorer.timer > 0) scorer.timer = COMBO_TIME;
    if (lives === 1 && !wreck) trail(dt);
    if (net) {
      net.sendState(sim, scorer);
      if (autoRegroupUntil && now < autoRegroupUntil && net.players.size) {
        const anySnap = [...net.players.values()].some((p) => p.snaps.length);
        if (anySnap) { regroup(); autoRegroupUntil = 0; }
      }
    }
    if (playTime > 25) $('h-hint').style.opacity = 0;
  } else if (wreck && !frozen) {
    updateWreck(dt);
  } else if (!playing && !wreck) {
    // menu: the car cruises in lane 2 with the two left lanes cleared for the camera
    sim.s += sim.v * dt; sim.d = world.road.laneCenter(1); sim.yaw = 0; sim.ghost = 0; sim.draft = false;
  }
  world.updateChunks(sim.s);

  // place the player's car (a wreck places itself)
  if (!wreck) {
    world.road.toWorld(sim.s, sim.d, P);
    carMesh.position.set(P.x, P.y, P.z);
    fx.floorY = P.y;
    const acc = (sim.v - lastV) / Math.max(dt, 1e-3); lastV = sim.v;
    aLong = damp(aLong, acc, 6, dt);
    carMesh.rotation.set(clamp(-aLong * 0.0035, -0.035, 0.035) - Math.atan(world.road.grade(sim.s)), P.h + sim.yaw, sim.steer * clamp(sim.v / 70, 0, 1) * 0.045);
    carMesh.visible = !(playing && sim.ghost > 0 && Math.floor(now / 90) % 2 === 0);
    carMesh.userData.setBrake(sim.braking);
    carMesh.userData.spin(dt, frozen ? 0 : sim.v, sim.steer);
    // sparks off the barrier while scraping it, backfire pops when lifting off at high revs
    CV.set(Math.sin(P.h + sim.yaw) * sim.v, 0, Math.cos(P.h + sim.yaw) * sim.v);
  } else CV.set(0, 0, 0);
  if (playing && !frozen && !wreck) {
    if (sim.scrape && sim.v > 8) {
      world.road.toWorld(sim.s + (Math.random() - 0.3) * sim.hl, sim.scrape * (sim.d * sim.scrape + sim.hwEff), FP);
      FV.set(FP.x, FP.y + 0.35 + Math.random() * 0.25, FP.z); FD.set(0, 0.3, 0); BV.copy(CV).multiplyScalar(0.72);
      fx.burst(FV, FD, 2 + Math.floor(sim.v / 25), 6, BV);
    }
    const ev1 = singleSpeed(spec); // electric cars have no exhaust to pop and no gears to change
    const ck = sound.crackle; // how lively the exhaust is (ECU tune, exhaust, sport mode)
    const lifting = !ev1 && !inputNow.gas && lastGas && sim.rpm > 5200 - ck * 900;
    if (lifting && Math.random() < 0.75) { fx.pop(); sound.pop(); }
    // tuned cars burble: a run of crackles (and flames) when you lift, and odd pops while the revs fall
    if (lifting && ck > 0.1 && Math.random() < Math.min(0.95, 0.3 + ck * 0.6)) { sound.burble(ck); flamePops = 2 + Math.floor(ck * 3 + Math.random() * 2); flameAt = now + 90; }
    if (!ev1 && ck > 0.3 && !inputNow.gas && sim.rpm > 4300 && sim.v > 12 && Math.random() < dt * ck * 1.6) { fx.pop(); sound.pop(); }
    if (flamePops > 0 && now > flameAt) { flamePops--; flameAt = now + 70 + Math.random() * 170; fx.pop(); }
    // turbo: boost builds with the revs on the throttle and dumps through the blow-off valve when you lift
    {
      const want = !ev1 && (inputNow.gas || sim.boosting) && !sim.limiter ? clamp((sim.rpm - 2000) / 3000, 0, 1) : 0;
      if (want > 0 && boostP < 0.12 && !lastGas && sim.rpm > 2400) sound.spoolUp();
      if (want === 0 && boostP > 0.5) { sound.blowoff(boostP); boostP *= 0.2; }
      boostP = damp(boostP, want, want > boostP ? 2.4 + (sim.spec.tuned?.lv?.[PART.turbo] || 0) * 0.3 : 8, dt);
      sound.turbo(boostP);
    }
    lastGas = inputNow.gas;
    // gear changes dip the engine note (and sometimes crackle); nitro kicks in with a rush
    if (sim.gear !== lastGear) {
      if (sim.v > 3 && !ev1) { sound.shift(); if ((sim.gear > lastGear ? Math.random() < 0.35 : sim.manual && Math.random() < 0.6)) { fx.pop(); sound.pop(); } }
      lastGear = sim.gear;
    }
    // manual: the engine stutters on the rev limiter until you shift
    if (sim.limiter) { limiterOn = true; sound.cut(Math.floor(now / 42) % 2 ? 1 : 0.28); } else if (limiterOn) { limiterOn = false; sound.cut(1); }
    if (sim.boosting && !lastBoost) sound.nitro();
    lastBoost = sim.boosting;
    // tyres squeal when the car is pointed well off the road's line at speed or braking hard
    const slide = clamp((Math.abs(sim.yaw) - 0.12) / 0.12, 0, 1) * clamp((sim.v - 25) / 20, 0, 1) * 0.8 + (sim.braking && sim.v > 30 ? 0.45 : 0);
    sound.tires(mode === 'play' ? Math.min(1, slide) : 0);
    sound.scrape(sim.scrape && sim.v > 5 ? Math.min(1, sim.v / 30) : 0);
  } else { sound.tires(0); sound.scrape(0); if (boostP) { boostP = 0; sound.turbo(0); } }
  sound.setTunnel(world.tunnelK);
  $('h-slip').classList.toggle('on', playing && sim.draft && !wreck);
  fx.update(dt, sim.v * 3.6, sim.boosting && !wreck, CV, playing && !wreck);
  const pScale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const pDt = frozen ? 0 : wreck ? dt * wreckScale : dt;
  fire.update(pDt, pScale); smoke.update(pDt, pScale);

  updateRemotes(dt);
  updateCamera(dt);
  world.follow(camera);
  world.tick(sim.s, now / 1000, dt);
  world.updateProps(sim.s, now / 1000, frozen ? 0 : dt);
  weather.update(frozen ? 0 : dt, camera, CV, now / 1000);
  if (weather.flash > 0) { world.hemi.intensity += weather.flash * 3.2; world.dirLight.intensity += weather.flash * 2; }
  sound.rain(weatherKind === 'rain' ? 1 - world.tunnelK * 0.8 : 0);
  drawHitboxes(playing && save.settings.boxes && !wreck);
  if (playing) updateHud(now);
  if (mode === 'play') adaptResolution(dt);
  // in the garage, switching cars gives a quick rev so you hear each engine
  const rev = now < revUntil ? Math.sin(Math.PI * (1 - (revUntil - now) / 800)) : 0;
  sound.engine(playing ? sim.rpm : 1500 + rev * 5200, playing ? sim.load : rev > 0.05 ? 1 : 0, playing ? sim.v : 0, (mode === 'play' && !wreck) || rev > 0.05, sim.boosting);
  // the driver's seat view: cabin, dials, wheel and arms, drawn over the world
  const seat = camMode === 3 && playing && !wreck;
  fill.intensity = seat ? FILL * 0.2 : FILL;
  cabPass.enabled = seat;
  if (seat !== seatWas) { seatWas = seat; document.body.classList.toggle('seat', seat); }
  if (seat) cockpit.update(frozen ? 0 : dt, { sim, input: inputNow, world, camera, now: now / 1000, mph: save.settings.units === 'mph', spec: sim.spec, weather: weatherKind, flash: weather.flash, crash: shake });
  if (composer) composer.render(dt);
  else {
    renderer.render(scene, camera);
    if (seat) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(cockpit.scene, cockpit.camera); renderer.autoClear = true; }
  }
  if (liquid.showing) liquid.grab(renderer.domElement); // the kart button's water shows this view through it
}
// ---------------- time attack ----------------
/** The clock ran out: bank what's pending, then the results card. */
function endTimeAttack(ev) {
  taDone = true;
  scorer.bank(ev);
  sim.ghost = 3;
  banner('TIME UP', `${cpCount} checkpoint${cpCount === 1 ? '' : 's'} reached`, '#ffb020');
  sound.play('register', { gain: 0.5 });
  setTimeout(() => {
    if (mode !== 'play' && mode !== 'pause') return;
    const k = routeKey(world.map.id, world.road.lanes);
    run.newBest = scorer.run > 0 && scorer.run > (save.taBests[k] || 0);
    if (run.newBest) { save.taBests[k] = scorer.run; persist(); }
    showOver();
  }, 1400);
}

// ---------------- hitbox outlines (settings) ----------------
let boxLines = null;
const HB_H = { truck: 3.4, bus: 3.3, semi: 4.1, van: 2.1, moto: 1.5, suv: 1.8, pickup: 1.9 };
/** Draw every car's hitbox (the exact turned box collisions use) as a wire frame. */
function drawHitboxes(on) {
  if (!on) { if (boxLines) boxLines.visible = false; return; }
  if (!boxLines) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 24 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(40 * 24 * 3), 3));
    boxLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    boxLines.frustumCulled = false; boxLines.renderOrder = 5; scene.add(boxLines);
  }
  boxLines.visible = true;
  const pos = boxLines.geometry.attributes.position.array, col = boxLines.geometry.attributes.color.array, road = world.road, q = {};
  let n = 0;
  const box = (s, d, hl, hw, yaw, h, r, g, b) => {
    if (n >= 40) return;
    const f = [Math.cos(yaw), -Math.sin(yaw)], rt = [Math.sin(yaw), Math.cos(yaw)], c = [];
    for (const [lx, ly] of [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]]) { road.toWorld(s + f[0] * lx + rt[0] * ly, d + f[1] * lx + rt[1] * ly, q); c.push([q.x, q.y + 0.04, q.z], [q.x, q.y + h, q.z]); }
    const edges = [[0, 2], [2, 4], [4, 6], [6, 0], [1, 3], [3, 5], [5, 7], [7, 1], [0, 1], [2, 3], [4, 5], [6, 7]];
    let o = n * 72;
    for (const [a, bb] of edges) for (const v of [c[a], c[bb]]) { pos[o] = v[0]; pos[o + 1] = v[1]; pos[o + 2] = v[2]; col[o] = r; col[o + 1] = g; col[o + 2] = b; o += 3; }
    n++;
  };
  box(sim.s, sim.d, sim.hl, sim.hw, sim.yaw, 1.3, 0.3, 1, 0.5);
  for (let i = 0; i < world.trafficCount; i++) {
    const c = world.traffic[i];
    if (Math.abs(c.s - sim.s) > 60) continue;
    box(c.s, c.d, c.hl, c.hw, c.yaw || 0, HB_H[KIND_IDS[c.kind]] || 1.45, 1, 0.35, 0.3);
  }
  boxLines.geometry.setDrawRange(0, n * 24);
  boxLines.geometry.attributes.position.needsUpdate = boxLines.geometry.attributes.color.needsUpdate = true;
}

// ---------------- two lives ----------------
let wreckScale = 1, wreckOff = 0;
const wreckLook = new THREE.Vector3();
function loseLife(e, ev) {
  if (wreck || !lives) return;
  lives -= 1;
  paintLives();
  const h = $('h-lives'); h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit');
  if (lives > 0) {
    const lost = ev.find((x) => x.type === 'lost');
    banner('LAST LIFE', lost ? `-${fmt(lost.pts)} lost · crash again and you blow up` : 'crash again and you blow up', '#ff3b4e');
  } else blowUp(e);
}
/** Second crash: the car goes up in a fireball and flies. */
function blowUp(e) {
  world.road.toWorld(sim.s + 14, sim.d, FP);
  wreckLook.set(FP.x, FP.y + 0.85, FP.z); // where the chase camera was looking, so the turn to the wreck is smooth
  world.road.toWorld(sim.s, sim.d, FP);
  wreck = new Wreck(scene, world.road, fire, smoke, boomLight, hi);
  wreck.onLand = (k, pos, small) => {
    sound.thud(k, small);
    if (!small) { shake = Math.max(shake, Math.min(0.9, k / 14)); FD.set(0, 0.4, 0); fx.burst(pos, FD, 14 + Math.floor(k), 8); }
  };
  carMesh.visible = true;
  wreck.start(carMesh, sim, e);
  FV.set(FP.x, FP.y + 0.8, FP.z); FD.set(0, 1, 0);
  fx.burst(FV, FD, 110, 16, BV.copy(CV).multiplyScalar(0.4));
  wreckT = 0; wreckAng = 0; wreckScale = 1; wreckOff = 0;
  sim.v = 0; sim.boosting = false; sim.braking = false; sim.draft = false;
  sound.boom(); shake = 1.8; flash();
  const k = routeKey(world.map.id, world.road.lanes);
  run.newBest = scorer.run > 0 && scorer.run > (save.lifeBests[k] || 0);
  if (run.newBest) { save.lifeBests[k] = scorer.run; persist(); }
  banner('WRECKED', run.newBest ? `New best run · ${fmt(scorer.run)}` : `${fmt(scorer.run)} this run`, '#ff5a3d');
  if (net) net.send({ t: 'ev', k: 'boom', p: scorer.run });
}
function updateWreck(dt) {
  wreckT += dt;
  // a moment of slow motion as it goes up
  wreckScale = wreckT < 0.06 ? 1 : wreckT < 0.95 ? 0.33 : Math.min(1, 0.33 + (wreckT - 0.95) * 1.6);
  wreck.update(dt * wreckScale);
  sim.s = wreck.body.s; sim.d = wreck.body.d; // the road and traffic stay built around the wreck
  world.road.toWorld(sim.s, sim.d, FP); fx.floorY = FP.y;
  if (wreckT > 3.4 && mode === 'play') showOver();
}
/** Down to the last life: smoke pours off the bonnet, with the odd lick of flame. */
function trail(dt) {
  trailAcc += dt * (9 + sim.v * 0.18);
  const roof = carMesh.userData.roofH;
  while (trailAcc > 1) {
    trailAcc -= 1;
    world.road.toWorld(sim.s + sim.hl * 0.45, sim.d + (Math.random() - 0.5) * sim.hw, FP);
    // carried along a little by the air over the car, so it streams back over the roof
    smoke.emit(FP.x, FP.y + roof * 0.8, FP.z, CV.x * 0.35 + (Math.random() - 0.5) * 0.6, 2.2 + Math.random() * 1.2, CV.z * 0.35 + (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.5, 0.5, 1.7 + Math.random() * 0.6, [0.4, 0.38, 0.36], [0.15, 0.145, 0.14], 0.6, 1.4);
    if (Math.random() < 0.07) fire.emit(FP.x, FP.y + roof * 0.55, FP.z, 0, 1.2, 0, 0.22, 0.25, 0.55, hi ? [4.2, 2.2, 0.7] : [1, 0.8, 0.35], hi ? [1.4, 0.18, 0.03] : [0.75, 0.12, 0.02], 0.8, 1);
  }
}
function showOver() {
  show('over');
  const mph = save.settings.units === 'mph';
  const dist = (Math.max(0, (wreck ? wreck.body.s : sim.s) - run.s0) / 1000) * (mph ? 0.6214 : 1);
  const secs = Math.floor(playTime);
  $('o-score').textContent = fmt(scorer.run);
  $('o-combo').textContent = fmt(run.best);
  $('o-dist').textContent = `${dist.toFixed(dist < 10 ? 2 : 1)} ${mph ? 'mi' : 'km'}`;
  $('o-cash').textContent = `+$${fmt(Math.max(0, save.cash - run.cash0))}`;
  $('o-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const lb = (gm === 'time' ? save.taBests : save.lifeBests)[routeKey(world.map.id, world.road.lanes)] || 0;
  $('o-sub').textContent = `${world.map.name} · ${world.road.lanes} lanes · ${GAME_MODES[gm].name.toLowerCase()}${gm === 'time' ? ` · ${cpCount} checkpoint${cpCount === 1 ? '' : 's'}` : ''}`;
  $('over').querySelector('h2').textContent = gm === 'time' ? 'Time up' : 'Wrecked';
  $('o-note').innerHTML = run.newBest ? '<b style="color:var(--green)">New best run on this route!</b>' : lb ? `Best run here: ${fmt(lb)}` : '';
  $('o-again').innerHTML = `${net ? 'Back in' : 'Drive again'} <small>R</small>`;
}
function driveAgain() {
  if (mode !== 'over') return;
  if (net) {
    // back in next to the others
    clearWreck();
    let best = null;
    const tmp = {};
    for (const p of net.players.values()) {
      const smp = net.sample(p, net.serverNow() - 150, tmp);
      if (smp && (!best || smp.s > best.s)) best = { s: smp.s, v: smp.v };
    }
    spawn(best ? Math.max(60, best.s - 45) : sim.s + 60, best ? Math.max(20, best.v) : 100 / 3.6);
    beginPlay();
  } else startSolo();
}
$('o-again').onclick = () => driveAgain();
$('o-menu').onclick = () => quitToMenu();

// ---------------- Free Period account + the owner's admin panel ----------------
function paintAccount() {
  const u = account.user;
  const chip = $('w-acct');
  chip.classList.toggle('in', !!u);
  $('w-acct-name').textContent = u ? u.username : 'Sign in';
  $('w-acct-role').classList.toggle('hidden', !account.owner);
  $('w-acct-sync').textContent = u ? ({ saved: 'saved', pending: 'saving…', saving: 'saving…' }[account.sync] || '') : 'to save';
  $('ac-in').classList.toggle('hidden', !u);
  $('ac-outv').classList.toggle('hidden', !!u);
  if (u) {
    $('ac-av').textContent = u.username.slice(0, 1).toUpperCase();
    $('ac-name').textContent = u.username;
    $('ac-role').textContent = account.owner ? 'Owner · every car is yours, and the admin panel is on the menu' : u.role === 'admin' ? 'Admin' : 'Free Period account';
    $('ac-sync').textContent = { saved: 'Your cash, cars, paint and best scores are saved to this account.', pending: 'Saving to your account…', saving: 'Saving to your account…' }[account.sync] || 'Checking your account…';
  }
  $('b-admin').classList.toggle('hidden', !account.owner);
}
/** The owner gets every car. */
function ownerPerks() {
  if (!account.owner) return;
  const missing = CARS.filter((c) => !save.owned.includes(c.id));
  if (!missing.length) return;
  save.owned.push(...missing.map((c) => c.id));
  persist(); refreshWallet();
  if (mode === 'garage') paintGarage(false);
}
/** The account had a newer save than this device: swap it in (only ever on the menus). */
function reloadSave() {
  const st = readStored(), settings = save.settings;
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, DEFAULTS(), st);
  save.settings = settings;
  fixSave();
  spec = carById(save.car); sim.setSpec(driveSpec());
  enterMenuWorld(); setCarModel(spec, paintOf(spec.id));
  refreshWallet();
  $('b-route').textContent = routeLabel();
  ownerPerks();
}
$('w-acct').onclick = () => { if (['menu', 'route', 'mp', 'settings', 'admin'].includes(mode)) { show('account'); paintAccount(); $('ac-msg').textContent = ''; } };
$('ac-back').onclick = () => show('menu');
async function doLogin(signUp) {
  const name = $('ac-user').value.trim(), pass = $('ac-pass').value, msg = $('ac-msg');
  if (!name || !pass) { msg.className = 'status err'; msg.textContent = 'Type your username and password first.'; return; }
  msg.className = 'status';
  msg.textContent = `${signUp ? 'Making your account' : 'Logging in'}… if nobody has played for a while the server takes up to a minute to wake up.`;
  $('ac-login').disabled = $('ac-signup').disabled = true;
  try {
    await logIn(name, pass, signUp);
    $('ac-pass').value = ''; msg.textContent = '';
  } catch (err) {
    msg.className = 'status err';
    msg.textContent = err.waking ? 'The account server did not answer. Try again in a minute.' : err.message;
  } finally { $('ac-login').disabled = $('ac-signup').disabled = false; }
}
$('ac-login').onclick = () => doLogin(false);
$('ac-signup').onclick = () => doLogin(true);
$('ac-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(false); });
$('ac-out').onclick = async () => { $('ac-out').disabled = true; try { await logOut(); } finally { $('ac-out').disabled = false; } };
$('ac-save').onclick = () => saveNow();

function paintAdmin() {
  $('a-cash').textContent = `$${fmt(save.cash)}`;
  for (const b of document.querySelectorAll('[data-k]')) b.classList.toggle('on', !!save.admin[b.dataset.k]);
  $('a-cars').textContent = `All ${CARS.length} cars are in your garage, in any paint.`;
}
$('b-admin').onclick = () => { if (!account.owner) return; show('admin'); paintAdmin(); };
$('a-back').onclick = () => show('menu');
for (const b of document.querySelectorAll('[data-cash]')) b.onclick = () => {
  if (!account.owner) return;
  const v = +b.dataset.cash;
  save.cash = v ? save.cash + v : 0;
  persist(); sound.buy(); paintAdmin(); refreshWallet();
};
for (const b of document.querySelectorAll('[data-k]')) b.onclick = () => {
  if (!account.owner) return;
  save.admin[b.dataset.k] = !save.admin[b.dataset.k];
  persist(); paintAdmin();
};
account.on(() => { paintAccount(); ownerPerks(); });
initAccount({ reload: reloadSave, pullOk: () => !['play', 'pause', 'garage', 'tune', 'over'].includes(mode) });

function flash() { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

// ---------------- kart racing (kart/): a glowing button with a pixel flag, and the liquid glass water both ways
const liquid = new Liquid(60);
const fromKart = cameThroughLiquid();
if (fromKart) liquid.cover();
{
  // a 16x16 checkered flag on a pole, two frames so it waves
  const px = (ph) => {
    let r = '';
    for (let y = 0; y < 16; y++) r += `<rect x="2" y="${y}" width="2" height="1" fill="${y ? '#b8c0d4' : '#ffc21a'}"/>`;
    for (let x = 4; x < 15; x++) {
      const off = Math.round(Math.sin((x - 4) * 0.7 + ph));
      for (let y = 1; y < 9; y++) r += `<rect x="${x}" y="${y + off}" width="1" height="1" fill="${(((x - 4) >> 1) + ((y - 1) >> 1)) % 2 ? '#10131c' : '#f4f6fb'}"/>`;
    }
    return r;
  };
  $('kb-px').innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><g class="fa">${px(0)}</g><g class="fb">${px(Math.PI)}</g></svg>`;
  // start fetching the kart page's code as soon as you point at the button
  const pre = () => { for (const f of ['main', 'parts', 'track', 'tracks', 'kart', 'race', 'items', 'ai', 'music']) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = `kart/js/${f}.js`; document.head.appendChild(l); } };
  $('b-kart').addEventListener('pointerenter', pre, { once: true }); $('b-kart').addEventListener('focus', pre, { once: true });
}
$('b-kart').onclick = async () => {
  if (liquid.busy) return;
  sound.click();
  $('liq-t2').innerHTML = 'K<i>A</i>RTS';
  await liquid.fill();
  $('liq-logo').classList.add('on');
  markLiquid();
  setTimeout(() => { location.href = 'kart/'; }, 250);
};

show('menu');
renderer.setAnimationLoop(frame);
if (fromKart) requestAnimationFrame(() => requestAnimationFrame(() => { document.documentElement.classList.remove('liq'); $('liq-cover').remove(); liquid.drain(); }));

// A friend's Join button on Free Period: ?join=CODE opens Multiplayer and joins that room (solo play is unchanged).
// Only inside Free Period's play page, which first checks that a chat friend is in that room: a bare game link with
// ?join= just opens the menu. It waits for the page to finish loading: a socket opened while the first frames compile
// can miss the server's pings.
const joinCode = (params.get('join') || '').trim().toUpperCase();
if (framed && /^[A-Z]{4}$/.test(joinCode)) {
  const deepJoin = () => setTimeout(() => { if (mode !== 'menu' || net) return; $('b-mp').onclick(); $('mp-code').value = joinCode; joinMp('join', joinCode); }, 0);
  if (document.readyState === 'complete') deepJoin(); else addEventListener('load', deepJoin, { once: true });
}

// handy for testing in the console
window.__cc = { cockpit, qte, setManual, shift, nextCam, openGarage, openTune, setCar: (id) => { spec = carById(id); sim.setSpec(driveSpec()); setCarModel(spec, paintOf(id)); }, get camMode() { return camMode; }, set camMode(v) { camMode = v; }, get spec() { return spec; }, sim, scorer, world, save, persist, sound, setRoute, get timeLeft() { return timeLeft; }, set timeLeft(v) { timeLeft = v; }, weather, get fps() { return fpsAvg; }, get mode() { return mode; }, startSolo, quitToMenu, get net() { return net; }, account, get lives() { return lives; }, get wreck() { return wreck; }, blowUp, loseLife, driveAgain, fire, smoke };
