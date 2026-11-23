// Port Omar: the whole city, generated once from fixed numbers so every player and the server share the same streets.
// x = east, z = south, y = up. Headings: forward = (sin ry, cos ry).
import { rng, noise2, clamp } from './util.js';

export const XS = [-700, -580, -470, -350, -240, -120, 0, 110, 230, 340, 460, 560];   // avenues (north-south roads)
export const ZS = [-520, -410, -300, -190, -90, 20, 130, 240, 350, 460];              // streets (east-west roads)
export const NX = XS.length, NZ = ZS.length;
export const AW = XS.map((_, i) => (i === 11 ? 18 : i === 6 ? 16 : 12));
export const STW = ZS.map((_, j) => (j === 5 ? 18 : 12));
export const SW = 3.5;        // sidewalk width
export const CURB = 0.15;
const T = 0.4;                // wall thickness
const REMOVED = new Set(['V4,3', 'H1,1', 'V8,7']);
export const hasH = (i, j) => i >= 0 && i < NX - 1 && j >= 0 && j < NZ && !REMOVED.has('H' + i + ',' + j);
export const hasV = (i, j) => i >= 0 && i < NX && j >= 0 && j < NZ - 1 && !REMOVED.has('V' + i + ',' + j);
export const DISTRICTS = ['midtown', 'downtown', 'strip', 'hills', 'industrial', 'docks', 'park'];

const LAND = { cx: -55, cz: -20, hx: 715, hz: 572, r: 110 };
/** Signed distance to the coast: negative on land. */
export function landSd(x, z) {
  const qx = Math.abs(x - LAND.cx) - (LAND.hx - LAND.r), qz = Math.abs(z - LAND.cz) - (LAND.hz - LAND.r);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - LAND.r;
  return d - noise2(x * 0.012, z * 0.012, 7) * 12;
}

function districtOf(i, j) {
  if ((i === 3 || i === 4) && j === 3) return 'park';
  if (i >= 9) return j <= 6 ? 'strip' : 'docks';
  if (i >= 6 && i <= 8 && j >= 2 && j <= 5) return 'downtown';
  if (j <= 2 && i <= 3) return 'hills';
  if (j >= 7) return i <= 4 ? 'industrial' : 'docks';
  return 'midtown';
}
const DIST = {
  midtown: { lot: 30, pal: 8 }, downtown: { lot: 46, pal: 6 }, strip: { lot: 44, pal: 8 },
  hills: { lot: 33, pal: 6 }, industrial: { lot: 50, pal: 5 }, docks: { lot: 52, pal: 5 },
};

const CS = 32;   // collider grid cell
const key = (cx, cz) => (cx + 512) * 1024 + (cz + 512);

