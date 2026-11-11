// horror.exe: boots the renderer and menus, runs matches (solo or online), drives the camera, HUD and effects.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { Rig, nameTag, ownerTag, glowTex, tickRigFx, glitchFacesReady } from './rig.js';
import { account, refreshAccount, isOwnerAcct } from './account.js';
import { Fx, GlitchShader, RetroShader } from './fx.js';
import { Title } from './title.js';
import { finishBoot } from './boot.js';
import { openTask } from './tasks.js';
import { Sound } from './audio.js';
import { LocalSession, NetSession } from './net.js';
import { SERVER_URL } from './config.js';
import { CHARS, CHAR_IDS, VARIANTS, VARIANT_IDS, SURV, EXE, F, ST, PHASES, ROUND, TASKS, TASK, TASK_REACH, PORTAL, HIDE, QTE, AWAKEN, LEVEL, levelOf, moveSpeed, tickStamina } from '../shared/rules.js';
import { stepMove, body } from '../shared/move.js';
import { rayDist, terrainH, supportAt, solidAt, clampXZ, EXITS, V, S as HOLLOW, PORTALS, OBJ, ZONES, zoneAt, HALF, LAVA, GOO, ICE, L as LAKE, LOCKERS } from '../shared/map.js';
import { defaultLook, randomLook, sanitizeLook, SKINS, COLORS, SHIRT_STYLES, PATTERNS, FACES, HATS, LABELS } from '../shared/looks.js';
import { clamp, damp, wrap, turnTo } from '../shared/util.js';

const $ = (id) => document.getElementById(id);
window.__boot && window.__boot.set(0.6, 'STARTING ENGINE');
const params = new URLSearchParams(location.search);
// ?server= is a local-testing override only: on the real site it would let a link send this player's account token to
// any server (the hello message carries it), so it is honored on localhost / 127.0.0.1 alone.
const localHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const serverUrl = (localHost && params.get('server')) || SERVER_URL;
const httpUrl = serverUrl.replace(/^ws/, 'http');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowS = () => performance.now() / 1000;

// ------------------------------------------------------------------ save data
const KEY = 'horrorexe.v1';
let stored = {};
try { stored = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { stored = {}; }
const save = Object.assign({ name: '', look: null, char: 'bolt', variant: 'exe', soloRole: 'surv', stats: { rounds: 0, wins: 0, escapes: 0, shards: 0, downs: 0 } }, stored);
save.look = sanitizeLook(save.look || defaultLook());
if (!CHARS[save.char]) save.char = 'bolt';
if (!VARIANTS[save.variant]) save.variant = 'exe';
const weak = (navigator.hardwareConcurrency || 4) <= 4 || /CrOS|Android|iPhone|iPad/.test(navigator.userAgent);
save.settings = Object.assign({ vol: 0.7, sens: 1, quality: weak ? 'low' : 'high', invert: false, retro: true }, stored.settings || {});
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };
save.xp = Object.assign(Object.fromEntries([...CHAR_IDS, ...VARIANT_IDS].map((k) => [k, 0])), save.xp || {});
const UNLOCK_ALL = params.get('unlock') === '1';
const lvOf = (k) => levelOf(save.xp[k] || 0);
// your Free Period account (same as Bing Ball): your name comes from it, and the owner has everything unlocked
let acct = account();
const isOwner = () => isOwnerAcct(acct);
const unlocked = (k) => UNLOCK_ALL || isOwner() || lvOf(k).lv >= LEVEL.max;
const myUnlock = () => ({ q: unlocked(save.char), awaken: unlocked(save.variant) });
const myName = () => (acct.user ? acct.user.username.replace(/[^\w .\-]/g, '').slice(0, 16) : save.name.trim()) || 'Player';

// ------------------------------------------------------------------ renderer
const hi = save.settings.quality === 'high';
Rig.lowFx = !hi;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
// The 16-bit look renders the 3D world at about 400 lines and blows it up with crisp pixels
// (it's also much faster). prScale drops if the frame rate does.
let prScale = 1;
const pixelRatio = () => (save.settings.retro ? Math.min(1, (hi ? 400 : 330) / Math.max(200, innerHeight)) : Math.min(devicePixelRatio, hi ? 1.5 : 1)) * prScale;
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = hi;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);
const world = new World(renderer, save.settings.quality);
window.__boot && window.__boot.set(0.74, 'BUILDING ZONES');
const scene = world.scene;
scene.add(camera);
const lantern = new THREE.PointLight(0xffc8a0, hi ? 7 : 10, 24, 1.4);
scene.add(lantern);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: hi && !save.settings.retro && renderer.getPixelRatio() < 1.5 ? 4 : 0 }));
composer.addPass(new RenderPass(scene, camera));
if (hi) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.82));
const glitchPass = new ShaderPass(GlitchShader);
composer.addPass(glitchPass);
composer.addPass(new OutputPass());
const retroPass = new ShaderPass(RetroShader);
composer.addPass(retroPass);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
const fx = new Fx(glitchPass);
/** Shows the normal (0) or corrupted (1) world. */
function applyTheme(w) {
  world.setTheme(w);
  document.body.classList.toggle('corrupt', !!w);
  retroPass.uniforms.levels.value = w ? 6 : 7;
  renderer.toneMappingExposure = w ? 1.3 : 1.05;
  fx.corrupt = w;
}
const sound = new Sound();
sound.volume = save.settings.vol;
function applyRetro() {
  const on = !!save.settings.retro;
  renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  retroPass.enabled = on;
  renderer.domElement.classList.toggle('retro', on);
  document.body.classList.toggle('noretro', !on);
}
applyRetro();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyRetro(); });
let fpsAvg = 60, slowFor = 0;
function adaptResolution(dt) {
  slowFor = fpsAvg < 42 ? slowFor + dt : 0;
  if (slowFor > 3 && prScale > 0.55) {
    slowFor = 0;
    prScale = Math.max(0.55, prScale - 0.15);
    applyRetro();
  }
}

// ------------------------------------------------------------------ input
const touch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const input = { keys: new Set(), dx: 0, dy: 0, jump: false, abl: false, atk: false, q: false, f: false, g: false, v: false, ab2: false, sprintToggle: false, stick: { x: 0, y: 0 } };
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'KeyF', 'KeyR', 'KeyG', 'KeyV']);
addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (match && match.mini && (e.code === 'KeyQ' || e.code === 'KeyE')) { match.mini.press(e.code === 'KeyQ' ? 'Q' : 'E'); return; }
  input.keys.add(e.code);
  if (e.code === 'Space') input.jump = true;
  if (e.code === 'KeyE') input.abl = true;
  if (e.code === 'KeyQ') input.q = true;
  if (e.code === 'KeyF') input.f = true;
  if (e.code === 'KeyR') input.ab2 = true;
  if (e.code === 'KeyG') input.g = true;
  if (e.code === 'KeyV') input.v = true;
  if (e.code === 'Escape' && match && !touch && !document.pointerLockElement) togglePause();
  if (e.code === 'Backquote') { if (curScreen === 'admin') closeAdmin(); else openAdmin(); }
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
addEventListener('blur', () => input.keys.clear());
const canvas = renderer.domElement;
canvas.addEventListener('mousedown', (e) => {
  sound.start();
  if (!match || paused) return;
  if (!touch && document.pointerLockElement !== canvas) { canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
  if (e.button === 0) { input.atk = true; if (match.spectating) match.nextSpectate(); }
});
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { input.dx += e.movementX; input.dy += e.movementY; } });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && match && !match.done && !paused && !touch && curScreen !== 'admin' && !(match.mini && match.mini.task)) togglePause(true); });
const held = (...codes) => codes.some((c) => input.keys.has(c));
/** ADMIN.EXE switches (owner only). God mode and no cooldowns are also switched on in the round itself. */
const adm = { god: false, speed: false, fly: false, nocd: false };
let admExe = null;

// touch: left stick moves, dragging anywhere else looks
if (touch) {
  const stick = $('stick'), knob = $('knob');
  let sid = null, look = null;
  const setStick = (t) => {
    const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = (t.clientX - cx) / (r.width / 2), y = (t.clientY - cy) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    input.stick.x = x; input.stick.y = y; knob.style.transform = `translate(${x * 38}px, ${y * 38}px)`;
  };
  stick.addEventListener('touchstart', (e) => { sound.start(); sid = e.changedTouches[0].identifier; setStick(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) setStick(t);
      else if (look && t.identifier === look.id) { input.dx += (t.clientX - look.x) * 2.2; input.dy += (t.clientY - look.y) * 2.2; look.x = t.clientX; look.y = t.clientY; }
    }
  }, { passive: false });
  addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; input.stick.x = input.stick.y = 0; knob.style.transform = ''; } if (look && t.identifier === look.id) look = null; } });
  canvas.addEventListener('touchstart', (e) => { sound.start(); const t = e.changedTouches[0]; look = { id: t.identifier, x: t.clientX, y: t.clientY }; if (match && match.spectating) match.nextSpectate(); }, { passive: true });
  const btn = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); sound.start(); fn(); }, { passive: false });
  btn('tJump', () => { input.jump = true; input.keys.add('Space'); setTimeout(() => input.keys.delete('Space'), 450); });
  btn('tAbl', () => { input.abl = true; });
  btn('tAtk', () => { input.atk = true; });
  btn('tSense', () => { input.q = true; });
  btn('tDis', () => { input.f = true; });
  btn('tAb2', () => { input.ab2 = true; });
  btn('tG', () => { input.g = true; });
  btn('tV', () => { input.v = true; });
  btn('tAdm', () => openAdmin());
  btn('tQ', () => match && match.mini && match.mini.press('Q'));
  btn('tE', () => match && match.mini && match.mini.press('E'));
  btn('tSprint', () => { input.sprintToggle = !input.sprintToggle; $('tSprint').classList.toggle('on', input.sprintToggle); });
}

// ------------------------------------------------------------------ helpers for HUD
const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const setText = (el, txt) => { if (el._t !== txt) { el._t = txt; el.textContent = txt; } };
const setHTML = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
let bannerTimer = 0;
function banner(text, sub = '', cyan = false) {
  const b = $('banner');
  b.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  b.classList.toggle('cyan', cyan);
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(bannerTimer);
}
function feed(html) {
  const f = $('feed'), d = document.createElement('div');
  d.innerHTML = html; f.prepend(d);
  while (f.children.length > 5) f.lastChild.remove();
  setTimeout(() => d.remove(), 6500);
}
const tagOf = (v) => (v.role === 'exe' ? `<b style="color:#ff4a5a">${esc(VARIANTS[v.variant].name)}</b>` : v.own ? `<b class="own">👑 ${esc(v.name)}</b>` : `<b style="color:${CHARS[v.char].accent}">${esc(v.name)}</b>`);

function drawScareFaceInto(c, variant) { import('./rig.js').then((m) => m.drawScareFace(c.getContext('2d'), c.width, c.height, variant)); }

// ------------------------------------------------------------------ minimap backgrounds (one per world)
const miniCache = [null, null];
function minimapBg(w) {
  if (miniCache[w]) return miniCache[w];
  const N = 120, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), col = new THREE.Color();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N) * HALF * 2 - HALF, z = (j / N) * HALF * 2 - HALF, h = terrainH(x, z);
    col.set(zoneAt(x, z).color);
    if (w) col.lerp(new THREE.Color('#3a0a0c'), 0.6);
    if (h < -0.4) col.set(w ? '#5a0a10' : '#3a8aff');
    for (const p of LAVA) if (Math.hypot(x - p.x, z - p.z) < p.r) col.set('#ff6a1a');
    for (const p of GOO) if (Math.hypot(x - p.x, z - p.z) < p.r) col.set('#7aff3a');
    if (Math.hypot(x - ICE.x, z - ICE.z) < ICE.r) col.set(w ? '#6a6a88' : '#dff4ff');
    const shade = 0.55 + Math.min(0.45, h / 40);
    const k = (j * N + i) * 4;
    img.data[k] = col.r * 255 * shade; img.data[k + 1] = col.g * 255 * shade; img.data[k + 2] = col.b * 255 * shade; img.data[k + 3] = 235;
  }
  g.putImageData(img, 0, 0);
  return (miniCache[w] = c);
}

// ------------------------------------------------------------------ the match
const tmpPose = { x: 0, y: 0, z: 0, ry: 0 };
const v3 = new THREE.Vector3();
let match = null, paused = false;

class Match {
  constructor(session, { solo }) {
    this.s = session; this.solo = solo; this.me = session.me; this.info = session.info;
    this.views = new Map();
    this.myInfo = this.info.ents.find((e) => e.id === this.me) || null;
    this.spectator = !this.myInfo;
    this.role = this.myInfo ? this.myInfo.role : 'spec';
    this.kind = this.myInfo ? (this.role === 'exe' ? this.myInfo.variant : this.myInfo.char) : null;
    for (const e of this.info.ents) this.addView(e);
    this.exeVariant = (this.info.ents.find((e) => e.role === 'exe') || {}).variant || 'exe';
    world.setShards(this.info.shards); world.setExits(this.info.exits, false);
    this.ready = false; this.done = false; this.over = null;
    this.yaw = 0; this.pitch = -0.22; this.ry = 0;
    this.sta = { stamina: SURV.stamina, exhausted: false, rest: 0 };
    this.cd = { abl: 0, atk: 0, disguise: 0, ab2: 0, ab3: 0, ab4: 0 };
    this.until = { fly: 0, dash: 0, lunge: 0, fade: 0, atk: 0, pop: 0, hunt: 0, spin: 0, awake: 0, invis: 0, reach: 0 };
    this.unlock = myUnlock(); this.ghostRigs = new Map(); this.throws = [];
    this.viewW = -1; this.disRigs = new Map(); this.miniT = 0; this.decoyRigs = new Map(); this.flickT = 0; this.printT = 0; this.warnT = 0; this.mini = null; this.hiddenAt = 0;
    this.phase = 'intro'; this.lastPh = -1; this.lastSt = ST.alive;
    this.specId = null; this.spectating = this.spectator;
    this.absorbTick = 0; this.prevSprint = false;
    session.on.ev = (e) => this.onEvent(e);
    fx.exeView = this.role === 'exe';
    $('hud').classList.remove('hidden');
    $('feed').innerHTML = ''; $('markers').innerHTML = '';
    $('minimap').classList.remove('hidden'); $('tasks').classList.remove('hidden');
    this.buildSlots();
    this.startSpawn();
    this.tryStart();
    // the owner keeps their admin switches from round to round
    this.isOwn = !!(this.myInfo && this.myInfo.own);
    if (this.isOwn) { if (adm.god) session.admin({ c: 'god', on: true }); if (adm.nocd) session.admin({ c: 'nocd', on: true }); }
    $('tAdm').classList.toggle('hidden', !(touch && this.isOwn));
    if (this.isOwn) setTimeout(() => feed(`<b class="own">👑 OWNER</b> ${touch ? 'Tap ADM' : 'Press <kbd>\`</kbd>'} for ADMIN.EXE`), 1800);
  }

  /** ADMIN.EXE fly: straight through walls, Space to go up and C to go down. */
  noclip(b, dx, dz, speed, dt) {
    const v = Math.max(speed, 12) * 1.5, up = (held('Space') ? 1 : 0) - (held('KeyC') ? 1 : 0);
    const p = clampXZ({ x: b.x + dx * v * dt, z: b.z + dz * v * dt });
    b.vx = (p.x - b.x) / Math.max(dt, 1e-3); b.vz = (p.z - b.z) / Math.max(dt, 1e-3); b.vy = 0;
    b.x = p.x; b.z = p.z; b.y = clamp(b.y + up * v * dt, terrainH(b.x, b.z) - 2, 58);
    b.ground = false; b.lock = 0;
    return {};
  }

