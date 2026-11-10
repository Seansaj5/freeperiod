// Dreamy Hills Zone: the one map. The ground is a height function, everything solid is a box or a
// cylinder, and the same data drives the 3D scene (js/world.js), movement (move.js) and bots (bots.js).
import { rng, clamp, lerp, smooth } from './util.js';
import { GRAVITY } from './rules.js';

export const HALF = 174;       // nobody goes past |x| or |z| = HALF
const EDGE = 164;              // the ground rises into hills past this
export const WATER_Y = -0.2;
export const GOO_Y = 0.3;      // toxic goo pits (Toxic Works)
export const LAVA_Y = 0.0;     // lava pools (Ember Ruins)
export const STEP = 0.6;       // ledges this high are walked straight up
export const MAX_SLOPE = 1.25; // steeper ground than this (rise/run) is a wall when walking

export const V = { x: 0, z: 0, r: 22, y: 1.2 };            // village
export const M = { x: -60, z: -8, r: 16, top: 10.5 };      // mesa (west plateau)
export const L = { x: 52, z: 44, r: 22, bottom: -1.7 };    // lake
export const HILL = { x: 52, z: -50, r: 28, h: 8.5 };      // big north-east hill
export const S = { x: -52, z: 56, r: 16, depth: 2.4 };     // the hollow, where EXE wakes up
export const T = { x0: -9, x1: 15, z0: -45, z1: -35, y: 1.5 }; // flat pad under the old corridor
const RAMP = { x0: -43.5, x1: -25, zc: -0.5, half: 3.5 };
// outer zones
export const FROST = { x: -20, z: -138, r: 44, h: 20 };        // Frostbite Peak mountain
export const ICE = { x: 48, z: -122, r: 18, y: 0.5 };          // frozen lake
export const CAVE = { x0: -76, x1: -64, z0: -124, z1: -100, y: 1.2 }; // ice cave
export const TOXIC = { y: 1.0 };
export const GOO = [{ x: 118, z: -42, r: 8 }, { x: 150, z: 12, r: 7 }, { x: 112, z: 48, r: 7 }];
export const NEON = { y: 1.0 };
export const TEMPLE = { x: -132, z: 0, half: 13, top: 4.5 };
export const LAVA = [{ x: -112, z: -42, r: 8 }, { x: -152, z: 34, r: 7 }, { x: -106, z: 46, r: 6 }];
export const ZONES = [
  { id: 'hills', name: 'Dreamy Hills', x: 0, z: 0, color: '#5fbf3a' },
  { id: 'frost', name: 'Frostbite Peak', x: 0, z: -132, color: '#bfe6ff' },
  { id: 'toxic', name: 'Toxic Works', x: 132, z: 0, color: '#8fdc3a' },
  { id: 'neon', name: 'Neon Jackpot', x: 0, z: 132, color: '#ff4fd8' },
  { id: 'ember', name: 'Ember Ruins', x: -132, z: 0, color: '#ff8a3a' },
];
export function zoneAt(x, z) {
  if (Math.max(Math.abs(x), Math.abs(z)) < 88) return ZONES[0];
  if (Math.abs(z) >= Math.abs(x)) return z < 0 ? ZONES[1] : ZONES[3];
  return x > 0 ? ZONES[2] : ZONES[4];
}

export const mesaR = (a) => M.r + 1.6 * Math.sin(3 * a + 1) + 0.9 * Math.sin(7 * a);

