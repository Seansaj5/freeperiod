// Everything you see except the player cars: sky, the road and its barriers, tunnels, speed traps,
// street lights and traffic. Map-specific scenery (city, coast, canyon) lives in scenery.js.
// The road is built in 160 m chunks ahead of the player and recycled behind.
import * as THREE from 'three';
import { Road } from './road.js';
import { trafficNear, KINDS } from './traffic.js';
import { trafficGeometry, slotMaterials, lightMaterial, glowMaterial, setCarLook, PAINT } from './models.js';
import { rng } from './util.js';
import { mapById } from './maps.js';
import { Scenery } from './scenery.js';
import { CHUNK, NCH, Pool, triMesh, mergeGeos, radialTexture } from './gfx.js';

const STEP = 4; // metres between road mesh rows
const LAMP_IN = 2.6; // how far a lamp head reaches in over the road from the barrier
export const LAMP_Y = 11.6;


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
    this.tunnelK = 0;
    this._v = {}; this._p = {};
    this.envCache = {};
    this.roadTexCache = {};
    this.mapId = null; this.lanes = 0;
    this.buildLights();
    this.buildSky();
    this.buildCommon();
    this.buildTraffic();
  }

  /** Start (or restart) on a route. Same seed + map + lanes = same road and traffic for everyone. */
  setRoute({ map, lanes, seed, density = 1 }) {
    const m = mapById(map);
    const mapChanged = this.mapId !== m.id;
    if (mapChanged) this.applyMap(m);
    if (mapChanged || this.lanes !== lanes) { this.lanes = lanes; this.applyRoadLook(); }
    this.density = density;
    if (this.road && this.road.seed === seed && this.road.map === m && this.road.lanes === lanes) return;
    for (const c of this.chunks.values()) this.freeChunk(c);
    this.chunks.clear();
    this.seed = seed;
    this.road = new Road(seed, m, lanes);
  }

  // ---------- one-time setup ----------

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0x7a8fcc, 0x2a1e16, 1.15);
    this.scene.add(this.hemi);
    this.dirLight = new THREE.DirectionalLight(0xa8bcff, 0.5);
    this.scene.add(this.dirLight);
    // three warm lights that ride along the street lights (or tunnel lights) nearest the player, so
    // cars and road brighten as they pass under each one (high quality only: every light costs every pixel)
    this.lamps = [];
    if (this.hi) for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffc27a, 24, 30, 1.3); this.scene.add(l); this.lamps.push(l); }
  }

  buildSky() {
    // gradient dome with a horizon glow, clouds, stars and (on the coast) the setting sun
    const geo = new THREE.SphereGeometry(1500, 32, 16);
    const v3 = () => ({ value: new THREE.Vector3() });
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uT: { value: 0 }, uTop: v3(), uMid: v3(), uGlow: v3(), uCloud: v3(), uStars: { value: 1 }, uSunDir: { value: new THREE.Vector3(0, -1, 0) }, uSunCol: v3(), uSun: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform float uT, uStars, uSun; uniform vec3 uTop, uMid, uGlow, uCloud, uSunDir, uSunCol;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float y = vP.y;
          float toSun = uSun > 0.0 ? max(dot(vP, uSunDir), 0.0) : 0.0;
          vec3 c = mix(uMid, uTop, smoothstep(0.02, 0.55, y));
          c = mix(c, uGlow * (1.0 + toSun * toSun * 0.8 * uSun), smoothstep(0.2 + toSun * 0.15 * uSun, -0.02, y) * 0.85);
          vec2 q = vP.xz / max(y + 0.08, 0.05) * 1.6 + vec2(uT * 0.004, 0.0);
          float cl = n2(q) * 0.55 + n2(q * 2.3) * 0.3 + n2(q * 5.1) * 0.15;
          cl = smoothstep(0.52, 0.85, cl) * smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.35, 0.8, y));
          c = mix(c, uCloud * (0.7 + toSun * 0.9 * uSun) + uGlow * 0.2, cl * 0.6);
          vec3 s = floor(vP * 420.0);
          float st = step(0.9975, h(s)) * smoothstep(0.14, 0.5, y) * (1.0 - cl) * uStars;
          c += st * vec3(0.8,0.85,1.0) * (0.5 + 0.5 * h(s + 3.0));
          if (uSun > 0.0) { float d = dot(vP, uSunDir); c += uSunCol * (smoothstep(0.9982, 0.9988, d) * 2.2 + pow(max(d, 0.0), 48.0) * 0.6 + pow(max(d, 0.0), 6.0) * 0.12); }
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    // moon with a soft halo (night maps)
    const moon = new THREE.Group();
    moon.add(new THREE.Mesh(new THREE.CircleGeometry(24, 32), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false })));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(150,170,255,0.35)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    halo.position.z = -1;
    moon.add(halo);
    this.moon = moon;
    this.scene.add(moon);
  }

  buildCommon() {
    this.aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.matConcrete = new THREE.MeshLambertMaterial({ color: 0x6b6f78, side: THREE.DoubleSide });
    this.matDeck = new THREE.MeshLambertMaterial({ color: 0x2c3039 });
    this.matRail = new THREE.MeshBasicMaterial({ color: this.hi ? new THREE.Color(1.15, 0.62, 0.22) : 0xffb347 });
    this.matGuard = this.hi ? new THREE.MeshStandardMaterial({ color: 0xa4aab4, metalness: 0.35, roughness: 0.55, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: 0x9aa0aa, side: THREE.DoubleSide });
    this.matFrame = new THREE.MeshLambertMaterial({ color: 0x4a505c });
    this.trapTex = trapTexture();
    this.matTrap = new THREE.MeshBasicMaterial({ map: this.trapTex, color: this.hi ? new THREE.Color(1.25, 1.25, 1.25) : 0xffffff });
    this.matTrapLed = new THREE.MeshBasicMaterial({ color: this.hi ? new THREE.Color(3, 0.15, 0.1) : 0xff2a20 });
    // tunnel: inside walls, outside shell, light strips
    this.matTunnelIn = new THREE.MeshLambertMaterial({ color: 0x8c8f96, side: THREE.DoubleSide });
    this.matTunnelOut = new THREE.MeshLambertMaterial({ color: 0x5c5248, side: THREE.DoubleSide });
    this.matTunnelLight = new THREE.MeshBasicMaterial({ color: 0xfff4dc, side: THREE.DoubleSide });
    this.matTunnelBand = new THREE.MeshBasicMaterial({ color: this.hi ? new THREE.Color(0.15, 0.85, 1.15) : 0x3de0ff, side: THREE.DoubleSide });
    // street lights: pole with an arm reaching over the road (+x), a glowing head, and a pool of light on the road
    const poleGeo = mergeGeos([
      new THREE.CylinderGeometry(0.11, 0.17, LAMP_Y + 0.4, 8).translate(0, (LAMP_Y + 0.4) / 2, 0),
      new THREE.CylinderGeometry(0.07, 0.07, LAMP_IN + 0.3, 6).rotateZ(Math.PI / 2 - 0.08).translate((LAMP_IN + 0.3) / 2, LAMP_Y + 0.35, 0),
      new THREE.BoxGeometry(1.1, 0.22, 0.5).translate(LAMP_IN, LAMP_Y + 0.12, 0),
      new THREE.BoxGeometry(0.6, 0.5, 0.6).translate(0, 0.25, 0),
    ]);
    const g = (this.common = new THREE.Group());
    this.scene.add(g);
    const per = 10;
    this.poles = new Pool(g, poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f4a }), per);
    this.heads = new Pool(g, new THREE.BoxGeometry(0.95, 0.06, 0.4).translate(LAMP_IN, LAMP_Y - 0.01, 0), new THREE.MeshBasicMaterial({ color: this.hi ? new THREE.Color(3, 2.3, 1.4) : 0xffd28a }), per);
    this.pools = new Pool(g, new THREE.PlaneGeometry(13, 17).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,190,110,0.5)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), per);
    this.halos = new Pool(g, new THREE.PlaneGeometry(4.2, 4.2).rotateX(Math.PI / 2).translate(LAMP_IN, LAMP_Y - 0.08, 0),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,200,130,0.55)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), per);
    // guard rail posts (coast, canyon)
    this.posts = new Pool(g, new THREE.BoxGeometry(0.14, 0.95, 0.12).translate(0, 0.47, 0), new THREE.MeshLambertMaterial({ color: 0x7c828c }), 90);
  }

  buildTraffic() {
    this.tGroup = new THREE.Group();
    this.scene.add(this.tGroup);
    const mats = (this.tMats = slotMaterials(null, true));
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
    // indicator lights for cars changing lanes
    this.blinkers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.11, 0.07), new THREE.MeshBasicMaterial({ color: this.hi ? new THREE.Color(3.2, 1.5, 0.15) : 0xffa020 }), 80);
    this.blinkers.count = 0; this.blinkers.frustumCulled = false;
    this.tGroup.add(this.blinkers);
  }

  // ---------- per map ----------

  applyMap(m) {
    this.mapId = m.id;
    this.map = m;
    this.scene.fog.color.setHex(m.fog[0]); this.scene.fog.near = m.fog[1]; this.scene.fog.far = m.fog[2];
    this.scene.background.setHex(m.bg);
    this.hemi.color.setHex(m.hemi[0]); this.hemi.groundColor.setHex(m.hemi[1]); this.hemiBase = m.hemi[2];
    this.dirLight.color.setHex(m.light[0]); this.dirLight.intensity = m.light[1]; this.dirLight.position.set(...m.light[2]);
    const u = this.skyMat.uniforms, sk = m.sky;
    u.uTop.value.set(...sk.top); u.uMid.value.set(...sk.mid); u.uGlow.value.set(...sk.glow); u.uCloud.value.set(...sk.cloud); u.uStars.value = sk.stars;
    u.uSun.value = sk.sun ? 1 : 0;
    if (sk.sun) { u.uSunDir.value.set(...sk.sun.dir).normalize(); u.uSunCol.value.set(...sk.sun.col); }
    this.moon.visible = !sk.sun;
    // reflections for paint and glass
    if (this.hi) {
      const env = this.envCache[m.id] || (this.envCache[m.id] = buildEnv(this.renderer, m));
      setCarLook(env, true);
      for (const mt of this.tMats) { mt.envMap = env; mt.needsUpdate = true; }
    } else setCarLook(null, false);
    this.matTunnelIn.color.setHex(m.id === 'city' ? 0x5d6878 : 0x9a958c);
    this.matTunnelOut.color.setHex(m.id === 'city' ? 0x262b35 : m.id === 'coast' ? 0x8c7c68 : 0x8e4a2c);
    this.matTunnelLight.color.set(this.hi ? (m.id === 'city' ? new THREE.Color(1.15, 1.3, 1.45) : new THREE.Color(1.5, 1.05, 0.5)) : (m.id === 'city' ? 0xdfeeff : 0xffcf86));
    if (this.scenery) this.scenery.dispose();
    this.scenery = new Scenery(this, m);
  }

  applyRoadLook() {
    const key = `${this.lanes}-${this.map.paint}`;
    let t = this.roadTexCache[key];
    if (!t) {
      t = this.roadTexCache[key] = roadTextures(this.lanes, this.map.paint);
      for (const x of [t.map, t.glow]) { x.wrapT = THREE.RepeatWrapping; x.anisotropy = this.aniso; x.colorSpace = THREE.SRGBColorSpace; }
    }
    if (!this.matRoad) {
      this.matRoad = this.hi
        ? new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.62, metalness: 0, emissive: 0xffffff, emissiveMap: t.glow, emissiveIntensity: 1.6 })
        : new THREE.MeshLambertMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.glow, emissiveIntensity: 1.2 });
    } else { this.matRoad.map = t.map; this.matRoad.emissiveMap = t.glow; this.matRoad.needsUpdate = true; }
    // the daylight coast needs less glow from the studs and paint
    this.matRoad.emissiveIntensity = this.map.id === 'coast' ? 0.5 : this.hi ? 1.6 : 1.2;
  }

  // ---------- chunks ----------

  /** Keep chunks around s. Call every frame with the camera target's s. */
  updateChunks(s) {
    const first = Math.floor(s / CHUNK) - 1;
    for (const [i, c] of this.chunks) if (i < first || i >= first + NCH) { this.freeChunk(c); this.chunks.delete(i); }
    for (let i = first; i < first + NCH; i++) if (i >= 0 && !this.chunks.has(i)) this.chunks.set(i, this.makeChunk(i));
  }

  freeChunk(c) {
    for (const m of c.meshes) { m.parent?.remove(m); m.geometry.dispose(); }
    for (const p of [this.poles, this.heads, this.pools, this.halos, this.posts]) p.clear(c.slot);
    this.scenery.clearSlot(c.slot);
  }

  makeChunk(i) {
    const road = this.road, m = this.map;
    const s0 = i * CHUNK, s1 = s0 + CHUNK;
    road.ensure(s1 + 2);
    const base = road.center(s0, {});
    const meshes = [];
    const rows = CHUNK / STEP + 1;
    const p = {};
    const W = road.wall;
    const feats = road.featuresIn(s0 - 100, s1 + 100); // a little beyond, for hills rising round tunnel mouths
    const tunnelAt = (s) => feats.some((f) => f.kind === 'tunnel' && s >= f.a - 4 && s <= f.b + 4);
    const local = (s, d, dy = 0) => { road.toWorld(s, d, p); return [p.x - base.x, p.y + dy, p.z - base.z]; };
    // --- road surface ---
    {
      const pos = new Float32Array(rows * 2 * 3), uv = new Float32Array(rows * 2 * 2), idx = [];
      const edge = W + 0.3;
      for (let r = 0; r < rows; r++) {
        const s = s0 + r * STEP;
        for (let k = 0; k < 2; k++) {
          const v = local(s, k ? edge : -edge);
          const o = (r * 2 + k) * 3;
          pos[o] = v[0]; pos[o + 1] = v[1]; pos[o + 2] = v[2];
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
    // --- barriers ---
    if (m.rail === 'jersey') {
      // jersey barriers, deck edge and underside, amber rail lights (both sides)
      const prof = [[0, 0], [0.18, 0.32], [0.26, 1.0], [0.55, 1.0], [0.6, -1.6]];
      const bar = [], rail = [];
      for (const side of [-1, 1]) {
        const ring = [], rp = [];
        for (let r = 0; r < rows; r++) {
          const s = s0 + r * STEP;
          ring.push(prof.map(([dd, y]) => local(s, side * (W + dd), y)));
          rp.push(local(s, side * (W + 0.27), 1.02));
        }
        for (let r = 1; r < rows; r++) for (let k = 0; k < prof.length - 1; k++) {
          const a = ring[r - 1][k], b = ring[r][k], c = ring[r][k + 1], d = ring[r - 1][k + 1];
          if (side > 0) bar.push(a, b, c, a, c, d); else bar.push(a, c, b, a, d, c);
        }
        for (let r = 1; r < rp.length; r++) {
          const a = rp[r - 1], b = rp[r], a2 = [a[0], a[1] + 0.06, a[2]], b2 = [b[0], b[1] + 0.06, b[2]];
          rail.push(a, b, b2, a, b2, a2, a, b2, b, a, a2, b2);
        }
      }
      meshes.push(triMesh(bar, this.matConcrete), triMesh(rail, this.matRail));
      // deck underside
      const under = [];
      for (let r = 1; r < rows; r++) {
        const sa = s0 + (r - 1) * STEP, sb = s0 + r * STEP;
        const a = local(sa, -(W + 0.6), -1.6), b = local(sb, -(W + 0.6), -1.6), c = local(sb, W + 0.6, -1.6), d = local(sa, W + 0.6, -1.6);
        under.push(a, b, c, a, c, d, a, c, b, a, d, c);
      }
      meshes.push(triMesh(under, this.matDeck));
    } else {
      // steel guard rail on posts, both sides
      const rail = [];
      for (const side of [-1, 1]) {
        let prev = null;
        for (let r = 0; r < rows; r++) {
          const s = s0 + r * STEP;
          const cur = [local(s, side * (W + 0.32), 0.48), local(s, side * (W + 0.37), 0.64), local(s, side * (W + 0.32), 0.8), local(s, side * (W + 0.4), 0.83)];
          if (prev) for (let k = 0; k < 3; k++) rail.push(prev[k], cur[k], cur[k + 1], prev[k], cur[k + 1], prev[k + 1]);
          prev = cur;
        }
      }
      meshes.push(triMesh(rail, this.matGuard));
    }
    // --- tunnels ---
    for (const f of feats) if (f.kind === 'tunnel' && f.b > s0 && f.a < s1) this.buildTunnel(f, Math.max(s0, f.a), Math.min(s1, f.b), local, meshes);
    // --- speed traps ---
    for (const s of road.trapsIn(s0, s1)) this.buildTrap(s, base, meshes);
    // --- map scenery (terrain, buildings, signs...) ---
    const slot = ((i % NCH) + NCH) % NCH;
    for (const pl of [this.poles, this.heads, this.pools, this.halos, this.posts]) pl.clear(slot);
    this.scenery.clearSlot(slot);
    this.scenery.fillChunk(i, slot, s0, s1, base, meshes, feats);
    for (const mesh of meshes) { mesh.position.set(base.x, 0, base.z); mesh.matrixAutoUpdate = false; mesh.updateMatrix(); this.scene.add(mesh); }

    // --- instanced: street lights and rail posts ---
    if (m.lamps) {
      const gap = m.lamps.gap;
      for (let k = Math.ceil(s0 / gap); k * gap < s1; k++) {
        const s = k * gap;
        if (tunnelAt(s)) continue;
        const side = m.lamps.both ? (k % 2 === 0 ? -1 : 1) : 1;
        road.toWorld(s, side * (W + 0.45), p);
        const rot = p.h + (side > 0 ? 0 : Math.PI);
        for (const pl of [this.poles, this.heads, this.halos]) pl.add(slot, p.x, p.y, p.z, rot);
        road.toWorld(s, side * (W + 0.45 - LAMP_IN), p);
        this.pools.add(slot, p.x, p.y + 0.03, p.z, p.h);
      }
    }
    if (m.rail !== 'jersey') for (let s = s0; s < s1; s += 4) for (const side of [-1, 1]) {
      road.toWorld(s, side * (W + 0.45), p);
      this.posts.add(slot, p.x, p.y - 0.1, p.z, p.h);
    }
    return { meshes, slot };
  }

  /** Tunnel shell between sa and sb (part of tunnel f): inner walls and arch, light strips, outer shell, portals. */
  buildTunnel(f, sa, sb, local, meshes) {
    const W = this.road.wall + 0.5, rock = this.map.tube === 'rock';
    const inner = [[W, -0.1], [W, 4.6], [W * 0.82, 6.3], [W * 0.5, 7.1], [0, 7.35]];
    const outer = rock ? [[W + 17, -3], [W + 17, 12], [W + 12, 15.5], [0, 16.5]] : [[W + 0.6, -0.1], [W + 0.6, 5.0], [W * 0.84, 6.9], [W * 0.5, 7.8], [0, 8.1]];
    const full = (prof) => [...prof, ...prof.slice(0, -1).reverse().map(([d, y]) => [-d, y])];
    const pin = full(inner), pout = full(outer);
    const n = Math.max(1, Math.ceil((sb - sa) / STEP));
    const sAt = (r) => sa + ((sb - sa) * r) / n;
    const shell = (prof) => {
      const tris = [];
      for (let r = 0; r < n; r++) for (let k = 0; k < prof.length - 1; k++) {
        const a = local(sAt(r), prof[k][0], prof[k][1]), b = local(sAt(r + 1), prof[k][0], prof[k][1]), c = local(sAt(r + 1), prof[k + 1][0], prof[k + 1][1]), d = local(sAt(r), prof[k + 1][0], prof[k + 1][1]);
        tris.push(a, b, c, a, c, d);
      }
      return tris;
    };
    meshes.push(triMesh(shell(pin), this.matTunnelIn), triMesh(shell(pout), this.matTunnelOut));
    // light strips along the ceiling, and a band along each wall
    const quadStrip = (d0, y0, d1, y1, out, on = 1) => {
      for (let r = 0; r < n; r++) {
        const a0 = sAt(r), b0 = a0 + (sAt(r + 1) - a0) * on;
        const a = local(a0, d0, y0), b = local(b0, d0, y0), c = local(b0, d1, y1), d = local(a0, d1, y1);
        out.push(a, b, c, a, c, d);
      }
    };
    const strips = [], band = [];
    for (const sx of [-1, 1]) quadStrip(sx * W * 0.4, 7.1, sx * W * 0.34, 7.16, strips, 0.4); // a light fitting every 4 m
    for (const sx of [-1, 1]) quadStrip(sx * (W - 0.03), 1.0, sx * (W - 0.03), 1.1, band);
    meshes.push(triMesh(strips, this.matTunnelLight), triMesh(band, this.map.id === 'city' ? this.matTunnelBand : this.matTunnelLight));
    // portals: a face joining the inner and outer profiles at each open end
    const at = (prof, u) => { const x = u * (prof.length - 1), i = Math.min(prof.length - 2, Math.floor(x)), t = x - i; return [prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t]; };
    for (const s of [f.a, f.b]) {
      if (s < sa - 0.01 || s > sb + 0.01) continue;
      const tris = [], k = 24;
      for (let j = 0; j < k; j++) {
        const a = at(pin, j / k), b = at(pin, (j + 1) / k), c = at(pout, (j + 1) / k), d = at(pout, j / k);
        tris.push(local(s, a[0], a[1]), local(s, b[0], b[1]), local(s, c[0], c[1]), local(s, a[0], a[1]), local(s, c[0], c[1]), local(s, d[0], d[1]));
      }
      meshes.push(triMesh(tris, this.matTunnelOut));
    }
  }

  /** Speed trap: a gantry with a camera and a sign over the road at s. */
  buildTrap(s, base, meshes) {
    const p = this.road.center(s, {});
    const g = new THREE.Group();
    const span = this.road.wall * 2 + 1.4;
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); };
    add(new THREE.BoxGeometry(span, 0.45, 0.45), this.matFrame, 0, 7.0, 0);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.4, 7.4, 0.4), this.matFrame, sx * span / 2, 3.7, 0);
    add(new THREE.BoxGeometry(7.4, 2.5, 0.2), this.matFrame, 0, 8.3, 0);
    add(new THREE.PlaneGeometry(7.2, 2.36), this.matTrap, 0, 8.3, -0.12, Math.PI);
    add(new THREE.BoxGeometry(7.4, 0.1, 0.1), this.matTrapLed, 0, 9.6, -0.1);
    for (const x of [-4.4, 4.4]) { add(new THREE.BoxGeometry(0.6, 0.5, 0.9), this.matFrame, x, 6.5, -0.2); add(new THREE.BoxGeometry(0.26, 0.26, 0.05), this.matTrapLed, x, 6.5, -0.67); }
    g.position.set(p.x - base.x, p.y, p.z - base.z);
    g.rotation.y = p.h;
    g.updateMatrixWorld(true);
    for (const m of g.children.slice()) { m.geometry = m.geometry.clone().applyMatrix4(m.matrixWorld); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.updateMatrix(); meshes.push(m); }
  }

  // ---------- traffic ----------

  /** Draw traffic near s at time t. Returns the list (also kept on this.traffic / this.trafficCount). */
  updateTraffic(t, s, skipMask = 0) {
    const n = trafficNear(this.road, this.density, t, s - 120, s + 560, this.traffic, skipMask);
    this.trafficCount = n;
    // place instances relative to a local origin so far-away coordinates do not jitter
    const o = this.road.center(s, this._v);
    const ox = o.x, oy = o.y, oz = o.z;
    this.tGroup.position.set(ox, oy, oz);
    for (const m of this.tMeshes) m.used = 0;
    const T = this._t || (this._t = { M: new THREE.Matrix4(), M2: new THREE.Matrix4(), Q: new THREE.Quaternion(), E: new THREE.Euler(0, 0, 0, 'YXZ'), V: new THREE.Vector3(), V2: new THREE.Vector3(), S1: new THREE.Vector3(1, 1, 1), S2: new THREE.Vector3(), C: new THREE.Color() });
    const { M, M2, Q, E, V, V2, S1, S2, C } = T;
    const p = this._p;
    let sh = 0, bl = 0;
    for (let i = 0; i < n; i++) {
      const c = this.traffic[i];
      const m = this.tMeshes[c.kind];
      if (m.used >= m.n) continue;
      this.road.toWorld(c.s, c.d, p);
      Q.setFromEuler(E.set(-Math.atan(this.road.grade(c.s)), p.h, 0));
      V.set(p.x - ox, p.y - oy, p.z - oz);
      M.compose(V, Q, S1);
      M.toArray(m.matrix.array, m.used * 16);
      m.paint.setColorAt(m.used, C.setHex(c.color));
      m.used++;
      if (sh < 240) { V.y += 0.02; M2.compose(V, Q, S2.set(c.hw * 2 + 0.7, 1, c.hl * 2 + 0.9)); this.tShadow.setMatrixAt(sh++, M2); }
      if (c.blink && bl < 78) {
        const yb = c.hl > 4 ? 1.0 : 0.72, x = (c.blink < 0 ? 1 : -1) * (c.hw - 0.04); // the car's left is local +x
        for (const z of [c.hl - 0.15, -(c.hl - 0.15)]) { V2.set(x, yb, z).applyMatrix4(M); M2.copy(M).setPosition(V2); this.blinkers.setMatrixAt(bl++, M2); }
      }
    }
    for (const m of this.tMeshes) {
      for (const im of m.list) im.count = m.used;
      m.matrix.needsUpdate = true;
      m.paint.instanceColor.needsUpdate = true;
    }
    this.tShadow.count = sh; this.tShadow.instanceMatrix.needsUpdate = true;
    this.blinkers.count = bl; this.blinkers.instanceMatrix.needsUpdate = true;
    return this.traffic;
  }

  /** Per frame: sky clouds, lights that follow the player, darker inside tunnels, scenery animation. */
  tick(s, time, dt = 0.016) {
    this.skyMat.uniforms.uT.value = time;
    if (!this.road) return;
    const f = this.road.featureAt(s), inT = !!f && f.kind === 'tunnel';
    const deep = inT && s > f.a + 15 && s < f.b - 15;
    this.tunnelK += ((deep ? 1 : 0) - this.tunnelK) * Math.min(1, dt * 2.5);
    this.hemi.intensity = this.hemiBase * (1 - this.tunnelK * 0.45);
    this.dirLight.intensity = this.map.light[1] * (1 - this.tunnelK * 0.8);
    this.scenery.tick(time, s);
    if (!this.lamps.length) return;
    const p = this._v, m = this.map;
    if (inT) {
      // tunnel ceiling lights every 24 m
      const k0 = Math.round(s / 24) - 1;
      for (let i = 0; i < 3; i++) { this.road.toWorld((k0 + i) * 24, 0, p); this.lamps[i].position.set(p.x, p.y + 6.2, p.z); this.lamps[i].intensity = 20; this.lamps[i].color.setHex(m.id === 'city' ? 0xdff0ff : 0xffc27a); }
      return;
    }
    if (!m.lamps) { for (const l of this.lamps) l.intensity = 0; return; }
    const gap = m.lamps.gap, k0 = Math.round(s / gap) - 1;
    for (let i = 0; i < 3; i++) {
      const k = k0 + i, side = m.lamps.both ? (k % 2 === 0 ? -1 : 1) : 1;
      this.road.toWorld(k * gap, side * (this.road.wall + 0.45 - LAMP_IN), p);
      this.lamps[i].position.set(p.x, p.y + LAMP_Y - 0.6, p.z);
      this.lamps[i].intensity = m.id === 'coast' ? 12 : 24;
      this.lamps[i].color.setHex(m.lamps.color);
    }
  }

  /** Keep sky and far scenery centred on the camera. */
  follow(cam) {
    this.sky.position.copy(cam.position);
    this.moon.position.set(cam.position.x + 300, cam.position.y + 560, cam.position.z + 850);
    this.moon.lookAt(cam.position);
    this.scenery.follow(cam);
  }
}

