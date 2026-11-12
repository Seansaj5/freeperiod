// Draws the island: sky, terrain, the river, every house/dock/bridge block, roads, trees and props, signs and storm.
import * as THREE from 'three';
import { heightAt, waterDist, PALETTE, PROP_DIMS, bankZ } from '../shared/map.js';
import { noise2, rng } from '../shared/util.js';
import { MAP } from '../shared/rules.js';

const col = new THREE.Color();

// ---------- sky ----------
function makeSky() {
  const g = new THREE.SphereGeometry(1800, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d8fe0) }, mid: { value: new THREE.Color(0xa8d8ff) }, bot: { value: new THREE.Color(0xf6e7c9) }, sun: { value: new THREE.Vector3(0.45, 0.62, -0.64).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top, mid, bot, sun; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0. ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, clamp(-h*4.,0.,1.));
        float s = max(dot(vP, sun), 0.); c += vec3(1.,0.9,0.7) * (pow(s, 600.) * 2.5 + pow(s, 12.) * 0.25);
        // soft clouds
        vec2 q = vP.xz / (vP.y + 0.25) * 2.;
        float n = sin(q.x*1.3+sin(q.y*0.7))*0.5+sin(q.y*1.7+q.x*0.4)*0.5;
        float cl = smoothstep(0.35, 0.9, n) * smoothstep(0.02, 0.25, h);
        c = mix(c, vec3(1.), cl * 0.55);
        gl_FragColor = vec4(c, 1.); }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------- terrain ----------
export function groundColor(x, z, out) {
  const w = waterDist(x, z), h = heightAt(x, z);
  const n = noise2(x / 14, z / 14, 9) * 0.5 + noise2(x / 50, z / 50, 4) * 0.5;
  if (h < 0.15 || w > -2) out.setRGB(0.83, 0.76, 0.58);                       // wet sand / riverbed
  else if (w > -9) out.setRGB(0.9, 0.84, 0.66);                               // beach
  else {
    out.setRGB(0.42 + n * 0.05, 0.66 + n * 0.06, 0.3 + n * 0.03);            // grass
    const g = Math.hypot(x + 390, z - 110);
    if (g < 130 && noise2(x / 45, z / 45, 21) > -0.15) out.setRGB(0.47 + n * 0.03, 0.76 + n * 0.04, 0.33);   // fairway
    if (z < -300 && Math.abs(x - 10) < 220) out.setRGB(0.3 + n * 0.05, 0.5 + n * 0.05, 0.24);                 // forest floor
    if (h > 7) out.lerp(col.setRGB(0.55, 0.62, 0.38), Math.min(1, (h - 7) / 6));
  }
  if (h < -0.4) out.multiplyScalar(0.75);
  return out;
}

