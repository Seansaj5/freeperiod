// Every car's interior, as a recipe the cockpit builds from (cockpit.js). The interiors take after the real cars
// these look-alikes are based on (dial layout, wheel shape, shifter, screens, materials), without any real badges.
//   dash / panel / door / seat / liner   colours of the big surfaces
//   accent   stitching, markers, seat-belt colour      glow   the cabin's light colour (buttons, strips, dials)
//   trim     [slot, colour]: the decorative strip and spokes: 'carbon', 'metal', 'trim' (piano / wood by colour)
//   cluster  the dials (gauges.js kind + colours)        bin   how they are housed: hood, twin, pod, flat, none
//   screen   [type, what it shows]: tablet, inset, portrait, wide, big, radio, none
//   vents    [type, how many in the middle]: round, turbine, rect, hex, slim
//   wheel    r radius, tube thickness, flat bottom 0..1, sq squareness (2 round .. 4 square), yoke, spokes 2 | 3,
//            hub round | trap | hex | tri | sq, marker (12 o'clock stripe), rim 'soft' | 'carbon' | 'wood' | 'metal'
//            for the top and bottom arcs, leds (shift lights), buttons [[x, y, colour, 'glow' | 'metal' | 'trim', r]],
//            paddles 'wheel' | 'column'
//   shift    stick | paddle | tip | none            knob  ball, cue, golf, alu, tall, leather, gate, t
//   console  type plain | bridge | wall | spine | flat, high (taller), buttons n, knobs n, start 'red' | 'flip', hb
//   extras   cage, clock 'oval' | 'chrono', aux n (little dials on the dash top), grab, strip (light strip), straps
//   suit / glove   the driver's kit (by default it matches the paint)
const BLACK = 0x15161a, COAL = 0x1c1d22, GREY = 0x34363d, CREAM = 0xe8dcc8, TAN = 0x9a6a3c, SADDLE = 0x7a4a26, RED = 0xb01e24, WINE = 0x6a1d22, BLUE = 0x1d3f8f, WHITE = 0xf1f1ee;
const ALU = 0xc8ccd4, WOOD = 0x4a2c16, PIANO = 0x0b0b0d;

