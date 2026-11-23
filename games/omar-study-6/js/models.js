// Everything that moves: people, guns, cars, the police helicopter, plus the small street props.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carGeometry, buildCar, lightMaterial, TRAFFIC, mergeParts, PAINT, GLASS, TRIM, METAL, carLookEnv, carLookHi } from './carmodels.js';
import { CARS } from './carbodies.js';
import { VEHICLES, CAR_COLORS, OUTFITS, ROLE, PS, VK } from '../shared/rules.js';

// ---------------------------------------------------------------- helpers
const mats = new Map();
export function flat(hex, o = {}) {
  const k = hex + '|' + (o.e || 0) + '|' + (o.basic ? 1 : 0);
  let m = mats.get(k);
  if (!m) { m = o.basic ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex, emissive: o.e || 0 }); mats.set(k, m); }
  return m;
}
/** Paints a whole geometry one colour (for merging into a single vertex-coloured mesh). */
export function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
  return g;
}
const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)); return geo.clone().applyMatrix4(m); };
export const box = (w, h, d, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => tint(at(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), hex);
export const vmat = () => (mats.get('vc') || (mats.set('vc', new THREE.MeshLambertMaterial({ vertexColors: true })), mats.get('vc')));

// ---------------------------------------------------------------- people
const SKIN = [0xf0c8a0, 0xe2b48c, 0xc68e62, 0x9c6a42, 0x6e4628], TOPS = [0xd94f3a, 0x2a6fdb, 0xf2c14b, 0x3aa56b, 0xf4f6fa, 0x8a4fc9, 0x23262e, 0xf28ab2, 0x3ab8c9, 0xb86a2e], LEGS = [0x23262e, 0x2f4a7a, 0x6b5a45, 0xd8d2c2, 0x4a4f5a], HAIR = [0x18120c, 0x2a1c12, 0x5a3a1c, 0xd9b46a, 0x8a8f99];
const STYLES = ['short', 'long', 'cap', 'short', 'bald', 'beanie', 'long', 'slick'];
export function lookFor(role, n) {
  const skin = SKIN[n % 5], hair = HAIR[(n * 3) % 5];
  if (role === ROLE.COP) return { skin, top: 0x1f2f55, legs: 0x161d33, hair, style: 'cap', hat: 0x161d33, badge: 0xe0b23a };
  if (role === ROLE.SWAT) return { skin, top: 0x16181d, legs: 0x16181d, hair, style: 'helmet', hat: 0x101114, vest: 0x23262e };
  if (role === ROLE.GUARD) return { skin, top: 0x8b9099, legs: 0x23262e, hair, style: 'cap', hat: 0x23262e, badge: 0xd8dbe0 };
  if (role === ROLE.CLERK) return { skin, top: 0x2f8f5b, legs: 0x3a3f4a, hair, style: n % 2 ? 'short' : 'long', vest: 0x1d5f3c };
  return { skin, top: TOPS[(n * 7) % 10], legs: LEGS[(n * 3) % 5], hair, style: STYLES[n % 8], hat: TOPS[(n * 5) % 10] };
}
export const outfitLook = (i) => OUTFITS[Math.max(0, Math.min(OUTFITS.length - 1, i | 0))];

let PG = null;
function personGeo() {
  if (PG) return PG;
  const arm = new THREE.CapsuleGeometry(0.055, 0.46, 3, 8); arm.translate(0, -0.27, 0);
  const leg = new THREE.CapsuleGeometry(0.078, 0.64, 3, 8); leg.translate(0, -0.4, 0);
  PG = {
    torso: new THREE.CapsuleGeometry(0.19, 0.3, 3, 10), hips: new THREE.BoxGeometry(0.34, 0.17, 0.21), head: new THREE.SphereGeometry(0.135, 12, 10), neck: new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8),
    arm, leg, hand: new THREE.SphereGeometry(0.052, 8, 6), eye: new THREE.SphereGeometry(0.019, 6, 5), shoe: new THREE.BoxGeometry(0.11, 0.075, 0.25),
    cap: new THREE.SphereGeometry(0.146, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), brim: new THREE.BoxGeometry(0.2, 0.02, 0.15), drape: new THREE.BoxGeometry(0.27, 0.26, 0.09),
    hood: new THREE.SphereGeometry(0.168, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.72), helm: new THREE.SphereGeometry(0.162, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), visor: new THREE.BoxGeometry(0.22, 0.07, 0.06),
    vest: new THREE.CapsuleGeometry(0.2, 0.2, 3, 10), badge: new THREE.BoxGeometry(0.05, 0.06, 0.02), tie: new THREE.BoxGeometry(0.045, 0.24, 0.02), stripe: new THREE.BoxGeometry(0.03, 0.5, 0.03),
  };
  return PG;
}
export function makePerson(L) {
  const G = personGeo(), g = new THREE.Group(), body = new THREE.Group(), M = (geo, hex) => new THREE.Mesh(geo, flat(hex));
  g.add(body);
  const add = (mesh, x, y, z, parent = body) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  const torso = add(M(G.torso, L.top), 0, 1.22, 0); torso.scale.set(1.08, 1, 0.72);
  add(M(G.hips, L.legs), 0, 0.94, 0);
  add(M(G.neck, L.skin), 0, 1.5, 0);
  const head = new THREE.Group(); head.position.set(0, 1.63, 0); body.add(head);
  const skull = M(G.head, L.skin); skull.scale.set(1, 1.15, 1.05); head.add(skull);
  for (const s of [1, -1]) { const e = M(G.eye, 0x1a1a1d); e.position.set(0.052 * s, 0.02, 0.127); head.add(e); }
  const cap = (geo, hex, s = 1, y = 0.012) => { const m = M(geo, hex); m.position.y = y; m.scale.setScalar(s); head.add(m); return m; };
  if (L.style === 'short' || L.style === 'slick' || L.style === 'cap') cap(G.cap, L.hair, L.style === 'slick' ? 0.99 : 1.02);
  if (L.style === 'long') { cap(G.cap, L.hair, 1.06); add(M(G.drape, L.hair), 0, -0.08, -0.1, head); }
  if (L.style === 'cap') { cap(G.cap, L.hat, 1.08, 0.03); add(M(G.brim, L.hat), 0, 0.075, 0.17, head); }
  if (L.style === 'beanie') cap(G.cap, L.hat, 1.1, 0.02);
  if (L.style === 'hood') { const h = cap(G.hood, L.top, 1, 0.0); h.rotation.x = -0.5; }
  if (L.style === 'helmet') { cap(G.helm, L.hat, 1, 0.01); add(M(G.visor, 0x1a2433), 0, 0.03, 0.13, head); }
  if (L.vest) { const v = add(M(G.vest, L.vest), 0, 1.24, 0); v.scale.set(1.12, 1, 0.8); }
  if (L.badge) add(M(G.badge, L.badge), 0.09, 1.34, 0.145);
  if (L.tie) add(M(G.tie, L.tie), 0, 1.3, 0.145);
  const limb = (geo, hex, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.add(M(geo, hex)); body.add(p); return p; };
  const armL = limb(G.arm, L.top, 0.27, 1.43), armR = limb(G.arm, L.top, -0.27, 1.43), legL = limb(G.leg, L.legs, 0.1, 0.9), legR = limb(G.leg, L.legs, -0.1, 0.9);
  for (const a of [armL, armR]) add(M(G.hand, L.skin), 0, -0.56, 0, a);
  for (const l of [legL, legR]) { add(M(G.shoe, 0x1a1a1d), 0, -0.845, 0.05, l); if (L.stripe) add(M(G.stripe, L.stripe), l === legL ? 0.08 : -0.08, -0.4, 0, l); }
  const hand = new THREE.Group(); hand.position.set(0, -0.58, 0.03); hand.rotation.x = Math.PI / 2; armR.add(hand);
  return { g, body, head, armL, armR, legL, legR, hand, gun: null, gunId: -1, t: Math.random() * 10, dead: 0 };
}
/** Poses a person. st is a PS value; sp = how fast they move; pitch = where they aim; swing 0..1 = a punch or bat swing. */
export function pose(m, st, dt, sp, pitch = 0, swing = 0) {
  m.t += dt * (0.4 + Math.min(sp, 8) * 0.34);
  const ph = m.t * 4.2, moving = sp > 0.3, run = sp > 4.2, amp = moving ? (run ? 0.95 : 0.55) : 0;
  let la = Math.sin(ph) * amp * 0.8, ra = -Math.sin(ph) * amp * 0.8, lz = 0.06, rz = -0.06, by = moving ? Math.abs(Math.sin(ph)) * (run ? 0.05 : 0.025) : Math.sin(m.t * 1.3) * 0.004, lean = run ? 0.14 : 0, ll = -Math.sin(ph) * amp, rl = Math.sin(ph) * amp;
  if (st === PS.DEAD) { m.dead = Math.min(1, m.dead + dt * 3.5); } else m.dead = Math.max(0, m.dead - dt * 4);
  if (st === PS.AIM) { ra = -Math.PI / 2 - pitch; la = -Math.PI / 2 - pitch + 0.1; lz = -0.5; rz = 0.12; lean = 0.03; }
  else if (st === PS.COWER) { by = -0.42; ll = rl = -1.15; la = ra = -2.7; lz = -0.35; rz = 0.35; lean = 0.5; }
  else if (st === PS.FLEE) { la = -2.4 + Math.sin(ph * 1.3) * 0.5; ra = -2.4 - Math.sin(ph * 1.3) * 0.5; }
  else if (st === PS.FIGHT) { la = -1.5; ra = -1.3 + Math.sin(m.t * 9) * 0.5; lz = -0.3; rz = 0.3; }
  else if (m.gunId >= 2 && st !== PS.DEAD) { ra = -0.62 + Math.sin(ph) * amp * 0.12; rz = -0.02; }
  if (swing > 0) { ra = -2.6 + swing * 2.9; rz = 0.25; lean += 0.12; }
  m.armL.rotation.set(la, 0, lz); m.armR.rotation.set(ra, 0, rz); m.legL.rotation.x = ll; m.legR.rotation.x = rl;
  const d = m.dead * m.dead * (3 - 2 * m.dead);
  m.body.position.y = by * (1 - d) + 0.2 * d - 0.0; m.body.rotation.x = lean * (1 - d) - (Math.PI / 2) * d; m.body.position.z = -0.9 * d;
  m.head.rotation.x = st === PS.AIM ? -pitch * 0.6 : 0;
}

