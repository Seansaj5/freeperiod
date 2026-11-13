// Vehicles built from code (no model files). A body is lofted: a cross-section is swept along the
// car's length while its width, height, cabin and wheel arches change. Every vehicle comes out as
// one geometry per material slot so paint, glass, rubber and metal each get their own material:
//   parts[PAINT] (white vertex colour: the material or instance colour paints it), [GLASS], [TRIM], [METAL]
//   head / tail - headlights and tail lights, drawn unlit so they glow
//   headGlow / tailGlow - soft additive flares around the lights
// Cars face +z, sit on y = 0, and are centred on x = 0, z = 0.
import * as THREE from 'three';

export const PAINT = 0, GLASS = 1, TRIM = 2, METAL = 3;
const NSLOT = 4;

const WHITE = 0xffffff, GLASSC = 0x26344a, DARK = 0x111317, RUBBER = 0x0c0c0e, PLASTIC = 0x1c1f25;
const HEAD = 0xfff4dc, TAIL = 0xff1830, AMBER = 0xffa020;

// ---------------------------------------------------------------- mesh builder

class Builder {
  constructor() { this.s = Array.from({ length: NSLOT }, () => ({ p: [], c: [] })); this.off = [0, 0, 0]; }
  tri(a, b, c, col, slot) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-12) return; // skip degenerate triangles
    const o = this.off, S = this.s[slot];
    for (const v of [a, b, c]) { S.p.push(v[0] + o[0], v[1] + o[1], v[2] + o[2]); S.c.push(col.r, col.g, col.b); }
  }
  /** A quad facing away from `ctr`, whatever order the corners come in. */
  quad(a, b, c, d, col, ctr, slot) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-12) { // a, b, c in a line: use the other diagonal
      const wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
      nx = vy * wz - vz * wy; ny = vz * wx - vx * wz; nz = vx * wy - vy * wx;
    }
    const fx = (a[0] + b[0] + c[0] + d[0]) / 4 - ctr[0], fy = (a[1] + b[1] + c[1] + d[1]) / 4 - ctr[1], fz = (a[2] + b[2] + c[2] + d[2]) / 4 - ctr[2];
    if (nx * fx + ny * fy + nz * fz < 0) { this.tri(a, c, b, col, slot); this.tri(a, d, c, col, slot); }
    else { this.tri(a, b, c, col, slot); this.tri(a, c, d, col, slot); }
  }
  /** Eight-corner solid. Corners: bottom 0..3 then top 4..7, each ring going (-x,-z) (+x,-z) (+x,+z) (-x,+z). */
  hexa(q, hex, slot) {
    const col = new THREE.Color(hex), ctr = [0, 0, 0];
    for (const v of q) { ctr[0] += v[0] / 8; ctr[1] += v[1] / 8; ctr[2] += v[2] / 8; }
    for (const [a, b, c, d] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]) this.quad(q[a], q[b], q[c], q[d], col, ctr, slot);
  }
  box(cx, cy, cz, sx, sy, sz, hex, slot) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.hexa([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], hex, slot);
  }
  /**
   * Solid of revolution around an axis through (cx, cy, cz) along 'x' or 'z'. prof = [[radius, along], ...].
   * Flat rings face away from along = 0; the rest face away from the axis. cap closes the last ring.
   */
  lathe(cx, cy, cz, axis, prof, n, hex, slot, cap = false) {
    const col = new THREE.Color(hex);
    const P = (r, a, i) => { const t = (i / n) * Math.PI * 2, u = Math.cos(t) * r, v = Math.sin(t) * r; return axis === 'x' ? [cx + a, cy + u, cz + v] : [cx + u, cy + v, cz + a]; };
    const onAxis = (a) => (axis === 'x' ? [cx + a, cy, cz] : [cx, cy, cz + a]);
    const ring = (r, a) => { const c = onAxis(a), out = onAxis(a - Math.sign(a || 1)); for (let i = 0; i < n; i++) this.quad(c, P(r, a, i), P(r, a, i + 1), c, col, out, slot); };
    for (let k = 0; k < prof.length - 1; k++) {
      const [r0, a0] = prof[k], [r1, a1] = prof[k + 1];
      const flat = Math.abs(r1 - r0) > Math.abs(a1 - a0) * 3;
      const am = (a0 + a1) / 2, ctr = flat ? onAxis(am - Math.sign(am || 1)) : onAxis(am);
      for (let i = 0; i < n; i++) this.quad(P(r0, a0, i), P(r0, a0, i + 1), P(r1, a1, i + 1), P(r1, a1, i), col, ctr, slot);
    }
    if (cap) ring(...prof[prof.length - 1]);
  }
  /** One BufferGeometry per material slot (null when empty), with creased smooth normals. */
  geometries(crease = 38) {
    const cosT = Math.cos((crease * Math.PI) / 180);
    return this.s.map((S) => (S.p.length ? toGeometry(S.p, S.c, cosT) : null));
  }
  geometry(crease = 38) { return merge(this.geometries(crease)); }
}

export function toGeometry(p, c, cosT) {
  const nt = p.length / 9;
  const fn = new Float32Array(nt * 3);
  for (let i = 0; i < nt; i++) {
    const o = i * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z) || 1; fn[i * 3] = x / l; fn[i * 3 + 1] = y / l; fn[i * 3 + 2] = z / l;
  }
  // smooth across edges flatter than the crease angle; sharper edges stay crisp
  const key = (o) => `${Math.round(p[o] * 400)},${Math.round(p[o + 1] * 400)},${Math.round(p[o + 2] * 400)}`;
  const map = new Map();
  for (let v = 0; v < nt * 3; v++) { const k = key(v * 3); let a = map.get(k); if (!a) map.set(k, (a = [])); a.push((v / 3) | 0); }
  const n = new Float32Array(p.length);
  for (let v = 0; v < nt * 3; v++) {
    const t = (v / 3) | 0, fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2];
    let sx = 0, sy = 0, sz = 0;
    for (const u of map.get(key(v * 3))) {
      const gx = fn[u * 3], gy = fn[u * 3 + 1], gz = fn[u * 3 + 2];
      if (fx * gx + fy * gy + fz * gz >= cosT) { sx += gx; sy += gy; sz += gz; }
    }
    const l = Math.hypot(sx, sy, sz) || 1;
    n[v * 3] = sx / l; n[v * 3 + 1] = sy / l; n[v * 3 + 2] = sz / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
}

/** Concatenate non-indexed geometries with position / normal / color. */
function merge(list) {
  list = list.filter(Boolean);
  if (list.length <= 1) return list[0] || null;
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(list.reduce((a, x) => a + x.getAttribute(name).array.length, 0));
    let o = 0;
    for (const x of list) { arr.set(x.getAttribute(name).array, o); o += x.getAttribute(name).array.length; }
    g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  g.computeBoundingSphere();
  return g;
}

/** Copy a wheel builder into B at (x, y, z), mirrored for the left side. */
function bake(B, wb, x, y, z) {
  const flip = x < 0 ? -1 : 1;
  for (let s = 0; s < NSLOT; s++) {
    const P = wb.s[s].p, C = wb.s[s].c;
    for (let i = 0; i < P.length; i += 9) {
      const v = [0, 3, 6].map((o) => [P[i + o] * flip + x, P[i + o + 1] + y, P[i + o + 2] + z]);
      if (flip < 0) [v[1], v[2]] = [v[2], v[1]];
      B.tri(v[0], v[1], v[2], { r: C[i], g: C[i + 1], b: C[i + 2] }, s);
    }
  }
}

// ---------------------------------------------------------------- curves

/** Smooth curve through [[t, y], ...] (cubic Hermite; flat at peaks so it never overshoots). */
function curve(pts, t) {
  const n = pts.length;
  if (t <= pts[0][0]) return pts[0][1];
  if (t >= pts[n - 1][0]) return pts[n - 1][1];
  let i = 1;
  while (pts[i][0] < t) i++;
  const [t0, y0] = pts[i - 1], [t1, y1] = pts[i], h = t1 - t0;
  const tan = (k) => {
    if (k <= 0) return ((pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0])) * 0.5;
    if (k >= n - 1) return ((pts[n - 1][1] - pts[n - 2][1]) / (pts[n - 1][0] - pts[n - 2][0])) * 0.5;
    const d0 = pts[k][1] - pts[k - 1][1], d1 = pts[k + 1][1] - pts[k][1];
    return d0 * d1 <= 0 ? 0 : (pts[k + 1][1] - pts[k - 1][1]) / (pts[k + 1][0] - pts[k - 1][0]);
  };
  const u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * tan(i - 1) + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * tan(i);
}

// ---------------------------------------------------------------- the lofted body

/**
 * Body description (see cars.js). Metres; t runs 0 (rear bumper) .. 1 (front bumper).
 *   L, W, clear          length, max width, ground clearance
 *   wheel, axle          wheel radius, axle positions as t ([rear, front])
 *   top [[t, y], ...]    waist / hood / deck height along the car
 *   fender [f, r]        extra height over the front / rear wheels (the hood dips between them)
 *   flare [f, r]         extra width over the front / rear wheels
 *   nose, tail           plan-view corner rounding (fraction of width lost at the very end)
 *   chin, lift           how far the bottom rises at the front / back
 *   cab { r0, r1, f1, f0, h, w, gw, fast, b, rearGlass }
 *                        rear-glass base, roof rear, roof front, windscreen base (t), roof height,
 *                        roof and glass-base half-widths (fractions), fastback curve, B-pillar t
 */
