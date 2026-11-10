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
    this.puffs = []; this.puffT = 0; this.awake = false;
    if (variant === 'glitch') this.buildGlitch();
    else if (variant === 'grin') this.buildBrute();
    else this.buildSpeedster();
  }

  /** EXE: a lanky, fast creature. Runner legs that bend backwards, a ribcage, long blade claws,
   *  a cracked bone mask with red slit eyes and a wide grin, black tendrils streaming off its head. */
  buildSpeedster() {
    this.organic = 'exe';
    const skin = std(0x0e0e17, { roughness: 0.42, metalness: 0.3, emissive: 0xff1a08, emissiveMap: crackTex(), emissiveIntensity: 1.0 });
    const bone = std(0xdcd4c4, { roughness: 0.55, emissive: 0x220000, emissiveMap: crackTex(), emissiveIntensity: 0.6 });
    const black = std(0x040406, { roughness: 0.9 });
    const claw = std(0xe8e2d6, { roughness: 0.3, metalness: 0.4 });
    const red = new THREE.MeshBasicMaterial({ color: 0xff1a0a });
    const O = (this.O = {});
    O.pelvis = J(this.body, 0, 1.24, 0);
    capsule(O.pelvis, 0.13, 0.2, skin).rotation.z = Math.PI / 2;
    O.legs = [-1, 1].map((sd) => {
      const hip = J(O.pelvis, sd * 0.16, -0.02, 0);
      const knee = seg(hip, 0.11, 0.42, skin);
      const ankle = seg(knee, 0.085, 0.48, skin);
      const toe = seg(ankle, 0.065, 0.3, skin);
      for (let i = 0; i < 3; i++) { const c = cone(toe, 0.03, 0.2, claw); c.position.set((i - 1) * 0.05, 0, 0.1); c.rotation.x = Math.PI / 2; }
      return { hip, knee, ankle, toe };
    });
    O.spine = J(O.pelvis, 0, 0.08, 0);
    capsule(O.spine, 0.13, 0.24, skin, 0.2).scale.set(1.15, 1, 0.9);
    O.chest = J(O.spine, 0, 0.36, 0);
    capsule(O.chest, 0.19, 0.24, skin, 0.18).scale.set(1.45, 1, 0.9);
    for (let i = 0; i < 6; i++) { const sp = cone(O.chest, 0.04 - i * 0.004, 0.22 - i * 0.02, bone); sp.position.set(0, 0.5 - i * 0.12, -0.17); sp.rotation.x = -1.9; }
    for (const sd of [-1, 1]) { const bl = cone(O.chest, 0.06, 0.42, black); bl.position.set(sd * 0.22, 0.42, -0.16); bl.rotation.set(-2.2, 0, sd * 0.5); }
    for (let i = 0; i < 4; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.012, 0.016, 5, 14, Math.PI * 0.9), bone); rib.position.set(0, 0.08 + i * 0.07, 0.02); rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.05); rib.scale.set(1.3, 0.9, 1); O.chest.add(rib); }
    O.arms = [-1, 1].map((sd) => {
      const sh = J(O.chest, sd * 0.3, 0.33, 0);
      capsule(sh, 0.07, 0.06, skin).rotation.z = Math.PI / 2;
      const elbow = seg(sh, 0.072, 0.5, skin);
      const wrist = seg(elbow, 0.058, 0.52, skin);
      capsule(wrist, 0.05, 0.06, black, -0.05);
      const claws = [];
      for (let i = 0; i < 3; i++) {
        const c = J(wrist, (i - 1) * 0.045, -0.08, 0.02);
        const b = cone(c, 0.028, 0.55, claw); b.position.y = -0.27; b.rotation.x = Math.PI; c.rotation.set(0.25, 0, (i - 1) * 0.12);
        claws.push(c);
      }
      return { sh, elbow, wrist, claws, sd };
    });
    O.neck = J(O.chest, 0, 0.42, 0.03);
    capsule(O.neck, 0.05, 0.16, skin, 0.1);
    O.head = J(O.neck, 0, 0.26, 0.02);
    O.head.scale.setScalar(1.18);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), black); skull.scale.set(0.85, 0.95, 1.2); O.head.add(skull);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.245, 20, 16, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.18, Math.PI * 0.62), bone); mask.scale.set(0.86, 0.96, 1.22); O.head.add(mask);
    for (const sd of [-1, 1]) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.03), red); slit.position.set(sd * 0.075, 0.04, 0.27); slit.rotation.z = sd * 0.35; O.head.add(slit);
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), black); socket.scale.set(1.3, 0.7, 0.4); socket.position.set(sd * 0.075, 0.04, 0.255); O.head.add(socket);
    }
    const grin = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 5, 20, Math.PI * 0.95), black); grin.position.set(0, -0.06, 0.255); grin.rotation.set(0.25, 0, Math.PI * 1.025); O.head.add(grin);
    for (let i = 0; i < 9; i++) { const a = Math.PI * (1.08 + (i / 8) * 0.84); const tth = cone(O.head, 0.012, 0.045, claw); tth.position.set(Math.cos(a) * 0.115, -0.06 + Math.sin(a) * 0.115 + 0.02, 0.262); tth.rotation.x = Math.PI; }
    for (const sd of [-1, 1]) { const tear = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.01), red); tear.position.set(sd * 0.08, -0.04, 0.268); O.head.add(tear); }
    // black tendrils streaming back from the head
    O.tendrils = [];
    for (let i = 0; i < 6; i++) {
      let j = J(O.head, (i - 2.5) * 0.06, 0.1 + Math.abs(i - 2.5) * -0.02, -0.18);
      j.rotation.set(2.1 + Math.abs(i - 2.5) * 0.06, (i - 2.5) * 0.2, 0);
      const chain = [j];
      for (let k = 0; k < 5; k++) { j = seg(j, 0.045 - k * 0.007, 0.24, black); chain.push(j); }
      O.tendrils.push(chain);
    }
    this.eyeGlowAt(O.head, 0xff1010, 0.5, 0.16, 0.04, 0.3);
    this.root.scale.setScalar(1.12);
    this.baseScale = 1.12;
    this.glowMats = [skin, bone];
    this.smoke = { color: 'rgba(255,20,10,', size: 0.5, rise: 0.2, streak: true };
  }

  /** Grin.exe: a hulking brute. Short thick legs, a massive hunched chest, arms that drag on the ground with
   *  long fingers, a big pale head whose jaw drops open into a grin full of teeth. */
  buildBrute() {
    this.organic = 'grin';
    const skin = std(0xa8a092, { roughness: 0.75, emissive: 0x5a0010, emissiveMap: crackTex(), emissiveIntensity: 0.9 });
    const rag = std(0x3a0d10, { roughness: 0.95, side: THREE.DoubleSide });
    const black = std(0x050404, { roughness: 1 });
    const tooth = std(0xf4eedc, { roughness: 0.4 });
    const O = (this.O = {});
    O.pelvis = J(this.body, 0, 1.08, 0);
    capsule(O.pelvis, 0.24, 0.3, skin).rotation.z = Math.PI / 2;
    O.legs = [-1, 1].map((sd) => {
      const hip = J(O.pelvis, sd * 0.24, -0.04, 0);
      const knee = seg(hip, 0.15, 0.36, skin);
      const ankle = seg(knee, 0.13, 0.4, skin);
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.26, 4, 10), skin); foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.06, 0.1); ankle.add(foot);
      for (let i = 0; i < 4; i++) { const c = cone(ankle, 0.025, 0.12, tooth); c.position.set((i - 1.5) * 0.06, -0.08, 0.3); c.rotation.x = Math.PI / 2; }
      return { hip, knee, ankle };
    });
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.6 + (i % 3) * 0.15), rag); const a = (i / 6) * Math.PI * 2; r.position.set(Math.sin(a) * 0.3, -0.25, Math.cos(a) * 0.28); r.rotation.y = a; O.pelvis.add(r); }
    O.spine = J(O.pelvis, 0, 0.12, 0);
    capsule(O.spine, 0.28, 0.2, skin, 0.2).scale.set(1.15, 1, 0.95);
    O.chest = J(O.spine, 0, 0.42, 0);
    capsule(O.chest, 0.4, 0.3, skin, 0.25).scale.set(1.4, 1, 0.95);
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin); b.position.set(0, 0.85 - i * 0.14, -0.36 - Math.sin(i / 2) * 0.03); O.chest.add(b); }
    O.arms = [-1, 1].map((sd) => {
      const sh = J(O.chest, sd * 0.62, 0.48, 0.02);
      sh.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin));
      const elbow = seg(sh, 0.12, 0.78, skin);
      const wrist = seg(elbow, 0.11, 0.85, skin);
      capsule(wrist, 0.12, 0.1, skin, -0.06).scale.set(1.2, 1, 0.6);
      const fingers = [];
      for (let i = 0; i < 5; i++) {
        let f = J(wrist, (i - 2) * 0.055, -0.14, i === 0 || i === 4 ? 0.03 : 0.05);
        f.rotation.set(0.15, 0, (i - 2) * 0.08);
        const base = f;
        for (let k = 0; k < 3; k++) f = seg(f, 0.026 - k * 0.004, 0.16, skin);
        const nail = cone(f, 0.018, 0.08, black); nail.rotation.x = Math.PI; nail.position.y = -0.03;
        fingers.push(base);
      }
      return { sh, elbow, wrist, fingers, sd };
    });
    O.neck = J(O.chest, 0, 0.62, 0.18);
    capsule(O.neck, 0.15, 0.08, skin, 0.06);
    O.head = J(O.neck, 0, 0.12, 0.2);
    O.head.scale.setScalar(1.12);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), skin); skull.scale.set(1, 1.05, 1.02); O.head.add(skull);
    for (const sd of [-1, 1]) {
      const pit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), black); pit.position.set(sd * 0.16, 0.16, 0.32); pit.scale.set(1, 1.25, 0.7); O.head.add(pit);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); dot.position.set(sd * 0.16, 0.14, 0.4); O.head.add(dot);
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), skin); brow.rotation.z = Math.PI / 2 + sd * 0.35; brow.position.set(sd * 0.16, 0.27, 0.36); O.head.add(brow);
    }
    // the grin: lips pulled back over two rows of long teeth, all the way round the face
    const gums = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 6, 30, Math.PI * 0.95), std(0x6a0a14, { roughness: 0.5 })); gums.rotation.set(Math.PI / 2, 0, Math.PI * 0.025); gums.position.y = -0.02; O.head.add(gums);
    for (let i = 0; i < 19; i++) { const a = -Math.PI * 0.46 + (i / 18) * Math.PI * 0.92; const tt = cone(O.head, 0.03, 0.14, tooth); tt.position.set(Math.sin(a) * 0.38, -0.08, Math.cos(a) * 0.38); tt.rotation.x = Math.PI; }
    // the jaw: hinged at the back of the head, it drops open into the grin
    O.jaw = J(O.head, 0, -0.02, -0.3);
    const jawM = new THREE.Mesh(new THREE.SphereGeometry(0.4, 26, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.32), skin); jawM.position.z = 0.3; O.jaw.add(jawM);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), std(0x2a0204, { roughness: 1, side: THREE.DoubleSide })); mouth.rotation.x = -Math.PI / 2; mouth.position.set(0, -0.03, 0.3); O.jaw.add(mouth);
    for (let i = 0; i < 19; i++) { const a = -Math.PI * 0.46 + (i / 18) * Math.PI * 0.92; const tt = cone(O.jaw, 0.03, 0.13, tooth); tt.position.set(Math.sin(a) * 0.36, 0.03, 0.3 + Math.cos(a) * 0.36); }
    const tongue = capsule(O.jaw, 0.08, 0.3, std(0x6a0a14, { roughness: 0.6 }), 0); tongue.rotation.x = Math.PI / 2; tongue.position.set(0, -0.02, 0.32);
    // stringy hair
    for (let i = 0; i < 9; i++) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9 + (i % 3) * 0.25, 0.02), black); const a = Math.PI + (i - 4) * 0.22; h.position.set(Math.sin(a) * 0.36, -0.2, Math.cos(a) * 0.36); O.head.add(h); }
    this.eyeGlowAt(O.head, 0xffffff, 0.16, 0.08, 0.12, 0.38);
    this.root.scale.setScalar(1.22);
    this.baseScale = 1.22;
    this.glowMats = [skin];
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
      this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: this.variant === 'glitch' ? 0xff2a8a : this.variant === 'grin' ? 0xb0101a : 0xff2010, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.aura.scale.set(4.5, 5.5, 1); this.aura.position.y = 1.6; this.root.add(this.aura);
    }
    this.aura.visible = on;
    if (this.extra.eyeGlow) this.extra.eyeGlow.scale.multiplyScalar(on ? 1.8 : 1 / 1.8);
  }

  /** Animation for the organic monsters (EXE and Grin). s: same as update(). */
  updateOrganic(dt, s) {
    const O = this.O, ex = this.organic === 'exe', k = 18;
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
    // EXE's tendrils stream behind; Grin's jaw opens when it attacks (and hangs open when it runs)
    if (O.tendrils) O.tendrils.forEach((chain, i) => chain.forEach((j, n) => { if (n) j.rotation.x = -0.22 + run * 0.16 + Math.sin(this.t * (6 + run * 6) - n * 0.9 + i) * (0.1 + run * 0.08); }));
    if (O.jaw) R(O.jaw, 'x', s.atk >= 0 ? 0.3 + Math.sin(Math.min(1, s.atk) * Math.PI) * 0.75 : this.awake ? 0.6 : run > 0.6 ? 0.35 : 0.2 + Math.sin(this.t * 1.3) * 0.04, 14);
    if (ex && speed > 6) this.emitPuffs(dt, speed);
  }

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
    if (s.awake !== undefined) this.setAwake(!!s.awake);
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
