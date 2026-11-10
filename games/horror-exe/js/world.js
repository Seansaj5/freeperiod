// The map in 3D: five zones, each built in two looks (the bright normal world and the corrupted one).
// Only one world is drawn at a time; setTheme(0 | 1) swaps colors, sky, light and world-only objects.
import * as THREE from 'three';
import { terrainH, supportAt, WATER_Y, GOO_Y, LAVA_Y, MAP, V, L, S as HOLLOW, HALF, ICE, CAVE, GOO, LAVA, TEMPLE, FROST, OBJ, zoneAt } from '../shared/map.js';
import { rng, smooth, lerp } from '../shared/util.js';
import { glowTex } from './rig.js';

const SUN_N = new THREE.Vector3(-0.35, 0.72, -0.6).normalize();
const SUN_C = new THREE.Vector3(-0.42, 0.3, -0.86).normalize();
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
const planks = (base, line) => tex(128, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 21) { g.fillStyle = line; g.fillRect(x, 0, 3, h); g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`; g.fillRect(x + 3, 0, 18, h); }
}, [1, 1]);
const stone = (base, k = 0.45) => tex(128, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; g.fillRect(x + 2, y + 2, 60, 28);
    g.strokeStyle = `rgba(0,0,0,${k})`; g.lineWidth = 3; g.strokeRect(x + 1, y + 1, 62, 30);
  }
}, [1, 1]);
const metal = (base, stripe) => tex(128, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 2, 0, 2, h); }
  for (let y = 8; y < h; y += 40) for (let x = 8; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  if (stripe) { for (let x = -h; x < w; x += 24) { g.fillStyle = stripe; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 12, h); g.lineTo(x + 12 + 14, h - 14); g.lineTo(x + 14, h - 14); g.fill(); } }
}, [1, 1]);
const marble = () => tex(128, 128, (g, w, h) => {
  g.fillStyle = '#efe6d6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(150,130,110,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) { g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y); while (y < h) { x += (Math.random() - 0.5) * 18; y += 10; g.lineTo(x, y); } g.stroke(); }
  for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x, 0, 3, h); }
}, [1, 2]);

/** Writing on a sign: friendly in the normal world, dripping in the corrupted one. */
function signTex(text, creepy) {
  return tex(256, 160, (g, w, h) => {
    g.fillStyle = creepy ? '#4b2a18' : '#8a5a32'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.1})`; g.fillRect(0, y, w, 3); }
    g.font = '400 36px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((ln, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * 44;
      g.fillStyle = creepy ? '#a00010' : '#fff4c8';
      g.fillText(ln, w / 2, y);
      if (creepy) { const m = g.measureText(ln).width; for (let k = 0; k < 4; k++) { const x = w / 2 - m / 2 + Math.random() * m; g.fillRect(x, y + 12, 3, 8 + Math.random() * 22); } }
    });
  });
}
const FRIENDLY = ['WELCOME\nHOME :)', 'HAVE A\nNICE DAY', "DON'T GO\nINSIDE", 'MESA\nLOOKOUT', 'LAKE\nVIEW', 'PICNIC\nAREA', 'HILLTOP\nTRAIL', 'STAY\nAWHILE'];

