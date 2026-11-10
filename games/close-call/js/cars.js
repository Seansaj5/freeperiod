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
    engine: { voice: 'i4', pitch: 1.08 },
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
    engine: { voice: 'i6', pitch: 1.0 },
    body: {
      L: 4.4, W: 1.78, clear: 0.11, wheel: 0.32, axle: [0.18, 0.8], nose: 0.24, noseLen: 0.12, tail: 0.14, fender: [0.025, 0.03], flare: [0.02, 0.03],
      top: [[0, 0.8], [0.04, 0.86], [0.3, 0.86], [0.6, 0.84], [0.9, 0.76], [1, 0.62]],
      cab: { r0: 0.12, r1: 0.3, f1: 0.52, f0: 0.67, h: 1.27, w: 0.74, fast: 0.4 }, sill: PLASTIC, skirt: true, splitter: true,
      wing: { h: 0.2, t: 0.045, chord: 0.28 }, hly: [0.5, 0.55], hlx: [0.4, 0.8], tlx: [0.36, 0.82], tly: [0.66, 0.74],
      rim: { spokes: 6, sw: 0.06, color: 0xb88a3a }, caliper: 0xd0302a, exhaust: 'single', exR: 0.06,
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
    id: 'masarotti', name: 'Masarotti Tridente MC', cls: 'Supercar', price: 70000, top: 318, accel: 12.0, grip: 1.2, color: 0x2a4d8f,
    engine: { voice: 'v8', pitch: 1.12 },
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
    engine: { voice: 'i6', pitch: 1.35 },
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
    engine: { voice: 'i6', pitch: 1.55 },
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
    engine: { voice: 'v8', pitch: 0.95 },
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
];

export const PAINT_SWATCHES = [0xf2efe6, 0x111318, 0x8a929e, 0xe03a3a, 0xff7a1a, 0xf4b400, 0xc6ff3d, 0x1f9d55, 0x1f6f5c, 0x3de0ff, 0x2b5fb3, 0x7d3cff];

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
