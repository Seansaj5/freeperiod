// Profile flair (Nitro-style, free for everyone): the allowed ids, checks that mirror the database, name styles and badges.
// Pure data + functions so it runs in node tests; paintName is the only helper that touches the DOM.
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

/** Early Member = joined chat before this moment: midnight US Eastern (EST, UTC-5) at the start of 2026-12-01. */
export const EARLY_CUTOFF = '2026-12-01T05:00:00Z';
const EARLY_MS = Date.parse(EARLY_CUTOFF);

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

/** Badge ids in display order: 'owner', 'mod', 'early', 'bb:<tier key>', 'streak:<days>'. */
export function badgesFor(profile) {
  const p = profile || {};
  const out = [];
  const role = roleOfProfile(p); // one source of truth: banned or demoted staff get no pill
  if (role === 'owner') out.push('owner');
  else if (role === 'mod') out.push('mod');
  const joined = typeof p.joined_at === 'string' ? Date.parse(p.joined_at) : NaN;
  if (Number.isFinite(joined) && joined < EARLY_MS) out.push('early');
  const tier = tierKey(p.game_stats && p.game_stats.bb && p.game_stats.bb.tier);
  if (tier && tier !== 'rookie') out.push('bb:' + tier); // Rookie is the unranked start, not a badge
  const sd = streakDays(p.game_stats && p.game_stats.badges);
  if (sd) out.push('streak:' + sd); // the best daily-streak badge earned (kept after a streak breaks)
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
const BADGES = {
  owner: { label: 'Owner', color: '#c6ff3d' },
  mod: { label: 'Mod', color: '#3de0ff' },
  early: { label: 'Early Member', color: '#ffb020' },
};

/** { label, color } for a badge id from badgesFor, or null. */
export function badgeInfo(id) {
  if (typeof id !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(BADGES, id)) return { ...BADGES[id] };
  if (id.startsWith('streak:')) {
    const n = Math.floor(Number(id.slice(7)));
    return n > 0 ? { label: '\u{1F525} ' + n + '-day streak', color: '#ff7a3d', streak: n } : null;
  }
  if (!id.startsWith('bb:')) return null;
  const key = tierKey(id.slice(3));
  if (!key) return null;
  const t = TIERS[key];
  return t ? { label: t[0], color: t[1], tier: key } : { label: key[0].toUpperCase() + key.slice(1), color: '#8b95a7', tier: key };
}

/** The profile card's theme gradient (top to bottom), or null when no theme color is set. */
export function cardTheme(profile) {
  const p = profile || {};
  const a = isHex(p.theme_a) ? p.theme_a : null;
  const b = isHex(p.theme_b) ? p.theme_b : null;
  if (!a && !b) return null;
  return `linear-gradient(180deg, ${a || b}, ${b || a})`;
}
