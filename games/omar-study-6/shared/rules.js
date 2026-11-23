// Omar Study 6: every number in the game lives here, shared by the browser (solo) and the server (online).
export const NET = { RADIUS: 250, MAX_PEOPLE: 12, TICK: 20 };

export const PLAYER = { HP: 100, ARMOR: 100, WALK: 3.6, RUN: 7.2, R: 0.42, H: 1.8, JUMP: 5.6, RESPAWN: 7, BILL: 0.05, BILL_MAX: 1500, START_CASH: 1500 };

// flags packed into one number in snapshots
export const F = { MOVE: 1, RUN: 2, AIM: 4, FIRE: 8, DEAD: 16, AIR: 32, PASSIVE: 64, MELEE: 128, CARRY: 256, USE: 512 };

/** Weapons. Index is the id used everywhere. dmg is per pellet. */
export const WEAPONS = [
  { id: 'fist', name: 'Fists', melee: true, dmg: 14, rate: 2.4, range: 2.0, price: 0 },
  { id: 'bat', name: 'Slugger', melee: true, dmg: 36, rate: 1.6, range: 2.4, price: 300 },
  { id: 'pistol', name: 'P9 Pistol', dmg: 22, rate: 4.5, mag: 12, reload: 1.2, range: 75, spread: 0.012, price: 800, ammo: 60, ammoPrice: 60 },
  { id: 'smg', name: 'Buzzer SMG', dmg: 14, rate: 12, mag: 32, reload: 1.6, range: 65, spread: 0.03, price: 3200, auto: true, ammo: 128, ammoPrice: 120 },
  { id: 'shotgun', name: 'Pump 12', dmg: 11, pellets: 8, rate: 1.2, mag: 6, reload: 2.1, range: 30, spread: 0.075, price: 5200, ammo: 24, ammoPrice: 140 },
  { id: 'rifle', name: 'Ranger AR', dmg: 26, rate: 8.5, mag: 30, reload: 1.9, range: 120, spread: 0.016, price: 9500, auto: true, ammo: 120, ammoPrice: 220 },
  { id: 'sniper', name: 'Longshot', dmg: 115, rate: 0.85, mag: 5, reload: 2.6, range: 320, spread: 0.001, price: 18000, scope: true, ammo: 20, ammoPrice: 300 },
];
export const ARMOR_PRICE = 500;
export const SNACK = { price: 40, heal: 60 };

/**
 * Vehicles. Index is the kind id. body: which model to build ('t:' = traffic model, 'c:' = a full car from the model book).
 * top m/s, acc m/s², grip = steering bite, L/W metres (also the hitbox), w = how common in traffic.
 */
export const VEHICLES = [
  { id: 'hatch', name: 'Pebble', body: 't:hatch', top: 37, acc: 7.5, grip: 1.05, hp: 900, seats: 4, L: 4.0, W: 1.74, w: 5 },
  { id: 'sedan', name: 'Marlin', body: 't:sedan', top: 41, acc: 8, grip: 1.0, hp: 1000, seats: 4, L: 4.6, W: 1.8, w: 6 },
  { id: 'taxi', name: 'Bay Cab', body: 't:taxi', top: 41, acc: 8, grip: 1.0, hp: 1000, seats: 4, L: 4.6, W: 1.8, w: 2, fixed: 0xf2c21c },
  { id: 'suv', name: 'Summit', body: 't:suv', top: 39, acc: 7.6, grip: 0.9, hp: 1300, seats: 4, L: 4.8, W: 1.94, w: 4 },
  { id: 'van', name: 'Hauler', body: 't:van', top: 34, acc: 6.2, grip: 0.82, hp: 1500, seats: 4, L: 5.2, W: 1.98, w: 2 },
  { id: 'pickup', name: 'Rancher', body: 't:pickup', top: 38, acc: 7.4, grip: 0.88, hp: 1400, seats: 2, L: 5.3, W: 1.98, w: 3 },
  { id: 'coupe', name: 'Vesper', body: 'c:ronin', top: 52, acc: 10.5, grip: 1.2, hp: 950, seats: 2, L: 4.4, W: 1.78, w: 1, price: 28000 },
  { id: 'muscle', name: 'Brawler V8', body: 'c:thunder', top: 55, acc: 11.5, grip: 1.02, hp: 1100, seats: 2, L: 4.8, W: 1.9, w: 1, price: 46000 },
  { id: 'sport', name: 'Kite RS', body: 't:sport', top: 60, acc: 12.5, grip: 1.3, hp: 950, seats: 2, L: 4.5, W: 1.92, w: 0.6, price: 85000 },
  { id: 'super', name: 'Zephyr GT', body: 'c:spectre', top: 70, acc: 14.5, grip: 1.4, hp: 1000, seats: 2, L: 4.5, W: 1.96, w: 0.2, price: 210000 },
  { id: 'hyper', name: 'Eclipse X', body: 'c:eclipse', top: 80, acc: 17, grip: 1.5, hp: 1050, seats: 2, L: 4.6, W: 2.0, w: 0, price: 480000 },
  { id: 'cop', name: 'Cruiser', body: 't:police', top: 58, acc: 12, grip: 1.25, hp: 1300, seats: 4, L: 4.8, W: 1.84, w: 0, fixed: 0xf4f6fa },
  { id: 'riot', name: 'Bulwark', body: 't:van', top: 44, acc: 8.5, grip: 0.9, hp: 2800, seats: 4, L: 5.2, W: 1.98, w: 0, fixed: 0x1b2230 },
  { id: 'heli', name: 'Sky Eye', body: 'heli', top: 34, acc: 8, grip: 1, hp: 1600, seats: 0, L: 7, W: 2.2, w: 0, fixed: 0x1b2230, air: true },
];
export const VK = Object.fromEntries(VEHICLES.map((v, i) => [v.id, i]));
export const CAR_COLORS = [0xe9ecf1, 0x16181d, 0x8b9099, 0xb81f24, 0x1f4fa8, 0x1d7a4a, 0xe0a416, 0xf26a1b, 0x6c3fb3, 0x23b5c4, 0x7a4a26, 0xd9d2bd];

