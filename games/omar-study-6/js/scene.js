// Draws Port Omar: ground, roads, buildings, walk-in places, props, sky and the day and night cycle.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { getCity, landSd, CURB } from '../shared/city.js';
import { DAY } from '../shared/rules.js';
import { propGeo, vmat, UMBRELLA_COLS, CONT_COLS } from './models.js';
import { setCarLook } from './carmodels.js';

const PAL = [
  [0xb5674a, 0xc9a27a, 0x9aa0a8, 0xd8c9a8, 0x7d8a99, 0xa8553e, 0xe0d6c4, 0x6f7f8a],   // midtown
  [0x5a6b7d, 0x3f4f63, 0x7b8da0, 0x2e3a4a, 0x8fa3b5, 0x4a5c70],                       // downtown
  [0xf7e3c4, 0xfff1dc, 0xbfe8e0, 0xffd9a8, 0xe9f2f5, 0xf6c9a0, 0xcfe9c8, 0xffffff],   // strip
  [0xf2ead8, 0xe8dcc0, 0xd9c9a8, 0xf7f3ea, 0xcfd8dc, 0xe6cfa9],                       // hills
  [0x7a828c, 0x8c8478, 0x5f6b77, 0x9a8f7f, 0x6d7a6a],                                 // industrial
  [0x6a7888, 0x8c7f70, 0x556270, 0x9a9488, 0x7a8a7a],                                 // docks
  [0], [0xf2f4f6, 0x4a5a78, 0xe0b23a],                                                // (park), landmarks
];
const STYLE = [0, 1, 2, 3, 4, 4, 0, 0];
const GROUND = { grass: 0x5f9a4a, lawn: 0x6fae52, asphalt: 0x3b3e44, concrete: 0x8d9096, plaza: 0xbcb6a8, pool: 0x3fc3e0 };
const SLAB = { midtown: 0xa9acb0, downtown: 0xb4b7bb, strip: 0xd8cdb8, hills: 0xb9b6ab, industrial: 0x8f9296, docks: 0x8f9296, park: 0xa9acb0 };
const POI_WALL = { store: 0xe8e0d0, guns: 0x5f665a, respray: 0x4f7fa8, safehouse: 0xc9b89a, pawn: 0xb89a5a, jewel: 0xf2ede4, bank: 0xd9d4c8, warehouse: 0x7a828c, dealer: 0xe8e0d0 };
const POI_FLOOR = { store: 0xd8d8d0, guns: 0x4a4f4a, respray: 0x55585e, safehouse: 0x9a7a55, pawn: 0x7a6a50, jewel: 0xe8e2d6, bank: 0xcfc8b8, warehouse: 0x6a6d72 };
const BOXC = { counter: 0x6a4a2e, shelf: 0x8b9099, case: 0x9fd8e8, cart: 0xc9a23a, crate: 0x9a7a4a, safe: 0x3a3f4a, bed: 0x4a6fa8, board: 0x2f4a3a, booth: 0xe8e0d0, bench: 0x6a4a2e, term: 0x2ad4a0 };
const SIGNC = [['#1b1d22', '#ffffff'], ['#e23d2e', '#ffffff'], ['#1b1d22', '#ffb53d'], ['#2f7fd6', '#ffffff'], ['#1d7a4a', '#eafff2'], ['#d9a02c', '#1b1d22'], ['#101820', '#7fe9ff'], ['#1d2f55', '#f2d98a'], ['#3a3f4a', '#ffb53d'], ['#b81f24', '#ffffff'], ['#ffffff', '#d92b2b'], ['#1d2f55', '#ffffff'], ['#1b1d22', '#ffd23d']];

