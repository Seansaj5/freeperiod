// Building blocks for the 3D art: rounded shapes, limb shells, hand-painted canvas textures and the shared materials.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const gBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const gSph = (r, s = 20) => new THREE.SphereGeometry(r, s, Math.round(s * 0.7));
export const gCyl = (a, b, h, s = 16) => new THREE.CylinderGeometry(a, b, h, s);
export function add(p, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; }
export const B = (p, w, h, d, mat, x, y, z) => add(p, gBox(w, h, d), mat, x, y, z);

// A "squircle" solid: p = 2 is an ellipsoid, higher p is a box with rounded corners. Normals are exact, so no seams.
export function sq(rx, ry, rz, p = 3, seg = 26) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), a = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i), k = Math.pow(Math.abs(x) ** p + Math.abs(y) ** p + Math.abs(z) ** p, 1 / p) || 1;
    const X = x / k, Y = y / k, Z = z / k;
    a.setXYZ(i, X * rx, Y * ry, Z * rz);
    let nx = Math.sign(X) * Math.abs(X) ** (p - 1) / rx, ny = Math.sign(Y) * Math.abs(Y) ** (p - 1) / ry, nz = Math.sign(Z) * Math.abs(Z) ** (p - 1) / rz;
    const l = Math.hypot(nx, ny, nz) || 1; n.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}
// A tapered capsule hanging down from the origin (y = 0 to -len): radius r1 at the top, r2 at the bottom.
export function limbGeo(r1, r2, len, seg = 16) {
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r2, -len + r2 - Math.cos(a) * r2)); }
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -r1 + Math.sin(a) * r1)); }
  return new THREE.LatheGeometry(pts, seg);
}
export const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);

