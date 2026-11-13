// Building blocks for car interiors (cockpit.js). Everything is made in code: a Geo collects triangles into named
// material slots, with a transform stack so a part can be modelled in its own frame and placed anywhere.
//   soft   leather / fabric / soft plastic (grainy, matt)      trim   smooth plastic, piano black
//   metal  chrome, aluminium                                   carbon carbon weave
//   glow   unlit: LEDs, lit buttons, light strips
import * as THREE from 'three';
import { toGeometry, carLookEnv, carLookHi } from './models.js';

export const SLOTS = ['soft', 'trim', 'metal', 'carbon', 'glow'];
const COLS = new Map();
const col = (hex) => { let c = COLS.get(hex); if (!c) COLS.set(hex, (c = new THREE.Color(hex))); return c; };
const V = new THREE.Vector3();

export class Geo {
  constructor() { this.s = {}; for (const k of SLOTS) this.s[k] = { p: [], c: [] }; this.m = new THREE.Matrix4(); this.stack = []; }
  /** Run fn with everything it adds moved to (x, y, z) and turned by Euler angles (rx, ry, rz; order YXZ). */
  at(x, y, z, rx, ry, rz, fn) {
    this.stack.push(this.m.clone());
    this.m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)));
    fn(); this.m = this.stack.pop();
  }
  /** Run fn inside a frame given by a matrix. */
  in(matrix, fn) { this.stack.push(this.m.clone()); this.m.multiply(matrix); fn(); this.m = this.stack.pop(); }
  tri(a, b, c, hex, slot) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    const S = this.s[slot], k = col(hex);
    for (const v of [a, b, c]) { V.set(v[0], v[1], v[2]).applyMatrix4(this.m); S.p.push(V.x, V.y, V.z); S.c.push(k.r, k.g, k.b); }
  }
  /** A quad facing away from ctr (or towards it, with flip). */
  quad(a, b, c, d, hex, ctr, slot, flip = false) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) { const wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2]; nx = vy * wz - vz * wy; ny = vz * wx - vx * wz; nz = vx * wy - vy * wx; }
    const fx = (a[0] + b[0] + c[0] + d[0]) / 4 - ctr[0], fy = (a[1] + b[1] + c[1] + d[1]) / 4 - ctr[1], fz = (a[2] + b[2] + c[2] + d[2]) / 4 - ctr[2];
    if ((nx * fx + ny * fy + nz * fz < 0) !== flip) { this.tri(a, c, b, hex, slot); this.tri(a, d, c, hex, slot); } else { this.tri(a, b, c, hex, slot); this.tri(a, c, d, hex, slot); }
  }
  box(cx, cy, cz, sx, sy, sz, hex, slot) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, c = [cx, cy, cz];
    const q = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    for (const [a, b, d, e] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]) this.quad(q[a], q[b], q[d], q[e], hex, c, slot);
  }
  /**
   * Rings of points (all the same length) joined into a skin. loop: each ring closes on itself. capA / capB: fill the
   * first / last ring (fan from its middle). ctr: a point inside (faces point away from it); by default the middle.
   */
  loft(rings, hex, slot, { loop = true, capA = false, capB = false, ctr = null, flip = false } = {}) {
    const n = rings[0].length;
    if (!ctr) { ctr = [0, 0, 0]; let k = 0; for (const r of rings) for (const p of r) { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; k++; } ctr = ctr.map((v) => v / k); }
    const colAt = (i) => (typeof hex === 'function' ? hex(i) : hex);
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i], B = rings[i + 1], c = typeof ctr === 'function' ? ctr(i) : ctr;
      for (let j = 0; j < (loop ? n : n - 1); j++) { const k = (j + 1) % n; this.quad(A[j], A[k], B[k], B[j], typeof hex === 'function' ? hex(i, j) : hex, c, slot, flip); }
    }
    const cap = (R, i) => { const m = [0, 0, 0]; for (const p of R) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; } const c = typeof ctr === 'function' ? ctr(i) : ctr; for (let j = 0; j < n; j++) this.quad(m, R[j], R[(j + 1) % n], m, colAt(i), c, slot); };
    if (capA) cap(rings[0], 0);
    if (capB) cap(rings[rings.length - 1], rings.length - 2);
  }
  /** A box with rounded edges: a rounded outline swept along `axis` ('x' | 'y' | 'z'), pillowed at both ends. */
  rbox(cx, cy, cz, sx, sy, sz, r, hex, slot, axis = 'z') {
    const dims = axis === 'z' ? [sx, sy, sz] : axis === 'x' ? [sz, sy, sx] : [sx, sz, sy];
    const [w, h, d] = dims, rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4), e = Math.min(rr * 0.6, d / 2 - 1e-4);
    const outline = (shrink) => {
      const o = [], hw = w / 2 - shrink, hh = h / 2 - shrink, q = Math.max(1e-4, rr - shrink);
      for (const [sxn, syn, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]]) for (let i = 0; i <= 3; i++) { const a = a0 + (i / 3) * (Math.PI / 2); o.push([sxn * (hw - q) + Math.cos(a) * q, syn * (hh - q) + Math.sin(a) * q]); }
      return o;
    };
    const map = (u, v, t) => (axis === 'z' ? [cx + u, cy + v, cz + t] : axis === 'x' ? [cx + t, cy + v, cz - u] : [cx + u, cy + t, cz - v]);
    const rings = [[e, -d / 2], [0, -d / 2 + e], [0, d / 2 - e], [e, d / 2]].map(([sh, t]) => outline(sh).map(([u, v]) => map(u, v, t)));
    this.loft(rings, hex, slot, { capA: true, capB: true, ctr: [cx, cy, cz] });
  }
  /** Solid of revolution round the local z axis. prof = [[radius, z], ...]. n sides. Caps where a radius is 0 come free. */
  lathe(prof, n, hex, slot, { arc = Math.PI * 2, a0 = 0 } = {}) {
    const full = arc >= Math.PI * 2 - 1e-6, m = full ? n : n + 1;
    const rings = prof.map(([r, z]) => Array.from({ length: m }, (_, i) => { const a = a0 + (i / n) * arc; return [Math.cos(a) * r, Math.sin(a) * r, z]; }));
    const zs = prof.map((q) => q[1]);
    for (let i = 0; i < rings.length - 1; i++) {
      const [r0, z0] = prof[i], [r1, z1] = prof[i + 1];
      // a flat ring faces along z, away from the profile's middle; a wall faces away from the axis
      const flat = Math.abs(r1 - r0) > Math.abs(z1 - z0) * 3, zm = (Math.min(...zs) + Math.max(...zs)) / 2, za = (z0 + z1) / 2;
      const c = flat ? [0, 0, za + (za >= zm ? -1 : 1)] : [0, 0, za];
      for (let j = 0; j < (full ? n : n); j++) { const k = full ? (j + 1) % n : j + 1; this.quad(rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j], typeof hex === 'function' ? hex(i) : hex, c, slot); }
    }
  }
  /**
   * A tube along a path of points. r: radius (number or fn(i, t 0..1)). sides. closed: joins the end to the start.
   * squash: [sx, sy] flattens the cross-section (in the tube's own side / up directions).
   */
  tube(pts, r, sides, hex, slot, { closed = false, caps = true, squash = null, up = null } = {}) {
    const n = pts.length, P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const T = P.map((p, i) => { const a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]; return b.clone().sub(a).normalize(); });
    let N = (up ? new THREE.Vector3(...up) : Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
    N = N.sub(T[0].clone().multiplyScalar(N.dot(T[0]))).normalize();
    const rings = [];
    for (let i = 0; i < n; i++) {
      if (i) { N.sub(T[i].clone().multiplyScalar(N.dot(T[i]))); if (N.lengthSq() < 1e-8) N.set(0, 1, 0).cross(T[i]); N.normalize(); }
      const Bn = T[i].clone().cross(N), rad = typeof r === 'function' ? r(i, i / (n - 1)) : r, ring = [];
      for (let j = 0; j < sides; j++) { const a = (j / sides) * Math.PI * 2, cu = Math.cos(a) * rad * (squash ? squash[0] : 1), cv = Math.sin(a) * rad * (squash ? squash[1] : 1); ring.push([P[i].x + Bn.x * cu + N.x * cv, P[i].y + Bn.y * cu + N.y * cv, P[i].z + Bn.z * cu + N.z * cv]); }
      rings.push(ring);
    }
    if (closed) rings.push(rings[0]);
    const mids = P.map((p) => [p.x, p.y, p.z]); if (closed) mids.push(mids[0]);
    this.loft(rings, hex, slot, { capA: caps && !closed, capB: caps && !closed, ctr: (i) => [(mids[i][0] + mids[i + 1][0]) / 2, (mids[i][1] + mids[i + 1][1]) / 2, (mids[i][2] + mids[i + 1][2]) / 2] });
  }
  /**
   * A flat outline in the z-y plane ([[z, y], ...], any shape, either winding) pushed out from x0 to x1, with both
   * ends filled. hex may be a function of the edge number.
   */
  slab(prof, x0, x1, hex, slot, ends = true) {
    const n = prof.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = prof[i], b = prof[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sg = area > 0 ? 1 : -1, xm = (x0 + x1) / 2;
    for (let i = 0; i < n; i++) {
      const a = prof[i], b = prof[(i + 1) % n], dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1;
      const nz = (sg * dy) / l, ny = (-sg * dz) / l; // outward, in the z-y plane
      this.quad([x0, a[1], a[0]], [x1, a[1], a[0]], [x1, b[1], b[0]], [x0, b[1], b[0]], typeof hex === 'function' ? hex(i) : hex, [xm, (a[1] + b[1]) / 2 - ny * 0.01, (a[0] + b[0]) / 2 - nz * 0.01], slot);
    }
    if (!ends) return;
    const my = prof.reduce((q, p) => q + p[1], 0) / n, mz = prof.reduce((q, p) => q + p[0], 0) / n, endCol = typeof hex === 'function' ? hex(-1) : hex;
    const tris = THREE.ShapeUtils.triangulateShape(prof.map(([z, y]) => new THREE.Vector2(z, y)), []);
    for (const x of [x0, x1]) for (const [i, j, k] of tris) { const A = [x, prof[i][1], prof[i][0]], B = [x, prof[j][1], prof[j][0]], D = [x, prof[k][1], prof[k][0]]; this.quad(A, B, D, A, endCol, [xm, my, mz], slot); }
  }
  /** One mesh per used slot. */
  meshes(mats, crease = 40) {
    const out = [], cosT = Math.cos((crease * Math.PI) / 180);
    for (const k of SLOTS) {
      const S = this.s[k];
      if (!S.p.length) continue;
      const g = toGeometry(S.p, S.c, cosT);
      if (k === 'soft' || k === 'carbon') boxUV(g, k === 'carbon' ? 48 : 9);
      const m = new THREE.Mesh(g, mats[k]);
      m.frustumCulled = false;
      out.push(m);
    }
    return out;
  }
  group(mats, crease) { const g = new THREE.Group(); for (const m of this.meshes(mats, crease)) g.add(m); return g; }
}

