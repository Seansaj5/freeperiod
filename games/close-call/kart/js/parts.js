// Kart parts: bodies, wheels and gliders, their stats, and the 3D models (built from simple shapes, then merged
// per material so a whole kart is only a couple of dozen draw calls). There is no driver: each kart is its own little
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
export function kartMaterials(paint, env, hi) {
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ envMap: env, envMapIntensity: 1 }, o));
  return {
    paint: hi ? new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.35, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 1.3 }) : std({ color: paint, metalness: 0.3, roughness: 0.4 }),
    dark: std({ color: 0x1b1e26, metalness: 0.2, roughness: 0.65, envMapIntensity: 0.5 }),
    chrome: std({ color: 0xe8ecf2, metalness: 1, roughness: 0.14, envMapIntensity: 1.5 }),
    rubber: std({ color: 0x15161a, metalness: 0, roughness: 0.92, envMapIntensity: 0.25 }),
    rim: std({ color: 0xc8ced8, metalness: 0.85, roughness: 0.28 }),
    glass: std({ color: 0x0c1824, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.72, envMapIntensity: 1.8 }),
    accent: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.6, 2.2), side: THREE.DoubleSide }),
    light: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.6) }),
    tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.12, 0.1) }),
    cloth: std({ color: paint, metalness: 0, roughness: 0.7, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    cloth2: std({ color: 0xf2f4f8, metalness: 0, roughness: 0.7, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
  };
}

// ---------------------------------------------------------------- shape helpers
const V = (x, y, z) => new THREE.Vector3(x, y, z);
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
  const g = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(d - r * 2) / 2);
  return mesh(g, m, x, y, z, rx, ry, rz);
}
/** Cylinder along X (axles, pipes across) unless axis is given: 'y' or 'z'. */
function cyl(r1, r2, len, m, x, y, z, axis = 'x', seg = 16) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  return mesh(g, m, x, y, z);
}
const sphere = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = mesh(new THREE.SphereGeometry(r, 20, 14), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
/** A thin tube between two points. */
function rod(a, b, r, m) {
  const d = b.clone().sub(a), len = d.length();
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return o;
}
/** Flat panel from a 2D outline (x right, y forward) lying in the XZ plane. */
function panel(pts, m, y = 0) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // the outline's +y becomes forward (+z)
  const o = new THREE.Mesh(g, m); o.position.y = y;
  return o;
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

// ---------------------------------------------------------------- bodies
// Each body returns { g: Group, axF, axR, tF, tR, wF, wR (wheel size), mount (glider), pipes: [[x,y,z]] }
function seatAndWheel(g, M, z = -0.3, y = 0.42) {
  g.add(rbox(0.56, 0.5, 0.14, 0.05, M.dark, 0, y + 0.2, z - 0.06, -0.25));
  g.add(rbox(0.56, 0.12, 0.42, 0.04, M.dark, 0, y, z + 0.14));
  g.add(rod(V(0, y - 0.05, z + 0.85), V(0, y + 0.28, z + 0.55), 0.025, M.dark));
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 8, 20), M.dark);
  sw.position.set(0, y + 0.3, z + 0.53); sw.rotation.x = -0.9; g.add(sw);
}
function lights(g, M, z, y, x, r = 0.07) { for (const s of [-1, 1]) g.add(sphere(r, M.light, s * x, y, z, 1, 1, 0.5)); }
function tails(g, M, z, y, x) { for (const s of [-1, 1]) g.add(box(0.16, 0.06, 0.03, M.tail, s * x, y, z)); }

