// The garage. Names are made up (some are look-alikes of famous makes, deliberately not the real names). Prices are in cash ($); 10 banked points = $1.
//   top: top speed km/h · accel: m/s² off the line · grip: steering response
//   body: the model's shape (see models.js bodyShape for what each field means). L and W are also the hitbox.
const DARK = 0x111317, PLASTIC = 0x1c1f25, GLASS = 0x1a2433, SILVER = 0xc8ccd4;

// the look-alike sports cars share some shapes
const PORSHA = {
  L: 4.52, W: 1.85, clear: 0.11, wheel: 0.34, axle: [0.17, 0.79], nose: 0.3, noseLen: 0.12, tail: 0.24, tailLen: 0.1, fender: [0.12, 0.08], flare: [0.02, 0.06], hoodCrown: 0.01, chin: 0.07,
  top: [[0, 0.74], [0.05, 0.84], [0.2, 0.86], [0.45, 0.8], [0.72, 0.72], [0.9, 0.64], [1, 0.52]],
  cab: { r0: 0.08, r1: 0.42, f1: 0.58, f0: 0.72, h: 1.3, w: 0.72, gw: 0.82, fast: 1.4, b: 0.5 }, pillar: DARK, sill: PLASTIC,
  roundLights: { x: 0.6, y: 0.69, r: 0.105 }, hlx: [0.5, 0.7], hly: [0.62, 0.76],
  tailBar: true, tlx: [0.55, 0.86], tly: [0.7, 0.76], ducktail: 0.035,
  grille: false, intakeF: [0.18, 0.78, 0.12],
};
// a sideways 'Y' light inside a lens: stem from x0 to xm at height y, arms out to x1
const Y = (x0, xm, x1, y, up, dn, t = 0.011) => [
  [[x0, y - t / 2], [xm, y - t / 2 - 0.01], [xm, y + t / 2 - 0.01], [x0, y + t / 2]],
  [[xm, y - t / 2 - 0.01], [x1, y + up - t / 2], [x1, y + up + t / 2], [xm, y + t / 2 - 0.01]],
  [[xm, y - t / 2 - 0.01], [x1, y - dn - t / 2], [x1, y - dn + t / 2], [xm, y + t / 2 - 0.01]],
];