/** Texture coordinates from position: each triangle is mapped flat along the axis it faces most (tiles per metre = k). */
function boxUV(g, k) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = new Float32Array((p.length / 3) * 2);
  for (let t = 0; t < p.length; t += 9) {
    const ax = Math.abs(n[t] + n[t + 3] + n[t + 6]), ay = Math.abs(n[t + 1] + n[t + 4] + n[t + 7]), az = Math.abs(n[t + 2] + n[t + 5] + n[t + 8]);
    for (let v = 0; v < 3; v++) {
      const o = t + v * 3, x = p[o], y = p[o + 1], z = p[o + 2], u = (o / 3) * 2;
      if (ax >= ay && ax >= az) { uv[u] = z * k; uv[u + 1] = y * k; } else if (ay >= az) { uv[u] = x * k; uv[u + 1] = z * k; } else { uv[u] = x * k; uv[u + 1] = y * k; }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ---------------------------------------------------------------- textures + materials
function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  // carbon: a 2x2 twill weave, light catching each tow differently
  const carbon = canvasTex(64, (g, s) => {
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, s, s);
    const q = s / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const over = ((x + y) & 3) < 2, gr = g.createLinearGradient(x * q, y * q, over ? (x + 1) * q : x * q, over ? y * q : (y + 1) * q);
      gr.addColorStop(0, over ? '#3a3d44' : '#16181c'); gr.addColorStop(0.5, over ? '#6a6f7a' : '#2a2d33'); gr.addColorStop(1, over ? '#2a2c32' : '#101114');
      g.fillStyle = gr; g.fillRect(x * q + 0.5, y * q + 0.5, q - 1, q - 1);
    }
  });
  carbon.colorSpace = THREE.SRGBColorSpace;
  // leather / soft plastic grain: fine pebbles, used as a bump
  const grain = canvasTex(128, (g, s) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) { const v = 96 + Math.random() * 80; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 0.6 + Math.random() * 1.5, 0, 6.3); g.fill(); }
  });
  return (TEX = { carbon, grain });
}

