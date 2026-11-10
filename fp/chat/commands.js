// Slash commands (Dyno-style) and the @ picker: the command table, who sees which command, parsing a typed line, time-out
// lengths, and the people filter. Pure: no DOM and no data layer, so it runs in node tests. The menus only show what
// should work for a role; the database still decides every action, and its refusal is what the person sees.
import { TIMEOUTS } from './perms.js';

export const SHRUG = '¯\\_(ツ)_/¯';
export const TABLEFLIP = '(╯°□°)╯︵ ┻━┻';
export const UNFLIP = '┬─┬ノ( º _ ºノ)';
export const PURGE_MAX = 20;

// ---------- the table ----------
// who: 'everyone' | 'staff' (owner + mods) | 'owner'. Mirrors the database: set_ban, set_mod, bot_settings and the
// reports table are the owner's alone; timeout_user is staff. posts: the command's purpose is posting a message.
const USER = { kind: 'user', key: 'user', label: '@user' };
const REASON = { kind: 'text', key: 'reason', label: '[reason]', optional: true };
const def = (name, who, args, desc, extra = {}) => Object.freeze({ name, who, args: Object.freeze(args), desc, hint: args.map((a) => a.label).join(' '), ...extra });
export const COMMANDS = Object.freeze([
  def('help', 'everyone', [], 'List the commands you can use'),
  def('dm', 'everyone', [USER], 'Open a DM with someone'),
  def('profile', 'everyone', [USER], 'Open someone’s profile card'),
  def('friend', 'everyone', [USER], 'Send a friend request'),
  def('block', 'everyone', [USER], 'Hide their messages and stop their DMs'),
  def('unblock', 'everyone', [USER], 'Unblock someone'),
  def('status', 'everyone', [{ kind: 'text', key: 'text', label: '<text>', optional: true }], 'Set your status (leave it empty to clear it)'),
  def('nick', 'everyone', [{ kind: 'text', key: 'name', label: '<name>', optional: true }], 'Change your display name (up to 32)'),
  def('ask', 'everyone', [{ kind: 'text', key: 'question', label: '<question>' }], 'Ask Hallpass a question', { posts: true }),
  def('shrug', 'everyone', [{ kind: 'text', key: 'text', label: '[text]', optional: true }], 'Post ' + SHRUG, { posts: true }),
  def('tableflip', 'everyone', [], 'Post ' + TABLEFLIP, { posts: true }),
  def('unflip', 'everyone', [], 'Post ' + UNFLIP, { posts: true }),
  def('timeout', 'staff', [USER, { kind: 'duration', key: 'minutes', label: '<minutes>' }, REASON], 'Time someone out: 10m, 1h or 1d', { aliases: ['mute'] }),
  def('untimeout', 'staff', [USER], 'Clear someone’s time-out', { aliases: ['unmute'] }),
  def('purge', 'staff', [{ kind: 'count', key: 'count', label: '<1-' + PURGE_MAX + '>', min: 1, max: PURGE_MAX }], 'Delete the last messages in this channel', { channelOnly: true }),
  def('ban', 'owner', [USER, REASON], 'Ban someone from chat (they can still read)'),
  def('unban', 'owner', [USER], 'Let a banned person chat again'),
  def('reports', 'owner', [], 'Open the Reports inbox'),
  def('mod', 'owner', [USER], 'Make someone a mod'),
  def('unmod', 'owner', [USER], 'Take someone’s mod tools away'),
  def('ai', 'owner', [{ kind: 'choice', key: 'on', label: 'on|off', options: ['on', 'off'] }], 'Turn Hallpass AI answers on or off'),
]);
const BY_NAME = new Map();
for (const c of COMMANDS) { BY_NAME.set(c.name, c); for (const a of c.aliases || []) BY_NAME.set(a, c); }
export const commandNamed = (name) => BY_NAME.get(String(name || '').toLowerCase()) || null;

const RANK = { member: 0, mod: 1, owner: 2 };
const NEED = { everyone: 0, staff: 1, owner: 2 };
/** May this role use the command? ('' = no profile yet: everyone-commands only.) */
export const allowed = (cmd, role) => !!cmd && (RANK[role] || 0) >= NEED[cmd.who];
/** The commands a role sees in the list; ctx.dm hides the channel-only ones. */
export function visibleCommands(role, ctx = {}) {
  return COMMANDS.filter((c) => allowed(c, role) && !(ctx.dm && c.channelOnly));
}
/** The list under a typed "/que": names starting with it first, then names containing it, in table order. */
export function filterCommands(role, query, ctx = {}) {
  const q = String(query || '').toLowerCase();
  const list = visibleCommands(role, ctx);
  if (!q) return list;
  const starts = list.filter((c) => c.name.startsWith(q) || (c.aliases || []).some((a) => a.startsWith(q)));
  return [...starts, ...list.filter((c) => !starts.includes(c) && c.name.includes(q))];
}
export const usage = (cmd) => 'Usage: /' + cmd.name + (cmd.hint ? ' ' + cmd.hint : '');

