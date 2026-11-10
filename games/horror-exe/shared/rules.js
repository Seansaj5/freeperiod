// Every number that decides how horror.exe plays. The server and the browser both read this file,
// so a change here changes the game everywhere.

export const GRAVITY = 26;

export const ROUND = {
  INTRO: 8,        // seconds before EXE is let loose
  PLAY: 300,       // the clock survivors have to last
  ESCAPE: 45,      // once the gates open, how long survivors have to reach one
  RESULTS: 10,     // results screen before the room goes back to the lobby
  SHARDS: 3,       // Dreamy Hills task: shards to absorb (normal world)
  LIT: 3,          // how many shards glow at once
  RELIGHT: 3,      // seconds before the next shard lights up after one is absorbed
  EXITS: 2,        // escape gates that open each round (out of 4, corrupted world only)
  SURVIVORS: 4,    // bots fill in up to this many survivors
  MAX_PLAYERS: 6,  // people per room (1 EXE + 5 survivors)
};

// the two worlds: everyone starts in the normal one; rift portals swap you between them
export const W = { normal: 0, corrupt: 1 };
export const PORTAL = { range: 2.0, cooldown: 4 };

// one task per zone; all five open the gates early
export const TASKS = [
  { id: 'shards', zone: 'Dreamy Hills', w: 0, label: 'Absorb the shards' },
  { id: 'valves', zone: 'Toxic Works', w: 0, label: 'Turn the valves' },
  { id: 'panels', zone: 'Neon Jackpot', w: 1, label: 'Light the jackpot panels' },
  { id: 'core', zone: 'Frostbite Peak', w: 1, label: 'Bring the fire core to the engine' },
  { id: 'bells', zone: 'Ember Ruins', w: 1, label: 'Ring the bells' },
];
// lockers: hide from EXE (and its Sense), but not for too long
export const HIDE = { range: 1.9, max: 15, warn: 10, seenRange: 12, cooldown: 4 };
// the quick-time minigame when EXE drags you out of a locker
export const QTE = { prompts: 6, ring0: 1.05, ring1: 0.62, timeout: 12, botWin: 0.55 };
export const TASK = { valveTime: 5, valveRange: 2.2, panelRange: 1.7, bellRange: 2.3, coreRange: 2.0, engineRange: 3.5, carryMul: 0.8 };

export const SURV = {
  hp: 300, heart: 100, revives: 1, // health: three hearts of 100; each survivor can be revived once (back with 1 heart)
  stamina: 100, drain: 19, regen: 14, regenDelay: 0.9, exhaustedUntil: 25,
  jump: 9.2, crawl: 1.4,
  downTime: 20, reviveTime: 3, reviveRange: 2.8,
  boostMul: 1.4, boostPer100: 2.4, invulnBase: 0.4, invulnPer100: 0.55, // after a hit: a speed burst and a moment of safety, both scale with damage
  lavaDmg: 50, qteDmg: 100,
  pickupRange: 2.4, shardTime: 4.5, exitRange: 3.4,
  height: 2.4, radius: 0.5,
  waterMul: 0.62, gooMul: 0.5,
  burnTime: 1.2,   // lava: how long you are safe after getting burned
};

export const EXE = {
  jump: 10.5,
  atkDot: 0.25, lagGrace: 1.2, recoverMul: 0.5, slowMul: 0.6,
  senseCd: 22, senseRange: 26, revealTime: 4.5,
  escapeMul: 1.08, corruptMul: 1.1,
  height: 3.0, radius: 0.6,
  disguiseCd: 15, popTime: 0.7,
};

// Awakening (monsters at level 10): a meter fills during the round; full = press V for 25 s of super mode
export const AWAKEN = { dur: 25, passive: 0.9, perHit: 10, perDown: 25, screamRange: 10, screamStun: 1.4 };

// levels: XP per round for the character or monster you played; level 10 unlocks Q (survivors) / Awakening (monsters)
export const LEVEL = {
  max: 10,
  need: (lv) => 150 + 60 * (lv - 1), // XP from level lv to lv + 1
  surv: { round: 60, task: 25, revive: 40, escape: 120, shard: 0 },
  exe: { round: 60, hit: 6, down: 40, win: 150 },
};
export function levelOf(xp) {
  let lv = 1, left = Math.max(0, xp | 0);
  while (lv < LEVEL.max && left >= LEVEL.need(lv)) { left -= LEVEL.need(lv); lv++; }
  return { lv, into: left, need: lv < LEVEL.max ? LEVEL.need(lv) : 0 };
}