export function bodyShape(b) {
  const L = b.L, W = b.W, hl = L / 2;
  const fl = b.flare || [0, 0], fh = b.fender || [0, 0];
  const baseW = W / 2 / (1 + Math.max(fl[0], fl[1]));
  const wr = b.wheel, R = wr + (b.arch ?? 0.055);
  const axZ = b.axle.map((t) => -hl + t * L);
  const zF = axZ[axZ.length - 1], zR = axZ[0];
  const nose = b.nose ?? 0.22, tail = b.tail ?? 0.16, noseLen = b.noseLen ?? 0.1, tailLen = b.tailLen ?? 0.07;
  const bump = (z, az, k) => Math.exp(-(((z - az) / (wr * k)) ** 2));
  const planW = (t) => {
    let f = 1;
    if (t > 1 - noseLen) { const u = (t - (1 - noseLen)) / noseLen; f -= nose * (1 - Math.sqrt(Math.max(0, 1 - u * u))); }
    if (t < tailLen) { const u = (tailLen - t) / tailLen; f -= tail * (1 - Math.sqrt(Math.max(0, 1 - u * u))); }
    const z = -hl + t * L;
    if (fl[0]) f *= 1 + fl[0] * bump(z, zF, 2.6);
    if (fl[1]) f *= 1 + fl[1] * bump(z, zR, 2.6);
    return baseW * f;
  };
  const base = (t) => curve(b.top, t);
  const top = (t) => { const z = -hl + t * L; return base(t) + (fh[0] ? fh[0] * bump(z, zF, 2.2) : 0) + (fh[1] ? fh[1] * bump(z, zR, 2.4) : 0); };
  const chin = b.chin ?? 0.1, lift = b.lift ?? 0.14;
  const bottom = (t) => {
    const z = -hl + t * L;
    let y = b.clear + chin * Math.max(0, (t - 0.9) / 0.1) ** 2 + lift * Math.max(0, (0.1 - t) / 0.1) ** 2;
    for (const az of axZ) { const dz = z - az; if (Math.abs(dz) < R) y = Math.max(y, wr + Math.sqrt(R * R - dz * dz)); }
    return Math.min(y, top(t) - 0.08);
  };
  const cab = b.cab;
  const gwF = cab?.gw ?? 0.84;
  const hoodCrown = b.hoodCrown ?? 0.03, roofCrown = b.crown ?? 0.035;
  /** [roof height, roof half-width, cabin amount 0..1, crown] at t. No cabin = the hood / deck. */
  const roof = (t, w) => {
    const deck = [base(t) + 0.03, w * gwF * 0.62, 0, hoodCrown];
    if (!cab || t <= cab.r0 || t >= cab.f0) return deck;
    const rx = (W / 2) * cab.w;
    let k;
    if (t < cab.r1) { const u = (t - cab.r0) / (cab.r1 - cab.r0); k = cab.fast ? Math.sin((u * Math.PI) / 2) ** (1 / (1 + cab.fast)) : u; }
    else if (t > cab.f1) { const u = (cab.f0 - t) / (cab.f0 - cab.f1); k = 1 - (1 - u) ** 1.5; }
    else k = 1;
    const mid = (cab.r1 + cab.f1) / 2, half = (cab.f1 - cab.r1) / 2 || 1;
    const h = cab.h - (k >= 1 ? 0.025 * ((t - mid) / half) ** 2 : 0);
    return [deck[0] + (h - deck[0]) * k, deck[1] + (rx - deck[1]) * Math.min(1, k * 1.6), k, hoodCrown + (roofCrown - hoodCrown) * k];
  };
  /** Right half of the cross-section at t, bottom centre round to top centre. */
  const section = (t) => {
    const w = planW(t), yt = top(t), yb = bottom(t);
    const y2 = Math.max(yb + 0.03, b.clear + 0.1);
    const y3 = Math.max(y2 + 0.02, b.clear + (yt - b.clear) * (b.side ?? 0.5));
    const y4 = Math.max(y3 + 0.02, yt - 0.06);
    const tum = b.tumble ?? 0.035;
    const [yr, rx, k, cr] = roof(t, w);
    const gy = Math.max(yt + 0.02, Math.min(yr, base(t) + 0.05));
    return {
      w, yt, yb, k, pts: [
        [0, yb], [w * 0.9, yb], [w * 0.985, y2], [w, y3], [w * (1 - tum), y4], [w * (0.92 - tum), yt],
        [w * gwF, gy], [rx, Math.max(yr, gy + 0.005)], [0, Math.max(yr, gy) + cr],
      ],
    };
  };
  /** Half-width of the body at height y, at t (for sticking parts onto the surface). */
  const halfAt = (t, y) => {
    const s = section(t).pts;
    if (y <= s[1][1]) return s[1][0];
    for (let i = 1; i < 8; i++) if (y <= s[i + 1][1]) { const u = (y - s[i][1]) / (s[i + 1][1] - s[i][1] || 1); return s[i][0] + (s[i + 1][0] - s[i][0]) * u; }
    return 0;
  };
  /** Height of the top surface at t and |x| (hood, roof). */
  const topAt = (t, x) => {
    const s = section(t).pts;
    for (let i = 8; i > 5; i--) if (x <= s[i - 1][0]) { const u = (x - s[i][0]) / (s[i - 1][0] - s[i][0] || 1); return s[i][1] + (s[i - 1][1] - s[i][1]) * u; }
    return s[5][1];
  };
  return { L, W, hl, wr, R, axZ, planW, top, base, bottom, roof, section, halfAt, topAt, cab };
}

/** Sweep the body into B; returns the shape helpers for adding details. */
function loftBody(B, b) {
  const sh = bodyShape(b);
  const { L, hl, axZ, R, cab } = sh;
  // stations: even spacing plus extra ones round the wheel arches and at the cabin breaks
  const ts = new Set();
  const n = Math.ceil(L / (b.step ?? 0.1));
  for (let i = 0; i <= n; i++) ts.add(i / n);
  for (const az of axZ) for (let i = 0; i <= 12; i++) ts.add((az + R * Math.cos((i / 12) * Math.PI) + hl) / L);
  for (const t of [0.004, 0.012, 0.025, 0.975, 0.988, 0.996]) ts.add(t);
  if (cab) for (const t of [cab.r0, cab.r1, cab.f1, cab.f0, cab.b != null ? cab.b - 0.018 : -1, cab.b != null ? cab.b + 0.018 : -1]) ts.add(t);
  const list = [...ts].filter((t) => t >= 0 && t <= 1).sort((a, c) => a - c).filter((t, i, a) => !i || t - a[i - 1] > 1e-4);
  const secs = list.map((t) => ({ t, z: -hl + t * L, ...sh.section(t) }));
  const paint = new THREE.Color(WHITE), glass = new THREE.Color(GLASSC), dark = new THREE.Color(DARK), plastic = new THREE.Color(PLASTIC);
  const sill = b.sill != null ? new THREE.Color(b.sill) : null;
  const pillar = b.pillar != null ? new THREE.Color(b.pillar) : null;
  const roofCol = b.roofCol != null ? new THREE.Color(b.roofCol) : null;
  const tone = b.twoTone ? new THREE.Color(b.twoTone.color) : null;
  for (let i = 1; i < secs.length; i++) {
    const A = secs[i - 1], C = secs[i];
    const tm = (A.t + C.t) / 2;
    const inCab = cab && tm > cab.r0 && tm < cab.f0 && Math.max(A.k, C.k) > 0.05;
    const rearRamp = cab && tm < cab.r1, frontRamp = cab && tm > cab.f1;
    const bPillar = cab?.b != null && Math.abs(tm - cab.b) < 0.018;
    for (let k = 0; k < A.pts.length - 1; k++) {
      let col = paint, slot = PAINT;
      if (k === 0) { col = dark; slot = TRIM; }
      else if (k === 1 && sill) { col = sill; slot = TRIM; }
      else if (k === 6 && inCab) {
        if (rearRamp && cab.rearGlass === false) { /* painted buttress over the engine */ }
        else if (bPillar) { if (pillar) { col = pillar; slot = TRIM; } }
        else { col = glass; slot = GLASS; }
      } else if (k === 7 && inCab) {
        if (frontRamp || (rearRamp && cab.rearGlass !== false)) { col = glass; slot = GLASS; }
        else if (rearRamp) { col = plastic; slot = TRIM; } // engine cover louvres
        else if (roofCol) { col = roofCol; slot = b.roofCol === GLASSC ? GLASS : TRIM; }
      }
      if (tone && slot === PAINT && tm > b.twoTone.t + (k >= 5 ? 0.04 : 0)) col = tone;
      const ctr = [0, (A.yb + A.yt) / 2, (A.z + C.z) / 2];
      for (const sx of [1, -1]) {
        B.quad([A.pts[k][0] * sx, A.pts[k][1], A.z], [A.pts[k + 1][0] * sx, A.pts[k + 1][1], A.z], [C.pts[k + 1][0] * sx, C.pts[k + 1][1], C.z], [C.pts[k][0] * sx, C.pts[k][1], C.z], col, ctr, slot);
      }
    }
  }
  // end caps
  for (const S of [secs[0], secs[secs.length - 1]]) {
    const ring = [...S.pts.map(([x, y]) => [x, y, S.z]), ...S.pts.slice(0, -1).reverse().map(([x, y]) => [-x, y, S.z])];
    const c = [0, (S.yb + S.yt) / 2, S.z], out = [0, c[1], S.z - Math.sign(S.z)];
    for (let i = 0; i < ring.length - 1; i++) B.quad(c, ring[i], ring[i + 1], c, paint, out, PAINT);
  }
  // dark tub between the arches so you can't see through the car
  const ta = (axZ[0] - R + hl) / L, tb = (axZ[axZ.length - 1] + R + hl) / L;
  let lo = 9;
  for (let t = ta; t <= tb; t += 0.02) lo = Math.min(lo, sh.top(t) - 0.1);
  const tubTop = Math.min(lo, b.wheel * 2), tubW = sh.planW(0.5) * 2 - 0.5;
  B.box(0, (b.clear + 0.02 + tubTop) / 2, (axZ[0] + axZ[axZ.length - 1]) / 2, tubW, tubTop - b.clear - 0.02, axZ[axZ.length - 1] - axZ[0] + R * 2, DARK, TRIM);
  return sh;
}