export const CARS = [
  {
    id: 'pocket', name: 'Pocket', cls: 'Kei', price: 0, top: 178, accel: 6.2, grip: 1.12, color: 0xf2efe6,
    engine: { voice: 'i4', pitch: 1.18 },
    body: {
      L: 3.4, W: 1.48, clear: 0.16, wheel: 0.27, axle: [0.15, 0.85], nose: 0.14, noseLen: 0.07, tail: 0.08, chin: 0.06, lift: 0.06,
      top: [[0, 0.86], [0.04, 0.9], [0.5, 0.92], [0.86, 0.88], [0.96, 0.82], [1, 0.74]],
      cab: { r0: 0.02, r1: 0.06, f1: 0.6, f0: 0.8, h: 1.56, w: 0.88, gw: 0.88, b: 0.4 }, pillar: DARK, roofCol: 0xefefea,
      hlx: [0.28, 0.56], hly: [0.6, 0.7], tlx: [0.52, 0.68], tly: [0.5, 0.82], grille: [0.22, 0.4, 0.55],
      rim: { disc: true, color: 0xd8dbe0, size: 0.7 }, exhaust: 'single',
    },
  },
  {
    id: 'commuter', name: 'Commuter S', cls: 'Sedan', price: 3000, top: 205, accel: 7.4, grip: 1.06, color: 0x2b5fb3,
    engine: { voice: 'i4', pitch: 1.0 },
    body: {
      L: 4.6, W: 1.8, clear: 0.15, wheel: 0.31, axle: [0.2, 0.79], nose: 0.2, tail: 0.14, fender: [0.02, 0.02],
      top: [[0, 0.84], [0.05, 0.9], [0.22, 0.93], [0.55, 0.93], [0.85, 0.87], [0.96, 0.8], [1, 0.7]],
      cab: { r0: 0.18, r1: 0.32, f1: 0.57, f0: 0.72, h: 1.42, w: 0.78, b: 0.45, fast: 0.3 }, pillar: DARK, sill: PLASTIC,
      hlx: [0.34, 0.78], tlx: [0.4, 0.86],
      rim: { spokes: 5, color: 0xc4c9d1 }, exhaust: 'twin',
    },
  },
  {
    id: 'hatchr', name: 'Hatch R', cls: 'Hot hatch', price: 8000, top: 228, accel: 8.6, grip: 1.18, color: 0xe03a3a,
    engine: { voice: 'i4', pitch: 1.08, turbo: true },
    body: {
      L: 4.15, W: 1.8, clear: 0.12, wheel: 0.33, axle: [0.16, 0.81], nose: 0.2, tail: 0.12, fender: [0.02, 0.03], flare: [0.03, 0.04],
      top: [[0, 0.84], [0.04, 0.92], [0.5, 0.93], [0.82, 0.88], [0.95, 0.8], [1, 0.68]],
      cab: { r0: 0.03, r1: 0.14, f1: 0.56, f0: 0.71, h: 1.38, w: 0.8, b: 0.38, fast: 0.6 }, pillar: DARK, sill: PLASTIC, skirt: true,
      roofSpoiler: true, splitter: true, hlx: [0.4, 0.8], hly: [0.56, 0.63], grille: [0.5, 0.2, 0.5], tlx: [0.48, 0.86],
      rim: { spokes: 10, sw: 0.04, color: 0x1c1e22 }, caliper: 0xe02020, exhaust: 'center', exR: 0.05,
    },
  },
  {
    id: 'ronin', name: 'Ronin', cls: 'Sport coupe', price: 16000, top: 252, accel: 9.4, grip: 1.2, color: 0xf2f2f2,
    engine: { voice: 'i6', pitch: 1.0, turbo: true },
    body: {
      L: 4.4, W: 1.78, clear: 0.11, wheel: 0.32, axle: [0.18, 0.8], nose: 0.24, noseLen: 0.12, tail: 0.14, fender: [0.025, 0.03], flare: [0.02, 0.03],
      top: [[0, 0.8], [0.04, 0.86], [0.3, 0.86], [0.6, 0.84], [0.9, 0.76], [1, 0.62]],
      cab: { r0: 0.12, r1: 0.3, f1: 0.52, f0: 0.67, h: 1.27, w: 0.74, fast: 0.4 }, sill: PLASTIC, skirt: true, splitter: true,
      wing: { h: 0.2, t: 0.045, chord: 0.28 }, hly: [0.5, 0.55], hlx: [0.4, 0.8], tlx: [0.36, 0.82], tly: [0.66, 0.74],
      rim: { spokes: 6, sw: 0.06, color: 0xb88a3a }, caliper: 0xd0302a, exhaust: 'single', exR: 0.06,
    },
  },
  {
    id: 'supremo', name: 'Toyoda Supremo', cls: 'Sport coupe', price: 24000, top: 268, accel: 10.0, grip: 1.21, color: 0xff4a1a,
    engine: { voice: 'i6', pitch: 1.05, turbo: true },
    body: {
      L: 4.38, W: 1.85, clear: 0.11, wheel: 0.33, axle: [0.17, 0.8], nose: 0.3, noseLen: 0.13, tail: 0.18, fender: [0.06, 0.06], flare: [0.02, 0.04], hoodCrown: 0.01, chin: 0.07,
      top: [[0, 0.82], [0.04, 0.88], [0.25, 0.86], [0.5, 0.8], [0.7, 0.76], [0.9, 0.68], [1, 0.55]],
      cab: { r0: 0.14, r1: 0.36, f1: 0.56, f0: 0.72, h: 1.29, w: 0.72, fast: 1.1 }, sill: PLASTIC, ducktail: 0.04, splitter: true,
      hlx: [0.45, 0.85], hly: [0.52, 0.58], tailBar: true, tlx: [0.45, 0.9], tly: [0.68, 0.74], intakeF: [0.3, 0.7, 0.14],
      rim: { spokes: 5, sw: 0.06, color: 0x2a2d33 }, caliper: 0xd02020, exhaust: 'dual', exR: 0.05,
    },
  },
  {
    id: 'thunder', name: 'Thunder 8', cls: 'Muscle', price: 30000, top: 272, accel: 10.6, grip: 0.98, color: 0xf4b400,
    engine: { voice: 'v8', pitch: 0.86 },
    body: {
      L: 4.85, W: 1.95, clear: 0.13, wheel: 0.35, axle: [0.19, 0.78], nose: 0.08, noseLen: 0.06, tail: 0.06, fender: [0, 0.04], flare: [0, 0.04], chin: 0.06,
      top: [[0, 0.88], [0.03, 0.93], [0.25, 0.94], [0.55, 0.92], [0.85, 0.9], [0.97, 0.86], [1, 0.8]],
      cab: { r0: 0.1, r1: 0.34, f1: 0.5, f0: 0.62, h: 1.32, w: 0.72, fast: 0.8 }, sill: PLASTIC,
      scoop: [0.8, 0.7, 0.2], stripe: 0x15161a, grille: [0.8, 0.3, 0.74], hlx: [0.6, 0.84], hly: [0.6, 0.7],
      tailBar: true, tlx: [0.52, 0.9], tly: [0.72, 0.82],
      rim: { spokes: 5, sw: 0.09, color: 0x16181c }, exhaust: 'dual', exR: 0.055,
    },
  },
  {
    id: 'porsha', name: 'Porsha 912 Carrera', cls: 'Sports car', price: 42000, top: 293, accel: 11.0, grip: 1.24, color: 0xc81d25,
    engine: { voice: 'i4', pitch: 1.42 },
    body: { ...PORSHA, rim: { spokes: 5, sw: 0.085, color: SILVER }, caliper: 0xd02020, exhaust: 'center', exR: 0.045 },
  },
  {
    id: 'vanta', name: 'Vanta GT', cls: 'Grand tourer', price: 55000, top: 296, accel: 11.4, grip: 1.15, color: 0x1f6f5c,
    engine: { voice: 'v8', pitch: 1.0 },
    body: {
      L: 4.75, W: 1.95, clear: 0.11, wheel: 0.35, axle: [0.18, 0.79], nose: 0.24, noseLen: 0.12, tail: 0.2, fender: [0.04, 0.06], flare: [0.02, 0.05], hoodCrown: 0,
      top: [[0, 0.84], [0.03, 0.88], [0.2, 0.88], [0.5, 0.84], [0.8, 0.8], [0.95, 0.72], [1, 0.6]],
      cab: { r0: 0.06, r1: 0.3, f1: 0.47, f0: 0.6, h: 1.25, w: 0.7, fast: 1 }, sill: PLASTIC, splitter: true, diffuser: true,
      vents: [0.72, 0.36], hlx: [0.42, 0.84], hly: [0.48, 0.53], drl: [0.42, 0.84, 0.455],
      tailBar: true, tlx: [0.5, 0.9], tly: [0.73, 0.8], rearVent: 0.12,
      rim: { spokes: 10, sw: 0.045, color: 0xc8ccd4 }, caliper: 0xc9a04a, exhaust: 'quad',
    },
  },
  {
    id: 'corvex', name: 'Corvex Stingray', cls: 'Mid-engine', price: 62000, top: 312, accel: 12.6, grip: 1.24, color: 0xe8322a,
    engine: { voice: 'v8', pitch: 0.92 },
    body: {
      L: 4.63, W: 1.93, clear: 0.1, wheel: 0.35, axle: [0.18, 0.8], nose: 0.32, noseLen: 0.13, tail: 0.1, fender: [0.12, 0.08], flare: [0.03, 0.05], hoodCrown: 0, chin: 0.08,
      top: [[0, 0.88], [0.04, 0.92], [0.28, 0.88], [0.5, 0.74], [0.74, 0.66], [0.92, 0.58], [1, 0.46]],
      cab: { r0: 0.3, r1: 0.44, f1: 0.6, f0: 0.78, h: 1.23, w: 0.66, gw: 0.8, fast: 0.4 }, sill: PLASTIC, grille: false, intakeF: [0.25, 0.85, 0.18],
      intakes: [0.38, 0.54], rearVent: 0.18, splitter: true, diffuser: true, hlx: [0.5, 0.9], hly: [0.4, 0.46], drl: [0.5, 0.9, 0.465],
      tlx: [0.42, 0.93], tly: [0.72, 0.8], wing: { h: 0.05, t: 0.04, chord: 0.24, w: 0.9 },
      rim: { spokes: 10, sw: 0.04, taper: 0.6, color: 0x1c1e22 }, caliper: 0xf4b400, exhaust: 'quadc', exR: 0.045, exY: 0.32,
    },
  },
  {
    id: 'gtz', name: 'Nisson GT-Z', cls: 'All-wheel drive', price: 68000, top: 315, accel: 13.0, grip: 1.34, color: 0x8a929e,
    engine: { voice: 'i6', pitch: 0.95, turbo: true },
    body: {
      L: 4.71, W: 1.9, clear: 0.11, wheel: 0.35, axle: [0.18, 0.79], nose: 0.22, noseLen: 0.1, tail: 0.1, fender: [0.06, 0.06], flare: [0.03, 0.05], chin: 0.08, hoodCrown: 0.01,
      top: [[0, 0.86], [0.04, 0.9], [0.25, 0.9], [0.55, 0.86], [0.8, 0.8], [0.95, 0.74], [1, 0.64]],
      cab: { r0: 0.12, r1: 0.34, f1: 0.54, f0: 0.7, h: 1.34, w: 0.74, fast: 0.9 }, sill: PLASTIC, skirt: true,
      wing: { h: 0.2, t: 0.04, chord: 0.28, color: 0x15171b }, roundTails: { xs: [0.62, 0.84], y: 0.74, r: 0.075 },
      grille: [0.5, 0.2, 0.48], splitter: true, diffuser: true, vents: [0.8, 0.3], hlx: [0.5, 0.86], hly: [0.56, 0.63],
      rim: { spokes: 6, sw: 0.06, color: 0x2a2d33 }, caliper: 0xd0d4dc, exhaust: 'quad',
    },
  },
  {
    id: 'masarotti', name: 'Masarotti Tridente MC', cls: 'Supercar', price: 70000, top: 318, accel: 12.0, grip: 1.2, color: 0x2a4d8f,
    engine: { voice: 'v8', pitch: 1.12, turbo: true },
    body: {
      L: 4.67, W: 1.97, clear: 0.1, wheel: 0.35, axle: [0.18, 0.81], nose: 0.32, noseLen: 0.13, tail: 0.14, fender: [0.12, 0.08], flare: [0.02, 0.05], hoodCrown: 0.005, chin: 0.08,
      top: [[0, 0.86], [0.05, 0.9], [0.28, 0.86], [0.52, 0.74], [0.76, 0.66], [0.93, 0.58], [1, 0.48]],
      cab: { r0: 0.28, r1: 0.41, f1: 0.6, f0: 0.78, h: 1.2, w: 0.66, gw: 0.8, rearGlass: false, fast: 0.3 }, sill: PLASTIC,
      grille: [0.3, 0.16, 0.42], grilleBars: 9,
      lamps: { lens: [[[0.5, 0.5], [0.86, 0.47], [0.9, 0.53], [0.54, 0.57]]], lit: [[[0.55, 0.535], [0.85, 0.505], [0.86, 0.516], [0.56, 0.546]], [[0.79, 0.488], [0.85, 0.483], [0.855, 0.5], [0.795, 0.505]]] },
      tails: { lens: [[[0.42, 0.72], [0.94, 0.7], [0.92, 0.78], [0.5, 0.79]]], lit: [[[0.46, 0.744], [0.9, 0.724], [0.895, 0.738], [0.465, 0.758]], [[0.84, 0.705], [0.91, 0.704], [0.9, 0.772], [0.83, 0.774]]] },
      splitter: true, diffuser: true, intakes: [0.4, 0.54], rearVent: 0.14,
      rim: { spokes: 7, sw: 0.06, color: 0x2a2d33 }, caliper: 0x2a6cff, exhaust: 'dual', exR: 0.055, exY: 0.3,
    },
  },
  {
    id: 'teslo', name: 'Teslo Model P', cls: 'Electric', price: 80000, top: 262, accel: 15.6, grip: 1.18, color: 0xf2f4f8,
    engine: { voice: 'ev', pitch: 1 },
    body: {
      L: 4.72, W: 1.88, clear: 0.13, wheel: 0.34, axle: [0.18, 0.8], nose: 0.26, noseLen: 0.12, tail: 0.18, fender: [0.03, 0.03], hoodCrown: 0.01, chin: 0.05,
      top: [[0, 0.82], [0.05, 0.9], [0.25, 0.92], [0.55, 0.9], [0.8, 0.82], [0.95, 0.72], [1, 0.6]],
      cab: { r0: 0.12, r1: 0.3, f1: 0.58, f0: 0.74, h: 1.42, w: 0.76, b: 0.45, fast: 1.2 }, roofCol: GLASS, sill: PLASTIC, pillar: DARK,
      grille: false, intakeF: [0.3, 0.6, 0.1], hlx: [0.55, 0.88], hly: [0.6, 0.65], tailBar: true, tlx: [0.5, 0.92], tly: [0.7, 0.76],
      rim: { spokes: 5, sw: 0.1, color: 0xb6bcc6, size: 0.7 }, exhaust: 'none',
    },
  },
  {
    id: 'spectre', name: 'Spectre', cls: 'Supercar', price: 90000, top: 322, accel: 12.8, grip: 1.26, color: 0x7d3cff,
    engine: { voice: 'v8', pitch: 1.32 },
    body: {
      L: 4.55, W: 2.0, clear: 0.09, wheel: 0.35, axle: [0.17, 0.8], nose: 0.3, noseLen: 0.14, tail: 0.12, fender: [0.16, 0.06], flare: [0.03, 0.06], hoodCrown: 0, chin: 0.08,
      top: [[0, 0.9], [0.05, 0.92], [0.25, 0.88], [0.5, 0.72], [0.75, 0.66], [0.92, 0.58], [1, 0.46]],
      cab: { r0: 0.3, r1: 0.42, f1: 0.6, f0: 0.78, h: 1.13, w: 0.66, gw: 0.8, rearGlass: false, fast: 0.2 }, sill: PLASTIC,
      intakes: [0.4, 0.55], splitter: true, diffuser: true, intakeF: [0.3, 0.8, 0.2], grille: false,
      wing: { h: 0.18, t: 0.04, chord: 0.3, color: 0x15171b }, hlx: [0.5, 0.88], hly: [0.36, 0.41],
      tlx: [0.45, 0.9], tly: [0.76, 0.85], rearVent: 0.2,
      rim: { spokes: 5, sw: 0.07, color: 0x3a3f48 }, caliper: 0xf4b400, exhaust: 'center', exR: 0.05, exY: 0.32,
    },
  },
  {
    id: 'gt3r', name: 'Porsha 912 GT-3R', cls: 'Track car', price: 95000, top: 312, accel: 12.4, grip: 1.38, color: 0x2b8fd9,
    engine: { voice: 'i4', pitch: 1.6 },
    body: {
      ...PORSHA, W: 1.9, clear: 0.09, flare: [0.04, 0.08], ducktail: 0, splitter: true, skirt: true, diffuser: true, vents: [0.84, 0.3],
      wing: { h: 0.36, t: 0.04, chord: 0.36, w: 0.9, color: 0x15171b },
      rim: { spokes: 10, sw: 0.04, color: 0x2a2d33, cap: 0xffd000 }, caliper: 0xffd000, exhaust: 'center', exR: 0.05,
    },
  },
  {
    id: 'audy', name: 'Audy R10 V10', cls: 'Supercar', price: 105000, top: 330, accel: 13.2, grip: 1.28, color: 0xd8dde6,
    engine: { voice: 'v8', pitch: 1.4 },
    body: {
      L: 4.43, W: 1.94, clear: 0.1, wheel: 0.34, axle: [0.18, 0.8], nose: 0.3, noseLen: 0.12, tail: 0.14, fender: [0.1, 0.07], flare: [0.02, 0.05], hoodCrown: 0, chin: 0.08,
      top: [[0, 0.86], [0.05, 0.9], [0.28, 0.86], [0.5, 0.74], [0.75, 0.66], [0.92, 0.58], [1, 0.48]],
      cab: { r0: 0.28, r1: 0.43, f1: 0.6, f0: 0.78, h: 1.22, w: 0.66, gw: 0.8, fast: 0.5 }, sill: PLASTIC,
      grille: [0.38, 0.14, 0.42], grilleBars: 0, intakes: [0.38, 0.55], blade: 0x15171b, splitter: true, diffuser: true,
      hlx: [0.48, 0.86], hly: [0.48, 0.54], drl: [0.48, 0.86, 0.47], tlx: [0.48, 0.9], tly: [0.72, 0.78], rearVent: 0.16,
      rim: { spokes: 10, sw: 0.045, color: 0x2a2d33 }, caliper: 0xd02020, exhaust: 'dual', exR: 0.06, exY: 0.3,
    },
  },
  {
    id: 'uragano', name: 'Lamborini Uragano', cls: 'Supercar', price: 115000, top: 326, accel: 13.1, grip: 1.28, color: 0xc6ff3d,
    engine: { voice: 'v8', pitch: 1.28 },
    body: {
      L: 4.52, W: 1.94, clear: 0.09, wheel: 0.34, axle: [0.18, 0.8], nose: 0.34, noseLen: 0.14, tail: 0.1, fender: [0.08, 0.06], flare: [0.02, 0.05], hoodCrown: 0, chin: 0.08, crease: 24, tumble: 0.06, side: 0.42,
      top: [[0, 0.9], [0.04, 0.93], [0.25, 0.87], [0.5, 0.72], [0.72, 0.62], [0.9, 0.54], [1, 0.42]],
      cab: { r0: 0.28, r1: 0.43, f1: 0.58, f0: 0.8, h: 1.15, w: 0.62, gw: 0.78, rearGlass: false, fast: 0.1 }, sill: PLASTIC,
      grille: false, intakeF: [0.25, 0.86, 0.2], splitter: true, diffuser: true, intakes: [0.38, 0.55],
      lamps: { lens: [[[0.5, 0.47], [0.9, 0.44], [0.93, 0.5], [0.55, 0.53]]], lit: Y(0.56, 0.8, 0.89, 0.497, 0.012, 0.035) },
      tails: { lens: [[[0.5, 0.78], [0.92, 0.74], [0.92, 0.8], [0.52, 0.83]]], lit: Y(0.54, 0.78, 0.9, 0.792, 0.02, 0.03) },
      rearVent: 0.22, exhaust: 'center', exR: 0.06, exY: 0.48,
      rim: { spokes: 5, sw: 0.05, taper: 0.6, color: 0x15171b }, caliper: 0xf4b400,
    },
  },
  {
    id: 'ferrano', name: 'Ferrano Rosso F9', cls: 'Supercar', price: 125000, top: 334, accel: 13.4, grip: 1.27, color: 0xd01a1a,
    engine: { voice: 'v8', pitch: 1.18 },
    body: {
      L: 4.61, W: 1.98, clear: 0.1, wheel: 0.35, axle: [0.18, 0.8], nose: 0.3, noseLen: 0.13, tail: 0.16, fender: [0.17, 0.11], flare: [0.03, 0.06], hoodCrown: 0.01, chin: 0.08,
      top: [[0, 0.88], [0.05, 0.92], [0.28, 0.88], [0.5, 0.75], [0.74, 0.66], [0.92, 0.58], [1, 0.48]],
      cab: { r0: 0.3, r1: 0.42, f1: 0.6, f0: 0.78, h: 1.17, w: 0.65, gw: 0.8, rearGlass: false, fast: 0.3 }, sill: PLASTIC,
      grille: [0.42, 0.16, 0.32],
      lamps: { lens: [[[0.5, 0.52], [0.88, 0.5], [0.9, 0.56], [0.56, 0.58]]], lit: [[[0.56, 0.553], [0.87, 0.533], [0.875, 0.545], [0.57, 0.565]]] },
      roundTails: { xs: [0.52, 0.76], y: 0.74, r: 0.07 }, ducktail: 0.05,
      splitter: true, diffuser: true, intakes: [0.4, 0.55], rearVent: 0.1,
      rim: { spokes: 10, sw: 0.045, color: 0x9da3ad }, caliper: 0xf4b400, exhaust: 'dual', exR: 0.06, exY: 0.3,
    },
  },
  {
    id: 'mclarson', name: 'McLarson Velo 750', cls: 'Supercar', price: 135000, top: 338, accel: 13.8, grip: 1.3, color: 0xff7a1a,
    engine: { voice: 'i6', pitch: 1.35, turbo: true },
    body: {
      L: 4.54, W: 1.93, clear: 0.09, wheel: 0.35, axle: [0.18, 0.8], nose: 0.32, noseLen: 0.13, tail: 0.12, fender: [0.14, 0.1], flare: [0.03, 0.05], hoodCrown: 0, chin: 0.08,
      top: [[0, 0.88], [0.05, 0.91], [0.3, 0.84], [0.52, 0.72], [0.75, 0.64], [0.92, 0.56], [1, 0.46]],
      cab: { r0: 0.2, r1: 0.44, f1: 0.6, f0: 0.79, h: 1.15, w: 0.56, gw: 0.72, fast: 0.9 }, sill: PLASTIC,
      grille: false, intakeF: [0.2, 0.7, 0.16],
      lamps: { lens: [[[0.5, 0.47], [0.86, 0.45], [0.9, 0.58], [0.6, 0.6]]], lit: [[[0.62, 0.54], [0.86, 0.525], [0.87, 0.537], [0.63, 0.552]], [[0.58, 0.49], [0.65, 0.486], [0.66, 0.53], [0.59, 0.534]]] },
      tails: { lens: [[[0.5, 0.74], [0.95, 0.72], [0.95, 0.76], [0.5, 0.78]]], lit: [[[0.52, 0.749], [0.93, 0.729], [0.93, 0.742], [0.52, 0.762]]] },
      wing: { h: 0.06, t: 0.04, chord: 0.3, w: 0.92 }, splitter: true, diffuser: true, intakes: [0.38, 0.52],
      rim: { spokes: 10, sw: 0.04, taper: 0.6, color: 0x2a2d33 }, caliper: 0xff7a1a, exhaust: 'dual', exR: 0.06, exY: 0.42,
    },
  },
  {
    id: 'eclipse', name: 'Eclipse X', cls: 'Hypercar', price: 150000, top: 352, accel: 14.2, grip: 1.32, color: 0x111318,
    engine: { voice: 'i6', pitch: 1.55, turbo: true },
    body: {
      L: 4.7, W: 2.04, clear: 0.08, wheel: 0.36, axle: [0.17, 0.81], nose: 0.34, noseLen: 0.15, tail: 0.1, fender: [0.24, 0.08], flare: [0.03, 0.07], hoodCrown: 0, chin: 0.08,
      top: [[0, 0.86], [0.04, 0.9], [0.25, 0.84], [0.5, 0.66], [0.75, 0.6], [0.92, 0.52], [1, 0.42]],
      cab: { r0: 0.34, r1: 0.46, f1: 0.6, f0: 0.8, h: 1.08, w: 0.6, gw: 0.76, rearGlass: false, fast: 0.3 }, roofCol: GLASS, sill: PLASTIC,
      fin: true, intakes: [0.38, 0.55], intakeF: [0.15, 0.62, 0.18], grille: false, splitter: true, diffuser: true,
      wing: { h: 0.24, t: 0.035, chord: 0.34, w: 0.92, color: 0x111317, light: true },
      drl: [0, 0.9, 0.36], hlx: [0.55, 0.86], hly: [0.3, 0.34],
      tailBar: true, tlx: [0.3, 0.98], tly: [0.79, 0.84], rearVent: 0.22,
      rim: { spokes: 12, sw: 0.035, taper: 0.7, color: 0x1a1c20, cap: 0x3de0ff }, caliper: 0x3de0ff, exhaust: 'center', exR: 0.055, exY: 0.36,
    },
  },
  {
    id: 'aventa', name: 'Lamborini Aventa SVR', cls: 'Hypercar', price: 185000, top: 350, accel: 14.0, grip: 1.3, color: 0xf4b400,
    engine: { voice: 'v8', pitch: 1.5 },
    body: {
      L: 4.94, W: 2.1, clear: 0.09, wheel: 0.37, axle: [0.17, 0.81], nose: 0.36, noseLen: 0.15, tail: 0.08, fender: [0.08, 0.06], flare: [0.02, 0.06], hoodCrown: 0, chin: 0.09, crease: 22, tumble: 0.07, side: 0.42,
      top: [[0, 0.92], [0.04, 0.95], [0.22, 0.9], [0.45, 0.74], [0.7, 0.6], [0.9, 0.5], [1, 0.4]],
      cab: { r0: 0.3, r1: 0.44, f1: 0.58, f0: 0.81, h: 1.14, w: 0.6, gw: 0.76, rearGlass: false, fast: 0.05 }, sill: PLASTIC,
      grille: false, intakeF: [0.3, 0.92, 0.22], splitter: true, diffuser: true, intakes: [0.36, 0.56], skirt: true,
      lamps: { lens: [[[0.54, 0.46], [0.96, 0.42], [0.99, 0.48], [0.6, 0.52]]], lit: Y(0.6, 0.86, 0.96, 0.49, 0.012, 0.04) },
      tails: { lens: [[[0.5, 0.8], [0.98, 0.74], [0.98, 0.82], [0.55, 0.86]]], lit: Y(0.55, 0.84, 0.96, 0.81, 0.02, 0.04) },
      wing: { h: 0.26, t: 0.045, chord: 0.32, w: 0.94, color: 0x111317 },
      rearVent: 0.25, exhaust: 'hex', exSides: 6, exR: 0.085, exY: 0.48,
      rim: { spokes: 5, sw: 0.05, taper: 0.55, color: 0x1a1c20 }, caliper: 0x9fe02a,
    },
  },
  {
    id: 'bugani', name: 'Bugani Chirone', cls: 'Hypercar', price: 260000, top: 418, accel: 15.2, grip: 1.22, color: 0x1f4fbf,
    engine: { voice: 'v8', pitch: 0.95, turbo: true },
    body: {
      L: 4.54, W: 2.04, clear: 0.1, wheel: 0.36, axle: [0.17, 0.81], nose: 0.3, noseLen: 0.13, tail: 0.14, fender: [0.14, 0.1], flare: [0.03, 0.06], hoodCrown: 0.02, chin: 0.08,
      top: [[0, 0.9], [0.04, 0.94], [0.25, 0.92], [0.5, 0.8], [0.72, 0.72], [0.9, 0.64], [1, 0.56]],
      cab: { r0: 0.28, r1: 0.42, f1: 0.6, f0: 0.78, h: 1.21, w: 0.66, gw: 0.8, rearGlass: false, fast: 0.4 }, sill: PLASTIC,
      twoTone: { t: 0.6, color: 0x1a1d24 }, cline: { t: 0.64, rt: 0.11, y: 0.56, ry: 0.2 }, fin: true,
      grille: false, horseshoe: { w: 0.2, y0: 0.2, y1: 0.54 }, intakeF: [0.34, 0.86, 0.17],
      lamps: { lens: [[[0.52, 0.56], [0.84, 0.54], [0.86, 0.62], [0.56, 0.64]]], lit: [0.6, 0.66, 0.72, 0.78].map((x) => [[x - 0.022, 0.572], [x + 0.022, 0.57], [x + 0.022, 0.612], [x - 0.022, 0.614]]) },
      tailBar: true, tlx: [0.3, 0.95], tly: [0.7, 0.76],
      wing: { h: 0.04, t: 0.05, chord: 0.36, w: 0.9, color: 0x15171b },
      splitter: true, diffuser: true, exhaust: 'quadc', exR: 0.045, exY: 0.36,
      rim: { spokes: 10, sw: 0.05, color: SILVER }, caliper: 0x2a6cff,
    },
  },
  {
    id: 'jesca', name: 'Konigsberg Jesca', cls: 'Hypercar', price: 320000, top: 440, accel: 15.6, grip: 1.3, color: 0xff7a1a,
    engine: { voice: 'v8', pitch: 1.3, turbo: true },
    body: {
      L: 4.61, W: 2.03, clear: 0.09, wheel: 0.36, axle: [0.17, 0.81], nose: 0.33, noseLen: 0.14, tail: 0.1, fender: [0.2, 0.09], flare: [0.03, 0.07], hoodCrown: 0, chin: 0.09,
      top: [[0, 0.9], [0.04, 0.93], [0.25, 0.86], [0.5, 0.7], [0.75, 0.62], [0.92, 0.54], [1, 0.44]],
      cab: { r0: 0.3, r1: 0.45, f1: 0.6, f0: 0.79, h: 1.12, w: 0.6, gw: 0.76, rearGlass: false, fast: 0.2 }, roofCol: 0x15171b, sill: PLASTIC,
      fin: true, grille: false, intakeF: [0.2, 0.9, 0.2], intakes: [0.38, 0.56], splitter: true, diffuser: true, skirt: true,
      wing: { h: 0.32, t: 0.035, chord: 0.36, w: 0.95, color: 0x111317, light: true },
      hlx: [0.55, 0.88], hly: [0.36, 0.41], drl: [0.55, 0.88, 0.42], tailBar: true, tlx: [0.3, 0.96], tly: [0.8, 0.85], rearVent: 0.24,
      rim: { spokes: 7, sw: 0.05, taper: 0.55, color: 0x15171b, cap: 0xff7a1a }, caliper: 0xff7a1a, exhaust: 'center', exR: 0.07, exY: 0.5,
    },
  },
];

