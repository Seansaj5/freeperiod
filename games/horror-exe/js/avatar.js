// The survivors' bodies: a blocky avatar with real joints (waist, elbows, knees, ankles), hands with thumbs,
// sneakers, proper hair, layered clothes and each survivor's own gear. Animation is procedural, with
// knee and elbow bends, a twisting torso, a head that looks around, and work / carry / crawl poses.
// Static pieces that hang off the same joint and share a material are merged, so a whole avatar is
// only a few dozen draw calls.
import * as THREE from 'three';
import { CHARS } from '../shared/rules.js';
import { damp } from '../shared/util.js';
import { defaultLook } from '../shared/looks.js';
import { rbox, canvasTex, drawShirt, shade } from './rig.js';

const TAU = Math.PI * 2;
/** A material for a kind of surface (each avatar gets its own, since a disguise or fade changes opacity). */
function mat(kind, color, extra = {}) {
  const c = new THREE.Color(color);
  const rough = kind === 'skin' ? 0.55 : kind === 'shoe' ? 0.45 : kind === 'metal' ? 0.35 : kind === 'shiny' ? 0.3 : 0.82;
  return new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: kind === 'metal' ? 0.6 : 0, ...extra });
}
const luma = (hex) => { const c = new THREE.Color(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; };

/** A rounded box whose top and bottom have different widths (a chest that narrows to the waist). */
const taperCache = new Map();
function taperBox(w, h, d, r, topK, botK) {
  const key = [w, h, d, r, topK, botK].join();
  if (taperCache.has(key)) return taperCache.get(key);
  const g = rbox(w, h, d, r).clone(), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = (p.getY(i) + h / 2) / h, s = botK + (topK - botK) * k; p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * (0.92 + 0.08 * s)); }
  g.computeVertexNormals();
  taperCache.set(key, g);
  return g;
}

function mesh(parent, geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; }
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
const sphere = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (r0, r1, h, n = 14, open = false) => new THREE.CylinderGeometry(r0, r1, h, n, 1, open);

