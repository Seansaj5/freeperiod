// The whole building in 3D (Three.js): the office you sit in, the halls outside its doors, and one "set" per camera room.
// One view is drawn at a time. Four point lights are shared and moved to whichever view is showing.
import * as THREE from 'three';

let R, scene, cam, amb; const lights = [], bots = {}, P = {}, screens = [], ROOM = {}, BTN = [];
const TAU = Math.PI * 2, v3 = new THREE.Vector3();
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });
const GLOW = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
const gBox = (w, h, d) => new THREE.BoxGeometry(w, h, d), gSph = (r) => new THREE.SphereGeometry(r, 20, 14), gCyl = (a, b, h, s = 14) => new THREE.CylinderGeometry(a, b, h, s);
function add(p, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; }
const B = (p, w, h, d, mat, x, y, z) => add(p, gBox(w, h, d), mat, x, y, z);
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function sign(p, w, h, x, y, z, ry, draw, lit = true) {
  const t = tex(512, Math.round(512 * h / w), draw), m = add(p, new THREE.PlaneGeometry(w, h), lit ? new THREE.MeshBasicMaterial({ map: t }) : M(0xffffff, { map: t }), x, y, z);
  m.rotation.y = ry; return m;
}
const label = (s, col, bg, size = 0.3) => (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; const L = s.split('\n'); c.font = `${h * size}px Bungee, sans-serif`; L.forEach((l, i) => c.fillText(l, w / 2, h / 2 + (i - (L.length - 1) / 2) * h * size * 1.1)); };
function checker(a, b, rx, ry) { const t = tex(2, 2, c => { c.fillStyle = a; c.fillRect(0, 0, 2, 2); c.fillStyle = b; c.fillRect(0, 0, 1, 1); c.fillRect(1, 1, 1, 1); }); t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; }
// A closed room seen from inside.
function roomBox(p, w, h, d, wall, floor, ceil, cx = 0, cz = 0) {
  const mats = [wall, wall, ceil, floor, wall, wall].map(m => { const k = m.clone(); k.side = THREE.BackSide; return k; });
  return add(p, gBox(w, h, d), mats, cx, h / 2, cz);
}
const floorMat = (w, d, a = '#17191c', b = '#2a2d31') => M(0xffffff, { map: checker(a, b, w / 2.4, d / 2.4), roughness: 0.5 });