const GUNS = [null,
  () => [tint(at(new THREE.CylinderGeometry(0.026, 0.04, 0.78, 8), 0, 0, 0.33, Math.PI / 2), 0x9a6b3c)],
  () => [box(0.045, 0.1, 0.2, 0x2a2d33, 0, 0.02, 0.1), box(0.04, 0.12, 0.06, 0x1c1e22, 0, -0.07, 0.03)],
  () => [box(0.05, 0.1, 0.36, 0x2a2d33, 0, 0.02, 0.16), box(0.04, 0.18, 0.05, 0x1c1e22, 0, -0.1, 0.14), box(0.04, 0.12, 0.05, 0x1c1e22, 0, -0.07, 0.02)],
  () => [box(0.05, 0.07, 0.75, 0x2a2d33, 0, 0.03, 0.34), box(0.06, 0.07, 0.24, 0x7a4a26, 0, 0.0, 0.42), box(0.05, 0.1, 0.24, 0x7a4a26, 0, -0.01, -0.06)],
  () => [box(0.05, 0.09, 0.62, 0x23262e, 0, 0.03, 0.28), box(0.03, 0.03, 0.26, 0x16181d, 0, 0.03, 0.7), box(0.04, 0.2, 0.06, 0x16181d, 0, -0.11, 0.22), box(0.045, 0.1, 0.22, 0x23262e, 0, 0.0, -0.1)],
  () => [box(0.05, 0.08, 0.72, 0x3a3f2f, 0, 0.03, 0.3), box(0.025, 0.025, 0.4, 0x16181d, 0, 0.03, 0.86), tint(at(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), 0, 0.1, 0.3, Math.PI / 2), 0x16181d), box(0.045, 0.11, 0.24, 0x3a3f2f, 0, 0.0, -0.1)],
];
const gunGeo = [];
/** Puts weapon w in a person's right hand (0 = empty hands). */
export function setGun(m, w) {
  if (m.gunId === w) return; m.gunId = w;
  if (m.gun) { m.hand.remove(m.gun); m.gun = null; }
  if (!GUNS[w]) return;
  gunGeo[w] ||= mergeGeometries(GUNS[w]());
  m.gun = new THREE.Mesh(gunGeo[w], vmat()); m.hand.add(m.gun);
}
export const GUN_LEN = [0, 0.7, 0.2, 0.36, 0.72, 0.82, 1.05];

