// The driver you see from the seat: two arms in a race suit and two gloved hands, built from code and posed every
// frame. A hand is a wrist frame plus fifteen finger joints; an arm is two tubes placed by two-bone IK from a fixed
// shoulder to wherever the hand is (on the wheel rim, on the gear knob).
// Hand frame: x = thumb side, y = out of the back of the hand, z = along the fingers. The left hand is the right
// hand mirrored.
import * as THREE from 'three';
import { Geo, shade } from './cabin-kit.js';

const UPPER = 0.3, FORE = 0.27;
// finger: [x across the palm, [three bone lengths], radius]
const FINGERS = [
  [0.031, [0.044, 0.027, 0.022], 0.0102],
  [0.01, [0.048, 0.031, 0.023], 0.0105],
  [-0.011, [0.044, 0.029, 0.022], 0.0099],
  [-0.031, [0.034, 0.021, 0.02], 0.009],
];
const THUMB = [[0.03, 0.029, 0.024], 0.0118];
/** Finger poses: four fingers x three curls (radians), then the thumb [swing out, curl, curl]. */
export const POSE = {
  grip: [[1.2, 1.45, 0.8], [1.25, 1.5, 0.8], [1.25, 1.5, 0.85], [1.3, 1.5, 0.9], [0.4, 0.7, 0.6]],
  // index and middle reach back for the paddle behind the wheel
  reach: [[0.25, 0.5, 0.3], [0.3, 0.55, 0.3], [1.25, 1.5, 0.85], [1.3, 1.5, 0.9], [0.55, 0.5, 0.45]],
  pull: [[0.75, 1.3, 0.9], [0.8, 1.35, 0.9], [1.25, 1.5, 0.85], [1.3, 1.5, 0.9], [0.55, 0.5, 0.45]],
  knob: [[0.75, 0.95, 0.55], [0.8, 1.0, 0.55], [0.85, 1.0, 0.6], [0.9, 1.0, 0.6], [0.2, 0.55, 0.5]],
  open: [[0.25, 0.35, 0.2], [0.25, 0.4, 0.2], [0.3, 0.4, 0.25], [0.35, 0.45, 0.25], [0.1, 0.2, 0.2]],
  press: [[1.2, 1.45, 0.8], [1.25, 1.5, 0.8], [1.25, 1.5, 0.85], [1.3, 1.5, 0.9], [0.9, 0.9, 0.7]],
  // drumming on the rim while stopped: fingers lifted
  lift: [[0.5, 0.9, 0.5], [0.55, 0.95, 0.5], [0.6, 0.95, 0.5], [0.65, 0.95, 0.55], [0.55, 0.5, 0.45]],
};

function capsule(G, r, len, hex, slot = 'soft', tip = 1, n = 8) {
  G.lathe([[0, -r * 0.85], [r * 0.72, -r * 0.5], [r, 0], [r * (0.9 + 0.1 * tip), len * 0.7], [r * 0.92 * tip, len], [r * 0.6 * tip, len + r * 0.55], [0, len + r * 0.8]], n, hex, slot);
}

/** One gloved hand (a right hand; mirror it for the left). Returns { root, joints }. */
function buildHand(mats, look) {
  const root = new THREE.Group(), joints = [];
  const { glove, accent, palm } = look;
  // palm, knuckle guards, wrist cuff
  const G = new Geo();
  G.rbox(0, 0, 0.05, 0.088, 0.031, 0.098, 0.014, glove, 'soft');
  G.rbox(0, -0.011, 0.05, 0.078, 0.014, 0.085, 0.006, palm, 'soft'); // suede palm
  G.rbox(0, 0.0135, 0.052, 0.062, 0.008, 0.05, 0.004, accent, 'soft'); // back-of-hand panel
  for (const [x] of FINGERS) G.rbox(x, 0.014, 0.094, 0.018, 0.011, 0.02, 0.005, shade(accent, -0.25), 'trim'); // knuckle guards
  G.rbox(0.03, -0.004, 0.022, 0.04, 0.028, 0.045, 0.012, glove, 'soft'); // the heel of the thumb
  G.at(0, -0.002, 0.012, 0, 0, 0, () => G.lathe([[0.031, 0.004], [0.034, -0.012], [0.03, -0.03], [0.018, -0.04], [0, -0.042]], 12, glove, 'soft')); // the wrist
  root.add(G.group(mats, 50));
  const bone = (parent, x, y, z, len, r, hex, tip) => {
    const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j);
    const g = new Geo(); capsule(g, r, len, hex, 'soft', tip);
    for (const m of g.meshes(mats, 60)) j.add(m);
    return j;
  };
  for (const [x, lens, r] of FINGERS) {
    const a = bone(root, x, 0, 0.097, lens[0], r, glove, 1), b = bone(a, 0, 0, lens[0], lens[1], r * 0.93, glove, 1), c = bone(b, 0, 0, lens[1], lens[2], r * 0.86, shade(glove, 0.12), 0.72);
    joints.push([a, b, c]);
  }
  { // thumb: swings out from the side of the palm
    const [lens, r] = THUMB;
    const a = bone(root, 0.036, -0.006, 0.034, lens[0], r, glove, 1); a.rotation.order = 'YXZ';
    const b = bone(a, 0, 0, lens[0], lens[1], r * 0.93, glove, 1), c = bone(b, 0, 0, lens[1], lens[2], r * 0.85, shade(glove, 0.12), 0.72);
    joints.push([a, b, c]);
  }
  return { root, joints };
}