// ---------- the robots ----------
const BOT = {
  bing: { body: 0x6fbf2a, plate: 0xe9f2c9, head: 0x7fd138, eye: 0xfff27a, w: 1, h: 1, hw: 1.05 },
  dylan: { body: 0x2f5fc4, plate: 0xc9d8f2, head: 0x3d73de, eye: 0xff5a4a, w: 0.82, h: 1.1, hw: 0.95 },
  gavin: { body: 0xe8862a, plate: 0xffe2b8, head: 0xf29a3e, eye: 0xffe9a8, w: 1.7, h: 1, hw: 1.2 },
  sal: { body: 0x7a1f2b, plate: 0xe8d9c0, head: 0xc47a3a, eye: 0x9dff6a, w: 0.95, h: 1, hw: 1 },
};
function makeBot(who) {
  const c = BOT[who], g = new THREE.Group(), W = c.w, D = Math.sqrt(W), hw = c.hw;
  const mb = M(c.body), mp = M(c.plate), mh = M(c.head), dk = M(0x1c1e22), jt = M(0x2a2d33, { metalness: 0.6, roughness: 0.4 }), wt = M(0xe8e4d4), blk = M(0x050505);
  for (const s of [-1, 1]) { add(g, gCyl(0.11, 0.1, 0.72), mb, s * 0.2 * W, 0.46, 0); add(g, gSph(0.115), jt, s * 0.2 * W, 0.46, 0); B(g, 0.24, 0.1, 0.36, dk, s * 0.2 * W, 0.05, 0.05); }
  add(g, gSph(0.5), mb, 0, 1.2, 0).scale.set(0.84 * W, 1, 0.72 * D);
  add(g, gSph(0.4), mp, 0, 1.15, 0.13 * D).scale.set(0.75 * W, 0.85, 0.7 * D);
  const sx = 0.42 * W + 0.1;
  const aL = new THREE.Group(); aL.position.set(-sx, 1.5, 0); aL.rotation.z = -0.18; g.add(aL);
  add(aL, gCyl(0.09, 0.08, 0.42), mb, 0, -0.21, 0); add(aL, gSph(0.09), jt, 0, -0.44, 0); add(aL, gCyl(0.08, 0.07, 0.4), mb, 0, -0.66, 0); add(aL, gSph(0.11), mp, 0, -0.9, 0);
  const aR = new THREE.Group(); aR.position.set(sx, 1.5, 0); aR.rotation.set(-0.5, 0, 0.15); g.add(aR);
  add(aR, gCyl(0.09, 0.08, 0.42), mb, 0, -0.21, 0); add(aR, gSph(0.09), jt, 0, -0.44, 0);
  const fore = new THREE.Group(); fore.position.set(0, -0.44, 0); fore.rotation.x = -1.7; aR.add(fore);
  add(fore, gCyl(0.08, 0.07, 0.4), mb, 0, -0.2, 0); add(fore, gSph(0.11), mp, 0, -0.44, 0);
  const it = new THREE.Group(); it.position.set(0, -0.44, 0); it.rotation.x = 2.2; fore.add(it);
  // head (faces +z so lookAt points the face at things)
  add(g, gCyl(0.08, 0.08, 0.16), jt, 0, 1.68, 0);
  const head = new THREE.Group(); head.position.set(0, 1.8, 0); g.add(head);
  add(head, gSph(0.3), mh, 0, 0.14, 0).scale.set(1.08 * hw, 0.8, 0.95);
  B(head, 0.5 * hw, 0.1, 0.42, mh, 0, -0.04, 0.06);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1, -0.12); head.add(jaw);
  B(jaw, 0.48 * hw, 0.1, 0.4, mh, 0, -0.07, 0.19); B(jaw, 0.4 * hw, 0.02, 0.3, blk, 0, -0.015, 0.2);
  for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 0.075 * hw; B(head, 0.05, 0.05, 0.03, wt, x, -0.105, 0.265); B(jaw, 0.05, 0.05, 0.03, wt, x, 0, 0.375); }
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: c.eye, emissiveIntensity: 0 });
  for (const s of [-1, 1]) {
    add(head, gSph(0.1), blk, s * 0.14 * hw, 0.16, 0.2); add(head, gSph(0.085), M(0xd8d8d0, { roughness: 0.3 }), s * 0.14 * hw, 0.16, 0.235); add(head, gSph(0.04), eyeMat, s * 0.14 * hw, 0.16, 0.305);
    B(head, 0.2, 0.045, 0.06, dk, s * 0.15 * hw, 0.29, 0.25).rotation.z = -s * 0.35;
  }
  add(head, gSph(0.05), mp, 0, 0.05, 0.31);
  let liquid = null;
  if (who === 'bing') {
    add(head, new THREE.SphereGeometry(0.31, 20, 10, 0, TAU, 0, Math.PI / 2), M(0x4c9a16), 0, 0.2, 0).scale.set(1.1 * hw, 0.85, 1);
    B(head, 0.5, 0.04, 0.3, M(0x4c9a16), 0, 0.24, 0.38); sign(head, 0.2, 0.2, 0, 0.34, 0.3, 0, label('B', '#4c9a16', '#f4f4e8', 0.8), false).rotation.x = -0.5;
    add(g, gCyl(0.13, 0.13, 0.04, 5), M(0xffd23a), 0, 1.25, 0.41).rotation.x = Math.PI / 2;
    add(it, gCyl(0.025, 0.025, 0.3), M(0x777777), 0, 0.12, 0); add(it, gSph(0.07), blk, 0, 0.3, 0);
  }
  if (who === 'dylan') {
    for (let i = -2; i <= 2; i++) { const s = add(head, new THREE.ConeGeometry(0.07, 0.24, 6), dk, i * 0.1, 0.44 - Math.abs(i) * 0.03, 0); s.rotation.z = -i * 0.25; }
    const band = add(head, new THREE.TorusGeometry(0.33, 0.025, 8, 20, Math.PI), M(0xe23d3d), 0, 0.14, 0); band.scale.y = 0.95;
    for (const s of [-1, 1]) add(head, gCyl(0.1, 0.1, 0.07), M(0xe23d3d), s * 0.33, 0.12, 0).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) add(it, gCyl(0.015, 0.012, 0.5), M(0xd9b27a), s * 0.04, 0.2, 0).rotation.z = -s * 0.2;
  }
  if (who === 'gavin') {
    const hat = M(0xf6f2ea); add(head, gCyl(0.26, 0.28, 0.2), hat, 0, 0.42, 0); for (const [x, z] of [[-0.16, 0], [0.16, 0], [0, 0.12], [0, -0.12]]) add(head, gSph(0.2), hat, x, 0.6, z);
    sign(g, 0.62, 0.62, 0, 1.12, 0.64, 0, label('EAT', '#c0392b', '#f6f2ea', 0.42), false);
    const bun = M(0xd99a3c); add(it, gSph(0.15), bun, 0, 0.16, 0).scale.y = 0.6; add(it, gCyl(0.16, 0.16, 0.05), M(0x5a2d12), 0, 0.1, 0); add(it, gCyl(0.17, 0.17, 0.02), M(0x6fbf2a), 0, 0.065, 0); add(it, gCyl(0.15, 0.14, 0.06), bun, 0, 0.03, 0);
  }
  if (who === 'sal') {
    add(head, new THREE.SphereGeometry(0.31, 20, 10, 0, TAU, 0, Math.PI / 2.3), M(0x111111, { roughness: 0.3 }), 0, 0.17, -0.01).scale.set(1.08, 0.85, 1);
    for (const s of [-1, 1]) add(head, gSph(0.07), dk, s * 0.08, -0.03, 0.3).scale.set(1.3, 0.5, 0.6);
    B(head, 0.2, 0.07, 0.04, mh, 0.14, 0.24, 0.3); // one heavy eyelid
    B(g, 0.09, 0.42, 0.03, M(0xc0392b), 0, 1.25, 0.4).rotation.x = -0.12;
    const gl = M(0x1f5d33, { transparent: true, opacity: 0.75, roughness: 0.15 });
    add(it, gCyl(0.065, 0.065, 0.3), gl, 0, 0.15, 0); add(it, gCyl(0.025, 0.05, 0.16), gl, 0, 0.38, 0);
    liquid = add(it, gCyl(0.05, 0.05, 0.28), M(0xd9a13a, { emissive: 0x5a3a00 }), 0, 0.15, 0);
    sign(it, 0.12, 0.1, 0, 0.14, 0.067, 0, label('XXX', '#7a1f2b', '#f1ead8', 0.6), false);
  }
  g.scale.set(c.h === 1 ? 1 : 0.94, c.h, c.h === 1 ? 1 : 0.94);
  g.userData = { head, jaw, eyeMat, liquid, h: c.h };
  g.visible = false;
  return g;
}
function makeDoll(boy) {
  const g = new THREE.Group(), teal = M(0x2ec4b6), skin = M(0xefe6d8, { roughness: 0.35 }), hair = M(0x2b1d14), blk = M(0x050505);
  add(g, gCyl(0.07, 0.22, 0.5), teal, 0, 0.27, 0); add(g, gSph(0.2), skin, 0, 0.72, 0);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xbffff5, emissiveIntensity: 0 });
  for (const s of [-1, 1]) { add(g, gSph(0.062), blk, s * 0.078, 0.74, 0.15); add(g, gSph(0.016), eyeMat, s * 0.078, 0.74, 0.21); add(g, gSph(0.035), M(0xe59aa0), s * 0.12, 0.65, 0.15).scale.z = 0.4; }
  const mouth = B(g, 0.16, 0.03, 0.03, blk, 0, 0.615, 0.18);
  add(g, new THREE.SphereGeometry(0.21, 16, 8, 0, TAU, 0, Math.PI / 2.2), boy ? teal : hair, 0, 0.74, -0.01);
  if (boy) B(g, 0.22, 0.025, 0.16, teal, 0, 0.8, 0.22);
  else for (const s of [-1, 1]) { add(g, gSph(0.085), hair, s * 0.25, 0.74, 0); add(g, gSph(0.035), teal, s * 0.19, 0.84, 0); }
  g.userData = { mouth, eyeMat };
  return g;
}
function makeTokens() {
  const g = new THREE.Group(), gold = M(0xc79a1e, { metalness: 0.4, roughness: 0.5 }), blk = M(0x050505), wt = M(0xe8e4d4);
  B(g, 0.7, 0.65, 0.5, gold, 0, 0, 0); B(g, 0.58, 0.26, 0.02, M(0x8a6a10), 0, 0.14, 0.26); B(g, 0.44, 0.1, 0.02, blk, 0, -0.14, 0.26);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x7a1a14, emissive: 0xff3b2f, emissiveIntensity: 2 });
  for (const s of [-1, 1]) { add(g, gSph(0.09), blk, s * 0.15, 0.14, 0.23); add(g, gSph(0.05), eyeMat, s * 0.15, 0.14, 0.29); }
  for (let i = 0; i < 6; i++) { B(g, 0.045, 0.035, 0.02, wt, (i - 2.5) * 0.07, -0.105, 0.27); B(g, 0.045, 0.035, 0.02, wt, (i - 2.5) * 0.07, -0.175, 0.27); }
  for (const s of [-1, 1]) { const a = add(g, gCyl(0.035, 0.035, 0.6), M(0x777777, { metalness: 0.7 }), s * 0.5, -0.1, 0.25); a.rotation.set(1.1, 0, -s * 0.5); for (const k of [-1, 1]) add(g, gCyl(0.015, 0.008, 0.16), M(0xb9b9b9, { metalness: 0.7 }), s * 0.62 + k * 0.04, -0.24, 0.56).rotation.x = 1.3; }
  sign(g, 0.2, 0.1, 0, -0.26, 0.255, 0, label('25¢', '#3b2c05', '#c79a1e', 0.7), false);
  g.visible = false; g.userData = { eyeMat };
  return g;
}
function makeMusicBox() {
  const g = new THREE.Group();
  const stripes = tex(64, 8, c => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f1ead8' : '#2ec4b6'; c.fillRect(i * 8, 0, 8, 8); } });
  B(g, 1, 0.75, 1, M(0xffffff, { map: stripes }), 0, 0.375, 0); B(g, 0.16, 0.77, 1.02, M(0xffd23a), 0, 0.376, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.75, -0.5); g.add(lid);
  B(lid, 1.08, 0.14, 1.08, M(0x1c7f76), 0, 0.07, 0.5); for (const s of [-1, 1]) add(lid, gSph(0.12), M(0xffd23a), s * 0.12, 0.2, 0.5).scale.set(1.3, 0.7, 0.8);
  const crank = new THREE.Group(); crank.position.set(0.5, 0.4, 0); g.add(crank);
  add(crank, gCyl(0.025, 0.025, 0.2), M(0x9a9a9a, { metalness: 0.7 }), 0.1, 0, 0).rotation.z = Math.PI / 2; add(crank, gCyl(0.025, 0.025, 0.22), M(0x9a9a9a, { metalness: 0.7 }), 0.2, 0.1, 0); add(crank, gSph(0.05), M(0xc0392b), 0.2, 0.22, 0);
  const dolls = [makeDoll(false), makeDoll(true)]; dolls[0].position.x = -0.24; dolls[1].position.x = 0.24; dolls.forEach(d => g.add(d));
  g.userData = { lid, crank, dolls };
  return g;
}

// ---------- the building ----------
function buildOffice() {
  const g = new THREE.Group(); scene.add(g);
  const wall = M(0x2a4047), dark = M(0x15191b), metal = M(0x4b5258, { metalness: 0.6, roughness: 0.45 });
  B(g, 14, 0.2, 21, floorMat(14, 21), 0, -0.1, -6); B(g, 14, 0.2, 21, M(0x0d1012), 0, 3.3, -6);
  B(g, 8.4, 3.2, 0.2, wall, 0, 1.6, -3.1); B(g, 14, 3.2, 0.2, wall, 0, 1.6, 4.1);
  for (const s of [-1, 1]) {
    B(g, 0.2, 3.2, 15.4, wall, s * 4.1, 1.6, -8.3); B(g, 0.2, 3.2, 3.1, wall, s * 4.1, 1.6, 2.55); B(g, 0.2, 0.7, 1.6, wall, s * 4.1, 2.85, 0.2);
    B(g, 0.2, 3.2, 21, M(0x1d2a30), s * 6.7, 1.6, -6); B(g, 2.6, 3.2, 0.2, M(0x1d2a30), s * 5.4, 1.6, -16.1);
    B(g, 0.3, 2.6, 0.12, dark, s * 4.1, 1.3, -0.66); B(g, 0.3, 2.6, 0.12, dark, s * 4.1, 1.3, 1.06);
    const slabTex = tex(128, 200, (c, w, h) => { c.fillStyle = '#4b5258'; c.fillRect(0, 0, w, h); c.fillStyle = '#394046'; for (let i = 0; i < 5; i++) c.fillRect(0, 14 + i * 34, w, 4); for (let i = -2; i < 8; i++) { c.fillStyle = i % 2 ? '#e8b923' : '#151515'; c.beginPath(); c.moveTo(i * 20, h); c.lineTo(i * 20 + 20, h); c.lineTo(i * 20 + 40, h - 22); c.lineTo(i * 20 + 20, h - 22); c.fill(); } });
    P['door' + (s < 0 ? 'L' : 'R')] = B(g, 0.14, 2.5, 1.6, M(0xffffff, { map: slabTex, metalness: 0.4, roughness: 0.5 }), s * 4.1, 3.8, 0.2);
    // button panel: DOOR over LIGHT
    B(g, 0.08, 0.95, 0.5, dark, s * 3.96, 1.5, -1.3);
    for (const [id, y, col, txt] of [['door', 1.72, 0xe23d3d, 'DOOR'], ['light', 1.28, 0xf4f4e8, 'LIGHT']]) {
      const key = id + (s < 0 ? 'L' : 'R'), m = M(col, { emissive: col, emissiveIntensity: 0.05 });
      B(g, 0.08, 0.32, 0.36, m, s * 3.92, y, -1.3); P[key + 'Btn'] = m;
      const lb = sign(g, 0.3, 0.1, s * 3.87, y, -1.3, -s * Math.PI / 2, label(txt, '#111', '#d8d2c0', 0.7), false); lb.material.transparent = true; lb.material.opacity = 0.85;
      BTN.push({ id: key, p: new THREE.Vector3(s * 3.9, y, -1.3), r: 52 });
    }
    // hall dressing
    for (let i = 0; i < 4; i++) sign(g, 0.9, 1.2, s * 6.58, 1.7, -5 - i * 2.8, -s * Math.PI / 2, (c, w, h) => { c.fillStyle = ['#7a1522', '#1c7f76', '#8a6a10', '#2f5fc4'][i]; c.fillRect(0, 0, w, h); c.fillStyle = '#f4f4e8'; c.font = `${h * 0.14}px Bungee`; c.textAlign = 'center'; c.fillText(['PLAY', 'EAT', 'WIN', 'PARTY'][i], w / 2, h * 0.2); c.fillText('AT BING\'S', w / 2, h * 0.9); c.beginPath(); c.arc(w / 2, h * 0.55, w * 0.25, 0, 7); c.fill(); }, false);
    for (const z of [-7, -13]) add(g, gBox(0.5, 0.06, 1.2), GLOW(0x8a8570), s * 5.4, 3.17, z);
  }
  // front wall: sign, poster, vent
  sign(g, 2.6, 1.05, -2.3, 2.1, -2.98, 0, (c, w, h) => { c.fillStyle = '#0b1114'; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.shadowColor = '#9dff3a'; c.shadowBlur = 24; c.fillStyle = '#c8ff8a'; c.font = `${h * 0.48}px Bungee`; c.fillText("BING'S", w / 2, h * 0.52); c.shadowBlur = 0; c.fillStyle = '#f4f4e8'; c.font = `${h * 0.15}px Bungee`; c.fillText('ARCADE & GRILL', w / 2, h * 0.82); });
  sign(g, 1.3, 1.7, 2.5, 1.75, -2.98, 0, (c, w, h) => { c.fillStyle = '#e9e2cf'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1030'; c.fillRect(14, 14, w - 28, h - 28); c.fillStyle = '#ffd23a'; c.textAlign = 'center'; c.font = `${h * 0.085}px Bungee`; c.fillText('HIGH SCORE', w / 2, h * 0.14); c.fillText('NIGHT!', w / 2, h * 0.24); c.fillStyle = '#7fd138'; c.beginPath(); c.roundRect(w * 0.3, h * 0.36, w * 0.4, h * 0.2, 30); c.fill(); c.fillRect(w * 0.36, h * 0.58, w * 0.28, h * 0.3); c.fillStyle = '#111'; c.beginPath(); c.arc(w * 0.42, h * 0.45, 14, 0, 7); c.arc(w * 0.58, h * 0.45, 14, 0, 7); c.fill(); }, false);
  B(g, 1.4, 0.7, 0.3, M(0x020303), 0, 2.55, -3.13); for (let i = 0; i < 5; i++) B(g, 1.4, 0.03, 0.04, metal, 0, 2.3 + i * 0.125, -2.96);
  for (const [x, y, w, h] of [[0, 2.92, 1.5, 0.06], [0, 2.18, 1.5, 0.06], [-0.73, 2.55, 0.06, 0.8], [0.73, 2.55, 0.06, 0.8]]) B(g, w, h, 0.06, metal, x, y, -2.95);
  P.shutter = B(g, 1.4, 0.7, 0.05, M(0x5a646b, { metalness: 0.6 }), 0, 3.6, -2.9);
  P.ventEyes = new THREE.Group(); for (const s of [-1, 1]) add(P.ventEyes, gSph(0.06), GLOW(0xff3b2f), s * 0.17, 2.55, -2.975); g.add(P.ventEyes);
  B(g, 0.5, 0.45, 0.08, dark, 1.2, 2.55, -2.96); P.sealBtn = M(0x3ad7ff, { emissive: 0x3ad7ff, emissiveIntensity: 0.05 }); B(g, 0.36, 0.3, 0.08, P.sealBtn, 1.2, 2.55, -2.92);
  sign(g, 0.3, 0.1, 1.2, 2.55, -2.875, 0, label('VENT', '#111', '#d8d2c0', 0.7), false);
  BTN.push({ id: 'seal', p: new THREE.Vector3(1.2, 2.55, -2.9), r: 52 });
  // checker trim + string lights
  const trim = M(0xffffff, { map: checker('#101010', '#d8d2c0', 20, 1) }); B(g, 8, 0.25, 0.02, trim, 0, 1.15, -2.99);
  P.bulbs = []; for (let i = 0; i < 18; i++) { const m = GLOW(0xffffff); add(g, gSph(0.045), m, -3.8 + i * 0.447, 3.0 - Math.sin(i / 17 * Math.PI * 3) * 0.08 - 0.08, -2.9); P.bulbs.push(m); }
  // desk and the things on it
  const wood = M(0x3a2a1c); B(g, 3.8, 0.08, 1.0, wood, 0, 0.8, 0.50); B(g, 3.6, 0.76, 0.06, M(0x241a12), 0, 0.4, 0.05);
  B(g, 0.7, 0.55, 0.6, dark, -1.15, 1.12, 0.35); P.crt = add(g, new THREE.PlaneGeometry(0.56, 0.4), GLOW(0x0c2a1c), -1.15, 1.14, 0.66).material;
  B(g, 0.3, 0.07, 0.2, dark, -0.45, 0.88, 0.50); P.phone = add(g, gSph(0.02), GLOW(0x3a0d0a), -0.36, 0.925, 0.56).material;
  add(g, gCyl(0.05, 0.04, 0.16), M(0xc0392b), 1.5, 0.92, 0.60); add(g, gCyl(0.008, 0.008, 0.2), M(0xf4f4e8), 1.51, 1.05, 0.60).rotation.z = 0.2;
  add(g, gCyl(0.12, 0.14, 0.04), dark, 0.2, 0.86, 0.30); add(g, gCyl(0.02, 0.02, 0.3), dark, 0.2, 1.0, 0.30);
  P.fan = new THREE.Group(); P.fan.position.set(0.2, 1.2, 0.33); g.add(P.fan); for (let i = 0; i < 3; i++) { const b = B(P.fan, 0.22, 0.07, 0.01, M(0x7a8288, { metalness: 0.5 }), 0, 0, 0); b.geometry.translate(0.12, 0, 0); b.rotation.z = i * TAU / 3; }
  add(g, new THREE.TorusGeometry(0.25, 0.012, 6, 24), metal, 0.2, 1.2, 0.33);
  const plush = makeBot('bing'); plush.visible = true; plush.scale.setScalar(0.17); plush.position.set(-0.05, 0.84, 0.65); plush.rotation.y = 0.3; g.add(plush); P.plush = plush;
  // hand-crank generator
  B(g, 0.42, 0.3, 0.3, M(0xb8860b, { metalness: 0.5, roughness: 0.5 }), 1.0, 0.99, 0.30);
  sign(g, 0.36, 0.1, 1.0, 1.06, 1.152, 0, label('CRANK (G)', '#111', '#e8b923', 0.6), false);
  P.crank = new THREE.Group(); P.crank.position.set(1.0, 0.95, 0.46); g.add(P.crank);
  add(P.crank, gCyl(0.015, 0.015, 0.18), metal, 0, 0.07, 0.01); add(P.crank, gCyl(0.03, 0.03, 0.08), M(0xc0392b), 0, 0.14, 0.05).rotation.x = Math.PI / 2;
  BTN.push({ id: 'crank', p: new THREE.Vector3(1.0, 1.0, 0.46), r: 60 });
}

function set(id, ox, def, build) {
  const g = new THREE.Group(); g.position.set(ox, 0, 0); scene.add(g);
  ROOM[id] = { ...def, ox }; build(g);
}
function buildSets() {
  const wood = M(0x4a2f1b), dark = M(0x15191b), metal = M(0x5a646b, { metalness: 0.6, roughness: 0.4 });
  set('stage', 100, { cam: [3.6, 3.1, 4.3], look: [0, 1.9, -3], amb: 0.1, lights: [[0, 4.4, -0.3, 0xfff0d0, 46, 12], [-4.5, 3.5, 0, 0x7a5cff, 22, 10], [4.5, 3.5, 0, 0x3ad7ff, 16, 10]], spots: { bing: [0, 0.6, -3, 0], dylan: [-3, 0.6, -2.8, 0.2], gavin: [3.2, 0.6, -2.8, -0.2] } }, g => {
    roomBox(g, 14, 5, 10, M(0x1a1030), floorMat(14, 10), M(0x0a0812));
    B(g, 10.5, 0.6, 3.6, wood, 0, 0.3, -3.1);
    sign(g, 9.5, 4.2, 0, 2.8, -4.95, 0, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a1030'); gr.addColorStop(1, '#3a1d5a'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd23a'; for (let i = 0; i < 40; i++) { c.beginPath(); c.arc((i * 173) % w, (i * 97) % h, 2 + i % 3, 0, 7); c.fill(); } c.textAlign = 'center'; c.shadowColor = '#9dff3a'; c.shadowBlur = 20; c.fillStyle = '#c8ff8a'; c.font = `${h * 0.3}px Bungee`; c.fillText("BING'S", w / 2, h * 0.38); c.shadowBlur = 0; c.fillStyle = '#f4f4e8'; c.font = `${h * 0.09}px Bungee`; c.fillText('ARCADE & GRILL', w / 2, h * 0.52); }, false);
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) B(g, 0.5, 5, 0.3, M(i % 2 ? 0x5a0f18 : 0x7a1522), s * (5 + i * 0.45), 2.5, -1.2 + (i % 2) * 0.1);
    B(g, 14, 0.7, 0.3, M(0x5a0f18), 0, 4.65, -1.1);
  });
  set('arcade', 200, { cam: [4.6, 2.9, 3.6], look: [0, 1.2, -3], amb: 0.06, lights: [[0, 3.6, 0, 0x7088ff, 20, 12, 1], [-4, 2, -3.5, 0x3ad7ff, 9, 7], [4, 2, -3.5, 0xffb020, 9, 7]], spots: { dylan: [-3, 0, -1, 0.5], gavin: [3, 0, -1.6, 0.1], bing: [0, 0, -3.4, 0.3] } }, g => {
    roomBox(g, 16, 4, 12, M(0x141c33), floorMat(16, 12, '#14142a', '#23234a'), M(0x090b14));
    for (let i = 0; i < 7; i++) { const x = -6 + i * 2; B(g, 1, 1.9, 0.9, M(0x10131f), x, 0.95, -5.4); const m = GLOW(0x224488); add(g, new THREE.PlaneGeometry(0.72, 0.52), m, x, 1.35, -4.94); screens.push({ m, h: i * 0.15 }); add(g, new THREE.PlaneGeometry(0.9, 0.2), GLOW(new THREE.Color().setHSL(i * 0.15, 0.7, 0.3)), x, 1.78, -4.94); B(g, 0.9, 0.08, 0.3, M(0x23283a), x, 1.0, -4.85); }
    sign(g, 4, 0.8, 0, 3.2, -5.95, 0, label('HIGH SCORES', '#9eeaff', '#0b1020', 0.6));
    for (const x of [-5, 5]) { add(g, gCyl(0.5, 0.5, 0.06, 20), M(0x3a2a1c), x, 0.75, 2); add(g, gCyl(0.05, 0.05, 0.75), dark, x, 0.37, 2); }
  });
  set('bar', 300, { cam: [2.1, 2.4, 2.9], look: [0, 1.5, -1.2], amb: 0.07, lights: [[0, 3.4, 1.2, 0xffb060, 24, 10], [0, 2.9, -3.6, 0xffb020, 10, 6, 1]], spots: { sal: [0, 0, -1.3, 0] } }, g => {
    roomBox(g, 10, 4, 9, M(0x2a1a10), floorMat(10, 9, '#161210', '#2a2018'), M(0x0d0906));
    B(g, 7, 1.1, 0.8, wood, 0, 0.55, 0); B(g, 7.2, 0.08, 1, M(0x6a4526, { roughness: 0.35 }), 0, 1.14, 0);
    for (let r = 0; r < 2; r++) { B(g, 6, 0.06, 0.35, wood, 0, 1.7 + r * 0.7, -4.25); for (let i = 0; i < 15; i++) { const h = 0.3 + ((i * 7 + r * 3) % 5) * 0.04, col = new THREE.Color().setHSL(((i * 47 + r * 90) % 360) / 360, 0.5, 0.3); add(g, gCyl(0.055, 0.055, h, 8), M(col, { roughness: 0.2 }), -2.8 + i * 0.4, 1.73 + r * 0.7 + h / 2, -4.25); add(g, gCyl(0.02, 0.03, 0.12, 8), M(col, { roughness: 0.2 }), -2.8 + i * 0.4, 1.79 + r * 0.7 + h, -4.25); } }
    sign(g, 3.2, 0.9, 0, 3.35, -4.45, 0, (c, w, h) => { c.fillStyle = '#140c06'; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ffb020'; c.shadowBlur = 22; c.fillStyle = '#ffe2a8'; c.font = `${h * 0.6}px Bungee`; c.fillText('THE TAP', w / 2, h / 2); });
    B(g, 0.08, 0.5, 0.08, metal, 2, 1.42, 0.05); B(g, 0.08, 0.06, 0.3, metal, 2, 1.62, 0.18); P.stream = add(g, gCyl(0.02, 0.02, 0.44, 6), GLOW(0xd9a13a), 2, 1.38, 0.3);
    for (const x of [-2, 0, 2]) { add(g, gCyl(0.22, 0.22, 0.06), M(0x7a1f2b), x, 0.75, 1.1); add(g, gCyl(0.04, 0.04, 0.75), metal, x, 0.37, 1.1); }
    P.shards = new THREE.Group(); for (let i = 0; i < 9; i++) { const s = add(P.shards, new THREE.TetrahedronGeometry(0.06), M(0x1f5d33, { roughness: 0.15 }), -0.5 + (i * 0.37) % 1, 1.2, -0.25 + (i * 0.13) % 0.5); s.rotation.set(i, i * 2, i * 3); } g.add(P.shards);
  });
  set('prize', 400, { cam: [1.6, 2.6, 4.2], look: [-0.4, 1.1, -1.2], amb: 0.07, lights: [[0, 3.5, 1, 0x99ddee, 22, 10, 1], [-1.6, 2, 1.2, 0xffe0a0, 9, 5]], spots: { bing: [2.9, 0, 0.4, -0.3] } }, g => {
    roomBox(g, 11, 4, 9, M(0x17282b), floorMat(11, 9), M(0x090d0e));
    for (let r = 0; r < 3; r++) { B(g, 9, 0.06, 0.4, M(0x26363a), 0, 1.5 + r * 0.75, -4.2); for (let i = 0; i < 10; i++) { const col = M(new THREE.Color().setHSL(((i * 61 + r * 40) % 360) / 360, 0.5, 0.35)), x = -4 + i * 0.89, y = 1.72 + r * 0.75; add(g, gSph(0.18), col, x, y, -4.2); for (const s of [-1, 1]) add(g, gSph(0.07), col, x + s * 0.13, y + 0.18, -4.2); for (const s of [-1, 1]) add(g, gSph(0.025), M(0x050505), x + s * 0.06, y + 0.04, -4.03); } }
    B(g, 8, 0.9, 0.7, M(0x2d3f44), 0, 0.45, -2.9);
    sign(g, 4, 0.8, 0, 3.55, -4.45, 0, label('PRIZE CORNER', '#9eeaff', '#0b1a1e', 0.55));
    P.box = makeMusicBox(); P.box.position.set(-1.6, 0, -0.4); P.box.rotation.y = 0.35; g.add(P.box);
  });
  set('storage', 500, { cam: [2.6, 2.5, 3.4], look: [0, 1.3, -0.5], amb: 0.04, lights: t => [[Math.sin(t * 1.7) * 0.9, 2.3, 0, 0xffe9a8, 14, 8]], spots: { dylan: [0.5, 0, 0.6, 0.5] } }, g => {
    roomBox(g, 8, 3.4, 8, M(0x1e1b15), M(0x191713), M(0x0a0907));
    for (let r = 0; r < 3; r++) { B(g, 3.6, 0.06, 0.6, M(0x3a3226), -2, 0.7 + r * 0.8, -3.5); for (let i = 0; i < 4; i++) B(g, 0.7, 0.45 + ((i + r) % 2) * 0.15, 0.5, M(new THREE.Color().setHSL(0.08, 0.3, 0.16 + ((i * 3 + r) % 4) * 0.04)), -3.3 + i * 0.86, 0.96 + r * 0.8 + ((i + r) % 2) * 0.07, -3.5); }
    B(g, 3, 0.08, 0.8, M(0x3a3226), 2, 0.9, -3.3);
    [0x7fd138, 0x3d73de, 0xf29a3e].forEach((col, i) => { const x = 1.1 + i * 0.9; add(g, gSph(0.28), M(col), x, 1.2, -3.3).scale.set(1.05, 0.8, 0.9); for (const s of [-1, 1]) add(g, gSph(0.09), M(0x050505), x + s * 0.13, 1.24, -3.08); B(g, 0.36, 0.05, 0.05, M(0x050505), x, 1.04, -3.05); });
    P.bulb = add(g, gSph(0.07), GLOW(0xffe9a8), 0, 2.4, 0); P.cord = B(g, 0.01, 1, 0.01, dark, 0, 2.9, 0);
    add(g, gCyl(0.2, 0.17, 0.3), M(0xc0392b), -2.5, 0.15, 1); add(g, gCyl(0.02, 0.02, 1.5), M(0xd9b27a), -2.4, 0.8, 1).rotation.z = -0.3;
  });
  set('kitchen', 600, { cam: [3.2, 2.7, 3.5], look: [-0.3, 1.3, -0.5], amb: 0.06, lights: [[0, 3.2, 0.5, 0xcfe8ff, 20, 9, 1], [-3.3, 1.1, -2.6, 0xff7a1e, 12, 5]], spots: { gavin: [-0.4, 0, 0, 0.5] } }, g => {
    roomBox(g, 10, 3.6, 8, M(0xffffff, { map: checker('#2a3434', '#303c3c', 10, 4) }), floorMat(10, 8, '#1d2023', '#34383c'), M(0x0d0f10));
    B(g, 2, 1.1, 0.9, M(0x2b3238, { metalness: 0.5 }), -3.3, 0.55, -3.4); add(g, new THREE.PlaneGeometry(1.5, 0.6), GLOW(0xff6a1e), -3.3, 0.55, -2.94); B(g, 1.7, 0.75, 0.04, M(0x0c0c0c, { transparent: true, opacity: 0.6 }), -3.3, 0.55, -2.93);
    B(g, 1.3, 2.3, 1, M(0x8a949c, { metalness: 0.6, roughness: 0.35 }), 3.6, 1.15, -3.4); B(g, 0.04, 0.6, 0.06, dark, 3.1, 1.4, -2.88);
    B(g, 4, 0.9, 0.8, M(0x39424a, { metalness: 0.4 }), 0.3, 0.45, -3.5); for (let i = 0; i < 3; i++) B(g, 0.6, 0.06, 0.6, M(0xb89a6a), 0.9 + i * 0.03, 0.94 + i * 0.065, -3.5);
    B(g, 6, 0.04, 0.04, metal, 0, 3.0, -2.2); P.pots = []; for (let i = 0; i < 6; i++) { const p = new THREE.Group(); p.position.set(-2.5 + i, 3.0, -2.2); g.add(p); add(p, gCyl(0.008, 0.008, 0.5), metal, 0, -0.25, 0); add(p, gCyl(0.17 + (i % 3) * 0.03, 0.14, 0.2), M(0x4a5560, { metalness: 0.7, roughness: 0.3 }), 0, -0.6, 0); P.pots.push(p); }
  });
  set('vent', 700, { cam: [0, 0.65, -0.2], look: [0, 0.65, -10], amb: 0.03, sway: 0, lights: [[0, 0.9, -1, 0x99aabb, 3, 9], [0, 0.9, -6, 0xffc0a0, 3, 8, 1]], spots: {} }, g => {
    roomBox(g, 1.3, 1.3, 15, M(0x5a646b, { metalness: 0.7, roughness: 0.4 }), M(0x4b5258, { metalness: 0.7, roughness: 0.4 }), M(0x4b5258, { metalness: 0.7 }), 0, -7.5);
    for (let z = -1.5; z > -15; z -= 2) for (const [x, y, w, h] of [[0, 0.02, 1.3, 0.04], [0, 1.28, 1.3, 0.04], [-0.63, 0.65, 0.04, 1.3], [0.63, 0.65, 0.04, 1.3]]) B(g, w, h, 0.08, metal, x, y, z);
    P.tokens = makeTokens(); g.add(P.tokens);
  });
  ROOM.whall = { ox: 0, cam: [-5.4, 2.7, -2.2], look: [-5.4, 1.2, -10], amb: 0.03, lights: [[-5.4, 2.9, -7, 0xfff0c8, 12, 9, 1], [-5.4, 2.9, -13, 0xfff0c8, 5, 7]], spots: { dylan: [-5.5, 0, -8, 0], bing: [-5.2, 0, -10.5, 0] } };
  ROOM.ehall = { ox: 0, cam: [5.4, 2.7, -2.2], look: [5.4, 1.2, -10], amb: 0.03, lights: [[5.4, 2.9, -7, 0xffd8b0, 12, 9, 1], [5.4, 2.9, -13, 0xffd8b0, 5, 7]], spots: { gavin: [5.5, 0, -8, 0], bing: [5.2, 0, -10.5, 0] } };
  ROOM.title = { ox: 800, cam: [-0.55, 1.75, 2.5], look: [-0.75, 1.72, 0], amb: 0.02, sway: 0, lights: [[-0.9, 1.3, 1.3, 0xd8ffb0, 5, 5, 1], [1.4, 2.6, 0.4, 0x3ad7ff, 3, 5]], spots: {} };
  P.scareDolls = new THREE.Group(); const d1 = makeDoll(false), d2 = makeDoll(true); d1.position.x = -0.24; d2.position.x = 0.24; P.scareDolls.add(d1, d2); P.scareDolls.scale.setScalar(2.2); P.scareDolls.visible = false; scene.add(P.scareDolls);
  P.scareTok = makeTokens(); scene.add(P.scareTok);
}

export function init(canvas) {
  R = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  R.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); R.setSize(1280, 720, false);
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.15;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000); scene.fog = new THREE.FogExp2(0x000000, 0.04);
  cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 60);
  amb = new THREE.AmbientLight(0x8fa3b5, 0.05); scene.add(amb);
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); lights.push(l); }
  for (const who of ['bing', 'dylan', 'gavin', 'sal']) { bots[who] = makeBot(who); scene.add(bots[who]); }
  buildOffice(); buildSets();
}
const flick = (t, s = 0) => (Math.sin(t * 17 + s) > 0.2 || Math.sin(t * 3.1 + s) > 0) ? 1 : 0.25;
function setLights(list, t, ox = 0, gain = 1) {
  for (let i = 0; i < 4; i++) {
    const l = lights[i], s = list[i];
    if (!s) { l.intensity = 0; continue; }
    l.position.set(s[0] + ox, s[1], s[2]); l.color.set(s[3]); l.intensity = s[4] * gain * (s[6] ? flick(t, i * 2) : 1); l.distance = s[5];
  }
}
function place(m, x, y, z, ry) { m.visible = true; m.position.set(x, y, z); m.rotation.set(0, ry, 0); }
function pose(m, t, glow, jaw = 0.04) { const u = m.userData; u.head.lookAt(cam.position); u.jaw.rotation.x = jaw; u.eyeMat.emissiveIntensity = glow ? 1.6 : 0; m.rotation.z = Math.sin(t * 0.9 + m.id) * 0.015; }

