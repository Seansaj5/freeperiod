// The tracks: layout (control points: x, z, height, road half-width), where the features go (by control point
// number, e.g. 6.4 = 40% of the way from point 6 to 7), and the look.
//   items: rows of item crystals   boost: dash pads [at, side -1..1]   coins: [at, side, count]
//   ramps: jump ramps (do a trick in the air for a boost)   glide: [ramp, landing] glider ramp over a gap
export const TRACKS = [
  {
    id: 'harbor', name: 'Sunset Harbor', blurb: 'Seaside loop at golden hour. Climb the pier hill and glide over the bay.',
    theme: 'harbor', laps: 3, start: 0.6,
    pts: [
      [0, 0, 0, 8.5], [80, 0, 0, 8.5], [140, 12, 0, 8], [176, 48, 0, 8], [182, 98, 1, 8], [160, 138, 4, 8], [116, 162, 8, 8.5],
      [62, 168, 10, 8.5], [0, 168, 9, 8.5], [-56, 162, 2, 8.5], [-110, 146, 0, 8], [-152, 110, 0, 7.5], [-156, 58, 0, 7.5],
      [-124, 32, 0, 7.5], [-88, 54, 0, 7.5], [-60, 82, 0, 7.5], [-28, 84, 0, 7.5], [-16, 48, 0, 8], [-40, 14, 0, 8], [-28, -4, 0, 8.5],
    ],
    items: [2.3, 9.6, 14.6], boost: [[4.2, 0], [11.4, -0.4], [17.5, 0.35]], ramps: [12.6], glide: [7.1, 8.75],
    coins: [[0.85, -0.4, 6], [3.4, 0.4, 5], [5.3, 0, 5], [10.2, 0.3, 5], [13.2, -0.3, 4], [16.2, 0, 5], [18.6, -0.3, 4]],
  },
  {
    id: 'canyon', name: 'Red Rock Rally', blurb: 'Dusty canyon run. Big hills, a jump, tight hairpins and a glide off the cliff.',
    theme: 'canyon', laps: 3, start: 0.6,
    pts: [
      [0, 0, 0, 8.5], [90, 0, 0, 8.5], [150, -20, 2, 8], [188, -68, 6, 7.5], [184, -128, 10, 7.5], [136, -164, 13, 7.5],
      [76, -158, 15, 8], [16, -140, 15, 8.5], [-46, -128, 4, 8.5], [-98, -142, 0, 8], [-150, -124, 0, 7.5], [-170, -74, 0, 8],
      [-160, -24, 0, 8], [-124, 6, 0, 7.5], [-92, 30, 0, 7.5], [-56, 10, 0, 8],
    ],
    items: [1.8, 8.6, 12.4], boost: [[3.3, 0.3], [10.6, 0], [14.6, -0.3]], ramps: [11.3, 5.2], glide: [6.75, 7.85],
    coins: [[0.85, 0, 6], [2.6, -0.3, 5], [4.4, 0.3, 4], [9.4, 0, 5], [11.9, 0.3, 4], [13.4, -0.35, 5], [15.3, 0, 4]],
  },
  {
    id: 'skyway', name: 'Neon Skyway', blurb: 'Elevated night circuit through downtown. Banked sweepers, dash pads and a glide between towers.',
    theme: 'skyway', laps: 3, start: 0.55,
    pts: [
      [0, 0, 10, 9], [100, 0, 10, 9], [160, 12, 12, 8.5], [198, 54, 14, 8.5], [200, 112, 16, 8.5], [168, 152, 18, 8.5],
      [112, 164, 18, 9], [44, 164, 18, 9], [-20, 152, 11, 9], [-72, 122, 10, 8.5], [-84, 74, 10, 8],
      [-56, 50, 10, 7.5], [-82, 22, 10, 7.5], [-50, -2, 10, 8.5],
    ],
    items: [1.7, 8.7, 11.6], boost: [[2.6, 0.4], [4.5, -0.3], [9.6, 0], [12.7, 0.3]], ramps: [], glide: [6.35, 7.8],
    coins: [[0.8, 0, 6], [3.3, -0.35, 5], [5.4, 0.3, 4], [9.1, -0.3, 5], [10.6, 0.3, 4], [12.2, 0, 5]],
    bank: 1.5,
  },
];
export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];

export const THEMES = {
  harbor: {
    sky: { top: [0.1, 0.22, 0.48], mid: [0.42, 0.5, 0.66], glow: [1.0, 0.58, 0.26] }, sunDir: [-0.6, 0.18, 0.78],
    fog: [0x9a8f98, 160, 900], hemi: [0xffe0c0, 0x40506a, 1.35], sun: [0xffc08a, 2.2],
    ground: ['#3f7a3a', '#4c8a42', '#356a31'], shoulder: ['#c8b07a', '#b89c66', '#d6c08a'], road: '#3a3d45', curb: ['#e8322a', '#f2f2f2'],
    wall: ['#f2f2f2', '#2a7cff'], water: 0x1f6c94, music: 0,
  },
  canyon: {
    sky: { top: [0.06, 0.1, 0.3], mid: [0.36, 0.3, 0.4], glow: [1.0, 0.45, 0.18] }, sunDir: [0.7, 0.12, -0.7],
    fog: [0x8c6a5a, 140, 820], hemi: [0xffd0a8, 0x5a3020, 1.25], sun: [0xffa860, 2.0],
    ground: ['#9a4a26', '#a8582e', '#8a3e1e'], shoulder: ['#c27a44', '#b06a38', '#d08a52'], road: '#4a3e3a', curb: ['#ffc21a', '#2a2420'],
    wall: ['#f2e2c8', '#c24a1a'], water: 0x2a1408, music: 1,
  },
  skyway: {
    sky: { top: [0.01, 0.015, 0.05], mid: [0.04, 0.06, 0.16], glow: [0.2, 0.4, 0.7] }, sunDir: [0.3, 0.5, -0.8], stars: true,
    fog: [0x0b1430, 140, 900], hemi: [0x8aa0ff, 0x1a1c2a, 1.1], sun: [0x9ab4ff, 1.0],
    ground: ['#0e1220', '#121828', '#0a0e18'], shoulder: ['#202638', '#262c40', '#1c2232'], road: '#22262f', curb: ['#2ab8ff', '#f2f4f8'],
    wall: ['#1a2030', '#2ab8ff'], water: 0x060a14, music: 2, glowWall: true,
  },
};