/** A sleeve: a tapered tube along +z with suit stripes. */
function buildSleeve(mats, len, r0, r1, look, fore) {
  const G = new Geo(), { suit } = look, accent = look.stripe ?? look.accent, n = 12;
  const prof = [[0, -r0 * 0.7], [r0 * 0.8, -r0 * 0.35], [r0, 0]], cols = [suit, suit];
  const add = (t, hex) => { prof.push([r0 + (r1 - r0) * t, len * t]); cols.push(hex); };
  if (fore) { add(0.22, suit); add(0.28, accent); add(0.34, shade(suit, -0.55)); add(0.4, accent); add(0.7, suit); } // two stripes round the forearm
  else { add(0.55, suit); add(0.7, accent); add(0.98, suit); }
  if (fore) { // the glove's gauntlet cuff over the end of the sleeve, with a band and a strap
    const g = look.glove, a2 = look.accent;
    for (const [r, t, hex] of [[r1 + 0.009, 0.705, g], [r1 + 0.008, 0.8, g], [r1 + 0.007, 0.86, a2], [r1 + 0.005, 0.97, g], [r1 * 0.9, 1.04, g], [0, 1.06, g]]) { prof.push([r, len * t]); cols.push(hex); }
  } else { prof.push([r1 * 0.8, len + r1 * 0.3], [0, len + r1 * 0.6]); cols.push(suit, suit); }
  G.lathe(prof, n, (i) => cols[Math.min(cols.length - 1, i)], 'soft');
  if (fore) { G.rbox(0, r0 * 0.9, len * 0.12, 0.046, 0.006, 0.03, 0.003, 0xf2f2f2, 'trim'); G.rbox(0, r1 + 0.011, len * 0.9, 0.03, 0.006, 0.026, 0.003, shade(look.accent, -0.3), 'trim'); } // a sponsor patch, the cuff strap
  return G.group(mats, 70);
}

const v = () => new THREE.Vector3();
const A = v(), B = v(), C = v(), D = v(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), ZAX = new THREE.Vector3(0, 0, 1);

export class Driver {
  /** look: { suit, accent, glove, palm } colours. */
  constructor(mats, look) {
    this.group = new THREE.Group();
    this.hands = []; this.upper = []; this.fore = [];
    for (const side of [1, -1]) { // 1 = left arm (the car's +x), -1 = right
      const h = buildHand(mats, look);
      const wrap = new THREE.Group();
      if (side > 0) h.root.scale.x = -1; // the left hand is the mirrored one
      wrap.add(h.root);
      const up = buildSleeve(mats, UPPER, 0.054, 0.044, look, false), fo = buildSleeve(mats, FORE, 0.044, 0.033, look, true);
      this.group.add(wrap, up, fo);
      this.hands.push({ wrap, joints: h.joints, cur: POSE.grip.map((f) => f.slice()) });
      this.upper.push(up); this.fore.push(fo);
    }
    this.group.traverse((o) => { o.frustumCulled = false; });
  }

  /**
   * Put one arm. i: 0 left, 1 right. shoulder, wrist: Vector3 (cabin space). quat: the hand's turn (x thumb side for
   * a right hand, y back of the hand, z fingers). fingers: a POSE (or a blend). k: how quickly the fingers follow.
   */
  pose(i, shoulder, wrist, quat, fingers, k = 1) {
    const side = i === 0 ? 1 : -1, H = this.hands[i];
    H.wrap.position.copy(wrist); H.wrap.quaternion.copy(quat);
    for (let f = 0; f < 5; f++) {
      const cur = H.cur[f], want = fingers[f], J = H.joints[f];
      for (let s = 0; s < 3; s++) cur[s] += (want[s] - cur[s]) * k;
      if (f < 4) { J[0].rotation.x = cur[0]; J[1].rotation.x = cur[1]; J[2].rotation.x = cur[2]; }
      else { J[0].rotation.set(0.25, 0.75 + cur[0] * 0.5, 0); J[1].rotation.x = cur[1]; J[2].rotation.x = cur[2]; }
    }
    // two-bone IK: the elbow hangs down and out
    A.subVectors(wrist, shoulder);
    const dist = Math.min(UPPER + FORE - 0.004, Math.max(0.12, A.length()));
    A.normalize();
    const a = (UPPER * UPPER - FORE * FORE + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    B.set(side * 0.55, -0.82, -0.12); B.addScaledVector(A, -B.dot(A)).normalize(); // the pole, square to the arm
    C.copy(shoulder).addScaledVector(A, a).addScaledVector(B, h); // elbow
    const up = this.upper[i], fo = this.fore[i];
    up.position.copy(shoulder); up.quaternion.setFromUnitVectors(ZAX, D.subVectors(C, shoulder).normalize());
    // the forearm keeps its stripes and patch on top: aim z at the wrist with y as near "up" as it can be
    D.subVectors(wrist, C).normalize();
    M.lookAt(C, A.copy(C).sub(D), B.set(0, 1, 0)); // lookAt points -z at the target, so aim it backwards
    fo.position.copy(C); fo.quaternion.setFromRotationMatrix(M);
  }
  dispose() { this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
}

/** Blend two finger poses. */
export function blendPose(a, b, t, out) {
  for (let f = 0; f < 5; f++) for (let s = 0; s < 3; s++) out[f][s] = a[f][s] + (b[f][s] - a[f][s]) * t;
  return out;
}
/** A hand's turn from the way the back of the hand faces and the way the fingers point. */
export function handQuat(back, fingers, out) {
  C.copy(fingers).normalize(); B.copy(back).addScaledVector(C, -back.dot(C)).normalize(); A.crossVectors(B, C);
  M.makeBasis(A, B, C);
  return out.setFromRotationMatrix(M);
}
export { Q as TMPQ };