const BASE = {
  dash: BLACK, panel: COAL, door: COAL, seat: COAL, liner: 0x23242a, carpet: 0x0c0c0e, accent: ALU, glow: 0x3de0ff,
  trim: ['trim', PIANO], cluster: { kind: 'twin' }, bin: 'hood', screen: ['tablet', 'nav'], vents: ['rect', 2],
  wheel: { r: 0.178, tube: 0.0165, flat: 0, sq: 2, spokes: 3, hub: 'round', rim: 'soft', buttons: [] },
  shift: 'paddle', knob: 'ball', console: { type: 'plain', buttons: 3 }, extras: {},
};
/** Families: a starting point per kind of car. */
const FAM = {
  eco: { dash: 0x2a2c32, panel: 0x34363d, door: 0x3a3c44, seat: 0x4a4d57, liner: 0x8a8d96, cluster: { kind: 'single', glow: 0xffa040 }, glow: 0xffa040, screen: ['radio', 'radio'], vents: ['round', 2], wheel: { spokes: 2, tube: 0.0135, r: 0.185, hub: 'trap' }, shift: 'stick', knob: 'tall', console: { type: 'plain', hb: true, buttons: 0 } },
  sedan: { panel: 0x26272d, door: 0x26272d, seat: 0x2c2d33, liner: 0xb9b6ad, cluster: { kind: 'twin', acc: 0xff5a30, glow: 0xffffff }, glow: 0xffffff, vents: ['rect', 2], wheel: { hub: 'trap', buttons: [[-0.085, -0.004, 0x8a8f99, 'trim', 0.009], [0.085, -0.004, 0x8a8f99, 'trim', 0.009]] }, shift: 'tip', knob: 't', console: { type: 'plain', buttons: 4 } },
  sport: { accent: RED, cluster: { kind: 'tach', acc: 0xff3b30, glow: 0xff5a30 }, glow: 0xff5a30, vents: ['round', 2], wheel: { flat: 0.82, marker: RED, tube: 0.0175 }, shift: 'stick', knob: 'ball', console: { type: 'plain', high: true, hb: true, buttons: 3 } },
  muscle: { panel: 0x1a1b1f, cluster: { kind: 'retro', acc: 0xff3b30, glow: 0xffb020 }, glow: 0xffb020, bin: 'twin', vents: ['rect', 2], wheel: { r: 0.185, hub: 'round', tube: 0.017 }, shift: 'stick', knob: 'cue', console: { type: 'plain', buttons: 4 } },
  gt: { seat: SADDLE, door: SADDLE, accent: CREAM, trim: ['trim', WOOD], cluster: { kind: 'twin', face: 0x101b33, acc: 0xff4a3a, glow: 0x9fc4ff }, glow: 0x9fc4ff, vents: ['round', 2], wheel: { hub: 'round', paddles: 'column' }, console: { type: 'plain', high: true, buttons: 4 }, extras: { clock: 'oval' } },
  superc: { trim: ['carbon', 0xffffff], cluster: { kind: 'ring' }, bin: 'flat', vents: ['hex', 2], wheel: { flat: 0.8, tube: 0.0175, rim: 'carbon', paddles: 'wheel' }, console: { type: 'bridge', buttons: 5, start: 'red' }, extras: { strip: true } },
  track: { trim: ['carbon', 0xffffff], liner: 0x15161a, cluster: { kind: 'bar', glow: 0x6dff8a }, bin: 'pod', screen: ['inset', 'perf'], vents: ['round', 2], wheel: { flat: 0.8, tube: 0.0175, marker: 0xffd000, paddles: 'wheel' }, console: { type: 'plain', high: true, buttons: 6 }, extras: { cage: true, straps: true } },
  ev: { dash: 0x1b1c20, panel: 0x232429, door: 0xdedbd2, seat: 0xe6e3da, liner: 0xd8d5cc, trim: ['trim', 0x6b4a2c], cluster: { kind: 'ev', glow: 0x9fd4ff }, glow: 0x9fd4ff, bin: 'none', screen: ['big', 'ev'], vents: ['slim', 0], wheel: { spokes: 2, hub: 'sq' }, shift: 'none', console: { type: 'flat', buttons: 0 } },
  suv: { panel: 0x202126, liner: 0x2a2b31, cluster: { kind: 'dual', glow: 0xffffff }, glow: 0xffffff, bin: 'flat', screen: ['wide', 'nav'], vents: ['turbine', 4], wheel: { hub: 'trap', flat: 0.85 }, shift: 'tip', knob: 't', console: { type: 'plain', high: true, buttons: 6 }, extras: { grab: true } },
};
const MASA = { seat: 0x8a2f22, door: 0x7a2a1e, accent: CREAM, trim: ['carbon', 0xffffff], cluster: { kind: 'twin', face: 0x0f1c38, acc: 0xff4a3a, glow: 0x8fb8ff }, glow: 0x8fb8ff, extras: { clock: 'oval' }, wheel: { hub: 'round', paddles: 'column', flat: 0.85 } };
const BMV = { accent: 0xd02020, trim: ['carbon', 0xffffff], cluster: { kind: 'dual', glow: 0xff7a3a, acc: 0xff2020 }, glow: 0xff5a2a, bin: 'flat', screen: ['wide', 'nav'], vents: ['rect', 2], wheel: { hub: 'sq', tube: 0.019, marker: 0xd02020, buttons: [[-0.075, 0.03, 0xd02020, 'glow', 0.011], [0.075, 0.03, 0xd02020, 'glow', 0.011]], paddles: 'wheel' }, shift: 'paddle', console: { type: 'plain', high: true, buttons: 6, start: 'red' } };
const MERC = { cluster: { kind: 'dual', glow: 0x9fd4ff, acc: 0xff3b30 }, glow: 0xb48cff, bin: 'flat', screen: ['wide', 'media'], vents: ['turbine', 4], trim: ['carbon', 0xffffff], wheel: { hub: 'round', flat: 0.84, tube: 0.018, buttons: [[-0.07, -0.05, 0xffb020, 'glow', 0.014], [0.07, -0.05, 0xffb020, 'glow', 0.014]], paddles: 'wheel' }, shift: 'paddle', console: { type: 'plain', high: true, knobs: 2, buttons: 8 }, extras: { strip: true } };
const AUDY = { accent: 0xd02020, trim: ['carbon', 0xffffff], cluster: { kind: 'dual', glow: 0xffffff, acc: 0xff2020 }, glow: 0xff3020, bin: 'flat', vents: ['hex', 2], wheel: { hub: 'hex', flat: 0.78, tube: 0.0175, buttons: [[0.06, -0.06, 0xd02020, 'glow', 0.013], [-0.06, -0.06, 0x2a2d33, 'trim', 0.013]], paddles: 'wheel' }, shift: 'paddle', console: { type: 'plain', high: true, buttons: 5, knobs: 1 } };
const PORS = { cluster: { kind: 'tach', tachFace: 0xd8dade, tachInk: 0x16171a, acc: 0xd01a1a, glow: 0xffffff }, glow: 0xffffff, bin: 'hood', screen: ['inset', 'nav'], vents: ['rect', 2], wheel: { hub: 'round', tube: 0.0165, buttons: [[0.05, -0.065, 0x2a2d33, 'metal', 0.014]] }, console: { type: 'plain', high: true, buttons: 8 }, extras: { clock: 'chrono' } };
const LAMBO = { trim: ['carbon', 0xffffff], cluster: { kind: 'hex' }, bin: 'flat', screen: ['portrait', 'tiles'], vents: ['hex', 2], wheel: { hub: 'hex', flat: 0.8, tube: 0.0175, rim: 'carbon', paddles: 'column', buttons: [[-0.07, -0.02, 0xd02020, 'trim', 0.009], [0.07, -0.02, 0x8a8f99, 'trim', 0.009]] }, console: { type: 'bridge', buttons: 7, start: 'flip' }, extras: { strip: true } };