function build() {
  const R = rng(60606);
  const C = {
    XS, ZS, AW, STW, SW, NX, NZ, boxes: [], buildings: [], pboxes: [], props: [], pois: [], markers: [], staff: [], signs: [],
    slabs: [], roads: [], cross: [], grounds: [], spots: [], roofs: [], poi: {}, marker: {},
  };
  const addBox = (x0, z0, x1, z1, y1, y0 = 0, g = 0) => { C.boxes.push({ x0, z0, x1, z1, y0, y1, g }); };
  const cellRect = (i, j) => ({ x0: XS[i] + AW[i] / 2, x1: XS[i + 1] - AW[i + 1] / 2, z0: ZS[j] + STW[j] / 2, z1: ZS[j + 1] - STW[j + 1] / 2 });
  const mkF = (ox, oz, ix, iz) => ({ ox, oz, ix, iz, ax: -iz, az: ix });
  const frameCell = (i, j, side, along) => {
    const c = cellRect(i, j);
    const sx = c.x0 + SW + (c.x1 - c.x0 - 2 * SW) * along, sz = c.z0 + SW + (c.z1 - c.z0 - 2 * SW) * along;
    if (side === 'n') return mkF(sx, c.z0 + SW, 0, 1);
    if (side === 's') return mkF(sx, c.z1 - SW, 0, -1);
    if (side === 'e') return mkF(c.x1 - SW, sz, -1, 0);
    return mkF(c.x0 + SW, sz, 1, 0);
  };
  const W2 = (Fm, u, v) => [Fm.ox + Fm.ax * u + Fm.ix * v, Fm.oz + Fm.az * u + Fm.iz * v];
  const rectW = (Fm, u0, v0, u1, v1) => { const [xa, za] = W2(Fm, u0, v0), [xb, zb] = W2(Fm, u1, v1); return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)]; };

  // ------------------------------------------------------------------ places you can walk into
  const reserved = [], driveways = [];
  function addPoi(id, type, name, Fm, w, d, h, o = {}) {
    const rect = rectW(Fm, -w / 2, 0, w / 2, d), [x, z] = W2(Fm, 0, d / 2);
    const p = { id, type, name, F: Fm, w, d, h, rect, x, z, door: W2(Fm, 0, 0), out: W2(Fm, 0, -2.4), ry: Math.atan2(-Fm.ix, -Fm.iz), solid: !!o.solid, open: !!o.open, col: o.col ?? 0, blip: o.blip || type };
    C.pois.push(p); C.poi[id] = p;
    reserved.push([rect[0] - 2, rect[1] - 2, rect[2] + 2, rect[3] + 2]);
    p.portal = { a: p.out, b: W2(Fm, 0, 1.9) }; p.rooms = [];
    if (!o.noSign) C.signs.push({ text: name, x: p.door[0] - Fm.ix * 0.08, z: p.door[1] - Fm.iz * 0.08, y: o.solid ? Math.min(h - 1.6, 7) : h - 0.75, ry: p.ry, w: Math.min(w - 1, name.length * 0.78 + 1.5), h: 1.15, col: o.sign || 0, poi: id });
    return p;
  }
  const pbox = (p, u0, v0, u1, v1, y1, c, y0 = 0, g = 0, solid = true) => {
    const [x0, z0, x1, z1] = rectW(p.F, u0, v0, u1, v1);
    C.pboxes.push({ x0, z0, x1, z1, y0, y1, c, g, poi: p.id });
    if (solid) addBox(x0, z0, x1, z1, y1, y0, g);
  };
  const shell = (p, doorW, doorH = 2.7) => {
    const w = p.w / 2, d = p.d, h = p.h;
    pbox(p, -w, d - T, w, d, h, 'wall'); pbox(p, -w, 0, -w + T, d, h, 'wall'); pbox(p, w - T, 0, w, d, h, 'wall');
    pbox(p, -w, 0, -doorW / 2, T, h, 'wall'); pbox(p, doorW / 2, 0, w, T, h, 'wall');
    pbox(p, -doorW / 2, 0, doorW / 2, T, h, 'trim', doorH);
    C.roofs.push({ poi: p.id, rect: p.rect, y: h });
  };
  const mark = (p, k, kind, u, v, r, extra = {}) => {
    const [x, z] = p ? W2(p.F, u, v) : [u, v];
    const m = { id: (p ? p.id : 'w') + ':' + k, poi: p ? p.id : null, kind, x, z, r, ...extra };
    C.markers.push(m); C.marker[m.id] = m; return m;
  };
  const staffAt = (p, role, u, v, faceIn, extra = {}) => { const [x, z] = W2(p.F, u, v); C.staff.push({ poi: p.id, role, x, z, ry: faceIn ? p.ry + Math.PI : p.ry, ...extra }); };

  const store = (id, name, Fm) => {
    const p = addPoi(id, 'store', name, Fm, 14, 10, 4, { sign: 1 }); shell(p, 2.6);
    pbox(p, 1.5, 6.2, 6, 7.1, 1.1, 'counter'); pbox(p, -5.6, 3.4, -1.2, 4.2, 1.7, 'shelf'); pbox(p, -5.6, 6.0, -1.2, 6.8, 1.7, 'shelf');
    staffAt(p, 'clerk', 3.8, 8.3, false, { rob: id + ':till' });
    mark(p, 'till', 'rob', 3.8, 5.2, 3.2, { secs: 4, text: 'Rob the register' });
    mark(p, 'snack', 'snack', -3.4, 5.1, 1.8, { text: 'Buy a snack' });
  };
  store('quik1', 'QUIK STOP', frameCell(1, 3, 's', 0.3));
  store('quik2', 'QUIK STOP', frameCell(8, 6, 'n', 0.6));
  store('quik3', 'QUIK STOP', frameCell(10, 1, 'w', 0.5));
  store('quik4', 'QUIK STOP', frameCell(5, 8, 'n', 0.4));

  const guns = (id, Fm) => {
    const p = addPoi(id, 'guns', 'LOCK & LOAD', Fm, 14, 10, 4, { sign: 2 }); shell(p, 2.6);
    pbox(p, -5, 6, 5, 6.9, 1.1, 'counter'); pbox(p, -6.4, 9, 6.4, 9.5, 2.4, 'shelf');
    staffAt(p, 'clerk', 0, 8, false, { armed: true });
    mark(p, 'shop', 'guns', 0, 4.6, 2.6, { text: 'Browse weapons' });
  };
  guns('guns1', frameCell(3, 5, 'n', 0.5)); guns('guns2', frameCell(6, 7, 'n', 0.3));

  const respray = (id, Fm) => {
    const p = addPoi(id, 'respray', 'FRESH COAT', Fm, 12, 14, 5, { sign: 3 }); shell(p, 7, 3.4);
    pbox(p, -5.4, 11.5, -3.6, 13.4, 1.2, 'crate'); pbox(p, 3.8, 11.8, 5.4, 13.4, 1.6, 'shelf');
    mark(p, 'spray', 'respray', 0, 7, 4.5, { text: 'Respray and repair' });
    driveways.push(p.door);
  };
  respray('spray1', frameCell(5, 6, 'n', 0.5)); respray('spray2', frameCell(9, 2, 's', 0.5));

  { // the safehouse: where you start
    const p = addPoi('home', 'safehouse', 'SAFEHOUSE', frameCell(4, 5, 'n', 0.45), 14, 10, 4, { sign: 4 }); shell(p, 2.6);
    pbox(p, 3.4, 6, 6.2, 9.2, 0.6, 'bed'); pbox(p, -6.3, 8.6, -1.5, 9.5, 2.2, 'board'); pbox(p, -1, 3.6, 1, 5.2, 0.8, 'counter');
    mark(p, 'board', 'jobs', -3.9, 7.6, 2.2, { text: 'Plan a heist' });
    mark(p, 'bed', 'rest', 3.2, 4.8, 2, { text: 'Rest (heal and save)' });
    mark(p, 'closet', 'outfit', 5.6, 2, 1.8, { text: 'Change outfit' });
    const g = mark(p, 'garage', 'garage', 9.5, -SW - 1.4, 3.2, { text: 'Garage' }); g.ry = Math.atan2(p.F.ax, p.F.az);
    driveways.push([g.x, g.z]);
    C.spawn = { x: p.out[0] + p.F.ax * 4, z: p.out[1] + p.F.az * 4, ry: Math.atan2(p.F.ax, p.F.az) };
  }
  { // Lucky Pawn
    const p = addPoi('pawn', 'pawn', 'LUCKY PAWN', frameCell(2, 7, 'n', 0.5), 16, 12, 4, { sign: 5, blip: 'heist' }); shell(p, 2.6);
    pbox(p, -2, 5, 7, 5.9, 1.1, 'counter'); pbox(p, -7.6, 8.4, -6.6, 8.8, 4, 'wall'); pbox(p, -4.8, 8.4, 7.6, 8.8, 4, 'wall'); pbox(p, 4.6, 10.2, 6.6, 11.5, 1.6, 'safe');
    pbox(p, -7.4, 2, -6.4, 6, 1.6, 'shelf');
    staffAt(p, 'clerk', 3, 7.2, false, {});
    mark(p, 'clerk', 'heist', 3, 3.8, 3, {}); mark(p, 'safe', 'heist', 5.6, 9.5, 1.8, {});
    p.rooms.push({ rect: rectW(p.F, -8, 8.6, 8, 12), a: W2(p.F, -5.7, 7.2), b: W2(p.F, -5.7, 10) });
  }
  { // Bay Jewelers
    const p = addPoi('jewel', 'jewel', 'BAY JEWELERS', frameCell(10, 4, 'e', 0.5), 20, 14, 4.5, { sign: 6, blip: 'heist' }); shell(p, 3);
    let n = 0;
    for (const v of [4.4, 8.6]) for (const u of [-6, -2, 2, 6]) { pbox(p, u - 0.8, v - 0.45, u + 0.8, v + 0.45, 1.0, 'case'); mark(p, 'case' + n++, 'heist', u, v + 1.15, 1.5, {}); }
    pbox(p, -4, 11.6, 4, 12.4, 1.1, 'counter');
    staffAt(p, 'clerk', 0, 13, false, {}); staffAt(p, 'guard', 8, 2, true, { heist: 'jewel' }); staffAt(p, 'guard', -8, 11.5, false, { heist: 'jewel' });
  }
  { // First Omar Bank
    const p = addPoi('bank', 'bank', 'FIRST OMAR BANK', frameCell(7, 3, 's', 0.5), 30, 24, 6, { sign: 7, blip: 'heist' }); shell(p, 3.4, 3);
    pbox(p, -11, 10, 11, 10.9, 1.1, 'counter');
    pbox(p, -14.6, 14, -1.7, 14.5, 6, 'wall'); pbox(p, 1.7, 14, 14.6, 14.5, 6, 'wall'); pbox(p, -1.7, 14, 1.7, 14.5, 6, 'trim', 3);
    pbox(p, -1.7, 14.05, 1.7, 14.45, 3, 'gate', 0, 1);                       // the vault door: gate 1
    let n = 0;
    for (const [u, v] of [[-11, 21.8], [-6.5, 21.8], [6.5, 21.8], [11, 21.8], [-12.6, 17.6], [12.6, 17.6]]) { pbox(p, u - 0.8, v - 0.5, u + 0.8, v + 0.5, 1.2, 'cart'); mark(p, 'cart' + n++, 'heist', u, v - 1.3, 1.6, {}); }
    pbox(p, -3, 3.4, -1, 5, 0.9, 'bench'); pbox(p, 1, 3.4, 3, 5, 0.9, 'bench');
    mark(p, 'drill', 'heist', 0, 12.9, 2.4, {});
    p.rooms.push({ rect: rectW(p.F, -15, 14.25, 15, 24), a: W2(p.F, 0, 12.6), b: W2(p.F, 0, 15.8) });
    for (const [u, v] of [[-9, 3.5], [9, 3.5], [-12.5, 8], [12.5, 8]]) staffAt(p, 'guard', u, v, false, { heist: 'bank' });
    staffAt(p, 'clerk', -6, 12.2, false, {}); staffAt(p, 'clerk', 6, 12.2, false, {});
  }
  { // Pier 9 warehouse on the docks (outside the street grid)
    const p = addPoi('pier9', 'warehouse', 'PIER 9 FREIGHT', mkF(300, 482, 0, 1), 34, 26, 8, { sign: 8, blip: 'heist' }); shell(p, 8, 4.2);
    for (const [u, v] of [[-12, 5], [-6, 9], [9, 6], [13, 14], [-13, 15], [-4, 20], [6, 21], [12, 22]]) pbox(p, u - 1.2, v - 1.2, u + 1.2, v + 1.2, 1.7, 'crate');
    mark(p, 'term0', 'heist', -15.4, 21, 1.8, {}); mark(p, 'term1', 'heist', 15.4, 10, 1.8, {});
    pbox(p, -16.5, 20.4, -16, 21.6, 1.5, 'term', 0, 0, false); pbox(p, 16, 9.4, 16.5, 10.6, 1.5, 'term', 0, 0, false);
    const [vx, vz] = W2(p.F, 0, 15); p.van = { x: vx, z: vz, ry: p.ry };
    for (const [u, v] of [[-7, -5], [7, -5], [-9, 12], [10, 17], [0, 23], [-13, 8]]) staffAt(p, 'guard', u, v, false, { heist: 'pier9', rifle: true });
    driveways.push(p.door);
  }
  { // Motor Row: an open lot
    const p = addPoi('dealer', 'dealer', 'MOTOR ROW', frameCell(8, 1, 's', 0.5), 34, 22, 3.4, { open: true, sign: 9 });
    pbox(p, 10, 14, 15, 19, 3.4, 'booth');
    mark(p, 'desk', 'dealer', 8, 12, 2.6, { text: 'Buy a car' });
    p.display = [[-12, 6, 6], [-6, 6, 7], [0, 6, 8], [-12, 15, 9], [-5, 15, 8]].map(([u, v, kind]) => { const [x, z] = W2(p.F, u, v); return { x, z, ry: p.ry, kind }; });
    const [dx, dz] = W2(p.F, 4, 3); p.deliver = { x: dx, z: dz, ry: p.ry };
    C.grounds.push({ x0: p.rect[0], z0: p.rect[1], x1: p.rect[2], z1: p.rect[3], k: 'asphalt', y: CURB + 0.01 });
    driveways.push(p.door);
  }
  const solid = (id, type, name, Fm, w, d, h, col, sign) => {
    const p = addPoi(id, type, name, Fm, w, d, h, { solid: true, col, sign });
    const [x0, z0, x1, z1] = rectW(Fm, -w / 2, 0.5, w / 2, d);
    C.buildings.push({ x0, z0, x1, z1, h, di: 7, c: col, s: R() }); addBox(x0, z0, x1, z1, h);
    return p;
  };
  solid('hosp1', 'hospital', 'ST. OMAR HOSPITAL', frameCell(5, 3, 's', 0.5), 44, 34, 26, 0, 10);
  solid('hosp2', 'hospital', 'BAYSIDE CLINIC', frameCell(9, 6, 'n', 0.5), 30, 22, 12, 0, 10);
  solid('hosp3', 'hospital', 'NORTHGATE CLINIC', frameCell(2, 2, 's', 0.5), 28, 20, 10, 0, 10);
  solid('police', 'police', 'PORT OMAR POLICE', frameCell(6, 5, 'n', 0.5), 40, 30, 18, 1, 11);
  solid('casino', 'casino', 'THE GOLDEN GULL', frameCell(10, 2, 'e', 0.5), 46, 40, 34, 2, 12);
  C.respawns = ['hosp1', 'hosp2', 'hosp3'].map((id) => ({ x: C.poi[id].out[0], z: C.poi[id].out[1], ry: C.poi[id].ry }));
  // drop-off points for heists (outdoors)
  mark(null, 'fence', 'drop', -205, 496, 6, { text: 'The fence' });
  mark(null, 'buyer', 'drop', -640, -517, 8, { text: 'The buyer' });

  // ------------------------------------------------------------------ roads
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    C.cross.push({ x: XS[i], z: ZS[j], w: AW[i], d: STW[j] });
    if (hasH(i, j)) C.roads.push({ x0: XS[i] + AW[i] / 2, x1: XS[i + 1] - AW[i + 1] / 2, z0: ZS[j] - STW[j] / 2, z1: ZS[j] + STW[j] / 2, vert: false, w: STW[j], i, j });
    else if (i < NX - 1) C.slabs.push({ x0: XS[i] + AW[i] / 2, x1: XS[i + 1] - AW[i + 1] / 2, z0: ZS[j] - STW[j] / 2, z1: ZS[j] + STW[j] / 2, di: 'hills', fill: 'lawn' });
    if (hasV(i, j)) C.roads.push({ x0: XS[i] - AW[i] / 2, x1: XS[i] + AW[i] / 2, z0: ZS[j] + STW[j] / 2, z1: ZS[j + 1] - STW[j + 1] / 2, vert: true, w: AW[i], i, j });
    else if (j < NZ - 1) C.slabs.push({ x0: XS[i] - AW[i] / 2, x1: XS[i] + AW[i] / 2, z0: ZS[j] + STW[j] / 2, z1: ZS[j + 1] - STW[j + 1] / 2, di: i === 4 ? 'park' : 'docks', fill: i === 4 ? 'grass' : 'asphalt' });
  }
  for (const s of C.slabs) if (s.fill) C.grounds.push({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, k: s.fill, y: CURB + 0.01 });
  // ground outside the street grid
  C.grounds.push({ x0: -700, z0: 466, x1: 569, z1: 536, k: 'concrete', y: 0.02 }, { x0: -740, z0: -526, x1: -706, z1: 466, k: 'grass', y: 0.02 }, { x0: -706, z0: -560, x1: 569, z1: -526, k: 'grass', y: 0.02 });

  // ------------------------------------------------------------------ blocks
  const overlap = (L, r) => L.x0 < r[2] && L.x1 > r[0] && L.z0 < r[3] && L.z1 > r[1];
  const tree = (t, x, z, s = 1) => { C.props.push({ t, x, z, s, ry: R() * 6.28 }); addBox(x - 0.28, z - 0.28, x + 0.28, z + 0.28, 5); };
  const bld = (x0, z0, x1, z1, h, di, extra = {}) => { C.buildings.push({ x0, z0, x1, z1, h, di: DISTRICTS.indexOf(di), c: R.int(0, DIST[di].pal - 1), s: R(), ...extra }); addBox(x0, z0, x1, z1, h); };
  const containers = (L, n) => {
    for (let k = 0; k < n; k++) {
      const alongX = R.chance(0.5), len = 12.2, wid = 2.6, st = R.int(1, 3);
      const hx = (alongX ? len : wid) / 2, hz = (alongX ? wid : len) / 2;
      const x = R.range(L.x0 + hx + 1, L.x1 - hx - 1), z = R.range(L.z0 + hz + 1, L.z1 - hz - 1);
      if (C.props.some((p) => p.t === 'cont' && Math.abs(p.x - x) < 14 && Math.abs(p.z - z) < 14)) continue;
      C.props.push({ t: 'cont', x, z, ry: alongX ? Math.PI / 2 : 0, n: st, c: R.int(0, 5) }); addBox(x - hx, z - hz, x + hx, z + hz, st * 2.6);
    }
  };
  const lotSpots = (L) => {
    for (let x = L.x0 + 3; x < L.x1 - 2; x += 3) for (const z of [L.z0 + 4, L.z1 - 4]) if (R.chance(0.7)) C.spots.push({ x, z, ry: z < (L.z0 + L.z1) / 2 ? 0 : Math.PI, lot: true });
  };
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NZ - 1; j++) {
    const c = cellRect(i, j), di = districtOf(i, j);
    C.slabs.push({ ...c, di });
    if (di === 'park') {
      C.grounds.push({ x0: c.x0 + 1.5, z0: c.z0 + 1.5, x1: c.x1 - 1.5, z1: c.z1 - 1.5, k: 'grass', y: CURB + 0.01 });
      for (let k = 0; k < 26; k++) tree('tree', R.range(c.x0 + 6, c.x1 - 6), R.range(c.z0 + 6, c.z1 - 6), R.range(0.9, 1.5));
      for (let k = 0; k < 5; k++) C.props.push({ t: 'bench', x: R.range(c.x0 + 8, c.x1 - 8), z: R.range(c.z0 + 8, c.z1 - 8), ry: R.int(0, 3) * 1.5708, s: 1 });
      continue;
    }
    const D = DIST[di];
    const ix0 = c.x0 + SW, iz0 = c.z0 + SW, ix1 = c.x1 - SW, iz1 = c.z1 - SW;
    const nx = Math.max(1, Math.round((ix1 - ix0) / D.lot)), nz = Math.max(1, Math.round((iz1 - iz0) / D.lot));
    const lw = (ix1 - ix0) / nx, ld = (iz1 - iz0) / nz;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const L = { x0: ix0 + a * lw, z0: iz0 + b * ld, x1: ix0 + (a + 1) * lw, z1: iz0 + (b + 1) * ld };
      if (reserved.some((r) => overlap(L, r))) continue;
      const inner = a > 0 && a < nx - 1 && b > 0 && b < nz - 1;
      const g = (k, pad = 0) => C.grounds.push({ x0: L.x0 + pad, z0: L.z0 + pad, x1: L.x1 - pad, z1: L.z1 - pad, k, y: CURB + 0.01 });
      const inset = (s) => [L.x0 + s, L.z0 + s, L.x1 - s, L.z1 - s];
      if (di === 'downtown') {
        if (R.chance(0.1)) { g('plaza'); for (let k = 0; k < 4; k++) tree('tree', R.range(L.x0 + 5, L.x1 - 5), R.range(L.z0 + 5, L.z1 - 5), 1.1); continue; }
        const mid = 1 - Math.min(1, Math.hypot((L.x0 + L.x1) / 2 - 170, (L.z0 + L.z1) / 2 + 60) / 260);
        const h = R.range(36, 80) + mid * R.range(20, 80);
        if (R.chance(0.4)) { const [x0, z0, x1, z1] = inset(2.5); bld(x0, z0, x1, z1, R.range(9, 15), di); const s = R.range(8, 11); bld(L.x0 + s, L.z0 + s, L.x1 - s, L.z1 - s, h, di, { top: 1 }); } else { const [x0, z0, x1, z1] = inset(R.range(3, 7)); bld(x0, z0, x1, z1, h, di, { top: 1 }); }
      } else if (di === 'midtown') {
        if (inner || R.chance(0.1)) { g('asphalt'); lotSpots(L); continue; }
        const [x0, z0, x1, z1] = inset(R.range(1.5, 3.5));
        if (R.chance(0.25) && lw > 26) { const m = (x0 + x1) / 2; bld(x0, z0, m - 1, z1, R.range(7, 20), di); bld(m + 1, z0, x1, z1, R.range(7, 20), di); } else bld(x0, z0, x1, z1, R.range(7, 24), di);
      } else if (di === 'strip') {
        if (R.chance(0.14)) { g('plaza'); C.grounds.push({ x0: L.x0 + 9, z0: L.z0 + 9, x1: L.x1 - 9, z1: L.z1 - 9, k: 'pool', y: CURB + 0.02 }); for (let k = 0; k < 5; k++) tree('palm', R.range(L.x0 + 3, L.x1 - 3), R.chance(0.5) ? L.z0 + 4 : L.z1 - 4, R.range(0.9, 1.2)); continue; }
        const [x0, z0, x1, z1] = inset(R.range(4, 8));
        bld(x0, z0, x1, z1, R.chance(0.3) ? R.range(6, 9) : R.range(22, 62), di, { neon: R.int(0, 4) });
      } else if (di === 'hills') {
        g('lawn');
        const w = R.range(11, 15), d = R.range(9, 12), x = R.range(L.x0 + 6, L.x1 - w - 6), z = R.range(L.z0 + 6, L.z1 - d - 6);
        bld(x, z, x + w, z + d, R.range(4.5, 7.5), di, { house: 1 });
        if (R.chance(0.35)) C.grounds.push({ x0: x + 1, z0: z + d + 1.5, x1: x + 8, z1: z + d + 5.5, k: 'pool', y: CURB + 0.02 });
        for (let k = 0; k < 2; k++) { const tx = R.range(L.x0 + 2, L.x1 - 2), tz = R.range(L.z0 + 2, L.z1 - 2); if (tx < x - 1.5 || tx > x + w + 1.5 || tz < z - 1.5 || tz > z + d + 1.5) tree(R.chance(0.3) ? 'palm' : 'tree', tx, tz, R.range(0.8, 1.2)); }
      } else {
        g('asphalt');
        if (R.chance(di === 'docks' ? 0.4 : 0.22)) { containers(L, di === 'docks' ? 6 : 3); continue; }
        const [x0, z0, x1, z1] = inset(R.range(5, 9)); bld(x0, z0, x1, z1, R.range(8, 13), di, { shed: 1 });
      }
    }
  }
  containers({ x0: -80, z0: 474, x1: 250, z1: 530 }, 16); containers({ x0: 350, z0: 474, x1: 560, z1: 530 }, 9); containers({ x0: -690, z0: 474, x1: -240, z1: 530 }, 12);

  // ------------------------------------------------------------------ street furniture and parking
  for (const r of C.roads) {
    const len = r.vert ? r.z1 - r.z0 : r.x1 - r.x0, hw = r.w / 2;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const palms = (r.vert && r.i === 11) || (!r.vert && r.j === 5) || (r.vert && r.i >= 9);
    for (const s of [-1, 1]) {
      for (let t = 10; t < len - 6; t += 34) { const a = r.vert ? r.z0 + t : r.x0 + t; C.props.push({ t: 'lamp', x: r.vert ? cx + s * (hw + 0.7) : a, z: r.vert ? a : cz + s * (hw + 0.7), ry: r.vert ? (s > 0 ? -1.5708 : 1.5708) : (s > 0 ? Math.PI : 0), s: 1 }); }
      if (palms) for (let t = 22; t < len - 8; t += 19) { const a = r.vert ? r.z0 + t : r.x0 + t; const x = r.vert ? cx + s * (hw + 3) : a, z = r.vert ? a : cz + s * (hw + 3); if (!reserved.some((q) => x > q[0] - 3 && x < q[2] + 3 && z > q[1] - 3 && z < q[3] + 3)) tree('palm', x, z, R.range(0.9, 1.25)); }
      for (let t = 9; t < len - 9; t += 7.5) {
        const a = r.vert ? r.z0 + t : r.x0 + t;
        const x = r.vert ? cx + s * (hw - 1.3) : a, z = r.vert ? a : cz + s * (hw - 1.3);
        if (driveways.some((d) => Math.hypot(d[0] - x, d[1] - z) < 10)) continue;
        // drive on the right: the east side of an avenue heads north, the south side of a street heads east
        C.spots.push({ x, z, ry: r.vert ? (s > 0 ? Math.PI : 0) : (s > 0 ? 1.5708 : -1.5708) });
      }
    }
  }
  for (let k = 0; k < 90; k++) { const x = R.range(578, 645), z = R.range(-500, 440); if (landSd(x, z) < -7) C.props.push({ t: R.chance(0.6) ? 'umbrella' : 'towel', x, z, ry: R() * 6.28, s: 1, c: R.int(0, 5) }); }

  { const h = C.poi.home, best = [4, -4, 7, -7, 10].map((u) => [h.out[0] + h.F.ax * u, h.out[1] + h.F.az * u]).map((q) => [Math.min(...C.props.map((p) => Math.hypot(p.x - q[0], p.z - q[1]))), q]).sort((a, b) => b[0] - a[0])[0][1]; C.spawn.x = best[0]; C.spawn.z = best[1]; }
  // ------------------------------------------------------------------ road graph
  C.adj = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const n = [];
    if (hasH(i, j)) n.push(j * NX + i + 1);
    if (hasH(i - 1, j)) n.push(j * NX + i - 1);
    if (hasV(i, j)) n.push((j + 1) * NX + i);
    if (hasV(i, j - 1)) n.push((j - 1) * NX + i);
    C.adj.push(n);
  }

  // ------------------------------------------------------------------ lookup grids
  const grid = new Map();
  C.boxes.forEach((b, n) => {
    for (let cx = Math.floor(b.x0 / CS); cx <= Math.floor(b.x1 / CS); cx++) for (let cz = Math.floor(b.z0 / CS); cz <= Math.floor(b.z1 / CS); cz++) {
      const k = key(cx, cz); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(n);
    }
  });
  C.grid = grid;
  const sg = new Map();
  C.spots.forEach((s, n) => { const k = key(Math.floor(s.x / 64), Math.floor(s.z / 64)); let a = sg.get(k); if (!a) sg.set(k, (a = [])); a.push(n); });
  C.spotGrid = sg;
  return C;
}

