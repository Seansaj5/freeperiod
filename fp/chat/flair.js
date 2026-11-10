// Profile flair (Nitro-style, free for everyone): the allowed ids, checks that mirror the database, name styles and badges.
// Pure data + functions so it runs in node tests; paintName and badgeSvg are the only helpers that touch the DOM.
// The drawings live in frames.js (avatar frames) and effects.js (profile card effects); their CSS is flair.css.

import { roleOfProfile } from './perms.js'; // (perms.js imports this file back; both only call each other inside functions)

// Global Constraints, verbatim. The database checks (0003_flair.sql, then 0009_symbiote_flair.sql for the symbiote set
// and the earned streak flair at the end of each list) use the same lists.
export const FONTS = Object.freeze(['bungee', 'outfit', 'press-start', 'orbitron', 'creepster', 'pacifico', 'symbiote']);
export const FRAMES = Object.freeze(['neon-ring', 'pulse', 'orbit', 'flame', 'frost', 'circuit', 'glitch', 'halo', 'thorns', 'sparkle',
  'wave', 'hex', 'crown', 'lightning', 'pixel', 'vortex', 'stars', 'shield', 'drip', 'eclipse',
  'symbiote', 'symbiote-red', 'symbiote-white', 'ooze', 'ember']);
export const EFFECTS = Object.freeze(['sparkles', 'snow', 'embers', 'glitch', 'stars', 'bubbles', 'lightning', 'confetti', 'matrix', 'aurora',
  'tendrils', 'goo', 'inferno']);
/** The symbiote set's profile effects (living black goo) take the name color as their accent; its frames come in colors. */
export const SYMBIOTE_EFFECTS = Object.freeze(['tendrils', 'goo']);
/**
 * Earned flair: worn only once unlocked by a daily login streak. The Bing Ball server writes earned ids into
 * game_stats.flair (members can't write game_stats) and the database refuses equipping one that isn't there
 * (0009_symbiote_flair.sql); the editor only shows the lock.
 */
export const EARNED = Object.freeze({ ember: Object.freeze({ days: 7 }), inferno: Object.freeze({ days: 30 }) });
export const FILLS = Object.freeze(['solid', 'gradient']);

/**
 * Badges the owner hands out (profiles.granted_badges, written only by the grant_badge RPC; 0011_badges.sql keeps the
 * same list and this order). Early Member is NOT here: the database decides it once, when the profile is created.
 */
export const GRANTED_BADGES = Object.freeze(['bug-hunter', 'helper', 'artist', 'tester', 'vip', 'og']);

export const DEFAULT_NAME_COLOR = '#eef2ff'; // the page text color (--text)
export const DEFAULT_NAME_COLOR2 = '#3de0ff'; // cyan, when a gradient has no second color yet
const HEX = /^#[0-9a-f]{6}$/;
export const isHex = (v) => typeof v === 'string' && HEX.test(v);

// font id -> CSS family stack (Bungee/Outfit come from style.css, the others from flair.css)
const FAMILY = {
  bungee: "'Bungee', 'Outfit', system-ui, sans-serif",
  outfit: "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
  'press-start': "'Press Start 2P', ui-monospace, monospace",
  orbitron: "'Orbitron', 'Outfit', system-ui, sans-serif",
  creepster: "'Creepster', 'Bungee', system-ui, sans-serif",
  pacifico: "'Pacifico', 'Outfit', cursive",
  symbiote: "'Rubik Wet Paint', 'Bungee', system-ui, sans-serif",
};

