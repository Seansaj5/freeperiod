// The cast, built from parts: fabric suit shells over a metal endoskeleton, with eyes that follow you.
import * as THREE from 'three';
import { TAU, add, B, sq, limbGeo, lathe, gSph, gCyl, gBox, suit, paint, metal, plastic, glass, glow, tex, label, sign, BLACK, ENDO, TOOTH, GRIME, furMat, furMesh, spring, irisTex, faceTex, wires } from './kit.js';

// dmg: what is broken on each one. ear = side with the ear torn off, eye = side with the eye missing, arm = side whose forearm is bare metal,
// torso = [x, y, z, r] hole in the chest fur (fractions of the torso size), chunk = [x, y, z] broken piece of the face plate.
const SPEC = {
  bing: { suit: 0x86c93c, plate: 0xefdcae, dark: 0x2f6f12, shoe: 0xb9d832, eye: 0xfff0a0, iris: 0x2f6fd0, W: 1.04, leg: 0.62, ry: 0.34, bz: 1, head: 1.18, S: 0.9, tilt: 0.1, dmg: { ear: -1, arm: 'R', torso: [-0.55, 0.25, 0.75, 0.42] } },
  dylan: { suit: 0x345fc6, plate: 0xcfdcf2, dark: 0x16306e, shoe: 0xc23232, eye: 0xff3a2a, iris: 0xc0392b, W: 0.82, leg: 0.86, ry: 0.3, bz: 0.9, head: 1.06, S: 0.9, tilt: -0.16, dmg: { eye: 1, arm: 'L', torso: [0.5, -0.3, 0.8, 0.36] } },
  gavin: { suit: 0xe88a2a, plate: 0xfbe0bc, dark: 0x9a5010, shoe: 0x5a3010, eye: 0xffd27a, iris: 0x7a4a12, W: 1.5, leg: 0.5, ry: 0.42, bz: 1.55, head: 1.26, S: 0.92, tilt: 0.06, dmg: { ear: 1, torso: [-0.75, 0.55, 0.5, 0.3], chunk: [-0.17, 0.5, 0.25] } },
  sal: { suit: 0xc07c40, plate: 0xecd6b6, dark: 0x6e1a26, shoe: 0x1c1c20, eye: 0x8dff5a, iris: 0x3f8f2a, W: 0.97, leg: 0.64, ry: 0.33, bz: 1, head: 1.1, S: 0.9, tilt: 0.2, dmg: { arm: 'L', chunk: [0.16, 0.5, 0.24], torso: [0.6, -0.45, 0.7, 0.3] } },
};
const SPARK = glow(0xffffff, 1.6);
const CHROME = metal(0xcfd3d8, 0.16);
const RUST = metal(0x6a5a4c, 0.6);
const FANG = plastic(0xd9cfa6, { roughness: 0.35, map: GRIME });
const CLAW = plastic(0x18130f, { roughness: 0.3 });

function makeEye(r, iris, pupilMat, sclera, irisMat) {
  const g = new THREE.Group();
  add(g, gSph(r, 26), sclera);
  const cap = (th, mat, rr) => { const m = add(g, new THREE.SphereGeometry(rr, 26, 10, 0, TAU, 0, th), mat); m.rotation.x = Math.PI / 2; };
  cap(0.68, irisMat, r * 1.012); cap(0.27, pupilMat, r * 1.024);
  add(g, gSph(r * 0.1, 8), SPARK, r * 0.3, r * 0.36, r * 0.9); add(g, gSph(r * 0.05, 6), SPARK, -r * 0.22, -r * 0.2, r * 0.95);
  return g;
}
// A broken-off piece of face plate: dark hole, jagged shards round it, bare metal and wires behind.
function broken(g, x, y, z, Pl) {
  add(g, sq(0.085, 0.075, 0.03, 2.2, 14), BLACK, x, y, z);
  for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.3, sh = add(g, new THREE.TetrahedronGeometry(0.04 + (k % 3) * 0.012), Pl, x + Math.cos(a) * 0.085, y + Math.sin(a) * 0.075, z - 0.005); sh.rotation.set(k, k * 2, a); sh.scale.z = 0.35; }
  add(g, sq(0.05, 0.04, 0.012, 3, 8), RUST, x + 0.01, y - 0.005, z + 0.012); add(g, gSph(0.012, 8), CHROME, x - 0.03, y + 0.02, z + 0.022); add(g, gSph(0.012, 8), CHROME, x + 0.045, y - 0.03, z + 0.02);
  wires(g, x, y - 0.03, z + 0.02, 3, 0.14, [0, -1, 0.5]);
}

