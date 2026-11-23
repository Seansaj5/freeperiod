// The look of each map beyond the road itself:
//   city   - elevated deck on pillars, towers with lit windows, neon billboards, sign gantries, skyline
//   coast  - sea with the setting sun on it, cliffs and hills, palm trees, suspension bridges, islands
//   canyon - red rock walls, mesas, cacti, boulders and reflector posts, under a starry sky
//   alpine - snowy mountain walls and valleys, pine forest, rocks and snow poles, jagged peaks far off
//   keys   - a beach city at dusk: neon hotels and signs, palm rows, a beach with flamingos, causeways over the bay
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
    const look = (this.look = m.look || m.id);
    if (look === 'city') this.buildCity();
    else if (look === 'coast') this.buildCoast();
    else if (look === 'alpine') this.buildAlpine();
    else if (look === 'keys') this.buildKeys();
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
    if (this.look === 'city') this.cityChunk(i, slot, s0, s1, base, meshes);
    else if (this.look === 'coast') this.coastChunk(i, slot, s0, s1, base, meshes, feats);
    else if (this.look === 'alpine') this.alpineChunk(i, slot, s0, s1, base, meshes, feats);
    else if (this.look === 'keys') this.keysChunk(i, slot, s0, s1, base, meshes, feats);
    else this.canyonChunk(i, slot, s0, s1, base, meshes, feats);
  }

  tick(time) {
    this.time = time;
    if (this.beaconMat) { const on = Math.sin(time * 3.2) > 0.3 ? (this.hi ? 2.5 : 1) : 0.1; this.beaconMat.color.setRGB(on, on * 0.06, on * 0.06); }
    if (this.seaMat) this.seaMat.uniforms.uT.value = time;
    if (this.flickMat) { const on = Math.sin(time * 2.1) > 0.82 && Math.sin(time * 37) > 0.2 ? 0.25 : 1; this.flickMat.color.setScalar(on * this.flickK); }
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
  strip(s0, s1, side, base, prof, color, mat, meshes, flat = false) {
    const road = this.w.road, p = {};
    const rows = Math.round((s1 - s0) / ROW) + 1;
    let cols = 0;
    const pos = [], col = [], idx = [];
    for (let r = 0; r < rows; r++) {
      const s = s0 + r * ROW;
      const k = road.kappa(s), inside = side * k < 0 && Math.abs(k) > 1e-5 ? 0.62 / Math.abs(k) : 1e9; // never fold over the inside of a bend
      const pr = flat ? prof(s) : densify(prof(s), s); // flat: the profile as given (built-up ground), no rough terrain added
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
    this.addSea([0.008, 0.045, 0.09], [0.16, 0.24, 0.4]);
    this.landMat = this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.palms = this.pool(palmGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), 16);
    this.rocks = this.pool(rockGeometry(3), this.mat(new THREE.MeshLambertMaterial({ color: 0xffffff })), 12, true);
    this.addBridgeKit(0x8e8a84, 0xb04a2a, 0xc0582f, hi ? new THREE.Color(3, 0.2, 0.15) : 0xff3020);
  }

  /** The sea: waves and the sun's glitter, fading into the haze. deep / sky = the water's own colour and what it mirrors. */
  addSea(deep, sky) {
    const hi = this.hi, m = this.m, sun = m.sky.sun, fog = this.w.scene.fog;
    this.seaMat = this.mat(new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uDeep: { value: new THREE.Vector3(...deep) }, uSky: { value: new THREE.Vector3(...sky) }, uSunDir: { value: new THREE.Vector3(...sun.dir).normalize() }, uSunCol: { value: new THREE.Vector3(...sun.col) }, uFog: { value: fog.color }, uNear: { value: fog.near }, uFar: { value: fog.far * 1.6 }, uHi: { value: hi ? 1 : 0 } },
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
  }

  /** What bridge() builds from: piers, towers, cables and their beacons. */
  addBridgeKit(concrete, tower, cable, beacon) {
    this.matConcrete = this.mat(new THREE.MeshLambertMaterial({ color: concrete }));
    this.matTower = this.mat(new THREE.MeshLambertMaterial({ color: tower }));
    this.matCable = this.mat(new THREE.MeshLambertMaterial({ color: cable, side: THREE.DoubleSide }));
    this.matBeacon = this.mat(new THREE.MeshBasicMaterial({ color: beacon }));
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

  // ---------------------------------------------------------------- keys (a neon beach city at dusk)

  buildKeys() {
    const hi = this.hi, m = this.m, glow = hi ? 2.4 : 1;
    this.farRing(neonSkylineTexture(), m.sea + 58, 150);
    this.addSea([0.0, 0.1, 0.13], [0.5, 0.26, 0.46]);
    this.landMat = this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.palms = this.pool(palmGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), 36);
    // causeways: pale towers, mint cables, and a tube of neon along each rail
    this.addBridgeKit(0xb4a8b0, 0xf0e6ee, 0x8fd9d2, hi ? new THREE.Color(3, 0.3, 1.8) : 0xff3aa8);
    this.matNeon = [[1, 0.16, 0.6], [0.1, 0.85, 1]].map((c) => this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] * glow, c[1] * glow, c[2] * glow), side: THREE.DoubleSide })));
    // hotels: pastel walls (each its own colour), lit windows, and a matching set of neon lines
    const winTex = this.tex(windowTexture());
    winTex.anisotropy = 4;
    const wall = this.mat(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: hi ? 0.85 : 0.8 }));
    const neon = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(glow, glow, glow) }));
    this.hShapes = [[34, 21, 22], [26, 31.5, 20]];
    this.hotels = this.hShapes.map(([w, h, d]) => this.pool(hotelGeometry(w, h, d), wall, 4, true));
    this.hotelNeon = this.hShapes.map(([w, h, d]) => this.pool(hotelNeonGeometry(w, h, d), neon, 4, true));
    // glass towers behind them, each with a lit crown
    const glass = this.mat(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: hi ? 1.0 : 0.9 }));
    this.towers = this.pool(boxWithTiledUV(24, 84, 24), glass, 5, true);
    this.crowns = this.pool(mergeGeos([new THREE.BoxGeometry(24.8, 0.9, 24.8).translate(0, 84.4, 0), new THREE.BoxGeometry(0.5, 9, 0.5).translate(0, 89, 0)]), neon, 5, true);
    // roadside neon: tall motel signs and billboards for made-up brands
    this.signTex = [['MOTEL', '#ff3aa8', '#3de0ff'], ['HOTEL', '#3de0ff', '#ff3aa8'], ['DINER', '#ffd23a', '#ff3aa8'], ['ARCADE', '#b56bff', '#3de0ff']].map((a) => this.tex(pylonTexture(...a)));
    const signMats = this.signTex.map((t) => this.mat(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(hi ? 1.7 : 1, hi ? 1.7 : 1, hi ? 1.7 : 1), side: THREE.DoubleSide })));
    this.flickMat = signMats[0]; this.flickK = hi ? 1.7 : 1;
    this.signFaces = signMats.map((mt) => this.pool(new THREE.PlaneGeometry(3.4, 10.2).translate(0, 9.4, 0), mt, 2));
    this.signPosts = this.pool(mergeGeos([new THREE.BoxGeometry(3.9, 10.7, 0.5).translate(0, 9.4, 0), new THREE.BoxGeometry(0.55, 4.2, 0.55).translate(0, 2.1, 0)]), this.mat(new THREE.MeshLambertMaterial({ color: 0x2a2233 })), 3);
    this.adTex = [['CORAL COLA', '#ff5a8a', 'taste the sunset'], ['FLAMINGO FM', '#ff3aa8', '99.9 · beach all night'], ['WAVE RIDER', '#3de0ff', 'surf · skate · arcade'], ['NEON PALMS', '#6dff8a', 'motel · pool · vacancy']].map((a) => this.tex(adTexture(...a)));
    this.adFaces = this.adTex.map((t) => this.pool(new THREE.PlaneGeometry(12, 5.2), this.mat(new THREE.MeshBasicMaterial({ map: t, color: hi ? new THREE.Color(1.5, 1.5, 1.5) : 0xffffff, side: THREE.DoubleSide })), 2));
    this.adFrames = this.pool(mergeGeos([new THREE.BoxGeometry(12.6, 5.8, 0.4).translate(0, 0, -0.25), new THREE.BoxGeometry(0.6, 1, 0.6).translate(0, -3.4, -0.3)]), this.mat(new THREE.MeshLambertMaterial({ color: 0x2a2233 })), 2);
    this.adPoles = this.pool(new THREE.CylinderGeometry(0.45, 0.6, 1, 8).translate(0, 0.5, 0), this.mat(new THREE.MeshLambertMaterial({ color: 0x3a3144 })), 2);
    // the beach: flamingos in the shallows, umbrellas, lifeguard huts, boats out on the bay
    this.flamingos = this.pool(flamingoGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a0c1c })), 9);
    this.umbrellas = this.pool(umbrellaGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), 8, true);
    this.huts = this.pool(hutGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true })), 1, true);
    this.boats = this.pool(boatGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true })), 2);
  }

  keysProfile(s, side, ry, feats) {
    const seed = this.w.seed, sea = this.m.sea;
    const n = (k) => vnoise(seed + side * 5 + k, s * 0.02, k * 0.9);
    let pr;
    if (side > 0) pr = [[0.3, ry - 0.05], [3, ry - 0.03], [9, ry - 0.03], [40, ry], [95, ry + 0.5 * n(1)], [180, ry], [300, ry - 1.5], [420, sea - 3]]; // the city: built-up and flat
    else pr = [[0.3, ry - 0.05], [2.4, ry - 0.04], [5, ry - 0.5], [14, sea + 1.5 + 0.7 * n(1)], [30, sea + 0.55 + 0.25 * n(2)], [44, sea - 0.5], [70, sea - 3], [420, sea - 9]]; // the beach, down into the bay
    const bk = this.bridgeAmt(s, feats);
    if (bk > 0) pr = pr.map(([dd, y], j) => [dd, j === 0 ? y : lerp(y, sea - 9, bk)]);
    return pr;
  }

  keysChunk(i, slot, s0, s1, base, meshes, feats) {
    const road = this.w.road, p = {}, sea = this.m.sea, seed = this.w.seed, W = road.wall;
    const q = {}, ryAt = (s) => road.center(s, q).y; // its own scratch point: p holds the spot a prop is being placed at
    const land = (s) => this.bridgeAmt(s, feats) < 0.03;
    const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const kerb = [0.66, 0.6, 0.64], walk = [0.72, 0.58, 0.62], sand = [0.84, 0.7, 0.54], wet = [0.5, 0.42, 0.38], bed = [0.1, 0.3, 0.32], lot = [0.17, 0.15, 0.2], lawn = [0.14, 0.3, 0.17];
    for (const side of [-1, 1]) {
      this.strip(s0, s1, side, base, (s) => this.keysProfile(s, side, ryAt(s), feats), (s, dd, y, j) => {
        if (j === 0) return kerb;
        if (y < sea + 0.3) return mix3(wet, bed, Math.min(1, (sea + 0.3 - y) / 2.5));
        if (dd < 9.5) return walk;
        const tint = 0.92 + hash(Math.round(s), Math.round(dd)) * 0.16;
        if (side < 0) return [sand[0] * tint, sand[1] * tint, sand[2] * tint];
        const c = vnoise(seed + 17, s * 0.02, dd * 0.03) > 0.55 ? lawn : lot;
        return [c[0] * tint, c[1] * tint, c[2] * tint];
      }, this.landMat, meshes, true);
    }
    const r = rng(i * 92821 + seed * 13);
    // palm rows along both kerbs, like a boulevard
    for (let s = Math.ceil(s0 / 13) * 13; s < s1; s += 13) {
      if (!land(s)) continue;
      const ry = ryAt(s);
      for (const side of [-1, 1]) {
        const h = hash(seed + 41, Math.round(s), side), k = 0.9 + h * 0.35;
        road.toWorld(s, side * (W + 3.1), p);
        this.palms.add(slot, p.x, ry - 0.25, p.z, h * 6.28, k, k * (0.95 + h * 0.3), k);
      }
    }
    // the city side: a row of hotels facing the road, glass towers behind
    for (let j = 0; j < 4; j++) {
      const s = s0 + 20 + j * 40 + (r() - 0.5) * 6, which = r() < 0.55 ? 0 : 1, dd = 25 + r() * 7, sx = 0.92 + r() * 0.2, sy = 0.78 + r() * 0.5, turn = 0.16 + r() * 0.3;
      const wallCol = PASTEL[Math.floor(r() * PASTEL.length)], neonCol = NEON[Math.floor(r() * NEON.length)];
      if (!land(s) || !land(s - 22) || !land(s + 22)) continue;
      road.toWorld(s, W + dd, p);
      const rot = p.h + Math.PI / 2 + turn, y = ryAt(s) - 0.4;
      this.hotels[which].add(slot, p.x, y, p.z, rot, sx, sy, 1, 0, wallCol);
      this.hotelNeon[which].add(slot, p.x, y, p.z, rot, sx, sy, 1, 0, neonCol);
    }
    for (let j = 0; j < 5; j++) {
      const s = s0 + r() * CHUNK, dd = 78 + r() * 150, sx = 0.8 + r() * 0.6, sy = 0.5 + r() * 0.75, col = GLASS_TINT[Math.floor(r() * GLASS_TINT.length)], crown = NEON[Math.floor(r() * NEON.length)];
      if (!land(s) || r() < 0.25) continue;
      road.toWorld(s, W + dd, p);
      const rot = p.h + (r() - 0.5) * 0.5, y = ryAt(s) - 0.5;
      this.towers.add(slot, p.x, y, p.z, rot, sx, sy, sx, 0, col);
      this.crowns.add(slot, p.x, y, p.z, rot, sx, sy, sx, 0, crown);
    }
    // one tall neon sign and maybe a billboard, turned to face the cars coming
    {
      const s = s0 + 30 + r() * (CHUNK - 60), which = Math.floor(r() * this.signFaces.length);
      if (land(s) && !road.trapsIn(s - 40, s + 40).length) {
        road.toWorld(s, W + 6.4, p);
        const y = ryAt(s) - 0.1, rot = p.h + Math.PI - 0.22;
        this.signPosts.add(slot, p.x, y, p.z, rot);
        this.signFaces[which].add(slot, p.x - Math.sin(rot) * 0.27, y, p.z - Math.cos(rot) * 0.27, rot + Math.PI);
        this.signFaces[which].add(slot, p.x + Math.sin(rot) * 0.27, y, p.z + Math.cos(rot) * 0.27, rot);
      }
    }
    if (r() < 0.6) {
      const s = s0 + 20 + r() * (CHUNK - 40), which = Math.floor(r() * this.adFaces.length);
      if (land(s)) {
        road.toWorld(s, W + 12 + r() * 3, p);
        const g = ryAt(s) - 0.3, rot = p.h - 0.4, top = g + 15 + r() * 4;
        this.adPoles.add(slot, p.x, g, p.z, rot, 1, top - 3.4 - g, 1);
        this.adFrames.add(slot, p.x, top, p.z, rot + Math.PI);
        this.adFaces[which].add(slot, p.x, top, p.z, rot + Math.PI);
      }
    }
    // the beach side: umbrellas, a lifeguard hut, flamingos wading, a boat out on the bay
    for (let j = 0; j < 8; j++) {
      const s = s0 + r() * CHUNK, dd = 11 + r() * 16, col = BEACH[Math.floor(r() * BEACH.length)], k = 0.9 + r() * 0.3, a = r() * 6.28;
      if (!land(s)) continue;
      road.toWorld(s, -(W + dd), p);
      this.umbrellas.add(slot, p.x, profileY(this.keysProfile(s, -1, ryAt(s), feats), dd) - 0.05, p.z, a, k, k, k, (r() - 0.5) * 0.2, col);
    }
    if (r() < 0.55) {
      const s = s0 + 20 + r() * (CHUNK - 40), dd = 17 + r() * 5, col = PASTEL[Math.floor(r() * PASTEL.length)];
      if (land(s)) { road.toWorld(s, -(W + dd), p); this.huts.add(slot, p.x, profileY(this.keysProfile(s, -1, ryAt(s), feats), dd) - 0.1, p.z, p.h + Math.PI / 2 + (r() - 0.5) * 0.4, 1, 1, 1, 0, col); }
    }
    if (r() < 0.7) {
      const s = s0 + 20 + r() * (CHUNK - 40), n = 5 + Math.floor(r() * 5);
      for (let j = 0; j < n; j++) {
        const sj = s + (r() - 0.5) * 16, dd = 36.5 + r() * 6, k = 0.85 + r() * 0.35;
        if (!land(sj)) continue;
        road.toWorld(sj, -(W + dd), p);
        this.flamingos.add(slot, p.x, sea - 0.22, p.z, r() * 6.28, k, k, k);
      }
    }
    for (let j = 0; j < 2; j++) {
      if (r() < 0.55) continue;
      const s = s0 + r() * CHUNK, bk = this.bridgeAmt(s, feats), side = bk > 0.9 && r() < 0.5 ? 1 : -1, dd = 80 + r() * 190;
      if (side > 0 && bk < 0.9) continue;
      road.toWorld(s, side * (W + dd), p);
      this.boats.add(slot, p.x, sea - 0.05, p.z, r() * 6.28, 1, 1, 1 + r() * 0.6);
    }
    // causeways: the bridge itself, with a line of neon along each rail
    for (const f of feats) if (f.kind === 'bridge') {
      this.bridge(f, Math.max(s0, f.a - 60), Math.min(s1, f.b + 60), slot, base, meshes);
      const a = Math.max(s0, f.a - 40), b = Math.min(s1, f.b + 40);
      if (b <= a) continue;
      [-1, 1].forEach((side, k) => {
        const tube = [];
        for (let s = a; s < b; s += 4) {
          const e = Math.min(b, s + 4), d = side * (W + 0.62);
          const P = (ss, y) => { road.toWorld(ss, d, p); return [p.x - base.x, p.y + y, p.z - base.z]; };
          const A = P(s, 0.98), B = P(e, 0.98), C = P(e, 1.12), D = P(s, 1.12);
          tube.push(A, B, C, A, C, D);
        }
        meshes.push(triMesh(tube, this.matNeon[k]));
      });
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

// ---------------------------------------------------------------- alpine
Scenery.prototype.buildAlpine = function () {
  const hi = this.hi;
  this.groundPlane(-30, 0x9aa6b8);
  this.farRing(peaksTexture(), -30 + 110, 300);
  this.landMat = this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  this.pines = this.pool(pineGeometry(), this.mat(new THREE.MeshLambertMaterial({ vertexColors: true })), hi ? 34 : 20);
  this.rocks = this.pool(rockGeometry(11), this.mat(new THREE.MeshLambertMaterial({ color: 0xffffff })), 10, true);
  // snow poles with orange tips, every 25 m both sides (they mark the edge when it's white out)
  this.poles = this.pool(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6).translate(0, 1.1, 0), this.mat(new THREE.MeshLambertMaterial({ color: 0x1a1c20 })), 20);
  this.poleTips = this.pool(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6).translate(0, 1.95, 0), this.mat(new THREE.MeshBasicMaterial({ color: hi ? new THREE.Color(2.2, 0.8, 0.15) : 0xff7a1a })), 20);
};

