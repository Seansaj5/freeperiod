// Close Call Karts: the kart page. Customize your kart (body, wheels, glider, paint), pick a race (Grand Prix,
// single race, time trial), race seven computer karts with items, drifting and gliders.
// Every scene change goes through the liquid glass water (../../js/liquid.js).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Liquid, markLiquid, cameThroughLiquid } from '../../js/liquid.js';
import { Sound } from '../../js/audio.js';
import { account, initAccount, saved } from '../../js/account.js';
import { BODIES, WHEELS, GLIDERS, PAINTS, PART_LISTS, STAT_NAMES, STARTER, UNLOCK_ORDER, COINS_PER_UNLOCK, statsOf, buildKart, buildPart, partById } from './parts.js';
import { TRACKS, THEMES, trackById } from './tracks.js';
import { Track } from './track.js';
import { Race, rivalBuilds, PAINT_NAMES } from './race.js';
import { CLASSES, DRIFT_LV } from './kart.js';
import { ITEMS } from './items.js';
import { Music } from './music.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frameWait = () => new Promise((r) => requestAnimationFrame(() => r()));
const damp = (a, b, r, dt) => b + (a - b) * Math.exp(-r * dt);
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const ord = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const fmtT = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(2).padStart(5, '0')}`; };

// ---------------------------------------------------------------- the water comes first
const liquid = new Liquid(60);
liquid.cover(); // this page always starts under the water (it is the loading screen)
cameThroughLiquid(); // use up Close Call's note so it doesn't linger
$('liq-cover').remove();
const loadBar = (k, msg) => { $('load-bar').style.width = `${Math.round(k * 100)}%`; if (msg) $('load-msg').textContent = msg; };
const logo = (on) => $('liq-logo').classList.toggle('off', !on);

// ---------------------------------------------------------------- save (shared with Close Call: closecall.v1 -> kart)
const KEY = 'closecall.v1';
const readSave = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const KDEF = () => ({ b: 'classic', w: 'standard', g: 'wing', p: 0, c: 0, cls: 'pro', mode: 'gp', trk: 'harbor', tt: {}, gp: {}, m: 1, nw: [] });
let save = readSave();
function fixKart() {
  const k = (save.kart = Object.assign(KDEF(), save.kart && typeof save.kart === 'object' ? save.kart : {}));
  for (const [f, list] of [['b', BODIES], ['w', WHEELS], ['g', GLIDERS]]) if (!list.some((p) => p.id === k[f])) k[f] = list[0].id;
  if (!(k.p >= 0 && k.p < PAINTS.length)) k.p = 0;
  if (!CLASSES[k.cls]) k.cls = 'pro';
  if (!['gp', 'vs', 'tt'].includes(k.mode)) k.mode = 'gp';
  if (!TRACKS.some((t) => t.id === k.trk)) k.trk = TRACKS[0].id;
  for (const f of ['tt', 'gp']) if (!k[f] || typeof k[f] !== 'object') k[f] = {};
  if (!Array.isArray(k.nw)) k.nw = [];
  k.c = Math.max(0, Math.floor(+k.c || 0));
}
fixKart();
const K = () => save.kart;
/** Only the kart part of the save is ours; everything else in it is Close Call's, re-read so nothing gets overwritten. */
function persist() {
  const cur = readSave(); cur.kart = save.kart; save = cur;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* private mode */ }
  saved();
}
const settings = Object.assign({ vol: 0.7, quality: (navigator.hardwareConcurrency || 4) <= 4 || /CrOS|Android|iPhone|iPad/.test(navigator.userAgent) ? 'low' : 'high' }, save.settings || {});
const hi = settings.quality === 'high';

const unlockedN = (c) => Math.min(UNLOCK_ORDER.length, Math.floor(c / COINS_PER_UNLOCK));
const owns = (id) => account.owner || STARTER.includes(id) || UNLOCK_ORDER.indexOf(id) < unlockedN(K().c);
const myBuild = () => ({ body: K().b, wheels: K().w, glider: K().g, paint: PAINTS[K().p] });

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: !hi, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
let composer = null, renderPass = null;
if (hi) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: renderer.getPixelRatio() >= 1.5 ? 0 : 4 }));
  renderPass = new RenderPass(new THREE.Scene(), camera);
  composer.addPass(renderPass);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.42, 0.92));
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
}
function draw(scene) {
  if (composer) { renderPass.scene = scene; composer.render(); } else renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight);
  placeGarageCam();
});
let fpsAvg = 60, slowFor = 0;
function adapt(dt) {
  slowFor = fpsAvg < 42 ? slowFor + dt : 0;
  const pr = renderer.getPixelRatio();
  if (slowFor > 3 && pr > 0.7) {
    slowFor = 0; renderer.setPixelRatio(Math.max(0.7, pr - 0.2)); renderer.setSize(innerWidth, innerHeight);
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
  }
}

// ---------------------------------------------------------------- skies and reflections
const SKY_VERT = 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }';
const SKY_FRAG = `varying vec3 vP; uniform vec3 uTop, uMid, uGlow, uSun; uniform float uStars;
  float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  void main(){
    float y = vP.y;
    vec3 c = mix(uMid, uTop, smoothstep(0.0, 0.55, y));
    float s = max(0.0, dot(vP, normalize(uSun)));
    c = mix(c, uGlow, smoothstep(0.25, -0.02, y) * (0.55 + 0.45 * s));
    c += uGlow * pow(s, 24.0) * 0.8 + vec3(1.0, 0.9, 0.7) * pow(s, 900.0) * 3.0;
    if (uStars > 0.0) { vec3 q = floor(vP * 240.0); float st = step(0.9975, h(q)) * smoothstep(0.05, 0.4, y); c += vec3(st) * uStars; }
    c = mix(c, uMid * 0.6, smoothstep(0.0, -0.2, y));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;
function skyMesh(th, r = 1500) {
  const v = (a) => new THREE.Vector3(...a);
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: v(th.sky.top) }, uMid: { value: v(th.sky.mid) }, uGlow: { value: v(th.sky.glow) }, uSun: { value: v(th.sunDir) }, uStars: { value: th.stars ? 1 : 0 } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  }));
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
function envFrom(scene) {
  const pm = new THREE.PMREMGenerator(renderer);
  const t = pm.fromScene(scene, 0.03).texture;
  pm.dispose();
  scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return t;
}
function trackEnv(th) {
  const s = new THREE.Scene();
  s.add(skyMesh(th, 40));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.6) }));
  sun.position.set(...th.sunDir.map((x) => x * 30)); s.add(sun);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(...th.sky.mid).multiplyScalar(0.5) }));
  g.rotation.x = -Math.PI / 2; g.position.y = -3; s.add(g);
  return envFrom(s);
}
function studioEnv() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x05070d);
  const panel = (w, h, c, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  panel(14, 4, new THREE.Color(3, 3, 3.2), 0, 12, 0);
  panel(8, 8, new THREE.Color(1.6, 1.2, 0.8), 14, 4, 6);
  panel(8, 8, new THREE.Color(0.5, 1.1, 1.8), -14, 3, -4);
  panel(30, 2, new THREE.Color(0.6, 0.7, 0.9), 0, 1, -16);
  return envFrom(s);
}