export const CHARS = {
  bolt: {
    name: 'Bolt', role: 'Speedster', accent: '#ffd23d', walk: 7.0, sprint: 11.2,
    ability: 'dash', abilityName: 'Dash', cd: 8, dur: 0.32, dashSpeed: 28,
    desc: 'The fastest runner. Dash bursts you forward, and nothing can touch you mid-dash.',
    r: { id: 'wind', name: 'Second Wind', cd: 20, dur: 3, desc: 'Full stamina and a 3 s speed burst.' },
    q: { id: 'after', name: 'Afterimage', cd: 25, dur: 3, desc: 'A fake you runs straight ahead while you turn invisible for 3 s.' },
  },
  pip: {
    name: 'Pip', role: 'Flyer', accent: '#ff9a2e', walk: 6.4, sprint: 10,
    ability: 'fly', abilityName: 'Fly', cd: 13, dur: 3,
    desc: 'Fly for 3 seconds. Hold Space to climb onto ledges and floating platforms.',
    r: { id: 'wrench', name: 'Wrench Toss', cd: 12, missCd: 5, range: 16, dur: 3, desc: 'Throw a wrench: EXE is slowed for 3 s.' },
    q: { id: 'turbo', name: 'Turbo Gadget', cd: 35, dur: 8, range: 10, desc: 'For 8 s, you and teammates near you do tasks twice as fast.' },
  },
  rook: {
    name: 'Rook', role: 'Brawler', accent: '#ff4d4d', walk: 6.2, sprint: 9.8,
    ability: 'punch', abilityName: 'Stun Punch', cd: 20, missCd: 4, dur: 2, range: 3.6,
    desc: 'Punch EXE up close to freeze it for 2 seconds.',
    r: { id: 'pound', name: 'Ground Pound', cd: 18, missCd: 6, range: 5.5, dur: 2, knock: 14, desc: 'Slam the ground: EXE nearby is thrown back and slowed.' },
    q: { id: 'iron', name: 'Iron Body', cd: 30, dur: 4, desc: 'Take no damage for 4 s.' },
  },
  mira: {
    name: 'Mira', role: 'Hammer', accent: '#ff6fb5', walk: 6.4, sprint: 10,
    ability: 'bonk', abilityName: 'Bonk', cd: 15, missCd: 4, dur: 0.8, range: 3.8, knock: 16, reviveMul: 2,
    desc: 'Bonk EXE away with your mallet. You also revive teammates twice as fast.',
    r: { id: 'heal', name: 'Heart Toss', cd: 28, range: 9, amount: 100, desc: 'Heal the most hurt teammate near you (or yourself) by 1 heart.' },
    q: { id: 'spin', name: 'Hammer Spin', cd: 25, range: 4.5, dur: 1.5, knock: 12, desc: 'Spin your mallet: stuns everything around you.' },
  },
};
export const CHAR_IDS = Object.keys(CHARS);

// the monsters: 5 moves each (click + E, R, Q, F), a shared disguise (G) and, at level 10, an Awakening (V)
export const VARIANTS = {
  exe: {
    name: 'EXE', role: 'Speedster', speed: 10.2, dmg: 35, atkCd: 0.45, range: 3.0, recover: 0.35,
    desc: 'The fastest hunter. Light hits, thrown very fast.',
    atkName: 'Rapid Claws',
    moves: {
      abl: { id: 'dash', name: 'Dash Strike', cd: 7, dur: 0.5, speed: 30, dmg: 35, desc: 'Tear forward, slashing everyone you pass.' },
      ab2: { id: 'hunt', name: 'Bloodhunt', cd: 30, dur: 6, mul: 1.25, desc: 'For 6 s you are faster and see everyone in your world.' },
      ab3: { id: 'echo', name: 'Echo', cd: 18, range: 30, dur: 4.5, desc: 'Reveal survivors who are running or close by.' },
      ab4: { id: 'spin', name: 'Spin Rush', cd: 16, dur: 3, mul: 1.6, dmg: 25, desc: 'Roll as a spinning blade for 3 s, smashing anyone you touch.' },
    },
    awake: { name: 'Overdrive', speedMul: 1.3, dmgMul: 1.45, cdMul: 0.5, desc: 'Faster still, harder claws, half cooldowns, and runners near you are always revealed.' },
  },
  glitch: {
    name: 'Glitch.exe', role: 'Wildcard', speed: 9.2, dmg: 55, atkCd: 0.9, range: 3.2, recover: 0.9,
    desc: 'Unpredictable. Medium speed, medium hits, and tricks nobody can read.',
    atkName: 'Static Slash',
    moves: {
      abl: { id: 'blink', name: 'Blink', cd: 10, dist: 15, desc: 'Teleport 15 m ahead, straight through walls.' },
      ab2: { id: 'static', name: 'Static Field', cd: 26, dur: 6, radius: 9, slowMul: 0.5, desc: 'A glitch zone for 6 s: survivors inside are slowed and cannot use abilities.' },
      ab3: { id: 'ping', name: 'Corrupt Ping', cd: 20, dur: 2.5, desc: 'See every survivor in your world for a moment, but they see you too.' },
      ab4: { id: 'dice', name: 'Roll the Dice', cd: 18, desc: 'Something random: warp behind someone, swap places, flip their controls, or a static storm.' },
    },
    awake: { name: 'Fatal Error', speedMul: 1.15, dmgMul: 1.35, cdMul: 0.45, desc: 'Blink almost nonstop, your static fields follow you, and every dice roll happens twice.' },
  },
  grin: {
    name: 'Grin.exe', role: 'Brute', speed: 9.0, dmg: 110, atkCd: 1.1, range: 4.0, recover: 1.1,
    desc: 'The slowest, and the heaviest hitter by far.',
    atkName: 'Crushing Grab',
    moves: {
      abl: { id: 'fade', name: 'Fade', cd: 18, dur: 6, mul: 1.12, desc: 'Almost invisible for 6 s. Attacking ends it.' },
      ab2: { id: 'decoy', name: 'Decoy', cd: 20, dur: 6, speed: 11, desc: 'A fake Grin runs at the nearest survivor and bursts into static.' },
      ab3: { id: 'scent', name: 'Scent', cd: 20, dur: 6, desc: 'Smell the most hurt survivor in your world and see them for 6 s.' },
      ab4: { id: 'reach', name: 'Long Reach', cd: 9, missCd: 4, range: 10, dmg: 30, desc: 'Your arm stretches out and drags a survivor right up to you.' },
    },
    awake: { name: 'Wide Smile', speedMul: 1.15, dmgMul: 1.45, cdMul: 0.6, desc: 'Bigger and harder hitting, a scream that freezes everyone near you, and triple decoys.' },
  },
};
export const VARIANT_IDS = Object.keys(VARIANTS);