// A head on its own (also used for the spare heads in Storage, with empty sockets).
export function makeHead(who, empty = false) {
  const c = SPEC[who], d = c.dmg || {}, out = new THREE.Group(), g = new THREE.Group(); out.add(g); g.scale.setScalar(c.head);
  const F = furMat(c.suit, 0.036, 230, { hole: d.ear ? [d.ear * 0.3, 0.02, 0.02, 0.13] : null }), Pl = plastic(c.plate, { roughness: 0.5, clearcoat: 0.3, map: faceTex(who.length) }), PlS = plastic(c.plate, { roughness: 0.5, clearcoat: 0.3, map: GRIME }), dk = plastic(0x0c0d10, { roughness: 0.5 }), DF = furMat(c.dark, 0.022);
  furMesh(g, sq(0.34, 0.31, 0.32, 2.6, 36), F, 0, 0.32, 0);
  for (const s of [-1, 1]) {
    if (d.ear === s) { add(g, gCyl(0.02, 0.02, 0.09, 8), RUST, s * 0.345, 0.34, -0.01).rotation.z = Math.PI / 2; add(g, gSph(0.03, 10), CHROME, s * 0.39, 0.34, -0.01); wires(g, s * 0.34, 0.31, 0.0, 4, 0.2, [s * 0.4, -1, 0.1]); }
    else { furMesh(g, sq(0.06, 0.1, 0.07, 2.4, 14), F, s * 0.35, 0.32, -0.02); add(g, sq(0.022, 0.06, 0.04, 2.4, 12), PlS, s * 0.388, 0.32, 0.0); }
  }
  add(g, sq(0.275, 0.245, 0.12, 2.5, 34), Pl, 0, 0.315, 0.235);
  for (const s of [-1, 1]) { add(g, gSph(0.092, 20), PlS, s * 0.185, 0.215, 0.268); add(g, gSph(0.05, 12), plastic(0xc96a5e, { roughness: 0.55, map: GRIME }), s * 0.222, 0.212, 0.33).scale.z = 0.35; }
  add(g, sq(0.21, 0.075, 0.1, 2.6, 24), PlS, 0, 0.168, 0.285);
  add(g, sq(0.05, 0.038, 0.045, 2.2, 14), plastic(who === 'sal' ? 0x9a3a30 : 0x1c120c, { roughness: 0.3 }), 0, 0.268, 0.378);
  if (d.chunk) broken(g, d.chunk[0], d.chunk[1], d.chunk[2] + 0.05, PlS);
  // mouth: gums, big uneven outer teeth, and the skeleton's own small metal teeth behind them
  add(g, sq(0.17, 0.03, 0.1, 3, 10), BLACK, 0, 0.1, 0.27); add(g, sq(0.165, 0.014, 0.05, 2.6, 12), plastic(0x5a1a1c, { roughness: 0.4 }), 0, 0.118, 0.325);
  for (let i = -3; i <= 3; i++) { const big = who === 'bing' && Math.abs(i) < 1, hgt = (big ? 0.05 : 0.036) + ((i * 7 + who.length) % 3) * 0.005; add(g, sq(big ? 0.031 : 0.023, hgt, 0.015, 3, 8), FANG, i * 0.05, 0.118 - hgt * 0.75, 0.366 - i * i * 0.0065).rotation.z = ((i * 5) % 3 - 1) * 0.06; }
  for (let i = -3; i <= 3; i++) { const t = add(g, new THREE.ConeGeometry(0.011, 0.04, 6), CHROME, i * 0.036, 0.085, 0.27 - i * i * 0.004); t.rotation.x = Math.PI; }
  add(g, sq(0.13, 0.016, 0.07, 2.4, 10), RUST, 0, 0.108, 0.24);
  const jaw = new THREE.Group(); jaw.position.set(0, 0.13, 0.06); g.add(jaw);
  add(jaw, sq(0.195, 0.064, 0.14, 2.6, 24), PlS, 0, -0.085, 0.2); furMesh(jaw, sq(0.2, 0.06, 0.14, 2.4, 18), F, 0, -0.118, 0.1);
  add(jaw, sq(0.155, 0.014, 0.1, 3, 10), BLACK, 0, -0.036, 0.2); add(jaw, sq(0.16, 0.012, 0.045, 2.6, 12), plastic(0x5a1a1c, { roughness: 0.4 }), 0, -0.034, 0.3); add(jaw, sq(0.07, 0.018, 0.08, 2, 10), plastic(0x6a2226, { roughness: 0.3 }), 0, -0.026, 0.2);
  for (let i = -2.5; i <= 2.5; i++) { const hgt = 0.033 + ((i * 3 + 7) % 3) * 0.005; add(jaw, sq(0.023, hgt, 0.014, 3, 8), FANG, i * 0.054, -0.034 + hgt * 0.7, 0.332 - i * i * 0.0075).rotation.z = ((i * 2 + 5) % 3 - 1) * 0.07; }
  add(jaw, sq(0.12, 0.014, 0.06, 2.4, 10), RUST, 0, -0.03, 0.15); for (let i = -2.5; i <= 2.5; i++) add(jaw, new THREE.ConeGeometry(0.01, 0.036, 6), CHROME, i * 0.036, -0.006, 0.19 - i * i * 0.004);
  for (const s of [-1, 1]) { add(g, gCyl(0.034, 0.034, 0.05, 12), CHROME, s * 0.205, 0.13, 0.07).rotation.z = Math.PI / 2; add(g, gSph(0.014, 8), CHROME, s * 0.235, 0.13, 0.07); }
  // eyes: glassy in the light; in the dark they go black with a pinprick of light
  const pupil = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.15, emissive: c.eye, emissiveIntensity: 0 });
  const sclera = plastic(0xf2efe6, { roughness: 0.08, map: GRIME }), irisMat = plastic(0xffffff, { map: irisTex(c.iris), roughness: 0.1 });
  const eyes = [], lids = [], r = 0.1;
  for (const s of [-1, 1]) {
    add(g, gSph(r * 1.2, 18), BLACK, s * 0.13, 0.385, 0.232);
    add(g, new THREE.TorusGeometry(r * 1.04, 0.028, 10, 30), dk, s * 0.13, 0.385, 0.302);
    if (!empty && d.eye !== s) {
      const e = makeEye(r, c.iris, pupil, sclera, irisMat); e.position.set(s * 0.13, 0.385, 0.276); g.add(e); eyes.push(e);
      const lg = new THREE.Group(); lg.position.copy(e.position); g.add(lg); add(lg, new THREE.SphereGeometry(r * 1.1, 24, 10, 0, TAU, 0, Math.PI / 2), PlS); lg.rotation.x = -0.5; lids.push(lg);
    } else if (!empty) {
      add(g, gSph(0.022, 10), new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xff1a0a, emissiveIntensity: 5 }), s * 0.125, 0.38, 0.262); add(g, gCyl(0.03, 0.036, 0.05, 10), RUST, s * 0.125, 0.38, 0.24).rotation.x = Math.PI / 2;
      wires(g, s * 0.13, 0.34, 0.31, 3, 0.2, [s * 0.15, -1, 0.35]);
    }
    furMesh(g, sq(0.105, 0.03, 0.042, 2.4, 12), DF, s * 0.137, 0.552, 0.3).rotation.z = -s * 0.42;
  }
  if (who === 'bing') {
    const capM = plastic(c.dark, { roughness: 0.6, clearcoat: 0.15, map: GRIME });
    add(g, new THREE.SphereGeometry(0.36, 30, 14, 0, TAU, 0, Math.PI / 2), capM, 0, 0.44, -0.01).scale.set(1, 0.7, 0.98);
    const bill = add(g, sq(0.28, 0.018, 0.2, 2.6, 20), capM, 0, 0.46, 0.38); bill.rotation.set(0.14, 0, 0.06); add(g, gSph(0.032, 10), capM, 0, 0.695, -0.01);
    for (let k = 0; k < 6; k++) { const sm = add(g, new THREE.TorusGeometry(0.352, 0.004, 4, 20, Math.PI), plastic(0x1f4f0c), 0, 0.44, -0.01); sm.rotation.y = k * Math.PI / 6; sm.scale.y = 0.7; }
    const b = sign(g, 0.2, 0.17, 0, 0.575, 0.272, 0, (cx, w, h) => { label('B', '#2f6f12', '#d8d4c0', 0.86)(cx, w, h); cx.fillStyle = 'rgba(30,20,10,.35)'; for (let k = 0; k < 14; k++) cx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 2 + Math.random() * 5); }, false, 128); b.rotation.x = -0.6;
  }
  if (who === 'dylan') {
    const hair = furMat(0x101216, 0.02);
    for (let k = 0; k < 15; k++) { const a = (k / 14 - 0.5) * 2.3, row = k % 2, sp = furMesh(g, new THREE.ConeGeometry(0.08, 0.28 + row * 0.1 + (k % 3) * 0.04, 8), hair, Math.sin(a) * 0.25, 0.6 + Math.cos(a) * 0.08, row ? -0.1 : 0.08); sp.rotation.set(row ? -0.3 : 0.35, 0, -a * 0.8 + (k % 3 - 1) * 0.12); }
    const red = plastic(0xb82a2a, { map: GRIME }); add(g, new THREE.TorusGeometry(0.385, 0.03, 10, 30, Math.PI), red, 0, 0.32, -0.02);
    for (const s of [-1, 1]) { add(g, gCyl(0.12, 0.12, 0.08, 22), red, s * 0.42, 0.32, -0.02).rotation.z = Math.PI / 2; add(g, new THREE.TorusGeometry(0.09, 0.034, 8, 20), plastic(0x15171b, { roughness: 0.7 }), s * 0.385, 0.32, -0.02).rotation.y = Math.PI / 2; add(g, gCyl(0.06, 0.06, 0.012, 16), CHROME, s * 0.462, 0.32, -0.02).rotation.z = Math.PI / 2; }
  }
  if (who === 'gavin') {
    const hat = suit(0xd9d2c2); const band = add(g, gCyl(0.28, 0.29, 0.18, 26), hat, 0, 0.67, 0); band.rotation.z = 0.05;
    for (let k = 0; k < 7; k++) add(g, gSph(0.19, 18), hat, Math.cos(k * TAU / 7) * 0.18 + 0.04, 0.87 - (k % 2) * 0.03, Math.sin(k * TAU / 7) * 0.18); add(g, gSph(0.23, 18), hat, 0.07, 0.95, 0);
    add(g, sq(0.21, 0.07, 0.15, 2.2, 16), PlS, 0, 0.03, 0.14);
  }
  if (who === 'sal') {
    const hair = plastic(0x0c0c0e, { roughness: 0.22 });
    add(g, new THREE.SphereGeometry(0.352, 28, 12, 0, TAU, 0, Math.PI / 2.15), hair, 0, 0.36, -0.015).scale.set(1.01, 0.86, 1);
    add(g, sq(0.2, 0.05, 0.08, 2.2, 12), hair, -0.1, 0.6, 0.2).rotation.set(0.3, 0, 0.25);
    const st = furMat(0x17120e, 0.016);
    for (const s of [-1, 1]) { add(g, sq(0.03, 0.09, 0.07, 2.4, 10), hair, s * 0.335, 0.38, 0.08); const m = furMesh(g, limbGeo(0.034, 0.012, 0.17, 10), st, s * 0.012, 0.232, 0.385); m.rotation.set(0.2, 0, s * 1.25); }
    if (lids[0]) lids[0].userData.droop = 0.6;
  }
  out.userData = { jaw, eyes, lids, pupil, sclera, irisMat, tilt: c.tilt || 0, top: 0.64 * c.head };
  return out;
}

