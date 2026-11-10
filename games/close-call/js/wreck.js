// Two lives mode: when you crash the second time the car blows up. This file has the fire and smoke particles,
// and the wreck itself: the car flies and tumbles, two wheels and some panels come off, it lands, rolls to a stop
// and keeps burning. Everything moves in road space (s along the road, d across it, h above it) so the wreck
// follows the road's bends and hills.
import * as THREE from 'three';

const G = 20; // gravity, a little floaty so the flight reads on screen

let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.75)'); g.addColorStop(0.7, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}
let scorchTex = null;
function scorchTexture() {
  if (scorchTex) return scorchTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.55, 'rgba(8,5,3,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // a few streaks thrown out from the middle
  x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, r = 34 + Math.random() * 26;
    x.lineWidth = 3 + Math.random() * 5;
    x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); x.stroke();
  }
  scorchTex = new THREE.CanvasTexture(c);
  return scorchTex;
}

const VERT = /* glsl */ `
attribute float size;
attribute vec4 tint;
uniform float scale;
varying vec4 vT;
void main() {
  vT = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.2, -mv.z);
  gl_Position = size > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec4 vT;
void main() {
  float m = texture2D(map, gl_PointCoord).a * vT.a;
  if (m < 0.004) discard;
  gl_FragColor = vec4(vT.rgb, m);
  #include <colorspace_fragment>
}`;

/** Soft round particles, all in one draw call. additive = fire (glows), otherwise smoke. */
export class Puffs {
  constructor(scene, n, additive) {
    this.n = n; this.next = 0; this.additive = additive;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.tint = new Float32Array(n * 4);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.c0 = new Float32Array(n * 3); this.c1 = new Float32Array(n * 3);
    this.a = new Float32Array(n); this.rise = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: puffTexture() }, scale: { value: 600 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.obj = new THREE.Points(g, this.mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = additive ? 6 : 5;
    scene.add(this.obj);
    this.live = 0;
  }

  /** One puff at (x, y, z) moving (vx, vy, vz); grows s0 -> s1 metres over `life` s; colour c0 -> c1 ([r, g, b]). */
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a = 1, rise = 0) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.life[i] = this.max[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[k] = c0[0]; this.c0[k + 1] = c0[1]; this.c0[k + 2] = c0[2];
    this.c1[k] = c1[0]; this.c1[k + 1] = c1[1]; this.c1[k + 2] = c1[2];
    this.a[i] = a; this.rise[i] = rise;
    this.live = 1;
  }

  /** scale = drawing-buffer height / (2 tan(fov / 2)), so sizes are in metres. */
  update(dt, scale) {
    this.mat.uniforms.scale.value = scale;
    if (!this.live) return;
    let any = 0;
    const drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.size[i]) this.size[i] = 0; continue; }
      any = 1;
      this.life[i] -= dt;
      const k = i * 3, q = i * 4;
      const t = Math.min(1, 1 - this.life[i] / this.max[i]);
      this.v[k] *= drag; this.v[k + 1] = this.v[k + 1] * drag + this.rise[i] * dt; this.v[k + 2] *= drag;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const e = 1 - (1 - t) * (1 - t);
      this.size[i] = this.life[i] > 0 ? this.s0[i] + (this.s1[i] - this.s0[i]) * e : 0;
      this.tint[q] = this.c0[k] + (this.c1[k] - this.c0[k]) * t;
      this.tint[q + 1] = this.c0[k + 1] + (this.c1[k + 1] - this.c0[k + 1]) * t;
      this.tint[q + 2] = this.c0[k + 2] + (this.c1[k + 2] - this.c0[k + 2]) * t;
      // fire flashes on and burns out; smoke fades in, then thins away
      this.tint[q + 3] = this.a[i] * (this.additive ? Math.pow(1 - t, 1.4) : Math.min(1, t * 5) * (1 - t));
    }
    this.live = any;
    const g = this.obj.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.tint.needsUpdate = true;
  }
}

const Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), V = new THREE.Vector3();
/** How far below its centre a box (half sizes hx, hy, hz) reaches at these angles. */
function reach(rx, ry, rz, hx, hy, hz) {
  Q.setFromEuler(E.set(rx, ry, rz, 'YXZ'));
  let low = 0;
  for (let i = 0; i < 8; i++) {
    V.set(i & 1 ? hx : -hx, i & 2 ? hy : -hy, i & 4 ? hz : -hz).applyQuaternion(Q);
    if (V.y < low) low = V.y;
  }
  return -low;
}
const near = (a, step) => Math.round(a / step) * step;
const toward = (v, to, amt) => (v > to ? Math.max(to, v - amt) : Math.min(to, v + amt));
const rnd = (a, b) => a + Math.random() * (b - a);
const sgn = () => (Math.random() < 0.5 ? -1 : 1);

/** One tumbling thing in road space: the car body, a wheel, or a panel. */
class Body {
  constructor(obj, s, d, h, hx, hy, hz) {
    this.obj = obj; this.s = s; this.d = d; this.h = h;
    this.hx = hx; this.hy = hy; this.hz = hz;
    this.vs = 0; this.vd = 0; this.vh = 0;
    this.rx = 0; this.ry = 0; this.rz = 0; this.wx = 0; this.wy = 0; this.wz = 0;
    this.rest = false;
  }
  /** Returns the speed it hit the ground with (0 if it didn't). */
  step(dt, road, settle) {
    let hit = 0;
    this.vh -= G * dt;
    this.s += this.vs * dt; this.d += this.vd * dt; this.h += this.vh * dt;
    this.rx += this.wx * dt; this.ry += this.wy * dt; this.rz += this.wz * dt;
    const lim = road.wall - Math.max(this.hx, 0.3);
    if (Math.abs(this.d) > lim) { this.d = Math.sign(this.d) * lim; this.vd = -this.vd * 0.35; this.wy *= -0.6; }
    const low = reach(this.rx, this.ry, this.rz, this.hx, this.hy, this.hz);
    if (this.h < low) {
      this.h = low;
      if (this.vh < -2.5) {
        hit = -this.vh;
        this.vh = -this.vh * 0.32;
        this.vs *= 0.62; this.vd *= 0.6;
        this.wx = this.wx * 0.55 + rnd(-1.5, 1.5); this.wz = this.wz * 0.55 + rnd(-1.5, 1.5); this.wy *= 0.6;
      } else {
        this.vh = Math.max(0, this.vh);
        // sliding on the ground: friction, spin dies down, and it rolls onto a flat side
        const f = 11 * dt;
        this.vs = toward(this.vs, 0, f); this.vd = toward(this.vd, 0, f);
        const k = Math.exp(-5 * dt);
        this.wx *= k; this.wy *= k; this.wz *= k;
        const r = 1 - Math.exp(-settle * dt);
        this.rx += (near(this.rx, Math.PI) - this.rx) * r;
        this.rz += (near(this.rz, Math.PI / 2) - this.rz) * r;
        this.rest = Math.abs(this.vs) + Math.abs(this.vd) < 0.05;
      }
    }
    return hit;
  }
  place(road, P) {
    road.toWorld(this.s, this.d, P);
    this.obj.position.set(P.x, P.y + this.h, P.z);
    this.obj.rotation.set(this.rx - Math.atan(road.grade(this.s)), P.h + this.ry, this.rz);
    return P;
  }
}

/** A fireball and a cloud of smoke at (x, y, z), drifting (fx, fz). k scales it (other players' wrecks are smaller). */
export function blast(fire, smoke, hi, x, y, z, fx = 0, fz = 0, k = 1) {
  // orange-hot rather than white: lots of puffs add up, so each one is fairly dim
  const f0 = hi ? [2.3, 0.95, 0.28] : [0.9, 0.55, 0.2], f1 = hi ? [1.1, 0.12, 0.02] : [0.6, 0.08, 0.01];
  for (let i = 0; i < 24 * k; i++) {
    const a = Math.random() * Math.PI * 2, sp = rnd(3, 10);
    fire.emit(x + rnd(-1.2, 1.2), y + rnd(-0.4, 1.2), z + rnd(-1.2, 1.2), fx + Math.cos(a) * sp, rnd(2, 8), fz + Math.sin(a) * sp, rnd(0.5, 1.1), rnd(1.2, 2), rnd(3.6, 5.8), f0, f1, 0.7, 2);
  }
  for (let i = 0; i < 22 * k; i++) {
    const a = Math.random() * Math.PI * 2, sp = rnd(1, 4.5);
    smoke.emit(x + rnd(-1.5, 1.5), y + rnd(0, 1.5), z + rnd(-1.5, 1.5), fx * 0.5 + Math.cos(a) * sp, rnd(1, 3.5), fz * 0.5 + Math.sin(a) * sp, rnd(2.6, 4.6), rnd(1.6, 2.6), rnd(6, 9), [0.17, 0.15, 0.14], [0.07, 0.065, 0.06], 0.8, 1.4);
  }
}