// status bits sent with every player in every snapshot
export const F = {
  SPRINT: 1, AIR: 2, FLY: 4, ATK: 8, DASH: 16, STUN: 32, BOOST: 64, INVULN: 128,
  FADE: 256, REVEAL: 512, LUNGE: 1024, RECOVER: 2048, REVIVING: 4096, WATER: 8192,
  GOO: 16384, CARRY: 32768, POP: 65536, ICE: 131072,
  HIDDEN: 262144, QTE: 524288, HUNT: 1048576, SLOWED: 2097152,
  SPIN: 4194304, AWAKE: 8388608, INVIS: 16777216, IRON: 33554432, INVERT: 67108864, TURBO: 134217728, PINGED: 268435456, SLOWX: 536870912,
};
export const ST = { alive: 0, down: 1, out: 2, esc: 3 };
export const PHASES = ['intro', 'play', 'escape', 'over'];

/** How fast someone moves right now. flags is a bitmask of F; phase is one of PHASES; w is the world. */
export function moveSpeed(role, kind, st, flags, phase, sprinting, w = 0, disguisedAs = null) {
  if (role === 'exe') {
    if (phase === 'intro' || flags & F.STUN || flags & F.POP) return 0;
    const v = VARIANTS[kind];
    if (disguisedAs) return Math.min(sprinting ? CHARS[disguisedAs].sprint : CHARS[disguisedAs].walk, v.speed);
    let s = v.speed;
    if (phase === 'escape') s *= EXE.escapeMul;
    if (w === 1) s *= EXE.corruptMul;
    if (flags & F.AWAKE) s *= v.awake.speedMul;
    if (flags & F.HUNT) s *= VARIANTS.exe.moves.ab2.mul;
    if (flags & F.SPIN) s *= VARIANTS.exe.moves.ab4.mul;
    if (flags & F.FADE) s *= VARIANTS.grin.moves.abl.mul;
    if (flags & F.RECOVER) s *= EXE.recoverMul;
    if (flags & F.SLOWX) s *= EXE.slowMul;
    if (flags & F.GOO) s *= SURV.gooMul;
    return s;
  }
  if (st === ST.down) return SURV.crawl;
  if (st !== ST.alive || flags & (F.HIDDEN | F.QTE)) return 0;
  const c = CHARS[kind];
  let s = sprinting ? c.sprint : c.walk;
  if (flags & F.BOOST) s *= SURV.boostMul;
  if (flags & F.WATER) s *= SURV.waterMul;
  if (flags & F.GOO) s *= SURV.gooMul;
  if (flags & F.CARRY) s *= TASK.carryMul;
  if (flags & F.SLOWED) s *= VARIANTS.glitch.moves.ab2.slowMul;
  return s;
}

/** Stamina for a survivor: s = { stamina, exhausted, rest }. Returns whether they are actually sprinting. */
export function tickStamina(s, wantsSprint, moving, dt) {
  const sprinting = wantsSprint && moving && !s.exhausted && s.stamina > 0;
  if (sprinting) {
    s.stamina = Math.max(0, s.stamina - SURV.drain * dt);
    s.rest = 0;
    if (s.stamina <= 0) s.exhausted = true;
  } else {
    s.rest += dt;
    if (s.rest > SURV.regenDelay) s.stamina = Math.min(SURV.stamina, s.stamina + SURV.regen * dt);
    if (s.exhausted && s.stamina >= SURV.exhaustedUntil) s.exhausted = false;
  }
  return sprinting;
}