/** Builds the avatar into a Rig (rig.hips already sits at hip height). */
export function buildAvatar(rig, look, char) {
  const L = look && look.skin ? look : defaultLook(), ch = CHARS[char] || CHARS.bolt, acc = ch.accent;
  rig.avatar = true;
  const skin = mat('skin', L.skin), shirt = mat('cloth', L.shirt), shirtD = mat('cloth', shade(L.shirt, 0.78)), pants = mat('cloth', L.pants), pantsD = mat('cloth', shade(L.pants, 0.7));
  const darkPants = luma(L.pants) < 0.35;
  const shoeC = darkPants ? '#f1f1f1' : '#23252c', shoe = mat('shoe', shoeC), sole = mat('shoe', darkPants ? '#d8d8d8' : '#f4f4f4'), lace = mat('cloth', darkPants ? '#c8c8c8' : '#e8e8e8');
  const stripe = mat('shoe', luma(L.shirt) > 0.85 ? acc : L.shirt);
  const front = mat('cloth', '#ffffff', { map: canvasTex(`shirt:${L.shirt}:${L.pattern}:${L.style}`, 128, 128, (g, w, h) => { drawShirt(g, w, h, L.shirt, L.pattern); if (L.style === 'hoodie') { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(w * 0.2, h * 0.7, w * 0.6, h * 0.22); } }) });
  const style = L.style;

  // pelvis + belt
  const pelvis = mesh(rig.hips, rbox(0.84, 0.28, 0.42, 0.1), pants, 0, 0.08, 0);
  mesh(rig.hips, rbox(0.87, 0.075, 0.45, 0.03), mat('cloth', '#1d1a18'), 0, 0.2, 0);
  mesh(rig.hips, rbox(0.13, 0.08, 0.03, 0.015), mat('metal', '#c9b27a'), 0, 0.2, 0.225);
  rig.pelvis = pelvis;

  // chest (twists against the hips when running)
  const chest = joint(rig.hips, 0, 0.2, 0); rig.chest = chest;
  const torsoMats = [shirt, shirt, shirt, shirt, front, shirt];
  rig.torso = mesh(chest, taperBox(0.88, 0.7, 0.44, 0.12, 1, 0.88), torsoMats, 0, 0.35, 0);
  if (style === 'tank') {
    // bare shoulders: skin caps and straps
    for (const s of [-1, 1]) { mesh(chest, rbox(0.13, 0.05, 0.46, 0.02), shirt, s * 0.24, 0.71, 0); mesh(chest, sphere(0.16), skin, s * 0.43, 0.62, 0).scale.set(0.9, 0.6, 1); }
  }
  if (style === 'hoodie') {
    const hood = mesh(chest, new THREE.TorusGeometry(0.2, 0.1, 8, 18, Math.PI * 1.25), shirtD, 0, 0.74, -0.06); hood.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.375 + Math.PI);
    mesh(chest, rbox(0.46, 0.3, 0.12, 0.06), shirtD, 0, 0.66, -0.25).rotation.x = 0.35;
    for (const s of [-1, 1]) mesh(chest, cyl(0.016, 0.016, 0.26, 6), mat('cloth', '#f2f2f2'), s * 0.08, 0.56, 0.225);
    mesh(chest, rbox(0.5, 0.17, 0.04, 0.03), shirtD, 0, 0.14, 0.215);
  } else if (style !== 'tank') {
    const col = mesh(chest, new THREE.TorusGeometry(0.16, 0.04, 6, 18), shirtD, 0, 0.71, 0.01); col.rotation.x = Math.PI / 2;
  }
  // neck + head (the classic rounded head, so faces and hats keep working)
  mesh(chest, cyl(0.13, 0.14, 0.16, 14), skin, 0, 0.74, 0);
  rig.neck = joint(chest, 0, 0.7, 0);
  rig.head = joint(rig.neck, 0, 0, 0);
  mesh(rig.head, cyl(0.29, 0.29, 0.54, 28), skin, 0, 0.3, 0);
  const cap = mesh(rig.head, new THREE.SphereGeometry(0.29, 28, 8, 0, TAU, 0, Math.PI / 2), skin, 0, 0.57, 0); cap.scale.y = 0.25;
  const capB = mesh(rig.head, new THREE.SphereGeometry(0.29, 28, 8, 0, TAU, 0, Math.PI / 2), skin, 0, 0.03, 0); capB.scale.y = 0.25; capB.rotation.x = Math.PI;

  // arms: shoulder, elbow, wrist
  const sleeveLong = style === 'long' || style === 'hoodie';
  const mkArm = (side) => {
    const a = joint(chest, side * 0.585, 0.6, 0);
    mesh(a, sphere(0.155), style === 'tank' ? skin : shirt, 0, -0.02, 0).scale.set(1, 0.9, 1);
    mesh(a, rbox(0.27, 0.42, 0.28, 0.11), sleeveLong || style === 'tee' ? (sleeveLong ? shirt : skin) : skin, 0, -0.18, 0);
    if (style === 'tee') { mesh(a, rbox(0.31, 0.22, 0.32, 0.1), shirt, 0, -0.08, 0); mesh(a, rbox(0.315, 0.04, 0.325, 0.02), shirtD, 0, -0.18, 0); }
    const el = joint(a, 0, -0.38, 0);
    mesh(el, sphere(0.13), sleeveLong ? shirt : skin, 0, 0, 0);
    mesh(el, rbox(0.25, 0.34, 0.26, 0.1), sleeveLong ? shirt : skin, 0, -0.17, 0);
    if (sleeveLong) mesh(el, rbox(0.27, 0.07, 0.28, 0.03), shirtD, 0, -0.31, 0);
    const hand = joint(el, 0, -0.36, 0);
    mesh(hand, rbox(0.25, 0.24, 0.23, 0.1), skin, 0, -0.09, 0.01);
    const th = mesh(hand, rbox(0.08, 0.14, 0.09, 0.04), skin, -side * 0.12, -0.05, 0.07); th.rotation.z = -side * 0.35;
    a.userData.elbow = el; a.userData.hand = hand;
    return a;
  };
  rig.armR = mkArm(-1); rig.armL = mkArm(1);

  // legs: hip, knee, ankle, sneakers
  const mkLeg = (side) => {
    const g = joint(rig.hips, side * 0.21, 0.02, 0);
    mesh(g, rbox(0.35, 0.47, 0.37, 0.11), pants, 0, -0.21, 0);
    const kn = joint(g, 0, -0.44, 0);
    mesh(kn, sphere(0.15), pants, 0, 0, 0);
    mesh(kn, rbox(0.31, 0.36, 0.33, 0.1), pants, 0, -0.17, 0);
    mesh(kn, rbox(0.33, 0.05, 0.35, 0.02), pantsD, 0, -0.31, 0);
    const an = joint(kn, 0, -0.36, 0);
    const f = mesh(an, rbox(0.33, 0.15, 0.5, 0.07), shoe, 0, -0.03, 0.06); f.userData.keep = true;
    mesh(an, rbox(0.35, 0.05, 0.53, 0.025), sole, 0, -0.09, 0.06);
    mesh(an, rbox(0.3, 0.06, 0.14, 0.03), sole, 0, -0.05, 0.27);
    mesh(an, rbox(0.04, 0.035, 0.14, 0.015), stripe, side * 0.165, -0.02, 0.05);
    for (let i = 0; i < 3; i++) mesh(an, rbox(0.17, 0.025, 0.035, 0.01), lace, 0, 0.05 - i * 0.012, 0.1 + i * 0.07);
    g.userData.knee = kn; g.userData.ankle = an; g.userData.foot = f;
    return g;
  };
  rig.legR = mkLeg(-1); rig.legL = mkLeg(1);

  rig.faceOn(L.face);
  hairOrHat(rig, L.hat, L.hatColor);
  gear(rig, char, acc);
  rig.hips.position.y = 0.9;
  mergeStatic(rig.root);
}

