// Blocky avatars (R6-style: head, torso, two arms, two legs) with custom clothes and faces,
// each survivor's own accessories, and the three EXE monsters. Animation is procedural.
import * as THREE from 'three';
import { CHARS } from '../shared/rules.js';
import { damp } from '../shared/util.js';

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

// ------------------------------------------------------------------ the rig
export class Rig {
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

  buildSurvivor(look, char) {
    const L = look;
    const skin = this.mat(L.skin), shirt = this.mat(L.shirt), pants = this.mat(L.pants), shoe = this.mat(shade(L.pants, 0.45));
    const front = this.mat(0xffffff, { map: canvasTex(`shirt:${L.shirt}:${L.pattern}:${L.style}`, 128, 128, (g, w, h) => { drawShirt(g, w, h, L.shirt, L.pattern); if (L.style === 'hoodie') { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(w * 0.2, h * 0.7, w * 0.6, h * 0.22); } }) });
    const sleeve = L.style === 'tee' ? 0.38 : L.style === 'tank' ? 0 : 1;
    this.skeleton({ torsoMats: [shirt, shirt, shirt, shirt, front, shirt], armTop: shirt, armBottom: skin, sleeve, legTop: pants, shoe, headMat: skin });
    this.faceOn(L.face);
    this.hat(L.hat, L.hatColor, char);
    if (L.style === 'hoodie') { const hood = new THREE.Mesh(rbox(0.7, 0.28, 0.32, 0.1), shirt); hood.position.set(0, 2 * U + 0.06, -0.26); this.hips.add(hood); }
    this.accessories(char);
  }

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