// ---------------------------------------------------------------- cars
const bodyOf = (K) => (K.body[0] === 't' ? TRAFFIC[K.body.slice(2)] : CARS.find((c) => c.id === K.body.slice(2)).body);
const lite = new Map(), paintMats = new Map();
let restMat = null, liteLight = null, charMat = null, lampR = null, lampB = null, lampOff = null, blobMat = null;
function paintMat(hex) {
  let m = paintMats.get(hex);
  if (!m) { m = carLookHi() ? new THREE.MeshStandardMaterial({ color: hex, vertexColors: true, metalness: 0.45, roughness: 0.36, envMap: carLookEnv(), envMapIntensity: 1.1 }) : new THREE.MeshLambertMaterial({ color: hex, vertexColors: true }); paintMats.set(hex, m); }
  return m;
}
function liteGeo(kind) {
  let g = lite.get(kind);
  if (!g) {
    const c = carGeometry(bodyOf(VEHICLES[kind]), { detail: false, bakeWheels: true });
    g = { paint: c.parts[PAINT], rest: mergeParts([c.parts[GLASS], c.parts[TRIM], c.parts[METAL]]), lights: mergeParts([c.head, c.tail]), roofH: c.roofH, hl: c.hl, hw: c.hw };
    lite.set(kind, g);
  }
  return g;
}
const paintHex = (kind, col) => (VEHICLES[kind].fixed !== undefined ? VEHICLES[kind].fixed : CAR_COLORS[col] ?? 0x8b9099);
function shared() {
  if (restMat) return;
  restMat = carLookHi() ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.3, envMap: carLookEnv(), envMapIntensity: 1.1 }) : new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0c1016 });
  liteLight = lightMaterial(carLookHi() ? 1.5 : 1); charMat = new THREE.MeshLambertMaterial({ color: 0x1a1512 });
  lampR = new THREE.MeshBasicMaterial({ color: 0xff2a2a }); lampB = new THREE.MeshBasicMaterial({ color: 0x2a6bff }); lampOff = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.8)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
}
const LAMP = new THREE.BoxGeometry(0.34, 0.12, 0.26), BLOB = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** One car on screen. It starts as a light model and becomes the detailed one (spinning, steering wheels) when a player drives it. */
export class CarView {
  constructor(kind, col) { shared(); this.kind = kind; this.col = col; this.g = new THREE.Group(); this.inner = new THREE.Group(); this.g.add(this.inner); this.detail = null; this.wreck = false; this.lamps = null; this.build(); }
  build() {
    const K = VEHICLES[this.kind], G = liteGeo(this.kind);
    this.paint = new THREE.Mesh(G.paint, paintMat(paintHex(this.kind, this.col)));
    this.rest = new THREE.Mesh(G.rest, restMat); this.lights = new THREE.Mesh(G.lights, liteLight);
    this.liteG = new THREE.Group(); this.liteG.add(this.paint, this.rest, this.lights);
    const blob = new THREE.Mesh(BLOB, blobMat); blob.scale.set(K.W + 0.8, 1, K.L + 1); blob.position.y = 0.03; this.liteG.add(blob);
    this.inner.add(this.liteG);
    for (const m of [this.paint, this.rest]) m.castShadow = true;
    if (this.kind === VK.cop || this.kind === VK.riot) {
      const y = G.roofH + (this.kind === VK.riot ? 0.1 : 0.12);
      this.lamps = [new THREE.Mesh(LAMP, lampOff), new THREE.Mesh(LAMP, lampOff)];
      this.lamps[0].position.set(0.3, y, this.kind === VK.riot ? 1 : -0.1); this.lamps[1].position.set(-0.3, y, this.kind === VK.riot ? 1 : -0.1);
      this.inner.add(...this.lamps);
    }
  }
  setColor(col) { if (col === this.col) return; this.col = col; const hex = paintHex(this.kind, col); if (!this.wreck) this.paint.material = paintMat(hex); if (this.detail) this.detail.userData.setPaint(hex); }
  setDetail(on) {
    if (!!this.detail === on || this.wreck) return;
    if (on) { const K = VEHICLES[this.kind]; this.detail = buildCar({ body: bodyOf(K), color: paintHex(this.kind, this.col) }, paintHex(this.kind, this.col)); this.detail.traverse((o) => { if (o.isMesh && o.material.color && !o.material.transparent) o.castShadow = true; }); this.inner.add(this.detail); this.liteG.visible = false; }
    else { this.inner.remove(this.detail); this.detail.userData.dispose(); this.detail = null; this.liteG.visible = true; }
  }
  setWreck() { if (this.wreck) return; this.setDetail(false); this.wreck = true; this.paint.material = charMat; this.rest.material = charMat; this.lights.visible = false; if (this.lamps) for (const l of this.lamps) l.material = lampOff; this.inner.rotation.z = 0.06; }
  /** siren: flash the roof lamps. t = time in seconds. */
  tick(dt, sp, steer, siren, brake, t) {
    if (this.detail) { this.detail.userData.spin(dt, sp, steer); this.detail.userData.setBrake(brake); }
    if (this.lamps && !this.wreck) { const a = siren && Math.floor(t * 5) % 2 === 0, b = siren && !a; this.lamps[0].material = a ? lampR : lampOff; this.lamps[1].material = b ? lampB : lampOff; }
  }
  dispose() { if (this.detail) this.detail.userData.dispose(); }
}