// ------------------------------------------------------------------ hair
function hairOrHat(rig, kind, color) {
  const h = rig.head, m = mat('cloth', color), mD = mat('cloth', shade(color, 0.72));
  const base = () => { const b = mesh(h, new THREE.SphereGeometry(0.315, 22, 10, 0, TAU, 0, Math.PI / 2), m, 0, 0.5, -0.01); b.scale.y = 0.62; return b; };
  if (kind === 'spiky') {
    base();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU, r = i % 2 ? 0.2 : 0.14, len = 0.26 + (i % 3) * 0.05;
      const c = mesh(h, new THREE.ConeGeometry(0.09, len, 6), i % 3 ? m : mD, Math.sin(a) * r, 0.68, Math.cos(a) * r - 0.05);
      c.rotation.set(Math.cos(a) * 0.75 - 0.25, 0, -Math.sin(a) * 0.75);
    }
    for (let i = -1; i <= 1; i++) { const c = mesh(h, new THREE.ConeGeometry(0.07, 0.2, 6), m, i * 0.12, 0.6, 0.25); c.rotation.x = 1.9; }
    for (const s of [-1, 1]) mesh(h, rbox(0.06, 0.16, 0.12, 0.03), m, s * 0.29, 0.4, -0.02);
  } else if (kind === 'messy') {
    base();
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39, r = 0.08 + (i % 4) * 0.055;
      const s = mesh(h, sphere(0.11 + (i % 3) * 0.02, 10, 8), i % 4 ? m : mD, Math.sin(a) * r, 0.66 + (i % 2) * 0.04 - r * 0.25, Math.cos(a) * r - 0.04);
      s.scale.y = 0.7;
    }
    for (let i = -1; i <= 1; i++) mesh(h, sphere(0.09, 10, 8), m, i * 0.13, 0.56, 0.24).scale.set(1.1, 0.7, 0.7);
    for (const s of [-1, 1]) mesh(h, rbox(0.07, 0.18, 0.14, 0.03), m, s * 0.29, 0.42, -0.03);
  } else if (kind === 'long') {
    base();
    const back = mesh(h, rbox(0.62, 0.66, 0.16, 0.07), m, 0, 0.27, -0.25); back.rotation.x = 0.06;
    mesh(h, rbox(0.54, 0.14, 0.1, 0.05), mD, 0, -0.04, -0.27);
    for (const s of [-1, 1]) { const lock = mesh(h, rbox(0.1, 0.5, 0.2, 0.05), m, s * 0.3, 0.3, 0.02); lock.rotation.z = s * 0.06; }
    const bang = mesh(h, rbox(0.52, 0.11, 0.12, 0.05), m, 0, 0.56, 0.24); bang.rotation.x = -0.35;
    const side = mesh(h, rbox(0.22, 0.13, 0.1, 0.05), mD, 0.12, 0.5, 0.27); side.rotation.z = -0.4;
  } else {
    // a hat: short hair peeking out under it, then the hat itself
    if (kind !== 'none' && kind !== 'headphones') { const b = mesh(h, new THREE.SphereGeometry(0.305, 20, 8, 0, TAU, 0, Math.PI / 2), mat('cloth', '#3a2618'), 0, 0.46, -0.02); b.scale.y = 0.5; }
    if (kind === 'none' || kind === 'headphones') { const b = mesh(h, new THREE.SphereGeometry(0.305, 20, 8, 0, TAU, 0, Math.PI / 2), mat('cloth', '#3a2618'), 0, 0.5, -0.015); b.scale.y = 0.42; }
    rig.hat(kind, color, null);
  }
}