// ---------- a typed line ----------
/**
 * What a line typed into the message box is:
 *  { kind: 'text', body }                    an ordinary message ("//x" sends "/x": one slash removed)
 *  { kind: 'command', cmd, name, rest }      a known command (by name or alias), rest = everything after the name
 *  { kind: 'unknown', name, rest }           starts with one slash but names no command
 */
export function parseLine(text) {
  const s = String(text ?? '');
  if (!s.startsWith('/')) return { kind: 'text', body: s };
  if (s.startsWith('//')) return { kind: 'text', body: s.slice(1) };
  const m = /^\/(\S*)([\s\S]*)$/.exec(s);
  const name = m[1].toLowerCase();
  const rest = m[2].trim();
  const cmd = commandNamed(name);
  return cmd ? { kind: 'command', cmd, name, rest } : { kind: 'unknown', name, rest };
}

const USER_TOKEN = /^@?[A-Za-z0-9_]{1,32}$/;
/** The username an "@amy" / "amy" argument names (lowercase), or null. */
export const userArg = (tok) => (USER_TOKEN.test(String(tok || '')) ? String(tok).replace(/^@/, '').toLowerCase() : null);

/**
 * The arguments after the command name -> { ok: true, values } or { ok: false, error }.
 * values: user -> 'name' (lowercase, no @); duration -> { minutes, asked, adjusted }; count -> int; choice -> option;
 * text -> the rest of the line ('' when an optional one is left out). Extra words after the last argument are ignored.
 */
export function parseArgs(cmd, rest) {
  let s = String(rest ?? '').trim();
  const values = {};
  for (const a of cmd.args) {
    if (a.kind === 'text') {
      values[a.key] = s; s = '';
      if (!values[a.key] && !a.optional) return { ok: false, error: usage(cmd) };
      continue;
    }
    const m = /^(\S+)\s*([\s\S]*)$/.exec(s);
    if (!m) { if (a.optional) continue; return { ok: false, error: usage(cmd) }; }
    const tok = m[1];
    s = m[2];
    if (a.kind === 'user') {
      const u = userArg(tok);
      if (!u) return { ok: false, error: 'No one called ' + (tok.startsWith('@') ? tok : '@' + tok) };
      values[a.key] = u;
    } else if (a.kind === 'duration') {
      const asked = parseDuration(tok);
      if (asked === 0) return { ok: false, error: 'Use /untimeout to clear a time-out' };
      if (asked == null) return { ok: false, error: 'Time-outs look like 10, 10m, 2h or 1d' };
      const minutes = snapTimeout(asked);
      values[a.key] = { minutes, asked, adjusted: minutes !== asked };
    } else if (a.kind === 'count') {
      const n = /^\d+$/.test(tok) ? Number(tok) : NaN;
      if (!Number.isInteger(n) || n < a.min || n > a.max) return { ok: false, error: 'Pick a number from ' + a.min + ' to ' + a.max };
      values[a.key] = n;
    } else if (a.kind === 'choice') {
      const v = tok.toLowerCase();
      if (!a.options.includes(v)) return { ok: false, error: usage(cmd) };
      values[a.key] = v;
    }
  }
  return { ok: true, values };
}

// ---------- time-outs ----------
const UNIT = { s: 1 / 60, sec: 1 / 60, secs: 1 / 60, second: 1 / 60, seconds: 1 / 60, m: 1, min: 1, mins: 1, minute: 1, minutes: 1,
  h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, d: 1440, day: 1440, days: 1440, w: 10080, week: 10080, weeks: 10080 };
/** "5" / "10m" / "2h" / "1d" / "1.5h" -> minutes (a bare number is minutes); null when it isn't a length. */
export function parseDuration(tok) {
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(String(tok ?? '').trim());
  if (!m) return null;
  const unit = m[2].toLowerCase();
  if (unit && !(unit in UNIT)) return null;
  const n = Number(m[1]) * (unit ? UNIT[unit] : 1);
  return Number.isFinite(n) ? n : null;
}
export const TIMEOUT_STEPS = Object.freeze(TIMEOUTS.map(([min]) => min)); // what timeout_user accepts: 10, 60, 1440
/** The closest length the database allows (closest by ratio: 5 -> 10, 30 -> 60, 2h -> 1 h, 8h -> 1 day, 1 week -> 1 day). */
export function snapTimeout(minutes) {
  const x = Number(minutes);
  if (!(x > 0)) return null;
  let best = TIMEOUT_STEPS[0];
  for (const s of TIMEOUT_STEPS) if (Math.abs(Math.log(x / s)) < Math.abs(Math.log(x / best))) best = s;
  return best;
}
export const timeoutLabel = (minutes) => (TIMEOUTS.find(([m]) => m === minutes) || [0, minutes + ' minutes'])[1];