class Quads {
  constructor() { this.p = []; this.c = []; this.col = new THREE.Color(); }
  quad(a, b, c, d, hex) { this.col.setHex(hex); const { r, g, b: bl } = this.col; for (const v of [a, b, c, a, c, d]) { this.p.push(v[0], v[1], v[2]); this.c.push(r, g, bl); } }
  flat(x0, z0, x1, z1, y, hex) { this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], hex); }
  box(x0, z0, x1, z1, y0, y1, hex, top = true) {
    if (top) this.flat(x0, z0, x1, z1, y1, hex);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex); this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], hex);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], hex); this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals();
    return new THREE.Mesh(g, mat || vmat());
  }
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class City3D {
  constructor(canvas, quality) {
    this.q = quality;       // 'low' | 'med' | 'high'
    this.r = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'high', powerPreference: 'high-performance' });
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.02;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0xbfe0f5, 160, 900);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.2, 1700);
    this.night = { value: 0 }; this.time = { value: 0 };
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a8f80, 1.1); this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
    this.roofs = new Map(); this.gateMeshes = []; this.rings = []; this.lampPts = [];
    this.sky(); this.build(); this.setQuality(quality); this.resize();
  }
  setQuality(q) {
    this.q = q; const sh = q !== 'low';
    this.r.shadowMap.enabled = sh; this.r.shadowMap.type = THREE.PCFSoftShadowMap; this.sun.castShadow = sh;
    if (sh) { const s = this.sun.shadow; s.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024); const c = s.camera; c.left = c.bottom = -75; c.right = c.top = 75; c.near = 20; c.far = 420; c.updateProjectionMatrix(); s.bias = -0.0004; s.normalBias = 0.05; }
    this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
    if (q === 'high' && !this.composer) {
      this.composer = new EffectComposer(this.r); this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 1.0); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    }
    for (const l of this.pts) l.visible = q !== 'low';
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, this.q === 'high' ? 1.5 : this.q === 'med' ? 1.25 : 1) * (this.scale || 1);
    this.r.setPixelRatio(dpr); this.r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(w, h); }
  }

  sky() {
    this.skyU = { top: { value: new THREE.Color(0x2f7fd6) }, hor: { value: new THREE.Color(0xbfe0f5) }, sun: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(0xfff4e0) }, night: this.night };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = (projectionMatrix * p).xyww; }',
      fragmentShader: `uniform vec3 top, hor, sun, sunCol; uniform float night; varying vec3 vD;
        float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(hor, top, pow(h, 0.55)); float s = max(dot(d, sun), 0.0);
          c += sunCol * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.22 * (1.0 - night * 0.6));
          vec3 g = floor(d * 190.0); float st = step(0.9965, h3(g)) * night * smoothstep(0.02, 0.25, d.y); c += vec3(st);
          if (d.y < 0.0) c = mix(hor, hor * 0.7, clamp(-d.y * 4.0, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 14), mat); this.skyMesh.frustumCulled = false; this.skyMesh.renderOrder = -10;
    this.scene.add(this.skyMesh);
    // a daytime copy of the sky for the reflections on car paint
    const pm = new THREE.PMREMGenerator(this.r), es = new THREE.Scene(); es.add(this.skyMesh.clone());
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a4d52 })); gnd.position.y = -4; es.add(gnd);
    this.env = pm.fromScene(es, 0.03).texture; pm.dispose();
    setCarLook(this.env, this.q !== 'low');
  }

  build() {
    const C = getCity(), S = this.scene;
    // ---- sea and land
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c6c9c, roughness: 0.22, metalness: 0.15, envMap: this.env, envMapIntensity: 0.9 }));
    sea.position.set(0, -0.55, 0); S.add(sea); this.sea = sea;
    const land = new Quads(), cx = -55, cz = -20, pts = [], N = 280;
    for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let lo = 300, hi = 1000; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (landSd(cx + dx * m, cz + dz * m) < 0) lo = m; else hi = m; } pts.push([cx + dx * lo, cz + dz * lo, dx, dz]); }
    for (let k = 0; k < N; k++) {
      const a = pts[k], b = pts[(k + 1) % N]; land.col.setHex(0xe6d5a6);
      for (const v of [[cx, 0, cz], [b[0], 0, b[1]], [a[0], 0, a[1]]]) { land.p.push(...v); land.c.push(land.col.r, land.col.g, land.col.b); }
      land.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0] + b[2] * 14, -1.3, b[1] + b[3] * 14], [a[0] + a[2] * 14, -1.3, a[1] + a[3] * 14], 0xd9c692);
    }
    const lm = land.mesh(); lm.receiveShadow = true; S.add(lm);
    // ---- roads, markings, sidewalks, lots
    const rd = new Quads(), mk = new Quads(), sl = new Quads(), gr = new Quads();
    for (const x of C.cross) rd.flat(x.x - x.w / 2, x.z - x.d / 2, x.x + x.w / 2, x.z + x.d / 2, 0.012, 0x33363b);
    for (const r of C.roads) {
      rd.flat(r.x0, r.z0, r.x1, r.z1, 0.012, 0x35383d);
      const len = r.vert ? r.z1 - r.z0 : r.x1 - r.x0, m = r.vert ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2, s0 = r.vert ? r.z0 : r.x0, wide = r.w > 13;
      const line = (off, a, b, w, hex) => (r.vert ? mk.flat(m + off - w / 2, s0 + a, m + off + w / 2, s0 + b, 0.022, hex) : mk.flat(s0 + a, m + off - w / 2, s0 + b, m + off + w / 2, 0.022, hex));
      if (wide) { line(-0.18, 4, len - 4, 0.14, 0xd9b23a); line(0.18, 4, len - 4, 0.14, 0xd9b23a); for (let t = 5; t < len - 6; t += 8) { line(r.w / 4, t, t + 3, 0.13, 0xe2e2e2); line(-r.w / 4, t, t + 3, 0.13, 0xe2e2e2); } }
      else for (let t = 5; t < len - 6; t += 8) line(0, t, t + 3.2, 0.14, 0xd9b23a);
      for (const e of [1.1, len - 3.3]) for (let o = -r.w / 2 + 0.7; o < r.w / 2 - 0.9; o += 1.15) line(o + 0.25, e, e + 2.2, 0.5, 0xe2e2e2);
    }
    for (const s of C.slabs) sl.box(s.x0, s.z0, s.x1, s.z1, 0, CURB, SLAB[s.di] || 0xa9acb0);
    for (const g of C.grounds) gr.flat(g.x0, g.z0, g.x1, g.z1, g.y, GROUND[g.k]);
    for (const m of [rd, sl, gr]) { const q = m.mesh(); q.receiveShadow = true; S.add(q); }
    const mm = mk.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); S.add(mm); this.marks = mm;

    // ---- buildings: one box drawn many times, with windows painted by the shader
    const bm = new THREE.MeshLambertMaterial();
    bm.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = this.night;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aInfo; varying vec3 vW; varying vec3 vN; varying vec4 vInfo; varying float vTop;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp4 = instanceMatrix * vec4(position, 1.0); vW = wp4.xyz; vN = normal; vInfo = aInfo; vTop = length(instanceMatrix[1].xyz);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uNight; varying vec3 vW; varying vec3 vN; varying vec4 vInfo; varying float vTop;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 oLit = vec3(0.0);
        float yy = vW.y - ${CURB.toFixed(2)}, st = vInfo.y;
        if (abs(vN.y) < 0.5) {
          float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
          float cw = st == 1.0 ? 2.3 : st == 3.0 ? 3.6 : 3.2, fh = st == 1.0 ? 3.5 : 3.2;
          vec2 cell = vec2(floor(u / cw), floor(yy / fh)), f = vec2(fract(u / cw), fract(yy / fh));
          float win = 0.0;
          if (st == 1.0) win = step(0.05, f.x) * step(f.x, 0.95) * step(0.1, f.y) * step(f.y, 0.9);
          else if (st == 4.0) { win = 0.0; diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, fract(u * 1.6)); if (yy > vTop - 1.4) diffuseColor.rgb *= 0.72; }
          else win = step(0.24, f.x) * step(f.x, 0.76) * step(0.3, f.y) * step(f.y, 0.78);
          if (cell.y == 0.0 && st < 3.0) win = step(0.07, f.x) * step(f.x, 0.93) * step(0.14, f.y) * step(f.y, 0.86);
          if (st == 3.0 && cell.y > 1.0) win = 0.0;
          if (yy > vTop - 1.0 || vTop < 3.6) win *= step(yy, vTop - 1.0);
          float r = h21(cell + vInfo.x * 91.7);
          vec3 glass = mix(vec3(0.1, 0.16, 0.24), vec3(0.42, 0.58, 0.74), 0.25 + 0.45 * r) * (1.0 - uNight * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
          float on = step(st == 1.0 ? 0.74 : 0.62, r) * uNight * win;
          oLit = mix(vec3(1.0, 0.82, 0.5), vec3(0.72, 0.86, 1.0), step(0.9, r)) * on * (cell.y == 0.0 ? 0.7 : st == 1.0 ? 0.36 : 0.5);
          if (st == 2.0 && vInfo.z >= 0.0 && yy > vTop - 0.7) { vec3 nc = vInfo.z < 1.0 ? vec3(0.1, 1.0, 0.9) : vInfo.z < 2.0 ? vec3(1.0, 0.55, 0.1) : vInfo.z < 3.0 ? vec3(1.0, 0.9, 0.2) : vInfo.z < 4.0 ? vec3(0.3, 1.0, 0.4) : vec3(1.0, 1.0, 1.0); oLit += nc * uNight * 1.25; diffuseColor.rgb = mix(diffuseColor.rgb, nc, 0.5); }
        } else if (vN.y > 0.5) diffuseColor.rgb = diffuseColor.rgb * 0.5 + 0.08;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += oLit;');
    };
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), B = C.buildings;
    const im = new THREE.InstancedMesh(unit, bm, B.length), info = new Float32Array(B.length * 4), M = new THREE.Matrix4(), col = new THREE.Color();
    const houses = B.filter((b) => b.house), tops = B.filter((b) => b.top);
    B.forEach((b, k) => {
      M.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0).setPosition((b.x0 + b.x1) / 2, CURB, (b.z0 + b.z1) / 2); im.setMatrixAt(k, M);
      im.setColorAt(k, col.setHex(PAL[b.di][b.c % PAL[b.di].length]));
      info[k * 4] = b.s; info[k * 4 + 1] = b.di === 7 ? (b.c === 2 ? 2 : 0) : STYLE[b.di]; info[k * 4 + 2] = b.neon !== undefined ? b.neon : b.di === 7 && b.c === 2 ? 2 : -1;
    });
    unit.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    im.castShadow = im.receiveShadow = true; S.add(im);
    // pitched roofs for houses, plant rooms on towers
    const prism = new THREE.BufferGeometry();
    prism.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0, 1, -0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5], 3)); prism.computeVertexNormals();
    const rm = new THREE.InstancedMesh(prism, new THREE.MeshLambertMaterial(), houses.length), RC = [0xa8553e, 0x6f6a66, 0x8a4a3a, 0x4a5560, 0xb86a4a];
    houses.forEach((b, k) => { M.makeScale(b.x1 - b.x0 + 1, 2.3, b.z1 - b.z0 + 1).setPosition((b.x0 + b.x1) / 2, CURB + b.h, (b.z0 + b.z1) / 2); rm.setMatrixAt(k, M); rm.setColorAt(k, col.setHex(RC[k % 5])); });
    rm.castShadow = true; S.add(rm);
    const tm = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: 0x6a7078 }), tops.length);
    tops.forEach((b, k) => { M.makeScale((b.x1 - b.x0) * 0.42, 3.4, (b.z1 - b.z0) * 0.42).setPosition((b.x0 + b.x1) / 2 + ((b.s * 7) % 1 - 0.5) * 4, CURB + b.h, (b.z0 + b.z1) / 2); tm.setMatrixAt(k, M); });
    S.add(tm);

    // ---- places you can walk into
    const pw = new Quads(), type = (id) => C.poi[id].type;
    for (const b of C.pboxes) {
      if (b.g) { const q = new Quads(); q.box(b.x0, b.z0, b.x1, b.z1, CURB + b.y0, CURB + b.y1, 0xc9ced8); const m = q.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.4, envMap: this.env, emissive: 0x2a3038 })); m.userData.g = b.g; S.add(m); this.gateMeshes.push(m); continue; }
      const hex = b.c === 'wall' ? POI_WALL[type(b.poi)] : b.c === 'trim' ? 0x3a3f4a : BOXC[b.c] || 0x8b9099;
      pw.box(b.x0, b.z0, b.x1, b.z1, CURB + b.y0, CURB + b.y1, hex);
      if (b.y0 > 0) pw.quad([b.x0, CURB + b.y0, b.z0], [b.x1, CURB + b.y0, b.z0], [b.x1, CURB + b.y0, b.z1], [b.x0, CURB + b.y0, b.z1], hex);
    }
    for (const p of C.pois) if (!p.solid && !p.open) pw.flat(p.rect[0], p.rect[1], p.rect[2], p.rect[3], CURB + 0.015, POI_FLOOR[p.type] || 0x8b9099);
    const pm = pw.mesh(); pm.castShadow = pm.receiveShadow = true; S.add(pm);
    for (const r of C.roofs) {
      const q = new Quads(), t = C.poi[r.poi].type; q.box(r.rect[0] - 0.15, r.rect[1] - 0.15, r.rect[2] + 0.15, r.rect[3] + 0.15, CURB + r.y, CURB + r.y + 0.3, 0x5a5f66);
      q.box(r.rect[0] + 2, r.rect[1] + 2, r.rect[0] + 4.5, r.rect[1] + 4, CURB + r.y + 0.3, CURB + r.y + 1.3, 0x8b9099); void t;
      const m = q.mesh(); m.castShadow = true; S.add(m); this.roofs.set(r.poi, m);
    }
    for (const s of C.signs) {
      const cv = document.createElement('canvas'), k = 64; cv.width = Math.round(s.w * k); cv.height = Math.round(s.h * k);
      const g = cv.getContext('2d'), [bg, fg] = SIGNC[s.col] || SIGNC[0];
      g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(4, 4, cv.width - 8, cv.height - 8);
      g.fillStyle = fg; g.font = `${Math.round(cv.height * 0.56)}px Bungee, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.text, cv.width / 2, cv.height / 2 + 2, cv.width - 20);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(s.x, CURB + s.y, s.z); m.rotation.y = s.ry; S.add(m);
    }

    // ---- props
    const by = {}; for (const p of C.props) (by[p.t] ||= []).push(p);
    const inst = (geo, mat, list, fn, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((p, k) => fn(p, k, m)); m.castShadow = shadow; m.frustumCulled = false; S.add(m); return m; };
    const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
    const place = (p, y = 0, s = 1) => M.compose(V.set(p.x, y, p.z), Q.setFromEuler(E.set(0, p.ry || 0, 0)), Sc.setScalar(s));
    const gy = (p) => C.groundY(p.x, p.z);
    for (const t of ['palm', 'tree', 'bench']) if (by[t]) inst(propGeo(t), vmat(), by[t], (p, k, m) => m.setMatrixAt(k, place(p, gy(p), p.s)));
    if (by.lamp) {
      inst(propGeo('lamp'), vmat(), by.lamp, (p, k, m) => m.setMatrixAt(k, place(p, gy(p))), false);
      this.bulbMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
      inst(propGeo('bulb'), this.bulbMat, by.lamp, (p, k, m) => m.setMatrixAt(k, place(p, gy(p))), false);
      const gc = document.createElement('canvas'); gc.width = gc.height = 64; const gx = gc.getContext('2d'), gg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gg.addColorStop(0, 'rgba(255,214,150,0.55)'); gg.addColorStop(0.5, 'rgba(255,200,130,0.18)'); gg.addColorStop(1, 'rgba(255,200,130,0)'); gx.fillStyle = gg; gx.fillRect(0, 0, 64, 64);
      this.glowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      inst(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), this.glowMat, by.lamp, (p, k, m) => { const fx = Math.sin(p.ry), fz = Math.cos(p.ry); m.setMatrixAt(k, M.makeTranslation(p.x + fx * 1.7, 0.035, p.z + fz * 1.7)); this.lampPts.push([p.x + fx * 1.7, p.z + fz * 1.7]); }, false);
    }
    if (by.umbrella) inst(propGeo('umbrella'), vmat(), by.umbrella, (p, k, m) => { m.setMatrixAt(k, place(p)); m.setColorAt(k, col.setHex(UMBRELLA_COLS[p.c])); });
    if (by.towel) inst(propGeo('towel'), vmat(), by.towel, (p, k, m) => { m.setMatrixAt(k, place(p)); m.setColorAt(k, col.setHex(UMBRELLA_COLS[(p.c + 2) % 6])); }, false);
    if (by.cont) { const all = []; for (const p of by.cont) for (let n = 0; n < p.n; n++) all.push({ ...p, y: gy(p) + n * 2.6, c: (p.c + n) % 6 }); inst(propGeo('cont'), vmat(), all, (p, k, m) => { m.setMatrixAt(k, place(p, p.y)); m.setColorAt(k, col.setHex(CONT_COLS[p.c])); }); }

    // ---- lights that follow you at night, and glowing rings for places and objectives
    this.pts = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffd9a0, 0, 26, 1.6); l.position.y = 5.6; S.add(l); return l; });
    const rc = document.createElement('canvas'); rc.width = 4; rc.height = 64; const rx = rc.getContext('2d'), rg = rx.createLinearGradient(0, 0, 0, 64); rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(1, 'rgba(255,255,255,0.85)'); rx.fillStyle = rg; rx.fillRect(0, 0, 4, 64);
    const rt = new THREE.CanvasTexture(rc), rgeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0);
    for (let k = 0; k < 14; k++) { const m = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ map: rt, color: 0xffd23d, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.visible = false; S.add(m); this.rings.push(m); }
  }

  /** list: [{ x, z, r, col, h }] */
  markers(list, t) {
    const C = getCity();
    this.rings.forEach((m, k) => { const q = list[k]; m.visible = !!q; if (!q) return; m.position.set(q.x, C.groundY(q.x, q.z) + 0.03, q.z); const p = 1 + Math.sin(t * 3 + k) * 0.05; m.scale.set(q.r * p, q.h || 1.6, q.r * p); m.material.color.setHex(q.col); });
  }

  /** clock = seconds into the day. */
  setTime(clock) {
    const h = (clock / DAY) * 24, a = ((h - 5) / 16) * Math.PI, d = Math.min(1, Math.max(0, Math.sin(a) * 1.7 + 0.12)), n = 1 - sstep(0.02, 0.4, d);
    this.night.value = n;
    const low = sstep(0.0, 0.3, d) * (1 - sstep(0.3, 0.75, d));
    if (Math.sin(a) > -0.08) this.sunDir.set(Math.cos(a) * 0.85, Math.max(Math.sin(a), 0.12), 0.42).normalize(); else this.sunDir.set(-0.45, 0.8, 0.35).normalize();
    const c = (x, y, t) => new THREE.Color(x).lerp(new THREE.Color(y), t);
    this.sun.color.copy(c(0xffa060, 0xfff2de, sstep(0.1, 0.6, d))).lerp(new THREE.Color(0x8fa8d8), n); this.sun.intensity = 0.55 * n + 2.3 * (1 - n) * (0.45 + 0.55 * d);
    this.hemi.color.copy(c(0x3a4d80, 0xbfd9ff, 1 - n)); this.hemi.groundColor.copy(c(0x232838, 0x8a8f80, 1 - n)); this.hemi.intensity = 1.5 + 0.45 * (1 - n);
    const top = c(0x060b1c, 0x2f7fd6, 1 - n), hor = c(0x1c2740, 0xbfe0f5, 1 - n).lerp(new THREE.Color(0xff9a5a), low * 0.7);
    this.skyU.top.value.copy(top); this.skyU.hor.value.copy(hor); this.skyU.sun.value.copy(this.sunDir); this.skyU.sunCol.value.copy(c(0xffb070, 0xfff4e0, d)).multiplyScalar(n > 0.9 ? 0.5 : 1);
    this.scene.fog.color.copy(hor); this.scene.fog.near = 150 - 40 * n; this.scene.fog.far = 900 - 250 * n;
    this.sea.material.color.copy(c(0x0b2a44, 0x1c6c9c, 1 - n));
    if (this.bulbMat) { this.bulbMat.color.setScalar(0.33 + n * 1.1); this.bulbMat.color.b *= 0.75; this.glowMat.opacity = n * 0.9; }
    if (this.bloom) this.bloom.strength = 0.1 + n * 0.28;
    this.r.toneMappingExposure = 0.96 + n * 0.1;
  }

  /** Each frame: move the shadow box and night lights with the player, hide the roof of the place they are in. */
  update(x, z, poiId, gates) {
    this.skyMesh.position.set(x, 0, z);
    this.sun.target.position.set(x, 0, z); this.sun.position.set(x + this.sunDir.x * 200, this.sunDir.y * 200, z + this.sunDir.z * 200);
    for (const [id, m] of this.roofs) m.visible = id !== poiId;
    for (const m of this.gateMeshes) m.visible = !((gates >> m.userData.g) & 1);
    const n = this.night.value;
    if (n > 0.05 && this.q !== 'low') {
      const near = this.lampPts.map((p) => [(p[0] - x) ** 2 + (p[1] - z) ** 2, p]).filter((q) => q[0] < 1600).sort((a, b) => a[0] - b[0]);
      this.pts.forEach((l, k) => { const q = near[k]; l.intensity = q ? 16 * n : 0; if (q) { l.position.x = q[1][0]; l.position.z = q[1][1]; } });
    } else for (const l of this.pts) l.intensity = 0;
  }
  render() { if (this.composer && this.q === 'high') this.composer.render(); else this.r.render(this.scene, this.camera); }
}
