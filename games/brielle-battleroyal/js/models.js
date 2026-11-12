// Models built from simple shapes: players (with outfits), weapons, loot, chests, the Shore Blimp, gliders and build pieces.
import * as THREE from 'three';
import { OUTFITS, BUILD, RARITY } from '../shared/rules.js';
import { pieceBoxes, bounds, CONE_H } from '../shared/build.js';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(key);
}
const box = (w, h, d, color, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = true; return m; };
function rbox(w, h, d, r, color) {
  // rounded box (looks friendlier than a plain box)
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(d - r * 2) / 2);
  const m = new THREE.Mesh(g, mat(color)); m.castShadow = true;
  return m;
}
const limb = (len, rad, color) => {
  const g = new THREE.CapsuleGeometry(rad, len - rad * 2, 3, 8);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat(color)); m.castShadow = true;
  return m;
};

// ---------- weapons ----------
const GUN_COLORS = { body: 0x2c3138, wood: 0x8a5a33, metal: 0x6b737d };
export function weaponModel(kind, rarity = 0) {
  const g = new THREE.Group();
  const rc = new THREE.Color(RARITY[rarity] ? RARITY[rarity].color : '#ccc').getHex();
  const add = (m) => { g.add(m); return m; };
  switch (kind) {
    case 'pistol': add(box(0.07, 0.11, 0.3, GUN_COLORS.body, 0, 0, -0.08)); add(box(0.06, 0.16, 0.07, GUN_COLORS.body, 0, -0.1, 0.03)); add(box(0.075, 0.03, 0.18, rc, 0, 0.065, -0.1)); break;
    case 'smg': add(box(0.08, 0.13, 0.48, GUN_COLORS.body, 0, 0, -0.15)); add(box(0.06, 0.2, 0.07, GUN_COLORS.metal, 0, -0.14, -0.1)); add(box(0.06, 0.15, 0.07, GUN_COLORS.body, 0, -0.1, 0.06)); add(box(0.085, 0.04, 0.3, rc, 0, 0.08, -0.12)); break;
    case 'ar': add(box(0.08, 0.13, 0.78, GUN_COLORS.body, 0, 0, -0.25)); add(box(0.065, 0.2, 0.08, GUN_COLORS.metal, 0, -0.15, -0.18)); add(box(0.07, 0.15, 0.26, GUN_COLORS.body, 0, -0.03, 0.22)); add(box(0.04, 0.05, 0.22, GUN_COLORS.metal, 0, 0.1, -0.2)); add(box(0.085, 0.045, 0.4, rc, 0, 0.04, -0.4)); break;
    case 'pump': add(box(0.08, 0.1, 0.9, GUN_COLORS.metal, 0, 0.02, -0.3)); add(box(0.1, 0.1, 0.24, GUN_COLORS.wood, 0, -0.04, -0.42)); add(box(0.08, 0.16, 0.3, GUN_COLORS.wood, 0, -0.06, 0.2)); add(box(0.09, 0.035, 0.3, rc, 0, 0.08, -0.15)); break;
    case 'tac': add(box(0.09, 0.12, 0.8, GUN_COLORS.body, 0, 0, -0.25)); add(box(0.07, 0.17, 0.08, GUN_COLORS.body, 0, -0.12, 0)); add(box(0.08, 0.14, 0.24, GUN_COLORS.metal, 0, -0.02, 0.22)); add(box(0.095, 0.04, 0.34, rc, 0, 0.08, -0.25)); break;
    case 'sniper': add(box(0.07, 0.11, 1.15, GUN_COLORS.wood, 0, 0, -0.35)); add(box(0.04, 0.04, 0.5, GUN_COLORS.metal, 0, 0.02, -0.95)); { const s = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.36, 10), mat(0x1c1f24))); s.rotation.x = Math.PI / 2; s.position.set(0, 0.11, -0.25); } add(box(0.075, 0.03, 0.3, rc, 0, 0.06, -0.55)); break;
    case 'rocket': { const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 12), mat(0x3d5a3d))); t.rotation.x = Math.PI / 2; t.position.set(0, 0.05, -0.25); add(box(0.06, 0.18, 0.08, GUN_COLORS.body, 0, -0.12, -0.1)); const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.025, 6, 16), mat(rc))); r.position.set(0, 0.05, -0.7); break; }
    case 'grenade': { const s = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xd9462a))); s.scale.set(1.3, 0.8, 1); add(box(0.04, 0.03, 0.04, 0x333333, 0, 0.08, 0)); for (const sx of [-1, 1]) add(box(0.12, 0.03, 0.03, 0xd9462a, sx * 0.14, 0, -0.06)); break; }
    case 'bandage': add(box(0.18, 0.1, 0.14, 0xf3efe6)); add(box(0.19, 0.03, 0.15, 0xd23c3c)); break;
    case 'medkit': add(box(0.34, 0.24, 0.12, 0xf3efe6)); add(box(0.08, 0.2, 0.13, 0xd23c3c)); add(box(0.2, 0.07, 0.13, 0xd23c3c)); break;
    case 'seaglass': { const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.85, emissive: 0x1a5fa0 }))); b.position.y = 0.05; add(box(0.05, 0.06, 0.05, 0xf3efe6, 0, 0.19, 0)); break; }
    case 'jug': { const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.32, 10), new THREE.MeshLambertMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.88, emissive: 0x1a3fa0 }))); b.position.y = 0.06; add(box(0.07, 0.07, 0.07, 0xf3efe6, 0, 0.26, 0)); break; }
    case 'slush': { const c = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.26, 10), mat(0xffffff))); c.position.y = 0.04; const t = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff3d8b, emissive: 0x8a1040 }))); t.position.y = 0.17; add(box(0.015, 0.2, 0.015, 0xffd23d, 0.03, 0.27, 0)); break; }
    default: add(box(0.1, 0.1, 0.3, 0x888888));
  }
  return g;
}