// bare = the suit is gone from the elbow down: rods, a piston and a metal hand.
function makeArm(c, s, F, Pl, bare) {
  const sh = new THREE.Group(), el = new THREE.Group(), hand = new THREE.Group();
  furMesh(sh, gSph(0.13, 18), F); furMesh(sh, limbGeo(0.105, 0.088, 0.36), F, 0, -0.06, 0);
  add(sh, gCyl(0.028, 0.028, 0.1, 8), CHROME, 0, -0.42, 0);
  el.position.y = -0.46; sh.add(el); add(el, gSph(0.062, 16), CHROME); add(el, gCyl(0.07, 0.07, 0.036, 14), ENDO).rotation.z = Math.PI / 2; for (const k of [-1, 1]) add(el, gSph(0.016, 8), CHROME, k * 0.04, 0, 0.06);
  hand.position.y = -0.47; el.add(hand); hand.scale.setScalar(1.14);
  const fm = bare ? ENDO : Pl;
  if (bare) {
    for (const k of [-1, 1]) add(el, gCyl(0.017, 0.017, 0.4, 8), ENDO, k * 0.032, -0.25, 0); add(el, gCyl(0.03, 0.03, 0.2, 10), RUST, 0, -0.18, 0.03); add(el, gCyl(0.012, 0.012, 0.22, 6), CHROME, 0, -0.33, 0.03);
    add(el, gSph(0.045, 12), CHROME, 0, -0.455, 0); wires(el, 0, -0.06, 0.02, 4, 0.3, [0, -1, 0.12]);
    furMesh(el, new THREE.TorusGeometry(0.07, 0.035, 8, 16), F, 0, -0.045, 0).rotation.x = Math.PI / 2;
    add(hand, sq(0.07, 0.07, 0.03, 3, 12), ENDO, 0, -0.07, 0);
  } else {
    furMesh(el, limbGeo(0.082, 0.1, 0.33), F, 0, -0.05, 0); add(el, gCyl(0.1, 0.092, 0.05, 20), Pl, 0, -0.385, 0); spring(el, 0.034, 0.07, 3, 0, -0.435, 0, CHROME);
    add(hand, sq(0.08, 0.082, 0.046, 2.6, 16), Pl, 0, -0.07, 0);
  }
  for (let i = 0; i < 4; i++) {
    const f = add(hand, limbGeo(bare ? 0.015 : 0.026, bare ? 0.013 : 0.022, 0.15, 10), fm, (i - 1.5) * 0.041, -0.12, 0.01); f.rotation.x = -0.6; f.rotation.z = (i - 1.5) * 0.1;
    add(f, gSph(bare ? 0.02 : 0.024, 8), CHROME, 0, -0.138, 0); const t = add(f, limbGeo(bare ? 0.013 : 0.022, bare ? 0.01 : 0.017, 0.11, 10), fm, 0, -0.138, 0); t.rotation.x = -0.8;
    add(t, new THREE.ConeGeometry(bare ? 0.012 : 0.017, 0.06, 8), bare ? CHROME : CLAW, 0, -0.125, 0).rotation.x = Math.PI;
  }
  const th = add(hand, limbGeo(bare ? 0.016 : 0.028, bare ? 0.013 : 0.022, 0.11, 10), fm, s * 0.072, -0.04, 0.02); th.rotation.set(-0.9, 0, s * 0.9); add(th, new THREE.ConeGeometry(bare ? 0.012 : 0.017, 0.05, 8), bare ? CHROME : CLAW, 0, -0.125, 0).rotation.x = Math.PI;
  return { sh, el, hand };
}