// ---------- helpers ----------



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


/**
 * Asphalt with lane markings for `lanes` lanes (u across the road, v along it, repeating every 12 m)
 * plus a glow map: faintly lit paint and bright reflective road studs, which the bloom makes sparkle.
 * paint 'yellow' gives a yellow line along the left edge (country roads).
 */
function roadTextures(lanes, paint) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const gc = document.createElement('canvas'); gc.width = W; gc.height = H;
  const gx = gc.getContext('2d');
  gx.fillStyle = '#000'; gx.fillRect(0, 0, W, H);
  x.fillStyle = '#272a30'; x.fillRect(0, 0, W, H);
  const r = rng(7);
  for (let i = 0; i < 42000; i++) { const g = 26 + r() * 46; x.fillStyle = `rgba(${g},${g},${g + 5},0.55)`; x.fillRect(r() * W, r() * H, 1.6, 1.6); }
  for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(14,15,18,${0.25 + r() * 0.2})`; x.fillRect(r() * W, r() * H, 60 + r() * 140, 30 + r() * 90); }
  x.strokeStyle = 'rgba(12,12,14,0.55)'; x.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) { x.beginPath(); let px = r() * W, py = r() * H; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 40; py += r() * 30; x.lineTo(px, py); } x.stroke(); }
  const LW = 3.75, half = (lanes * LW) / 2, wall = half + 1.1;
  const total = wall * 2 + 0.6, px = (m) => ((m + wall + 0.3) / total) * W, mpx = W / total;
  // wheel paths: darker oil-stained bands in each lane
  for (let l = 0; l < lanes; l++) {
    const cx = px(-half + LW * (l + 0.5));
    for (const off of [-0.55, 0.42]) { const o = off * mpx; const g = x.createLinearGradient(cx + o - 8, 0, cx + o + 16, 0); g.addColorStop(0, 'rgba(8,8,12,0)'); g.addColorStop(0.5, 'rgba(8,8,12,0.32)'); g.addColorStop(1, 'rgba(8,8,12,0)'); x.fillStyle = g; x.fillRect(cx + o - 8, 0, 24, H); }
  }
  const WHITE = '#e9e6da', YELLOW = '#e8b923';
  const line = (x0, w, y0, h, col) => {
    x.fillStyle = col; x.fillRect(x0, y0, w, h);
    for (let i = 0; i < (w * h) / 14; i++) { x.fillStyle = 'rgba(40,42,46,0.5)'; x.fillRect(x0 + r() * w, y0 + r() * h, 1.5, 1.5); } // worn paint
    gx.fillStyle = col === WHITE ? 'rgb(46,44,40)' : 'rgb(52,40,10)'; gx.fillRect(x0, y0, w, h);
  };
  const ew = Math.max(5, 0.14 * mpx);
  line(px(-half) - ew / 2, ew, 0, H, paint === 'yellow' ? YELLOW : WHITE);
  line(px(half) - ew / 2, ew, 0, H, WHITE);
  for (let l = 1; l < lanes; l++) line(px(-half + LW * l) - ew / 2, ew, 0, H / 3, WHITE); // dashes: 4 m on, 8 m off
  // road studs: white between lanes (in the gaps), amber just inside the edge lines
  const stud = (cx, cy, col) => { x.fillStyle = '#6b6e75'; x.fillRect(cx - 6, cy - 5, 12, 10); gx.fillStyle = col; gx.fillRect(cx - 4, cy - 3, 8, 6); };
  for (let l = 1; l < lanes; l++) stud(px(-half + LW * l), H * 0.66, '#fff6e0');
  for (const e of [-1, 1]) for (const v of [0.2, 0.7]) stud(px(e * (half - 0.3)), H * v, '#ffa020');
  return { map: new THREE.CanvasTexture(c), glow: new THREE.CanvasTexture(gc) };
}

function trapTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 84;
  const x = c.getContext('2d');
  x.fillStyle = '#0d0f14'; x.fillRect(0, 0, 256, 84);
  x.strokeStyle = '#ffb020'; x.lineWidth = 4; x.strokeRect(5, 5, 246, 74);
  x.fillStyle = '#ffb020'; x.font = 'bold 30px system-ui, sans-serif'; x.textAlign = 'center';
  x.fillText('SPEED TRAP', 128, 40);
  x.fillStyle = '#e8ecf4'; x.font = 'bold 17px system-ui, sans-serif';
  x.fillText('FASTER = MORE POINTS', 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A small scene in the map's colours rendered once into a reflection map for car paint and glass. */
function buildEnv(renderer, m) {
  const s = new THREE.Scene();
  const sk = m.sky, sun = sk.sun;
  const col = (a) => new THREE.Vector3(...a);
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTop: { value: col(sk.top) }, uMid: { value: col(sk.mid) }, uGlow: { value: col(sk.glow) }, uGround: { value: col(m.id === 'coast' ? [0.05, 0.08, 0.14] : [0.03, 0.03, 0.04]) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop, uMid, uGlow, uGround; void main(){
      float y = vP.y;
      vec3 c = mix(uMid, uTop, smoothstep(0.0, 0.6, y));
      c = mix(c, uGlow * 1.3, smoothstep(0.2, 0.0, y) * smoothstep(-0.12, 0.0, y));
      c = mix(c, uGround, smoothstep(0.0, -0.15, y));
      gl_FragColor = vec4(c, 1.0); }`,
  })));
  if (m.lamps) { // street lights overhead, stretched into strips so they reflect as streaks rather than dots
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.15) });
    for (const x of m.lamps.both ? [-7, 7] : [7]) { const mm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 90), lamp); mm.position.set(x, 11, 0); s.add(mm); }
  }
  if (m.id === 'city') { // city windows round the horizon
    for (const z of [-30, 0, 30]) { const mm = new THREE.Mesh(new THREE.BoxGeometry(30, 0.15, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.2) })); mm.position.set(0, 14, z); s.add(mm); }
    const r = rng(5);
    const cols = [new THREE.Color(1.4, 1.0, 0.6), new THREE.Color(0.8, 1.1, 1.5), new THREE.Color(1.5, 0.8, 0.45)];
    for (let i = 0; i < 220; i++) {
      const a = r() * Math.PI * 2, d = 38 + r() * 8, h = -1 + r() * 9;
      const mm = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + r() * 1.4, 0.3 + r() * 0.5), new THREE.MeshBasicMaterial({ color: cols[i % 3], side: THREE.DoubleSide }));
      mm.position.set(Math.cos(a) * d, h, Math.sin(a) * d); mm.lookAt(0, h, 0); s.add(mm);
    }
  }
  if (sun) { // the low sun
    const mm = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(sun.col[0] * 3, sun.col[1] * 3, sun.col[2] * 3) }));
    mm.position.set(...sun.dir.map((v) => v * 45)); s.add(mm);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: sun ? new THREE.Color(0.5, 0.45, 0.55) : new THREE.Color(0.16, 0.18, 0.3), side: THREE.DoubleSide }));
  panel.position.y = 30; panel.rotation.x = Math.PI / 2; s.add(panel);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return env;
}
