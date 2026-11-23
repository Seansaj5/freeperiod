// Short-lived effects: bullet trails, muzzle flashes, dust, smoke, fire and explosions.
import * as THREE from 'three';

const KIND = {
  dust: { add: false, col: [0.72, 0.68, 0.6], a: 0.5, size: [0.25, 0.9], life: [0.35, 0.7], up: 1.2, grow: 1.6 },
  spark: { add: true, col: [1, 0.8, 0.35], a: 1, size: [0.07, 0.16], life: [0.12, 0.3], up: 2.5, grow: 0, g: 9 },
  smoke: { add: false, col: [0.16, 0.16, 0.17], a: 0.55, size: [0.6, 1.3], life: [0.9, 1.8], up: 2.2, grow: 1.4 },
  white: { add: false, col: [0.85, 0.86, 0.88], a: 0.38, size: [0.5, 1.0], life: [0.5, 1.0], up: 0.8, grow: 2 },
  fire: { add: true, col: [1, 0.5, 0.12], a: 0.9, size: [0.6, 1.5], life: [0.25, 0.6], up: 3, grow: 1.2 },
  hit: { add: true, col: [1, 0.95, 0.8], a: 1, size: [0.12, 0.3], life: [0.08, 0.16], up: 0.4, grow: 2 },
  splash: { add: false, col: [0.8, 0.92, 1], a: 0.6, size: [0.3, 0.8], life: [0.4, 0.8], up: 4, grow: 1, g: 9 },
};
class Puffs {
  constructor(scene, n, add) {
    this.n = n; this.i = 0; this.live = [];
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.u = { scale: { value: 600 } };
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec4 aCol; attribute float aSize; uniform float scale; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.25, d) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }',
    }));
    this.pts.frustumCulled = false; scene.add(this.pts);
    for (let k = 0; k < n; k++) this.live.push(null);
  }
  add(x, y, z, vx, vy, vz, K) {
    const k = this.i; this.i = (this.i + 1) % this.n;
    const life = K.life[0] + Math.random() * (K.life[1] - K.life[0]);
    this.live[k] = { x, y, z, vx, vy, vz, t: 0, life, s: K.size[0] + Math.random() * (K.size[1] - K.size[0]), K };
  }
  update(dt) {
    for (let k = 0; k < this.n; k++) {
      const p = this.live[k];
      if (!p) { this.size[k] = 0; continue; }
      p.t += dt; if (p.t >= p.life) { this.live[k] = null; this.size[k] = 0; continue; }
      const K = p.K, f = p.t / p.life;
      if (K.g) p.vy -= K.g * dt; else { p.vx *= 1 - 1.5 * dt; p.vz *= 1 - 1.5 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; }
      this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z;
      this.col[k * 4] = K.col[0]; this.col[k * 4 + 1] = K.col[1] * (K === KIND.fire ? 1 - f * 0.6 : 1); this.col[k * 4 + 2] = K.col[2]; this.col[k * 4 + 3] = K.a * (1 - f) * Math.min(1, f * 8 + 0.3);
      this.size[k] = p.s * (1 + K.grow * f);
    }
    const g = this.pts.geometry; g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }
}

export class Fx {
  constructor(scene) {
    this.scene = scene; this.soft = new Puffs(scene, 420, false); this.hot = new Puffs(scene, 320, true);
    const N = 56; this.tn = N; this.ti = 0; this.tp = new Float32Array(N * 6); this.tc = new Float32Array(N * 6); this.tl = new Float32Array(N); this.tcol = [];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.tp, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.tc, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.lines.frustumCulled = false; scene.add(this.lines);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,220,150,0.7)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.flashes = [0, 1, 2, 3, 4, 5, 6, 7].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.visible = false; s.userData.t = 0; scene.add(s); return s; });
    this.fi = 0; this.light = new THREE.PointLight(0xffa040, 0, 60, 1.5); scene.add(this.light); this.lt = 0;
    this.shake = 0;
  }
  tracer(x0, y0, z0, x1, y1, z1, bright = 1) {
    const k = this.ti; this.ti = (this.ti + 1) % this.tn;
    this.tp.set([x0, y0, z0, x1, y1, z1], k * 6); this.tl[k] = 0.085; this.tcol[k] = bright;
  }
  flash(x, y, z, s = 0.7) { const f = this.flashes[this.fi]; this.fi = (this.fi + 1) % this.flashes.length; f.position.set(x, y, z); f.scale.setScalar(s); f.visible = true; f.userData.t = 0.055; }
  puff(kind, x, y, z, n = 1, spread = 0.5, speed = 1) {
    const K = KIND[kind], P = K.add ? this.hot : this.soft;
    for (let k = 0; k < n; k++) P.add(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 2 * speed, K.up * (0.5 + Math.random()) * speed, (Math.random() - 0.5) * 2 * speed, K);
  }
  impact(x, y, z) { this.puff('hit', x, y, z, 2, 0.05, 0.4); this.puff('spark', x, y, z, 4, 0.1, 1.6); this.puff('dust', x, y, z, 2, 0.2, 0.5); }
  boom(x, z) {
    this.puff('fire', x, 1.2, z, 46, 3, 4.5); this.puff('smoke', x, 2, z, 34, 3.5, 2.6); this.puff('spark', x, 1.5, z, 40, 1.5, 7);
    this.flash(x, 1.6, z, 16); this.light.position.set(x, 3, z); this.light.intensity = 900; this.lt = 0.5;
  }
  update(dt) {
    this.soft.update(dt); this.hot.update(dt);
    for (let k = 0; k < this.tn; k++) { if (this.tl[k] > 0) this.tl[k] -= dt; const a = Math.max(0, this.tl[k] / 0.085) * (this.tcol[k] || 1); this.tc.set([a, a * 0.9, a * 0.6, a * 0.5, a * 0.42, a * 0.25], k * 6); }
    this.lines.geometry.attributes.position.needsUpdate = this.lines.geometry.attributes.color.needsUpdate = true;
    for (const f of this.flashes) if (f.visible) { f.userData.t -= dt; if (f.userData.t <= 0) f.visible = false; }
    if (this.lt > 0) { this.lt -= dt; this.light.intensity = 900 * Math.max(0, this.lt / 0.5) ** 2; } else this.light.intensity = 0;
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }
}