  accessories(char) {
    const acc = CHARS[char].accent;
    const accent = this.mat(acc), dark = this.mat(0x1d1d24), white = this.mat(0xf2f2f2);
    if (char === 'bolt') {
      // scarf with two tails that stream behind, lightning sneakers, wristbands
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 8, 18), accent); ring.rotation.x = Math.PI / 2; ring.position.y = 2 * U + 0.02; this.hips.add(ring);
      this.extra.tails = [0, 1].map((i) => { const g = new THREE.Group(); g.position.set(i ? -0.1 : 0.12, 2 * U, -0.22); const m = new THREE.Mesh(rbox(0.16, 0.06, 0.62, 0.02), accent); m.position.z = -0.3; g.add(m); this.hips.add(g); return g; });
      for (const leg of [this.legL, this.legR]) {
        const f = leg.userData.foot; f.material = white;
        const stripe = new THREE.Mesh(rbox(0.47, 0.05, 0.2, 0.01), accent); stripe.position.set(0, 0.04, 0.08); f.add(stripe);
        const sole = new THREE.Mesh(rbox(0.47, 0.05, 0.52, 0.01), this.mat(0xd22b2b)); sole.position.y = -0.07; f.add(sole);
      }
      for (const arm of [this.armL, this.armR]) { const b = new THREE.Mesh(rbox(U * 1.06, 0.12, U * 1.06, 0.03), white); b.position.y = 0.12; arm.userData.hand.add(b); }
      const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), lam(0xffffff, { map: canvasTex('bolt-emblem', 64, 64, (g) => { g.fillStyle = acc; g.beginPath(); g.moveTo(38, 4); g.lineTo(14, 36); g.lineTo(30, 36); g.lineTo(22, 60); g.lineTo(50, 24); g.lineTo(34, 24); g.closePath(); g.fill(); }), transparent: true }));
      emblem.position.set(0, U * 1.1, -U / 2 - 0.01); emblem.rotation.y = Math.PI; this.hips.add(emblem);
    } else if (char === 'pip') {
      // propeller backpack, goggles around the neck, tool belt with a wrench
      const pack = new THREE.Mesh(rbox(0.56, 0.6, 0.24, 0.06), accent); pack.position.set(0, U * 1.1, -0.34); this.hips.add(pack);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), dark); pole.position.set(0, U * 1.1 + 0.62, -0.38); this.hips.add(pole);
      const prop = new THREE.Group(); prop.position.set(0, U * 1.1 + 0.98, -0.38); this.hips.add(prop);
      for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(rbox(1.1, 0.03, 0.14, 0.01), white); b.rotation.y = i * Math.PI / 2; prop.add(b); }
      prop.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), accent));
      this.extra.prop = prop;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 10), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85 }));
      flame.rotation.x = Math.PI; flame.position.set(0, U * 1.1 - 0.5, -0.34); flame.visible = false; this.hips.add(flame); this.extra.flame = flame;
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 18), dark); strap.rotation.x = Math.PI / 2; strap.position.y = 2 * U - 0.01; this.hips.add(strap);
      for (const s of [-1, 1]) { const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 14), this.mat(0x9fe6ff, { emissive: 0x113344 })); lens.rotation.x = Math.PI / 2; lens.position.set(s * 0.12, 2 * U - 0.06, 0.28); this.hips.add(lens); }
      const belt = new THREE.Mesh(rbox(2 * U + 0.06, 0.12, U + 0.06, 0.03), this.mat(0x6b4426)); belt.position.y = 0.07; this.hips.add(belt);
      const wrench = new THREE.Group(); wrench.position.set(0.36, 0.0, 0.18); wrench.rotation.z = 0.3;
      const wh = new THREE.Mesh(rbox(0.07, 0.42, 0.05, 0.01), this.mat(0xb8c0cc)); wrench.add(wh);
      const wt = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 10, Math.PI * 1.5), this.mat(0xb8c0cc)); wt.position.y = 0.24; wrench.add(wt);
      this.hips.add(wrench);
    } else if (char === 'rook') {
      // giant knuckle gauntlets, a bandana, a shoulder plate
      for (const arm of [this.armL, this.armR]) {
        const g = new THREE.Mesh(rbox(0.6, 0.5, 0.6, 0.1), accent); g.position.y = -0.02; arm.userData.hand.add(g);
        for (let i = 0; i < 3; i++) { const k = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), white); k.rotation.x = Math.PI / 2; k.position.set(-0.17 + i * 0.17, -0.06, 0.32); arm.userData.hand.add(k); }
        const cuff = new THREE.Mesh(rbox(0.52, 0.12, 0.52, 0.03), white); cuff.position.y = 0.26; arm.userData.hand.add(cuff);
      }
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 20, 1, true), this.mat(acc, { side: THREE.DoubleSide })); band.position.y = 2 * U + 0.05; this.hips.add(band);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), accent); knot.position.set(0, 2 * U - 0.08, 0.3); knot.rotation.x = Math.PI; this.hips.add(knot);
      const plate = new THREE.Mesh(rbox(0.6, 0.18, 0.6, 0.06), dark); plate.position.set(0, 0.12, 0); this.armL.add(plate);
      for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), white); sp.position.set(-0.15 + i * 0.15, 0.3, 0); this.armL.add(sp); }
    } else if (char === 'mira') {
      // giant mallet (on her back, in her hands when she bonks), a bow, a heart badge
      const mallet = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), this.mat(0xf5d76e)); handle.position.y = 0.65; mallet.add(handle);
      const head = new THREE.Mesh(rbox(0.75, 0.5, 0.5, 0.12), accent); head.position.y = 1.4; head.rotation.z = Math.PI / 2; mallet.add(head);
      for (const s of [-1, 1]) { const band = new THREE.Mesh(rbox(0.1, 0.53, 0.53, 0.04), this.mat(0xffe66b)); band.position.set(s * 0.25, 1.4, 0); mallet.add(band); }
      this.extra.mallet = mallet;
      this.extra.malletBack = () => { this.hips.add(mallet); mallet.position.set(0.1, 0.1, -0.35); mallet.rotation.set(0, 0, 0.45); mallet.scale.setScalar(0.85); };
      this.extra.malletHand = () => { this.armR.userData.hand.add(mallet); mallet.position.set(0, -0.05, 0.1); mallet.rotation.set(Math.PI / 2, 0, 0); mallet.scale.setScalar(1); };
      this.extra.malletBack();
      const bow = new THREE.Group(); bow.position.set(0.24, 0.66, -0.05); bow.rotation.z = -0.4;
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 4), accent); w.rotation.z = (s * Math.PI) / 2; w.position.x = s * 0.12; bow.add(w); }
      bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), accent));
      this.head.add(bow);
      const hb = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 20, Math.PI), accent); hb.position.y = 0.52; hb.rotation.y = Math.PI / 2; this.head.add(hb);
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), lam(0xffffff, { map: canvasTex('heart-badge', 64, 64, (g) => { g.fillStyle = '#ffe66b'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill(); g.fillStyle = acc; g.beginPath(); g.moveTo(32, 50); g.bezierCurveTo(6, 32, 18, 10, 32, 24); g.bezierCurveTo(46, 10, 58, 32, 32, 50); g.fill(); }), transparent: true }));
      badge.position.set(0.2, U * 1.5, U / 2 + 0.012); this.hips.add(badge);
    }
  }

  buildExe(variant) {
    if (variant === 'glitch') {
      const tex = noiseTex('glitch-noise', ['#0b0b10', '#0b0b10', '#1a1a24', '#ff2a6a', '#2affea', '#ffffff']);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const body = this.mat(0xffffff, { map: tex, emissive: 0x220011 });
      const dark = this.mat(0x14141c);
      this.skeleton({ torsoMats: body, armTop: body, armBottom: dark, sleeve: 0.6, legTop: body, shoe: dark, headMat: body }, 1.35);
      this.faceOn('glitch');
      this.extra.glitchTex = tex;
      this.root.scale.set(1.2, 1.24, 1.2);
    } else if (variant === 'grin') {
      const pale = this.mat(0xcfc9be), dark = this.mat(0x1a1416), red = this.mat(0x5a0a0a);
      this.skeleton({ torsoMats: [pale, pale, pale, pale, pale, pale], armTop: pale, armBottom: pale, sleeve: 1, legTop: dark, shoe: dark, headMat: pale }, 1.65, 0.8);
      this.faceOn('grinexe', 1.12);
      this.root.scale.set(1.05, 1.36, 1.05);
      for (const arm of [this.armL, this.armR]) for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.34, 5), pale); f.position.set(-0.12 + i * 0.08, -0.2, 0); f.rotation.x = Math.PI; arm.userData.hand.add(f); }
      const rag = new THREE.Mesh(rbox(2 * U + 0.04, 0.5, U + 0.04, 0.04), red); rag.position.y = 0.2; this.hips.add(rag);
    } else {
      const skin = this.mat(0x151a2e), black = this.mat(0x07070b), claw = this.mat(0xe8e2d6), red = this.mat(0x6a0000);
      this.skeleton({ torsoMats: [skin, skin, skin, skin, skin, skin], armTop: skin, armBottom: black, sleeve: 0.55, legTop: skin, shoe: red, headMat: skin }, 1.45);
      this.faceOn('exe');
      this.root.scale.set(1.22, 1.26, 1.22);
      for (const arm of [this.armL, this.armR]) for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), claw); c.position.set(-0.13 + i * 0.13, -0.18, 0.06); c.rotation.x = Math.PI + 0.3; arm.userData.hand.add(c); }
      // jagged horns and a torn scarf
      const horn = (x, y, z, rx, rz, s) => { const h = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.6 * s, 6), black); h.position.set(x, y, z); h.rotation.set(rx, 0, rz); this.head.add(h); };
      horn(0.17, 0.66, -0.06, -0.5, -0.45, 1); horn(-0.17, 0.66, -0.06, -0.5, 0.45, 1); horn(0.09, 0.62, -0.2, -0.9, -0.2, 0.7); horn(-0.09, 0.62, -0.2, -0.9, 0.2, 0.7);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.08, 8, 18), red); ring.rotation.x = Math.PI / 2; ring.position.y = 2 * U + 0.02; this.hips.add(ring);
      this.extra.tails = [0, 1].map((i) => { const g = new THREE.Group(); g.position.set(i ? -0.12 : 0.1, 2 * U, -0.22); const m = new THREE.Mesh(rbox(0.18, 0.05, 0.9, 0.02), red); m.position.z = -0.45; g.add(m); this.hips.add(g); return g; });
    }
    // glowing eyes that read through fog
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: variant === 'glitch' ? 0xffffff : 0xff1010, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    eyeGlow.scale.set(0.62, 0.26, 1); eyeGlow.position.set(0, 0.36, 0.33); this.head.add(eyeGlow); this.extra.eyeGlow = eyeGlow;
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
      pitch += 0.18; headX = -0.15;
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
    if (this.extra.tails) for (const [i, t] of this.extra.tails.entries()) t.rotation.x = damp(t.rotation.x, -0.15 - Math.min(1, speed / 10) * 0.9 + Math.sin(this.t * 9 + i * 2) * 0.12 * Math.min(1, speed / 6), 10, dt);
    if (this.extra.prop) { this.extra.prop.rotation.y += dt * (s.fly ? 45 : 2.5); this.extra.flame.visible = !!s.fly; if (s.fly) this.extra.flame.scale.y = 0.8 + Math.random() * 0.5; }
    if (this.extra.mallet) { const inHand = s.atk >= 0; if (inHand !== this.extra.malletIn) { this.extra.malletIn = inHand; inHand ? this.extra.malletHand() : this.extra.malletBack(); } }
    if (this.extra.glitchTex) {
      if (Math.random() < 0.25) this.extra.glitchTex.offset.set(Math.random(), Math.random());
      const j = Math.random() < 0.12 ? 0.18 : 0;
      this.head.position.set((Math.random() - 0.5) * j, 0, (Math.random() - 0.5) * j);
      this.armL.position.x = 1.5 * U + (Math.random() < 0.06 ? 0.2 : 0);
    }
    if (this.extra.eyeGlow) this.extra.eyeGlow.material.opacity = (0.75 + Math.sin(this.t * 6) * 0.2) * Math.max(0.25, this.opacity);
  }
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

/** A face painted big, for the jumpscare. */
export function drawScareFace(g, w, h) {
  g.fillStyle = '#05060c'; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w / 2 - 80, h / 2 - 64); g.scale(1, 1);
  const c = canvas(160, 128), cg = c.getContext('2d');
  cg.fillStyle = '#151a2e'; cg.fillRect(0, 0, 160, 128);
  drawFace(cg, 'exe', 160, 128);
  g.restore();
  const s = Math.min(w / 160, h / 128) * 1.02;
  g.imageSmoothingEnabled = true;
  g.drawImage(c, (w - 160 * s) / 2, (h - 128 * s) / 2, 160 * s, 128 * s);
}
