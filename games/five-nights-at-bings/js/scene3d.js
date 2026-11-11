// The building in 3D: the office, the two halls outside its doors, and one "set" per camera room (spaced far apart).
// One view is drawn at a time. A shadow-casting spotlight and three fill lights are shared and moved to that view.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TAU, add, B, sq, limbGeo, lathe, gSph, gCyl, gBox, tex, wallTex, tileTex, WOOD, GRIME, label, sign, beam, suit, paint, metal, plastic, glass, glow, setEnv, setFur, BLACK, ENDO, rand, ptex, pbrMat, woodMat } from './kit.js';
import { prop, setPropEnv } from './props.js';
import { makeBot, makeHead, makeDoll, makeTokens, makeMusicBox, makeEndo, setPose, animate } from './models.js';

let R, scene, cam, composer, bloom, fin, amb, key, quality = 2;
const fills = [], bots = {}, P = {}, ROOM = {}, BTN = [], screens = [], v3 = new THREE.Vector3();
export const YAW = 0.9;
const WARP_OFFICE = 0.16, WARP_CAM = 0.3;

// ---------- small builders ----------
function shell(p, w, h, d, wallFn, floor, ceil, cx = 0, cz = 0) {
  const side = m => { const k = m.clone(); k.side = THREE.BackSide; return k; }, a = side(wallFn(d)), b = side(wallFn(w));
  const m = add(p, gBox(w, h, d), [a, a, side(ceil), side(floor), b, b], cx, h / 2, cz); m.userData.noShadow = true; return m;
}
const wallMat = (top, bottom, band = true) => len => new THREE.MeshStandardMaterial({ map: wallTex(top, bottom, band, Math.max(1, Math.round(len / 4))), roughness: 1, normalMap: ptex('painted_plaster_wall_n', Math.max(1, len / 3), 1.2), roughnessMap: ptex('painted_plaster_wall_r', Math.max(1, len / 3), 1.2) });
function floorMat(w, d, a = '#16181b', b = '#3b3e44', rough = 0.3) { const t = tileTex(a, b, 8); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 4.8, d / 4.8); return new THREE.MeshStandardMaterial({ map: t, roughness: rough + 0.5, metalness: 0.05, normalMap: ptex('old_linoleum_flooring_01_n', w / 3, d / 3), roughnessMap: ptex('old_linoleum_flooring_01_r', w / 3, d / 3) }); }
const CEIL = pbrMat('ceiling_interior', 4, 4, { color: 0x4a4d50 }, 'dn');
// A ceiling lamp: housing, glowing face and a soft beam. Returns the parts that flicker with its light.
function lampFix(p, x, y, z, color = 0xfff2d0, long = false) {
  if (long) prop(p, 'mounted_fluorescent_lights', x, y, z, Math.PI / 2, 1.5); else B(p, 0.5, 0.07, 0.5, paint(0x1a1c1f), x, y - 0.035, z);
  const g = glow(color, 2.2); add(p, gBox(long ? 0.2 : 0.36, 0.03, long ? 1.25 : 0.36), g, x, y - 0.075, z); g.userData.c = g.color.clone();
  return [g, beam(p, x, y - 0.08, z, long ? 1.1 : 1.3, y - 0.1, color, long ? 0.025 : 0.05)];
}
function tube(p, pts, r, mat) { return add(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(a => new THREE.Vector3(a[0], a[1], a[2]))), 24, r, 6), mat); }
function balloon(p, x, y, z, col) { add(p, gSph(0.19, 16), plastic(col, { roughness: 0.15 }), x, y, z).scale.y = 1.18; add(p, gCyl(0.004, 0.004, y - 0.05, 4), paint(0xdddddd), x, y / 2 - 0.1, z).userData.noShadow = true; }
function poster(p, w, h, x, y, z, ry, bg, title, sub, fg = '#f4f4e8') {
  return sign(p, w, h, x, y, z, ry, (c, W, H) => { c.fillStyle = bg; c.fillRect(0, 0, W, H); c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(10, 10, W - 20, H - 20); c.fillStyle = fg; c.textAlign = 'center'; c.font = `${H * 0.13}px Bungee`; c.fillText(title, W / 2, H * 0.2); c.font = `${H * 0.07}px Bungee`; c.fillText(sub, W / 2, H * 0.9); c.beginPath(); c.arc(W / 2, H * 0.52, W * 0.24, 0, 7); c.fill(); c.fillStyle = bg; c.beginPath(); c.arc(W * 0.42, H * 0.49, W * 0.05, 0, 7); c.arc(W * 0.58, H * 0.49, W * 0.05, 0, 7); c.fill(); c.fillRect(W * 0.38, H * 0.58, W * 0.24, H * 0.025); c.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 6; i++) c.fillRect(rand() * W, rand() * H, 40 + rand() * 80, 3); }, false, 256);
}
const neonSign = (p, w, h, x, y, z, ry, txt, col, sub) => sign(p, w, h, x, y, z, ry, (c, W, H) => { c.fillStyle = '#07090b'; c.fillRect(0, 0, W, H); c.strokeStyle = col; c.lineWidth = 6; c.shadowColor = col; c.shadowBlur = 18; c.strokeRect(14, 14, W - 28, H - 28); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.font = `${H * (sub ? 0.46 : 0.56)}px Bungee`; c.fillText(txt, W / 2, H * (sub ? 0.44 : 0.53)); c.fillText(txt, W / 2, H * (sub ? 0.44 : 0.53)); if (sub) { c.shadowBlur = 6; c.font = `${H * 0.15}px Bungee`; c.fillText(sub, W / 2, H * 0.8); } });
function plush(p, x, y, z, col, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); p.add(g); const m = suit(col), k = suit(0xf1ead8);
  add(g, sq(0.15, 0.16, 0.13, 2.2, 14), m, 0, 0.16, 0); add(g, gSph(0.13, 14), m, 0, 0.42, 0); add(g, gSph(0.06, 10), k, 0, 0.39, 0.1);
  for (const s2 of [-1, 1]) { add(g, gSph(0.055, 10), m, s2 * 0.1, 0.54, 0); add(g, gSph(0.05, 8), m, s2 * 0.16, 0.2, 0.05); add(g, gSph(0.055, 8), m, s2 * 0.09, 0.03, 0.09); add(g, gSph(0.018, 6), BLACK, s2 * 0.05, 0.45, 0.115); }
  return g;
}
function cabinet(p, x, z, ry, hue, name, kind) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; p.add(g);
  const sh = new THREE.Shape(); [[-0.4, 0], [0.35, 0], [0.35, 0.85], [0.47, 0.93], [0.3, 1.05], [0.2, 1.56], [0.4, 1.62], [0.4, 1.86], [-0.4, 1.86]].forEach((a, i) => sh[i ? 'lineTo' : 'moveTo'](a[0], a[1]));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.72, bevelEnabled: false }); geo.translate(0, 0, -0.36);
  const body = add(g, geo, paint(new THREE.Color().setHSL(hue, 0.5, 0.12), { roughness: 0.5 })); body.rotation.y = -Math.PI / 2;
  const scr = tex(128, 96, (c, W, H) => { c.fillStyle = '#020308'; c.fillRect(0, 0, W, H); const col = `hsl(${hue * 360},90%,60%)`; c.fillStyle = col;
    if (kind === 0) { for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) c.fillRect(14 + i * 13, 12 + j * 12, 8, 6); c.fillRect(56, 80, 16, 5); }
    else if (kind === 1) { c.fillRect(8, 30, 5, 26); c.fillRect(115, 44, 5, 26); c.fillRect(60, 46, 6, 6); for (let i = 0; i < 9; i++) c.fillRect(63, 4 + i * 10, 2, 6); }
    else if (kind === 2) { c.strokeStyle = col; c.lineWidth = 3; for (let i = 0; i < 4; i++) c.strokeRect(10 + i * 12, 8 + i * 9, 108 - i * 24, 80 - i * 18); c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(64, 48, 6, 0.6, 5.7); c.lineTo(64, 48); c.fill(); }
    else { c.beginPath(); c.arc(64, 44, 20, 0, 7); c.fill(); c.fillStyle = '#020308'; c.fillRect(54, 38, 6, 6); c.fillRect(68, 38, 6, 6); c.fillRect(54, 50, 20, 4); }
    c.fillStyle = '#fff'; c.font = '9px monospace'; c.textAlign = 'center'; c.fillText('INSERT COIN', 64, 92); });
  const sm = new THREE.MeshBasicMaterial({ map: scr }), s = add(g, new THREE.PlaneGeometry(0.54, 0.42), sm, 0, 1.3, 0.262); s.rotation.x = -0.197; screens.push({ m: sm, k: screens.length });
  sign(g, 0.66, 0.2, 0, 1.74, 0.402, 0, label(name, '#fff', `hsl(${hue * 360},80%,32%)`, 0.5), true, 256);
  add(g, gCyl(0.012, 0.012, 0.1, 6), ENDO, -0.14, 1.03, 0.38); add(g, gSph(0.035, 10), plastic(0xe23d3d), -0.14, 1.09, 0.38); for (let i = 0; i < 3; i++) add(g, gCyl(0.025, 0.025, 0.02, 10), plastic([0xffd23a, 0x3ad7ff, 0x9dff3a][i]), 0.05 + i * 0.08, 0.995, 0.39).rotation.x = 0.5;
  add(g, gBox(0.2, 0.3, 0.02), ENDO, 0, 0.45, 0.352);
}
function curtain(p, w, h, x, y, z, ry = 0, col = 0x8a1522) {
  const geo = new THREE.PlaneGeometry(w, h, Math.round(w * 22), 1), a = geo.attributes.position;
  for (let i = 0; i < a.count; i++) { const px = a.getX(i); a.setZ(i, Math.sin(px * 9) * 0.11 + Math.sin(px * 23 + 1) * 0.035); }
  geo.computeVertexNormals(); const m = add(p, geo, suit(col, { side: THREE.DoubleSide, bumpScale: 0.8 }), x, y, z); m.rotation.y = ry; return m;
}
function stool(p, x, z) { return prop(p, 'bar_chair_round_01', x, 0, z, x, 1.03); }
function stoolOld(p, x, z) { add(p, sq(0.2, 0.05, 0.2, 2.4, 16), suit(0x7a1f2b), x, 0.78, z); add(p, gCyl(0.03, 0.03, 0.74, 10), ENDO, x, 0.38, z); add(p, gCyl(0.2, 0.22, 0.03, 18), ENDO, x, 0.015, z); add(p, new THREE.TorusGeometry(0.15, 0.012, 6, 18), ENDO, x, 0.3, z).rotation.x = Math.PI / 2; }