  addView(e) {
    const rig = new Rig({ role: e.role, look: e.look, char: e.char, variant: e.variant });
    scene.add(rig.root);
    const v = { id: e.id, role: e.role, char: e.char, variant: e.variant, name: e.name, bot: e.bot, own: !!e.own, rig, px: 0, pz: 0, speed: 0, atkStart: -1, wasAtk: false, ry: 0, first: true };
    const friendly = this.role !== 'exe' && e.role === 'surv' && e.id !== this.me;
    if (friendly) { v.tag = e.own ? ownerTag(e.name) : nameTag(e.name, CHARS[e.char].accent); v.tag.position.y = e.own ? 3.15 : 2.95; rig.root.add(v.tag); }
    if (e.role === 'surv') {
      const reveal = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff1a1a, transparent: true, opacity: 0.9, depthTest: false, blending: THREE.AdditiveBlending }));
      reveal.scale.set(3.4, 4.6, 1); reveal.position.y = 1.2; reveal.visible = false; reveal.renderOrder = 15; rig.root.add(reveal); v.reveal = reveal;
      const stars = new THREE.Group(); stars.position.y = 3.0; stars.visible = false; rig.root.add(stars); v.stars = stars;
    } else {
      const stars = new THREE.Group(); stars.position.y = 3.9; stars.visible = false; rig.root.add(stars); v.stars = stars;
      for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe066, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(0.45); stars.add(s); }
      const aura = new THREE.Group(); rig.root.add(aura); v.aura = aura;
      for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0xffd0d0 : i % 4 === 1 ? 0x000000 : 0xff1030 })); aura.add(b); }
    }
    this.views.set(e.id, v);
    return v;
  }

  tryStart() {
    const snap = this.s.latest;
    if (!snap) return;
    const mine = snap.pm.get(this.me);
    if (mine && !this.body) {
      const isExe = this.role === 'exe';
      this.body = body(mine[1], mine[2], mine[3], isExe ? EXE.radius : SURV.radius, isExe ? EXE.height : SURV.height, mine[11]);
      this.yaw = this.ry = mine[4];
    }
    this.ready = true;
  }

  buildSlots() {
    const sl = $('slots');
    this.slots = [];
    const mk = (key, name, accent) => { const d = document.createElement('div'); d.className = 'slot'; d.style.setProperty('--accent', accent); d.innerHTML = `<kbd>${key}</kbd><b>${esc(name)}</b><div class="cd hidden"></div>`; sl.appendChild(d); return { el: d, cdEl: d.querySelector('.cd') }; };
    sl.innerHTML = '';
    if (this.role === 'surv') {
      const c = CHARS[this.kind];
      this.slots.push({ ...mk(touch ? 'E' : 'E', c.abilityName, c.accent), key: 'abl', total: c.cd });
      this.slots.push({ ...mk('R', c.r.name, c.accent), key: 'ab2', total: c.r.cd });
      const q = mk('Q', this.unlock.q ? c.q.name : `🔒 ${c.q.name}`, c.accent); if (!this.unlock.q) q.el.classList.add('locked');
      this.slots.push({ ...q, key: 'ab3', total: c.q.cd, locked: !this.unlock.q });
    } else if (this.role === 'exe') {
      const v = VARIANTS[this.kind];
      this.slots.push({ ...mk(touch ? 'HIT' : 'CLICK', v.atkName, '#ff2a3a'), key: 'atk', total: v.atkCd });
      for (const [k, key] of [['abl', 'E'], ['ab2', 'R'], ['ab3', 'Q'], ['ab4', 'F']]) this.slots.push({ ...mk(key, v.moves[k].name, '#ff2a3a'), key: k, total: v.moves[k].cd });
      this.slots.push({ ...mk('G', 'Disguise', '#9a7aff'), key: 'disguise', total: EXE.disguiseCd });
      const aw = mk('V', this.unlock.awaken ? v.awake.name : `🔒 ${v.awake.name}`, '#ffd23d'); if (!this.unlock.awaken) aw.el.classList.add('locked');
      aw.el.insertAdjacentHTML('beforeend', '<div class="meter"><i></i></div>');
      this.slots.push({ ...aw, key: 'awaken', total: 1, locked: !this.unlock.awaken, meter: aw.el.querySelector('.meter i') });
    }
    $('hearts').classList.toggle('hidden', this.role !== 'surv');
    $('stam').classList.toggle('hidden', this.role !== 'surv');
    $('touch').classList.toggle('hidden', !touch);
    $('tAtk').classList.toggle('hidden', this.role !== 'exe');
    $('tSense').classList.toggle('hidden', this.role !== 'exe');
    $('tDis').textContent = this.role === 'exe' ? 'F' : 'USE';
    $('tG').classList.toggle('hidden', this.role !== 'exe'); $('tV').classList.toggle('hidden', this.role !== 'exe' || !this.unlock.awaken);
    $('tSense').textContent = 'Q';
    $('tDis').classList.toggle('hidden', this.role === 'spec');
    $('tAb2').classList.toggle('hidden', this.role !== 'exe');
    $('revInfo').classList.toggle('hidden', this.role !== 'surv');
    $('tSprint').classList.toggle('hidden', this.role !== 'surv');
  }

  showIntro() {
    const box = $('introBox');
    if (this.role === 'exe') {
      const v = VARIANTS[this.kind];
      box.innerHTML = `<div class="who">You are</div><h1 class="glitch" data-text="${esc(v.name)}" style="color:#ff2a3a">${esc(v.name)}</h1><p>${esc(v.role)}: ${esc(v.desc)} Catch them before they escape.</p><p style="color:var(--muted)">Click ${esc(v.atkName)} · E ${esc(v.moves.abl.name)} · R ${esc(v.moves.ab2.name)} · Q ${esc(v.moves.ab3.name)} · F ${esc(v.moves.ab4.name)}<br>G disguise as a survivor (normal world) · click a locker to rip it open${this.unlock.awaken ? `<br><b style="color:#ffd23d">V ${esc(v.awake.name)}</b> when your meter is full: ${esc(v.awake.desc)}` : `<br>Reach level 10 with ${esc(v.name)} to unlock its Awakening.`}</p>`;
    } else if (this.role === 'surv') {
      const c = CHARS[this.kind];
      box.innerHTML = `<div class="who">You are</div><h1 style="color:${c.accent}">${esc(c.name)}</h1><p>Finish the 5 zone tasks to open the escape gates early (some are in the corrupted world: use the rift portals). Escape through a gate in the corrupted world.</p><p style="color:#ffb0b0">EXE can disguise as one of your friends in the normal world. You have 3 hearts and can be revived once.</p><p style="color:var(--muted)">${touch ? 'USE' : 'F'} near a task to open its minigame (you stand still while you do it). ${touch ? 'USE' : 'F'} near a locker to hide (not while EXE is watching, and not for too long).</p><p style="color:var(--muted)">E ${esc(c.abilityName)} · R ${esc(c.r.name)} · Q ${this.unlock.q ? esc(c.q.name) : `${esc(c.q.name)} (unlocks at level 10)`}</p>`;
    } else box.innerHTML = `<div class="who">Round in progress</div><h1>Watching</h1><p>You'll join the next round.</p>`;
    $('intro').classList.remove('hidden', 'corner');
    clearTimeout(this.introT); clearTimeout(this.introT2);
    this.introT = setTimeout(() => $('intro').classList.add('corner'), 2600);
    this.introT2 = setTimeout(() => $('intro').classList.add('hidden'), 7600);
    if (this.role === 'exe') setTimeout(() => sound.play('laugh', 0.8), 600);
  }

  // ---------------------------------------------------------------- spawning in
  /** The round opens like a cartridge loading a level: a LOADING ZONE card that tears apart into pixel blocks
   *  while everyone glitches into place out of red and black cubes. */
  startSpawn() {
    const me = this.s.latest && this.s.latest.pm.get(this.me);
    const z = me ? zoneAt(me[1], me[3]) : ZONES[0];
    const who = this.role === 'exe' ? VARIANTS[this.kind].name : this.role === 'surv' ? CHARS[this.kind].name : '';
    const c = $('spawnCv'), W = 320, H = Math.max(160, Math.round((W * innerHeight) / Math.max(1, innerWidth)));
    c.width = W; c.height = H; c.classList.remove('hidden');
    const card = document.createElement('canvas'); card.width = W; card.height = H;
    this.spawn = { t: 0, c, g: c.getContext('2d'), card, cg: card.getContext('2d'), zone: z.name.toUpperCase(), who: who.toUpperCase(), order: null, compiled: false, intro: false };
    this.drawSpawnCard(0);
    c.getContext('2d').drawImage(card, 0, 0);
  }

  drawSpawnCard(p) {
    const S = this.spawn, g = S.cg, W = S.card.width, H = S.card.height;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { g.fillStyle = y % 4 ? 'rgba(60,0,6,0.35)' : 'rgba(0,0,0,0)'; g.fillRect(0, y, W, 1); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = (t, y, size, col) => { g.font = `${size}px "Press Start 2P", monospace`; g.fillStyle = '#000'; g.fillText(t, W / 2 + 2, y + 2); g.fillStyle = col; g.fillText(t, W / 2, y); };
    txt('LOADING ZONE', H * 0.24, 8, '#ff2a3a');
    txt(S.zone, H * 0.36, S.zone.length > 13 ? 13 : 16, '#ffffff');
    txt('ACT 1', H * 0.46, 8, '#ffd23d');
    if (S.who) txt((this.role === 'exe' ? 'HUNT AS ' : 'YOU ARE ') + S.who, H * 0.78, 8, this.role === 'exe' ? '#ff4a5a' : '#cfe6ff');
    // a chunky bar that stalls for a moment near the end
    const q = p < 0.6 ? p : p < 0.82 ? 0.6 + (p - 0.6) * 0.25 : Math.min(1, 0.655 + (p - 0.82) * 1.95), n = 20, bw = 9, x0 = W / 2 - (n * (bw + 2)) / 2, y = H * 0.6;
    g.fillStyle = '#4a0c14'; g.fillRect(x0 - 4, y - 4, n * (bw + 2) + 6, 18);
    g.fillStyle = '#000'; g.fillRect(x0 - 2, y - 2, n * (bw + 2) + 2, 14);
    for (let i = 0; i < Math.floor(q * n); i++) { g.fillStyle = i % 2 ? '#c8001a' : '#ff2a3a'; g.fillRect(x0 + i * (bw + 2), y, bw, 10); }
    txt(`${Math.floor(q * 100)}%`, y + 24, 8, '#b39a9e');
    if (Math.random() < 0.3) { const ty = Math.random() * H, th = 2 + Math.random() * 8; g.drawImage(S.card, 0, ty, W, th, (Math.random() - 0.5) * 20, ty, W, th); }
  }

  updateSpawn(dt) {
    const S = this.spawn;
    if (!S) return;
    S.t += dt;
    // compile the new monster and survivor materials now, behind the card, instead of hitching later
    if (!S.compiled && S.t > 0.05) { S.compiled = true; try { renderer.compile(scene, camera); } catch {} }
    const g = S.g, W = S.c.width, H = S.c.height;
    if (S.t < 1.0) { this.drawSpawnCard(Math.min(1, S.t / 0.85)); g.clearRect(0, 0, W, H); g.drawImage(S.card, 0, 0); }
    else if (S.t < 1.75) {
      const bs = 16, cols = Math.ceil(W / bs), rows = Math.ceil(H / bs);
      if (!S.order) {
        S.order = Array.from({ length: cols * rows }, (_, i) => i);
        for (let i = S.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [S.order[i], S.order[j]] = [S.order[j], S.order[i]]; }
        this.assembleT = 0; sound.play('static', 0.6); fx.pulse('glitch', 0.8);
      }
      const p = (S.t - 1.0) / 0.75, n = Math.floor(S.order.length * Math.min(1, p * 1.1));
      g.clearRect(0, 0, W, H); g.drawImage(S.card, 0, 0);
      for (let i = 0; i < n; i++) { const k = S.order[i]; g.clearRect((k % cols) * bs, Math.floor(k / cols) * bs, bs, bs); }
      // some of the blocks still standing slip sideways or flash red
      for (let i = 0; i < 16 && n < S.order.length; i++) {
        const k = S.order[n + Math.floor(Math.random() * (S.order.length - n))], x = (k % cols) * bs, y = Math.floor(k / cols) * bs;
        if (Math.random() < 0.5) { g.fillStyle = Math.random() < 0.6 ? '#ff1a2a' : '#000'; g.fillRect(x, y, bs, bs); } else g.drawImage(S.card, x, y, bs, bs, x + (Math.random() - 0.5) * 28, y, bs, bs);
      }
    } else { S.c.classList.add('hidden'); this.spawn = null; }
    if (!S.intro && S.t > 1.3) { S.intro = true; this.showIntro(); }
  }

  /** Everyone in view builds up out of a swarm of red, black and white cubes, flickering in. */
  updateAssemble(dt) {
    this.assembleT += dt;
    const p = Math.min(1, this.assembleT / 1.15);
    if (!this.cubes) {
      const views = [...this.views.values()].filter((v) => v.rig.root.visible || v.id === this.me);
      const per = 56, N = Math.max(1, views.length * per);
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
      mesh.frustumCulled = false;
      const cols = [new THREE.Color(0xff1a2a), new THREE.Color(0x050505), new THREE.Color(0xffffff), new THREE.Color(0x8a0010)];
      const list = [];
      views.forEach((v) => {
        const tall = v.role === 'exe' ? 3.4 : 2.5;
        for (let i = 0; i < per; i++) {
          const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 - 0.2, Math.random() - 0.5).normalize();
          list.push({ v, off: new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.1 + Math.random() * tall, (Math.random() - 0.5) * 0.7), d, dist: 2.5 + Math.random() * 3.5, delay: Math.random() * 0.35, size: 0.1 + Math.random() * 0.12 });
          mesh.setColorAt(list.length - 1, cols[i % 4]);
        }
      });
      scene.add(mesh);
      this.cubes = { mesh, list, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), pos: new THREE.Vector3(), sc: new THREE.Vector3() };
    }
    const C = this.cubes;
    C.list.forEach((c, i) => {
      const q = clamp((p - c.delay) / 0.62, 0, 1), e = 1 - (1 - q) ** 3, root = c.v.rig.root;
      C.pos.copy(root.position).add(c.off).addScaledVector(c.d, (1 - e) * c.dist);
      const k = c.size * (q > 0.85 ? 1 - (q - 0.85) / 0.15 : 1) * (c.v.rig.root.visible || c.v.id === this.me ? 1 : 0);
      C.e.set(i + p * 9, i * 0.7 + p * 6, 0); C.q.setFromEuler(C.e); C.sc.setScalar(Math.max(0.0001, k));
      C.mesh.setMatrixAt(i, C.m.compose(C.pos, C.q, C.sc));
    });
    C.mesh.instanceMatrix.needsUpdate = true;
    // the bodies flicker in as the cubes arrive
    for (const v of this.views.values()) {
      const r = v.rig.root;
      if (!r.visible) continue;
      r.visible = Math.random() < 0.06 + p * p;
      r.position.x += (Math.random() - 0.5) * (1 - p) * 0.4;
    }
    if (p >= 1) { this.endAssemble(); }
  }
  endAssemble() {
    if (this.cubes) { scene.remove(this.cubes.mesh); this.cubes.mesh.geometry.dispose(); this.cubes.mesh.material.dispose(); this.cubes.mesh.dispose(); this.cubes = null; }
    this.assembleT = null;
  }

  myEntry() { return this.s.latest ? this.s.latest.pm.get(this.me) : null; }
  aliveLike(st) { return st === ST.alive || st === ST.down; }

  pushState(force) {
    if (!this.body) return;
    const b = this.body;
    const f = (this.prevSprint ? F.SPRINT : 0) | (b.ground ? 0 : F.AIR) | (b.water ? F.WATER : 0);
    if (force && this.s.online) this.s.sentAt = 0;
    this.s.sendState({ x: b.x, y: b.y, z: b.z, ry: this.ry, f });
  }

  /** k: 'abl' (E), 'ab2' (R), 'ab3' (Q), 'ab4' (F, monsters only). Predicts the move locally, the round decides the rest. */
  useMove(k, t, st, sf) {
    if (st !== ST.alive || t < this.cd[k] || sf & F.STUN) return;
    const b = this.body;
    if (this.role === 'surv') {
      const c = CHARS[this.kind];
      if (sf & F.SLOWED) { feed('Static is blocking your abilities'); return; }
      if (k === 'abl') {
        if (c.ability === 'dash') {
          const sp = Math.hypot(b.vx, b.vz), dir = sp > 1 ? Math.atan2(b.vx, b.vz) : this.yaw;
          this.ry = dir; this.cd.abl = t + c.cd; this.until.dash = t + c.dur;
          b.vx = Math.sin(dir) * c.dashSpeed; b.vz = Math.cos(dir) * c.dashSpeed; b.vy = Math.max(b.vy, 0); b.lock = c.dur;
          sound.play('dash'); fx.pulse('glitch', 0.25);
        } else if (c.ability === 'fly') { this.cd.abl = t + c.cd; this.until.fly = t + c.dur; sound.play('fly'); }
        else { this.ry = this.yaw; this.cd.abl = t + c.missCd; this.until.atk = t + 0.35; sound.play('swing'); }
      } else {
        const ab = k === 'ab2' ? c.r : c.q;
        if (k === 'ab3' && !this.unlock.q) { feed(`${esc(c.q.name)} unlocks at level 10 with ${esc(c.name)}`); return; }
        this.cd[k] = t + ab.cd;
        if (ab.id === 'wind') { this.sta.stamina = SURV.stamina; this.sta.exhausted = false; sound.play('dash'); }
        else if (ab.id === 'after') { this.until.invis = t + ab.dur; sound.play('fade'); fx.pulse('glitch', 0.4); }
        else if (ab.id === 'wrench' || ab.id === 'pound' || ab.id === 'spin') { this.ry = this.yaw; this.until.atk = t + 0.35; sound.play('swing'); }
        else if (ab.id === 'iron') sound.play('punch');
        else if (ab.id === 'turbo' || ab.id === 'heal') sound.play('revive', 0.6);
      }
      this.pushState(true);
      this.s.action({ k });
      return;
    }
    if (this.phase === 'intro' || this.disguised || t < this.until.pop || t < this.until.spin) return;
    const v = VARIANTS[this.kind], mv = v.moves[k], aw = t < this.until.awake;
    this.cd[k] = t + mv.cd * (aw ? v.awake.cdMul : 1);
    this.ry = this.yaw;
    switch (mv.id) {
      case 'dash': {
        const dur = mv.dur * (aw ? 1.4 : 1);
        this.until.lunge = t + dur; b.vx = Math.sin(this.yaw) * mv.speed; b.vz = Math.cos(this.yaw) * mv.speed; b.lock = dur;
        sound.play('lunge');
        break;
      }
      case 'spin': this.until.spin = t + mv.dur; sound.play('lunge'); fx.pulse('glitch', 0.3); break;
      case 'hunt': this.until.hunt = t + mv.dur; sound.play('hunt'); fx.pulse('sense'); break;
      case 'echo': case 'ping': case 'scent': sound.play('sense'); fx.pulse('sense'); break;
      case 'blink': {
        this.s.action({ k });
        let d = mv.dist, p = null;
        for (; d > 2; d -= 1) {
          p = clampXZ({ x: b.x + Math.sin(this.yaw) * d, z: b.z + Math.cos(this.yaw) * d });
          const y = supportAt(p.x, p.z, terrainH(p.x, p.z) + 0.5, false, b.w);
          if (!solidAt(p.x, p.z, y, b.r, b.h, b.w)) { p.y = y; break; }
          p = null;
        }
        if (p) { this.blinkFrom(b.x, b.y, b.z); b.x = p.x; b.y = p.y; b.z = p.z; b.vx = b.vz = b.vy = 0; }
        sound.play('blink'); fx.pulse('glitch', 0.9);
        this.pushState(true);
        return;
      }
      case 'static': sound.play('staticfield'); fx.pulse('glitch', 0.6); break;
      case 'dice': sound.play('blink'); fx.pulse('glitch', 0.7); break;
      case 'fade': this.until.fade = t + mv.dur; sound.play('fade'); fx.pulse('static', 0.5); break;
      case 'decoy': sound.play('decoy'); break;
      case 'reach': this.until.reach = t + 0.45; sound.play('swing'); break;
    }
    this.pushState(true);
    this.s.action({ k });
  }

  attack(t, st, sf) {
    if (this.role !== 'exe' || st !== ST.alive || t < this.cd.atk || sf & F.STUN || this.phase === 'intro' || t < this.until.pop || t < this.until.spin) return;
    if (this.disguised) {
      // first click while disguised: pop out of the disguise (a short freeze while it transforms)
      this.until.pop = t + EXE.popTime; this.cd.atk = t + EXE.popTime; this.cd.disguise = t + EXE.disguiseCd; this.disguised = 0;
      this.ry = this.yaw;
      sound.play('pop'); fx.pulse('pop');
      this.pushState(true);
      this.s.action({ k: 'atk' });
      return;
    }
    const v = VARIANTS[this.kind];
    this.cd.atk = t + v.atkCd * (t < this.until.awake ? 0.8 : 1); this.until.atk = t + 0.35; this.until.fade = 0;
    this.ry = this.yaw;
    sound.play('swing', this.kind === 'grin' ? 1 : 0.7);
    this.pushState(true);
    this.s.action({ k: 'atk' });
  }

  awaken(t, st, meter) {
    if (this.role !== 'exe' || st !== ST.alive || this.disguised || this.phase === 'intro') return;
    const v = VARIANTS[this.kind];
    if (!this.unlock.awaken) { feed(`Awakening unlocks at level 10 with ${esc(v.name)}`); return; }
    if (this.awakeUsed) { feed('You already awakened this round'); return; }
    if (meter < 100) { feed(`Your meter is at ${meter}%. Hit survivors to fill it faster.`); return; }
    this.awakeUsed = true;
    this.pushState(true);
    this.s.action({ k: 'awaken' });
  }

  hide(st) {
    if (this.role !== 'surv' || st !== ST.alive || this.mini) return;
    this.pushState(true);
    this.s.action({ k: 'hide' });
  }

  disguise(t, st) {
    if (this.role !== 'exe' || st !== ST.alive || this.disguised || t < this.cd.disguise || this.phase === 'intro') return;
    if (this.viewW !== 0) { feed('You can only disguise in the <b>normal world</b>'); return; }
    sound.play('fade'); fx.pulse('glitch', 0.5);
    this.s.action({ k: 'disguise' });
  }

  blinkFrom(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: [0xff1030, 0x000000, 0xffffff, 0x2affea][i % 4] })); m.position.set((Math.random() - 0.5) * 1.6, Math.random() * 3.2, (Math.random() - 0.5) * 1.6); m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3); g.add(m); }
    scene.add(g);
    this.bursts = this.bursts || [];
    this.bursts.push({ g, t: 0.9 });
  }

  nextSpectate() {
    const snap = this.s.latest; if (!snap) return;
    const ids = [...this.views.values()].filter((v) => { const e = snap.pm.get(v.id); return e && this.aliveLike(e[6]) && v.id !== this.me; }).map((v) => v.id);
    if (!ids.length) return;
    const i = ids.indexOf(this.specId);
    this.specId = ids[(i + 1) % ids.length];
  }

  // ------------------------------------------------------------------ events from the round
  onEvent(e) {
    const v = this.views.get(e.id), by = this.views.get(e.by);
    const mine = e.id === this.me;
    // sounds from the other world are not heard
    const vol = (id) => { const w = this.views.get(id); if (!w || !this.camFocus) return 0.6; if (w.w !== this.viewW) return 0; return clamp(1 - w.rig.root.position.distanceTo(this.camFocus) / 70, 0.05, 1); };
    const TASK_NAMES = { shards: 'Dreamy Hills', valves: 'Toxic Works', panels: 'Neon Jackpot', core: 'Frostbite Peak', bells: 'Ember Ruins' };
    switch (e.k) {
      case 'phase':
        if (e.ph === 'play') {
          if (this.role === 'exe') banner('HUNT THEM', 'You are free.'); else banner("IT'S AWAKE", 'Do the zone tasks. Keep moving.');
          sound.play('go'); sound.play('laugh', 0.6); fx.pulse('static', 1);
        }
        break;
      case 'shard': {
        const n = e.n;
        sound.play('shard', e.by === this.me ? 1 : 0.45);
        if (e.by === this.me) fx.pulse('shard');
        feed(`${by ? tagOf(by) : 'Someone'} absorbed a shard <b>${n}/${ROUND.SHARDS}</b>`);
        break;
      }
      case 'lit':
        sound.play('tick'); if (this.role === 'surv') feed('A new shard is glowing');
        break;
      case 'exits':
        banner('THE GATES ARE OPEN', `${e.why === 'tasks' ? 'All 5 tasks done.' : 'Time is up.'} Reach a gate in the corrupted world!`, true);
        sound.play('exits'); fx.pulse('exits');
        world.setExits(this.info.exits, true);
        break;
      case 'hit':
        if (mine) { fx.pulse('hit', Math.min(1.2, (e.dmg || 100) / 80)); sound.play('hit', Math.min(1, 0.5 + (e.dmg || 100) / 200)); banner(`-${e.dmg || ''}`, 'Run!'); fx.taunt(this.exeVariant); if (this.exeVariant === 'exe') holdFrames = 4; }
        else sound.play('hit', vol(e.id) * 0.8);
        if (e.by === this.me) { sound.play('laugh', 0.5); fx.pulse('static', 0.4); }
        if (v) feed(`${by ? tagOf(by) : 'EXE'} hit ${tagOf(v)}`);
        break;
      case 'down':
        if (mine) { fx.jumpscare(this.exeVariant); sound.play('scare'); }
        else { sound.play('down', vol(e.id)); if (this.role === 'surv') fx.pulse('static', 0.5); }
        if (e.by === this.me) sound.play('laugh', 0.8);
        if (v) feed(`${tagOf(v)} is <b style="color:#ff4a5a">DOWN</b>${this.role === 'surv' && !mine ? '. Revive them!' : ''}`);
        break;
      case 'revive':
        sound.play('revive', mine || e.by === this.me ? 1 : vol(e.id));
        if (mine) banner('BACK ON YOUR FEET', '', true);
        if (v) feed(`${by ? tagOf(by) : 'Someone'} revived ${tagOf(v)}`);
        break;
      case 'out':
        if (v) feed(`${tagOf(v)} was <b style="color:#ff4a5a">${e.why === 'dragged' ? 'dragged away by EXE' : 'taken'}</b>${e.why === 'norevive' ? ' (no revives left)' : ''}`);
        if (mine) { banner(e.why === 'dragged' ? 'DRAGGED AWAY' : 'YOU WERE TAKEN', e.why === 'dragged' ? 'You hid too long, twice.' : 'Click to watch the others'); fx.jumpscare(this.exeVariant); sound.play('scare'); }
        break;
      case 'hide':
        world.doorLocker(e.i);
        if (mine) { sound.play('locker'); feed(`Hiding. EXE can't see you or sense you. Leave within ${HIDE.max}s.`); }
        else sound.play('locker', vol(e.id) * 0.6);
        break;
      case 'unhide':
        if (mine) sound.play('locker'); else sound.play('locker', vol(e.id) * 0.6);
        break;
      case 'hide-denied':
        if (mine) { banner('IT SEES YOU', "You can't hide while EXE is watching"); sound.play('denied'); fx.pulse('static', 0.5); }
        break;
      case 'eject':
        if (mine && this.body) { const b = this.body; b.x = e.x; b.y = e.y; b.z = e.z; b.vx = b.vy = b.vz = 0; this.ry = e.ry; }
        break;
      case 'rip': {
        world.ripLocker(e.i, !!e.hit);
        sound.play('rip', e.id === this.me ? 1 : vol(e.id) || (e.hit === this.me ? 1 : 0));
        if (e.id === this.me) feed(e.hit ? 'Found one!' : 'Empty...');
        else if (e.hit && this.views.get(e.hit)) feed(`EXE ripped open a locker and found ${tagOf(this.views.get(e.hit))}`);
        break;
      }
      case 'qte':
        if (mine) this.startMinigame(e.reason);
        else if (v) feed(`EXE is dragging ${tagOf(v)} out of a locker!`);
        break;
      case 'qte-end':
        if (mine) { if (this.mini) this.mini.close(); banner(e.ok ? 'YOU BROKE FREE' : 'IT GOT YOU', e.ok ? '' : 'You lost a life', e.ok); sound.play(e.ok ? 'qtewin' : 'qtefail'); if (!e.ok) fx.pulse('hit'); }
        break;
      case 'ab2': {
        const nm = { hunt: 'hunt', static: 'staticfield', decoy: 'decoy' }[e.ab];
        if (e.id !== this.me) sound.play(nm, vol(e.id));
        if (e.ab === 'hunt' && this.role === 'surv' && v && v.w === this.viewW) { fx.say("IT'S HUNTING YOU"); fx.pulse('sense'); }
        break;
      }
      case 'decoy-pop':
        if (mine) { fx.pulse('pop'); sound.play('decoypop'); fx.say('NOT REAL'); }
        else if (this.camFocus) { const d = Math.hypot(e.x - this.camFocus.x, e.z - this.camFocus.z); if (d < 40) sound.play('decoypop', clamp(1 - d / 40, 0.1, 0.6)); }
        break;
      case 'esc':
        sound.play('escape', mine ? 1 : 0.4);
        if (v) feed(`${tagOf(v)} <b style="color:var(--cyan)">escaped</b>`);
        if (mine) { banner('YOU ESCAPED', 'Click to watch the others', true); fx.pulse('escape'); }
        break;
      case 'atk': if (e.id !== this.me) sound.play('swing', vol(e.id)); break;
      case 'abl': {
        const SFX = { dash: e.id && v && v.role === 'exe' ? 'lunge' : 'dash', fly: 'fly', punch: e.hit ? 'punch' : 'miss', bonk: e.hit ? 'bonk' : 'miss', spin: 'lunge', hunt: 'hunt', echo: 'sense', ping: 'sense', scent: 'sense', blink: 'blink', static: 'staticfield', dice: 'blink', fade: 'fade', decoy: 'decoy', reach: 'swing' };
        if (e.id !== this.me) { if (SFX[e.ab]) sound.play(SFX[e.ab], vol(e.id)); if (v) v.ablStart = nowS(); if (e.ab === 'reach' && v) v.reachStart = nowS(); }
        else if (e.hit && (e.ab === 'punch' || e.ab === 'bonk')) { this.cd.abl = nowS() + CHARS[this.kind].cd; sound.play(e.ab === 'bonk' ? 'bonk' : 'punch'); }
        if ((e.ab === 'punch' || e.ab === 'bonk') && e.hit) { sound.play('stun', e.target === this.me ? 1 : vol(e.target)); if (v) feed(`${tagOf(v)} ${e.ab === 'bonk' ? 'bonked' : 'stunned'} EXE`); if (e.target === this.me) fx.pulse('glitch', 0.6); }
        if (this.role === 'surv' && v && v.role === 'exe' && v.w === this.viewW) {
          if (e.ab === 'echo' && e.ids && e.ids.includes(this.me)) { fx.say('IT HEARD YOU'); fx.pulse('static', 0.8); }
          if (e.ab === 'ping') { fx.say('IT SEES EVERYONE'); fx.pulse('glitch', 0.6); feed('Corrupt Ping: Glitch.exe can see you, and you can see it'); }
          if (e.ab === 'scent' && e.target === this.me) { fx.say('IT SMELLS YOUR BLOOD'); fx.pulse('static', 0.8); }
          if (e.ab === 'hunt') { fx.say("IT'S HUNTING YOU"); fx.pulse('sense'); }
        }
        if (e.ab === 'dice' && e.rolls) {
          const NAMES = { warp: 'warped behind someone', swap: 'swapped places with someone', invert: 'flipped everyone\'s controls', storm: 'made a static storm' };
          if (e.id === this.me) feed(`Dice: ${e.rolls.map((r) => NAMES[r]).join(' + ')}`);
          else if (this.role === 'surv' && e.rolls.includes('invert') && v && v.w === this.viewW) { banner('CONTROLS FLIPPED', 'Glitch.exe rolled the dice'); fx.pulse('glitch', 1); }
        }
        if (e.ab === 'reach' && e.hit === this.me) { banner('GRABBED', ''); sound.play('scare', 0.6); fx.pulse('pop'); }
        break;
      }
      case 'sab': {
        const SFX = { wind: 'dash', after: 'fade', wrench: 'swing', turbo: 'revive', pound: 'punch', iron: 'punch', heal: 'revive', spin: 'bonk' };
        if (e.id !== this.me) sound.play(SFX[e.ab], vol(e.id)); else if (e.ab === 'pound' || e.ab === 'spin') sound.play(e.hit ? SFX[e.ab] : 'miss');
        if (v) v.ablStart = nowS();
        if (e.ab === 'wrench' && v) { this.throwWrench(v, e); if (e.hit) { sound.play('bonk', e.id === this.me ? 1 : vol(e.id)); feed(`${tagOf(v)} hit EXE with a wrench`); } else if (e.id === this.me) feed('Missed!'); }
        if (e.ab === 'pound' && e.hit && v) feed(`${tagOf(v)} ground-pounded EXE`);
        if (e.ab === 'spin' && e.hit && v) feed(`${tagOf(v)} hammer-spun EXE`);
        if (e.ab === 'heal' && v) { const who = this.views.get(e.target); feed(`${tagOf(v)} healed ${who ? tagOf(who) : 'someone'}`); if (e.target === this.me) { banner('+1 HEART', '', true); sound.play('revive'); } }
        if (e.ab === 'turbo' && v) feed(`${tagOf(v)}: Turbo Gadget! Tasks near ${esc(v.name)} go twice as fast`);
        if (e.ab === 'iron' && v && e.id !== this.me) feed(`${tagOf(v)} turned to iron`);
        if (e.id === this.me && e.ab === 'heal' && e.target !== this.me) sound.play('revive');
        break;
      }
      case 'awaken': {
        const AW = VARIANTS[e.v].awake;
        if (mine) { this.until.awake = nowS() + AWAKEN.dur; banner(AW.name.toUpperCase(), 'AWAKENED'); }
        else if (v && v.w === this.viewW) { banner(`${VARIANTS[e.v].name} AWAKENED`, AW.name, false); fx.pulse('pop'); }
        sound.play('hunt'); sound.play('laugh', 0.9); fx.pulse('sense');
        feed(`<b style="color:#ffd23d">${esc(VARIANTS[e.v].name)} awakened: ${esc(AW.name)}</b>`);
        break;
      }
      case 'admin': {
        const NAMES = { god: 'God mode', nocd: 'No cooldowns', meter: 'Awakening meter filled', tasks: 'finished every task', time: 'changed the clock', world: 'Switched worlds', tp: 'Teleported', end: 'ended the round' };
        if (mine) { if (['god', 'nocd', 'meter'].includes(e.c)) feed(`<b class="own">ADMIN</b> ${NAMES[e.c]}${e.on === undefined ? '' : e.on ? ' ON' : ' OFF'}`); }
        else if (v && ['tasks', 'time', 'end'].includes(e.c)) feed(`${tagOf(v)} <span class="owntag">OWNER</span> ${NAMES[e.c]}`);
        if (e.c === 'tasks') sound.play('revive');
        break;
      }
      case 'warp':
        if (mine && this.body) { const b = this.body; b.x = e.x; b.y = e.y; b.z = e.z; b.vx = b.vy = b.vz = 0; fx.pulse('glitch', 0.6); }
        if (v && v.w === this.viewW) this.blinkFrom(e.x, e.y, e.z);
        break;
      case 'knock':
        if (mine && this.body) { const b = this.body; b.vx = e.dx; b.vz = e.dz; b.vy = 6; b.ground = false; b.lock = 0.4; }
        break;
      case 'blink':
        if (e.id !== this.me) { this.blinkFrom(e.x0, e.y0, e.z0); sound.play('blink', vol(e.id)); }
        break;
      case 'sense':
        if (this.role === 'surv' && e.ids.includes(this.me)) { fx.say('IT HEARD YOU'); fx.pulse('static', 0.9); sound.play('sense', 0.5); }
        if (this.role === 'exe' && e.id === this.me) feed(e.ids.length ? `Sense found <b>${e.ids.length}</b> survivor${e.ids.length === 1 ? '' : 's'}` : 'Sense found no one');
        break;
      case 'spring':
        world.kickSpring(e.i);
        if (e.id !== this.me) sound.play('spring', vol(e.id) * 0.7);
        break;
      case 'bot':
        if (v) feed(`${tagOf(v)} left. A bot took over.`);
        break;
      case 'portal':
        if (!mine && v && (e.w === this.viewW || v.w === this.viewW)) sound.play('portal', clamp(1 - v.rig.root.position.distanceTo(this.camFocus || v3) / 50, 0.05, 0.6));
        break;
      case 'disguise':
        if (mine) { feed('You look like a survivor now. Click to pop out.'); fx.pulse('static', 0.3); }
        break;
      case 'pop': {
        if (mine || !v) break;
        if (v.w === this.viewW && this.role === 'surv' && this.camFocus) {
          const d = v.rig.root.position.distanceTo(this.camFocus);
          if (d < 7) { fx.jumpscare(this.exeVariant); sound.play('pop'); } else if (d < 40) { sound.play('pop', clamp(1 - d / 40, 0.2, 0.8)); fx.pulse('pop'); }
          if (d < 40) feed(`It was <b style="color:#ff4a5a">EXE</b> all along!`);
        }
        break;
      }
      case 'unmask':
        if (by) feed(`${tagOf(by)} <b>unmasked</b> EXE!`);
        if (mine) { this.disguised = 0; this.cd.disguise = nowS() + EXE.disguiseCd; banner('UNMASKED', 'They saw through you'); }
        sound.play('stun', mine ? 1 : vol(e.id));
        break;
      case 'burn':
        if (mine && this.body) { this.body.vy = 13; this.body.ground = false; this.body.lock = 0.15; sound.play('burn'); fx.pulse('hit', 0.5); }
        else sound.play('burn', vol(e.id) * 0.6);
        break;
      case 'boost':
        if (!mine) sound.play('boost', vol(e.id) * 0.5);
        break;
      case 'task': {
        const nm = { valves: 'valve', panels: 'panel', bells: 'bell' }[e.t];
        sound.play(nm, e.by === this.me ? 1 : vol(e.by) || 0.3);
        const total = { valves: 3, panels: 4, bells: 3 }[e.t];
        if (by) feed(`${tagOf(by)} ${e.t === 'valves' ? 'turned a valve' : e.t === 'panels' ? 'lit a jackpot panel' : 'rang a bell'} <b>${e.n}/${total}</b>`);
        break;
      }
      case 'task-x':
        if (mine && this.mini && this.mini.task) this.mini.close(e.why || 'left');
        break;
      case 'core':
        if (e.s === 'pick') { feed(`${v ? tagOf(v) : 'Someone'} picked up the <b style="color:#ffa040">fire core</b>`); if (mine) { banner('YOU HAVE THE FIRE CORE', 'Bring it to the frozen engine', true); sound.play('core'); } }
        else if (e.s === 'drop') { feed(`${v ? tagOf(v) : 'Someone'} dropped the fire core`); if (mine) sound.play('core', 0.5); }
        else if (e.s === 'done') { feed('The frozen engine is running!'); sound.play('steam', 0.8); }
        break;
      case 'taskdone': {
        const n = this.s.latest ? TASKS.filter((t, i) => this.s.latest.td & (1 << i)).length + 1 : 0;
        sound.play('task');
        banner(`${TASK_NAMES[e.t].toUpperCase()} DONE`, `${Math.min(5, n)}/5 zone tasks`, true);
        break;
      }
      case 'over':
        this.over = e;
        setTimeout(() => this.showResults(e), 1600);
        break;
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const S = this.s;
    if (!paused || !this.solo) S.update(dt);
    this.updateSpawn(dt);
    if (!this.ready) this.tryStart();
    const snap = S.latest;
    const t = nowS();
    if (!snap) { this.cameraIdle(dt); return; }
    const ph = PHASES[snap.ph] || 'intro';
    this.phase = ph;
    const mine = snap.pm.get(this.me);
    const st = mine ? mine[6] : ST.out, sf = mine ? mine[7] : 0, hp = mine ? mine[5] : 0;
    this.disguised = mine ? mine[12] : 0;
    // which world am I looking at? (mine, or the person I am watching)
    let w = mine ? mine[11] : 0;
    if (this.spectating && this.specId) { const se = snap.pm.get(this.specId); if (se) w = se[11]; }
    if (w !== this.viewW) {
      const first = this.viewW === -1;
      this.viewW = w; applyTheme(w);
      if (this.body) this.body.w = mine ? mine[11] : w;
      if (!first) {
        fx.pulse('portal'); sound.play('portal');
        if (!this.spectating) banner(w ? 'CORRUPTED WORLD' : 'NORMAL WORLD', w ? 'Something is very wrong here' : 'Everything looks fine... for now', !w);
      }
      $('worldPill').textContent = w ? '☠ CORRUPTED WORLD' : '☀ NORMAL WORLD';
      $('worldPill').className = 'pill worldpill ' + (w ? 'bad' : 'good');
    }
    if (this.lastSt !== st) {
      if (!this.aliveLike(st) && !this.spectator) { this.spectating = true; this.specId = null; this.nextSpectate(); }
      if (st === ST.down) sound.play('static');
      this.lastSt = st;
    }
    // look
    const sens = 0.0022 * save.settings.sens;
    this.yaw -= input.dx * sens;
    this.pitch = clamp(this.pitch - input.dy * sens * (save.settings.invert ? -1 : 1), -1.15, 0.6);
    input.dx = input.dy = 0;
    // move
    if (this.isOwn && adm.nocd) { for (const k in this.cd) this.cd[k] = 0; this.sta.stamina = SURV.stamina; this.sta.exhausted = false; }
    const b = this.body;
    let flying = false;
    const hiddenIn = mine ? mine[13] : 0;
    if (hiddenIn && b) {
      const L = LOCKERS[hiddenIn - 1];
      b.x = L.x; b.y = L.y; b.z = L.z; b.vx = b.vy = b.vz = 0;
      if (this.hiddenAt !== hiddenIn) { this.hiddenAt = hiddenIn; this.yaw = L.ry; this.pitch = -0.05; }
      if (input.f && !this.mini) this.hide(st);
    } else this.hiddenAt = 0;
    if (b && !hiddenIn && !(sf & F.QTE) && !this.mini && !this.spectator && this.aliveLike(st) && !(paused && this.solo)) {
      let f = 0, r = 0;
      if (held('KeyW', 'ArrowUp')) f += 1;
      if (held('KeyS', 'ArrowDown')) f -= 1;
      if (held('KeyD', 'ArrowRight')) r += 1;
      if (held('KeyA', 'ArrowLeft')) r -= 1;
      if (touch) { f -= input.stick.y; r += input.stick.x; }
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      let dx = sy * f - cy * r, dz = cy * f + sy * r;
      const len = Math.hypot(dx, dz);
      if (len > 1) { dx /= len; dz /= len; }
      const moving = len > 0.15;
      const wantSprint = held('ShiftLeft', 'ShiftRight') || input.sprintToggle;
      const sprinting = this.role === 'surv' && st === ST.alive ? tickStamina(this.sta, wantSprint, moving, dt) : false;
      this.prevSprint = sprinting;
      flying = t < this.until.fly && st === ST.alive;
      let flags = (sf & (F.STUN | F.BOOST | F.RECOVER | F.CARRY)) | (b.water ? F.WATER : 0) | (b.surface === 'goo' ? F.GOO : 0);
      if (this.role === 'exe' && t < this.until.fade) flags |= F.FADE;
      if (this.role === 'exe' && t < this.until.pop) flags |= F.POP;
      if (this.role === 'exe' && t < this.until.hunt) flags |= F.HUNT;
      if (this.role === 'exe' && t < this.until.spin) flags |= F.SPIN;
      if (this.role === 'exe' && (t < this.until.awake || sf & F.AWAKE)) flags |= F.AWAKE;
      flags |= sf & F.SLOWX;
      if (sf & F.INVERT) { dx = -dx; dz = -dz; }
      flags |= sf & F.SLOWED;
      const disChar = this.disguised && this.views.get(this.disguised) ? this.views.get(this.disguised).char : null;
      const sprintEx = this.role === 'exe' && disChar && wantSprint && moving;
      const speed = moveSpeed(this.role, this.kind, st, flags, ph, sprinting || sprintEx, b.w, disChar) * (this.isOwn && adm.speed ? 2 : 1);
      const canAct = st === ST.alive && !(flags & F.STUN) && !(flags & F.POP) && !(this.role === 'exe' && ph === 'intro');
      const jump = input.jump && canAct && b.ground;
      const res = this.isOwn && adm.fly ? this.noclip(b, dx, dz, speed, dt) : stepMove(b, { dx, dz, speed, jump, jumpV: this.role === 'exe' ? EXE.jump : SURV.jump, fly: flying, up: held('Space') }, dt);
      if (jump) sound.play('jump', 0.6);
      if (res.spring) { sound.play('spring'); world.kickSpring(res.spring.i); }
      if (res.boost) { sound.play('boost'); fx.pulse('glitch', 0.15); }
      if (res.bumper) { sound.play('bumper'); world.kickBumper(res.bumper); }
      if (res.landed) sound.play('land', 0.5);
      if (b.lock <= 0 && moving && t > this.until.atk) this.ry = turnTo(this.ry, Math.atan2(dx, dz), 12 * dt);
      if (input.abl) this.useMove('abl', t, st, sf);
      if (input.atk) this.attack(t, st, sf);
      if (input.ab2) this.useMove('ab2', t, st, sf);
      if (input.q) this.useMove('ab3', t, st, sf);
      if (input.f) { if (this.role === 'exe') this.useMove('ab4', t, st, sf); else if (!this.startTask(st, snap)) this.hide(st); }
      if (input.g) this.disguise(t, st);
      if (input.v) this.awaken(t, st, mine ? mine[16] : 0);
      this.pushState(false);
    }
    input.jump = input.abl = input.atk = input.q = input.f = input.g = input.v = input.ab2 = false;
    // everyone's rig
    for (const v of this.views.values()) this.updateView(v, dt, snap, t, flying);
    if (this.assembleT != null) this.updateAssemble(dt);
    for (const bu of this.bursts || []) { bu.t -= dt; for (const m of bu.g.children) { m.position.addScaledVector(m.userData.v, dt); m.rotation.x += dt * 5; } bu.g.visible = Math.random() > 0.15; if (bu.t <= 0) { scene.remove(bu.g); bu.dead = true; } }
    if (this.bursts) this.bursts = this.bursts.filter((x) => !x.dead);
    this.updateCamera(dt, st);
    // world state
    const prog = {};
    for (let i = 0; i < snap.sp.length; i += 2) prog[snap.sp[i]] = snap.sp[i + 1] / 100;
    world.updateShards(snap.sh, prog, snap.sa);
    const vp = {};
    for (let i = 0; i < snap.vp.length; i += 2) vp[snap.vp[i]] = snap.vp[i + 1] / 100;
    world.updateTasks({ vm: snap.vm, vp, pm: snap.pn, bm: snap.bm, co: snap.co }, dt);
    world.updateFields(snap.fl, this.viewW, VARIANTS.glitch.radius);
    const occupied = new Set();
    if (this.role !== 'exe') for (const v of this.views.values()) { const e = snap.pm.get(v.id); if (e && e[13] && e[11] === this.viewW) occupied.add(e[13] - 1); }
    world.updateLockers(occupied, dt);
    this.updateDecoys(snap, dt);
    this.updateGhosts(snap, dt);
    this.updateThrows(dt);
    if (this.role === 'exe' && (t < this.until.hunt || sf & F.HUNT) && t > this.printT) {
      this.printT = t + 0.22;
      for (const v of this.views.values()) { const e = snap.pm.get(v.id); if (v.role === 'surv' && e && e[11] === this.viewW && e[7] & F.REVEAL && !(e[7] & F.AIR)) world.addFootprint(e[1] + (Math.random() - 0.5) * 0.4, e[2], e[3] + (Math.random() - 0.5) * 0.4, e[4]); }
    }
    if (this.mini) this.mini.tick(t);
    if (snap.ex) world.setExits(this.info.exits, true);
    // fear
    const exe = [...this.views.values()].find((v) => v.role === 'exe');
    let terror = 0;
    const exE = exe && snap.pm.get(exe.id);
    if (this.role === 'surv' && exe && exE && exE[11] === this.viewW && (!exE[12] || exE[7] & F.POP) && this.camFocus && ph !== 'over') {
      const d = exe.rig.root.position.distanceTo(this.camFocus);
      const ex = exE, fading = ex && ex[7] & F.FADE;
      terror = clamp(1 - (d - 4) / (fading ? 22 : 34), 0, 1);
      if (ph === 'intro') terror *= 0.2;
    }
    if (this.spectating && this.role === 'surv') terror *= 0.5;
    // doing a task with EXE close: the window shakes red and warns you
    if (this.mini && this.mini.task) { const on = terror > 0.55; if (on !== this.taskDanger) { this.taskDanger = on; $('task').classList.toggle('danger', on); if (on) sound.play('warn'); } }
    else if (this.taskDanger) { this.taskDanger = false; $('task').classList.remove('danger'); }
    // EXE close: the screen glitches between the two worlds
    if (this.flickT > 0) { this.flickT -= dt; if (this.flickT <= 0) applyTheme(this.viewW); }
    else if (terror > 0.2 && ph !== 'over' && Math.random() < terror * terror * dt * 7) {
      applyTheme(this.viewW ? 0 : 1); this.flickT = 0.04 + Math.random() * 0.1;
      fx.pulse('glitch', 0.3 + terror * 0.4); if (Math.random() < 0.5) sound.play('static', 0.4);
    }
    fx.update(dt, terror, ph !== 'over', this.viewW);
    // EXE: the picture stutters (skips frames) when it's close
    if (this.exeVariant === 'exe' && this.role === 'surv' && fx.terror > 0.45 && !holdFrames && Math.random() < fx.terror * 0.02) holdFrames = 2 + Math.floor(Math.random() * 3);
    const chase = ph === 'escape' || (this.role === 'surv' && terror > 0.35);
    sound.update(dt, chase ? 'chase' : ph === 'over' ? 'menu' : this.viewW ? 'corrupt' : 'normal', terror, flying);
    lantern.position.copy(camera.position).y += 1.2;
    lantern.color.setHex(this.role === 'exe' ? 0xff4a3a : 0xffc8a0);
    this.updateHUD(snap, mine, st, sf, hp, t, ph);
  }

  updateView(v, dt, snap, t, flying) {
    const e = snap.pm.get(v.id);
    const root = v.rig.root;
    if (!e) { root.visible = false; return; }
    const st = e[6], flags = e[7];
    v.w = e[11]; v.rig.world = v.w;
    const isMe = v.id === this.me && this.body;
    let pose;
    if (isMe) pose = { x: this.body.x, y: this.body.y, z: this.body.z, ry: this.ry };
    else pose = this.s.sample(v.id, tmpPose);
    if (!pose) { root.visible = false; return; }
    root.visible = st !== ST.esc && st !== ST.out && v.w === this.viewW && !e[13];
    root.position.set(pose.x, pose.y, pose.z);
    if (v.first) { v.px = pose.x; v.pz = pose.z; v.ry = pose.ry; v.first = false; }
    v.ry = isMe ? pose.ry : v.ry + wrap(pose.ry - v.ry) * Math.min(1, dt * 14);
    root.rotation.y = v.ry;
    const sp = isMe ? Math.hypot(this.body.vx, this.body.vz) : Math.hypot(pose.x - v.px, pose.z - v.pz) / Math.max(dt, 1e-3);
    v.speed = damp(v.speed, Math.min(sp, 30), 12, dt);
    v.px = pose.x; v.pz = pose.z;
    // a disguised EXE is drawn as a copy of the survivor it copied (with their name tag)
    const disId = v.role === 'exe' ? e[12] : 0;
    if (v.role === 'exe') for (const [id, d] of this.disRigs) if (id !== disId || !root.visible) d.rig.root.visible = false;
    if (disId && root.visible) {
      let d = this.disRigs.get(disId);
      const tv = this.views.get(disId);
      if (!d && tv) {
        const info = this.info.ents.find((x) => x.id === disId);
        d = { rig: new Rig({ role: 'surv', look: info.look, char: info.char }) };
        if (this.role !== 'exe') { d.tag = info.own ? ownerTag(info.name) : nameTag(info.name, CHARS[info.char].accent); d.tag.position.y = info.own ? 3.15 : 2.95; d.rig.root.add(d.tag); }
        scene.add(d.rig.root); this.disRigs.set(disId, d);
      }
      if (d) {
        root.visible = false;
        d.rig.root.visible = true;
        d.rig.root.position.copy(root.position); d.rig.root.rotation.y = root.rotation.y;
        d.rig.update(dt, { speed: v.speed, sprint: v.speed > 7.5, air: !!(flags & F.AIR), atk: -1 });
        d.rig.setOpacity(isMe ? 0.6 : 1);
        return;
      }
    }
    if (!root.visible) return;
    const atkOn = !!(flags & F.ATK);
    if (atkOn && !v.wasAtk) v.atkStart = t;
    v.wasAtk = atkOn;
    let atk = -1;
    if (isMe && t < this.until.atk) atk = 1 - (this.until.atk - t) / 0.35;
    else if (atkOn && v.atkStart >= 0) atk = clamp((t - v.atkStart) / 0.35, 0, 1);
    if (!isMe && v.ablStart && t - v.ablStart < 0.35 && (v.char === 'rook' || v.char === 'mira')) atk = (t - v.ablStart) / 0.35;
    const reach = v.reachStart && t - v.reachStart < 0.5 ? (t - v.reachStart) / 0.5 : isMe && t < this.until.reach ? 1 - (this.until.reach - t) / 0.45 : -1;
    v.rig.update(dt, {
      spin: v.role === 'exe' && (isMe ? t < this.until.spin : !!(flags & F.SPIN)), awake: v.role === 'exe' && (!!(flags & F.AWAKE) || (isMe && t < this.until.awake)), reach,
      speed: v.speed, sprint: !!(flags & F.SPRINT), air: !!(flags & F.AIR) || (isMe && !this.body.ground),
      fly: isMe ? flying : !!(flags & F.FLY), down: st === ST.down, atk, stun: !!(flags & F.STUN) || (v.role === 'exe' && !!(flags & F.POP)),
      dash: isMe ? t < this.until.dash : !!(flags & F.DASH), lunge: isMe ? t < this.until.lunge : !!(flags & F.LUNGE),
      task: isMe ? !!(this.mini && this.mini.task) : !!(flags & F.TASK), carry: !!(flags & F.CARRY),
    });
    // Grin.exe fading
    if (v.role === 'exe') {
      const fading = isMe ? t < this.until.fade : !!(flags & F.FADE);
      let o = 1;
      if (fading) o = isMe ? 0.3 : (this.camFocus && root.position.distanceTo(this.camFocus) < 5 ? 0.22 : Math.random() < 0.04 ? 0.35 : 0.035);
      v.rig.setOpacity(o);
      v.stars.visible = !!(flags & F.STUN);
      if (v.stars.visible) v.stars.children.forEach((s, i) => { const a = t * 5 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 0.6, Math.sin(t * 7 + i) * 0.1, Math.sin(a) * 0.6); });
      v.aura.visible = !fading || isMe;
      v.aura.children.forEach((m, i) => {
        if (Math.random() < 0.3) m.position.set((Math.random() - 0.5) * 2.4, Math.random() * 3.6, (Math.random() - 0.5) * 2.4);
        m.visible = Math.random() > 0.25;
      });
    } else {
      const invis = flags & F.INVIS || (isMe && t < this.until.invis);
      if (invis && this.role === 'exe') { root.visible = false; return; }
      v.rig.setOpacity(invis ? 0.3 : 1);
      v.reveal.visible = this.role === 'exe' && !!(flags & F.REVEAL);
      if (v.reveal.visible) v.reveal.material.opacity = 0.5 + Math.sin(t * 10) * 0.3;
    }
    if (v.tag) v.tag.visible = st === ST.alive || st === ST.down;
  }

  cameraIdle(dt) {
    const t = nowS() * 0.1;
    camera.position.set(Math.cos(t) * 30, 12, Math.sin(t) * 30);
    camera.lookAt(0, 2, 0);
  }

  updateCamera(dt, st) {
    $('lockerView').classList.toggle('hidden', !this.hiddenAt || this.spectating);
    if (this.hiddenAt && !this.spectating) {
      const L = LOCKERS[this.hiddenAt - 1];
      this.yaw = L.ry + clamp(wrap(this.yaw - L.ry), -0.7, 0.7); this.pitch = clamp(this.pitch, -0.35, 0.3);
      const cp = Math.cos(this.pitch);
      camera.position.set(L.x + Math.sin(L.ry) * 0.2, L.y + 2.0, L.z + Math.cos(L.ry) * 0.2);
      camera.lookAt(camera.position.x + Math.sin(this.yaw) * cp * 10, camera.position.y + Math.sin(this.pitch) * 10, camera.position.z + Math.cos(this.yaw) * cp * 10);
      this.camFocus = (this.camFocus || new THREE.Vector3()).set(L.x, L.y, L.z);
      $('spect').classList.add('hidden');
      return;
    }
    let fx0, fy0, fz0, isExe = this.role === 'exe', down = st === ST.down;
    if (this.spectating || !this.body) {
      let v = this.specId && this.views.get(this.specId);
      const snap = this.s.latest;
      if (!v || !snap.pm.get(v.id) || !this.aliveLike(snap.pm.get(v.id)[6])) { this.nextSpectate(); v = this.specId && this.views.get(this.specId); }
      if (!v) { const ex = [...this.views.values()].find((w) => w.role === 'exe'); v = ex; }
      if (!v) return this.cameraIdle(dt);
      const p = v.rig.root.position; fx0 = p.x; fy0 = p.y; fz0 = p.z; isExe = v.role === 'exe'; down = false;
      $('spect').classList.remove('hidden');
      setText($('spect'), `Watching ${v.role === 'exe' ? VARIANTS[v.variant].name : v.name} · ${touch ? 'tap' : 'click'} for next`);
    } else { $('spect').classList.add('hidden'); fx0 = this.body.x; fy0 = this.body.y; fz0 = this.body.z; }
    const h = down ? 0.9 : isExe ? 2.9 : 2.15;
    const dist = isExe ? 6.0 : 5.0;
    const cp = Math.cos(this.pitch), fx = Math.sin(this.yaw) * cp, fy = Math.sin(this.pitch), fz = Math.cos(this.yaw) * cp;
    const tx = fx0, ty = fy0 + h, tz = fz0;
    const d = Math.max(0.6, rayDist(tx, ty, tz, -fx, -fy, -fz, dist, this.viewW) - 0.35);
    const k = d / dist;
    const rx = -Math.cos(this.yaw) * 0.55 * k, rz = Math.sin(this.yaw) * 0.55 * k;
    camera.position.set(tx - fx * d + rx, ty - fy * d, tz - fz * d + rz);
    camera.lookAt(tx + fx * 10 + rx, ty + fy * 10, tz + fz * 10 + rz);
    this.camFocus = (this.camFocus || new THREE.Vector3()).set(fx0, fy0, fz0);
  }

  // ------------------------------------------------------------------ HUD
  updateHUD(snap, mine, st, sf, hp, t, ph) {
    const tl = snap.tl;
    setText($('clock'), ph === 'intro' ? `${Math.ceil(tl)}` : fmtClock(tl));
    $('clock').classList.toggle('danger', ph === 'escape' || (ph === 'play' && tl < 30));
    let n = 0; for (let i = 0; i < TASKS.length; i++) if (snap.td & (1 << i)) n++;
    setText($('shardc'), `✓ ${n}/${TASKS.length} tasks`);
    const exeName = (() => { const x = [...this.views.values()].find((v) => v.role === 'exe'); return x ? VARIANTS[x.variant].name : 'EXE'; })();
    let pt = '';
    if (ph === 'intro') pt = this.role === 'exe' ? 'You wake up soon. Wait…' : `${exeName} wakes up in ${Math.ceil(tl)}… spread out`;
    else if (ph === 'play') pt = this.role === 'exe' ? (this.viewW ? 'Hunt the survivors' : 'Hunt the survivors · F to disguise') : 'Do the zone tasks · rift portals swap worlds';
    else if (ph === 'escape') pt = this.role === 'exe' ? "Don't let them reach the gates" : this.viewW ? 'Reach a gate!' : 'Gates are in the corrupted world: find a rift portal!';
    setText($('phase'), pt);
    // team list
    let html = '';
    for (const v of this.views.values()) {
      if (v.role !== 'surv') continue;
      const e = snap.pm.get(v.id); if (!e) continue;
      const s = e[6];
      const cls = s === ST.down ? 'down' : s === ST.esc ? 'esc' : s === ST.out ? 'out' : '';
      const status = s === ST.down ? `DOWN ${e[8]}s` : s === ST.esc ? 'ESCAPED' : s === ST.out ? 'TAKEN' : e[13] && this.role !== 'exe' ? 'HIDING' : `${'♥'.repeat(Math.max(0, Math.ceil(e[5] / SURV.heart)))}`;
      const wIcon = s === ST.alive || s === ST.down ? `<em class="${e[11] ? 'bad' : 'good'}">${e[11] ? '☠' : '☀'}</em>` : '';
      html += `<div class="${cls}${v.id === this.me ? ' me' : ''}"><i style="background:${CHARS[v.char].accent}"></i>${v.own ? `<b class="own">👑 ${esc(v.name)}</b>` : esc(v.name)}${v.bot ? ' <small style="color:var(--muted)">bot</small>' : ''}${e[7] & F.CARRY ? ' <small style="color:#ffa040">core</small>' : ''}<span>${wIcon}${status}</span></div>`;
    }
    setHTML($('team'), html);
    // hearts + stamina
    if (this.role === 'surv') {
      setHTML($('hearts'), Array.from({ length: SURV.hp / SURV.heart }, (_, i) => `<span class="hrt"><b style="width:${Math.round(Math.max(0, Math.min(1, (hp - i * SURV.heart) / SURV.heart)) * 100)}%"></b></span>`).join(''));
      setText($('revInfo'), mine && mine[15] >= SURV.revives ? 'no revives left' : '1 revive left');
      $('revInfo').classList.toggle('bad', !!(mine && mine[15] >= SURV.revives));
      $('stam').querySelector('i').style.transform = `scaleX(${this.sta.stamina / SURV.stamina})`;
      $('stam').classList.toggle('tired', this.sta.exhausted);
    }
    for (const s of this.slots) {
      if (s.locked) { s.el.classList.remove('ready'); continue; }
      if (s.key === 'awaken') {
        const m = mine ? mine[16] : 0, on = t < this.until.awake || (sf & F.AWAKE);
        s.meter.style.width = `${on ? 100 : m}%`;
        s.el.classList.toggle('ready', !this.awakeUsed && m >= 100);
        s.el.classList.toggle('on', !!on);
        continue;
      }
      const left = this.cd[s.key] - t;
      const ready = left <= 0 && st === ST.alive;
      s.el.classList.toggle('ready', ready);
      s.cdEl.classList.toggle('hidden', left <= 0);
      if (left > 0) { setText(s.cdEl, Math.ceil(left)); s.cdEl.style.transform = `scaleY(${clamp(left / s.total, 0, 1)})`; }
    }
    // zone task checklist
    const counts = { shards: [snap.sh, ROUND.SHARDS], valves: [snap.vm, 3], panels: [snap.pn, 4], bells: [snap.bm, 3] };
    let th = '<b>ZONE TASKS</b>';
    TASKS.forEach((tk, i) => {
      const done = !!(snap.td & (1 << i));
      let prog = '';
      if (counts[tk.id]) { const [mask, tot] = counts[tk.id]; let c = 0; for (let k = 0; k < tot; k++) if (mask & (1 << k)) c++; prog = ` ${c}/${tot}`; }
      else if (tk.id === 'core') prog = snap.co[0] === 1 ? ' (carried)' : snap.co[0] === 2 ? ' (dropped)' : '';
      th += `<div class="${done ? 'done' : ''}"><em class="${tk.w ? 'bad' : 'good'}">${tk.w ? '☠' : '☀'}</em><span><small>${tk.zone}</small>${tk.label}${done ? '' : prog}</span></div>`;
    });
    setHTML($('tasks'), th);
    if (t > this.miniT) { this.miniT = t + 0.1; this.drawMinimap(snap); }
    // down overlay
    $('downed').classList.toggle('hidden', !(st === ST.down && !this.spectator));
    if (st === ST.down) { setText($('downT'), `${mine[8]}`); $('revBar').style.width = `${mine[9]}%`; }
    // prompts: absorbing a shard, reviving a friend, flying
    let prompt = '';
    if (this.body && st === ST.alive && this.role === 'surv') {
      const tk = !this.mini && this.nearTask(snap);
      if (tk) prompt = `<b style="color:var(--gold)">${touch ? 'USE' : 'F'}</b>: ${tk.label}`;
      for (const v of this.views.values()) {
        if (v.role !== 'surv' || v.id === this.me) continue;
        const e = snap.pm.get(v.id);
        if (e && e[6] === ST.down && Math.hypot(this.body.x - e[1], this.body.z - e[3]) < SURV.reviveRange) prompt = `Reviving ${esc(v.name)}…<div class="bar"><i style="width:${e[9]}%"></i></div>`;
      }
      if (sf & F.CARRY) prompt = 'Carrying the fire core: bring it to the frozen engine';
      if (!prompt) for (const L of LOCKERS) if (Math.hypot(this.body.x - L.fx, this.body.z - L.fz) < HIDE.range && Math.abs(L.y - this.body.y) < 1.5) prompt = `${touch ? 'USE' : 'F'}: hide in the locker`;
      if (!prompt) for (const p of PORTALS) if (Math.hypot(this.body.x - p.x, this.body.z - p.z) < 6) prompt = `Rift portal: step in to enter the ${this.viewW ? 'normal' : 'corrupted'} world`;
      if (t < this.until.fly) prompt = touch ? 'Hold JUMP to fly up' : 'Hold Space to fly up';
    }
    if (this.body && st === ST.alive && this.role === 'exe') {
      if (this.disguised) prompt = `Disguised as ${esc(this.views.get(this.disguised)?.name || 'a survivor')} · ${touch ? 'HIT' : 'click'} to pop out`;
      else if (!prompt) for (const p of PORTALS) if (Math.hypot(this.body.x - p.x, this.body.z - p.z) < 6) prompt = `Rift portal → ${this.viewW ? 'normal' : 'corrupted'} world`;
    }
    if (mine && mine[13] && !this.mini) {
      const left = Math.max(0, HIDE.max - mine[14]);
      const danger = mine[14] >= HIDE.warn;
      prompt = `${danger ? '<span style="color:#ff4a5a">EXE IS COMING FOR YOU · GET OUT</span>' : `Hiding · ${Math.ceil(left)}s`} · ${touch ? 'HIDE' : 'F'} to leave<div class="bar"><i style="width:${(left / HIDE.max) * 100}%;background:${danger ? '#ff4a5a' : 'var(--cyan)'}"></i></div>`;
      if (danger && t > this.warnT) { this.warnT = t + 1; sound.play('warn'); fx.pulse('static', 0.4); }
    }
    if (!prompt && !touch && !paused && document.pointerLockElement !== canvas && !this.done) prompt = 'Click to look around';
    $('prompt').classList.toggle('hidden', !prompt);
    if (prompt) setHTML($('prompt'), prompt);
    $('cross').classList.toggle('hidden', this.spectating || touch);
    // markers: open exits, downed friends, revealed survivors
    const marks = [];
    if (snap.ex && this.viewW === 1 && (this.role === 'surv' || this.spectating)) for (const i of this.info.exits) { const g = EXITS[i]; marks.push({ x: g.x, y: g.y + 4, z: g.z, color: '#7ff0ff', label: 'GATE' }); }
    if (this.role === 'surv' && this.body && !snap.ex) {
      const todo = [];
      if (this.viewW === 0) {
        this.info.shards.forEach((p, i) => { if (!(snap.sh & (1 << i)) && snap.sa & (1 << i)) todo.push({ x: p[0], y: p[1] + 1.5, z: p[2], label: 'SHARD' }); });
        OBJ.valves.forEach((v, i) => { if (!(snap.vm & (1 << i))) todo.push({ x: v.x, y: v.y + 1.5, z: v.z, label: 'VALVE' }); });
      } else {
        OBJ.panels.forEach((v, i) => { if (!(snap.pn & (1 << i))) todo.push({ x: v.x, y: v.y + 1, z: v.z, label: 'PANEL' }); });
        OBJ.bells.forEach((v, i) => { if (!(snap.bm & (1 << i))) todo.push({ x: v.x, y: v.y + 2, z: v.z, label: 'BELL' }); });
        if (snap.co[0] === 0 || snap.co[0] === 2) todo.push({ x: snap.co[1], y: snap.co[2] + 2, z: snap.co[3], label: 'FIRE CORE' });
        if (sf & F.CARRY) todo.push({ x: OBJ.engine.x, y: OBJ.engine.y + 5, z: OBJ.engine.z, label: 'ENGINE', near: 1 });
      }
      todo.sort((a, b) => (b.near || 0) - (a.near || 0) || Math.hypot(a.x - this.body.x, a.z - this.body.z) - Math.hypot(b.x - this.body.x, b.z - this.body.z));
      for (const m of todo.slice(0, 3)) marks.push({ ...m, color: '#ffe27a' });
    }
    for (const v of this.views.values()) {
      if (v.role !== 'surv' || v.id === this.me) continue;
      const e = snap.pm.get(v.id); if (!e || e[11] !== this.viewW) continue;
      if (this.role === 'surv' && e[6] === ST.down) marks.push({ x: e[1], y: e[2] + 1.5, z: e[3], color: '#ff4a5a', label: `${v.name} ↓` });
      if (this.role === 'exe' && e[7] & F.REVEAL) marks.push({ x: e[1], y: e[2] + 2.6, z: e[3], color: '#ff2a3a', label: '!' });
    }
    for (const v of this.views.values()) {
      if (v.role !== 'exe' || this.role === 'exe') continue;
      const e = snap.pm.get(v.id);
      if (e && e[11] === this.viewW && e[7] & F.PINGED) marks.push({ x: e[1], y: e[2] + 3.4, z: e[3], color: '#ff2a8a', label: 'GLITCH.EXE' });
    }
    this.drawMarks(marks);
  }

  /** Grin.exe decoys: drawn like Grin, flickering a little. */
  updateDecoys(snap, dt) {
    const seen = new Set();
    for (const d of snap.dc || []) {
      if (d[5] !== this.viewW) continue;
      seen.add(d[0]);
      let r = this.decoyRigs.get(d[0]);
      if (!r) { r = new Rig({ role: 'exe', variant: 'grin' }); scene.add(r.root); this.decoyRigs.set(d[0], r); }
      r.root.visible = true; r.root.position.set(d[1], d[2], d[3]); r.root.rotation.y = d[4];
      r.update(dt, { speed: 10, sprint: true, atk: -1 });
      r.setOpacity(this.role === 'exe' ? 0.45 : Math.random() < 0.05 ? 0.5 : 1);
    }
    for (const [id, r] of this.decoyRigs) if (!seen.has(id)) { scene.remove(r.root); r.dispose(); this.decoyRigs.delete(id); }
  }

  /** Bolt's afterimages: a copy of Bolt running straight ahead. EXE sees a real Bolt; teammates see a faint one. */
  updateGhosts(snap, dt) {
    const seen = new Set();
    for (const g of snap.gh || []) {
      if (g[6] !== this.viewW) continue;
      seen.add(g[0]);
      let r = this.ghostRigs.get(g[0]);
      if (!r) { const o = this.info.ents.find((x) => x.id === g[1]); r = new Rig({ role: 'surv', look: o ? o.look : undefined, char: o ? o.char : 'bolt' }); scene.add(r.root); this.ghostRigs.set(g[0], r); }
      r.root.visible = true; r.root.position.set(g[2], g[3], g[4]); r.root.rotation.y = g[5];
      r.update(dt, { speed: 10, sprint: true, atk: -1 });
      r.setOpacity(this.role === 'exe' ? 1 : 0.4);
    }
    for (const [id, r] of this.ghostRigs) if (!seen.has(id)) { scene.remove(r.root); r.dispose(); this.ghostRigs.delete(id); }
  }

  /** Pip's wrench, spinning through the air. */
  throwWrench(v, e) {
    const from = v.rig.root.position;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.08), new THREE.MeshLambertMaterial({ color: 0xb8c0cc })));
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 10, Math.PI * 1.5), new THREE.MeshLambertMaterial({ color: 0xb8c0cc })); head.position.y = 0.32; g.add(head);
    g.position.set(from.x, from.y + 1.8, from.z);
    scene.add(g);
    this.throws.push({ g, a: new THREE.Vector3(from.x, from.y + 1.8, from.z), b: new THREE.Vector3(e.tx, e.ty, e.tz), t: 0 });
  }
  updateThrows(dt) {
    for (const w of this.throws) {
      w.t += dt / 0.35;
      w.g.position.lerpVectors(w.a, w.b, Math.min(1, w.t)); w.g.position.y += Math.sin(Math.min(1, w.t) * Math.PI) * 1.2;
      w.g.rotation.x += dt * 25;
      if (w.t >= 1.3) { scene.remove(w.g); w.dead = true; }
    }
    this.throws = this.throws.filter((w) => !w.dead);
  }

  /** The task you could start right here: { t, i, label } or null (same reach as the server's TASK_REACH). */
  nearTask(snap) {
    const b = this.body;
    if (!b || !snap || this.role !== 'surv') return null;
    const w = this.viewW, close = (t, x, y, z, core) => Math.hypot(b.x - x, b.z - z) <= TASK_REACH[t] && Math.abs((core ? b.y : b.y + 1.1) - y) <= 3;
    if (w === 0) {
      for (let i = 0; i < this.info.shards.length; i++) { const p = this.info.shards[i]; if (!(snap.sh & (1 << i)) && snap.sa & (1 << i) && close('shards', p[0], p[1], p[2])) return { t: 'shards', i, label: 'absorb the shard' }; }
      for (let i = 0; i < OBJ.valves.length; i++) { const v = OBJ.valves[i]; if (!(snap.vm & (1 << i)) && close('valves', v.x, v.y, v.z)) return { t: 'valves', i, label: 'turn the valve' }; }
    } else {
      for (let i = 0; i < OBJ.panels.length; i++) { const v = OBJ.panels[i]; if (!(snap.pn & (1 << i)) && close('panels', v.x, v.y, v.z)) return { t: 'panels', i, label: 'rewire the jackpot panel' }; }
      for (let i = 0; i < OBJ.bells.length; i++) { const v = OBJ.bells[i]; if (!(snap.bm & (1 << i)) && close('bells', v.x, v.y, v.z)) return { t: 'bells', i, label: 'ring the bells' }; }
      const c = snap.co, mine = snap.pm.get(this.me);
      if ((c[0] === 0 || c[0] === 2) && !(mine && mine[7] & F.CARRY) && close('core', c[1], c[2], c[3], true)) return { t: 'core', i: 0, label: 'chip the fire core out of the ice' };
    }
    return null;
  }

  /** F near a task: open its minigame window. You stand still until it's done or you close it. */
  startTask(st, snap) {
    if (st !== ST.alive || this.mini) return false;
    const tk = this.nearTask(snap);
    if (!tk) return false;
    const mine = snap.pm.get(this.me), fast = !!(mine && mine[7] & F.TURBO) || [...snap.pm.values()].some((e) => e !== mine && e[7] & F.TURBO && e[11] === this.viewW && Math.hypot(e[1] - this.body.x, e[3] - this.body.z) < CHARS.pip.q.range);
    this.s.action({ k: 'task', s: 'open', t: tk.t, i: tk.i });
    if (document.pointerLockElement) document.exitPointerLock();
    this.taskFor = tk;
    const m = openTask(tk.t, {
      fast, corrupted: this.viewW === 1, play: (n, v) => sound.play(n, v),
      onDone: () => { if (this.mini === m) this.mini = null; this.s.action({ k: 'task', s: 'done', t: tk.t, i: tk.i }); this.relock(); },
      onCancel: (why) => {
        if (this.mini === m) this.mini = null;
        if (why === 'cancel') this.s.action({ k: 'task', s: 'cancel', t: tk.t, i: tk.i });
        if (why === 'hit') banner('INTERRUPTED', 'EXE got you mid-task', false);
        else if (why === 'done') feed('Someone else finished that task');
        if (why !== 'gone') this.relock();
      },
    });
    this.mini = m;
    sound.play('click');
    return true;
  }

  /** Grab the mouse again after a task window (desktop only; it needs a click if the browser says no). */
  relock() { if (!touch && !this.done && !paused) try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* the "Click to look around" prompt covers it */ } }

  /** The Q/E quick-time minigame when EXE drags you out of a locker. */
  startMinigame(reason) {
    if (this.mini) this.mini.close();
    const el = $('qte'), keyEl = $('qteKey'), ring = $('qteRing'), count = $('qteCount'), txt = $('qteText');
    const c = $('qteFace'); c.width = this.exeVariant === 'glitch' ? 480 : 220; c.height = Math.round(c.width * 0.8); drawScareFaceInto(c, this.exeVariant);
    const lines = ['LET ME IN', 'FOUND YOU', 'TOO LONG', 'STAY WITH ME', "YOU CAN'T HIDE", 'COME OUT'];
    const seq = Array.from({ length: QTE.prompts }, () => (Math.random() < 0.5 ? 'Q' : 'E'));
    const m = { i: 0, seq, start: nowS() + 0.6, done: false };
    const dur = (i) => QTE.ring0 + (QTE.ring1 - QTE.ring0) * (i / (QTE.prompts - 1));
    const show = () => {
      keyEl.textContent = seq[m.i]; count.textContent = `${m.i + 1}/${seq.length}`; txt.textContent = lines[Math.floor(Math.random() * lines.length)];
      keyEl.classList.remove('pop'); void keyEl.offsetWidth; keyEl.classList.add('pop');
    };
    const finish = (ok) => { if (m.done) return; m.done = true; this.s.action({ k: 'qte', ok }); setTimeout(() => m.close(), ok ? 200 : 450); if (!ok) { el.classList.add('fail'); sound.play('qtefail'); } };
    m.press = (k) => {
      if (m.done || nowS() < m.start) return;
      if (k === seq[m.i]) { sound.play('qtehit'); fx.pulse('glitch', 0.2); m.i++; m.start = nowS(); if (m.i >= seq.length) finish(true); else show(); }
      else finish(false);
    };
    m.tick = (t) => {
      if (m.done) return;
      const k = clamp((t - m.start) / dur(m.i), 0, 1);
      ring.style.strokeDashoffset = String(k * 302);
      el.style.transform = `translate(${(Math.random() - 0.5) * 8}px, ${(Math.random() - 0.5) * 8}px)`;
      if (t - m.start > dur(m.i)) finish(false);
    };
    m.close = () => { el.classList.add('hidden'); el.classList.remove('fail'); $('touchQE').classList.add('hidden'); if (this.mini === m) this.mini = null; };
    this.mini = m;
    el.classList.remove('hidden'); $('touchQE').classList.toggle('hidden', !touch);
    $('qteTitle').textContent = reason === 'rip' ? 'EXE TORE OPEN YOUR LOCKER' : 'YOU STAYED TOO LONG';
    show();
    sound.play('rip'); fx.pulse('pop');
  }

  /** Top-down map: zones, portals, tasks in this world, teammates in this world, gates once open. */
  drawMinimap(snap) {
    const c = $('minimap'), g = c.getContext('2d'), S = c.width, k = S / (HALF * 2);
    const P = (x, z) => [(x + HALF) * k, (z + HALF) * k];
    g.drawImage(minimapBg(this.viewW), 0, 0, S, S);
    const dot = (x, z, r, col, ring) => { const [px, py] = P(x, z); g.beginPath(); g.arc(px, py, r, 0, 7); if (ring) { g.strokeStyle = col; g.lineWidth = 2; g.stroke(); } else { g.fillStyle = col; g.fill(); } };
    for (const p of PORTALS) dot(p.x, p.z, 4, this.viewW ? '#ff3a4a' : '#a07aff', true);
    if (this.role !== 'exe') for (const L of LOCKERS) { const [px, py] = P(L.x, L.z); g.fillStyle = '#c8c8d0'; g.fillRect(px - 2, py - 2, 4, 4); }
    if (this.role !== 'exe') {
      if (this.viewW === 0) {
        this.info.shards.forEach((p, i) => { if (!(snap.sh & (1 << i)) && snap.sa & (1 << i)) dot(p[0], p[2], 3, '#7ff0ff'); });
        OBJ.valves.forEach((v, i) => { if (!(snap.vm & (1 << i))) dot(v.x, v.z, 3, '#ffe27a'); });
      } else {
        OBJ.panels.forEach((v, i) => { if (!(snap.pn & (1 << i))) dot(v.x, v.z, 3, '#ff4fd8'); });
        OBJ.bells.forEach((v, i) => { if (!(snap.bm & (1 << i))) dot(v.x, v.z, 3, '#ffb040'); });
        if (snap.co[0] !== 3) dot(snap.co[1], snap.co[3], 3.5, '#ff7a20');
        if (snap.co[0] !== 3) dot(OBJ.engine.x, OBJ.engine.z, 4, '#bfe8ff', true);
        if (snap.ex) for (const i of this.info.exits) dot(EXITS[i].x, EXITS[i].z, 6, '#7ff0ff', true);
      }
    }
    for (const v of this.views.values()) {
      const e = snap.pm.get(v.id);
      if (!e || e[11] !== this.viewW || v.id === this.me || !(e[6] === ST.alive || e[6] === ST.down)) continue;
      if (v.role === 'exe') continue;
      if (this.role === 'exe' && !(e[7] & F.REVEAL)) continue;
      dot(e[1], e[3], 3, this.role === 'exe' ? '#ff2a3a' : CHARS[v.char].accent);
    }
    const f = this.camFocus;
    if (f) {
      const [px, py] = P(f.x, f.z);
      g.save(); g.translate(px, py); g.rotate(-this.yaw + Math.PI);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill(); g.restore();
    }
  }

  drawMarks(marks) {
    const box = $('markers');
    while (box.children.length < marks.length) { const d = document.createElement('div'); d.className = 'mark'; d.innerHTML = '<i></i><span></span>'; box.appendChild(d); }
    [...box.children].forEach((el, i) => {
      const m = marks[i];
      if (!m) { el.style.display = 'none'; return; }
      v3.set(m.x, m.y, m.z);
      const dist = this.camFocus ? Math.round(v3.distanceTo(this.camFocus)) : 0;
      v3.project(camera);
      let x = (v3.x * 0.5 + 0.5) * innerWidth, y = (-v3.y * 0.5 + 0.5) * innerHeight;
      if (v3.z > 1) { x = innerWidth - x; y = innerHeight - 30; }
      x = clamp(x, 40, innerWidth - 40); y = clamp(y, 70, innerHeight - 40);
      el.style.display = ''; el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.color = m.color;
      setText(el.querySelector('span'), `${m.label} ${dist}m`);
    });
  }

  showResults(e) {
    if (this.mini && this.mini.task) this.mini.close('gone');
    if (match !== this) return;
    this.done = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const won = (this.role === 'exe' && e.win === 'exe') || (this.role === 'surv' && e.escaped.includes(this.me));
    const exeWin = e.win === 'exe';
    const oldXp = $('resXp'); if (oldXp) oldXp.remove();
    $('resTitle').textContent = exeWin ? 'EXE WINS' : 'SURVIVORS WIN';
    $('resTitle').style.color = exeWin ? '#ff2a3a' : '#7ff0ff';
    $('resSub').textContent = `${e.tasks}/5 zone tasks done. ` + (this.spectator ? 'Next round starts soon.' : this.role === 'exe' ? (exeWin ? 'Nobody got out.' : `${e.escaped.length} got away.`) : e.escaped.includes(this.me) ? 'You made it out.' : 'You were taken.');
    let rows = '';
    for (const s of e.stats) {
      const v = this.views.get(s.id); if (!v) continue;
      const out = s.role === 'exe' ? `<span class="tag2" style="color:#ff2a3a">EXE</span>` : s.st === ST.esc ? `<span class="tag2" style="color:#7ff0ff">ESCAPED</span>` : `<span class="tag2" style="color:#ff6a7a">TAKEN</span>`;
      const det = s.role === 'exe' ? `${s.hits} hits · ${s.downs} knocked down` : `${s.tasks} tasks · ${s.revives} revives`;
      rows += `<tr><td>${tagOf(v)}${v.id === this.me ? ' (you)' : ''}</td><td>${out}</td><td>${det}</td></tr>`;
    }
    $('resTable').innerHTML = rows;
    if (!this.spectator) {
      // XP for the character or monster you played
      const meStat = e.stats.find((x) => x.id === this.me) || {};
      const L = this.role === 'exe' ? LEVEL.exe : LEVEL.surv;
      const gained = this.role === 'exe'
        ? L.round + (meStat.hits || 0) * L.hit + (meStat.downs || 0) * L.down + (e.win === 'exe' ? L.win : 0)
        : L.round + (meStat.tasks || 0) * L.task + (meStat.revives || 0) * L.revive + (e.escaped.includes(this.me) ? L.escape : 0);
      const before = lvOf(this.kind);
      save.xp[this.kind] = (save.xp[this.kind] || 0) + gained;
      const after = lvOf(this.kind);
      const nm = this.role === 'exe' ? VARIANTS[this.kind].name : CHARS[this.kind].name;
      let xpHtml = `<div class="xp"><b>+${gained} XP</b> · ${esc(nm)} level ${after.lv}${after.lv < LEVEL.max ? ` <span class="xpbar"><i style="width:${Math.round((after.into / after.need) * 100)}%"></i></span> ${after.into}/${after.need}` : ' (max)'}</div>`;
      if (after.lv > before.lv) xpHtml += `<div class="xp up">LEVEL UP! ${esc(nm)} is level ${after.lv}</div>`;
      if (after.lv >= LEVEL.max && before.lv < LEVEL.max) xpHtml += `<div class="xp up">${this.role === 'exe' ? `Awakening unlocked: ${esc(VARIANTS[this.kind].awake.name)} (press V when the meter is full)` : `New ability unlocked: ${esc(CHARS[this.kind].q.name)} (Q)`}</div>`;
      $('resSub').insertAdjacentHTML('afterend', `<div id="resXp">${xpHtml}</div>`);
      save.stats.rounds++; if (won) save.stats.wins++;
      if (e.escaped.includes(this.me)) save.stats.escapes++;
      const me = e.stats.find((s) => s.id === this.me); if (me) { save.stats.shards += me.shards || 0; save.stats.downs += me.downs || 0; }
      persist();
    }
    const btns = $('resBtns');
    if (this.solo) btns.innerHTML = '<button class="btn small" id="rMenu">Menu</button><button class="btn primary small center" id="rAgain" style="flex:1">Play again</button>';
    else btns.innerHTML = '<p class="status" style="margin:0">Back to the lobby in a few seconds…</p><button class="btn small" id="rMenu" style="margin-left:auto">Leave</button>';
    $('results').classList.remove('hidden');
    $('rMenu').onclick = () => { sound.play('click'); leaveToMenu(); };
    if ($('rAgain')) $('rAgain').onclick = () => { sound.play('click'); startSolo(); };
  }

  dispose() {
    for (const v of this.views.values()) { scene.remove(v.rig.root); v.rig.dispose(); }
    for (const d of this.decoyRigs.values()) { scene.remove(d.root); d.dispose(); }
    for (const d of this.ghostRigs.values()) { scene.remove(d.root); d.dispose(); }
    for (const w of this.throws) scene.remove(w.g);
    if (this.mini) this.mini.close('gone');
    $('lockerView').classList.add('hidden');
    for (const d of this.disRigs.values()) scene.remove(d.rig.root);
    $('minimap').classList.add('hidden'); $('tasks').classList.add('hidden');
    for (const b of this.bursts || []) scene.remove(b.g);
    clearTimeout(this.introT); clearTimeout(this.introT2);
    this.endAssemble(); this.spawn = null; $('spawnCv').classList.add('hidden');
    this.s.on.ev = null;
    world.setShards(null); world.setExits([], false);
    $('hud').classList.add('hidden'); $('intro').classList.add('hidden'); $('touch').classList.add('hidden');
    fx.exeView = false;
  }
}

