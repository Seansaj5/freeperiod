// The garage. Names and looks are original. Prices are in cash ($); 10 banked points = $1.
//   top: top speed km/h · accel: m/s² off the line · grip: steering response · body: model shape
export const CARS = [
  {
    id: 'pocket', name: 'Pocket', cls: 'Kei', price: 0, top: 178, accel: 6.2, grip: 1.12, color: 0xf2efe6,
    body: { L: 3.5, W: 1.5, H: 0.62, clear: 0.22, cabF: 0.86, cabR: -1.45, cabH: 0.78, slope: 0.18, wheel: 0.29, roofIn: 0.08, nose: 0.06 },
  },
  {
    id: 'commuter', name: 'Commuter S', cls: 'Sedan', price: 3000, top: 205, accel: 7.4, grip: 1.06, color: 0x2b5fb3,
    body: { L: 4.6, W: 1.8, H: 0.66, clear: 0.2, cabF: 0.75, cabR: -1.55, cabH: 0.62, slope: 0.42, wheel: 0.31, roofIn: 0.13, nose: 0.14 },
  },
  {
    id: 'hatchr', name: 'Hatch R', cls: 'Hot hatch', price: 8000, top: 228, accel: 8.6, grip: 1.18, color: 0xe03a3a,
    body: { L: 4.15, W: 1.8, H: 0.66, clear: 0.17, cabF: 0.62, cabR: -1.85, cabH: 0.64, slope: 0.36, wheel: 0.33, roofIn: 0.12, nose: 0.12, wing: 0.05 },
  },
  {
    id: 'ronin', name: 'Ronin', cls: 'Sport coupe', price: 16000, top: 252, accel: 9.4, grip: 1.2, color: 0xf2f2f2,
    body: { L: 4.4, W: 1.78, H: 0.6, clear: 0.14, cabF: 0.45, cabR: -1.5, cabH: 0.56, slope: 0.5, wheel: 0.32, roofIn: 0.14, nose: 0.18, wing: 0.18 },
  },
  {
    id: 'thunder', name: 'Thunder 8', cls: 'Muscle', price: 30000, top: 272, accel: 10.6, grip: 0.98, color: 0xf4b400,
    body: { L: 4.85, W: 1.95, H: 0.72, clear: 0.15, cabF: 0.2, cabR: -1.75, cabH: 0.55, slope: 0.55, wheel: 0.35, roofIn: 0.16, nose: 0.1, wing: 0.08 },
  },
  {
    id: 'vanta', name: 'Vanta GT', cls: 'Grand tourer', price: 55000, top: 296, accel: 11.4, grip: 1.15, color: 0x1f6f5c,
    body: { L: 4.75, W: 1.95, H: 0.6, clear: 0.12, cabF: 0.1, cabR: -1.6, cabH: 0.52, slope: 0.62, wheel: 0.35, roofIn: 0.18, nose: 0.2 },
  },
  {
    id: 'spectre', name: 'Spectre', cls: 'Supercar', price: 90000, top: 322, accel: 12.8, grip: 1.26, color: 0x7d3cff,
    body: { L: 4.55, W: 2.0, H: 0.5, clear: 0.1, cabF: 0.85, cabR: -0.95, cabH: 0.5, slope: 0.7, wheel: 0.35, roofIn: 0.22, nose: 0.28, wing: 0.24 },
  },
  {
    id: 'eclipse', name: 'Eclipse X', cls: 'Hypercar', price: 150000, top: 352, accel: 14.2, grip: 1.32, color: 0x111318,
    body: { L: 4.7, W: 2.04, H: 0.46, clear: 0.09, cabF: 0.95, cabR: -0.85, cabH: 0.48, slope: 0.78, wheel: 0.36, roofIn: 0.24, nose: 0.32, wing: 0.3 },
  },
];

export const PAINT_SWATCHES = [0xf2efe6, 0x111318, 0x8a929e, 0xe03a3a, 0xff7a1a, 0xf4b400, 0xc6ff3d, 0x1f9d55, 0x1f6f5c, 0x3de0ff, 0x2b5fb3, 0x7d3cff];

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