export function makeHeli() {
  const g = new THREE.Group(), dark = 0x1b2230;
  const hull = mergeGeometries([
    tint(at(new THREE.CapsuleGeometry(0.9, 1.9, 4, 12), 0, 0, 0.3, Math.PI / 2, 0, 0, 1, 1, 1.05), dark), box(0.26, 0.3, 3.4, dark, 0, 0.35, -2.9), box(0.08, 1.0, 0.5, dark, 0, 0.8, -4.4),
    box(0.1, 0.1, 2.8, 0x8b9099, 0.75, -1.15, 0.2), box(0.1, 0.1, 2.8, 0x8b9099, -0.75, -1.15, 0.2), box(0.07, 0.4, 0.07, 0x8b9099, 0.75, -0.95, 0.9), box(0.07, 0.4, 0.07, 0x8b9099, -0.75, -0.95, 0.9), box(0.07, 0.4, 0.07, 0x8b9099, 0.75, -0.95, -0.5), box(0.07, 0.4, 0.07, 0x8b9099, -0.75, -0.95, -0.5),
    tint(at(new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.05, 1.05, Math.PI / 2.4), 0x2a4a6a), box(0.2, 0.3, 0.2, 0x8b9099, 0, 1.0, 0.2), box(1.84, 0.12, 0.6, 0xf4f6fa, 0, -0.3, 0.2),
  ]);
  const body = new THREE.Mesh(hull, vmat()); body.castShadow = true; g.add(body);
  const rotor = new THREE.Mesh(mergeGeometries([box(7.4, 0.04, 0.24, 0x16181d), box(0.24, 0.04, 7.4, 0x16181d)]), vmat()); rotor.position.set(0, 1.2, 0.2); g.add(rotor);
  const tail = new THREE.Mesh(box(0.04, 1.3, 0.14, 0x16181d), vmat()); tail.position.set(0.14, 0.9, -4.4); g.add(tail);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(7, 36, 20, 1, true).translate(0, -18, 0), new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(0, -1, 0.6); g.add(beam);
  g.userData = { rotor, tail, beam };
  return g;
}

