// The view from the driver's seat. The cabin (dash, dials, wheel, shifter, doors, roof) and the driver's arms are
// their own small scene in the car's own coordinates (+z forward, +x left, y up), drawn over the world after the
// depth buffer is cleared: they can sit centimetres from the camera, and the windows are simply where nothing is
// drawn. The world camera is placed at the driver's head (place); the cabin camera copies it every frame (update).
// Each car's cabin is built from its body shape (models.js) and its interior recipe (interiors.js).
import * as THREE from 'three';
import { bodyShape, carLookHi } from './models.js';
import { Geo, cabinMaterials, disposeMaterials, screenPlane, shade, mix } from './cabin-kit.js';
import { interiorOf } from './interiors.js';
import { drawCluster, drawScreen } from './gauges.js';
import { Driver, POSE, blendPose, handQuat } from './driver.js';
import { clamp, damp, smooth } from './util.js';
import { REDLINE, singleSpeed } from './physics.js';

const PI = Math.PI, GLASSC = 0x1a2433;
const CL_W = 512, CL_H = 232; // the cluster canvas
const GRIP_A = 1.45; // where the hands hold the rim (radians either side of the top)
const lum = (hex) => (((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11) / 255;

/** A second-order spring: follows a target with a little overshoot, so the head sways like it has weight. */
class Spring {
  constructor(k = 70, c = 11) { this.x = 0; this.v = 0; this.k = k; this.c = c; }
  step(target, dt) { const a = this.k * (target - this.x) - this.c * this.v; this.v += a * dt; this.x += this.v * dt; return this.x; }
}

export class Cockpit {
  constructor(hi) {
    this.hi = hi;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 14);
    this.camera.matrixAutoUpdate = false;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.5);
    this.dir = new THREE.DirectionalLight(0xffffff, 0.4);
    this.lamps = [0, 1].map(() => new THREE.PointLight(0xffc27a, 0, 46, 1.2));
    this.glow = new THREE.PointLight(0x3de0ff, 0, 1.4, 1.4);
    this.scene.add(this.hemi, this.dir, this.dir.target, ...this.lamps, this.glow);
    this.pending = null; this.cab = null; this.car = null;
    this.eye = new THREE.Vector3(0.36, 1.1, 0);
    // the head: springs for the sway (sideways, fore-aft) so it lags and settles
    this.sx = new Spring(60, 9); this.sz = new Spring(70, 10); this.kick = 0;
    this.wheelAng = 0; this.lastGear = -1; this.frame = 0;
    this.shiftT = -1; this.padT = -1; this.padSide = 1; this.leverFrom = [0, 1]; this.leverTo = [0, 1]; this.leverNow = [0, 1]; this.still = 0;
    this.pose = [POSE.grip.map((f) => f.slice()), POSE.grip.map((f) => f.slice())];
  }

  /** Which car to sit in. The cabin is only built when the view is first used. */
  setCar(spec, paint) { this.pending = { spec, paint }; }
  resize() { /* the cabin camera copies the world camera every frame */ }

  build() {
    const { spec, paint } = this.pending; this.pending = null;
    if (this.cab) {
      this.scene.remove(this.cab.group);
      this.cab.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map && o.userData.own) o.material.map.dispose(); if (o.userData.own) o.material.dispose(); } });
      disposeMaterials(this.cab.mats);
    }
    this.cab = buildCabin(spec, paint, this.hi);
    this.scene.add(this.cab.group);
    this.eye.copy(this.cab.eye);
    this.glow.position.set(this.cab.eye.x, this.cab.eye.y - 0.34, this.cab.eye.z + 0.22); this.glow.color.setHex(this.cab.R.glow);
    this.lastGear = -1; this.shiftT = -1; this.padT = -1; this.wheelAng = 0;
  }

  /**
   * Put the world camera at the driver's eyes. The head has weight: it is thrown outward in a turn, forward under
   * braking and back on the throttle, and the view tips and rolls with it.
   */
  place(camera, car, dt, sim, aLong) {
    if (this.pending) this.build();
    this.car = car;
    const lat = sim.steer * clamp(sim.v / 42, 0, 1) * (0.55 + clamp(sim.v / 90, 0, 0.6)); // + = turning right
    const lon = clamp(aLong / 13, -2.2, 1.4); // + = speeding up
    const gx = this.sx.step(lat, Math.min(dt, 0.033)), gz = this.sz.step(lon, Math.min(dt, 0.033));
    this.gx = gx; this.gz = gz;
    this.kick = damp(this.kick, 0, 9, dt);
    const buzz = Math.sin(performance.now() * 0.071) * 0.0009 * clamp(sim.v / 70, 0, 1.6) + Math.sin(performance.now() * 0.0329) * 0.0006 * clamp(sim.rpm / 7000, 0, 1);
    E.set(-0.14 + gz * 0.03 - this.kick * 0.02, PI - gx * 0.085, -gx * 0.045, 'YXZ');
    Q1.setFromEuler(E);
    V1.set(this.eye.x + gx * 0.032, this.eye.y - Math.abs(gz) * 0.006 + buzz, this.eye.z - gz * 0.034 + this.kick * 0.012);
    car.updateMatrixWorld(true);
    camera.position.copy(V1).applyMatrix4(car.matrixWorld);
    camera.quaternion.copy(car.quaternion).multiply(Q1);
  }

  /** Every frame the seat view is on: match the cameras, turn the wheel, move the hands, light the cabin, draw the dials. */
  update(dt, st) {
    if (this.pending) this.build();
    const { sim, world, camera, now } = st, cab = this.cab, R = cab.R, car = this.car;
    if (!car) return;
    this.frame++;
    // --- the cabin camera is the world camera, seen from the car
    camera.updateMatrixWorld(true); car.updateMatrixWorld(true);
    M1.copy(car.matrixWorld).invert();
    this.camera.matrix.multiplyMatrices(M1, camera.matrixWorld);
    this.camera.matrixWorld.copy(this.camera.matrix); this.camera.matrixWorldInverse.copy(this.camera.matrix).invert();
    this.camera.matrixWorldAutoUpdate = false;
    if (this.camera.fov !== camera.fov || this.camera.aspect !== camera.aspect) { this.camera.fov = camera.fov; this.camera.aspect = camera.aspect; this.camera.updateProjectionMatrix(); }

    // --- steering wheel
    const want = -sim.steer * 1.42 + Math.sin(now * 41) * 0.004 * clamp(sim.v / 80, 0, 1);
    this.wheelAng = damp(this.wheelAng, want, 16, dt);
    cab.spin.rotation.z = this.wheelAng;
    cab.spin.updateWorldMatrix(true, false);

    // --- gear changes: the lever, the paddles, and the hand that works them
    const ev1 = singleSpeed(st.spec);
    if (this.lastGear < 0) { this.lastGear = sim.gear; this.leverNow = gate(sim.gear); this.leverFrom = this.leverTo = this.leverNow; }
    if (sim.gear !== this.lastGear && !ev1) {
      const dir = sim.gear > this.lastGear ? 1 : -1;
      if (R.shift === 'stick' || (R.shift === 'tip' && sim.manual)) {
        this.leverFrom = this.leverNow.slice(); this.leverTo = R.shift === 'tip' ? [0, dir] : gate(sim.gear);
        this.shiftT = this.shiftT < 0 || this.shiftT > T_A + T_B ? 0 : Math.min(this.shiftT, T_A);
      } else if (R.shift === 'paddle') { this.padT = 0; this.padSide = dir > 0 ? 1 : 0; }
      this.kick = dir > 0 ? 1 : -0.6;
    }
    this.lastGear = sim.gear;
    let reach = 0; // 0 = right hand on the wheel, 1 = on the gear lever
    if (this.shiftT >= 0) {
      this.shiftT += dt;
      const t = this.shiftT;
      if (t < T_A) reach = smooth(0, T_A, t);
      else if (t < T_A + T_B) {
        reach = 1;
        const u = (t - T_A) / T_B, a = this.leverFrom, b = this.leverTo;
        if (R.shift === 'tip') this.leverNow = [0, b[1] * Math.sin(PI * u)];
        else if (a[0] === b[0]) this.leverNow = [a[0], a[1] + (b[1] - a[1]) * smooth(0, 1, u)];
        else this.leverNow = u < 0.38 ? [a[0], a[1] * (1 - u / 0.38)] : u < 0.62 ? [a[0] + (b[0] - a[0]) * ((u - 0.38) / 0.24), 0] : [b[0], b[1] * ((u - 0.62) / 0.38)];
      } else if (t < T_A + T_B + T_C) { reach = 1 - smooth(T_A + T_B, T_A + T_B + T_C, t); this.leverNow = R.shift === 'tip' ? [0, 0] : this.leverTo.slice(); }
      else { this.shiftT = -1; this.leverNow = R.shift === 'tip' ? [0, 0] : this.leverTo.slice(); }
    }
    if (cab.lever) { cab.lever.rotation.x = this.leverNow[1] * 0.19; cab.lever.rotation.z = this.leverNow[0] * 0.14; cab.lever.updateWorldMatrix(true, false); }
    let pull = 0;
    if (this.padT >= 0) { this.padT += dt; pull = Math.sin(PI * clamp((this.padT - 0.04) / 0.16, 0, 1)); if (this.padT > 0.32) this.padT = -1; }
    for (let i = 0; i < cab.paddles.length; i++) cab.paddles[i].rotation.y = (i === this.padSide ? pull : 0) * 0.2 * (i ? 1 : -1);

    // --- hands and arms
    this.still = sim.v < 0.4 ? this.still + dt : 0;
    for (let i = 0; i < 2; i++) {
      const th = (i ? 1 : -1) * GRIP_A, o = V1.set(Math.sin(th), Math.cos(th), 0), rim = cab.rimAt(th, V2);
      const cg = Math.cos(0.5), sg = Math.sin(0.5);
      BACK.set(o.x * cg, o.y * cg, sg); FING.set(o.x * sg, o.y * sg, -cg);
      WRIST.copy(rim).addScaledVector(BACK, 0.033).addScaledVector(FING, -0.078).applyMatrix4(cab.spin.matrixWorld);
      BACK.transformDirection(cab.spin.matrixWorld); FING.transformDirection(cab.spin.matrixWorld);
      handQuat(BACK, FING, Q1);
      let fingers = POSE.grip;
      if (i === 1 && reach > 0 && cab.lever) { // off to the gear lever and back, in an arc
        KNOB.set(0, cab.leverLen, 0).applyMatrix4(cab.lever.matrixWorld);
        BACK.set(0.12, 0.93, 0.3); FING.set(-0.32, -0.22, 0.92).normalize();
        handQuat(BACK, FING, Q2);
        V3.copy(KNOB).addScaledVector(BACK.normalize(), 0.05).addScaledVector(FING, -0.058);
        WRIST.lerp(V3, reach); WRIST.y += Math.sin(PI * reach) * 0.035;
        Q1.slerp(Q2, reach);
        fingers = blendPose(POSE.grip, POSE.knob, reach, this.pose[1]);
      } else if (this.padT >= 0 && i === this.padSide) {
        fingers = this.padT < 0.06 ? blendPose(POSE.grip, POSE.reach, this.padT / 0.06, this.pose[i]) : this.padT < 0.18 ? blendPose(POSE.reach, POSE.pull, (this.padT - 0.06) / 0.12, this.pose[i]) : blendPose(POSE.pull, POSE.grip, (this.padT - 0.18) / 0.14, this.pose[i]);
      } else if (i === 1 && sim.boosting) fingers = POSE.press;
      else if (i === 0 && this.still > 1.5) { // waiting: the left hand drums on the rim
        fingers = this.pose[0];
        for (let f = 0; f < 5; f++) { const k = f < 4 ? Math.max(0, Math.sin(now * 9 - f * 0.95)) : 0; for (let s = 0; s < 3; s++) fingers[f][s] = POSE.grip[f][s] + (POSE.lift[f][s] - POSE.grip[f][s]) * k; }
      }
      cab.driver.pose(i, cab.shoulders[i], WRIST, Q1, fingers, 1 - Math.exp(-28 * dt));
    }

    // --- shift lights on the wheel
    if (cab.leds.length) {
      const rf = sim.rpm / REDLINE, n = cab.leds.length, lit = ev1 ? 0 : Math.floor(clamp((rf - 0.6) / 0.36, 0, 1) * n + 0.001), flash = sim.limiter || rf > 0.985;
      cab.leds.forEach((m, k) => m.color.setHex(flash ? (Math.floor(now * 16) % 2 ? 0x4a90ff : 0x101622) : k < lit ? (k < n * 0.45 ? 0x3dff6a : k < n * 0.75 ? 0xffd23a : 0xff3020) : 0x16181d).multiplyScalar(this.hi && (flash || k < lit) ? 1.8 : 1));
    }

    // --- dials: redrawn every other frame
    if (this.frame % 2 === 0 && cab.cluster) {
      const mph = st.mph, k = mph ? 2.237 : 3.6, sp = st.spec;
      drawCluster(cab.cluster.g, CL_W, CL_H, R.cluster, {
        rpm: ev1 ? 900 + (sim.v / (sp.top / 3.6)) * 6200 : sim.rpm, red: REDLINE, gear: ev1 ? (sim.v < 0.5 ? 'P' : 'D') : sim.manual || sim.v >= 0.5 ? String(sim.gear + 1) : 'N',
        speed: sim.v * k, unit: mph ? 'MPH' : 'KM/H', max: sp.top * (mph ? 0.6214 : 1) * 1.06, nitro: sim.nitro, boost: sim.boosting, manual: sim.manual && !ev1, limiter: sim.limiter,
        t: now, sport: !!sp.tuned?.sport, gx: this.gx || 0, gz: this.gz || 0, load: sim.load,
      });
      cab.cluster.tex.needsUpdate = true;
    }

    // --- light: the sky and sun (or moon) as the world has them, street lamps sweeping over, the dials' own glow
    const m = world.map, wh = world.hemi, wd = world.dirLight;
    this.hemi.color.copy(wh.color); this.hemi.groundColor.copy(wh.groundColor); this.hemi.intensity = wh.intensity * 0.42 + 0.1;
    this.dir.color.copy(wd.color); this.dir.intensity = wd.intensity * 0.5;
    Q2.copy(car.quaternion).invert();
    this.dir.position.copy(wd.position).normalize().applyQuaternion(Q2).multiplyScalar(8);
    const tun = world.tunnelK > 0.5, has = tun || !!m.lamps;
    for (let i = 0; i < 2; i++) {
      const L = this.lamps[i];
      if (!has) { L.intensity = 0; continue; }
      const gap = tun ? 24 : m.lamps.gap, k = Math.ceil((sim.s - 1.5) / gap) + i, dz = k * gap - sim.s;
      const side = tun ? 0 : m.lamps.both ? (k % 2 === 0 ? -1 : 1) : 1;
      L.position.set(sim.d - side * (world.road.wall - 2.6), tun ? 5.6 : 11, dz);
      // a lamp lights the cabin through the windscreen as it comes, and the roof cuts it off as it passes overhead
      L.intensity = (this.hi ? 46 : 70) * smooth(-0.6, 3.5, dz) * (1 - smooth(24, 44, dz));
      L.color.setHex(tun ? (m.look === 'city' ? 0xdff0ff : 0xffc27a) : m.lamps.color);
    }
    this.glow.intensity = this.hi ? 0.035 : 0.06; // the dials' light on the hands: faint, it sits close to them
  }
}

