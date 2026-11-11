// Kart parts: bodies, wheels and gliders, their stats, and the 3D models (smooth lofted hulls, lathe-turned tyres,
// curved cloth, merged per material so a whole kart is only a couple of dozen draw calls). There is no driver: each kart is its own little
// machine (an empty seat and wheel, or a tinted glass dome).
import * as THREE from 'three';

// stats: [speed, accel, weight, handling, grip, turbo], 0..6
export const STAT_NAMES = ['Speed', 'Accel', 'Weight', 'Handling', 'Grip', 'Mini-turbo'];

export const BODIES = [
  { id: 'classic', name: 'Classic', s: [3, 3, 3, 3, 3, 3] },
  { id: 'dart', name: 'Dart', s: [4.25, 2.25, 2.5, 3.25, 2.5, 3] },
  { id: 'bumper', name: 'Bumper', s: [3.25, 2.5, 4.5, 2.25, 3.25, 2.75] },
  { id: 'bubble', name: 'Bubble', s: [2.25, 4.25, 1.75, 4, 3, 3.75] },
  { id: 'hotrod', name: 'Hot Rod', s: [4.5, 2, 4, 2.25, 2.5, 2.5] },
  { id: 'buggy', name: 'Dune Buggy', s: [2.75, 3.5, 3, 3, 4.5, 3] },
  { id: 'comet', name: 'Comet', s: [3.5, 3, 2.75, 3.5, 2.5, 4.5] },
  { id: 'brick', name: 'Brick', s: [4.25, 1.75, 5, 2, 3, 2.25] },
];
export const WHEELS = [
  { id: 'standard', name: 'Standard', s: [0, 0, 0, 0, 0, 0] },
  { id: 'slick', name: 'Slicks', s: [0.5, -0.25, 0.25, 0, -0.75, 0] },
  { id: 'chunky', name: 'Chunky', s: [-0.25, -0.25, 0.5, -0.25, 1, 0] },
  { id: 'mini', name: 'Minis', s: [-0.5, 0.75, -0.5, 0.5, -0.25, 0.5] },
  { id: 'spoke', name: 'Spokes', s: [0.25, 0, 0, 0.5, -0.25, -0.25] },
  { id: 'hover', name: 'Hover Rings', s: [0, 0.25, -0.25, 0.25, -0.5, 0.75] },
];
export const GLIDERS = [
  { id: 'wing', name: 'Delta Wing', s: [0, 0, 0, 0, 0, 0] },
  { id: 'kite', name: 'Kite', s: [0, 0.25, -0.25, 0, 0, 0] },
  { id: 'sail', name: 'Parasail', s: [-0.25, 0.25, 0, 0.25, 0, 0] },
  { id: 'bat', name: 'Night Wing', s: [0.25, 0, 0.25, -0.25, 0, 0] },
  { id: 'jet', name: 'Jet Wings', s: [0.25, -0.25, 0, 0, 0, 0.25] },
];
export const PART_LISTS = { body: BODIES, wheels: WHEELS, glider: GLIDERS };
export const PAINTS = [0xe8322a, 0xff7a1a, 0xffc21a, 0x9be22d, 0x22b455, 0x16c2b0, 0x2ab8ff, 0x2a5cff, 0xf2f4f8, 0x2a2e38, 0xc9a24a];

// what you start with; the rest unlock one by one as you collect coins
export const STARTER = ['classic', 'dart', 'bumper', 'standard', 'slick', 'chunky', 'wing', 'kite'];
export const UNLOCK_ORDER = ['bubble', 'spoke', 'sail', 'buggy', 'mini', 'hotrod', 'bat', 'comet', 'hover', 'brick', 'jet'];
export const COINS_PER_UNLOCK = 30;
export const partById = (id) => BODIES.find((p) => p.id === id) || WHEELS.find((p) => p.id === id) || GLIDERS.find((p) => p.id === id);
export const kindOf = (id) => (BODIES.some((p) => p.id === id) ? 'body' : WHEELS.some((p) => p.id === id) ? 'wheels' : 'glider');

/** Combined stats of a build, each 0..6. */
export function statsOf(b) {
  const a = (BODIES.find((p) => p.id === b.body) || BODIES[0]).s, w = (WHEELS.find((p) => p.id === b.wheels) || WHEELS[0]).s, g = (GLIDERS.find((p) => p.id === b.glider) || GLIDERS[0]).s;
  return a.map((v, i) => Math.max(0.25, Math.min(6, v + w[i] + g[i])));
}

// ---------------------------------------------------------------- materials
/** The kart's materials. paint = the colour you pick; paint2 is a deeper shade of it and stripe contrasts with it. */
export function kartMaterials(paint, env, hi) {
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ envMap: env, envMapIntensity: 1 }, o));
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const M = {
    paint: hi ? new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1, envMap: env, envMapIntensity: 1.3 }) : std({ color: paint, metalness: 0.3, roughness: 0.38 }),
    paint2: std({ color: paint, metalness: 0.45, roughness: 0.3, envMapIntensity: 1.1 }),
    stripe: std({ color: 0xf4f6fa, metalness: 0.1, roughness: 0.35 }),
    dark: std({ color: 0x1b1e26, metalness: 0.25, roughness: 0.6, envMapIntensity: 0.5 }),
    carbon: std({ color: 0x14161b, metalness: 0.5, roughness: 0.28, envMapIntensity: 0.9 }),
    seat: std({ color: 0x262a33, metalness: 0, roughness: 0.85, envMapIntensity: 0.3 }),
    metal: std({ color: 0x6a717e, metalness: 0.9, roughness: 0.34 }),
    chrome: std({ color: 0xeef1f6, metalness: 1, roughness: 0.12, envMapIntensity: 1.6 }),
    rubber: std({ color: 0x17181c, metalness: 0, roughness: 0.9, envMapIntensity: 0.25 }),
    wall: std({ color: 0xe9ecf2, metalness: 0, roughness: 0.6, envMapIntensity: 0.4 }), // whitewalls
    rim: std({ color: 0xc8ced8, metalness: 0.85, roughness: 0.26 }),
    glass: std({ color: 0x0b1622, metalness: 0.3, roughness: 0.03, transparent: true, opacity: 0.68, envMapIntensity: 2.0 }),
    accent: glow(0.35, 1.6, 2.3),
    amber: glow(2.4, 1.3, 0.25),
    light: glow(2.3, 2.1, 1.7),
    tail: glow(1.8, 0.12, 0.1),
    cloth: std({ color: paint, metalness: 0, roughness: 0.62, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    cloth2: std({ color: 0xf2f4f8, metalness: 0, roughness: 0.62, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    clothDark: std({ color: 0x20232c, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
  };
  tint(M, paint);
  return M;
}
/** Re-colour the paint-based materials (garage paint swatches). */
function tint(M, paint) {
  const c = new THREE.Color(paint);
  M.paint.color.copy(c); M.cloth.color.copy(c);
  const hsl = {}; c.getHSL(hsl);
  // a deeper, richer shade for two-tone parts; a stripe that stands out against the paint
  M.paint2.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), hsl.l * 0.5);
  const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  M.stripe.color.setHex(lum > 0.5 ? 0x1c2028 : 0xf4f6fa);
}

// ---------------------------------------------------------------- shape helpers
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
function mesh(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  return o;
}
const box = (w, h, d, m, x, y, z, rx, ry, rz) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz);
/** A rounded box (bevelled by extruding a rounded rectangle). */
function rbox(w, h, d, r, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const s = new THREE.Shape(), hw = w / 2 - r, hh = h / 2 - r;
  s.moveTo(-hw, -h / 2); s.lineTo(hw, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh); s.lineTo(w / 2, hh); s.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
  s.lineTo(-hw, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh); s.lineTo(-w / 2, -hh); s.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - r * 2), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 5 });
  g.translate(0, 0, -Math.max(0.001, d - r * 2) / 2);
  return mesh(g, m, x, y, z, rx, ry, rz);
}
/** Cylinder along X (axles, pipes across) unless axis is given: 'y' or 'z'. */
function cyl(r1, r2, len, m, x, y, z, axis = 'x', seg = 16) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  return mesh(g, m, x, y, z);
}
const sphere = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = mesh(new THREE.SphereGeometry(r, 20, 14), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
/** A tube between two points. */
function rod(a, b, r, m, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return o;
}
/** A bent tube through points (roll cages, exhaust pipes, bumpers). */
function pipe(pts, r, m, seg = 8) {
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(8, pts.length * 8), r, seg, false), m);
}
/**
 * A smooth hull lofted through cross-sections along z (rear to front). Each section: [z, halfWidth, halfHeight,
 * yCentre, squareness (2 = round, 3-4 = rounded box), topBulge (extra height on the top half only)].
 * The ends are closed, so taper the first and last sections for a rounded nose and tail.
 */
