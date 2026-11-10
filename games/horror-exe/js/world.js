// Dreamy Hills Zone, rotted: builds the 3D scene from the shared map data and animates it.
import * as THREE from 'three';
import { terrainH, WATER_Y, MAP, V, L, S as HOLLOW, HALF } from '../shared/map.js';
import { rng, smooth } from '../shared/util.js';
import { glowTex } from './rig.js';

const SUN_DIR = new THREE.Vector3(-0.42, 0.3, -0.86).normalize();
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

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
  for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 6); }
}, [1, 1]);
const stone = (base) => tex(128, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`; g.fillRect(x + 2, y + 2, 60, 28);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3; g.strokeRect(x + 1, y + 1, 62, 30);
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 20; g.lineTo(x, y); } g.stroke(); }
}, [1, 1]);

/** Creepy writing: dripping red letters on a board. */
function signTex(text) {
  return tex(256, 160, (g, w, h) => {
    g.fillStyle = '#5b3a22'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = `rgba(0,0,0,${0.12 + Math.random() * 0.1})`; g.fillRect(0, y, w, 3); }
    g.font = '400 40px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((ln, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * 46;
      g.fillStyle = '#a00010'; g.fillText(ln, w / 2 + (Math.random() - 0.5) * 3, y);
      const m = g.measureText(ln).width;
      for (let k = 0; k < 4; k++) { const x = w / 2 - m / 2 + Math.random() * m; g.fillRect(x, y + 12, 3, 8 + Math.random() * 22); }
    });
  });
}

export class World {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.hi = quality === 'high';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x160204);
    this.scene.fog = new THREE.FogExp2(0x2b0507, 0.0118);
    this.time = 0;
    this.r = rng(99);
    this.anim = [];
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.buildVillage();
    this.buildCorridor();
    this.buildBridgeAndCliff();
    this.buildPlatforms();
    this.buildSprings();
    this.buildLoops();
    this.buildNature();
    this.buildTotems();
    this.buildSigns();
    this.buildGates();
    this.buildShards();
    this.buildGlitch();
    this.buildAsh();
  }

  add(o) { this.scene.add(o); return o; }

  // ---------------------------------------------------------------- sky
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { time: { value: 0 }, sunDir: { value: SUN_DIR } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float time; uniform vec3 sunDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 top = vec3(0.035, 0.0, 0.004), mid = vec3(0.32, 0.012, 0.01), hor = vec3(0.62, 0.07, 0.02), low = vec3(0.03, 0.0, 0.0);
          vec3 col = h > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.12, 0.75, h)), smoothstep(0.0, 0.14, h)) : mix(hor, low, smoothstep(0.0, -0.08, h));
          float a = acos(clamp(dot(d, sunDir), -1.0, 1.0));
          col += vec3(1.0, 0.18, 0.05) * (exp(-a * 7.0) * 0.9 + exp(-a * 26.0) * 1.6);
          col = mix(col, vec3(0.0), smoothstep(0.072, 0.066, a));
          col += vec3(1.0, 0.35, 0.15) * smoothstep(0.012, 0.0, abs(a - 0.071)) * 2.0;
          vec2 uv = d.xz / (h + 0.25) * 1.6 + vec2(time * 0.006, time * 0.002);
          float n = fbm(uv);
          col = mix(col, vec3(0.02, 0.0, 0.0), smoothstep(0.5, 0.82, n) * smoothstep(0.02, 0.25, h) * 0.85);
          col += vec3(0.25, 0.03, 0.0) * smoothstep(0.62, 0.7, n) * smoothstep(0.75, 0.6, n) * smoothstep(0.02, 0.2, h) * exp(-a * 1.5);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = this.add(new THREE.Mesh(new THREE.SphereGeometry(900, 40, 20), mat));
    this.sky.renderOrder = -10;
  }

  buildLights() {
    this.add(new THREE.HemisphereLight(0xd0604a, 0x2a0a08, 1.7));
    this.add(new THREE.AmbientLight(0x6a2a2a, 0.6));
    const sun = (this.sun = new THREE.DirectionalLight(0xff8a60, 2.3));
    sun.position.copy(SUN_DIR).multiplyScalar(100);
    if (this.hi) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera; c.left = c.bottom = -45; c.right = c.top = 45; c.near = 10; c.far = 260;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    }
    this.add(sun); this.add(sun.target);
  }

  // ---------------------------------------------------------------- ground
  buildTerrain() {
    const size = 340, seg = this.hi ? 220 : 170;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), tmp = new THREE.Color();
    const grass = new THREE.Color('#3f8f2c'), grass2 = new THREE.Color('#2c6e22'), dead = new THREE.Color('#6b5a34'), blood = new THREE.Color('#5c1414'), black = new THREE.Color('#1a0c0c');
    const dirtA = new THREE.Color('#9a521f'), dirtB = new THREE.Color('#5e2c10'), mud = new THREE.Color('#2a0c08'), path = new THREE.Color('#7a5232'), far = new THREE.Color('#3a1a12');
    const r = rng(5);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = terrainH(x, z);
      pos.setY(i, h);
      const sx = terrainH(x + 0.8, z) - terrainH(x - 0.8, z), sz = terrainH(x, z + 0.8) - terrainH(x, z - 0.8), slope = Math.hypot(sx, sz) / 1.6;
      const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17 - x * 0.05);
      if (h < WATER_Y - 0.1) c.copy(mud);
      else if (slope > 0.7) c.copy(Math.floor((h + 40) * 0.95) % 2 ? dirtA : dirtB);
      else {
        c.copy(grass).lerp(grass2, n);
        c.lerp(dead, smooth(0.55, 0.9, Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.09) * 0.5 + 0.5) * 0.8);
        const dh = Math.hypot(x - HOLLOW.x, z - HOLLOW.z);
        c.lerp(black, 1 - smooth(10, 30, dh));
        c.lerp(blood, smooth(0.75, 0.95, Math.sin(x * 0.045 - 2) * Math.sin(z * 0.052 + 1)) * 0.75);
        const dv = Math.hypot(x - V.x, z - V.z);
        if (dv > 8.5 && dv < 11) c.lerp(path, 0.85);
      }
      const e = Math.max(Math.abs(x), Math.abs(z));
      if (e > 88) c.lerp(slope > 0.7 ? tmp.copy(Math.floor((h + 40) * 0.95) % 2 ? dirtA : dirtB).multiplyScalar(0.7) : far, smooth(88, 120, e));
      const j = 0.9 + r() * 0.2;
      col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, lam(0xffffff, { vertexColors: true, flatShading: true }));
    m.receiveShadow = true;
    this.terrain = this.add(m);
  }

  buildWater() {
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
    const mat = new THREE.MeshPhongMaterial({ color: 0x3a0207, emissive: 0x120001, specular: 0xff5a40, shininess: 70, normalMap: nTex, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.92 });
    const lake = new THREE.Mesh(new THREE.CircleGeometry(L.r + 3, 48), mat);
    lake.rotation.x = -Math.PI / 2; lake.position.set(L.x, WATER_Y, L.z); this.add(lake);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(12, 36), mat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(HOLLOW.x, WATER_Y, HOLLOW.z); this.add(pool);
  }

  // ---------------------------------------------------------------- buildings
  buildVillage() {
    const wall = lam(0xffffff, { map: planks('#8a6040', '#3a2414') });
    const roofCols = [0xa83a26, 0x2f56a0, 0xc89526, 0x3f8a3a, 0x8a3aa0, 0xc0502a];
    const winMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
    this.windows = [];
    MAP.props.huts.forEach((h, i) => {
      const g = new THREE.Group(); g.position.set(h.x, h.y, h.z); g.rotation.y = Math.round(h.face / (Math.PI / 2)) * (Math.PI / 2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 5), wall); body.position.y = 1.7; body.castShadow = body.receiveShadow = true; g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.5, 4), lam(roofCols[i % roofCols.length], { flatShading: true }));
      roof.position.y = 3.4 + 1.25; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      if (i === 2) roof.rotation.z = 0.12;
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.1), lam(0x1a0d08)); door.position.set(0, 1.05, 2.52); g.add(door);
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), winMat.clone()); w.position.set(s * 1.5, 2.1, 2.52); g.add(w); this.windows.push(w);
      }
      this.add(g);
    });
    const st = lam(0xffffff, { map: stone('#6a6470') });
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 1.0, 16), st); well.position.set(0, V.y + 0.5, 0); well.castShadow = true; this.add(well);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), new THREE.MeshBasicMaterial({ color: 0x050000 })); inner.rotation.x = -Math.PI / 2; inner.position.set(0, V.y + 0.95, 0); this.add(inner);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), lam(0x4a2c1a)); p.position.set(s * 1.15, V.y + 1.6, 0); this.add(p); }
    const wr = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.9, 4), lam(0x7a2418, { flatShading: true })); wr.position.set(0, V.y + 3.0, 0); wr.rotation.y = Math.PI / 4; this.add(wr);
    this.lamps = [];
    for (const l of MAP.props.lamps) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 4.4, 6), lam(0x2a2226)); p.position.set(l.x, l.y + 2.2, l.z); this.add(p);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3020 })); head.position.set(l.x, l.y + 4.6, l.z); this.add(head);
      this.lamps.push(head);
    }
    if (this.hi) for (const [x, z] of [[9, 9], [-9, -7]]) { const pl = new THREE.PointLight(0xff3a1a, 18, 22, 1.6); pl.position.set(x, V.y + 4, z); this.add(pl); this.lamps.push({ isLight: pl }); }
  }

  buildCorridor() {
    const st = lam(0xffffff, { map: stone('#5a5262') });
    for (const b of MAP.boxes) {
      if (b.kind !== 'wall' && !(b.kind === 'roof' && b.x1 - b.x0 > 10)) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), st);
      m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      m.material.map.repeat.set(4, 1);
      m.castShadow = m.receiveShadow = true;
      this.add(m);
    }
    for (let x = -5; x <= 11; x += 8) {
      const lan = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2a10 })); lan.position.set(x, 1.5 + 3.8, -40); this.add(lan); this.lamps.push(lan);
    }
    if (this.hi) { const pl = new THREE.PointLight(0xff2a10, 14, 16, 1.6); pl.position.set(3, 4.6, -40); this.add(pl); this.lamps.push({ isLight: pl }); }
  }

  buildBridgeAndCliff() {
    const deck = MAP.boxes.find((b) => b.kind === 'deck');
    const dm = new THREE.Mesh(new THREE.BoxGeometry(deck.x1 - deck.x0, 0.4, deck.z1 - deck.z0), lam(0xffffff, { map: planks('#6a4228', '#2a160a') }));
    dm.material.map.rotation = Math.PI / 2; dm.material.map.repeat.set(1, 12);
    dm.position.set((deck.x0 + deck.x1) / 2, 0.5, (deck.z0 + deck.z1) / 2); dm.castShadow = dm.receiveShadow = true; this.add(dm);
    const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 4.4, 6), postMat = lam(0x3a2414);
    for (const p of MAP.props.posts) { const m = new THREE.Mesh(postGeo, postMat); m.position.set(p.x, -0.8, p.z); this.add(m); const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.0, 6), postMat); top.position.set(p.x, 1.2, p.z); this.add(top); }
    const rock = lam(0xffffff, { map: stone('#4a3434'), flatShading: true });
    for (const b of MAP.boxes) {
      if (b.kind !== 'cliff') continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0, 3, 3, 3), rock);
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (Math.random() - 0.5) * 0.08), p.getY(i), p.getZ(i) * (1 + (Math.random() - 0.5) * 0.1));
      m.geometry.computeVertexNormals();
      m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2); m.castShadow = m.receiveShadow = true; this.add(m);
    }
    const fallTex = tex(64, 256, (g, w, h) => {
      g.fillStyle = 'rgba(90,0,8,0.85)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${150 + Math.random() * 80},${10 + Math.random() * 20},20,${0.3 + Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 20 + Math.random() * 60); }
    }, [3, 1]);
    this.fallTex = fallTex;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
    fall.position.set(52, 5.4, 65.85); fall.rotation.y = Math.PI; this.add(fall);
    const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff6a5a, transparent: true, opacity: 0.35, depthWrite: false }));
    mist.scale.set(14, 4, 1); mist.position.set(52, 0.4, 64.5); this.add(mist);
  }

  buildPlatforms() {
    const top = lam(0x3f8f2c, { flatShading: true }), dirt = lam(0x8a4a1e, { flatShading: true }), dirt2 = lam(0x5e2c10, { flatShading: true });
    for (const p of MAP.props.platforms) {
      const s = p.half * 2;
      const g = new THREE.Group(); g.position.set(p.x, p.top, p.z);
      const grass = new THREE.Mesh(new THREE.BoxGeometry(s + 0.2, 0.45, s + 0.2), top); grass.position.y = -0.22; g.add(grass);
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(p.half * 1.25 * (1 - k * 0.28), p.half * 1.25 * (1 - (k + 1) * 0.28), 1.1, 8), k % 2 ? dirt2 : dirt);
        band.position.y = -0.45 - 0.55 - k * 1.1; band.rotation.y = Math.PI / 8; g.add(band);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.add(g);
    }
  }

  buildSprings() {
    this.springs = MAP.SPRINGS.map((s) => {
      const g = new THREE.Group(); g.position.set(s.x, s.y, s.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.3, 16), lam(0x2a2a30)); base.position.y = 0.15; g.add(base);
      const coil = new THREE.Group(); g.add(coil);
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 16), lam(0xb8bcc8)); t.rotation.x = Math.PI / 2; t.position.y = 0.4 + i * 0.16; coil.add(t); }
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 16), lam(0xd8262a)); pad.position.y = 0.9; g.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd23d })); ring.rotation.x = Math.PI / 2; ring.position.y = 1.01; g.add(ring);
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.9, 24), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; g.add(glow);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.add(g);
      return { g, coil, pad, ring, kick: 0 };
    });
  }

  kickSpring(i) { const s = this.springs[i]; if (s) s.kick = 1; }

  buildLoops() {
    const bandTex = tex(256, 32, (g, w, h) => {
      for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? '#8a3a14' : '#b8561c'; g.fillRect(x, 0, 32, h); }
      g.fillStyle = '#ff2a10'; g.fillRect(0, h / 2 - 2, w, 4);
    }, [24, 1]);
    for (const l of MAP.props.loops) {
      const y = terrainH(l.x, l.z);
      const m = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.75, 10, 72), lam(0xffffff, { map: bandTex }));
      m.position.set(l.x, y + 6.5 - 0.5, l.z); m.rotation.y = l.a; m.castShadow = true;
      this.add(m);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 1.8), lam(0x3a2a2a));
        post.position.set(l.x + Math.cos(l.a) * s * 0.0, y + 0.2, l.z); post.rotation.y = l.a; this.add(post);
      }
    }
  }

  // ---------------------------------------------------------------- nature
  buildNature() {
    const P = MAP.props, dummy = new THREE.Object3D(), color = new THREE.Color();
    // palm trunks
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.42, 1, 7, 4); trunkGeo.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, lam(0xffffff, { map: tex(32, 64, (g, w, h) => { for (let y = 0; y < h; y += 8) { g.fillStyle = (y / 8) % 2 ? '#7a5030' : '#5a3820'; g.fillRect(0, y, w, 8); } }, [1, 6]) }), P.palms.length);
    const leafGeo = new THREE.PlaneGeometry(0.9, 3.4, 1, 6); leafGeo.translate(0, 1.7, 0); leafGeo.rotateX(-Math.PI / 2);
    { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) { const zz = -p.getZ(i); p.setY(i, -zz * zz * 0.11); p.setX(i, p.getX(i) * (1 - zz / 4.2)); } leafGeo.computeVertexNormals(); }
    const leaves = new THREE.InstancedMesh(leafGeo, lam(0xffffff, { side: THREE.DoubleSide }), P.palms.length * 7);
    let li = 0;
    P.palms.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.2, p.z); dummy.rotation.set(p.lean, p.ry, 0); dummy.scale.set(1, p.h, 1); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      const top = new THREE.Vector3(0, p.h, 0).applyEuler(new THREE.Euler(p.lean, p.ry, 0)).add(new THREE.Vector3(p.x, p.y - 0.2, p.z));
      for (let k = 0; k < 7; k++) {
        dummy.position.copy(top); dummy.rotation.set(0, (k / 7) * Math.PI * 2 + p.ry, 0, 'YXZ'); dummy.rotateX(p.dead ? 0.7 : 0.15); dummy.scale.setScalar(p.dead ? 0.85 : 1); dummy.updateMatrix();
        leaves.setMatrixAt(li, dummy.matrix);
        leaves.setColorAt(li, color.set(p.dead ? '#6a4a26' : k % 2 ? '#2f7a26' : '#3e9030'));
        li++;
      }
    });
    trunks.castShadow = leaves.castShadow = true;
    this.add(trunks); this.add(leaves);
    // dead trees: trunk + branches merged into one shape
    const parts = [];
    const cyl = (r0, r1, h, x, y, z, rx, rz) => { const g = new THREE.CylinderGeometry(r0, r1, h, 6); g.translate(0, h / 2, 0); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); parts.push(g.toNonIndexed()); };
    cyl(0.18, 0.4, 1, 0, 0, 0, 0, 0); cyl(0.05, 0.12, 0.45, 0, 0.55, 0, 0.2, 0.9); cyl(0.05, 0.12, 0.4, 0, 0.7, 0, -0.3, -0.8); cyl(0.04, 0.1, 0.35, 0, 0.82, 0, 0.9, 0.2);
    const treeGeo = mergeGeos(parts);
    const trees = new THREE.InstancedMesh(treeGeo, lam(0x2e2422, { flatShading: true }), P.deadTrees.length);
    P.deadTrees.forEach((t, i) => { dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(0, t.ry, 0); dummy.scale.set(t.h * 0.75, t.h, t.h * 0.75); dummy.updateMatrix(); trees.setMatrixAt(i, dummy.matrix); });
    trees.castShadow = true; this.add(trees);
    // rocks
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lam(0x5a4c52, { flatShading: true }), P.rocks.length);
    P.rocks.forEach((r, i) => { dummy.position.set(r.x, r.y + r.h * 0.35, r.z); dummy.rotation.set(0.3, r.ry, 0.2); dummy.scale.set(r.r, r.h * 0.75, r.r * 0.9); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix); });
    rocks.castShadow = rocks.receiveShadow = true; this.add(rocks);
    // sunflowers: stems and (drooping, some staring) heads
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 1, 5).translate(0, 0.5, 0), lam(0x2f6a22), P.flowers.length);
    const headTex = tex(128, 128, (g, w, h) => {
      for (let i = 0; i < 14; i++) { g.save(); g.translate(64, 64); g.rotate((i / 14) * Math.PI * 2); g.fillStyle = i % 2 ? '#ffc21a' : '#ffa80f'; g.beginPath(); g.ellipse(0, -40, 10, 24, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.fillStyle = '#4a2410'; g.beginPath(); g.arc(64, 64, 26, 0, Math.PI * 2); g.fill();
    });
    const eyeTex = tex(128, 128, (g, w, h) => {
      for (let i = 0; i < 14; i++) { g.save(); g.translate(64, 64); g.rotate((i / 14) * Math.PI * 2); g.fillStyle = i % 2 ? '#c8961a' : '#a87010'; g.beginPath(); g.ellipse(0, -40, 10, 24, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.fillStyle = '#2a1008'; g.beginPath(); g.arc(64, 64, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(54, 60, 7, 9, 0, 0, 7); g.ellipse(74, 60, 7, 9, 0, 0, 7); g.fill();
      g.fillStyle = '#ff2020'; g.beginPath(); g.arc(54, 61, 2.5, 0, 7); g.arc(74, 61, 2.5, 0, 7); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(52, 76); g.quadraticCurveTo(64, 84, 76, 76); g.stroke();
    });
    const headGeo = new THREE.PlaneGeometry(0.9, 0.9);
    const heads = new THREE.InstancedMesh(headGeo, lam(0xffffff, { map: headTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), P.flowers.length);
    const eyes = new THREE.InstancedMesh(headGeo, lam(0xffffff, { map: eyeTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), P.flowers.length);
    let ni = 0, ei = 0;
    P.flowers.forEach((f, i) => {
      dummy.position.set(f.x, f.y - 0.05, f.z); dummy.rotation.set(0, f.ry, (f.droop - 0.5) * 0.3); dummy.scale.set(1, f.h, 1); dummy.updateMatrix(); stems.setMatrixAt(i, dummy.matrix);
      const top = new THREE.Vector3(0, f.h, 0).applyEuler(dummy.rotation).add(dummy.position);
      dummy.position.copy(top); dummy.rotation.set(0.3 + f.droop * 1.0, f.ry, 0, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
      if (f.hue < 0.2) eyes.setMatrixAt(ei++, dummy.matrix); else heads.setMatrixAt(ni++, dummy.matrix);
    });
    heads.count = ni; eyes.count = ei;
    this.add(stems); this.add(heads); this.add(eyes);
    // grass tufts
    const tuftTex = tex(64, 64, (g) => { g.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { const x = 6 + i * 6.5; g.beginPath(); g.moveTo(x - 3, 64); g.lineTo(x + (Math.random() - 0.5) * 14, 6 + Math.random() * 22); g.lineTo(x + 3, 64); g.fill(); } });
    const tg = new THREE.PlaneGeometry(1, 0.8); tg.translate(0, 0.4, 0);
    const tg2 = tg.clone().rotateY(Math.PI / 2);
    const tuftGeo = mergeGeos([tg.toNonIndexed(), tg2.toNonIndexed()]);
    const n = this.hi ? P.tufts.length : Math.floor(P.tufts.length * 0.55);
    const tufts = new THREE.InstancedMesh(tuftGeo, lam(0xffffff, { map: tuftTex, alphaTest: 0.5, side: THREE.DoubleSide }), n);
    for (let i = 0; i < n; i++) {
      const t = P.tufts[i];
      dummy.position.set(t.x, t.y - 0.05, t.z); dummy.rotation.set(0, t.ry, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); tufts.setMatrixAt(i, dummy.matrix);
      tufts.setColorAt(i, color.set(t.dead > 0.7 ? '#7a6436' : t.dead > 0.6 ? '#6a1a14' : '#3c8a2a'));
    }
    this.add(tufts);
  }

  buildTotems() {
    const faceTex = (glow) => tex(64, 64, (g, w, h) => {
      g.fillStyle = '#7a4a22'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a1e0c'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
      g.fillStyle = glow ? '#ff1a1a' : '#1a0a04'; g.fillRect(12, 18, 12, 10); g.fillRect(40, 18, 12, 10);
      g.fillStyle = '#1a0a04'; g.fillRect(16, 40, 32, 8); for (let x = 18; x < 46; x += 6) g.fillRect(x, 48, 3, 5);
    });
    const plain = lam(0xffffff, { map: faceTex(false) }), glow = lam(0xffffff, { map: faceTex(true), emissive: 0x330000 });
    const side = lam(0x6a3e1c);
    for (const t of MAP.props.totems) {
      const n = Math.max(2, Math.round(t.h / 1.5));
      for (let k = 0; k < n; k++) {
        const s = 1.25 - (k % 2) * 0.12;
        const m = new THREE.Mesh(new THREE.BoxGeometry(s, t.h / n, s), [side, side, side, side, t.shrine || k === n - 1 ? glow : plain, side]);
        m.position.set(t.x, t.y + (k + 0.5) * (t.h / n), t.z); m.rotation.y = t.ry; m.castShadow = true; this.add(m);
      }
      if (t.shrine) { const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 0.5), side); w.position.set(t.x, t.y + t.h * 0.8, t.z); w.rotation.y = t.ry; this.add(w); }
    }
    const altar = MAP.boxes.find((b) => b.kind === 'altar');
    const am = new THREE.Mesh(new THREE.BoxGeometry(altar.x1 - altar.x0, altar.y1 - altar.y0, altar.z1 - altar.z0), lam(0xffffff, { map: stone('#3a2e34') }));
    am.position.set((altar.x0 + altar.x1) / 2, (altar.y0 + altar.y1) / 2, (altar.z0 + altar.z1) / 2); this.add(am);
    const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff1a0a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    ember.scale.set(3, 3, 1); ember.position.set(HOLLOW.x, altar.y1 + 0.7, HOLLOW.z); this.add(ember); this.altarGlow = ember;
  }

  buildSigns() {
    for (const s of MAP.props.signs) {
      const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = s.ry;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), lam(0x3a2414)); post.position.y = 1.1; g.add(post);
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.35, 0.12), [lam(0x4a2c18), lam(0x4a2c18), lam(0x4a2c18), lam(0x4a2c18), lam(0xffffff, { map: signTex(s.text) }), lam(0x4a2c18)]);
      board.position.y = 2.1; board.rotation.z = (Math.random() - 0.5) * 0.12; board.castShadow = true; g.add(board);
      this.add(g);
    }
  }

  // ---------------------------------------------------------------- exits
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
          vec3 col = mix(closed, opened, open);
          gl_FragColor = vec4(col, edge * (0.35 + open * 0.6) * (0.6 + sw * 0.4) * act); }`,
    });
    this.gates = MAP.props.gates.map((g) => {
      const grp = new THREE.Group(); grp.position.set(g.x, g.y, g.z); grp.rotation.y = g.ry;
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, 1.5), st); p.position.set(s * 3.4, 3.5, 0); p.castShadow = true; grp.add(p); }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.3, 1.7), st); lintel.position.y = 7.6; lintel.castShadow = true; grp.add(lintel);
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 7.2), portalMat()); portal.position.y = 3.6; grp.add(portal);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 160, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      beam.position.y = 80; beam.visible = false; grp.add(beam);
      this.add(grp);
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

  // ---------------------------------------------------------------- shards
  buildShards() {
    this.shardMeshes = [];
    const core = new THREE.OctahedronGeometry(0.45, 0);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group(); g.visible = false;
      const m = new THREE.Mesh(core, new THREE.MeshBasicMaterial({ color: 0xaaf6ff })); m.scale.set(1, 1.6, 1); g.add(m);
      const inner = new THREE.Mesh(core, new THREE.MeshBasicMaterial({ color: 0xffffff })); inner.scale.set(0.45, 0.8, 0.45); g.add(inner);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x6fe8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(3, 3, 1); g.add(halo);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 70, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      beam.position.y = 35; g.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -1.0; g.add(ring);
      this.add(g);
      this.shardMeshes.push({ g, m, halo, beam, ring, prog: 0 });
    }
  }

  setShards(list) {
    this.shardMeshes.forEach((s, i) => {
      const p = list && list[i];
      s.g.visible = !!p;
      if (p) s.g.position.set(p[0], p[1], p[2]);
      s.prog = 0;
    });
  }

  updateShards(takenMask, progress, litMask = 0xff) {
    this.shardMeshes.forEach((s, i) => {
      if (!s.g.position.lengthSq()) return;
      s.g.visible = !(takenMask & (1 << i)) && !!(litMask & (1 << i));
      s.prog = progress[i] || 0;
    });
  }

  // ---------------------------------------------------------------- glitch particles and ash
  buildGlitch() {
    const centers = [[HOLLOW.x, 2, HOLLOW.z, 14], [3, 3, -40, 8], [-22, 4, -26, 9], [40, 3, 8, 9], [-58, 12, -8, 10], [60, 2, -30, 9], [-14, 3, 64, 9], [52, 3, 60, 10], [-70, 3, 40, 9]];
    const n = this.hi ? 320 : 180;
    this.glitch = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: true }), n);
    this.glitchData = [];
    const cols = ['#ff1030', '#000000', '#ffffff', '#ff2a8a', '#8a0010', '#000000'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      const c = centers[i % centers.length];
      this.glitchData.push({ c, x: 0, y: 0, z: 0, s: 0, t: Math.random() });
      this.glitch.setColorAt(i, cols[i % cols.length]);
      this.reGlitch(i);
    }
    this.add(this.glitch);
  }

  reGlitch(i) {
    const d = this.glitchData[i], c = d.c, r = this.r;
    d.x = c[0] + (r() - 0.5) * c[3] * 2; d.z = c[2] + (r() - 0.5) * c[3] * 2;
    d.y = terrainH(d.x, d.z) + 0.3 + r() * 5;
    d.s = 0.08 + r() * 0.3; d.w = r() < 0.12 ? 2 + r() * 2.5 : 1;
    d.t = 0.05 + r() * 0.5;
  }

  buildAsh() {
    const n = this.hi ? 900 : 450, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ash = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc87a6a, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false }));
    this.ash.frustumCulled = false;
    this.add(this.ash);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, camera, focus) {
    this.time += dt;
    const t = this.time;
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.time.value = t;
    this.waterTex.offset.set(t * 0.012, t * 0.02);
    this.fallTex.offset.y = t * 1.3;
    if (this.hi && focus) {
      this.sun.position.copy(focus).addScaledVector(SUN_DIR, 120);
      this.sun.target.position.copy(focus);
    }
    for (const l of this.lamps) {
      const f = Math.random() < 0.04 ? 0.15 : 1;
      if (l.isLight) l.isLight.intensity = (l.isLight.userData.base ??= l.isLight.intensity) * f;
      else l.material.color.setRGB(f, 0.12 * f, 0.06 * f);
    }
    for (const w of this.windows) if (Math.random() < 0.03) w.material.color.setRGB(Math.random() < 0.5 ? 0.05 : 1, 0.25, 0.08);
    this.altarGlow.material.opacity = 0.7 + Math.sin(t * 2.3) * 0.25;
    for (const s of this.springs) {
      s.kick = Math.max(0, s.kick - dt * 3);
      const c = s.kick > 0.66 ? 0.4 : 1 + Math.sin(s.kick * 12) * s.kick * 0.4;
      s.coil.scale.y = c; s.pad.position.y = 0.9 * c; s.ring.position.y = 1.01 * c;
    }
    for (const g of this.gates) g.portal.material.uniforms.time.value = t;
    for (const g of this.gates) if (g.beam.visible) g.beam.material.opacity = 0.18 + Math.sin(t * 3) * 0.05;
    for (const s of this.shardMeshes) {
      if (!s.g.visible) continue;
      const k = 1 + s.prog * 4;
      s.m.rotation.y += dt * (1.2 * k); s.m.position.y = Math.sin(t * 2 + s.g.position.x) * 0.18;
      s.halo.scale.setScalar(2.6 + Math.sin(t * 3 * k) * 0.3 + s.prog * 2);
      s.beam.material.opacity = 0.16 + Math.sin(t * 2.5 + s.g.position.z) * 0.05;
      s.ring.visible = s.prog > 0.01;
      if (s.ring.visible) { s.ring.geometry.dispose(); s.ring.geometry = new THREE.RingGeometry(0.95, 1.15, 32, 1, Math.PI / 2, Math.PI * 2 * s.prog); }
    }
    // glitch particles flicker and jump
    const dummy = World._d || (World._d = new THREE.Object3D());
    for (let i = 0; i < this.glitchData.length; i++) {
      const d = this.glitchData[i];
      d.t -= dt;
      if (d.t <= 0) this.reGlitch(i);
      const on = Math.random() > 0.06;
      dummy.position.set(d.x + (Math.random() < 0.1 ? (Math.random() - 0.5) * 0.6 : 0), d.y, d.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(on ? d.s * d.w : 0.0001, on ? d.s : 0.0001, on ? d.s : 0.0001);
      dummy.updateMatrix();
      this.glitch.setMatrixAt(i, dummy.matrix);
    }
    this.glitch.instanceMatrix.needsUpdate = true;
    // ash drifts down around the camera
    const p = this.ash.geometry.attributes.position, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + Math.sin(t * 0.7 + i) * dt * 0.4, y = p.getY(i) - dt * (0.6 + (i % 5) * 0.12), z = p.getZ(i) + dt * 0.3;
      if (y < cy - 8) y += 30; if (y > cy + 22) y -= 30;
      if (x < cx - 30) x += 60; if (x > cx + 30) x -= 60; if (z < cz - 30) z += 60; if (z > cz + 30) z -= 60;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }
}

/** Merges non-indexed geometries with position/normal/uv into one. */
export function mergeGeos(list) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    if (!list.every((g) => g.attributes[name])) continue;
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(list.reduce((s, g) => s + g.attributes[name].count * size, 0));
    let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

export { SUN_DIR, HALF };