export function pickaxeModel() {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.85, 6), mat(0x7a5236)); h.position.y = 0.0; g.add(h);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.08), mat(0x9aa4b0)); head.position.y = 0.4; g.add(head);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), mat(0xffd23d)); tip.rotation.z = -Math.PI / 2; tip.position.set(0.38, 0.4, 0); g.add(tip);
  g.rotation.x = -Math.PI / 2;
  return g;
}

// ---------- players ----------
const outfitOf = (id) => OUTFITS.find((o) => o.id === id) || OUTFITS[0];
export class Avatar {
  constructor(look = {}, opts = {}) {
    const o = outfitOf(look.outfit);
    this.o = o;
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); root.add(body);
    body.position.y = 0.95;
    const torso = rbox(0.56, 0.62, 0.3, 0.08, o.body); torso.position.y = 0.32; body.add(torso);
    const belt = box(0.57, 0.08, 0.31, 0x2a2a2a, 0, 0.04, 0); body.add(belt);
    const neck = new THREE.Group(); neck.position.y = 0.66; body.add(neck); this.neck = neck;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), mat(o.skin)); head.position.y = 0.22; head.scale.set(1, 1.05, 0.96); head.castShadow = true; neck.add(head);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), mat(0x1a1a1a)); e.position.set(s * 0.09, 0.25, -0.225); neck.add(e); }
    const mouth = box(0.09, 0.02, 0.02, 0x5a2a2a, 0, 0.13, -0.235); neck.add(mouth);
    this.addHat(neck, o, opts.crown);
    const pack = rbox(0.4, 0.42, 0.16, 0.05, o.pack); pack.position.set(0, 0.34, 0.22); body.add(pack);
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.36, 0.56, 0); body.add(sh);
      const up = limb(0.34, 0.085, o.body); sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
      const lo = limb(0.32, 0.075, o.skin); el.add(lo);
      const hand = new THREE.Group(); hand.position.y = -0.33; el.add(hand);
      this.arms.push({ sh, el, hand });
    }
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.15, 0.0, 0); body.add(hip);
      const up = limb(0.46, 0.11, o.legs); hip.add(up);
      const kn = new THREE.Group(); kn.position.y = -0.44; hip.add(kn);
      const lo = limb(0.44, 0.095, o.legs); kn.add(lo);
      const shoe = box(0.17, 0.1, 0.28, 0x22252a, 0, -0.46, -0.05); kn.add(shoe);
      this.legs.push({ hip, kn });
    }
    // held item sits in the right hand
    this.held = null; this.heldKey = '';
    this.glider = null;
    this.t = Math.random() * 10;
    this.root.traverse((m) => { if (m.isMesh) m.userData.av = this; });
  }

  addHat(neck, o, crown) {
    const c = o.hatc;
    let hat = null;
    if (crown) {
      hat = new THREE.Group();
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xffc83d, emissive: 0x6a4a00, side: THREE.DoubleSide }));
      hat.add(band);
      for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), band.material); const a = i / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.22); hat.add(sp); }
      hat.position.y = 0.46;
    } else if (o.hat === 'cap') { hat = new THREE.Group(); const d = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(c)); hat.add(d); const b = box(0.3, 0.03, 0.2, c, 0, 0, -0.26); hat.add(b); hat.position.y = 0.3; }
    else if (o.hat === 'bucket') { hat = new THREE.Group(); const d = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.18, 12), mat(c)); d.position.y = 0.06; hat.add(d); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 14), mat(c)); hat.add(r); hat.position.y = 0.36; }
    else if (o.hat === 'beanie') { hat = new THREE.Mesh(new THREE.SphereGeometry(0.265, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), mat(c)); hat.position.y = 0.27; }
    else if (o.hat === 'visor') { hat = box(0.5, 0.06, 0.3, c, 0, 0.36, -0.1); }
    else if (o.hat === 'captain') { hat = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.24, 0.14, 14), mat(0xffffff)); t.position.y = 0.07; hat.add(t); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 14), mat(c)); hat.add(b); hat.add(box(0.26, 0.025, 0.14, 0x111111, 0, -0.02, -0.25)); hat.position.y = 0.36; }
    else if (o.hat === 'hood') { hat = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6), mat(c)); hat.position.set(0, 0.2, 0.04); hat.scale.set(1, 1.1, 1.1); }
    if (hat) neck.add(hat);
  }

  setHeld(key, rarity) {
    const k = key + ':' + rarity;
    if (k === this.heldKey) return;
    this.heldKey = k;
    const hand = this.arms[1].hand;
    if (this.held) hand.remove(this.held);
    this.held = null;
    if (!key) return;
    this.held = key === 'pickaxe' ? pickaxeModel() : weaponModel(key, rarity);
    if (key !== 'pickaxe') { this.held.rotation.x = -Math.PI / 2; this.held.position.set(0, -0.06, -0.04); }
    else { this.held.position.set(0, 0, 0); this.held.rotation.set(Math.PI / 2, 0, 0); }
    hand.add(this.held);
  }

  setGlider(on) {
    if (on && !this.glider) {
      const g = this.glider = new THREE.Group();
      const arc = (r, len, color) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
        m.rotation.x = Math.PI / 2; m.scale.z = 0.5; m.position.y = 0.3;   // axis front-to-back, arc over the head
        return m;
      };
      g.add(arc(2.2, 1.5, this.o.pack), arc(2.21, 0.35, 0xffffff));
      for (const s of [-1, 1]) { const l = box(0.02, 1.7, 0.02, 0xdddddd, s * 0.75, 0.6, 0); l.rotation.z = s * 0.55; g.add(l); }
      g.position.y = 2.0;
      this.root.add(g);
    } else if (!on && this.glider) { this.root.remove(this.glider); this.glider = null; }
  }

  /** state: { speed, mode ('ground'|'sky'|'glide'|'swim'), crouch, aim (has gun), pitch, swing (0..1), build } */
  animate(dt, st) {
    this.t += dt * (st.mode === 'ground' ? 1 + st.speed * 1.4 : 1);
    const t = this.t;
    const [la, ra] = this.arms, [ll, rl] = this.legs;
    const run = Math.min(1, st.speed / 6);
    const sw = Math.sin(t * 2.4) * run;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0.95;
    this.setGlider(st.mode === 'glide');
    if (st.mode === 'sky') {
      this.body.rotation.x = 1.25;
      this.body.position.y = 1.1;
      for (const [i, a] of [la, ra].entries()) { a.sh.rotation.set(0, 0, (i ? 1 : -1) * 1.3 + Math.sin(t * 9) * 0.05); a.el.rotation.set(0, 0, (i ? 1 : -1) * 0.3); }
      for (const [i, l] of [ll, rl].entries()) { l.hip.rotation.set(-0.2, 0, (i ? 1 : -1) * 0.35); l.kn.rotation.set(-0.6, 0, 0); }
      this.neck.rotation.x = -0.9;
      return;
    }
    this.neck.rotation.x = 0;
    if (st.mode === 'glide') {
      for (const [i, a] of [la, ra].entries()) { a.sh.rotation.set(Math.PI - 0.1, 0, (i ? 1 : -1) * 0.25); a.el.rotation.set(0, 0, 0); }
      for (const l of [ll, rl]) { l.hip.rotation.set(Math.sin(t * 2) * 0.15, 0, 0); l.kn.rotation.set(0.2, 0, 0); }
      return;
    }
    if (st.mode === 'swim') {
      this.body.rotation.x = 1.0; this.body.position.y = 0.6; this.neck.rotation.x = -0.8;
      la.sh.rotation.set(Math.sin(t * 3) * 1.4 + 1.5, 0, -0.2); ra.sh.rotation.set(-Math.sin(t * 3) * 1.4 + 1.5, 0, 0.2);
      for (const [i, l] of [ll, rl].entries()) { l.hip.rotation.set(Math.sin(t * 6 + i * 3) * 0.4, 0, 0); l.kn.rotation.set(0.2, 0, 0); }
      return;
    }
    // legs
    const crouch = st.crouch ? 1 : 0;
    this.body.position.y = 0.95 - crouch * 0.35 + Math.abs(Math.sin(t * 2.4)) * 0.05 * run;
    ll.hip.rotation.set(sw * 0.9 + crouch * 1.1, 0, 0); ll.kn.rotation.set(-(Math.max(0, -sw) * 1.2 + crouch * 1.7), 0, 0);
    rl.hip.rotation.set(-sw * 0.9 + crouch * 1.1, 0, 0); rl.kn.rotation.set(-(Math.max(0, sw) * 1.2 + crouch * 1.7), 0, 0);
    if (!st.onGround && st.mode === 'ground') { ll.hip.rotation.x = 0.7; ll.kn.rotation.x = -1.1; rl.hip.rotation.x = -0.2; rl.kn.rotation.x = -0.3; }
    this.body.rotation.x = crouch * 0.25;
    // arms
    if (st.swing > 0) {
      const s = st.swing;
      ra.sh.rotation.set(2.7 - (1 - s) * 2.4, 0, 0.2); ra.el.rotation.set(0.3, 0, 0);
      la.sh.rotation.set(0.5, 0, 0.2); la.el.rotation.set(0.6, 0, 0);
    } else if (st.aim) {
      const p = Math.PI / 2 + (st.pitch || 0);
      ra.sh.rotation.set(p, 0, -0.08); ra.el.rotation.set(0, 0, 0);
      la.sh.rotation.set(p - 0.05, 0, 0.62); la.el.rotation.set(0.2, 0, 0);
      this.neck.rotation.x = -(st.pitch || 0) * 0.5;
      if (st.busy) { ra.sh.rotation.x = 0.9; la.sh.rotation.x = 0.9; }
    } else if (st.build) {
      ra.sh.rotation.set(1.2 + Math.sin(t * 3) * 0.05, 0, -0.1); ra.el.rotation.set(0.4, 0, 0);
      la.sh.rotation.set(1.0, 0, 0.1); la.el.rotation.set(0.5, 0, 0);
    } else {
      la.sh.rotation.set(-sw * 0.8, 0, -0.08); la.el.rotation.set(0.3 + run * 0.4, 0, 0);
      ra.sh.rotation.set(sw * 0.8 + (st.holding ? 0.5 : 0), 0, 0.08); ra.el.rotation.set(0.3 + run * 0.4, 0, 0);
    }
  }
}

