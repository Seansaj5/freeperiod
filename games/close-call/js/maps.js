// The routes. Each map is its own place: road shape (bends, hills), features (tunnels, bridges)
// and look (sky, light, scenery). Lane modes change how many lanes the highway has.

export const LANE_MODES = [2, 3, 4];
/** Fewer lanes is harder, so it pays more. */
export const CASH_MULT = { 2: 1.5, 3: 1.25, 4: 1 };

export const MAPS = {
  city: {
    id: 'city', name: 'Night City', blurb: 'Elevated expressway over downtown. Rolling ramps, sweeping bends and glowing covered tubes.',
    // curvature: sum of sines (wavelengths w, weights a); |sum| below th is straight road; k = tightest bend (1/radius)
    curve: { k: 1 / 300, w: [640, 1700, 260], a: [0.62, 0.38, 0.14], th: 0.26 },
    hills: { base: 0, a: [6.5, 2.5], w: [360, 140] },
    feat: { seg: 1500, tunnel: 0.42, bridge: 0, tunnelLen: [260, 480] },
    trapEvery: 1900,
    elevated: true,
    sky: { top: [0.012, 0.02, 0.06], mid: [0.045, 0.06, 0.15], glow: [0.36, 0.18, 0.2], cloud: [0.22, 0.14, 0.18], stars: 1, sun: null },
    fog: [0x0d1226, 80, 700], bg: 0x0b1224,
    hemi: [0x7a8fcc, 0x2a1e16, 1.15], light: [0xa8bcff, 0.5, [-60, 120, -40]],
    lamps: { gap: 20, both: true, color: 0xffc27a }, rail: 'jersey', tube: 'glass',
    paint: 'white', far: 'city',
  },
  coast: {
    id: 'coast', name: 'Sunset Coast', blurb: 'Cliff-top coast road at golden hour. Palm trees, bay bridges and tunnels through the headlands.',
    curve: { k: 1 / 240, w: [520, 1300, 230], a: [0.6, 0.4, 0.18], th: 0.2 },
    hills: { base: 12, a: [7, 3.2], w: [330, 130] },
    feat: { seg: 1500, tunnel: 0.28, bridge: 0.3, tunnelLen: [200, 380], bridgeLen: [460, 760] },
    trapEvery: 2100,
    sea: -6,
    sky: { top: [0.08, 0.16, 0.36], mid: [0.32, 0.36, 0.55], glow: [1.0, 0.52, 0.22], cloud: [0.95, 0.6, 0.42], stars: 0, sun: { dir: [-0.62, 0.07, 0.78], col: [1.6, 0.9, 0.45], size: 0.9985 } },
    fog: [0x8a7a8c, 120, 1100], bg: 0x5a6a90,
    hemi: [0xffd2b0, 0x3c4660, 1.45], light: [0xffb27a, 1.9, [-300, 60, 380]],
    lamps: { gap: 40, both: false, color: 0xffd09a }, rail: 'guard', tube: 'rock',
    paint: 'yellow', far: 'islands',
  },
  canyon: {
    id: 'canyon', name: 'Red Canyon', blurb: 'Desert highway through red rock at nightfall. Big hills, tight bends, no street lights.',
    curve: { k: 1 / 205, w: [470, 1150, 210], a: [0.6, 0.4, 0.2], th: 0.16 },
    hills: { base: 0, a: [15, 6], w: [420, 165] },
    feat: { seg: 1500, tunnel: 0.38, bridge: 0, tunnelLen: [180, 360] },
    trapEvery: 1700,
    sky: { top: [0.008, 0.012, 0.045], mid: [0.05, 0.06, 0.15], glow: [0.6, 0.26, 0.1], cloud: [0.3, 0.16, 0.12], stars: 1.6, sun: null },
    fog: [0x141826, 70, 760], bg: 0x0c0f1c,
    hemi: [0x9ea4c0, 0x3a2216, 1.0], light: [0xc4ccff, 0.6, [80, 120, -60]],
    lamps: null, rail: 'posts', tube: 'rock',
    paint: 'yellow', far: 'mesas',
  },
};
export const MAP_LIST = ['city', 'coast', 'canyon'];
export const mapById = (id) => MAPS[id] || MAPS.city;