const BODY_BUILD = {
  classic(M) {
    const g = new THREE.Group();
    g.add(box(1.16, 0.08, 2.0, M.dark, 0, 0.2, -0.05));
    g.add(rbox(0.86, 0.24, 0.62, 0.08, M.paint, 0, 0.33, 0.86, -0.12));
    g.add(cyl(0.035, 0.035, 1.3, M.chrome, 0, 0.26, 1.2));
    for (const s of [-1, 1]) { g.add(rbox(0.3, 0.3, 1.04, 0.09, M.paint, s * 0.58, 0.35, 0.02)); g.add(box(0.05, 0.05, 0.9, M.accent, s * 0.74, 0.38, 0.02)); }
    seatAndWheel(g, M, -0.32);
    g.add(rbox(0.56, 0.34, 0.42, 0.06, M.dark, 0, 0.44, -0.86));
    for (const s of [-1, 1]) { g.add(cyl(0.05, 0.06, 0.5, M.chrome, s * 0.17, 0.62, -1.08, 'z')); }
    g.add(box(1.08, 0.05, 0.26, M.paint, 0, 0.92, -1.0, 0.1));
    for (const s of [-1, 1]) g.add(box(0.04, 0.32, 0.12, M.dark, s * 0.36, 0.76, -0.98));
    lights(g, M, 1.16, 0.38, 0.28); tails(g, M, -1.08, 0.46, 0.22);
    return { g, axF: 0.72, axR: -0.72, tF: 0.66, tR: 0.74, wF: 0.88, wR: 1.05, mount: V(0, 1.0, -0.6), pipes: [[-0.17, 0.62, -1.34], [0.17, 0.62, -1.34]] };
  },
  dart(M) {
    const g = new THREE.Group();
    g.add(box(1.0, 0.08, 2.2, M.dark, 0, 0.2, -0.05));
    const nose = cyl(0.02, 0.4, 1.3, M.paint, 0, 0.32, 0.95, 'z', 4); nose.rotation.z = Math.PI / 4; nose.scale.set(1.5, 0.55, 1); g.add(nose);
    for (const s of [-1, 1]) g.add(rbox(0.24, 0.24, 1.2, 0.08, M.paint, s * 0.5, 0.32, -0.25));
    g.add(box(1.5, 0.04, 0.22, M.paint, 0, 0.28, 1.55)); // front wing
    for (const s of [-1, 1]) g.add(box(0.04, 0.16, 0.3, M.accent, s * 0.75, 0.33, 1.55));
    seatAndWheel(g, M, -0.42);
    g.add(box(0.06, 0.55, 0.6, M.paint, 0, 0.72, -0.98, 0, 0, 0)); // fin
    g.add(box(0.07, 0.04, 0.5, M.accent, 0, 1.0, -1.02));
    g.add(rbox(0.5, 0.28, 0.36, 0.06, M.dark, 0, 0.42, -1.0));
    lights(g, M, 1.62, 0.3, 0.12, 0.05); tails(g, M, -1.2, 0.42, 0.2);
    return { g, axF: 0.92, axR: -0.78, tF: 0.6, tR: 0.7, wF: 0.82, wR: 1.05, mount: V(0, 1.12, -0.65), pipes: [[0, 0.44, -1.22]] };
  },
  bumper(M) {
    const g = new THREE.Group();
    const tub = cyl(0.82, 0.88, 0.44, M.paint, 0, 0.42, 0, 'y', 28); tub.scale.z = 1.3; g.add(tub);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 10, 32), M.rubber); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; ring.scale.y = 1.3; g.add(ring);
    g.add(box(1.2, 0.04, 1.6, M.dark, 0, 0.65, 0));
    seatAndWheel(g, M, -0.25, 0.68);
    g.add(cyl(0.025, 0.025, 1.4, M.chrome, 0, 1.3, -0.82, 'y'));
    const flag = panel([[0, 0], [0.42, -0.12], [0, -0.26]], M.accent, 0); flag.rotation.set(Math.PI / 2, 0, -Math.PI / 2); flag.position.set(0, 1.98, -0.82); g.add(flag);
    lights(g, M, 1.12, 0.48, 0.42); tails(g, M, -1.15, 0.48, 0.35);
    return { g, axF: 0.62, axR: -0.62, tF: 0.6, tR: 0.6, wF: 0.82, wR: 0.86, mount: V(0, 1.2, -0.45), pipes: [[0, 0.4, -1.18]] };
  },
  bubble(M) {
    const g = new THREE.Group();
    g.add(sphere(0.74, M.paint, 0, 0.5, 0, 1, 0.58, 1.25));
    g.add(sphere(0.52, M.glass, 0, 0.72, -0.05, 1, 0.82, 1.15));
    g.add(box(0.9, 0.06, 1.6, M.dark, 0, 0.24, 0));
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.04, 8, 32), M.accent); belt.rotation.x = Math.PI / 2; belt.position.y = 0.48; belt.scale.y = 1.24; g.add(belt);
    lights(g, M, 0.88, 0.5, 0.3, 0.09); tails(g, M, -0.92, 0.5, 0.26);
    g.add(cyl(0.05, 0.05, 0.1, M.chrome, 0, 1.32, -0.05, 'y')); g.add(sphere(0.07, M.accent, 0, 1.4, -0.05));
    return { g, axF: 0.55, axR: -0.55, tF: 0.62, tR: 0.62, wF: 0.8, wR: 0.8, mount: V(0, 1.4, -0.2), pipes: [[0, 0.36, -0.95]] };
  },
  hotrod(M) {
    const g = new THREE.Group();
    g.add(box(1.0, 0.1, 2.3, M.dark, 0, 0.22, 0));
    g.add(rbox(0.74, 0.32, 0.9, 0.08, M.paint, 0, 0.42, 0.62));
    g.add(rbox(0.5, 0.34, 0.5, 0.05, M.chrome, 0, 0.72, 0.68)); // engine
    g.add(box(0.36, 0.14, 0.3, M.dark, 0, 0.94, 0.68)); // blower
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(cyl(0.035, 0.045, 0.3, M.chrome, s * 0.3, 0.62, 0.45 + i * 0.18, 'x'));
    for (const s of [-1, 1]) { const f = cyl(0.42, 0.42, 0.42, M.paint, s * 0.72, 0.5, -0.78, 'x', 18); f.scale.set(1, 1, 1); g.add(f); }
    seatAndWheel(g, M, -0.42);
    g.add(rbox(1.0, 0.26, 0.4, 0.06, M.paint, 0, 0.4, -1.12));
    for (const s of [-1, 1]) g.add(cyl(0.06, 0.07, 0.6, M.chrome, s * 0.62, 0.32, 0.1, 'z'));
    lights(g, M, 1.1, 0.42, 0.3, 0.08); tails(g, M, -1.33, 0.42, 0.34);
    return { g, axF: 0.86, axR: -0.78, tF: 0.6, tR: 0.74, wF: 0.82, wR: 1.25, mount: V(0, 1.12, -0.7), pipes: [[-0.62, 0.32, -0.22], [0.62, 0.32, -0.22]] };
  },
  buggy(M) {
    const g = new THREE.Group();
    g.add(rbox(0.9, 0.3, 1.7, 0.1, M.paint, 0, 0.48, 0));
    g.add(rbox(0.7, 0.18, 0.4, 0.06, M.paint, 0, 0.54, 0.95, -0.25));
    seatAndWheel(g, M, -0.3, 0.62);
    const c = M.chrome, y0 = 0.62, y1 = 1.3;
    for (const s of [-1, 1]) {
      g.add(rod(V(s * 0.42, y0, 0.35), V(s * 0.34, y1, 0.0), 0.03, c));
      g.add(rod(V(s * 0.42, y0, -0.8), V(s * 0.34, y1, -0.6), 0.03, c));
      g.add(rod(V(s * 0.34, y1, 0.0), V(s * 0.34, y1, -0.6), 0.03, c));
    }
    g.add(rod(V(-0.34, y1, 0), V(0.34, y1, 0), 0.03, c)); g.add(rod(V(-0.34, y1, -0.6), V(0.34, y1, -0.6), 0.03, c));
    g.add(box(0.7, 0.1, 0.12, M.dark, 0, y1 + 0.08, 0.02));
    for (let i = 0; i < 4; i++) g.add(box(0.12, 0.08, 0.04, M.light, -0.24 + i * 0.16, y1 + 0.08, 0.09));
    g.add(rbox(0.5, 0.3, 0.4, 0.06, M.dark, 0, 0.6, -0.95));
    lights(g, M, 1.12, 0.56, 0.24); tails(g, M, -0.86, 0.5, 0.3);
    return { g, axF: 0.74, axR: -0.7, tF: 0.72, tR: 0.74, wF: 1.12, wR: 1.18, ride: 0.12, mount: V(0, 1.55, -0.35), pipes: [[0.16, 0.66, -1.18]] };
  },
  comet(M) {
    const g = new THREE.Group();
    const prof = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(Math.max(0.02, Math.sin(t * Math.PI) * 0.55 * (0.6 + 0.4 * t)), (t - 0.5) * 2.5)); }
    const lathe = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), M.paint);
    lathe.rotation.x = Math.PI / 2; lathe.scale.set(1.25, 1, 0.6); lathe.position.set(0, 0.42, 0); g.add(lathe);
    g.add(sphere(0.36, M.glass, 0, 0.66, -0.1, 0.95, 0.62, 1.6));
    for (const s of [-1, 1]) { g.add(box(0.03, 0.04, 1.8, M.accent, s * 0.6, 0.42, 0)); g.add(rbox(0.26, 0.2, 0.9, 0.08, M.paint, s * 0.66, 0.34, -0.15)); }
    g.add(box(0.05, 0.5, 0.5, M.paint, 0, 0.8, -0.95)); g.add(box(0.06, 0.05, 0.42, M.accent, 0, 1.04, -1.0));
    g.add(cyl(0.16, 0.12, 0.3, M.chrome, 0, 0.44, -1.25, 'z')); g.add(cyl(0.11, 0.11, 0.02, M.accent, 0, 0.44, -1.4, 'z'));
    lights(g, M, 1.22, 0.4, 0.2, 0.05); tails(g, M, -1.3, 0.5, 0.3);
    return { g, axF: 0.8, axR: -0.74, tF: 0.66, tR: 0.72, wF: 0.88, wR: 1.0, mount: V(0, 1.1, -0.6), pipes: [[0, 0.44, -1.42]] };
  },
  brick(M) {
    const g = new THREE.Group();
    g.add(rbox(1.36, 0.62, 2.2, 0.1, M.paint, 0, 0.62, 0));
    g.add(rbox(1.2, 0.42, 1.2, 0.08, M.paint, 0, 1.1, -0.25));
    for (const s of [-1, 1]) g.add(box(0.02, 0.28, 0.9, M.glass, s * 0.61, 1.12, -0.25));
    g.add(box(1.0, 0.3, 0.02, M.glass, 0, 1.12, 0.36, -0.15));
    g.add(box(1.4, 0.05, 0.3, M.dark, 0, 1.42, -0.95)); for (const s of [-1, 1]) g.add(box(0.05, 0.12, 0.08, M.dark, s * 0.5, 1.34, -0.9));
    g.add(box(1.4, 0.16, 0.14, M.dark, 0, 0.36, 1.12)); g.add(box(1.4, 0.16, 0.14, M.dark, 0, 0.36, -1.12));
    for (const s of [-1, 1]) g.add(box(0.03, 0.06, 2.0, M.accent, s * 0.69, 0.5, 0));
    lights(g, M, 1.11, 0.68, 0.46, 0.1); tails(g, M, -1.12, 0.7, 0.5);
    return { g, axF: 0.74, axR: -0.74, tF: 0.72, tR: 0.72, wF: 1.0, wR: 1.05, mount: V(0, 1.62, -0.4), pipes: [[-0.4, 0.32, -1.2], [0.4, 0.32, -1.2]] };
  },
};

