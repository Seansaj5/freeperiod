// horror.exe: boots the renderer and menus, runs matches (solo or online), drives the camera, HUD and effects.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { Rig, nameTag, glowTex } from './rig.js';
import { Fx, GlitchShader } from './fx.js';
import { Sound } from './audio.js';
import { LocalSession, NetSession } from './net.js';
import { SERVER_URL } from './config.js';
import { CHARS, CHAR_IDS, VARIANTS, VARIANT_IDS, SURV, EXE, F, ST, PHASES, ROUND, TASKS, TASK, PORTAL, moveSpeed, tickStamina } from '../shared/rules.js';
import { stepMove, body } from '../shared/move.js';
import { rayDist, terrainH, supportAt, solidAt, clampXZ, EXITS, V, S as HOLLOW, PORTALS, OBJ, ZONES, zoneAt, HALF, LAVA, GOO, ICE, L as LAKE } from '../shared/map.js';
import { defaultLook, randomLook, sanitizeLook, SKINS, COLORS, SHIRT_STYLES, PATTERNS, FACES, HATS, LABELS } from '../shared/looks.js';
import { clamp, damp, wrap, turnTo } from '../shared/util.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const serverUrl = params.get('server') || SERVER_URL;
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
save.settings = Object.assign({ vol: 0.7, sens: 1, quality: weak ? 'low' : 'high', invert: false }, stored.settings || {});
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };
const myName = () => save.name.trim() || 'Player';

// ------------------------------------------------------------------ renderer
const hi = save.settings.quality === 'high';
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = hi;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);
const world = new World(renderer, save.settings.quality);
const scene = world.scene;
scene.add(camera);
const lantern = new THREE.PointLight(0xffc8a0, hi ? 7 : 10, 24, 1.4);
scene.add(lantern);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: hi && renderer.getPixelRatio() < 1.5 ? 4 : 0 }));
composer.addPass(new RenderPass(scene, camera));
if (hi) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.82));
const glitchPass = new ShaderPass(GlitchShader);
composer.addPass(glitchPass);
composer.addPass(new OutputPass());
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
const fx = new Fx(glitchPass);
/** Shows the normal (0) or corrupted (1) world. */
function applyTheme(w) {
  world.setTheme(w);
  renderer.toneMappingExposure = w ? 1.3 : 1.05;
  fx.corrupt = w;
}
const sound = new Sound();
sound.volume = save.settings.vol;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
let fpsAvg = 60, slowFor = 0;
function adaptResolution(dt) {
  slowFor = fpsAvg < 42 ? slowFor + dt : 0;
  const pr = renderer.getPixelRatio();
  if (slowFor > 3 && pr > 0.7) {
    slowFor = 0;
    renderer.setPixelRatio(Math.max(0.7, pr - 0.2)); renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  }
}