// ------------------------------------------------------------------ menus
const screens = ['title', 'soloPick', 'custom', 'lobby', 'results', 'pause', 'settings', 'admin'];
let curScreen = 'title';
function show(id) { curScreen = id; for (const s of screens) $(s).classList.toggle('hidden', s !== id); }
// menus that sit on the pixel-art title picture instead of the 3D world
const PIX_SCREENS = new Set(['title', 'soloPick', 'lobby', 'settings', 'admin']);
const title = new Title($('pix'), sound, () => $('title').classList.add('menu'));
const pressStart = () => { if (!window.__bootDone) return false; if (!match && curScreen === 'title' && title.state !== 'evil') { sound.start(); title.press(); return true; } return false; };
$('pix').addEventListener('pointerdown', () => { sound.start(); pressStart(); });
addEventListener('keydown', (e) => { if (!e.repeat && !(document.activeElement && document.activeElement.tagName === 'INPUT') && pressStart()) e.preventDefault(); });
let menuMode = 'title'; // what the background camera does: title | custom
let net = null;

function setStatus(msg, err = false) { const s = $('status'); s.textContent = msg; s.classList.toggle('err', err); }
function updateWho() { $('whoami').textContent = `${myName()}${acct.user ? ' ✓' : ''} · ${CHARS[save.char].name}`; }
/** The title's account line: who you're signed in as, or how to sign in. */
function renderAcct() {
  const el = $('acct');
  if (acct.user) el.innerHTML = `<span class="tick">✓</span> ${isOwner() ? `<b class="own">👑 ${esc(myName())}</b><span class="owntag">OWNER</span>` : `<b>${esc(myName())}</b>`}`;
  else el.innerHTML = `Guest · <a href="../../" target="_top">Sign in</a> to use your account`;
  el.title = acct.user ? 'Signed in with your Free Period account' : '';
}
function accountChanged() { renderAcct(); updateWho(); if (curScreen === 'custom') renderCustom(); }
renderAcct();
refreshAccount(acct).then((a) => { acct = a; accountChanged(); });
// signing in or out on Free Period in another tab
addEventListener('storage', (e) => { if (e.key === 'fp.token' || e.key === 'fp.user' || e.key === null) { acct = account(); accountChanged(); refreshAccount(acct).then((a) => { acct = a; accountChanged(); }); } });