/** Picker labels (editor). */
export const FONT_LABELS = Object.freeze({
  bungee: 'Bungee', outfit: 'Outfit', 'press-start': 'Press Start', orbitron: 'Orbitron', creepster: 'Creepster', pacifico: 'Pacifico',
  symbiote: 'Symbiote',
});
export const FRAME_LABELS = Object.freeze({
  'neon-ring': 'Neon Ring', pulse: 'Pulse', orbit: 'Orbit', flame: 'Flame', frost: 'Frost', circuit: 'Circuit', glitch: 'Glitch',
  halo: 'Halo', thorns: 'Thorns', sparkle: 'Sparkle', wave: 'Wave', hex: 'Hex', crown: 'Crown', lightning: 'Lightning',
  pixel: 'Pixel', vortex: 'Vortex', stars: 'Starry Night', shield: 'Shield', drip: 'Slime Drip', eclipse: 'Eclipse',
  symbiote: 'Symbiote', 'symbiote-red': 'Red Symbiote', 'symbiote-white': 'White Symbiote', ooze: 'Living Ooze', ember: 'Ember',
});
export const EFFECT_LABELS = Object.freeze({
  sparkles: 'Sparkles', snow: 'Snowfall', embers: 'Embers', glitch: 'Glitch', stars: 'Shooting Stars', bubbles: 'Bubbles',
  lightning: 'Lightning', confetti: 'Confetti', matrix: 'Code Rain', aurora: 'Aurora', tendrils: 'Tendrils', goo: 'Goo Drip',
  inferno: 'Inferno',
});

const has = (list, v) => typeof v === 'string' && list.includes(v);

/** The earned flair ids on a profile (game_stats.flair, written by the Bing Ball server), as a Set of known ids. */
export function earnedFlair(profile) {
  const list = profile && profile.game_stats && profile.game_stats.flair;
  return new Set(Array.isArray(list) ? list.filter((id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(EARNED, id)) : []);
}
/** True when `id` is earned flair this profile hasn't unlocked yet (free flair is never locked). */
export const flairLocked = (profile, id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(EARNED, id) && !earnedFlair(profile).has(id);
/** "Reach a 7-day streak", for a locked earned id (empty for anything else). */
export const unlockHint = (id) => (Object.prototype.hasOwnProperty.call(EARNED, id) ? `Reach a ${EARNED[id].days}-day streak` : '');

/**
 * Checks the flair fields of a profile patch (other fields are ignored). null means "none / default" for every field
 * except name_glow, which must be true or false.
 * @returns {{ ok: boolean, errors: { field: string, message: string }[] }}
 */
export function validFlair(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, errors: [{ field: '', message: 'Flair must be an object' }] };
  }
  const errors = [];
  const bad = (field, message) => errors.push({ field, message });
  const own = (k) => Object.prototype.hasOwnProperty.call(patch, k);
  for (const k of ['name_color', 'name_color2', 'theme_a', 'theme_b']) {
    if (own(k) && patch[k] !== null && !isHex(patch[k])) bad(k, 'Colors look like #12ab3f');
  }
  if (own('name_font') && patch.name_font !== null && !has(FONTS, patch.name_font)) bad('name_font', 'Unknown font');
  if (own('name_fill') && !has(FILLS, patch.name_fill)) bad('name_fill', 'Fill is solid or gradient');
  if (own('name_glow') && typeof patch.name_glow !== 'boolean') bad('name_glow', 'Glow is on or off');
  if (own('frame') && patch.frame !== null && !has(FRAMES, patch.frame)) bad('frame', 'Unknown avatar frame');
  if (own('effect') && patch.effect !== null && !has(EFFECTS, patch.effect)) bad('effect', 'Unknown profile effect');
  return { ok: errors.length === 0, errors };
}

const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;

// Symbiote names: glossy black goo letters (Rubik Wet Paint's drips) with a wet highlight, an oily sheen, an outline in
// the accent (the name color; a gradient runs the sheen from color 1 to color 2) and a soft halo. The outline keeps black
// letters readable on the dark page, even at chat size; on a light card theme the black body reads by itself. Glow widens
// the halo. The three layers' sizes and positions are in flair.css ([data-font="symbiote"]).
function symbioteStyle(p, style, c1) {
  const c2 = p.name_fill === 'gradient' ? (isHex(p.name_color2) ? p.name_color2 : DEFAULT_NAME_COLOR2) : c1;
  style.backgroundImage = [
    'linear-gradient(180deg, rgba(255, 255, 255, 0) 31%, rgba(255, 255, 255, 0.72) 36%, rgba(255, 255, 255, 0.1) 41%, rgba(255, 255, 255, 0) 47%)',
    `linear-gradient(90deg, ${rgba(c1, 0.55)}, rgba(61, 224, 255, 0.3) 35%, rgba(255, 216, 74, 0.26) 62%, ${rgba(c2, 0.55)})`,
    'linear-gradient(180deg, #3d424e 0%, #101216 32%, #030304 60%, #0b0c10 84%, #23262e 100%)',
  ].join(', ');
  style.webkitTextStroke = `0.05em ${rgba(c1, 0.92)}`;
  style.filter = p.name_glow === true
    ? `drop-shadow(0 0 4px ${rgba(c1, 0.65)}) drop-shadow(0 0 10px ${rgba(c2, 0.45)})`
    : `drop-shadow(0 0 3px ${rgba(c1, 0.35)})`;
  return style;
}

