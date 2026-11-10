// Custom server emoji: the list the server holds (name -> picture path), shared by the message renderer, the picker and the
// emoji manager. Pictures live in the public-media bucket under emoji/<name>.<ext>; format.js only ever draws one whose
// address is on our own storage origin.
import { CHAT } from './config.js';

export const EMOJI_MAX = 50;
export const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;
const EMOJI_PATH = /^emoji\/[a-z0-9_]{2,32}\.(png|jpg|jpeg|webp|gif)$/;

let rows = [];          // [{ name, path }]
let map = new Map();    // name -> src
const listeners = new Set();

/** The public address of an emoji picture, or '' when the path isn't an emoji path or chat has no storage origin. */
export function emojiSrc(path) {
  if (typeof path !== 'string' || !EMOJI_PATH.test(path)) return '';
  try { return CHAT && CHAT.url ? new URL(CHAT.url).origin + '/storage/v1/object/public/public-media/' + path : ''; } catch { return ''; }
}
/** Replace the list (rows from the emoji table). */
export function setEmoji(list) {
  rows = (Array.isArray(list) ? list : []).filter((r) => r && EMOJI_NAME.test(r.name || '') && emojiSrc(r.path)).sort((a, b) => a.name.localeCompare(b.name));
  map = new Map(rows.map((r) => [r.name, emojiSrc(r.path)]));
  for (const fn of [...listeners]) { try { fn(rows); } catch { /* a listener failed */ } }
}
/** One realtime change: { type: 'insert' | 'delete', row }. */
export function applyEmojiChange(ev) {
  if (!ev || !ev.row) return;
  if (ev.type === 'delete') setEmoji(rows.filter((r) => r.name !== ev.row.name));
  else setEmoji([...rows.filter((r) => r.name !== ev.row.name), ev.row]);
}
export const customEmoji = () => rows;
/** name -> src, the `emoji` the message parser takes. */
export const emojiMap = () => map;
export function onEmoji(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** '' when the name is fine, else what is wrong. taken: names already in use. */
export function emojiNameError(name, taken = []) {
  if (!EMOJI_NAME.test(name || '')) return 'Use 2-32 lowercase letters, numbers or underscores';
  if (taken.includes(name)) return ':' + name + ': already exists';
  return '';
}
/** Keep only what a name can hold while typing. */
export const emojiNameClean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