// ---------------------------------------------------------------- the garage (showroom)
const studio = studioEnv();
const garage = new THREE.Scene();
garage.background = new THREE.Color(0x04070e);
garage.fog = new THREE.Fog(0x04070e, 14, 34);
garage.add(new THREE.HemisphereLight(0x9ab0ff, 0x1a1410, 0.9));
const key = new THREE.SpotLight(0xfff0dc, 120, 30, 0.5, 0.5, 1.4); key.position.set(4, 9, 6); garage.add(key);
const rim = new THREE.SpotLight(0x6ad8ff, 80, 30, 0.6, 0.6, 1.4); rim.position.set(-6, 5, -6); garage.add(rim);
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x0a0e18, roughness: 0.3, metalness: 0.6, envMap: studio, envMapIntensity: 0.6 }));
  floor.rotation.x = -Math.PI / 2; garage.add(floor);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x161c2c, roughness: 0.25, metalness: 0.8, envMap: studio }));
  pod.position.y = 0.15; garage.add(pod);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.78, 0.04, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.6) }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; garage.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.4, 0.3) }));
  ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.02; garage.add(ring2);
  for (let i = 0; i < 18; i++) { // light strips on the back wall
    const a = (i / 18) * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6, 0.12), new THREE.MeshBasicMaterial({ color: i % 3 ? new THREE.Color(0.2, 0.5, 0.9) : new THREE.Color(1.6, 0.9, 0.2) }));
    b.position.set(Math.cos(a) * 16, 3, Math.sin(a) * 16); garage.add(b);
  }
}
const turntable = new THREE.Group(); turntable.position.y = 0.3; garage.add(turntable);
let preview = null, spin = 0.6, spinV = 0.35, dragX = null;
function setPreview() {
  if (preview) { preview.removeFromParent(); preview.userData.dispose(); }
  preview = buildKart(myBuild(), studio, hi);
  preview.userData.glider.visible = true;
  preview.userData.glider.scale.setScalar(0.85);
  turntable.add(preview);
}
function placeGarageCam() {
  if (mode !== 'garage' && mode !== 'setup' && mode !== 'boot') return;
  camera.fov = 40; camera.updateProjectionMatrix();
  const wide = innerWidth > 760;
  // the kart stands to the right of the panel
  camera.position.set(wide ? 1.0 : 0, 2.5, 7.0);
  camera.lookAt(wide ? -1.7 : 0, 1.0, 0);
}

// ---------------------------------------------------------------- part pictures for the picker
const thumbs = {};
async function makeThumbs() {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xc8d4ff, 0x202020, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 5, 4); s.add(d);
  const cam = new THREE.PerspectiveCamera(30, 208 / 140, 0.1, 50);
  const size = new THREE.Vector2(); renderer.getSize(size);
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(208, 140, false);
  const all = [...BODIES.map((p) => ['body', p]), ...WHEELS.map((p) => ['wheels', p]), ...GLIDERS.map((p) => ['glider', p])];
  let i = 0;
  for (const [kind, p] of all) {
    const o = buildPart(kind, p.id, kind === 'glider' ? 0x2ab8ff : 0xe8322a, studio, false);
    if (kind === 'body') o.remove(o.userData.glider); // (an invisible glider would still count in the size)
    if (kind === 'wheels') o.rotation.y = 0.9;
    if (kind === 'glider') o.rotation.set(0.5, 0.4, 0);
    else if (kind === 'body') o.rotation.y = 0.75;
    s.add(o);
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
    cam.position.set(c.x, c.y + r * 0.45, c.z + r * 3.3); cam.lookAt(c);
    renderer.setClearColor(0x000000, 0);
    renderer.render(s, cam);
    thumbs[p.id] = renderer.domElement.toDataURL('image/png');
    s.remove(o); o.userData.dispose();
    loadBar(0.15 + (++i / all.length) * 0.6);
    if (i % 4 === 0) await frameWait();
  }
  renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y);
}

// ---------------------------------------------------------------- sound
const sound = new Sound();
sound.volume = settings.vol;
const music = new Music(sound);
music.on = K().m !== 0;
const wake = () => { sound.start(); if (sound.ctx && !sound._kart) { sound._kart = true; sound.setEngine('i4', 1.5); } };
addEventListener('pointerdown', wake, { capture: true });

// ---------------------------------------------------------------- screens
let mode = 'boot'; // boot | garage | setup | loading | intro | race | finish | results | pause
const SCREENS = ['garage', 'setup', 'pause', 'results'];
function show(name) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  $('topbar').classList.toggle('hidden', !(name === 'garage' || name === 'setup'));
}