export function makeBot(who) {
  const c = SPEC[who], d = c.dmg || {}, g = new THREE.Group(), W = c.W;
  const hipY = c.leg + 0.12, rx = 0.36 * W, ry = c.ry, rz = 0.27 * c.bz, tc = hipY + 0.2 + ry;
  const th = d.torso, hole = th ? [th[0] * rx, th[1] * ry, th[2] * rz, th[3] * Math.min(rx, ry)] : null;
  const F = furMat(c.suit), FT = furMat(c.suit, 0.034, 230, { hole }), FL = furMat(c.suit, 0.034, 230, { hole: [0.05, -0.2, 0.09, 0.075] });
  const Pl = plastic(c.plate, { roughness: 0.5, clearcoat: 0.3, map: GRIME }), DF = furMat(c.dark), shoe = plastic(c.shoe, { roughness: 0.3, map: GRIME }), D = suit(c.dark);
  for (const s of [-1, 1]) {
    const x = s * 0.17 * Math.min(W, 1.25), thl = c.leg * 0.46, shn = c.leg * 0.42;
    add(g, gSph(0.07, 14), CHROME, x, hipY, 0); furMesh(g, limbGeo(0.13, 0.11, thl), s < 0 ? FL : F, x, hipY - 0.02, 0);
    if (s < 0) { add(g, gCyl(0.022, 0.022, thl * 0.7, 8), ENDO, x + 0.04, hipY - 0.02 - thl * 0.5, 0.075); wires(g, x + 0.05, hipY - 0.16, 0.1, 3, 0.16, [0, -1, 0.2]); }
    const ky = hipY - 0.02 - thl - 0.035; add(g, gSph(0.06, 14), CHROME, x, ky, 0); add(g, gCyl(0.066, 0.066, 0.042, 14), ENDO, x, ky, 0).rotation.z = Math.PI / 2; add(g, sq(0.06, 0.07, 0.03, 2.6, 12), Pl, x, ky, 0.07);
    furMesh(g, limbGeo(0.1, 0.13, shn), F, x, ky - 0.035, 0); spring(g, 0.04, 0.09, 3, x, 0.185, 0, CHROME); add(g, gCyl(0.022, 0.022, 0.1, 8), ENDO, x, 0.185, 0);
    add(g, sq(0.135, 0.078, 0.215, 2.8, 20), shoe, x, 0.092, 0.07); add(g, sq(0.14, 0.022, 0.222, 3, 14), plastic(0x17181b, { roughness: 0.6 }), x, 0.022, 0.07);
    add(g, sq(0.1, 0.05, 0.07, 2.4, 14), plastic(0xcfc8b6, { roughness: 0.4, map: GRIME }), x, 0.075, 0.235); for (let k = 0; k < 3; k++) add(g, gCyl(0.008, 0.008, 0.11, 6), plastic(0xd8d4c8), x, 0.15 - k * 0.012, 0.1 + k * 0.045).rotation.z = Math.PI / 2;
  }
  furMesh(g, sq(0.27 * W, 0.14, 0.21 * Math.sqrt(c.bz), 2.6, 22), DF, 0, hipY + 0.07, 0);
  add(g, gCyl(0.07, 0.07, 0.12, 14), ENDO, 0, hipY + 0.18, 0); spring(g, 0.1, 0.1, 3, 0, hipY + 0.18, 0, CHROME);
  furMesh(g, sq(rx, ry, rz, 2.5, 36), FT, 0, tc, 0);
  if (hole) { // the ribs and cables that show through the tear
    const hx = hole[0], hy = tc + hole[1], hz = hole[2], rr = hole[3];
    for (let k = -1; k <= 1; k++) { const rib = add(g, new THREE.TorusGeometry(rr * 0.85, 0.014, 6, 14, Math.PI * 0.9), RUST, hx * 0.82, hy + k * rr * 0.42, hz * 0.8); rib.rotation.set(Math.PI / 2, 0, hx > 0 ? -0.4 : -2.3); }
    add(g, gCyl(0.02, 0.02, rr * 1.5, 8), ENDO, hx * 0.8, hy, hz * 0.86); add(g, gSph(0.03, 10), CHROME, hx * 0.8, hy + rr * 0.5, hz * 0.9); wires(g, hx * 0.85, hy + rr * 0.3, hz * 1.02, 5, 0.26, [hx > 0 ? 0.2 : -0.2, -1, 0.25]);
  }
  add(g, sq(rx * 0.62, ry * 0.68, rz * 0.5, 2.4, 28), Pl, hole ? -hole[0] * 0.18 : 0, tc - ry * 0.1, rz * 0.66);
  for (const [ax, ay] of [[-0.5, 0.42], [0.5, 0.42], [-0.5, -0.5], [0.5, -0.5]]) add(g, gSph(0.016, 8), CHROME, (hole ? -hole[0] * 0.18 : 0) + ax * rx * 0.85, tc - ry * 0.1 + ay * ry * 0.88, rz * (who === 'gavin' ? 1.0 : 1.02));
  if (who === 'bing') {
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.045 : 0.1; star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, -Math.sin(a) * r); }
    const st = add(g, new THREE.ExtrudeGeometry(star, { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), plastic(0xc9981a, { roughness: 0.35, map: GRIME }), 0.1, tc + ry * 0.08, rz * 1.14); st.rotation.set(-0.1, 0, 0.3);
    add(g, new THREE.TorusGeometry(0.2, 0.045, 10, 24), D, 0, tc + ry * 0.9, 0).rotation.x = Math.PI / 2;
  }
  if (who === 'dylan') {
    add(g, sq(rx * 0.6, 0.09, 0.05, 2.6, 14), D, 0, tc - ry * 0.5, rz * 1.12);
    for (const s of [-1, 1]) { add(g, limbGeo(0.012, 0.012, 0.24, 6), suit(0xd8d4c8), s * 0.06, tc + ry * 0.78, rz * 0.9).rotation.x = -0.25; add(g, gSph(0.02, 8), CHROME, s * 0.06, tc + ry * 0.78 - 0.23, rz * 0.9 + 0.06); }
    furMesh(g, sq(0.2, 0.09, 0.14, 2.2, 16), F, 0, tc + ry * 0.92, -0.06);
  }
  if (who === 'gavin') {
    add(g, sq(rx * 0.8, ry * 0.86, 0.06, 3.2, 24), suit(0xd9d2c2), 0, tc - ry * 0.12, rz * 1.06);
    sign(g, 0.6, 0.5, 0, tc - ry * 0.1, rz * 1.06 + 0.062, 0, (cx, w, h) => { cx.fillStyle = '#d9d2c2'; cx.fillRect(0, 0, w, h); cx.fillStyle = '#a52a22'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = `${h * 0.4}px Bungee`; cx.fillText('EAT', w / 2, h * 0.38); for (let k = 0; k < 26; k++) { const x = Math.random() * w, y = h * 0.3 + Math.random() * h * 0.7, r = 3 + Math.random() * 16; cx.fillStyle = `rgba(${70 + Math.random() * 40},${8 + Math.random() * 14},8,${0.45 + Math.random() * 0.4})`; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); cx.fillRect(x - 2, y, 4, r * (1 + Math.random() * 3)); } }, false, 256);
    add(g, new THREE.TorusGeometry(0.22, 0.02, 8, 24), suit(0xd9d2c2), 0, tc + ry * 0.86, 0.02).rotation.x = Math.PI / 2 - 0.3;
  }
  if (who === 'sal') {
    for (const s of [-1, 1]) add(g, sq(rx * 0.56, ry * 1.0, rz * 1.16, 2.5, 24), D, s * rx * 0.52, tc - 0.005 + (s > 0 ? 0.05 : 0), 0.012 - (s > 0 ? 0.03 : 0));
    for (const y of [-0.2, -0.08]) add(g, gSph(0.02, 10), plastic(0xc9981a, { roughness: 0.35 }), -rx * 0.2, tc + y, rz * 1.2);
    const tie = plastic(0xa02a22, { roughness: 0.6, map: GRIME }); add(g, sq(0.05, 0.04, 0.03, 2.4, 10), tie, 0.02, tc + ry * 0.72, rz * 1.02); const t = add(g, limbGeo(0.03, 0.055, 0.34, 8), tie, 0.02, tc + ry * 0.7, rz * 1.05); t.rotation.set(-0.25, 0, 0.3); t.scale.z = 0.4;
  }
  const sy = tc + ry * 0.62, sxp = rx + 0.06, arms = {};
  for (const s of [1, -1]) { const side = s > 0 ? 'R' : 'L', a = makeArm(c, s, F, Pl, d.arm === side); a.sh.position.set(s * sxp, sy, 0); g.add(a.sh); arms[side] = a; }
  const prop = new THREE.Group(); prop.position.set(0, -0.1, 0.07); arms.R.hand.add(prop);
  let liquid = null;
  if (who === 'bing') { add(prop, gCyl(0.024, 0.02, 0.28, 12), plastic(0x222428), 0, 0.02, 0); add(prop, gCyl(0.03, 0.028, 0.05, 12), CHROME, 0, 0.17, 0); add(prop, gSph(0.062, 16), metal(0x55585c, 0.6), 0, 0.24, 0); add(prop, new THREE.TorusGeometry(0.062, 0.006, 6, 20), CHROME, 0, 0.24, 0).rotation.x = Math.PI / 2; wires(prop, 0, -0.12, 0, 1, 0.5, [0.1, -1, -0.2]); }
  if (who === 'dylan') for (const s of [-1, 1]) { const st = add(prop, limbGeo(0.014, 0.01, 0.5, 8), paint(0xb9925a, { roughness: 0.5, map: GRIME }), s * 0.03, 0.42, 0); st.rotation.z = s * 0.22; add(prop, gSph(0.02, 8), paint(0xb9925a), s * 0.03 - s * 0.092, 0.41, 0); }
  if (who === 'gavin') {
    const bun = paint(0xc98a34, { roughness: 0.55, map: GRIME }); add(prop, sq(0.16, 0.035, 0.16, 2.2, 16), bun, 0, 0.04, 0); add(prop, gCyl(0.165, 0.165, 0.045, 20), paint(0x3a1c0a, { roughness: 0.9 }), 0, 0.095, 0);
    const ch = B(prop, 0.3, 0.012, 0.3, paint(0xd9a21a, { roughness: 0.4 }), 0, 0.125, 0); ch.rotation.y = 0.6; add(prop, new THREE.TorusGeometry(0.15, 0.022, 6, 14), paint(0x4f8e22), 0, 0.135, 0).rotation.x = Math.PI / 2;
    add(prop, new THREE.SphereGeometry(0.165, 20, 10, 0.9, TAU - 0.9, 0, Math.PI / 2), bun, 0, 0.145, 0).scale.y = 0.75; for (let k = 0; k < 9; k++) add(prop, gSph(0.008, 6), FANG, Math.cos(k * 2.4 + 2) * 0.09 * (k % 3) / 2, 0.262 - (k % 3) * 0.012, Math.sin(k * 2.4 + 2) * 0.09 * (k % 3) / 2);
  }
  if (who === 'sal') {
    const gl = glass(0x2a7a44, 0.6); add(prop, lathe([[0, 0], [0.058, 0], [0.062, 0.02], [0.062, 0.2], [0.05, 0.26], [0.022, 0.3], [0.02, 0.4], [0.026, 0.41], [0.026, 0.43], [0, 0.43]], 18), gl, 0, -0.06, 0);
    liquid = add(prop, gCyl(0.052, 0.052, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xd9a13a, emissive: 0x6a4200, roughness: 0.3 }), 0, 0.045, 0);
    const lb = sign(prop, 0.1, 0.09, 0, 0.05, 0.064, 0, label('XXX', '#7a1f2b', '#d8ceb8', 0.6), false, 128); lb.userData.noShadow = true;
  }
  add(g, gCyl(0.055, 0.065, 0.16, 14), ENDO, 0, tc + ry + 0.04, 0); spring(g, 0.085, 0.11, 3, 0, tc + ry + 0.045, 0, CHROME); wires(g, 0.06, tc + ry + 0.06, -0.05, 3, 0.16, [0.3, -1, -0.3]);
  const head = makeHead(who); head.position.y = tc + ry + 0.1; g.add(head);
  g.scale.setScalar(c.S);
  g.userData = { ...head.userData, head, arms, prop, liquid, eyeY: (tc + ry + 0.1 + 0.385 * c.head) * c.S, seed: who.length * 1.7 + who.charCodeAt(0) };
  g.visible = false; setPose(g, 'idle');
  return g;
}