export function terrainH(x, z) {
  let h = 1.0
    + 1.3 * Math.sin(x * 0.051 + 0.6) * Math.cos(z * 0.043 - 1.1)
    + 0.9 * Math.sin(x * 0.083 - z * 0.061 + 2.0)
    + 0.35 * Math.sin(x * 0.19 + z * 0.23);
  h = lerp(h, V.y, 1 - smooth(V.r - 4, V.r + 6, Math.hypot(x - V.x, z - V.z)));
  const tx = Math.max(T.x0 - x, 0, x - T.x1), tz = Math.max(T.z0 - z, 0, z - T.z1);
  h = lerp(h, T.y, 1 - smooth(0, 6, Math.hypot(tx, tz)));
  const dh = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r;
  if (dh < 1) h += HILL.h * (0.5 + 0.5 * Math.cos(Math.PI * dh));
  const ds = Math.hypot(x - S.x, z - S.z) / S.r;
  if (ds < 1) h -= S.depth * (0.5 + 0.5 * Math.cos(Math.PI * Math.max(0, ds * 1.25 - 0.25)));
  const dl = Math.hypot(x - L.x, z - L.z);
  h = lerp(h, L.bottom, 1 - smooth(L.r - 9, L.r + 1, dl));
  const dmx = x - M.x, dmz = z - M.z, dm = Math.hypot(dmx, dmz);
  if (dm < M.r + 6) {
    const r = mesaR(Math.atan2(dmz, dmx));
    h = lerp(h, M.top, 1 - smooth(r - 1, r + 1, dm));
  }
  if (x > RAMP.x0 - 1 && x < RAMP.x1 + 1) {
    const w = 1 - smooth(RAMP.half - 0.5, RAMP.half + 1.2, Math.abs(z - RAMP.zc));
    if (w > 0) {
      const k = clamp((x - RAMP.x0) / (RAMP.x1 - RAMP.x0), 0, 1);
      h = Math.max(h, lerp(h, lerp(M.top, V.y, k), w));
    }
  }
  // ---- Frostbite Peak (north): a climbable mountain, a frozen lake, a flat pad for the ice cave
  const df = Math.hypot(x - FROST.x, z - FROST.z) / FROST.r;
  if (df < 1) h += FROST.h * (1 - smooth(0.2, 1, df));
  h = lerp(h, ICE.y, 1 - smooth(ICE.r - 1, ICE.r + 6, Math.hypot(x - ICE.x, z - ICE.z)));
  { const cx = Math.max(CAVE.x0 - x, 0, x - CAVE.x1), cz = Math.max(CAVE.z0 - z, 0, z - CAVE.z1); h = lerp(h, CAVE.y, 1 - smooth(0, 5, Math.hypot(cx, cz))); }
  // ---- Toxic Works (east): a flat factory yard with goo pits
  { const k = smooth(86, 98, x) * (1 - smooth(72, 84, Math.abs(z))); if (k > 0) h = lerp(h, TOXIC.y, k); }
  for (const g of GOO) { const d = Math.hypot(x - g.x, z - g.z); if (d < g.r + 2) h = lerp(h, -1.4, 1 - smooth(g.r - 2, g.r + 1, d)); }
  // ---- Neon Jackpot (south): a flat neon plaza
  { const k = smooth(86, 98, z) * (1 - smooth(72, 84, Math.abs(x))); if (k > 0) h = lerp(h, NEON.y, k); }
  // ---- Ember Ruins (west): a raised temple with a ramp, lava pools
  { const tx = Math.abs(x - TEMPLE.x), tz = Math.abs(z - TEMPLE.z);
    const k = 1 - smooth(TEMPLE.half, TEMPLE.half + 1.5, Math.max(tx, tz));
    if (k > 0) h = lerp(h, TEMPLE.top, k);
    if (x > TEMPLE.x + TEMPLE.half - 1 && x < TEMPLE.x + TEMPLE.half + 12 && tz < 3.5) h = Math.max(h, lerp(TEMPLE.top, 1.0, (x - (TEMPLE.x + TEMPLE.half - 1)) / 13)); }
  for (const l of LAVA) { const d = Math.hypot(x - l.x, z - l.z); if (d < l.r + 2) h = lerp(h, -1.6, 1 - smooth(l.r - 2, l.r + 1, d)); }
  // ---- the edge of the world
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > EDGE) h += Math.min(26, Math.pow(e - EDGE, 1.5) * 0.9) + 5 * Math.sin(x * 0.13 + 1) * Math.cos(z * 0.11) * smooth(172, 182, e) + smooth(182, 220, e) * 8;
  return h;
}

// ---------------------------------------------------------------- solid things
const boxes = [];
const cyls = [];
const props = { huts: [], lamps: [], palms: [], deadTrees: [], rocks: [], totems: [], flowers: [], tufts: [], signs: [], loops: [], platforms: [], posts: [], gates: [] };
const box = (x0, x1, y0, y1, z0, z1, kind, w = -1) => { const b = { x0, x1, y0, y1, z0, z1, kind, w }; boxes.push(b); return b; };
const cyl = (x, z, r, y0, y1, kind, w = -1) => { const c = { x, z, r, y0, y1, kind, w }; cyls.push(c); return c; };

// village: huts in a ring, a well in the middle, lamp posts around the edge
for (const deg of [20, 80, 140, 200, 260, 320]) {
  const a = (deg * Math.PI) / 180, x = Math.cos(a) * 15, z = Math.sin(a) * 15;
  const y = V.y;
  box(x - 2.5, x + 2.5, y - 1, y + 3.4, z - 2.5, z + 2.5, 'hut');
  box(x - 0.9, x + 0.9, y + 3.4, y + 4.9, z - 0.9, z + 0.9, 'roof');
  props.huts.push({ x, z, y, face: Math.atan2(-x, -z) });
}
cyl(0, 0, 1.3, V.y - 1, V.y + 1.0, 'well');
for (let i = 0; i < 8; i++) {
  const a = ((i * 45 + 50) * Math.PI) / 180, x = Math.cos(a) * 20.5, z = Math.sin(a) * 20.5;
  cyl(x, z, 0.22, V.y - 1, V.y + 4.6, 'lamp');
  props.lamps.push({ x, z, y: V.y });
}