// ---------------------------------------------------------------- garage UI
const ROWS = [['body', 'b', 's-body', 'n-body'], ['wheels', 'w', 's-wheels', 'n-wheels'], ['glider', 'g', 's-glider', 'n-glider']];
let cur = { row: 0, col: 0 }, hoverId = null;
function fillGarage() {
  for (const [kind, f, sid, nid] of ROWS) {
    const el = $(sid); el.innerHTML = '';
    PART_LISTS[kind].forEach((p) => {
      const b = document.createElement('button');
      b.className = 'tile'; b.dataset.id = p.id; b.dataset.kind = kind;
      b.innerHTML = `<img alt="" src="${thumbs[p.id] || ''}"><b>${p.name}</b>`;
      b.onclick = () => pickPart(kind, f, p.id);
      b.onpointerenter = () => { hoverId = p.id; paintStats(); };
      b.onpointerleave = () => { hoverId = null; paintStats(); };
      el.appendChild(b);
    });
    $(nid).textContent = '';
  }
  const sw = $('s-paint'); sw.innerHTML = '';
  PAINTS.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'sw'; b.title = PAINT_NAMES[i];
    b.style.background = `#${c.toString(16).padStart(6, '0')}`;
    b.onclick = () => { K().p = i; persist(); preview.userData.setPaint(c); paintGarage(); music.coin(); };
    sw.appendChild(b);
  });
  paintGarage();
}
function lockText(id) {
  const n = UNLOCK_ORDER.indexOf(id);
  return n < 0 ? '' : `🔒\n${(n + 1) * COINS_PER_UNLOCK} coins`;
}
function paintGarage() {
  const k = K();
  for (const [kind, f, sid, nid] of ROWS) {
    for (const t of $(sid).children) {
      const id = t.dataset.id, own = owns(id);
      t.classList.toggle('on', k[f] === id);
      t.classList.toggle('locked', !own);
      t.dataset.lock = own ? '' : lockText(id);
      const nw = t.querySelector('.new');
      if (own && k.nw.includes(id)) { if (!nw) t.insertAdjacentHTML('beforeend', '<span class="new">NEW</span>'); } else if (nw) nw.remove();
    }
    $(nid).textContent = partById(k[f]).name;
  }
  [...$('s-paint').children].forEach((b, i) => b.classList.toggle('on', i === k.p));
  markCursor();
  paintStats();
  const n = unlockedN(k.c), left = UNLOCK_ORDER.length - n;
  $('c-total').textContent = k.c;
  $('c-next').textContent = account.owner ? 'owner: all parts' : left ? `next part at ${(n + 1) * COINS_PER_UNLOCK}` : 'all parts unlocked';
  $('c-bar').style.width = `${account.owner || !left ? 100 : ((k.c % COINS_PER_UNLOCK) / COINS_PER_UNLOCK) * 100}%`;
  $('g-name').textContent = `${PAINT_NAMES[k.p]} ${partById(k.b).name}`;
}
function markCursor() {
  ROWS.forEach(([, , sid], r) => [...$(sid).children].forEach((t, c) => t.classList.toggle('cur', r === cur.row && c === cur.col && kbNav)));
}
function paintStats() {
  const base = statsOf(myBuild());
  let alt = null;
  if (hoverId) {
    const kind = BODIES.some((p) => p.id === hoverId) ? 'body' : WHEELS.some((p) => p.id === hoverId) ? 'wheels' : 'glider';
    alt = statsOf({ ...myBuild(), [kind]: hoverId });
  }
  $('g-stats').innerHTML = STAT_NAMES.map((n, i) => {
    const v = base[i], a = alt ? alt[i] : v, lo = Math.min(v, a), hiV = Math.max(v, a);
    return `<div class="st"><span>${n}</span><div class="bar"><i style="width:${(lo / 6) * 100}%"></i>${a !== v ? `<i class="d${a < v ? ' neg' : ''}" style="left:${(lo / 6) * 100}%;width:${((hiV - lo) / 6) * 100}%"></i>` : ''}</div><span>${(alt ? a : v).toFixed(2).replace(/\.?0+$/, '')}</span></div>`;
  }).join('');
}
function pickPart(kind, f, id) {
  if (!owns(id)) { $('g-sub').textContent = `${partById(id).name} unlocks at ${(UNLOCK_ORDER.indexOf(id) + 1) * COINS_PER_UNLOCK} coins. Coins come from the road in races.`; music.charge(1); return; }
  K()[f] = id; K().nw = K().nw.filter((x) => x !== id);
  persist(); setPreview(); paintGarage(); music.gotItem();
  $('g-sub').textContent = 'Drag the kart to spin it';
  spinV = 2.2;
}
let kbNav = false;
function garageKey(e) {
  const rows = ROWS.length + 1;
  const len = (r) => (r < ROWS.length ? PART_LISTS[ROWS[r][0]].length : PAINTS.length);
  if (['ArrowUp', 'KeyW'].includes(e.code)) cur.row = (cur.row + rows - 1) % rows;
  else if (['ArrowDown', 'KeyS'].includes(e.code)) cur.row = (cur.row + 1) % rows;
  else if (['ArrowLeft', 'KeyA'].includes(e.code)) cur.col--;
  else if (['ArrowRight', 'KeyD'].includes(e.code)) cur.col++;
  else if (e.code === 'Enter' || e.code === 'Space') {
    if (!kbNav) { $('g-go').click(); return; }
    if (cur.row < ROWS.length) { const [kind, f] = ROWS[cur.row]; pickPart(kind, f, PART_LISTS[kind][cur.col].id); }
    else { K().p = cur.col; persist(); preview.userData.setPaint(PAINTS[cur.col]); paintGarage(); }
    return;
  } else return;
  kbNav = true;
  cur.col = Math.max(0, Math.min(len(cur.row) - 1, cur.col));
  if (cur.row < ROWS.length) { const t = $(ROWS[cur.row][2]).children[cur.col]; t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); hoverId = t.dataset.id; }
  else hoverId = null;
  markCursor(); paintStats(); music.tickRoll();
}
renderer.domElement.addEventListener('pointerdown', (e) => { if (mode === 'garage') { dragX = e.clientX; spinV = 0; } });
addEventListener('pointermove', (e) => { if (dragX != null) { spin += (e.clientX - dragX) * 0.012; spinV = (e.clientX - dragX) * 0.7; dragX = e.clientX; } });
addEventListener('pointerup', () => { dragX = null; });

$('g-go').onclick = () => { mode = 'setup'; show('setup'); paintSetup(); music.gotItem(); };
$('g-back').onclick = () => leave();
$('m-back').onclick = () => { mode = 'garage'; show('garage'); paintGarage(); };

// ---------------------------------------------------------------- race setup
function outline(t, cv, pad = 10, line = 7) {
  const tr = new Track(t, 'low');
  const x = cv.getContext('2d');
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let k = 0; k < tr.N; k++) { x0 = Math.min(x0, tr.X[k]); x1 = Math.max(x1, tr.X[k]); z0 = Math.min(z0, tr.Z[k]); z1 = Math.max(z1, tr.Z[k]); }
  const sc = Math.min((cv.width - pad * 2) / (x1 - x0), (cv.height - pad * 2) / (z1 - z0));
  const ox = (cv.width - (x1 - x0) * sc) / 2, oz = (cv.height - (z1 - z0) * sc) / 2;
  const P = (k) => [ox + (tr.X[k] - x0) * sc, oz + (tr.Z[k] - z0) * sc];
  x.lineJoin = 'round'; x.lineCap = 'round';
  for (const [w, c] of [[line + 4, 'rgba(0,0,0,0.6)'], [line, '#cfd8ff'], [Math.max(1, line - 4), '#3a4466']]) {
    x.beginPath(); for (let k = 0; k <= tr.N; k += 2) { const [a, b] = P(k % tr.N); k ? x.lineTo(a, b) : x.moveTo(a, b); } x.closePath(); x.lineWidth = w; x.strokeStyle = c; x.stroke();
  }
  const [sx, sz] = P(0); x.fillStyle = '#ffc21a'; x.fillRect(sx - 4, sz - 4, 8, 8);
  return { map: (px, pz) => [ox + (px - x0) * sc, oz + (pz - z0) * sc], track: tr };
}
const tracksBuilt = {};
function paintSetup() {
  const k = K();
  for (const b of $('m-mode').children) b.classList.toggle('on', b.dataset.mode === k.mode);
  for (const b of $('m-cls').children) b.classList.toggle('on', b.dataset.cls === k.cls);
  $('m-cls').style.display = k.mode === 'tt' ? 'none' : '';
  const cupBest = k.gp[k.cls];
  $('m-cup').classList.toggle('hidden', k.mode !== 'gp');
  $('m-cup').innerHTML = `<span class="tro">${trophySvg(cupBest || 0)}</span><div><b>Turbo Cup · ${CLASSES[k.cls].name}</b>${cupBest ? `Best: ${cupBest}${ord(cupBest)} place trophy` : 'Three races in a row. Win points by place; most points takes the gold.'}</div>`;
  $('m-tl').textContent = k.mode === 'gp' ? 'The three tracks' : 'Track';
  const el = $('m-tracks');
  if (!el.children.length) {
    TRACKS.forEach((t) => {
      const b = document.createElement('button'); b.className = 'tcard'; b.dataset.t = t.id;
      const cv = document.createElement('canvas'); cv.width = 240; cv.height = 150;
      outline(t, cv, 12, 6);
      b.appendChild(cv); b.insertAdjacentHTML('beforeend', `<b>${t.name}</b><small></small>`);
      b.onclick = () => { if (K().mode === 'gp') return; K().trk = t.id; persist(); paintSetup(); music.tickRoll(); };
      el.appendChild(b);
    });
  }
  for (const b of el.children) {
    const t = trackById(b.dataset.t), best = k.tt[t.id];
    b.classList.toggle('on', k.mode !== 'gp' && k.trk === t.id);
    b.classList.toggle('dim', false);
    b.querySelector('small').textContent = k.mode === 'tt' ? (best ? `Best ${fmtT(best / 1000)}` : 'No time yet') : t.blurb.split('.')[0];
  }
  $('m-note').textContent = k.mode === 'tt' ? 'Just you and the clock, three laps, three nitros. Drift for mini-turbos and hit the dash pads.'
    : k.mode === 'gp' ? 'Seven computer karts. 15 points for a win, then 12, 10, 8, 6, 4, 2, 1. Coins you pick up unlock new parts.'
      : `One race on ${trackById(k.trk).name} against seven computer karts.`;
}
$('m-mode').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) { K().mode = b.dataset.mode; persist(); paintSetup(); music.tickRoll(); } };
$('m-cls').onclick = (e) => { const b = e.target.closest('[data-cls]'); if (b) { K().cls = b.dataset.cls; persist(); paintSetup(); music.tickRoll(); } };
$('m-go').onclick = () => startEvent();