/** The five slot materials. hi = the pretty graphics setting. */
export function cabinMaterials(hi = carLookHi()) {
  const T = textures(), env = carLookEnv();
  if (!hi) {
    return {
      soft: new THREE.MeshLambertMaterial({ vertexColors: true }),
      trim: new THREE.MeshLambertMaterial({ vertexColors: true }),
      metal: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x16181c }),
      carbon: new THREE.MeshLambertMaterial({ vertexColors: true, map: T.carbon }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
  }
  return {
    soft: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, bumpMap: T.grain, bumpScale: 0.22, envMap: env, envMapIntensity: 0.07 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.1, envMap: env, envMapIntensity: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 1, envMap: env, envMapIntensity: 1.3 }),
    carbon: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.carbon, roughness: 0.3, metalness: 0.35, envMap: env, envMapIntensity: 0.9 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.5, 1.5, 1.5) }),
  };
}
export function disposeMaterials(mats) { for (const k of Object.keys(mats)) mats[k].dispose(); }

// ---------------------------------------------------------------- small shared helpers
export const mix = (a, b, t) => { const A = col(a), B = col(b), c = new THREE.Color(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t); return c.getHex(); };
export const shade = (hex, k) => mix(hex, k < 0 ? 0x000000 : 0xffffff, Math.abs(k));
/** A screen: a flat panel showing a canvas, unlit so it glows. Returns { mesh, canvas, g, tex }. */
export function screenPlane(w, h, pxW, pxH, hi) {
  const canvas = document.createElement('canvas'); canvas.width = pxW; canvas.height = pxH;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.94, 0.94, 0.94) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.frustumCulled = false;
  return { mesh, canvas, g: canvas.getContext('2d'), tex };
}