// ---------------------------------------------------------------------- queries
const hop = new Map(), lanes = new Map();
const methods = {
  isLand(x, z) { return landSd(x, z) < 0; },
  /** True on asphalt (so the ground there is at street level, not up on the sidewalk). */
  onRoad(x, z) {
    for (let i = 0; i < NX; i++) if (Math.abs(x - XS[i]) <= AW[i] / 2) {
      if (z < ZS[0] - STW[0] / 2 || z > ZS[NZ - 1] + STW[NZ - 1] / 2) return false;
      for (let j = 0; j < NZ; j++) { if (Math.abs(z - ZS[j]) <= STW[j] / 2) return true; if (j < NZ - 1 && z > ZS[j] && z < ZS[j + 1]) return hasV(i, j); }
    }
    for (let j = 0; j < NZ; j++) if (Math.abs(z - ZS[j]) <= STW[j] / 2) {
      if (x < XS[0] - AW[0] / 2 || x > XS[NX - 1] + AW[NX - 1] / 2) return false;
      for (let i = 0; i < NX - 1; i++) if (x > XS[i] && x < XS[i + 1]) return hasH(i, j);
    }
    return false;
  },
  /** Height of the ground: sidewalks and lots sit one curb above the street. */
  groundY(x, z) {
    if (x < XS[0] - AW[0] / 2 || x > XS[NX - 1] + AW[NX - 1] / 2 || z < ZS[0] - STW[0] / 2 || z > ZS[NZ - 1] + STW[NZ - 1] / 2) return 0;
    return this.onRoad(x, z) ? 0 : CURB;
  },
  /** Pushes a circle out of walls. out = {x, z, nx, nz}. gates = bitmask of open gates. Returns true if it touched. */
  collide(x, z, r, out, gates = 0, feet = 0) {
    let hit = false; out.nx = 0; out.nz = 0;
    for (let pass = 0; pass < 2; pass++) {
      const cx0 = Math.floor((x - r) / CS), cx1 = Math.floor((x + r) / CS), cz0 = Math.floor((z - r) / CS), cz1 = Math.floor((z + r) / CS);
      let moved = false;
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const cell = this.grid.get(key(cx, cz)); if (!cell) continue;
        for (let n = 0; n < cell.length; n++) {
          const b = this.boxes[cell[n]];
          if (b.y0 > 1.9 || feet >= b.y1 || (b.g && (gates >> b.g) & 1)) continue;
          const px = clamp(x, b.x0, b.x1), pz = clamp(z, b.z0, b.z1);
          let dx = x - px, dz = z - pz; const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) { const d = Math.sqrt(d2), p = r - d; dx /= d; dz /= d; x += dx * p; z += dz * p; out.nx = dx; out.nz = dz; } else {
            const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bb = b.z1 - z, m = Math.min(l, rr, t, bb);
            if (m === l) { x = b.x0 - r; out.nx = -1; out.nz = 0; } else if (m === rr) { x = b.x1 + r; out.nx = 1; out.nz = 0; } else if (m === t) { z = b.z0 - r; out.nx = 0; out.nz = -1; } else { z = b.z1 + r; out.nx = 0; out.nz = 1; }
          }
          hit = moved = true;
        }
      }
      if (!moved) break;
    }
    out.x = x; out.z = z;
    return hit;
  },
  /** Distance along a ray to the first wall or the ground (max if nothing). */
  ray(ox, oy, oz, dx, dy, dz, max, gates = 0) {
    let best = max;
    if (dy < -1e-6) { const tg = -oy / dy; if (tg < best) best = tg; }
    let cx = Math.floor(ox / CS), cz = Math.floor(oz / CS);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CS / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? CS / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? ((cx + (dx > 0 ? 1 : 0)) * CS - ox) / dx : Infinity, tmz = Math.abs(dz) > 1e-9 ? ((cz + (dz > 0 ? 1 : 0)) * CS - oz) / dz : Infinity;
    for (let guard = 0; guard < 64; guard++) {
      const cell = this.grid.get(key(cx, cz));
      if (cell) for (let n = 0; n < cell.length; n++) {
        const b = this.boxes[cell[n]];
        if (b.g && (gates >> b.g) & 1) continue;
        let t0 = 0, t1 = best, a, c;
        if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; } else { a = (b.x0 - ox) / dx; c = (b.x1 - ox) / dx; if (a > c) { const q = a; a = c; c = q; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
        if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; } else { a = (b.z0 - oz) / dz; c = (b.z1 - oz) / dz; if (a > c) { const q = a; a = c; c = q; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
        if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) continue; } else { a = (b.y0 - oy) / dy; c = (b.y1 - oy) / dy; if (a > c) { const q = a; a = c; c = q; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
        if (t0 < best) best = t0;
      }
      const tn = Math.min(tmx, tmz);
      if (tn > best) break;
      if (tmx < tmz) { cx += sx; tmx += tdx; } else { cz += sz; tmz += tdz; }
    }
    return best;
  },
  /** Can two points see each other (at chest height)? */
  los(x0, z0, x1, z1, gates = 0, y = 1.3) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    return this.ray(x0, y, z0, dx / d, 0, dz / d, d, gates) >= d - 0.05;
  },
  /** The lane from node a to node b: start corner, direction, length, and the right-hand vector. */
  lane(a, b) {
    const k = a * 256 + b; let L = lanes.get(k); if (L) return L;
    const ai = a % NX, aj = (a / NX) | 0, bi = b % NX, bj = (b / NX) | 0, vert = ai === bi;
    const ax = XS[ai], az = ZS[aj], bx = XS[bi], bz = ZS[bj], len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    const hw = (vert ? AW[ai] : STW[aj]) / 2;
    L = { a, b, ax, az, dx, dz, len, hw, off: hw * 0.45, m0: (vert ? STW[aj] : AW[ai]) / 2, m1: (vert ? STW[bj] : AW[bi]) / 2, rx: -dz, rz: dx, ry: Math.atan2(dx, dz) };
    lanes.set(k, L); return L;
  },
  nodeXZ(n) { return [XS[n % NX], ZS[(n / NX) | 0]]; },
  nearestNode(x, z) {
    let bi = 0, bj = 0, d = Infinity;
    for (let i = 0; i < NX; i++) { const q = Math.abs(x - XS[i]); if (q < d) { d = q; bi = i; } }
    d = Infinity;
    for (let j = 0; j < NZ; j++) { const q = Math.abs(z - ZS[j]); if (q < d) { d = q; bj = j; } }
    return bj * NX + bi;
  },
  /** The road segment nearest a point, as two node ids. */
  nearestEdge(x, z) {
    let best = null, bd = Infinity;
    const jj = clamp(ZS.findIndex((v) => v > z) - 1, 0, NZ - 2), ii = clamp(XS.findIndex((v) => v > x) - 1, 0, NX - 2);
    const j0 = ZS.findIndex((v) => v > z) === -1 ? NZ - 2 : jj, i0 = XS.findIndex((v) => v > x) === -1 ? NX - 2 : ii;
    for (let i = 0; i < NX; i++) for (const j of [j0 - 1, j0, j0 + 1]) if (hasV(i, j)) { const d = Math.abs(x - XS[i]) + Math.max(0, ZS[j] - z, z - ZS[j + 1]); if (d < bd) { bd = d; best = [j * NX + i, (j + 1) * NX + i]; } }
    for (let j = 0; j < NZ; j++) for (const i of [i0 - 1, i0, i0 + 1]) if (hasH(i, j)) { const d = Math.abs(z - ZS[j]) + Math.max(0, XS[i] - x, x - XS[i + 1]); if (d < bd) { bd = d; best = [j * NX + i, j * NX + i + 1]; } }
    return best;
  },
  /** Next node on the shortest road route from a to b (b itself when they touch). */
  nextHop(a, b) {
    if (a === b) return b;
    let t = hop.get(b);
    if (!t) {
      t = new Int16Array(NX * NZ).fill(-1); t[b] = b;
      const q = [b];
      for (let h = 0; h < q.length; h++) for (const n of this.adj[q[h]]) if (t[n] < 0) { t[n] = q[h]; q.push(n); }
      hop.set(b, t);
    }
    return t[a];
  },
  /** Parking spot indexes near a point. */
  spotsNear(x, z, r, out) {
    out.length = 0;
    for (let cx = Math.floor((x - r) / 64); cx <= Math.floor((x + r) / 64); cx++) for (let cz = Math.floor((z - r) / 64); cz <= Math.floor((z + r) / 64); cz++) {
      const a = this.spotGrid.get(key(cx, cz)); if (a) for (const n of a) out.push(n);
    }
    return out;
  },
  /** Is this point inside a walk-in building? Returns the place or null. */
  insidePoi(x, z) {
    for (const p of this.pois) if (!p.solid && !p.open && x > p.rect[0] && x < p.rect[2] && z > p.rect[1] && z < p.rect[3]) return p;
    return null;
  },
};

let city = null;
export function getCity() {
  if (!city) city = Object.assign(build(), methods);
  return city;
}