// [shoulder forward, shoulder outward, elbow bend] for the right arm, then the left.
const POSE = {
  stage: [[-0.95, 0.25, -1.45], [0.08, 0.14, -0.3]],
  idle: [[-0.5, 0.24, -1.2], [-0.12, 0.2, -0.5]],
  lurk: [[-1.75, 0.5, -0.95], [-1.9, 0.55, -0.8]],
  door: [[-0.5, 0.18, -1.3], [-1.3, 0.4, -0.5]],
  scare: [[-1.45, 0.34, -0.45], [-1.45, 0.34, -0.45]],
  bar: [[-0.9, 0.22, -1.75], [0.1, 0.32, -0.95]],
  run: [[-0.95, 0.35, -1.2], [-1.15, 0.5, -0.7]],
};
export function setPose(m, name, wob = 0) {
  const u = m.userData, p = POSE[name];
  [u.arms.R, u.arms.L].forEach((a, i) => { const s = i ? -1 : 1; a.sh.rotation.set(p[i][0] + wob * (i ? 1 : -1), 0, s * p[i][1]); a.el.rotation.x = p[i][2]; });
  u.prop.rotation.x = -(p[0][0] - wob + p[0][2]);
}
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
// Per-frame life: the head and eyes follow the camera, with servo twitches, blinks and a jaw that chatters now and then.
export function animate(m, t, camPos, o = {}) {
  const u = m.userData, tk = Math.floor(t * 7 + u.seed * 10), tw = hash(tk) > 0.9 ? 1 : 0;
  u.head.lookAt(camPos); u.head.rotation.x += o.shake ? 0 : 0.16; u.head.rotation.z += u.tilt;
  if (o.shake) u.head.rotation.set(u.head.rotation.x + o.shake * (Math.random() - 0.5), u.head.rotation.y + o.shake * (Math.random() - 0.5), o.shake * (Math.random() - 0.5) * 2);
  else { u.head.rotation.z += Math.sin(t * 0.6 + u.seed) * 0.07 + tw * (hash(tk + 3) - 0.5) * 0.3; u.head.rotation.y += tw * (hash(tk + 5) - 0.5) * 0.25; }
  for (const e of u.eyes) { e.lookAt(camPos); e.rotation.x -= o.shake ? 0 : 0.0; }
  const blink = hash(Math.floor(t * 3 + u.seed * 3)) > 0.93 && (t * 3 + u.seed * 3) % 1 < 0.35;
  for (const l of u.lids) l.rotation.x = o.wide ? -1.0 : blink ? 1.15 : -0.55 + (l.userData.droop || 0) + (o.glow ? -0.12 : 0);
  u.jaw.rotation.x = o.jaw != null ? o.jaw : 0.05 + (hash(Math.floor(t * 1.3 + u.seed)) > 0.8 ? Math.abs(Math.sin(t * 22)) * 0.16 : 0);
  const black = o.black || (o.glow && hash(tk + 9) > 0.93);
  u.sclera.color.setHex(black ? 0x030303 : 0xf2efe6); u.irisMat.color.setHex(black ? 0x050505 : 0xffffff);
  u.pupil.emissiveIntensity = black ? 7 : o.glow ? 2.2 : 0;
}