/**
 * Inline style for a display name: { fontFamily, color, backgroundImage?, textShadow?, filter?, webkitTextStroke? }.
 * Gradient names also need the `fp-name` class with data-fill="gradient" (flair.css clips the gradient to the letters);
 * paintName does both. Gradient + glow uses drop-shadow filters, because a text shadow paints over gradient text.
 * The symbiote font always paints its goo layers that way (symbioteStyle).
 */
export function nameStyle(profile) {
  const p = profile || {};
  const c1 = isHex(p.name_color) ? p.name_color : DEFAULT_NAME_COLOR;
  const style = { fontFamily: FAMILY[has(FONTS, p.name_font) ? p.name_font : 'outfit'], color: c1 };
  if (p.name_font === 'symbiote') return symbioteStyle(p, style, c1);
  if (p.name_fill === 'gradient') {
    const c2 = isHex(p.name_color2) ? p.name_color2 : DEFAULT_NAME_COLOR2;
    style.backgroundImage = `linear-gradient(90deg, ${c1}, ${c2})`;
    if (p.name_glow === true) style.filter = `drop-shadow(0 0 5px ${rgba(c1, 0.55)}) drop-shadow(0 0 9px ${rgba(c2, 0.35)})`;
  } else if (p.name_glow === true) {
    style.textShadow = `0 0 6px ${rgba(c1, 0.75)}, 0 0 16px ${rgba(c1, 0.4)}`;
  }
  return style;
}

/** Applies nameStyle to an element (text is set by the caller with textContent). */
export function paintName(el, profile) {
  const s = nameStyle(profile);
  const font = profile && has(FONTS, profile.name_font) ? profile.name_font : 'outfit';
  el.classList.add('fp-name');
  el.dataset.font = font; // flair.css evens out sizes (Press Start 2P runs large)
  el.dataset.fill = s.backgroundImage ? 'gradient' : 'solid';
  el.style.fontFamily = s.fontFamily;
  el.style.color = s.color;
  el.style.backgroundImage = s.backgroundImage || '';
  el.style.textShadow = s.textShadow || '';
  el.style.filter = s.filter || '';
  el.style.webkitTextStroke = s.webkitTextStroke || '';
  return el;
}

const tierKey = (t) => (typeof t === 'string' ? t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) : '');

/**
 * Badge ids in display order (Discord-style row on the profile card):
 *   'owner' | 'mod'  (one or the other, from perms.js roleOfProfile)
 *   'bot'            Hallpass and any other is_bot account
 *   'early'          Early Member: profiles.early_member, which the database sets for the first 5 real members only
 *   granted          'bug-hunter', 'helper', 'artist', 'tester', 'vip', 'og' (GRANTED_BADGES order; the owner gives them)
 *   'bb:<tier key>'  Bing Ball ranked tier (Rookie is the unranked start: none)
 *   'streak:<days>'  the best daily-streak badge earned (game_stats.badges)
 * Every field is server-written; anything odd is dropped.
 */
export function badgesFor(profile) {
  const p = profile || {};
  const out = [];
  const role = roleOfProfile(p); // one source of truth: banned or demoted staff get no badge
  if (role === 'owner') out.push('owner');
  else if (role === 'mod') out.push('mod');
  if (p.is_bot === true) out.push('bot');
  if (p.early_member === true && role !== 'owner' && p.is_bot !== true) out.push('early'); // the database never marks these; belt and braces
  const granted = Array.isArray(p.granted_badges) ? p.granted_badges : [];
  for (const id of GRANTED_BADGES) if (granted.includes(id)) out.push(id);
  const tier = tierKey(p.game_stats && p.game_stats.bb && p.game_stats.bb.tier);
  if (tier && tier !== 'rookie') out.push('bb:' + tier);
  const sd = streakDays(p.game_stats && p.game_stats.badges);
  if (sd) out.push('streak:' + sd); // kept after a streak breaks
  return out;
}