function loft(secs, m, seg = 28) {
  const pos = [], idx = [];
  const ring = ([z, w, h, y, n = 3, top = 0]) => {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a), e = 2 / n;
      pos.push(Math.sign(c) * Math.pow(Math.abs(c), e) * w, y + Math.sign(s) * Math.pow(Math.abs(s), e) * (s > 0 ? h + top : h), z);
    }
  };
  secs.forEach(ring);
  for (let j = 0; j < secs.length - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * seg + i, b = j * seg + ((i + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  // caps (their own vertices so the edge stays crisp)
  for (const [end, dir] of [[0, -1], [secs.length - 1, 1]]) {
    const base = pos.length / 3, sec = secs[end];
    pos.push(0, sec[3], sec[0]);
    for (let i = 0; i < seg; i++) { const k = (end * seg + i) * 3; pos.push(pos[k], pos[k + 1], pos[k + 2]); }
    for (let i = 0; i < seg; i++) { const p = base + 1 + i, q = base + 1 + ((i + 1) % seg); if (dir > 0) idx.push(base, p, q); else idx.push(base, q, p); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, m);
}
/** A curved sheet (cloth, wings): f(u, v) -> [x, y, z] for u, v in 0..1. */
function sheet(nu, nv, f, m) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...f(i / nu, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, m);
}
/** An arch over a wheel (fender): half a ring in the YZ plane, `w` wide. */
function fender(r, w, t, m, x, y, z, from = 0, to = Math.PI) {
  const g = new THREE.TorusGeometry(r, t, 8, 20, to - from);
  g.rotateZ(from); g.rotateY(Math.PI / 2); g.scale(w / (t * 2), 1, 1);
  return mesh(g, m, x, y, z);
}
/** A flat outline (x right, y forward) as a thin plate lying in the XZ plane. */
function plate(pts, m, y = 0, thick = 0.02) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // outline +y -> forward (+z); extrusion goes down from y
  return mesh(g, m, 0, y, 0);
}

/** Merge every mesh of a group into one mesh per material (baking transforms). */
function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const by = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(g);
    o.geometry.dispose();
  });
  const out = new THREE.Group();
  for (const [m, list] of by) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let k = 0;
    for (const g of list) { pos.set(g.attributes.position.array, k * 3); nor.set(g.attributes.normal.array, k * 3); k += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.computeBoundingSphere();
    out.add(new THREE.Mesh(geo, m));
  }
  return out;
}

// ---------------------------------------------------------------- shared bits
/** The empty driver's seat (a bucket with a headrest) and the steering wheel in front of it. */
function cockpit(g, M, z = -0.3, y = 0.42, lean = -0.28) {
  g.add(loft([[z - 0.2, 0.2, 0.05, y + 0.02, 3], [z - 0.16, 0.27, 0.07, y + 0.04, 3], [z + 0.1, 0.27, 0.07, y + 0.03, 3], [z + 0.22, 0.24, 0.06, y + 0.02, 3], [z + 0.26, 0.16, 0.04, y + 0.02, 3]], M.seat, 16));
  g.add(rbox(0.52, 0.5, 0.1, 0.05, M.seat, 0, y + 0.3, z - 0.2, lean));
  g.add(rbox(0.3, 0.16, 0.1, 0.04, M.seat, 0, y + 0.64, z - 0.3, lean));
  g.add(rod(V(0, y - 0.02, z + 0.86), V(0, y + 0.3, z + 0.56), 0.024, M.dark));
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.026, 8, 22), M.carbon);
  sw.position.set(0, y + 0.32, z + 0.54); sw.rotation.x = -0.95; g.add(sw);
  const hub = cyl(0.04, 0.04, 0.05, M.paint, 0, y + 0.32, z + 0.54, 'z', 10); hub.rotation.x = -0.95; g.add(hub);
}
/** Headlights: a chrome bezel round a glowing lens. */
function headlights(g, M, z, y, x, r = 0.075) {
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.22, 8, 18), M.chrome); b.position.set(s * x, y, z); g.add(b);
    g.add(sphere(r * 0.92, M.light, s * x, y, z - r * 0.2, 1, 1, 0.55));
  }
}
/** Tail lights. */
function tails(g, M, z, y, x, w = 0.16, h = 0.06) { for (const s of [-1, 1]) g.add(rbox(w, h, 0.04, 0.015, M.tail, s * x, y, z)); }
/** An exhaust pipe pointing back: chrome with a dark mouth. */
function exhaust(g, M, x, y, z, r = 0.06, len = 0.4, up = 0) {
  const p = cyl(r, r * 1.15, len, M.chrome, x, y, z, 'z', 14); p.rotation.x = Math.PI / 2 + up; g.add(p);
  g.add(cyl(r * 0.78, r * 0.78, 0.02, M.dark, x, y - Math.sin(up) * len * 0.5, z - len / 2 - 0.005, 'z', 12));
}