// ------------------------------------------------------------------ each survivor's gear
function gear(rig, char, acc) {
  const accent = mat('cloth', acc), accentS = mat('shiny', acc), dark = mat('cloth', '#1d1d24'), white = mat('cloth', '#f2f2f2');
  if (char === 'bolt') {
    // scarf with two tails that stream behind, lightning sneakers, wristbands, emblem on the back
    const ring = mesh(rig.chest, new THREE.TorusGeometry(0.22, 0.075, 8, 18), accent, 0, 0.74, 0); ring.rotation.x = Math.PI / 2;
    rig.extra.tails = [0, 1].map((i) => { const g = joint(rig.chest, i ? -0.1 : 0.12, 0.74, -0.2); const m = mesh(g, rbox(0.15, 0.05, 0.6, 0.02), accent, 0, 0, -0.3); m.userData.keep = true; g.userData.back = 1 + i; return g; });
    for (const leg of [rig.legL, rig.legR]) {
      const f = leg.userData.foot; f.material = white;
      mesh(leg.userData.ankle, rbox(0.345, 0.045, 0.2, 0.01), accentS, 0, 0.02, 0.14).rotation.x = 0.3;
      mesh(leg.userData.ankle, rbox(0.36, 0.055, 0.54, 0.02), mat('shoe', '#d22b2b'), 0, -0.09, 0.06);
    }
    for (const arm of [rig.armL, rig.armR]) mesh(arm.userData.hand, rbox(0.29, 0.1, 0.28, 0.03), white, 0, 0.03, 0);
    const emblem = mesh(rig.chest, new THREE.PlaneGeometry(0.4, 0.4), mat('cloth', '#ffffff', { map: canvasTex('bolt-emblem', 64, 64, (g) => { g.fillStyle = acc; g.beginPath(); g.moveTo(38, 4); g.lineTo(14, 36); g.lineTo(30, 36); g.lineTo(22, 60); g.lineTo(50, 24); g.lineTo(34, 24); g.closePath(); g.fill(); }), transparent: true }), 0, 0.42, -0.215);
    emblem.rotation.y = Math.PI;
    // a lightning streak in the hair
    const z = mesh(rig.head, new THREE.ConeGeometry(0.05, 0.3, 4), accentS, 0.12, 0.68, 0.12); z.rotation.set(0.5, 0, -0.5);
  } else if (char === 'pip') {
    // propeller backpack with a jet, goggles up on the forehead, tool belt with a wrench
    mesh(rig.chest, rbox(0.54, 0.58, 0.24, 0.08), accent, 0, 0.38, -0.34);
    mesh(rig.chest, rbox(0.36, 0.16, 0.06, 0.03), mat('shiny', shade(acc, 0.7)), 0, 0.3, -0.47);
    mesh(rig.chest, cyl(0.035, 0.035, 0.66, 8), dark, 0, 0.98, -0.38);
    const prop = joint(rig.chest, 0, 1.32, -0.38);
    for (let i = 0; i < 2; i++) { const b = mesh(prop, rbox(1.1, 0.03, 0.14, 0.01), white); b.rotation.y = i * Math.PI / 2; b.userData.keep = true; }
    mesh(prop, sphere(0.07, 10, 8), accent).userData.keep = true;
    rig.extra.prop = prop;
    const flame = mesh(rig.chest, new THREE.ConeGeometry(0.12, 0.45, 10), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85 }), 0, -0.12, -0.34);
    flame.rotation.x = Math.PI; flame.visible = false; flame.userData.keep = true; rig.extra.flame = flame;
    const strap = mesh(rig.head, new THREE.TorusGeometry(0.3, 0.03, 6, 22), dark, 0, 0.5, 0); strap.rotation.x = Math.PI / 2 - 0.12;
    for (const s of [-1, 1]) { const lens = mesh(rig.head, cyl(0.1, 0.1, 0.07, 16), mat('shiny', '#9fe6ff', { emissive: 0x113344 }), s * 0.12, 0.6, 0.25); lens.rotation.x = Math.PI / 2 - 0.5; mesh(rig.head, new THREE.TorusGeometry(0.1, 0.025, 6, 16), mat('metal', '#c48a3a'), s * 0.12, 0.6, 0.25).rotation.x = -0.5; }
    mesh(rig.hips, rbox(0.9, 0.11, 0.47, 0.03), mat('cloth', '#6b4426'), 0, 0.2, 0);
    for (const s of [-1, 1]) mesh(rig.hips, rbox(0.14, 0.14, 0.08, 0.03), mat('cloth', '#5a3820'), s * 0.3, 0.13, 0.24);
    const wrench = joint(rig.hips, 0.43, 0.06, 0.12); wrench.rotation.z = 0.3;
    mesh(wrench, rbox(0.07, 0.42, 0.05, 0.01), mat('metal', '#b8c0cc'));
    mesh(wrench, new THREE.TorusGeometry(0.07, 0.03, 6, 10, Math.PI * 1.5), mat('metal', '#b8c0cc'), 0, 0.24, 0);
    for (const arm of [rig.armL, rig.armR]) mesh(arm.userData.hand, rbox(0.27, 0.13, 0.25, 0.05), mat('cloth', '#5a3820'), 0, -0.04, 0.01);
  } else if (char === 'rook') {
    // giant knuckle gauntlets, a bandana with tails, a spiked shoulder plate
    for (const arm of [rig.armL, rig.armR]) {
      const h = arm.userData.hand;
      mesh(h, rbox(0.46, 0.4, 0.46, 0.12), accentS, 0, -0.1, 0.02);
      for (let i = 0; i < 3; i++) { const k = mesh(h, new THREE.ConeGeometry(0.05, 0.14, 6), white, -0.13 + i * 0.13, -0.15, 0.27); k.rotation.x = Math.PI / 2; }
      mesh(h, rbox(0.4, 0.1, 0.4, 0.03), white, 0, 0.12, 0);
    }
    mesh(rig.head, cyl(0.305, 0.31, 0.16, 24, true), mat('cloth', acc, { side: THREE.DoubleSide }), 0, 0.5, 0);
    for (const s of [-1, 1]) { const t = mesh(rig.head, rbox(0.09, 0.03, 0.36, 0.01), accent, s * 0.07, 0.46, -0.44); t.rotation.set(-0.5, s * 0.25, 0); }
    mesh(rig.head, sphere(0.07, 8, 6), accent, 0, 0.5, -0.31);
    const plate = mesh(rig.armL, rbox(0.4, 0.14, 0.4, 0.06), dark, 0.02, 0.08, 0); plate.rotation.z = -0.2;
    for (let i = 0; i < 3; i++) mesh(rig.armL, new THREE.ConeGeometry(0.05, 0.18, 6), white, -0.1 + i * 0.12, 0.22, 0);
    mesh(rig.chest, rbox(0.9, 0.08, 0.46, 0.03), dark, 0, 0.04, 0);
  } else if (char === 'mira') {
    // giant mallet (on her back, in her hands when she bonks), a bow, a headband and a heart badge
    const mallet = new THREE.Group();
    mesh(mallet, cyl(0.05, 0.05, 1.3, 8), mat('shiny', '#f5d76e'), 0, 0.65, 0).userData.keep = true;
    const head = mesh(mallet, rbox(0.75, 0.5, 0.5, 0.12), accentS, 0, 1.4, 0); head.rotation.z = Math.PI / 2; head.userData.keep = true;
    for (const s of [-1, 1]) mesh(mallet, rbox(0.1, 0.53, 0.53, 0.04), mat('shiny', '#ffe66b'), s * 0.25, 1.4, 0).userData.keep = true;
    rig.extra.mallet = mallet;
    rig.extra.malletBack = () => { rig.chest.add(mallet); mallet.position.set(0.1, -0.1, -0.35); mallet.rotation.set(0, 0, 0.45); mallet.scale.setScalar(0.85); };
    rig.extra.malletHand = () => { rig.armR.userData.hand.add(mallet); mallet.position.set(0, -0.1, 0.1); mallet.rotation.set(Math.PI / 2, 0, 0); mallet.scale.setScalar(1); };
    rig.extra.malletBack();
    const bow = joint(rig.head, 0.24, 0.66, -0.05); bow.rotation.z = -0.4;
    for (const s of [-1, 1]) { const w = mesh(bow, new THREE.ConeGeometry(0.12, 0.24, 4), accent, s * 0.12, 0, 0); w.rotation.z = (s * Math.PI) / 2; }
    mesh(bow, sphere(0.06, 8, 6), accent);
    const hb = mesh(rig.head, new THREE.TorusGeometry(0.31, 0.03, 6, 22, Math.PI), accent, 0, 0.5, 0); hb.rotation.y = Math.PI / 2;
    mesh(rig.chest, new THREE.PlaneGeometry(0.24, 0.24), mat('cloth', '#ffffff', { map: canvasTex('heart-badge', 64, 64, (g) => { g.fillStyle = '#ffe66b'; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill(); g.fillStyle = acc; g.beginPath(); g.moveTo(32, 50); g.bezierCurveTo(6, 32, 18, 10, 32, 24); g.bezierCurveTo(46, 10, 58, 32, 32, 50); g.fill(); }), transparent: true }), 0.2, 0.52, 0.232);
    for (const arm of [rig.armL, rig.armR]) mesh(arm.userData.hand, rbox(0.28, 0.08, 0.27, 0.03), accent, 0, 0.05, 0);
  }
}