function trophySvg(place) {
  const c = place === 1 ? ['#fff3b0', '#ffc21a', '#c47a00'] : place === 2 ? ['#ffffff', '#c8d0dc', '#7a8496'] : place === 3 ? ['#ffd8b0', '#d0803a', '#7a4010'] : ['#3a4466', '#2a3048', '#1a2030'];
  return `<svg viewBox="0 0 64 64"><defs><linearGradient id="tg${place}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".5" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient></defs>
    <path d="M18 8h28v10c0 10-6 17-14 17S18 28 18 18z" fill="url(#tg${place})"/><path d="M18 12H9c0 9 4 13 10 14M46 12h9c0 9-4 13-10 14" stroke="${c[1]}" stroke-width="4" fill="none"/>
    <rect x="28" y="34" width="8" height="10" fill="${c[2]}"/><rect x="20" y="44" width="24" height="7" rx="2" fill="url(#tg${place})"/><rect x="16" y="51" width="32" height="6" rx="2" fill="${c[2]}"/>
    ${place ? `<text x="32" y="25" text-anchor="middle" font-family="Bungee" font-size="12" fill="${c[2]}">${place}</text>` : ''}</svg>`;
}

// ---------------------------------------------------------------- items in the HUD
const ICON = {
  nitro: '<svg viewBox="0 0 64 64"><path d="M22 54c0 6 20 6 20 0" fill="#ff8a1a"/><path d="M26 58c2 5 10 5 12 0l-6-8z" fill="#ffe066"/><rect x="20" y="16" width="24" height="38" rx="9" fill="#e8322a"/><rect x="24" y="20" width="5" height="28" rx="2.5" fill="#ff8a80"/><rect x="27" y="7" width="10" height="11" rx="2" fill="#c8ced8"/><rect x="20" y="30" width="24" height="5" fill="#fff"/></svg>',
  oil: '<svg viewBox="0 0 64 64"><path d="M32 6C24 22 14 32 14 42a18 18 0 0 0 36 0C50 32 40 22 32 6z" fill="#14141a" stroke="#4a4e5a" stroke-width="2"/><path d="M22 40c0 5 3 9 7 10" stroke="#6ad8ff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/><ellipse cx="38" cy="30" rx="4" ry="6" fill="#ffc21a" opacity=".35"/></svg>',
  ball: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#22e08a"/><path d="M10 32h44" stroke="#0a6a3a" stroke-width="5"/><circle cx="32" cy="32" r="7" fill="#f2f4f8" stroke="#0a6a3a" stroke-width="3"/><ellipse cx="24" cy="20" rx="7" ry="4" fill="#fff" opacity=".6"/></svg>',
  rocket: '<svg viewBox="0 0 64 64"><g transform="rotate(45 32 32)"><path d="M32 4c8 8 10 20 10 32H22c0-12 2-24 10-32z" fill="#e8322a"/><path d="M32 4c4 4 6 9 7 14H25c1-5 3-10 7-14z" fill="#f2f4f8"/><path d="M22 30l-8 12h8zM42 30l8 12h-8z" fill="#f2f4f8"/><path d="M25 38h14l-3 8h-8z" fill="#c8ced8"/><path d="M28 46h8l-4 14z" fill="#ffb020"/></g></svg>',
  shield: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#3de0ff" opacity=".28" stroke="#8af7ff" stroke-width="3"/><path d="M32 16l12 5v9c0 9-6 15-12 18-6-3-12-9-12-18v-9z" fill="#2ab8ff" stroke="#fff" stroke-width="2"/><ellipse cx="22" cy="20" rx="6" ry="3.5" fill="#fff" opacity=".7"/></svg>',
  coins: '<svg viewBox="0 0 64 64"><g fill="#ffc21a" stroke="#c47a00" stroke-width="2"><ellipse cx="24" cy="44" rx="13" ry="6"/><ellipse cx="24" cy="38" rx="13" ry="6"/><ellipse cx="40" cy="34" rx="13" ry="6"/><ellipse cx="40" cy="28" rx="13" ry="6"/><ellipse cx="32" cy="22" rx="13" ry="6"/></g></svg>',
  overdrive: '<svg viewBox="0 0 64 64"><path d="M32 2l7 15 16-4-8 14 13 10-16 3 2 17-14-10-14 10 2-17-16-3 13-10-8-14 16 4z" fill="#ffe066" stroke="#ff8a1a" stroke-width="2"/><path d="M35 14L22 36h9l-4 16 14-22h-9z" fill="#2ab8ff" stroke="#fff" stroke-width="1.5"/></svg>',
};
ICON.nitro3 = ICON.nitro;
const ROLL = ['nitro', 'oil', 'ball', 'rocket', 'shield', 'coins', 'overdrive'];