// the old corridor north of the village: two walls and a roof
{
  const y = T.y, x0 = -7, x1 = 13;
  box(x0, x1, y - 2, y + 5.2, -44, -42.6, 'wall');
  box(x0, x1, y - 2, y + 5.2, -37.4, -36, 'wall');
  box(x0, x1, y + 4.6, y + 5.6, -44, -36, 'roof');
}

// bridge across the lake
{
  const x0 = 27, x1 = 77, z = 44;
  box(x0, x1, 0.3, 0.7, z - 1.6, z + 1.6, 'deck');
  for (let x = x0 + 4; x < x1 - 2; x += 6) {
    for (const s of [-1, 1]) { cyl(x, z + s * 1.5, 0.22, -3, 0.3, 'post'); props.posts.push({ x, z: z + s * 1.5 }); }
  }
}

// cliff with the waterfall on the south side of the lake
box(44, 60, -3, 9, 66, 74, 'cliff');
box(46.5, 57.5, -3, 11.5, 69, 74, 'cliff');

// floating platforms (reached with springs, or by flying)
const PLATFORMS = [
  { x: -22, z: 40, top: 8.5, half: 3.5 },
  { x: 28, z: -18, top: 8, half: 3.5 },
  { x: 52, z: 44, top: 6.5, half: 4 },
];
for (const p of PLATFORMS) {
  box(p.x - p.half, p.x + p.half, p.top - 1, p.top, p.z - p.half, p.z + p.half, 'platform');
  props.platforms.push(p);
}

// escape gates: one in each outer zone, only in the corrupted world; two open each round
export const EXITS = [
  { x: 20, z: -158 }, { x: 160, z: 42 }, { x: -40, z: 158 }, { x: -158, z: -56 },
].map((g, i) => {
  const y = terrainH(g.x, g.z), ry = Math.atan2(-g.x, -g.z); // faces the middle of the map
  const rx = Math.cos(ry), rz = -Math.sin(ry);
  for (const sd of [-1, 1]) cyl(g.x + rx * 3.4 * sd, g.z + rz * 3.4 * sd, 0.9, y - 1, y + 7.5, 'gate', 1);
  props.gates.push({ x: g.x, z: g.z, y, ry });
  return { i, x: g.x, z: g.z, y, ry };
});

// rift portals: step in to swap between the normal and the corrupted world (same spot, other world)
export const PORTALS = [
  { x: 24, z: -28 }, { x: -30, z: 32 }, { x: -20, z: -96 }, { x: 100, z: -8 },
  { x: 30, z: 96 }, { x: -98, z: -30 }, { x: 95, z: 100 }, { x: -95, z: -100 },
].map((p, i) => ({ i, x: p.x, z: p.z, y: terrainH(p.x, p.z) }));

// ---------------------------------------------------------------- Frostbite Peak
// the ice cave: two icy walls, a back wall and a roof; the fire core waits at the far end
{
  const y = CAVE.y;
  box(CAVE.x0, CAVE.x0 + 1.4, y - 2, y + 5.4, CAVE.z0, CAVE.z1, 'icewall');
  box(CAVE.x1 - 1.4, CAVE.x1, y - 2, y + 5.4, CAVE.z0, CAVE.z1, 'icewall');
  box(CAVE.x0, CAVE.x1, y - 2, y + 5.4, CAVE.z0, CAVE.z0 + 1.4, 'icewall');
  box(CAVE.x0 - 0.5, CAVE.x1 + 0.5, y + 4.8, y + 6.2, CAVE.z0 - 0.5, CAVE.z1, 'iceroof');
}
const ENGINE = { x: 48, z: -98 };
box(ENGINE.x - 2.2, ENGINE.x + 2.2, terrainH(ENGINE.x, ENGINE.z) - 1, terrainH(ENGINE.x, ENGINE.z) + 3.2, ENGINE.z - 1.8, ENGINE.z + 1.8, 'engine', 1);

