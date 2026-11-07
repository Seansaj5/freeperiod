// Low-poly vehicles built from code (no model files). Every vehicle is three geometries:
//   lit  - body (white vertex colour, so a material or instance colour paints it), glass, wheels
//   head - headlights, tail - tail lights (drawn unlit so they glow at night)
// Cars face +z, sit on y = 0, and are centred on x = 0, z = 0.
import * as THREE from 'three';

class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); }
  }
  /** A quad facing away from `ctr` (the solid's centre), whatever order the corners come in. */
  quad(a, b, c, d, col, ctr) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const fx = (a[0] + c[0]) / 2 - ctr[0], fy = (a[1] + c[1]) / 2 - ctr[1], fz = (a[2] + c[2]) / 2 - ctr[2];
    if (nx * fx + ny * fy + nz * fz < 0) { this.tri(a, c, b, col); this.tri(a, d, c, col); }
    else { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  }
  /** Eight-corner solid. Corners: bottom 0..3 then top 4..7, each ring going (-x,-z) (+x,-z) (+x,+z) (-x,+z). */
  hexa(q, hex) {
    const col = new THREE.Color(hex);
    const ctr = [0, 0, 0];
    for (const v of q) { ctr[0] += v[0] / 8; ctr[1] += v[1] / 8; ctr[2] += v[2] / 8; }
    const f = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
    for (const [a, b, c, d] of f) this.quad(q[a], q[b], q[c], q[d], col, ctr);
  }
  box(cx, cy, cz, sx, sy, sz, hex) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.hexa([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], hex);
  }
  /** Prism along x (a wheel): n sides, radius r, width w. */
  wheel(cx, cy, cz, r, w, hex, n = 8) {
    const col = new THREE.Color(hex);
    const ctr = [cx, cy, cz];
    const pt = (i, x) => { const a = (i / n) * Math.PI * 2 + Math.PI / n; return [x, cy + Math.cos(a) * r, cz + Math.sin(a) * r]; };
    const xa = cx - w / 2, xb = cx + w / 2;
    for (let i = 0; i < n; i++) {
      this.quad(pt(i, xa), pt(i + 1, xa), pt(i + 1, xb), pt(i, xb), col, ctr);
      this.tri(...[[xa, cy, cz], pt(i + 1, xa), pt(i, xa)].map((v) => v), col);
      this.tri(...[[xb, cy, cz], pt(i, xb), pt(i + 1, xb)].map((v) => v), col);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const BODY = 0xffffff, GLASS = 0x172030, TYRE = 0x0a0a0c, RIM = 0x5b6170, TRIM = 0x16181d;
const HEAD = 0xfff1d0, TAIL = 0xff1428;

/** A car from body params (see cars.js). */
export function carGeometry(b) {
  const lit = new Builder(), head = new Builder(), tail = new Builder();
  const { L, W, H, clear, cabF, cabR, cabH, slope, wheel, roofIn, nose } = b;
  const hl = L / 2, hw = W / 2, top = clear + H;
  // lower body with a sloped nose
  const tw = hw - 0.04;
  lit.hexa([
    [-hw, clear, -hl], [hw, clear, -hl], [hw, clear, hl], [-hw, clear, hl],
    [-tw, top, -hl + 0.06], [tw, top, -hl + 0.06], [tw, top - nose, hl - nose * 0.9], [-tw, top - nose, hl - nose * 0.9],
  ], BODY);
  // dark sills + bumpers give the body some depth
  lit.box(0, clear + 0.06, 0, W + 0.02, 0.12, L - 0.5, TRIM);
  lit.box(0, clear + 0.08, -hl + 0.03, W - 0.1, 0.16, 0.1, TRIM);
  // glass cabin
  const cw = hw - 0.08, rw = cw - roofIn, cy = top - 0.01;
  const topF = Math.max(cabR + 0.6, cabF - 0.22 - slope * 0.95);
  const topR = Math.min(topF - 0.35, cabR + 0.22 + slope * 0.35);
  lit.hexa([
    [-cw, cy, cabR], [cw, cy, cabR], [cw, cy, cabF], [-cw, cy, cabF],
    [-rw, cy + cabH, topR], [rw, cy + cabH, topR], [rw, cy + cabH, topF], [-rw, cy + cabH, topF],
  ], GLASS);
  // painted roof panel
  lit.box(0, cy + cabH + 0.015, (topR + topF) / 2, rw * 2 - 0.08, 0.04, topF - topR - 0.12, BODY);
  // wing
  if (b.wing) {
    const wy = top + b.wing;
    lit.box(0, wy, -hl + 0.28, W - 0.16, 0.05, 0.32, BODY);
    lit.box(-hw + 0.35, (top + wy) / 2, -hl + 0.3, 0.06, wy - top, 0.14, TRIM);
    lit.box(hw - 0.35, (top + wy) / 2, -hl + 0.3, 0.06, wy - top, 0.14, TRIM);
  }
  // wheels
  const wz = hl - Math.max(0.62, wheel * 2.3), wx = hw - 0.13;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    lit.wheel(sx * wx, wheel, sz * wz, wheel, 0.26, TYRE);
    lit.wheel(sx * (wx + 0.11), wheel, sz * wz, wheel * 0.62, 0.05, RIM, 6);
  }
  // lights
  const ly = top - nose - 0.12, lz = hl - nose * 0.45 + 0.02;
  head.box(-hw + 0.32, ly, lz, 0.42, 0.11, 0.06, HEAD);
  head.box(hw - 0.32, ly, lz, 0.42, 0.11, 0.06, HEAD);
  const ty = top - 0.13;
  if (b.wing) tail.box(0, ty, -hl - 0.005, W - 0.24, 0.08, 0.05, TAIL);
  else { tail.box(-hw + 0.28, ty, -hl - 0.005, 0.4, 0.13, 0.05, TAIL); tail.box(hw - 0.28, ty, -hl - 0.005, 0.4, 0.13, 0.05, TAIL); }
  return { lit: lit.geometry(), head: head.geometry(), tail: tail.geometry(), hl, hw };
}

/** Traffic vehicles, keyed by kind id (see traffic.js KINDS). */
export function trafficGeometry(kind) {
  const P = {
    sedan: { L: 4.7, W: 1.76, H: 0.68, clear: 0.2, cabF: 0.8, cabR: -1.55, cabH: 0.62, slope: 0.4, wheel: 0.32, roofIn: 0.12, nose: 0.12 },
    hatch: { L: 4.0, W: 1.72, H: 0.68, clear: 0.2, cabF: 0.7, cabR: -1.75, cabH: 0.68, slope: 0.32, wheel: 0.31, roofIn: 0.1, nose: 0.1 },
    suv: { L: 4.8, W: 1.94, H: 0.88, clear: 0.3, cabF: 0.95, cabR: -2.05, cabH: 0.72, slope: 0.3, wheel: 0.38, roofIn: 0.1, nose: 0.12 },
    van: { L: 5.2, W: 1.98, H: 1.02, clear: 0.3, cabF: 1.75, cabR: -2.5, cabH: 0.96, slope: 0.22, wheel: 0.36, roofIn: 0.05, nose: 0.2 },
  }[kind];
  if (P) return carGeometry(P);
  const lit = new Builder(), head = new Builder(), tail = new Builder();
  if (kind === 'truck') {
    const hl = 4.6, hw = 1.2;
    lit.box(0, 0.75, hl - 1.0, 2.3, 1.1, 2.0, BODY); // cab lower
    lit.box(0, 1.8, hl - 1.05, 2.2, 1.0, 1.8, GLASS); // cab glass
    lit.box(0, 2.35, hl - 1.1, 2.2, 0.12, 1.7, BODY);
    lit.box(0, 2.0, -0.95, 2.44, 3.0, 7.3, 0xe9ecf1); // cargo box (stays light grey)
    lit.box(0, 0.45, -0.9, 2.0, 0.3, 7.6, TRIM);
    for (const z of [hl - 1.2, -2.6, -3.8]) for (const sx of [-1, 1]) lit.wheel(sx * 1.02, 0.5, z, 0.5, 0.36, TYRE);
    head.box(-0.85, 0.75, hl + 0.01, 0.4, 0.16, 0.04, HEAD); head.box(0.85, 0.75, hl + 0.01, 0.4, 0.16, 0.04, HEAD);
    tail.box(-1.0, 0.75, -hl - 0.01, 0.22, 0.3, 0.04, TAIL); tail.box(1.0, 0.75, -hl - 0.01, 0.22, 0.3, 0.04, TAIL);
    tail.box(0, 3.45, -hl - 0.01, 2.2, 0.06, 0.04, 0xffa21a); // marker lights
    return { lit: lit.geometry(), head: head.geometry(), tail: tail.geometry(), hl, hw };
  }
  // bus
  const hl = 5.8, hw = 1.24;
  lit.box(0, 1.55, 0, 2.48, 2.5, 11.6, BODY);
  lit.box(0, 1.95, 0.2, 2.5, 0.9, 10.6, GLASS);
  lit.box(0, 1.6, hl - 0.05, 2.3, 1.6, 0.12, GLASS);
  for (const z of [hl - 1.6, -hl + 2.2]) for (const sx of [-1, 1]) lit.wheel(sx * 1.05, 0.5, z, 0.5, 0.34, TYRE);
  head.box(-0.85, 0.7, hl + 0.01, 0.42, 0.16, 0.04, HEAD); head.box(0.85, 0.7, hl + 0.01, 0.42, 0.16, 0.04, HEAD);
  head.box(0, 2.5, hl + 0.01, 1.6, 0.25, 0.04, 0x8cf2ff); // route sign
  for (const sx of [-1, 1]) head.box(sx * 1.255, 1.95, 0.2, 0.02, 0.62, 10.2, 0xffd890); // lit cabin windows
  tail.box(-1.0, 0.8, -hl - 0.01, 0.24, 0.42, 0.04, TAIL); tail.box(1.0, 0.8, -hl - 0.01, 0.24, 0.42, 0.04, TAIL);
  return { lit: lit.geometry(), head: head.geometry(), tail: tail.geometry(), hl, hw };
}

/** A drivable car as a Group: body paint is set with setPaint, brake lights with setBrake. */
export function buildCar(spec, paint) {
  const geo = carGeometry(spec.body);
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint ?? spec.color, vertexColors: true });
  const headMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const tailMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x9a9a9a });
  group.add(new THREE.Mesh(geo.lit, bodyMat), new THREE.Mesh(geo.head, headMat), new THREE.Mesh(geo.tail, tailMat));
  // a soft dark blob under the car grounds it on the road
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(spec.body.W + 0.5, spec.body.L + 0.6), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.75 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03;
  group.add(shadow);
  group.userData = { hl: geo.hl, hw: geo.hw, setPaint: (c) => bodyMat.color.setHex(c), setBrake: (on) => tailMat.color.setScalar(on ? 1 : 0.6) };
  return group;
}

let blob;
function blobTexture() {
  if (blob) return blob;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  return blob;
}