// ---------- Benton: the porcelain wind-up doll in the music box ----------
const CRACK = tex(128, 128, (c, w, h) => { c.fillStyle = '#f0e8da'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(60,45,35,.55)'; c.lineWidth = 1; for (let k = 0; k < 5; k++) { let x = 20 + k * 22, y = 10 + (k * 37) % 50; c.beginPath(); c.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (Math.sin(k * 7 + i * 3) * 9); y += 8 + (i * k) % 7; c.lineTo(x, y); } c.stroke(); } });
export function makeDoll(boy = true) {
  const g = new THREE.Group(), teal = suit(0x2ec4b6), cream = suit(0xf1ead8), skin = plastic(0xffffff, { map: CRACK, roughness: 0.3 }), hair = suit(boy ? 0x3a2a1c : 0x2b1d14);
  add(g, lathe([[0, 0.02], [0.2, 0.02], [0.21, 0.06], [0.11, 0.42], [0.075, 0.5], [0, 0.5]], 20), teal); for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.19 - i * 0.03, 0.012, 6, 20), cream, 0, 0.09 + i * 0.1, 0).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) { const a = add(g, limbGeo(0.035, 0.03, 0.26, 8), teal, s * 0.1, 0.46, 0); a.rotation.z = s * 0.5; add(g, gSph(0.036, 10), skin, s * 0.23, 0.25, 0); }
  add(g, gSph(0.2, 24), skin, 0, 0.72, 0);
  const pupil = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xbffff5, emissiveIntensity: 0 }), eyeM = plastic(0x050505, { roughness: 0.05 });
  for (const s of [-1, 1]) { add(g, gSph(0.076, 18), eyeM, s * 0.082, 0.745, 0.142); add(g, gSph(0.013, 8), pupil, s * 0.08, 0.75, 0.214); add(g, gSph(0.035, 10), paint(0xe58a8a), s * 0.125, 0.655, 0.145).scale.z = 0.35; }
  const mouth = add(g, sq(0.115, 0.02, 0.02, 2.4, 12), BLACK, 0, 0.615, 0.178); for (let i = -3; i <= 3; i++) B(g, 0.004, 0.06, 0.004, paint(0x3a2a22), i * 0.03, 0.615, 0.196 - Math.abs(i) * 0.005);
  add(g, sq(0.055, 0.065, 0.02, 2, 10), BLACK, 0.085, 0.84, 0.165).rotation.set(-0.4, 0.4, 0.3); for (let k = 0; k < 4; k++) { const sh = add(g, new THREE.TetrahedronGeometry(0.028), skin, 0.085 + Math.cos(k * 1.6) * 0.06, 0.84 + Math.sin(k * 1.6) * 0.06, 0.17); sh.rotation.set(k, k * 2, k); sh.scale.z = 0.4; }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const cl = add(g, new THREE.ConeGeometry(0.01, 0.09, 6), paint(0x15110e, { roughness: 0.3 }), s * 0.23 + (k - 1) * 0.022, 0.2, 0.03); cl.rotation.x = Math.PI - 0.5; }
  add(g, gSph(0.02, 8), skin, 0, 0.69, 0.195);
  add(g, new THREE.SphereGeometry(0.212, 22, 10, 0, TAU, 0, Math.PI / 2.1), boy ? teal : hair, 0, 0.735, -0.012);
  if (boy) { add(g, sq(0.12, 0.012, 0.09, 2.6, 12), teal, 0, 0.8, 0.2); add(g, gSph(0.025, 8), cream, 0, 0.95, -0.01); }
  else for (const s of [-1, 1]) { add(g, sq(0.075, 0.1, 0.075, 2.2, 14), hair, s * 0.26, 0.7, -0.01); add(g, sq(0.04, 0.025, 0.03, 2.2, 10), teal, s * 0.2, 0.83, 0.02); }
  const key = new THREE.Group(); key.position.set(0, 0.32, -0.13); g.add(key); add(key, gCyl(0.012, 0.012, 0.12, 8), metal(0xf2c230, 0.3)).rotation.x = Math.PI / 2; for (const s of [-1, 1]) add(key, new THREE.TorusGeometry(0.035, 0.012, 6, 14), metal(0xf2c230, 0.3), s * 0.035, 0, -0.07);
  g.userData = { mouth, pupil, key };
  return g;
}

