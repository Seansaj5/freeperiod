// Avatar customization options. Shared so bots can dress themselves and the server can clean what it receives.
import { pick } from './util.js';

export const SKINS = ['#ffdbb8', '#f2c79a', '#e0a878', '#c68642', '#8d5524', '#5c3a21', '#ffd84a', '#bfe3ff'];
export const COLORS = [
  '#f4f4f4', '#9aa3b5', '#2b2f3a', '#121318', '#e23b3b', '#ff7a1a', '#ffd23d', '#57c84d',
  '#1f8a5b', '#2fd0c4', '#3a7bff', '#1f3a8a', '#8b5cf6', '#ff6fb5', '#8a5a33', '#d9c3a0',
];
export const SHIRT_STYLES = ['tee', 'long', 'hoodie', 'tank'];
export const PATTERNS = ['plain', 'stripes', 'star', 'bolt', 'heart', 'skull', 'number'];
export const FACES = ['smile', 'grin', 'cool', 'worried', 'cute', 'smirk', 'determined'];
export const HATS = ['none', 'cap', 'beanie', 'spiky', 'messy', 'long', 'headphones', 'crown', 'tophat'];

export const LABELS = {
  tee: 'T-shirt', long: 'Long sleeve', hoodie: 'Hoodie', tank: 'Tank top',
  plain: 'Plain', stripes: 'Stripes', star: 'Star', bolt: 'Bolt', heart: 'Heart', skull: 'Skull', number: 'Number',
  smile: 'Smile', grin: 'Grin', cool: 'Cool', worried: 'Worried', cute: 'Cute', smirk: 'Smirk', determined: 'Determined',
  none: 'None', cap: 'Cap', beanie: 'Beanie', spiky: 'Spiky hair', messy: 'Messy hair', long: 'Long hair',
  headphones: 'Headphones', crown: 'Crown', tophat: 'Top hat',
};

export function defaultLook() {
  return { skin: '#f2c79a', shirt: '#3a7bff', style: 'tee', pattern: 'star', pants: '#2b2f3a', face: 'smile', hat: 'messy', hatColor: '#8a5a33' };
}

export function randomLook(r) {
  return {
    skin: pick(SKINS, r), shirt: pick(COLORS, r), style: pick(SHIRT_STYLES, r), pattern: pick(PATTERNS, r),
    pants: pick(COLORS, r), face: pick(FACES, r), hat: pick(HATS, r), hatColor: pick(COLORS, r),
  };
}

const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
/** Keeps only valid values, so a bad message can never break someone else's game. */
export function sanitizeLook(l) {
  const d = defaultLook();
  if (!l || typeof l !== 'object') return d;
  return {
    skin: isColor(l.skin) ? l.skin : d.skin,
    shirt: isColor(l.shirt) ? l.shirt : d.shirt,
    style: SHIRT_STYLES.includes(l.style) ? l.style : d.style,
    pattern: PATTERNS.includes(l.pattern) ? l.pattern : d.pattern,
    pants: isColor(l.pants) ? l.pants : d.pants,
    face: FACES.includes(l.face) ? l.face : d.face,
    hat: HATS.includes(l.hat) ? l.hat : d.hat,
    hatColor: isColor(l.hatColor) ? l.hatColor : d.hatColor,
  };
}