export class World {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.hi = quality === 'high';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x160204);
    this.scene.fog = new THREE.FogExp2(0x40100f, 0.006);
    this.time = 0;
    this.theme = -1;
    this.r = rng(99);
    this.only = []; // [object, world] pairs: shown only in that world
    this.swaps = []; // functions(w) that restyle something per world
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildLiquids();
    this.buildVillage();
    this.buildCorridor();
    this.buildBridgeAndCliff();
    this.buildPlatforms();
    this.buildSprings();
    this.buildBoosts();
    this.buildLoops();
    this.buildNature();
    this.buildTotems();
    this.buildSigns();
    this.buildFrost();
    this.buildToxic();
    this.buildNeon();
    this.buildEmber();
    this.buildPortals();
    this.buildGates();
    this.buildShards();
    this.buildTasks();
    this.buildGlitch();
    this.buildAsh();
    for (const w of this.windows) w.userData.base = w.material.color.getHex();
    this.swaps.push((wd) => { for (const w of this.windows) w.material.color.setHex(wd ? 0xff3a1a : w.userData.base); });
    this.setTheme(1);
  }

  add(o, w) { this.scene.add(o); if (w === 0 || w === 1) this.only.push([o, w]); return o; }
  mesh(geo, mat, x, y, z, ry = 0, w) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; return this.add(m, w); }
  boxMesh(b, mat, w) { return this.mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), mat, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2, 0, w); }

  // ---------------------------------------------------------------- the two looks
  setTheme(w) {
    if (this.theme === w) return;
    this.theme = w;
    const c = w === 1;
    this.sky.material.uniforms.corrupt.value = c ? 1 : 0;
    this.sky.material.uniforms.sunDir.value.copy(c ? SUN_C : SUN_N);
    this.scene.fog.color.setHex(c ? 0x40100f : 0xb9dcff);
    this.scene.fog.density = c ? 0.0058 : 0.0026;
    this.scene.background.setHex(c ? 0x160204 : 0x9fd0ff);
    this.hemi.color.setHex(c ? 0xe07a60 : 0xd8f0ff); this.hemi.groundColor.setHex(c ? 0x3a1410 : 0x5f7f3f); this.hemi.intensity = c ? 1.8 : 1.35;
    this.amb.color.setHex(c ? 0x8a3a3a : 0xffffff); this.amb.intensity = c ? 0.6 : 0.35;
    this.sun.color.setHex(c ? 0xff9a70 : 0xfff2dc); this.sun.intensity = c ? 2.3 : 2.7;
    this.sunDir = c ? SUN_C : SUN_N;
    const col = this.terrain.geometry.attributes.color;
    col.array.set(c ? this.colC : this.colN); col.needsUpdate = true;
    for (const [o, ow] of this.only) o.visible = ow === w;
    for (const f of this.swaps) f(w);
  }

  // ---------------------------------------------------------------- sky
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { time: { value: 0 }, sunDir: { value: SUN_C.clone() }, corrupt: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float time, corrupt; uniform vec3 sunDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          float a = acos(clamp(dot(d, sunDir), -1.0, 1.0));
          vec2 uv = d.xz / (h + 0.25) * 1.6 + vec2(time * 0.006, time * 0.002);
          float n = fbm(uv);
          // normal world: blue sky, white sun, fluffy clouds
          vec3 nTop = vec3(0.12, 0.38, 0.85), nHor = vec3(0.62, 0.82, 1.0), nLow = vec3(0.45, 0.6, 0.7);
          vec3 nc = h > 0.0 ? mix(nHor, nTop, smoothstep(0.0, 0.6, h)) : mix(nHor, nLow, smoothstep(0.0, -0.1, h));
          nc += vec3(1.0, 0.9, 0.7) * (exp(-a * 9.0) * 0.6 + smoothstep(0.05, 0.035, a) * 2.5);
          nc = mix(nc, vec3(1.0), smoothstep(0.52, 0.75, n) * smoothstep(0.02, 0.2, h) * 0.85);
          // corrupted world: red sky, black sun with a burning ring
          vec3 top = vec3(0.05, 0.0, 0.006), mid = vec3(0.38, 0.02, 0.012), hor = vec3(0.72, 0.1, 0.03), low = vec3(0.04, 0.0, 0.0);
          vec3 cc = h > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.12, 0.75, h)), smoothstep(0.0, 0.14, h)) : mix(hor, low, smoothstep(0.0, -0.08, h));
          cc += vec3(1.0, 0.18, 0.05) * (exp(-a * 7.0) * 0.9 + exp(-a * 26.0) * 1.6);
          cc = mix(cc, vec3(0.0), smoothstep(0.072, 0.066, a));
          cc += vec3(1.0, 0.35, 0.15) * smoothstep(0.012, 0.0, abs(a - 0.071)) * 2.0;
          cc = mix(cc, vec3(0.03, 0.0, 0.0), smoothstep(0.5, 0.82, n) * smoothstep(0.02, 0.25, h) * 0.8);
          gl_FragColor = vec4(mix(nc, cc, corrupt), 1.0);
        }`,
    });
    this.sky = this.add(new THREE.Mesh(new THREE.SphereGeometry(1100, 40, 20), mat));
    this.sky.renderOrder = -10;
  }

  buildLights() {
    this.hemi = this.add(new THREE.HemisphereLight(0xe07a60, 0x3a1410, 1.8));
    this.amb = this.add(new THREE.AmbientLight(0x8a3a3a, 0.6));
    const sun = (this.sun = new THREE.DirectionalLight(0xff9a70, 2.3));
    this.sunDir = SUN_C;
    sun.position.copy(SUN_C).multiplyScalar(100);
    if (this.hi) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera; c.left = c.bottom = -50; c.right = c.top = 50; c.near = 10; c.far = 300;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    }
    this.add(sun); this.add(sun.target);
  }

  // ---------------------------------------------------------------- ground (colors per zone, per world)
  buildTerrain() {
    const size = HALF * 2 + 120, seg = this.hi ? 290 : 220;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    this.colN = new Float32Array(pos.count * 3); this.colC = new Float32Array(pos.count * 3);
    const C = (h) => new THREE.Color(h);
    const P = {
      grassN: C('#4fc436'), grass2N: C('#38a12b'), grassC: C('#3f7a26'), grass2C: C('#2c5e20'),
      dirtA_N: C('#d17a2c'), dirtB_N: C('#9a5420'), dirtA_C: C('#9a521f'), dirtB_C: C('#5e2c10'),
      deadC: C('#6b5a34'), bloodC: C('#6a1414'), blackC: C('#1a0c0c'), pathN: C('#d8b07a'), pathC: C('#7a5232'),
      mudN: C('#3a5f7a'), mudC: C('#2a0c08'),
      snowN: C('#f4f8ff'), snow2N: C('#d6e8f8'), snowC: C('#8a8592'), snow2C: C('#6a6070'), rockN: C('#8f97a6'), rockC: C('#4a4250'),
      concN: C('#9aa0a8'), conc2N: C('#7f868f'), concC: C('#4f4640'), conc2C: C('#3a322c'), hazN: C('#f2c21a'), hazC: C('#8a6a10'),
      neonN: C('#2a2a5e'), neon2N: C('#ff4fd8'), neon3N: C('#3ae6ff'), neonC: C('#14081e'), neon2C: C('#6a0a4a'), neon3C: C('#0a3a4a'),
      sandN: C('#ead6a8'), sand2N: C('#d9a066'), sandC: C('#4a3026'), sand2C: C('#2e1c16'), crackC: C('#ff3a10'),
      farN: C('#6a9a5a'), farC: C('#3a1a12'),
    };
    const tmpA = new THREE.Color(), tmpB = new THREE.Color(), outN = new THREE.Color(), outC = new THREE.Color(), zx = [new THREE.Color(), new THREE.Color()], zz = [new THREE.Color(), new THREE.Color()];
    const r = rng(5);
    const hillsColor = (x, z, h, slope, n, oN, oC) => {
      if (h < WATER_Y - 0.1) { oN.copy(P.mudN); oC.copy(P.mudC); return; }
      if (slope > 0.7) { const s = Math.floor((h + 40) * 0.95) % 2; oN.copy(s ? P.dirtA_N : P.dirtB_N); oC.copy(s ? P.dirtA_C : P.dirtB_C); return; }
      oN.copy(P.grassN).lerp(P.grass2N, n);
      oC.copy(P.grassC).lerp(P.grass2C, n);
      oC.lerp(P.deadC, smooth(0.55, 0.9, Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.09) * 0.5 + 0.5) * 0.8);
      oC.lerp(P.blackC, 1 - smooth(10, 30, Math.hypot(x - HOLLOW.x, z - HOLLOW.z)));
      oC.lerp(P.bloodC, smooth(0.75, 0.95, Math.sin(x * 0.045 - 2) * Math.sin(z * 0.052 + 1)) * 0.7);
      const dv = Math.hypot(x - V.x, z - V.z);
      if (dv > 8.5 && dv < 11) { oN.lerp(P.pathN, 0.8); oC.lerp(P.pathC, 0.8); }
    };
    const zoneColor = (id, x, z, h, slope, n, oN, oC) => {
      if (id === 'frost') {
        if (slope > 0.75) { oN.copy(P.rockN); oC.copy(P.rockC); return; }
        oN.copy(P.snowN).lerp(P.snow2N, n); oC.copy(P.snowC).lerp(P.snow2C, n);
        oC.lerp(P.bloodC, smooth(0.8, 0.97, Math.sin(x * 0.05) * Math.sin(z * 0.06 + 2)) * 0.6);
      } else if (id === 'toxic') {
        const tile = (Math.floor(x / 6) + Math.floor(z / 6)) % 2 ? 1 : 0;
        oN.copy(tile ? P.concN : P.conc2N); oC.copy(tile ? P.concC : P.conc2C);
        let nearPit = 99; for (const gp of GOO) nearPit = Math.min(nearPit, Math.hypot(x - gp.x, z - gp.z) - gp.r);
        if (nearPit > 0 && nearPit < 2.5) { const s = Math.floor((x + z) / 1.6) % 2; if (s) { oN.copy(P.hazN); oC.copy(P.hazC); } }
        if (h < 0) { oN.multiplyScalar(0.6); oC.multiplyScalar(0.6); }
      } else if (id === 'neon') {
        const gx = Math.abs(((x % 8) + 8) % 8 - 4), gz = Math.abs(((z % 8) + 8) % 8 - 4);
        const line = Math.min(gx, gz) < 0.9;
        oN.copy(P.neonN); oC.copy(P.neonC);
        if (line) { const k = Math.floor(x / 8 + z / 8) % 2; oN.copy(k ? P.neon2N : P.neon3N); oC.copy(k ? P.neon2C : P.neon3C); }
      } else if (id === 'ember') {
        if (slope > 0.7) { oN.copy(P.sand2N); oC.copy(P.sand2C); return; }
        oN.copy(P.sandN).lerp(P.sand2N, n * 0.6); oC.copy(P.sandC).lerp(P.sand2C, n);
        let nearLava = 99; for (const l of LAVA) nearLava = Math.min(nearLava, Math.hypot(x - l.x, z - l.z) - l.r);
        oC.lerp(P.crackC, (1 - smooth(0, 6, nearLava)) * 0.5);
        if (Math.abs(x - TEMPLE.x) < TEMPLE.half && Math.abs(z - TEMPLE.z) < TEMPLE.half) { oN.set('#f2ebde'); oC.set('#5a4a42'); }
      }
    };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = terrainH(x, z);
      pos.setY(i, h);
      const sx = terrainH(x + 0.8, z) - terrainH(x - 0.8, z), sz = terrainH(x, z + 0.8) - terrainH(x, z - 0.8), slope = Math.hypot(sx, sz) / 1.6;
      const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17 - x * 0.05);
      hillsColor(x, z, h, slope, n, outN, outC);
      const e = Math.max(Math.abs(x), Math.abs(z));
      const o = smooth(80, 96, e);
      if (o > 0) {
        zoneColor(x > 0 ? 'toxic' : 'ember', x, z, h, slope, n, zx[0], zx[1]);
        zoneColor(z > 0 ? 'neon' : 'frost', x, z, h, slope, n, zz[0], zz[1]);
        const t = smooth(-12, 12, Math.abs(z) - Math.abs(x));
        tmpA.copy(zx[0]).lerp(zz[0], t); tmpB.copy(zx[1]).lerp(zz[1], t);
        outN.lerp(tmpA, o); outC.lerp(tmpB, o);
      }
      // the hills at the edge of the world: plain rock and grass, whatever zone they border
      const ek = smooth(158, 168, e);
      if (ek > 0) {
        const s = Math.floor((h + 40) * 0.6) % 2;
        tmpA.copy(slope > 0.5 ? (s ? P.dirtA_N : P.dirtB_N) : P.farN); tmpB.copy(slope > 0.5 ? (s ? P.dirtA_C : P.dirtB_C) : P.farC);
        outN.lerp(tmpA, ek); outC.lerp(tmpB, ek);
      }
      const j = 0.92 + r() * 0.16;
      this.colN[i * 3] = outN.r * j; this.colN[i * 3 + 1] = outN.g * j; this.colN[i * 3 + 2] = outN.b * j;
      this.colC[i * 3] = outC.r * j; this.colC[i * 3 + 1] = outC.g * j; this.colC[i * 3 + 2] = outC.b * j;
    }
    g.setAttribute('color', new THREE.BufferAttribute(this.colC.slice(), 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, lam(0xffffff, { vertexColors: true, flatShading: true }));
    m.receiveShadow = true;
    this.terrain = this.add(m);
  }

  // ---------------------------------------------------------------- water, goo, lava, ice
  buildLiquids() {
    const nTex = tex(128, 128, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const a = Math.sin((x / w) * Math.PI * 6) * 0.5 + Math.sin(((x + y) / w) * Math.PI * 4) * 0.3, b = Math.cos((y / h) * Math.PI * 8) * 0.4 + Math.sin(((x - y) / w) * Math.PI * 6) * 0.3;
        const k = (y * w + x) * 4; img.data[k] = 128 + a * 90; img.data[k + 1] = 128 + b * 90; img.data[k + 2] = 255; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, [6, 6]);
    nTex.colorSpace = THREE.NoColorSpace;
    this.waterTex = nTex;
    const water = new THREE.MeshPhongMaterial({ color: 0x3a0207, emissive: 0x120001, specular: 0xff5a40, shininess: 70, normalMap: nTex, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9 });
    this.swaps.push((w) => { water.color.setHex(w ? 0x3a0207 : 0x1f78d8); water.emissive.setHex(w ? 0x120001 : 0x02182e); water.specular.setHex(w ? 0xff5a40 : 0xffffff); });
    const lake = new THREE.Mesh(new THREE.CircleGeometry(L.r + 3, 48), water);
    lake.rotation.x = -Math.PI / 2; lake.position.set(L.x, WATER_Y, L.z); this.add(lake);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(12, 36), water);
    pool.rotation.x = -Math.PI / 2; pool.position.set(HOLLOW.x, WATER_Y, HOLLOW.z); this.add(pool);
    // goo and lava: bubbly scrolling textures that glow
    const blobTex = (bg, spots) => tex(128, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.fillStyle = spots[i % spots.length]; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 0, 7); g.fill(); } }, [3, 3]);
    this.gooTex = blobTex('#4cd42a', ['#9aff5a', '#2a9a1a', '#c8ff8a']);
    this.lavaTex = blobTex('#ff6a10', ['#ffd23a', '#c82a00', '#ff9a2a']);
    const goo = basic(0xffffff, { map: this.gooTex }), lava = basic(0xffffff, { map: this.lavaTex });
    this.swaps.push((w) => { goo.color.setHex(w ? 0x8aa060 : 0xffffff); lava.color.setHex(w ? 0xff6a50 : 0xffffff); });
    for (const p of GOO) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.r + 1.2, 28), goo); m.rotation.x = -Math.PI / 2; m.position.set(p.x, GOO_Y, p.z); this.add(m); }
    for (const p of LAVA) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(p.r + 1.2, 28), lava); m.rotation.x = -Math.PI / 2; m.position.set(p.x, LAVA_Y, p.z); this.add(m);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff6a20, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(p.r * 3, 4, 1); glow.position.set(p.x, LAVA_Y + 1.2, p.z); this.add(glow);
    }
    // frozen lake: shiny ice with cracks
    const iceTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#cfefff'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); } }, [3, 3]);
    const ice = new THREE.MeshPhongMaterial({ color: 0xffffff, map: iceTex, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.92 });
    this.swaps.push((w) => ice.color.setHex(w ? 0x8a8098 : 0xffffff));
    const im = new THREE.Mesh(new THREE.CircleGeometry(ICE.r, 40), ice); im.rotation.x = -Math.PI / 2; im.position.set(ICE.x, ICE.y + 0.03, ICE.z); im.receiveShadow = true; this.add(im);
  }

  // ---------------------------------------------------------------- Dreamy Hills (center)
  buildVillage() {
    const wall = lam(0xffffff, { map: planks('#a07048', '#4a2c18') });
    const roofCols = [0xd8462a, 0x2f66d0, 0xf0b026, 0x3fae3a, 0x9a4ad0, 0xe0602a];
    this.windows = [];
    MAP.props.huts.forEach((h, i) => {
      const g = new THREE.Group(); g.position.set(h.x, h.y, h.z); g.rotation.y = Math.round(h.face / (Math.PI / 2)) * (Math.PI / 2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 5), wall); body.position.y = 1.7; body.castShadow = body.receiveShadow = true; g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.5, 4), lam(roofCols[i % roofCols.length], { flatShading: true }));
      roof.position.y = 4.65; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.1), lam(0x3a1d0c)); door.position.set(0, 1.05, 2.52); g.add(door);
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), basic(0xffd27a)); w.position.set(s * 1.5, 2.1, 2.52); g.add(w); this.windows.push(w); }
      this.add(g);
    });
    const st = lam(0xffffff, { map: stone('#8a8490') });
    this.mesh(new THREE.CylinderGeometry(1.3, 1.4, 1.0, 16), st, 0, V.y + 0.5, 0);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), basic(0x050505)); inner.rotation.x = -Math.PI / 2; inner.position.set(0, V.y + 0.95, 0); this.add(inner);
    for (const s of [-1, 1]) this.mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), lam(0x5a3a22), s * 1.15, V.y + 1.6, 0);
    const wr = this.mesh(new THREE.ConeGeometry(1.7, 0.9, 4), lam(0xb83a26, { flatShading: true }), 0, V.y + 3.0, 0); wr.rotation.y = Math.PI / 4;
    this.lamps = [];
    for (const l of MAP.props.lamps) {
      this.mesh(new THREE.CylinderGeometry(0.1, 0.14, 4.4, 6), lam(0x2a2a30), l.x, l.y + 2.2, l.z);
      this.lamps.push(this.mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), basic(0xffe08a), l.x, l.y + 4.6, l.z));
    }
  }

  buildCorridor() {
    const st = lam(0xffffff, { map: stone('#7a7488') });
    for (const b of MAP.boxes) if (b.kind === 'wall' || (b.kind === 'roof' && b.x1 - b.x0 > 10)) this.boxMesh(b, st);
    for (let x = -5; x <= 11; x += 8) this.lamps.push(this.mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), basic(0xffe08a), x, 5.3, -40));
  }

  buildBridgeAndCliff() {
    const deck = MAP.boxes.find((b) => b.kind === 'deck');
    const dm = this.boxMesh(deck, lam(0xffffff, { map: planks('#8a5a34', '#3a200e') }));
    dm.material.map.rotation = Math.PI / 2; dm.material.map.repeat.set(1, 12);
    const postMat = lam(0x4a2c18);
    for (const p of MAP.props.posts) { this.mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.4, 6), postMat, p.x, -0.8, p.z); this.mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.0, 6), postMat, p.x, 1.2, p.z); }
    const rock = lam(0xffffff, { map: stone('#7a6060'), flatShading: true });
    for (const b of MAP.boxes) if (b.kind === 'cliff') this.boxMesh(b, rock);
    this.fallTex = tex(64, 256, (g, w, h) => {
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${180 + Math.random() * 70},${200 + Math.random() * 55},255,${0.3 + Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 20 + Math.random() * 60); }
    }, [3, 1]);
    const fallMat = basic(0xffffff, { map: this.fallTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    this.swaps.push((w) => fallMat.color.setHex(w ? 0x9a0010 : 0x7fc8ff));
    const fall = this.mesh(new THREE.PlaneGeometry(9, 12), fallMat, 52, 5.4, 65.85, Math.PI);
    fall.castShadow = false;
  }

  buildPlatforms() {
    const top = lam(0x4fc436, { flatShading: true }), dirt = lam(0xd17a2c, { flatShading: true }), dirt2 = lam(0x9a5420, { flatShading: true });
    const card = lam(0xffffff, { map: tex(128, 128, (g, w, h) => { g.fillStyle = '#f8f4ec'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d02040'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#18181e'; g.font = '80px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♠', w / 2, h / 2 + 4); }) });
    for (const p of MAP.props.platforms) {
      const s = p.half * 2, g = new THREE.Group(); g.position.set(p.x, p.top, p.z);
      if (p.kind === 'card') {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(s, 0.4, s), [lam(0xd02040), lam(0xd02040), card, lam(0xd02040), lam(0xd02040), lam(0xd02040)]).translateY(-0.2));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(s * 0.95, 0.6, s * 0.95), lam(0x2a1a4a)).translateY(-0.7));
      } else {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(s + 0.2, 0.45, s + 0.2), top).translateY(-0.22));
        for (let k = 0; k < 3; k++) g.add(new THREE.Mesh(new THREE.CylinderGeometry(p.half * 1.25 * (1 - k * 0.28), p.half * 1.25 * (1 - (k + 1) * 0.28), 1.1, 8), k % 2 ? dirt2 : dirt).translateY(-1.0 - k * 1.1));
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      this.add(g);
    }
  }

  buildSprings() {
    this.springs = MAP.SPRINGS.map((s) => {
      const g = new THREE.Group(); g.position.set(s.x, s.y, s.z);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.3, 16), lam(0x2a2a30)).translateY(0.15));
      const coil = new THREE.Group(); g.add(coil);
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 16), lam(0xd0d4e0)); t.rotation.x = Math.PI / 2; t.position.y = 0.4 + i * 0.16; coil.add(t); }
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 16), lam(0xe8262a)); pad.position.y = 0.9; g.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 20), basic(0xffd23d)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.01; g.add(ring);
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.9, 24), basic(0xffb020, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; g.add(glow);
      this.add(g);
      return { g, coil, pad, ring, kick: 0 };
    });
  }
  kickSpring(i) { const s = this.springs[i]; if (s) s.kick = 1; }

  buildBoosts() {
    const arrow = tex(64, 96, (g, w, h) => {
      g.fillStyle = 'rgba(20,20,30,0.9)'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 2; k++) { g.fillStyle = k ? '#ffd23d' : '#ff6a1a'; g.beginPath(); const y = 18 + k * 34; g.moveTo(w / 2, y); g.lineTo(w - 8, y + 26); g.lineTo(w - 22, y + 26); g.lineTo(w / 2, y + 12); g.lineTo(22, y + 26); g.lineTo(8, y + 26); g.fill(); }
    });
    this.boostMat = basic(0xffffff, { map: arrow, transparent: true });
    for (const b of MAP.BOOSTS) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.2), this.boostMat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI - b.a; m.position.set(b.x, terrainH(b.x, b.z) + 0.06, b.z);
      this.add(m);
    }
  }

  buildLoops() {
    const bandTex = tex(256, 32, (g, w, h) => { for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? '#c8601c' : '#f0a030'; g.fillRect(x, 0, 32, h); } g.fillStyle = '#ffe85a'; g.fillRect(0, h / 2 - 2, w, 4); }, [24, 1]);
    const mat = lam(0xffffff, { map: bandTex });
    this.swaps.push((w) => mat.color.setHex(w ? 0x8a3a3a : 0xffffff));
    for (const l of MAP.props.loops) {
      const y = terrainH(l.x, l.z);
      const m = this.mesh(new THREE.TorusGeometry(6.5, 0.75, 10, 72), mat, l.x, y + 6.0, l.z, l.a);
      m.receiveShadow = false;
    }
  }

  // ---------------------------------------------------------------- trees, rocks, flowers, grass
  buildNature() {
    const P = MAP.props, dummy = new THREE.Object3D(), color = new THREE.Color();
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.42, 1, 7, 4); trunkGeo.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, lam(0xffffff, { map: tex(32, 64, (g, w, h) => { for (let y = 0; y < h; y += 8) { g.fillStyle = (y / 8) % 2 ? '#8a5a34' : '#6a4224'; g.fillRect(0, y, w, 8); } }, [1, 6]) }), Math.max(1, P.palms.length));
    const leafGeo = new THREE.PlaneGeometry(0.9, 3.4, 1, 6); leafGeo.translate(0, 1.7, 0); leafGeo.rotateX(-Math.PI / 2);
    { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) { const zz = -p.getZ(i); p.setY(i, -zz * zz * 0.11); p.setX(i, p.getX(i) * (1 - zz / 4.2)); } leafGeo.computeVertexNormals(); }
    const leaves = new THREE.InstancedMesh(leafGeo, lam(0xffffff, { side: THREE.DoubleSide }), Math.max(1, P.palms.length * 7));
    const leafN = [], leafC = [];
    let li = 0;
    P.palms.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.2, p.z); dummy.rotation.set(p.lean, p.ry, 0); dummy.scale.set(1, p.h, 1); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      const top = new THREE.Vector3(0, p.h, 0).applyEuler(new THREE.Euler(p.lean, p.ry, 0)).add(new THREE.Vector3(p.x, p.y - 0.2, p.z));
      for (let k = 0; k < 7; k++) {
        dummy.position.copy(top); dummy.rotation.set(0, (k / 7) * Math.PI * 2 + p.ry, 0, 'YXZ'); dummy.rotateX(p.dead ? 0.6 : 0.15); dummy.scale.setScalar(1); dummy.updateMatrix();
        leaves.setMatrixAt(li, dummy.matrix);
        leafN.push(...color.set(k % 2 ? '#3aa02c' : '#52c23a').toArray()); leafC.push(...color.set(p.dead ? '#6a4a26' : k % 2 ? '#2f6a26' : '#3e7a30').toArray());
        leaves.setColorAt(li, color);
        li++;
      }
    });
    this.swaps.push((w) => { if (!leaves.instanceColor) return; leaves.instanceColor.array.set(w ? leafC : leafN); leaves.instanceColor.needsUpdate = true; });
    trunks.castShadow = leaves.castShadow = true;
    this.add(trunks); this.add(leaves);
    // snowy pines (Frostbite Peak): cones with white caps
    const pineParts = [];
    const cone = (r0, h, y, c) => { const g = new THREE.ConeGeometry(r0, h, 7).toNonIndexed(); g.translate(0, y, 0); const col = new Float32Array(g.attributes.position.count * 3); const cc = new THREE.Color(c); for (let i = 0; i < col.length; i += 3) { col[i] = cc.r; col[i + 1] = cc.g; col[i + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); pineParts.push(g); };
    cone(0.3, 1.2, 0.6, '#5a3a22'); cone(1.6, 2.6, 2.0, '#1f6a3a'); cone(1.25, 2.2, 3.3, '#257a42'); cone(0.9, 1.8, 4.5, '#2a8a4a'); cone(0.5, 0.8, 5.3, '#ffffff'); cone(1.0, 0.5, 3.15, '#f4f8ff');
    const pines = new THREE.InstancedMesh(mergeGeos(pineParts), lam(0xffffff, { vertexColors: true, flatShading: true }), Math.max(1, P.pines.length));
    P.pines.forEach((t, i) => { dummy.position.set(t.x, t.y - 0.1, t.z); dummy.rotation.set(0, t.ry, 0); dummy.scale.setScalar(t.h / 6); dummy.updateMatrix(); pines.setMatrixAt(i, dummy.matrix); });
    pines.castShadow = true; this.add(pines);
    this.swaps.push((w) => pines.material.color.setHex(w ? 0x6a5a6a : 0xffffff));
    // dead trees: only in the corrupted world (in the normal world they are leafy round trees)
    const parts = [];
    const cyl = (r0, r1, h, x, y, z, rx, rz) => { const g = new THREE.CylinderGeometry(r0, r1, h, 6); g.translate(0, h / 2, 0); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); parts.push(g.toNonIndexed()); };
    cyl(0.18, 0.4, 1, 0, 0, 0, 0, 0); cyl(0.05, 0.12, 0.45, 0, 0.55, 0, 0.2, 0.9); cyl(0.05, 0.12, 0.4, 0, 0.7, 0, -0.3, -0.8); cyl(0.04, 0.1, 0.35, 0, 0.82, 0, 0.9, 0.2);
    const trees = new THREE.InstancedMesh(mergeGeos(parts), lam(0x2e2422, { flatShading: true }), Math.max(1, P.deadTrees.length));
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), lam(0x46b030, { flatShading: true }), Math.max(1, P.deadTrees.length));
    const trunk2 = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 7).translate(0, 0.5, 0), lam(0x7a4a2a), Math.max(1, P.deadTrees.length));
    P.deadTrees.forEach((t, i) => {
      dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(0, t.ry, 0); dummy.scale.set(t.h * 0.75, t.h, t.h * 0.75); dummy.updateMatrix(); trees.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(1, t.h * 0.7, 1); dummy.updateMatrix(); trunk2.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.y + t.h * 0.75, t.z); dummy.scale.set(t.h * 0.42, t.h * 0.36, t.h * 0.42); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
    });
    trees.castShadow = crowns.castShadow = trunk2.castShadow = true;
    this.add(trees, 1); this.add(crowns, 0); this.add(trunk2, 0);
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lam(0x8a7c84, { flatShading: true }), Math.max(1, P.rocks.length));
    P.rocks.forEach((r, i) => { dummy.position.set(r.x, r.y + r.h * 0.35, r.z); dummy.rotation.set(0.3, r.ry, 0.2); dummy.scale.set(r.r, r.h * 0.75, r.r * 0.9); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix); });
    rocks.castShadow = rocks.receiveShadow = true; this.add(rocks);
    // ruin columns scattered in Ember Ruins
    const colMat = lam(0xffffff, { map: marble() });
    this.swaps.push((w) => colMat.color.setHex(w ? 0x6a5a52 : 0xffffff));
    for (const c of P.columns) {
      const m = this.mesh(new THREE.CylinderGeometry(0.75, 0.85, c.h, 12), colMat, c.x, c.y + c.h / 2 - 0.2, c.z, c.ry);
      if (c.broken) m.rotation.z = 0.06; else this.mesh(new THREE.BoxGeometry(2, 0.5, 2), colMat, c.x, c.y + c.h, c.z, c.ry);
    }
    // sunflowers: cheerful in the normal world; drooping (and some staring back) in the corrupted one
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 1, 5).translate(0, 0.5, 0), lam(0x2f8a22), Math.max(1, P.flowers.length));
    const petals = (dark) => tex(128, 128, (g) => {
      for (let i = 0; i < 14; i++) { g.save(); g.translate(64, 64); g.rotate((i / 14) * Math.PI * 2); g.fillStyle = dark ? (i % 2 ? '#c8961a' : '#a87010') : i % 2 ? '#ffd21a' : '#ffb40f'; g.beginPath(); g.ellipse(0, -40, 10, 24, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.fillStyle = dark ? '#2a1008' : '#6a3414'; g.beginPath(); g.arc(64, 64, 26, 0, Math.PI * 2); g.fill();
      if (dark === 2) { g.fillStyle = '#000'; g.beginPath(); g.ellipse(54, 60, 7, 9, 0, 0, 7); g.ellipse(74, 60, 7, 9, 0, 0, 7); g.fill(); g.fillStyle = '#ff2020'; g.beginPath(); g.arc(54, 61, 2.5, 0, 7); g.arc(74, 61, 2.5, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(52, 76); g.quadraticCurveTo(64, 84, 76, 76); g.stroke(); }
      if (!dark) { g.fillStyle = '#2a1408'; g.beginPath(); g.arc(56, 60, 3, 0, 7); g.arc(72, 60, 3, 0, 7); g.fill(); g.strokeStyle = '#2a1408'; g.lineWidth = 3; g.beginPath(); g.arc(64, 66, 9, 0.2, Math.PI - 0.2); g.stroke(); }
    });
    const headGeo = new THREE.PlaneGeometry(0.9, 0.9);
    const mk = (t, n) => new THREE.InstancedMesh(headGeo, lam(0xffffff, { map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), Math.max(1, n));
    const happy = mk(petals(0), P.flowers.length), droop = mk(petals(1), P.flowers.length), eyes = mk(petals(2), P.flowers.length);
    let hi = 0, di = 0, ei = 0;
    P.flowers.forEach((f, i) => {
      dummy.position.set(f.x, f.y - 0.05, f.z); dummy.rotation.set(0, f.ry, 0); dummy.scale.set(1, f.h, 1); dummy.updateMatrix(); stems.setMatrixAt(i, dummy.matrix);
      const top = new THREE.Vector3(f.x, f.y - 0.05 + f.h, f.z);
      dummy.position.copy(top); dummy.rotation.set(0.15, f.ry, 0, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix(); happy.setMatrixAt(hi++, dummy.matrix);
      dummy.rotation.set(0.3 + f.droop * 1.0, f.ry, 0, 'YXZ'); dummy.updateMatrix();
      if (f.hue < 0.2) eyes.setMatrixAt(ei++, dummy.matrix); else droop.setMatrixAt(di++, dummy.matrix);
    });
    happy.count = hi; droop.count = di; eyes.count = ei;
    this.add(stems); this.add(happy, 0); this.add(droop, 1); this.add(eyes, 1);
    // grass tufts
    const tuftTex = tex(64, 64, (g) => { g.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { const x = 6 + i * 6.5; g.beginPath(); g.moveTo(x - 3, 64); g.lineTo(x + (Math.random() - 0.5) * 14, 6 + Math.random() * 22); g.lineTo(x + 3, 64); g.fill(); } });
    const tg = new THREE.PlaneGeometry(1, 0.8); tg.translate(0, 0.4, 0);
    const tuftGeo = mergeGeos([tg.toNonIndexed(), tg.clone().rotateY(Math.PI / 2).toNonIndexed()]);
    const n = this.hi ? P.tufts.length : Math.floor(P.tufts.length * 0.55);
    const tufts = new THREE.InstancedMesh(tuftGeo, lam(0xffffff, { map: tuftTex, alphaTest: 0.5, side: THREE.DoubleSide }), Math.max(1, n));
    const tN = [], tC = [];
    for (let i = 0; i < n; i++) {
      const t = P.tufts[i], ember = zoneAt(t.x, t.z).id === 'ember';
      dummy.position.set(t.x, t.y - 0.05, t.z); dummy.rotation.set(0, t.ry, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); tufts.setMatrixAt(i, dummy.matrix);
      tN.push(...color.set(ember ? '#c8b060' : t.dead > 0.8 ? '#8acb3a' : '#46b232').toArray()); tC.push(...color.set(t.dead > 0.7 ? '#7a6436' : t.dead > 0.6 ? '#6a1a14' : ember ? '#4a2a1a' : '#3c7a2a').toArray());
      tufts.setColorAt(i, color);
    }
    this.swaps.push((w) => { if (!tufts.instanceColor) return; tufts.instanceColor.array.set(w ? tC : tN); tufts.instanceColor.needsUpdate = true; });
    this.add(tufts);
  }

  buildTotems() {
    const faceTex = (glow) => tex(64, 64, (g, w, h) => {
      g.fillStyle = '#a0662e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a2a10'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
      g.fillStyle = glow ? '#ff1a1a' : '#1a0a04'; g.fillRect(12, 18, 12, 10); g.fillRect(40, 18, 12, 10);
      g.fillStyle = '#1a0a04'; g.fillRect(16, 40, 32, 8); for (let x = 18; x < 46; x += 6) g.fillRect(x, 48, 3, 5);
    });
    const plain = lam(0xffffff, { map: faceTex(false) }), glow = lam(0xffffff, { map: faceTex(true), emissive: 0x330000 }), side = lam(0x8a5424);
    for (const t of MAP.props.totems) {
      const n = Math.max(2, Math.round(t.h / 1.5));
      for (let k = 0; k < n; k++) {
        const s = 1.25 - (k % 2) * 0.12;
        this.mesh(new THREE.BoxGeometry(s, t.h / n, s), [side, side, side, side, t.shrine || k === n - 1 ? glow : plain, side], t.x, t.y + (k + 0.5) * (t.h / n), t.z, t.ry);
      }
    }
    const altar = MAP.boxes.find((b) => b.kind === 'altar');
    this.boxMesh(altar, lam(0xffffff, { map: stone('#4a3e44') }));
    const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff1a0a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    ember.scale.set(3, 3, 1); ember.position.set(HOLLOW.x, altar.y1 + 0.7, HOLLOW.z); this.add(ember, 1); this.altarGlow = ember;
  }

  buildSigns() {
    MAP.props.signs.forEach((s, i) => {
      const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = s.ry;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), lam(0x4a2c18)).translateY(1.1));
      const nice = signTex(FRIENDLY[i % FRIENDLY.length], false), creepy = signTex(s.text, true);
      const face = lam(0xffffff, { map: creepy });
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.35, 0.12), [lam(0x5a3a20), lam(0x5a3a20), lam(0x5a3a20), lam(0x5a3a20), face, lam(0x5a3a20)]);
      board.position.y = 2.1; board.castShadow = true; g.add(board);
      this.swaps.push((w) => { face.map = w ? creepy : nice; face.needsUpdate = true; board.rotation.z = w ? (i % 2 ? 0.08 : -0.06) : 0; });
      this.add(g);
    });
    // big welcome signs where each zone begins
    for (const [x, z, name] of [[0, -88, 'FROSTBITE PEAK'], [88, 0, 'TOXIC WORKS'], [0, 88, 'NEON JACKPOT'], [-88, 0, 'EMBER RUINS']]) {
      const y = terrainH(x, z), ry = Math.atan2(-x, -z);
      const g = new THREE.Group(); g.position.set(x + Math.cos(ry) * 9, y, z - Math.sin(ry) * 9); g.rotation.y = ry;
      for (const sd of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), lam(0x4a2c18)).translateX(sd * 2.6).translateY(2.5));
      const nice = signTex(name.replace(' ', '\n'), false), creepy = signTex(name.replace(' ', '\n'), true);
      const face = lam(0xffffff, { map: nice });
      const board = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.2), [lam(0x5a3a20), lam(0x5a3a20), lam(0x5a3a20), lam(0x5a3a20), face, face]);
      board.position.y = 4.6; g.add(board);
      this.swaps.push((w) => { face.map = w ? creepy : nice; face.needsUpdate = true; board.rotation.z = w ? 0.12 : 0; });
      this.add(g);
    }
  }

  // ---------------------------------------------------------------- Frostbite Peak
  buildFrost() {
    const iceMat = new THREE.MeshPhongMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.88, shininess: 90, specular: 0xffffff });
    this.swaps.push((w) => iceMat.color.setHex(w ? 0x6a6a88 : 0xbfe8ff));
    for (const b of MAP.boxes) if (b.kind === 'icewall' || b.kind === 'iceroof') this.boxMesh(b, iceMat);
    // icicles at the cave mouth
    for (let x = CAVE.x0 + 1; x < CAVE.x1; x += 1.3) this.mesh(new THREE.ConeGeometry(0.18, 0.9 + Math.random() * 0.6, 5), iceMat, x, CAVE.y + 4.4, CAVE.z1 - 0.3).rotation.x = Math.PI;
    // snowmen: smiling here, staring there
    const snow = lam(0xffffff), coal = lam(0x111111), carrot = lam(0xff7a1a);
    for (const [x, z] of [[-30, -100], [10, -150], [70, -140], [-60, -150], [30, -108]]) {
      const y = terrainH(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(-x, -z);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), snow).translateY(0.8));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.65, 14, 10), snow).translateY(2.0));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), snow).translateY(2.95));
      for (const sd of [-1, 1]) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), coal).translateX(sd * 0.15).translateY(3.05).translateZ(0.4));
      g.add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6), carrot).translateY(2.95).translateZ(0.55).rotateX(Math.PI / 2));
      const eyes = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff1a1a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); eyes.scale.set(0.6, 0.25, 1); eyes.position.set(0, 3.05, 0.45); g.add(eyes); this.only.push([eyes, 1]);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.add(g);
    }
    // a frozen flag on the summit
    const top = terrainH(FROST.x, FROST.z);
    this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), lam(0x8a8a8a), FROST.x, top + 2, FROST.z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), lam(0x2a7aff, { side: THREE.DoubleSide })); flag.position.set(FROST.x + 0.8, top + 3.5, FROST.z); this.add(flag);
    this.swaps.push((w) => flag.material.color.setHex(w ? 0x5a0a0a : 0x2a7aff));
  }

  // ---------------------------------------------------------------- Toxic Works
  buildToxic() {
    const wallM = lam(0xffffff, { map: metal('#8a929e', null) }), roofM = lam(0x5a626e), hazard = lam(0xffffff, { map: metal('#3a3a3a', '#f2c21a') });
    this.swaps.push((w) => { wallM.color.setHex(w ? 0x7a5a50 : 0xffffff); roofM.color.setHex(w ? 0x3a2a26 : 0x5a626e); });
    const crate = lam(0xffffff, { map: planks('#b07a3a', '#5a3a14') }), grate = lam(0xffffff, { map: metal('#5a6470', '#f2c21a') });
    for (const b of MAP.boxes) {
      if (b.kind === 'hall') this.boxMesh(b, wallM);
      else if (b.kind === 'hallroof') this.boxMesh(b, roofM);
      else if (b.kind === 'crate') this.boxMesh(b, crate);
      else if (b.kind === 'stairs' || b.kind === 'catwalk') this.boxMesh(b, grate);
    }
    // windows along the hall
    for (let x = 131; x < 155; x += 5) for (const z of [-35.05, -10.95]) { const m = this.mesh(new THREE.PlaneGeometry(2.6, 1.2), basic(0xbff0ff), x, 6.2, z, z > -20 ? 0 : Math.PI); m.castShadow = false; this.windows.push(m); }
    const tankM = lam(0xffffff, { map: metal('#c0c8d0', null) }), brick = lam(0xffffff, { map: stone('#a0503a', 0.3) });
    this.swaps.push((w) => { tankM.color.setHex(w ? 0x6a5a5a : 0xffffff); brick.color.setHex(w ? 0x5a3a3a : 0xffffff); });
    this.smoke = [];
    for (const c of MAP.cyls) {
      if (c.kind === 'tank') { this.mesh(new THREE.CylinderGeometry(c.r, c.r, c.y1 - c.y0, 20), tankM, c.x, (c.y0 + c.y1) / 2, c.z); this.mesh(new THREE.SphereGeometry(c.r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), tankM, c.x, c.y1, c.z); }
      if (c.kind === 'chimney') {
        this.mesh(new THREE.CylinderGeometry(c.r * 0.85, c.r, c.y1 - c.y0, 14), brick, c.x, (c.y0 + c.y1) / 2, c.z);
        for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xdddddd, transparent: true, opacity: 0.5, depthWrite: false })); s.position.set(c.x, c.y1 + i * 2, c.z); s.scale.setScalar(3 + i); this.add(s); this.smoke.push({ s, base: c.y1, x: c.x, z: c.z, t: i / 6 }); }
      }
      if (c.kind === 'strut') this.mesh(new THREE.CylinderGeometry(c.r, c.r, c.y1 - c.y0, 8), roofM, c.x, (c.y0 + c.y1) / 2, c.z);
    }
    this.swaps.push((w) => { for (const p of this.smoke) p.s.material.color.setHex(w ? 0x1a1010 : 0xeeeeee); });
    // pipes running overhead
    const pipeM = lam(0x6aa84a);
    this.swaps.push((w) => pipeM.color.setHex(w ? 0x4a5a2a : 0x6aa84a));
    for (const [x0, z0, x1, z1, y] of [[129, -11, 150, 60, 9], [100, -64, 128, -30, 8.5], [156, -23, 165, -2, 10], [140, 62, 100, 72, 9.5]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), m = this.mesh(new THREE.CylinderGeometry(0.45, 0.45, len, 10), pipeM, (x0 + x1) / 2, y, (z0 + z1) / 2);
      m.lookAt(x1, y, z1); m.rotateX(Math.PI / 2);
    }
    // conveyor belts with moving stripes
    this.beltTex = tex(64, 64, (g, w, h) => { g.fillStyle = '#2a2a30'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c21a'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h); }, [8, 1]);
    for (const c of MAP.CONVEYORS) {
      const m = this.mesh(new THREE.BoxGeometry(c.x1 - c.x0, 0.3, c.z1 - c.z0), [lam(0x3a3a40), lam(0x3a3a40), basic(0xffffff, { map: this.beltTex }), lam(0x3a3a40), lam(0x3a3a40), lam(0x3a3a40)], (c.x0 + c.x1) / 2, c.top - 0.15, (c.z0 + c.z1) / 2);
      m.userData.dir = Math.sign(c.vx);
      this.mesh(new THREE.BoxGeometry(c.x1 - c.x0, c.top - 0.4, c.z1 - c.z0 + 0.4), hazard, (c.x0 + c.x1) / 2, (c.top - 0.3) / 2 + 0.2, (c.z0 + c.z1) / 2);
    }
  }

  // ---------------------------------------------------------------- Neon Jackpot
  buildNeon() {
    this.neon = [];
    const slot = MAP.boxes.find((b) => b.kind === 'slot');
    const screen = (creepy) => tex(256, 128, (g, w, h) => {
      g.fillStyle = '#1a0a2a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#fff8e8'; g.fillRect(14 + i * 80, 20, 68, 88);
        g.font = '64px Bungee, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = creepy ? '#a00010' : '#e8202a';
        g.fillText(creepy ? 'X' : '7', 48 + i * 80, 66);
      }
    });
    const nice = screen(false), creepy = screen(true);
    const body = lam(0xd02a6a), face = lam(0xffffff, { map: nice });
    this.swaps.push((w) => { face.map = w ? creepy : nice; face.needsUpdate = true; body.color.setHex(w ? 0x3a0a2a : 0xd02a6a); });
    this.mesh(new THREE.BoxGeometry(slot.x1 - slot.x0, slot.y1 - slot.y0, slot.z1 - slot.z0), [body, body, body, body, body, body], (slot.x0 + slot.x1) / 2, (slot.y0 + slot.y1) / 2, (slot.z0 + slot.z1) / 2);
    const sc = this.mesh(new THREE.PlaneGeometry(12, 6), face, 0, slot.y0 + 7, slot.z0 - 0.05, Math.PI); sc.castShadow = false;
    for (let i = 0; i < 18; i++) { const b = this.mesh(new THREE.SphereGeometry(0.28, 8, 6), basic(i % 2 ? 0xffe23a : 0xff3ad0), -7.6 + (i % 9) * 1.9, slot.y0 + (i < 9 ? 10.6 : 3.4), slot.z0 - 0.2); this.neon.push(b); }
    // the lever
    this.mesh(new THREE.CylinderGeometry(0.2, 0.2, 5, 8), lam(0xc0c0c0), 9, slot.y0 + 8, 154);
    this.mesh(new THREE.SphereGeometry(0.7, 12, 10), basic(0xff2a2a), 9, slot.y0 + 10.6, 154);
    // pinball bumpers
    this.bumpers = [];
    for (const c of MAP.cyls) {
      if (c.kind !== 'bumper') continue;
      const g = new THREE.Group(); g.position.set(c.x, c.y0 + 1, c.z);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r * 1.1, 1.0, 20), lam(0x2a2a6a)).translateY(0.5));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.95, c.r, 0.5, 20), basic(0xff3ad0)); cap.position.y = 1.25; g.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(c.r * 0.7, 0.08, 6, 20), basic(0xffffff)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.52; g.add(ring);
      this.add(g); this.bumpers.push({ c, cap, kick: 0 });
    }
    // dice and neon arches
    const dice = lam(0xffffff, { map: tex(64, 64, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#d0203a'; for (const [x, y] of [[16, 16], [48, 48], [32, 32], [16, 48], [48, 16]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } }) });
    for (const b of MAP.boxes) if (b.kind === 'dice') this.boxMesh(b, dice).rotation.y = 0.3;
    for (const c of MAP.cyls) if (c.kind === 'arch') this.mesh(new THREE.CylinderGeometry(c.r, c.r, c.y1 - c.y0, 12), lam(0x2a2a5a), c.x, (c.y0 + c.y1) / 2, c.z);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(7, 0.4, 8, 40, Math.PI), basic(0x3ae6ff)); arc.position.set(0, 1 + 8.5, 96); this.add(arc); this.neon.push(arc);
    const arc2 = new THREE.Mesh(new THREE.TorusGeometry(6.3, 0.25, 8, 40, Math.PI), basic(0xff3ad0)); arc2.position.set(0, 1 + 8.5, 96); this.add(arc2); this.neon.push(arc2);
    // star posts (lamp posts with stars)
    const starGeo = (() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.25 : 0.6; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false }); })();
    for (const [x, z] of [[-30, 98], [30, 140], [-60, 120], [60, 100], [-20, 140], [40, 160], [-64, 160]]) {
      this.mesh(new THREE.CylinderGeometry(0.12, 0.15, 5, 8), lam(0xd0d0e0), x, 3.5, z);
      const s = this.mesh(starGeo, basic(0xffe23a), x, 6.4, z); s.castShadow = false; this.neon.push(s);
    }
  }

  // ---------------------------------------------------------------- Ember Ruins
  buildEmber() {
    const mm = lam(0xffffff, { map: marble() });
    this.swaps.push((w) => mm.color.setHex(w ? 0x6a5650 : 0xffffff));
    for (const b of MAP.boxes) if (b.kind === 'pillar' || b.kind === 'ruin') this.boxMesh(b, mm);
    for (const c of MAP.cyls) if (c.kind === 'column' && Math.abs(c.x - TEMPLE.x) < 14 && Math.abs(c.z - TEMPLE.z) < 14) {
      this.mesh(new THREE.CylinderGeometry(c.r * 0.9, c.r, c.y1 - c.y0, 12), mm, c.x, (c.y0 + c.y1) / 2, c.z);
      this.mesh(new THREE.BoxGeometry(2, 0.4, 2), mm, c.x, c.y1 + 0.2, c.z);
    }
    // pillar tops: a small roof over each bell
    for (const p of MAP.boxes.filter((b) => b.kind === 'pillar')) {
      const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), mm, cx + dx, p.y1 + 1.5, cz + dz);
      this.mesh(new THREE.ConeGeometry(2.4, 1.2, 4), lam(0xc0603a, { flatShading: true }), cx, p.y1 + 3.6, cz, Math.PI / 4);
    }
    // braziers on the temple
    this.fires = [];
    for (const [x, z] of [[TEMPLE.x - 6, TEMPLE.z - 6], [TEMPLE.x - 6, TEMPLE.z + 6], [TEMPLE.x + 6, TEMPLE.z - 6], [TEMPLE.x + 6, TEMPLE.z + 6]]) {
      const y = terrainH(x, z);
      this.mesh(new THREE.CylinderGeometry(0.6, 0.3, 1.2, 10), lam(0x6a4a2a), x, y + 0.6, z);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); f.position.set(x, y + 1.6, z); f.scale.set(1.6, 2.2, 1); this.add(f); this.fires.push(f);
    }
    this.swaps.push((w) => { for (const f of this.fires) f.material.color.setHex(w ? 0xff2010 : 0xffa040); });
  }

  // ---------------------------------------------------------------- portals and gates
  buildPortals() {
    this.portalMats = [];
    const frameM = lam(0x6a4aa0);
    this.swaps.push((w) => frameM.color.setHex(w ? 0x3a0a14 : 0x6a4aa0));
    for (const p of MAP.PORTALS) {
      const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = Math.atan2(-p.x, -p.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.28, 10, 32), frameM); ring.position.y = 2.1; g.add(ring);
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
        uniforms: { time: { value: 0 }, corrupt: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec2 vUv; uniform float time, corrupt;
          void main(){ vec2 p = vUv - 0.5; float r = length(p), a = atan(p.y, p.x);
            float sw = sin(a * 4.0 + r * 22.0 - time * 5.0) * 0.5 + 0.5;
            vec3 n = mix(vec3(0.35, 0.2, 1.0), vec3(0.4, 1.0, 1.0), sw);
            vec3 c = mix(vec3(0.05, 0.0, 0.0), vec3(1.0, 0.1, 0.15), sw);
            vec3 col = mix(n, c, corrupt) + (1.0 - smoothstep(0.0, 0.18, r)) * vec3(1.0);
            gl_FragColor = vec4(col, smoothstep(0.5, 0.42, r) * 0.92); }`,
      });
      this.portalMats.push(mat);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), mat); disc.position.y = 2.1; g.add(disc);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x9a7aff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(4.6, 4.6, 1); glow.position.y = 2.1; g.add(glow);
      this.swaps.push((w) => glow.material.color.setHex(w ? 0xff2030 : 0x9a7aff));
      this.add(g);
    }
    this.swaps.push((w) => { for (const m of this.portalMats) m.uniforms.corrupt.value = w; });
  }

  buildGates() {
    const st = lam(0xffffff, { map: stone('#4a4250') });
    const portalMat = () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { time: { value: 0 }, open: { value: 0 }, act: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float time, open, act;
        void main(){ vec2 p = vUv - 0.5; p.x *= 0.9; float r = length(p), a = atan(p.y, p.x);
          float sw = sin(a * 5.0 + r * 18.0 - time * (2.0 + open * 4.0)) * 0.5 + 0.5;
          float edge = smoothstep(0.5, 0.35, r);
          vec3 closed = mix(vec3(0.25, 0.0, 0.02), vec3(0.6, 0.02, 0.05), sw);
          vec3 opened = mix(vec3(0.5, 0.9, 1.0), vec3(1.0), sw) * (1.2 + 0.6 * smoothstep(0.3, 0.0, r));
          gl_FragColor = vec4(mix(closed, opened, open), edge * (0.35 + open * 0.6) * (0.6 + sw * 0.4) * act); }`,
    });
    this.gates = MAP.props.gates.map((g) => {
      const grp = new THREE.Group(); grp.position.set(g.x, g.y, g.z); grp.rotation.y = g.ry;
      for (const s of [-1, 1]) grp.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, 1.5), st).translateX(s * 3.4).translateY(3.5));
      grp.add(new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.3, 1.7), st).translateY(7.6));
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 7.2), portalMat()); portal.position.y = 3.6; grp.add(portal);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 160, 16, 1, true), basic(0x9fe8ff, { transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      beam.position.y = 80; beam.visible = false; grp.add(beam);
      this.add(grp, 1);
      return { grp, portal, beam, active: false };
    });
  }

  setExits(idxs, open) {
    this.gates.forEach((g, i) => {
      g.active = idxs.includes(i);
      g.portal.material.uniforms.act.value = g.active ? 1 : 0.35;
      g.portal.material.uniforms.open.value = g.active && open ? 1 : 0;
      g.beam.visible = g.active && open;
    });
  }

  // ---------------------------------------------------------------- shards (normal world)
  buildShards() {
    this.shardMeshes = [];
    const core = new THREE.OctahedronGeometry(0.45, 0);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group(); g.visible = false;
      const m = new THREE.Mesh(core, basic(0xaaf6ff)); m.scale.set(1, 1.6, 1); g.add(m);
      const inner = new THREE.Mesh(core, basic(0xffffff)); inner.scale.set(0.45, 0.8, 0.45); g.add(inner);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x6fe8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(3, 3, 1); g.add(halo);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 70, 6, 1, true), basic(0x6fe8ff, { transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); beam.position.y = 35; g.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32), basic(0xffffff, { transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = -1.0; g.add(ring);
      this.scene.add(g);
      this.shardMeshes.push({ g, m, halo, beam, ring, prog: 0, on: false });
    }
  }

  setShards(list) {
    this.shardMeshes.forEach((s, i) => { const p = list && list[i]; s.on = !!p; s.g.visible = !!p; if (p) s.g.position.set(p[0], p[1], p[2]); s.prog = 0; });
  }

  updateShards(takenMask, progress, litMask = 0xff) {
    this.shardMeshes.forEach((s, i) => {
      if (!s.on) return;
      s.g.visible = this.theme === 0 && !(takenMask & (1 << i)) && !!(litMask & (1 << i));
      s.prog = progress[i] || 0;
    });
  }

  // ---------------------------------------------------------------- zone tasks
  buildTasks() {
    // valves (normal world): a wheel on a pipe stand; spins while you turn it, glows green when done
    this.valves = OBJ.valves.map((v) => {
      const y = v.y - 1.1, g = new THREE.Group(); g.position.set(v.x, y, v.z);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 10), lam(0x5a6a7a)).translateY(0.7));
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 8, 20), lam(0xe0302a)); wheel.position.y = 1.5; wheel.rotation.x = Math.PI / 2; g.add(wheel);
      for (let k = 0; k < 2; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), lam(0xe0302a)); s.rotation.y = k * Math.PI / 2; wheel.add(s); s.rotation.set(0, 0, k * Math.PI / 2); }
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), basic(0xff3a2a)); light.position.y = 2.0; g.add(light);
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 40, 6, 1, true), basic(0xffd23a, { transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); beacon.position.y = 21; g.add(beacon);
      this.add(g, 0);
      return { wheel, light, beacon, prog: 0, done: false };
    });
    // jackpot panels (corrupted world): floor tiles that light up when stepped on
    this.panels = OBJ.panels.map((p) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.6), basic(0x5a1a3a)); m.position.set(p.x, p.y - 1.1 + 0.06, p.z);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff3ad0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(4, 2, 1); glow.position.set(p.x, p.y - 0.4, p.z);
      this.add(m, 1); this.add(glow, 1);
      return { m, glow, done: false };
    });
    // bells (corrupted world) on top of the ruin pillars
    this.bells = OBJ.bells.map((b) => {
      const g = new THREE.Group(); g.position.set(b.x, b.y - 1.1, b.z);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 1.3, 16, 1, true), lam(0xc8962a, { side: THREE.DoubleSide })); bell.position.y = 1.8; g.add(bell);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), lam(0xc8962a)).translateY(2.45));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffb040, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.setScalar(5); glow.position.y = 1.8; g.add(glow);
      this.add(g, 1);
      return { g, bell, glow, done: false, swing: 0 };
    });
    // the frozen engine and the fire core (corrupted world)
    const ex = OBJ.engine.x, ez = OBJ.engine.z - 3.2, ey = terrainH(ex, ez);
    const eng = new THREE.Group(); eng.position.set(ex, ey, ez);
    eng.add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.2, 3.6), lam(0x5a6a8a)).translateY(1.6));
    for (const sd of [-1, 1]) { const gear = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.25, 6, 10), lam(0x8a8a9a)); gear.position.set(sd * 2.3, 2.2, 0); gear.rotation.y = Math.PI / 2; eng.add(gear); }
    const iceBlock = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4.6, 4.0), new THREE.MeshPhongMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.45, shininess: 100 })); iceBlock.position.y = 1.6; eng.add(iceBlock);
    const furnace = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), basic(0x222222)); furnace.position.set(0, 1.6, 1.82); eng.add(furnace);
    eng.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.add(eng, 1);
    this.engine = { eng, iceBlock, furnace, done: false };
    const coreG = new THREE.Group();
    coreG.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), basic(0xffa020)));
    const cglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff7a20, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); cglow.scale.setScalar(3.2); coreG.add(cglow);
    const cbeam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 50, 6, 1, true), basic(0xff9a3a, { transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); cbeam.position.y = 25; coreG.add(cbeam);
    this.add(coreG, 1);
    this.core = { g: coreG, beam: cbeam };
    // an ice-cave brazier where the core starts
    this.mesh(new THREE.CylinderGeometry(0.8, 0.4, 1.0, 10), lam(0x4a4a5a), OBJ.core.x, CAVE.y + 0.5, OBJ.core.z - 1.6);
  }

  /** Restyles task props from a snapshot: s = { vm, vp:{i:prog}, pm, bm, co:[state,x,y,z,by] }. */
  updateTasks(s, dt) {
    this.valves.forEach((v, i) => {
      const done = !!(s.vm & (1 << i)), p = s.vp[i] || 0;
      if (done !== v.done) { v.done = done; v.light.material.color.setHex(done ? 0x3aff6a : 0xff3a2a); v.beacon.visible = !done; }
      if (p > 0 && !done) v.wheel.rotation.z += dt * 6;
    });
    this.panels.forEach((p, i) => {
      const done = !!(s.pm & (1 << i));
      if (done !== p.done) { p.done = done; p.m.material.color.setHex(done ? 0xff3ad0 : 0x5a1a3a); p.glow.material.opacity = done ? 1 : 0.5; p.glow.material.color.setHex(done ? 0xffe23a : 0xff3ad0); }
    });
    this.bells.forEach((b, i) => {
      const done = !!(s.bm & (1 << i));
      if (done && !b.done) b.swing = 1;
      b.done = done;
      b.swing = Math.max(0, b.swing - dt * 0.3);
      b.bell.rotation.z = Math.sin(this.time * 9) * 0.5 * b.swing;
      b.glow.material.opacity = done ? 0.5 + b.swing * 0.5 : 0;
    });
    const co = s.co;
    if (co) {
      this.core.g.position.set(co[1], co[0] === 1 ? co[2] + 0.6 : co[2] + 1.0, co[3]);
      this.core.beam.visible = co[0] !== 3 && co[0] !== 1;
      const done = co[0] === 3;
      if (done !== this.engine.done) { this.engine.done = done; this.engine.iceBlock.visible = !done; this.engine.furnace.material.color.setHex(done ? 0xff8a20 : 0x222222); }
    }
  }

  // ---------------------------------------------------------------- glitch particles and ash/pollen
  buildGlitch() {
    const centers = [[HOLLOW.x, 2, HOLLOW.z, 14], [3, 3, -40, 8], [-22, 4, -26, 9], [40, 3, 8, 9], [-58, 12, -8, 10], [60, 2, -30, 9], [-14, 3, 64, 9], [-60, 3, -120, 10], [130, 3, 0, 14], [0, 3, 130, 14], [-132, 6, 0, 12], [48, 2, -122, 10]];
    const n = this.hi ? 220 : 120;
    this.glitch = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), basic(0xffffff, { transparent: true, opacity: 0.85 }), n);
    this.glitchData = [];
    const cols = ['#ff1030', '#000000', '#ffffff', '#ff2a8a', '#8a0010', '#000000'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) { this.glitchData.push({ c: centers[i % centers.length], x: 0, y: 0, z: 0, s: 0, t: Math.random() }); this.glitch.setColorAt(i, cols[i % cols.length]); this.reGlitch(i); }
    this.add(this.glitch, 1);
  }

  reGlitch(i) {
    const d = this.glitchData[i], c = d.c, r = this.r;
    d.x = c[0] + (r() - 0.5) * c[3] * 2; d.z = c[2] + (r() - 0.5) * c[3] * 2;
    d.y = terrainH(d.x, d.z) + 0.3 + r() * 5;
    d.s = 0.06 + r() * 0.22; d.w = r() < 0.1 ? 2 + r() * 2 : 1;
    d.t = 0.05 + r() * 0.5;
  }

  buildAsh() {
    const n = this.hi ? 900 : 450, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ash = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc87a6a, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false }));
    this.ash.frustumCulled = false;
    this.swaps.push((w) => { this.ash.material.color.setHex(w ? 0xc87a6a : 0xfff6c8); this.ash.material.size = w ? 0.09 : 0.07; this.ash.material.opacity = w ? 0.75 : 0.6; });
    this.add(this.ash);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, camera, focus) {
    this.time += dt;
    const t = this.time, c = this.theme === 1;
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.time.value = t;
    this.waterTex.offset.set(t * 0.012, t * 0.02);
    this.fallTex.offset.y = t * 1.3;
    this.gooTex.offset.set(t * 0.02, t * 0.015);
    this.lavaTex.offset.set(t * 0.03, -t * 0.02);
    this.beltTex.offset.x = -t * 0.6;
    this.boostMat.color.setScalar(0.75 + Math.sin(t * 8) * 0.25);
    if (this.hi && focus) { this.sun.position.copy(focus).addScaledVector(this.sunDir, 140); this.sun.target.position.copy(focus); }
    for (const l of this.lamps) { const f = c && Math.random() < 0.04 ? 0.15 : 1; l.material.color.setRGB(f, c ? 0.12 * f : 0.88, c ? 0.06 * f : 0.55); }
    if (c) for (const w of this.windows) if (Math.random() < 0.03) w.material.color.setRGB(Math.random() < 0.5 ? 0.05 : 1, 0.2, 0.06);
    if (this.altarGlow) this.altarGlow.material.opacity = 0.7 + Math.sin(t * 2.3) * 0.25;
    for (const s of this.springs) { s.kick = Math.max(0, s.kick - dt * 3); const k = s.kick > 0.66 ? 0.4 : 1 + Math.sin(s.kick * 12) * s.kick * 0.4; s.coil.scale.y = k; s.pad.position.y = 0.9 * k; s.ring.position.y = 1.01 * k; }
    for (const b of this.bumpers) { b.kick = Math.max(0, b.kick - dt * 4); b.cap.material.color.setHex(b.kick > 0 ? 0xffffff : c ? 0x8a1a5a : 0xff3ad0); b.cap.scale.setScalar(1 + b.kick * 0.25); }
    this.neon.forEach((n, i) => { const on = c ? Math.random() > 0.1 : Math.sin(t * 4 + i) > -0.6; n.visible = on; });
    for (const p of this.smoke) { p.t = (p.t + dt * 0.15) % 1; p.s.position.set(p.x + p.t * 4, p.base + p.t * 14, p.z); p.s.scale.setScalar(2 + p.t * 8); p.s.material.opacity = 0.5 * (1 - p.t); }
    for (const f of this.fires) f.scale.set(1.4 + Math.random() * 0.4, 2 + Math.random() * 0.6, 1);
    for (const m of this.portalMats) m.uniforms.time.value = t;
    for (const g of this.gates) { g.portal.material.uniforms.time.value = t; if (g.beam.visible) g.beam.material.opacity = 0.18 + Math.sin(t * 3) * 0.05; }
    for (const s of this.shardMeshes) {
      if (!s.g.visible) continue;
      const k = 1 + s.prog * 4;
      s.m.rotation.y += dt * 1.2 * k; s.m.position.y = Math.sin(t * 2 + s.g.position.x) * 0.18;
      s.halo.scale.setScalar(2.6 + Math.sin(t * 3 * k) * 0.3 + s.prog * 2);
      s.ring.visible = s.prog > 0.01;
      if (s.ring.visible) { s.ring.geometry.dispose(); s.ring.geometry = new THREE.RingGeometry(0.95, 1.15, 32, 1, Math.PI / 2, Math.PI * 2 * s.prog); }
    }
    this.core.g.rotation.y += dt * 2;
    if (c) {
      const dummy = World._d || (World._d = new THREE.Object3D());
      for (let i = 0; i < this.glitchData.length; i++) {
        const d = this.glitchData[i];
        d.t -= dt; if (d.t <= 0) this.reGlitch(i);
        const on = Math.random() > 0.06;
        dummy.position.set(d.x + (Math.random() < 0.1 ? (Math.random() - 0.5) * 0.6 : 0), d.y, d.z);
        dummy.scale.set(on ? d.s * d.w : 0.0001, on ? d.s : 0.0001, on ? d.s : 0.0001);
        dummy.updateMatrix(); this.glitch.setMatrixAt(i, dummy.matrix);
      }
      this.glitch.instanceMatrix.needsUpdate = true;
    }
    const p = this.ash.geometry.attributes.position, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, fall = c ? 1 : -0.25;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + Math.sin(t * 0.7 + i) * dt * 0.4, y = p.getY(i) - dt * (0.6 + (i % 5) * 0.12) * fall, z = p.getZ(i) + dt * 0.3;
      if (y < cy - 8) y += 30; if (y > cy + 22) y -= 30;
      if (x < cx - 30) x += 60; if (x > cx + 30) x -= 60; if (z < cz - 30) z += 60; if (z > cz + 30) z -= 60;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  kickBumper(c) { const b = this.bumpers.find((q) => q.c === c); if (b) b.kick = 1; }
}

/** Merges non-indexed geometries with position/normal/uv/color into one. */
export function mergeGeos(list) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    if (!list.every((g) => g.attributes[name])) continue;
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(list.reduce((s, g) => s + g.attributes[name].count * size, 0));
    let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

export { HALF };
