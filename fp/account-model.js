// The account chip and its mini profile card: the pure parts (tested in tests/account-model.test.mjs).

/** Quick statuses in the account menu (emoji + text, saved to the chat profile). */
export const STATUS_PRESETS = Object.freeze([
  Object.freeze({ emoji: '🎮', text: 'Playing games' }),
  Object.freeze({ emoji: '⚽', text: 'Grinding ranked' }),
  Object.freeze({ emoji: '📚', text: 'Doing homework' }),
  Object.freeze({ emoji: '🎧', text: 'Vibing' }),
  Object.freeze({ emoji: '🍕', text: 'Eating, brb' }),
  Object.freeze({ emoji: '😴', text: 'Away' }),
]);
/** Emoji offered next to a custom status. */
export const STATUS_EMOJI = Object.freeze(['💬', '🔥', '😎', '🤫', '🏆', '👻', '🚗', '⚽', '🎮', '📚', '💀', '✨']);
export const STATUS_TEXT_MAX = 80;      // the database's limit (0001_chat.sql)

// The database's rules for status_emoji: at most 16 characters, no letters/digits, spaces or control characters.
const EMOJI_BAD = /[\p{Cc}\s A-Za-z0-9]/u;
const TEXT_BAD = /\p{Cc}/u;

/**
 * A status as a profile patch: { ok: true, patch: { status_emoji, status_text } } (nulls clear it) or
 * { ok: false, error }. Empty emoji and text = clear the status. Pure.
 */
export function statusPatch(emoji, text) {
  const e = String(emoji ?? '').trim(), t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (e && (e.length > 16 || EMOJI_BAD.test(e))) return { ok: false, error: 'Pick one emoji.' };
  if (t.length > STATUS_TEXT_MAX) return { ok: false, error: `Keep it under ${STATUS_TEXT_MAX + 1} characters.` };
  if (TEXT_BAD.test(t)) return { ok: false, error: 'That text has characters a status can’t show.' };
  return { ok: true, patch: { status_emoji: e || null, status_text: t || null } };
}

/** Unread direct messages from data.unreadCounts() rows (targets 'd:<id>'). Pure. */
export function unreadDMs(rows) {
  let n = 0;
  for (const r of Array.isArray(rows) ? rows : []) if (r && String(r.target).startsWith('d:')) n += Math.max(0, Math.floor(Number(r.unread) || 0));
  return n;
}

/** "9+" style count for a small badge ('' for none). Pure. */
export const countLabel = (n) => (n > 0 ? (n > 9 ? '9+' : String(n)) : '');

/**
 * What the chip shows: { kind: 'guest' } or { kind: 'plain' | 'chat', username, name, role, streak }. The chat look is
 * used only when the chat profile belongs to the signed-in account (another account's leftover never shows). Pure.
 */
export function chipModel(user, chat, streakDays = 0) {
  if (!user || typeof user.username !== 'string') return { kind: 'guest' };
  const role = user.role && user.role !== 'player' ? user.role : '';
  const streak = Math.max(0, Math.floor(Number(streakDays) || 0));
  const mine = !!chat && typeof chat.username === 'string' && chat.username.toLowerCase() === user.username.toLowerCase();
  if (!mine) return { kind: 'plain', username: user.username, name: user.username, role, streak };
  const name = (typeof chat.display_name === 'string' && chat.display_name.trim()) || user.username;
  return { kind: 'chat', username: user.username, name, role, streak };
}