// ---------------------------------------------------------------- Toxic Works
{
  const y = TOXIC.y, H = 7;
  // main hall with a door on the west and east walls
  box(128, 156, y - 1, y + H, -35, -34, 'hall'); box(128, 156, y - 1, y + H, -12, -11, 'hall');
  box(128, 129, y - 1, y + H, -34, -26, 'hall'); box(128, 129, y - 1, y + H, -20, -12, 'hall');
  box(155, 156, y - 1, y + H, -34, -26, 'hall'); box(155, 156, y - 1, y + H, -20, -12, 'hall');
  box(127.5, 156.5, y + H, y + H + 0.8, -35.5, -10.5, 'hallroof');
  // tanks and chimneys
  cyl(160, -62, 5, y - 1, y + 9, 'tank'); cyl(150, 64, 4, y - 1, y + 8, 'tank'); cyl(98, -64, 4, y - 1, y + 7, 'tank');
  cyl(165, -2, 2.2, y - 1, y + 22, 'chimney'); cyl(100, 72, 2, y - 1, y + 18, 'chimney');
  // catwalk with stairs up to it
  for (let i = 0; i < 8; i++) box(112 + i, 113 + i, y - 1, y + 0.55 * (i + 1), 56, 62, 'stairs');
  box(120, 140, y + 4.0, y + 4.4, 56, 62, 'catwalk');
  for (const px of [124, 132, 139]) cyl(px, 59, 0.35, y - 1, y + 4.0, 'strut');
  // crates
  for (const [cx, cz] of [[106, -24], [109, -21], [146, 44], [122, 26], [160, -44], [96, 34]]) box(cx - 1.4, cx + 1.4, y - 1, y + 2.6, cz - 1.4, cz + 1.4, 'crate');
}
export const CONVEYORS = [
  { x0: 96, x1: 126, z0: 16, z1: 21, top: TOXIC.y + 0.35, vx: 5, vz: 0 },
  { x0: 130, x1: 160, z0: -54, z1: -49, top: TOXIC.y + 0.35, vx: -5, vz: 0 },
];
for (const c of CONVEYORS) box(c.x0, c.x1, TOXIC.y - 1, c.top, c.z0, c.z1, 'belt');

// ---------------------------------------------------------------- Neon Jackpot
{
  const y = NEON.y;
  box(-8, 8, y - 1, y + 12, 150, 158, 'slot');
  for (const [bx, bz] of [[-34, 114], [-29, 121], [-39, 121], [34, 118], [29, 125], [39, 125], [-4, 128], [4, 128], [0, 134], [-58, 140], [58, 150]]) cyl(bx, bz, 1.25, y - 1, y + 1.7, 'bumper');
  for (const [dx, dz] of [[-55, 104], [52, 150], [-50, 156], [62, 112]]) box(dx - 1.6, dx + 1.6, y - 1, y + 2.4, dz - 1.6, dz + 1.6, 'dice');
  for (const sd of [-1, 1]) cyl(sd * 7, 96, 0.8, y - 1, y + 9, 'arch');
}
props.platforms.push({ x: 55, z: 124, top: 7, half: 3.5, kind: 'card' });
box(55 - 3.5, 55 + 3.5, 6, 7, 124 - 3.5, 124 + 3.5, 'platform');

// ---------------------------------------------------------------- Ember Ruins
const PILLARS = [{ x: -150, z: -40 }, { x: -160, z: 6 }, { x: -122, z: 58 }];
{
  for (const pl of PILLARS) { const y = terrainH(pl.x, pl.z); pl.y = y; pl.top = 10.5; box(pl.x - 1.6, pl.x + 1.6, y - 1, pl.top, pl.z - 1.6, pl.z + 1.6, 'pillar'); }
  // the temple top: a ring of columns
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, x = TEMPLE.x + Math.cos(a) * 10.5, z = TEMPLE.z + Math.sin(a) * 10.5;
    if (Math.cos(a) > 0.85) continue; // keep the ramp side open
    cyl(x, z, 0.8, TEMPLE.top - 1, TEMPLE.top + (i % 3 === 0 ? 3 : 6.5), 'column');
  }
  // broken walls and fallen columns around the ruins
  for (const [wx, wz, w, d, h] of [[-100, -12, 8, 1.2, 3], [-118, -64, 1.2, 9, 4], [-146, 60, 10, 1.2, 2.5], [-168, -20, 1.2, 8, 3.5], [-128, 34, 6, 1.2, 2], [-98, 22, 1.2, 6, 2.6]]) {
    const y = terrainH(wx, wz); box(wx - w / 2, wx + w / 2, y - 1, y + h, wz - d / 2, wz + d / 2, 'ruin');
  }
}

// ---------------------------------------------------------------- loops between zones
props.loops.push({ x: -84, z: -60, a: 0.8 }, { x: 84, z: -70, a: -0.7 }, { x: 60, z: 88, a: 0.2 });

// the hollow: a ring of totems around the altar where EXE wakes
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.3, x = S.x + Math.cos(a) * 9, z = S.z + Math.sin(a) * 9;
  const y = terrainH(x, z);
  cyl(x, z, 0.75, y - 1, y + 5.5, 'totem');
  props.totems.push({ x, z, y, h: 5.5, ry: Math.atan2(S.x - x, S.z - z), shrine: true });
}
box(S.x - 1.6, S.x + 1.6, terrainH(S.x, S.z) - 1, terrainH(S.x, S.z) + 0.9, S.z - 1, S.z + 1, 'altar');

// loops: decoration you can run through
props.loops.push({ x: -24, z: -26, a: 0.4 }, { x: 26, z: 22, a: -0.9 }, { x: -30, z: 64, a: 1.3 });

