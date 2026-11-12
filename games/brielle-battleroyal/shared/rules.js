// Every number that shapes a match of Brielle Battleroyal. Shared by the browser (solo) and the server (online).

export const MATCH = {
  SIZE: 20,             // players in a match (people first, bots fill the rest)
  MAX_PEOPLE: 16,
  WARMUP: 6,            // seconds on the dock before the blimp takes off (online lobbies wait longer)
  OVER_HOLD: 12,
};

export const MAP = { HALF: 500, EDGE: 560, WATER: 0 };

export const BODY = {
  R: 0.38, H: 1.8, CROUCH_H: 1.25, EYE: 1.6, STEP: 0.6,
  WALK: 5.6, SPRINT: 7.4, CROUCH: 3.0, SWIM: 3.6, ADS_MUL: 0.62,
  JUMP: 8.0, G: 23,
  SKY_FALL: 38, SKY_DIVE: 54, SKY_SIDE: 16,
  GLIDE_FALL: 7.5, GLIDE_SIDE: 15, GLIDE_AT: 42,
  SWIM_Y: -1.25,        // feet height while swimming
};

export const HP = { MAX: 100, SHIELD: 100 };

export const BLIMP = { ALT: 150, SPEED: 30, PASS: 230 };

/** Nor'easter: wait (s), shrink (s), radius after the shrink, damage per second outside. */
export const STORM = [
  { wait: 50, shrink: 40, r: 330, dmg: 1 },
  { wait: 45, shrink: 35, r: 190, dmg: 2 },
  { wait: 40, shrink: 30, r: 105, dmg: 4 },
  { wait: 30, shrink: 25, r: 55, dmg: 6 },
  { wait: 25, shrink: 22, r: 24, dmg: 8 },
  { wait: 18, shrink: 22, r: 6, dmg: 10 },
  { wait: 20, shrink: 25, r: 0, dmg: 14 },
];
export const STORM_START_R = 720;

export const RARITY = [
  { name: 'Common', color: '#b6bcc6', dmg: 1.0, reload: 1.0 },
  { name: 'Uncommon', color: '#5fd35a', dmg: 1.05, reload: 0.95 },
  { name: 'Rare', color: '#41a6ff', dmg: 1.1, reload: 0.9 },
  { name: 'Epic', color: '#c45cff', dmg: 1.16, reload: 0.85 },
  { name: 'Legendary', color: '#ffb73a', dmg: 1.22, reload: 0.8 },
];

export const AMMO = {
  light: { name: 'Light Ammo', max: 999, box: 30 },
  medium: { name: 'Medium Ammo', max: 999, box: 20 },
  shells: { name: 'Shells', max: 999, box: 6 },
  heavy: { name: 'Heavy Ammo', max: 999, box: 4 },
  rockets: { name: 'Fireworks', max: 99, box: 3 },
};

// Weapons. dmg is per pellet; spread in radians (hip, ads); rate = shots per second; fall = [start m, end m, min multiplier].
export const WEAPONS = {
  pistol: { name: 'Boardwalk Pistol', ammo: 'light', dmg: 24, pellets: 1, rate: 6.5, mag: 16, reload: 1.4, spread: [0.022, 0.006], hs: 2, range: 160, fall: [30, 90, 0.6], build: 1, rar: [0, 3], model: 'pistol' },
  smg: { name: 'Riptide SMG', ammo: 'light', dmg: 17, pellets: 1, rate: 12, mag: 30, reload: 2.0, spread: [0.035, 0.016], hs: 1.75, range: 120, fall: [20, 70, 0.55], build: 1, auto: true, rar: [0, 4], model: 'smg' },
  ar: { name: 'Seagull AR', ammo: 'medium', dmg: 31, pellets: 1, rate: 5.5, mag: 30, reload: 2.3, spread: [0.03, 0.004], hs: 1.5, range: 260, fall: [60, 160, 0.7], build: 1, auto: true, rar: [0, 4], model: 'ar' },
  pump: { name: 'Clam Pump', ammo: 'shells', dmg: 9.5, pellets: 10, rate: 0.8, mag: 5, reload: 4.3, spread: [0.075, 0.06], hs: 2, range: 40, fall: [6, 22, 0.35], build: 1, rar: [0, 4], model: 'pump' },
  tac: { name: 'Tackle Tactical', ammo: 'shells', dmg: 7.4, pellets: 10, rate: 1.5, mag: 8, reload: 5.2, spread: [0.085, 0.07], hs: 1.75, range: 38, fall: [6, 22, 0.35], build: 1, rar: [0, 3], model: 'tac' },
  sniper: { name: 'Lighthouse Sniper', ammo: 'heavy', dmg: 105, pellets: 1, rate: 0.33, mag: 1, reload: 2.6, spread: [0.06, 0.0], hs: 2.5, range: 600, fall: [600, 600, 1], build: 1, scope: true, rar: [2, 4], model: 'sniper' },
  rocket: { name: 'Firework Launcher', ammo: 'rockets', dmg: 105, pellets: 0, rate: 0.75, mag: 1, reload: 2.5, spread: [0, 0], range: 400, splash: 4.2, buildDmg: 400, speed: 55, rar: [2, 4], model: 'rocket' },
  grenade: { name: 'Crab Grenade', consumable: true, stack: 6, dmg: 95, splash: 4.5, buildDmg: 375, fuse: 2.4, rar: [1, 1], model: 'grenade' },
};

