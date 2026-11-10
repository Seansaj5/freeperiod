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
  hp: 3, revives: 1, // three lives; each survivor can be revived once
  stamina: 100, drain: 19, regen: 14, regenDelay: 0.9, exhaustedUntil: 25,
  jump: 9.2, crawl: 1.4,
  downTime: 20, reviveTime: 3, reviveRange: 2.8,
  boostMul: 1.4, boostTime: 3, invulnTime: 1.6,
  pickupRange: 2.4, shardTime: 4.5, exitRange: 3.4,
  height: 2.4, radius: 0.5,
  waterMul: 0.62, gooMul: 0.5,
  burnTime: 1.2,   // lava: how long you are safe after getting burned
};

export const EXE = {
  jump: 10.5,
  atkRange: 3.3, atkDot: 0.25, atkCd: 1.0, lagGrace: 1.2,
  recoverTime: 2.0, recoverMul: 0.45,
  senseCd: 22, senseRange: 26, revealTime: 4.5,
  escapeMul: 1.08, corruptMul: 1.1,
  height: 3.0, radius: 0.6,
  disguiseCd: 15, popTime: 0.7,
};

export const CHARS = {
  bolt: {
    name: 'Bolt', role: 'Speedster', accent: '#ffd23d', walk: 7.0, sprint: 11.2,
    ability: 'dash', abilityName: 'Dash', cd: 8, dur: 0.32, dashSpeed: 28,
    desc: 'The fastest runner. Dash bursts you forward, and nothing can touch you mid-dash.',
  },
  pip: {
    name: 'Pip', role: 'Flyer', accent: '#ff9a2e', walk: 6.4, sprint: 10,
    ability: 'fly', abilityName: 'Fly', cd: 13, dur: 3,
    desc: 'Fly for 3 seconds. Hold Space to climb onto ledges and floating platforms.',
  },
  rook: {
    name: 'Rook', role: 'Brawler', accent: '#ff4d4d', walk: 6.2, sprint: 9.8,
    ability: 'punch', abilityName: 'Stun Punch', cd: 20, missCd: 4, dur: 2, range: 3.6,
    desc: 'Punch EXE up close to freeze it for 2 seconds.',
  },
  mira: {
    name: 'Mira', role: 'Hammer', accent: '#ff6fb5', walk: 6.4, sprint: 10,
    ability: 'bonk', abilityName: 'Bonk', cd: 15, missCd: 4, dur: 0.8, range: 3.8, knock: 16, reviveMul: 2,
    desc: 'Bonk EXE away with your mallet. You also revive teammates twice as fast.',
  },
};
export const CHAR_IDS = Object.keys(CHARS);

export const VARIANTS = {
  exe: {
    name: 'EXE', speed: 9.0, ability: 'lunge', abilityName: 'Lunge', cd: 7, dur: 0.45, lungeSpeed: 23,
    desc: 'The balanced hunter. Lunge forward and tear through anyone in the way.',
    ab2: 'hunt', ab2Name: 'Bloodhunt', cd2: 30, dur2: 6, huntMul: 1.3,
    desc2: 'For 6 seconds you run much faster and see everyone in your world.',
  },
  glitch: {
    name: 'Glitch.exe', speed: 8.6, ability: 'blink', abilityName: 'Blink', cd: 10, dist: 15,
    desc: 'Slower, but Blink teleports you 15 m ahead, straight through walls.',
    ab2: 'static', ab2Name: 'Static Field', cd2: 26, dur2: 6, radius: 9, slowMul: 0.5,
    desc2: 'Drop a glitch zone for 6 seconds: survivors inside move at half speed and cannot use abilities.',
  },
  grin: {
    name: 'Grin.exe', speed: 8.9, ability: 'fade', abilityName: 'Fade', cd: 18, dur: 6, fadeMul: 1.12,
    desc: 'Fade turns you almost invisible for 6 seconds. Attacking ends it.',
    ab2: 'decoy', ab2Name: 'Decoy', cd2: 20, dur2: 6, decoySpeed: 11,
    desc2: 'Send a fake Grin running at the nearest survivor. It bursts into static: harmless, but they will not know that.',
  },
};
export const VARIANT_IDS = Object.keys(VARIANTS);

// status bits sent with every player in every snapshot
export const F = {
  SPRINT: 1, AIR: 2, FLY: 4, ATK: 8, DASH: 16, STUN: 32, BOOST: 64, INVULN: 128,
  FADE: 256, REVEAL: 512, LUNGE: 1024, RECOVER: 2048, REVIVING: 4096, WATER: 8192,
  GOO: 16384, CARRY: 32768, POP: 65536, ICE: 131072,
  HIDDEN: 262144, QTE: 524288, HUNT: 1048576, SLOWED: 2097152,
};
export const ST = { alive: 0, down: 1, out: 2, esc: 3 };
export const PHASES = ['intro', 'play', 'escape', 'over'];

/** How fast someone moves right now. flags is a bitmask of F; phase is one of PHASES; w is the world. */
export function moveSpeed(role, kind, st, flags, phase, sprinting, w = 0, disguisedAs = null) {
  if (role === 'exe') {
    if (phase === 'intro' || flags & F.STUN || flags & F.POP) return 0;
    if (flags & F.HUNT && !disguisedAs) return VARIANTS[kind].speed * VARIANTS.exe.huntMul * (w === 1 ? EXE.corruptMul : 1);
    if (disguisedAs) return Math.min(sprinting ? CHARS[disguisedAs].sprint : CHARS[disguisedAs].walk, VARIANTS[kind].speed);
    let s = VARIANTS[kind].speed;
    if (phase === 'escape') s *= EXE.escapeMul;
    if (w === 1) s *= EXE.corruptMul;
    if (flags & F.RECOVER) s *= EXE.recoverMul;
    if (flags & F.FADE) s *= VARIANTS[kind].fadeMul || 1;
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
  if (flags & F.SLOWED) s *= VARIANTS.glitch.slowMul;
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