// springs: step on one and it throws you to its target
export const SPRINGS = [
  { x: -60, z: -32, tx: -60, tz: -17 },
  { x: -60, z: 13, tx: -60, tz: -1 },
  { x: -22, z: 52, tx: -22, tz: 40 },
  { x: 16, z: -18, tx: 28, tz: -18 },
  { x: 38, z: 44, tx: 52, tz: 44, entry: [{ x: 24, z: 44 }] },
  { x: 55, z: 112, tx: 55, tz: 124 },
  { x: -143, z: -40, tx: -150, tz: -40 },
  { x: -153, z: 6, tx: -160, tz: 6 },
  { x: -115, z: 58, tx: -122, tz: 58 },
].map((s, i) => ({ i, ...s })); // heights and launch speeds are filled in once the grid exists (below)

// signs with messages nobody should have written
const SIGNS = [
  { x: 7, z: 7, text: 'WELCOME\nHOME :)' },
  { x: -9, z: -9, text: 'THE SUN\nWENT OUT' },
  { x: 2, z: -33, text: "DON'T GO\nINSIDE" },
  { x: -44, z: 8, text: 'HE IS\nFASTER' },
  { x: 30, z: 36, text: 'NO ONE\nLEAVES' },
  { x: -40, z: 50, text: 'WHY DID YOU\nCOME BACK' },
  { x: 60, z: -22, text: "DON'T LOOK\nBEHIND YOU" },
  { x: -6, z: 60, text: 'STAY\nFOREVER' },
];
for (const s of SIGNS) {
  const y = terrainH(s.x, s.z);
  cyl(s.x, s.z, 0.3, y - 1, y + 2.4, 'sign');
  props.signs.push({ ...s, y, ry: Math.atan2(-s.x, -s.z) });
}

// scattered nature: placed with a fixed seed, kept out of paths and buildings
const r = rng(7331);
function freeSpot(x, z, extra = 0) {
  if (Math.max(Math.abs(x), Math.abs(z)) > EDGE - 4) return false;
  const zn = zoneAt(x, z).id;
  if (zn === 'toxic' || zn === 'neon') return false; // man-made zones get their own props
  if (Math.hypot(x - ICE.x, z - ICE.z) < ICE.r + 4) return false;
  if (x > CAVE.x0 - 5 && x < CAVE.x1 + 5 && z > CAVE.z0 - 5 && z < CAVE.z1 + 8) return false;
  if (Math.abs(x - TEMPLE.x) < TEMPLE.half + 4 && Math.abs(z - TEMPLE.z) < TEMPLE.half + 4) return false;
  if (x > TEMPLE.x && x < TEMPLE.x + TEMPLE.half + 16 && Math.abs(z - TEMPLE.z) < 6) return false;
  for (const l of LAVA) if (Math.hypot(x - l.x, z - l.z) < l.r + 3) return false;
  for (const p of PORTALS) if (Math.hypot(x - p.x, z - p.z) < 6) return false;
  for (const p of PILLARS) if (Math.hypot(x - p.x, z - p.z) < 10) return false;
  if (Math.hypot(x - ENGINE.x, z - ENGINE.z) < 7) return false;
  if (Math.hypot(x - V.x, z - V.z) < V.r + 5 + extra) return false;
  if (Math.hypot(x - L.x, z - L.z) < L.r + 3) return false;
  if (Math.hypot(x - S.x, z - S.z) < 11) return false;
  if (x > RAMP.x0 - 3 && x < RAMP.x1 + 3 && Math.abs(z - RAMP.zc) < RAMP.half + 3) return false;
  if (x > T.x0 - 4 && x < T.x1 + 4 && z > T.z0 - 4 && z < T.z1 + 4) return false;
  if (x > 40 && x < 64 && z > 62 && z < 78) return false;
  for (const g of EXITS) if (Math.hypot(x - g.x, z - g.z) < 10) return false;
  for (const s of SPRINGS) if (Math.hypot(x - s.x, z - s.z) < 5 || Math.hypot(x - s.tx, z - s.tz) < 5) return false;
  for (const l of props.loops) if (Math.hypot(x - l.x, z - l.z) < 9) return false;
  for (const s of SIGNS) if (Math.hypot(x - s.x, z - s.z) < 3) return false;
  for (const c of cyls) if (Math.hypot(x - c.x, z - c.z) < c.r + 2.5) return false;
  return true;
}
function scatter(n, minGap, fn) {
  for (let i = 0, tries = 0; i < n && tries < n * 60; tries++) {
    const x = (r() * 2 - 1) * (EDGE - 4), z = (r() * 2 - 1) * (EDGE - 4);
    if (!freeSpot(x, z, minGap)) continue;
    fn(x, z, terrainH(x, z));
    i++;
  }
}
props.pines = []; props.columns = [];
scatter(110, 0, (x, z, y) => {
  const zn = zoneAt(x, z).id;
  if (zn === 'frost') { const h = 6 + r() * 5; cyl(x, z, 0.5, y - 1, y + h, 'pine'); props.pines.push({ x, z, y, h, ry: r() * 6.28 }); }
  else if (zn === 'ember') { const h = 3 + r() * 6; cyl(x, z, 0.85, y - 1, y + h, 'column'); props.columns.push({ x, z, y, h, ry: r() * 6.28, broken: h < 6 }); }
  else { const h = 6 + r() * 3; cyl(x, z, 0.45, y - 1, y + h, 'palm'); props.palms.push({ x, z, y, h, lean: (r() - 0.5) * 0.35, ry: r() * 6.28, dead: r() < 0.35 }); }
});
scatter(40, 0, (x, z, y) => { const h = 4.5 + r() * 3; cyl(x, z, 0.4, y - 1, y + h, 'tree'); props.deadTrees.push({ x, z, y, h, ry: r() * 6.28 }); });
scatter(46, 0, (x, z, y) => { const rad = 0.9 + r() * 1.4, h = 0.8 + r() * 1.8; cyl(x, z, rad * 0.85, y - 1, y + h, 'rock'); props.rocks.push({ x, z, y, r: rad, h, ry: r() * 6.28 }); });
scatter(16, 0, (x, z, y) => { const h = 4 + r() * 2.5; cyl(x, z, 0.7, y - 1, y + h, 'totem'); props.totems.push({ x, z, y, h, ry: r() * 6.28 }); });
for (let i = 0; i < 320; i++) {
  const x = (r() * 2 - 1) * 160, z = (r() * 2 - 1) * 160, y = terrainH(x, z), zn = zoneAt(x, z).id;
  if (y < WATER_Y + 0.3 || Math.hypot(x, z) < 8 || Math.hypot(x - S.x, z - S.z) < 12 || zn === 'toxic' || zn === 'neon' || zn === 'frost') continue;
  props.flowers.push({ x, z, y, h: 0.9 + r() * 0.8, ry: r() * 6.28, droop: r(), hue: r() });
}
for (let i = 0; i < 1800; i++) {
  const x = (r() * 2 - 1) * 166, z = (r() * 2 - 1) * 166, y = terrainH(x, z), zn = zoneAt(x, z).id;
  if (y < WATER_Y + 0.2 || zn === 'toxic' || zn === 'neon' || zn === 'frost') continue;
  props.tufts.push({ x, z, y, s: 0.6 + r() * 0.8, ry: r() * 6.28, dead: r() });
}

