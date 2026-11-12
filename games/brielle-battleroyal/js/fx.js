// Short-lived effects: bullet tracers, muzzle flashes, dust and wood chips, explosions, piece debris, rain in the storm.
import * as THREE from 'three';
import { glowSprite, pieceMat } from './models.js';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.tracers = []; this.puffs = []; this.debris = []; this.booms = [];
    const tg = new THREE.CylinderGeometry(0.025, 0.025, 1, 4, 1, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, 0.5);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, t: 0 });
    }
    for (let i = 0; i < 160; i++) {
      const s = glowSprite(0xffffff, 1); s.visible = false; scene.add(s);
      this.puffs.push({ s, t: 0, life: 1, v: new THREE.Vector3(), g: 0, grow: 0 });
    }
    const dg = new THREE.BoxGeometry(0.35, 0.35, 0.12);
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(dg, pieceMat(0)); m.visible = false; scene.add(m);
      this.debris.push({ m, t: 0, v: new THREE.Vector3(), r: new THREE.Vector3() });
    }
    this.flash = glowSprite(0xffd27a, 0.9); this.flash.visible = false; scene.add(this.flash); this.flashT = 0;
    this.flashLight = new THREE.PointLight(0xffc070, 0, 8); scene.add(this.flashLight);
    // rain (storm)
    const N = 1500, rp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { rp[i * 3] = (Math.random() - 0.5) * 60; rp[i * 3 + 1] = Math.random() * 30; rp[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xc8d6ff, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false }));
    this.rain.visible = false; this.rain.frustumCulled = false; scene.add(this.rain);
  }

  tracer(from, to, color = 0xfff2b0) {
    const t = this.tracers.find((q) => q.t <= 0) || this.tracers[0];
    const len = from.distanceTo(to);
    t.m.position.copy(from); t.m.lookAt(to); t.m.scale.set(1, 1, len);
    t.m.material.color.setHex(color); t.m.material.opacity = 0.85;
    t.m.visible = true; t.t = 0.07;
  }
  muzzle(pos) {
    this.flash.position.copy(pos); this.flash.visible = true; this.flash.material.rotation = Math.random() * 6;
    this.flash.scale.setScalar(0.6 + Math.random() * 0.5);
    this.flashT = 0.045;
    this.flashLight.position.copy(pos); this.flashLight.intensity = 4;
  }
  puff(pos, color, n = 6, speed = 2, size = 0.5, life = 0.5, grav = -1) {
    for (let i = 0; i < n; i++) {
      const p = this.puffs.find((q) => q.t <= 0); if (!p) return;
      p.s.position.copy(pos); p.s.material.color.setHex(color); p.s.material.blending = THREE.NormalBlending;
      p.s.material.opacity = 0.9; p.s.scale.setScalar(size); p.s.visible = true;
      p.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
      p.t = p.life = life * (0.7 + Math.random() * 0.6); p.g = grav; p.grow = size * 1.5; p.base = size;
    }
  }
  spark(pos, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const p = this.puffs.find((q) => q.t <= 0); if (!p) return;
      p.s.position.copy(pos); p.s.material.color.setHex(color); p.s.material.blending = THREE.AdditiveBlending;
      p.s.material.opacity = 1; p.s.scale.setScalar(0.25); p.s.visible = true;
      p.v.set((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8);
      p.t = p.life = 0.35 + Math.random() * 0.3; p.g = -12; p.grow = -0.2; p.base = 0.25;
    }
  }
  explode(pos, r) {
    this.puff(pos, 0xffa040, 14, 9, 2.2, 0.5, 2);
    this.puff(pos, 0x555555, 14, 6, 2.8, 1.4, 1.5);
    this.spark(pos, 0xffd27a, 18);
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(pos); this.scene.add(s); this.booms.push({ m: s, t: 0, r });
    this.flashLight.position.copy(pos); this.flashLight.intensity = 30; this.flashT = 0.15;
  }
  shatter(center, mat, n = 10) {
    for (let i = 0; i < n; i++) {
      const d = this.debris.find((q) => q.t <= 0); if (!d) return;
      d.m.material = pieceMat(mat); d.m.visible = true; d.m.position.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 3));
      d.v.set((Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6); d.r.set(Math.random() * 8, Math.random() * 8, 0); d.t = 1.1 + Math.random() * 0.5;
    }
    this.puff(center, mat === 0 ? 0xc49359 : mat === 1 ? 0xb07060 : 0xb0b8c0, 6, 3, 1.4, 0.7, 0.5);
  }
  update(dt, cam, inStorm) {
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; t.m.material.opacity = Math.max(0, t.t / 0.07) * 0.85; if (t.t <= 0) t.m.visible = false; }
    for (const p of this.puffs) {
      if (p.t <= 0) continue;
      p.t -= dt;
      if (p.t <= 0) { p.s.visible = false; continue; }
      p.v.y += p.g * dt; p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 1.5);
      const f = p.t / p.life;
      p.s.material.opacity = Math.min(1, f * 1.4) * 0.9;
      p.s.scale.setScalar(Math.max(0.01, p.base + p.grow * (1 - f)));
    }
    for (const d of this.debris) {
      if (d.t <= 0) continue;
      d.t -= dt; d.v.y -= 18 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.r.x * dt; d.m.rotation.y += d.r.y * dt;
      if (d.t <= 0) d.m.visible = false;
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i]; b.t += dt;
      const f = b.t / 0.35;
      b.m.scale.setScalar(b.r * Math.min(1, f) * 0.9); b.m.material.opacity = Math.max(0, 0.85 * (1 - f));
      if (f >= 1) { this.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); this.booms.splice(i, 1); }
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; } }
    // rain follows the camera inside the storm
    this.rain.visible = inStorm;
    if (inStorm) {
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - 38 * dt;
        if (y < 0) y += 30;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      this.rain.position.set(cam.position.x, cam.position.y - 12, cam.position.z);
    }
  }
}
