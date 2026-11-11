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
export const WOOD = tex(256, 256, (c, w, h) => { c.fillStyle = '#6a4424'; c.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(${rnd() < 0.5 ? '30,16,6' : '140,96,52'},${0.1 + rnd() * 0.25})`; c.lineWidth = 1 + rnd() * 2; const y = rnd() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 12, w * 0.6, y + (rnd() - 0.5) * 12, w, y + (rnd() - 0.5) * 6); c.stroke(); } for (let i = 1; i < 4; i++) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, i * 64, w, 2); } }, { repeat: [2, 1] });
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