// ---------- the office and the halls ----------
function buildOffice() {
  const g = new THREE.Group(); scene.add(g);
  const wm = wallMat('#31505a', '#1b2a30'), hm = wallMat('#3a3328', '#211c15'), dark = paint(0x14171a, { roughness: 0.6 }), steel = metal(0x6b737a, 0.45);
  const wb = (w, h, d, x, y, z, len, fn = wm) => B(g, w, h, d, fn(len), x, y, z);
  B(g, 14, 0.2, 21, floorMat(14, 21), 0, -0.1, -6); B(g, 14, 0.2, 21, CEIL, 0, 3.3, -6);
  wb(8.4, 3.2, 0.2, 0, 1.6, -3.1, 8); wb(14, 3.2, 0.2, 0, 1.6, 4.1, 12);
  const slab = tex(128, 256, (c, w, h) => { c.fillStyle = '#525a61'; c.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { c.fillStyle = '#3a4147'; c.fillRect(0, 18 + i * 36, w, 5); c.fillStyle = '#6a737a'; c.fillRect(0, 23 + i * 36, w, 2); } for (let i = -2; i < 8; i++) { c.fillStyle = i % 2 ? '#e8b923' : '#151515'; c.beginPath(); c.moveTo(i * 20, h); c.lineTo(i * 20 + 20, h); c.lineTo(i * 20 + 40, h - 26); c.lineTo(i * 20 + 20, h - 26); c.fill(); } c.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 30; i++) c.fillRect(rand() * w, rand() * h, 2 + rand() * 20, 1); });
  const hz = tex(64, 64, c => { for (let i = -2; i < 6; i++) { c.fillStyle = i % 2 ? '#e8b923' : '#151515'; c.beginPath(); c.moveTo(i * 16, 64); c.lineTo(i * 16 + 16, 64); c.lineTo(i * 16 + 48, 0); c.lineTo(i * 16 + 32, 0); c.fill(); } }, { repeat: [1, 6] });
  P.hallFx = { L: [], R: [] };
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    wb(0.2, 3.2, 15.4, s * 4.1, 1.6, -8.3, 15); wb(0.2, 3.2, 3.1, s * 4.1, 1.6, 2.55, 3); wb(0.2, 0.7, 1.6, s * 4.1, 2.85, 0.2, 1);
    wb(0.2, 3.2, 21, s * 6.7, 1.6, -6, 20, hm); wb(2.6, 3.2, 0.2, s * 5.4, 1.6, -16.1, 3, hm);
    for (const z of [-0.68, 1.08]) B(g, 0.34, 2.6, 0.14, paint(0xffffff, { map: hz, roughness: 0.6 }), s * 4.1, 1.3, z); B(g, 0.34, 0.14, 1.9, steel, s * 4.1, 2.57, 0.2);
    P['door' + L] = B(g, 0.14, 2.5, 1.6, new THREE.MeshStandardMaterial({ map: slab, metalness: 0.6, roughness: 0.45 }), s * 4.1, 3.8, 0.2);
    B(g, 0.1, 1.0, 0.54, dark, s * 3.96, 1.5, -1.3); B(g, 0.06, 1.08, 0.62, steel, s * 3.99, 1.5, -1.3);
    for (const [id, y, col, txt] of [['door', 1.73, 0xe23d3d, 'DOOR'], ['light', 1.27, 0xf4f4e8, 'LIGHT']]) {
      const m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.06, roughness: 0.35 }); P[id + L + 'Btn'] = m;
      add(g, sq(0.045, 0.15, 0.17, 5, 14), m, s * 3.905, y, -1.3);
      const lb = sign(g, 0.3, 0.1, s * 3.855, y, -1.3, -s * Math.PI / 2, label(txt, '#111', null, 0.72), false, 128); lb.material.transparent = true; lb.userData.noShadow = true;
      BTN.push({ id: id + L, p: new THREE.Vector3(s * 3.9, y, -1.3), r: 54 });
    }
    tube(g, [[s * 3.97, 2.0, -1.3], [s * 3.97, 2.6, -1.25], [s * 3.95, 3.15, -1.6], [s * 3.5, 3.17, -2.6]], 0.015, BLACK);
    // side wall dressing
    sign(g, 0.9, 1.2, s * 3.99, 1.75, 2.5, -s * Math.PI / 2, (c, W, H) => { c.fillStyle = '#e9e2cf'; c.fillRect(0, 0, W, H); c.fillStyle = '#7a1522'; c.textAlign = 'center'; c.font = `${H * 0.09}px Bungee`; c.fillText(s < 0 ? 'NIGHT RULES' : 'SHIFT LOG', W / 2, H * 0.12); c.fillStyle = '#333'; c.font = `${H * 0.045}px monospace`; (s < 0 ? ['1. Watch the cameras', '2. Check the lights', '3. Keep the box wound', '4. Keep Sal topped off', '5. Do not run out of power', '', '6. DO NOT WAKE BENTON'] : ['MON  M. ...quit', 'TUE  J. ...quit', 'WED  R. ...missing', 'THU  A. ...quit', 'FRI  SEAN', 'SAT  SEAN', 'SUN  SEAN']).forEach((l, i) => c.fillText(l, W / 2, H * (0.25 + i * 0.09))); }, false, 256);
    // the hall
    const fx = P.hallFx[L];
    for (const z of [-3.5, -8, -12.5]) fx.push(...lampFix(g, s * 5.4, 3.2, z, s < 0 ? 0xeaf2ff : 0xfff0d0, true));
    [['PLAY', '#7a1522'], ['EAT', '#1c7f76'], ['WIN', '#8a6a10'], ['PARTY', '#2f5fc4']].forEach(([t, col], i) => poster(g, 0.9, 1.2, s * 6.59, 1.75, -4.4 - i * 2.9, -s * Math.PI / 2, col, t, "AT BING'S"));
    for (const [z, txt] of [[-6, s < 0 ? 'STAFF ONLY' : 'KITCHEN'], [-11, s < 0 ? 'STORAGE' : 'PARTY ROOM']]) { B(g, 0.06, 2.1, 1.0, paint(0x3a2d22, { map: WOOD }), s * 4.21, 1.05, z); B(g, 0.04, 2.24, 1.14, dark, s * 4.2, 1.1, z); add(g, gSph(0.04, 8), metal(0xf2c230, 0.3), s * 4.26, 1.0, z + 0.36); sign(g, 0.6, 0.16, s * 4.25, 2.0, z, s * Math.PI / 2, label(txt, '#f4f4e8', '#14171a', 0.6), false, 256); }
    for (const y of [3.05, 2.95]) { const p = add(g, gCyl(0.045, 0.045, 19.5, 8), steel, s * (6.5 - (y - 2.95) * 2), y, -6.2); p.rotation.x = Math.PI / 2; }
    sign(g, 0.7, 0.26, s * 5.4, 2.75, -15.98, 0, label('EXIT', '#b9ffc8', '#06200c', 0.75), true, 128);
    B(g, 1.7, 2.3, 0.08, paint(0x2a2f33, { roughness: 0.5 }), s * 5.4, 1.15, -15.97); B(g, 0.03, 2.3, 0.1, BLACK, s * 5.4, 1.15, -15.95);
    prop(g, 'WetFloorSign_01', s * 5.9, 0, -5.6, s * 0.5, 1.1); prop(g, 'trashbag', s * 6.25, 0, -9.6, s, 1); prop(g, 'trashbag', s * 6.1, 0, -10.2, s * 2, 0.85); prop(g, 'korean_fire_extinguisher_01', s * 6.4, 0, -13.2, -s * 1.2, 1); prop(g, 'fire_alarm', s * 6.59, 1.9, -7.6, -s * Math.PI / 2, 1.6);
    if (s > 0) { prop(g, 'plastic_monobloc_chair_01', 6.1, 0, -7.3, -1.9, 1); prop(g, 'cardboard_box_01', 6.2, 0, -12.0, 0.4, 1.1); } else { prop(g, 'ladder_sectioned_01', -6.45, 0, -11.9, Math.PI / 2, 1, { rx: 0, rz: 0.14 }); prop(g, 'wooden_crate_02', -6.2, 0, -14.4, 0.2, 0.8); }
    add(g, gCyl(0.04, 0.03, 0.1, 10), paint(0xc0392b), s * 4.6, 0.05, -9.3).rotation.z = 1.4;
  }
  // front wall
  neonSign(g, 2.6, 1.05, -2.35, 2.05, -2.985, 0, "BING'S", '#9dff3a', 'ARCADE & GRILL');
  sign(g, 1.3, 1.7, 2.55, 1.75, -2.985, 0, (c, W, H) => { c.fillStyle = '#e9e2cf'; c.fillRect(0, 0, W, H); const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2a1a4a'); gr.addColorStop(1, '#10091f'); c.fillStyle = gr; c.fillRect(16, 16, W - 32, H - 32); c.fillStyle = '#ffd23a'; c.textAlign = 'center'; c.font = `${H * 0.085}px Bungee`; c.fillText('HIGH SCORE', W / 2, H * 0.13); c.fillText('NIGHT!', W / 2, H * 0.22); c.fillStyle = '#7dcb35'; c.beginPath(); c.roundRect(W * 0.26, H * 0.36, W * 0.48, H * 0.22, 40); c.fill(); c.beginPath(); c.roundRect(W * 0.3, H * 0.6, W * 0.4, H * 0.3, 30); c.fill(); c.fillStyle = '#3f8f17'; c.beginPath(); c.arc(W / 2, H * 0.38, W * 0.25, Math.PI, 0); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(W * 0.4, H * 0.45, 20, 0, 7); c.arc(W * 0.6, H * 0.45, 20, 0, 7); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(W * 0.4, H * 0.45, 9, 0, 7); c.arc(W * 0.6, H * 0.45, 9, 0, 7); c.fill(); c.fillRect(W * 0.38, H * 0.53, W * 0.24, 8); c.fillStyle = '#f4f4e8'; c.font = `${H * 0.05}px Bungee`; c.fillText('EVERY FRIDAY', W / 2, H * 0.95); }, false);
  const doodle = (x, y, rz, txt, col) => { const d = sign(g, 0.36, 0.3, x, y, -2.985, 0, (c, W, H) => { c.fillStyle = '#f4f0e2'; c.fillRect(0, 0, W, H); c.strokeStyle = col; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.arc(W * 0.3, H * 0.4, 50, 0, 7); c.moveTo(W * 0.3, H * 0.55); c.lineTo(W * 0.3, H * 0.85); c.moveTo(W * 0.18, H * 0.68); c.lineTo(W * 0.42, H * 0.68); c.stroke(); c.fillStyle = col; c.font = `${H * 0.12}px monospace`; txt.split('\n').forEach((l, i) => c.fillText(l, W * 0.5, H * (0.3 + i * 0.16))); }, false, 256); d.rotation.z = rz; };
  doodle(1.05, 1.85, 0.08, 'MY\nFRIEND\nBING', '#3f8f17'); doodle(1.5, 1.5, -0.1, 'DONT\nSTOP THE\nMUSIC', '#7a1522'); doodle(1.0, 1.42, -0.04, 'SAL IS\nTHIRSTY', '#2f5fc4');
  B(g, 1.4, 0.7, 0.3, BLACK, 0, 2.55, -3.13); for (let i = 0; i < 6; i++) B(g, 1.4, 0.025, 0.05, steel, 0, 2.27 + i * 0.112, -2.96).rotation.x = 0.5;
  for (const [x, y, w, h] of [[0, 2.93, 1.56, 0.08], [0, 2.17, 1.56, 0.08], [-0.74, 2.55, 0.08, 0.84], [0.74, 2.55, 0.08, 0.84]]) B(g, w, h, 0.07, steel, x, y, -2.95);
  P.shutter = B(g, 1.4, 0.7, 0.05, new THREE.MeshStandardMaterial({ map: slab, metalness: 0.6, roughness: 0.45 }), 0, 3.6, -2.9);
  P.ventEyes = new THREE.Group(); for (const s of [-1, 1]) add(P.ventEyes, gSph(0.05, 10), glow(0xff2a1e, 3), s * 0.17, 2.55, -2.99); g.add(P.ventEyes);
  B(g, 0.52, 0.46, 0.08, dark, 1.2, 2.55, -2.96); P.sealBtn = new THREE.MeshStandardMaterial({ color: 0x3ad7ff, emissive: 0x3ad7ff, emissiveIntensity: 0.06, roughness: 0.35 }); add(g, sq(0.17, 0.14, 0.045, 5, 14), P.sealBtn, 1.2, 2.55, -2.91);
  sign(g, 0.3, 0.1, 1.2, 2.55, -2.862, 0, label('VENT', '#111', null, 0.72), false, 128).material.transparent = true;
  BTN.push({ id: 'seal', p: new THREE.Vector3(1.2, 2.55, -2.9), r: 54 });
  tube(g, [[1.2, 2.3, -2.97], [1.25, 1.6, -2.97], [1.9, 0.9, -2.97], [2.0, 0.05, -2.97]], 0.014, BLACK);
  // wall clock: the hour hand follows the night
  add(g, gCyl(0.24, 0.24, 0.04, 28), plastic(0xf1ead8), 3.5, 2.6, -2.97).rotation.x = Math.PI / 2; add(g, new THREE.TorusGeometry(0.24, 0.02, 8, 28), dark, 3.5, 2.6, -2.95);
  for (let i = 0; i < 12; i++) B(g, 0.012, 0.04, 0.005, BLACK, 3.5 + Math.sin(i * TAU / 12) * 0.2, 2.6 + Math.cos(i * TAU / 12) * 0.2, -2.948).rotation.z = -i * TAU / 12;
  P.hand = new THREE.Group(); P.hand.position.set(3.5, 2.6, -2.944); g.add(P.hand); B(P.hand, 0.022, 0.13, 0.005, BLACK, 0, 0.065, 0); P.hand2 = new THREE.Group(); P.hand2.position.set(3.5, 2.6, -2.942); g.add(P.hand2); B(P.hand2, 0.012, 0.19, 0.005, paint(0xc0392b), 0, 0.095, 0);
  // string lights
  P.bulbs = []; const pts = []; for (let i = 0; i <= 18; i++) pts.push([-3.9 + i * 0.433, 3.02 - Math.abs(Math.sin(i / 18 * Math.PI * 3)) * 0.14, -2.9]); tube(g, pts, 0.006, BLACK);
  pts.forEach((p, i) => { const m = glow(0xffffff); add(g, gSph(0.04, 10), m, p[0], p[1] - 0.05, p[2]); P.bulbs.push(m); });
  for (const z of [-2.2, -1.9]) add(g, gCyl(0.05, 0.05, 8, 8), steel, 0, 3.12, z).rotation.z = Math.PI / 2;
  // hanging lamp over the desk
  P.lamp = new THREE.Group(); P.lamp.position.set(0, 3.2, 0.6); g.add(P.lamp);
  add(P.lamp, gCyl(0.008, 0.008, 0.55, 6), BLACK, 0, -0.27, 0); add(P.lamp, lathe([[0.03, 0], [0.06, -0.03], [0.34, -0.2], [0.35, -0.22]], 24), new THREE.MeshStandardMaterial({ color: 0x1f4a3a, roughness: 0.4, side: THREE.DoubleSide }), 0, -0.52, 0).userData.noShadow = true;
  P.lampGlow = glow(0xfff0c8, 3); add(P.lamp, gSph(0.06, 12), P.lampGlow, 0, -0.68, 0); P.lampBeam = beam(P.lamp, 0, -0.7, 0, 1.9, 2.4, 0xfff0c8, 0.02);
  // desk
  const wood = woodMat({ roughness: 0.9 });
  for (const sx of [-1, 1]) prop(g, 'metal_office_desk', sx * 1.06, 0, 0.5, 0, 1.06, { tint: 0.28 });
  P.staticTex = tex(64, 48, (c, w, h) => { const im = c.createImageData(w, h); for (let i = 0; i < im.data.length; i += 4) { const v = rand() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } c.putImageData(im, 0, 0); }, { repeat: [1, 1] }); P.staticTex.magFilter = THREE.NearestFilter;
  const tv = (id, x, y, z, ry, sc, w, h, d, sx = -0.07) => { const hd = prop(g, id, x, y, z, ry, sc); const gm = new THREE.MeshBasicMaterial({ map: P.staticTex }); const scr = add(hd, new THREE.PlaneGeometry(w * 0.6, h * 0.58), gm, w * sx, h * 0.52, d / 2 + 0.004); scr.userData.noShadow = true; return gm; };
  P.crts = [tv('Television_01', -1.3, 0.836, 0.35, 0.25, 1.15, 0.6, 0.457, 0.471), tv('television_02', -1.24, 1.362, 0.3, 0.38, 1.1, 0.4, 0.411, 0.35), tv('Television_01', 1.62, 0.836, 0.3, -0.45, 0.95, 0.6, 0.457, 0.471)];
  // real props around the office
  prop(g, 'boombox', -1.78, 0.836, 0.82, 0.6, 0.62); prop(g, 'desk_lamp_arm_01', -0.62, 0.9, 0.2, 0.7, 0.7);
  prop(g, 'security_camera_01', -3.55, 2.85, -2.75, 0.7, 1.2); prop(g, 'fire_alarm', 3.5, 1.95, -2.985, 0, 1.6);
  prop(g, 'utility_box_01', -3.62, 0, -2.6, 0, 1); prop(g, 'korean_fire_extinguisher_01', -3.0, 0, -2.75, 0.4, 1); prop(g, 'power_box_01', 3.93, 2.25, -2.3, -Math.PI / 2, 1);
  prop(g, 'portable_generator', 2.75, 0, 0.9, -0.7, 1); tube(g, [[2.5, 0.3, 0.8], [2.2, 0.05, 0.6], [1.6, 0.05, 0.2], [1.2, 0.5, 0.1], [1.05, 0.86, 0.22]], 0.012, BLACK);
  prop(g, 'cardboard_box_01', 3.0, 0, -2.5, 0.3, 1.1); prop(g, 'cardboard_box_01', 3.45, 0, -2.2, -0.5, 1); prop(g, 'cardboard_box_01', 3.05, 0.37, -2.5, 0.9, 0.9); prop(g, 'SchoolChair_01', -2.8, 0, 1.5, 2.3, 1); prop(g, 'trashbag', 3.5, 0, -1.6, 1, 1);
  B(g, 0.5, 0.03, 0.18, dark, -0.55, 0.85, 0.82).rotation.y = 0.15; for (let i = 0; i < 4; i++) { const pp = B(g, 0.21, 0.003, 0.3, paint(0xe9e6da), -0.1 + i * 0.16, 0.838 + i * 0.002, 0.8 - (i % 2) * 0.1); pp.rotation.y = i * 0.7 - 0.6; }
  add(g, sq(0.14, 0.035, 0.1, 5, 12), dark, 0.62, 0.87, 0.72); add(g, limbGeo(0.03, 0.03, 0.24, 8), plastic(0x14171a), 0.5, 0.93, 0.72).rotation.z = -Math.PI / 2; P.phone = add(g, gSph(0.014, 8), glow(0x3a0d0a), 0.7, 0.905, 0.76).material;
  add(g, lathe([[0, 0], [0.042, 0], [0.055, 0.17], [0, 0.17]], 14), paint(0xc0392b, { roughness: 0.4 }), 1.25, 0.835, 0.78); add(g, gCyl(0.006, 0.006, 0.22, 6), paint(0xf4f4e8), 1.26, 1.0, 0.78).rotation.z = 0.25;
  add(g, lathe([[0, 0], [0.14, 0], [0.13, 0.03], [0.03, 0.05], [0.025, 0.34], [0, 0.34]], 18), dark, 0.2, 0.835, 0.33);
  P.fan = new THREE.Group(); P.fan.position.set(0.2, 1.24, 0.36); g.add(P.fan); for (let i = 0; i < 4; i++) { const b = add(P.fan, sq(0.1, 0.05, 0.006, 2.2, 10), metal(0x9aa2a8, 0.3), 0, 0, 0); b.geometry.translate(0.12, 0, 0); b.rotation.z = i * TAU / 4; }
  for (const [z, r] of [[0.3, 0.25], [0.36, 0.26], [0.42, 0.25]]) add(g, new THREE.TorusGeometry(r, 0.006, 6, 28), steel, 0.2, 1.24, z); for (let i = 0; i < 12; i++) { const sp = add(g, gCyl(0.004, 0.004, 0.25, 4), steel, 0.2 + Math.cos(i * TAU / 12) * 0.125, 1.24 + Math.sin(i * TAU / 12) * 0.125, 0.425); sp.rotation.z = i * TAU / 12 + Math.PI / 2; }
  const plushB = makeBot('bing'); plushB.visible = true; plushB.scale.setScalar(0.17); plushB.position.set(-0.05, 0.835, 0.68); plushB.rotation.y = 0.3; g.add(plushB); P.plush = plushB;
  // hand-crank generator
  add(g, sq(0.22, 0.16, 0.16, 7, 16), new THREE.MeshStandardMaterial({ color: 0xb8860b, map: GRIME, metalness: 0.6, roughness: 0.45 }), 1.0, 0.995, 0.3);
  sign(g, 0.16, 0.16, 0.9, 1.03, 0.462, 0, (c, W, H) => { c.fillStyle = '#f1ead8'; c.beginPath(); c.arc(W / 2, H / 2, W / 2, 0, 7); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 10; c.beginPath(); c.arc(W / 2, H / 2, W * 0.36, Math.PI * 0.8, Math.PI * 2.2); c.stroke(); c.strokeStyle = '#c0392b'; c.beginPath(); c.moveTo(W / 2, H / 2); c.lineTo(W * 0.72, H * 0.3); c.stroke(); }, false, 128).material.transparent = true;
  sign(g, 0.2, 0.05, 1.08, 0.9, 0.462, 0, label('CRANK (G)', '#111', '#e8b923', 0.7), false, 128);
  P.crank = new THREE.Group(); P.crank.position.set(1.1, 1.02, 0.47); g.add(P.crank); add(P.crank, gCyl(0.02, 0.02, 0.04, 10), ENDO).rotation.x = Math.PI / 2; add(P.crank, gCyl(0.012, 0.012, 0.13, 8), ENDO, 0, 0.06, 0.02); add(P.crank, limbGeo(0.024, 0.024, 0.09, 8), plastic(0xc0392b), 0, 0.12, 0.11).rotation.x = Math.PI / 2;
  BTN.push({ id: 'crank', p: new THREE.Vector3(1.05, 1.0, 0.46), r: 62 });
  // dust in the lamp light
  const dg = new THREE.BufferGeometry(), dp = new Float32Array(180 * 3); for (let i = 0; i < 180; i++) { dp[i * 3] = (rand() - 0.5) * 5; dp[i * 3 + 1] = 0.6 + rand() * 2.4; dp[i * 3 + 2] = -2 + rand() * 4; } dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  P.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.014, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); g.add(P.dust);
}