/** One side of the pass: a mountain wall going up, or a drop into the valley, swapping every so often. */
Scenery.prototype.alpineProfile = function (s, side, ry, feats) {
  const seed = this.w.seed, n = (k) => vnoise(seed + side * 9 + k, s * 0.014, k * 0.7);
  const up = smooth(0.35, 0.65, vnoise(seed + 31, s * 0.0012, side * 0.7)); // 1 = mountain on this side, 0 = valley
  const wall = [[0.3, ry - 0.05], [2.5, ry + 0.6 + n(1) * 0.5], [6, ry + 4 + n(2) * 3], [12, ry + 14 + n(3) * 8], [22, ry + 32 + n(4) * 14], [40, ry + 58 + n(5) * 22], [80, ry + 90 + n(6) * 30], [420, ry + 120]];
  const vale = [[0.3, ry - 0.05], [2.5, ry - 0.4], [6, ry - 3 - n(1) * 2], [14, ry - 10 - n(2) * 6], [30, ry - 22 - n(3) * 8], [70, ry - 30 - n(4) * 6], [160, ry - 18 + n(5) * 20], [420, ry + 60 + n(6) * 40]];
  let pr = wall.map(([dd, y], j) => [dd, lerp(vale[j][1], y, up)]);
  pr = pr.map(([dd, y]) => [Math.min(dd, 400), Math.max(y, -29)]);
  return this.mountain(pr, this.tunnelAmt(s, feats), ry);
};