// ------------------------------------------------------------------ merging
/** Merges plain meshes that hang off the same joint and share a material (fewer draw calls). */
function mergeStatic(root) {
  const groups = [];
  root.traverse((o) => { if (o.isGroup || o === root) groups.push(o); });
  for (const g of groups) {
    const byMat = new Map();
    for (const c of g.children) {
      if (!c.isMesh || c.children.length || c.userData.keep || Array.isArray(c.material) || c.material.map || c.material.transparent) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [m, list] of byMat) {
      if (list.length < 2) continue;
      const geo = mergeGeos(list.map((c) => { c.updateMatrix(); return c.geometry.clone().applyMatrix4(c.matrix); }));
      for (const c of list) g.remove(c);
      g.add(new THREE.Mesh(geo, m));
    }
  }
}

function mergeGeos(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, v * 3); nor.set(n.array, v * 3); if (u) uv.set(u.array, v * 2);
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[i++] = g.index.array[k] + v;
    else for (let k = 0; k < p.count; k++) idx[i++] = k + v;
    v += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ------------------------------------------------------------------ animation
/** s: { speed, air, fly, down, atk, stun, dash, sprint, task, carry } (see Rig.update). */
export function updateAvatar(rig, dt, s) {
  const k = 16, R = (o, ax, v, kk = k) => { o.rotation[ax] = damp(o.rotation[ax], v, kk, dt); };
  const speed = s.speed || 0, t = rig.t;
  rig.ph += dt * Math.min(speed, 14) * 1.15;
  const ph = rig.ph, amp = Math.min(1, speed / 8) * (s.sprint ? 1.15 : 0.9), sw = Math.sin(ph), cw = Math.cos(ph);
  let thL = sw * amp * 0.95, thR = -thL;
  let knL = 0.08 + Math.max(0, -cw) * amp * 1.5, knR = 0.08 + Math.max(0, cw) * amp * 1.5;
  let arL = -thL * 0.85, arR = -thR * 0.85, azL = 0.08, azR = -0.08;
  let elL = -(0.25 + amp * (s.sprint ? 1.1 : 0.6)), elR = elL;
  let pitch = amp * (s.sprint ? 0.16 : 0.07), twist = sw * 0.14 * amp, headX = 0, headY = -twist * 0.8, headZ = 0;
  let bob = Math.abs(sw) * 0.07 * amp;
  if (speed < 0.3) {
    // idle: breathing, a little arm sway, looking around now and then
    const b = Math.sin(t * 1.7);
    arL = b * 0.03; arR = -b * 0.03; elL = elR = -0.12; azL = 0.1; azR = -0.1; bob = b * 0.012; pitch = 0;
    headY = Math.sin(t * 0.37) * 0.35 * Math.max(0, Math.sin(t * 0.21)); headX = Math.sin(t * 0.5) * 0.05;
    knL = knR = 0.04; thL = thR = 0;
  }
  if (s.air && !s.fly) { thL = -0.75; thR = -0.15; knL = 1.25; knR = 0.55; arL = -0.6; arR = -0.35; azL = 0.55; azR = -0.55; elL = elR = -0.6; pitch = 0.08; }
  if (s.fly) { azL = 1.25; azR = -1.25; arL = arR = 0; elL = elR = -0.15; thL = 0.2; thR = 0.05; knL = 0.5; knR = 0.3; pitch = 0.22; }
  if (s.dash) { pitch = 0.5; arL = arR = 1.25; elL = elR = -0.2; thL = 0.95; thR = -0.7; knL = 1.2; knR = 0.3; azL = 0.2; azR = -0.2; }
  if (s.carry) { arL = arR = -1.05; elL = elR = -0.95; azL = -0.18; azR = 0.18; twist *= 0.3; }
  if (s.task) {
    // working on something in front of them: hands busy, head down
    const w = Math.sin(t * 9);
    arL = -1.05 + w * 0.12; arR = -1.05 - w * 0.12; elL = -0.75; elR = -0.75; azL = -0.12; azR = 0.12; headX = 0.3; headY = Math.sin(t * 1.3) * 0.15; twist = 0; pitch = 0.05;
  }
  if (s.atk >= 0) {
    const p = s.atk;
    if (rig.char === 'rook') { arR = -1.6 + Math.sin(p * Math.PI) * -0.1; elR = -0.05; azR = 0; twist = -0.35; pitch = -0.05; }
    else if (rig.char === 'mira') { arL = arR = -2.9 + p * 3.0; elL = elR = -0.1; azL = 0.1; azR = -0.1; pitch = p * 0.3; }
  }
  if (s.stun) { headZ = Math.sin(t * 14) * 0.35; azL = 0.7; azR = -0.7; arL = arR = -0.3; elL = elR = -0.3; pitch = -0.1; knL = knR = 0.4; }
  let down = 0;
  if (s.down) {
    down = 1; const c = Math.sin(t * 3) * (speed > 0.2 ? 0.8 : 0.1);
    arL = -2.6 + c; arR = -2.6 - c; elL = -0.3 - Math.max(0, c) * 0.5; elR = -0.3 - Math.max(0, -c) * 0.5;
    thL = c * 0.4; thR = -c * 0.4; knL = 0.5 + Math.max(0, c) * 0.6; knR = 0.5 + Math.max(0, -c) * 0.6;
    azL = 0.25; azR = -0.25; pitch = 0; headX = -0.5; twist = 0; headY = 0;
  }
  const lL = rig.legL, lR = rig.legR, aL = rig.armL, aR = rig.armR;
  R(lL, 'x', thL); R(lR, 'x', thR);
  R(lL.userData.knee, 'x', knL); R(lR.userData.knee, 'x', knR);
  R(lL.userData.ankle, 'x', -(thL + knL) * 0.55 + (s.air ? 0.3 : 0)); R(lR.userData.ankle, 'x', -(thR + knR) * 0.55 + (s.air ? 0.3 : 0));
  R(aL, 'x', arL); R(aR, 'x', arR); R(aL, 'z', azL); R(aR, 'z', azR);
  R(aL.userData.elbow, 'x', elL); R(aR.userData.elbow, 'x', elR);
  R(rig.chest, 'y', twist, 10); R(rig.hips, 'y', -twist * 0.4, 10);
  R(rig.neck, 'x', headX, 8); R(rig.neck, 'y', headY, 6);
  rig.neck.rotation.z = damp(rig.neck.rotation.z, headZ, 10, dt);
  R(rig.hips, 'x', pitch);
  rig.chest.position.y = 0.2 + (speed < 0.3 && !down ? Math.sin(t * 1.7) * 0.006 : 0);
  rig.body.rotation.x = damp(rig.body.rotation.x, down * (Math.PI / 2 - 0.08), 10, dt);
  rig.body.position.y = damp(rig.body.position.y, down ? 0.26 : bob - (s.air ? 0 : Math.max(0, knL + knR - 0.3) * 0.03), 12, dt);
  rig.body.position.z = damp(rig.body.position.z, down ? -1.0 : 0, 10, dt);
  // gear
  if (rig.extra.tails) for (const [i, tl] of rig.extra.tails.entries()) {
    const sp = Math.min(1, speed / 10), flap = Math.sin(t * 9 + i * 2) * (0.08 + 0.14 * sp);
    tl.rotation.x = damp(tl.rotation.x, (tl.userData.back === 1 ? -0.08 - sp * 1.0 : -0.15 - sp * 0.9) + flap, 10, dt);
  }
  if (rig.extra.prop) { rig.extra.prop.rotation.y += dt * (s.fly ? 45 : 2.5); rig.extra.flame.visible = !!s.fly; if (s.fly) rig.extra.flame.scale.y = 0.8 + Math.random() * 0.5; }
  if (rig.extra.mallet) { const inHand = s.atk >= 0; if (inHand !== rig.extra.malletIn) { rig.extra.malletIn = inHand; inHand ? rig.extra.malletHand() : rig.extra.malletBack(); } }
}