// ---------- loot on the ground ----------
let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

const AMMO_COLORS = { light: 0x9fd4ff, medium: 0x9aff8a, shells: 0xff6b5a, heavy: 0x7a8cff, rockets: 0xffb03a };
const MAT_COLORS = [0xb88652, 0xb5523b, 0x9aa4b0];
export function lootModel(l) {
  const g = new THREE.Group();
  if (l.t === 'chest' || l.t === 'abox') {
    const gold = l.t === 'chest';
    const b = box(gold ? 1.0 : 0.8, gold ? 0.55 : 0.45, gold ? 0.62 : 0.5, gold ? 0x8a5a2b : 0x4d6b3d, 0, gold ? 0.28 : 0.23, 0); g.add(b);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, gold ? 1.0 : 0.8, 10, 1, false, 0, Math.PI), mat(gold ? 0x9a6a33 : 0x56783f));
    lid.rotation.z = Math.PI / 2; lid.position.y = gold ? 0.55 : 0.45; lid.scale.set(1, 1, gold ? 1 : 0.8); g.add(lid);
    if (gold) {
      for (const x of [-0.42, 0.42]) g.add(box(0.06, 0.62, 0.66, 0xffc83d, x, 0.4, 0));
      g.add(box(0.14, 0.18, 0.05, 0xffe27a, 0, 0.5, -0.33));
      const s = glowSprite(0xffd23d, 2.2); s.position.y = 0.6; g.add(s); g.userData.spark = s;
    } else g.add(box(0.3, 0.06, 0.52, 0xd9d4c7, 0, 0.4, 0));
    return g;
  }
  if (l.t === 'ammo') {
    const c = AMMO_COLORS[l.a] || 0xffffff;
    g.add(box(0.36, 0.22, 0.26, 0x3d4a3a, 0, 0.11, 0)); g.add(box(0.37, 0.06, 0.27, c, 0, 0.2, 0));
    const s = glowSprite(c, 0.8); s.position.y = 0.25; g.add(s);
    return g;
  }
  if (l.t === 'mats') {
    const c = MAT_COLORS[l.m];
    for (let i = 0; i < 3; i++) g.add(box(0.5, 0.12, 0.25, c, (i - 1) * 0.08, 0.06 + i * 0.12, (i % 2) * 0.05));
    return g;
  }
  const it = l.it;
  const w = weaponModel(it.k, it.r);
  w.position.y = 0.45; w.rotation.y = Math.PI / 2;
  if (['bandage', 'medkit', 'seaglass', 'jug', 'slush', 'grenade'].includes(it.k)) { w.rotation.y = 0; w.scale.setScalar(1.5); }
  g.add(w); g.userData.spin = w;
  const color = new THREE.Color(RARITY[it.r].color);
  const s = glowSprite(color, 1.6); s.position.y = 0.3; g.add(s);
  if (it.r >= 2) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 6, 6, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 3; g.add(beam);
  }
  return g;
}