// ---------------------------------------------------------------- bodies
// Each body returns { g: Group, axF, axR, tF, tR, wF, wR (wheel size), mount (glider), pipes: [[x,y,z]] } and keeps
// clear of the wheels (wheel centres at x = ±tF/tR, z = axF/axR, radius up to about 0.38 with the biggest tyres).
const BODY_BUILD = {
  // the classic go-kart: low tray, a nose fairing, side pods, twin pipes out the back
  classic(M) {
    const g = new THREE.Group();
    g.add(loft([[-1.02, 0.36, 0.04, 0.2, 5], [-0.94, 0.5, 0.05, 0.2, 5], [0.9, 0.46, 0.05, 0.2, 5], [1.0, 0.34, 0.04, 0.2, 5]], M.dark, 24));
    g.add(loft([[0.28, 0.3, 0.1, 0.32, 3], [0.55, 0.36, 0.15, 0.33, 3, 0.04], [0.92, 0.36, 0.13, 0.31, 3, 0.03], [1.16, 0.3, 0.08, 0.28, 2.6], [1.26, 0.2, 0.04, 0.27, 2.2]], M.paint));
    const roundel = cyl(0.12, 0.12, 0.012, M.stripe, 0, 0.485, 0.86, 'y', 20); roundel.rotation.x = 0.22; g.add(roundel); // number roundel
    for (const s of [-1, 1]) {
      const pod = loft([[-0.32, 0.08, 0.06, 0.3, 3], [-0.24, 0.15, 0.11, 0.32, 3, 0.02], [0.2, 0.15, 0.12, 0.33, 3, 0.02], [0.34, 0.1, 0.08, 0.31, 3]], M.paint, 20);
      pod.position.x = s * 0.5; g.add(pod);
      g.add(box(0.05, 0.012, 0.44, M.stripe, s * 0.5, 0.477, -0.02));
    }
    g.add(pipe([V(-0.62, 0.24, 1.18), V(-0.5, 0.24, 1.32), V(0.5, 0.24, 1.32), V(0.62, 0.24, 1.18)], 0.03, M.chrome));
    cockpit(g, M, -0.3);
    g.add(rbox(0.6, 0.3, 0.42, 0.06, M.metal, 0, 0.42, -0.84));
    for (let i = 0; i < 4; i++) g.add(box(0.62, 0.02, 0.04, M.dark, 0, 0.5 + i * 0.05, -0.62));
    g.add(cyl(0.11, 0.11, 0.14, M.chrome, 0.2, 0.62, -0.84, 'x', 14));
    for (const s of [-1, 1]) g.add(pipe([V(s * 0.16, 0.45, -0.9), V(s * 0.2, 0.5, -1.12), V(s * 0.22, 0.6, -1.32)], 0.045, M.chrome));
    g.add(pipe([V(-0.62, 0.22, -1.12), V(-0.5, 0.22, -1.26), V(0.5, 0.22, -1.26), V(0.62, 0.22, -1.12)], 0.03, M.chrome));
    headlights(g, M, 1.2, 0.36, 0.2, 0.06); tails(g, M, -1.05, 0.46, 0.2);
    return { g, axF: 0.72, axR: -0.72, tF: 0.66, tR: 0.74, wF: 0.88, wR: 1.05, mount: V(0, 1.0, -0.6), pipes: [[-0.22, 0.6, -1.36], [0.22, 0.6, -1.36]] };
  },
  // an open-wheel racer: needle nose, two-element front wing, side pods, airbox, rear wing
  dart(M) {
    const g = new THREE.Group();
    g.add(loft([[-1.2, 0.2, 0.1, 0.4, 3], [-1.05, 0.3, 0.17, 0.42, 3], [-0.55, 0.36, 0.21, 0.43, 3, 0.03], [-0.1, 0.34, 0.2, 0.42, 3, 0.04], [0.35, 0.25, 0.16, 0.39, 3], [0.9, 0.16, 0.11, 0.35, 2.6], [1.4, 0.1, 0.07, 0.31, 2.4], [1.72, 0.03, 0.03, 0.29, 2]], M.paint));
    g.add(loft([[0.38, 0.06, 0.02, 0.55, 2], [0.9, 0.05, 0.02, 0.465, 2], [1.4, 0.035, 0.015, 0.385, 2], [1.6, 0.02, 0.01, 0.34, 2]], M.stripe, 12)); // nose stripe
    for (const [y, z, w] of [[0.16, 1.62, 1.56], [0.24, 1.48, 1.4]]) g.add(rbox(w, 0.035, 0.22, 0.015, y > 0.2 ? M.paint2 : M.carbon, 0, y, z, 0.12));
    for (const s of [-1, 1]) g.add(rbox(0.035, 0.22, 0.42, 0.012, M.paint2, s * 0.79, 0.24, 1.56));
    for (const s of [-1, 1]) {
      const pod = loft([[-0.36, 0.1, 0.08, 0.34, 3], [-0.22, 0.16, 0.14, 0.36, 3], [0.25, 0.16, 0.15, 0.37, 3], [0.5, 0.14, 0.12, 0.36, 3.5]], M.paint, 20);
      pod.position.x = s * 0.4; g.add(pod);
      g.add(sphere(0.1, M.dark, s * 0.4, 0.37, 0.5, 1.2, 1, 0.3)); // intake mouth
    }
    cockpit(g, M, -0.3, 0.42);
    g.add(pipe([V(-0.26, 0.56, -0.62), V(-0.2, 0.86, -0.4), V(0, 0.9, -0.1), V(0.2, 0.86, -0.4), V(0.26, 0.56, -0.62)], 0.03, M.carbon)); // halo hoop
    g.add(loft([[-1.1, 0.04, 0.05, 0.62, 3], [-0.95, 0.13, 0.2, 0.68, 3], [-0.62, 0.12, 0.2, 0.72, 3], [-0.55, 0.1, 0.12, 0.74, 3]], M.paint, 18)); // airbox
    g.add(sphere(0.07, M.dark, 0, 0.82, -0.55, 1, 1, 0.3));
    g.add(rbox(1.2, 0.04, 0.32, 0.015, M.carbon, 0, 0.98, -1.12, -0.12)); g.add(rbox(1.2, 0.03, 0.16, 0.012, M.paint2, 0, 1.06, -1.25, -0.3));
    for (const s of [-1, 1]) { g.add(rbox(0.035, 0.36, 0.5, 0.012, M.paint, s * 0.61, 0.98, -1.16)); g.add(box(0.04, 0.4, 0.06, M.carbon, s * 0.18, 0.76, -1.05)); }
    for (let i = -2; i <= 2; i++) g.add(box(0.02, 0.12, 0.3, M.carbon, i * 0.12, 0.2, -1.1));
    exhaust(g, M, 0, 0.45, -1.22, 0.05, 0.22, -0.15);
    headlights(g, M, 1.02, 0.42, 0.13, 0.04); tails(g, M, -1.23, 0.36, 0, 0.12, 0.08);
    return { g, axF: 0.92, axR: -0.78, tF: 0.6, tR: 0.7, wF: 0.82, wR: 1.05, mount: V(0, 1.12, -0.65), pipes: [[0, 0.44, -1.34]] };
  },
  // a fairground bumper car: round tub on a thick rubber ring, little caster wheels under it, a pole with a spark tip
  bumper(M) {
    const g = new THREE.Group(), secs = [];
    for (let i = 0; i <= 10; i++) { const z = -1.08 + (i / 10) * 2.16, k = Math.sqrt(Math.max(0.02, 1 - Math.pow(z / 1.12, 2))); secs.push([z, 0.86 * k, 0.2 * (0.6 + 0.4 * k), 0.72, 2.6, 0.06 * k]); }
    g.add(loft(secs, M.paint));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.16, 12, 40), M.rubber); ring.rotation.x = Math.PI / 2; ring.position.y = 0.52; ring.scale.set(1, 1.26, 1); g.add(ring);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.03, 8, 40), M.stripe); band.rotation.x = Math.PI / 2; band.position.y = 0.78; band.scale.set(0.95, 1.23, 1); g.add(band);
    cockpit(g, M, -0.2, 0.99, -0.2);
    g.add(rod(V(0, 0.9, -0.88), V(0, 2.1, -0.95), 0.025, M.chrome));
    g.add(sphere(0.09, M.amber, 0, 2.14, -0.95));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.add(rod(V(0, 2.14, -0.95), V(Math.cos(a) * 0.16, 2.24, -0.95 + Math.sin(a) * 0.16), 0.008, M.amber)); }
    headlights(g, M, 1.14, 0.78, 0.36, 0.11);
    for (const s of [-1, 1]) g.add(sphere(0.05, M.amber, s * 0.6, 0.86, 0.85));
    tails(g, M, -1.15, 0.78, 0.34, 0.18, 0.08);
    return { g, axF: 0.62, axR: -0.62, tF: 0.6, tR: 0.6, wF: 0.82, wR: 0.86, mount: V(0, 1.45, -0.45), pipes: [[0, 0.5, -1.3]] };
  },
  // a round little pod with a glass dome, its four wheels under rounded fenders
  bubble(M) {
    const g = new THREE.Group(), secs = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, z = -0.98 + t * 1.96, k = Math.sin(Math.acos(Math.max(-1, Math.min(1, z / 1.0)))); secs.push([z, 0.48 * Math.max(0.05, k), 0.36 * Math.max(0.05, k), 0.6, 2.2, 0.06 * k]); }
    g.add(loft(secs, M.paint, 30));
    g.add(sphere(0.4, M.glass, 0, 0.86, -0.06, 1, 0.75, 1.2));
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.03, 8, 36), M.accent); belt.rotation.x = Math.PI / 2; belt.position.y = 0.6; belt.scale.set(1, 2.05, 1); g.add(belt);
    for (const [z, sx] of [[0.55, 1], [-0.55, 1]]) for (const s of [-1, 1]) {
      g.add(fender(0.36, 0.3, 0.06, M.paint, s * 0.62, 0.27, z, -0.15, Math.PI + 0.15));
      g.add(rod(V(s * 0.38, 0.52, z), V(s * 0.6, 0.5, z), 0.05 * sx, M.paint2));
    }
    g.add(loft([[-0.7, 0.36, 0.05, 0.28, 3], [0.7, 0.36, 0.05, 0.28, 3]], M.dark, 16));
    g.add(rod(V(0.12, 1.1, -0.35), V(0.18, 1.5, -0.45), 0.012, M.chrome)); g.add(sphere(0.06, M.amber, 0.18, 1.52, -0.45));
    headlights(g, M, 0.93, 0.62, 0.22, 0.08); tails(g, M, -0.96, 0.66, 0.2, 0.14, 0.06);
    return { g, axF: 0.55, axR: -0.55, tF: 0.62, tR: 0.62, wF: 0.8, wR: 0.8, mount: V(0, 1.42, -0.2), pipes: [[0, 0.42, -1.02]] };
  },
  // long-nose hot rod: exposed chrome engine with a blower and stacks, big rear fenders, side pipes
  hotrod(M) {
    const g = new THREE.Group();
    g.add(loft([[-1.32, 0.3, 0.06, 0.24, 4], [-1.2, 0.42, 0.07, 0.24, 4], [1.15, 0.34, 0.06, 0.24, 4], [1.24, 0.26, 0.05, 0.24, 4]], M.dark, 20));
    g.add(loft([[0.28, 0.34, 0.13, 0.4, 3.4], [0.9, 0.34, 0.13, 0.38, 3.4, 0.02], [1.12, 0.3, 0.12, 0.36, 3.2], [1.18, 0.26, 0.1, 0.36, 3]], M.paint));
    for (let i = -3; i <= 3; i++) g.add(box(0.02, 0.2, 0.03, M.chrome, i * 0.07, 0.36, 1.19)); // grille
    g.add(rbox(0.36, 0.3, 0.62, 0.05, M.metal, 0, 0.62, 0.62));
    for (const s of [-1, 1]) { g.add(rbox(0.16, 0.12, 0.6, 0.03, M.chrome, s * 0.2, 0.7, 0.62, 0, 0, s * -0.5)); for (let i = 0; i < 3; i++) exhaust(g, M, s * 0.31, 0.58, 0.42 + i * 0.18, 0.03, 0.14, -1.2); }
    g.add(rbox(0.32, 0.18, 0.36, 0.04, M.carbon, 0, 0.86, 0.66));
    g.add(rbox(0.26, 0.14, 0.2, 0.04, M.chrome, 0, 1.0, 0.72, -0.2));
    for (let i = 0; i < 4; i++) g.add(box(0.34, 0.015, 0.02, M.chrome, 0, 0.79 + i * 0.03, 0.85));
    for (const s of [-1, 1]) g.add(pipe([V(s * 0.3, 0.52, 0.5), V(s * 0.46, 0.34, 0.36), V(s * 0.5, 0.26, 0.1), V(s * 0.5, 0.26, -0.3)], 0.045, M.chrome));
    cockpit(g, M, -0.42, 0.38);
    g.add(loft([[-0.95, 0.4, 0.09, 0.36, 3.4], [-0.7, 0.42, 0.11, 0.38, 3.4], [-0.2, 0.42, 0.11, 0.38, 3.4], [0.1, 0.36, 0.1, 0.38, 3.4]], M.paint, 20));
    for (const s of [-1, 1]) {
      g.add(fender(0.48, 0.4, 0.055, M.paint, s * 0.74, 0.3, -0.78, -0.2, Math.PI * 0.62));
      g.add(box(0.05, 0.012, 0.75, M.stripe, s * 0.43, 0.5, 0.7));
    }
    g.add(pipe([V(-0.36, 0.48, -0.82), V(-0.3, 1.0, -0.78), V(0.3, 1.0, -0.78), V(0.36, 0.48, -0.82)], 0.035, M.chrome)); // roll bar
    g.add(rbox(0.86, 0.22, 0.3, 0.06, M.paint, 0, 0.42, -1.22));
    headlights(g, M, 1.18, 0.62, 0.42, 0.09);
    for (const s of [-1, 1]) g.add(rod(V(s * 0.3, 0.42, 1.12), V(s * 0.42, 0.62, 1.12), 0.02, M.chrome));
    tails(g, M, -1.38, 0.44, 0.3, 0.12, 0.08);
    return { g, axF: 0.86, axR: -0.78, tF: 0.6, tR: 0.74, wF: 0.82, wR: 1.25, mount: V(0, 1.12, -0.7), pipes: [[-0.5, 0.26, -0.32], [0.5, 0.26, -0.32]] };
  },
  // dune buggy: tub, roll cage with a light bar, spare tyre on the back, skid plate, shocks
  buggy(M) {
    const g = new THREE.Group();
    g.add(loft([[-0.82, 0.38, 0.14, 0.56, 3.4], [-0.6, 0.46, 0.17, 0.56, 3.4], [0.5, 0.46, 0.17, 0.56, 3.4, 0.02], [0.9, 0.38, 0.12, 0.52, 3.2], [1.08, 0.28, 0.07, 0.48, 3]], M.paint));
    g.add(rbox(0.62, 0.06, 0.5, 0.02, M.metal, 0, 0.36, 0.95, 0.35)); // skid plate
    g.add(box(0.94, 0.012, 0.06, M.stripe, 0, 0.74, 0.3));
    cockpit(g, M, -0.3, 0.66);
    const c = M.paint2, y0 = 0.66, y1 = 1.42;
    for (const s of [-1, 1]) {
      g.add(pipe([V(s * 0.44, y0, 0.4), V(s * 0.38, y1 - 0.1, 0.05), V(s * 0.34, y1, -0.15), V(s * 0.36, y1 - 0.05, -0.55), V(s * 0.44, y0, -0.8)], 0.032, c));
      g.add(rod(V(s * 0.38, y1 - 0.15, 0.0), V(s * 0.42, y0 + 0.05, -0.75), 0.022, c));
      for (const [z, t] of [[0.74, 0.72], [-0.7, 0.74]]) g.add(rod(V(s * 0.4, 0.66, z * 0.9), V(s * (t - 0.3), 0.36, z), 0.03, M.amber)); // shocks
    }
    g.add(rod(V(-0.34, y1, -0.15), V(0.34, y1, -0.15), 0.032, c)); g.add(rod(V(-0.36, y1 - 0.05, -0.55), V(0.36, y1 - 0.05, -0.55), 0.03, c));
    g.add(rbox(0.74, 0.12, 0.12, 0.03, M.carbon, 0, y1 + 0.09, -0.1));
    for (let i = 0; i < 4; i++) g.add(rbox(0.14, 0.08, 0.03, 0.01, M.light, -0.24 + i * 0.16, y1 + 0.09, -0.04));
    g.add(rbox(0.56, 0.32, 0.36, 0.06, M.metal, 0, 0.66, -0.98));
    g.add(cyl(0.1, 0.1, 0.1, M.chrome, 0.2, 0.86, -0.98, 'y', 14));
    const spare = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.1, 10, 20), M.rubber); spare.position.set(0, 0.96, -1.2); spare.rotation.x = 0.15; g.add(spare);
    g.add(cyl(0.15, 0.15, 0.08, M.rim, 0, 0.96, -1.2, 'z', 14));
    exhaust(g, M, -0.22, 0.92, -1.1, 0.045, 0.3, 0.6);
    for (const s of [-1, 1]) g.add(box(0.26, 0.24, 0.02, M.rubber, s * 0.74, 0.3, -1.12));
    headlights(g, M, 1.1, 0.58, 0.24, 0.07); tails(g, M, -0.84, 0.56, 0.32);
    return { g, axF: 0.74, axR: -0.7, tF: 0.72, tR: 0.74, wF: 1.12, wR: 1.18, ride: 0.12, mount: V(0, 1.65, -0.35), pipes: [[-0.22, 1.06, -1.25]] };
  },
  // a rocket: teardrop fuselage, long canopy, swept fins and a glowing nozzle
  comet(M) {
    const g = new THREE.Group(), secs = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14, z = -1.25 + t * 2.6, k = Math.pow(Math.max(0, Math.sin(Math.PI * (0.25 + 0.75 * t))), 0.6); secs.push([z, Math.max(0.02, 0.46 * k), Math.max(0.02, 0.28 * k), 0.47, 2.4, 0.04 * k]); } // blunt tail for the nozzle, pointed nose
    g.add(loft(secs, M.paint, 30));
    g.add(loft([[-0.75, 0.05, 0.02, 0.76, 2], [-0.45, 0.2, 0.13, 0.75, 2.2], [0.05, 0.22, 0.16, 0.74, 2.2], [0.45, 0.13, 0.08, 0.7, 2.2], [0.62, 0.03, 0.02, 0.67, 2]], M.glass, 24));
    for (const s of [-1, 1]) {
      g.add(plate([[s * 0.36, -0.2], [s * 0.36, 0.5], [s * 0.6, -0.05], [s * 0.58, -0.35]], M.paint2, 0.42, 0.04));
      const fin = plate([[0, -0.6], [0, -1.25], [s * 0.38, -1.3], [s * 0.3, -1.0]], M.paint2, 0, 0.035);
      fin.rotation.z = s * (Math.PI / 2 - 0.5); fin.position.set(s * 0.12, 0.62, 0); g.add(fin);
      g.add(box(0.02, 0.02, 1.6, M.accent, s * 0.34, 0.56, 0.1));
    }
    const top = plate([[0, -0.55], [0, -1.25], [0.42, -1.35], [0.3, -0.95]], M.paint, 0, 0.035); top.rotation.z = Math.PI / 2; top.position.set(0.0175, 0.7, 0); g.add(top);
    g.add(cyl(0.22, 0.17, 0.2, M.chrome, 0, 0.47, -1.32, 'z', 20));
    g.add(cyl(0.15, 0.15, 0.02, M.accent, 0, 0.47, -1.43, 'z', 18));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 20), M.accent); ring.position.set(0, 0.47, -1.42); g.add(ring);
    for (const s of [-1, 1]) g.add(plate([[s * 0.12, 1.0], [s * 0.4, 0.8], [s * 0.38, 0.72], [s * 0.12, 0.8]], M.paint2, 0.4, 0.03));
    headlights(g, M, 1.18, 0.43, 0.11, 0.045); tails(g, M, -1.2, 0.68, 0.16, 0.08, 0.05);
    return { g, axF: 0.8, axR: -0.74, tF: 0.66, tR: 0.72, wF: 0.88, wR: 1.0, mount: V(0, 1.15, -0.6), pipes: [[0, 0.47, -1.5]] };
  },
  // a chunky little truck: high box cab over the wheels, push bar, roof rack, beacon
  brick(M) {
    const g = new THREE.Group();
    g.add(loft([[-1.0, 0.36, 0.08, 0.38, 4], [1.0, 0.36, 0.08, 0.38, 4]], M.dark, 20)); // chassis between the wheels
    g.add(rbox(1.34, 0.46, 2.24, 0.12, M.paint, 0, 0.88, 0));
    g.add(rbox(1.22, 0.42, 1.26, 0.1, M.paint, 0, 1.3, -0.28));
    g.add(rbox(1.36, 0.06, 2.26, 0.03, M.stripe, 0, 0.78, 0));
    for (const s of [-1, 1]) {
      g.add(box(0.03, 0.26, 0.92, M.glass, s * 0.615, 1.33, -0.28));
      for (const z of [0.74, -0.74]) g.add(fender(0.44, 0.42, 0.06, M.carbon, s * 0.72, 0.34, z, -0.2, Math.PI + 0.2));
      g.add(rbox(0.08, 0.1, 0.14, 0.03, M.carbon, s * 0.72, 1.18, 0.42)); // mirrors
    }
    g.add(box(1.06, 0.3, 0.03, M.glass, 0, 1.34, 0.36, -0.22));
    g.add(box(1.06, 0.26, 0.03, M.glass, 0, 1.34, -0.92));
    for (const s of [-1, 1]) g.add(rod(V(s * 0.5, 1.52, 0.2), V(s * 0.5, 1.52, -0.8), 0.025, M.metal));
    for (let i = 0; i < 4; i++) g.add(rod(V(-0.5, 1.53, 0.1 - i * 0.28), V(0.5, 1.53, 0.1 - i * 0.28), 0.02, M.metal));
    g.add(cyl(0.1, 0.12, 0.14, M.amber, 0, 1.6, -0.35, 'y', 14));
    g.add(pipe([V(-0.62, 0.5, 1.16), V(-0.5, 0.62, 1.3), V(0.5, 0.62, 1.3), V(0.62, 0.5, 1.16)], 0.045, M.chrome));
    for (const s of [-1, 1]) g.add(rod(V(s * 0.3, 0.5, 1.13), V(s * 0.3, 0.86, 1.3), 0.04, M.chrome));
    for (const s of [-1, 1]) g.add(rbox(0.26, 0.16, 0.04, 0.03, M.light, s * 0.42, 0.92, 1.12));
    for (let i = 0; i < 3; i++) g.add(box(0.5, 0.025, 0.02, M.chrome, 0, 0.84 + i * 0.06, 1.125));
    g.add(rbox(1.3, 0.16, 0.14, 0.04, M.carbon, 0, 0.62, -1.14));
    tails(g, M, -1.13, 0.94, 0.5, 0.14, 0.12);
    return { g, axF: 0.74, axR: -0.74, tF: 0.72, tR: 0.72, wF: 1.0, wR: 1.05, mount: V(0, 1.72, -0.4), pipes: [[-0.4, 0.4, -1.2], [0.4, 0.4, -1.2]] };
  },
};