// ---------------------------------------------------------------- more cars (2026-11-12)
/** A little starburst of light: rays out from (cx, cy), long and short in turn. The Claude Car's lamps. */
const SPARK = (cx, cy, r, n = 8, turn = 0.2) => Array.from({ length: n }, (_, i) => {
  const a = turn + (i / n) * Math.PI * 2, l = r * (i % 2 ? 0.58 : 1), w = r * 0.085, dx = Math.cos(a), dy = Math.sin(a) * 0.62, nx = -dy, ny = dx;
  const x0 = cx + dx * r * 0.14, y0 = cy + dy * r * 0.14, x1 = cx + dx * l, y1 = cy + dy * l;
  return [[x0 + nx * w, y0 + ny * w], [x1 + nx * w * 0.25, y1 + ny * w * 0.25], [x1 - nx * w * 0.25, y1 - ny * w * 0.25], [x0 - nx * w, y0 - ny * w]];
});
const SEDAN_TOP = [[0, 0.86], [0.05, 0.92], [0.22, 0.95], [0.55, 0.94], [0.85, 0.88], [0.96, 0.82], [1, 0.7]];

CARS.push(
  {
    id: 'rx7', name: 'Mazdo RX-Seven', cls: 'Rotary coupe', price: 20000, top: 258, accel: 9.8, grip: 1.25, color: 0xf2c81e,
    engine: { voice: 'i4', pitch: 1.55 },
    body: {
      L: 4.29, W: 1.76, clear: 0.11, wheel: 0.32, axle: [0.19, 0.78], nose: 0.3, noseLen: 0.14, tail: 0.2, tailLen: 0.1, fender: [0.05, 0.05], flare: [0.02, 0.04], hoodCrown: 0.02, chin: 0.06,
      top: [[0, 0.8], [0.05, 0.86], [0.25, 0.86], [0.5, 0.8], [0.75, 0.72], [0.92, 0.62], [1, 0.5]],
      cab: { r0: 0.1, r1: 0.36, f1: 0.52, f0: 0.68, h: 1.23, w: 0.68, gw: 0.8, fast: 1.2 }, sill: PLASTIC,
      wing: { h: 0.14, t: 0.045, chord: 0.22, w: 0.84 }, roundTails: { xs: [0.42, 0.66], y: 0.72, r: 0.06 }, grille: false, intakeF: [0.12, 0.5, 0.13],
      hlx: [0.42, 0.74], hly: [0.52, 0.56], rim: { spokes: 5, sw: 0.07, color: 0xc8ccd4 }, exhaust: 'dual', exR: 0.045,
    },
  },
  {
    id: 'audytt', name: 'Audy TT-RS', cls: 'Sport coupe', price: 27000, top: 280, accel: 10.8, grip: 1.3, color: 0x7c8288,
    engine: { voice: 'i4', pitch: 1.3, turbo: true },
    body: {
      L: 4.19, W: 1.83, clear: 0.12, wheel: 0.33, axle: [0.18, 0.8], nose: 0.24, noseLen: 0.11, tail: 0.2, tailLen: 0.1, fender: [0.04, 0.04], flare: [0.03, 0.04], hoodCrown: 0.02, chin: 0.07,
      top: [[0, 0.84], [0.05, 0.9], [0.3, 0.9], [0.6, 0.88], [0.88, 0.82], [1, 0.68]],
      cab: { r0: 0.08, r1: 0.36, f1: 0.54, f0: 0.7, h: 1.34, w: 0.72, fast: 1.3 }, sill: PLASTIC, skirt: true, splitter: true, diffuser: true,
      grille: [0.4, 0.2, 0.6], wing: { h: 0.16, t: 0.05, chord: 0.24, w: 0.8, color: 0x15171b }, hlx: [0.5, 0.84], hly: [0.62, 0.68], drl: [0.5, 0.84, 0.605],
      tailBar: true, tlx: [0.5, 0.86], tly: [0.72, 0.78], rim: { spokes: 7, sw: 0.05, color: 0x1c1e22 }, caliper: 0xd02020, exhaust: 'dual', exR: 0.07,
    },
  },
  {
    id: 'bmv3', name: 'BMV M-3 Comp', cls: 'Sport sedan', price: 36000, top: 290, accel: 11.2, grip: 1.25, color: 0x0f6b4f,
    engine: { voice: 'i6', pitch: 1.1, turbo: true },
    body: {
      L: 4.79, W: 1.9, clear: 0.12, wheel: 0.345, axle: [0.2, 0.8], nose: 0.2, noseLen: 0.1, tail: 0.14, fender: [0.03, 0.03], flare: [0.035, 0.045], hoodCrown: 0.025, chin: 0.07,
      top: SEDAN_TOP, cab: { r0: 0.16, r1: 0.31, f1: 0.56, f0: 0.72, h: 1.43, w: 0.76, b: 0.45, fast: 0.4 }, pillar: DARK, sill: PLASTIC, skirt: true, splitter: true, diffuser: true,
      grille: [0.28, 0.28, 0.68], grilleBars: 8, intakeF: [0.4, 0.86, 0.2], hlx: [0.42, 0.86], hly: [0.66, 0.71], drl: [0.42, 0.86, 0.645], roofCol: 0x15171b,
      tlx: [0.42, 0.9], tly: [0.74, 0.8], ducktail: 0.03, rim: { spokes: 10, sw: 0.04, taper: 0.6, color: 0x1c1e22 }, caliper: 0xc9a04a, exhaust: 'quad', exR: 0.05,
    },
  },
  {
    id: 'hellkat', name: 'Dodger Hellkat', cls: 'Muscle', price: 38000, top: 306, accel: 11.6, grip: 0.97, color: 0x6a1f9a,
    engine: { voice: 'v8', pitch: 0.8 },
    body: {
      L: 5.02, W: 2.0, clear: 0.13, wheel: 0.355, axle: [0.2, 0.79], nose: 0.07, noseLen: 0.06, tail: 0.06, fender: [0, 0.03], flare: [0.03, 0.05], chin: 0.06, hoodCrown: 0.03,
      top: [[0, 0.9], [0.03, 0.95], [0.25, 0.96], [0.55, 0.94], [0.85, 0.92], [0.97, 0.88], [1, 0.82]],
      cab: { r0: 0.1, r1: 0.3, f1: 0.5, f0: 0.63, h: 1.4, w: 0.74, fast: 0.9 }, sill: PLASTIC, splitter: true,
      scoop: [0.78, 0.68, 0.24], vents: [0.8, 0.42], grille: [0.84, 0.36, 0.66], roundLights: { x: 0.66, y: 0.74, r: 0.085 },
      tailBar: true, tlx: [0.3, 0.92], tly: [0.76, 0.86], ducktail: 0.035,
      rim: { spokes: 5, sw: 0.1, color: 0x2a2d33 }, caliper: 0xd02020, exhaust: 'dual', exR: 0.06,
    },
  },
  {
    id: 'ghibla', name: 'Masarotti Ghibla Trofeo', cls: 'Sport sedan', price: 40000, top: 300, accel: 11.0, grip: 1.16, color: 0x8f1d2c,
    engine: { voice: 'v8', pitch: 1.12, turbo: true },
    body: {
      L: 4.97, W: 1.95, clear: 0.13, wheel: 0.35, axle: [0.19, 0.8], nose: 0.26, noseLen: 0.12, tail: 0.16, fender: [0.05, 0.04], flare: [0.02, 0.04], hoodCrown: 0.03, chin: 0.07,
      top: [[0, 0.86], [0.05, 0.92], [0.22, 0.94], [0.55, 0.92], [0.82, 0.86], [0.95, 0.78], [1, 0.64]],
      cab: { r0: 0.14, r1: 0.32, f1: 0.55, f0: 0.71, h: 1.45, w: 0.74, b: 0.44, fast: 0.9 }, pillar: DARK, sill: PLASTIC,
      grille: [0.32, 0.2, 0.54], grilleBars: 9, intakeF: [0.44, 0.84, 0.16], hlx: [0.46, 0.86], hly: [0.6, 0.66],
      tlx: [0.4, 0.9], tly: [0.74, 0.8], diffuser: true, rim: { spokes: 7, sw: 0.055, color: 0x2a2d33 }, caliper: 0xd02020, exhaust: 'quad', exR: 0.048,
    },
  },
  {
    id: 'bmv4', name: 'BMV M-4 CSL', cls: 'Sport coupe', price: 46000, top: 304, accel: 11.9, grip: 1.3, color: 0xb9bdc4,
    engine: { voice: 'i6', pitch: 1.18, turbo: true },
    body: {
      L: 4.79, W: 1.92, clear: 0.11, wheel: 0.35, axle: [0.2, 0.8], nose: 0.2, noseLen: 0.1, tail: 0.16, fender: [0.03, 0.04], flare: [0.035, 0.05], hoodCrown: 0.025, chin: 0.07,
      top: [[0, 0.86], [0.05, 0.92], [0.22, 0.93], [0.55, 0.92], [0.85, 0.87], [0.96, 0.81], [1, 0.69]],
      cab: { r0: 0.1, r1: 0.33, f1: 0.54, f0: 0.71, h: 1.39, w: 0.74, fast: 1.1 }, sill: PLASTIC, skirt: true, splitter: 0xd02020, diffuser: true, roofCol: 0x15171b,
      stripe: 0xd02020, grille: [0.28, 0.28, 0.68], grilleBars: 8, intakeF: [0.4, 0.88, 0.2], hlx: [0.42, 0.86], hly: [0.66, 0.71], drl: [0.42, 0.86, 0.645],
      tlx: [0.42, 0.9], tly: [0.74, 0.8], ducktail: 0.06, rim: { spokes: 10, sw: 0.035, taper: 0.6, color: 0x1c1e22 }, caliper: 0xd02020, exhaust: 'quad', exR: 0.05,
    },
  },
  {
    id: 'granturi', name: 'Masarotti GranTurisma', cls: 'Grand tourer', price: 48000, top: 302, accel: 11.2, grip: 1.17, color: 0x1c2f6b,
    engine: { voice: 'v8', pitch: 1.2 },
    body: {
      L: 4.96, W: 1.96, clear: 0.12, wheel: 0.355, axle: [0.18, 0.8], nose: 0.3, noseLen: 0.13, tail: 0.2, tailLen: 0.1, fender: [0.07, 0.06], flare: [0.02, 0.05], hoodCrown: 0.025, chin: 0.07,
      top: [[0, 0.82], [0.04, 0.88], [0.2, 0.9], [0.45, 0.86], [0.75, 0.8], [0.93, 0.72], [1, 0.58]],
      cab: { r0: 0.08, r1: 0.3, f1: 0.47, f0: 0.63, h: 1.35, w: 0.7, fast: 1.2 }, sill: PLASTIC,
      grille: [0.34, 0.17, 0.48], grilleBars: 9, intakeF: [0.46, 0.86, 0.15], vents: [0.7, 0.36],
      lamps: { lens: [[[0.5, 0.56], [0.84, 0.6], [0.88, 0.68], [0.56, 0.66]]], lit: [[[0.56, 0.605], [0.83, 0.635], [0.835, 0.65], [0.57, 0.62]]] },
      roundTails: { xs: [0.52, 0.76], y: 0.74, r: 0.062 }, diffuser: true, rim: { spokes: 5, sw: 0.06, taper: 0.6, color: 0x9da3ad }, caliper: 0x2a6cff, exhaust: 'quad', exR: 0.05,
    },
  },
  {
    id: 'nsx', name: 'Hondo NS-X', cls: 'Mid-engine', price: 50000, top: 296, accel: 11.4, grip: 1.3, color: 0xd01a1a,
    engine: { voice: 'i6', pitch: 1.32 },
    body: {
      L: 4.43, W: 1.81, clear: 0.11, wheel: 0.325, axle: [0.19, 0.78], nose: 0.3, noseLen: 0.14, tail: 0.08, fender: [0.06, 0.05], flare: [0.02, 0.04], hoodCrown: 0, chin: 0.07,
      top: [[0, 0.84], [0.04, 0.88], [0.28, 0.86], [0.5, 0.76], [0.74, 0.66], [0.92, 0.56], [1, 0.46]],
      cab: { r0: 0.24, r1: 0.4, f1: 0.55, f0: 0.72, h: 1.17, w: 0.66, gw: 0.8, fast: 0.6 }, roofCol: 0x15171b, sill: PLASTIC, grille: false, intakeF: [0.2, 0.7, 0.12],
      intakes: [0.4, 0.52], wing: { h: 0.1, t: 0.04, chord: 0.22, w: 0.98 }, hlx: [0.46, 0.8], hly: [0.5, 0.53],
      tailBar: true, tlx: [0.3, 0.96], tly: [0.76, 0.82], rim: { spokes: 7, sw: 0.055, color: 0xc8ccd4 }, exhaust: 'dual', exR: 0.045,
    },
  },
  {
    id: 'e63', name: 'Mersedes E-63 S', cls: 'Super sedan', price: 52000, top: 305, accel: 12.2, grip: 1.2, color: 0x2a2d33,
    engine: { voice: 'v8', pitch: 0.95, turbo: true },
    body: {
      L: 4.99, W: 1.91, clear: 0.13, wheel: 0.35, axle: [0.19, 0.8], nose: 0.2, noseLen: 0.1, tail: 0.15, fender: [0.02, 0.02], flare: [0.03, 0.04], hoodCrown: 0.035, chin: 0.07,
      top: SEDAN_TOP, cab: { r0: 0.15, r1: 0.31, f1: 0.56, f0: 0.72, h: 1.46, w: 0.76, b: 0.45, fast: 0.5 }, pillar: DARK, sill: PLASTIC, splitter: true, diffuser: true,
      grille: [0.44, 0.3, 0.6], grilleBars: 13, intakeF: [0.5, 0.88, 0.2], hlx: [0.5, 0.88], hly: [0.62, 0.7], tlx: [0.36, 0.9], tly: [0.74, 0.79],
      rim: { spokes: 10, sw: 0.04, color: 0x1c1e22 }, caliper: 0xd02020, exhaust: 'quad', exR: 0.052,
    },
  },
  {
    id: 'rs6', name: 'Audy RS-6 Avanti', cls: 'Super wagon', price: 54000, top: 305, accel: 12.4, grip: 1.26, color: 0x5a6068,
    engine: { voice: 'v8', pitch: 1.05, turbo: true },
    body: {
      L: 5.0, W: 1.95, clear: 0.13, wheel: 0.36, axle: [0.2, 0.8], nose: 0.2, noseLen: 0.1, tail: 0.1, fender: [0.03, 0.03], flare: [0.045, 0.055], hoodCrown: 0.03, chin: 0.07,
      top: [[0, 0.9], [0.04, 0.96], [0.3, 0.96], [0.6, 0.94], [0.85, 0.88], [0.96, 0.82], [1, 0.7]],
      cab: { r0: 0.02, r1: 0.1, f1: 0.56, f0: 0.72, h: 1.46, w: 0.76, b: 0.44, fast: 0.5 }, pillar: DARK, sill: PLASTIC, skirt: true, splitter: true, diffuser: true, roofSpoiler: true,
      grille: [0.44, 0.22, 0.64], intakeF: [0.5, 0.9, 0.24], hlx: [0.5, 0.88], hly: [0.66, 0.72], drl: [0.5, 0.88, 0.645], tailBar: true, tlx: [0.4, 0.92], tly: [0.84, 0.9],
      rim: { spokes: 5, sw: 0.05, taper: 0.5, color: 0x1c1e22 }, caliper: 0xd02020, exhaust: 'dual', exR: 0.075,
    },
  },
  {
    id: 'levanta', name: 'Masarotti Levanta Trofeo', cls: 'Super SUV', price: 56000, top: 292, accel: 11.4, grip: 1.08, brake: 20, color: 0x20305a,
    engine: { voice: 'v8', pitch: 1.0, turbo: true },
    body: {
      L: 5.02, W: 1.98, clear: 0.21, wheel: 0.39, axle: [0.19, 0.8], nose: 0.26, noseLen: 0.12, tail: 0.14, fender: [0.05, 0.04], flare: [0.03, 0.04], hoodCrown: 0.03, chin: 0.06,
      top: [[0, 1.02], [0.05, 1.08], [0.25, 1.1], [0.55, 1.08], [0.82, 1.02], [0.95, 0.94], [1, 0.8]],
      cab: { r0: 0.04, r1: 0.2, f1: 0.54, f0: 0.7, h: 1.68, w: 0.74, b: 0.42, fast: 0.9 }, pillar: DARK, sill: PLASTIC, roofSpoiler: true,
      grille: [0.34, 0.32, 0.72], grilleBars: 9, intakeF: [0.46, 0.86, 0.26], hlx: [0.48, 0.86], hly: [0.76, 0.82], tlx: [0.4, 0.92], tly: [0.92, 0.98],
      rim: { spokes: 5, sw: 0.07, color: 0x2a2d33 }, caliper: 0xd02020, exhaust: 'quad', exR: 0.05,
    },
  },
  {
    id: 'caymon', name: 'Porsha Caymon GT-4', cls: 'Mid-engine', price: 58000, top: 304, accel: 11.8, grip: 1.36, color: 0xf2c81e,
    engine: { voice: 'i6', pitch: 1.45 },
    body: {
      ...PORSHA, L: 4.46, W: 1.82, clear: 0.1, axle: [0.18, 0.79], fender: [0.1, 0.07], flare: [0.02, 0.05],
      top: [[0, 0.8], [0.05, 0.86], [0.24, 0.86], [0.48, 0.78], [0.72, 0.7], [0.9, 0.62], [1, 0.5]],
      cab: { r0: 0.16, r1: 0.42, f1: 0.57, f0: 0.72, h: 1.27, w: 0.7, gw: 0.82, fast: 1.1 }, pillar: DARK, sill: PLASTIC, intakes: [0.36, 0.46], splitter: true, diffuser: true, ducktail: 0,
      wing: { h: 0.24, t: 0.045, chord: 0.3, w: 0.88, color: 0x15171b }, rim: { spokes: 10, sw: 0.04, color: 0x1c1e22 }, caliper: 0xd02020, exhaust: 'dual', exR: 0.05,
    },
  },
  {
    id: 'quattro', name: 'Masarotti Quattroporta', cls: 'Luxury sedan', price: 62000, top: 310, accel: 11.6, grip: 1.12, color: 0x1a1d24,
    engine: { voice: 'v8', pitch: 1.08, turbo: true },
    body: {
      L: 5.26, W: 1.95, clear: 0.13, wheel: 0.355, axle: [0.19, 0.81], nose: 0.26, noseLen: 0.12, tail: 0.16, fender: [0.04, 0.03], flare: [0.02, 0.03], hoodCrown: 0.035, chin: 0.07,
      top: [[0, 0.88], [0.05, 0.94], [0.22, 0.96], [0.55, 0.94], [0.82, 0.88], [0.95, 0.8], [1, 0.66]],
      cab: { r0: 0.14, r1: 0.3, f1: 0.56, f0: 0.71, h: 1.48, w: 0.74, b: 0.46, fast: 0.7 }, pillar: 0xc8ccd4, sill: PLASTIC,
      grille: [0.34, 0.2, 0.58], grilleBars: 11, intakeF: [0.46, 0.84, 0.16], hlx: [0.46, 0.86], hly: [0.64, 0.69], drl: [0.46, 0.86, 0.625],
      tlx: [0.36, 0.9], tly: [0.76, 0.81], rim: { spokes: 10, sw: 0.045, color: 0xc8ccd4 }, caliper: 0x2a6cff, exhaust: 'quad', exR: 0.048,
    },
  },
  {
    id: 'gwagen', name: 'Mersedes G-63 Wagen', cls: 'Off-roader', price: 66000, top: 240, accel: 11.2, grip: 0.92, brake: 19, color: 0x15171b,
    engine: { voice: 'v8', pitch: 0.82, turbo: true },
    body: {
      L: 4.87, W: 1.98, clear: 0.25, wheel: 0.41, arch: 0.07, axle: [0.2, 0.8], nose: 0.05, noseLen: 0.04, tail: 0.03, tailLen: 0.03, flare: [0.05, 0.05], hoodCrown: 0.01, chin: 0.04, lift: 0.05, tumble: 0.01, crown: 0.01,
      top: [[0, 1.2], [0.03, 1.22], [0.66, 1.22], [0.7, 1.2], [0.97, 1.18], [1, 1.14]],
      cab: { r0: 0.005, r1: 0.03, f1: 0.6, f0: 0.67, h: 1.96, w: 0.9, gw: 0.92, b: 0.36 }, pillar: 0x15171b, sill: PLASTIC, skirt: 0xc8ccd4,
      grille: [0.42, 0.78, 1.06], grilleBars: 5, roundLights: { x: 0.74, y: 0.98, r: 0.1 }, intakeF: [0.3, 0.8, 0.3],
      tlx: [0.78, 0.92], tly: [0.6, 0.74], rim: { spokes: 5, sw: 0.09, taper: 0.4, color: 0x1c1e22 }, caliper: 0xd02020, exhaust: 'dual', exR: 0.05,
    },
  },
  {
    id: 'bmv1', name: 'BMV M-1 Procar', cls: 'Classic wedge', price: 74000, top: 310, accel: 12.2, grip: 1.3, color: 0xf4f6f8,
    engine: { voice: 'i6', pitch: 1.28 },
    body: {
      L: 4.36, W: 1.86, clear: 0.1, wheel: 0.33, axle: [0.19, 0.79], nose: 0.12, noseLen: 0.08, tail: 0.06, fender: [0.05, 0.04], flare: [0.05, 0.07], hoodCrown: 0, chin: 0.08, crease: 22, tumble: 0.05,
      top: [[0, 0.86], [0.04, 0.9], [0.3, 0.88], [0.5, 0.74], [0.75, 0.62], [0.92, 0.5], [1, 0.42]],
      cab: { r0: 0.26, r1: 0.42, f1: 0.55, f0: 0.74, h: 1.14, w: 0.66, gw: 0.8, rearGlass: false, fast: 0.15 }, sill: PLASTIC, splitter: true,
      stripe: 0x2b5fb3, grille: [0.16, 0.34, 0.42], grilleBars: 4, hlx: [0.5, 0.84], hly: [0.34, 0.38], intakes: [0.42, 0.52],
      wing: { h: 0.22, t: 0.04, chord: 0.3, w: 0.96 }, tlx: [0.4, 0.92], tly: [0.74, 0.82], rearVent: 0.16,
      rim: { spokes: 5, sw: 0.11, color: 0xf4f6f8 }, exhaust: 'dual', exR: 0.05,
    },
  },
  {
    id: 'tycan', name: 'Porsha Tycan Turbo', cls: 'Electric', price: 92000, top: 270, accel: 16.2, grip: 1.26, brake: 27, color: 0x9fd4ff,
    engine: { voice: 'ev', pitch: 1.15 },
    body: {
      L: 4.96, W: 1.97, clear: 0.12, wheel: 0.355, axle: [0.18, 0.8], nose: 0.3, noseLen: 0.13, tail: 0.22, tailLen: 0.1, fender: [0.1, 0.07], flare: [0.02, 0.05], hoodCrown: 0.01, chin: 0.06,
      top: [[0, 0.82], [0.05, 0.9], [0.22, 0.9], [0.5, 0.86], [0.75, 0.78], [0.92, 0.7], [1, 0.56]],
      cab: { r0: 0.1, r1: 0.3, f1: 0.55, f0: 0.72, h: 1.38, w: 0.72, b: 0.45, fast: 1.3 }, pillar: DARK, sill: PLASTIC, roofCol: GLASS, grille: false, intakeF: [0.3, 0.8, 0.12],
      lamps: { lens: [[[0.52, 0.6], [0.86, 0.6], [0.88, 0.7], [0.54, 0.7]]], lit: [0.6, 0.67, 0.74, 0.81].map((x) => [[x - 0.02, 0.672], [x + 0.02, 0.672], [x + 0.02, 0.684], [x - 0.02, 0.684]]) },
      tailBar: true, tlx: [0.5, 0.94], tly: [0.74, 0.79], diffuser: true, rim: { spokes: 5, sw: 0.11, color: 0xc8ccd4, size: 0.74 }, caliper: 0x9fe02a, exhaust: 'none',
    },
  },
  {
    id: 'amggt', name: 'Mersedes AMX GT Black', cls: 'Supercar', price: 100000, top: 325, accel: 13.0, grip: 1.32, color: 0xe85d0c,
    engine: { voice: 'v8', pitch: 1.04, turbo: true },
    body: {
      L: 4.67, W: 2.0, clear: 0.1, wheel: 0.355, axle: [0.17, 0.82], nose: 0.24, noseLen: 0.11, tail: 0.2, tailLen: 0.1, fender: [0.07, 0.07], flare: [0.03, 0.06], hoodCrown: 0.03, chin: 0.08,
      top: [[0, 0.82], [0.04, 0.88], [0.18, 0.9], [0.4, 0.86], [0.7, 0.82], [0.93, 0.76], [1, 0.62]],
      cab: { r0: 0.06, r1: 0.25, f1: 0.4, f0: 0.56, h: 1.28, w: 0.68, gw: 0.8, fast: 1.5 }, sill: PLASTIC, skirt: true, splitter: true, diffuser: true, roofCol: 0x15171b,
      grille: [0.44, 0.2, 0.5], grilleBars: 13, vents: [0.74, 0.34], hlx: [0.56, 0.88], hly: [0.62, 0.7],
      wing: { h: 0.36, t: 0.04, chord: 0.38, w: 0.96, color: 0x15171b }, tailBar: true, tlx: [0.46, 0.92], tly: [0.72, 0.77],
      rim: { spokes: 10, sw: 0.04, taper: 0.6, color: 0x1c1e22 }, caliper: 0xc9a04a, exhaust: 'quad', exR: 0.052,
    },
  },
  {
    id: 'lfa', name: 'Lexo LF-A', cls: 'Supercar', price: 112000, top: 326, accel: 13.0, grip: 1.3, color: 0xf4f6f8,
    engine: { voice: 'v8', pitch: 1.72 },
    body: {
      L: 4.5, W: 1.9, clear: 0.1, wheel: 0.35, axle: [0.18, 0.8], nose: 0.3, noseLen: 0.13, tail: 0.12, fender: [0.08, 0.07], flare: [0.03, 0.06], hoodCrown: 0.02, chin: 0.08, crease: 26,
      top: [[0, 0.88], [0.04, 0.92], [0.22, 0.9], [0.45, 0.82], [0.72, 0.74], [0.92, 0.64], [1, 0.5]],
      cab: { r0: 0.1, r1: 0.34, f1: 0.49, f0: 0.66, h: 1.22, w: 0.66, gw: 0.8, fast: 1.2 }, sill: PLASTIC, splitter: true, diffuser: true, grille: [0.3, 0.14, 0.3], intakeF: [0.44, 0.88, 0.2],
      intakes: [0.3, 0.4], hlx: [0.5, 0.86], hly: [0.56, 0.62], tlx: [0.56, 0.92], tly: [0.76, 0.84], rearVent: 0.2, wing: { h: 0.05, t: 0.05, chord: 0.24, w: 0.7 },
      rim: { spokes: 10, sw: 0.04, color: 0x2a2d33 }, caliper: 0xd02020, exhaust: 'quadc', exR: 0.05, exY: 0.42,
    },
  },
  {
    id: 'fordgt', name: 'Fordo GT', cls: 'Supercar', price: 142000, top: 347, accel: 13.9, grip: 1.33, color: 0x1f4fbf,
    engine: { voice: 'i6', pitch: 1.2, turbo: true },
    body: {
      L: 4.76, W: 2.0, clear: 0.09, wheel: 0.36, axle: [0.17, 0.8], nose: 0.34, noseLen: 0.15, tail: 0.1, fender: [0.2, 0.12], flare: [0.04, 0.08], hoodCrown: 0, chin: 0.08,
      top: [[0, 0.82], [0.04, 0.86], [0.26, 0.8], [0.5, 0.66], [0.75, 0.6], [0.92, 0.52], [1, 0.44]],
      cab: { r0: 0.26, r1: 0.44, f1: 0.58, f0: 0.77, h: 1.11, w: 0.52, gw: 0.7, rearGlass: false, fast: 0.6 }, sill: PLASTIC, stripe: 0xf4f6f8, grille: false, intakeF: [0.2, 0.84, 0.2],
      intakes: [0.36, 0.56], splitter: true, diffuser: true, hlx: [0.6, 0.88], hly: [0.46, 0.56], roundTails: { xs: [0.72], y: 0.7, r: 0.105 },
      wing: { h: 0.1, t: 0.04, chord: 0.3, w: 0.9 }, rim: { spokes: 10, sw: 0.04, taper: 0.6, color: 0x2a2d33 }, caliper: 0xd02020, exhaust: 'center', exR: 0.065, exY: 0.5,
    },
  },
  {
    id: 'huayro', name: 'Pagano Huayro', cls: 'Hypercar', price: 205000, top: 383, accel: 14.6, grip: 1.33, color: 0x9c6b3c,
    engine: { voice: 'v8', pitch: 1.22, turbo: true },
    body: {
      L: 4.6, W: 2.04, clear: 0.09, wheel: 0.36, axle: [0.17, 0.81], nose: 0.34, noseLen: 0.15, tail: 0.18, tailLen: 0.1, fender: [0.18, 0.1], flare: [0.03, 0.07], hoodCrown: 0.01, chin: 0.08,
      top: [[0, 0.88], [0.04, 0.92], [0.25, 0.86], [0.5, 0.7], [0.75, 0.62], [0.92, 0.54], [1, 0.44]],
      cab: { r0: 0.28, r1: 0.44, f1: 0.59, f0: 0.79, h: 1.17, w: 0.6, gw: 0.76, rearGlass: false, fast: 0.6 }, roofCol: GLASS, sill: 0x15171b, twoTone: { t: 0.86, color: 0x15171b },
      grille: [0.3, 0.14, 0.3], grilleBars: 0, intakeF: [0.4, 0.88, 0.2], intakes: [0.38, 0.54], splitter: true, diffuser: true, fin: true,
      lamps: { lens: [[[0.56, 0.5], [0.86, 0.48], [0.88, 0.58], [0.6, 0.6]]], lit: [[0.66, 0.54], [0.8, 0.53]].map(([x, y]) => [[x - 0.035, y - 0.022], [x + 0.035, y - 0.022], [x + 0.035, y + 0.022], [x - 0.035, y + 0.022]]) },
      roundTails: { xs: [0.6, 0.76, 0.92], y: 0.74, r: 0.045 }, rearVent: 0.2,
      rim: { spokes: 7, sw: 0.045, taper: 0.55, color: 0xc8ccd4 }, caliper: 0xc9a04a, exhaust: 'quadc', exR: 0.048, exY: 0.56,
    },
  },
  {
    id: 'p919', name: 'Porsha 919 Spyder', cls: 'Hybrid hypercar', price: 215000, top: 372, accel: 15.6, grip: 1.36, color: 0xc8ccd4,
    engine: { voice: 'v8', pitch: 1.5, turbo: true },
    body: {
      L: 4.64, W: 1.94, clear: 0.09, wheel: 0.36, axle: [0.17, 0.8], nose: 0.32, noseLen: 0.14, tail: 0.18, tailLen: 0.1, fender: [0.16, 0.1], flare: [0.03, 0.07], hoodCrown: 0.005, chin: 0.08,
      top: [[0, 0.86], [0.04, 0.9], [0.26, 0.86], [0.5, 0.72], [0.74, 0.64], [0.92, 0.56], [1, 0.46]],
      cab: { r0: 0.3, r1: 0.44, f1: 0.58, f0: 0.76, h: 1.17, w: 0.62, gw: 0.78, rearGlass: false, fast: 0.4 }, roofCol: 0x15171b, sill: PLASTIC,
      roundLights: { x: 0.66, y: 0.6, r: 0.1 }, hlx: [0.56, 0.76], hly: [0.54, 0.66], grille: false, intakeF: [0.2, 0.84, 0.16], intakes: [0.38, 0.54], blade: 0x9fe02a,
      splitter: true, diffuser: true, tailBar: true, tlx: [0.5, 0.94], tly: [0.76, 0.81], rearVent: 0.2, wing: { h: 0.08, t: 0.045, chord: 0.3, w: 0.92 },
      rim: { spokes: 5, sw: 0.045, taper: 0.5, color: 0x2a2d33, cap: 0x9fe02a }, caliper: 0x9fe02a, exhaust: 'center', exR: 0.055, exY: 0.74,
    },
  },
  {
    id: 'mc12', name: 'Masarotti MC-12 Corsa', cls: 'Hypercar', price: 225000, top: 380, accel: 14.8, grip: 1.36, color: 0x1f4fbf,
    engine: { voice: 'v8', pitch: 1.38 },
    body: {
      L: 5.14, W: 2.1, clear: 0.09, wheel: 0.365, axle: [0.2, 0.8], nose: 0.32, noseLen: 0.14, tail: 0.08, fender: [0.2, 0.1], flare: [0.03, 0.06], hoodCrown: 0, chin: 0.09,
      top: [[0, 0.9], [0.04, 0.93], [0.3, 0.88], [0.52, 0.72], [0.75, 0.64], [0.92, 0.56], [1, 0.44]],
      cab: { r0: 0.34, r1: 0.47, f1: 0.61, f0: 0.79, h: 1.2, w: 0.6, gw: 0.76, rearGlass: false, fast: 0.3 }, sill: PLASTIC, twoTone: { t: 0.5, color: 0xf4f6f8 }, fin: true,
      grille: [0.3, 0.15, 0.38], grilleBars: 9, intakeF: [0.44, 0.9, 0.18], intakes: [0.4, 0.56], splitter: true, diffuser: true, skirt: true, vents: [0.84, 0.4],
      hlx: [0.6, 0.86], hly: [0.48, 0.58], tlx: [0.56, 0.94], tly: [0.74, 0.84], rearVent: 0.26,
      wing: { h: 0.3, t: 0.035, chord: 0.4, w: 0.98, color: 0x1f4fbf }, rim: { spokes: 7, sw: 0.05, color: 0xc8ccd4 }, caliper: 0xd02020, exhaust: 'dual', exR: 0.06, exY: 0.34,
    },
  },
  // Claude's own design: the quickest and best-looking car in the game. Terracotta paint over a cream tub, a glass
  // canopy, a spine fin, starburst lights front and back and twelve-ray wheels.
  {
    id: 'claude', name: 'Claude Car', cls: 'One of one', price: 500000, top: 470, accel: 17.4, grip: 1.44, brake: 37, color: 0xd97757,
    engine: { voice: 'v8', pitch: 1.62, turbo: true },
    body: {
      L: 4.74, W: 2.06, clear: 0.085, wheel: 0.365, axle: [0.175, 0.81], nose: 0.36, noseLen: 0.16, tail: 0.16, tailLen: 0.09, fender: [0.21, 0.1], flare: [0.035, 0.075], hoodCrown: 0.005, chin: 0.09, tumble: 0.05, step: 0.07,
      top: [[0, 0.9], [0.04, 0.93], [0.24, 0.87], [0.5, 0.68], [0.74, 0.6], [0.92, 0.51], [1, 0.41]],
      cab: { r0: 0.3, r1: 0.45, f1: 0.6, f0: 0.8, h: 1.1, w: 0.58, gw: 0.76, rearGlass: false, fast: 0.25 }, roofCol: GLASS, sill: 0xf0e6d6, skirt: 0xf0e6d6,
      fin: true, intakes: [0.38, 0.56], blade: 0xf0e6d6, intakeF: [0.16, 0.66, 0.19], grille: false, splitter: 0xf0e6d6, diffuser: true,
      lamps: { lens: [[[0.5, 0.4], [0.94, 0.38], [0.96, 0.5], [0.54, 0.52]]], lit: SPARK(0.74, 0.452, 0.085) },
      tails: { lens: [[[0.5, 0.76], [0.97, 0.73], [0.97, 0.85], [0.53, 0.87]]], lit: SPARK(0.76, 0.8, 0.08) },
      drl: [0, 0.5, 0.375], tailBar: true, tlx: [0.3, 0.97], tly: [0.8, 0.87], rearVent: 0.26, cline: { t: 0.63, rt: 0.1, y: 0.5, ry: 0.19 },
      wing: { h: 0.22, t: 0.035, chord: 0.36, w: 0.96, color: 0x15171b, light: true },
      rim: { spokes: 12, sw: 0.028, taper: 0.8, color: 0xf0e6d6, cap: 0xd97757 }, caliper: 0xd97757, exhaust: 'quadc', exR: 0.042, exY: 0.52,
    },
  },
);
CARS.sort((a, b) => a.price - b.price);

export const PAINT_SWATCHES = [0xf2efe6, 0x111318, 0x8a929e, 0xe03a3a, 0xff7a1a, 0xf4b400, 0xc6ff3d, 0x1f9d55, 0x1f6f5c, 0x3de0ff, 0x2b5fb3, 0x7d3cff, 0xd97757, 0xf0e6d6];

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
