// The three EXE monsters (and Glitch's blocky body), name tags and scare faces. Survivors' bodies are in avatar.js.
// Animation is procedural.
import * as THREE from 'three';
import { CHARS } from '../shared/rules.js';
import { damp } from '../shared/util.js';
import { buildAvatar, updateAvatar } from './avatar.js';

const U = 0.45; // one "stud"
const geoCache = new Map();
function rbox(w, h, d, r = 0.05) {
  const key = `${w},${h},${d},${r}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const pos = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.copy(v).clamp(inner.clone().negate(), inner);
    const n = v.clone().sub(c);
    if (n.lengthSq() > 1e-9) n.normalize().multiplyScalar(r);
    v.copy(c).add(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// ------------------------------------------------------------------ textures drawn on canvases
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = canvas(w, h), g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

function drawFace(g, kind, w, h) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, ey = h * 0.42;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const eye = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  g.fillStyle = '#111'; g.strokeStyle = '#111'; g.lineWidth = 6;
  const ex = w * 0.13;
  switch (kind) {
    case 'grin':
      eye(cx - ex, ey, 6, 10); eye(cx + ex, ey, 6, 10);
      g.beginPath(); g.moveTo(cx - 30, h * 0.6); g.quadraticCurveTo(cx, h * 0.86, cx + 30, h * 0.6); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.fillRect(cx - 24, h * 0.61, 48, 7);
      break;
    case 'cool':
      g.fillRect(cx - 44, ey - 12, 38, 20); g.fillRect(cx + 6, ey - 12, 38, 20); g.fillRect(cx - 8, ey - 10, 16, 5);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(cx - 38, ey - 8, 10, 4); g.fillRect(cx + 12, ey - 8, 10, 4);
      g.beginPath(); g.moveTo(cx - 14, h * 0.68); g.quadraticCurveTo(cx + 6, h * 0.74, cx + 22, h * 0.63); g.stroke();
      break;
    case 'worried':
      eye(cx - ex, ey + 2, 6, 9); eye(cx + ex, ey + 2, 6, 9);
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(cx - ex - 12, ey - 12); g.lineTo(cx - ex + 8, ey - 18); g.stroke();
      g.beginPath(); g.moveTo(cx + ex + 12, ey - 12); g.lineTo(cx + ex - 8, ey - 18); g.stroke();
      g.beginPath(); g.moveTo(cx - 18, h * 0.7); for (let i = 0; i <= 6; i++) g.lineTo(cx - 18 + i * 6, h * 0.7 + (i % 2 ? -4 : 3)); g.stroke();
      break;
    case 'cute':
      eye(cx - ex, ey, 10, 13); eye(cx + ex, ey, 10, 13);
      g.fillStyle = '#fff'; eye(cx - ex + 3, ey - 5, 4, 4); eye(cx + ex + 3, ey - 5, 4, 4);
      g.fillStyle = 'rgba(255,90,120,0.45)'; eye(cx - ex - 10, ey + 20, 9, 5); eye(cx + ex + 10, ey + 20, 9, 5);
      g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 10, h * 0.66); g.quadraticCurveTo(cx - 5, h * 0.72, cx, h * 0.66); g.quadraticCurveTo(cx + 5, h * 0.72, cx + 10, h * 0.66); g.stroke();
      break;
    case 'smirk':
      eye(cx - ex, ey, 6, 9); eye(cx + ex, ey, 6, 9);
      g.lineWidth = 5; g.beginPath(); g.moveTo(cx + ex - 9, ey - 17); g.lineTo(cx + ex + 10, ey - 21); g.stroke();
      g.beginPath(); g.moveTo(cx - 16, h * 0.68); g.quadraticCurveTo(cx + 8, h * 0.72, cx + 22, h * 0.6); g.stroke();
      break;
    case 'determined':
      eye(cx - ex, ey + 2, 6, 8); eye(cx + ex, ey + 2, 6, 8);
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx - ex - 12, ey - 18); g.lineTo(cx - ex + 10, ey - 11); g.stroke();
      g.beginPath(); g.moveTo(cx + ex + 12, ey - 18); g.lineTo(cx + ex - 10, ey - 11); g.stroke();
      g.beginPath(); g.moveTo(cx - 16, h * 0.69); g.lineTo(cx + 16, h * 0.68); g.stroke();
      break;
    case 'exe': {
      // black eyes, glowing red pupils, bleeding, a grin full of teeth
      g.fillStyle = '#000';
      eye(cx - ex - 2, ey, 15, 18); eye(cx + ex + 2, ey, 15, 18);
      const grad = (x) => { const r = g.createRadialGradient(x, ey + 2, 0, x, ey + 2, 9); r.addColorStop(0, '#fff2f2'); r.addColorStop(0.35, '#ff2020'); r.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = r; eye(x, ey + 2, 9, 9); };
      grad(cx - ex - 2); grad(cx + ex + 2);
      g.strokeStyle = '#8a0000'; g.lineWidth = 4;
      for (const x of [cx - ex - 6, cx - ex + 4, cx + ex - 2, cx + ex + 7]) { g.beginPath(); g.moveTo(x, ey + 14); g.lineTo(x + (Math.random() - 0.5) * 4, ey + 30 + Math.random() * 26); g.stroke(); }
      g.fillStyle = '#120000';
      g.beginPath(); g.moveTo(cx - 40, h * 0.66); g.quadraticCurveTo(cx, h * 0.98, cx + 40, h * 0.66); g.quadraticCurveTo(cx, h * 0.78, cx - 40, h * 0.66); g.fill();
      g.fillStyle = '#f2efe6';
      for (let i = 0; i < 9; i++) { const x = cx - 34 + i * 8.5; g.beginPath(); g.moveTo(x - 3.5, h * 0.7 + Math.abs(i - 4) * -1.2); g.lineTo(x + 3.5, h * 0.7 + Math.abs(i - 4) * -1.2); g.lineTo(x, h * 0.7 + 9); g.fill(); }
      break;
    }
    case 'glitch':
      g.fillStyle = '#fff'; g.fillRect(cx - ex - 10, ey - 10, 18, 18); g.fillRect(cx + ex - 8, ey - 10, 18, 18);
      g.fillStyle = '#ff2a6a'; g.fillRect(cx - ex - 4, ey - 4, 6, 6);
      for (let i = 0; i < 14; i++) { g.fillStyle = ['#fff', '#000', '#ff2a6a', '#2affea'][i % 4]; g.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 40, 3); }
      g.fillStyle = '#000'; g.fillRect(cx - 30, h * 0.68, 60, 8);
      break;
    case 'grinexe':
      g.fillStyle = '#050505'; eye(cx - ex - 4, ey - 4, 13, 16); eye(cx + ex + 4, ey - 4, 13, 16);
      g.fillStyle = '#300'; g.beginPath(); g.moveTo(0, h * 0.55); g.quadraticCurveTo(cx, h * 1.02, w, h * 0.55); g.quadraticCurveTo(cx, h * 0.72, 0, h * 0.55); g.fill();
      g.fillStyle = '#fbf6e8';
      for (let i = 0; i < 16; i++) { const x = 6 + i * ((w - 12) / 15); const y = h * 0.6 + Math.sin((i / 15) * Math.PI) * h * 0.1; g.fillRect(x - 3, y - 2, 6, 9); }
      break;
    default: // smile
      eye(cx - ex, ey, 6, 10); eye(cx + ex, ey, 6, 10);
      g.beginPath(); g.moveTo(cx - 22, h * 0.63); g.quadraticCurveTo(cx, h * 0.8, cx + 22, h * 0.63); g.stroke();
  }
}

function drawShirt(g, w, h, color, pattern) {
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  const dark = '#' + shade(color, 0.62).getHexString(), light = '#' + new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55).getHexString();
  g.fillStyle = light; g.strokeStyle = light;
  const cx = w / 2, cy = h * 0.48;
  switch (pattern) {
    case 'stripes': g.fillStyle = dark; for (let y = 10; y < h; y += 26) g.fillRect(0, y, w, 12); break;
    case 'star': {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 14 : 34; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fill(); break;
    }
    case 'bolt': g.beginPath(); g.moveTo(cx + 8, cy - 40); g.lineTo(cx - 22, cy + 6); g.lineTo(cx - 2, cy + 6); g.lineTo(cx - 12, cy + 40); g.lineTo(cx + 22, cy - 8); g.lineTo(cx + 2, cy - 8); g.closePath(); g.fill(); break;
    case 'heart': g.beginPath(); g.moveTo(cx, cy + 30); g.bezierCurveTo(cx - 46, cy, cx - 22, cy - 38, cx, cy - 14); g.bezierCurveTo(cx + 22, cy - 38, cx + 46, cy, cx, cy + 30); g.fill(); break;
    case 'skull':
      g.beginPath(); g.arc(cx, cy - 6, 26, 0, Math.PI * 2); g.fill(); g.fillRect(cx - 16, cy + 10, 32, 18);
      g.fillStyle = dark; g.beginPath(); g.arc(cx - 10, cy - 6, 7, 0, Math.PI * 2); g.arc(cx + 10, cy - 6, 7, 0, Math.PI * 2); g.fill(); g.fillRect(cx - 2, cy + 6, 4, 8);
      break;
    case 'number': g.font = 'bold 64px Bungee, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('07', cx, cy + 4); break;
  }
}

function noiseTex(key, colors) {
  return canvasTex(key, 64, 64, (g, w, h) => {
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = colors[Math.floor(Math.random() * colors.length)]; g.fillRect(x, y, 4, 4); }
  });
}

/** Name label floating above someone. */
export function nameTag(text, color = '#ffffff') {
  const c = canvas(512, 112), g = c.getContext('2d');
  g.font = '700 54px Outfit, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text, 256, 58);
  g.fillStyle = color; g.fillText(text, 256, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  s.scale.set(2.3, 0.5, 1); s.renderOrder = 20;
  return s;
}

/** The owner's name tag: their name in gold under a red OWNER badge. */
export function ownerTag(text) {
  const c = canvas(512, 176), g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 38px Outfit, Arial, sans-serif';
  const bw = g.measureText('OWNER').width + 40;
  g.fillStyle = '#000'; g.fillRect(256 - bw / 2 + 5, 11, bw, 50);
  g.fillStyle = '#c8001a'; g.fillRect(256 - bw / 2, 6, bw, 50);
  g.lineWidth = 4; g.strokeStyle = '#ff6a6a'; g.strokeRect(256 - bw / 2 + 2, 8, bw - 4, 46);
  g.fillStyle = '#ffffff'; g.fillText('OWNER', 256, 33);
  g.font = '800 56px Outfit, Arial, sans-serif';
  g.lineWidth = 11; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(text, 256, 120);
  const grad = g.createLinearGradient(0, 92, 0, 148); grad.addColorStop(0, '#fff2a8'); grad.addColorStop(1, '#ffb800');
  g.fillStyle = grad; g.fillText(text, 256, 120);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  s.scale.set(2.3, 2.3 * 176 / 512, 1); s.renderOrder = 20;
  return s;
}

// ------------------------------------------------------------------ the rig
export class Rig {
  /** Fewer trail pieces on the 'Fast' graphics setting. */
  static lowFx = false;

  /** kind: 'surv' (look + char) or 'exe' (variant). */
  constructor({ role = 'surv', look, char = 'bolt', variant = 'exe' }) {
    this.role = role; this.char = char; this.variant = variant;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.hips = new THREE.Group(); this.hips.position.y = 2 * U; this.body.add(this.hips);
    this.mats = [];
    this.ph = 0; this.t = Math.random() * 10; this.twitch = 0; this.twitchT = 2;
    this.spin = []; this.extra = {};
    if (role === 'exe') this.buildExe(variant); else this.buildSurvivor(look, char);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material && !this.mats.includes(o.material)) this.mats.push(o.material); } });
    this.opacity = 1;
  }

  mat(color, extra) { return lam(color, extra); }

  skeleton(cols, armLen = 1, armW = 1) {
    const { torsoMats, armTop, armBottom, sleeve, legTop, shoe, headMat } = cols;
    const torso = new THREE.Mesh(rbox(2 * U, 2 * U, U, 0.05), torsoMats);
    torso.position.y = U; this.hips.add(torso); this.torso = torso;
    this.neck = new THREE.Group(); this.neck.position.y = 2 * U; this.hips.add(this.neck);
    this.head = new THREE.Group(); this.neck.add(this.head);
    const headMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.54, 22), headMat);
    headMesh.position.y = 0.3; this.head.add(headMesh);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2), headMat);
    cap.position.y = 0.57; cap.scale.y = 0.25; this.head.add(cap);
    const capB = cap.clone(); capB.rotation.x = Math.PI; capB.position.y = 0.03; this.head.add(capB);
    const mkArm = (side) => {
      const g = new THREE.Group(); g.position.set(side * 1.5 * U, 2 * U - 0.08, 0);
      const L = 2 * U * armLen, top = L * sleeve;
      if (top > 0.01) { const m = new THREE.Mesh(rbox(U * armW, top, U * armW, 0.04), armTop); m.position.y = 0.08 - top / 2; g.add(m); }
      if (L - top > 0.01) { const m = new THREE.Mesh(rbox(U * armW * 0.98, L - top, U * armW * 0.98, 0.04), armBottom); m.position.y = 0.08 - top - (L - top) / 2; g.add(m); }
      g.userData.hand = new THREE.Group(); g.userData.hand.position.y = 0.08 - L + 0.08; g.add(g.userData.hand);
      this.hips.add(g); return g;
    };
    this.armR = mkArm(-1); this.armL = mkArm(1);
    const mkLeg = (side) => {
      const g = new THREE.Group(); g.position.set(side * 0.5 * U, 0, 0);
      const m = new THREE.Mesh(rbox(U * 0.98, 2 * U - 0.14, U * 0.98, 0.04), legTop); m.position.y = -U + 0.07; g.add(m);
      const s = new THREE.Mesh(rbox(U, 0.16, U * 1.08, 0.04), shoe); s.position.set(0, -2 * U + 0.08, 0.02); g.add(s);
      g.userData.foot = s;
      this.hips.add(g); return g;
    };
    this.legR = mkLeg(-1); this.legL = mkLeg(1);
  }

  faceOn(kind, w = 1) {
    const tex = canvasTex('face:' + kind + (kind === 'glitch' ? Math.random() : ''), 160, 128, (g, cw, ch) => drawFace(g, kind, cw, ch));
    const monster = kind === 'exe' || kind === 'glitch' || kind === 'grinexe';
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.296, 0.296, 0.5, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3), lam(0xffffff, { map: tex, transparent: true, alphaTest: 0.05, ...(monster ? { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 } : {}) }));
    m.position.y = 0.3; m.scale.x = w; this.head.add(m);
    this.face = m;
    return m;
  }

  /** Survivors (and EXE's disguise) use the jointed avatar in avatar.js. */
  buildSurvivor(look, char) { buildAvatar(this, look, char); }

  hat(kind, color, char) {
    const m = this.mat(color), h = this.head;
    const add = (geo, x, y, z, mat = m) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); h.add(o); return o; };
    switch (kind) {
      case 'cap': add(new THREE.SphereGeometry(0.31, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.5, 0).scale.y = 0.6; add(rbox(0.5, 0.05, 0.3, 0.02), 0, 0.53, 0.33); break;
      case 'beanie': add(new THREE.CylinderGeometry(0.31, 0.32, 0.26, 20), 0, 0.6, 0); add(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 20), 0, 0.5, 0, this.mat(shade(color, 0.7))); add(new THREE.SphereGeometry(0.09, 10, 8), 0, 0.78, 0); break;
      case 'spiky': for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const c = add(new THREE.ConeGeometry(0.1, 0.34, 6), Math.sin(a) * 0.17, 0.66, Math.cos(a) * 0.17 - 0.03); c.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6); } add(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 20), 0, 0.55, -0.01); break;
      case 'messy': add(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 20), 0, 0.56, -0.01); for (let i = 0; i < 6; i++) add(rbox(0.2, 0.12, 0.2, 0.05), Math.sin(i * 2.1) * 0.15, 0.66 + (i % 2) * 0.04, Math.cos(i * 2.1) * 0.15 - 0.02).rotation.y = i; break;
      case 'long': add(new THREE.CylinderGeometry(0.315, 0.315, 0.18, 20), 0, 0.55, -0.01); add(rbox(0.62, 0.62, 0.16, 0.06), 0, 0.26, -0.24); break;
      case 'headphones': { const band = add(new THREE.TorusGeometry(0.33, 0.035, 8, 20, Math.PI), 0, 0.32, 0, this.mat(0x222228)); band.rotation.y = Math.PI / 2; for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 14), s * 0.32, 0.3, 0).rotation.z = Math.PI / 2; break; }
      case 'crown': { const gold = this.mat(0xffcc33, { emissive: 0x332200 }); add(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 20, 1, true), 0, 0.64, 0, gold); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.ConeGeometry(0.05, 0.14, 4), Math.sin(a) * 0.29, 0.76, Math.cos(a) * 0.29, gold); } break; }
      case 'tophat': add(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 22), 0, 0.6, 0); add(new THREE.CylinderGeometry(0.24, 0.26, 0.4, 20), 0, 0.81, 0); add(new THREE.CylinderGeometry(0.265, 0.265, 0.07, 20), 0, 0.66, 0, this.mat(0xb3202a)); break;
    }
  }

  buildExe(variant) {
    this.puffs = []; this.puffT = 0; this.awake = false;
    if (variant === 'glitch') this.buildGlitch();
    else if (variant === 'grin') this.buildBrute();
    else this.buildSpeedster();
  }

  /** EXE: a hedgehog-like demon built for speed. Ash-grey fur stained red, long jagged quills swept back off
   *  its head and spine, hollow black eyes with pin-prick red pupils, black tears and a grin far too wide. */
  buildSpeedster() {
    this.organic = 'exe';
    const fur = std(0xffffff, { map: furTex(), roughness: 0.92, metalness: 0, emissive: 0xff1208, emissiveMap: crackTex(), emissiveIntensity: 0.3 });
    const furDark = std(0x15161b, { roughness: 0.95, metalness: 0 });
    const muzzle = std(0x6e6662, { roughness: 0.85, metalness: 0 });
    const earIn = std(0x5a0a10, { roughness: 0.8 });
    const hollow = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const red = new THREE.MeshBasicMaterial({ color: 0xff2414, fog: false });
    const tooth = std(0xe6ddcc, { roughness: 0.35 });
    const claw = std(0x1c0c0e, { roughness: 0.3, metalness: 0.5, emissive: 0x3a0004, emissiveIntensity: 0.6 });
    const blood = std(0x5a0008, { roughness: 0.25, metalness: 0.2 });
    const gum = new THREE.MeshBasicMaterial({ color: 0x160002 });
    const O = (this.O = {});
    O.pelvis = J(this.body, 0, 1.24, 0);
    capsule(O.pelvis, 0.14, 0.2, fur).rotation.z = Math.PI / 2;
    O.legs = [-1, 1].map((sd) => {
      const hip = J(O.pelvis, sd * 0.16, -0.02, 0);
      const knee = seg(hip, 0.12, 0.42, fur);
      spike(knee, 0, 0.12, -0.06, 0, -0.5, -1, 0.05, 0.24, furDark);
      const ankle = seg(knee, 0.085, 0.48, fur);
      const toe = seg(ankle, 0.07, 0.28, furDark);
      for (let i = 0; i < 3; i++) { const c = cone(toe, 0.03, 0.2, claw); c.position.set((i - 1) * 0.05, 0, 0.1); c.rotation.x = Math.PI / 2; }
      return { hip, knee, ankle, toe };
    });
    O.spine = J(O.pelvis, 0, 0.08, 0);
    capsule(O.spine, 0.14, 0.24, fur, 0.2).scale.set(1.1, 1, 0.9);
    O.chest = J(O.spine, 0, 0.36, 0);
    capsule(O.chest, 0.2, 0.24, fur, 0.18).scale.set(1.4, 1, 0.95);
    // quills down the back, swept back and down
    for (let i = 0; i < 6; i++) {
      const sd = i % 2 ? 1 : -1, x = i ? sd * 0.08 : 0;
      spike(O.chest, x, 0.62 - i * 0.12, -0.12, x * 3, -0.45 - i * 0.05, -1, 0.085 - i * 0.008, 0.52 - i * 0.05, i % 2 ? furDark : fur);
    }
    O.arms = [-1, 1].map((sd) => {
      const sh = J(O.chest, sd * 0.31, 0.33, 0);
      sh.add(new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), fur));
      const elbow = seg(sh, 0.075, 0.5, fur);
      spike(elbow, 0, 0.06, -0.05, 0, 0.35, -1, 0.045, 0.22, furDark);
      const wrist = seg(elbow, 0.062, 0.5, fur);
      capsule(wrist, 0.065, 0.05, furDark, -0.04);
      const claws = [];
      for (let i = 0; i < 4; i++) {
        const c = J(wrist, (i - 1.5) * 0.04, -0.09, 0.02);
        const b = cone(c, 0.022, 0.46, claw); b.position.y = -0.23; b.rotation.x = Math.PI; c.rotation.set(0.25, 0, (i - 1.5) * 0.1);
        claws.push(c);
      }
      return { sh, elbow, wrist, claws, sd };
    });
    O.neck = J(O.chest, 0, 0.42, 0.03);
    capsule(O.neck, 0.06, 0.14, fur, 0.1);
    O.head = J(O.neck, 0, 0.3, 0.04);
    O.head.scale.setScalar(1.25);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 22, 18), fur); skull.scale.set(1, 0.95, 0.98); O.head.add(skull);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), muzzle); snout.scale.set(1.35, 0.8, 0.85); snout.position.set(0, -0.1, 0.16); O.head.add(snout);
    // jagged quills: chains of tapering spikes swept back off the head, curling up at the tips
    O.quills = [];
    const QUILLS = [[0, 0.2, -0.05, 0, 0.4, -1, 0.66], [-0.12, 0.15, -0.1, -0.45, 0.25, -1, 0.6], [0.12, 0.15, -0.1, 0.45, 0.25, -1, 0.6], [-0.17, 0.02, -0.12, -0.65, -0.05, -1, 0.56], [0.17, 0.02, -0.12, 0.65, -0.05, -1, 0.56], [-0.1, -0.12, -0.15, -0.4, -0.55, -1, 0.5], [0.1, -0.12, -0.15, 0.4, -0.55, -1, 0.5], [0, -0.04, -0.2, 0, -0.2, -1, 0.58]];
    QUILLS.forEach(([bx, by, bz, dx, dy, dz, len], i) => {
      const base = J(O.head, bx, by, bz);
      base.quaternion.setFromUnitVectors(DOWN, new THREE.Vector3(dx, dy, dz).normalize());
      const chain = [base];
      let j = base;
      const parts = [[0.08, 0.055, 0.42], [0.055, 0.032, 0.34], [0.032, 0, 0.3]];
      parts.forEach(([r0, r1, f], k) => { j = qseg(j, r0, r1, len * f, k === 1 && i % 2 ? furDark : fur, k > 0); j.rotation.x = 0.14; chain.push(j); });
      O.quills.push(chain);
    });
    // ears
    for (const sd of [-1, 1]) {
      spike(O.head, sd * 0.12, 0.18, 0.0, sd * 0.4, 1, -0.2, 0.08, 0.26, fur);
      spike(O.head, sd * 0.12, 0.19, 0.035, sd * 0.4, 1, -0.2, 0.045, 0.17, earIn);
    }
    // hollow eyes, pin-prick pupils, angry brows, black tears
    O.drips = [];
    for (const sd of [-1, 1]) {
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.092, 14, 10), hollow); sock.scale.set(1, 1.32, 0.46); sock.position.set(sd * 0.095, 0.05, 0.218); sock.rotation.y = sd * 0.35; O.head.add(sock);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), red); pupil.position.set(sd * 0.088, 0.035, 0.258); O.head.add(pupil);
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.12, 4, 8), furDark); brow.rotation.z = Math.PI / 2 - sd * 0.45; brow.position.set(sd * 0.1, 0.145, 0.228); O.head.add(brow);
      const tear = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.15, 0.012), hollow); tear.position.set(sd * 0.105, -0.03, 0.246); tear.rotation.z = sd * 0.12; O.head.add(tear);
      const drip = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), hollow); drip.position.set(sd * 0.108, -0.03, 0.25); O.head.add(drip);
      O.drips.push({ m: drip, sd, ph: sd > 0 ? 0.5 : 0 });
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), hollow); nose.scale.set(1.2, 0.85, 0.9); nose.position.set(0, -0.035, 0.298); O.head.add(nose);
    // the grin: a curve across the whole snout, up to the cheeks, lined with needle teeth
    const surfZ = (x, y) => {
      const a = 1 - (x / 0.216) ** 2 - ((y + 0.1) / 0.128) ** 2, b = 0.0676 - x * x - y * y;
      return Math.max(a > 0 ? 0.16 + 0.136 * Math.sqrt(a) : 0, b > 0 ? Math.sqrt(b) * 0.98 : 0) + 0.006;
    };
    const grinPt = (u, dy = 0) => { const x = (u - 0.5) * 0.44, y = -0.14 + 0.085 * (x / 0.22) ** 2 + dy; return new THREE.Vector3(x, y, surfZ(x, y)); };
    const line = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => grinPt(i / 12)));
    O.head.add(new THREE.Mesh(new THREE.TubeGeometry(line, 40, 0.011, 5), gum));
    for (let i = 0; i < 17; i++) { const p = grinPt(0.03 + (i / 16) * 0.94, -0.017); const t = cone(O.head, 0.0085, 0.042, tooth); t.position.copy(p); t.rotation.x = Math.PI; }
    O.jaw = J(O.head, 0, -0.1, 0.05);
    for (let i = 0; i < 16; i++) { const p = grinPt(0.06 + (i / 15) * 0.88, -0.03); const t = cone(O.jaw, 0.0085, 0.04, tooth); t.position.set(p.x, p.y + 0.1, p.z - 0.05); }
    const lip = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => { const p = grinPt(0.04 + (i / 12) * 0.92, -0.05); return p.set(p.x, p.y + 0.1, p.z - 0.05); }));
    O.jaw.add(new THREE.Mesh(new THREE.TubeGeometry(lip, 36, 0.009, 5), gum));
    O.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), gum); O.mouth.scale.set(1.6, 0.05, 0.4); O.mouth.position.set(0, -0.15, 0.248); O.head.add(O.mouth);
    for (const [x, len] of [[-0.19, 0.07], [0.2, 0.09], [-0.05, 0.05], [0.07, 0.06]]) { const p = grinPt(0.5 + x / 0.44, -0.02); const d = new THREE.Mesh(new THREE.BoxGeometry(0.012, len, 0.01), blood); d.position.set(p.x, p.y - len / 2, p.z + 0.002); O.head.add(d); }
    this.eyeGlowPair(O.head, 0xff1a10, 0.075, [[-0.088, 0.035, 0.27], [0.088, 0.035, 0.27]]);
    this.root.scale.setScalar(1.12);
    this.baseScale = 1.12;
    this.glowMats = [fur];
    this.smoke = { color: 'rgba(255,20,10,', size: 0.45, rise: 0.2, streak: true };
    this.initFx();
  }

  /** Grin.exe: a corrupted old build. A hulking, hunched body of rough blocks that keep crumbling into voxels
   *  and snapping back, a head split all the way round by its grin, mismatched square eyes, and it moves
   *  in stop-motion, skipping frames. */
  buildBrute() {
    this.organic = 'grin';
    const hide = std(0xffffff, { map: voxTex('grin-a', ['#1e1b22', '#2c2830', '#36313b', '#24212a']), roughness: 0.95, metalness: 0, flatShading: true, emissive: 0xff1020, emissiveMap: voxTex('grin-glow', null), emissiveIntensity: 1.3 });
    const mid = std(0xffffff, { map: voxTex('grin-b', ['#3a3540', '#4a444f', '#2e2a33', '#55505c']), roughness: 0.9, metalness: 0, flatShading: true });
    const black = new THREE.MeshBasicMaterial({ color: 0x050304 });
    const white = new THREE.MeshBasicMaterial({ color: 0xfff0f0, fog: false });
    const tooth = std(0xeee6d4, { roughness: 0.5, flatShading: true });
    const glowRed = new THREE.MeshBasicMaterial({ color: 0xff1a22, fog: false });
    const inside = std(0x220003, { emissive: 0xff1010, emissiveIntensity: 1.1 });
    const B = (parent, w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
    const bseg = (parent, w, len, d, mat) => { B(parent, w, len, d, mat, 0, -len / 2, 0).userData.vox = true; const end = new THREE.Group(); end.position.y = -len; parent.add(end); return end; };
    const O = (this.O = {});
    O.pelvis = J(this.body, 0, 1.12, 0);
    B(O.pelvis, 0.66, 0.32, 0.46, hide).userData.vox = true;
    O.legs = [-1, 1].map((sd) => {
      const hip = J(O.pelvis, sd * 0.25, -0.08, 0);
      const knee = bseg(hip, 0.3, 0.5, 0.32, hide);
      const ankle = bseg(knee, 0.27, 0.45, 0.29, mid);
      B(ankle, 0.34, 0.14, 0.5, hide, 0, -0.04, 0.1).userData.vox = true;
      for (let i = 0; i < 3; i++) B(ankle, 0.07, 0.07, 0.12, black, (i - 1) * 0.1, -0.06, 0.38);
      return { hip, knee, ankle };
    });
    O.spine = J(O.pelvis, 0, 0.14, 0);
    B(O.spine, 0.72, 0.44, 0.52, hide, 0, 0.21, 0).userData.vox = true;
    O.chest = J(O.spine, 0, 0.42, 0);
    B(O.chest, 1.3, 0.8, 0.82, hide, 0, 0.4, -0.02).userData.vox = true;
    B(O.chest, 0.92, 0.42, 0.52, mid, 0, 0.72, -0.32).userData.vox = true;
    for (const sd of [-1, 1]) B(O.chest, 0.46, 0.42, 0.52, mid, sd * 0.62, 0.62, 0).userData.vox = true;
    // knobbly blocks down the back, and loose red "dead pixels" hovering just off the body
    for (let i = 0; i < 6; i++) B(O.chest, 0.16, 0.16, 0.16, i % 2 ? mid : hide, (i % 3 - 1) * 0.25, 0.85 - i * 0.12, -0.5 - (i % 2) * 0.04).rotation.set(0.3 * i, 0.5, 0.2);
    O.floaters = [];
    for (let i = 0; i < 5; i++) { const m = B(O.chest, 0.09, 0.09, 0.09, i % 2 ? glowRed : black, (Math.random() - 0.5) * 1.4, 0.2 + Math.random() * 0.8, (Math.random() - 0.5) * 1.0); O.floaters.push({ m, base: m.position.clone(), ph: i * 1.3 }); }
    O.arms = [-1, 1].map((sd) => {
      const sh = J(O.chest, sd * 0.8, 0.55, 0.02);
      const elbow = bseg(sh, 0.3, 0.75, 0.32, hide);
      const wrist = bseg(elbow, 0.36, 0.8, 0.36, mid);
      B(wrist, 0.42, 0.22, 0.36, hide, 0, -0.08, 0.02).userData.vox = true;
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const f = J(wrist, (i - 1.5) * 0.1, -0.18, 0.06);
        f.rotation.set(0.15, 0, (i - 1.5) * 0.06);
        const tip = bseg(f, 0.07, 0.3, 0.07, hide);
        B(tip, 0.06, 0.14, 0.06, black, 0, -0.05, 0.01);
        fingers.push(f);
      }
      return { sh, elbow, wrist, fingers, sd };
    });
    O.neck = J(O.chest, 0, 0.8, 0.3);
    B(O.neck, 0.42, 0.22, 0.42, hide, 0, 0.06, 0);
    O.head = J(O.neck, 0, 0.16, 0.24);
    O.head.scale.setScalar(1.08);
    // the head is two halves: a heavy skull and a jaw hinged at the back, split by the grin all the way round
    B(O.head, 0.9, 0.5, 0.8, hide, 0, 0.25, 0).userData.vox = true;
    B(O.head, 0.84, 0.3, 0.74, inside, 0, -0.02, 0);
    B(O.head, 0.86, 0.09, 0.14, mid, 0, 0.44, 0.36).rotation.x = 0.25;
    for (let i = 0; i < 11; i++) { const x = -0.42 + i * 0.084; B(O.head, 0.055, 0.1 + (i % 3) * 0.035, 0.05, tooth, x, -0.05 - (i % 3) * 0.017, 0.38); }
    for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) B(O.head, 0.05, 0.1 + (i % 2) * 0.04, 0.055, tooth, sd * 0.43, -0.05 - (i % 2) * 0.02, -0.3 + i * 0.12);
    O.jaw = J(O.head, 0, 0, -0.38);
    B(O.jaw, 0.86, 0.32, 0.8, hide, 0, -0.16, 0.38).userData.vox = true;
    for (let i = 0; i < 10; i++) { const x = -0.38 + i * 0.084; B(O.jaw, 0.055, 0.1 + ((i + 1) % 3) * 0.03, 0.05, tooth, x, 0.04, 0.76); }
    for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) B(O.jaw, 0.05, 0.1, 0.055, tooth, sd * 0.41, 0.04, 0.1 + i * 0.12);
    // a crack running up from the grin through the face
    [[0.04, 0.06, 0.5], [-0.03, 0.16, -0.6], [0.05, 0.26, 0.55], [0.0, 0.36, -0.4]].forEach(([x, y, r]) => { B(O.head, 0.03, 0.13, 0.02, black, x, y, 0.405).rotation.z = r; B(O.head, 0.012, 0.12, 0.02, glowRed, x + 0.018, y, 0.404).rotation.z = r; });
    // mismatched square eyes: one big, one small
    B(O.head, 0.25, 0.25, 0.02, black, -0.2, 0.28, 0.401);
    B(O.head, 0.17, 0.17, 0.03, glowRed, -0.2, 0.28, 0.405);
    B(O.head, 0.06, 0.06, 0.02, white, -0.17, 0.3, 0.42);
    B(O.head, 0.16, 0.16, 0.02, black, 0.21, 0.27, 0.401);
    B(O.head, 0.09, 0.09, 0.03, glowRed, 0.21, 0.27, 0.405);
    // corrupted pixels hovering over the head
    O.debris = new THREE.Group(); O.debris.position.y = 0.75; O.head.add(O.debris);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; B(O.debris, 0.08 + (i % 3) * 0.03, 0.08 + (i % 3) * 0.03, 0.08, i % 3 ? hide : glowRed, Math.cos(a) * 0.45, (i % 2) * 0.12, Math.sin(a) * 0.4); }
    this.eyeGlowPair(O.head, 0xff2020, 0.22, [[-0.2, 0.28, 0.44], [0.21, 0.27, 0.44]]);
    this.root.scale.setScalar(1.18);
    this.baseScale = 1.18;
    this.glowMats = [hide, inside];
    this.voxMats = [hide, mid, black, glowRed];
    this.voxSrc = [];
    this.body.traverse((o) => { if (o.isMesh && o.userData.vox) this.voxSrc.push(o); });
    this.initFx();
  }

  /** One small glow per eye (sharing a material, so dimming one dims both). */
  eyeGlowPair(parent, color, size, pts) {
    const mat = new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.extra.eyeGlows = pts.map(([x, y, z]) => { const g = new THREE.Sprite(mat); g.scale.set(size, size, 1); g.position.set(x, y, z); parent.add(g); return g; });
    this.extra.eyeGlow = this.extra.eyeGlows[0];
  }

  eyeGlowAt(parent, color, sx, sy, y, z) {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    g.scale.set(sx, sy, 1); g.position.set(0, y, z); parent.add(g); this.extra.eyeGlow = g;
  }

  /** Awakened: bigger, glowing, with a burning aura. */
  setAwake(on) {
    if (on === this.awake) return;
    this.awake = on;
    this.root.scale.setScalar((this.baseScale || 1) * (on ? 1.18 : 1));
    for (const m of this.glowMats || []) m.emissiveIntensity = (m.userData.base ??= m.emissiveIntensity) * (on ? 3 : 1);
    if (!this.aura) {
      this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: this.variant === 'glitch' ? 0xff1030 : this.variant === 'grin' ? 0xb0101a : 0xff2010, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.aura.scale.set(4.5, 5.5, 1); this.aura.position.y = 1.6; this.root.add(this.aura);
    }
    this.aura.visible = on;
    for (const g of this.extra.eyeGlows || (this.extra.eyeGlow ? [this.extra.eyeGlow] : [])) g.scale.multiplyScalar(on ? 1.8 : 1 / 1.8);
  }

  /** Animation for the organic monsters (EXE and Grin). s: same as update(). */
  updateOrganic(dt, s) {
    const O = this.O, ex = this.organic === 'exe', k = 18;
    this.spawnFx(dt, s);
    if (!ex) {
      // Grin moves in stop-motion: its pose only updates every few frames, and snaps
      for (const f of O.floaters) f.m.position.set(f.base.x + Math.sin(this.t * 2 + f.ph) * 0.05, f.base.y + Math.sin(this.t * 1.6 + f.ph) * 0.07, f.base.z);
      O.debris.rotation.y += dt * 0.8;
      if (this.aura) this.aura.material.opacity = 0.4 + Math.sin(this.t * 9) * 0.15;
      this.stepAcc = (this.stepAcc || 0) + dt;
      if (this.stepAcc < (this.stepLen || 0.1)) return;
      dt = this.stepAcc; this.stepAcc = 0; this.stepLen = 0.06 + Math.random() * 0.08;
      this.body.position.x = Math.random() < 0.25 ? (Math.random() - 0.5) * 0.08 : 0;
    }
    const R = (o, ax, v, rate = k) => { o.rotation[ax] = damp(o.rotation[ax], v, rate, dt); };
    const speed = s.speed || 0, run = Math.min(1.4, speed / (ex ? 9 : 7));
    this.ph += dt * (ex ? 2.2 + speed * 1.15 : 1.6 + speed * 0.9);
    const sw = Math.sin(this.ph), sw2 = Math.sin(this.ph + Math.PI);
    if (this.aura) this.aura.material.opacity = 0.4 + Math.sin(this.t * 9) * 0.15;
    // twitch: the head snaps to a new angle now and then
    this.twitchT -= dt;
    if (this.twitchT <= 0) { this.twitch = 0.15; this.twitchT = 1.2 + Math.random() * 2.5; this.twitchZ = (Math.random() - 0.5) * 0.9; this.twitchY = (Math.random() - 0.5) * 0.8; }
    if (this.twitch > 0) this.twitch -= dt;
    // spinning ball (EXE's Spin Rush)
    if (s.spin) {
      this.body.rotation.x += dt * 24; this.body.position.y = damp(this.body.position.y, 0.7, 12, dt);
      for (const L of O.legs) { R(L.hip, 'x', -1.6); R(L.knee, 'x', 2.4); }
      for (const A of O.arms) { R(A.sh, 'x', -1.2); R(A.elbow, 'x', -1.8); }
      R(O.spine, 'x', 1.0); R(O.head, 'x', 0.6);
      this.emitPuffs(dt, 12);
      return;
    }
    this.body.rotation.x = damp(this.body.rotation.x % (Math.PI * 2), 0, 10, dt);
    this.body.position.y = damp(this.body.position.y, Math.abs(sw) * 0.05 * run, 12, dt);
    // legs
    O.legs.forEach((L, i) => {
      const ph = i ? sw : sw2, lift = Math.max(0, Math.sin(this.ph + (i ? 0 : Math.PI) + 1.2));
      if (ex) { R(L.hip, 'x', -0.45 + ph * 0.95 * run); R(L.knee, 'x', 1.15 + lift * 0.9 * run); R(L.ankle, 'x', -0.95 - lift * 0.4 * run); R(L.toe, 'x', 0.25); }
      else { R(L.hip, 'x', -0.12 + ph * 0.55 * run); R(L.knee, 'x', 0.28 + lift * 0.6 * run); R(L.ankle, 'x', -0.16); }
    });
    // body lean and arms
    let lean = ex ? 0.12 + run * 0.4 : 0.55 + run * 0.12, headX = ex ? -0.12 - run * 0.3 : -0.55, armX = [0, 0], elbowX = ex ? -0.45 : -0.35, armZ = 0.18;
    if (ex) {
      if (run > 0.8) { armX = [1.25, 1.25]; elbowX = -0.15; armZ = 0.12; } // arms swept back at full speed
      else { armX = [sw * 0.6 * run, sw2 * 0.6 * run]; }
    } else { armX = [0.2 + sw2 * 0.35 * run, 0.2 + sw * 0.35 * run]; elbowX = -0.25 - run * 0.2; armZ = 0.12; }
    if (s.lunge || s.dash) { lean = 0.95; armX = [-1.0, -1.0]; elbowX = -0.1; headX = -0.6; }
    if (s.reach >= 0 && !ex) { armX[1] = -1.5; elbowX = 0; }
    if (s.atk >= 0) {
      const p = s.atk;
      if (ex) { const a = (this.slash = this.slash ?? 0); armX[a] = -2.5 + p * 3.3; armX[1 - a] = 0.6 - p * 0.6; lean = 0.35 + p * 0.25; if (p > 0.95) this.slash = 1 - a; }
      else { armX = [-2.8 + p * 3.2, -2.8 + p * 3.2]; lean = 0.2 + p * 0.5; }
    }
    if (s.stun) { headX = 0.3; armX = [0.3, 0.3]; lean = -0.1; }
    R(O.spine, 'x', lean * 0.55); R(O.chest, 'x', lean * 0.45);
    O.arms.forEach((A, i) => {
      R(A.sh, 'x', armX[i]); R(A.sh, 'z', A.sd * armZ); R(A.elbow, 'x', elbowX);
      if (A.claws) for (const c of A.claws) R(c, 'x', s.atk >= 0 ? 0.6 : 0.25 + Math.sin(this.t * 3 + c.position.x * 20) * 0.08);
      const reach = s.reach >= 0 && !ex && i === 1 ? Math.sin(Math.min(1, s.reach) * Math.PI) * 2.4 : 0;
      A.sh.scale.y = damp(A.sh.scale.y, 1 + reach, 20, dt);
    });
    R(O.head, 'x', headX + (s.stun ? Math.sin(this.t * 13) * 0.3 : 0));
    O.head.rotation.z = this.twitch > 0 ? this.twitchZ : damp(O.head.rotation.z, s.stun ? Math.sin(this.t * 11) * 0.4 : 0, 10, dt);
    O.head.rotation.y = this.twitch > 0 ? this.twitchY : damp(O.head.rotation.y, 0, 8, dt);
    // EXE's quills stream back and its grin cracks open; Grin's whole head splits open when it attacks
    if (ex) {
      O.quills.forEach((chain, i) => chain.forEach((j, n) => { if (n) j.rotation.x = 0.16 - run * 0.07 + Math.sin(this.t * (4 + run * 9) - n * 0.8 + i * 1.7) * (0.025 + run * 0.035); }));
      const open = s.atk >= 0 ? 0.12 + Math.sin(Math.min(1, s.atk) * Math.PI) * 0.42 : s.lunge || s.dash ? 0.38 : this.awake ? 0.3 : 0.02 + Math.max(0, Math.sin(this.t * 0.7)) ** 12 * 0.3;
      R(O.jaw, 'x', open, 14);
      O.mouth.scale.y = 0.05 + O.jaw.rotation.x * 1.5;
      for (const d of O.drips) { const p = (this.t * 0.45 + d.ph) % 1; d.m.position.y = -0.03 - p * 0.14; d.m.scale.setScalar(p > 0.92 ? 0.01 : 1); }
      if (speed > 6) this.emitPuffs(dt, speed);
    } else R(O.jaw, 'x', s.atk >= 0 ? 0.25 + Math.sin(Math.min(1, s.atk) * Math.PI) * 0.7 : this.awake ? 0.55 : run > 0.6 ? 0.3 : 0.17 + Math.sin(this.t * 1.3) * 0.05, 30);
  }

  // ---------------------------------------------------------------- trails left in the world
  initFx() {
    this.fxOn = true; this.trailT = 0; this.dripT = 0.5; this.voxT = 0; this.flickT = 1; this.flick = null;
    this.pools = { ghost: [], drip: [], vox: [] };
    FX_RIGS.add(this);
  }

  /** EXE leaves red and black afterimages and blood drips; Grin crumbles into voxels that snap back. */
  spawnFx(dt, s) {
    if (this.flick && this.t > this.flick.until) { this.flick.m.visible = true; this.flick.m.position.x = this.flick.x; this.flick = null; }
    if (!this.fxOn || !this.root.parent || this.opacity < 0.5) return;
    const speed = s.speed || 0;
    if (this.organic === 'exe') {
      this.trailT -= dt;
      if (this.trailT <= 0 && (speed > 7.5 || s.dash || s.lunge || s.spin)) { this.trailT = Rig.lowFx ? 0.1 : 0.06; this.spawnGhost(); }
      this.dripT -= dt;
      if (this.dripT <= 0 && !s.air) { this.dripT = speed > 1 ? 0.3 : 1.3; this.spawnDrip(); }
    } else {
      this.voxT -= dt;
      if (this.voxT <= 0) { this.voxT = Rig.lowFx ? 0.2 : 0.1; this.spawnVoxel(); }
      this.flickT -= dt;
      if (this.flickT <= 0 && !this.flick) {
        this.flickT = 0.4 + Math.random() * 1.2;
        const m = this.voxSrc[Math.floor(Math.random() * this.voxSrc.length)];
        this.flick = { m, x: m.position.x, until: this.t + 0.06 + Math.random() * 0.1 };
        if (Math.random() < 0.5) m.visible = false; else m.position.x += (Math.random() - 0.5) * 0.25;
      }
    }
  }

  fxItem(kind, max, make) {
    const P = this.pools[kind];
    let it = P.find((q) => !q.on);
    if (!it && P.length < max) { it = make(P.length); it.kind = kind; P.push(it); }
    if (!it) it = P.reduce((a, b) => (a.age > b.age ? a : b));
    if (it.obj.parent !== this.root.parent) this.root.parent.add(it.obj);
    it.on = true; it.age = 0; it.w = this.world; it.obj.visible = true;
    return it;
  }

  spawnGhost() {
    if (!this.trailMeshes) {
      this.trailMeshes = [];
      this.body.traverse((o) => { if (o.isMesh && !o.userData.noTrail) { o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) > 0.13) this.trailMeshes.push(o); } });
    }
    const it = this.fxItem('ghost', Rig.lowFx ? 3 : 6, (n) => {
      const red = n % 2 === 0, mat = new THREE.MeshBasicMaterial({ color: red ? 0xb0000c : 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
      const g = new THREE.Group();
      for (const m of this.trailMeshes) { const c = new THREE.Mesh(m.geometry, mat); c.matrixAutoUpdate = false; g.add(c); }
      return { obj: g, mat, red };
    });
    it.life = 0.32;
    this.trailMeshes.forEach((m, i) => it.obj.children[i].matrix.copy(m.matrixWorld));
  }

  spawnDrip() {
    const it = this.fxItem('drip', 18, () => {
      const mat = new THREE.MeshBasicMaterial({ map: splatTex(), color: 0x8a0008, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      return { obj: m, mat };
    });
    const p = this.root.position;
    it.obj.position.set(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.035, p.z + (Math.random() - 0.5) * 0.5);
    it.obj.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    it.size = 0.3 + Math.random() * 0.35; it.life = 9;
  }

  spawnVoxel() {
    const it = this.fxItem('vox', Rig.lowFx ? 10 : 22, (n) => ({ obj: new THREE.Mesh(VOX_GEO, this.voxMats[n % this.voxMats.length]), from: new THREE.Vector3(), to: new THREE.Vector3(), vel: new THREE.Vector3() }));
    const src = this.voxSrc[Math.floor(Math.random() * this.voxSrc.length)], sc = this.root.scale.x;
    src.getWorldPosition(it.to);
    it.to.x += (Math.random() - 0.5) * 0.5 * sc; it.to.y += (Math.random() - 0.5) * 0.4 * sc; it.to.z += (Math.random() - 0.5) * 0.5 * sc;
    it.size = (0.07 + Math.random() * 0.09) * sc;
    it.reform = Math.random() < 0.45;
    it.vel.set((Math.random() - 0.5) * 2.2, Math.random() * 1.4, (Math.random() - 0.5) * 2.2);
    it.from.copy(it.to);
    if (it.reform) it.from.addScaledVector(it.vel, 0.7);
    it.obj.position.copy(it.from); it.obj.rotation.set(Math.random() * 3, Math.random() * 3, 0); it.obj.scale.setScalar(it.size);
    it.life = it.reform ? 0.45 : 0.9;
  }

  /** Ages this rig's trails. Called every frame for every rig (see tickRigFx), even hidden ones. */
  tickFx(dt, viewW) {
    for (const k in this.pools) for (const it of this.pools[k]) {
      if (!it.on) continue;
      it.age += dt;
      if (it.age >= it.life) { it.on = false; it.obj.visible = false; continue; }
      it.obj.visible = viewW == null || it.w == null || it.w === viewW;
      const a = it.age / it.life;
      if (k === 'ghost') it.mat.opacity = (1 - a) * (it.red ? 0.45 : 0.35);
      else if (k === 'drip') { it.obj.scale.setScalar(it.size * Math.min(1, 0.35 + it.age * 3)); it.mat.opacity = 0.85 * Math.min(1, (1 - a) / 0.3); }
      else if (it.reform) { it.obj.position.lerpVectors(it.from, it.to, 1 - (1 - a) ** 3); }
      else { it.vel.y -= 7 * dt; it.obj.position.addScaledVector(it.vel, dt); it.obj.rotation.x += dt * 6; it.obj.scale.setScalar(it.size * (1 - a)); }
    }
  }

  buildGlitch() {
    const tex = noiseTex('glitch-noise3', ['#070708', '#070708', '#121014', '#ff1a2a', '#8a0010', '#ffffff', '#2a0006']);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const body = this.mat(0xffffff, { map: tex, emissive: 0x2a0006, emissiveIntensity: 1 });
    const dark = this.mat(0x101018);
    this.skeleton({ torsoMats: body, armTop: body, armBottom: dark, sleeve: 0.6, legTop: body, shoe: dark, headMat: dark }, 1.3);
    this.root.scale.set(1.15, 1.24, 1.15);
    this.extra.glitchTex = tex;
    // pull the pieces apart so they float with gaps between them
    this.armL.position.x += 0.26; this.armR.position.x -= 0.26; this.armL.position.y += 0.06; this.armR.position.y += 0.06;
    this.legL.position.y -= 0.16; this.legR.position.y -= 0.16; this.legL.position.x += 0.06; this.legR.position.x -= 0.06;
    this.torso.position.y += 0.1; this.neck.position.y += 0.22;
    this.extra.parts = [this.torso, this.armL, this.armR, this.legL, this.legR, this.neck].map((o, i) => ({ o, base: o.position.clone(), ph: i * 1.7 }));
    // the head: an old CRT TV with a flickering face
    for (const c of this.head.children) c.visible = false;
    const plastic = this.mat(0x2a2628);
    const tv = new THREE.Mesh(rbox(0.86, 0.7, 0.64, 0.08), plastic); tv.position.y = 0.34; this.head.add(tv);
    const back = new THREE.Mesh(rbox(0.6, 0.5, 0.3, 0.06), plastic); back.position.set(0, 0.34, -0.42); this.head.add(back);
    const screenCanvas = canvas(160, 120), screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.magFilter = THREE.NearestFilter;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff1a1a })); led.position.set(0.35, 0.12, 0.33); this.head.add(led);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.5), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })); screen.position.set(-0.04, 0.35, 0.325); this.head.add(screen);
    for (let i = 0; i < 2; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), dark); k.rotation.x = Math.PI / 2; k.position.set(0.35, 0.44 - i * 0.14, 0.33); this.head.add(k); }
    for (const sd of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), dark); a.position.set(sd * 0.14, 0.92, -0.05); a.rotation.z = -sd * 0.5; this.head.add(a); }
    this.extra.screen = { c: screenCanvas, g: screenCanvas.getContext('2d'), tex: screenTex, t: 0, st: { frame: 0, hold: 0 } };
    drawTvFace(this.extra.screen.g, 0, false, this.extra.screen.st);
    // static cubes orbiting the torso
    const orbit = new THREE.Group(); orbit.position.y = U * 1.1; this.hips.add(orbit); this.extra.orbit = orbit;
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshBasicMaterial({ color: [0xff1a2a, 0x050505, 0xffffff, 0x8a0010][i % 4] }));
      const a = (i / 10) * Math.PI * 2; m.position.set(Math.cos(a) * 0.85, Math.sin(i * 1.3) * 0.5, Math.sin(a) * 0.85); orbit.add(m);
    }
    this.smoke = { color: 'rgba(255,26,42,', size: 0.35, rise: -0.6, square: true };
  }

  eyeGlow(color, sx, sy, y) {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    g.scale.set(sx, sy, 1); g.position.set(0, y, 0.34); this.head.add(g); this.extra.eyeGlow = g;
  }

  /** Smoke / pixel puffs left behind (EXE and Glitch.exe). */
  emitPuffs(dt, speed) {
    if (!this.smoke || !this.root.parent) return;
    this.puffT -= dt;
    if (this.puffT <= 0 && this.opacity > 0.5) {
      this.puffT = speed > 1 ? 0.06 : 0.22;
      let p = this.puffs.find((q) => q.life <= 0);
      if (!p && this.puffs.length < 26) {
        p = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smoke.square ? squareTex() : smokeTex(this.smoke.color), transparent: true, depthWrite: false, blending: this.smoke.streak ? THREE.AdditiveBlending : THREE.NormalBlending })), life: 0 };
        this.root.parent.add(p.s); this.puffs.push(p);
      }
      if (p) {
        p.life = 1; p.max = this.smoke.square ? 0.8 : 1.4;
        this.root.getWorldPosition(p.s.position);
        p.s.position.x += (Math.random() - 0.5) * 0.8; p.s.position.z += (Math.random() - 0.5) * 0.8; p.s.position.y += 0.5 + Math.random() * 2.2;
        p.vy = this.smoke.rise * (0.5 + Math.random());
      }
    }
    for (const p of this.puffs) {
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.life -= dt / p.max; p.s.visible = true;
      p.s.position.y += p.vy * dt;
      const k = this.smoke.size * (this.smoke.square ? 1 : 1.6 - p.life);
      if (this.smoke.streak) p.s.scale.set(k * 0.6, k * 2.2, 1); else p.s.scale.set(k, k, 1);
      p.s.material.opacity = Math.max(0, p.life) * (this.awake ? 1 : 0.8);
      if (this.smoke.square) p.s.material.rotation = 0;
    }
  }

  dispose() {
    for (const p of this.puffs || []) p.s.parent && p.s.parent.remove(p.s);
    this.puffs = [];
    if (this.pools) for (const k in this.pools) for (const it of this.pools[k]) { it.obj.parent && it.obj.parent.remove(it.obj); if (it.mat) it.mat.dispose(); }
    this.pools = { ghost: [], drip: [], vox: [] };
    FX_RIGS.delete(this);
  }

  setOpacity(o) {
    if (Math.abs(o - this.opacity) < 0.01) return;
    this.opacity = o;
    for (const m of this.mats) { m.transparent = o < 0.999 || !!m.map && m.alphaTest > 0; m.opacity = o; m.depthWrite = o > 0.5; }
    if (this.extra.eyeGlow) this.extra.eyeGlow.material.opacity = Math.max(o, 0.25);
  }

  /** s: { speed, air, fly, down, atk (0..1 or -1), stun, dash, lunge, sprint, ability (0..1 or -1) } */
  update(dt, s) {
    this.t += dt;
    if (s.awake !== undefined) this.setAwake(!!s.awake);
    if (this.avatar) { updateAvatar(this, dt, s); return; }
    if (this.organic) { this.updateOrganic(dt, s); if (this.extra.eyeGlow) this.extra.eyeGlow.material.opacity = (0.8 + Math.sin(this.t * 6) * 0.2) * Math.max(0.25, this.opacity); return; }
    const k = 16;
    const R = (o, ax, v) => { o.rotation[ax] = damp(o.rotation[ax], v, k, dt); };
    const speed = s.speed || 0;
    this.ph += dt * Math.min(speed, 14) * 1.25;
    const amp = Math.min(1, speed / 8) * (s.sprint ? 1.1 : 0.85);
    let legL = Math.sin(this.ph) * amp, legR = -legL, armL = -legL * 0.9, armR = legL * 0.9, armLz = 0.06, armRz = -0.06, pitch = 0, headX = 0, headZ = 0, bodyY = Math.abs(Math.sin(this.ph)) * 0.06 * amp;
    if (speed < 0.3) { const b = Math.sin(this.t * 1.7); armL = b * 0.04; armR = -b * 0.04; bodyY = b * 0.012; }
    if (s.sprint && speed > 4) pitch = 0.12;
    if (s.air && !s.fly) { legL = -0.7; legR = 0.35; armL = -0.5; armR = -0.5; armLz = 0.5; armRz = -0.5; }
    if (s.fly) { armLz = 1.25; armRz = -1.25; armL = 0; armR = 0; legL = 0.25; legR = 0.05; pitch = 0.22; }
    if (s.dash) { pitch = 0.45; armL = 1.2; armR = 1.2; legL = 0.9; legR = -0.6; }
    if (this.role === 'exe') {
      pitch += this.extra.hunch ? 0.3 : 0.2; headX = this.extra.hunch ? -0.32 : -0.15;
      if (speed > 1) { armL = -legL * 0.4 + 0.5; armR = legL * 0.4 + 0.5; armLz = 0.2; armRz = -0.2; }
      this.twitchT -= dt;
      if (this.twitchT <= 0) { this.twitch = 0.18; this.twitchT = 1.5 + Math.random() * 3; this.twitchZ = (Math.random() - 0.5) * 1.1; }
      if (this.twitch > 0) { this.twitch -= dt; headZ = this.twitchZ; }
      if (s.lunge) { pitch = 0.6; armL = -1.5; armR = -1.5; armLz = 0.3; armRz = -0.3; }
    }
    if (s.atk >= 0) {
      const p = s.atk;
      if (this.role === 'exe') { armR = -2.7 + p * 3.4; armRz = -0.3; armL = -1.4 + p * 1.2; pitch = 0.2 + p * 0.25; }
      else if (this.char === 'rook') { armR = -1.6; armRz = 0; pitch = -0.1; }
      else if (this.char === 'mira') { armR = -2.9 + p * 3.0; armL = -2.9 + p * 3.0; armLz = 0.1; armRz = -0.1; }
    }
    if (s.stun) { headZ = Math.sin(this.t * 14) * 0.35; armLz = 0.7; armRz = -0.7; armL = -0.3; armR = -0.3; pitch = -0.1; }
    let down = 0;
    if (s.down) { down = 1; const c = Math.sin(this.t * 3) * (speed > 0.2 ? 0.8 : 0.1); armL = -2.6 + c; armR = -2.6 - c; legL = c * 0.4; legR = -c * 0.4; armLz = 0.25; armRz = -0.25; pitch = 0; headX = -0.5; }
    R(this.legL, 'x', legL); R(this.legR, 'x', legR);
    R(this.armL, 'x', armL); R(this.armR, 'x', armR); R(this.armL, 'z', armLz); R(this.armR, 'z', armRz);
    R(this.neck, 'x', headX); this.neck.rotation.z = this.role === 'exe' && this.twitch > 0 ? headZ : damp(this.neck.rotation.z, headZ, 10, dt);
    R(this.hips, 'x', pitch);
    this.body.rotation.x = damp(this.body.rotation.x, down * (Math.PI / 2 - 0.08), 10, dt);
    this.body.position.y = damp(this.body.position.y, down ? 0.26 : bodyY, 12, dt);
    this.body.position.z = damp(this.body.position.z, down ? -1.0 : 0, 10, dt);
    if (this.extra.tails) for (const [i, t] of this.extra.tails.entries()) {
      const sp = Math.min(1, speed / 10), flap = Math.sin(this.t * 9 + i * 2) * (0.08 + 0.14 * sp);
      const target = t.userData.back === 0 ? 0.1 + sp * 0.5 + flap : t.userData.back === 1 ? -0.08 - sp * 1.0 + flap : -0.15 - sp * 0.9 + flap;
      t.rotation.x = damp(t.rotation.x, target, 10, dt);
    }
    if (this.extra.prop) { this.extra.prop.rotation.y += dt * (s.fly ? 45 : 2.5); this.extra.flame.visible = !!s.fly; if (s.fly) this.extra.flame.scale.y = 0.8 + Math.random() * 0.5; }
    if (this.extra.mallet) { const inHand = s.atk >= 0; if (inHand !== this.extra.malletIn) { this.extra.malletIn = inHand; inHand ? this.extra.malletHand() : this.extra.malletBack(); } }
    if (this.extra.glitchTex) {
      if (Math.random() < 0.3) this.extra.glitchTex.offset.set(Math.random(), Math.random());
      for (const p of this.extra.parts) {
        const j = Math.random() < 0.05 ? (Math.random() - 0.5) * 0.3 : 0;
        p.o.position.set(p.base.x + j, p.base.y + Math.sin(this.t * 3 + p.ph) * 0.05, p.base.z);
      }
      this.extra.orbit.rotation.y += dt * (2 + speed * 0.3); this.extra.orbit.rotation.x = Math.sin(this.t) * 0.3;
      const sc = this.extra.screen; sc.t -= dt;
      if (sc.t <= 0) { sc.t = 0.07; drawTvFace(sc.g, this.t, s.atk >= 0 || s.lunge || s.dash, sc.st); sc.tex.needsUpdate = true; }
    }
    if (this.extra.jaw) {
      const open = s.atk >= 0 ? Math.sin(Math.min(1, s.atk) * Math.PI) * 0.9 + 0.2 : speed > 6 ? 0.25 + Math.sin(this.t * 8) * 0.08 : 0.04;
      this.extra.jaw.rotation.x = damp(this.extra.jaw.rotation.x, open, 18, dt);
    }
    if (this.role === 'exe') this.emitPuffs(dt, speed);
    if (this.extra.eyeGlow) this.extra.eyeGlow.material.opacity = (0.75 + Math.sin(this.t * 6) * 0.2) * Math.max(0.25, this.opacity);
  }
}

function std(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...extra }); }
/** A joint (empty group) at x, y, z under parent. */
function J(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
/** A capsule standing up from (0, y0) of its parent: used for body parts that point up. */
function capsule(parent, r, len, mat, y0 = 0) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 14), mat); m.position.y = y0 + (y0 >= 0 ? len / 2 : -len / 2); parent.add(m); return m; }
/** A limb segment hanging down from parent; returns the joint at its end (elbow, knee, ...). */
function seg(parent, r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 14), mat); m.position.y = -(len / 2 + r * 0.4); parent.add(m);
  const end = new THREE.Group(); end.position.y = -(len + r * 0.6); parent.add(end); return end;
}
function cone(parent, r, h, mat) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat); parent.add(m); return m; }

function crackTex() {
  return canvasTex('exe-cracks', 128, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 1 + Math.random() * 2; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 34; y += (Math.random() - 0.3) * 26; g.lineTo(x, y); }
      g.stroke();
    }
  });
}
const smokeCache = new Map();
function smokeTex(rgbaPrefix) {
  if (smokeCache.has(rgbaPrefix)) return smokeCache.get(rgbaPrefix);
  const c = canvas(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, rgbaPrefix + '0.9)'); r.addColorStop(0.6, rgbaPrefix + '0.4)'); r.addColorStop(1, rgbaPrefix + '0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); smokeCache.set(rgbaPrefix, t); return t;
}
let square = null;
function squareTex() {
  if (square) return square;
  const c = canvas(16, 16), g = c.getContext('2d'); g.fillStyle = '#ff1a2a'; g.fillRect(2, 2, 12, 12); g.fillStyle = '#050505'; g.fillRect(6, 6, 6, 6);
  square = new THREE.CanvasTexture(c); square.magFilter = THREE.NearestFilter; return square;
}
// ------------------------------------------------------------------ monster trails, shared by every rig
const FX_RIGS = new Set();
/** Ages every monster's afterimages, blood drips and voxels. viewW: the world on screen (trails from the other one hide). */
export function tickRigFx(dt, viewW) { for (const r of FX_RIGS) r.tickFx(dt, viewW); }
const VOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
/** A cone whose base sits at (bx, by, bz), pointing along (dx, dy, dz). */
function spike(parent, bx, by, bz, dx, dy, dz, r, h, mat) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat), d = new THREE.Vector3(dx, dy, dz).normalize();
  m.quaternion.setFromUnitVectors(UP, d);
  m.position.set(bx + (d.x * h) / 2, by + (d.y * h) / 2, bz + (d.z * h) / 2);
  parent.add(m); return m;
}
/** One tapering piece of a quill, hanging along the joint's -y; returns the joint at its tip. */
function qseg(parent, r0, r1, len, mat, noTrail) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 6), mat);
  m.position.y = -len / 2; m.userData.noTrail = noTrail; parent.add(m);
  const end = new THREE.Group(); end.position.y = -len * 0.9; parent.add(end); return end;
}
/** A tiny blocky texture of rough grey voxels; colors null = just a few dead red pixels on black (for glow). */
function voxTex(key, colors) {
  const t = canvasTex('vox:' + key, 16, 16, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dead = Math.random() < 0.05;
      if (colors) { g.fillStyle = dead ? '#7a0010' : colors[Math.floor(Math.random() * colors.length)]; g.fillRect(x, y, 1, 1); }
      else if (dead) { g.fillStyle = '#ff2030'; g.fillRect(x, y, 1, 1); }
    }
  });
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
function furTex() {
  const t = canvasTex('exe-fur', 128, 128, (g, w, h) => {
    g.fillStyle = '#2f3139'; g.fillRect(0, 0, w, h);
    const cols = ['#3e414c', '#24262d', '#1b1c22', '#4a4d58', '#34363f'];
    g.lineWidth = 1.4;
    for (let i = 0; i < 1100; i++) {
      const x = Math.random() * w, y = Math.random() * h, l = 4 + Math.random() * 7, a = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
      g.strokeStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 12, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(110,0,10,0.75)'); gr.addColorStop(1, 'rgba(110,0,10,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return t;
}
let splat = null;
function splatTex() {
  if (splat) return splat;
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill();
  for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, d = 12 + Math.random() * 14, r = 2 + Math.random() * 5; g.beginPath(); g.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, 7); g.fill(); }
  splat = new THREE.CanvasTexture(c);
  return splat;
}

// ------------------------------------------------------------------ Glitch.exe's face
// Three frames made for the game (staring, screaming, close-up), played back with black-and-red glitching.
export const GLITCH_FACES = typeof Image === 'undefined' ? [] : [1, 2, 3].map((n) => { const i = new Image(); i.decoding = 'async'; i.src = `img/glitch-face-${n}.jpg`; return i; });
const faceReady = (i) => i && i.complete && i.naturalWidth > 0;
export const glitchFacesReady = () => Promise.all(GLITCH_FACES.map((i) => (faceReady(i) ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));

/** Draws one glitched frame of a face image into g: cropped to fill, a red ghost beside it, tinted black and red,
 *  torn sideways in strips, with static and scanlines. power 0..1 makes it more broken. */
export function drawGlitchFrame(g, img, t, power = 0.3, boost = false) {
  const w = g.canvas.width, h = g.canvas.height;
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  if (faceReady(img)) {
    const iw = img.naturalWidth, ih = img.naturalHeight, z = 1 + power * 0.12 + Math.sin(t * 2) * 0.02;
    let sw = iw / z, sh = (sw * h) / w;
    if (sh > ih) { sh = ih / z; sw = (sh * w) / h; }
    const sx = (iw - sw) / 2 + (Math.random() < 0.12 ? (Math.random() - 0.5) * iw * 0.06 : 0), sy = (ih - sh) / 2;
    g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55 + power * 0.2;
    g.drawImage(img, sx, sy, sw, sh, 2 + Math.random() * (2 + power * 8) * (w / 160), 0, w, h);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1; g.fillStyle = '#ffa0a0'; g.fillRect(0, 0, w, h);
    // brighter for small screens: blend the picture over itself
    if (boost) { g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.9; g.drawImage(g.canvas, 0, 0); g.globalAlpha = 1; }
    g.globalCompositeOperation = 'source-over';
  }
  const n = Math.random() < 0.35 + power ? 2 + Math.floor(power * 6) : 0;
  for (let i = 0; i < n; i++) { const y = Math.random() * h, s = 2 + Math.random() * h * 0.08; g.drawImage(g.canvas, 0, y, w, s, (Math.random() - 0.5) * w * 0.2 * (0.4 + power), y, w, s); }
  const dots = Math.round((w * h) / 200);
  for (let i = 0; i < dots; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.6)' : 'rgba(255,60,60,0.35)'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1); }
  for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 1); }
  const ry = ((t * 40) % (h + 20)) - 10; g.fillStyle = 'rgba(255,40,40,0.08)'; g.fillRect(0, ry, w, h * 0.07);
}

/** Glitch.exe's TV: mostly the staring face, the scream when it attacks, and short flashes of the others. */
function drawTvFace(g, t, angry, st) {
  if (st.hold > 0) st.hold--;
  else {
    const r = Math.random();
    st.frame = angry ? (r < 0.75 ? 1 : 2) : r < 0.06 ? 1 : r < 0.12 ? 2 : 0;
    st.hold = st.frame === 0 ? 6 + Math.floor(Math.random() * 12) : 1 + Math.floor(Math.random() * 3);
  }
  if (Math.random() < 0.04) {
    // a burst of pure static
    const w = g.canvas.width, h = g.canvas.height;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 4) { const v = Math.random() * 255; g.fillStyle = `rgb(${v},${v * 0.15},${v * 0.15})`; g.fillRect(x, y, 4, 2); }
    return;
  }
  drawGlitchFrame(g, GLITCH_FACES[st.frame], t, angry ? 0.8 : 0.25, true);
}

let glow = null;
export function glowTex() {
  if (glow) return glow;
  const c = canvas(64, 64), g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
}

/** A monster's face filling a canvas: for the jumpscare and the locker struggle. Drawn small and blown up
 *  with crisp pixels. variant: 'exe' | 'glitch' | 'grin'. */
export function drawScareFace(g, w, h, variant = 'exe', t = 0) {
  if (variant === 'glitch') return drawGlitchFrame(g, GLITCH_FACES[Math.random() < 0.6 ? 1 : 2], t, 0.9);
  g.save();
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.52, R = Math.min(h * 0.34, w * 0.2);
  if (variant === 'grin') drawGrinFace(g, cx, cy, R); else drawExeFace(g, cx, cy, R);
  g.restore();
}

function drawExeFace(g, cx, cy, R) {
  const tri = (ax, ay, bx, by, px, py, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(px, py); g.closePath(); g.fill(); };
  // quills fanning out behind the head
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * (0.88 + (i / 12) * 1.24), L = R * (1.75 + (i % 3) * 0.3), b = R * 0.75;
    tri(cx + Math.cos(a - 0.28) * b, cy + Math.sin(a - 0.28) * b, cx + Math.cos(a + 0.28) * b, cy + Math.sin(a + 0.28) * b, cx + Math.cos(a) * L, cy + Math.sin(a) * L, i % 2 ? '#1c1d23' : '#2c2e36');
    if (i % 3 === 0) { g.strokeStyle = '#5a0008'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx + Math.cos(a) * b, cy + Math.sin(a) * b); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke(); }
  }
  // ears
  for (const sd of [-1, 1]) { tri(cx + sd * R * 0.25, cy - R * 0.85, cx + sd * R * 0.8, cy - R * 0.5, cx + sd * R * 0.75, cy - R * 1.45, '#2c2e36'); tri(cx + sd * R * 0.38, cy - R * 0.8, cx + sd * R * 0.7, cy - R * 0.58, cx + sd * R * 0.68, cy - R * 1.2, '#5a0a10'); }
  g.fillStyle = '#30323a'; g.beginPath(); g.ellipse(cx, cy, R, R * 0.95, 0, 0, 7); g.fill();
  // red stains in the fur
  g.strokeStyle = 'rgba(120,0,10,0.8)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = R * (0.6 + Math.random() * 0.35); g.beginPath(); g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); g.lineTo(cx + Math.cos(a) * d + (Math.random() - 0.5) * 6, cy + Math.sin(a) * d + 3 + Math.random() * 5); g.stroke(); }
  // muzzle
  g.fillStyle = '#6e6662'; g.beginPath(); g.ellipse(cx, cy + R * 0.42, R * 0.78, R * 0.45, 0, 0, 7); g.fill();
  // hollow eyes with pin-prick pupils, angry brows, black tears
  for (const sd of [-1, 1]) {
    const ex = cx + sd * R * 0.38, ey = cy - R * 0.12;
    g.fillStyle = '#000'; g.beginPath(); g.ellipse(ex, ey, R * 0.3, R * 0.4, sd * 0.3, 0, 7); g.fill();
    g.strokeStyle = '#15161b'; g.lineWidth = Math.max(2, R * 0.08); g.beginPath(); g.moveTo(ex - sd * R * 0.32, ey - R * 0.5); g.lineTo(ex + sd * R * 0.3, ey - R * 0.3); g.stroke();
    g.strokeStyle = '#000'; g.lineWidth = Math.max(1, R * 0.05); g.beginPath(); g.moveTo(ex + sd * R * 0.06, ey + R * 0.3); g.lineTo(ex + sd * R * 0.1, ey + R * 0.75); g.stroke();
    g.fillStyle = '#000'; g.fillRect(ex + sd * R * 0.1 - 1, ey + R * 0.75, 2, 3);
    const px = ex - sd * R * 0.04, py = ey - R * 0.02, gl = g.createRadialGradient(px, py, 0, px, py, R * 0.11);
    gl.addColorStop(0, 'rgba(255,30,20,0.9)'); gl.addColorStop(1, 'rgba(255,30,20,0)');
    g.fillStyle = gl; g.fillRect(px - R * 0.11, py - R * 0.11, R * 0.22, R * 0.22);
    g.fillStyle = '#ff3a2a'; g.fillRect(Math.round(px - 1), Math.round(py - 1), 2, 2);
  }
  g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx, cy + R * 0.16, R * 0.11, R * 0.08, 0, 0, 7); g.fill();
  // the grin: a crescent right across the face, full of needle teeth
  const L = cx - R * 0.86, Rr = cx + R * 0.86, top = cy + R * 0.26;
  const upper = (x) => top + R * 0.3 * (1 - ((x - cx) / (R * 0.86)) ** 2), lower = (x) => top + R * 0.62 * (1 - ((x - cx) / (R * 0.86)) ** 2);
  g.fillStyle = '#2a0004'; g.beginPath(); g.moveTo(L, top);
  for (let x = L; x <= Rr; x += 2) g.lineTo(x, upper(x));
  for (let x = Rr; x >= L; x -= 2) g.lineTo(x, lower(x));
  g.closePath(); g.fill();
  g.fillStyle = '#efe6d6';
  const n = 15, tw = (Rr - L) / n;
  for (let i = 0; i < n; i++) {
    const x = L + (i + 0.5) * tw, u = upper(x), d = lower(x), gap = d - u;
    g.beginPath(); g.moveTo(x - tw * 0.45, u); g.lineTo(x + tw * 0.45, u); g.lineTo(x, u + gap * 0.62); g.fill();
    if (i < n - 1) { const x2 = x + tw / 2, d2 = lower(x2), u2 = upper(x2); g.beginPath(); g.moveTo(x2 - tw * 0.45, d2); g.lineTo(x2 + tw * 0.45, d2); g.lineTo(x2, d2 - (d2 - u2) * 0.55); g.fill(); }
  }
  g.strokeStyle = '#6a0008'; g.lineWidth = 1;
  for (const k of [0.2, 0.45, 0.62, 0.85]) { const x = L + (Rr - L) * k, y = lower(x); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 3 + Math.random() * R * 0.25); g.stroke(); }
}

function drawGrinFace(g, cx, cy, R) {
  const W = R * 1.25, top = cy - R * 0.95, split = cy + R * 0.22, bot = cy + R * 1.05;
  // a heavy block head, made of rough voxels
  for (let y = top; y < bot; y += 4) for (let x = cx - W; x < cx + W; x += 4) { const v = Math.random(); g.fillStyle = v < 0.15 ? '#1e1b22' : v < 0.3 ? '#3a3540' : '#2c2830'; g.fillRect(x, y, 4, 4); }
  // the split: glowing red inside, teeth on both sides, wide open all the way across
  const gap = R * 0.42, gr = g.createLinearGradient(0, split, 0, split + gap);
  gr.addColorStop(0, '#3a0004'); gr.addColorStop(0.5, '#ff1a1a'); gr.addColorStop(1, '#3a0004');
  g.fillStyle = gr; g.fillRect(cx - W, split, W * 2, gap);
  g.fillStyle = '#eee6d4';
  for (let x = cx - W + 2, i = 0; x < cx + W - 4; x += 7, i++) { g.fillRect(x, split, 4, gap * (0.3 + (i % 3) * 0.12)); g.fillRect(x + 3, split + gap * (0.62 - (i % 2) * 0.1), 4, gap * (0.38 + (i % 2) * 0.1)); }
  // mismatched square eyes
  const eye = (x, y, s) => { g.fillStyle = '#000'; g.fillRect(x - s * 0.72, y - s * 0.72, s * 1.44, s * 1.44); g.fillStyle = '#ff1a22'; g.fillRect(x - s / 2, y - s / 2, s, s); g.fillStyle = '#fff'; g.fillRect(x - s * 0.1, y - s * 0.2, Math.max(2, s * 0.25), Math.max(2, s * 0.25)); };
  eye(cx - R * 0.5, cy - R * 0.38, R * 0.42); eye(cx + R * 0.5, cy - R * 0.4, R * 0.24);
  // a crack from the grin up through the face
  g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + 2, split);
  [[-6, -R * 0.3], [5, -R * 0.55], [-4, -R * 0.85], [3, -R * 1.15]].forEach(([dx, dy]) => g.lineTo(cx + dx, split + dy)); g.stroke();
  g.strokeStyle = '#ff2a2a'; g.lineWidth = 1; g.stroke();
  // pieces of the picture slipping sideways, and loose dead pixels
  for (let i = 0; i < 4; i++) { const y = top + Math.random() * (bot - top), s = 3 + Math.random() * 8; g.drawImage(g.canvas, 0, y, g.canvas.width, s, (Math.random() - 0.5) * 18, y, g.canvas.width, s); }
  for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#ff1a22' : '#2c2830'; const s = 2 + Math.random() * 5; g.fillRect(cx + (Math.random() - 0.5) * W * 3, cy + (Math.random() - 0.5) * R * 2.6, s, s); }
}

// shared with avatar.js
export { rbox, canvasTex, drawShirt, shade };