// ---------------------------------------------------------------- street props (one shape each, drawn many times)
export function propGeo(t) {
  if (t === 'lamp') return mergeGeometries([tint(at(new THREE.CylinderGeometry(0.07, 0.11, 6.4, 6), 0, 3.2, 0), 0x4a4f5a), box(0.09, 0.09, 1.9, 0x4a4f5a, 0, 6.35, 0.9), box(0.3, 0.1, 0.7, 0x2a2d33, 0, 6.28, 1.7)]);
  if (t === 'bulb') return box(0.22, 0.05, 0.56, 0xffffff, 0, 6.21, 1.7);
  if (t === 'palm') {
    const parts = [];
    for (let k = 0; k < 5; k++) parts.push(tint(at(new THREE.CylinderGeometry(0.16 - k * 0.012, 0.19 - k * 0.012, 1.7, 6), Math.sin(k * 0.5) * 0.22, 0.85 + k * 1.62, 0, 0, 0, -0.06 * k), 0x8a6a48));
    const top = [Math.sin(2.5) * 0.22 - 0.3, 8.2, 0];
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; parts.push(tint(at(new THREE.ConeGeometry(0.5, 3.4, 4), top[0] + Math.sin(a) * 1.35, top[1] - 0.35, top[2] + Math.cos(a) * 1.35, Math.PI / 2 + 0.42, a, 0, 1, 1, 0.16), k % 2 ? 0x3f8a3a : 0x4f9d42)); }
    parts.push(tint(at(new THREE.SphereGeometry(0.3, 6, 5), top[0], top[1], top[2]), 0x6a5236));
    return mergeGeometries(parts);
  }
  if (t === 'tree') return mergeGeometries([tint(at(new THREE.CylinderGeometry(0.16, 0.22, 2.6, 6), 0, 1.3, 0), 0x6a4a2e), tint(at(new THREE.IcosahedronGeometry(1.5, 0), 0, 3.6, 0), 0x3f8a3a), tint(at(new THREE.IcosahedronGeometry(1.1, 0), 0.8, 4.4, 0.3), 0x4f9d42), tint(at(new THREE.IcosahedronGeometry(1.0, 0), -0.7, 4.2, -0.4), 0x357a34)]);
  if (t === 'bench') return mergeGeometries([box(1.6, 0.07, 0.45, 0x8a6a48, 0, 0.45, 0), box(1.6, 0.4, 0.06, 0x8a6a48, 0, 0.75, -0.2), box(0.08, 0.45, 0.4, 0x3a3f4a, 0.7, 0.22, 0), box(0.08, 0.45, 0.4, 0x3a3f4a, -0.7, 0.22, 0)]);
  if (t === 'umbrella') return mergeGeometries([tint(at(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), 0, 1.1, 0), 0xdddddd), tint(at(new THREE.ConeGeometry(1.5, 0.5, 8), 0, 2.3, 0), 0xffffff)]);
  if (t === 'towel') return box(0.9, 0.03, 1.9, 0xffffff, 0, 0.03, 0);
  if (t === 'cont') { const parts = [box(2.44, 2.5, 12.1, 0xffffff, 0, 1.3, 0)]; for (let k = -5; k <= 5; k++) parts.push(box(2.52, 2.3, 0.12, 0xdddddd, 0, 1.3, k * 1.05)); return mergeGeometries(parts); }
  if (t === 'cash') return mergeGeometries([box(0.34, 0.1, 0.18, 0x3fae5a, 0, 0.05, 0), box(0.34, 0.1, 0.18, 0x37a052, 0.03, 0.15, 0.02), box(0.08, 0.21, 0.19, 0xf4f6fa, 0, 0.1, 0.01)]);
  return new THREE.BoxGeometry(1, 1, 1);
}
export const UMBRELLA_COLS = [0xe94f4f, 0x3aa5e0, 0xf2c14b, 0x4fbf7a, 0xf28ab2, 0xf4f6fa], CONT_COLS = [0xb84a32, 0x2f6aa8, 0x3f8a5a, 0xd9a02c, 0x8b9099, 0x6c3fb3];