Scenery.prototype.alpineChunk = function (i, slot, s0, s1, base, meshes, feats) {
  const road = this.w.road, p = {}, seed = this.w.seed;
  const ryAt = (s) => road.center(s, p).y;
  const snow = [0.86, 0.9, 0.97], shade = [0.62, 0.68, 0.8], rock = [0.3, 0.31, 0.34], rock2 = [0.42, 0.42, 0.45];
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  for (const side of [-1, 1]) {
    let prev = null;
    this.strip(s0, s1, side, base, (s) => (prev = this.alpineProfile(s, side, ryAt(s), feats)), (s, dd, y, j) => {
      if (j === 0) return [0.5, 0.52, 0.58]; // ploughed slush by the barrier
      const ry = ryAt(s), h = y - ry;
      const r = vnoise(seed + 5, s * 0.03, y * 0.09), steep = Math.abs(h) > 10 && r > 0.55;
      const c = steep ? mix3(rock, rock2, vnoise(seed + 6, s * 0.1, y * 0.2)) : mix3(snow, shade, smooth(-20, 40, -h) * 0.5 + vnoise(seed + 7, s * 0.02, dd * 0.05) * 0.25);
      const tint = 0.94 + hash(Math.round(s), Math.round(dd * 3)) * 0.1;
      return [c[0] * tint, c[1] * tint, c[2] * tint];
    }, this.landMat, meshes);
  }
  const r = rng(i * 9127 + seed * 5);
  for (let j = 0; j < (this.hi ? 34 : 20); j++) {
    const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1, dd = 4 + r() * r() * 70;
    if (this.tunnelAmt(s, feats) > 0.05) continue;
    const pr = this.alpineProfile(s, side, ryAt(s), feats), y = profileY(pr, dd);
    road.toWorld(s, side * (road.wall + dd), p);
    const k = 0.7 + r() * 0.9;
    this.pines.add(slot, p.x, y - 0.3, p.z, r() * 6.28, k, k * (0.85 + r() * 0.5), k);
  }
  for (let j = 0; j < 10; j++) {
    const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1, dd = 3 + r() * 25;
    if (this.tunnelAmt(s, feats) > 0.05) continue;
    const pr = this.alpineProfile(s, side, ryAt(s), feats), y = profileY(pr, dd);
    road.toWorld(s, side * (road.wall + dd), p);
    const k = 0.5 + r() * r() * 2.5, c = 0.38 + r() * 0.15;
    this.rocks.add(slot, p.x, y - k * 0.3, p.z, r() * 6.28, k * (1 + r() * 0.5), k * (0.6 + r() * 0.5), k, 0, new THREE.Color(c, c, c * 1.08).getHex());
  }
  for (let s = Math.ceil(s0 / 25) * 25; s < s1; s += 25) {
    if (road.featureAt(s)) continue;
    for (const side of [-1, 1]) {
      road.toWorld(s, side * (road.wall + 1.2), p);
      this.poles.add(slot, p.x, p.y - 0.05, p.z, 0);
      this.poleTips.add(slot, p.x, p.y - 0.05, p.z, 0);
    }
  }
};