const P = {};
export class Wreck {
  /** fire, smoke: Puffs. light: a PointLight already in the scene (its intensity is borrowed while burning). */
  constructor(scene, road, fire, smoke, light, hi) {
    this.scene = scene; this.road = road; this.fire = fire; this.smoke = smoke; this.light = light; this.hi = hi;
    this.t = 0; this.bits = []; this.onLand = null;
    this.FIRE0 = hi ? [4.2, 2.2, 0.7] : [1, 0.8, 0.35];
    this.FIRE1 = hi ? [1.4, 0.18, 0.03] : [0.75, 0.12, 0.02];
    this.SMOKE0 = [0.17, 0.15, 0.14]; this.SMOKE1 = [0.07, 0.065, 0.06];
    this.fireAcc = 0; this.smokeAcc = 0;
  }

  /**
   * Blow up `car` (the player's car Group, built by buildCar) where `sim` says it is.
   * hit: the crash event from CarSim ({ impact, side, dd }).
   */
  start(car, sim, hit) {
    const ud = car.userData, road = this.road;
    const hh = ud.roofH / 2;
    // the body pivots around its middle, not around the road under it
    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'YXZ';
    this.scene.add(this.pivot);
    this.pivot.add(car);
    car.position.set(0, -hh, 0); car.rotation.set(0, 0, 0);
    ud.burn();
    const b = (this.body = new Body(this.pivot, sim.s, sim.d, hh + 0.05, sim.hw, hh, sim.hl));
    b.vs = Math.max(7, sim.v * 0.55);
    b.vd = hit && hit.side ? Math.sign(hit.dd || 1) * rnd(3, 5.5) : rnd(-3.5, 3.5);
    b.vh = rnd(11.5, 14.5) + Math.min(3, (hit ? hit.impact : 0) * 0.08);
    b.ry = sim.yaw;
    b.wx = sgn() * rnd(3.2, 5.5); b.wz = sgn() * rnd(2.5, 5.5); b.wy = rnd(-2.2, 2.2);

    // two wheels come off
    const wheels = [...(ud.wheels || [])].sort(() => Math.random() - 0.5).slice(0, 2);
    for (const w of wheels) {
      const lx = w.position.x, lz = w.position.z;
      const holder = new THREE.Group(); holder.rotation.order = 'YXZ';
      this.scene.add(holder);
      holder.add(w); w.position.set(0, 0, 0); w.rotation.set(0, 0, 0);
      const r = ud.wheelR || 0.34;
      const o = new Body(holder, sim.s + lz, sim.d - lx, 0.5, r, r, r);
      o.vs = b.vs * rnd(0.7, 1.25); o.vd = -Math.sign(lx || 1) * rnd(4, 8); o.vh = rnd(8, 13);
      o.wx = rnd(8, 16); o.wz = sgn() * rnd(1, 4);
      o.flat = 0.12; // lies on its side once it stops
      this.bits.push(o);
    }
    // panels and bits of trim
    const mat = ud.paintMat;
    if (mat) {
      this.box = new THREE.BoxGeometry(1, 1, 1);
      for (let i = 0; i < 9; i++) {
        const sx = rnd(0.25, 0.75), sy = rnd(0.04, 0.12), sz = rnd(0.3, 0.9);
        const m = new THREE.Mesh(this.box, mat);
        m.scale.set(sx, sy, sz);
        const holder = new THREE.Group(); holder.rotation.order = 'YXZ'; holder.add(m);
        this.scene.add(holder);
        const o = new Body(holder, sim.s + rnd(-sim.hl, sim.hl), sim.d + rnd(-sim.hw, sim.hw), hh * 1.5, sx / 2, sy / 2, sz / 2);
        o.vs = b.vs * rnd(0.3, 1.3); o.vd = rnd(-9, 9); o.vh = rnd(6, 15);
        o.wx = rnd(-12, 12); o.wy = rnd(-8, 8); o.wz = rnd(-12, 12);
        this.bits.push(o);
      }
    }
    // a burnt patch on the road where it went up
    road.toWorld(sim.s, sim.d, P);
    this.scorch = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, opacity: 0.9 }));
    this.scorch.position.set(P.x, P.y + 0.035, P.z);
    this.scorch.rotation.set(-Math.PI / 2 - Math.atan(road.grade(sim.s)), P.h, Math.random() * 6.28, 'YXZ');
    this.scene.add(this.scorch);

    // the fireball, then a rolling cloud of smoke
    const cx = P.x, cy = P.y + hh, cz = P.z;
    blast(this.fire, this.smoke, this.hi, cx, cy, cz, Math.sin(P.h + sim.yaw) * b.vs * 0.5, Math.cos(P.h + sim.yaw) * b.vs * 0.5, 1);
    this.light.position.set(cx, cy + 1.5, cz);
    this.light.intensity = this.hi ? 140 : 90;
    this.t = 0;
  }

  /** World position of the wreck's middle (for the camera). */
  get pos() { return this.pivot.position; }

  update(dt) {
    if (!this.body) return;
    this.t += dt;
    const road = this.road, b = this.body;
    const hit = b.step(dt, road, 3);
    b.place(road, P);
    if (hit > 3 && this.onLand) this.onLand(hit, this.pivot.position, false);
    for (const o of this.bits) {
      if (o.rest) continue;
      const h2 = o.step(dt, road, o.flat ? 4 : 2);
      if (o.flat && o.vh === 0 && Math.abs(o.vs) < 1) { o.rz += (Math.PI / 2 - o.rz) * (1 - Math.exp(-4 * dt)); o.wx *= Math.exp(-6 * dt); }
      o.place(road, P);
      if (h2 > 5 && this.onLand) this.onLand(h2 * 0.4, o.obj.position, true);
    }
    // it keeps burning: flames licking off the shell and a column of smoke
    const c = this.pivot.position, burn = this.t < 6 ? 1 : Math.max(0.45, 1 - (this.t - 6) / 20);
    this.fireAcc += dt * 34 * burn;
    while (this.fireAcc > 1) {
      this.fireAcc -= 1;
      this.fire.emit(c.x + rnd(-b.hx, b.hx), c.y + rnd(-0.2, 0.6), c.z + rnd(-b.hz, b.hz) * 0.8, rnd(-0.6, 0.6), rnd(1.5, 3.5), rnd(-0.6, 0.6), rnd(0.35, 0.75), rnd(0.5, 0.9), rnd(1.1, 1.9), this.FIRE0, this.FIRE1, 0.9, 3);
    }
    this.smokeAcc += dt * 11 * burn;
    while (this.smokeAcc > 1) {
      this.smokeAcc -= 1;
      this.smoke.emit(c.x + rnd(-0.6, 0.6), c.y + rnd(0.8, 1.6), c.z + rnd(-0.6, 0.6), rnd(-0.4, 0.4), rnd(1.5, 2.8), rnd(-0.4, 0.4), rnd(3, 4.8), rnd(1, 1.6), rnd(4.5, 7.5), this.SMOKE0, this.SMOKE1, 0.7, 0.8);
    }
    // the flash, then firelight flickering on the road
    const fl = this.t < 0.6 ? Math.pow(1 - this.t / 0.6, 2) * (this.hi ? 140 : 90) : 0;
    this.light.intensity = fl + (this.hi ? 9 : 6) * burn * (0.75 + Math.random() * 0.5);
    this.light.position.set(c.x, c.y + 1.4, c.z);
  }

  dispose() {
    if (!this.body) return;
    this.pivot.removeFromParent();
    for (const o of this.bits) o.obj.removeFromParent();
    this.bits = [];
    if (this.box) this.box.dispose();
    this.scorch.removeFromParent(); this.scorch.geometry.dispose(); this.scorch.material.dispose();
    this.light.intensity = 0;
    this.body = null;
  }
}