// ---------------------------------------------------------------- spatial grid
const CELL = 8, GN = Math.ceil((HALF * 2 + 24) / CELL), G0 = -HALF - 12;
const grid = Array.from({ length: GN * GN }, () => []);
const cellOf = (v) => clamp(Math.floor((v - G0) / CELL), 0, GN - 1);
function insert(o, x0, x1, z0, z1) {
  for (let i = cellOf(x0 - 1); i <= cellOf(x1 + 1); i++) for (let j = cellOf(z0 - 1); j <= cellOf(z1 + 1); j++) grid[i * GN + j].push(o);
}
for (const b of boxes) { b.box = true; insert(b, b.x0, b.x1, b.z0, b.z1); }
for (const c of cyls) insert(c, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r);
/** Every box and cylinder that might touch something within ~1 m of (x, z). */
export const near = (x, z) => grid[cellOf(x) * GN + cellOf(z)];

// ---------------------------------------------------------------- queries
/** Highest thing you can stand on at (x, z) that is no higher than y + STEP (the ground, a deck, a rock...). */
export function supportAt(x, z, y, ignoreStep = false, w) {
  let s = terrainH(x, z);
  const lim = ignoreStep ? Infinity : y + STEP + 0.001;
  for (const o of near(x, z)) {
    if (o.w >= 0 && w !== undefined && w >= 0 && o.w !== w) continue;
    if (o.y1 <= s || o.y1 > lim) continue;
    if (o.box ? x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 : Math.hypot(x - o.x, z - o.z) < o.r) s = o.y1;
  }
  return s;
}

/** If a head moving up from headNow to headNext hits the underside of a box, returns that height. */
export function ceilingAt(x, z, headNow, headNext, w) {
  let c = null;
  for (const o of near(x, z)) {
    if (o.w >= 0 && w !== undefined && w >= 0 && o.w !== w) continue;
    if (!o.box || o.y0 < headNow - 0.01 || o.y0 > headNext) continue;
    if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && (c === null || o.y0 < c)) c = o.y0;
  }
  return c;
}

/** Pushes a body (circle of radius r, feet at y, height h) out of every box and cylinder in world w.
 *  Mutates p {x, z}. Returns the last thing it hit (bumpers win), or null. */