// ---------------------------------------------------------------- input
const keys = new Set();
const touch = { left: false, right: false, gas: false, brake: false, drift: false, item: false };
let prevItem = false;
// quick taps can start and end between two frames: remember them until the next frame reads the input
const tapped = { item: false, drift: false };
const ITEM_KEYS = ['KeyE', 'KeyQ', 'KeyJ'], DRIFT_KEYS = ['Space', 'ShiftLeft', 'ShiftRight', 'KeyK'];
addEventListener('keydown', (e) => {
  wake();
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (!e.repeat && ITEM_KEYS.includes(e.code)) tapped.item = true;
  if (!e.repeat && DRIFT_KEYS.includes(e.code)) tapped.drift = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (mode === 'intro') { skipIntro(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'race' || mode === 'finish') pause(true);
    else if (mode === 'pause') pause(false);
    else if (mode === 'setup') $('m-back').click();
    return;
  }
  if (mode === 'garage') garageKey(e);
  else if (mode === 'setup' && e.code === 'Enter') startEvent();
  else if (mode === 'results' && (e.code === 'Enter' || e.code === 'KeyR')) { const b = $('r-foot').querySelector('.primary'); if (b) b.click(); }
  if (e.code === 'KeyM' && mode !== 'garage') toggleMusic();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (mode === 'race') pause(true); });
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
for (const [id, k] of [['t-left', 'left'], ['t-right', 'right'], ['t-gas', 'gas'], ['t-brake', 'brake'], ['t-drift', 'drift'], ['t-item', 'item']]) {
  const el = $(id);
  const on = (v) => (e) => { e.preventDefault(); wake(); touch[k] = v; el.classList.toggle('on', v); };
  el.addEventListener('pointerdown', on(true)); el.addEventListener('pointerup', on(false)); el.addEventListener('pointercancel', on(false)); el.addEventListener('pointerleave', on(false));
}
function readInput() {
  const k = (...c) => c.some((x) => keys.has(x));
  const inp = {
    gas: k('KeyW', 'ArrowUp') || touch.gas,
    brake: k('KeyS', 'ArrowDown') || touch.brake,
    steer: (k('KeyD', 'ArrowRight') || touch.right ? 1 : 0) - (k('KeyA', 'ArrowLeft') || touch.left ? 1 : 0),
    drift: k(...DRIFT_KEYS) || touch.drift || tapped.drift,
    item: k(...ITEM_KEYS) || touch.item,
  };
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p && p.connected) : null;
  if (pad) {
    const ax = pad.axes[0] || 0;
    if (Math.abs(ax) > 0.15) inp.steer = ax;
    if (pad.buttons[14]?.pressed) inp.steer = -1; if (pad.buttons[15]?.pressed) inp.steer = 1;
    if (pad.buttons[0]?.pressed || pad.buttons[7]?.value > 0.2) inp.gas = true;
    if (pad.buttons[1]?.pressed) inp.brake = true;
    if (pad.buttons[5]?.pressed || pad.buttons[6]?.value > 0.3) inp.drift = true;
    if (pad.buttons[4]?.pressed || pad.buttons[2]?.pressed) inp.item = true;
    if (pad.buttons[9]?.pressed && !pad._st && (mode === 'race' || mode === 'pause')) pause(mode === 'race');
    pad._st = pad.buttons[9]?.pressed;
  }
  inp.itemPress = (inp.item && !prevItem) || tapped.item; prevItem = inp.item;
  tapped.item = tapped.drift = false;
  return inp;
}

// ---------------------------------------------------------------- racing
let race = null, track = null, world = null, ev = null; // ev = the event (gp/vs/tt) in progress
let introT = 0, finishT = 0, camYaw = 0, fov = 72, shake = 0, lastPlace = 0, lastLv = 0, popsN = 0, raceTime = 0, mm = null, mmT = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

/** Begin a Grand Prix, a single race or a time trial from the setup screen. */
function startEvent() {
  const k = K();
  const rivals = rivalBuilds(PAINTS[k.p]);
  ev = { mode: k.mode, cls: k.mode === 'tt' ? 'elite' : k.cls, rivals, n: 0, points: new Array(8).fill(0), tracks: k.mode === 'gp' ? TRACKS.map((t) => t.id) : [k.trk], coins: 0 };
  loadRace();
}

async function loadRace() {
  mode = 'loading';
  const t = trackById(ev.tracks[ev.n]);
  $('liq-logo').querySelector('.t2').innerHTML = 'K<i>A</i>RTS';
  loadBar(0, ev.mode === 'gp' ? `Turbo Cup · race ${ev.n + 1} of 3 · ${t.name}` : t.name);
  await liquid.fill(); logo(true);
  music.stop();
  disposeRace();
  show(null); $('hud').classList.add('hidden');
  await frameWait();
  const th = THEMES[t.theme];
  world = new THREE.Scene();
  world.fog = new THREE.Fog(th.fog[0], th.fog[1], th.fog[2]);
  world.add(skyMesh(th));
  world.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]));
  const sun = new THREE.DirectionalLight(th.sun[0], th.sun[1]); sun.position.set(...th.sunDir.map((x) => x * 100)); world.add(sun);
  world.userData.env = trackEnv(th);
  loadBar(0.3);
  await frameWait();
  track = new Track(t, settings.quality);
  track.build(world.userData.env);
  world.add(track.group);
  loadBar(0.7);
  await frameWait();
  // grid: race 1 you start at the back; after that, by the points table (leader in front)
  let grid = null;
  if (ev.mode === 'gp' && ev.n > 0) grid = ev.points.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  race = new Race({
    scene: world, track, env: world.userData.env, hi, cls: ev.cls, mode: ev.mode, player: myBuild(), rivals: ev.rivals, grid,
    on: raceHooks(),
  });
  if (ev.mode === 'tt') { race.player.item = 'nitro3'; race.player.itemN = 3; }
  loadBar(1);
  { const c = document.createElement('canvas'); c.width = c.height = 380; mm = { bg: outline(t, c, 16, 9), bgCanvas: c }; }
  $('h-laps').textContent = track.laps;
  paintItem(); $('h-coinn').textContent = '0'; $('h-coins').classList.remove('max');
  // camera starts the fly-over
  introT = 0; lastPlace = 0; raceTime = 0; finishT = 0;
  camera.fov = 60; camera.updateProjectionMatrix();
  flyover(0);
  await sleep(250);
  logo(false);
  $('hud').classList.remove('hidden');
  for (const id of ['h-item', 'h-coins', 'minimap', 'h-place', 'h-hint']) $(id).classList.add('hidden');
  document.querySelector('.lap').classList.add('hidden');
  $('h-intro').classList.remove('hidden'); $('h-skip').classList.remove('hidden');
  $('h-introname').textContent = t.name;
  $('h-introsub').textContent = ev.mode === 'gp' ? `TURBO CUP · RACE ${ev.n + 1}/3 · ${CLASSES[ev.cls].name.toUpperCase()}` : ev.mode === 'tt' ? 'TIME TRIAL' : `SINGLE RACE · ${CLASSES[ev.cls].name.toUpperCase()}`;
  music.setFast(1); music.play(th.music);
  mode = 'intro';
  await liquid.drain();
}

function disposeRace() {
  if (race) { race.dispose(); race = null; }
  if (track) { track.dispose(); track = null; }
  if (world) { world.userData.env?.dispose(); world.traverse((o) => { if (o.isMesh && o.material?.isShaderMaterial) { o.geometry.dispose(); o.material.dispose(); } }); world = null; }
}

