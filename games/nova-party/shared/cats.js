// Every Nova Party category, ready to use: CATS is the list, catById finds one.
import { Cat, parse } from './words.js';
import a from './data/a.js';
import b from './data/b.js';
import c from './data/c.js';

export const CATS = [a, b, c].flatMap((raw) => parse(raw)).map((def) => new Cat(def));
export const catById = (id) => CATS.find((x) => x.id === id) || null;