/** Where the front (dir 1) or rear (dir -1) surface is at (x, y): march in from the end, then refine. */
function surfZ(sh, dir, x, y) {
  const inside = (t) => sh.halfAt(t, y) >= x - 1e-3 && y <= sh.section(t).pts[8][1] + 0.01 && y >= sh.bottom(t) - 0.01;
  const T = (i) => (dir > 0 ? 1 - i : i);
  let a = 0, found = -1;
  for (let i = 0; i <= 0.6; i += 0.01) { if (inside(T(i))) { found = i; break; } a = i; }
  if (found < 0) return dir * sh.hl * 0.6;
  if (found === 0) return -sh.hl + T(0) * sh.L;
  let b = found;
  for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (inside(T(m))) b = m; else a = m; }
  return -sh.hl + T(b) * sh.L;
}

/** A strip stuck onto the front (dir 1) or rear (dir -1), wrapping round the corners. x0..x1 across (mirrored), y0..y1 high. */
function endStrip(B, sh, dir, x0, x1, y0, y1, hex, slot, out = 0.012, mirror = true) {
  const col = new THREE.Color(hex);
  const n = Math.max(2, Math.ceil((x1 - x0) / 0.06));
  for (const sx of mirror ? [1, -1] : [1]) {
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const cur = [[x * sx, y0, surfZ(sh, dir, x, y0) + dir * out], [x * sx, y1, surfZ(sh, dir, x, y1) + dir * out]];
      if (prev) B.quad(prev[0], cur[0], cur[1], prev[1], col, [x * sx * 0.5, (y0 + y1) / 2, cur[0][2] - dir], slot);
      prev = cur;
    }
  }
}

/** A quad [[x, y] x4] stuck onto the front (dir 1) or rear (dir -1), subdivided so it follows the surface. */
function endQuad(B, sh, dir, q, hex, slot, out = 0.012, mirror = true) {
  const col = new THREE.Color(hex);
  const span = Math.max(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1]));
  const nu = Math.max(1, Math.ceil(span / 0.05)), nv = Math.max(1, Math.ceil(Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) / 0.08));
  const at = (u, v) => { const x0 = q[0][0] + (q[1][0] - q[0][0]) * u, y0 = q[0][1] + (q[1][1] - q[0][1]) * u, x1 = q[3][0] + (q[2][0] - q[3][0]) * u, y1 = q[3][1] + (q[2][1] - q[3][1]) * u; return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v]; };
  for (const sx of mirror ? [1, -1] : [1]) {
    const P = (u, v) => { const [x, y] = at(u, v); return [x * sx, y, surfZ(sh, dir, Math.abs(x), y) + dir * out]; };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = P(i / nu, j / nv), b2 = P((i + 1) / nu, j / nv), c = P((i + 1) / nu, (j + 1) / nv), d = P(i / nu, (j + 1) / nv);
      B.quad(a, b2, c, d, col, [(a[0] + c[0]) / 2 * 0.5, (a[1] + c[1]) / 2, a[2] - dir], slot);
    }
  }
}
/** Grow a quad by m metres round its middle (for housings round a light). */
const growQuad = (q, m) => { const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4; return q.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + (dx / l) * m, y + (dy / l) * m]; }); };
const quadMid = (q) => [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];

/** A strip of width w along a path [[t, y], ...] on both sides of the body. */
function sideStrip(B, sh, path, w, hex, slot, out = 0.01) {
  const col = new THREE.Color(hex);
  for (const sx of [1, -1]) {
    const P = (t, y) => [sx * (sh.halfAt(t, y) + out), y, -sh.hl + t * sh.L];
    for (let i = 0; i < path.length - 1; i++) {
      const [ta, ya] = path[i], [tb, yb] = path[i + 1];
      const dz = (tb - ta) * sh.L, dy = yb - ya, l = Math.hypot(dz, dy) || 1, nz = (-dy / l) * w / 2, ny = (dz / l) * w / 2;
      const ntz = nz / sh.L;
      B.quad(P(ta - ntz, ya - ny), P(tb - ntz, yb - ny), P(tb + ntz, yb + ny), P(ta + ntz, ya + ny), col, [0, (ya + yb) / 2, -sh.hl + ((ta + tb) / 2) * sh.L], slot);
    }
  }
}

/** A patch stuck onto both sides between t0..t1, y0..y1 (taper raises its bottom edge towards t1). */
function sidePatch(B, sh, t0, t1, y0, y1, hex, slot, out = 0.008, taper = 0) {
  const col = new THREE.Color(hex);
  const n = Math.max(2, Math.ceil(((t1 - t0) * sh.L) / 0.08)), rows = Math.max(1, Math.ceil((y1 - y0) / 0.05));
  for (const sx of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const ta = t0 + ((t1 - t0) * i) / n, tb = t0 + ((t1 - t0) * (i + 1)) / n;
      const ya = y0 + (y1 - y0) * taper * (i / n), yb = y0 + (y1 - y0) * taper * ((i + 1) / n);
      const p = (t, y) => [sx * (sh.halfAt(t, y) + out), y, -sh.hl + t * sh.L];
      for (let j = 0; j < rows; j++) {
        const a0 = ya + ((y1 - ya) * j) / rows, a1 = ya + ((y1 - ya) * (j + 1)) / rows;
        const b0 = yb + ((y1 - yb) * j) / rows, b1 = yb + ((y1 - yb) * (j + 1)) / rows;
        B.quad(p(ta, a0), p(tb, b0), p(tb, b1), p(ta, a1), col, [0, (a0 + a1) / 2, -sh.hl + ((ta + tb) / 2) * sh.L], slot);
      }
    }
  }
}

// ---------------------------------------------------------------- wheels

/** A wheel for the right side (outer face +x), centred on the origin. */
function wheelBuilder(r, w, style, detail) {
  const B = new Builder();
  const n = detail ? 20 : 12;
  const rimR = r * (style.size ?? 0.66), rc = style.color ?? 0xc9ced8;
  // tyre with rounded shoulders
  B.lathe(0, 0, 0, 'x', [[rimR * 0.98, -w / 2], [r * 0.9, -w / 2], [r * 0.985, -w / 2 + 0.035], [r, -w / 2 + 0.07], [r, w / 2 - 0.07], [r * 0.985, w / 2 - 0.035], [r * 0.9, w / 2], [rimR * 0.98, w / 2]], n, RUBBER, TRIM);
  // rim lip, dark well behind the spokes, spokes, hub
  B.lathe(0, 0, 0, 'x', [[rimR, w / 2 - 0.004], [rimR * 0.9, w / 2 - 0.03]], n, rc, METAL);
  B.lathe(0, 0, 0, 'x', [[rimR * 0.92, w / 2 - 0.09], [0, w / 2 - 0.09]], n, 0x202329, TRIM);
  if (style.disc) B.lathe(0, 0, 0, 'x', [[rimR * 0.9, w / 2 - 0.035], [rimR * 0.3, w / 2 - 0.012], [rimR * 0.24, w / 2]], n, rc, METAL);
  else {
    const spokes = style.spokes ?? 5, sw = style.sw ?? 0.075;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const p = (rr, x, s) => [x, ca * rr - sa * s, sa * rr + ca * s];
      const x0 = w / 2 - 0.085, x1 = w / 2 - 0.01, r0 = rimR * 0.2, r1 = rimR * 0.94, s0 = sw * 0.6, s1 = sw * (style.taper ?? 0.42);
      B.hexa([p(r0, x0, -s0), p(r1, x0, -s1), p(r1, x0, s1), p(r0, x0, s0), p(r0, x1, -s0), p(r1, x1 - 0.02, -s1), p(r1, x1 - 0.02, s1), p(r0, x1, s0)], rc, METAL);
    }
  }
  B.lathe(0, 0, 0, 'x', [[rimR * 0.26, w / 2 - 0.02], [rimR * 0.2, w / 2 + 0.005], [0.0, w / 2 + 0.01]], n, style.cap ?? rc, METAL);
  return B;
}