function raceHooks() {
  return {
    count: (n) => { countdown(String(n)); music.beep(false); },
    go: () => {
      countdown('GO!', true); music.beep(true);
      mode = 'race';
      for (const id of ['h-item', 'h-coins', 'minimap', 'h-place']) $(id).classList.remove('hidden');
      if (!isTouch) { $('h-hint').classList.remove('hidden'); $('h-hint').style.opacity = '1'; }
      setTimeout(() => { $('h-hint').style.opacity = '0'; }, 7000);
      $('touch').classList.toggle('hidden', !isTouch);
    },
    box: () => { music.crystal(); $('h-item').classList.add('roll'); },
    gotItem: (it) => { music.gotItem(); paintItem(); const b = $('h-item'); b.classList.remove('roll', 'got'); void b.offsetWidth; b.classList.add('got'); },
    used: (k, it) => {
      if (k.me) { paintItem(); if (it === 'nitro' || it === 'nitro3' || it === 'overdrive') sound.nitro(); else if (it === 'shield' || it === 'coins') music.gotItem(); else sound.play('swish', { gain: 0.6 }); }
      else if (it === 'rocket' && race) { const tg = race.karts.find((o) => o.place === k.place - 1); if (tg && tg.me) pop('Rocket behind you!', '#ff5a4e'); }
    },
    coin: (n) => { music.coin(); $('h-coinn').textContent = race.player.coins; $('h-coins').classList.toggle('max', race.player.coins >= 10); },
    lap: (lap) => {
      if (lap === track.laps) { banner('FINAL LAP!'); music.finalLap(); music.setFast(1.1); }
      else banner(`LAP ${lap}`);
    },
    finish: () => {
      const p = race.player;
      finishT = 0; mode = 'finish';
      $('touch').classList.add('hidden');
      banner(ev.mode === 'tt' ? 'FINISH!' : `${p.place}${ord(p.place)}!`, ev.mode === 'tt' ? fmtT(p.finishT) : 'FINISH');
      music.fanfare(p.place <= 3 || ev.mode === 'tt');
      music.play(p.place <= 3 || ev.mode === 'tt' ? 'win' : 'garage');
    },
    hit: (k, s, hit) => {
      if (!race) return;
      const d = k.pos.distanceTo(race.player.pos);
      if (d < 60) sound.play(s.kind === 'oil' ? 'squeak' : 'crash_small', { gain: Math.max(0.15, 0.8 - d / 80) });
      if (k.me && hit) { shake = 0.8; pop(s.kind === 'oil' ? 'Slipped!' : s.kind === 'rocket' ? 'Rocket hit!' : 'Bonk!', '#ff5a4e'); }
      if (s.owner && s.owner.me && !k.me && hit) pop(`Hit ${k.label}!`, '#6dff8a');
    },
    bump: (rel) => { sound.play('clank', { gain: Math.min(0.6, 0.15 + rel / 25), rate: 1.2 }); },
    event: (k, e) => {
      if (!k.me) return;
      if (e === 'hop') music.hop();
      else if (e.startsWith('mt')) { const lv = +e[2]; pop(['', 'Mini-turbo', 'Super mini-turbo', 'Ultra mini-turbo'][lv], ['', '#4aa8ff', '#ff8a1a', '#ffe066'][lv]); sound.play('swish', { gain: 0.7, rate: 1.1 }); sound.nitro(); }
      else if (e === 'pad') sound.play('whoosh', { gain: 0.6, rate: 1.2 });
      else if (e === 'startboost') { pop('Rocket start!', '#6dff8a'); sound.nitro(); }
      else if (e === 'stall') pop('Too early!', '#ff5a4e');
      else if (e === 'trick') music.trick();
      else if (e === 'trickboost') { pop('Trick!', '#3de0ff'); sound.nitro(); }
      else if (e === 'glide') { sound.play('swish', { gain: 0.9, rate: 0.8 }); pop('Glide!', '#3de0ff'); }
      else if (e === 'land' || e === 'glide-land') sound.thud(4, false);
      else if (e === 'wall') sound.wall(k.wallHit);
      else if (e === 'spun' || e === 'launched') { shake = 0.7; }
      else if (e === 'fell') { pop('Splash!', '#3de0ff'); sound.play('swish', { gain: 0.6, rate: 0.6 }); }
      else if (e === 'coins-lost') { $('h-coinn').textContent = k.coins; $('h-coins').classList.remove('max'); }
      else if (e === 'shield-pop') { pop('Shield saved you', '#3de0ff'); sound.play('pop_a', { gain: 0.6 }); }
    },
  };
}

function countdown(txt, go) {
  const c = $('count'); c.textContent = txt; c.classList.toggle('go', !!go);
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
}
function banner(txt, sub = '') {
  const b = $('banner'); b.innerHTML = txt + (sub ? `<small>${sub}</small>` : '');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function pop(txt, color = '#fff') {
  const el = document.createElement('div'); el.className = 'pop'; el.textContent = txt; el.style.color = color;
  el.style.top = `${(popsN++ % 3) * -30}px`;
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1000);
}
function paintItem() {
  const p = race && race.player, b = $('h-item');
  const it = p ? p.item : null;
  b.querySelectorAll('svg').forEach((s) => s.remove());
  if (it && it !== 'roll') b.insertAdjacentHTML('afterbegin', ICON[it]);
  $('h-itemn').classList.toggle('hidden', !(it === 'nitro3' && p.itemN > 1));
  $('h-itemn').textContent = `x${p ? p.itemN : 0}`;
  if (!it) b.classList.remove('roll');
}

function skipIntro() {
  if (mode !== 'intro' || !race) return;
  mode = 'count';
  $('h-intro').classList.add('hidden'); $('h-skip').classList.add('hidden');
  document.querySelector('.lap').classList.remove('hidden');
  race.startCountdown();
  chase(0, true);
}

/** The fly-over before a race: sweep down the track to the grid. */
function flyover(dt) {
  introT += dt;
  const T = track, N = T.N, u = Math.min(1, introT / 5.2), e = 1 - Math.pow(1 - u, 2);
  const k = T.w(Math.round(N * 0.62 + e * N * 0.36));
  const side = 26 - e * 14;
  const c = T.point(k, side), l = T.point(k + 30, 0);
  camera.position.set(c.x, c.y + 22 - e * 12, c.z);
  camera.lookAt(l.x, l.y, l.z);
  if (introT > 5.2) skipIntro();
}

/** Chase camera behind the kart. */
function chase(dt, snap = false) {
  const k = race.player;
  const want = k.yaw + k.driftAng * 0.4;
  camYaw = snap ? want : camYaw + wrapA(want - camYaw) * (1 - Math.exp(-(k.spinT > 0 ? 2 : 7) * dt));
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const back = (k.glide ? 7.4 : 5.8) + Math.min(1.8, Math.abs(k.v) * 0.035), up = k.glide ? 3.6 : 2.3;
  const tx = k.pos.x - fx * back, tz = k.pos.z - fz * back;
  const L = track.locate(tx, tz, k.hint, {}, 30);
  let ty = k.pos.y + up;
  if (!L.gap) ty = Math.max(ty, L.y + L.ramp + 1.0);
  if (snap) camPos.set(tx, ty, tz);
  else { camPos.x = damp(camPos.x, tx, 12, dt); camPos.z = damp(camPos.z, tz, 12, dt); camPos.y = damp(camPos.y, ty, k.ground ? 8 : 4, dt); }
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.4; camera.position.y += (Math.random() - 0.5) * shake * 0.3; shake = Math.max(0, shake - dt * 2); }
  camLook.set(k.pos.x + fx * 5, k.pos.y + 1.1, k.pos.z + fz * 5);
  camera.lookAt(camLook);
  const tf = 70 + (k.boosting ? 10 : 0) + Math.min(1, Math.abs(k.v) / k.top0) * 4;
  fov = snap ? tf : damp(fov, tf, 4, dt);
  camera.fov = fov; camera.updateProjectionMatrix();
}
/** After the finish: swing round to the front of the kart. */
function finishCam(dt) {
  finishT += dt;
  const k = race.player, a = k.yaw + Math.PI * 0.85 - finishT * 0.25;
  const tx = k.pos.x + Math.sin(a) * 7, tz = k.pos.z + Math.cos(a) * 7;
  camPos.x = damp(camPos.x, tx, 3, dt); camPos.z = damp(camPos.z, tz, 3, dt); camPos.y = damp(camPos.y, k.pos.y + 2.2, 3, dt);
  camera.position.copy(camPos); camera.lookAt(k.pos.x, k.pos.y + 0.8, k.pos.z);
  fov = damp(fov, 55, 2, dt); camera.fov = fov; camera.updateProjectionMatrix();
  if (finishT > 3.6 && mode === 'finish') showResults();
}