/** The owner's announcement: a banner in a round, a line in the lobby. */
function showAnn(m) {
  sound.play('click');
  const line = `<b class="own">📢 ${esc(m.by)}</b> ${esc(m.text)}`;
  if (match && !match.done) {
    const b = $('annBar'); b.innerHTML = `<small>📢 ${esc(m.by)} · OWNER</small>${esc(m.text)}`; b.classList.add('on');
    clearTimeout(showAnn.t); showAnn.t = setTimeout(() => b.classList.remove('on'), 5000);
    feed(line);
  }
  else $('lobbyAnn').innerHTML = line;
}

// ------------------------------------------------------------------ ADMIN.EXE (the owner's tools)
let adminFrom = null;
const canAdmin = () => (match ? !!match.isOwn : !!(net && net.own));
function openAdmin() {
  if (curScreen === 'admin' || !canAdmin()) return;
  adminFrom = curScreen;
  if (match && !match.done) paused = true;
  $('admNote').textContent = '';
  renderAdmin(); show('admin');
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeAdmin() {
  if (curScreen !== 'admin') return;
  if (match && !match.done) { paused = false; show(null); if (!touch) canvas.requestPointerLock?.()?.catch?.(() => {}); }
  else show(adminFrom && adminFrom !== 'admin' ? adminFrom : net ? 'lobby' : 'title');
}
function renderAdmin() {
  const inGame = !!(match && !match.done && match.isOwn && match.phase !== 'over');
  const people = net && net.lobby ? net.lobby.players : [];
  $('admWho').innerHTML = `<b class="own">👑 ${esc(myName())}</b><span class="owntag">OWNER</span> · ${net ? `room ${esc((net.lobby && net.lobby.code) || '')}` : 'solo game'}`;
  const room = [];
  if (net && !match) room.push('<button data-a="start">Start now</button>');
  if (inGame) room.push('<button data-a="end">End round</button>');
  $('admRoomBtns').innerHTML = room.join('');
  $('admRoomBtns').classList.toggle('hidden', !room.length);
  $('admExeWrap').classList.toggle('hidden', !net);
  $('admExe').innerHTML = net ? [['', 'Random'], ['0', 'A bot'], ...people.map((p) => [String(p.id), p.id === net.me ? 'Me' : p.name])]
    .map(([id, l]) => `<button data-a="exe" data-id="${id}" class="${(admExe === null ? '' : admExe) === id ? 'on' : ''}">${esc(l)}</button>`).join('') : '';
  const others = net ? people.filter((p) => p.id !== net.me) : [];
  $('admKickWrap').classList.toggle('hidden', !others.length);
  $('admKick').innerHTML = others.map((p) => `<button data-a="kick" data-id="${p.id}">✕ ${esc(p.name)}</button>`).join('');
  $('admAnnWrap').classList.toggle('hidden', !net);
  $('admPow').classList.toggle('hidden', !inGame);
  const POW = [['god', 'God mode'], ['speed', 'Super speed'], ['fly', touch ? 'Fly (JUMP goes up)' : 'Fly (Space up, C down)'], ['nocd', 'No cooldowns']];
  $('admPowers').innerHTML = POW.map(([k, l]) => `<button data-a="pow" data-k="${k}" class="${adm[k] ? 'on' : ''}">${l}${adm[k] ? ' ON' : ''}</button>`).join('')
    + (inGame && match.role === 'exe' ? '<button data-a="meter">Fill Awakening</button>' : '');
  $('admRnd').classList.toggle('hidden', !inGame);
  if (inGame) {
    const targets = [...match.views.values()].filter((v) => v.id !== match.me);
    $('admTp').innerHTML = targets.map((v) => `<button data-a="tp" data-id="${v.id}">${esc(v.role === 'exe' ? VARIANTS[v.variant].name : v.name)}</button>`).join('')
      + ZONES.map((z, i) => `<button data-a="tpz" data-z="${i}">${esc(z.name)}</button>`).join('');
    $('admRound').innerHTML = '<button data-a="tasks">Finish all tasks</button><button data-a="time" data-d="60">+1 min</button><button data-a="time" data-d="-60">−1 min</button><button data-a="world">Switch world</button>';
  }
  $('admEmpty').classList.toggle('hidden', !!(inGame || net));
}
$('admin').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  if (!b || !canAdmin()) return;
  sound.play('click');
  const a = b.dataset.a, s = match && !match.done ? match.s : null, note = (t) => { $('admNote').textContent = t; };
  switch (a) {
    case 'start': if (net) net.admin({ c: 'start' }); closeAdmin(); return;
    case 'end': if (s) s.admin({ c: 'end' }); closeAdmin(); return;
    case 'exe': admExe = b.dataset.id === '' ? null : b.dataset.id; if (net) net.admin({ c: 'exe', id: admExe === null ? null : +admExe }); break;
    case 'kick': if (net) net.admin({ c: 'kick', id: +b.dataset.id }); break;
    case 'pow': {
      const k = b.dataset.k; adm[k] = !adm[k];
      if ((k === 'god' || k === 'nocd') && s) s.admin({ c: k, on: adm[k] });
      note(`${b.textContent.replace(/ ON$/, '')} ${adm[k] ? 'on' : 'off'}`);
      break;
    }
    case 'meter': if (s) s.admin({ c: 'meter' }); note('Awakening meter is full. Press V.'); break;
    case 'tp': if (s) s.admin({ c: 'tp', id: +b.dataset.id }); closeAdmin(); return;
    case 'tpz': if (s) s.admin({ c: 'tp', zone: +b.dataset.z }); closeAdmin(); return;
    case 'tasks': if (s) s.admin({ c: 'tasks' }); note('Every task is done. The gates are open.'); break;
    case 'time': if (s) s.admin({ c: 'time', d: +b.dataset.d }); note(+b.dataset.d > 0 ? 'Added a minute' : 'Took away a minute'); break;
    case 'world': if (s) s.admin({ c: 'world' }); closeAdmin(); return;
  }
  renderAdmin();
});
const sendAnn = () => { const t = $('admAnn').value.trim(); if (!t || !net || !net.own) return; net.admin({ c: 'ann', text: t }); $('admAnn').value = ''; $('admNote').textContent = 'Sent to everyone in the room'; };
$('admAnnGo').onclick = () => { sound.play('click'); sendAnn(); };
$('admAnn').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAnn(); });
$('admClose').onclick = () => { sound.play('click'); closeAdmin(); };