export const YAW = 0.9;
// view: { type: 'office', yaw } | { type: 'cam', id } | { type: 'title' } | { type: 'scare', who, t, yaw }
export function render(view, s, t) {
  for (const k in bots) bots[k].visible = false;
  P.tokens.visible = P.scareTok.visible = P.scareDolls.visible = false;
  const office = view.type === 'office' || view.type === 'scare';
  let room = null;
  if (office) {
    cam.fov = 60; cam.position.set(0, 1.5, 2.6); cam.rotation.set(0, 0, 0); cam.rotation.order = 'YXZ'; cam.rotation.y = view.yaw; cam.rotation.x = -0.06;
  } else {
    room = ROOM[view.type === 'title' ? 'title' : view.id];
    const sw = room.sway === 0 ? 0 : Math.sin(t * 0.35) * 0.9;
    cam.fov = view.type === 'title' ? 38 : 68; cam.position.set(room.cam[0] + room.ox, room.cam[1], room.cam[2]);
    cam.lookAt(room.look[0] + room.ox + sw, room.look[1], room.look[2]);
  }
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();

  if (s) {
    // doors, shutter, buttons, desk toys
    P.doorL.position.y = 3.8 - 2.55 * s.dl; P.doorR.position.y = 3.8 - 2.55 * s.dr; P.shutter.position.y = 3.6 - 1.05 * s.sv;
    P.doorLBtn.emissiveIntensity = s.doorL ? 1.6 : 0.05; P.doorRBtn.emissiveIntensity = s.doorR ? 1.6 : 0.05; P.lightLBtn.emissiveIntensity = s.lightL ? 1.4 : 0.05; P.lightRBtn.emissiveIntensity = s.lightR ? 1.4 : 0.05; P.sealBtn.emissiveIntensity = s.seal ? 1.6 : 0.05;
    P.ventEyes.visible = s.tok === 3 && s.sv < 0.6;
    if (!s.out) P.fan.rotation.z = t * 14;
    P.crank.rotation.z = s.crankA; P.phone.color.set(s.call && Math.sin(t * 10) > 0 ? 0xff3b2f : 0x3a0d0a);
    P.crt.color.setHex(s.out ? 0x000000 : 0x0c2a1c).multiplyScalar(0.7 + 0.3 * Math.sin(t * 23));
    P.bulbs.forEach((m, i) => m.color.setHSL(i % 4 * 0.22, 0.9, s.out ? 0.02 : 0.25 + 0.2 * Math.sin(t * 2 + i)));
    P.plush.userData.head.rotation.set(0, Math.sin(t * 0.5) * 0.4, Math.sin(t * 3) * 0.06);
    // walkers
    for (const who of ['bing', 'dylan', 'gavin']) {
      const w = s.where[who]; if (!w) continue;
      const m = bots[who];
      if (w === 'doorL' || w === 'doorR') { const sd = w === 'doorL' ? -1 : 1; place(m, sd * 5.0, 0, 0.2, -sd * Math.PI / 2); pose(m, t, who === 'bing' || s['light' + w.slice(4)], 0.04); }
      else { const r = ROOM[w], p = r.spots[who]; if (!p) continue; place(m, p[0] + r.ox, p[1], p[2], p[3]); pose(m, t, w !== 'stage', w === 'stage' ? 0.03 : 0.12); }
    }
    // Sal: at the bar, or running a hall
    const sal = bots.sal, su = sal.userData;
    if (s.sal.at === 'bar') { const p = ROOM.bar.spots.sal; place(sal, p[0] + 300, 0, p[2], Math.sin(t * 1.3) * 0.08); pose(sal, t, s.sal.thirst < 25, 0.05); sal.rotation.z = Math.sin(t * 1.1) * 0.05; su.liquid.scale.y = Math.max(0.02, s.sal.thirst / 100); su.liquid.position.y = 0.01 + 0.14 * su.liquid.scale.y; }
    else if (s.sal.at) { const sd = s.sal.at === 'L' ? -1 : 1, k = s.sal.k, z = -14 + 13.4 * Math.min(1, k / 0.9); place(sal, sd * (5.4 - 0.4 * Math.max(0, (k - 0.75) / 0.25)) + Math.sin(t * 9) * 0.2 * (k < 0.9), Math.abs(Math.sin(t * 12)) * 0.06, z, k > 0.9 ? -sd * Math.PI / 2 : 0); pose(sal, t, true, 0.25); sal.rotation.z = Math.sin(t * 9) * 0.12; su.liquid.scale.y = 0.02; }
    P.shards.visible = s.sal.at !== 'bar'; P.stream.visible = !!s.pour;
    // music box
    const bu = P.box.userData; bu.crank.rotation.x = s.windA; bu.lid.rotation.x = s.awake ? -1.9 : 0;
    bu.dolls.forEach((d, i) => { d.position.y = s.awake ? 0.42 + Math.abs(Math.sin(t * 9 + i)) * 0.04 : -0.5; d.visible = s.awake; d.userData.eyeMat.emissiveIntensity = 3; d.rotation.y = -0.35; });
    // Mr. Tokens in the vent
    if (s.tok > 0 && view.type === 'cam') { P.tokens.visible = true; P.tokens.position.set(0, 0.36 + Math.sin(t * 7) * 0.01, [0, -11, -6.2, -1.7][s.tok]); P.tokens.rotation.z = Math.sin(t * 3) * 0.05; }
    P.bulb.position.x = Math.sin(t * 1.7) * 0.9; P.cord.position.x = P.bulb.position.x / 2; P.cord.rotation.z = Math.sin(t * 1.7) * 0.42;
    if (P.pots) P.pots.forEach((p, i) => { p.rotation.z = Math.sin(t * 1.2 + i) * 0.08; });
    screens.forEach((k, i) => k.m.color.setHSL(k.h, 0.8, i === 3 ? 0.03 : 0.18 + 0.08 * Math.sin(t * (3 + i) + i)));
  }

  if (view.type === 'title') {
    const tw = Math.sin(t * 0.7) > 0.96 || Math.sin(t * 2.3) > 0.985, m = bots[tw ? 'sal' : 'bing'];
    place(m, 800 + (tw ? (Math.random() - 0.5) * 0.04 : 0), 0, 0, 0.25); pose(m, t, true, tw ? 0.4 : 0.03); m.userData.head.rotation.set(0.05, 0.1 + Math.sin(t * 0.4) * 0.12, tw ? 0.3 : 0.06);
    amb.intensity = room.amb; setLights(room.lights, t, 800);
  } else if (view.type === 'cam') {
    amb.intensity = room.amb * 3; setLights(typeof room.lights === 'function' ? room.lights(t) : room.lights, t, room.ox, 2.6);
  } else if (view.type === 'office') {
    const o = s.out, f = s.intruder ? (Math.sin(t * 31) > 0.2 ? 0.15 : 1) : 0.92 + 0.08 * Math.sin(t * 50);
    amb.intensity = o ? 0.004 : 0.07;
    if (o) { if (s.eyes) { place(bots.bing, -5.0, 0, 0.2, Math.PI / 2); pose(bots.bing, t, Math.sin(t * 9) > -0.5, 0.1); } setLights([s.eyes ? [-4.3, 1.9, 0.6, 0xfff27a, 0.5 * (Math.sin(t * 9) > -0.5), 3] : null, [0, 2, 2, 0x334455, 0.25, 6]], t); }
    else setLights([[0, 2.9, 0.6, 0xffe8c8, 30 * f, 5.7], [0, 2.7, -1.6, 0xcfe0ff, 14 * f, 5], s.lightL ? [-4.7, 2.6, 0.2, 0xeef2d8, 12 * flick(t * 2.3), 4.2] : null, s.lightR ? [4.7, 2.6, 0.2, 0xeef2d8, 12 * flick(t * 2.3), 4.2] : null], t);
  } else { // jumpscare, in the office
    const k = Math.min(1, view.t / 0.18), e = 1 - Math.pow(1 - k, 3), dist = 2.7 - (view.who === 'twins' ? 1.0 : 1.5) * e, dx = -Math.sin(view.yaw), dz = -Math.cos(view.yaw);
    const sh = () => (Math.random() - 0.5) * 0.09, x = dx * dist + sh(), z = 2.6 + dz * dist, ry = Math.atan2(-dx, -dz), jaw = 0.25 + 0.5 * Math.abs(Math.sin(view.t * 40));
    if (view.who === 'twins') { place(P.scareDolls, x, 1.5 - 1.62 + sh(), z, ry); P.scareDolls.children.forEach(d => { d.userData.eyeMat.emissiveIntensity = 4; d.userData.mouth.scale.y = 1 + jaw * 9; }); }
    else if (view.who === 'tokens') { place(P.scareTok, x, 1.45 + sh() + (1 - e) * 1.2, z, ry); P.scareTok.scale.setScalar(1.25); }
    else { const m = bots[view.who]; place(m, x, 1.5 - 1.9 * m.userData.h + sh(), z, ry); pose(m, view.t, true, jaw); m.userData.head.rotation.set(sh() * 2, sh() * 3, sh() * 4); m.rotation.z = sh(); }
    amb.intensity = 0.05; setLights([[dx * 0.3, 1.5, 2.6 + dz * 0.3, Math.sin(view.t * 60) > 0.4 ? 0xff8870 : 0xfff0e0, 2.2, 6], [0, 2.9, 0.4, 0xffe8c8, 3 * flick(view.t * 4), 5.7]], t);
  }
  R.render(scene, cam);
}
// Where the office's 3D buttons are on the 1280x720 screen right now (call after render).
export function buttons() {
  const out = [];
  for (const b of BTN) { v3.copy(b.p).project(cam); if (v3.z > 1 || v3.z < -1) continue; const x = (v3.x * 0.5 + 0.5) * 1280, y = (-v3.y * 0.5 + 0.5) * 720; if (x < -60 || x > 1340) continue; out.push({ id: b.id, x: x - b.r, y: y - b.r, w: b.r * 2, h: b.r * 2 }); }
  return out;
}
