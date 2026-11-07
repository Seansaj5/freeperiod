// Everything you see except the player cars: sky, elevated highway, city, street lights, traffic.
// The road is built in 160 m chunks ahead of the player and recycled behind.
import * as THREE from 'three';
import { Road, WALL, ROAD_HALF, LANE_W, LANES } from './road.js';
import { trafficNear, KINDS } from './traffic.js';
import { trafficGeometry } from './models.js';
import { rng } from './util.js';

const CHUNK = 160;
const NCH = 8; // chunks alive at once: 1 behind, 7 ahead
const STEP = 4; // metres between road mesh rows
const DECK_Y = 0; // road surface height
const GROUND_Y = -34;

export class World {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b1224, 70, 640);
    this.scene.background = new THREE.Color(0x0b1224);
    this.road = null;
    this.chunks = new Map();
    this.traffic = [];
    this.trafficCount = 0;
    this._v = {};
    this.buildLights();
    this.buildSky();
    this.buildMaterials();
    this.buildInstanced();
    this.buildTraffic();
  }

  /** Start (or restart) on a road. Same seed = same road and traffic. */
  setSeed(seed, density = 1) {
    if (this.road && this.road.seed === seed) { this.density = density; return; }
    for (const c of this.chunks.values()) this.freeChunk(c);
    this.chunks.clear();
    this.seed = seed;
    this.density = density;
    this.road = new Road(seed);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x7a8fcc, 0x2a1e16, 1.2));
    const moon = new THREE.DirectionalLight(0xa8bcff, 0.55);
    moon.position.set(-60, 120, -40);
    this.scene.add(moon);
  }

  buildSky() {
    // gradient dome with a warm city glow at the horizon and stars up high
    const geo = new THREE.SphereGeometry(1500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float y = vP.y;
          vec3 top = vec3(0.016,0.024,0.07), mid = vec3(0.05,0.07,0.16), glow = vec3(0.32,0.17,0.2);
          vec3 c = mix(mid, top, smoothstep(0.02, 0.55, y));
          c = mix(c, glow, smoothstep(0.16, -0.02, y) * 0.75);
          vec3 q = floor(vP * 420.0);
          float st = step(0.9975, h(q)) * smoothstep(0.12, 0.5, y);
          c += st * vec3(0.8,0.85,1.0) * (0.5 + 0.5 * h(q + 3.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    // moon
    const moon = new THREE.Mesh(new THREE.CircleGeometry(24, 32), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
    this.moon = moon;
    this.scene.add(moon);
    // far ground under the elevated road
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: 0x07090f }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = GROUND_Y;
    this.scene.add(this.ground);
  }

  buildMaterials() {
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    // asphalt with lane markings painted in: u runs across the road, v along it (repeats every 12 m)
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#2a2d33'; x.fillRect(0, 0, 512, 256);
    const r = rng(7);
    for (let i = 0; i < 9000; i++) { const g = 30 + r() * 40; x.fillStyle = `rgba(${g},${g},${g + 4},0.5)`; x.fillRect(r() * 512, r() * 256, 1.5, 1.5); }
    const total = WALL * 2 + 0.6, px = (m) => ((m + WALL + 0.3) / total) * 512;
    // tyre tracks darken the middle of each lane
    for (let l = 0; l < LANES; l++) {
      const cx = px(-ROAD_HALF + LANE_W * (l + 0.5));
      x.fillStyle = 'rgba(10,10,14,0.28)'; x.fillRect(cx - 16, 0, 9, 256); x.fillRect(cx + 7, 0, 9, 256);
    }
    x.fillStyle = '#e9e6da';
    x.fillRect(px(-ROAD_HALF) - 2, 0, 4, 256); x.fillRect(px(ROAD_HALF) - 2, 0, 4, 256); // edge lines
    for (let l = 1; l < LANES; l++) x.fillRect(px(-ROAD_HALF + LANE_W * l) - 2, 0, 4, 85); // dashes: 4 m on, 8 m off
    this.roadTex = new THREE.CanvasTexture(c);
    this.roadTex.wrapT = THREE.RepeatWrapping;
    this.roadTex.anisotropy = aniso;
    this.roadTex.colorSpace = THREE.SRGBColorSpace;
    this.matRoad = new THREE.MeshLambertMaterial({ map: this.roadTex, emissive: 0xffffff, emissiveMap: this.roadTex, emissiveIntensity: 0.06 });
    this.matConcrete = new THREE.MeshLambertMaterial({ color: 0x6b6f78, side: THREE.DoubleSide });
    this.matDeck = new THREE.MeshLambertMaterial({ color: 0x2c3039 });
    this.matRail = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  }

  buildInstanced() {
    const per = Math.ceil(CHUNK / 40) + 1; // things every 40 m
    const cap = (k) => NCH * per * k;
    const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = n; m.frustumCulled = false; this.scene.add(m); hideAll(m); return m; };
    // pillars under the deck
    this.pillars = mk(new THREE.BoxGeometry(3.2, 1, 2.2), this.matDeck, cap(1));
    // street lights: pole, arm, glowing head, and a pool of light on the road
    this.poles = mk(new THREE.CylinderGeometry(0.12, 0.16, 11, 6), new THREE.MeshLambertMaterial({ color: 0x3a3f4a }), cap(2));
    this.heads = mk(new THREE.BoxGeometry(3.4, 0.2, 0.55), new THREE.MeshBasicMaterial({ color: 0xffd28a }), cap(2));
    const poolTex = radialTexture('rgba(255,190,110,0.55)');
    this.pools = mk(new THREE.PlaneGeometry(12, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), cap(2));
    // buildings: three shapes sharing one lit-window texture
    const winTex = windowTexture();
    winTex.anisotropy = 4;
    const bmat = new THREE.MeshLambertMaterial({ color: 0x141924, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.95 });
    bmat.map = null;
    const nb = this.quality === 'low' ? 4 : 7;
    this.bPer = nb;
    this.buildings = [[22, 70, 22], [34, 46, 26], [16, 110, 18]].map(([w, h, d]) => mk(boxWithTiledUV(w, h, d), bmat, NCH * nb * 2));
    // overhead sign gantries: one per chunk, sign faces chosen from a few prebuilt textures
    this.signTex = ['HARBOR', 'AIRPORT', 'DOWNTOWN', 'BAYSIDE', 'TUNNEL 2', 'NORTH LOOP'].map((t, i) => signTexture(t, 10 + i * 3));
    this.signMats = this.signTex.map((t) => new THREE.MeshBasicMaterial({ map: t, color: 0xbfc7c0 }));
    this.matSignFrame = new THREE.MeshLambertMaterial({ color: 0x4a505c });
  }

  buildTraffic() {
    this.tGroup = new THREE.Group();
    this.scene.add(this.tGroup);
    const litMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.tMeshes = KINDS.map((k) => {
      const g = trafficGeometry(k.id);
      const n = 60;
      const lit = new THREE.InstancedMesh(g.lit, litMat, n);
      lit.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      const head = new THREE.InstancedMesh(g.head, glowMat, n);
      const tail = new THREE.InstancedMesh(g.tail, glowMat, n);
      for (const m of [lit, head, tail]) { m.count = 0; m.frustumCulled = false; this.tGroup.add(m); }
      return { lit, head, tail, n };
    });
    this.tShadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.8)'), transparent: true, depthWrite: false }), 240);
    this.tShadow.count = 0; this.tShadow.frustumCulled = false;
    this.tGroup.add(this.tShadow);
  }

  // ---------- chunks ----------

  /** Keep chunks around s; returns nothing. Call every frame with the camera target's s. */
  updateChunks(s) {
    const first = Math.floor(s / CHUNK) - 1;
    for (const [i, c] of this.chunks) if (i < first || i >= first + NCH) { this.freeChunk(c); this.chunks.delete(i); }
    for (let i = first; i < first + NCH; i++) if (i >= 0 && !this.chunks.has(i)) this.chunks.set(i, this.makeChunk(i));
  }

  freeChunk(c) {
    for (const m of c.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    const slot = c.slot;
    const per = Math.ceil(CHUNK / 40) + 1;
    for (let j = 0; j < per; j++) hideOne(this.pillars, slot * per + j);
    for (let j = 0; j < per * 2; j++) { hideOne(this.poles, slot * per * 2 + j); hideOne(this.heads, slot * per * 2 + j); hideOne(this.pools, slot * per * 2 + j); }
    for (const b of this.buildings) for (let j = 0; j < this.bPer * 2; j++) hideOne(b, slot * this.bPer * 2 + j);
    for (const m of [this.pillars, this.poles, this.heads, this.pools, ...this.buildings]) m.instanceMatrix.needsUpdate = true;
  }

  makeChunk(i) {
    const road = this.road;
    const s0 = i * CHUNK, s1 = s0 + CHUNK;
    road.ensure(s1 + 2);
    const base = road.center(s0, {});
    const meshes = [];
    const rows = CHUNK / STEP + 1;
    const p = {};
    // --- road surface ---
    {
      const pos = new Float32Array(rows * 2 * 3), uv = new Float32Array(rows * 2 * 2), idx = [];
      const edge = WALL + 0.3;
      for (let r = 0; r < rows; r++) {
        const s = s0 + r * STEP;
        for (let k = 0; k < 2; k++) {
          road.toWorld(s, k ? edge : -edge, p);
          const o = (r * 2 + k) * 3;
          pos[o] = p.x - base.x; pos[o + 1] = DECK_Y; pos[o + 2] = p.z - base.z;
          uv[(r * 2 + k) * 2] = k; uv[(r * 2 + k) * 2 + 1] = s / 12;
        }
        if (r) { const a = (r - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      fixUp(g);
      meshes.push(new THREE.Mesh(g, this.matRoad));
    }
    // --- jersey barriers, deck edge and amber rail lights (both sides) ---
    {
      // cross-section (d offset from the barrier face outward, y), barrier then deck underside
      const prof = [[0, 0], [0.18, 0.32], [0.26, 1.0], [0.55, 1.0], [0.6, -1.6]];
      const bar = [], railPts = [];
      for (const side of [-1, 1]) {
        const ring = [];
        for (let r = 0; r < rows; r++) {
          const s = s0 + r * STEP;
          const pts = prof.map(([dd, y]) => { road.toWorld(s, side * (WALL + dd), p); return [p.x - base.x, DECK_Y + y, p.z - base.z]; });
          ring.push(pts);
          road.toWorld(s, side * (WALL + 0.27), p);
          railPts.push([p.x - base.x, DECK_Y + 1.02, p.z - base.z, side]);
        }
        for (let r = 1; r < rows; r++) for (let k = 0; k < prof.length - 1; k++) {
          const a = ring[r - 1][k], b = ring[r][k], c = ring[r][k + 1], d = ring[r - 1][k + 1];
          if (side > 0) bar.push(a, b, c, a, c, d); else bar.push(a, c, b, a, d, c);
        }
      }
      meshes.push(triMesh(bar, this.matConcrete));
      // thin glowing strip on top of each barrier
      const rail = [];
      for (const side of [-1, 1]) {
        const pts = railPts.filter((q) => q[3] === side);
        for (let r = 1; r < pts.length; r++) {
          const a = pts[r - 1], b = pts[r];
          const a2 = [a[0], a[1] + 0.06, a[2]], b2 = [b[0], b[1] + 0.06, b[2]];
          rail.push(a, b, b2, a, b2, a2, a, b2, b, a, a2, b2);
        }
      }
      meshes.push(triMesh(rail.map((q) => q.slice(0, 3)), this.matRail));
    }
    // --- overhead sign gantry every other chunk ---
    if (i % 2 === 1) {
      const s = s0 + CHUNK * 0.5;
      road.center(s, p);
      const g = new THREE.Group();
      const frame = this.matSignFrame;
      const span = WALL * 2 + 1.4;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.5, 0.5), frame); beam.position.y = 7.4; g.add(beam);
      for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7.6, 0.45), frame); leg.position.set(sx * span / 2, 3.8, 0); g.add(leg); }
      const which = Math.floor(rng(i * 13 + this.seed)() * this.signMats.length);
      for (const [sx, m] of [[-3.8, which], [3.8, (which + 1) % this.signMats.length]]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.6), this.signMats[m]);
        sign.position.set(sx, 7.4, -0.3); sign.rotation.y = Math.PI; g.add(sign);
      }
      g.position.set(p.x - base.x, DECK_Y, p.z - base.z);
      g.rotation.y = p.h;
      // flatten the gantry into one mesh per material would be nicer; a few meshes per chunk is fine
      for (const m of g.children) { m.updateMatrix(); }
      g.updateMatrixWorld(true);
      g.children.slice().forEach((m) => { m.geometry = m.geometry.clone().applyMatrix4(m.matrixWorld); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); m.updateMatrix(); meshes.push(m); });
    }
    for (const m of meshes) { m.position.set(base.x, 0, base.z); m.matrixAutoUpdate = false; m.updateMatrix(); this.scene.add(m); }

    // --- instanced scenery in this chunk's ring slot ---
    const slot = ((i % NCH) + NCH) % NCH;
    const per = Math.ceil(CHUNK / 40) + 1;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const put = (mesh, j, x, y, z, rotY, sx, sy, sz) => { Q.setFromAxisAngle(Y, rotY); V.set(x, y, z); S.set(sx, sy, sz); M.compose(V, Q, S); mesh.setMatrixAt(j, M); };
    for (let j = 0; j < per; j++) {
      const s = s0 + j * 40 + 10;
      if (s >= s1) { hideOne(this.pillars, slot * per + j); continue; }
      road.center(s, p);
      put(this.pillars, slot * per + j, p.x, (GROUND_Y + DECK_Y - 1.6) / 2, p.z, p.h, 1, -(GROUND_Y) - 1.6, 1);
    }
    for (let j = 0; j < per; j++) {
      for (const side of [-1, 1]) {
        const k = slot * per * 2 + j * 2 + (side > 0 ? 1 : 0);
        const s = s0 + j * 40 + (side > 0 ? 20 : 0);
        if (s >= s1) { hideOne(this.poles, k); hideOne(this.heads, k); hideOne(this.pools, k); continue; }
        road.toWorld(s, side * (WALL + 0.45), p);
        put(this.poles, k, p.x, DECK_Y + 6.5, p.z, p.h, 1, 1, 1);
        road.toWorld(s, side * (WALL - 1.0), p);
        put(this.heads, k, p.x, DECK_Y + 11.9, p.z, p.h, 1, 1, 1);
        road.toWorld(s, side * (WALL - 3.2), p);
        put(this.pools, k, p.x, DECK_Y + 0.03, p.z, p.h, 1, 1, 1);
      }
    }
    const r = rng(i * 7919 + this.seed * 31);
    this.buildings.forEach((mesh) => {
      for (let j = 0; j < this.bPer * 2; j++) {
        const k = slot * this.bPer * 2 + j;
        if (r() < 0.45) { hideOne(mesh, k); continue; }
        const side = j % 2 ? 1 : -1;
        const s = s0 + r() * CHUNK;
        road.toWorld(s, side * (52 + r() * 140), p);
        put(mesh, k, p.x, GROUND_Y, p.z, p.h + (r() - 0.5) * 0.4, 0.8 + r() * 0.5, 0.6 + r() * 0.8, 0.8 + r() * 0.5);
      }
    });
    for (const m of [this.pillars, this.poles, this.heads, this.pools, ...this.buildings]) m.instanceMatrix.needsUpdate = true;
    return { meshes, slot };
  }

  // ---------- traffic ----------

  /** Draw traffic near s at time t. Returns the list (also kept on this.traffic / this.trafficCount). */
  updateTraffic(t, s, skipMask = 0) {
    const n = trafficNear(this.seed, this.density, t, s - 120, s + 560, this.traffic, skipMask);
    this.trafficCount = n;
    // place instances relative to a local origin so far-away coordinates do not jitter
    const o = this.road.center(s, this._v);
    const ox = o.x, oz = o.z;
    this.tGroup.position.set(ox, 0, oz);
    for (const m of this.tMeshes) m.used = 0;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), S2 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
    const p = {};
    let sh = 0;
    for (let i = 0; i < n; i++) {
      const c = this.traffic[i];
      const m = this.tMeshes[c.kind];
      if (m.used >= m.n) continue;
      this.road.toWorld(c.s, c.d, p);
      Q.setFromAxisAngle(Y, p.h);
      V.set(p.x - ox, DECK_Y, p.z - oz);
      M.compose(V, Q, S1);
      m.lit.setMatrixAt(m.used, M); m.head.setMatrixAt(m.used, M); m.tail.setMatrixAt(m.used, M);
      m.lit.setColorAt(m.used, C.setHex(c.color));
      m.used++;
      if (sh < 240) { V.y = DECK_Y + 0.025; M.compose(V, Q, S2.set(c.hw * 2 + 0.6, 1, c.hl * 2 + 0.8)); this.tShadow.setMatrixAt(sh++, M); }
    }
    for (const m of this.tMeshes) {
      for (const im of [m.lit, m.head, m.tail]) { im.count = m.used; im.instanceMatrix.needsUpdate = true; }
      if (m.lit.instanceColor) m.lit.instanceColor.needsUpdate = true;
    }
    this.tShadow.count = sh; this.tShadow.instanceMatrix.needsUpdate = true;
    return this.traffic;
  }

  /** Keep sky, moon and ground centred on the camera. */
  follow(cam) {
    this.sky.position.copy(cam.position);
    this.moon.position.set(cam.position.x + 300, cam.position.y + 560, cam.position.z + 850);
    this.moon.lookAt(cam.position);
    this.ground.position.x = cam.position.x; this.ground.position.z = cam.position.z;
  }
}