// ---------------------------------------------------------------- wheels (one wheel; axis along X, centre at 0)
const R0 = 0.3; // base wheel radius
/** A tyre turned on a lathe: rounded shoulders, `ri` inner radius, `w` wide. */
function tyre(r, ri, w, m, round = 0.35, seg = 26) {
  const pts = [], n = 6, sh = Math.min(w / 2, (r - ri) * 0.9, r * round);
  pts.push(new THREE.Vector2(ri, -w / 2));
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh)); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, w / 2 - sh + Math.sin(a) * sh)); }
  pts.push(new THREE.Vector2(ri, w / 2));
  const g = new THREE.LatheGeometry(pts, seg); g.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(g, m);
}
/** Spokes on both faces of a rim. */
function spokes(g, n, r0, r1, w, t, x, m, twist = 0) {
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, len = r1 - r0, b = box(t, len, w, m, s * x, Math.cos(a) * (r0 + len / 2), Math.sin(a) * (r0 + len / 2), a);
    b.rotation.y = twist; g.add(b);
  }
}
const WHEEL_BUILD = {
  // five-spoke alloy
  standard(M) {
    const g = new THREE.Group();
    g.add(tyre(R0, R0 * 0.66, 0.26, M.rubber));
    g.add(cyl(R0 * 0.66, R0 * 0.66, 0.12, M.dark, 0, 0, 0, 'x', 20));
    for (const s of [-1, 1]) { const lip = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.64, 0.014, 6, 24), M.rim); lip.rotation.y = Math.PI / 2; lip.position.x = s * 0.11; g.add(lip); }
    spokes(g, 5, R0 * 0.14, R0 * 0.62, 0.05, 0.03, 0.085, M.rim);
    g.add(cyl(R0 * 0.18, R0 * 0.18, 0.2, M.rim, 0, 0, 0, 'x', 12));
    g.add(cyl(R0 * 0.08, R0 * 0.08, 0.22, M.paint, 0, 0, 0, 'x', 10));
    return g;
  },
  // wide racing slicks on painted disc rims
  slick(M) {
    const g = new THREE.Group();
    g.add(tyre(R0 * 0.94, R0 * 0.7, 0.38, M.rubber, 0.2));
    g.add(cyl(R0 * 0.7, R0 * 0.7, 0.34, M.paint, 0, 0, 0, 'x', 22));
    for (const s of [-1, 1]) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.69, 0.016, 6, 26), M.chrome); lip.rotation.y = Math.PI / 2; lip.position.x = s * 0.17; g.add(lip);
      g.add(cyl(R0 * 0.32, R0 * 0.36, 0.03, M.stripe, s * 0.175, 0, 0, 'x', 18));
    }
    g.add(cyl(R0 * 0.12, R0 * 0.12, 0.4, M.chrome, 0, 0, 0, 'x', 10));
    return g;
  },
  // off-road knobblies on beadlock rims
  chunky(M) {
    const g = new THREE.Group(), r = R0 * 1.12;
    g.add(tyre(r * 0.9, r * 0.52, 0.38, M.rubber, 0.3));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      for (const s of [-1, 1]) g.add(box(0.13, 0.08, 0.12, M.rubber, s * (0.07 + (i % 2) * 0.03), Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, a));
    }
    g.add(cyl(r * 0.52, r * 0.52, 0.34, M.metal, 0, 0, 0, 'x', 14));
    for (const s of [-1, 1]) {
      const bead = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, 0.025, 6, 20), M.dark); bead.rotation.y = Math.PI / 2; bead.position.x = s * 0.17; g.add(bead);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.add(cyl(0.012, 0.012, 0.02, M.chrome, s * 0.185, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 'x', 6)); }
    }
    g.add(cyl(r * 0.18, r * 0.18, 0.38, M.amber, 0, 0, 0, 'x', 10));
    return g;
  },
  // small and quick, coloured three-spoke rims
  mini(M) {
    const g = new THREE.Group(), r = R0 * 0.74;
    g.add(tyre(r, r * 0.62, 0.24, M.rubber, 0.4));
    g.add(cyl(r * 0.62, r * 0.62, 0.2, M.dark, 0, 0, 0, 'x', 16));
    spokes(g, 3, r * 0.15, r * 0.6, 0.07, 0.03, 0.095, M.accent);
    g.add(cyl(r * 0.2, r * 0.2, 0.23, M.chrome, 0, 0, 0, 'x', 10));
    return g;
  },
  // classic wire wheels with whitewall tyres and a knock-off spinner
  spoke(M) {
    const g = new THREE.Group(), r = R0 * 1.02;
    g.add(tyre(r, r * 0.68, 0.24, M.rubber, 0.45));
    for (const s of [-1, 1]) { const ww = new THREE.Mesh(new THREE.RingGeometry(r * 0.71, r * 0.86, 28), M.wall); ww.rotation.y = s * Math.PI / 2; ww.position.x = s * 0.122; g.add(ww); }
    const rr = new THREE.Mesh(new THREE.TorusGeometry(r * 0.67, 0.022, 6, 28), M.chrome); rr.rotation.y = Math.PI / 2; g.add(rr);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, s = i % 2 ? 1 : -1; g.add(rod(V(s * 0.07, Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1), V(-s * 0.03, Math.cos(a + 0.35) * r * 0.66, Math.sin(a + 0.35) * r * 0.66), 0.006, M.chrome, 4)); }
    g.add(cyl(0.06, 0.06, 0.22, M.chrome, 0, 0, 0, 'x', 10));
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.add(box(0.02, 0.15, 0.025, M.chrome, s * 0.12, Math.cos(a) * 0.06, Math.sin(a) * 0.06, a)); }
    return g;
  },
  // hover rings: a glowing hoop round a dark turbine
  hover(M) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.84, R0 * 0.13, 12, 32), M.accent); t.rotation.y = Math.PI / 2; g.add(t);
    const t2 = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.84, R0 * 0.17, 10, 32), M.carbon); t2.rotation.y = Math.PI / 2; t2.scale.set(1, 1, 0.55); g.add(t2);
    g.add(cyl(R0 * 0.66, R0 * 0.66, 0.08, M.dark, 0, 0, 0, 'x', 24));
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, b = box(0.1, R0 * 0.5, 0.05, M.metal, 0, Math.cos(a) * R0 * 0.36, Math.sin(a) * R0 * 0.36, a); b.rotation.y = 0.5; g.add(b); }
    g.add(cyl(R0 * 0.16, R0 * 0.16, 0.16, M.accent, 0, 0, 0, 'x', 12));
    return g;
  },
};
const WHEEL_R = { standard: 1, slick: 0.94, chunky: 1.12, mini: 0.74, spoke: 1.02, hover: 0.98 };