/** A snowy pine: three stacked cones with white tips, and a trunk. 1 unit ~ 9 m tall. */
function pineGeometry() {
  const parts = [], green = [0.1, 0.24, 0.16], dark = [0.06, 0.15, 0.1], white = [0.88, 0.92, 0.98];
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6).translate(0, 1.2, 0);
  const tc = []; for (let i = 0; i < trunk.attributes.position.count; i++) tc.push(0.28, 0.2, 0.14);
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); parts.push(trunk);
  for (const [r, h, y] of [[2.4, 3.6, 3.2], [1.9, 3.2, 5.0], [1.3, 2.8, 6.8]]) {
    const g = new THREE.ConeGeometry(r, h, 8, 2).translate(0, y, 0), p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) { const k = (p.getY(i) - (y - h / 2)) / h; const c = k > 0.72 ? white : k > 0.36 ? green : dark; col.push(...c); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); parts.push(g);
  }
  // merge keeping each vertex's colour (mergeGeos colours whole parts)
  const pos = [], col = [];
  for (let g of parts) { g = g.toNonIndexed(); pos.push(...g.attributes.position.array); col.push(...g.attributes.color.array); }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  m.computeVertexNormals();
  return m;
}

/** Jagged snowy peaks for the far ring. */
function peaksTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 256;
  const x = c.getContext('2d'), R = rng(41);
  for (const [k, col, top] of [[0, '#3c4a62', 70], [1, '#56657e', 110]]) {
    const pts = []; let h = 150;
    for (let px = 0; px <= 2048; px += 16) { h = Math.max(top, Math.min(230, h + (R() - 0.5) * 70)); pts.push([px, h]); }
    pts[pts.length - 1][1] = pts[0][1];
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 256); for (const [px, py] of pts) x.lineTo(px, py); x.lineTo(2048, 256); x.fill();
    // snow caps on the high points
    x.fillStyle = k ? 'rgba(235,242,255,0.9)' : 'rgba(210,222,240,0.75)';
    for (let i = 1; i < pts.length - 1; i++) if (pts[i][1] < pts[i - 1][1] && pts[i][1] < pts[i + 1][1] && pts[i][1] < 170) { const [px, py] = pts[i]; x.beginPath(); x.moveTo(px, py); x.lineTo(px - 22, py + 26); x.lineTo(px - 8, py + 20); x.lineTo(px + 6, py + 30); x.lineTo(px + 24, py + 24); x.closePath(); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

// ---------------------------------------------------------------- keys: colours, buildings, beach props, signs

const PASTEL = [0xff8fb0, 0x6fe0d0, 0xffd77a, 0x8fbaff, 0xfff3e6, 0xffab78, 0xc09bff]; // hotel walls, lifeguard huts
const NEON = [0xff2f9e, 0x2fe6ff, 0xb56bff, 0xffd23a, 0x5dff9a]; // the lines of light on them
const GLASS_TINT = [0x6f86b8, 0x7fa3b8, 0x8a7fb0, 0x5d7396, 0x9aa6c4]; // the towers behind
const BEACH = [0xff5a8a, 0x3de0ff, 0xffd23a, 0xffffff, 0xff8a3a, 0x6dff8a]; // umbrellas

/** A box whose faces all sample one dark corner of the window texture: plain wall, no windows. */
function plainBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.008, 0.008);
  return g;
}