// ---------------------------------------------------------------- flares

function flareQuads(dir, xs, y, s, hex, hl) {
  const pos = [], uv = [], col = [], c = new THREE.Color(hex);
  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const x of xs) {
    const z = dir * (hl + 0.06), q = [[x - s, y - s * 0.6], [x + s, y - s * 0.6], [x + s, y + s * 0.6], [x - s, y + s * 0.6]];
    for (const k of dir > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { pos.push(q[k][0], q[k][1], z); uv.push(...UV[k]); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------- full cars

/**
 * Geometry for a car body description. Returns
 * { parts[4], head, tail, headGlow, tailGlow, wheel: { parts, r, at: [[x, y, z, front]] } | null, exhausts, hl, hw, roofH }
 * bakeWheels: put the wheels into the body (traffic) instead of returning them separately.
 */
export function carGeometry(b, { detail = true, bakeWheels = false } = {}) {
  const B = new Builder(), head = new Builder(), tail = new Builder();
  const sh = loftBody(B, { ...b, step: (b.step ?? 0.1) * (detail ? 1 : 1.7) });
  const { hl, L, W, axZ, wr } = sh;
  const hw = W / 2;
  const tZ = (t) => -hl + t * L;
  const yF = sh.top(1), yR = sh.top(0);

  // ---- front: lights, grille, intakes, splitter
  const hlx = b.hlx ?? [hw * 0.42, hw * 0.84], hly = b.hly ?? [yF - 0.15, yF - 0.06];
  if (b.lamps) { // shaped lights: dark lenses with lit shapes (Y-shapes, slashes, LED dots) inside
    for (const q of b.lamps.lens) { endQuad(B, sh, 1, growQuad(q, 0.02), DARK, TRIM, 0.006); endQuad(B, sh, 1, q, 0x1a2230, GLASS, 0.01); }
    for (const q of b.lamps.lit) endQuad(head, sh, 1, q, HEAD, 0, 0.014);
  } else if (b.roundLights) { // round lamps with a chrome ring
    const { x, y, r } = b.roundLights;
    for (const sx of [-1, 1]) {
      const z = surfZ(sh, 1, x, y);
      B.lathe(sx * x, y, z, 'z', [[r * 1.28, -0.02], [r * 1.22, 0.025], [r * 1.02, 0.03]], detail ? 18 : 10, 0xc8ccd4, METAL);
      head.lathe(sx * x, y, z, 'z', [[r, 0.012], [r * 0.55, 0.026], [0, 0.03]], detail ? 18 : 10, HEAD, 0);
    }
  } else {
    endStrip(B, sh, 1, Math.max(0, hlx[0] - 0.03), hlx[1] + 0.015, hly[0] - 0.03, hly[1] + 0.025, DARK, TRIM, 0.006); // housing
    endStrip(head, sh, 1, hlx[0], hlx[1], hly[0], hly[1], HEAD, 0, 0.012);
    endStrip(head, sh, 1, hlx[1] + 0.003, hlx[1] + 0.03, hly[0], hly[1], AMBER, 0, 0.013); // corner markers
  }
  if (b.drl) endStrip(head, sh, 1, b.drl[0], b.drl[1], b.drl[2], b.drl[2] + 0.022, HEAD, 0, 0.016);
  const gr = b.grille === false ? null : (b.grille ?? [hw * 0.36, b.clear + 0.12, Math.min(hly[0] - 0.04, b.clear + 0.34)]);
  if (gr) endStrip(B, sh, 1, 0, gr[0], gr[1], gr[2], PLASTIC, TRIM, 0.008);
  if (gr && b.grilleBars) for (let i = 0; i < b.grilleBars; i++) { // vertical chrome slats
    const x = (i / (b.grilleBars - 1) - 0.5) * 2 * gr[0] * 0.86;
    endQuad(B, sh, 1, [[x - 0.007, gr[1] + 0.01], [x + 0.007, gr[1] + 0.01], [x + 0.007, gr[2] - 0.01], [x - 0.007, gr[2] - 0.01]], 0xc8ccd4, METAL, 0.016, false);
  }
  if (b.horseshoe) { // horseshoe grille: dark mesh inside a chrome U
    const { w, y0, y1 } = b.horseshoe, n = 10, top = [];
    for (let i = 0; i <= n; i++) { const a = Math.PI * (1 - i / n); top.push([Math.cos(a) * w, y1 - 0.09 + Math.sin(a) * 0.09]); }
    const bx = (u) => -w + 2 * w * u, C = 0xd5d9e0;
    for (let i = 0; i < n; i++) endQuad(B, sh, 1, [[bx(i / n), y0], [bx((i + 1) / n), y0], top[i + 1], top[i]], PLASTIC, TRIM, 0.01, false);
    for (let i = 0; i < n; i++) { const a = top[i], c = top[i + 1]; endQuad(B, sh, 1, [a, c, [c[0], c[1] + 0.028], [a[0], a[1] + 0.028]], C, METAL, 0.016, false); }
    for (const sx of [-1, 1]) endQuad(B, sh, 1, [[sx * w, y0], [sx * (w + 0.028), y0], [sx * (w + 0.028), y1 - 0.09], [sx * w, y1 - 0.09]], C, METAL, 0.016, false);
  }
  if (b.intakeF) endStrip(B, sh, 1, b.intakeF[0], b.intakeF[1], b.clear + 0.07, b.clear + b.intakeF[2], PLASTIC, TRIM, 0.008);
  if (b.splitter) B.box(0, b.clear + 0.015, hl - 0.08, sh.planW(0.97) * 2 - 0.08, 0.03, 0.34, b.splitter === true ? PLASTIC : b.splitter, TRIM);

  // ---- rear: tail lights, plate, diffuser, exhausts
  const tlx = b.tlx ?? [hw * 0.5, hw * 0.9], tly = b.tly ?? [yR - 0.16, yR - 0.06];
  if (b.tails) {
    for (const q of b.tails.lens) endQuad(B, sh, -1, growQuad(q, 0.02), DARK, TRIM, 0.006);
    for (const q of b.tails.lit) endQuad(tail, sh, -1, q, TAIL, 0, 0.012);
  } else if (b.roundTails) {
    const { xs, y, r } = b.roundTails;
    for (const x of xs) for (const sx of [-1, 1]) {
      const z = surfZ(sh, -1, x, y);
      B.lathe(sx * x, y, z, 'z', [[r * 1.3, 0.02], [r * 1.25, -0.02], [r * 1.02, -0.022]], detail ? 16 : 10, DARK, TRIM);
      tail.lathe(sx * x, y, z, 'z', [[r, -0.012], [r * 0.4, -0.024], [0, -0.026]], detail ? 16 : 10, TAIL, 0);
    }
  } else {
    endStrip(B, sh, -1, b.tailBar ? 0 : Math.max(0, tlx[0] - 0.03), tlx[1] + 0.015, tly[0] - 0.03, tly[1] + 0.025, DARK, TRIM, 0.006);
    endStrip(tail, sh, -1, tlx[0], tlx[1], tly[0], tly[1], TAIL, 0, 0.012);
  }
  if (b.tailBar) endStrip(tail, sh, -1, 0, b.tails || b.roundTails ? tlx[1] : tlx[0], tly[1] - 0.04, tly[1] - 0.01, TAIL, 0, 0.012);
  if (b.rearVent) endStrip(B, sh, -1, 0, tlx[0] - 0.04, tly[0] - b.rearVent, tly[0] - 0.03, PLASTIC, TRIM, 0.008);
  const plateY = b.plateY ?? Math.max(b.clear + 0.24, tly[0] - 0.2);
  endStrip(B, sh, -1, 0, 0.25, plateY - 0.055, plateY + 0.055, 0xd9dde4, TRIM, 0.01);
  if (b.diffuser) {
    endStrip(B, sh, -1, 0, hw * 0.78, b.clear + 0.01, b.clear + 0.15, PLASTIC, TRIM, 0.01);
    for (const x of [-0.5, -0.17, 0.17, 0.5]) B.box(x * hw * 1.3, b.clear + 0.07, -hl + 0.06, 0.025, 0.13, 0.36, PLASTIC, TRIM);
  }
  const exX = { dual: [-0.6, 0.6], quad: [-0.68, -0.5, 0.5, 0.68], center: [-0.07, 0.07], single: [0.55], twin: [0.42, 0.56], quadc: [-0.2, -0.07, 0.07, 0.2], hex: [0], none: [] }[b.exhaust ?? 'single'];
  const exN = b.exSides ?? (detail ? 12 : 8);
  const exhausts = [], exR = b.exR ?? 0.042, exY = b.exY ?? b.clear + 0.1;
  for (const f of exX) {
    const x = f * hw, ez = -hl + 0.02;
    B.lathe(x, exY, ez, 'z', [[exR, 0.3], [exR, -0.06], [exR * 0.74, -0.06]], exN, 0xb8bcc6, METAL);
    B.lathe(x, exY, ez, 'z', [[exR * 0.75, -0.035], [0, -0.035]], exN, 0x050505, TRIM);
    exhausts.push([x, exY, ez - 0.07]);
  }

  // ---- body add-ons
  if (b.cab) { // mirrors
    const t = b.cab.f0 - 0.04, z = tZ(t), y = sh.top(t) + 0.08, x = sh.halfAt(t, sh.top(t)) - 0.04;
    for (const sx of [-1, 1]) {
      // a small stalk-mounted housing, rounded at the front, with the mirror glass facing back
      B.box(sx * (x + 0.03), y - 0.03, z, 0.06, 0.025, 0.04, PLASTIC, TRIM);
      B.hexa([[sx * (x + 0.05), y - 0.035, z - 0.045], [sx * (x + 0.17), y - 0.03, z - 0.045], [sx * (x + 0.165), y - 0.025, z + 0.02], [sx * (x + 0.05), y - 0.03, z + 0.035],
        [sx * (x + 0.05), y + 0.045, z - 0.045], [sx * (x + 0.17), y + 0.045, z - 0.045], [sx * (x + 0.165), y + 0.04, z + 0.02], [sx * (x + 0.05), y + 0.04, z + 0.035]], WHITE, PAINT);
      B.box(sx * (x + 0.11), y + 0.005, z - 0.047, 0.1, 0.06, 0.004, 0x8fa3bd, GLASS);
    }
  }
  if (b.roofSpoiler) {
    const z = tZ(b.cab.r1 + 0.015), y = b.cab.h - 0.03, rx = hw * b.cab.w * 0.95;
    B.hexa([[-rx, y, z - 0.2], [rx, y, z - 0.2], [rx, y, z + 0.05], [-rx, y, z + 0.05], [-rx, y + 0.045, z - 0.25], [rx, y + 0.045, z - 0.25], [rx, y + 0.045, z + 0.05], [-rx, y + 0.045, z + 0.05]], WHITE, PAINT);
  }
  if (b.ducktail) { // a kicked-up lip on the rear deck
    const t0 = 0.05, t1 = 0.13, z0 = tZ(t0), z1 = tZ(t1), y0 = sh.topAt(t0, 0), y1 = sh.topAt(t1, 0), rx = sh.planW(0.09) * 0.8, k = b.ducktail;
    B.hexa([[-rx, y0 - 0.03, z0], [rx, y0 - 0.03, z0], [rx, y1 - 0.02, z1], [-rx, y1 - 0.02, z1], [-rx, y0 + k, z0 - 0.02], [rx, y0 + k, z0 - 0.02], [rx, y1 + 0.005, z1], [-rx, y1 + 0.005, z1]], WHITE, PAINT);
  }
  if (b.cline) { // a polished C sweeping round behind the front doors
    const { t, rt, y, ry } = b.cline, path = [];
    for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + Math.PI * (i / 16); path.push([t - rt * Math.cos(a), y + ry * Math.sin(a)]); }
    sideStrip(B, sh, path, 0.045, 0xd5d9e0, METAL, 0.012);
  }
  if (b.scoop) { // hood scoop
    const [t0, t1, sw] = b.scoop, z0 = tZ(t0), z1 = tZ(t1), y0 = sh.topAt(t0, 0) - 0.02, y1 = sh.topAt(t1, 0) - 0.02;
    B.hexa([[-sw, y0, z0], [sw, y0, z0], [sw * 0.85, y1, z1], [-sw * 0.85, y1, z1], [-sw, y0 + 0.11, z0], [sw, y0 + 0.11, z0], [sw * 0.85, y1 + 0.04, z1], [-sw * 0.85, y1 + 0.04, z1]], WHITE, PAINT);
    B.box(0, y0 + 0.065, z0 + Math.sign(z1 - z0) * 0.004, sw * 1.7, 0.07, 0.02, DARK, TRIM);
  }
  if (b.vents) for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { // hood vents
    const t = b.vents[0] + i * 0.018, z = tZ(t), x = sx * b.vents[1];
    B.box(x, sh.topAt(t, Math.abs(x)) + 0.004, z, 0.26, 0.012, 0.035, PLASTIC, TRIM);
  }
  if (b.fin) { // shark fin down the engine cover
    const t0 = 0.04, t1 = b.cab.r1 + 0.02, z0 = tZ(t0), z1 = tZ(t1), y0 = sh.topAt(t0, 0), y1 = b.cab.h;
    B.hexa([[-0.012, y0 - 0.04, z0], [0.012, y0 - 0.04, z0], [0.012, y1 - 0.06, z1], [-0.012, y1 - 0.06, z1], [-0.012, y0 + 0.14, z0 + 0.1], [0.012, y0 + 0.14, z0 + 0.1], [0.012, y1 + 0.02, z1], [-0.012, y1 + 0.02, z1]], WHITE, PAINT);
  }
  if (b.intakes) sidePatch(B, sh, b.intakes[0], b.intakes[1], b.clear + 0.2, sh.top((b.intakes[0] + b.intakes[1]) / 2) - 0.1, PLASTIC, TRIM, 0.008, 0.6);
  if (b.blade && b.intakes) sidePatch(B, sh, b.intakes[1], b.intakes[1] + 0.05, b.clear + 0.12, sh.top(b.intakes[1]) - 0.08, b.blade, TRIM, 0.01); // side blade
  if (detail && b.cab && !b.noDoors) {
    // door shut lines, handles, and a trim line along the bottom of the side windows
    const cab = b.cab, R = (b.wheel * 1.12 + 0.06) / L, tf = Math.min(cab.f0 - 0.006, b.axle[1] - R);
    const doors = cab.b != null ? [[cab.b + 0.008, tf], [Math.max(b.axle[0] + R, cab.b - 0.24), cab.b - 0.008]] : [[Math.max(b.axle[0] + R, tf - 1.22 / L), tf]];
    const seam = 0x0b0d11, y0 = b.clear + 0.2;
    for (const [t0, t1] of doors) {
      for (const t of [t0, t1]) sideStrip(B, sh, [[t, y0], [t, sh.top(t) - 0.025]], 0.008, seam, TRIM, 0.004);
      sideStrip(B, sh, [[t0, y0], [t1, y0]], 0.008, seam, TRIM, 0.004);
      const th = t0 + 0.03, yh = sh.top(th) - 0.12;
      sidePatch(B, sh, th, th + 0.045, yh, yh + 0.028, b.chromeHandles ? 0xc8ccd4 : 0x1a1d22, b.chromeHandles ? METAL : TRIM, 0.012);
    }
    const tb0 = Math.max(cab.r0, doors[doors.length - 1][0]), tb1 = cab.f0 - 0.004;
    if (tb1 > tb0) sideStrip(B, sh, [[tb0, sh.top(tb0) - 0.006], [(tb0 + tb1) / 2, sh.top((tb0 + tb1) / 2) - 0.006], [tb1, sh.top(tb1) - 0.006]], 0.016, b.beltChrome ? 0xc8ccd4 : 0x15171b, b.beltChrome ? METAL : TRIM, 0.006);
  }
  if (b.skirt) sidePatch(B, sh, b.axle[0] + 0.07, b.axle[1] - 0.07, b.clear + 0.005, b.clear + 0.085, b.skirt === true ? PLASTIC : b.skirt, TRIM, 0.014);
  if (b.stripe) { // twin racing stripes over the hood and roof (not the glass)
    const n = 60, col = new THREE.Color(b.stripe), cab = b.cab;
    const onGlass = (t) => cab && ((t > cab.f1 && t < cab.f0) || (t > cab.r0 && t < cab.r1 && cab.rearGlass !== false));
    for (let i = 0; i < n; i++) {
      const ta = i / n, tb = (i + 1) / n;
      if (onGlass((ta + tb) / 2)) continue;
      for (const sx of [-1, 1]) {
        const xa = 0.07, xb = 0.25;
        const P = (t, x) => [sx * x, sh.topAt(t, x) + 0.005, tZ(t)];
        B.quad(P(ta, xa), P(ta, xb), P(tb, xb), P(tb, xa), col, [sx * 0.16, sh.topAt(ta, 0.16) - 1, tZ(ta)], TRIM);
      }
    }
  }
  if (b.bed) { // pickup bed: a dark well behind the cab
    const z0 = -hl + 0.1, z1 = tZ(b.cab.r0) - 0.06, y = sh.topAt(0.2, 0) + 0.006;
    B.box(0, y, (z0 + z1) / 2, sh.planW(0.2) * 2 - 0.22, 0.012, z1 - z0, DARK, TRIM);
  }
  if (b.wing) {
    const wg = b.wing, t = wg.t ?? 0.05, z = tZ(t), yb0 = sh.topAt(t, hw * 0.55), y = yb0 + wg.h, half = hw * (wg.w ?? 0.88), ch = wg.chord ?? 0.3;
    const slot = wg.color != null ? TRIM : PAINT, wc = wg.color ?? WHITE;
    B.hexa([[-half, y - 0.02, z - ch / 2], [half, y - 0.02, z - ch / 2], [half, y - 0.035, z + ch / 2], [-half, y - 0.035, z + ch / 2],
      [-half, y + 0.05, z - ch / 2 - 0.02], [half, y + 0.05, z - ch / 2 - 0.02], [half, y + 0.005, z + ch / 2], [-half, y + 0.005, z + ch / 2]], wc, slot);
    for (const sx of [-1, 1]) {
      B.box(sx * (half + 0.012), y + 0.01, z, 0.024, 0.2, ch + 0.08, PLASTIC, TRIM); // end plates
      const ux = sx * half * 0.6;
      B.hexa([[ux - 0.02, yb0 - 0.03, z - 0.03], [ux + 0.02, yb0 - 0.03, z - 0.03], [ux + 0.02, yb0 - 0.03, z + 0.12], [ux - 0.02, yb0 - 0.03, z + 0.12],
        [ux - 0.02, y, z - 0.08], [ux + 0.02, y, z - 0.08], [ux + 0.02, y, z + 0.03], [ux - 0.02, y, z + 0.03]], PLASTIC, TRIM);
    }
    if (wg.light) tail.box(0, y + 0.02, z - ch / 2 - 0.03, half * 1.5, 0.018, 0.012, TAIL, 0);
  }
  if (b.policeBar) { // roof bar (its red and blue lamps are drawn and flashed by world.js)
    const z = tZ((b.cab.r1 + b.cab.f1) / 2);
    B.box(0, b.cab.h + 0.06, z, 1.12, 0.1, 0.3, DARK, TRIM);
    for (const sx of [-1, 1]) B.box(sx * 0.42, b.cab.h + 0.015, z, 0.08, 0.05, 0.22, DARK, TRIM);
  }
  if (b.band) sidePatch(B, sh, 0.12, 0.88, b.clear + 0.32, b.clear + 0.5, b.band, TRIM, 0.01);
  if (b.roofSign) { // taxi
    const z = tZ((b.cab.r1 + b.cab.f1) / 2);
    head.box(0, b.cab.h + 0.13, z, 0.6, 0.15, 0.2, 0xfff1a8, 0);
    B.box(0, b.cab.h + 0.04, z, 0.64, 0.05, 0.24, DARK, TRIM);
  }

  // ---- wheels (+ brake calipers, which stay put while the wheels spin)
  const tw = b.tyre ?? Math.min(0.32, 0.17 + wr * 0.32);
  const wx = b.track ?? Math.min(sh.planW(b.axle[0]), sh.planW(b.axle[1])) - tw / 2 - 0.02;
  if (b.caliper) for (const az of axZ) for (const sx of [-1, 1]) B.box(sx * (wx + tw / 2 - 0.115), wr * 1.36, az - wr * 0.26, 0.05, wr * 0.42, wr * 0.34, b.caliper, TRIM);
  if (detail) for (const az of axZ) for (const sx of [-1, 1]) B.lathe(sx * (wx + tw / 2 - 0.14), wr, az, 'x', [[wr * 0.5, -0.012], [wr * 0.5, 0.012]], 18, 0x8a8f99, METAL, true); // brake discs
  const wb = wheelBuilder(wr, tw, b.rim ?? {}, detail);
  const at = [];
  axZ.forEach((az, i) => { for (const sx of [-1, 1]) at.push([sx * wx, wr, az, i === axZ.length - 1]); });
  if (bakeWheels) for (const [x, y, z] of at) bake(B, wb, x, y, z);

  let hx = (hlx[0] + hlx[1]) / 2, tx = (tlx[0] + tlx[1]) / 2, hy = (hly[0] + hly[1]) / 2, ty = (tly[0] + tly[1]) / 2;
  if (b.lamps) [hx, hy] = quadMid(b.lamps.lens[0]);
  if (b.roundLights) { hx = b.roundLights.x; hy = b.roundLights.y; }
  if (b.tails) [tx, ty] = quadMid(b.tails.lens[0]);
  if (b.roundTails) { tx = b.roundTails.xs[b.roundTails.xs.length - 1]; ty = b.roundTails.y; }
  return {
    parts: B.geometries(b.crease ?? 38), head: head.geometry(), tail: tail.geometry(),
    headGlow: flareQuads(1, [-hx, hx], hy, 0.5, 0xffe6b8, hl),
    tailGlow: flareQuads(-1, [-tx, tx], ty, 0.4, 0xff2a3a, hl),
    wheel: bakeWheels ? null : { parts: wb.geometries(), r: wr, at },
    exhausts, hl, hw, roofH: b.cab ? b.cab.h : sh.top(0.5),
  };
}

// ---------------------------------------------------------------- traffic

const SEDAN = {
  L: 4.7, W: 1.78, clear: 0.15, wheel: 0.31, axle: [0.2, 0.79], top: [[0, 0.84], [0.05, 0.9], [0.22, 0.92], [0.55, 0.92], [0.85, 0.86], [0.96, 0.8], [1, 0.7]],
  nose: 0.2, tail: 0.14, cab: { r0: 0.17, r1: 0.31, f1: 0.57, f0: 0.72, h: 1.44, w: 0.78, b: 0.45 }, rim: { spokes: 5, color: 0xaeb3bc }, sill: PLASTIC, pillar: DARK,
};
const TRAFFIC = {
  sedan: SEDAN,
  taxi: { ...SEDAN, roofSign: true, rim: { disc: true, color: 0x9aa0aa } },
  hatch: { L: 4.0, W: 1.74, clear: 0.15, wheel: 0.3, axle: [0.16, 0.81], top: [[0, 0.88], [0.04, 0.93], [0.5, 0.93], [0.85, 0.86], [1, 0.72]],
    nose: 0.2, tail: 0.12, cab: { r0: 0.02, r1: 0.12, f1: 0.56, f0: 0.72, h: 1.47, w: 0.8, b: 0.38 }, roofSpoiler: true, rim: { disc: true, color: 0x9aa0aa }, sill: PLASTIC, pillar: DARK },
  suv: { L: 4.8, W: 1.94, clear: 0.24, wheel: 0.37, axle: [0.18, 0.8], top: [[0, 1.08], [0.05, 1.12], [0.5, 1.12], [0.85, 1.07], [1, 0.92]],
    nose: 0.18, tail: 0.1, chin: 0.06, cab: { r0: 0.03, r1: 0.1, f1: 0.62, f0: 0.76, h: 1.78, w: 0.84, b: 0.42 }, sill: PLASTIC, pillar: DARK, skirt: true, rim: { spokes: 6, color: 0x8d939d } },
  van: { L: 5.2, W: 1.98, clear: 0.2, wheel: 0.35, axle: [0.16, 0.82], top: [[0, 1.0], [0.05, 1.04], [0.6, 1.04], [0.88, 1.0], [1, 0.84]],
    nose: 0.16, tail: 0.06, cab: { r0: 0.01, r1: 0.03, f1: 0.8, f0: 0.9, h: 2.08, w: 0.92, gw: 0.9, b: 0.62 }, sill: PLASTIC, pillar: DARK, rim: { disc: true, color: 0x7d838d },
    hly: [0.7, 0.8], tly: [0.6, 0.94], tlx: [0.8, 0.95] },
  // a low sports coupe (fast lanes, loves to overtake)
  sport: { L: 4.5, W: 1.92, clear: 0.11, wheel: 0.34, axle: [0.18, 0.8], nose: 0.28, noseLen: 0.12, tail: 0.14, fender: [0.1, 0.06], flare: [0.02, 0.05], hoodCrown: 0, chin: 0.07,
    top: [[0, 0.84], [0.04, 0.88], [0.25, 0.86], [0.5, 0.76], [0.75, 0.68], [0.92, 0.6], [1, 0.5]], cab: { r0: 0.22, r1: 0.4, f1: 0.58, f0: 0.74, h: 1.2, w: 0.66, gw: 0.8, fast: 0.6 },
    sill: PLASTIC, splitter: true, diffuser: true, wing: { h: 0.1, t: 0.045, chord: 0.26, color: 0x15171b }, hly: [0.5, 0.56], tailBar: true, tlx: [0.4, 0.9], tly: [0.66, 0.73], rim: { spokes: 5, sw: 0.07, color: 0x2a2d33 }, exhaust: 'dual' },
  // highway patrol: a sedan with a light bar (lit by world.js) and a blue band down the sides
  police: { ...SEDAN, L: 4.8, W: 1.84, policeBar: true, band: 0x1d3f9a, rim: { spokes: 6, color: 0x2a2d33 }, grille: [0.5, 0.2, 0.5] },
  pickup: { L: 5.3, W: 1.98, clear: 0.28, wheel: 0.39, axle: [0.17, 0.79], top: [[0, 1.1], [0.04, 1.14], [0.55, 1.14], [0.85, 1.12], [1, 1.0]],
    nose: 0.1, tail: 0.04, chin: 0.05, lift: 0.08, hoodCrown: 0, cab: { r0: 0.4, r1: 0.42, f1: 0.62, f0: 0.74, h: 1.86, w: 0.86, b: 0.52 }, sill: PLASTIC, pillar: DARK, bed: true,
    grille: [0.6, 0.58, 0.86], hly: [0.88, 0.98], hlx: [0.62, 0.92], tly: [0.78, 1.06], tlx: [0.86, 0.97], rim: { spokes: 6, color: 0xb0b5be } },
};

/** Traffic vehicles, keyed by kind id (see traffic.js KINDS). Wheels are baked in. */
export function trafficGeometry(kind) {
  if (TRAFFIC[kind]) return carGeometry(TRAFFIC[kind], { detail: false, bakeWheels: true });
  const B = new Builder(), head = new Builder(), tail = new Builder();
  let hl, hw, tailX, tailY;
  if (kind === 'moto') return motoGeometry();
  if (kind === 'semi') {
    // tractor unit up front pulling a long box trailer
    hl = 8.3; hw = 1.27;
    const cab = { L: 2.7, W: 2.48, clear: 0.45, wheel: 0.52, axle: [0.5], top: [[0, 2.0], [0.5, 2.0], [0.8, 1.9], [1, 1.42]], nose: 0.06, tail: 0, chin: 0.02, lift: 0, arch: 0.07, hoodCrown: 0.01,
      cab: { r0: 0, r1: 0.02, f1: 0.6, f0: 0.84, h: 3.15, w: 0.94, gw: 0.94 }, step: 0.18 };
    B.off = [0, 0, hl - 1.35];
    const sh = loftBody(B, cab);
    endStrip(head, sh, 1, 0.64, 1.04, 0.86, 1.0, HEAD, 0, 0.012);
    endStrip(B, sh, 1, 0, 0.62, 0.6, 1.35, 0xb8bcc6, METAL, 0.01); // chrome grille
    B.off = [0, 0, 0];
    B.box(0, 3.35, hl - 1.7, 2.3, 0.5, 1.0, WHITE, PAINT); // roof fairing
    for (const sx of [-1, 1]) { B.box(sx * 1.05, 3.0, hl - 2.75, 0.14, 2.2, 0.14, 0xb8bcc6, METAL); B.box(sx * 1.05, 4.2, hl - 2.75, 0.1, 0.25, 0.1, 0x2a2e36, TRIM); } // exhaust stacks
    for (const sx of [-1, 1]) B.box(sx * 1.0, 0.75, hl - 3.3, 0.5, 0.48, 1.1, 0xb8bcc6, METAL); // fuel tanks
    B.box(0, 2.6, -1.4, 2.52, 2.9, 13.0, 0xe9ecf1, TRIM); // trailer box
    for (let z = -7.6; z <= 4.8; z += 0.9) for (const sx of [-1, 1]) B.box(sx * 1.265, 2.6, z, 0.02, 2.85, 0.07, 0xc5c9d1, TRIM);
    for (const sx of [-1, 1]) B.box(sx * 1.267, 1.25, -1.4, 0.012, 0.08, 12.6, 0xd03040, TRIM); // reflective tape
    B.box(0, 0.95, -1.4, 2.2, 0.3, 13.0, PLASTIC, TRIM); // trailer chassis + skirt
    for (const sx of [-1, 1]) B.box(sx * 1.15, 0.8, -1.0, 0.04, 0.5, 6.0, 0x2a2e36, TRIM); // side skirts
    B.box(0, 0.72, -hl + 0.05, 2.36, 0.14, 0.1, 0x8a8f99, METAL);
    const wb = wheelBuilder(0.52, 0.34, { disc: true, color: 0xb6bac2, size: 0.6 }, false);
    for (const z of [hl - 1.35, hl - 4.2, hl - 5.5, -hl + 1.6, -hl + 2.9]) for (const sx of [-1, 1]) bake(B, wb, sx * 1.02, 0.52, z);
    tail.box(-1.0, 1.0, -hl - 0.01, 0.26, 0.3, 0.04, TAIL, 0); tail.box(1.0, 1.0, -hl - 0.01, 0.26, 0.3, 0.04, TAIL, 0);
    for (const x of [-1.05, -0.5, 0, 0.5, 1.05]) tail.box(x, 4.03, -hl - 0.01, 0.12, 0.05, 0.04, AMBER, 0);
    for (let z = -7; z <= 4; z += 2.2) for (const sx of [-1, 1]) tail.box(sx * 1.27, 3.95, z, 0.03, 0.05, 0.12, AMBER, 0);
    tailX = 1.0; tailY = 1.0;
  } else if (kind === 'truck') {
    // box truck: cab up front, cargo box behind
    hl = 4.6; hw = 1.2;
    const cab = { L: 2.5, W: 2.36, clear: 0.42, wheel: 0.5, axle: [0.54], top: [[0, 1.95], [0.5, 1.95], [0.8, 1.85], [1, 1.38]], nose: 0.06, tail: 0, chin: 0.02, lift: 0, arch: 0.07, hoodCrown: 0.01,
      cab: { r0: 0, r1: 0.02, f1: 0.6, f0: 0.84, h: 2.95, w: 0.94, gw: 0.94 }, step: 0.18 };
    B.off = [0, 0, hl - 1.25];
    const sh = loftBody(B, cab);
    endStrip(head, sh, 1, 0.66, 1.04, 0.84, 0.98, HEAD, 0, 0.012);
    endStrip(B, sh, 1, 0, 0.6, 0.6, 1.2, 0x2a2e36, METAL, 0.01); // grille
    B.off = [0, 0, 0];
    B.box(0, 2.15, -1.0, 2.46, 2.75, 6.9, 0xe7eaef, TRIM); // cargo box (stays light grey)
    for (let z = -4.2; z <= 2.2; z += 0.8) for (const sx of [-1, 1]) B.box(sx * 1.235, 2.15, z, 0.02, 2.7, 0.06, 0xc3c7cf, TRIM);
    B.box(0, 0.68, -0.9, 1.9, 0.3, 7.8, PLASTIC, TRIM); // chassis
    for (const sx of [-1, 1]) B.box(sx * 0.95, 0.72, 0.6, 0.45, 0.42, 0.9, 0x6c727c, METAL); // fuel tanks
    B.box(0, 0.62, -hl + 0.05, 2.3, 0.14, 0.1, 0x8a8f99, METAL); // rear bumper bar
    for (const sx of [-1, 1]) B.box(sx * 1.236, 0.95, -1.0, 0.012, 0.07, 6.6, 0xd03040, TRIM); // reflective tape
    const wb = wheelBuilder(0.5, 0.32, { disc: true, color: 0xb6bac2, size: 0.6 }, false);
    for (const z of [hl - 1.15, -2.65, -3.75]) for (const sx of [-1, 1]) bake(B, wb, sx * 1.0, 0.5, z);
    tail.box(-1.0, 0.9, -hl - 0.01, 0.24, 0.3, 0.04, TAIL, 0); tail.box(1.0, 0.9, -hl - 0.01, 0.24, 0.3, 0.04, TAIL, 0);
    for (const x of [-1.0, -0.5, 0, 0.5, 1.0]) tail.box(x, 3.47, -hl - 0.01, 0.12, 0.05, 0.04, AMBER, 0); // marker lights
    for (let z = -4; z <= 2; z += 2) for (const sx of [-1, 1]) tail.box(sx * 1.24, 3.4, z, 0.03, 0.05, 0.12, AMBER, 0);
    tailX = 1.0; tailY = 0.9;
  } else { // bus: a long loft with a band of glass
    hl = 5.8; hw = 1.24;
    const bus = { L: 11.6, W: 2.48, clear: 0.32, wheel: 0.5, axle: [0.22, 0.83], top: [[0, 1.3], [1, 1.3]], nose: 0.08, tail: 0.06, noseLen: 0.025, tailLen: 0.02, chin: 0.02, lift: 0.02, side: 0.4, tumble: 0.01,
      cab: { r0: 0.006, r1: 0.016, f1: 0.975, f0: 0.997, h: 3.05, w: 0.97, gw: 0.985 }, crown: 0.06, step: 0.5 };
    const sh = loftBody(B, bus);
    sidePatch(B, sh, 0.012, 0.975, 2.5, 3.0, WHITE, PAINT, 0.01); // painted band above the windows
    for (const sx of [-1, 1]) for (let z = -5.0; z < 4.6; z += 1.2) head.box(sx * 1.235, 2.0, z + 0.5, 0.01, 0.6, 1.0, 0x6b5a3c, 0); // lit cabin
    endStrip(head, sh, 1, 0.62, 1.0, 0.72, 0.86, HEAD, 0, 0.012);
    endStrip(head, sh, 1, 0, 0.8, 2.62, 2.84, 0x7fe9ff, 0, 0.014); // route sign
    endStrip(B, sh, -1, 0, 1.05, 1.4, 2.9, 0x2a3240, TRIM, 0.01); // rear panel
    B.box(0, 3.16, -1.5, 1.6, 0.22, 2.6, 0xc8ccd3, TRIM); // roof AC pod
    const wb = wheelBuilder(0.5, 0.3, { disc: true, color: 0xb6bac2, size: 0.6 }, false);
    for (const z of sh.axZ) for (const sx of [-1, 1]) bake(B, wb, sx * 1.06, 0.5, z);
    endStrip(tail, sh, -1, 0.8, 1.12, 0.62, 1.15, TAIL, 0, 0.012);
    tailX = 0.96; tailY = 0.9;
  }
  return {
    parts: B.geometries(), head: head.geometry(), tail: tail.geometry(),
    headGlow: flareQuads(1, [-0.85, 0.85], 0.9, 0.6, 0xffe6b8, hl), tailGlow: flareQuads(-1, [-tailX, tailX], tailY, 0.5, 0xff2a3a, hl),
    wheel: null, exhausts: [], hl, hw,
  };
}

/** A sports bike with its rider (helmet in the paint colour), 2.2 m long. */
function motoGeometry() {
  const B = new Builder(), head = new Builder(), tail = new Builder(), hl = 1.1, hw = 0.42;
  const wb = wheelBuilder(0.31, 0.16, { spokes: 5, sw: 0.05, color: 0x2a2d33, size: 0.7 }, false);
  bake(B, wb, 0, 0.31, 0.72); bake(B, wb, 0, 0.31, -0.72);
  const P = (x, y, z) => [x, y, z];
  // frame and fairing
  B.hexa([P(-0.16, 0.42, 0.25), P(0.16, 0.42, 0.25), P(0.12, 0.62, 0.95), P(-0.12, 0.62, 0.95), P(-0.17, 0.9, 0.2), P(0.17, 0.9, 0.2), P(0.11, 1.1, 0.78), P(-0.11, 1.1, 0.78)], WHITE, PAINT); // front fairing
  B.hexa([P(-0.15, 0.82, -0.05), P(0.15, 0.82, -0.05), P(0.15, 0.85, 0.32), P(-0.15, 0.85, 0.32), P(-0.13, 1.02, -0.02), P(0.13, 1.02, -0.02), P(0.12, 1.02, 0.28), P(-0.12, 1.02, 0.28)], WHITE, PAINT); // tank
  B.hexa([P(-0.12, 0.8, -0.75), P(0.12, 0.8, -0.75), P(0.14, 0.82, -0.05), P(-0.14, 0.82, -0.05), P(-0.08, 0.95, -0.85), P(0.08, 0.95, -0.85), P(0.12, 0.92, -0.05), P(-0.12, 0.92, -0.05)], WHITE, PAINT); // tail
  B.box(0, 0.93, -0.32, 0.24, 0.05, 0.5, 0x15161a, TRIM); // seat
  B.box(0, 0.5, -0.05, 0.3, 0.32, 0.5, 0x3a3e46, METAL); // engine
  B.box(0.1, 0.55, -0.62, 0.08, 0.08, 0.5, 0xb8bcc6, METAL); // exhaust
  B.box(0, 0.62, 0.62, 0.05, 0.6, 0.06, 0x8a8f99, METAL); B.box(0, 0.5, -0.45, 0.06, 0.06, 0.6, 0x2a2e36, TRIM); // fork, swingarm
  B.box(0, 1.16, 0.62, 0.26, 0.12, 0.04, 0x26344a, GLASS); // screen
  // rider: legs, torso leaning over the tank, arms to the bars, helmet
  const L = 0x1a1b20;
  for (const sx of [-1, 1]) {
    B.hexa([P(sx * 0.1, 0.9, -0.3), P(sx * 0.22, 0.9, -0.3), P(sx * 0.22, 0.9, 0.0), P(sx * 0.1, 0.9, 0.0), P(sx * 0.1, 1.04, -0.32), P(sx * 0.22, 1.04, -0.32), P(sx * 0.22, 1.04, 0.05), P(sx * 0.1, 1.04, 0.05)], L, TRIM); // thigh
    B.box(sx * 0.2, 0.7, -0.1, 0.1, 0.32, 0.12, L, TRIM); // shin
    B.hexa([P(sx * 0.12, 1.3, 0.12), P(sx * 0.2, 1.3, 0.12), P(sx * 0.2, 1.08, 0.6), P(sx * 0.12, 1.08, 0.6), P(sx * 0.12, 1.36, 0.14), P(sx * 0.2, 1.36, 0.14), P(sx * 0.2, 1.14, 0.6), P(sx * 0.12, 1.14, 0.6)], L, TRIM); // arm
  }
  B.hexa([P(-0.2, 0.98, -0.25), P(0.2, 0.98, -0.25), P(0.18, 1.18, 0.3), P(-0.18, 1.18, 0.3), P(-0.2, 1.26, -0.32), P(0.2, 1.26, -0.32), P(0.17, 1.42, 0.22), P(-0.17, 1.42, 0.22)], 0x22262e, TRIM); // torso
  B.lathe(0, 1.47, 0.36, 'z', [[0.001, 0.15], [0.1, 0.13], [0.145, 0.04], [0.14, -0.05], [0.11, -0.12], [0.001, -0.13]], 12, WHITE, PAINT); // helmet
  B.box(0, 1.47, 0.48, 0.2, 0.08, 0.06, 0x111317, GLASS); // visor
  head.box(0, 0.86, 1.0, 0.16, 0.08, 0.03, HEAD, 0);
  tail.box(0, 0.9, -0.87, 0.14, 0.05, 0.03, TAIL, 0);
  return {
    parts: B.geometries(), head: head.geometry(), tail: tail.geometry(),
    headGlow: flareQuads(1, [0], 0.86, 0.45, 0xffe6b8, hl), tailGlow: flareQuads(-1, [0], 0.9, 0.3, 0xff2a3a, hl),
    wheel: null, exhausts: [], hl, hw,
  };
}

// ---------------------------------------------------------------- materials

let ENV = null, HI = true;
/** Call once before building cars: the reflection map and the quality level. */
export function setCarLook(env, hi) { ENV = env; HI = hi; }
export const carLookHi = () => HI;
export const carLookEnv = () => ENV;

/** Materials for the four slots. For traffic, paint is white and instance colours paint it. */
export function slotMaterials(paint, traffic = false) {
  if (!HI) {
    return [
      new THREE.MeshLambertMaterial({ color: paint ?? 0xffffff, vertexColors: true }),
      new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x121a26 }),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a1c20 }),
    ];
  }
  const envMap = ENV;
  return [
    traffic
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.3, roughness: 0.45, envMap, envMapIntensity: 1 })
      : new THREE.MeshPhysicalMaterial({ color: paint, vertexColors: true, metalness: 0.4, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.16, envMap, envMapIntensity: 1.25 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.12, envMap, envMapIntensity: 1.7 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.6, envMap, envMapIntensity: 0.6 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.2, envMap, envMapIntensity: 1.2 }),
  ];
}