// ---------- what the box shows above it ----------
/** The command list is open while the caret is still in the name of a line that starts with one slash. */
export function slashQuery(value, caret) {
  const v = String(value ?? '');
  const at = caret == null ? v.length : caret;
  if (!v.startsWith('/') || v.startsWith('//')) return null;
  const head = v.slice(0, at);
  if (/\s/.test(head)) return null;
  return { query: head.slice(1).toLowerCase() };
}
/** Picking a command: "/name " replaces the typed name (anything after it stays). */
export function applyCommand(value, name) {
  const v = String(value ?? '');
  const m = /^\/\S*\s*/.exec(v);
  const tail = m ? v.slice(m[0].length) : v;
  const out = '/' + name + ' ' + tail;
  return { value: out, caret: name.length + 2 };
}
/** The command whose arguments are being typed ("/timeout @a 1"), when this role may use it, for the hint line. */
export function hintFor(value, role, ctx = {}) {
  const m = /^\/(\S+)\s/.exec(String(value ?? ''));
  if (!m || String(value).startsWith('//')) return null;
  const cmd = commandNamed(m[1]);
  return cmd && visibleCommands(role, ctx).includes(cmd) ? cmd : null;
}

/** "@que" being typed right before the caret (at the start or after a space / new line), or null. */
export function mentionQuery(value, caret) {
  const v = String(value ?? '');
  const at = caret == null ? v.length : caret;
  const m = /(^|\s)@([A-Za-z0-9_]{0,32})$/.exec(v.slice(0, at));
  if (!m) return null;
  const start = m.index + m[1].length;
  const end = at + /^[A-Za-z0-9_]*/.exec(v.slice(at))[0].length; // the rest of a name the caret is inside
  return { start, end, query: m[2] };
}
/** Picking a person: "@username " in place of the typed "@que". */
export function applyMention(value, q, username) {
  const v = String(value ?? '');
  const tail = v.slice(q.end).replace(/^ /, '');
  const ins = '@' + username + ' ';
  return { value: v.slice(0, q.start) + ins + tail, caret: q.start + ins.length };
}

/**
 * The people list for "@que": usernames starting with it first, then display names (or any word of one) starting with it;
 * online people before offline, then by username. An empty query lists everyone that way. Up to `max` rows; with
 * `everyone` the "@everyone" row comes first when it matches.
 * Returns profiles, plus { everyone: true, username: 'everyone' } for that row.
 */
export function filterPeople(list, query, { max = 8, everyone = false, online = null, exclude = null } = {}) {
  const q = String(query || '').toLowerCase();
  const seen = new Set();
  const scored = [];
  for (const p of list || []) {
    if (!p || !p.id || !p.username || seen.has(p.id) || (exclude && exclude.has(p.id))) continue;
    seen.add(p.id);
    const u = String(p.username).toLowerCase();
    const d = String(p.display_name || '').toLowerCase();
    let s;
    if (!q) s = 3;
    else if (u === q) s = 0;
    else if (u.startsWith(q)) s = 1;
    else if (d.startsWith(q)) s = 2;
    else if (d.split(/\s+/).some((w) => w.startsWith(q))) s = 3;
    else continue;
    scored.push({ p, s, on: online && online.has(p.id) ? 0 : 1, u });
  }
  scored.sort((a, b) => a.s - b.s || a.on - b.on || (a.u < b.u ? -1 : a.u > b.u ? 1 : 0));
  const rows = scored.map((x) => x.p);
  if (everyone && 'everyone'.startsWith(q)) rows.unshift({ everyone: true, id: '@everyone', username: 'everyone' });
  return rows.slice(0, max);
}
/** The profile an @name argument names, from what the page already has (case-insensitive username), or null. */
export function findByUsername(list, name) {
  const n = String(name || '').replace(/^@/, '').toLowerCase();
  if (!n) return null;
  for (const p of list || []) if (p && p.username && String(p.username).toLowerCase() === n) return p;
  return null;
}
/** /shrug's message. */
export const shrugText = (text) => (String(text || '').trim() ? String(text).trim() + ' ' : '') + SHRUG;
/** /ask's message: "@Hallpass question" (left alone when it already names Hallpass). */
export const askText = (q) => (/(^|[^a-z0-9_])@hallpass\b/i.test(q) ? String(q).trim() : '@Hallpass ' + String(q).trim());
