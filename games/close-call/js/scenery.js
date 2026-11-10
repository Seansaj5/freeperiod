// The look of each map beyond the road itself:
//   city   - elevated deck on pillars, towers with lit windows, neon billboards, sign gantries, skyline
//   coast  - sea with the setting sun on it, cliffs and hills, palm trees, suspension bridges, islands
//   canyon - red rock walls, mesas, cacti, boulders and reflector posts, under a starry sky
// Terrain is built per chunk as strips beside the road; props are instanced (gfx.js Pool).
import * as THREE from 'three';
import { CHUNK, Pool, triMesh, mergeGeos, radialTexture } from './gfx.js';
import { rng, hash, smooth, lerp } from './util.js';

const ROW = 8; // metres between terrain rows

/** Smooth value noise in [0, 1). */
function vnoise(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(seed, xi, yi), b = hash(seed, xi + 1, yi), c = hash(seed, xi, yi + 1), d = hash(seed, xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export class Scenery {
  constructor(world, m) {
    this.w = world; this.m = m; this.hi = world.hi;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.pools = [];
    this.mats = [];
    this.texs = [];
    this.time = 0;
    if (m.id === 'city') this.buildCity();
    else if (m.id === 'coast') this.buildCoast();
    else this.buildCanyon();
  }

  pool(geo, mat, per, colors = false) { const p = new Pool(this.group, geo, mat, per, colors); this.pools.push(p); return p; }
  mat(m) { this.mats.push(m); return m; }
  tex(t) { this.texs.push(t); return t; }
  clearSlot(slot) { for (const p of this.pools) p.clear(slot); }

  dispose() {
    for (const p of this.pools) p.dispose();
    this.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.geometry.dispose(); });
    this.w.scene.remove(this.group);
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }

  /** A ring of far silhouettes just inside the sky. */
  farRing(tex, y, h) {
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 3;
    this.far = new THREE.Mesh(new THREE.CylinderGeometry(1300, 1300, h, 64, 1, true), this.mat(new THREE.MeshBasicMaterial({ map: this.tex(tex), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    this.far.renderOrder = -1;
    this.farY = y;
    this.group.add(this.far);
  }
  groundPlane(y, color) {
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), this.mat(new THREE.MeshLambertMaterial({ color })));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = y;
    this.group.add(this.ground);
  }

  fillChunk(i, slot, s0, s1, base, meshes, feats) {
    if (this.m.id === 'city') this.cityChunk(i, slot, s0, s1, base, meshes);
    else if (this.m.id === 'coast') this.coastChunk(i, slot, s0, s1, base, meshes, feats);
    else this.canyonChunk(i, slot, s0, s1, base, meshes, feats);
  }

  tick(time) {
    this.time = time;
    if (this.beaconMat) { const on = Math.sin(time * 3.2) > 0.3 ? (this.hi ? 2.5 : 1) : 0.1; this.beaconMat.color.setRGB(on, on * 0.06, on * 0.06); }
    if (this.seaMat) this.seaMat.uniforms.uT.value = time;
  }

  follow(cam) {
    if (this.far) this.far.position.set(cam.position.x, this.farY, cam.position.z);
    if (this.ground) { this.ground.position.x = cam.position.x; this.ground.position.z = cam.position.z; }
    if (this.sea) { this.sea.position.x = cam.position.x; this.sea.position.z = cam.position.z; }
  }

  // ---------------------------------------------------------------- terrain strips

  /**
   * Terrain beside the road on one side (side -1 left, 1 right) from s0 to s1.
   * prof(s) -> [[dOffset, y], ...] with dOffset measured outward from the barrier; color(s, dOff, y, k) -> [r, g, b].
   */
  strip(s0, s1, side, base, prof, color, mat, meshes) {
    const road = this.w.road, p = {};
    const rows = Math.round((s1 - s0) / ROW) + 1;
    let cols = 0;
    const pos = [], col = [], idx = [];
    for (let r = 0; r < rows; r++) {
      const s = s0 + r * ROW;
      const k = road.kappa(s), inside = side * k < 0 && Math.abs(k) > 1e-5 ? 0.62 / Math.abs(k) : 1e9; // never fold over the inside of a bend
      const pr = densify(prof(s), s);
      cols = pr.length;
      pr.forEach(([dd, y], j) => {
        const d = Math.min(road.wall + dd, inside);
        road.toWorld(s, side * d, p);
        pos.push(p.x - base.x, y, p.z - base.z);
        col.push(...color(s, dd, y, j));
      });
    }
    for (let r = 1; r < rows; r++) for (let j = 1; j < cols; j++) {
      const a = (r - 1) * cols + j - 1, b = r * cols + j - 1, c = r * cols + j, d = (r - 1) * cols + j;
      idx.push(a, b, c, a, c, d);
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g = g.toNonIndexed(); // faceted: every triangle catches the light on its own
    g.computeVertexNormals();
    meshes.push(new THREE.Mesh(g, mat));
  }

  /** How much a tunnel's mountain covers s (0..1), and how much a bridge removes the land (0..1). */
  tunnelAmt(s, feats) { let k = 0; for (const f of feats) if (f.kind === 'tunnel') k = Math.max(k, smooth(f.a - 80, f.a - 6, s) * (1 - smooth(f.b + 6, f.b + 80, s))); return k; }
  bridgeAmt(s, feats) { let k = 0; for (const f of feats) if (f.kind === 'bridge') k = Math.max(k, smooth(f.a - 90, f.a + 40, s) * (1 - smooth(f.b - 40, f.b + 90, s))); return k; }
  /** Raise a profile into the hill a tunnel runs through. */
  mountain(pr, tk, ry) {
    if (tk <= 0) return pr;
    return pr.map(([dd, y], j) => {
      if (dd < 8) return [dd, lerp(y, ry - 0.05, tk)];
      const m = ry + 17 + Math.max(0, dd - 18) * 0.3;
      return [dd, lerp(y, Math.max(y, m), tk)];
    });
  }

  // ---------------------------------------------------------------- city

  buildCity() {
    const hi = this.hi;
    this.groundPlane(-34, 0x07090f);
    this.farRing(skylineTexture(), -34 + 128, 300);
    this.pillars = this.pool(new THREE.BoxGeometry(3.2, 1, 2.2), this.mat(new THREE.MeshLambertMaterial({ color: 0x2c3039 })), 6);
    // buildings: three shapes sharing one lit-window texture, red beacons on the tall ones
    const winTex = this.tex(windowTexture());
    winTex.anisotropy = 4;
    const bmat = this.mat(new THREE.MeshLambertMaterial({ color: 0x121722, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: hi ? 1.0 : 0.95 }));
    this.bPer = hi ? 14 : 8;
    this.bShapes = [[22, 70, 22], [34, 46, 26], [16, 110, 18]];
    this.buildings = this.bShapes.map(([w, h, d]) => this.pool(boxWithTiledUV(w, h, d), bmat, this.bPer));
    this.beaconMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false }));
    this.beacons = this.pool(new THREE.BoxGeometry(1.4, 1.4, 1.4), this.beaconMat, this.bPer);
    // neon billboards on tall poles beside the deck
    this.adTex = [['NOVA COLA', '#ff3b3b', 'ice cold since 1987'], ['ZENITH X', '#3de0ff', 'the phone that thinks'], ['HYPERDRIVE', '#6dff8a', 'energy for the night shift'], ['MIDNIGHT FM', '#ffb020', '101.7 · all night drive']].map((a) => this.tex(adTexture(...a)));
    this.adFaces = this.adTex.map((t) => this.pool(new THREE.PlaneGeometry(12, 5.2), this.mat(new THREE.MeshBasicMaterial({ map: t, color: hi ? new THREE.Color(1.5, 1.5, 1.5) : 0xffffff, side: THREE.DoubleSide })), 2));
    this.adFrames = this.pool(mergeGeos([new THREE.BoxGeometry(12.6, 5.8, 0.4).translate(0, 0, -0.25), new THREE.BoxGeometry(0.6, 1, 0.6).translate(0, -3.4, -0.3)]), this.mat(new THREE.MeshLambertMaterial({ color: 0x23272f })), 2);
    this.adPoles = this.pool(new THREE.CylinderGeometry(0.45, 0.6, 1, 8).translate(0, 0.5, 0), this.mat(new THREE.MeshLambertMaterial({ color: 0x2c3039 })), 2);
    // overhead sign gantries
    this.signMats = ['HARBOR', 'AIRPORT', 'DOWNTOWN', 'BAYSIDE', 'TUNNEL 2', 'NORTH LOOP', 'STADIUM', 'OLD TOWN'].map((t, i) => this.mat(new THREE.MeshBasicMaterial({ map: this.tex(signTexture(t, 10 + i * 3)), color: 0xc8d0c8 })));
    this.matSignFrame = this.mat(new THREE.MeshLambertMaterial({ color: 0x4a505c }));
    this.matSignLamp = this.mat(new THREE.MeshBasicMaterial({ color: hi ? new THREE.Color(2.2, 2.0, 1.6) : 0xfff0d0 }));
  }

  cityChunk(i, slot, s0, s1, base, meshes) {
    const road = this.w.road, p = {}, W = road.wall;
    // pillars every 40 m from the ground up to the deck
    for (let s = s0 + 10; s < s1; s += 40) { road.center(s, p); const top = p.y - 1.6, bot = -34; this.pillars.add(slot, p.x, (top + bot) / 2, p.z, p.h, 1, top - bot, 1); }
    // sign gantry every other chunk (not inside covered sections)
    if (i % 2 === 1 && !road.featureAt(s0 + CHUNK * 0.5) && !road.trapsIn(s0 - 60, s1 + 60).length) {
      const s = s0 + CHUNK * 0.5;
      road.center(s, p);
      const g = new THREE.Group(), span = W * 2 + 1.4;
      const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); };
      add(new THREE.BoxGeometry(span, 0.5, 0.5), this.matSignFrame, 0, 7.4, 0);
      add(new THREE.BoxGeometry(span, 0.25, 0.25), this.matSignFrame, 0, 8.6, 0.1);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.45, 8.8, 0.45), this.matSignFrame, sx * span / 2, 4.4, 0);
      const which = Math.floor(rng(i * 13 + this.w.seed)() * this.signMats.length), xs = road.lanes >= 3 ? [-3.8, 3.8] : [0];
      xs.forEach((sx, k) => {
        add(new THREE.PlaneGeometry(6, 2.6), this.signMats[(which + k) % this.signMats.length], sx, 7.6, -0.3, Math.PI);
        add(new THREE.BoxGeometry(5.6, 0.08, 0.18), this.matSignLamp, sx, 6.2, -0.55);
      });
      g.position.set(p.x - base.x, p.y, p.z - base.z);
      g.rotation.y = p.h;
      g.updateMatrixWorld(true);
      for (const m of g.children.slice()) { m.geometry = m.geometry.clone().applyMatrix4(m.matrixWorld); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.updateMatrix(); meshes.push(m); }
    }
    // billboards
    const r = rng(i * 7919 + this.w.seed * 31);
    for (let j = 0; j < 2; j++) {
      if (r() < 0.35) continue;
      const s = s0 + 20 + r() * (CHUNK - 40), side = r() < 0.5 ? -1 : 1, which = Math.floor(r() * this.adFaces.length);
      if (road.featureAt(s)) continue;
      road.toWorld(s, side * (W + 9 + r() * 6), p);
      const rot = p.h + (side < 0 ? 0.35 : -0.35), top = p.y + 6 + r() * 6;
      this.adPoles.add(slot, p.x, -34, p.z, rot, 1, top - 3.4 + 34, 1);
      this.adFrames.add(slot, p.x, top, p.z, rot + Math.PI);
      this.adFaces[which].add(slot, p.x - Math.sin(rot) * 0.0, top, p.z, rot + Math.PI);
    }
    // buildings
    this.buildings.forEach((pool, bi) => {
      for (let j = 0; j < this.bPer; j++) {
        if (r() < 0.45) continue;
        const side = j % 2 ? 1 : -1, s = s0 + r() * CHUNK;
        road.toWorld(s, side * (52 + r() * 140), p);
        const rot = p.h + (r() - 0.5) * 0.4, sx = 0.8 + r() * 0.5, sy = 0.6 + r() * 0.8, sz = 0.8 + r() * 0.5;
        pool.add(slot, p.x, -34, p.z, rot, sx, sy, sz);
        if (bi === 2) this.beacons.add(slot, p.x, -34 + this.bShapes[2][1] * sy + 0.7, p.z, rot);
      }
    });
  }

  // ---------------------------------------------------------------- coast

  buildCoast() {
    const hi = this.hi, m = this.m;
    this.farRing(islandTexture(), m.sea + 40, 110);
    // the sea: waves and the sun's glitter, fading into the haze
    const sun = m.sky.sun, fog = this.w.scene.fog;
    this.seaMat = this.mat(new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uDeep: { value: new THREE.Vector3(0.008, 0.045, 0.09) }, uSky: { value: new THREE.Vector3(0.16, 0.24, 0.4) }, uSunDir: { value: new THREE.Vector3(...sun.dir).normalize() }, uSunCol: { value: new THREE.Vector3(...sun.col) }, uFog: { value: fog.color }, uNear: { value: fog.near }, uFar: { value: fog.far * 1.6 }, uHi: { value: hi ? 1 : 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uT, uNear, uFar, uHi; uniform vec3 uDeep, uSky, uSunDir, uSunCol, uFog; varying vec3 vW;
        void main(){
          vec2 p = vW.xz; float t = uT;
          float a = p.x * 0.045 + t * 0.8, b = p.y * 0.052 - t * 0.7, c = (p.x + p.y) * 0.13 + t * 1.3, d = (p.x * 0.6 - p.y) * 0.31 - t * 1.9, e = (p.y * 0.8 + p.x * 0.3) * 0.7 + t * 2.6;
          vec2 g = vec2(cos(a) * 0.5 + cos(c) * 0.3 + cos(d) * 0.18 * 0.6 + cos(e) * 0.08, cos(b) * 0.5 + cos(c) * 0.3 - cos(d) * 0.18 + cos(e) * 0.1);
          vec3 N = normalize(vec3(-g.x * 0.11, 1.0, -g.y * 0.11));
          vec3 V = normalize(cameraPosition - vW);
          float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 R = reflect(-V, N);
          float sd = max(dot(R, uSunDir), 0.0);
          vec3 col = mix(uDeep, uSky, 0.1 + fr * 0.75) + uSunCol * (pow(sd, 260.0) * (uHi > 0.5 ? 7.0 : 3.0) + pow(sd, 10.0) * 0.35 + pow(sd, 3.0) * 0.08);
          float dist = length(cameraPosition.xz - vW.xz);
          col = mix(col, uFog, smoothstep(uNear, uFar, dist) * 0.92);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this.seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = m.sea;
    this.group.add(this.sea);
    this.landMat = this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.palms = this.pool(palmGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), 16);
    this.rocks = this.pool(rockGeometry(3), this.mat(new THREE.MeshLambertMaterial({ color: 0xffffff })), 12, true);
    // bridges: piers, towers and cables
    this.matConcrete = this.mat(new THREE.MeshLambertMaterial({ color: 0x8e8a84 }));
    this.matTower = this.mat(new THREE.MeshLambertMaterial({ color: 0xb04a2a }));
    this.matCable = this.mat(new THREE.MeshLambertMaterial({ color: 0xc0582f, side: THREE.DoubleSide }));
    this.matBeacon = this.mat(new THREE.MeshBasicMaterial({ color: hi ? new THREE.Color(3, 0.2, 0.15) : 0xff3020 }));
    this.piers = this.pool(new THREE.BoxGeometry(2.2, 1, 3.2).translate(0, 0.5, 0), this.matConcrete, 10);
    this.hangers = this.pool(new THREE.BoxGeometry(0.08, 1, 0.08).translate(0, 0.5, 0), this.matCable, 70);
  }

  coastProfile(s, side, ry, feats) {
    const seed = this.w.seed, sea = this.m.sea;
    const n = (k) => vnoise(seed + side * 7 + k, s * 0.011, k * 0.7);
    let pr;
    if (side > 0) { // hills inland
      const h = 0.6 + 0.8 * vnoise(seed + 3, s * 0.0025, 0);
      pr = [[0.3, ry - 0.05], [2.5, ry + 0.2], [7, ry + (2 + 3 * n(1)) * h], [16, ry + (6 + 10 * n(2)) * h], [32, ry + (14 + 22 * n(3)) * h], [60, ry + (28 + 35 * n(4)) * h], [110, ry + (45 + 50 * n(5)) * h], [220, ry + (60 + 60 * n(6)) * h], [420, ry + 70]];
    } else { // cliffs down to the sea
      const y2 = ry - 4 - 4 * n(1), y3 = Math.max(sea - 1, ry - 12 - 8 * n(2));
      pr = [[0.3, ry - 0.05], [2.5, ry - 0.6], [7, Math.min(y2, ry - 1)], [16, Math.min(y3, y2 - 1)], [28, sea - 0.5 + 2.5 * n(3)], [40, sea - 4], [70, sea - 12], [420, sea - 14]];
    }
    const bk = this.bridgeAmt(s, feats);
    if (bk > 0) pr = pr.map(([dd, y]) => [dd, lerp(y, sea - 14, bk)]);
    return this.mountain(pr, this.tunnelAmt(s, feats), ry);
  }

  coastChunk(i, slot, s0, s1, base, meshes, feats) {
    const road = this.w.road, p = {}, sea = this.m.sea, seed = this.w.seed;
    const ryAt = (s) => road.center(s, p).y;
    const sand = [0.66, 0.56, 0.4], rock = [0.46, 0.38, 0.3], grass = [0.2, 0.32, 0.12], dry = [0.5, 0.44, 0.22], gravel = [0.3, 0.29, 0.28];
    const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    for (const side of [-1, 1]) {
      this.strip(s0, s1, side, base, (s) => this.coastProfile(s, side, ryAt(s), feats), (s, dd, y, j) => {
        if (j === 0) return gravel;
        if (y < sea + 1.2) return mix3(sand, [0.2, 0.22, 0.2], Math.min(1, (sea + 1.2 - y) / 6));
        const nn = vnoise(seed + 9, s * 0.03, dd * 0.05), tint = 0.9 + hash(Math.round(s), Math.round(dd)) * 0.2, steep = side < 0 ? 1 : Math.min(1, dd / 80);
        const c = side < 0 ? mix3(rock, sand, nn * 0.4) : mix3(mix3(dry, grass, smooth(0.3, 0.7, nn)), rock, steep * 0.6 * (1 - nn * 0.5));
        return [c[0] * tint, c[1] * tint, c[2] * tint];
      }, this.landMat, meshes);
    }
    // props: palms along the inland side (and some on the cliff top), rocks on the shore
    const r = rng(i * 104729 + seed);
    for (let j = 0; j < 16; j++) {
      const s = s0 + r() * CHUNK, side = r() < 0.75 ? 1 : -1, dd = side > 0 ? 2.5 + r() * 14 : 1.2 + r() * 1.2;
      if (road.featureAt(s) || this.tunnelAmt(s, feats) > 0.05 || this.bridgeAmt(s, feats) > 0.05) continue;
      const ry = ryAt(s), pr = this.coastProfile(s, side, ry, feats);
      const y = profileY(pr, dd);
      if (side < 0 && y < ry - 1.5) continue;
      road.toWorld(s, side * (road.wall + dd), p);
      const k = 0.8 + r() * 0.5;
      this.palms.add(slot, p.x, y - 0.2, p.z, r() * 6.28, k, k * (0.85 + r() * 0.35), k);
    }
    for (let j = 0; j < 12; j++) {
      const s = s0 + r() * CHUNK, dd = 22 + r() * 18;
      if (this.bridgeAmt(s, feats) > 0.05) continue;
      const pr = this.coastProfile(s, -1, ryAt(s), feats), y = profileY(pr, dd);
      road.toWorld(s, -(road.wall + dd), p);
      const k = 0.6 + r() * 2.2, c = 0.55 + r() * 0.3;
      this.rocks.add(slot, p.x, y - k * 0.2, p.z, r() * 6.28, k * (1 + r()), k * (0.6 + r() * 0.5), k, 0, new THREE.Color(c * 0.82, c * 0.72, c * 0.62).getHex());
    }
    for (const f of feats) if (f.kind === 'bridge') this.bridge(f, Math.max(s0, f.a - 60), Math.min(s1, f.b + 60), slot, base, meshes);
  }

  /** Bridge parts between sa and sb: deck slab, piers, two towers with main cables and hangers. */
  bridge(f, sa, sb, slot, base, meshes) {
    if (sb <= sa) return;
    const road = this.w.road, W = road.wall, sea = this.m.sea, p = {};
    const local = (s, d, y) => { road.toWorld(s, d, p); return [p.x - base.x, y, p.z - base.z]; };
    const ry = (s) => road.center(s, p).y;
    // deck slab under the road
    const slab = [], n = Math.max(1, Math.ceil((sb - sa) / 4));
    for (let r = 0; r < n; r++) {
      const a = sa + ((sb - sa) * r) / n, b = sa + ((sb - sa) * (r + 1)) / n;
      for (const [d0, y0, d1, y1] of [[-(W + 0.6), -0.05, -(W + 0.6), -1.5], [W + 0.6, -0.05, W + 0.6, -1.5], [-(W + 0.6), -1.5, W + 0.6, -1.5]]) {
        const A = local(a, d0, ry(a) + y0), B = local(b, d0, ry(b) + y0), C = local(b, d1, ry(b) + y1), D = local(a, d1, ry(a) + y1);
        slab.push(A, B, C, A, C, D);
      }
    }
    meshes.push(triMesh(slab, this.matConcrete));
    // piers
    for (let s = Math.ceil((f.a - 40) / 45) * 45; s <= f.b + 40; s += 45) {
      if (s < sa || s >= sb) continue;
      const top = ry(s) - 1.5;
      for (const sx of [-1, 1]) { road.toWorld(s, sx * (W - 1.5), p); this.piers.add(slot, p.x, sea - 14, p.z, p.h, 1, top - sea + 14, 1); }
    }
    // towers at 30% and 70% of the span; cables sag between them and run down to the ends
    const len = f.b - f.a, T1 = f.a + len * 0.3, T2 = f.a + len * 0.7, TH = 44;
    const cableY = (s) => {
      if (s < T1) return ry(s) + 1.2 + (TH - 2 - 1.2) * Math.max(0, (s - f.a) / (T1 - f.a));
      if (s > T2) return ry(s) + 1.2 + (TH - 2 - 1.2) * Math.max(0, (f.b - s) / (f.b - T2));
      const u = (s - (T1 + T2) / 2) / ((T2 - T1) / 2);
      return ry(s) + 3 + (TH - 2 - 3) * u * u;
    };
    const dC = W + 1.6;
    for (const T of [T1, T2]) {
      if (T < sa || T >= sb) continue;
      const g = new THREE.Group(), base2 = road.center(T, {});
      const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); };
      const legH = base2.y + TH - (sea - 14);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(1.8, legH, 2.4), this.matTower, sx * dC, sea - 14 + legH / 2, 0);
      for (const h of [-2.2, 14, TH - 3]) add(new THREE.BoxGeometry(dC * 2 + 1.8, 1.6, 2), this.matTower, 0, base2.y + h, 0);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.matBeacon, sx * dC, base2.y + TH + 0.3, 0);
      g.position.set(base2.x - base.x, 0, base2.z - base.z);
      g.rotation.y = base2.h;
      g.updateMatrixWorld(true);
      for (const m of g.children.slice()) { m.geometry = m.geometry.clone().applyMatrix4(m.matrixWorld); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.updateMatrix(); meshes.push(m); }
    }
    const cab = [], cn = Math.max(2, Math.ceil((sb - sa) / 6));
    const ca = Math.max(sa, f.a), cb = Math.min(sb, f.b);
    if (cb > ca) {
      for (const sx of [-1, 1]) for (let r = 0; r < cn; r++) {
        const a = ca + ((cb - ca) * r) / cn, b = ca + ((cb - ca) * (r + 1)) / cn;
        const A = local(a, sx * dC, cableY(a) - 0.2), B = local(b, sx * dC, cableY(b) - 0.2), C = local(b, sx * dC, cableY(b) + 0.2), D = local(a, sx * dC, cableY(a) + 0.2);
        const A2 = local(a, sx * (dC - 0.2), cableY(a) + 0.2), B2 = local(b, sx * (dC - 0.2), cableY(b) + 0.2);
        cab.push(A, B, C, A, C, D, D, C, B2, D, B2, A2);
      }
      meshes.push(triMesh(cab, this.matCable));
      for (let s = Math.ceil(ca / 9) * 9; s < cb; s += 9) {
        if (Math.abs(s - T1) < 3 || Math.abs(s - T2) < 3) continue;
        const y0 = ry(s) + 0.9, y1 = cableY(s);
        if (y1 - y0 < 0.6) continue;
        for (const sx of [-1, 1]) { road.toWorld(s, sx * dC, p); this.hangers.add(slot, p.x, y0, p.z, p.h, 1, y1 - y0, 1); }
      }
    }
  }

  // ---------------------------------------------------------------- canyon

  buildCanyon() {
    const hi = this.hi;
    this.groundPlane(-42, 0x1a110c);
    this.farRing(mesaTexture(), -42 + 70, 180);
    this.landMat = this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.cacti = this.pool(cactusGeometry(), this.mat(new THREE.MeshLambertMaterial({ color: 0x3b6a3c })), 14);
    this.rocks = this.pool(rockGeometry(7), this.mat(new THREE.MeshLambertMaterial({ color: 0xffffff })), 14, true);
    this.mesas = this.pool(mesaGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true })), 3, true);
    this.refl = this.pool(new THREE.BoxGeometry(0.1, 1.05, 0.1).translate(0, 0.52, 0), this.mat(new THREE.MeshLambertMaterial({ color: 0xe8e8e8 })), 14);
    this.reflGlow = this.pool(new THREE.BoxGeometry(0.075, 0.14, 0.03).translate(0, 0.9, -0.06), this.mat(new THREE.MeshBasicMaterial({ color: hi ? new THREE.Color(3, 1.4, 0.2) : 0xffa020 })), 14);
  }

  canyonProfile(s, side, ry, feats) {
    const seed = this.w.seed;
    const n = (k) => vnoise(seed + side * 5 + k, s * 0.012, k * 0.9);
    // how closed-in the canyon is here: narrow gorges and wide open desert, changing slowly
    const nk = smooth(0.25, 0.75, vnoise(seed + 77, s * 0.0011, side * 0.3));
    const sp = 1 + (1 - nk) * 2.2, hk = 0.45 + nk * 0.55;
    let pr = [[0.3, ry - 0.05], [3 * sp, ry + 0.2 + 0.4 * n(1)], [8 * sp, ry + 1.5 + 2 * n(2)], [14 * sp, ry + (6 + 8 * n(3)) * hk], [22 * sp, ry + (18 + 16 * n(4)) * hk], [34 * sp, ry + (38 + 20 * n(5)) * hk], [55 * sp, ry + (55 + 25 * n(6)) * hk], [95 * sp, ry + (62 + 30 * n(7)) * hk], [420, ry + 58 * hk]];
    pr = pr.map(([dd, y]) => [Math.min(dd, 400), y]);
    return this.mountain(pr, this.tunnelAmt(s, feats), ry);
  }

  canyonChunk(i, slot, s0, s1, base, meshes, feats) {
    const road = this.w.road, p = {}, seed = this.w.seed;
    const ryAt = (s) => road.center(s, p).y;
    const sand = [0.42, 0.27, 0.16], dark = [0.36, 0.12, 0.05], red = [0.66, 0.27, 0.1], pale = [0.8, 0.5, 0.26];
    const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    for (const side of [-1, 1]) {
      this.strip(s0, s1, side, base, (s) => this.canyonProfile(s, side, ryAt(s), feats), (s, dd, y, j) => {
        if (j <= 1) return mix3([0.24, 0.2, 0.17], sand, j);
        const band = 0.5 + 0.5 * Math.sin((y - ryAt(s) * 0.3) * 0.55 + vnoise(seed + 4, s * 0.02, y * 0.05) * 2.5);
        const tint = 0.88 + hash(Math.round(s), Math.round(dd * 3)) * 0.24;
        const c = mix3(mix3(dark, red, band), pale, Math.max(0, band - 0.72) * 2.2);
        const o = j === 2 ? mix3(sand, c, 0.5) : c;
        return [o[0] * tint, o[1] * tint, o[2] * tint];
      }, this.landMat, meshes);
    }
    const r = rng(i * 7393 + seed * 3);
    for (let j = 0; j < 14; j++) {
      const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1, dd = 2.5 + r() * 16;
      if (road.featureAt(s) || this.tunnelAmt(s, feats) > 0.05) continue;
      const pr = this.canyonProfile(s, side, ryAt(s), feats), y = profileY(pr, dd);
      if (y - ryAt(s) > 3) continue; // only on the flats
      road.toWorld(s, side * (road.wall + dd), p);
      const k = 0.7 + r() * 0.6;
      this.cacti.add(slot, p.x, y - 0.1, p.z, r() * 6.28, k, k * (0.8 + r() * 0.5), k);
    }
    for (let j = 0; j < 14; j++) {
      const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1, dd = 3 + r() * 30;
      if (this.tunnelAmt(s, feats) > 0.05) continue;
      const pr = this.canyonProfile(s, side, ryAt(s), feats), y = profileY(pr, dd);
      road.toWorld(s, side * (road.wall + dd), p);
      const k = 0.4 + r() * r() * 3, c = 0.5 + r() * 0.3;
      this.rocks.add(slot, p.x, y - k * 0.25, p.z, r() * 6.28, k * (1 + r() * 0.6), k * (0.5 + r() * 0.6), k, 0, new THREE.Color(c, c * 0.55, c * 0.38).getHex());
    }
    // reflector posts every 32 m, both sides
    for (let s = Math.ceil(s0 / 32) * 32; s < s1; s += 32) {
      if (road.featureAt(s)) continue;
      for (const side of [-1, 1]) {
        road.toWorld(s, side * (road.wall + 1.0), p);
        const rot = p.h;
        this.refl.add(slot, p.x, p.y - 0.05, p.z, rot);
        this.reflGlow.add(slot, p.x, p.y - 0.05, p.z, rot);
      }
    }
    // a big mesa far out now and then
    for (let j = 0; j < 3; j++) {
      if (r() < 0.4) continue;
      const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1;
      road.toWorld(s, side * (260 + r() * 260), p);
      const w = 40 + r() * 70, h = 60 + r() * 90, c = 0.75 + r() * 0.25;
      this.mesas.add(slot, p.x, -42, p.z, r() * 6.28, w, h, w * (0.6 + r() * 0.6), 0, new THREE.Color(c, c, c).getHex());
    }
  }
}