function endMatch() { if (match) { match.dispose(); match = null; } paused = false; if (document.pointerLockElement) document.exitPointerLock(); }
function leaveToMenu() {
  endMatch();
  if (net) { net.close(); net = null; reportRoom(null); }
  show('title'); menuMode = 'title'; setStatus('');
  refreshOnline();
}

function startSolo() {
  endMatch();
  let role = save.soloRole;
  if (role === 'random') role = Math.random() < 1 / 3 ? 'exe' : 'surv';
  const session = new LocalSession({ seed: Math.floor(Math.random() * 1e9), players: [{ id: 1, name: myName(), look: save.look, char: save.char, variant: save.variant, unlock: myUnlock(), own: isOwner(), acct: !!acct.user }], exeId: role === 'exe' ? 1 : null, me: 1 });
  match = new Match(session, { solo: true });
  show(null);
  sound.start();
  if (!touch) canvas.requestPointerLock?.()?.catch?.(() => {});
}

// solo role picker
function renderSoloRoles() {
  const opts = [
    { id: 'surv', name: 'Survivor', sub: CHARS[save.char].name, desc: 'Find shards, revive friends, escape.', accent: CHARS[save.char].accent },
    { id: 'exe', name: 'The monster', sub: VARIANTS[save.variant].name, desc: 'Hunt 4 bot survivors.', accent: '#ff2a3a' },
    { id: 'random', name: 'Random', sub: '1 in 3 chance of EXE', desc: 'Let the game decide.', accent: '#b39a9e' },
  ];
  $('soloRoles').innerHTML = opts.map((o) => `<button class="card${save.soloRole === o.id ? ' on' : ''}" data-id="${o.id}" style="--accent:${o.accent}"><b>${o.name}</b><i>${esc(o.sub)}</i><p>${o.desc}</p></button>`).join('');
  $('soloNote').textContent = 'Change your character or monster in Customize.';
}
$('soloRoles').addEventListener('click', (e) => { const b = e.target.closest('.card'); if (!b) return; save.soloRole = b.dataset.id; persist(); sound.play('click'); renderSoloRoles(); });
$('bSolo').onclick = () => { sound.start(); sound.play('click'); renderSoloRoles(); show('soloPick'); };
$('soloBack').onclick = () => { sound.play('click'); show('title'); };
$('soloGo').onclick = () => { sound.play('click'); startSolo(); };