/** The highest streak milestone in game_stats.badges (['streak-3', 'streak-7']), or 0. The server writes them; anything odd is dropped. */
export function streakDays(badges) {
  let top = 0;
  for (const b of Array.isArray(badges) ? badges : []) {
    const m = typeof b === 'string' ? /^streak-(\d{1,5})$/.exec(b) : null;
    if (m && Number(m[1]) > top) top = Number(m[1]);
  }
  return top;
}

// Bing Ball ranked tier keys (shared/modes.js TIERS) with the hub's colors (same as the home leaderboard, no pink/purple).
const TIERS = {
  contender: ['Contender', '#6fe0a0'], egoist: ['Egoist', '#3de0ff'], striker: ['Striker', '#5b9bff'],
  ace: ['Ace', '#ffb020'], worldclass: ['World Class', '#ff7a3d'], newgen: ['New Gen', '#ffe066'],
};
// The streak milestones (Bing Ball server fpstreak.js: 3, 7, 14, 30, 50, 100 days): the flame heats up with each one.
const STREAK_TIERS = [[100, '#ffe066'], [50, '#c6ff3d'], [30, '#3de0ff'], [14, '#ff4b3a'], [7, '#ff7a3d'], [3, '#ffb020']];
const streakColor = (n) => (STREAK_TIERS.find(([d]) => n >= d) || STREAK_TIERS[STREAK_TIERS.length - 1])[1];
// label (short, also the compact name), color, the tooltip's title and its line under it
const BADGES = {
  owner: { label: 'Owner', color: '#ffc847', title: 'Owner', about: 'Runs Free Period' },
  mod: { label: 'Mod', color: '#4d8dff', title: 'Moderator', about: 'Keeps chat friendly' },
  bot: { label: 'Bot', color: '#3de0ff', title: 'Bot', about: 'Free Period’s helper bot' },
  early: { label: 'Early Member', color: '#ff9d2e', title: 'Early Member', about: 'One of the first 5 members' },
  'bug-hunter': { label: 'Bug Hunter', color: '#5ee87a', title: 'Bug Hunter', about: 'Found bugs and reported them' },
  helper: { label: 'Helper', color: '#ff6a55', title: 'Helper', about: 'Helps people out in chat' },
  artist: { label: 'Artist', color: '#ffd166', title: 'Artist', about: 'Made art for Free Period' },
  tester: { label: 'Tester', color: '#3dffc5', title: 'Tester', about: 'Tries new games before anyone else' },
  vip: { label: 'VIP', color: '#9ee7ff', title: 'VIP', about: 'A Free Period VIP' },
  og: { label: 'OG', color: '#c6ff3d', title: 'OG', about: 'Here since the very start' },
};

/** { label, color } for a badge id from badgesFor, or null. (Streaks add { streak }, ranks { tier }.) */
export function badgeInfo(id) {
  if (typeof id !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(BADGES, id)) return { label: BADGES[id].label, color: BADGES[id].color };
  if (id.startsWith('streak:')) {
    const n = Math.floor(Number(id.slice(7)));
    return n > 0 ? { label: '\u{1F525} ' + n + '-day streak', color: streakColor(n), streak: n } : null;
  }
  if (!id.startsWith('bb:')) return null;
  const key = tierKey(id.slice(3));
  if (!key) return null;
  const t = TIERS[key];
  return t ? { label: t[0], color: t[1], tier: key } : { label: key[0].toUpperCase() + key.slice(1), color: '#8b95a7', tier: key };
}

const fmtDay = (iso) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};
/**
 * What a badge says on hover / tap: { title, detail, text } (text = both, for aria-label), with the "since" date where
 * the profile has one (Early Member: the day they joined). profile is optional. null for an unknown id.
 */
