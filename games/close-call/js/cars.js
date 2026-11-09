// The garage. Names and looks are original. Prices are in cash ($); 10 banked points = $1.
//   top: top speed km/h · accel: m/s² off the line · grip: steering response
//   body: the model's shape (see models.js bodyShape for what each field means). L and W are also the hitbox.
const DARK = 0x111317, PLASTIC = 0x1c1f25, GLASS = 0x1a2433;

export const CARS = [
  {
    id: 'pocket', name: 'Pocket', cls: 'Kei', price: 0, top: 178, accel: 6.2, grip: 1.12, color: 0xf2efe6,
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
    id: 'vanta', name: 'Vanta GT', cls: 'Grand tourer', price: 55000, top: 296, accel: 11.4, grip: 1.15, color: 0x1f6f5c,
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
    id: 'spectre', name: 'Spectre', cls: 'Supercar', price: 90000, top: 322, accel: 12.8, grip: 1.26, color: 0x7d3cff,
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
    id: 'eclipse', name: 'Eclipse X', cls: 'Hypercar', price: 150000, top: 352, accel: 14.2, grip: 1.32, color: 0x111318,
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
];

export const PAINT_SWATCHES = [0xf2efe6, 0x111318, 0x8a929e, 0xe03a3a, 0xff7a1a, 0xf4b400, 0xc6ff3d, 0x1f9d55, 0x1f6f5c, 0x3de0ff, 0x2b5fb3, 0x7d3cff];

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