let flareTex;
export function flareTexture() {
  if (flareTex) return flareTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.15, 'rgba(255,255,255,0.45)'); g.addColorStop(0.45, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  flareTex = new THREE.CanvasTexture(c);
  return flareTex;
}
export const glowMaterial = (opacity = 1) => new THREE.MeshBasicMaterial({ map: flareTexture(), vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
/** Unlit light material; brightness above 1 feeds the bloom on high quality. */
export const lightMaterial = (k = 1) => new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(k, k, k) });

/** A drivable car as a Group. userData: setPaint(hex), setBrake(on), spin(dt, v, steer), exhausts, dispose(). */
export function buildCar(spec, paint) {
  const geo = carGeometry(spec.body, { detail: true });
  const group = new THREE.Group();
  const mats = slotMaterials(paint ?? spec.color);
  geo.parts.forEach((g, i) => { if (g) group.add(new THREE.Mesh(g, mats[i])); });
  const headMat = lightMaterial(HI ? 2.6 : 1), tailMat = lightMaterial(HI ? 0.9 : 0.62);
  const headGlowMat = glowMaterial(0.7), tailGlowMat = glowMaterial(0.4);
  group.add(new THREE.Mesh(geo.head, headMat), new THREE.Mesh(geo.tail, tailMat), new THREE.Mesh(geo.headGlow, headGlowMat), new THREE.Mesh(geo.tailGlow, tailGlowMat));
  // wheels: each spins on its own x axis; the front pair also steers
  const W = geo.wheel, wheels = [];
  for (const [x, y, z, front] of W.at) {
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.position.set(x, y, z);
    W.parts.forEach((g, i) => { if (g) spin.add(new THREE.Mesh(g, mats[i])); });
    if (x < 0) pivot.scale.x = -1; // mirrored so the outer face points out (three.js flips the winding)
    pivot.add(spin); group.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  // a soft dark blob under the car grounds it on the road
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(spec.body.W + 0.7, spec.body.L + 0.9), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.9 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  group.add(shadow);
  let roll = 0;
  group.userData = {
    hl: geo.hl, hw: geo.hw, exhausts: geo.exhausts, roofH: geo.roofH,
    wheels: wheels.map((w) => w.pivot), wheelR: W.r, paintMat: mats[PAINT],
    setPaint: (c) => mats[PAINT].color.setHex(c),
    // blown up: everything scorched, lights dead, no shadow blob (it would tumble with the body)
    burn: () => {
      for (const m of mats) if (m && m.color) { m.color.lerp(CHAR, 0.82); if (m.envMapIntensity !== undefined) m.envMapIntensity = 0.12; if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.85); }
      headMat.color.setScalar(0.03); tailMat.color.setScalar(0.03); headGlowMat.opacity = 0; tailGlowMat.opacity = 0;
      shadow.visible = false;
    },
    setBrake: (on) => { tailMat.color.setScalar(on ? (HI ? 3 : 1) : (HI ? 0.9 : 0.62)); tailGlowMat.opacity = on ? 1 : 0.4; },
    spin: (dt, v, steer) => {
      roll = (roll + (v / W.r) * dt) % (Math.PI * 2);
      for (const w of wheels) { w.spin.rotation.x = roll; if (w.front) w.pivot.rotation.y = -steer * 0.35; }
    },
    dispose: () => { group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); for (const m of [...mats, headMat, tailMat, headGlowMat, tailGlowMat]) m.dispose(); },
  };
  return group;
}

const CHAR = new THREE.Color(0x15110e);

let blob;
function blobTexture() {
  if (blob) return blob;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.6, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  return blob;
}