// online
// Free Period's play page shows chat friends which room you're in (their Join button opens ?join=CODE). Nothing when
// the game runs on its own.
function reportRoom(code) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ type: 'fp:room', room: code || null }, location.origin); } catch { /* not framed by Free Period */ }
}
async function goOnline(mode) {
  sound.start(); sound.play('click');
  const code = $('code').value.trim().toUpperCase();
  if (mode === 'join' && code.length !== 4) { setStatus('Type the 4-letter room code first.', true); return; }
  setStatus(mode === 'quick' ? 'Finding a room… (the free server can take up to a minute to wake up)' : 'Connecting… (the free server can take up to a minute to wake up)');
  for (const b of ['bQuick', 'bCreate', 'bJoin']) $(b).disabled = true;
  $('lobbyAnn').innerHTML = ''; admExe = null;
  if (net) net.close();
  net = new NetSession(serverUrl);
  try {
    const w = await net.connect({ name: myName(), look: save.look, char: save.char, variant: save.variant, unlock: myUnlock(), mode, code, token: acct.token || undefined });
    setStatus('');
    net.on.lobby = (m) => renderLobby(m);
    net.on.acct = () => { if (net.lobby) renderLobby(net.lobby); };
    net.on.ann = (m) => showAnn(m);
    net.on.adm = (m) => { $('admNote').textContent = m.msg; if (match && !match.done) feed(`<b class="own">ADMIN</b> ${esc(m.msg)}`); };
    net.on.round = () => { endMatch(); match = new Match(net, { solo: false }); show(null); if (!touch) canvas.requestPointerLock?.()?.catch?.(() => {}); };
    net.on.close = () => { const wasIn = !!match || !$('lobby').classList.contains('hidden'), kicked = net && net.kicked; leaveToMenu(); if (kicked) setStatus('The owner kicked you from that room.', true); else if (wasIn) setStatus('Lost connection to the server.', true); };
    renderLobby(w);
    reportRoom(w.code);
    if (w.round) { match = new Match(net, { solo: false }); show(null); }
    else show('lobby');
  } catch (err) {
    setStatus(err.message, true);
    net = null;
    reportRoom(null);
  } finally { for (const b of ['bQuick', 'bCreate', 'bJoin']) $(b).disabled = false; }
}
$('bQuick').onclick = () => goOnline('quick');
$('bCreate').onclick = () => goOnline('create');
$('bJoin').onclick = () => goOnline('join');
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') goOnline('join'); });