// ---------- canvas textures ----------
export function tex(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (o.data !== true) t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  t.anisotropy = 4; return t;
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const rand = rnd;
function blots(c, w, h, n, col, rmin, rmax, a) { for (let i = 0; i < n; i++) { const x = rnd() * w, y = rnd() * h, r = rmin + rnd() * (rmax - rmin), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); } }
export const FUZZ = tex(128, 128, (c, w, h) => { const im = c.createImageData(w, h); for (let i = 0; i < im.data.length; i += 4) { const v = 90 + rnd() * 120; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } c.putImageData(im, 0, 0); }, { data: true, repeat: [5, 5] });
export const GRIME = tex(256, 256, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); blots(c, w, h, 40, '40,30,20', 10, 60, 0.16); blots(c, w, h, 60, '0,0,0', 2, 9, 0.22); c.strokeStyle = 'rgba(30,20,10,.12)'; for (let i = 0; i < 26; i++) { c.lineWidth = 1 + rnd() * 2; const x = rnd() * w, y = rnd() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 6, y + 20 + rnd() * 50); c.stroke(); } }, { repeat: [1, 1] });
// A painted wall: colour, darker wainscot, a checker band between them, stains and drips.
export function wallTex(top, bottom, band = true, repX = 1) {
  return tex(512, 512, (c, w, h) => {
    c.fillStyle = top; c.fillRect(0, 0, w, h); c.fillStyle = bottom; c.fillRect(0, h * 0.62, w, h * 0.38);
    if (band) for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#d8d2c0' : '#111'; c.fillRect(i * 16, h * 0.62 - 16 + j * 16, 16, 16); }
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, h - 22, w, 22);
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    blots(c, w, h, 26, '20,14,8', 20, 90, 0.14); c.strokeStyle = 'rgba(15,10,5,.18)'; for (let i = 0; i < 18; i++) { c.lineWidth = 1 + rnd() * 3; const x = rnd() * w, y = rnd() * h * 0.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 4, y + 40 + rnd() * 160); c.stroke(); }
  }, { repeat: [repX, 1] });
}
export function tileTex(a, b, n = 8, grout = '#0c0c0c') {
  return tex(256, 256, (c, w, h) => { const s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? a : b; c.fillRect(i * s, j * s, s, s); c.fillStyle = `rgba(0,0,0,${rnd() * 0.14})`; c.fillRect(i * s, j * s, s, s); } c.strokeStyle = grout; c.lineWidth = 2; for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, h); c.moveTo(0, i * s); c.lineTo(w, i * s); c.stroke(); } blots(c, w, h, 14, '0,0,0', 10, 50, 0.12); });
}
const WOOD_OLD = tex(256, 256, (c, w, h) => { c.fillStyle = '#6a4424'; c.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(${rnd() < 0.5 ? '30,16,6' : '140,96,52'},${0.1 + rnd() * 0.25})`; c.lineWidth = 1 + rnd() * 2; const y = rnd() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 12, w * 0.6, y + (rnd() - 0.5) * 12, w, y + (rnd() - 0.5) * 6); c.stroke(); } for (let i = 1; i < 4; i++) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, i * 64, w, 2); } }, { repeat: [2, 1] });
export const label = (s, col, bg, size = 0.3, font = 'Bungee') => (c, w, h) => { if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); } c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; const L = s.split('\n'); c.font = `${h * size}px ${font}, sans-serif`; L.forEach((l, i) => c.fillText(l, w / 2, h / 2 + (i - (L.length - 1) / 2) * h * size * 1.1)); };

// ---------- materials ----------
const reflective = [];
export function setEnv(t) { for (const m of reflective) { m.envMap = t; m.needsUpdate = true; } }
const env = (m, k = 1) => { m.envMapIntensity = k; reflective.push(m); return m; };
// Fuzzy mascot-suit fabric.
export function suit(color, o = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({ color: c, map: GRIME, roughness: 0.92, sheen: 0.55, sheenRoughness: 0.55, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.25), bumpMap: FUZZ, bumpScale: 1.6, ...o });
}
export const paint = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
export const metal = (color = 0x8a9097, rough = 0.38) => env(new THREE.MeshStandardMaterial({ color, map: GRIME, metalness: 1, roughness: rough }), 0.9);
export const plastic = (color, o = {}) => env(new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, ...o }), 0.5);
export const glass = (color, opacity = 0.45) => env(new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0, transparent: true, opacity, clearcoat: 1 }), 1.2);
export const glow = (color, k = 1) => { const m = new THREE.MeshBasicMaterial({ color }); m.color.multiplyScalar(k); return m; };
export const BLACK = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1 });
export const ENDO = metal(0x7d848c, 0.34);
export const TOOTH = plastic(0xece6d2, { roughness: 0.4 });
// A flat picture (sign, poster, label). lit = it glows by itself.
export function sign(p, w, h, x, y, z, ry, draw, lit = true, px = 512) {
  const t = tex(px, Math.max(8, Math.round(px * h / w)), draw);
  const m = add(p, new THREE.PlaneGeometry(w, h), lit ? new THREE.MeshBasicMaterial({ map: t }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }), x, y, z);
  m.rotation.y = ry; return m;
}
const FADE = tex(4, 64, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#555'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, { data: true });
// A soft fake light beam under a lamp.
export function beam(p, x, y, z, r, h, color = 0xfff2d0, op = 0.07) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, alphaMap: FADE });
  const c = add(p, new THREE.ConeGeometry(r, h, 24, 1, true), m, x, y - h / 2, z); m.opacity = op = op * 0.5; c.userData.noShadow = true; m.userData.base = op; return m;
}

// ---------- fur: stacked see-through shells that read as real fuzz ----------
// o.hole = [x, y, z, r] tears a ragged patch out of the fur (in the part's own space) and leaves a dark cavity under it.
const FUR_N = 12, furShells = [], furBases = [];
export function furMat(color, len = 0.034, den = 230, o = {}) {
  const c = new THREE.Color(color), hole = new THREE.Vector4(...(o.hole || [0, 0, 0, 0]));
  const base = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.5), map: GRIME, roughness: 1 }); base.userData.full = c; furBases.push(base);
  base.onBeforeCompile = sh => {
    sh.uniforms.uHole = { value: hole };
    sh.vertexShader = 'varying vec3 vFurP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFurP = position;');
    sh.fragmentShader = 'uniform vec4 uHole; varying vec3 vFurP;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n if (uHole.w > 0.0 && length(vFurP - uHole.xyz) < uHole.w * 1.08) diffuseColor.rgb = vec3(0.01);');
  };
  const shell = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
  shell.onBeforeCompile = sh => {
    sh.uniforms.uLen = { value: len }; sh.uniforms.uDen = { value: den }; sh.uniforms.uHole = { value: hole };
    sh.vertexShader = 'uniform float uLen; varying vec3 vFurP; varying float vShell;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n vShell = (float(gl_InstanceID) + 1.0) / ${FUR_N}.0; vFurP = position; transformed += normal * vShell * uLen + vec3(0.0, -1.0, 0.0) * vShell * vShell * uLen * 0.3;`);
    sh.fragmentShader = 'uniform float uDen; uniform vec4 uHole; varying vec3 vFurP; varying float vShell;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n vec3 fp = vFurP * uDen; vec3 cl = floor(fp); float rn = fract(sin(dot(cl, vec3(12.9898, 78.233, 37.719))) * 43758.5453); float fd = length(fract(fp) - 0.5); if (rn < vShell * 0.8 || fd > 0.72 * (1.0 - vShell * 0.7)) discard;
      float hd = length(vFurP - uHole.xyz) - uHole.w * (0.75 + 0.5 * rn); if (uHole.w > 0.0 && hd < 0.0) discard;
      float mot = 0.8 + 0.2 * sin(vFurP.x * 23.0 + sin(vFurP.y * 17.0) * 2.0) * sin(vFurP.y * 19.0 + vFurP.z * 13.0);
      diffuseColor.rgb *= mix(0.4, 1.05, vShell) * (0.85 + 0.25 * rn) * mot * (uHole.w > 0.0 ? 0.45 + 0.55 * smoothstep(0.0, 0.07, hd) : 1.0);`);
  };
  return { base, shell };
}
export function furMesh(p, geo, fm, x = 0, y = 0, z = 0) {
  const m = add(p, geo, fm.base, x, y, z), s = new THREE.InstancedMesh(geo, fm.shell, FUR_N);
  s.userData.noShadow = true; s.frustumCulled = false; m.add(s); furShells.push(s); return m;
}
export function setFur(v) { for (const s of furShells) s.visible = v; for (const b of furBases) b.color.copy(b.userData.full).multiplyScalar(v ? 0.5 : 1); }
// Loose wires spilling out of a tear.
export function wires(p, x, y, z, n = 4, len = 0.16, dir = [0, -1, 0.3]) {
  const cols = [0xb01818, 0xd9b21a, 0x1c4fa8, 0x111111, 0xd8d8d8];
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU, r = 0.02 + rand() * 0.03, L = len * (0.6 + rand() * 0.8), pts = [new THREE.Vector3(Math.cos(a) * r * 0.3, 0, Math.sin(a) * r * 0.3)];
    for (let k = 1; k <= 4; k++) pts.push(new THREE.Vector3(Math.cos(a) * r * k + dir[0] * L * k / 4 + (rand() - 0.5) * 0.03, dir[1] * L * (k / 4) ** 1.4, Math.sin(a) * r * k * 0.6 + dir[2] * L * k / 4 + (rand() - 0.5) * 0.03));
    const m = add(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0045, 5), paint(cols[i % 5], { roughness: 0.5 }), x, y, z); m.userData.noShadow = true;
  }
}
// The worn paint on a face plate: grime, dark streaks running down from the eyes, soot round the mouth and hairline cracks.
export function faceTex(n = 0) {
  return tex(512, 256, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); blots(c, w, h, 50, '50,36,22', 8, 46, 0.2); blots(c, w, h, 90, '0,0,0', 1, 6, 0.3);
    const U = u => u * w, V = v => (1 - v) * h;
    for (const u of [0.172, 0.328]) {
      const g = c.createRadialGradient(U(u), V(0.6), 4, U(u), V(0.6), 46); g.addColorStop(0, 'rgba(8,6,4,.85)'); g.addColorStop(1, 'rgba(8,6,4,0)'); c.fillStyle = g; c.fillRect(U(u) - 50, V(0.6) - 50, 100, 100);
      for (let k = 0; k < 5; k++) { c.strokeStyle = `rgba(10,7,5,${0.35 + rand() * 0.4})`; c.lineWidth = 2 + rand() * 5; const x = U(u) + (k - 2) * 5; c.beginPath(); c.moveTo(x, V(0.56)); c.bezierCurveTo(x + (rand() - 0.5) * 8, V(0.48), x + (rand() - 0.5) * 8, V(0.42), x + (rand() - 0.5) * 10, V(0.26 + rand() * 0.12)); c.stroke(); }
    }
    const m = c.createRadialGradient(U(0.25), V(0.36), 6, U(0.25), V(0.36), 70); m.addColorStop(0, 'rgba(10,6,4,.6)'); m.addColorStop(1, 'rgba(10,6,4,0)'); c.fillStyle = m; c.fillRect(U(0.25) - 80, V(0.36) - 60, 160, 120);
    c.strokeStyle = 'rgba(12,8,6,.85)'; c.lineCap = 'round';
    for (let k = 0; k < 5 + n % 3; k++) { let x = U(0.12 + rand() * 0.26), y = V(0.75 - rand() * 0.2); c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (rand() - 0.5) * 22; y += 6 + rand() * 12; c.lineTo(x, y); if (rand() < 0.3) { c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 26, y + rand() * 10); c.moveTo(x, y); } } c.stroke(); }
  });
}
// A coil spring standing on y (for necks, elbows and knees).
export function spring(p, r, h, turns, x, y, z, mat = ENDO) {
  const pts = []; for (let i = 0; i <= turns * 14; i++) { const a = i / 14 * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r, i / (turns * 14) * h - h / 2, Math.sin(a) * r)); }
  return add(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 14, r * 0.14, 6), mat, x, y, z);
}
// An iris, drawn outward from the pupil (fits a sphere cap: top of the picture is the centre of the eye).
export function irisTex(color) {
  return tex(64, 64, (c, w, h) => {
    const col = new THREE.Color(color), g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#' + col.clone().multiplyScalar(0.35).getHexString()); g.addColorStop(0.45, '#' + col.getHexString()); g.addColorStop(0.85, '#' + col.clone().lerp(new THREE.Color(0xffffff), 0.25).getHexString()); g.addColorStop(1, '#050505');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 64; i++) { c.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.28})`; c.fillRect(i, 8 + rand() * 12, 1, 30 + rand() * 22); }
    c.fillStyle = '#050505'; c.fillRect(0, h - 6, w, 6);
  });
}

// ---------- photographed surfaces (tex/*.jpg): colour, bumps (normal) and shininess (roughness) ----------
const TLD = new THREE.TextureLoader();
export function ptex(file, rx = 1, ry = 1, srgb = false) { const t = TLD.load('tex/' + file + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
export function pbrMat(name, rx, ry, o = {}, maps = 'dnr') {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, ...o });
  if (maps.includes('d')) m.map = ptex(name + '_d', rx, ry, true); if (maps.includes('n')) m.normalMap = ptex(name + '_n', rx, ry); if (maps.includes('r')) m.roughnessMap = ptex(name + '_r', rx, ry);
  return m;
}
export const woodMat = (o = {}, rx = 2, ry = 1) => pbrMat('wood_table_001', rx, ry, o);
export const WOOD = ptex('wood_table_001_d', 2, 1, true);