function makeTerrain(segs) {
  const size = MAP.EDGE * 2 + 240;
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    groundColor(x, z, col);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- water ----------
function makeWater() {
  const g = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: { time: { value: 0 }, sun: { value: new THREE.Vector3(0.45, 0.62, -0.64).normalize() }, ...THREE.UniformsLib.fog },
    vertexShader: `varying vec3 vW; #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition; #include <fog_vertex> }`.replace(/#include <(\w+)>/g, '\n#include <$1>\n'),
    fragmentShader: `uniform float time; uniform vec3 sun; varying vec3 vW; #include <fog_pars_fragment>
      void main(){
        vec2 p = vW.xz;
        float w1 = sin(p.x*0.21 + time*1.3) * cos(p.y*0.17 - time*0.9);
        float w2 = sin(p.x*0.63 - p.y*0.41 + time*2.1) * 0.5;
        vec3 n = normalize(vec3(w1*0.12 + w2*0.08, 1., w2*0.1 - w1*0.06));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1. - max(dot(n, v), 0.), 3.);
        vec3 deep = vec3(0.07, 0.36, 0.5), shallow = vec3(0.16, 0.58, 0.62);
        vec3 c = mix(shallow, deep, clamp(length(cameraPosition - vW) / 260., 0., 1.));
        c = mix(c, vec3(0.75, 0.88, 1.), fres * 0.6);
        float spec = pow(max(dot(reflect(-sun, n), v), 0.), 90.);
        c += vec3(1., 0.95, 0.8) * spec * 1.4;
        float foam = smoothstep(0.82, 1., w1 * 0.5 + 0.5 + w2 * 0.3) * 0.12;
        gl_FragColor = vec4(c + foam, 0.88);
        #include <fog_fragment>
      }`.replace(/#include <(\w+)>/g, '\n#include <$1>\n'),
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = MAP.WATER;
  mesh.renderOrder = 2;
  return mesh;
}

// ---------- blocks (houses, docks, bridges) ----------
function boxGeo(boxes, slopes, decor) {
  // one big vertex-colored mesh. Faces get a little shade so walls read in flat light.
  const P = [], N = [], C = [], I = [];
  const quad = (a, b, c, d, n, color, shade) => {
    const i0 = P.length / 3;
    for (const v of [a, b, c, d]) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); C.push(color.r * shade, color.g * shade, color.b * shade); }
    I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  const tri = (a, b, c, n, color, shade) => {
    const i0 = P.length / 3;
    for (const v of [a, b, c]) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); C.push(color.r * shade, color.g * shade, color.b * shade); }
    I.push(i0, i0 + 1, i0 + 2);
  };
  const c = new THREE.Color();
  const R = rng(5);
  for (const b of boxes) {
    c.setHex(PALETTE[b.c] || 0xffffff);
    const v = 0.94 + R() * 0.1;
    c.multiplyScalar(v);
    const { x0, y0, z0, x1, y1, z1 } = b;
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], c, 1.0);
    if (y0 > -3.5) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c, 0.6);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c, 0.9);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c, 0.86);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c, 0.95);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c, 0.8);
  }
  const th = 0.18;
  for (const s of slopes) {
    c.setHex(PALETTE[s.c] || 0xffffff);
    const yAt = (x, z) => (s.ax === 'x' ? s.ya + (s.yb - s.ya) * (x - s.x0) / (s.x1 - s.x0) : s.ya + (s.yb - s.ya) * (z - s.z0) / (s.z1 - s.z0));
    const a = [s.x0, yAt(s.x0, s.z0), s.z0], b = [s.x0, yAt(s.x0, s.z1), s.z1], cc = [s.x1, yAt(s.x1, s.z1), s.z1], d = [s.x1, yAt(s.x1, s.z0), s.z0];
    const dy = s.ax === 'x' ? (s.yb - s.ya) / (s.x1 - s.x0) : (s.yb - s.ya) / (s.z1 - s.z0);
    const n = s.ax === 'x' ? new THREE.Vector3(-dy, 1, 0).normalize() : new THREE.Vector3(0, 1, -dy).normalize();
    quad(a, b, cc, d, [n.x, n.y, n.z], c, 1);
    const dn = (p) => [p[0], p[1] - th, p[2]];
    quad(dn(d), dn(cc), dn(b), dn(a), [-n.x, -n.y, -n.z], c, 0.55);
    quad(dn(a), dn(b), b, a, [-1, 0, 0], c, 0.8);
    quad(dn(cc), dn(d), d, cc, [1, 0, 0], c, 0.8);
    quad(dn(b), dn(cc), cc, b, [0, 0, 1], c, 0.85);
    quad(dn(d), dn(a), a, d, [0, 0, -1], c, 0.85);
  }
  for (const d of decor) {
    if (d.t !== 'gable') continue;
    c.setHex(PALETTE[d.c] || 0xffffff);
    const mid = (d.b0 + d.b1) / 2;
    if (d.ax === 'x') {
      const x = d.a;
      tri([x, d.y, d.b0], [x, d.y, d.b1], [x, d.y + d.rise, mid], [1, 0, 0], c, 0.92);
      tri([x, d.y, d.b1], [x, d.y, d.b0], [x, d.y + d.rise, mid], [-1, 0, 0], c, 0.8);
    } else {
      const z = d.a;
      tri([d.b0, d.y, z], [d.b1, d.y, z], [mid, d.y + d.rise, z], [0, 0, 1], c, 0.9);
      tri([d.b1, d.y, z], [d.b0, d.y, z], [mid, d.y + d.rise, z], [0, 0, -1], c, 0.85);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

// ---------- roads ----------
function ribbon(points, width, lift, color) {
  const P = [], I = [];
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const [nx, nz] = points[Math.min(i + 1, points.length - 1)];
    const [px, pz] = points[Math.max(i - 1, 0)];
    let dx = nx - px, dz = nz - pz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const ox = -dz * width / 2, oz = dx * width / 2;
    const y1 = Math.max(heightAt(x + ox, z + oz), 0.3) + lift, y2 = Math.max(heightAt(x - ox, z - oz), 0.3) + lift;
    P.push(x + ox, y1, z + oz, x - ox, y2, z - oz);
    if (i > 0) { const a = (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
function linePts(x0, z0, x1, z1, step = 4) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step)), out = [];
  for (let i = 0; i <= n; i++) out.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
  return out;
}
function mergeGeos(list) {
  // tiny merge (positions + normals + index) for same-material pieces
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(vc * 3), N = new Float32Array(vc * 3), I = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) N.set(g.attributes.normal.array, vo * 3);
    const idx = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < idx.length; i++) I[io + i] = idx[i] + vo;
    vo += g.attributes.position.count; io += idx.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  out.computeBoundingSphere();
  return out;
}