const T_A = 0.15, T_B = 0.12, T_C = 0.2; // hand to the lever, the throw, hand back
/** Where the lever sits for a gear, as [left (-1) .. right (1), back (-1) .. forward (1)]: an H pattern. */
const gate = (g) => [[-1, -1, 0, 0, 1, 1][g] ?? 0, g % 2 === 0 ? 1 : -1];
const E = new THREE.Euler(), Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), M1 = new THREE.Matrix4();
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), BACK = new THREE.Vector3(), FING = new THREE.Vector3(), WRIST = new THREE.Vector3(), KNOB = new THREE.Vector3();

// ================================================================= building a cabin

function buildCabin(spec, paint, hi) {
  const R = interiorOf(spec.id), b = spec.body, sh = bodyShape(b), cab = b.cab, L = b.L, hl = L / 2, hw = b.W / 2;
  const mats = cabinMaterials(hi), group = new THREE.Group(), G = new Geo();
  const tZ = (t) => -hl + t * L, zT = (z) => clamp((z + hl) / L, cab.r0 + 0.012, cab.f0 - 0.004);
  const [trimSlot, trimCol] = R.trim, dark = shade(R.panel, -0.35);

  // ---- where the driver sits
  const eyeT = cab.f1 - Math.min(0.38, (cab.f1 - cab.r1) * L * 0.45) / L;
  const secE = sh.section(eyeT), belt = secE.pts[6][1];
  const ex = clamp(0.385 * hw, 0.24, secE.pts[7][0] - 0.2), ez = tZ(eyeT);
  const zb = tZ(cab.f0) - 0.015, yb = sh.section(cab.f0 - 0.004).pts[6][1]; // the windscreen base
  // Eye height: a third of a metre over the windscreen base, whatever the roof. The low cars have a tall hood line
  // at the screen and little glass above it, and an eye squeezed under their real roof sees only a slit. From the
  // seat the outside of the roof is never drawn, so the cabin's own roof is simply lifted to give the head room.
  const ey = Math.max(Math.min(cab.h - 0.17, belt + 0.36), yb + 0.33);
  const lift = Math.max(0, ey + 0.21 - cab.h);
  const eye = new THREE.Vector3(ex, ey, ez);
  const floorY = b.clear + 0.07, zRear = ez - 0.55;
  const xin = (z) => sh.section(zT(z)).pts[6][0] - 0.035, beltAt = (z) => sh.section(zT(z)).pts[6][1];
  // the dash runs back from the windscreen base to a brow in front of the driver
  let zd = ez + 0.6; if (zb - zd < 0.1) zd = zb - 0.1;
  const yd = clamp(ey - 0.33, yb - 0.06, yb + 0.26);
  let X = 0; for (let z = zd - 0.05; z <= zb; z += 0.1) X = Math.max(X, xin(z));
  X += 0.04;
  const rf1 = sh.section(cab.f1).pts, rx = rf1[7][0], yr = rf1[7][1] + lift;

  // ---- floor, back wall
  G.box(0, floorY - 0.02, (zRear + zb) / 2, hw * 2 + 0.1, 0.04, zb - zRear + 0.3, R.carpet, 'soft');
  G.box(0, (floorY + cab.h + lift) / 2, zRear - 0.02, hw * 2 + 0.1, cab.h + lift - floorY + 0.2, 0.04, shade(R.seat, -0.4), 'soft');

  // ---- doors: a rolled top, a card, an armrest, down to the floor
  for (const sx of [1, -1]) {
    const st = [];
    for (let z = zRear; z < zb + 0.11; z += 0.11) {
      const zz = Math.min(z, zb + 0.02), xb = xin(zz), y = beltAt(zz);
      st.push([[sx * (xb + 0.05), y + 0.004, zz], [sx * xb, y - 0.004, zz], [sx * (xb - 0.022), y - 0.055, zz], [sx * (xb - 0.036), y - 0.17, zz], [sx * (xb - 0.1), y - 0.2, zz], [sx * (xb - 0.105), y - 0.25, zz], [sx * (xb - 0.05), y - 0.29, zz], [sx * (xb - 0.045), floorY, zz]]);
    }
    const cols = [R.dash, R.dash, R.door, R.seat, R.seat, R.door, shade(R.door, -0.3)];
    G.loft(st, (i, j) => cols[j], 'soft', { loop: false, ctr: [sx * (hw + 2), belt, ez] });
    // handle, speaker, light strip
    const zh = ez + 0.3, xh = xin(zh), yh = beltAt(zh);
    if (R.extras.straps) G.rbox(sx * (xh - 0.045), yh - 0.12, zh, 0.012, 0.03, 0.16, 0.005, R.accent, 'soft');
    else G.rbox(sx * (xh - 0.042), yh - 0.1, zh, 0.016, 0.022, 0.11, 0.007, 0x6a6f7a, 'metal');
    G.at(sx * (xh - 0.05), yh - 0.36, ez + 0.42, 0, sx * PI / 2, 0, () => G.lathe([[0.07, 0], [0.07, 0.006], [0.062, 0.008], [0, 0.008]], 14, dark, 'trim'));
    G.rbox(sx * (xh - 0.103), yh - 0.193, ez + 0.2, 0.05, 0.012, 0.13, 0.005, PIANO, 'trim'); // window switches
    if (R.extras.strip) G.box(sx * (xh - 0.04), yh - 0.172, ez + 0.2, 0.004, 0.005, 0.5, R.glow, 'glow');
  }

  // ---- roof: lining (or tinted glass), side rails, header, visors, pillars
  const tR = Math.max(cab.r0 + 0.012, (zRear + hl) / L), glassRoof = b.roofCol === GLASSC;
  const roofSt = [], railL = [], railR = [];
  for (let i = 0; i <= 10; i++) {
    const t = tR + (cab.f1 - tR) * (i / 10), p = sh.section(t).pts, z = tZ(t);
    const y7 = p[7][1] + lift, y8 = p[8][1] + lift;
    roofSt.push([[-(p[7][0] - 0.01), y7 - 0.03, z], [0, y8 - 0.034, z], [p[7][0] - 0.01, y7 - 0.03, z]]);
    railL.push([p[7][0] - 0.02, y7 - 0.035, z]); railR.push([-(p[7][0] - 0.02), y7 - 0.035, z]);
  }
  const pillar = lum(R.liner) > 0.4 ? shade(R.liner, -0.12) : shade(R.liner, 0.04);
  const head = lum(R.liner) > 0.4 ? shade(R.liner, -0.5) : pillar; // header and visors: dark even under a pale lining, so they do not glare
  if (!glassRoof) G.loft(roofSt, R.liner, 'soft', { loop: false, ctr: [0, cab.h + lift + 3, ez] });
  else G.rbox(0, yr - 0.02, ez - 0.12, 2 * rx, 0.03, 0.07, 0.012, pillar, 'soft', 'x'); // one cross beam under the glass
  for (const rail of [railL, railR]) G.tube(rail, 0.032, 8, pillar, 'soft', { squash: [1.1, 0.7] });
  G.rbox(0, yr - 0.022, tZ(cab.f1) - 0.02, 2 * rx + 0.02, 0.04, 0.08, 0.016, head, 'soft', 'x');
  for (const sx of [1, -1]) {
    G.at(sx * Math.min(ex, rx - 0.2), yr - 0.05, tZ(cab.f1) - 0.125, 0.06, 0, 0, () => G.rbox(0, 0, 0, 0.3, 0.012, 0.12, 0.005, head, 'soft', 'x'));
    // A pillar: from the corner of the header down to the corner of the dash
    const top = [sx * (rx - 0.012), yr - 0.03, tZ(cab.f1)], bot = [sx * (xin(zb) + 0.02), yb + 0.005, zb + 0.01], path = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8, bow = Math.sin(u * PI) * 0.018; path.push([top[0] + (bot[0] - top[0]) * u + sx * bow * 0.4, top[1] + (bot[1] - top[1]) * u + bow, top[2] + (bot[2] - top[2]) * u]); }
    G.tube(path, (i, u) => 0.024 + u * 0.01, 8, pillar, 'soft', { squash: [1.3, 0.8] });
    // B pillar and the wall behind it
    const zB = cab.b != null ? Math.min(ez - 0.16, tZ(cab.b)) : ez - 0.26, xB = xin(zB), yB = beltAt(zB), t2 = sh.section(zT(zB)).pts[7], top2 = [t2[0], t2[1] + lift];
    G.tube([[sx * (xB + 0.01), yB - 0.02, zB], [sx * (top2[0] - 0.01), top2[1] - 0.03, zB]], 0.05, 8, pillar, 'soft', { squash: [0.6, 1.2] });
    G.quad([sx * (xB + 0.03), yB, zB - 0.03], [sx * (top2[0]), top2[1], zB - 0.03], [sx * (top2[0]), top2[1], zRear], [sx * (xB + 0.03), yB, zRear], shade(pillar, -0.3), [sx * (hw + 2), yB, zB], 'soft');
  }
  // rear-view mirror
  { const mz = tZ(cab.f1) + 0.07, my = yr - 0.07;
    G.rbox(0, my + 0.03, mz + 0.01, 0.02, 0.04, 0.02, 0.006, dark, 'trim');
    G.rbox(0, my, mz, 0.2, 0.052, 0.02, 0.012, dark, 'trim', 'x');
    G.quad([-0.092, my - 0.02, mz - 0.0105], [0.092, my - 0.02, mz - 0.0105], [0.092, my + 0.02, mz - 0.0105], [-0.092, my + 0.02, mz - 0.0105], 0x0c1018, [0, my, mz + 1], 'trim'); }

  // ---- the dash: one section from door to door
  const dashP = [[zb + 0.04, yb - 0.004], [zd + 0.09, yd + 0.004], [zd, yd], [zd - 0.012, yd - 0.022], [zd + 0.02, yd - 0.05], [zd + 0.036, yd - 0.18], [zd + 0.02, yd - 0.245], [zd + 0.07, yd - 0.3], [Math.min(zb, zd + 0.3), floorY + 0.22], [zb + 0.04, floorY]];
  const dashCols = [R.dash, R.dash, R.dash, R.panel, R.panel, R.panel, shade(R.panel, -0.2), dark, dark, dark];
  G.slab(dashP, -X, X, (i) => dashCols[i] ?? dark, 'soft');
  // a trim strip across the passenger side, and a line of light under the brow
  G.rbox(-(X + 0.19) / 2, yd - 0.115, zd + 0.024, X - 0.23, 0.036, 0.012, 0.004, trimCol, trimSlot, 'x');
  if (R.extras.strip) G.box(0, yd - 0.047, zd + 0.006, X * 2 - 0.06, 0.004, 0.004, R.glow, 'glow');

  // ---- dials: where they sit and what houses them
  const clusterAt = new THREE.Vector3(ex, yd + 0.068, zd + 0.045);
  let cluster = null;
  const addScreen = (w, h, pw, ph, x, y, z, yaw = 0, tilt = 0) => {
    const s = screenPlane(w, h, pw, ph, hi); s.mesh.position.set(x, y, z); s.mesh.rotation.set(-tilt, PI + yaw, 0, 'YXZ'); s.mesh.userData.own = true; group.add(s.mesh); return s;
  };
  const tiltC = Math.atan2(ey - clusterAt.y, clusterAt.z - ez) * 0.75;
  if (R.bin !== 'none') {
    cluster = addScreen(0.3, 0.136, CL_W, CL_H, clusterAt.x, clusterAt.y, clusterAt.z, 0, tiltC);
    if (R.bin === 'hood' || R.bin === 'twin') {
      const arches = R.bin === 'twin' ? [[ex - 0.092, 0.1], [ex + 0.092, 0.1]] : [[ex, 0.188]];
      for (const [cx, bw] of arches) hood(G, cx, yd - 0.005, zd - 0.03, zd + 0.2, bw, 0.152, R.dash, dark);
    } else { // a screen standing on the dash, with or without a little visor
      const wide = R.screen[0] === 'wide', x0 = wide ? -0.24 : ex - 0.165, x1 = ex + 0.165;
      G.at((x0 + x1) / 2, clusterAt.y, clusterAt.z + 0.014, tiltC, 0, 0, () => G.rbox(0, 0, 0, x1 - x0, 0.158, 0.02, 0.012, PIANO, 'trim', 'x'));
      G.box((x0 + x1) / 2, yd + 0.01, clusterAt.z + 0.03, (x1 - x0) * 0.5, 0.05, 0.03, dark, 'soft');
      if (R.bin === 'flat') G.rbox(ex, yd + 0.146, clusterAt.z - 0.005, 0.37, 0.012, 0.08, 0.005, R.dash, 'soft', 'x');
    }
  }

  // ---- the centre screen
  const [scrType, scrShow] = R.screen, scrSt = { glow: R.glow, acc: R.cluster.acc ?? 0xff3b30 };
  let screenTop = yd; // how high the middle of the dash is built up (the vents go under it)
  const stat = (w, h, pw, ph, x, y, z, yaw, tilt, kind) => { const s = addScreen(w, h, pw, ph, x, y, z, yaw, tilt); drawScreen(s.g, pw, ph, kind, scrSt); s.tex.needsUpdate = true; return s; };
  if (scrType === 'tablet') {
    G.at(0, yd + 0.088, zd + 0.075, 0.1, -0.16, 0, () => G.rbox(0, 0, 0, 0.275, 0.168, 0.014, 0.01, PIANO, 'trim', 'x'));
    G.box(0, yd + 0.005, zd + 0.09, 0.09, 0.03, 0.03, dark, 'soft');
    stat(0.255, 0.148, 320, 186, 0.0013, yd + 0.088, zd + 0.0672, -0.16, 0.1, scrShow); screenTop = yd + 0.17;
  } else if (scrType === 'inset') {
    G.rbox(0, yd - 0.105, zd + 0.03, 0.24, 0.135, 0.012, 0.008, PIANO, 'trim', 'x');
    stat(0.21, 0.108, 320, 164, 0, yd - 0.1, zd + 0.021, -0.1, -0.08, scrShow);
    for (const x of [-0.085, 0.085]) G.at(x, yd - 0.19, zd + 0.03, 0, PI, 0, () => G.lathe([[0.015, 0], [0.015, 0.014], [0.011, 0.016], [0, 0.016]], 12, 0xc8ccd4, 'metal'));
  } else if (scrType === 'portrait') {
    G.at(0, yd - 0.115, zd + 0.0, 0.42, -0.08, 0, () => G.rbox(0, 0, 0, 0.19, 0.29, 0.014, 0.012, PIANO, 'trim', 'x'));
    stat(0.165, 0.26, 200, 316, 0.0006, yd - 0.1122, zd - 0.0064, -0.08, 0.42, scrShow);
  } else if (scrType === 'wide') {
    stat(0.27, 0.136, 320, 162, -0.08, clusterAt.y, clusterAt.z, -0.1, tiltC, scrShow); screenTop = yd + 0.14;
  } else if (scrType === 'radio') {
    G.rbox(0, yd - 0.11, zd + 0.03, 0.2, 0.06, 0.012, 0.006, PIANO, 'trim', 'x');
    stat(0.12, 0.034, 256, 72, 0, yd - 0.105, zd + 0.022, 0, -0.08, 'radio');
    for (const x of [-0.08, 0.08]) G.at(x, yd - 0.11, zd + 0.03, 0, PI, 0, () => G.lathe([[0.012, 0], [0.012, 0.014], [0, 0.014]], 10, 0x8a8f99, 'metal'));
    for (let i = 0; i < 3; i++) G.at(-0.06 + i * 0.06, yd - 0.19, zd + 0.03, 0, PI, 0, () => G.lathe([[0.016, 0], [0.016, 0.012], [0.012, 0.014], [0, 0.014]], 12, 0x2a2d33, 'trim')); // heater knobs
  } else if (scrType === 'big') { // one big screen and nothing else: it shows the speed too
    G.at(0, yd + 0.03, zd - 0.03, 0.06, -0.05, 0, () => G.rbox(0, 0, 0, 0.41, 0.2, 0.014, 0.012, PIANO, 'trim', 'x'));
    G.box(0, yd - 0.05, zd + 0.0, 0.06, 0.1, 0.03, dark, 'soft');
    cluster = addScreen(0.385, 0.175, CL_W, CL_H, 0.0004, yd + 0.0304, zd - 0.0375, -0.05, 0.06);
  }

  // ---- vents
  const [ventT, ventN] = R.vents, yv = yd - 0.115, zv = zd + 0.026;
  const vxs = [X - 0.085, -(X - 0.085)];
  if (ventT === 'slim') { G.box(0, yd - 0.062, zd + 0.012, X * 2 - 0.1, 0.012, 0.01, 0x08090b, 'trim'); G.box(0, yd - 0.071, zd + 0.01, X * 2 - 0.1, 0.003, 0.012, 0xc8ccd4, 'metal'); }
  else {
    const mid = scrType === 'inset' || scrType === 'radio' ? [[-0.17, yv], [0.17, yv]] : scrType === 'portrait' ? [[-0.15, yv + 0.03], [0.15, yv + 0.03]] : [[-0.07, yv], [0.07, yv]];
    const list = [...vxs.map((x) => [x, yv]), ...(ventN >= 4 ? [[-0.2, yv], [-0.07, yv], [0.07, yv], [0.2, yv]] : ventN === 3 ? [[-0.13, yv], [0, yv], [0.13, yv]] : mid)];
    for (const [x, y] of list) vent(G, ventT, x, y, zv, R, dark);
  }

  // ---- things on the dash top
  if (R.extras.clock === 'oval') { G.at(0, yd + 0.03, zd + 0.11, 0.25, 0, 0, () => { G.rbox(0, 0, 0, 0.082, 0.058, 0.022, 0.026, 0xc8ccd4, 'metal'); G.rbox(0, 0, -0.012, 0.066, 0.044, 0.004, 0.02, 0x0f1c38, 'trim'); G.box(0, 0.007, -0.015, 0.003, 0.016, 0.002, 0xf1f1ee, 'glow'); G.box(0.006, 0, -0.015, 0.014, 0.003, 0.002, 0xf1f1ee, 'glow'); }); }
  if (R.extras.clock === 'chrono') { G.at(0, yd + 0.035, zd + 0.1, -0.2, PI, 0, () => { G.lathe([[0.04, -0.03], [0.045, 0], [0.043, 0.012], [0.036, 0.014], [0, 0.014]], 18, R.dash, 'soft'); G.lathe([[0.035, 0.0145], [0, 0.0145]], 18, 0xe8e6e0, 'trim'); G.box(0, 0.014, 0.016, 0.003, 0.028, 0.002, 0xd01a1a, 'glow'); }); }
  for (let i = 0; i < (R.extras.aux || 0); i++) G.at(-0.11 + i * 0.085 - (R.extras.clock ? 0.12 : 0), yd + 0.03, zd + 0.1, -0.2, PI - 0.25, 0, () => { G.lathe([[0.03, -0.04], [0.036, 0], [0.034, 0.01], [0.028, 0.012], [0, 0.012]], 14, R.dash, 'soft'); G.lathe([[0.027, 0.0125], [0, 0.0125]], 14, 0x0b0d12, 'trim'); G.at(0, 0, 0.014, 0, 0, 0.6 + i * 0.5, () => G.box(0, 0.011, 0, 0.003, 0.022, 0.002, R.cluster.acc ?? 0xff3b30, 'glow')); });
  if (R.extras.grab) { const gx0 = -X + 0.1, gx1 = -0.22; G.tube([[gx0, yd - 0.1, zd + 0.01], [gx0, yd - 0.1, zd - 0.035], [gx1, yd - 0.1, zd - 0.035], [gx1, yd - 0.1, zd + 0.01]], 0.013, 8, 0xc8ccd4, 'metal'); }
  if (R.extras.locks) for (let i = 0; i < 3; i++) G.at(-0.045 + i * 0.045, yd - 0.2, zd + 0.03, 0, PI, 0, () => { G.lathe([[0.017, 0], [0.017, 0.012], [0.013, 0.014], [0, 0.014]], 14, 0xc8ccd4, 'metal'); G.lathe([[0.008, 0.0145], [0, 0.0145]], 10, 0xd02020, 'glow'); });

  // ---- steering: the column and stalks stay still, the wheel turns
  const rake = R.fam === 'superc' || R.fam === 'track' ? 0.3 : R.fam === 'suv' ? 0.46 : 0.38;
  const wc = new THREE.Vector3(ex, yd + 0.03, ez + 0.46);
  const pivot = new THREE.Group(); pivot.position.copy(wc);
  pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, Math.cos(rake), Math.sin(rake)), new THREE.Vector3(0, Math.sin(rake), -Math.cos(rake))));
  pivot.updateMatrix();
  G.in(pivot.matrix, () => {
    G.lathe([[0.04, -0.03], [0.052, -0.1], [0.058, -0.34], [0, -0.34]], 12, R.panel, 'soft');
    for (const s of [1, -1]) { G.tube([[s * 0.045, 0.004, -0.085], [s * 0.15, 0.012, -0.07]], 0.0075, 6, dark, 'trim'); G.rbox(s * 0.16, 0.013, -0.068, 0.03, 0.02, 0.02, 0.006, dark, 'trim'); }
  });
  const wheel = buildWheel(R, mats, trimSlot, trimCol, dark, hi);
  pivot.add(wheel.spin);
  for (const p of wheel.fixed) pivot.add(p);
  group.add(pivot);

  // ---- centre console, shifter, switches
  const c = R.console, cw = c.type === 'spine' ? 0.07 : 0.13;
  const ch = ey - (c.type === 'flat' ? 0.64 : c.high || c.type === 'bridge' || c.type === 'spine' ? 0.5 : 0.56);
  const zs = Math.min(ez + 0.4, zd - 0.14); // where the shifter stands
  const z1 = zs + 0.1, front = c.type === 'bridge' ? yd - 0.12 : c.type === 'flat' ? ch + 0.02 : yd - 0.22;
  const topY = (z) => (z <= z1 ? ch : ch + (front - ch) * ((z - z1) / (zd + 0.04 - z1)));
  G.slab([[zRear, floorY], [zRear, ch], [z1, ch], [zd + 0.04, front], [zd + 0.06, floorY]], -cw, cw, (i) => (i === 1 ? R.seat : i === 2 ? R.panel : shade(R.panel, -0.15)), 'soft');
  G.rbox(0, ch + 0.003, (z1 + ez) / 2 + 0.06, cw * 2 - 0.03, 0.008, z1 - ez - 0.04, 0.003, trimCol, trimSlot);
  G.rbox(0, ch + 0.025, ez - 0.2, cw * 2 - 0.01, 0.05, 0.34, 0.02, R.seat, 'soft'); // armrest
  if (c.type !== 'spine' && c.type !== 'flat') for (const x of [-0.045, 0.045]) G.at(x, ch + 0.004, ez + 0.08, -PI / 2, 0, 0, () => G.lathe([[0.038, 0], [0.038, 0.006], [0.033, 0.006], [0.033, -0.02], [0, -0.02]], 14, 0x08090b, 'trim'));
  if (c.type === 'wall') { // a divider between the driver and the passenger, switches along its top
    const wx = -cw + 0.01;
    G.slab([[ez + 0.02, ch], [zd + 0.04, yd - 0.06], [zd + 0.05, ch]], wx - 0.02, wx + 0.02, R.panel, 'soft');
    const n = c.buttons || 0;
    for (let i = 0; i < n; i++) { const u = (i + 1) / (n + 1), z = ez + 0.02 + (zd + 0.02 - ez) * u, y = ch + (yd - 0.06 - ch) * ((z - ez - 0.02) / (zd + 0.02 - ez)) + 0.006; G.rbox(wx + 0.006, y, z, 0.03, 0.006, Math.min(0.02, (zd - ez) / (n + 1) - 0.004), 0.002, PIANO, 'trim'); G.box(wx + 0.006, y + 0.004, z, 0.012, 0.002, 0.004, i % 3 ? R.glow : 0xff5a30, 'glow'); }
  } else {
    const n = c.buttons || 0, zbn = Math.min(zd - 0.03, z1 + 0.06);
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * Math.min(0.03, (cw * 2 - 0.04) / n); G.rbox(x, topY(zbn) + 0.005, zbn, 0.02, 0.008, 0.016, 0.003, PIANO, 'trim'); G.box(x, topY(zbn) + 0.0095, zbn, 0.01, 0.002, 0.004, i === 0 ? 0xff5a30 : R.glow, 'glow'); }
  }
  for (let i = 0; i < (c.knobs || 0); i++) {
    const n = c.knobs, per = n > 4 ? 4 : n, row = Math.floor(i / per), x = ((i % per) - (Math.min(n, per) - 1) / 2) * 0.042, z = zs - 0.11 - row * 0.05;
    G.at(x, topY(z) + 0.004, z, -PI / 2, 0, 0, () => { G.lathe([[0.017, 0], [0.017, 0.016], [0.014, 0.019], [0, 0.019]], 14, 0xc8ccd4, 'metal'); G.lathe([[0.019, 0], [0.019, 0.003], [0.017, 0.003]], 14, R.glow, 'glow'); });
  }
  if (c.start) {
    const z = Math.min(zd - 0.03, z1 + 0.11), x = c.type === 'spine' ? 0 : 0.07;
    if (c.start === 'flip') G.at(0, topY(z) + 0.012, z, -0.5, 0, 0, () => { G.rbox(0, 0, 0, 0.04, 0.014, 0.05, 0.005, 0xd01a1a, 'trim'); G.box(0, -0.008, 0.01, 0.02, 0.003, 0.02, 0xff3020, 'glow'); });
    else G.at(x, topY(z) + 0.004, z, -PI / 2, 0, 0, () => { G.lathe([[0.017, 0], [0.017, 0.006], [0.013, 0.008]], 14, 0xc8ccd4, 'metal'); G.lathe([[0.013, 0.008], [0, 0.009]], 14, 0xff3020, 'glow'); });
  }
  if (c.hb) { G.tube([[-0.075, ch + 0.01, ez + 0.02], [-0.075, ch + 0.085, ez + 0.19]], 0.009, 6, 0x8a8f99, 'metal'); G.at(-0.075, ch + 0.07, ez + 0.155, -0.42, 0, 0, () => G.rbox(0, 0, 0.03, 0.03, 0.03, 0.1, 0.012, 0x15161a, 'soft')); }
  if (R.extras.cline) { const p = []; for (let i = 0; i <= 12; i++) { const a = -0.5 + (i / 12) * 2.6; p.push([-cw - 0.03, ch + 0.2 + Math.sin(a) * 0.26, ez - 0.1 + Math.cos(a) * 0.3]); } G.tube(p, 0.006, 6, R.glow, 'glow'); }

  // the shifter: a lever that moves, or (paddle cars) a little row of drive buttons
  let lever = null, leverLen = 0;
  const pv = [0.005, topY(zs) + 0.004, zs];
  if (R.shift === 'stick' || R.shift === 'tip') {
    const sft = buildShifter(R, mats);
    lever = sft.group; leverLen = sft.len; lever.position.set(...pv); group.add(lever);
    if (R.knob === 'gate') { // an open metal gate
      G.rbox(pv[0], pv[1] + 0.006, pv[2], 0.1, 0.006, 0.1, 0.004, 0xc8ccd4, 'metal');
      for (const x of [-0.026, 0, 0.026]) G.box(pv[0] + x, pv[1] + 0.0095, pv[2], 0.008, 0.002, 0.07, 0x050506, 'trim');
      G.box(pv[0], pv[1] + 0.0095, pv[2], 0.06, 0.002, 0.008, 0x050506, 'trim');
    } else if (R.shift === 'tip') { G.rbox(pv[0], pv[1] + 0.003, pv[2], 0.06, 0.006, 0.13, 0.004, PIANO, 'trim'); for (let i = 0; i < 4; i++) G.box(pv[0] + 0.04, pv[1] + 0.004, pv[2] + 0.04 - i * 0.027, 0.008, 0.002, 0.008, i === 3 ? 0xff5a30 : 0xf1f1ee, 'glow'); }
  } else if (R.shift === 'paddle') {
    for (let i = 0; i < 3; i++) { G.rbox(pv[0] + (i - 1) * 0.036, pv[1] + 0.004, pv[2], 0.028, 0.01, 0.028, 0.006, PIANO, 'trim'); G.box(pv[0] + (i - 1) * 0.036, pv[1] + 0.01, pv[2], 0.012, 0.002, 0.012, i === 2 ? R.glow : 0xf1f1ee, 'glow'); }
  }

  // ---- the other seat
  { const sx = -ex, sy = floorY + 0.16;
    G.rbox(sx, sy, ez + 0.02, 0.46, 0.13, 0.5, 0.05, R.seat, 'soft');
    G.at(sx, sy + 0.37, ez - 0.27, -0.22, 0, 0, () => { G.rbox(0, 0, 0, 0.46, 0.66, 0.13, 0.05, R.seat, 'soft'); G.rbox(0, 0.02, 0.07, 0.24, 0.5, 0.02, 0.01, shade(R.seat, -0.25), 'soft'); G.rbox(0, 0.4, 0.01, 0.24, 0.17, 0.1, 0.04, R.seat, 'soft'); G.box(0, 0.1, 0.082, 0.012, 0.36, 0.004, R.accent, 'soft'); });
  }

  // ---- roll cage
  if (R.extras.cage) {
    const cc = lum(paint) < 0.12 ? 0xc8ccd4 : paint, r = 0.021;
    for (const sx of [1, -1]) {
      const a = [sx * (X - 0.1), yd + 0.02, zd + 0.24], t = [sx * (rx - 0.075), yr - 0.07, tZ(cab.f1) - 0.02], e = [sx * (rx - 0.075), yr - 0.075, zRear];
      G.tube([a, [(a[0] + t[0]) / 2, (a[1] + t[1]) / 2 + 0.02, (a[2] + t[2]) / 2], t, e], r, 8, cc, 'trim');
      const zq = zd + 0.12, x0 = xin(zq) - 0.075, zr = ez - 0.3;
      G.tube([[sx * x0, beltAt(zq) - 0.03, zq], [sx * (xin(zr) - 0.075), floorY + 0.14, zr]], r, 8, cc, 'trim');
      G.tube([[sx * x0, floorY + 0.2, zq], [sx * (xin(zr) - 0.075), beltAt(zr) - 0.04, zr]], r, 8, cc, 'trim');
    }
    G.tube([[rx - 0.075, yr - 0.07, tZ(cab.f1) - 0.02], [-(rx - 0.075), yr - 0.07, tZ(cab.f1) - 0.02]], r, 8, cc, 'trim');
  }

  for (const m of G.meshes(mats)) group.add(m);
  // tinted glass overhead
  if (glassRoof) {
    const pos = [];
    for (let i = 0; i < roofSt.length - 1; i++) { const A = roofSt[i], B = roofSt[i + 1]; for (const [p, q, r2] of [[A[0], A[2], B[2]], [A[0], B[2], B[0]]]) pos.push(p[0], p[1] + 0.02, p[2], q[0], q[1] + 0.02, q[2], r2[0], r2[1] + 0.02, r2[2]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const tint = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x06090f, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    tint.userData.own = true; tint.frustumCulled = false; group.add(tint);
  }

  // ---- the driver: gloves the colour of the car, a suit to go with it
  const pale = lum(paint) > 0.6, nearBlack = lum(paint) < 0.1;
  const look = { glove: R.glove ?? (nearBlack ? 0x1c1d22 : paint), accent: nearBlack ? R.accent : pale ? 0x15161a : shade(paint, 0.25), palm: 0x18181b, suit: R.suit ?? (pale ? 0x1c1d22 : 0xb4b7be) };
  if (R.glove) look.accent = R.suit ?? look.accent;
  look.stripe = R.glove ?? (nearBlack ? R.accent : paint); // the stripes round the sleeves
  const driver = new Driver(mats, look);
  group.add(driver.group);
  const shoulders = [new THREE.Vector3(ex + 0.19, ey - 0.2, ez - 0.07), new THREE.Vector3(ex - 0.19, ey - 0.2, ez - 0.07)];

  group.traverse((o) => { o.frustumCulled = false; });
  return { group, mats, R, eye, clusterAt, cluster, spin: wheel.spin, rimAt: wheel.rimAt, leds: wheel.leds, paddles: wheel.paddles, lever, leverLen, driver, shoulders };
}

const PIANO = 0x0b0b0d;

/** The cowl over the dials: an arch that falls away towards the windscreen, dark underneath. */
function hood(G, cx, y0, zf, zb, bw, bh, col, inner) {
  const N = 14, zs = [zf, zf + 0.035, (zf + zb) / 2, zb], hs = [bh, bh, bh * 0.74, bh * 0.1], ws = [bw, bw, bw * 0.97, bw * 0.9];
  const arc = (k, inset) => Array.from({ length: N + 1 }, (_, i) => { const a = PI * (i / N); return [cx + Math.cos(a) * (ws[k] - inset), y0 + Math.sin(a) * Math.max(0.004, hs[k] - inset), zs[k]]; });
  const outer = zs.map((_, k) => arc(k, 0)), under = [0, 1, 2].map((k) => arc(k, 0.012));
  const axis = (i) => [cx, y0, (zs[i] + zs[i + 1]) / 2];
  G.loft(outer, col, 'soft', { loop: false, ctr: axis });
  G.loft(under, inner, 'soft', { loop: false, ctr: axis, flip: true });
  G.loft([outer[0], under[0]], col, 'soft', { loop: false, ctr: [cx, y0 + bh / 2, zf + 0.2] });
  // closed off behind the dials
  const back = arc(2, 0.006), c = [cx, y0, zs[2]];
  for (let i = 0; i < N; i++) G.quad(c, back[i], back[i + 1], c, inner, [cx, y0, zs[2] + 1], 'soft');
}

/** One air vent on the dash face (it looks back at the cabin, towards -z). */
function vent(G, type, x, y, z, R, dark) {
  if (type === 'rect') {
    G.rbox(x, y, z, 0.11, 0.05, 0.012, 0.006, 0x08090b, 'trim', 'x');
    for (let i = -1; i <= 1; i++) G.box(x, y + i * 0.013, z - 0.005, 0.098, 0.004, 0.008, dark, 'trim');
    G.box(x, y, z - 0.008, 0.008, 0.02, 0.006, 0xc8ccd4, 'metal');
    return;
  }
  const n = type === 'hex' ? 6 : 18, r = type === 'hex' ? 0.042 : 0.036;
  G.at(x, y, z, 0, PI, type === 'hex' ? PI / 6 : 0, () => {
    G.lathe([[r, -0.004], [r, 0.012], [r * 0.86, 0.014], [r * 0.82, 0.004]], n, type === 'hex' ? dark : 0xc8ccd4, type === 'hex' ? 'trim' : 'metal');
    G.lathe([[r * 0.82, 0.003], [0, 0.003]], n, 0x060708, 'trim');
    if (type === 'turbine') { G.lathe([[r * 0.8, 0.006], [r * 0.8, 0.009], [r * 0.74, 0.009]], n, R.glow, 'glow'); for (let i = 0; i < 6; i++) G.at(0, 0, 0.006, 0, 0, (i / 6) * PI * 2, () => G.box(0, r * 0.42, 0, 0.005, r * 0.6, 0.003, 0x8a8f99, 'metal')); }
    else for (let i = -1; i <= 1; i++) G.box(0, i * r * 0.42, 0.007, r * 1.5 * (i ? 0.78 : 1), 0.004, 0.004, dark, 'trim');
    G.lathe([[0.008, 0.008], [0.008, 0.014], [0, 0.014]], 8, 0xc8ccd4, 'metal');
  });
}

/**
 * The steering wheel, in its own frame: x to the driver's right, y up the wheel, z towards the driver.
 * Returns { spin (the part that turns), fixed (column paddles), rimAt(angle, out), leds, paddles }.
 */
function buildWheel(R, mats, trimSlot, trimCol, dark, hi) {
  const w = R.wheel, W = new Geo(), rr = w.r, tr = w.tube, p = w.sq || 2, yoke = !!w.yoke;
  const out = (th) => {
    const s = Math.sin(th), c = Math.cos(th), k = (Math.abs(s) ** p + Math.abs(c) ** p) ** (-1 / p);
    let x = rr * s * k, y = rr * c * k * (yoke ? 0.72 : 1);
    if (w.flat && y < -rr * w.flat) y = -rr * w.flat;
    return [x, y, 0];
  };
  const rimCol = w.rimCol ?? 0x17181c, grip = shade(rimCol, lum(rimCol) > 0.5 ? -0.08 : 0.06);
  const fancy = w.rim === 'carbon' ? ['carbon', 0xffffff] : w.rim === 'wood' ? ['trim', 0x5a3518] : w.rim === 'metal' ? ['metal', 0xc8ccd4] : ['soft', rimCol];
  const D = PI / 180;
  const arcs = yoke ? [[58, 182, 'soft', grip, 1.1], [-182, -58, 'soft', grip, 1.1]]
    : [[5, 50, ...fancy, 1], [-50, -5, ...fancy, 1], [50, 128, 'soft', grip, 1.1], [-128, -50, 'soft', grip, 1.1], [128, 232, ...fancy, 1], [-5, 5, 'soft', w.marker ?? (fancy[0] === 'soft' ? rimCol : 0x17181c), w.marker ? 1.03 : 1]];
  for (const [a0, a1, slot, hex, thick] of arcs) {
    const pts = []; const n = Math.max(2, Math.ceil((a1 - a0) / 4));
    for (let i = 0; i <= n; i++) pts.push(out((a0 + ((a1 - a0) * i) / n) * D));
    W.tube(pts, tr * thick, 10, hex, slot, { caps: yoke, up: [0, 0, 1] });
  }
  // spokes and hub
  const rh = w.hub === 'trap' ? 0.075 : w.hub === 'sq' ? 0.06 : 0.058, yB = out(PI)[1];
  const face = w.metalSpokes ? ['metal', 0xc8ccd4] : [trimSlot, trimCol];
  for (const s of [1, -1]) {
    const x0 = rh - 0.01, x1 = Math.abs(out(s * 96 * D)[0]) - tr * 0.4, sy = w.spokes === 2 ? 0.066 : 0.05;
    W.rbox(s * (x0 + x1) / 2, -0.014, -0.008, x1 - x0, sy * 1.15, 0.02, 0.008, R.panel, 'soft', 'x');
    W.rbox(s * (x0 + x1) / 2 + s * 0.006, -0.014, -0.0025, (x1 - x0) * 0.72, sy * 0.5, 0.004, 0.0015, face[1], face[0], 'x');
  }
  if (w.spokes !== 2) { const y0 = -rh + 0.012, y1 = yB + tr * 0.4; W.rbox(0, (y0 + y1) / 2, -0.012, 0.052, y0 - y1, 0.017, 0.007, R.panel, 'soft'); W.rbox(0, (y0 + y1) / 2 - 0.004, -0.0025, 0.03, (y0 - y1) * 0.6, 0.004, 0.0015, face[1], face[0]); }
  if (w.hub === 'trap') W.rbox(0, -0.012, -0.004, 0.155, 0.105, 0.036, 0.03, R.panel, 'soft');
  else if (w.hub === 'sq') W.rbox(0, -0.01, -0.004, 0.122, 0.118, 0.036, 0.04, R.panel, 'soft');
  else W.at(0, -0.008, -0.012, 0, 0, w.hub === 'hex' ? PI / 6 : 0, () => W.lathe([[0, 0.03], [rh * 0.72, 0.03], [rh * 0.96, 0.02], [rh, 0.004], [rh * 0.9, -0.03], [0, -0.03]], w.hub === 'hex' ? 6 : w.hub === 'tri' ? 3 : 22, R.panel, 'soft'));
  // the badge in the middle: a plain ring, or the Claude Car's spark
  if (w.emblem === 'spark') for (let i = 0; i < 12; i++) W.at(0, -0.008, 0.019, 0, 0, (i / 12) * PI * 2 + 0.26, () => W.box(0, i % 2 ? 0.012 : 0.015, 0, 0.004, i % 2 ? 0.012 : 0.018, 0.002, R.accent, 'glow'));
  else W.at(0, -0.008, 0.016, 0, 0, 0, () => { W.lathe([[0.018, 0], [0.018, 0.005], [0.013, 0.005], [0.013, 0.003]], 16, 0xc8ccd4, 'metal'); W.lathe([[0.013, 0.003], [0, 0.003]], 16, R.accent, 'trim'); });
  for (const [x, y, hex, slot, r] of w.buttons || []) W.at(x, y - 0.014, -0.002, 0, 0, 0, () => { W.lathe([[r * 1.25, 0], [r * 1.25, 0.004], [r, 0.004]], 12, 0x2a2d33, 'trim'); W.lathe([[r, 0], [r, 0.007], [r * 0.8, 0.009], [0, 0.009]], 12, hex, slot); });
  const spin = new THREE.Group();
  for (const m of W.meshes(mats)) spin.add(m);
  // shift lights along the top of the rim
  const leds = [];
  if (w.leds) for (let i = 0; i < 7; i++) {
    const th = (i - 3) * 6.6 * D, o = out(th), mat = new THREE.MeshBasicMaterial({ color: 0x16181d });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.006, 0.004), mat); m.userData.own = true;
    m.position.set(o[0] * 0.87, o[1] - tr - 0.011 - Math.abs(i - 3) * 0.0006, 0.004); m.rotation.z = -th; spin.add(m); leds.push(mat);
  }
  // paddles: behind the spokes, turning with the wheel, or long blades fixed to the column
  const paddles = [], fixed = [];
  if (w.paddles) {
    const col = w.paddles === 'column';
    for (const s of [-1, 1]) { // left = down, right = up
      const P = new Geo(), g = new THREE.Group();
      if (col) { P.rbox(s * 0.02, 0.03, 0, 0.036, 0.17, 0.005, 0.002, trimSlot === 'carbon' ? 0xffffff : 0xc8ccd4, trimSlot === 'carbon' ? 'carbon' : 'metal'); g.position.set(s * 0.112, 0.0, -0.05); }
      else { P.rbox(s * 0.03, 0.036, 0, 0.056, 0.07, 0.005, 0.002, 0x4a4e57, 'metal'); P.box(s * 0.036, 0.052, 0.003, 0.01, 0.0025, 0.001, s > 0 ? 0xf1f1ee : 0xff5a30, 'glow'); if (s > 0) P.box(s * 0.036, 0.052, 0.003, 0.0025, 0.01, 0.001, 0xf1f1ee, 'glow'); g.position.set(s * 0.082, 0.0, -0.04); }
      for (const m of P.meshes(mats)) g.add(m);
      if (col) fixed.push(g); else spin.add(g);
      paddles.push(g);
    }
  }
  return { spin, fixed, leds, paddles, rimAt: (th, o) => { const q = out(th); return o.set(q[0], q[1], q[2]); } };
}