export function badgeLabel(id, profile) {
  const info = badgeInfo(id);
  if (!info) return null;
  const p = profile || {};
  let title, detail;
  if (Object.prototype.hasOwnProperty.call(BADGES, id)) {
    title = BADGES[id].title;
    detail = BADGES[id].about;
    if (id === 'early') { const d = fmtDay(p.joined_at); if (d) detail += ' · since ' + d; }
    if (id === 'bot' && p.username === 'hallpass') detail = 'Hallpass, Free Period’s helper bot';
  } else if (info.streak) {
    title = info.streak + '-day streak';
    detail = 'Best daily login streak';
  } else {
    title = 'Bing Ball: ' + info.label;
    const lv = Math.floor(Number(p.game_stats && p.game_stats.bb && p.game_stats.bb.level));
    detail = 'Ranked tier' + (lv > 0 ? ' · Level ' + lv : '');
  }
  return { title, detail, text: title + '. ' + detail };
}

// ---------- badge glyphs ----------
// Each glyph is a list of shapes on a 24 x 24 grid: { d, f } filled, { d, s, w } stroked (round caps and joins unless
// cap: 'butt'), o = opacity, r: 'evenodd'. Colors: 'c' = the badge color, 'w' = white, 'k' = black (used see-through
// for shading), 'K' = solid ink (letters); anything else is a literal color.
const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const GLYPHS = {
  owner: [ // a gold crown with a dark band and three jewels
    { d: 'M3.2 8.2a.6.6 0 0 1 .95-.6L8 10.6l3.5-5.9a.6.6 0 0 1 1 0l3.5 5.9 3.85-3a.6.6 0 0 1 .95.6l-1.7 9.4a1 1 0 0 1-1 .8H5.9a1 1 0 0 1-1-.8z', f: 'c' },
    { d: 'M4.5 15.4h15l-.4 2.2a1 1 0 0 1-1 .8H5.9a1 1 0 0 1-1-.8z', f: 'k', o: 0.28 },
    { d: circ(12, 12.2, 1.3), f: 'w', o: 0.95 }, { d: circ(7.7, 13, 0.85), f: 'w', o: 0.75 }, { d: circ(16.3, 13, 0.85), f: 'w', o: 0.75 },
  ],
  mod: [ // a blue shield with a check
    { d: 'M12 2.4 20 5.4v6c0 5.1-3.4 9.1-8 10.5-4.6-1.4-8-5.4-8-10.5v-6z', f: 'c' },
    { d: 'M12 2.4 20 5.4v6c0 5.1-3.4 9.1-8 10.5z', f: 'k', o: 0.2 },
    { d: 'M8.3 12.1l2.6 2.6 4.9-5.1', s: 'w', w: 2.3 },
  ],
  bot: [ // a robot head: antenna, ears, a dark visor with two lit eyes
    { d: 'M12 4.2v2.8', s: 'c', w: 1.8 }, { d: circ(12, 3.2, 1.7), f: 'c' },
    { d: 'M8 6.6h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4z', f: 'c' },
    { d: 'M2.2 11.4a1.2 1.2 0 0 1 1.2-1.2h.9v5.4h-.9a1.2 1.2 0 0 1-1.2-1.2z', f: 'c' },
    { d: 'M21.8 11.4a1.2 1.2 0 0 0-1.2-1.2h-.9v5.4h.9a1.2 1.2 0 0 0 1.2-1.2z', f: 'c' },
    { d: 'M8.6 9.6h6.8a2.2 2.2 0 0 1 2.2 2.2v2.4a2.2 2.2 0 0 1-2.2 2.2H8.6a2.2 2.2 0 0 1-2.2-2.2v-2.4a2.2 2.2 0 0 1 2.2-2.2z', f: 'k', o: 0.6 },
    { d: circ(9.7, 13, 1.3), f: 'w' }, { d: circ(14.3, 13, 1.3), f: 'w' },
  ],
  early: [ // a sunrise: the sun coming up over the horizon
    { d: 'M12 3v2.6M5.3 6.1l1.8 1.8M18.7 6.1l-1.8 1.8M2.6 12.4h2.5M18.9 12.4h2.5', s: 'c', w: 1.9 },
    { d: 'M5.8 16.8a6.2 6.2 0 0 1 12.4 0z', f: 'c' },
    { d: 'M8.6 15a3.6 3.6 0 0 1 3.4-2.6', s: 'w', w: 1.3, o: 0.75 },
    { d: 'M3 19.4h18', s: 'c', w: 2.1 },
  ],
  'bug-hunter': [ // a beetle: six legs, antennae, a split shell with spots
    { d: 'M7.6 12.3 4.3 10.8M7.2 15.3H3.8M7.8 18.2l-3 1.9M16.4 12.3l3.3-1.5M16.8 15.3h3.4M16.2 18.2l3 1.9M10.5 5.7 8.9 3.4M13.5 5.7l1.6-2.3', s: 'c', w: 1.6 },
    { d: circ(12, 7.3, 2.6), f: 'c' },
    { d: 'M12 9.3c3 0 5 2.6 5 5.8s-2 6-5 6-5-2.8-5-6 2-5.8 5-5.8z', f: 'c' },
    { d: 'M12 10.6v9.6', s: 'k', w: 1.2, o: 0.45 },
    { d: circ(9.9, 14, 0.95), f: 'k', o: 0.38 }, { d: circ(14.1, 16.7, 0.95), f: 'k', o: 0.38 }, { d: circ(9.9, 17.7, 0.7), f: 'k', o: 0.3 },
  ],
  helper: [ // a lifebuoy: the ring with four white bands
    { d: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4z', f: 'c', r: 'evenodd' },
    { d: 'M14.97 9.03l3.2-3.2M9.03 9.03l-3.2-3.2M9.03 14.97l-3.2 3.2M14.97 14.97l3.2 3.2', s: 'w', w: 3.3, cap: 'butt' },
  ],
  artist: [ // a paint palette with four dabs of paint
    { d: 'M12 3.2c-5 0-8.8 3.7-8.8 8.4 0 4.6 3.7 8.4 8.4 8.4 1.4 0 2.3-.9 2.3-2 0-.6-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c2.7 0 4.8-2.1 4.8-4.8C21.2 6.6 17.1 3.2 12 3.2z', f: 'c' },
    { d: circ(7.3, 11.6, 1.6), f: '#3de0ff' }, { d: circ(9.2, 7.4, 1.6), f: '#62ff8f' }, { d: circ(14.1, 6.7, 1.6), f: '#ff6a55' },
    { d: circ(17.6, 9.9, 1.6), f: '#4d8dff' },
  ],
  tester: [ // a lab flask, half full, bubbling
    { d: 'M10.4 3.6v5.2L5.2 17.9A2 2 0 0 0 6.9 21h10.2a2 2 0 0 0 1.7-3.1l-5.2-9.1V3.6', f: 'c', o: 0.22 },
    { d: 'M7.3 14.4h9.4l2.1 3.5A2 2 0 0 1 17.1 21H6.9a2 2 0 0 1-1.7-3.1z', f: 'c' },
    { d: 'M10.4 3.6v5.2L5.2 17.9A2 2 0 0 0 6.9 21h10.2a2 2 0 0 0 1.7-3.1l-5.2-9.1V3.6M9.2 3.4h5.6', s: 'c', w: 1.7 },
    { d: circ(10.4, 17.6, 1.05), f: 'w', o: 0.85 }, { d: circ(13.7, 16.3, 0.75), f: 'w', o: 0.75 }, { d: circ(12.5, 11.8, 0.7), f: 'c' },
  ],
  vip: [ // a cut diamond: light top facets, shaded side
    { d: 'M7.2 4h9.6l4.6 5.4L12 20.6 2.6 9.4z', f: 'c' },
    { d: 'M7.2 4 9.4 9.4H2.6z', f: 'w', o: 0.5 }, { d: 'M12 4 9.4 9.4h5.2z', f: 'w', o: 0.75 }, { d: 'M16.8 4l-2.2 5.4h6.8z', f: 'w', o: 0.22 },
    { d: 'M9.4 9.4h5.2L12 20.6z', f: 'w', o: 0.28 }, { d: 'M14.6 9.4h6.8L12 20.6z', f: 'k', o: 0.2 },
  ],
  og: [ // a key cap with OG on it
    { d: 'M6.2 3.6h11.6a2.6 2.6 0 0 1 2.6 2.6v11.6a2.6 2.6 0 0 1-2.6 2.6H6.2a2.6 2.6 0 0 1-2.6-2.6V6.2a2.6 2.6 0 0 1 2.6-2.6z', f: 'c' },
    { d: 'M5.2 17.2h13.6v.6a1.6 1.6 0 0 1-1.6 1.6H6.8a1.6 1.6 0 0 1-1.6-1.6z', f: 'k', o: 0.22 },
    { d: circ(8.8, 11.6, 2.6), s: 'K', w: 2 },
    { d: 'M17.1 9.8A2.6 2.6 0 1 0 17.8 11.6H15.6', s: 'K', w: 2 },
  ],
  streak: [ // a flame with a hot core
    { d: 'M12.6 2.6c.4 2.6 1.9 4.2 3.5 5.9 1.7 1.8 3.2 3.8 3.2 6.6A7.3 7.3 0 0 1 12 22.4a7.3 7.3 0 0 1-7.3-7.3c0-2.5 1-4.4 2.5-5.9.4 1.6 1.2 2.6 2.4 3.2-.5-3.9.8-7.3 3-9.8z', f: 'c' },
    { d: 'M12.3 11.8c.3 1.5 1.3 2.4 2.1 3.4.6.8 1 1.6 1 2.6a3.4 3.4 0 0 1-6.8 0c0-1.4.6-2.4 1.4-3.2.2.8.6 1.3 1.2 1.6-.2-1.7.2-3.1 1.1-4.4z', f: 'w', o: 0.85 },
  ],
  rank: [ // a trophy
    { d: 'M7 5.2H4.4v1.4a3.4 3.4 0 0 0 3.3 3.4M17 5.2h2.6v1.4a3.4 3.4 0 0 1-3.3 3.4', s: 'c', w: 1.7 },
    { d: 'M7 3.4h10v5.6a5 5 0 0 1-10 0z', f: 'c' },
    { d: 'M10.7 13.6h2.6v3.6h-2.6z', f: 'c' },
    { d: 'M7.4 17.4h9.2a1 1 0 0 1 1 1v2.4H6.4v-2.4a1 1 0 0 1 1-1z', f: 'c' },
    { d: 'M9.4 5.4v3.2a2.6 2.6 0 0 0 1.1 2.1', s: 'w', w: 1.2, o: 0.6 },
    { d: 'M8.8 19.2h6.4', s: 'k', w: 1, o: 0.35 },
  ],
};
const INK = { w: '#ffffff', k: '#000000', K: '#0a0f14' };

/** The drawing of a badge id: { color, shapes } with every color resolved (see GLYPHS), or null for an unknown id. */
export function badgeGlyph(id) {
  const info = badgeInfo(id);
  if (!info) return null;
  const key = Object.prototype.hasOwnProperty.call(GLYPHS, id) ? id : info.streak ? 'streak' : 'rank';
  const col = (t) => (t === 'c' ? info.color : INK[t] || t);
  return { color: info.color, shapes: GLYPHS[key].map((g) => ({ ...g, ...(g.f ? { f: col(g.f) } : {}), ...(g.s ? { s: col(g.s) } : {}) })) };
}

/** An inline <svg class="fp-badge-ic"> of a badge (decorative: aria-hidden; the caller labels it), or null. Browser only. */
export function badgeSvg(id, size = 20) {
  const g = badgeGlyph(id);
  if (!g) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'fp-badge-ic');
  svg.style.setProperty('--bc', g.color);
  for (const sh of g.shapes) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', sh.d);
    if (sh.f) { path.setAttribute('fill', sh.f); if (sh.r) path.setAttribute('fill-rule', sh.r); } else path.setAttribute('fill', 'none');
    if (sh.s) {
      path.setAttribute('stroke', sh.s);
      path.setAttribute('stroke-width', String(sh.w || 1.5));
      path.setAttribute('stroke-linecap', sh.cap || 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    if (sh.o != null) path.setAttribute('opacity', String(sh.o));
    svg.append(path);
  }
  return svg;
}

/** The profile card's theme gradient (top to bottom), or null when no theme color is set. */
export function cardTheme(profile) {
  const p = profile || {};
  const a = isHex(p.theme_a) ? p.theme_a : null;
  const b = isHex(p.theme_b) ? p.theme_b : null;
  if (!a && !b) return null;
  return `linear-gradient(180deg, ${a || b}, ${b || a})`;
}