// ---------------------------------------------------------------- wheels (one wheel; axis along X, centre at 0)
const R0 = 0.3; // base wheel radius
const WHEEL_BUILD = {
  standard(M) { const g = new THREE.Group(); g.add(cyl(R0, R0, 0.26, M.rubber, 0, 0, 0, 'x', 20)); g.add(cyl(R0 * 0.58, R0 * 0.58, 0.28, M.rim, 0, 0, 0, 'x', 12)); g.add(cyl(R0 * 0.18, R0 * 0.18, 0.3, M.dark, 0, 0, 0, 'x', 8)); return g; },
  slick(M) { const g = new THREE.Group(); g.add(cyl(R0 * 0.94, R0 * 0.94, 0.36, M.rubber, 0, 0, 0, 'x', 22)); g.add(cyl(R0 * 0.7, R0 * 0.7, 0.38, M.paint, 0, 0, 0, 'x', 14)); g.add(cyl(R0 * 0.3, R0 * 0.3, 0.4, M.chrome, 0, 0, 0, 'x', 10)); return g; },
  chunky(M) {
    const g = new THREE.Group(); const r = R0 * 1.12;
    g.add(cyl(r * 0.9, r * 0.9, 0.36, M.rubber, 0, 0, 0, 'x', 16));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.add(box(0.38, 0.1, 0.14, M.rubber, 0, Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, a)); }
    g.add(cyl(r * 0.5, r * 0.5, 0.38, M.rim, 0, 0, 0, 'x', 10)); g.add(cyl(r * 0.2, r * 0.2, 0.4, M.dark, 0, 0, 0, 'x', 8));
    return g;
  },
  mini(M) { const g = new THREE.Group(); const r = R0 * 0.74; g.add(cyl(r, r, 0.24, M.rubber, 0, 0, 0, 'x', 18)); g.add(cyl(r * 0.66, r * 0.66, 0.26, M.accent, 0, 0, 0, 'x', 12)); g.add(cyl(r * 0.3, r * 0.3, 0.28, M.chrome, 0, 0, 0, 'x', 8)); return g; },
  spoke(M) {
    const g = new THREE.Group(); const r = R0 * 1.02;
    const t = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, r * 0.15, 8, 26), M.rubber); t.rotation.y = Math.PI / 2; g.add(t);
    const rr = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.02, 6, 26), M.chrome); rr.rotation.y = Math.PI / 2; g.add(rr);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI; g.add(box(0.03, r * 1.4, 0.025, M.chrome, 0, 0, 0, a)); }
    g.add(cyl(0.06, 0.06, 0.2, M.chrome, 0, 0, 0, 'x', 10));
    return g;
  },
  hover(M) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.82, R0 * 0.16, 10, 28), M.accent); t.rotation.y = Math.PI / 2; g.add(t);
    g.add(cyl(R0 * 0.64, R0 * 0.64, 0.12, M.dark, 0, 0, 0, 'x', 20));
    g.add(cyl(R0 * 0.24, R0 * 0.24, 0.16, M.chrome, 0, 0, 0, 'x', 10));
    return g;
  },
};
const WHEEL_R = { standard: 1, slick: 0.94, chunky: 1.12, mini: 0.74, spoke: 1.02, hover: 0.98 };

