// Every number that decides how horror.exe plays. The server and the browser both read this file,
// so a change here changes the game everywhere.

export const GRAVITY = 26;

export const ROUND = {
  INTRO: 8,        // seconds before EXE is let loose
  PLAY: 180,       // the clock survivors have to last
  ESCAPE: 30,      // once the exits open, how long survivors have to reach one
  RESULTS: 10,     // results screen before the room goes back to the lobby
  SHARDS: 8,       // shards hidden each round; collecting all of them opens the exits early
  LIT: 4,          // how many shards glow (and can be absorbed) at once
  RELIGHT: 3,      // seconds before the next shard lights up after one is absorbed
  EXITS: 2,        // exits that open each round (out of 4 spots)
  SURVIVORS: 4,    // bots fill in up to this many survivors
  MAX_PLAYERS: 6,  // people per room (1 EXE + 5 survivors)
};

export const SURV = {
  hp: 2,
  stamina: 100, drain: 19, regen: 14, regenDelay: 0.9, exhaustedUntil: 25,
  jump: 9.2, crawl: 1.4,
  downTime: 20, reviveTime: 3, reviveRange: 2.8,
  boostMul: 1.4, boostTime: 3, invulnTime: 1.6,
  pickupRange: 2.4, shardTime: 4.5, exitRange: 3.4,
  height: 2.4, radius: 0.5,
  waterMul: 0.62,
};

export const EXE = {
  jump: 10.5,
  atkRange: 3.3, atkDot: 0.25, atkCd: 1.0, lagGrace: 1.2,
  recoverTime: 2.0, recoverMul: 0.45,
  senseCd: 22, senseRange: 26, revealTime: 4.5,
  escapeMul: 1.08,
  height: 3.0, radius: 0.6,
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
  },
  glitch: {
    name: 'Glitch.exe', speed: 8.6, ability: 'blink', abilityName: 'Blink', cd: 10, dist: 15,
    desc: 'Slower, but Blink teleports you 15 m ahead, straight through walls.',
  },
  grin: {
    name: 'Grin.exe', speed: 8.9, ability: 'fade', abilityName: 'Fade', cd: 18, dur: 6, fadeMul: 1.12,
    desc: 'Fade turns you almost invisible for 6 seconds. Attacking ends it.',
  },
};
export const VARIANT_IDS = Object.keys(VARIANTS);

// status bits sent with every player in every snapshot
export const F = {
  SPRINT: 1, AIR: 2, FLY: 4, ATK: 8, DASH: 16, STUN: 32, BOOST: 64, INVULN: 128,
  FADE: 256, REVEAL: 512, LUNGE: 1024, RECOVER: 2048, REVIVING: 4096, WATER: 8192,
};
export const ST = { alive: 0, down: 1, out: 2, esc: 3 };
export const PHASES = ['intro', 'play', 'escape', 'over'];

/** How fast someone moves right now. flags is a bitmask of F; phase is one of PHASES. */
export function moveSpeed(role, kind, st, flags, phase, sprinting) {
  if (role === 'exe') {
    if (phase === 'intro' || flags & F.STUN) return 0;
    let s = VARIANTS[kind].speed;
    if (phase === 'escape') s *= EXE.escapeMul;
    if (flags & F.RECOVER) s *= EXE.recoverMul;
    if (flags & F.FADE) s *= VARIANTS[kind].fadeMul || 1;
    return s;
  }
  if (st === ST.down) return SURV.crawl;
  if (st !== ST.alive) return 0;
  const c = CHARS[kind];
  let s = sprinting ? c.sprint : c.walk;
  if (flags & F.BOOST) s *= SURV.boostMul;
  if (flags & F.WATER) s *= SURV.waterMul;
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
