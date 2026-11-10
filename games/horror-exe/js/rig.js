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
    this.puffs = []; this.puffT = 0;
    if (variant === 'glitch') this.buildGlitch();
    else if (variant === 'grin') this.buildGrin();
    else this.buildClassic();
  }

  /** EXE: tall and hunched, torn black coat, cracked porcelain mask, huge claws, red cracks, trailing smoke. */
  buildClassic() {
    const cracks = crackTex();
    const skin = this.mat(0x15151c, { emissive: 0xff2010, emissiveMap: cracks, emissiveIntensity: 1.2 });
    const coat = this.mat(0x0b0b10), lining = this.mat(0x5a0008, { side: THREE.DoubleSide }), mask = this.mat(0xe8e2d6), claw = this.mat(0xd8d0c0);
    this.skeleton({ torsoMats: coat, armTop: coat, armBottom: skin, sleeve: 0.62, legTop: coat, shoe: this.mat(0x07070a), headMat: mask }, 1.5);
    this.faceOn('exe');
    this.root.scale.set(1.22, 1.3, 1.22);
    // hood around the back of the mask, with a pointed tip
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.37, 0.72, 18, 1, true, Math.PI / 3 + 0.25, Math.PI * 2 - 2 * (Math.PI / 3 + 0.25)), this.mat(0x0b0b10, { side: THREE.DoubleSide }));
    hood.position.y = 0.34; this.head.add(hood);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), coat); top.position.set(0, 0.68, -0.04); top.scale.set(1, 0.5, 1.05); this.head.add(top);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), coat); tip.position.set(0, 0.72, -0.32); tip.rotation.x = -1.1; this.head.add(tip);
    // high collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.3, 14, 1, true, Math.PI / 4, Math.PI * 1.5), coat); collar.position.y = 2 * U + 0.1; this.hips.add(collar);
    // torn coat tails that stream behind
    this.extra.tails = [];
    for (const [x, z, len, back] of [[-0.24, -0.25, 1.25, 1], [0.24, -0.25, 1.15, 1], [0, -0.26, 1.35, 1], [-0.3, 0.24, 0.95, 0], [0.3, 0.24, 0.9, 0]]) {
      const g = new THREE.Group(); g.position.set(x, 0.12, z);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, len, 0.04), back ? coat : lining); strip.position.y = -len / 2; g.add(strip);
      for (let k = 0; k < 2; k++) { const rag = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 3), coat); rag.position.set(-0.08 + k * 0.16, -len - 0.08, 0); rag.rotation.x = Math.PI; g.add(rag); }
      g.userData.back = back; this.hips.add(g); this.extra.tails.push(g);
    }
    // big curved claws
    for (const arm of [this.armL, this.armR]) for (let i = 0; i < 4; i++) {
      const c = new THREE.Group(); c.position.set(-0.16 + i * 0.105, -0.12, 0.08); c.rotation.x = 0.35;
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 5), claw); a.position.y = -0.14; a.rotation.x = Math.PI; c.add(a);
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 5), claw); b.position.set(0, -0.36, 0.08); b.rotation.x = Math.PI - 0.6; c.add(b);
      arm.userData.hand.add(c);
    }
    this.eyeGlow(0xff1010, 0.6, 0.24, 0.36);
    this.smoke = { color: 'rgba(12,0,2,', size: 1.3, rise: 0.8 };
  }

  /** Glitch.exe: a broken-apart body floating in pieces, a CRT TV for a head, orbiting static cubes. */
  buildGlitch() {
    const tex = noiseTex('glitch-noise2', ['#0b0b10', '#0b0b10', '#141420', '#ff2a8a', '#2affea', '#ffffff', '#3a0a2a']);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const body = this.mat(0xffffff, { map: tex, emissive: 0x3a0a2a, emissiveIntensity: 1 });
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
    const plastic = this.mat(0xb8ae94);
    const tv = new THREE.Mesh(rbox(0.86, 0.7, 0.64, 0.08), plastic); tv.position.y = 0.34; this.head.add(tv);
    const back = new THREE.Mesh(rbox(0.6, 0.5, 0.3, 0.06), plastic); back.position.set(0, 0.34, -0.42); this.head.add(back);
    const screenCanvas = canvas(128, 96), screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.magFilter = THREE.NearestFilter;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.5), new THREE.MeshBasicMaterial({ map: screenTex })); screen.position.set(-0.04, 0.35, 0.325); this.head.add(screen);
    for (let i = 0; i < 2; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), dark); k.rotation.x = Math.PI / 2; k.position.set(0.35, 0.44 - i * 0.14, 0.33); this.head.add(k); }
    for (const sd of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), dark); a.position.set(sd * 0.14, 0.92, -0.05); a.rotation.z = -sd * 0.5; this.head.add(a); }
    this.extra.screen = { c: screenCanvas, g: screenCanvas.getContext('2d'), tex: screenTex, t: 0 };
    drawTvFace(this.extra.screen.g, 0);
    // static cubes orbiting the torso
    const orbit = new THREE.Group(); orbit.position.y = U * 1.1; this.hips.add(orbit); this.extra.orbit = orbit;
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshBasicMaterial({ color: [0xff2a8a, 0x2affea, 0xffffff, 0x111111][i % 4] }));
      const a = (i / 10) * Math.PI * 2; m.position.set(Math.cos(a) * 0.85, Math.sin(i * 1.3) * 0.5, Math.sin(a) * 0.85); orbit.add(m);
    }
    this.eyeGlow(0xffffff, 0.5, 0.3, 0.4);
    this.smoke = { color: 'rgba(255,42,138,', size: 0.35, rise: -0.6, square: true };
  }

  /** Grin.exe: very tall and thin, long neck, long fingers, a stitched grin whose jaw drops open. */
  buildGrin() {
    const pale = this.mat(0xd8d2c8), rag = this.mat(0x3a3438), dark = this.mat(0x1a1416), legs = this.mat(0x5a5258);
    this.skeleton({ torsoMats: [rag, rag, rag, rag, rag, rag], armTop: pale, armBottom: pale, sleeve: 0, legTop: legs, shoe: pale, headMat: pale }, 1.75, 0.72);
    this.root.scale.set(0.95, 1.42, 0.95);
    // a long neck
    this.neck.position.y += 0.34;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.42, 10), pale); neck.position.y = 2 * U + 0.18; this.hips.add(neck);
    // head: the top half has hollow eyes; the jaw is a separate piece that drops open
    for (const c of this.head.children) c.visible = false;
    const skull = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.4, 20), pale); skull.position.y = 0.48; this.head.add(skull);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), pale); cap.position.y = 0.68; cap.scale.y = 0.5; this.head.add(cap);
    const eyesTex = canvasTex('grin-eyes', 160, 80, (g, w, h) => {
      g.fillStyle = '#050505'; g.beginPath(); g.ellipse(w / 2 - 30, h / 2, 16, 20, 0, 0, 7); g.ellipse(w / 2 + 30, h / 2, 16, 20, 0, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2 - 28, h / 2 + 2, 2.5, 0, 7); g.arc(w / 2 + 32, h / 2 + 2, 2.5, 0, 7); g.fill();
    });
    const eyes = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.36, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3), lam(0xffffff, { map: eyesTex, transparent: true, alphaTest: 0.05 })); eyes.position.y = 0.48; this.head.add(eyes);
    const jaw = new THREE.Group(); jaw.position.set(0, 0.29, -0.22); this.head.add(jaw); this.extra.jaw = jaw;
    const mouthTex = canvasTex('grin-mouth', 200, 80, (g, w, h) => {
      g.fillStyle = '#d8d2c8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a0204'; g.beginPath(); g.moveTo(8, 10); g.quadraticCurveTo(w / 2, 30, w - 8, 10); g.lineTo(w - 20, 18); g.quadraticCurveTo(w / 2, 60, 20, 18); g.closePath(); g.fill();
      g.fillStyle = '#fbf6e8'; for (let i = 0; i < 15; i++) { const x = 16 + i * ((w - 32) / 14); g.fillRect(x - 3, 14 + Math.sin((i / 14) * Math.PI) * 10, 6, 8); }
      g.strokeStyle = '#3a0a0a'; g.lineWidth = 2; for (const sx of [12, w - 12]) for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(sx - 6, 6 + k * 6); g.lineTo(sx + 6, 10 + k * 6); g.stroke(); }
    });
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.27, 0.24, 20), pale);
    lower.position.set(0, -0.08, 0.22); jaw.add(lower);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.318, 0.278, 0.25, 16, 1, true, -Math.PI / 2.4, Math.PI / 1.2), lam(0xffffff, { map: mouthTex }));
    mouth.position.copy(lower.position); jaw.add(mouth);
    const inside = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), this.mat(0x2a0204)); inside.rotation.x = -Math.PI / 2; inside.position.set(0, 0.045, 0.22); jaw.add(inside);
    // stringy hair down the back
    for (let i = 0; i < 7; i++) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7 + Math.random() * 0.4, 0.03), dark); h.position.set(-0.24 + i * 0.08, 0.36, -0.3 + Math.abs(i - 3) * 0.02); this.head.add(h); }
    // long fingers
    for (const arm of [this.armL, this.armR]) for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.46, 5), pale); f.position.set(-0.13 + i * 0.065, -0.24, 0.02); f.rotation.x = Math.PI + 0.15; arm.userData.hand.add(f); }
    const tatter = new THREE.Mesh(rbox(2 * U + 0.06, 0.4, U + 0.06, 0.03), this.mat(0x5a0a0a)); tatter.position.y = 0.16; this.hips.add(tatter);
    this.extra.hunch = 0.32;
    this.eyeGlow(0xffffff, 0.22, 0.1, 0.48);
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
        p = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smoke.square ? squareTex() : smokeTex(this.smoke.color), transparent: true, depthWrite: false })), life: 0 };
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
      p.s.scale.set(k, k, 1); p.s.material.opacity = Math.max(0, p.life) * 0.8;
      if (this.smoke.square) p.s.material.rotation = 0;
    }
  }

  dispose() { for (const p of this.puffs || []) p.s.parent && p.s.parent.remove(p.s); this.puffs = []; }

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
      if (sc.t <= 0) { sc.t = 0.07; drawTvFace(sc.g, this.t, s.atk >= 0 || s.lunge); sc.tex.needsUpdate = true; }
    }
    if (this.extra.jaw) {
      const open = s.atk >= 0 ? Math.sin(Math.min(1, s.atk) * Math.PI) * 0.9 + 0.2 : speed > 6 ? 0.25 + Math.sin(this.t * 8) * 0.08 : 0.04;
      this.extra.jaw.rotation.x = damp(this.extra.jaw.rotation.x, open, 18, dt);
    }
    if (this.role === 'exe') this.emitPuffs(dt, speed);
    if (this.extra.eyeGlow) this.extra.eyeGlow.material.opacity = (0.75 + Math.sin(this.t * 6) * 0.2) * Math.max(0.25, this.opacity);
  }
}

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
  const c = canvas(16, 16), g = c.getContext('2d'); g.fillStyle = '#ff2a8a'; g.fillRect(2, 2, 12, 12); g.fillStyle = '#2affea'; g.fillRect(6, 6, 6, 6);
  square = new THREE.CanvasTexture(c); square.magFilter = THREE.NearestFilter; return square;
}
/** Glitch.exe's TV face: static, scanlines, two square eyes and a jagged grin; angry when attacking. */
function drawTvFace(g, t, angry) {
  const w = 128, h = 96;
  g.fillStyle = '#05060a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const v = Math.random() * 90; g.fillStyle = `rgb(${v},${v},${v + 10})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
  const shake = Math.random() < 0.2 ? (Math.random() - 0.5) * 14 : 0;
  g.save(); g.translate(shake, 0);
  const eye = angry ? '#ff2a4a' : '#ffffff';
  g.fillStyle = '#ff2a8a'; g.fillRect(30 + 2, 28, 18, 18); g.fillRect(80 + 2, 28, 18, 18);
  g.fillStyle = eye; g.fillRect(30, 28, 18, 18); g.fillRect(80, 28, 18, 18);
  g.fillStyle = '#05060a'; if (Math.sin(t * 3) > 0.9) { g.fillRect(28, 34, 22, 6); g.fillRect(78, 34, 22, 6); }
  g.strokeStyle = eye; g.lineWidth = 3; g.beginPath(); g.moveTo(28, 66);
  for (let i = 0; i <= 8; i++) g.lineTo(28 + i * 9, 66 + (i % 2 ? (angry ? 12 : 7) : 0));
  g.stroke();
  g.restore();
  for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, w, 1); }
  if (Math.random() < 0.3) { const y = Math.random() * h; g.drawImage(g.canvas, 0, y, w, 8, (Math.random() - 0.5) * 20, y, w, 8); }
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