/** The gear lever, standing on its pivot (y up). */
function buildShifter(R, mats) {
  const S = new Geo(), k = R.knob, tip = R.shift === 'tip';
  const len = tip ? 0.085 : k === 'tall' ? 0.2 : k === 'gate' ? 0.15 : k === 'alu' ? 0.115 : 0.135;
  const ball = (r, hex, slot) => S.at(0, len, 0, -PI / 2, 0, 0, () => S.lathe([[0, -r], [r * 0.6, -r * 0.8], [r * 0.95, -r * 0.3], [r, 0.1 * r], [r * 0.8, r * 0.6], [r * 0.4, r * 0.92], [0, r]], 12, hex, slot));
  S.at(0, 0, 0, -PI / 2, 0, 0, () => {
    if (!tip && k !== 'gate') S.lathe([[0.052, 0], [0.034, 0.03], [0.014, 0.078], [0.011, 0.082]], 10, 0x17181c, 'soft'); // the leather boot
    S.lathe([[tip ? 0.012 : 0.0065, 0.0], [tip ? 0.012 : 0.0065, len - 0.012]], 8, 0xc8ccd4, 'metal');
  });
  if (tip) { S.rbox(0, len + 0.02, 0, 0.052, 0.075, 0.062, 0.02, 0x17181c, 'soft'); S.rbox(0, len + 0.035, -0.032, 0.03, 0.03, 0.006, 0.003, 0xc8ccd4, 'metal'); }
  else if (k === 't') { S.rbox(0, len + 0.012, 0, 0.095, 0.036, 0.046, 0.016, 0x17181c, 'soft'); S.box(0.05, len + 0.012, 0, 0.004, 0.014, 0.014, 0xc8ccd4, 'metal'); }
  else if (k === 'cue') ball(0.028, 0xf1f1ee, 'trim');
  else if (k === 'golf') ball(0.027, 0xe9e9e6, 'soft');
  else if (k === 'gate') ball(0.021, 0xc8ccd4, 'metal');
  else if (k === 'tall') ball(0.02, 0x17181c, 'trim');
  else if (k === 'alu') S.at(0, len, 0, -PI / 2, 0, 0, () => S.lathe([[0.011, -0.032], [0.02, -0.012], [0.025, 0.01], [0.019, 0.027], [0, 0.031]], 12, 0xc8ccd4, 'metal'));
  else if (k === 'leather') S.at(0, len, 0, -PI / 2, 0, 0, () => { S.lathe([[0.012, -0.036], [0.024, -0.006], [0.026, 0.014], [0.016, 0.03], [0, 0.034]], 12, 0x17181c, 'soft'); S.lathe([[0.0125, -0.036], [0.015, -0.03], [0.0125, -0.028]], 12, R.accent, 'soft'); });
  else { ball(0.026, 0x17181c, 'trim'); S.at(0, len + 0.024, 0, -PI / 2, 0, 0, () => S.lathe([[0.012, 0], [0.012, 0.003], [0, 0.003]], 10, 0xc8ccd4, 'metal')); }
  const group = new THREE.Group();
  for (const m of S.meshes(mats)) group.add(m);
  return { group, len: tip ? len + 0.03 : len };
}