export function pushOut(p, y, r, h, w) {
  let hit = null;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of near(p.x, p.z)) {
      if (o.w >= 0 && w !== undefined && w >= 0 && o.w !== w) continue;
      if (o.y1 <= y + STEP || o.y0 >= y + h) continue;
      if (o.box) {
        const cx = clamp(p.x, o.x0, o.x1), cz = clamp(p.z, o.z0, o.z1);
        const dx = p.x - cx, dz = p.z - cz;
        const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (!hit || hit.kind !== 'bumper') hit = o;
        if (d > 1e-6) { p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
        else {
          const ex = [p.x - o.x0, o.x1 - p.x, p.z - o.z0, o.z1 - p.z], m = Math.min(...ex);
          if (m === ex[0]) p.x = o.x0 - r; else if (m === ex[1]) p.x = o.x1 + r; else if (m === ex[2]) p.z = o.z0 - r; else p.z = o.z1 + r;
        }
      } else {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = r + o.r;
        if (d >= min) continue;
        hit = o;
        if (d > 1e-6) { p.x = o.x + (dx / d) * min; p.z = o.z + (dz / d) * min; } else p.x = o.x + min;
      }
    }
  }
  return hit;
}

/** True when a body standing at (x, y, z) would overlap something solid (used by bot feelers). */
export function solidAt(x, z, y, r = 0.5, h = 2.4, w) {
  for (const o of near(x, z)) {
    if (o.w >= 0 && w !== undefined && w >= 0 && o.w !== w) continue;
    if (o.y1 <= y + STEP || o.y0 >= y + h) continue;
    if (o.box) { if (Math.hypot(x - clamp(x, o.x0, o.x1), z - clamp(z, o.z0, o.z1)) < r) return true; }
    else if (Math.hypot(x - o.x, z - o.z) < r + o.r) return true;
  }
  return false;
}

export function springAt(x, z, y) {
  for (const s of SPRINGS) if (Math.hypot(x - s.x, z - s.z) < 1.25 && Math.abs(y - s.y) < 0.5) return s;
  return null;
}

export const isWater = (x, z, y) => {
  if (!(terrainH(x, z) < WATER_Y - 0.25 && y < WATER_Y + 0.15)) return false;
  return Math.hypot(x - L.x, z - L.z) < L.r + 3 || Math.hypot(x - S.x, z - S.z) < S.r;
};

/** What you are standing in: 'ice', 'goo', 'lava', 'water' or null. */
export function surfaceAt(x, z, y) {
  if (Math.hypot(x - ICE.x, z - ICE.z) < ICE.r - 0.5 && y < ICE.y + 0.3) return 'ice';
  if (x > CAVE.x0 && x < CAVE.x1 && z > CAVE.z0 && z < CAVE.z1 && y < CAVE.y + 0.3) return 'ice';
  if (y < GOO_Y + 0.15) for (const g of GOO) if (Math.hypot(x - g.x, z - g.z) < g.r) return 'goo';
  if (y < LAVA_Y + 0.35) for (const l of LAVA) if (Math.hypot(x - l.x, z - l.z) < l.r) return 'lava';
  if (isWater(x, z, y)) return 'water';
  return null;
}

/** Conveyor belt under feet at height y, or null. */
export function conveyorAt(x, z, y) {
  for (const c of CONVEYORS) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && Math.abs(y - c.top) < 0.25) return c;
  return null;
}

// speed boost pads: run over one and it throws you forward
export const BOOSTS = [
  { x: 0, z: 30, a: 0 }, { x: 0, z: 74, a: 0 }, { x: 60, z: 6, a: Math.PI / 2 }, { x: 86, z: 4, a: Math.PI / 2 },
  { x: -80, z: 20, a: -Math.PI / 2 }, { x: -62, z: 30, a: -Math.PI / 2 }, { x: -6, z: -64, a: Math.PI }, { x: -4, z: -86, a: Math.PI },
  { x: -20, z: 120, a: Math.PI / 2 }, { x: 20, z: 140, a: -Math.PI / 2 }, { x: 110, z: -6, a: Math.PI / 2 }, { x: -104, z: 20, a: -Math.PI / 2 },
  { x: 10, z: -112, a: Math.PI / 2 }, { x: 70, z: 70, a: Math.PI / 4 }, { x: -70, z: -70, a: -Math.PI * 0.75 },
].map((b, i) => ({ i, ...b, y: terrainH(b.x, b.z), dx: Math.sin(b.a), dz: Math.cos(b.a) }));
export const BOOST = { speed: 26, lock: 0.5, range: 1.5 };
export function boostAt(x, z, y) {
  for (const b of BOOSTS) if (Math.hypot(x - b.x, z - b.z) < BOOST.range && Math.abs(y - b.y) < 0.8) return b;
  return null;
}
export const clampXZ = (p) => { p.x = clamp(p.x, -HALF, HALF); p.z = clamp(p.z, -HALF, HALF); return p; };

