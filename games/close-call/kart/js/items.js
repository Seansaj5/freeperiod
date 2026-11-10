// Items: the crystal item boxes, coins on the road, and what you can fire or drop.
//   nitro / nitro3 - a speed boost (three of them)      oil - a slick dropped behind you, spins out whoever hits it
//   ball - a bouncing ball fired straight ahead (rebounds off walls)   rocket - homes in on the kart in front
//   shield - a bubble that stops one hit   coins - three coins   overdrive - a long boost, untouchable, knocks karts away
import * as THREE from 'three';

export const ITEMS = {
  nitro: { name: 'Nitro' }, nitro3: { name: 'Triple Nitro' }, oil: { name: 'Oil Slick' }, ball: { name: 'Bouncer' },
  rocket: { name: 'Homing Rocket' }, shield: { name: 'Shield' }, coins: { name: 'Coin Bag' }, overdrive: { name: 'Overdrive' },
};
// chances by race position (1st, 2nd-3rd, 4th-5th, 6th-8th); the ones at the back get the good stuff
const TABLE = [
  { coins: 30, oil: 32, ball: 22, shield: 16 },
  { oil: 20, ball: 25, nitro: 20, rocket: 15, shield: 10, coins: 10 },
  { nitro: 25, rocket: 25, ball: 15, nitro3: 15, oil: 10, shield: 10 },
  { nitro3: 32, rocket: 26, overdrive: 18, nitro: 14, ball: 10 },
];
export function rollItem(place, count) {
  const b = place <= 1 ? 0 : place <= 3 ? 1 : place <= Math.ceil(count * 0.62) ? 2 : 3;
  const t = TABLE[b]; let r = Math.random() * Object.values(t).reduce((a, x) => a + x, 0);
  for (const [k, w] of Object.entries(t)) { r -= w; if (r <= 0) return k; }
  return 'nitro';
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

let oilTex = null;
function oilTexture() {
  if (oilTex) return oilTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9, r = 18 + (i % 3) * 8, px = 64 + Math.cos(a) * 20, py = 64 + Math.sin(a) * 20;
    const g = x.createRadialGradient(px, py, 0, px, py, r + 14); g.addColorStop(0, 'rgba(10,10,14,0.95)'); g.addColorStop(0.75, 'rgba(14,14,20,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r + 14, 0, 7); x.fill();
  }
  const sh = x.createLinearGradient(30, 30, 100, 100); sh.addColorStop(0, 'rgba(90,200,255,0.25)'); sh.addColorStop(0.5, 'rgba(255,200,90,0.18)'); sh.addColorStop(1, 'rgba(120,255,160,0.0)');
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = sh; x.fillRect(0, 0, 128, 128);
  oilTex = new THREE.CanvasTexture(c); oilTex.colorSpace = THREE.SRGBColorSpace;
  return oilTex;
}

export class Items {
  constructor(scene, track, env) {
    this.scene = scene; this.track = track;
    this.group = new THREE.Group(); scene.add(this.group);
    // ---- item crystals: a faceted glassy gem with a bright core
    this.boxes = [];
    for (const k of track.itemRows) {
      const hw = track.W[k], n = hw > 8 ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const d = (i / (n - 1) - 0.5) * 2 * (hw - 2.2);
        const p = track.point(k, d);
        this.boxes.push({ x: p.x, y: p.y + 1.1, z: p.z, k, d, t: 0, ph: Math.random() * 6 });
      }
    }
    const nb = this.boxes.length;
    this.gem = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0x9ae6ff, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55, envMap: env, envMapIntensity: 2.2, flatShading: true }), nb);
    this.core = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.4) }), nb);
    this.gem.frustumCulled = this.core.frustumCulled = false;
    this.group.add(this.gem, this.core);
    // ---- coins
    this.coins = [];
    for (const c of track.coinLines) {
      for (let i = 0; i < c.n; i++) {
        const k = track.w(c.k + i * 3), d = c.side * (track.W[k] - 2.5);
        const p = track.point(k, d);
        this.coins.push({ x: p.x, y: p.y + 0.75, z: p.z, t: 0 });
      }
    }
    const cg = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18); cg.rotateX(Math.PI / 2);
    this.coin = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 1, roughness: 0.25, emissive: 0x4a2a00, envMap: env, envMapIntensity: 1.6 }), Math.max(1, this.coins.length));
    this.coin.frustumCulled = false;
    this.group.add(this.coin);
    // ---- things in play
    this.shots = [];
    this.oilMat = new THREE.MeshStandardMaterial({ map: oilTexture(), transparent: true, depthWrite: false, roughness: 0.05, metalness: 0.4, envMap: env, envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -3 });
    this.ballMat = new THREE.MeshStandardMaterial({ color: 0x22e08a, emissive: 0x0a6a3a, roughness: 0.25, metalness: 0.3, envMap: env });
    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0xe8322a, roughness: 0.35, metalness: 0.5, envMap: env });
    this.finMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.4, metalness: 0.2, envMap: env });
    this.flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.3, 0.3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.loc = {};
  }

  /** Spin the crystals and coins; bring taken ones back. */
  update(dt, time) {
    this.boxes.forEach((b, i) => {
      if (b.t > 0) b.t -= dt;
      const grow = b.t > 0 ? Math.max(0, 1 - b.t / 0.4) * (b.t < 0.4 ? 1 : 0) : 1;
      if (b.t > 0 && b.t >= 0.4) { this.gem.setMatrixAt(i, ZERO); this.core.setMatrixAt(i, ZERO); return; }
      const y = b.y + Math.sin(time * 2 + b.ph) * 0.18;
      Q.setFromEuler(E.set(time * 0.9 + b.ph, time * 1.3 + b.ph, 0));
      M4.compose(P.set(b.x, y, b.z), Q, S.setScalar(grow)); this.gem.setMatrixAt(i, M4);
      Q.setFromEuler(E.set(-time * 2, time * 2.6, 0));
      M4.compose(P, Q, S.setScalar(grow * (1 + Math.sin(time * 6 + b.ph) * 0.15))); this.core.setMatrixAt(i, M4);
    });
    this.gem.instanceMatrix.needsUpdate = true; this.core.instanceMatrix.needsUpdate = true;
    this.coins.forEach((c, i) => {
      if (c.t > 0) { c.t -= dt; this.coin.setMatrixAt(i, ZERO); return; }
      Q.setFromEuler(E.set(0, time * 3 + i, 0));
      M4.compose(P.set(c.x, c.y + Math.sin(time * 3 + i) * 0.1, c.z), Q, S.setScalar(1)); this.coin.setMatrixAt(i, M4);
    });
    this.coin.instanceMatrix.needsUpdate = true;
  }

  /** Did this kart drive through a crystal or coins? Returns { box, coins }. */
  pickups(kart) {
    const out = { box: null, coins: 0 }, p = kart.pos;
    for (const b of this.boxes) {
      if (b.t > 0) continue;
      const dx = p.x - b.x, dz = p.z - b.z, dy = p.y + 0.5 - b.y;
      if (dx * dx + dz * dz < 2.6 && Math.abs(dy) < 2) { b.t = 2.6; out.box = b; }
    }
    for (const c of this.coins) {
      if (c.t > 0) continue;
      const dx = p.x - c.x, dz = p.z - c.z, dy = p.y + 0.5 - c.y;
      if (dx * dx + dz * dz < 2.2 && Math.abs(dy) < 1.8) { c.t = 40; out.coins++; }
    }
    return out;
  }

  // ---------------------------------------------------------------- shots
  dropOil(kart) {
    const fx = Math.sin(kart.yaw), fz = Math.cos(kart.yaw);
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), this.oilMat);
    m.geometry.rotateX(-Math.PI / 2);
    const x = kart.pos.x - fx * 2.4, z = kart.pos.z - fz * 2.4;
    const L = this.track.locate(x, z, kart.hint, {});
    if (L.gap) return; // over the gap it just falls away
    m.position.set(x, L.y + L.ramp + 0.04, z);
    m.rotation.y = Math.random() * 6; m.scale.setScalar(0.2);
    this.group.add(m);
    this.shots.push({ kind: 'oil', mesh: m, x, z, k: L.k, life: 40, owner: kart, safe: 0.6, grow: 0 });
  }

  /** The bouncing ball, straight ahead (or straight back). */
  fireBall(kart, back = false) {
    const d = back ? -1 : 1, fx = Math.sin(kart.yaw) * d, fz = Math.cos(kart.yaw) * d;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), this.ballMat);
    this.group.add(m);
    const sp = back ? 34 : Math.max(36, kart.v + 16);
    this.shots.push({ kind: 'ball', mesh: m, x: kart.pos.x + fx * 2.4, z: kart.pos.z + fz * 2.4, vx: fx * sp, vz: fz * sp, k: kart.hint, life: 7, owner: kart, safe: 0.3, bounces: 0 });
  }

  /** An oil drum or the ball dragged behind a kart while its item button is held. */
  trailFor(kart, i, time) {
    this.trails = this.trails || [];
    let t = this.trails[i];
    if (!kart.trail) { if (t) t.visible = false; return; }
    if (!t || t.userData.kind !== kart.trail) {
      if (t) { t.removeFromParent(); t.traverse((o) => o.geometry && o.geometry.dispose()); }
      if (kart.trail === 'ball') t = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), this.ballMat);
      else {
        t = new THREE.Group();
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0x1a1c24, roughness: 0.35, metalness: 0.6 }));
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 6, 20), this.finMat); band.rotation.x = Math.PI / 2;
        const drip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.05, metalness: 0.5 }));
        drip.position.set(0, 0.42, 0); drip.scale.y = 0.5;
        t.add(drum, band, drip);
      }
      t.userData.kind = kart.trail; this.trails[i] = t; this.group.add(t);
    }
    t.visible = true;
    const fx = Math.sin(kart.yaw), fz = Math.cos(kart.yaw);
    t.position.set(kart.pos.x - fx * 1.9, kart.pos.y + 0.45 + Math.abs(Math.sin(time * 9 + i)) * 0.12, kart.pos.z - fz * 1.9);
    t.rotation.set(kart.trail === 'ball' ? time * 10 : 0.3, kart.yaw, 0);
  }

  fireRocket(kart, target) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.2, 12), this.rocketMat); body.rotation.x = Math.PI / 2; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12), this.finMat); nose.rotation.x = Math.PI / 2; nose.position.z = 0.82; g.add(nose);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.36), this.finMat); f.rotation.z = (i * Math.PI) / 2; f.position.z = -0.48; f.position.y = 0; f.translateY(0.24); g.add(f); }
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 10), this.flameMat); fl.rotation.x = -Math.PI / 2; fl.position.z = -1.05; g.add(fl);
    this.group.add(g);
    const fx = Math.sin(kart.yaw), fz = Math.cos(kart.yaw);
    this.shots.push({ kind: 'rocket', mesh: g, x: kart.pos.x + fx * 2.4, z: kart.pos.z + fz * 2.4, y: kart.pos.y + 0.8, k: kart.hint, d: kart.loc.d, life: 10, owner: kart, target, safe: 0.4, yaw: kart.yaw });
  }

  /** Move the shots and check them against the karts. onHit(kart, shot). */
  updateShots(dt, karts, onHit, time) {
    const t = this.track, L = this.loc;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt; if (s.safe > 0) s.safe -= dt;
      if (s.kind === 'oil') {
        s.grow = Math.min(1, s.grow + dt * 4); s.mesh.scale.setScalar(0.2 + s.grow * 0.8);
      } else if (s.kind === 'ball') {
        s.x += s.vx * dt; s.z += s.vz * dt;
        t.locate(s.x, s.z, s.k, L); s.k = L.k;
        const edge = t.wallAt(L) - 0.6;
        if (!L.gap && Math.abs(L.d) > edge) { // bounce: reflect off the wall
          const sg = Math.sign(L.d), nx = -L.tz * sg, nz = L.tx * sg, dot = s.vx * nx + s.vz * nz;
          if (dot > 0) { s.vx -= 2 * dot * nx; s.vz -= 2 * dot * nz; s.bounces++; }
          s.x -= nx * (Math.abs(L.d) - edge); s.z -= nz * (Math.abs(L.d) - edge);
        }
        if (L.gap) s.life = Math.min(s.life, 0.01);
        s.mesh.position.set(s.x, L.y + L.ramp + 0.55 + Math.abs(Math.sin(time * 9 + i)) * 0.4, s.z);
        s.mesh.rotation.x += dt * 14;
      } else if (s.kind === 'rocket') {
        const tg = s.target && !s.target.finished ? s.target : null;
        const sp = 52;
        let tx, tz;
        const near = tg && Math.hypot(tg.pos.x - s.x, tg.pos.z - s.z) < 22;
        if (near) { tx = tg.pos.x; tz = tg.pos.z; } else {
          // follow the track ahead, drifting over to the target's side of the road
          const kk = t.w(s.k + 8);
          s.d += ((tg ? tg.loc.d : 0) - s.d) * Math.min(1, dt * 1.5);
          const p = t.point(kk, s.d * 0.8); tx = p.x; tz = p.z;
        }
        const want = Math.atan2(tx - s.x, tz - s.z);
        let da = want - s.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        s.yaw += Math.max(-6 * dt, Math.min(6 * dt, da));
        s.x += Math.sin(s.yaw) * sp * dt; s.z += Math.cos(s.yaw) * sp * dt;
        t.locate(s.x, s.z, s.k, L, 30); s.k = L.k;
        const gy = (L.gap ? L.cy : L.y + L.ramp) + 0.9;
        s.y += (gy - s.y) * Math.min(1, dt * 6);
        s.mesh.position.set(s.x, s.y, s.z); s.mesh.rotation.y = s.yaw;
        s.mesh.children[s.mesh.children.length - 1].scale.set(1, 0.7 + Math.random() * 0.6, 1);
        if (!tg && s.life < 6) s.life = Math.min(s.life, 2);
      }
      // hits
      let hitK = null;
      for (const k of karts) {
        if (k.respawnT > 0 || (k === s.owner && s.safe > 0)) continue;
        const dx = k.pos.x - s.x, dz = k.pos.z - s.z, r = s.kind === 'oil' ? 1.5 : s.kind === 'ball' ? 1.3 : 1.6;
        const sy = s.kind === 'oil' ? k.pos.y - s.mesh.position.y : k.pos.y + 0.5 - s.mesh.position.y;
        if (dx * dx + dz * dz < r * r && Math.abs(sy) < (s.kind === 'oil' ? 0.9 : 1.6)) { hitK = k; break; }
      }
      if (hitK) { onHit(hitK, s); s.life = 0; }
      if (s.life <= 0) { s.mesh.removeFromParent(); s.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.shots.splice(i, 1); }
    }
  }

  /** Shots near a sample (for the computer drivers to steer round oil). */
  oilNear(k, ahead) {
    const out = [];
    for (const s of this.shots) if (s.kind === 'oil') { const dk = this.track.w(s.k - k); if (dk < ahead) out.push(s); }
    return out;
  }

  dispose() {
    for (const s of this.shots) s.mesh.removeFromParent();
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    this.group.removeFromParent();
  }
}
