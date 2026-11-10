// Effects: sparks (wall scrapes, crashes, backfires), speed streaks past the camera, nitro flames.
import * as THREE from 'three';
import { flareTexture } from './models.js';

const SPARKS = 320, STREAKS = 70;

export class Fx {
  constructor(scene, camera, hi) {
    this.hi = hi;
    // sparks: short line segments from each spark back along its velocity, fading as they cool
    this.floorY = 0; // road height under the player (sparks bounce off it)
    this.pos = new Float32Array(SPARKS * 6);
    this.col = new Float32Array(SPARKS * 6);
    this.vel = new Float32Array(SPARKS * 3);
    this.life = new Float32Array(SPARKS);
    this.tint = new Float32Array(SPARKS * 3);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.sparks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    // speed streaks: live in camera space, rushing past at the car's speed
    this.sPos = new Float32Array(STREAKS * 6);
    this.sCol = new Float32Array(STREAKS * 6);
    this.seed = new Float32Array(STREAKS * 3);
    for (let i = 0; i < STREAKS; i++) this.respawn(i, Math.random() * 70);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3));
    this.streakMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.streaks = new THREE.LineSegments(sg, this.streakMat);
    this.streaks.frustumCulled = false;
    camera.add(this.streaks);
    this.flameMat = new THREE.MeshBasicMaterial({ color: hi ? new THREE.Color(0.35, 1.0, 2.0) : 0x4fd8ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: hi ? new THREE.Color(1.6, 1.8, 2.2) : 0xe8fbff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.popMat = new THREE.MeshBasicMaterial({ color: hi ? new THREE.Color(3, 1.3, 0.4) : 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flareMat = new THREE.MeshBasicMaterial({ map: flareTexture(), color: 0x7fd8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.boostLight = hi ? new THREE.PointLight(0x55c8ff, 0, 9, 1.6) : null;
    this.popT = 0;
  }

  /** Flames on each exhaust of a car mesh (call after building the car). Returns the group. */
  attachFlames(car) {
    const g = new THREE.Group();
    for (const [x, y, z] of car.userData.exhausts) {
      const f = new THREE.Group();
      f.position.set(x, y, z);
      // cones with the wide end at the pipe and the tip pointing out of the back (-z)
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.0, 10).translate(0, 0.5, 0).rotateX(-Math.PI / 2), this.flameMat);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 8).translate(0, 0.225, 0).rotateX(-Math.PI / 2), this.coreMat);
      const flare = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), this.flareMat);
      flare.rotation.y = Math.PI;
      const pop = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), this.popMat);
      pop.visible = false;
      f.add(outer, core, flare, pop);
      f.userData = { outer, core, flare, pop };
      g.add(f);
    }
    if (this.boostLight) { this.boostLight.position.set(0, 0.5, -car.userData.hl - 1); g.add(this.boostLight); }
    car.add(g);
    this.flames = g;
    return g;
  }

  /** A burst of n sparks at p (world), thrown along dir with some spread, on top of a base velocity. */
  burst(p, dir, n, speed = 9, base = null, warm = true) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % SPARKS;
      const o = i * 6;
      this.pos[o] = this.pos[o + 3] = p.x; this.pos[o + 1] = this.pos[o + 4] = p.y; this.pos[o + 2] = this.pos[o + 5] = p.z;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = dir.x * sp + (Math.random() - 0.5) * speed * 0.7 + (base ? base.x : 0);
      this.vel[i * 3 + 1] = Math.abs(dir.y) * sp + Math.random() * speed * 0.45;
      this.vel[i * 3 + 2] = dir.z * sp + (Math.random() - 0.5) * speed * 0.7 + (base ? base.z : 0);
      this.life[i] = 0.35 + Math.random() * 0.45;
      const t = i * 3;
      if (warm) { this.tint[t] = 1; this.tint[t + 1] = 0.55 + Math.random() * 0.35; this.tint[t + 2] = 0.15 + Math.random() * 0.2; }
      else { this.tint[t] = 0.6; this.tint[t + 1] = 0.85; this.tint[t + 2] = 1; }
    }
  }

  respawn(i, z) {
    // along both sides of the view, from road level to a bit above the camera
    const side = Math.random() < 0.5 ? -1 : 1;
    this.seed[i * 3] = side * (3 + Math.random() * 7);
    this.seed[i * 3 + 1] = -1.6 + Math.random() * 3.6;
    this.seed[i * 3 + 2] = -z;
  }

  /**
   * Per frame. kmh: speed; boosting; carVel: world velocity of the player (sparks inherit it);
   * flames shown when boosting; pop (0..1) flickers backfire flashes.
   */
  update(dt, kmh, boosting, carVel, playing) {
    // sparks
    const k = this.hi ? 2.2 : 1.2;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 6;
      if (this.life[i] <= 0) { if (this.col[o] || this.col[o + 3]) { this.col.fill(0, o, o + 6); } continue; }
      this.life[i] -= dt;
      const v = i * 3;
      this.vel[v + 1] -= 18 * dt;
      // tail = where it was a moment ago (in the car's frame, so the streaks read at speed)
      this.pos[o + 3] = this.pos[o] - (this.vel[v] - carVel.x * 0.85) * 0.025;
      this.pos[o + 4] = this.pos[o + 1] - this.vel[v + 1] * 0.025;
      this.pos[o + 5] = this.pos[o + 2] - (this.vel[v + 2] - carVel.z * 0.85) * 0.025;
      this.pos[o] += this.vel[v] * dt; this.pos[o + 1] += this.vel[v + 1] * dt; this.pos[o + 2] += this.vel[v + 2] * dt;
      if (this.pos[o + 1] < this.floorY + 0.02) { this.pos[o + 1] = this.floorY + 0.02; this.vel[v + 1] *= -0.35; this.vel[v] *= 0.7; this.vel[v + 2] *= 0.7; }
      const f = Math.min(1, this.life[i] * 2.5) * k;
      for (let e = 0; e < 2; e++) { const q = o + e * 3, w = e ? 0.25 : 1; this.col[q] = this.tint[v] * f * w; this.col[q + 1] = this.tint[v + 1] * f * w; this.col[q + 2] = this.tint[v + 2] * f * w; }
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;

    // streaks
    const amt = playing ? Math.min(1, Math.max(0, (kmh - 150) / 140) + (boosting ? 0.45 : 0)) : 0;
    this.streakMat.opacity += (amt - this.streakMat.opacity) * Math.min(1, dt * 4);
    this.streaks.visible = this.streakMat.opacity > 0.01;
    if (this.streaks.visible) {
      const v = kmh / 3.6, len = 1.5 + v * 0.06;
      for (let i = 0; i < STREAKS; i++) {
        const s = i * 3, o = i * 6;
        this.seed[s + 2] += v * 1.15 * dt; // they come toward the camera (camera looks down -z)
        if (this.seed[s + 2] > 1) this.respawn(i, 45 + Math.random() * 30);
        this.sPos[o] = this.sPos[o + 3] = this.seed[s];
        this.sPos[o + 1] = this.sPos[o + 4] = this.seed[s + 1];
        this.sPos[o + 2] = this.seed[s + 2]; this.sPos[o + 5] = this.seed[s + 2] - len;
        const fade = Math.min(1, (70 + this.seed[s + 2]) / 25) * 0.32;
        this.sCol[o] = 0.75 * fade; this.sCol[o + 1] = 0.85 * fade; this.sCol[o + 2] = fade;
        this.sCol[o + 3] = this.sCol[o + 4] = this.sCol[o + 5] = 0;
      }
      this.streaks.geometry.attributes.position.needsUpdate = true;
      this.streaks.geometry.attributes.color.needsUpdate = true;
    }

    // nitro flames + backfire pops
    if (this.flames) {
      this.popT = Math.max(0, this.popT - dt);
      const show = boosting && playing;
      for (const f of this.flames.children) {
        if (!f.userData.outer) continue;
        const { outer, core, flare, pop } = f.userData;
        outer.visible = core.visible = flare.visible = show;
        if (show) {
          const fl = 0.75 + Math.random() * 0.5;
          outer.scale.set(1, 1, fl * 1.2); core.scale.set(1, 1, fl);
          flare.scale.setScalar(0.8 + Math.random() * 0.4);
        }
        pop.visible = this.popT > 0;
        if (pop.visible) pop.scale.setScalar(0.6 + Math.random() * 1.2);
      }
      if (this.boostLight) this.boostLight.intensity = show ? 4 + Math.random() * 3 : (this.popT > 0 ? 4 : 0);
    }
  }

  /** Orange flash from the exhausts (lifting off at high revs). */
  pop() { this.popT = 0.07; }
}