let lobbyTimer = null;
function renderLobby(m) {
  if (!net) return;
  const isHost = m.host === net.me;
  $('lobbyKind').textContent = m.public ? 'Quick play room' : 'Room code (tell your friends)';
  $('lobbyCode').textContent = m.code;
  $('lobbyList').innerHTML = m.players.map((p) => `<div><i style="background:${CHARS[p.char] ? CHARS[p.char].accent : '#fff'}"></i>${p.own ? `<b class="own">👑 ${esc(p.name)}</b><span class="owntag">OWNER</span>` : esc(p.name)}${p.acct && !p.own ? ' <span class="tick" title="Signed in with a Free Period account">✓</span>' : ''}${p.id === net.me ? ' (you)' : ''}<small>${CHARS[p.char] ? CHARS[p.char].name : ''}${p.id === m.host ? ' · host' : ''}</small></div>`).join('');
  $('lobbyStart').classList.toggle('hidden', !isHost || m.public);
  $('lobbyAdmin').classList.toggle('hidden', !net.own);
  if (curScreen === 'admin') renderAdmin();
  const startAt = m.startIn != null ? performance.now() + m.startIn * 1000 : null;
  clearInterval(lobbyTimer);
  const tick = () => {
    let s;
    if (m.state === 'game') s = 'A round is being played. You will join the next one.';
    else if (startAt) s = `Starting in ${Math.max(0, Math.ceil((startAt - performance.now()) / 1000))}… One of you will be EXE. Empty spots get bots.`;
    else s = isHost ? `Press Start when everyone is in (up to ${ROUND.MAX_PLAYERS}). Empty spots get bots.` : 'Waiting for the host to start…';
    $('lobbyStatus').textContent = s;
  };
  tick(); lobbyTimer = setInterval(tick, 250);
  if (!match || match.done) { if (match && match.done) { endMatch(); } if (curScreen !== 'admin') show('lobby'); }
}
$('lobbyStart').onclick = () => { sound.play('click'); net && net.start(); };
$('lobbyLeave').onclick = () => { sound.play('click'); leaveToMenu(); };
$('lobbyCustom').onclick = () => { sound.play('click'); openCustom('lobby'); };
$('lobbyAdmin').onclick = () => { sound.play('click'); openAdmin(); };