const CARS = {
  pocket: ['eco', {}],
  commuter: ['sedan', { screen: ['tablet', 'nav'] }],
  hatchr: ['sport', { cluster: { kind: 'twin', acc: 0xff2020, glow: 0xffffff }, knob: 'golf', wheel: { hub: 'trap', buttons: [[-0.08, 0, 0x8a8f99, 'trim', 0.009], [0.08, 0, 0x8a8f99, 'trim', 0.009]] }, seat: 0x23242a, screen: ['inset', 'media'], extras: { strip: true }, glow: 0xff2020 }],
  ronin: ['sport', { knob: 'tall', cluster: { kind: 'tach', tachFace: 0xf1f1ee, tachInk: 0x15161a, acc: 0xff3b30, glow: 0xffb020 }, screen: ['radio', 'radio'], extras: { aux: 3 }, wheel: { flat: 0, marker: null, tube: 0.0155 }, glow: 0xffb020 }],
  rx7: ['sport', { knob: 'ball', cluster: { kind: 'tach', acc: 0xff7a1a, glow: 0xff7a1a, ink: 0xffe2b8 }, screen: ['radio', 'radio'], wheel: { flat: 0, marker: null, tube: 0.015 }, accent: 0xf2c81e, glow: 0xff7a1a, console: { type: 'plain', high: true, hb: true, buttons: 2 } }],
  supremo: ['sport', { knob: 'leather', cluster: { kind: 'tach', acc: 0xff3b30, glow: 0xff3b30 }, screen: ['inset', 'nav'], console: { type: 'wall', hb: false, buttons: 5, start: 'red' }, wheel: { flat: 0, marker: null, hub: 'trap' }, trim: ['carbon', 0xffffff] }],
  audytt: ['sport', { ...AUDY, screen: ['none'], vents: ['turbine', 3], console: { type: 'plain', high: true, buttons: 4, hb: false } }],
  thunder: ['muscle', { accent: 0xf4b400, extras: { aux: 2 } }],
  bmv3: ['sedan', { ...BMV }],
  hellkat: ['muscle', { accent: 0xd02020, cluster: { kind: 'retro', tachFace: 0x8f1a1a, tachInk: 0xf1f1ee, acc: 0xffffff, glow: 0xff3b30 }, glow: 0xff3b30, shift: 'tip', knob: 't', screen: ['inset', 'perf'], wheel: { r: 0.185, hub: 'round', flat: 0.86, tube: 0.018, paddles: 'wheel' }, trim: ['carbon', 0xffffff] }],
  ghibla: ['gt', { ...MASA, trim: ['trim', WOOD], console: { type: 'plain', high: true, buttons: 4 }, shift: 'paddle' }],
  porsha: ['sport', { ...PORS, shift: 'stick', knob: 'alu', seat: 0x2a2b31, wheel: { ...PORS.wheel, flat: 0, marker: null } }],
  bmv4: ['sport', { ...BMV, seat: 0x1c1d22, liner: 0x15161a, wheel: { ...BMV.wheel, rim: 'carbon', flat: 0.84 }, extras: { strip: true } }],
  granturi: ['gt', { ...MASA, seat: TAN, door: TAN, shift: 'paddle', console: { type: 'plain', high: true, buttons: 5, start: 'red' } }],
  nsx: ['sport', { cluster: { kind: 'twin', acc: 0xff7a1a, glow: 0xff7a1a, ink: 0xffe2b8 }, glow: 0xff7a1a, knob: 'leather', screen: ['radio', 'radio'], vents: ['rect', 2], wheel: { flat: 0, marker: null, tube: 0.0155, hub: 'trap' }, accent: 0xd01a1a, seat: 0x7a1c1c, console: { type: 'wall', hb: true, buttons: 3 } }],
  e63: ['sedan', { ...MERC, seat: 0x2a2b31 }],
  rs6: ['sedan', { ...AUDY, screen: ['inset', 'nav'], seat: 0x23242a, extras: { strip: true } }],
  vanta: ['gt', { seat: TAN, door: TAN, accent: 0xc9a04a, trim: ['metal', ALU], cluster: { kind: 'twin', face: 0x15161a, acc: 0xff4a3a, glow: 0xffffff }, console: { type: 'bridge', buttons: 4, start: 'red' }, shift: 'paddle', extras: { clock: null, strip: false }, wheel: { hub: 'sq', flat: 0.84, paddles: 'column' } }],
  levanta: ['suv', { ...MASA, bin: 'hood', screen: ['inset', 'nav'], vents: ['round', 2], shift: 'paddle', console: { type: 'plain', high: true, buttons: 5 }, extras: { clock: 'oval', grab: false } }],
  caymon: ['track', { ...PORS, bin: 'hood', shift: 'stick', knob: 'alu', accent: 0xf2c81e, wheel: { ...PORS.wheel, marker: 0xf2c81e, buttons: [] }, extras: { clock: 'chrono', cage: false, straps: true }, liner: 0x15161a }],
  corvex: ['superc', { accent: 0xd02020, cluster: { kind: 'bar', glow: 0xffffff, acc: 0xff2020 }, bin: 'flat', screen: ['inset', 'nav'], vents: ['slim', 0], wheel: { sq: 3.6, flat: 0.78, hub: 'sq', rim: 'soft', spokes: 2, buttons: [[0.07, -0.02, 0xffb020, 'glow', 0.01]], paddles: 'wheel' }, console: { type: 'wall', buttons: 14, start: 'red' }, seat: 0x7a1c1c, extras: {} }],
  quattro: ['gt', { ...MASA, seat: 0xb08a5a, door: 0xa07a4c, trim: ['trim', WOOD], liner: 0xcfc7b4, shift: 'paddle', console: { type: 'plain', buttons: 5 } }],
  gwagen: ['suv', { ...MERC, accent: 0xd02020, seat: 0x7a1c1c, shift: 'tip', knob: 't', console: { type: 'plain', high: true, buttons: 3, knobs: 1 }, extras: { grab: true, strip: true, locks: true } }],
  gtz: ['sport', { cluster: { kind: 'tach', acc: 0xff2020, glow: 0xffffff }, glow: 0xff2020, shift: 'paddle', screen: ['inset', 'perf'], trim: ['carbon', 0xffffff], wheel: { hub: 'round', flat: 0, marker: null, paddles: 'column', buttons: [[0.06, -0.06, 0xd02020, 'glow', 0.012]] }, console: { type: 'plain', high: true, buttons: 3, knobs: 3, start: 'red' }, extras: { aux: 0 } }],
  masarotti: ['superc', { ...MASA, seat: 0x15161a, door: 0x1a1b20, accent: 0x2a6cff, cluster: { kind: 'ring', glow: 0x4a90ff, acc: 0xff3b30 }, glow: 0x4a90ff, console: { type: 'bridge', buttons: 3, knobs: 1 }, extras: { clock: null, strip: true } }],
  bmv1: ['sport', { dash: 0x1a1b1f, seat: 0x3a2a20, cluster: { kind: 'twin', acc: 0xff7a1a, glow: 0xffb020 }, glow: 0xffb020, knob: 'ball', screen: ['radio', 'radio'], vents: ['rect', 2], accent: 0x2b5fb3, trim: ['metal', ALU], wheel: { flat: 0, marker: null, tube: 0.0145, rim: 'soft', metalSpokes: true }, console: { type: 'plain', high: true, hb: true, buttons: 6 } }],
  teslo: ['ev', { wheel: { yoke: true, spokes: 2, hub: 'sq', r: 0.172 } }],
  spectre: ['superc', { accent: 0x7d3cff, cluster: { kind: 'hex', glow: 0xb48cff, acc: 0xff3b6a }, glow: 0xb48cff }],
  tycan: ['ev', { door: 0x2a2b31, seat: 0x33343a, liner: 0x2a2b31, trim: ['metal', ALU], cluster: { kind: 'ev', glow: 0xffffff }, glow: 0xffffff, bin: 'pod', screen: ['wide', 'nav'], wheel: { spokes: 3, hub: 'round', flat: 0, buttons: [[0.05, -0.065, 0x2a2d33, 'metal', 0.014]] }, extras: { clock: 'chrono', strip: true } }],
  gt3r: ['track', { ...PORS, bin: 'hood', accent: 0xffd000, wheel: { ...PORS.wheel, marker: 0xffd000, flat: 0, paddles: 'wheel', buttons: [] }, shift: 'paddle', extras: { cage: true, straps: true, clock: 'chrono' } }],
  amggt: ['superc', { ...MERC, accent: 0xe85d0c, glow: 0xff7a1a, seat: 0x1c1d22, console: { type: 'bridge', buttons: 0, knobs: 8, start: 'red' }, liner: 0x15161a }],
  audy: ['superc', { ...AUDY, screen: ['none'], vents: ['round', 2], console: { type: 'bridge', buttons: 5, knobs: 3 }, wheel: { ...AUDY.wheel, buttons: [[0.062, -0.058, 0xd02020, 'glow', 0.014], [-0.062, -0.058, 0x2a2d33, 'metal', 0.014], [0.085, -0.01, 0x2a2d33, 'metal', 0.011], [-0.085, -0.01, 0x2a2d33, 'metal', 0.011]] } }],
  lfa: ['superc', { accent: 0xd01a1a, seat: 0x8a1c1c, door: 0x1c1d22, cluster: { kind: 'ring', glow: 0xffffff, acc: 0xff2020 }, glow: 0xffffff, bin: 'hood', screen: ['inset', 'nav'], vents: ['rect', 2], wheel: { hub: 'round', flat: 0.84, rim: 'carbon', paddles: 'column' }, console: { type: 'bridge', buttons: 4, knobs: 1 } }],
  uragano: ['superc', { ...LAMBO, accent: 0xc6ff3d, glow: 0xc6ff3d, cluster: { kind: 'hex', glow: 0xc6ff3d, acc: 0xff3b30 } }],
  ferrano: ['superc', { seat: 0xa8763a, door: 0x8a5c2a, accent: 0xd01a1a, cluster: { kind: 'yellow', glow: 0xffffff, acc: 0xd01a1a }, glow: 0xff3020, bin: 'hood', screen: ['none'], vents: ['round', 2], wheel: { hub: 'round', flat: 0.8, rim: 'carbon', leds: true, paddles: 'column', buttons: [[-0.055, -0.06, 0xd01a1a, 'glow', 0.013], [0.055, -0.06, 0xd01a1a, 'metal', 0.015]] }, console: { type: 'bridge', buttons: 3 } }],
  mclarson: ['superc', { accent: 0xff7a1a, glow: 0xff7a1a, cluster: { kind: 'bar', glow: 0xffffff, acc: 0xff7a1a }, bin: 'pod', screen: ['portrait', 'tiles'], vents: ['round', 2], wheel: { hub: 'round', flat: 0, rim: 'soft', buttons: [], paddles: 'wheel', tube: 0.0165 }, console: { type: 'spine', buttons: 3, start: 'red' }, liner: 0x15161a }],
  fordgt: ['track', { accent: 0x2a6cff, cluster: { kind: 'bar', glow: 0x4a90ff, acc: 0xff3b30 }, glow: 0x4a90ff, bin: 'pod', screen: ['inset', 'nav'], wheel: { sq: 3.2, flat: 0.74, hub: 'sq', marker: 0x2a6cff, paddles: 'wheel', buttons: [[-0.08, 0.03, 0xd02020, 'glow', 0.009], [0.08, 0.03, 0x6dff8a, 'glow', 0.009], [-0.08, -0.03, 0xffb020, 'glow', 0.009], [0.08, -0.03, 0x4a90ff, 'glow', 0.009], [0, -0.07, 0xd02020, 'glow', 0.011]] }, console: { type: 'bridge', buttons: 4, knobs: 1 }, extras: { cage: false, straps: false, strip: true } }],
  eclipse: ['superc', { accent: 0x3de0ff, glow: 0x3de0ff, cluster: { kind: 'ring', glow: 0x3de0ff, acc: 0xff3b6a }, shift: 'stick', knob: 'gate', wheel: { flat: 0.8, rim: 'carbon', hub: 'hex', paddles: null }, console: { type: 'bridge', buttons: 4, start: 'red' } }],
  aventa: ['superc', { ...LAMBO, accent: 0xf4b400, glow: 0xf4b400, cluster: { kind: 'hex', glow: 0xf4b400, acc: 0xff3b30 }, liner: 0x15161a, extras: { strip: true, cage: false } }],
  huayro: ['gt', { seat: 0x9a6a3c, door: 0x8a5c30, accent: CREAM, trim: ['metal', ALU], cluster: { kind: 'twin', face: 0x0c0d10, acc: 0xff4a3a, glow: 0xffe2b8, ink: 0xf1f1ee }, glow: 0xffe2b8, vents: ['round', 4], screen: ['inset', 'media'], shift: 'stick', knob: 'gate', wheel: { hub: 'round', flat: 0.82, rim: 'wood', metalSpokes: true, paddles: null }, console: { type: 'spine', buttons: 0, knobs: 4 }, extras: { clock: 'oval', aux: 2 } }],
  p919: ['superc', { ...PORS, bin: 'hood', accent: 0x9fe02a, glow: 0x9fe02a, cluster: { kind: 'tach', acc: 0x9fe02a, glow: 0x9fe02a }, screen: ['portrait', 'tiles'], wheel: { ...PORS.wheel, flat: 0, paddles: 'wheel' }, console: { type: 'bridge', buttons: 6 }, extras: { clock: 'chrono', strip: true } }],
  mc12: ['track', { ...MASA, seat: BLUE, door: 0x1a2f66, accent: 0xf1f1ee, trim: ['carbon', 0xffffff], bin: 'hood', screen: ['none'], vents: ['round', 2], shift: 'paddle', console: { type: 'bridge', buttons: 4, start: 'red' }, extras: { clock: 'oval', cage: false, straps: false } }],
  bugani: ['gt', { seat: 0x1d3f8f, door: 0x1a3577, dash: 0x121c33, accent: 0x9fc4ff, trim: ['metal', ALU], cluster: { kind: 'tach', acc: 0xff3b30, glow: 0x9fc4ff }, glow: 0x9fc4ff, screen: ['none'], vents: ['round', 2], shift: 'paddle', wheel: { hub: 'round', flat: 0.84, paddles: 'wheel', buttons: [[0.06, -0.06, 0x2a6cff, 'glow', 0.014], [-0.06, -0.06, 0xd02020, 'metal', 0.013]] }, console: { type: 'spine', buttons: 0, knobs: 4 }, extras: { clock: null, cline: true } }],
  jesca: ['superc', { accent: 0xff7a1a, glow: 0xff7a1a, cluster: { kind: 'ring', glow: 0xff7a1a, acc: 0xff3b30 }, bin: 'pod', screen: ['portrait', 'tiles'], vents: ['round', 2], wheel: { hub: 'round', flat: 0.8, rim: 'carbon', paddles: 'wheel', buttons: [[-0.075, 0.005, 0xff7a1a, 'glow', 0.016], [0.075, 0.005, 0xff7a1a, 'glow', 0.016]] }, console: { type: 'spine', buttons: 2, knobs: 1 }, liner: 0x15161a }],
  // Claude's own: cream leather, terracotta stitching, a glass roof, the spark on the dials, the screen and the hub
  claude: ['superc', { dash: 0x2a211c, panel: 0x33271f, seat: CREAM, door: 0xdccfb8, liner: 0xe8dcc8, carpet: 0x1c1512, accent: 0xd97757, glow: 0xffa27a, trim: ['metal', 0xd9a37a], cluster: { kind: 'spark', bg: 0x130e0b, glow: 0xff9a6a, acc: 0xff5a3d, ink: 0xf4ead8, dim: 0x7a6558 }, bin: 'flat', screen: ['tablet', 'spark'], vents: ['slim', 0], wheel: { sq: 2.6, flat: 0.84, tube: 0.0175, hub: 'round', rim: 'soft', rimCol: CREAM, marker: 0xd97757, leds: true, emblem: 'spark', paddles: 'wheel', buttons: [[-0.07, -0.01, 0xd97757, 'glow', 0.011], [0.07, -0.01, 0xf0e6d6, 'glow', 0.011]] }, console: { type: 'bridge', buttons: 2, knobs: 1, start: 'red' }, extras: { strip: true }, suit: 0xf0e6d6, glove: 0xd97757 }],
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = isObj(b[k]) && isObj(a[k]) && k !== 'extras' ? merge(a[k], b[k]) : b[k];
  return o;
}
/** The full interior recipe for a car. */
export function interiorOf(id) {
  const [fam, over] = CARS[id] || ['sedan', {}];
  const r = merge(merge(BASE, FAM[fam] || {}), over);
  r.extras = { ...(FAM[fam]?.extras || {}), ...(over.extras || {}) };
  r.fam = fam;
  return r;
}
export const INTERIOR_IDS = Object.keys(CARS);
