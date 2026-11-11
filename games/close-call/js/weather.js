// Weather round the camera: rain (streaks that lean back as you speed up), snow (soft flakes that drift), fog,
// and lightning in rain storms. Particles live in a box that follows the camera, so it rains everywhere you go
// for the price of a few thousand points. The road's wet shine and the grip change are set by world.js / main.js.
import * as THREE from 'three';

const BOX = [46, 28, 74]; // width, height, depth of the box of weather round the camera

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Weather {
  constructor(scene, hi) {
    this.scene = scene; this.hi = hi;
    this.kind = 'clear';
    this.flash = 0; // lightning, 0..1 (main.js brightens the lights with it)
    this.boltIn = 6;
    this.onThunder = null;
    this.obj = null;
  }

  /** 'clear' | 'rain' | 'snow' | 'fog'. storm: lightning with the rain. */
  set(kind, storm = false) {
    this.storm = storm && kind === 'rain';
    if (kind === this.kind && (this.obj || kind === 'clear' || kind === 'fog')) return;
    this.dispose();
    this.kind = kind;
    if (kind === 'rain') this.makeRain();
    else if (kind === 'snow') this.makeSnow();
  }

  dispose() {
    if (!this.obj) return;
    this.scene.remove(this.obj); this.obj.geometry.dispose(); this.obj.material.map?.dispose(); this.obj.material.dispose();
    this.obj = null;
  }

  makeRain() {
    const n = (this.n = this.hi ? 2000 : 900);
    this.p = new Float32Array(n * 3); this.sp = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.p[i * 3] = (Math.random() - 0.5) * BOX[0]; this.p[i * 3 + 1] = Math.random() * BOX[1] - 6; this.p[i * 3 + 2] = (Math.random() - 0.5) * BOX[2]; this.sp[i] = 18 + Math.random() * 8; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: this.hi ? 0xa8bcd8 : 0x8a9cb8, transparent: true, opacity: this.hi ? 0.3 : 0.38, depthWrite: false, fog: false }));
    this.obj.frustumCulled = false;
    this.scene.add(this.obj);
    this.placed = false;
  }

  makeSnow() {
    const n = (this.n = this.hi ? 3200 : 1400);
    this.p = new Float32Array(n * 3); this.sp = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.p[i * 3] = (Math.random() - 0.5) * BOX[0]; this.p[i * 3 + 1] = Math.random() * BOX[1] - 6; this.p[i * 3 + 2] = (Math.random() - 0.5) * BOX[2]; this.sp[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.obj = new THREE.Points(g, new THREE.PointsMaterial({ size: this.hi ? 0.16 : 0.2, map: dotTexture(), color: 0xf2f6ff, transparent: true, opacity: 0.95, depthWrite: false, fog: true }));
    this.obj.frustumCulled = false;
    this.scene.add(this.obj);
    this.placed = false;
  }

  /** Per frame. cam: the camera; vel: how fast the camera is moving (world, m/s) so rain streaks lean. */
  update(dt, cam, vel, time) {
    // lightning: a double flicker every 8-22 seconds, thunder a moment later
    if (this.storm) {
      this.boltIn -= dt;
      if (this.boltIn <= 0) { this.boltT = 0; this.boltIn = 8 + Math.random() * 14; if (this.onThunder) this.onThunder(0.6 + Math.random() * 1.8); }
      if (this.boltT != null) {
        this.boltT += dt;
        const b = this.boltT;
        this.flash = b < 0.08 ? 1 : b < 0.16 ? 0.25 : b < 0.24 ? 0.85 : Math.max(0, 0.85 - (b - 0.24) * 3);
        if (b > 0.6) { this.boltT = null; this.flash = 0; }
      }
    } else this.flash = 0;
    if (!this.obj) return;
    const n = this.n, p = this.p, out = this.obj.geometry.attributes.position.array;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    if (!this.placed) { for (let i = 0; i < n; i++) { p[i * 3] += cx; p[i * 3 + 1] += cy; p[i * 3 + 2] += cz; } this.placed = true; }
    const wrap = (v, c, size) => { const h = size / 2; let d = v - c; if (d > h) d -= size * Math.ceil((d - h) / size); else if (d < -h) d += size * Math.ceil((-h - d) / size); return c + d; };
    if (this.kind === 'rain') {
      // a streak points along the drop's motion as the camera sees it: falling, and rushing at you as you drive
      for (let i = 0; i < n; i++) {
        const k = i * 3, f = this.sp[i];
        p[k + 1] -= f * dt;
        p[k] = wrap(p[k], cx, BOX[0]); p[k + 1] = wrap(p[k + 1], cy + 6, BOX[1]); p[k + 2] = wrap(p[k + 2], cz, BOX[2]);
        const rx = -vel.x, ry = -f, rz = -vel.z, l = Math.hypot(rx, ry, rz) || 1;
        // shorter right in front of the lens, so close drops don't slash across the screen
        const near = Math.hypot(p[k] - cx, p[k + 1] - cy, p[k + 2] - cz), len = (0.4 + Math.min(0.75, l * 0.012)) * Math.min(1, near / 6);
        const o = i * 6;
        out[o] = p[k]; out[o + 1] = p[k + 1]; out[o + 2] = p[k + 2];
        out[o + 3] = p[k] - (rx / l) * len; out[o + 4] = p[k + 1] - (ry / l) * len; out[o + 5] = p[k + 2] - (rz / l) * len;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const k = i * 3, ph = this.sp[i];
        p[k + 1] -= (1.3 + (ph % 1) * 0.8) * dt;
        p[k] += Math.sin(time * 0.9 + ph) * 0.5 * dt; p[k + 2] += Math.cos(time * 0.7 + ph * 1.3) * 0.4 * dt;
        p[k] = wrap(p[k], cx, BOX[0]); p[k + 1] = wrap(p[k + 1], cy + 6, BOX[1]); p[k + 2] = wrap(p[k + 2], cz, BOX[2]);
        out[k] = p[k]; out[k + 1] = p[k + 1]; out[k + 2] = p[k + 2];
      }
    }
    this.obj.geometry.attributes.position.needsUpdate = true;
  }
}