// ---------- the Shore Blimp ----------
export function blimpModel() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), new THREE.MeshLambertMaterial({ color: 0xf7f2e4 }));
  hull.scale.set(9, 9, 30); g.add(hull);
  const band = new THREE.Mesh(new THREE.SphereGeometry(1.01, 28, 16, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16), new THREE.MeshLambertMaterial({ color: 0x2b62c7 }));
  band.scale.copy(hull.scale); g.add(band);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 8), new THREE.MeshLambertMaterial({ color: 0xd23c3c }));
    fin.position.set(0, 0, 25); fin.rotation.z = i * Math.PI / 2; fin.translateY(6); g.add(fin);
  }
  const gondola = box(5, 3, 12, 0x2c3138, 0, -10, 0); g.add(gondola);
  for (let i = -2; i <= 2; i++) g.add(box(0.1, 1.2, 1.4, 0x9fd4ff, 2.55, -9.7, i * 2.3)), g.add(box(0.1, 1.2, 1.4, 0x9fd4ff, -2.55, -9.7, i * 2.3));
  // name on the side
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#2b62c7'; x.font = '900 120px Bungee, Outfit, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('SHORE BLIMP', 512, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    p.position.set(s * 9.05, 2, 0); p.rotation.y = s * Math.PI / 2; g.add(p);
  }
  g.userData.props = [];
  for (const s of [-1, 1]) { const pr = box(0.3, 4, 0.3, 0x444444, s * 3.2, -10, 6.5); g.add(pr); g.userData.props.push(pr); }
  return g;
}

