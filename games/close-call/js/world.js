// Everything you see except the player cars: sky, skyline, elevated highway, city, street lights, traffic.
// The road is built in 160 m chunks ahead of the player and recycled behind.
import * as THREE from 'three';
import { Road, WALL, ROAD_HALF, LANE_W, LANES } from './road.js';
import { trafficNear, KINDS } from './traffic.js';
import { trafficGeometry, slotMaterials, lightMaterial, glowMaterial, setCarLook, PAINT } from './models.js';
import { rng } from './util.js';

const CHUNK = 160;
const NCH = 8; // chunks alive at once: 1 behind, 7 ahead
const STEP = 4; // metres between road mesh rows
const DECK_Y = 0; // road surface height
const GROUND_Y = -34;
const LAMP_GAP = 20; // a street light every 20 m, alternating sides (left on multiples of 40)
const LAMP_IN = 2.6; // how far the lamp head reaches in over the road from the barrier
const LAMP_Y = 11.6;

export class World {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.hi = quality === 'high';
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0d1226, 80, 700);
    this.scene.background = new THREE.Color(0x0b1224);
    this.road = null;
    this.chunks = new Map();
    this.traffic = [];
    this.trafficCount = 0;
    this._v = {};
    this.env = this.hi ? buildEnv(renderer) : null;
    setCarLook(this.env, this.hi);
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
    this.scene.add(new THREE.HemisphereLight(0x7a8fcc, 0x2a1e16, 1.15));
    const moon = new THREE.DirectionalLight(0xa8bcff, 0.5);
    moon.position.set(-60, 120, -40);
    this.scene.add(moon);
    // three warm lights that ride along the street lights nearest the player, so cars and road
    // brighten as they pass under each lamp (high quality only: every light costs every pixel)
    this.lamps = [];
    if (this.hi) for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffc27a, 24, 30, 1.3); this.scene.add(l); this.lamps.push(l); }
  }

  buildSky() {
    // gradient dome: warm city glow at the horizon, thin clouds lit from below, stars up high
    const geo = new THREE.SphereGeometry(1500, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uT: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform float uT;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float y = vP.y;
          vec3 top = vec3(0.012,0.02,0.06), mid = vec3(0.045,0.06,0.15), glow = vec3(0.36,0.18,0.2);
          vec3 c = mix(mid, top, smoothstep(0.02, 0.55, y));
          c = mix(c, glow, smoothstep(0.18, -0.02, y) * 0.8);
          // clouds: noise on a flat layer above, brightest near the horizon where the city lights them
          vec2 q = vP.xz / max(y + 0.08, 0.05) * 1.6 + vec2(uT * 0.004, 0.0);
          float cl = n2(q) * 0.55 + n2(q * 2.3) * 0.3 + n2(q * 5.1) * 0.15;
          cl = smoothstep(0.52, 0.85, cl) * smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.35, 0.8, y));
          c = mix(c, vec3(0.22,0.14,0.18) + glow * 0.25, cl * 0.55);
          vec3 s = floor(vP * 420.0);
          float st = step(0.9975, h(s)) * smoothstep(0.14, 0.5, y) * (1.0 - cl);
          c += st * vec3(0.8,0.85,1.0) * (0.5 + 0.5 * h(s + 3.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    // far skyline: a ring of building silhouettes with lit windows, just inside the sky
    const sk = skylineTexture();
    sk.wrapS = THREE.RepeatWrapping; sk.repeat.x = 3;
    this.skyline = new THREE.Mesh(new THREE.CylinderGeometry(1300, 1300, 300, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: sk, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.skyline.renderOrder = -1;
    this.scene.add(this.skyline);
    // moon with a soft halo
    const moon = new THREE.Group();
    moon.add(new THREE.Mesh(new THREE.CircleGeometry(24, 32), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false })));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(150,170,255,0.35)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    halo.position.z = -1;
    moon.add(halo);
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
    const { map, glow } = roadTextures();
    for (const t of [map, glow]) { t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.colorSpace = THREE.SRGBColorSpace; }
    this.roadTex = map;
    this.matRoad = this.hi
      ? new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.6 })
      : new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.2 });
    this.matConcrete = new THREE.MeshLambertMaterial({ color: 0x6b6f78, side: THREE.DoubleSide });
    this.matDeck = new THREE.MeshLambertMaterial({ color: 0x2c3039 });
    this.matRail = new THREE.MeshBasicMaterial({ color: this.hi ? new THREE.Color(1.15, 0.62, 0.22) : 0xffb347 });
  }

  buildInstanced() {
    const per = Math.ceil(CHUNK / 40) + 1; // things every 40 m
    const cap = (k) => NCH * per * k;
    const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = n; m.frustumCulled = false; this.scene.add(m); hideAll(m); return m; };
    // pillars under the deck
    this.pillars = mk(new THREE.BoxGeometry(3.2, 1, 2.2), this.matDeck, cap(1));
    // street lights: pole with an arm reaching over the road (+x), a glowing head, and a pool of light on the road
    const poleGeo = mergeGeos([
      new THREE.CylinderGeometry(0.11, 0.17, LAMP_Y + 0.4, 8).translate(0, (LAMP_Y + 0.4) / 2, 0),
      new THREE.CylinderGeometry(0.07, 0.07, LAMP_IN + 0.3, 6).rotateZ(Math.PI / 2 - 0.08).translate((LAMP_IN + 0.3) / 2, LAMP_Y + 0.35, 0),
      new THREE.BoxGeometry(1.1, 0.22, 0.5).translate(LAMP_IN, LAMP_Y + 0.12, 0),
      new THREE.BoxGeometry(0.6, 0.5, 0.6).translate(0, 0.25, 0),
    ]);
    this.poles = mk(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f4a }), cap(2));
    this.heads = mk(new THREE.BoxGeometry(0.95, 0.06, 0.4).translate(LAMP_IN, LAMP_Y - 0.01, 0), new THREE.MeshBasicMaterial({ color: this.hi ? new THREE.Color(3, 2.3, 1.4) : 0xffd28a }), cap(2));
    const poolTex = radialTexture('rgba(255,190,110,0.5)');
    this.pools = mk(new THREE.PlaneGeometry(13, 17).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), cap(2));
    // a soft glow round each lamp head, seen from below
    this.halos = mk(new THREE.PlaneGeometry(4.2, 4.2).rotateX(Math.PI / 2).translate(LAMP_IN, LAMP_Y - 0.08, 0),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,200,130,0.55)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), cap(2));
    // buildings: three shapes sharing one lit-window texture, red beacons on the tall ones
    const winTex = windowTexture();
    winTex.anisotropy = 4;
    const bmat = new THREE.MeshLambertMaterial({ color: 0x121722, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: this.hi ? 1.0 : 0.95 });
    const nb = this.quality === 'low' ? 4 : 7;
    this.bPer = nb;
    this.bShapes = [[22, 70, 22], [34, 46, 26], [16, 110, 18]];
    this.buildings = this.bShapes.map(([w, h, d]) => mk(boxWithTiledUV(w, h, d), bmat, NCH * nb * 2));
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false });
    this.beacons = mk(new THREE.BoxGeometry(1.4, 1.4, 1.4), this.beaconMat, NCH * nb * 2);
    // overhead sign gantries: one every other chunk, sign faces chosen from a few prebuilt textures
    this.signTex = ['HARBOR', 'AIRPORT', 'DOWNTOWN', 'BAYSIDE', 'TUNNEL 2', 'NORTH LOOP', 'STADIUM', 'OLD TOWN'].map((t, i) => signTexture(t, 10 + i * 3));
    this.signMats = this.signTex.map((t) => new THREE.MeshBasicMaterial({ map: t, color: 0xc8d0c8 }));
    this.matSignFrame = new THREE.MeshLambertMaterial({ color: 0x4a505c });
    this.matSignLamp = new THREE.MeshBasicMaterial({ color: this.hi ? new THREE.Color(2.2, 2.0, 1.6) : 0xfff0d0 });
  }

  buildTraffic() {
    this.tGroup = new THREE.Group();
    this.scene.add(this.tGroup);
    const mats = slotMaterials(null, true);
    const head = lightMaterial(this.hi ? 2.2 : 1), tail = lightMaterial(this.hi ? 1.5 : 0.9);
    const headGlow = glowMaterial(0.55), tailGlow = glowMaterial(this.hi ? 0.5 : 0.75);
    this.tMeshes = KINDS.map((k) => {
      const g = trafficGeometry(k.id);
      const n = 60;
      const list = [];
      let paint = null, matrix = null;
      const add = (geo, mat) => {
        if (!geo) return null;
        const m = new THREE.InstancedMesh(geo, mat, n);
        if (matrix) m.instanceMatrix = matrix; else matrix = m.instanceMatrix; // one matrix buffer per kind, shared by every part
        m.count = 0; m.frustumCulled = false;
        this.tGroup.add(m); list.push(m);
        return m;
      };
      g.parts.forEach((geo, i) => { const m = add(geo, mats[i]); if (i === PAINT) { paint = m; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); } });
      add(g.head, head); add(g.tail, tail); add(g.headGlow, headGlow); add(g.tailGlow, tailGlow);
      return { list, paint, matrix, n };
    });
    this.tShadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.85)'), transparent: true, depthWrite: false }), 240);
    this.tShadow.count = 0; this.tShadow.frustumCulled = false;
    this.tGroup.add(this.tShadow);
  }

  // ---------- chunks ----------

  /** Keep chunks around s. Call every frame with the camera target's s. */
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
    for (let j = 0; j < per * 2; j++) for (const m of [this.poles, this.heads, this.pools, this.halos]) hideOne(m, slot * per * 2 + j);
    for (const b of [...this.buildings, this.beacons]) for (let j = 0; j < this.bPer * 2; j++) hideOne(b, slot * this.bPer * 2 + j);
    for (const m of [this.pillars, this.poles, this.heads, this.pools, this.halos, this.beacons, ...this.buildings]) m.instanceMatrix.needsUpdate = true;
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
      const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); };
      add(new THREE.BoxGeometry(span, 0.5, 0.5), frame, 0, 7.4, 0);
      add(new THREE.BoxGeometry(span, 0.25, 0.25), frame, 0, 8.6, 0.1);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.45, 8.8, 0.45), frame, sx * span / 2, 4.4, 0);
      const which = Math.floor(rng(i * 13 + this.seed)() * this.signMats.length);
      for (const [sx, m] of [[-3.8, which], [3.8, (which + 1) % this.signMats.length]]) {
        add(new THREE.PlaneGeometry(6, 2.6), this.signMats[m], sx, 7.6, -0.3, Math.PI);
        add(new THREE.BoxGeometry(5.6, 0.08, 0.18), this.matSignLamp, sx, 6.2, -0.55); // lamps lighting the sign
      }
      g.position.set(p.x - base.x, DECK_Y, p.z - base.z);
      g.rotation.y = p.h;
      g.updateMatrixWorld(true);
      g.children.slice().forEach((m) => { m.geometry = m.geometry.clone().applyMatrix4(m.matrixWorld); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.updateMatrix(); meshes.push(m); });
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
        if (s >= s1) { for (const m of [this.poles, this.heads, this.pools, this.halos]) hideOne(m, k); continue; }
        // the arm points along local +x; turn it to reach in over the road
        road.toWorld(s, side * (WALL + 0.45), p);
        const rot = p.h + (side > 0 ? 0 : Math.PI);
        for (const m of [this.poles, this.heads, this.halos]) put(m, k, p.x, DECK_Y, p.z, rot, 1, 1, 1);
        road.toWorld(s, side * (WALL + 0.45 - LAMP_IN), p);
        put(this.pools, k, p.x, DECK_Y + 0.03, p.z, p.h, 1, 1, 1);
      }
    }
    const r = rng(i * 7919 + this.seed * 31);
    this.buildings.forEach((mesh, bi) => {
      for (let j = 0; j < this.bPer * 2; j++) {
        const k = slot * this.bPer * 2 + j;
        if (r() < 0.45) { hideOne(mesh, k); if (bi === 2) hideOne(this.beacons, k); continue; }
        const side = j % 2 ? 1 : -1;
        const s = s0 + r() * CHUNK;
        road.toWorld(s, side * (52 + r() * 140), p);
        const rot = p.h + (r() - 0.5) * 0.4, sx = 0.8 + r() * 0.5, sy = 0.6 + r() * 0.8, sz = 0.8 + r() * 0.5;
        put(mesh, k, p.x, GROUND_Y, p.z, rot, sx, sy, sz);
        if (bi === 2) put(this.beacons, k, p.x, GROUND_Y + this.bShapes[2][1] * sy + 0.7, p.z, rot, 1, 1, 1);
      }
    });
    for (const m of [this.pillars, this.poles, this.heads, this.pools, this.halos, this.beacons, ...this.buildings]) m.instanceMatrix.needsUpdate = true;
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
      M.toArray(m.matrix.array, m.used * 16);
      m.paint.setColorAt(m.used, C.setHex(c.color));
      m.used++;
      if (sh < 240) { V.y = DECK_Y + 0.02; M.compose(V, Q, S2.set(c.hw * 2 + 0.7, 1, c.hl * 2 + 0.9)); this.tShadow.setMatrixAt(sh++, M); }
    }
    for (const m of this.tMeshes) {
      for (const im of m.list) im.count = m.used;
      m.matrix.needsUpdate = true;
      m.paint.instanceColor.needsUpdate = true;
    }
    this.tShadow.count = sh; this.tShadow.instanceMatrix.needsUpdate = true;
    return this.traffic;
  }

  /** Move the lamp lights to the street lights round s; animate the sky and beacons. */
  tick(s, time) {
    this.skyMat.uniforms.uT.value = time;
    const on = Math.sin(time * 3.2) > 0.3 ? (this.hi ? 2.5 : 1) : 0.1;
    this.beaconMat.color.setRGB(on, on * 0.06, on * 0.06);
    if (!this.lamps.length || !this.road) return;
    const k0 = Math.round(s / LAMP_GAP) - 1;
    const p = this._v;
    for (let i = 0; i < 3; i++) {
      const k = k0 + i, side = k % 2 === 0 ? -1 : 1;
      this.road.toWorld(k * LAMP_GAP, side * (WALL + 0.45 - LAMP_IN), p);
      this.lamps[i].position.set(p.x, DECK_Y + LAMP_Y - 0.6, p.z);
    }
  }

  /** Keep sky, skyline, moon and ground centred on the camera. */
  follow(cam) {
    this.sky.position.copy(cam.position);
    this.skyline.position.set(cam.position.x, GROUND_Y + 128, cam.position.z);
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

/** Merge simple geometries (position + normal only). */
function mergeGeos(list) {
  const pos = [], nor = [];
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    pos.push(...g.getAttribute('position').array); nor.push(...g.getAttribute('normal').array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
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

/**
 * Asphalt with lane markings (u across the road, v along it, repeating every 12 m) plus a glow map:
 * faintly lit paint and bright reflective road studs (cat's eyes), which the bloom makes sparkle.
 */
function roadTextures() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const gc = document.createElement('canvas'); gc.width = W; gc.height = H;
  const gx = gc.getContext('2d');
  gx.fillStyle = '#000'; gx.fillRect(0, 0, W, H);
  x.fillStyle = '#272a30'; x.fillRect(0, 0, W, H);
  const r = rng(7);
  // aggregate speckle, then a few darker patch repairs and thin cracks
  for (let i = 0; i < 42000; i++) { const g = 26 + r() * 46; x.fillStyle = `rgba(${g},${g},${g + 5},0.55)`; x.fillRect(r() * W, r() * H, 1.6, 1.6); }
  for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(14,15,18,${0.25 + r() * 0.2})`; x.fillRect(r() * W, r() * H, 60 + r() * 140, 30 + r() * 90); }
  x.strokeStyle = 'rgba(12,12,14,0.55)'; x.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) { x.beginPath(); let px = r() * W, py = r() * H; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 40; py += r() * 30; x.lineTo(px, py); } x.stroke(); }
  const total = WALL * 2 + 0.6, px = (m) => ((m + WALL + 0.3) / total) * W;
  // wheel paths: darker oil-stained bands in each lane
  for (let l = 0; l < LANES; l++) {
    const cx = px(-ROAD_HALF + LANE_W * (l + 0.5));
    for (const off of [-30, 22]) { const g = x.createLinearGradient(cx + off - 8, 0, cx + off + 16, 0); g.addColorStop(0, 'rgba(8,8,12,0)'); g.addColorStop(0.5, 'rgba(8,8,12,0.32)'); g.addColorStop(1, 'rgba(8,8,12,0)'); x.fillStyle = g; x.fillRect(cx + off - 8, 0, 24, H); }
  }
  const paint = (x0, w, y0, h) => {
    x.fillStyle = '#e9e6da'; x.fillRect(x0, y0, w, h);
    for (let i = 0; i < (w * h) / 14; i++) { x.fillStyle = 'rgba(40,42,46,0.5)'; x.fillRect(x0 + r() * w, y0 + r() * h, 1.5, 1.5); } // worn paint
    gx.fillStyle = 'rgb(46,44,40)'; gx.fillRect(x0, y0, w, h);
  };
  const ew = 7;
  paint(px(-ROAD_HALF) - ew / 2, ew, 0, H); paint(px(ROAD_HALF) - ew / 2, ew, 0, H); // edge lines
  for (let l = 1; l < LANES; l++) paint(px(-ROAD_HALF + LANE_W * l) - ew / 2, ew, 0, H / 3); // dashes: 4 m on, 8 m off
  // road studs: white between lanes (in the gaps), amber just inside the edge lines
  const stud = (cx, cy, col) => {
    x.fillStyle = '#6b6e75'; x.fillRect(cx - 6, cy - 5, 12, 10);
    gx.fillStyle = col; gx.fillRect(cx - 4, cy - 3, 8, 6);
  };
  for (let l = 1; l < LANES; l++) stud(px(-ROAD_HALF + LANE_W * l), H * 0.66, '#fff6e0');
  for (const e of [-1, 1]) for (const v of [0.2, 0.7]) stud(px(e * (ROAD_HALF - 0.3)), H * v, '#ffa020');
  const map = new THREE.CanvasTexture(c), glow = new THREE.CanvasTexture(gc);
  return { map, glow };
}

function windowTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  const r = rng(99);
  const cols = ['#ffd58a', '#fff1c9', '#9fe7ff', '#ffb36b', '#e9f0ff', '#ffe2a8'];
  // 12 bays x 16 floors per tile; some floors are dark, some lit floors share one colour (offices)
  for (let gy = 0; gy < 16; gy++) {
    const floorLit = 0.3 + r() * 0.7, office = r() < 0.3 ? cols[Math.floor(r() * cols.length)] : null;
    for (let gx = 0; gx < 12; gx++) {
      if (r() > floorLit * 0.95) continue;
      x.globalAlpha = 0.3 + r() * 0.7;
      x.fillStyle = office || cols[Math.floor(r() * cols.length)];
      x.fillRect(gx * 21.33 + 4, gy * 16 + 4, 13, 9);
      if (r() < 0.25) { x.globalAlpha *= 0.5; x.fillStyle = '#000'; x.fillRect(gx * 21.33 + 4, gy * 16 + 4, 13, 4); } // half-drawn blinds
    }
  }
  x.globalAlpha = 1;
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
  // face order: +x, -x, +y, -y, +z, -z (4 verts each); a tile is 12 bays x 16 floors of 3.5 m
  const dims = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    const [a, b] = dims[f];
    uv.setXY(i, a ? uv.getX(i) * a / 42 : 0.01, b ? uv.getY(i) * b / 56 : 0.01);
  }
  return g;
}

/** Far skyline: dark towers with scattered lit windows and the odd red beacon; transparent sky above. */
function skylineTexture() {
  const W = 2048, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const r = rng(4242);
  const towers = [];
  for (let px = 0; px < W;) { const w = 14 + r() * 46, h = 30 + r() ** 2 * 150; towers.push([px, w, h]); px += w * (0.6 + r() * 0.5); }
  // a hazy back row, then the front row
  for (const [row, shade, k] of [[0, '#0b1020', 1.25], [1, '#05070d', 1]]) {
    for (const [tx, tw, th] of towers) {
      const hh = th * k * (row ? 1 : 0.8 + r() * 0.4), off = row ? 0 : r() * 30;
      x.fillStyle = shade; x.fillRect(tx + off, H - hh, tw, hh);
      if (row) {
        for (let wy = H - hh + 4; wy < H - 2; wy += 5) for (let wx = tx + 2; wx < tx + tw - 2; wx += 4) {
          if (r() < 0.78) continue;
          x.fillStyle = r() < 0.7 ? `rgba(255,${200 + r() * 40},${130 + r() * 60},${0.4 + r() * 0.5})` : `rgba(170,220,255,${0.4 + r() * 0.4})`;
          x.fillRect(wx, wy, 2, 2);
        }
        if (th > 120 && r() < 0.6) { x.fillStyle = '#ff3030'; x.fillRect(tx + tw / 2 - 1.5, H - hh - 3, 3, 3); }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  t.anisotropy = 4;
  return t;
}

/** A small night-city scene rendered once into a reflection map for the car paint and glass. */
function buildEnv(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      float y = vP.y;
      vec3 c = mix(vec3(0.05,0.07,0.16), vec3(0.015,0.02,0.06), smoothstep(0.0, 0.6, y));
      c = mix(c, vec3(0.5,0.26,0.24), smoothstep(0.2, 0.0, y) * smoothstep(-0.12, 0.0, y));
      c = mix(c, vec3(0.03,0.03,0.04), smoothstep(0.0, -0.15, y));
      gl_FragColor = vec4(c, 1.0); }`,
  })));
  // street lights overhead, stretched into strips so they reflect as streaks rather than dots
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.15) });
  for (const x of [-7, 7]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 90), lamp); m.position.set(x, 11, 0); s.add(m); }
  for (const z of [-30, 0, 30]) { const m = new THREE.Mesh(new THREE.BoxGeometry(30, 0.15, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.2) })); m.position.set(0, 14, z); s.add(m); }
  // city windows round the horizon, and a soft sky panel overhead for broad highlights
  const r = rng(5);
  const cols = [new THREE.Color(1.4, 1.0, 0.6), new THREE.Color(0.8, 1.1, 1.5), new THREE.Color(1.5, 0.8, 0.45)];
  for (let i = 0; i < 220; i++) {
    const a = r() * Math.PI * 2, d = 38 + r() * 8, h = -1 + r() * 9;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + r() * 1.4, 0.3 + r() * 0.5), new THREE.MeshBasicMaterial({ color: cols[i % 3], side: THREE.DoubleSide }));
    m.position.set(Math.cos(a) * d, h, Math.sin(a) * d); m.lookAt(0, h, 0); s.add(m);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.18, 0.3), side: THREE.DoubleSide }));
  panel.position.y = 30; panel.rotation.x = Math.PI / 2; s.add(panel);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return env;
}