// ---------------------------------------------------------------- gliders (centred at 0, ~3 m wide, nose = +z)
const GLIDER_BUILD = {
  wing(M) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const p = panel([[0, 0.9], [s * 1.6, -0.6], [s * 0.2, -0.45], [0, -0.3]], M.cloth, 0); p.rotation.z = s * 0.12; g.add(p); }
    g.add(rod(V(-1.6, 0.18, -0.6), V(0, 0, 0.9), 0.025, M.dark)); g.add(rod(V(1.6, 0.18, -0.6), V(0, 0, 0.9), 0.025, M.dark));
    g.add(rod(V(0, 0.02, 0.9), V(0, 0.02, -0.4), 0.025, M.dark));
    for (const s of [-1, 1]) g.add(panel([[s * 0.9, -0.2], [s * 1.3, -0.48], [s * 0.6, -0.42]], M.cloth2, 0.11));
    return g;
  },
  kite(M) {
    const g = new THREE.Group();
    g.add(panel([[0, 1.2], [1.3, 0], [0, -1.0], [-1.3, 0]], M.cloth, 0));
    g.add(panel([[0, 1.2], [0.45, 0.35], [0, 0.05], [-0.45, 0.35]], M.cloth2, 0.01));
    g.add(rod(V(0, 0.02, 1.2), V(0, 0.02, -1.0), 0.02, M.dark)); g.add(rod(V(-1.3, 0.02, 0), V(1.3, 0.02, 0), 0.02, M.dark));
    for (let i = 0; i < 4; i++) { const b = box(0.18, 0.01, 0.12, i % 2 ? M.cloth2 : M.cloth, (i % 2 ? 0.08 : -0.08), 0, -1.15 - i * 0.22, 0, i * 0.4); g.add(b); }
    return g;
  },
  sail(M) {
    const g = new THREE.Group(); const n = 7;
    for (let i = 0; i < n; i++) {
      const a = ((i - (n - 1) / 2) / n) * 1.5, x = Math.sin(a) * 1.7, y = Math.cos(a) * 0.55 - 0.55;
      const c = box(0.46, 0.18, 1.0, i % 2 ? M.cloth2 : M.cloth, x, y + 0.4, 0, 0, 0, -a);
      g.add(c);
      if (i % 2 === 0) g.add(rod(V(x, y + 0.32, 0.1), V(0, -0.85, 0), 0.008, M.dark));
    }
    return g;
  },
  bat(M) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const p = [[0, 0.6], [s * 0.5, 0.75], [s * 1.7, 0.35], [s * 1.55, -0.2], [s * 1.2, -0.05], [s * 1.0, -0.45], [s * 0.6, -0.2], [s * 0.35, -0.55], [0, -0.3]];
      const w = panel(p, M.cloth, 0); w.rotation.z = s * 0.18; g.add(w);
      g.add(rod(V(0, 0, 0.6), V(s * 1.7, s * 0 + 0.3, 0.35), 0.022, M.dark));
    }
    return g;
  },
  jet(M) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = box(1.45, 0.06, 0.62, M.paint, s * 0.85, 0, -0.1, 0, s * 0.32, s * 0.08); g.add(w);
      g.add(cyl(0.11, 0.09, 0.6, M.chrome, s * 1.1, -0.08, -0.25, 'z'));
      g.add(cyl(0.08, 0.08, 0.02, M.accent, s * 1.1, -0.08, -0.56, 'z'));
      g.add(box(0.05, 0.3, 0.3, M.paint, s * 1.55, 0.12, -0.35));
    }
    g.add(rbox(0.3, 0.14, 1.0, 0.05, M.dark, 0, 0, 0.1));
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
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.8), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1;
  }
  let roll = 0;
  root.userData = {
    body, wheels, glider, mount, shadow,
    pipes: B.pipes.map(([x, y, z]) => V(x, y + body.position.y, z)),
    setPaint: (c) => { M.paint.color.setHex(c); M.cloth.color.setHex(c); },
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