// ---------- Mr. Tokens: a scrapped prize machine ----------
export function makeTokens() {
  const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xc79a1e, map: GRIME, metalness: 0.55, roughness: 0.55 }), dkg = paint(0x5a430a, { map: GRIME }), steel = metal(0x8a8f96, 0.4);
  add(g, sq(0.36, 0.33, 0.26, 7, 24), gold); add(g, sq(0.3, 0.14, 0.03, 6, 14), dkg, 0, 0.13, 0.25); add(g, sq(0.24, 0.07, 0.03, 6, 12), BLACK, 0, -0.13, 0.25);
  for (const [x, y] of [[-0.31, 0.28], [0.31, 0.28], [-0.31, -0.28], [0.31, -0.28]]) add(g, gSph(0.018, 8), steel, x, y, 0.255);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x300604, emissive: 0xff2a1e, emissiveIntensity: 4 });
  for (const s of [-1, 1]) { add(g, new THREE.TorusGeometry(0.075, 0.018, 8, 20), steel, s * 0.15, 0.13, 0.275); add(g, gSph(0.07, 16), BLACK, s * 0.15, 0.13, 0.24); add(g, gSph(0.036, 12), eyeMat, s * 0.15, 0.13, 0.285); }
  for (let i = 0; i < 7; i++) { add(g, sq(0.02, 0.024, 0.012, 3, 6), TOOTH, (i - 3) * 0.062, -0.085, 0.275); add(g, sq(0.02, 0.024, 0.012, 3, 6), TOOTH, (i - 3) * 0.062 + 0.03, -0.175, 0.275); }
  const strip = sign(g, 0.1, 0.34, 0.03, -0.3, 0.28, 0, (c, w, h) => { for (let i = 0; i < 4; i++) { c.fillStyle = '#f2c230'; c.fillRect(0, i * h / 4, w, h / 4 - 3); c.fillStyle = '#7a1f2b'; c.font = `${h * 0.06}px Bungee`; c.textAlign = 'center'; c.fillText('TICKET', w / 2, i * h / 4 + h * 0.14); } }, false, 128); strip.rotation.x = 0.25; strip.material.side = THREE.DoubleSide;
  add(g, gCyl(0.1, 0.12, 0.05, 16), steel, 0, 0.35, 0); add(g, new THREE.SphereGeometry(0.1, 16, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x400806, emissive: 0xff2a1e, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 }), 0, 0.37, 0);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.37, 0, 0.05); g.add(a); add(a, gSph(0.06, 12), steel); const u = add(a, limbGeo(0.035, 0.03, 0.34, 8), steel); u.rotation.set(-1.0, 0, s * 0.7);
    const f = new THREE.Group(); f.position.set(s * 0.19, -0.14, 0.24); a.add(f); add(f, gSph(0.045, 10), steel); add(f, limbGeo(0.03, 0.025, 0.3, 8), steel).rotation.x = -1.9;
    for (let k = 0; k < 3; k++) { const cl = add(f, new THREE.ConeGeometry(0.018, 0.14, 6), steel, Math.cos(k * TAU / 3) * 0.04, 0.1 + Math.sin(k * TAU / 3) * 0.04, 0.32); cl.rotation.x = Math.PI / 2 + Math.sin(k * TAU / 3) * 0.4; cl.rotation.y = Math.cos(k * TAU / 3) * 0.4; }
    arms.push(a);
    for (const z of [-0.12, 0.12]) { const l = add(g, limbGeo(0.03, 0.02, 0.3, 8), steel, s * 0.3, -0.26, z); l.rotation.z = s * 1.0; }
  }
  add(g, gCyl(0.008, 0.008, 0.3, 6), steel, 0.2, 0.48, -0.1); add(g, gSph(0.025, 8), glow(0xff2a1e, 2), 0.2, 0.64, -0.1);
  g.visible = false; g.userData = { eyeMat, arms };
  return g;
}

