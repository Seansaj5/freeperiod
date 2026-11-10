// Profile flair (Nitro-style, free for everyone): the allowed ids, checks that mirror the database, name styles and badges.
// Pure data + functions so it runs in node tests; paintName is the only helper that touches the DOM.
// The drawings live in frames.js (avatar frames) and effects.js (profile card effects); their CSS is flair.css.

import { roleOfProfile } from './perms.js'; // (perms.js imports this file back; both only call each other inside functions)

// Global Constraints, verbatim. The database checks (0003_flair.sql) use the same lists.
export const FONTS = Object.freeze(['bungee', 'outfit', 'press-start', 'orbitron', 'creepster', 'pacifico']);
export const FRAMES = Object.freeze(['neon-ring', 'pulse', 'orbit', 'flame', 'frost', 'circuit', 'glitch', 'halo', 'thorns', 'sparkle',
  'wave', 'hex', 'crown', 'lightning', 'pixel', 'vortex', 'stars', 'shield', 'drip', 'eclipse']);
export const EFFECTS = Object.freeze(['sparkles', 'snow', 'embers', 'glitch', 'stars', 'bubbles', 'lightning', 'confetti', 'matrix', 'aurora']);
export const FILLS = Object.freeze(['solid', 'gradient']);

/** Early Member = joined chat before this moment: midnight US Eastern (EST, UTC-5) at the start of 2026-12-01. */
export const EARLY_CUTOFF = '2026-12-01T05:00:00Z';
const EARLY_MS = Date.parse(EARLY_CUTOFF);

export const DEFAULT_NAME_COLOR = '#eef2ff'; // the page text color (--text)
export const DEFAULT_NAME_COLOR2 = '#3de0ff'; // cyan, when a gradient has no second color yet
const HEX = /^#[0-9a-f]{6}$/;
export const isHex = (v) => typeof v === 'string' && HEX.test(v);

// font id -> CSS family stack (Bungee/Outfit come from style.css, the other four from flair.css)
const FAMILY = {
  bungee: "'Bungee', 'Outfit', system-ui, sans-serif",
  outfit: "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
  'press-start': "'Press Start 2P', ui-monospace, monospace",
  orbitron: "'Orbitron', 'Outfit', system-ui, sans-serif",
  creepster: "'Creepster', 'Bungee', system-ui, sans-serif",
  pacifico: "'Pacifico', 'Outfit', cursive",
};

/** Picker labels (editor). */
export const FONT_LABELS = Object.freeze({
  bungee: 'Bungee', outfit: 'Outfit', 'press-start': 'Press Start', orbitron: 'Orbitron', creepster: 'Creepster', pacifico: 'Pacifico',
});
export const FRAME_LABELS = Object.freeze({
  'neon-ring': 'Neon Ring', pulse: 'Pulse', orbit: 'Orbit', flame: 'Flame', frost: 'Frost', circuit: 'Circuit', glitch: 'Glitch',
  halo: 'Halo', thorns: 'Thorns', sparkle: 'Sparkle', wave: 'Wave', hex: 'Hex', crown: 'Crown', lightning: 'Lightning',
  pixel: 'Pixel', vortex: 'Vortex', stars: 'Starry Night', shield: 'Shield', drip: 'Slime Drip', eclipse: 'Eclipse',
});
export const EFFECT_LABELS = Object.freeze({
  sparkles: 'Sparkles', snow: 'Snowfall', embers: 'Embers', glitch: 'Glitch', stars: 'Shooting Stars', bubbles: 'Bubbles',
  lightning: 'Lightning', confetti: 'Confetti', matrix: 'Code Rain', aurora: 'Aurora',
});

const has = (list, v) => typeof v === 'string' && list.includes(v);

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

/**
 * Inline style for a display name: { fontFamily, color, backgroundImage?, textShadow?, filter? }.
 * Gradient names also need the `fp-name` class with data-fill="gradient" (flair.css clips the gradient to the letters);
 * paintName does both. Gradient + glow uses drop-shadow filters, because a text shadow paints over gradient text.
 */
export function nameStyle(profile) {
  const p = profile || {};
  const c1 = isHex(p.name_color) ? p.name_color : DEFAULT_NAME_COLOR;
  const style = { fontFamily: FAMILY[has(FONTS, p.name_font) ? p.name_font : 'outfit'], color: c1 };
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