/** Merge geometries that all carry position, normal and uv. */
function mergeUV(list) {
  const pos = [], nor = [], uv = [];
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    pos.push(...g.getAttribute('position').array); nor.push(...g.getAttribute('normal').array); uv.push(...g.getAttribute('uv').array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/**
 * A beach-front hotel in the streamline style: a block with ledges over each pair of floors, a set-back penthouse,
 * a fin up the middle of the front and a canopy over the door. The front faces +z.
 */
function hotelGeometry(w, h, d) {
  const parts = [boxWithTiledUV(w, h, d), boxWithTiledUV(w * 0.56, h * 0.17, d * 0.7).translate(0, h, -d * 0.08)];
  for (let y = 7; y < h + 0.5; y += 7) parts.push(plainBox(w + 1.2, 0.4, 1.5).translate(0, Math.min(y, h), d / 2 + 0.3)); // eyebrow ledges
  parts.push(plainBox(w * 0.13, h * 1.34, 1.6).translate(0, h * 0.67, d / 2 + 0.75)); // the fin
  parts.push(plainBox(w * 0.34, 0.45, 4.2).translate(0, 4.1, d / 2 + 2.1)); // the canopy
  return mergeUV(parts);
}

/** The neon that goes with hotelGeometry: along the roof and the canopy, up both edges of the fin, round the penthouse. */
function hotelNeonGeometry(w, h, d) {
  const t = 0.24, zf = d / 2 + 1.12, fw = w * 0.13;
  const parts = [
    new THREE.BoxGeometry(w + 1.3, t, t).translate(0, h + 0.32, zf),
    new THREE.BoxGeometry(w * 0.34 + 0.2, t, t).translate(0, 4.45, d / 2 + 4.25),
    new THREE.BoxGeometry(w * 0.58, t, t).translate(0, h * 1.17 + 0.2, d * 0.27),
    new THREE.BoxGeometry(fw + 0.5, t, t).translate(0, h * 1.34 + 0.15, d / 2 + 1.6),
  ];
  for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(t, h * 1.34 - 4.6, t).translate(sx * (fw / 2 + 0.12), 4.6 + (h * 1.34 - 4.6) / 2, d / 2 + 1.6));
  if (h > 14) parts.push(new THREE.BoxGeometry(w + 1.3, t * 0.8, t).translate(0, 7.3, zf));
  return mergeGeos(parts);
}

/** A flamingo standing on one leg and a bit, about 1.5 m tall. */
function flamingoGeometry() {
  const pink = 0xff6f9f, pale = 0xff9dbd, dark = 0x1c1418;
  const neck = [[0, 1.12, 0.3], [0, 1.38, 0.5], [0, 1.6, 0.42], [0, 1.74, 0.5]], parts = [], cols = [];
  parts.push(new THREE.SphereGeometry(0.3, 7, 5).scale(0.8, 0.72, 1.5).translate(0, 1.05, 0)); cols.push(pink);
  parts.push(new THREE.ConeGeometry(0.16, 0.5, 5).rotateX(-Math.PI / 2 - 0.3).translate(0, 1.0, -0.55)); cols.push(pale); // tail
  for (let k = 1; k < neck.length; k++) {
    const a = new THREE.Vector3(...neck[k - 1]), b = new THREE.Vector3(...neck[k]), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(0.05, 0.065, len + 0.05, 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())).translate(mid.x, mid.y, mid.z);
    parts.push(g); cols.push(pink);
  }
  parts.push(new THREE.SphereGeometry(0.085, 6, 4).translate(0, 1.76, 0.54)); cols.push(pink);
  parts.push(new THREE.ConeGeometry(0.05, 0.2, 4).rotateX(Math.PI / 2 + 0.7).translate(0, 1.7, 0.68)); cols.push(dark); // beak
  parts.push(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 4).translate(0.07, 0.47, 0)); cols.push(pale);
  parts.push(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 4).rotateX(0.5).translate(-0.07, 0.72, -0.1)); cols.push(pale);
  return mergeGeos(parts, cols);
}