// ---------------------------------------------------------------- gliders (centred at 0, ~3 m wide, nose = +z)
const GLIDER_BUILD = {
  // a cambered delta wing with a keel, wingtip fins and a stripe along the leading edge
  wing(M) {
    const g = new THREE.Group();
    const at = (u, v, lift = 0) => { const s = u * 2 - 1, a = Math.abs(s), zf = 0.95 - a * 1.5, zb = -0.32 - a * 0.28; return [s * 1.6, Math.sin(v * Math.PI) * 0.13 * (1 - a * 0.5) + a * 0.2 + lift, zb + (zf - zb) * v]; };
    g.add(sheet(20, 6, (u, v) => at(u, v), M.cloth));
    g.add(sheet(20, 1, (u, v) => at(u, 0.82 + v * 0.18, 0.012), M.cloth2));
    g.add(rod(V(0, 0.02, 0.95), V(0, 0.02, -0.4), 0.03, M.carbon));
    for (const s of [-1, 1]) {
      g.add(pipe([V(0, 0.1, 0.95), V(s * 0.8, 0.27, 0.15), V(s * 1.6, 0.2, -0.55)], 0.022, M.carbon));
      const fin = plate([[0, 0], [0, -0.3], [0.22, -0.34], [0.12, -0.05]], M.paint2, 0, 0.02); fin.rotation.z = Math.PI / 2; fin.position.set(s * 1.6 + 0.01, 0.2, -0.28); g.add(fin);
    }
    return g;
  },
  // a diamond kite: bowed sail in four panels, cross spars, a tail of bows
  kite(M) {
    const g = new THREE.Group();
    const P = [[0, 1.25], [1.35, 0.05], [0, -1.05], [-1.35, 0.05]], C = [0, 0.05];
    for (let q = 0; q < 4; q++) {
      const a = P[q], b = P[(q + 1) % 4];
      g.add(sheet(6, 6, (u, v) => { const x = C[0] + (a[0] - C[0]) * u * (1 - v) + (b[0] - C[0]) * u * v, z = C[1] + (a[1] - C[1]) * u * (1 - v) + (b[1] - C[1]) * u * v; return [x, -0.12 * (1 - x * x / 1.9) * (1 - Math.abs(z) / 1.4), z]; }, q % 2 ? M.cloth2 : M.cloth));
    }
    g.add(pipe([V(0, -0.05, 1.25), V(0, -0.14, 0.05), V(0, -0.05, -1.05)], 0.02, M.carbon));
    g.add(pipe([V(-1.35, -0.02, 0.05), V(0, -0.15, 0.05), V(1.35, -0.02, 0.05)], 0.02, M.carbon));
    for (let i = 0; i < 5; i++) { const z = -1.2 - i * 0.24, x = Math.sin(i * 1.3) * 0.08; g.add(pipe([V(0, 0, -1.05 - i * 0.24), V(x, 0, z)], 0.006, M.dark)); g.add(box(0.2, 0.012, 0.1, i % 2 ? M.cloth2 : M.cloth, x, 0, z, 0, i * 0.5)); }
    return g;
  },
  // a ram-air parasail: arched canopy of cells, its lines gathering at the kart
  sail(M) {
    const g = new THREE.Group(), n = 9;
    const at = (u, v, down = 0) => { const a = (u - 0.5) * 1.9, ch = 1.05 * (1 - Math.pow(u * 2 - 1, 2) * 0.25), z = (v - 0.45) * ch; return [Math.sin(a) * 1.75, Math.cos(a) * 0.75 - 0.75 + 0.5 + Math.sin(v * Math.PI) * 0.12 - down, z]; };
    for (let i = 0; i < n; i++) {
      g.add(sheet(2, 6, (u, v) => at((i + u) / n, v), i % 2 ? M.cloth2 : M.cloth));
      g.add(sheet(2, 4, (u, v) => at((i + u) / n, v, 0.1 + Math.sin(v * Math.PI) * 0.0), M.clothDark));
    }
    for (let i = 0; i <= n; i += 2) { const p = at(i / n, 0.4, 0.1); g.add(rod(V(...p), V(0, -0.82, 0), 0.006, M.dark, 4)); }
    return g;
  },
  // a bat wing: scalloped membrane between finger ribs
  bat(M) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const at = (u, v) => { const a = u, x = s * a * 1.75, zf = 0.62 + Math.sin(a * Math.PI) * 0.12 - a * 0.3, zb = -0.28 + Math.abs(Math.sin(a * Math.PI * 3)) * 0.32 - a * 0.1; return [x, Math.pow(a, 1.5) * 0.32 + Math.sin(v * Math.PI) * 0.06, zb + (zf - zb) * v]; };
      g.add(sheet(18, 5, at, M.clothDark));
      for (const a of [0.34, 0.67, 1.0]) { const tip = at(a, 0); g.add(pipe([V(0, 0.04, 0.55), V(...at(a * 0.6, 0.95)), V(tip[0], tip[1] + 0.02, tip[2])], 0.018, M.paint2)); }
      g.add(pipe([V(0, 0.05, 0.6), V(...at(0.5, 1)), V(...at(1, 1))], 0.024, M.paint));
    }
    return g;
  },
  // jet wings: swept metal wings with two engine pods, glowing nozzles and tail fins
  jet(M) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const wingP = plate([[s * 0.12, 0.45], [s * 1.62, -0.3], [s * 1.62, -0.52], [s * 0.12, -0.18]], M.paint, 0.03, 0.05); wingP.rotation.z = s * 0.06; g.add(wingP);
      const pod = loft([[-0.62, 0.08, 0.08, -0.1, 2], [-0.5, 0.12, 0.12, -0.1, 2], [0.2, 0.12, 0.12, -0.1, 2], [0.35, 0.06, 0.06, -0.1, 2]], M.metal, 16); pod.position.x = s * 0.95; g.add(pod);
      g.add(cyl(0.08, 0.08, 0.02, M.accent, s * 0.95, -0.1, -0.63, 'z', 14));
      const fin = plate([[0, -0.1], [0, -0.55], [s * 0.32, -0.65], [s * 0.26, -0.3]], M.paint2, 0, 0.03); fin.rotation.z = s * (Math.PI / 2 - 0.25); fin.position.set(s * 1.62, 0.12, 0); g.add(fin);
    }
    g.add(loft([[-0.6, 0.06, 0.05, 0, 2], [-0.4, 0.14, 0.08, 0, 3], [0.5, 0.14, 0.08, 0, 3], [0.75, 0.04, 0.03, 0, 2]], M.carbon, 16));
    return g;
  },
};