// ---------- build pieces ----------
const PIECE_TEX = [];
function pieceTex(m) {
  if (PIECE_TEX[m]) return PIECE_TEX[m];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  if (m === 0) {
    g.fillStyle = '#b8864f'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#a9773f' : '#c49359'; g.fillRect(0, i * 16, 128, 15); g.fillStyle = 'rgba(60,30,10,0.5)'; g.fillRect(0, i * 16 + 15, 128, 1); g.fillRect((i * 37) % 128, i * 16, 2, 16); }
  } else if (m === 1) {
    g.fillStyle = '#9c8f84'; g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) for (let k = 0; k < 4; k++) { g.fillStyle = ['#b5523b', '#a84a35', '#bf5c43'][(r + k) % 3]; g.fillRect(k * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14); }
  } else {
    const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, '#aab3bd'); gr.addColorStop(1, '#7f8892');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(40,45,50,0.6)'; g.lineWidth = 2; g.strokeRect(4, 4, 120, 120); g.beginPath(); g.moveTo(64, 4); g.lineTo(64, 124); g.stroke();
    g.fillStyle = '#5d6670'; for (const [x, y] of [[10, 10], [118, 10], [10, 118], [118, 118], [58, 10], [70, 118]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  PIECE_TEX[m] = t;
  return t;
}
const pieceMats = [];
export function pieceMat(m) { return pieceMats[m] || (pieceMats[m] = new THREE.MeshLambertMaterial({ map: pieceTex(m) })); }
export const ghostMat = new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.38, depthWrite: false });
export const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.32, depthWrite: false });