/** A beach umbrella: white panels that take the instance colour on every other one, on a pole. */
function umbrellaGeometry() {
  const pos = [], col = [], N = 8, R = 1.7, y0 = 2.0, y1 = 2.65;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2, c = i % 2 ? [1, 1, 1] : [0.38, 0.38, 0.38];
    pos.push(0, y1, 0, Math.cos(b) * R, y0, Math.sin(b) * R, Math.cos(a) * R, y0, Math.sin(a) * R);
    for (let k = 0; k < 3; k++) col.push(...c);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  top.computeVertexNormals();
  const pole = mergeGeos([new THREE.CylinderGeometry(0.035, 0.035, 2.7, 5).translate(0, 1.32, 0), new THREE.BoxGeometry(0.62, 0.1, 1.9).translate(0.95, 0.28, 0.2)], [0x8c8c96, 0xa9a9b4]); // a lounger beside it
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) g.setAttribute(name, new THREE.Float32BufferAttribute([...top.getAttribute(name).array, ...pole.getAttribute(name).array], 3));
  return g;
}

/** A lifeguard hut on stilts: its walls take the instance colour, roof and legs stay pale. */
function hutGeometry() {
  const parts = [new THREE.BoxGeometry(3, 2.1, 3).translate(0, 3.05, 0), new THREE.BoxGeometry(3.9, 0.16, 4.6).translate(0, 1.95, 0.5), new THREE.ConeGeometry(2.7, 1.1, 4).rotateY(Math.PI / 4).translate(0, 4.65, 0), new THREE.BoxGeometry(1.5, 0.12, 2.6).rotateX(0.62).translate(0, 1.05, 3.55)];
  const cols = [0xffffff, 0x8f8a94, 0x77717e, 0x8f8a94];
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) { parts.push(new THREE.BoxGeometry(0.16, 2, 0.16).translate(x, 1, z)); cols.push(0x77717e); }
  return mergeGeos(parts, cols);
}

