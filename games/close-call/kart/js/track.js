// A built track: the centre line sampled every metre (position, direction, width, banking), the meshes
// (road, curbs, grass, walls, ramps, dash pads, start gate, scenery) and the questions the karts ask
// every frame: where am I along the lap, how far off the middle, how high is the ground here.
import * as THREE from 'three';
import { THEMES } from './tracks.js';
import { buildCosmic } from './cosmic.js';

const STEP = 1; // metres between samples
const CURB = 1.2, SHOULDER = 5, WALL_H = 1.1;

function rng(seed) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noisy(x, w, h, cols, n, r0, r1, seed = 1) {
  const R = rng(seed);
  x.fillStyle = cols[0]; x.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { x.fillStyle = cols[1 + (i % (cols.length - 1))]; x.globalAlpha = 0.25 + R() * 0.4; const r = r0 + R() * (r1 - r0); x.beginPath(); x.arc(R() * w, R() * h, r, 0, 7); x.fill(); }
  x.globalAlpha = 1;
}
function roadTex(th) {
  return canvasTex(256, 256, (x, w, h) => {
    noisy(x, w, h, [th.road, '#2c2f36', '#4a4e58', '#33363e'], 2600, 0.5, 2.2, 7);
    x.fillStyle = 'rgba(255,255,255,0.75)';
    for (const u of [0.02, 0.98]) x.fillRect(u * w - 2, 0, 4, h); // edge lines
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(w / 2 - 2, 0, 4, h * 0.45); // faint centre dashes
  });
}
const curbTex = (th) => canvasTex(64, 64, (x, w, h) => { x.fillStyle = th.curb[0]; x.fillRect(0, 0, w, h / 2); x.fillStyle = th.curb[1]; x.fillRect(0, h / 2, w, h / 2); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, 0, 6, h); });
const groundTex = (cols, seed) => canvasTex(256, 256, (x, w, h) => noisy(x, w, h, cols, 1800, 1, 5, seed));
const wallTex = (th) => canvasTex(128, 64, (x, w, h) => {
  x.fillStyle = th.wall[0]; x.fillRect(0, 0, w, h);
  x.fillStyle = th.wall[1]; x.fillRect(0, 0, w / 2, h);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, h - 8, w, 8); x.fillRect(0, 0, w, 4);
});
const padTex = () => canvasTex(128, 256, (x, w, h) => {
  x.fillStyle = '#0a1a2a'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    const y = i * (h / 3) + 10;
    const g = x.createLinearGradient(0, y, 0, y + 70); g.addColorStop(0, '#fff6c0'); g.addColorStop(1, '#ff8a1a');
    x.fillStyle = g; x.beginPath(); x.moveTo(w / 2, y); x.lineTo(w - 14, y + 50); x.lineTo(w - 14, y + 74); x.lineTo(w / 2, y + 26); x.lineTo(14, y + 74); x.lineTo(14, y + 50); x.closePath(); x.fill();
  }
  x.strokeStyle = '#ffc21a'; x.lineWidth = 6; x.strokeRect(3, -10, w - 6, h + 20);
});
const glideTex = () => canvasTex(128, 256, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#0a3a5a'); g.addColorStop(0.5, '#1a8ad0'); g.addColorStop(1, '#0a3a5a');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(200,250,255,0.9)';
  for (let i = 0; i < 4; i++) { const y = i * 64 + 8; x.beginPath(); x.moveTo(w / 2, y); x.lineTo(w - 20, y + 40); x.lineTo(w / 2, y + 26); x.lineTo(20, y + 40); x.closePath(); x.fill(); }
});
const checkerTex = () => canvasTex(128, 32, (x, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; x.fillRect(i * 8, j * 8, 8, 8); } });
function windowsTex() {
  return canvasTex(128, 256, (x, w, h) => {
    const R = rng(3);
    x.fillStyle = '#0c1018'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 32; r++) for (let c = 0; c < 8; c++) {
      if (R() < 0.45) continue;
      const k = R(); x.fillStyle = k < 0.6 ? '#ffd890' : k < 0.85 ? '#9ad8ff' : '#ffffff';
      x.globalAlpha = 0.5 + R() * 0.5; x.fillRect(c * 16 + 3, r * 8 + 2, 10, 4);
    }
    x.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------- track
export class Track {
  constructor(def, quality = 'high') {
    this.def = def; this.theme = THEMES[def.theme];
    this.hi = quality === 'high';
    this.laps = def.laps || 3;
    this.void = !!def.void; // nothing under you off the road: drive off an edge with no rail and you fall
    this.sample();
    this.group = new THREE.Group();
    this.anim = []; // things that animate (dash pad arrows)
  }

  // ---- centre line
  sample() {
    const def = this.def, n = def.pts.length;
    const pts = def.pts.map(([x, z, y]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const M = n * 80, P = [], L = [0];
    for (let i = 0; i <= M; i++) { P.push(curve.getPoint(i / M)); if (i) L.push(L[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z)); }
    const total = L[M], N = Math.round(total / STEP);
    this.N = N; this.len = total;
    const X = (this.X = new Float32Array(N)), Y = (this.Y = new Float32Array(N)), Z = (this.Z = new Float32Array(N));
    const T = (this.T = new Float32Array(N)), W = (this.W = new Float32Array(N));
    let j = 0;
    for (let k = 0; k < N; k++) {
      const s = (k / N) * total;
      while (j < M - 1 && L[j + 1] < s) j++;
      const f = (s - L[j]) / Math.max(1e-6, L[j + 1] - L[j]);
      X[k] = P[j].x + (P[j + 1].x - P[j].x) * f; Y[k] = P[j].y + (P[j + 1].y - P[j].y) * f; Z[k] = P[j].z + (P[j + 1].z - P[j].z) * f;
      const t = ((j + f) / M) * n; T[k] = t; // control-point parameter (for placing features)
      const i0 = Math.floor(t) % n, i1 = (i0 + 1) % n, ft = t - Math.floor(t);
      const sm = ft * ft * (3 - 2 * ft);
      W[k] = def.pts[i0][3] + (def.pts[i1][3] - def.pts[i0][3]) * sm;
    }
    // the start line goes where the track says (on a straight), so sample 0 is there
    if (def.start) {
      let k0 = 0, bd = 1e9;
      for (let k = 0; k < N; k++) { let d = Math.abs(T[k] - def.start); d = Math.min(d, n - d); if (d < bd) { bd = d; k0 = k; } }
      for (const A of [X, Y, Z, T, W]) { const c = A.slice(); for (let k = 0; k < N; k++) A[k] = c[(k + k0) % N]; }
    }
    // direction, right vector and curvature
    const TX = (this.TX = new Float32Array(N)), TZ = (this.TZ = new Float32Array(N)), H = new Float32Array(N), K = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const a = (k - 1 + N) % N, b = (k + 1) % N;
      const dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz) || 1;
      TX[k] = dx / l; TZ[k] = dz / l; H[k] = Math.atan2(TX[k], TZ[k]);
    }
    for (let k = 0; k < N; k++) K[k] = wrap(H[(k + 3) % N] - H[(k - 3 + N) % N]) / (6 * STEP);
    // banking (outside of a bend higher) and the racing line (cut to the inside), both smoothed
    const bankK = (def.bank || 1) * 5;
    const B = (this.B = new Float32Array(N)), LINE = (this.LINE = new Float32Array(N));
    const sm = (src, r) => { const out = new Float32Array(N); for (let k = 0; k < N; k++) { let s = 0; for (let i = -r; i <= r; i++) s += src[(k + i + N) % N]; out[k] = s / (2 * r + 1); } return out; };
    const Ks = sm(K, 8);
    const bMax = def.bankMax || 0.2;
    for (let k = 0; k < N; k++) B[k] = Math.max(-bMax, Math.min(bMax, Ks[k] * bankK));
    if (def.bankSmooth) B.set(sm(sm(B, def.bankSmooth), def.bankSmooth)); // ease the lean in and out (no twisting road)
    const raw = new Float32Array(N);
    // look a little ahead so the line starts moving inside before the bend
    for (let k = 0; k < N; k++) { const c = Ks[(k + 10) % N]; raw[k] = Math.max(-0.55, Math.min(0.55, -c * 18)) * W[k]; }
    LINE.set(sm(sm(raw, 14), 14));
    this.curv = Ks;
    // how far out the walls are each side; on the inside of a tight bend they come in so nothing folds over
    const K4 = sm(K, 3), EL = (this.EL = new Float32Array(N)), ER = (this.ER = new Float32Array(N));
    for (let k = 0; k < N; k++) {
      const full = W[k] + CURB + (this.void ? 0.5 : SHOULDER), r = 0.8 / Math.max(1e-4, Math.abs(K4[k])), inner = Math.max(W[k] + CURB + (this.void ? 0.5 : 0.6), Math.min(full, r));
      EL[k] = K4[k] > 0 ? inner : full; ER[k] = K4[k] < 0 ? inner : full;
    }
    const minF = (A, r) => { const c = A.slice(); for (let k = 0; k < N; k++) { let m = 1e9; for (let i = -r; i <= r; i++) m = Math.min(m, c[(k + i + N) % N]); A[k] = m; } };
    minF(EL, 6); minF(ER, 6); EL.set(sm(EL, 5)); ER.set(sm(ER, 5));
    // rails along the edges (every track has them all the way round except where `open` says)
    this.RL = new Uint8Array(N).fill(1); this.RR = new Uint8Array(N).fill(1);
    for (const [t0, t1, side] of def.open || []) for (let k = 0; k < N; k++) {
      const t = T[k]; if (t0 <= t1 ? t >= t0 && t <= t1 : t >= t0 || t <= t1) { if (side <= 0) this.RL[k] = 0; if (side >= 0) this.RR[k] = 0; }
    }
    // features
    const at = (t) => { // control parameter -> nearest sample
      let best = 0, bd = 1e9;
      for (let k = 0; k < N; k++) { let d = Math.abs(T[k] - t); d = Math.min(d, n - d); if (d < bd) { bd = d; best = k; } }
      return best;
    };
    this.at = at;
    this.GAP = new Uint8Array(N);
    this.glide = null;
    if (def.glide) {
      const a = at(def.glide[0]), b = at(def.glide[1]);
      this.glide = { ramp: a, land: b, len: 12 };
      for (let k = a + 1; k !== b; k = (k + 1) % N) this.GAP[k] = 1;
    }
    this.ramps = (def.ramps || []).map((t) => ({ k: at(t), len: 7, h: 1.0 }));
    this.pads = (def.boost || []).map(([t, side]) => ({ k: at(t), side, len: 7, w: 3.4 }));
    this.itemRows = (def.items || []).map(at);
    this.coinLines = (def.coins || []).map(([t, side, cnt]) => ({ k: at(t), side, n: cnt }));
    // ramp heights added to the ground (smooth wedge, then a lip)
    this.RAMP = new Float32Array(N);
    const addRamp = (k0, len, h) => { for (let i = 0; i <= len; i++) { const k = (k0 - len + i + N) % N; this.RAMP[k] = Math.max(this.RAMP[k], h * Math.pow(i / len, 1.4)); } };
    for (const r of this.ramps) addRamp(r.k, r.len, r.h);
    if (this.glide) addRamp(this.glide.ramp, this.glide.len, 1.8);
  }

  /** Index wrap. */
  w(k) { return ((k % this.N) + this.N) % this.N; }

  /**
   * Where (x, z) is relative to the track, searching near the last known sample `hint`.
   * Fills `o`: k (sample), f (0..1 to the next), s (k + f), d (metres right of centre), y (ground height there, no ramps),
   * hw (road half width), gap (over the glide gap), ramp (ramp height), bank.
   */
  locate(x, z, hint, o, span = 26) {
    const N = this.N, X = this.X, Z = this.Z;
    let best = hint, bd = 1e12;
    for (let i = -span; i <= span; i++) {
      const k = (hint + i + N) % N, dx = x - X[k], dz = z - Z[k], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = k; }
    }
    // the segment best -> best+1 or best-1 -> best, whichever the point projects onto
    let k = best, dx = x - X[k], dz = z - Z[k];
    let f = dx * this.TX[k] + dz * this.TZ[k];
    if (f < 0) { k = (k - 1 + N) % N; dx = x - X[k]; dz = z - Z[k]; f = dx * this.TX[k] + dz * this.TZ[k]; }
    f = Math.max(0, Math.min(1, f / STEP));
    const k1 = (k + 1) % N;
    const tx = this.TX[k] + (this.TX[k1] - this.TX[k]) * f, tz = this.TZ[k] + (this.TZ[k1] - this.TZ[k]) * f;
    const tl = Math.hypot(tx, tz) || 1;
    const cx = X[k] + (X[k1] - X[k]) * f, cz = Z[k] + (Z[k1] - Z[k]) * f;
    o.k = k; o.f = f; o.s = k + f;
    o.tx = tx / tl; o.tz = tz / tl;
    o.d = (x - cx) * (-o.tz) + (z - cz) * o.tx;
    o.bank = this.B[k] + (this.B[k1] - this.B[k]) * f;
    o.hw = this.W[k] + (this.W[k1] - this.W[k]) * f;
    o.cy = this.Y[k] + (this.Y[k1] - this.Y[k]) * f;
    o.y = o.cy + o.d * o.bank;
    o.ramp = this.RAMP[k] + (this.RAMP[k1] - this.RAMP[k]) * f;
    o.gap = this.GAP[k] && this.GAP[k1] ? 1 : 0;
    o.el = this.EL[k] + (this.EL[k1] - this.EL[k]) * f; o.er = this.ER[k] + (this.ER[k1] - this.ER[k]) * f;
    o.rl = this.RL[k] && this.RL[k1]; o.rr = this.RR[k] && this.RR[k1];
    return o;
  }

  /** World position of (sample k, d metres right of centre), on the road surface. */
  point(k, d, out = new THREE.Vector3()) {
    k = this.w(Math.round(k));
    return out.set(this.X[k] - this.TZ[k] * d, this.Y[k] + d * this.B[k] + this.RAMP[k], this.Z[k] + this.TX[k] * d);
  }
  heading(k) { k = this.w(Math.round(k)); return Math.atan2(this.TX[k], this.TZ[k]); }
  /** Total edge: past this many metres from the middle is the wall (the most it can be; see EL / ER). */
  edge(hw) { return hw + CURB + SHOULDER; }
  /** The wall on the side of d, from a locate() result (none where that side has no rail). */
  wallAt(L) { return L.d < 0 ? (L.rl ? L.el : 1e4) : (L.rr ? L.er : 1e4); }
  /** Where the drivable surface ends on the side of d: the wall, or on a void track the road's edge. */
  edgeAt(L) { return L.d < 0 ? L.el : L.er; }
  /** Is there ground under this spot? (Not over the glide gap, and not past the edge of a void track.) */
  solidAt(L) { return !L.gap && !(this.void && Math.abs(L.d) > this.edgeAt(L) + 0.25); }
  get curb() { return CURB; }

  // ---------------------------------------------------------------- meshes
  /** A strip along the track between two lateral offsets (functions of the sample), at height offsets; skips the
   *  glide gap and, if `keep` is given, any segment it says no to. */
  ribbon(dA, dB, mat, vScale, uA = 0, uB = 1, yA = 0, yB = 0, skipGap = true, withRamp = true, keep = null) {
    const N = this.N, pos = [], uv = [], idx = [];
    let v = 0;
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const a = dA(i), b = dB(i);
      const r = withRamp ? this.RAMP[i] : 0;
      for (const [d, u, yo] of [[a, uA, yA], [b, uB, yB]]) {
        pos.push(this.X[i] - this.TZ[i] * d, this.Y[i] + d * this.B[i] + r + yo, this.Z[i] + this.TX[i] * d);
        uv.push(u, v);
      }
      v += STEP / vScale;
      const j = (i + 1) % N;
      if (k < N && !(skipGap && (this.GAP[i] || this.GAP[j])) && (!keep || (keep(i) && keep(j)))) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    this.group.add(m);
    return m;
  }

  build(env) {
    if (this.theme.cosmic) return buildCosmic(this, env);
    const th = this.theme, N = this.N, G = this.group, hi = this.hi;
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0, envMap: env, envMapIntensity: 0.35 }, o));
    const lam = (o) => (hi ? std(o) : new THREE.MeshLambertMaterial(o));
    const ribbon = (...a) => this.ribbon(...a);
    const W = this.W;
    // road
    const road = lam({ map: roadTex(th) });
    ribbon((i) => -W[i], (i) => W[i], road, 14);
    // curbs and shoulders
    const curb = lam({ map: curbTex(th) });
    ribbon((i) => -W[i] - CURB, (i) => -W[i], curb, 3.2);
    ribbon((i) => W[i], (i) => W[i] + CURB, curb, 3.2);
    const sh = lam({ map: groundTex(th.shoulder, 11) });
    sh.map.repeat.set(1, 1);
    const EL = this.EL, ER = this.ER;
    ribbon((i) => -EL[i], (i) => -W[i] - CURB, sh, 6, 0, 1, -0.02, 0);
    ribbon((i) => W[i] + CURB, (i) => ER[i], sh, 6, 0, 1, 0, -0.02);
    // walls on both edges (inner faces + tops); dark skirts below the road when it is raised
    const wall = lam({ map: wallTex(th), side: THREE.DoubleSide });
    if (th.glowWall) { wall.emissive = new THREE.Color(0x1a4a80); wall.emissiveIntensity = 0.6; }
    for (const s of [-1, 1]) this.wallRibbon((i) => (s < 0 ? -EL[i] : ER[i]), wall);
    const skirt = lam({ color: this.def.theme === 'skyway' ? 0x1a1e28 : 0x5a5048, side: THREE.DoubleSide });
    for (const s of [-1, 1]) this.skirt((i) => (s < 0 ? -EL[i] : ER[i]), skirt);
    if (th.glowWall) { // a neon strip along the wall tops
      const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.4, 2.4) });
      for (const s of [-1, 1]) ribbon((i) => (s < 0 ? -EL[i] : ER[i]) - 0.12, (i) => (s < 0 ? -EL[i] : ER[i]) + 0.12, neon, 1, 0, 1, WALL_H + 0.02, WALL_H + 0.02, true, false);
    }
    this.buildRamps(); this.buildPads(); this.buildGate(); this.buildGround(env); this.buildScenery(env);
  }

  wallRibbon(e, mat) {
    const N = this.N, pos = [], uv = [], idx = [];
    let v = 0;
    for (let k = 0; k <= N; k++) {
      const i = k % N, d = e(i), y = this.Y[i] + d * this.B[i];
      const x = this.X[i] - this.TZ[i] * d, z = this.Z[i] + this.TX[i] * d;
      pos.push(x, y - 0.1, z, x, y + WALL_H, z); uv.push(v, 0, v, 1);
      v += STEP / 4;
      if (k < N && !(this.GAP[i] || this.GAP[(i + 1) % N])) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    this.group.add(new THREE.Mesh(g, mat));
  }

  skirt(e, mat) {
    const N = this.N, pos = [], idx = [];
    for (let k = 0; k <= N; k++) {
      const i = k % N, d = e(i), y = this.Y[i] + d * this.B[i];
      const x = this.X[i] - this.TZ[i] * d, z = this.Z[i] + this.TX[i] * d;
      pos.push(x, y - 0.1, z, x, -1.5, z);
      if (k < N && !(this.GAP[i] || this.GAP[(i + 1) % N]) && this.Y[i] > 0.4) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    this.group.add(new THREE.Mesh(g, mat));
  }

  /** Jump ramps and the glider ramp: a wedge you can see (the ground height already rises in RAMP). */
  buildRamps() {
    const N = this.N;
    const mk = (k0, len, tex, w) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= len; i++) {
        const k = (k0 - len + i + N) % N, hw = this.W[k] * w;
        for (const [d, u] of [[-hw, 0], [hw, 1]]) {
          pos.push(this.X[k] - this.TZ[k] * d, this.Y[k] + d * this.B[k] + this.RAMP[k] + 0.03, this.Z[k] + this.TX[k] * d);
          uv.push(u, i / len);
        }
        if (i < len) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      // the front face of the lip
      const k = k0 % N, hw = this.W[k] * w, base = pos.length / 3;
      for (const d of [-hw, hw]) { pos.push(this.X[k] - this.TZ[k] * d, this.Y[k] + d * this.B[k] - 0.5, this.Z[k] + this.TX[k] * d); uv.push(0, 0); }
      idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      this.group.add(m);
      return m;
    };
    const pt = padTex();
    for (const r of this.ramps) mk(r.k, r.len, pt, 0.55);
    if (this.glide) {
      const gt = glideTex(); gt.repeat.set(1, 2);
      mk(this.glide.ramp, this.glide.len, gt, 0.95);
      this.anim.push((t) => { gt.offset.y = -t * 1.4; });
      // glowing hoops over the gap so you know where to steer
      const hoopMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.8, 2.6), transparent: true, opacity: 0.85 });
      const span = (this.glide.land - this.glide.ramp + N) % N;
      for (let j = 1; j <= 3; j++) {
        const k = (this.glide.ramp + Math.round((span * j) / 4)) % N;
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(this.W[k] * 0.85, 0.25, 8, 40), hoopMat);
        const y = this.Y[this.glide.ramp] + 2.5 - (this.Y[this.glide.ramp] - this.Y[this.glide.land]) * (j / 4) * 0.8;
        hoop.position.set(this.X[k], y + 2, this.Z[k]);
        hoop.rotation.y = Math.atan2(this.TX[k], this.TZ[k]);
        this.group.add(hoop);
      }
    }
  }

  buildPads() {
    const tex = padTex();
    for (const p of this.pads) {
      const k = p.k, hw = this.W[k];
      const d = p.side * (hw - p.w / 2 - 0.5);
      p.d = d;
      const g = new THREE.PlaneGeometry(p.w, p.len); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      const c = this.point(k, d);
      m.position.set(c.x, c.y + 0.04, c.z);
      m.rotation.order = 'YXZ'; m.rotation.y = this.heading(k); m.rotation.z = -Math.atan(this.B[k]);
      this.group.add(m);
    }
    tex.repeat.set(1, 1.5);
    this.anim.push((t) => { tex.offset.y = -t * 2.2; });
  }

  /** Start/finish: checkered line, a gantry with the start lights. */
  buildGate() {
    const k = 0, hw = Math.min(this.EL[0], this.ER[0]);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.W[k] * 2, 2.2), new THREE.MeshBasicMaterial({ map: checkerTex(), polygonOffset: true, polygonOffsetFactor: -2 }));
    line.geometry.rotateX(-Math.PI / 2);
    const c = this.point(k, 0);
    line.position.set(c.x, c.y + 0.03, c.z); line.rotation.y = this.heading(k);
    this.group.add(line);
    const gate = new THREE.Group();
    gate.position.set(c.x, c.y, c.z); gate.rotation.y = this.heading(k);
    const dark = new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.5, metalness: 0.6 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), dark); p.position.set(s * (hw - 0.6), 4, 0); gate.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 1.6, 0.9), dark); beam.position.y = 8.2; gate.add(beam);
    // banner: our own lettering
    const tex = canvasTex(512, 64, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#ff7a1a'); g.addColorStop(1, '#ffc21a');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#1a0f00'; x.font = '900 40px Bungee, Outfit, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('CLOSE CALL KARTS', w / 2, h / 2 + 2);
    }, false);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(hw * 1.4, hw * 1.4 / 8), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    ban.position.set(0, 8.2, -0.47); ban.rotation.y = Math.PI; gate.add(ban);
    const ban2 = ban.clone(); ban2.position.z = 0.47; ban2.rotation.y = 0; gate.add(ban2);
    // five start lights facing the grid
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      m.position.set((i - 1.5) * 1.3, 6.6, -0.5); gate.add(m); this.lights.push(m);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.3, 0.5), dark); box.position.set(0, 6.6, -0.2); gate.add(box);
    this.group.add(gate);
  }
  /** n lights lit red (1..3), or all green (4). */
  setLights(n) {
    if (!this.lights) return;
    this.lights.forEach((m, i) => {
      const on = n >= 4 || i < n;
      m.material.color.setRGB(on ? (n >= 4 ? 0.2 : 2.4) : 0.08, on ? (n >= 4 ? 2.4 : 0.15) : 0.08, on ? (n >= 4 ? 0.5 : 0.1) : 0.08);
    });
  }

  buildGround(env) {
    const th = this.theme;
    const tex = groundTex(th.ground, 5); tex.repeat.set(120, 120);
    const mat = this.hi ? new THREE.MeshStandardMaterial({ map: tex, roughness: 1, envMap: env, envMapIntensity: 0.2 }) : new THREE.MeshLambertMaterial({ map: tex });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), mat);
    g.rotation.x = -Math.PI / 2; g.position.y = -0.4;
    this.group.add(g);
    if (this.glide) { // water / a dark chasm under the glide
      const a = this.glide.ramp, b = this.glide.land, N = this.N;
      let cx = 0, cz = 0, n = 0;
      for (let k = a; k !== b; k = (k + 1) % N) { cx += this.X[k]; cz += this.Z[k]; n++; }
      const span = n;
      const water = new THREE.Mesh(new THREE.CircleGeometry(span * 0.62, 40), new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.08, metalness: 0.3, envMap: env, envMapIntensity: 1.2 }));
      water.rotation.x = -Math.PI / 2; water.position.set(cx / n, -0.3, cz / n); water.scale.y = 0.75;
      water.rotation.z = -this.heading((a + Math.round(span / 2)) % N) + Math.PI / 2;
      this.group.add(water);
    }
  }

  // ---------------------------------------------------------------- scenery (instanced)
  /** Random spots near the track but clear of it. */
  spots(n, dMin, dMax, seed) {
    const R = rng(seed), out = [], N = this.N;
    for (let tries = 0; out.length < n && tries < n * 8; tries++) {
      const k = Math.floor(R() * N), side = R() < 0.5 ? -1 : 1;
      const d = side * (this.W[k] + CURB + SHOULDER + dMin + R() * (dMax - dMin));
      const x = this.X[k] - this.TZ[k] * d, z = this.Z[k] + this.TX[k] * d;
      let ok = true;
      for (let j = 0; j < N; j += 3) { const dx = x - this.X[j], dz = z - this.Z[j], lim = this.W[j] + CURB + SHOULDER + dMin * 0.8; if (dx * dx + dz * dz < lim * lim) { ok = false; break; } }
      if (ok) out.push([x, z, R(), k]);
    }
    return out;
  }
  inst(geo, mat, list, place) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
    list.forEach((it, i) => { const [x, y, z, ry, sx, sy, sz] = place(it); Q.setFromEuler(E.set(0, ry, 0)); M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz)); m.setMatrixAt(i, M); });
    m.instanceMatrix.needsUpdate = true;
    this.group.add(m);
    return m;
  }

  buildScenery(env) {
    const th = this.def.theme, hi = this.hi, EL = this.EL, ER = this.ER;
    const mat = (c, o = {}) => (hi ? new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, envMap: env, envMapIntensity: 0.4, flatShading: true }, o)) : new THREE.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, o)));
    const yAt = (k) => Math.min(0, this.Y[k]) - 0.4;
    // the road is up in the air in places: pillars under it
    const pil = [];
    for (let k = 0; k < this.N; k += 14) if (this.Y[k] > 3 && !this.GAP[k]) pil.push(k);
    if (pil.length) {
      this.inst(new THREE.CylinderGeometry(1, 1.2, 1, 10), mat(th === 'skyway' ? 0x2a3040 : 0x8a8478), pil, (k) => { const h = this.Y[k] + 0.4; return [this.X[k], h / 2 - 0.4, this.Z[k], 0, 1, h, 1]; });
    }
    if (th === 'harbor') {
      const palms = this.spots(70, 3, 26, 21);
      this.inst(new THREE.CylinderGeometry(0.22, 0.38, 1, 7), mat(0x7a5a3a), palms, ([x, z, r]) => [x, 4 * (0.8 + r * 0.5) - 0.4, z, 0, 1, 8 * (0.8 + r * 0.5), 1]);
      const leaf = new THREE.ConeGeometry(3.4, 1.6, 7); leaf.translate(0, -0.2, 0);
      this.inst(leaf, mat(0x2f8a3a), palms, ([x, z, r]) => [x, 8 * (0.8 + r * 0.5) - 0.2, z, r * 6, 1, 1, 1]);
      const huts = this.spots(14, 9, 40, 22);
      this.inst(new THREE.BoxGeometry(6, 4, 6), mat(0xf2e6cc), huts, ([x, z, r]) => [x, 1.6, z, r * 3, 1, 1, 1]);
      const roof = new THREE.ConeGeometry(5.2, 2.6, 4); roof.rotateY(Math.PI / 4);
      this.inst(roof, mat(0xd2502a), huts, ([x, z, r]) => [x, 4.9, z, r * 3, 1, 1, 1]);
      this.farRing(0x6a8a6a, 0x8aa0b0, 21, 26, 60);
      this.sea(0x2a6c94, env);
    } else if (th === 'canyon') {
      const rocks = this.spots(60, 12, 70, 31);
      this.inst(new THREE.CylinderGeometry(0.7, 1, 1, 6), mat(0xa04a26), rocks, ([x, z, r]) => [x, (6 + r * 22) / 2 - 0.5, z, r * 5, 3 + r * 6, 6 + r * 22, 3 + r * 6]);
      const cact = this.spots(50, 2, 22, 32);
      this.inst(new THREE.CylinderGeometry(0.3, 0.35, 1, 7), mat(0x3a7a3a), cact, ([x, z, r]) => [x, 1.6, z, 0, 1, 3.2 + r * 2, 1]);
      const arm = new THREE.BoxGeometry(1.6, 0.4, 0.4); arm.translate(0, 0.6, 0);
      this.inst(arm, mat(0x3a7a3a), cact, ([x, z, r]) => [x, 1.6 + r, z, r * 6, 1, 1, 1]);
      this.farRing(0x8a3a1e, 0x6a4a5a, 31, 18, 120, true);
    } else {
      const towers = this.spots(90, 17, 80, 41);
      const wt = windowsTex(); wt.repeat.set(2, 3);
      const tm = hi ? new THREE.MeshStandardMaterial({ map: wt, emissiveMap: wt, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6, metalness: 0.3, envMap: env, envMapIntensity: 0.5 }) : new THREE.MeshLambertMaterial({ map: wt, emissiveMap: wt, emissive: 0xffffff });
      this.inst(new THREE.BoxGeometry(1, 1, 1), tm, towers, ([x, z, r]) => { const h = 18 + r * 70; return [x, h / 2 - 0.4, z, r * 2, 10 + r * 14, h, 10 + r * 12]; });
      const signs = this.spots(26, 4, 30, 42);
      const neon = [new THREE.Color(0.2, 1.4, 2.6), new THREE.Color(2.6, 1.2, 0.2), new THREE.Color(0.4, 2.4, 0.8)];
      signs.forEach(([x, z, r], i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(6 + r * 6, 1.2, 0.3), new THREE.MeshBasicMaterial({ color: neon[i % 3] }));
        m.position.set(x, 14 + r * 20, z); m.rotation.y = r * 6; this.group.add(m);
      });
      const lamps = [];
      for (let k = 0; k < this.N; k += 24) if (!this.GAP[k]) for (const s of [-1, 1]) lamps.push([k, s]);
      const lp = new THREE.CylinderGeometry(0.12, 0.12, 6, 6); lp.translate(0, 3, 0);
      const lampAt = (k, s) => this.point(k, s < 0 ? -EL[k] - 0.4 : ER[k] + 0.4);
      this.inst(lp, mat(0x30343e), lamps, ([k, s]) => { const p = lampAt(k, s); return [p.x, p.y, p.z, 0, 1, 1, 1]; });
      const bulb = new THREE.SphereGeometry(0.4, 8, 6);
      this.inst(bulb, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.4) }), lamps, ([k, s]) => { const p = lampAt(k, s); return [p.x, p.y + 6.1, p.z, 0, 1, 1, 1]; });
      this.farRing(0x141a2a, 0x0a0e18, 41, 40, 160, false, true);
    }
    void yAt;
  }

  /** Hills / mesas / skyline round the far edge. */
  farRing(c1, c2, seed, n, hMax, mesa = false, city = false) {
    const R = rng(seed);
    let cx = 0, cz = 0; for (let k = 0; k < this.N; k++) { cx += this.X[k]; cz += this.Z[k]; } cx /= this.N; cz /= this.N;
    const list = [];
    for (let i = 0; i < n * 3; i++) { const a = R() * Math.PI * 2, d = 420 + R() * 260; list.push([cx + Math.cos(a) * d, cz + Math.sin(a) * d, R()]); }
    const geo = city ? new THREE.BoxGeometry(1, 1, 1) : mesa ? new THREE.CylinderGeometry(0.8, 1, 1, 7) : new THREE.ConeGeometry(1, 1, 7);
    const m = new THREE.MeshBasicMaterial({ color: c1, fog: true });
    this.inst(geo, m, list.filter((_, i) => i % 2 === 0), ([x, z, r]) => { const h = hMax * (0.35 + r * 0.65); return [x, h / 2 - 1, z, r * 6, 50 + r * 90, h, 50 + r * 90]; });
    const m2 = new THREE.MeshBasicMaterial({ color: c2, fog: true });
    this.inst(geo, m2, list.filter((_, i) => i % 2 === 1), ([x, z, r]) => { const h = hMax * (0.25 + r * 0.5); return [x, h / 2 - 1, z, r * 6, 40 + r * 70, h, 40 + r * 70]; });
  }

  sea(color, env) {
    const m = new THREE.Mesh(new THREE.RingGeometry(330, 1400, 48, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.4, envMap: env, envMapIntensity: 1.1 }));
    let cx = 0, cz = 0; for (let k = 0; k < this.N; k++) { cx += this.X[k]; cz += this.Z[k]; }
    m.rotation.x = -Math.PI / 2; m.position.set(cx / this.N, -0.3, cz / this.N);
    this.group.add(m);
  }

  update(t) { for (const f of this.anim) f(t); }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } }
    });
    this.group.removeFromParent();
  }
}