/** Extra columns between the profile's points, nudged up and down, so slopes look rocky rather than smooth. */
function densify(pr, s) {
  const out = [pr[0]];
  for (let j = 1; j < pr.length; j++) {
    const [d0, y0] = pr[j - 1], [d1, y1] = pr[j];
    const k = j >= 4 ? 3 : j >= 2 ? 2 : 1; // fixed per column so every row has the same count
    for (let i = 1; i <= k; i++) {
      const u = i / k, d = d0 + (d1 - d0) * u;
      const jitter = i < k && j > 1 ? (hash(Math.round(s / 8), j * 7 + i) - 0.5) * Math.min(6, (d1 - d0) * 0.18) : 0;
      out.push([d, y0 + (y1 - y0) * u + jitter]);
    }
  }
  return out;
}

/** Height of a profile at dOffset dd (linear between columns). */
function profileY(pr, dd) {
  for (let j = 1; j < pr.length; j++) if (dd <= pr[j][0]) { const u = (dd - pr[j - 1][0]) / (pr[j][0] - pr[j - 1][0]); return lerp(pr[j - 1][1], pr[j][1], u); }
  return pr[pr.length - 1][1];
}

// ---------------------------------------------------------------- prop geometry

function palmGeometry() {
  const pos = [], col = [];
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(...k); };
  // trunk: rings bending out to one side
  const H = 9, segs = 7, sides = 6, bend = (y) => 1.1 * (y / H) ** 2;
  const ring = (y, r) => Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2; return [Math.cos(a) * r + bend(y), y, Math.sin(a) * r]; });
  for (let k = 0; k < segs; k++) {
    const y0 = (k / segs) * H, y1 = ((k + 1) / segs) * H, r0 = 0.27 - (k / segs) * 0.1, r1 = 0.27 - ((k + 1) / segs) * 0.1;
    const A = ring(y0, r0), B = ring(y1, r1), c = k % 2 ? [0.42, 0.33, 0.24] : [0.36, 0.28, 0.2];
    for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; tri(A[i], A[j], B[j], c); tri(A[i], B[j], B[i], c); }
  }
  // fronds drooping out from the top
  const top = [bend(H), H, 0];
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2 + (f % 2) * 0.2, dx = Math.cos(a), dz = Math.sin(a), L = 3.6 + (f % 3) * 0.4;
    let prevL = null, prevR = null;
    for (let i = 0; i <= 5; i++) {
      const u = i / 5, w = 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.1)) + 0.05;
      const cx = top[0] + dx * L * u, cy = top[1] + 0.6 * u - 2.2 * u * u, cz = top[2] + dz * L * u;
      const L2 = [cx - dz * w, cy, cz + dx * w], R2 = [cx + dz * w, cy, cz - dx * w], c = [0.16 + u * 0.08, 0.34 - u * 0.06, 0.12];
      if (prevL) { tri(prevL, prevR, R2, c); tri(prevL, R2, L2, c); }
      prevL = L2; prevR = R2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function cactusGeometry() {
  const parts = [new THREE.CylinderGeometry(0.26, 0.3, 4.2, 8).translate(0, 2.1, 0), new THREE.SphereGeometry(0.26, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 4.2, 0)];
  for (const [sx, h0, h1] of [[1, 1.6, 3.2], [-1, 2.2, 3.6]]) {
    parts.push(new THREE.CylinderGeometry(0.17, 0.17, 0.75, 6).rotateZ(Math.PI / 2).translate(sx * 0.55, h0, 0));
    parts.push(new THREE.CylinderGeometry(0.17, 0.17, h1 - h0, 6).translate(sx * 0.9, (h0 + h1) / 2, 0));
    parts.push(new THREE.SphereGeometry(0.17, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(sx * 0.9, h1, 0));
  }
  return mergeGeos(parts);
}

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position'), r = rng(seed);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k == null) { k = 0.75 + r() * 0.5; seen.set(key, k); }
    p.setXYZ(i, p.getX(i) * k, Math.max(-0.2, p.getY(i) * k), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A flat-topped butte with layered colour bands, 1 unit wide and tall (scaled per instance). */
function mesaGeometry() {
  const g = new THREE.CylinderGeometry(0.42, 0.5, 1, 9, 6).translate(0, 0.5, 0);
  const p = g.getAttribute('position'), col = [];
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), b = 0.5 + 0.5 * Math.sin(y * 19); col.push(0.34 + b * 0.18, 0.15 + b * 0.08, 0.09 + b * 0.04); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------- textures

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

/** Hazy islands and headlands on the horizon, two layers. */
function islandTexture() {
  const W = 2048, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const r = rng(808);
  for (const [shade, amp, base] of [['rgba(78,84,104,0.85)', 70, 0.62], ['rgba(46,50,64,0.95)', 50, 0.8]]) {
    x.fillStyle = shade;
    x.beginPath(); x.moveTo(0, H);
    let y = H * base;
    const bumps = [];
    for (let i = 0; i < 9; i++) bumps.push([r() * W, 60 + r() * 220, amp * (0.3 + r() * 0.9)]);
    for (let px = 0; px <= W; px += 8) {
      let h = 0;
      for (const [cx, w, a] of bumps) for (const o of [-W, 0, W]) { const d = (px - cx - o) / w; h = Math.max(h, a * Math.exp(-d * d)); }
      y = H * base - h + Math.sin(px * 0.05) * 1.5;
      x.lineTo(px, y);
    }
    x.lineTo(W, H); x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Flat-topped mesas and buttes in silhouette. */
function mesaTexture() {
  const W = 2048, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const r = rng(515);
  for (const [shade, scale] of [['#1a0f12', 0.75], ['#0d0709', 1]]) {
    x.fillStyle = shade;
    for (let px = -100; px < W + 100;) {
      const w = 60 + r() * 220, h = (30 + r() * 110) * scale, slope = 10 + r() * 30;
      x.beginPath(); x.moveTo(px, H); x.lineTo(px + slope, H - h); x.lineTo(px + w - slope, H - h + r() * 6); x.lineTo(px + w, H); x.closePath(); x.fill();
      px += w * (0.5 + r() * 0.9);
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

/** A glowing billboard for a made-up brand. */
function adTexture(title, color, tag) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 222;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 222); g.addColorStop(0, '#10131c'); g.addColorStop(1, '#05060a');
  x.fillStyle = g; x.fillRect(0, 0, 512, 222);
  x.strokeStyle = color; x.lineWidth = 6; x.shadowColor = color; x.shadowBlur = 18;
  x.strokeRect(14, 14, 484, 194);
  x.fillStyle = color; x.font = 'bold 64px system-ui, sans-serif'; x.textAlign = 'center';
  x.fillText(title, 256, 112);
  x.shadowBlur = 0; x.fillStyle = '#e8ecf4'; x.font = '600 26px system-ui, sans-serif';
  x.fillText(tag, 256, 166);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