function hud(dt) {
  const p = race.player;
  if (race.state === 'race' && !p.finished) raceTime = race.t;
  $('h-time').textContent = fmtT(p.finished ? p.finishT : raceTime);
  $('h-lap').textContent = Math.min(track.laps, p.lap);
  if (p.place !== lastPlace) {
    const el = $('h-place');
    el.innerHTML = `${p.place}<sup>${ord(p.place)}</sup>`;
    el.className = `place${p.place <= 3 ? ' p' + p.place : ''}`;
    if (lastPlace) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 200); }
    lastPlace = p.place;
  }
  $('h-place').classList.toggle('hidden', ev.mode === 'tt' || mode === 'count');
  // item roulette: flick through the icons
  if (p.item === 'roll') {
    const b = $('h-item'), i = Math.floor(performance.now() / 70) % ROLL.length;
    if (b.dataset.r != i) { b.dataset.r = i; b.querySelectorAll('svg').forEach((s) => s.remove()); b.insertAdjacentHTML('afterbegin', ICON[ROLL[i]]); music.tickRoll(); }
  }
  // drift charge meter
  const lv = p.drift ? p.driftLevel : 0;
  $('h-mt').classList.toggle('on', !!p.drift);
  if (p.drift) [...$('h-mt').children].forEach((el, i) => { el.className = p.charge >= DRIFT_LV[i] ? `l${lv}` : ''; });
  if (lv > lastLv) music.charge(lv);
  lastLv = lv;
  // rocket warning
  const inbound = race.items.shots.some((s) => s.kind === 'rocket' && s.target === p && Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 80);
  $('h-warn').classList.toggle('hidden', !inbound);
  // mini-map at 15 fps
  mmT += dt;
  if (mmT > 0.066) { mmT = 0; drawMinimap(); }
}
function drawMinimap() {
  const cv = $('minimap'), x = cv.getContext('2d');
  x.clearRect(0, 0, 380, 380);
  x.drawImage(mm.bgCanvas, 0, 0);
  for (const s of race.items.shots) {
    if (s.kind === 'oil') continue;
    const [a, b] = mm.bg.map(s.x, s.z); x.fillStyle = s.kind === 'rocket' ? '#ff5a4e' : '#22e08a'; x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill();
  }
  for (const k of [...race.karts].reverse()) {
    const [a, b] = mm.bg.map(k.pos.x, k.pos.z);
    x.beginPath(); x.arc(a, b, k.me ? 11 : 8, 0, 7);
    x.fillStyle = `#${k.paint.toString(16).padStart(6, '0')}`; x.fill();
    x.lineWidth = k.me ? 4 : 2; x.strokeStyle = k.me ? '#fff' : 'rgba(0,0,0,0.7)'; x.stroke();
  }
}

// ---------------------------------------------------------------- results, points, coins, unlocks
function showResults() {
  mode = 'results';
  const rs = race.results(), p = race.player, k = K();
  const coinsBefore = k.c, unlBefore = unlockedN(k.c);
  let got = p.got, title = 'Race results', sub = trackById(ev.tracks[ev.n]).name, earn = [];
  const myPlace = rs.findIndex((r) => r.me) + 1;
  let gpDone = false, trophy = 0;
  if (ev.mode === 'gp') {
    rs.forEach((r, i) => { ev.points[race.karts.indexOf(r.k)] += POINTS[i] || 0; });
    sub = `Turbo Cup · race ${ev.n + 1} of 3 · ${sub}`;
    gpDone = ev.n === ev.tracks.length - 1;
  }
  if (ev.mode === 'tt') {
    const ms = Math.round(p.finishT * 1000), best = k.tt[ev.tracks[0]];
    title = 'Time trial';
    if (!best || ms < best) { k.tt[ev.tracks[0]] = ms; earn.push(`<span class="pill new">New best ${fmtT(p.finishT)}</span>`); }
    else earn.push(`<span class="pill">Best ${fmtT(best / 1000)}</span>`);
  }
  let table = rs.map((r, i) => {
    const ki = race.karts.indexOf(r.k);
    const pts = ev.mode === 'gp' ? `<td class="pts"><small>+${POINTS[i] || 0}</small>${ev.points[ki]}</td>` : '';
    return `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:#${r.k.paint.toString(16).padStart(6, '0')}"></span>${r.label}</td><td class="t">${r.done ? '' : '~'}${fmtT(r.time)}</td>${pts}</tr>`;
  }).join('');
  if (gpDone) {
    const order = ev.points.map((pt, i) => [pt, i]).sort((a, b) => b[0] - a[0] || (a[1] === 0 ? -1 : 1));
    const mine = order.findIndex(([, i]) => i === 0) + 1;
    trophy = mine <= 3 ? mine : 0;
    title = trophy ? `${mine}${ord(mine)} place trophy!` : `Turbo Cup · ${mine}${ord(mine)} place`;
    sub = `Turbo Cup · ${CLASSES[ev.cls].name} · final points`;
    table = order.map(([pt, i], j) => { const kk = race.karts[i]; return `<tr class="${kk.me ? 'me' : ''}"><td>${j + 1}</td><td><span class="dot" style="background:#${kk.paint.toString(16).padStart(6, '0')}"></span>${kk.label}</td><td class="pts">${pt}</td></tr>`; }).join('');
    if (trophy) {
      const bonus = [0, 30, 20, 10][trophy]; got += bonus; earn.push(`<span class="pill new">Trophy bonus +${bonus} coins</span>`);
      if (!k.gp[ev.cls] || trophy < k.gp[ev.cls]) k.gp[ev.cls] = trophy;
    }
  }
  k.c += got; ev.coins += got;
  earn.unshift(`<span class="pill"><span class="coin"></span>+${got} coins · ${k.c} total</span>`);
  const unlAfter = unlockedN(k.c);
  for (let i = unlBefore; i < unlAfter; i++) { const id = UNLOCK_ORDER[i]; if (!k.nw.includes(id)) k.nw.push(id); earn.push(`<span class="pill new">New part: ${partById(id).name}</span>`); }
  if (unlAfter > unlBefore) setTimeout(() => music.unlock(), 600);
  void coinsBefore;
  persist();
  $('r-title').textContent = title; $('r-sub').textContent = sub;
  $('r-table').innerHTML = table; $('r-earn').innerHTML = earn.join('');
  $('r-trophy').classList.toggle('hidden', !trophy); $('r-trophy').innerHTML = trophy ? trophySvg(trophy) : '';
  const foot = $('r-foot'); foot.innerHTML = '';
  const btn = (txt, primary, fn) => { const b = document.createElement('button'); b.className = `btn${primary ? ' primary' : ''}`; b.textContent = txt; b.onclick = fn; foot.appendChild(b); };
  if (ev.mode === 'gp' && !gpDone) { btn('Garage', false, toGarage); btn(`Next race ›`, true, () => { ev.n++; loadRace(); }); }
  else if (ev.mode === 'gp') { btn('Garage', false, toGarage); btn('Race the cup again', true, () => { startEvent(); }); }
  else if (ev.mode === 'tt') { btn('Garage', false, toGarage); btn('Try again', true, () => loadRace()); }
  else { btn('Garage', false, toGarage); btn('Race again', true, () => { ev.rivals = rivalBuilds(PAINTS[k.p]); loadRace(); }); }
  show('results');
  $('hud').classList.add('hidden');
  if (trophy || (ev.mode !== 'gp' && myPlace === 1 && ev.mode !== 'tt')) confetti(trophy || 1);
}