function set(id, ox, def, build) { const g = new THREE.Group(); g.position.set(ox, 0, 0); scene.add(g); ROOM[id] = { ...def, ox, fx: [] }; build(g, ROOM[id].fx); }
function buildSets() {
  const wood = woodMat({ roughness: 0.9 }), dark = paint(0x14171a, { roughness: 0.6 }), steel = metal(0x7b838a, 0.35), chrome = metal(0xc8ccd0, 0.15);
  set('stage', 100, { cam: [3.9, 3.0, 4.6], look: [0, 1.75, -3], amb: 0.1, key: [0.5, 4.7, 2.2, 0, 1.4, -3, 0xfff0d8, 420, 0.72, 0.5, 14], fills: [[-4.5, 3.4, -0.5, 0x7a5cff, 40, 10], [4.5, 3.4, -0.5, 0x3ad7ff, 30, 10], [0, 1.2, 0.2, 0xffb060, 8, 6]], spots: { bing: [0, 0.6, -3, 0], dylan: [-2.9, 0.6, -2.8, 0.25], gavin: [3.1, 0.6, -2.8, -0.25] }, pose: 'stage' }, (g, fx) => {
    shell(g, 14, 5, 10, wallMat('#2c1c50', '#170e2c'), floorMat(14, 10, '#16121f', '#3d3550'), CEIL);
    B(g, 10.6, 0.55, 3.7, wood, 0, 0.275, -3.1); B(g, 10.7, 0.08, 3.8, pbrMat('wood_floor_worn', 5, 2, { color: 0x9a8a7a }), 0, 0.58, -3.1); B(g, 3, 0.28, 0.5, wood, 0, 0.14, -1.0);
    for (let i = 0; i < 17; i++) add(g, gSph(0.045, 8), glow(0xffd98a, 1.6), -5.1 + i * 0.64, 0.42, -1.22);
    sign(g, 10, 4.3, 0, 2.85, -4.96, 0, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#140b2a'); gr.addColorStop(1, '#3a1d5a'); c.fillStyle = gr; c.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,${200 + rand() * 55},${90 + rand() * 120},${0.4 + rand() * 0.6})`; c.beginPath(); c.arc(rand() * w, rand() * h, 1 + rand() * 3, 0, 7); c.fill(); } c.textAlign = 'center'; c.shadowColor = '#9dff3a'; c.shadowBlur = 26; c.fillStyle = '#d9ffa8'; c.font = `${h * 0.3}px Bungee`; c.fillText("BING'S", w / 2, h * 0.36); c.shadowBlur = 0; c.fillStyle = '#f4f4e8'; c.font = `${h * 0.085}px Bungee`; c.fillText('ARCADE & GRILL', w / 2, h * 0.5); }, false);
    curtain(g, 2.6, 5, -5.9, 2.5, -1.25); curtain(g, 2.6, 5, 5.9, 2.5, -1.25); curtain(g, 14, 0.95, 0, 4.55, -1.15, 0, 0x6a0f1a);
    add(g, gCyl(0.05, 0.05, 11, 8), steel, 0, 4.55, 0.8).rotation.z = Math.PI / 2;
    [[-3.6, 0x7a5cff], [-1.2, 0xfff0d8], [1.2, 0xfff0d8], [3.6, 0x3ad7ff]].forEach(([x, col]) => { const cn = add(g, gCyl(0.13, 0.17, 0.34, 14), dark, x, 4.38, 0.8); cn.rotation.x = 0.85; add(g, gCyl(0.12, 0.12, 0.01, 14), glow(col, 2.5), x, 4.27, 0.67).rotation.x = 0.85; const b = beam(g, x, 4.3, 0.7, 1.5, 4.6, col, 0.045); const cone = g.children[g.children.length - 1]; cone.position.set(x * 0.92, 2.6, -1.3); cone.rotation.x = 0.72; fx.push(b); });
    for (const s of [-1, 1]) { B(g, 0.9, 1.5, 0.8, dark, s * 4.6, 1.33, -2.0); for (const y of [1.0, 1.65]) add(g, gCyl(0.28, 0.28, 0.02, 20), paint(0x2a2d31, { roughness: 0.4 }), s * 4.6, y, -1.59).rotation.x = Math.PI / 2; }
    for (let i = 0; i < 16; i++) { const t = new THREE.Shape(); t.moveTo(-0.16, 0); t.lineTo(0.16, 0); t.lineTo(0, -0.34); const x = -6.4 + i * 0.85; const f = add(g, new THREE.ShapeGeometry(t), paint([0xe23d3d, 0xffd23a, 0x3ad7ff, 0x9dff3a][i % 4], { side: THREE.DoubleSide }), x, 4.2 - Math.sin(i / 15 * Math.PI) * 0.5, 1.6); f.userData.noShadow = true; }
    for (const [x, z] of [[-3.4, 2.6], [1.0, 3.2]]) { add(g, gCyl(0.75, 0.75, 0.04, 28), paint(0xf1ead8), x, 0.76, z); add(g, gCyl(0.76, 0.8, 0.3, 28, 1), suit(0xf1ead8), x, 0.62, z); add(g, gCyl(0.06, 0.06, 0.74, 10), dark, x, 0.37, z); for (let k = 0; k < 4; k++) { const a = k * 1.6 + x; add(g, new THREE.ConeGeometry(0.09, 0.24, 14), plastic([0xe23d3d, 0x3ad7ff, 0xffd23a, 0x9dff3a][k]), x + Math.cos(a) * 0.45, 0.9, z + Math.sin(a) * 0.45); add(g, gCyl(0.13, 0.13, 0.012, 16), plastic(0xffffff), x + Math.cos(a + 0.8) * 0.5, 0.79, z + Math.sin(a + 0.8) * 0.5); } }
    for (const [x, z, n] of [[-3.4, 2.6, 4], [1.0, 3.2, 3]]) for (let k = 0; k < n; k++) { const a = k * (6.283 / n) + x; prop(g, 'dining_chair_02', x + Math.cos(a) * 1.15, 0, z + Math.sin(a) * 1.15, -a - Math.PI / 2, 1); }
    prop(g, 'strawberry_chocolate_cake', -3.4, 0.782, 2.6, 0.4, 1.7); prop(g, 'strawberry_chocolate_cake', 1.0, 0.782, 3.2, 1.4, 1.5);
    [[-6.2, 2.3, 0.6, 0xe23d3d], [-5.9, 2.7, 0.9, 0xffd23a], [-6.4, 2.9, 1.0, 0x3ad7ff], [6.2, 2.4, 0.4, 0x9dff3a], [6.0, 2.8, 0.8, 0xe23d3d]].forEach(b => balloon(g, ...b));
  });
  set('arcade', 200, { cam: [4.9, 2.9, 4.2], look: [-0.3, 1.2, -2.6], amb: 0.07, key: [1, 3.8, 1.5, -0.5, 0.8, -2.5, 0x9fb4ff, 260, 0.85, 0.6, 13, 1], fills: [[-5, 1.6, -3.8, 0x3ad7ff, 16, 7], [4, 1.6, -3.8, 0xff7ad0, 14, 7], [-6.4, 1.5, 0.5, 0xffd23a, 10, 6]], spots: { dylan: [-2.6, 0, -0.6, 0.6], gavin: [2.6, 0, -1.8, 0.2], bing: [-0.2, 0, -3.3, 0.4] }, pose: 'idle' }, (g, fx) => {
    const carpet = tex(256, 256, (c, w, h) => { c.fillStyle = '#0e0b24'; c.fillRect(0, 0, w, h); const cols = ['#ff3da5', '#3ad7ff', '#ffd23a', '#9dff3a', '#a05cff']; for (let i = 0; i < 70; i++) { c.strokeStyle = c.fillStyle = cols[i % 5]; c.lineWidth = 3; const x = rand() * w, y = rand() * h, k = i % 4; c.beginPath(); if (k === 0) { c.moveTo(x, y); c.lineTo(x + 14, y + 4); c.lineTo(x + 5, y + 15); c.closePath(); c.stroke(); } else if (k === 1) { c.arc(x, y, 3, 0, 7); c.fill(); } else if (k === 2) { c.moveTo(x, y); c.bezierCurveTo(x + 8, y - 12, x + 14, y + 12, x + 24, y); c.stroke(); } else c.strokeRect(x, y, 9, 9); } }, { repeat: [4, 3] });
    shell(g, 16, 4, 12, wallMat('#1a2344', '#0e1328', false), new THREE.MeshStandardMaterial({ map: carpet, roughness: 1, normalMap: ptex('dirty_carpet_n', 6, 4.5) }), CEIL);
    prop(g, 'Sofa_01', 7.3, 0, -1.2, -Math.PI / 2, 1.15); prop(g, 'Television_01', 5.2, 0.5, -1.2, Math.PI / 2, 1.1); prop(g, 'wooden_crate_02', 5.2, 0, -1.2, Math.PI / 2, 1.05); prop(g, 'gaming_console', 5.75, 0, -0.9, 1.9, 1.2); prop(g, 'metal_trash_can', -7.2, 0, 4.6, 0.3, 0.75); prop(g, 'plastic_monobloc_chair_01', 6.6, 0, 0.6, -2.2, 1);
    const names = ['ZAP!', 'MOON MAZE', 'BING BALL', 'ROBO RUN', 'STAR HOP', 'TURBO', 'CLOSE CALL', 'GHOST GRID', 'PIXEL PIT'];
    for (let i = 0; i < 6; i++) cabinet(g, -6 + i * 2.4, -5.45, 0, (i * 0.17 + 0.05) % 1, names[i], i % 4);
    for (let i = 0; i < 3; i++) cabinet(g, -7.45, -2.2 + i * 2.2, Math.PI / 2, (0.6 + i * 0.13) % 1, names[6 + i], (i + 2) % 4);
    neonSign(g, 4.2, 0.85, 0, 3.3, -5.97, 0, 'HIGH SCORES', '#3ad7ff');
    tube(g, [[3.2, 3.5, -5.95], [3.6, 3.1, -5.95], [3.3, 3.05, -5.95], [3.8, 2.6, -5.95]], 0.03, glow(0xffd23a, 2.4)); tube(g, [[-3.9, 3.5, -5.95], [-3.4, 3.3, -5.95], [-3.9, 3.0, -5.95], [-3.4, 2.75, -5.95]], 0.03, glow(0xff3da5, 2.4));
    const ah = new THREE.Group(); ah.position.set(3.6, 0, 1.6); ah.rotation.y = 0.3; g.add(ah); add(ah, sq(1.1, 0.06, 0.6, 8, 16), plastic(0xf4f4f4), 0, 0.82, 0); add(ah, sq(1.12, 0.3, 0.62, 8, 16), paint(0x1b3a80), 0, 0.5, 0); add(ah, gBox(2.24, 0.03, 0.03), glow(0x3ad7ff, 2), 0, 0.9, 0.6); add(ah, gBox(2.24, 0.03, 0.03), glow(0x3ad7ff, 2), 0, 0.9, -0.6); for (const x of [-0.9, 0.9]) add(ah, gCyl(0.05, 0.05, 0.36, 8), dark, x, 0.18, 0); add(ah, gCyl(0.07, 0.07, 0.03, 14), plastic(0xe23d3d), 0.3, 0.9, 0.1);
    fx.push(...lampFix(g, 1, 4, 1.5, 0x9fb4ff));
    for (let i = 0; i < 8; i++) { const st = add(g, new THREE.OctahedronGeometry(0.12), plastic([0xffd23a, 0x3ad7ff, 0xff3da5][i % 3]), -6 + i * 1.7, 3.3 - (i % 2) * 0.3, 2 - (i % 3)); st.scale.y = 1.4; add(g, gCyl(0.004, 0.004, 0.7, 4), paint(0x888888), -6 + i * 1.7, 3.75 - (i % 2) * 0.15, 2 - (i % 3)); }
  });
  set('bar', 300, { cam: [2.3, 2.35, 3.0], look: [0, 1.5, -1.2], amb: 0.07, key: [0.6, 3.7, 3.2, 0, 1.3, -1.2, 0xffd9a8, 260, 0.75, 0.55, 12], fills: [[0, 2.6, -3.7, 0xffa030, 22, 6, 1], [-2.6, 2.3, 0.2, 0xffc070, 12, 5], [2.6, 2.3, 0.2, 0xffc070, 12, 5]], spots: { sal: [0, 0, -1.25, 0] }, pose: 'bar' }, (g, fx) => {
    shell(g, 10, 4, 9, () => new THREE.MeshStandardMaterial({ map: WOOD, color: 0x8a6a50, roughness: 0.7 }), pbrMat('wood_floor_worn', 5, 4.5, { color: 0x8a7a6a }), CEIL);
    prop(g, 'CashRegister_01', -2.95, 1.155, 0.05, 0.25, 0.75); prop(g, 'wine_bottles_01', -2.2, 1.155, -0.2, 0.2, 1); prop(g, 'wine_barrel_01', -4.3, 0, -2.6, 0.4, 1); prop(g, 'wine_barrel_01', -4.3, 0, -1.6, 1.4, 1); prop(g, 'wine_barrel_01', -4.3, 0.88, -2.1, 2.2, 0.9); prop(g, 'wooden_crate_02', 4.2, 0, -3.0, 0.3, 1); prop(g, 'wine_bottles_01', 3.9, 0.47, -3.0, 0.3, 0.9);
    B(g, 7.2, 1.08, 0.8, wood, 0, 0.54, 0); B(g, 7.5, 0.07, 1.05, woodMat({ color: 0xd9b48a, roughness: 0.45 }, 4, 1), 0, 1.12, 0); add(g, gCyl(0.03, 0.03, 7.3, 10), metal(0xd9a13a, 0.25), 0, 0.22, 0.52).rotation.z = Math.PI / 2;
    B(g, 6.6, 2.6, 0.3, paint(0x2a1a10, { map: WOOD }), 0, 1.5, -4.3);
    const shapes = [[[0, 0], [0.055, 0], [0.058, 0.2], [0.02, 0.3], [0.02, 0.4], [0, 0.4]], [[0, 0], [0.07, 0], [0.07, 0.16], [0.025, 0.24], [0.022, 0.36], [0, 0.36]], [[0, 0], [0.045, 0], [0.05, 0.28], [0.018, 0.36], [0.018, 0.46], [0, 0.46]]];
    for (let r = 0; r < 3; r++) { B(g, 6.2, 0.05, 0.34, wood, 0, 1.25 + r * 0.62, -4.05); add(g, gBox(6.1, 0.02, 0.02), glow(0xffa030, 2.2), 0, 1.22 + r * 0.62, -3.9); for (let i = 0; i < 14; i++) { const col = new THREE.Color().setHSL(((i * 47 + r * 90) % 360) / 360, 0.6, 0.3); add(g, lathe(shapes[(i + r) % 3], 12), glass(col, 0.82), -2.85 + i * 0.44 + (r % 2) * 0.1, 1.275 + r * 0.62, -4.05); } }
    neonSign(g, 3.3, 0.95, 0, 3.45, -4.44, 0, 'THE TAP', '#ffb020');
    for (const x of [-2.4, 0, 2.4]) { add(g, gCyl(0.006, 0.006, 0.9, 4), BLACK, x, 3.55, 0.2); add(g, lathe([[0.03, 0], [0.22, -0.2], [0.23, -0.22]], 18), new THREE.MeshStandardMaterial({ color: 0x7a1f2b, roughness: 0.4, side: THREE.DoubleSide }), x, 3.12, 0.2).userData.noShadow = true; add(g, gSph(0.05, 10), glow(0xffd9a8, 3), x, 2.97, 0.2); fx.push(beam(g, x, 2.95, 0.2, 0.95, 1.85, 0xffd9a8, 0.05)); }
    add(g, sq(0.16, 0.26, 0.09, 5, 14), chrome, 2, 1.42, 0.05); for (let i = 0; i < 3; i++) { add(g, limbGeo(0.022, 0.03, 0.2, 8), plastic([0xe23d3d, 0xf2c230, 0x1c7f76][i]), 1.88 + i * 0.12, 1.86, 0.1); add(g, gCyl(0.012, 0.012, 0.1, 6), chrome, 1.88 + i * 0.12, 1.5, 0.19).rotation.x = Math.PI / 2; }
    P.stream = add(g, gCyl(0.014, 0.014, 0.33, 6), glow(0xd9a13a, 1.5), 2, 1.33, 0.24);
    add(g, gCyl(0.05, 0.04, 0.16, 12, 1, true), glass(0xffffff, 0.3), 2, 1.235, 0.24); for (const [x, z] of [[-1.5, 0.2], [-1.2, 0.3], [0.9, 0.25], [-2.8, 0.1]]) add(g, gCyl(0.045, 0.035, 0.14, 12, 1, true), glass(0xffffff, 0.3), x, 1.225, z);
    for (const x of [-2.6, -0.9, 0.9, 2.6]) stool(g, x, 1.15);
    P.shards = new THREE.Group(); for (let i = 0; i < 12; i++) { const s = add(P.shards, new THREE.TetrahedronGeometry(0.03 + (i % 3) * 0.02), glass(0x2a7a44, 0.7), -0.5 + (i * 0.37) % 1, 1.17, -0.3 + (i * 0.13) % 0.5); s.rotation.set(i, i * 2, i * 3); } const pud = add(P.shards, gCyl(0.4, 0.4, 0.004, 24), new THREE.MeshPhysicalMaterial({ color: 0xa87020, roughness: 0.05, transparent: true, opacity: 0.6 }), 0, 1.158, -0.05); pud.scale.z = 0.5; g.add(P.shards);
  });
  set('prize', 400, { cam: [1.7, 2.6, 4.3], look: [-0.5, 1.1, -1.2], amb: 0.07, key: [-1.2, 3.8, 1.8, -1.6, 0.5, -0.4, 0xfff0d0, 120, 0.62, 0.6, 12], fills: [[2.5, 3.2, 1.6, 0x8fd8ee, 16, 9, 1], [0, 2.2, -3.5, 0x3ad7ff, 14, 6], [-4, 1.5, -2, 0xff7ad0, 8, 5]], spots: { bing: [2.9, 0, 0.3, -0.35] }, pose: 'idle' }, (g, fx) => {
    shell(g, 11, 4, 9, wallMat('#1f3a40', '#12252a'), floorMat(11, 9), CEIL);
    for (let r = 0; r < 2; r++) { B(g, 9.4, 0.06, 0.5, wood, 0, 1.75 + r * 0.95, -4.2); for (let i = 0; i < 9; i++) plush(g, -4.2 + i * 1.05, 1.78 + r * 0.95, -4.2, new THREE.Color().setHSL(((i * 61 + r * 140) % 360) / 360, 0.6, 0.42), 1.05 + ((i + r) % 3) * 0.12); }
    B(g, 8, 0.35, 0.8, paint(0x1c7f76), 0, 0.175, -2.9); add(g, gBox(8, 0.6, 0.8), glass(0xbfe8ff, 0.18), 0, 0.65, -2.9); B(g, 8.1, 0.05, 0.9, metal(0xf2c230, 0.3), 0, 0.97, -2.9);
    for (let i = 0; i < 10; i++) add(g, [gSph(0.09, 10), new THREE.TorusGeometry(0.08, 0.03, 6, 14), new THREE.ConeGeometry(0.08, 0.18, 8), new THREE.OctahedronGeometry(0.1)][i % 4], plastic([0xe23d3d, 0xffd23a, 0x3ad7ff, 0x9dff3a, 0xff7ad0][i % 5]), -3.6 + i * 0.8, 0.46, -2.9);
    neonSign(g, 4.2, 0.85, 0, 3.52, -4.44, 0, 'PRIZE CORNER', '#3ad7ff');
    const roll = tex(64, 16, c => { c.fillStyle = '#f2c230'; c.fillRect(0, 0, 64, 16); c.fillStyle = '#7a1f2b'; for (let i = 0; i < 4; i++) c.fillRect(i * 16 + 15, 0, 1, 16); c.font = '7px monospace'; for (let i = 0; i < 4; i++) c.fillText('ONE', i * 16 + 1, 11); }, { repeat: [10, 1] });
    const gar = add(g, new THREE.PlaneGeometry(9, 0.16, 40, 1), new THREE.MeshStandardMaterial({ map: roll, side: THREE.DoubleSide }), 0, 3.0, -3.6); const ga = gar.geometry.attributes.position; for (let i = 0; i < ga.count; i++) ga.setY(i, ga.getY(i) - Math.abs(Math.sin(ga.getX(i) * 1.05)) * 0.4);
    add(g, gCyl(0.75, 0.8, 0.3, 28), suit(0x7a1f2b), -1.6, 0.15, -0.4); add(g, gCyl(0.78, 0.78, 0.03, 28), metal(0xf2c230, 0.3), -1.6, 0.31, -0.4);
    prop(g, 'wooden_display_shelves_01', 5.2, 0, -0.8, 0, 1.15); prop(g, 'wooden_display_shelves_01', 5.2, 0, 0.9, 0, 1.15); prop(g, 'treasure_chest', 4.1, 0, 2.6, -2.3, 0.9); prop(g, 'CashRegister_01', 3.2, 0.995, -2.9, 0, 0.75);
    prop(g, 'rubber_duck_toy', -3.2, 0.995, -2.85, 0.4, 0.7); prop(g, 'rubber_duck_toy', -2.7, 0.995, -2.95, -0.5, 0.55); prop(g, 'garden_gnome', -0.6, 0.995, -2.9, 0.2, 0.8); prop(g, 'garden_gnome', 0.1, 0.995, -2.95, -0.3, 0.65);
    P.box = makeMusicBox(); P.box.position.set(-1.6, 0.32, -0.4); P.box.rotation.y = 0.35; g.add(P.box);
    fx.push(beam(g, -1.3, 3.9, 1.2, 1.2, 3.6, 0xfff0d0, 0.05)); const bc = g.children[g.children.length - 1]; bc.position.set(-1.45, 2.1, 0.4); bc.rotation.x = -0.45;
    const cm = new THREE.Group(); cm.position.set(-4.5, 0, -1.6); cm.rotation.y = 0.5; g.add(cm); B(cm, 1, 0.9, 1, paint(0xc0392b, { roughness: 0.4 }), 0, 0.45, 0); add(cm, gBox(0.96, 1.1, 0.96), glass(0xcfeaff, 0.16), 0, 1.45, 0); B(cm, 1, 0.14, 1, paint(0xc0392b), 0, 2.07, 0); sign(cm, 0.9, 0.2, 0, 2.07, 0.505, 0, label('GRAB-A-PAL', '#fff', '#7a1522', 0.6), true, 256);
    for (let i = 0; i < 6; i++) plush(cm, -0.3 + (i % 3) * 0.3, 0.9 + (i > 2 ? 0.12 : 0), -0.2 + (i % 2) * 0.35, new THREE.Color().setHSL(i * 0.17, 0.6, 0.45), 0.7).rotation.set(i, i * 2, i);
    add(cm, gCyl(0.01, 0.01, 0.5, 6), chrome, 0.1, 1.75, 0); for (let k = 0; k < 3; k++) add(cm, new THREE.ConeGeometry(0.015, 0.16, 6), chrome, 0.1 + Math.cos(k * 2.1) * 0.05, 1.44, Math.sin(k * 2.1) * 0.05).rotation.set(Math.sin(k * 2.1) * 0.5, 0, -Math.cos(k * 2.1) * 0.5);
    [[4.6, 2.2, -3.2, 0xffd23a], [4.9, 2.6, -2.9, 0xe23d3d], [4.4, 2.8, -2.7, 0x3ad7ff]].forEach(b => balloon(g, ...b));
  });
  set('storage', 500, { cam: [2.7, 2.5, 3.4], look: [0, 1.25, -0.6], amb: 0.03, key: t => [Math.sin(t * 1.7) * 0.9, 2.42, 0, Math.sin(t * 1.7) * 1.9, 0, 0, 0xffe2a0, 190, 1.05, 0.7, 9], fills: [[-2, 1, 2.5, 0x334a66, 5, 6], [2.2, 1.9, 2.8, 0xffd9a0, 9, 6]], spots: { dylan: [0.4, 0, 0.5, 0.55] }, pose: 'idle' }, g => {
    shell(g, 8, 3.4, 8, wallMat('#2a2620', '#1a1712', false), pbrMat('concrete_floor_worn_001', 3, 3, { color: 0x8a8a86 }), CEIL);
    const boxT = tex(128, 128, (c, w, h) => { c.fillStyle = '#9a7648'; c.fillRect(0, 0, w, h); c.fillStyle = '#c9b48a'; c.fillRect(0, h * 0.44, w, h * 0.12); c.strokeStyle = 'rgba(0,0,0,.3)'; c.strokeRect(2, 2, w - 4, h - 4); c.fillStyle = 'rgba(0,0,0,.5)'; c.font = '14px monospace'; c.fillText('PARTS', 12, 30); });
    const boxM = new THREE.MeshStandardMaterial({ map: boxT, roughness: 0.9 });
    prop(g, 'steel_frame_shelves_03', -2.1, 0, -3.5, 0, 1.15);
    for (const [x, y, z, r, sc] of [[-3.3, 0, -2.4, 0.3, 1.2], [-2.7, 0, -2.3, -0.4, 1], [-3.25, 0.41, -2.4, 1.0, 0.95], [-1.0, 0, -2.5, 0.8, 1.3], [-3.4, 0, 0.2, 0.2, 1.1]]) prop(g, 'cardboard_box_01', x, y, z, r, sc);
    prop(g, 'wooden_crate_02', -3.3, 0, -1.2, 1.5, 1); prop(g, 'hand_truck', 3.4, 0, 1.4, -1.2, 1); prop(g, 'ladder_sectioned_01', 3.82, 0, -1.4, -Math.PI / 2, 1, { rz: 0.16 }); prop(g, 'old_tyre', 3.3, 0.33, 2.9, 0.5, 1.1); prop(g, 'old_tyre', 2.7, 0.09, 3.2, 0, 1.1, { rx: Math.PI / 2 });
    prop(g, 'tool_cart', -1.6, 0, 2.9, 2.9, 0.9); prop(g, 'metal_tool_chest', 3.0, 0.94, -3.25, -0.2, 0.8); prop(g, 'trashbag', -3.2, 0, 3.2, 0, 1.1); prop(g, 'trashbag', -2.6, 0, 3.4, 2, 0.9);
    B(g, 3.2, 0.07, 0.9, wood, 2.1, 0.9, -3.3); for (const x of [0.7, 3.5]) B(g, 0.08, 0.9, 0.8, wood, x, 0.45, -3.3);
    ['bing', 'dylan', 'gavin'].forEach((w, i) => { const h = makeHead(w, true); h.scale.setScalar(0.88); h.position.set(1.05 + i * 1.02, 0.94, -3.3); h.rotation.set(i === 1 ? 0.25 : 0, (i - 1) * -0.35, i === 2 ? 0.3 : 0); h.userData.jaw.rotation.x = 0.3 + i * 0.15; g.add(h); });
    const e = makeEndo(); e.position.set(-2.9, 0, 1.2); e.rotation.y = 1.1; g.add(e);
    P.bulb = add(g, gSph(0.06, 10), glow(0xffe2a0, 3.5), 0, 2.4, 0); P.cord = B(g, 0.008, 1, 0.008, BLACK, 0, 2.9, 0); P.cord.userData.noShadow = true;
    add(g, lathe([[0, 0], [0.19, 0], [0.23, 0.32], [0.21, 0.32], [0.18, 0.02], [0, 0.02]], 18), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5, side: THREE.DoubleSide }), -2.5, 0, 2.4); add(g, gCyl(0.018, 0.018, 1.6, 8), paint(0xd9b27a), -2.42, 0.8, 2.4).rotation.z = -0.25;
    sign(g, 1.6, 0.7, 3.2, 0.45, -0.4, -1.2, label("BING'S", '#7dcb35', '#1a1030', 0.6), false, 256).rotation.z = 0.12;
    for (let i = 0; i < 3; i++) add(g, gCyl(0.11, 0.11, 0.24, 14), paint([0x9a9a9a, 0x7dcb35, 0x2f62cc][i], { roughness: 0.4 }), 2.6 + (i % 2) * 0.26, 0.12 + (i === 2 ? 0.24 : 0), 2.4 + (i === 1 ? 0.2 : 0));
  });
  set('kitchen', 600, { cam: [3.3, 2.7, 3.6], look: [-0.3, 1.25, -0.6], amb: 0.07, key: [0.8, 3.5, 2.2, -0.4, 1, -0.4, 0xdff0ff, 120, 0.85, 0.6, 12, 1], fills: [[-3.3, 1.2, -2.5, 0xff6a1e, 22, 5, 1], [2.5, 2.5, -2.5, 0xbfe0ff, 10, 6]], spots: { gavin: [-0.4, 0, -0.1, 0.55] }, pose: 'idle' }, (g, fx) => {
    const tw = len => { const t = tileTex('#aeb8b2', '#9eaaa4', 8, '#4a524c'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 2.4, 1.5); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }); };
    prop(g, 'electric_stove', -2.05, 0, -3.42, 0, 1.05); prop(g, 'brass_pot_01', -2.12, 0.905, -3.5, 0.5, 0.8); prop(g, 'vintage_microwave', 3.0, 0.95, -3.5, -0.2, 0.5); prop(g, 'brass_pan_01', 0.9, 0.95, -3.3, 0.9, 1); prop(g, 'wooden_cutting_board', -0.4, 0.95, 2.2, 0.3, 1.1); prop(g, 'brass_pot_01', -1.1, 0.95, 2.3, 0, 1); prop(g, 'industrial_storage_cart', 3.7, 0, 1.6, 0.35, 0.8); prop(g, 'trashbag', 4.4, 0, 3.2, 1, 1.1); prop(g, 'metal_trash_can', -4.3, 0, 2.5, Math.PI / 2, 0.75);
    shell(g, 10, 3.6, 8, tw, floorMat(10, 8, '#101214', '#b9b4a6', 0.25), CEIL);
    const ss = metal(0x9aa2a8, 0.28);
    B(g, 5.4, 0.9, 0.85, ss, 1.0, 0.45, -3.5); B(g, 5.5, 0.05, 0.95, metal(0xb9c0c6, 0.2), 1.0, 0.925, -3.5);
    for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.13, 0.02, 6, 18), i === 1 ? glow(0x3a8cff, 2.2) : BLACK, 0.2 + (i % 2) * 0.5, 0.96, -3.7 + (i > 1 ? 0.4 : 0)).rotation.x = Math.PI / 2;
    const hood = add(g, gCyl(0.5, 1.0, 0.6, 4), ss, 0.45, 2.5, -3.5); hood.rotation.y = Math.PI / 4; hood.scale.z = 0.7; B(g, 0.5, 0.8, 0.4, ss, 0.45, 3.2, -3.6);
    B(g, 2.2, 2.3, 1.2, paint(0x6a3a2a, { map: tileTex('#7a4030', '#6a3626', 8, '#2a1a14'), roughness: 0.9 }), -3.5, 1.15, -3.3); add(g, new THREE.CircleGeometry(0.62, 24, 0, Math.PI), glow(0xff6a1e, 1.8), -3.5, 0.95, -2.69); B(g, 1.24, 0.35, 0.02, glow(0xff6a1e, 1.8), -3.5, 0.78, -2.69); B(g, 1.5, 0.08, 0.3, paint(0x3a2a22), -3.5, 0.58, -2.6);
    B(g, 1.4, 2.4, 1, metal(0xaab2b8, 0.3), 3.9, 1.2, -3.4); B(g, 0.02, 2.3, 0.02, BLACK, 3.9, 1.2, -2.89); for (const s of [-1, 1]) add(g, gCyl(0.02, 0.02, 0.7, 8), chrome, 3.9 + s * 0.08, 1.4, -2.86);
    add(g, gCyl(0.02, 0.02, 5.6, 8), steel, 0.6, 2.75, -2.3).rotation.z = Math.PI / 2; P.pots = [];
    for (let i = 0; i < 7; i++) { const p = new THREE.Group(); p.position.set(-2 + i * 0.85, 2.75, -2.3); g.add(p); add(p, gCyl(0.005, 0.005, 0.3, 4), steel, 0, -0.15, 0); if (i === 3) { B(p, 0.2, 0.26, 0.012, metal(0xc8ccd0, 0.2), 0, -0.5, 0); B(p, 0.05, 0.16, 0.03, wood, 0, -0.28, 0); } else if (i % 2) { add(p, gCyl(0.19, 0.16, 0.04, 18), metal(0x33383c, 0.5), 0, -0.52, 0).rotation.x = Math.PI / 2; add(p, gCyl(0.016, 0.016, 0.24, 6), metal(0x33383c, 0.5), 0, -0.28, 0); } else add(p, lathe([[0, 0], [0.15, 0], [0.18, 0.2], [0.16, 0.2], [0.14, 0.02], [0, 0.02]], 16), new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }), 0, -0.52, 0); P.pots.push(p); }
    for (let i = 0; i < 4; i++) B(g, 0.62, 0.06, 0.62, paint(0xb89a6a, { map: GRIME }), 2.4 + i * 0.02, 0.98 + i * 0.065, -3.45).rotation.y = i * 0.12;
    B(g, 0.5, 0.03, 0.34, wood, 1.4, 0.965, -3.3); const cl = B(g, 0.01, 0.2, 0.26, metal(0xd0d4d8, 0.15), 1.4, 1.08, -3.3); cl.rotation.x = 0.5; B(g, 0.03, 0.05, 0.16, BLACK, 1.4, 1.2, -3.14).rotation.x = 0.5;
    for (let i = 0; i < 6; i++) add(g, gCyl(0.14, 0.14, 0.014, 18), plastic(0xf4f4f4), -0.9, 0.96 + i * 0.016, -3.45);
    B(g, 2.2, 0.9, 1, ss, -0.5, 0.45, 2.2); B(g, 2.3, 0.05, 1.1, metal(0xb9c0c6, 0.2), -0.5, 0.925, 2.2);
    fx.push(...lampFix(g, 0.8, 3.6, 1.5, 0xdff0ff, true)); lampFix(g, -2.5, 3.6, -1, 0xdff0ff, true);
  });
  set('vent', 700, { cam: [0, 0.65, -0.2], look: [0, 0.65, -10], amb: 0.03, sway: 0, key: [0, 1.0, 0.4, 0, 0.5, -6, 0xaab8c4, 70, 0.5, 0.8, 13], fills: [[0, 0.9, -7, 0xffc0a0, 7, 8, 1], [0, 0.65, -13.6, 0xbfe0ff, 9, 5]], spots: {} }, g => {
    const duct = metal(0x7a848b, 0.42);
    shell(g, 1.3, 1.3, 15, () => duct, duct, duct, 0, -7.5);
    for (let z = -1.5; z > -15; z -= 1.5) for (const [x, y, w, h] of [[0, 0.02, 1.3, 0.04], [0, 1.28, 1.3, 0.04], [-0.63, 0.65, 0.04, 1.3], [0.63, 0.65, 0.04, 1.3]]) B(g, w, h, 0.07, steel, x, y, z);
    add(g, new THREE.PlaneGeometry(1.3, 1.3), glow(0x9fc0d8, 0.22), 0, 0.65, -14.95);
    P.ventFan = new THREE.Group(); P.ventFan.position.set(0, 0.65, -14.2); g.add(P.ventFan); for (let i = 0; i < 5; i++) { const b = add(P.ventFan, sq(0.28, 0.13, 0.01, 2.2, 10), BLACK); b.geometry.translate(0.3, 0, 0); b.rotation.z = i * TAU / 5; } add(P.ventFan, gCyl(0.1, 0.1, 0.06, 12), BLACK).rotation.x = Math.PI / 2;
    P.tokens = makeTokens(); g.add(P.tokens);
  });
  ROOM.whall = { ox: 0, cam: [-5.4, 2.6, -5.0], look: [-5.4, 1.2, -11], amb: 0.03, key: [-5.4, 3.1, -8, -5.4, 0, -8.3, 0xeaf2ff, 26, 1.15, 0.7, 9, 1], fills: [[-5.4, 2.9, -3.5, 0xeaf2ff, 18, 7], [-5.4, 2.9, -12.5, 0xeaf2ff, 18, 7, 1], [-5.4, 2.5, -15.6, 0x7dffa0, 4, 4]], spots: { dylan: [-5.6, 0, -8.2, 0], bing: [-5.2, 0, -10.6, 0] }, pose: 'idle', fx: [P.hallFx.L[2], P.hallFx.L[3]] };
  ROOM.ehall = { ox: 0, cam: [5.4, 2.6, -5.0], look: [5.4, 1.2, -11], amb: 0.03, key: [5.4, 3.1, -8, 5.4, 0, -8.3, 0xfff0d0, 26, 1.15, 0.7, 9, 1], fills: [[5.4, 2.9, -3.5, 0xfff0d0, 18, 7], [5.4, 2.9, -12.5, 0xfff0d0, 18, 7, 1], [5.4, 2.5, -15.6, 0x7dffa0, 4, 4]], spots: { gavin: [5.6, 0, -8.2, 0], bing: [5.2, 0, -10.6, 0] }, pose: 'idle', fx: [P.hallFx.R[2], P.hallFx.R[3]] };
  set('title', 800, { cam: [-0.5, 1.7, 2.7], look: [-0.75, 1.72, 0], amb: 0.015, sway: 0, key: [-1.8, 1.0, 2.4, 0, 1.7, 0, 0xfff0d8, 85, 0.8, 0.7, 8, 1], fills: [[1.8, 2.8, -0.3, 0x3ad7ff, 26, 5], [-1.4, 2.6, -0.8, 0xff4030, 10, 5], [0.2, 0.4, 1.6, 0xffd9a0, 4, 4]], spots: {} }, g => { curtain(g, 9, 5, 0, 2.5, -1.6); B(g, 9, 0.1, 6, wood, 0, -0.05, 0); });
  P.scareDoll = makeDoll(); P.scareDoll.scale.setScalar(2.3); P.scareDoll.visible = false; scene.add(P.scareDoll);
  P.scareTok = makeTokens(); scene.add(P.scareTok);
}