// ---------------------------------------------------------------- the whole kart
/**
 * build: { body, wheels, glider, paint }. Returns a Group (nose = +z, wheels on y = 0) with userData:
 * wheels [{ pivot, spin, front }], wheelR, glider (Group, hidden until deployed), mount, pipes, setPaint, dispose.
 */
export function buildKart(build, env, hi, shadowTex) {
  const M = kartMaterials(build.paint ?? PAINTS[0], env, hi);
  const B = (BODY_BUILD[build.body] || BODY_BUILD.classic)(M);
  const root = new THREE.Group();
  const lift = B.ride || 0;
  const wr = WHEEL_R[build.wheels] || 1;
  // body sits so the wheels (radius R0 * wr * size) touch y = 0; a little ride height from the biggest wheel
  const yW = R0 * wr * Math.max(B.wF, B.wR);
  const body = bake(B.g);
  body.position.y = Math.max(0, yW - R0 * 0.95) + lift;
  root.add(body);
  const wheels = [];
  const wb = WHEEL_BUILD[build.wheels] || WHEEL_BUILD.standard;
  const proto = bake(wb(M));
  for (const [z, t, sc, front] of [[B.axF, B.tF, B.wF, true], [B.axR, B.tR, B.wR, false]]) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(), spin = new THREE.Group();
      const r = R0 * wr * sc;
      pivot.position.set(s * t, r, z);
      const w = proto.clone(); w.scale.setScalar(sc);
      spin.add(w); pivot.add(spin); root.add(pivot);
      wheels.push({ pivot, spin, front, r });
    }
  }
  const gl = bake((GLIDER_BUILD[build.glider] || GLIDER_BUILD.wing)(M));
  const mount = B.mount.clone(); mount.y += body.position.y;
  const glider = new THREE.Group();
  gl.position.y = 0.95; glider.add(gl);
  for (const s of [-1, 1]) glider.add(rod(V(s * 0.25, 0, 0), V(s * 0.5, 0.95, 0), 0.018, M.dark));
  glider.position.copy(mount);
  glider.visible = false;
  root.add(glider);
  let shadow = null;
  if (shadowTex) {
    // lies flat (normal up) and is turned and tilted with the kart, so it hugs banked and sloping road
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    shadow.rotation.order = 'YXZ'; shadow.renderOrder = 1;
  }
  let roll = 0;
  root.userData = {
    body, wheels, glider, mount, shadow,
    pipes: B.pipes.map(([x, y, z]) => V(x, y + body.position.y, z)),
    setPaint: (c) => tint(M, c),
    glow: (r, g, b) => M.paint.emissive.setRGB(r, g, b),
    spin: (dt, v, steer) => {
      roll = (roll + (v / (R0 * wr)) * dt) % (Math.PI * 2);
      for (const w of wheels) { w.spin.rotation.x = roll; if (w.front) w.pivot.rotation.y = steer * 0.4; }
    },
    dispose: () => {
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of Object.values(M)) m.dispose();
      if (shadow) { shadow.geometry.dispose(); shadow.material.dispose(); }
    },
  };
  return root;
}

/** One part on its own, for the picker's thumbnails. */
export function buildPart(kind, id, paint, env, hi) {
  if (kind === 'body') return buildKart({ body: id, wheels: 'standard', glider: 'wing', paint }, env, hi);
  const M = kartMaterials(paint, env, hi);
  const g = kind === 'wheels' ? bake((WHEEL_BUILD[id] || WHEEL_BUILD.standard)(M)) : bake((GLIDER_BUILD[id] || GLIDER_BUILD.wing)(M));
  g.userData.dispose = () => { g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); for (const m of Object.values(M)) m.dispose(); };
  return g;
}