// ------------------------------------------------------------------ input
const touch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const input = { keys: new Set(), dx: 0, dy: 0, jump: false, abl: false, atk: false, sense: false, disguise: false, sprintToggle: false, stick: { x: 0, y: 0 } };
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'KeyF']);
addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  input.keys.add(e.code);
  if (e.code === 'Space') input.jump = true;
  if (e.code === 'KeyE') input.abl = true;
  if (e.code === 'KeyQ') input.sense = true;
  if (e.code === 'KeyF') input.disguise = true;
  if (e.code === 'Escape' && match && !touch && !document.pointerLockElement) togglePause();
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
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && match && !match.done && !paused && !touch) togglePause(true); });
const held = (...codes) => codes.some((c) => input.keys.has(c));

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
  btn('tSense', () => { input.sense = true; });
  btn('tDis', () => { input.disguise = true; });
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
const tagOf = (v) => `<b style="color:${v.role === 'exe' ? '#ff4a5a' : CHARS[v.char].accent}">${esc(v.role === 'exe' ? VARIANTS[v.variant].name : v.name)}</b>`;

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
    world.setShards(this.info.shards); world.setExits(this.info.exits, false);
    this.ready = false; this.done = false; this.over = null;
    this.yaw = 0; this.pitch = -0.22; this.ry = 0;
    this.sta = { stamina: SURV.stamina, exhausted: false, rest: 0 };
    this.cd = { abl: 0, atk: 0, sense: 0, disguise: 0 };
    this.until = { fly: 0, dash: 0, lunge: 0, fade: 0, atk: 0, pop: 0 };
    this.viewW = -1; this.disRigs = new Map(); this.miniT = 0;
    this.phase = 'intro'; this.lastPh = -1; this.lastSt = ST.alive;
    this.specId = null; this.spectating = this.spectator;
    this.absorbTick = 0; this.prevSprint = false;
    session.on.ev = (e) => this.onEvent(e);
    fx.exeView = this.role === 'exe';
    $('hud').classList.remove('hidden');
    $('feed').innerHTML = ''; $('markers').innerHTML = '';
    $('minimap').classList.remove('hidden'); $('tasks').classList.remove('hidden');
    this.buildSlots();
    this.showIntro();
    this.tryStart();
  }

  addView(e) {
    const rig = new Rig({ role: e.role, look: e.look, char: e.char, variant: e.variant });
    scene.add(rig.root);
    const v = { id: e.id, role: e.role, char: e.char, variant: e.variant, name: e.name, bot: e.bot, rig, px: 0, pz: 0, speed: 0, atkStart: -1, wasAtk: false, ry: 0, first: true };
    const friendly = this.role !== 'exe' && e.role === 'surv' && e.id !== this.me;
    if (friendly) { v.tag = nameTag(e.name, CHARS[e.char].accent); v.tag.position.y = 2.95; rig.root.add(v.tag); }
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
    if (this.role === 'surv') { const c = CHARS[this.kind]; this.slots.push({ ...mk(touch ? 'POWER' : 'E', c.abilityName, c.accent), key: 'abl', total: c.cd }); }
    else if (this.role === 'exe') {
      const v = VARIANTS[this.kind];
      this.slots.push({ ...mk(touch ? 'HIT' : 'CLICK', 'Attack', '#ff2a3a'), key: 'atk', total: EXE.atkCd });
      this.slots.push({ ...mk(touch ? 'POWER' : 'E', v.abilityName, '#ff2a3a'), key: 'abl', total: v.cd });
      this.slots.push({ ...mk(touch ? 'SENSE' : 'Q', 'Sense', '#ff2a3a'), key: 'sense', total: EXE.senseCd });
      this.slots.push({ ...mk(touch ? 'HIDE' : 'F', 'Disguise', '#9a7aff'), key: 'disguise', total: EXE.disguiseCd });
    }
    $('hearts').classList.toggle('hidden', this.role !== 'surv');
    $('stam').classList.toggle('hidden', this.role !== 'surv');
    $('touch').classList.toggle('hidden', !touch);
    $('tAtk').classList.toggle('hidden', this.role !== 'exe');
    $('tSense').classList.toggle('hidden', this.role !== 'exe');
    $('tDis').classList.toggle('hidden', this.role !== 'exe');
    $('tSprint').classList.toggle('hidden', this.role !== 'surv');
  }

  showIntro() {
    const box = $('introBox');
    if (this.role === 'exe') {
      const v = VARIANTS[this.kind];
      box.innerHTML = `<div class="who">You are</div><h1 class="glitch" data-text="${esc(v.name)}" style="color:#ff2a3a">${esc(v.name)}</h1><p>Catch them before they escape. Rift portals swap between the normal and the corrupted world (you are faster in the corrupted one).</p><p style="color:var(--muted)">${esc(v.abilityName)}: ${esc(v.desc)}<br>In the normal world press ${touch ? 'HIDE' : 'F'} to disguise as a survivor, then ${touch ? 'HIT' : 'click'} to pop out.</p>`;
    } else if (this.role === 'surv') {
      const c = CHARS[this.kind];
      box.innerHTML = `<div class="who">You are</div><h1 style="color:${c.accent}">${esc(c.name)}</h1><p>Finish the 5 zone tasks to open the escape gates early (some are in the corrupted world: use the rift portals). Escape through a gate in the corrupted world.</p><p style="color:#ffb0b0">EXE can disguise as one of your friends in the normal world.</p><p style="color:var(--muted)">${esc(c.abilityName)}: ${esc(c.desc)}</p>`;
    } else box.innerHTML = `<div class="who">Round in progress</div><h1>Watching</h1><p>You'll join the next round.</p>`;
    $('intro').classList.remove('hidden');
    clearTimeout(this.introT);
    this.introT = setTimeout(() => $('intro').classList.add('hidden'), 5200);
    if (this.role === 'exe') setTimeout(() => sound.play('laugh', 0.8), 600);
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

  useAbility(t, st, sf) {
    if (st !== ST.alive || t < this.cd.abl || sf & F.STUN) return;
    const b = this.body;
    if (this.role === 'surv') {
      const c = CHARS[this.kind];
      if (c.ability === 'dash') {
        const sp = Math.hypot(b.vx, b.vz), dir = sp > 1 ? Math.atan2(b.vx, b.vz) : this.yaw;
        this.ry = dir; this.cd.abl = t + c.cd; this.until.dash = t + c.dur;
        b.vx = Math.sin(dir) * c.dashSpeed; b.vz = Math.cos(dir) * c.dashSpeed; b.vy = Math.max(b.vy, 0); b.lock = c.dur;
        sound.play('dash'); fx.pulse('glitch', 0.25);
      } else if (c.ability === 'fly') { this.cd.abl = t + c.cd; this.until.fly = t + c.dur; sound.play('fly'); }
      else { this.ry = this.yaw; this.cd.abl = t + c.missCd; this.until.atk = t + 0.35; sound.play('swing'); }
      this.pushState(true);
      this.s.action({ k: 'abl' });
      return;
    }
    if (this.phase === 'intro' || this.disguised || t < this.until.pop) return;
    const v = VARIANTS[this.kind];
    this.cd.abl = t + v.cd;
    if (v.ability === 'lunge') {
      this.ry = this.yaw; this.until.lunge = t + v.dur;
      b.vx = Math.sin(this.yaw) * v.lungeSpeed; b.vz = Math.cos(this.yaw) * v.lungeSpeed; b.lock = v.dur;
      sound.play('lunge'); this.pushState(true); this.s.action({ k: 'abl' });
    } else if (v.ability === 'blink') {
      this.s.action({ k: 'abl' });
      let d = v.dist, p = null;
      for (; d > 2; d -= 1) {
        p = clampXZ({ x: b.x + Math.sin(this.yaw) * d, z: b.z + Math.cos(this.yaw) * d });
        const y = supportAt(p.x, p.z, terrainH(p.x, p.z) + 0.5, false, b.w);
        if (!solidAt(p.x, p.z, y, b.r, b.h, b.w)) { p.y = y; break; }
        p = null;
      }
      if (p) { this.blinkFrom(b.x, b.y, b.z); b.x = p.x; b.y = p.y; b.z = p.z; b.vx = b.vz = b.vy = 0; }
      this.ry = this.yaw; sound.play('blink'); fx.pulse('glitch', 0.9);
      this.pushState(true);
    } else if (v.ability === 'fade') {
      this.until.fade = t + v.dur; sound.play('fade'); fx.pulse('static', 0.5);
      this.s.action({ k: 'abl' });
    }
  }

  attack(t, st, sf) {
    if (this.role !== 'exe' || st !== ST.alive || t < this.cd.atk || sf & F.STUN || this.phase === 'intro' || t < this.until.pop) return;
    if (this.disguised) {
      // first click while disguised: pop out of the disguise (a short freeze while it transforms)
      this.until.pop = t + EXE.popTime; this.cd.atk = t + EXE.popTime; this.cd.disguise = t + EXE.disguiseCd; this.disguised = 0;
      this.ry = this.yaw;
      sound.play('pop'); fx.pulse('pop');
      this.pushState(true);
      this.s.action({ k: 'atk' });
      return;
    }
    this.cd.atk = t + EXE.atkCd; this.until.atk = t + 0.35; this.until.fade = 0;
    this.ry = this.yaw;
    sound.play('swing');
    this.pushState(true);
    this.s.action({ k: 'atk' });
  }

  disguise(t, st) {
    if (this.role !== 'exe' || st !== ST.alive || this.disguised || t < this.cd.disguise || this.phase === 'intro') return;
    if (this.viewW !== 0) { feed('You can only disguise in the <b>normal world</b>'); return; }
    sound.play('fade'); fx.pulse('glitch', 0.5);
    this.s.action({ k: 'disguise' });
  }

  sense(t, st) {
    if (this.role !== 'exe' || st !== ST.alive || t < this.cd.sense || this.phase === 'intro' || this.disguised) return;
    this.cd.sense = t + EXE.senseCd;
    sound.play('sense'); fx.pulse('sense');
    this.s.action({ k: 'sense' });
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
        if (mine) { fx.pulse('hit'); sound.play('hit'); banner('YOU GOT HIT', 'Run!'); }
        else sound.play('hit', vol(e.id) * 0.8);
        if (e.by === this.me) { sound.play('laugh', 0.5); fx.pulse('static', 0.4); }
        if (v) feed(`${by ? tagOf(by) : 'EXE'} hit ${tagOf(v)}`);
        break;
      case 'down':
        if (mine) { fx.jumpscare(); sound.play('scare'); }
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
        if (v) feed(`${tagOf(v)} was <b style="color:#ff4a5a">taken</b>`);
        if (mine) { banner('YOU WERE TAKEN', 'Click to watch the others'); fx.pulse('down'); }
        break;
      case 'esc':
        sound.play('escape', mine ? 1 : 0.4);
        if (v) feed(`${tagOf(v)} <b style="color:var(--cyan)">escaped</b>`);
        if (mine) { banner('YOU ESCAPED', 'Click to watch the others', true); fx.pulse('escape'); }
        break;
      case 'atk': if (e.id !== this.me) sound.play('swing', vol(e.id)); break;
      case 'abl': {
        if (e.id !== this.me) {
          const nm = { dash: 'dash', fly: 'fly', punch: e.hit ? 'punch' : 'miss', bonk: e.hit ? 'bonk' : 'miss', lunge: 'lunge', blink: 'blink', fade: 'fade' }[e.ab];
          if (nm) sound.play(nm, vol(e.id));
          if (v) v.ablStart = nowS();
        } else if (e.hit) { this.cd.abl = nowS() + CHARS[this.kind].cd; sound.play(e.ab === 'bonk' ? 'bonk' : 'punch'); }
        if (e.hit) { sound.play('stun', e.target === this.me ? 1 : vol(e.target)); if (v) feed(`${tagOf(v)} ${e.ab === 'bonk' ? 'bonked' : 'stunned'} EXE`); if (e.target === this.me) fx.pulse('glitch', 0.6); }
        break;
      }
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
          if (d < 7) { fx.jumpscare(); sound.play('pop'); } else if (d < 40) { sound.play('pop', clamp(1 - d / 40, 0.2, 0.8)); fx.pulse('pop'); }
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
    const b = this.body;
    let flying = false;
    if (b && !this.spectator && this.aliveLike(st) && !(paused && this.solo)) {
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
      const disChar = this.disguised && this.views.get(this.disguised) ? this.views.get(this.disguised).char : null;
      const sprintEx = this.role === 'exe' && disChar && wantSprint && moving;
      const speed = moveSpeed(this.role, this.kind, st, flags, ph, sprinting || sprintEx, b.w, disChar);
      const canAct = st === ST.alive && !(flags & F.STUN) && !(flags & F.POP) && !(this.role === 'exe' && ph === 'intro');
      const jump = input.jump && canAct && b.ground;
      const res = stepMove(b, { dx, dz, speed, jump, jumpV: this.role === 'exe' ? EXE.jump : SURV.jump, fly: flying, up: held('Space') }, dt);
      if (jump) sound.play('jump', 0.6);
      if (res.spring) { sound.play('spring'); world.kickSpring(res.spring.i); }
      if (res.boost) { sound.play('boost'); fx.pulse('glitch', 0.15); }
      if (res.bumper) { sound.play('bumper'); world.kickBumper(res.bumper); }
      if (res.landed) sound.play('land', 0.5);
      if (b.lock <= 0 && moving && t > this.until.atk) this.ry = turnTo(this.ry, Math.atan2(dx, dz), 12 * dt);
      if (input.abl) this.useAbility(t, st, sf);
      if (input.atk) this.attack(t, st, sf);
      if (input.sense) this.sense(t, st);
      if (input.disguise) this.disguise(t, st);
      this.pushState(false);
    }
    input.jump = input.abl = input.atk = input.sense = input.disguise = false;
    // everyone's rig
    for (const v of this.views.values()) this.updateView(v, dt, snap, t, flying);
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
    fx.update(dt, terror, ph !== 'over', this.viewW);
    sound.update(dt, ph === 'escape' ? 'chase' : ph === 'over' ? 'menu' : this.viewW ? 'corrupt' : 'normal', terror, flying);
    lantern.position.copy(camera.position).y += 1.2;
    lantern.color.setHex(this.role === 'exe' ? 0xff4a3a : 0xffc8a0);
    this.updateHUD(snap, mine, st, sf, hp, t, ph);
  }

  updateView(v, dt, snap, t, flying) {
    const e = snap.pm.get(v.id);
    const root = v.rig.root;
    if (!e) { root.visible = false; return; }
    const st = e[6], flags = e[7];
    v.w = e[11];
    const isMe = v.id === this.me && this.body;
    let pose;
    if (isMe) pose = { x: this.body.x, y: this.body.y, z: this.body.z, ry: this.ry };
    else pose = this.s.sample(v.id, tmpPose);
    if (!pose) { root.visible = false; return; }
    root.visible = st !== ST.esc && st !== ST.out && v.w === this.viewW;
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
        if (this.role !== 'exe') { d.tag = nameTag(info.name, CHARS[info.char].accent); d.tag.position.y = 2.95; d.rig.root.add(d.tag); }
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
    v.rig.update(dt, {
      speed: v.speed, sprint: !!(flags & F.SPRINT), air: !!(flags & F.AIR) || (isMe && !this.body.ground),
      fly: isMe ? flying : !!(flags & F.FLY), down: st === ST.down, atk, stun: !!(flags & F.STUN) || (v.role === 'exe' && !!(flags & F.POP)),
      dash: isMe ? t < this.until.dash : !!(flags & F.DASH), lunge: isMe ? t < this.until.lunge : !!(flags & F.LUNGE),
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
      const status = s === ST.down ? `DOWN ${e[8]}s` : s === ST.esc ? 'ESCAPED' : s === ST.out ? 'TAKEN' : e[5] < SURV.hp ? 'HURT' : 'OK';
      const wIcon = s === ST.alive || s === ST.down ? `<em class="${e[11] ? 'bad' : 'good'}">${e[11] ? '☠' : '☀'}</em>` : '';
      html += `<div class="${cls}${v.id === this.me ? ' me' : ''}"><i style="background:${CHARS[v.char].accent}"></i>${esc(v.name)}${v.bot ? ' <small style="color:var(--muted)">bot</small>' : ''}${e[7] & F.CARRY ? ' <small style="color:#ffa040">core</small>' : ''}<span>${wIcon}${status}</span></div>`;
    }
    setHTML($('team'), html);
    // hearts + stamina
    if (this.role === 'surv') {
      setHTML($('hearts'), Array.from({ length: SURV.hp }, (_, i) => `<span class="${i < hp ? '' : 'gone'}">❤️</span>`).join(''));
      $('stam').querySelector('i').style.transform = `scaleX(${this.sta.stamina / SURV.stamina})`;
      $('stam').classList.toggle('tired', this.sta.exhausted);
    }
    for (const s of this.slots) {
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
      for (let i = 0; i < this.info.shards.length; i++) {
        if (snap.sh & (1 << i) || !(snap.sa & (1 << i))) continue;
        const s = this.info.shards[i];
        if (Math.hypot(this.body.x - s[0], this.body.z - s[2]) < SURV.pickupRange && Math.abs(this.body.y + 1.1 - s[1]) < 2.6) {
          const p = snap.sp.indexOf(i) % 2 === 0 ? snap.sp[snap.sp.indexOf(i) + 1] : 0;
          prompt = `Absorbing shard… stay close<div class="bar"><i style="width:${p}%"></i></div>`;
          if (t > this.absorbTick) { this.absorbTick = t + 0.45; sound.play('absorb', p / 100); }
        }
      }
      for (const v of this.views.values()) {
        if (v.role !== 'surv' || v.id === this.me) continue;
        const e = snap.pm.get(v.id);
        if (e && e[6] === ST.down && Math.hypot(this.body.x - e[1], this.body.z - e[3]) < SURV.reviveRange) prompt = `Reviving ${esc(v.name)}…<div class="bar"><i style="width:${e[9]}%"></i></div>`;
      }
      if (this.viewW === 0) this.info && OBJ.valves.forEach((v, i) => {
        if (snap.vm & (1 << i) || Math.hypot(this.body.x - v.x, this.body.z - v.z) > TASK.valveRange || Math.abs(this.body.y + 1.1 - v.y) > 2.6) return;
        const k = snap.vp.indexOf(i), p = k >= 0 && k % 2 === 0 ? snap.vp[k + 1] : 0;
        prompt = `Turning the valve… stay close<div class="bar"><i style="width:${p}%"></i></div>`;
        if (t > this.absorbTick) { this.absorbTick = t + 0.5; sound.play('valve', 0.4); }
      });
      if (sf & F.CARRY) prompt = 'Carrying the fire core: bring it to the frozen engine';
      if (!prompt) for (const p of PORTALS) if (Math.hypot(this.body.x - p.x, this.body.z - p.z) < 6) prompt = `Rift portal: step in to enter the ${this.viewW ? 'normal' : 'corrupted'} world`;
      if (t < this.until.fly) prompt = touch ? 'Hold JUMP to fly up' : 'Hold Space to fly up';
    }
    if (this.body && st === ST.alive && this.role === 'exe') {
      if (this.disguised) prompt = `Disguised as ${esc(this.views.get(this.disguised)?.name || 'a survivor')} · ${touch ? 'HIT' : 'click'} to pop out`;
      else if (!prompt) for (const p of PORTALS) if (Math.hypot(this.body.x - p.x, this.body.z - p.z) < 6) prompt = `Rift portal → ${this.viewW ? 'normal' : 'corrupted'} world`;
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
    this.drawMarks(marks);
  }

  /** Top-down map: zones, portals, tasks in this world, teammates in this world, gates once open. */
  drawMinimap(snap) {
    const c = $('minimap'), g = c.getContext('2d'), S = c.width, k = S / (HALF * 2);
    const P = (x, z) => [(x + HALF) * k, (z + HALF) * k];
    g.drawImage(minimapBg(this.viewW), 0, 0, S, S);
    const dot = (x, z, r, col, ring) => { const [px, py] = P(x, z); g.beginPath(); g.arc(px, py, r, 0, 7); if (ring) { g.strokeStyle = col; g.lineWidth = 2; g.stroke(); } else { g.fillStyle = col; g.fill(); } };
    for (const p of PORTALS) dot(p.x, p.z, 4, this.viewW ? '#ff3a4a' : '#a07aff', true);
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
    if (match !== this) return;
    this.done = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const won = (this.role === 'exe' && e.win === 'exe') || (this.role === 'surv' && e.escaped.includes(this.me));
    const exeWin = e.win === 'exe';
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
    for (const v of this.views.values()) scene.remove(v.rig.root);
    for (const d of this.disRigs.values()) scene.remove(d.rig.root);
    $('minimap').classList.add('hidden'); $('tasks').classList.add('hidden');
    for (const b of this.bursts || []) scene.remove(b.g);
    clearTimeout(this.introT);
    this.s.on.ev = null;
    world.setShards(null); world.setExits([], false);
    $('hud').classList.add('hidden'); $('intro').classList.add('hidden'); $('touch').classList.add('hidden');
    fx.exeView = false;
  }
}

// ------------------------------------------------------------------ menus
const screens = ['title', 'soloPick', 'custom', 'lobby', 'results', 'pause', 'settings'];
function show(id) { for (const s of screens) $(s).classList.toggle('hidden', s !== id); }
let menuMode = 'title'; // what the background camera does: title | custom
let net = null;

function setStatus(msg, err = false) { const s = $('status'); s.textContent = msg; s.classList.toggle('err', err); }
function updateWho() { $('whoami').textContent = `${myName()} · ${CHARS[save.char].name}`; }

function endMatch() { if (match) { match.dispose(); match = null; } paused = false; if (document.pointerLockElement) document.exitPointerLock(); }
function leaveToMenu() {
  endMatch();
  if (net) { net.close(); net = null; }
  show('title'); menuMode = 'title'; setStatus('');
  refreshOnline();
}

function startSolo() {
  endMatch();
  let role = save.soloRole;
  if (role === 'random') role = Math.random() < 1 / 3 ? 'exe' : 'surv';
  const session = new LocalSession({ seed: Math.floor(Math.random() * 1e9), players: [{ id: 1, name: myName(), look: save.look, char: save.char, variant: save.variant }], exeId: role === 'exe' ? 1 : null, me: 1 });
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
async function goOnline(mode) {
  sound.start(); sound.play('click');
  const code = $('code').value.trim().toUpperCase();
  if (mode === 'join' && code.length !== 4) { setStatus('Type the 4-letter room code first.', true); return; }
  setStatus(mode === 'quick' ? 'Finding a room… (the free server can take up to a minute to wake up)' : 'Connecting… (the free server can take up to a minute to wake up)');
  for (const b of ['bQuick', 'bCreate', 'bJoin']) $(b).disabled = true;
  if (net) net.close();
  net = new NetSession(serverUrl);
  try {
    const w = await net.connect({ name: myName(), look: save.look, char: save.char, variant: save.variant, mode, code });
    setStatus('');
    net.on.lobby = (m) => renderLobby(m);
    net.on.round = () => { endMatch(); match = new Match(net, { solo: false }); show(null); if (!touch) canvas.requestPointerLock?.()?.catch?.(() => {}); };
    net.on.close = () => { const wasIn = !!match || !$('lobby').classList.contains('hidden'); leaveToMenu(); if (wasIn) setStatus('Lost connection to the server.', true); };
    renderLobby(w);
    if (w.round) { match = new Match(net, { solo: false }); show(null); }
    else show('lobby');
  } catch (err) {
    setStatus(err.message, true);
    net = null;
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
  $('lobbyList').innerHTML = m.players.map((p) => `<div><i style="background:${CHARS[p.char] ? CHARS[p.char].accent : '#fff'}"></i>${esc(p.name)}${p.id === net.me ? ' (you)' : ''}<small>${CHARS[p.char] ? CHARS[p.char].name : ''}${p.id === m.host ? ' · host' : ''}</small></div>`).join('');
  $('lobbyStart').classList.toggle('hidden', !isHost || m.public);
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
  if (!match || match.done) { if (match && match.done) { endMatch(); } show('lobby'); }
}
$('lobbyStart').onclick = () => { sound.play('click'); net && net.start(); };
$('lobbyLeave').onclick = () => { sound.play('click'); leaveToMenu(); };
$('lobbyCustom').onclick = () => { sound.play('click'); openCustom('lobby'); };

// ------------------------------------------------------------------ customize
let customFrom = 'title', tab = 'char', preview = null;
function rebuildPreview() {
  if (preview) scene.remove(preview.root);
  preview = tab === 'exe' ? new Rig({ role: 'exe', variant: save.variant }) : new Rig({ role: 'surv', look: save.look, char: save.char });
  preview.root.position.set(4, V.y, 7); preview.root.rotation.y = 0.3;
  scene.add(preview.root);
}
function openCustom(from) { customFrom = from; show('custom'); menuMode = 'custom'; renderCustom(); rebuildPreview(); }
function closeCustom() {
  if (preview) { scene.remove(preview.root); preview = null; }
  persist(); updateWho();
  if (net) net.pick({ name: myName(), look: save.look, char: save.char, variant: save.variant });
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
  $('charCards').innerHTML = CHAR_IDS.map((id) => { const c = CHARS[id]; return `<button class="card${save.char === id ? ' on' : ''}" data-id="${id}" style="--accent:${c.accent}"><b>${c.name}</b><i>${c.role}</i><p>${esc(c.desc)}</p><div class="ab">${c.abilityName} · ${c.cd}s</div></button>`; }).join('');
  $('exeCards').innerHTML = VARIANT_IDS.map((id) => { const v = VARIANTS[id]; return `<button class="card${save.variant === id ? ' on' : ''}" data-id="${id}" style="--accent:#ff2a3a"><b>${esc(v.name)}</b><i>speed ${v.speed}</i><p>${esc(v.desc)}</p><div class="ab">${v.abilityName} · ${v.cd}s</div></button>`; }).join('');
  const L = save.look;
  $('name').value = save.name;
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
}
$('sVol').oninput = () => { save.settings.vol = +$('sVol').value; sound.setVolume(save.settings.vol); persist(); };
$('sSens').oninput = () => { save.settings.sens = +$('sSens').value; persist(); };
$('sQuality').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; save.settings.quality = b.dataset.v; persist(); renderSettings(); $('sNote').textContent = save.settings.quality === (hi ? 'high' : 'low') ? '' : 'Graphics change after you reload the page.'; };
$('sInvert').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; save.settings.invert = b.dataset.v === 'true'; persist(); renderSettings(); };
$('sDone').onclick = () => { sound.play('click'); show(settingsFrom); };
$('bSettings').onclick = () => { sound.start(); sound.play('click'); settingsFrom = 'title'; renderSettings(); show('settings'); };

function togglePause(force) {
  if (!match || match.done) return;
  paused = force === true ? true : !paused;
  if (paused) { show('pause'); $('pNote').textContent = match.solo ? 'The game is paused.' : 'Online games keep going while you are paused.'; }
  else { show(null); if (!touch) canvas.requestPointerLock?.()?.catch?.(() => {}); }
}
$('pResume').onclick = () => { sound.play('click'); togglePause(false); paused = false; show(null); if (!touch) canvas.requestPointerLock?.()?.catch?.(() => {}); };
$('pSettings').onclick = () => { sound.play('click'); settingsFrom = 'pause'; renderSettings(); show('settings'); };
$('pLeave').onclick = () => { sound.play('click'); leaveToMenu(); };

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
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  const t = now / 1000;
  if (match) { lurker.root.visible = false; match.update(dt); }
  else menuUpdate(dt, t);
  world.update(dt, camera, match && match.camFocus ? match.camFocus : null);
  composer.render(dt);
  adaptResolution(dt);
}
updateWho();
show('title');
refreshOnline();
requestAnimationFrame(frame);

// for testing from the console / headless browser
window.__hx = { get match() { return match; }, world, save, startSolo, leaveToMenu, input, sound, fx, renderer, camera };
window.__hxGround = (x, z) => supportAt(x, z, terrainH(x, z) + 0.2);