/** Distance along a ray until it hits the ground or a box (for the camera). Returns max if nothing is hit. */
export function rayDist(ox, oy, oz, dx, dy, dz, max, w) {
  for (let t = 0.3; t < max; t += 0.25) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y < terrainH(x, z) + 0.25) return t;
    for (const o of near(x, z)) {
      if (o.w >= 0 && w !== undefined && w >= 0 && o.w !== w) continue;
      if (o.box && x > o.x0 - 0.2 && x < o.x1 + 0.2 && z > o.z0 - 0.2 && z < o.z1 + 0.2 && y > o.y0 - 0.2 && y < o.y1 + 0.2) return t;
    }
  }
  return max;
}

/** Can a point at a see a point at b? Checks the ground and boxes (walls, huts, the cliff). */
export function lineOfSight(ax, ay, az, bx, by, bz, w) {
  const d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.ceil(d / 1.5);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (y < terrainH(x, z)) return false;
    for (const o of near(x, z)) if (o.box && !(o.w >= 0 && w !== undefined && o.w !== w) && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && y > o.y0 && y < o.y1) return false;
  }
  return true;
}

// spring launch: a fixed arc from the pad to its target
for (const s of SPRINGS) {
  s.y = supportAt(s.x, s.z, 100, true);
  s.ty = supportAt(s.tx, s.tz, 100) + 0.05;
  s.T = 1.15 + Math.hypot(s.tx - s.x, s.tz - s.z) * 0.012;
  s.vx = (s.tx - s.x) / s.T; s.vz = (s.tz - s.z) / s.T; s.vy = (s.ty - s.y + 0.5 * GRAVITY * s.T * s.T) / s.T;
}

// ---------------------------------------------------------------- round spots
const groundY = (x, z) => supportAt(x, z, terrainH(x, z) + 0.1);
const SHARD_SPOTS_RAW = [
  { x: -64, z: -12, via: [0, 1] }, { x: -55, z: -2, via: [1, 0] },
  { x: -22, z: 40, top: true, via: [2] }, { x: 28, z: -18, top: true, via: [3] }, { x: 52, z: 44, top: true, via: [4] },
  { x: 2, z: -40, entry: [{ x: -10, z: -40 }, { x: 16, z: -40 }] }, { x: 52, z: -50 }, { x: -40, z: 70 }, { x: 72, z: 66 }, { x: 14, z: -16 },
  { x: -30, z: -60 }, { x: 70, z: -14 }, { x: 16, z: 66 }, { x: -74, z: 30 }, { x: 66, z: 44, top: true, entry: [{ x: 80, z: 44 }, { x: 24, z: 44 }] },
  { x: 26, z: 22 }, { x: -36, z: -40 }, { x: 36, z: -72 },
];
export const SHARD_SPOTS = SHARD_SPOTS_RAW.map((s, i) => ({
  i, x: s.x, z: s.z, y: (s.top ? supportAt(s.x, s.z, 100) : s.via ? terrainH(s.x, s.z) : groundY(s.x, s.z)) + 1.1, via: s.via || null, entry: s.entry || null,
}));

export const SPAWNS = {
  surv: Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + 0.5; return { x: Math.cos(a) * 6, z: Math.sin(a) * 6, ry: Math.atan2(Math.cos(a), Math.sin(a)) }; }),
  exe: { x: S.x + 2, z: S.z - 6, ry: Math.atan2(-S.x, -S.z) },
};

// ---------------------------------------------------------------- zone tasks
export const OBJ = {
  valves: [{ x: 142, z: -23, entry: [{ x: 124, z: -23 }, { x: 160, z: -23 }] }, { x: 158, z: 28 }, { x: 136, z: 59, top: true, entry: [{ x: 109, z: 59 }] }],
  panels: [{ x: -50, z: 132 }, { x: 50, z: 136 }, { x: -22, z: 162 }, { x: 22, z: 108 }],
  core: { x: -70, z: -118, entry: [{ x: -70, z: -95 }] },
  engine: { x: ENGINE.x, z: ENGINE.z + 3.2 },
  bells: PILLARS.map((p, i) => ({ x: p.x, z: p.z, top: true, via: [6 + i] })),
};
for (const k of ['valves', 'panels', 'bells']) for (const o of OBJ[k]) o.y = (o.top ? supportAt(o.x, o.z, 100) : groundY(o.x, o.z)) + 1.1;
OBJ.core.y = groundY(OBJ.core.x, OBJ.core.z); OBJ.engine.y = groundY(OBJ.engine.x, OBJ.engine.z);

export const MAP = { boxes, cyls, props, SPRINGS, EXITS, SHARD_SPOTS, SPAWNS, PORTALS, BOOSTS, CONVEYORS, OBJ, ZONES };