// ------------------------------------------------------------------ customize
let customFrom = 'title', tab = 'char', preview = null;
const pvScene = new THREE.Scene();
const pvCam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 80);
const pvBg = new THREE.CanvasTexture($('pix'));
pvBg.colorSpace = THREE.SRGBColorSpace; pvBg.magFilter = pvBg.minFilter = THREE.NearestFilter; pvBg.generateMipmaps = false;
pvScene.background = pvBg; pvScene.backgroundIntensity = 0.5;
pvScene.add(new THREE.HemisphereLight(0xffd6d6, 0x1a0006, 1.5));
{ const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 6); pvScene.add(key); const rim = new THREE.DirectionalLight(0xff2a2a, 4); rim.position.set(-4, 3, -5); pvScene.add(rim); }
{ const floor = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; pvScene.add(floor); }
addEventListener('resize', () => pvBg.dispose());
function renderPreview(dt) {
  pvBg.needsUpdate = true;
  if (preview) { preview.root.rotation.y += dt * 0.5; preview.update(dt, { speed: 0, atk: -1 }); }
  const exe = tab === 'exe', h = exe ? 4.0 : 2.6, dist = h * 2.7 + 2.5;
  pvCam.aspect = innerWidth / innerHeight; pvCam.updateProjectionMatrix();
  const halfW = Math.tan(THREE.MathUtils.degToRad(pvCam.fov / 2)) * dist * pvCam.aspect, off = innerWidth > 760 ? halfW * 0.36 : 0;
  pvCam.position.set(-off, h * 0.62, dist); pvCam.lookAt(-off, h * 0.5, 0);
  renderer.render(pvScene, pvCam);
}
function rebuildPreview() {
  if (preview) { pvScene.remove(preview.root); preview.dispose(); }
  preview = tab === 'exe' ? new Rig({ role: 'exe', variant: save.variant }) : new Rig({ role: 'surv', look: save.look, char: save.char });
  preview.root.rotation.y = 0.3;
  pvScene.add(preview.root);
}
function openCustom(from) { customFrom = from; show('custom'); menuMode = 'custom'; renderCustom(); rebuildPreview(); }
function closeCustom() {
  if (preview) { pvScene.remove(preview.root); preview.dispose(); preview = null; }
  persist(); updateWho();
  if (net) net.pick({ name: myName(), look: save.look, char: save.char, variant: save.variant, unlock: myUnlock() });
  menuMode = 'title';
  show(customFrom);
}
function swatches(id, list, cur, onPick) {
  $(id).innerHTML = list.map((c) => `<button data-v="${c}" class="${c === cur ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('');
  $(id).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; onPick(b.dataset.v); sound.play('click'); renderCustom(); rebuildPreview(); };
}
function chips(id, list, cur, onPick) {
  $(id).innerHTML = list.map((c) => `<button data-v="${c}" class="${c === cur ? 'on' : ''}">${LABELS[c] || c}</button>`).join('');
  $(id).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; onPick(b.dataset.v); sound.play('click'); renderCustom(); rebuildPreview(); };
}
function renderCustom() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const t of ['char', 'avatar', 'exe']) $('tab-' + t).classList.toggle('hidden', t !== tab);
  const lvLine = (k) => { const l = isOwner() ? { lv: LEVEL.max } : lvOf(k); return `<div class="lv">Level ${l.lv}${l.lv < LEVEL.max ? ` <span class="xpbar"><i style="width:${Math.round((l.into / l.need) * 100)}%"></i></span>` : ' · MAX'}</div>`; };
  $('charCards').innerHTML = CHAR_IDS.map((id) => { const c = CHARS[id], q = unlocked(id); return `<button class="card${save.char === id ? ' on' : ''}" data-id="${id}" style="--accent:${c.accent}"><b>${c.name}</b><i>${c.role}</i>${lvLine(id)}<div class="ab">E ${c.abilityName}</div><div class="ab">R ${c.r.name}</div><p>${esc(c.r.desc)}</p><div class="ab${q ? '' : ' lockd'}">Q ${c.q.name}${q ? '' : ' 🔒 Lv 10'}</div><p>${esc(c.q.desc)}</p></button>`; }).join('');
  $('exeCards').innerHTML = VARIANT_IDS.map((id) => { const v = VARIANTS[id], aw = unlocked(id); return `<button class="card${save.variant === id ? ' on' : ''}" data-id="${id}" style="--accent:#ff2a3a"><b>${esc(v.name)}</b><i>${v.role} · speed ${v.speed} · hits ${v.dmg}</i>${lvLine(id)}<p>${esc(v.desc)}</p><div class="ab">Click ${v.atkName}</div>${['abl', 'ab2', 'ab3', 'ab4'].map((k, i) => `<div class="ab">${'ERQF'[i]} ${v.moves[k].name}</div>`).join('')}<div class="ab${aw ? '' : ' lockd'}">V ${v.awake.name}${aw ? '' : ' 🔒 Lv 10'}</div><p>${esc(v.awake.desc)}</p></button>`; }).join('');
  const L = save.look;
  $('name').value = acct.user ? myName() : save.name;
  $('name').disabled = !!acct.user;
  $('nameNote').textContent = acct.user ? 'Your name comes from your Free Period account.' : '';
  swatches('swSkin', SKINS, L.skin, (v) => { L.skin = v; });
  swatches('swShirt', COLORS, L.shirt, (v) => { L.shirt = v; });
  chips('chStyle', SHIRT_STYLES, L.style, (v) => { L.style = v; });
  chips('chPattern', PATTERNS, L.pattern, (v) => { L.pattern = v; });
  swatches('swPants', COLORS, L.pants, (v) => { L.pants = v; });
  chips('chFace', FACES, L.face, (v) => { L.face = v; });
  chips('chHat', HATS, L.hat, (v) => { L.hat = v; });
  swatches('swHat', COLORS, L.hatColor, (v) => { L.hatColor = v; });
}
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; sound.play('click'); renderCustom(); rebuildPreview(); });
$('charCards').addEventListener('click', (e) => { const b = e.target.closest('.card'); if (!b) return; save.char = b.dataset.id; sound.play('click'); renderCustom(); rebuildPreview(); });
$('exeCards').addEventListener('click', (e) => { const b = e.target.closest('.card'); if (!b) return; save.variant = b.dataset.id; sound.play('laugh', 0.4); renderCustom(); rebuildPreview(); });
$('name').addEventListener('input', () => { save.name = $('name').value.replace(/[^\w .\-]/g, '').slice(0, 16); });
$('bRandom').onclick = () => { save.look = randomLook(Math.random); sound.play('click'); renderCustom(); rebuildPreview(); };
$('bDone').onclick = () => { sound.play('click'); closeCustom(); };
$('bCustom').onclick = () => { sound.start(); sound.play('click'); openCustom('title'); };

// ------------------------------------------------------------------ settings + pause
let settingsFrom = 'title';
function renderSettings() {
  const s = save.settings;
  $('sVol').value = s.vol; $('sSens').value = s.sens;
  $('sQuality').innerHTML = ['low', 'high'].map((q) => `<button data-v="${q}" class="${s.quality === q ? 'on' : ''}">${q === 'low' ? 'Fast (school laptops)' : 'Pretty'}</button>`).join('');
  $('sInvert').innerHTML = [false, true].map((q) => `<button data-v="${q}" class="${s.invert === q ? 'on' : ''}">${q ? 'Inverted look' : 'Normal look'}</button>`).join('');
  $('sRetro').innerHTML = [true, false].map((q) => `<button data-v="${q}" class="${!!s.retro === q ? 'on' : ''}">${q ? '16-bit pixels' : 'Smooth'}</button>`).join('');
}
$('sRetro').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; save.settings.retro = b.dataset.v === 'true'; persist(); renderSettings(); applyRetro(); };
$('sVol').oninput = () => { save.settings.vol = +$('sVol').value; sound.setVolume(save.settings.vol); persist(); };
$('sSens').oninput = () => { save.settings.sens = +$('sSens').value; persist(); };
$('sQuality').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; save.settings.quality = b.dataset.v; persist(); renderSettings(); $('sNote').textContent = save.settings.quality === (hi ? 'high' : 'low') ? '' : 'Graphics change after you reload the page.'; };
$('sInvert').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; save.settings.invert = b.dataset.v === 'true'; persist(); renderSettings(); };
$('sDone').onclick = () => { sound.play('click'); show(settingsFrom); };
$('bSettings').onclick = () => { sound.start(); sound.play('click'); settingsFrom = 'title'; renderSettings(); show('settings'); };

function togglePause(force) {
  if (!match || match.done) return;
  paused = force === true ? true : !paused;
  if (paused) { show('pause'); $('pNote').textContent = match.solo ? 'The game is paused.' : 'Online games keep going while you are paused.'; $('pAdmin').classList.toggle('hidden', !match.isOwn); }
  else { show(null); if (!touch) canvas.requestPointerLock?.()?.catch?.(() => {}); }
}
$('pResume').onclick = () => { sound.play('click'); togglePause(false); paused = false; show(null); if (!touch) canvas.requestPointerLock?.()?.catch?.(() => {}); };
$('pSettings').onclick = () => { sound.play('click'); settingsFrom = 'pause'; renderSettings(); show('settings'); };
$('pLeave').onclick = () => { sound.play('click'); leaveToMenu(); };
$('pAdmin').onclick = () => { sound.play('click'); paused = false; openAdmin(); };

// ------------------------------------------------------------------ server status on the title screen
async function refreshOnline() {
  const el = $('online');
  try {
    const r = await fetch(httpUrl + '/stats', { cache: 'no-store' });
    const s = await r.json();
    el.classList.add('up');
    el.querySelector('span').textContent = s.players ? `${s.players} playing online right now` : 'Server is awake. Make a room!';
  } catch {
    el.classList.remove('up');
    el.querySelector('span').textContent = 'Online server is asleep or offline. Solo works anywhere.';
  }
}

// ------------------------------------------------------------------ title screen ambience: something in the fog
const lurker = new Rig({ role: 'exe', variant: 'exe' });
scene.add(lurker.root);
const LURK = [[-14, -18], [16, -20], [-22, 10], [20, 12], [0, -26], [-6, 24]];
let lurkT = 0, lurkI = 0;
const player = { rig: null };
function menuUpdate(dt, t) {
  if (window.__hxFreeze) { window.__hxFreeze(dt, t); return; }
  applyTheme(menuMode === 'custom' ? 0 : 1);
  lurkT -= dt;
  if (lurkT <= 0) {
    lurkT = 3 + Math.random() * 4; lurkI = (lurkI + 1 + Math.floor(Math.random() * 3)) % LURK.length;
    const [x, z] = LURK[lurkI];
    lurker.root.position.set(x, terrainH(x, z), z);
    lurker.root.visible = Math.random() < 0.75;
    if (menuMode === 'title' && Math.random() < 0.4) { fx.pulse('static', 0.5); sound.play('static', 0.3); }
  }
  lurker.root.rotation.y = Math.atan2(camera.position.x - lurker.root.position.x, camera.position.z - lurker.root.position.z);
  lurker.update(dt, { speed: 0, atk: -1 });
  if (menuMode === 'custom') lurker.root.visible = false;
  if (menuMode === 'custom' && preview) {
    preview.root.rotation.y += dt * 0.5;
    preview.update(dt, { speed: 0, atk: -1 });
    camera.position.lerp(v3.set(4, V.y + (tab === 'exe' ? 2.6 : 2.0), 12.5), 1 - Math.exp(-dt * 4));
    camera.lookAt(4, V.y + (tab === 'exe' ? 2.0 : 1.35), 7);
  } else {
    const a = t * 0.05;
    camera.position.lerp(v3.set(Math.cos(a) * 38, 13 + Math.sin(t * 0.2) * 2, Math.sin(a) * 38), 1 - Math.exp(-dt * 2));
    camera.lookAt(0, 3, 0);
  }
  lantern.position.set(4, V.y + 3, 9);
  fx.update(dt, menuMode === 'custom' ? 0 : 0.05, false, menuMode === 'custom' ? 0 : 1);
  sound.update(dt, menuMode === 'custom' ? 'normal' : 'menu', 0.03);
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), pixWas = null, holdFrames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // the first frame's timestamp can be older than `last`
  last = now;
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  const t = now / 1000;
  const pixOn = !match && PIX_SCREENS.has(curScreen);
  if (pixOn !== pixWas) { pixWas = pixOn; $('pix').classList.toggle('hidden', !pixOn); }
  if (pixOn) {
    // the title picture covers the screen, so the 3D world isn't drawn at all
    title.update(dt); title.draw();
    document.body.classList.toggle('corrupt', title.state === 'evil');
    sound.update(dt, title.music, 0.03);
    return;
  }
  if (!match && curScreen === 'custom') {
    // the title picture behind the character being customized
    title.update(dt); title.draw();
    tickRigFx(dt);
    renderPreview(dt);
    sound.update(dt, 'menu', 0.03);
    return;
  }
  if (match) { lurker.root.visible = false; match.update(dt); }
  else menuUpdate(dt, t);
  tickRigFx(dt, match ? match.viewW : undefined);
  world.update(dt, camera, match && match.camFocus ? match.camFocus : null);
  if (holdFrames > 0) holdFrames--; else composer.render(dt);
  adaptResolution(dt);
}
updateWho();
show('title');
refreshOnline();
requestAnimationFrame(frame);

(async () => {
  const B = window.__boot;
  B && B.set(0.82, 'LOADING FACES');
  const font = document.fonts ? document.fonts.load('8px "Press Start 2P"').catch(() => {}) : 0;
  await Promise.race([Promise.all([glitchFacesReady(), font]), new Promise((r) => setTimeout(r, 4000))]);
  B && B.set(0.9, 'COMPILING SHADERS');
  try { await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 6000))]); } catch {}
  await finishBoot();
  // A friend's Join button on Free Period: ?join=CODE goes straight into that room (solo play is unchanged). Only inside
  // Free Period's play page (same site), which first checks that a chat friend is in that room: a bare game link with
  // ?join= just opens the title.
  const joinCode = (params.get('join') || '').trim().toUpperCase();
  let fpFramed = false;
  try { fpFramed = window.parent !== window && window.parent.location.origin === location.origin && /\/play\.html$/.test(window.parent.location.pathname); } catch { /* another site */ }
  if (fpFramed && /^[A-Z]{4}$/.test(joinCode) && !net && !match) { title.setEvil(); $('code').value = joinCode; goOnline('join'); }
})();

// for testing from the console / headless browser
window.__hx = { get match() { return match; }, get net() { return net; }, get acct() { return acct; }, adm, openAdmin, closeAdmin, world, save, startSolo, leaveToMenu, input, sound, fx, renderer, camera, title, show };
window.__hxGround = (x, z) => supportAt(x, z, terrainH(x, z) + 0.2);