export const HEALS = {
  bandage: { name: 'Bandages', stack: 15, time: 3.4, hp: 15, cap: 75, rar: 0, model: 'bandage' },
  medkit: { name: 'Medkit', stack: 3, time: 9, hp: 100, cap: 100, rar: 1, model: 'medkit' },
  seaglass: { name: 'Sea Glass Shield', stack: 6, time: 2, sh: 25, cap: 50, rar: 2, model: 'seaglass' },
  jug: { name: 'Shield Jug', stack: 3, time: 5, sh: 50, cap: 100, rar: 2, model: 'jug' },
  slush: { name: 'Jersey Slush', stack: 2, time: 2, hp: 75, sh: 75, slow: true, rar: 4, model: 'slush' },
};

// Floor loot, chests and supply drops pick from these (weights).
export const FLOOR_TABLE = [
  ['pistol', 10], ['smg', 9], ['ar', 11], ['pump', 8], ['tac', 6], ['sniper', 2],
  ['grenade', 4], ['bandage', 7], ['medkit', 3], ['seaglass', 6], ['jug', 3], ['slush', 1], ['rocket', 1],
];
export const CHEST_TABLE = [
  ['smg', 9], ['ar', 13], ['pump', 10], ['tac', 6], ['sniper', 5], ['rocket', 3],
  ['grenade', 5], ['medkit', 4], ['seaglass', 7], ['jug', 6], ['slush', 2],
];
export const RARITY_WEIGHTS = { floor: [46, 30, 16, 6, 2], chest: [10, 32, 34, 17, 7] };

export const INV = { SLOTS: 5 };   // slot 0 is always the pickaxe, 1-5 hold items

export const BUILD = {
  CELL: 4, LEVEL: 3.4, THICK: 0.24,
  MATS: ['Wood', 'Brick', 'Metal'],
  HP: [150, 320, 460],
  START: [0.3, 0.2, 0.15],      // a new piece starts with this share of its health and grows to full over TIME
  TIME: [1.2, 2.6, 4.0],
  COST: 10, MAX_MATS: 999,
  REACH: 7,                     // you can place pieces this many cells' worth of metres away
  PICKAXE: { player: 20, piece: 50, rate: 2.2, reach: 2.6 },
};

// Harvesting: what each kind of prop gives per pickaxe hit and how many hits it takes.
export const HARVEST = {
  tree: { mat: 0, hp: 150, per: 12 },
  pine: { mat: 0, hp: 150, per: 12 },
  bush: { mat: 0, hp: 50, per: 6 },
  rock: { mat: 1, hp: 220, per: 14 },
  car: { mat: 2, hp: 250, per: 14 },
  boat: { mat: 0, hp: 200, per: 14 },
  crate: { mat: 0, hp: 60, per: 9 },
  dumpster: { mat: 2, hp: 180, per: 12 },
  fence: { mat: 0, hp: 60, per: 6 },
};

export const FALL = { SAFE: 9.5, PER_M: 6 };   // drops higher than SAFE metres hurt PER_M per extra metre

export const OUTFITS = [
  { id: 'lifeguard', name: 'Lifeguard', body: '#e63b2e', legs: '#f2f2f2', skin: '#f1c39a', hat: 'visor', hatc: '#ffffff', pack: '#ffcf33' },
  { id: 'crabber', name: 'Crabber', body: '#2a6bd1', legs: '#1d2b44', skin: '#c98c64', hat: 'bucket', hatc: '#f2d36b', pack: '#e5552f' },
  { id: 'boardwalk', name: 'Boardwalker', body: '#ff7ab8', legs: '#3fd4d0', skin: '#8d5b3e', hat: 'cap', hatc: '#ffd84d', pack: '#ffffff' },
  { id: 'captain', name: 'Captain', body: '#f4f1e6', legs: '#1b2440', skin: '#e8b88f', hat: 'captain', hatc: '#1b2440', pack: '#c8a24a' },
  { id: 'surfer', name: 'Surfer', body: '#22c3a6', legs: '#2f3e9e', skin: '#d79d71', hat: 'none', hatc: '#000000', pack: '#ff9f1a' },
  { id: 'commuter', name: 'Commuter', body: '#3d4250', legs: '#2a2d35', skin: '#a8714f', hat: 'beanie', hatc: '#d43c3c', pack: '#6c4a2f' },
  { id: 'nightowl', name: 'Night Owl', body: '#251a3d', legs: '#121019', skin: '#f0caa6', hat: 'hood', hatc: '#251a3d', pack: '#6cf0ff' },
  { id: 'fisher', name: 'Fisher', body: '#f1b52d', legs: '#33502f', skin: '#b67b55', hat: 'bucket', hatc: '#33502f', pack: '#8c5a2b' },
];