// ---------- the lens: everything the picture goes through last ----------
const FINAL = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, cam: { value: 0 }, warp: { value: 0.16 }, glitch: { value: 0 }, flash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, cam, warp, glitch, flash; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec2 uv = 0.5 + c * (1.0 + warp * r2) / (1.0 + warp * 0.25);
      if (cam > 0.5) { float line = floor(uv.y * 240.0); uv.x += (h(vec2(line, floor(time * 24.0))) - 0.5) * 0.003 * (1.0 + glitch * 40.0); uv.y = mix(uv.y, fract(uv.y + time * 0.9), step(0.5, glitch)); }
      float ca = (0.0012 + 0.003 * cam + 0.01 * flash) * (1.0 + r2 * 6.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ca).b);
      if (cam > 0.5) {
        float l = dot(col, vec3(0.3, 0.59, 0.11)); col = mix(col, vec3(l), 0.3) * vec3(0.94, 1.05, 0.97);
        col *= 0.86 + 0.14 * sin(uv.y * 720.0 * 3.14159);
        col += 0.05 * smoothstep(0.93, 1.0, fract(uv.y * 0.8 - time * 0.13));
        col += (h(uv * vec2(640.0, 360.0) + time * 60.0) - 0.5) * (0.07 + glitch * 0.8);
      } else col += (h(uv * vec2(1280.0, 720.0) + time * 60.0) - 0.5) * 0.05;
      col *= mix(0.12, 1.0, smoothstep(0.95, 0.3, length(c) * 1.2));
      col = mix(col, vec3(0.9, 0.05, 0.02), flash * 0.16);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function init(canvas) {
  R = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const pr = Math.min(1.5, window.devicePixelRatio || 1); R.setPixelRatio(pr); R.setSize(1280, 720, false);
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000); scene.fog = new THREE.FogExp2(0x020304, 0.035);
  cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 60);
  amb = new THREE.AmbientLight(0x8fa3b5, 0.05); scene.add(amb);
  key = new THREE.SpotLight(0xffffff, 0, 12, 0.8, 0.5, 2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.camera.near = 0.2; key.shadow.camera.far = 16; scene.add(key, key.target);
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); fills.push(l); }
  // a tiny studio for reflections on metal, glass and eyes
  const es = new THREE.Scene(); es.background = new THREE.Color(0x020203); add(es, gBox(4, 0.1, 4), glow(0xfff0d8, 3), 0, 4, 0); add(es, gBox(0.1, 3, 5), glow(0x3ad7ff, 1.2), -5, 0, 0); add(es, gBox(0.1, 3, 5), glow(0xffa040, 1.2), 5, 0, 0); add(es, gBox(5, 2, 0.1), glow(0x556677, 1), 0, 0, 5);
  const pm = new THREE.PMREMGenerator(R), envT = pm.fromScene(es, 0.04).texture; setEnv(envT); setPropEnv(envT); pm.dispose();
  for (const who of ['bing', 'dylan', 'gavin', 'sal']) { bots[who] = makeBot(who); scene.add(bots[who]); }
  buildOffice(); buildSets();
  scene.traverse(o => { if (!o.isMesh) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; const flat = m.isMeshBasicMaterial || m.transparent || o.userData.noShadow; o.castShadow = !flat; o.receiveShadow = !m.isMeshBasicMaterial; });
  composer = new EffectComposer(R, new THREE.WebGLRenderTarget(1280, 720, { type: THREE.HalfFloatType, samples: 4 })); composer.setPixelRatio(pr); composer.setSize(1280, 720);
  composer.addPass(new RenderPass(scene, cam)); bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.4, 0.6, 1.25); composer.addPass(bloom); composer.addPass(new OutputPass()); fin = new ShaderPass(FINAL); composer.addPass(fin);
}
const flick = (t, s = 0) => (Math.sin(t * 17 + s) > 0.2 || Math.sin(t * 3.1 + s) > 0) ? 1 : 0.2;
function light(room, t, ox, gain = 1) {
  const k = typeof room.key === 'function' ? room.key(t) : room.key, f = k && k[11] ? flick(t, 1) : 1;
  if (k) { key.position.set(k[0] + ox, k[1], k[2]); key.target.position.set(k[3] + ox, k[4], k[5]); key.color.set(k[6]); key.intensity = k[7] * gain * f * 0.24; key.angle = k[8]; key.penumbra = k[9]; key.distance = k[10]; } else key.intensity = 0;
  const list = room.fills || [];
  for (let i = 0; i < 3; i++) { const l = fills[i], s = list[i]; if (!s) { l.intensity = 0; continue; } l.position.set(s[0] + ox, s[1], s[2]); l.color.set(s[3]); l.intensity = s[4] * gain * (s[6] ? flick(t, i * 2 + 3) : 1) * 0.5; l.distance = s[5]; }
  for (const m of room.fx || []) { if (m.userData.c) m.color.copy(m.userData.c).multiplyScalar(0.25 + 0.75 * f); else if (m.userData.base) m.opacity = m.userData.base * f; }
  amb.intensity = room.amb;
}
function stand(m, x, y, z, ry, pose, t, o = {}) { m.visible = true; m.position.set(x, y, z); m.rotation.set(0, ry, Math.sin(t * 0.9 + m.userData.seed) * 0.012); setPose(m, pose, o.wob || 0); animate(m, t, cam.position, o); }