// ---------- the music box ----------
export function makeMusicBox() {
  const g = new THREE.Group(), goldM = metal(0xf2c230, 0.3);
  const stripes = tex(256, 128, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f1ead8' : '#2ec4b6'; c.fillRect(i * 32, 0, 32, h); } c.fillStyle = '#7a1f2b'; c.font = '54px Bungee'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f1ead8'; c.beginPath(); c.arc(128, 64, 46, 0, 7); c.fill(); c.fillStyle = '#7a1f2b'; c.fillText('B', 128, 70); });
  add(g, sq(0.52, 0.38, 0.52, 9, 22), new THREE.MeshPhysicalMaterial({ map: stripes, roughness: 0.5, clearcoat: 0.6 }), 0, 0.42, 0);
  add(g, sq(0.56, 0.04, 0.56, 9, 18), goldM, 0, 0.04, 0); add(g, sq(0.545, 0.025, 0.545, 9, 18), goldM, 0, 0.79, 0);
  for (const [x, z] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) add(g, gSph(0.06, 12), goldM, x, 0.03, z);
  const lid = new THREE.Group(); lid.position.set(0, 0.81, -0.52); g.add(lid);
  add(lid, sq(0.56, 0.07, 0.56, 9, 18), suit(0x1c7f76), 0, 0.07, 0.52); const bow = suit(0xffd23a); for (const s of [-1, 1]) add(lid, sq(0.13, 0.07, 0.08, 2.2, 14), bow, s * 0.13, 0.19, 0.52).rotation.z = s * 0.3; add(lid, gSph(0.06, 12), bow, 0, 0.18, 0.52);
  const crank = new THREE.Group(); crank.position.set(0.53, 0.42, 0); g.add(crank);
  add(crank, gCyl(0.03, 0.03, 0.14, 10), goldM, 0.06, 0, 0).rotation.z = Math.PI / 2; add(crank, gCyl(0.02, 0.02, 0.22, 10), goldM, 0.13, 0.1, 0); add(crank, sq(0.05, 0.06, 0.05, 2.2, 12), plastic(0xc0392b), 0.17, 0.22, 0);
  const dolls = [makeDoll()]; dolls[0].scale.setScalar(1.3); g.add(dolls[0]);
  const hp = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU * 5; hp.push(new THREE.Vector3(Math.cos(a) * 0.13, 0.15 + i / 60 * 0.55, Math.sin(a) * 0.13)); }
  const spring = add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 80, 0.014, 6), goldM); spring.visible = false;
  g.userData = { lid, crank, dolls, spring };
  return g;
}

// A bare endoskeleton, slumped (Storage).
export function makeEndo() {
  const g = new THREE.Group(), m = ENDO;
  add(g, sq(0.16, 0.2, 0.11, 3, 12), m, 0, 0.55, 0); add(g, gCyl(0.03, 0.03, 0.14, 8), m, 0, 0.8, 0);
  add(g, sq(0.12, 0.11, 0.12, 2.6, 14), m, 0, 0.95, 0.03).rotation.x = 0.5; for (const s of [-1, 1]) { add(g, gSph(0.035, 10), BLACK, s * 0.05, 0.95, 0.13); add(g, gSph(0.014, 6), glow(0xff2a1e, 0.6), s * 0.05, 0.94, 0.16); }
  for (const s of [-1, 1]) { const a = add(g, limbGeo(0.03, 0.025, 0.4, 8), m, s * 0.2, 0.72, 0); a.rotation.z = s * 0.25; add(g, limbGeo(0.025, 0.02, 0.36, 8), m, s * 0.3, 0.34, 0).rotation.x = -0.9; const l = add(g, limbGeo(0.035, 0.03, 0.45, 8), m, s * 0.1, 0.36, 0.02); l.rotation.x = -1.45; l.rotation.z = s * 0.15; add(g, limbGeo(0.03, 0.025, 0.4, 8), m, s * 0.17, 0.3, 0.46).rotation.x = -0.2; }
  return g;
}