function confetti(place) {
  const cv = $('confetti'); cv.classList.remove('hidden');
  cv.width = innerWidth; cv.height = innerHeight;
  const x = cv.getContext('2d'), cols = place === 1 ? ['#ffe066', '#ffc21a', '#fff', '#3de0ff', '#6dff8a'] : ['#fff', '#3de0ff', '#ffc21a', '#6dff8a'];
  const ps = Array.from({ length: 160 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.6, vx: (Math.random() - 0.5) * 80, vy: 80 + Math.random() * 160, r: Math.random() * 6, vr: (Math.random() - 0.5) * 10, c: cols[Math.floor(Math.random() * cols.length)], w: 6 + Math.random() * 6 }));
  let t0 = performance.now();
  const step = (now) => {
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    x.clearRect(0, 0, cv.width, cv.height);
    let alive = 0;
    for (const p of ps) { p.x += p.vx * dt + Math.sin(now / 300 + p.r) * 0.6; p.y += p.vy * dt; p.r += p.vr * dt; if (p.y < cv.height + 20) alive++; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -3, p.w, 6); x.restore(); }
    if (alive && mode === 'results') requestAnimationFrame(step); else { x.clearRect(0, 0, cv.width, cv.height); cv.classList.add('hidden'); }
  };
  requestAnimationFrame(step);
}

async function toGarage() {
  mode = 'loading';
  loadBar(1, 'Back to the garage');
  await liquid.fill(); logo(true);
  disposeRace(); ev = null;
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  enterGarage();
  await sleep(200); logo(false);
  await liquid.drain();
}

function enterGarage() {
  mode = 'garage'; show('garage');
  fixKart(); setPreview(); paintGarage(); placeGarageCam();
  music.setFast(1); music.play('garage');
}

// ---------------------------------------------------------------- pause
function pause(on) {
  if (!race) return;
  if (on) { pause.was = mode; mode = 'pause'; show('pause'); $('p-musicv').textContent = music.on ? 'on' : 'off'; }
  else { mode = pause.was || 'race'; show(null); }
}
$('p-resume').onclick = () => pause(false);
$('p-restart').onclick = () => { show(null); loadRace(); };
$('p-quit').onclick = () => { show(null); toGarage(); };
$('p-music').onclick = () => toggleMusic();
function toggleMusic() { music.setOn(!music.on); K().m = music.on ? 1 : 0; persist(); $('p-musicv').textContent = music.on ? 'on' : 'off'; }

// ---------------------------------------------------------------- back to Close Call (through the water)
async function leave() {
  mode = 'loading';
  $('liq-logo').querySelector('.t2').innerHTML = 'CLOSE <i>CALL</i>';
  loadBar(1, 'Back to the highway');
  music.stop();
  await liquid.fill(); logo(true);
  markLiquid();
  location.href = '../';
}

// ---------------------------------------------------------------- account chip
account.on((st) => {
  const el = $('w-acct'), u = st.user;
  el.classList.toggle('in', !!u);
  $('w-acct-name').textContent = u ? u.username : 'Not signed in';
  $('w-acct-role').classList.toggle('hidden', !st.owner);
  el.title = u ? 'Your coins and parts save to your Free Period account' : 'Sign in from the Close Call menu to save to your account';
  if (mode === 'garage') paintGarage();
});
$('w-acct').onclick = () => { if (!account.user) leave(); };

// ---------------------------------------------------------------- loop
let last = performance.now(), time = 0;
const test = { fast: 1 }; // headless checks run races faster
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  time += dt;
  fpsAvg = fpsAvg * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
  if (race && world && (mode === 'intro' || mode === 'count' || mode === 'race' || mode === 'finish' || mode === 'results' || mode === 'pause')) {
    const inp = mode === 'race' || mode === 'count' ? readInput() : { gas: false, brake: false, steer: 0, drift: false, item: false };
    if (mode !== 'pause') for (let i = 0; i < test.fast; i++) race.update(dt, inp, time + i * dt);
    if (mode === 'intro') flyover(dt);
    else if (mode === 'finish' || mode === 'results') finishCam(dt);
    else if (mode !== 'pause') chase(dt);
    if (mode !== 'intro' && mode !== 'results') hud(dt);
    world.children[0].position.copy(camera.position);
    const p = race.player;
    sound.engine(2400 + Math.min(1, Math.abs(p.v) / p.top0) * 4800 + (p.drift ? 400 : 0), race.state === 'race' && (p.input.gas || p.boosting) ? 1 : 0, Math.abs(p.v), mode !== 'pause' && mode !== 'results', p.boosting);
    sound.tires(p.drift && p.ground ? 0.35 : p.offroad && Math.abs(p.v) > 8 ? 0.15 : 0);
    draw(world);
    adapt(dt);
  } else if (mode === 'garage' || mode === 'setup' || mode === 'boot' || (mode === 'loading' && !race)) {
    if (dragX == null) { spinV = damp(spinV, 0.35, 1.5, dt); spin += spinV * dt; }
    turntable.rotation.y = spin;
    sound.engine(900, 0, 0, false, false);
    draw(garage);
  } else if (world) draw(world);
}

// ---------------------------------------------------------------- start
(async () => {
  loadBar(0.05, 'Filling the tank…');
  await frameWait();
  await makeThumbs();
  loadBar(0.85, 'Polishing the karts…');
  fillGarage(); setPreview(); placeGarageCam();
  initAccount({ reload: () => { save = readSave(); fixKart(); if (mode === 'garage') { setPreview(); paintGarage(); } }, pullOk: () => mode === 'garage' || mode === 'setup' });
  requestAnimationFrame(frame);
  loadBar(1, 'Ready!');
  await sleep(450);
  mode = 'garage'; show('garage');
  logo(false);
  music.play('garage');
  await liquid.drain();
})();

window.__kart = { test, get race() { return race; }, get mode() { return mode; }, get track() { return track; }, save: () => save, startEvent, skipIntro, liquid, music, K };