let last = 0, slow = 0;
// view: { type: 'office', yaw } | { type: 'cam', id, glitch } | { type: 'title' } | { type: 'scare', who, t, yaw }
export function render(view, s, t) {
  for (const k in bots) bots[k].visible = false;
  P.tokens.visible = P.scareTok.visible = P.scareDoll.visible = false;
  const office = view.type === 'office' || view.type === 'scare';
  let room = null;
  if (office) { cam.fov = 62; cam.position.set(Math.sin(t * 0.7) * 0.012, 1.5 + Math.sin(t * 1.1) * 0.008, 2.6); cam.rotation.order = 'YXZ'; cam.rotation.set(-0.06, view.yaw, 0); }
  else {
    room = ROOM[view.type === 'title' ? 'title' : view.id];
    const sw = room.sway === 0 ? 0 : Math.sin(t * 0.3) * 1.0, tt = view.type === 'title';
    cam.fov = tt ? 36 : 58; cam.position.set(room.cam[0] + room.ox + (tt ? Math.sin(t * 0.2) * 0.15 : 0), room.cam[1], room.cam[2] - (tt ? Math.sin(t * 0.13) * 0.2 : 0));
    cam.lookAt(room.look[0] + room.ox + sw, room.look[1], room.look[2]);
  }
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();

  if (s) {
    P.doorL.position.y = 3.8 - 2.55 * s.dl; P.doorR.position.y = 3.8 - 2.55 * s.dr; P.shutter.position.y = 3.6 - 1.05 * s.sv;
    P.doorLBtn.emissiveIntensity = s.doorL ? 2.4 : 0.06; P.doorRBtn.emissiveIntensity = s.doorR ? 2.4 : 0.06; P.lightLBtn.emissiveIntensity = s.lightL ? 2 : 0.06; P.lightRBtn.emissiveIntensity = s.lightR ? 2 : 0.06; P.sealBtn.emissiveIntensity = s.seal ? 2.4 : 0.06;
    P.ventEyes.visible = s.tok === 3 && s.sv < 0.6;
    if (!s.out) P.fan.rotation.z = t * 14;
    P.crank.rotation.z = s.crankA; P.phone.color.setHex(s.call && Math.sin(t * 10) > 0 ? 0xff3b2f : 0x3a0d0a).multiplyScalar(s.call ? 3 : 1);
    P.staticTex.offset.set(Math.random(), Math.random()); P.crts.forEach((m, i) => m.color.setRGB(0.1, 0.24, 0.16).multiplyScalar(s.out ? 0 : 0.8 + 0.25 * Math.sin(t * (19 + i * 7))));
    P.bulbs.forEach((m, i) => m.color.setHSL(i % 4 * 0.22, 0.9, s.out ? 0.01 : 0.3 + 0.25 * Math.sin(t * 2 + i)));
    P.hand.rotation.z = -s.clock * Math.PI; P.hand2.rotation.z = -s.clock * 6 * TAU;
    P.lamp.rotation.z = Math.sin(t * 0.8) * 0.035; P.dust.rotation.y = t * 0.02; P.dust.position.y = Math.sin(t * 0.3) * 0.05;
    if (office) animate(P.plush, t * 0.6, cam.position, {});
    for (const who of ['bing', 'dylan', 'gavin']) {
      const w = s.where[who]; if (!w) continue;
      const m = bots[who];
      if (w === 'doorL' || w === 'doorR') { const sd = w === 'doorL' ? -1 : 1; stand(m, sd * 5.2, 0, 0.2, -sd * Math.PI / 2, 'door', t, { glow: who === 'bing', jaw: 0.12 }); }
      else { const r = ROOM[w], p = r.spots[who]; if (!p) continue; stand(m, p[0] + r.ox, p[1], p[2], p[3], r.pose || 'idle', t, { glow: w !== 'stage' }); }
    }
    const sal = bots.sal, su = sal.userData;
    if (s.sal.at === 'bar') { const p = ROOM.bar.spots.sal; stand(sal, p[0] + 300, 0, p[2], Math.sin(t * 1.3) * 0.08, 'bar', t, { glow: s.sal.thirst < 25, wob: Math.sin(t * 1.7) * 0.08 }); sal.rotation.z = Math.sin(t * 1.1) * 0.05; su.liquid.scale.y = Math.max(0.03, s.sal.thirst / 100); su.liquid.position.y = -0.055 + 0.1 * su.liquid.scale.y; }
    else if (s.sal.at) { const sd = s.sal.at === 'L' ? -1 : 1, k = s.sal.k, z = -14 + 13.4 * Math.min(1, k / 0.9); stand(sal, sd * (5.4 - 0.2 * Math.max(0, (k - 0.75) / 0.25)) + Math.sin(t * 9) * 0.2 * (k < 0.9 ? 1 : 0), Math.abs(Math.sin(t * 12)) * 0.06, z, k > 0.9 ? -sd * Math.PI / 2 : 0, 'run', t, { glow: true, jaw: 0.3, wob: Math.sin(t * 12) * 0.5 }); sal.rotation.z = Math.sin(t * 9) * 0.12; su.liquid.scale.y = 0.03; }
    P.shards.visible = s.sal.at !== 'bar'; P.stream.visible = !!s.pour;
    const bu = P.box.userData; bu.crank.rotation.x = s.windA; bu.lid.rotation.x = s.awake ? -1.9 : 0;
    bu.dolls.forEach((d, i) => { d.position.y = s.awake ? 0.62 + Math.abs(Math.sin(t * 9 + i)) * 0.05 : -0.6; d.visible = s.awake; d.userData.pupil.emissiveIntensity = 6; d.rotation.y = -0.35 + Math.sin(t * 2 + i) * 0.25; d.rotation.z = Math.sin(t * 5) * 0.1; d.userData.key.rotation.z = t * 4; });
    bu.spring.visible = s.awake;
    if (s.tok > 0 && view.type === 'cam') { P.tokens.visible = true; P.tokens.position.set(Math.sin(t * 2.2) * 0.04, 0.42 + Math.sin(t * 7) * 0.012, [0, -11, -6.2, -1.6][s.tok]); P.tokens.rotation.z = Math.sin(t * 3) * 0.06; P.tokens.userData.arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 4 + i * 3) * 0.25; }); }
    P.ventFan.rotation.z = t * 3;
    P.bulb.position.x = Math.sin(t * 1.7) * 0.9; P.cord.position.x = P.bulb.position.x / 2; P.cord.rotation.z = Math.sin(t * 1.7) * 0.42;
    P.pots.forEach((p, i) => { p.rotation.z = Math.sin(t * 1.2 + i) * 0.07; });
    screens.forEach(k => k.m.color.setScalar(k.k === 3 ? 0.08 + (Math.sin(t * 30) > 0.9 ? 1 : 0) : 1.1 + 0.5 * Math.sin(t * (3 + k.k) + k.k)));
  }
  P.lampGlow.color.setRGB(3, 2.8, 2.3); P.lampBeam.opacity = 0.02; P.dust.visible = true;
  const U = fin.uniforms; U.time.value = t % 1000; U.glitch.value = 0; U.flash.value = 0; U.cam.value = 0; U.warp.value = WARP_OFFICE;
  if (view.type === 'title') {
    const tw = Math.sin(t * 0.7) > 0.96 || Math.sin(t * 2.3) > 0.985, m = bots[tw ? 'sal' : 'bing'];
    stand(m, 800 + (tw ? (Math.random() - 0.5) * 0.04 : 0), 0, 0, 0.2, 'stage', t, { glow: true, jaw: tw ? 0.45 : undefined, shake: tw ? 0.3 : 0 });
    light(room, t, 800); U.warp.value = 0.1; U.glitch.value = tw ? 0.4 : 0; U.cam.value = tw ? 1 : 0;
  } else if (view.type === 'cam') {
    light(room, t, room.ox, 1.8); amb.intensity = room.amb * 1.6; U.cam.value = 1; U.warp.value = WARP_CAM; U.glitch.value = view.glitch ? 1 : 0;
  } else if (view.type === 'office') {
    const o = s.out, f = s.intruder ? (Math.sin(t * 31) > 0.2 ? 0.1 : 1) : 0.94 + 0.06 * Math.sin(t * 47);
    if (o) {
      P.lampGlow.color.setScalar(0.01); P.lampBeam.opacity = 0; P.dust.visible = false;
      const e = s.eyes && Math.sin(t * 9) > -0.5; if (s.eyes) stand(bots.bing, -5.2, 0, 0.2, Math.PI / 2, 'door', t, { glow: e, jaw: 0.15 });
      light({ amb: 0.004, key: null, fills: [e ? [-4.4, 1.9, 0.5, 0xfff27a, 0.6, 3] : null, [0, 2, 2, 0x334455, 0.3, 6]] }, t, 0);
    } else {
      P.lampGlow.color.setRGB(3 * f, 2.8 * f, 2.3 * f); P.lampBeam.opacity = 0.02 * f;
      const lx = Math.sin(t * 0.8) * 0.02;
      light({ amb: 0.05, key: [lx, 2.5, 0.6, lx * 30, 0, 0.6, 0xfff0c8, 120 * f, 0.95, 0.7, 7], fills: [[0, 2.6, -1.7, 0xbfd6ff, 15 * f, 5.4], s.lightL ? [-4.4, 2.15, 0.2, 0xf2f6dc, 8 * flick(t * 2.3), 4.6] : [-1.2, 1.3, 1.0, 0x4dffa0, 1.5, 2.5], s.lightR ? [4.4, 2.15, 0.2, 0xf2f6dc, 8 * flick(t * 2.3), 4.6] : null] }, t, 0);
    }
  } else { // jumpscare, in the office
    const k = Math.min(1, view.t / 0.16), e = 1 - Math.pow(1 - k, 3), dist = 2.8 - (view.who === 'benton' ? 1.5 : 1.75) * e, dx = -Math.sin(view.yaw), dz = -Math.cos(view.yaw);
    const sh = () => (Math.random() - 0.5) * 0.07, x = dx * dist + sh(), z = 2.6 + dz * dist, ry = Math.atan2(-dx, -dz), jaw = 0.3 + 0.55 * Math.abs(Math.sin(view.t * 38));
    if (view.who === 'benton') { const d = P.scareDoll; d.visible = true; d.position.set(x, 1.5 - 1.66 + sh(), z); d.rotation.set(0, ry, sh() * 3); d.userData.pupil.emissiveIntensity = 8; d.userData.mouth.scale.set(1, 1 + jaw * 6, 1); d.userData.key.rotation.z = view.t * 30; }
    else if (view.who === 'tokens') { P.scareTok.visible = true; P.scareTok.position.set(x, 1.45 + sh() + (1 - e) * 1.3, z); P.scareTok.rotation.set(0.1, ry, sh() * 2); P.scareTok.scale.setScalar(1.25); P.scareTok.userData.arms.forEach((a, i) => { a.rotation.x = -0.6 + Math.sin(view.t * 30 + i * 3) * 0.3; }); }
    else { const m = bots[view.who]; stand(m, x, 1.5 - m.userData.eyeY + sh(), z, ry, 'scare', view.t, { glow: true, jaw, shake: 0.35, wide: true, wob: Math.sin(view.t * 30) * 0.15 }); m.rotation.z = sh() * 2; }
    light({ amb: 0.03, key: [dx * 0.2, 1.1, 2.6 + dz * 0.2, x, 1.5, z, 0xfff0e0, 13, 1.0, 0.8, 6], fills: [[0, 2.9, 0.4, 0xffe8c8, 5 * flick(view.t * 4), 5.7], [x - dz * 1.2, 2.2, z + dx * 1.2, 0xff3020, 9, 4]] }, t, 0);
    U.flash.value = Math.sin(view.t * 55) > 0.3 ? 1 : 0.3; U.warp.value = WARP_OFFICE + 0.12;
  }
  bloom.strength = view.type === 'cam' ? 0.5 : 0.4;
  if (quality > 0) composer.render(); else R.render(scene, cam);
  // drop quality on slow machines so the game stays playable
  const now = performance.now(), dt = now - last; last = now;
  if (dt < 250) { slow = dt > 36 ? slow + dt : Math.max(0, slow - dt * 0.5); if (slow > 3500 && quality > 0) { quality--; slow = 0; if (quality === 1) { R.setPixelRatio(1); composer.setPixelRatio(1); bloom.enabled = false; setFur(false); key.shadow.mapSize.set(512, 512); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } } else { key.castShadow = false; } } }
}
export const getQuality = () => quality;
// Where the office's 3D buttons are on the 1280x720 screen right now (call after render). Follows the lens warp.
export function buttons() {
  const out = [], w = quality > 0 ? WARP_OFFICE : 0;
  for (const b of BTN) {
    v3.copy(b.p).project(cam); if (v3.z > 1 || v3.z < -1) continue;
    let cx = v3.x * 0.5, cy = -v3.y * 0.5; const k = (1 + w * 0.25) / (1 + w * (cx * cx + cy * cy)); cx *= k; cy *= k;
    const x = (cx + 0.5) * 1280, y = (cy + 0.5) * 720; if (x < -60 || x > 1340) continue;
    out.push({ id: b.id, x: x - b.r, y: y - b.r, w: b.r * 2, h: b.r * 2 });
  }
  return out;
}
