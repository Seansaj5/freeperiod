// Item helpers: what an item is, how it rolls out of a chest, how it is packed for the network.
import { WEAPONS, HEALS, RARITY, FLOOR_TABLE, CHEST_TABLE, RARITY_WEIGHTS, AMMO } from './rules.js';

export const KINDS = [...Object.keys(WEAPONS), ...Object.keys(HEALS)];
export const kindCode = (k) => KINDS.indexOf(k);
export const isGun = (k) => !!WEAPONS[k] && !WEAPONS[k].consumable;
export const isStack = (k) => !!HEALS[k] || (WEAPONS[k] && WEAPONS[k].consumable);
export const stackMax = (k) => (HEALS[k] ? HEALS[k].stack : WEAPONS[k] ? WEAPONS[k].stack || 1 : 1);
export const itemName = (it) => (WEAPONS[it.k] || HEALS[it.k]).name;
export const AMMO_KINDS = Object.keys(AMMO);

function weighted(R, table) {
  let sum = 0; for (const [, w] of table) sum += w;
  let v = R() * sum;
  for (const [k, w] of table) { v -= w; if (v <= 0) return k; }
  return table[table.length - 1][0];
}

/** A random item: {k, r, mag} for guns, {k, r, n} for stacks. */
export function rollItem(R, chest) {
  const k = weighted(R, chest ? CHEST_TABLE : FLOOR_TABLE);
  if (HEALS[k]) return { k, r: HEALS[k].rar, n: k === 'bandage' ? 5 : k === 'seaglass' ? 3 : 1 };
  const W = WEAPONS[k];
  if (W.consumable) return { k, r: W.rar[0], n: 3 };
  const weights = RARITY_WEIGHTS[chest ? 'chest' : 'floor'].map((w, i) => [i, i >= W.rar[0] && i <= W.rar[1] ? w : 0]);
  let r = weighted(R, weights.filter(([, w]) => w > 0));
  if (r === undefined) r = W.rar[0];
  return { k, r: +r, mag: W.mag };
}

export const ammoFor = (k) => (WEAPONS[k] && WEAPONS[k].ammo) || null;
export const rarityColor = (r) => RARITY[r] ? RARITY[r].color : '#fff';

/** Damage multiplier for distance. */
export function falloff(W, d) {
  const [a, b, m] = W.fall || [1e9, 1e9, 1];
  if (d <= a) return 1;
  if (d >= b) return m;
  return 1 - (1 - m) * ((d - a) / (b - a));
}