/** A white motor yacht, bow towards +z. */
function boatGeometry() {
  const parts = [new THREE.BoxGeometry(3.4, 1.5, 8.5).translate(0, 0.45, -0.6), new THREE.ConeGeometry(2.4, 4.4, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1, 0.44, 1).translate(0, 0.45, 5.8),
    new THREE.BoxGeometry(2.7, 1.2, 4.4).translate(0, 1.8, -0.7), new THREE.BoxGeometry(2.75, 0.5, 3.6).translate(0, 1.95, -0.5), new THREE.BoxGeometry(2.1, 0.9, 2.3).translate(0, 2.85, -1.1), new THREE.BoxGeometry(3.5, 0.14, 8.6).translate(0, 0.15, -0.6)];
  return mergeGeos(parts, [0xf4f1f6, 0xf4f1f6, 0xe9e4ee, 0x10202e, 0xf4f1f6, 0x1f5f8a]);
}

/** A tall roadside sign: a word in neon letters down the middle, a neon frame and an arrow. */
function pylonTexture(word, color, color2) {
  const W = 160, H = 480;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#140b1f'); g.addColorStop(1, '#07050c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.lineWidth = 6; x.strokeStyle = color2; x.shadowColor = color2; x.shadowBlur = 16;
  x.strokeRect(11, 11, W - 22, H - 22);
  x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 20; x.textAlign = 'center'; x.textBaseline = 'middle';
  const step = Math.min(64, (H - 130) / word.length);
  x.font = `bold ${Math.round(step * 0.95)}px system-ui, sans-serif`;
  [...word].forEach((ch, i) => { x.fillText(ch, W / 2, 50 + step * (i + 0.5)); x.fillText(ch, W / 2, 50 + step * (i + 0.5)); });
  // the arrow pointing in off the road
  x.strokeStyle = color2; x.shadowColor = color2; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
  const ay = H - 52;
  x.beginPath(); x.moveTo(34, ay); x.lineTo(W - 38, ay); x.moveTo(W - 62, ay - 20); x.lineTo(W - 36, ay); x.lineTo(W - 62, ay + 20); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The far shore at dusk: hazy towers in two layers with lit windows and a few neon roof lines. */
function neonSkylineTexture() {
  const W = 2048, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const r = rng(7117);
  const neon = ['#ff3aa8', '#3de0ff', '#b56bff', '#ffd23a'];
  for (const [layer, shade, k] of [[0, 'rgba(112,62,124,0.8)', 0.75], [1, 'rgba(44,22,66,0.97)', 1]]) {
    for (let px = 0; px < W;) {
      const w = 12 + r() * 40, gap = r() < 0.22 ? 30 + r() * 90 : 0; // gaps: open water between the islands
      const h = (16 + r() ** 2.2 * 120) * k;
      x.fillStyle = shade; x.fillRect(px, H - 62 - h, w, h + 62);
      if (layer) {
        for (let wy = H - 62 - h + 4; wy < H - 64; wy += 5) for (let wx = px + 2; wx < px + w - 2; wx += 4) {
          if (r() < 0.74) continue;
          x.fillStyle = r() < 0.6 ? `rgba(255,${190 + r() * 50},${140 + r() * 60},${0.45 + r() * 0.5})` : r() < 0.5 ? `rgba(150,230,255,${0.4 + r() * 0.4})` : `rgba(255,120,200,${0.4 + r() * 0.4})`;
          x.fillRect(wx, wy, 2, 2);
        }
        if (h > 46 && r() < 0.55) { x.fillStyle = neon[Math.floor(r() * neon.length)]; x.fillRect(px, H - 62 - h - 2, w, 2); }
      }
      px += w * (0.7 + r() * 0.5) + gap;
    }
  }
  // the low shore the towers stand on
  x.fillStyle = 'rgba(40,20,60,0.97)'; x.fillRect(0, H - 64, W, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
