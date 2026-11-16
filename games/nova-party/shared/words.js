// Answer checking for Nova Party: every category is a list of answers sorted into five rarity tiers. What a player
// types is matched loosely (case, spaces, accents, plurals and a small typo are forgiven), the way a friend would
// accept it out loud.

/** Rarity tiers, commonest first. An answer's tier decides its points; a BLUE MOON also gives a life back. */
export const TIERS = [
  { id: 'rock', name: 'MOON ROCK', pts: 10, color: '#9fb0c8', blurb: 'Everybody says it' },
  { id: 'sat', name: 'SATELLITE', pts: 30, color: '#5ad1ff', blurb: 'A solid pick' },
  { id: 'comet', name: 'COMET', pts: 60, color: '#7dff8a', blurb: 'Not many think of it' },
  { id: 'deep', name: 'DEEP SPACE', pts: 85, color: '#d08bff', blurb: 'A real deep cut' },
  { id: 'blue', name: 'BLUE MOON', pts: 100, color: '#5d86ff', blurb: 'Once in a blue moon: +1 life' },
];

/** The comparable form of a name: lower case, no accents, no punctuation or spaces, no leading "the". */
export function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().replace(/^(the|a|an) (?=.)/, '').replace(/ /g, '');
}

const title = (s) => (/[A-Z]/.test(s) ? s : s.replace(/(^|[ \-/])([a-z])/g, (m, a, b) => a + b.toUpperCase()));

/** Plural and singular spellings of a key, so "grapes" finds "grape". */
function variants(k) {
  const out = [];
  if (k.length < 4) return out;
  if (k.endsWith('ies')) out.push(k.slice(0, -3) + 'y');
  if (k.endsWith('es')) out.push(k.slice(0, -2));
  if (k.endsWith('s')) out.push(k.slice(0, -1));
  else { out.push(k + 's'); if (k.endsWith('y')) out.push(k.slice(0, -1) + 'ies'); }
  return out;
}

/** Edit distance with swaps of neighbours counted as one slip; gives up (returns max + 1) past `max`. */
export function slips(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null, prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    const t = prev2 || new Array(lb + 1); prev2 = prev; prev = cur; cur = t;
  }
  return prev[lb];
}

/** One category: its prompt and its answers, with a lookup from anything a player might type. */
export class Cat {
  constructor(def) {
    this.id = def.id;
    this.q = def.q;
    this.answers = def.answers;      // [{ name, tier, keys }]
    this.map = new Map();
    this.answers.forEach((a, i) => { for (const k of a.keys) if (!this.map.has(k)) this.map.set(k, i); });
    this.answers.forEach((a, i) => { for (const k of a.keys) for (const v of variants(k)) if (!this.map.has(v)) this.map.set(v, i); });
    this.keys = [...this.map.keys()];
  }
  /** The index of the answer the text means, or -1. */
  find(text) {
    const k = norm(text);
    if (k.length < 2) return -1;
    const hit = this.map.get(k);
    if (hit !== undefined) return hit;
    if (k.length < 5) return -1;
    // a typo: one slip in a word of five letters or more, two in a word of ten or more; the first letter has to be right
    const max = k.length >= 10 ? 2 : 1;
    let best = max + 1, at = -1, tie = false;
    for (const key of this.keys) {
      if (key.length < 5 || key.charCodeAt(0) !== k.charCodeAt(0)) continue;
      const d = slips(k, key, max);
      if (d > max) continue;
      const i = this.map.get(key);
      if (d < best) { best = d; at = i; tie = false; } else if (d === best && i !== at) tie = true;
    }
    return tie ? -1 : at;
  }
}

/**
 * Reads the category text (shared/data/*.js). A category starts with "@id|Prompt"; its answers follow, commonest tier
 * first, a line starting with "/" moves to the next tier; "name=other spelling=another" lists what also counts.
 */
export function parse(raw) {
  const out = [];
  let cur = null, tier = 0;
  for (const line0 of raw.split('\n')) {
    let line = line0.trim();
    if (!line) continue;
    if (line[0] === '@') {
      const [id, q] = line.slice(1).split('|');
      cur = { id: id.trim(), q: q.trim(), answers: [], seen: new Set() }; tier = 0; out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line[0] === '/') { tier = Math.min(TIERS.length - 1, tier + 1); line = line.slice(1); }
    for (const item of line.split(',')) {
      const names = item.split('=').map((s) => s.trim()).filter(Boolean);
      if (!names.length) continue;
      // a name listed twice in a category counts once, in the tier it was first given
      const keys = [...new Set(names.map(norm).filter((k) => k.length >= 2 && !cur.seen.has(k)))];
      if (!keys.length || keys[0] !== norm(names[0])) continue;
      for (const k of keys) cur.seen.add(k);
      cur.answers.push({ name: title(names[0]), tier, keys });
    }
  }
  return out;
}