function makeRoads(map) {
  const group = new THREE.Group();
  const asphalt = [], lines = [], rails = [], ties = [];
  for (const r of map.roads) {
    asphalt.push(ribbon(linePts(r.x0, r.z0, r.x1, r.z1), r.w, 0.06, 0));
    const pts = linePts(r.x0, r.z0, r.x1, r.z1, 6);
    for (let i = 0; i + 1 < pts.length; i += 2) lines.push(ribbon([pts[i], pts[i + 1]], 0.22, 0.09, 0));
  }
  for (const c of map.circles) {
    const pts = []; for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push([c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r]); }
    asphalt.push(ribbon(pts, c.w, 0.07, 0));
  }
  for (const r of map.rails) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
    for (const s of [-0.72, 0.72]) rails.push(ribbon(linePts(r.x0 - uz * s, r.z0 + ux * s, r.x1 - uz * s, r.z1 + ux * s), 0.12, 0.28, 0));
    for (let d = 0; d < len; d += 1.4) {
      const x = r.x0 + ux * d, z = r.z0 + uz * d;
      ties.push(ribbon([[x - uz * 1.3, z + ux * 1.3], [x + uz * 1.3, z - ux * 1.3]], 0.35, 0.16, 0));
    }
  }
  const mAsph = new THREE.MeshLambertMaterial({ color: 0x3b3e44, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mLine = new THREE.MeshLambertMaterial({ color: 0xf2d24b, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const asph = new THREE.Mesh(mergeGeos(asphalt), mAsph); asph.receiveShadow = true;
  group.add(asph, new THREE.Mesh(mergeGeos(lines), mLine));
  if (rails.length) group.add(new THREE.Mesh(mergeGeos(rails), new THREE.MeshLambertMaterial({ color: 0x8b8f96 })));
  if (ties.length) group.add(new THREE.Mesh(mergeGeos(ties), new THREE.MeshLambertMaterial({ color: 0x5a4532, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
  return group;
}

// ---------- props (instanced) ----------
const PROP_PARTS = {
  tree: [
    { geo: () => new THREE.CylinderGeometry(0.28, 0.38, 3.2, 6).translate(0, 1.6, 0), color: 0x6b4a31 },
    { geo: () => new THREE.IcosahedronGeometry(2.6, 0).scale(1, 0.95, 1).translate(0, 4.8, 0), color: 0x4f9a3a, tint: true },
    { geo: () => new THREE.IcosahedronGeometry(1.8, 0).translate(0.9, 6.3, 0.4), color: 0x5aa844, tint: true },
  ],
  pine: [
    { geo: () => new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6).translate(0, 1.2, 0), color: 0x5e4029 },
    { geo: () => new THREE.ConeGeometry(2.4, 4.4, 7).translate(0, 4.2, 0), color: 0x2f6e3a, tint: true },
    { geo: () => new THREE.ConeGeometry(1.7, 3.6, 7).translate(0, 6.9, 0), color: 0x377d42, tint: true },
  ],
  bush: [{ geo: () => new THREE.IcosahedronGeometry(1, 0).scale(1.1, 0.75, 1.1).translate(0, 0.6, 0), color: 0x4a8f39, tint: true }],
  rock: [{ geo: () => new THREE.DodecahedronGeometry(1.4, 0).scale(1.1, 0.75, 0.95).translate(0, 0.7, 0), color: 0x9a9a92, tint: true }],
  car: [
    { geo: () => new THREE.BoxGeometry(1.85, 0.75, 4.3).translate(0, 0.62, 0), color: 0xffffff, paint: true },
    { geo: () => new THREE.BoxGeometry(1.6, 0.62, 2.2).translate(0, 1.28, -0.2), color: 0x2a3440 },
    { geo: () => new THREE.CylinderGeometry(0.36, 0.36, 1.9, 10).rotateZ(Math.PI / 2).translate(0, 0.36, 1.35), color: 0x1d1d1f },
    { geo: () => new THREE.CylinderGeometry(0.36, 0.36, 1.9, 10).rotateZ(Math.PI / 2).translate(0, 0.36, -1.35), color: 0x1d1d1f },
  ],
  boat: [
    { geo: () => { const g = new THREE.CylinderGeometry(1.3, 0.8, 8, 8, 1, false); g.rotateX(Math.PI / 2); g.scale(1, 0.55, 1); g.translate(0, 0.5, 0); return g; }, color: 0xf4f4f2 },
    { geo: () => new THREE.BoxGeometry(1.6, 1.0, 2.4).translate(0, 1.35, -0.6), color: 0xffffff, paint: true },
  ],
  crate: [{ geo: () => new THREE.BoxGeometry(1.4, 1.4, 1.4).translate(0, 0.7, 0), color: 0xb08a55 }],
  dumpster: [{ geo: () => new THREE.BoxGeometry(2, 1.4, 1.6).translate(0, 0.7, 0), color: 0x2f6a3a }],
  fence: [{ geo: () => new THREE.BoxGeometry(0.15, 1.2, 4).translate(0, 0.6, 0), color: 0xe8e2d4 }],
};
const CAR_COLORS = [0xd23c3c, 0x2b62c7, 0xf2f2f2, 0x1f1f22, 0x9aa3ad, 0x2f8f5a, 0xe6b422, 0x7a2f8f, 0x55606e];
const BOAT_COLORS = [0x2b62c7, 0xd23c3c, 0x1f8fa8, 0xf2f2f2];

export class PropLayer {
  constructor(map, scene, shadows) {
    this.map = map;
    this.meshes = {};     // kind -> [InstancedMesh per part]
    this.index = new Map(); // prop id -> [kind, i]
    const byKind = {};
    for (const p of map.props) (byKind[p.kind] = byKind[p.kind] || []).push(p);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const R = rng(11);
    for (const kind in byKind) {
      const list = byKind[kind];
      const parts = PROP_PARTS[kind];
      this.meshes[kind] = parts.map((part) => {
        const mesh = new THREE.InstancedMesh(part.geo(), new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
        mesh.castShadow = shadows && kind !== 'bush';
        mesh.receiveShadow = false;
        list.forEach((p, i) => {
          q.setFromAxisAngle(up, p.rot); s.setScalar(p.s); v.set(p.x, p.y, p.z);
          m4.compose(v, q, s);
          mesh.setMatrixAt(i, m4);
          if (part.paint) col.setHex((kind === 'boat' ? BOAT_COLORS : CAR_COLORS)[Math.floor(R() * (kind === 'boat' ? 4 : 9))]);
          else { col.setHex(part.color); if (part.tint) col.offsetHSL((R() - 0.5) * 0.05, 0, (R() - 0.5) * 0.12); }
          mesh.setColorAt(i, col);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        scene.add(mesh);
        return mesh;
      });
      list.forEach((p, i) => this.index.set(p.id, [kind, i, p]));
    }
    this.shakes = new Map();
  }
  /** Puts every harvested prop back (new match). */
  resetAll() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [, [kind, i, p]] of this.index) {
      q.setFromAxisAngle(up, p.rot); s.setScalar(p.s); v.set(p.x, p.y, p.z); m4.compose(v, q, s);
      for (const mesh of this.meshes[kind]) mesh.setMatrixAt(i, m4);
    }
    for (const kind in this.meshes) for (const mesh of this.meshes[kind]) mesh.instanceMatrix.needsUpdate = true;
    this.shakes.clear();
  }
  hide(id) {
    const e = this.index.get(id); if (!e) return;
    const m4 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const mesh of this.meshes[e[0]]) { mesh.setMatrixAt(e[1], m4); mesh.instanceMatrix.needsUpdate = true; }
    this.shakes.delete(id);
  }
  shake(id) { if (this.index.has(id)) this.shakes.set(id, 0.3); }
  update(dt) {
    if (!this.shakes.size) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e3 = new THREE.Euler();
    for (const [id, t] of this.shakes) {
      const [kind, i, p] = this.index.get(id);
      const nt = t - dt;
      const w = nt > 0 ? Math.sin(nt * 60) * nt * 0.25 : 0;
      e3.set(w, p.rot, w * 0.6); q.setFromEuler(e3); s.setScalar(p.s); v.set(p.x, p.y, p.z);
      m4.compose(v, q, s);
      for (const mesh of this.meshes[kind]) { mesh.setMatrixAt(i, m4); mesh.instanceMatrix.needsUpdate = true; }
      if (nt <= 0) this.shakes.delete(id); else this.shakes.set(id, nt);
    }
  }
}

// ---------- signs + decor ----------
function textTexture(text, bg, fg, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg;
  let size = 72; g.font = `800 ${size}px Outfit, sans-serif`;
  while (g.measureText(text).width > w - 40 && size > 20) { size -= 4; g.font = `800 ${size}px Outfit, sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function makeDecor(map) {
  const group = new THREE.Group();
  for (const d of map.decor) {
    if (d.t === 'sign') {
      const w = Math.max(2.5, Math.min(d.w, 14)), h = Math.min(1.1, w / 4);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(d.text, d.bg, d.fg), side: THREE.DoubleSide }));
      m.position.set(d.x, d.y, d.z); m.rotation.y = d.ry;
      if (d.post) {
        m.position.y += 0.6;
        for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 0.15), new THREE.MeshLambertMaterial({ color: 0xeeeeee })); p.position.set(d.x + Math.cos(d.ry) * s * w * 0.42, d.y - 0.2, d.z - Math.sin(d.ry) * s * w * 0.42); group.add(p); }
      } else {
        // nudge off the wall
        m.position.x += Math.sin(d.ry) * 0.04; m.position.z += Math.cos(d.ry) * 0.04;
      }
      group.add(m);
    } else if (d.t === 'awning') {
      const c = new THREE.Color(d.c);
      const w = d.face === 'n' || d.face === 's' ? d.x1 - d.x0 : d.z1 - d.z0;
      const a = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 1.6), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
      const ry = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[d.face];
      const cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
      const off = { n: [0, -(d.z1 - d.z0) / 2 - 0.7], s: [0, (d.z1 - d.z0) / 2 + 0.7], w: [-(d.x1 - d.x0) / 2 - 0.7, 0], e: [(d.x1 - d.x0) / 2 + 0.7, 0] }[d.face];
      a.position.set(cx + off[0], d.y - 0.35, cz + off[1]);
      a.rotation.set(0, ry, 0); a.rotateX(-Math.PI / 2 + 0.55);
      group.add(a);
    } else if (d.t === 'flag') {
      const h = d.small ? 2.4 : 9;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, h, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(d.x, d.y + h / 2, d.z); group.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(d.small ? 0.6 : 2.6, d.small ? 0.4 : 1.6), new THREE.MeshLambertMaterial({ color: d.small ? 0xff3030 : 0xffffff, side: THREE.DoubleSide, map: d.small ? null : flagTex() }));
      f.position.set(d.x + (d.small ? 0.3 : 1.3), d.y + h - (d.small ? 0.25 : 0.8), d.z); f.userData.flag = true; group.add(f);
    } else if (d.t === 'court' || d.t === 'field') {
      const tex = courtTex(d.t);
      const w = d.w, dd = d.d;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, dd), new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, (d.y !== undefined ? d.y : heightAt(d.x, d.z)) + 0.08, d.z);
      group.add(m);
    } else if (d.t === 'rail') {
      const mat = new THREE.MeshLambertMaterial({ color: 0xd9d4c7 });
      for (const x of [d.x0 + 0.15, d.x1 - 0.15]) {
        const mk = (z0, z1, y0, y1) => { const len = Math.hypot(z1 - z0, y1 - y0); const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, len), mat); b.position.set(x, (y0 + y1) / 2 + 0.5, (z0 + z1) / 2); b.rotation.x = -Math.atan2(y1 - y0, z1 - z0); group.add(b); };
        mk(d.zA, d.zM0, d.yA, d.top); mk(d.zM0, d.zM1, d.top, d.top); mk(d.zM1, d.zB, d.top, d.yB);
      }
    }
  }
  return group;
}
let _flag = null;
function flagTex() {
  if (_flag) return _flag;
  const c = document.createElement('canvas'); c.width = 64; c.height = 40;
  const g = c.getContext('2d');
  for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#fff' : '#c8102e'; g.fillRect(0, i * 40 / 7, 64, 40 / 7 + 1); }
  g.fillStyle = '#1b2a5c'; g.fillRect(0, 0, 28, 21);
  _flag = new THREE.CanvasTexture(c); _flag.colorSpace = THREE.SRGBColorSpace;
  return _flag;
}
function courtTex(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = kind === 'court' ? '#3f7fb5' : '#5aa548'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#fff'; g.lineWidth = 4;
  if (kind === 'court') { g.strokeRect(30, 20, 196, 216); g.beginPath(); g.moveTo(30, 128); g.lineTo(226, 128); g.moveTo(128, 60); g.lineTo(128, 196); g.stroke(); g.strokeRect(55, 60, 146, 136); }
  else { g.strokeRect(10, 10, 236, 236); g.beginPath(); g.arc(128, 128, 30, 0, 7); g.moveTo(128, 10); g.lineTo(128, 246); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- storm ----------
export function makeStorm() {
  const g = new THREE.CylinderGeometry(1, 1, 600, 96, 1, true);
  g.translate(0, 220, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vec2(vUv.x * 60., vW.y * 0.05);
        float s = n(p + vec2(time * 0.6, -time * 1.4)) * 0.6 + n(p * 2.3 + vec2(-time, time * 0.4)) * 0.4;
        float streak = smoothstep(0.7, 1., n(vec2(vUv.x * 400., vW.y * 0.02 - time * 3.)));
        vec3 c = mix(vec3(0.16, 0.2, 0.42), vec3(0.45, 0.55, 0.9), s) + streak * 0.25;
        float a = 0.42 + s * 0.25;
        a *= smoothstep(-20., 10., vW.y);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------- everything ----------
export function buildWorld(map, scene, opts) {
  const sky = makeSky(); scene.add(sky);
  const terrain = makeTerrain(opts.low ? 160 : 240); scene.add(terrain);
  const water = makeWater(); scene.add(water);
  const blocks = new THREE.Mesh(boxGeo(map.boxes, map.slopes, map.decor), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  blocks.castShadow = !!opts.shadows; blocks.receiveShadow = !!opts.shadows;
  scene.add(blocks);
  scene.add(makeRoads(map));
  scene.add(makeDecor(map));
  const props = new PropLayer(map, scene, !!opts.shadows);
  return { sky, terrain, water, blocks, props };
}