// vehicle flag bits in snapshots
export const VF = { SIREN: 1, WRECK: 2, FIRE: 4, PARKED: 8, COP: 16, PANIC: 32, MISSION: 64, LOCK: 128, OWNED: 256 };

export const HEAT = {
  MAX: 5,
  LEVEL: [0, 10, 35, 80, 150, 260],        // crime points needed for each level
  HIDE: [0, 14, 18, 23, 28, 34],           // seconds out of sight to lose the cops
  UNITS: [0, 1, 2, 3, 4, 5],               // patrol cars after you
  SEE: 80, SEE_HELI: 120,
  COP_DMG: [0, 6, 7, 9, 11, 13],
  COP_HP: [0, 100, 100, 130, 170, 200],
  CAP: 14,
};
export const CRIME = { SHOT: 3, HIT: 6, KILL: 14, COP_HIT: 12, COP_KILL: 34, JACK: 11, STEAL: 5, RAM_COP: 9, ROB: 40, PVP: 14 };

export const PED = { HP: 70, WALK: 1.5, RUN: 5.4, R: 0.4, CASH: [8, 70] };
// ped kinds: look index 0..15 civilians; role decides behaviour
export const ROLE = { CIV: 0, COP: 1, GUARD: 2, CLERK: 3, SWAT: 4 };
// ped states in snapshots
export const PS = { WALK: 0, IDLE: 1, FLEE: 2, COWER: 3, DEAD: 4, AIM: 5, RUN: 6, FIGHT: 7 };

export const POP = { CARS: 9, PEDS: 11, CAR_CAP: 70, PED_CAP: 90, CAR_IN: 105, CAR_OUT: 190, CAR_KILL: 245, PED_IN: 70, PED_OUT: 125, PED_KILL: 170, PARK_R: 150, PARK_FILL: 0.14 };

export const OUTFITS = [
  { id: 'street', name: 'Street', skin: 0xe2b48c, top: 0x2a6fdb, legs: 0x23262e, hair: 0x2a1c12, style: 'short' },
  { id: 'hoodie', name: 'Night Hoodie', skin: 0xc68e62, top: 0x1b1d22, legs: 0x3a3f4a, hair: 0x101010, style: 'hood' },
  { id: 'suit', name: 'Sharp Suit', skin: 0xf0c8a0, top: 0x1d2433, legs: 0x1d2433, hair: 0x5a3a1c, style: 'slick', tie: 0xb81f24 },
  { id: 'beach', name: 'Bay Shirt', skin: 0x9c6a42, top: 0xf2874b, legs: 0xe8dcc0, hair: 0x18120c, style: 'cap', hat: 0xf4f6fa },
  { id: 'track', name: 'Tracksuit', skin: 0xe8be96, top: 0xb81f24, legs: 0xb81f24, hair: 0xd9b46a, style: 'short', stripe: 0xffffff },
  { id: 'crew', name: 'Crew Vest', skin: 0x7a4e30, top: 0x2f3b2c, legs: 0x16181d, hair: 0x0c0c0c, style: 'beanie', hat: 0x16181d },
  { id: 'gold', name: 'Gold Rush', skin: 0xe2b48c, top: 0xe0a416, legs: 0x16181d, hair: 0x2a1c12, style: 'slick' },
  { id: 'mint', name: 'Mint Fit', skin: 0xb07a50, top: 0x3fd6a8, legs: 0xf4f6fa, hair: 0x241408, style: 'cap', hat: 0x3fd6a8 },
];

export const DAY = 20 * 60;        // one full day in seconds
export const START_HOUR = 10;

export const fmtCash = (n) => '$' + Math.round(n).toLocaleString('en-US');