// ---------- helpers ----------

function hideAll(m) { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < m.count; i++) m.setMatrixAt(i, z); m.instanceMatrix.needsUpdate = true; }
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function hideOne(m, i) { if (i < m.count) m.setMatrixAt(i, ZERO); }

function triMesh(tris, mat) {
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => { pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** Make sure a flat road strip faces up (winding depends on the road's direction). */
function fixUp(g) {
  const n = g.getAttribute('normal');
  if (n.count && n.getY(0) < 0) {
    const idx = g.getIndex().array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.getIndex().needsUpdate = true;
    g.computeVertexNormals();
  }
}

function radialTexture(inner) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
  const r = rng(99);
  const cols = ['#ffd58a', '#fff1c9', '#9fe7ff', '#ffb36b', '#e9f0ff'];
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 6; gx++) {
    if (r() < 0.45) continue;
    x.globalAlpha = 0.35 + r() * 0.65;
    x.fillStyle = cols[Math.floor(r() * cols.length)];
    x.fillRect(gx * 21 + 4, gy * 16 + 4, 13, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Box whose side UVs repeat with the wall size, so windows keep their size on any building. */
function boxWithTiledUV(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const uv = g.getAttribute('uv');
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    const [a, b] = dims[f];
    uv.setXY(i, a ? uv.getX(i) * a / 21 : 0.01, b ? uv.getY(i) * b / 28 : 0.01); // 3.5 m floors and bays
  }
  return g;
}

function signTexture(text, exit) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 112;
  const x = c.getContext('2d');
  x.fillStyle = '#0f6b3a'; x.fillRect(0, 0, 256, 112);
  x.strokeStyle = '#e8f0e8'; x.lineWidth = 4; x.strokeRect(6, 6, 244, 100);
  x.fillStyle = '#f4f7f2';
  x.font = 'bold 34px system-ui, sans-serif'; x.textAlign = 'center';
  x.fillText(text, 128, 62);
  x.font = 'bold 18px system-ui, sans-serif';
  x.fillText(`EXIT ${exit}  ↑`, 128, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