function boxesGeo(boxes, cx, cy, cz) {
  const parts = boxes.map((b) => {
    const g = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
    // texture coordinates in world metres so tiles line up
    const uv = g.attributes.uv, pos = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (b.x0 + b.x1) / 2, y = pos.getY(i) + (b.y0 + b.y1) / 2, z = pos.getZ(i) + (b.z0 + b.z1) / 2;
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      if (ny > 0.5) uv.setXY(i, x / 2, z / 2); else if (nx > 0.5) uv.setXY(i, z / 2, y / 1.7); else uv.setXY(i, x / 2, y / 1.7);
    }
    g.translate((b.x0 + b.x1) / 2 - cx, (b.y0 + b.y1) / 2 - cy, (b.z0 + b.z1) / 2 - cz);
    return g;
  });
  if (parts.length === 1) return parts[0];
  return mergeSimple(parts);
}
function mergeSimple(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const P = new Float32Array(vc * 3), N = new Float32Array(vc * 3), U = new Float32Array(vc * 2), I = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); U.set(g.attributes.uv.array, vo * 2);
    const idx = g.index.array; for (let i = 0; i < idx.length; i++) I[io + i] = idx[i] + vo;
    vo += g.attributes.position.count; io += idx.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}

/** A mesh for a piece (wall/floor from boxes, ramp/cone shaped). Position = piece center. */
export function pieceGeometry(p) {
  const b = bounds(p);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2;
  const C = BUILD.CELL, L = BUILD.LEVEL;
  let geo;
  if (p.t === 'wall' || p.t === 'floor') geo = boxesGeo(pieceBoxes(p), cx, cy, cz);
  else if (p.t === 'ramp') {
    const len = Math.hypot(C, L);
    geo = new THREE.BoxGeometry(C, 0.22, len);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2.5);
    geo.rotateX(Math.atan2(L, C));
    geo.rotateY(-p.dir * Math.PI / 2);
  } else {
    geo = new THREE.ConeGeometry(C * 0.7071, CONE_H, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.scale(1, 1, 1);
  }
  return { geo, pos: new THREE.Vector3(cx, cy, cz) };
}
